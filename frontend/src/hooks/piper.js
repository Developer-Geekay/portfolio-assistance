// Dynamic import keeps piper-tts-web out of the main bundle so the page
// renders immediately — the heavy ONNX code is only loaded when initPiper()
// is called from a useEffect.

const VOICE = 'en_US-amy-medium'
const SPEAKER = 0

let _engine = null
let _ready = false
let _initPromise = null   // singleton guard: Strict Mode runs effects twice

export function isPiperReady() { return _ready }

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
      if (hit) return url.endsWith('.json') ? hit.json() : hit.arrayBuffer()
    }

    const response = await window.fetch(url)
    if (!response.ok) throw new Error(`${response.status} fetching ${url}`)

    // Store a clone so we can still consume the original body below
    if (cache) cache.put(url, response.clone()).catch(() => { })

    return url.endsWith('.json') ? response.json() : response.arrayBuffer()
  }
}

export async function initPiper() {
  if (_initPromise) return _initPromise
  _initPromise = _doInit()
  return _initPromise
}

async function _doInit() {
  // PiperWebWorkerEngine (not PiperWebEngine): the plain engine runs ONNX
  // inference and phonemization on the main thread, freezing all UI
  // animations for the duration of every generate() call. The worker
  // variant moves both into Web Workers.
  const { PiperWebWorkerEngine, OnnxWebWorkerRuntime, HuggingFaceVoiceProvider } =
    await import('piper-tts-web')

  const voiceProvider = new HuggingFaceVoiceProvider({
    provider: new CachingFetchProvider(),
  })
  // numThreads: 1 — with more, ONNX spawns pthread sub-workers that reload
  // OnnxWebWorker.js, whose message handler clobbers the pthread bootstrap
  // and crashes with 'Unknown type undefined' (piper-tts-web packaging bug).
  // Inference already runs off the main thread, so this only trades some
  // synthesis speed, not UI smoothness.
  _engine = new PiperWebWorkerEngine({
    onnxRuntime: new OnnxWebWorkerRuntime({ numThreads: 1 }),
    voiceProvider,
  })

  // Warm-up: pre-loads ONNX session + caches voice model so first real
  // utterance has no cold-start delay. 'Hi' is chosen because it produces
  // valid phonemes without risk of empty-tensor errors.
  await _engine.generate('Hi', VOICE, SPEAKER)
  _ready = true
}  // end _doInit

export async function piperGenerate(text) {
  if (!_engine) throw new Error('Piper not initialised')
  const result = await _engine.generate(text, VOICE, SPEAKER)
  return { blob: result.file, duration: result.duration, phonemeData: result.phonemeData }
}

export async function piperExpressions(phonemeData, durationMs) {
  if (!_engine) return []
  const { mouth } = await _engine.expressions(phonemeData, durationMs)
  return mouth
}
