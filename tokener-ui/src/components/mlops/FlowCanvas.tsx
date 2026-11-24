"use client";

import clsx from "clsx";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { NodeIcon } from "@/components/studio/icons";
import { OP_BY_KIND, OPERATOR_FAMILY, PORT_COLOR } from "@/lib/mlops/operators";
import { HEADER_H, NODE_W, PORT_ROW, canConnect, nodeHeight, portPos, type PipelineSpec } from "@/lib/mlops/spec";
import type { NodeRunStatus } from "@/lib/mlops/types";
import { TONE } from "@/components/studio/types";

export type Sel = { type: "node" | "edge"; id: string } | null;
export type CanvasHandle = { fit: () => void; zoomBy: (f: number) => void; center: () => { x: number; y: number } };

type Props = {
  spec: PipelineSpec;
  selection: Sel;
  onSelect: (s: Sel) => void;
  onMoveStart?: () => void;
  onMoveNode?: (id: string, x: number, y: number) => void;
  onConnect?: (from: string, fromPort: string, to: string, toPort: string) => void;
  onReject?: (reason: string) => void;
  onDropOperator?: (kind: string, x: number, y: number) => void;
  onDelete?: (s: NonNullable<Sel>) => void;
  readOnly?: boolean;
  overlay?: Record<string, NodeRunStatus>;
  issues?: Record<string, "error" | "warn" | "info">;
  fitKey?: number;
  animate?: boolean;
  /** Names the canvas for assistive technology. */
  label?: string;
};

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const edgePath = (ax: number, ay: number, bx: number, by: number) => {
  const dx = Math.max(50, Math.abs(bx - ax) * 0.5);
  return `M ${ax} ${ay} C ${ax + dx} ${ay}, ${bx - dx} ${by}, ${bx} ${by}`;
};

const OVERLAY_STYLE: Record<NodeRunStatus, { ring: string; chip: string; label: string }> = {
  succeeded: { ring: "ring-2 ring-status-healthy/60 border-status-healthy", chip: "bg-status-healthy", label: "Succeeded" },
  running: { ring: "ring-4 ring-accent-500/50 border-accent-600", chip: "bg-accent-600 animate-pulse", label: "Running" },
  failed: { ring: "ring-2 ring-status-down/60 border-status-down", chip: "bg-status-down", label: "Failed" },
  skipped: { ring: "opacity-50", chip: "bg-text-tertiary", label: "Skipped" },
  pending: { ring: "", chip: "bg-border-strong", label: "Pending" },
  waiting: { ring: "ring-2 ring-status-degraded/60 border-status-degraded", chip: "bg-status-degraded animate-pulse", label: "Waiting" },
};

export const FlowCanvas = forwardRef<CanvasHandle, Props>(function FlowCanvas(props, ref) {
  const { spec, selection, onSelect, onMoveStart, onMoveNode, onConnect, onReject, onDropOperator, onDelete, readOnly, overlay, issues = {}, fitKey = 0, animate, label } = props;
  const wrap = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [size, setSize] = useState({ w: 800, h: 500 });
  const [conn, setConn] = useState<{ from: string; fromPort: string; x: number; y: number; hover?: { node: string; port: string; ok: boolean; reason?: string } } | null>(null);
  const pan = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);

  const nodes = spec.nodes;
  const map = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const toWorld = useCallback((cx: number, cy: number) => {
    const r = wrap.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (cx - r.left - v.x) / v.k, y: (cy - r.top - v.y) / v.k };
  }, []);

  const bounds = useMemo(() => {
    if (!nodes.length) return { minX: 0, minY: 0, maxX: 400, maxY: 300 };
    return {
      minX: Math.min(...nodes.map((n) => n.x)), minY: Math.min(...nodes.map((n) => n.y)),
      maxX: Math.max(...nodes.map((n) => n.x + NODE_W)), maxY: Math.max(...nodes.map((n) => n.y + nodeHeight(OP_BY_KIND[n.operator]))),
    };
  }, [nodes]);

  const fit = useCallback(() => {
    const el = wrap.current;
    if (!el || !nodes.length) return;
    const w = el.clientWidth, h = el.clientHeight;
    const bw = bounds.maxX - bounds.minX, bh = bounds.maxY - bounds.minY;
    // Fit the whole graph when that stays readable. A long pipeline is shown at a readable size from its first operator instead of shrunk to a strip.
    const k = clamp(Math.min((w - 64) / bw, (h - 64) / bh, 1.1), 0.7, 1.1);
    const overflow = bw * k > w - 64;
    setView({ k, x: overflow ? 32 - bounds.minX * k : (w - bw * k) / 2 - bounds.minX * k, y: (h - bh * k) / 2 - bounds.minY * k });
  }, [bounds, nodes.length]);

  const zoomAt = useCallback((f: number, cx: number, cy: number) => {
    setView((v) => {
      const k = clamp(v.k * f, 0.25, 2);
      const wx = (cx - v.x) / v.k, wy = (cy - v.y) / v.k;
      return { k, x: cx - wx * k, y: cy - wy * k };
    });
  }, []);

  useImperativeHandle(ref, () => ({
    fit,
    zoomBy: (f) => { const el = wrap.current; if (el) zoomAt(f, el.clientWidth / 2, el.clientHeight / 2); },
    center: () => { const el = wrap.current!; const r = el.getBoundingClientRect(); return toWorld(r.left + el.clientWidth / 2, r.top + el.clientHeight / 2); },
  }));

  useEffect(() => { const t = requestAnimationFrame(fit); return () => cancelAnimationFrame(t); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [fitKey]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) { const r = el.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * 0.0016), e.clientX - r.left, e.clientY - r.top); }
      else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => { ro.disconnect(); el.removeEventListener("wheel", wheel); };
  }, [zoomAt]);

  // Valid drop targets while a connection is being dragged.
  const valid = useMemo(() => {
    const s = new Set<string>();
    if (!conn) return s;
    nodes.forEach((n) => OP_BY_KIND[n.operator]?.inputs.forEach((p) => { if (canConnect(spec, conn.from, conn.fromPort, n.id, p.id).ok) s.add(`${n.id}:${p.id}`); }));
    return s;
  }, [conn, nodes, spec]);

  const startConn = (e: React.PointerEvent, from: string, fromPort: string) => {
    if (readOnly) return;
    e.stopPropagation(); e.preventDefault();
    const w = toWorld(e.clientX, e.clientY);
    setConn({ from, fromPort, ...w });
    const move = (ev: PointerEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      const port = el?.closest("[data-in-port]") as HTMLElement | null;
      let hover: { node: string; port: string; ok: boolean; reason?: string } | undefined;
      if (port) {
        const node = port.dataset.node!, pid = port.dataset.port!;
        const c = canConnect(spec, from, fromPort, node, pid);
        hover = { node, port: pid, ok: c.ok, reason: c.ok ? undefined : c.reason };
      }
      setConn((c) => (c ? { ...c, ...toWorld(ev.clientX, ev.clientY), hover } : c));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      const port = el?.closest("[data-in-port]") as HTMLElement | null;
      const nodeEl = el?.closest("[data-node]") as HTMLElement | null;
      if (port) {
        const c = canConnect(spec, from, fromPort, port.dataset.node!, port.dataset.port!);
        if (c.ok) onConnect?.(from, fromPort, port.dataset.node!, port.dataset.port!); else onReject?.(c.reason);
      } else if (nodeEl && nodeEl.dataset.node !== from) {
        // Dropped on a node body: try the first compatible port.
        const target = map.get(nodeEl.dataset.node!)!;
        const ok = OP_BY_KIND[target.operator].inputs.find((p) => canConnect(spec, from, fromPort, target.id, p.id).ok);
        if (ok) onConnect?.(from, fromPort, target.id, ok.id); else onReject?.("No compatible input on that operator");
      }
      setConn(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };

  const edges = spec.edges.map((e) => {
    const a = map.get(e.from), b = map.get(e.to);
    if (!a || !b) return null;
    const p1 = portPos(a, "out", e.fromPort), p2 = portPos(b, "in", e.toPort);
    const type = OP_BY_KIND[a.operator]?.outputs.find((p) => p.id === e.fromPort)?.type ?? "signal";
    return { e, p1, p2, d: edgePath(p1.x, p1.y, p2.x - 3, p2.y), color: PORT_COLOR[type], live: overlay?.[e.from] === "succeeded" && overlay?.[e.to] === "running" };
  }).filter(Boolean) as { e: PipelineSpec["edges"][number]; p1: { x: number; y: number }; p2: { x: number; y: number }; d: string; color: string; live: boolean }[];

  const onKey = (e: React.KeyboardEvent, id: string) => {
    const n = map.get(id)!;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect({ type: "node", id }); }
    else if ((e.key === "Delete" || e.key === "Backspace") && !readOnly) { e.preventDefault(); onDelete?.({ type: "node", id }); }
    else if (e.key.startsWith("Arrow") && !readOnly) {
      e.preventDefault();
      const step = e.shiftKey ? 64 : 16;
      onMoveStart?.();
      onMoveNode?.(id, n.x + (e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0), n.y + (e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0));
    }
  };

  // Minimap
  const MM = { w: 156, h: 96 };
  const mmScale = Math.min(MM.w / Math.max(1, bounds.maxX - bounds.minX + 80), MM.h / Math.max(1, bounds.maxY - bounds.minY + 80));
  const mmX = (x: number) => (x - bounds.minX + 40) * mmScale, mmY = (y: number) => (y - bounds.minY + 40) * mmScale;
  const vp = { x: -view.x / view.k, y: -view.y / view.k, w: size.w / view.k, h: size.h / view.k };

  return (
    <div ref={wrap} role="application" aria-label={label ?? "Pipeline canvas"} aria-describedby="canvas-help"
      className="absolute inset-0 overflow-hidden touch-none outline-none cursor-grab active:cursor-grabbing bg-surface-subtle"
      style={{ backgroundImage: "radial-gradient(circle at 1px 1px, var(--canvas-dot) 1px, transparent 0)", backgroundSize: `${22 * view.k}px ${22 * view.k}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
      onPointerDown={(e) => { if (e.button !== 0) return; onSelect(null); pan.current = { sx: e.clientX, sy: e.clientY, ox: viewRef.current.x, oy: viewRef.current.y }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => { const p = pan.current; if (p) setView((v) => ({ ...v, x: p.ox + e.clientX - p.sx, y: p.oy + e.clientY - p.sy })); }}
      onPointerUp={() => (pan.current = null)}
      onDragOver={(e) => { if (readOnly) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
      onDrop={(e) => { if (readOnly) return; e.preventDefault(); const k = e.dataTransfer.getData("application/x-tokener-operator"); if (!k) return; const w = toWorld(e.clientX, e.clientY); onDropOperator?.(k, w.x - NODE_W / 2, w.y - 24); }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "+" || e.key === "=") zoomAt(1.2, size.w / 2, size.h / 2);
        if (e.key === "-") zoomAt(1 / 1.2, size.w / 2, size.h / 2);
        if (e.key === "0") fit();
        if (e.key.startsWith("Arrow")) { e.preventDefault(); setView((v) => ({ ...v, x: v.x + (e.key === "ArrowLeft" ? 60 : e.key === "ArrowRight" ? -60 : 0), y: v.y + (e.key === "ArrowUp" ? 60 : e.key === "ArrowDown" ? -60 : 0) })); }
      }}
      tabIndex={0}>
      <p id="canvas-help" className="sr-only">Tab moves between operators. Enter selects. Arrow keys move the selected operator, shift for larger steps. Delete removes it. On the canvas itself, arrows pan, plus and minus zoom, zero fits. To connect operators without a pointer use the Connect control in the configuration panel.</p>
      <div className="absolute left-0 top-0" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transformOrigin: "0 0" }}>
        <svg className="absolute left-0 top-0 overflow-visible pointer-events-none" width="1" height="1">
          <defs>{Object.entries(PORT_COLOR).map(([t, c]) => (<marker key={t} id={`pa-${t}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9 z" fill={c} /></marker>))}</defs>
          {edges.map(({ e, d, color, live }) => {
            const sel = selection?.type === "edge" && selection.id === e.id;
            const a = map.get(e.from)!;
            const t = OP_BY_KIND[a.operator]?.outputs.find((p) => p.id === e.fromPort)?.type ?? "signal";
            return (
              <g key={e.id}>
                <path d={d} fill="none" stroke={color} strokeWidth={sel ? 3.5 : 2} className={clsx((animate || live) && "tok-flow")} markerEnd={`url(#pa-${t})`} opacity={overlay && overlay[e.to] === "skipped" ? 0.3 : 1} />
                <path d={d} fill="none" stroke="transparent" strokeWidth={16} style={{ pointerEvents: "stroke", cursor: "pointer" }} onPointerDown={(ev) => { ev.stopPropagation(); onSelect({ type: "edge", id: e.id }); }} />
              </g>
            );
          })}
          {conn && map.get(conn.from) && (() => { const p = portPos(map.get(conn.from)!, "out", conn.fromPort); return <path d={edgePath(p.x, p.y, conn.x, conn.y)} fill="none" stroke={conn.hover ? (conn.hover.ok ? "#00B876" : "#DC3B3B") : "#00B876"} strokeWidth={2.5} strokeDasharray="5 4" />; })()}
        </svg>

        {nodes.map((n) => {
          const op = OP_BY_KIND[n.operator];
          if (!op) return null;
          const fam = OPERATOR_FAMILY[op.family];
          const tone = TONE[fam.tone];
          const sel = selection?.type === "node" && selection.id === n.id;
          const ov = overlay?.[n.id];
          const issue = issues[n.id];
          const h = nodeHeight(op);
          return (
            <div key={n.id} data-node={n.id} role="button" tabIndex={0} aria-label={`${n.name}, ${op.label}${ov ? `, ${OVERLAY_STYLE[ov].label}` : ""}${issue ? `, has ${issue === "error" ? "errors" : "warnings"}` : ""}`} aria-pressed={sel}
              onKeyDown={(e) => onKey(e, n.id)} onFocus={() => onSelect({ type: "node", id: n.id })}
              className={clsx("absolute rounded-lg border bg-surface select-none touch-none transition-shadow duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500",
                sel ? "border-accent-600 ring-2 ring-accent-500/50 shadow-popover z-10" : ov && OVERLAY_STYLE[ov].ring ? OVERLAY_STYLE[ov].ring : issue === "error" ? "border-status-down/70 shadow-card" : issue === "warn" ? "border-status-degraded/70 shadow-card" : "border-border-strong shadow-card hover:shadow-popover",
                readOnly ? "cursor-pointer" : "cursor-grab active:cursor-grabbing")}
              style={{ left: n.x, top: n.y, width: NODE_W, height: h }}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                onSelect({ type: "node", id: n.id });
                if (readOnly) return;
                drag.current = { id: n.id, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, moved: false };
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d || d.id !== n.id) return;
                const k = viewRef.current.k;
                const dx = (e.clientX - d.sx) / k, dy = (e.clientY - d.sy) / k;
                if (!d.moved && Math.hypot(dx, dy) > 3) { d.moved = true; onMoveStart?.(); }
                if (d.moved) onMoveNode?.(n.id, Math.round((d.ox + dx) / 4) * 4, Math.round((d.oy + dy) / 4) * 4);
              }}
              onPointerUp={() => (drag.current = null)}>
              <span className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg" style={{ background: tone.bar }} />
              <div className="flex items-center gap-2 pl-3 pr-2 pt-1.5" style={{ height: HEADER_H }}>
                <div className={clsx("h-7 w-7 rounded-md grid place-items-center shrink-0", tone.tile, tone.text)}><NodeIcon icon={op.icon} size={15} /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5"><span className="text-[12.5px] font-semibold text-text-primary truncate leading-tight">{n.name}</span>{op.executable === "none" && <span className="text-[9px] font-semibold uppercase tracking-wide px-1 rounded bg-[#EFE9FD] text-[#6B3FD4]">draw only</span>}</div>
                  <div className="text-[10.5px] truncate text-text-tertiary font-mono leading-tight mt-0.5">{op.summary?.(n.config) ?? op.label}</div>
                </div>
              </div>
              {op.inputs.map((p, i) => {
                const key = `${n.id}:${p.id}`;
                const isHover = conn?.hover && conn.hover.node === n.id && conn.hover.port === p.id;
                return (
                  <span key={p.id} className="absolute left-0 flex items-center" style={{ top: HEADER_H + i * PORT_ROW, height: PORT_ROW }}>
                    <span data-in-port data-node={n.id} data-port={p.id} title={`${p.label} (${p.type})${p.optional ? ", optional" : ""}`}
                      className={clsx("absolute -left-[6px] h-3 w-3 rounded-full border-2 border-surface", conn && !valid.has(key) && "opacity-30", conn && valid.has(key) && "ring-2 ring-accent-500", isHover && !conn!.hover!.ok && "ring-2 ring-status-down")}
                      style={{ background: PORT_COLOR[p.type] }} />
                    <span className="pl-3.5 text-[10.5px] text-text-secondary leading-none">{p.label}{p.optional ? "" : <span className="text-status-down"> *</span>}</span>
                  </span>
                );
              })}
              {op.outputs.map((p, i) => (
                <span key={p.id} className="absolute right-0 flex items-center justify-end" style={{ top: HEADER_H + i * PORT_ROW, height: PORT_ROW }}>
                  <span className="pr-3.5 text-[10.5px] text-text-secondary leading-none">{p.label}</span>
                  <span data-out-port title={readOnly ? undefined : `Drag from ${p.label} (${p.type}) to connect`} onPointerDown={(e) => startConn(e, n.id, p.id)}
                    className={clsx("absolute -right-[6px] h-3 w-3 rounded-full border-2 border-surface transition-transform", readOnly ? "" : "cursor-crosshair hover:scale-150")} style={{ background: PORT_COLOR[p.type], boxShadow: "0 0 0 1px rgba(7,25,30,0.2)" }} />
                </span>
              ))}
              {ov && ov !== "pending" && (
                <span className="absolute -top-2.5 right-2 inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-px rounded bg-emph text-on-emph"><span className={clsx("h-1.5 w-1.5 rounded-full", OVERLAY_STYLE[ov].chip)} />{OVERLAY_STYLE[ov].label}</span>
              )}
              {!ov && issue && <span className={clsx("absolute -top-1.5 -right-1.5 h-3.5 w-3.5 rounded-full border-2 border-white", issue === "error" ? "bg-status-down" : issue === "warn" ? "bg-status-degraded" : "bg-status-info")} title={issue === "error" ? "Has errors" : "Has warnings"} />}
            </div>
          );
        })}
      </div>

      {!nodes.length && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <div className="text-center text-text-tertiary text-sm max-w-xs"><p className="font-medium text-text-secondary">Drag an operator here to start</p><p className="mt-1">Or load a template. Connect operators by dragging from a port on the right of one to a port on the left of another.</p></div>
        </div>
      )}

      {conn?.hover && !conn.hover.ok && <div role="alert" className="absolute top-3 left-1/2 -translate-x-1/2 bg-status-down text-white text-xs px-3 py-1.5 rounded-md shadow-popover pointer-events-none">{conn.hover.reason}</div>}

      <div className="absolute left-3 bottom-3 flex flex-col gap-1 pointer-events-auto" onPointerDown={(e) => e.stopPropagation()}>
        {[{ i: ZoomIn, l: "Zoom in", f: () => zoomAt(1.2, size.w / 2, size.h / 2) }, { i: ZoomOut, l: "Zoom out", f: () => zoomAt(1 / 1.2, size.w / 2, size.h / 2) }, { i: Maximize2, l: "Fit to view", f: fit }].map((b) => (
          <button key={b.l} aria-label={b.l} title={b.l} onClick={b.f} className="h-8 w-8 grid place-items-center rounded-md bg-surface border border-border-strong text-text-secondary hover:bg-surface-muted shadow-card"><b.i size={15} /></button>
        ))}
      </div>

      {nodes.length > 0 && (
        <svg width={MM.w} height={MM.h} className="absolute right-3 bottom-3 rounded-md bg-surface border border-border-strong shadow-card pointer-events-auto cursor-pointer" aria-label="Minimap" role="img"
          onPointerDown={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); const wx = (e.clientX - r.left) / mmScale + bounds.minX - 40, wy = (e.clientY - r.top) / mmScale + bounds.minY - 40; setView((v) => ({ ...v, x: size.w / 2 - wx * v.k, y: size.h / 2 - wy * v.k })); }}>
          {nodes.map((n) => <rect key={n.id} x={mmX(n.x)} y={mmY(n.y)} width={NODE_W * mmScale} height={nodeHeight(OP_BY_KIND[n.operator]) * mmScale} rx="2" fill={selection?.id === n.id ? "#00B876" : "#6B7F84"} opacity="0.85" />)}
          <rect x={mmX(vp.x)} y={mmY(vp.y)} width={vp.w * mmScale} height={vp.h * mmScale} fill="rgba(2,245,161,0.08)" stroke="#00B876" strokeWidth="1" />
        </svg>
      )}
    </div>
  );
});
