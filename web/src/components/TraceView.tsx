/** "How this answer was made" — renders the 6-stage GenAI pipeline trace
 *  returned with every Copilot reply (NLP → ML → RAG → prompt → LLM → guardrails). */
import type { TraceStage } from "../lib/api";

const LABEL: Record<string, [string, string]> = {
  nlp: ["NLP", "Preprocess"], ml_classify: ["ML", "Classify"], retrieve: ["Transformer · RAG", "Retrieve"],
  prompt: ["Prompt eng.", "Assemble"], generate: ["GenAI", "Generate"], guardrails: ["Safety", "Guardrails"],
};

const pct = (v?: number) => (typeof v === "number" ? `${Math.round(v * 100)}%` : "—");

function detail(s: TraceStage): string {
  switch (s.stage) {
    case "nlp": return `lang ${s.language}` + (Object.keys(s.entities || {}).length ? ` · ${JSON.stringify(s.entities)}` : "") +
      (s.emergency ? " · emergency rule" : "");
    case "ml_classify": return `anxiety ${s.anxiety} (${pct(s.anxiety_proba?.[s.anxiety])}) · intent ${s.intent} (${pct(s.intent_proba?.[s.intent])})` +
      (s.safety_override ? " · safety override" : "") + ` · ${s.method}`;
    case "retrieve": return (s.hits || []).map((h: any) => `${h.id}` + (h.bm25 == null ? " (panic rule)" : h.cosine != null ? ` cos ${h.cosine}` : ` bm25 ${h.bm25}`)).join(" · ") +
      ` — ${s.retriever}`;
    case "prompt": return `${s.technique} · ${(s.parts || []).length} parts · ~${s.approx_tokens} tok · T=${s.temperature}`;
    case "generate": return s.generator + (s.usage?.total_tokens ? ` · ${s.usage.total_tokens} tok` : "");
    case "guardrails": return (s.citations?.length ? `cites [${s.citations.join("] [")}]` : "no citations") +
      (s.flags?.length ? ` · ${s.flags.join(", ")}` : " · clean");
    default: return "";
  }
}

export default function TraceView({ trace, compact = false }: { trace: TraceStage[]; compact?: boolean }) {
  return <ol className={"trace" + (compact ? " compact" : "")}>
    {trace.map(s => <li key={s.stage}>
      <span className="fam">{LABEL[s.stage]?.[0] ?? s.stage}</span>
      <b>{LABEL[s.stage]?.[1] ?? s.stage}</b>
      <span className="det">{detail(s)}</span>
      <span className="ms mono">{s.ms < 1 ? "<1" : Math.round(s.ms)} ms</span>
    </li>)}
  </ol>;
}
