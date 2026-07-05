# engine.py — full-context inference engine (shared by chat and API)
import json
import os
import re
from llama_cpp import Llama

MODEL_PATH = os.environ.get("GOKUL_LLM_MODEL", "models/generator/gemma-4-e2b-it-qat-q4.gguf")
KB_PATH    = os.environ.get("GOKUL_KB_PATH", "knowledge_base.json")
N_THREADS  = int(os.environ.get("GOKUL_LLM_THREADS", "4"))

llm: Llama | None = None
_system_prompt: str = ""


def _build_system_prompt() -> str:
    with open(KB_PATH) as f:
        kb = json.load(f)

    by_topic: dict[str, list[str]] = {}
    for entry in kb:
        by_topic.setdefault(entry["topic"], []).append(entry["fact"])

    facts_block = ""
    for topic, facts in by_topic.items():
        facts_block += f"\n[{topic.upper()}]\n"
        for fact in facts:
            facts_block += f"- {fact}\n"

    return (
        "You are a concise AI assistant that answers questions about Gokula Kannan, known as Gokul. "
        "NAME RULE: his full name is 'Gokula Kannan' and his short name is 'Gokul' — never write 'Gokul Kannan'. "
        "You are the assistant, not Gokul — describe him in third person. "
        "Name him once at the start of a conversation; in follow-up answers prefer pronouns (he, his, him) instead of repeating his name. "
        "Write numbers as digits (8+, 2023). "
        "Answer ONLY using the facts listed below — nothing else. "
        "NEVER infer, guess, or connect dots between facts. "
        "NEVER use dates or context to imply unstated facts. "
        "NEVER confirm a technology, skill, company, or claim that appears in the "
        "user's question but is not in the facts — mention only the listed items. "
        "PRIVACY RULE: never discuss age, marital status, family members, relationships, or income — "
        "if asked, say to reach out to Gokul directly. Hobbies and interests are fine to share. "
        "EDUCATION RULE: Only mention degrees explicitly listed in the facts. Do not add any degree not written there. "
        "If the facts do not contain the answer, reply EXACTLY: 'I don't have that information.' "
        "STRICT RULE: Reply in exactly 1-2 sentences. No lists, no headers.\n\n"
        f"FACTS ABOUT GOKUL:\n{facts_block}"
    )


def load_model():
    global llm, _system_prompt
    _system_prompt = _build_system_prompt()
    print("Loading model...")
    llm = Llama(
        model_path=MODEL_PATH,
        n_ctx=4096,
        n_threads=N_THREADS,
        n_gpu_layers=0,
        verbose=False,
        chat_format="gemma",
    )
    print("Model ready.")


def reload_kb():
    global _system_prompt
    _system_prompt = _build_system_prompt()


def ask(question: str, history: list | None = None) -> str:
    recent = (history or [])[-3:]
    messages = []

    if recent:
        messages.append({"role": "user",      "content": _system_prompt + "\n\nQuestion: " + recent[0]["q"]})
        messages.append({"role": "assistant", "content": recent[0]["a"]})
        for turn in recent[1:]:
            messages.append({"role": "user",      "content": turn["q"]})
            messages.append({"role": "assistant", "content": turn["a"]})
        messages.append({"role": "user", "content": question})
    else:
        messages.append({"role": "user", "content": _system_prompt + "\n\nQuestion: " + question})

    response = llm.create_chat_completion(
        messages=messages,
        max_tokens=80,
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
