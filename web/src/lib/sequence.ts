/** The full demo flight, phase by phase — the choreography source of truth.
 *  Each phase declares TARGETS; the 3D scene damps toward them, so every
 *  transition (rotation, gear, bank, flare) is physically smooth and
 *  frame-rate independent. Durations compress a 2h40m flight into ~95 s. */
export type Phase = {
  id: string; label: string; note: string; dur: number;
  alt: number;          // 0..1 of cruise altitude
  pitch: number;        // deg, +nose-up
  bank: number;         // deg, +left wing down
  gear: boolean; flaps: number; spoilers: boolean;
  thr: number;          // engine power 0..1 (fan speed, camera FOV, cloud speed)
  camD: number; camH: number; // chase camera distance / height
  turb?: boolean; reverse?: boolean; ground?: boolean;
};

export const PHASES: Phase[] = [
  { id:"engstart", label:"Engine start", note:"Listen — one engine, then the other. Fans waking up is the sound of the journey beginning.", dur:6, alt:0, pitch:0, bank:0, gear:true, flaps:0, spoilers:false, thr:.3, camD:4.6, camH:1.1, ground:true },
  { id:"boarding", label:"Boarding",     note:"Doors open. The jet hums on APU power — that little engine in the tail.", dur:5, alt:0, pitch:0, bank:0, gear:true, flaps:0,   spoilers:false, thr:.06, camD:7.5, camH:2.2, ground:true },
  { id:"pushback", label:"Pushback",     note:"A tug eases us backward. Engines wake, one at a time.",                    dur:5, alt:0, pitch:0, bank:0, gear:true, flaps:0,   spoilers:false, thr:.18, camD:8,   camH:2.4, ground:true },
  { id:"taxi",     label:"Taxi",         note:"Rolling to the runway. Those bumps are pavement seams — nothing more.",    dur:7, alt:0, pitch:0, bank:0, gear:true, flaps:.5,  spoilers:false, thr:.24, camD:8,   camH:2.6, ground:true },
  { id:"lineup",   label:"Lining up",    note:"On the runway centerline. A breath before the best part.",                 dur:3, alt:0, pitch:0, bank:0, gear:true, flaps:.5,  spoilers:false, thr:.3,  camD:7,   camH:2.2, ground:true },
  { id:"roll",     label:"Takeoff roll", note:"Full power. Loud is exactly right — this is the engines doing their job.", dur:6, alt:0, pitch:0, bank:0, gear:true, flaps:.5,  spoilers:false, thr:1,   camD:8.5, camH:2,   ground:true },
  { id:"rotate",   label:"Rotation",     note:"The nose lifts. The wings take the weight now.",                           dur:2, alt:.03, pitch:9,  bank:0, gear:true, flaps:.5, spoilers:false, thr:1,  camD:9,  camH:1.8, ground:true },
  { id:"liftoff",  label:"Liftoff",      note:"Airborne. That floating feeling is the wheels letting go of the earth.",   dur:3, alt:.1,  pitch:13, bank:0, gear:true, flaps:.5, spoilers:false, thr:1,  camD:9.5, camH:1.6 },
  { id:"gearup",   label:"Gear up",      note:"The whirr and thud below you? Wheels folding into the belly. Right on time.", dur:3, alt:.2, pitch:12, bank:0, gear:false, flaps:.5, spoilers:false, thr:.95, camD:10, camH:1.8 },
  { id:"climb",    label:"Climb",        note:"Engines ease back — quieter means less work needed, not less lift.",       dur:7, alt:.45, pitch:9,  bank:0, gear:false, flaps:0, spoilers:false, thr:.8, camD:10.5, camH:2.2 },
  { id:"bankl",    label:"Turning on course", note:"A gentle lean left — the aircraft carving its highway in the sky.",   dur:5, alt:.6,  pitch:5,  bank:16, gear:false, flaps:0, spoilers:false, thr:.75, camD:11, camH:2.6 },
  { id:"bankr",    label:"On airway",    note:"And rolling level onto the airway south. Smooth as a compass needle.",     dur:5, alt:.72, pitch:4,  bank:-12, gear:false, flaps:0, spoilers:false, thr:.72, camD:11, camH:2.8 },
  { id:"cruise",   label:"Cruise",       note:"36,000 ft. Above the weather, above the haze. The calmest stretch of all.", dur:9, alt:1, pitch:1.5, bank:0, gear:false, flaps:0, spoilers:false, thr:.55, camD:12, camH:3 },
  { id:"turb",     label:"Light turbulence", note:"A patch of uneven air — forecast this morning. The wings flex to absorb it. Over soon.", dur:7, alt:1, pitch:1.5, bank:0, gear:false, flaps:0, spoilers:false, thr:.55, camD:11, camH:2.8, turb:true },
  { id:"smooth",   label:"Smooth again", note:"And… done. Exactly as promised.",                                          dur:4, alt:1, pitch:1, bank:0, gear:false, flaps:0, spoilers:false, thr:.55, camD:12, camH:3 },
  { id:"descent",  label:"Descent",      note:"Power back, nose gently down. Your ears notice before your eyes do.",      dur:8, alt:.5, pitch:-4, bank:0, gear:false, flaps:.4, spoilers:false, thr:.35, camD:11, camH:2.4 },
  { id:"geardown", label:"Gear down",    note:"Three green lights in the cockpit — wheels down and locked.",              dur:3, alt:.28, pitch:-3, bank:0, gear:true, flaps:.7, spoilers:false, thr:.4, camD:10, camH:2 },
  { id:"approach", label:"Final approach", note:"Runway ahead. Landing lights on. Everything stabilized and checked.",    dur:6, alt:.12, pitch:-2.5, bank:0, gear:true, flaps:1, spoilers:false, thr:.42, camD:9, camH:1.8 },
  { id:"flare",    label:"Flare",        note:"Nose rises just a touch to soften the meeting with the runway.",           dur:2, alt:.02, pitch:4, bank:0, gear:true, flaps:1, spoilers:false, thr:.25, camD:8.5, camH:1.6 },
  { id:"touchdown",label:"Touchdown",    note:"Firm and planted — on purpose. Grip beats grace on landing.",              dur:2, alt:0, pitch:1, bank:0, gear:true, flaps:1, spoilers:true, thr:.2, camD:8, camH:1.8, ground:true },
  { id:"reverse",  label:"Reverse thrust", note:"That roar is the engines braking. Loud, brief, and completely routine.", dur:5, alt:0, pitch:0, bank:0, gear:true, flaps:1, spoilers:true, thr:.7, camD:8, camH:2, ground:true, reverse:true },
  { id:"taxiin",   label:"Taxi to gate", note:"Off the runway, rolling home. Flaps tuck away, spoilers relax.",           dur:6, alt:0, pitch:0, bank:0, gear:true, flaps:.2, spoilers:false, thr:.2, camD:8, camH:2.4, ground:true },
  { id:"gate",     label:"At the gate",  note:"Seatbelt sign off. You did it — and it was beautiful up there.",           dur:5, alt:0, pitch:0, bank:0, gear:true, flaps:0, spoilers:false, thr:.05, camD:7.5, camH:2.2, ground:true },
];

export const TOTAL = PHASES.reduce((s, p) => s + p.dur, 0);
const starts = PHASES.reduce<number[]>((a, p) => (a.push((a[a.length-1] ?? 0) + p.dur), a), []).map((e,i)=>e-PHASES[i].dur);

const smooth = (u: number) => u * u * (3 - 2 * u);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/** Continuous targets at time t: blends from the previous phase over the first
 *  35% of each phase, so nothing ever snaps. */
export function targetsAt(t: number) {
  const tt = Math.min(t, TOTAL - 0.001);
  let i = PHASES.length - 1;
  for (let k = 0; k < PHASES.length; k++) if (tt < starts[k] + PHASES[k].dur) { i = k; break; }
  const cur = PHASES[i], prev = PHASES[Math.max(0, i - 1)];
  const u = smooth(Math.min(1, (tt - starts[i]) / (cur.dur * 0.35)));
  return {
    phase: cur, index: i, progress: tt / TOTAL,
    alt: lerp(prev.alt, cur.alt, u), pitch: lerp(prev.pitch, cur.pitch, u),
    bank: lerp(prev.bank, cur.bank, u), flaps: lerp(prev.flaps, cur.flaps, u),
    thr: lerp(prev.thr, cur.thr, u),
    gear: cur.gear ? 1 : 0, spoilers: cur.spoilers ? 1 : 0,
    camD: lerp(prev.camD, cur.camD, u), camH: lerp(prev.camH, cur.camH, u),
    turb: !!cur.turb, reverse: !!cur.reverse, ground: !!cur.ground,
  };
}


/* ---------- live instruments, simulated realistically from flight state ---------- */
export type Telemetry = { alt: number; thr: number; progress: number; ground: boolean; turb: boolean };
const ROUTE_KM = 1740;                       // DEL -> BLR great circle
export function instruments(tm: Telemetry) {
  const altFt = Math.round(tm.alt * 36000);
  const ias = tm.ground ? Math.round(tm.thr * 145) : Math.round(160 + tm.alt * 290 * (0.6 + tm.thr * 0.55));
  const dist = Math.round(ROUTE_KM * (1 - tm.progress));
  const etaMin = Math.max(0, Math.round((dist / 780) * 60));
  return {
    alt: altFt.toLocaleString() + " ft",
    speed: ias + " kt",
    heading: (168 + Math.round(Math.sin(tm.progress * 9) * 6)) + "\u00B0",
    eta: etaMin >= 60 ? `${Math.floor(etaMin / 60)}h ${etaMin % 60}m` : etaMin + " min",
    dist: dist.toLocaleString() + " km",
    fuel: (6.4 - tm.progress * 3.1).toFixed(1) + " t",
    oat: Math.round(31 - tm.alt * 87) + "\u00B0C",
    wind: Math.round(8 + tm.alt * 52) + " km/h",
    cabin: Math.round(tm.alt * 6800).toLocaleString() + " ft",
    ride: tm.turb ? "light chop" : "smooth",
  };
}
