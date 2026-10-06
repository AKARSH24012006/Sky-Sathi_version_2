"""Stage 5 · Generative model (LLM) client.

One OpenAI-compatible chat-completions call — works with OpenAI (gpt-4o-mini,
default), Groq, Google Gemini's OpenAI endpoint, or a local Ollama server, by
changing LLM_BASE_URL / LLM_MODEL / LLM_API_KEY. No key -> LLMUnavailable, and
the pipeline falls back to its extractive, KB-grounded answer (clearly labelled).
"""
from __future__ import annotations
import time
import httpx
from ..config import settings


class LLMUnavailable(RuntimeError):
    pass


def configured() -> bool:
    return bool(settings.llm_api_key or settings.openai_api_key) or "localhost" in settings.llm_base_url \
        or "ollama" in settings.llm_base_url


def model_name() -> str:
    return settings.llm_model or settings.openai_model


async def generate(messages: list[dict], temperature: float = 0.4, max_tokens: int = 300) -> dict:
    if not configured():
        raise LLMUnavailable("no LLM key configured")
    key = settings.llm_api_key or settings.openai_api_key or "ollama"
    t0 = time.perf_counter()
    async with httpx.AsyncClient(timeout=40) as client:
        r = await client.post(settings.llm_base_url.rstrip("/") + "/chat/completions",
                              headers={"authorization": f"Bearer {key}"},
                              json={"model": model_name(), "messages": messages,
                                    "temperature": temperature, "max_tokens": max_tokens})
    if r.status_code >= 400:
        raise LLMUnavailable(f"LLM HTTP {r.status_code}: {r.text[:200]}")
    data = r.json()
    return {"text": (data["choices"][0]["message"]["content"] or "").strip(),
            "model": data.get("model", model_name()),
            "usage": data.get("usage", {}),
            "latency_ms": round((time.perf_counter() - t0) * 1000)}
