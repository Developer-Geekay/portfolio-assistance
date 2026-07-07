# First-time backend setup for Windows (PowerShell).
# Checks Python, creates the venv, installs dependencies (CUDA GPU-aware with
# CPU fallback), downloads the embedder / TTS / generator models, and prints
# how to run the server. Safe to re-run.
#
# Run from PowerShell:
#   powershell -ExecutionPolicy Bypass -File setup\setup-windows.ps1

$ErrorActionPreference = "Stop"
$BackendDir = Split-Path -Parent $PSScriptRoot
Set-Location $BackendDir

Write-Host "== Backend setup (Windows) =="

# --- 1. Python ----------------------------------------------------------------
$Python = $null
foreach ($candidate in @("python", "python3", "py")) {
    $cmd = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($cmd) { $Python = $candidate; break }
}
if (-not $Python) {
    Write-Host "ERROR: Python not found. Install Python 3.10+ (64-bit) from https://www.python.org/downloads/windows/"
    Write-Host "During install, tick 'Add python.exe to PATH'."
    exit 1
}
& $Python -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)"
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Python 3.10+ required, found $(& $Python --version)"
    exit 1
}
Write-Host "Python: $(& $Python --version)"

# --- 2. Virtual env -------------------------------------------------------------
if (-not (Test-Path ".venv")) {
    & $Python -m venv .venv
    Write-Host "Created .venv"
}
$VenvPy = Join-Path $BackendDir ".venv\Scripts\python.exe"
& $VenvPy -m pip install --quiet --upgrade pip

# --- 3. GPU detection (NVIDIA), CPU fallback ------------------------------------
$Compute = "cpu"
if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
    nvidia-smi | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $Compute = "cuda"
        $gpuName = (nvidia-smi --query-gpu=name --format=csv,noheader | Select-Object -First 1)
        Write-Host "GPU detected: $gpuName"
    }
}
if ($Compute -eq "cpu") { Write-Host "No NVIDIA GPU detected - using CPU." }

# llama-cpp-python: prebuilt wheel for the detected backend, CPU as fallback.
# The CUDA index must be the ONLY index for this install — PyPI carries newer
# source-only releases that would otherwise win and build a CPU-only binary.
function Invoke-QuietPython([string[]]$PyArgs) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & $VenvPy @PyArgs 2>&1 | Out-Null
    $ok = ($LASTEXITCODE -eq 0)
    $ErrorActionPreference = $prev
    return $ok
}
if ($Compute -eq "cuda") {
    $hasCuda = Invoke-QuietPython @("-c", "import llama_cpp, sys; sys.exit(0 if llama_cpp.llama_supports_gpu_offload() else 1)")
    if (-not $hasCuda) {
        & $VenvPy -m pip install --force-reinstall --no-deps --only-binary=:all: llama-cpp-python `
            --index-url https://abetlen.github.io/llama-cpp-python/whl/cu124
        if ($LASTEXITCODE -ne 0) {
            Write-Host "CUDA wheel unavailable - falling back to CPU build."
            $Compute = "cpu"
        }
    }
}
if ($Compute -eq "cpu") {
    $hasLlama = Invoke-QuietPython @("-c", "import llama_cpp")
    if (-not $hasLlama) {
        & $VenvPy -m pip install llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu
        if ($LASTEXITCODE -ne 0) { & $VenvPy -m pip install llama-cpp-python }
    }
}

# --- 4. Remaining dependencies ---------------------------------------------------
& $VenvPy -m pip install -r requirements.txt
if ($Compute -eq "cuda") {
    # CUDA runtime libs for llama.cpp and faster-whisper (ctranslate2):
    # cudart for llama.dll, cublas for both, cudnn for ctranslate2
    & $VenvPy -m pip install nvidia-cuda-runtime-cu12 nvidia-cublas-cu12 nvidia-cudnn-cu12
}

# --- 5. .env ---------------------------------------------------------------------
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created .env from .env.example - edit persona/admin values."
}
function Set-EnvValue([string]$Key, [string]$Value) {
    # Rewrite as a line array so appends never glue onto a final line
    # that lacks a trailing newline
    $lines = @(Get-Content ".env")
    if ($lines -match "^$Key=") {
        $lines = $lines -replace "^$Key=.*", "$Key=$Value"
    } else {
        $lines += "$Key=$Value"
    }
    Set-Content ".env" $lines
}
if ($Compute -eq "cuda") {
    Set-EnvValue "LLM_GPU_LAYERS" "-1"
    Set-EnvValue "WHISPER_DEVICE" "cuda"
    Set-EnvValue "WHISPER_COMPUTE" "float16"
} else {
    Set-EnvValue "LLM_GPU_LAYERS" "0"
    Set-EnvValue "WHISPER_DEVICE" "cpu"
    Set-EnvValue "WHISPER_COMPUTE" "int8"
}
Write-Host "Compute mode written to .env: $Compute"

# --- 6. Knowledge base -------------------------------------------------------------
if (-not (Test-Path "knowledge_base.json")) {
    Copy-Item "knowledge_base.sample.json" "knowledge_base.json"
    Write-Host "Created knowledge_base.json from sample - replace with your own facts."
}

# --- 7. Models ---------------------------------------------------------------------
New-Item -ItemType Directory -Force -Path "models\generator", "models\tts", "index" | Out-Null

$GenFile = "models\generator\gemma-4-e2b-it-qat-q4.gguf"
$GenUrl  = "https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/gemma-4-E2B-it-UD-Q4_K_XL.gguf"
if (-not (Test-Path $GenFile)) {
    Write-Host "Downloading generator model (~3 GB, one time)..."
    curl.exe -L --fail -o $GenFile $GenUrl
    if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: generator model download failed."; exit 1 }
}

$TtsBase = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium"
foreach ($f in @("en_US-lessac-medium.onnx", "en_US-lessac-medium.onnx.json")) {
    if (-not (Test-Path "models\tts\$f")) {
        curl.exe -L --fail -o "models\tts\$f" "$TtsBase/$f"
        if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: TTS voice download failed."; exit 1 }
    }
}

if (-not (Test-Path "models\embedder\config.json")) {
    Write-Host "Downloading embedder model..."
    & $VenvPy download_model.py
}

Write-Host "Caching Whisper model..."
& $VenvPy -c @"
import os
from dotenv import load_dotenv
load_dotenv()
from faster_whisper import WhisperModel
WhisperModel(os.environ.get('WHISPER_MODEL', 'base.en'), device='cpu', compute_type='int8')
print('Whisper model cached.')
"@

& $VenvPy build_index.py

# --- 8. Done -------------------------------------------------------------------------
Write-Host ""
Write-Host "== Setup complete ($Compute mode) =="
Write-Host ""
Write-Host "Run the server:"
Write-Host "    cd $BackendDir"
Write-Host "    .venv\Scripts\python.exe main.py     # serves on http://0.0.0.0:16000"
Write-Host ""
Write-Host "Or run it as a managed background service:"
Write-Host "    powershell -ExecutionPolicy Bypass -File build\service.ps1 start|stop|restart|status"
Write-Host ""
Write-Host "Edit .env for persona, admin key, and port."
