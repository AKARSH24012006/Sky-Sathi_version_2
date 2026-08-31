"""RAG Engine v2: ChromaDB semantic retrieval with a keyword fallback over the
same YAML KB — identical facts online and offline, per the Knowledge Engine rule."""
import pathlib
try:
    import yaml
except ImportError:
    yaml = None

_ROOT = pathlib.Path(__file__).resolve().parents[2]
_col = None
_kb_cache = None

def _chroma():
    global _col
    if _col is None:
        try:
            import chromadb
            _col = chromadb.PersistentClient(path=str(_ROOT / "chroma")).get_collection("skysathi_kb")
        except Exception:
            _col = False
    return _col or None

def _kb():
    global _kb_cache
    if _kb_cache is None:
        try:
            _kb_cache = yaml.safe_load((_ROOT.parent / "kb" / "knowledge.yaml").read_text(encoding="utf-8"))
        except Exception:
            _kb_cache = []
    return _kb_cache

async def retrieve(db, q: str, k: int = 3) -> list[dict]:
    col = _chroma()
    if col:
        try:
            res = col.query(query_texts=[q], n_results=k)
            return [{"id": i, "text": d, "calm": m.get("calm", "")}
                    for i, d, m in zip(res["ids"][0], res["documents"][0], res["metadatas"][0])]
        except Exception:
            pass
    ql = set(q.lower().split())
    scored = sorted(_kb(), key=lambda e: -sum(3 if w in e["tags"] else (1 if w in e["text"].lower() else 0) for w in ql))
    return [{"id": e["id"], "text": e["text"], "calm": e.get("calm", "")} for e in scored[:k]]
