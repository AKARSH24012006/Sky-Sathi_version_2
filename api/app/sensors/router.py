from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from ..db import get_db
from ..auth.deps import current_user_id
from ..models import SensorEvent, TurbulenceReport

router = APIRouter(prefix="/sensors", tags=["sensors"])

class WindowIn(BaseModel):
    session_id: str; phase: str; confidence: float
    vert_var: float; alt_rate: float | None = None
    gspd: float | None = None; db_level: float | None = None
    route_cell: str | None = None; time_bucket: str | None = None

@router.post("/window")
async def window(body: WindowIn, uid: str = Depends(current_user_id), db=Depends(get_db)):
    """Aggregated feature windows only — raw streams never leave the device."""
    db.add(SensorEvent(session_id=body.session_id, phase_detected=body.phase,
                       confidence=body.confidence, vert_var=body.vert_var,
                       alt_rate=body.alt_rate, gspd=body.gspd, db_level=body.db_level))
    if body.route_cell and body.time_bucket:
        db.add(TurbulenceReport(route_cell=body.route_cell, time_bucket=body.time_bucket, energy=body.vert_var))
    await db.commit()
    return {"ok": True}

@router.get("/turbulence/{route_cell}")
async def turbulence(route_cell: str, db=Depends(get_db)):
    rows = (await db.execute(select(TurbulenceReport)
            .where(TurbulenceReport.route_cell == route_cell)
            .order_by(TurbulenceReport.id.desc()).limit(200))).scalars().all()
    if not rows: return {"route_cell": route_cell, "expected": None}
    avg = sum(r.energy for r in rows)/len(rows)
    return {"route_cell": route_cell, "n": len(rows),
            "expected": "smooth" if avg<1.0 else "light" if avg<2.0 else "moderate"}
