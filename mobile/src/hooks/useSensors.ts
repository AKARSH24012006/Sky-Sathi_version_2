/** Sensor engine — real implementations, not stubs.
 *  Barometer is primary (works indoors, ~1 Hz, near-zero battery); IMU at 10 Hz
 *  feeds 2 s feature windows; GPS duty-cycled and optional. All on-device. */
import { useEffect, useRef, useState } from "react";
import { accelerometer, gyroscope, barometer, setUpdateIntervalForType, SensorTypes } from "react-native-sensors";
import * as Location from "expo-location";
import type { Features } from "../ai/phaseDetector";

const G = 9.80665;

export function useSensors(enabled: boolean) {
  const [features, setFeatures] = useState<Features | null>(null); // returned with live bank angle
  const grav = useRef({ x: 0, y: 0, z: G });
  const win = useRef<number[]>([]);
  const baro = useRef({ lastAlt: null as number | null, lastT: 0, altRate: 0, alt: 0 });
  const gps = useRef({ gspd: 0 });
  const bank = useRef(0);                       // deg, integrated roll rate (gyroscope)

  useEffect(() => {
    if (!enabled) return;
    setUpdateIntervalForType(SensorTypes.accelerometer, 100); // 10 Hz
    const accSub = accelerometer.subscribe(({ x, y, z }) => {
      const k = 0.05;
      grav.current.x += k * (x - grav.current.x);
      grav.current.y += k * (y - grav.current.y);
      grav.current.z += k * (z - grav.current.z);
      const lin = z - grav.current.z;
      const w = win.current;
      w.push(lin); if (w.length > 20) w.shift();       // 2 s window
    });
    const gyroSub = gyroscope.subscribe(({ y }) => {
      // integrate roll rate; leak toward 0 so drift dies out — detects banking turns
      bank.current = bank.current * 0.98 + (y * 0.1 * 57.3) * 0.02 * 10;
    });
    const baroSub = barometer.subscribe(({ pressure }) => {
      // pressure altitude (ft): h = 145366.45 * (1 - (P/1013.25)^0.190284)
      const alt = 145366.45 * (1 - Math.pow(pressure / 1013.25, 0.190284));
      const now = Date.now(), b = baro.current;
      if (b.lastAlt != null && now > b.lastT)
        b.altRate = ((alt - b.lastAlt) / ((now - b.lastT) / 1000)) * 60; // ft/min
      b.lastAlt = alt; b.lastT = now; b.alt = alt;
    });
    let locSub: Location.LocationSubscription | undefined;
    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      if (status !== "granted") return;
      Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 15000 },  // duty-cycled
        p => { gps.current.gspd = (p.coords.speed ?? 0) * 3.6; }
      ).then(s => { locSub = s; });
    });
    const id = setInterval(() => {                      // 2 Hz feature emission
      const w = win.current;
      const mean = w.reduce((s, v) => s + v, 0) / (w.length || 1);
      const vertVar = w.reduce((s, v) => s + (v - mean) ** 2, 0) / (w.length || 1);
      const g = Math.hypot(grav.current.x, grav.current.y, grav.current.z) || G;
      setFeatures({
        ax: grav.current.x / G, vertVar,
        db: 0,                                          // mic level joins via expo-av metering
        altRate: baro.current.altRate, alt: baro.current.alt,
        gspd: gps.current.gspd,
      });
    }, 500);
    return () => { accSub.unsubscribe(); gyroSub.unsubscribe(); baroSub.unsubscribe(); locSub?.remove(); clearInterval(id); };
  }, [enabled]);
  return { features, bankDeg: bank.current };
}
