"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, FileText, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Notice, Tabs } from "@/components/mlops/ui";
import { RunStatusBadge, ago, fmtBytes, fmtDur, fmtInt, fmtRows, usd } from "@/components/refinery/bits";
import { ReportDialog } from "@/components/refinery/ReportDialog";
import { LogConsole } from "@/components/refinery/LogConsole";
import { PartitionGrid, StageStrip, StepCounters } from "@/components/refinery/RunParts";
import { toast } from "@/lib/mlops/toast";
import { refinery, useRefinery } from "@/lib/refinery/store";
import { useRouter } from "next/navigation";

export default function RunPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { runs } = useRefinery();
  const r = runs.find((x) => x.id === id);
  const [tab, setTab] = useState<"log" | "steps" | "tasks" | "rejects">("log");
  const [reportOpen, setReportOpen] = useState(false);
  if (!r) return <div className="space-y-3"><Link href="/refinery/runs" className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary"><ArrowLeft size={13} /> Runs</Link><Card><div className="p-10 text-center text-text-secondary">This run does not exist.</div></Card></div>;
  const live = r.status === "running" || r.status === "planning" || r.status === "queued";
  const kpi: [string, string, string][] = [
    ["Rows read", fmtRows(r.rowsIn), fmtBytes(r.bytesIn)], ["Rows written", fmtRows(r.rowsOut), r.rowsIn ? `${Math.round((r.rowsOut / r.rowsIn) * 100)}% of rows read` : ""],
    ["Rejected", fmtInt(r.rowsRejected), r.rowsRejected ? "kept with the reason" : "none"], ["Model calls", r.aiCalls ? fmtRows(r.aiCalls) : "none", r.aiCalls ? usd(r.aiCostUsd) : ""],
    ["Duration", r.durationMs ? fmtDur(r.durationMs) : "not started", `${r.parallelism} tasks at once`],
  ];
  return (
    <div className="space-y-5">
      <Link href="/refinery/runs" className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary"><ArrowLeft size={13} /> Runs</Link>
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div><div className="flex flex-wrap items-center gap-2.5"><h2 className="text-lg font-semibold tracking-tight">{r.id}</h2><RunStatusBadge s={r.status} /></div>
          <p className="text-sm text-text-secondary mt-1"><Link href={`/refinery/recipes/${r.recipeId}`} className="underline underline-offset-2">{r.recipeName}</Link> v{r.recipeVersion} on {r.pool}. Input {r.snapshot}. Started {ago(r.startedAt)} by {r.startedBy} ({r.trigger}).</p></div>
        <div className="flex gap-2">{r.status === "succeeded" && <Button onClick={() => setReportOpen(true)}><FileText size={14} /> Generate report</Button>}{live && <Button onClick={async () => { const x = await refinery.cancelRun(r.id); if (!x.ok) toast(x.error, "error"); }}><XCircle size={14} /> Cancel run</Button>}{!live && <Button onClick={async () => { const n = await refinery.startRun(r.recipeId); if (!n.ok) { toast(n.error, "error"); return; } router.push(`/refinery/runs/${n.run.id}`); }}>Run again</Button>}</div>
      </div>
      <ReportDialog run={r} open={reportOpen} onClose={() => setReportOpen(false)} />
      {r.error && <Notice tone="bad" title="The run failed">{r.error}</Notice>}
      {r.status === "succeeded" && r.outputs && r.outputs.length > 0 && <Notice tone="ok" title="Written">{r.outputs.join(". ")}.</Notice>}
      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3">{kpi.map(([l, v, s]) => <Card key={l}><div className="p-4"><div className="text-xs text-text-tertiary">{l}</div><div className="text-xl font-semibold tabular-nums mt-1">{v}</div><div className="text-xs text-text-tertiary mt-0.5">{s}</div></div></Card>)}</div>
      <Card><div className="p-4 space-y-3"><div className="flex items-center justify-between text-xs text-text-secondary tabular-nums"><span>Progress</span><span>{Math.round(r.pct)}%</span></div><div className="h-2 rounded-full bg-surface-muted overflow-hidden"><div className="h-full bg-[#02F5A1] transition-all duration-700" style={{ width: `${r.pct}%` }} /></div><StageStrip run={r} /></div></Card>
      <Tabs label="Run details" value={tab} onChange={setTab} tabs={[{ id: "log", label: "Log", count: r.log.length }, { id: "steps", label: "Steps", count: r.steps.length }, { id: "tasks", label: "Tasks", count: r.partitions.length }, { id: "rejects", label: "Rejected rows", count: r.rejects.length }]} />
      {tab === "log" && <LogConsole lines={r.log} live={live} name={r.id} className="h-[560px]" />}
      {tab === "steps" && <Card><div className="px-5 py-2"><StepCounters run={r} /></div></Card>}
      {tab === "tasks" && <Card><div className="p-5 space-y-4"><PartitionGrid run={r} size={16} /><p className="text-xs text-text-tertiary">{r.partitions.length >= 96 ? "The first 96 tasks are drawn. " : ""}Each task reads one partition, runs every step on it and writes its part. Failed tasks are retried on another worker before the run stops.</p></div></Card>}
      {tab === "rejects" && <Card>{r.rejects.length === 0 ? <div className="p-10 text-center text-sm text-text-secondary">No rows were rejected.</div> : <ul className="divide-y divide-border">{r.rejects.map((x) => <li key={x.reason} className="flex items-center gap-4 px-5 py-3"><div className="min-w-0 flex-1"><div className="text-[13px] font-medium">{x.reason}</div><div className="text-xs text-text-tertiary">{x.step}</div></div><div className="text-sm tabular-nums">{fmtInt(x.count)} rows</div></li>)}</ul>}</Card>}
    </div>
  );
}
