"""Stage 1 · NLP preprocessing.

Classical NLP that runs before any model: normalisation, tokenisation, stop-word
removal, language identification (English / Hindi in Devanagari / Hinglish in
Roman script) and rule-based entity extraction (flight numbers, IATA codes,
gate numbers). Pure Python, no downloads, so it also runs on-device/offline.
"""
from __future__ import annotations
import re
import unicodedata

STOPWORDS = set("""a an the is are was were be been am i me my we our you your it its this that these those
of to in on at for from by with about as into over after before up down out off so than too very can
will just do does did doing have has had what why how when where which who whom please tell""".split())

# Frequent Roman-script Hindi words — enough to flag Hinglish reliably for short chat turns.
HINGLISH = set("""kya kyun kaise kab kahan hai hain ho raha rahi rahe tha thi mujhe mera meri hum humko
nahi nahin bahut thoda darr dar lag lagta lagti theek thik sab abhi yeh woh kaun kis kisi aur bhi
toh hoga hogi kar karo karna gir sakta sakti awaaz kaan band pehli baar saans ghabrahat shukriya
chahiye batao bataiye jaldi upar neeche""".split())

FLIGHT_RE = re.compile(r"\b(AI|6E|SG|UK|QP|IX|I5|G8|EK|QR|SQ|LH|BA)\s?-?(\d{2,4})\b", re.I)
IATA_RE = re.compile(r"\b(DEL|BOM|BLR|MAA|HYD|CCU|GOI|COK|AMD|PNQ|JAI|LKO|ATQ|IXC|DXB|SIN|LHR)\b")
GATE_RE = re.compile(r"\bgate\s*(\d{1,3}[A-Z]?)\b", re.I)


def normalise(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).strip()
    return re.sub(r"\s+", " ", text)


def tokenize(text: str) -> list[str]:
    """Lower-cased word tokens; keeps Devanagari runs intact."""
    return re.findall(r"[a-z0-9]+|[ऀ-ॿ]+", text.lower())


def content_tokens(text: str) -> list[str]:
    return [t for t in tokenize(text) if t not in STOPWORDS and len(t) > 1]


def detect_language(text: str) -> str:
    """'hi' (Devanagari), 'hinglish' (Roman Hindi) or 'en'."""
    if re.search(r"[ऀ-ॿ]", text):
        return "hi"
    toks = tokenize(text)
    if toks and sum(t in HINGLISH for t in toks) / len(toks) >= 0.25:
        return "hinglish"
    return "en"


def extract_entities(text: str) -> dict:
    ents: dict = {}
    if m := FLIGHT_RE.search(text):
        ents["flight_no"] = f"{m.group(1).upper()}{m.group(2)}"
    if codes := IATA_RE.findall(text.upper()):
        ents["airports"] = sorted(set(codes))
    if m := GATE_RE.search(text):
        ents["gate"] = m.group(1).upper()
    return ents


def analyse(text: str) -> dict:
    """Everything later stages need from raw text, in one dict (shown in the trace)."""
    clean = normalise(text)
    return {
        "clean": clean,
        "tokens": tokenize(clean),
        "content_tokens": content_tokens(clean),
        "language": detect_language(clean),
        "entities": extract_entities(clean),
    }
