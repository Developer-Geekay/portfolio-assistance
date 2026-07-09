# engine.py — full-context inference engine (shared by chat and API)
import json
import os
import random
import re

from gpu_dlls import register_cuda_dlls
register_cuda_dlls()   # before llama_cpp import — llama.dll resolves CUDA DLLs at load
from llama_cpp import Llama

MODEL_PATH   = os.environ.get("LLM_MODEL", "models/generator/gemma-4-e2b-it-qat-q4.gguf")
KB_PATH      = os.environ.get("KB_PATH", "knowledge_base.json")
QA_INDEX     = os.environ.get("QA_INDEX", "index/qa_flows.json")
N_THREADS    = int(os.environ.get("LLM_THREADS", "4"))
# 0 = CPU only, -1 = offload all layers to GPU (CUDA/Metal), N = partial offload.
# Safe on CPU-only installs: llama.cpp ignores it when no GPU backend is built in.
N_GPU_LAYERS = int(os.environ.get("LLM_GPU_LAYERS", "0"))

# The person this assistant represents — set in .env for your own build
FULL_NAME  = os.environ.get("PERSONA_FULL_NAME", "Gokula Kannan")
SHORT_NAME = os.environ.get("PERSONA_NAME", "Gokul")

llm: Llama | None = None
_system_prompt: str = ""

# ── Q&A retriever ─────────────────────────────────────────────────────────────

_qa_by_category: dict[str, list] = {}

# Maps query keywords (lowercase substrings) → training data category names.
# Use root forms so plurals and inflections match ("compan" → company/companies).
_CAT_KEYWORDS: list[tuple[str, list[str]]] = [
    ("outsystems",         ["outsystems", "odc", "o11", "service studio", "reactive web"]),
    ("architecture",       ["architect", "system design", "microservice", "scalab", "monolith", "design pattern", "best practice", "clean code", "refactor"]),
    ("ai",                 ["ai ", "artificial intelligence", "machine learning", "llm", "neural", "chatgpt", "nlp"]),
    ("security",           ["security", "oauth", "ssl", "https", "xss", "csrf", "encrypt", "vulnerab"]),
    ("projects",           ["project", "portfolio", "built", "developed", "created", "side project"]),
    ("career",             ["career", "experience", "job", "compan", "role", "position", "employer", "years of", "work history", "background"]),
    ("developer_tools",    ["git", "ci/cd", "docker", "container", "linux", "bash", "npm", "ide", "vscode", "tooling"]),
    ("lead_collection",    ["contact", "hire", "connect", "email", "reach", "freelance", "consulting", "discuss"]),
    ("small_talk",         ["hobbi", "interest", "outside work", "weekend", "fun fact", "free time", "passion"]),
    ("technical",          ["code", "programm", "software", "algorithm", "debug", "testing", "deployment", "api", "language"]),
    ("mixed",              []),  # fallback
]

def _load_qa_index() -> None:
    global _qa_by_category
    if not os.path.exists(QA_INDEX):
        return
    with open(QA_INDEX) as f:
        data = json.load(f)
    _qa_by_category = data.get("by_category", {})
    print(f"Q&A index loaded: {data.get('total', 0)} flows, {len(_qa_by_category)} categories")

def _detect_category(question: str) -> str:
    q = question.lower()
    for cat, keywords in _CAT_KEYWORDS:
        if any(kw in q for kw in keywords):
            return cat
    return "mixed"

def _get_qa_examples(question: str, n: int = 3) -> str:
    """Returns a few-shot block of n Q&A examples relevant to the question."""
    if not _qa_by_category:
        return ""
    cat = _detect_category(question)
    pool = _qa_by_category.get(cat) or _qa_by_category.get("mixed") or []
    if not pool:
        pool = [f for flows in _qa_by_category.values() for f in flows]
    sample = random.sample(pool, min(n, len(pool)))
    lines = []
    for flow in sample:
        msgs = flow.get("messages", [])
        if len(msgs) >= 2:
            lines.append(f"Q: {msgs[0]['content'].strip()}\nA: {msgs[1]['content'].strip()}")
    if not lines:
        return ""
    return "RESPONSE EXAMPLES:\n" + "\n\n".join(lines) + "\n\n"

def _build_system_prompt() -> str:
    with open(KB_PATH) as f:
        kb = json.load(f)

    by_topic = {}
    for entry in kb:
        by_topic.setdefault(entry["topic"], []).append(entry["fact"])

    facts_block = ""
    for topic, facts in by_topic.items():
        facts_block += f"\n[{topic.upper()}]\n"
        for fact in facts:
            facts_block += f"- {fact}\n"

    return f"""You are an AI assistant for {FULL_NAME} ({SHORT_NAME}). Answer questions about him naturally and helpfully.

RULES:
- Always refer to {SHORT_NAME} in third person ("he", "his", "him"). Never speak as him or in first person on his behalf.
- Use ONLY the facts in the ABOUT section below — never invent, guess, or speculate.
- Rephrase facts in your own words. Do not copy them word-for-word.
- Combine related facts naturally and mention only what is relevant to the question.
- If the facts do not cover the question, say: "I don't have that information."
- Keep answers concise (2-4 sentences) unless asked for more detail.
- Use digits for numbers (8+, 5 years, 2025). Prefer prose over bullet lists.
- Never say "According to the knowledge base..." or "Based on the provided facts..." — just answer naturally.
- Remember earlier turns in the conversation and handle follow-ups like "tell me more", "what about that", "he" or "his" correctly.

LEAD COLLECTION:
If a visitor wants to contact, hire, or work with {SHORT_NAME}, collect: their Name, Email or Phone, and a short message. Ask only for what is missing. Never repeat a detail already given. Do not claim it has been saved until the system confirms.

PRIVACY:
Never speculate about {SHORT_NAME}'s age, relationships, family, salary, or personal life.

ABOUT {FULL_NAME}:
{facts_block}"""

def load_model():
    global llm, _system_prompt
    _system_prompt = _build_system_prompt()
    _load_qa_index()
    print("Loading model...")
    if N_GPU_LAYERS != 0:
        try:
            import llama_cpp
            supported = llama_cpp.llama_supports_gpu_offload()
        except Exception:
            supported = None
        if supported is False:
            print("WARNING: LLM_GPU_LAYERS is set but this llama-cpp-python build "
                  "has no GPU backend — inference will run on CPU. "
                  "Re-run the setup script to install the CUDA/Metal wheel.")
        elif supported:
            print(f"LLM GPU offload active ({N_GPU_LAYERS} layers).")
    llm = Llama(
        model_path=MODEL_PATH,
        n_ctx=4096,
        n_threads=N_THREADS,
        n_gpu_layers=N_GPU_LAYERS,
        verbose=False,
        chat_format="gemma",
    )
    print("Model ready.")


def reload_kb():
    global _system_prompt
    _system_prompt = _build_system_prompt()
    _load_qa_index()


def ask(question: str, history: list | None = None) -> str:
    recent = (history or [])[-3:]
    # Examples are always placed immediately before the current question so the
    # model attends to them rather than seeing them buried in an older turn.
    examples = _get_qa_examples(question)
    current_msg = examples + "Question: " + question
    messages = []

    if recent:
        messages.append({"role": "user",      "content": _system_prompt + "\n\nQuestion: " + recent[0]["q"]})
        messages.append({"role": "assistant", "content": recent[0]["a"]})
        for turn in recent[1:]:
            messages.append({"role": "user",      "content": turn["q"]})
            messages.append({"role": "assistant", "content": turn["a"]})
        messages.append({"role": "user", "content": current_msg})
    else:
        messages.append({"role": "user", "content": _system_prompt + "\n\n" + current_msg})

    response = llm.create_chat_completion(
        messages=messages,
        max_tokens=150,
        temperature=0.15,
        repeat_penalty=1.15,
        stop=["<end_of_turn>", "\n\n\n", "\nQuestion", "\nUser"],
    )
    return _clean_response(response["choices"][0]["message"]["content"].strip())


def _clean_response(text: str) -> str:
    """Small models loop: drop repeated sentences and any sentence truncated
    by the token limit — a half-sentence must never reach TTS."""
    parts = re.split(r"(?<=[.!?])\s+", text)
    seen: set[str] = set()
    out: list[str] = []
    for p in parts:
        key = re.sub(r"\W+", " ", p.lower()).strip()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(p.strip())
    if out and not re.search(r"[.!?]$", out[-1]) and len(out) > 1:
        out.pop()   # trailing fragment from hitting max_tokens
    return " ".join(out)
