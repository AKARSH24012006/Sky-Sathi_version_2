import { lazy, Suspense } from "react";
import { useApp } from "../store";
import { PHASES } from "../lib/sequence";
import { fmt } from "../lib/api";
import { snd } from "../lib/sound";
const FlightScene = lazy(() => import("../components/Aircraft3D"));
const CHIPS = ["engstart", "taxi", "roll", "climb", "cruise", "turb", "descent", "approach", "touchdown", "gate"];

export default function Home({ go }: { go: (t: string) => void }) {
  const s = useApp();
  const mins = Math.floor(s.boardIn / 60), secs = s.boardIn % 60;
  const nowIdx = PHASES.findIndex(p => p.id === s.phase.id);
  const done = s.checks.filter(Boolean).length;
  const score = Math.min(100, 38 + done * 7 + (s.playing || s.progress > 0 ? 14 : 0));
  return <>
    <div className="card" id="scene">
      <div id="hero" style={{ height: "min(56vh, 520px)" }}>
        <Suspense fallback={<div className="skeleton" style={{ height: "100%", borderRadius: 18 }} />}>
          <FlightScene seq={s.seq} onPhase={s.onPhase} onTelem={s.onTelem} wx={s.wxFx} />
        </Suspense>
        <div id="welcome" className={s.playing ? "hide" : ""}>
          <h2>{s.greet}, Akarsh.<br />Welcome aboard.</h2>
          <p>Delhi → Bengaluru · Gate <b className="mono">{fmt(s.flight?.gate)}</b><br />
            Boarding in <b className="mono">{mins}:{String(secs).padStart(2, "0")}</b></p>
        </div>
        <button id="soundBtn" className={"btn" + (s.soundOn ? " on" : "")} onClick={() => s.setSoundOn(snd.toggle())}>{s.soundOn ? "sound on" : "sound off"}</button>
      </div>
      <div id="sceneUi">
        <div id="band" className={s.phase.turb && s.playing ? "warm" : ""}>
          <span className="pip" />
          <div>
            <h3>{s.playing ? s.phase.label : "In flight · demo idle"}{s.playing && s.phase.turb ? " · expected · ending soon" : " · everything is normal"}</h3>
            <p>{s.playing ? s.phase.note : "The camera is circling your aircraft. Press Begin Flight for the full journey — engine start to gate."}</p>
          </div>
        </div>
        <div id="progress"><i style={{ width: `${s.progress * 100}%` }} /></div>
        <div id="timeline">
          {CHIPS.map(id => { const i = PHASES.findIndex(p => p.id === id);
            return <span key={id} className={"tchip" + (s.playing && i < nowIdx ? " done" : s.playing && i === nowIdx ? " now" : "")}>{PHASES[i].label}</span>; })}
        </div>
        <button className="btn" onClick={s.begin} disabled={s.playing}>{s.playing ? "Flying DEL → BLR…" : "Begin Flight"}</button>
      </div>
    </div>

    <div className="grid">
      <div className="card"><p className="eyebrow">Calm Score</p><div className="calmnum">{score}</div>
        <div className="meter"><i style={{ width: `${score}%` }} /></div>
        <p className="sub" style={{ marginTop: 8 }}>Grows with preparation, learning, and every flight you complete.</p></div>
      <div className="card"><p className="eyebrow">Quick actions</p>
        <div className="chips" style={{ marginTop: 10 }}>
          <button onClick={() => go("tickets")}>Boarding pass</button>
          <button onClick={() => go("copilot")}>Ask copilot</button>
          <button onClick={() => go("journey")}>Checklist ({done}/{s.CHECKLIST.length})</button>
          <button onClick={() => go("flights")}>Live flight</button>
        </div>
        <p className="eyebrow" style={{ marginTop: 16 }}>AI suggestions</p>
        <div className="chips" style={{ marginTop: 8 }}>
          {["What was that sound?", "Why do my ears pop?", "Is turbulence dangerous?"].map(q =>
            <button key={q} onClick={() => { go("copilot"); s.ask(q); }}>{q}</button>)}
        </div></div>
    </div>

    <div className="grid">
      <WeatherMini title="Delhi · departure" w={s.wxDel} loading={s.loading} />
      <WeatherMini title="Bengaluru · arrival" w={s.wxBlr} loading={s.loading} />
    </div>

    <div className="card" style={{ marginTop: 14 }}>
      <p className="eyebrow">Destination · Bengaluru</p>
      <p className="sub" style={{ marginTop: 8 }}>Garden City of India. {fmt(s.wxBlr?.temp_c, "°C")} on arrival — {fmt(s.wxBlr?.summary)}. Metro every 8 minutes from the terminal; sunset over Lalbagh is worth the detour.</p>
    </div>
  </>;
}
function WeatherMini({ title, w, loading }: { title: string; w: any; loading: boolean }) {
  return <div className="card wx"><p className="eyebrow">{title}</p>
    {loading ? <><div className="big skeleton">00°</div><p className="sub skeleton">loading…</p></>
      : w ? <><div className="big mono">{fmt(w.temp_c, "°C")} <span style={{ fontSize: 15, color: "var(--text-2)", fontWeight: 400 }}>{fmt(w.summary)}</span></div>
        <p className="sub">Wind {fmt(w.wind_kmh, " km/h")} — {fmt(w.calm_note)}.</p>
        <p className="src">{w.source.includes("demo") ? "demo data · API offline" : <>live · <b>{w.source}</b></>}</p></>
        : <><div className="big">—</div><p className="sub">Weather is taking a moment.</p></>}
  </div>;
}
