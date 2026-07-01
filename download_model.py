# Run this once to download and cache locally
# create a file: download_model.py

from sentence_transformers import SentenceTransformer

model = SentenceTransformer("all-MiniLM-L6-v2")
model.save("./models/embedder")
print("Model saved. Size:", )
