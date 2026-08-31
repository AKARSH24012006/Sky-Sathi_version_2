"""Conversation Engine: orchestrates Memory + RAG + Explanation guidance into one
LLM call (OpenAI chat completions). System prompt is stable-first for caching;
dynamic tail (live state, anxiety, retrieval) appended per message. Without an
API key, answers come straight from the grounded KB — never a dead end."""
import httpx
from sqlalchemy import select
from ..config import settings
from ..models import Message
from .memory import memory_block
from .rag import retrieve
from .explanation import build_rules

STATIC_PREFIX = "You are SkySathi, a calm travel companion for anxious flyers.\n"

async def generate_reply(db, user_id: str, conversation_id: str, body) -> str:
    mem = await memory_block(db, user_id)
    kb = await retrieve(db, body.text, 3)
    kb_block = "KNOWLEDGE:\n" + "\n".join(f"- {c['text']} {c.get('calm','')}" for c in kb)
    live = f"LIVE: mode={body.mode}; " + "; ".join(f"{k}={v}" for k, v in body.live.items())
    ax = f"ANXIETY BAND: {body.anxiety_band} — calibrate warmth and brevity."
    history = (await db.execute(
        select(Message).where(Message.conversation_id == conversation_id)
        .order_by(Message.id.desc()).limit(12))).scalars().all()
    messages = [{"role": m.role, "content": m.content} for m in reversed(history)]
    messages.append({"role": "user", "content": body.text})
    rules = build_rules(tone="warm", language="en", anxiety_band=body.anxiety_band)
    system = "\n".join([STATIC_PREFIX, mem, kb_block, live, ax, "RULES: " + rules])
    if not settings.openai_api_key:
        return kb[0]["text"] + " " + kb[0].get("calm", "") if kb else "Everything I can see is steady and normal."
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post("https://api.openai.com/v1/chat/completions",
            headers={"authorization": f"Bearer {settings.openai_api_key}"},
            json={"model": settings.openai_model, "max_tokens": 400,
                  "messages": [{"role": "system", "content": system}] + messages})
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"].strip()
