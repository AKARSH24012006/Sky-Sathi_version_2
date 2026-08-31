from fastapi import APIRouter, HTTPException
from .data import AIRPORTS, AMENITIES
router = APIRouter(prefix="/airports", tags=["airports"])

@router.get("/{iata}")
async def airport(iata: str):
    ap = AIRPORTS.get(iata.upper())
    if not ap: raise HTTPException(404, "unknown airport")
    return {"iata": iata.upper(), **ap}

@router.get("/{iata}/amenities")
async def amenities(iata: str):
    return AMENITIES.get(iata.upper(), [])
