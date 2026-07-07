# Build & service tooling

Everything needed to bundle the backend for another machine and run it as
a long-lived background service with `start` / `stop` / `restart` / `status`.

## Bundling

```
build/build.sh                  # Linux/macOS → build/dist/*.tar.gz
build/build.sh --with-models    # include downloaded models (~3.5 GB)

powershell -ExecutionPolicy Bypass -File build\build.ps1 [-WithModels]   # Windows → .zip
```

The bundle contains code, setup scripts, and service tooling only — never
`.env`, `knowledge_base.json`, logs, or databases. On the target machine:

1. Extract the archive.
2. Run the setup script for that OS (`setup/README.md`) — it creates the
   venv, detects GPU/CPU, and downloads any models not bundled.
3. Start the service (below).

## Running as a service

### Quick: pid-file controller (no root, works everywhere)

```
build/service.sh start|stop|restart|status                              # Linux/macOS
powershell -ExecutionPolicy Bypass -File build\service.ps1 start|...    # Windows
```

Logs go to `build/assistant.log`. The process survives closing the
terminal but not a reboot — use the options below for boot-time services.

### Linux: systemd (recommended for servers)

Template: `portfolio-assistant.service` (install steps in its header).
Gives auto-restart on crash, start on boot, and `journalctl` logging:

```
sudo systemctl start|stop|restart|status portfolio-assistant
```

### macOS: launchd

Template: `com.portfolio-assistant.plist` (install steps in its header).
Starts at login and restarts on crash.

### Windows: real service (starts on boot, auto-restart)

Two good options, both wrapping `.venv\Scripts\python.exe main.py`:

**NSSM** (simplest): download from https://nssm.cc, then:

```
nssm install PortfolioAssistant "C:\path\to\backend\.venv\Scripts\python.exe" main.py
nssm set PortfolioAssistant AppDirectory "C:\path\to\backend"
nssm start PortfolioAssistant
```

Manage with `nssm start|stop|restart|status PortfolioAssistant` or the
Windows Services panel.

**Task Scheduler** (no extra tools): create a task with trigger
"At startup", action `C:\path\to\backend\.venv\Scripts\python.exe main.py`,
"Start in" set to the backend folder, and "Run whether user is logged on
or not".

## GPU / CPU

Compute mode lives in `.env` (`LLM_GPU_LAYERS`, `WHISPER_DEVICE`,
`WHISPER_COMPUTE`) — set by the setup scripts after GPU detection and
respected identically in foreground, pid-file, and system-service modes.
If the GPU stack breaks (driver update, missing cuDNN), Whisper falls
back to CPU at startup on its own; the server never fails to start
because of a GPU problem.
