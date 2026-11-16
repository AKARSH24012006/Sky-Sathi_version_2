"""Delay Intelligence (ML PBL-1/2/3) — API contract + sanity of the exported models."""
from fastapi.testclient import TestClient
from app.main import app
from app.delayml import engine

c = TestClient(app)


def test_overview_has_all_pbl_parts():
    o = c.get("/delayml/overview").json()
    ids = {m["id"] for m in o["metrics"]["classification"]}
    assert {"logreg", "tree", "random_forest", "bagging", "extra_trees", "boosting", "voting", "stacking"} <= ids
    assert len(o["metrics"]["regression"]) == 4
    assert o["clusters"]["k"] == len(o["clusters"]["profiles"]) == 4
    assert o["hmm"]["states"] == ["Calm", "Building", "Congested"]
    assert all(0.5 < m["roc_auc"] < 1 for m in o["metrics"]["classification"])


def test_predict_shape_and_ranges():
    r = c.post("/delayml/predict", json={"airline": "DL", "origin": "ATL", "dest": "LGA", "dep_hour": 8}).json()
    assert 0 <= r["probability"] <= 1 and 0 <= r["expected_delay_min"] <= 180
    assert len(r["committee"]) == 8 and r["band"] in ("low", "moderate", "elevated")
    assert "summary" in r and "%" in r["summary"]


def test_live_lateness_raises_risk():
    calm = engine.predict({"airline": "DL", "origin": "ATL", "dest": "LGA", "dep_hour": 15, "live_origin_delay": 0,
                           "live_airline_delay": 0, "live_dest_delay": 0})
    busy = engine.predict({"airline": "DL", "origin": "ATL", "dest": "LGA", "dep_hour": 15, "live_origin_delay": 90,
                           "live_airline_delay": 60, "live_dest_delay": 60})
    assert busy["probability"] > calm["probability"] + 0.1


def test_hmm_ripple_moves_to_congested():
    r = c.post("/delayml/ripple", json={"levels": [0, 0, 1, 2, 2, 2]}).json()
    assert r["now"] == "Congested" and r["p_next_late"] > 0.5
    q = c.post("/delayml/ripple", json={"levels": [0, 0, 0, 0]}).json()
    assert q["p_next_late"] < r["p_next_late"]


def test_explain_runs_genai_pipeline():
    r = c.post("/delayml/explain", json={"airline": "WN", "origin": "DEN", "dest": "LAS", "dep_hour": 18}).json()
    assert r["reply"] and {t["stage"] for t in r["trace"]} >= {"nlp", "retrieve", "prompt", "generate", "guardrails"}
    assert "delays" in r["citations"] or "%" in r["reply"]
