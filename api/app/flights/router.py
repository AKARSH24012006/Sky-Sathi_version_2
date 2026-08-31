from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from ..db import get_db
from ..auth.deps import current_user_id
from ..models import Flight
from .data import get_live_flight, get_position, get_track

router = APIRouter(prefix="/flights", tags=["flights"])

class FlightIn(BaseModel):
    flight_no: str; origin: str; dest: str
    aircraft: str | None = None; airline: str | None = None

@router.post("")
async def create(body: FlightIn, uid: str = Depends(current_user_id), db=Depends(get_db)):
    f = Flight(user_id=uid, **body.model_dump())
    db.add(f); await db.commit()
    return {"id": f.id}

@router.get("")
async def history(uid: str = Depends(current_user_id), db=Depends(get_db)):
    rows = (await db.execute(select(Flight).where(Flight.user_id == uid))).scalars().all()
    return [{"id": f.id, "route": f"{f.origin}-{f.dest}", "rating": f.rating, "status": f.status} for f in rows]

@router.get("/live/{flight_no}")
async def live(flight_no: str): return await get_live_flight(flight_no)

@router.get("/position/{callsign}")
async def position(callsign: str): return await get_position(callsign)

@router.get("/track/{flight_no}")
async def track(flight_no: str): return await get_track(flight_no)
