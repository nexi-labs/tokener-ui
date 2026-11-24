"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, SearchX } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { KeyValue, Notice } from "@/components/mlops/ui";
import { toast } from "@/lib/mlops/toast";
import { useRole } from "@/components/mlops/ui";
import { can } from "@/lib/mlops/rbac";
import { FnIcon } from "@/components/functions/FnIcon";
import { ExecBadge, ModelChip, STEP_ICON, WfRunBadge, fmtMs, useFx, when } from "@/components/functions/ui";
import { WorkflowGraph } from "@/components/functions/WorkflowGraph";
import { decideApproval } from "@/lib/functions/store";
import { num, usd } from "@/lib/functions/types";

const TONE = { succeeded: "bg-accent-600", failed: "bg-status-down", blocked: "bg-status-degraded", skipped: "bg-border-strong", waiting: "bg-status-info", running: "bg-status-info" } as const;

export default function WorkflowRunDetail() {
  const { id } = useParams<{ id: string }>();
  const s = useFx(); const role = useRole();
  const r = s.runs.find((x) => x.id === id);
  if (!r) return <Card><EmptyState icon={SearchX} title="Run not found" description="It may be older than the retention window." action={<Link href="/mlops/functions/workflows" className="text-sm text-accent-700 underline">Back to workflows</Link>} /></Card>;
  const w = s.workflows.find((x) => x.id === r.workflowId);
  const execs = r.executionIds.map((x) => s.executions.find((e) => e.id === x)).filter(Boolean) as typeof s.executions;
  // Bars are laid out in sequence. A human wait can last hours, so it is drawn at a fixed share and marked as not to scale.
  const work = r.steps.filter((x) => x.kind !== "approval").reduce((a, x) => a + x.durationMs, 0) || 1;
  const waitShare = work * 0.35;
  let acc = 0;
  const lay = r.steps.map((x) => { const d = x.kind === "approval" ? Math.min(x.durationMs || waitShare, waitShare) : x.durationMs; const o = acc; acc += d; return { o, d }; });
  const total = Math.max(acc, 1);
  const decision = can(role, "run.approve");
  // The graph shows the workflow as it is now. Colours come from the steps this run recorded, matched by name.
  const status: Record<string, (typeof r.steps)[number]["status"]> = {};
  for (const st of r.steps) { const hit = w?.steps.find((x) => x.name === st.name || st.name.startsWith(x.name)); if (hit) status[hit.id] = st.status; }
  return (
    <div className="space-y-5">
      <div>
        <Link href={`/mlops/functions/workflows/${r.workflowId}?tab=runs`} className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary mb-3"><ArrowLeft size={13} /> {r.workflowName}</Link>
        <div className="flex flex-wrap items-center gap-2.5"><h1 className="text-xl font-semibold tracking-tight font-code">{r.id}</h1><WfRunBadge s={r.status} /></div>
        <p className="text-sm text-text-secondary mt-1">{r.workflowName} revision {r.revision}, started {when(r.startedAt)}{r.status === "waiting-approval" ? ", paused for a decision" : `, took ${fmtMs(r.durationMs)}`}.</p>
      </div>

      {r.status === "waiting-approval" && r.approval && (
        <Notice tone="info" title="Waiting for a human decision">
          Requested {when(r.approval.requestedAt)} from {r.approval.approver}. Nothing past this step runs until someone decides.
          <div className="flex items-center gap-2 mt-2">
            <Button variant="primary" disabled={!decision.ok} title={decision.ok ? undefined : (decision as { reason: string }).reason} onClick={() => { const x = decideApproval(r.id, "approved", `you (${role})`); if (x.ok) toast("Approved in the preview. No downstream system was called.", "info"); }}>Approve</Button>
            <Button disabled={!decision.ok} title={decision.ok ? undefined : (decision as { reason: string }).reason} onClick={() => { const x = decideApproval(r.id, "rejected", `you (${role})`); if (x.ok) toast("Rejected in the preview.", "info"); }}>Reject</Button>
            {!decision.ok && <span className="text-xs">{(decision as { reason: string }).reason}</span>}
          </div>
        </Notice>
      )}
      {r.approval?.decision && <Notice tone={r.approval.decision === "approved" ? "ok" : "warn"} title={`${r.approval.decision === "approved" ? "Approved" : "Rejected"} by ${r.approval.approver}`}>Decided {when(r.approval.decidedAt)}.</Notice>}

      <div className="grid lg:grid-cols-3 gap-4">
        <Card><CardHeader title="Attribution" /><div className="px-5 py-4"><KeyValue rows={[["App", s.apps.find((a) => a.id === r.appId)?.name], ["Tenant", s.tenants.find((t) => t.id === r.tenantId)?.name], ["Tokens in", num(r.tokensIn)], ["Tokens out", num(r.tokensOut)], ["Cost", <span key="c" className="font-medium tabular-nums">{usd(r.costMicros, 6)}</span>], ["Cost ceiling", w ? usd(w.maxCostMicros) : "n/a"]]} /></div></Card>
        <Card><CardHeader title="Trace" /><div className="px-5 py-4"><KeyValue rows={[["Correlation id", <span key="a" className="font-code text-xs">{r.correlationId}</span>], ["Function calls", execs.length], ["Workflow AI steps", r.nativeUsage.length], ["Steps", r.steps.length]]} /></div></Card>
        <Card><CardHeader title="Function executions" subtitle="Same correlation id" />
          <ul className="divide-y divide-border">{execs.map((e) => <li key={e.id} className="px-5 py-2.5 text-[13px] flex items-center justify-between gap-2"><span className="min-w-0"><Link href={`/mlops/functions/executions/${e.id}`} className="hover:underline">{e.fnName}</Link><span className="block text-xs text-text-tertiary"><ModelChip id={e.model} /></span></span><ExecBadge s={e.status} /></li>)}</ul>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader title="Timeline" subtitle={`${r.steps.length} steps. Time spent waiting for a person is not drawn to scale.`} />
          <ol className="px-5 py-4 space-y-2.5">
            {r.steps.map((st, i) => (
              <li key={st.id} className="grid grid-cols-[minmax(150px,240px)_1fr_70px] gap-3 items-center text-[13px]">
                <div className="flex items-center gap-2 min-w-0"><FnIcon name={STEP_ICON[st.kind]} size={15} className="shrink-0 text-text-tertiary" /><span className="truncate">{st.name}</span></div>
                <div className="relative h-5 rounded bg-surface-muted" title={`${st.status}: ${st.detail}`}><div className={`absolute top-0 bottom-0 rounded ${TONE[st.status]}`} style={{ left: `${Math.min((lay[i].o / total) * 100, 99)}%`, width: `${Math.max((lay[i].d / total) * 100, 0.8)}%` }} /></div>
                <span className="tabular-nums text-text-secondary text-right">{st.kind === "approval" && st.status === "waiting" ? "waiting" : fmtMs(st.durationMs)}</span>
                <div className="col-start-2 col-span-2 -mt-1 text-xs text-text-tertiary">{st.detail}{st.kind === "ai" && st.tokensIn !== undefined && ` | ${num(st.tokensIn)} in, ${num(st.tokensOut ?? 0)} out, ${usd(st.costMicros ?? 0, 6)}`}{st.kind === "function" && st.costMicros ? ` | ${usd(st.costMicros, 6)}` : ""}</div>
              </li>
            ))}
          </ol>
        </Card>
        {w && <Card><CardHeader title="Workflow" subtitle="Current definition. Colours show this run." /><div className="px-5 py-5"><WorkflowGraph steps={w.steps} status={status} /></div></Card>}
      </div>
    </div>
  );
}
