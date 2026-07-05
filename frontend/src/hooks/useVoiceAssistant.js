import { useRef, useState, useCallback } from 'react'

// vite dev proxy / nginx → FastAPI; override with VITE_API_BASE when mounted
// inside another site whose /api is taken (e.g. /assistance-api in a portfolio)
const API_BASE       = import.meta.env.VITE_API_BASE || '/api'
const SILENCE_MS     = 1800     // pause after speech → user finished talking
const NO_SPEECH_MS   = 10000    // never spoke at all → give up, back to idle
const POST_ANSWER_MS = 8000     // quiet after an answer → say goodbye, go idle
const VAD_MIN        = 0.025    // absolute floor for the adaptive speech threshold
const FAREWELL       = "Thank you! Glad to help — feel free to ask anytime."

// Turns made only of these are mic noise / self-talk — never sent to the brain
const FILLER_WORDS = new Set([
  'okay', 'ok', 'alright', 'all', 'right', 'hmm', 'hm', 'mmm',
  'uh', 'um', 'er', 'ah', 'yeah', 'ya', 'yes', 'no', 'so', 'well',
])

function isFillerOnly(text) {
  const words = text.toLowerCase().replace(/[^a-z\s']/g, ' ').split(/\s+/).filter(Boolean)
  return words.length > 0 && words.every(w => FILLER_WORDS.has(w))
}

// Per-browser-tab session: sessionStorage lives exactly until the tab closes
function getSessionId() {
  let sid = sessionStorage.getItem('gokul_session')
  if (!sid) {
    sid = crypto.randomUUID()
    sessionStorage.setItem('gokul_session', sid)
  }
  return sid
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
//   mic → MediaRecorder → /transcribe (Whisper) → /ask (Gemma) → /speak (Piper) → <audio>
// state machine: idle | listening | processing | speaking
export default function useVoiceAssistant() {
  const [state, setState]           = useState('idle')
  const [transcript, setTranscript] = useState('')

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

  // ── speak: Piper WAV from the server through the shared <audio>.
  // Words stream into the transcript in sync with playback progress.
  const speak = useCallback(async (text, resumeAfter = true) => {
    setBoth('speaking')
    let syncIv
    try {
      const res = await fetch(`${API_BASE}/speak`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text }),
      })
      if (!res.ok) throw new Error(`speak ${res.status}`)
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const el   = audioElRef.current
      outCtxRef.current.resume()
      analyserRef.current = outAnalyserRef.current   // ring follows the voice

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
      setTranscript(text)   // ensure the full sentence lands
    } catch (e) {
      console.warn('[voice] speak error:', e)
    }
    clearInterval(syncIv)
    analyserRef.current = null
    if (resumeAfter) {
      // conversation continues: answer done → listen for the next question
      beginListeningRef.current({ postAnswer: true })
    } else {
      setBoth('idle')
      setTranscript('')
    }
  }, [])

  // ── ask the brain ───────────────────────────────────────────────────
  const askApi = useCallback(async (question) => {
    setBoth('processing')
    try {
      const res = await fetch(`${API_BASE}/ask`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: question, history: historyRef.current, session_id: getSessionId() }),
      })
      const data   = await res.json()
      const answer = data.answer || "I don't have that information."
      if (data.end) {
        // visitor said goodbye — speak the farewell and stop listening
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

  // ── stop recording → Whisper → ask ─────────────────────────────────
  const finalize = useCallback(async () => {
    const recorder = recorderRef.current
    const heard    = heardRef.current
    clearInterval(vadTimerRef.current)
    clearTimeout(noSpeechRef.current)

    if (!recorder || recorder.state === 'inactive' || !heard) {
      stopMic()
      if (turnsRef.current > 0) {
        // conversation ends by silence → acknowledge, then go idle
        turnsRef.current   = 0
        historyRef.current = []
        await speak(FAREWELL, false)
      } else {
        setBoth('idle')
        setTranscript('')
      }
      return
    }

    // collect the final chunk, then transcribe
    const blob = await new Promise((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: formatRef.current.mime }))
      recorder.stop()
    })
    stopMic()
    setBoth('processing')

    try {
      const form = new FormData()
      form.append('audio', blob, `q.${formatRef.current.ext}`)
      const res  = await fetch(`${API_BASE}/transcribe`, { method: 'POST', body: form })
      const data = await res.json()
      const text = (data.text || '').trim()
      if (!text || isFillerOnly(text)) {
        // nothing meaningful heard — keep the conversation open, listen again
        beginListeningRef.current({ postAnswer: turnsRef.current > 0 })
        return
      }
      setTranscript(text)
      await askApi(text)
    } catch {
      await speak("Sorry, I couldn't reach the server.")
    }
  }, [stopMic, askApi, speak])

  // ── listening: record + client-side silence detection ──────────────
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
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setBoth('idle')   // mic denied
      return
    }
    micStreamRef.current = stream

    // amplitude analyser — drives both the ring and silence detection
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    micCtxRef.current = ctx
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    ctx.createMediaStreamSource(stream).connect(analyser)
    analyserRef.current = analyser

    const recorder = new MediaRecorder(stream, { mimeType: format.mime })
    recorderRef.current = recorder
    recorder.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data) }
    recorder.start(250)

    setBoth('listening')

    // voice activity detection: RMS level vs an adaptive noise floor, so it
    // works with quiet mics and noisy rooms alike. Speech begins → wait for
    // a SILENCE_MS pause to finalize.
    const samples = new Uint8Array(analyser.fftSize)
    let noiseFloor = 0.05   // starts high, adapts down to the room quickly
    vadTimerRef.current = setInterval(() => {
      analyser.getByteTimeDomainData(samples)
      let sum = 0
      for (let i = 0; i < samples.length; i++) {
        const d = (samples[i] - 128) / 128
        sum += d * d
      }
      const amp = Math.sqrt(sum / samples.length)

      // track the quiet level: fast down, very slow up
      noiseFloor += (amp - noiseFloor) * (amp < noiseFloor ? 0.2 : 0.005)
      const threshold = Math.max(VAD_MIN, noiseFloor * 2.5)

      const now = Date.now()
      if (amp > threshold) {
        heardRef.current   = true
        spokeAtRef.current = now
      } else if (heardRef.current && now - spokeAtRef.current > SILENCE_MS) {
        finalize()
      }
    }, 100)

    // shorter window after an answer — quiet visitor gets a polite goodbye
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

  // Click on the ring: idle → listen; anything else → end the conversation
  const toggle = useCallback(() => {
    if (stateRef.current === 'idle') {
      ensurePlayback()   // user gesture unlocks audio output (iOS requirement)
      beginListening()
    } else {
      cancel()
    }
  }, [ensurePlayback, beginListening, cancel])

  return { state, stateRef, transcript, toggle, analyserRef }
}
