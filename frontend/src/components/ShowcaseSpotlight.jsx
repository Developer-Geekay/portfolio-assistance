import { useState, useEffect, useRef, useCallback } from 'react'
import './ShowcaseSpotlight.css'

// Official and custom SVG icons tailored for each technology, achievement, and certification
function IconRenderer({ name, color }) {
  switch (name) {
    case 'outsystems':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <circle cx="12" cy="12" r="9.5" fill="none" stroke={color || '#ff3e5f'} strokeWidth="2.4" strokeDasharray="44 14" strokeLinecap="round" />
          <circle cx="12" cy="12" r="3.2" fill={color || '#ff3e5f'} />
        </svg>
      )
    case 'angular':
      return (
        <svg viewBox="0 0 250 250" width="22" height="22" aria-hidden="true">
          <polygon fill="#DD0031" points="125,30 125,30 125,30 31.9,63.2 46.1,186.3 125,230 125,230 125,230 203.9,186.3 218.1,63.2" />
          <polygon fill="#C3002F" points="125,30 125,52.2 125,52.1 125,153.4 125,153.4 125,230 125,230 203.9,186.3 218.1,63.2 125,30" />
          <polygon fill="#FFFFFF" points="125,52.1 66,182.6 87.9,182.6 99.8,153.4 150.2,153.4 162.1,182.6 184,182.6" />
          <polygon fill="#FFFFFF" points="125,90.4 138.8,124.6 111.2,124.6" />
        </svg>
      )
    case 'neutrinos':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={color || '#5b8def'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 3.5v17M3.5 12h17M8 8l8 8M16 8l-8 8" opacity="0.4" />
          <circle cx="12" cy="12" r="2.5" fill={color || '#5b8def'} />
        </svg>
      )
    case 'trophy':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={color || '#f59e0b'} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
          <path d="M4 4h16v7a8 8 0 0 1-16 0V4z" fill={color || '#f59e0b'} fillOpacity="0.15" />
          <path d="M12 15v4m-4 2h8" />
        </svg>
      )
    case 'speedometer':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={color || '#10b981'} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" opacity="0.4" />
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill={color || '#10b981'} fillOpacity="0.25" />
        </svg>
      )
    case 'devtools':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={color || '#38bdf8'} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="3" width="20" height="14" rx="2" fill={color || '#38bdf8'} fillOpacity="0.12" />
          <path d="M8 21h8m-4-4v4M7 8l3 3-3 3m5 0h4" />
        </svg>
      )
    case 'bentley':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={color || '#a855f7'} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 17L2 5l6 5 4-6 4 6 6-5-2 12H4z" fill={color || '#a855f7'} fillOpacity="0.15" />
          <path d="M3 20h18" />
        </svg>
      )
    case 'react':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={color || '#61dafb'} strokeWidth="1.5" aria-hidden="true">
          <ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(0 12 12)" />
          <ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(60 12 12)" />
          <ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(120 12 12)" />
          <circle cx="12" cy="12" r="1.8" fill={color || '#61dafb'} />
        </svg>
      )
    case 'mobile':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={color || '#38bdf8'} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="5" y="2" width="14" height="20" rx="3" fill={color || '#38bdf8'} fillOpacity="0.12" />
          <path d="M12 18h.01M9 6h6" />
        </svg>
      )
    case 'brain':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={color || '#10b981'} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2a4 4 0 0 1 4 4c0 .7-.2 1.4-.5 2h2.5a3 3 0 0 1 3 3c0 .8-.3 1.5-.8 2.1.5.6.8 1.3.8 2.1a3 3 0 0 1-3 3h-1a4 4 0 0 1-8 0H8a3 3 0 0 1-3-3c0-.8.3-1.5.8-2.1-.5-.6-.8-1.3-.8-2.1a3 3 0 0 1 3-3h2.5C10.2 7.4 10 6.7 10 6a4 4 0 0 1 4-4z" fill={color || '#10b981'} fillOpacity="0.15" />
        </svg>
      )
    case 'server':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={color || '#ec4899'} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="3" width="20" height="5" rx="1.5" />
          <rect x="2" y="10" width="20" height="5" rx="1.5" />
          <rect x="2" y="17" width="20" height="5" rx="1.5" />
          <circle cx="6" cy="5.5" r="1" fill={color || '#ec4899'} />
          <circle cx="6" cy="12.5" r="1" fill={color || '#ec4899'} />
          <circle cx="6" cy="19.5" r="1" fill={color || '#ec4899'} />
        </svg>
      )
    default:
      // Generic Rosette
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <circle cx="12" cy="9" r="6" fill="none" stroke={color || '#dfe6ec'} strokeWidth="1.8" />
          <circle cx="12" cy="9" r="2.4" fill={color || '#dfe6ec'} />
          <path d="M9 14l-1.5 6 4.5-2.5 4.5 2.5L15 14" fill="none" stroke={color || '#dfe6ec'} strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      )
  }
}

const CYCLE_MS = 4200

export default function ShowcaseSpotlight({ items = [], onClose }) {
  const [index, setIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const timerRef = useRef(null)

  // Reset index when items set changes
  useEffect(() => {
    setIndex(0)
  }, [items])

  const nextSlide = useCallback(() => {
    if (!items || items.length <= 1) return
    setIndex((prev) => (prev + 1) % items.length)
  }, [items])

  const prevSlide = useCallback(() => {
    if (!items || items.length <= 1) return
    setIndex((prev) => (prev - 1 + items.length) % items.length)
  }, [items])

  // Smooth auto-advancing carousel
  useEffect(() => {
    if (items.length <= 1 || isPaused) return
    timerRef.current = setInterval(nextSlide, CYCLE_MS)
    return () => clearInterval(timerRef.current)
  }, [items.length, isPaused, nextSlide, index])

  if (!items || items.length === 0) return null

  const current = items[index] || items[0]
  const accent = current.accent || '#38bdf8'

  return (
    <div
      className="showcase-spotlight"
      style={{ '--accent': accent }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      role="region"
      aria-label="Assistant Spotlight Showcase"
    >
      {/* Laser edge aura */}
      <div className="spotlight-edge-aura" aria-hidden="true" />

      {/* Header Bar */}
      <div className="spotlight-header">
        <div className="spotlight-beacon-wrap">
          <span className="spotlight-beacon" aria-hidden="true" />
          <span className="spotlight-cat">{current.categoryLabel || 'HIGHLIGHT'}</span>
        </div>

        <div className="spotlight-header-actions">
          {current.tag && <span className="spotlight-tag">{current.tag}</span>}
          {onClose && (
            <button className="spotlight-close" onClick={onClose} aria-label="Dismiss spotlight">
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Main Content Body */}
      <div className="spotlight-body" key={current.id || index}>
        <div className="spotlight-glyph-wrap" aria-hidden="true">
          <IconRenderer name={current.icon} color={accent} />
        </div>
        <div className="spotlight-text-wrap">
          <div className="spotlight-title">{current.label}</div>
          <div className="spotlight-sub">{current.sub}</div>
        </div>
      </div>

      {/* Bottom Footer with hairline progress and carousel navigation */}
      <div className="spotlight-footer">
        {items.length > 1 ? (
          <>
            <div className="spotlight-dots" aria-hidden="true">
              {items.map((it, i) => (
                <button
                  key={it.id || i}
                  className={`spotlight-dot${i === index ? ' active' : ''}`}
                  onClick={() => setIndex(i)}
                  aria-label={`Show ${it.label}`}
                />
              ))}
            </div>
            <div className="spotlight-nav">
              <button className="spotlight-arrow" onClick={prevSlide} aria-label="Previous item">‹</button>
              <span className="spotlight-counter">{index + 1} / {items.length}</span>
              <button className="spotlight-arrow" onClick={nextSlide} aria-label="Next item">›</button>
            </div>
          </>
        ) : (
          <span className="spotlight-verified">VERIFIED IN KNOWLEDGE BASE</span>
        )}
      </div>

      {/* Hairline progress track for cycle timing */}
      {items.length > 1 && !isPaused && (
        <div className="spotlight-progress-track" aria-hidden="true">
          <div className="spotlight-progress-bar" key={index} />
        </div>
      )}
    </div>
  )
}
