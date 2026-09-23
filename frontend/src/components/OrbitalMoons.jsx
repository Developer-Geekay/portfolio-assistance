// OrbitalMoons.jsx — Earth & Satellites Cosmic Showcase
// The center particle sphere is "Earth". Contextual certifications, achievements, and tech
// emerge as aerospace glass satellites deployed into orbit on the East and West flanks of the Earth.

import { useState } from 'react'
import './OrbitalMoons.css'
import { MoonIcon } from './MoonIcon'

export default function OrbitalMoons({ items = [], isExiting = false, onClose }) {
  const [hoveredId, setHoveredId] = useState(null)

  if (!items || items.length === 0) return null

  // Limit to max 6 satellites (3 West flank, 3 East flank)
  const displayItems = items.slice(0, 6)

  // Split into West (left) and East (right) orbital arrays
  const westItems = []
  const eastItems = []

  displayItems.forEach((it, idx) => {
    if (idx % 2 === 0) {
      westItems.push(it)
    } else {
      eastItems.push(it)
    }
  })

  // Calibrate Y vertical offsets for each flank on desktop and mobile.
  // Mobile offsets are intentionally staggered between West and East
  // so items on opposite flanks never share the same horizontal band or collide!
  const getWestYOffsets = (index, total) => {
    if (total === 1) return { desktop: 0, mobile: -165 }
    if (total === 2) {
      return index === 0
        ? { desktop: -70, mobile: -165 }
        : { desktop: 70, mobile: 125 }
    }
    // total === 3
    if (index === 0) return { desktop: -115, mobile: -168 }
    if (index === 1) return { desktop: 0, mobile: 120 }
    return { desktop: 115, mobile: 182 }
  }

  const getEastYOffsets = (index, total) => {
    if (total === 1) return { desktop: 0, mobile: -112 }
    if (total === 2) {
      return index === 0
        ? { desktop: -70, mobile: -112 }
        : { desktop: 70, mobile: 155 }
    }
    // total === 3
    if (index === 0) return { desktop: -115, mobile: -115 }
    if (index === 1) return { desktop: 0, mobile: 152 }
    return { desktop: 115, mobile: 215 }
  }

  return (
    <div className={`orbital-moons-system${isExiting ? ' exiting' : ''}`} aria-label="Orbital Tech Satellites">
      {/* Visual orbital aura rings */}
      <div className="orbit-aura-ring orbit-aura-inner" aria-hidden="true" />
      <div className="orbit-aura-ring orbit-aura-outer" aria-hidden="true" />

      {/* West Flank (Left of Earth) */}
      {westItems.map((item, i) => {
        const yOff = getWestYOffsets(i, westItems.length)
        const accent = item.accent || '#ff2400'
        const delay = (i * 0.20 + 0.08).toFixed(2)
        const driftDelay = (i * 1.5).toFixed(1)

        return (
          <div
            key={item.id || `west-${i}`}
            className={`orbital-satellite flank-west${hoveredId === item.id ? ' hovered' : ''}`}
            style={{
              '--y-off': `${yOff.desktop}px`,
              '--y-off-mobile': `${yOff.mobile}px`,
              '--accent': accent,
              '--delay': `${delay}s`,
              '--drift-delay': `${driftDelay}s`,
              '--dir-x': -1,
            }}
            onMouseEnter={() => setHoveredId(item.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            {/* Fused Aerospace Glass Capsule (text on outer left) */}
            <div className="satellite-capsule">
              <div className="satellite-meta">
                <span className="satellite-dot" aria-hidden="true" />
                <span className="satellite-tag">{item.tag || item.categoryLabel}</span>
              </div>
              <div className="satellite-title">{item.label}</div>
            </div>

            {/* Satellite Orb Node with Real Brand Logo (inner, towards Earth) */}
            <div className="satellite-orb">
              <div className="satellite-halo" aria-hidden="true" />
              {item.image ? (
                <img
                  src={item.image}
                  alt={item.label}
                  className="satellite-real-img"
                  loading="eager"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                    if (e.currentTarget.nextElementSibling) {
                      e.currentTarget.nextElementSibling.style.display = 'flex'
                    }
                  }}
                />
              ) : null}
              <div className="satellite-fallback-icon" style={{ display: item.image ? 'none' : 'flex' }}>
                <MoonIcon name={item.icon} color={accent} />
              </div>
            </div>

            {/* Subtle trajectory beam pointing towards Earth */}
            <div className="satellite-trajectory" aria-hidden="true" />
          </div>
        )
      })}

      {/* East Flank (Right of Earth) */}
      {eastItems.map((item, i) => {
        const yOff = getEastYOffsets(i, eastItems.length)
        const accent = item.accent || '#38bdf8'
        const delay = (i * 0.20 + 0.18).toFixed(2)
        const driftDelay = (i * 1.5 + 0.8).toFixed(1)

        return (
          <div
            key={item.id || `east-${i}`}
            className={`orbital-satellite flank-east${hoveredId === item.id ? ' hovered' : ''}`}
            style={{
              '--y-off': `${yOff.desktop}px`,
              '--y-off-mobile': `${yOff.mobile}px`,
              '--accent': accent,
              '--delay': `${delay}s`,
              '--drift-delay': `${driftDelay}s`,
              '--dir-x': 1,
            }}
            onMouseEnter={() => setHoveredId(item.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            {/* Subtle trajectory beam pointing from Earth */}
            <div className="satellite-trajectory" aria-hidden="true" />

            {/* Satellite Orb Node with Real Brand Logo (inner, towards Earth) */}
            <div className="satellite-orb">
              <div className="satellite-halo" aria-hidden="true" />
              {item.image ? (
                <img
                  src={item.image}
                  alt={item.label}
                  className="satellite-real-img"
                  loading="eager"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                    if (e.currentTarget.nextElementSibling) {
                      e.currentTarget.nextElementSibling.style.display = 'flex'
                    }
                  }}
                />
              ) : null}
              <div className="satellite-fallback-icon" style={{ display: item.image ? 'none' : 'flex' }}>
                <MoonIcon name={item.icon} color={accent} />
              </div>
            </div>

            {/* Fused Aerospace Glass Capsule (text on outer right) */}
            <div className="satellite-capsule">
              <div className="satellite-meta">
                <span className="satellite-dot" aria-hidden="true" />
                <span className="satellite-tag">{item.tag || item.categoryLabel}</span>
              </div>
              <div className="satellite-title">{item.label}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
