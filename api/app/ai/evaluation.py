"""Evaluation — generated content analysed against SkySathi's objectives.

  O1 Grounded, factual reassurance   -> groundedness, citation rate/precision, safety flags
  O2 Plain, calm language            -> Flesch reading ease, sentence-cap compliance
  O3 Understand the passenger        -> classifier accuracy / macro-F1 / panic recall (5-fold CV)
  O4 Indian-language support         -> Hinglish retrieval Hit@3, language-ID accuracy
  O5 Always available, fast          -> pipeline latency, offline fallback coverage
  (retrieval quality underpins O1)   -> Hit@1, Hit@3, MRR on a gold-labelled question set

Run:  python scripts/evaluate.py   (writes eval/report.json + eval/REPORT.md)
With an LLM key it also compares every prompt technique on the same questions.
"""
from __future__ import annotations
import asyncio
import csv
import datetime as dt
import pathlib
import re
import statistics as st

from . import nlp, rag, classifier, pipeline, guardrails, llm, prompts

EVAL = pathlib.Path(__file__).with_name("data") / "eval_set.csv"


def load_eval() -> list[dict]:
    with EVAL.open(encoding="utf-8") as f:
        return [{**r, "gold": r["gold"].split("|")} for r in csv.DictReader(f)]


def _syllables(word: str) -> int:
    w = word.lower()
    groups = re.findall(r"[aeiouy]+", w)
    n = len(groups) - (1 if w.endswith("e") and len(groups) > 1 else 0)
    return max(1, n)


def flesch(text: str) -> float:
    words = re.findall(r"[A-Za-z']+", text)
    sents = max(1, len(re.findall(r"[.!?]+", text)))
    if not words:
        return 0.0
    syl = sum(_syllables(w) for w in words)
    return round(206.835 - 1.015 * (len(words) / sents) - 84.6 * (syl / len(words)), 1)


def groundedness(answer: str, hits: list[dict]) -> float:
    """Share of the answer's content words that are supported by the retrieved context."""
    ctx = set(nlp.content_tokens(" ".join(h["text"] + " " + h.get("calm", "") for h in hits)))
    ans = nlp.content_tokens(answer)
    return round(sum(t in ctx for t in ans) / len(ans), 3) if ans else 0.0


def retrieval_metrics(items: list[dict]) -> dict:
    h1 = h3 = mrr = 0.0
    rows = []
    for it in items:
        ids = [h["id"] for h in rag.search(it["question"], 5)["hits"]]
        rank = next((i + 1 for i, x in enumerate(ids) if x in it["gold"]), None)
        h1 += rank == 1
        h3 += bool(rank and rank <= 3)
        mrr += 1 / rank if rank else 0
        rows.append({"q": it["question"], "gold": it["gold"], "top3": ids[:3], "rank": rank})
    n = len(items)
    return {"n": n, "hit@1": round(h1 / n, 3), "hit@3": round(h3 / n, 3), "mrr": round(mrr / n, 3),
            "retriever": rag.retriever_name(), "rows": rows}


async def generation_metrics(items: list[dict], technique: str = "production", concurrency: int = 6) -> dict:
    rows = []
    sem = asyncio.Semaphore(concurrency)

    async def one(q: str):
        async with sem:
            return await pipeline.run(q, technique=technique)

    outs = await asyncio.gather(*(one(it["question"]) for it in items))
    for it, out in zip(items, outs):
        ans = out["reply"]
        n_sent = len(guardrails._sentences(ans))
        rows.append({
            "q": it["question"], "answer": ans, "anxiety": out["anxiety"],
            "grounded": groundedness(ans, out["hits"]),
            "cited": bool(out["citations"]),
            "cite_correct": bool(set(out["citations"]) & set(it["gold"])),
            "flesch": flesch(ans), "sentences": n_sent,
            "within_cap": n_sent <= guardrails.MAX_SENT.get(out["anxiety"], 4),
            "unsafe": any(f in ("banned-word", "speculation") for f in out["trace"][-1]["flags"]),
            "ms": out["total_ms"], "generator": out["generator"],
        })
    m = lambda k: round(st.mean(float(r[k]) for r in rows), 3)
    return {"technique": technique, "generator": rows[0]["generator"] if rows else "-",
            "groundedness": m("grounded"), "citation_rate": m("cited"), "citation_precision": m("cite_correct"),
            "flesch": round(st.mean(r["flesch"] for r in rows), 1), "within_sentence_cap": m("within_cap"),
            "unsafe_rate": m("unsafe"), "latency_ms_p50": round(st.median(r["ms"] for r in rows), 1),
            "rows": rows}


def language_id_accuracy(items: list[dict]) -> float:
    ok = sum(nlp.detect_language(it["question"]) == it["language"] for it in items)
    return round(ok / len(items), 3)


async def full_report(compare_techniques: bool | None = None, gen_sample: int | None = None) -> dict:
    """gen_sample limits how many questions go through the LLM (the live /genai/eval
    endpoint uses a small sample so it answers in seconds; the script uses all)."""
    items = load_eval()
    if compare_techniques is None:
        compare_techniques = llm.configured()
    cls = await asyncio.to_thread(classifier.cross_validate)
    ret = retrieval_metrics(items)
    hinglish = [i for i in items if i["language"] == "hinglish"]
    gen_items = items if not gen_sample else items[::max(1, len(items) // gen_sample)][:gen_sample]
    gen = await generation_metrics(gen_items, "production")
    techniques = []
    if compare_techniques:
        for t in ("zero_shot", "role", "few_shot", "rag", "cot", "production"):
            g = await generation_metrics(gen_items, t)
            techniques.append({k: v for k, v in g.items() if k != "rows"})
    return {
        "generated_at": dt.datetime.now().isoformat(timespec="seconds"),
        "prompt_version": prompts.PROMPT_VERSION,
        "llm": llm.model_name() if llm.configured() else "none (extractive fallback)",
        "objectives": {
            "O1 grounded reassurance": {"groundedness": gen["groundedness"], "citation_rate": gen["citation_rate"],
                                        "citation_precision": gen["citation_precision"], "unsafe_rate": gen["unsafe_rate"]},
            "O2 plain calm language": {"flesch_reading_ease": gen["flesch"], "within_sentence_cap": gen["within_sentence_cap"]},
            "O3 understand passenger": {"anxiety_macro_f1": cls["anxiety"]["macro_f1"], "intent_macro_f1": cls["intent"]["macro_f1"],
                                        "panic_recall": cls["intent"]["per_class_recall"].get("panic")},
            "O4 Indian languages": {"language_id_accuracy": language_id_accuracy(items),
                                    "hinglish_hit@3": retrieval_metrics(hinglish)["hit@3"] if hinglish else None},
            "O5 available & fast": {"pipeline_latency_ms_p50": gen["latency_ms_p50"], "offline_fallback": True},
        },
        "classifier": cls,
        "retrieval": ret,
        "generation": {**gen, "n": len(gen_items)},
        "technique_comparison": techniques,
        "top_features": classifier.explain_top_features("anxiety"),
    }


def to_markdown(r: dict) -> str:
    L = [f"# SkySathi GenAI evaluation report", "",
         f"Generated {r['generated_at']} · prompt {r['prompt_version']} · LLM: {r['llm']}", "",
         "## Objectives scorecard", "", "| Objective | Metric | Value |", "|---|---|---|"]
    for obj, ms in r["objectives"].items():
        for k, v in ms.items():
            L.append(f"| {obj} | {k} | {v} |")
    c = r["classifier"]
    L += ["", f"## ML classifiers (TF-IDF + Logistic Regression, {c['folds']}-fold CV, n={c['n_samples']})", "",
          "| Target | Accuracy | Macro-F1 | Majority baseline |", "|---|---|---|---|"]
    for t in ("anxiety", "intent"):
        L.append(f"| {t} | {c[t]['accuracy']} | {c[t]['macro_f1']} | {c[t]['baseline_accuracy']} |")
    rt = r["retrieval"]
    L += ["", f"## Retrieval ({rt['retriever']})", "", f"Hit@1 **{rt['hit@1']}** · Hit@3 **{rt['hit@3']}** · MRR **{rt['mrr']}** on {rt['n']} gold-labelled questions", ""]
    g = r["generation"]
    L += [f"## Generated answers ({g['generator']})", "", "| Question | Answer | Grounded | Flesch |", "|---|---|---|---|"]
    for row in g["rows"][:10]:
        L.append(f"| {row['q']} | {row['answer'][:160]} | {row['grounded']} | {row['flesch']} |")
    if r["technique_comparison"]:
        L += ["", "## Prompt technique comparison", "",
              "| Technique | Groundedness | Citation rate | Flesch | Within cap | Unsafe | p50 ms |", "|---|---|---|---|---|---|---|"]
        for t in r["technique_comparison"]:
            L.append(f"| {t['technique']} | {t['groundedness']} | {t['citation_rate']} | {t['flesch']} | "
                     f"{t['within_sentence_cap']} | {t['unsafe_rate']} | {t['latency_ms_p50']} |")
    return "\n".join(L) + "\n"
