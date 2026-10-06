/** AI Terminal Navigator — say what you need ("washroom aur burger before gate 24"),
 *  SkySathi understands it (NLP), plans the shortest walk through those stops
 *  (Dijkstra), draws it on the terminal map, and the LLM writes calm directions
 *  using only places that exist on the map (falls back to template directions). */
import { useEffect, useMemo, useState } from "react";
import { MAPS, WANTS, type Kind, type MapNode, type TerminalMap } from "../lib/airportMaps";
import { parseRequest, plan, templateSteps, type Plan } from "../lib/route";
import { api } from "../lib/api";
import { useApp } from "../store";
import Icon from "./Icon";

const TONE: Partial<Record<Kind, string>> = {
  washroom: "cyan", water: "cyan", food: "amber", coffee: "amber", shop: "amber", charging: "violet", lounge: "violet", prayer: "violet",
  baby: "sage", pharmacy: "sage", medical: "sage", atm: "sage", belt: "sky", cab: "amber", taxi: "amber", bus: "sage", hotel: "violet",
  exit: "sky", security: "sky", entry: "sky",
};
/* tiny glyphs drawn inside map pins (12-unit box) */
const GLYPH: Partial<Record<Kind, string>> = {
  washroom: "M6 2.5a1.2 1.2 0 1 0 0 .1M4.5 5h3l-.4 3.2H6.6L6.4 11h-.8l-.2-2.8h-.5z", food: "M2.5 6h7M2.8 4.8C3.5 3 8.5 3 9.2 4.8M2.8 7.5h6.4l-.6 2H3.4z",
  coffee: "M3 4.5h5v3.5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2zM8 5.5h1a1.2 1.2 0 0 1 0 2.4H8", water: "M6 2.2 3.6 6.4a2.8 2.8 0 1 0 4.8 0z",
  charging: "M6.6 2 3.8 6.6h2.4L5.4 10l2.8-4.6H5.8z", pharmacy: "M5 2.5h2v2.5h2.5v2H7v2.5H5V7H2.5V5H5z", medical: "M5 2.5h2v2.5h2.5v2H7v2.5H5V7H2.5V5H5z",
  lounge: "M2.5 6.5V8.8h7V6.5M3.5 6.5V5h5v1.5M3 8.8v1M9 8.8v1", prayer: "M6 2.5c1.6 1.6 1.6 4.4 0 7c-1.6-2.6-1.6-5.4 0-7zM2.8 7.2c1.2 0 2.4.8 3.2 2.3M9.2 7.2c-1.2 0-2.4.8-3.2 2.3",
  baby: "M6 3.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6M5 5.6h.01M7 5.6h.01M5 7.2c.6.5 1.4.5 2 0", atm: "M3.5 3.5h5M3.5 5.5h5M5.5 3.5c2.2 0 2.2 3 0 3H4l4 3",
  shop: "M3 4.5h6l-.5 5.5h-5zM4.5 4.5a1.5 1.5 0 0 1 3 0", belt: "M3 4.5h6v5H3zM5 4.5V3h2v1.5", cab: "M2.5 8V6.2L3.6 4h4.8l1.1 2.2V8zM3.5 8v1M8.5 8v1",
  taxi: "M2.5 8V6.2L3.6 4h4.8l1.1 2.2V8zM5 2.8h2", bus: "M3 2.8h6v6.4H3zM3 6h6M4 9.2v1M8 9.2v1", hotel: "M2.5 9.5V4M2.5 7h7v2.5M9.5 7a1.5 1.5 0 0 0-1.5-1.5H5.5V7",
  exit: "M4.5 2.5H3v7h1.5M6 6h4M8.5 4.5 10 6l-1.5 1.5", security: "M6 2.2 9 3.4v2.8c0 1.9-1.3 3.3-3 3.8-1.7-.5-3-1.9-3-3.8V3.4z", entry: "M4.5 2.5H3v7h1.5M10 6H6M7.5 4.5 6 6l1.5 1.5",
};
const EXAMPLES: Record<string, string[]> = {
  DEL: ["Washroom and a burger before gate 24", "Chai, then charge my phone near gate 22", "Pharmacy aur paani, then gate 7", "I want a quiet place to pray before gate 15"],
  BLR: ["Washroom, then belt 4, then cab", "Coffee before the taxi", "ATM then the bus", "Paani and washroom, then exit"],
};
const DEFAULT_DEST: Record<string, string> = { DEL: "g21", BLR: "cab" };

export default function TerminalNavigator({ airport, setAirport, preset }: { airport: "DEL" | "BLR"; setAirport: (a: "DEL" | "BLR") => void; preset?: { dest?: string; nonce: number } }) {
  const s = useApp();
  const m: TerminalMap = MAPS[airport];
  const [from, setFrom] = useState(m.starts[0]);
  const [to, setTo] = useState(DEFAULT_DEST[airport]);
  const [kinds, setKinds] = useState<Kind[]>(airport === "DEL" ? ["washroom", "food"] : ["washroom"]);
  const [via, setVia] = useState<string[]>([]);
  const [text, setText] = useState(EXAMPLES[airport][0]);
  const [heard, setHeard] = useState<string>("");
  const [hover, setHover] = useState<MapNode | null>(null);
  const [ai, setAi] = useState<{ steps: { node: string; text: string }[]; tip?: string; generator: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {   // switching airport resets to that terminal's defaults
    const M = MAPS[airport];
    setFrom(M.starts[airport === "DEL" ? 2 : 0]); setTo(preset?.dest ?? DEFAULT_DEST[airport]);
    setKinds(airport === "DEL" ? ["washroom", "food"] : ["washroom"]); setVia(airport === "BLR" ? ["b3"] : []); setText(EXAMPLES[airport][0]); setHeard("");
  }, [airport, preset?.nonce]);

  const route: Plan | null = useMemo(() => plan(m, from, to, kinds, via), [m, from, to, kinds, via]);
  const byId = useMemo(() => new Map(m.nodes.map(n => [n.id, n])), [m]);
  const steps = route ? templateSteps(m, route) : [];
  const boardMin = Math.floor(s.boardIn / 60);

  // ask the LLM to narrate whenever the route changes (falls back silently)
  useEffect(() => {
    if (!route) { setAi(null); return; }
    let live = true; setBusy(true);
    const ids = [...new Set(route.path)].map(id => byId.get(id)!).filter(n => n.kind !== "walk" || route.legs.some(l => l.from.id === n.id));
    api.navigate({
      airport: m.title, user_request: text, nodes: ids.map(n => ({ id: n.id, name: n.name, note: n.note ?? "" })),
      legs: route.legs.map(l => ({ to: l.to.id, meters: Math.round(l.meters), minutes: Math.max(1, Math.round(l.minutes)) })),
      total_min: Math.max(1, Math.round(route.minutes)), board_in_min: airport === "DEL" ? boardMin : null,
    }).then(r => { if (!live) return; setBusy(false);
      setAi(r && r.ok ? { steps: r.steps, tip: r.tip, generator: r.generator } : { steps, generator: r?.generator ?? "template directions (no LLM in this preview)" }); });
    return () => { live = false; };
  }, [route]);

  const understand = (q: string) => {
    const r = parseRequest(q, m);
    setKinds(r.kinds); setVia(r.via); if (r.dest) setTo(r.dest);
    const what = [...r.kinds.map(k => WANTS.find(w => w.kind === k)!.label.toLowerCase()), ...r.via.map(v => byId.get(v)!.name), r.dest ? byId.get(r.dest)!.name : null].filter(Boolean);
    setHeard(what.length ? `Understood: ${what.join(" → ")}` : "I couldn't spot a place in that — try “washroom”, “chai”, “gate 24” or “cab”.");
  };
  const toggle = (k: Kind) => setKinds(ks => ks.includes(k) ? ks.filter(x => x !== k) : [...ks, k]);
  const dests = m.nodes.filter(n => ["gate", "belt", "cab", "taxi", "bus", "exit", "hotel"].includes(n.kind) && !m.starts.includes(n.id) || n.id === to);
  const pathD = route ? route.path.map((id, i) => `${i ? "L" : "M"}${byId.get(id)!.x},${byId.get(id)!.y}`).join(" ") : "";
  const stopIdx = new Map(route?.stops.map((n, i) => [n.id, i + 1]) ?? []);
  const kindsHere = WANTS.filter(w => m.nodes.some(n => n.kind === w.kind));
  const spare = airport === "DEL" && route ? boardMin - Math.round(route.minutes) : null;

  return <section className="card nav">
    <div className="rowBetween">
      <div><p className="label">AI terminal navigator <span className="pill violet">GenAI + routing</span></p>
        <h3 className="navTitle">{m.title}</h3><p className="tiny">{m.subtitle}</p></div>
      <div className="seg" role="tablist" aria-label="Airport">
        {(["DEL", "BLR"] as const).map(a => <button key={a} role="tab" aria-selected={airport === a} className={airport === a ? "on" : ""} onClick={() => setAirport(a)}>
          {a === "DEL" ? "Delhi · departures" : "Bengaluru · arrivals"}</button>)}
      </div>
    </div>

    <div className="askRow">
      <input id="navAsk" className="labin" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && understand(text)}
        placeholder="Tell SkySathi what you need, in English or Hinglish…" aria-label="What do you need in the terminal?" />
      <button className="btn" style={{ width: "auto", margin: 0, padding: "0 18px" }} onClick={() => understand(text)}><Icon n="spark" s={16} />Plan</button>
    </div>
    <div className="chips">{EXAMPLES[airport].map(e => <button key={e} onClick={() => { setText(e); understand(e); }}>{e}</button>)}</div>
    {heard && <p className="heard"><Icon n="copilot" s={14} /> {heard}</p>}

    <div className="navGrid">
      <div className="mapWrap">
        <svg viewBox="0 0 1000 560" className="tmap" role="img" aria-label={`${m.title} schematic map with your route`}>
          {m.zones.map(z => <g key={z.label}><rect x={z.x} y={z.y} width={z.w} height={z.h} rx={18} className="zone" />
            <text x={z.x + 12} y={z.y + 18} className="zlabel">{z.label}</text></g>)}
          {m.edges.map(([a, b]) => { const A = byId.get(a)!, B = byId.get(b)!; return <line key={a + b} x1={A.x} y1={A.y} x2={B.x} y2={B.y} className="walkway" />; })}
          {route && <>
            <path d={pathD} className="routeGlow" /><path d={pathD} className="routeLine" key={pathD} />
            <circle r={9} className="walker"><animateMotion dur={`${Math.max(4, route.minutes * 0.9)}s`} repeatCount="indefinite" path={pathD} /></circle>
          </>}
          {m.nodes.filter(n => n.kind !== "walk").map(n => {
            const tone = TONE[n.kind] ?? "sky", st = stopIdx.get(n.id), isGate = n.kind === "gate" || n.kind === "belt";
            const isEnd = n.id === to, isStart = n.id === from;
            return <g key={n.id} className={"pin " + tone + (st || isEnd || isStart ? " hot" : "") + (isGate ? " gate" : "")} transform={`translate(${n.x},${n.y})`}
              onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(null)} onClick={() => n.kind === "belt" ? setVia(v => v.includes(n.id) ? v.filter(x => x !== n.id) : [n.id]) : isGate || ["cab", "taxi", "bus", "exit", "hotel"].includes(n.kind) ? setTo(n.id) : toggle(n.kind)}
              tabIndex={0} role="button" aria-label={`${n.name}${n.note ? ", " + n.note : ""}`}>
              {isGate ? <><rect x={-56} y={-15} width={112} height={30} rx={10} /><text y={5} textAnchor="middle" className="gtext">{n.name}</text></>
                : <><circle r={st || isEnd ? 19 : 15} /><g transform="translate(-9,-9) scale(1.5)"><path d={GLYPH[n.kind] ?? "M3 6h6"} className="glyph" /></g></>}
              {st && <g transform="translate(16,-18)"><circle r={10} className="badgeC" /><text y={4} textAnchor="middle" className="badgeT">{st}</text></g>}
            </g>;
          })}
          {route && (() => { const A = byId.get(from)!; return <g transform={`translate(${A.x},${A.y})`}><circle r={16} className="youRing" /><text y={-22} textAnchor="middle" className="youT">You</text></g>; })()}
          {hover && <g transform={`translate(${Math.min(820, Math.max(10, hover.x - 90))},${hover.y > 90 ? hover.y - 70 : hover.y + 24})`} className="tip">
            <rect width={210} height={50} rx={10} /><text x={12} y={21} className="tipT">{hover.name}</text><text x={12} y={39} className="tipS">{hover.note ?? "tap to add as a stop"}</text></g>}
        </svg>
      </div>

      <div className="navSide">
        <div className="navCtl">
          <label>From<select value={from} onChange={e => setFrom(e.target.value)}>{m.starts.map(id => <option key={id} value={id}>{byId.get(id)!.name}</option>)}</select></label>
          <label>To<select value={to} onChange={e => setTo(e.target.value)}>{dests.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select></label>
        </div>
        <div className="kindChips">{kindsHere.map(w => <button key={w.kind} className={(kinds.includes(w.kind) ? "sel " : "") + (TONE[w.kind] ?? "sky")} onClick={() => toggle(w.kind)}>{w.label}</button>)}</div>
        {route ? <>
          <div className="navStats">
            <div className="tile cyan"><small>Walk</small><b className="mono">{Math.max(1, Math.round(route.minutes))} min</b></div>
            <div className="tile violet"><small>Distance</small><b className="mono">{Math.round(route.meters / 10) * 10} m</b></div>
            <div className="tile sage"><small>Stops</small><b className="mono">{route.stops.length}</b></div>
          </div>
          {spare !== null && <p className={"calmline " + (spare >= 5 ? "ok" : "tight")}><i className={spare >= 5 ? "dot" : "dot amber"} />
            {spare >= 5 ? `Boarding in ${boardMin} min — you'll reach the gate with about ${spare} min to spare. No rush.`
              : `Boarding in ${boardMin} min and this walk takes ${Math.round(route.minutes)}. Drop a stop and head to the gate; you've got this.`}</p>}
          <ol className="steps">{(ai?.steps ?? steps).map((st, i) => <li key={i}><span className="sn">{i + 1}</span><span>{st.text}</span></li>)}</ol>
          {ai?.tip && <p className="tiny">{ai.tip}</p>}
          <p className="gen">{busy ? "writing directions…" : ai?.generator} · map is schematic demo data</p>
        </> : <p className="sub">No route between those points — try another start.</p>}
      </div>
    </div>
  </section>;
}
