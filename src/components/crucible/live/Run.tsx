"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ChevronLeft, Package } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Confirm, Kpi, Notice, Tabs } from "@/components/mlops/ui";
import { ChartCard, Plot } from "@/components/optimize/charts";
import { RunBadge } from "@/components/crucible/bits";
import { crucibleDriver, useCrucibleLive } from "@/lib/crucible/live/store";
import type { MetricSeries } from "@/lib/crucible/live/types";
import { toast } from "@/lib/mlops/toast";
import { ago, usd } from "@/lib/agents/format";
import { Allowed, person, when } from "./bits";
import { num } from "./Experiments";
import { useRead } from "./hooks";

type Tab = "overview" | "metrics" | "artifacts";

export function LiveRun({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { experiments, projects } = useCrucibleLive();
  const { data, error, loading, reload } = useRead(() => crucibleDriver().getRun(id), [id]);
  const [tab, setTab] = useState<Tab>("overview"); const [stop, setStop] = useState(false); const [err, setErr] = useState<string | null>(null);
  const run = data?.run;
  // A run that is still going is read again every few seconds, so its numbers move while the page is open.
  useEffect(() => { if (run?.status !== "running") return; const t = setInterval(reload, 5000); return () => clearInterval(t); }, [run?.status, reload]);
  if (error && !run) return <EmptyState icon={Package} title="Run not found" description={error} />;
  if (!run) return <div className="py-16 text-center text-sm text-text-tertiary" role="status">Loading the run</div>;
  const exp = experiments.find((e) => e.id === run.experimentId); const project = projects.find((p) => p.project.id === run.projectId)?.project;
  const doStop = async () => { const r = await crucibleDriver().killRun(run.id); setStop(false); if (!r.ok) { setErr(r.error); return; } toast("The run was stopped"); reload(); };
  return (
    <div className="space-y-6">
      <div>
        <Link href={exp ? `/crucible/experiments/${exp.id}` : "/crucible/experiments"} className="inline-flex items-center gap-1 text-[13px] text-text-secondary hover:text-text-primary mb-2"><ChevronLeft size={14} /> {exp?.name ?? "Experiments"}</Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3"><h1 className="text-xl font-semibold text-text-primary tracking-tight">{run.name}</h1><RunBadge s={run.status} /></div>
            <p className="text-xs text-text-tertiary mt-1.5">{run.id} · started {ago(run.startedAt)} by {person(run.owner)}{run.endedAt ? ` · ended ${when(run.endedAt)}` : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/crucible/lineage?experiment=${run.experimentId}&run=${run.id}`} className="inline-flex h-9 items-center rounded-md border border-border-strong px-3 text-[13px] font-medium hover:bg-surface-muted">View lineage</Link>
            {(run.status === "running" || run.status === "queued") && <Allowed need="run_cancel" onClick={() => setStop(true)}>Stop run</Allowed>}
          </div>
        </div>
      </div>
      {err && <Notice tone="bad">{err}</Notice>}
      {run.status === "failed" && run.failure && <Notice tone="bad" title="This run failed">{run.failure}</Notice>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="GPU hours" value={run.gpuHours ? run.gpuHours.toFixed(1) : "0"} sub="From system/gpu_hours" /><Kpi label="Cost" value={usd(run.costUsd)} sub="From system/cost_usd" />
        <Kpi label="Data" value={run.dataset ? `v${run.dataset.version}` : "None pinned"} sub={run.dataset?.name} /><Kpi label="Last heard from" value={run.lastHeartbeat ? ago(run.lastHeartbeat) : "Never"} sub={run.status === "running" ? "Ended automatically after 10 minutes of silence" : undefined} />
      </div>
      <Tabs<Tab> label="Run views" value={tab} onChange={setTab} tabs={[{ id: "overview", label: "Overview" }, { id: "metrics", label: "Metrics", count: Object.keys(run.metrics).length }, { id: "artifacts", label: "Artifacts", count: run.artifacts.length }]} />
      {tab === "overview" && (
        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Parameters</h3>
            {Object.keys(run.params).length === 0 ? <p className="text-sm text-text-secondary">No parameters were logged.</p> : <dl className="text-sm divide-y divide-border">{Object.entries(run.params).map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-1.5"><dt className="font-code text-xs text-text-secondary">{k}</dt><dd className="tabular-nums text-text-primary break-all text-right">{v}</dd></div>)}</dl>}
            <h3 className="text-sm font-semibold text-text-primary mt-5 mb-3">Final metrics</h3>
            {Object.keys(run.metrics).length === 0 ? <p className="text-sm text-text-secondary">No metric was logged yet.</p> : <dl className="text-sm divide-y divide-border">{Object.entries(run.metrics).map(([k, m]) => <div key={k} className="flex justify-between gap-4 py-1.5"><dt className="font-code text-xs text-text-secondary">{k}</dt><dd className="tabular-nums text-text-primary">{num(m.last)}<span className="text-xs text-text-tertiary"> at step {m.lastStep}</span></dd></div>)}</dl>}
          </Card>
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-text-primary mb-1">What produced this run</h3>
            <p className="text-xs text-text-tertiary mb-3">What the run and its project recorded.</p>
            <dl className="text-sm divide-y divide-border">
              <Row k="Data">{run.dataset ? <Link href="/crucible/datasets" className="hover:underline">{run.dataset.name} v{run.dataset.version}</Link> : "No dataset was pinned"}</Row>
              <Row k="Code">{project?.repoUrl ? <span className="font-code text-xs break-all">{project.repoUrl} ({project.branch})</span> : "The project has no repository"}</Row>
              {run.tags.git_commit && <Row k="Commit"><span className="font-code text-xs">{run.tags.git_commit}</span></Row>}
              <Row k="Project">{project ? <Link href={`/crucible/projects/${project.id}`} className="hover:underline">{project.name}</Link> : run.projectId}</Row>
              <Row k="Machine"><span className="font-code text-xs">{run.machineId ?? "Not tied to an enrolled machine"}</span></Row>
              {run.model && <Row k="Model">{run.model.name} <span className="font-code text-xs text-text-tertiary">{run.model.path}</span></Row>}
            </dl>
            {Object.keys(run.tags).length > 0 && <div className="flex flex-wrap gap-1.5 mt-4">{Object.entries(run.tags).map(([k, v]) => <Badge key={k} tone="neutral">{k}: {v}</Badge>)}</div>}
          </Card>
        </div>
      )}
      {tab === "metrics" && <Metrics runId={run.id} keys={Object.keys(run.metrics)} running={run.status === "running"} />}
      {tab === "artifacts" && (run.artifacts.length === 0 ? <EmptyState icon={Package} title="No artifacts" description={run.status === "failed" ? "The run stopped before it registered any." : "Artifacts appear here once the run registers them. The SDK uploads each file straight to the store and then records it."} /> : (
        <Card className="overflow-hidden"><Table><Thead><tr><Th>Path</Th><Th>Address</Th><Th>Size</Th></tr></Thead><tbody>
          {run.artifacts.map((a) => <Tr key={a.path}><Td className="font-code text-xs">{a.path}</Td><Td className="font-code text-xs text-text-secondary break-all">{a.uri}</Td><Td className="tabular-nums text-text-secondary">{size(a.sizeBytes)}</Td></Tr>)}
        </tbody></Table></Card>
      ))}
      <Confirm open={stop} onClose={() => setStop(false)} onConfirm={doStop} title="Stop this run" confirmLabel="Stop run" danger body={<p className="text-sm">The run is marked as stopped and takes no more events or uploads. What it logged so far stays.</p>} />
    </div>
  );
}

const Row = ({ k, children }: { k: string; children: React.ReactNode }) => <div className="flex justify-between gap-4 py-1.5"><dt className="text-text-secondary">{k}</dt><dd className="text-right text-text-primary">{children}</dd></div>;
const size = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : b >= 1e3 ? `${(b / 1e3).toFixed(1)} kB` : `${b} B`);

function Metrics({ runId, keys, running }: { runId: string; keys: string[]; running: boolean }) {
  const [series, setSeries] = useState<Record<string, MetricSeries | string>>({});
  const joined = keys.join("\u0000");
  useEffect(() => {
    let live = true;
    const load = () => keys.forEach((k) => crucibleDriver().metric(runId, k, 500).then((r) => { if (live) setSeries((s) => ({ ...s, [k]: r.ok ? r.series : r.error })); }));
    load(); const t = running ? setInterval(load, 5000) : undefined;
    return () => { live = false; if (t) clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, joined, running]);
  if (keys.length === 0) return <EmptyState icon={Package} title="No metrics yet" description="Metrics appear as the run logs them." />;
  return (
    <div className="grid lg:grid-cols-2 gap-5">
      {keys.map((k) => {
        const s = series[k];
        if (typeof s === "string") return <Notice key={k} tone="bad" title={k}>{s}</Notice>;
        if (!s) return <Card key={k} className="p-5 text-sm text-text-tertiary">Loading {k}</Card>;
        const d = s.points.map((p) => ({ t: String(p.step), v: Number(p.value.toPrecision(5)) }));
        return (
          <ChartCard key={k} title={k} subtitle={s.returned < s.total ? `${s.total} points, drawn as ${s.returned}` : `${s.total} points`} data={d} series={[{ key: "v", name: k, color: "s1" }]}>
            <Plot kind="line" data={d} series={[{ key: "v", name: k, color: "s1" }]} height={200} />
          </ChartCard>
        );
      })}
    </div>
  );
}
