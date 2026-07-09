# build_qa_index.py — consolidates training_data/ batches into index/qa_flows.json
import json
from pathlib import Path

TRAINING_DATA_DIR = Path("training_data")
INDEX_DIR = Path("index")
INDEX_DIR.mkdir(exist_ok=True)

flows = []
batch_files = sorted(TRAINING_DATA_DIR.glob("assistant_dataset_batch_*.json"))

if not batch_files:
    print("No training data batches found in training_data/")
    raise SystemExit(1)

for batch_file in batch_files:
    with open(batch_file) as f:
        flows.extend(json.load(f))

# Group by category for fast keyword-based retrieval
by_category: dict[str, list] = {}
for flow in flows:
    cat = flow.get("category", "unknown")
    by_category.setdefault(cat, []).append(flow)

output = {
    "total": len(flows),
    "categories": list(by_category.keys()),
    "by_category": by_category,
}

out_path = INDEX_DIR / "qa_flows.json"
with open(out_path, "w") as f:
    json.dump(output, f, separators=(",", ":"))

print(f"Q&A index built: {len(flows)} flows across {len(by_category)} categories → {out_path}")
for cat, items in sorted(by_category.items(), key=lambda x: -len(x[1])):
    print(f"  {cat}: {len(items)}")
