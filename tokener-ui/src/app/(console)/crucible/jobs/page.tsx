"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Confirm, Drawer, GuardButton, Kpi, Modal, Notice, useRole } from "@/components/mlops/ui";
import { BreakdownView, PlanForm } from "@/components/crucible/Planner";
import { JobBadge, gb, person } from "@/components/crucible/bits";
import { crucible, useCrucible } from "@/lib/crucible/store";
import { PRESETS, defaultPlan, estimate, rightSize, smallestFix, type PlanInput } from "@/lib/crucible/memory";
import type { Job, Queue } from "@/lib/crucible/types";
import { toast } from "@/lib/mlops/toast";
import { ago, usd } from "@/lib/agents/format";

const QUEUE_HELP: Record<Queue, string> = { interactive: "Short jobs and notebooks. Starts first and may preempt batch work.", default: "Normal training. Starts in order of priority.", batch: "Large or low priority work. Waits for free GPUs and may be preempted." };

export default function Jobs() {
  const { jobs, experiments } = useCrucible();
  const role = useRole();
  const [open, setOpen] = useState<Job | null>(null);
  const [cancel, setCancel] = useState<Job | null>(null);
  const [submit, setSubmit] = useState(false);
  const exp = (id: string) => experiments.find((e) => e.id === id)?.name ?? id;
  const k = useMemo(() => ({ running: jobs.filter((j) => j.state === "running").length, waiting: jobs.filter((j) => j.state === "queued" || j.state === "admitting").length, gpus: jobs.filter((j) => j.state === "running").reduce((s, j) => s + j.gpus, 0), failed: jobs.filter((j) => j.state === "failed").length }), [jobs]);

  return (
    <div className="space-y-6">
      <PageHeader title="Jobs" description="A job is one request to run training code on GPUs. Crucible checks the memory plan, waits for capacity in a queue, and retries a job that lost its node."
        action={<GuardButton action="pipeline.run" role={role} variant="primary" onClick={() => setSubmit(true)}><Plus size={14} /> Submit job</GuardButton>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Running" value={k.running} /><Kpi label="Waiting" value={k.waiting} /><Kpi label="GPUs in use" value={k.gpus} /><Kpi label="Failed" value={k.failed} tone={k.failed ? "bad" : undefined} />
      </div>
      <Card className="overflow-hidden">
        <Table>
          <Thead><tr><Th>Job</Th><Th>State</Th><Th>Queue</Th><Th>GPUs</Th><Th>Memory</Th><Th>Submitted</Th><Th>{""}</Th></tr></Thead>
          <tbody>
            {jobs.map((j) => {
              const rs = j.peakGb ? rightSize(j.memRequestGb, j.peakGb) : null;
              return (
                <Tr key={j.id} onClick={() => setOpen(j)} className="cursor-pointer">
                  <Td><span className="font-medium text-text-primary">{j.name}</span><div className="text-xs text-text-tertiary">{exp(j.experimentId)} · {person(j.owner)}</div></Td>
                  <Td><JobBadge s={j.state} />{j.waitReason && <div className="text-xs text-text-tertiary mt-1 max-w-[240px]">{j.waitReason}</div>}</Td>
                  <Td><Badge tone="neutral">{j.queue}</Badge></Td>
                  <Td className="text-text-secondary">{j.gpus ? `${j.gpus} x ${j.card}` : "CPU"}</Td>
                  <Td className="text-text-secondary tabular-nums">{gb(j.memRequestGb, 0)} asked{j.peakGb !== undefined && <div className="text-xs text-text-tertiary">{gb(j.peakGb, 0)} used at peak{rs ? `, a ${rs.cardGb} GB card would do` : ""}</div>}</Td>
                  <Td className="text-text-secondary">{ago(j.submittedAt)}</Td>
                  <Td className="text-right" >{["queued", "admitting", "running"].includes(j.state) && <span onClick={(e) => e.stopPropagation()}><GuardButton action="run.cancel" role={role} variant="ghost" className="h-8" onClick={() => setCancel(j)}>Cancel</GuardButton></span>}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Drawer open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ""} subtitle={open ? `${open.id} · ${exp(open.experimentId)}` : undefined}>
        {open && (
          <div className="space-y-5">
            <div className="flex items-center gap-2"><JobBadge s={open.state} /><Badge tone="neutral">{open.queue}</Badge><span className="text-xs text-text-tertiary">Priority {open.priority}</span></div>
            <dl className="text-sm divide-y divide-border">
              <div className="flex justify-between gap-4 py-2"><dt className="text-text-secondary">Estimated cost</dt><dd className="tabular-nums">{usd(open.costEstimateUsd)}</dd></div>
              <div className="flex justify-between gap-4 py-2"><dt className="text-text-secondary">Image</dt><dd className="font-code text-xs text-right break-all">{open.image}</dd></div>
              <div className="py-2"><dt className="text-text-secondary mb-1">Command</dt><dd className="font-code text-xs bg-surface-muted rounded p-2 break-all">{open.command}</dd></div>
            </dl>
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-2">Attempts</h3>
              {open.attempts.length === 0 ? <p className="text-sm text-text-secondary">No attempt has started.</p> : (
                <ul className="space-y-2">{open.attempts.map((a) => <li key={a.n} className="text-sm border border-border rounded-md px-3 py-2"><div className="flex justify-between"><span>Attempt {a.n} on {a.node}</span><span className="text-xs text-text-tertiary">{ago(a.startedAt)}</span></div>{a.exit && <div className="text-xs text-text-secondary mt-0.5">{a.exit}</div>}</li>)}</ul>
              )}
            </div>
          </div>
        )}
      </Drawer>

      <Confirm open={!!cancel} onClose={() => setCancel(null)} title="Cancel this job" confirmLabel="Cancel job" danger
        body={<>{cancel?.name} will stop and release its GPUs. A run that already wrote checkpoints keeps them.</>}
        onConfirm={() => { if (!cancel) return; const r = crucible.cancelJob(role, cancel.id); r.ok ? toast(`Cancelled ${cancel.name}`) : toast(r.error, "error"); }} />

      {submit && <SubmitModal onClose={() => setSubmit(false)} />}
    </div>
  );
}

function SubmitModal({ onClose }: { onClose: () => void }) {
  const { experiments } = useCrucible(); const role = useRole();
  const [f, setF] = useState({ name: "", experimentId: experiments[0]?.id ?? "", queue: "default" as Queue, image: "registry.nexi.example/train/pytorch:2.3-cu121", command: "python train.py --config configs/default.yaml" });
  const [plan, setPlan] = useState<PlanInput>(() => ({ ...defaultPlan(PRESETS[3]), method: "lora", gpus: 8, gpuGb: 80 }));
  const [err, setErr] = useState<string | null>(null);
  const e = estimate(plan); const fix = !e.fits ? smallestFix(plan) : null;
  const go = () => {
    const r = crucible.submitJob(role, { ...f, gpus: plan.gpus, card: `${plan.gpuGb} GB card`, memRequestGb: plan.gpus * plan.gpuGb, plan });
    if (!r.ok) { setErr(r.error); return; }
    toast(`Submitted ${r.value.name}`); onClose();
  };
  return (
    <Modal open onClose={onClose} title="Submit job" wide footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={go}>Submit job</Button></>}>
      <div className="space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Job name" hint="Lowercase letters, digits and hyphens."><Input value={f.name} onChange={(x) => setF({ ...f, name: x.target.value })} placeholder="llama3-8b-lora-r32" /></Field>
          <Field label="Experiment"><Select value={f.experimentId} onChange={(x) => setF({ ...f, experimentId: x.target.value })}>{experiments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
          <Field label="Queue" hint={QUEUE_HELP[f.queue]}><Select value={f.queue} onChange={(x) => setF({ ...f, queue: x.target.value as Queue })}><option value="interactive">Interactive</option><option value="default">Default</option><option value="batch">Batch</option></Select></Field>
          <Field label="Container image"><Input value={f.image} onChange={(x) => setF({ ...f, image: x.target.value })} /></Field>
        </div>
        <Field label="Command"><Input value={f.command} onChange={(x) => setF({ ...f, command: x.target.value })} /></Field>
        <div className="border-t border-border pt-5">
          <h3 className="text-sm font-semibold text-text-primary mb-1">Memory check</h3>
          <p className="text-xs text-text-tertiary mb-4">The job is only queued when the plan fits. The GPU count and card below are what it asks for.</p>
          <div className="grid md:grid-cols-2 gap-6">
            <PlanForm value={plan} onChange={setPlan} />
            <div className="space-y-4"><BreakdownView input={plan} />
              {fix && fix.steps.length > 0 && <Notice tone="warn" title="This would not fit">{fix.steps.map((s) => s.label.toLowerCase()).join(", then ")} brings it to {gb(fix.finalTotalGb, 0)}.<div className="mt-2"><Button variant="secondary" className="h-8" onClick={() => setPlan(fix.final)}>Apply the change</Button></div></Notice>}
            </div>
          </div>
        </div>
        {err && <Notice tone="bad">{err}</Notice>}
      </div>
    </Modal>
  );
}
