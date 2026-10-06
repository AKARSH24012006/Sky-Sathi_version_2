import { useRef, useState } from "react";
import { useApp } from "../store";
import TerminalNavigator from "../components/TerminalNavigator";
import ArrivalPlanner from "../components/ArrivalPlanner";

export default function Airport() {
  const s = useApp();
  const [airport, setAirport] = useState<"DEL" | "BLR">("DEL");
  const [preset, setPreset] = useState<{ dest?: string; nonce: number }>({ nonce: 0 });
  const top = useRef<HTMLDivElement>(null);
  const showOnMap = (dest: string) => {
    setAirport("BLR"); setPreset(p => ({ dest, nonce: p.nonce + 1 }));
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return <div ref={top} style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0,1fr)" }}>
    <TerminalNavigator airport={airport} setAirport={a => { setAirport(a); setPreset(p => ({ nonce: p.nonce + 1 })); }} preset={preset} />
    <ArrivalPlanner arrive={s.flight?.arrive} showOnMap={showOnMap} />
  </div>;
}
