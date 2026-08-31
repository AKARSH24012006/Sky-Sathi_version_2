"""Flight watcher worker: polls status every 2 min and pushes calm notifications on
gate change / landing / severe arrival weather.  Run:  python -m app.workers.notify 6E2134 BLR
Production: one task per active flight on a queue; this is the single-flight CLI."""
import asyncio, sys
from ..flights.data import get_live_flight
from ..weather.data import get_weather
from .. import models  # noqa: ensures metadata import parity
from ..notifications.push import send_expo

TOKENS: list[str] = []   # production: SELECT push tokens subscribed to this flight

async def watch(flight_no: str, arrival_iata: str, interval: int = 120):
    last_gate, last_status, weather_warned = None, None, False
    while True:
        f = await get_live_flight(flight_no)
        if last_gate and f["gate"] != last_gate:
            await send_expo(TOKENS, "Gate update — no rush",
                f"{flight_no} now boards at Gate {f['gate']}. You have time; I\u2019ll guide you there.")
        if f["status"] != last_status and f["status"] in ("landed", "arrived"):
            await send_expo(TOKENS, "Landed safely",
                f"{flight_no} is on the ground. Welcome to {arrival_iata}.")
        if not weather_warned:
            wx = await get_weather(arrival_iata)
            if wx["code"] >= 95:
                weather_warned = True
                await send_expo(TOKENS, "Weather at arrival — a calm heads-up",
                    f"{wx['summary'].capitalize()} near {arrival_iata}. {wx['calm_note']}.")
        last_gate, last_status = f["gate"], f["status"]
        print(f"[watch] {flight_no}: {f['status']} gate {f['gate']}")
        await asyncio.sleep(interval)

if __name__ == "__main__":
    fn = sys.argv[1] if len(sys.argv) > 1 else "6E2134"
    ap = sys.argv[2] if len(sys.argv) > 2 else "BLR"
    asyncio.run(watch(fn, ap))
