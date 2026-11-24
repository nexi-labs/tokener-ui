"use client";

import clsx from "clsx";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { BY_KIND } from "./catalog";
import { NodeIcon } from "./icons";
import { edgePath, portIn, portOut } from "./layout";
import { EDGE_STYLE, NODE_H, NODE_W, TONE, type Graph, type Mode, type NodeStatus } from "./types";

export type Sel = { type: "node" | "edge"; id: string } | null;

export type CanvasHandle = {
  fit: () => void;
  zoomBy: (f: number) => void;
  centerWorld: () => { x: number; y: number };
};

type Props = {
  graph: Graph;
  mode: Mode;
  selection: Sel;
  onSelect: (s: Sel) => void;
  onMoveStart: () => void;
  onMoveNode: (id: string, x: number, y: number) => void;
  onConnect: (from: string, to: string) => void;
  onDropKind: (kind: string, x: number, y: number) => void;
  animate: boolean;
  statusMap: Record<string, NodeStatus>;
  issueNodes: Record<string, "error" | "warn" | "info">;
  fitKey: number;
  totalMs?: number;
  structureLocked?: boolean;
};

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

const STATUS_RING: Record<NodeStatus, string> = {
  ok: "ring-2 ring-status-healthy/50 border-status-healthy",
  warn: "ring-2 ring-status-degraded/50 border-status-degraded",
  error: "ring-2 ring-status-down/50 border-status-down",
  skip: "",
  active: "ring-4 ring-accent-500/50 border-accent-600",
};

export const Canvas = forwardRef<CanvasHandle, Props>(function Canvas(props, ref) {
  const { graph, selection, onSelect, onMoveStart, onMoveNode, onConnect, onDropKind, animate, statusMap, issueNodes, fitKey, totalMs, structureLocked } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [conn, setConn] = useState<{ from: string; x: number; y: number } | null>(null);
  const panRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const dragRef = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);

  const nodeMap = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);

  const toWorld = useCallback((cx: number, cy: number) => {
    const r = wrapRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (cx - r.left - v.x) / v.k, y: (cy - r.top - v.y) / v.k };
  }, []);

  const fit = useCallback((initial = false) => {
    const el = wrapRef.current;
    if (!el || !graph.nodes.length) return;
    const w = el.clientWidth, h = el.clientHeight;
    const minX = Math.min(...graph.nodes.map((n) => n.x));
    const minY = Math.min(...graph.nodes.map((n) => n.y));
    const maxX = Math.max(...graph.nodes.map((n) => n.x + NODE_W));
    const maxY = Math.max(...graph.nodes.map((n) => n.y + NODE_H));
    const bw = maxX - minX, bh = maxY - minY;
    const k = clamp(Math.min((w - 72) / bw, (h - 72) / bh, 1), initial ? 0.58 : 0.25, 1.1);
    // On first load keep nodes readable: when the graph is wider or taller than the view,
    // anchor its start at the top-left and let the user pan. The Fit button shows everything.
    const x = bw * k > w - 72 ? 40 - minX * k : (w - bw * k) / 2 - minX * k;
    const y = bh * k > h - 72 ? 52 - minY * k : (h - bh * k) / 2 - minY * k;
    setView({ k, x, y });
  }, [graph.nodes]);

  const zoomAt = useCallback((f: number, cx: number, cy: number) => {
    setView((v) => {
      const k = clamp(v.k * f, 0.25, 2);
      const wx = (cx - v.x) / v.k, wy = (cy - v.y) / v.k;
      return { k, x: cx - wx * k, y: cy - wy * k };
    });
  }, []);

  useImperativeHandle(ref, () => ({
    fit: () => fit(false),
    zoomBy: (f: number) => {
      const el = wrapRef.current;
      if (el) zoomAt(f, el.clientWidth / 2, el.clientHeight / 2);
    },
    centerWorld: () => {
      const el = wrapRef.current!;
      return toWorld(el.getBoundingClientRect().left + el.clientWidth / 2, el.getBoundingClientRect().top + el.clientHeight / 2);
    },
  }));

  useEffect(() => {
    const t = requestAnimationFrame(() => fit(true));
    return () => cancelAnimationFrame(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const h = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        zoomAt(Math.exp(-e.deltaY * 0.0016), e.clientX - r.left, e.clientY - r.top);
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, [zoomAt]);

  const startConn = (e: React.PointerEvent, from: string) => {
    if (structureLocked) return;
    e.stopPropagation();
    e.preventDefault();
    const w = toWorld(e.clientX, e.clientY);
    setConn({ from, ...w });
    const move = (ev: PointerEvent) => setConn((c) => (c ? { ...c, ...toWorld(ev.clientX, ev.clientY) } : c));
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      const target = el?.closest("[data-node]") as HTMLElement | null;
      if (target && target.dataset.node && target.dataset.node !== from) onConnect(from, target.dataset.node);
      setConn(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };

  const edges = graph.edges
    .map((e) => {
      const a = nodeMap.get(e.from), b = nodeMap.get(e.to);
      if (!a || !b) return null;
      const p1 = portOut(a), p2 = portIn(b);
      return { e, a, b, p1, p2, d: edgePath(p1.x, p1.y, p2.x - 3, p2.y) };
    })
    .filter(Boolean) as { e: Graph["edges"][number]; a: Graph["nodes"][number]; b: Graph["nodes"][number]; p1: { x: number; y: number }; p2: { x: number; y: number }; d: string }[];

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 overflow-hidden touch-none outline-none cursor-grab active:cursor-grabbing bg-surface-subtle"
      style={{
        backgroundImage: "radial-gradient(circle at 1px 1px, var(--canvas-dot) 1px, transparent 0)",
        backgroundSize: `${22 * view.k}px ${22 * view.k}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        onSelect(null);
        panRef.current = { sx: e.clientX, sy: e.clientY, ox: viewRef.current.x, oy: viewRef.current.y };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const p = panRef.current;
        if (p) setView((v) => ({ ...v, x: p.ox + e.clientX - p.sx, y: p.oy + e.clientY - p.sy }));
      }}
      onPointerUp={() => (panRef.current = null)}
      onDragOver={(e) => {
        if (structureLocked) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        if (structureLocked) return;
        e.preventDefault();
        const kind = e.dataTransfer.getData("application/x-tokener-node");
        if (!kind) return;
        const w = toWorld(e.clientX, e.clientY);
        onDropKind(kind, w.x - NODE_W / 2, w.y - NODE_H / 2);
      }}
    >
      <div className="absolute left-0 top-0" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transformOrigin: "0 0" }}>
        <svg className="absolute left-0 top-0 overflow-visible pointer-events-none" width="1" height="1">
          <defs>
            {Object.entries(EDGE_STYLE).map(([t, s]) => (
              <marker key={t} id={`arr-${t}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 1 L 9 5 L 0 9 z" fill={s.color} />
              </marker>
            ))}
          </defs>

          {edges.map(({ e, a, b, p1, p2, d }, i) => {
            const st = EDGE_STYLE[e.type];
            const sel = selection?.type === "edge" && selection.id === e.id;
            const dim = a.meta?.status === "skip" || b.meta?.status === "skip";
            const live = !!statusMap[e.from] && !!statusMap[e.to];
            const len = Math.hypot(p2.x - p1.x, p2.y - p1.y) * 1.15;
            const dur = Math.max(1.6, len / (e.type === "async" ? 70 : 130));
            const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
            return (
              <g key={e.id} opacity={dim ? 0.3 : 1}>
                <path d={d} fill="none" stroke={st.color} strokeWidth={sel ? 3.5 : live ? 3 : 2} strokeDasharray={st.dash} markerEnd={`url(#arr-${e.type})`} />
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={16}
                  style={{ pointerEvents: "stroke", cursor: "pointer" }}
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    onSelect({ type: "edge", id: e.id });
                  }}
                />
                {animate && !dim && (
                  <>
                    {[0, 1].map((k) => (
                      <circle key={k} r={3.2} fill={st.color}>
                        <animateMotion dur={`${dur}s`} begin={`${-(dur / 2) * k - (i % 3) * 0.35}s`} repeatCount="indefinite" path={d} />
                      </circle>
                    ))}
                  </>
                )}
                {e.label && (
                  <text x={mx} y={my - 7} textAnchor="middle" fontSize="10.5" fontWeight="600" fill={st.color} stroke="#F6F8F8" strokeWidth="4" paintOrder="stroke" style={{ pointerEvents: "none" }}>
                    {e.label}
                  </text>
                )}
              </g>
            );
          })}

          {conn && nodeMap.get(conn.from) && (
            <path d={edgePath(portOut(nodeMap.get(conn.from)!).x, portOut(nodeMap.get(conn.from)!).y, conn.x, conn.y)} fill="none" stroke="#00B876" strokeWidth={2.5} strokeDasharray="5 4" />
          )}
        </svg>

        {graph.nodes.map((n) => {
          const def = BY_KIND[n.kind];
          if (!def) return null;
          const tone = TONE[def.tone];
          const sel = selection?.type === "node" && selection.id === n.id;
          const live = statusMap[n.id];
          const status: NodeStatus | undefined = live ?? n.meta?.status;
          const issue = issueNodes[n.id];
          const pct = totalMs && n.meta ? { l: (n.meta.startMs / totalMs) * 100, w: Math.max(2, (n.meta.ms / totalMs) * 100) } : null;
          return (
            <div
              key={n.id}
              data-node={n.id}
              className={clsx(
                "absolute rounded-lg border bg-surface select-none touch-none transition-[box-shadow,opacity] duration-150",
                sel ? "border-accent-600 ring-2 ring-accent-500/50 shadow-popover z-10" : status && STATUS_RING[status] ? STATUS_RING[status] : issue === "error" ? "border-status-down/70 shadow-card" : issue === "warn" ? "border-status-degraded/70 shadow-card" : "border-border-strong shadow-card hover:shadow-popover",
                status === "skip" && "opacity-45",
                "cursor-grab active:cursor-grabbing"
              )}
              style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                onSelect({ type: "node", id: n.id });
                dragRef.current = { id: n.id, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, moved: false };
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const d = dragRef.current;
                if (!d || d.id !== n.id) return;
                const k = viewRef.current.k;
                const dx = (e.clientX - d.sx) / k, dy = (e.clientY - d.sy) / k;
                if (!d.moved && Math.hypot(dx, dy) > 3) {
                  d.moved = true;
                  onMoveStart();
                }
                if (d.moved) onMoveNode(n.id, d.ox + dx, d.oy + dy);
              }}
              onPointerUp={() => (dragRef.current = null)}
            >
              <span className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg" style={{ background: tone.bar }} />
              <div className="flex items-center gap-2.5 pl-3.5 pr-2.5 h-full">
                <div className={clsx("h-9 w-9 rounded-md grid place-items-center shrink-0", tone.tile, tone.text)}>
                  <NodeIcon icon={def.icon} size={18} />
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-text-primary truncate leading-tight">{def.label}</span>
                    {def.planned && <span className="text-[9px] font-semibold uppercase tracking-wide px-1 py-px rounded bg-[#EFE9FD] text-[#6B3FD4]">planned</span>}
                  </div>
                  <div className={clsx("text-[11px] truncate mt-0.5 font-mono", n.meta?.status === "error" ? "text-status-down" : n.meta?.status === "warn" ? "text-[#9A5F05]" : "text-text-tertiary")}>
                    {n.meta?.note ?? def.summary?.(n.params) ?? def.desc}
                  </div>
                </div>
              </div>

              {n.meta && n.meta.status !== "skip" && n.meta.ms > 0 && (
                <span className="absolute -top-2.5 right-2 text-[10px] font-mono font-semibold px-1.5 py-px rounded bg-emph text-on-emph">
                  {n.meta.ms.toLocaleString("en-US")} ms
                </span>
              )}
              {pct && n.meta!.status !== "skip" && (
                <span className="absolute left-3.5 right-2.5 bottom-1.5 h-[3px] rounded bg-surface-muted overflow-hidden">
                  <span
                    className="absolute top-0 bottom-0 rounded"
                    style={{ left: `${pct.l}%`, width: `${Math.min(pct.w, 100 - pct.l)}%`, background: n.meta!.status === "error" ? "#DC3B3B" : n.meta!.status === "warn" ? "#D98A15" : "#00B876" }}
                  />
                </span>
              )}
              {live && (
                <span className={clsx("absolute -top-1.5 -left-1.5 h-3.5 w-3.5 rounded-full border-2 border-white", live === "ok" ? "bg-status-healthy" : live === "error" ? "bg-status-down" : live === "warn" ? "bg-status-degraded" : "bg-accent-500 animate-pulse")} />
              )}

              {def.hasIn && (
                <span
                  data-in-port
                  className="absolute -left-[7px] top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full border-2 border-surface bg-note"
                />
              )}
              {def.hasOut && (
                <span
                  data-out-port
                  title={structureLocked ? undefined : "Drag to connect"}
                  onPointerDown={(e) => startConn(e, n.id)}
                  className={clsx(
                    "absolute -right-[7px] top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full border-2 border-surface bg-accent-600 transition-transform",
                    structureLocked ? "" : "cursor-crosshair hover:scale-150"
                  )}
                  style={{ boxShadow: "0 0 0 1px rgba(7,25,30,0.2)" }}
                />
              )}
            </div>
          );
        })}
      </div>

      {!graph.nodes.length && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <div className="text-center text-text-tertiary text-sm max-w-xs">
            <p className="font-medium text-text-secondary">Drag a node here to start</p>
            <p className="mt-1">Or load a template from the toolbar. Connect nodes by dragging from the green handle on the right of a node.</p>
          </div>
        </div>
      )}
    </div>
  );
});
