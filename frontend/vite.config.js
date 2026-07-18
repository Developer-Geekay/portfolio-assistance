import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// SharedArrayBuffer (required by Whisper WASM threading) needs these two headers
// on every response. Mirror them in nginx for production.
const wasmHeaders = {
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
}

const PIPER_DIST = 'node_modules/piper-tts-web/dist'

// Copies Piper WASM assets to dist/{onnx,piper,worker}/ after the bundle is
// written so they are reachable at the same paths the dev server uses.
function piperBuildCopy() {
  return {
    name: 'piper-build-copy',
    apply: 'build',
    closeBundle() {
      const outDir = path.resolve(process.cwd(), 'dist')
      for (const dir of ['onnx', 'piper', 'worker']) {
        fs.cpSync(
          path.resolve(process.cwd(), PIPER_DIST, dir),
          path.resolve(outDir, dir),
          { recursive: true }
        )
      }
    },
  }
}

// viteStaticCopy only runs at build time. This plugin serves the same Piper
// WASM assets from node_modules during vite dev with the correct MIME types.
function piperDevServer() {
  return {
    name: 'piper-dev-server',
    apply: 'serve',
    configureServer(server) {
      const routes = {
        '/onnx/': path.join(PIPER_DIST, 'onnx'),
        '/piper/': path.join(PIPER_DIST, 'piper'),
        '/worker/': path.join(PIPER_DIST, 'worker'),
      }
      server.middlewares.use((req, res, next) => {
        for (const [prefix, dir] of Object.entries(routes)) {
          if (!req.url?.startsWith(prefix)) continue
          const file = req.url.slice(prefix.length).split('?')[0]
          // Reject traversal attempts before touching the filesystem
          if (file.includes('..') || file.includes('\0')) {
            res.statusCode = 400; res.end(); return
          }
          const base = path.resolve(process.cwd(), dir)
          const full = path.resolve(base, file)
          // Ensure resolved path stays inside the intended directory
          if (!full.startsWith(base + path.sep)) {
            res.statusCode = 403; res.end(); return
          }
          if (fs.existsSync(full)) {
            const ext = path.extname(file)
            const mime = ext === '.wasm' ? 'application/wasm'
              : ext === '.js' ? 'application/javascript'
                : ext === '.data' ? 'application/octet-stream'
                  : 'text/plain'
            res.setHeader('Content-Type', mime)
            res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
            res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.end(fs.readFileSync(full))
            return
          }
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const piperWasm = env.VITE_PIPER_WASM === 'true'

  return {
    // Serve from a subpath when mounted inside another site,
    // e.g. VITE_BASE=/assistance/ for the portfolio integration
    base: env.VITE_BASE || '/',
    plugins: [
      react(),
      // VITE_NO_SSL=1 serves plain HTTP for local automated testing
      ...(env.VITE_NO_SSL === '1' ? [] : [basicSsl()]),
      // Dev: serve Piper WASM files with correct MIME types from node_modules
      ...(piperWasm ? [piperDevServer()] : []),
      // Prod build: copy Piper WASM assets to dist/{onnx,piper,worker}/
      ...(piperWasm ? [piperBuildCopy()] : []),
    ],
    optimizeDeps: {
      // whisper-web ships pre-built WASM — Vite must not try to re-bundle it
      exclude: ['@remotion/whisper-web'],
      // Pre-bundle at dev-server startup so the lazy dynamic import('piper-tts-web')
      // inside initPiper() resolves instantly from cache instead of triggering
      // a 30-second Vite compilation that freezes the page on first load.
      ...(piperWasm ? { include: ['piper-tts-web'] } : {}),
    },
    server: {
      host: env.VITE_HOST || '0.0.0.0',
      headers: wasmHeaders,
      // Same-origin /api → backend: no CORS, no mixed-content on mobile HTTPS.
      // Mirror this with nginx in production.
      proxy: {
        '/api': {
          target: env.VITE_API_TARGET || 'http://localhost:16000',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ''),
        },
      },
    },
    build: {
      // Vite injects a modulepreload polyfill that calls document.createElement()
      // at the top of the entry chunk. Piper's ONNX pthread workers load that
      // chunk and crash on 'document is not defined'. All target browsers support
      // modulepreload natively so the polyfill is not needed anyway.
      modulePreload: { polyfill: false },
    },
    preview: {
      headers: wasmHeaders,
    },
  }
})
