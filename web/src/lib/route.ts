/** Terminal routing: Dijkstra over the map graph, then the best order of stops
 *  (brute force over orders and candidate amenities — at most a few thousand
 *  combinations), plus request parsing and template directions. Pure functions. */
import { WANTS, type Kind, type MapNode, type TerminalMap } from "./airportMaps";

const WALK_M_PER_MIN = 70;

function graph(m: TerminalMap) {
  const byId = new Map(m.nodes.map(n => [n.id, n]));
  const adj = new Map<string, { to: string; w: number }[]>();
  for (const [a, b] of m.edges) {
    const A = byId.get(a)!, B = byId.get(b)!, w = Math.hypot(A.x - B.x, A.y - B.y) * m.scale;
    (adj.get(a) ?? adj.set(a, []).get(a)!).push({ to: b, w });
    (adj.get(b) ?? adj.set(b, []).get(b)!).push({ to: a, w });
  }
  return { byId, adj };
}

export function dijkstra(m: TerminalMap, src: string) {
  const { adj } = graph(m);
  const dist = new Map<string, number>([[src, 0]]), prev = new Map<string, string>(), done = new Set<string>();
  while (true) {
    let u: string | null = null, best = Infinity;
    for (const [k, d] of dist) if (!done.has(k) && d < best) { best = d; u = k; }
    if (u === null) break;
    done.add(u);
    for (const { to, w } of adj.get(u) ?? []) {
      const nd = best + w;
      if (nd < (dist.get(to) ?? Infinity)) { dist.set(to, nd); prev.set(to, u); }
    }
  }
  return { dist, prev };
}

function pathTo(prev: Map<string, string>, src: string, dst: string): string[] {
  const p = [dst];
  while (p[0] !== src) { const q = prev.get(p[0]); if (!q) return []; p.unshift(q); }
  return p;
}

export type Leg = { from: MapNode; to: MapNode; meters: number; minutes: number; path: string[] };
export type Plan = { legs: Leg[]; path: string[]; meters: number; minutes: number; stops: MapNode[] };

function perms<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map(p => [x, ...p]));
}

export function plan(m: TerminalMap, start: string, end: string, kinds: Kind[], via: string[] = []): Plan | null {
  const cands = [...kinds.map(k => m.nodes.filter(n => n.kind === k).map(n => n.id)), ...via.filter(v => v !== end && v !== start).map(v => [v])].filter(c => c.length);
  const ids = new Set([start, end, ...cands.flat()]);
  const sp = new Map([...ids].map(id => [id, dijkstra(m, id)]));
  const d = (a: string, b: string) => sp.get(a)!.dist.get(b) ?? Infinity;
  let best: string[] | null = null, bestCost = Infinity;
  const choose = (i: number, picked: string[]) => {
    if (i === cands.length) {
      for (const order of perms(picked)) {
        let cost = 0, cur = start;
        for (const s of order) { cost += d(cur, s); cur = s; }
        cost += d(cur, end);
        if (cost < bestCost) { bestCost = cost; best = order; }
      }
      return;
    }
    for (const c of cands[i]) choose(i + 1, [...picked, c]);
  };
  choose(0, []);
  if (!best || !isFinite(bestCost)) return null;
  const { byId } = graph(m);
  const way = [start, ...(best as string[]), end];
  const legs: Leg[] = [];
  let path: string[] = [start];
  for (let i = 0; i < way.length - 1; i++) {
    const p = pathTo(sp.get(way[i])!.prev, way[i], way[i + 1]);
    const meters = d(way[i], way[i + 1]);
    legs.push({ from: byId.get(way[i])!, to: byId.get(way[i + 1])!, meters, minutes: meters / WALK_M_PER_MIN, path: p });
    path = path.concat(p.slice(1));
  }
  const meters = legs.reduce((a, l) => a + l.meters, 0);
  return { legs, path, meters, minutes: meters / WALK_M_PER_MIN, stops: (best as string[]).map(id => byId.get(id)!) };
}

/** "washroom aur burger before gate 24" -> kinds + destination node */
export function parseRequest(text: string, m: TerminalMap): { kinds: Kind[]; dest?: string; via: string[] } {
  const t = text.toLowerCase();
  const kinds = WANTS.filter(w => w.words.some(word => new RegExp(`\\b${word}`).test(t))).map(w => w.kind)
    .filter(k => m.nodes.some(n => n.kind === k));
  let dest: string | undefined;
  const g = t.match(/gate\s*(\d{1,2})/), b = t.match(/belt\s*(\d{1,2})/);
  const num = g ? +g[1] : b ? +b[1] : null;
  if (num != null) {
    const want = g ? "gate" : "belt";
    const node = m.nodes.find(n => n.kind === want && (() => {
      const r = n.name.match(/(\d+)[–-](\d+)/); return r ? num >= +r[1] && num <= +r[2] : false; })());
    if (node) dest = node.id;
  }
  const via: string[] = [];
  const transport = /\b(cab|uber|ola|namma|taxi|bus|exit|bahar)\b/.test(t);
  if (b && dest && transport) { via.push(dest); dest = undefined; }   // "belt 4, then cab": the belt is a stop
  if (/\b(cab|uber|ola|namma)\b/.test(t)) dest = m.nodes.find(n => n.kind === "cab")?.id ?? dest;
  if (/\btaxi\b/.test(t)) dest = m.nodes.find(n => n.kind === "taxi")?.id ?? dest;
  if (/\bbus\b/.test(t)) dest = m.nodes.find(n => n.kind === "bus")?.id ?? dest;
  if (/\b(exit|bahar)\b/.test(t)) dest = m.nodes.find(n => n.kind === "exit")?.id ?? dest;
  return { kinds: [...new Set(kinds)], dest, via };
}

export function templateSteps(m: TerminalMap, p: Plan): { node: string; text: string }[] {
  const byId = new Map(m.nodes.map(n => [n.id, n]));
  const out: { node: string; text: string }[] = [{ node: p.legs[0].from.id, text: `Start at ${p.legs[0].from.name}.` }];
  for (const l of p.legs) {
    const mids = l.path.slice(1, -1).map(id => byId.get(id)!).filter(n => n.kind !== "walk" || /plaza|pier|centre|corridor|hall|kerb/i.test(n.name));
    const via = [...new Set(mids.map(n => n.name))].slice(0, 2);
    const where = l.to.note ? ` (${l.to.note})` : "";
    const sent = `walk about ${Math.round(l.meters / 10) * 10} m${via.length ? ` via ${via.join(" and ")}` : ""} to ${l.to.name}${where} — ${Math.max(1, Math.round(l.minutes))} min.`;
    out.push({ node: l.to.id, text: sent[0].toUpperCase() + sent.slice(1) });
  }
  return out;
}
