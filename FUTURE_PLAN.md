# Future Plan — Expo Presentation Mode

The assistant becomes a *presenter on stage*: while the voice narrates an
answer, a "big screen" presents matching content — like a keynote or product
launch. Ring = presenter; screen = synced visuals.

## Concept

```
┌────────────────────────────────────────────┐
│                                            │
│      ◯  ring (presenter,        BIG SCREEN │
│         eases to one side)      content    │
│                                 synced     │
│      "Gokul built the           with       │
│       DevTools extension..."    speech     │
│                                            │
└────────────────────────────────────────────┘
```

- **Idle** — screen empty, ring centered (exactly as today)
- **Speaking** — ring eases aside; presentation panel fades in showing
  content for the answer's topic, revealed in sync with the word-streaming
  already driving the transcript
- **Conversation ends** — panel fades out, ring returns to center

## Architecture (no repo merge needed)

The assistant is mounted on the portfolio's origin (`/assistant`), so it can
fetch portfolio content directly (`/api/posts`, future content endpoints) —
no CORS, no source migration. Presentation visuals are bespoke to the stage
aesthetic (dark palette, Michroma/Cormorant, particle-consistent motion);
portfolio components stay untouched.

### 1. Backend: scene metadata per answer

Extend `/ask` to return a scene alongside the answer:

```json
{
  "answer": "…",
  "end": false,
  "scene": { "topic": "projects", "items": [ { "title": "…", "line": "…" } ] }
}
```

- Topic classification: keyword match on question + answer against KB topics
  (projects, career, certifications, tech_stack, education, contact…)
- Scene items sourced from KB facts of that topic (already grouped by topic
  in `engine._build_system_prompt`) — a `scenes.py` module maps topic →
  presentable items (title + one-liner)
- Intent answers (greeting/self-intro) can carry a "welcome" scene

### 2. Frontend: stage direction

- New `PresentationPanel` component (DOM overlay, same aesthetic as
  transcript/taglines — not canvas, keeps text crisp)
- Speaking state: ring target position eases from center to ~30% x; panel
  fades in at ~65% x with the scene items
- Reveal items progressively using the same `currentTime / duration`
  fraction that streams the transcript words
- Mobile: ring stays centered, panel becomes a bottom sheet above the
  transcript
- Idle/listening: panel hidden, ring centered — current behavior unchanged

### 3. Content sources (phased)

- **Phase 1:** KB-derived scenes (projects, career timeline, certifications,
  skills) — no portfolio coupling
- **Phase 2:** live portfolio content via same-origin Next APIs (e.g. latest
  blog posts when the visitor asks about writing) — needs a small public
  content endpoint on the portfolio side
- **Phase 3 (ideas):** project screenshots/media on the screen; deep links
  ("see more" → portfolio page); scene transitions between topics mid-answer

## Open design decisions

- Ring-beside-panel vs content-behind-ring backdrop (leaning: ring eases
  aside on desktop — reads like presenter + screen)
- Whether scenes should be spoken-content-only (strictly what the answer
  says) or topic-overview (everything in that topic)

## Prerequisites already in place

- Word-synced streaming (drives progressive reveal)
- Topic-grouped KB, intent detection, `end` flag protocol
- Same-origin mount at `/assistant` with `/assistant-api` proxy
