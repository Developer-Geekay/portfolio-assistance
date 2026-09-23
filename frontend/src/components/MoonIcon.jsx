// MoonIcon.jsx — Vector fallback icons

export function MoonIcon({ name, color }) {
  switch (name) {
    case 'outsystems':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <circle cx="12" cy="12" r="9.5" fill="none" stroke={color || '#ff2400'} strokeWidth="2.4" strokeDasharray="44 14" strokeLinecap="round" />
          <circle cx="12" cy="12" r="3.2" fill={color || '#ff2400'} />
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
