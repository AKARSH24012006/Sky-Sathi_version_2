/** Delay Intelligence client — the ML course models (PBL-1, PBL-2, PBL-3).
 *  Asks the backend first; if it's asleep or offline, runs the very same exported
 *  models in the browser (public/delay_models.json), so numbers are identical. */

export type Committee = { id: string; p: number; says_late: boolean };
export type Profile = { id: number; name: string; detail: string; test_delay_rate: number; share: number; centroid: Record<string, number> };
export type Prediction = {
  inputs: Record<string, number>; probability: number; band: "low" | "moderate" | "elevated"; expected_delay_min: number;
  committee: Committee[]; regression: Record<string, number>; cluster: Profile & { distance: number[] }; prior: number; summary: string;
};
export type Ripple = { hours: number[]; states: string[]; posterior: number[][]; now: string; next_state: number[]; next_obs: number[]; p_next_late: number; next_hour: number };
export type ClsRow = { id: string; name: string; family: string; roc_auc: number; f1: number; accuracy: number; precision: number; recall: number; threshold: number };
export type RegRow = { id: string; name: string; mae: number; rmse: number; r2: number };
export type Overview = {
  version: string; trained_at: string; feature_labels: Record<string, string>; thresholds: Record<string, number>;
  dataset: { name: string; period: string; rows_total: number; rows_used: number; train: number; valid: number; test: number; split: string; target: string; delayed_share: number };
  metrics: { classification: ClsRow[]; regression: RegRow[]; ablation_live_features: { without_live: number; with_live: number };
    importance: { feature: string; label: string; drop_auc: number }[] };
  clusters: { profiles: Profile[]; silhouette_by_k: Record<string, number>; k: number; features: string[] };
  hmm: { hours: number[]; states: string[]; obs_levels: string[]; trans: number[][]; emit: number[][];
    metrics: { next_hour_auc: number; next_hour_accuracy: number; persistence_accuracy: number; train_sequences: number; test_sequences: number };
    typical_day: Record<string, number[]> };
  airlines: Record<string, { name: string; rate: number }>; airports: string[];
  routes: Record<string, { dist: number; mins: number; airlines: string[] }>;
};
export type Query = { airline: string; origin: string; dest: string; dep_hour: number; day_of_week: number;
  live_origin_delay?: number | null; live_airline_delay?: number | null; live_dest_delay?: number | null };

type Tree = { l: number[]; r: number[]; f: number[]; t: number[]; v: number[] };
type Model = { type: "logreg"; coef: number[]; intercept: number } | { type: "linreg"; coef: number[]; intercept: number } | { type: "forest"; trees: Tree[] } | { type: "hgb"; baseline: number; trees: Tree[] };

let M: any = null;
let source: "backend" | "browser" | null = null;
export const where = () => source;

async function local() {
  if (!M) M = await (await fetch("/delay_models.json")).json();
  return M;
}
async function backend<T>(path: string, body?: unknown): Promise<T | null> {
  try {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 9000);
    const r = await fetch("/api/delayml" + path, body === undefined ? { signal: ctl.signal } :
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
    clearTimeout(to);
    if (!r.ok || !(r.headers.get("content-type") || "").includes("json")) return null;
    return await r.json();
  } catch { return null; }
}

/* ---------- the same evaluator as api/app/delayml/engine.py ---------- */
const sig = (z: number) => 1 / (1 + Math.exp(-z));
function tree(t: Tree, x: number[]) { let n = 0; while (t.l[n] !== -1) n = x[t.f[n]] <= t.t[n] ? t.l[n] : t.r[n]; return t.v[n]; }
function evalM(m: Model, xs: number[], x: number[]) {
  if (m.type === "logreg" || m.type === "linreg") { const z = m.coef.reduce((a, c, i) => a + c * xs[i], m.intercept); return m.type === "logreg" ? sig(z) : z; }
  if (m.type === "forest") { const x32 = x.map(Math.fround); return m.trees.reduce((a, t) => a + tree(t, x32), 0) / m.trees.length; }
  return sig(m.baseline + m.trees.reduce((a: number, t: Tree) => a + tree(t, x), 0));
}
const logit = (p: number) => { const q = Math.min(Math.max(p, 1e-4), 1 - 1e-4); return Math.log(q / (1 - q)); };

export function defaultsFrom(m: any, q: Pick<Query, "airline" | "origin" | "dest" | "dep_hour">) {
  const lk = m.lookups, h = Math.floor(q.dep_hour), route = lk.routes[`${q.origin}-${q.dest}`];
  return {
    distance_mi: route ? route.dist : 800, sched_minutes: route ? route.mins : 150,
    live_origin_delay: lk.typical_live_origin[`${q.origin}|${h}`] ?? lk.fill.live_origin_delay,
    live_airline_delay: lk.typical_live_airline[`${q.airline}|${h}`] ?? lk.fill.live_airline_delay,
    live_dest_delay: lk.typical_live_origin[`${q.dest}|${h}`] ?? lk.fill.live_dest_delay,
  };
}
const clip = (v: number) => Math.min(Math.max(v, 0), 240);

function predictLocal(m: any, q: Query): Prediction {
  const lk = m.lookups, d = defaultsFrom(m, q);
  const pick = (k: "live_origin_delay" | "live_airline_delay" | "live_dest_delay") => q[k] ?? d[k];
  const vals: Record<string, number> = {
    dep_hour: q.dep_hour, day_of_week: q.day_of_week, distance_mi: d.distance_mi, sched_minutes: d.sched_minutes,
    airline_rate: lk.airlines[q.airline]?.rate ?? lk.prior, origin_rate: lk.airport_rate[q.origin] ?? lk.prior,
    dest_rate: lk.airport_rate[q.dest] ?? lk.prior,
    live_origin_delay: clip(pick("live_origin_delay")), live_airline_delay: clip(pick("live_airline_delay")), live_dest_delay: clip(pick("live_dest_delay")),
  };
  const x: number[] = m.features.map((f: string) => vals[f]);
  const xs = x.map((v, i) => (v - m.scaler.mean[i]) / m.scaler.std[i]);
  const probs: Record<string, number> = {};
  for (const [k, mod] of Object.entries(m.classifiers)) probs[k] = evalM(mod as Model, xs, x);
  const e = m.ensemble;
  probs.voting = e.base.reduce((a: number, k: string, i: number) => a + probs[k] * e.voting_weights[i], 0) / e.voting_weights.reduce((a: number, b: number) => a + b, 0);
  probs.stacking = sig(e.base.reduce((a: number, k: string, i: number) => a + e.stacking.coef[i] * logit(probs[k]), e.stacking.intercept));
  const regression: Record<string, number> = {};
  for (const [k, mod] of Object.entries(m.regressors)) regression[k] = Math.round(Math.min(Math.max(evalM(mod as Model, xs, x), 0), 180) * 10) / 10;
  const C = m.clusters;
  const cx = C.features.map((f: string, i: number) => (x[m.features.indexOf(f)] - C.mean[i]) / C.std[i]);
  const dist = C.centers_scaled.map((c: number[]) => c.reduce((a, v, i) => a + (cx[i] - v) ** 2, 0));
  const cl = dist.indexOf(Math.min(...dist));
  const p = probs.stacking;
  const out: Omit<Prediction, "summary"> = {
    inputs: Object.fromEntries(m.features.map((f: string, i: number) => [f, Math.round(x[i] * 1000) / 1000])),
    probability: Math.round(p * 1e4) / 1e4, band: p < 0.25 ? "low" : p < 0.45 ? "moderate" : "elevated",
    expected_delay_min: regression.random_forest,
    committee: Object.entries(probs).map(([id, v]) => ({ id, p: Math.round(v * 1e4) / 1e4, says_late: v >= (m.thresholds[id] ?? 0.5) })),
    regression, cluster: { ...C.profiles[cl], distance: dist }, prior: m.dataset.delayed_share,
  };
  return { ...out, summary: summary(out) };
}

export function summary(p: Omit<Prediction, "summary">) {
  const pct = Math.round(p.probability * 100), base = Math.round(p.prior * 100);
  const rel = Math.abs(pct - base) < 5 ? "about the same as" : pct < base ? "lower than" : "higher than";
  const late = p.committee.filter(c => c.says_late).length;
  return `${pct}% chance of arriving 15+ minutes late (${rel} the usual ${base}%). Expected delay about ${Math.round(p.expected_delay_min)} min. ` +
    `${late} of ${p.committee.length} models lean 'late'. Profile: ${p.cluster.name}.`;
}

function rippleLocal(m: any, levels: number[]): Ripple {
  const H = m.hmm, S = H.states.length;
  const lv = levels.slice(0, H.hours.length).map(v => Math.min(Math.max(Math.round(v), 0), 2));
  const norm = (a: number[]) => { const s = a.reduce((x, y) => x + y, 0); return a.map(v => v / s); };
  const step = (a: number[]) => Array.from({ length: S }, (_, j) => a.reduce((acc, v, i) => acc + v * H.trans[i][j], 0));
  let a = norm(H.start.map((p: number, i: number) => p * H.emit[i][lv[0] ?? 0]));
  const post = [a];
  for (const o of lv.slice(1)) { a = norm(step(a).map((v, i) => v * H.emit[i][o])); post.push(a); }
  const ns = step(a), no = [0, 1, 2].map(o => ns.reduce((acc, v, i) => acc + v * H.emit[i][o], 0));
  const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
  return { hours: H.hours.slice(0, lv.length), states: H.states, posterior: post.map(r => r.map(r4)),
    now: H.states[a.indexOf(Math.max(...a))], next_state: ns.map(r4), next_obs: no.map(r4), p_next_late: r4(no[1] + no[2]),
    next_hour: H.hours[Math.min(lv.length, H.hours.length - 1)] };
}

export const delayml = {
  async overview(): Promise<Overview> {
    const b = await backend<Overview>("/overview");
    if (b) { source = "backend"; return b; }
    source = "browser";
    const m = await local(), lk = m.lookups;
    return { version: m.version, trained_at: m.trained_at, dataset: m.dataset, feature_labels: m.feature_labels, metrics: m.metrics,
      thresholds: m.thresholds, clusters: m.clusters, hmm: m.hmm, airlines: lk.airlines, airports: Object.keys(lk.airport_rate).sort(), routes: lk.routes };
  },
  async predict(q: Query): Promise<Prediction> {
    if (source !== "browser") { const b = await backend<Prediction>("/predict", q); if (b) return b; source = "browser"; }
    return predictLocal(await local(), q);
  },
  async ripple(levels: number[]): Promise<Ripple> {
    if (source !== "browser") { const b = await backend<Ripple>("/ripple", { levels }); if (b) return b; source = "browser"; }
    return rippleLocal(await local(), levels);
  },
  async explain(q: Query, question: string): Promise<{ reply: string; generator: string; citations: string[] } | null> {
    return source === "browser" ? null : backend("/explain", { ...q, question });
  },
  async typicalLive(q: Pick<Query, "airline" | "origin" | "dest" | "dep_hour">) { return defaultsFrom(await local(), q); },
};
