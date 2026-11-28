"use client";

import clsx from "clsx";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Cable, Cpu, Plug, Server, Users, Waypoints } from "lucide-react";
import { curve, useEdges } from "@/components/agents/NetworkCanvas";
import { KIND_COLOR, KIND_LABEL, pathFrom, type Canvas, type CanvasNode, type NodeKind } from "@/lib/mlops/ai-canvas";
import type { McpServerSpec } from "@/lib/mlops/mcp-model";
import type { Provider } from "@/lib/gateway/data";

/**
 * How a model reaches the people and agents that use it, drawn in four columns with a colour for each kind of thing: models on the left, the gateway, the MCP servers
 * that call a model through it, and who may call each server. Point at anything to light its whole path. Lines are measured from the cards themselves.
 */
const HEAD = ["Models", "Gateway", "MCP servers", "Who may call"];
const ICON: Record<NodeKind, typeof Cpu> = { hosted: Server, own: Plug, vendor: Cpu, gateway: Waypoints, mcp: Cable, callers: Users };
const HEALTH: Record<string, string> = { healthy: "#0E9F77", progressing: "#2563EB", degraded: "#C2761A", attention: "#C2761A", failed: "#D14343", down: "#D14343", offline: "#8A94A0", unknown: "#8A94A0", draft: "#8A94A0" };

export function AiCanvas({ canvas, servers, providers, kindHover, onAddToGateway }: { canvas: Canvas; servers: McpServerSpec[]; providers: Provider[]; kindHover?: NodeKind | null; onAddToGateway?: (deploymentId: string) => void }) {
  const [hl, setHl] = useState<string | null>(null);
  const cols = useMemo(() => [0, 1, 2, 3].map((c) => canvas.nodes.filter((n) => n.column === c)), [canvas]);
  const lit = useMemo(() => {
    if (hl) return pathFrom(canvas, hl, { servers, providers });
    if (kindHover) { const s = new Set<string>(); canvas.nodes.filter((n) => n.kind === kindHover).forEach((n) => pathFrom(canvas, n.id, { servers, providers }).forEach((x) => s.add(x))); return s; }
    return null;
  }, [hl, kindHover, canvas, servers, providers]);
  const { box, ref, geo } = useEdges([canvas]);
  const dim = (id: string) => !!lit && !lit.has(id);

  return (
    <div ref={box} className="relative rounded-lg border border-border bg-surface-subtle overflow-x-auto" style={{ backgroundImage: "radial-gradient(rgb(var(--c-border)) 1px, transparent 1px)", backgroundSize: "14px 14px" }} data-testid="ai-canvas">
      <div className="relative grid min-w-[980px] gap-x-12 p-6" style={{ gridTemplateColumns: "minmax(0,1.25fr) minmax(0,0.9fr) minmax(0,1.15fr) minmax(0,0.8fr)" }}>
        <svg className="absolute inset-0 pointer-events-none" width={geo.w} height={geo.h} aria-hidden>
          {canvas.edges.map((e) => {
            const a = geo.pts.get(e.from), b = geo.pts.get(e.to); if (!a || !b) return null; const mid: [number, number] = [(a.r[0] + b.l[0]) / 2, (a.r[1] + b.l[1]) / 2];
            return (
              <g key={e.id} opacity={dim(e.id) ? 0.12 : 1} className="transition-opacity">
                <path d={curve(a.r, b.l)} fill="none" stroke={KIND_COLOR[e.kind]} strokeOpacity={lit?.has(e.id) ? 0.95 : 0.55} strokeWidth={lit?.has(e.id) ? 2.4 : 1.7} strokeDasharray={e.dashed ? "5 5" : undefined} />
                {e.note && <text x={mid[0]} y={mid[1] - 5} textAnchor="middle" fontSize={10.5} fill={KIND_COLOR[e.kind]} stroke="rgb(var(--c-surface-subtle))" strokeWidth={4} paintOrder="stroke" fontWeight={600}>{e.note}</text>}
              </g>
            );
          })}
        </svg>
        {HEAD.map((h, i) => <div key={h} className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary mb-3" style={{ gridColumn: i + 1, gridRow: 1 }}>{h}</div>)}
        {cols.map((nodes, c) => (
          <div key={c} className="flex flex-col justify-center gap-3" style={{ gridColumn: c + 1, gridRow: 2 }}>
            {nodes.map((n) => <NodeCard key={n.id} n={n} refFn={ref} dim={dim(n.id)} on={() => setHl(n.id)} off={() => setHl(null)} onAdd={onAddToGateway} />)}
            {nodes.length === 0 && <div className="text-xs text-text-tertiary">{c === 2 ? "No MCP servers yet." : c === 0 ? "No models yet." : "Nobody has a grant yet."}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function NodeCard({ n, refFn, dim, on, off, onAdd }: { n: CanvasNode; refFn: (id: string) => (el: HTMLElement | null) => void; dim: boolean; on: () => void; off: () => void; onAdd?: (id: string) => void }) {
  const color = KIND_COLOR[n.kind]; const Ic = ICON[n.kind]; const gw = n.kind === "gateway";
  const body = (
    <>
      <span className="h-8 w-8 shrink-0 rounded-md grid place-items-center" style={gw ? { background: "#07191E", color: "#02F5A1" } : { background: color + "1A", color }}><Ic size={16} /></span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[13px] font-semibold text-text-primary">{n.label}</span>
        <span className="block truncate text-[11.5px] text-text-tertiary">{n.sub}</span>
      </span>
      {n.health && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: HEALTH[n.health] ?? "#8A94A0" }} title={n.health} />}
    </>
  );
  const cls = clsx("flex items-center gap-2.5 rounded-xl border bg-surface px-3 py-2.5 shadow-sm transition-opacity", n.outside ? "border-dashed border-border-strong" : "border-border-strong", dim && "opacity-25", gw && "min-w-[190px]");
  return (
    <div className="relative" onMouseEnter={on} onMouseLeave={off} onFocus={on} onBlur={off}>
      {n.href ? <Link ref={refFn(n.id)} href={n.href} className={clsx(cls, "hover:border-text-tertiary")} style={{ borderLeft: `3px solid ${color}` }}>{body}</Link>
        : <div ref={refFn(n.id)} className={cls} style={{ borderLeft: `3px solid ${color}` }}>{body}</div>}
      {n.outside && n.deploymentId && onAdd && <button type="button" onClick={() => onAdd(n.deploymentId!)} className="mt-1 ml-1 text-[11.5px] font-medium text-accent-700 hover:underline">Add to the gateway</button>}
    </div>
  );
}

export function CanvasLegend({ counts, onHover }: { counts: Record<NodeKind, number>; onHover: (k: NodeKind | null) => void }) {
  const order: NodeKind[] = ["hosted", "own", "vendor", "gateway", "mcp", "callers"];
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-text-secondary" aria-label="Legend">
      {order.map((k) => (
        <li key={k} onMouseEnter={() => onHover(k)} onMouseLeave={() => onHover(null)} className="inline-flex items-center gap-1.5 cursor-default">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: KIND_COLOR[k] }} />{KIND_LABEL[k]}<span className="text-text-tertiary tabular-nums">{counts[k]}</span>
        </li>
      ))}
    </ul>
  );
}
