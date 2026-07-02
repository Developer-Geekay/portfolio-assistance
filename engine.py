# engine.py — full-context inference engine (shared by chat and API)
import json
from llama_cpp import Llama

MODEL_PATH = "./models/generator/gemma-4-e2b-it-qat-q4.gguf"
KB_PATH    = "knowledge_base.json"

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
        "You are a concise AI assistant representing Gokul Kannan. "
        "Use ONLY the facts below to answer questions. "
        "Never invent details not present in the facts. "
        "If the answer is not covered by the facts, say you don't have that information. "
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
        n_threads=4,
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
        repeat_penalty=1.1,
        stop=["<end_of_turn>", "\n\n\n", "\nQuestion", "\nUser"],
    )
    return response["choices"][0]["message"]["content"].strip()
