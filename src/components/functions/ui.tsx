"use client";

import clsx from "clsx";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { FnIcon } from "./FnIcon";
import { NodeIcon } from "@/components/studio/icons";
import { brandOf } from "@/lib/industry-brands";
import type { FnIconName } from "@/lib/functions/icon-set";
import { useFunctions } from "@/lib/functions/store";
import { EXEC_STATUS_LABEL, FN_STATUS_LABEL, type ExecStatus, type FnStatus, type FunctionsState, type TriggerKind, type WfRunStatus, type WfStatus, type StepKind } from "@/lib/functions/types";
import { providerById, modelById } from "@/lib/functions/catalog";

/** The state, once the layout has gated on loading and error. */
export function useFx(): FunctionsState {
  const { state } = useFunctions();
  return state as FunctionsState;
}

const FN_TONE: Record<FnStatus, "healthy" | "degraded" | "down" | "info" | "neutral"> = { draft: "neutral", deploying: "info", active: "healthy", failed: "down", disabled: "neutral" };
export const FnStatusBadge = ({ s }: { s: FnStatus }) => <Badge tone={FN_TONE[s]}>{FN_STATUS_LABEL[s]}</Badge>;

const EXEC_TONE: Record<ExecStatus, "healthy" | "degraded" | "down" | "info" | "neutral"> = { succeeded: "healthy", failed: "down", timeout: "down", blocked: "degraded", throttled: "degraded", "waiting-approval": "info", running: "info" };
export const ExecBadge = ({ s }: { s: ExecStatus }) => <Badge tone={EXEC_TONE[s]}>{EXEC_STATUS_LABEL[s]}</Badge>;

const RUN_LABEL: Record<WfRunStatus, string> = { succeeded: "Succeeded", failed: "Failed", "waiting-approval": "Waiting for approval", blocked: "Blocked by policy", running: "Running", rejected: "Rejected by approver" };
const RUN_TONE: Record<WfRunStatus, "healthy" | "degraded" | "down" | "info" | "neutral"> = { succeeded: "healthy", failed: "down", "waiting-approval": "info", blocked: "degraded", running: "info", rejected: "neutral" };
export const WfRunBadge = ({ s }: { s: WfRunStatus }) => <Badge tone={RUN_TONE[s]}>{RUN_LABEL[s]}</Badge>;
export const WfStatusBadge = ({ s }: { s: WfStatus }) => <Badge tone={s === "active" ? "healthy" : s === "draft" ? "neutral" : "degraded"}>{s === "active" ? "Active" : s === "draft" ? "Draft" : "Disabled"}</Badge>;

export const TRIGGER_LABEL: Record<TriggerKind, string> = { http: "HTTP", kafka: "Kafka event", schedule: "Schedule" };
export const TRIGGER_ICON: Record<TriggerKind, FnIconName> = { http: "http", kafka: "event", schedule: "schedule" };
export const TriggerChip = ({ kind }: { kind: TriggerKind }) => (
  <span className="inline-flex items-center gap-1.5 text-[12px] text-text-secondary"><FnIcon name={TRIGGER_ICON[kind]} size={14} />{TRIGGER_LABEL[kind]}</span>
);

export const STEP_ICON: Record<StepKind | "ai", FnIconName> = { trigger: "event", validate: "policy", policy: "policy", function: "function", ai: "ai", connector: "connector", condition: "router", approval: "approval", output: "output" };

export function BrandGlyph({ name, size = 18 }: { name: string; size?: number }) {
  const icon = useMemo(() => { try { return brandOf(name).icon; } catch { return null; } }, [name]);
  if (!icon) return <span className="inline-block rounded bg-surface-muted" style={{ width: size, height: size }} />;
  return <NodeIcon icon={icon} size={size} />;
}

export function ProviderChip({ id }: { id?: string }) {
  const p = id ? providerById(id) : undefined;
  if (!p) return <span className="text-text-tertiary">none</span>;
  return <span className="inline-flex items-center gap-1.5"><BrandGlyph name={p.brand} size={15} />{p.name}</span>;
}
export function ModelChip({ id }: { id?: string }) {
  const m = id ? modelById(id) : undefined;
  if (!m) return <span className="text-text-tertiary">no model call</span>;
  const p = providerById(m.providerId);
  return <span className="inline-flex items-center gap-1.5"><BrandGlyph name={p?.brand ?? ""} size={15} />{m.name}</span>;
}

/** The persistent banner. Functions has no backend yet, in the sample workspace and in a signed-in one. */
export function PreviewBanner() {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-dashed border-border-strong bg-surface px-3.5 py-2.5 text-[13px] text-text-secondary" role="note">
      <FnIcon name="function" size={17} className="mt-0.5 shrink-0 text-text-tertiary" />
      <p>
        <span className="font-medium text-text-primary">Design preview.</span> Functions is not connected to a runtime yet, so nothing here is deployed or executed. Functions, executions and costs below are generated sample records for a fictional bank,
        and edits last for this session only. Which parts are conceptual is marked where they appear.
      </p>
    </div>
  );
}

export function Concept({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded border border-dashed border-border-strong px-1.5 py-px text-[11px] text-text-tertiary align-middle" title="Conceptual: not implemented in the platform yet">{children ?? "Conceptual"}</span>;
}

/** Horizontal usage bar with a warning band. */
export function Meter({ value, max, warnAt = 80, label }: { value: number; max: number; warnAt?: number; label?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const tone = pct >= 100 ? "bg-status-down" : pct >= warnAt ? "bg-status-degraded" : "bg-accent-600";
  return (
    <div role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label} className="h-1.5 w-full rounded-full bg-surface-muted overflow-hidden">
      <div className={clsx("h-full rounded-full", tone)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function SectionNav({ items, pathname }: { items: { label: string; href: string; icon: FnIconName }[]; pathname: string }) {
  const active = [...items].sort((a, b) => b.href.length - a.href.length).find((i) => pathname === i.href || pathname.startsWith(i.href + "/"));
  return (
    <nav aria-label="Functions sections" className="flex gap-1 overflow-x-auto border-b border-border -mb-px">
      {items.map((i) => {
        const on = active?.href === i.href;
        return (
          <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}
            className={clsx("relative h-10 px-3 inline-flex items-center gap-2 text-[13px] font-medium whitespace-nowrap transition-colors", on ? "text-text-primary" : "text-text-tertiary hover:text-text-primary")}>
            <FnIcon name={i.icon} size={15} />{i.label}
            {on && <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-accent-600 rounded-full" />}
          </Link>
        );
      })}
    </nav>
  );
}

export function FnSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="Loading functions">
      <div className="h-6 w-48 rounded bg-surface-muted" />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-24 rounded-lg bg-surface-muted" />)}</div>
      <div className="h-56 rounded-lg bg-surface-muted" />
      <div className="h-64 rounded-lg bg-surface-muted" />
    </div>
  );
}

export const fmtMs = (ms: number) => (ms >= 60_000 ? `${(ms / 60_000).toFixed(1)} min` : ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);
export const pct = (n: number, d: number, digits = 1) => (d === 0 ? "n/a" : `${((n / d) * 100).toFixed(digits)}%`);
export const when = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }) + " UTC" : "n/a");
export function ago(iso: string | undefined, anchorIso: string) {
  if (!iso) return "never";
  const d = new Date(anchorIso).getTime() - new Date(iso).getTime();
  if (d < 0) return "in " + fmtMs(-d).replace(/\.\d+/, "");
  const m = Math.round(d / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}
