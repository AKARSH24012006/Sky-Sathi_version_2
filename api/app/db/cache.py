"""Redis JSON cache with graceful no-redis fallback."""
import json, os
try:
    import redis.asyncio as aioredis
    _r = aioredis.from_url(os.environ.get("REDIS_URL", "redis://localhost:6379/0"))
except Exception:
    _r = None

async def cached(key: str, ttl: int, fetch):
    if _r:
        try:
            hit = await _r.get(key)
            if hit: return json.loads(hit)
        except Exception: pass
    data = await fetch()
    if _r and data:
        try: await _r.set(key, json.dumps(data), ex=ttl)
        except Exception: pass
    return data
