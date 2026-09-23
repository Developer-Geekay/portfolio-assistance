# main.py — FastAPI server
import io
import json
import os
import random
import sqlite3
import tempfile
import wave
import urllib.request
import threading
import sys
import ssl
from datetime import datetime
from contextlib import asynccontextmanager

try:
    ssl_context = ssl._create_unverified_context()
except AttributeError:
    ssl_context = None

import asyncio
import base64

from dotenv import load_dotenv
load_dotenv()   # backend/.env — loaded before engine reads its env vars

from fastapi import FastAPI, HTTPException, Request, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
import engine
from intent import (detect_intent, extract_contact, GREETING_RESPONSE,
                    THANKS_RESPONSE, FAREWELL_RESPONSE, SELF_INTRO_RESPONSE,
                    PERSONAL_RESPONSE, LEAD_RESPONSE)

WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "base.en")
PIPER_VOICE   = os.environ.get("PIPER_VOICE", "models/tts/en_US-amy-medium.onnx")

# STT compute target — "cuda" needs cuBLAS/cuDNN; anything that fails to load
# falls back to CPU int8 so the server always comes up.
WHISPER_DEVICE  = os.environ.get("WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE = os.environ.get("WHISPER_COMPUTE", "int8")

# Domain vocabulary seeds Whisper so proper nouns transcribe correctly —
# list your name, companies, and tech terms in .env (comma-separated)
WHISPER_PROMPT = os.environ.get(
    "WHISPER_PROMPT",
    "skills, projects, experience, certifications, architect, developer"
)

stt_model   = None   # faster-whisper
loaded_voices = {}   # piper voice cache

# Available voices config
VOICES_LIST = [
    {"id": "af_sarah", "name": "Kokoro - Sarah (US Female, Natural)"},
    {"id": "af_bella", "name": "Kokoro - Bella (US Female, Expressive)"},
    {"id": "am_michael", "name": "Kokoro - Michael (US Male, Warm)"},
    {"id": "bf_emma", "name": "Kokoro - Emma (UK Female, Human)"},
    {"id": "en_US-amy-medium", "name": "Piper - Amy (Medium)"},
    {"id": "en_US-lessac-medium", "name": "Piper - Lessac (Medium)"},
    {"id": "en_US-joe-medium", "name": "Piper - Joe (Medium)"},
    {"id": "en_US-ryan-medium", "name": "Piper - Ryan (Medium)"}
]

KOKORO_ONNX_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/kokoro-v1.0.onnx"
KOKORO_VOICES_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/voices-v1.0.bin"

VOICE_URLS = {
    "af_sarah": {"onnx": KOKORO_ONNX_URL, "voices": KOKORO_VOICES_URL},
    "af_bella": {"onnx": KOKORO_ONNX_URL, "voices": KOKORO_VOICES_URL},
    "am_michael": {"onnx": KOKORO_ONNX_URL, "voices": KOKORO_VOICES_URL},
    "bf_emma": {"onnx": KOKORO_ONNX_URL, "voices": KOKORO_VOICES_URL},
    "en_US-amy-medium": {
        "onnx": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/amy/medium/en_US-amy-medium.onnx",
        "json": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/amy/medium/en_US-amy-medium.onnx.json"
    },
    "en_US-lessac-medium": {
        "onnx": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx",
        "json": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"
    },
    "en_US-joe-medium": {
        "onnx": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/joe/medium/en_US-joe-medium.onnx",
        "json": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/joe/medium/en_US-joe-medium.onnx.json"
    },
    "en_US-ryan-medium": {
        "onnx": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ryan/medium/en_US-ryan-medium.onnx",
        "json": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ryan/medium/en_US-ryan-medium.onnx.json"
    }
}

download_progress = {} # voice_id -> int
download_threads = {}  # voice_id -> Thread

def is_voice_downloaded(voice_id: str) -> bool:
    if any(voice_id.startswith(p) for p in ("af_", "am_", "bf_", "bm_", "kokoro")):
        model_paths = ["models/tts/kokoro-v1.0.onnx", "models/tts/kokoro-v1.0.fp16.onnx", "models/tts/kokoro.onnx"]
        voices_path = "models/tts/voices-v1.0.bin"
        return any(os.path.exists(p) for p in model_paths) and os.path.exists(voices_path)
    onnx_path = f"models/tts/{voice_id}.onnx"
    json_path = f"models/tts/{voice_id}.onnx.json"
    return os.path.exists(onnx_path) and os.path.exists(json_path)

def download_file_chunked(url: str, dest_path: str, voice_id: str, weight: float, offset: float):
    try:
        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, context=ssl_context) as response:
            total_size = int(response.info().get('Content-Length', 0))
            downloaded = 0
            block_size = 1024 * 64
            with open(dest_path, 'wb') as f:
                while True:
                    buffer = response.read(block_size)
                    if not buffer:
                        break
                    f.write(buffer)
                    downloaded += len(buffer)
                    if total_size > 0:
                        percent = (downloaded / total_size) * 100
                        current_prog = offset + (percent * weight)
                        download_progress[voice_id] = min(99, int(current_prog))
    except Exception as e:
        print(f"Error downloading {url}: {e}")
        download_progress[voice_id] = -1

def download_voice_model_task(voice_id: str):
    if voice_id not in VOICE_URLS:
        return
    download_progress[voice_id] = 0
    urls = VOICE_URLS[voice_id]

    if any(voice_id.startswith(p) for p in ("af_", "am_", "bf_", "bm_", "kokoro")):
        onnx_dest = "models/tts/kokoro-v1.0.onnx"
        voices_dest = "models/tts/voices-v1.0.bin"
        download_file_chunked(urls["voices"], voices_dest, voice_id, weight=0.1, offset=0.0)
        if download_progress[voice_id] == -1:
            return
        download_file_chunked(urls["onnx"], onnx_dest, voice_id, weight=0.9, offset=10.0)
        if download_progress[voice_id] == -1:
            return
        download_progress[voice_id] = 100
        get_kokoro()
        return

    onnx_dest = f"models/tts/{voice_id}.onnx"
    json_dest = f"models/tts/{voice_id}.onnx.json"
    
    download_file_chunked(urls["json"], json_dest, voice_id, weight=0.01, offset=0.0)
    if download_progress[voice_id] == -1:
        return
    download_file_chunked(urls["onnx"], onnx_dest, voice_id, weight=0.99, offset=1.0)
    if download_progress[voice_id] == -1:
        return
    download_progress[voice_id] = 100
    
    try:
        from piper import PiperVoice
        loaded_voices[voice_id] = PiperVoice.load(onnx_dest)
        print(f"Voice model {voice_id} loaded successfully post-download.")
    except Exception as e:
        print(f"Error loading voice {voice_id} after download: {e}")

conn = sqlite3.connect("app.db", check_same_thread=False)
conn.execute("""CREATE TABLE IF NOT EXISTS queries (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    question  TEXT,
    timestamp TEXT
)""")
conn.execute("""CREATE TABLE IF NOT EXISTS conversations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT,
    client_ip   TEXT,
    user_device TEXT,
    question    TEXT,
    answer      TEXT,
    intent      TEXT,
    timestamp   TEXT
)""")
conn.execute("""CREATE TABLE IF NOT EXISTS leads (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    client_ip  TEXT,
    email      TEXT,
    phone      TEXT,
    message    TEXT,
    timestamp  TEXT
)""")
conn.execute("""CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
)""")
# Seed settings
conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('whisper_mode', 'backend')")
conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('piper_mode', 'backend')")
conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('piper_voice', 'en_US-amy-medium')")
conn.commit()

def get_setting(key: str, default: str) -> str:
    cursor = conn.cursor()
    row = cursor.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    if row:
        return row[0]
    return default

def set_setting(key: str, value: str):
    conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, value))
    conn.commit()

def parse_device(user_agent: str) -> str:
    if not user_agent:
        return "Unknown"
    ua = user_agent.lower()
    if "iphone" in ua:
        return "iPhone"
    elif "ipad" in ua:
        return "iPad"
    elif "android" in ua:
        if "mobile" in ua:
            return "Android Mobile"
        return "Android Tablet"
    elif "macintosh" in ua or "mac os" in ua:
        return "Mac"
    elif "windows" in ua:
        return "Windows PC"
    elif "linux" in ua:
        return "Linux PC"
    return "Generic PC / Device"

# Admin endpoints (analytics, retrain) expose visitor IPs and questions.
# They require the key from ADMIN_KEY unconditionally and are disabled
# when it is unset — IP/header-based trust is spoofable and never used.
ADMIN_KEY = os.environ.get("ADMIN_KEY", "")


def require_admin(request: Request):
    if not ADMIN_KEY:
        raise HTTPException(status_code=503, detail="Admin endpoints disabled: set ADMIN_KEY")
    if request.headers.get("x-admin-key", "") != ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Forbidden")


def client_ip_of(request: Request) -> str:
    # Respect reverse proxy header (nginx on the Pi), fall back to socket peer
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def log_conversation(session_id: str, ip: str, device: str, question: str, answer: str, intent: str):
    conn.execute(
        "INSERT INTO conversations (session_id, client_ip, user_device, question, answer, intent, timestamp) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (session_id, ip, device, question, answer, intent, datetime.utcnow().isoformat())
    )
    conn.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global stt_model, loaded_voices
    engine.load_model()
    print("Loading Whisper...")
    from faster_whisper import WhisperModel
    try:
        stt_model = WhisperModel(WHISPER_MODEL, device=WHISPER_DEVICE, compute_type=WHISPER_COMPUTE)
        if WHISPER_DEVICE != "cpu":
            import numpy as np
            segments, _ = stt_model.transcribe(np.zeros(16000, dtype=np.float32))
            list(segments)
            print(f"Whisper on {WHISPER_DEVICE} verified.")
    except Exception as e:
        if WHISPER_DEVICE == "cpu":
            raise
        print(f"Whisper failed on {WHISPER_DEVICE} ({e}); falling back to CPU.")
        stt_model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
        
    initial_voice_id = get_setting("piper_voice", "en_US-amy-medium")
    onnx_path = f"models/tts/{initial_voice_id}.onnx"
    if os.path.exists(onnx_path):
        try:
            from piper import PiperVoice
            loaded_voices[initial_voice_id] = PiperVoice.load(onnx_path)
            print(f"Voice model {initial_voice_id} loaded.")
        except Exception as e:
            print(f"Failed to load initial voice {initial_voice_id}: {e}")
    else:
        print(f"Initial voice model {initial_voice_id} not found at {onnx_path}. It will be loaded on demand or after download.")
        
    print("Voice pipeline ready.")
    yield
    print("Shutting down.")


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class Question(BaseModel):
    text: str
    history: list[dict] = []   # optional: [{q, a}, ...] for multi-turn from frontend
    session_id: str = ""       # per-browser-tab session for analytics


@app.post("/ask")
async def ask(q: Question, request: Request):
    ip = client_ip_of(request)
    ua = request.headers.get("user-agent", "")
    device = parse_device(ua)

    contact = extract_contact(q.text)
    if contact:
        conn.execute(
            "INSERT INTO leads (session_id, client_ip, email, phone, message, timestamp) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (q.session_id, ip, contact["email"], contact["phone"],
             contact["raw"], datetime.utcnow().isoformat())
        )
        conn.commit()
        log_conversation(q.session_id, ip, device, q.text, LEAD_RESPONSE, "lead")
        return {"answer": LEAD_RESPONSE, "end": False}

    intent = detect_intent(q.text)

    if intent == "greeting":
        log_conversation(q.session_id, ip, device, q.text, GREETING_RESPONSE, intent)
        return {"answer": GREETING_RESPONSE, "end": False}
    if intent == "thanks":
        log_conversation(q.session_id, ip, device, q.text, THANKS_RESPONSE, intent)
        return {"answer": THANKS_RESPONSE, "end": False}
    if intent == "farewell":
        log_conversation(q.session_id, ip, device, q.text, FAREWELL_RESPONSE, intent)
        return {"answer": FAREWELL_RESPONSE, "end": True}
    if intent == "self_intro":
        log_conversation(q.session_id, ip, device, q.text, SELF_INTRO_RESPONSE, intent)
        return {"answer": SELF_INTRO_RESPONSE, "end": False}
    if intent == "personal":
        log_conversation(q.session_id, ip, device, q.text, PERSONAL_RESPONSE, intent)
        return {"answer": PERSONAL_RESPONSE, "end": False}

    # Check if this turn is a follow-up to an out-of-scope fallback response
    is_out_of_scope_followup = False
    if q.history:
        last_answer = q.history[-1].get("a", "")
        if "outside of my knowledge base" in last_answer:
            is_out_of_scope_followup = True

    if is_out_of_scope_followup:
        contact = extract_contact(q.text)
        email = contact["email"] if contact else None
        phone = contact["phone"] if contact else None
        
        original_q = "Unknown question"
        if len(q.history) >= 2:
            original_q = q.history[-2].get("q", "")
        
        if contact:
            conn.execute(
                "INSERT INTO leads (session_id, client_ip, email, phone, message, timestamp) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (q.session_id, ip, email, phone, f"Clarification for '{original_q}': {q.text}", datetime.utcnow().isoformat())
            )
            
        conn.execute(
            "INSERT INTO queries (question, timestamp) VALUES (?, ?)",
            (f"Clarified: User wanted '{q.text}' (Original: '{original_q}')" + (f" [Contact: {email or phone}]" if (email or phone) else ""), datetime.utcnow().isoformat())
        )
        conn.commit()
        
        # Visitor clarification is already saved to the queries table above.
        # Do not write to knowledge_base.json — that is managed through the admin KB panel.

        polite_ack = (
            "Thank you! I have saved what you want to know and your contact details (if provided). "
            "Gokul will review it, update my knowledge base, and reach out to you once the answer is ready!"
        )
        log_conversation(q.session_id, ip, device, q.text, polite_ack, "lead")
        return {"answer": polite_ack, "end": False}

    answer = engine.ask(q.text, q.history)

    if "don't have" in answer.lower() or "not covered" in answer.lower() or "not in the supplied" in answer.lower():
        conn.execute(
            "INSERT INTO queries (question, timestamp) VALUES (?, ?)",
            (q.text, datetime.utcnow().isoformat())
        )
        conn.commit()
        
        polite_fallback = (
            "I cannot answer queries outside of my knowledge base. "
            "Could you tell me exactly what you wanted to know? "
            "Please share what you are looking for, and if you are willing, "
            "your contact info (email or phone) so Gokul can get back to you with the answer!"
        )
        log_conversation(q.session_id, ip, device, q.text, polite_fallback, "unknown")
        return {"answer": polite_fallback, "end": False}

    log_conversation(q.session_id, ip, device, q.text, answer, "question")
    return {"answer": answer, "end": False}


def transcribe_audio_bytes(data: bytes, suffix: str = ".webm") -> str:
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(data)
        path = tmp.name
    try:
        segments, _ = stt_model.transcribe(path, language="en", beam_size=1,
                                           initial_prompt=WHISPER_PROMPT)
        text = " ".join(s.text.strip() for s in segments).strip()
    finally:
        os.unlink(path)
    return text


@app.post("/transcribe")
def transcribe(audio: UploadFile = File(...)):
    """Speech-to-text: browser uploads recorded audio (webm/mp4/wav), Whisper
    transcribes locally. Sync endpoint → FastAPI runs it in a threadpool."""
    suffix = os.path.splitext(audio.filename or "")[1] or ".webm"
    data = audio.file.read()
    text = transcribe_audio_bytes(data, suffix)
    return {"text": text}


kokoro_instance = None

def get_kokoro():
    global kokoro_instance
    if kokoro_instance is not None:
        return kokoro_instance
    model_paths = [
        "models/tts/kokoro-v1.0.onnx",
        "models/tts/kokoro-v1.0.fp16.onnx",
        "models/tts/kokoro.onnx"
    ]
    voices_path = "models/tts/voices-v1.0.bin"
    model_path = next((p for p in model_paths if os.path.exists(p)), None)
    if model_path and os.path.exists(voices_path):
        try:
            from kokoro_onnx import Kokoro
            kokoro_instance = Kokoro(model_path, voices_path)
            print(f"Kokoro-82M TTS loaded from {model_path}")
            return kokoro_instance
        except Exception as e:
            print(f"Failed to load Kokoro TTS: {e}")
            return None
    return None


def synthesize_wav_bytes(text: str, voice_id: str | None = None) -> bytes:
    vid = voice_id or get_setting("piper_voice", "en_US-amy-medium")

    # If Kokoro voice requested or configured
    if any(vid.startswith(p) for p in ("af_", "am_", "bf_", "bm_", "kokoro")):
        k = get_kokoro()
        if k is not None:
            try:
                k_voice = vid if vid != "kokoro" else "af_sarah"
                samples, sample_rate = k.create(text, voice=k_voice, speed=1.0, lang="en-us")
                import numpy as np
                int16_samples = (np.clip(samples, -1.0, 1.0) * 32767).astype(np.int16)
                buf = io.BytesIO()
                with wave.open(buf, "wb") as f:
                    f.setnchannels(1)
                    f.setsampwidth(2)
                    f.setframerate(sample_rate)
                    f.writeframes(int16_samples.tobytes())
                return buf.getvalue()
            except Exception as e:
                print(f"[kokoro] Synthesis error: {e}, falling back to Piper")

    global loaded_voices
    if vid not in loaded_voices:
        onnx_path = f"models/tts/{vid}.onnx"
        if os.path.exists(onnx_path):
            try:
                from piper import PiperVoice
                loaded_voices[vid] = PiperVoice.load(onnx_path)
            except Exception as e:
                raise RuntimeError(f"Failed to load voice {vid}: {e}")
        else:
            if loaded_voices:
                vid = next(iter(loaded_voices.keys()))
            else:
                raise RuntimeError(f"Voice model {vid} is not downloaded on server")

    tts_voice = loaded_voices[vid]
    buf = io.BytesIO()
    with wave.open(buf, "wb") as f:
        try:
            from piper.config import SynthesisConfig
            syn_config = SynthesisConfig(length_scale=1.18)
        except Exception:
            syn_config = None
        tts_voice.synthesize_wav(text, f, syn_config=syn_config)
        sample_rate = tts_voice.config.sample_rate
        silence_frames = int(sample_rate * 0.25)
        f.writeframes(b"\x00\x00" * silence_frames)
    return buf.getvalue()


class SpeakRequest(BaseModel):
    text: str
    voice: str = None


@app.post("/speak")
def speak(req: SpeakRequest):
    """Text-to-speech: Piper renders a WAV, played by the browser's <audio>.
    Works identically on every browser/OS — no client TTS involved."""
    text = req.text.strip()[:1000]
    if not text:
        raise HTTPException(status_code=400, detail="No text")
    voice_id = req.voice or get_setting("piper_voice", "en_US-amy-medium")
    try:
        data = synthesize_wav_bytes(text, voice_id)
        return Response(content=data, media_type="audio/wav")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.websocket("/ws/voice")
async def voice_websocket(websocket: WebSocket):
    """Full-duplex real-time streaming voice endpoint with sentence-level pipelined
    TTS and live interruption (barge-in) support."""
    await websocket.accept()
    ip = client_ip_of(websocket)
    ua = websocket.headers.get("user-agent", "")
    device = parse_device(ua)

    active_task = None
    abort_event = threading.Event()

    async def cancel_active():
        nonlocal active_task
        abort_event.set()
        if active_task and not active_task.done():
            active_task.cancel()
            try:
                await active_task
            except (asyncio.CancelledError, Exception):
                pass
        active_task = None

    try:
        while True:
            raw_msg = await websocket.receive_text()
            try:
                msg = json.loads(raw_msg)
            except Exception:
                continue

            mtype = msg.get("type")

            if mtype == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
                continue

            if mtype == "interrupt":
                await cancel_active()
                await websocket.send_text(json.dumps({"type": "interrupted"}))
                await websocket.send_text(json.dumps({"type": "state", "state": "idle"}))
                continue

            if mtype in ("audio", "query"):
                await cancel_active()
                abort_event.clear()

                session_id = msg.get("session_id", "")
                history = msg.get("history", [])
                voice_id = msg.get("voice") or msg.get("voice_id")

                query_text = ""
                if mtype == "audio":
                    b64_data = msg.get("data") or msg.get("audio", "")
                    if not b64_data:
                        continue
                    fmt = msg.get("format") or msg.get("ext", "webm")
                    suffix = f".{fmt}" if not fmt.startswith(".") else fmt
                    await websocket.send_text(json.dumps({"type": "state", "state": "transcribing"}))
                    try:
                        raw_bytes = base64.b64decode(b64_data)
                        query_text = await asyncio.to_thread(transcribe_audio_bytes, raw_bytes, suffix)
                    except Exception as e:
                        print(f"[ws] Transcribe error: {e}")
                        await websocket.send_text(json.dumps({"type": "error", "message": "Failed to transcribe audio"}))
                        await websocket.send_text(json.dumps({"type": "state", "state": "idle"}))
                        continue

                    if not query_text:
                        await websocket.send_text(json.dumps({"type": "transcription", "text": "", "empty": True}))
                        await websocket.send_text(json.dumps({"type": "state", "state": "idle"}))
                        continue

                    await websocket.send_text(json.dumps({"type": "transcription", "text": query_text}))
                else:
                    query_text = (msg.get("text") or "").strip()

                if not query_text:
                    await websocket.send_text(json.dumps({"type": "state", "state": "idle"}))
                    continue

                async def process_query(q_text: str):
                    try:
                        contact = extract_contact(q_text)
                        if contact:
                            conn.execute(
                                "INSERT INTO leads (session_id, client_ip, email, phone, message, timestamp) "
                                "VALUES (?, ?, ?, ?, ?, ?)",
                                (session_id, ip, contact["email"], contact["phone"],
                                 contact["raw"], datetime.utcnow().isoformat())
                            )
                            conn.commit()
                            log_conversation(session_id, ip, device, q_text, LEAD_RESPONSE, "lead")
                            await send_single_response(LEAD_RESPONSE, voice_id)
                            return

                        intent = detect_intent(q_text)
                        if intent == "greeting":
                            log_conversation(session_id, ip, device, q_text, GREETING_RESPONSE, intent)
                            await send_single_response(GREETING_RESPONSE, voice_id)
                            return
                        if intent == "thanks":
                            log_conversation(session_id, ip, device, q_text, THANKS_RESPONSE, intent)
                            await send_single_response(THANKS_RESPONSE, voice_id)
                            return
                        if intent == "farewell":
                            log_conversation(session_id, ip, device, q_text, FAREWELL_RESPONSE, intent)
                            await send_single_response(FAREWELL_RESPONSE, voice_id, end=True)
                            return
                        if intent == "self_intro":
                            log_conversation(session_id, ip, device, q_text, SELF_INTRO_RESPONSE, intent)
                            await send_single_response(SELF_INTRO_RESPONSE, voice_id)
                            return
                        if intent == "personal":
                            log_conversation(session_id, ip, device, q_text, PERSONAL_RESPONSE, intent)
                            await send_single_response(PERSONAL_RESPONSE, voice_id)
                            return

                        # Out-of-scope follow-up check
                        if history:
                            last_ans = history[-1].get("a", "")
                            if "outside of my knowledge base" in last_ans:
                                polite_ack = (
                                    "Thank you! I have saved what you want to know and your contact details (if provided). "
                                    "Gokul will review it, update my knowledge base, and reach out to you once the answer is ready!"
                                )
                                log_conversation(session_id, ip, device, q_text, polite_ack, "lead")
                                await send_single_response(polite_ack, voice_id)
                                return

                        # Stream sentences from Gemma LLM
                        await websocket.send_text(json.dumps({"type": "state", "state": "thinking"}))
                        q = asyncio.Queue()
                        loop = asyncio.get_running_loop()

                        def stream_worker():
                            try:
                                for sentence in engine.ask_stream(q_text, history):
                                    if abort_event.is_set():
                                        break
                                    asyncio.run_coroutine_threadsafe(q.put(("sentence", sentence)), loop)
                                asyncio.run_coroutine_threadsafe(q.put(("done", None)), loop)
                            except Exception as ex:
                                asyncio.run_coroutine_threadsafe(q.put(("error", ex)), loop)

                        thread = threading.Thread(target=stream_worker, daemon=True)
                        thread.start()

                        chunk_idx = 0
                        full_sentences = []

                        while True:
                            kind, val = await q.get()
                            if abort_event.is_set():
                                break
                            if kind == "sentence":
                                if chunk_idx == 0:
                                    await websocket.send_text(json.dumps({"type": "state", "state": "speaking"}))
                                full_sentences.append(val)
                                wav_bytes = await asyncio.to_thread(synthesize_wav_bytes, val, voice_id)
                                b64_wav = base64.b64encode(wav_bytes).decode("ascii")
                                await websocket.send_text(json.dumps({
                                    "type": "audio_chunk",
                                    "index": chunk_idx,
                                    "text": val,
                                    "audio": b64_wav,
                                }))
                                chunk_idx += 1
                            elif kind == "done":
                                break
                            elif kind == "error":
                                print(f"[ws] Stream error: {val}")
                                break

                        full_answer = " ".join(full_sentences).strip()
                        if full_answer:
                            if "don't have" in full_answer.lower() or "not covered" in full_answer.lower():
                                conn.execute(
                                    "INSERT INTO queries (question, timestamp) VALUES (?, ?)",
                                    (q_text, datetime.utcnow().isoformat())
                                )
                                conn.commit()
                            log_conversation(session_id, ip, device, q_text, full_answer, "question")
                            await websocket.send_text(json.dumps({
                                "type": "done",
                                "total_chunks": chunk_idx,
                                "full_text": full_answer,
                            }))
                        await websocket.send_text(json.dumps({"type": "state", "state": "idle"}))
                    except asyncio.CancelledError:
                        pass
                    except Exception as ex:
                        print(f"[ws] Query processing error: {ex}")
                        await websocket.send_text(json.dumps({"type": "error", "message": str(ex)}))
                        await websocket.send_text(json.dumps({"type": "state", "state": "idle"}))

                async def send_single_response(resp_text: str, v_id: str | None, end: bool = False):
                    await websocket.send_text(json.dumps({"type": "state", "state": "speaking"}))
                    wav_bytes = await asyncio.to_thread(synthesize_wav_bytes, resp_text, v_id)
                    b64_wav = base64.b64encode(wav_bytes).decode("ascii")
                    await websocket.send_text(json.dumps({
                        "type": "audio_chunk",
                        "index": 0,
                        "text": resp_text,
                        "audio": b64_wav,
                    }))
                    await websocket.send_text(json.dumps({
                        "type": "done",
                        "total_chunks": 1,
                        "full_text": resp_text,
                        "end": end,
                    }))
                    await websocket.send_text(json.dumps({"type": "state", "state": "idle"}))

                active_task = asyncio.create_task(process_query(query_text))

    except WebSocketDisconnect:
        await cancel_active()
    except Exception as e:
        print(f"[ws] Connection closed: {e}")
        await cancel_active()


@app.get("/facts")
async def facts(n: int = 15):
    """Random KB facts for the frontend idle-state taglines."""
    with open("knowledge_base.json") as f:
        kb = json.load(f)
    picks = random.sample(kb, min(n, len(kb)))
    return [p["fact"] for p in picks]


# ── Knowledge base management ─────────────────────────────────────────────────

class KBEntry(BaseModel):
    id: str = ""
    topic: str
    fact: str


@app.get("/kb")
async def get_kb(request: Request):
    """Return all knowledge base entries."""
    require_admin(request)
    with open("knowledge_base.json") as f:
        return json.load(f)


@app.post("/kb")
async def upsert_kb(entry: KBEntry, request: Request):
    """Upsert a KB entry by id. Hot-reloads the engine immediately."""
    require_admin(request)
    entry.topic = entry.topic.strip().lower().replace(" ", "_")
    entry.fact  = entry.fact.strip()
    if not entry.topic or not entry.fact:
        raise HTTPException(status_code=422, detail="topic and fact are required")

    with open("knowledge_base.json") as f:
        kb = json.load(f)

    if not entry.id:
        nums = [int(e["id"].split("_")[1]) for e in kb if e["id"].startswith("kb_") and e["id"].split("_")[1].isdigit()]
        entry.id = f"kb_{(max(nums, default=0) + 1):03d}"

    idx = next((i for i, e in enumerate(kb) if e["id"] == entry.id), None)
    if idx is not None:
        kb[idx] = {"id": entry.id, "topic": entry.topic, "fact": entry.fact}
        action = "updated"
    else:
        kb.append({"id": entry.id, "topic": entry.topic, "fact": entry.fact})
        action = "added"

    with open("knowledge_base.json", "w") as f:
        json.dump(kb, f, indent=2)

    engine.reload_kb()
    return {"ok": True, "id": entry.id, "action": action, "total": len(kb)}


@app.delete("/kb/{kb_id}")
async def delete_kb(kb_id: str, request: Request):
    """Delete a KB entry by id. Hot-reloads the engine immediately."""
    require_admin(request)
    with open("knowledge_base.json") as f:
        kb = json.load(f)
    filtered = [e for e in kb if e["id"] != kb_id]
    if len(filtered) == len(kb):
        raise HTTPException(status_code=404, detail="Entry not found")
    with open("knowledge_base.json", "w") as f:
        json.dump(filtered, f, indent=2)
    engine.reload_kb()
    return {"ok": True, "total": len(filtered)}


@app.get("/conversations")
async def get_conversations(request: Request, limit: int = 200):
    require_admin(request)
    """Recent conversation turns, newest first — group by session_id for analysis."""
    rows = conn.execute(
        "SELECT session_id, client_ip, user_device, question, answer, intent, timestamp "
        "FROM conversations ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    return [
        {"session": r[0], "ip": r[1], "device": r[2] or "Unknown", "question": r[3],
         "answer": r[4], "intent": r[5], "at": r[6]}
        for r in rows
    ]


@app.get("/leads")
async def get_leads(request: Request, limit: int = 100):
    """Visitors who left contact details for Gokul to reach back."""
    require_admin(request)
    rows = conn.execute(
        "SELECT session_id, client_ip, email, phone, message, timestamp "
        "FROM leads ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    return [
        {"session": r[0], "ip": r[1], "email": r[2],
         "phone": r[3], "message": r[4], "at": r[5]}
        for r in rows
    ]


@app.get("/sessions")
async def get_sessions(request: Request, limit: int = 50):
    require_admin(request)
    """Session summaries: turn count, first/last activity, client IP, device."""
    rows = conn.execute(
        "SELECT session_id, client_ip, MAX(user_device), COUNT(*), MIN(timestamp), MAX(timestamp) "
        "FROM conversations WHERE session_id != '' "
        "GROUP BY session_id ORDER BY MAX(timestamp) DESC LIMIT ?", (limit,)
    ).fetchall()
    return [
        {"session": r[0], "ip": r[1], "device": r[2] or "Unknown", "turns": r[3], "started": r[4], "last": r[5]}
        for r in rows
    ]


@app.get("/stats")
async def get_stats(request: Request):
    """Aggregate analytics for the admin dashboard."""
    require_admin(request)
    turns    = conn.execute("SELECT COUNT(*) FROM conversations").fetchone()[0]
    sessions = conn.execute(
        "SELECT COUNT(DISTINCT session_id) FROM conversations WHERE session_id != ''"
    ).fetchone()[0]
    leads    = conn.execute("SELECT COUNT(*) FROM leads").fetchone()[0]
    unknown  = conn.execute("SELECT COUNT(*) FROM queries").fetchone()[0]
    intents  = conn.execute(
        "SELECT intent, COUNT(*) FROM conversations GROUP BY intent ORDER BY COUNT(*) DESC"
    ).fetchall()
    daily    = conn.execute(
        "SELECT substr(timestamp, 1, 10) AS day, COUNT(*), COUNT(DISTINCT session_id) "
        "FROM conversations GROUP BY day ORDER BY day DESC LIMIT 14"
    ).fetchall()
    return {
        "turns": turns, "sessions": sessions, "leads": leads, "unknown": unknown,
        "intents": [{"intent": r[0], "count": r[1]} for r in intents],
        "daily":   [{"day": r[0], "turns": r[1], "sessions": r[2]} for r in daily],
    }


@app.get("/unknown-queries")
async def get_unknown(request: Request):
    require_admin(request)
    rows = conn.execute(
        "SELECT question, timestamp FROM queries ORDER BY timestamp DESC LIMIT 50"
    ).fetchall()
    return [{"question": r[0], "at": r[1]} for r in rows]


class SettingsUpdate(BaseModel):
    whisper_mode: str
    piper_mode: str
    piper_voice: str


@app.get("/settings")
async def get_settings():
    whisper_mode = get_setting("whisper_mode", "backend")
    piper_mode = get_setting("piper_mode", "backend")
    piper_voice = get_setting("piper_voice", "en_US-amy-medium")
    
    voices = []
    for v in VOICES_LIST:
        voices.append({
            "id": v["id"],
            "name": v["name"],
            "downloaded": is_voice_downloaded(v["id"])
        })
        
    return {
        "whisper_mode": whisper_mode,
        "piper_mode": piper_mode,
        "piper_voice": piper_voice,
        "voices": voices
    }


@app.post("/settings")
async def update_settings(settings: SettingsUpdate, request: Request):
    require_admin(request)
    set_setting("whisper_mode", settings.whisper_mode)
    set_setting("piper_mode", settings.piper_mode)
    set_setting("piper_voice", settings.piper_voice)
    
    # Preload the new voice dynamically so it's loaded in memory immediately
    global loaded_voices
    voice_id = settings.piper_voice
    if voice_id not in loaded_voices:
        onnx_path = f"models/tts/{voice_id}.onnx"
        if os.path.exists(onnx_path):
            try:
                from piper import PiperVoice
                loaded_voices[voice_id] = PiperVoice.load(onnx_path)
                print(f"Dynamically loaded voice model on settings update: {voice_id}")
            except Exception as e:
                print(f"Failed to dynamically load voice {voice_id}: {e}")
                
    return {"status": "ok"}


class VoiceDownloadRequest(BaseModel):
    voice: str


@app.post("/voices/download")
async def start_voice_download(req: VoiceDownloadRequest):
    voice_id = req.voice
    if voice_id not in VOICE_URLS:
        raise HTTPException(status_code=400, detail="Invalid voice ID")
    
    if is_voice_downloaded(voice_id):
        return {"status": "already_downloaded"}
        
    if voice_id in download_threads and download_threads[voice_id].is_alive():
        return {"status": "downloading"}
        
    download_progress[voice_id] = 0
    t = threading.Thread(target=download_voice_model_task, args=(voice_id,))
    t.start()
    download_threads[voice_id] = t
    return {"status": "started"}


@app.get("/voices/download-progress")
async def get_voice_download_progress(voice: str):
    prog = download_progress.get(voice, 0)
    is_alive = False
    if voice in download_threads:
        is_alive = download_threads[voice].is_alive()
    return {
        "voice": voice,
        "progress": prog,
        "downloading": is_alive,
        "downloaded": is_voice_downloaded(voice)
    }


@app.post("/retrain")
async def retrain(request: Request):
    """Reload knowledge_base.json into memory without server restart."""
    require_admin(request)
    try:
        engine.reload_kb()
        return {"status": "ok"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


@app.get("/db/export")
async def export_db(request: Request):
    """Download a consistent snapshot of app.db (WAL-checkpointed copy)."""
    require_admin(request)
    import shutil
    conn.execute("PRAGMA wal_checkpoint(FULL)")
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        shutil.copy2("app.db", tmp.name)
        tmp_path = tmp.name

    def stream_and_cleanup():
        try:
            with open(tmp_path, "rb") as f:
                while chunk := f.read(65536):
                    yield chunk
        finally:
            os.unlink(tmp_path)

    from datetime import date
    filename = f"assistant_db_{date.today().isoformat()}.db"
    return StreamingResponse(
        stream_and_cleanup(),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@app.post("/db/clear")
async def clear_db(request: Request):
    """Delete all conversations, leads, and unknown queries. Settings are preserved."""
    require_admin(request)
    conn.execute("DELETE FROM conversations")
    conn.execute("DELETE FROM leads")
    conn.execute("DELETE FROM queries")
    conn.commit()
    return {"status": "ok", "cleared": ["conversations", "leads", "queries"]}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", "16000")),
    )
