#!/usr/bin/env python3
"""
kb_builder.py — Conversational personal knowledge base builder.

Usage:
  python kb_builder.py              # Gemma mode: model interviews you and extracts facts
  python kb_builder.py --no-model  # Open-ended CLI: you answer freely until 'done'
"""
import json
import argparse
import subprocess
import sys
import re
from pathlib import Path

KB_PATH    = Path("knowledge_base.json")
MODEL_PATH = "./models/generator/gemma-4-e2b-it-qat-q4.gguf"

TOPICS = [
    {
        "name": "identity",
        "label": "Identity & Contact",
        "starter": "Let's start with the basics — what's your name, your current role, and where are you based?",
    },
    {
        "name": "education",
        "label": "Education",
        "starter": "Tell me about your educational background — any schools, degrees, specializations, or academic achievements you'd like to share.",
    },
    {
        "name": "certifications",
        "label": "Certifications",
        "starter": "What professional certifications do you hold? Share all of them — name, issuing organization, and year if you remember.",
    },
    {
        "name": "career",
        "label": "Career History",
        "starter": "Walk me through your career — companies, roles, dates, and what you worked on at each place.",
    },
    {
        "name": "projects",
        "label": "Key Projects",
        "starter": "Tell me about your most significant projects — personal, open-source, or professional. What did you build, what tech did you use, and what's its current status?",
    },
    {
        "name": "tech_stack",
        "label": "Skills & Tech Stack",
        "starter": "What are your core skills, languages, frameworks, and tools? Don't hold back — list everything you're comfortable with.",
    },
    {
        "name": "personal",
        "label": "Personal & Interests",
        "starter": "What do you enjoy outside of work? Hobbies, side projects, communities, or anything else that defines you beyond your job.",
    },
    {
        "name": "awards",
        "label": "Awards & Recognition",
        "starter": "Have you received any awards, recognition, or notable achievements — professional or personal?",
    },
    {
        "name": "homelab",
        "label": "Homelab / Infrastructure",
        "starter": "Do you run any personal servers, homelabs, or self-hosted infrastructure? Tell me about the setup.",
    },
]


# ── KB helpers ────────────────────────────────────────────────────────────────

def load_kb() -> list:
    if KB_PATH.exists():
        with open(KB_PATH) as f:
            return json.load(f)
    return []

def next_id(kb: list) -> int:
    if not kb:
        return 1
    return max(int(e["id"].split("_")[1]) for e in kb) + 1

def save_and_rebuild(kb: list):
    with open(KB_PATH, "w") as f:
        json.dump(kb, f, indent=2)
    print("\n  Saving knowledge base...")
    result = subprocess.run([sys.executable, "build_index.py"], capture_output=True, text=True)
    if result.returncode == 0:
        print(f"  Index rebuilt. Total facts: {len(kb)}")
    else:
        print(f"  Index rebuild failed:\n{result.stderr}")


# ── UI helpers ────────────────────────────────────────────────────────────────

def get_input(prompt: str = "") -> str:
    if prompt:
        print(f"\n  {prompt}")
    try:
        return input("  You: ").strip()
    except (EOFError, KeyboardInterrupt):
        print("\n\n  Interrupted — saving collected facts...")
        return "__EXIT__"

def divider(label: str = ""):
    print(f"\n{'─' * 55}")
    if label:
        print(f"  {label}")
        print(f"{'─' * 55}")

def show_existing_and_confirm(kb: list, topic_name: str) -> str:
    existing = [e for e in kb if e["topic"] == topic_name]
    if not existing:
        return "add"
    print(f"\n  You already have {len(existing)} fact(s) on this topic:")
    for e in existing:
        print(f"    • [{e['id']}] {e['fact']}")
    print("\n  [s] Skip   [a] Add more   [r] Replace existing")
    choice = input("  > ").strip().lower() or "s"
    return {"r": "replace", "a": "add"}.get(choice, "skip")

def review_facts(facts: list[dict]) -> list[dict]:
    print("\n  Review extracted facts:\n")
    kept = []
    for i, fact in enumerate(facts, 1):
        print(f"  [{i}] {fact['fact']}")
        choice = input("      Keep? (y / n / e=edit) [y]: ").strip().lower() or "y"
        if choice == "n":
            continue
        if choice == "e":
            edited = input("      Edit: ").strip()
            if edited:
                fact["fact"] = edited
        kept.append(fact)
    return kept


# ── Model helpers ─────────────────────────────────────────────────────────────

def load_model():
    from llama_cpp import Llama
    print("  Loading model...")
    llm = Llama(
        model_path=MODEL_PATH,
        n_ctx=4096,
        n_threads=4,
        n_gpu_layers=0,
        verbose=False,
        chat_format="gemma",
    )
    print("  Model ready.\n")
    return llm

INTERVIEWER_SYSTEM = (
    "You are building a personal knowledge base for {name} by interviewing them about: {topic}.\n"
    "Your job is to extract EVERYTHING relevant — leave no detail uncovered.\n\n"
    "Rules:\n"
    "- Ask ONE focused question at a time. Never bundle multiple questions.\n"
    "- Never accept vague answers. If they say 'a few years', ask for exact dates.\n"
    "  If they name a company, ask what they built there.\n"
    "  If they name a degree, ask the institution and year.\n"
    "- Chase every thread: if they mention something in passing, follow up on it.\n"
    "- Cover every angle of the topic before closing:\n"
    "  Education → school, bachelor's, master's, PhD, online courses, specializations.\n"
    "  Career → each role, responsibilities, key achievements, notable projects.\n"
    "  Projects → tech stack, scale, outcome, current status, URL if public.\n"
    "  Skills → languages, frameworks, platforms, years of experience.\n"
    "- Never invent, assume, or put words in their mouth — only ask.\n"
    "- When the topic is fully covered, end with: (Type 'done' to move on, or keep sharing)\n"
    "- Be friendly and conversational — not robotic."
)

EXTRACTOR_PROMPT = (
    "From the interview below about {name} (topic: {topic}), extract clean factual statements.\n"
    "Rules:\n"
    "- Each fact: third person, 1-2 sentences, specific, no redundancy.\n"
    "- Only facts explicitly stated — never infer or invent.\n"
    "- Return ONLY a JSON array of strings: [\"fact one.\", \"fact two.\"]\n\n"
    "Interview:\n{transcript}\n\nJSON array:"
)

def run_interview(llm, name: str, topic_name: str, topic_label: str, starter: str) -> list[tuple]:
    """Runs a multi-turn conversational interview. Returns list of (role, text) pairs."""
    system = INTERVIEWER_SYSTEM.format(name=name, topic=topic_label)
    history = []  # list of (role, text)

    # First message: interviewer opens with the starter
    print(f"\n  Interviewer: {starter}")
    history.append(("assistant", starter))

    while True:
        user_input = get_input()
        if user_input == "__EXIT__" or user_input.lower() in ("done", "d", ""):
            if not user_input or user_input.lower() in ("done", "d"):
                break
            break
        history.append(("user", user_input))

        # Build messages: inject system in first user turn
        messages = []
        first_user = True
        for role, text in history:
            if role == "user":
                if first_user:
                    messages.append({"role": "user", "content": system + "\n\n" + text})
                    first_user = False
                else:
                    messages.append({"role": "user", "content": text})
            else:
                messages.append({"role": "assistant", "content": text})

        # If no user turn yet, prime with system + empty user
        if first_user:
            messages = [{"role": "user", "content": system + "\n\n[begin interview]"}]
            for role, text in history:
                messages.append({"role": "assistant" if role == "assistant" else "user", "content": text})

        response = llm.create_chat_completion(
            messages=messages,
            max_tokens=120,
            temperature=0.2,
            stop=["<end_of_turn>", "\n\n\n"],
        )
        follow_up = response["choices"][0]["message"]["content"].strip()
        print(f"\n  Interviewer: {follow_up}")
        history.append(("assistant", follow_up))

    return history

def extract_facts(llm, name: str, topic_name: str, topic_label: str, history: list[tuple]) -> list[str]:
    transcript = "\n".join(
        f"{'Interviewer' if r == 'assistant' else name}: {t}" for r, t in history
    )
    prompt = EXTRACTOR_PROMPT.format(name=name, topic=topic_label, transcript=transcript)
    response = llm.create_chat_completion(
        messages=[{"role": "user", "content": prompt}],
        max_tokens=500,
        temperature=0.1,
        stop=["<end_of_turn>", "\n\n\n"],
    )
    raw = response["choices"][0]["message"]["content"].strip()
    match = re.search(r'\[.*?\]', raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return re.findall(r'"([^"]{10,})"', raw)


# ── Gemma mode ────────────────────────────────────────────────────────────────

def run_gemma_mode(name: str, selected_topics: list):
    llm = load_model()
    kb = load_kb()
    id_counter = next_id(kb)
    all_new: list[dict] = []

    for topic in selected_topics:
        divider(topic["label"])

        action = show_existing_and_confirm(kb, topic["name"])
        if action == "skip":
            continue
        if action == "replace":
            kb = [e for e in kb if e["topic"] != topic["name"]]
            id_counter = next_id(kb) if kb else 1

        print("  (Type 'done' or press Enter when finished with this topic)\n")
        history = run_interview(llm, name, topic["name"], topic["label"], topic["starter"])

        user_turns = [t for r, t in history if r == "user"]
        if not user_turns:
            print("  Nothing shared — skipping.")
            continue

        print("\n  Extracting facts...")
        raw_facts = extract_facts(llm, name, topic["name"], topic["label"], history)

        if not raw_facts:
            print("  Could not extract facts. Skipping topic.")
            continue

        candidates = [
            {"id": f"kb_{id_counter + i:03d}", "topic": topic["name"], "fact": f}
            for i, f in enumerate(raw_facts)
        ]
        kept = review_facts(candidates)
        all_new.extend(kept)
        id_counter += len(kept)

    if all_new:
        kb.extend(all_new)
        save_and_rebuild(kb)
        print(f"\n  Added {len(all_new)} new facts.")
    else:
        print("\n  No facts added.")


# ── No-model mode ─────────────────────────────────────────────────────────────

def run_no_model_mode(name: str, selected_topics: list):
    kb = load_kb()
    id_counter = next_id(kb)
    all_new: list[dict] = []

    print("\n  No-model mode: share everything on a topic, one line at a time.")
    print("  Type 'done' when finished with a topic. Press Enter to skip a topic.\n")

    for topic in selected_topics:
        divider(topic["label"])

        action = show_existing_and_confirm(kb, topic["name"])
        if action == "skip":
            continue
        if action == "replace":
            kb = [e for e in kb if e["topic"] != topic["name"]]
            id_counter = next_id(kb) if kb else 1

        print(f"\n  {topic['starter']}")
        print("  (one fact per line, 'done' to finish)\n")

        while True:
            answer = get_input()
            if answer == "__EXIT__" or answer.lower() in ("done", "d", ""):
                break

            fact_text = answer if name.split()[0].lower() in answer.lower() else f"{name} — {answer}"
            candidate = {"id": f"kb_{id_counter:03d}", "topic": topic["name"], "fact": fact_text}
            print(f"  Preview: {candidate['fact']}")
            keep = input("  Save? (y/n/e=edit) [y]: ").strip().lower() or "y"
            if keep == "n":
                continue
            if keep == "e":
                edited = input("  Edit: ").strip()
                if edited:
                    candidate["fact"] = edited
            all_new.append(candidate)
            id_counter += 1

    if all_new:
        kb.extend(all_new)
        save_and_rebuild(kb)
        print(f"\n  Added {len(all_new)} new facts.")
    else:
        print("\n  No facts added.")


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Conversational KB builder")
    parser.add_argument("--no-model", action="store_true",
                        help="No model needed — share facts directly, one line at a time")
    args = parser.parse_args()

    print("\n╔══════════════════════════════════════════╗")
    print("║       Personal KB Builder                ║")
    print("║  " + ("No-model mode" if args.no_model else "Gemma conversational mode").ljust(40) + "║")
    print("╚══════════════════════════════════════════╝\n")

    name = input("  Your full name: ").strip()
    if not name:
        print("Name is required.")
        sys.exit(1)

    print("\n  Topics:")
    for i, t in enumerate(TOPICS, 1):
        print(f"    [{i}] {t['label']}")
    print("    [a] All topics")

    selection = input("\n  Which topics? (e.g. 1,3,5 or 'a'): ").strip().lower()
    if selection in ("a", ""):
        selected = TOPICS
    else:
        indices = [int(x.strip()) - 1 for x in selection.split(",") if x.strip().isdigit()]
        selected = [TOPICS[i] for i in indices if 0 <= i < len(TOPICS)]

    if not selected:
        print("No valid topics selected.")
        sys.exit(1)

    if args.no_model:
        run_no_model_mode(name, selected)
    else:
        run_gemma_mode(name, selected)

    print("\n  Done! Run 'python full_context_chat.py' to test your KB.\n")

if __name__ == "__main__":
    main()
