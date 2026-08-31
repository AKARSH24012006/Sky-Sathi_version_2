import { PhaseDetector, Phase } from "../src/ai/phaseDetector";
import spec from "../../shared/phase-detector.spec.json";

test("golden vectors", () => {
  for (const c of (spec as any).cases) {
    const det = new PhaseDetector((c.start as Phase) ?? "BOARDING");
    for (const s of c.samples) det.step(s);
    expect(`${c.name}:${det.state}`).toBe(`${c.name}:${c.expect}`);
  }
});
