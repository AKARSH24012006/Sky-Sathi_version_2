# SkySathi 4.1 — Calm Flight Intelligence

An AI companion for anxious and first-time flyers: it detects the flight through
the phone's own sensors, explains every sound and sensation before you can worry
about it, and works with zero connectivity at 36,000 ft.

## Run it (one command)

```bash
./start.sh            # macOS / Linux
.\start.ps1           # Windows PowerShell
# or directly:
docker compose up --build
```

Then open:
| URL | What |
|---|---|
| http://localhost:3000 | The app — 3D flight scene, live weather, AI companion |
| http://localhost:8000/docs | Interactive API documentation |
| http://localhost:8000/ready | Health of api / db / redis |

**No .env file is needed.** Every setting has a working default; the database
creates its own tables on first boot. Optional keys (all degrade gracefully):
`OPENAI_API_KEY` or `LLM_BASE_URL`/`LLM_API_KEY`/`LLM_MODEL` for any OpenAI-compatible model (LLM generation; without it, answers are extractive from the grounded KB),
`AERODATABOX_KEY` (live gates — without it, clearly-badged demo data).

## Architecture

```
web/       React 18 + TypeScript + Vite + React Three Fiber
             FlightScene: procedural A320, 21-phase sequence, drei Sky/Stars,
             chase camera, rain, full light suite. Served by nginx (proxies /api).
api/       FastAPI, feature-oriented:
             auth/ ai/ flights/ airports/ weather/ sensors/ notifications/
             users/ analytics/ models/ db/ workers/ tests/
db         Postgres 16 + pgvector (auto-created tables; Alembic for prod migrations)
redis      cache: weather 10 min, flight status 2 min, positions 15 s
mobile/    React Native (Expo): real barometer/accel/gyro sensor engine,
             on-device phase detector (passes shared golden vectors), offline packs
kb/        knowledge.yaml — the pilot-reviewed knowledge base, single source of truth
shared/    phase-detector.spec.json — golden vectors enforced on TS + Python twins
```

## Development (without Docker)

```bash
cd api && python -m venv .venv && . .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt && uvicorn app.main:app --reload
cd web && npm install && npm run dev                      # http://localhost:5173
```

The Vite dev server proxies `/api/*` to `:8000` (with the `/api` prefix
rewritten — that rewrite is load-bearing).

## Key API routes
`POST /auth/guest` · `POST /auth/google` · `POST /auth/apple` ·
`GET /weather/{iata}` · `GET /flights/live/{no}` · `GET /flights/position/{callsign}` ·
`GET /airports/{iata}` · `POST /conversations/chat` · `POST /conversations/suggestions` ·
`GET /conversations/kb/bundle` · `POST /sensors/window` · `POST /notifications/register`

## Scripts
`start` / `stop` / `reset_database` in both `.sh` and `.ps1`. The reset script
asks before deleting the Docker volume.

## Data honesty
The UI never shows undefined/null/NaN — always an em dash or a kind placeholder.
Demo data is always labeled ("demo data · API offline"). Real sources are
credited (open-meteo, adsb.lol). The panic/Calm feature is never paywalled.

## What's new in 4.1: GenAI pipeline + GenAI Lab
The copilot is now a **fixed, linear GenAI pipeline** (`api/app/ai/pipeline.py`). Every reply carries a stage-by-stage trace:

| # | Stage | Family | File |
|---|---|---|---|
| 1 | Normalise, tokenise, language-ID (EN/HI/Hinglish), entities | NLP | `ai/nlp.py` |
| 2 | Anxiety-band + intent classifiers (TF-IDF → Logistic Regression, 197 labelled utterances) | ML | `ai/classifier.py`, `ai/data/utterances.csv` |
| 3 | Hybrid retrieval: BM25 ⊕ MiniLM transformer embeddings, RRF fusion | DL / Transformer, RAG | `ai/rag.py` |
| 4 | Prompt assembly from 7 named techniques | Prompt engineering | `ai/prompts.py` |
| 5 | LLM generation (OpenAI-compatible: OpenAI, Gemini, Groq, Ollama) | GenAI | `ai/llm.py` |
| 6 | Guardrails: citations, sentence cap, banned words, JSON, emergency prefix | Safety | `ai/guardrails.py` |

**In the app:** Copilot → **Chat** (tap "how" under any answer), **Prompt Lab** (5 use cases × 7 techniques, side by side,
with the exact prompt and metrics), **Pipeline & Eval** (live diagram and objective-linked evaluation report).
**API:** `GET /genai/overview` · `POST /genai/run` · `POST /genai/prompt-lab` · `GET /genai/eval`. No DB/auth needed.
**Evaluate:** `cd api && python scripts/evaluate.py` writes `eval/REPORT.md` (with an LLM key it also compares techniques).
**Tests:** `cd api && pytest -q`.
Review-2 material: `docs/REVIEW2_SLIDES.md`, `docs/pipeline-diagram.png`.

## What's new in 4.0
A complete application: six-tab navigation (Home / Flights / Journey / Copilot /
Tickets / Profile) with real code-splitting per screen; command palette (Ctrl/⌘+K);
notification center fed by live data; PWA (manifest + service worker, installable,
offline shell); Tickets screen with a real QR boarding pass, interactive A320 seat
map and aircraft info; Profile with travel stats, CO₂ estimate and achievements;
Copilot as a full screen with calm/educational/child modes and suggested prompts.
Honest "coming soon" (no dead buttons): terminal walking navigation, payments,
languages beyond EN/HI, admin UI (use /docs + analytics endpoints meanwhile).

## What's new in 3.0
Idle scene: the aircraft is already flying with an orbiting cinematic camera;
personal welcome + boarding countdown over the sky; Begin Flight opens with an
engine-start close-up; live instruments (altitude/speed/heading/ETA/distance/
fuel/OAT/wind/cabin/ride); route map; Academy (KB on the surface); airport
amenities; Jarvis-style floating copilot with proactive narration + optional
voice; synthesized sound design (engine follows real throttle, seatbelt dings,
wind, rain, thunder); real-weather effects (rain/fog/snow/lightning by live WMO
code, moonlight at night). LLM: OpenAI (`OPENAI_API_KEY`), grounded-KB fallback.

## The 3D model
The aircraft is procedural (capsule fuselage, extruded swept wings, animated
ailerons/elevators/rudder/flaps/spoilers/gear, full light suite). To swap in a
licensed glTF: drop `a320.glb` into `web/public/models/` and replace
`<ProceduralA320/>` with drei's `useGLTF` — the Director rig drives named nodes,
not geometry, so all 21 phases keep working.

## Troubleshooting
- **Port in use** — stop other services on 3000/8000/5432/6379 or edit `docker-compose.yml`.
- **Weather says "demo data"** — outbound network blocked or Open-Meteo briefly down; the app is designed to keep working.
- **Chat says it can't reach its brain** — API container not up yet (first build takes a few minutes) or no DB.
- **Wipe everything**: `./reset_database.sh`.
