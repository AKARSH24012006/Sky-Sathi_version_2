from fastapi import APIRouter
from .data import get_weather
router = APIRouter(prefix="/weather", tags=["weather"])

@router.get("/{iata}")
async def weather(iata: str): return await get_weather(iata)
