"use client";

import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { CodeBlock, Kpi, Notice } from "@/components/mlops/ui";
import { ChartCard, Plot } from "@/components/optimize/charts";
import { mval } from "./bits";
import { energy, evaluation, repro, signature, systemSeries, type SystemSeries } from "@/lib/crucible/platform";
import type { Experiment, Run } from "@/lib/crucible/types";
import { PRIMARY } from "./bits";

const seriesData = (run: Run, s: SystemSeries) => run.steps.map((st, i) => ({ t: String(st), v: s.values[i] }));
const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);

export function SeriesGrid({ run, list, note }: { run: Run; list: SystemSeries[]; note?: string }) {
  return (
    <div className="space-y-3">
      {note && <p className="text-xs text-text-tertiary">{note}</p>}
      <div className="grid lg:grid-cols-2 gap-5">
        {list.map((s) => { const d = seriesData(run, s); const unit = s.unit && s.unit !== "tok/s" && s.unit !== "/s" ? ` ${s.unit}` : ""; return (
          <ChartCard key={s.key} title={s.label} subtitle={`Average ${avg(s.values).toFixed(s.values[0] < 10 ? 3 : 1)}${unit}`} data={d} series={[{ key: "v", name: s.label, color: "s1" }]}>
            <Plot kind="area" data={d} series={[{ key: "v", name: s.label, color: "s1" }]} unit={unit} height={170} />
          </ChartCard>); })}
      </div>
    </div>
  );
}

export function SystemTab({ run }: { run: Run }) {
  const e = energy(run); const sys = systemSeries(run);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Energy" value={`${e.kwh} kWh`} sub={e.avgPowerW ? `${e.avgPowerW} W average on each GPU` : "CPU only, estimated from cost"} />
        <Kpi label="Carbon" value={`${e.kgco2e} kg CO2e`} sub="At 0.26 kg for each kWh" />
        <Kpi label="GPU utilisation" value={sys.find((s) => s.key === "gpu_util") ? `${avg(sys.find((s) => s.key === "gpu_util")!.values).toFixed(0)}%` : "None"} sub="Average over the run" />
        <Kpi label="Host memory" value={`${avg(sys.find((s) => s.key === "ram")!.values).toFixed(0)} GB`} sub="Average" />
      </div>
      <Notice tone="info" title="Estimates in the sample workspace">Machine metrics here are generated from the run, not read from a machine. In a live workspace the SDK samples them every few seconds. Energy is the average GPU power plus a fixed host share and a 1.2 data centre overhead, at a stated grid factor. It is a planning figure, not a metered one.</Notice>
      <SeriesGrid run={run} list={sys} />
    </div>
  );
}

export function EvaluationTab({ run, exp }: { run: Run; exp: Experiment }) {
  const key = PRIMARY[exp.id]; const ev = evaluation(run, exp, key); const groups = Array.from(new Set(ev.slices.map((s) => s.group)));
  if (run.status !== "finished") return <Notice title="No evaluation">A run has an evaluation once it finishes.</Notice>;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label={key.replace(/_/g, " ")} value={mval(key, run.metrics[key])} sub="On the test split" />
        <Kpi label="Fairness gap" value={ev.fairnessGap.toFixed(3)} sub="Best slice minus worst" tone={ev.fairnessGap > 0.05 ? "warn" : undefined} />
        <Kpi label="Calibration error" value={ev.ece.toFixed(3)} sub="Lower is better" />
        <Kpi label="Latency p50 and p95" value={`${ev.p50Ms} and ${ev.p95Ms} ms`} sub="One request" />
        <Kpi label="Cost for 1,000 predictions" value={`$${ev.costPer1k.toFixed(3)}`} />
      </div>
      <Card className="overflow-hidden">
        <div className="px-4 pt-4 pb-2"><h3 className="text-sm font-semibold text-text-primary">Results by slice</h3><p className="text-xs text-text-tertiary mt-0.5">A model can improve on average and get worse for one group. Each slice is compared with the overall result.</p></div>
        <Table><Thead><tr><Th>Group</Th><Th>Slice</Th><Th>Examples</Th><Th>{key.replace(/_/g, " ")}</Th><Th>Against overall</Th></tr></Thead><tbody>
          {groups.flatMap((g) => ev.slices.filter((s) => s.group === g).map((s, i) => { const worse = ["mape", "eval_loss"].includes(key) ? s.delta > 0.01 : s.delta < -0.01; return (
            <Tr key={g + s.slice}><Td className="text-text-tertiary">{i === 0 ? g : ""}</Td><Td>{s.slice}</Td><Td className="tabular-nums text-text-secondary">{s.support.toLocaleString("en-US")}</Td><Td className="tabular-nums font-medium">{mval(key, s.value)}</Td>
              <Td className="tabular-nums"><span className={worse ? "text-status-down" : "text-text-secondary"}>{s.delta >= 0 ? "+" : ""}{s.delta.toFixed(3)}</span>{worse && <span className="ml-2"><Badge tone="down">Worse</Badge></span>}</Td></Tr>); }))}
        </tbody></Table>
      </Card>
      {ev.confusion && (
        <Card className="p-4"><h3 className="text-sm font-semibold text-text-primary">Confusion matrix</h3><p className="text-xs text-text-tertiary mt-0.5 mb-3">Each row is the true intent. The number is the share of its tickets that went to each predicted intent.</p>
          <div className="overflow-x-auto"><table className="text-sm border-separate border-spacing-1"><thead><tr><th />{ev.confusion.labels.map((l) => <th key={l} className="text-[11px] font-medium text-text-tertiary px-2 pb-1 text-center">{l}</th>)}</tr></thead><tbody>
            {ev.confusion.matrix.map((row, i) => <tr key={i}><th className="text-[11px] font-medium text-text-tertiary text-right pr-2">{ev.confusion!.labels[i]}</th>{row.map((v, j) => <td key={j} title={`${ev.confusion!.labels[i]} predicted as ${ev.confusion!.labels[j]}: ${(v * 100).toFixed(1)}%`} className="w-16 h-9 text-center text-xs tabular-nums rounded" style={{ background: `rgba(2,245,161,${Math.min(0.85, v * 0.9)})`, color: "#07191E" }}>{(v * 100).toFixed(1)}</td>)}</tr>)}
          </tbody></table></div></Card>
      )}
      <p className="text-xs text-text-tertiary">Evaluation figures in the sample workspace are generated around the run's final metric. They show the shape of the screen, not a measurement.</p>
    </div>
  );
}

export function ModelTab({ run }: { run: Run }) {
  const sig = signature(run); const rows = (list: typeof sig.inputs) => list.map((x) => <Tr key={x.name}><Td className="font-code text-xs">{x.name}</Td><Td className="text-text-secondary">{x.type}</Td><Td className="text-text-tertiary text-xs">{x.note ?? ""}</Td></Tr>);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><Kpi label="Format" value={sig.flavor} /><Kpi label="Size" value={sig.sizeMb ? (sig.sizeMb >= 1000 ? `${(sig.sizeMb / 1000).toFixed(1)} GB` : `${sig.sizeMb} MB`) : "No model"} /><Kpi label="Registry" value={run.modelVersion ? `${run.modelVersion.model} v${run.modelVersion.version}` : "Not registered"} /><Kpi label="Requirements" value={sig.requirements.length} sub="Pinned" /></div>
      <div className="grid lg:grid-cols-2 gap-5">
        <Card className="overflow-hidden"><div className="px-4 pt-4 pb-2"><h3 className="text-sm font-semibold text-text-primary">Inputs</h3><p className="text-xs text-text-tertiary mt-0.5">A request that does not match is refused before it reaches the model.</p></div><Table><Thead><tr><Th>Name</Th><Th>Type</Th><Th>Note</Th></tr></Thead><tbody>{rows(sig.inputs)}</tbody></Table></Card>
        <Card className="overflow-hidden"><div className="px-4 pt-4 pb-2"><h3 className="text-sm font-semibold text-text-primary">Outputs</h3></div><Table><Thead><tr><Th>Name</Th><Th>Type</Th><Th>Note</Th></tr></Thead><tbody>{rows(sig.outputs)}</tbody></Table></Card>
      </div>
      <div className="grid lg:grid-cols-2 gap-5"><div><h3 className="text-sm font-semibold text-text-primary mb-2">Example request</h3><CodeBlock title="input_example.json" code={sig.example} maxHeight={140} /></div><div><h3 className="text-sm font-semibold text-text-primary mb-2">Requirements</h3><CodeBlock title="requirements.txt" code={sig.requirements.join("\n")} maxHeight={140} /></div></div>
    </div>
  );
}

export function ReproduceTab({ run }: { run: Run }) {
  const r = repro(run);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><Kpi label="Reproducibility" value={`${r.score} of ${r.checks.length}`} sub="Checks passed" tone={r.score < r.checks.length ? "warn" : undefined} /><Kpi label="Python" value={r.python} /><Kpi label="Seed" value={run.seed} /><Kpi label="Environment lock" value={r.lockHash.slice(0, 8)} sub="Hash of the lock file" /></div>
      <Card className="overflow-hidden"><div className="px-4 pt-4 pb-2"><h3 className="text-sm font-semibold text-text-primary">Can this run be repeated</h3><p className="text-xs text-text-tertiary mt-0.5">Each check is something a person would otherwise have to remember to record.</p></div>
        <ul className="divide-y divide-border">{r.checks.map((c) => <li key={c.id} className="px-4 py-2.5 flex items-start gap-3"><span className={`h-5 w-5 rounded-full grid place-items-center shrink-0 mt-0.5 ${c.ok ? "bg-status-healthy/10 text-status-healthy" : "bg-status-degraded/10 text-status-degraded"}`}>{c.ok ? <Check size={12} /> : <X size={12} />}</span><div><div className="text-sm">{c.label}</div><div className="text-xs text-text-tertiary break-all">{c.detail}</div></div></li>)}</ul></Card>
      {r.diffStat && <Notice tone="warn" title="Run from a working tree with changes">{r.diffStat}. The change was saved as a patch with the run, so the code can still be rebuilt, but the commit alone is not enough.</Notice>}
      <div className="grid lg:grid-cols-2 gap-5">
        <div><h3 className="text-sm font-semibold text-text-primary mb-2">Repeat this run</h3><CodeBlock title="shell" code={`${r.command}\n\n# Same data version, same commit, same image digest, same seed,\n# on ${r.host}. Override a parameter:\n${r.command} --param lr=3e-5`} maxHeight={200} /></div>
        <div><h3 className="text-sm font-semibold text-text-primary mb-2">Packages recorded</h3><Card className="overflow-hidden"><Table><Thead><tr><Th>Package</Th><Th>Version</Th></tr></Thead><tbody>{r.packages.map((p) => <Tr key={p.name}><Td className="font-code text-xs">{p.name}</Td><Td className="tabular-nums">{p.version}</Td></Tr>)}</tbody></Table></Card></div>
      </div>
    </div>
  );
}
