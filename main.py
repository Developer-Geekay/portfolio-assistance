# main.py — FastAPI server
import sqlite3
from datetime import datetime
from contextlib import asynccontextmanager
from fastapi import FastAPI
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
conn.commit()


class Question(BaseModel):
    text: str
    history: list[dict] = []   # optional: [{q, a}, ...] for multi-turn from frontend


@app.post("/ask")
async def ask(q: Question):
    intent = detect_intent(q.text)

    if intent == "greeting":
        return {"answer": GREETING_RESPONSE}
    if intent == "thanks":
        return {"answer": THANKS_RESPONSE}
    if intent == "self_intro":
        return {"answer": SELF_INTRO_RESPONSE}

    answer = engine.ask(q.text, q.history)

    # Log questions the model couldn't answer for KB expansion review
    if "don't have" in answer.lower() or "not covered" in answer.lower():
        conn.execute(
            "INSERT INTO queries (question, timestamp) VALUES (?, ?)",
            (q.text, datetime.utcnow().isoformat())
        )
        conn.commit()

    return {"answer": answer}


@app.get("/unknown-queries")
async def get_unknown():
    rows = conn.execute(
        "SELECT question, timestamp FROM queries ORDER BY timestamp DESC LIMIT 50"
    ).fetchall()
    return [{"question": r[0], "at": r[1]} for r in rows]


@app.post("/retrain")
async def retrain():
    """Reload knowledge_base.json into memory without server restart."""
    try:
        engine.reload_kb()
        return {"status": "ok"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}
