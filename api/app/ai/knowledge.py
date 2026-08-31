"""Knowledge Engine: versioned KB loaded from kb/ YAML at deploy time into kb_chunks
with embeddings. Single source of truth for both offline bundle and online RAG."""
FALLBACK_KB = [
    {"id": "turbulence", "text": "Turbulence is uneven air; the aircraft moves inches while it feels like meters. It has never brought down a modern commercial jet.", "calm": "Most patches are forecast before boarding."},
    {"id": "engines", "text": "Either engine alone can fly the entire aircraft; single-engine flight is rehearsed yearly in simulators.", "calm": "A practiced skill, not a crisis."},
    {"id": "gear", "text": "Landing gear retracts ~30s after takeoff and extends ~5 minutes before landing; the thud is the locks engaging.", "calm": "Gravity alone can drop and lock the gear if motors fail."},
]
