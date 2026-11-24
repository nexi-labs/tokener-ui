"use client";

import clsx from "clsx";
import { AlertTriangle, Table2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/Card";

const COLOR = { s1: "var(--chart-s1)", s2: "var(--chart-s2)", s3: "var(--chart-s3)", grey: "var(--chart-tick)" } as const;
export type Ser = { key: string; name: string; color: keyof typeof COLOR; dash?: boolean };

const tip = { fontSize: 12, borderRadius: 8, border: "1px solid rgb(var(--c-border))", background: "rgb(var(--c-surface))", color: "rgb(var(--c-text-primary))", boxShadow: "0 8px 24px rgba(7,25,30,0.12)" };
const tick = { fontSize: 11, fill: "var(--chart-tick)" };

export function Plot({ kind, data, series, unit = "", domain, refY, refX, height = 220, xKey = "t" }: {
  kind: "line" | "area" | "stack" | "bar"; data: Record<string, number | string>[]; series: Ser[]; unit?: string; domain?: [number, number];
  refY?: { y: number; label: string }; refX?: { x: string; label: string }; height?: number; xKey?: string;
}) {
  const common = { data, margin: { top: 8, right: 12, left: -8, bottom: 0 } };
  // Recharts only recognises its axis, legend and reference components as direct children of the chart, so these are a list and not a fragment.
  const axes = [
    <CartesianGrid key="grid" stroke="var(--chart-grid)" vertical={false} />,
    <XAxis key="x" dataKey={xKey} tick={tick} tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} interval="preserveStartEnd" minTickGap={28} />,
    <YAxis key="y" tick={tick} tickLine={false} axisLine={false} domain={domain ?? [0, "auto"]} unit={unit.length <= 2 ? unit : undefined} width={unit.length <= 2 ? 46 : 40} />,
    <Tooltip key="tip" contentStyle={tip} cursor={{ stroke: "var(--chart-axis)", fill: "rgba(138,153,156,0.12)" }} formatter={((v: number) => [`${v.toLocaleString("en-US")}${unit}`, undefined]) as any} />,
    series.length > 1 && <Legend key="legend" iconType="plainline" wrapperStyle={{ fontSize: 12, color: "var(--chart-legend)" }} />,
    refY && <ReferenceLine key="refy" y={refY.y} stroke="var(--chart-tick)" strokeDasharray="4 4" label={{ value: refY.label, position: "insideTopRight", fontSize: 11, fill: "var(--chart-legend)" }} />,
    refX && <ReferenceLine key="refx" x={refX.x} stroke="var(--chart-legend)" strokeDasharray="4 4" label={{ value: refX.label, position: "insideTop", fontSize: 11, fill: "var(--chart-legend)" }} />,
  ];
  const label = `${series.map((s) => s.name).join(", ")} chart`;
  return (
    <div style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        {kind === "bar" ? (
          <BarChart {...common}>{axes}{series.map((s) => <Bar key={s.key} dataKey={s.key} name={s.name} fill={COLOR[s.color]} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />)}</BarChart>
        ) : kind === "line" ? (
          <LineChart {...common}>{axes}{series.map((s) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={COLOR[s.color]} strokeWidth={2} strokeDasharray={s.dash ? "5 4" : undefined} dot={false} activeDot={{ r: 4, stroke: "var(--chart-dot)", strokeWidth: 2 }} isAnimationActive={false} />)}</LineChart>
        ) : (
          <AreaChart {...common}>{axes}{series.map((s) => <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stackId={kind === "stack" ? "a" : undefined} stroke={kind === "stack" ? "rgb(var(--c-surface))" : COLOR[s.color]} strokeWidth={kind === "stack" ? 2 : 2} strokeDasharray={s.dash ? "5 4" : undefined} fill={COLOR[s.color]} fillOpacity={kind === "stack" ? 0.85 : 0.12} dot={false} isAnimationActive={false} />)}</AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

/** A card around a chart with a switch to the same numbers as a table, so no value is only readable as a colour. */
export function ChartCard({ title, subtitle, data, series, xKey = "t", className, children, footer }: {
  title: string; subtitle?: string; data: Record<string, number | string>[]; series: Ser[]; xKey?: string; className?: string; children: ReactNode; footer?: ReactNode;
}) {
  const [table, setTable] = useState(false);
  return (
    <Card className={clsx("p-5 flex flex-col", className)}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0"><h3 className="text-sm font-semibold text-text-primary">{title}</h3>{subtitle && <p className="text-xs text-text-tertiary mt-0.5">{subtitle}</p>}</div>
        <button type="button" aria-pressed={table} onClick={() => setTable(!table)} title={table ? "Show chart" : "Show as table"}
          className={clsx("h-7 w-7 shrink-0 grid place-items-center rounded-md border text-text-secondary hover:bg-surface-subtle", table ? "border-accent-600" : "border-border")}>
          <Table2 size={14} /><span className="sr-only">{table ? "Show chart" : "Show as table"}</span>
        </button>
      </div>
      {table ? (
        <div className="max-h-[220px] overflow-auto rounded-md border border-border">
          <table className="w-full text-xs tabular-nums"><thead className="bg-surface-subtle sticky top-0"><tr><th className="text-left px-2 py-1.5 font-medium text-text-tertiary">{xKey === "t" ? "Time" : "Value"}</th>{series.map((s) => <th key={s.key} className="text-right px-2 py-1.5 font-medium text-text-tertiary">{s.name}</th>)}</tr></thead>
            <tbody>{data.map((r, i) => <tr key={i} className="border-t border-border"><td className="px-2 py-1">{r[xKey]}</td>{series.map((s) => <td key={s.key} className="px-2 py-1 text-right">{r[s.key]}</td>)}</tr>)}</tbody></table>
        </div>
      ) : children}
      {footer && <div className="mt-3 text-xs text-text-tertiary">{footer}</div>}
    </Card>
  );
}

// ------------------------------------------------------------------------------------------------ gauge

const pt = (cx: number, cy: number, r: number, th: number) => [cx + r * Math.cos(th), cy - r * Math.sin(th)] as const;

/**
 * A semicircle meter for one ratio against a limit. The arc stays in one hue. When the value is on the wrong side of its goal or floor, the arc
 * changes to the warning colour and the card says so in words with an icon, so the state never depends on colour alone.
 */
export function Gauge({ label, value, min = 0, max = 100, unit = "%", decimals = 1, mark, markKind = "goal", markLabel, hint }: {
  label: string; value: number; min?: number; max?: number; unit?: string; decimals?: number; mark?: number; markKind?: "goal" | "floor" | "budget"; markLabel?: string; hint?: string;
}) {
  const cx = 80, cy = 82, r = 62;
  const frac = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const th = Math.PI * (1 - frac);
  const [sx, sy] = pt(cx, cy, r, Math.PI), [ex, ey] = pt(cx, cy, r, th), [tx, ty] = pt(cx, cy, r, 0);
  const breach = mark !== undefined && ((markKind === "floor" && value < mark) || (markKind === "budget" && value > mark));
  let m: ReactNode = null;
  if (mark !== undefined) {
    const a = Math.PI * (1 - (mark - min) / (max - min)), [x1, y1] = pt(cx, cy, r - 9, a), [x2, y2] = pt(cx, cy, r + 9, a);
    m = <line x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-text-primary" strokeWidth={2} strokeLinecap="round" />;
  }
  const shown = `${value.toFixed(decimals)}${unit}`;
  return (
    <Card className="p-4 flex flex-col items-center text-center">
      <div className="text-xs text-text-tertiary self-start">{label}</div>
      <div role="meter" aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={+value.toFixed(decimals)} aria-valuetext={shown} className="w-full max-w-[190px]">
        <svg viewBox="0 0 160 100" className="w-full h-auto" aria-hidden>
          <path d={`M ${sx} ${sy} A ${r} ${r} 0 0 1 ${tx} ${ty}`} fill="none" className="stroke-surface-muted" strokeWidth={10} strokeLinecap="round" />
          {frac > 0.004 && <path d={`M ${sx} ${sy} A ${r} ${r} 0 0 1 ${ex} ${ey}`} fill="none" className={breach ? "stroke-status-degraded" : "stroke-accent-600"} strokeWidth={10} strokeLinecap="round" />}
          {m}
          <text x={cx} y={cy - 12} textAnchor="middle" className="fill-text-primary" style={{ fontSize: 24, fontWeight: 600 }}>{shown}</text>
          <text x={sx} y={96} textAnchor="middle" className="fill-text-tertiary" style={{ fontSize: 9 }}>{min}{unit === "%" ? "%" : ""}</text>
          <text x={tx} y={96} textAnchor="middle" className="fill-text-tertiary" style={{ fontSize: 9 }}>{max}{unit === "%" ? "%" : ` ${unit.trim()}`}</text>
        </svg>
      </div>
      <div className="min-h-[2.25rem] text-xs">
        {breach ? <span className="inline-flex items-center gap-1 text-status-degraded font-medium"><AlertTriangle size={12} /> {markKind === "budget" ? "Over" : "Below"} {markLabel?.toLowerCase()}</span> : <span className="text-text-secondary">{markLabel}</span>}
        {hint && <div className="text-text-tertiary mt-0.5">{hint}</div>}
      </div>
    </Card>
  );
}
