/** "What was that sound?" — tap a sound to hear a synthesized version of it and get
 *  the pilot-reviewed explanation from the knowledge base. Fear of unexplained
 *  noises is one of the most common triggers for anxious flyers. */
import { useState } from "react";
import { useApp } from "../store";
import { snd } from "../lib/sound";
import Icon from "./Icon";

const SOUNDS = [
  { id: "chime", kb: "sounds", name: "Ding-dong chime", when: "Any time", tone: "violet", fallback: "Cabin chimes are how the crew talk to each other — seatbelt sign, calls between galleys. Routine." },
  { id: "spool", kb: "engines", name: "Engines winding up", when: "Engine start · takeoff", tone: "amber", fallback: "Engines spooling up to takeoff power. Either engine alone can fly the aircraft." },
  { id: "gear", kb: "gear", name: "Whirr, then a thud", when: "~30 s after takeoff · ~5 min before landing", tone: "cyan", fallback: "The landing gear motor, then the locks engaging. Gravity alone can lower the gear." },
  { id: "flaps", kb: "flaps", name: "Hum from the wings", when: "Before takeoff · on approach", tone: "sage", fallback: "Flaps sliding out to make the wing bigger for slow, safe flight." },
  { id: "apu", kb: "apu", name: "Whine from the tail", when: "At the gate · boarding", tone: "cyan", fallback: "The APU — a small engine in the tail that powers the aircraft at the gate." },
  { id: "reverse", kb: "landing", name: "Big roar after landing", when: "Right after touchdown", tone: "amber", fallback: "Reverse thrust and brakes slowing the aircraft. Loud, normal, planned." },
  { id: "thunder", kb: "weather", name: "Rumble outside", when: "Stormy weather", tone: "violet", fallback: "Pilots route around storms on radar; aircraft are built to shrug off lightning." },
] as const;

export default function SoundExplainer({ onAsk }: { onAsk: (q: string) => void }) {
  const s = useApp();
  const [cur, setCur] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const play = (id: typeof SOUNDS[number]["id"]) => {
    setCur(id); setPlaying(true);
    const secs = snd.play(id);
    setTimeout(() => setPlaying(false), secs * 1000);
  };
  const c = SOUNDS.find(x => x.id === cur);
  const kb = c ? s.kb.find(e => e.id === c.kb) : null;
  return <section className="card soundx">
    <div className="rowBetween"><p className="label">What was that sound? <span className="pill cyan">tap to hear</span></p>
      <span className="tiny">Sounds are synthesized approximations</span></div>
    <div className="sgrid">{SOUNDS.map(x => <button key={x.id} className={"sbtn " + x.tone + (cur === x.id ? " on" : "")} onClick={() => play(x.id)}>
      <span className={"eq" + (cur === x.id && playing ? " live" : "")} aria-hidden><i /><i /><i /><i /></span>
      <b>{x.name}</b><small>{x.when}</small></button>)}</div>
    {c && <div className="sexp">
      <p><b>{c.name}.</b> {kb ? `${kb.text} ${kb.calm}` : c.fallback}</p>
      <button className="lnk" onClick={() => onAsk(`I just heard a ${c.name.toLowerCase()}. What is it?`)}><Icon n="copilot" s={14} />Ask the copilot more</button>
    </div>}
  </section>;
}
