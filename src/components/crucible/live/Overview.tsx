"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Kpi, Notice } from "@/components/mlops/ui";
import { Section } from "@/components/agents/bits";
import { RunBadge } from "@/components/crucible/bits";
import { crucibleDriver, useCrucibleLive } from "@/lib/crucible/live/store";
import type { Run } from "@/lib/crucible/live/types";
import { ago, usd } from "@/lib/agents/format";
import { person } from "./bits";

export function LiveOverview() {
  const { projects, experiments, stores, datasets } = useCrucibleLive();
  const [runs, setRuns] = useState<Run[] | null>(null); const [failed, setFailed] = useState(0);
  const ids = projects.map((p) => p.project.id).join(",");
  useEffect(() => {
    let live = true;
    const load = async () => {
      const rs = await Promise.all(projects.map((p) => crucibleDriver().searchRuns({ projectId: p.project.id, orderBy: "started desc", limit: 100 })));
      if (!live) return;
      setFailed(rs.filter((r) => !r.ok).length);
      setRuns(rs.flatMap((r) => (r.ok ? r.runs : [])).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)));
    };
    load(); const t = setInterval(load, 15000);
    return () => { live = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  const month = Date.now() - 30 * 24 * 3600_000;
  const recent = (runs ?? []).filter((r) => Date.parse(r.startedAt) > month);
  const bad = (runs ?? []).filter((r) => r.status === "failed").slice(0, 3);
  const exp = (id: string) => experiments.find((e) => e.id === id)?.name ?? id;
  const unready = stores.filter((s) => s.status !== "connected");
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-text-primary tracking-tight">Crucible</h1>
        <p className="text-sm text-text-secondary mt-1 max-w-2xl">Crucible records every training run your machines log, keeps its artifacts in your own store and ties each run to the exact data version it trained on.</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Runs in progress" value={runs ? runs.filter((r) => r.status === "running").length : "..."} sub={`${experiments.length} experiments`} />
        <Kpi label="Runs, 30 days" value={runs ? recent.length : "..."} sub={`${projects.length} project${projects.length === 1 ? "" : "s"}`} />
        <Kpi label="GPU hours, 30 days" value={runs ? Math.round(recent.reduce((s, r) => s + r.gpuHours, 0)) : "..."} sub={runs ? `${usd(recent.reduce((s, r) => s + r.costUsd, 0), 0)} reported by runs` : undefined} />
        <Kpi label="Datasets exposed" value={datasets.filter((d) => d.exposed).length} sub={`${datasets.length} from the Refinery`} />
        <Kpi label="Machines enrolled" value={projects.reduce((n, p) => n + p.machines, 0)} sub={`${projects.reduce((n, p) => n + p.activeKeys, 0)} active keys`} />
      </div>
      {failed > 0 && <Notice tone="warn">The runs of {failed} project{failed === 1 ? "" : "s"} could not be read, so the figures above may be low.</Notice>}
      {(bad.length > 0 || unready.length > 0) && (
        <Section title="Needs attention"><div className="space-y-2.5">
          {unready.map((s) => <Notice key={s.id} tone={s.status === "failing" ? "bad" : "warn"} title={`${s.name} is ${s.status === "failing" ? "failing" : "not tested"}`}>{s.testNote ?? "Test the connection before projects rely on it."} <Link href="/crucible/storage" className="underline underline-offset-2 text-text-primary">Open storage</Link></Notice>)}
          {bad.map((r) => <Notice key={r.id} tone="bad" title={`${r.name} failed`}>{r.failure ?? "No reason was recorded."} <Link href={`/crucible/runs/${r.id}`} className="underline underline-offset-2 text-text-primary">Open the run</Link></Notice>)}
        </div></Section>
      )}
      <Section title="Recent runs" action={<Link href="/crucible/experiments" className="text-[13px] text-text-secondary hover:text-text-primary inline-flex items-center gap-1">All experiments <ArrowRight size={13} /></Link>}>
        <Card className="overflow-hidden"><Table>
          <Thead><tr><Th>Run</Th><Th>Status</Th><Th>Started</Th></tr></Thead>
          <tbody>
            {(runs ?? []).slice(0, 8).map((r) => <Tr key={r.id}><Td><Link href={`/crucible/runs/${r.id}`} className="font-medium text-text-primary hover:underline">{r.name}</Link><div className="text-xs text-text-tertiary">{exp(r.experimentId)} by {person(r.owner)}</div></Td><Td><RunBadge s={r.status} /></Td><Td className="text-text-secondary">{ago(r.startedAt)}</Td></Tr>)}
            {runs && runs.length === 0 && <Tr><Td colSpan={3} className="text-sm text-text-secondary py-6">{projects.length === 0 ? "Create a project and enrol a machine to start logging runs." : "No run has been logged yet. Connect a machine from a project's Connect tab."}</Td></Tr>}
          </tbody>
        </Table></Card>
      </Section>
    </div>
  );
}
