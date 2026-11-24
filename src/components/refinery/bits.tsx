"use client";

import clsx from "clsx";
import { Badge } from "@/components/ui/Badge";
import { SimpleIcon } from "@/components/icons/SimpleIcon";
import { CONNECTOR_BY_ID, GLYPH_FALLBACK } from "@/lib/refinery/connectors";
import { useMlops } from "@/lib/mlops/store";
import { useRefinery } from "@/lib/refinery/store";
import type { RoleId } from "@/lib/mlops/types";
import type { Bucket, ConnectionState, PoolStatus, RunStatus, StreamStatus } from "@/lib/refinery/types";

// ------------------------------------------------------------------ formatting

export const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
export function fmtRows(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(0)}K`;
  return fmtInt(n);
}
export function fmtBytes(b: number) {
  if (b >= 1e12) return `${(b / 1e12).toFixed(1)} TB`;
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(0)} MB`;
  if (b >= 1e3) return `${(b / 1e3).toFixed(0)} KB`;
  return `${b} B`;
}
export function fmtDur(ms: number) {
  if (!ms) return "n/a";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}
export function ago(iso: string) {
  if (!iso || Number.isNaN(Date.parse(iso))) return "never";
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
export const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n < 100 ? 2 : 0 });
export const pct1 = (n: number) => `${n.toFixed(n < 10 ? 1 : 0)}%`;

// ------------------------------------------------------------------ status

const RUN: Record<RunStatus, { label: string; tone: "healthy" | "degraded" | "down" | "info" | "neutral" }> = {
  queued: { label: "Queued", tone: "neutral" }, planning: { label: "Planning", tone: "info" }, running: { label: "Running", tone: "info" },
  succeeded: { label: "Succeeded", tone: "healthy" }, failed: { label: "Failed", tone: "down" }, cancelled: { label: "Cancelled", tone: "neutral" },
};
export const RunStatusBadge = ({ s }: { s: RunStatus }) => <Badge tone={RUN[s].tone}>{RUN[s].label}</Badge>;
const POOL: Record<PoolStatus, { label: string; tone: "healthy" | "degraded" | "down" | "info" | "neutral" }> = {
  online: { label: "Online", tone: "healthy" }, scaling: { label: "Scaling", tone: "info" }, degraded: { label: "Degraded", tone: "degraded" }, offline: { label: "Offline", tone: "down" }, pending: { label: "Waiting for runner", tone: "neutral" },
};
export const PoolStatusBadge = ({ s }: { s: PoolStatus }) => <Badge tone={POOL[s].tone}>{POOL[s].label}</Badge>;
const CONN: Record<ConnectionState, { label: string; tone: "healthy" | "down" | "neutral" }> = { connected: { label: "Connected", tone: "healthy" }, failed: { label: "Test failed", tone: "down" }, untested: { label: "Not tested", tone: "neutral" } };
export const ConnStateBadge = ({ s }: { s: ConnectionState }) => <Badge tone={CONN[s].tone}>{CONN[s].label}</Badge>;
const STR: Record<StreamStatus, { label: string; tone: "healthy" | "degraded" | "down" | "info" | "neutral" }> = { running: { label: "Running", tone: "healthy" }, paused: { label: "Paused", tone: "neutral" }, failed: { label: "Failed", tone: "down" }, starting: { label: "Starting", tone: "info" }, snapshotting: { label: "Taking snapshot", tone: "info" } };
export const StreamStatusBadge = ({ s }: { s: StreamStatus }) => <Badge tone={STR[s].tone}>{STR[s].label}</Badge>;

// ------------------------------------------------------------------ marks and small graphics

export function ConnectorMark({ id, size = 36 }: { id: string; size?: number }) {
  const c = CONNECTOR_BY_ID.get(id); const Glyph = c?.glyph ?? GLYPH_FALLBACK;
  return (
    <div className="rounded-md bg-surface-muted flex items-center justify-center shrink-0" style={{ height: size, width: size }}>
      {c?.brand ? <SimpleIcon icon={c.brand} size={size / 2} monochrome={false} /> : <Glyph size={size / 2.1} className="text-text-secondary" />}
    </div>
  );
}

/** Quality score as a ring. The colour follows the value but the number is always printed, so colour is never the only cue. */
export function QualityRing({ value, size = 72 }: { value: number; size?: number }) {
  const r = (size - 8) / 2, c = 2 * Math.PI * r;
  const tone = value >= 90 ? "var(--chart-s3)" : value >= 75 ? "var(--chart-s2)" : "#c0392b";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Quality score ${value} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--chart-grid)" strokeWidth={6} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={6} strokeLinecap="round" strokeDasharray={`${(c * value) / 100} ${c}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none"><span className={size >= 64 ? "text-[18px] font-semibold tabular-nums" : "text-[14px] font-semibold tabular-nums"}>{value}</span>{size >= 64 && <span className="text-[9px] text-text-tertiary mt-0.5">of 100</span>}</div>
    </div>
  );
}

export function Histogram({ buckets, height = 56, tone = "var(--chart-s1)" }: { buckets: Bucket[]; height?: number; tone?: string }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  if (buckets.length === 0) return <div className="text-xs text-text-tertiary" style={{ height }}>No values</div>;
  return (
    <div className="flex items-end gap-[3px]" style={{ height }} role="img" aria-label={`Distribution: ${buckets.map((b) => `${b.label} ${b.count}`).join(", ")}`}>
      {buckets.map((b, i) => <div key={i} title={`${b.label}: ${b.count.toLocaleString("en-US")}`} className="flex-1 min-w-[4px] rounded-t-[2px]" style={{ height: `${Math.max(4, (b.count / max) * 100)}%`, background: tone, opacity: 0.85 }} />)}
    </div>
  );
}

export function Spark({ data, width = 120, height = 32, tone = "var(--chart-s1)" }: { data: number[]; width?: number; height?: number; tone?: string }) {
  if (data.length < 2) return null;
  const mx = Math.max(...data), mn = Math.min(...data), span = mx - mn || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - 3 - ((v - mn) / span) * (height - 6)}`).join(" ");
  return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true"><polyline points={pts} fill="none" stroke={tone} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" /></svg>;
}

export function Bar({ value, tone = "var(--chart-s1)", className }: { value: number; tone?: string; className?: string }) {
  return <div className={clsx("h-1.5 rounded-full bg-surface-muted overflow-hidden", className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: tone }} /></div>;
}

export function Section({ title, hint, action, children, className }: { title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={clsx("bg-surface border border-border rounded-lg shadow-card", className)}>
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3"><div><h2 className="text-[13px] font-semibold text-text-primary">{title}</h2>{hint && <p className="text-xs text-text-tertiary mt-0.5">{hint}</p>}</div>{action}</div>
      <div className="px-5 pb-5">{children}</div>
    </section>
  );
}

// ------------------------------------------------------------------ data issue colouring

export type CellIssue = "null" | "blank" | "placeholder" | "spaces";
const PLACEHOLDERS = new Set(["n/a", "na", "null", "none", "nil", "unknown", "undefined", "-", "--", "?", "tbd", "missing", "#n/a"]);
/** What is wrong with a cell, if anything. Looks at the stored value only, so the same rule runs in the sample and on a runner. */
export function cellIssue(v: unknown): CellIssue | null {
  if (v === null || v === undefined) return "null";
  if (typeof v !== "string") return null;
  if (v === "") return "blank";
  if (v.trim() === "") return "blank";
  if (PLACEHOLDERS.has(v.trim().toLowerCase())) return "placeholder";
  if (v !== v.trim() || / {2,}/.test(v)) return "spaces";
  return null;
}
export const ISSUES: { id: CellIssue; label: string; hint: string; cell: string; dot: string }[] = [
  { id: "null", label: "Missing", hint: "No value at all (null)", cell: "bg-status-degraded/20 text-[#8A5A00]", dot: "bg-status-degraded" },
  { id: "blank", label: "Blank", hint: "An empty or space-only text", cell: "bg-status-down/15 text-status-down", dot: "bg-status-down" },
  { id: "placeholder", label: "Placeholder", hint: "Text standing in for a missing value, such as N/A or unknown", cell: "bg-violet-500/15 text-violet-700", dot: "bg-violet-500" },
  { id: "spaces", label: "Stray spaces", hint: "Leading, trailing or repeated spaces", cell: "bg-sky-500/15 text-sky-700", dot: "bg-sky-500" },
];
export const ISSUE_BY_ID = new Map(ISSUES.map((i) => [i.id, i]));

/** One line saying where an output goes. A dataset output with no target is a dataset in Refinery itself. */
export function sinkLabel(o: { kind: string; target: string }): string { return o.kind === "dataset" && !o.target ? "A dataset in Refinery" : `${o.kind}: ${o.target}`; }

/** The role the signed-in person holds in Refinery. A workspace connected to a server uses the role that server reports. The sample workspace uses the role chosen in the console. */
export function useRefineryRole(): RoleId {
  const role = useRefinery().role;
  const chosen = useMlops()?.role ?? "viewer";
  return role ?? chosen;
}
