import { useEffect, useRef, useState, useCallback } from 'react'

const API_URL      = 'http://localhost:8000'
const SILENCE_MS   = 1800    // pause after speech → user finished talking
const NO_SPEECH_MS = 10000   // never spoke at all → give up, back to idle

// Chrome populates voices asynchronously — resolve when they're actually there
function whenVoicesReady() {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis
    const now = synth.getVoices()
    if (now.length) return resolve(now)
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      resolve(synth.getVoices())
    }
    synth.addEventListener('voiceschanged', done, { once: true })
    setTimeout(done, 1500)   // give up waiting — speak with default anyway
  })
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

// Voice assistant state machine: idle | listening | processing | speaking
export default function useVoiceAssistant() {
  const [state, setState]           = useState('idle')
  const [transcript, setTranscript] = useState('')

  const stateRef         = useRef('idle')
  const analyserRef      = useRef(null)
  const pulseRef         = useRef(0)      // spikes on each spoken word (TTS boundary events)
  const utteranceRef     = useRef(null)   // holds current utterance — Chrome GCs unreferenced ones
  const audioCtxRef      = useRef(null)
  const micStreamRef     = useRef(null)
  const recognitionRef   = useRef(null)
  const historyRef       = useRef([])
  const finalRef         = useRef('')
  const transcriptRef    = useRef('')
  const silenceTimerRef  = useRef(null)
  const noSpeechTimerRef = useRef(null)
  const stoppingRef      = useRef(false)
  const beginListeningRef = useRef(null)  // breaks speak → listen circular dependency

  useEffect(() => { stateRef.current = state }, [state])

  const clearTimers = () => {
    clearTimeout(silenceTimerRef.current)
    clearTimeout(noSpeechTimerRef.current)
  }

  const stopMic = useCallback(() => {
    stoppingRef.current = true
    clearTimers()
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop())
      micStreamRef.current = null
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    analyserRef.current = null
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch {}
    }
  }, [])

  const speak = useCallback((text) => {
    setState('speaking')
    stateRef.current = 'speaking'

    const synth = window.speechSynthesis
    // cancel() while idle can wedge Chrome's speech engine (silent forever
    // until browser restart) — only clear the queue if something is in it
    if (synth.speaking || synth.pending) synth.cancel()

    const utt = new SpeechSynthesisUtterance(text)
    utt.rate  = 0.95
    // Chrome GC bug: keep the utterance referenced or speech silently dies
    utteranceRef.current = utt
    // Each word boundary spikes the ring — audiogram synced to real speech
    utt.onboundary = () => { pulseRef.current = 1 }

    console.log('[TTS] speak() called:', JSON.stringify(text.slice(0, 60)),
                '| voices:', synth.getVoices().length,
                '| pending:', synth.pending, '| speaking:', synth.speaking, '| paused:', synth.paused)
    utt.onstart = () => console.log('[TTS] onstart — audio playing')

    // Conversation continues: answer finishes → listen for the next question
    let resumed = false
    const resume = () => {
      if (resumed) return
      resumed = true
      utteranceRef.current = null
      setTranscript('')
      if (beginListeningRef.current) beginListeningRef.current()
    }
    utt.onend   = () => { console.log('[TTS] onend'); resume() }
    utt.onerror = (e) => {
      console.warn('[TTS] onerror:', e.error)
      resume()
    }

    // Wait for the async voice list, pick an explicit English voice, then speak.
    // cancel() needs a beat before speak(), and a stuck-paused queue needs resume().
    whenVoicesReady().then((voices) => {
      // Prefer Chrome's built-in Google voices — they don't go through the
      // macOS speech daemon, which can wedge and silence all local voices
      const en = voices.find(v => v.name === 'Google US English')
              || voices.find(v => v.lang === 'en-US' && !v.localService)
              || voices.find(v => v.lang === 'en-US' && v.default)
              || voices.find(v => v.lang === 'en-US')
              || voices.find(v => v.lang.startsWith('en'))
      if (en) utt.voice = en
      console.log('[TTS] voices:', voices.length, '| using:', en ? en.name : 'default')
      synth.resume()
      synth.speak(utt)
      setTimeout(() => console.log('[TTS] 500ms later — speaking:', synth.speaking,
                                   '| pending:', synth.pending, '| paused:', synth.paused), 500)
    })
  }, [])

  const askApi = useCallback(async (question) => {
    setState('processing')
    try {
      const res = await fetch(`${API_URL}/ask`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: question, history: historyRef.current, session_id: getSessionId() }),
      })
      const data   = await res.json()
      const answer = data.answer || "I don't have that information."
      historyRef.current = [...historyRef.current, { q: question, a: answer }].slice(-3)
      speak(answer)
    } catch {
      speak("Sorry, I couldn't reach the server.")
    }
  }, [speak])

  const finalize = useCallback(() => {
    const text = transcriptRef.current.trim()
    stopMic()
    if (text) {
      askApi(text)
    } else {
      setState('idle')
      setTranscript('')
    }
  }, [stopMic, askApi])

  // Core listening setup — no idle guard, so the speak → listen loop can call it
  const beginListening = useCallback(async () => {
    const synth = window.speechSynthesis
    if (synth.speaking || synth.pending) synth.cancel()
    setTranscript('')
    finalRef.current      = ''
    transcriptRef.current = ''
    stoppingRef.current   = false

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Speech recognition not supported in this browser.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micStreamRef.current = stream
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      audioCtxRef.current = audioCtx
      const source   = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser
    } catch {
      // mic amplitude unavailable — recognition can still work
    }

    const createSession = () => {
      const recognition          = new SpeechRecognition()
      recognition.lang           = 'en-US'
      recognition.continuous     = true
      recognition.interimResults = true
      recognitionRef.current     = recognition

      recognition.onresult = (e) => {
        let interim = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const txt = e.results[i][0].transcript
          if (e.results[i].isFinal) finalRef.current += txt + ' '
          else                      interim += txt
        }
        const full = (finalRef.current + interim).trim()
        transcriptRef.current = full
        setTranscript(full)

        if (full) {
          clearTimeout(noSpeechTimerRef.current)
          clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = setTimeout(finalize, SILENCE_MS)
        }
      }

      recognition.onerror = (e) => {
        if (e.error === 'not-allowed') {
          stopMic()
          setState('idle')
          setTranscript('')
        }
      }

      // Chrome kills sessions after silence — restart while still listening
      recognition.onend = () => {
        if (!stoppingRef.current && stateRef.current === 'listening') {
          setTimeout(() => {
            if (!stoppingRef.current && stateRef.current === 'listening') {
              try { createSession() } catch {}
            }
          }, 100)
        }
      }

      recognition.start()
    }

    stateRef.current = 'listening'   // immediate — session restart logic reads this
    setState('listening')
    createSession()

    noSpeechTimerRef.current = setTimeout(() => {
      if (!transcriptRef.current.trim()) finalize()
    }, NO_SPEECH_MS)
  }, [stopMic, finalize])

  // Keep the ref current so speak() can resume the loop
  useEffect(() => { beginListeningRef.current = beginListening }, [beginListening])

  const startListening = useCallback(() => {
    if (stateRef.current !== 'idle') return
    beginListening()
  }, [beginListening])

  const cancel = useCallback(() => {
    stopMic()
    const synth = window.speechSynthesis
    if (synth.speaking || synth.pending) synth.cancel()
    setState('idle')
    setTranscript('')
  }, [stopMic])

  // Click on the ring: idle → listen; anything else → end the conversation
  const toggle = useCallback(() => {
    if (stateRef.current === 'idle') startListening()
    else                             cancel()
  }, [startListening, cancel])

  return { state, stateRef, transcript, toggle, analyserRef, pulseRef }
}
