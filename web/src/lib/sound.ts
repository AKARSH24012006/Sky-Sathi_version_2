/** SkySathi sound design — all synthesized in WebAudio (no assets, no network).
 *  Engine: brown-noise bed whose lowpass + gain follow real throttle every frame.
 *  Plus: seatbelt ding (two-tone chime), touch clicks, wind at altitude, rain,
 *  soft thunder. Opt-in; everything ramps (no pops); off = full teardown. */
let ctx: AudioContext | null = null;
let enabled = false;
let eng: { src: AudioBufferSourceNode; f: BiquadFilterNode; g: GainNode } | null = null;
let wind: { src: AudioBufferSourceNode; f: BiquadFilterNode; g: GainNode } | null = null;
let rainN: { src: AudioBufferSourceNode; g: GainNode } | null = null;

function ac(): AudioContext { if (!ctx) ctx = new AudioContext(); ctx.resume(); return ctx; }
function noiseBuffer(a: AudioContext, brown: boolean): AudioBuffer {
  const n = 2 * a.sampleRate, b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { d[i] = (last + 0.02 * w) / 1.02; last = d[i]; d[i] *= 3.2; } else d[i] = w * 0.5;
  }
  return b;
}
function loop(brown: boolean, freq: number) {
  const a = ac();
  const src = a.createBufferSource(); src.buffer = noiseBuffer(a, brown); src.loop = true;
  const f = a.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq;
  const g = a.createGain(); g.gain.value = 0;
  src.connect(f); f.connect(g); g.connect(a.destination); src.start();
  return { src, f, g };
}

export const snd = {
  get on() { return enabled; },
  toggle(): boolean {
    enabled = !enabled;
    if (enabled) { eng = loop(true, 220); wind = loop(false, 900); rainN = loop(false, 2400); }
    else {
      for (const n of [eng, wind, rainN]) if (n) { n.g.gain.linearRampToValueAtTime(0, ac().currentTime + 0.5); const s = n.src; setTimeout(() => { try { s.stop(); } catch {} }, 600); }
      eng = wind = rainN = null;
    }
    return enabled;
  },
  /** called every frame from the Director with real values */
  engine(thr: number, reverse: boolean, alt: number, raining: boolean) {
    if (!enabled || !ctx) return;
    const t = ctx.currentTime;
    if (eng) {
      eng.f.frequency.setTargetAtTime(160 + thr * 620 + (reverse ? 180 : 0), t, 0.25);
      eng.g.gain.setTargetAtTime(0.015 + thr * 0.075 + (reverse ? 0.03 : 0), t, 0.25);
    }
    if (wind) wind.g.gain.setTargetAtTime(alt * 0.02, t, 0.4);
    if (rainN) rainN.g.gain.setTargetAtTime(raining ? 0.028 : 0, t, 0.6);
  },
  ding() {   // the seatbelt chime: two soft tones
    if (!enabled) return;
    const a = ac(), t = a.currentTime;
    [[880, 0], [660, 0.28]].forEach(([f, dt]) => {
      const o = a.createOscillator(), g = a.createGain();
      o.type = "sine"; o.frequency.value = f as number; g.gain.value = 0;
      o.connect(g); g.connect(a.destination);
      g.gain.setTargetAtTime(0.05, t + (dt as number), 0.01);
      g.gain.setTargetAtTime(0, t + (dt as number) + 0.12, 0.15);
      o.start(t + (dt as number)); o.stop(t + (dt as number) + 0.9);
    });
  },
  click() {
    if (!enabled) return;
    const a = ac(), t = a.currentTime;
    const o = a.createOscillator(), g = a.createGain(), f = a.createBiquadFilter();
    o.frequency.value = 1100; f.type = "lowpass"; f.frequency.value = 1500; g.gain.value = 0.0001;
    o.connect(f); f.connect(g); g.connect(a.destination);
    g.gain.exponentialRampToValueAtTime(0.04, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.start(t); o.stop(t + 0.1);
  },
  thunder() {
    if (!enabled) return;
    const a = ac(), t = a.currentTime;
    const s = a.createBufferSource(); s.buffer = noiseBuffer(a, true);
    const f = a.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 140;
    const g = a.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(a.destination);
    g.gain.setTargetAtTime(0.12, t, 0.05); g.gain.setTargetAtTime(0, t + 0.4, 0.8);
    s.start(t); s.stop(t + 3);
  },
};
if (typeof document !== "undefined")
  document.addEventListener("pointerdown", e => { if ((e.target as HTMLElement).closest?.("button")) snd.click(); }, { passive: true });
