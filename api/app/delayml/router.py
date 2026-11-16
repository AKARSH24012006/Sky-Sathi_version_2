"""Delay Intelligence API (no DB/auth needed — works on a free host).

GET  /delayml/overview   model cards, test metrics, airports/airlines/routes
POST /delayml/predict    PBL-1 + PBL-3 committee + PBL-2 flight profile
POST /delayml/ripple     PBL-2 HMM: hidden congestion state from hourly delay levels
POST /delayml/explain    the forecast handed to the GenAI pipeline as live context
"""
from __future__ import annotations
from fastapi import APIRouter
from pydantic import BaseModel, Field

from . import engine

router = APIRouter(prefix="/delayml", tags=["delay-intelligence"])


class PredictIn(BaseModel):
    airline: str = "WN"
    origin: str = "DEN"
    dest: str = "LAS"
    dep_hour: float = Field(9, ge=0, le=23.99)
    day_of_week: int = Field(3, ge=1, le=7)
    distance_mi: float | None = None
    sched_minutes: float | None = None
    live_origin_delay: float | None = None
    live_airline_delay: float | None = None
    live_dest_delay: float | None = None


class RippleIn(BaseModel):
    levels: list[int] = Field(default_factory=lambda: [0, 0, 1])


class ExplainIn(PredictIn):
    question: str = "Will my flight be delayed? I'm a bit worried."
    mode: str = "calm"


def summary(p: dict) -> str:
    """Deterministic, calm wording of the forecast — the template the LLM is asked to follow."""
    pct = round(p["probability"] * 100)
    base = round(p["prior"] * 100)
    rel = "about the same as" if abs(pct - base) < 5 else "lower than" if pct < base else "higher than"
    late = sum(1 for m in p["committee"] if m["says_late"])
    return (f"{pct}% chance of arriving 15+ minutes late ({rel} the usual {base}%). "
            f"Expected delay about {round(p['expected_delay_min'])} min. "
            f"{late} of {len(p['committee'])} models lean 'late'. Profile: {p['cluster']['name']}.")


@router.get("/overview")
async def overview():
    return engine.overview()


@router.post("/predict")
async def predict(body: PredictIn):
    p = engine.predict(body.model_dump())
    return {**p, "summary": summary(p)}


@router.post("/ripple")
async def ripple(body: RippleIn):
    return engine.ripple(body.levels)


@router.post("/explain")
async def explain(body: ExplainIn):
    from ..ai import pipeline
    p = engine.predict(body.model_dump())
    s = summary(p)
    live = {"delay_forecast": s, "delay_band": p["band"],
            "note": "forecast from SkySathi's delay models (ML); explain it calmly, never promise on-time"}
    out = await pipeline.run(body.question[:400], mode=body.mode, live=live)
    reply = out["reply"]
    if not out["generator"].startswith("LLM"):      # extractive fallback can't see live context — lead with the numbers
        reply = f"{s} {reply}"
    return {"forecast": {**p, "summary": s}, "reply": reply, "citations": out["citations"],
            "generator": out["generator"], "trace": out["trace"], "total_ms": out["total_ms"]}
