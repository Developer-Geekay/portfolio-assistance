import { useEffect, useRef, useState } from 'react'
import useVoiceAssistant from '../hooks/useVoiceAssistant'
import './Stage.css'

const N = 220   // ring particles
const API_BASE = '/api'
const TAGLINE_MS = 8000

const TAGLINES = [
  'Technical Architect · OutSystems Specialist',
  'Ask me anything about Gokul',
  'Voice-first · Fully self-hosted · No cloud',
  'Builder of developer tools',
]

export default function Stage() {
  const stageRef   = useRef(null)
  const canvasRef  = useRef(null)
  const loaderRef  = useRef(null)
  const loadBarRef = useRef(null)

  const { state, stateRef, transcript, toggle, analyserRef } = useVoiceAssistant()

  // toggle lives in a ref so the canvas click handler always sees the latest
  const toggleRef = useRef(toggle)
  useEffect(() => { toggleRef.current = toggle }, [toggle])

  // ── idle taglines: static lines + random KB facts, rotated while idle ──
  const [tagline, setTagline] = useState({ text: '', key: 0 })
  const poolRef = useRef([...TAGLINES])

  useEffect(() => {
    fetch(`${API_BASE}/facts?n=15`)
      .then(r => r.json())
      .then(facts => { poolRef.current = [...TAGLINES, ...facts] })
      .catch(() => {})   // backend down → static taglines only

    let idx = -1
    const rotate = () => {
      if (stateRef.current !== 'idle') return   // pause rotation mid-conversation
      const pool = poolRef.current
      idx = (idx + 1 + Math.floor(Math.random() * (pool.length - 1))) % pool.length
      setTagline(prev => ({ text: pool[idx], key: prev.key + 1 }))
    }
    const firstTimer = setTimeout(rotate, 3500)   // wait for loader + ring assembly
    const iv = setInterval(rotate, TAGLINE_MS)
    return () => { clearTimeout(firstTimer); clearInterval(iv) }
  }, [stateRef])

  useEffect(() => {
    const stage  = stageRef.current
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    const loader  = loaderRef.current
    const loadBar = loadBarRef.current
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let W, H, cx, cy, R
    let dust  = []
    let stars = []
    let animId

    const ring = []
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2
      ring.push({
        a,
        x: Math.random() * window.innerWidth,   // start scattered
        y: Math.random() * window.innerHeight,
        tx: 0, ty: 0,
        seed: Math.random() * 1000,
        r: Math.random() * 0.9 + 0.5,
        alpha: Math.random() * 0.4 + 0.5,
      })
    }

    // ---------- page loading ----------
    let loaded    = false
    let assembled = 0
    let progress  = 0

    const progressIv = setInterval(() => {
      progress = Math.min(progress + Math.random() * 14 + 4, 96)
      loadBar.style.width = progress + '%'
    }, 180)

    const loadTimer = setTimeout(() => {
      clearInterval(progressIv)
      loadBar.style.width = '100%'
      setTimeout(() => {
        loader.classList.add('done')
        loaded = true
        setTimeout(() => stage.classList.add('ready'), 900)
      }, 350)
    }, 1200)

    function resize() {
      // size from the actual element box (not window.inner*) and scale for
      // devicePixelRatio — mismatch between the two is what skews mobile
      const rect = stage.getBoundingClientRect()
      const dpr  = window.devicePixelRatio || 1
      W = rect.width
      H = rect.height
      canvas.width  = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cx = W / 2; cy = H / 2
      R = Math.min(W, H) * 0.16
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

    // simple layered sine noise
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
    let spin = 0            // ring rotation — spins up while processing
    let spinVel = 0.0035
    let procAmt = 0         // eased 0→1 while processing (sweep arc)
    const freq = new Uint8Array(128)

    const onMouseMove = (e) => { mx = e.clientX; my = e.clientY }
    const onTouchMove = (e) => { mx = e.touches[0].clientX; my = e.touches[0].clientY }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('touchmove', onTouchMove, { passive: true })

    const onClick = (e) => {
      // use the event's own coordinates — mobile taps never fire mousemove
      const d = Math.hypot(e.clientX - cx, e.clientY - cy)
      if (d < R * 1.6) toggleRef.current()
    }
    canvas.addEventListener('click', onClick)

    let t = 0
    function step() {
      animId = requestAnimationFrame(step)
      t += reduceMotion ? 0 : 0.012
      ctx.clearRect(0, 0, W, H)

      const vState = stateRef.current                 // idle | listening | processing | speaking
      const active = vState !== 'idle'
      stage.classList.toggle('listening', active)

      // constellation network — drifting, kept clear of the center
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

      // sparse background dust
      for (const d of dust) {
        d.tw += d.tws
        ctx.fillStyle = `rgba(223,230,236,${d.a * (0.5 + 0.5 * Math.sin(d.tw))})`
        ctx.beginPath()
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
        ctx.fill()
      }

      // proximity → gather (disabled while active)
      const md = Math.hypot(mx - cx, my - cy)
      const target = active ? 0 : Math.max(0, Math.min(1, 1 - (md - R) / (R * 2.2)))
      gather += (target - gather) * 0.04
      stage.classList.toggle('near', gather > 0.55 && !active)

      // ease in/out of active mode
      listenAmt += ((active ? 1 : 0) - listenAmt) * 0.05

      // voice amplitude: real audio both ways — mic while listening,
      // Piper playback while speaking (analyserRef points at the right one)
      let raw = 0
      if ((vState === 'listening' || vState === 'speaking') && analyserRef.current) {
        analyserRef.current.getByteFrequencyData(freq)
        raw = Math.min(1, (freq.reduce((s, v) => s + v, 0) / freq.length / 255) * 3)
      } else if (vState === 'speaking') {
        raw = 0.15 + Math.max(0, Math.sin(t * 3.1)) * 0.1   // fallback if analyser missing
      } else if (vState === 'processing') {
        raw = 0.15 + Math.sin(t * 1.4) * 0.08
      }
      // fast attack on word pulses while speaking, smooth everywhere else
      const easeRate = vState === 'speaking' && raw > level ? 0.3 : (active ? 0.12 : 0.06)
      level += (raw - level) * easeRate

      // spawn ripples on amplitude peaks
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

      // assembly: after load, particles converge from scatter into the ring
      if (loaded) assembled += (1 - assembled) * 0.03

      // ring spins up noticeably while the answer is being generated
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
        if (loaded) {
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

      // processing: bright arc sweeping around the ring — "thinking" spinner
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

      // inner echo ring — a smaller mirrored waveform, only while active
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

      // faint connecting thread between neighbors
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
      clearInterval(progressIv)
      clearTimeout(loadTimer)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('click', onClick)
    }
  }, [stateRef, analyserRef])

  return (
    <div className="stage" ref={stageRef}>
      <div className="legend" aria-hidden="true"><span>Gokula</span><span>Kannan</span></div>
      <canvas className="stage-canvas" ref={canvasRef} />
      <div className="start">Start</div>
      <div className="hint">· · ·</div>
      {state === 'idle' && tagline.text && (
        <p className="tagline" key={tagline.key}>{tagline.text}</p>
      )}
      {state !== 'idle' && (
        <p className="transcript">{transcript || (state === 'listening' ? '· · ·' : '')}</p>
      )}
      <div className="loader" ref={loaderRef}>
        <div className="dots"><i></i><i></i><i></i></div>
        <div className="track"><div className="bar" ref={loadBarRef}></div></div>
      </div>
    </div>
  )
}
