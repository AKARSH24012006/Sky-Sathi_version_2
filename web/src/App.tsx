/** SkySathi 4.0 — the complete application.
 *  Six-tab shell (code-split screens), command palette (⌘K), notification
 *  center, cinematic intro, settings drawer, toasts. Every 3.x feature lives
 *  on inside a screen; no dead buttons — anything unbuilt says so honestly. */
import { lazy, Suspense, useEffect, useState } from "react";
import { AppProvider, useApp } from "./store";

const Home = lazy(() => import("./screens/Home"));
const Flights = lazy(() => import("./screens/Flights"));
const Journey = lazy(() => import("./screens/Journey"));
const Copilot = lazy(() => import("./screens/Copilot"));
const Tickets = lazy(() => import("./screens/Tickets"));
const Profile = lazy(() => import("./screens/Profile"));

const TABS = [
  { id: "home", label: "Home", ic: "⌂" }, { id: "flights", label: "Flights", ic: "⇗" },
  { id: "journey", label: "Journey", ic: "◎" }, { id: "copilot", label: "Copilot", ic: "✦" },
  { id: "tickets", label: "Tickets", ic: "▤" }, { id: "profile", label: "Profile", ic: "◉" },
];

function Shell() {
  const s = useApp();
  const [tab, setTab] = useState("home");
  const [setOpen, setSetOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [palOpen, setPalOpen] = useState(false);
  const [palQ, setPalQ] = useState("");
  const [intro, setIntro] = useState(() => !sessionStorage.getItem("ss:intro") && !matchMedia("(prefers-reduced-motion: reduce)").matches);
  const endIntro = () => { setIntro(false); sessionStorage.setItem("ss:intro", "1"); };
  useEffect(() => { if (intro) { const t = setTimeout(endIntro, 3600); return () => clearTimeout(t); } }, [intro]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalOpen(o => !o); setPalQ(""); }
      if (e.key === "Escape") { setPalOpen(false); setNotifOpen(false); setSetOpen(false); }
    };
    addEventListener("keydown", h); return () => removeEventListener("keydown", h);
  }, []);

  const actions = [
    ...TABS.map(t => ({ label: `Go to ${t.label}`, run: () => setTab(t.id) })),
    { label: "Begin Flight", run: () => { setTab("home"); s.begin(); } },
    { label: "Toggle sound", run: () => document.getElementById("soundBtn")?.click() },
    { label: "Open settings", run: () => setSetOpen(true) },
    { label: "Ask: why is turbulence safe?", run: () => { setTab("copilot"); s.ask("Why is turbulence safe?"); } },
  ].filter(a => a.label.toLowerCase().includes(palQ.toLowerCase()));

  return <>
    <div id="rays" aria-hidden />
    {intro && <div id="intro3" onClick={endIntro}><div className="lg">SkySathi</div><div className="tg">{s.greet}, Akarsh — preparing your sky…</div></div>}

    <div id="app" style={{ paddingBottom: 96 }}>
      <header>
        <h1>SkySathi</h1>
        <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn gearbtn" onClick={() => { setPalOpen(true); setPalQ(""); }} aria-label="Search (Ctrl+K)">⌘K</button>
          <button className="btn gearbtn" style={{ position: "relative" }} onClick={() => setNotifOpen(o => !o)} aria-label="Notifications">
            ◔{s.notifs.length > 0 && <span className="badge">{s.notifs.length}</span>}</button>
          <button className="btn gearbtn" onClick={() => setSetOpen(true)}>Settings</button>
        </span>
      </header>

      <Suspense fallback={<div className="card skeleton" style={{ height: 300 }} />}>
        {tab === "home" && <Home go={setTab} />}
        {tab === "flights" && <Flights />}
        {tab === "journey" && <Journey />}
        {tab === "copilot" && <Copilot />}
        {tab === "tickets" && <Tickets />}
        {tab === "profile" && <Profile openSettings={() => setSetOpen(true)} />}
      </Suspense>
      <footer>SkySathi 4.0 · the calm space at 36,000 ft · panic button never paywalled</footer>
    </div>

    {/* bottom navigation */}
    <nav id="bottomnav" aria-label="Main">
      {TABS.map(t => <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
        <span className="nic" aria-hidden>{t.ic}</span>{t.label}</button>)}
    </nav>

    {/* notification center */}
    <div id="notifs" className={"card" + (notifOpen ? " open" : "")}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h3 style={{ fontSize: 16 }}>Notifications</h3>
        <button className="btn gearbtn" onClick={() => setNotifOpen(false)}>Close</button></div>
      {s.notifs.length ? s.notifs.map(n =>
        <div className="amen" key={n.id}><span><b>{n.title}</b> · {n.body}</span><span className="w">{n.t}</span></div>)
        : <p className="sub">All quiet. I'll tell you about gates, boarding, and landing here.</p>}
    </div>

    {/* command palette */}
    {palOpen && <div id="palette" onClick={() => setPalOpen(false)}>
      <div className="card pal" onClick={e => e.stopPropagation()}>
        <input autoFocus value={palQ} onChange={e => setPalQ(e.target.value)} placeholder="Type a command… (Esc to close)"
          onKeyDown={e => { if (e.key === "Enter" && actions[0]) { actions[0].run(); setPalOpen(false); } }} />
        {actions.slice(0, 6).map(a => <button key={a.label} className="palrow" onClick={() => { a.run(); setPalOpen(false); }}>{a.label}</button>)}
      </div></div>}

    {/* settings drawer (all preferences apply live) */}
    <div id="settings" className={"card" + (setOpen ? " open" : "")}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>Settings</h3><button className="btn gearbtn" onClick={() => setSetOpen(false)}>Close</button></div>
      <div className="setrow"><span>Theme</span>
        <select value={s.prefs.theme} onChange={e => s.setPrefs(p => ({ ...p, theme: e.target.value }))}>
          {["auto", "morning", "day", "sunset", "twilight", "night"].map(t => <option key={t}>{t}</option>)}</select></div>
      <div className="setrow"><span>Animations</span>
        <select value={s.prefs.anim} onChange={e => s.setPrefs(p => ({ ...p, anim: e.target.value }))}>
          <option value="full">full</option><option value="reduced">reduced</option></select></div>
      <div className="setrow"><span>Font size</span>
        <select value={s.prefs.font} onChange={e => s.setPrefs(p => ({ ...p, font: e.target.value }))}>
          <option value="std">standard</option><option value="large">large</option></select></div>
      <div className="setrow"><span>Colorblind-friendly</span>
        <div className={"switch" + (s.prefs.cb ? " on" : "")} onClick={() => s.setPrefs(p => ({ ...p, cb: !p.cb }))} /></div>
      <div className="setrow"><span>Copilot voice</span>
        <div className={"switch" + (s.prefs.voice ? " on" : "")} onClick={() => s.setPrefs(p => ({ ...p, voice: !p.voice }))} /></div>
      <div className="setrow"><span>AI personality</span>
        <select value={s.prefs.mode} onChange={e => s.setPrefs(p => ({ ...p, mode: e.target.value as any }))}>
          <option value="calm">calm</option><option value="educational">educational</option><option value="child">child</option></select></div>
      <div className="setrow"><span>Units</span>
        <select value={s.prefs.units} onChange={e => s.setPrefs(p => ({ ...p, units: e.target.value }))}>
          <option value="metric">metric</option><option value="aviation">aviation</option></select></div>
      <p className="sub" style={{ marginTop: 14 }}>Privacy: preferences and checklist live on this device. Raw sensor streams never leave your phone. Languages beyond English/Hindi: coming soon.</p>
    </div>

    {s.toast && <div id="toastbar">{s.toast}</div>}
  </>;
}

export default function App() { return <AppProvider><Shell /></AppProvider>; }
