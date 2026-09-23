// responseCues.js — Detects contextual visual cues from assistant responses.
// Grounded directly in knowledge_base.json facts for:
// 1. Certifications (OutSystems O11/ODC, Angular, Neutrinos)
// 2. Achievements & Awards (Laurel Award, Best Team Player, 53% DB optimization, 4.3★ DevTools)
// 3. Technologies & Architecture (OutSystems, React, Angular, Cordova, Local AI, Homelab)
// 4. Contact channels

export const ISSUER_COLORS = {
  OutSystems: "#ff3e5f",
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

export const CERTIFICATIONS = [
  {
    id: "os-tech-lead",
    category: "cert",
    categoryLabel: "CERTIFICATION",
    label: "Tech Lead",
    sub: "OutSystems O11",
    tag: "O11 ARCHITECTURE",
    issuer: "OutSystems",
    accent: "#ff3e5f",
    icon: "outsystems",
    outsystems: true,
    keywords: ["tech lead", "technical lead", "architecture certification", "lead cert"]
  },
  {
    id: "os-frontend",
    category: "cert",
    categoryLabel: "CERTIFICATION",
    label: "Front-end Specialist",
    sub: "O11 & ODC Platforms",
    tag: "O11 & ODC",
    issuer: "OutSystems",
    accent: "#ff3e5f",
    icon: "outsystems",
    outsystems: true,
    keywords: ["front-end developer specialist", "frontend developer specialist", "front end specialist", "frontend specialist"]
  },
  {
    id: "os-associate-odc",
    category: "cert",
    categoryLabel: "CERTIFICATION",
    label: "Associate Developer",
    sub: "OutSystems Cloud (ODC)",
    tag: "ODC CLOUD",
    issuer: "OutSystems",
    accent: "#ff3e5f",
    icon: "outsystems",
    outsystems: true,
    keywords: ["associate developer", "odc cert", "developer cloud"]
  },
  {
    id: "os-mobile",
    category: "cert",
    categoryLabel: "CERTIFICATION",
    label: "Mobile Specialist",
    sub: "O11 & ODC Hybrid Apps",
    tag: "MOBILE & CORDOVA",
    issuer: "OutSystems",
    accent: "#ff3e5f",
    icon: "outsystems",
    outsystems: true,
    keywords: ["mobile developer specialist", "mobile developer", "mobile spec"]
  },
  {
    id: "os-reactive",
    category: "cert",
    categoryLabel: "CERTIFICATION",
    label: "Reactive Developer",
    sub: "OutSystems O11",
    tag: "REACTIVE WEB",
    issuer: "OutSystems",
    accent: "#ff3e5f",
    icon: "outsystems",
    outsystems: true,
    keywords: ["reactive developer", "reactive cert", "associate reactive"]
  },
  {
    id: "angular",
    category: "cert",
    categoryLabel: "CERTIFICATION",
    label: "Angular Complete",
    sub: "Full Architecture Guide",
    tag: "UDEMY CERTIFIED",
    issuer: "Angular",
    accent: "#dd0031",
    icon: "angular",
    outsystems: false,
    keywords: ["angular"]
  },
  {
    id: "neutrinos",
    category: "cert",
    categoryLabel: "CERTIFICATION",
    label: "Certified Pro Dev",
    sub: "Neutrinos Low-Code Platform",
    tag: "PRO DEVELOPER",
    issuer: "Neutrinos",
    accent: "#5b8def",
    icon: "neutrinos",
    outsystems: false,
    keywords: ["neutrinos", "neutrinos certified"]
  },
]

export const ACHIEVEMENTS = [
  {
    id: "laurel-award",
    category: "achievement",
    categoryLabel: "HONOR & AWARD",
    label: "Laurel Award",
    sub: "Mphasis Engineering Excellence",
    tag: "ENTERPRISE AWARD",
    issuer: "Mphasis",
    accent: "#f59e0b",
    icon: "trophy",
    keywords: ["laurel award", "laurel", "mphasis award", "award at mphasis"]
  },
  {
    id: "best-team-player",
    category: "achievement",
    categoryLabel: "HONOR & AWARD",
    label: "Best Team Player",
    sub: "Neutrinos Professional Recognition",
    tag: "LEADERSHIP AWARD",
    issuer: "Neutrinos",
    accent: "#f59e0b",
    icon: "trophy",
    keywords: ["best team player", "team player award", "neutrinos award"]
  },
  {
    id: "query-opt",
    category: "achievement",
    categoryLabel: "MILESTONE",
    label: "53% Query Boost",
    sub: "Data Model & Query Restructuring",
    tag: "PERFORMANCE",
    issuer: "Performance",
    accent: "#10b981",
    icon: "speedometer",
    keywords: ["53%", "performance improvement", "restructuring", "query architecture", "eliminated duplicate entities"]
  },
  {
    id: "devtools-ext",
    category: "achievement",
    categoryLabel: "FEATURED PROJECT",
    label: "OutSystems DevTools",
    sub: "Chrome Web Store (4.3★ Rating)",
    tag: "GLOBAL ADOPTION",
    issuer: "Chrome",
    accent: "#38bdf8",
    icon: "devtools",
    keywords: ["devtools", "chrome extension", "web store", "4.3", "application inspection"]
  },
  {
    id: "bentley-dealer",
    category: "achievement",
    categoryLabel: "ENTERPRISE MILESTONE",
    label: "Bentley Motors Project",
    sub: "Dealer Award Systems Architecture",
    tag: "ONWARD TECH",
    issuer: "Bentley",
    accent: "#a855f7",
    icon: "bentley",
    keywords: ["bentley", "bentley motors", "dealer award", "automotive"]
  },
]

export const TECH_STACK = [
  {
    id: "tech-outsystems",
    category: "tech",
    categoryLabel: "CORE ARCHITECTURE",
    label: "OutSystems O11 & ODC",
    sub: "Enterprise Reactive & Cloud-Native",
    tag: "8+ YEARS EXP",
    issuer: "OutSystems",
    accent: "#ff3e5f",
    icon: "outsystems",
    keywords: ["outsystems", "odc", "o11", "service studio"]
  },
  {
    id: "tech-react",
    category: "tech",
    categoryLabel: "FRONTEND STACK",
    label: "React & TypeScript",
    sub: "DevTools v3 & Modular UI",
    tag: "SPA & EXTENSIONS",
    issuer: "React",
    accent: "#61dafb",
    icon: "react",
    keywords: ["react", "typescript", "chrome debugger", "cdp"]
  },
  {
    id: "tech-angular",
    category: "tech",
    categoryLabel: "FRONTEND STACK",
    label: "Angular Framework",
    sub: "Enterprise Web Applications",
    tag: "CERTIFIED",
    issuer: "Angular",
    accent: "#dd0031",
    icon: "angular",
    keywords: ["angular framework", "angular developer"]
  },
  {
    id: "tech-mobile",
    category: "tech",
    categoryLabel: "HYBRID MOBILE",
    label: "Cordova & Capacitor",
    sub: "Native Mobile Plugin Integration",
    tag: "IOS & ANDROID",
    issuer: "Mobile",
    accent: "#38bdf8",
    icon: "mobile",
    keywords: ["cordova", "capacitor", "hybrid mobile", "native plugin", "native plugins"]
  },
  {
    id: "tech-ai",
    category: "tech",
    categoryLabel: "ON-DEVICE AI",
    label: "Local LLMs & llama.cpp",
    sub: "Quantized Gemma & Whisper on ARM",
    tag: "SELF-HOSTED AI",
    issuer: "AI",
    accent: "#10b981",
    icon: "brain",
    keywords: ["llama.cpp", "quantized", "small language model", "on-device ai", "local ai", "whisper", "piper"]
  },
  {
    id: "tech-homelab",
    category: "tech",
    categoryLabel: "HOMELAB & DEVOPS",
    label: "Raspberry Pi 5 Server",
    sub: "Nginx, SQLite, Linux & HostPanel",
    tag: "SELF-HOSTED",
    issuer: "Homelab",
    accent: "#ec4899",
    icon: "server",
    keywords: ["raspberry pi", "homelab", "hostpanel", "pi 5", "nginx", "sqlite"]
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

const GENERIC_CERT_RE = /\b(cert(?:ified|ification|ifications|ificate)|credential|licensed)\b/i
const GENERIC_AWARD_RE = /\b(award|awards|achievement|achievements|accomplish|recognition|laurel|honor)\b/i
const GENERIC_TECH_RE = /\b(tech stack|technologies|skills|languages|frameworks|tools|developer tools|expertise)\b/i

const MAX_SHOWCASE = 5

// Detects contextual showcase cards matching the response text.
// Returns an array of items (up to MAX_SHOWCASE) from Certifications, Achievements, or Tech Stack.
export function detectShowcaseItems(text) {
  if (!text) return []
  const t = text.toLowerCase()

  // 1. Direct specific keyword matching across all catalogs
  const matchedCerts = CERTIFICATIONS.filter((c) => c.keywords.some((k) => t.includes(k)))
  const matchedAchievements = ACHIEVEMENTS.filter((a) => a.keywords.some((k) => t.includes(k)))
  const matchedTech = TECH_STACK.filter((s) => s.keywords.some((k) => t.includes(k)))

  const directMatches = [...matchedCerts, ...matchedAchievements, ...matchedTech]
  if (directMatches.length > 0) {
    // Deduplicate by ID
    const seen = new Set()
    const result = []
    for (const item of directMatches) {
      if (!seen.has(item.id)) {
        seen.add(item.id)
        result.push(item)
      }
    }
    return result.slice(0, MAX_SHOWCASE)
  }

  // 2. High-level category fallbacks for broad questions
  if (GENERIC_AWARD_RE.test(text)) {
    return ACHIEVEMENTS.slice(0, MAX_SHOWCASE)
  }

  if (GENERIC_CERT_RE.test(text)) {
    return CERTIFICATIONS.slice(0, MAX_SHOWCASE)
  }

  if (GENERIC_TECH_RE.test(text)) {
    return TECH_STACK.slice(0, MAX_SHOWCASE)
  }

  return []
}

// Backward-compatible helper for code still referencing detectCertifications
export function detectCertifications(text) {
  if (!text) return []
  const t = text.toLowerCase()
  const matched = CERTIFICATIONS.filter((c) => c.keywords.some((k) => t.includes(k)))
  if (matched.length > 0) return matched.slice(0, MAX_SHOWCASE)
  if (GENERIC_CERT_RE.test(text)) {
    return CERTIFICATIONS.slice(0, MAX_SHOWCASE)
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
