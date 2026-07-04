# main.py — FastAPI server
import json
import os
import random
import sqlite3
from datetime import datetime
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import engine
from intent import (detect_intent, GREETING_RESPONSE, THANKS_RESPONSE,
                    SELF_INTRO_RESPONSE)

FALLBACK = (
    "That's something Gokul hasn't shared with me yet — "
    "but I've noted your question and he'll review it soon."
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine.load_model()
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
conn.commit()


# Admin endpoints (analytics, retrain) expose visitor IPs and questions.
# They require the key from GOKUL_ADMIN_KEY unconditionally and are disabled
# when it is unset — IP/header-based trust is spoofable and never used.
ADMIN_KEY = os.environ.get("GOKUL_ADMIN_KEY", "")


def require_admin(request: Request):
    if not ADMIN_KEY:
        raise HTTPException(status_code=503, detail="Admin endpoints disabled: set GOKUL_ADMIN_KEY")
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
    intent = detect_intent(q.text)

    if intent == "greeting":
        log_conversation(q.session_id, ip, q.text, GREETING_RESPONSE, intent)
        return {"answer": GREETING_RESPONSE}
    if intent == "thanks":
        log_conversation(q.session_id, ip, q.text, THANKS_RESPONSE, intent)
        return {"answer": THANKS_RESPONSE}
    if intent == "self_intro":
        log_conversation(q.session_id, ip, q.text, SELF_INTRO_RESPONSE, intent)
        return {"answer": SELF_INTRO_RESPONSE}

    answer = engine.ask(q.text, q.history)
    log_conversation(q.session_id, ip, q.text, answer, "question")

    # Log questions the model couldn't answer for KB expansion review
    if "don't have" in answer.lower() or "not covered" in answer.lower():
        conn.execute(
            "INSERT INTO queries (question, timestamp) VALUES (?, ?)",
            (q.text, datetime.utcnow().isoformat())
        )
        conn.commit()

    return {"answer": answer}


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
