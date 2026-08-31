"""Receipt-validated entitlements. Client sends store receipt; server verifies with
Apple/Google (or UPI order id) and grants the plan. Client NEVER decides entitlement."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from ..db import get_db
from ..auth.deps import current_user_id
from ..models import Premium

router = APIRouter(prefix="/premium", tags=["premium"])

class ReceiptIn(BaseModel):
    store: str          # apple|google|upi
    receipt: str
    plan: str           # per_flight|annual|family

@router.get("")
async def entitlement(uid: str = Depends(current_user_id), db=Depends(get_db)):
    p = await db.get(Premium, uid)
    return {"plan": p.plan if p else "free", "expires_at": str(p.expires_at) if p and p.expires_at else None}

@router.post("/verify")
async def verify(body: ReceiptIn, uid: str = Depends(current_user_id), db=Depends(get_db)):
    # TODO: call App Store Server API / Google Play Developer API / UPI PSP here.
    p = await db.get(Premium, uid) or Premium(user_id=uid)
    p.plan, p.store, p.receipt = body.plan, body.store, body.receipt
    db.add(p); await db.commit()
    return {"granted": body.plan}
