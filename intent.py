GREETINGS  = {"hi", "hello", "hey", "hii", "helo", "howdy", "sup", "yo"}
THANKS     = {"thanks", "thank you", "thankyou", "thx", "ty", "great", "cool", "awesome", "ok", "okay"}
FAREWELLS  = {"bye", "goodbye", "see you", "cya", "exit", "quit", "q"}
SELF_INTRO = {"who are you", "what are you", "who are you?", "what are you?",
              "tell me about yourself", "introduce yourself", "what can you do",
              "what can you tell me", "what do you do"}

GREETING_RESPONSE = (
    "Hey there! I'm Gokul's AI assistant. "
    "Ask me anything about Gokul — his skills, projects, experience, or background!"
)
THANKS_RESPONSE     = "Glad I could help! Feel free to ask anything else about Gokul."
FAREWELL_RESPONSE   = "Bye! Have a great day!"
SELF_INTRO_RESPONSE = (
    "I'm Gokul's personal AI assistant — a lightweight RAG system built to answer "
    "questions about Gokul: his skills, experience, projects, and background. "
    "Ask me anything about him!"
)


def detect_intent(text: str) -> str:
    """Returns: greeting | thanks | farewell | self_intro | question"""
    normalized = text.lower().strip().rstrip("!?.,")
    words = set(normalized.split())

    if normalized in GREETINGS or words & GREETINGS:
        return "greeting"
    if normalized in THANKS or words & THANKS:
        return "thanks"
    if normalized in FAREWELLS or words & FAREWELLS:
        return "farewell"
    if normalized in SELF_INTRO:
        return "self_intro"
    return "question"
