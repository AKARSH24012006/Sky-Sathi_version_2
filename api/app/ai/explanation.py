"""Explanation Engine: turns preferences + live anxiety into prompt policy.
Not `if turbulence: canned_text` — this shapes HOW the LLM speaks."""
def build_rules(tone: str, language: str, anxiety_band: str) -> str:
    max_sent = {"calm": 3, "raised": 2, "high": 2}[anxiety_band]
    warmth = {"calm": "warm, human", "raised": "extra warm, steady",
              "high": "maximum warmth; lead with reassurance; mention the Calm button once"}[anxiety_band]
    voice = "precise but reassuring" if tone == "technical" else warmth
    lang = "simple conversational Hindi (Devanagari or Hinglish, whichever is warmer)" if language == "hi" else "English"
    return (f"Reply in {lang}. Voice: {voice}. Maximum {max_sent} short sentences unless asked for more. "
            "This is an ongoing conversation — follow-ups continue the previous topic. "
            "Ground answers in the retrieved knowledge and live state; cite specific numbers when available. "
            "Reassure with facts and evidence, never empty soothing. Never speculate about emergencies. "
            "Plain language, no markdown, no lists.")
