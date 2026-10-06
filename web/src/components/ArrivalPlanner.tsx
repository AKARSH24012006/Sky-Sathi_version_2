/** Arrival planner — "I've landed, now what?" Rules rank cab / taxi / bus for your
 *  group, bags, budget and landing time; the LLM writes the recommendation and an
 *  after-landing checklist (template when offline). SkySathi never books or pays:
 *  every button opens the passenger's own app with the trip pre-filled. */
import { useEffect, useMemo, useState } from "react";
import { AREAS, hotelLinks, options, templatePlan, type Inputs } from "../lib/arrival";
import { api } from "../lib/api";
import Icon from "./Icon";

const MODE_IC: Record<string, string> = { cab: "flights", taxi: "flights", bus: "journey" };

export default function ArrivalPlanner({ arrive, showOnMap }: { arrive?: string; showOnMap: (dest: string) => void }) {
  const landingHour = arrive ? +arrive.split(":")[0] : 20;
  const [inp, setInp] = useState<Inputs>({ area: "koramangala", people: 1, bags: 1, budget: "balanced", hour: landingHour, needHotel: false, anxious: true });
  const set = <K extends keyof Inputs>(k: K, v: Inputs[K]) => setInp(p => ({ ...p, [k]: v }));
  const opts = useMemo(() => options(inp), [inp]);
  const fallback = useMemo(() => templatePlan(inp, opts), [inp, opts]);
  const [ai, setAi] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true; setBusy(true);
    const t = setTimeout(() => {
      const area = AREAS.find(a => a.id === inp.area)!;
      api.arrival({
        destination: area.name + ", Bengaluru", travellers: inp.people, bags: inp.bags, budget: inp.budget, landing_hour: inp.hour,
        need_hotel: inp.needHotel, feeling_anxious: inp.anxious,
        options: opts.map(o => ({ id: o.id, title: o.title, minutes: o.minutes, fare: o.fare, pickup: o.pickup, reasons: o.reasons })),
      }).then(r => { if (live) { setBusy(false); setAi(r && r.ok ? r : { ...fallback, generator: r?.generator ?? "template plan (no LLM in this preview)" }); } });
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [opts]);

  const planOut = ai ?? { ...fallback, generator: "…" };
  const best = planOut.recommended;
  const area = AREAS.find(a => a.id === inp.area)!;

  return <section className="card arr">
    <div className="rowBetween">
      <div><p className="label">Arrival planner <span className="pill amber">GenAI plan · you book</span></p>
        <h3 className="navTitle">Bengaluru airport → your stay</h3></div>
      <span className="pill sky mono">Landing ~{String(inp.hour).padStart(2, "0")}:{arrive?.split(":")[1] ?? "40"}</span>
    </div>

    <div className="arrGrid">
      <div className="arrIn">
        <p className="tiny">Where are you headed?</p>
        <div className="kindChips">{AREAS.map(a => <button key={a.id} className={(inp.area === a.id ? "sel " : "") + "cyan"} onClick={() => set("area", a.id)}>{a.name}</button>)}</div>
        <div className="steppers">
          <Stepper label="Travellers" v={inp.people} min={1} max={8} on={v => set("people", v)} />
          <Stepper label="Bags" v={inp.bags} min={0} max={8} on={v => set("bags", v)} />
          <label className="hourCtl">Landing hour<input type="range" min={0} max={23} value={inp.hour} onChange={e => set("hour", +e.target.value)} /><b className="mono">{String(inp.hour).padStart(2, "0")}:00</b></label>
        </div>
        <div className="seg" role="tablist" aria-label="Budget">{(["save", "balanced", "comfort"] as const).map(b =>
          <button key={b} role="tab" aria-selected={inp.budget === b} className={inp.budget === b ? "on" : ""} onClick={() => set("budget", b)}>{b === "save" ? "Save money" : b === "balanced" ? "Balanced" : "Comfort"}</button>)}</div>
        <div className="toggles">
          <label className="tog"><span className={"switch" + (inp.needHotel ? " on" : "")} onClick={() => set("needHotel", !inp.needHotel)} role="switch" aria-checked={inp.needHotel} tabIndex={0} />Need a hotel tonight</label>
          <label className="tog"><span className={"switch" + (inp.anxious ? " on" : "")} onClick={() => set("anxious", !inp.anxious)} role="switch" aria-checked={inp.anxious} tabIndex={0} />Keep it simple, I'm tired after the flight</label>
        </div>
      </div>

      <div className="arrOut">
        <div className="aiPlan">
          <p className="label"><Icon n="spark" s={14} /> SkySathi suggests</p>
          <h4>{planOut.headline}</h4>
          <p className="sub">{planOut.why}</p>
          <ol className="steps">{(planOut.after_landing ?? []).map((t: string, i: number) => <li key={i}><span className="sn">{i + 1}</span><span>{t}</span></li>)}</ol>
          <p className="gen">{busy ? "planning…" : planOut.generator}</p>
        </div>
        {opts.map(o => <div key={o.id} className={"opt" + (o.id === best ? " best" : "")}>
          <div className="optHead"><span className="optIc"><Icon n={MODE_IC[o.mode] ?? "flights"} s={16} /></span>
            <div><b>{o.title}</b><small>{o.minutes[0]}–{o.minutes[1]} min · {o.fare}</small></div>
            {o.id === best && <span className="pill sage">Recommended</span>}</div>
          <div className="reasons">{o.reasons.map(r => <span key={r} className="mini sky">{r}</span>)}</div>
          <div className="optLinks">
            <button className="lnk" onClick={() => showOnMap(o.mode === "cab" ? "cab" : o.mode === "taxi" ? "taxi" : "bus")}><Icon n="journey" s={14} />Show pickup on map</button>
            {o.links.map(l => <a key={l.label} className="lnk" href={l.href} target="_blank" rel="noopener noreferrer">{l.label} <Icon n="arrow" s={13} /></a>)}
          </div>
        </div>)}
        {inp.needHotel && <div className="opt hotelBox">
          <div className="optHead"><span className="optIc"><Icon n="home" s={16} /></span><div><b>Hotels near {area.name}</b><small>search opens with the area filled in</small></div></div>
          {(planOut.hotel_tips ?? []).map((t: string) => <p key={t} className="tiny">• {t}</p>)}
          <div className="optLinks">{hotelLinks(inp.area).map(l => <a key={l.label} className="lnk" href={l.href} target="_blank" rel="noopener noreferrer">{l.label} <Icon n="arrow" s={13} /></a>)}</div>
        </div>}
        <p className="tiny">SkySathi never books or pays for you. Fares and times are rough estimates (cabs assume about ₹20–28 per km); the app or meter shows the real price.</p>
      </div>
    </div>
  </section>;
}

function Stepper({ label, v, min, max, on }: { label: string; v: number; min: number; max: number; on: (v: number) => void }) {
  return <div className="stepper"><span>{label}</span><div>
    <button onClick={() => on(Math.max(min, v - 1))} aria-label={`Fewer ${label}`}>−</button><b className="mono">{v}</b>
    <button onClick={() => on(Math.min(max, v + 1))} aria-label={`More ${label}`}>+</button></div></div>;
}
