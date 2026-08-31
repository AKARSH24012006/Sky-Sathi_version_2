import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useApp } from "../store";
import { fmt } from "../lib/api";
import { airlineFor } from "../lib/airlines";

const SEAT = "14A";
export default function Tickets() {
  const s = useApp();
  const qr = useRef<HTMLCanvasElement>(null);
  const [sel, setSel] = useState(SEAT);
  useEffect(() => {
    if (qr.current) QRCode.toCanvas(qr.current,
      JSON.stringify({ pnr: "SKYSTH", flight: s.flight?.flight_no ?? "AI101", seat: SEAT, gate: s.flight?.gate ?? "24B", name: "AKARSH NEHRA" }),
      { width: 148, margin: 1, color: { dark: "#0E1420", light: "#E8EDF3" } });
  }, [s.flight]);
  const rows = Array.from({ length: 30 }, (_, r) => r + 1);
  const cols = ["A", "B", "C", "D", "E", "F"];
  return <>
    <div className="card bpass">
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
        <canvas ref={qr} style={{ borderRadius: 12, flex: "none" }} aria-label="Boarding QR code" />
        <div style={{ flex: 1, minWidth: 200 }}>
          <p className="eyebrow">{airlineFor(s.flight?.flight_no)} · {fmt(s.flight?.flight_no)} · {fmt(s.flight?.aircraft)}</p>
          <h2 style={{ fontSize: 26, margin: "6px 0" }}>DEL → BLR</h2>
          <div className="wcards" style={{ marginTop: 8 }}>
            <div className="wcard"><div className="k">Gate</div><div className="v mono">{fmt(s.flight?.gate)}</div></div>
            <div className="wcard"><div className="k">Seat</div><div className="v mono">{SEAT} · window</div></div>
            <div className="wcard"><div className="k">Boarding group</div><div className="v mono">B</div></div>
            <div className="wcard"><div className="k">Baggage</div><div className="v">1 × 15 kg checked</div></div>
            <div className="wcard"><div className="k">Departs</div><div className="v mono">{fmt(s.flight?.depart)}</div></div>
            <div className="wcard"><div className="k">Arrives</div><div className="v mono">{fmt(s.flight?.arrive)}</div></div>
          </div>
        </div>
      </div>
    </div>

    <div className="card" style={{ marginTop: 14 }}>
      <p className="eyebrow">Seat map · A320neo · tap a seat</p>
      <div className="seatmap">
        {rows.map(r => <div className="srow" key={r}>
          <span className="rn">{r}</span>
          {cols.map((c, i) => {
            const id = r + c;
            return <button key={id} className={"seat" + (id === sel ? " sel" : "") + (i === 2 ? " aisle" : "")}
              onClick={() => setSel(id)} aria-label={`Seat ${id}`} />;
          })}
        </div>)}
      </div>
      <p className="sub" style={{ marginTop: 10 }}>{sel === SEAT ? `${SEAT} — your seat. Window, left side: Western Ghats views on descent, and over the wing means the smoothest ride on the aircraft.` : `${sel} — ${sel.endsWith("A") || sel.endsWith("F") ? "window" : sel.endsWith("C") || sel.endsWith("D") ? "aisle" : "middle"}. Rows 12–16 sit over the wing: measurably less motion in turbulence.`}</p>
    </div>

    <div className="card" style={{ marginTop: 14 }}>
      <p className="eyebrow">Your aircraft</p>
      <div className="wcards">
        <div className="wcard"><div className="k">Type</div><div className="v">{fmt(s.flight?.aircraft)}</div><div className="d">The world's best-selling airliner family</div></div>
        <div className="wcard"><div className="k">Registration</div><div className="v mono">VT-IJS</div><div className="d">demo data — live lookup with AeroDataBox key</div></div>
        <div className="wcard"><div className="k">Age</div><div className="v">3.4 years</div><div className="d">demo data — young fleet, quieter engines</div></div>
        <div className="wcard"><div className="k">Safety heritage</div><div className="v">A320 family</div><div className="d">11,000+ built · redundancy in every system</div></div>
      </div>
    </div>
  </>;
}
