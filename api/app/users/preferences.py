from fastapi import APIRouter, Depends
from pydantic import BaseModel
from ..db import get_db
from ..auth.deps import current_user_id
from ..models import Preference

router = APIRouter(prefix="/preferences", tags=["preferences"])

class PrefIn(BaseModel):
    fear: str | None = None; experience: str | None = None; panic_level: str | None = None
    tone: str | None = None; narration: str | None = None; language: str | None = None
    voice_name: str | None = None; seat: str | None = None; meal: str | None = None
    a11y: dict | None = None

@router.get("")
async def get_prefs(uid: str = Depends(current_user_id), db=Depends(get_db)):
    p = await db.get(Preference, uid)
    return p.__dict__ if p else {}

@router.put("")
async def put_prefs(body: PrefIn, uid: str = Depends(current_user_id), db=Depends(get_db)):
    p = await db.get(Preference, uid) or Preference(user_id=uid)
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(p, k, v)
    db.add(p); await db.commit()
    return {"ok": True}
