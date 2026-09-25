# First-time backend setup for Windows (PowerShell).
# Checks Python, creates/detects the venv, installs dependencies (CUDA GPU-aware with
# CPU fallback), downloads Kokoro TTS / generator models, and prints
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
$VenvDir = $null
if (Test-Path "assistantenv\Scripts\python.exe") {
    $VenvDir = "assistantenv"
    Write-Host "Using existing virtual environment: assistantenv"
} elseif (Test-Path ".venv\Scripts\python.exe") {
    $VenvDir = ".venv"
    Write-Host "Using existing virtual environment: .venv"
} else {
    $VenvDir = ".venv"
    & $Python -m venv .venv
    Write-Host "Created .venv"
}
$VenvPy = Join-Path $BackendDir "$VenvDir\Scripts\python.exe"
& $VenvPy -m pip install --quiet --upgrade pip

# --- 3. GPU detection (NVIDIA), CPU fallback ------------------------------------
$Compute = "cpu"
$HasNvidiaGpu = $false
if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
    nvidia-smi | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $HasNvidiaGpu = $true
        $gpuName = (nvidia-smi --query-gpu=name --format=csv,noheader | Select-Object -First 1)
        Write-Host "GPU detected: $gpuName"
    }
}
if (-not $HasNvidiaGpu) {
    Write-Host "No NVIDIA GPU detected - using CPU mode."
}

function Invoke-QuietPython([string[]]$PyArgs) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & $VenvPy @PyArgs 2>&1 | Out-Null
    $ok = ($LASTEXITCODE -eq 0)
    $ErrorActionPreference = $prev
    return $ok
}

if ($HasNvidiaGpu) {
    Write-Host "Installing NVIDIA CUDA runtime packages for Windows..."
    & $VenvPy -m pip install nvidia-cuda-runtime-cu12 nvidia-cublas-cu12 nvidia-cudnn-cu12
}

# Check CUDA Toolkit / nvcc for compiling llama-cpp-python with CUDA
$hasNvcc = $false
if (Get-Command nvcc -ErrorAction SilentlyContinue) {
    $hasNvcc = $true
} else {
    # Check default CUDA installation paths on Windows
    $cudaDirs = Get-Item "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v*" -ErrorAction SilentlyContinue
    if ($cudaDirs) {
        $latestCuda = $cudaDirs | Sort-Object Name -Descending | Select-Object -First 1
        $cudaBin = Join-Path $latestCuda.FullName "bin"
        if (Test-Path (Join-Path $cudaBin "nvcc.exe")) {
            $env:PATH = "$cudaBin;$env:PATH"
            $env:CUDA_PATH = $latestCuda.FullName
            $hasNvcc = $true
            Write-Host "Found CUDA Toolkit at: $($latestCuda.FullName)"
        }
    }
}

$hasLlamaGpu = Invoke-QuietPython @("-c", "import llama_cpp, sys; sys.exit(0 if llama_cpp.llama_supports_gpu_offload() else 1)")
if ($hasLlamaGpu) {
    Write-Host "llama-cpp-python already installed with GPU offload support."
    $Compute = "cuda"
} elseif ($HasNvidiaGpu -and $hasNvcc) {
    Write-Host "Compiling llama-cpp-python with CUDA support (-DGGML_CUDA=on)..."
    $env:CMAKE_ARGS = "-DGGML_CUDA=on"
    & $VenvPy -m pip install --no-cache-dir --force-reinstall llama-cpp-python
    $hasLlamaGpu = Invoke-QuietPython @("-c", "import llama_cpp, sys; sys.exit(0 if llama_cpp.llama_supports_gpu_offload() else 1)")
    if ($hasLlamaGpu) {
        $Compute = "cuda"
        Write-Host "Successfully installed llama-cpp-python with CUDA support!"
    } else {
        Write-Host "WARNING: CUDA compilation did not enable GPU offload. Inference will run on CPU."
    }
} elseif ($HasNvidiaGpu -and -not $hasNvcc) {
    Write-Host ""
    Write-Host "NOTE: NVIDIA GPU detected. Whisper will run with CUDA acceleration."
    Write-Host "To enable CUDA offload for LLM (Gemma), install NVIDIA CUDA Toolkit 12.x from:"
    Write-Host "  https://developer.nvidia.com/cuda-downloads"
    Write-Host "Inference will run on CPU until CUDA Toolkit is installed."
    Write-Host ""
    $hasLlama = Invoke-QuietPython @("-c", "import llama_cpp")
    if (-not $hasLlama) {
        & $VenvPy -m pip install llama-cpp-python
    }
} else {
    $hasLlama = Invoke-QuietPython @("-c", "import llama_cpp")
    if (-not $hasLlama) {
        & $VenvPy -m pip install llama-cpp-python
    }
}

# --- 4. Remaining dependencies ---------------------------------------------------
& $VenvPy -m pip install -r requirements.txt

# --- 5. .env ---------------------------------------------------------------------
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created .env from .env.example - edit persona/admin values."
}
function Set-EnvValue([string]$Key, [string]$Value) {
    $lines = @(Get-Content ".env")
    if ($lines -match "^$Key=") {
        $lines = $lines -replace "^$Key=.*", "$Key=$Value"
    } else {
        $lines += "$Key=$Value"
    }
    Set-Content ".env" $lines
}

if ($HasNvidiaGpu) {
    Set-EnvValue "WHISPER_DEVICE" "cuda"
    Set-EnvValue "WHISPER_COMPUTE" "float16"
    Set-EnvValue "LLM_GPU_LAYERS" "-1"
} else {
    Set-EnvValue "WHISPER_DEVICE" "cpu"
    Set-EnvValue "WHISPER_COMPUTE" "int8"
    Set-EnvValue "LLM_GPU_LAYERS" "0"
}
Write-Host "Compute configuration written to .env (Whisper: $(if ($HasNvidiaGpu) { 'cuda' } else { 'cpu' }), LLM: $(if ($Compute -eq 'cuda') { 'cuda' } else { 'cpu' }))"

# --- 6. Knowledge base -------------------------------------------------------------
if (-not (Test-Path "knowledge_base.json")) {
    Copy-Item "knowledge_base.sample.json" "knowledge_base.json"
    Write-Host "Created knowledge_base.json from sample - replace with your own facts."
}

# --- 7. Models ---------------------------------------------------------------------
New-Item -ItemType Directory -Force -Path "models\generator", "models\tts", "index" | Out-Null

$GenFile = "models\generator\gemma-4-E4B_q4_0-it.gguf"
$GenUrl  = "https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF/resolve/main/gemma-4-E4B-it-Q4_0.gguf"
if (-not (Test-Path $GenFile)) {
    Write-Host "Downloading generator model (~4.6 GB, one time)..."
    curl.exe -L --fail -o $GenFile $GenUrl
    if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: generator model download failed."; exit 1 }
}

# Kokoro-82M ONNX TTS models (Primary)
$KokoroModel = "models\tts\kokoro-v1.0.onnx"
$KokoroVoices = "models\tts\voices-v1.0.bin"
$KokoroBase = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0"

if (-not (Test-Path $KokoroModel)) {
    Write-Host "Downloading Kokoro-82M ONNX model (~340 MB)..."
    curl.exe -L --fail -o $KokoroModel "$KokoroBase/kokoro-v1.0.onnx"
}
if (-not (Test-Path $KokoroVoices)) {
    Write-Host "Downloading Kokoro voices file (~27 MB)..."
    curl.exe -L --fail -o $KokoroVoices "$KokoroBase/voices-v1.0.bin"
}

# Piper fallback voice
$PiperModel = "models\tts\en_US-lessac-medium.onnx"
$PiperJson = "models\tts\en_US-lessac-medium.onnx.json"
$PiperBase = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium"
if (-not (Test-Path $PiperModel)) {
    curl.exe -L --fail -o $PiperModel "$PiperBase/en_US-lessac-medium.onnx"
}
if (-not (Test-Path $PiperJson)) {
    curl.exe -L --fail -o $PiperJson "$PiperBase/en_US-lessac-medium.onnx.json"
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

if (Test-Path "build_qa_index.py") {
    Write-Host "Building Q&A index..."
    & $VenvPy build_qa_index.py
} elseif (Test-Path "build_index.py") {
    & $VenvPy build_index.py
}

# --- 8. Done -------------------------------------------------------------------------
Write-Host ""
Write-Host "== Setup complete =="
Write-Host ""
Write-Host "Run the server:"
Write-Host "    cd $BackendDir"
Write-Host "    $VenvDir\Scripts\python.exe main.py     # serves on http://0.0.0.0:16000"
Write-Host ""
Write-Host "Or run it as a managed background service:"
Write-Host "    powershell -ExecutionPolicy Bypass -File build\service.ps1 start|stop|restart|status"
Write-Host ""
Write-Host "Edit .env for persona, admin key, and port."
