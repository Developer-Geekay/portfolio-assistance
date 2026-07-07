# main.py — FastAPI server
import io
import json
import os
import random
import sqlite3
import tempfile
import wave
from datetime import datetime
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()   # backend/.env — loaded before engine reads its env vars

from fastapi import FastAPI, HTTPException, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
import engine
from intent import (detect_intent, extract_contact, GREETING_RESPONSE,
                    THANKS_RESPONSE, FAREWELL_RESPONSE, SELF_INTRO_RESPONSE,
                    PERSONAL_RESPONSE, LEAD_RESPONSE)

WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "base.en")
PIPER_VOICE   = os.environ.get("PIPER_VOICE", "models/tts/en_US-lessac-medium.onnx")

# STT compute target — "cuda" needs cuBLAS/cuDNN; anything that fails to load
# falls back to CPU int8 so the server always comes up.
WHISPER_DEVICE  = os.environ.get("WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE = os.environ.get("WHISPER_COMPUTE", "int8")


def _add_cuda_dll_dirs():
    # pip-installed CUDA libs (nvidia-cublas-cu12 / nvidia-cudnn-cu12) sit in
    # site-packages/nvidia/*/bin, which is not on the Windows DLL search path —
    # register those dirs so ctranslate2 can load cublas64_12.dll etc.
    import glob
    import site
    import sys
    if sys.platform != "win32":
        return
    for base in site.getsitepackages():
        for bin_dir in glob.glob(os.path.join(base, "nvidia", "*", "bin")):
            os.add_dll_directory(bin_dir)
            os.environ["PATH"] = bin_dir + os.pathsep + os.environ["PATH"]

# Domain vocabulary seeds Whisper so proper nouns transcribe correctly —
# list your name, companies, and tech terms in .env (comma-separated)
WHISPER_PROMPT = os.environ.get(
    "WHISPER_PROMPT",
    "skills, projects, experience, certifications, architect, developer"
)

stt_model   = None   # faster-whisper
tts_voice   = None   # piper


@asynccontextmanager
async def lifespan(app: FastAPI):
    global stt_model, tts_voice
    engine.load_model()
    print("Loading Whisper...")
    from faster_whisper import WhisperModel
    try:
        if WHISPER_DEVICE != "cpu":
            _add_cuda_dll_dirs()
        stt_model = WhisperModel(WHISPER_MODEL, device=WHISPER_DEVICE, compute_type=WHISPER_COMPUTE)
        if WHISPER_DEVICE != "cpu":
            # CUDA libs load lazily at the first encode — transcribe a second
            # of silence now so a broken GPU stack falls back here instead of
            # returning 500s on real requests
            import numpy as np
            segments, _ = stt_model.transcribe(np.zeros(16000, dtype=np.float32))
            list(segments)
            print(f"Whisper on {WHISPER_DEVICE} verified.")
    except Exception as e:
        if WHISPER_DEVICE == "cpu":
            raise
        print(f"Whisper failed on {WHISPER_DEVICE} ({e}); falling back to CPU.")
        stt_model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
    print("Loading Piper voice...")
    from piper import PiperVoice
    tts_voice = PiperVoice.load(PIPER_VOICE)
    print("Voice pipeline ready.")
    yield
    print("Shutting down.")


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

conn = sqlite3.connect("unknown_queries.db", check_same_thread=False)
conn.execute("""CREATE TABLE IF NOT EXISTS queries (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    question  TEXT,
    timestamp TEXT
)""")
conn.execute("""CREATE TABLE IF NOT EXISTS conversations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    client_ip  TEXT,
    question   TEXT,
    answer     TEXT,
    intent     TEXT,
    timestamp  TEXT
)""")
conn.execute("""CREATE TABLE IF NOT EXISTS leads (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    client_ip  TEXT,
    email      TEXT,
    phone      TEXT,
    message    TEXT,
    timestamp  TEXT
)""")
conn.commit()


# Admin endpoints (analytics, retrain) expose visitor IPs and questions.
# They require the key from ADMIN_KEY unconditionally and are disabled
# when it is unset — IP/header-based trust is spoofable and never used.
ADMIN_KEY = os.environ.get("ADMIN_KEY", "")


def require_admin(request: Request):
    if not ADMIN_KEY:
        raise HTTPException(status_code=503, detail="Admin endpoints disabled: set ADMIN_KEY")
    if request.headers.get("x-admin-key", "") != ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Forbidden")


def client_ip_of(request: Request) -> str:
    # Respect reverse proxy header (nginx on the Pi), fall back to socket peer
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def log_conversation(session_id: str, ip: str, question: str, answer: str, intent: str):
    conn.execute(
        "INSERT INTO conversations (session_id, client_ip, question, answer, intent, timestamp) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (session_id, ip, question, answer, intent, datetime.utcnow().isoformat())
    )
    conn.commit()


class Question(BaseModel):
    text: str
    history: list[dict] = []   # optional: [{q, a}, ...] for multi-turn from frontend
    session_id: str = ""       # per-browser-tab session for analytics


@app.post("/ask")
async def ask(q: Question, request: Request):
    ip = client_ip_of(request)

    # Visitor left contact details → store the lead, confirm, keep chatting
    contact = extract_contact(q.text)
    if contact:
        conn.execute(
            "INSERT INTO leads (session_id, client_ip, email, phone, message, timestamp) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (q.session_id, ip, contact["email"], contact["phone"],
             contact["raw"], datetime.utcnow().isoformat())
        )
        conn.commit()
        log_conversation(q.session_id, ip, q.text, LEAD_RESPONSE, "lead")
        return {"answer": LEAD_RESPONSE, "end": False}

    intent = detect_intent(q.text)

    if intent == "greeting":
        log_conversation(q.session_id, ip, q.text, GREETING_RESPONSE, intent)
        return {"answer": GREETING_RESPONSE, "end": False}
    if intent == "thanks":
        log_conversation(q.session_id, ip, q.text, THANKS_RESPONSE, intent)
        return {"answer": THANKS_RESPONSE, "end": False}
    if intent == "farewell":
        # "end": True → frontend speaks this and goes idle instead of re-listening
        log_conversation(q.session_id, ip, q.text, FAREWELL_RESPONSE, intent)
        return {"answer": FAREWELL_RESPONSE, "end": True}
    if intent == "self_intro":
        log_conversation(q.session_id, ip, q.text, SELF_INTRO_RESPONSE, intent)
        return {"answer": SELF_INTRO_RESPONSE, "end": False}
    if intent == "personal":
        # private-life questions never reach the model
        log_conversation(q.session_id, ip, q.text, PERSONAL_RESPONSE, intent)
        return {"answer": PERSONAL_RESPONSE, "end": False}

    answer = engine.ask(q.text, q.history)
    log_conversation(q.session_id, ip, q.text, answer, "question")

    # Log questions the model couldn't answer for KB expansion review
    if "don't have" in answer.lower() or "not covered" in answer.lower():
        conn.execute(
            "INSERT INTO queries (question, timestamp) VALUES (?, ?)",
            (q.text, datetime.utcnow().isoformat())
        )
        conn.commit()

    return {"answer": answer, "end": False}


@app.post("/transcribe")
def transcribe(audio: UploadFile = File(...)):
    """Speech-to-text: browser uploads recorded audio (webm/mp4/wav), Whisper
    transcribes locally. Sync endpoint → FastAPI runs it in a threadpool."""
    suffix = os.path.splitext(audio.filename or "")[1] or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio.file.read())
        path = tmp.name
    try:
        segments, _ = stt_model.transcribe(path, language="en", beam_size=1,
                                           initial_prompt=WHISPER_PROMPT)
        text = " ".join(s.text.strip() for s in segments).strip()
    finally:
        os.unlink(path)
    return {"text": text}


class SpeakRequest(BaseModel):
    text: str


@app.post("/speak")
def speak(req: SpeakRequest):
    """Text-to-speech: Piper renders a WAV, played by the browser's <audio>.
    Works identically on every browser/OS — no client TTS involved."""
    text = req.text.strip()[:1000]
    if not text:
        raise HTTPException(status_code=400, detail="No text")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as f:
        tts_voice.synthesize_wav(text, f)
    return Response(content=buf.getvalue(), media_type="audio/wav")


@app.get("/facts")
async def facts(n: int = 15):
    """Random KB facts for the frontend idle-state taglines."""
    with open("knowledge_base.json") as f:
        kb = json.load(f)
    picks = random.sample(kb, min(n, len(kb)))
    return [p["fact"] for p in picks]


@app.get("/conversations")
async def get_conversations(request: Request, limit: int = 200):
    require_admin(request)
    """Recent conversation turns, newest first — group by session_id for analysis."""
    rows = conn.execute(
        "SELECT session_id, client_ip, question, answer, intent, timestamp "
        "FROM conversations ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    return [
        {"session": r[0], "ip": r[1], "question": r[2],
         "answer": r[3], "intent": r[4], "at": r[5]}
        for r in rows
    ]


@app.get("/leads")
async def get_leads(request: Request, limit: int = 100):
    """Visitors who left contact details for Gokul to reach back."""
    require_admin(request)
    rows = conn.execute(
        "SELECT session_id, client_ip, email, phone, message, timestamp "
        "FROM leads ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    return [
        {"session": r[0], "ip": r[1], "email": r[2],
         "phone": r[3], "message": r[4], "at": r[5]}
        for r in rows
    ]


@app.get("/sessions")
async def get_sessions(request: Request, limit: int = 50):
    require_admin(request)
    """Session summaries: turn count, first/last activity, client IP."""
    rows = conn.execute(
        "SELECT session_id, client_ip, COUNT(*), MIN(timestamp), MAX(timestamp) "
        "FROM conversations WHERE session_id != '' "
        "GROUP BY session_id ORDER BY MAX(timestamp) DESC LIMIT ?", (limit,)
    ).fetchall()
    return [
        {"session": r[0], "ip": r[1], "turns": r[2], "started": r[3], "last": r[4]}
        for r in rows
    ]


@app.get("/stats")
async def get_stats(request: Request):
    """Aggregate analytics for the admin dashboard."""
    require_admin(request)
    turns    = conn.execute("SELECT COUNT(*) FROM conversations").fetchone()[0]
    sessions = conn.execute(
        "SELECT COUNT(DISTINCT session_id) FROM conversations WHERE session_id != ''"
    ).fetchone()[0]
    leads    = conn.execute("SELECT COUNT(*) FROM leads").fetchone()[0]
    unknown  = conn.execute("SELECT COUNT(*) FROM queries").fetchone()[0]
    intents  = conn.execute(
        "SELECT intent, COUNT(*) FROM conversations GROUP BY intent ORDER BY COUNT(*) DESC"
    ).fetchall()
    daily    = conn.execute(
        "SELECT substr(timestamp, 1, 10) AS day, COUNT(*), COUNT(DISTINCT session_id) "
        "FROM conversations GROUP BY day ORDER BY day DESC LIMIT 14"
    ).fetchall()
    return {
        "turns": turns, "sessions": sessions, "leads": leads, "unknown": unknown,
        "intents": [{"intent": r[0], "count": r[1]} for r in intents],
        "daily":   [{"day": r[0], "turns": r[1], "sessions": r[2]} for r in daily],
    }


@app.get("/unknown-queries")
async def get_unknown(request: Request):
    require_admin(request)
    rows = conn.execute(
        "SELECT question, timestamp FROM queries ORDER BY timestamp DESC LIMIT 50"
    ).fetchall()
    return [{"question": r[0], "at": r[1]} for r in rows]


@app.post("/retrain")
async def retrain(request: Request):
    """Reload knowledge_base.json into memory without server restart."""
    require_admin(request)
    try:
        engine.reload_kb()
        return {"status": "ok"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", "16000")),
    )
