"use client";

import { useCrucibleStatus } from "@/lib/crucible/live/store";
import { LiveExperiment } from "@/components/crucible/live/Experiments";

import Link from "next/link";
import { use, useMemo, useState } from "react";
import { ChevronLeft, FlaskConical } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { Notice, Tabs } from "@/components/mlops/ui";
import { ParallelCoords, ScatterCard } from "@/components/crucible/RunCharts";
import { QUERY_EXAMPLES, parseQuery } from "@/lib/crucible/query";
import { Download } from "lucide-react";
import { ChartCard, Plot, type Ser } from "@/components/optimize/charts";
import { PRIMARY, RunBadge, hours, mval, person } from "@/components/crucible/bits";
import { useCrucible } from "@/lib/crucible/store";
import { LOWER_IS_BETTER, better } from "@/lib/crucible/sample";
import { ago, usd } from "@/lib/agents/format";

type Tab = "runs" | "charts" | "compare";
const COLORS: Ser["color"][] = ["s1", "s2", "s3", "grey"];

function SampleExperimentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { experiments, runs } = useCrucible();
  const exp = experiments.find((e) => e.id === id);
  const allRuns = useMemo(() => runs.filter((r) => r.experimentId === id).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)), [runs, id]);
  const [query, setQuery] = useState("");
  const parsed = useMemo(() => parseQuery(query), [query]);
  const rs = useMemo(() => (parsed.ok ? allRuns.filter(parsed.test) : allRuns), [allRuns, parsed]);
  const key = PRIMARY[id];
  const [tab, setTab] = useState<Tab>("runs");
  const [picked, setPicked] = useState<string[]>([]);
  const [metric, setMetric] = useState<string>(key);

  if (!exp) return <EmptyState icon={FlaskConical} title="Experiment not found" description="It may have been removed from the sample data." />;
  const best = rs.filter((r) => r.status === "finished" && r.metrics[key] !== undefined).reduce<typeof rs[number] | undefined>((b, r) => (!b || better(key, r.metrics[key], b.metrics[key]) ? r : b), undefined);
  const chosen = rs.filter((r) => picked.includes(r.id));
  const toggle = (rid: string) => setPicked((p) => (p.includes(rid) ? p.filter((x) => x !== rid) : p.length >= 4 ? p : [...p, rid]));
  const metricKeys = Array.from(new Set(rs.flatMap((r) => Object.keys(r.series)))).filter((m) => m !== "gpu_mem_gb");
  const longest = Math.max(0, ...chosen.map((r) => r.steps.length));
  const data = Array.from({ length: longest }, (_, i) => {
    const row: Record<string, number | string> = { t: String(chosen.find((r) => r.steps[i] !== undefined)?.steps[i] ?? i) };
    chosen.forEach((r) => { const v = r.series[metric]?.[i]; if (v !== undefined) row[r.id] = Number(v.toFixed(4)); });
    return row;
  });
  const series: Ser[] = chosen.map((r, i) => ({ key: r.id, name: r.name, color: COLORS[i] }));
  const paramKeys = Array.from(new Set(chosen.flatMap((r) => Object.keys(r.params))));
  const differing = paramKeys.filter((p) => new Set(chosen.map((r) => String(r.params[p] ?? "not set"))).size > 1);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/crucible/experiments" className="inline-flex items-center gap-1 text-[13px] text-text-secondary hover:text-text-primary mb-2"><ChevronLeft size={14} /> Experiments</Link>
        <h1 className="text-xl font-semibold text-text-primary tracking-tight">{exp.name}</h1>
        <p className="text-sm text-text-secondary mt-1 max-w-2xl">{exp.description}</p>
        <div className="text-xs text-text-tertiary mt-2">{exp.task} · {exp.department} · owned by {person(exp.owner)}{exp.model ? ` · registry model ${exp.model}` : ""}</div>
      </div>

      <Tabs<Tab> label="Experiment views" value={tab} onChange={setTab} tabs={[{ id: "runs", label: "Runs", count: rs.length }, { id: "charts", label: "Charts" }, { id: "compare", label: "Compare", count: picked.length || undefined }]} />

      {(tab === "runs" || tab === "charts") && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input aria-label="Filter runs" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Filter runs, for example ${QUERY_EXAMPLES[0]}`} spellCheck={false} className={`h-9 flex-1 rounded-md border bg-surface px-3 text-sm font-code ${parsed.ok ? "border-border-strong" : "border-status-down"}`} />
            <button onClick={() => { const head = ["run", "status", "dataset", "version", "gpu_hours", "cost_usd", ...Object.keys(rs[0]?.metrics ?? {}).map((m) => "metric." + m), ...Object.keys(rs[0]?.params ?? {}).map((m) => "param." + m)]; const lines = [head.join(","), ...rs.map((r) => [r.name, r.status, r.dataset.name, r.dataset.version, r.gpuHours, r.costUsd, ...Object.values(r.metrics), ...Object.values(r.params)].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))]; const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" })); a.download = `${exp.name}-runs.csv`; a.click(); }} className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-border-strong text-[13px] hover:bg-surface-muted"><Download size={14} /> Download CSV</button>
          </div>
          <p className={`text-xs ${parsed.ok ? "text-text-tertiary" : "text-status-down"}`}>{parsed.ok ? (query ? `${rs.length} of ${allRuns.length} runs match. Fields: metrics.name, params.name, tags.name, status, owner, dataset_version. Join with and, or, brackets.` : "Use the same filter syntax as MLflow: metrics, params, tags and attributes, with and, or, like and in.") : `${parsed.error} (at character ${parsed.at + 1})`}</p>
        </div>
      )}

      {tab === "charts" && (rs.length < 2 ? <Notice title="Not enough runs">Charts need at least two runs. Clear the filter or log more runs.</Notice> : <div className="grid gap-5"><ParallelCoords runs={rs} metric={key} /><ScatterCard runs={rs} metric={key} /></div>)}

      {tab === "runs" && (
        <Card className="overflow-hidden">
          <Table>
            <Thead><tr><Th>Compare</Th><Th>Run</Th><Th>Status</Th><Th>{key.replace(/_/g, " ")}</Th><Th>Data version</Th><Th>GPU hours</Th><Th>Cost</Th><Th>Started</Th></tr></Thead>
            <tbody>
              {rs.map((r) => (
                <Tr key={r.id}>
                  <Td><input type="checkbox" aria-label={`Compare ${r.name}`} checked={picked.includes(r.id)} onChange={() => toggle(r.id)} disabled={!picked.includes(r.id) && picked.length >= 4} className="h-4 w-4 accent-[#02F5A1]" /></Td>
                  <Td><Link href={`/crucible/runs/${r.id}`} className="font-medium text-text-primary hover:underline">{r.name}</Link>{r.modelVersion && <div className="text-xs text-text-tertiary">Registered as {r.modelVersion.model} v{r.modelVersion.version}</div>}</Td>
                  <Td><RunBadge s={r.status} /></Td>
                  <Td className="tabular-nums">{r.metrics[key] !== undefined && r.status !== "failed" ? <span className={best?.id === r.id ? "font-semibold text-text-primary" : "text-text-secondary"}>{mval(key, r.metrics[key])}{best?.id === r.id ? " best" : ""}</span> : <span className="text-text-tertiary">None</span>}</Td>
                  <Td className="text-text-secondary">{r.dataset.name} v{r.dataset.version}</Td>
                  <Td className="tabular-nums text-text-secondary">{r.gpuHours ? hours(r.gpuHours) : "0"}</Td>
                  <Td className="tabular-nums text-text-secondary">{usd(r.costUsd)}</Td>
                  <Td className="text-text-secondary">{ago(r.startedAt)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {tab === "compare" && (
        chosen.length < 2 ? (
          <Notice title="Pick two to four runs">Go to Runs and tick the runs to compare. Charts, parameters that differ and results are then shown side by side.</Notice>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-2.5">
              <label htmlFor="mk" className="text-[13px] text-text-secondary">Metric</label>
              <select id="mk" value={metric} onChange={(e) => setMetric(e.target.value)} className="h-8 rounded-md border border-border-strong bg-surface px-2 text-sm">
                {metricKeys.map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}
              </select>
              <span className="text-xs text-text-tertiary">{LOWER_IS_BETTER.has(metric) ? "Lower is better" : "Higher is better"}</span>
            </div>
            <ChartCard title={metric.replace(/_/g, " ")} subtitle="Each line is one run, by training step" data={data} series={series}>
              <Plot kind="line" data={data} series={series} height={260} />
            </ChartCard>
            <Card className="overflow-hidden">
              <Table>
                <Thead><tr><Th>Parameter</Th>{chosen.map((r) => <Th key={r.id}>{r.name}</Th>)}</tr></Thead>
                <tbody>
                  {differing.length === 0 && <Tr><Td colSpan={chosen.length + 1} className="text-text-tertiary">These runs used the same parameters.</Td></Tr>}
                  {differing.map((p) => <Tr key={p}><Td className="font-code text-xs">{p}</Td>{chosen.map((r) => <Td key={r.id} className="tabular-nums">{String(r.params[p] ?? "not set")}</Td>)}</Tr>)}
                  <Tr><Td className="font-medium">Data version</Td>{chosen.map((r) => <Td key={r.id}>{r.dataset.name} v{r.dataset.version}</Td>)}</Tr>
                  {Object.keys(chosen[0].metrics).map((m) => <Tr key={m}><Td className="font-medium">{m.replace(/_/g, " ")}</Td>{chosen.map((r) => <Td key={r.id} className="tabular-nums">{r.metrics[m] !== undefined ? mval(m, r.metrics[m]) : "None"}</Td>)}</Tr>)}
                </tbody>
              </Table>
            </Card>
          </div>
        )
      )}
    </div>
  );
}

/** A signed-in workspace shows what the training service returns. The sample workspace keeps its own screen. */
export default function ExperimentPage(props: { params: Promise<{ id: string }> }) {
  return useCrucibleStatus().connected ? <LiveExperiment {...props} /> : <SampleExperimentPage {...props} />;
}
