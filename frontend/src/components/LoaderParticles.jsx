import { useEffect, useRef } from 'react'

const W = 220, H = 120
const N = 150            // particles — outlines read crisp with ~150 dots
const SHAPE_MS = 3600
const PAD = 10           // px margin inside the canvas
const TAU = Math.PI * 2

// ── path helpers ─────────────────────────────────────────────────────
// Every shape is a set of polylines (outlines) in arbitrary coordinates;
// they get uniformly scaled + centered onto the canvas, then resampled
// to exactly N points evenly spaced by arc length. Outlines stay crisp
// where filled pixel-sampling turns to mush.

function circle(cx, cy, r, from = 0, to = TAU, steps = 60) {
  const pts = []
  for (let i = 0; i <= steps; i++) {
    const a = from + (to - from) * (i / steps)
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return pts
}

function ellipse(cx, cy, rx, ry, rot = 0, steps = 60) {
  const cos = Math.cos(rot), sin = Math.sin(rot)
  const pts = []
  for (let i = 0; i <= steps; i++) {
    const a = TAU * (i / steps)
    const x = rx * Math.cos(a), y = ry * Math.sin(a)
    pts.push([cx + x * cos - y * sin, cy + x * sin + y * cos])
  }
  return pts
}

function bezier(p0, p1, p2, steps = 40) {
  const pts = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t
    pts.push([
      u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
      u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
    ])
  }
  return pts
}

const close = (poly) => [...poly, poly[0]]

// ── shapes ───────────────────────────────────────────────────────────
const SHAPES = [
  // Heart — the classic parametric heart curve
  () => {
    const pts = []
    for (let i = 0; i <= 100; i++) {
      const t = TAU * (i / 100)
      pts.push([
        16 * Math.sin(t) ** 3,
        -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)),
      ])
    }
    return [pts]
  },

  // Star — 5 points
  () => {
    const pts = []
    for (let i = 0; i <= 10; i++) {
      const r = i % 2 === 0 ? 1 : 0.42
      const a = -Math.PI / 2 + TAU * (i / 10)
      pts.push([r * Math.cos(a), r * Math.sin(a)])
    }
    return [pts]
  },

  // Infinity — lemniscate of Bernoulli
  () => {
    const pts = []
    for (let i = 0; i <= 100; i++) {
      const t = TAU * (i / 100)
      const d = 1 + Math.sin(t) ** 2
      pts.push([Math.cos(t) / d, (Math.sin(t) * Math.cos(t)) / d])
    }
    return [pts]
  },

  // Atom — three crossed electron orbits
  () => [
    ellipse(0, 0, 1, 0.35, 0),
    ellipse(0, 0, 1, 0.35, Math.PI / 3),
    ellipse(0, 0, 1, 0.35, -Math.PI / 3),
  ],

  // Saturn — planet with ring
  () => [
    circle(0, 0, 0.52),
    ellipse(0, 0, 1.05, 0.20, 0),
  ],

  // Rocket — hull, fins, nose
  () => [close([
    [0.50, 0.00], [0.65, 0.26], [0.65, 0.62], [0.86, 0.90], [0.62, 0.80],
    [0.62, 0.92], [0.38, 0.92], [0.38, 0.80], [0.14, 0.90], [0.35, 0.62],
    [0.35, 0.26],
  ])],

  // Lightning bolt
  () => [close([
    [0.62, 0.00], [0.25, 0.55], [0.47, 0.55],
    [0.32, 1.00], [0.78, 0.42], [0.55, 0.42],
  ])],

  // Bird — two wing arcs
  () => [[
    ...bezier([0.00, 0.35], [0.25, 0.75], [0.50, 0.50]),
    ...bezier([0.50, 0.50], [0.75, 0.75], [1.00, 0.35]),
  ]],

  // Music note — head, stem, flag
  () => [
    ellipse(0.36, 0.82, 0.13, 0.09, -0.35),
    [[0.485, 0.80], [0.485, 0.12]],
    bezier([0.485, 0.12], [0.74, 0.24], [0.60, 0.52]),
  ],

  // Smiley — face, smile, eyes
  () => [
    circle(0, 0, 1),
    circle(0, 0.08, 0.55, TAU * 0.08, TAU * 0.42),
    circle(-0.35, -0.28, 0.10),
    circle(0.35, -0.28, 0.10),
  ],

  // Heartbeat pulse — ECG line
  () => [[
    [0.00, 0.50], [0.28, 0.50], [0.36, 0.16],
    [0.46, 0.86], [0.54, 0.30], [0.60, 0.50], [1.00, 0.50],
  ]],

  // Gem — faceted diamond
  () => [
    close([[0.2, 0], [0.8, 0], [1, 0.32], [0.5, 1], [0, 0.32]]),
    [[0, 0.32], [1, 0.32]],
    [[0.2, 0], [0.38, 0.32], [0.5, 1]],
    [[0.8, 0], [0.62, 0.32], [0.5, 1]],
  ],
]

// ── sampling ─────────────────────────────────────────────────────────
// Uniformly scale + center paths into the canvas (aspect preserved),
// then place n points evenly by arc length across all subpaths.
function shapeTargets(paths, n) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const path of paths)
    for (const [x, y] of path) {
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
    }
  const s  = Math.min((W - PAD * 2) / (maxX - minX || 1), (H - PAD * 2) / (maxY - minY || 1))
  const ox = (W - (maxX - minX) * s) / 2 - minX * s
  const oy = (H - (maxY - minY) * s) / 2 - minY * s

  const segs = []
  let total = 0
  for (const path of paths)
    for (let i = 0; i < path.length - 1; i++) {
      const x1 = path[i][0] * s + ox,     y1 = path[i][1] * s + oy
      const x2 = path[i + 1][0] * s + ox, y2 = path[i + 1][1] * s + oy
      const len = Math.hypot(x2 - x1, y2 - y1)
      if (len === 0) continue
      segs.push({ x1, y1, x2, y2, len, start: total })
      total += len
    }

  const pts = []
  let si = 0
  for (let i = 0; i < n; i++) {
    const d = (i / n) * total
    while (si < segs.length - 1 && segs[si].start + segs[si].len < d) si++
    const g = segs[si]
    const t = Math.min(1, (d - g.start) / g.len)
    pts.push([g.x1 + (g.x2 - g.x1) * t, g.y1 + (g.y2 - g.y1) * t])
  }
  return pts
}

// ── component ────────────────────────────────────────────────────────
export default function LoaderParticles() {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const px = new Float32Array(N), py = new Float32Array(N)
    const tx = new Float32Array(N), ty = new Float32Array(N)
    const speed = new Float32Array(N)   // per-particle easing — organic morphs
    const size  = new Float32Array(N)
    const phase = new Float32Array(N)   // twinkle + breathing offset
    for (let i = 0; i < N; i++) {
      px[i] = Math.random() * W
      py[i] = Math.random() * H
      speed[i] = 0.045 + Math.random() * 0.05
      size[i]  = 1.1 + Math.random() * 1.0
      phase[i] = Math.random() * TAU
    }

    let idx = Math.floor(Math.random() * SHAPES.length)
    function setShape(shapeIdx) {
      const pts = shapeTargets(SHAPES[shapeIdx](), N)
      // random rotation of the index mapping — particles sweep along the
      // outline to their new posts instead of everyone moving in lockstep
      const off = Math.floor(Math.random() * N)
      for (let i = 0; i < N; i++) {
        tx[i] = pts[(i + off) % N][0]
        ty[i] = pts[(i + off) % N][1]
      }
    }
    setShape(idx)

    const iv = setInterval(() => {
      idx = (idx + 1 + Math.floor(Math.random() * (SHAPES.length - 1))) % SHAPES.length
      setShape(idx)
    }, SHAPE_MS)

    let animId
    function step(now) {
      animId = requestAnimationFrame(step)
      const t = now / 1000
      ctx.clearRect(0, 0, W, H)
      for (let i = 0; i < N; i++) {
        px[i] += (tx[i] - px[i]) * speed[i]
        py[i] += (ty[i] - py[i]) * speed[i]
        // subtle breathing so the settled shape stays alive
        const bx = Math.sin(t * 1.3 + phase[i]) * 1.1
        const by = Math.cos(t * 1.1 + phase[i]) * 1.1
        const alpha = 0.55 + 0.3 * Math.sin(t * 2 + phase[i])
        ctx.fillStyle = `rgba(223,230,236,${alpha})`
        ctx.beginPath()
        ctx.arc(px[i] + bx, py[i] + by, size[i], 0, TAU)
        ctx.fill()
      }
    }
    animId = requestAnimationFrame(step)

    return () => { cancelAnimationFrame(animId); clearInterval(iv) }
  }, [])

  return <canvas ref={ref} width={W} height={H} style={{ display: 'block' }} />
}
