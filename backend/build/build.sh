#!/usr/bin/env bash
# Bundle the backend into a distributable archive (Linux/macOS).
# Usage: build/build.sh [--with-models]
#
# The bundle contains code, setup scripts, and service tooling — no venv,
# no .env, no personal knowledge base, no logs/databases. On the target
# machine: extract, run the OS setup script, then build/service.sh start.
# --with-models includes the downloaded model files so the target machine
# skips the large downloads.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$APP_DIR/build/dist"
STAGE="$DIST_DIR/portfolio-assistant-backend"
WITH_MODELS=false
[ "${1:-}" = "--with-models" ] && WITH_MODELS=true

rm -rf "$STAGE"
mkdir -p "$STAGE/models" "$STAGE/index"

cd "$APP_DIR"
cp *.py requirements.txt .env.example knowledge_base.sample.json "$STAGE/"
cp -R setup "$STAGE/setup"
mkdir -p "$STAGE/build"
cp build/service.sh build/service.ps1 build/build.sh build/build.ps1 \
   build/portfolio-assistant.service build/com.portfolio-assistant.plist \
   build/README.md "$STAGE/build/"

if $WITH_MODELS; then
    echo "Including models (~3.5 GB)..."
    cp -R models/generator models/tts models/embedder "$STAGE/models/" 2>/dev/null \
        || echo "WARNING: some model folders missing — run setup first for a full bundle."
fi

ARCHIVE="$DIST_DIR/portfolio-assistant-backend-$(date +%Y%m%d).tar.gz"
tar -czf "$ARCHIVE" -C "$DIST_DIR" portfolio-assistant-backend
rm -rf "$STAGE"

echo "Bundle ready: $ARCHIVE"
echo "On the target machine: extract, run setup/setup-<os> script, then build/service.sh start"
