"""Stage 4 · Prompt engineering library.

Every prompt SkySathi sends is built here from named, versioned parts, so each
technique can be switched on/off and compared in the Prompt Lab:

  zero_shot   baseline: bare question, generic assistant
  role        persona + audience + style constraints (role prompting)
  few_shot    role + curated exemplar Q/A pairs (in-context learning)
  rag         role + retrieved KB facts + "answer only from these, cite [id]"
  cot         rag + private step-by-step reasoning, only the ANSWER is shown
  structured  rag + strict JSON schema output (for UI cards)
  production  role + few-shot + RAG + anxiety/mode policy + live flight state
              — the exact prompt the in-app Copilot uses

The LLM only ever writes text. It never decides actions, calls tools or loops;
code decides everything around it (a fixed, linear pipeline).
"""
from __future__ import annotations
from .explanation import build_rules

PROMPT_VERSION = "pv3.0"

PERSONA = (
    "You are SkySathi ('sathi' means companion), a calm, factual in-flight companion for anxious "
    "and first-time Indian flyers. You are not the pilot or the crew and never claim to see the "
    "cockpit. You explain what the passenger is sensing — sounds, movement, pressure — with real "
    "aviation facts, then offer one small helpful action."
)

MODE_STYLE = {
    "calm": "Audience: an anxious adult. Lead with reassurance grounded in a fact.",
    "educational": "Audience: a curious adult. Give the mechanism with one technical term, explained.",
    "child": "Audience: a 7-year-old. Use a simple everyday comparison (a car, a bicycle, a swing). No scary words.",
}

FEW_SHOTS = {
    "reassure": [
        ("Is turbulence going to break the plane?",
         "No — turbulence is uneven air, like a car on a gravel patch, and wings are certified to bend "
         "metres beyond anything you'll feel today [turbulence][wings]. Keep your seatbelt loosely "
         "fastened and let your shoulders drop as you breathe out."),
        ("The engines suddenly got quieter, did something fail?",
         "Nothing failed — after takeoff pilots reduce from takeoff power to climb power, so the roar "
         "softens on purpose [engines][sounds]. It means the climb is going exactly to plan."),
    ],
    "explain": [
        ("What's that whirring then thud after takeoff?",
         "That's the landing gear folding into the belly — the whirr is the motor and the thud is the "
         "locks engaging [gear]. You'll hear the reverse about five minutes before landing."),
    ],
    "panic": [
        ("I can't breathe, I'm panicking",
         "I'm right here with you, and the plane is flying normally [safety]. Breathe in slowly for "
         "four, hold for four, out for six — let's do three of those together. If you feel unwell, "
         "press the call button; the crew are trained for exactly this."),
    ],
    "logistics": [
        ("When does boarding start?",
         "Boarding usually opens about 40 minutes before departure — I'll remind you when the gate "
         "opens, so you can relax until then."),
    ],
    "chitchat": [
        ("Thanks, that helped", "I'm glad. I'll keep watching the flight with you — ask me anything, anytime."),
    ],
}

JSON_SCHEMA_BRIEF = (
    '{"headline": string (max 12 words), "what_to_expect": [3 strings, one per flight stage, each '
    'max 20 words], "sounds_you_will_hear": [2 strings], "one_breath_tip": string, '
    '"sources": [kb ids used]}'
)


def knowledge_block(hits: list[dict]) -> str:
    return "KNOWLEDGE (pilot-reviewed; use only these facts):\n" + "\n".join(
        f"[{h['id']}] {h['text']} {h.get('calm', '')}" for h in hits)


def live_block(live: dict) -> str:
    if not live:
        return ""
    return "LIVE FLIGHT STATE: " + "; ".join(f"{k}={v}" for k, v in live.items() if v not in (None, ""))


def _lang_rule(language: str) -> str:
    return {"hi": "hi", "hinglish": "hi"}.get(language, "en")


def build(technique: str, user_text: str, *, hits: list[dict] | None = None, intent: str = "explain",
          anxiety: str = "calm", mode: str = "calm", language: str = "en", live: dict | None = None,
          memory: str = "", history: list[dict] | None = None, task: str = "answer") -> dict:
    """Return {messages, temperature, max_tokens, parts} for one technique.

    `parts` lists which prompt components were used — shown in the Prompt Lab.
    `task` = answer | brief (JSON) | journal (summarisation).
    """
    hits = hits or []
    live = live or {}
    history = history or []
    parts: list[str] = []
    sys: list[str] = []
    msgs: list[dict] = []
    temperature, max_tokens = 0.4, 300

    if technique == "zero_shot":
        sys.append("You are a helpful assistant.")
        parts.append("generic system line")
        temperature = 0.7
    else:
        sys.append(PERSONA); parts.append("role/persona")
        sys.append(MODE_STYLE.get(mode, MODE_STYLE["calm"])); parts.append(f"audience style: {mode}")
        sys.append("RULES: " + build_rules(tone="technical" if mode == "educational" else "warm",
                                          language=_lang_rule(language), anxiety_band=anxiety))
        parts.append(f"anxiety policy: {anxiety}")
        if language == "hinglish":
            sys.append("The passenger wrote in Hinglish — reply in friendly Hinglish (Roman script).")
            parts.append("language mirroring: hinglish")

    if technique in ("rag", "cot", "structured", "production") and hits:
        sys.append(knowledge_block(hits))
        sys.append("Ground every claim in KNOWLEDGE and cite the entry id in square brackets, e.g. [gear]. "
                   "If KNOWLEDGE does not cover the question, say so briefly and suggest asking the crew. "
                   "Never invent numbers.")
        parts.append(f"RAG context ({len(hits)} chunks) + citation rule")

    if technique == "production":
        if lb := live_block(live):
            sys.append(lb); parts.append("live flight state")
        if memory:
            sys.append(memory); parts.append("passenger memory")

    if technique == "cot":
        sys.append("Before answering, reason privately in 3 short numbered steps under a line 'THINKING:' — "
                   "(1) what the passenger is physically sensing, (2) which KNOWLEDGE entry explains it, "
                   "(3) one calming action. Then write 'ANSWER:' followed by the reply for the passenger. "
                   "Only the ANSWER is shown to them.")
        parts.append("chain-of-thought (hidden scratchpad)")
        max_tokens = 450
        temperature = 0.3

    if technique == "structured" or task == "brief":
        sys.append("Respond with ONLY valid JSON matching this schema, no prose, no code fences: " + JSON_SCHEMA_BRIEF)
        parts.append("structured JSON output schema")
        temperature, max_tokens = 0.2, 450

    if task == "journal":
        sys.append("TASK: Summarise the conversation below into a private travel-journal entry written in "
                   "second person, 3 sentences: what felt hard, what helped (cite facts), and one thing to "
                   "remember next flight. Warm, no markdown.")
        parts.append("summarisation task")
        temperature, max_tokens = 0.5, 220

    if technique in ("few_shot", "production"):
        shots = FEW_SHOTS.get(intent) or FEW_SHOTS["explain"]
        for q, a in shots:
            msgs += [{"role": "user", "content": q}, {"role": "assistant", "content": a}]
        parts.append(f"few-shot exemplars ×{len(shots)} ({intent})")

    if technique == "production" and history:
        msgs += history[-8:]
        parts.append(f"conversation history ({len(history[-8:])} turns)")

    if mode == "child" and technique != "zero_shot":
        temperature = max(temperature, 0.6)

    msgs.append({"role": "user", "content": user_text})
    return {"messages": [{"role": "system", "content": "\n\n".join(sys)}] + msgs,
            "temperature": temperature, "max_tokens": max_tokens, "parts": parts,
            "technique": technique, "version": PROMPT_VERSION}


TECHNIQUES = [
    {"id": "zero_shot", "name": "Zero-shot (baseline)", "what": "Bare question to a generic assistant. Shows what an LLM does with no engineering."},
    {"id": "role", "name": "Role / persona prompting", "what": "Persona, audience and anxiety-calibrated style rules (length, warmth, no markdown)."},
    {"id": "few_shot", "name": "Few-shot (in-context learning)", "what": "Role + curated example Q/A pairs that teach the exact SkySathi voice."},
    {"id": "rag", "name": "RAG-grounded", "what": "Role + top-3 retrieved KB facts; answer only from them and cite [ids]."},
    {"id": "cot", "name": "Chain-of-thought", "what": "RAG + private 3-step reasoning (sense → fact → action); only the answer is shown."},
    {"id": "structured", "name": "Structured output (JSON)", "what": "RAG + a strict JSON schema so the UI can render cards."},
    {"id": "production", "name": "Production (combined)", "what": "Role + few-shot + RAG + anxiety policy + live flight state + memory — what the app ships."},
]

USE_CASES = [
    {"id": "turbulence_high", "title": "Mid-flight turbulence, high anxiety",
     "input": "The plane just dropped and everything is shaking, is the wing going to break??",
     "mode": "calm", "task": "answer", "live": {"phase": "cruise · light chop", "altitude_ft": 36000, "seatbelt_sign": "on"},
     "objective": "O1 Reduce in-flight anxiety with factual, grounded reassurance",
     "best": "production"},
    {"id": "child_sound", "title": "Explaining a sound to a child",
     "input": "What's that whirring noise under us?", "mode": "child", "task": "answer",
     "live": {"phase": "climb", "altitude_ft": 4000},
     "objective": "O2 Explain flight events in plain, audience-appropriate language",
     "best": "few_shot"},
    {"id": "preflight_brief", "title": "Personalised pre-flight briefing (JSON card)",
     "input": "First flight ever, AI101 DEL to BLR, I'm most scared of takeoff.", "mode": "calm", "task": "brief",
     "live": {"phase": "at gate", "weather_BLR": "light rain"},
     "objective": "O3 Prepare first-time flyers before boarding",
     "best": "structured"},
    {"id": "hinglish", "title": "Hinglish passenger",
     "input": "Engine ki awaaz achanak kam ho gayi, kya sab theek hai?", "mode": "calm", "task": "answer",
     "live": {"phase": "climb", "altitude_ft": 9000},
     "objective": "O4 Serve Indian flyers in the language they think in",
     "best": "production"},
    {"id": "postflight_journal", "title": "Post-flight journal (summarisation)",
     "input": ("Passenger: the takeoff noise scared me. SkySathi: that roar is takeoff power, planned [engines]. "
               "Passenger: why did my ears hurt landing? SkySathi: gentle cabin pressure change, swallowing helps [ears]. "
               "Passenger: that landing was firm. SkySathi: firm is intentional on wet runways [landing]."),
     "mode": "calm", "task": "journal", "live": {"phase": "landed"},
     "objective": "O5 Build confidence across flights through reflection",
     "best": "role"},
]
