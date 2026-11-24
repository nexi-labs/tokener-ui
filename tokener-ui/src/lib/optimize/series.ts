import { SAMPLE_PROMPTS } from "./samples";
import { MODE_STAGES, optimize } from "./stages";

/**
 * Sample time series for the dashboard. They are generated from a fixed seed so the graphs do not change between renders, and they are scaled to
 * the same totals as the sample figures on the Savings tab. Nothing here is measured. The live numbers come from the gateway's savings ledger.
 */

export type Range = "24h" | "7d" | "30d";
export const RANGES: { value: Range; label: string }[] = [{ value: "24h", label: "24 hours" }, { value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }];

export type Point = {
  t: string; requests: number; originalM: number; sentM: number;
  caching: number; cleanup: number; other: number; // USD saved by group
  exact: number; semantic: number;                    // cache hit rate, percent of requests
  agreement: number; details: number;                 // shadow quality, percent
  p50: number; p95: number;                           // optimizer overhead, ms
};

function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// 1.08 makes up for the quieter weekends, so the 30 day totals match the Savings tab.
const K = 1.08;
const DAILY = { original: 69 * K, requests: 120_000 * K, caching: (4290 / 30) * K, cleanup: (2350 / 30) * K, other: (3230 / 30) * K };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function series(range: Range): Point[] {
  const r = rng(range === "24h" ? 11 : range === "7d" ? 23 : 37);
  const n = range === "24h" ? 24 : range === "7d" ? 7 : 30;
  const share = range === "24h" ? 1 / 24 : 1;
  const end = new Date(Date.UTC(2026, 9, 31, 12));
  return Array.from({ length: n }, (_, i) => {
    const back = n - 1 - i;
    const d = new Date(end.getTime() - back * (range === "24h" ? 3600_000 : 86400_000));
    const hour = d.getUTCHours();
    const load = range === "24h" ? 0.45 + 0.9 * Math.max(0, Math.sin(((hour - 5) / 24) * Math.PI * 2 * 0.5 + 0.4)) : 0.92 + r() * 0.16 - ([0, 6].includes(d.getUTCDay()) ? 0.28 : 0);
    const drift = 1 + (i / n) * 0.06;                  // savings improve slowly as caches warm
    const noise = () => 1 + (r() - 0.5) * 0.12;
    const original = DAILY.original * share * load * noise();
    const saving = Math.min(0.42, 0.285 * drift * noise());
    const requests = Math.round(DAILY.requests * share * load * noise());
    const lbl = range === "24h" ? `${String(hour).padStart(2, "0")}:00` : `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
    const dipAt = range === "30d" ? 25 : -1;           // 27 Oct, the incident listed on the Fidelity tab
    const dip = i === dipAt ? 1 : 0;
    return {
      t: lbl, requests, originalM: +original.toFixed(2), sentM: +(original * (1 - saving)).toFixed(2),
      caching: Math.round(DAILY.caching * share * load * noise()), cleanup: Math.round(DAILY.cleanup * share * load * noise()), other: Math.round(DAILY.other * share * load * noise()),
      exact: +(8.2 * noise() * (1 + (i / n) * 0.1)).toFixed(1), semantic: +(5.1 * noise()).toFixed(1),
      agreement: +(Math.min(100, 98.9 + (r() - 0.5) * 0.8 - dip * 2.3)).toFixed(2), details: +(Math.min(100, 99.5 + (r() - 0.5) * 0.4 - dip * 4.1)).toFixed(2),
      p50: +(2.1 * noise() + (range === "24h" ? load * 0.6 : 0)).toFixed(2), p95: +(6.4 * noise() + (range === "24h" ? load * 2 : load)).toFixed(1),
    };
  });
}

export function summary(pts: Point[]) {
  const orig = pts.reduce((s, p) => s + p.originalM, 0), sent = pts.reduce((s, p) => s + p.sentM, 0), req = pts.reduce((s, p) => s + p.requests, 0);
  const w = (f: (p: Point) => number) => pts.reduce((s, p) => s + f(p) * p.requests, 0) / (req || 1);
  return {
    originalM: orig, sentM: sent, savedPct: (1 - sent / orig) * 100, requests: req,
    cache: w((p) => p.exact + p.semantic), agreement: w((p) => p.agreement), details: w((p) => p.details), p95: pts.reduce((a, p) => a + p.p95, 0) / pts.length,
    usd: pts.reduce((s, p) => s + p.caching + p.cleanup + p.other, 0),
  };
}

/** Share of requests by how much of the prompt was removed. Modelled, with a long tail of requests that were left alone. */
export const REDUCTION_BUCKETS = [
  { t: "0%", n: 31 }, { t: "1-10%", n: 17 }, { t: "11-20%", n: 12 }, { t: "21-30%", n: 10 }, { t: "31-40%", n: 9 }, { t: "41-50%", n: 8 }, { t: "51-60%", n: 7 }, { t: "61%+", n: 6 },
];

// ------------------------------------------------------------------------------------------------ parameter sweeps

export type SweepPoint = { x: string; saved: number; kept: number; at: number };

/** Runs the real stages over the sample prompts at each pruning keep-ratio, so the curve is computed and not drawn. */
export function pruneSweep(): SweepPoint[] {
  const out: SweepPoint[] = [];
  for (const k of [100, 90, 80, 70, 60, 50, 45, 40, 30, 20]) {
    let before = 0, after = 0, total = 0, kept = 0;
    for (const s of SAMPLE_PROMPTS) {
      const r = optimize(s.text, s.question, "balanced", MODE_STAGES.balanced, k / 100);
      before += r.before; after += r.after; total += r.critical.total; kept += r.critical.kept;
    }
    out.push({ x: `${k}%`, at: k, saved: +(((before - after) / before) * 100).toFixed(1), kept: +((kept / total) * 100).toFixed(1) });
  }
  return out;
}

/** Semantic cache: a lower threshold returns more cached answers, and more of them are answers a fresh call would not have given. Modelled. */
export function thresholdSweep(): SweepPoint[] {
  const out: SweepPoint[] = [];
  for (let t = 80; t <= 99; t += 1) {
    const hit = 21 * Math.exp(-10.9 * ((t - 80) / 100));
    const wrong = 9 * Math.exp(-18.6 * ((t - 80) / 100));
    out.push({ x: (t / 100).toFixed(2), at: t, saved: +hit.toFixed(1), kept: +wrong.toFixed(2) });
  }
  return out;
}
