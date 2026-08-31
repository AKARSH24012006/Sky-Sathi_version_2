import { useState } from "react";
import { useApp } from "../store";
import { fmt } from "../lib/api";

export default function Journey() {
  const s = useApp();
  const [openTopic, setOpenTopic] = useState<string | null>(null);
  return <>
    <div className="grid">
      <div className="card"><p className="eyebrow">Pre-flight checklist</p>
        {s.CHECKLIST.map((c, i) => (
          <label className={"checkrow" + (s.checks[i] ? " done" : "")} key={i}>
            <input type="checkbox" checked={s.checks[i]} onChange={() => s.setChecks(v => v.map((x, j) => j === i ? !x : x))} />
            <span>{c}</span></label>))}
      </div>
      <div className="card"><p className="eyebrow">Travel wallet</p>
        <div className="wcards">
          <div className="wcard"><div className="k">Boarding pass</div><div className="v mono">{fmt(s.flight?.flight_no)} · 14A</div><div className="d">Gate {fmt(s.flight?.gate)} · window, left side</div></div>
          <div className="wcard"><div className="k">Passport</div><div className="v">Checked ✓</div><div className="d">Domestic — any photo ID works</div></div>
          <div className="wcard"><div className="k">Insurance</div><div className="v">Covered</div><div className="d">Helpline saved offline</div></div>
          <div className="wcard"><div className="k">Emergency</div><div className="v mono">112</div><div className="d">Family sharing on</div></div>
        </div></div>
    </div>

    <div className="card" style={{ marginTop: 14 }}><p className="eyebrow">Delhi T3 · near Gate {fmt(s.flight?.gate)}</p>
      {s.amens.length ? s.amens.map((a, i) =>
        <div className="amen" key={i}><span><b style={{ textTransform: "capitalize" }}>{fmt(a.name)}</b> · {fmt(a.near)}</span><span className="w">{fmt(a.walk_min, " min walk")}</span></div>)
        : <p className="sub" style={{ marginTop: 8 }}>Gate-area amenities appear when the backend is running (./start.sh).</p>}
      <p className="sub" style={{ marginTop: 10, fontSize: 12 }}>Indoor walking navigation needs the airport's map partnership — coming soon, honestly.</p>
    </div>

    <div className="card" id="academy" style={{ marginTop: 14 }}><p className="eyebrow">Academy · how flying works</p>
      {s.kb.length ? <>
        <div className="topics">{s.kb.slice(0, 10).map(e =>
          <button key={e.id} className={"topic" + (openTopic === e.id ? " open" : "")}
            onClick={() => setOpenTopic(openTopic === e.id ? null : e.id)}>{e.id.replace(/-/g, " ")}</button>)}</div>
        {openTopic && (() => { const e = s.kb.find(x => x.id === openTopic)!; return <div className="lesson">{e.text} <b>{e.calm}</b></div>; })()}
      </> : <p className="sub" style={{ marginTop: 8 }}>Lessons load from the knowledge base when the backend is up.</p>}
    </div>
  </>;
}
