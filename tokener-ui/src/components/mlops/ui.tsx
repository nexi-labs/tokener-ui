"use client";

import clsx from "clsx";
import { AlertTriangle, Check, CheckCircle2, Copy, FlaskConical, Info, Lock, X, XCircle } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { STATUS_LEGEND } from "@/lib/mlops/catalog";
import { can, type Action } from "@/lib/mlops/rbac";
import { onToast, type ToastMsg } from "@/lib/mlops/toast";
import { useMlops, useMlopsStatus } from "@/lib/mlops/store";
import { ENV_LABEL, type Env, type Health, type IntegrationStatus, type RoleId, type RunStatus } from "@/lib/mlops/types";

// ------------------------------------------------------------------ formatting

/** A size given in megabytes, written the way a person reads it: bytes and KB for small files, GB for large ones. */
export function fmtMb(mb: number): string {
  if (!(mb > 0)) return "0 MB";
  if (mb >= 1000) return `${(mb / 1000).toFixed(1)} GB`;
  if (mb >= 1) return `${Math.round(mb * 10) / 10} MB`;
  const kb = mb * 1024;
  if (kb >= 1) return `${Math.round(kb * 10) / 10} KB`;
  return `${Math.max(1, Math.round(kb * 1024))} B`;
}

export function relTime(iso?: string): string {
  if (!iso) return "never";
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  const future = d < 0, a = Math.abs(d);
  const t = a < 60 ? "moments" : a < 3600 ? `${Math.round(a / 60)} min` : a < 86400 ? `${Math.round(a / 3600)} h` : `${Math.round(a / 86400)} d`;
  return a < 60 ? (future ? "in moments" : "just now") : future ? `in ${t}` : `${t} ago`;
}
export const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "n/a");
export function fmtDuration(ms?: number) {
  if (ms === undefined) return "n/a";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}
export const money = (minor: number, cur: string) => `${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;
export const shortDigest = (d: string) => (d.length > 20 ? `${d.slice(0, 14)}...${d.slice(-6)}` : d);

// ------------------------------------------------------------------ badges

const HEALTH: Record<Health, { tone: "healthy" | "degraded" | "down" | "info" | "neutral"; label: string }> = {
  healthy: { tone: "healthy", label: "Healthy" }, attention: { tone: "degraded", label: "Needs attention" }, failed: { tone: "down", label: "Failed" },
  progressing: { tone: "info", label: "Progressing" }, unknown: { tone: "neutral", label: "Not verified" }, offline: { tone: "neutral", label: "Offline" },
};
export const HealthBadge = ({ h }: { h: Health }) => <Badge tone={HEALTH[h].tone}>{HEALTH[h].label}</Badge>;

const RUN: Record<RunStatus, { tone: "healthy" | "degraded" | "down" | "info" | "neutral"; label: string }> = {
  succeeded: { tone: "healthy", label: "Succeeded" }, running: { tone: "info", label: "Running" }, failed: { tone: "down", label: "Failed" },
  "validation-failed": { tone: "down", label: "Validation failed" }, cancelled: { tone: "neutral", label: "Cancelled" }, "rolled-back": { tone: "degraded", label: "Rolled back" },
  "waiting-approval": { tone: "degraded", label: "Waiting for approval" }, queued: { tone: "neutral", label: "Queued" },
};
export const RunBadge = ({ s }: { s: RunStatus }) => <Badge tone={RUN[s].tone}>{RUN[s].label}</Badge>;

export const EnvBadge = ({ env }: { env: Env }) => (
  <span className={clsx("inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border",
    env === "production" ? "border-emph bg-emph text-on-emph" : env === "staging" ? "border-border-strong bg-surface-muted text-text-primary" : "border-border bg-surface text-text-secondary")}>
    {ENV_LABEL[env]}
  </span>
);

export const IntegrationStatusBadge = ({ s }: { s: IntegrationStatus; wave?: number }) => (
  <span title={STATUS_LEGEND[s].text}><Badge tone={STATUS_LEGEND[s].tone}>{STATUS_LEGEND[s].label}</Badge></span>
);

/** Marks seeded records in the sample workspace. A signed-in workspace holds real records only, so it never shows. */
export function DemoTag() {
  if (useMlopsStatus().mode === "live") return null;
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-px rounded border border-dashed border-border-strong text-[10px] font-medium uppercase tracking-wide text-text-tertiary" title="Seeded demo record. Not real infrastructure.">
      Sample
    </span>
  );
}

export function SecretRef({ value }: { value?: string }) {
  if (!value) return <span className="text-text-tertiary text-xs">No secret</span>;
  return (
    <span className="inline-flex items-center gap-1.5 font-code text-[11.5px] text-text-secondary bg-surface-muted border border-border rounded px-1.5 py-0.5 max-w-full" title="Secret reference. The secret value is never stored or shown.">
      <Lock size={11} className="shrink-0" /><span className="truncate">{value}</span>
    </span>
  );
}

// ------------------------------------------------------------------ banners and tiles

export function DemoBanner() {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-dashed border-border-strong bg-surface px-3.5 py-2.5 text-[13px] text-text-secondary">
      <FlaskConical size={16} className="mt-0.5 shrink-0 text-text-tertiary" />
      <p>
        <span className="font-medium text-text-primary">Sample workspace.</span> NexI Corp is a fictional organization with sample data so you can explore every screen. Connections you add
        are tested against sample results until the matching connector is released, and each connector shows its status in the catalogue.
      </p>
    </div>
  );
}

export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "warn" | "bad" }) {
  return (
    <div className="bg-surface border border-border rounded-lg shadow-card px-4 py-3.5">
      <div className="text-xs text-text-tertiary">{label}</div>
      <div className={clsx("text-2xl font-semibold tracking-tight mt-1 tabular-nums", tone === "bad" ? "text-status-down" : tone === "warn" ? "text-[#9A5F05]" : "text-text-primary")}>{value}</div>
      {sub && <div className="text-xs text-text-secondary mt-1">{sub}</div>}
    </div>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warn" | "bad" | "ok"; title?: string; children: ReactNode }) {
  const Icon = tone === "warn" ? AlertTriangle : tone === "bad" ? XCircle : tone === "ok" ? CheckCircle2 : Info;
  const c = { info: "border-status-info/30 bg-status-info/5 text-[#2557B8]", warn: "border-status-degraded/40 bg-status-degraded/5 text-[#8A5504]", bad: "border-status-down/40 bg-status-down/5 text-[#B02A2A]", ok: "border-status-healthy/40 bg-status-healthy/5 text-[#067A4E]" }[tone];
  return (
    <div role={tone === "bad" ? "alert" : "note"} className={clsx("flex items-start gap-2.5 rounded-md border px-3.5 py-2.5 text-[13px]", c)}>
      <Icon size={16} className="mt-0.5 shrink-0" />
      <div className="text-text-primary min-w-0">{title && <div className="font-medium mb-0.5">{title}</div>}<div className="text-text-secondary">{children}</div></div>
    </div>
  );
}

export function Loading() {
  return (
    <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="h-6 w-56 rounded bg-surface-muted" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-lg bg-surface-muted" />)}</div>
      <div className="h-64 rounded-lg bg-surface-muted" />
    </div>
  );
}

// ------------------------------------------------------------------ controls

export function Tabs<T extends string>({ tabs, value, onChange, label, wrap }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; label?: string; wrap?: boolean }) {
  return (
    <div role="tablist" aria-label={label} className={clsx("flex gap-1 border-b border-border", wrap ? "flex-wrap" : "overflow-x-auto")}>
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={clsx("relative h-10 px-3 text-[13px] font-medium whitespace-nowrap transition-colors", value === t.id ? "text-text-primary" : "text-text-tertiary hover:text-text-primary")}>
          {t.label}{t.count !== undefined && <span className="ml-1.5 text-[11px] text-text-tertiary tabular-nums">{t.count}</span>}
          {value === t.id && <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-accent-600 rounded-full" />}
        </button>
      ))}
    </div>
  );
}

/** A button that is never silently dead: when the role forbids it, it is disabled and says why. */
export function GuardButton({ action, env, role, onClick, children, variant = "secondary", className, extraDisabled }: {
  action: Action; env?: Env; role: RoleId; onClick: () => void; children: ReactNode; variant?: "primary" | "secondary" | "ghost"; className?: string; extraDisabled?: string;
}) {
  const d = can(role, action, env);
  const reason = !d.ok ? d.reason : extraDisabled;
  return (
    <span title={reason} className={clsx("inline-flex", reason && "cursor-not-allowed")}>
      <Button variant={variant} disabled={!!reason} aria-disabled={!!reason} onClick={onClick} className={clsx(reason && "opacity-50 pointer-events-none", className)}>{children}</Button>
    </span>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("keydown", k); prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button aria-label="Close dialog" className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={clsx("relative bg-surface rounded-lg shadow-popover border border-border w-full max-h-[90vh] flex flex-col outline-none", wide ? "max-w-3xl" : "max-w-md")}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          <button aria-label="Close" onClick={onClose} className="h-8 w-8 grid place-items-center rounded-md text-text-tertiary hover:bg-surface-muted"><X size={16} /></button>
        </div>
        <div className="px-5 py-4 overflow-y-auto text-sm">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-border flex justify-end gap-2 bg-surface-subtle rounded-b-lg">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, title, subtitle, children, footer }: { open: boolean; onClose: () => void; title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <button aria-label="Close panel" className="absolute inset-0 bg-black/35" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-label={title} className="absolute right-0 top-0 bottom-0 w-full sm:w-[520px] bg-surface shadow-popover border-l border-border flex flex-col">
        <div className="flex items-start justify-between px-5 py-4 border-b border-border">
          <div className="min-w-0"><h2 className="text-sm font-semibold text-text-primary truncate">{title}</h2>{subtitle && <div className="text-xs text-text-tertiary mt-0.5">{subtitle}</div>}</div>
          <button aria-label="Close" onClick={onClose} className="h-8 w-8 grid place-items-center rounded-md text-text-tertiary hover:bg-surface-muted shrink-0"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-border flex justify-end gap-2 bg-surface-subtle">{footer}</div>}
      </aside>
    </div>
  );
}

/** Confirmation for destructive or production-affecting actions. High risk asks for a typed phrase. */
export function Confirm({ open, onClose, onConfirm, title, body, confirmLabel, phrase, danger }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string; body: ReactNode; confirmLabel: string; phrase?: string; danger?: boolean;
}) {
  const [typed, setTyped] = useState("");
  useEffect(() => { if (!open) setTyped(""); }, [open]);
  const ok = !phrase || typed.trim() === phrase;
  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!ok} className={clsx(danger && "bg-status-down hover:bg-[#b82f2f]", !ok && "opacity-50")} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Button></>}>
      <div className="space-y-3 text-text-secondary">{body}
        {phrase && (
          <label className="block">
            <span className="block text-[13px] text-text-primary mb-1.5">Type <code className="font-code bg-surface-muted px-1 rounded">{phrase}</code> to confirm</span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} className="w-full h-9 rounded-md border border-border-strong px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500/40" autoFocus />
          </label>
        )}
      </div>
    </Modal>
  );
}

export function Toaster() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(() => onToast((t) => {
    setItems((x) => [...x.slice(-3), t]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== t.id)), t.kind === "error" ? 7000 : 4000);
  }), []);
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-[min(92vw,380px)]" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} role={t.kind === "error" ? "alert" : "status"} className={clsx("flex items-start gap-2.5 rounded-md border px-3.5 py-2.5 text-[13px] shadow-popover bg-surface",
          t.kind === "error" ? "border-status-down/50" : t.kind === "info" ? "border-status-info/40" : "border-status-healthy/50")}>
          {t.kind === "error" ? <XCircle size={16} className="text-status-down mt-0.5 shrink-0" /> : t.kind === "info" ? <Info size={16} className="text-status-info mt-0.5 shrink-0" /> : <CheckCircle2 size={16} className="text-status-healthy mt-0.5 shrink-0" />}
          <span className="text-text-primary">{t.text}</span>
        </div>
      ))}
    </div>
  );
}

export { CodeBlock } from "./Code";

// ------------------------------------------------------------------ charts

/** Validated categorical order for three series on white: blue, amber, green. */
export const SERIES = ["var(--chart-s1)", "var(--chart-s2)", "var(--chart-s3)"];

export function MetricChart({ data, series, unit, area, height = 190, yMax }: {
  data: Record<string, number | string>[]; series: { key: string; name: string }[]; unit?: string; area?: boolean; height?: number; yMax?: number;
}) {
  const Chart: any = area ? AreaChart : LineChart;
  return (
    <div style={{ height }} role="img" aria-label={`${series.map((s) => s.name).join(", ")} over time`}>
      <ResponsiveContainer width="100%" height="100%">
        <Chart data={data} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="0" vertical={false} />
          <XAxis dataKey="t" tick={{ fontSize: 11, fill: "var(--chart-tick)" }} tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} interval="preserveStartEnd" minTickGap={32} />
          <YAxis tick={{ fontSize: 11, fill: "var(--chart-tick)" }} tickLine={false} axisLine={false} domain={[0, yMax ?? "auto"]} unit={unit} width={52} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid rgb(var(--c-border))", background: "rgb(var(--c-surface))", color: "rgb(var(--c-text-primary))", boxShadow: "0 8px 24px rgba(7,25,30,0.12)" }} cursor={{ stroke: "var(--chart-axis)" }} />
          {series.length > 1 && <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: "var(--chart-legend)" }} />}
          {series.map((s, i) =>
            area ? <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={SERIES[i]} fill={SERIES[i]} fillOpacity={0.1} strokeWidth={2} dot={false} isAnimationActive={false} />
              : <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={SERIES[i]} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--chart-dot)", strokeWidth: 2 }} isAnimationActive={false} />)}
        </Chart>
      </ResponsiveContainer>
    </div>
  );
}

export function useRole(): RoleId {
  return useMlops()?.role ?? "viewer";
}

export function KeyValue({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(110px,160px)_1fr] gap-x-4 gap-y-2.5 text-[13px]">
      {rows.map(([k, v]) => (<div key={k} className="contents"><dt className="text-text-tertiary">{k}</dt><dd className="text-text-primary min-w-0 break-words">{v}</dd></div>))}
    </dl>
  );
}

export const AGENT_TONE = { online: "healthy", degraded: "degraded", offline: "neutral", draining: "info" } as const;
export const MODE_LABEL = { "linux-systemd": "Linux server", kubernetes: "Kubernetes", docker: "Docker host" } as const;
