"""GenAI pipeline tests — run offline (no LLM key, no DB): pytest -q"""
import asyncio, os
os.environ.setdefault("SKYSATHI_DISABLE_DENSE", "1")
from app.ai import nlp, classifier, rag, prompts, guardrails, pipeline


def test_language_id():
    assert nlp.detect_language("why do my ears hurt") == "en"
    assert nlp.detect_language("kya plane gir sakta hai") == "hinglish"
    assert nlp.detect_language("क्या सब ठीक है") == "hi"


def test_entities():
    e = nlp.extract_entities("Is AI 101 from DEL at gate 42 on time?")
    assert e["flight_no"] == "AI101" and e["airports"] == ["DEL"] and e["gate"] == "42"


def test_classifier_panic_is_high():
    r = classifier.classify("I can't breathe, I'm having a panic attack")
    assert r["anxiety"] == "high" and r["intent"] == "panic"


def test_retrieval_finds_gear():
    ids = [h["id"] for h in rag.search("what was that thud after takeoff")["hits"]]
    assert "gear" in ids


def test_every_technique_builds():
    for t in prompts.TECHNIQUES:
        p = prompts.build(t["id"], "is turbulence safe", hits=rag.search("turbulence")["hits"])
        assert p["messages"][0]["role"] == "system" and p["messages"][-1]["content"] == "is turbulence safe"


def test_guardrails_strip_cot_and_citations():
    g = guardrails.check_output("THINKING: x\nANSWER: Fine **really** [gear] [fake].", valid_ids={"gear"})
    assert g["text"] == "Fine really." and g["citations"] == ["gear"]


def test_pipeline_offline_fallback_has_trace():
    out = asyncio.run(pipeline.run("can turbulence break the wings"))
    assert [s["stage"] for s in out["trace"]] == ["nlp", "ml_classify", "retrieve", "prompt", "generate", "guardrails"]
    assert out["reply"] and out["citations"]


def test_travel_falls_back_without_llm():
    from app.ai import travel
    r = asyncio.run(travel.narrate_route({"nodes": [{"id": "plaza", "name": "Central plaza"}]}))
    assert r["ok"] is False and "template" in r["generator"]
    a = asyncio.run(travel.arrival_plan({"options": [{"id": "cab"}]}))
    assert a["ok"] is False


def test_travel_parse_rejects_invented_ids():
    from app.ai import travel
    assert travel._parse('```json\n{"recommended":"x"}\n```') == {"recommended": "x"}
