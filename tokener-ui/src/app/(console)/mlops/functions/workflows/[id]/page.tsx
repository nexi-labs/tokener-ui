"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, SearchX } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Form";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Confirm, GuardButton, KeyValue, Kpi, Tabs, useRole } from "@/components/mlops/ui";
import { toast } from "@/lib/mlops/toast";
import { FnIcon } from "@/components/functions/FnIcon";
import { TriggerChip, WfRunBadge, WfStatusBadge, ago, fmtMs, pct, useFx, when } from "@/components/functions/ui";
import { WorkflowGraph } from "@/components/functions/WorkflowGraph";
import { WorkflowEditor } from "@/components/functions/WorkflowEditor";
import { setWorkflowStatus } from "@/lib/functions/store";
import { num, usd, usd2, type WfRunStatus } from "@/lib/functions/types";

const TABS = [{ id: "overview", label: "Overview" }, { id: "editor", label: "Editor" }, { id: "runs", label: "Runs" }] as const;
type Tab = (typeof TABS)[number]["id"];

export default function WorkflowDetail() {
  const { id } = useParams<{ id: string }>();
  const s = useFx(); const role = useRole();
  const w = s.workflows.find((x) => x.id === id);
  const [tab, setTab] = useState<Tab>(() => { try { const q = new URLSearchParams(window.location.search).get("tab"); return (TABS.find((t) => t.id === q)?.id ?? "overview") as Tab; } catch { return "overview"; } });
  const [status, setStatus] = useState<WfRunStatus | "all">("all"); const [limit, setLimit] = useState(25); const [disable, setDisable] = useState(false);
  const go = (t: Tab) => { setTab(t); try { const u = new URL(window.location.href); u.searchParams.set("tab", t); window.history.replaceState(null, "", u); } catch { /* ignore */ } };
  if (!w) return <Card><EmptyState icon={SearchX} title="Workflow not found" description="It may have been removed, or it belongs to another tenant." action={<Link href="/mlops/functions/workflows" className="text-sm text-accent-700 underline">Back to workflows</Link>} /></Card>;
  const runs = s.runs.filter((r) => r.workflowId === w.id);
  const week = runs.filter((r) => new Date(r.startedAt).getTime() >= new Date(s.anchor).getTime() - 7 * 86_400_000);
  const ok = week.filter((r) => r.status === "succeeded").length; const cost = week.reduce((a, r) => a + r.costMicros, 0);
  const shown = runs.filter((r) => status === "all" || r.status === status);
  const app = s.apps.find((a) => a.id === w.appId);
  return (
    <div className="space-y-5">
      <div>
        <Link href="/mlops/functions/workflows" className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary mb-3"><ArrowLeft size={13} /> Workflows</Link>
        <div className="flex items-start gap-4">
          <span className="grid place-items-center h-[52px] w-[52px] rounded-lg bg-ink-800 text-accent-500 shrink-0"><FnIcon name="workflow" size={28} /></span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5"><h1 className="text-xl font-semibold tracking-tight font-code">{w.name}</h1><WfStatusBadge s={w.status} /><TriggerChip kind={w.trigger.kind} /></div>
            <p className="text-sm text-text-secondary mt-1 max-w-3xl">{w.description}</p><p className="text-xs text-text-tertiary mt-1">{app?.name}, owned by {w.owner}</p>
          </div>
        </div>
      </div>
      <Tabs tabs={TABS.map((t) => ({ id: t.id, label: t.label, count: t.id === "runs" ? runs.length : undefined }))} value={tab} onChange={go} label="Workflow sections" />
      <div role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label}>
        {tab === "overview" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi label="Runs, 7 days" value={num(week.length)} /><Kpi label="Success rate" value={pct(ok, week.length)} sub={`${week.filter((r) => r.status === "failed" || r.status === "blocked").length} failed or blocked`} />
              <Kpi label="Waiting for approval" value={num(week.filter((r) => r.status === "waiting-approval").length)} /><Kpi label="AI cost, 7 days" value={usd2(cost)} sub={`${usd(week.length ? cost / week.length : 0, 5)} per run`} />
            </div>
            <div className="grid lg:grid-cols-3 gap-4">
              <Card className="lg:col-span-2"><CardHeader title="Flow" subtitle={`Revision r${w.activeRevision ?? w.latestRevision}${w.activeRevision ? " (active)" : " (draft)"}`} /><div className="px-5 py-5"><WorkflowGraph steps={w.steps} /></div></Card>
              <div className="space-y-4">
                <Card><CardHeader title="Details" /><div className="px-5 py-4"><KeyValue rows={[["Trigger", w.trigger.summary], ["Use case", w.useCase || "not set"], ["Cost ceiling", `${usd(w.maxCostMicros)} per run`], ["Run timeout", `${w.timeoutS} s`], ["Policies", w.policyIds.length], ["Updated", when(w.updatedAt)]]} /></div></Card>
                <Card>
                  <CardHeader title="Revisions" />
                  <ul className="divide-y divide-border">{[...w.revisions].reverse().map((r) => <li key={r.number} className="px-5 py-2.5 text-[13px] flex items-start justify-between gap-3"><span><span className="font-medium tabular-nums">r{r.number}</span> <span className="text-text-secondary">{r.note}</span><span className="block text-xs text-text-tertiary">{r.createdBy}, {when(r.createdAt)}</span></span><Badge tone={r.status === "active" ? "healthy" : "neutral"}>{r.status}</Badge></li>)}</ul>
                </Card>
                {w.status === "active" && <GuardButton action="pipeline.publish" role={role} onClick={() => setDisable(true)}>Disable workflow</GuardButton>}
                {w.status === "disabled" && <GuardButton action="pipeline.publish" role={role} onClick={() => { setWorkflowStatus(w.id, "active"); toast("Workflow enabled in the preview.", "info"); }}>Enable workflow</GuardButton>}
              </div>
            </div>
          </div>
        )}
        {tab === "editor" && <WorkflowEditor key={`${w.id}:${w.latestRevision}`} s={s} w={w} />}
        {tab === "runs" && (
          <div className="space-y-3">
            <Select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value as WfRunStatus | "all"); setLimit(25); }} className="!w-52"><option value="all">Any status</option>{(["succeeded", "failed", "blocked", "waiting-approval", "rejected"] as WfRunStatus[]).map((x) => <option key={x} value={x}>{x}</option>)}</Select>
            <Card>
              {shown.length === 0 ? <EmptyState icon={SearchX} title="No runs" description={runs.length === 0 ? (w.status === "active" ? "This workflow has not run yet." : "A workflow runs only while it is active. Activate a revision in the editor.") : "No run has that status."} /> : (
                <>
                  <Table><Thead><tr><Th>Run</Th><Th>Status</Th><Th>Revision</Th><Th>Duration</Th><Th>Tokens</Th><Th>Cost</Th><Th>Approval</Th><Th>Started</Th></tr></Thead>
                    <tbody>{shown.slice(0, limit).map((r) => (
                      <Tr key={r.id}><Td><Link href={`/mlops/functions/workflows/runs/${r.id}`} className="font-code text-xs hover:underline">{r.id}</Link></Td><Td><WfRunBadge s={r.status} /></Td><Td className="tabular-nums text-text-secondary">r{r.revision}</Td>
                        <Td className="tabular-nums text-text-secondary">{r.status === "waiting-approval" ? "paused" : fmtMs(r.durationMs)}</Td><Td className="tabular-nums text-text-secondary">{num(r.tokensIn + r.tokensOut)}</Td><Td className="tabular-nums text-text-secondary">{usd(r.costMicros, 5)}</Td>
                        <Td className="text-text-secondary">{r.approval ? (r.approval.decision ? `${r.approval.decision} by ${r.approval.approver}` : "pending") : "none"}</Td><Td className="text-text-secondary">{ago(r.startedAt, s.anchor)}</Td></Tr>
                    ))}</tbody></Table>
                  {shown.length > limit && <div className="p-3 border-t border-border text-center"><Button onClick={() => setLimit(limit + 50)}>Show 50 more</Button></div>}
                </>
              )}
            </Card>
          </div>
        )}
      </div>
      <Confirm open={disable} onClose={() => setDisable(false)} title={`Disable ${w.name}?`} confirmLabel="Disable" danger body={<p>New triggers are ignored and paused runs stay paused. This is a simulated change in the design preview.</p>} onConfirm={() => { setWorkflowStatus(w.id, "disabled"); toast("Workflow disabled in the preview.", "info"); }} />
    </div>
  );
}
