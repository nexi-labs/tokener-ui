"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Network } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Notice } from "@/components/mlops/ui";
import { RunBadge } from "@/components/crucible/bits";
import { crucibleDriver, useCrucibleLive } from "@/lib/crucible/live/store";
import type { LineageLink } from "@/lib/crucible/live/types";
import { ago } from "@/lib/agents/format";
import { useRead } from "./hooks";

function Inner() {
  const { experiments, projects } = useCrucibleLive(); const sp = useSearchParams();
  const wanted = sp.get("experiment"); const traced = sp.get("run");
  const [exp, setExp] = useState<string>(wanted && experiments.some((e) => e.id === wanted) ? wanted : experiments[0]?.id ?? "");
  useEffect(() => { if (!exp && experiments[0]) setExp(experiments[0].id); }, [experiments, exp]);
  const { data, error, loading } = useRead(() => exp ? crucibleDriver().lineage(exp) : Promise.resolve({ ok: true as const, links: [] as LineageLink[] }), [exp]);
  const links = data?.links ?? [];
  const e = experiments.find((x) => x.id === exp); const project = projects.find((p) => p.project.id === e?.projectId)?.project;
  const datasets = useMemo(() => { const m = new Map<string, LineageLink[]>(); links.forEach((l) => { const k = l.datasetName ? `${l.datasetName} v${l.datasetVersion}` : "No dataset pinned"; m.set(k, [...(m.get(k) ?? []), l]); }); return [...m.entries()]; }, [links]);
  const models = useMemo(() => { const m = new Map<string, LineageLink[]>(); links.filter((l) => l.modelName).forEach((l) => { const k = `${l.modelName}${l.modelVersion ? ` v${l.modelVersion}` : ""}`; m.set(k, [...(m.get(k) ?? []), l]); }); return [...m.entries()]; }, [links]);
  return (
    <div className="space-y-5">
      <PageHeader title="Lineage" description="Follow a model back to the exact data version and run that produced it. Every run records the dataset version it pinned and the model it wrote."
        action={<div className="w-64"><Select aria-label="Experiment" value={exp} onChange={(x) => setExp(x.target.value)}>{experiments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></div>} />
      {e && <p className="text-xs text-text-tertiary -mt-2">{project?.name ?? e.projectId} · {e.task || "No task set"}{traced ? ` · tracing run ${traced}` : ""}</p>}
      {experiments.length === 0 ? <Card><EmptyState icon={Network} title="No experiments yet" description="Lineage is read per experiment. Create an experiment and log a run to see it." /></Card> : null}
      {error && <Notice tone="bad" title="Could not load the lineage">{error}</Notice>}
      {!error && !loading && exp && links.length === 0 && <Card><EmptyState icon={Network} title="No runs to trace yet" description="Lineage appears once a run of this experiment has been logged." /></Card>}
      {links.length > 0 && (
        <>
          <div className="grid md:grid-cols-3 gap-4 items-start">
            <Lane title="Data" empty="No run pinned a dataset.">{datasets.filter(([k]) => k !== "No dataset pinned").map(([k, ls]) => <Card key={k} className="p-3"><div className="text-sm font-medium text-text-primary">{k}</div><div className="text-xs text-text-tertiary mt-0.5">{ls.length} run{ls.length === 1 ? "" : "s"} used this version</div></Card>)}</Lane>
            <Lane title="Runs" empty="">{links.map((l) => <Card key={l.runId} className={`p-3 ${l.runId === traced ? "border-border-strong ring-1 ring-border-strong" : ""}`}><div className="flex items-center justify-between gap-2"><Link href={`/crucible/runs/${l.runId}`} className="text-sm font-medium text-text-primary hover:underline truncate">{l.runName}</Link><RunBadge s={l.status} /></div><div className="text-xs text-text-tertiary mt-0.5">{ago(l.startedAt)}</div></Card>)}</Lane>
            <Lane title="Models" empty="No run wrote a model yet.">{models.map(([k, ls]) => <Card key={k} className="p-3"><div className="text-sm font-medium text-text-primary">{k}</div><div className="text-xs text-text-tertiary mt-0.5">from {ls.map((l) => l.runName).join(", ")}</div></Card>)}</Lane>
          </div>
          <Card className="overflow-hidden"><Table>
            <Thead><tr><Th>Run</Th><Th>Status</Th><Th>Trained on</Th><Th>Produced</Th><Th>Started</Th></tr></Thead>
            <tbody>{links.map((l) => <Tr key={l.runId}>
              <Td><Link href={`/crucible/runs/${l.runId}`} className="font-medium text-text-primary hover:underline">{l.runName}</Link></Td>
              <Td><RunBadge s={l.status} /></Td>
              <Td className="text-text-secondary">{l.datasetName ? <Link href="/crucible/datasets" className="hover:underline">{l.datasetName} v{l.datasetVersion}</Link> : <Badge tone="neutral">None pinned</Badge>}</Td>
              <Td className="text-text-secondary">{l.modelName ? `${l.modelName}${l.modelVersion ? ` v${l.modelVersion}` : ""}` : "No model"}</Td>
              <Td className="text-text-secondary">{ago(l.startedAt)}</Td>
            </Tr>)}</tbody>
          </Table></Card>
        </>
      )}
      <p className="text-xs text-text-tertiary">Built from what each run recorded. Serving and approval stages are not part of this view yet.</p>
    </div>
  );
}
function Lane({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const has = Array.isArray(children) ? children.length > 0 : !!children;
  return <div className="space-y-2"><h3 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">{title}</h3>{has ? children : <p className="text-sm text-text-secondary">{empty}</p>}</div>;
}
export function LiveLineage() { return <Suspense fallback={null}><Inner /></Suspense>; }
