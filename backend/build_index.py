# build_index.py
import json
import numpy as np
from sentence_transformers import SentenceTransformer

print("Loading embedder...")
model = SentenceTransformer("./models/embedder")

with open("knowledge_base.json") as f:
    kb = json.load(f)

facts = [entry["fact"] for entry in kb]
ids = [entry["id"] for entry in kb]
topics = [entry["topic"] for entry in kb]

print(f"Embedding {len(facts)} facts...")
embeddings = model.encode(facts, convert_to_numpy=True, show_progress_bar=True)

# Normalize for cosine similarity
norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
embeddings_normalized = embeddings / (norms + 1e-8)

np.save("index/embeddings.npy", embeddings_normalized)
with open("index/facts.json", "w") as f:
    json.dump({"facts": facts, "ids": ids, "topics": topics}, f, indent=2)

print(f"Index built. {len(facts)} facts saved to index/")