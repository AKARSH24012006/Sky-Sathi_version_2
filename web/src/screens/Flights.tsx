import { useApp } from "../store";
import { instruments } from "../lib/sequence";
import { fmt } from "../lib/api";
import LiveTracker from "../components/LiveTracker";

export default function Flights() {
  const s = useApp();
  const inst = instruments(s.telem);
  const rows: [string, string][] = [["Altitude", inst.alt], ["Speed", inst.speed], ["V/S", (s.vspd >= 0 ? "+" : "") + s.vspd.toLocaleString() + " fpm"],
    ["Heading", inst.heading], ["ETA", inst.eta], ["Distance", inst.dist], ["Fuel", inst.fuel], ["Outside air", inst.oat],
    ["Wind", inst.wind], ["Cabin alt", inst.cabin], ["Cabin temp", Math.round(22 + Math.sin(s.telem.progress * 7) * 0.6) + "°C"],
    ["Engines", s.telem.thr > 0.9 ? "takeoff power" : s.telem.thr > 0.6 ? "climb power" : s.telem.thr > 0.3 ? "cruise power" : "idle"],
    ["Aircraft", s.flight?.aircraft || "A320neo"], ["Phase", s.playing ? s.phase.label : "demo idle"], ["Ride", inst.ride]];
  const L = 244;
  return <>
    <LiveTracker defaultFlight={s.flight?.flight_no || "AI101"} />
    <div className="card" style={{ marginTop: 14 }}><p className="eyebrow">Flight experience · simulated cockpit · {fmt(s.flight?.flight_no)}</p>
      <p className="sub" style={{ marginBottom: 10 }}>These instruments follow the rehearsal sequence on Home, not the live aircraft above — built to teach and calm, phase by phase.</p>
      <div id="instruments">{rows.map(([k, v]) => <div className="inst" key={k}><div className="k">{k}</div><div className="v">{fmt(v)}</div></div>)}</div>
    </div>
    <div className="card" id="routemap" style={{ marginTop: 14 }}><p className="eyebrow">Route · DEL → BLR · rehearsal</p>
      <svg viewBox="0 0 300 96">
        <path d="M24,76 Q150,8 276,72" fill="none" stroke="var(--line)" strokeWidth="1.5" strokeDasharray="3 4" />
        <path d="M24,76 Q150,8 276,72" fill="none" stroke="var(--sky)" strokeWidth="2" strokeDasharray={`${s.progress * L} 999`} />
        <circle cx="24" cy="76" r="4" fill="var(--sky)" /><text x="24" y="92" textAnchor="middle" fill="var(--text-2)" fontSize="9">DEL</text>
        <circle cx="276" cy="72" r="4" fill="var(--sage)" /><text x="276" y="88" textAnchor="middle" fill="var(--text-2)" fontSize="9">BLR</text>
      </svg></div>
    <div className="card" style={{ marginTop: 14 }}><p className="eyebrow">Sun & sky</p>
      <p className="sub" style={{ marginTop: 8 }}>Sunset at cruise ≈ 19:04 IST on this heading — left-side windows (yours, 14A). The 3D scene on Home follows your real local sun.</p></div>
    <div className="card" style={{ marginTop: 14 }}><p className="eyebrow">After landing · Bengaluru</p>
      <div className="amen"><span><b>Baggage claim</b> · Belt 4 (predicted)</span><span className="w">~18 min after landing</span></div>
      <div className="amen"><span><b>Metro</b> · Airport line to Majestic</span><span className="w">every 8 min · ₹60</span></div>
      <div className="amen"><span><b>Prepaid taxi</b> · official counter, exit 3</span><span className="w">avoid touts</span></div>
    </div>
  </>;
}
