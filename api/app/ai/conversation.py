"""Conversation service: loads memory + history from the DB, then runs the
fixed GenAI pipeline (ai/pipeline.py) for one reply. Without an LLM key the
pipeline returns a KB-grounded extractive answer — never a dead end."""
from sqlalchemy import select
from ..models import Message
from .memory import memory_block
from .pipeline import run


async def generate_reply(db, user_id: str, conversation_id: str, body) -> dict:
    mem = await memory_block(db, user_id)
    history = (await db.execute(
        select(Message).where(Message.conversation_id == conversation_id)
        .order_by(Message.id.desc()).limit(9))).scalars().all()
    # newest row is the user message just added — the pipeline appends it itself
    turns = [{"role": m.role, "content": m.content} for m in reversed(history)][:-1]
    return await run(body.text, mode=body.mode if body.mode in ("calm", "educational", "child") else "calm",
                     live=body.live, history=turns, memory=mem,
                     anxiety_hint=None if body.anxiety_band == "auto" else body.anxiety_band)
