"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Activity, Box, ClipboardCheck, Database, FlaskConical, Filter, GitBranch, HardDrive, Maximize, Package, Repeat, Rocket, Search, Table2, X, ZoomIn, ZoomOut, type LucideIcon } from "lucide-react";
import { LANES, LAYER_LABEL, NODE_H, NODE_W, trace, type Layer, type LEdge, type LNode, type Lineage, type NodeKind, type NodeState } from "@/lib/crucible/lineage";

const ICON: Record<NodeKind, LucideIcon> = { source: Database, recipe: Filter, dataset: Table2, code: GitBranch, image: Box, run: FlaskConical, eval: ClipboardCheck, store: HardDrive, model: Package, deployment: Rocket, monitor: Activity, policy: Repeat };
const KIND_LABEL: Record<NodeKind, string> = { source: "Source", recipe: "Refinery recipe", dataset: "Dataset version", code: "Code", image: "Image", run: "Run", eval: "Evaluation", store: "Artifact store", model: "Model version", deployment: "Deployment", monitor: "Monitoring", policy: "Renewal policy" };
const STATE_MARK: Record<NodeState, { mark: string; color: string; label: string }> = { ok: { mark: "✓", color: "#10B981", label: "Healthy" }, live: { mark: "●", color: "#2563EB", label: "Running now" }, warn: { mark: "!", color: "#D97706", label: "Needs a look" }, bad: { mark: "✕", color: "#DC2626", label: "Failed" }, idle: { mark: "–", color: "#8A999C", label: "Idle or not used" } };
const TONE: Record<string, string> = { good: "#0F9D6B", warn: "#B45309", bad: "#DC2626", neutral: "rgb(var(--c-text-primary))" };
const ink = "rgb(var(--c-text-primary))", soft = "rgb(var(--c-text-secondary))", faint = "rgb(var(--c-text-tertiary))", surface = "rgb(var(--c-surface))", border = "rgb(var(--c-border-strong))", subtle = "rgb(var(--c-surface-subtle))";
const ACCENT = "#06B77C";
const MIN_K = 0.18, MAX_K = 3.2, FIGS_K = 0.42, MORE_K = 1.25, FULL_K = 2.1, PANEL_W = 420;
type View = { x: number; y: number; k: number };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const wrap = (s: string, n: number, lines = 2): string[] => { const out: string[] = []; let rest = s; while (rest.length > n && out.length < lines - 1) { const cut = Math.max(rest.slice(0, n).search(/[-_ .:/][^-_ .:/]*$/), Math.floor(n * 0.5)); out.push(rest.slice(0, cut + 1).trim()); rest = rest.slice(cut + 1); } out.push(rest.length > n ? rest.slice(0, n - 1) + "…" : rest); return out; };
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + "…" : s);

function edgePath(a: LNode, b: LNode, loop?: boolean) {
  if (loop || b.lane <= a.lane) { const x1 = a.x + NODE_W / 2, y1 = a.y + NODE_H, x2 = b.x + NODE_W / 2, y2 = b.y + NODE_H; const dip = Math.max(y1, y2) + 90 + Math.abs(a.lane - b.lane) * 14; return { d: `M${x1},${y1} C${x1},${dip} ${x2},${dip} ${x2},${y2}`, mx: (x1 + x2) / 2, my: dip - 22 }; }
  const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2, x2 = b.x, y2 = b.y + NODE_H / 2; const c = Math.max(60, (x2 - x1) * 0.5);
  return { d: `M${x1},${y1} C${x1 + c},${y1} ${x2 - c},${y2} ${x2},${y2}`, mx: (x1 + x2) / 2, my: (y1 + y2) / 2 - 8 };
}
function Spark({ v, w, h }: { v: number[]; w: number; h: number }) {
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const pts = v.map((y, i) => `${(i / (v.length - 1)) * w},${h - ((y - lo) / span) * (h - 3) - 1.5}`).join(" ");
  return <polyline points={pts} fill="none" stroke={ACCENT} strokeWidth={1.6} strokeLinejoin="round" />;
}

export function LineageGraph({ graph, layer, onLayer, initialSelect, highlightRun }: { graph: Lineage; layer: Layer; onLayer: (l: Layer) => void; initialSelect?: string; highlightRun?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1100, h: 640 });
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 0.6 });
  const [sel, setSel] = useState<string | null>(initialSelect ?? null);
  const [hover, setHover] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [reduced, setReduced] = useState(false);
  const fitted = useRef<string>("");
  const drag = useRef<{ sx: number; sy: number; v: View; id: string | null; moved: boolean } | null>(null);

  useEffect(() => { const m = window.matchMedia("(prefers-reduced-motion: reduce)"); setReduced(m.matches); }, []);
  useLayoutEffect(() => { const el = wrap.current; if (!el) return; const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight }); return () => ro.disconnect(); }, []);

  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const bounds = useMemo(() => { if (!graph.nodes.length) return { x0: 0, y0: 0, x1: 1, y1: 1 }; return { x0: Math.min(...graph.nodes.map((n) => n.x)) - 40, y0: Math.min(...graph.nodes.map((n) => n.y)) - 170, x1: Math.max(...graph.nodes.map((n) => n.x + NODE_W)) + 40, y1: Math.max(...graph.nodes.map((n) => n.y + NODE_H)) + 150 }; }, [graph]);
  const panelOpen = !!sel;
  const fit = useCallback((ids?: string[]) => {
    const ns = ids?.length ? ids.map((i) => byId.get(i)).filter(Boolean) as LNode[] : graph.nodes; if (!ns.length) return;
    const b = ids?.length ? { x0: Math.min(...ns.map((n) => n.x)) - 60, y0: Math.min(...ns.map((n) => n.y)) - 90, x1: Math.max(...ns.map((n) => n.x + NODE_W)) + 60, y1: Math.max(...ns.map((n) => n.y + NODE_H)) + 90 } : bounds;
    const availW = size.w - (panelOpen ? PANEL_W : 0); const top = 54; const availH = size.h - top; const k = clamp(Math.min(availW / (b.x1 - b.x0), availH / (b.y1 - b.y0)), MIN_K, 1.3);
    setView({ k, x: (availW - (b.x1 - b.x0) * k) / 2 - b.x0 * k, y: top + (availH - (b.y1 - b.y0) * k) / 2 - b.y0 * k });
  }, [graph.nodes, bounds, size, byId, panelOpen]);
  useEffect(() => { const sig = graph.nodes.map((n) => n.id).join("|"); if (size.w > 100 && fitted.current !== sig) { fit(); fitted.current = sig; } }, [graph, size, fit]);
  useEffect(() => { if (initialSelect && byId.has(initialSelect)) { setSel(initialSelect); const t = trace(graph, initialSelect); setTimeout(() => fit([initialSelect, ...t.up, ...t.down]), 60); } }, [initialSelect]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomAt = useCallback((f: number, cx: number, cy: number) => setView((v) => { const k = clamp(v.k * f, MIN_K, MAX_K); const r = k / v.k; return { k, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r }; }), []);
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); const r = el.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), e.clientX - r.left, e.clientY - r.top); };
    el.addEventListener("wheel", onWheel, { passive: false }); return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const nodeAt = (t: EventTarget | null) => ((t as Element | null)?.closest?.("[data-node]") as HTMLElement | null)?.dataset.node ?? null;
  const onDown = (e: React.PointerEvent) => { if (e.button !== 0) return; drag.current = { sx: e.clientX, sy: e.clientY, v: view, id: nodeAt(e.target), moved: false }; wrap.current?.setPointerCapture(e.pointerId); };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) { const id = nodeAt(e.target); setHover((h) => (h === id ? h : id)); return; }
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy; if (!d.moved && Math.hypot(dx, dy) < 4) return; d.moved = true; setView({ ...d.v, x: d.v.x + dx, y: d.v.y + dy });
  };
  const onUp = (e: React.PointerEvent) => { const d = drag.current; drag.current = null; wrap.current?.releasePointerCapture(e.pointerId); if (!d || d.moved) return; setSel(d.id); };

  const focusId = hover ?? sel; const t = useMemo(() => (focusId ? trace(graph, focusId) : null), [graph, focusId]);
  const lit = useMemo(() => (focusId && t ? new Set([focusId, ...t.up, ...t.down]) : null), [focusId, t]);
  const match = useMemo(() => { const s = q.trim().toLowerCase(); return s ? new Set(graph.nodes.filter((n) => `${n.title} ${n.subtitle} ${KIND_LABEL[n.kind]}`.toLowerCase().includes(s)).map((n) => n.id)) : null; }, [q, graph]);
  const runFocus = useMemo(() => (highlightRun ? new Set([`run:${highlightRun}`, ...(trace(graph, `run:${highlightRun}`).up), ...(trace(graph, `run:${highlightRun}`).down)]) : null), [highlightRun, graph]);
  const dim = (id: string) => (match ? !match.has(id) : lit ? !lit.has(id) : runFocus ? !runFocus.has(id) : false);
  const edgeLit = (e: LEdge) => !!lit && lit.has(e.from) && lit.has(e.to) && !e.loop;

  const level = view.k < FIGS_K ? 0 : view.k < MORE_K ? 1 : view.k < FULL_K ? 2 : 3;
  const selected = sel ? byId.get(sel) : null; const selTrace = useMemo(() => (sel ? trace(graph, sel) : null), [graph, sel]);

  return (
    <div className="relative h-[calc(100vh-250px)] min-h-[620px] rounded-lg border border-border bg-surface overflow-hidden select-none">
      <div ref={wrap} className="absolute inset-0 touch-none cursor-grab active:cursor-grabbing" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => { if (!drag.current) setHover(null); }}>
        <svg width={size.w} height={size.h} role="img" aria-label="Lineage graph from source data to the deployed model">
          <defs><pattern id="lg-dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="rgb(var(--c-border))" /></pattern>
            <marker id="lg-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9 z" fill="rgb(var(--c-border-strong))" /></marker>
            <marker id="lg-arrow-on" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9 z" fill={ACCENT} /></marker></defs>
          <rect width="100%" height="100%" fill="url(#lg-dots)" />
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {graph.lanes.map((l, i) => { const nodes = graph.nodes.filter((n) => n.lane === l.id); const x = l.id * 340; return (
              <g key={l.id}>
                <rect x={x - 44} y={bounds.y0 + 30} width={340} height={bounds.y1 - bounds.y0 - 40} rx={14} fill={i % 2 ? "transparent" : subtle} opacity={0.65} />
                <text x={x} y={bounds.y0 + 96} fontSize={clamp(12.5 / view.k, 4, 40)} fontWeight={600} fill={ink}>{cut(l.label, Math.floor(300 / (clamp(12.5 / view.k, 4, 40) * 0.56)))}</text>
                {view.k > 0.42 && <text x={x} y={bounds.y0 + 96 + clamp(14 / view.k, 5, 34)} fontSize={clamp(10.5 / view.k, 4, 30)} fill={faint}>{cut(`${nodes.length} ${nodes.length === 1 ? "stage" : "stages"}`, 20)}</text>}
              </g>); })}
            {graph.edges.map((e) => {
              const a = byId.get(e.from), b = byId.get(e.to); if (!a || !b) return null; const p = edgePath(a, b, e.loop); const on = edgeLit(e); const off = lit ? !on : (match ? true : !!runFocus && !(runFocus.has(e.from) && runFocus.has(e.to)));
              return (
                <g key={e.id} opacity={off ? 0.12 : 1}>
                  <path d={p.d} fill="none" stroke={on ? ACCENT : "rgb(var(--c-border-strong))"} strokeWidth={(on ? 2.4 : 1.6) / Math.max(view.k, 0.6)} strokeDasharray={e.loop ? "7 7" : undefined} markerEnd={on ? "url(#lg-arrow-on)" : "url(#lg-arrow)"} className={e.live && !reduced ? "tok-flow" : undefined} style={e.live && !reduced ? { strokeDasharray: "6 6" } : undefined} />
                  {e.label && view.k >= 0.5 && <text x={p.mx} y={p.my} textAnchor="middle" fontSize={clamp(11.5 / view.k, 4, 28)} fill={on ? ink : faint} paintOrder="stroke" stroke={surface} strokeWidth={4}>{e.label}</text>}
                </g>);
            })}
            {graph.nodes.map((n) => <Node key={n.id} n={n} level={level} layer={layer} k={view.k} selected={sel === n.id} dimmed={dim(n.id)} reduced={reduced} />)}
          </g>
        </svg>
      </div>

      <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2" onPointerDown={(e) => e.stopPropagation()}>
        <div role="tablist" aria-label="Figures shown on every stage" className="inline-flex rounded-md border border-border bg-surface p-0.5 shadow-card">
          {(Object.keys(LAYER_LABEL) as Layer[]).map((l) => <button key={l} role="tab" aria-selected={layer === l} onClick={() => onLayer(l)} className={`h-7 px-2.5 rounded text-[12.5px] font-medium ${layer === l ? "bg-emph text-on-emph" : "text-text-secondary hover:bg-surface-muted"}`}>{LAYER_LABEL[l]}</button>)}
        </div>
        <label className="relative"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" aria-hidden /><input aria-label="Find a stage" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a stage" className="h-8 w-44 rounded-md border border-border bg-surface pl-8 pr-2 text-[12.5px] shadow-card" /></label>
      </div>
      <div className="absolute top-3 flex flex-col gap-1 rounded-md border border-border bg-surface p-1 shadow-card" style={{ right: panelOpen ? PANEL_W + 12 : 12 }} onPointerDown={(e) => e.stopPropagation()}>
        <Tool label="Zoom in" onClick={() => zoomAt(1.3, (size.w - (panelOpen ? PANEL_W : 0)) / 2, size.h / 2)}><ZoomIn size={15} /></Tool>
        <Tool label="Zoom out" onClick={() => zoomAt(1 / 1.3, (size.w - (panelOpen ? PANEL_W : 0)) / 2, size.h / 2)}><ZoomOut size={15} /></Tool>
        <Tool label="Fit to screen" onClick={() => fit()}><Maximize size={15} /></Tool>
      </div>
      <div className="absolute bottom-3 left-3 rounded-md border border-border bg-surface px-3 py-2 shadow-card text-[12px] text-text-secondary" onPointerDown={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">{(Object.keys(STATE_MARK) as NodeState[]).map((s) => <span key={s} className="inline-flex items-center gap-1.5"><span style={{ color: STATE_MARK[s].color }} className="font-semibold w-3 text-center">{STATE_MARK[s].mark}</span>{STATE_MARK[s].label}</span>)}</div>
        <div className="mt-1 text-text-tertiary">Scroll to zoom, drag to move. Zoom in for more on each stage. Dashed lines return to the start of the loop.</div>
      </div>

      {selected && selTrace && (
        <aside className="absolute top-0 right-0 bottom-0 bg-surface border-l border-border overflow-y-auto" style={{ width: PANEL_W }} onPointerDown={(e) => e.stopPropagation()} aria-label="Stage details">
          <Panel n={selected} layer={layer} up={[...selTrace.up].map((i) => byId.get(i)!).filter(Boolean)} down={[...selTrace.down].map((i) => byId.get(i)!).filter(Boolean)} onClose={() => setSel(null)} onPick={(id) => { setSel(id); const x = byId.get(id)!; const tt = trace(graph, id); fit([id, ...[...tt.up].slice(0, 3), ...[...tt.down].slice(0, 3)]); void x; }} />
        </aside>
      )}
    </div>
  );
}

function Tool({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) { return <button type="button" aria-label={label} title={label} onClick={onClick} className="h-7 w-7 grid place-items-center rounded text-text-secondary hover:bg-surface-muted">{children}</button>; }

function Node({ n, level, layer, k, selected, dimmed, reduced }: { n: LNode; level: number; layer: Layer; k: number; selected: boolean; dimmed: boolean; reduced: boolean }) {
  const Ic = ICON[n.kind]; const st = STATE_MARK[n.state]; const figs = n.figures[layer];
  const big = level === 0; const fs = big ? clamp(11 / k, 14, 26) : 14;
  return (
    <g data-node={n.id} transform={`translate(${n.x} ${n.y})`} opacity={dimmed ? 0.2 : 1} style={{ cursor: "pointer" }} tabIndex={0} role="button" aria-label={`${KIND_LABEL[n.kind]} ${n.title}, ${n.stateLabel}`}>
      {n.state === "live" && !reduced && <rect x={-5} y={-5} width={NODE_W + 10} height={NODE_H + 10} rx={16} fill="none" stroke="#2563EB" strokeOpacity={0.5} className="tok-flow" />}
      <rect width={NODE_W} height={NODE_H} rx={12} fill={surface} stroke={selected ? ACCENT : border} strokeWidth={selected ? 3 : 1.3} />
      <rect width={5} height={NODE_H - 24} x={0} y={12} rx={2.5} fill={st.color} />
      <g transform="translate(18 14)"><rect width={26} height={26} rx={7} fill="rgb(var(--c-surface-muted))" /><Ic x={5} y={5} width={16} height={16} color={ink} strokeWidth={1.8} /></g>
      {big ? wrap(n.title, Math.floor((NODE_W - 64) / (fs * 0.56))).map((ln, i) => <text key={i} x={52} y={30 + i * (fs + 3)} fontSize={fs} fontWeight={600} fill={ink}>{ln}</text>) : <text x={52} y={26} fontSize={fs} fontWeight={600} fill={ink}>{cut(n.title, Math.floor((NODE_W - 64) / (fs * 0.56)))}</text>}
      {!big && <text x={52} y={43} fontSize={11.5} fill={soft}>{cut(n.subtitle, 38)}</text>}
      {big && <text x={18} y={NODE_H - 16} fontSize={clamp(10 / k, 12, 20)} fill={soft}>{cut(`${KIND_LABEL[n.kind]} · ${n.stateLabel}`, Math.floor((NODE_W - 36) / (clamp(10 / k, 12, 20) * 0.52)))}</text>}
      {!big && (
        <g transform="translate(18 60)"><rect width={Math.min(NODE_W - 36, 18 + n.stateLabel.length * 6.4)} height={20} rx={10} fill="rgb(var(--c-surface-subtle))" stroke="rgb(var(--c-border))" /><text x={9} y={14} fontSize={11} fontWeight={700} fill={st.color}>{st.mark}</text><text x={22} y={14} fontSize={11.5} fill={ink}>{cut(n.stateLabel, 28)}</text></g>
      )}
      {level >= 1 && figs.slice(0, level === 1 ? 2 : 4).map((f, i) => {
        const two = level >= 2; const col = two ? i % 2 : 0; const row = two ? Math.floor(i / 2) : i; const x = 18 + col * 118; const y = level === 1 ? 98 + row * 30 : 100 + row * 30;
        return (<g key={f.label + i} transform={`translate(${x} ${y})`}><text fontSize={10} fill={faint}>{cut(f.label, two ? 20 : 34)}</text><text y={15} fontSize={13.5} fontWeight={600} fill={TONE[f.tone ?? "neutral"]}>{cut(f.value, two ? 15 : 34)}</text></g>);
      })}
      {level === 1 && figs.length >= 2 && null}
      {level >= 3 && n.spark && n.spark.length > 2 && (<g transform={`translate(18 ${NODE_H - 28})`}><Spark v={n.spark} w={NODE_W - 36} h={18} /><text x={NODE_W - 36} y={-4} textAnchor="end" fontSize={9.5} fill={faint}>{n.sparkLabel}, whole run</text></g>)}
    </g>
  );
}

function Panel({ n, layer, up, down, onClose, onPick }: { n: LNode; layer: Layer; up: LNode[]; down: LNode[]; onClose: () => void; onPick: (id: string) => void }) {
  const Ic = ICON[n.kind]; const st = STATE_MARK[n.state];
  return (
    <div className="p-5 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0"><span className="h-9 w-9 rounded-lg bg-surface-muted grid place-items-center shrink-0"><Ic size={17} /></span>
          <div className="min-w-0"><div className="text-[11px] uppercase tracking-wide text-text-tertiary">{KIND_LABEL[n.kind]}</div><h2 className="text-[15px] font-semibold text-text-primary break-words">{n.title}</h2><div className="text-xs text-text-secondary mt-0.5">{n.subtitle}</div></div></div>
        <button aria-label="Close details" onClick={onClose} className="h-7 w-7 grid place-items-center rounded hover:bg-surface-muted shrink-0"><X size={15} /></button>
      </div>
      <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-subtle px-2.5 py-1 text-[12.5px]"><span style={{ color: st.color }} className="font-bold">{st.mark}</span>{n.stateLabel}</div>
      {(["overview", "quality", "cost", "time"] as Layer[]).map((l) => (
        <section key={l}><h3 className={`text-xs font-semibold mb-2 ${l === layer ? "text-text-primary" : "text-text-tertiary"}`}>{LAYER_LABEL[l]}</h3>
          <dl className="grid grid-cols-2 gap-2">{n.figures[l].map((f, i) => <div key={f.label + i} className="rounded-md border border-border px-3 py-2"><dt className="text-[11px] text-text-tertiary">{f.label}</dt><dd className="text-sm font-semibold tabular-nums" style={{ color: TONE[f.tone ?? "neutral"] }}>{f.value}</dd></div>)}</dl></section>
      ))}
      {n.spark && n.spark.length > 2 && <section><h3 className="text-xs font-semibold text-text-primary mb-2">{n.sparkLabel}</h3><svg viewBox="0 0 360 54" className="w-full h-14"><Spark v={n.spark} w={360} h={54} /></svg></section>}
      <section><h3 className="text-xs font-semibold text-text-primary mb-2">Properties</h3><dl className="text-sm divide-y divide-border">{n.props.filter(([, v]) => v).map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-1.5"><dt className="text-text-secondary shrink-0">{k}</dt><dd className="text-right break-words min-w-0">{v}</dd></div>)}</dl></section>
      {n.activity.length > 0 && <section><h3 className="text-xs font-semibold text-text-primary mb-2">What happened here</h3><ul className="space-y-2">{n.activity.map((a, i) => <li key={i} className="text-sm"><div>{a.what}</div><div className="text-xs text-text-tertiary">{new Date(a.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div></li>)}</ul></section>}
      <section className="grid grid-cols-2 gap-4">
        <div><h3 className="text-xs font-semibold text-text-primary mb-2">Came from ({up.length})</h3><ul className="space-y-1">{up.slice(0, 8).map((u) => <li key={u.id}><button onClick={() => onPick(u.id)} className="text-left text-[13px] text-text-secondary hover:text-text-primary hover:underline">{cut(u.title, 30)}</button></li>)}{up.length === 0 && <li className="text-[13px] text-text-tertiary">Nothing, this is a start.</li>}</ul></div>
        <div><h3 className="text-xs font-semibold text-text-primary mb-2">Led to ({down.length})</h3><ul className="space-y-1">{down.slice(0, 8).map((u) => <li key={u.id}><button onClick={() => onPick(u.id)} className="text-left text-[13px] text-text-secondary hover:text-text-primary hover:underline">{cut(u.title, 30)}</button></li>)}{down.length === 0 && <li className="text-[13px] text-text-tertiary">Nothing yet.</li>}</ul></div>
      </section>
      {n.href && <Link href={n.href} className="inline-flex h-9 items-center rounded-md bg-emph px-3.5 text-[13px] font-medium text-on-emph hover:bg-emph-hover">{n.hrefLabel ?? "Open"}</Link>}
    </div>
  );
}
