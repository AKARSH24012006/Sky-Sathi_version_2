"""GenAI for the airport: terminal-route narration and the arrival plan.

The deterministic parts stay deterministic: the route is computed by Dijkstra
over curated terminal data, and travel options are scored by rules. The LLM only
turns those facts into warm, clear words, as strict JSON whose ids are checked
against what we gave it, so it cannot invent a washroom, a shop or a cab option.
It never books or acts; bookings are hand-off links the passenger taps.
"""
from __future__ import annotations
import json
import re

from . import llm

NAV_SYSTEM = (
    "You are SkySathi, a calm airport companion for anxious and first-time flyers. You turn a computed "
    "walking route into short, friendly directions. Use ONLY the places listed in ROUTE (refer to them by "
    "name); never invent shops, toilets, signs or distances. Mention time left before boarding when given, "
    "in a reassuring way. Respond with ONLY JSON: "
    '{"steps":[{"node": "<id from ROUTE>", "text": "<one sentence, max 22 words>"}], "tip": "<one calming sentence>"}'
)

ARR_SYSTEM = (
    "You are SkySathi. A passenger is landing and needs to get into the city. OPTIONS were scored by rules "
    "from their inputs; recommend the best one and explain why in plain words. Use ONLY the given options, "
    "fares and times — they are estimates, say so. You cannot book anything; the passenger taps a link. "
    "Respond with ONLY JSON: "
    '{"recommended":"<option id>","headline":"<max 14 words>","why":"<max 2 sentences>",'
    '"after_landing":["<3 short steps from aircraft to vehicle>"],"hotel_tips":["<0-3 tips, only if need_hotel>"]}'
)


def _parse(text: str) -> dict | None:
    body = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    try:
        return json.loads(body)
    except Exception:
        m = re.search(r"\{.*\}", body, re.S)
        try:
            return json.loads(m.group(0)) if m else None
        except Exception:
            return None


async def narrate_route(route: dict) -> dict:
    ids = {n["id"] for n in route.get("nodes", [])}
    messages = [{"role": "system", "content": NAV_SYSTEM},
                {"role": "user", "content": "ROUTE:\n" + json.dumps(route, ensure_ascii=False)}]
    try:
        out = await llm.generate(messages, temperature=0.3, max_tokens=420)
    except llm.LLMUnavailable as e:
        return {"ok": False, "generator": "template (no LLM key)", "reason": str(e)[:80]}
    obj = _parse(out["text"])
    steps = [s for s in (obj or {}).get("steps", []) if isinstance(s, dict) and s.get("node") in ids and s.get("text")]
    if not obj or not steps:
        return {"ok": False, "generator": f"template (LLM output failed validation)", "raw": out["text"][:300]}
    return {"ok": True, "steps": steps, "tip": str(obj.get("tip", ""))[:240],
            "generator": f"LLM · {out['model']}", "dropped": len(obj.get("steps", [])) - len(steps)}


async def arrival_plan(req: dict) -> dict:
    ids = {o["id"] for o in req.get("options", [])}
    messages = [{"role": "system", "content": ARR_SYSTEM},
                {"role": "user", "content": json.dumps(req, ensure_ascii=False)}]
    try:
        out = await llm.generate(messages, temperature=0.4, max_tokens=420)
    except llm.LLMUnavailable as e:
        return {"ok": False, "generator": "template (no LLM key)", "reason": str(e)[:80]}
    obj = _parse(out["text"])
    if not obj or obj.get("recommended") not in ids:
        return {"ok": False, "generator": "template (LLM output failed validation)", "raw": out["text"][:300]}
    return {"ok": True, "recommended": obj["recommended"], "headline": str(obj.get("headline", ""))[:120],
            "why": str(obj.get("why", ""))[:400], "after_landing": [str(x)[:160] for x in obj.get("after_landing", [])][:4],
            "hotel_tips": [str(x)[:160] for x in obj.get("hotel_tips", [])][:3] if req.get("need_hotel") else [],
            "generator": f"LLM · {out['model']}"}
