"use client";

import Link from "next/link";
import { Plus, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { DemoTag, EnvBadge, GuardButton, RunBadge, relTime, useRole } from "@/components/mlops/ui";
import { useMlops } from "@/lib/mlops/store";
import { can } from "@/lib/mlops/rbac";
import { shortDigest } from "@/components/mlops/ui";

export default function PipelinesPage() {
  const s = useMlops()!;
  const role = useRole();
  return (
    <div className="space-y-5">
      <PageHeader title="Pipelines" description="Versioned definitions for build, release and retrieval workflows. Draw them on a canvas or build them with a guided wizard. Both edit the same spec."
        action={can(role, "pipeline.edit").ok ? <Link href="/mlops/pipelines/new"><Button variant="primary"><Plus size={15} /> New pipeline</Button></Link> : <GuardButton action="pipeline.edit" role={role} variant="primary" onClick={() => {}}><Plus size={15} /> New pipeline</GuardButton>} />
      <Card>
        {s.pipelines.length === 0 ? <EmptyState icon={Workflow} title="No pipelines yet" description="Start from a template or from scratch." action={<Link href="/mlops/pipelines/new"><Button variant="primary">New pipeline</Button></Link>} /> : (
          <Table>
            <Thead><tr><Th>Pipeline</Th><Th>Environment</Th><Th>Latest version</Th><Th>Operators</Th><Th>Last run</Th><Th>State</Th></tr></Thead>
            <tbody>
              {s.pipelines.map((p) => {
                const v = p.versions[0];
                const last = s.runs.find((r) => r.pipelineId === p.id);
                return (
                  <Tr key={p.id}>
                    <Td><Link href={`/mlops/pipelines/${p.id}`} className="font-medium hover:underline">{p.name}</Link> {p.demo && <DemoTag />}<div className="text-xs text-text-tertiary max-w-md truncate">{p.description}</div></Td>
                    <Td><EnvBadge env={p.env} /></Td>
                    <Td>{v ? <><span className="font-medium">v{v.version}</span> <span className="text-text-tertiary text-xs font-code">{shortDigest(v.digest)}</span></> : <span className="text-text-tertiary">unpublished</span>}</Td>
                    <Td className="tabular-nums">{(p.draft?.spec ?? v?.spec)?.nodes.length ?? 0}</Td>
                    <Td>{last ? <span className="inline-flex items-center gap-2"><RunBadge s={last.status} /><span className="text-xs text-text-tertiary">{relTime(last.startedAt)}</span></span> : <span className="text-text-tertiary">never</span>}</Td>
                    <Td>{p.draft ? <Badge tone="info">Draft saved</Badge> : <Badge>Published</Badge>}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
