#!/usr/bin/env bash
# First-time backend setup for macOS.
# Checks Python, creates the venv, installs dependencies (Metal GPU on Apple
# Silicon, CPU otherwise), downloads the embedder / TTS / generator models,
# and prints how to run the server. Safe to re-run.
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$BACKEND_DIR"

PYTHON="${PYTHON:-python3}"

echo "== Backend setup (macOS) =="

# --- 1. Python ---------------------------------------------------------------
if ! command -v "$PYTHON" >/dev/null 2>&1; then
    echo "ERROR: python3 not found."
    echo "Install Python 3.10+ first, e.g.: brew install python@3.12"
    exit 1
fi
"$PYTHON" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' || {
    echo "ERROR: Python 3.10+ required, found $("$PYTHON" --version)"
    exit 1
}
echo "Python: $("$PYTHON" --version)"

# --- 2. Virtual env ----------------------------------------------------------
if [ -d .venv ]; then
    # A venv left half-built by a failed install is worth wiping; a good one is
    # worth keeping. Ask, and reuse it when there is nobody to answer (CI).
    reply=k
    if [ -t 0 ]; then
        printf '.venv already exists. Delete and recreate it, or keep it and install over it? [r/K] '
        read -r reply || reply=k
    else
        echo ".venv already exists — keeping it (non-interactive run)."
    fi
    case "$reply" in
        r | R)
            echo "Removing existing .venv..."
            rm -rf .venv
            "$PYTHON" -m venv .venv
            echo "Recreated .venv"
            ;;
        *)
            echo "Keeping existing .venv — packages are installed over it."
            ;;
    esac
else
    "$PYTHON" -m venv .venv
    echo "Created .venv"
fi
PIP=".venv/bin/pip"
PY=".venv/bin/python"
"$PIP" install --quiet --upgrade pip

# --- 3. GPU detection: Metal on Apple Silicon, CPU otherwise ------------------
COMPUTE=cpu
if [ "$(uname -m)" = arm64 ]; then
    COMPUTE=metal
    echo "Apple Silicon detected — enabling Metal GPU offload for the LLM."
else
    echo "Intel Mac — using CPU."
fi

# llama-cpp-python: Metal prebuilt wheel; a plain install also builds with
# Metal by default on arm64, so either path ends up GPU-capable
if [ "$COMPUTE" = metal ]; then
    "$PIP" install llama-cpp-python \
        --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/metal \
        || "$PIP" install llama-cpp-python
else
    "$PIP" install llama-cpp-python \
        --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu \
        || "$PIP" install llama-cpp-python
fi

# --- 4. Remaining dependencies -----------------------------------------------
"$PIP" install -r requirements.txt

# --- 5. .env -----------------------------------------------------------------
[ -f .env ] || { cp .env.example .env; echo "Created .env from .env.example — edit persona/admin values."; }
set_env() {
    if grep -q "^$1=" .env; then
        sed -i '' "s|^$1=.*|$1=$2|" .env
    else
        # guard against a final line with no trailing newline before appending
        [ -n "$(tail -c1 .env)" ] && echo >> .env
        printf '%s=%s\n' "$1" "$2" >> .env
    fi
}
if [ "$COMPUTE" = metal ]; then
    # Metal wires only about two thirds of unified memory, and the model needs
    # roughly its own size plus ~1.2 GB of KV cache and compute buffers. When
    # that does not fit, the model still loads and then every request dies with
    # "llama_decode returned -3", so check before enabling offload.
    RAM_GB=$(( $(sysctl -n hw.memsize) / 1024 / 1024 / 1024 ))
    GPU_BUDGET_GB=$(( RAM_GB * 2 / 3 ))
    MODEL_NEED_GB=6           # ~4.6 GB generator + ~1.2 GB working buffers
    if [ "$GPU_BUDGET_GB" -ge "$MODEL_NEED_GB" ]; then
        set_env LLM_GPU_LAYERS -1
        echo "Metal GPU offload enabled (${RAM_GB} GB unified memory, ~${GPU_BUDGET_GB} GB usable by the GPU)."
    else
        set_env LLM_GPU_LAYERS 0
        COMPUTE="cpu (Metal too small)"
        echo "WARNING: ${RAM_GB} GB unified memory leaves the GPU only ~${GPU_BUDGET_GB} GB,"
        echo "  short of the ~${MODEL_NEED_GB} GB this model needs. Configured CPU inference instead."
        echo "  CPU generation is slow (~1 token/sec here). For usable speed, set LLM_MODEL"
        echo "  in .env to a smaller model — a 2B build or a lower quant — and re-run this script."
    fi
else
    set_env LLM_GPU_LAYERS 0
fi
# Whisper has no Metal backend in ctranslate2 — CPU int8 is the right choice
set_env WHISPER_DEVICE cpu
set_env WHISPER_COMPUTE int8
echo "Compute mode written to .env: $COMPUTE"

# --- 6. Knowledge base -------------------------------------------------------
[ -f knowledge_base.json ] || {
    cp knowledge_base.sample.json knowledge_base.json
    echo "Created knowledge_base.json from sample — replace with your own facts."
}

# --- 7. Models ---------------------------------------------------------------
mkdir -p models/generator models/tts index

GEN_FILE="models/generator/gemma-4-E4B_q4_0-it.gguf"
GEN_URL="https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF/resolve/main/gemma-4-E4B-it-Q4_0.gguf"
if [ ! -f "$GEN_FILE" ]; then
    echo "Downloading generator model (~4.6 GB, one time)..."
    curl -L --fail --progress-bar -o "$GEN_FILE" "$GEN_URL"
fi

# amy is the default PIPER_VOICE in .env.example; the voice name has to match
# the directory it lives in on the hub
TTS_BASE="https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/amy/medium"
for f in en_US-amy-medium.onnx en_US-amy-medium.onnx.json; do
    [ -f "models/tts/$f" ] || curl -L --fail --progress-bar -o "models/tts/$f" "$TTS_BASE/$f"
done


echo "Caching Whisper model..."
"$PY" - <<'EOF'
import os
from dotenv import load_dotenv
# explicit path: find_dotenv() inspects the caller's stack frame and fails
# when the script is piped in on stdin
load_dotenv(".env")
from faster_whisper import WhisperModel
WhisperModel(os.environ.get("WHISPER_MODEL", "base.en"), device="cpu", compute_type="int8")
print("Whisper model cached.")
EOF

# training_data/ is not in the repo, so a fresh clone has nothing to index yet
"$PY" build_qa_index.py \
    || echo "Q&A index skipped — add batches to training_data/, then run: .venv/bin/python build_qa_index.py"

# --- 8. Done -----------------------------------------------------------------
cat <<EOF

== Setup complete ($COMPUTE mode) ==

Run the server:
    cd $BACKEND_DIR
    .venv/bin/python main.py          # serves on http://0.0.0.0:16000

Or run it as a managed background service:
    build/service.sh start|stop|restart|status

Edit .env for persona, admin key, and port.
EOF
