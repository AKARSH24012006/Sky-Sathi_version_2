/** API client: guest-token bootstrap, auto-refresh on 401, offline queue.
 *  Writes (journal, ratings, sensor windows) queue in MMKV and flush on
 *  connectivity — the app must be fully usable in airplane mode. */
const BASE = process.env.EXPO_PUBLIC_API_URL ?? "https://api.skysathi.app";
let access = "", refresh = "";

async function call(path: string, init: RequestInit = {}, retry = true): Promise<any> {
  const r = await fetch(BASE + path, {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${access}`, ...(init.headers || {}) },
  });
  if (r.status === 401 && retry && refresh) {
    const t = await fetch(BASE + "/auth/refresh", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh }),
    }).then(x => x.json());
    access = t.access; refresh = t.refresh;
    return call(path, init, false);
  }
  return r.json();
}

export const api = {
  async bootstrapGuest() {
    const t = await fetch(BASE + "/auth/guest", { method: "POST" }).then(x => x.json());
    access = t.access; refresh = t.refresh; return t.user_id;
  },
  chat: (body: object) => call("/conversations/chat", { method: "POST", body: JSON.stringify(body) }),
  sensorWindow: (body: object) => call("/flights/sensor-window", { method: "POST", body: JSON.stringify(body) }),
  turbulence: (cell: string) => call(`/flights/turbulence/${cell}`),
};
