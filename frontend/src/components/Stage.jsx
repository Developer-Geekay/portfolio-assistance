import { useEffect, useRef, useState } from 'react'
import useVoiceAssistant from '../hooks/useVoiceAssistant'
import { USE_WHISPER_WASM, USE_PIPER_WASM } from '../features'
import LoaderParticles from './LoaderParticles'
import './Stage.css'

const ANY_WASM = USE_WHISPER_WASM || USE_PIPER_WASM

const N = 220   // ring particles
const TAGLINE_MS   = 8000
const LOADER_MSG_MS = 4500

const LOADER_MSGS = [
  "Running entirely on a Raspberry Pi 5. No cap.",
  "No cloud. No API keys. Just ONNX and optimism.",
  "Teaching silicon to pronounce 'Gokulakannan'…",
  "Self-hosted AI: because the cloud is just someone else's Pi.",
  "Loading 60 million parameters. They're a bit heavy.",
  "Warming up the neural net. It gets cold easily.",
  "Converting your patience into embeddings.",
  "The model weighs less than your browser history.",
  "Asking the ONNX runtime very nicely to behave.",
  "Zero telemetry. Zero tracking. Just vibes.",
  "Fun fact: this whole thing runs on $80 of hardware.",
  "Whisper is transcribing. Piper is clearing its throat.",
]

// Idle rotation: assistant hints + general quotes (nothing personal)
const TAGLINES = [
  'Ask me anything about Gokul',
  'Voice-first · Fully self-hosted · No cloud',
  '"Simplicity is the ultimate sophistication" — Leonardo da Vinci',
  '"The best way to predict the future is to invent it" — Alan Kay',
  '"Make it work, make it right, make it fast" — Kent Beck',
  '"Technology is best when it brings people together" — Matt Mullenweg',
  '"First, solve the problem. Then, write the code" — John Johnson',
  '"Any sufficiently advanced technology is indistinguishable from magic" — Arthur C. Clarke',
  '"The details are not the details. They make the design" — Charles Eames',
  '"Stay hungry, stay foolish" — Stewart Brand',
]

export default function Stage() {
  const stageRef  = useRef(null)
  const canvasRef = useRef(null)

  const {
    state,
    stateRef,
    transcript,
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
  } = useVoiceAssistant()

  // toggle lives in a ref so the canvas click handler always sees the latest
  const toggleRef = useRef(toggle)
  useEffect(() => { toggleRef.current = toggle }, [toggle])

  // ── loader state (React-owned, no ref bridge needed) ───────────────
  // loaderDoneRef lets the canvas effect start the ring assembly animation
  // without creating a closure dependency on loaderDone state.
  const [loaderDone, setLoaderDone] = useState(false)
  const loaderDoneRef = useRef(false)

  // Progress bar percentage — driven by real Whisper progress or a fake fill
  const [barPct, setBarPct] = useState(0)

  const transcriptRef = useRef(null)
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTo({
        top: transcriptRef.current.scrollHeight,
        behavior: 'smooth'
      })
    }
  }, [transcript])

  const anyWasm = whisperMode === 'wasm' || piperMode === 'wasm'

  // Update bar percentage dynamically
  useEffect(() => {
    if (!anyWasm) return
    if (whisperMode === 'wasm' && !modelReady) {
      setBarPct(modelProgress)
    } else if (piperMode === 'wasm' && !piperReady) {
      setBarPct(voiceDownloadProgress)
    }
  }, [modelReady, modelProgress, piperReady, voiceDownloadProgress, whisperMode, piperMode, anyWasm])

  // Dismiss loader once both models are ready (or immediately for no-WASM).
  useEffect(() => {
    if (anyWasm) {
      if (!modelReady || !piperReady) {
        setLoaderDone(false)
        loaderDoneRef.current = false
        return
      }
      setBarPct(100)
      const t = setTimeout(() => {
        setLoaderDone(true)
        loaderDoneRef.current = true
      }, 400)
      return () => clearTimeout(t)
    } else {
      // No WASM: fake loader for 1.0 s, then reveal ring
      setBarPct(96)
      const t = setTimeout(() => {
        setBarPct(100)
        setTimeout(() => { setLoaderDone(true); loaderDoneRef.current = true }, 300)
      }, 1000)
      return () => clearTimeout(t)
    }
  }, [modelReady, piperReady, anyWasm])

  // stage.ready class enables CSS transitions for .legend, .start, .hint
  useEffect(() => {
    if (!loaderDone) return
    const t = setTimeout(() => stageRef.current?.classList.add('ready'), 900)
    return () => clearTimeout(t)
  }, [loaderDone])

  // ── rotating witty messages while loader is visible ─────────────────
  const [loaderMsg, setLoaderMsg] = useState({ text: LOADER_MSGS[0], key: 0 })
  useEffect(() => {
    if (loaderDone) return
    let idx = 0
    const iv = setInterval(() => {
      idx = (idx + 1) % LOADER_MSGS.length
      setLoaderMsg(prev => ({ text: LOADER_MSGS[idx], key: prev.key + 1 }))
    }, LOADER_MSG_MS)
    return () => clearInterval(iv)
  }, [loaderDone])

  // ── idle taglines: hints + general quotes, rotated while idle ──
  const [tagline, setTagline] = useState({ text: '', key: 0 })
  useEffect(() => {
    let idx = -1
    const rotate = () => {
      if (stateRef.current !== 'idle') return
      idx = (idx + 1 + Math.floor(Math.random() * (TAGLINES.length - 1))) % TAGLINES.length
      setTagline(prev => ({ text: TAGLINES[idx], key: prev.key + 1 }))
    }
    const firstTimer = setTimeout(rotate, 3500)
    const iv = setInterval(rotate, TAGLINE_MS)
    return () => { clearTimeout(firstTimer); clearInterval(iv) }
  }, [stateRef])

  // ── canvas: ring animation only (loader managed by React above) ─────
  useEffect(() => {
    const stage  = stageRef.current
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let W, H, cx, cy, R
    let dust  = []
    let stars = []
    let animId
    let assembled = 0

    const ring = []
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2
      ring.push({
        a,
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        tx: 0, ty: 0,
        seed: Math.random() * 1000,
        r: Math.random() * 0.9 + 0.5,
        alpha: Math.random() * 0.4 + 0.5,
      })
    }

    function resize() {
      const rect = stage.getBoundingClientRect()
      const dpr  = window.devicePixelRatio || 1
      W = rect.width
      H = rect.height
      canvas.width  = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cx = W / 2; cy = H / 2
      const isMobile = W < 600
      R = Math.min(W, H) * (isMobile ? 0.23 : 0.16)
      dust = Array.from({ length: Math.floor((W * H) / 60000) }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 0.8 + 0.3,
        a: Math.random() * 0.12 + 0.03,
        tw: Math.random() * Math.PI * 2,
        tws: Math.random() * 0.008 + 0.002,
      }))
      stars = Array.from({ length: Math.floor((W * H) / 9000) }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        r: Math.random() * 1.1 + 0.5,
        a: Math.random() * 0.35 + 0.25,
      }))
    }
    window.addEventListener('resize', resize)
    resize()

    function wob(a, t, seed) {
      return Math.sin(a * 3 + t * 0.5 + seed) * 0.5
           + Math.sin(a * 5 - t * 0.32 + seed * 2) * 0.3
           + Math.sin(a * 8 + t * 0.21 + seed * 3) * 0.2
    }

    let mx = -9999, my = -9999
    let gather = 0
    let listenAmt = 0
    let level = 0
    let ripples = []
    let spin = 0
    let spinVel = 0.0035
    let procAmt = 0
    const freq = new Uint8Array(128)

    const onMouseMove = (e) => { mx = e.clientX; my = e.clientY }
    const onTouchMove = (e) => { mx = e.touches[0].clientX; my = e.touches[0].clientY }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('touchmove', onTouchMove, { passive: true })

    const onClick = (e) => {
      const d = Math.hypot(e.clientX - cx, e.clientY - cy)
      if (d < R * 1.6) toggleRef.current()
    }
    canvas.addEventListener('click', onClick)

    let t = 0
    function step() {
      animId = requestAnimationFrame(step)
      t += reduceMotion ? 0 : 0.012
      ctx.clearRect(0, 0, W, H)

      const vState = stateRef.current
      const active = vState !== 'idle'
      stage.classList.toggle('listening', active)

      const clearR = R * 1.15
      const LINK = 130
      for (const s of stars) {
        if (!reduceMotion) {
          s.x += s.vx; s.y += s.vy
          if (s.x < 0 || s.x > W) s.vx *= -1
          if (s.y < 0 || s.y > H) s.vy *= -1
        }
      }
      for (let i = 0; i < stars.length; i++) {
        const a = stars[i]
        const adc = Math.hypot(a.x - cx, a.y - cy)
        const afade = Math.max(0, Math.min(1, (adc - clearR) / 90))
        if (afade <= 0) continue
        for (let j = i + 1; j < stars.length; j++) {
          const b = stars[j]
          const dx = a.x - b.x, dy = a.y - b.y
          if (Math.abs(dx) > LINK || Math.abs(dy) > LINK) continue
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d < LINK) {
            const bdc = Math.hypot(b.x - cx, b.y - cy)
            const bfade = Math.max(0, Math.min(1, (bdc - clearR) / 90))
            const o = (1 - d / LINK) * 0.22 * afade * bfade
            if (o > 0.005) {
              ctx.strokeStyle = `rgba(160,180,195,${o})`
              ctx.lineWidth = 0.6
              ctx.beginPath()
              ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
              ctx.stroke()
            }
          }
        }
        ctx.fillStyle = `rgba(210,225,235,${Math.min(1, a.a * 2.2) * afade})`
        ctx.beginPath()
        ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2)
        ctx.fill()
      }

      for (const d of dust) {
        d.tw += d.tws
        ctx.fillStyle = `rgba(223,230,236,${d.a * (0.5 + 0.5 * Math.sin(d.tw))})`
        ctx.beginPath()
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
        ctx.fill()
      }

      const md = Math.hypot(mx - cx, my - cy)
      const target = active ? 0 : Math.max(0, Math.min(1, 1 - (md - R) / (R * 2.2)))
      gather += (target - gather) * 0.04
      stage.classList.toggle('near', gather > 0.55 && !active)

      listenAmt += ((active ? 1 : 0) - listenAmt) * 0.05

      let raw = 0
      if ((vState === 'listening' || vState === 'speaking') && analyserRef.current) {
        analyserRef.current.getByteFrequencyData(freq)
        raw = Math.min(1, (freq.reduce((s, v) => s + v, 0) / freq.length / 255) * 3)
      } else if (vState === 'speaking') {
        raw = 0.15 + Math.max(0, Math.sin(t * 3.1)) * 0.1
      } else if (vState === 'processing') {
        raw = 0.15 + Math.sin(t * 1.4) * 0.08
      }
      const easeRate = vState === 'speaking' && raw > level ? 0.3 : (active ? 0.12 : 0.06)
      level += (raw - level) * easeRate

      if (active && level > 0.55 && Math.random() < 0.08) {
        ripples.push({ r: R * 1.02, a: 0.35 })
      }
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i]
        rp.r += 1.6 + level * 1.5
        rp.a *= 0.965
        if (rp.a < 0.01) { ripples.splice(i, 1); continue }
        ctx.strokeStyle = `rgba(223,230,236,${rp.a})`
        ctx.lineWidth = 0.7
        ctx.beginPath()
        ctx.arc(cx, cy, rp.r, 0, Math.PI * 2)
        ctx.stroke()
      }

      // ring assembly starts as soon as loaderDoneRef is set
      if (loaderDoneRef.current) assembled += (1 - assembled) * 0.03

      const spinTarget = vState === 'processing' ? 0.045 : 0.0035
      spinVel += (spinTarget - spinVel) * 0.06
      spin += spinVel
      procAmt += ((vState === 'processing' ? 1 : 0) - procAmt) * 0.08

      const breathe = 1 + Math.sin(t * 0.6) * 0.015
      const listenPulse = 1 + level * 0.06
      const speed = 1 + listenAmt * 3

      for (const p of ring) {
        const w = wob(p.a, t * speed, p.seed)
        const idleAmp = 0.13
        const listenAmp = 0.05 + level * 0.22
        const amp = idleAmp + (listenAmp - idleAmp) * listenAmt

        const organicR = R * (1 + w * amp) * breathe * listenPulse
        const circleR  = R * breathe
        let rr = organicR + (circleR - organicR) * gather * (1 - listenAmt)

        p.tx = cx + Math.cos(p.a + spin) * rr
        p.ty = cy + Math.sin(p.a + spin) * rr
        const ease = (0.08 + listenAmt * 0.12) * (0.15 + 0.85 * assembled)
        if (loaderDoneRef.current) {
          p.x += (p.tx - p.x) * ease
          p.y += (p.ty - p.y) * ease
        } else {
          p.x += Math.sin(t * 0.4 + p.seed) * 0.15
          p.y += Math.cos(t * 0.3 + p.seed * 2) * 0.15
        }

        const glow = gather * 0.45 + listenAmt * (0.25 + level * 0.5)
        const alpha = Math.min(1, p.alpha * (0.55 + glow)) * (0.25 + 0.75 * assembled)

        ctx.fillStyle = `rgba(223,230,236,${alpha})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r + gather * 0.4 + listenAmt * (0.3 + level * 0.8), 0, Math.PI * 2)
        ctx.fill()
      }

      if (procAmt > 0.02) {
        const sweep = t * 2.4
        ctx.strokeStyle = `rgba(223,230,236,${0.4 * procAmt})`
        ctx.lineWidth = 1.3
        ctx.beginPath()
        ctx.arc(cx, cy, R * 1.1, sweep, sweep + 1.0)
        ctx.stroke()
        ctx.strokeStyle = `rgba(223,230,236,${0.15 * procAmt})`
        ctx.lineWidth = 0.7
        ctx.beginPath()
        ctx.arc(cx, cy, R * 1.1, sweep - 0.5, sweep)
        ctx.stroke()
      }

      if (listenAmt > 0.02) {
        ctx.strokeStyle = `rgba(223,230,236,${0.10 * listenAmt * (0.4 + level)})`
        ctx.lineWidth = 0.6
        ctx.beginPath()
        for (let i = 0; i <= N; i++) {
          const p = ring[i % N]
          const w = wob(p.a, t * speed + 2.5, p.seed)
          const rr = R * 0.55 * (1 + w * (0.04 + level * 0.18)) * listenPulse
          const x = cx + Math.cos(p.a - t * 0.05) * rr
          const y = cy + Math.sin(p.a - t * 0.05) * rr
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        }
        ctx.closePath()
        ctx.stroke()
      }

      ctx.strokeStyle = `rgba(223,230,236,${(0.05 + gather * 0.06 + listenAmt * (0.05 + level * 0.12)) * Math.max(0, assembled * 1.4 - 0.4)})`
      ctx.lineWidth = 0.5
      ctx.beginPath()
      for (let i = 0; i <= N; i++) {
        const p = ring[i % N]
        if (i === 0) ctx.moveTo(p.x, p.y)
        else ctx.lineTo(p.x, p.y)
      }
      ctx.stroke()
    }
    step()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('click', onClick)
    }
  }, [stateRef, analyserRef])

  const isDownloadingVoice = piperMode === 'wasm' && !piperReady
  const displayMsgText = isDownloadingVoice
    ? `Downloading Voice Model (${selectedVoice})…`
    : loaderMsg.text

  return (
    <div className="stage" ref={stageRef}>
      {piperMode === 'wasm' && availableVoices.length > 0 && state === 'idle' && (
        <div className="voice-selector-container">
          <select
            value={selectedVoice}
            onChange={(e) => changeVoice(e.target.value)}
            className="voice-select"
            disabled={state !== 'idle'}
          >
            {availableVoices.map(v => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          {voiceDownloadProgress > 0 && voiceDownloadProgress < 100 && (
            <div className="voice-download-progress">
              Downloading Voice: {voiceDownloadProgress}%
            </div>
          )}
        </div>
      )}
      <div className="legend" aria-hidden="true"><span>Gokula</span><span>Kannan</span></div>
      <canvas className="stage-canvas" ref={canvasRef} />
      <div className="start">Start</div>
      <div className="hint">· · ·</div>
      {state === 'idle' && tagline.text && (
        <p className="tagline" key={tagline.key}>{tagline.text}</p>
      )}
      {state !== 'idle' && (
        <p ref={transcriptRef} className="transcript">{transcript || (state === 'listening' ? '· · ·' : '')}</p>
      )}

      <div className={`loader${loaderDone ? ' done' : ''}`}>
        <div className="loader-msg" key={isDownloadingVoice ? 'downloading' : loaderMsg.key}>
          {displayMsgText}
        </div>
        <LoaderParticles />
        <div className="loader-bar-wrap">
          <div className="track">
            <div className="bar" style={{ width: `${barPct}%` }} />
          </div>
          {anyWasm && (
            <span className="loader-pct">
              {loaderDone ? '✓' : barPct < 100 ? `${Math.round(barPct)}%` : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
