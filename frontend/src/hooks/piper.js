// Dynamic import keeps piper-tts-web out of the main bundle so the page
// renders immediately — the heavy ONNX code is only loaded when initPiper()
// is called from a useEffect.

const SPEAKER = 0

let _engine = null
let _activeVoiceId = null

export function isPiperReady(voiceId = 'en_US-amy-medium') {
  return _engine !== null && _activeVoiceId === voiceId
}

// Wraps fetch() with Cache API so the 63 MB ONNX model is stored locally
// after the first download. Subsequent visits (and generate() calls) hit
// the cache instead of HuggingFace CDN.
class CachingFetchProvider {
  static CACHE = 'piper-voices-v1'

  destroy() { }

  async fetch(url) {
    let cache
    try { cache = await caches.open(CachingFetchProvider.CACHE) } catch { }

    if (cache) {
      const hit = await cache.match(url)
      if (hit) {
        if (url.endsWith('.json')) {
          const data = await hit.json()
          if (data && data.inference) {
            data.inference.length_scale = 1.18 // Slower, natural speaking rate
          }
          return data
        }
        return hit.arrayBuffer()
      }
    }

    const response = await window.fetch(url)
    if (!response.ok) throw new Error(`${response.status} fetching ${url}`)

    const contentLength = response.headers.get('content-length')
    const total = contentLength ? parseInt(contentLength, 10) : 0

    if (total === 0 || url.endsWith('.json')) {
      if (cache) cache.put(url, response.clone()).catch(() => { })
      if (url.endsWith('.json')) {
        const data = await response.json()
        if (data && data.inference) {
          data.inference.length_scale = 1.18 // Slower, natural speaking rate
        }
        return data
      }
      return response.arrayBuffer()
    }

    const reader = response.body.getReader()
    let loaded = 0
    const chunks = []

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      loaded += value.length
      if (window.onWasmDownloadProgress) {
        window.onWasmDownloadProgress(url, loaded, total)
      }
    }

    const buffer = new Uint8Array(loaded)
    let offset = 0
    for (const chunk of chunks) {
      buffer.set(chunk, offset)
      offset += chunk.length
    }

    const cachedResponse = new Response(buffer)
    if (cache) cache.put(url, cachedResponse.clone()).catch(() => { })

    return buffer.buffer
  }
}

export async function initPiper(voiceId = 'en_US-amy-medium', onProgress = null) {
  if (!_engine || _activeVoiceId !== voiceId) {
    _activeVoiceId = voiceId
    _engine = null

    const { PiperWebWorkerEngine, OnnxWebWorkerRuntime, HuggingFaceVoiceProvider } =
      await import('piper-tts-web')

    const voiceProvider = new HuggingFaceVoiceProvider({
      provider: new CachingFetchProvider(),
    })
    _engine = new PiperWebWorkerEngine({
      onnxRuntime: new OnnxWebWorkerRuntime({ numThreads: 1 }),
      voiceProvider,
    })

    if (onProgress) {
      window.onWasmDownloadProgress = (url, loaded, total) => {
        if (url.includes(voiceId)) {
          onProgress(Math.round((loaded / total) * 100))
        }
      }
    }
    await _engine.generate('Hi', voiceId, SPEAKER)
    window.onWasmDownloadProgress = null
  }
}


export async function piperGenerate(text, voiceId = 'en_US-amy-medium') {
  if (!_engine) throw new Error('Piper not initialised')
  const result = await _engine.generate(text, voiceId, SPEAKER)
  return { blob: result.file, duration: result.duration, phonemeData: result.phonemeData }
}

export async function piperExpressions(phonemeData, durationMs) {
  if (!_engine) return []
  const { mouth } = await _engine.expressions(phonemeData, durationMs)
  return mouth
}
