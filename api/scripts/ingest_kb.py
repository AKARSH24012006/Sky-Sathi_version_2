"""Ingest kb/knowledge.yaml into ChromaDB (persistent, local ./chroma).
Run once at deploy or whenever the KB changes:  python scripts/ingest_kb.py
Uses Chroma's built-in embedding function to start (all-MiniLM); swap to
bge-m3 for multilingual Hindi retrieval in production."""
import pathlib, yaml
import chromadb

ROOT = pathlib.Path(__file__).resolve().parents[2]
kb = yaml.safe_load((ROOT / "kb" / "knowledge.yaml").read_text(encoding="utf-8"))

client = chromadb.PersistentClient(path=str(ROOT / "api" / "chroma"))
col = client.get_or_create_collection("skysathi_kb")
col.upsert(
    ids=[e["id"] for e in kb],
    documents=[e["text"] + " " + e.get("calm", "") for e in kb],
    metadatas=[{"tags": e["tags"], "calm": e.get("calm", "")} for e in kb],
)
print(f"ingested {len(kb)} KB entries -> {ROOT/'api'/'chroma'}")
