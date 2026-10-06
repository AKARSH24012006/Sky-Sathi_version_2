/** Static preview mode (VITE_DEMO=1 builds only). When there is no backend, API calls are
 *  answered from demoData.json — outputs pre-computed by the real Python pipeline in offline
 *  mode (no LLM key), so the preview shows genuine classifier, retrieval and prompt data. */
export const DEMO = import.meta.env.VITE_DEMO === "1";

let data: any = null;
async function load() {
  if (!data) data = (await import("./demoData.json")).default;
  return data;
}

const notCovered = (text: string) => ({
  conversation_id: "preview", reply: "This preview has answers ready for the suggested questions. Run the app locally (./start.sh) to ask anything.",
  citations: [], anxiety: "calm", intent: "explain", generator: "preview", total_ms: 0, trace: [], language: "en",
  json: null, reasoning: "", input: text,
});

export async function demoAnswer(path: string, init?: RequestInit): Promise<any> {
  if (!DEMO) return null;
  const d = await load();
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  if (path.startsWith("/genai/overview")) return d.overview;
  if (path.startsWith("/genai/eval")) return d.eval;
  if (path.startsWith("/conversations/kb/bundle")) return d.kb;
  if (path.startsWith("/auth/guest")) return { access: "preview" };
  // labelled demo data from the backend's own offline fallbacks
  if (path.startsWith("/weather/DEL")) return d.wx_DEL ?? null;
  if (path.startsWith("/weather/BLR")) return d.wx_BLR ?? null;
  if (path.startsWith("/flights/live/")) return d.flight ?? null;
  if (path.includes("/amenities")) return d.amen ?? null;
  if (path.startsWith("/genai/prompt-lab")) {
    const lab = d.lab[body.use_case];
    if (!lab) return null;
    return { ...lab, results: lab.results.filter((r: any) => (body.techniques || []).includes(r.technique)) };
  }
  if (path.startsWith("/genai/run") || path.startsWith("/conversations/chat")) {
    const key = `${body.mode || "calm"}|${String(body.text || "").toLowerCase().trim()}`;
    const r = d.runs[key] || d.runs[`calm|${String(body.text || "").toLowerCase().trim()}`];
    return r ? { conversation_id: "preview", ...r } : notCovered(body.text);
  }
  return null;
}
