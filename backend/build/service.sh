#!/usr/bin/env bash
# Background service controller for Linux/macOS (pid-file based, no root needed).
# Usage: build/service.sh start|stop|restart|status
# For boot-time services use the systemd/launchd templates in this folder.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$APP_DIR/build/assistant.pid"
LOG_FILE="$APP_DIR/build/assistant.log"
# venv lives in backend/ (setup scripts, bundles) or one level up (repo root)
PY="$APP_DIR/.venv/bin/python"
[ -x "$PY" ] || PY="$APP_DIR/../.venv/bin/python"

is_running() {
    [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

start() {
    if is_running; then
        echo "Already running (pid $(cat "$PID_FILE"))"
        return
    fi
    [ -x "$PY" ] || { echo "ERROR: .venv not found — run the setup script first."; exit 1; }
    cd "$APP_DIR"
    nohup "$PY" main.py >> "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    echo "Started (pid $(cat "$PID_FILE")) — log: $LOG_FILE"
}

stop() {
    if ! is_running; then
        echo "Not running."
        rm -f "$PID_FILE"
        return
    fi
    local pid
    pid="$(cat "$PID_FILE")"
    kill "$pid"
    for _ in $(seq 1 20); do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.5
    done
    if kill -0 "$pid" 2>/dev/null; then
        echo "Graceful stop timed out — killing pid $pid"
        kill -9 "$pid"
    fi
    rm -f "$PID_FILE"
    echo "Stopped."
}

status() {
    if is_running; then
        echo "Running (pid $(cat "$PID_FILE")) — log: $LOG_FILE"
    else
        echo "Stopped."
    fi
}

case "${1:-status}" in
    start)   start ;;
    stop)    stop ;;
    restart) stop; start ;;
    status)  status ;;
    *) echo "Usage: $0 start|stop|restart|status"; exit 1 ;;
esac
