"use client";

import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, ClipboardCheck, Compass, Hand, Inbox, Sparkles, User, Zap, type LucideIcon } from "lucide-react";
import type { Agent } from "@/lib/agents/types";
import { describeWhen, layoutMesh, ROLE_LABEL, type CaseRun, type Mesh, type MeshRole, type MeshStats } from "@/lib/agents/mesh";

/**
 * The picture of a mesh: each agent as a card in its role, the handoff rules as lines with their conditions, loops drawn underneath, and a person where a person decides.
 * Given a case run and a position on its clock it shows where the case is: the working agent pulses, the case travels along the handoff, and everything the case has touched stays lit.
 * progress counts steps: 2.4 is 40% of the way through the third step. Leave it null to show the mesh at rest.
 */
const ROLE: Record<MeshRole, { icon: LucideIcon; color: string }> = {
  intake: { icon: Inbox, color: "#2563EB" }, coordinator: { icon: Compass, color: "#7C3AED" }, specialist: { icon: Sparkles, color: "#0E9F77" },
  reviewer: { icon: ClipboardCheck, color: "#B7791F" }, executor: { icon: Zap, color: "#D14343" },
};
export const NODE_W = 200, NODE_H = 118, GX = 96, GY = 44, PAD = 36, TOP = 28, BOTTOM = 92;

const bez = (p0: [number, number], p1: [number, number], p2: [number, number], p3: [number, number], u: number): [number, number] => {
  const k = 1 - u; return [k * k * k * p0[0] + 3 * k * k * u * p1[0] + 3 * k * u * u * p2[0] + u * u * u * p3[0], k * k * k * p0[1] + 3 * k * k * u * p1[1] + 3 * k * u * u * p2[1] + u * u * u * p3[1]];
};

export function MeshCanvas({ mesh, agents, stats, run, progress, selected, onSelect }: { mesh: Mesh; agents: Agent[]; stats?: MeshStats; run?: CaseRun | null; progress?: number | null; selected?: string | null; onSelect?: (id: string) => void }) {
  const by = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]); const title = (id: string) => by.get(id)?.title ?? id;
  const lay = useMemo(() => layoutMesh(mesh), [mesh]);
  const wrap = useRef<HTMLDivElement>(null); const [cw, setCw] = useState(0);
  useEffect(() => { const el = wrap.current; if (!el) return; const ro = new ResizeObserver(() => setCw(el.clientWidth)); ro.observe(el); setCw(el.clientWidth); return () => ro.disconnect(); }, []);
  const W = PAD * 2 + lay.cols * NODE_W + (lay.cols - 1) * GX; const H = TOP + PAD + lay.rows * NODE_H + (lay.rows - 1) * GY + BOTTOM;
  const pos = (id: string) => ({ x: PAD + lay.col[id] * (NODE_W + GX), y: TOP + PAD + ((lay.rows - 1) / 2 + lay.row[id]) * (NODE_H + GY) });

  const steps = run?.steps ?? []; const p = progress ?? null;
  const idx = p === null || !steps.length ? -1 : Math.min(steps.length - 1, Math.floor(p)); const frac = p === null ? 0 : Math.min(1, p - Math.floor(p)); const finished = p !== null && steps.length > 0 && p >= steps.length;
  const cur = idx >= 0 ? steps[idx] : null;
  const personFor = (i: number): string | null => { const s = steps[i]; if (!s || s.agentId) return null; if (s.via) return mesh.handoffs.find((h) => h.id === s.via)?.to ?? null; for (let k = i - 1; k >= 0; k--) if (steps[k].agentId) return steps[k].agentId; return null; };
  const waitingAt = cur && !cur.agentId && !finished ? personFor(idx) : null;
  const touched = new Map<string, number>(); steps.forEach((s, i) => { if (s.agentId && (p === null ? true : i <= idx)) touched.set(s.agentId, (touched.get(s.agentId) ?? 0) + 1); });
  const working = cur && cur.agentId && !finished ? cur.agentId : null;
  const arrivals = new Map<string, number[]>(); steps.forEach((s, i) => { if (s.via && s.agentId) arrivals.set(s.via, [...(arrivals.get(s.via) ?? []), i]); });
  const edgeState = (hid: string): { taken: boolean; u: number | null } => {
    const js = arrivals.get(hid) ?? []; if (!js.length) return { taken: false, u: null }; if (p === null) return { taken: true, u: null };
    let u: number | null = null; let taken = false;
    for (const j of js) { if (p >= j) taken = true; else if (p >= j - 0.3) u = (p - (j - 0.3)) / 0.3; }
    return { taken, u };
  };

  const edgePath = (h: { id: string; from: string; to: string }) => {
    const a = pos(h.from), b = pos(h.to); const back = lay.back.has(h.id);
    if (!back) { const s: [number, number] = [a.x + NODE_W, a.y + NODE_H / 2], e: [number, number] = [b.x, b.y + NODE_H / 2]; const dx = Math.max(30, (e[0] - s[0]) * 0.5); return { s, c1: [s[0] + dx, s[1]] as [number, number], c2: [e[0] - dx, e[1]] as [number, number], e, back }; }
    const s: [number, number] = [a.x + NODE_W / 2 + 18, a.y + NODE_H], e: [number, number] = [b.x + NODE_W / 2 - 18, b.y + NODE_H]; const drop = 54 + Math.abs(lay.col[h.from] - lay.col[h.to]) * 8;
    return { s, c1: [s[0], s[1] + drop] as [number, number], c2: [e[0], e[1] + drop] as [number, number], e, back };
  };
  const d = (g: ReturnType<typeof edgePath>) => `M ${g.s[0]} ${g.s[1]} C ${g.c1[0]} ${g.c1[1]}, ${g.c2[0]} ${g.c2[1]}, ${g.e[0]} ${g.e[1]}`;
  const personNodes = new Set<string>(); mesh.guardrails.personBefore.forEach((x) => personNodes.add(x)); if (mesh.guardrails.escalate.length) mesh.members.filter((m) => m.role === "executor").forEach((m) => personNodes.add(m.agentId));

  const scale = cw > 0 ? Math.min(1, cw / W) : 1;
  return (
    <div ref={wrap} className="relative overflow-hidden rounded-lg border border-border bg-surface-subtle" style={{ backgroundImage: "radial-gradient(rgb(var(--c-border)) 1px, transparent 1px)", backgroundSize: "16px 16px" }} data-testid="mesh-canvas">
      <div style={{ height: H * scale }}><div className="relative" style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: "top left", marginLeft: Math.max(0, (cw - W * scale) / 2) }}>
        <svg className="absolute inset-0" width={W} height={H} aria-hidden>
          <defs>
            {[["n", "rgb(var(--c-text-tertiary))"], ["a", "#0E9F77"]].map(([k, c]) => <marker key={k} id={`mh-${k}-${mesh.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill={c} /></marker>)}
          </defs>
          {mesh.handoffs.map((h) => {
            if (lay.col[h.from] === undefined || lay.col[h.to] === undefined) return null;
            const g = edgePath(h); const st = edgeState(h.id); const lit = run ? st.taken : false; const dim = !!run && !lit;
            return <g key={h.id}>
              <path d={d(g)} fill="none" stroke={lit ? "#0E9F77" : "rgb(var(--c-text-tertiary))"} strokeWidth={lit ? 2.4 : 1.5} strokeOpacity={dim ? 0.22 : lit ? 0.95 : 0.55} strokeDasharray={g.back ? "5 4" : undefined} markerEnd={`url(#mh-${lit ? "a" : "n"}-${mesh.id})`} />
              {st.u !== null && (() => { const [x, y] = bez(g.s, g.c1, g.c2, g.e, st.u); return <g><circle cx={x} cy={y} r={9} fill="#0E9F77" opacity={0.18} /><circle cx={x} cy={y} r={5} fill="#0E9F77" /></g>; })()}
            </g>;
          })}
        </svg>

        {mesh.handoffs.map((h) => {
          if (h.when === "always" || lay.col[h.from] === undefined || lay.col[h.to] === undefined) return null;
          const g = edgePath(h); const [x, y] = bez(g.s, g.c1, g.c2, g.e, 0.5); const lit = run ? edgeState(h.id).taken : false;
          return <span key={h.id + "l"} className={clsx("absolute -translate-x-1/2 -translate-y-1/2 rounded-full border bg-surface px-2 py-0.5 text-[10.5px] leading-tight whitespace-nowrap shadow-sm max-w-[190px] truncate", lit ? "border-[#0E9F77] text-text-primary" : "border-border text-text-secondary")} style={{ left: x, top: y + (g.back ? 0 : -1) }} title={`${title(h.from)} to ${title(h.to)} when: ${describeWhen(h.when, title)}`}>{describeWhen(h.when, title)}</span>;
        })}

        {mesh.members.map((m) => {
          const a = by.get(m.agentId); const r = ROLE[m.role]; const Ic = r.icon; const { x, y } = pos(m.agentId);
          const active = working === m.agentId; const seen = touched.has(m.agentId); const dim = !!run && !seen && !finished && p !== null; const dimEnd = !!run && finished && !seen; const sel = selected === m.agentId;
          const bad = a && (a.state === "retired" || a.state === "suspended"); const per = stats?.per[m.agentId];
          const step = active ? cur : null; const pct = active ? Math.min(100, Math.round(Math.min(frac / 0.7, 1) * 100)) : 0;
          return (
            <div key={m.agentId} className="absolute" style={{ left: x, top: y, width: NODE_W }}>
              <button type="button" onClick={() => onSelect?.(m.agentId)} data-testid={`mesh-node-${m.agentId}`} className={clsx("relative w-full text-left rounded-lg border bg-surface shadow-sm transition-all overflow-hidden", sel ? "border-text-primary ring-2 ring-black/10" : "border-border-strong hover:border-text-tertiary", (dim || dimEnd) && "opacity-45", active && "ring-4")} style={{ height: NODE_H, ...(active ? { boxShadow: `0 0 0 4px ${r.color}33`, borderColor: r.color } : {}) }}>
                <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: r.color }} />
                <span className="flex h-full flex-col px-3.5 py-2.5">
                  <span className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wide" style={{ color: r.color }}><Ic size={12} />{ROLE_LABEL[m.role]}{bad && <span className="ml-auto normal-case text-status-degraded">{a!.state}</span>}{touched.get(m.agentId)! > 1 && <span className="ml-auto normal-case text-text-tertiary">{touched.get(m.agentId)} times</span>}</span>
                  <span className="mt-1 flex items-center gap-1.5 text-sm font-semibold truncate"><Bot size={13} className="shrink-0 text-text-tertiary" />{a?.title ?? m.agentId}</span>
                  <span className="mt-0.5 text-[11.5px] leading-snug text-text-secondary line-clamp-2">{step ? step.action : m.duty || a?.description}</span>
                  {!step && per && <span className="mt-auto text-[10.5px] text-text-tertiary tabular-nums">{Math.round(per.share * 100)}% of cases, up to {(per.p95Ms / 1000).toFixed(1)} s</span>}
                  {step && <span className="mt-auto text-[10.5px] tabular-nums text-text-secondary">{(step.durMs / 1000).toFixed(1)} s, ${step.costUsd.toFixed(3)}{step.status === "retried" ? ", retried" : ""}</span>}
                </span>
                {active && <span className="absolute left-0 bottom-0 h-0.5" style={{ width: `${pct}%`, background: r.color }} />}
              </button>
              {personNodes.has(m.agentId) && (
                <div className={clsx("mt-2 mx-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] bg-surface", waitingAt === m.agentId ? "border-status-degraded text-status-degraded font-medium shadow-sm" : "border-dashed border-border-strong text-text-secondary")} style={{ marginLeft: NODE_W / 2 - 62 }}>
                  {waitingAt === m.agentId ? <Hand size={12} /> : <User size={12} />}{waitingAt === m.agentId ? "A person is deciding" : mesh.guardrails.personBefore.includes(m.agentId) ? "Person approves" : "Person decides some cases"}
                </div>
              )}
            </div>
          );
        })}
        {mesh.members.length === 0 && <div className="absolute inset-0 grid place-items-center text-sm text-text-tertiary">Add agents to see the mesh.</div>}
      </div></div>
    </div>
  );
}
