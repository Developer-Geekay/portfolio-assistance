import { useEffect, useRef, useState, useCallback } from 'react'

const API_URL      = 'http://localhost:8000'
const SILENCE_MS   = 1800    // pause after speech → user finished talking
const NO_SPEECH_MS = 10000   // never spoke at all → give up, back to idle

// Voice assistant state machine: idle | listening | processing | speaking
export default function useVoiceAssistant() {
  const [state, setState]           = useState('idle')
  const [transcript, setTranscript] = useState('')

  const stateRef         = useRef('idle')
  const analyserRef      = useRef(null)
  const micStreamRef     = useRef(null)
  const recognitionRef   = useRef(null)
  const historyRef       = useRef([])
  const finalRef         = useRef('')
  const transcriptRef    = useRef('')
  const silenceTimerRef  = useRef(null)
  const noSpeechTimerRef = useRef(null)
  const stoppingRef      = useRef(false)

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
    analyserRef.current = null
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch {}
    }
  }, [])

  const speak = useCallback((text) => {
    setState('speaking')
    window.speechSynthesis.cancel()
    const utt   = new SpeechSynthesisUtterance(text)
    utt.rate    = 0.95
    utt.onend   = () => { setState('idle'); setTranscript('') }
    utt.onerror = () => { setState('idle'); setTranscript('') }
    window.speechSynthesis.speak(utt)
  }, [])

  const askApi = useCallback(async (question) => {
    setState('processing')
    try {
      const res = await fetch(`${API_URL}/ask`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: question, history: historyRef.current }),
      })
      const data   = await res.json()
      const answer = data.answer || "I don't have that information."
      historyRef.current = [...historyRef.current, { q: question, a: answer }].slice(-3)
      setTimeout(() => speak(answer), 2000)
    } catch {
      setTimeout(() => speak("Sorry, I couldn't reach the server."), 2000)
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

  const startListening = useCallback(async () => {
    if (stateRef.current !== 'idle') return
    window.speechSynthesis.cancel()
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

    setState('listening')
    createSession()

    noSpeechTimerRef.current = setTimeout(() => {
      if (!transcriptRef.current.trim()) finalize()
    }, NO_SPEECH_MS)
  }, [stopMic, finalize])

  const cancel = useCallback(() => {
    stopMic()
    window.speechSynthesis.cancel()
    setState('idle')
    setTranscript('')
  }, [stopMic])

  // Click on the ring: idle → listen; listening → cancel
  const toggle = useCallback(() => {
    if (stateRef.current === 'idle')           startListening()
    else if (stateRef.current === 'listening') cancel()
  }, [startListening, cancel])

  return { state, stateRef, transcript, toggle, analyserRef }
}
