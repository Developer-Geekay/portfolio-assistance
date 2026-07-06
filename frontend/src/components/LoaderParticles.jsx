import { useEffect, useRef } from 'react'

const W       = 220
const H       = 120
const N       = 180
const SHAPE_MS = 3600
const LERP    = 0.055
const OFF_W   = 120
const OFF_H   = 80
const DOT_R   = 1.8

// Each function draws a bold white shape on a (w × h) offscreen canvas.
// fillStyle and strokeStyle are pre-set to 'white' before each call.
// Rules: use lineWidth ≥ h*0.18 for strokes; fill everything solid so
// the pixel sampler gets a dense cloud to target.
const SHAPES = [
  // Heart (bezier fill)
  (c, w, h) => {
    c.beginPath()
    c.moveTo(w * 0.5, h * 0.80)
    c.bezierCurveTo(w * 0.04, h * 0.36, w * 0.04, h * 0.08, w * 0.5,  h * 0.34)
    c.bezierCurveTo(w * 0.96, h * 0.08, w * 0.96, h * 0.36, w * 0.5,  h * 0.80)
    c.fill()
  },

  // 5-point star (filled, distinct inner radius)
  (c, w, h) => {
    const r1 = Math.min(w, h) * 0.45, r2 = r1 * 0.40
    const cx = w / 2, cy = h * 0.52
    c.beginPath()
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? r1 : r2
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2
      i === 0 ? c.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
              : c.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
    }
    c.closePath(); c.fill()
  },

  // Circle ring (very thick stroke so plenty of pixels to sample)
  (c, w, h) => {
    c.lineWidth = h * 0.24
    c.beginPath()
    c.arc(w * 0.5, h * 0.5, Math.min(w, h) * 0.32, 0, Math.PI * 2)
    c.stroke()
  },

  // Arrow pointing right (filled solid)
  (c, w, h) => {
    c.beginPath()
    c.moveTo(w * 0.08, h * 0.34); c.lineTo(w * 0.60, h * 0.34)
    c.lineTo(w * 0.60, h * 0.15); c.lineTo(w * 0.94, h * 0.50)
    c.lineTo(w * 0.60, h * 0.85); c.lineTo(w * 0.60, h * 0.66)
    c.lineTo(w * 0.08, h * 0.66)
    c.closePath(); c.fill()
  },

  // Lightning bolt (filled)
  (c, w, h) => {
    c.beginPath()
    c.moveTo(w * 0.64, h * 0.02)
    c.lineTo(w * 0.28, h * 0.52); c.lineTo(w * 0.54, h * 0.52)
    c.lineTo(w * 0.26, h * 0.98)
    c.lineTo(w * 0.72, h * 0.48); c.lineTo(w * 0.46, h * 0.48)
    c.lineTo(w * 0.76, h * 0.02)
    c.closePath(); c.fill()
  },

  // Diamond / rhombus (filled, wide)
  (c, w, h) => {
    c.beginPath()
    c.moveTo(w * 0.50, h * 0.04)
    c.lineTo(w * 0.96, h * 0.50)
    c.lineTo(w * 0.50, h * 0.96)
    c.lineTo(w * 0.04, h * 0.50)
    c.closePath(); c.fill()
  },

  // Pi symbol (two thick legs + horizontal bar)
  (c, w, h) => {
    c.lineWidth = h * 0.20; c.lineCap = 'square'
    // horizontal bar
    c.beginPath(); c.moveTo(w * 0.10, h * 0.22); c.lineTo(w * 0.90, h * 0.22); c.stroke()
    // left leg
    c.beginPath(); c.moveTo(w * 0.28, h * 0.22); c.lineTo(w * 0.28, h * 0.92); c.stroke()
    // right leg curves slightly
    c.lineWidth = h * 0.19; c.lineCap = 'round'
    c.beginPath()
    c.moveTo(w * 0.68, h * 0.22)
    c.quadraticCurveTo(w * 0.80, h * 0.68, w * 0.62, h * 0.92)
    c.stroke()
  },

  // Cloud (three overlapping circles + base fill)
  (c, w, h) => {
    for (const [x, y, r] of [[0.30, 0.54, 0.19],[0.50, 0.40, 0.25],[0.70, 0.54, 0.19]]) {
      c.beginPath(); c.arc(w * x, h * y, w * r, 0, Math.PI * 2); c.fill()
    }
    c.fillRect(w * 0.11, h * 0.55, w * 0.78, h * 0.28)
  },

  // Crescent moon (big circle minus offset circle)
  (c, w, h) => {
    c.beginPath(); c.arc(w * 0.44, h * 0.50, h * 0.40, 0, Math.PI * 2); c.fill()
    c.fillStyle = 'black'
    c.beginPath(); c.arc(w * 0.60, h * 0.42, h * 0.30, 0, Math.PI * 2); c.fill()
  },

  // Rocket (nose + body + two fins)
  (c, w, h) => {
    c.beginPath()                        // nose cone
    c.moveTo(w * 0.50, h * 0.03); c.lineTo(w * 0.70, h * 0.50); c.lineTo(w * 0.30, h * 0.50)
    c.closePath(); c.fill()
    c.fillRect(w * 0.30, h * 0.48, w * 0.40, h * 0.28) // body
    c.beginPath()                        // left fin
    c.moveTo(w * 0.30, h * 0.60); c.lineTo(w * 0.12, h * 0.88); c.lineTo(w * 0.30, h * 0.82)
    c.closePath(); c.fill()
    c.beginPath()                        // right fin
    c.moveTo(w * 0.70, h * 0.60); c.lineTo(w * 0.88, h * 0.88); c.lineTo(w * 0.70, h * 0.82)
    c.closePath(); c.fill()
  },

  // Bird (bold flying-V stroke)
  (c, w, h) => {
    c.lineWidth = h * 0.22; c.lineCap = 'round'; c.lineJoin = 'round'
    c.beginPath()
    c.moveTo(w * 0.08, h * 0.30)
    c.quadraticCurveTo(w * 0.32, h * 0.65, w * 0.50, h * 0.48)
    c.quadraticCurveTo(w * 0.68, h * 0.65, w * 0.92, h * 0.30)
    c.stroke()
  },

  // Equilateral triangle (filled, tall so clearly not a blob)
  (c, w, h) => {
    c.beginPath()
    c.moveTo(w * 0.50, h * 0.04)
    c.lineTo(w * 0.96, h * 0.94)
    c.lineTo(w * 0.04, h * 0.94)
    c.closePath(); c.fill()
  },
]

function samplePoints(drawFn, n) {
  const off = document.createElement('canvas')
  off.width = OFF_W; off.height = OFF_H
  const c = off.getContext('2d')
  c.fillStyle = 'white'; c.strokeStyle = 'white'
  drawFn(c, OFF_W, OFF_H)
  const data = c.getImageData(0, 0, OFF_W, OFF_H).data
  const pts = []
  for (let y = 0; y < OFF_H; y++)
    for (let x = 0; x < OFF_W; x++)
      if (data[(y * OFF_W + x) * 4] > 128)
        pts.push([x / OFF_W, y / OFF_H])
  if (!pts.length) return Array.from({ length: n }, () => [0.5, 0.5])
  return Array.from({ length: n }, () => {
    const p = pts[Math.floor(Math.random() * pts.length)]
    // tiny jitter so co-located particles spread apart slightly
    return [p[0] + (Math.random() - 0.5) * 0.015, p[1] + (Math.random() - 0.5) * 0.015]
  })
}

export default function LoaderParticles() {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const PAD = 0.08
    const px = Float32Array.from({ length: N }, () => PAD + Math.random() * (1 - PAD * 2))
    const py = Float32Array.from({ length: N }, () => PAD + Math.random() * (1 - PAD * 2))
    const tx = new Float32Array(N)
    const ty = new Float32Array(N)

    function setShape(fn) {
      const pts = samplePoints(fn, N)
      for (let i = 0; i < N; i++) {
        tx[i] = PAD + pts[i][0] * (1 - PAD * 2)
        ty[i] = PAD + pts[i][1] * (1 - PAD * 2)
      }
    }

    let idx = Math.floor(Math.random() * SHAPES.length)
    setShape(SHAPES[idx])

    const iv = setInterval(() => {
      idx = (idx + 1 + Math.floor(Math.random() * (SHAPES.length - 1))) % SHAPES.length
      setShape(SHAPES[idx])
    }, SHAPE_MS)

    let animId
    function step() {
      animId = requestAnimationFrame(step)
      ctx.clearRect(0, 0, W, H)
      for (let i = 0; i < N; i++) {
        px[i] += (tx[i] - px[i]) * LERP
        py[i] += (ty[i] - py[i]) * LERP
        ctx.fillStyle = 'rgba(223,230,236,0.72)'
        ctx.beginPath()
        ctx.arc(px[i] * W, py[i] * H, DOT_R, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    step()

    return () => { cancelAnimationFrame(animId); clearInterval(iv) }
  }, [])

  return <canvas ref={ref} width={W} height={H} style={{ display: 'block' }} />
}
