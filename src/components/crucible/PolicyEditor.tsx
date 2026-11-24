"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Toggle } from "@/components/ui/Form";
import { Modal, Notice, useRole } from "@/components/mlops/ui";
import { APPROVAL_LABEL, TRIGGER_LABEL, validatePolicy } from "@/lib/crucible/ct";
import { crucible, useCrucible } from "@/lib/crucible/store";
import { DATASETS } from "@/lib/crucible/sample";
import type { Approval, CtPolicy, Tier, Trigger, TriggerKind, Window } from "@/lib/crucible/types";
import { toast } from "@/lib/mlops/toast";

const KINDS: TriggerKind[] = ["dataset-version", "rows", "stream-window", "schedule", "drift", "manual"];
const DETAIL_HINT: Record<TriggerKind, string> = { "dataset-version": "Dataset name", rows: "Label", "stream-window": "Describe the window", schedule: "Five field schedule, for example 0 2 * * 1", drift: "Alert name", manual: "A person" };

export function blankPolicy(experimentId: string, model: string): CtPolicy {
  return {
    id: `ctp-${Date.now().toString(36)}`, name: "", model, experimentId, state: "draft", source: Object.values(DATASETS)[0].name,
    triggers: [{ kind: "dataset-version", detail: Object.values(DATASETS)[0].name }, { kind: "manual", detail: "A person" }], window: { kind: "rolling", value: 90 },
    gates: { metric: "f1_macro", floor: 0.9, noSliceRegression: true, maxFairnessGap: 0.05, maxMemoryGb: 24, maxP95Ms: 100 }, approval: "person", tier: "standard",
    budget: { monthlyUsd: 200, spentUsd: 0 }, maxCyclesPerDay: 2, champion: { version: 1, metric: 0.9 }, owner: "nestor@nexi.com", createdAt: new Date().toISOString(),
  };
}

export function PolicyEditor({ initial, onClose }: { initial: CtPolicy; onClose: () => void }) {
  const { experiments, policies } = useCrucible(); const role = useRole();
  const isNew = !policies.some((x) => x.id === initial.id);
  const [p, setP] = useState<CtPolicy>(initial);
  const [err, setErr] = useState<string | null>(null);
  const issues = useMemo(() => validatePolicy(p), [p]);
  const has = (k: TriggerKind) => p.triggers.find((t) => t.kind === k);
  const flip = (k: TriggerKind) => setP({ ...p, triggers: has(k) ? p.triggers.filter((t) => t.kind !== k) : [...p.triggers, { kind: k, detail: k === "manual" ? "A person" : "", ...(k === "rows" ? { minRows: 20000 } : {}) } as Trigger] });
  const setT = (k: TriggerKind, patch: Partial<Trigger>) => setP({ ...p, triggers: p.triggers.map((t) => (t.kind === k ? { ...t, ...patch } : t)) });
  const num = (v: string, d: number) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const save = (state: CtPolicy["state"]) => {
    const r = crucible.savePolicy(role, { ...p, state });
    if (!r.ok) { setErr(r.error); return; }
    toast(`${isNew ? "Created" : "Saved"} ${p.name}`); onClose();
  };
  const errs = issues.filter((i) => i.level === "error"); const warns = issues.filter((i) => i.level === "warning");

  return (
    <Modal open onClose={onClose} wide title={isNew ? "New continuous training policy" : `Edit ${initial.name}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="secondary" onClick={() => save("draft")}>Save as draft</Button><Button variant="primary" onClick={() => save("active")}>Save and activate</Button></>}>
      <div className="space-y-6">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Policy name" hint="Lowercase letters, digits and hyphens."><Input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
          <Field label="Experiment"><Select value={p.experimentId} onChange={(e) => { const x = experiments.find((y) => y.id === e.target.value); setP({ ...p, experimentId: e.target.value, model: x?.model ?? p.model }); }}>{experiments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
          <Field label="Registered model"><Input value={p.model} onChange={(e) => setP({ ...p, model: e.target.value })} /></Field>
          <Field label="Refinery dataset it learns from"><Select value={p.source} onChange={(e) => setP({ ...p, source: e.target.value })}>{Array.from(new Set(Object.values(DATASETS).map((d) => d.name))).map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field>
        </div>

        <section>
          <h3 className="text-sm font-semibold text-text-primary mb-1">What starts a cycle</h3>
          <p className="text-xs text-text-tertiary mb-3">Each kind appears once. The same event never starts two cycles.</p>
          <div className="divide-y divide-border border-y border-border">
            {KINDS.map((k) => { const t = has(k); return (
              <div key={k} className="py-2.5">
                <label className="flex items-center gap-2.5 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#02F5A1]" checked={!!t} onChange={() => flip(k)} /> {TRIGGER_LABEL[k]}</label>
                {t && k !== "manual" && (
                  <div className="mt-2 pl-6 grid sm:grid-cols-2 gap-3">
                    {k === "rows" && <Field label="Minimum new rows"><Input type="number" min={1} value={t.minRows ?? ""} onChange={(e) => setT(k, { minRows: num(e.target.value, 0) })} /></Field>}
                    <Field label={k === "schedule" ? "Schedule" : "Detail"}><Input value={t.detail} placeholder={DETAIL_HINT[k]} onChange={(e) => setT(k, { detail: e.target.value })} /></Field>
                  </div>
                )}
              </div>
            ); })}
          </div>
        </section>

        <section className="grid sm:grid-cols-3 gap-4">
          <Field label="Training window"><Select value={p.window.kind} onChange={(e) => setP({ ...p, window: { ...p.window, kind: e.target.value as Window["kind"] } })}><option value="rolling">Rolling, days</option><option value="expanding">Expanding, weeks</option><option value="latest-n">Latest, windows</option></Select></Field>
          <Field label="Size"><Input type="number" min={1} value={p.window.value} onChange={(e) => setP({ ...p, window: { ...p.window, value: num(e.target.value, 1) } })} /></Field>
          <Field label="Cycles a day, at most"><Input type="number" min={1} max={24} value={p.maxCyclesPerDay} onChange={(e) => setP({ ...p, maxCyclesPerDay: num(e.target.value, 1) })} /></Field>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-text-primary mb-3">Gates a candidate must pass</h3>
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Metric"><Input value={p.gates.metric} onChange={(e) => setP({ ...p, gates: { ...p.gates, metric: e.target.value } })} /></Field>
            <Field label="Limit" hint="Lowest for most metrics, highest for error metrics."><Input type="number" step="any" value={p.gates.floor} onChange={(e) => setP({ ...p, gates: { ...p.gates, floor: num(e.target.value, 0) } })} /></Field>
            <Field label="Fairness gap, at most"><Input type="number" step="0.01" min={0} value={p.gates.maxFairnessGap} onChange={(e) => setP({ ...p, gates: { ...p.gates, maxFairnessGap: num(e.target.value, 0) } })} /></Field>
            <Field label="Serving memory, GB at most"><Input type="number" min={1} value={p.gates.maxMemoryGb} onChange={(e) => setP({ ...p, gates: { ...p.gates, maxMemoryGb: num(e.target.value, 1) } })} /></Field>
            <Field label="p95 latency, ms at most"><Input type="number" min={1} value={p.gates.maxP95Ms} onChange={(e) => setP({ ...p, gates: { ...p.gates, maxP95Ms: num(e.target.value, 1) } })} /></Field>
          </div>
          <div className="mt-2"><Toggle label="No slice may get worse" description="A model can improve on average and get worse for one group of customers." checked={p.gates.noSliceRegression} onChange={(v) => setP({ ...p, gates: { ...p.gates, noSliceRegression: v } })} /></div>
        </section>

        <section className="grid sm:grid-cols-3 gap-4">
          <Field label="Model risk tier"><Select value={p.tier} onChange={(e) => setP({ ...p, tier: e.target.value as Tier })}><option value="low">Low</option><option value="standard">Standard</option><option value="high">High</option></Select></Field>
          <Field label="Approval"><Select value={p.approval} onChange={(e) => setP({ ...p, approval: e.target.value as Approval })}>{(Object.keys(APPROVAL_LABEL) as Approval[]).map((a) => <option key={a} value={a}>{APPROVAL_LABEL[a]}</option>)}</Select></Field>
          <Field label="Monthly budget, USD"><Input type="number" min={1} value={p.budget.monthlyUsd} onChange={(e) => setP({ ...p, budget: { ...p.budget, monthlyUsd: num(e.target.value, 1) } })} /></Field>
        </section>

        {errs.length > 0 && <Notice tone="bad" title="Fix these before saving">{errs.map((i) => <div key={i.path + i.message}>{i.message}</div>)}</Notice>}
        {warns.length > 0 && <Notice tone="warn" title="Worth a second look">{warns.map((i) => <div key={i.path + i.message}>{i.message}</div>)}</Notice>}
        {err && <Notice tone="bad">{err}</Notice>}
      </div>
    </Modal>
  );
}
