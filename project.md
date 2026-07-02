Here's a clean summary of everything you've built so far:

---

## Gokul AI — Project Summary

### What it is
A **tiny, self-hosted personal AI assistant** that answers questions about Gokul — his skills, experience, projects, and background. Designed to run inside his 3D portfolio website where a virtual avatar presents him and visitors can ask questions naturally.

---

### Architecture (RAG-lite)

```
User Question
     │
     ▼
Intent Detection          ← greetings, thanks, farewells handled instantly
     │
     ▼
Sentence Embedding        ← all-MiniLM-L6-v2 (~80MB)
     │
     ▼
Cosine Similarity Search  ← pre-built FAISS index from knowledge_base.json
     │
     ├── No match → Fallback response + log to SQLite
     │
     └── Match found → Gemma 4 E2B QAT (~1GB)
                            │
                            ▼
                       Natural language answer (1-2 sentences)
```

---

### Stack

| Layer | Technology |
|---|---|
| Embedder | `all-MiniLM-L6-v2` via sentence-transformers |
| Vector index | NumPy cosine similarity + saved `.npy` index |
| Generator | Gemma 4 E2B QAT GGUF via `llama-cpp-python` |
| API server | FastAPI + Uvicorn |
| Knowledge base | Hand-crafted `knowledge_base.json` (57 facts) |
| Gap logging | SQLite (`unknown_queries.db`) |
| Runtime target | Raspberry Pi 5 8GB, under 1GB total |

---

### Files built

```
gokul-ai/
├── knowledge_base.json      # 57 structured facts about Gokul
├── build_index.py           # embeds KB → saves index/
├── index/
│   ├── embeddings.npy       # pre-computed normalized vectors
│   └── facts.json           # facts + ids + topics
├── retrieval.py             # cosine search, two-tier threshold
├── generator.py             # llama-cpp-python wrapper, Gemma 4
├── chat.py                  # terminal test loop with intent detection
├── main.py                  # FastAPI server, /ask, /retrain, /unknown-queries
└── unknown_queries.db       # auto-logged unanswered questions
```

---

### Key design decisions made

- **No training from scratch** — retrieval over structured facts sidesteps the data problem entirely
- **Two-tier confidence threshold** — 0.55+ high confidence, 0.30–0.55 medium, below → fallback
- **Intent detection before retrieval** — greetings/thanks/farewells never touch the model
- **Gap logging** — unknown questions saved to SQLite so you can expand the KB over time
- **`/retrain` endpoint** — add facts to KB, hit the endpoint, index rebuilds without server restart
- **Model loaded once at startup** — not per request, keeps latency low

---

### What's remaining

- [ ] Swap to Gemma 4 E2B QAT and verify quality vs Qwen 0.5B
- [ ] Tune threshold after seeing real Gemma 4 scores
- [ ] Add more KB facts (education, hobbies, personal background)
- [ ] Deploy to Pi 5 (compile llama.cpp ARM64, systemd service)
- [ ] Wire the FastAPI `/ask` endpoint into the 3D portfolio frontend
- [ ] Add CORS headers to `main.py` for browser calls

Want me to generate the Pi 5 deployment script or the CORS-ready `main.py` next?