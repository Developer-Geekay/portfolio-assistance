#!/usr/bin/env python3
"""
test_runner.py — Automated test suite for Gokul AI.
Runs all queries against the engine, logs results to test_results/.
"""
import os
import sys
import json
import time
from datetime import datetime

import engine
from intent import detect_intent, GREETING_RESPONSE, THANKS_RESPONSE, SELF_INTRO_RESPONSE

FALLBACK_PHRASE = "don't have that information"

# ── Test definitions ──────────────────────────────────────────────────────────
# Format: (query, must_contain[], must_not_contain[], category)
TESTS = [
    # Identity
    ("Who is Gokul?",                   ["Technical Architect"],                   [],                          "identity"),
    ("Tell me about him",               ["architect", "OutSystems"],               [],                          "identity"),
    ("What does Gokul do?",             ["architect", "OutSystems"],               [],                          "identity"),
    ("Where does he work?",             ["Riyad Capital"],                         [],                          "identity"),
    ("Where is he based?",              ["Riyadh"],                                [],                          "identity"),
    ("How do I contact him?",           ["developergeekay"],                       [],                          "identity"),
    ("What is his LinkedIn?",           ["linkedin.com/in/developergeekay"],       [],                          "identity"),

    # Career
    ("How many years of experience does he have?",  ["8"],                         [],                          "career"),
    ("Where has he worked before?",     ["Netlink", "Mphasis", "Onward"],         [],                          "career"),
    ("What was his role at Mphasis?",   ["Mphasis"],                              [],                          "career"),
    ("Has he worked in finance?",        ["finance"],                              [],                          "career"),
    ("What companies has he been part of?", ["Riyad Capital", "Onward"],          [],                          "career"),
    ("What did he do at Onward Technologies?", ["Onward", "Bentley"],             ["Mphasis"],                 "career"),
    ("What is his full career timeline?", ["Teamwork", "Hexlope", "Netlink"],     [],                          "career"),

    # Skills & Tech
    ("What technologies does he know?", ["OutSystems", "React"],                  [],                          "skills"),
    ("Is he a frontend or backend developer?", ["OutSystems"],                    [],                          "skills"),
    ("Does he know React?",             ["React"],                                ["don't have"],              "skills"),
    ("Does he know Python?",            [FALLBACK_PHRASE],                        [],                          "skills"),
    ("Does he know PHP?",               [],                                       [],                          "skills"),
    ("Is he good at mobile development?", ["Cordova", "mobile"],                  [],                          "skills"),
    ("What platforms does he specialize in?", ["OutSystems"],                     [],                          "skills"),

    # OutSystems
    ("What is his OutSystems experience?",   ["8", "OutSystems"],                 [],                          "outsystems"),
    ("How many OutSystems certifications does he have?", ["five"],                [],                          "outsystems"),
    ("What are his certifications?",    ["OutSystems", "Udemy"],                  [],                          "outsystems"),
    ("Does he know ODC?",               ["ODC"],                                  [],                          "outsystems"),

    # Projects
    ("What projects has he built?",     ["DevTools", "HostPanel"],                [],                          "projects"),
    ("Tell me about his Chrome extension", ["DevTools", "Chrome"],                [],                          "projects"),
    ("What is HostPanel?",              ["HostPanel", "Raspberry Pi"],            [],                          "projects"),
    ("Does he have any open source projects?", ["DevTools"],                      [],                          "projects"),

    # Education
    ("What is his education?",          ["MCA", "Jaya College"],                  [],                          "education"),
    ("Where did he study?",             ["Jaya College"],                         [],                          "education"),
    ("What degree does he hold?",       ["MCA"],                                  [],                          "education"),

    # Personal
    ("What awards has he won?",         ["Neutrinos", "Mphasis"],                 [],                          "personal"),
    ("What languages does he speak?",   ["Tamil", "English"],                     [],                          "personal"),
    ("What does he do outside work?",   ["travel", "gaming"],                     [],                          "personal"),
    ("Does he have a homelab?",         ["Raspberry Pi"],                         [],                          "personal"),
    ("What is his Raspberry Pi setup?", ["Raspberry Pi"],                         [],                          "personal"),
    ("What are his hobbies?",           [],                                       [],                          "personal"),
    ("Where is he originally from?",    ["Chennai"],                              [],                          "personal"),

    # Follow-up / vague
    ("What else can he do?",            [],                                       [],                          "context"),
    ("Any other certifications?",       ["Udemy", "Neutrinos"],                   [],                          "context"),
    ("Is he good at architecture?",     ["architecture"],                         [],                          "context"),

    # Not in KB — should gracefully deflect
    ("How old is he?",                  [FALLBACK_PHRASE],                        [],                          "out_of_kb"),
    ("Is he married?",                  [FALLBACK_PHRASE],                        [],                          "out_of_kb"),
    ("What is his salary expectation?", [FALLBACK_PHRASE],                        [],                          "out_of_kb"),
    ("Does he have a driving license?",  [FALLBACK_PHRASE],                        [],                          "out_of_kb"),
    ("What is his notice period?",      [FALLBACK_PHRASE],                        [],                          "out_of_kb"),

    # Methodology & work style
    ("Is he familiar with Agile?",      ["Agile"],                                [FALLBACK_PHRASE],           "skills"),
    ("Does he use Jira?",               ["Jira"],                                 [FALLBACK_PHRASE],           "skills"),
    ("Can he handle full project development?", ["full-stack"],                   [],                          "skills"),
    ("Does he freelance?",              ["freelance"],                            [],                          "career"),

    # Intent detection (no model inference)
    ("hello",                           ["AI assistant", "Ask me"],               [],                          "intent"),
    ("who are you?",                    ["AI assistant", "Gokul"],                [],                          "intent"),
    ("thanks",                          ["Glad", "help"],                         [],                          "intent"),
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def run_intent(query: str) -> str | None:
    intent = detect_intent(query)
    if intent == "greeting":  return GREETING_RESPONSE
    if intent == "thanks":    return THANKS_RESPONSE
    if intent == "self_intro":return SELF_INTRO_RESPONSE
    if intent == "farewell":  return "Bye!"
    return None

def evaluate(answer: str, must_contain: list, must_not_contain: list) -> tuple[bool, list[str]]:
    issues = []
    answer_lower = answer.lower()
    for phrase in must_contain:
        if phrase.lower() not in answer_lower:
            issues.append(f"MISSING: '{phrase}'")
    for phrase in must_not_contain:
        if phrase.lower() in answer_lower:
            issues.append(f"UNEXPECTED: '{phrase}'")
    return len(issues) == 0, issues

def color(text: str, code: str) -> str:
    return f"\033[{code}m{text}\033[0m" if sys.stdout.isatty() else text

PASS  = lambda t: color(t, "32")
FAIL  = lambda t: color(t, "31")
WARN  = lambda t: color(t, "33")
DIM   = lambda t: color(t, "2")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    os.makedirs("test_results", exist_ok=True)
    run_id   = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = f"test_results/run_{run_id}.json"

    print("\n  Loading engine...")
    engine.load_model()

    results  = []
    by_cat   = {}
    passed   = 0
    failed   = 0
    total_ms = 0

    print(f"\n  Running {len(TESTS)} tests...\n")
    print(f"  {'#':<4} {'Category':<12} {'Status':<6} {'ms':>5}  Query")
    print(f"  {'─'*70}")

    for i, (query, must_have, must_not, category) in enumerate(TESTS, 1):
        t0 = time.time()

        # Intent check first
        answer = run_intent(query)
        if answer is None:
            answer = engine.ask(query)

        elapsed = int((time.time() - t0) * 1000)
        total_ms += elapsed

        ok, issues = evaluate(answer, must_have, must_not)
        status = "PASS" if ok else "FAIL"

        if ok:
            passed += 1
            status_str = PASS("PASS")
        else:
            failed += 1
            status_str = FAIL("FAIL")

        print(f"  {i:<4} {category:<12} {status_str:<6} {elapsed:>5}ms  {query}")
        if issues:
            for issue in issues:
                print(f"       {WARN('⚠')}  {issue}")
                print(f"       {DIM('→')}  {DIM(answer[:120])}")

        record = {
            "id":       i,
            "query":    query,
            "category": category,
            "answer":   answer,
            "status":   status,
            "issues":   issues,
            "ms":       elapsed,
        }
        results.append(record)
        by_cat.setdefault(category, {"pass": 0, "fail": 0})
        by_cat[category]["pass" if ok else "fail"] += 1

    # ── Summary ───────────────────────────────────────────────────────────────
    print(f"\n  {'─'*70}")
    print(f"  Results: {PASS(f'{passed} passed')}  {FAIL(f'{failed} failed')}  "
          f"/ {len(TESTS)} total   avg {total_ms // len(TESTS)}ms/query\n")

    print(f"  {'Category':<14} {'Pass':>5} {'Fail':>5}")
    print(f"  {'─'*26}")
    for cat, counts in by_cat.items():
        bar = PASS("●") if counts["fail"] == 0 else FAIL("●")
        print(f"  {bar} {cat:<12} {counts['pass']:>5} {counts['fail']:>5}")

    # ── Save log ──────────────────────────────────────────────────────────────
    log = {
        "run_id":     run_id,
        "timestamp":  datetime.now().isoformat(),
        "summary":    {"passed": passed, "failed": failed, "total": len(TESTS), "avg_ms": total_ms // len(TESTS)},
        "by_category": by_cat,
        "results":    results,
    }
    with open(log_path, "w") as f:
        json.dump(log, f, indent=2)

    print(f"\n  Log saved → {log_path}\n")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
