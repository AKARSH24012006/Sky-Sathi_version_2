"""Python twin of mobile/src/ai/phaseDetector.ts. Both MUST pass
shared/phase-detector.spec.json — CI enforces the twin never drifts.
Used for training-data labeling and offline evaluation."""

TRANSITIONS = {
    "BOARDING":     lambda f: "TAXI" if f["gspd"] > 5 else None,
    "TAXI":         lambda f: "TAKEOFF_ROLL" if f["ax"] > 0.22 and f["db"] > 70 else None,
    "TAKEOFF_ROLL": lambda f: "CLIMB" if f["altRate"] > 500 else None,
    "CLIMB":        lambda f: "CRUISE" if f["altRate"] < 100 and f["gspd"] > 500 else None,
    "CRUISE":       lambda f: "TURBULENCE" if f["vertVar"] > 2.0
                    else ("DESCENT" if f["altRate"] < -400 else None),
    "TURBULENCE":   lambda f: "CRUISE" if f["vertVar"] < 1.0 else None,
    "DESCENT":      lambda f: "APPROACH" if f["gspd"] < 560 and f["alt"] < 10000 else None,
    "APPROACH":     lambda f: "LANDING" if f["alt"] < 1500 and f["gspd"] > 60 else None,
    "LANDING":      lambda f: "ARRIVED" if f["gspd"] < 20 else None,
    "ARRIVED":      lambda f: None,
}
CONFIRM = 3  # consecutive samples required (hysteresis)

class PhaseDetector:
    def __init__(self, start: str = "BOARDING"):
        self.state, self.conf, self.hold, self.pending = start, 0.5, 0, None

    def step(self, f: dict) -> str:
        nxt = TRANSITIONS[self.state](f)
        if nxt:
            if self.pending == nxt:
                self.hold += 1
            else:
                self.pending, self.hold = nxt, 1
            if self.hold >= CONFIRM:
                self.state, self.conf, self.hold, self.pending = nxt, 0.6, 0, None
        else:
            self.pending, self.hold = None, 0
            self.conf = min(0.98, self.conf + 0.015)
        return self.state
