"use client";

import clsx from "clsx";
import Link from "next/link";
import {
  Activity, ChevronDown, Code2, Layers, LayoutTemplate, Maximize2, Minimize2, PanelLeft, Play, Redo2, Save,
  Scan, Trash2, Undo2, Workflow, X, ZoomIn, ZoomOut, FolderOpen, Sparkles, Wand2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, type CanvasHandle, type Sel } from "./Canvas";
import { CodePanel, Waterfall } from "./CodePanel";
import { generate } from "./codegen";
import { BY_KIND, defaultsFor } from "./catalog";
import { EdgeInspector, NodeInspector } from "./Inspector";
import { autoLayout, mkEdge, newId } from "./layout";
import { Palette } from "./Palette";
import { SCENARIOS, simulate, type Scenario, type SimResult } from "./sim";
import { POLICY_TEMPLATES, PIPELINE_TEMPLATES, TRACE_SAMPLES, templatesFor } from "./templates";
import { EDGE_STYLE, type EdgeType, type GNode, type Graph, type Mode, type NodeStatus } from "./types";
import { validate } from "./validate";

type Saved = { id: string; name: string; at: number; graph: Graph };

const MODES: { id: Mode; label: string; href: string; icon: typeof Layers }[] = [
  { id: "policy", label: "Policy", href: "/policy-studio", icon: Layers },
  { id: "pipeline", label: "Request path", href: "/pipeline-studio/request-path", icon: Workflow },
  { id: "trace", label: "Request trace", href: "/trace-studio", icon: Activity },
];

const btn =
  "h-8 px-2.5 rounded-md border border-border-strong bg-surface text-[13px] font-medium text-text-primary inline-flex items-center gap-1.5 hover:bg-surface-subtle disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap";

function Menu({ label, icon, align = "left", children, disabled }: { label: string; icon: ReactNode; align?: "left" | "right"; disabled?: boolean; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button className={btn} onClick={() => setOpen((o) => !o)} disabled={disabled} aria-expanded={open}>
        {icon}
        <span className="hidden xl:inline">{label}</span>
        <ChevronDown size={13} className="text-text-tertiary" />
      </button>
      {open && (
        <div className={clsx("absolute z-40 mt-1 w-[min(320px,86vw)] max-h-[360px] overflow-auto bg-surface border border-border rounded-md shadow-popover py-1", align === "right" ? "right-0" : "left-0")}>
          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary xl:hidden">{label}</div>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

const outcomeStyle: Record<string, string> = {
  ok: "bg-accent-50 text-accent-700 border-accent-600/30",
  denied: "bg-[#FCE9E9] text-[#B02A2A] border-status-down/30",
  warn: "bg-[#FBF1DE] text-[#9A5F05] border-status-degraded/30",
  failover: "bg-[#EFE9FD] text-[#6B3FD4] border-[#8B5CF6]/30",
};

export function Studio({ mode }: { mode: Mode }) {
  const initial = useCallback((): Graph => {
    if (mode === "policy") return POLICY_TEMPLATES[0].graph();
    if (mode === "pipeline") return PIPELINE_TEMPLATES[0].graph();
    return TRACE_SAMPLES[0].graph();
  }, [mode]);

  const [graph, setGraphState] = useState<Graph>(() => initial());
  const graphRef = useRef(graph);
  graphRef.current = graph;
  const [name, setName] = useState(mode === "policy" ? "default-prod-policy" : mode === "pipeline" ? "standard-gateway" : "trace");
  const [traceId, setTraceId] = useState(TRACE_SAMPLES[0].id);
  const [sel, setSel] = useState<Sel>(null);
  const [fitKey, setFitKey] = useState(0);
  const [animate, setAnimate] = useState(true);
  const [codeOpen, setCodeOpen] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dockHidden, setDockHidden] = useState(false);
  const [drawerH, setDrawerH] = useState(210);
  const [full, setFull] = useState(false);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [toast, setToast] = useState("");
  const [sim, setSim] = useState<{ result: SimResult; map: Record<string, NodeStatus>; done: boolean } | null>(null);
  const simTimers = useRef<number[]>([]);
  const pastRef = useRef<Graph[]>([]);
  const futureRef = useRef<Graph[]>([]);
  const [, bump] = useState(0);
  const lastEdit = useRef({ key: "", t: 0 });
  const canvasRef = useRef<CanvasHandle>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const hydrated = useRef(false);
  const locked = mode === "trace";
  const storeKey = `tokener.studio.v1.${mode}`;

  /* ---------------------------------------------------------- persistence */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storeKey);
      if (raw && mode !== "trace") {
        const s = JSON.parse(raw);
        if (s.graph?.nodes) {
          setGraphState(s.graph);
          setName(s.name || "untitled");
          setFitKey((k) => k + 1);
        }
        if (Array.isArray(s.saved)) setSaved(s.saved);
      }
    } catch {}
    if (mode === "trace") {
      const q = new URLSearchParams(window.location.search).get("req");
      const hit = TRACE_SAMPLES.find((t) => t.id === q || t.requestId === q);
      if (hit) {
        setTraceId(hit.id);
        setGraphState(hit.graph());
        setFitKey((k) => k + 1);
      }
    }
    if (window.innerWidth < 768) setCodeOpen(false);
    hydrated.current = true;
  }, [storeKey, mode]);

  useEffect(() => {
    if (!hydrated.current || mode === "trace") return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(storeKey, JSON.stringify({ graph, name, saved }));
      } catch {}
    }, 400);
    return () => clearTimeout(t);
  }, [graph, name, saved, storeKey, mode]);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 1600);
  };

  /* -------------------------------------------------------------- history */
  const snapshot = (key = "") => {
    const now = Date.now();
    if (key && lastEdit.current.key === key && now - lastEdit.current.t < 900) {
      lastEdit.current.t = now;
      return;
    }
    lastEdit.current = { key, t: now };
    pastRef.current.push(graphRef.current);
    if (pastRef.current.length > 60) pastRef.current.shift();
    futureRef.current = [];
    bump((v) => v + 1);
  };
  const edit = (fn: (g: Graph) => Graph, key = "") => {
    snapshot(key);
    setGraphState(fn(graphRef.current));
  };
  const undo = () => {
    const p = pastRef.current.pop();
    if (!p) return;
    futureRef.current.push(graphRef.current);
    setGraphState(p);
    setSel(null);
    bump((v) => v + 1);
  };
  const redo = () => {
    const f = futureRef.current.pop();
    if (!f) return;
    pastRef.current.push(graphRef.current);
    setGraphState(f);
    setSel(null);
    bump((v) => v + 1);
  };

  const clearSim = useCallback(() => {
    simTimers.current.forEach((t) => clearTimeout(t));
    simTimers.current = [];
    setSim(null);
  }, []);

  const loadGraph = (g: Graph, nextName?: string) => {
    clearSim();
    snapshot();
    setGraphState(g);
    if (nextName) setName(nextName);
    setSel(null);
    setFitKey((k) => k + 1);
  };

  /* ---------------------------------------------------------------- graph ops */
  const addNode = (kind: string, pos?: { x: number; y: number }) => {
    const def = BY_KIND[kind];
    if (!def || locked) return;
    if (def.singleton && graphRef.current.nodes.some((n) => n.kind === kind)) return;
    const c = pos ?? canvasRef.current?.centerWorld() ?? { x: 80, y: 80 };
    const jitter = pos ? 0 : (graphRef.current.nodes.length % 5) * 18;
    const node: GNode = {
      id: newId(kind, graphRef.current.nodes),
      kind,
      x: Math.round((pos ? c.x : c.x - 104) + jitter),
      y: Math.round((pos ? c.y : c.y - 34) + jitter),
      params: defaultsFor(kind),
    };
    edit((g) => {
      const next: Graph = { nodes: [...g.nodes, node], edges: [...g.edges] };
      if (mode === "policy" && !["request", "policy", "decision"].includes(kind)) {
        const req = g.nodes.find((n) => n.kind === "request");
        const hub = g.nodes.find((n) => n.kind === "policy");
        if (req) next.edges.push(mkEdge(next, req.id, node.id));
        if (hub) next.edges.push(mkEdge(next, node.id, hub.id));
      }
      return next;
    });
    setSel({ type: "node", id: node.id });
  };

  const connect = (from: string, to: string) => {
    const g = graphRef.current;
    const a = g.nodes.find((n) => n.id === from), b = g.nodes.find((n) => n.id === to);
    if (!a || !b || locked) return;
    if (!BY_KIND[a.kind]?.hasOut || !BY_KIND[b.kind]?.hasIn) {
      flash(`${BY_KIND[b.kind]?.hasIn ? BY_KIND[a.kind].label : BY_KIND[b.kind].label} cannot take that connection`);
      return;
    }
    if (g.edges.some((e) => e.from === from && e.to === to)) return;
    edit((gg) => ({ ...gg, edges: [...gg.edges, mkEdge(gg, from, to)] }));
  };

  const removeSel = () => {
    if (!sel || locked) return;
    if (sel.type === "node") edit((g) => ({ nodes: g.nodes.filter((n) => n.id !== sel.id), edges: g.edges.filter((e) => e.from !== sel.id && e.to !== sel.id) }));
    else edit((g) => ({ ...g, edges: g.edges.filter((e) => e.id !== sel.id) }));
    setSel(null);
  };

  const duplicate = () => {
    if (sel?.type !== "node") return;
    const n = graphRef.current.nodes.find((x) => x.id === sel.id);
    if (!n || BY_KIND[n.kind].singleton) return;
    const copy: GNode = { ...n, id: newId(n.kind, graphRef.current.nodes), x: n.x + 30, y: n.y + 30, params: { ...n.params }, meta: undefined };
    edit((g) => ({ ...g, nodes: [...g.nodes, copy] }));
    setSel({ type: "node", id: copy.id });
  };

  const setParam = (id: string, key: string, v: any) =>
    edit((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, params: { ...n.params, [key]: v } } : n)) }), `p:${id}:${key}`);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" && full) setFull(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [full]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName)) return;
    if ((e.key === "Delete" || e.key === "Backspace") && sel) {
      e.preventDefault();
      removeSel();
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
    }
  };

  /* ------------------------------------------------------------ derived */
  const issues = useMemo(() => validate(mode, graph), [mode, graph]);
  const issueNodes = useMemo(() => {
    const m: Record<string, "error" | "warn" | "info"> = {};
    issues.forEach((i) => {
      if (!i.nodeId) return;
      const cur = m[i.nodeId];
      if (!cur || (i.level === "error") || (i.level === "warn" && cur === "info")) m[i.nodeId] = i.level;
    });
    return m;
  }, [issues]);
  const tabs = useMemo(() => generate(mode, graph, name), [mode, graph, name]);
  const totalMs = useMemo(() => Math.max(1, ...graph.nodes.map((n) => (n.meta ? n.meta.startMs + n.meta.ms : 0))), [graph.nodes]);
  const errors = issues.filter((i) => i.level === "error").length;
  const warns = issues.filter((i) => i.level === "warn").length;
  const selNode = sel?.type === "node" ? graph.nodes.find((n) => n.id === sel.id) : undefined;
  const selEdge = sel?.type === "edge" ? graph.edges.find((e) => e.id === sel.id) : undefined;
  const sample = TRACE_SAMPLES.find((t) => t.id === traceId)!;

  /* ----------------------------------------------------------- simulation */
  const runSim = (sc: Scenario) => {
    clearSim();
    setSel(null);
    const result = simulate(graphRef.current, sc);
    setSim({ result, map: {}, done: false });
    result.steps.forEach((s, i) => {
      simTimers.current.push(
        window.setTimeout(() => {
          setSim((cur) => (cur ? { ...cur, map: { ...cur.map, [s.id]: "active" } } : cur));
        }, i * 520),
        window.setTimeout(() => {
          setSim((cur) => (cur ? { ...cur, map: { ...cur.map, [s.id]: s.status } } : cur));
        }, i * 520 + 380)
      );
    });
    simTimers.current.push(window.setTimeout(() => setSim((cur) => (cur ? { ...cur, done: true } : cur)), result.steps.length * 520 + 200));
  };

  const loadTrace = (id: string) => {
    const t = TRACE_SAMPLES.find((x) => x.id === id)!;
    setTraceId(id);
    setSel(null);
    setGraphState(t.graph());
    setFitKey((k) => k + 1);
  };

  const saveCurrent = () => {
    const entry: Saved = { id: `s_${Date.now()}`, name: name.trim() || "untitled", at: Date.now(), graph: graphRef.current };
    setSaved((s) => [entry, ...s.filter((x) => x.name !== entry.name)]);
    flash(`Saved "${entry.name}"`);
  };

  const modeTitle = mode === "policy" ? "Policy" : mode === "pipeline" ? "Pipeline" : "Trace";

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className={clsx("flex flex-col bg-surface border border-border overflow-hidden outline-none", full ? "fixed inset-0 z-[70] rounded-none" : "rounded-lg h-[calc(100vh-14rem)] min-h-[680px]")}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border bg-surface">
        <div className="inline-flex rounded-md border border-border-strong p-0.5 bg-surface-subtle">
          {MODES.map((m) => {
            const I = m.icon;
            return (
              <Link key={m.id} href={m.href} className={clsx("h-7 px-2.5 rounded text-[13px] font-medium inline-flex items-center gap-1.5", mode === m.id ? "bg-surface text-text-primary shadow-card" : "text-text-secondary hover:text-text-primary")}>
                <I size={14} /> <span className="hidden sm:inline">{m.label}</span>
              </Link>
            );
          })}
        </div>

        {!locked && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label={`${modeTitle} name`}
            className="h-8 w-44 px-2.5 rounded-md border border-border-strong text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:border-accent-600"
          />
        )}
        {locked && (
          <div className="flex items-center gap-2 text-[13px]">
            <span className="font-mono text-text-primary">{sample.requestId}</span>
            <span className={clsx("px-2 py-0.5 rounded-full border text-[11px] font-semibold", outcomeStyle[sample.outcome])}>{sample.title}</span>
            <span className="text-text-tertiary hidden md:inline">{sample.totalMs.toLocaleString("en-US")} ms total</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5 ml-auto">
          <button className={clsx(btn, "lg:hidden")} onClick={() => setPaletteOpen((o) => !o)}><PanelLeft size={14} /> {locked ? "Requests" : "Nodes"}</button>
          <button className={clsx(btn, "hidden lg:inline-flex", !dockHidden && "bg-surface-muted")} onClick={() => { setDockHidden((d) => !d); setTimeout(() => canvasRef.current?.fit(), 60); }} aria-pressed={!dockHidden}><PanelLeft size={14} /><span className="hidden xl:inline">{locked ? "Requests" : "Nodes"}</span></button>

          {!locked && (
            <>
              <Menu label="Templates" icon={<LayoutTemplate size={14} />}>
                {(close) => templatesFor(mode).map((t) => (
                  <button key={t.id} onClick={() => { loadGraph(t.graph(), t.id === "blank" ? `new-${mode}` : t.id === "retail" ? "default-prod-policy" : t.id); close(); }} className="w-full text-left px-3 py-2 hover:bg-surface-subtle">
                    <div className="text-[13px] font-medium text-text-primary">{t.name}</div>
                    <div className="text-xs text-text-tertiary">{t.blurb}</div>
                  </button>
                ))}
              </Menu>
              <Menu label="Saved" icon={<FolderOpen size={14} />} align="right">
                {(close) =>
                  saved.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-text-tertiary">Nothing saved yet. Use Save to keep this {mode} in your browser.</div>
                  ) : (
                    saved.map((s) => (
                      <div key={s.id} className="flex items-center hover:bg-surface-subtle">
                        <button onClick={() => { loadGraph(s.graph, s.name); close(); }} className="flex-1 text-left px-3 py-2 min-w-0">
                          <div className="text-[13px] font-medium text-text-primary truncate">{s.name}</div>
                          <div className="text-xs text-text-tertiary">{s.graph.nodes.length} nodes, {new Date(s.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</div>
                        </button>
                        <button aria-label={`Delete ${s.name}`} onClick={() => setSaved((x) => x.filter((y) => y.id !== s.id))} className="h-8 w-8 mr-1 grid place-items-center rounded text-text-tertiary hover:text-status-down"><Trash2 size={14} /></button>
                      </div>
                    ))
                  )
                }
              </Menu>
              <button className={btn} onClick={undo} disabled={!pastRef.current.length} aria-label="Undo"><Undo2 size={14} /></button>
              <button className={btn} onClick={redo} disabled={!futureRef.current.length} aria-label="Redo"><Redo2 size={14} /></button>
              <button className={btn} onClick={() => { edit((g) => autoLayout(g)); setFitKey((k) => k + 1); }}><Wand2 size={14} /><span className="hidden xl:inline">Tidy</span></button>
            </>
          )}

          {mode === "pipeline" && (
            <Menu label="Simulate" icon={<Play size={14} />} align="right">
              {(close) => SCENARIOS.map((s) => (
                <button key={s.id} onClick={() => { runSim(s.id); close(); }} className="w-full text-left px-3 py-2 hover:bg-surface-subtle">
                  <div className="text-[13px] font-medium text-text-primary">{s.label}</div>
                  <div className="text-xs text-text-tertiary">{s.blurb}</div>
                </button>
              ))}
            </Menu>
          )}

          <button className={clsx(btn, animate && "bg-accent-50 border-accent-600/50")} onClick={() => setAnimate((a) => !a)} aria-pressed={animate}><Sparkles size={14} /><span className="hidden xl:inline">Flow</span></button>
          <button className={btn} onClick={() => canvasRef.current?.fit()} aria-label="Fit to screen"><Scan size={14} /></button>
          <button className={clsx(btn, codeOpen && "bg-surface-muted")} onClick={() => setCodeOpen((o) => !o)} aria-pressed={codeOpen}>
            <Code2 size={14} /><span className="hidden xl:inline">{locked ? "Details" : "Code"}</span>
            {errors > 0 ? <span className="px-1.5 rounded-full bg-status-down text-white text-[10px] font-semibold">{errors}</span> : warns > 0 ? <span className="px-1.5 rounded-full bg-status-degraded text-white text-[10px] font-semibold">{warns}</span> : <span className="h-2 w-2 rounded-full bg-status-healthy" />}
          </button>
          {!locked && <button className={clsx(btn, "bg-emph text-on-emph border-emph hover:bg-emph-hover")} onClick={saveCurrent}><Save size={14} /><span className="hidden sm:inline">Save</span></button>}
          <button className={btn} onClick={() => setFull((f) => !f)} aria-label={full ? "Exit fullscreen" : "Fullscreen"}>{full ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 relative">
        {/* Left panel */}
        <aside className={clsx("w-[256px] shrink-0 border-r border-border bg-surface z-30", paletteOpen ? "absolute inset-y-0 left-0 flex flex-col shadow-popover lg:static lg:shadow-none" : "hidden", !dockHidden && "lg:static lg:flex lg:flex-col")}>
          {locked ? (
            <div className="flex flex-col h-full min-h-0">
              <div className="px-4 py-3 border-b border-border">
                <div className="text-[13px] font-semibold text-text-primary">Recent requests</div>
                <p className="text-[11px] text-text-tertiary mt-1 leading-snug">Open a request from the Usage or Audit Explorer to see its path here.</p>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {TRACE_SAMPLES.map((t) => (
                  <button key={t.id} onClick={() => { loadTrace(t.id); setPaletteOpen(false); }} className={clsx("w-full text-left rounded-md border px-3 py-2.5", traceId === t.id ? "border-accent-600 bg-accent-50" : "border-border hover:bg-surface-subtle")}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-medium text-text-primary">{t.title}</span>
                      <span className={clsx("px-1.5 py-px rounded-full border text-[10px] font-semibold", outcomeStyle[t.outcome])}>{t.outcome}</span>
                    </div>
                    <div className="font-mono text-[11px] text-text-tertiary mt-1">{t.requestId}</div>
                    <div className="text-[11px] text-text-secondary mt-1 truncate">{t.model} &middot; {t.totalMs.toLocaleString("en-US")} ms</div>
                    <div className="text-[11px] text-text-tertiary truncate">{t.who}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <Palette mode={mode} graph={graph} onAdd={(k) => { addNode(k); setPaletteOpen(false); }} />
          )}
        </aside>

        {/* Canvas column */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="relative flex-1 min-h-[300px]">
            <Canvas
              ref={canvasRef}
              graph={graph}
              mode={mode}
              selection={sel}
              onSelect={(s) => { setSel(s); setPaletteOpen(false); }}
              onMoveStart={() => snapshot()}
              onMoveNode={(id, x, y) => setGraphState((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, x: Math.round(x), y: Math.round(y) } : n)) }))}
              onConnect={connect}
              onDropKind={(k, x, y) => addNode(k, { x: Math.round(x), y: Math.round(y) })}
              animate={animate}
              statusMap={sim?.map ?? {}}
              issueNodes={mode === "trace" ? {} : issueNodes}
              fitKey={fitKey}
              totalMs={mode === "trace" ? totalMs : undefined}
              structureLocked={locked}
            />

            {/* zoom controls */}
            <div className="absolute left-3 bottom-3 flex flex-col rounded-md border border-border-strong bg-surface shadow-card overflow-hidden z-10">
              <button aria-label="Zoom in" className="h-8 w-8 grid place-items-center hover:bg-surface-subtle" onClick={() => canvasRef.current?.zoomBy(1.2)}><ZoomIn size={15} /></button>
              <button aria-label="Zoom out" className="h-8 w-8 grid place-items-center hover:bg-surface-subtle border-t border-border" onClick={() => canvasRef.current?.zoomBy(1 / 1.2)}><ZoomOut size={15} /></button>
            </div>

            {/* legend */}
            <div className="absolute left-3 top-3 pointer-events-none hidden md:flex flex-wrap gap-x-3 gap-y-1 rounded-md border border-border bg-surface/95 px-2.5 py-1.5 text-[11px] text-text-secondary max-w-[60%] z-10">
              {(Object.keys(EDGE_STYLE) as EdgeType[]).map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5">
                  <svg width="22" height="6" aria-hidden><line x1="0" y1="3" x2="22" y2="3" stroke={EDGE_STYLE[t].color} strokeWidth="2" strokeDasharray={EDGE_STYLE[t].dash} /></svg>
                  {EDGE_STYLE[t].label}
                </span>
              ))}
            </div>

            {toast && <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 rounded-md bg-emph text-on-emph text-xs px-3 py-1.5 shadow-popover">{toast}</div>}

            {sim && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 rounded-md border border-border bg-surface shadow-popover pl-3 pr-1.5 py-1.5 max-w-[92%]">
                {!sim.done ? <span className="h-2 w-2 rounded-full bg-accent-500 animate-pulse" /> : <span className={clsx("h-2 w-2 rounded-full", sim.result.tone === "ok" ? "bg-status-healthy" : sim.result.tone === "warn" ? "bg-status-degraded" : "bg-status-down")} />}
                <span className="text-[13px] text-text-primary font-medium truncate">{sim.done ? sim.result.outcome : "Simulating request"}</span>
                <button onClick={clearSim} aria-label="Clear simulation" className="h-7 w-7 grid place-items-center rounded text-text-tertiary hover:bg-surface-muted"><X size={14} /></button>
              </div>
            )}

            {/* Inspector overlay */}
            {(selNode || selEdge) && (
              <div className="absolute right-3 top-3 bottom-3 w-[330px] max-w-[calc(100%-1.5rem)] rounded-lg border border-border bg-surface shadow-popover z-20 overflow-hidden">
                {selNode && (
                  <NodeInspector
                    key={selNode.id}
                    node={selNode}
                    mode={mode}
                    issues={issues}
                    onParam={(k, v) => setParam(selNode.id, k, v)}
                    onDelete={removeSel}
                    onDuplicate={duplicate}
                    onClose={() => setSel(null)}
                  />
                )}
                {selEdge && (
                  <EdgeInspector
                    edge={selEdge}
                    from={selEdge.from}
                    to={selEdge.to}
                    locked={locked}
                    onType={(t) => edit((g) => ({ ...g, edges: g.edges.map((e) => (e.id === selEdge.id ? { ...e, type: t } : e)) }), `et:${selEdge.id}`)}
                    onLabel={(s) => edit((g) => ({ ...g, edges: g.edges.map((e) => (e.id === selEdge.id ? { ...e, label: s } : e)) }), `el:${selEdge.id}`)}
                    onDelete={removeSel}
                    onClose={() => setSel(null)}
                  />
                )}
              </div>
            )}
          </div>

          {codeOpen && (
            <div className="shrink-0 border-t border-border relative" style={{ height: drawerH }}>
              <div
                role="separator"
                aria-label="Resize panel"
                className="absolute -top-1.5 left-0 right-0 h-3 cursor-row-resize z-10 group"
                onPointerDown={(e) => {
                  e.preventDefault();
                  const sy = e.clientY, sh = drawerH;
                  const move = (ev: PointerEvent) => setDrawerH(Math.min(560, Math.max(120, sh + (sy - ev.clientY))));
                  const up = () => window.removeEventListener("pointermove", move);
                  window.addEventListener("pointermove", move);
                  window.addEventListener("pointerup", up, { once: true });
                }}
              >
                <span className="absolute left-1/2 top-1 -translate-x-1/2 h-1 w-10 rounded-full bg-border-strong group-hover:bg-accent-600" />
              </div>
              <CodePanel
                key={mode}
                tabs={tabs}
                issues={issues}
                extra={
                  locked
                    ? [{ id: "waterfall", label: "Waterfall", body: <Waterfall graph={graph} totalMs={totalMs} selectedId={selNode?.id} onSelect={(id) => setSel({ type: "node", id })} /> }]
                    : undefined
                }
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


