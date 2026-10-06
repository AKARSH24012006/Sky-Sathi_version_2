import { useEffect, useRef, useState } from "react";
import { useApp } from "../store";
import TraceView from "../components/TraceView";
import PromptLab from "../components/PromptLab";
import PipelineEval from "../components/PipelineEval";

const PROMPTS = ["Why is turbulence safe?", "What keeps the plane up?", "Explain the sounds before landing", "Engine ki awaaz kam kyun ho gayi?", "I can't breathe, I'm panicking", "Why do my ears hurt on descent?"];
const VIEWS = [{ id: "chat", label: "Chat" }, { id: "lab", label: "Prompt Lab" }, { id: "pipe", label: "Pipeline & Eval" }];

function Chat() {
  const s = useApp();
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo({ top: 9e6, behavior: "smooth" }); }, [s.msgs, s.thinking]);
  const send = () => { const q = draft.trim(); if (q && !s.thinking) { setDraft(""); s.ask(q); } };
  return <div className="card" style={{ display: "flex", flexDirection: "column", minHeight: "70vh" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div id="orb" className={s.thinking ? "think" : ""} />
      <div style={{ flex: 1 }}>
        <p className="eyebrow">AI Copilot · {s.thinking ? "thinking…" : s.playing ? s.phase.label.toLowerCase() : "watching over you"}</p>
        <p className="sub" style={{ fontSize: 12.5 }}>NLP → ML classifiers → transformer RAG → engineered prompt → LLM → guardrails. Tap “how” under any answer.</p>
      </div>
      <select value={s.prefs.mode} onChange={e => s.setPrefs(p => ({ ...p, mode: e.target.value as any }))}
        style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 10px", fontFamily: "inherit" }}>
        <option value="calm">calm mode</option><option value="educational">educational</option><option value="child">child mode</option>
      </select>
    </div>
    <div className="msgs" ref={ref} style={{ flex: 1, maxHeight: "none", margin: "14px 0" }}>
      {s.msgs.map((m, i) => <div key={i} style={{ display: "flex", flexDirection: "column" }}>
        <div className={`msg ${m.who}`}>{m.text}</div>
        {m.meta && <div className="metaRow">
          <span className={"band " + m.meta.anxiety}>{m.meta.anxiety}</span><span>{m.meta.intent}</span>
          {m.meta.citations.length > 0 && <span>sources: {m.meta.citations.join(", ")}</span>}
          <button onClick={() => setOpen(open === i ? null : i)}>{open === i ? "hide" : "how"}</button>
        </div>}
        {m.meta && open === i && <TraceView trace={m.meta.trace} compact />}
        {m.chips && <div className="chips">{m.chips.filter(c => c.label).map((c, j) =>
          <button key={j} onClick={() => c.q ? s.ask(c.q) : s.say("Good. I'm right here if that changes.")}>{c.label}</button>)}</div>}
      </div>)}
      {s.thinking && <div className="msg a">…</div>}
    </div>
    <div className="chips" style={{ marginBottom: 10 }}>{PROMPTS.map(p => <button key={p} onClick={() => s.ask(p)}>{p}</button>)}</div>
    <div style={{ display: "flex", gap: 8 }}>
      <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && send()}
        placeholder="Ask anything about your flight… (English, Hindi or Hinglish)" aria-label="Ask the copilot"
        style={{ flex: 1, padding: "13px 16px", borderRadius: 14, border: "1px solid var(--line)", background: "var(--surface-2)", color: "var(--text)", fontFamily: "inherit", fontSize: 14, outline: "none" }} />
      <button className="btn" style={{ width: 50, margin: 0, padding: 0 }} onClick={send} aria-label="Send">↑</button>
    </div>
  </div>;
}

export default function Copilot() {
  const [view, setView] = useState("chat");
  return <div style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0,1fr)" }}>
    <div className="seg" role="tablist">{VIEWS.map(v =>
      <button key={v.id} role="tab" aria-selected={view === v.id} className={view === v.id ? "on" : ""} onClick={() => setView(v.id)}>{v.label}</button>)}</div>
    {view === "chat" && <Chat />}
    {view === "lab" && <PromptLab />}
    {view === "pipe" && <PipelineEval />}
  </div>;
}
