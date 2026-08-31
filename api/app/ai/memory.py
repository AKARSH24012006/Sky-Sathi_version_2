"""Memory Engine: compiles the warm user record into a compact prompt block.
Hot = current conversation (caller supplies). Cold = embedded history (Stage 6)."""
from sqlalchemy import select, func
from ..models import Preference, Flight

async def memory_block(db, user_id: str) -> str:
    p = await db.get(Preference, user_id)
    n_flights = (await db.execute(
        select(func.count()).select_from(Flight)
        .where(Flight.user_id == user_id, Flight.status == "done"))).scalar() or 0
    bits = []
    if p:
        if p.fear: bits.append(f'hardest moment: "{p.fear}"')
        if p.tone: bits.append(f'tone: {p.tone}')
        if p.language: bits.append(f'language: {p.language}')
    bits.append(f"flights completed together: {n_flights}")
    return "PASSENGER MEMORY: " + "; ".join(bits)
