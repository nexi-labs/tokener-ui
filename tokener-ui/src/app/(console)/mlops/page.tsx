"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, Hammer, Plug, Plus, Workflow } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { EnvBadge, HealthBadge, Kpi, RunBadge, fmtDuration, relTime, useRole } from "@/components/mlops/ui";
import { FlowStrip, StoryCarousel } from "@/components/mlops/StoryCarousel";
import { useMlops, useMlopsStatus } from "@/lib/mlops/store";
import { useIntegrations } from "@/lib/platform/integrations";
import { ENVS, ENV_LABEL, versionLabel } from "@/lib/mlops/types";

export default function MlopsOverview() {
  const INTEGRATIONS = useIntegrations();
  const s = useMlops()!;
  const live = useMlopsStatus().mode === "live";
  const role = useRole();
  const day = Date.now() - 24 * 3600_000;
  const recent = s.runs.filter((r) => new Date(r.startedAt).getTime() > day && r.status !== "running");
  const ok = recent.filter((r) => r.status === "succeeded").length;
  const waiting = s.runs.filter((r) => r.status === "waiting-approval");
  const firing = s.alerts.filter((a) => a.state === "firing");
  const unhealthyConns = s.connections.filter((c) => c.health === "failed" || c.health === "attention" || c.health === "unknown");
  const counts = INTEGRATIONS.reduce((m, i) => ({ ...m, [i.status]: (m[i.status] ?? 0) + 1 }), {} as Record<string, number>);

  return (
    <div className="space-y-6">
      <PageHeader
        title="MLOps control plane"
        description="Connect the infrastructure you already run, register models, and deploy and observe them across development, staging and production from one place."
        action={
          <div className="flex gap-2">
            <Link href="/mlops/integrations"><Button><Plug size={15} /> Connect</Button></Link>
            <Link href="/mlops/pipelines/new"><Button variant="primary"><Plus size={15} /> New pipeline</Button></Link>
          </div>
        }
      />

      <StoryCarousel
        label="How the MLOps control plane works"
        slides={[
          { title: "Connect what you already run", body: "Add Kubernetes clusters, registries, model registries, data stores and Linux servers as connections. Start read-only, run a real non-destructive test, then widen permissions deliberately. Secrets stay in your secret manager.", note: "Bring your own tools.", visual: <FlowStrip nodes={["Cluster", "Registry", "MLflow", "Object store"]} accentIndex={0} /> },
          { title: "Register models with provenance", body: "Every version records its commit, dataset hash, builder, checksum, license and evaluation metrics. Approvals are explicit and attributed.", visual: <FlowStrip nodes={["Source", "Build", "Validate", "Register"]} accentIndex={3} /> },
          { title: "Design the pipeline your way", body: "Draw it on a canvas or answer a guided wizard. Both edit the same versioned pipeline spec, so you can switch at any time and review the generated manifests before anything applies.", note: "One spec, two ways in.", visual: <FlowStrip nodes={["Registry", "Approval", "Canary", "Verify", "Promote"]} accentIndex={2} /> },
          { title: "Deploy, verify, roll back", body: "Plan first. Apply with confirmation. Verification reads real observed state, and a failed check restores the previous version without a ticket.", visual: <FlowStrip nodes={["Plan", "Apply", "Verify", "Promote"]} accentIndex={2} branch={{ from: 2, label: "Rollback" }} /> },
          { title: "Observe capacity and cost", body: "Latency, errors, saturation and GPU usage per endpoint, with cost shown as an estimate until verified against your billing source.", visual: <FlowStrip nodes={["Endpoint", "Metrics", "Alerts", "Cost"]} accentIndex={1} /> },
        ]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Kpi label="Connections healthy" value={`${s.connections.filter((c) => c.health === "healthy").length}/${s.connections.length}`} sub={`${unhealthyConns.length} need attention`} tone={unhealthyConns.length ? "warn" : undefined} />
        <Kpi label="Deployments healthy" value={`${s.deployments.filter((d) => d.health === "healthy").length}/${s.deployments.length}`} sub={`${s.deployments.filter((d) => d.rollout.state === "in-progress").length} rolling out`} />
        <Kpi label="Run success, 24 h" value={recent.length ? `${Math.round((ok / recent.length) * 100)}%` : "n/a"} sub={`${recent.length} finished runs`} />
        <Kpi label="Waiting for approval" value={waiting.length} sub={waiting[0]?.pipelineName ?? "Nothing pending"} tone={waiting.length ? "warn" : undefined} />
        <Kpi label="Open alerts" value={firing.length} sub={`${firing.filter((a) => a.severity === "critical").length} critical`} tone={firing.some((a) => a.severity === "critical") ? "bad" : firing.length ? "warn" : undefined} />
        <Kpi label="Build agents online" value={`${s.agents.filter((a) => a.status === "online").length}/${s.agents.length}`} sub="Outbound-only, scoped" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 min-w-0">
          <CardHeader title="Needs attention" subtitle="Failing, expiring or waiting on a person" />
          <div className="divide-y divide-border">
            {waiting.map((r) => (
              <Link key={r.id} href={`/mlops/runs/${r.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-subtle">
                <Badge tone="degraded">Approval</Badge>
                <div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{r.pipelineName} is waiting for an approver</div><div className="text-xs text-text-tertiary">Started {relTime(r.startedAt)} by {r.startedBy}. {role === "approver" || role === "admin" ? "You can approve it." : "Switch to the approver role to approve."}</div></div>
                <ArrowRight size={14} className="text-text-tertiary" />
              </Link>
            ))}
            {firing.map((a) => (
              <div key={a.id} className="flex items-start gap-3 px-5 py-3">
                <Badge tone={a.severity === "critical" ? "down" : "degraded"}>{a.severity}</Badge>
                <div className="min-w-0 flex-1"><div className="text-sm font-medium">{a.title} <span className="text-text-tertiary font-normal">on {a.resource}</span></div><div className="text-xs text-text-secondary mt-0.5">{a.detail}</div></div>
                <span className="text-xs text-text-tertiary shrink-0">{relTime(a.since)}</span>
              </div>
            ))}
            {!waiting.length && !firing.length && <div className="px-5 py-8 text-sm text-text-secondary text-center">Nothing needs attention.</div>}
          </div>
        </Card>

        <Card>
          <CardHeader title="What is real in this build" subtitle="Connector delivery status" />
          <CardBody className="space-y-3">
            {([["available", "Available"], ["beta", "Beta"], ["planned", "Planned"], ["custom", "Custom"]] as const).map(([k, l]) => (
              <div key={k} className="flex items-center justify-between text-sm"><span className="text-text-secondary">{l}</span><span className="font-semibold tabular-nums">{counts[k] ?? 0}</span></div>
            ))}
            <p className="text-xs text-text-tertiary leading-relaxed pt-1">{live ? "Figures on this page are read from your workspace." : "Figures on this page come from the sample workspace until live connections report in."} See the <Link href="/mlops/integrations" className="text-text-primary underline underline-offset-2">catalogue</Link> for status, versions and prerequisites per integration.</p>
          </CardBody>
        </Card>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {ENVS.map((e) => {
          const deps = s.deployments.filter((d) => d.env === e);
          const conns = s.connections.filter((c) => c.env === e);
          return (
            <Card key={e}>
              <CardHeader title={ENV_LABEL[e]} subtitle={`${conns.length} connections, ${deps.length} deployments`} action={<EnvBadge env={e} />} />
              <div className="divide-y divide-border">
                {deps.length ? deps.map((d) => (
                  <Link key={d.id} href={`/mlops/deployments/${d.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-surface-subtle">
                    <div className="min-w-0"><div className="text-[13px] font-medium truncate">{d.name}</div><div className="text-xs text-text-tertiary">v{d.version}{d.traffic.canary ? `, canary ${d.traffic.canary}%` : ""}</div></div>
                    <HealthBadge h={d.health} />
                  </Link>
                )) : <div className="px-5 py-6 text-sm text-text-secondary">No deployments in this environment.</div>}
              </div>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader title="Recent runs" action={<Link href="/mlops/runs" className="text-xs text-text-secondary hover:text-text-primary inline-flex items-center gap-1">All runs <ArrowRight size={12} /></Link>} />
        <Table>
          <Thead><tr><Th>Pipeline</Th><Th>Environment</Th><Th>Status</Th><Th>Trigger</Th><Th>Started</Th><Th>Duration</Th></tr></Thead>
          <tbody>
            {s.runs.slice(0, 6).map((r) => (
              <Tr key={r.id}>
                <Td><Link href={`/mlops/runs/${r.id}`} className="font-medium hover:underline">{r.pipelineName}</Link> <span className="text-text-tertiary text-xs">{versionLabel(r.pipelineVersion)}</span></Td>
                <Td><EnvBadge env={r.env} /></Td><Td><RunBadge s={r.status} /></Td>
                <Td className="text-text-secondary">{r.trigger}</Td><Td className="text-text-secondary">{relTime(r.startedAt)}</Td><Td className="text-text-secondary tabular-nums">{r.status === "running" ? "in progress" : fmtDuration(r.durationMs)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <div className="grid md:grid-cols-3 gap-4">
        {[
          { href: "/mlops/build-agents", icon: Hammer, title: "Build agents", text: "Run image builds on your own Linux servers or in your cluster through a scoped, outbound-only agent." },
          { href: "/mlops/pipelines", icon: Workflow, title: "Pipelines", text: "Visual builder and guided wizard on one versioned spec, with validation and generated manifests." },
          { href: "/mlops/learn", icon: AlertTriangle, title: "Tutorials", text: "Step by step guides with prerequisites, security notes, verification and cleanup." },
        ].map((c) => (
          <Link key={c.href} href={c.href} className="group bg-surface border border-border rounded-lg shadow-card p-5 hover:border-border-strong transition-colors">
            <c.icon size={18} className="text-text-secondary" strokeWidth={1.75} />
            <div className="mt-3 text-sm font-semibold flex items-center gap-1.5">{c.title}<ArrowRight size={13} className="opacity-0 group-hover:opacity-100 transition-opacity" /></div>
            <p className="text-sm text-text-secondary mt-1">{c.text}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
