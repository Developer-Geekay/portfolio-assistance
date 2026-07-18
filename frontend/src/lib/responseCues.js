// Detects, from an assistant answer, whether to surface certification badges
// or the contact card. Frontend-only — scans the answer text, no backend
// metadata needed. Cert/contact data mirrors the knowledge base.

export const ISSUER_COLORS = {
  OutSystems: "#ff3e5f",
  Angular: "#dd0031",
  Neutrinos: "#5b8def",
}

export const CERTIFICATIONS = [
  { id: "os-tech-lead",   label: "Tech Lead",          sub: "OutSystems O11", issuer: "OutSystems", outsystems: true,  keywords: ["tech lead", "technical lead"] },
  { id: "os-frontend",    label: "Front-end Spec.",    sub: "O11 & ODC",      issuer: "OutSystems", outsystems: true,  keywords: ["front-end developer specialist", "frontend developer specialist", "front end specialist"] },
  { id: "os-associate",   label: "Associate Dev",      sub: "OutSystems ODC", issuer: "OutSystems", outsystems: true,  keywords: ["associate developer"] },
  { id: "os-mobile",      label: "Mobile Dev Spec.",   sub: "O11 & ODC",      issuer: "OutSystems", outsystems: true,  keywords: ["mobile developer specialist", "mobile developer"] },
  { id: "os-reactive",    label: "Reactive Dev",       sub: "OutSystems O11", issuer: "OutSystems", outsystems: true,  keywords: ["reactive developer", "reactive"] },
  { id: "angular",        label: "Angular",            sub: "Complete Guide", issuer: "Angular",    outsystems: false, keywords: ["angular"] },
  { id: "neutrinos",      label: "Certified Pro Dev",  sub: "Neutrinos",      issuer: "Neutrinos",  outsystems: false, keywords: ["neutrinos"] },
]

export const CONTACT = {
  email: "developergeekay@gmail.com",
  linkedin: "linkedin.com/in/developergeekay",
  linkedinUrl: "https://linkedin.com/in/developergeekay",
  github: "github.com/Developer-Geekay",
  githubUrl: "https://github.com/Developer-Geekay",
  website: "gokulakannan.dev",
  websiteUrl: "https://gokulakannan.dev",
}

const GENERIC_CERT_RE = /\bcert(?:ified|ification|ifications|ificate)\b/i
const MAX_BUBBLES = 5

// Returns the certifications to surface for this answer (empty when none).
export function detectCertifications(text) {
  if (!text) return []
  const t = text.toLowerCase()

  const matched = CERTIFICATIONS.filter((c) => c.keywords.some((k) => t.includes(k)))
  if (matched.length > 0) return matched.slice(0, MAX_BUBBLES)

  // Generic mention of "certified/certification" with no specific name →
  // show the headline OutSystems set.
  if (GENERIC_CERT_RE.test(text)) {
    return CERTIFICATIONS.filter((c) => c.outsystems).slice(0, MAX_BUBBLES)
  }
  return []
}

const CONTACT_KEYWORDS = [
  "contact", "reach out", "reach him", "reach gokul", "get in touch", "touch with",
  "connect with", "connect on", "hire", "collaborat", "work with him", "work together",
  "email", "e-mail", "linkedin", "github", "available for", "get hold of", "drop a",
]
const CONTACT_URL_RE = /(@[\w.-]+\.\w+|linkedin\.com|github\.com|gokulakannan\.dev)/i

// True when the answer is about reaching out to Gokul.
export function isContactRelevant(text) {
  if (!text) return false
  const t = text.toLowerCase()
  return CONTACT_KEYWORDS.some((k) => t.includes(k)) || CONTACT_URL_RE.test(text)
}
