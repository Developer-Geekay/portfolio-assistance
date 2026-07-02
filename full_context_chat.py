# full_context_chat.py — terminal chat interface
import engine
from intent import (detect_intent, GREETING_RESPONSE, THANKS_RESPONSE,
                    FAREWELL_RESPONSE, SELF_INTRO_RESPONSE)

FALLBACK = (
    "That's something Gokul hasn't shared with me yet — "
    "but I've noted your question and he'll review it soon."
)

engine.load_model()

history: list[dict] = []

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

    if intent == "self_intro":
        print(f"Gokul AI: {SELF_INTRO_RESPONSE}\n")
        history.append({"q": question, "a": SELF_INTRO_RESPONSE})
        continue

    answer = engine.ask(question, history)
    print(f"Gokul AI: {answer}\n")
    history.append({"q": question, "a": answer})
