"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { History, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select, Toggle } from "@/components/ui/Form";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { CodeBlock, Confirm, GuardButton, KeyValue, Kpi, MetricChart, Modal, Notice, useRole } from "@/components/mlops/ui";
import { toast } from "@/lib/mlops/toast";
import { can as canDo } from "@/lib/mlops/rbac";
import { Concept, ExecBadge, ModelChip, TRIGGER_LABEL, TriggerChip, ago, fmtMs, pct, when } from "@/components/functions/ui";
import { buckets, execStats } from "@/lib/functions/select";
import { invokeUrl } from "@/lib/functions/ledger";
import { KAFKA_CLUSTERS, TIMEZONES } from "@/lib/functions/catalog";
import { addTrigger, removeTrigger, rollbackTo, setTriggerEnabled, settleDeployment, transitionFunction, updateConfiguration } from "@/lib/functions/store";
import { FN_TRANSITIONS, RUNTIMES, num, usd, type FnExecution, type FnFunction, type FnTrigger, type FunctionsState, type TriggerKind } from "@/lib/functions/types";

type P = { s: FunctionsState; f: FnFunction };

const toastResult = (r: { ok: boolean; error?: string }, okText: string) => (r.ok ? toast(okText, "info") : toast((r as { error: string }).error, "error"));

// ------------------------------------------------------------------------------------------------ overview

export function OverviewTab({ s, f, execs }: P & { execs: FnExecution[] }) {
  const app = s.apps.find((a) => a.id === f.appId); const tenant = s.tenants.find((t) => t.id === f.tenantId);
  const day = new Date(s.anchor).getTime() - 86_400_000;
  const d = execStats(execs.filter((e) => new Date(e.startedAt).getTime() >= day));
  const cost = execs.filter((e) => new Date(e.startedAt).getTime() >= day).reduce((a, e) => a + e.costMicros, 0);
  const series = useMemo(() => buckets(s.anchor, "7d").map((b) => {
    const x = execs.filter((e) => { const t = new Date(e.startedAt).getTime(); return t >= b.start && t < b.end; });
    return { t: b.label, succeeded: x.filter((e) => e.status === "succeeded").length, notSucceeded: x.filter((e) => e.status !== "succeeded").length };
  }), [s.anchor, execs]);
  const triggers = s.triggers.filter((t) => t.fnId === f.id);
  const wfs = s.workflows.filter((w) => w.steps.some((x) => x.kind === "function" && x.config.function === f.name));
  const [confirm, setConfirm] = useState<null | "disable" | "deploy">(null);
  const can = FN_TRANSITIONS[f.status]; const role = useRole();
  return (
    <div className="space-y-4">
      {f.statusReason && <Notice tone={f.status === "failed" ? "bad" : "info"} title={f.status === "failed" ? "Deployment failed" : "Status note"}>{f.statusReason}</Notice>}
      {f.status === "deploying" && (
        <Notice tone="info" title="Deployment in progress (simulated)">
          This design preview does not run a build. Choose an outcome to see how each result looks.
          <div className="flex gap-2 mt-2"><Button onClick={() => toastResult(settleDeployment(f.id, "active"), "Marked active in the preview. Nothing was deployed.")}>Show as active</Button><Button onClick={() => toastResult(settleDeployment(f.id, "failed"), "Marked failed in the preview.")}>Show as failed</Button></div>
        </Notice>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Calls, last 24 hours" value={num(d.total)} sub={`${num(execs.length)} in 7 days`} />
        <Kpi label="Success rate" value={pct(d.ok, d.total)} sub={`${d.failed} failed, ${d.blocked} blocked`} tone={d.total && d.ok / d.total < 0.95 ? "warn" : undefined} />
        <Kpi label="p95 latency" value={fmtMs(d.p95)} sub={`limit ${f.governance.timeoutS} s`} />
        <Kpi label="AI cost, 24 hours" value={usd(cost)} sub={`ceiling ${usd(f.governance.maxCostMicros)} per call`} />
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader title="Invocations, 7 days" subtitle="Per day, UTC" />
          <div className="p-4">{execs.length === 0 ? <p className="text-sm text-text-secondary py-10 text-center">This function has no executions yet.</p> : <MetricChart data={series} series={[{ key: "succeeded", name: "Succeeded" }, { key: "notSucceeded", name: "Not succeeded" }]} area height={200} />}</div>
        </Card>
        <Card>
          <CardHeader title="Details" />
          <div className="px-5 py-4">
            <KeyValue rows={[
              ["Owner", `${f.owner}, ${f.team}`], ["App", app?.name], ["Tenant", tenant?.name], ["Environment", f.env], ["Runtime", f.runtime === "aws-lambda" ? "AWS Lambda (connector)" : RUNTIMES.find((r) => r.id === f.runtime)?.label],
              ["Active revision", f.activeRevision ? `r${f.activeRevision}` : "none"], ["Created", when(f.createdAt)], ["Updated", when(f.updatedAt)], ["Tags", f.tags.length ? f.tags.map((t) => <Badge key={t}>{t}</Badge>) : "none"],
            ]} />
          </div>
        </Card>
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader title="Triggers" />
          <ul className="divide-y divide-border">
            {triggers.length === 0 && <li className="px-5 py-4 text-sm text-text-secondary">No trigger is configured. Add one in the Triggers tab.</li>}
            {triggers.map((t) => <li key={t.id} className="px-5 py-3 text-[13px] flex items-center justify-between"><span><TriggerChip kind={t.kind} /><span className="block text-xs text-text-tertiary mt-0.5">{t.name}</span></span><Badge tone={t.enabled ? "healthy" : "neutral"}>{t.enabled ? "On" : "Off"}</Badge></li>)}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Used by workflows" />
          <ul className="divide-y divide-border">
            {wfs.length === 0 && <li className="px-5 py-4 text-sm text-text-secondary">No workflow calls this function.</li>}
            {wfs.map((w) => <li key={w.id} className="px-5 py-3 text-[13px]"><Link href={`/mlops/functions/workflows/${w.id}`} className="font-medium hover:underline">{w.name}</Link><div className="text-xs text-text-tertiary">{w.useCase}</div></li>)}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Lifecycle" subtitle="Draft, Deploying, Active, Failed, Disabled" />
          <div className="px-5 py-4 space-y-2.5">
            <p className="text-[13px] text-text-secondary">This function is <span className="font-medium text-text-primary">{f.status}</span>. From here it can become: {can.join(", ") || "nothing"}.</p>
            <div className="flex flex-wrap gap-2">
              {can.includes("deploying") && <GuardButton action="deployment.promote" env={f.env} role={role} onClick={() => setConfirm("deploy")}>{f.status === "draft" ? "Deploy" : f.status === "failed" ? "Retry deployment" : f.status === "disabled" ? "Enable and deploy" : "Redeploy latest"}</GuardButton>}
              {can.includes("disabled") && <GuardButton action="deployment.scale" env={f.env} role={role} onClick={() => setConfirm("disable")}>Disable</GuardButton>}
            </div>
            <p className="text-xs text-text-tertiary">A disabled function rejects every trigger and keeps its revisions.</p>
          </div>
        </Card>
      </div>
      <Confirm open={confirm === "disable"} onClose={() => setConfirm(null)} title={`Disable ${f.name}?`} confirmLabel="Disable" danger phrase={f.env === "production" ? f.name : undefined}
        body={<p>Triggers stop firing and HTTP calls return 503 until the function is enabled again. Running invocations finish. This is a simulated change in the design preview.</p>}
        onConfirm={() => toastResult(transitionFunction(f.id, "disabled"), `${f.name} disabled in the preview.`)} />
      <Confirm open={confirm === "deploy"} onClose={() => setConfirm(null)} title={`Deploy r${f.latestRevision} of ${f.name}?`} confirmLabel="Start simulated deployment"
        body={<p>The preview records a deployment to staging with the status Deploying. No build runs and nothing is deployed.</p>}
        onConfirm={() => toastResult(transitionFunction(f.id, "deploying"), "Deployment recorded as simulated.")} />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ configuration

export function ConfigurationTab({ s, f }: P) {
  const role = useRole();
  const [handler, setHandler] = useState(f.handler); const [mem, setMem] = useState(String(f.memoryMb)); const [eph, setEph] = useState(String(f.ephemeralMb));
  const [desc, setDesc] = useState(f.description); const [tags, setTags] = useState(f.tags.join(", ")); const [err, setErr] = useState<string | null>(null);
  const rt = RUNTIMES.find((r) => r.id === f.runtime);
  const dirty = handler !== f.handler || +mem !== f.memoryMb || +eph !== f.ephemeralMb || desc !== f.description || tags !== f.tags.join(", ");
  const save = () => {
    const r = updateConfiguration(f.id, { handler, memoryMb: +mem, ephemeralMb: +eph, description: desc, tags: tags.split(",").map((x) => x.trim()).filter(Boolean) });
    if (r.ok) { setErr(null); toast(`Saved as revision r${r.revision} (simulated). It is not deployed.`, "info"); } else setErr(r.error);
  };
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2">
        <CardHeader title="Runtime configuration" subtitle="A change creates a new revision. It does not touch what is running." />
        <div className="px-5 py-4 grid sm:grid-cols-2 gap-4">
          <Field label="Description"><Input value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
          <Field label="Tags" hint="Comma separated."><Input value={tags} onChange={(e) => setTags(e.target.value)} /></Field>
          <Field label="Runtime"><Input value={f.runtime === "aws-lambda" ? "AWS Lambda (through a connector)" : rt?.label ?? f.runtime} disabled /></Field>
          <Field label="Handler" hint={rt ? `For example ${rt.handler}` : undefined}><Input value={handler} onChange={(e) => setHandler(e.target.value)} disabled={f.kind === "lambda-proxy"} /></Field>
          <Field label="Memory (MB)" hint="128 to 10240. CPU scales with memory."><Input type="number" min={128} max={10240} step={64} value={mem} onChange={(e) => setMem(e.target.value)} /></Field>
          <Field label="Ephemeral storage (MB)" hint="512 to 10240."><Input type="number" min={512} max={10240} step={256} value={eph} onChange={(e) => setEph(e.target.value)} /></Field>
        </div>
        {err && <div className="px-5 pb-3"><Notice tone="bad">{err}</Notice></div>}
        <div className="px-5 py-3 border-t border-border bg-surface-subtle flex justify-end gap-2 rounded-b-lg">
          <Button disabled={!dirty} onClick={() => { setHandler(f.handler); setMem(String(f.memoryMb)); setEph(String(f.ephemeralMb)); setDesc(f.description); setTags(f.tags.join(", ")); setErr(null); }}>Discard</Button>
          <GuardButton action="pipeline.edit" env={f.env} role={role} variant="primary" extraDisabled={dirty ? undefined : "Nothing has changed"} onClick={save}>Save as new revision</GuardButton>
        </div>
      </Card>
      <div className="space-y-4">
        {f.lambda && (
          <Card>
            <CardHeader title="AWS Lambda connector" subtitle="This function calls a Lambda function through a tok∑ner connection" />
            <div className="px-5 py-4"><KeyValue rows={[["Connection", <Link key="c" href="/mlops/integrations" className="underline">{f.lambda.connectionId}</Link>], ["Function ARN", <span key="a" className="font-code text-xs break-all">{f.lambda.arn}</span>], ["Region", f.lambda.region], ["Qualifier", f.lambda.qualifier], ["Invocation", f.lambda.invocation], ["Credentials", "Assumed role from a secret reference"]]} /></div>
          </Card>
        )}
        <Card>
          <CardHeader title="Environment and secrets" subtitle="Values are never shown. Only references." />
          {f.governance.secretRefs.length === 0 ? <p className="px-5 py-4 text-sm text-text-secondary">This function uses no secrets.</p> : (
            <ul className="divide-y divide-border">{f.governance.secretRefs.map((r) => <li key={r} className="px-5 py-2.5 text-xs font-code break-all">{r}</li>)}</ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Where it runs" />
          <div className="px-5 py-4"><KeyValue rows={[["Environment", f.env], ["Tenant", s.tenants.find((t) => t.id === f.tenantId)?.name], ["Region", s.tenants.find((t) => t.id === f.tenantId)?.region], ["Network egress", f.governance.egress === "none" ? "None" : f.governance.egressAllow.join(", ")]]} /></div>
        </Card>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ deployments and versions

export function DeploymentsTab({ s, f }: P) {
  const role = useRole();
  const revs = s.revisions.filter((r) => r.fnId === f.id).sort((a, b) => b.number - a.number);
  const deps = s.deployments.filter((d) => d.fnId === f.id).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  const [rb, setRb] = useState<number | null>(null);
  const tone = (x: string) => (x === "active" || x === "succeeded" ? "healthy" : x === "failed" ? "down" : x === "in-progress" ? "info" : "neutral") as "healthy" | "down" | "info" | "neutral";
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Revisions" subtitle="Each revision is immutable: code, runtime settings and a digest." />
        {revs.length === 0 ? <EmptyState icon={History} title="No revision yet" description="Save the function to create revision 1." /> : (
          <Table>
            <Thead><tr><Th>Revision</Th><Th>Status</Th><Th>Artifact</Th><Th>Digest</Th><Th>Created</Th><Th>Note</Th><Th /></tr></Thead>
            <tbody>
              {revs.map((r) => (
                <Tr key={r.id}>
                  <Td className="font-medium tabular-nums">r{r.number}</Td>
                  <Td><Badge tone={tone(r.status)}>{r.status}</Badge></Td>
                  <Td><div className="text-[13px]">{r.artifact.kind}</div><div className="text-xs text-text-tertiary font-code truncate max-w-[260px]">{r.artifact.ref}</div></Td>
                  <Td className="font-code text-xs text-text-secondary">{r.artifact.digest.slice(0, 19)}...</Td>
                  <Td className="text-text-secondary">{when(r.createdAt)}<div className="text-xs text-text-tertiary">{r.createdBy}</div></Td>
                  <Td className="text-text-secondary">{r.note}</Td>
                  <Td>{f.status === "active" && r.status === "superseded" && <GuardButton action="deployment.rollback" env={f.env} role={role} onClick={() => setRb(r.number)}>Roll back</GuardButton>}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader title="Deployments" subtitle="Staging first, then production, with traffic share." />
        {deps.length === 0 ? <p className="px-5 py-6 text-sm text-text-secondary">Nothing has been deployed.</p> : (
          <Table>
            <Thead><tr><Th>Deployment</Th><Th>Revision</Th><Th>Environment</Th><Th>Status</Th><Th>Traffic</Th><Th>Duration</Th><Th>Started</Th><Th>Note</Th></tr></Thead>
            <tbody>
              {deps.map((d) => (
                <Tr key={d.id}>
                  <Td className="font-code text-xs">{d.id.replace("dep-", "").slice(-14)}</Td><Td className="tabular-nums">r{d.revision}</Td><Td className="text-text-secondary">{d.env}</Td>
                  <Td><Badge tone={tone(d.status)}>{d.status}</Badge></Td><Td className="tabular-nums">{d.traffic}%</Td><Td className="tabular-nums text-text-secondary">{d.durationS ? `${d.durationS} s` : "n/a"}</Td>
                  <Td className="text-text-secondary">{when(d.startedAt)}<div className="text-xs text-text-tertiary">{d.by}</div></Td>
                  <Td className="text-text-secondary max-w-[260px]">{d.error ?? d.note}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Confirm open={rb !== null} onClose={() => setRb(null)} title={`Roll back to r${rb}?`} confirmLabel="Roll back" body={<p>Production traffic moves to r{rb}. This is recorded as a simulated deployment in the design preview.</p>}
        onConfirm={() => rb !== null && toastResult(rollbackTo(f.id, rb), `Rolled back to r${rb} in the preview.`)} />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ invocation endpoint

export function EndpointTab({ s, f }: P) {
  const http = s.triggers.find((t) => t.fnId === f.id && t.kind === "http");
  const url = invokeUrl(f.name);
  const curl = `curl -X POST "${url}" \\
  -H "Authorization: Bearer $TOKENER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: 7f3c9a52-0b1e-4a6e-9d1b-2f4a6c8e0b11" \\
  -H "X-Correlation-Id: pay-2026-10-28-000412" \\
  -d '{"input": {"amount": 4820.00, "currency": "AED", "merchantId": "m_20931"}}'`;
  const resp = `HTTP/1.1 200 OK
X-Correlation-Id: pay-2026-10-28-000412
X-Execution-Id: exe_0001a3f9c2
X-Tokener-Revision: ${f.activeRevision ?? 1}
X-Tokener-Tokens-In: 421
X-Tokener-Tokens-Out: 58
X-Tokener-Cost-Micros: 70

{"output": {"score": 0.91, "reasons": ["new device", "amount above 90-day p95"]}, "executionId": "exe_0001a3f9c2"}`;
  const errors: [string, string, string][] = [
    ["400", "invalid_input", "The body does not match the input schema."], ["401", "unauthenticated", "Missing or invalid credentials."], ["403", "policy_denied", "A policy blocked the call. The response names the policy."],
    ["404", "function_not_found", "No such function, or it is not visible to the caller's tenant."], ["409", "idempotency_conflict", "The key was used with a different body."], ["413", "payload_too_large", `The body is larger than ${http?.http?.maxBodyKb ?? 256} KB.`],
    ["429", "throttled", "Per-minute or concurrency limit reached. Retry-After says when."], ["503", "function_disabled", "The function is disabled or has no active revision."], ["504", "timeout", `The call exceeded ${f.governance.timeoutS} seconds.`],
  ];
  return (
    <div className="space-y-4">
      <Notice tone="info" title="Conceptual endpoint"><span>This is the planned contract (docs/36-functions-api-spec.md). The URL below does not answer yet. <Concept>Conceptual</Concept></span></Notice>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader title="Invoke over HTTPS" subtitle={http ? (http.enabled ? "Trigger is on" : "Trigger is off") : "No HTTP trigger is configured for this function"} />
          <div className="px-5 py-4 space-y-4">
            <div className="flex items-center gap-2 font-code text-[13px]"><Badge tone="info">{http?.http?.method ?? "POST"}</Badge><span className="break-all">{url}</span></div>
            <CodeBlock code={curl} language="bash" title="Request" />
            <CodeBlock code={resp} language="http" title="Response, synchronous" />
          </div>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Contract" />
            <div className="px-5 py-4"><KeyValue rows={[
              ["Authentication", http?.http?.auth === "mtls" ? "Mutual TLS" : http?.http?.auth === "jwt" ? "JWT bearer" : "API key (bearer)"], ["Mode", http?.http?.sync === false ? "Asynchronous, returns 202 and an execution id" : `Synchronous up to ${f.governance.timeoutS} s`],
              ["Idempotency", http?.http?.idempotencyHeader ?? "Idempotency-Key"], ["Correlation", "X-Correlation-Id, generated if absent"], ["Rate limit", `${http?.http?.rateLimitPerMin ?? f.governance.invocationsPerMinute} per minute`],
              ["Max body", `${http?.http?.maxBodyKb ?? 256} KB`], ["Concurrency", `${f.governance.maxConcurrency} at once`],
            ]} /></div>
          </Card>
          <Card>
            <CardHeader title="Attribution headers" subtitle="Returned on every response" />
            <ul className="px-5 py-3 text-[12px] font-code space-y-1 text-text-secondary"><li>X-Execution-Id</li><li>X-Tokener-Revision</li><li>X-Tokener-Tokens-In / Out</li><li>X-Tokener-Cost-Micros</li><li>X-Tokener-Policy-Result</li></ul>
          </Card>
        </div>
      </div>
      <Card>
        <CardHeader title="Errors" subtitle="Problem details (RFC 9457) with a stable code" />
        <Table><Thead><tr><Th>Status</Th><Th>Code</Th><Th>Meaning</Th></tr></Thead>
          <tbody>{errors.map(([a, b, c]) => <Tr key={b}><Td className="tabular-nums">{a}</Td><Td className="font-code text-xs">{b}</Td><Td className="text-text-secondary">{c}</Td></Tr>)}</tbody></Table>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ triggers

export function TriggersTab({ s, f }: P) {
  const role = useRole(); const edit = canDo(role, "pipeline.edit", f.env); const editReason = edit.ok ? undefined : edit.reason;
  const triggers = s.triggers.filter((t) => t.fnId === f.id);
  const [open, setOpen] = useState(false);
  const [rm, setRm] = useState<FnTrigger | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] text-text-secondary max-w-2xl">A function can have any mix of triggers. Every trigger passes the same policy and limits as a direct call. <Concept>HTTP, Kafka and schedule triggers are designs, not running services</Concept></p>
        <GuardButton action="pipeline.edit" env={f.env} role={role} variant="primary" onClick={() => setOpen(true)}>Add trigger</GuardButton>
      </div>
      {triggers.length === 0 ? <Card><EmptyState icon={Zap} title="No trigger yet" description="Add an HTTP endpoint, a Kafka topic or a schedule so something can start this function." action={<GuardButton action="pipeline.edit" env={f.env} role={role} variant="primary" onClick={() => setOpen(true)}>Add trigger</GuardButton>} /></Card> : (
        <div className="grid lg:grid-cols-2 gap-4">
          {triggers.map((t) => (
            <Card key={t.id}>
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
                <div className="min-w-0"><TriggerChip kind={t.kind} /><div className="text-sm font-medium mt-0.5">{t.name}</div></div>
                <div className="flex items-center gap-3"><Toggle checked={t.enabled} onChange={(v) => { if (editReason) { toast(editReason, "info"); return; } setTriggerEnabled(t.id, v); toast(`${t.name} ${v ? "turned on" : "turned off"} (simulated).`, "info"); }} label={`${t.name} enabled`} /></div>
              </div>
              <div className="px-5 py-4">
                {t.http && <KeyValue rows={[["Route", <span key="r" className="font-code text-xs">{t.http.method} {t.http.path}</span>], ["Authentication", t.http.auth], ["Rate limit", `${t.http.rateLimitPerMin} per minute`], ["Idempotency header", t.http.idempotencyHeader], ["Mode", t.http.sync ? "Synchronous" : "Asynchronous"], ["Max body", `${t.http.maxBodyKb} KB`], ["CORS origins", t.http.cors.length ? t.http.cors.join(", ") : "none"]]} />}
                {t.kafka && <KeyValue rows={[["Cluster", t.kafka.cluster], ["Topic", <span key="t" className="font-code text-xs">{t.kafka.topic}</span>], ["Consumer group", <span key="g" className="font-code text-xs">{t.kafka.group}</span>], ["Start at", t.kafka.startOffset], ["Format", t.kafka.format], ["Batch size", t.kafka.batchSize], ["Concurrency", t.kafka.concurrency], ["Dead-letter topic", <span key="d" className="font-code text-xs">{t.kafka.dlqTopic}</span>], ["Lag alert above", `${t.kafka.maxLagAlert} records`]]} />}
                {t.schedule && <KeyValue rows={[["Schedule", `${t.schedule.humanReadable}`], ["Cron", <span key="c" className="font-code text-xs">{t.schedule.cron}</span>], ["Time zone", t.schedule.timezone], ["If still running", t.schedule.overlap], ["Catch up missed", t.schedule.catchUp ? "Yes" : "No"], ["Jitter", `${t.schedule.jitterS} s`], ["Next run", when(t.nextFireAt)]]} />}
                <div className="flex items-center justify-between mt-4 text-xs text-text-tertiary"><span>Last fired {ago(t.lastFiredAt, s.anchor)}</span><button onClick={() => (editReason ? toast(editReason, "info") : setRm(t))} title={editReason} className={editReason ? "text-text-tertiary cursor-not-allowed" : "text-status-down hover:underline"}>Remove</button></div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <AddTrigger open={open} onClose={() => setOpen(false)} f={f} />
      <Confirm open={!!rm} onClose={() => setRm(null)} title="Remove this trigger?" confirmLabel="Remove" danger body={<p>The function stops being started by {rm?.name}. Its executions stay in the history.</p>} onConfirm={() => { if (rm) { removeTrigger(rm.id); toast("Trigger removed (simulated).", "info"); } }} />
    </div>
  );
}

function AddTrigger({ open, onClose, f }: { open: boolean; onClose: () => void; f: FnFunction }) {
  const [kind, setKind] = useState<TriggerKind>("kafka");
  const [path, setPath] = useState(`/v1/functions/${f.name}/invocations`); const [auth, setAuth] = useState<"api-key" | "jwt" | "mtls">("api-key");
  const [cluster, setCluster] = useState(KAFKA_CLUSTERS[0]); const [topic, setTopic] = useState(""); const [group, setGroup] = useState(`tokener-fn-${f.name}`); const [conc, setConc] = useState("5");
  const [cron, setCron] = useState("0 6 * * *"); const [tz, setTz] = useState("UTC"); const [overlap, setOverlap] = useState<"skip" | "queue" | "allow">("skip");
  const [err, setErr] = useState<string | null>(null);
  const submit = () => {
    const base = { fnId: f.id, kind, enabled: true } as const;
    const r = addTrigger(kind === "http"
      ? { ...base, name: "Invoke over HTTPS", http: { method: "POST", path, auth, rateLimitPerMin: 120, idempotencyHeader: "Idempotency-Key", cors: [], maxBodyKb: 256, sync: f.governance.timeoutS <= 30 } }
      : kind === "kafka" ? { ...base, name: `Consume ${topic || "topic"}`, kafka: { cluster, topic, group, startOffset: "latest", batchSize: 1, concurrency: +conc, dlqTopic: `${topic}.dlq`, maxLagAlert: 500, format: "json" } }
        : { ...base, name: `Schedule ${cron}`, schedule: { cron, timezone: tz, overlap, catchUp: false, jitterS: 30, humanReadable: cron } });
    if (r.ok) { setErr(null); toast("Trigger added (simulated).", "info"); onClose(); } else setErr(r.error);
  };
  return (
    <Modal open={open} onClose={onClose} title="Add trigger" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Add trigger</Button></>}>
      <div className="space-y-4">
        <Field label="Type"><Select value={kind} onChange={(e) => { setKind(e.target.value as TriggerKind); setErr(null); }}>{(Object.keys(TRIGGER_LABEL) as TriggerKind[]).map((k) => <option key={k} value={k}>{TRIGGER_LABEL[k]}</option>)}</Select></Field>
        {kind === "http" && (<><Field label="Path"><Input value={path} onChange={(e) => setPath(e.target.value)} /></Field><Field label="Authentication"><Select value={auth} onChange={(e) => setAuth(e.target.value as typeof auth)}><option value="api-key">API key</option><option value="jwt">JWT bearer</option><option value="mtls">Mutual TLS</option></Select></Field></>)}
        {kind === "kafka" && (<><Field label="Cluster"><Select value={cluster} onChange={(e) => setCluster(e.target.value)}>{KAFKA_CLUSTERS.map((c) => <option key={c}>{c}</option>)}</Select></Field><Field label="Topic"><Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="payments.authorised" /></Field><Field label="Consumer group"><Input value={group} onChange={(e) => setGroup(e.target.value)} /></Field><Field label="Concurrency" hint={`Up to ${f.governance.maxConcurrency}, the function limit.`}><Input type="number" min={1} value={conc} onChange={(e) => setConc(e.target.value)} /></Field></>)}
        {kind === "schedule" && (<><Field label="Cron expression" hint="Five fields: minute hour day month weekday."><Input value={cron} onChange={(e) => setCron(e.target.value)} className="font-code" /></Field><Field label="Time zone"><Select value={tz} onChange={(e) => setTz(e.target.value)}>{TIMEZONES.map((z) => <option key={z}>{z}</option>)}</Select></Field><Field label="If the last run is still going"><Select value={overlap} onChange={(e) => setOverlap(e.target.value as typeof overlap)}><option value="skip">Skip this run</option><option value="queue">Queue it</option><option value="allow">Run both</option></Select></Field></>)}
        {err && <Notice tone="bad">{err}</Notice>}
      </div>
    </Modal>
  );
}

export { ExecBadge, ModelChip };
export const usdFmt = usd;
