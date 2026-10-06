/** Storage that never throws (private windows, sandboxed previews, blocked site data). */
const wrap = (s: () => Storage) => ({
  get(k: string): string | null { try { return s().getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { s().setItem(k, v); } catch { /* ignore */ } },
});
export const local = wrap(() => localStorage);
export const session = wrap(() => sessionStorage);
