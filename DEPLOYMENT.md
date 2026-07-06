# Deployment Guide

Target: Raspberry Pi 5 (8GB) running Raspberry Pi OS Lite (64-bit), serving the
assistant publicly behind nginx with HTTPS. The same steps work on any Linux
box; adjust paths as needed.

## Architecture

```
internet → nginx :443 (TLS)
             ├── /          → frontend static build (frontend/dist)
             └── /api/*     → uvicorn 127.0.0.1:16000 (FastAPI backend)
```

The backend binds to localhost only in production — nginx is the sole public
entry. The frontend always calls same-origin `/api/...`, so no CORS and no
mixed-content issues.

## 1. System packages

```bash
sudo apt update
sudo apt install -y git python3-venv python3-dev build-essential cmake nginx
# Node 20+ for building the frontend (or build on your laptop and copy dist/)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

## 2. Clone and set up the backend

```bash
sudo mkdir -p /opt/gokul-ai && sudo chown $USER /opt/gokul-ai
git clone https://github.com/Developer-Geekay/portfolio-assistance.git /opt/gokul-ai
cd /opt/gokul-ai/backend

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt   # llama-cpp-python compiles ~10-20 min on the Pi
```

## 3. Download models

```bash
cd /opt/gokul-ai/backend

# LLM — Gemma quantized GGUF (not in git; ~1.5GB)
mkdir -p models/generator
# copy your gemma gguf here, e.g. via scp from your workstation:
#   scp models/generator/gemma-4-e2b-it-qat-q4.gguf pi:/opt/gokul-ai/backend/models/generator/

# Piper voice — already in git (models/tts/). To change the voice:
#   https://rhasspy.github.io/piper-samples/

# Whisper downloads itself on first start (base.en, ~150MB, cached in ~/.cache)
```

## 3b. Copy your knowledge base

`knowledge_base.json` is **gitignored** (personal data never lives in the
repo), so a fresh clone doesn't have it — copy yours from your workstation:

```bash
scp backend/knowledge_base.json pi:/opt/gokul-ai/backend/
```

Or build one on the Pi from the sample: see "Building your own assistant"
in [README.md](README.md).

## 4. Configure the backend

```bash
cp .env.example .env
nano .env
```

Production values:

```ini
HOST=127.0.0.1        # localhost only — nginx is the public entry
PORT=16000
ADMIN_KEY=<long random string>   # python3 -c "import secrets; print(secrets.token_hex(24))"
PERSONA_NAME=<short name>
PERSONA_FULL_NAME=<full name>
PERSONA_CONTACT=at you@example.com or on LinkedIn
WHISPER_PROMPT=<your name, companies, tech terms — helps speech recognition>
LLM_THREADS=4         # Pi 5 has 4 cores
WHISPER_MODEL=base.en # use tiny.en if RAM is tight
```

Smoke test: `python main.py`, then from another shell
`curl -s localhost:16000/facts?n=1` — then Ctrl-C.

## 5. Backend as a systemd service

`/etc/systemd/system/gokul-ai.service`:

```ini
[Unit]
Description=Gokul AI backend (FastAPI + Gemma + Whisper + Piper)
After=network.target

[Service]
User=pi
WorkingDirectory=/opt/gokul-ai/backend
ExecStart=/opt/gokul-ai/backend/.venv/bin/python main.py
Restart=always
RestartSec=5
# model load takes ~30-60s on the Pi — don't let systemd kill it early
TimeoutStartSec=180

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now gokul-ai
sudo systemctl status gokul-ai     # journalctl -u gokul-ai -f for logs
```

## 6. Build and serve the frontend

```bash
cd /opt/gokul-ai/frontend
npm install
cp .env.example .env               # defaults are fine for a standard deploy
npm run build                      # outputs frontend/dist
```

Optional: set `VITE_WHISPER_WASM=true` / `VITE_PIPER_WASM=true` in
`frontend/.env` before building to run speech-to-text / text-to-speech in
the visitor's browser instead of on the Pi (~60–75 MB model download per
feature, cached after the first visit). Requires the cross-origin
isolation headers in the nginx config below. Server-side (the default) is
recommended — browser WASM trades Pi CPU for a heavy first load.

## 7. nginx + HTTPS

HTTPS is mandatory: browsers block microphone access on plain HTTP.

`/etc/nginx/sites-available/gokul-ai`:

```nginx
server {
    listen 80;
    server_name your-domain.example;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.example;

    # certbot fills these in (step below)
    ssl_certificate     /etc/letsencrypt/live/your-domain.example/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.example/privkey.pem;

    # frontend (also serves the admin dashboard at /assistant-admin)
    root /opt/gokul-ai/frontend/dist;
    index index.html;
    location / {
        try_files $uri /index.html;

        # Only needed when built with VITE_WHISPER_WASM=true or
        # VITE_PIPER_WASM=true — browser WASM threading requires
        # cross-origin isolation on every response:
        # add_header Cross-Origin-Embedder-Policy require-corp;
        # add_header Cross-Origin-Opener-Policy   same-origin;
    }

    # backend
    location /api/ {
        proxy_pass http://127.0.0.1:16000/;   # trailing slash strips /api
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
        client_max_body_size 25m;             # voice recordings
        proxy_read_timeout 120s;              # LLM inference time
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/gokul-ai /etc/nginx/sites-enabled/
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example
sudo nginx -t && sudo systemctl reload nginx
```

No public domain? Use a Cloudflare Tunnel or Tailscale Funnel instead of
opening ports; both give you valid HTTPS to the Pi.

## 8. Verify

- `https://your-domain.example` — ring loads, click, ask by voice, hear answer
- Admin dashboard: `https://your-domain.example/assistant-admin` — enter the
  admin key to see leads, sessions, conversations, and activity charts
- Analytics (from anywhere):
  `curl -H "X-Admin-Key: <key>" https://your-domain.example/api/sessions`
- Leads: `.../api/leads` — visitors who left contact details

## Updating

```bash
cd /opt/gokul-ai && git pull
cd frontend && npm run build                 # if frontend changed
sudo systemctl restart gokul-ai              # if backend changed
```

KB-only edits don't need a restart:
`curl -X POST -H "X-Admin-Key: <key>" https://your-domain.example/api/retrain`

## Memory notes (Pi 5, 8GB)

| Component | RAM |
|---|---|
| Gemma E2B Q4 GGUF | ~700MB |
| Whisper base.en int8 | ~150MB (tiny.en ~80MB) |
| Piper medium voice | ~100MB |
| FastAPI + Python | ~150MB |

Swap `WHISPER_MODEL=tiny.en` if you need headroom.
