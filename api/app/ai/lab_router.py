"""GenAI Lab API — makes every stage of the pipeline inspectable for demos and
review: run the pipeline with a full trace, compare prompt techniques on the
use-case scenarios, and read the evaluation report. No DB/auth needed, so it
works even when Postgres is down."""
from __future__ import annotations
import json
import pathlib

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from . import pipeline, prompts, rag, classifier, llm, evaluation, nlp

router = APIRouter(prefix="/genai", tags=["genai-lab"])
REPORT = pathlib.Path(__file__).resolve().parents[2] / "eval" / "report.json"
_report_cache: dict | None = None

STAGES = [
    {"id": "nlp", "name": "NLP preprocess", "family": "NLP", "what": "normalise · tokenise · language-ID (EN/HI/Hinglish) · entities (flight, IATA, gate)"},
    {"id": "ml_classify", "name": "Passenger-state classifiers", "family": "ML", "what": "TF-IDF (word+char n-grams) → Logistic Regression: anxiety band + intent"},
    {"id": "retrieve", "name": "Hybrid retrieval (RAG)", "family": "DL / Transformer", "what": "BM25 ⊕ MiniLM transformer embeddings, fused by RRF over the pilot-reviewed KB"},
    {"id": "prompt", "name": "Prompt assembly", "family": "Prompt engineering", "what": "persona + audience + anxiety policy + few-shot + KB context + live state"},
    {"id": "generate", "name": "LLM generation", "family": "GenAI", "what": "decoder-only transformer (gpt-4o-mini or any OpenAI-compatible model)"},
    {"id": "guardrails", "name": "Guardrails", "family": "Safety", "what": "citation check · sentence cap · banned words · JSON validation · emergency prefix"},
]


class RunIn(BaseModel):
    text: str
    mode: str = "calm"
    technique: str = "production"
    task: str = "answer"
    live: dict = {}


class LabIn(BaseModel):
    use_case: str
    techniques: list[str] = ["zero_shot", "role", "few_shot", "rag", "production"]
    text: str | None = None


@router.get("/overview")
async def overview():
    return {"stages": STAGES, "techniques": prompts.TECHNIQUES, "use_cases": prompts.USE_CASES,
            "llm": {"configured": llm.configured(), "model": llm.model_name()},
            "retriever": rag.retriever_name(),
            "classifier": "tfidf+logreg" if classifier.models() else "lexicon-fallback",
            "prompt_version": prompts.PROMPT_VERSION, "kb_entries": len(rag._kb())}


@router.post("/run")
async def run(body: RunIn):
    if body.technique not in {t["id"] for t in prompts.TECHNIQUES}:
        raise HTTPException(400, "unknown technique")
    return await pipeline.run(body.text[:600], mode=body.mode, technique=body.technique, task=body.task, live=body.live)


@router.post("/classify")
async def classify(body: RunIn):
    return {"nlp": nlp.analyse(body.text), "ml": classifier.classify(body.text)}


@router.post("/prompt-lab")
async def prompt_lab(body: LabIn):
    uc = next((u for u in prompts.USE_CASES if u["id"] == body.use_case), None)
    if not uc:
        raise HTTPException(404, "unknown use case")
    text = (body.text or uc["input"])[:1200]
    results = []
    for t in body.techniques[:7]:
        out = await pipeline.run(text, mode=uc["mode"], technique=t, task=uc["task"], live=uc["live"])
        ans = out["reply"]
        results.append({
            "technique": t, "reply": ans, "json": out["json"], "reasoning": out["reasoning"],
            "messages": out["messages"], "parts": out["trace"][3]["parts"], "temperature": out["trace"][3]["temperature"],
            "approx_tokens": out["trace"][3]["approx_tokens"], "generator": out["generator"],
            "metrics": {"groundedness": evaluation.groundedness(ans, out["hits"]),
                        "flesch": evaluation.flesch(ans) if not out["json"] else None,
                        "citations": out["citations"], "flags": out["trace"][-1]["flags"],
                        "ms": out["total_ms"]},
        })
    return {"use_case": uc, "input": text, "results": results}


@router.get("/eval")
async def eval_report(refresh: bool = False):
    """Prefer the full report written by scripts/evaluate.py; else compute the fast offline one."""
    global _report_cache
    if not refresh and REPORT.exists():
        return json.loads(REPORT.read_text(encoding="utf-8"))
    if _report_cache is None or refresh:
        _report_cache = await evaluation.full_report(compare_techniques=False, gen_sample=6)
    return _report_cache


# ---- airport GenAI: route narration + arrival plan (LLM writes words; code decides facts) ----
from . import travel  # noqa: E402


class NavIn(BaseModel):
    route: dict


class ArrIn(BaseModel):
    plan: dict


@router.post("/navigate")
async def navigate(body: NavIn):
    return await travel.narrate_route(body.route)


@router.post("/arrival")
async def arrival(body: ArrIn):
    return await travel.arrival_plan(body.plan)
