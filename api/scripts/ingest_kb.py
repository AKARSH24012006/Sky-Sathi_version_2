"""Pre-download the transformer encoder and check retrieval over kb/knowledge.yaml.

The KB is small (tens of entries), so embeddings are computed in memory at API
start-up — no vector-DB ingestion step is required. Run this once with internet
so the MiniLM model is cached before an offline demo:

    pip install -r requirements-ai.txt && python scripts/ingest_kb.py
"""
import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from app.ai import rag

print("retriever:", rag.retriever_name())
for q in ("the wing is bending", "what was that thud", "kaan band ho gaye"):
    print(f"  {q!r:28} ->", [(h["id"], h["cosine"]) for h in rag.search(q)["hits"]])
