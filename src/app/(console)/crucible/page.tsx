"use client";

import { useCrucibleStatus } from "@/lib/crucible/live/store";
import { LiveOverview } from "@/components/crucible/live/Overview";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Kpi, Notice } from "@/components/mlops/ui";
import { Section } from "@/components/agents/bits";
import { DecisionBadge, JobBadge, RunBadge, gb, person } from "@/components/crucible/bits";
import { useCrucible } from "@/lib/crucible/store";
import { smallestFix, defaultPlan, PRESETS } from "@/lib/crucible/memory";
import { ago, int, usd } from "@/lib/agents/format";

function SampleTrainOverview() {
  const { runs, jobs, policies, cycles, experiments } = useCrucible();
  const k = useMemo(() => {
    const month = Date.now() - 30 * 24 * 3600_000;
    const recent = runs.filter((r) => Date.parse(r.startedAt) > month);
    return {
      running: runs.filter((r) => r.status === "running").length,
      queued: jobs.filter((j) => j.state === "queued" || j.state === "admitting").length,
      gpuHours: recent.reduce((s, r) => s + r.gpuHours, 0),
      spend: recent.reduce((s, r) => s + r.costUsd, 0),
      waiting: cycles.filter((c) => c.decision === "awaiting-approval"),
      rolling: cycles.filter((c) => c.decision === "in-rollout"),
      active: policies.filter((p) => p.state === "active").length,
    };
  }, [runs, jobs, cycles, policies]);
  const oom = runs.filter((r) => r.status === "failed" && /memory/i.test(r.failure ?? ""));
  const exp = (id: string) => experiments.find((e) => e.id === id)?.name ?? id;
  const pol = (id: string) => policies.find((p) => p.id === id);
  const fix = useMemo(() => smallestFix({ ...defaultPlan(PRESETS[2]), gpus: 8, gpuGb: 80 }), []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-text-primary tracking-tight">Crucible</h1>
        <p className="text-sm text-text-secondary mt-1 max-w-2xl">Crucible tracks every run, queues jobs on your GPUs, keeps models fresh from new Refinery data and checks memory before a job starts.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Runs in progress" value={k.running} sub={`${experiments.length} experiments`} />
        <Kpi label="Jobs waiting" value={k.queued} sub="Queued or checking fit" />
        <Kpi label="GPU hours, 30 days" value={int(k.gpuHours)} sub={usd(k.spend, 0) + " sample cost"} />
        <Kpi label="Policies active" value={`${k.active} of ${policies.length}`} sub="Continuous training" />
        <Kpi label="Waiting for a decision" value={k.waiting.length} sub={k.rolling.length ? `${k.rolling.length} rolling out` : "Nothing rolling out"} tone={k.waiting.length ? "warn" : undefined} />
      </div>

      {(k.waiting.length > 0 || oom.length > 0) && (
        <Section title="Needs attention">
          <div className="space-y-2.5">
            {k.waiting.map((c) => (
              <Notice key={c.id} tone="warn" title={`${pol(c.policyId)?.name ?? c.policyId} has a candidate waiting for approval`}>
                Version {c.candidate?.version ?? "?"} beat the champion on {pol(c.policyId)?.gates.metric}. <Link href="/crucible/continuous" className="underline underline-offset-2 text-text-primary">Review the cycle</Link>
              </Notice>
            ))}
            {oom.map((r) => (
              <Notice key={r.id} tone="bad" title={`${r.name} ran out of GPU memory`}>
                {r.failure} <Link href={`/crucible/runs/${r.id}`} className="underline underline-offset-2 text-text-primary">Open the run</Link>
                {r.experimentId === "exp-llm" && <> or <Link href="/crucible/memory" className="underline underline-offset-2 text-text-primary">plan the memory</Link>. The planner finds that {fix.steps.length ? `${fix.steps.map((s) => s.label.toLowerCase()).slice(0, 2).join(" and ")} brings an 8 billion parameter full fine tune to ${gb(fix.finalTotalGb, 0)} for each GPU` : "this fits"}.</>}
              </Notice>
            ))}
          </div>
        </Section>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <Section title="Recent runs" action={<Link href="/crucible/experiments" className="text-[13px] text-text-secondary hover:text-text-primary inline-flex items-center gap-1">All experiments <ArrowRight size={13} /></Link>}>
          <Card className="overflow-hidden">
            <Table>
              <Thead><tr><Th>Run</Th><Th>Status</Th><Th>Started</Th></tr></Thead>
              <tbody>
                {[...runs].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)).slice(0, 7).map((r) => (
                  <Tr key={r.id}>
                    <Td><Link href={`/crucible/runs/${r.id}`} className="font-medium text-text-primary hover:underline">{r.name}</Link><div className="text-xs text-text-tertiary">{exp(r.experimentId)} by {person(r.owner)}</div></Td>
                    <Td><RunBadge s={r.status} /></Td>
                    <Td className="text-text-secondary">{ago(r.startedAt)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </Section>

        <Section title="Continuous training" action={<Link href="/crucible/continuous" className="text-[13px] text-text-secondary hover:text-text-primary inline-flex items-center gap-1">All policies <ArrowRight size={13} /></Link>}>
          <Card className="overflow-hidden">
            <Table>
              <Thead><tr><Th>Policy</Th><Th>Champion</Th><Th>Latest cycle</Th></tr></Thead>
              <tbody>
                {policies.map((p) => {
                  const last = cycles.find((c) => c.policyId === p.id);
                  return (
                    <Tr key={p.id}>
                      <Td><div className="font-medium text-text-primary">{p.name}</div><div className="text-xs text-text-tertiary">{p.state === "active" ? "Active" : p.state === "paused" ? "Paused" : "Draft"}</div></Td>
                      <Td className="text-text-secondary">Version {p.champion.version}</Td>
                      <Td>{last ? <DecisionBadge d={last.decision} /> : <span className="text-text-tertiary text-xs">No cycles yet</span>}</Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        </Section>
      </div>

      <Section title="Jobs" hint="Jobs are checked against the memory planner before they take a GPU.">
        <Card className="overflow-hidden">
          <Table>
            <Thead><tr><Th>Job</Th><Th>State</Th><Th>Queue</Th><Th>GPUs</Th><Th>Peak memory</Th></tr></Thead>
            <tbody>
              {jobs.slice(0, 5).map((j) => (
                <Tr key={j.id}>
                  <Td><span className="font-medium text-text-primary">{j.name}</span><div className="text-xs text-text-tertiary">{exp(j.experimentId)}</div></Td>
                  <Td><JobBadge s={j.state} /></Td>
                  <Td><Badge tone="neutral">{j.queue}</Badge></Td>
                  <Td className="text-text-secondary">{j.gpus ? `${j.gpus} x ${j.card}` : "CPU"}</Td>
                  <Td className="text-text-secondary tabular-nums">{j.peakGb !== undefined ? gb(j.peakGb, 0) : "Not yet"}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </Section>
    </div>
  );
}

/** A signed-in workspace shows what the training service returns. The sample workspace keeps its own screen. */
export default function TrainOverview() {
  return useCrucibleStatus().connected ? <LiveOverview /> : <SampleTrainOverview />;
}
