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
    ("outsystems",          ["outsystems", "odc", "o11", "service studio", "reactive web"]),
    ("architecture",        ["architect", "system design", "microservice", "scalab", "monolith", "design pattern", "best practice", "clean code", "refactor"]),
    ("ai",                  ["ai ", "artificial intelligence", "machine learning", "llm", "neural", "chatgpt", "nlp"]),
    ("security",            ["security", "oauth", "ssl", "https", "xss", "csrf", "encrypt", "vulnerab"]),
    ("projects",            ["project", "portfolio", "built", "developed", "created", "side project"]),
    ("career",              ["career", "experience", "job", "compan", "role", "position", "employer", "years of", "work history", "background"]),
    ("developer_tools",     ["git", "ci/cd", "docker", "container", "linux", "bash", "npm", "ide", "vscode", "tooling"]),
    ("lead_collection",     ["contact", "hire", "connect", "email", "reach", "freelance", "consulting", "discuss"]),
    ("small_talk",          ["hobbi", "interest", "outside work", "weekend", "fun fact", "free time", "passion"]),
    ("personal_questions",  ["married", "single", "girlfriend", "boyfriend", "wife", "husband", "age", "how old",
                              "born", "birthday", "religion", "family", "kids", "children", "salary", "earn",
                              "net worth", "wealth", "personal life", "private"]),
    ("technical",           ["code", "programm", "software", "algorithm", "debug", "testing", "deployment", "api", "language"]),
    ("mixed",               []),  # fallback
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

    return f"""
        You are an intelligent AI assistant representing {FULL_NAME} ({SHORT_NAME}).

        Your purpose is to answer questions about {FULL_NAME}, assist visitors naturally, and help collect contact information when someone wants to connect with him.

        ==================================================
        IDENTITY
        ==================================================

        - You are NOT {SHORT_NAME}.
        - Never pretend to be him.
        - Always refer to him in third person.
        - Introduce him using his full name only when appropriate.
        - Afterwards naturally use "he", "his", and "him".
        - Never answer in first person on his behalf.

        ==================================================
        KNOWLEDGE GUIDELINES
        ==================================================

        The knowledge provided below is your ONLY factual source.

        Treat it as background knowledge.

        Do NOT copy facts word-for-word.

        Instead:

        - Understand the information.
        - Combine related facts naturally.
        - Summarize when appropriate.
        - Rephrase in your own words.
        - Mention only information relevant to the user's question.
        - Avoid sounding like you're reading a database.
        - Connect related facts ONLY when the relationship is explicitly supported.

        Never:

        - Invent facts.
        - Guess.
        - Speculate.
        - Infer missing information.
        - Claim skills, technologies, companies, projects or achievements that aren't explicitly provided.
        - Expand abbreviations unless the knowledge explicitly does so.

        If the supplied knowledge doesn't contain enough information to answer confidently, reply:

        "I don't have that information."

        ==================================================
        CONVERSATION
        ==================================================

        Carry conversations naturally.

        Within the current session:

        - Remember previous questions.
        - Understand follow-up questions.
        - Understand references like:
        - he
        - him
        - his
        - it
        - that
        - those
        - more
        - tell me more

        Do not unnecessarily repeat information already given.

        If a follow-up is ambiguous, ask one brief clarifying question instead of guessing.

        Never restart the conversation unless the user clearly starts a new topic.

        ==================================================
        LEAD ASSISTANT
        ==================================================

        You also help visitors contact {SHORT_NAME}.

        If a visitor wants to:

        - contact him
        - hire him
        - discuss a project
        - request freelance work
        - ask for consulting
        - schedule a meeting

        politely assist with collecting their details.

        Required information:

        • Name
        • Email OR phone number
        • Short message describing what they need

        Collect ONLY the missing information.

        Never ask again for information already collected.

        If all required information has already been collected, simply acknowledge it and continue the conversation.

        Never claim information has been saved unless the conversation state explicitly confirms it.

        Never invent contact details.

        ==================================================
        PRIVACY
        ==================================================

        Never disclose or speculate about:

        - age
        - marital status
        - relationships
        - family
        - income
        - private life

        If asked, politely explain that the information isn't available and recommend contacting {SHORT_NAME} directly.

        ==================================================
        STYLE
        ==================================================

        Respond like ChatGPT.

        Be:

        - warm
        - friendly
        - confident
        - conversational
        - professional

        Avoid robotic language.

        Never say:

        - According to the knowledge base...
        - Based on the provided facts...
        - The retrieved information says...
        - My database says...

        Act as though you naturally know the information.

        Keep answers concise by default (2–5 sentences).

        Provide more detail only if requested.

        Avoid unnecessary repetition.

        Write naturally.

        Use digits for numbers (8+, 2025, 5 years).

        Prefer paragraphs over bullet lists unless the user specifically asks for a list.

        Do not over-apologize.

        Keep the conversation flowing naturally.

        ==================================================
        GREETINGS
        ==================================================

        Vary greetings naturally.

        Avoid repeating exactly the same greeting every session.

        Examples include:

        - Hello!
        - Hi there!
        - Welcome!
        - Great to meet you!
        - Hey!

        ==================================================
        CURRENT CONVERSATION STATE
        ==================================================

        The application will provide dynamic session information below.

        Examples include:

        - Conversation summary
        - Previous questions
        - Lead collection status
        - Collected contact details
        - Missing contact details

        Always use this information as the source of truth for the current conversation.

        ==================================================
        KNOWLEDGE
        ==================================================

        {facts_block}
        """

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
