"""Stage 6 · Guardrails (input + output post-processing).

Input guard: medical / safety emergencies bypass the LLM's tone and always
start with "press the call button" — a fixed rule, not a model decision.
Output guard: strips the chain-of-thought scratchpad, extracts and validates
[kb-id] citations, removes markdown, enforces the sentence cap for the anxiety
band, flags banned or speculative wording, and validates JSON for card tasks.
"""
from __future__ import annotations
import json
import re

EMERGENCY = ("chest pain", "unconscious", "fainted", "not breathing", "smoke", "fire", "bleeding",
             "heart attack", "seizure", "allergic")
BANNED = ("crash", "die", "dying", "death", "catastroph", "explode", "plummet")
SPECULATIVE = ("probably failed", "might be failing", "could be an emergency", "i think something is wrong")
MAX_SENT = {"calm": 4, "raised": 3, "high": 3}


def input_check(text: str) -> dict:
    t = text.lower()
    hit = next((w for w in EMERGENCY if w in t), None)
    return {"emergency": bool(hit), "trigger": hit}


def _sentences(text: str) -> list[str]:
    return [s for s in re.split(r"(?<=[.!?।])\s+", text.strip()) if s]


def check_output(raw: str, *, valid_ids: set[str], anxiety: str = "calm", task: str = "answer",
                 emergency: bool = False) -> dict:
    flags: list[str] = []
    text = raw.strip()

    if "ANSWER:" in text:                       # chain-of-thought: show only the answer
        reasoning, text = text.split("ANSWER:", 1)
        text = text.strip()
        flags.append("cot-scratchpad-removed")
    else:
        reasoning = ""

    if task == "brief":
        body = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
        try:
            obj = json.loads(body)
            cites = [c for c in obj.get("sources", []) if c in valid_ids]
            return {"text": body, "json": obj, "citations": cites, "flags": flags + ["json-valid"],
                    "reasoning": reasoning.strip()}
        except Exception:
            flags.append("json-invalid")

    cites = re.findall(r"\[([a-z0-9\-]+)\]", text)
    valid = [c for c in dict.fromkeys(cites) if c in valid_ids]
    if len(valid) < len(set(cites)):
        flags.append("unknown-citation-removed")
    text = re.sub(r"\s*\[[a-z0-9\-]+\]", "", text)
    text = re.sub(r"[*_#`]+", "", text)
    text = re.sub(r"^\s*[-•]\s*", "", text, flags=re.M).replace("\n", " ")
    text = re.sub(r"\s{2,}", " ", text).strip()

    if task == "answer":
        sents = _sentences(text)
        cap = MAX_SENT.get(anxiety, 4)
        if len(sents) > cap:
            text = " ".join(sents[:cap])
            flags.append(f"trimmed-to-{cap}-sentences")
    low = text.lower()
    if any(re.search(rf"\b{b}", low) for b in BANNED):
        flags.append("banned-word")
    if any(s in low for s in SPECULATIVE):
        flags.append("speculation")
    if emergency and "call button" not in low:
        text = "Please press the call button now so the crew can help you in person. " + text
        flags.append("emergency-prefix")
    return {"text": text, "citations": valid, "flags": flags, "reasoning": reasoning.strip()}
