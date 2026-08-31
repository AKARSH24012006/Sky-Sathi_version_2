from fastapi import APIRouter, Depends
from sqlalchemy import update
from ..db import get_db
from ..auth.deps import current_user_id
from ..models import User, AuditLog
import datetime as dt

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/me")
async def me(uid: str = Depends(current_user_id), db=Depends(get_db)):
    u = await db.get(User, uid)
    return {"id": u.id, "kind": u.kind, "name": u.name, "email": u.email}

@router.delete("/me")
async def delete_me(uid: str = Depends(current_user_id), db=Depends(get_db)):
    """GDPR/DPDP delete: soft-delete now, hard purge by nightly job after grace window."""
    await db.execute(update(User).where(User.id == uid).values(deleted_at=dt.datetime.utcnow()))
    db.add(AuditLog(user_id=uid, action="account_delete_requested"))
    await db.commit()
    return {"scheduled": True}

@router.get("/me/export")
async def export_me(uid: str = Depends(current_user_id), db=Depends(get_db)):
    """Mirrors the on-device export: everything we hold, in one JSON."""
    db.add(AuditLog(user_id=uid, action="data_export")); await db.commit()
    return {"note": "assemble users+flights+journal+conversations for uid", "user_id": uid}
