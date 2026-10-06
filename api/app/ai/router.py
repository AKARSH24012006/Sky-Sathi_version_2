"""AI feature: chat (GenAI pipeline: NLP -> ML -> RAG -> prompt -> LLM -> guardrails), suggestions, offline KB bundle."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from ..db import get_db
from ..auth.deps import current_user_id
from ..models import Conversation, Message
from .conversation import generate_reply
from .recommendation import suggest
from .rag import _kb

router = APIRouter(prefix="/conversations", tags=["ai"])

class ChatIn(BaseModel):
    conversation_id: str | None = None
    mode: str = "calm"              # calm | educational | child
    text: str
    live: dict = {}
    anxiety_band: str = "auto"      # auto = ML classifier decides; raised/high = floor from sensors

@router.post("/chat")
async def chat(body: ChatIn, uid: str = Depends(current_user_id), db=Depends(get_db)):
    conv = await db.get(Conversation, body.conversation_id) if body.conversation_id else None
    if conv is None:
        conv = Conversation(user_id=uid, mode="flight")
        db.add(conv); await db.flush()
    db.add(Message(conversation_id=conv.id, role="user", content=body.text,
                   anxiety_band=body.anxiety_band if body.anxiety_band != "auto" else None))
    await db.flush()
    out = await generate_reply(db, uid, conv.id, body)
    db.add(Message(conversation_id=conv.id, role="assistant", content=out["reply"]))
    await db.commit()
    return {"conversation_id": conv.id, "reply": out["reply"], "citations": out["citations"],
            "anxiety": out["anxiety"], "intent": out["intent"], "generator": out["generator"],
            "total_ms": out["total_ms"], "trace": out["trace"]}

class SuggestIn(BaseModel):
    phase: str = "cruise"
    asked: list[str] = []
    favourites: list[str] = []

@router.post("/suggestions")
async def suggestions(body: SuggestIn, uid: str = Depends(current_user_id)):
    return {"suggestions": suggest(body.phase, body.asked, body.favourites)}

@router.get("/kb/bundle")
async def kb_bundle():
    """Offline mode: the device downloads and caches the full KB for zero-connectivity answers."""
    return {"version": "v2", "entries": _kb()}
