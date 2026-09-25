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
if [ ! -d .venv ]; then
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
    set_env LLM_GPU_LAYERS -1
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

# Kokoro-82M ONNX TTS models (Primary)
KOKORO_BASE="https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0"
[ -f "models/tts/kokoro-v1.0.onnx" ] || curl -L --fail --progress-bar -o "models/tts/kokoro-v1.0.onnx" "$KOKORO_BASE/kokoro-v1.0.onnx"
[ -f "models/tts/voices-v1.0.bin" ] || curl -L --fail --progress-bar -o "models/tts/voices-v1.0.bin" "$KOKORO_BASE/voices-v1.0.bin"

# Piper fallback voice
PIPER_BASE="https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium"
for f in en_US-lessac-medium.onnx en_US-lessac-medium.onnx.json; do
    [ -f "models/tts/$f" ] || curl -L --fail --progress-bar -o "models/tts/$f" "$PIPER_BASE/$f"
done

echo "Caching Whisper model..."
"$PY" - <<'EOF'
import os
from dotenv import load_dotenv
load_dotenv()
from faster_whisper import WhisperModel
WhisperModel(os.environ.get("WHISPER_MODEL", "base.en"), device="cpu", compute_type="int8")
print("Whisper model cached.")
EOF

if [ -f "build_qa_index.py" ]; then
    "$PY" build_qa_index.py
elif [ -f "build_index.py" ]; then
    "$PY" build_index.py
fi

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
