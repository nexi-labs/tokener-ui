"use client";

import clsx from "clsx";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Notice } from "@/components/mlops/ui";
import { fmtInt } from "@/components/refinery/bits";
import { SENSOR_FORMULA, intervalLabel } from "@/lib/refinery/sensor";
import type { Pt, SensorReport, SeriesReport } from "@/lib/refinery/sensor";

const tone = (s: number) => (s >= 90 ? "healthy" : s >= 70 ? "degraded" : "down") as "healthy" | "degraded" | "down";
const FLAG: Record<NonNullable<Pt["flag"]>, { color: string; label: string }> = {
  spike: { color: "#E5A63A", label: "Spike" }, shift: { color: "#8A5CC9", label: "Level shift" }, flatline: { color: "#5B7DB1", label: "Flatline" }, implausible: { color: "#D6453D", label: "Implausible" }, gap: { color: "#07191E", label: "After a gap" },
};

/** A line of one signal with its findings marked, drawn without a chart library so it prints and scales. */
function SignalChart({ s }: { s: SeriesReport }) {
  const W = 880, H = 260, L = 52, R = 16, T = 16, B = 30; const pw = W - L - R, ph = H - T - B;
  const pts = s.points;
  const shown = pts.filter((p) => p.v !== null && p.flag !== "implausible");
  const ys = shown.map((p) => p.v as number); const lo = Math.min(...ys), hi = Math.max(...ys); const span = hi - lo || 1;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t; const x = (t: number) => L + ((t - t0) / Math.max(1, t1 - t0)) * pw; const y = (v: number) => T + ph - ((v - lo) / span) * ph;
  // Break the line at gaps and at removed points.
  const segs: string[] = []; let cur: string[] = [];
  pts.forEach((p, i) => { const brk = p.v === null || p.flag === "implausible" || (p.flag === "gap" && i > 0); if (brk && cur.length) { segs.push(cur.join(" ")); cur = []; } if (p.v !== null && p.flag !== "implausible") cur.push(`${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`); });
  if (cur.length) segs.push(cur.join(" "));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + span * f);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${s.column} of ${s.entity} over time with findings marked`}>
      {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="currentColor" className="text-border" /><text x={L - 8} y={y(v) + 3} textAnchor="end" fontSize="10" className="fill-text-tertiary tabular-nums">{Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(1)}</text></g>)}
      {pts.filter((p) => p.flag === "gap").map((p, i) => <line key={i} x1={x(p.t)} x2={x(p.t)} y1={T} y2={T + ph} stroke={FLAG.gap.color} strokeDasharray="3 3" opacity="0.5" />)}
      {segs.map((d, i) => <polyline key={i} fill="none" stroke="#0B8F63" strokeWidth="1.6" points={d} />)}
      {pts.filter((p) => p.v !== null && p.flag && p.flag !== "gap" && p.flag !== "implausible").map((p, i) => <circle key={i} cx={x(p.t)} cy={y(p.v as number)} r="3.4" fill={FLAG[p.flag!].color} />)}
      <text x={L} y={H - 8} fontSize="10" className="fill-text-tertiary">{new Date(t0).toISOString().slice(0, 16).replace("T", " ")} UTC</text>
      <text x={W - R} y={H - 8} fontSize="10" textAnchor="end" className="fill-text-tertiary">{new Date(t1).toISOString().slice(0, 16).replace("T", " ")} UTC</text>
    </svg>
  );
}

export function SensorQuality({ report }: { report: SensorReport }) {
  const [sel, setSel] = useState(0); const s = report.series[Math.min(sel, report.series.length - 1)];
  const t = report.totals;
  const tiles: [string, string, string][] = [
    ["Sensor quality", `${report.score}`, `${report.series.length} signals`], ["Gaps", fmtInt(t.gaps), `${fmtInt(t.missing)} samples missing`], ["Flatline samples", fmtInt(t.flatlineSamples), "a stuck sensor repeats one value"],
    ["Spikes and shifts", fmtInt(t.spikes + t.shiftSamples), `${fmtInt(t.spikes)} spike${t.spikes === 1 ? "" : "s"}, ${fmtInt(t.shiftSamples)} shifted sample${t.shiftSamples === 1 ? "" : "s"}`], ["Implausible", fmtInt(t.implausible), "out of range or a sentinel"],
  ];
  return (
    <div className="space-y-5">
      <p className="text-sm text-text-secondary max-w-3xl">Time series from machines fail in ways tables do not. Refinery read <span className="font-medium text-text-primary">{report.timeColumn}</span> as the time column{report.entityColumn ? <> and <span className="font-medium text-text-primary">{report.entityColumn}</span> as the machine</> : null}, then checked every measurement for missing samples, stuck values, spikes and readings that cannot be right.</p>
      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3">{tiles.map(([l, v, sub]) => <Card key={l}><div className="p-4"><div className="text-xs text-text-tertiary">{l}</div><div className="text-xl font-semibold tabular-nums mt-1">{v}</div><div className="text-xs text-text-tertiary mt-0.5">{sub}</div></div></Card>)}</div>
      <Card>
        <Table>
          <Thead><tr><Th>Machine</Th><Th>Signal</Th><Th>Samples</Th><Th>Interval</Th><Th>Gaps</Th><Th>Flatline</Th><Th>Spikes</Th><Th>Shifts</Th><Th>Implausible</Th><Th>Score</Th></tr></Thead>
          <tbody>{report.series.map((r, i) => (
            <Tr key={`${r.entity}-${r.column}`} onClick={() => setSel(i)} className={clsx("cursor-pointer", i === sel && "bg-surface-muted")}>
              <Td className="font-medium whitespace-nowrap">{r.entity}</Td><Td><span className="font-mono text-[12.5px]">{r.column}</span></Td>
              <Td className="tabular-nums">{fmtInt(r.n)}</Td><Td className="tabular-nums">{intervalLabel(r.intervalMs)}</Td>
              <Td className="tabular-nums">{r.gaps.count ? `${r.gaps.missing} missing` : "0"}</Td>
              <Td className="tabular-nums">{r.flatlines.samples}</Td><Td className="tabular-nums">{r.spikes.count}</Td><Td className="tabular-nums">{r.shifts.samples}</Td><Td className="tabular-nums">{r.implausible.count}</Td>
              <Td><Badge tone={tone(r.score)}>{r.score}</Badge></Td>
            </Tr>))}</tbody>
        </Table>
      </Card>
      <Card><div className="p-5 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-[13px] font-semibold">{s.entity !== "all" ? `${s.entity}, ` : ""}<span className="font-mono">{s.column}</span>{s.unit?.label ? <span className="text-text-tertiary font-normal"> ({s.unit.label})</span> : null}</h3><p className="text-xs text-text-tertiary">Regular spacing {s.regularity}%{s.drift.flagged ? `, possible drift of ${s.drift.shift} standard deviations` : ""}{s.duplicateTime ? `, ${s.duplicateTime} repeated timestamp` : ""}</p></div>
        <SignalChart s={s} />
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-text-secondary">{(Object.keys(FLAG) as (keyof typeof FLAG)[]).map((k) => <li key={k} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: FLAG[k].color }} />{FLAG[k].label}</li>)}</ul>
      </div></Card>
      <Card><div className="p-5"><h3 className="text-[13px] font-semibold mb-3">What to do about it</h3><ul className="space-y-2 text-[13px] text-text-secondary list-disc pl-5">{report.recommendations.map((r) => <li key={r}>{r}</li>)}</ul></div></Card>
      <Notice tone="info" title="How the score is made">{SENSOR_FORMULA} {report.basis} The score is a product choice inspired by the anomaly kinds ISO 8000-210 addresses, not a conformance claim, and it describes the sample rows, not the whole input.</Notice>
    </div>
  );
}
