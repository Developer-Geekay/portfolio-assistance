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
  { id: 'knowledge',     label: 'Knowledge' },
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

  const logout = useCallback(() => {
    setKey('')
    setData(null)
    setError('')
    localStorage.removeItem('assistant_admin_key')
  }, [])

  // auto-load with a previously saved key
  useEffect(() => { if (key) load(key) }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  // ── login screen ──────────────────────────────────────────────────────────
  if (!data) {
    return (
      <div className="admin admin-lock">
        <div className="admin-login-box">
          <div className="login-brand">AI Admin</div>
          <p className="admin-sub">Enter your admin key to unlock analytics &amp; leads</p>
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
              {loading ? 'Loading…' : 'Unlock'}
            </button>
          </div>
          {error && <p className="admin-err">{error}</p>}
        </div>
      </div>
    )
  }

  // ── dashboard ──────────────────────────────────────────────────────────────
  return (
    <div className="admin">
      <aside className="admin-sidebar">
        <div className="sidebar-brand">AI Admin</div>
        <nav className="sidebar-nav">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`sidebar-link${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="sidebar-logout" onClick={logout}>Logout</button>
        </div>
      </aside>

      <div className="admin-body">
        <div className="admin-cards">
          <StatCard num={data.stats.sessions} label="Sessions" />
          <StatCard num={data.stats.turns}    label="Turns" />
          <StatCard num={data.stats.leads}    label="Leads" tone="good" />
          <StatCard num={data.stats.unknown}  label="Unanswered" tone="warn" />
        </div>

        <div className="admin-panel">
          {tab === 'leads'         && <Leads rows={data.leads} />}
          {tab === 'sessions'      && <Sessions rows={data.sessions} />}
          {tab === 'conversations' && <Conversations rows={data.conversations} />}
          {tab === 'unknown'       && <Unknown rows={data.unknown} />}
          {tab === 'activity'      && <Activity stats={data.stats} />}
          {tab === 'knowledge'     && <Knowledge adminKey={key} />}
          {tab === 'settings'      && <Settings adminKey={key} />}
        </div>
      </div>
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
      <thead><tr><th>When</th><th>Email</th><th>Phone</th><th>Message</th><th className="hide-sm">IP</th></tr></thead>
      <tbody>
        {rows.map((l, i) => (
          <tr key={i}>
            <td className="mono">{when(l.at)}</td>
            <td>{l.email ? <a className="lead-mail" href={`mailto:${l.email}`}>{l.email}</a> : '–'}</td>
            <td className="nowrap">{l.phone || '–'}</td>
            <td className="a clamp">{l.message}</td>
            <td className="mono hide-sm">{l.ip}</td>
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
      <thead><tr><th>Last activity</th><th className="hide-sm">Session</th><th>Device</th><th>Turns</th><th className="hide-sm">Started</th><th className="hide-sm">IP</th></tr></thead>
      <tbody>
        {rows.map((s, i) => (
          <tr key={i}>
            <td className="mono">{when(s.last)}</td>
            <td className="mono hide-sm">{s.session.slice(0, 8)}</td>
            <td>{s.device || 'Unknown'}</td>
            <td>{s.turns}</td>
            <td className="mono hide-sm">{when(s.started)}</td>
            <td className="mono hide-sm">{s.ip}</td>
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
      <thead><tr><th className="hide-sm">When</th><th>Intent</th><th>Question</th><th className="hide-sm">Answer</th><th className="hide-sm">Session</th></tr></thead>
      <tbody>
        {rows.map((c, i) => (
          <tr key={i}>
            <td className="mono hide-sm">{when(c.at)}</td>
            <td><span className={`pill ${c.intent}`}>{c.intent}</span></td>
            <td className="q clamp">{c.question}</td>
            <td className="a clamp hide-sm">{c.answer}</td>
            <td className="mono hide-sm">{c.session.slice(0, 8)}</td>
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
              <td className="hide-sm">{d.sessions} sessions</td>
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

// ── Knowledge base manager ────────────────────────────────────────────────────

const BLANK = { id: '', topic: '', fact: '' }

function Knowledge({ adminKey }) {
  const [entries, setEntries]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [activeTopic, setActive]  = useState('all')
  const [form, setForm]           = useState(BLANK)
  const [editing, setEditing]     = useState(false)   // true = edit mode
  const [busy, setBusy]           = useState(false)
  const [msg, setMsg]             = useState(null)    // { text, ok }
  const [deleteId, setDeleteId]   = useState(null)    // id pending confirm

  const headers = { 'X-Admin-Key': adminKey, 'Content-Type': 'application/json' }

  const loadKb = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/kb`, { headers })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setEntries(data)
    } catch (e) {
      setMsg({ text: e.message, ok: false })
    }
    setLoading(false)
  }, [adminKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadKb() }, [loadKb])

  const topics = ['all', ...Array.from(new Set(entries.map(e => e.topic))).sort()]
  const visible = activeTopic === 'all' ? entries : entries.filter(e => e.topic === activeTopic)

  const flash = (text, ok = true) => {
    setMsg({ text, ok })
    setTimeout(() => setMsg(null), 3500)
  }

  const openAdd = () => {
    setForm({ ...BLANK, topic: activeTopic === 'all' ? '' : activeTopic })
    setEditing(false)
  }

  const openEdit = (entry) => {
    setForm({ id: entry.id, topic: entry.topic, fact: entry.fact })
    setEditing(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const cancelForm = () => setForm(BLANK)

  const save = async () => {
    if (!form.topic.trim() || !form.fact.trim()) {
      flash('Topic and fact are required.', false)
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`${API_BASE}/kb`, {
        method: 'POST',
        headers,
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      flash(`${data.action === 'updated' ? 'Updated' : 'Added'} — engine reloaded (${data.total} facts)`)
      setForm(BLANK)
      await loadKb()
    } catch (e) {
      flash(e.message, false)
    }
    setBusy(false)
  }

  const confirmDelete = async (id) => {
    if (deleteId !== id) { setDeleteId(id); return }
    setBusy(true)
    setDeleteId(null)
    try {
      const res = await fetch(`${API_BASE}/kb/${encodeURIComponent(id)}`, { method: 'DELETE', headers })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      flash(`Deleted — engine reloaded (${data.total} facts)`)
      if (form.id === id) setForm(BLANK)
      await loadKb()
    } catch (e) {
      flash(e.message, false)
    }
    setBusy(false)
  }

  const isFormOpen = form.topic !== '' || form.fact !== '' || form.id !== ''

  return (
    <div className="kb-manager">

      {/* ── top bar ── */}
      <div className="kb-topbar">
        <div className="kb-title-row">
          <h2>Knowledge Base</h2>
          <span className="kb-count">{entries.length} facts</span>
        </div>
        {msg && <p className={`kb-msg${msg.ok ? '' : ' kb-msg-err'}`}>{msg.text}</p>}
      </div>

      {/* ── add / edit form ── */}
      <div className={`kb-form-wrap${isFormOpen ? ' open' : ''}`}>
        <div className="kb-form-header">
          <span>{editing ? `Editing ${form.id}` : 'New entry'}</span>
          {isFormOpen && <button className="kb-cancel" onClick={cancelForm}>✕</button>}
        </div>
        <div className="kb-form-fields">
          <div className="kb-field-row">
            <div className="kb-field">
              <label>ID <span className="kb-optional">(leave blank to auto-generate)</span></label>
              <input
                value={form.id}
                onChange={e => setForm(f => ({ ...f, id: e.target.value }))}
                placeholder="kb_001"
                disabled={editing}
              />
            </div>
            <div className="kb-field">
              <label>Topic / Category</label>
              <input
                list="kb-topics-list"
                value={form.topic}
                onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
                placeholder="career, projects, skills…"
              />
              <datalist id="kb-topics-list">
                {topics.filter(t => t !== 'all').map(t => <option key={t} value={t} />)}
              </datalist>
            </div>
          </div>
          <div className="kb-field">
            <label>Fact</label>
            <textarea
              value={form.fact}
              onChange={e => setForm(f => ({ ...f, fact: e.target.value }))}
              placeholder="Write the factual statement in third-person…"
              rows={3}
            />
          </div>
          <div className="kb-form-actions">
            <button className="primary" onClick={save} disabled={busy || !form.topic || !form.fact}>
              {busy ? 'Saving…' : editing ? 'Update entry' : 'Add entry'}
            </button>
            {isFormOpen && <button className="kb-btn-secondary" onClick={cancelForm}>Cancel</button>}
          </div>
        </div>
      </div>

      {/* ── topic filter tabs ── */}
      <div className="kb-topic-tabs">
        {topics.map(t => (
          <button
            key={t}
            className={`kb-topic-tab${activeTopic === t ? ' active' : ''}`}
            onClick={() => setActive(t)}
          >
            {t === 'all' ? 'All' : t}
            <span className="kb-topic-count">
              {t === 'all' ? entries.length : entries.filter(e => e.topic === t).length}
            </span>
          </button>
        ))}
        {!isFormOpen && (
          <button className="kb-add-btn" onClick={openAdd}>+ Add</button>
        )}
      </div>

      {/* ── entries list ── */}
      {loading ? (
        <div className="admin-empty">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="admin-empty">No entries in this topic.</div>
      ) : (
        <div className="kb-list">
          {visible.map(entry => (
            <div key={entry.id} className={`kb-row${form.id === entry.id ? ' kb-row-active' : ''}`}>
              <div className="kb-row-meta">
                <span className={`pill ${entry.topic}`}>{entry.topic}</span>
                <span className="kb-row-id">{entry.id}</span>
              </div>
              <p className="kb-row-fact">{entry.fact}</p>
              <div className="kb-row-actions">
                <button className="kb-edit-btn" onClick={() => openEdit(entry)}>Edit</button>
                <button
                  className={`kb-del-btn${deleteId === entry.id ? ' confirm' : ''}`}
                  onClick={() => confirmDelete(entry.id)}
                  onBlur={() => setDeleteId(null)}
                  disabled={busy}
                >
                  {deleteId === entry.id ? 'Confirm delete' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
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
  const [clearConfirm, setClearConfirm] = useState(false)
  const [dbBusy, setDbBusy] = useState(false)

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

  const exportDb = async () => {
    setDbBusy(true)
    try {
      const res = await fetch(`${API_BASE}/db/export`, { headers: { 'X-Admin-Key': adminKey } })
      if (!res.ok) throw new Error(`Export failed: HTTP ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `assistant_db_${new Date().toISOString().slice(0, 10)}.db`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setMessage(`Export error: ${e.message}`)
    }
    setDbBusy(false)
  }

  const clearDb = async () => {
    if (!clearConfirm) { setClearConfirm(true); return }
    setDbBusy(true)
    setClearConfirm(false)
    try {
      const res = await fetch(`${API_BASE}/db/clear`, {
        method: 'POST',
        headers: { 'X-Admin-Key': adminKey },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setMessage('Database cleared — conversations, leads, and unknown queries deleted.')
    } catch (e) {
      setMessage(`Clear error: ${e.message}`)
    }
    setDbBusy(false)
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
            Backend Server
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
            Backend Server
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

      <div className="db-section">
        <h3>Database</h3>
        <p className="db-desc">Export a snapshot of all data, or wipe conversations and leads.</p>
        <div className="db-actions">
          <button onClick={exportDb} disabled={dbBusy} className="db-btn">
            {dbBusy ? 'Exporting…' : 'Export DB'}
          </button>
          <button
            onClick={clearDb}
            disabled={dbBusy}
            className={`db-btn db-btn-danger${clearConfirm ? ' confirm' : ''}`}
            onBlur={() => setClearConfirm(false)}
          >
            {clearConfirm ? 'Confirm — this cannot be undone' : 'Clear DB'}
          </button>
        </div>
      </div>

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
