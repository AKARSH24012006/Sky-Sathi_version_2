from fastapi import APIRouter, Depends
from pydantic import BaseModel
from ..db import get_db
from ..auth.deps import current_user_id
from ..models import PushToken

router = APIRouter(prefix="/notifications", tags=["notifications"])

class TokenIn(BaseModel):
    platform: str
    push_token: str

@router.post("/register")
async def register(body: TokenIn, uid: str = Depends(current_user_id), db=Depends(get_db)):
    db.add(PushToken(token=body.push_token, user_id=uid, platform=body.platform))
    await db.commit()
    return {"ok": True}
