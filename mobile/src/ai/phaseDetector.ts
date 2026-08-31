/** TypeScript twin of api/app/services/phase_detector.py.
 *  Both MUST pass shared/phase-detector.spec.json (CI enforces).
 *  Runs on-device at 10 Hz feature windows; fully offline. */
export type Features = { ax: number; vertVar: number; db: number; altRate: number; gspd: number; alt: number };
export type Phase =
  | "BOARDING" | "TAXI" | "TAKEOFF_ROLL" | "CLIMB" | "CRUISE"
  | "TURBULENCE" | "DESCENT" | "APPROACH" | "LANDING" | "ARRIVED";

const T: Record<Phase, (f: Features) => Phase | null> = {
  BOARDING:     f => (f.gspd > 5 ? "TAXI" : null),
  TAXI:         f => (f.ax > 0.22 && f.db > 70 ? "TAKEOFF_ROLL" : null),
  TAKEOFF_ROLL: f => (f.altRate > 500 ? "CLIMB" : null),
  CLIMB:        f => (f.altRate < 100 && f.gspd > 500 ? "CRUISE" : null),
  CRUISE:       f => (f.vertVar > 2.0 ? "TURBULENCE" : f.altRate < -400 ? "DESCENT" : null),
  TURBULENCE:   f => (f.vertVar < 1.0 ? "CRUISE" : null),
  DESCENT:      f => (f.gspd < 560 && f.alt < 10000 ? "APPROACH" : null),
  APPROACH:     f => (f.alt < 1500 && f.gspd > 60 ? "LANDING" : null),
  LANDING:      f => (f.gspd < 20 ? "ARRIVED" : null),
  ARRIVED:      () => null,
};
const CONFIRM = 3;

export class PhaseDetector {
  state: Phase; conf = 0.5; private hold = 0; private pending: Phase | null = null;
  constructor(start: Phase = "BOARDING") { this.state = start; }
  step(f: Features): Phase {
    const next = T[this.state](f);
    if (next) {
      if (this.pending === next) this.hold++;
      else { this.pending = next; this.hold = 1; }
      if (this.hold >= CONFIRM) { this.state = next; this.conf = 0.6; this.hold = 0; this.pending = null; }
    } else {
      this.pending = null; this.hold = 0;
      this.conf = Math.min(0.98, this.conf + 0.015);
    }
    return this.state;
  }
}
