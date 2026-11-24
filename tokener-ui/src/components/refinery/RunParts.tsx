"use client";

import clsx from "clsx";
import { Check, Circle, Loader2, XCircle } from "lucide-react";
import { fmtDur, fmtInt } from "@/components/refinery/bits";
import type { RunRecord } from "@/lib/refinery/types";

const Dot = ({ s }: { s: "pending" | "running" | "done" | "failed" }) => s === "done" ? <Check size={14} className="text-status-healthy" /> : s === "failed" ? <XCircle size={14} className="text-status-down" /> : s === "running" ? <Loader2 size={14} className="animate-spin text-[#067A4E]" /> : <Circle size={13} className="text-text-tertiary" />;

/** The stages a run goes through, in order, each with its state and time. */
export function StageStrip({ run }: { run: RunRecord }) {
  return (
    <ol className="flex flex-wrap gap-2">
      {run.stages.map((s) => (
        <li key={s.name} className={clsx("flex items-center gap-2 rounded-md border px-3 py-2 text-xs", s.status === "running" ? "border-[#02F5A1] bg-accent-50" : "border-border", s.status === "failed" && "border-status-down")}>
          <Dot s={s.status} /><span className="font-medium">{s.name}</span>{s.ms > 0 && <span className="text-text-tertiary tabular-nums">{fmtDur(s.ms)}</span>}
        </li>))}
    </ol>
  );
}

/** What each recipe step did in this run, counted over all rows. */
export function StepCounters({ run }: { run: RunRecord }) {
  return (
    <ol className="divide-y divide-border">
      {run.steps.map((s, k) => (
        <li key={s.id} className="flex items-start gap-3 py-2.5">
          <span className="mt-0.5"><Dot s={s.status} /></span>
          <div className="min-w-0 flex-1"><div className="text-[13px] font-medium">{k + 1}. {s.label}</div><div className="text-xs text-text-tertiary truncate">{s.detail}</div></div>
          <div className="text-right text-xs tabular-nums shrink-0">
            {s.status === "pending" ? <span className="text-text-tertiary">waiting</span> : s.remote ? <span className="text-text-secondary">{fmtInt(s.rowsIn)} rows sent</span> : <><div>{fmtInt(s.rowsIn)} to {fmtInt(s.rowsOut)}</div><div className="text-text-tertiary">{s.changed ? `${fmtInt(s.changed)} cells changed` : "no cell changes"}{s.rejected ? `, ${fmtInt(s.rejected)} rejected` : ""}</div></>}
          </div>
        </li>))}
    </ol>
  );
}

/** One square per partition. Hover for the worker and progress. */
export function PartitionGrid({ run, size = 14 }: { run: RunRecord; size?: number }) {
  const tone = { done: "bg-[#02F5A1]", running: "bg-[#F5B84B] animate-pulse", pending: "bg-surface-muted", failed: "bg-status-down", retry: "bg-[#F5B84B]" } as const;
  return (
    <div>
      <div className="flex flex-wrap gap-1">{run.partitions.map((p) => <span key={p.id} title={`Task ${p.id} on ${p.worker}: ${p.status}${p.status === "running" ? `, ${p.pct}%` : ""}`} className={clsx("rounded-sm", tone[p.status])} style={{ width: size, height: size }} />)}</div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] text-text-tertiary">{(["done", "running", "pending", "failed"] as const).map((s) => <span key={s} className="inline-flex items-center gap-1.5"><span className={clsx("h-2.5 w-2.5 rounded-sm", tone[s].split(" ")[0])} />{s === "done" ? "Finished" : s === "running" ? "Running" : s === "pending" ? "Waiting" : "Failed"} {run.partitions.filter((p) => p.status === s).length}</span>)}</div>
    </div>
  );
}
