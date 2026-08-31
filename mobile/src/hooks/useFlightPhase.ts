import { useMemo, useRef, useState } from "react";
import { PhaseDetector, Features, Phase } from "../ai/phaseDetector";

export function useFlightPhase() {
  const det = useRef(new PhaseDetector());
  const [phase, setPhase] = useState<Phase>("BOARDING");
  const [conf, setConf] = useState(0.5);
  const feed = useMemo(() => (f: Features) => {
    const p = det.current.step(f);
    setPhase(p); setConf(det.current.conf);
  }, []);
  return { phase, conf, feed, reset: () => (det.current = new PhaseDetector()) };
}
