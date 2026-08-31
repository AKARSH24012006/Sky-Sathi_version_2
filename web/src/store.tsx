/** App-wide store: flight data, telemetry, sequence controls, copilot,
 *  preferences, notifications, and toasts — one context, no prop drilling. */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { SeqState, Telem, WeatherFx } from "./components/Aircraft3D";
import { PHASES, type Phase } from "./lib/sequence";
import { api, type Weather, type LiveFlight, type KbEntry, type Amenity } from "./lib/api";
import { snd } from "./lib/sound";
import { airlineFor } from "./lib/airlines";

const DEMO_FLIGHT_NO = "AI101"; // change this if a different flight is airborne at demo time

export type Msg = { who: "u" | "a"; text: string; chips?: { label: string; q: string }[] };
export type Prefs = { theme: string; anim: string; font: string; cb: boolean; voice: boolean; units: string; mode: "calm" | "educational" | "child" };
export type Notif = { id: number; title: string; body: string; t: string };
const CHECKLIST = ["Passport & ID in hand bag", "Boarding pass downloaded", "Power bank charged", "Water bottle (empty for security)", "Medication in cabin bag", "Leave for airport (traffic-safe time)"];
const PREFS0: Prefs = JSON.parse(localStorage.getItem("ss:prefs") || "null") || { theme: "auto", anim: "full", font: "std", cb: false, voice: true, units: "metric", mode: "calm" };
const themeFor = (h: number) => h < 5 ? "night" : h < 9 ? "morning" : h < 16 ? "day" : h < 18.5 ? "sunset" : h < 20 ? "twilight" : "night";

function useStore() {
  const seq = useRef<SeqState>({ t: 0, playing: false });
  const [phase, setPhase] = useState<Phase>(PHASES[0]);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [telem, setTelem] = useState<Telem>({ alt: 0.68, thr: 0.55, progress: 0, ground: false, turb: false });
  const [vspd, setVspd] = useState(0);
  const prevAlt = useRef(0.68);
  const [wxDel, setWxDel] = useState<Weather | null>(null);
  const [wxBlr, setWxBlr] = useState<Weather | null>(null);
  const [flight, setFlight] = useState<LiveFlight | null>(null);
  const [kb, setKb] = useState<KbEntry[]>([]);
  const [amens, setAmens] = useState<Amenity[]>([]);
  const [loading, setLoading] = useState(true);
  const [boardIn, setBoardIn] = useState(18 * 60);
  const [soundOn, setSoundOn] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(PREFS0);
  const [checks, setChecks] = useState<boolean[]>(() => JSON.parse(localStorage.getItem("ss:checks") || "null") || CHECKLIST.map(() => false));
  const [msgs, setMsgs] = useState<Msg[]>([{ who: "a", text: "Namaste, Akarsh — I'm your copilot. Press Begin Flight and I'll narrate every phase, or ask me anything." }]);
  const [thinking, setThinking] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [toast, setToast] = useState("");
  const notify = (title: string, body: string) =>
    setNotifs(n => [{ id: Date.now(), title, body, t: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }, ...n].slice(0, 12));
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2400); };

  useEffect(() => {
    Promise.all([api.weather("DEL"), api.weather("BLR"), api.liveFlight(DEMO_FLIGHT_NO), api.kb(), api.amenities("DEL")])
      .then(([d, b, f, k, a]) => {
        setWxDel(d); setWxBlr(b); setFlight(f); setKb(k?.entries ?? []); setAmens(a ?? []);
        if (f) notify("Gate confirmed", `${airlineFor(f.flight_no)} ${f.flight_no} boards at Gate ${f.gate} — a 9-minute walk from security.`);
        if (b) notify("Arrival weather", `${b.summary} in Bengaluru — ${b.calm_note}.`);
      }).finally(() => setLoading(false));
    const id = setInterval(() => setBoardIn(v => Math.max(0, v - 1)), 1000);
    // keep weather genuinely fresh through a longer demo, not just a one-time fetch
    const wxId = setInterval(() => {
      api.weather("DEL").then(d => d && setWxDel(d));
      api.weather("BLR").then(b => b && setWxBlr(b));
    }, 5 * 60 * 1000);
    return () => { clearInterval(id); clearInterval(wxId); };
  }, []);
  useEffect(() => { localStorage.setItem("ss:checks", JSON.stringify(checks)); }, [checks]);
  useEffect(() => {
    localStorage.setItem("ss:prefs", JSON.stringify(prefs));
    document.documentElement.dataset.theme = prefs.theme === "auto" ? themeFor(new Date().getHours() + new Date().getMinutes() / 60) : prefs.theme;
    document.body.classList.toggle("largefont", prefs.font === "large");
    document.body.classList.toggle("cb", prefs.cb);
    document.body.classList.toggle("no-motion", prefs.anim === "reduced");
  }, [prefs]);

  const hour = new Date().getHours();
  const greet = hour < 5 ? "Up late" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : hour < 21 ? "Good evening" : "Good night";
  const wxFx: WeatherFx = { code: wxBlr?.code ?? 61, night: hour < 6 || hour > 19 };

  const say = (text: string, chips?: Msg["chips"]) => {
    setMsgs(m => [...m, { who: "a", text, chips }]);
    if (prefs.voice && soundOn && "speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(text); u.rate = 0.96; speechSynthesis.speak(u);
    }
  };
  const ask = async (q: string) => {
    if (!q) return;
    setMsgs(m => [...m, { who: "u", text: q }]); setThinking(true);
    const prefix = prefs.mode === "child" ? "Explain very simply for a curious child: " : prefs.mode === "educational" ? "Explain with a little technical depth: " : "";
    const r = await api.chat(prefix + q, prefs.mode === "calm" ? "raised" : "calm");
    setThinking(false);
    if (r) say(r.reply);
    else {
      const local = kb.find(e => q.toLowerCase().split(" ").some(w => w.length > 3 && e.tags.includes(w)));
      say(local ? `${local.text} ${local.calm}` : "I can't reach my full brain right now, but here's what's always true: flying is the safest way humans travel. (Run ./start.sh for full answers.)");
    }
  };
  const begin = () => {
    seq.current.t = 0.001; seq.current.playing = true;
    setPlaying(true); setProgress(0); snd.ding();
    notify("Departure", `${airlineFor(flight?.flight_no)} ${flight?.flight_no ?? DEMO_FLIGHT_NO} is beginning its journey to Bengaluru.`);
    say("Doors closed. Starting engines — listen for one, then the other. I'm with you the whole way.");
  };
  const onPhase = (p: Phase, prog: number) => {
    setPhase(p); setProgress(prog);
    if (p.id === "turb") say("I noticed light turbulence ahead — forecast this morning, and the wings are built to flex through it. Would you like me to explain why it's safe?", [
      { label: "Explain why", q: "Why is turbulence safe?" }, { label: "I'm okay", q: "" }]);
    else if (["roll", "gearup", "cruise", "geardown", "touchdown", "gate"].includes(p.id)) say(p.note);
    if (p.id === "roll" || p.id === "geardown") snd.ding();
    if (p.id === "gate") { seq.current.playing = false; setPlaying(false); notify("Landed safely", "Welcome to Bengaluru. Baggage predicted on Belt 4."); say("Flight complete. You did that — and it was beautiful up there."); }
  };
  const onTelem = (t: Telem) => { setVspd(Math.round((t.alt - prevAlt.current) * 36000 / 0.5)); prevAlt.current = t.alt; setTelem(t); };

  return { seq, phase, progress, playing, telem, vspd, wxDel, wxBlr, flight, kb, amens, loading, boardIn,
    soundOn, setSoundOn, prefs, setPrefs, checks, setChecks, CHECKLIST, msgs, thinking, notifs, notify,
    toast, showToast, greet, wxFx, say, ask, begin, onPhase, onTelem };
}
export type Store = ReturnType<typeof useStore>;
const Ctx = createContext<Store | null>(null);
export const AppProvider = ({ children }: { children: ReactNode }) => <Ctx.Provider value={useStore()}>{children}</Ctx.Provider>;
export const useApp = (): Store => useContext(Ctx)!;
