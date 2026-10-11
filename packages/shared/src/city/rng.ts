/** 32-bit FNV-1a over UTF-16 code units. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Deterministic: reopening a world after a server restart needs only its worldId. */
export function seedFromWorldId(worldId: string): string {
  return hashString(`seed|${worldId}`).toString(16).padStart(8, '0') + hashString(`${worldId}|seed`).toString(16).padStart(8, '0');
}

/** mulberry32 in [0, 1), keyed by seed plus salt (e.g. 'fallback', cx, cz). */
export function createRng(seed: string, ...salt: (string | number)[]): () => number {
  let a = hashString([seed, ...salt].join('|'));
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
