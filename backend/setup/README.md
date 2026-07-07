# First-time setup

One script per OS. Each one checks Python (3.10+), creates `.venv`,
installs dependencies, detects a GPU (falling back to CPU), downloads all
models (embedder, TTS voice, generator GGUF, Whisper cache), prepares
`.env` and the knowledge base, and prints run instructions. All scripts
are idempotent — re-running skips anything already done.

| OS      | Command (from `backend/`)                                      | GPU support            |
|---------|----------------------------------------------------------------|------------------------|
| Linux   | `bash setup/setup-linux.sh`                                    | NVIDIA CUDA            |
| macOS   | `bash setup/setup-macos.sh`                                    | Metal (Apple Silicon)  |
| Windows | `powershell -ExecutionPolicy Bypass -File setup\setup-windows.ps1` | NVIDIA CUDA        |

## GPU detection

- **Linux / Windows** — if `nvidia-smi` works, the CUDA build of
  llama-cpp-python is installed and `.env` gets `LLM_GPU_LAYERS=-1`,
  `WHISPER_DEVICE=cuda`. If the CUDA wheel can't be installed, the script
  falls back to the CPU build automatically.
- **macOS** — Apple Silicon gets Metal offload for the LLM
  (`LLM_GPU_LAYERS=-1`); Whisper stays on CPU (no Metal backend).
- **Runtime fallback** — even with GPU settings in `.env`, the server
  falls back to CPU if the GPU stack fails to load, so it always starts.

To force CPU on any machine, set in `.env`:

```
LLM_GPU_LAYERS=0
WHISPER_DEVICE=cpu
WHISPER_COMPUTE=int8
```

## After setup

```
# Foreground (from backend/)
.venv/bin/python main.py            # Linux/macOS
.venv\Scripts\python.exe main.py    # Windows

# Background service with start/stop/restart/status
build/service.sh start              # Linux/macOS
powershell -File build\service.ps1 start   # Windows
```

Server listens on `http://0.0.0.0:16000` (change `PORT` in `.env`).
Remember to replace the sample `knowledge_base.json` with your own facts
and re-run `python build_index.py`.
