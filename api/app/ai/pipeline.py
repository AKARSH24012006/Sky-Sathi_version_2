"""The SkySathi GenAI pipeline — one fixed, linear pass per message.

  ① NLP preprocess  ->  ② ML classify (anxiety, intent)  ->  ③ hybrid RAG
  ->  ④ prompt assembly  ->  ⑤ LLM generation  ->  ⑥ guardrails  ->  reply + trace

There are no loops, no tool calls and no autonomous decisions: each stage is a
plain function and the order never changes. The `trace` returned with every
reply records each stage's output and timing — it powers the "How this answer
was made" panel and the evaluation report.
"""
from __future__ import annotations
import time

from . import nlp, classifier, rag, prompts, guardrails, llm


def extractive_answer(hits: list[dict], intent: str, task: str = "answer") -> str:
    """No-LLM fallback: composed only from retrieved KB sentences (labelled as such in the trace)."""
    if task == "brief":
        import json
        return json.dumps({
            "headline": "Your flight, explained before it happens",
            "what_to_expect": [h["text"] for h in hits[:3]],
            "sounds_you_will_hear": [hits[0].get("calm", "")] if hits else [],
            "one_breath_tip": "Breathe in for four, hold for four, out for six.",
            "sources": [h["id"] for h in hits[:3]]})
    if not hits:
        return "Everything I can see is steady and normal. Ask the crew anytime — they are trained for every question."
    top = hits[0]
    lead = "I'm right here with you. Breathe in for four, out for six. " if intent == "panic" else ""
    return f"{lead}{top['text']} [{top['id']}] {top.get('calm', '')}".strip()


async def run(text: str, *, mode: str = "calm", live: dict | None = None, history: list[dict] | None = None,
              memory: str = "", technique: str = "production", task: str = "answer",
              anxiety_hint: str | None = None, k: int = 3) -> dict:
    trace: list[dict] = []
    t_all = time.perf_counter()

    def stage(name: str, t0: float, **out):
        trace.append({"stage": name, "ms": round((time.perf_counter() - t0) * 1000, 2), **out})

    t0 = time.perf_counter()
    a = nlp.analyse(text)
    guard_in = guardrails.input_check(a["clean"])
    stage("nlp", t0, language=a["language"], entities=a["entities"], tokens=a["content_tokens"][:12],
          emergency=guard_in["emergency"])

    t0 = time.perf_counter()
    c = classifier.classify(a["clean"]) if task == "answer" else \
        {"anxiety": "calm", "intent": "explain", "method": "skipped (non-chat task)", "anxiety_proba": {}, "intent_proba": {}}
    anxiety = c["anxiety"]
    if anxiety_hint in ("raised", "high") and anxiety == "calm":
        anxiety = anxiety_hint           # live sensors / UI may raise, never lower, the band
    stage("ml_classify", t0, anxiety=anxiety, intent=c["intent"], method=c["method"],
          anxiety_proba=c.get("anxiety_proba"), intent_proba=c.get("intent_proba"),
          safety_override=c.get("safety_override", False))

    t0 = time.perf_counter()
    r = rag.search(a["clean"], k)
    hits = r["hits"]
    if c["intent"] == "panic" and "safety" not in {h["id"] for h in hits}:
        # acute distress: always ground the reply in the core safety fact first
        safety = next((e for e in rag._kb() if e["id"] == "safety"), None)
        if safety:
            hits = [{"id": "safety", "text": safety["text"], "calm": safety.get("calm", ""), "rank": 0,
                     "bm25": None, "cosine": None}] + hits[:k - 1]
    stage("retrieve", t0, retriever=r["retriever"], confident=r["confident"],
          hits=[{k2: h[k2] for k2 in ("id", "rank", "bm25", "cosine")} for h in hits])

    t0 = time.perf_counter()
    p = prompts.build(technique, a["clean"], hits=hits, intent=c["intent"], anxiety=anxiety, mode=mode,
                      language=a["language"], live=live, memory=memory, history=history, task=task)
    prompt_chars = sum(len(m["content"]) for m in p["messages"])
    stage("prompt", t0, technique=technique, parts=p["parts"], version=p["version"],
          temperature=p["temperature"], approx_tokens=prompt_chars // 4)

    t0 = time.perf_counter()
    gen: dict
    try:
        gen = await llm.generate(p["messages"], p["temperature"], p["max_tokens"])
        gen["generator"] = f"LLM · {gen['model']}"
    except llm.LLMUnavailable as e:
        gen = {"text": extractive_answer(hits, c["intent"], task), "generator": "extractive KB fallback (no LLM key)",
               "error": str(e)[:120], "usage": {}}
    stage("generate", t0, generator=gen["generator"], usage=gen.get("usage", {}))

    t0 = time.perf_counter()
    g = guardrails.check_output(gen["text"], valid_ids={h["id"] for h in rag._kb()}, anxiety=anxiety,
                                task=task, emergency=guard_in["emergency"])
    stage("guardrails", t0, flags=g["flags"], citations=g["citations"])

    return {"reply": g["text"], "json": g.get("json"), "reasoning": g.get("reasoning", ""),
            "citations": g["citations"], "raw": gen["text"], "anxiety": anxiety, "intent": c["intent"],
            "language": a["language"], "hits": hits, "messages": p["messages"],
            "generator": gen["generator"], "total_ms": round((time.perf_counter() - t_all) * 1000, 1),
            "trace": trace}
