import os
import re

# The person this assistant represents — set in .env for your own build
NAME    = os.environ.get("PERSONA_NAME", "Gokul")
CONTACT = os.environ.get("PERSONA_CONTACT", "via the contact links on this site")

GREETINGS  = {"hi", "hello", "hey", "hii", "helo", "howdy", "sup", "yo"}
# spoken greetings arrive as sentences — matched by substring on short turns
GREETING_PHRASES = (
    "good morning", "good afternoon", "good evening",
    "how are you", "how's it going", "hows it going",
    "what's up", "whats up", "nice to meet you",
)
# acknowledgments that keep the conversation open (explicit thank-yous end it)
THANKS     = {"great", "cool", "awesome", "nice", "perfect", "ok", "okay", "got it", "understood"}
FAREWELLS  = {"bye", "goodbye", "see you", "cya", "exit", "quit", "q"}
# spoken farewells arrive as full sentences — matched by substring
FAREWELL_PHRASES = (
    "end the conversation", "end of the conversation", "close the conversation",
    "close it", "that's all", "thats all", "that is all", "nothing else",
    "that's it", "that is it", "no more questions", "nothing more",
    "we're done", "were done", "i'm done", "im done", "i am done",
    "i'm good", "im good", "all good", "stop the conversation",
    "good night", "goodnight", "talk to you later", "catch you later",
    "talk later", "talk it later", "talk to you soon", "we can talk later",
    "wrap up", "wrap it up", "call it a day", "see you later", "see you soon",
    "have a good day", "have a nice day", "have a great day",
    "thank you for your time", "thanks for your time",
)
# explicit thank-you — in a voice flow this signals the visitor is wrapping up,
# unless it's followed by another question ("thanks, and what about...")
THANKS_RE = re.compile(r"\b(thanks|thank\s*you|thankyou|thx|ty)\b", re.I)
QUESTION_HINT = re.compile(
    r"\?|\b(what|who|where|when|why|how|which|whose|can|could|would|will|"
    r"do|does|did|is|are|was|were|tell|explain|share|describe|about)\b", re.I)
SELF_INTRO = {"who are you", "what are you", "who are you?", "what are you?",
              "tell me about yourself", "introduce yourself", "what can you do",
              "what can you tell me", "what do you do"}

# Private-life and career-negotiation topics are never answered by the portal —
# visitors are pointed to Gokul directly. Hobbies/entertainment stay answerable.
PERSONAL_PATTERN = re.compile(
    # private life
    r"\b(married|marriage|wife|spouse|girlfriend|dating|relationship|"
    r"kids|children|family|parents|father|mother|brother|sister|relatives|"
    r"age|how old|religion|caste|phone number|home address|personal life|"
    # career negotiations & availability
    r"salary|income|earn(s|ing)?|ctc|compensation|pay package|"
    r"notice period|driving licen[cs]e|negotiat\w*|relocat\w*|"
    r"new opportunit\w*|open to opportunit\w*|job opportunit\w*|"
    r"job offer|offer letter|hiring|join (us|our|my)|joining date|"
    r"onsite|on-site|remote work|work arrangement|availab\w*)\b"
)

GREETING_RESPONSE = (
    f"Hey there! I'm {NAME}'s AI assistant. "
    f"Ask me anything about {NAME} — his skills, projects, experience, or background!"
)
THANKS_RESPONSE     = f"Glad I could help! Feel free to ask anything else about {NAME}."
FAREWELL_RESPONSE   = (
    f"It was great talking with you! "
    f"Come back anytime you'd like to know more about {NAME}. Bye!"
)
PERSONAL_RESPONSE   = (
    f"For that, it's best to reach out to {NAME} directly {CONTACT} — "
    "or share your name and email or phone number here, "
    "and he'll get back to you."
)
LEAD_RESPONSE       = (
    f"Perfect — I've noted your details, and {NAME} will reach out to you soon. "
    "Anything else you'd like to know about his work?"
)

# Visitor left their contact details (spoken emails arrive as "john at gmail dot com")
EMAIL_RE     = re.compile(r"[\w.+-]+@[\w-]+\.[a-z]{2,}", re.I)
SPOKEN_EMAIL = re.compile(
    r"([\w.+-]+)\s+at\s+([\w-]+(?:\.[\w-]+)*\.(?:com|net|org|io|in|co|ai|dev|me|edu|gov))\b",
    re.I)
PHONE_RE     = re.compile(r"\+?\d[\d\s\-]{6,}\d")
CONTACT_HINT = re.compile(
    r"\b(my (name|email|mail|number|phone|contact)|reach me|contact me|"
    r"call me|email me|mail me|i am|i'm|this is)\b", re.I)


def extract_contact(text: str):
    """Returns {email, phone, raw} when the message carries contact details."""
    norm = re.sub(r"\s+dot\s+", ".", text, flags=re.I)   # "gmail dot com" → gmail.com
    m = EMAIL_RE.search(norm)
    email = m.group() if m else None
    if not email:
        m = SPOKEN_EMAIL.search(norm)                    # "john at gmail.com"
        email = f"{m.group(1)}@{m.group(2)}" if m else None
    phone = PHONE_RE.search(text)
    # a bare digit-run (e.g. years) is not a lead — phones need contact wording
    if email or (phone and CONTACT_HINT.search(text)):
        return {
            "email": email,
            "phone": phone.group() if phone else None,
            "raw":   text,
        }
    return None
SELF_INTRO_RESPONSE = (
    f"I'm {NAME}'s personal AI assistant — a fully self-hosted system built to answer "
    f"questions about {NAME}: his skills, experience, projects, and background. "
    "Ask me anything about him!"
)


def detect_intent(text: str) -> str:
    """Returns: greeting | thanks | farewell | self_intro | question"""
    normalized = text.lower().strip().rstrip("!?.,")
    # strip per-word punctuation so "okay." or "bye," still match
    words = {w.strip(".,!?'\"") for w in normalized.split()}
    short = len(words) <= 4   # word-level matches only for short utterances,
                              # so "thanks, what are his hobbies?" stays a question

    # farewell first — its phrases are the most specific signal
    if words & FAREWELLS or any(p in normalized for p in FAREWELL_PHRASES):
        return "farewell"
    # a spoken thank-you with no follow-up question means the visitor is done
    if THANKS_RE.search(normalized) and not QUESTION_HINT.search(normalized):
        return "farewell"
    if normalized in SELF_INTRO:
        return "self_intro"
    if PERSONAL_PATTERN.search(normalized):
        return "personal"
    if short and (normalized in GREETINGS or words & GREETINGS):
        return "greeting"
    if len(words) <= 5 and any(p in normalized for p in GREETING_PHRASES):
        return "greeting"
    if short and (normalized in THANKS or words & THANKS):
        return "thanks"
    return "question"
