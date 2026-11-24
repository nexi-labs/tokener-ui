"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Form";
import { LOWER_IS_BETTER } from "@/lib/crucible/ct";
import type { Run } from "@/lib/crucible/types";
import { mval } from "./bits";

const numOf = (r: Run, k: string): number | undefined => {
  if (k === "gpu_hours") return r.gpuHours; if (k === "cost") return r.costUsd; if (k === "dataset_version") return r.dataset.version;
  if (k.startsWith("m:")) return r.metrics[k.slice(2)];
  const v = r.params[k.slice(2)]; const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) && v !== "" && typeof v !== "boolean" ? n : undefined;
};
const label = (k: string) => (k.startsWith("p:") ? `param ${k.slice(2)}` : k.startsWith("m:") ? k.slice(2).replace(/_/g, " ") : k.replace(/_/g, " "));
const fmtN = (n: number) => (Math.abs(n) >= 1000 ? n.toFixed(0) : Math.abs(n) >= 1 ? n.toFixed(2) : Math.abs(n) === 0 ? "0" : n.toPrecision(2));

export function optionsFor(runs: Run[]) {
  const keys = new Set<string>(["gpu_hours", "cost", "dataset_version"]);
  runs.forEach((r) => { Object.keys(r.metrics).forEach((m) => keys.add("m:" + m)); Object.keys(r.params).forEach((p) => { if (numOf(r, "p:" + p) !== undefined) keys.add("p:" + p); }); });
  return [...keys];
}

/** Parallel coordinates: one line for each run across parameters and results. Good for seeing which settings lead to the best runs. */
export function ParallelCoords({ runs, metric }: { runs: Run[]; metric: string }) {
  const all = useMemo(() => optionsFor(runs), [runs]);
  const axes = useMemo(() => { const params = all.filter((k) => k.startsWith("p:") && runs.filter((r) => numOf(r, k) !== undefined).length >= Math.max(2, runs.length * 0.5)).slice(0, 4); return [...params, "gpu_hours", "m:" + metric]; }, [all, runs, metric]);
  const [hover, setHover] = useState<string | null>(null);
  const W = 880, H = 300, padX = 70, padT = 36, padB = 30; const step = (W - padX * 2) / (axes.length - 1);
  const range = useMemo(() => axes.map((k) => { const v = runs.map((r) => numOf(r, k)).filter((x): x is number => x !== undefined); return [Math.min(...v), Math.max(...v)] as const; }), [axes, runs]);
  const lower = LOWER_IS_BETTER.has(metric); const ms = runs.map((r) => r.metrics[metric]).filter((x) => x !== undefined); const mlo = Math.min(...ms), mhi = Math.max(...ms);
  const goodness = (r: Run) => { const m = r.metrics[metric]; if (m === undefined || mhi === mlo) return 0.5; const t = (m - mlo) / (mhi - mlo); return lower ? 1 - t : t; };
  const y = (i: number, v: number) => { const [lo, hi] = range[i]; return padT + (H - padT - padB) * (1 - (hi === lo ? 0.5 : (v - lo) / (hi - lo))); };
  const rows = runs.filter((r) => axes.every((k) => numOf(r, k) !== undefined));
  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold text-text-primary">Parallel coordinates</h3><p className="text-xs text-text-tertiary mt-0.5 mb-2">Each line is a run. Darker green lines are better on {label("m:" + metric)}. Hover a line to see which run it is.</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Parallel coordinates of runs">
        {axes.map((k, i) => <g key={k}><line x1={padX + i * step} x2={padX + i * step} y1={padT} y2={H - padB} stroke="rgb(var(--c-border-strong))" /><text x={padX + i * step} y={18} textAnchor="middle" fontSize={11} fontWeight={600} fill="rgb(var(--c-text-primary))">{label(k)}</text>
          <text x={padX + i * step} y={H - 10} textAnchor="middle" fontSize={10} fill="rgb(var(--c-text-tertiary))">{fmtN(range[i][0])}</text><text x={padX + i * step} y={padT - 6} textAnchor="middle" fontSize={10} fill="rgb(var(--c-text-tertiary))">{fmtN(range[i][1])}</text></g>)}
        {rows.sort((a, b) => goodness(a) - goodness(b)).map((r) => { const g = goodness(r); const on = hover === r.id; return (
          <g key={r.id} onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover(null)}>
            <polyline points={axes.map((k, i) => `${padX + i * step},${y(i, numOf(r, k)!)}`).join(" ")} fill="none" stroke={on ? "#07191E" : `rgba(6,150,100,${0.18 + g * 0.75})`} strokeWidth={on ? 3 : 1.4 + g * 1.4} />
            <polyline points={axes.map((k, i) => `${padX + i * step},${y(i, numOf(r, k)!)}`).join(" ")} fill="none" stroke="transparent" strokeWidth={12}><title>{r.name}: {label("m:" + metric)} {mval(metric, r.metrics[metric])}</title></polyline></g>); })}
      </svg>
      <div className="text-xs text-text-secondary h-5 mt-1">{hover ? <>{runs.find((r) => r.id === hover)?.name} · <Link className="underline underline-offset-2" href={`/crucible/runs/${hover}`}>open</Link></> : `${rows.length} of ${runs.length} runs have every value shown.`}</div>
    </Card>
  );
}

/** One parameter against one result. */
export function ScatterCard({ runs, metric }: { runs: Run[]; metric: string }) {
  const opts = useMemo(() => optionsFor(runs).filter((k) => !k.startsWith("m:")), [runs]);
  const [xk, setXk] = useState(opts.find((k) => k.startsWith("p:")) ?? "gpu_hours"); const [yk, setYk] = useState("m:" + metric);
  const all = optionsFor(runs); const W = 960, H = 300, p = { l: 64, r: 40, t: 14, b: 42 };
  const pts = runs.map((r) => ({ r, x: numOf(r, xk), y: numOf(r, yk) })).filter((d): d is { r: Run; x: number; y: number } => d.x !== undefined && d.y !== undefined && d.r.status !== "failed");
  const xr = [Math.min(...pts.map((d) => d.x)), Math.max(...pts.map((d) => d.x))], yr = [Math.min(...pts.map((d) => d.y)), Math.max(...pts.map((d) => d.y))];
  const X = (v: number) => p.l + (W - p.l - p.r) * (xr[1] === xr[0] ? 0.5 : (v - xr[0]) / (xr[1] - xr[0])); const Y = (v: number) => p.t + (H - p.t - p.b) * (1 - (yr[1] === yr[0] ? 0.5 : (v - yr[0]) / (yr[1] - yr[0])));
  const best = pts.reduce<typeof pts[number] | undefined>((b, d) => (!b || (LOWER_IS_BETTER.has(yk.slice(2)) ? d.y < b.y : d.y > b.y) ? d : b), undefined);
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap"><div><h3 className="text-sm font-semibold text-text-primary">Parameter against result</h3><p className="text-xs text-text-tertiary mt-0.5">Failed runs are left out.</p></div>
        <div className="flex gap-2"><div className="w-40"><Select aria-label="Horizontal axis" value={xk} onChange={(e) => setXk(e.target.value)}>{opts.map((k) => <option key={k} value={k}>{label(k)}</option>)}</Select></div><div className="w-40"><Select aria-label="Vertical axis" value={yk} onChange={(e) => setYk(e.target.value)}>{all.filter((k) => k.startsWith("m:") || k === "gpu_hours" || k === "cost").map((k) => <option key={k} value={k}>{label(k)}</option>)}</Select></div></div></div>
      {pts.length < 2 ? <p className="text-sm text-text-secondary mt-6">Not enough runs with both values.</p> : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto mt-2" role="img" aria-label="Scatter of runs">
          <line x1={p.l} x2={W - p.r} y1={H - p.b} y2={H - p.b} stroke="rgb(var(--c-border-strong))" /><line x1={p.l} x2={p.l} y1={p.t} y2={H - p.b} stroke="rgb(var(--c-border-strong))" />
          {[0, 0.5, 1].map((t) => <g key={t}><text x={p.l - 6} y={Y(yr[0] + (yr[1] - yr[0]) * t) + 3} textAnchor="end" fontSize={11} fill="rgb(var(--c-text-tertiary))">{fmtN(yr[0] + (yr[1] - yr[0]) * t)}</text><text x={X(xr[0] + (xr[1] - xr[0]) * t)} y={H - p.b + 16} textAnchor={t === 0 ? "start" : t === 1 ? "end" : "middle"} fontSize={11} fill="rgb(var(--c-text-tertiary))">{fmtN(xr[0] + (xr[1] - xr[0]) * t)}</text></g>)}
          <text x={(W + p.l) / 2} y={H - 4} textAnchor="middle" fontSize={12} fill="rgb(var(--c-text-secondary))">{label(xk)}</text><text transform={`translate(12 ${(H - p.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize={12} fill="rgb(var(--c-text-secondary))">{label(yk)}</text>
          {pts.map((d) => <Link key={d.r.id} href={`/crucible/runs/${d.r.id}`}><circle cx={X(d.x)} cy={Y(d.y)} r={best?.r.id === d.r.id ? 8 : 6} fill={best?.r.id === d.r.id ? "#02F5A1" : "rgba(6,150,100,0.55)"} stroke="#07191E" strokeWidth={best?.r.id === d.r.id ? 2 : 0.8}><title>{d.r.name}: {label(xk)} {fmtN(d.x)}, {label(yk)} {fmtN(d.y)}</title></circle></Link>)}
        </svg>)}
    </Card>
  );
}
