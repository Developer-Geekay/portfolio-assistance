# retrieval.py
import json
import numpy as np
from sentence_transformers import SentenceTransformer

print("Loading embedder...")
model = SentenceTransformer("./models/embedder")

# Load pre-built index
embeddings = np.load("index/embeddings.npy")
with open("index/facts.json") as f:
    data = json.load(f)

facts = data["facts"]
ids = data["ids"]
topics = data["topics"]

print(f"Index loaded: {len(facts)} facts ready.")


def retrieve(question: str, top_k: int = 2):
    q_emb = model.encode([question], convert_to_numpy=True)
    q_emb = q_emb / (np.linalg.norm(q_emb) + 1e-8)

    scores = np.dot(embeddings, q_emb.T).flatten()
    top_idx = np.argsort(scores)[::-1][:top_k]

    best_score = float(scores[top_idx[0]])

    # Tier 1: high confidence — return result directly
    if best_score >= 0.55:
        threshold = 0.50

    # Tier 2: medium confidence — still return, but generator
    # is told to be cautious
    elif best_score >= 0.30:
        threshold = 0.28

    # Tier 3: too weak — genuine fallback
    else:
        return []

    results = []
    for idx in top_idx:
        if scores[idx] >= threshold:
            results.append({
                "fact": facts[idx],
                "id": ids[idx],
                "topic": topics[idx],
                "score": float(scores[idx]),
                "confidence": "high" if best_score >= 0.55 else "medium"
            })
    return results

if __name__ == "__main__":
    tests = [
        "describe about him",
        "What certifications does Gokul have?",
        "other than technical who is he",
        "how many technologies does he know",
        "where does he work",
        "what projects has he built",
    ]
    for q in tests:
        q_emb = model.encode([q], convert_to_numpy=True)
        q_emb = q_emb / (np.linalg.norm(q_emb) + 1e-8)
        scores = np.dot(embeddings, q_emb.T).flatten()
        top_idx = np.argsort(scores)[::-1][:3]
        print(f"\nQ: {q}")
        for idx in top_idx:
            print(f"  [{scores[idx]:.3f}] [{topics[idx]}] {facts[idx][:90]}")