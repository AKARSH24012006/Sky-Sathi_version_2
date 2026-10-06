"""Stage 3 · Retrieval-Augmented Generation (RAG) — hybrid retrieval.

Two retrievers over the same pilot-reviewed KB (kb/knowledge.yaml), fused with
Reciprocal Rank Fusion (RRF):

  * Lexical  — Okapi BM25 (classical IR / NLP). Exact aviation words like
               "flaps", "APU", "go-around" score sharply.
  * Dense    — Transformer sentence embeddings (all-MiniLM-L6-v2, a 6-layer
               BERT-style encoder, 384-d) + cosine similarity. Catches meaning
               without shared words: "the wing is bending" -> the `wings` entry.

Dense is optional at runtime: sentence-transformers if installed, else Chroma's
bundled ONNX build of the same MiniLM model, else BM25-only. The trace always
reports which retriever actually ran, so the demo never overclaims.
"""
from __future__ import annotations
import math
import os
import pathlib
from collections import Counter

from .nlp import content_tokens

try:
    import yaml
except ImportError:  # pragma: no cover
    yaml = None

_HERE = pathlib.Path(__file__).resolve()
_KB_CANDIDATES = [os.environ.get("KB_PATH", ""), str(_HERE.parents[3] / "kb" / "knowledge.yaml"),
                  "/kb/knowledge.yaml", "/srv/kb/knowledge.yaml"]
_kb_cache: list[dict] | None = None
_bm25 = None
_dense = None  # (embed_fn, matrix, model_name) | False


def _kb() -> list[dict]:
    global _kb_cache
    if _kb_cache is None:
        _kb_cache = []
        for c in _KB_CANDIDATES:
            if c and pathlib.Path(c).exists() and yaml:
                _kb_cache = yaml.safe_load(pathlib.Path(c).read_text(encoding="utf-8")) or []
                break
        if not _kb_cache:
            from .knowledge import FALLBACK_KB
            _kb_cache = [{**e, "tags": e["id"]} for e in FALLBACK_KB]
    return _kb_cache


def _doc_text(e: dict) -> str:
    # tags are repeated so curated synonyms weigh more than incidental words
    return f"{e.get('tags', '')} {e.get('tags', '')} {e['text']} {e.get('calm', '')}"


class BM25:
    def __init__(self, docs: list[list[str]], k1: float = 1.4, b: float = 0.75):
        self.docs, self.k1, self.b = docs, k1, b
        self.N = len(docs)
        self.avgdl = sum(map(len, docs)) / max(self.N, 1)
        df = Counter(t for d in docs for t in set(d))
        self.idf = {t: math.log(1 + (self.N - n + 0.5) / (n + 0.5)) for t, n in df.items()}
        self.tf = [Counter(d) for d in docs]

    def scores(self, q: list[str]) -> list[float]:
        out = []
        for d, tf in zip(self.docs, self.tf):
            s = 0.0
            for t in q:
                if t in tf:
                    f = tf[t]
                    s += self.idf[t] * f * (self.k1 + 1) / (f + self.k1 * (1 - self.b + self.b * len(d) / self.avgdl))
            out.append(s)
        return out


def _bm() -> BM25:
    global _bm25
    if _bm25 is None:
        _bm25 = BM25([content_tokens(_doc_text(e)) for e in _kb()])
    return _bm25


def _load_dense():
    """Transformer encoder for the KB. Tried once; False if unavailable (offline, not installed)."""
    global _dense
    if _dense is not None:
        return _dense or None
    if os.environ.get("SKYSATHI_DISABLE_DENSE"):
        _dense = False
        return None
    docs = [f"{e['text']} {e.get('calm', '')}" for e in _kb()]
    try:
        import numpy as np
        try:
            from sentence_transformers import SentenceTransformer
            m = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
            embed = lambda xs: np.asarray(m.encode(xs, normalize_embeddings=True))
            name = "all-MiniLM-L6-v2 (sentence-transformers)"
        except ImportError:
            from chromadb.utils import embedding_functions
            ef = embedding_functions.DefaultEmbeddingFunction()
            def embed(xs):
                v = np.asarray(ef(xs), dtype=float)
                return v / np.linalg.norm(v, axis=1, keepdims=True)
            name = "all-MiniLM-L6-v2 (ONNX via chromadb)"
        _dense = (embed, embed(docs), name)
    except Exception:
        _dense = False
    return _dense or None


def retriever_name() -> str:
    d = _load_dense()
    return f"hybrid: BM25 + {d[2]} · RRF" if d else "BM25 (dense encoder unavailable)"


def search(q: str, k: int = 3) -> dict:
    """Hybrid search with full scoring detail for the trace / evaluation."""
    kb = _kb()
    qt = content_tokens(q)
    bm = _bm().scores(qt)
    bm_rank = sorted(range(len(kb)), key=lambda i: -bm[i])
    dense = _load_dense()
    cos = None
    if dense:
        embed, mat, _ = dense
        cos = (mat @ embed([q])[0]).tolist()
        dn_rank = sorted(range(len(kb)), key=lambda i: -cos[i])
        rrf = Counter()
        for r, i in enumerate(bm_rank):
            if bm[i] > 0:
                rrf[i] += 1 / (60 + r + 1)
        for r, i in enumerate(dn_rank):
            rrf[i] += 1 / (60 + r + 1)
        order = [i for i, _ in rrf.most_common()]
    else:
        order = [i for i in bm_rank if bm[i] > 0] or bm_rank[:1]   # drop zero-score docs
    hits = []
    for rank, i in enumerate(order[:k]):
        e = kb[i]
        hits.append({"id": e["id"], "text": e["text"], "calm": e.get("calm", ""), "rank": rank + 1,
                     "bm25": round(bm[i], 3), "cosine": round(cos[i], 3) if cos else None})
    top_cos = max(cos) if cos else None
    confident = (bm[order[0]] > 1.0 if order else False) or (top_cos is not None and top_cos > 0.45)
    return {"hits": hits, "retriever": retriever_name(), "confident": bool(confident), "query_tokens": qt}


async def retrieve(db, q: str, k: int = 3) -> list[dict]:
    """Back-compat API used by older call sites."""
    return search(q, k)["hits"]
