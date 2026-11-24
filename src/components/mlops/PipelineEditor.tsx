"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, ClipboardCheck, Cloud, Loader2, Play, Plus, Redo2, Save, Undo2, Wand2, Workflow } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input, Segmented, Select } from "@/components/ui/Form";
import { OP_BY_KIND, OPERATORS, OPERATOR_FAMILY, PORT_LABEL } from "@/lib/mlops/operators";
import { can } from "@/lib/mlops/rbac";
import { mlops, useMlops, useMlopsStatus } from "@/lib/mlops/store";
import { autoAssignConnections, addNode, autoConnect, autoLayoutSpec, clone, connectPorts, removeEdge, removeNode, runBlockers, specDigest, topoOrder, updateNode, validateSpec, type PipelineSpec, type SpecNode } from "@/lib/mlops/spec";
import { TEMPLATES, fromTemplate } from "@/lib/mlops/templates";
import { toast } from "@/lib/mlops/toast";
import { ENVS, ENV_LABEL, type Env } from "@/lib/mlops/types";
import { FlowCanvas, type CanvasHandle, type Sel } from "./FlowCanvas";
import { NodeConfig } from "./NodeConfig";
import { OperatorPalette } from "./OperatorPalette";
import { ReviewPanel } from "./ReviewPanel";
import { Confirm, EnvBadge, Modal, Notice } from "./ui";
import { RunDialog, type RunChoice } from "./RunDialog";
import { usePaymentGate } from "@/components/billing/PaymentGate";

/** Where this editor lives. The Pipeline Studio and the MLOps section share one editor and one store, so a pipeline saved in either appears in both. */
const route = (base: string, id: string, m: "builder" | "wizard") => (base === "/pipeline-studio" ? `${base}/${id}${m === "wizard" ? "/wizard" : ""}` : `${base}/${id}/${m === "builder" ? "edit" : "wizard"}`);

export function PipelineEditor({ pipelineId, mode, base = "/mlops/pipelines" }: { pipelineId: string; mode: "builder" | "wizard"; base?: string }) {
  const s = useMlops()!;
  const live = useMlopsStatus().mode === "live";
  const router = useRouter();
  const gate = usePaymentGate();
  const rec = s.pipelines.find((p) => p.id === pipelineId);
  const initial = useMemo(() => clone(rec?.draft?.spec ?? rec?.versions[0]?.spec ?? null), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [spec, setSpecState] = useState<PipelineSpec | null>(initial);
  const [past, setPast] = useState<PipelineSpec[]>([]);
  const [future, setFuture] = useState<PipelineSpec[]>([]);
  const [sel, setSel] = useState<Sel>(null);
  const [step, setStep] = useState<number>(rec?.draft?.step ?? 0);
  const [saved, setSaved] = useState<"saved" | "saving" | "idle">("idle");
  const [fitKey, setFitKey] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [note, setNote] = useState("");
  const [runOpen, setRunOpen] = useState(false);
  const [confirmTemplate, setConfirmTemplate] = useState<string | null>(null);
  const [addKind, setAddKind] = useState("");
  const [addAfter, setAddAfter] = useState("");
  const canvas = useRef<CanvasHandle>(null);
  const first = useRef(true);
  const role = s.role;

  const edit = can(role, "pipeline.edit", spec?.environment);
  const readOnly = !edit.ok;

  const issues = useMemo(() => (spec ? validateSpec(spec, { connections: s.connections, agents: s.agents }) : []), [spec, s.connections, s.agents]);
  const issueMap = useMemo(() => {
    const m: Record<string, "error" | "warn" | "info"> = {};
    issues.forEach((i) => { if (i.nodeId && i.level !== "info") m[i.nodeId] = i.level === "error" || m[i.nodeId] === "error" ? "error" : "warn"; });
    return m;
  }, [issues]);
  const errs = issues.filter((i) => i.level === "error").length, warns = issues.filter((i) => i.level === "warn").length;

  const commit = useCallback((next: PipelineSpec, record = true) => {
    setSpecState((prev) => { if (record && prev) setPast((p) => [...p.slice(-59), prev]); return next; });
    if (record) setFuture([]);
  }, []);

  const undo = () => setPast((p) => { if (!p.length || !spec) return p; setFuture((f) => [spec, ...f]); setSpecState(p[p.length - 1]); return p.slice(0, -1); });
  const redo = () => setFuture((f) => { if (!f.length || !spec) return f; setPast((p) => [...p, spec]); setSpecState(f[0]); return f.slice(1); });

  // Autosave the working copy as a draft. Both modes edit this one document.
  useEffect(() => {
    if (!spec || readOnly) return;
    if (first.current) { first.current = false; return; }
    setSaved("saving");
    const t = setTimeout(async () => { await mlops.saveDraft(pipelineId, spec, step); setSaved("saved"); }, 500);
    return () => clearTimeout(t);
  }, [spec, step, pipelineId, readOnly]);

  const flush = async () => { if (spec && !readOnly) await mlops.saveDraft(pipelineId, spec, step); };

  if (!rec || !spec) return (<div className="p-8 text-center text-sm text-text-secondary">This pipeline does not exist or has no content. <Link className="underline" href={base === "/pipeline-studio" ? base : "/mlops/pipelines"}>Back to pipelines</Link></div>);

  const node = sel?.type === "node" ? spec.nodes.find((n) => n.id === sel.id) : undefined;
  const latest = rec.versions[0];
  const dirty = !latest || specDigest(latest.spec) !== specDigest(spec);
  const blockers = runBlockers(spec, issues);

  const addOp = (kind: string, x?: number, y?: number) => {
    if (readOnly) return;
    const c = canvas.current?.center() ?? { x: 200, y: 200 };
    const r = addNode(spec, kind, x ?? c.x - 94, y ?? c.y - 24);
    commit(r.spec);
    setSel({ type: "node", id: r.id });
  };

  const toggleMode = (m: "builder" | "wizard") => {
    flush();
    const errs = issues.filter((i) => i.level === "error").length;
    toast(`${m === "wizard" ? "Wizard" : "Builder"} view of the same pipeline: ${spec.nodes.length} operators, ${spec.edges.length} connections, ${errs ? `${errs} blocking issue${errs > 1 ? "s" : ""}` : "no blocking issues"}.`);
    router.push(route(base, pipelineId, m));
  };

  const changeEnv = (env: Env) => {
    const cleared = { ...spec, environment: env, nodes: spec.nodes.map((n) => ({ ...n, connection: undefined })) };
    const r = autoAssignConnections(cleared, s.connections);
    commit(r.spec);
    toast(`Environment set to ${ENV_LABEL[env]}. Connections do not cross environments, so they were cleared and ${r.assigned} suggested. Review them.`, "info");
  };

  const doPublish = () => gate("save", async () => {
    flush();
    const r = await mlops.publish(pipelineId, note);
    if (r.ok) { toast(`Published version ${r.version}. It is immutable.`); setPublishOpen(false); setNote(""); } else toast(r.error, "error");
  });

  const doRun = async (c: RunChoice) => {
    await flush();
    if (c.kind === "simulate") {
      const draftRun = c.source === "draft" || !latest;
      const r = await mlops.startRun(pipelineId, draftRun ? 0 : latest!.version, "manual", "demo", c.injectAt ? { fail: { nodeId: c.injectAt, kind: "fail" } } : {});
      if (r.ok) { setRunOpen(false); router.push(`/mlops/runs/${r.id}`); } else toast(r.error, "error");
      return;
    }
    if (!latest) return;
    gate("run-environment", async () => {
      const r = await mlops.startRun(pipelineId, latest.version, "manual", "real");
      if (r.ok) { setRunOpen(false); router.push(`/mlops/runs/${r.id}`); } else toast(r.error, "error");
    });
  };

  // ------------------------------------------------------------------ toolbar
  const toolbar = (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border bg-surface">
      <Link href={base === "/pipeline-studio" ? base : `/mlops/pipelines/${pipelineId}`} aria-label="Back to pipelines" className="h-8 w-8 grid place-items-center rounded-md hover:bg-surface-muted text-text-secondary"><ArrowLeft size={16} /></Link>
      <div className="min-w-0"><div className="text-sm font-semibold truncate">{rec.name}</div><div className="text-[11px] text-text-tertiary">{latest ? `Based on v${latest.version}${dirty ? ", unpublished changes" : ", no changes"}` : "Draft, never published"}</div></div>
      <EnvBadge env={spec.environment} />
      <div className="flex-1" />
      <span className="text-[11px] text-text-tertiary inline-flex items-center gap-1 w-20 justify-end" aria-live="polite">{saved === "saving" ? <><Loader2 size={11} className="animate-spin" /> Saving</> : saved === "saved" ? <><Cloud size={11} /> Draft saved</> : ""}</span>
      <Segmented value={mode} onChange={toggleMode} options={[{ value: "builder", label: "Builder" }, { value: "wizard", label: "Wizard" }]} />
      {mode === "builder" && (
        <>
          <button aria-label="Undo" title="Undo" disabled={!past.length || readOnly} onClick={undo} className="h-8 w-8 grid place-items-center rounded-md hover:bg-surface-muted disabled:opacity-40"><Undo2 size={15} /></button>
          <button aria-label="Redo" title="Redo" disabled={!future.length || readOnly} onClick={redo} className="h-8 w-8 grid place-items-center rounded-md hover:bg-surface-muted disabled:opacity-40"><Redo2 size={15} /></button>
          <Button variant="secondary" aria-label="Tidy layout" title="Tidy layout" disabled={readOnly} onClick={() => { commit(autoLayoutSpec(spec)); setFitKey((k) => k + 1); }}><Wand2 size={14} /> <span className="hidden 2xl:inline">Tidy</span></Button>
        </>
      )}
      <button onClick={() => setReviewOpen(true)} className={clsx("h-8 px-2.5 rounded-md border text-[13px] inline-flex items-center gap-1.5", errs ? "border-status-down/50 text-status-down" : warns ? "border-status-degraded/50 text-[#9A5F05]" : "border-border-strong text-text-secondary")}>
        <ClipboardCheck size={14} /> {errs ? `${errs} error${errs > 1 ? "s" : ""}` : warns ? `${warns} warning${warns > 1 ? "s" : ""}` : "Valid"}
      </button>
      {!readOnly && <Button variant="secondary" onClick={() => gate("save", async () => { await flush(); setSaved("saved"); toast("Pipeline saved. It is kept as a draft until you publish a version."); })}><Save size={14} /> Save</Button>}
      <Button variant="secondary" onClick={() => setPublishOpen(true)} disabled={readOnly || !dirty || errs > 0} title={readOnly ? edit.ok ? "" : edit.reason : errs ? "Fix validation errors first" : !dirty ? "No changes to publish" : undefined}><Cloud size={14} /> Publish</Button>
      <Button variant="primary" onClick={() => setRunOpen(true)} disabled={!spec.nodes.length} title={!spec.nodes.length ? "Add an operator first" : "Simulate for free, or run in an environment"}><Play size={14} /> Run</Button>
    </div>
  );

  // ------------------------------------------------------------------ inspector
  const inspector = node ? (
    <NodeConfig spec={spec} node={node} connections={s.connections} readOnly={readOnly}
      onChange={(p) => commit(updateNode(spec, node.id, p as Partial<SpecNode>))}
      onConnect={(a, ap, b, bp) => { const r = connectPorts(spec, a, ap, b, bp); r.error ? toast(r.error, "error") : commit(r.spec); }}
      onSpec={(n) => commit(n)} onDelete={() => { commit(removeNode(spec, node.id)); setSel(null); }} />
  ) : sel?.type === "edge" ? (
    <div className="space-y-3 text-[13px]"><p className="text-text-secondary">Connection {sel.id}</p>{!readOnly && <Button variant="secondary" className="text-status-down" onClick={() => { commit(removeEdge(spec, sel.id)); setSel(null); }}>Remove connection</Button>}</div>
  ) : (
    <div className="space-y-4 text-[13px]">
      <div><h3 className="font-semibold">Pipeline</h3><p className="text-xs text-text-tertiary mt-0.5">Select an operator to configure it.</p></div>
      <Field label="Environment" hint="Connections belong to one environment. Changing it clears and re-suggests them."><Select disabled={readOnly} value={spec.environment} onChange={(e) => changeEnv(e.target.value as Env)}>{ENVS.map((e) => <option key={e} value={e}>{ENV_LABEL[e]}</option>)}</Select></Field>
      <Field label="Description"><textarea disabled={readOnly} value={spec.metadata.description} onChange={(e) => commit({ ...spec, metadata: { ...spec.metadata, description: e.target.value } })} rows={3} className="w-full rounded-md border border-border-strong px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500/40" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Default retries"><Input type="number" min={0} disabled={readOnly} value={spec.defaults.retry.max} onChange={(e) => commit({ ...spec, defaults: { ...spec.defaults, retry: { ...spec.defaults.retry, max: Number(e.target.value) } } })} /></Field>
        <Field label="Default timeout (s)"><Input type="number" min={0} disabled={readOnly} value={spec.defaults.timeoutSec} onChange={(e) => commit({ ...spec, defaults: { ...spec.defaults, timeoutSec: Number(e.target.value) } })} /></Field>
      </div>
      <Button variant="secondary" disabled={readOnly} onClick={() => { const r = autoAssignConnections(spec, s.connections); commit(r.spec); toast(r.assigned ? `Suggested ${r.assigned} connection${r.assigned > 1 ? "s" : ""}. Review them.` : "Nothing to assign. Add compatible connections for this environment.", r.assigned ? "success" : "info"); }}>Suggest connections</Button>
      <div className="text-xs text-text-tertiary">Owner {spec.metadata.owner}. Project {spec.metadata.org}/{spec.metadata.project}.</div>
    </div>
  );

  // ------------------------------------------------------------------ wizard
  const order = topoOrder(spec);
  const STEP_FIXED_BEFORE = 3; // Goal, Basics, Operators
  const steps = [{ id: "goal", label: "Goal" }, { id: "basics", label: "Basics" }, { id: "ops", label: "Operators" }, ...order.map((id) => ({ id, label: spec.nodes.find((n) => n.id === id)?.name ?? id })), { id: "review", label: "Review and publish" }];
  const cur = Math.min(step, steps.length - 1);
  const curId = steps[cur].id;
  const wNode = spec.nodes.find((n) => n.id === curId);
  const stepErrs = (id: string) => issues.filter((i) => i.nodeId === id && i.level === "error").length;

  const wizard = (
    <div className="flex flex-col lg:flex-row flex-1 min-h-0">
      <nav aria-label="Wizard steps" className="lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-border overflow-y-auto p-3 max-h-48 lg:max-h-none">
        <ol className="space-y-0.5">
          {steps.map((st, i) => {
            const bad = i >= STEP_FIXED_BEFORE && st.id !== "review" && stepErrs(st.id) > 0;
            const done = i < cur && !bad;
            return (
              <li key={st.id}>
                <button onClick={() => setStep(i)} aria-current={i === cur ? "step" : undefined} className={clsx("w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left text-[13px]", i === cur ? "bg-emph text-on-emph" : "hover:bg-surface-muted text-text-secondary")}>
                  <span className={clsx("h-5 w-5 rounded-full text-[11px] grid place-items-center shrink-0 tabular-nums", i === cur ? "bg-on-emph/20" : done ? "bg-accent-600 text-ink-800" : bad ? "bg-status-down text-white" : "border border-border-strong")}>{done ? <Check size={11} /> : i + 1}</span>
                  <span className="truncate">{st.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="flex-1 min-w-0 overflow-y-auto p-5 lg:p-7">
        <div className="max-w-2xl space-y-5">
          {curId === "goal" && (
            <>
              <div><h2 className="text-lg font-semibold tracking-tight">What do you want to do?</h2><p className="text-sm text-text-secondary mt-1">Pick a starting point. You can add, remove and reorder anything afterwards, and switch to the visual builder at any time. Both edit the same spec.</p></div>
              <div className="grid sm:grid-cols-2 gap-3">
                {TEMPLATES.map((t) => (
                  <button key={t.id} disabled={readOnly} onClick={() => spec.nodes.length ? setConfirmTemplate(t.id) : applyTemplate(t.id)} className="text-left rounded-lg border border-border hover:border-border-strong bg-surface p-4 disabled:opacity-50">
                    <div className="text-sm font-semibold">{t.title}</div><p className="text-[13px] text-text-secondary mt-1">{t.summary}</p>
                    <p className="font-hand text-[17px] text-note mt-2 leading-snug">{t.story}</p>
                    <div className="mt-2 flex flex-wrap gap-1">{t.tags.map((x) => <Badge key={x}>{x}</Badge>)}</div>
                  </button>
                ))}
              </div>
              {spec.nodes.length > 0 && <p className="text-xs text-text-tertiary">This pipeline already has {spec.nodes.length} operators. Choosing a template replaces them after you confirm.</p>}
            </>
          )}

          {curId === "basics" && (
            <>
              <div><h2 className="text-lg font-semibold tracking-tight">Basics</h2><p className="text-sm text-text-secondary mt-1">Where this pipeline runs and how it behaves by default.</p></div>
              <Field label="Name" hint="Fixed once created, so history and audit stay attached."><Input value={rec.name} disabled /></Field>
              <Field label="Environment" hint="Operators can only use connections from this environment."><Select disabled={readOnly} value={spec.environment} onChange={(e) => changeEnv(e.target.value as Env)}>{ENVS.map((e) => <option key={e} value={e}>{ENV_LABEL[e]}</option>)}</Select></Field>
              {spec.environment === "production" && <Notice tone="warn" title="Production">Deploy operators need an approval gate upstream. Runs need the approver role.</Notice>}
              <Field label="Description"><textarea disabled={readOnly} value={spec.metadata.description} onChange={(e) => commit({ ...spec, metadata: { ...spec.metadata, description: e.target.value } })} rows={3} className="w-full rounded-md border border-border-strong px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500/40" /></Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Default retries"><Input type="number" min={0} disabled={readOnly} value={spec.defaults.retry.max} onChange={(e) => commit({ ...spec, defaults: { ...spec.defaults, retry: { ...spec.defaults.retry, max: Number(e.target.value) } } })} /></Field>
                <Field label="Backoff (ms)"><Input type="number" min={0} disabled={readOnly} value={spec.defaults.retry.backoffMs} onChange={(e) => commit({ ...spec, defaults: { ...spec.defaults, retry: { ...spec.defaults.retry, backoffMs: Number(e.target.value) } } })} /></Field>
                <Field label="Timeout (s)"><Input type="number" min={0} disabled={readOnly} value={spec.defaults.timeoutSec} onChange={(e) => commit({ ...spec, defaults: { ...spec.defaults, timeoutSec: Number(e.target.value) } })} /></Field>
              </div>
            </>
          )}

          {curId === "ops" && (
            <>
              <div><h2 className="text-lg font-semibold tracking-tight">Operators</h2><p className="text-sm text-text-secondary mt-1">The steps this pipeline performs, in dependency order. Add what you need, then configure each one in the next steps.</p></div>
              <ol className="border border-border rounded-md divide-y divide-border">
                {order.map((id, i) => { const n = spec.nodes.find((x) => x.id === id)!; const op = OP_BY_KIND[n.operator]; return (
                  <li key={id} className="flex items-center gap-3 px-3 py-2.5 text-[13px]"><span className="h-5 w-5 rounded-full bg-surface-muted text-[11px] grid place-items-center tabular-nums">{i + 1}</span><div className="flex-1 min-w-0"><div className="font-medium truncate">{n.name}</div><div className="text-xs text-text-tertiary">{op.label}. {OPERATOR_FAMILY[op.family].label}</div></div>
                    {!readOnly && <button className="text-xs text-text-tertiary hover:text-status-down" onClick={() => commit(removeNode(spec, id))}>Remove</button>}</li>
                ); })}
                {!order.length && <li className="px-3 py-6 text-center text-sm text-text-secondary">No operators yet. Pick a template on the first step or add one below.</li>}
              </ol>
              {!readOnly && (
                <div className="rounded-lg border border-border p-4 space-y-3 bg-surface-subtle">
                  <div className="text-[13px] font-semibold">Add an operator</div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Select aria-label="Operator" value={addKind} onChange={(e) => setAddKind(e.target.value)}><option value="">Choose an operator</option>{(Object.keys(OPERATOR_FAMILY) as (keyof typeof OPERATOR_FAMILY)[]).map((f) => <optgroup key={f} label={OPERATOR_FAMILY[f].label}>{OPERATORS.filter((o) => o.family === f).map((o) => <option key={o.kind} value={o.kind}>{o.label}{o.executable === "none" ? " (draw only)" : ""}</option>)}</optgroup>)}</Select>
                    <Select aria-label="Runs after" value={addAfter} onChange={(e) => setAddAfter(e.target.value)}><option value="">Not connected yet</option>{spec.nodes.filter((n) => OP_BY_KIND[n.operator].outputs.length).map((n) => <option key={n.id} value={n.id}>After {n.name}</option>)}</Select>
                  </div>
                  {addKind && <p className="text-xs text-text-secondary">{OP_BY_KIND[addKind].desc} Needs: {OP_BY_KIND[addKind].inputs.map((p) => PORT_LABEL[p.type]).join(", ") || "nothing"}. Produces: {OP_BY_KIND[addKind].outputs.map((p) => PORT_LABEL[p.type]).join(", ") || "nothing"}.</p>}
                  <Button variant="primary" disabled={!addKind} onClick={() => {
                    const r = addNode(spec, addKind, 0, 0);
                    let ns = r.spec; let err = "";
                    if (addAfter) { const c = autoConnect(ns, addAfter, r.id); if (c.error) err = c.error; else ns = c.spec; }
                    commit(autoLayoutSpec(ns));
                    if (err) toast(`Added, but could not connect: ${err}. Connect it in the builder.`, "info"); else toast("Operator added");
                    setAddKind(""); setAddAfter("");
                  }}><Plus size={14} /> Add</Button>
                </div>
              )}
            </>
          )}

          {wNode && (
            <>
              <div><div className="text-xs text-text-tertiary">Step {cur + 1} of {steps.length}</div><h2 className="text-lg font-semibold tracking-tight">{wNode.name}</h2></div>
              <WhyBox spec={spec} node={wNode} />
              <NodeConfig spec={spec} node={wNode} connections={s.connections} readOnly={readOnly} showEffective
                onChange={(p) => commit(updateNode(spec, wNode.id, p as Partial<SpecNode>))}
                onConnect={(a, ap, b, bp) => { const r = connectPorts(spec, a, ap, b, bp); r.error ? toast(r.error, "error") : commit(r.spec); }}
                onSpec={(n) => commit(n)} onDelete={() => { commit(removeNode(spec, wNode.id)); setStep(Math.max(2, cur - 1)); }} />
            </>
          )}

          {curId === "review" && (
            <>
              <div><h2 className="text-lg font-semibold tracking-tight">Review and publish</h2><p className="text-sm text-text-secondary mt-1">Check validation, read the plan and the generated manifests, then publish an immutable version. Running it is a separate, confirmed step.</p></div>
              <ReviewPanel spec={spec} issues={issues} connections={s.connections} onSelectNode={(id) => setStep(steps.findIndex((x) => x.id === id))} />
              <div className="flex flex-wrap gap-2 pt-2">
                <Button variant="primary" disabled={readOnly || errs > 0 || !dirty} onClick={() => setPublishOpen(true)}><Save size={14} /> Publish version</Button>
                <Button disabled={!spec.nodes.length} onClick={() => setRunOpen(true)}><Play size={14} /> Run or simulate</Button>
                <Button variant="ghost" onClick={() => toggleMode("builder")}><Workflow size={14} /> Open in builder</Button>
              </div>
              {errs > 0 && <p className="text-xs text-status-down">Publishing is blocked until the errors above are fixed. Select an error to jump to its step.</p>}
              {!errs && dirty && <p className="text-xs text-text-tertiary">After publishing, the Run button uses that version. Post-deploy verification runs as the Verify operator and its observed results appear on the run.</p>}
            </>
          )}

          <div className="flex justify-between pt-3 border-t border-border">
            <Button variant="secondary" disabled={cur === 0} onClick={() => setStep(cur - 1)}><ChevronLeft size={14} /> Back</Button>
            {cur < steps.length - 1 && <Button variant="primary" onClick={() => setStep(cur + 1)}>Next <ChevronRight size={14} /></Button>}
          </div>
        </div>
      </div>

      <aside className="hidden xl:flex w-[340px] shrink-0 flex-col border-l border-border bg-surface-subtle" aria-label="Pipeline so far">
        <div className="px-3 py-2.5 border-b border-border">
          <div className="text-[13px] font-semibold">Pipeline so far</div>
          <div className="text-xs text-text-secondary">{spec.nodes.length} operators, {spec.edges.length} connections{errs ? `, ${errs} to fix` : ""}. The same pipeline the builder draws, in run order.</div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          {spec.nodes.length === 0 ? (
            <p className="text-xs text-text-tertiary px-4 py-10 text-center">Nothing yet. Choose a starting point or add operators and they appear here.</p>
          ) : (
            <ol className="space-y-0">
              {topoOrder(spec).map((id, k, all) => {
                const n = spec.nodes.find((x) => x.id === id)!; const op = OP_BY_KIND[n.operator];
                const after = spec.edges.filter((e) => e.to === id).map((e) => spec.nodes.find((x) => x.id === e.from)?.name).filter(Boolean);
                const bad = stepErrs(id); const here = id === curId;
                return (
                  <li key={id}>
                    <button onClick={() => { const i = steps.findIndex((st) => st.id === id); if (i >= 0) setStep(i); }} aria-current={here ? "step" : undefined}
                      className={clsx("w-full text-left rounded-md border px-2.5 py-2", here ? "border-emph bg-surface shadow-card" : "border-border bg-surface hover:border-border-strong")}>
                      <div className="flex items-center gap-2"><span className="text-[13px] font-medium truncate flex-1">{n.name}</span>{bad > 0 && <Badge tone="down">{bad}</Badge>}</div>
                      <div className="text-[11px] text-text-tertiary truncate">{op.label}{op.summary ? `: ${op.summary(n.config)}` : ""}</div>
                      {after.length > 1 && <div className="text-[11px] text-text-tertiary truncate">after {after.join(", ")}</div>}
                    </button>
                    {k < all.length - 1 && <div className="h-3 ml-4 border-l border-dashed border-border-strong" aria-hidden />}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
        <div className="px-3 py-2 border-t border-border">
          <Button variant="secondary" onClick={() => toggleMode("builder")}><Workflow size={14} /> Open in builder</Button>
        </div>
      </aside>
    </div>
  );

  function applyTemplate(id: string) {
    const t = TEMPLATES.find((x) => x.id === id)!;
    let n = fromTemplate(id, id === "blank" ? spec!.environment : t.defaultEnv, rec!.name);
    n.metadata = { ...n.metadata, description: t.summary, owner: spec!.metadata.owner };
    n = autoAssignConnections(n, s.connections).spec;
    commit(n);
    setSel(null); setFitKey((k) => k + 1); setStep(1);
    toast(`Loaded "${t.title}". Connections were suggested from ${ENV_LABEL[n.environment]}. Review them in each step.`, "info");
  }

  return (
    <div className="flex flex-col h-[calc(100vh-9.5rem)] min-h-[620px] rounded-lg border border-border bg-surface overflow-hidden shadow-card"
      onKeyDown={(e) => { if (mode !== "builder") return; const el = e.target as HTMLElement; if (/INPUT|TEXTAREA|SELECT/.test(el.tagName)) return; if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); } }}>
      {toolbar}
      {readOnly && <div className="px-3 py-2 border-b border-border bg-surface-subtle text-xs text-text-secondary">Read-only: {edit.ok ? "" : edit.reason} Switch the role at the top of the page to edit.</div>}
      {mode === "builder" ? (
        <div className="flex flex-col lg:flex-row flex-1 min-h-0">
          <aside className="hidden lg:block w-60 shrink-0 border-r border-border min-h-0" aria-label="Operators"><OperatorPalette onAdd={(k) => addOp(k)} disabled={readOnly} /></aside>
          <div className="relative flex-1 min-h-[360px]">
            <FlowCanvas ref={canvas} spec={spec} selection={sel} onSelect={setSel} readOnly={readOnly} issues={issueMap} fitKey={fitKey} label={`${rec.name} pipeline canvas`}
              onMoveStart={() => setPast((p) => [...p.slice(-59), spec])}
              onMoveNode={(id, x, y) => commit(updateNode(spec, id, { x, y }), false)}
              onConnect={(a, ap, b, bp) => { const r = connectPorts(spec, a, ap, b, bp); r.error ? toast(r.error, "error") : commit(r.spec); }}
              onReject={(m) => toast(m, "error")}
              onDropOperator={(k, x, y) => addOp(k, x, y)}
              onDelete={(d) => { if (d.type === "node") { commit(removeNode(spec, d.id)); setSel(null); } }} />
          </div>
          <aside className="lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-border overflow-y-auto p-4 max-h-[50vh] lg:max-h-none" aria-label="Configuration">{inspector}</aside>
        </div>
      ) : wizard}

      <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} wide title="Review pipeline">
        <ReviewPanel spec={spec} issues={issues} connections={s.connections} onSelectNode={(id) => { setSel({ type: "node", id }); setReviewOpen(false); if (mode === "wizard") setStep(steps.findIndex((x) => x.id === id)); }} />
      </Modal>

      <Modal open={publishOpen} onClose={() => setPublishOpen(false)} title="Publish version"
        footer={<><Button onClick={() => setPublishOpen(false)}>Cancel</Button><Button variant="primary" onClick={doPublish}>Publish version {(latest?.version ?? 0) + 1}</Button></>}>
        <div className="space-y-3"><Notice tone="info">Published versions are immutable and carry a digest of the spec. Runs execute exactly this version and keep a snapshot of it.</Notice>
          <Field label="What changed"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Short note for the version history" /></Field>
          {warns > 0 && <p className="text-xs text-[#9A5F05]">{warns} warning{warns > 1 ? "s" : ""} remain. They do not block publishing.</p>}</div>
      </Modal>

      <RunDialog open={runOpen} onClose={() => setRunOpen(false)} name={rec.name} env={spec.environment} draft={spec} published={latest} dirty={dirty}
        issues={issues} blockers={blockers} connections={s.connections} live={live} onStart={doRun} />

      <Confirm open={!!confirmTemplate} onClose={() => setConfirmTemplate(null)} danger title="Replace operators?" confirmLabel="Replace" body={<p>The {spec.nodes.length} current operators and their settings will be replaced. You can undo this in the builder.</p>} onConfirm={() => applyTemplate(confirmTemplate!)} />
    </div>
  );
}

function WhyBox({ spec, node }: { spec: PipelineSpec; node: SpecNode }) {
  const op = OP_BY_KIND[node.operator];
  const ups = spec.edges.filter((e) => e.to === node.id).map((e) => ({ from: spec.nodes.find((n) => n.id === e.from)?.name, port: op.inputs.find((p) => p.id === e.toPort) }));
  const downs = spec.edges.filter((e) => e.from === node.id).map((e) => spec.nodes.find((n) => n.id === e.to)?.name);
  return (
    <div className="rounded-md border border-border bg-surface-subtle px-4 py-3 text-[13px] space-y-1.5">
      <p className="text-text-secondary">{op.desc}</p>
      <p><span className="text-text-tertiary">Needs:</span> {ups.length ? ups.map((u, i) => <span key={i}>{i > 0 && ", "}{u.port?.label} from <span className="font-medium">{u.from}</span></span>) : op.inputs.filter((p) => !p.optional).length ? <span className="text-status-down">{op.inputs.filter((p) => !p.optional).map((p) => p.label).join(", ")} (not connected)</span> : "nothing"}</p>
      <p><span className="text-text-tertiary">Feeds:</span> {downs.length ? downs.join(", ") : "nothing downstream"}</p>
      {op.destructive && <p className="text-[#9A5F05]">This operator removes or reverts resources, so a run asks for confirmation.</p>}
      {op.costly && <p className="text-text-tertiary">This operator can consume billable resources. The plan shows an estimate.</p>}
    </div>
  );
}
