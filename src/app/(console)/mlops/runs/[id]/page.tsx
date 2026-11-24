"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, CheckCircle2, CircleDashed, Loader2, MinusCircle, RotateCw, XCircle, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { FlowCanvas } from "@/components/mlops/FlowCanvas";
import { CodeBlock, Confirm, DemoTag, EnvBadge, GuardButton, KeyValue, Kpi, Modal, Notice, RunBadge, Tabs, fmtDate, fmtDuration, relTime, useRole } from "@/components/mlops/ui";
import { OP_BY_KIND } from "@/lib/mlops/operators";
import { mlops, useMlops } from "@/lib/mlops/store";
import { autoLayoutSpec, toYaml, type PipelineSpec } from "@/lib/mlops/spec";
import { toast } from "@/lib/mlops/toast";
import { versionLabel, type NodeRunStatus } from "@/lib/mlops/types";

type Tab = "graph" | "timeline" | "events" | "snapshot";
const NODE_ICON: Record<NodeRunStatus, React.ReactNode> = {
  succeeded: <CheckCircle2 size={15} className="text-status-healthy" />, running: <Loader2 size={15} className="text-accent-700 animate-spin" />, failed: <XCircle size={15} className="text-status-down" />,
  skipped: <MinusCircle size={15} className="text-text-tertiary" />, pending: <CircleDashed size={15} className="text-text-tertiary" />, waiting: <CircleDashed size={15} className="text-status-degraded" />,
};

export default function RunDetail() {
  const { id } = useParams<{ id: string }>();
  const s = useMlops()!;
  const role = useRole();
  const router = useRouter();
  const run = s.runs.find((r) => r.id === id);
  const [tab, setTab] = useState<Tab>("graph");
  const [selId, setSelId] = useState<string | null>(null);
  const [cancel, setCancel] = useState(false);
  const [reject, setReject] = useState(false);
  const [note, setNote] = useState("");

  const spec = useMemo(() => {
    if (!run) return null;
    const snap = (run.snapshot as { spec: PipelineSpec }).spec;
    return autoLayoutSpec({ ...snap, nodes: snap.nodes.map((n) => ({ ...n, x: 0, y: 0 })) });
  }, [run?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!run || !spec) return <Card><EmptyState icon={XCircle} title="Run not found" description="It may have been removed, or the link is wrong." action={<Link href="/mlops/runs"><Button>Back to runs</Button></Link>} /></Card>;

  const overlay = Object.fromEntries(run.nodes.map((n) => [n.nodeId, n.status])) as Record<string, NodeRunStatus>;
  const sel = run.nodes.find((n) => n.nodeId === selId) ?? run.nodes.find((n) => n.status === "failed" || n.status === "waiting" || n.status === "running") ?? run.nodes[0];
  const selNode = spec.nodes.find((n) => n.id === sel?.nodeId);
  const live = run.status === "running";
  const total = run.nodes.reduce((m, n) => m + (n.durationMs ?? 0), 0) || 1;

  return (
    <div className="space-y-5">
      <Link href="/mlops/runs" className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary"><ArrowLeft size={13} /> Runs</Link>
      <PageHeader title={`${run.pipelineName} ${versionLabel(run.pipelineVersion)}`} description={<span className="font-code text-xs">{run.id}</span> as unknown as string}
        action={
          <div className="flex flex-wrap gap-2 justify-end">
            {run.status === "waiting-approval" && <>
              <GuardButton action="run.approve" env={run.env} role={role} variant="primary" extraDisabled={run.startedBy === `you (${role})` ? "The requester cannot approve their own run" : undefined} onClick={async () => { const r = await mlops.approveRun(run.id, true); r.ok ? toast("Approved. The run continues.") : toast(r.error, "error"); }}><Check size={14} /> Approve</GuardButton>
              <GuardButton action="run.approve" env={run.env} role={role} onClick={() => setReject(true)}><X size={14} /> Reject</GuardButton>
            </>}
            {["running", "waiting-approval", "queued"].includes(run.status) && <GuardButton action="run.cancel" env={run.env} role={role} onClick={() => setCancel(true)}>Cancel run</GuardButton>}
            {!["running", "waiting-approval", "queued"].includes(run.status) && <GuardButton action="pipeline.run" env={run.env} role={role} onClick={async () => { const r = await mlops.startRun(run.pipelineId, run.pipelineVersion, "retry"); r.ok ? router.push(`/mlops/runs/${r.id}`) : toast(r.error, "error"); }}><RotateCw size={14} /> Run again</GuardButton>}
          </div>
        } />
      <div className="flex flex-wrap items-center gap-2 -mt-3"><RunBadge s={run.status} /><EnvBadge env={run.env} />{run.demo && <DemoTag />}{live && <span className="text-xs text-text-tertiary inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Updating</span>}</div>

      {run.status === "validation-failed" && <Notice tone="bad" title="Blocked before execution">Validation failed, so no operator ran and nothing changed. Fix the issues listed under Events and run again.</Notice>}
      {run.status === "waiting-approval" && <Notice tone="warn" title="Paused at an approval gate">The run holds no resources while it waits. Approvers can approve or reject. The requester cannot approve their own run.{role !== "approver" && role !== "admin" ? " Switch to the approver role to try it." : ""}</Notice>}
      {run.status === "rolled-back" && <Notice tone="warn" title="Rolled back">A step failed and the failure policy restored the previous revision. See Events for the sequence.</Notice>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Started" value={relTime(run.startedAt)} sub={`${fmtDate(run.startedAt)} by ${run.startedBy}`} />
        <Kpi label="Duration" value={live ? "running" : run.status === "waiting-approval" ? "paused" : fmtDuration(run.durationMs)} sub={`trigger: ${run.trigger}`} />
        <Kpi label="Operators" value={`${run.nodes.filter((n) => n.status === "succeeded").length}/${run.nodes.length}`} sub="succeeded" />
        <Kpi label="Spec digest" value={<span className="text-base font-code">{run.specDigest.slice(7, 19)}</span>} sub="immutable snapshot" />
      </div>

      <Tabs value={tab} onChange={setTab} label="Run sections" tabs={[{ id: "graph", label: "Graph" }, { id: "timeline", label: "Timeline" }, { id: "events", label: "Events", count: run.events.length }, { id: "snapshot", label: "Snapshot" }]} />

      {tab === "graph" && (
        <div className="grid lg:grid-cols-[1fr_380px] gap-4">
          <div className="relative h-[480px] rounded-lg border border-border overflow-hidden"><FlowCanvas spec={spec} selection={sel ? { type: "node", id: sel.nodeId } : null} onSelect={(x) => x?.type === "node" && setSelId(x.id)} readOnly overlay={overlay} animate={live} label="Run graph with status overlay" /></div>
          <Card><CardHeader title={selNode?.name ?? "Operator"} subtitle={selNode ? OP_BY_KIND[selNode.operator].label : undefined} action={sel && <span className="inline-flex items-center gap-1.5 text-xs">{NODE_ICON[sel.status]}{sel.status}</span>} />
            {sel && (
              <div className="p-4 space-y-4 text-[13px]">
                <KeyValue rows={[["Attempts", `${sel.attempt} of ${sel.maxAttempts}`], ["Started", sel.startedAt ? fmtDate(sel.startedAt) : "not started"], ["Duration", fmtDuration(sel.durationMs)]]} />
                {sel.logs.length > 0 ? (
                  <div className="rounded-md bg-ink-800 p-2.5 font-code text-[11.5px] leading-relaxed overflow-x-auto max-h-64 overflow-y-auto">
                    {sel.logs.map((l, i) => (<div key={i} className="flex gap-2 whitespace-pre"><span className="text-text-tertiary">{new Date(l.t).toLocaleTimeString("en-GB")}</span><span className={l.level === "error" ? "text-[#FF8A8A]" : l.level === "warn" ? "text-[#F3C16B]" : l.level === "debug" ? "text-text-tertiary" : "text-[#D8E4E2]"}>{l.msg}</span></div>))}
                  </div>
                ) : <p className="text-text-secondary text-xs">{sel.status === "skipped" ? "Skipped because an earlier operator did not succeed or the run was stopped." : "No output yet."}</p>}
                {sel.artifacts.length > 0 && <div><div className="font-semibold mb-1.5">Artifacts</div><ul className="space-y-1.5">{sel.artifacts.map((a) => (<li key={a.name} className="text-xs"><Badge>{a.kind}</Badge> <span className="font-code break-all">{a.ref}</span></li>))}</ul></div>}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "timeline" && (
        <Card><CardHeader title="Timeline" subtitle="Operator durations in execution order" />
          <ul className="divide-y divide-border">
            {run.nodes.map((n) => {
              const sp = spec.nodes.find((x) => x.id === n.nodeId);
              return (
                <li key={n.nodeId} className="px-5 py-2.5 flex items-center gap-3 text-[13px]">
                  <span className="w-5">{NODE_ICON[n.status]}</span><span className="w-44 truncate font-medium">{sp?.name ?? n.nodeId}</span>
                  <div className="flex-1 h-2 bg-surface-muted rounded overflow-hidden"><div className={n.status === "failed" ? "bg-status-down h-full" : "bg-note h-full"} style={{ width: `${Math.max(2, ((n.durationMs ?? 0) / total) * 100)}%` }} /></div>
                  <span className="w-16 text-right tabular-nums text-text-secondary">{fmtDuration(n.durationMs)}</span>
                  <span className="w-20 text-right text-xs text-text-tertiary">{n.attempt > 1 ? `${n.attempt} attempts` : ""}</span>
                </li>
              );
            })}
          </ul></Card>
      )}

      {tab === "events" && (
        <Card><CardHeader title="Events" />
          <ul className="divide-y divide-border">{run.events.map((e, i) => (<li key={i} className="px-5 py-2.5 text-[13px] flex gap-3"><span className="text-xs text-text-tertiary w-20 shrink-0 tabular-nums">{new Date(e.t).toLocaleTimeString("en-GB")}</span><Badge tone={e.kind === "failure" || e.kind === "validation" ? "down" : e.kind === "rollback" ? "degraded" : "neutral"}>{e.kind}</Badge><span>{e.msg}</span></li>))}</ul></Card>
      )}

      {tab === "snapshot" && (
        <div className="space-y-3">
          <Notice tone="info">This is the exact spec the run executed, with the connections it resolved. It never changes, even if the pipeline is edited later. Secret values are never captured, only references. Idempotency key <span className="font-code">{run.idempotencyKey}</span>.</Notice>
          <CodeBlock title={`snapshot ${run.specDigest.slice(0, 26)}...`} language="yaml" code={toYaml(run.snapshot)} maxHeight={520} />
        </div>
      )}

      <Confirm open={cancel} onClose={() => setCancel(false)} danger title="Cancel run" confirmLabel="Cancel run" body={<p>In-flight operators are asked to stop. Operators that already changed something are not undone automatically. Use rollback for that.</p>} onConfirm={async () => { const r = await mlops.cancelRun(run.id); r.ok ? toast("Run cancelled") : toast(r.error, "error"); }} />
      <Modal open={reject} onClose={() => setReject(false)} title="Reject approval" footer={<><Button onClick={() => setReject(false)}>Cancel</Button><Button variant="primary" onClick={async () => { const r = await mlops.approveRun(run.id, false, note); r.ok ? (toast("Rejected. The run was stopped."), setReject(false)) : toast(r.error, "error"); }}>Reject</Button></>}>
        <label className="block"><span className="block text-[13px] font-medium mb-1.5">Reason</span><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-md border border-border-strong px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500/40" /></label>
      </Modal>
    </div>
  );
}
