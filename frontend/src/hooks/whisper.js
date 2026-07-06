import { downloadWhisperModel, resampleTo16Khz, transcribe as wasmTranscribe } from '@remotion/whisper-web'

const MODEL = 'tiny.en'

let _resolveReady
const _readyPromise = new Promise(r => { _resolveReady = r })
let _ready = false

export function isWhisperReady() { return _ready }

export async function initWhisper(onProgress) {
  await downloadWhisperModel({ model: MODEL, onProgress })
  _ready = true
  _resolveReady()
}

export async function transcribeBlob(blob) {
  await _readyPromise
  const channelWaveform = await resampleTo16Khz({ file: blob })
  const result = await wasmTranscribe({ channelWaveform, model: MODEL, language: 'en' })
  return result.transcription.map(item => item.text).join('').trim()
}
