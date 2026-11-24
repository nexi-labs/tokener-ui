"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select, Toggle } from "@/components/ui/Form";
import { GuardButton, Notice, useRole } from "@/components/mlops/ui";
import { toast } from "@/lib/mlops/toast";
import { FnIcon } from "./FnIcon";
import { STEP_ICON } from "./ui";
import { WF_KIND_LABEL, WorkflowGraph } from "./WorkflowGraph";
import { MODELS, PROVIDERS } from "@/lib/functions/catalog";
import { saveWorkflow, setWorkflowStatus, validateWorkflow } from "@/lib/functions/store";
import { usd, type FunctionsState, type WfStep, type WfStepKind, type Workflow } from "@/lib/functions/types";

const ADDABLE: WfStepKind[] = ["function", "ai", "condition", "policy", "approval", "connector", "output"];
const DEFAULTS: Record<WfStepKind, () => Pick<WfStep, "name" | "config">> = {
  trigger: () => ({ name: "Trigger", config: {} }),
  function: () => ({ name: "Run function", config: { function: "", timeoutS: 15, onError: "fail" } }),
  ai: () => ({ name: "AI call", config: { provider: "p-anthropic", model: "claude-haiku", maxInputTokens: 1500, maxOutputTokens: 300, temperature: 0.2, promptRef: "" } }),
  condition: () => ({ name: "Condition", config: { expression: "$.score >= 0.8" } }),
  policy: () => ({ name: "Policy check", config: { policy: "pol-approval", mode: "enforce" } }),
  approval: () => ({ name: "Human approval", config: { approverRole: "approver", expiresHours: 4, onTimeout: "reject" } }),
  connector: () => ({ name: "Connector call", config: { connector: "", tool: "", write: false } }),
  output: () => ({ name: "Output", config: { emit: "", format: "json" } }),
};

let seq = 100;

export function WorkflowEditor({ s, w }: { s: FunctionsState; w: Workflow }) {
  const role = useRole();
  const [steps, setSteps] = useState<WfStep[]>(() => w.steps.map((x) => ({ ...x, config: { ...x.config }, branches: x.branches?.map((b) => ({ ...b })) })));
  const [sel, setSel] = useState<string>(steps[0]?.id ?? "");
  const [maxCost, setMaxCost] = useState(String(w.maxCostMicros / 1_000_000)); const [timeout, setTimeoutS] = useState(w.timeoutS); const [desc, setDesc] = useState(w.description);
  const [policyIds, setPolicyIds] = useState(w.policyIds);
  const [err, setErr] = useState<string | null>(null); const [adding, setAdding] = useState(false);
  const problems = useMemo(() => validateWorkflow(steps), [steps]);
  const step = steps.find((x) => x.id === sel);
  const dirty = JSON.stringify(steps) !== JSON.stringify(w.steps) || maxCost !== String(w.maxCostMicros / 1_000_000) || timeout !== w.timeoutS || desc !== w.description || JSON.stringify(policyIds) !== JSON.stringify(w.policyIds);
  const upd = (id: string, p: Partial<WfStep>) => setSteps((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const cfg = (id: string, k: string, v: string | number | boolean) => setSteps((xs) => xs.map((x) => (x.id === id ? { ...x, config: { ...x.config, [k]: v } } : x)));

  const insertAfter = (kind: WfStepKind) => {
    const after = steps.find((x) => x.id === sel) ?? steps[0]; const id = `s${++seq}`;
    const base = DEFAULTS[kind]();
    const isCond = kind === "condition";
    const nextStep: WfStep = { id, kind, ...base, next: kind === "output" ? null : isCond ? null : after.next, branches: isCond ? [{ label: "Yes", when: "true", next: after.next }, { label: "No", when: "false", next: null }] : undefined };
    setSteps((xs) => {
      const i = xs.findIndex((x) => x.id === after.id);
      const copy = xs.map((x) => (x.id === after.id ? (x.kind === "condition" ? x : { ...x, next: id }) : x));
      copy.splice(i + 1, 0, nextStep); return copy;
    });
    setSel(id); setAdding(false);
  };
  const remove = (id: string) => {
    const gone = steps.find((x) => x.id === id)!; if (gone.kind === "trigger") return setErr("The trigger cannot be removed. A workflow always starts with one.");
    const after = gone.next ?? gone.branches?.[0]?.next ?? null;
    setSteps((xs) => xs.filter((x) => x.id !== id).map((x) => ({ ...x, next: x.next === id ? after : x.next, branches: x.branches?.map((b) => (b.next === id ? { ...b, next: after } : b)) })));
    setSel(steps[0].id); setErr(null);
  };
  const save = () => {
    const r = saveWorkflow(w.id, steps, { description: desc, maxCostMicros: Math.round(parseFloat(maxCost || "0") * 1_000_000), timeoutS: timeout, policyIds });
    if (r.ok) { setErr(null); toast(`Saved as revision r${r.revision} (simulated). Activate it to make it the live revision.`, "info"); } else setErr(r.error);
  };
  const nextOptions = steps.filter((x) => x.id !== sel && x.kind !== "trigger");
  const fns = s.functions.filter((f) => f.status !== "draft");

  return (
    <div className="space-y-4">
      <div className="grid xl:grid-cols-[minmax(300px,380px)_1fr] gap-4">
        <Card>
          <CardHeader title="Steps" subtitle="Select a step to edit it. New steps go after the selected one." action={<Button onClick={() => setAdding((v) => !v)} aria-expanded={adding}><Plus size={14} /> Add step</Button>} />
          {adding && (
            <div className="grid grid-cols-2 gap-2 p-3 border-b border-border bg-surface-subtle" role="menu" aria-label="Step type">
              {ADDABLE.map((k) => <button key={k} role="menuitem" onClick={() => insertAfter(k)} className="flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-2 text-[13px] hover:border-accent-600"><FnIcon name={STEP_ICON[k]} size={16} />{WF_KIND_LABEL[k]}</button>)}
            </div>
          )}
          <div className="px-5 py-5"><WorkflowGraph steps={steps} selected={sel} onSelect={setSel} /></div>
        </Card>

        <div className="space-y-4">
          {step ? (
            <Card>
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
                <div className="flex items-center gap-2.5"><FnIcon name={STEP_ICON[step.kind]} size={18} /><div><div className="text-[11px] uppercase tracking-wide text-text-tertiary">{WF_KIND_LABEL[step.kind]}</div><div className="text-sm font-semibold">{step.name}</div></div></div>
                {step.kind !== "trigger" && <Button variant="ghost" onClick={() => remove(step.id)} aria-label={`Remove ${step.name}`}><Trash2 size={14} /> Remove</Button>}
              </div>
              <div className="px-5 py-4 grid sm:grid-cols-2 gap-4">
                <Field label="Step name"><Input value={step.name} onChange={(e) => upd(step.id, { name: e.target.value })} /></Field>
                {step.kind !== "output" && step.kind !== "condition" && (
                  <Field label="Then go to"><Select value={step.next ?? ""} onChange={(e) => upd(step.id, { next: e.target.value || null })}><option value="">Choose a step</option>{nextOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
                )}
                {step.kind === "trigger" && Object.entries(step.config).map(([k, v]) => <Field key={k} label={k}><Input value={String(v)} onChange={(e) => cfg(step.id, k, e.target.value)} className="font-code" /></Field>)}
                {step.kind === "function" && (<>
                  <Field label="Function" hint="Any registered function, including AWS Lambda connectors."><Select value={String(step.config.function ?? "")} onChange={(e) => cfg(step.id, "function", e.target.value)}><option value="">Choose a function</option>{fns.map((f) => <option key={f.id} value={f.name}>{f.name}{f.status !== "active" ? ` (${f.status})` : ""}</option>)}</Select></Field>
                  <Field label="Timeout (seconds)"><Input type="number" min={1} value={Number(step.config.timeoutS ?? 15)} onChange={(e) => cfg(step.id, "timeoutS", +e.target.value)} /></Field>
                  <Field label="If it fails"><Select value={String(step.config.onError ?? "fail")} onChange={(e) => cfg(step.id, "onError", e.target.value)}><option value="fail">Fail the run</option><option value="continue">Continue</option><option value="retry">Retry with the function settings</option></Select></Field>
                </>)}
                {step.kind === "ai" && (<>
                  <Field label="Provider"><Select value={String(step.config.provider)} onChange={(e) => { cfg(step.id, "provider", e.target.value); const m = MODELS.find((x) => x.providerId === e.target.value); if (m) cfg(step.id, "model", m.id); }}>{PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
                  <Field label="Model"><Select value={String(step.config.model)} onChange={(e) => cfg(step.id, "model", e.target.value)}>{MODELS.filter((m) => m.providerId === step.config.provider).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
                  <Field label="Max input tokens"><Input type="number" min={1} value={Number(step.config.maxInputTokens)} onChange={(e) => cfg(step.id, "maxInputTokens", +e.target.value)} /></Field>
                  <Field label="Max output tokens"><Input type="number" min={1} value={Number(step.config.maxOutputTokens)} onChange={(e) => cfg(step.id, "maxOutputTokens", +e.target.value)} /></Field>
                  <Field label="Temperature"><Input type="number" min={0} max={2} step={0.1} value={Number(step.config.temperature)} onChange={(e) => cfg(step.id, "temperature", +e.target.value)} /></Field>
                  <Field label="Prompt reference" hint="A versioned prompt, such as prompts/support-reply@4."><Input value={String(step.config.promptRef ?? "")} onChange={(e) => cfg(step.id, "promptRef", e.target.value)} className="font-code" /></Field>
                </>)}
                {step.kind === "condition" && (<>
                  <div className="sm:col-span-2"><Field label="Expression" hint="Evaluated on the previous step's output."><Input value={String(step.config.expression ?? "")} onChange={(e) => cfg(step.id, "expression", e.target.value)} className="font-code" /></Field></div>
                  {(step.branches ?? []).map((b, i) => (
                    <div key={i} className="sm:col-span-2 grid grid-cols-[110px_1fr] gap-3 items-end">
                      <Field label="Branch"><Input value={b.label} onChange={(e) => upd(step.id, { branches: step.branches!.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} /></Field>
                      <Field label={`When ${b.when}, go to`}><Select value={b.next ?? ""} onChange={(e) => upd(step.id, { branches: step.branches!.map((x, j) => (j === i ? { ...x, next: e.target.value || null } : x)) })}><option value="">Choose a step</option>{nextOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
                    </div>
                  ))}
                </>)}
                {step.kind === "policy" && (<>
                  <Field label="Policy"><Select value={String(step.config.policy)} onChange={(e) => cfg(step.id, "policy", e.target.value)}>{s.policies.filter((p) => p.status === "active").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
                  <Field label="Mode"><Select value={String(step.config.mode)} onChange={(e) => cfg(step.id, "mode", e.target.value)}><option value="enforce">Enforce, stop the run on deny</option><option value="monitor">Monitor, record only</option></Select></Field>
                </>)}
                {step.kind === "approval" && (<>
                  <Field label="Approver role"><Select value={String(step.config.approverRole)} onChange={(e) => cfg(step.id, "approverRole", e.target.value)}><option value="approver">Approver</option><option value="admin">Admin</option></Select></Field>
                  <Field label="Expires after (hours)"><Input type="number" min={1} max={168} value={Number(step.config.expiresHours)} onChange={(e) => cfg(step.id, "expiresHours", +e.target.value)} /></Field>
                  <Field label="If nobody decides"><Select value={String(step.config.onTimeout)} onChange={(e) => cfg(step.id, "onTimeout", e.target.value)}><option value="reject">Reject</option><option value="escalate">Escalate to the next role</option><option value="continue">Continue</option></Select></Field>
                </>)}
                {step.kind === "connector" && (<>
                  <Field label="Connector" hint="A connection from Integrations, an MCP server, or aws_lambda_invoke."><Input value={String(step.config.connector ?? "")} onChange={(e) => cfg(step.id, "connector", e.target.value)} className="font-code" /></Field>
                  <Field label="Operation or tool"><Input value={String(step.config.tool ?? step.config.operation ?? "")} onChange={(e) => cfg(step.id, step.config.operation !== undefined ? "operation" : "tool", e.target.value)} className="font-code" /></Field>
                  <div className="sm:col-span-2"><Toggle checked={!!step.config.write} onChange={(v) => cfg(step.id, "write", v)} label="Writes to another system" description="A writing step needs a policy check or an approval step in the workflow." /></div>
                </>)}
                {step.kind === "output" && (<>
                  <Field label="Emit event"><Input value={String(step.config.emit ?? "")} onChange={(e) => cfg(step.id, "emit", e.target.value)} className="font-code" /></Field>
                  <Field label="Format"><Select value={String(step.config.format ?? "json")} onChange={(e) => cfg(step.id, "format", e.target.value)}><option value="json">JSON</option><option value="text">Text</option></Select></Field>
                </>)}
              </div>
            </Card>
          ) : <Card><p className="p-6 text-sm text-text-secondary">Select a step to edit it.</p></Card>}

          <Card>
            <CardHeader title="Workflow limits and policies" />
            <div className="px-5 py-4 grid sm:grid-cols-3 gap-4">
              <div className="sm:col-span-3"><Field label="Description"><Input value={desc} onChange={(e) => setDesc(e.target.value)} /></Field></div>
              <Field label="Cost ceiling per run (USD)"><Input type="number" min={0} step="0.0001" value={maxCost} onChange={(e) => setMaxCost(e.target.value)} /></Field>
              <Field label="Run timeout (seconds)" hint="Includes time waiting for approval."><Input type="number" min={1} value={timeout} onChange={(e) => setTimeoutS(+e.target.value)} /></Field>
              <div />
              <fieldset className="sm:col-span-3"><legend className="text-[13px] font-medium mb-2">Policies for every step</legend>
                <div className="grid sm:grid-cols-2 gap-1.5">{s.policies.filter((p) => p.status === "active").map((p) => <label key={p.id} className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={policyIds.includes(p.id)} onChange={() => setPolicyIds((x) => (x.includes(p.id) ? x.filter((y) => y !== p.id) : [...x, p.id]))} />{p.name}</label>)}</div>
              </fieldset>
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader title="Validation" subtitle="The backend applies the same rules before it accepts a revision." />
        <div className="px-5 py-3.5 text-[13px]">
          {problems.length === 0 ? <div className="flex items-center gap-2"><Badge tone="healthy">valid</Badge><span className="text-text-secondary">One trigger, every step reachable, every branch resolved.</span></div> : <ul className="list-disc pl-4 space-y-0.5 text-status-down">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        </div>
      </Card>
      {err && <Notice tone="bad" title="Not saved">{err}</Notice>}
      <div className={clsx("sticky bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface shadow-popover px-4 py-3")}>
        <span className="text-[13px] text-text-secondary">{dirty ? "You have unsaved changes." : `Saved. Latest revision r${w.latestRevision}, ${w.activeRevision ? `active r${w.activeRevision}` : "not active"}.`} Ceiling {usd(Math.round(parseFloat(maxCost || "0") * 1_000_000))} per run.</span>
        <div className="flex gap-2">
          <Button disabled={!dirty} onClick={() => { setSteps(w.steps.map((x) => ({ ...x, config: { ...x.config } }))); setMaxCost(String(w.maxCostMicros / 1_000_000)); setTimeoutS(w.timeoutS); setDesc(w.description); setPolicyIds(w.policyIds); setErr(null); }}>Discard</Button>
          <GuardButton action="pipeline.edit" role={role} extraDisabled={!dirty ? "Nothing has changed" : problems.length > 0 ? "Fix the problems listed above first" : undefined} onClick={save}>Save revision</GuardButton>
          <GuardButton action="pipeline.publish" role={role} variant="primary" extraDisabled={dirty ? "Save your changes first" : problems.length > 0 ? "Fix the problems listed above first" : w.activeRevision === w.latestRevision ? "The latest revision is already active" : undefined} onClick={() => { const r = setWorkflowStatus(w.id, "active"); if (r.ok) toast(`r${w.latestRevision} marked active in the preview. Nothing runs yet.`, "info"); else setErr(r.error); }}>Activate latest revision</GuardButton>
        </div>
      </div>
    </div>
  );
}
