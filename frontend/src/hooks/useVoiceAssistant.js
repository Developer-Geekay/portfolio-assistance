import { useRef, useState, useCallback, useEffect } from 'react'
import { initWhisper, transcribeBlob, isWhisperReady } from './whisper'
import { initPiper, piperGenerate, isPiperReady } from './piper'
import { USE_WHISPER_WASM, USE_PIPER_WASM } from '../features'

// vite dev proxy / nginx → FastAPI; override with VITE_API_BASE when mounted
// inside another site whose /api is taken (e.g. /assistance-api in a portfolio)
const API_BASE       = import.meta.env.VITE_API_BASE || '/api'
const SILENCE_MS     = 1400     // pause after speech → user finished talking
const NO_SPEECH_MS   = 10000    // never spoke at all → give up, back to idle
const POST_ANSWER_MS = 8000     // quiet after an answer → say goodbye, go idle
const VAD_MIN        = 0.008    // absolute floor for the adaptive speech threshold
const FAREWELL       = "Thank you! Glad to help — feel free to ask anytime."

// Turns made only of these are mic noise / self-talk — never sent to the brain
const FILLER_WORDS = new Set([
  'okay', 'ok', 'alright', 'all', 'right', 'hmm', 'hm', 'mmm',
  'uh', 'um', 'er', 'ah', 'yeah', 'ya', 'yes', 'no', 'so', 'well',
  'and', 'the', 'a', 'an', 'of', 'to', 'it', 'is', 'oh', 'huh',
])

function isFillerOnly(text) {
  const words = text.toLowerCase().replace(/[^a-z\s']/g, ' ').split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  // Whisper hallucinates single letters/short fragments from noise ("S", "and")
  if (words.length === 1 && words[0].length <= 2) return true
  return words.every(w => FILLER_WORDS.has(w))
}

// Pick a recording format the browser supports (webm on Chrome/Android,
// mp4/AAC on iOS Safari) — Whisper decodes both server-side
function pickRecordingFormat() {
  const candidates = [
    { mime: 'audio/webm;codecs=opus', ext: 'webm' },
    { mime: 'audio/webm',             ext: 'webm' },
    { mime: 'audio/mp4',              ext: 'mp4'  },
  ]
  return candidates.find(c => window.MediaRecorder && MediaRecorder.isTypeSupported(c.mime))
}

// Fully self-hosted voice loop:
//   mic → MediaRecorder → Whisper WASM (browser) → /ask (Pi) → /speak (Piper) → <audio>
// state machine: idle | listening | processing | speaking
export default function useVoiceAssistant() {
  const [state, setState]           = useState('idle')
  const [transcript, setTranscript] = useState('')
  // Full answer string exposed for response-cue overlays (cert bubbles /
  // contact card). id increments so repeated identical answers still trigger.
  const [answer, setAnswer]         = useState({ text: '', id: 0 })
  
  // Settings and mode states
  const [whisperMode, setWhisperMode] = useState('backend') // 'wasm' | 'backend'
  const [piperMode, setPiperMode] = useState('backend')     // 'wasm' | 'backend'
  const [selectedVoice, setSelectedVoice] = useState('en_US-amy-medium')
  const [availableVoices, setAvailableVoices] = useState([])
  const [voiceDownloadProgress, setVoiceDownloadProgress] = useState(0)

  const [modelReady, setModelReady]         = useState(false)
  const [modelProgress, setModelProgress]   = useState(0)
  const [piperReady, setPiperReady]         = useState(true)

  const sessionIdRef  = useRef(crypto.randomUUID())
  const stateRef      = useRef('idle')
  const analyserRef   = useRef(null)    // mic while listening, playback while speaking
  const micStreamRef  = useRef(null)
  const micCtxRef     = useRef(null)
  const recorderRef   = useRef(null)
  const chunksRef     = useRef([])
  const formatRef     = useRef(null)
  const historyRef    = useRef([])
  const vadTimerRef   = useRef(null)    // amplitude polling
  const noSpeechRef   = useRef(null)
  const spokeAtRef    = useRef(0)       // last time speech was detected
  const heardRef      = useRef(false)   // any speech at all this round
  const turnsRef      = useRef(0)       // answered questions this conversation

  // Shared playback chain — created once on the first user click (iOS unlock)
  const audioElRef     = useRef(null)
  const outCtxRef      = useRef(null)
  const outAnalyserRef = useRef(null)

  const setBoth = (s) => { stateRef.current = s; setState(s) }

  // Load settings on mount
  useEffect(() => {
    fetch(`${API_BASE}/settings`)
      .then(res => res.json())
      .then(data => {
        setWhisperMode(data.whisper_mode)
        setPiperMode(data.piper_mode)
        setAvailableVoices(data.voices || [])
        
        if (data.piper_mode === 'wasm') {
          const saved = localStorage.getItem('assistant_selected_voice')
          if (saved) {
            setSelectedVoice(saved)
          } else {
            setSelectedVoice(data.piper_voice)
          }
        } else {
          setSelectedVoice(data.piper_voice)
        }
      })
      .catch(err => console.error("Error loading settings:", err))
  }, [])

  // Change voice model locally/server-side
  const changeVoice = useCallback(async (voiceId) => {
    setSelectedVoice(voiceId)
    if (piperMode === 'wasm') {
      localStorage.setItem('assistant_selected_voice', voiceId)
    } else if (piperMode === 'backend') {
      try {
        const res = await fetch(`${API_BASE}/voices/download`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voice: voiceId })
        })
        const data = await res.json()
        if (data.status === 'started' || data.status === 'downloading') {
          setPiperReady(false)
          setVoiceDownloadProgress(0)
          
          const interval = setInterval(async () => {
            try {
              const pRes = await fetch(`${API_BASE}/voices/download-progress?voice=${voiceId}`)
              const pData = await pRes.json()
              setVoiceDownloadProgress(pData.progress)
              if (pData.downloaded || pData.progress === 100) {
                setPiperReady(true)
                setVoiceDownloadProgress(100)
                clearInterval(interval)
              }
            } catch (e) {
              console.error(e)
              setPiperReady(true)
              clearInterval(interval)
            }
          }, 1500)
        } else {
          setPiperReady(true)
          setVoiceDownloadProgress(100)
        }
      } catch (e) {
        console.error("Backend voice trigger error:", e)
        setPiperReady(true)
      }
    }
  }, [piperMode])

  // ── Whisper WASM: download model once on mount (only when feature enabled) ─
  useEffect(() => {
    if (whisperMode !== 'wasm') { setModelReady(true); return }
    setModelReady(false)
    initWhisper(({ progress }) => setModelProgress(Math.round(progress * 100)))
      .then(() => { setModelReady(true); setModelProgress(100) })
      .catch(e => console.warn('[whisper] model init failed:', e))
  }, [whisperMode])

  // ── Piper WASM: load engine + warm up once on mount ────────────────
  useEffect(() => {
    if (piperMode !== 'wasm') { setPiperReady(true); return }
    setPiperReady(false)
    setVoiceDownloadProgress(0)
    initPiper(selectedVoice, (progress) => {
      setVoiceDownloadProgress(progress)
    })
      .then(() => { setPiperReady(true); setVoiceDownloadProgress(100) })
      .catch(e => console.warn('[piper] engine init failed:', e))
  }, [piperMode, selectedVoice])

  // ── playback plumbing ───────────────────────────────────────────────
  const ensurePlayback = useCallback(() => {
    if (audioElRef.current) return
    const el  = new Audio()
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const src = ctx.createMediaElementSource(el)
    const an  = ctx.createAnalyser()
    an.fftSize = 256
    src.connect(an)
    an.connect(ctx.destination)
    audioElRef.current     = el
    outCtxRef.current      = ctx
    outAnalyserRef.current = an
  }, [])

  const stopPlayback = useCallback(() => {
    const el = audioElRef.current
    if (el) { el.pause(); el.removeAttribute('src') }
  }, [])

  // ── mic teardown ────────────────────────────────────────────────────
  const stopMic = useCallback(() => {
    clearInterval(vadTimerRef.current)
    clearTimeout(noSpeechRef.current)
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop() } catch {}
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop())
      micStreamRef.current = null
    }
    if (micCtxRef.current) {
      micCtxRef.current.close().catch(() => {})
      micCtxRef.current = null
    }
    analyserRef.current = null
  }, [])

  const speak = useCallback(async (text, resumeAfter = true) => {
    setBoth('processing')
    // surface the full answer for response-cue overlays (before word-by-word
    // transcript animation begins)
    if (text) setAnswer((a) => ({ text, id: a.id + 1 }))
    let syncIv
    try {
      let blob
      if (piperMode === 'wasm') {
        // Wait for engine if it's still initializing (background load)
        if (!isPiperReady(selectedVoice)) {
          await new Promise((resolve, reject) => {
            const deadline = Date.now() + 120_000
            const iv = setInterval(() => {
              if (isPiperReady(selectedVoice)) { clearInterval(iv); resolve() }
              else if (Date.now() > deadline)  { clearInterval(iv); reject(new Error('Piper init timeout')) }
            }, 500)
          })
        }
        const result = await piperGenerate(text, selectedVoice)
        blob = result.blob
      } else {
        const res = await fetch(`${API_BASE}/speak`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ text }),
        })
        if (!res.ok) throw new Error(`speak ${res.status}`)
        blob = await res.blob()
      }
      setBoth('speaking')
      const url  = URL.createObjectURL(blob)
      const el   = audioElRef.current
      outCtxRef.current.resume()
      analyserRef.current = outAnalyserRef.current

      const words = text.split(/\s+/)
      setTranscript('')

      await new Promise((resolve) => {
        el.onended = resolve
        el.onerror = resolve
        el.src = url
        el.play().then(() => {
          syncIv = setInterval(() => {
            const dur  = el.duration || 1
            const frac = Math.min(1, el.currentTime / dur)
            const n    = Math.max(1, Math.round(words.length * frac))
            setTranscript(words.slice(0, n).join(' '))
          }, 120)
        }).catch(resolve)
      })
      URL.revokeObjectURL(url)
      setTranscript(text)
    } catch (e) {
      console.warn('[voice] speak error:', e)
    }
    clearInterval(syncIv)
    analyserRef.current = null
    if (resumeAfter) {
      beginListeningRef.current({ postAnswer: true })
    } else {
      setBoth('idle')
      setTranscript('')
    }
  }, [piperMode, selectedVoice])

  const askApi = useCallback(async (question) => {
    setBoth('processing')
    try {
      const res = await fetch(`${API_BASE}/ask`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: question, history: historyRef.current, session_id: sessionIdRef.current }),
      })
      const data   = await res.json()
      const answer = data.answer || "I don't have that information."
      if (data.end) {
        turnsRef.current   = 0
        historyRef.current = []
        await speak(answer, false)
        return
      }
      historyRef.current = [...historyRef.current, { q: question, a: answer }].slice(-3)
      turnsRef.current += 1
      await speak(answer)
    } catch {
      await speak("Sorry, I couldn't reach the server.")
    }
  }, [speak])

  const finalize = useCallback(async () => {
    const recorder = recorderRef.current
    const heard    = heardRef.current
    clearInterval(vadTimerRef.current)
    clearTimeout(noSpeechRef.current)

    if (!recorder || recorder.state === 'inactive' || !heard) {
      stopMic()
      if (turnsRef.current > 0) {
        turnsRef.current   = 0
        historyRef.current = []
        await speak(FAREWELL, false)
      } else {
        setBoth('idle')
        setTranscript('')
      }
      return
    }

    const blob = await new Promise((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: formatRef.current.mime }))
      recorder.stop()
    })
    stopMic()
    setBoth('processing')

    try {
      let text
      if (whisperMode === 'wasm') {
        text = await transcribeBlob(blob)
      } else {
        const form = new FormData()
        form.append('audio', blob, `q.${formatRef.current.ext}`)
        const res  = await fetch(`${API_BASE}/transcribe`, { method: 'POST', body: form })
        const data = await res.json()
        text = (data.text || '').trim()
      }
      if (!text || isFillerOnly(text)) {
        beginListeningRef.current({ postAnswer: turnsRef.current > 0 })
        return
      }
      setTranscript(text)
      await askApi(text)
    } catch (e) {
      console.warn('[voice] transcription error:', e)
      await speak("Sorry, I couldn't reach the server.")
    }
  }, [stopMic, askApi, speak, whisperMode])

  const beginListening = useCallback(async (opts = {}) => {
    stopPlayback()
    setTranscript('')
    chunksRef.current  = []
    heardRef.current   = false
    spokeAtRef.current = 0

    const format = pickRecordingFormat()
    if (!format || !navigator.mediaDevices?.getUserMedia) {
      alert('Microphone recording is not supported in this browser.')
      setBoth('idle')
      return
    }
    formatRef.current = format

    let stream
    try {
      // autoGainControl lifts quiet voices; the others cut ambient noise so
      // the adaptive floor stays low and soft speech clears the threshold
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
    } catch {
      setBoth('idle')
      return
    }
    micStreamRef.current = stream

    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    micCtxRef.current = ctx
    const analyser = ctx.createAnalyser()
    // 2048 samples ≈ 43ms of audio per RMS reading — 256 (~5ms) often lands
    // between syllables and misses quiet speech entirely
    analyser.fftSize = 2048
    ctx.createMediaStreamSource(stream).connect(analyser)
    analyserRef.current = analyser

    const recorder = new MediaRecorder(stream, { mimeType: format.mime })
    recorderRef.current = recorder
    recorder.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data) }
    recorder.start(250)

    setBoth('listening')

    const samples = new Uint8Array(analyser.fftSize)
    // Start the floor low and let ambient noise raise it — starting high
    // (0.05 → threshold 0.1) meant soft speech never crossed until the
    // floor had decayed, which is why quiet users weren't heard at first
    let noiseFloor = 0.01
    let loudStreak = 0
    vadTimerRef.current = setInterval(() => {
      analyser.getByteTimeDomainData(samples)
      let sum = 0
      for (let i = 0; i < samples.length; i++) {
        const d = (samples[i] - 128) / 128
        sum += d * d
      }
      const amp = Math.sqrt(sum / samples.length)

      noiseFloor += (amp - noiseFloor) * (amp < noiseFloor ? 0.2 : 0.005)
      const threshold = Math.max(VAD_MIN, noiseFloor * 1.6)

      const now = Date.now()
      if (amp > threshold) {
        loudStreak += 1
        if (loudStreak >= 2) {
          heardRef.current   = true
          spokeAtRef.current = now
        }
      } else {
        loudStreak = 0
        if (heardRef.current && now - spokeAtRef.current > SILENCE_MS) {
          finalize()
        }
      }
    }, 100)

    noSpeechRef.current = setTimeout(() => {
      if (!heardRef.current) finalize()
    }, opts.postAnswer ? POST_ANSWER_MS : NO_SPEECH_MS)
  }, [stopPlayback, finalize])

  const beginListeningRef = useRef(beginListening)
  beginListeningRef.current = beginListening

  const cancel = useCallback(() => {
    stopMic()
    stopPlayback()
    turnsRef.current   = 0
    historyRef.current = []
    setBoth('idle')
    setTranscript('')
  }, [stopMic, stopPlayback])

  const toggle = useCallback(() => {
    if (stateRef.current === 'idle') {
      if (whisperMode === 'wasm' && !isWhisperReady()) return
      // Piper still loading: let the user start listening; TTS will play once ready
      ensurePlayback()
      beginListening()
    } else {
      cancel()
    }
  }, [ensurePlayback, beginListening, cancel, whisperMode])

  return {
    state,
    stateRef,
    transcript,
    answer,
    toggle,
    analyserRef,
    modelReady,
    modelProgress,
    piperReady,
    whisperMode,
    piperMode,
    selectedVoice,
    availableVoices,
    voiceDownloadProgress,
    changeVoice
  }
}
