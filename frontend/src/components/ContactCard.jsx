import { CONTACT } from '../lib/responseCues'
import './ContactCard.css'

function Row({ href, icon, label, value }) {
  return (
    <a className="contact-row" href={href} target="_blank" rel="noopener noreferrer">
      <span className="contact-icon" aria-hidden="true">{icon}</span>
      <span className="contact-meta">
        <span className="contact-label">{label}</span>
        <span className="contact-value">{value}</span>
      </span>
      <span className="contact-arrow" aria-hidden="true">→</span>
    </a>
  )
}

const EmailIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
)
const LinkedInIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4.98 3.5A2.5 2.5 0 1 0 5 8.5a2.5 2.5 0 0 0-.02-5zM3 9h4v12H3zM9 9h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21H17.6v-5.4c0-1.3-.02-2.97-1.8-2.97-1.8 0-2.08 1.4-2.08 2.87V21H9z" /></svg>
)
const GitHubIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2A10 10 0 0 0 8.8 21.5c.5.1.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.9-1.29 2.74-1.02 2.74-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.59.69.48A10 10 0 0 0 12 2z" /></svg>
)
const WebIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></svg>
)

// Contact card shown when an answer is about reaching out. Auto-dismiss and
// the manual close are handled by the parent (Stage).
export default function ContactCard({ onClose }) {
  return (
    <div className="contact-card" role="dialog" aria-label="Contact Gokul">
      <div className="contact-head">
        <span className="contact-dot" aria-hidden="true" />
        <span className="contact-title">REACH_GOKUL</span>
        <button className="contact-close" onClick={onClose} aria-label="Close contact card">✕</button>
      </div>
      <Row href={`mailto:${CONTACT.email}`} icon={EmailIcon} label="Email" value={CONTACT.email} />
      <Row href={CONTACT.linkedinUrl} icon={LinkedInIcon} label="LinkedIn" value={CONTACT.linkedin} />
      <Row href={CONTACT.githubUrl} icon={GitHubIcon} label="GitHub" value={CONTACT.github} />
      <Row href={CONTACT.websiteUrl} icon={WebIcon} label="Website" value={CONTACT.website} />
    </div>
  )
}
