"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus, Workflow } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { FnIcon } from "@/components/functions/FnIcon";
import { TriggerChip, WfRunBadge, WfStatusBadge, ago, pct, useFx } from "@/components/functions/ui";
import { num, usd2 } from "@/lib/functions/types";

export default function Workflows() {
  const s = useFx();
  const [status, setStatus] = useState("all");
  const week = new Date(s.anchor).getTime() - 7 * 86_400_000;
  const rows = s.workflows.filter((w) => status === "all" || w.status === status).map((w) => {
    const runs = s.runs.filter((r) => r.workflowId === w.id && new Date(r.startedAt).getTime() >= week);
    return { w, runs, ok: runs.filter((r) => r.status === "succeeded").length, cost: runs.reduce((a, r) => a + r.costMicros, 0), waiting: runs.filter((r) => r.status === "waiting-approval").length, last: runs[0] };
  });
  return (
    <div className="space-y-5">
      <PageHeader title="Workflows" description="Chain triggers, functions, AI calls, conditions, policy checks and human approvals into one governed run with a single cost and audit trail."
        action={<Link href="/mlops/functions/workflows/new"><Button variant="primary"><Plus size={14} /> New workflow</Button></Link>} />
      {s.workflows.length === 0 ? (
        <Card><EmptyState icon={Workflow} title="No workflows yet" description="A workflow chains functions, AI calls and approvals. Start with a trigger and an output, then add steps." action={<Link href="/mlops/functions/workflows/new" className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-emph text-on-emph text-sm font-medium"><Plus size={14} /> New workflow</Link>} /></Card>
      ) : (
        <>
          <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="!w-44"><option value="all">Any status</option><option value="active">Active</option><option value="draft">Draft</option><option value="disabled">Disabled</option></Select>
          <Card>
            <Table>
              <Thead><tr><Th>Workflow</Th><Th>Status</Th><Th>Trigger</Th><Th>Steps</Th><Th>Runs, 7 days</Th><Th>Success</Th><Th>Waiting</Th><Th>AI cost</Th><Th>Last run</Th></tr></Thead>
              <tbody>
                {rows.map(({ w, runs, ok, cost, waiting, last }) => (
                  <Tr key={w.id}>
                    <Td><div className="flex items-center gap-3"><span className="grid place-items-center h-9 w-9 rounded-lg bg-ink-800 text-accent-500"><FnIcon name="workflow" size={18} /></span><div><Link href={`/mlops/functions/workflows/${w.id}`} className="font-medium hover:underline">{w.name}</Link><div className="text-xs text-text-tertiary">{w.useCase}</div></div></div></Td>
                    <Td><WfStatusBadge s={w.status} /></Td><Td><TriggerChip kind={w.trigger.kind} /></Td><Td className="tabular-nums text-text-secondary">{w.steps.length}</Td>
                    <Td className="tabular-nums">{num(runs.length)}</Td><Td className="tabular-nums text-text-secondary">{pct(ok, runs.length)}</Td><Td className="tabular-nums">{waiting || "none"}</Td>
                    <Td className="tabular-nums text-text-secondary">{usd2(cost)}</Td><Td>{last ? <span className="inline-flex flex-col gap-0.5"><WfRunBadge s={last.status} /><span className="text-xs text-text-tertiary">{ago(last.startedAt, s.anchor)}</span></span> : <span className="text-text-tertiary">never</span>}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            {rows.length === 0 && <p className="p-6 text-sm text-text-secondary">No workflow has that status.</p>}
          </Card>
        </>
      )}
    </div>
  );
}
