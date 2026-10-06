/** Prompt Lab — run one real SkySathi use case through several prompt-engineering
 *  techniques side by side, with the exact prompt sent and per-answer metrics. */
import { useEffect, useState } from "react";
import { api, type GenAIOverview, type LabOut } from "../lib/api";
import { DEMO } from "../lib/demo";

export default function PromptLab() {
  const [ov, setOv] = useState<GenAIOverview | null>(null);
  const [uc, setUc] = useState("turbulence_high");
  const [text, setText] = useState("");
  const [techs, setTechs] = useState<string[]>(["zero_shot", "role", "few_shot", "rag", "production"]);
  const [out, setOut] = useState<LabOut | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { api.genaiOverview().then(o => { setOv(o); if (!o) setErr("Can't reach the API — start it with ./start.sh"); }); }, []);
  const cur = ov?.use_cases.find(u => u.id === uc);
  useEffect(() => { if (cur) setText(cur.input); setOut(null); }, [uc, ov]);

  const run = async () => {
    setBusy(true); setErr("");
    const r = await api.promptLab(uc, techs, text);
    setBusy(false);
    if (r) setOut(r); else setErr("The lab request failed — is the API running?");
  };
  const toggle = (id: string) => setTechs(t => t.includes(id) ? t.filter(x => x !== id) : [...t, id]);

  if (!ov) return <div className="card"><p className="sub">{err || "Loading the lab…"}</p></div>;
  return <div style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0,1fr)" }}>
    <div className="card">
      <p className="eyebrow">Prompt Lab · {ov.prompt_version}</p>
      <h3 style={{ marginTop: 6 }}>Same scenario, different prompts</h3>
      <p className="sub">Pick a real passenger scenario, choose prompt techniques, and compare what the model writes — with the exact prompt shown.</p>
      {!ov.llm.configured && <p className="note">No LLM key is set, so answers below come from the extractive KB fallback. Add an <span className="mono">OPENAI_API_KEY</span> (or any OpenAI-compatible key) to compare real generations.</p>}

      <p className="eyebrow" style={{ marginTop: 14 }}>Use case</p>
      <div className="ucgrid">{ov.use_cases.map(u =>
        <button key={u.id} className={"uc" + (u.id === uc ? " on" : "")} onClick={() => setUc(u.id)}>
          <b>{u.title}</b><span>{u.objective}</span></button>)}</div>

      <p className="eyebrow" style={{ marginTop: 14 }}>Passenger input</p>
      <textarea className="labin" value={text} readOnly={DEMO} onChange={e => setText(e.target.value)} rows={cur?.task === "journal" ? 4 : 2} />

      <p className="eyebrow" style={{ marginTop: 12 }}>Techniques</p>
      <div className="chips">{ov.techniques.map(t =>
        <button key={t.id} title={t.what} className={techs.includes(t.id) ? "sel" : ""} onClick={() => toggle(t.id)}>{t.name}</button>)}</div>
      <button className="btn" disabled={busy || !techs.length} onClick={run}>{busy ? "Generating…" : `Run ${techs.length} technique${techs.length > 1 ? "s" : ""}`}</button>
      {err && <p className="note">{err}</p>}
    </div>

    {out && <div className="labgrid">{out.results.map(r =>
      <div className="card labcard" key={r.technique}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
          <p className="eyebrow">{ov.techniques.find(t => t.id === r.technique)?.name}</p>
          {r.technique === out.use_case.best && <span className="pill">recommended</span>}
        </div>
        {r.json ? <pre className="json">{JSON.stringify(r.json, null, 2)}</pre> : <p className="ans">{r.reply}</p>}
        <div className="metrics">
          <span title="share of answer words supported by retrieved KB">grounded {Math.round(r.metrics.groundedness * 100)}%</span>
          {r.metrics.flesch != null && <span title="Flesch reading ease — higher is easier">readability {r.metrics.flesch}</span>}
          <span>{r.metrics.citations.length ? `cites ${r.metrics.citations.join(", ")}` : "no citations"}</span>
          <span className="mono">{Math.round(r.metrics.ms)} ms</span>
          {r.metrics.flags.filter(f => f !== "json-valid").map(f => <span key={f} className="flag">{f}</span>)}
        </div>
        {r.reasoning && <details><summary>Hidden reasoning (chain-of-thought)</summary><pre>{r.reasoning}</pre></details>}
        <details><summary>Prompt sent · {r.parts.length} parts · ~{r.approx_tokens} tokens · T={r.temperature}</summary>
          <ul className="parts">{r.parts.map(p => <li key={p}>{p}</li>)}</ul>
          {r.messages.map((m, i) => <pre key={i}><b>{m.role}</b>{"\n"}{m.content}</pre>)}
        </details>
        <p className="gen">{r.generator}</p>
      </div>)}</div>}
  </div>;
}
