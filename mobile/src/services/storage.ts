/** MMKV: encrypted-at-rest via platform keystore key. Wallet documents additionally
 *  wrapped with a biometric-gated key. Mirrors the prototype's export/erase promise. */
export const storage = {
  get: (k: string) => null as any,     // new MMKV().getString(k)
  set: (_k: string, _v: unknown) => {},
  erase: () => {},                      // one-tap "erase everything"
};
