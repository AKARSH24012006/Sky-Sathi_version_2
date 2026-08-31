"""SkySathi API — feature-oriented: auth/ ai/ flights/ airports/ weather/
sensors/ notifications/ users/ analytics/ models/ db/ workers/.
Startup creates tables automatically; every error returns clean JSON."""
import logging, time, uuid
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .auth import router as auth_router
from .users import router as users_router, preferences, premium, feedback
from .ai import router as ai_router
from .flights import router as flights_router
from .airports import router as airports_router
from .weather import router as weather_router
from .sensors import router as sensors_router
from .notifications import router as notifications_router
from .analytics import router as analytics_router
from . import version

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("skysathi")

app = FastAPI(title="SkySathi API", version="4.0.0",
              description="Calm flight intelligence: auth, live data, sensors, AI companion.")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
async def startup():
    """Auto-create tables so first run needs zero manual steps. Alembic takes over
    for real migrations in production."""
    try:
        from .db import engine, Base
        from . import models  # noqa: F401 registers tables
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        log.info("database ready")
    except Exception as e:
        log.warning("database unavailable (%s) — auth/chat/journal disabled; live data still up", e)

_bucket: dict[str, list[float]] = {}

@app.middleware("http")
async def trace_rate_log(request: Request, call_next):
    ip = request.client.host if request.client else "?"
    now = time.time()
    hits = [t for t in _bucket.get(ip, []) if now - t < 60]
    if len(hits) > 240:
        return JSONResponse({"detail": "rate limit — try again in a minute"}, status_code=429)
    hits.append(now); _bucket[ip] = hits
    rid = uuid.uuid4().hex[:12]
    t0 = time.time()
    try:
        resp = await call_next(request)
    except Exception:
        log.exception("unhandled error rid=%s %s %s", rid, request.method, request.url.path)
        return JSONResponse({"detail": "something went wrong on our side — it's logged", "request_id": rid},
                            status_code=500)
    resp.headers["x-request-id"] = rid
    log.info("%s %s -> %s in %dms", request.method, request.url.path, resp.status_code, (time.time()-t0)*1000)
    return resp

@app.get("/health", tags=["ops"])
async def health():
    return {"ok": True, "service": "skysathi-api", "version": "3.0.0"}

@app.get("/ready", tags=["ops"])
async def ready():
    out = {"api": True, "db": False, "redis": False}
    try:
        from sqlalchemy import text
        from .db import engine
        async with engine.connect() as c:
            await c.execute(text("SELECT 1"))
        out["db"] = True
    except Exception:
        pass
    try:
        from .db.cache import _r
        if _r is not None:
            await _r.ping(); out["redis"] = True
    except Exception:
        pass
    return out

for r in (auth_router.router, users_router.router, preferences.router, premium.router,
          feedback.router, ai_router.router, flights_router.router, airports_router.router,
          weather_router.router, sensors_router.router, notifications_router.router,
          analytics_router.router, version.router):
    app.include_router(r)
