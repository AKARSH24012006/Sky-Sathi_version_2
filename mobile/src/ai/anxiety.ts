/** Ported from the Stage 4 prototype: additive behavioural signals, exponential decay,
 *  manual self-report as floor. Score NEVER leaves the device; only the band does. */
export type Band = "calm" | "raised" | "high";
const W: Record<string, number> = { wwt: 18, calm: 22, q: 5, fastq: 12 };

export class AnxietyEngine {
  score = 12; manual: number | null = null; private last = Date.now();
  bump(kind: keyof typeof W) { this.score = Math.min(100, this.score + (W[kind] ?? 5)); }
  decay() {
    const now = Date.now(); const dt = (now - this.last) / 1000; this.last = now;
    this.score = Math.max(0, this.score - dt * 0.35);
    if (this.manual != null) this.score = Math.max(this.score, this.manual);
  }
  band(): Band { return this.score >= 60 ? "high" : this.score >= 30 ? "raised" : "calm"; }
  speechRate() { const b = this.band(); return b === "high" ? 0.82 : b === "raised" ? 0.9 : 0.95; }
}
