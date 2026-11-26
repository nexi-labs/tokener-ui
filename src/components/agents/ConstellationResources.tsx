"use client";

import { AlertTriangle } from "lucide-react";
import { NodeIcon } from "@/components/studio/icons";
import { NODE, iconFor, type Band, type UsageNode } from "@/lib/agents/connectors";
import { STATE_COLORS, type Pt } from "@/lib/agents/topology";

const ink = "rgb(var(--c-text-primary))";
const soft = "rgb(var(--c-text-secondary))";
const faint = "rgb(var(--c-text-tertiary))";
const surface = "rgb(var(--c-surface))";
const border = "rgb(var(--c-border-strong))";
export const LIVE_COLOR = "#2563EB";

/** A curve from an agent to a connection, channel or knowledge base, leaving the agent to the right and arriving from the left. */
export function resourcePath(from: Pt, to: Pt, inbound: boolean): { d: string; mid: Pt } {
  const r = NODE / 2 + 5;
  const a = { x: from.x + 44, y: from.y }; const b = { x: to.x - r, y: to.y };
  const dx = Math.max(90, (b.x - a.x) * 0.5);
  const d = inbound ? `M${b.x} ${b.y} C${b.x - dx} ${b.y}, ${a.x + dx} ${a.y}, ${a.x} ${a.y}` : `M${a.x} ${a.y} C${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
  return { d, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
}

/** A section of resources (knowledge, channels or connections). It is a drag handle: moving it moves every item inside. */
export function BandBox({ band, count, u, dim }: { band: Band; count: number; u: number; dim: boolean }) {
  return (
    <g data-kind="band" data-id={band.id} className="cursor-move" opacity={dim ? 0.3 : 1}>
      <rect x={band.x} y={band.y} width={band.w} height={band.h} rx={26} fill={surface} fillOpacity={0.6} stroke={border} strokeWidth={1.2} strokeDasharray="2 7" strokeLinecap="round" pointerEvents="all" />
      <text x={band.x + 26} y={band.y + 24 + 14 * u} fontSize={17 * u} fontWeight={600} fill={ink} pointerEvents="none">{band.title}</text>
      <text x={band.x + band.w - 26} y={band.y + 24 + 14 * u} textAnchor="end" fontSize={12 * u} fill={faint} pointerEvents="none">{count}</text>
      <text x={band.x + 26} y={band.y + 24 + 14 * u + 16 * u} fontSize={11.5 * u} fill={faint} pointerEvents="none">{band.hint}</text>
    </g>
  );
}

const TONE: Record<UsageNode["status"], string> = { ready: "", warning: STATE_COLORS.waiting, problem: STATE_COLORS.failed };

export function ResourceNode({ n, p, lod, u, doing, dim, selected, hot, reduced, labels }: {
  n: UsageNode; p: Pt; lod: number; u: number; doing?: string; dim: boolean; selected: boolean; hot: boolean; reduced: boolean; labels: boolean;
}) {
  const h = NODE / 2; const on = !!doing; const tone = TONE[n.status]; const square = n.kind === "knowledge";
  const shape = (extra: Record<string, unknown>) => square ? <rect x={-h} y={-h} width={NODE} height={NODE} rx={16} {...extra} /> : <circle r={h} {...extra} />;
  return (
    <g data-kind="resource" data-id={n.key} transform={`translate(${p.x} ${p.y})`} opacity={dim ? 0.22 : 1} className="cursor-pointer outline-none" tabIndex={0} role="button" aria-label={`${n.name}, ${n.subtitle}${on ? `, ${doing}` : ""}`}>
      {on && !reduced && <g pointerEvents="none">{shape({ className: "tok-ping", fill: "none", stroke: LIVE_COLOR, strokeWidth: 3 })}</g>}
      {(selected || hot) && shape({ fill: "none", stroke: selected ? "#02F5A1" : border, strokeWidth: selected ? 3 : 1.5, transform: "scale(1.16)" })}
      {shape({ fill: surface, stroke: on ? LIVE_COLOR : tone || border, strokeWidth: on ? 2.6 : tone ? 2 : 1.3 })}
      <foreignObject x={-14} y={-14} width={28} height={28} pointerEvents="none"><div className="grid place-items-center h-7 w-7"><NodeIcon icon={iconFor(n)} size={26} /></div></foreignObject>
      {tone && lod >= 1 && <g transform={`translate(${h - 3} ${-h + 3})`} pointerEvents="none"><circle r={10} fill={surface} stroke={tone} strokeWidth={1.4} /><AlertTriangle x={-6} y={-6.5} size={12} strokeWidth={2.2} color={tone} /></g>}
      {labels && (lod >= 1 || selected || hot) && (
        <g pointerEvents="none">
          <text y={h + 8 + 14 * u} textAnchor="middle" fontSize={14 * u} fontWeight={600} fill={ink} stroke={surface} strokeWidth={4} paintOrder="stroke">{n.name.length > 22 ? `${n.name.slice(0, 21)}…` : n.name}</text>
          {lod >= 2 && u < 1.4 && <text y={h + 10 + 14 * u + 13 * u} textAnchor="middle" fontSize={11 * u} fill={soft} stroke={surface} strokeWidth={3} paintOrder="stroke">{n.subtitle.length > 26 ? `${n.subtitle.slice(0, 25)}…` : n.subtitle}</text>}
        </g>
      )}
      {on && (
        <g transform={`translate(0 ${-h - 14 * u}) scale(${u})`} pointerEvents="none">
          <rect x={-(doing!.length * 3.4 + 12)} y={-11} width={doing!.length * 6.8 + 24} height={22} rx={11} fill={LIVE_COLOR} />
          <text textAnchor="middle" y={4} fontSize={11.5} fontWeight={600} fill="#fff">{doing}</text>
        </g>
      )}
    </g>
  );
}
