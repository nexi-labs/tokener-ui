"use client";

import { useCrucibleStatus } from "@/lib/crucible/live/store";
import { LiveExperiments } from "@/components/crucible/live/Experiments";

import Link from "next/link";
import { useMemo } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { PageHeader } from "@/components/ui/PageHeader";
import { PRIMARY, RunBadge, mval, person } from "@/components/crucible/bits";
import { useCrucible } from "@/lib/crucible/store";
import { better } from "@/lib/crucible/sample";
import { ago, int } from "@/lib/agents/format";

function SampleExperiments() {
  const { experiments, runs } = useCrucible();
  const rows = useMemo(() => experiments.map((e) => {
    const rs = runs.filter((r) => r.experimentId === e.id); const key = PRIMARY[e.id];
    const done = rs.filter((r) => r.status === "finished" && r.metrics[key] !== undefined);
    const best = done.reduce<typeof done[number] | undefined>((b, r) => (!b || better(key, r.metrics[key], b.metrics[key]) ? r : b), undefined);
    const last = [...rs].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
    return { e, rs, key, best, last, gpuHours: rs.reduce((s, r) => s + r.gpuHours, 0) };
  }), [experiments, runs]);

  return (
    <div>
      <PageHeader title="Experiments" description="An experiment groups the runs that try to solve one task. Every run keeps its parameters, metrics, data version, code commit, container image and artifacts, so it can be repeated." />
      <Card className="overflow-hidden">
        <Table>
          <Thead><tr><Th>Experiment</Th><Th>Task</Th><Th>Runs</Th><Th>Best result</Th><Th>Latest run</Th><Th>GPU hours</Th></tr></Thead>
          <tbody>
            {rows.map(({ e, rs, key, best, last, gpuHours }) => (
              <Tr key={e.id}>
                <Td>
                  <Link href={`/crucible/experiments/${e.id}`} className="font-medium text-text-primary hover:underline">{e.name}</Link>
                  <div className="text-xs text-text-tertiary mt-0.5">{e.department} · {person(e.owner)}</div>
                </Td>
                <Td><div className="text-text-secondary">{e.task}</div>{e.model && <div className="text-xs text-text-tertiary">Registry model {e.model}</div>}</Td>
                <Td className="tabular-nums">{rs.length}</Td>
                <Td>{best ? <><span className="tabular-nums font-medium text-text-primary">{mval(key, best.metrics[key])}</span><div className="text-xs text-text-tertiary">{key.replace(/_/g, " ")} · {best.name}</div></> : <span className="text-text-tertiary">None yet</span>}</Td>
                <Td>{last ? <div className="flex items-center gap-2"><RunBadge s={last.status} /><span className="text-xs text-text-tertiary">{ago(last.startedAt)}</span></div> : null}</Td>
                <Td className="tabular-nums text-text-secondary">{int(gpuHours)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <p className="text-xs text-text-tertiary mt-3">{runs.length} runs in {experiments.length} experiments. <Badge tone="neutral">Sample</Badge> These are seeded records. Nothing here was trained.</p>
    </div>
  );
}

/** A signed-in workspace shows what the training service returns. The sample workspace keeps its own screen. */
export default function Experiments() {
  return useCrucibleStatus().connected ? <LiveExperiments /> : <SampleExperiments />;
}
