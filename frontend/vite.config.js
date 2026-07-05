import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    // Serve from a subpath when mounted inside another site,
    // e.g. VITE_BASE=/assistance/ for the portfolio integration
    base: env.VITE_BASE || '/',
    plugins: [react(), basicSsl()],
    server: {
      host: env.VITE_HOST || '0.0.0.0',
      // Same-origin /api → backend: no CORS, no mixed-content on mobile HTTPS.
      // Mirror this with nginx in production.
      proxy: {
        '/api': {
          target: env.VITE_API_TARGET || 'http://localhost:16000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  }
})
