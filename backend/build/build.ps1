# Bundle the backend into a distributable archive (Windows).
# Usage: powershell -ExecutionPolicy Bypass -File build\build.ps1 [-WithModels]
#
# The bundle contains code, setup scripts, and service tooling - no venv,
# no .env, no personal knowledge base, no logs/databases. On the target
# machine: extract, run setup\setup-windows.ps1, then build\service.ps1 start.

param([switch]$WithModels)

$ErrorActionPreference = "Stop"
$AppDir  = Split-Path -Parent $PSScriptRoot
$DistDir = Join-Path $PSScriptRoot "dist"
$Stage   = Join-Path $DistDir "portfolio-assistant-backend"

if (Test-Path $Stage) { Remove-Item $Stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $Stage, "$Stage\models", "$Stage\index", "$Stage\build" | Out-Null

Set-Location $AppDir
Copy-Item *.py, requirements.txt, .env.example, knowledge_base.sample.json $Stage
Copy-Item setup -Destination "$Stage\setup" -Recurse
foreach ($f in @("service.sh", "service.ps1", "build.sh", "build.ps1",
                 "portfolio-assistant.service", "com.portfolio-assistant.plist", "README.md")) {
    Copy-Item (Join-Path $PSScriptRoot $f) "$Stage\build\"
}

if ($WithModels) {
    Write-Host "Including models (~3.5 GB)..."
    foreach ($m in @("generator", "tts", "embedder")) {
        $src = Join-Path $AppDir "models\$m"
        if (Test-Path $src) { Copy-Item $src -Destination "$Stage\models\$m" -Recurse }
        else { Write-Host "WARNING: models\$m missing - run setup first for a full bundle." }
    }
}

$Archive = Join-Path $DistDir ("portfolio-assistant-backend-{0}.zip" -f (Get-Date -Format "yyyyMMdd"))
if (Test-Path $Archive) { Remove-Item $Archive }
Compress-Archive -Path $Stage -DestinationPath $Archive
Remove-Item $Stage -Recurse -Force

Write-Host "Bundle ready: $Archive"
Write-Host "On the target machine: extract, run setup\setup-windows.ps1, then build\service.ps1 start"
