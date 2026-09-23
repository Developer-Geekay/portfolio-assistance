// responseCues.js — Contextual Visual Cues for Gokul's Voice Assistant
// Grounded strictly in knowledge_base.json facts for:
// 1. Certifications (OutSystems O11/ODC, Angular, Neutrinos)
// 2. Achievements & Enterprise Milestones (Mphasis Laurel Award, Neutrinos Award, 53% FNOL Optimization, Bentley Motors at Onward Technologies, OS DevTools)
// 3. Technologies & Architecture (OutSystems O11/ODC, React, Angular, Cordova, Local AI, Homelab)
// 4. Contact channels

const BASE = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/'
const badge = (file) => `${BASE.replace(/\/$/, '')}/assets/badges/${file}`

export const ISSUER_COLORS = {
  OutSystems: "#ff2400",
  Angular: "#dd0031",
  Neutrinos: "#5b8def",
  Mphasis: "#f59e0b",
  Chrome: "#38bdf8",
  Performance: "#10b981",
  Bentley: "#a855f7",
  React: "#61dafb",
  Mobile: "#38bdf8",
  AI: "#10b981",
  Homelab: "#ec4899",
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. CERTIFICATIONS CATALOG (Strictly actual certified credentials)
// ─────────────────────────────────────────────────────────────────────────────
export const CERTIFICATIONS = [
  {
    id: "os-tech-lead",
    category: "cert",
    categoryLabel: "O11 ARCHITECTURE",
    label: "Tech Lead",
    sub: "OutSystems O11 Architecture",
    tag: "TECH LEAD",
    issuer: "OutSystems",
    accent: "#ff2400",
    image: badge("outsystems-mark.svg"),
    icon: "outsystems",
    outsystems: true,
  },
  {
    id: "os-associate-odc",
    category: "cert",
    categoryLabel: "ODC PLATFORM",
    label: "Associate Dev",
    sub: "OutSystems Developer Cloud",
    tag: "ODC CLOUD",
    issuer: "OutSystems",
    accent: "#ff2400",
    image: badge("outsystems-mark.svg"),
    icon: "outsystems",
    outsystems: true,
  },
  {
    id: "os-frontend",
    category: "cert",
    categoryLabel: "FRONT-END SPEC",
    label: "Front-end Spec.",
    sub: "O11 & ODC Platforms",
    tag: "FRONT-END",
    issuer: "OutSystems",
    accent: "#ff2400",
    image: badge("outsystems-mark.svg"),
    icon: "outsystems",
    outsystems: true,
  },
  {
    id: "os-mobile",
    category: "cert",
    categoryLabel: "MOBILE SPEC",
    label: "Mobile Specialist",
    sub: "O11 & ODC Hybrid Apps",
    tag: "MOBILE DEV",
    issuer: "OutSystems",
    accent: "#ff2400",
    image: badge("outsystems-mark.svg"),
    icon: "outsystems",
    outsystems: true,
  },
  {
    id: "os-reactive",
    category: "cert",
    categoryLabel: "REACTIVE WEB",
    label: "Reactive Dev",
    sub: "OutSystems O11 Reactive",
    tag: "REACTIVE",
    issuer: "OutSystems",
    accent: "#ff2400",
    image: badge("outsystems-mark.svg"),
    icon: "outsystems",
    outsystems: true,
  },
  {
    id: "angular-cert",
    category: "cert",
    categoryLabel: "FRAMEWORK CERT",
    label: "Angular Complete",
    sub: "Udemy Full Architecture",
    tag: "ANGULAR",
    issuer: "Angular",
    accent: "#dd0031",
    image: badge("angular.svg"),
    icon: "angular",
    outsystems: false,
  },
  {
    id: "neutrinos-cert",
    category: "cert",
    categoryLabel: "LOW-CODE CERT",
    label: "Certified Pro Dev",
    sub: "Neutrinos Low-Code Platform",
    tag: "NEUTRINOS",
    issuer: "Neutrinos",
    accent: "#5b8def",
    image: badge("neutrinos.svg"),
    icon: "neutrinos",
    outsystems: false,
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// 2. ACHIEVEMENTS, AWARDS & VERIFIED ENTERPRISE MILESTONES
// ─────────────────────────────────────────────────────────────────────────────
export const ACHIEVEMENTS = [
  {
    id: "laurel-award",
    category: "achievement",
    categoryLabel: "ENGINEERING EXCELLENCE",
    label: "Laurel Award",
    sub: "Mphasis Engineering Excellence",
    tag: "MPHASIS AWARD",
    issuer: "Mphasis",
    accent: "#f59e0b",
    image: badge("mphasis.png"),
    icon: "trophy",
  },
  {
    id: "best-team-player",
    category: "achievement",
    categoryLabel: "PROFESSIONAL RECOGNITION",
    label: "Best Team Player",
    sub: "Neutrinos Excellence Award",
    tag: "NEUTRINOS AWARD",
    issuer: "Neutrinos",
    accent: "#f59e0b",
    image: badge("neutrinos.svg"),
    icon: "trophy",
  },
  {
    id: "query-opt",
    category: "achievement",
    categoryLabel: "DATA ARCHITECTURE",
    label: "53% Query Boost",
    sub: "Mphasis FNOL Restructuring",
    tag: "OPTIMIZATION",
    issuer: "Performance",
    accent: "#10b981",
    image: badge("postgresql.svg"),
    icon: "speedometer",
  },
  {
    id: "bentley-dealer",
    category: "achievement",
    categoryLabel: "ONWARD TECHNOLOGIES",
    label: "Bentley Motors",
    sub: "Onward Tech • Dealer Systems",
    tag: "ONWARD TECH",
    issuer: "Bentley",
    accent: "#a855f7",
    image: badge("bentley.svg"),
    icon: "bentley",
  },
  {
    id: "devtools-ext",
    category: "achievement",
    categoryLabel: "COMMUNITY TOOLING",
    label: "OS DevTools",
    sub: "Chrome Web Store (4.3★)",
    tag: "CHROME EXT",
    issuer: "Chrome",
    accent: "#38bdf8",
    image: badge("chrome.svg"),
    icon: "devtools",
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// 3. CORE TECH STACK (Only displayed when specifically discussing technologies)
// ─────────────────────────────────────────────────────────────────────────────
export const TECH_STACK = [
  {
    id: "tech-outsystems",
    category: "tech",
    categoryLabel: "CORE ARCHITECTURE",
    label: "OutSystems O11 & ODC",
    sub: "8+ Yrs Enterprise Arch",
    tag: "OUTSYSTEMS",
    issuer: "OutSystems",
    accent: "#ff2400",
    image: badge("outsystems-mark.svg"),
    icon: "outsystems",
  },
  {
    id: "tech-react",
    category: "tech",
    categoryLabel: "FRONTEND STACK",
    label: "React & TypeScript",
    sub: "DevTools v3 & Modern SPA",
    tag: "REACT",
    issuer: "React",
    accent: "#61dafb",
    image: badge("react.svg"),
    icon: "react",
  },
  {
    id: "tech-angular",
    category: "tech",
    categoryLabel: "FRONTEND STACK",
    label: "Angular Framework",
    sub: "Enterprise Applications",
    tag: "ANGULAR",
    issuer: "Angular",
    accent: "#dd0031",
    image: badge("angular.svg"),
    icon: "angular",
  },
  {
    id: "tech-mobile",
    category: "tech",
    categoryLabel: "HYBRID MOBILE",
    label: "Cordova & Capacitor",
    sub: "Native Mobile Plugins",
    tag: "CORDOVA",
    issuer: "Mobile",
    accent: "#38bdf8",
    image: badge("cordova.svg"),
    icon: "mobile",
  },
  {
    id: "tech-ai",
    category: "tech",
    categoryLabel: "ON-DEVICE AI",
    label: "Local LLMs",
    sub: "llama.cpp on ARM & Gemma",
    tag: "LOCAL AI",
    issuer: "AI",
    accent: "#10b981",
    image: badge("python.svg"),
    icon: "brain",
  },
  {
    id: "tech-homelab",
    category: "tech",
    categoryLabel: "HOMELAB & DEVOPS",
    label: "Raspberry Pi 5",
    sub: "Nginx, Linux & HostPanel",
    tag: "PI 5 SERVER",
    issuer: "Homelab",
    accent: "#ec4899",
    image: badge("raspberrypi.svg"),
    icon: "server",
  },
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

function deduplicate(list) {
  const seen = new Set()
  const result = []
  for (const item of list) {
    if (item && !seen.has(item.id)) {
      seen.add(item.id)
      result.push(item)
    }
  }
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// DETECT CONTEXTUAL SHOWCASE ITEMS
// Strict, high-precision detection:
// - Excludes all greeting/farewell/boilerplate turns.
// - Accurately distinguishes between certifications, company milestones, and tech stack.
// - Never shows irrelevant company badges for unrelated roles (e.g. no Bentley for Teamwork Techknowledge).
// ─────────────────────────────────────────────────────────────────────────────
export function detectShowcaseItems(text) {
  if (!text) return []
  const t = text.toLowerCase()

  // 1. GREETING & BOILERPLATE HARD EXCLUSION
  // Welcome greetings, goodbyes, and contact redirects must NEVER trigger showcase moons!
  if (
    t.includes("ai assistant") ||
    t.includes("ask me anything") ||
    t.includes("glad i could help") ||
    t.includes("feel free to ask") ||
    t.includes("great talking with you") ||
    t.includes("come back anytime") ||
    t.includes("noted your details") ||
    t.includes("best to reach out") ||
    t.includes("couldn't reach the server") ||
    t.startsWith("hello") ||
    t.startsWith("hey there")
  ) {
    return []
  }

  // 2. CERTIFICATIONS INTENT
  // Checks if the speech is discussing certifications/credentials
  const hasCertIntent =
    /\b(cert(?:ifications?|ified|ificates?)|credentials?)\b/i.test(t) ||
    t.includes("five certifications") ||
    t.includes("5 certifications") ||
    t.includes("certified professional") ||
    t.includes("both o11 and odc platforms")

  if (hasCertIntent) {
    const certs = []

    const isOutSystemsCert =
      t.includes("outsystems") ||
      t.includes("five") ||
      t.includes("5") ||
      t.includes("o11") ||
      t.includes("odc") ||
      t.includes("reactive") ||
      t.includes("architecture")

    if (isOutSystemsCert) {
      const hasSpecific =
        t.includes("tech lead") ||
        t.includes("front-end") ||
        t.includes("frontend") ||
        t.includes("associate") ||
        t.includes("mobile") ||
        t.includes("reactive")

      // If it's a broad summary of the 5 OutSystems certifications, return all 5
      if (
        !hasSpecific ||
        t.includes("five certifications") ||
        t.includes("5 certifications") ||
        t.includes("holds five") ||
        t.includes("all certifications") ||
        t.includes("across architecture, development")
      ) {
        certs.push(
          CERTIFICATIONS.find((c) => c.id === "os-tech-lead"),
          CERTIFICATIONS.find((c) => c.id === "os-associate-odc"),
          CERTIFICATIONS.find((c) => c.id === "os-frontend"),
          CERTIFICATIONS.find((c) => c.id === "os-mobile"),
          CERTIFICATIONS.find((c) => c.id === "os-reactive")
        )
      } else {
        if (t.includes("tech lead")) certs.push(CERTIFICATIONS.find((c) => c.id === "os-tech-lead"))
        if (t.includes("associate")) certs.push(CERTIFICATIONS.find((c) => c.id === "os-associate-odc"))
        if (t.includes("front-end") || t.includes("frontend")) certs.push(CERTIFICATIONS.find((c) => c.id === "os-frontend"))
        if (t.includes("mobile")) certs.push(CERTIFICATIONS.find((c) => c.id === "os-mobile"))
        if (t.includes("reactive")) certs.push(CERTIFICATIONS.find((c) => c.id === "os-reactive"))
      }
    }

    if (t.includes("angular") && (t.includes("udemy") || t.includes("guide") || t.includes("cert"))) {
      certs.push(CERTIFICATIONS.find((c) => c.id === "angular-cert"))
    }

    if (t.includes("neutrinos") && (t.includes("certified") || t.includes("pro dev") || t.includes("cert"))) {
      certs.push(CERTIFICATIONS.find((c) => c.id === "neutrinos-cert"))
    }

    if (certs.filter(Boolean).length > 0) {
      return deduplicate(certs).slice(0, 5)
    }
  }

  // 3. HONORS, AWARDS & COMPANY-SPECIFIC MILESTONES
  const achievements = []

  // Bentley Motors — ONLY when Bentley or Onward Technologies is specifically referenced!
  if (t.includes("bentley") || t.includes("onward technologies") || t.includes("onward tech") || t.includes("dealer award")) {
    achievements.push(ACHIEVEMENTS.find((a) => a.id === "bentley-dealer"))
  }

  // Mphasis — Laurel Award & 53% FNOL Optimization
  if (t.includes("mphasis") || t.includes("laurel award") || t.includes("laurel")) {
    achievements.push(ACHIEVEMENTS.find((a) => a.id === "laurel-award"))
  }
  if (t.includes("53%") || t.includes("fnol") || (t.includes("query") && t.includes("restructur")) || (t.includes("mphasis") && t.includes("performance"))) {
    achievements.push(ACHIEVEMENTS.find((a) => a.id === "query-opt"))
  }

  // Neutrinos — Best Team Player Award
  if (t.includes("best team player") || (t.includes("neutrinos") && t.includes("award"))) {
    achievements.push(ACHIEVEMENTS.find((a) => a.id === "best-team-player"))
  }

  // OutSystems DevTools Chrome Extension
  if (t.includes("devtools") || (t.includes("chrome extension") && !t.includes("skills"))) {
    achievements.push(ACHIEVEMENTS.find((a) => a.id === "devtools-ext"))
  }

  // Generic awards question ("what awards has he won?")
  if (/\b(awards?|honors?|recognitions?)\b/i.test(t) && achievements.length === 0) {
    return [
      ACHIEVEMENTS.find((a) => a.id === "laurel-award"),
      ACHIEVEMENTS.find((a) => a.id === "best-team-player"),
      ACHIEVEMENTS.find((a) => a.id === "query-opt"),
    ]
  }

  if (achievements.filter(Boolean).length > 0) {
    return deduplicate(achievements).slice(0, 5)
  }

  // 4. TECH STACK (Strict check: only when specifically discussing technical stack)
  const isTechStackTopic =
    /\b(tech stack|technologies|frameworks|primary stack|languages used)\b/i.test(t) ||
    t.includes("what tools does he use") ||
    t.includes("what does he work with")

  if (isTechStackTopic) {
    return [
      TECH_STACK.find((s) => s.id === "tech-outsystems"),
      TECH_STACK.find((s) => s.id === "tech-react"),
      TECH_STACK.find((s) => s.id === "tech-angular"),
      TECH_STACK.find((s) => s.id === "tech-mobile"),
      TECH_STACK.find((s) => s.id === "tech-ai"),
      TECH_STACK.find((s) => s.id === "tech-homelab"),
    ].filter(Boolean).slice(0, 5)
  }

  // 5. INDIVIDUAL SPECIFIC TECH HIGHLIGHTS
  const techItems = []
  if (t.includes("llama.cpp") || t.includes("local ai") || t.includes("local llm") || t.includes("quantized gemma")) {
    techItems.push(TECH_STACK.find((s) => s.id === "tech-ai"))
  }
  if (t.includes("raspberry pi") || t.includes("hostpanel") || t.includes("homelab server")) {
    techItems.push(TECH_STACK.find((s) => s.id === "tech-homelab"))
  }
  if (t.includes("cordova") || t.includes("capacitor") || t.includes("native plugin")) {
    techItems.push(TECH_STACK.find((s) => s.id === "tech-mobile"))
  }

  if (techItems.filter(Boolean).length > 0) {
    return deduplicate(techItems).slice(0, 5)
  }

  // 6. DEFAULT FOR ALL OTHER CONVERSATIONS
  // Early career at Teamwork Techknowledge, Hexlope, Netlink, general answers -> SHOW NOTHING!
  return []
}

export function detectCertifications(text) {
  return detectShowcaseItems(text).filter((i) => i.category === "cert")
}

const CONTACT_KEYWORDS = [
  "contact", "reach out", "reach him", "reach gokul", "get in touch", "touch with",
  "connect with", "connect on", "hire", "collaborat", "work with him", "work together",
  "email", "e-mail", "linkedin", "github", "available for", "get hold of", "drop a",
]
const CONTACT_URL_RE = /(@[\w.-]+\.\w+|linkedin\.com|github\.com|gokulakannan\.dev)/i

export function isContactRelevant(text) {
  if (!text) return false
  const t = text.toLowerCase()
  if (t.includes("ask me anything") || t.includes("ai assistant")) return false
  return CONTACT_KEYWORDS.some((k) => t.includes(k)) || CONTACT_URL_RE.test(text)
}
