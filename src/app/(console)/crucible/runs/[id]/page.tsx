"use client";

import Link from "next/link";
import { use, useMemo, useState } from "react";
import { ChevronLeft, Package } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input } from "@/components/ui/Form";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { GuardButton, Kpi, Modal, Notice, Tabs, useRole } from "@/components/mlops/ui";
import { ChartCard, Plot } from "@/components/optimize/charts";
import { RunBadge, gb, hours, mval, person } from "@/components/crucible/bits";
import { EvaluationTab, ModelTab, ReproduceTab, SeriesGrid, SystemTab } from "@/components/crucible/RunAnalysis";
import { dynamicsSeries, energy } from "@/lib/crucible/platform";
import { crucible, useCrucible } from "@/lib/crucible/store";
import { LOWER_IS_BETTER } from "@/lib/crucible/sample";
import { PRESETS, defaultPlan, estimate, rightSize, smallestFix, type PlanInput } from "@/lib/crucible/memory";
import { toast } from "@/lib/mlops/toast";
import { ago, usd } from "@/lib/agents/format";

type Tab = "overview" | "metrics" | "system" | "evaluation" | "model" | "reproduce" | "memory" | "artifacts";

/** Builds a planner input from the parameters a language model run recorded, so a failed run can be explained and fixed. */
function planFromRun(p: Record<string, string | number | boolean>, gpus: number, gpuGb: number): PlanInput | null {
  if (typeof p.base !== "string" || typeof p.method !== "string") return null;
  const preset = PRESETS.find((x) => p.base.toString().includes(`-${x.id.replace("b", "")}b`)) ?? PRESETS[3];
  const base = defaultPlan(preset);
  return { ...base, method: p.method === "lora" ? "lora" : p.method === "qlora" ? "qlora" : "full", precision: p.precision === "fp16" ? "fp16" : p.precision === "fp32" ? "fp32" : "bf16",
    shard: p.shard === "zero3" ? "zero3" : p.shard === "zero2" ? "zero2" : p.shard === "zero1" ? "zero1" : "none", gpus: Math.max(1, gpus), gpuGb,
    seqLen: Number(p.seq_len ?? 2048), microBatch: Number(p.micro_batch ?? 4), accum: Number(p.accum ?? 4), trainableFrac: p.rank ? Math.min(0.05, Number(p.rank) * 0.00016) : 0.01 };
}

export default function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { runs, experiments, jobs } = useCrucible();
  const role = useRole();
  const [tab, setTab] = useState<Tab>("overview");
  const [reg, setReg] = useState(false);
  const [model, setModel] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const run = runs.find((r) => r.id === id);
  const exp = experiments.find((e) => e.id === run?.experimentId);
  const job = jobs.find((j) => j.id === run?.jobId);

  const plan = useMemo(() => (run ? planFromRun(run.params, run.gpus.count, run.gpus.memGb) : null), [run]);
  const fix = useMemo(() => (plan ? smallestFix(plan) : null), [plan]);

  if (!run || !exp) return <EmptyState icon={Package} title="Run not found" description="It may have been removed from the sample data." />;
  const chart = (k: string) => run.steps.map((s, i) => ({ t: String(s), v: Number((run.series[k]?.[i] ?? 0).toFixed(4)) }));
  const metricKeys = Object.keys(run.series).filter((k) => k !== "gpu_mem_gb");
  const mem = run.series.gpu_mem_gb ? run.steps.map((s, i) => ({ t: String(s), v: Number(run.series.gpu_mem_gb[i].toFixed(1)) })) : [];
  const right = run.peakMemGb && run.gpus.memGb ? rightSize(run.gpus.memGb, run.peakMemGb) : null;
  const canRegister = run.status === "finished" && run.artifacts.some((a) => a.kind === "model") && !run.modelVersion;
  const doRegister = () => {
    const r = crucible.registerCandidate(role, run.id, model.trim());
    if (!r.ok) { setErr(r.error); return; }
    setReg(false); setErr(null); toast(`Registered as ${model.trim()} version ${r.value.version}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/crucible/experiments/${exp.id}`} className="inline-flex items-center gap-1 text-[13px] text-text-secondary hover:text-text-primary mb-2"><ChevronLeft size={14} /> {exp.name}</Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3"><h1 className="text-xl font-semibold text-text-primary tracking-tight">{run.name}</h1><RunBadge s={run.status} /></div>
            <p className="text-xs text-text-tertiary mt-1.5">{run.id} · started {ago(run.startedAt)} by {person(run.owner)}{run.modelVersion ? ` · registered as ${run.modelVersion.model} v${run.modelVersion.version}` : ""}</p>
          </div>
          <div className="flex items-center gap-2"><Link href={`/crucible/lineage?run=${run.id}`} className="inline-flex h-9 items-center rounded-md border border-border-strong px-3 text-[13px] font-medium hover:bg-surface-muted">View lineage</Link>
          {canRegister && <GuardButton action="model.register" role={role} variant="primary" onClick={() => { setModel(exp.model ?? ""); setErr(null); setReg(true); }}>Register as model version</GuardButton>}</div>
        </div>
      </div>

      {run.status === "failed" && run.failure && (
        <Notice tone="bad" title="This run failed">
          {run.failure}
          {fix && fix.steps.length > 0 && <> The planner would have caught it: {fix.steps.map((s) => s.label.toLowerCase()).join(", then ")} brings it to {gb(fix.finalTotalGb, 0)} for each GPU. <Link href="/crucible/memory" className="underline underline-offset-2 text-text-primary">Open the memory planner</Link>.</>}
        </Notice>
      )}
      {run.note && <Notice title="Note">{run.note}</Notice>}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="GPU hours" value={run.gpuHours ? hours(run.gpuHours) : "0"} sub={run.gpus.count ? `${run.gpus.count} x ${run.gpus.card}` : "CPU only"} />
        <Kpi label="Sample cost" value={usd(run.costUsd)} />
        <Kpi label="Peak GPU memory" value={run.peakMemGb ? gb(run.peakMemGb, 0) : "Not measured"} sub={run.plannedMemGb ? `Planned ${gb(run.plannedMemGb, 0)}` : undefined} />
        <Kpi label="Energy" value={`${energy(run).kwh} kWh`} sub={`${energy(run).kgco2e} kg CO2e, estimated`} />
        <Kpi label="Data version" value={`v${run.dataset.version}`} sub={run.dataset.name} />
      </div>

      <Tabs<Tab> label="Run views" value={tab} onChange={setTab} tabs={[{ id: "overview", label: "Overview" }, { id: "metrics", label: "Metrics" }, { id: "system", label: "System" }, { id: "evaluation", label: "Evaluation" }, { id: "model", label: "Model" }, { id: "reproduce", label: "Reproduce" }, { id: "memory", label: "Memory" }, { id: "artifacts", label: "Artifacts", count: run.artifacts.length }]} />

      {tab === "overview" && (
        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Parameters</h3>
            <dl className="text-sm divide-y divide-border">{Object.entries(run.params).map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-1.5"><dt className="font-code text-xs text-text-secondary">{k}</dt><dd className="tabular-nums text-text-primary">{String(v)}</dd></div>)}</dl>
            <h3 className="text-sm font-semibold text-text-primary mt-5 mb-3">Final metrics</h3>
            <dl className="text-sm divide-y divide-border">{Object.entries(run.metrics).map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-1.5"><dt className="text-text-secondary">{k.replace(/_/g, " ")}</dt><dd className="tabular-nums text-text-primary">{mval(k, v)}</dd></div>)}</dl>
          </Card>
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-text-primary mb-1">What produced this run</h3>
            <p className="text-xs text-text-tertiary mb-3">Everything needed to repeat it.</p>
            <dl className="text-sm divide-y divide-border">
              <div className="flex justify-between gap-4 py-1.5"><dt className="text-text-secondary">Data</dt><dd className="text-right"><span className="text-text-primary">{run.dataset.name} v{run.dataset.version}</span><div className="text-xs text-text-tertiary">{run.dataset.rows.toLocaleString("en-US")} rows, quality {Math.round(run.dataset.quality * 100)}%</div></dd></div>
              <div className="flex justify-between gap-4 py-1.5"><dt className="text-text-secondary">Refinery run</dt><dd className="font-code text-xs">{run.dataset.refineryRun}</dd></div>
              <div className="flex justify-between gap-4 py-1.5"><dt className="text-text-secondary">Code</dt><dd className="text-right"><span className="font-code text-xs">{run.code.repo}</span><div className="text-xs text-text-tertiary">{run.code.branch} at {run.code.commit}</div></dd></div>
              <div className="flex justify-between gap-4 py-1.5"><dt className="text-text-secondary">Container image</dt><dd className="text-right"><span className="font-code text-xs break-all">{run.image.ref}</span><div className="font-code text-[11px] text-text-tertiary">{run.image.digest}</div></dd></div>
              <div className="flex justify-between gap-4 py-1.5"><dt className="text-text-secondary">Random seed</dt><dd className="tabular-nums">{run.seed}</dd></div>
              {job && <div className="flex justify-between gap-4 py-1.5"><dt className="text-text-secondary">Job</dt><dd><Link href="/crucible/jobs" className="hover:underline">{job.name}</Link></dd></div>}
            </dl>
            {Object.keys(run.tags).length > 0 && <div className="flex flex-wrap gap-1.5 mt-4">{Object.entries(run.tags).map(([k, v]) => <Badge key={k} tone="neutral">{k}: {v}</Badge>)}</div>}
          </Card>
        </div>
      )}

      {tab === "metrics" && (
        <div className="grid lg:grid-cols-2 gap-5">
          {metricKeys.map((k) => { const d = chart(k); return (
            <ChartCard key={k} title={k.replace(/_/g, " ")} subtitle={LOWER_IS_BETTER.has(k) ? "Lower is better" : "Higher is better"} data={d} series={[{ key: "v", name: k.replace(/_/g, " "), color: "s1" }]}>
              <Plot kind="line" data={d} series={[{ key: "v", name: k.replace(/_/g, " "), color: "s1" }]} height={200} />
            </ChartCard>
          ); })}
          {dynamicsSeries(run).length > 0 && <div className="lg:col-span-2 space-y-3 pt-2"><h3 className="text-sm font-semibold text-text-primary">Training dynamics</h3><SeriesGrid run={run} list={dynamicsSeries(run)} note="Logged without extra code by the framework integration. Generated in the sample workspace." /></div>}
        </div>
      )}

      {tab === "system" && <SystemTab run={run} />}
      {tab === "evaluation" && <EvaluationTab run={run} exp={exp} />}
      {tab === "model" && <ModelTab run={run} />}
      {tab === "reproduce" && <ReproduceTab run={run} />}

      {tab === "memory" && (
        <div className="space-y-5">
          {mem.length === 0 ? <Notice title="No memory samples">This run used the CPU, so there is no GPU memory to show.</Notice> : (
            <ChartCard title="GPU memory in use" subtitle="Measured on one GPU during the run" data={mem} series={[{ key: "v", name: "GB in use", color: "s2" }]}>
              <Plot kind="area" data={mem} series={[{ key: "v", name: "GB in use", color: "s2" }]} unit=" GB" height={240} refY={run.plannedMemGb ? { y: run.plannedMemGb, label: `Planned ${run.plannedMemGb} GB` } : undefined} />
            </ChartCard>
          )}
          <div className="grid sm:grid-cols-3 gap-3">
            <Kpi label="Card memory" value={run.gpus.memGb ? gb(run.gpus.memGb, 0) : "None"} sub={run.gpus.card} />
            <Kpi label="Planned" value={run.plannedMemGb ? gb(run.plannedMemGb, 0) : "No plan"} />
            <Kpi label="Measured peak" value={run.peakMemGb ? gb(run.peakMemGb, 0) : "Not measured"} sub={run.plannedMemGb && run.peakMemGb ? `${((run.peakMemGb / run.plannedMemGb - 1) * 100).toFixed(0)}% against the plan` : undefined} />
          </div>
          {right && <Notice tone="info" title="A smaller card would have held this run">The measured peak plus 10 percent headroom fits a {right.cardGb} GB card, which would cost about {Math.round(right.savingFraction * 100)} percent less for the card tier.</Notice>}
          {plan && run.status === "failed" && <p className="text-xs text-text-tertiary">Planner estimate for these parameters: {gb(estimate(plan).total, 0)} for each GPU against {gb(estimate(plan).usable, 0)} usable.</p>}
        </div>
      )}

      {tab === "artifacts" && (
        run.artifacts.length === 0 ? <EmptyState icon={Package} title="No artifacts" description={run.status === "failed" ? "The run stopped before it wrote any." : "Artifacts appear as the run writes them."} /> : (
          <Card className="overflow-hidden">
            <Table>
              <Thead><tr><Th>Path</Th><Th>Kind</Th><Th>Size</Th><Th>SHA-256</Th></tr></Thead>
              <tbody>{run.artifacts.map((a) => <Tr key={a.path}><Td className="font-code text-xs">{a.path}</Td><Td><Badge tone="neutral">{a.kind}</Badge></Td><Td className="tabular-nums text-text-secondary">{a.sizeMb >= 1000 ? `${(a.sizeMb / 1000).toFixed(1)} GB` : `${a.sizeMb} MB`}</Td><Td className="font-code text-[11px] text-text-tertiary">{a.sha256.slice(0, 16)}</Td></Tr>)}</tbody>
            </Table>
          </Card>
        )
      )}

      <Modal open={reg} onClose={() => setReg(false)} title="Register as model version"
        footer={<><Button variant="secondary" onClick={() => setReg(false)}>Cancel</Button><Button variant="primary" onClick={doRegister}>Register</Button></>}>
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">This links {run.name} to a version of a registered model. The version starts as not approved, and moving it to staging or production follows the Model Versions rules.</p>
          <Field label="Model name" hint="Lowercase letters, digits and hyphens."><Input value={model} onChange={(e) => setModel(e.target.value)} /></Field>
          {err && <Notice tone="bad">{err}</Notice>}
        </div>
      </Modal>
    </div>
  );
}
