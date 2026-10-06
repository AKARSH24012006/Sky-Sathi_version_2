/** Pipeline & Evaluation — the GenAI pipeline as a live diagram you can run,
 *  plus the evaluation report that links generated content to each objective. */
import { useEffect, useState } from "react";
import { api, type GenAIOverview, type EvalReport, type PipelineOut } from "../lib/api";
import TraceView from "./TraceView";

const fmtV = (v: unknown, k = "") => typeof v === "number" ? (v <= 1 && v >= 0 && !/ms|flesch/.test(k) ? `${Math.round(v * 100)}%` : `${v}`) : v === true ? "yes" : v == null ? "—" : String(v);

export default function PipelineEval() {
  const [ov, setOv] = useState<GenAIOverview | null>(null);
  const [rep, setRep] = useState<EvalReport | null>(null);
  const [q, setQ] = useState("bahut hil raha hai, wing toot toh nahi jayega?");
  const [run, setRun] = useState<PipelineOut | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.genaiOverview().then(setOv); api.evalReport().then(setRep); }, []);

  const go = async () => { setBusy(true); setRun(await api.genaiRun(q)); setBusy(false); };
  const active = new Set(run?.trace.map(t => t.stage));

  return <div style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0,1fr)" }}>
    <div className="card">
      <p className="eyebrow">GenAI pipeline · fixed, linear, inspectable</p>
      <h3 style={{ marginTop: 6 }}>From a passenger's words to a grounded, calm answer</h3>
      {ov ? <div className="flow">{ov.stages.map((s, i) => <div key={s.id} className="flowcol">
        <div className={"fstage" + (active.has(s.id) ? " lit" : "")}>
          <span className="fam">{s.family}</span><b>{i + 1}. {s.name}</b><span className="what">{s.what}</span>
        </div>{i < ov.stages.length - 1 && <span className="arrow" aria-hidden>→</span>}</div>)}</div>
        : <p className="sub">Can't reach the API — start it with ./start.sh</p>}
      {ov && <p className="sub" style={{ marginTop: 10, fontSize: 12.5 }}>
        Now running: classifier <b>{ov.classifier}</b> · retriever <b>{ov.retriever}</b> · LLM <b>{ov.llm.configured ? ov.llm.model : "not configured (extractive fallback)"}</b> · {ov.kb_entries} KB entries</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input className="labin" style={{ flex: 1 }} value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && go()} aria-label="Pipeline input" />
        <button className="btn" style={{ width: "auto", margin: 0, padding: "0 18px" }} disabled={busy} onClick={go}>{busy ? "…" : "Run"}</button>
      </div>
      {run && <div style={{ marginTop: 12 }}>
        <p className="ans">{run.reply}</p>
        <TraceView trace={run.trace} />
        <p className="gen">total {run.total_ms} ms · {run.generator}</p>
      </div>}
    </div>

    <div className="card">
      <p className="eyebrow">Generated content × objectives</p>
      <h3 style={{ marginTop: 6 }}>Evaluation report</h3>
      {!rep ? <p className="sub">Computing the report…</p> : <>
        <p className="sub" style={{ fontSize: 12.5 }}>Generated {rep.generated_at} · prompt {rep.prompt_version} · LLM: {rep.llm}</p>
        <div className="objgrid">{Object.entries(rep.objectives).map(([o, ms]) => <div key={o} className="obj">
          <b>{o}</b>{Object.entries(ms).map(([k, v]) => <div key={k} className="kv"><span>{k.replace(/_/g, " ")}</span><span className="mono">{fmtV(v, k)}</span></div>)}
        </div>)}</div>

        <div className="grid2">
          <div className="obj"><b>ML classifiers · {rep.classifier.folds}-fold CV · n={rep.classifier.n_samples}</b>
            {(["anxiety", "intent"] as const).map(t => <div key={t} className="kv"><span>{t}</span>
              <span className="mono">acc {rep.classifier[t].accuracy} · F1 {rep.classifier[t].macro_f1} · baseline {rep.classifier[t].baseline_accuracy}</span></div>)}
            <table className="cm"><thead><tr><th>true ↓ / pred →</th>{rep.classifier.anxiety.labels.map(l => <th key={l}>{l}</th>)}</tr></thead>
              <tbody>{rep.classifier.anxiety.confusion.map((row, i) => <tr key={i}><th>{rep.classifier.anxiety.labels[i]}</th>
                {row.map((v, j) => <td key={j} className={i === j ? "diag" : ""}>{v}</td>)}</tr>)}</tbody></table>
            <p className="gen">anxiety-band confusion matrix</p>
          </div>
          <div className="obj"><b>Retrieval · {rep.retrieval.n} gold questions</b>
            <div className="kv"><span>Hit@1</span><span className="mono">{fmtV(rep.retrieval["hit@1"])}</span></div>
            <div className="kv"><span>Hit@3</span><span className="mono">{fmtV(rep.retrieval["hit@3"])}</span></div>
            <div className="kv"><span>MRR</span><span className="mono">{rep.retrieval.mrr}</span></div>
            <p className="gen">{rep.retrieval.retriever}</p>
            {rep.top_features && <><b style={{ display: "block", marginTop: 10 }}>What the anxiety model learned</b>
              {Object.entries(rep.top_features).map(([c, ws]) => <div key={c} className="kv"><span>{c}</span><span className="mono" style={{ textAlign: "right" }}>{ws.slice(0, 5).join(", ")}</span></div>)}</>}
          </div>
        </div>

        {rep.technique_comparison.length > 0 && <div className="obj" style={{ marginTop: 12 }}><b>Prompt technique comparison (same {rep.retrieval.n} questions)</b>
          {rep.technique_comparison.map(t => <div key={t.technique} className="barrow">
            <span>{t.technique}</span>
            <div className="bar"><i style={{ width: `${t.groundedness * 100}%` }} /></div>
            <span className="mono">grounded {Math.round(t.groundedness * 100)}% · cites {Math.round(t.citation_rate * 100)}% · read {t.flesch}</span>
          </div>)}</div>}
        {rep.technique_comparison.length === 0 && <p className="note">Technique comparison appears after running <span className="mono">python scripts/evaluate.py</span> with an LLM key.</p>}
      </>}
    </div>
  </div>;
}
