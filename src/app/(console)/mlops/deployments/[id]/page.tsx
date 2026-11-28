"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Rocket, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Segmented } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { CodeBlock, Confirm, DemoTag, EnvBadge, GuardButton, HealthBadge, KeyValue, Kpi, MetricChart, Modal, Notice, Tabs, fmtDate, relTime, useRole } from "@/components/mlops/ui";
import { integrationById } from "@/lib/mlops/catalog";
import { makeSeries } from "@/lib/mlops/fixtures";
import { generateManifests } from "@/lib/mlops/manifests";
import { mlops, useMlops, useMlopsStatus } from "@/lib/mlops/store";
import { toast } from "@/lib/mlops/toast";
import { toYaml, type PipelineSpec } from "@/lib/mlops/spec";
import { AiCanvas } from "@/components/mlops/AiCanvas";
import { buildCanvas, focusCanvas } from "@/lib/mlops/ai-canvas";
import { useMcpServers } from "@/lib/mlops/mcp-servers";
import { useMcpGrants } from "@/lib/mlops/mcp-access-store";
import { useProviders } from "@/lib/gateway/useProviders";

type Tab = "overview" | "metrics" | "logs" | "events" | "config";

export default function DeploymentDetail() {
  const { id } = useParams<{ id: string }>();
  const s = useMlops()!;
  const live = useMlopsStatus().mode === "live";
  const role = useRole();
  const d = s.deployments.find((x) => x.id === id);
  const servers = useMcpServers(); const grants = useMcpGrants(); const { all: providers } = useProviders();
  const path = useMemo(() => { if (!d || !servers || !grants) return null; const ctx = { servers, providers }; const all = buildCanvas({ deployments: s.deployments, providers, servers, grants }); return all.nodes.some((n) => n.id === `d:${d.id}`) ? { canvas: focusCanvas(all, `d:${d.id}`, ctx), ctx } : null; }, [d, s.deployments, servers, grants, providers]);
  const [tab, setTab] = useState<Tab>("overview");
  const [scale, setScale] = useState(false);
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [traffic, setTraffic] = useState(false);
  const [pct, setPct] = useState("");
  const [confirm, setConfirm] = useState<null | "promote" | "rollback" | "abort">(null);
  const [level, setLevel] = useState<"all" | "warn" | "error">("all");

  const data = useMemo(() => {
    if (!d) return [];
    const n = 36;
    const lat = makeSeries(d.id + "lat", n, d.health === "failed" ? 0 : 118, 26, 0, d.health === "attention" ? 28 : undefined);
    const rps = makeSeries(d.id + "rps", n, d.env === "production" ? 420 : 38, d.env === "production" ? 70 : 9);
    const err = makeSeries(d.id + "err", n, d.health === "failed" ? 100 : 0.25, d.health === "healthy" ? 0.3 : 1.4, 0, d.health === "progressing" ? 22 : undefined);
    return Array.from({ length: n }, (_, i) => ({ t: new Date(Date.now() - (n - i) * 5 * 60000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), p95: lat[i], p50: Math.round(lat[i] * 0.55), rps: rps[i], errors: err[i] }));
  }, [d]);

  if (!d) return <Card><EmptyState icon={Rocket} title="Deployment not found" description="It may have been removed, or the link is wrong." action={<Link href="/mlops/deployments"><Button>Back to deployments</Button></Link>} /></Card>;

  const conn = s.connections.find((c) => c.id === d.connectionId);
  const pl = s.pipelines.find((p) => p.id === d.pipelineId);
  const spec: PipelineSpec | undefined = pl?.versions[0]?.spec;
  const manifests = spec ? generateManifests(spec, s.connections).filter((m) => m.language === "yaml" && m.nodeId) : [];
  const events = s.audit.filter((e) => e.resource === d.name).slice(0, 12);
  const logs = [
    { t: 0, level: "info", msg: `Readiness probe succeeded for ${d.replicas.ready} of ${d.replicas.desired} replicas` },
    { t: 2, level: "info", msg: `GET ${new URL(d.endpoint, "http://x").pathname}/healthz 200 2ms` },
    { t: 5, level: "info", msg: `predict ok model=${d.modelId} version=${d.version} latency_ms=${data[data.length - 1]?.p50 ?? 0}` },
    ...(d.health === "attention" ? [{ t: 9, level: "warn", msg: d.healthDetail }] : []),
    ...(d.health === "failed" ? [{ t: 7, level: "error", msg: d.healthDetail }, { t: 12, level: "error", msg: "Back-off pulling image. Next retry in 300s" }] : []),
    ...(d.traffic.canary ? [{ t: 4, level: "info", msg: `Canary v${d.traffic.canaryVersion} receiving ${d.traffic.canary}% of traffic` }] : []),
  ].sort((a, b) => a.t - b.t).map((l) => ({ ...l, ts: new Date(Date.now() - (60 - l.t * 4) * 1000).toISOString() }));
  const vis = logs.filter((l) => level === "all" || (level === "warn" ? l.level !== "info" : l.level === "error"));
  const costMonthly = Math.round(d.replicas.min * (Number(d.resources.cpu) * 0.035 + (parseFloat(d.resources.memory) || 1) * 0.005 + Number(d.resources.gpu) * 0.9) * 730);

  return (
    <div className="space-y-5">
      <Link href="/mlops/deployments" className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary"><ArrowLeft size={13} /> Deployments</Link>
      <PageHeader title={d.name} description={d.healthDetail}
        action={
          <div className="flex flex-wrap gap-2 justify-end">
            <GuardButton action="deployment.scale" env={d.env} role={role} onClick={() => { setMin(String(live ? d.replicas.desired : d.replicas.min)); setMax(String(d.replicas.max)); setScale(true); }}>Scale</GuardButton>
            <GuardButton action="deployment.promote" env={d.env} role={role} extraDisabled={d.traffic.canaryVersion ? undefined : "No rollout in progress"} onClick={() => { setPct(String(d.traffic.canary)); setTraffic(true); }}>Set traffic</GuardButton>
            <GuardButton action="deployment.promote" env={d.env} role={role} variant="primary" extraDisabled={d.traffic.canaryVersion ? undefined : "No canary to promote"} onClick={() => setConfirm("promote")}><Rocket size={14} /> Promote canary</GuardButton>
            <GuardButton action="deployment.rollback" env={d.env} role={role} extraDisabled={d.traffic.canaryVersion ? undefined : d.rollbackAvailable ? undefined : "No previous version"} onClick={() => setConfirm(d.traffic.canaryVersion ? "abort" : "rollback")}><Undo2 size={14} /> {d.traffic.canaryVersion ? "Abort canary" : "Roll back"}</GuardButton>
          </div>
        } />
      <div className="flex flex-wrap items-center gap-2 -mt-3"><EnvBadge env={d.env} /><HealthBadge h={d.health} /><DemoTag /></div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Serving version" value={`v${d.version}`} sub={d.previousVersion ? `previous v${d.previousVersion}` : "no previous version"} />
        <Kpi label="Replicas ready" value={`${d.replicas.ready}/${d.replicas.desired}`} sub={`autoscale ${d.replicas.min} to ${d.replicas.max}`} tone={d.replicas.ready < d.replicas.desired ? "warn" : undefined} />
        <Kpi label="Traffic" value={d.traffic.canary ? `${d.traffic.stable} / ${d.traffic.canary}` : "100"} sub={d.traffic.canary ? `stable v${d.version} / canary v${d.traffic.canaryVersion}` : "all to stable"} />
        <Kpi label="Cost estimate" value={`$${costMonthly.toLocaleString("en-US")}`} sub="per month at minimum replicas. Estimate, not billed data." />
      </div>

      <Tabs value={tab} onChange={setTab} label="Deployment sections" tabs={[{ id: "overview", label: "Overview" }, { id: "metrics", label: "Metrics" }, { id: "logs", label: "Logs" }, { id: "events", label: "Events", count: events.length }, { id: "config", label: "Configuration" }]} />

      {tab === "overview" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card><CardHeader title="Rollout" subtitle={`${d.rollout.strategy}, ${d.rollout.state}${d.rollout.startedAt ? `, started ${relTime(d.rollout.startedAt)}` : ""}`} />
            <CardBody className="space-y-4">
              <div>
                <div className="flex h-3 rounded overflow-hidden bg-surface-muted" role="img" aria-label={`Traffic: ${d.traffic.stable} percent stable, ${d.traffic.canary} percent canary`}>
                  <div className="bg-emph" style={{ width: `${d.traffic.stable}%` }} />
                  {d.traffic.canary > 0 && <div className="bg-accent-600 border-l-2 border-white" style={{ width: `${d.traffic.canary}%` }} />}
                </div>
                <div className="flex justify-between text-xs text-text-secondary mt-1.5"><span>Stable v{d.version}: {d.traffic.stable}%</span>{d.traffic.canary > 0 && <span>Canary v{d.traffic.canaryVersion}: {d.traffic.canary}%</span>}</div>
              </div>
              {d.rollout.state === "in-progress" && <Notice tone="info" title="Observing">Verification compares the canary's observed p95 latency and error rate with limits before promotion. Promotion is a deliberate action here.</Notice>}
              {d.rollout.state === "failed" && <Notice tone="bad" title="Rollout failed">{d.healthDetail}</Notice>}
            </CardBody></Card>
          <Card><CardHeader title="Target and resources" />
            <CardBody><KeyValue rows={[["Endpoint", <span className="font-code text-xs break-all">{d.endpoint}</span>], ["Runtime", d.runtime], ...(d.accelerator ? [["Accelerator", `${d.accelerator.count} x ${d.accelerator.gpu} per replica, CUDA ${d.accelerator.cuda}${d.accelerator.driver ? ` on driver ${d.accelerator.driver}` : ""}`] as [string, React.ReactNode]] : []), ...(d.exposure?.providerId ? [["Gateway provider", <Link key="p" href={`/providers/${d.exposure.providerId}`} className="hover:underline">Registered, open provider</Link>] as [string, React.ReactNode]] : []), ...(d.exposure?.mcpServerId ? [["MCP tool", <Link key="m" href={`/mlops/mcp-servers/${d.exposure.mcpServerId}/access`} className="hover:underline"><span className="font-code text-xs">{d.exposure.mcpTool}</span>, manage who can use it</Link>] as [string, React.ReactNode]] : []), ["Target", conn ? <span>{conn.name} <span className="text-text-tertiary">({integrationById(conn.integrationId)?.name})</span></span> : "n/a"], ["CPU / memory", `${d.resources.cpu} / ${d.resources.memory}`], ["GPU", d.resources.gpu === "0" ? "none" : `${d.resources.gpu} per replica (requested, drivers managed by you)`], ["Pipeline", pl ? <Link href={`/mlops/pipelines/${pl.id}`} className="hover:underline">{pl.name}</Link> : "none"], ["Created", fmtDate(d.createdAt)], ["Updated", relTime(d.updatedAt)]]} /></CardBody></Card>
          <Card className="lg:col-span-2"><CardHeader title="Where this model is exposed" subtitle="From the model to the gateway, the MCP servers that call it and who may call them." action={<Link href="/mlops/canvas" className="text-sm underline text-text-secondary hover:text-text-primary">Open the AI canvas</Link>} />
            <CardBody>{path ? <AiCanvas canvas={path.canvas} servers={path.ctx.servers} providers={path.ctx.providers} /> : <p className="text-sm text-text-secondary">This model is not in the gateway, so nothing reaches it through the one endpoint and no MCP tool calls it. Add it from the <Link className="underline" href="/mlops/canvas">AI canvas</Link>.</p>}</CardBody></Card>
        </div>
      )}

      {tab === "metrics" && !live && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card><CardHeader title="Latency (ms)" subtitle="Last 3 hours, 5 minute resolution. Demo data." /><CardBody><MetricChart data={data} series={[{ key: "p95", name: "p95" }, { key: "p50", name: "p50" }]} unit="" /></CardBody></Card>
          <Card><CardHeader title="Requests per second" subtitle="Sample data" /><CardBody><MetricChart data={data} series={[{ key: "rps", name: "Requests/s" }]} area /></CardBody></Card>
          <Card><CardHeader title="Error rate (%)" subtitle="Sample data" /><CardBody><MetricChart data={data} series={[{ key: "errors", name: "Errors %" }]} unit="%" /></CardBody></Card>
          <Card><CardHeader title="Capacity" subtitle="Saturation is a property of the target" /><CardBody className="space-y-3 text-[13px]">
            {[["CPU", d.health === "attention" ? 86 : 54], ["Memory", 61], ["GPU", d.resources.gpu === "0" ? 0 : 72]].filter(([k, v]) => !(k === "GPU" && v === 0)).map(([k, v]) => (
              <div key={String(k)}><div className="flex justify-between mb-1"><span>{k}</span><span className="tabular-nums text-text-secondary">{v}%</span></div><div className="h-2 rounded bg-surface-muted overflow-hidden"><div className={Number(v) > 80 ? "bg-status-degraded h-full" : "bg-note h-full"} style={{ width: `${v}%` }} /></div></div>
            ))}</CardBody></Card>
        </div>
      )}

      {tab === "logs" && !live && (
        <Card><CardHeader title="Logs" subtitle="Sample data. Real logs are read from the target and redacted." action={<Segmented value={level} onChange={setLevel} options={[{ value: "all", label: "All" }, { value: "warn", label: "Warnings" }, { value: "error", label: "Errors" }]} />} />
          <div className="p-3 bg-ink-800 rounded-b-lg font-code text-[12px] leading-relaxed overflow-x-auto">
            {vis.length ? vis.map((l, i) => (<div key={i} className="flex gap-3 whitespace-pre"><span className="text-text-tertiary">{new Date(l.ts).toLocaleTimeString("en-GB")}</span><span className={l.level === "error" ? "text-[#FF8A8A]" : l.level === "warn" ? "text-[#F3C16B]" : "text-[#9FB6B2]"}>{l.level.toUpperCase().padEnd(5)}</span><span className="text-[#D8E4E2]">{l.msg}</span></div>)) : <span className="text-text-tertiary">No lines at this level.</span>}
          </div></Card>
      )}

      {(tab === "metrics" || tab === "logs") && live && (
        <Notice title={tab === "metrics" ? "No metrics source connected" : "No log source connected"}>{tab === "metrics" ? "Latency, throughput, error rate and saturation appear once a metrics connection reports in for this target." : "Logs are read from the target and redacted once a log connection is added."} Add one under Integrations.</Notice>
      )}

      {tab === "events" && (
        <Card><CardHeader title="Events and audit" />
          {events.length === 0 ? <CardBody><p className="text-sm text-text-secondary">No recorded changes for this deployment yet. Promote, scale or roll back to see entries.</p></CardBody> : (
            <ul className="divide-y divide-border">{events.map((e) => (<li key={e.id} className="px-5 py-3 text-[13px] flex items-start gap-3"><Badge>{e.action}</Badge><div className="min-w-0 flex-1"><div>{e.detail}</div><div className="text-xs text-text-tertiary">{e.actor}</div></div><span className="text-xs text-text-tertiary shrink-0">{relTime(e.at)}</span></li>))}</ul>
          )}</Card>
      )}

      {tab === "config" && (
        <div className="space-y-4">
          <Notice tone="info">The configuration below is generated from the pipeline spec and the connection. Secrets appear only as references.</Notice>
          {manifests.length ? manifests.map((m) => <CodeBlock key={m.id} title={m.title} language="yaml" code={m.content} />) : <CodeBlock title="Deployment record" language="yaml" code={toYaml({ name: d.name, model: d.modelId, version: d.version, environment: d.env, replicas: d.replicas, resources: d.resources, traffic: d.traffic, runtime: d.runtime })} />}
        </div>
      )}

      <Modal open={scale} onClose={() => setScale(false)} title="Scale deployment"
        footer={<><Button onClick={() => setScale(false)}>Cancel</Button><Button variant="primary" onClick={async () => { const r = await (live ? mlops.scaleDeployment(d.id, Number(min), Number(min)) : mlops.scaleDeployment(d.id, Number(min), Number(max))); r.ok ? (toast(live ? "Replica count updated" : "Autoscaling range updated"), setScale(false)) : toast(r.error, "error"); }}>Apply</Button></>}>
        {live ? <Field label="Replicas" hint="The number of copies the target keeps running."><Input type="number" min={0} value={min} onChange={(e) => setMin(e.target.value)} /></Field> : <div className="grid grid-cols-2 gap-4"><Field label="Min replicas"><Input type="number" min={0} value={min} onChange={(e) => setMin(e.target.value)} /></Field><Field label="Max replicas" hint="Above 20 needs an approved quota."><Input type="number" min={1} value={max} onChange={(e) => setMax(e.target.value)} /></Field></div>}
        {d.resources.gpu !== "0" && <div className="mt-3"><Notice tone="warn">Each replica requests {d.resources.gpu} GPU. Scheduling depends on GPU capacity in the target.</Notice></div>}
      </Modal>
      <Modal open={traffic} onClose={() => setTraffic(false)} title="Set canary traffic"
        footer={<><Button onClick={() => setTraffic(false)}>Cancel</Button><Button variant="primary" onClick={async () => { const r = await mlops.setCanaryPercent(d.id, Number(pct)); r.ok ? (toast(`Canary traffic set to ${pct}%`), setTraffic(false)) : toast(r.error, "error"); }}>Apply</Button></>}>
        <Field label="Canary share (%)"><Input type="number" min={0} max={100} value={pct} onChange={(e) => setPct(e.target.value)} /></Field>
      </Modal>
      <Confirm open={confirm === "promote"} onClose={() => setConfirm(null)} title="Promote canary to 100%" confirmLabel="Promote" phrase={d.env === "production" ? d.name : undefined}
        body={<p>Version {d.traffic.canaryVersion} will receive all traffic. The current version v{d.version} stays available for rollback.</p>} onConfirm={async () => { const r = await mlops.promoteCanary(d.id); r.ok ? toast("Canary promoted") : toast(r.error, "error"); }} />
      <Confirm open={confirm === "abort"} onClose={() => setConfirm(null)} danger title="Abort canary" confirmLabel="Abort" body={<p>Traffic returns to v{d.version}. The canary revision is kept for inspection.</p>} onConfirm={async () => { const r = await mlops.abortCanary(d.id); r.ok ? toast("Canary aborted") : toast(r.error, "error"); }} />
      <Confirm open={confirm === "rollback"} onClose={() => setConfirm(null)} danger title="Roll back" confirmLabel="Roll back" phrase={d.env === "production" ? d.name : undefined}
        body={<p>Serve v{d.previousVersion} again. Roll forward remains available. This is recorded in the audit log.</p>} onConfirm={async () => { const r = await mlops.rollbackDeployment(d.id); r.ok ? toast(`Rolled back to v${d.previousVersion}`) : toast(r.error, "error"); }} />
    </div>
  );
}
