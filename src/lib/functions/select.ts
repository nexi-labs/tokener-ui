import { DAY, HOUR } from "./ledger";
import type { FnExecution, FnFunction, FunctionsState, UsageEvent, WfRun } from "./types";

export type RangeId = "1h" | "24h" | "7d";
export const RANGES: { id: RangeId; label: string; ms: number }[] = [
  { id: "1h", label: "Last hour", ms: HOUR },
  { id: "24h", label: "Last 24 hours", ms: DAY },
  { id: "7d", label: "Last 7 days", ms: 7 * DAY },
];

export type Scope = { range: RangeId; tenantId: string; appId: string; runtime: string; status: string };
export const DEFAULT_SCOPE: Scope = { range: "24h", tenantId: "all", appId: "all", runtime: "all", status: "all" };

const rangeMs = (r: RangeId) => RANGES.find((x) => x.id === r)!.ms;

export function scopedFunctions(s: FunctionsState, f: Scope): FnFunction[] {
  return s.functions.filter((x) => (f.tenantId === "all" || x.tenantId === f.tenantId) && (f.appId === "all" || x.appId === f.appId) && (f.runtime === "all" || x.runtime === f.runtime) && (f.status === "all" || x.status === f.status));
}

export function scopedExecutions(s: FunctionsState, f: Scope, fns = scopedFunctions(s, f)): FnExecution[] {
  const ids = new Set(fns.map((x) => x.id)); const since = new Date(s.anchor).getTime() - rangeMs(f.range);
  return s.executions.filter((e) => ids.has(e.fnId) && new Date(e.startedAt).getTime() >= since);
}

export function scopedUsage(s: FunctionsState, f: Scope): UsageEvent[] {
  const since = new Date(s.anchor).getTime() - rangeMs(f.range);
  return s.usage.filter((u) => new Date(u.at).getTime() >= since && (f.tenantId === "all" || u.tenantId === f.tenantId) && (f.appId === "all" || u.appId === f.appId));
}

export function scopedRuns(s: FunctionsState, f: Scope): WfRun[] {
  const since = new Date(s.anchor).getTime() - rangeMs(f.range);
  return s.runs.filter((r) => new Date(r.startedAt).getTime() >= since && (f.tenantId === "all" || r.tenantId === f.tenantId) && (f.appId === "all" || r.appId === f.appId));
}

export function p95(xs: number[]): number {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.ceil(a.length * 0.95) - 1)];
}

/** Time buckets for a chart: 12 five-minute buckets, 24 hourly, or 7 daily, all anchored at the anchor hour. */
export function buckets(anchorIso: string, r: RangeId): { start: number; end: number; label: string }[] {
  const end = new Date(anchorIso).getTime();
  const n = r === "1h" ? 12 : r === "24h" ? 24 : 7; const size = r === "1h" ? 5 * 60_000 : r === "24h" ? HOUR : DAY;
  return Array.from({ length: n }, (_, i) => {
    const start = end - (n - i) * size; const d = new Date(start);
    const label = r === "7d" ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }) : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
    return { start, end: start + size, label };
  });
}

export function execStats(xs: FnExecution[]) {
  const ok = xs.filter((e) => e.status === "succeeded").length;
  const failed = xs.filter((e) => e.status === "failed" || e.status === "timeout").length;
  const blocked = xs.filter((e) => e.status === "blocked").length;
  const throttled = xs.filter((e) => e.status === "throttled").length;
  const lat = xs.filter((e) => e.status === "succeeded").map((e) => e.durationMs);
  return { total: xs.length, ok, failed, blocked, throttled, p95: p95(lat), avg: lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : 0 };
}
