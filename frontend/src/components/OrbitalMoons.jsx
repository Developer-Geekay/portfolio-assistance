// OrbitalMoons.jsx — Earth & Moons Orbital Showcase
// The center particle sphere is "Earth"; contextual tech, certs & achievements pop up
// as celestial satellites ("Moons") orbiting around it with staggered delays,
// glowing haloes, and gentle cosmic drift, vanishing gracefully after a delay.

import { useState, useEffect, useRef } from 'react'
import './OrbitalMoons.css'

export function MoonIcon({ name, color }) {
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
          <path d="M4 4h16v7a8 8 0 0 1-16 0V4z" fill={color || '#f59e0b'} fillOpacity="0.2" />
          <path d="M12 15v4m-4 2h8" />
        </svg>
      )
    case 'speedometer':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={color || '#10b981'} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" opacity="0.4" />
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill={color || '#10b981'} fillOpacity="0.3" />
        </svg>
      )
    case 'devtools':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={color || '#38bdf8'} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="3" width="20" height="14" rx="2" fill={color || '#38bdf8'} fillOpacity="0.15" />
          <path d="M8 21h8m-4-4v4M7 8l3 3-3 3m5 0h4" />
        </svg>
      )
    case 'bentley':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={color || '#a855f7'} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 17L2 5l6 5 4-6 4 6 6-5-2 12H4z" fill={color || '#a855f7'} fillOpacity="0.2" />
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
          <rect x="5" y="2" width="14" height="20" rx="3" fill={color || '#38bdf8'} fillOpacity="0.15" />
          <path d="M12 18h.01M9 6h6" />
        </svg>
      )
    case 'brain':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={color || '#10b981'} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2a4 4 0 0 1 4 4c0 .7-.2 1.4-.5 2h2.5a3 3 0 0 1 3 3c0 .8-.3 1.5-.8 2.1.5.6.8 1.3.8 2.1a3 3 0 0 1-3 3h-1a4 4 0 0 1-8 0H8a3 3 0 0 1-3-3c0-.8.3-1.5.8-2.1-.5-.6-.8-1.3-.8-2.1a3 3 0 0 1 3-3h2.5C10.2 7.4 10 6.7 10 6a4 4 0 0 1 4-4z" fill={color || '#10b981'} fillOpacity="0.2" />
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
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <circle cx="12" cy="9" r="6" fill="none" stroke={color || '#dfe6ec'} strokeWidth="1.8" />
          <circle cx="12" cy="9" r="2.4" fill={color || '#dfe6ec'} />
          <path d="M9 14l-1.5 6 4.5-2.5 4.5 2.5L15 14" fill="none" stroke={color || '#dfe6ec'} strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      )
  }
}

// Preset non-overlapping orbital sectors around the Earth (avoiding the bottom transcript area)
// Angles in degrees (-180 to 180, where -90 is top, 0 is right, 180 is left, 90 is bottom)
const ORBITAL_PRESETS = {
  1: [-90],
  2: [-135, -45],
  3: [-145, -90, -35],
  4: [-155, -110, -70, -25],
  5: [-160, -125, -90, -55, -20],
  6: [-165, -130, -95, -60, -30, 5],
}

export default function OrbitalMoons({ items = [], isExiting = false, onClose }) {
  const [activeMoonId, setActiveMoonId] = useState(null)
  const count = Math.min(items.length, 6)
  const angles = ORBITAL_PRESETS[count] || ORBITAL_PRESETS[5]

  if (!items || items.length === 0) return null

  return (
    <div className={`orbital-moons-system${isExiting ? ' exiting' : ''}`} aria-label="Orbital Showcase">
      {/* Decorative cosmic orbital tracks */}
      <div className="orbital-track-primary" aria-hidden="true" />
      <div className="orbital-track-secondary" aria-hidden="true" />

      {items.slice(0, 6).map((item, i) => {
        const deg = angles[i] ?? (-140 + i * 40)
        const rad = (deg * Math.PI) / 180

        // Responsive orbital radiuses (relative coordinates set as CSS vars)
        // Desktop default: ~240px; Mobile will scale down via CSS calc()
        const cos = Math.cos(rad)
        const sin = Math.sin(rad)
        const accent = item.accent || '#38bdf8'
        const delaySec = (i * 0.28).toFixed(2)

        return (
          <div
            key={item.id || i}
            className={`orbital-moon${activeMoonId === item.id ? ' hovered' : ''}`}
            style={{
              '--cos': cos,
              '--sin': sin,
              '--accent': accent,
              '--delay': `${delaySec}s`,
            }}
            onMouseEnter={() => setActiveMoonId(item.id)}
            onMouseLeave={() => setActiveMoonId(null)}
          >
            {/* Subtle beam tether connecting towards center sphere */}
            <div className="moon-tether" aria-hidden="true" />

            {/* Glowing Moon Sphere */}
            <div className="moon-orb-wrap">
              <div className="moon-ring-halo" aria-hidden="true" />
              <div className="moon-glyph">
                <MoonIcon name={item.icon} color={accent} />
              </div>
            </div>

            {/* Floating Info Capsule */}
            <div className="moon-capsule">
              <div className="moon-meta">
                <span className="moon-dot" aria-hidden="true" />
                <span className="moon-tag">{item.tag || item.categoryLabel}</span>
              </div>
              <div className="moon-title">{item.label}</div>
              <div className="moon-sub">{item.sub}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
