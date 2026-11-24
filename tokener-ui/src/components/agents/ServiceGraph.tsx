"use client";

import { useMemo } from "react";
import { FrameworkMark } from "@/components/agents/bits";
import { layoutLayers, serviceGraph } from "@/lib/agents/observe";
import { PROTOCOL_BY_ID } from "@/lib/agents/topology";
import type { Agent, Trace } from "@/lib/agents/types";
import { dur } from "@/lib/agents/format";

const RED = "#DC2626";

/**
 * Who calls whom, over many traces. A node is an agent, sized by how many traces it took part in. A line is a hand-off, as thick as the number of calls,
 * and it fades from the caller's colour to the callee's. This is the dependency view a Zipkin user would look for.
 */
export function ServiceGraph({ traces, agents, colors, selected, onPick }: { traces: Trace[]; agents: Agent[]; colors: Record<string, string>; selected: string | null; onPick: (id: string | null) => void }) {
  const g = useMemo(() => serviceGraph(traces), [traces]);
  const w = (id: string) => g.nodes.find((n) => n.agentId === id)?.traces ?? 0;
  const pos = useMemo(() => layoutLayers(g.nodes.map((n) => n.agentId), g.edges, w), [g]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!g.nodes.length) return <div className="border border-border rounded-lg bg-surface p-10 text-center text-sm text-text-secondary">No traces match, so there is nothing to draw.</div>;
  const cols = Math.max(...Object.values(pos).map((p) => p.col)) + 1; const rows = Math.max(...Object.values(pos).map((p) => p.row)) + 1;
  const GX = 270; const GY = 130; const X0 = 110; const Y0 = 70;
  const W = Math.max(640, X0 * 2 + (cols - 1) * GX); const H = Y0 * 2 + (rows - 1) * GY;
  const P = (id: string) => ({ x: X0 + pos[id].col * GX, y: Y0 + pos[id].row * GY });
  const maxCalls = Math.max(1, ...g.edges.map((e) => e.calls)); const maxT = Math.max(1, ...g.nodes.map((n) => n.traces));
  const radius = (n: number) => 20 + (n / maxT) * 14;
  return (
    <div className="border border-border rounded-lg bg-surface overflow-auto">
      <svg width={W} height={H} role="img" aria-label={`Dependency graph of ${g.nodes.length} agents and ${g.edges.length} hand-offs`}>
        <defs>
          {g.edges.map((e, i) => { const a = P(e.from); const b = P(e.to); return <linearGradient key={i} id={`sg-${i}`} gradientUnits="userSpaceOnUse" x1={a.x} y1={a.y} x2={b.x} y2={b.y}><stop offset="0" stopColor={colors[e.from]} /><stop offset="1" stopColor={colors[e.to]} /></linearGradient>; })}
        </defs>
        {g.edges.map((e, i) => {
          const a = P(e.from); const b = P(e.to); const ra = radius(w(e.from)); const rb = radius(w(e.to));
          const dx = b.x - a.x; const dy = b.y - a.y; const len = Math.hypot(dx, dy) || 1; const ux = dx / len; const uy = dy / len;
          const sx = a.x + ux * (ra + 4); const sy = a.y + uy * (ra + 4); const ex = b.x - ux * (rb + 8); const ey = b.y - uy * (rb + 8);
          const off = 44; const cx = (sx + ex) / 2 - uy * off; const cy = (sy + ey) / 2 + ux * off;
          const mx = 0.25 * sx + 0.5 * cx + 0.25 * ex; const my = 0.25 * sy + 0.5 * cy + 0.25 * ey;
          const dim = selected && selected !== e.from && selected !== e.to; const p = PROTOCOL_BY_ID[e.protocol]; const sw = 1.5 + (e.calls / maxCalls) * 4.5;
          return (
            <g key={i} opacity={dim ? 0.15 : 1}>
              <path d={`M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`} fill="none" stroke={`url(#sg-${i})`} strokeWidth={sw} strokeLinecap="round" strokeDasharray={e.protocol === "queue" ? "7 5" : undefined} />
              <path d={`M ${ex - ux * 8 - uy * 5} ${ey - uy * 8 + ux * 5} L ${ex} ${ey} L ${ex - ux * 8 + uy * 5} ${ey - uy * 8 - ux * 5}`} fill="none" stroke={colors[e.to]} strokeWidth="2" />
              <g transform={`translate(${mx} ${my})`}>
                <rect x={-52} y={-15} width={104} height={30} rx={15} fill="rgb(var(--c-surface))" stroke={e.errors ? RED : p.color} />
                <text y={-2} textAnchor="middle" fontSize="10.5" fontWeight="600" fill={p.color}>{p.label}, {e.calls} calls</text>
                <text y={10} textAnchor="middle" fontSize="9.5" fill={e.errors ? RED : "var(--chart-legend)"}>{e.errors ? `${e.errors} failed, ` : ""}p95 {dur(e.p95Ms)}</text>
              </g>
            </g>
          );
        })}
        {g.nodes.map((n) => {
          const p = P(n.agentId); const r = radius(n.traces); const a = agents.find((x) => x.id === n.agentId); const on = selected === n.agentId; const dim = selected && !on && !g.edges.some((e) => (e.from === selected && e.to === n.agentId) || (e.to === selected && e.from === n.agentId));
          return (
            <g key={n.agentId} transform={`translate(${p.x} ${p.y})`} onClick={() => onPick(on ? null : n.agentId)} style={{ cursor: "pointer" }} opacity={dim ? 0.3 : 1} role="button" aria-label={`${a?.title ?? n.agentId}, ${n.traces} traces`} aria-pressed={on}>
              <circle r={r + 5} fill={colors[n.agentId]} opacity={on ? 0.22 : 0.1} />
              <circle r={r} fill="rgb(var(--c-surface))" stroke={colors[n.agentId]} strokeWidth={on ? 4 : 3} />
              <foreignObject x={-9} y={-9} width={18} height={18}><div style={{ width: 18, height: 18 }}><FrameworkMark id={a?.framework ?? "custom"} size={18} /></div></foreignObject>
              <text y={r + 17} textAnchor="middle" fontSize="12" fontWeight="500" fill="rgb(var(--c-text-primary))">{a?.title ?? n.agentId}</text>
              <text y={r + 31} textAnchor="middle" fontSize="10.5" fill="var(--chart-legend)">{n.traces} traces{n.errors ? `, ${n.errors} failed spans` : ""}</text>
              {n.errors > 0 && <circle cx={r * 0.72} cy={-r * 0.72} r={5} fill={RED} />}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
