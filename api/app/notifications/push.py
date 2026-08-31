"""Expo push sender — one endpoint covers iOS + Android in dev; swap to raw
APNs/FCM at scale. Copy discipline: calm words only, sound off by default."""
import httpx

async def send_expo(tokens: list[str], title: str, body: str):
    if not tokens: return 0
    msgs = [{"to": t, "title": title, "body": body, "sound": None} for t in tokens]
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post("https://exp.host/--/api/v2/push/send", json=msgs)
    return r.status_code
