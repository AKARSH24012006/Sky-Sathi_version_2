/** Offline mode: typed TTL caches over MMKV. Before a flight, prefetch() pulls
 *  the flight pack, airport pack and full KB bundle; in airplane mode every
 *  read serves from cache with staleness metadata instead of an error. */
import { storage } from "./storage";
import { api } from "./api";

type Cached<T> = { data: T; at: number };
const put = <T,>(k: string, data: T) => storage.set("off:" + k, { data, at: Date.now() } as Cached<T>);
const get = <T,>(k: string, maxAgeMs = 24 * 3600_000): { data: T; stale: boolean } | null => {
  const c = storage.get("off:" + k) as Cached<T> | null;
  return c ? { data: c.data, stale: Date.now() - c.at > maxAgeMs } : null;
};

export const offline = {
  async prefetch(flightNo: string, origin: string, dest: string) {
    const [flight, oAp, dAp, oWx, dWx, kb] = await Promise.all([
      fetch(`/flights/live/${flightNo}`).then(r => r.json()),
      fetch(`/airports/${origin}`).then(r => r.json()),
      fetch(`/airports/${dest}`).then(r => r.json()),
      fetch(`/weather/${origin}`).then(r => r.json()),
      fetch(`/weather/${dest}`).then(r => r.json()),
      fetch(`/conversations/kb/bundle`).then(r => r.json()),
    ]);
    put("flight:" + flightNo, flight);
    put("airport:" + origin, oAp); put("airport:" + dest, dAp);
    put("wx:" + origin, oWx); put("wx:" + dest, dWx);
    put("kb", kb);
    return { packs: 6, kbEntries: kb.entries?.length ?? 0 };
  },
  flight: (no: string) => get("flight:" + no, 2 * 3600_000),
  airport: (iata: string) => get("airport:" + iata),
  weather: (iata: string) => get("wx:" + iata, 3600_000),
  kb: () => get<{ entries: { id: string; text: string; calm: string; tags: string }[] }>("kb", 7 * 24 * 3600_000),
  /** offline chat: same keyword retrieval the backend falls back to — identical facts */
  answer(q: string): string | null {
    const kb = this.kb()?.data.entries; if (!kb) return null;
    const ql = new Set(q.toLowerCase().split(/\s+/));
    const best = [...kb].sort((a, b) =>
      [...ql].reduce((s, w) => s + (b.tags.includes(w) ? 3 : b.text.toLowerCase().includes(w) ? 1 : 0), 0) -
      [...ql].reduce((s, w) => s + (a.tags.includes(w) ? 3 : a.text.toLowerCase().includes(w) ? 1 : 0), 0))[0];
    return best ? best.text + " " + best.calm : null;
  },
};
