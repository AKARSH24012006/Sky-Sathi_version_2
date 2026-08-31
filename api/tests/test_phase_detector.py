import json, pathlib
from app.sensors.phase_detector import PhaseDetector

SPEC = json.loads((pathlib.Path(__file__).resolve()
                   .parents[2] / "shared" / "phase-detector.spec.json").read_text())

def test_golden_vectors():
    for case in SPEC["cases"]:
        det = PhaseDetector(case.get("start", "BOARDING"))
        for s in case["samples"]:
            det.step(s)
        assert det.state == case["expect"], f'{case["name"]}: {det.state} != {case["expect"]}'
