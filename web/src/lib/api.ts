/** Backend client. Bootstraps a guest session automatically (no login screen),
 *  retries once on 401, and every fetch degrades to null instead of throwing
 *  into the UI. fmt() guarantees the interface never renders undefined/NaN. */
let token: string | null = null;
let bootstrapping: Promise<void> | null = null;

async function guestLogin(): Promise<void> {
  const r = await fetch("/api/auth/guest", { method: "POST" });
  if (r.ok) token = (await r.json()).access;
}
function ensureAuth(): Promise<void> {
  if (token) return Promise.resolve();
  if (!bootstrapping) bootstrapping = guestLogin().finally(() => { bootstrapping = null; });
  return bootstrapping;
}

async function call<T>(path: string, init?: RequestInit, authed = false): Promise<T | null> {
  try {
    if (authed) await ensureAuth();
    const headers: Record<string, string> = { "content-type": "application/json", ...(init?.headers as any) };
    if (authed && token) headers.authorization = `Bearer ${token}`;
    let r = await fetch("/api" + path, { ...init, headers });
    if (r.status === 401 && authed) {           // token expired -> one silent re-auth
      token = null; await ensureAuth();
      if (token) headers.authorization = `Bearer ${token}`;
      r = await fetch("/api" + path, { ...init, headers });
    }
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export type Weather = { iata: string; temp_c: number; summary: string; wind_kmh: number; code: number; calm_note: string; source: string };
export type LiveFlight = { flight_no: string; status: string; gate: string; depart: string; arrive: string; aircraft: string; source: string };
export type Position = { callsign: string; found: boolean; lat?: number; lon?: number; alt_ft?: number; gspd_kt?: number; heading?: number; source: string };
export type Track = { flight_no: string; airline: string | null; status: LiveFlight; position: Position };

export type KbEntry = { id: string; text: string; calm: string; tags: string };
export type Amenity = { kind: string; name: string; walk_min: number; near: string };

export const api = {
  kb: () => call<{ version: string; entries: KbEntry[] }>(`/conversations/kb/bundle`),
  amenities: (iata: string) => call<Amenity[]>(`/airports/${iata}/amenities`),
  weather: (iata: string) => call<Weather>(`/weather/${iata}`),
  liveFlight: (no: string) => call<LiveFlight>(`/flights/live/${no}`),
  position: (cs: string) => call<Position>(`/flights/position/${cs}`),
  track: (no: string) => call<Track>(`/flights/track/${encodeURIComponent(no)}`),
  chat: (text: string, anxiety = "calm") =>
    call<{ conversation_id: string; reply: string }>(`/conversations/chat`,
      { method: "POST", body: JSON.stringify({ text, mode: "flight", anxiety_band: anxiety, live: {} }) }, true),
};

/** Safe formatter: the UI never shows undefined / null / NaN — always an em dash. */
export const fmt = (v: unknown, suffix = ""): string =>
  v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v)) ? "—" : `${v}${suffix}`;
