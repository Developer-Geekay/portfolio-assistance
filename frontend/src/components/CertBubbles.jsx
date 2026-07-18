import { ISSUER_COLORS } from '../lib/responseCues'
import './CertBubbles.css'

function Rosette({ color }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle cx="12" cy="9" r="6" fill="none" stroke={color} strokeWidth="1.6" />
      <circle cx="12" cy="9" r="2.4" fill={color} />
      <path d="M9 14l-1.5 6 4.5-2.5 4.5 2.5L15 14" fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

// Renders certification badges that rise from the bottom and fade in/out.
// The parent keys this element by runId so a new answer replaces the group.
export default function CertBubbles({ certs }) {
  if (!certs || certs.length === 0) return null

  return (
    <div className="cert-bubbles" aria-hidden="true">
      {certs.map((c, i) => {
        const color = ISSUER_COLORS[c.issuer] || '#dfe6ec'
        // spread bubbles horizontally, small deterministic jitter per index
        const left = 12 + (i * 76) / Math.max(1, certs.length - 1 || 1)
        const drift = (i % 2 === 0 ? 1 : -1) * (4 + (i % 3) * 3)
        return (
          <div
            key={c.id}
            className="cert-bubble"
            style={{
              left: `${Math.min(84, left)}%`,
              '--x': `${drift}px`,
              '--accent': color,
              animationDelay: `${i * 0.5}s`,
            }}
          >
            <span className="cert-bubble-glyph"><Rosette color={color} /></span>
            <span className="cert-bubble-text">
              <span className="cert-bubble-label">{c.label}</span>
              <span className="cert-bubble-sub">{c.sub}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
