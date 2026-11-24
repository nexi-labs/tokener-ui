"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Segmented } from "@/components/ui/Form";
import { DemoTag, EnvBadge, GuardButton, HealthBadge, Kpi, Loading, MetricChart, Notice, relTime, useRole } from "@/components/mlops/ui";
import { makeSeries } from "@/lib/mlops/fixtures";
import { mlops, useMlops, useMlopsStatus } from "@/lib/mlops/store";
import { toast } from "@/lib/mlops/toast";
import { ENVS, ENV_LABEL, type Env } from "@/lib/mlops/types";

const SEV_TONE = { critical: "down", warning: "degraded", info: "info" } as const;

/** Rough list-price style estimate. Placeholder rates, not billing data. */
const monthlyEstimate = (cpu: string, mem: string, gpu: string, replicas: number) =>
  Math.round(replicas * (Number(cpu) * 0.035 + (parseFloat(mem) || 1) * 0.005 + Number(gpu) * 0.9) * 730);

export default function ObservabilityPage() {
  const s = useMlops();
  const live = useMlopsStatus().mode === "live";
  const role = useRole();
  const [env, setEnv] = useState<Env | "all">("all");
  const data = useMemo(() => {
    const n = 36;
    const gpu = makeSeries("gpu-util", n, 58, 9, 0.4, 28);
    const mem = makeSeries("gpu-mem", n, 64, 4, 0.2);
    const q = makeSeries("queue", n, 6, 3, 0, 24);
    return Array.from({ length: n }, (_, i) => ({ t: `${String(Math.floor((i * 5) / 60)).padStart(2, "0")}:${String((i * 5) % 60).padStart(2, "0")}`, gpu: Math.round(gpu[i]), mem: Math.round(mem[i]), queue: Math.max(0, Math.round(q[i])) }));
  }, []);
  if (!s) return <Loading />;

  const deps = s.deployments.filter((d) => env === "all" || d.env === env);
  const alerts = s.alerts.filter((a) => env === "all" || !a.resource.includes("/") || deps.some((d) => a.resource.includes(d.name)) || a.resource.includes(env));
  const gpus = deps.reduce((n, d) => n + Number(d.resources.gpu) * d.replicas.desired, 0);
  const gpusMax = deps.reduce((n, d) => n + Number(d.resources.gpu) * d.replicas.max, 0);
  const firing = s.alerts.filter((a) => a.state === "firing").length;
  const cost = deps.reduce((n, d) => n + monthlyEstimate(d.resources.cpu, d.resources.memory, d.resources.gpu, d.replicas.desired), 0);
  const atMax = deps.filter((d) => d.replicas.desired >= d.replicas.max);

  return (
    <div className="space-y-5">
      <PageHeader title="Observability and capacity" description="Saturation, GPU use, queue depth, alerts and cost estimates across deployments. Metrics here are seeded demo data until a metrics connection is attached."
        action={<Segmented value={env} onChange={setEnv} options={[{ value: "all", label: "All" }, ...ENVS.map((e) => ({ value: e, label: ENV_LABEL[e] }))]} />} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="GPUs in use" value={gpus} sub={`up to ${gpusMax} at max scale`} />
        <Kpi label="At max replicas" value={atMax.length} sub={atMax.length ? atMax.map((d) => d.name).join(", ") : "no saturation"} tone={atMax.length ? "warn" : undefined} />
        <Kpi label="Firing alerts" value={firing} sub="across all environments" tone={firing ? "bad" : undefined} />
        <Kpi label="Monthly cost estimate" value={`$${cost.toLocaleString("en-US")}`} sub="Estimate from placeholder rates. Not billed data." />
      </div>

      {live ? (
        <Notice title="No metrics source connected">GPU, memory and queue charts appear once a metrics connection reports in. Add one under <Link href="/mlops/integrations" className="underline underline-offset-2">Integrations</Link>. Replica counts, alerts and cost estimates above and below come from your deployments.</Notice>
      ) : (
      <div className="grid lg:grid-cols-3 gap-4">
        <Card><CardHeader title="GPU utilisation (%)" subtitle="Last 3 hours. Sample data." /><CardBody><MetricChart data={data} series={[{ key: "gpu", name: "Utilisation" }]} unit="%" yMax={100} area /></CardBody></Card>
        <Card><CardHeader title="GPU memory (%)" subtitle="Last 3 hours. Sample data." /><CardBody><MetricChart data={data} series={[{ key: "mem", name: "Memory" }]} unit="%" yMax={100} /></CardBody></Card>
        <Card><CardHeader title="Request queue depth" subtitle="Last 3 hours. Sample data." /><CardBody><MetricChart data={data} series={[{ key: "queue", name: "Queued" }]} area /></CardBody></Card>
      </div>
      )}

      <Card>
        <CardHeader title="Capacity by deployment" subtitle="Replicas against autoscaling limits, with a monthly cost estimate at current desired replicas" />
        <CardBody>
          <Table>
            <Thead><tr><Th>Deployment</Th><Th>Environment</Th><Th>Health</Th><Th>Replicas</Th><Th>Headroom</Th><Th>GPU</Th><Th>Estimate / month</Th></tr></Thead>
            <tbody>
              {deps.map((d) => {
                const head = d.replicas.max - d.replicas.desired;
                return (
                  <Tr key={d.id}>
                    <Td><Link href={`/mlops/deployments/${d.id}`} className="font-medium hover:underline">{d.name}</Link> {d.demo && <DemoTag />}</Td>
                    <Td><EnvBadge env={d.env} /></Td>
                    <Td><HealthBadge h={d.health} /></Td>
                    <Td className="tabular-nums">{d.replicas.ready}/{d.replicas.desired} <span className="text-text-tertiary">(max {d.replicas.max})</span></Td>
                    <Td><div className="flex items-center gap-2"><div className="h-1.5 w-20 rounded-full bg-surface-muted overflow-hidden" aria-hidden><div className={`h-full ${head === 0 ? "bg-status-degraded" : "bg-note"}`} style={{ width: `${Math.min(100, (d.replicas.desired / d.replicas.max) * 100)}%` }} /></div><span className="text-xs text-text-secondary">{head === 0 ? "none" : `${head} more`}</span></div></Td>
                    <Td className="tabular-nums">{d.resources.gpu}</Td>
                    <Td className="tabular-nums">${monthlyEstimate(d.resources.cpu, d.resources.memory, d.resources.gpu, d.replicas.desired).toLocaleString("en-US")}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Alerts" subtitle="Acknowledging records who and when in the audit log" />
        <CardBody>
          {alerts.length === 0 ? <p className="text-sm text-text-secondary px-1 py-2">No alerts for this selection.</p> : (
            <ul className="divide-y divide-border">
              {alerts.map((a) => (
                <li key={a.id} className="py-3 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><Badge tone={SEV_TONE[a.severity]}>{a.severity}</Badge><span className="text-sm font-medium">{a.title}</span><Badge tone={a.state === "firing" ? "down" : "neutral"}>{a.state}</Badge><DemoTag /></div>
                    <p className="text-[13px] text-text-secondary mt-1">{a.detail}</p>
                    <div className="text-xs text-text-tertiary mt-0.5">{a.resource}, since {relTime(a.since)}</div>
                  </div>
                  {a.state === "firing"
                    ? <GuardButton action="alert.acknowledge" role={role} onClick={async () => { const r = await mlops.acknowledgeAlert(a.id); r.ok ? toast("Alert acknowledged") : toast(r.error, "error"); }}>Acknowledge</GuardButton>
                    : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Notice tone="info" title="Metrics sources">
        Production metrics will come from a Prometheus or OpenTelemetry connection and from inference endpoints. Until one is connected here, charts show sample data. Cost figures are estimates from placeholder rates and are never presented as billing data. <Link href="/mlops/integrations" className="underline">Add a metrics connection</Link>.
      </Notice>
    </div>
  );
}
