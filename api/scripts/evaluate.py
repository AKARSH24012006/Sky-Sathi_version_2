"""Evaluate the GenAI pipeline against SkySathi's objectives.

    cd api && python scripts/evaluate.py            # offline: ML + retrieval + extractive answers
    OPENAI_API_KEY=sk-... python scripts/evaluate.py  # + LLM answers and prompt-technique comparison

Writes eval/report.json (served at GET /genai/eval) and eval/REPORT.md.
"""
import asyncio, json, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from app.ai.evaluation import full_report, to_markdown

out = pathlib.Path(__file__).resolve().parents[1] / "eval"
out.mkdir(exist_ok=True)
r = asyncio.run(full_report())
(out / "report.json").write_text(json.dumps(r, indent=2, ensure_ascii=False), encoding="utf-8")
(out / "REPORT.md").write_text(to_markdown(r), encoding="utf-8")
for obj, ms in r["objectives"].items():
    print(f"{obj:28s} " + "  ".join(f"{k}={v}" for k, v in ms.items()))
print(f"\nwrote {out/'report.json'} and {out/'REPORT.md'}")
