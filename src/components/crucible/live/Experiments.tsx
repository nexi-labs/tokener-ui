"use client";

import Link from "next/link";
import { use, useMemo, useState } from "react";
import { ChevronLeft, FlaskConical, GitCompare, Search } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Kpi, Modal, Notice } from "@/components/mlops/ui";
import { RunBadge } from "@/components/crucible/bits";
import { crucibleDriver, useCrucibleLive } from "@/lib/crucible/live/store";
import type { Comparison, Run } from "@/lib/crucible/live/types";
import { ago } from "@/lib/agents/format";
import { person, when } from "./bits";
import { useRead } from "./hooks";

export function LiveExperiments() {
  const { experiments, projects } = useCrucibleLive();
  return (
    <div className="space-y-6">
      <PageHeader title="Experiments" description="An experiment groups the runs that try to solve one problem. Runs come in from the machines you connect on the Projects screen." />
      {experiments.length === 0 ? <Card><EmptyState icon={FlaskConical} title="No experiments yet" description="Create an experiment inside a project, then log runs into it." action={<Link href="/crucible/projects" className="inline-flex h-9 items-center rounded-md border border-border-strong px-3 text-[13px] font-medium hover:bg-surface-muted">Open projects</Link>} /></Card> : (
        <Card className="overflow-hidden"><Table><Thead><tr><Th>Experiment</Th><Th>Project</Th><Th>Task</Th><Th>Tags</Th><Th>Owner</Th><Th>Created</Th></tr></Thead><tbody>
          {experiments.map((e) => <Tr key={e.id}>
            <Td><Link href={`/crucible/experiments/${e.id}`} className="font-medium text-text-primary hover:underline">{e.name}</Link><div className="text-xs text-text-tertiary">{e.description || e.id}</div></Td>
            <Td className="text-text-secondary">{projects.find((p) => p.project.id === e.projectId)?.project.name ?? e.projectId}</Td>
            <Td className="text-text-secondary">{e.task || "Not set"}</Td>
            <Td><span className="flex flex-wrap gap-1">{e.tags.map((t) => <Badge key={t} tone="neutral">{t}</Badge>)}</span></Td>
            <Td className="text-text-secondary">{person(e.owner)}</Td><Td className="text-text-secondary">{when(e.createdAt)}</Td>
          </Tr>)}
        </tbody></Table></Card>
      )}
    </div>
  );
}

const ORDERS = [["started desc", "Newest first"], ["started asc", "Oldest first"], ["name asc", "Name"], ["cost desc", "Highest cost"], ["gpuHours desc", "Most GPU hours"]];

export function LiveExperiment({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { experiments, projects } = useCrucibleLive();
  const exp = experiments.find((e) => e.id === id); const project = projects.find((p) => p.project.id === exp?.projectId)?.project;
  const [filter, setFilter] = useState(""); const [applied, setApplied] = useState(""); const [order, setOrder] = useState("started desc");
  const [picked, setPicked] = useState<string[]>([]); const [cmp, setCmp] = useState<Comparison | null>(null); const [cmpErr, setCmpErr] = useState<string | null>(null);
  const { data, error, loading, reload } = useRead(() => exp ? crucibleDriver().searchRuns({ projectId: exp.projectId, experimentId: id, filter: applied, orderBy: order, limit: 200 }) : Promise.resolve({ ok: true as const, runs: [] as Run[] }), [id, applied, order, exp?.projectId]);
  const runs = data?.runs ?? [];
  const metricKeys = useMemo(() => [...new Set(runs.flatMap((r) => Object.keys(r.metrics).filter((k) => !k.startsWith("system/"))))].sort(), [runs]);
  const [shown, setShown] = useState<string | null>(null);
  const col = shown && metricKeys.includes(shown) ? shown : metricKeys[0];
  const toggle = (rid: string) => setPicked((p) => p.includes(rid) ? p.filter((x) => x !== rid) : p.length < 8 ? [...p, rid] : p);
  const compare = async () => { setCmpErr(null); const r = await crucibleDriver().compareRuns(picked); if (!r.ok) { setCmpErr(r.error); return; } setCmp(r.comparison); };
  if (!exp) return <EmptyState icon={FlaskConical} title="Experiment not found" description="It may have been removed, or you may not have access to it." />;
  const running = runs.filter((r) => r.status === "running").length;
  return (
    <div className="space-y-6">
      <div>
        <Link href="/crucible/experiments" className="inline-flex items-center gap-1 text-[13px] text-text-secondary hover:text-text-primary mb-2"><ChevronLeft size={14} /> Experiments</Link>
        <h1 className="text-xl font-semibold text-text-primary tracking-tight">{exp.name}</h1>
        <p className="text-sm text-text-secondary mt-1">{exp.description || "No description."}</p>
        <p className="text-xs text-text-tertiary mt-1.5">{project ? <Link href={`/crucible/projects/${project.id}`} className="hover:underline">{project.name}</Link> : exp.projectId} · {exp.task || "No task set"} · created {when(exp.createdAt)}</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Runs shown" value={runs.length} sub={applied ? "Filtered" : undefined} /><Kpi label="Running now" value={running} />
        <Kpi label="Finished" value={runs.filter((r) => r.status === "finished").length} /><Kpi label="Failed or stopped" value={runs.filter((r) => r.status === "failed" || r.status === "killed").length} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); setApplied(filter.trim()); }} className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[260px]"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <Input aria-label="Filter runs" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder='status = "finished" and metrics.loss < 0.3' className="pl-9 font-code text-xs" /></div>
        <Select aria-label="Order" value={order} onChange={(e) => setOrder(e.target.value)} className="w-44">{ORDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
        <Button variant="secondary" type="submit">Apply</Button>
        <Button variant="secondary" type="button" disabled={picked.length < 2} onClick={compare}><GitCompare size={14} /> Compare {picked.length > 1 ? picked.length : ""}</Button>
        <Link href={`/crucible/lineage?experiment=${id}`} className="inline-flex h-9 items-center rounded-md border border-border-strong px-3 text-[13px] font-medium hover:bg-surface-muted">View lineage</Link>
      </form>
      {error && <Notice tone="bad" title={applied ? "The filter could not be used" : "Could not load the runs"}>{error}</Notice>}
      {cmpErr && <Notice tone="bad">{cmpErr}</Notice>}
      {!loading && !error && runs.length === 0 ? <Card><EmptyState icon={FlaskConical} title={applied ? "No run matches the filter" : "No runs yet"} description={applied ? "Loosen the filter, or clear it to see every run." : "A run appears here as soon as a machine starts one with a key of this project."} action={applied ? <Button variant="secondary" onClick={() => { setFilter(""); setApplied(""); }}>Clear filter</Button> : undefined} /></Card> : (
        <Card className="overflow-hidden">
          {metricKeys.length > 0 && <div className="flex items-center gap-2 px-4 pt-3 text-xs text-text-secondary">Metric column<Select aria-label="Metric column" value={col} onChange={(e) => setShown(e.target.value)} className="w-48 h-8">{metricKeys.map((k) => <option key={k}>{k}</option>)}</Select></div>}
          <Table><Thead><tr><Th className="w-8"><span className="sr-only">Compare</span></Th><Th>Run</Th><Th>Status</Th><Th>{col ?? "Metric"}</Th><Th>Data</Th><Th>GPU hours</Th><Th>Started</Th></tr></Thead><tbody>
            {runs.map((r) => <Tr key={r.id}>
              <Td><input type="checkbox" aria-label={`Compare ${r.name}`} checked={picked.includes(r.id)} onChange={() => toggle(r.id)} /></Td>
              <Td><Link href={`/crucible/runs/${r.id}`} className="font-medium text-text-primary hover:underline">{r.name}</Link><div className="text-xs text-text-tertiary">{person(r.owner)}</div></Td>
              <Td><RunBadge s={r.status} /></Td>
              <Td className="tabular-nums text-text-secondary">{col && r.metrics[col] ? num(r.metrics[col].last) : "Not logged"}</Td>
              <Td className="text-text-secondary">{r.dataset ? `${r.dataset.name} v${r.dataset.version}` : "None pinned"}</Td>
              <Td className="tabular-nums text-text-secondary">{r.gpuHours ? r.gpuHours.toFixed(1) : "0"}</Td>
              <Td className="text-text-secondary">{ago(r.startedAt)}</Td>
            </Tr>)}
          </tbody></Table>
        </Card>
      )}
      {runs.length > 0 && <button className="text-xs text-text-tertiary underline underline-offset-2" onClick={reload}>Refresh the list</button>}
      <Modal open={cmp !== null} onClose={() => setCmp(null)} wide title="Compare runs" footer={<Button variant="primary" onClick={() => setCmp(null)}>Close</Button>}>
        {cmp && <Compare c={cmp} />}
      </Modal>
    </div>
  );
}

export const num = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(1) : Math.abs(v) >= 1 ? v.toFixed(3) : v.toPrecision(3));

function Compare({ c }: { c: Comparison }) {
  return (
    <div className="space-y-5 overflow-x-auto">
      <div><h4 className="text-sm font-semibold text-text-primary mb-2">Parameters that differ</h4>
        {c.paramsThatDiffer.length === 0 ? <p className="text-sm text-text-secondary">These runs used the same parameters.</p> : (
          <Table><Thead><tr><Th>Parameter</Th>{c.runs.map((r) => <Th key={r.id}>{r.name}</Th>)}</tr></Thead><tbody>
            {c.paramsThatDiffer.map((k) => <Tr key={k}><Td className="font-code text-xs">{k}</Td>{c.runs.map((r) => <Td key={r.id} className="font-code text-xs">{r.params[k] ?? "not set"}</Td>)}</Tr>)}
          </tbody></Table>
        )}</div>
      <div><h4 className="text-sm font-semibold text-text-primary mb-2">Metrics, last value</h4>
        {c.metricKeys.length === 0 ? <p className="text-sm text-text-secondary">None of these runs logged a metric.</p> : (
          <Table><Thead><tr><Th>Metric</Th>{c.runs.map((r) => <Th key={r.id}>{r.name}</Th>)}</tr></Thead><tbody>
            {c.metricKeys.map((k) => <Tr key={k}><Td className="font-code text-xs">{k}</Td>{c.runs.map((r) => <Td key={r.id} className="tabular-nums">{r.metrics[k] ? num(r.metrics[k].last) : "not logged"}</Td>)}</Tr>)}
          </tbody></Table>
        )}</div>
    </div>
  );
}
