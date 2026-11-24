"use client";

import clsx from "clsx";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, Check, Cpu, ListOrdered, Plus, Play, Save, Trash2, Workflow, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select, Toggle } from "@/components/ui/Form";
import { Notice, Tabs } from "@/components/mlops/ui";
import { StepForm, StepPicker } from "@/components/refinery/StepParts";
import { fmtInt, fmtRows, usd, sinkLabel } from "@/components/refinery/bits";
import { DataTable } from "@/components/refinery/DataTable";
import { SchedulePanel } from "@/components/refinery/SchedulePanel";
import { RunWindow } from "@/components/refinery/RunWindow";
import { AssistantBar } from "@/components/refinery/AssistantBar";
import { GROUP_STYLE, PipelineCanvas } from "@/components/refinery/PipelineCanvas";
import { CONNECTOR_BY_ID } from "@/lib/refinery/connectors";
import { LakeOptionsForm } from "@/components/refinery/LakeOptions";
import { DEFAULT_LAKE, checkLake } from "@/lib/refinery/lake";
import { useServerSetting } from "@/lib/refinery/settingsSync";
import { policyKey, DEFAULT_POLICY, checkRecipe, loadPolicy, runBlock, type Policy } from "@/lib/refinery/sovereignty";
import { FORMAT_GUIDE, conversionNote, recommendFormat, type Goal } from "@/lib/refinery/formats";
import { ENGINES, suggestEngine, type NativeCheck } from "@/lib/refinery/engines";
import { STEP_BY_OP, describe, estimateAiStep, newStep, planPartitions, runSteps, startFrame, validateStep } from "@/lib/refinery/steps";
import { nativeRunCheck, newStepId, refinery, useRefinery, useRefineryStatus } from "@/lib/refinery/store";
import { toast } from "@/lib/mlops/toast";
import type { FileFormat, LakeOptions, OutputSink, Recipe } from "@/lib/refinery/types";

const SHOWN_ROWS = 30;
const fmtCell = (v: unknown) => (v === null || v === undefined || v === "" ? null : typeof v === "boolean" ? (v ? "true" : "false") : String(v));

export default function RecipePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { recipes, datasets, pools, connections, nativeLimits } = useRefinery();
  const isLive = useRefineryStatus().mode === "live";
  const stored = recipes.find((r) => r.id === id);
  const [draft, setDraft] = useState<Recipe | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [picker, setPicker] = useState(false);
  const [insAt, setInsAt] = useState<number | null>(null);
  const [win, setWin] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [goal, setGoal] = useState<Goal>("tabular");
  const [view, setView] = useState<"wizard" | "pipeline">("pipeline");
  useEffect(() => { try { const v = localStorage.getItem("refinery.recipe.view"); if (v === "wizard" || v === "pipeline") setView(v); } catch {} }, []);
  const pickView = (v: "wizard" | "pipeline") => { setView(v); try { localStorage.setItem("refinery.recipe.view", v); } catch {} };
  const [tab, setTab] = useState<"step" | "run" | "schedule">("step");
  const [policy, setPolicy] = useState<Policy>(DEFAULT_POLICY);
  useEffect(() => { setPolicy(loadPolicy()); }, []);
  useServerSetting("org", "org", "data-location", policyKey, () => setPolicy(loadPolicy()));
  const [out, setOut] = useState({ name: "", kind: "files" as OutputSink["kind"], conn: "", path: "", format: "parquet" as FileFormat, lake: DEFAULT_LAKE as LakeOptions });

  useEffect(() => { if (stored && draft?.id !== stored.id) { const c = structuredClone(stored); setDraft(c); setSel(null); } }, [stored, draft?.id]);

  const inputId = draft?.inputDatasetId;
  // A signed-in workspace lists datasets without their rows. The preview below runs the steps on them, so read them for this recipe's input.
  useEffect(() => { if (inputId) void refinery.openDataset(inputId); }, [inputId]);
  // A signed-in workspace asks the server whether the limits allow this recipe, a moment after the last edit, so the answer is the one a run would get.
  const [serverPlan, setServerPlan] = useState<{ key: string; check: NativeCheck | null; reasons: string[] } | null>(null);
  const planKey = draft ? JSON.stringify([draft.pool, draft.steps, draft.inputDatasetId, draft.parallelism, draft.partitionTargetMb]) : "";
  useEffect(() => {
    if (!isLive || !draft) return;
    const t = setTimeout(async () => { const r = await refinery.planRecipe(draft); if (r.ok) setServerPlan({ key: planKey, check: r.check, reasons: r.reasons }); }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, planKey]);
  const ds = datasets.find((d) => d.id === draft?.inputDatasetId);
  const pool = pools.find((p) => p.name === draft?.pool);
  const computed = useMemo(() => (ds && draft ? runSteps(startFrame(ds.columns, ds.sample), draft.steps) : null), [ds, draft]);

  if (!stored || !draft) return <div className="space-y-3"><Link href="/refinery/recipes" className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary"><ArrowLeft size={13} /> Recipes</Link><Card><div className="p-10 text-center text-text-secondary">This recipe does not exist or was deleted.</div></Card></div>;

  const dirty = JSON.stringify({ ...draft, version: 0, updatedAt: "", updatedBy: "" }) !== JSON.stringify({ ...stored, version: 0, updatedAt: "", updatedBy: "" });
  const patch = (p: Partial<Recipe>) => setDraft({ ...draft, ...p });
  const setSteps = (steps: Recipe["steps"]) => patch({ steps });

  const frames = computed?.frames; const results = computed?.results;
  const i = sel !== null && sel < draft.steps.length ? sel : null;
  const step = i !== null ? draft.steps[i] : null;
  const def = step ? STEP_BY_OP.get(step.op) : null;
  const before = frames ? frames[i ?? 0] : null;
  const after = frames ? frames[i !== null ? i + 1 : frames.length - 1] : null;
  const result = i !== null && results ? results[i] : null;

  // problems across the whole recipe
  const errors = draft.steps.map((s, k) => (results?.[k]?.error ? { k, msg: results[k].error! } : null)).filter(Boolean) as { k: number; msg: string }[];
  const ai = draft.steps.map((s, k) => ({ k, s, e: frames ? estimateAiStep(s, frames[k].rows, ds!.totalRows, frames[k].rows.length) : null })).filter((x) => x.e);
  const aiTotal = ai.reduce((a, x) => a + x.e!.costUsd, 0); const over = ai.filter((x) => x.e!.overCap);
  const batchOnly = draft.steps.filter((s) => STEP_BY_OP.get(s.op)?.streamable === false);
  const free = pool ? Math.max(1, (pool.workers * pool.coresPerWorker) - pool.running * 2) : 1;
  const guard = pool?.engine === "native" ? (isLive && serverPlan?.key === planKey && serverPlan.check ? serverPlan.check : nativeRunCheck(draft)) : null;
  const plan = ds && pool && guard?.verdict !== "refused" ? (guard ? planPartitions(ds.sizeBytes, ds.totalRows, draft.partitionTargetMb, guard.effectiveParallelism, 1, guard.effectiveParallelism, guard.effectiveParallelism) : planPartitions(ds.sizeBytes, ds.totalRows, draft.partitionTargetMb, draft.parallelism, pool.workers, pool.coresPerWorker, free)) : null;
  const where = draft && policy.enabled ? checkRecipe(draft, policy, datasets, connections, pools) : null;
  const whereBlock = where ? runBlock(where, policy) : null;
  const blocker = !ds ? "The input dataset was removed." : draft.steps.length === 0 ? "Add at least one step." : errors.length ? `Step ${errors[0].k + 1} needs attention.` : over.length ? "A model step is over its cost cap." : draft.outputs.length === 0 ? "Add an output in Run settings." : !pool ? "Choose an engine." : guard?.verdict === "refused" ? "The native engine limits refuse this run. Choose another engine, or change the limits on the Runners screen." : whereBlock;

  const add = (op: string) => { const s = newStep(op, newStepId(draft.steps)); const at = insAt !== null ? insAt + 1 : i !== null ? i + 1 : draft.steps.length; const steps = [...draft.steps]; steps.splice(at, 0, s); setSteps(steps); setSel(at); setTab("step"); setPicker(false); setInsAt(null); };
  const move = (k: number, d: -1 | 1) => { const steps = [...draft.steps]; const j = k + d; if (j < 0 || j >= steps.length) return; [steps[k], steps[j]] = [steps[j], steps[k]]; setSteps(steps); setSel(j); };
  const remove = (k: number) => { const steps = draft.steps.filter((_, x) => x !== k); setSteps(steps); setSel(steps.length ? Math.min(k, steps.length - 1) : null); };
  const save = async (): Promise<boolean> => { setBusy(true); const r = await refinery.saveRecipe(draft); setBusy(false); if (!r.ok) { toast(r.error, "error"); return false; } setDraft(structuredClone(r.recipe)); toast(r.recipe.version === stored.version ? "No changes to save" : "Recipe saved as a new version"); return true; };
  const run = async () => {
    if (busy) return; setBusy(true);
    if (dirty) { const s = await refinery.saveRecipe(draft); if (!s.ok) { setBusy(false); toast(s.error, "error"); return; } setDraft(structuredClone(s.recipe)); }
    const r = await refinery.startRun(draft.id); setBusy(false);
    if (!r.ok) { toast(r.error, "error"); return; }
    toast(isLive ? "Run started" : "Run started (simulated)", "info"); setWin(r.run.id);
  };

  const colsOk = (k: OutputSink["kind"]) => connections.filter((c) => { const g = CONNECTOR_BY_ID.get(c.connector); return g?.can.includes("sink") && (k === "stream" ? !!g.messaging : k === "table" ? ["Databases", "Warehouses and lakehouses"].includes(g.group) : ["Object storage", "Files and APIs"].includes(g.group)); });
  const addOutput = () => {
    const c = connections.find((x) => x.id === out.conn);
    const target = out.kind === "dataset" ? out.path : `${c?.name ?? "?"} / ${out.path}`;
    const lakeFmt = out.kind === "files" && (out.format === "delta" || out.format === "iceberg");
    patch({ outputs: [...draft.outputs, { name: out.name, kind: out.kind, target, format: out.kind === "table" ? "table" : out.kind === "stream" ? "jsonl" : out.format, ...(lakeFmt ? { lake: out.lake } : {}) }] });
    setOut({ name: "", kind: out.kind, conn: "", path: "", format: out.format, lake: DEFAULT_LAKE });
  };
  const outCols = (frames ? frames[frames.length - 1]?.columns.map((c) => c.name) : null) ?? ds?.columns.map((c) => c.name) ?? [];
  const outLake = out.kind === "files" && (out.format === "delta" || out.format === "iceberg");
  const lakeBad = outLake && checkLake({ format: out.format, lake: out.lake, target: `x / ${out.path}` }, outCols).some((f) => f.level === "error");
  const outOk = !!out.name && !!out.path && (out.kind === "dataset" || !!out.conn) && !draft.outputs.some((o) => o.name === out.name) && !lakeBad;

  return (
    <div className="space-y-4">
      <Link href="/refinery/recipes" className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary"><ArrowLeft size={13} /> Recipes</Link>
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold tracking-tight">{draft.name}</h2><Badge tone="neutral">v{stored.version}</Badge>{dirty && <Badge tone="degraded">Unsaved changes</Badge>}</div>
          <input aria-label="Description" value={draft.description} onChange={(e) => patch({ description: e.target.value })} placeholder="What this recipe is for" className="mt-1 w-full max-w-2xl bg-transparent text-sm text-text-secondary placeholder:text-text-tertiary focus:outline-none focus:text-text-primary border-b border-transparent focus:border-border-strong" />
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div role="group" aria-label="View" className="inline-flex rounded-md border border-border-strong p-0.5 bg-surface">
            {([["pipeline", "Pipeline", Workflow], ["wizard", "Wizard", ListOrdered]] as const).map(([v, l, Ic]) => <button key={v} type="button" aria-pressed={view === v} onClick={() => pickView(v)} className={clsx("inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium", view === v ? "bg-[#07191E] text-white" : "text-text-secondary hover:bg-surface-subtle")}><Ic size={13} /> {l}</button>)}
          </div>
          {blocker && <span className="text-xs text-text-tertiary max-w-[220px] text-right">{blocker}</span>}
          <Button onClick={save} disabled={!dirty}><Save size={14} /> Save</Button>
          <Button variant="primary" onClick={run} disabled={!!blocker}><Play size={14} /> Run</Button>
        </div>
      </div>

      <AssistantBar cols={(frames?.[frames.length - 1] ?? before)?.columns ?? ds?.columns ?? []} ds={ds} firstId={Number(newStepId(draft.steps).slice(1))} onAdd={(added) => { if (!added.length) return; setSteps([...draft.steps, ...added]); setSel(draft.steps.length + added.length - 1); setTab("step"); toast(`${added.length} step${added.length === 1 ? "" : "s"} added`); }} />

      {view === "pipeline" && (
        <Card>
          <div className="px-4 py-2.5 border-b border-border flex flex-wrap items-center gap-3">
            <div className="text-[13px] font-semibold">Pipeline</div>
            <label className="flex items-center gap-2 text-xs text-text-secondary">Input <Select aria-label="Input dataset" className="h-8 py-0 w-56" value={draft.inputDatasetId} onChange={(e) => patch({ inputDatasetId: e.target.value })}>{datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></label>
            <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-tertiary">{GROUPS_USED(draft).map((g) => <span key={g.group} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: g.color }} />{g.group}</span>)}</div>
          </div>
          <PipelineCanvas ds={ds} steps={draft.steps} results={results} outputs={draft.outputs} connections={connections} sel={i}
            onSelect={(k) => { setSel(k); setTab("step"); }} onInsert={(after) => { setInsAt(after); setPicker(true); }} onOutputs={() => setTab("run")} />
        </Card>
      )}

      <div className={clsx("grid gap-4 items-start", view === "wizard" ? "xl:grid-cols-[300px_minmax(0,1fr)_350px]" : "xl:grid-cols-[minmax(0,1fr)_380px]")}>
        {/* steps */}
        {view === "wizard" && <Card>
          <div className="px-4 py-3 border-b border-border">
            <div className="text-[11px] uppercase tracking-wide text-text-tertiary">Input</div>
            <Select aria-label="Input dataset" className="mt-1.5" value={draft.inputDatasetId} onChange={(e) => patch({ inputDatasetId: e.target.value })}>{datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
            {ds && <div className="text-xs text-text-tertiary mt-1.5">{fmtRows(ds.totalRows)} rows, {ds.columns.length} columns, v{ds.version}</div>}
          </div>
          <ol className="p-2">
            {draft.steps.map((s, k) => {
              const d = STEP_BY_OP.get(s.op); const r = results?.[k]; const on = i === k;
              return (
                <li key={s.id}>
                  <div className={clsx("rounded-md px-2.5 py-2 flex items-start gap-2.5 cursor-pointer", on ? "bg-accent-50 ring-1 ring-accent-600/40" : "hover:bg-surface-subtle")} onClick={() => { setSel(k); setTab("step"); }} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") { setSel(k); setTab("step"); } }} aria-current={on ? "step" : undefined}>
                    <span className="h-5 w-5 rounded-full bg-surface-muted text-[11px] grid place-items-center shrink-0 mt-0.5 tabular-nums">{k + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium truncate">{d?.label ?? s.op}</div>
                      <div className="text-xs text-text-secondary truncate">{describe(s)}</div>
                      <div className="text-[11px] mt-1 flex items-center gap-1.5 text-text-tertiary tabular-nums">
                        {r?.error ? <span className="inline-flex items-center gap-1 text-status-down"><XCircle size={11} /> Needs attention</span> : r?.ai || r?.remote ? <span className="inline-flex items-center gap-1"><Cpu size={11} /> {r.ai ? "Model step" : "Runs on the runner"}, not in preview</span> : r ? <>{fmtInt(r.rowsIn)} to {fmtInt(r.rowsOut)} rows{r.changed ? `, ${fmtInt(r.changed)} cells` : ""}</> : null}
                      </div>
                    </div>
                  </div>
                  {on && (
                    <div className="flex gap-1 px-2 pb-1.5 pt-0.5 justify-end">
                      <button aria-label="Move up" disabled={k === 0} onClick={() => move(k, -1)} className="h-7 w-7 grid place-items-center rounded hover:bg-surface-muted disabled:opacity-30"><ArrowUp size={13} /></button>
                      <button aria-label="Move down" disabled={k === draft.steps.length - 1} onClick={() => move(k, 1)} className="h-7 w-7 grid place-items-center rounded hover:bg-surface-muted disabled:opacity-30"><ArrowDown size={13} /></button>
                      <button aria-label="Remove step" onClick={() => remove(k)} className="h-7 w-7 grid place-items-center rounded hover:bg-surface-muted text-status-down"><Trash2 size={13} /></button>
                    </div>
                  )}
                </li>
              );
            })}
            {draft.steps.length === 0 && <li className="px-3 py-6 text-center text-xs text-text-secondary">No steps yet. Add the first one to see its effect on a sample of your data.</li>}
          </ol>
          <div className="p-3 border-t border-border"><Button className="w-full justify-center" onClick={() => { setInsAt(null); setPicker(true); }}><Plus size={14} /> Add step{i !== null ? ` after ${i + 1}` : ""}</Button></div>
        </Card>}

        {/* preview */}
        <Card>
          <div className="px-5 py-3.5 border-b border-border">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0"><h3 className="text-[13px] font-semibold">{step ? `After step ${i! + 1}: ${def?.label}` : "Result of the recipe"}</h3><p className="text-xs text-text-tertiary mt-0.5">Preview on {ds ? fmtInt(ds.sample.length) : 0} sampled rows of {ds ? fmtRows(ds.totalRows) : 0}, run in your browser. Personal data is shown as stored in the sample.</p></div>
              {before && after && <div className="flex flex-wrap gap-1.5 text-[11px]">
                <span className="rounded-full bg-surface-muted px-2 py-0.5 tabular-nums">{fmtInt(before.rows.length)} to {fmtInt(after.rows.length)} rows</span>
                {result && result.changed > 0 && <span className="rounded-full bg-accent-50 text-[#067A4E] px-2 py-0.5 tabular-nums">{fmtInt(result.changed)} cells changed</span>}
                {result && result.rejected > 0 && <span className="rounded-full bg-status-down/10 text-status-down px-2 py-0.5 tabular-nums">{fmtInt(result.rejected)} rejected</span>}
              </div>}
            </div>
            {result?.rejectReason && result.rejected > 0 && <p className="text-xs text-text-secondary mt-2">Rejected rows go to the rejected output. Reason: {result.rejectReason}.</p>}
          </div>
          {!ds ? <div className="p-10 text-center text-sm text-text-secondary">Choose an input dataset.</div> : after && before ? (
            (() => {
              const byIdx = new Map(before.rows.map((r, k) => [before.idx[k], r]));
              return <DataTable columns={after.columns} rows={after.rows} limit={SHOWN_ROWS} empty="No rows are left after this step."
                changed={(c, row, v) => {
                  if (i === null || !result) return null;
                  const b = byIdx.get(after.idx[after.rows.indexOf(row)]); const isNew = !before.columns.some((x) => x.name === c.name);
                  if (!b || !(isNew || b[c.name] !== v)) return null;
                  const was = fmtCell(b[c.name]); const now = fmtCell(v);
                  return { className: "bg-accent-50", node: now === null ? <span className="text-text-tertiary">empty</span> : !isNew && was !== null && c.type === "string" ? <><span className="text-text-tertiary line-through mr-1.5">{String(was).slice(0, 40)}</span>{now}</> : now };
                }}
                headExtra={(c) => { const isNew = !before.columns.some((b) => b.name === c.name); const typeChanged = before.columns.some((b) => b.name === c.name && b.type !== c.type); return <><div className={clsx("font-medium", isNew ? "text-[#067A4E]" : "text-text-secondary")}>{c.name}</div><div className={clsx("text-[10px] font-normal", typeChanged || isNew ? "text-[#067A4E]" : "text-text-tertiary")}>{c.type}{isNew ? ", new" : ""}</div></>; }} />;
            })()
          ) : null}
        </Card>

        {/* settings */}
        <Card>
          <div className="px-4"><Tabs label="Settings" value={tab} onChange={setTab} tabs={[{ id: "step", label: "Step" }, { id: "run", label: "Run settings" }, { id: "schedule", label: "Schedule" }]} /></div>
          <div className="p-4 space-y-4">
            {tab === "step" && (step && def ? (
              <>
                <div><h3 className="text-[13px] font-semibold">{def.label}</h3><p className="text-xs text-text-secondary mt-0.5">{def.blurb}</p><div className="flex gap-1.5 mt-2">{def.ai && <Badge tone="info">Model step</Badge>}{def.remote && <Badge tone="info">Runs on the runner</Badge>}{!def.streamable && <Badge tone="neutral">Batch only</Badge>}</div></div>
                {result?.error && <Notice tone="bad">{result.error}</Notice>}
                {result?.warning && !result.error && <Notice tone="info">{result.warning}</Notice>}
                <StepForm def={def} step={step} cols={before?.columns ?? []} onChange={(params) => setSteps(draft.steps.map((s, k) => (k === i ? { ...s, params } : s)))} />
                {def.batchOnly && <p className="text-xs text-text-tertiary">{def.batchOnly}</p>}
                {(() => { const e = ai.find((x) => x.k === i)?.e; if (!e) return null; return (
                  <div className="rounded-md border border-border bg-surface-subtle px-3.5 py-3 space-y-2">
                    <div className="text-[13px] font-semibold">Estimated cost over the whole dataset</div>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs"><dt className="text-text-tertiary">Model calls</dt><dd className="tabular-nums text-right">{fmtInt(e.calls)}</dd><dt className="text-text-tertiary">Tokens per row</dt><dd className="tabular-nums text-right">about {e.inTokPerRow} in, {e.outTokPerRow} out</dd><dt className="text-text-tertiary">Estimated cost</dt><dd className={clsx("tabular-nums text-right font-semibold", e.overCap && "text-status-down")}>{usd(e.costUsd)}</dd><dt className="text-text-tertiary">Cap</dt><dd className="tabular-nums text-right">{e.cap ? usd(e.cap) : "none set"}</dd></dl>
                    {e.overCap ? <p className="text-xs text-status-down">The estimate is over the cap, so the run will not start. Raise the cap, use a cheaper model or filter rows first.</p> : <p className="text-xs text-text-tertiary">Example prices and about four characters per token. A real estimate reads the price of the model behind the alias. Calls go through the gateway, so budgets and policies apply.</p>}
                  </div>); })()}
              </>
            ) : <p className="text-sm text-text-secondary">Select a step to change its settings, or add one.</p>)}

            {tab === "schedule" && <SchedulePanel recipe={stored} />}

            {tab === "run" && ds && (
              <>
                <section className="space-y-3">
                  <h3 className="text-[13px] font-semibold">Where it runs</h3>
                  {(() => {
                    const shuffle = batchOnly.length;
                    const sug = suggestEngine(nativeLimits, { inputBytes: ds.sizeBytes, rows: ds.totalRows, parallelism: draft.parallelism, partitionMb: draft.partitionTargetMb, shuffleSteps: shuffle });
                    const poolFor = (e: string) => pools.find((x) => x.engine === e && x.status !== "pending" && x.status !== "offline") ?? pools.find((x) => x.engine === e);
                    const choose = (e: string) => { const np = poolFor(e); if (!np) return; patch({ pool: np.name, parallelism: Math.min(draft.parallelism, np.engine === "native" ? nativeLimits.threads : Math.max(1, np.workersMax * np.coresPerWorker)) }); };
                    const conv = conversionNote(ds.format);
                    const enginePools = pools.filter((x) => x.engine === pool?.engine && !x.builtIn);
                    return (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 gap-2">
                          {ENGINES.map((e) => { const has = !!poolFor(e.id); const on = pool?.engine === e.id; return (
                            <button key={e.id} type="button" disabled={!has} aria-pressed={on} onClick={() => choose(e.id)} className={clsx("text-left rounded-md border px-3.5 py-2.5", on ? "border-[#02F5A1] bg-accent-50" : "border-border hover:bg-surface-subtle", !has && "opacity-55 cursor-not-allowed hover:bg-transparent")}>
                              <div className="flex flex-wrap items-center gap-2"><span className="text-[13px] font-semibold">{e.label}</span>{e.id === "native" && <Badge tone="healthy">Default</Badge>}{sug.engine === e.id && <Badge tone="info">Suggested for this input</Badge>}</div>
                              <div className="text-xs text-text-secondary mt-0.5">{e.short}</div>
                              {!has && <div className="text-xs text-text-tertiary mt-0.5">No pool for this engine yet. Create one on the Runners screen.</div>}
                            </button>); })}
                        </div>
                        <p className="text-xs text-text-secondary">{sug.because} <span className="text-text-tertiary">A rule of thumb, not a measurement.</span></p>
                        {pool?.engine !== "native" && <Field label="Runner pool"><Select value={draft.pool} onChange={(e) => { const p = pools.find((x) => x.name === e.target.value); patch({ pool: e.target.value, parallelism: Math.min(draft.parallelism, p ? p.workersMax * p.coresPerWorker : draft.parallelism) }); }}>{enginePools.map((p) => <option key={p.id} value={p.name} disabled={p.status === "pending"}>{p.name}{p.flink ? `, your Flink (${p.flink.location === "local" ? "this computer" : p.flink.location === "cloud" ? "cloud" : "on premises"})` : ""}{p.status === "offline" ? ", offline" : ""}</option>)}</Select></Field>}
                        {pool?.status === "offline" && <Notice tone="warn">This pool is offline. A run would wait in the queue.</Notice>}
                        {guard && (
                          <div className={clsx("rounded-md border px-3.5 py-3", guard.verdict === "refused" ? "border-status-down/40 bg-status-down/5" : guard.verdict === "throttled" ? "border-[#E8B04B]/60 bg-[#FFF8E8]" : "border-border bg-surface-subtle")}>
                            <div className="text-[13px] font-semibold">{guard.verdict === "refused" ? "Refused by the native engine limits" : guard.verdict === "throttled" ? "Will run with less parallelism" : "Within the native engine limits"}</div>
                            <ul className="mt-1.5 space-y-1 text-xs text-text-secondary list-disc pl-4">
                              {guard.verdict !== "refused" && <li>{guard.effectiveParallelism} virtual threads, about {fmtInt(guard.peakMemoryMb)} MB of the {fmtInt(nativeLimits.memoryMb)} MB memory budget.</li>}
                              {guard.reasons.map((x) => <li key={x}>{x}</li>)}
                              {guard.alternative && <li>Use {ENGINES.find((e) => e.id === guard.alternative)!.label} for this input.</li>}
                            </ul>
                          </div>)}
                        <div className="grid grid-cols-2 gap-3">
                          <Field label="Parallelism" hint={pool?.engine === "native" ? `Virtual threads, up to ${nativeLimits.threads}` : "Tasks at once"}><Input type="number" min={1} max={pool ? (pool.engine === "native" ? nativeLimits.threads : pool.workersMax * pool.coresPerWorker) : 1} value={draft.parallelism} onChange={(e) => patch({ parallelism: Math.max(1, Math.round(Number(e.target.value) || 1)) })} /></Field>
                          <Field label="Partition size" hint="Per task"><Select value={String(draft.partitionTargetMb)} onChange={(e) => patch({ partitionTargetMb: Number(e.target.value) })}>{[32, 64, 128, 256, 512].map((m) => <option key={m} value={m}>{m} MB</option>)}</Select></Field>
                        </div>
                        {plan && (
                          <div className="rounded-md border border-border bg-surface-subtle px-3.5 py-3">
                            <div className="text-[13px] font-semibold mb-2">Plan for {ds.name}</div>
                            <div className="grid grid-cols-3 gap-2 text-center">{[["Partitions", plan.partitions], ["At once", plan.concurrent], ["Waves", plan.waves]].map(([l, v]) => <div key={l as string} className="rounded bg-surface border border-border py-2"><div className="text-lg font-semibold tabular-nums">{v}</div><div className="text-[11px] text-text-tertiary">{l}</div></div>)}</div>
                            <p className="text-xs text-text-secondary mt-2.5">About {fmtRows(plan.rowsPerPartition)} rows in each partition. {plan.note} {pool!.engine === "native" ? `The native engine uses up to ${guard && guard.verdict !== "refused" ? guard.effectiveParallelism : nativeLimits.threads} virtual threads.` : `Pool capacity is ${pool!.workers} workers of ${pool!.coresPerWorker} cores, autoscaling up to ${pool!.workersMax}.`}</p>
                            <p className="text-xs text-text-tertiary mt-1.5">Arithmetic from size, partition size and capacity. It does not predict how long the run takes.</p>
                          </div>)}
                        {conv && <Notice tone="info" title="Converted before the first step">{conv}</Notice>}
                      </div>);
                  })()}
                  <Toggle checked={!!draft.incremental} onChange={(v) => patch({ incremental: v })} label="Only process new data" description="Each run reads what arrived since the last successful run, using the input's change marker, and adds to the output. Turn off to reprocess everything." />
                </section>

                {where && where.status !== "compliant" && (
                  <Notice tone={where.status === "breaks" ? "warn" : "info"} title={where.status === "breaks" ? "This pipeline leaves the places your policy allows" : "Where this pipeline's data goes cannot be fully told"}>
                    <ul className="space-y-0.5">{where.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
                    <Link href="/refinery/sovereignty" className="underline underline-offset-2 mt-1.5 inline-block">Open data location</Link>
                  </Notice>)}
                <section className="space-y-3">
                  <h3 className="text-[13px] font-semibold">Outputs</h3>
                  <div className="rounded-md border border-border bg-surface-subtle px-3.5 py-3 space-y-2">
                    <div className="flex items-center justify-between gap-3"><div className="text-[13px] font-semibold">Which format?</div><Select aria-label="What the output is for" className="h-8 py-0 w-44" value={goal} onChange={(e) => { const g = e.target.value as Goal; setGoal(g); setOut((o) => ({ ...o, format: recommendFormat(g).format })); }}><option value="tabular">Tabular training data</option><option value="llm-finetune">LLM fine tuning</option><option value="retrieval">Retrieval corpus</option><option value="interchange">Hand to a person</option></Select></div>
                    <p className="text-xs text-text-secondary"><span className="font-medium text-text-primary">{FORMAT_GUIDE.find((f) => f.id === recommendFormat(goal).format)?.label}.</span> {recommendFormat(goal).because}</p>
                    <details className="text-xs text-text-secondary"><summary className="cursor-pointer text-text-primary">Compare formats</summary><ul className="mt-2 space-y-2">{FORMAT_GUIDE.map((f) => <li key={f.id}><span className="font-medium text-text-primary">{f.label}</span>: {f.bestFor}. {f.why} <span className="text-text-tertiary">Watch: {f.watch}</span></li>)}</ul></details>
                  </div>
                  {draft.outputs.length === 0 && <p className="text-xs text-text-secondary">A recipe needs at least one output. It can write files, a dataset, a table or a topic or queue of a streaming system such as Kafka, RabbitMQ or Pulsar.</p>}
                  <ul className="space-y-1.5">{draft.outputs.map((o) => <li key={o.name} className="flex items-start gap-2 rounded-md border border-border px-3 py-2"><div className="min-w-0 flex-1"><div className="text-[13px] font-medium">{o.name}</div><div className="text-xs text-text-tertiary break-words">{sinkLabel(o)}{o.format !== "table" ? `, ${o.format}` : ""}{o.lake ? `, ${o.lake.mode === "merge" ? `update by ${o.lake.mergeKeys.join(" + ")}` : o.lake.mode === "overwrite" ? "replace" : "append"}${o.lake.partitionBy.length ? `, partitioned by ${o.lake.partitionBy.join(", ")}` : ""}${o.lake.catalog ? `, ${o.lake.catalog} catalog` : ""}` : ""}</div></div><button aria-label={`Remove output ${o.name}`} onClick={() => patch({ outputs: draft.outputs.filter((x) => x.name !== o.name) })} className="h-7 w-7 grid place-items-center rounded hover:bg-surface-muted text-text-tertiary"><Trash2 size={13} /></button></li>)}</ul>
                  <div className="rounded-md border border-dashed border-border-strong p-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3"><Field label="Name"><Input value={out.name} onChange={(e) => setOut({ ...out, name: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })} placeholder="train" /></Field><Field label="Writes to"><Select value={out.kind} onChange={(e) => setOut({ ...out, kind: e.target.value as OutputSink["kind"], conn: "" })}><option value="files">Files</option><option value="dataset">A dataset</option><option value="table">A table</option><option value="stream">A topic or queue</option></Select></Field></div>
                    {out.kind !== "dataset" && <Field label="Connection"><Select value={out.conn} onChange={(e) => setOut({ ...out, conn: e.target.value })}><option value="">Choose a connection</option>{colsOk(out.kind).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>}
                    <div className="grid grid-cols-[1fr_auto] gap-3 items-end"><Field label={out.kind === "dataset" ? "Dataset name" : out.kind === "table" ? "Table" : out.kind === "stream" ? "Topic or queue" : "Path"}><Input value={out.path} onChange={(e) => setOut({ ...out, path: e.target.value })} placeholder={out.kind === "files" ? "curated/support/train/" : out.kind === "table" ? "ANALYTICS.PUBLIC.TRAIN" : out.kind === "stream" ? "support.tickets.clean" : "support_train"} /></Field>{out.kind === "files" && <Select aria-label="Format" value={out.format} onChange={(e) => setOut({ ...out, format: e.target.value as FileFormat })} className="w-28">{["parquet", "delta", "iceberg", "csv", "jsonl", "json"].map((f) => <option key={f}>{f}</option>)}</Select>}</div>
                    {outLake && <LakeOptionsForm format={out.format} value={out.lake} columns={outCols} target={`x / ${out.path}`} onChange={(lake) => setOut({ ...out, lake })} />}
                    <Button className="w-full justify-center" disabled={!outOk} onClick={addOutput}><Plus size={14} /> Add output</Button>
                  </div>
                </section>

                <section className="space-y-2">
                  <h3 className="text-[13px] font-semibold">Checks</h3>
                  <ul className="space-y-1.5 text-xs">
                    <Check_ ok={errors.length === 0} text={errors.length === 0 ? "Every step is valid against its columns" : `Step ${errors[0].k + 1}: ${errors[0].msg}`} />
                    <Check_ ok={over.length === 0} text={ai.length === 0 ? "No model steps" : over.length ? "A model step is over its cost cap" : `Model steps estimated at ${usd(aiTotal)} in total, within their caps`} />
                    <Check_ ok={batchOnly.length === 0} warn text={batchOnly.length === 0 ? "Can also run as a stream" : `Batch only because of: ${batchOnly.map((s) => STEP_BY_OP.get(s.op)!.label).join(", ")}`} />
                  </ul>
                </section>
              </>
            )}
          </div>
        </Card>
      </div>
      <RunWindow runId={win} onClose={() => setWin(null)} />
      <StepPicker open={picker} onClose={() => { setPicker(false); setInsAt(null); }} onPick={add} />
    </div>
  );
}

function GROUPS_USED(r: Recipe) {
  const seen = new Set<string>(); const out: { group: string; color: string }[] = [];
  for (const st of r.steps) { const g = STEP_BY_OP.get(st.op)?.group; if (g && !seen.has(g)) { seen.add(g); out.push({ group: g, color: GROUP_STYLE[g].color }); } }
  return out;
}

function Check_({ ok, warn, text }: { ok: boolean; warn?: boolean; text: string }) {
  return <li className="flex items-start gap-2">{ok ? <Check size={14} className="text-status-healthy mt-px shrink-0" /> : warn ? <AlertTriangle size={14} className="text-status-degraded mt-px shrink-0" /> : <XCircle size={14} className="text-status-down mt-px shrink-0" />}<span className="text-text-secondary">{text}</span></li>;
}
