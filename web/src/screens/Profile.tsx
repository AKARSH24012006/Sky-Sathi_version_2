import { local } from "../lib/safeStorage";
import { useApp } from "../store";
import { airlineFor } from "../lib/airlines";

export default function Profile({ openSettings }: { openSettings: () => void }) {
  const s = useApp();
  const flights = Number(local.get("ss:flights") || (s.progress >= 1 ? 1 : 0)) + (s.progress >= 1 ? 0 : 0);
  const done = s.checks.filter(Boolean).length;
  const ach = [
    { t: "First wings", d: "Complete a flight", on: flights > 0 || s.progress >= 1 },
    { t: "Prepared traveler", d: "Finish the checklist", on: done === s.CHECKLIST.length },
    { t: "Curious mind", d: "Ask the copilot", on: s.msgs.some(m => m.who === "u") },
    { t: "Zen at 36,000 ft", d: "Fly through turbulence calmly", on: s.progress >= 1 },
  ];
  return <>
    <div className="card" style={{ display: "flex", gap: 16, alignItems: "center" }}>
      <div className="avatar">AN</div>
      <div style={{ flex: 1 }}>
        <h2 style={{ fontSize: 22 }}>Akarsh Nehra</h2>
        <p className="sub">Sonipat, Haryana · flying since 2026 · window-seat person</p>
      </div>
      <button className="btn gearbtn" onClick={openSettings}>Settings</button>
    </div>

    <div className="card" style={{ marginTop: 14 }}><p className="eyebrow">Travel statistics</p>
      <div id="instruments" style={{ marginTop: 10 }}>
        {([["Flights", String(Math.max(flights, s.progress >= 1 ? 1 : 0))], ["Distance", s.progress >= 1 ? "1,740 km" : "0 km"],
           ["Countries", "1"], ["Airports", "2"], ["CO₂ (est.)", s.progress >= 1 ? "≈200 kg" : "0 kg"], ["Favorite airline", airlineFor(s.flight?.flight_no)]] as [string, string][])
          .map(([k, v]) => <div className="inst" key={k}><div className="k">{k}</div><div className="v">{v}</div></div>)}
      </div>
      <p className="sub" style={{ marginTop: 10, fontSize: 12 }}>CO₂ is an estimate (~0.115 kg per passenger-km, A320neo). Offsets and greener-routing tips are a premium roadmap item.</p>
    </div>

    <div className="card" style={{ marginTop: 14 }}><p className="eyebrow">Achievements</p>
      <div className="wcards">{ach.map(a =>
        <div className="wcard" key={a.t} style={{ opacity: a.on ? 1 : 0.45 }}>
          <div className="k">{a.on ? "earned" : "locked"}</div><div className="v">{a.t}</div><div className="d">{a.d}</div>
        </div>)}
      </div></div>

    <div className="card" style={{ marginTop: 14 }}><p className="eyebrow">Saved</p>
      <div className="amen"><span><b>Home airport</b> · DEL — Indira Gandhi Intl</span><span className="w">saved</span></div>
      <div className="amen"><span><b>Emergency contact</b> · Maa</span><span className="w">family sharing on</span></div>
      <div className="amen"><span><b>Documents</b> · ID verified for domestic</span><span className="w">on device</span></div>
      <div className="amen"><span><b>Payment methods</b></span><span className="w">coming soon — UPI first</span></div>
    </div>
  </>;
}
