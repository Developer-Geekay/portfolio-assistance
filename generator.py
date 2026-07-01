# generator.py
from llama_cpp import Llama

MODEL_PATH = "./models/generator/qwen2.5-0.5b-instruct-q4.gguf"

# Load once at module level — not per request
print("Loading generator model...")
llm = Llama(
    model_path=MODEL_PATH,
    n_ctx=512,
    n_threads=4,
    n_gpu_layers=0,   # 0 = CPU only (change to -1 for full Metal on Mac)
    verbose=False     # suppresses all banner/log output
)
print("Generator ready.")


def generate_response(facts: list[str], question: str, 
                      confidence: str = "high", history: list = None) -> str:
    combined_facts = " ".join(facts)

    # Build history context string
    history_text = ""
    if history:
        recent = history[-2:]
        history_text = "\n".join([
            f"User: {h['q']}\nAssistant: {h['a']}" for h in recent
        ])
        history_text = f"\nPrevious exchange:\n{history_text}\n"

    caution = (
        "If the facts don't fully answer, say only what the facts confirm. Never invent."
        if confidence == "medium"
        else "Answer using ONLY the facts. Never invent details."
    )

    messages = [
        {
            "role": "system",
            "content": (
                f"You are a concise assistant representing Gokul. {caution} "
                f"If asked about something not in the facts, say you don't have that information. "
                f"Respond in 1-2 sentences only."
            )
        },
        {
            "role": "user",
            "content": (
                f"Facts: {combined_facts}"
                f"{history_text}"
                f"\nQuestion: {question}"
            )
        }
    ]

    response = llm.create_chat_completion(
        messages=messages,
        max_tokens=100,
        temperature=0.1,
        repeat_penalty=1.1,
        stop=["<|im_end|>", "<|end|>", "\n\n"]
    )

    return response["choices"][0]["message"]["content"].strip()