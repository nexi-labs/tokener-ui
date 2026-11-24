"use client";

import Link from "next/link";
import { Activity } from "lucide-react";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { EnvBadge, RunBadge, fmtDuration, relTime } from "@/components/mlops/ui";
import { useMlops } from "@/lib/mlops/store";
import { ENVS, ENV_LABEL, type Env, type RunStatus, versionLabel } from "@/lib/mlops/types";

const STATUSES: RunStatus[] = ["running", "waiting-approval", "succeeded", "failed", "validation-failed", "rolled-back", "cancelled"];

export default function RunsPage() {
  const s = useMlops()!;
  const [status, setStatus] = useState<RunStatus | "all">("all");
  const [env, setEnv] = useState<Env | "all">("all");
  const list = s.runs.filter((r) => (status === "all" || r.status === status) && (env === "all" || r.env === env));
  return (
    <div className="space-y-5">
      <PageHeader title="Pipeline runs" description="Every run keeps an immutable snapshot of the spec it executed, with stage status, timing, logs, events and artifacts." />
      <div className="flex gap-2">
        <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as RunStatus | "all")} className="w-48"><option value="all">Any status</option>{STATUSES.map((x) => <option key={x} value={x}>{x}</option>)}</Select>
        <Select aria-label="Environment" value={env} onChange={(e) => setEnv(e.target.value as Env | "all")} className="w-44"><option value="all">All environments</option>{ENVS.map((e) => <option key={e} value={e}>{ENV_LABEL[e]}</option>)}</Select>
      </div>
      <Card>
        {list.length === 0 ? <EmptyState icon={Activity} title="No runs match" description="Change the filters, or run a published pipeline." /> : (
          <Table>
            <Thead><tr><Th>Run</Th><Th>Pipeline</Th><Th>Environment</Th><Th>Status</Th><Th>Trigger</Th><Th>Started by</Th><Th>Started</Th><Th>Duration</Th></tr></Thead>
            <tbody>
              {list.map((r) => (
                <Tr key={r.id}>
                  <Td><Link href={`/mlops/runs/${r.id}`} className="font-code text-xs hover:underline">{r.id}</Link></Td>
                  <Td><span className="font-medium">{r.pipelineName}</span> <span className="text-xs text-text-tertiary">{versionLabel(r.pipelineVersion)}</span></Td>
                  <Td><EnvBadge env={r.env} /></Td><Td><RunBadge s={r.status} /></Td>
                  <Td className="text-text-secondary">{r.trigger}</Td><Td className="text-text-secondary">{r.startedBy}</Td><Td className="text-text-secondary">{relTime(r.startedAt)}</Td>
                  <Td className="tabular-nums text-text-secondary">{r.status === "running" ? "in progress" : r.status === "waiting-approval" ? "paused" : fmtDuration(r.durationMs)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
