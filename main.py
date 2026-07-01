# main.py
import json
import sqlite3
import importlib
import retrieval
from datetime import datetime
from contextlib import asynccontextmanager
from fastapi import FastAPI
from pydantic import BaseModel
from retrieval import retrieve
from generator import generate_response, llm  # import llm to force single load


@asynccontextmanager
async def lifespan(app: FastAPI):
    # llm is already loaded at import time in generator.py
    print(f"Server ready. Model loaded: {llm is not None}")
    yield
    print("Shutting down.")

app = FastAPI(lifespan=lifespan)

conn = sqlite3.connect("unknown_queries.db", check_same_thread=False)
conn.execute("""CREATE TABLE IF NOT EXISTS queries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT,
    best_score REAL,
    best_match TEXT,
    timestamp TEXT
)""")
conn.commit()

class Question(BaseModel):
    text: str

FALLBACK = (
    "That's something Gokul hasn't shared with me yet — "
    "but I've noted your question and he'll review it soon."
)

@app.post("/ask")
async def ask(q: Question):
    hits = retrieve(q.text)

    if not hits:
        conn.execute(
            "INSERT INTO queries (question, best_score, best_match, timestamp) VALUES (?,?,?,?)",
            (q.text, 0.0, None, datetime.utcnow().isoformat())
        )
        conn.commit()
        return {"answer": FALLBACK, "source": None}

    top = hits[0]
    confidence = top.get("confidence", "medium")
    answer = generate_response(
        [h["fact"] for h in hits],
        q.text,
        confidence=confidence   # pass confidence level
    )
    return {"answer": answer, "source": top["fact"], "score": top["score"]}

@app.get("/unknown-queries")
async def get_unknown():
    rows = conn.execute(
        "SELECT question, best_score, timestamp FROM queries ORDER BY timestamp DESC LIMIT 50"
    ).fetchall()
    return [{"question": r[0], "score": r[1], "at": r[2]} for r in rows]

@app.post("/retrain")
async def retrain():
    """Rebuild embeddings index from knowledge_base.json without restart."""
    import subprocess
    result = subprocess.run(
        ["python", "build_index.py"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        return {"status": "error", "detail": result.stderr}

    # Reload the index in memory
    global facts, embeddings
    import numpy as np
    retrieval.embeddings = np.load("index/embeddings.npy")
    with open("index/facts.json") as f:
        data = __import__("json").load(f)
    retrieval.facts = data["facts"]
    retrieval.ids = data["ids"]
    retrieval.topics = data["topics"]

    return {"status": "ok", "facts_loaded": len(retrieval.facts)}