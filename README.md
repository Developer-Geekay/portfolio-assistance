# Gokul AI — Voice-First Portfolio Assistant

A fully self-hosted, voice-driven AI assistant for a personal portfolio site.
Visitors click a ring, ask questions with their voice, and hear spoken answers
about Gokul — his skills, projects, experience, and background. Every stage of
the pipeline runs locally: no cloud APIs, no keys, no per-request costs.

```
visitor mic → MediaRecorder → /transcribe (Whisper) → /ask (Gemma) → /speak (Piper) → <audio>
```

Designed to run on a Raspberry Pi 5 (8GB) — CPU-only, small quantized models.

## Features

- **Voice-first UI** — minimal particle-ring interface; conversational
  listening with adaptive voice-activity detection (Siri-style: speak, pause,
  it answers, then listens again). Response text streams word-by-word in sync
  with the spoken audio.
- **Full-context inference** — the entire knowledge base (~67 facts) is
  injected into every prompt for a small quantized LLM (Gemma). No retrieval
  step, no embedding misses; follow-up questions and negations work.
- **Self-hosted speech** — faster-whisper for speech-to-text, Piper for
  text-to-speech. Works on iOS, Android, and desktop (no Web Speech API).
- **Optional browser WASM speech** — `VITE_WHISPER_WASM` / `VITE_PIPER_WASM`
  flags move transcription and synthesis into the visitor's browser
  (models cached locally after first download), offloading the Pi. A
  particle-morph loading screen entertains the wait. Server-side remains
  the default and the recommended production path.
- **Guardrails** — hallucination guard (won't confirm skills planted in the
  question), privacy gate (personal/career-negotiation topics deflect to
  direct contact), third-person persona rules.
- **Lead capture** — visitors who leave a name/email/phone are stored for
  follow-up, including spoken addresses ("john at gmail dot com").
- **Analytics** — every turn logged per browser-tab session with client IP;
  admin-key-protected endpoints for sessions, conversations, leads, and
  unanswered questions.
- **Admin dashboard** — `/assistant-admin` on the frontend: leads, sessions,
  full conversation log, unanswered questions, daily activity, and intent
  breakdown. The page shell is public but every data call requires the
  admin key.
- **KB builder** — conversational interview tool (`kb_builder.py`) so anyone
  can build their own knowledge base with the same local model.

## Repository layout

```
backend/    FastAPI server, inference engine, KB, models, tests
frontend/   React + Vite voice UI (particle stage, voice assistant hook)
DEPLOYMENT.md  Production deployment guide (Raspberry Pi 5 + nginx)
```

## Quick start (development)

Prerequisites: Python 3.10+, Node 20+, and the model files (see
[DEPLOYMENT.md](DEPLOYMENT.md#3-download-models) for downloads).

**Backend** (port 16000):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # set ADMIN_KEY etc.
python main.py
```

**Frontend** (port 5173, HTTPS):

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open `https://localhost:5173`, accept the self-signed certificate warning,
click the ring, and talk. For phone testing use `https://<your-lan-ip>:5173`
(HTTPS is required for microphone access on mobile).

## API

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/ask` | POST | — | Question → answer (`{text, history, session_id}`) |
| `/transcribe` | POST | — | Audio file → text (Whisper) |
| `/speak` | POST | — | Text → WAV audio (Piper) |
| `/facts` | GET | — | Random KB facts (idle taglines) |
| `/conversations` | GET | `X-Admin-Key` | Turn-by-turn conversation log |
| `/sessions` | GET | `X-Admin-Key` | Per-session summaries |
| `/leads` | GET | `X-Admin-Key` | Captured visitor contacts |
| `/unknown-queries` | GET | `X-Admin-Key` | Questions the KB couldn't answer |
| `/stats` | GET | `X-Admin-Key` | Aggregate analytics (totals, intents, daily activity) |
| `/retrain` | POST | `X-Admin-Key` | Reload the KB without restart |

Admin endpoints stay disabled (503) until `ADMIN_KEY` is set in
`backend/.env`. The admin dashboard at `https://localhost:5173/assistant-admin`
presents all of them in one page.

## Testing

```bash
cd backend
python test_runner.py    # 54 automated queries across 10 categories
```

## Building your own assistant

Your personal knowledge base is **never committed** — `knowledge_base.json`
is gitignored, so your facts stay on your machine. The repo ships a fictional
sample showing the expected structure.

**1. Create your knowledge base** — pick one:

```bash
cd backend

# Option A: start from the sample and edit by hand
cp knowledge_base.sample.json knowledge_base.json

# Option B: let the local model interview you topic by topic
python kb_builder.py          # or --no-model to type facts directly
```

The format is a flat list of facts grouped by topic:

```json
{ "id": "kb_001", "topic": "identity", "fact": "Alex is a Senior Software Engineer with 6+ years of experience." }
```

Guidelines that make small models answer well:
- One self-contained statement per fact, written in third person
- Repeat the person's name in each fact (facts are injected independently)
- Cover the questions visitors actually ask: who/role, career timeline,
  skills, projects, education, certifications, contact, hobbies
- Add one long `summary` fact — it powers "tell me about them"
- Don't include anything you wouldn't say to a stranger; the privacy gate
  deflects personal questions, but the KB is the source of truth

**2. Personalize the assistant** — in `backend/.env`:

```ini
PERSONA_NAME=Alex
PERSONA_FULL_NAME=Alex Morgan
PERSONA_CONTACT=at alex@example.com or on LinkedIn
WHISPER_PROMPT=Alex Morgan, Example Corp, OpenBudget   # proper nouns for STT accuracy
```

Also update the name legend in `frontend/src/components/Stage.jsx` and the
taglines in the same file.

**3. Test** — `python test_runner.py`, adjust facts until answers feel right
(the test file doubles as a template for your own assertions).

**4. Deploy** — see [DEPLOYMENT.md](DEPLOYMENT.md).
