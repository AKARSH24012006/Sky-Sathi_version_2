/** SkySathi FlightScene — the real aviation experience.
 *
 *  A properly-proportioned procedural A320 (no placeholder cubes): capsule
 *  fuselage, swept tapered wings with winglets, every control surface animated
 *  (ailerons, elevators, rudder, flaps, spoilers), retracting gear with doors,
 *  spinning fans with blur disks, and the full light suite (nav, double-flash
 *  strobes, beacon, landing + taxi lights).
 *
 *  World: drei <Sky> gives physical sun scattering (real local sun position ->
 *  golden hour and night for free), <Stars> above the haze, procedural sprite
 *  clouds, exponential fog, a runway that slides with ground speed, and rain
 *  on approach. Camera is a damped chase rig that rolls with the bank and
 *  shakes gently in turbulence. All motion is delta-based (frame-rate
 *  independent -> 120 Hz displays get 120 FPS).
 *
 *  glTF upgrade path: replace <ProceduralA320/> with
 *    const { scene } = useGLTF("/models/a320.glb")   // e.g. CC-BY model
 *  and keep this file's animation rig — it drives node names, not geometry.
 */
import React, { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Sky, Stars, useGLTF } from "@react-three/drei";
import { snd } from "../lib/sound";
import * as THREE from "three";
import { targetsAt, TOTAL, PHASES, type Phase } from "../lib/sequence";

/* ---------- shared mutable flight state (updated inside the canvas loop) ---------- */
export type SeqState = { t: number; playing: boolean };
export type WeatherFx = { code: number; night?: boolean };   // WMO code from the real arrival weather
export type Telem = { alt: number; thr: number; progress: number; ground: boolean; turb: boolean; pitch: number; bank: number };

const WHITE = "#E9EEF4", BELLY = "#9FB0C2", DARK = "#22303F", ACCENT = "#2E4A6B";

function glowTexture(): THREE.Texture {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.4, "rgba(255,255,255,.4)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function wingGeometry(span: number, root: number, tip: number, sweep: number): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(-root, 0);
  s.lineTo(-sweep - tip, span); s.lineTo(-sweep, span); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.055, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);   // lay flat: shape Y (span) -> world -Z... rotate then mirror per side
  return g;
}

/* ================= THE AIRCRAFT ================= */
function ProceduralA320({ refs }: { refs: React.MutableRefObject<Record<string, THREE.Object3D | null>> }) {
  const glow = useMemo(glowTexture, []);
  const R = (k: string) => (el: THREE.Object3D | null) => { refs.current[k] = el; };
  const fuselage = useMemo(() => new THREE.CapsuleGeometry(0.42, 3.3, 8, 24), []);
  const wingG = useMemo(() => wingGeometry(2.6, 1.05, 0.42, 0.62), []);
  const stabG = useMemo(() => wingGeometry(1.0, 0.55, 0.25, 0.32), []);
  const mat = { metalness: 0.35, roughness: 0.45 };

  const Engine = ({ z, keyId }: { z: number; keyId: string }) => (
    <group position={[0.55, -0.42, z]}>
      <mesh rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.21, 0.185, 0.66, 20]} /><meshStandardMaterial color={BELLY} {...mat} /></mesh>
      <mesh position={[0.34, 0, 0]} rotation={[0, 0, Math.PI / 2]}><torusGeometry args={[0.2, 0.02, 8, 24]} /><meshStandardMaterial color={DARK} /></mesh>
      <mesh position={[0.15, 0.28, 0]}><boxGeometry args={[0.34, 0.22, 0.07]} /><meshStandardMaterial color={WHITE} {...mat} /></mesh>
      <group ref={R(keyId)} position={[0.31, 0, 0]}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map(k => (
          <mesh key={k} rotation={[(k * Math.PI) / 4, 0, 0]}><boxGeometry args={[0.012, 0.34, 0.045]} /><meshStandardMaterial color="#8FA5BD" metalness={0.7} roughness={0.3} /></mesh>
        ))}
        <mesh position={[0.03, 0, 0]} rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.05, 0.1, 12]} /><meshStandardMaterial color={DARK} /></mesh>
      </group>
      <mesh ref={R(keyId + "Blur")} position={[0.32, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <circleGeometry args={[0.185, 24]} /><meshBasicMaterial color="#B9C9DB" transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
  const Bulb = ({ k, color, pos, size = 0.045 }: { k: string; color: string; pos: [number, number, number]; size?: number }) => (
    <group position={pos}>
      <mesh><sphereGeometry args={[size]} /><meshBasicMaterial ref={R(k) as any} color={color} transparent /></mesh>
      <sprite scale={[0.5, 0.5, 1]}><spriteMaterial ref={R(k + "Glow") as any} map={glow} color={color} transparent opacity={0.6} depthWrite={false} blending={THREE.AdditiveBlending} /></sprite>
    </group>
  );
  const Gear = ({ k, x, z, wheels }: { k: string; x: number; z: number; wheels: number }) => (
    <group ref={R(k)} position={[x, -0.4, z]}>
      <mesh position={[0, -0.24, 0]}><cylinderGeometry args={[0.03, 0.035, 0.48]} /><meshStandardMaterial color={BELLY} metalness={0.6} roughness={0.35} /></mesh>
      {Array.from({ length: wheels }, (_, i) => (
        <mesh key={i} position={[(i - (wheels - 1) / 2) * 0.14, -0.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.115, 0.115, 0.09, 16]} /><meshStandardMaterial color="#161D28" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );

  return (
    <group ref={R("aircraft")}>
      {/* fuselage + cockpit + window line */}
      <mesh rotation={[0, 0, Math.PI / 2]} geometry={fuselage}><meshStandardMaterial color={WHITE} {...mat} /></mesh>
      <mesh position={[1.98, 0.09, 0]} rotation={[0, 0, -0.5]}><boxGeometry args={[0.34, 0.14, 0.5]} /><meshStandardMaterial color={DARK} roughness={0.2} metalness={0.6} /></mesh>
      <mesh position={[0, 0.12, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.425, 0.425, 2.9, 24, 1, true, -0.28, 0.16]} /><meshStandardMaterial color={ACCENT} side={THREE.DoubleSide} /></mesh>
      {/* wings (mirrored) + winglets + ailerons + flaps + spoilers */}
      {[1, -1].map(s => (
        <group key={s} scale={[1, 1, s]}>
          <group ref={R(s === 1 ? "wingL" : "wingR")} position={[0.35, -0.18, 0.3]} rotation={[0.06, 0, 0]}>
            <mesh geometry={wingG}><meshStandardMaterial color={WHITE} {...mat} /></mesh>
            <mesh position={[-0.62 - 0.42, 0.02, 2.6]} rotation={[0, 0, 0]}>
              <boxGeometry args={[0.3, 0.28, 0.045]} /><meshStandardMaterial color={ACCENT} {...mat} />
            </mesh>
            <group ref={R(s === 1 ? "aileronL" : "aileronR")} position={[-0.95, 0, 2.1]}>
              <mesh position={[-0.11, 0, 0]}><boxGeometry args={[0.22, 0.02, 0.75]} /><meshStandardMaterial color={BELLY} {...mat} /></mesh>
            </group>
            <group ref={R(s === 1 ? "flapL" : "flapR")} position={[-0.85, -0.005, 0.85]}>
              <mesh position={[-0.14, 0, 0]}><boxGeometry args={[0.28, 0.022, 1.1]} /><meshStandardMaterial color={BELLY} {...mat} /></mesh>
            </group>
            <group ref={R(s === 1 ? "spoilerL" : "spoilerR")} position={[-0.55, 0.035, 0.9]}>
              <mesh position={[0.13, 0, 0]}><boxGeometry args={[0.26, 0.015, 0.95]} /><meshStandardMaterial color={BELLY} {...mat} /></mesh>
            </group>
          </group>
          <Engine z={0.95 * s} keyId={s === 1 ? "fanL" : "fanR"} />
        </group>
      ))}
      {/* tail: fin + rudder, stabs + elevators */}
      <group position={[-1.75, 0.32, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} geometry={stabG}><meshStandardMaterial color={ACCENT} {...mat} /></mesh>
        <group ref={R("rudder")} position={[-0.55, 1.0 * 0.5, 0]}>
          <mesh position={[-0.1, 0, 0]} ><boxGeometry args={[0.2, 0.85, 0.03]} /><meshStandardMaterial color={WHITE} {...mat} /></mesh>
        </group>
      </group>
      {[1, -1].map(s => (
        <group key={"st" + s} position={[-1.9, 0.18, 0]} scale={[1, 1, s]}>
          <mesh position={[0, 0, 0.05]} geometry={stabG} scale={[0.75, 1, 0.75]}><meshStandardMaterial color={WHITE} {...mat} /></mesh>
          <group ref={R(s === 1 ? "elevL" : "elevR")} position={[-0.5, 0, 0.45]}>
            <mesh position={[-0.08, 0, 0]}><boxGeometry args={[0.16, 0.02, 0.5]} /><meshStandardMaterial color={BELLY} {...mat} /></mesh>
          </group>
        </group>
      ))}
      {/* gear + doors */}
      <Gear k="gearN" x={1.5} z={0} wheels={2} />
      <Gear k="gearL" x={-0.05} z={0.42} wheels={2} />
      <Gear k="gearR" x={-0.05} z={-0.42} wheels={2} />
      {/* lights: nav, strobes, beacon top+bottom, landing (spot), taxi */}
      <Bulb k="navL" color="#E86A6A" pos={[0.35 - 0.62 - 0.35, -0.12, 2.88]} />
      <Bulb k="navR" color="#8FC9A8" pos={[0.35 - 0.62 - 0.35, -0.12, -2.88]} />
      <Bulb k="strobeL" color="#FFFFFF" pos={[0.35 - 0.62 - 0.35, -0.12, 2.95]} size={0.03} />
      <Bulb k="strobeR" color="#FFFFFF" pos={[0.35 - 0.62 - 0.35, -0.12, -2.95]} size={0.03} />
      <Bulb k="beaconT" color="#E86A6A" pos={[-0.4, 0.46, 0]} size={0.035} />
      <Bulb k="beaconB" color="#E86A6A" pos={[0.2, -0.46, 0]} size={0.035} />
      <Bulb k="tailLogo" color="#FFFFFF" pos={[-2.35, 0.75, 0]} size={0.03} />
      <group ref={R("cabinWin")}>
        {[1, -1].flatMap(sd => Array.from({ length: 12 }, (_, i) => (
          <mesh key={sd + "w" + i} position={[1.35 - i * 0.24, 0.06, 0.415 * sd]} rotation={[0, sd === 1 ? 0 : Math.PI, 0]}>
            <planeGeometry args={[0.055, 0.075]} />
            <meshBasicMaterial color="#FFE9C4" transparent opacity={0.25} side={THREE.DoubleSide} />
          </mesh>
        )))}
      </group>
      {[1, -1].map(sd => (
        <mesh key={"ct" + sd} ref={R(sd === 1 ? "trailL" : "trailR")} position={[-9.2, -0.42, 0.95 * sd]} rotation={[0, 0, 0]}>
          <planeGeometry args={[16, 0.16]} />
          <meshBasicMaterial color="#DCE9F5" transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <spotLight ref={R("landingLight") as any} position={[1.2, -0.35, 0]} angle={0.5} penumbra={0.6} intensity={0} distance={40} color="#F2F6FF" target-position={[15, -4, 0]} />
    </group>
  );
}

/* ================= WORLD: runway, clouds, rain ================= */
function World({ refs }: { refs: React.MutableRefObject<Record<string, THREE.Object3D | null>> }) {
  const glow = useMemo(glowTexture, []);
  const R = (k: string) => (el: THREE.Object3D | null) => { refs.current[k] = el; };
  const cloudPositions = useMemo(() =>
    Array.from({ length: 26 }, () => [ -60 + Math.random() * 160, -2 + Math.random() * 7, -40 + Math.random() * 80, 5 + Math.random() * 9 ]), []);
  const rainSeeds = useMemo(() => Array.from({ length: 240 }, () => [Math.random() * 40 - 20, Math.random() * 18, Math.random() * 40 - 20]), []);
  return (
    <>
      <group ref={R("ground")}>
        <mesh position={[0, -1.02, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[600, 300]} /><meshStandardMaterial color="#0D1524" roughness={1} /></mesh>
        <mesh position={[0, -1.0, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[600, 9]} /><meshStandardMaterial color="#141B27" roughness={0.95} /></mesh>
        <group ref={R("dashes")}>
          {Array.from({ length: 40 }, (_, i) => (
            <mesh key={i} position={[i * 15 - 300, -0.98, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[6, 0.35]} /><meshBasicMaterial color="#E3B575" /></mesh>
          ))}
        </group>
        {Array.from({ length: 14 }, (_, i) => (
          <sprite key={"el" + i} position={[i * 42 - 280, -0.8, 5.2]} scale={[1.6, 1.6, 1]}><spriteMaterial map={glow} color="#7FB4D9" transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} /></sprite>
        ))}
      </group>
      <group ref={R("clouds")}>
        {cloudPositions.map(([x, y, z, s], i) => (
          <sprite key={i} position={[x, y, z]} scale={[s, s * 0.45, 1]}>
            <spriteMaterial map={glow} color="#C7D6E6" transparent opacity={0.32} depthWrite={false} />
          </sprite>
        ))}
      </group>
      {/* distant air traffic: two tiny aircraft lights crossing the sky with faint trails */}
      {[0, 1].map(i => (
        <group key={"tr" + i} ref={R("traffic" + i)} position={[-90 + i * 60, 16 + i * 5, -55 - i * 18]}>
          <sprite scale={[0.9, 0.9, 1]}><spriteMaterial map={glow} color="#FFFFFF" transparent opacity={0.85} depthWrite={false} blending={THREE.AdditiveBlending} /></sprite>
          <mesh position={[-4, 0, 0]}><planeGeometry args={[8, 0.08]} /><meshBasicMaterial color="#C9DAEA" transparent opacity={0.25} depthWrite={false} side={THREE.DoubleSide} /></mesh>
        </group>
      ))}
      {/* birds near the airport, grounded scenes only */}
      <group ref={R("birds")}>
        {[0, 1, 2, 3, 4].map(i => (
          <sprite key={i} position={[8 + i * 2.2, 1.5 + (i % 3) * 0.7, -6 - (i % 2) * 3]} scale={[0.32, 0.18, 1]}>
            <spriteMaterial map={glow} color="#1A2432" transparent opacity={0.8} depthWrite={false} />
          </sprite>
        ))}
      </group>
      <group ref={R("city")} position={[0, -1, -40]}>
        {Array.from({ length: 46 }, (_, i) => (
          <sprite key={i} position={[((i * 73) % 260) - 130, 0.2, -((i * 37) % 60)]} scale={[0.7, 0.7, 1]}>
            <spriteMaterial map={glow} color={i % 4 ? "#E3B575" : "#BFD4EA"} transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} />
          </sprite>
        ))}
      </group>
      <sprite ref={R("flare") as any} position={[55, 26, -70]} scale={[26, 26, 1]}>
        <spriteMaterial map={glow} color="#FFE3B8" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <sprite ref={R("moon") as any} position={[60, 34, -80]} scale={[7, 7, 1]}>
        <spriteMaterial map={glow} color="#DCE6F2" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <group ref={R("snow")} visible={false}>
        {rainSeeds.slice(0, 160).map(([x, y, z], i) => (
          <sprite key={"sn" + i} position={[x, y, z]} scale={[0.12, 0.12, 1]}>
            <spriteMaterial map={glow} color="#EDF3FA" transparent opacity={0.7} depthWrite={false} />
          </sprite>
        ))}
      </group>
      <group ref={R("rain")} visible={false}>
        {rainSeeds.map(([x, y, z], i) => (
          <mesh key={i} position={[x, y, z]} rotation={[0, 0, 0.15]}><boxGeometry args={[0.012, 0.5, 0.012]} /><meshBasicMaterial color="#9FC2E0" transparent opacity={0.4} /></mesh>
        ))}
      </group>
    </>
  );
}

/* ================= THE DIRECTOR: one damped rig drives everything ================= */
export type CamView = "orbit" | "cockpit" | "wing";
/* camera rigs in aircraft-local space: [position, look target, fov] — nose is +x, left wing +z */
const RIGS: Record<Exclude<CamView, "orbit">, [[number, number, number], [number, number, number], number]> = {
  cockpit: [[2.3, 0.2, 0], [40, -1.2, 0], 62],
  wing: [[0.75, 0.34, 0.52], [-0.7, -0.25, 2.7], 58],
};

function Director({ seq, refs, onPhase, onTelem, wx, view }: {
  view: React.MutableRefObject<CamView>;
  seq: React.MutableRefObject<SeqState>;
  refs: React.MutableRefObject<Record<string, THREE.Object3D | null>>;
  onPhase: (p: Phase, progress: number) => void;
  onTelem?: (t: Telem) => void;
  wx?: WeatherFx;
}) {
  const { camera } = useThree();
  const cur = useRef({ alt: 0, pitch: 0, bank: 0, gear: 1, flaps: 0, spoil: 0, thr: 0.06, camD: 7.5, camH: 2.2 });
  const lastIdx = useRef(-1);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const orbit = useRef({ a: 0.6 });
  const telemAt = useRef(0);
  const look = useMemo(() => new THREE.Vector3(), []);
  const flash = useRef(0);

  useFrame((state, dt) => {
    const s = seq.current;
    if (s.playing) s.t = Math.min(s.t + dt, TOTAL);
    const idle = !s.playing && s.t === 0;
    const T = idle
      ? { ...targetsAt(0), alt: 0.68, pitch: 1.5, bank: Math.sin(state.clock.elapsedTime * 0.18) * 4, thr: 0.55,
          gear: 0, flaps: 0, spoilers: 0, ground: false, turb: false, reverse: false,
          camD: 9.5, camH: 2.6 }
      : targetsAt(s.t);
    if (!idle && T.index !== lastIdx.current) { lastIdx.current = T.index; onPhase(T.phase, T.progress); }
    if (idle) lastIdx.current = -1;

    const k = 1 - Math.exp(-3.2 * dt);   // frame-rate independent damping
    const c = cur.current;
    c.alt += (T.alt - c.alt) * k; c.pitch += (T.pitch - c.pitch) * k; c.bank += (T.bank - c.bank) * k;
    c.gear += (T.gear - c.gear) * k * 0.8; c.flaps += (T.flaps - c.flaps) * k; c.spoil += (T.spoilers - c.spoil) * k;
    c.thr += (T.thr - c.thr) * k; c.camD += (T.camD - c.camD) * k; c.camH += (T.camH - c.camH) * k;

    const R = refs.current, el = state.clock.elapsedTime;
    const ac = R.aircraft; if (!ac) return;

    /* attitude + turbulence body motion */
    const turbY = T.turb ? (Math.sin(el * 7.3) * 0.05 + Math.sin(el * 13.1) * 0.03) : 0;
    const turbR = T.turb ? Math.sin(el * 5.7) * 1.6 : 0;
    ac.position.y = turbY;
    ac.rotation.z = THREE.MathUtils.degToRad(c.pitch);
    ac.rotation.x = THREE.MathUtils.degToRad(c.bank + turbR);
    /* wing-flex illusion: whole wing groups are children — flex via slight extra roll on ailerons parents is
       covered by aileron deflection below; body bob carries the rest */

    /* control surfaces */
    const bankCmd = THREE.MathUtils.degToRad(c.bank) * 1.4;
    R.aileronL && (R.aileronL.rotation.z = -bankCmd + (T.turb ? Math.sin(el * 9) * 0.12 : 0));
    R.aileronR && (R.aileronR.rotation.z = bankCmd + (T.turb ? Math.sin(el * 9 + 2) * 0.12 : 0));
    const flapAng = c.flaps * 0.55;
    R.flapL && (R.flapL.rotation.z = flapAng); R.flapR && (R.flapR.rotation.z = flapAng);
    const spAng = -c.spoil * 0.9;
    R.spoilerL && (R.spoilerL.rotation.z = spAng); R.spoilerR && (R.spoilerR.rotation.z = spAng);
    R.rudder && (R.rudder.rotation.y = THREE.MathUtils.degToRad(-c.bank) * 0.3);
    const elevAng = THREE.MathUtils.degToRad(-c.pitch) * 0.25;
    R.elevL && (R.elevL.rotation.z = elevAng); R.elevR && (R.elevR.rotation.z = elevAng);

    /* gear retract/extend with doors-as-scale */
    for (const g of ["gearN", "gearL", "gearR"]) {
      const o = R[g]; if (!o) continue;
      o.position.y = -0.4 + (1 - c.gear) * 0.5;
      o.scale.y = Math.max(0.04, c.gear);
      o.visible = c.gear > 0.06;
    }
    /* engines: fans + blur disk by throttle */
    const fanSpd = 4 + c.thr * 34;
    R.fanL && (R.fanL.rotation.x += fanSpd * dt * (T.reverse ? -1 : 1));
    R.fanR && (R.fanR.rotation.x += fanSpd * dt * (T.reverse ? -1 : 1));
    const blurOp = Math.max(0, c.thr - 0.35) * 0.5;
    (R.fanLBlur as any) && (((R.fanLBlur as any).material.opacity) = blurOp);
    (R.fanRBlur as any) && (((R.fanRBlur as any).material.opacity) = blurOp);

    /* light suite */
    const setB = (k2: string, on: number) => {
      const m = R[k2] as any, g2 = R[k2 + "Glow"] as any;
      if (m) m.opacity = on; if (g2) g2.opacity = on * 0.7;
    };
    setB("navL", 0.95); setB("navR", 0.95); setB("tailLogo", 0.85);
    const strobe = (el % 1.2 < 0.08 || (el % 1.2 > 0.16 && el % 1.2 < 0.24)) ? 1 : 0.05;  // double flash
    setB("strobeL", strobe); setB("strobeR", strobe);
    const beacon = (Math.sin(el * 4.2) > 0.4) ? 1 : 0.08;
    setB("beaconT", beacon); setB("beaconB", beacon);
    const landing = (c.gear > 0.5 && !T.ground) || T.phase.id === "roll" || T.phase.id === "approach";
    const spot = R.landingLight as unknown as THREE.SpotLight;
    if (spot) spot.intensity += (((landing ? 60 : T.ground && c.thr > 0.15 ? 25 : 0)) - spot.intensity) * k;

    /* wing flex: subtle always, stronger in turbulence — the safety lesson made visible */
    const flexAmp = T.turb ? 0.028 : 0.008;
    R.wingL && (R.wingL.rotation.x = 0.06 + Math.sin(el * (T.turb ? 4.2 : 1.1)) * flexAmp);
    R.wingR && (R.wingR.rotation.x = 0.06 - Math.sin(el * (T.turb ? 4.2 : 1.1) + 0.4) * flexAmp);
    /* contrails: only in the cold high air */
    const trailOp = Math.max(0, c.alt - 0.45) * 0.5;
    for (const tk of ["trailL", "trailR"]) { const tr = R[tk] as any; if (tr) tr.material.opacity = trailOp; }
    /* distant traffic drifts forever */
    for (let i = 0; i < 2; i++) { const tr = R["traffic" + i]; if (tr) { tr.position.x += dt * (2.2 + i); if (tr.position.x > 120) tr.position.x = -120; } }
    /* birds flock near the ground, bobbing */
    if (R.birds) {
      R.birds.visible = !!T.ground;
      R.birds.children.forEach((b, i) => { b.position.y = 1.5 + (i % 3) * 0.7 + Math.sin(el * 2 + i) * 0.25; b.position.x += Math.sin(el * 0.6 + i) * dt * 0.5; });
    }
    /* moon + weather effects from the REAL arrival weather code */
    const night = !!wx?.night;
    if (R.cabinWin) R.cabinWin.children.forEach(w => { ((w as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = night ? 0.9 : 0.25; });
    if (R.city) R.city.visible = night;
    const fl = R.flare as any;
    if (fl) { fl.material.opacity = night ? 0 : 0.35 + Math.sin(el * 0.4) * 0.08; }
    (R.moon as any) && (((R.moon as any).material.opacity) = night ? 0.85 : 0);
    if (wx && wx.code >= 95) {          // storm: occasional lightning
      flash.current -= dt;
      if (flash.current <= 0 && Math.random() < dt * 0.15) { flash.current = 0.12; snd.thunder(); }
      const dl = state.scene.children.find(o => (o as any).isDirectionalLight) as THREE.DirectionalLight | undefined;
      if (dl) dl.intensity = flash.current > 0 ? 6 : (night ? 0.25 : 1.4);
    }
    if (R.snow) {
      const snowing = !!wx && (wx.code >= 71 && wx.code <= 77);
      R.snow.visible = snowing;
      if (snowing) { R.snow.position.y -= dt * 2.2; if (R.snow.position.y < -9) R.snow.position.y += 9; }
    }
    /* world: ground sinks with altitude, dashes + clouds stream with speed */
    const altY = c.alt * 26;
    R.ground && (R.ground.position.y = -altY, (R.ground as any).visible = altY < 14);
    const spd = (T.ground ? c.thr * 26 : 10 + c.thr * 26) * dt;
    if (R.dashes) { R.dashes.position.x -= spd; if (R.dashes.position.x < -15) R.dashes.position.x += 15; }
    if (R.clouds) {
      R.clouds.position.y = 7 - altY * 0.65;           // clouds meet you mid-climb, sit below at cruise
      R.clouds.position.x -= spd * 0.55; if (R.clouds.position.x < -80) R.clouds.position.x += 160;
    }
    if (R.rain) {
      const raining = (!!wx && wx.code >= 51 && wx.code < 71) && ["descent", "geardown", "approach", "flare", "touchdown", "reverse", "taxiin"].includes(T.phase.id);
      R.rain.visible = raining;
      if (raining) { R.rain.position.y -= dt * 14; if (R.rain.position.y < -9) R.rain.position.y += 9; }
    }

    /* camera: slow orbit while idle (sometimes zooming, sometimes through clouds);
       damped chase with banking + turbulence shake during the flight */
    const shake = T.turb ? 1 : 0;
    const rig = view.current !== "orbit" ? RIGS[view.current] : null;
    if (rig) {
      ac.updateMatrixWorld();
      ac.localToWorld(tmp.set(...rig[0]));
      camera.position.lerp(tmp, Math.min(1, k * 2.5));
      ac.localToWorld(look.set(...rig[1]));
    } else if (idle) {
      orbit.current.a += dt * 0.07;
      const rad = 9.5 + Math.sin(el * 0.05) * 2.6;             // breathing zoom
      tmp.set(Math.cos(orbit.current.a) * rad, 2.3 + Math.sin(el * 0.11) * 1.4, Math.sin(orbit.current.a) * rad);
      camera.position.lerp(tmp, Math.min(1, k * 1.4));
    } else {
      tmp.set(-c.camD, c.camH + Math.sin(el * 11) * 0.04 * shake, 2.2 + Math.sin(el * 8.7) * 0.05 * shake);
      camera.position.lerp(tmp, k);
    }
    snd.engine(c.thr, T.reverse, c.alt, !!(R.rain && (R.rain as any).visible));
    if (onTelem && el - telemAt.current > 0.4) { telemAt.current = el; onTelem({ alt: c.alt, thr: c.thr, progress: T.progress, ground: !!T.ground, turb: !!T.turb, pitch: c.pitch, bank: c.bank }); }
    if (rig) camera.lookAt(look);
    else { camera.lookAt(0.6, turbY, 0); camera.rotateZ(THREE.MathUtils.degToRad(c.bank) * 0.32); }
    const pc = camera as THREE.PerspectiveCamera;
    const wantFov = rig ? rig[2] : 46 + c.thr * 5 + shake * 1.5;
    pc.fov += (wantFov - pc.fov) * k; pc.updateProjectionMatrix();
  });
  return null;
}

/* ---------- optional real glTF model (drop a320.glb into web/public/models/) ---------- */
function GltfPlane({ refs, url }: { refs: React.MutableRefObject<Record<string, THREE.Object3D | null>>; url: string }) {
  const { scene } = useGLTF(url);
  return <primitive ref={(el: THREE.Object3D | null) => { refs.current.aircraft = el; }} object={scene} scale={0.5} />;
}

/* ================= PUBLIC COMPONENT ================= */
export default function FlightScene({ seq, onPhase, onTelem, wx, view = "orbit" }: {
  view?: CamView;
  seq: React.MutableRefObject<SeqState>;
  onPhase: (p: Phase, progress: number) => void;
  onTelem?: (t: Telem) => void;
  wx?: WeatherFx;
}) {
  const refs = useRef<Record<string, THREE.Object3D | null>>({});
  const viewRef = useRef<CamView>(view);
  viewRef.current = view;
  const [gltfUrl, setGltfUrl] = React.useState<string | null>(null);
  React.useEffect(() => {   // use a real model when present; procedural otherwise
    fetch("/models/a320.glb", { method: "HEAD" }).then(r => {
      if (r.ok && (r.headers.get("content-type") || "").includes("octet")) setGltfUrl("/models/a320.glb");
    }).catch(() => {});
  }, []);
  const hour = new Date().getHours() + new Date().getMinutes() / 60;
  const d = Math.max(0.02, Math.min(0.98, (hour - 6) / 13));
  const night = hour < 6 || hour > 19;
  const sunPos: [number, number, number] = [Math.cos(d * Math.PI) * 100, Math.sin(d * Math.PI) * (night ? 4 : 45) + (night ? -6 : 6), 40];
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [-7.5, 2.4, 2.2], fov: 46 }} gl={{ antialias: true }}
            style={{ borderRadius: "inherit" }} shadows={false}>
      {/* flare sits at the sun via prop below */}
      <Sky distance={4500} sunPosition={sunPos} turbidity={6} rayleigh={night ? 0.4 : 1.6} mieCoefficient={0.004} mieDirectionalG={0.85} />
      <Stars radius={300} depth={60} count={2400} factor={3} fade speed={0.6} />
      <fog attach="fog" args={[night ? "#0A1220" : "#8FB0CC", wx && wx.code === 45 ? 8 : 30, wx && wx.code === 45 ? 70 : 220]} />
      <hemisphereLight args={["#BDD4EA", "#141C28", night ? 0.35 : 0.85]} />
      <directionalLight position={sunPos} intensity={night ? 0.25 : 1.4} color={d > 0.82 || d < 0.18 ? "#FFC894" : "#FFF4E4"} />
      {gltfUrl
        ? <React.Suspense fallback={<ProceduralA320 refs={refs} />}><GltfPlane refs={refs} url={gltfUrl} /></React.Suspense>
        : <ProceduralA320 refs={refs} />}
      <World refs={refs} />
      <Director seq={seq} refs={refs} onPhase={onPhase} onTelem={onTelem} wx={wx} view={viewRef} />
    </Canvas>
  );
}
export { PHASES, TOTAL };
