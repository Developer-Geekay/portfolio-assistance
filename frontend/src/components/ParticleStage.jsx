import { useEffect, useRef } from 'react'

const COUNT        = 220
const BG           = '#07070f'
const AMBIENT_DIST = 120     // max px for connecting lines when scattered
const CIRCLE_DIST  = 30      // max px for connecting lines when in circle
const LERP         = 0.03    // morph speed toward targets

export default function ParticleStage({ modeRef, analyserRef }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    let animId

    const resize = () => {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // Current positions (what we draw) and home positions (ambient drift)
    const px = new Float32Array(COUNT)
    const py = new Float32Array(COUNT)
    const hx = new Float32Array(COUNT)
    const hy = new Float32Array(COUNT)
    const vx = new Float32Array(COUNT)
    const vy = new Float32Array(COUNT)
    const alpha = new Float32Array(COUNT)
    const phase = new Float32Array(COUNT)
    const speed = new Float32Array(COUNT)

    for (let i = 0; i < COUNT; i++) {
      hx[i] = px[i] = Math.random() * canvas.width
      hy[i] = py[i] = Math.random() * canvas.height
      vx[i] = (Math.random() - 0.5) * 0.3
      vy[i] = (Math.random() - 0.5) * 0.3
      alpha[i] = Math.random() * 0.4 + 0.6
      phase[i] = Math.random() * Math.PI * 2
      speed[i] = Math.random() * 0.008 + 0.003
    }

    const freq = new Uint8Array(128)
    let tick = 0
    let ampSmooth = 0   // eased mic amplitude so the ring waves fluidly

    const draw = () => {
      animId = requestAnimationFrame(draw)
      tick++

      const W  = canvas.width
      const H  = canvas.height
      const cx = W / 2
      const cy = H / 2
      const circleR = Math.min(W, H) * 0.18

      ctx.fillStyle = BG
      ctx.fillRect(0, 0, W, H)

      const mode     = modeRef.current
      const inCircle = mode !== 'ambient'

      // Mic amplitude while listening — eased for fluid motion
      let ampTarget = 0
      if (analyserRef.current && mode === 'listening') {
        analyserRef.current.getByteFrequencyData(freq)
        ampTarget = freq.reduce((a, v) => a + v, 0) / freq.length / 255
      }
      ampSmooth += (ampTarget - ampSmooth) * 0.08
      const amp = ampSmooth

      for (let i = 0; i < COUNT; i++) {
        // Home positions always drift so ambient return feels alive
        hx[i] += vx[i]
        hy[i] += vy[i]
        if (hx[i] < 0) hx[i] = W
        if (hx[i] > W) hx[i] = 0
        if (hy[i] < 0) hy[i] = H
        if (hy[i] > H) hy[i] = 0

        let tx, ty
        if (inCircle) {
          const angle = (i / COUNT) * Math.PI * 2
          let r = circleR

          if (mode === 'listening') {
            // Waveform ring driven by voice amplitude
            r += Math.sin(angle * 8 + tick * 0.06) * (4 + amp * 70) + amp * 35
          } else if (mode === 'processing') {
            // Gentle rotating ripple while thinking
            r += Math.sin(angle * 3 + tick * 0.04) * 6
          } else if (mode === 'speaking') {
            // Rhythmic speech-like pulse
            const pulse = Math.sin(tick * 0.06) * 0.5 + 0.5
            r += Math.sin(angle * 5 - tick * 0.05) * (6 + pulse * 12)
          }

          tx = cx + Math.cos(angle) * r
          ty = cy + Math.sin(angle) * r
        } else {
          tx = hx[i]
          ty = hy[i]
        }

        px[i] += (tx - px[i]) * LERP
        py[i] += (ty - py[i]) * LERP
      }

      // Connecting lines
      const maxDist = inCircle ? CIRCLE_DIST : AMBIENT_DIST
      for (let i = 0; i < COUNT; i++) {
        const pulseI = (Math.sin(tick * speed[i] + phase[i]) + 1) / 2
        for (let j = i + 1; j < COUNT; j++) {
          const dx = px[i] - px[j]
          const dy = py[i] - py[j]
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < maxDist) {
            let lineAlpha
            if (inCircle) {
              lineAlpha = (1 - dist / maxDist) * 0.7
            } else {
              const pulseJ = (Math.sin(tick * speed[j] + phase[j]) + 1) / 2
              lineAlpha = (1 - dist / maxDist) * 0.7 * pulseI * pulseJ
            }
            if (lineAlpha < 0.01) continue
            ctx.beginPath()
            ctx.moveTo(px[i], py[i])
            ctx.lineTo(px[j], py[j])
            ctx.strokeStyle = `rgba(210,222,240,${lineAlpha.toFixed(3)})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }
      }

      // Dots
      for (let i = 0; i < COUNT; i++) {
        ctx.beginPath()
        ctx.arc(px[i], py[i], 1.4, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(225,235,250,${alpha[i]})`
        ctx.fill()
      }
    }

    draw()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [modeRef, analyserRef])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: BG }}
    />
  )
}
