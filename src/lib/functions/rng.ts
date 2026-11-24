/** Small deterministic helpers so the same anchor always yields the same sample workspace. */

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

export type Rng = {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(xs: readonly T[]): T;
  chance(p: number): boolean;
  /** Weighted pick. */
  weighted<T>(xs: readonly [T, number][]): T;
  hex(n: number): string;
  /** Roughly normal, clamped to a positive value. */
  around(mean: number, spread: number): number;
};

export function rng(seed: string | number): Rng {
  let a = (typeof seed === "string" ? hashString(seed) : seed) >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r: Rng = {
    next,
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    pick: (xs) => xs[Math.floor(next() * xs.length)],
    chance: (p) => next() < p,
    weighted: (xs) => {
      const total = xs.reduce((s, [, w]) => s + w, 0);
      let x = next() * total;
      for (const [v, w] of xs) { x -= w; if (x <= 0) return v; }
      return xs[xs.length - 1][0];
    },
    hex: (n) => { let s = ""; while (s.length < n) s += Math.floor(next() * 16).toString(16); return s; },
    around: (mean, spread) => {
      const g = (next() + next() + next() + next() - 2) / 0.58;
      return Math.max(mean * 0.15, mean + g * spread);
    },
  };
  return r;
}
