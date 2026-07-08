import { useState, useEffect, useCallback } from 'react'
import './Admin.css'

// Same-origin /api → backend (vite proxy in dev, nginx in prod)
const API_BASE = import.meta.env.VITE_API_BASE || '/api'

const ENDPOINTS = {
  stats:         'stats',
  leads:         'leads',
  sessions:      'sessions',
  conversations: 'conversations',
  unknown:       'unknown-queries',
}

const TABS = [
  { id: 'leads',         label: 'Leads' },
  { id: 'sessions',      label: 'Sessions' },
  { id: 'conversations', label: 'Conversations' },
  { id: 'unknown',       label: 'Unanswered' },
  { id: 'activity',      label: 'Activity' },
  { id: 'settings',      label: 'Settings' },
]

const when = (iso) => iso ? iso.replace('T', ' ').slice(0, 16) + ' UTC' : ''

export default function Admin() {
  const [key, setKey]         = useState(() => localStorage.getItem('assistant_admin_key') || '')
  const [data, setData]       = useState(null)
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const [tab, setTab]         = useState('leads')

  const load = useCallback(async (adminKey) => {
    if (!adminKey) return
    setLoading(true)
    setError('')
    try {
      const results = await Promise.all(
        Object.entries(ENDPOINTS).map(async ([name, path]) => {
          const res = await fetch(`${API_BASE}/${path}`, { headers: { 'X-Admin-Key': adminKey } })
          if (res.status === 403) throw new Error('Invalid admin key')
          if (res.status === 503) throw new Error('Admin endpoints disabled — set ADMIN_KEY on the server')
          if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
          return [name, await res.json()]
        })
      )
      setData(Object.fromEntries(results))
      localStorage.setItem('assistant_admin_key', adminKey)
    } catch (e) {
      setError(e.message)
      setData(null)
    }
    setLoading(false)
  }, [])

  // auto-load with a previously saved key
  useEffect(() => { if (key) load(key) }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="admin">
      <h1>Assistant Admin</h1>
      <p className="admin-sub">Leads &amp; analytics — data loads only with a valid admin key</p>

      <div className="admin-keybar">
        <input
          type="password"
          placeholder="Admin key"
          value={key}
          autoComplete="off"
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') load(key) }}
        />
        <button className="primary" onClick={() => load(key)} disabled={loading}>
          {loading ? 'Loading…' : data ? 'Refresh' : 'Load'}
        </button>
      </div>

      {error && <p className="admin-err">{error}</p>}

      {data && (
        <>
          <div className="admin-cards">
            <StatCard num={data.stats.sessions} label="Sessions" />
            <StatCard num={data.stats.turns}    label="Conversation turns" />
            <StatCard num={data.stats.leads}    label="Leads captured" tone="good" />
            <StatCard num={data.stats.unknown}  label="Unanswered questions" tone="warn" />
          </div>

          <div className="admin-tabs">
            {TABS.map(t => (
              <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="admin-panel">
            {tab === 'leads'         && <Leads rows={data.leads} />}
            {tab === 'sessions'      && <Sessions rows={data.sessions} />}
            {tab === 'conversations' && <Conversations rows={data.conversations} />}
            {tab === 'unknown'       && <Unknown rows={data.unknown} />}
            {tab === 'activity'      && <Activity stats={data.stats} />}
            {tab === 'settings'      && <Settings adminKey={key} />}
          </div>
        </>
      )}
    </div>
  )
}

function StatCard({ num, label, tone }) {
  return (
    <div className={`admin-card${tone ? ' ' + tone : ''}`}>
      <div className="num">{num}</div>
      <div className="lbl">{label}</div>
    </div>
  )
}

function Empty({ children }) {
  return <div className="admin-empty">{children}</div>
}

function Leads({ rows }) {
  if (!rows.length) return <Empty>No leads yet — visitors who share an email or phone number appear here.</Empty>
  return (
    <table>
      <thead><tr><th>When</th><th>Email</th><th>Phone</th><th>Message</th><th>IP</th></tr></thead>
      <tbody>
        {rows.map((l, i) => (
          <tr key={i}>
            <td className="mono">{when(l.at)}</td>
            <td>{l.email ? <a className="lead-mail" href={`mailto:${l.email}`}>{l.email}</a> : '–'}</td>
            <td>{l.phone || '–'}</td>
            <td className="a">{l.message}</td>
            <td className="mono">{l.ip}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Sessions({ rows }) {
  if (!rows.length) return <Empty>No sessions recorded yet.</Empty>
  return (
    <table>
      <thead><tr><th>Last activity</th><th>Session</th><th>Device</th><th>Turns</th><th>Started</th><th>IP</th></tr></thead>
      <tbody>
        {rows.map((s, i) => (
          <tr key={i}>
            <td className="mono">{when(s.last)}</td>
            <td className="mono">{s.session.slice(0, 8)}</td>
            <td>{s.device || 'Unknown'}</td>
            <td>{s.turns}</td>
            <td className="mono">{when(s.started)}</td>
            <td className="mono">{s.ip}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Conversations({ rows }) {
  if (!rows.length) return <Empty>No conversations yet.</Empty>
  return (
    <table>
      <thead><tr><th>When</th><th>Intent</th><th>Question</th><th>Answer</th><th>Session</th></tr></thead>
      <tbody>
        {rows.map((c, i) => (
          <tr key={i}>
            <td className="mono">{when(c.at)}</td>
            <td><span className={`pill ${c.intent}`}>{c.intent}</span></td>
            <td className="q">{c.question}</td>
            <td className="a">{c.answer}</td>
            <td className="mono">{c.session.slice(0, 8)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Unknown({ rows }) {
  if (!rows.length) return <Empty>Nothing here — the assistant answered everything it was asked.</Empty>
  return (
    <table>
      <thead><tr><th>When</th><th>Question the assistant could not answer</th></tr></thead>
      <tbody>
        {rows.map((u, i) => (
          <tr key={i}>
            <td className="mono">{when(u.at)}</td>
            <td className="q">{u.question}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Activity({ stats }) {
  const dayMax    = Math.max(1, ...stats.daily.map(d => d.turns))
  const intentMax = Math.max(1, ...stats.intents.map(i => i.count))
  return (
    <>
      <table>
        <thead><tr><th colSpan={3}>Daily activity (last 14 days)</th></tr></thead>
        <tbody>
          {stats.daily.map((d, i) => (
            <tr key={i}>
              <td className="mono">{d.day}</td>
              <td><span className="bar" style={{ width: Math.round(d.turns / dayMax * 160) }} />{d.turns} turns</td>
              <td>{d.sessions} sessions</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table>
        <thead><tr><th colSpan={2}>Intent breakdown</th></tr></thead>
        <tbody>
          {stats.intents.map((it, i) => (
            <tr key={i}>
              <td><span className={`pill ${it.intent}`}>{it.intent}</span></td>
              <td><span className="bar" style={{ width: Math.round(it.count / intentMax * 160) }} />{it.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function Settings({ adminKey }) {
  const [whisperMode, setWhisperMode] = useState('backend')
  const [piperMode, setPiperMode] = useState('backend')
  const [piperVoice, setPiperVoice] = useState('en_US-amy-medium')
  const [voices, setVoices] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [downloads, setDownloads] = useState({})
  const [activePolls, setActivePolls] = useState(new Set())

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/settings`)
      const data = await res.json()
      setWhisperMode(data.whisper_mode)
      setPiperMode(data.piper_mode)
      setPiperVoice(data.piper_voice)
      setVoices(data.voices || [])
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  useEffect(() => {
    const intervals = {}

    const checkAndStartPoll = async (v) => {
      // Check if it is currently downloading on the server
      try {
        const res = await fetch(`${API_BASE}/voices/download-progress?voice=${v.id}`)
        const data = await res.json()
        if (data.downloading || activePolls.has(v.id)) {
          startPolling(v.id)
        }
      } catch (e) {
        console.error(e)
      }
    }

    const startPolling = (voiceId) => {
      if (intervals[voiceId]) return
      const check = async () => {
        try {
          const res = await fetch(`${API_BASE}/voices/download-progress?voice=${voiceId}`)
          const data = await res.json()
          if (data.downloading) {
            setDownloads(prev => ({ ...prev, [voiceId]: data.progress }))
          } else if (data.downloaded) {
            setDownloads(prev => {
              const next = { ...prev }
              delete next[voiceId]
              return next
            })
            setActivePolls(prev => {
              const next = new Set(prev)
              next.delete(voiceId)
              return next
            })
            loadSettings()
            clearInterval(intervals[voiceId])
            delete intervals[voiceId]
          } else {
            // Stopped / failed
            clearInterval(intervals[voiceId])
            delete intervals[voiceId]
          }
        } catch (e) {
          console.error(e)
        }
      }
      check()
      intervals[voiceId] = setInterval(check, 2000)
    }

    voices.forEach(v => {
      if (!v.downloaded) {
        checkAndStartPoll(v)
      }
    })

    return () => {
      Object.values(intervals).forEach(clearInterval)
    }
  }, [voices, loadSettings, activePolls])

  const save = async () => {
    setLoading(true)
    setMessage('')
    try {
      const res = await fetch(`${API_BASE}/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': adminKey
        },
        body: JSON.stringify({
          whisper_mode: whisperMode,
          piper_mode: piperMode,
          piper_voice: piperVoice
        })
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setMessage('Settings saved successfully!')
      loadSettings()
    } catch (e) {
      setMessage(`Error: ${e.message}`)
    }
    setLoading(false)
  }

  const triggerDownload = async (voiceId) => {
    try {
      await fetch(`${API_BASE}/voices/download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ voice: voiceId })
      })
      setActivePolls(prev => {
        const next = new Set(prev)
        next.add(voiceId)
        return next
      })
      setVoices(prev => prev.map(v => v.id === voiceId ? { ...v, downloaded: false } : v))
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div className="admin-settings">
      <h2>System Configuration</h2>
      {message && <p className="settings-msg">{message}</p>}
      
      <div className="settings-group">
        <label>Whisper Speech-to-Text Location</label>
        <div className="radio-options">
          <label>
            <input
              type="radio"
              name="whisper_mode"
              value="backend"
              checked={whisperMode === 'backend'}
              onChange={() => setWhisperMode('backend')}
            />
            Backend Server (Pi CPU)
          </label>
          <label>
            <input
              type="radio"
              name="whisper_mode"
              value="wasm"
              checked={whisperMode === 'wasm'}
              onChange={() => setWhisperMode('wasm')}
            />
            Browser WASM (Client)
          </label>
        </div>
      </div>

      <div className="settings-group">
        <label>Piper Text-to-Speech Location</label>
        <div className="radio-options">
          <label>
            <input
              type="radio"
              name="piper_mode"
              value="backend"
              checked={piperMode === 'backend'}
              onChange={() => setPiperMode('backend')}
            />
            Backend Server (Pi CPU)
          </label>
          <label>
            <input
              type="radio"
              name="piper_mode"
              value="wasm"
              checked={piperMode === 'wasm'}
              onChange={() => setPiperMode('wasm')}
            />
            Browser WASM (Client)
          </label>
        </div>
      </div>

      <div className="settings-group">
        <label>Default Server Voice Model</label>
        <select
          value={piperVoice}
          onChange={(e) => setPiperVoice(e.target.value)}
          className="voice-select-admin"
        >
          {voices.map(v => (
            <option key={v.id} value={v.id}>
              {v.name} {!v.downloaded ? '(Not Downloaded)' : ''}
            </option>
          ))}
        </select>
      </div>

      <button className="primary" onClick={save} disabled={loading}>
        {loading ? 'Saving…' : 'Save Settings'}
      </button>

      <h3 style={{ marginTop: '32px' }}>Voice Model Status (Backend)</h3>
      <table className="voices-status-table">
        <thead>
          <tr>
            <th>Voice Model</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {voices.map(v => {
            const pct = downloads[v.id]
            const isDownloading = pct !== undefined
            return (
              <tr key={v.id}>
                <td className="mono">{v.id}</td>
                <td>
                  {v.downloaded ? (
                    <span className="pill greeting">Ready</span>
                  ) : isDownloading ? (
                    <span className="pill personal">Downloading ({pct}%)</span>
                  ) : (
                    <span className="pill unknown">Not Available</span>
                  )}
                </td>
                <td>
                  {!v.downloaded && (
                    <button
                      className="admin-download-btn"
                      disabled={isDownloading}
                      onClick={() => triggerDownload(v.id)}
                    >
                      {isDownloading ? `Downloading...` : 'Download to Backend'}
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
