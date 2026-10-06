import { lazy, Suspense, useEffect, useState } from "react";
import { useApp } from "../store";
import { PHASES } from "../lib/sequence";
import { fmt } from "../lib/api";
import Icon from "../components/Icon";
import type { CamView } from "../components/Aircraft3D";
const FlightScene = lazy(() => import("../components/Aircraft3D"));
const CHIPS = ["engstart", "taxi", "roll", "climb", "cruise", "turb", "descent", "approach", "touchdown", "gate"];
const VIEWS: { id: CamView; label: string }[] = [{ id: "orbit", label: "Orbit" }, { id: "cockpit", label: "Cockpit" }, { id: "wing", label: "Wing view" }];
const ASK = [{ q: "What was that sound?", tag: "Facts", c: "cyan" }, { q: "Why do my ears pop?", tag: "Pressure", c: "violet" },
  { q: "Is turbulence dangerous?", tag: "Safety", c: "sage" }];
const wxIcon = (code?: number) => code == null ? "cloud" : code === 0 ? "sun" : code >= 51 ? "rain" : "cloud";

export default function Home({ go }: { go: (t: string) => void }) {
  const s = useApp();
  const [view, setView] = useState<CamView>("orbit");
  const [breathe, setBreathe] = useState(false);
  const mins = Math.floor(s.boardIn / 60), secs = s.boardIn % 60;
  const nowIdx = PHASES.findIndex(p => p.id === s.phase.id);
  const done = s.checks.filter(Boolean).length;
  const score = Math.min(100, 38 + done * 7 + (s.playing || s.progress > 0 ? 14 : 0));
  const flightNo = s.flight?.flight_no ?? "AI101";
  const alt = Math.round((s.telem.alt * 36000) / 100) * 100;
  const ias = Math.round(s.telem.ground ? s.telem.thr * 160 : 250 + s.telem.thr * 230);
  const turb = s.playing && s.phase.turb;
  const lastAnx = [...s.msgs].reverse().find(m => m.meta)?.meta?.anxiety ?? "calm";

  return <>
    {/* flight strip */}
    <section className="card strip">
      <span className="stripIc"><Icon n="arrow" s={20} /></span>
      <div className="stripMain">
        <h2>{s.greet}, Akarsh · <span className="mono">{flightNo}</span>
          <span className={"pill " + (turb ? "amber" : "sage")}>{s.playing ? (turb ? "Light chop · expected" : "En route · normal") : "Boarding soon"}</span></h2>
        <p>Delhi (DEL) → Bengaluru (BLR)</p>
      </div>
      <div className="stripTags">
        <span className="tag violet"><small>Gate</small><b className="mono">{fmt(s.flight?.gate)}</b></span>
        <span className="tag amber"><small>Boarding in</small><b className="mono">{mins}:{String(secs).padStart(2, "0")}</b></span>
        <span className="tag cyan"><small>Seat</small><b className="mono">14A</b> (window)</span>
        <span className="tag sage"><Icon n="check" s={14} /> {s.playing ? "Flying safely" : "All systems normal"}</span>
      </div>
    </section>

    {/* 3D scene + flight stage */}
    <section className="card stage">
      <div className="hero3d">
        <Suspense fallback={<div className="skeleton" style={{ height: "100%" }} />}>
          <FlightScene seq={s.seq} onPhase={s.onPhase} onTelem={s.onTelem} wx={s.wxFx} view={view} />
        </Suspense>
        <div className="hud tl">
          <span className="hchip live"><i />3D real-time view</span>
          <span className="hchip"><small>ALT</small> <b className="mono">{alt.toLocaleString("en-IN")} ft</b></span>
          <span className="hchip"><small>IAS</small> <b className="mono">{ias} kts</b></span>
        </div>
        <div className="hud tr seg dark" role="tablist" aria-label="Camera view">
          {VIEWS.map(v => <button key={v.id} role="tab" aria-selected={view === v.id} className={view === v.id ? "on" : ""} onClick={() => setView(v.id)}>{v.label}</button>)}
        </div>
        <div className="hud bl"><span className="hchip"><i className={turb ? "dot amber" : "dot"} />Telemetry: <b>{turb ? "light chop, expected" : "smooth airflow"}</b></span></div>
        <div className="hud br"><span className="hbox"><small>Pitch / roll</small><b className="mono">{s.telem.pitch >= 0 ? "+" : ""}{s.telem.pitch.toFixed(1)}° / {s.telem.bank.toFixed(1)}°</b></span></div>
      </div>
      <div className="stageUi">
        <div className="rowBetween">
          <p className="label">Flight stage <span className="pill sky">{s.playing ? `${s.phase.label} · active` : "Idle · cruising demo"}</span></p>
          <span className="pill sky mono">Timeline: {Math.round(s.progress * 100)}% complete</span>
        </div>
        <div className="phases">
          {CHIPS.map(id => { const i = PHASES.findIndex(p => p.id === id); const p = PHASES[i];
            const cls = s.playing && i < nowIdx ? " done" : s.playing && i === nowIdx ? " now" : "";
            return <span key={id} className={"phase" + cls + (p.turb ? " turb" : "")}>{p.label}{cls === " now" ? " · active" : ""}</span>; })}
        </div>
        {s.playing && <p className="narr"><i className={turb ? "dot amber" : "dot"} />{s.phase.note}</p>}
        <button className="btn grad" onClick={s.begin} disabled={s.playing}><Icon n="play" s={18} />{s.playing ? `Flying DEL → BLR · ${s.phase.label}` : "Begin interactive flight journey"}</button>
      </div>
    </section>

    {/* dashboard */}
    <div className="dash">
      <section className="card dcard">
        <div className="dhead"><p className="label">Calm score</p><span className="pill sage">{score >= 70 ? "Well prepared" : "Building up"}</span></div>
        <div className="calmnum"><span className="mono">{score}</span><small>/100</small></div>
        <div className="meter"><i style={{ width: `${score}%` }} /></div>
        <div className="tiles3">
          <div className="tile violet"><small>Checklist</small><b>{done}/{s.CHECKLIST.length}</b></div>
          <div className="tile sage"><small>Feeling</small><b>{lastAnx[0].toUpperCase() + lastAnx.slice(1)}</b></div>
          <div className="tile cyan"><small>Status</small><b>{s.playing ? "In flight" : "Ready"}</b></div>
        </div>
        <button className="dfoot" onClick={() => setBreathe(true)}>Breathing exercise <Icon n="chev" s={14} /></button>
      </section>

      <section className="card dcard">
        <div className="dhead"><p className="label">Quick actions</p><span className="pill sky">4 tools</span></div>
        <div className="qgrid">
          <button className="qa amber" onClick={() => go("tickets")}><Icon n="ticket" /><b>Boarding pass</b><small>Gate {fmt(s.flight?.gate)}</small></button>
          <button className="qa violet" onClick={() => go("copilot")}><Icon n="copilot" /><b>Ask copilot</b><small>Grounded answers</small></button>
          <button className="qa sage" onClick={() => go("journey")}><Icon n="check" /><b>Checklist</b><small>Ready ({done}/{s.CHECKLIST.length})</small></button>
          <button className="qa cyan" onClick={() => go("flights")}><Icon n="radar" /><b>Live radar</b><small>ADS-B tracker</small></button>
        </div>
        <p className="dnote">The calm tools are never paywalled.</p>
      </section>

      <section className="card dcard">
        <div className="dhead"><p className="label">AI reassurance</p><span className="pill violet">Copilot</span></div>
        <div className="asks">
          {ASK.map(a => <button key={a.q} className="ask" onClick={() => { go("copilot"); s.ask(a.q); }}>
            <span>{a.q}</span><span className={"mini " + a.c}>{a.tag}</span></button>)}
        </div>
        <button className="dfoot violet" onClick={() => go("copilot")}>Ask a custom question <Icon n="chev" s={14} /></button>
      </section>

      <WeatherCard city="Delhi" code="DEL / VIDP" role="Departure" tone="amber" w={s.wxDel} loading={s.loading} />
      <WeatherCard city="Bengaluru" code="BLR / VOBL" role="Arrival" tone="cyan" w={s.wxBlr} loading={s.loading} />

      <section className="card dcard">
        <div className="dhead"><p className="label">Cabin telemetry</p><span className="pill sky">A320neo · simulated</span></div>
        <div className="tiles2">
          <div className="tile cyan"><small>Ground speed</small><b className="mono">{s.telem.ground ? Math.round(s.telem.thr * 150) : Math.round(380 + s.telem.thr * 110)} <em>kts</em></b></div>
          <div className="tile sage"><small>Air refresh</small><b className="mono">2–3 <em>min</em></b></div>
          <div className="tile amber"><small>Altitude</small><b className="mono">{alt.toLocaleString("en-IN")} <em>ft</em></b></div>
          <div className="tile violet"><small>Cabin pressure</small><b className="mono">6,800 <em>ft equiv.</em></b></div>
        </div>
      </section>
    </div>

    {breathe && <Breathing onClose={() => setBreathe(false)} />}
  </>;
}

function WeatherCard({ city, code, role, tone, w, loading }: { city: string; code: string; role: string; tone: string; w: any; loading: boolean }) {
  return <section className={"card dcard wxc " + tone}>
    <div className="dhead"><p className="label">{city} <span className={"mini " + tone}>{code}</span></p><span className={"pill " + tone}>{role}</span></div>
    {loading ? <div className="wxbig skeleton">00°C</div> : <div className="wxrow">
      <div><div className="wxbig mono">{fmt(w?.temp_c, "°C")}</div><p className="wxsum">{fmt(w?.summary)}</p></div>
      <span className={"wxic " + tone}><Icon n={wxIcon(w?.code)} s={22} /></span>
    </div>}
    <div className="tiles2">
      <div className="tile plain"><small>Wind</small><b className="mono">{fmt(w?.wind_kmh, " km/h")}</b></div>
      <div className="tile plain"><small>Source</small><b>{w ? (String(w.source).includes("demo") ? "demo data" : w.source) : "offline"}</b></div>
    </div>
    {w?.calm_note && <p className="dnote">{w.calm_note}</p>}
  </section>;
}

/* 4-4-6 breathing: in for 4, hold for 4, out for 6 */
function Breathing({ onClose }: { onClose: () => void }) {
  const [t, setT] = useState(0);
  useEffect(() => { const id = setInterval(() => setT(v => v + 1), 1000); return () => clearInterval(id); }, []);
  const c = t % 14, phase = c < 4 ? "Breathe in" : c < 8 ? "Hold" : "Breathe out";
  const left = c < 4 ? 4 - c : c < 8 ? 8 - c : 14 - c;
  return <div className="modal" onClick={onClose}>
    <div className="card breathCard" onClick={e => e.stopPropagation()}>
      <p className="label">Breathing exercise · 4 · 4 · 6</p>
      <div className={"orbBig " + (c < 4 ? "in" : c < 8 ? "hold" : "out")}><span>{phase}<b className="mono">{left}</b></span></div>
      <p className="sub">Round {Math.floor(t / 14) + 1}. A long out-breath tells your body it is safe.</p>
      <button className="btn" onClick={onClose}>I feel steadier</button>
    </div>
  </div>;
}
