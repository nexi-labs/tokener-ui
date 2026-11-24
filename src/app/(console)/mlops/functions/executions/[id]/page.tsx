"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { ArrowLeft, SearchX } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { CodeBlock, KeyValue, Notice } from "@/components/mlops/ui";
import { FnIcon } from "@/components/functions/FnIcon";
import { ExecBadge, ModelChip, ProviderChip, STEP_ICON, TriggerChip, fmtMs, useFx, when } from "@/components/functions/ui";
import { executionDetail } from "@/lib/functions/ledger";
import { num, usd, type ExecStep } from "@/lib/functions/types";

const STEP_TONE: Record<ExecStep["status"], string> = { succeeded: "bg-accent-600", failed: "bg-status-down", blocked: "bg-status-degraded", skipped: "bg-border-strong", waiting: "bg-status-info", running: "bg-status-info" };

export default function ExecutionDetail() {
  const { id } = useParams<{ id: string }>();
  const s = useFx();
  const e = s.executions.find((x) => x.id === id);
  const d = useMemo(() => (e ? executionDetail(e, s) : null), [e, s]);
  if (!e || !d) return <Card><EmptyState icon={SearchX} title="Execution not found" description="It may be older than the retention window, or belong to another tenant." action={<Link href="/mlops/functions/executions" className="text-sm text-accent-700 underline">Back to executions</Link>} /></Card>;
  const f = s.functions.find((x) => x.id === e.fnId); const run = s.runs.find((r) => r.id === e.workflowRunId);
  const related = s.executions.filter((x) => x.correlationId === e.correlationId && x.id !== e.id);
  const total = Math.max(e.durationMs, ...d.steps.map((x) => x.startMs + x.durationMs), 1);
  const policy = s.policies.find((p) => p.id === e.policy.policyId);
  const level = { debug: "text-text-tertiary", info: "text-text-secondary", warn: "text-[#9A5F05]", error: "text-status-down" } as const;
  return (
    <div className="space-y-5">
      <div>
        <Link href="/mlops/functions/executions" className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary mb-3"><ArrowLeft size={13} /> Executions</Link>
        <div className="flex flex-wrap items-center gap-2.5"><h1 className="text-xl font-semibold tracking-tight font-code">{e.id}</h1><ExecBadge s={e.status} /><TriggerChip kind={e.trigger} /></div>
        <p className="text-sm text-text-secondary mt-1"><Link href={`/mlops/functions/${e.fnId}`} className="hover:underline font-medium">{e.fnName}</Link> revision {e.revision}, started {when(e.startedAt)}, took {fmtMs(e.durationMs)}.</p>
      </div>
      {e.error && <Notice tone={e.status === "blocked" || e.status === "throttled" ? "warn" : "bad"} title={e.error.code}>{e.error.message}</Notice>}
      {e.status === "blocked" && <Notice tone="info">This call was stopped before the handler ran, so no model was called and nothing was spent.</Notice>}

      <div className="grid lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader title="Attribution" subtitle="Who ran it, on what, and what it cost" />
          <div className="px-5 py-4"><KeyValue rows={[
            ["App", s.apps.find((a) => a.id === e.appId)?.name], ["Tenant", s.tenants.find((t) => t.id === e.tenantId)?.name], ["Provider", <ProviderChip key="p" id={e.provider} />], ["Model", <ModelChip key="m" id={e.model} />],
            ["Tokens in", num(e.tokensIn)], ["Tokens out", num(e.tokensOut)], ["Cost", <span key="c" className="font-medium tabular-nums">{usd(e.costMicros, 6)}</span>],
            ["Cost ceiling", f ? usd(f.governance.maxCostMicros) : "n/a"],
          ]} /></div>
        </Card>
        <Card>
          <CardHeader title="Policy and audit" />
          <div className="px-5 py-4"><KeyValue rows={[
            ["Decision", <Badge key="d" tone={e.policy.result === "allow" ? "healthy" : e.policy.result === "deny" ? "degraded" : "neutral"}>{e.policy.result}</Badge>], ["Policy", policy ? `${policy.name} v${policy.version}` : "none"], ["Reason", e.policy.reason ?? "All attached policies allowed the call"],
            ["Audit id", <span key="a" className="font-code text-xs">{e.auditId}</span>], ["Correlation id", <span key="c" className="font-code text-xs">{e.correlationId}</span>], ["Idempotency key", e.idempotencyKey ? <span key="i" className="font-code text-xs">{e.idempotencyKey}</span> : "not sent"],
          ]} /></div>
        </Card>
        <Card>
          <CardHeader title="Runtime" />
          <div className="px-5 py-4"><KeyValue rows={[
            ["Duration", fmtMs(e.durationMs)], ["Cold start", e.coldStart ? "Yes" : "No"], ["Memory used", `${e.memoryUsedMb} of ${f?.memoryMb} MB`], ["Attempt", `${e.attempt} of ${(f?.governance.retries.max ?? 0) + 1}`], ["HTTP status", e.httpStatus ?? "n/a"],
            ["Request digest", <span key="r" className="font-code text-xs">{e.payloadDigest}</span>], ["Trigger", e.triggerName],
          ]} /><p className="text-xs text-text-tertiary mt-3">The request and response bodies are not kept, only this digest.</p></div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Timeline" subtitle={`${d.steps.length} steps over ${fmtMs(total)}`} />
        <ol className="px-5 py-4 space-y-2.5">
          {d.steps.map((st) => (
            <li key={st.id} className="grid grid-cols-[minmax(150px,230px)_1fr_70px] gap-3 items-center text-[13px]">
              <div className="flex items-center gap-2 min-w-0"><FnIcon name={STEP_ICON[st.kind]} size={15} className="shrink-0 text-text-tertiary" /><span className="truncate">{st.name}</span></div>
              <div className="relative h-5 rounded bg-surface-muted" title={`${st.status}: ${st.detail}`}>
                <div className={`absolute top-0 bottom-0 rounded ${STEP_TONE[st.status]}`} style={{ left: `${(st.startMs / total) * 100}%`, width: `${Math.max((st.durationMs / total) * 100, 0.8)}%` }} />
              </div>
              <span className="tabular-nums text-text-secondary text-right">{fmtMs(st.durationMs)}</span>
              <div className="col-start-2 col-span-2 -mt-1 text-xs text-text-tertiary">{st.detail}{st.tokensIn !== undefined && st.kind === "ai" && ` | ${num(st.tokensIn)} in, ${num(st.tokensOut ?? 0)} out, ${usd(st.costMicros ?? 0, 6)}`}</div>
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader title="Logs" />
          <ul className="font-code text-[12px] divide-y divide-border">
            {d.logs.map((l, i) => <li key={i} className="px-5 py-1.5 flex gap-3"><span className="w-16 shrink-0 text-text-tertiary">+{l.tMs} ms</span><span className={`w-12 shrink-0 ${level[l.level]}`}>{l.level}</span><span className="w-16 shrink-0 text-text-tertiary">{l.source}</span><span className="break-words min-w-0">{l.message}</span></li>)}
          </ul>
        </Card>
        <div className="space-y-4">
          {run && (
            <Card>
              <CardHeader title="Part of a workflow run" />
              <div className="px-5 py-4 text-[13px]"><Link href={`/mlops/functions/workflows/runs/${run.id}`} className="font-medium hover:underline">{run.workflowName}</Link><div className="text-xs text-text-tertiary font-code mt-0.5">{run.id}</div></div>
            </Card>
          )}
          <Card>
            <CardHeader title="Same correlation id" subtitle="Calls made for the same request" />
            {related.length === 0 ? <p className="px-5 py-4 text-sm text-text-secondary">This was the only call.</p> : (
              <ul className="divide-y divide-border">{related.map((r) => <li key={r.id} className="px-5 py-2.5 text-[13px] flex items-center justify-between"><span><Link href={`/mlops/functions/executions/${r.id}`} className="hover:underline">{r.fnName}</Link></span><ExecBadge s={r.status} /></li>)}</ul>
            )}
          </Card>
        </div>
      </div>
      <CodeBlock title="Execution record (simulated)" language="json" maxHeight={260} code={JSON.stringify({ id: e.id, function: e.fnName, revision: e.revision, status: e.status, trigger: e.trigger, correlationId: e.correlationId, auditId: e.auditId, usage: { provider: e.provider ?? null, model: e.model ?? null, tokensIn: e.tokensIn, tokensOut: e.tokensOut, costMicros: e.costMicros }, policy: e.policy }, null, 2)} />
    </div>
  );
}
