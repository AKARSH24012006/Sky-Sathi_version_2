/** Backend client. Bootstraps a guest session automatically (no login screen),
 *  retries once on 401, and every fetch degrades to null instead of throwing
 *  into the UI. fmt() guarantees the interface never renders undefined/NaN. */
import { demoAnswer } from "./demo";

let token: string | null = null;
let bootstrapping: Promise<void> | null = null;

async function guestLogin(): Promise<void> {
  const r = await fetch("/api/auth/guest", { method: "POST" });
  if (r.ok) token = (await r.json()).access;
}
function ensureAuth(): Promise<void> {
  if (token) return Promise.resolve();
  if (!bootstrapping) bootstrapping = guestLogin().finally(() => { bootstrapping = null; });
  return bootstrapping;
}

async function call<T>(path: string, init?: RequestInit, authed = false): Promise<T | null> {
  try {
    if (authed) await ensureAuth();
    const headers: Record<string, string> = { "content-type": "application/json", ...(init?.headers as any) };
    if (authed && token) headers.authorization = `Bearer ${token}`;
    let r = await fetch("/api" + path, { ...init, headers });
    if (r.status === 401 && authed) {           // token expired -> one silent re-auth
      token = null; await ensureAuth();
      if (token) headers.authorization = `Bearer ${token}`;
      r = await fetch("/api" + path, { ...init, headers });
    }
    if (!r.ok) return (await demoAnswer(path, init)) as T | null;
    return (await r.json()) as T;
  } catch {
    return (await demoAnswer(path, init)) as T | null;
  }
}

export type Weather = { iata: string; temp_c: number; summary: string; wind_kmh: number; code: number; calm_note: string; source: string };
export type LiveFlight = { flight_no: string; status: string; gate: string; depart: string; arrive: string; aircraft: string; source: string };
export type Position = { callsign: string; found: boolean; lat?: number; lon?: number; alt_ft?: number; gspd_kt?: number; heading?: number; source: string };
export type Track = { flight_no: string; airline: string | null; status: LiveFlight; position: Position };

export type KbEntry = { id: string; text: string; calm: string; tags: string };
export type Amenity = { kind: string; name: string; walk_min: number; near: string };

export const api = {
  kb: () => call<{ version: string; entries: KbEntry[] }>(`/conversations/kb/bundle`),
  amenities: (iata: string) => call<Amenity[]>(`/airports/${iata}/amenities`),
  weather: (iata: string) => call<Weather>(`/weather/${iata}`),
  liveFlight: (no: string) => call<LiveFlight>(`/flights/live/${no}`),
  position: (cs: string) => call<Position>(`/flights/position/${cs}`),
  track: (no: string) => call<Track>(`/flights/track/${encodeURIComponent(no)}`),
  chat: (text: string, mode = "calm", live: Record<string, unknown> = {}, anxiety = "auto") =>
    call<ChatOut>(`/conversations/chat`,
      { method: "POST", body: JSON.stringify({ text, mode, anxiety_band: anxiety, live }) }, true),
  // GenAI Lab — no auth/DB needed
  genaiOverview: () => call<GenAIOverview>(`/genai/overview`),
  genaiRun: (text: string, mode = "calm", technique = "production", live: Record<string, unknown> = {}) =>
    call<PipelineOut>(`/genai/run`, { method: "POST", body: JSON.stringify({ text, mode, technique, live }) }),
  promptLab: (use_case: string, techniques: string[], text?: string) =>
    call<LabOut>(`/genai/prompt-lab`, { method: "POST", body: JSON.stringify({ use_case, techniques, text }) }),
  evalReport: () => call<EvalReport>(`/genai/eval`),
  navigate: (route: Record<string, unknown>) => call<any>(`/genai/navigate`, { method: "POST", body: JSON.stringify({ route }) }),
  arrival: (plan: Record<string, unknown>) => call<any>(`/genai/arrival`, { method: "POST", body: JSON.stringify({ plan }) }),
};

/* ---- GenAI pipeline types ---- */
export type TraceStage = { stage: string; ms: number; [k: string]: any };
export type ChatOut = { conversation_id: string; reply: string; citations: string[]; anxiety: string; intent: string;
  generator: string; total_ms: number; trace: TraceStage[] };
export type PipelineOut = ChatOut & { language: string; messages: { role: string; content: string }[]; json: any; reasoning: string };
export type Stage = { id: string; name: string; family: string; what: string };
export type Technique = { id: string; name: string; what: string };
export type UseCase = { id: string; title: string; input: string; mode: string; task: string; objective: string; best: string; live: Record<string, unknown> };
export type GenAIOverview = { stages: Stage[]; techniques: Technique[]; use_cases: UseCase[];
  llm: { configured: boolean; model: string }; retriever: string; classifier: string; prompt_version: string; kb_entries: number };
export type LabResult = { technique: string; reply: string; json: any; reasoning: string; messages: { role: string; content: string }[];
  parts: string[]; temperature: number; approx_tokens: number; generator: string;
  metrics: { groundedness: number; flesch: number | null; citations: string[]; flags: string[]; ms: number } };
export type LabOut = { use_case: UseCase; input: string; results: LabResult[] };
export type EvalReport = { generated_at: string; llm: string; prompt_version: string;
  objectives: Record<string, Record<string, number | boolean | null>>;
  classifier: { n_samples: number; folds: number; anxiety: ClsM; intent: ClsM };
  retrieval: { n: number; "hit@1": number; "hit@3": number; mrr: number; retriever: string };
  generation: { generator: string; rows: { q: string; answer: string; grounded: number; flesch: number }[] };
  technique_comparison: { technique: string; groundedness: number; citation_rate: number; flesch: number; within_sentence_cap: number; unsafe_rate: number; latency_ms_p50: number }[];
  top_features: Record<string, string[]> };
type ClsM = { accuracy: number; macro_f1: number; baseline_accuracy: number; labels: string[]; confusion: number[][]; per_class_recall: Record<string, number> };

/** Safe formatter: the UI never shows undefined / null / NaN — always an em dash. */
export const fmt = (v: unknown, suffix = ""): string =>
  v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v)) ? "—" : `${v}${suffix}`;
