# SkySathi · PBL-2 Review-2: slide content and 5-minute script

Paste this content into the **Review-1 template**. You need four slides: a comments slide plus the three rubric slides.
Timing: comments 0:30 · Slide 1 2:00 · Slide 2 1:30 · Slide 3 1:00 → **5:00**.
Have the app open on **Copilot → Pipeline & Eval** and **Prompt Lab** in case the expert asks for a live demo.

> ⚠️ **Negative marking for Agentic AI.** Never say *agent, agentic, autonomous, orchestrator, tool-calling, multi-agent* or *planner*.
> If anyone asks, the answer is: *"SkySathi is a fixed, linear GenAI pipeline. The LLM only writes text. It never chooses tools, never loops and never acts on its own. Every step is a plain function in a fixed order."*

---

## Slide 0: Review-1 comments and what we changed (30 s)

| Comment from Review-1 (fill in the exact words) | What we did |
|---|---|
| _e.g. "Where is the ML/DL? It looks like just an API call."_ | Added a trained ML classifier (TF-IDF + Logistic Regression) and transformer-embedding retrieval. Each layer is now visible in the app. |
| _e.g. "Pipeline diagram is too generic."_ | Refined it into a 6-stage pipeline. Each stage is tagged NLP / ML / DL / Prompt / GenAI / Safety and mapped to objectives O1–O5. |
| _e.g. "How do you know the output is good?"_ | Added a gold evaluation set and objective-linked metrics, shown live in the app. |

**Say:** "These were the comments from Review-1. Each one is fixed in version 4.1, and the next three slides show how."

---

## Slide 1: Why ML → DL → NLP → Transformer → GenAI (10 marks, ~2 min)

**Title:** One problem, five layers: why each AI technique earns its place

| Layer | What SkySathi uses | Why this, and not something simpler or bigger |
|---|---|---|
| **NLP** | Normalise, tokenise, language-ID (EN / हिंदी / Hinglish), entity extraction (flight no., IATA, gate) | Rules are exact, instant and work offline. No model is needed to find "AI101". |
| **ML** | TF-IDF word + char n-grams → Logistic Regression. Predicts **anxiety band** (calm/raised/high) and **intent** (explain/reassure/panic/logistics/chitchat). 197 labelled EN + Hinglish utterances | Under 1 ms, explainable (we can show the learned n-grams), free and offline. Char n-grams handle Hinglish spellings like "dar/darr". A panic safety lexicon forces "high". **Intent F1 0.73 vs 0.26 baseline. Anxiety F1 0.66 vs 0.49 baseline** (5-fold CV). |
| **DL / Transformer** | MiniLM-L6 sentence encoder (6-layer BERT-style transformer, 384-d) for dense retrieval, fused with BM25 by Reciprocal Rank Fusion | Keyword search misses meaning: "the wing is bending" should find *wings flex by design* with no shared words. Embeddings capture that. **BM25 alone already gives Hit@3 = 0.96 and MRR = 0.88.** The transformer adds semantic recall on top. |
| **GenAI (LLM)** | Decoder-only transformer (gpt-4o-mini, or any OpenAI-compatible model) generates the answer, grounded by RAG | Only generation needs a large model: warm, audience-aware, multilingual wording. It is **grounded** in 18 pilot-reviewed facts and must cite them, so it can't invent aviation "facts". |
| **Why not fine-tune the LLM?** | RAG + prompt engineering | Our knowledge changes (KB is versioned like code), the data is small, and citations make answers auditable. Fine-tuning would bake facts in and hide their source. |

**Say:** "We didn't use GenAI everywhere. Each layer does the job it's best at. The small ML model reads the passenger's state in under a millisecond. The transformer finds the right facts. The LLM only writes the final calm sentence, and only from those facts."

---

## Slide 2: Generated content, analysis and objectives (refined pipeline) (5 marks, ~1.5 min)

**Visual:** `docs/pipeline-diagram.png` (full width)

**Objective scorecard** (from `api/eval/REPORT.md`; re-run `python scripts/evaluate.py` with your LLM key the night before and replace the starred values):

| Objective | Metric (what we measure on generated answers) | Result |
|---|---|---|
| O1 Grounded reassurance | groundedness · citation precision · unsafe-word rate | ★ · ★ · 0% |
| O2 Plain, calm language | Flesch reading ease · within sentence cap for anxiety band | ★ · ★ |
| O3 Understand the passenger | intent macro-F1 · anxiety macro-F1 · panic recall | 0.73 · 0.66 · 0.69 |
| O4 Indian languages | language-ID accuracy · Hinglish retrieval Hit@3 | 0.92 · 0.80 |
| O5 Always available | offline extractive fallback · pipeline latency | yes · ★ ms |

**Say:** "This is the refined pipeline. It has six fixed stages, each tagged with its AI family and the objective it serves. Below them is our evaluation loop. A 25-question gold set runs through the pipeline, and we measure every generated answer against the objectives. Then we tune the prompt version, top-k and temperature. That loop is how we went from prompt v1 to v3."

> The ★ values come from your own LLM run. Offline (no key), O1/O2 show the extractive fallback, which is trivially 100% grounded. Don't present that as LLM performance.

---

## Slide 3: Prompt engineering on use-case scenarios (5 marks, ~1 min)

| Use case | Technique that works best | Why |
|---|---|---|
| Mid-turbulence, **high anxiety** | **Production prompt**: role + few-shot + RAG + anxiety policy + live state | High anxiety → max 2 short sentences, reassurance first, cite facts, mention Calm button once |
| Explaining a sound **to a child** | **Few-shot + audience persona** | Examples teach the comparison style ("like a car on gravel"). Temperature 0.6 for warmth |
| **Pre-flight briefing card** | **Structured output (JSON schema)** + RAG | The UI renders the card directly. Guardrail validates the JSON |
| **Hinglish** passenger | Language mirroring + RAG | NLP detects Hinglish, so the prompt tells the model to reply in Roman-script Hinglish |
| **Post-flight journal** | Role + summarisation task | Turns the chat into a 3-sentence reflection that cites what helped |
| Edge reasoning | **Chain-of-thought (hidden)**: sense → fact → action | Better grounding. The guardrail strips the scratchpad so only the answer is shown |

Baseline for contrast: **zero-shot** ("You are a helpful assistant") typically gives longer, uncited, generic answers. Check this on your own run in the Prompt Lab before you say it.

**Say:** "Same question, seven prompts. Zero-shot gives a generic paragraph. Adding the role fixes tone. Few-shot fixes voice. RAG adds facts with citations. The production prompt combines all of them, and the Prompt Lab measures each answer for groundedness and readability."

---

## Likely expert questions: one-line answers

- **"Is this just a ChatGPT wrapper?"** No. Four of the six stages run without the LLM, and with no key the app still answers from the KB.
- **"How do you prevent hallucination?"** RAG over 18 reviewed facts, a rule to answer only from KNOWLEDGE and cite `[id]`, and a guardrail that removes invalid citations.
- **"Why Logistic Regression, not BERT, for anxiety?"** With 197 samples a linear model is more reliable and explainable, and it runs in under 1 ms. The transformer is used where it matters, in semantic retrieval.
- **"Dataset?"** A hand-written seed set by the team (EN + Hinglish), honestly small. Next step is collecting opt-in real phrases.
- **"Fine-tuning?"** Not needed yet. The KB changes often and citations need a source. If ever needed, the eval set doubles as a fine-tune/validation split.

---

## New in 4.4: airport GenAI features (good for a live demo or Q&A)

- **AI terminal navigator** (Airport tab). Type "washroom aur burger before gate 24". The flow is: NLP picks out the places → Dijkstra plans the shortest walk through those stops → the map draws the route → the LLM writes calm directions as JSON.
  - A guardrail drops any place the LLM mentions that isn't on the map.
  - It also checks the walk time against the boarding countdown ("5 min to spare, no rush").
- **Arrival planner.** Rules rank cab / airport taxi / bus by group size, bags, budget, landing hour and tiredness. The LLM writes the recommendation and an after-landing checklist as structured JSON.
  - Booking buttons only open Uber / Google Maps / Booking.com with the trip filled in. **SkySathi never books, so this isn't agentic.**
- **"What was that sound?"** (Journey tab). Tap a sound to hear it, then read the pilot-reviewed explanation from the KB.

**If asked "did the AI generate the airport map?":** "No, and on purpose. An LLM would invent washrooms that don't exist. The map is airport data (a schematic demo for now). GenAI understands the request and writes the directions, and every place it mentions is checked against the map."
