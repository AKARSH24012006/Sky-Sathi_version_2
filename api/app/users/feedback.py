from fastapi import APIRouter, Depends
from pydantic import BaseModel
from ..db import get_db
from ..auth.deps import current_user_id
from ..models import Feedback

router = APIRouter(prefix="/feedback", tags=["feedback"])

class FeedbackIn(BaseModel):
    text: str
    rating: int | None = None

@router.post("")
async def create(body: FeedbackIn, uid: str = Depends(current_user_id), db=Depends(get_db)):
    db.add(Feedback(user_id=uid, text=body.text[:4000], rating=body.rating))
    await db.commit()
    return {"ok": True}
