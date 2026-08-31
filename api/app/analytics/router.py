from fastapi import APIRouter, Depends
from pydantic import BaseModel
from ..db import get_db
from ..auth.deps import current_user_id
from ..models import AnalyticsEvent

router = APIRouter(prefix="/analytics", tags=["analytics"])

class EventIn(BaseModel):
    name: str
    props: dict = {}

@router.post("/events")
async def track(body: EventIn, uid: str = Depends(current_user_id), db=Depends(get_db)):
    """Consent-gated on the client; server stores pseudonymous events only.
    Anxiety scores and raw sensor data are never accepted here by policy."""
    banned = {"anxiety_score", "audio", "location"}
    props = {k: v for k, v in body.props.items() if k not in banned}
    db.add(AnalyticsEvent(user_id=uid, name=body.name[:40], props=props))
    await db.commit()
    return {"ok": True}
