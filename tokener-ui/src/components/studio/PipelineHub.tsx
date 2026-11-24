"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Workflow } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { NodeIcon } from "@/components/studio/icons";
import { EnvBadge, GuardButton, RunBadge, relTime, shortDigest, useRole } from "@/components/mlops/ui";
import { OPERATORS, OPERATOR_FAMILY, type OperatorFamily } from "@/lib/mlops/operators";
import { can } from "@/lib/mlops/rbac";
import { useMlops } from "@/lib/mlops/store";
import { versionLabel } from "@/lib/mlops/types";

/**
 * The home of operator pipelines: everything built from the full operator catalogue (retrieval and RAG, functions and workflows, connectors,
 * triggers, payments, build and release). Opening one loads the canvas builder; saved pipelines are the same records MLOps shows.
 */
export function PipelineHub() {
  const s = useMlops()!;
  const role = useRole();
  const router = useRouter();
  const [family, setFamily] = useState<OperatorFamily | "all">("all");
  const families = Object.keys(OPERATOR_FAMILY) as OperatorFamily[];
  const shown = OPERATORS.filter((o) => family === "all" || o.family === family);

  return (
    <div className="space-y-5">
      <PageHeader title="Pipeline Studio"
        description="Build a pipeline from the full operator catalogue, configure every operator, save it, then simulate it for free or run it in an environment."
        action={can(role, "pipeline.edit").ok
          ? <Link href="/pipeline-studio/new"><Button variant="primary"><Plus size={15} /> New pipeline</Button></Link>
          : <GuardButton action="pipeline.edit" role={role} onClick={() => router.push("/pipeline-studio/new")} variant="primary"><Plus size={15} /> New pipeline</GuardButton>} />

      <Card>
        <CardHeader title="Your pipelines" subtitle="Saved as drafts while you edit. Publish a version to make it runnable in an environment." />
        {s.pipelines.length === 0 ? (
          <EmptyState icon={Workflow} title="No pipelines yet" description="Start from a template or from a blank canvas, then add operators."
            action={<Link href="/pipeline-studio/new"><Button variant="primary">New pipeline</Button></Link>} />
        ) : (
          <Table>
            <Thead><tr><Th>Pipeline</Th><Th>Environment</Th><Th>Operators</Th><Th>Version</Th><Th>Last run</Th><Th><span className="sr-only">Actions</span></Th></tr></Thead>
            <tbody>
              {s.pipelines.map((p) => {
                const v = p.versions[0];
                const last = s.runs.find((r) => r.pipelineId === p.id);
                const spec = p.draft?.spec ?? v?.spec;
                return (
                  <Tr key={p.id}>
                    <Td>
                      <Link href={`/pipeline-studio/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                      <div className="text-xs text-text-tertiary max-w-[11rem] 2xl:max-w-[20rem] truncate">{p.description || "No description"}</div>
                    </Td>
                    <Td><EnvBadge env={p.env} /></Td>
                    <Td className="tabular-nums">{spec?.nodes.length ?? 0}</Td>
                    <Td>
                      {v ? <span className="font-medium">v{v.version} <span className="text-text-tertiary text-xs font-code">{shortDigest(v.digest)}</span></span> : <span className="text-text-tertiary">unpublished</span>}
                      {p.draft && <div className="mt-0.5"><Badge tone="info">Draft saved</Badge></div>}
                    </Td>
                    <Td className="whitespace-nowrap">{last ? <div className="flex flex-col items-start gap-1"><RunBadge s={last.status} /><span className="text-xs text-text-tertiary">{versionLabel(last.pipelineVersion)}, {relTime(last.startedAt)}</span></div> : <span className="text-text-tertiary">never run</span>}</Td>
                    <Td className="text-right whitespace-nowrap">
                      <Link href={`/pipeline-studio/${p.id}`}><Button variant="secondary"><Pencil size={13} /> Open</Button></Link>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="Operator catalogue" subtitle={`${OPERATORS.length} operators you can drag onto a canvas. Each has typed ports, so only compatible steps connect.`} />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Operator family">
            {(["all", ...families] as const).map((f) => {
              const n = f === "all" ? OPERATORS.length : OPERATORS.filter((o) => o.family === f).length;
              return (
                <button key={f} role="tab" aria-selected={family === f} onClick={() => setFamily(f)}
                  className={`h-8 px-3 rounded-md text-[13px] border ${family === f ? "bg-emph text-on-emph border-emph" : "border-border-strong text-text-secondary hover:bg-surface-muted"}`}>
                  {f === "all" ? "All" : OPERATOR_FAMILY[f].label} <span className="opacity-70 tabular-nums">{n}</span>
                </button>
              );
            })}
          </div>
          <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {shown.map((o) => (
              <li key={o.kind} className="flex gap-3 rounded-md border border-border p-3">
                <span className="h-9 w-9 rounded-md bg-surface-muted grid place-items-center shrink-0"><NodeIcon icon={o.icon} size={17} /></span>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium">{o.label}</div>
                  <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{o.desc}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <Badge>{OPERATOR_FAMILY[o.family].label}</Badge>
                    {o.needsConnection && <Badge tone="info">Uses a connection</Badge>}
                    {o.executable === "none" && <Badge tone="neutral">Draw only</Badge>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
