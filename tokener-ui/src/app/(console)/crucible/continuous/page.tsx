"use client";

import { useMemo, useState } from "react";
import { Pause, Play, Plus, Pencil, Zap } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Select, Toggle } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Drawer, GuardButton, Modal, Notice, useRole } from "@/components/mlops/ui";
import { DecisionBadge, StepMark, mval, person } from "@/components/crucible/bits";
import { PolicyEditor, blankPolicy } from "@/components/crucible/PolicyEditor";
import { APPROVAL_LABEL, STEP_LABEL, STEP_ORDER, TRIGGER_LABEL, approvalsNeeded } from "@/lib/crucible/ct";
import { crucible, useCrucible } from "@/lib/crucible/store";
import type { CtPolicy, Cycle, TriggerKind } from "@/lib/crucible/types";
import { toast } from "@/lib/mlops/toast";
import { ago, int, usd } from "@/lib/agents/format";

export default function Continuous() {
  const { policies, cycles, experiments } = useCrucible();
  const role = useRole();
  const [edit, setEdit] = useState<CtPolicy | null>(null);
  const [run, setRun] = useState<CtPolicy | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const shown = useMemo(() => cycles.filter((c) => filter === "all" || c.policyId === filter), [cycles, filter]);
  const open = cycles.find((c) => c.id === openId) ?? null;
  const pol = (id: string) => policies.find((p) => p.id === id);

  const setState = (p: CtPolicy, to: CtPolicy["state"]) => { const r = crucible.setPolicyState(role, p.id, to); r.ok ? toast(`${to === "active" ? "Resumed" : "Paused"} ${p.name}`) : toast(r.error, "error"); };

  return (
    <div className="space-y-8">
      <PageHeader title="Continuous training" description="A policy keeps a registered model fresh. When new Refinery data arrives, Crucible trains a candidate, tests it against the champion and the gates, and asks for approval. Nothing replaces the champion until a canary in Deployments passes."
        action={<GuardButton action="pipeline.edit" role={role} variant="primary" onClick={() => setEdit(blankPolicy(experiments[0].id, experiments[0].model ?? ""))}><Plus size={14} /> New policy</GuardButton>} />

      <Card className="overflow-hidden">
        <Table>
          <Thead><tr><Th>Policy</Th><Th>Champion</Th><Th>Starts when</Th><Th>Approval</Th><Th>Budget this month</Th><Th>{""}</Th></tr></Thead>
          <tbody>
            {policies.map((p) => (
              <Tr key={p.id}>
                <Td>
                  <div className="font-medium text-text-primary">{p.name}</div>
                  <div className="text-xs text-text-tertiary mt-0.5">{p.model} · <Badge tone={p.state === "active" ? "healthy" : p.state === "paused" ? "degraded" : "neutral"}>{p.state === "active" ? "Active" : p.state === "paused" ? "Paused" : "Draft"}</Badge></div>
                </Td>
                <Td className="tabular-nums">Version {p.champion.version}<div className="text-xs text-text-tertiary">{p.gates.metric.replace(/_/g, " ")} {mval(p.gates.metric, p.champion.metric)}</div></Td>
                <Td className="text-text-secondary max-w-[260px]">{p.triggers.map((t) => TRIGGER_LABEL[t.kind]).join(", ")}</Td>
                <Td className="text-text-secondary">{APPROVAL_LABEL[p.approval]}<div className="text-xs text-text-tertiary">{p.tier === "high" ? "High" : p.tier === "low" ? "Low" : "Standard"} risk tier</div></Td>
                <Td className="min-w-[150px]">
                  <div className="text-sm tabular-nums">{usd(p.budget.spentUsd, 0)} <span className="text-text-tertiary">of {usd(p.budget.monthlyUsd, 0)}</span></div>
                  <div className="h-1.5 rounded-full bg-surface-muted mt-1.5 overflow-hidden"><div className="h-full bg-accent-600" style={{ width: `${Math.min(100, (p.budget.spentUsd / p.budget.monthlyUsd) * 100)}%` }} /></div>
                </Td>
                <Td className="text-right whitespace-nowrap">
                  <GuardButton action="pipeline.run" role={role} variant="ghost" className="h-8" extraDisabled={p.state !== "active" ? "Resume the policy to start a cycle." : undefined} onClick={() => setRun(p)}><Zap size={13} /> Run now</GuardButton>
                  <GuardButton action="pipeline.publish" role={role} variant="ghost" className="h-8" onClick={() => setState(p, p.state === "active" ? "paused" : "active")}>{p.state === "active" ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Resume</>}</GuardButton>
                  <GuardButton action="pipeline.edit" role={role} variant="ghost" className="h-8" onClick={() => setEdit(p)}><Pencil size={13} /> Edit</GuardButton>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div><h2 className="text-sm font-semibold text-text-primary">Cycles</h2><p className="text-xs text-text-tertiary mt-0.5">Each cycle is one attempt to replace the champion, with the evidence it produced.</p></div>
          <div className="w-60"><Select aria-label="Filter by policy" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All policies</option>{policies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
        </div>
        <Card className="overflow-hidden">
          <Table>
            <Thead><tr><Th>Cycle</Th><Th>Started by</Th><Th>Decision</Th><Th>Candidate</Th><Th>Cost</Th><Th>Started</Th></tr></Thead>
            <tbody>
              {shown.map((c) => { const p = pol(c.policyId); return (
                <Tr key={c.id} onClick={() => setOpenId(c.id)} className="cursor-pointer">
                  <Td><span className="font-medium text-text-primary">{c.id}</span><div className="text-xs text-text-tertiary">{p?.name}</div></Td>
                  <Td className="text-text-secondary">{TRIGGER_LABEL[c.event.kind]}<div className="text-xs text-text-tertiary">{c.event.detail}</div></Td>
                  <Td><DecisionBadge d={c.decision} /></Td>
                  <Td className="tabular-nums text-text-secondary">{c.candidate && p ? `${mval(p.gates.metric, c.candidate.metric)}${c.candidate.version ? ` · v${c.candidate.version}` : ""}` : "None"}</Td>
                  <Td className="tabular-nums text-text-secondary">{usd(c.costUsd)}</Td>
                  <Td className="text-text-secondary">{ago(c.startedAt)}</Td>
                </Tr>
              ); })}
              {shown.length === 0 && <Tr><Td colSpan={6} className="text-text-tertiary">No cycles yet.</Td></Tr>}
            </tbody>
          </Table>
        </Card>
      </section>

      {open && pol(open.policyId) && <CycleDrawer cycle={open} policy={pol(open.policyId)!} onClose={() => setOpenId(null)} />}
      {edit && <PolicyEditor key={edit.id} initial={edit} onClose={() => setEdit(null)} />}
      {run && <RunNow policy={run} onClose={() => setRun(null)} onStarted={(c) => setOpenId(c.id)} />}
    </div>
  );
}

function RunNow({ policy, onClose, onStarted }: { policy: CtPolicy; onClose: () => void; onStarted: (c: Cycle) => void }) {
  const role = useRole();
  const [kind, setKind] = useState<TriggerKind>(policy.triggers.find((t) => t.kind === "manual") ? "manual" : policy.triggers[0].kind);
  const [pii, setPii] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = () => {
    const r = crucible.fireEvent(role, policy.id, kind, { piiFree: !pii });
    if (!r.ok) { setErr(r.error); return; }
    toast(`Started ${r.value.id}`); onStarted(r.value); onClose();
  };
  return (
    <Modal open onClose={onClose} title={`Run ${policy.name}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={go}>Start cycle</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">In the sample workspace this simulates the event a trigger would send. No model is trained and the figures come from a seeded model of a plausible result.</p>
        <Field label="Event"><Select value={kind} onChange={(e) => setKind(e.target.value as TriggerKind)}>{policy.triggers.map((t) => <option key={t.kind} value={t.kind}>{TRIGGER_LABEL[t.kind]}</option>)}</Select></Field>
        <Toggle label="The new data contains personal data" description="To see the data quality gate stop a cycle before any GPU is used." checked={pii} onChange={setPii} />
        {err && <Notice tone="bad">{err}</Notice>}
      </div>
    </Modal>
  );
}

function CycleDrawer({ cycle: c, policy: p, onClose }: { cycle: Cycle; policy: CtPolicy; onClose: () => void }) {
  const role = useRole();
  const [note, setNote] = useState(""); const [err, setErr] = useState<string | null>(null);
  const need = approvalsNeeded(p.approval);
  const decide = (d: "approve" | "reject") => { const r = crucible.decide(role, c.id, d, note || undefined); if (!r.ok) { setErr(r.error); return; } setErr(null); toast(d === "approve" ? "Approved" : "Rejected"); };
  const complete = () => { const r = crucible.completeRollout(role, c.id); if (!r.ok) { setErr(r.error); return; } setErr(null); toast(`Version ${r.value.candidate?.version ?? ""} is now the champion`); };
  return (
    <Drawer open onClose={onClose} title={c.id} subtitle={`${p.name} · started ${ago(c.startedAt)}`}>
      <div className="space-y-6">
        <div className="flex items-center gap-2.5"><DecisionBadge d={c.decision} /><span className="text-xs text-text-tertiary">{usd(c.costUsd)} sample cost</span></div>
        {c.reason && <Notice tone={c.decision === "promoted" ? "ok" : c.decision === "kept-champion" || c.decision === "failed-early" || c.decision === "rejected" ? "warn" : "info"}>{c.reason}</Notice>}

        <section>
          <h3 className="text-sm font-semibold text-text-primary mb-3">Steps</h3>
          <ol className="space-y-3">
            {STEP_ORDER.map((id) => { const s = c.steps.find((x) => x.id === id); if (!s) return null; return (
              <li key={id} className="flex items-start gap-3"><StepMark s={s.state} /><div className="min-w-0"><div className="text-sm text-text-primary">{STEP_LABEL[id]}</div><div className="text-xs text-text-tertiary">{s.detail}</div></div></li>
            ); })}
          </ol>
        </section>

        {c.gates.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-text-primary mb-3">Gates</h3>
            <ul className="divide-y divide-border border-y border-border">
              {c.gates.map((g) => <li key={g.id} className="py-2 flex items-start justify-between gap-4"><div className="text-sm text-text-primary">{g.label}<div className="text-xs text-text-tertiary">{g.detail}</div></div><Badge tone={g.passed ? "healthy" : "down"}>{g.passed ? "Passed" : "Failed"}</Badge></li>)}
            </ul>
          </section>
        )}

        {c.candidate && (
          <section>
            <h3 className="text-sm font-semibold text-text-primary mb-3">Slices against the champion</h3>
            <div className="grid grid-cols-2 gap-2">{c.candidate.sliceDeltas.map((s) => <div key={s.slice} className="border border-border rounded-md px-3 py-2 text-sm flex justify-between"><span className="capitalize">{s.slice}</span><span className={s.delta < -0.005 ? "text-status-down tabular-nums" : "tabular-nums text-text-secondary"}>{s.delta >= 0 ? "+" : ""}{s.delta.toFixed(3)}</span></div>)}</div>
          </section>
        )}

        <section>
          <h3 className="text-sm font-semibold text-text-primary mb-1">Approvals</h3>
          <p className="text-xs text-text-tertiary mb-2">{APPROVAL_LABEL[p.approval]}{need > 0 ? `. ${c.approvals.length} of ${need} given.` : "."}</p>
          {c.approvals.length === 0 ? <p className="text-sm text-text-secondary">No approval yet.</p> : <ul className="text-sm space-y-1">{c.approvals.map((a) => <li key={a.by + a.at}>{person(a.by)} <span className="text-text-tertiary">{ago(a.at)}</span></li>)}</ul>}
        </section>

        {err && <Notice tone="bad">{err}</Notice>}

        {c.decision === "awaiting-approval" && (
          <section className="space-y-3 border-t border-border pt-5">
            <Field label="Note for the record" hint="Optional. Kept with the evidence."><input value={note} onChange={(e) => setNote(e.target.value)} className="w-full h-9 rounded-md border border-border-strong bg-surface px-3 text-sm" /></Field>
            <div className="flex gap-2"><GuardButton action="run.approve" role={role} variant="primary" onClick={() => decide("approve")}>Approve</GuardButton><GuardButton action="run.approve" role={role} variant="secondary" onClick={() => decide("reject")}>Reject</GuardButton></div>
            <p className="text-xs text-text-tertiary">Change "Viewing as" at the top of the page to approve as a second person. A person cannot approve a cycle they started, and one person cannot approve twice.</p>
          </section>
        )}
        {c.decision === "in-rollout" && (
          <section className="space-y-2 border-t border-border pt-5">
            <p className="text-sm text-text-secondary">Approved. The candidate is in shadow and then canary in Deployments. When the canary passes, promote it. This is the only step that changes the champion.</p>
            <GuardButton action="deployment.promote" role={role} variant="primary" onClick={complete}>Canary passed, promote</GuardButton>
          </section>
        )}
      </div>
    </Drawer>
  );
}
