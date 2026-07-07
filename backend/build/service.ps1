# Background service controller for Windows (pid-file based).
# Usage: powershell -ExecutionPolicy Bypass -File build\service.ps1 start|stop|restart|status
# For a real boot-time Windows service, see build\README.md (NSSM / Task Scheduler).

param(
    [Parameter(Position = 0)]
    [ValidateSet("start", "stop", "restart", "status")]
    [string]$Command = "status"
)

$ErrorActionPreference = "Stop"
$AppDir  = Split-Path -Parent $PSScriptRoot
$PidFile = Join-Path $PSScriptRoot "assistant.pid"
$OutLog  = Join-Path $PSScriptRoot "assistant.log"
$ErrLog  = Join-Path $PSScriptRoot "assistant.err.log"
# venv lives in backend\ (setup scripts, bundles) or one level up (repo root)
$Python = Join-Path $AppDir ".venv\Scripts\python.exe"
if (-not (Test-Path $Python)) {
    $Python = Join-Path (Split-Path -Parent $AppDir) ".venv\Scripts\python.exe"
}

function Get-AssistantProcess {
    if (-not (Test-Path $PidFile)) { return $null }
    $savedId = Get-Content $PidFile
    return Get-Process -Id $savedId -ErrorAction SilentlyContinue
}

function Start-Assistant {
    $proc = Get-AssistantProcess
    if ($proc) { Write-Host "Already running (pid $($proc.Id))"; return }
    if (-not (Test-Path $Python)) {
        Write-Host "ERROR: .venv not found - run setup\setup-windows.ps1 first."
        exit 1
    }
    $proc = Start-Process -FilePath $Python -ArgumentList "main.py" `
        -WorkingDirectory $AppDir -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $OutLog -RedirectStandardError $ErrLog
    $proc.Id | Set-Content $PidFile
    Write-Host "Started (pid $($proc.Id)) - log: $OutLog"
}

function Stop-Assistant {
    $proc = Get-AssistantProcess
    if (-not $proc) {
        Write-Host "Not running."
        Remove-Item $PidFile -ErrorAction SilentlyContinue
        return
    }
    Stop-Process -Id $proc.Id
    $proc.WaitForExit(10000) | Out-Null
    if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    Remove-Item $PidFile -ErrorAction SilentlyContinue
    Write-Host "Stopped."
}

function Get-AssistantStatus {
    $proc = Get-AssistantProcess
    if ($proc) {
        Write-Host "Running (pid $($proc.Id)) - log: $OutLog"
    } else {
        Write-Host "Stopped."
    }
}

switch ($Command) {
    "start"   { Start-Assistant }
    "stop"    { Stop-Assistant }
    "restart" { Stop-Assistant; Start-Assistant }
    "status"  { Get-AssistantStatus }
}
