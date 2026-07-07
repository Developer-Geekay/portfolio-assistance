#!/usr/bin/env bash
# First-time backend setup for Linux.
# Checks Python, creates the venv, installs dependencies (GPU-aware with CPU
# fallback), downloads the embedder / TTS / generator models, and prints how
# to run the server. Safe to re-run: every step skips work already done.
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$BACKEND_DIR"

PYTHON="${PYTHON:-python3}"

echo "== Backend setup (Linux) =="

# --- 1. Python ---------------------------------------------------------------
if ! command -v "$PYTHON" >/dev/null 2>&1; then
    echo "ERROR: python3 not found."
    echo "Install Python 3.10+ first, e.g.: sudo apt install python3 python3-venv python3-pip"
    exit 1
fi
"$PYTHON" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' || {
    echo "ERROR: Python 3.10+ required, found $("$PYTHON" --version)"
    exit 1
}
echo "Python: $("$PYTHON" --version)"

# --- 2. Virtual env ----------------------------------------------------------
if [ ! -d .venv ]; then
    "$PYTHON" -m venv .venv
    echo "Created .venv"
fi
PIP=".venv/bin/pip"
PY=".venv/bin/python"
"$PIP" install --quiet --upgrade pip

# --- 3. GPU detection (NVIDIA), CPU fallback ---------------------------------
COMPUTE=cpu
if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi >/dev/null 2>&1; then
    COMPUTE=cuda
    echo "GPU detected: $(nvidia-smi --query-gpu=name --format=csv,noheader | head -1)"
else
    echo "No NVIDIA GPU detected — using CPU."
fi

# llama-cpp-python: prebuilt wheel for the detected backend, CPU as fallback
if [ "$COMPUTE" = cuda ]; then
    "$PIP" install llama-cpp-python \
        --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu124 || {
        echo "CUDA wheel unavailable — falling back to CPU build."
        COMPUTE=cpu
    }
fi
if [ "$COMPUTE" = cpu ]; then
    "$PIP" install llama-cpp-python \
        --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu \
        || "$PIP" install llama-cpp-python
fi

# --- 4. Remaining dependencies -----------------------------------------------
"$PIP" install -r requirements.txt
if [ "$COMPUTE" = cuda ]; then
    # CUDA runtime libs for faster-whisper (ctranslate2); harmless if unused
    "$PIP" install nvidia-cublas-cu12 nvidia-cudnn-cu12 || true
fi

# --- 5. .env -----------------------------------------------------------------
[ -f .env ] || { cp .env.example .env; echo "Created .env from .env.example — edit persona/admin values."; }
set_env() {
    if grep -q "^$1=" .env; then
        sed -i "s|^$1=.*|$1=$2|" .env
    else
        # guard against a final line with no trailing newline before appending
        [ -n "$(tail -c1 .env)" ] && echo >> .env
        printf '%s=%s\n' "$1" "$2" >> .env
    fi
}
if [ "$COMPUTE" = cuda ]; then
    set_env LLM_GPU_LAYERS -1
    set_env WHISPER_DEVICE cuda
    set_env WHISPER_COMPUTE float16
else
    set_env LLM_GPU_LAYERS 0
    set_env WHISPER_DEVICE cpu
    set_env WHISPER_COMPUTE int8
fi
echo "Compute mode written to .env: $COMPUTE"

# --- 6. Knowledge base -------------------------------------------------------
[ -f knowledge_base.json ] || {
    cp knowledge_base.sample.json knowledge_base.json
    echo "Created knowledge_base.json from sample — replace with your own facts."
}

# --- 7. Models ---------------------------------------------------------------
mkdir -p models/generator models/tts index

GEN_FILE="models/generator/gemma-4-e2b-it-qat-q4.gguf"
GEN_URL="https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/gemma-4-E2B-it-UD-Q4_K_XL.gguf"
if [ ! -f "$GEN_FILE" ]; then
    echo "Downloading generator model (~3 GB, one time)..."
    curl -L --fail --progress-bar -o "$GEN_FILE" "$GEN_URL"
fi

TTS_BASE="https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium"
for f in en_US-lessac-medium.onnx en_US-lessac-medium.onnx.json; do
    [ -f "models/tts/$f" ] || curl -L --fail --progress-bar -o "models/tts/$f" "$TTS_BASE/$f"
done

if [ ! -f models/embedder/config.json ]; then
    echo "Downloading embedder model..."
    "$PY" download_model.py
fi

echo "Caching Whisper model..."
"$PY" - <<'EOF'
import os
from dotenv import load_dotenv
load_dotenv()
from faster_whisper import WhisperModel
WhisperModel(os.environ.get("WHISPER_MODEL", "base.en"), device="cpu", compute_type="int8")
print("Whisper model cached.")
EOF

"$PY" build_index.py

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
