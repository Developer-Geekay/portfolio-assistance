# chat.py
from retrieval import retrieve
from generator import generate_response

FALLBACK = (
    "That's something Gokul hasn't shared with me yet — "
    "but I've noted your question and he'll review it soon."
)

# Simple intent patterns — no ML needed
GREETINGS = {"hi", "hello", "hey", "hii", "helo", "howdy", "sup", "yo"}
THANKS = {"thanks", "thank you", "thankyou", "thx", "ty", "great", "cool", "awesome", "ok", "okay"}
FAREWELLS = {"bye", "goodbye", "see you", "cya", "exit", "quit", "q"}

GREETING_RESPONSE = (
    "Hey there! 👋 I'm Gokul's AI assistant. "
    "Ask me anything about Gokul — his skills, projects, experience, or background!"
)
THANKS_RESPONSE = "Glad I could help! Feel free to ask anything else about Gokul."
FAREWELL_RESPONSE = "Bye! Have a great day! 👋"

history = []

def detect_intent(text: str) -> str:
    """Returns: greeting | thanks | farewell | question"""
    normalized = text.lower().strip().rstrip("!?.,")
    words = set(normalized.split())

    if normalized in GREETINGS or words & GREETINGS:
        return "greeting"
    if normalized in THANKS or words & THANKS:
        return "thanks"
    if normalized in FAREWELLS or words & FAREWELLS:
        return "farewell"
    return "question"

def build_context(question: str, history: list) -> str:
    if not history:
        return question
    recent = history[-2:]
    ctx = "\n".join([f"User asked: {h['q']}\nAnswer was: {h['a']}" for h in recent])
    return f"Context from earlier:\n{ctx}\n\nNew question: {question}"

print("\n🤖 Gokul AI — Terminal Chat")
print("Type your question. 'quit' to exit.\n")

while True:
    try:
        question = input("You: ").strip()
    except (EOFError, KeyboardInterrupt):
        print("\nBye!")
        break

    if not question:
        continue

    intent = detect_intent(question)

    if intent == "greeting":
        print(f"Gokul AI: {GREETING_RESPONSE}\n")
        history.append({"q": question, "a": GREETING_RESPONSE})
        continue

    if intent == "thanks":
        print(f"Gokul AI: {THANKS_RESPONSE}\n")
        history.append({"q": question, "a": THANKS_RESPONSE})
        continue

    if intent == "farewell":
        print(f"Gokul AI: {FAREWELL_RESPONSE}\n")
        break

    # Actual question — go through retrieval
    contextual_q = build_context(question, history)
    hits = retrieve(contextual_q)

    if not hits and history:
        hits = retrieve(question)

    if not hits:
        print(f"Gokul AI: {FALLBACK}")
        print(f"          [no match]\n")
        history.append({"q": question, "a": FALLBACK})
        continue

    top = hits[0]
    answer = generate_response([h["fact"] for h in hits], question, history=history)

    print(f"Gokul AI: {answer}")
    print(f"          [score: {top['score']:.2f} | topic: {top['topic']}]\n")

    history.append({"q": question, "a": answer})