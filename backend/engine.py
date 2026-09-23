# engine.py — full-context inference engine (shared by chat and API)
import json
import os
import random
import re

from gpu_dlls import register_cuda_dlls
register_cuda_dlls()   # before llama_cpp import — llama.dll resolves CUDA DLLs at load
from llama_cpp import Llama

MODEL_PATH   = os.environ.get("LLM_MODEL", "models/generator/gemma-4-E4B_q4_0-it.gguf")
KB_PATH      = os.environ.get("KB_PATH", "knowledge_base.json")
QA_INDEX     = os.environ.get("QA_INDEX", "index/qa_flows.json")
N_THREADS    = int(os.environ.get("LLM_THREADS", "4"))
# 0 = CPU only, -1 = offload all layers to GPU (CUDA/Metal), N = partial offload.
# Safe on CPU-only installs: llama.cpp ignores it when no GPU backend is built in.
N_GPU_LAYERS = int(os.environ.get("LLM_GPU_LAYERS", "0"))

# The person this assistant represents — set in .env for your own build
FULL_NAME  = os.environ.get("PERSONA_FULL_NAME", "Gokula Kannan")
SHORT_NAME = os.environ.get("PERSONA_NAME", "Gokul")
PERSONA_CONTACT = os.environ.get("PERSONA_CONTACT", "at developergeekay@gmail.com or on LinkedIn")

llm: Llama | None = None
_system_prompt: str = ""

# ── Q&A retriever ─────────────────────────────────────────────────────────────

_qa_by_category: dict[str, list] = {}

# Each entry: (category, [patterns]).  Patterns are matched as whole-word regex
# so "age" won't fire inside "languages" or "manage".
_CAT_KEYWORDS: list[tuple[str, list[str]]] = [
    ("outsystems",          ["outsystems", "odc", r"o11\b", "service studio", "reactive web",
                              "certification", "certified", "cert"]),
    ("architecture",        ["architect", "system design", "microservice", "scalab", "monolith",
                              "design pattern", "best practice", "clean code", "refactor"]),
    ("character",           ["mindset", "philosophy", "character", "personality", "working style",
                              "as an engineer", "work style", "methodical", "adaptab", "collaborat"]),
    ("languages",           [r"\blanguage\b", r"\blanguages\b", "speak", "tamil", "english", "arabic", "multilingual"]),
    ("ai",                  [r"\bai\b", "artificial intelligence", "machine learning", "llm",
                              "neural", "chatgpt", "nlp", "generative"]),
    ("security",            ["security", "oauth", r"\bssl\b", r"\bxss\b", r"\bcsrf\b",
                              "encrypt", "vulnerab"]),
    ("projects",            ["project", "built", "developed", "created", "side project",
                              "chrome extension", "hostpanel", "devtools", "bentley"]),
    ("education",           [r"\bdegree\b", r"\bstud", r"\bmca\b",
                              "bachelor", "university", "college", "education",
                              "qualification", "academic"]),
    ("career",              ["career", "experience", "companies", "worked at", "compan",
                              r"\bjob\b", "role", "position", "employer", "years of",
                              "work history", "background", "industr", "sector"]),
    ("developer_tools",     [r"\bgit\b", "ci/cd", "docker", "container",
                              r"\blinux\b", r"\bbash\b", r"\bnpm\b", r"\bide\b",
                              "vscode", "tooling", "pipeline"]),
    ("lead_collection",     ["contact", r"\bhire\b", "connect", r"\bemail\b", "reach",
                              "freelance", "consulting", "discuss"]),
    ("small_talk",          ["hobbi", "outside work", "weekend", "fun fact",
                              "free time", "passion", "enjoy", "travel", "gaming",
                              r"\bgame\b", "gaming"]),
    ("technical",           ["tech stack", "tech", "framework", "react", "angular",
                              "typescript", r"\bnode\b", r"\bsql\b", "mysql", "mongodb",
                              "database", r"\bphp\b", "python", "javascript",
                              "programm", "software", "algorithm", "debug",
                              r"\bcode\b", "testing", "deployment", r"\bapi\b"]),
    ("portfolio",           [r"\bwho is\b", "tell me about him", "introduce",
                              "full name", "summary", "overview", "about gokul",
                              "about him", "who are we talking"]),
    ("personal_questions",  [r"\bmarried\b", r"\bsingle\b", "girlfriend", "boyfriend",
                              r"\bwife\b", "husband", r"\bage\b", "how old",
                              r"\bborn\b", "birthday", "religion", r"\bfamily\b",
                              r"\bkids\b", "children", r"\bsalary\b", r"\bearn\b",
                              "net worth", "wealth", "personal life", r"\bprivate\b"]),
    ("mixed",               []),  # fallback
]

# Pre-compile all patterns for efficiency
_CAT_PATTERNS: list[tuple[str, list[re.Pattern]]] = [
    (cat, [re.compile(kw, re.I) for kw in kws])
    for cat, kws in _CAT_KEYWORDS
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
    for cat, patterns in _CAT_PATTERNS:
        if any(p.search(question) for p in patterns):
            return cat
    return "mixed"

def _get_qa_examples(question: str, n: int = 3) -> str:
    """Returns a few-shot block of n Q&A examples relevant to the question."""
    if not _qa_by_category:
        return ""
    cat = _detect_category(question)
    pool = _qa_by_category.get(cat)
    if not pool:
        # Merge mixed + unknown_questions for the fallback pool so out-of-scope
        # queries get graceful deflection examples alongside general ones.
        pool = (
            (_qa_by_category.get("mixed") or []) +
            (_qa_by_category.get("unknown_questions") or [])
        )
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

    return f"""You are the personal AI voice assistant representing {FULL_NAME} ({SHORT_NAME}).
Your role is to answer questions about {SHORT_NAME}'s professional experience, technical expertise, projects, working style, and background accurately, concisely, and conversationally.

==================================================
1. IDENTITY & REPRESENTATION
==================================================
- You are {SHORT_NAME}'s AI assistant, NOT {SHORT_NAME} himself.
- Always refer to him in the third person ("he", "his", "him", "{SHORT_NAME}").
- Never answer in the first person ("I built", "I worked") on his behalf.
- Introduce him using his full name only when introducing him; subsequently refer to him as "{SHORT_NAME}" or "he".

==================================================
2. PROFESSIONAL POSITIONING & SPECIALIZATION
==================================================
- Primary Positioning: OutSystems Technical Architect / Technical Architect with strong enterprise application development, solution architecture, mobile, frontend, production-support, and developer-tooling experience.
- OutSystems (O11 and ODC) is his primary professional specialization.

Technology Confidence Tiers (STRICT):
• Primary Expertise (Core): OutSystems O11, OutSystems ODC, Solution Architecture, OutSystems Reactive Web, OutSystems Mobile, Enterprise application development, Technical leadership.
• Strong Supporting Experience: Angular, React, TypeScript, JavaScript, Cordova, Capacitor, Chrome Extension development, Chrome DevTools Protocol.
• Additional Working Experience / Exposure: Node.js, PHP, MySQL, MongoDB, Linux, Nginx, AWS, SQLite.
• AI / Experimental / Homelab: llama.cpp, Local LLMs, AI-powered developer tooling, Raspberry Pi homelab AI.

CRITICAL RULE: When asked about supporting or exposure technologies (e.g., Angular, React, Node, PHP), do NOT call him an "expert" in them. Clearly state that he has solid working experience with them, while OutSystems and Solution Architecture remain his primary specialization.

==================================================
3. PRESERVE RELATIONSHIPS & ACCURACY (CRITICAL)
==================================================
Preserve the exact relationship: Company -> Role -> Project -> Responsibility -> Technology.
Never transfer projects or responsibilities between companies:
• Riyad Capital (Riyadh, Saudi Arabia — Current): OutSystems Technical Architect. Riyad Online (web & mobile), third-party integrations (Regula, FACEKI, HyperPay).
• Onward Technologies Limited (June 2023 – November 2024): Technical Architect. Led the Bentley Motors Dealer Award System end-to-end (solution architecture and delivery).
  -> WARNING: Bentley Motors was strictly at Onward Technologies. NEVER associate Bentley with Netlink or Riyad Capital!
• Mphasis: Senior Software Engineer. FNOL, restructured data models resulting in a 53% performance optimization.
• Netlink Software Group: Software Engineer and Senior Software Engineer. UP Excise Portal (government project).
• Hexlope Technologies: Web Developer. Color Visualizer Tool, cloud migration.
• Teamwork Techknowledge: Web Developer. E-commerce and business platforms.
• Public / Independent Tooling: Creator of the OutSystems DevTools Chrome Extension (on Chrome Web Store).

Accuracy Rules:
- Never invent employers, clients, project names, metrics, user numbers, notice periods, or salary expectations.
- Never guess or combine disconnected facts. If information is missing, state clearly: "I don't have that information in my knowledge base."

==================================================
4. PROFESSIONAL CHARACTER & WORKING STYLE
==================================================
When asked about his personality, engineering style, or how he works:
• Problem-solving mindset: Motivated by solving difficult, real-world problems rather than just completing tickets.
• Methodical under pressure: Analyzes timelines, technical compatibility, expectations, logs, and sequences before acting.
• Collaborative: Considers effective cross-functional collaboration and knowledge sharing vital to team delivery.
• Adaptable: Comfortable learning new platforms, frameworks, and languages when a problem requires it.
• Curious & Continuous Learner: Acts as both a mentor and an active learner from peers.
• Question-driven engineering: Believes asking the right architectural questions upfront delivers cleaner solutions and faster shipping.

NEVER USE UNSUPPORTED HYPE:
Do NOT describe him as "visionary", "world-class", "industry-leading", "the best engineer", or an "exceptional genius". Prefer factual, evidence-based descriptions.

==================================================
5. CONVERSATION FLOW & DIRECTNESS
==================================================
- Answer the user's question FIRST directly. Do not begin with a generic biographical warm-up unless asked for an overview.
- Match answer depth:
  • Short factual question: 1–3 concise sentences.
  • Recruiter / career question: Concise professional summary plus relevant supporting details.
  • Technical question: Concrete architecture and engineering specifics.
- Avoid repetitive intros: Do not constantly open responses with "{FULL_NAME} is..." or "{SHORT_NAME} is...". Use natural variety ("His primary specialization is...", "In his current role...", "He worked on...", "His strongest focus...").
- Conversational continuity: On follow-up questions ("What was his role there?", "Which tech did he use?"), refer directly to the project or company mentioned in the immediately preceding turn without resetting to a generic biography.

CRITICAL NEGATIVE CONSTRAINT (NO BOILERPLATE OUTROS):
- NEVER end your answers with repetitive generic invitations or closing questions such as:
  "Is there anything specific you'd like to know about his work or background?"
  "Is there anything else I can help you with today?"
  "Let me know if you would like more details."
- Simply deliver the helpful answer and stop.

==================================================
6. LANGUAGES & PRIVACY
==================================================
- Languages: {SHORT_NAME} speaks Tamil as his native language, English at a professional working level, and elementary Arabic. (As an assistant, you converse in English).
- Privacy: Never disclose or speculate on private matters (age, marital status, family, religion, salary). For career opportunities, invite them to contact him directly at {PERSONA_CONTACT}.

==================================================
7. VERIFIED KNOWLEDGE BASE
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

    model_file = MODEL_PATH
    if not os.path.exists(model_file):
        # Graceful fallback to 2B model if 4B model is not present locally
        fallback = "models/generator/gemma-4-e2b-it-qat-q4.gguf"
        if os.path.exists(fallback):
            print(f"Notice: Configured model '{model_file}' not found locally. "
                  f"Falling back to existing '{fallback}'.")
            model_file = fallback
        else:
            print(f"Warning: Neither '{model_file}' nor '{fallback}' found on disk.")

    llm = Llama(
        model_path=model_file,
        n_ctx=4096,
        n_threads=N_THREADS,
        n_gpu_layers=N_GPU_LAYERS,
        verbose=False,
        chat_format="gemma",
    )
    print(f"Model ready ({model_file}).")


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
        max_tokens=220,
        temperature=0.18,
        repeat_penalty=1.18,
        stop=["<end_of_turn>", "\n\n\n", "\nQuestion", "\nUser"],
    )
    return _clean_response(response["choices"][0]["message"]["content"].strip())


def _clean_response(text: str) -> str:
    """Clean response: remove trailing sentence fragments and strip accidental
    boilerplate closing questions."""
    # Strip repetitive ending invitations like "Is there anything specific you'd like to know..."
    cleaned = re.sub(
        r"(?i)\s*(is there anything (else|specific)|let me know if|feel free to ask|how else can i help|would you like to know).*?\??$",
        "",
        text.strip(),
    )
    parts = re.split(r"(?<=[.!?])\s+", cleaned)
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
    return " ".join(out).strip()
