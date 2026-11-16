/** Delay Intelligence — our ML course projects living inside SkySathi.
 *  PBL-1 regression + classification · PBL-2 K-Means profiles + HMM "delay ripple"
 *  · PBL-3 bagging / boosting / voting / stacking committee. The GenAI copilot then
 *  explains the forecast calmly (the forecast is passed in as live context). */
import { useEffect, useMemo, useState } from "react";
import { delayml, where, type Overview, type Prediction, type Query, type Ripple } from "../lib/delayml";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const BAND_C: Record<string, string> = { low: "var(--sage)", moderate: "var(--sky)", elevated: "var(--amber)" };
const BAND_T: Record<string, string> = { low: "Likely on time", moderate: "Some chance of a delay", elevated: "A delay is likely" };
const STATE_C = ["var(--sage)", "var(--sky)", "var(--amber)"];
const LEVEL_T = ["on time", "some late", "many late"];
const NAME: Record<string, string> = { logreg: "Logistic Regression", tree: "Decision Tree", random_forest: "Random Forest", bagging: "Bagging",
  extra_trees: "Extra Trees", boosting: "Gradient Boosting", voting: "Soft Voting", stacking: "Stacking" };
const FAM: Record<string, string> = { logreg: "PBL-1", tree: "PBL-1", random_forest: "PBL-1", bagging: "PBL-3", extra_trees: "PBL-3",
  boosting: "PBL-3", voting: "PBL-3", stacking: "PBL-3" };
const KB_DELAYS = "Most delays come from the schedule rather than the aircraft — a late incoming plane, a busy hour at the airport, or weather elsewhere ripples through the day. A delay is not a sign that your aircraft is unsafe.";
const hh = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
const pct = (v: number) => `${Math.round(v * 100)}%`;

function Gauge({ p, band }: { p: number; band: string }) {
  const a = Math.PI * (1 - p), r = 70, cx = 90, cy = 86;
  return <svg viewBox="0 0 180 100" style={{ width: "100%", maxWidth: 260 }} role="img" aria-label={`Delay chance ${pct(p)}`}>
    <path d={`M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}`} fill="none" stroke="var(--line)" strokeWidth="12" strokeLinecap="round" />
    <path d={`M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r * Math.cos(a)},${cy - r * Math.sin(a)}`} fill="none" stroke={BAND_C[band]} strokeWidth="12" strokeLinecap="round" />
    <text x={cx} y={cy - 14} textAnchor="middle" fontSize="30" fontWeight="700" fill="var(--text)">{pct(p)}</text>
    <text x={cx} y={cy + 2} textAnchor="middle" fontSize="9.5" fill="var(--text-2)">chance of 15+ min late</text>
  </svg>;
}

function RippleChart({ r }: { r: Ripple }) {
  const W = 340, H = 110, n = r.posterior.length, w = W / Math.max(n, 1);
  return <svg viewBox={`0 0 ${W} ${H + 18}`} style={{ width: "100%" }} role="img" aria-label="Hidden congestion state by hour">
    {r.posterior.map((col, i) => { let y = 0; return col.map((p, s) => { const h = p * H; const el = <rect key={`${i}-${s}`} x={i * w + 1} y={y} width={w - 2} height={h} rx="2" fill={STATE_C[s]} opacity={0.85} />; y += h; return el; }); })}
    {r.hours.map((h, i) => (i % 2 === 0 || n < 9) && <text key={h} x={i * w + w / 2} y={H + 13} textAnchor="middle" fontSize="9" fill="var(--text-2)">{h}</text>)}
  </svg>;
}

export default function Delays() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [q, setQ] = useState<Query>({ airline: "WN", origin: "DEN", dest: "LAS", dep_hour: 17.5, day_of_week: 5 });
  const [live, setLive] = useState({ live_origin_delay: 0, live_airline_delay: 0, live_dest_delay: 0 });
  const [touched, setTouched] = useState(false);
  const [pred, setPred] = useState<Prediction | null>(null);
  const [levels, setLevels] = useState<number[]>([]);
  const [rip, setRip] = useState<Ripple | null>(null);
  const [ex, setEx] = useState<{ text: string; gen: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [rep, setRep] = useState(false);

  useEffect(() => { delayml.overview().then(setOv); }, []);
  const dests = useMemo(() => ov ? Object.keys(ov.routes).filter(k => k.startsWith(q.origin + "-")).map(k => k.split("-")[1]).sort() : [], [ov, q.origin]);
  const route = ov?.routes[`${q.origin}-${q.dest}`];
  const airlines = route?.airlines ?? [];

  // keep the selection valid as the route changes
  useEffect(() => { if (ov && dests.length && !dests.includes(q.dest)) setQ(v => ({ ...v, dest: dests[0] })); }, [ov, dests]);
  useEffect(() => { if (airlines.length && !airlines.includes(q.airline)) setQ(v => ({ ...v, airline: airlines[0] })); }, [route]);
  // live sliders start at what's typical for this airport/airline/hour (from training data)
  useEffect(() => { if (!touched) delayml.typicalLive(q).then(d => setLive({ live_origin_delay: Math.round(d.live_origin_delay), live_airline_delay: Math.round(d.live_airline_delay), live_dest_delay: Math.round(d.live_dest_delay) })); }, [q, touched]);
  useEffect(() => { if (!ov) return; const t = setTimeout(() => delayml.predict({ ...q, ...live }).then(setPred), 120); return () => clearTimeout(t); }, [ov, q, live]);
  useEffect(() => { if (ov) setLevels(ov.hmm.typical_day[q.airline] ?? ov.hmm.hours.map(() => 0)); }, [ov, q.airline]);
  const upto = ov ? Math.max(1, ov.hmm.hours.filter(h => h <= Math.floor(q.dep_hour)).length) : 1;
  useEffect(() => { if (levels.length) delayml.ripple(levels.slice(0, upto)).then(setRip); }, [levels, upto]);
  useEffect(() => setEx(null), [q, live]);

  const explain = async () => {
    setBusy(true);
    const r = await delayml.explain({ ...q, ...live }, "Will my flight be delayed? I'm a bit worried about it.");
    setEx(r ? { text: r.reply, gen: r.generator } : { text: `${pred?.summary ?? ""} ${KB_DELAYS}`, gen: "offline · forecast + knowledge base (backend asleep)" });
    setBusy(false);
  };

  if (!ov) return <div className="card skeleton" style={{ height: 320 }} />;
  const sel = (label: string, value: string | number, opts: [string | number, string][], on: (v: string) => void) =>
    <label className="dl-field"><span>{label}</span><select value={value} onChange={e => on(e.target.value)}>{opts.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>;
  const slider = (k: keyof typeof live, label: string) =>
    <label className="dl-slide"><span>{label}<b className="mono">{live[k]} min</b></span>
      <input type="range" min={0} max={120} value={live[k]} onChange={e => { setTouched(true); setLive(v => ({ ...v, [k]: +e.target.value })); }} /></label>;
  const cls = ov.metrics.classification, best = cls[0];

  return <div style={{ display: "grid", gap: 14 }}>
    <div className="card">
      <p className="eyebrow">Delay Intelligence · ML course projects PBL-1 · PBL-2 · PBL-3</p>
      <h3 style={{ marginTop: 6 }}>Will my flight be late? Eight models answer, then SkySathi explains it calmly</h3>
      <p className="sub" style={{ marginTop: 6 }}>Trained on {ov.dataset.rows_used.toLocaleString()} real flights ({ov.dataset.name}, {ov.dataset.period}). Indian airlines don't publish per-flight delay data, so the routes here are US ones — the method is what carries over.
        <span className="pill" style={{ marginLeft: 8 }}>{where() === "backend" ? "running on the API" : "running in your browser"}</span></p>
    </div>

    <div className="card">
      <p className="eyebrow">Your flight</p>
      <div className="dl-form">
        {sel("From", q.origin, ov.airports.filter(a => Object.keys(ov.routes).some(k => k.startsWith(a + "-"))).map(a => [a, a]), v => { setTouched(false); setQ(x => ({ ...x, origin: v })); })}
        {sel("To", q.dest, dests.map(a => [a, a]), v => { setTouched(false); setQ(x => ({ ...x, dest: v })); })}
        {sel("Airline", q.airline, airlines.map(a => [a, `${ov.airlines[a]?.name ?? a} (${a})`]), v => { setTouched(false); setQ(x => ({ ...x, airline: v })); })}
        {sel("Day", q.day_of_week, DOW.map((d, i) => [i + 1, d]), v => setQ(x => ({ ...x, day_of_week: +v })))}
        <label className="dl-field"><span>Departs <b className="mono">{hh(q.dep_hour)}</b></span>
          <input type="range" min={5} max={23.5} step={0.25} value={q.dep_hour} onChange={e => { setTouched(false); setQ(x => ({ ...x, dep_hour: +e.target.value })); }} /></label>
      </div>
      <p className="sub" style={{ marginTop: 12, fontSize: 12.5 }}>Live right now (what you can see on the departures board 2–3 hours before your flight). Starts at what's typical for this hour{touched && <> · <button className="linkbtn" onClick={() => setTouched(false)}>reset to typical</button></>}</p>
      <div className="dl-form">
        {slider("live_origin_delay", `${q.origin} departures running late by`)}
        {slider("live_airline_delay", `${ov.airlines[q.airline]?.name ?? q.airline} running late by`)}
        {slider("live_dest_delay", `${q.dest} departures running late by`)}
      </div>
      {route && <p className="gen">{route.dist.toLocaleString()} mi · scheduled {Math.round(route.mins)} min block time</p>}
    </div>

    {pred && <div className="grid2" style={{ marginTop: 0 }}>
      <div className="card dl-hero">
        <Gauge p={pred.probability} band={pred.band} />
        <b style={{ color: BAND_C[pred.band], fontSize: 17 }}>{BAND_T[pred.band]}</b>
        <p className="sub">Expected arrival delay ≈ <b>{Math.round(pred.expected_delay_min)} min</b> · usual for all flights {pct(pred.prior)}</p>
        <p className="sub" style={{ fontSize: 12.5 }}>{pred.summary}</p>
        <button className="btn" style={{ marginTop: 10 }} disabled={busy} onClick={explain}>{busy ? "Thinking…" : "Ask SkySathi to explain this calmly"}</button>
        {ex && <div style={{ marginTop: 10, textAlign: "left" }}><p className="ans">{ex.text}</p><p className="gen">{ex.gen} · forecast passed to the GenAI pipeline as live context</p></div>}
      </div>

      <div className="card">
        <p className="eyebrow">PBL-3 · the model committee</p>
        <p className="sub" style={{ fontSize: 12.5, marginBottom: 6 }}>{pred.committee.filter(c => c.says_late).length} of {pred.committee.length} lean "late". Each tick is that model's own decision line (tuned on validation days).</p>
        {pred.committee.slice().sort((a, b) => b.p - a.p).map(c => <div key={c.id} className="dl-crow">
          <span><b>{NAME[c.id]}</b> <i className="dl-tag">{FAM[c.id]}</i></span>
          <div className="dl-track"><i style={{ width: pct(c.p), background: c.says_late ? "var(--amber)" : "var(--sage)" }} /><em style={{ left: pct(ov.thresholds[c.id] ?? 0.5) }} /></div>
          <span className="mono">{pct(c.p)}</span>
        </div>)}
        <p className="eyebrow" style={{ marginTop: 14 }}>PBL-1 · how many minutes (regression)</p>
        {Object.entries(pred.regression).map(([k, v]) => <div key={k} className="kv"><span>{k === "linear" ? "Linear Regression" : NAME[k]}</span><span className="mono">{Math.round(v)} min</span></div>)}
      </div>
    </div>}

    {pred && <div className="grid2" style={{ marginTop: 0 }}>
      <div className="card">
        <p className="eyebrow">PBL-2 · flight profile (K-Means, k = {ov.clusters.k})</p>
        <p className="sub" style={{ fontSize: 12.5 }}>Flights grouped by departure time, distance and how busy the airport and airline are. Yours is closest to:</p>
        {ov.clusters.profiles.map(c => <div key={c.id} className={"dl-prof" + (c.id === pred.cluster.id ? " on" : "")}>
          <b>{c.name}</b><span>{c.detail}</span>
          <span className="mono">{pct(c.share)} of flights · {pct(c.test_delay_rate)} were late</span>
        </div>)}
      </div>
      <div className="card">
        <p className="eyebrow">PBL-2 · delay ripple (Hidden Markov Model)</p>
        <p className="sub" style={{ fontSize: 12.5 }}>How {ov.airlines[q.airline]?.name ?? q.airline}'s day has gone, hour by hour, up to your departure. Tap an hour to change it; the HMM infers the hidden state of the network.</p>
        <div className="dl-hours">{ov.hmm.hours.slice(0, upto).map((h, i) => <button key={h} title={`${h}:00 · ${LEVEL_T[levels[i] ?? 0]}`} style={{ background: STATE_C[levels[i] ?? 0] }}
          onClick={() => setLevels(l => l.map((v, j) => j === i ? (v + 1) % 3 : v))}>{h}</button>)}</div>
        {rip && <>
          <RippleChart r={rip} />
          <div className="dl-legend">{rip.states.map((s, i) => <span key={s}><i style={{ background: STATE_C[i] }} />{s}</span>)}</div>
          <p className="sub" style={{ fontSize: 13 }}>Network now: <b>{rip.now}</b> · chance the next hour ({rip.next_hour}:00) has late departures: <b>{pct(rip.p_next_late)}</b></p>
        </>}
      </div>
    </div>}

    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div><p className="eyebrow">Model report · test days {ov.dataset.split.split("test ")[1]}</p>
          <h3 style={{ marginTop: 4, fontSize: 16 }}>Best: {best.name} · ROC-AUC {best.roc_auc}</h3></div>
        <button className="btn gearbtn" onClick={() => setRep(o => !o)}>{rep ? "Hide" : "Show all"}</button></div>
      {rep && <>
        <p className="sub" style={{ fontSize: 12.5, marginTop: 6 }}>{ov.dataset.split}. Target: {ov.dataset.target}; {pct(ov.dataset.delayed_share)} of training flights were late.</p>
        <div style={{ overflowX: "auto" }}><table className="cm dl-table"><thead><tr><th>Model</th><th>Project</th><th>ROC-AUC</th><th>F1</th><th>Precision</th><th>Recall</th></tr></thead>
          <tbody>{cls.map(r => <tr key={r.id}><th>{r.name}</th><td>{r.family}</td><td className={r.id === best.id ? "diag" : ""}>{r.roc_auc}</td><td>{r.f1}</td><td>{r.precision}</td><td>{r.recall}</td></tr>)}</tbody></table></div>
        <div className="grid2">
          <div className="obj"><b>PBL-1 regression · arrival delay minutes</b>
            {ov.metrics.regression.map(r => <div key={r.id} className="kv"><span>{r.name}</span><span className="mono">MAE {r.mae} · RMSE {r.rmse} · R² {r.r2}</span></div>)}</div>
          <div className="obj"><b>PBL-3 finding · live features</b>
            <div className="barrow"><span>without</span><div className="bar"><i style={{ width: `${(ov.metrics.ablation_live_features.without_live - 0.5) * 200}%` }} /></div><span className="mono">AUC {ov.metrics.ablation_live_features.without_live}</span></div>
            <div className="barrow"><span>with live</span><div className="bar"><i style={{ width: `${(ov.metrics.ablation_live_features.with_live - 0.5) * 200}%` }} /></div><span className="mono">AUC {ov.metrics.ablation_live_features.with_live}</span></div>
            <p className="gen">How late things were 2–3 h before departure is known at check-in — no future data.</p></div>
          <div className="obj"><b>What drives the forecast (permutation importance)</b>
            {ov.metrics.importance.slice(0, 6).map(r => <div key={r.feature} className="kv"><span>{r.label}</span><span className="mono">−{r.drop_auc} AUC</span></div>)}</div>
          <div className="obj"><b>PBL-2 · clustering & HMM</b>
            {Object.entries(ov.clusters.silhouette_by_k).map(([k, v]) => <div key={k} className="kv"><span>K-Means silhouette, k = {k}</span><span className="mono">{v}</span></div>)}
            <div className="kv"><span>HMM next-hour ROC-AUC</span><span className="mono">{ov.hmm.metrics.next_hour_auc}</span></div>
            <div className="kv"><span>HMM accuracy vs "same as last hour"</span><span className="mono">{ov.hmm.metrics.next_hour_accuracy} vs {ov.hmm.metrics.persistence_accuracy}</span></div>
            <p className="gen">{ov.hmm.metrics.train_sequences} airline-days to train, {ov.hmm.metrics.test_sequences} to test. Baseline: assume the next hour looks like this one.</p></div>
        </div>
      </>}
    </div>
  </div>;
}
