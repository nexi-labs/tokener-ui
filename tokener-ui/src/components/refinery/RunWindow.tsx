"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { RunStatusBadge, fmtDur, fmtInt, fmtRows } from "@/components/refinery/bits";
import { LogConsole } from "@/components/refinery/LogConsole";
import { PartitionGrid, StageStrip, StepCounters } from "@/components/refinery/RunParts";
import { toast } from "@/lib/mlops/toast";
import { refinery, useRefinery } from "@/lib/refinery/store";

/** A large window over the page that follows one run as it happens: progress, stages, what each step has done so far, and the log. */
export function RunWindow({ runId, onClose }: { runId: string | null; onClose: () => void }) {
  const { runs } = useRefinery();
  const run = runs.find((r) => r.id === runId);
  useEffect(() => { if (!runId) return; const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [runId, onClose]);
  if (!runId || !run) return null;
  const live = run.status === "running" || run.status === "planning" || run.status === "queued";
  return (
    <div className="fixed inset-0 z-50 bg-[#07191E]/60 backdrop-blur-[2px] p-3 sm:p-6 flex" role="dialog" aria-modal="true" aria-label={`Run ${run.id}`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="m-auto w-full max-w-[1280px] h-full max-h-[900px] bg-surface rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 border-b border-border">
          <div className="min-w-0"><div className="flex items-center gap-2.5"><h2 className="text-[15px] font-semibold truncate">{run.recipeName} <span className="text-text-tertiary font-normal">v{run.recipeVersion}</span></h2><RunStatusBadge s={run.status} /></div><p className="text-xs text-text-tertiary mt-0.5">{run.id} on {run.pool}, input {run.snapshot}, started by {run.startedBy}</p></div>
          <div className="flex-1 min-w-[180px] max-w-md ml-auto"><div className="flex justify-between text-xs text-text-secondary tabular-nums mb-1"><span>{fmtRows(run.rowsIn)} rows read</span><span>{Math.round(run.pct)}%{run.durationMs ? `, ${fmtDur(run.durationMs)}` : ""}</span></div><div className="h-2 rounded-full bg-surface-muted overflow-hidden"><div className="h-full rounded-full bg-[#02F5A1] transition-all duration-700" style={{ width: `${run.pct}%` }} /></div></div>
          <button aria-label="Close" onClick={onClose} className="h-8 w-8 grid place-items-center rounded hover:bg-surface-muted"><X size={16} /></button>
        </div>
        <div className="px-5 py-3 border-b border-border"><StageStrip run={run} /></div>
        <div className="flex-1 min-h-0 grid lg:grid-cols-[340px_minmax(0,1fr)] gap-0">
          <div className="overflow-auto p-5 border-b lg:border-b-0 lg:border-r border-border space-y-5">
            <section><h3 className="text-[13px] font-semibold mb-2">Steps</h3><StepCounters run={run} /></section>
            <section><h3 className="text-[13px] font-semibold mb-2">Tasks</h3><PartitionGrid run={run} size={12} /></section>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs"><dt className="text-text-tertiary">Rows out</dt><dd className="text-right tabular-nums">{fmtInt(run.rowsOut)}</dd><dt className="text-text-tertiary">Rejected</dt><dd className="text-right tabular-nums">{fmtInt(run.rowsRejected)}</dd>{run.aiCalls > 0 && <><dt className="text-text-tertiary">Model calls</dt><dd className="text-right tabular-nums">{fmtInt(run.aiCalls)}</dd></>}</dl>
          </div>
          <div className="min-h-0 p-4 flex flex-col"><LogConsole lines={run.log} live={live} name={run.id} className="flex-1 min-h-[320px]" /></div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-border">
          <p className="text-xs text-text-tertiary max-w-xl">{run.log[0]?.msg.startsWith("Simulated") ? "This run is simulated in the sample workspace. Nothing was read or written." : "Lines arrive from the runner as it works."}</p>
          <div className="flex gap-2">{live && <Button onClick={async () => { const r = await refinery.cancelRun(run.id); if (!r.ok) toast(r.error, "error"); }}>Cancel run</Button>}<Link href={`/refinery/runs/${run.id}`} onClick={onClose}><Button><ExternalLink size={14} /> Open full page</Button></Link><Button variant="primary" onClick={onClose}>Close</Button></div>
        </div>
      </div>
    </div>
  );
}
