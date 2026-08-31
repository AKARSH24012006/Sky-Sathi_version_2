/** Genuinely live flight tracker: real ADS-B position (adsb.lol) + flight status
 *  (AeroDataBox when a key is set, else clearly-labeled demo data). Polls on its
 *  own — separate from the cinematic 3D sequence, which stays a rehearsal, not
 *  a claim of live telemetry. Type any flight number; defaults to an Air India one. */
import { useEffect, useRef, useState } from "react";
import { api, fmt, type Track } from "../lib/api";
import { airlineFor } from "../lib/airlines";

const POLL_MS = 15000;

export default function LiveTracker({ defaultFlight = "AI101" }: { defaultFlight?: string }) {
  const [input, setInput] = useState(defaultFlight);
  const [flightNo, setFlightNo] = useState(defaultFlight);
  const [track, setTrack] = useState<Track | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const t = await api.track(flightNo);
      if (cancelled) return;
      setTrack(t); setLoading(false); setUpdatedAt(Date.now());
    };
    setLoading(true);
    poll();
    timer.current = setInterval(poll, POLL_MS);
    return () => { cancelled = true; if (timer.current) clearInterval(timer.current); };
  }, [flightNo]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = input.trim().toUpperCase();
    if (v) setFlightNo(v);
  };

  const airborne = track?.position?.found;
  const secsAgo = updatedAt ? Math.max(0, Math.round((now - updatedAt) / 1000)) : null;
  const airline = track?.airline ?? airlineFor(flightNo);

  return (
    <div className="card" id="liveTrack">
      <p className="eyebrow">Live tracker · real ADS-B position</p>
      <form onSubmit={submit} className="trackRow">
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Flight no. e.g. AI101"
               spellCheck={false} autoCapitalize="characters" />
        <button className="btn" type="submit" style={{ margin: 0, width: "auto", padding: "0 18px" }}>Track</button>
      </form>

      {loading ? (
        <div style={{ marginTop: 14 }}><div className="big skeleton">— —</div><p className="sub skeleton">contacting live network…</p></div>
      ) : airborne ? (
        <div style={{ marginTop: 14 }}>
          <div className="trackHead">
            <span className="livedot" />
            <span className="trackTitle">{airline} {track!.flight_no}</span>
            <span className="src">live · adsb.lol</span>
          </div>
          <div id="instruments" style={{ marginTop: 12 }}>
            <div className="inst"><div className="k">Altitude</div><div className="v">{fmt(track!.position.alt_ft, " ft")}</div></div>
            <div className="inst"><div className="k">Ground speed</div><div className="v">{fmt(track!.position.gspd_kt, " kt")}</div></div>
            <div className="inst"><div className="k">Heading</div><div className="v">{fmt(track!.position.heading, "°")}</div></div>
            <div className="inst"><div className="k">Position</div><div className="v">{fmt(track!.position.lat?.toFixed(2))}, {fmt(track!.position.lon?.toFixed(2))}</div></div>
            <div className="inst"><div className="k">Status</div><div className="v">{fmt(track!.status?.status)}</div></div>
            <div className="inst"><div className="k">Gate</div><div className="v">{fmt(track!.status?.gate)}</div></div>
          </div>
          <p className="src" style={{ marginTop: 10 }}>updated {secsAgo}s ago · refreshes every 15s</p>
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          <p className="sub">
            <b>{airline} {flightNo}</b> isn't broadcasting a position right now — either it's on the ground,
            outside ADS-B coverage, or not currently scheduled. Status below is {track?.status?.source?.includes("demo") ? "demo data" : "from " + track?.status?.source}.
          </p>
          <div id="instruments" style={{ marginTop: 12 }}>
            <div className="inst"><div className="k">Status</div><div className="v">{fmt(track?.status?.status)}</div></div>
            <div className="inst"><div className="k">Gate</div><div className="v">{fmt(track?.status?.gate)}</div></div>
            <div className="inst"><div className="k">Departs</div><div className="v">{fmt(track?.status?.depart)}</div></div>
            <div className="inst"><div className="k">Arrives</div><div className="v">{fmt(track?.status?.arrive)}</div></div>
          </div>
          <p className="src" style={{ marginTop: 10 }}>checked {secsAgo}s ago · retrying every 15s · try a flight number that's currently airborne for a live position lock</p>
        </div>
      )}
    </div>
  );
}
