"use client";

import NextLink from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, Bell, BookOpen, Bot, Banknote, ChevronDown, ChevronRight, ClipboardCheck, Code2, Cog, Database, Headset, LifeBuoy, Maximize, Megaphone, Moon, Orbit, Plug, RotateCcw, Scale, Search,
  Sun, Telescope, TrendingUp, Users, X, ZoomIn, ZoomOut, type LucideIcon,
} from "lucide-react";
import { totals, useAgents } from "@/lib/agents/store";
import { usage } from "@/lib/agents/connectors";
import { useHub } from "@/lib/agents/hub";
import { useLive } from "@/lib/agents/useLive";
import { HEALTH_LABEL, healthOf } from "@/lib/agents/topology";
import { CONTROL_LABEL } from "@/lib/agents/types";
import { compact, dur, int, pct, usd } from "@/lib/agents/format";
import {
  COLOR_BY, DEFAULT_FORCES, USE_CASES, buildGraph, neighbourhood, radiusOf, seedPositions, tick, useCaseOf,
  type ColorBy, type Forces, type GEdge, type GNode, type SimNode,
} from "@/lib/agents/graph";

/** The icon each use case gets, and each kind of resource. An agent is drawn with the icon of what it does. */
const ICONS: Record<string, LucideIcon> = {
  support: Headset, finance: Banknote, legal: Scale, engineering: Code2, data: Database, sales: TrendingUp, people: Users, it: LifeBuoy, marketing: Megaphone,
  claims: ClipboardCheck, research: Telescope, operations: Cog, general: Bot, knowledge: BookOpen, channel: Bell, connection: Plug,
};
const RES_LABEL: Record<string, string> = { knowledge: "Knowledge base", channel: "Notification channel", connection: "Connection" };
const RES_PLURAL: Record<string, string> = { knowledge: "Knowledge", channel: "Notifications", connection: "Connections" };
const HEALTH_DOT: Record<string, string> = { failing: "#FF5C6C", degraded: "#FFC857", suspended: "#8A94A0", retired: "#5B6470" };
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** Everything that changes between the black and the light canvas. */
const THEMES = {
  dark: { bg: "#000", label: "#F2F5F7", dim: "#AEB8C0", edge: "#6B7480", edgeA: 0.42, resFill: "#05070A", res: { ready: "#7B8794", warning: "#FFC857", problem: "#FF5C6C" }, icon: "#05080C", rim: "rgba(255,255,255,0.4)", sel: "#FFFFFF", glow: true, halo: 0.07, haloLine: 0.28, haloGrey: "#8A94A0" },
  light: { bg: "#F5F6F8", label: "#10161C", dim: "#56616B", edge: "#7C8794", edgeA: 0.5, resFill: "#FFFFFF", res: { ready: "#7C8794", warning: "#C98A06", problem: "#D1343F" }, icon: "#0A0F14", rim: "rgba(0,0,0,0.22)", sel: "#10161C", glow: false, halo: 0.1, haloLine: 0.4, haloGrey: "#7C8794" },
} as const;

type View = { x: number; y: number; k: number };
type Display = { size: number; link: number; fade: number };
type Section = { id: string; label: string; color: string; ids: string[]; agents: number; runs: number; cost: number; failing: number };

/** Below this zoom the map becomes an overview: each section shows its totals and the individual labels give way. */
const OVERVIEW = 0.62;

export function AgentGraph({ initialSelect, onSwitchView }: { initialSelect?: string; onSwitchView?: () => void }) {
  const store = useAgents(); const hub = useHub(); const { agents, links, traces } = store;
  const [by, setBy] = useState<ColorBy>("department");
  const [resources, setResources] = useState(true); const [retired, setRetired] = useState(false);
  const [q, setQ] = useState(""); const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<string | null>(initialSelect ?? null); const [hover, setHover] = useState<string | null>(null);
  const [local, setLocal] = useState({ on: false, depth: 1 });
  const [forces, setForces] = useState<Forces>(DEFAULT_FORCES); const [disp, setDisp] = useState<Display>({ size: 1, link: 1, fade: 0.55 });
  const [liveOn, setLiveOn] = useState(true); const [pinned, setPinned] = useState<Set<string>>(new Set()); const [placed, setPlaced] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState({ filters: true, groups: true, display: false, forces: false }); const [collapsed, setCollapsed] = useState(false);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 }); const viewRef = useRef(view); viewRef.current = view;
  const [size, setSize] = useState({ w: 900, h: 600 });
  const [reduced, setReduced] = useState(false);
  // The canvas is black by default, as in Obsidian, with a light theme beside it. The choice is kept per browser and the page works without storage.
  const [light, setLight] = useState(false);
  useEffect(() => { try { setLight(localStorage.getItem("tok.graph.light") === "1"); } catch { /* storage unavailable */ } }, []);
  const toggleLight = () => setLight((v) => { const n = !v; try { localStorage.setItem("tok.graph.light", n ? "1" : "0"); } catch { /* storage unavailable */ } return n; });
  const T = THEMES[light ? "light" : "dark"];

  useEffect(() => { setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches); }, []);

  // ---- the data
  const pool = useMemo(() => agents.filter((a) => retired || a.state !== "retired"), [agents, retired]);
  const use = useMemo(() => usage(pool, hub), [pool, hub]);
  const full = useMemo(() => buildGraph(pool, links, use, { by, resources }), [pool, links, use, by, resources]);
  const byId = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const nodeBy = useMemo(() => new Map(full.nodes.map((n) => [n.id, n])), [full]);

  const shown = useMemo(() => {
    let nodes = full.nodes.filter((n) => n.kind === "resource" || !hidden.has(n.group));
    let edges = full.edges.filter((e) => nodes.some((n) => n.id === e.from) && nodes.some((n) => n.id === e.to));
    // A resource stays only while an agent that uses it is still shown.
    const used = new Set(edges.filter((e) => e.kind === "resource").map((e) => e.to));
    nodes = nodes.filter((n) => n.kind === "agent" || used.has(n.id));
    if (local.on && sel && nodes.some((n) => n.id === sel)) {
      const near = neighbourhood(edges, sel, local.depth);
      nodes = nodes.filter((n) => near.has(n.id)); edges = edges.filter((e) => near.has(e.from) && near.has(e.to));
    }
    return { nodes, edges };
  }, [full, hidden, local, sel, nodeBy]);

  /** The sections: agents by the group they are coloured by, and resources by kind. A section is drawn behind its members and moves them together. */
  const sections = useMemo<Section[]>(() => {
    const m = new Map<string, Section>();
    for (const n of shown.nodes) {
      const id = `${n.kind === "agent" ? "a" : "r"}:${n.group}`; let s = m.get(id);
      if (!s) { const g = full.groups.find((x) => x.key === n.group); s = { id, label: n.kind === "agent" ? g?.label ?? n.group : RES_PLURAL[n.group] ?? n.group, color: n.kind === "agent" ? g?.color ?? "#9AA7FF" : T.haloGrey, ids: [], agents: 0, runs: 0, cost: 0, failing: 0 }; m.set(id, s); }
      s.ids.push(n.id);
      if (n.kind === "agent") { const a = byId.get(n.id); if (a) { s.agents++; const d = a.daily[a.daily.length - 1]; s.runs += d?.executions ?? 0; s.cost += d?.costUsd ?? 0; if (healthOf(a) === "failing") s.failing++; } }
    }
    return [...m.values()].filter((s) => s.ids.length >= 2);
  }, [shown.nodes, full.groups, byId, T.haloGrey]);
  const sectionOf = useRef(new Map<string, string[]>()); sectionOf.current = new Map(sections.map((s) => [s.id, s.ids]));

  const live = useLive({ enabled: liveOn, agents: pool, traces });

  // ---- the simulation. Positions live in a ref and are written straight to the elements, so a frame costs no re-render.
  const sim = useRef<{ nodes: SimNode[]; idx: Map<string, number>; edges: { a: number; b: number; w: number }[]; groups: number[]; alpha: number; raf: number; drag: string | null }>({ nodes: [], idx: new Map(), edges: [], groups: [], alpha: 0, raf: 0, drag: null });
  const nodeEls = useRef(new Map<string, SVGGElement>()); const lineEls = useRef(new Map<string, SVGLineElement>());
  const haloEls = useRef(new Map<string, SVGGElement>());
  const forcesRef = useRef(forces); forcesRef.current = forces;
  const userMoved = useRef(false); const svgRef = useRef<SVGSVGElement>(null); const box = useRef<HTMLDivElement>(null);
  const shownEdges = useRef(new Map<string, GEdge>()); shownEdges.current = new Map(shown.edges.map((e) => [e.id, e]));

  const geom = useCallback((ids: string[]) => {
    const s = sim.current; const pts = ids.map((id) => s.nodes[s.idx.get(id) ?? -1]).filter(Boolean);
    if (!pts.length) return null;
    const cx = pts.reduce((t, p) => t + p.x, 0) / pts.length, cy = pts.reduce((t, p) => t + p.y, 0) / pts.length;
    return { cx, cy, r: Math.max(...pts.map((p) => Math.hypot(p.x - cx, p.y - cy) + p.r)) + 38 };
  }, []);

  const paint = useCallback(() => {
    const s = sim.current;
    for (const n of s.nodes) nodeEls.current.get(n.id)?.setAttribute("transform", `translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`);
    for (const [id, el] of lineEls.current) {
      const e = shownEdges.current.get(id); if (!e) continue;
      const a = s.nodes[s.idx.get(e.from) ?? -1], b = s.nodes[s.idx.get(e.to) ?? -1]; if (!a || !b) continue;
      el.setAttribute("x1", a.x.toFixed(1)); el.setAttribute("y1", a.y.toFixed(1)); el.setAttribute("x2", b.x.toFixed(1)); el.setAttribute("y2", b.y.toFixed(1));
    }
    for (const [id, el] of haloEls.current) {
      const g = geom(sectionOf.current.get(id) ?? []); if (!g) continue;
      const [c, t, st] = Array.from(el.children) as SVGElement[];
      c.setAttribute("cx", g.cx.toFixed(1)); c.setAttribute("cy", g.cy.toFixed(1)); c.setAttribute("r", g.r.toFixed(1));
      t.setAttribute("x", g.cx.toFixed(1)); t.setAttribute("y", (g.cy - g.r - 8).toFixed(1)); st.setAttribute("x", g.cx.toFixed(1)); st.setAttribute("y", (g.cy - g.r + 12).toFixed(1));
    }
  }, [geom]);

  // The controls panel covers the left of the canvas, so the map is fitted to the space beside it.
  const inset = collapsed ? 0 : 296;
  const fit = useCallback(() => {
    const s = sim.current; if (!s.nodes.length) return;
    const xs = s.nodes.map((n) => n.x), ys = s.nodes.map((n) => n.y); const pad = 120; const w = Math.max(240, size.w - inset);
    const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
    const k = clamp(Math.min(w / (x1 - x0), size.h / (y1 - y0)), 0.25, 1.6);
    setView({ k, x: inset + w / 2 - ((x0 + x1) / 2) * k, y: size.h / 2 - ((y0 + y1) / 2) * k });
  }, [size, inset]);
  const fitRef = useRef(fit); fitRef.current = fit;

  const run = useCallback(() => {
    cancelAnimationFrame(sim.current.raf);
    let frames = 0;
    const step = () => {
      const s = sim.current; if (s.drag) s.alpha = Math.max(s.alpha, 0.3);
      if (s.alpha > 0.01) { tick(s.nodes, s.edges, forcesRef.current, s.alpha, s.groups); s.alpha *= 0.975; frames++; paint(); if (!userMoved.current && frames % 20 === 0) fitRef.current(); }
      else if (!userMoved.current) fitRef.current();
      if (s.alpha > 0.01 || s.drag) s.raf = requestAnimationFrame(step);
    };
    sim.current.raf = requestAnimationFrame(step);
  }, [paint]);
  const wake = useCallback((alpha: number) => { sim.current.alpha = Math.max(sim.current.alpha, alpha); run(); }, [run]);

  // Rebuild the simulation when the set of nodes changes. Nodes that were already there keep their place, and a new one starts beside a neighbour.
  const signature = shown.nodes.map((n) => n.id).join("|") + "#" + shown.edges.map((e) => e.id).join("|");
  useEffect(() => {
    const prev = new Map(sim.current.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
    const ids = shown.nodes.map((n) => n.id); const nodes = seedPositions(ids, prev); const idx = new Map(ids.map((id, i) => [id, i]));
    const gi = new Map<string, number>();
    shown.nodes.forEach((n, i) => {
      nodes[i].r = radiusOf(n, disp.size); nodes[i].fixed = pinned.has(n.id) || placed.has(n.id);
      if (!prev.has(n.id) && prev.size) { const e = shown.edges.find((x) => (x.from === n.id && prev.has(x.to)) || (x.to === n.id && prev.has(x.from))); const o = e ? prev.get(e.from === n.id ? e.to : e.from)! : null; if (o) { nodes[i].x = o.x + Math.sin(i * 7.3) * 30; nodes[i].y = o.y + Math.cos(i * 5.1) * 30; } }
    });
    sim.current.groups = shown.nodes.map((n) => { const k = `${n.kind}:${n.group}`; if (!gi.has(k)) gi.set(k, gi.size); return gi.get(k)!; });
    sim.current.nodes = nodes; sim.current.idx = idx;
    sim.current.edges = shown.edges.map((e) => ({ a: idx.get(e.from)!, b: idx.get(e.to)!, w: e.kind === "resource" ? e.weight * 0.35 : e.weight }));
    if (!prev.size) userMoved.current = false;
    sim.current.alpha = prev.size ? 0.6 : 1; run();
    return () => cancelAnimationFrame(sim.current.raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  useEffect(() => {
    shown.nodes.forEach((n, i) => { const s = sim.current.nodes[i]; if (s && s.id === n.id) { s.r = radiusOf(n, disp.size); s.fixed = pinned.has(n.id) || placed.has(n.id); } });
    wake(0.3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disp.size, pinned, placed, forces]);
  useEffect(() => { const el = box.current; if (!el) return; const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight }); return () => ro.disconnect(); }, []);


  // ---- calls in flight. A hand-off between agents, or an agent using a connection, channel or knowledge base, sends packets along its line.
  const active = useMemo(() => {
    const out: { id: string; from: string; to: string; color: string }[] = [];
    for (const e of shown.edges) {
      const hop = live.frame.hops.has(`${e.from}>${e.to}`);
      const res = e.kind === "resource" && live.frame.resources[e.to]?.agentId === e.from;
      if (hop || res) out.push({ id: e.id, from: e.from, to: e.to, color: nodeBy.get(e.from)?.color ?? "#fff" });
    }
    return out;
  }, [shown.edges, live.frame, nodeBy]);
  const packetEls = useRef(new Map<string, SVGCircleElement>());
  useEffect(() => {
    if (!active.length || reduced) return;
    let raf = 0;
    const loop = (now: number) => {
      const s = sim.current;
      for (const a of active) for (let i = 0; i < 3; i++) {
        const el = packetEls.current.get(`${a.id}:${i}`); const p = s.nodes[s.idx.get(a.from) ?? -1], q = s.nodes[s.idx.get(a.to) ?? -1]; if (!el || !p || !q) continue;
        const t = ((now / 1100 + i / 3) % 1); const e = t * t * (3 - 2 * t);
        el.setAttribute("cx", (p.x + (q.x - p.x) * e).toFixed(1)); el.setAttribute("cy", (p.y + (q.y - p.y) * e).toFixed(1)); el.setAttribute("opacity", String(Math.sin(Math.PI * t).toFixed(2)));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf);
  }, [active, reduced]);

  // ---- pan, zoom, and dragging a node or a whole section
  const drag = useRef<{ kind: "pan" | "node" | "section"; id?: string; sx: number; sy: number; ox: number; oy: number; moved: boolean; w0?: { x: number; y: number }; start?: Map<string, { x: number; y: number }> } | null>(null);
  const toWorld = (cx: number, cy: number) => { const r = svgRef.current!.getBoundingClientRect(); const v = viewRef.current; return { x: (cx - r.left - v.x) / v.k, y: (cy - r.top - v.y) / v.k }; };
  const tip = useRef<HTMLDivElement>(null); const ptr = useRef({ x: 0, y: 0 });
  // The card sits beside the pointer and flips or slides so it never leaves the canvas; its height is measured, not guessed.
  const placeTip = useCallback(() => {
    const el = tip.current, host = box.current; if (!el || !host) return;
    const r = host.getBoundingClientRect(); const x = ptr.current.x - r.left, y = ptr.current.y - r.top; const w = el.offsetWidth || 300, h = el.offsetHeight;
    const left = x + 18 + w > r.width ? Math.max(8, x - 18 - w) : x + 18; const top = clamp(y + 14, 8, Math.max(8, r.height - h - 8));
    el.style.transform = `translate(${left}px, ${top}px)`;
  }, []);
  useEffect(() => { placeTip(); }, [hover, placeTip]);
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as Element).closest("[data-nodrag]")) return;
    const t = (e.target as Element).closest("[data-id]"); const sec = (e.target as Element).closest("[data-section]"); svgRef.current!.setPointerCapture(e.pointerId);
    if (t) { const id = t.getAttribute("data-id")!; const n = sim.current.nodes[sim.current.idx.get(id) ?? -1]; drag.current = { kind: "node", id, sx: e.clientX, sy: e.clientY, ox: n?.x ?? 0, oy: n?.y ?? 0, moved: false }; }
    else if (sec) {
      const id = sec.getAttribute("data-section")!; const start = new Map<string, { x: number; y: number }>();
      for (const m of sectionOf.current.get(id) ?? []) { const n = sim.current.nodes[sim.current.idx.get(m) ?? -1]; if (n) start.set(m, { x: n.x, y: n.y }); }
      drag.current = { kind: "section", id, sx: e.clientX, sy: e.clientY, ox: 0, oy: 0, moved: false, w0: toWorld(e.clientX, e.clientY), start };
    } else drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, ox: viewRef.current.x, oy: viewRef.current.y, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    ptr.current = { x: e.clientX, y: e.clientY }; placeTip();
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy; if (!d.moved && Math.hypot(dx, dy) < 4) return; d.moved = true;
    if (d.kind === "pan") { userMoved.current = true; setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy })); return; }
    const s = sim.current;
    if (d.kind === "section") {
      const w = toWorld(e.clientX, e.clientY); s.drag = "section";
      for (const [id, o] of d.start!) { const n = s.nodes[s.idx.get(id) ?? -1]; if (n) { n.fixed = true; n.x = o.x + (w.x - d.w0!.x); n.y = o.y + (w.y - d.w0!.y); n.vx = 0; n.vy = 0; } }
      wake(0.3); paint(); return;
    }
    const n = s.nodes[s.idx.get(d.id!) ?? -1]; if (!n) return;
    s.drag = d.id!; n.fixed = true; const w = toWorld(e.clientX, e.clientY); n.x = w.x; n.y = w.y; n.vx = 0; n.vy = 0; wake(0.3); paint();
  };
  const onUp = () => {
    const d = drag.current; drag.current = null; if (!d) return;
    const s = sim.current; s.drag = null;
    if (d.kind === "node") { const n = s.nodes[s.idx.get(d.id!) ?? -1]; if (n) n.fixed = pinned.has(d.id!) || placed.has(d.id!); if (!d.moved) setSel(d.id!); else wake(0.3); }
    else if (d.kind === "section") {
      if (d.moved) { setPlaced((p) => { const n = new Set(p); for (const id of d.start!.keys()) n.add(id); return n; }); }
      else setSel(null);
    } else if (!d.moved) setSel(null);
  };
  useEffect(() => {
    const el = svgRef.current; if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault(); userMoved.current = true; const r = el.getBoundingClientRect(); const v = viewRef.current;
      const k = clamp(v.k * Math.exp(-e.deltaY * 0.0012), 0.12, 4); const px = e.clientX - r.left, py = e.clientY - r.top;
      setView({ k, x: px - ((px - v.x) / v.k) * k, y: py - ((py - v.y) / v.k) * k });
    };
    el.addEventListener("wheel", wheel, { passive: false }); return () => el.removeEventListener("wheel", wheel);
  }, []);
  const zoomBy = (f: number) => { userMoved.current = true; setView((v) => { const k = clamp(v.k * f, 0.12, 4); return { k, x: size.w / 2 - ((size.w / 2 - v.x) / v.k) * k, y: size.h / 2 - ((size.h / 2 - v.y) / v.k) * k }; }); };
  const togglePin = (id: string) => { setPlaced((p) => { if (!p.has(id)) return p; const n = new Set(p); n.delete(id); return n; }); setPinned((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };
  const settle = () => { setPinned(new Set()); setPlaced(new Set()); wake(1); };

  // ---- what is lit
  const match = useMemo(() => { const t = q.trim().toLowerCase(); if (!t) return null; return new Set(shown.nodes.filter((n) => (n.label + " " + n.sub + " " + n.group).toLowerCase().includes(t)).map((n) => n.id)); }, [q, shown.nodes]);
  const focus = hover ?? sel; const near = useMemo(() => (focus ? neighbourhood(shown.edges, focus, 1) : null), [focus, shown.edges]);
  const nodeOpacity = (n: GNode) => (match ? (match.has(n.id) ? 1 : 0.12) : near ? (near.has(n.id) ? 1 : 0.13) : 1);
  const selNode = sel ? nodeBy.get(sel) : undefined;
  useEffect(() => { if (sel && !nodeBy.has(sel)) setSel(null); }, [sel, nodeBy]);

  const overview = view.k < OVERVIEW; const deep = view.k >= 1.7;
  const labelOpacity = (n: GNode, lit: boolean) => (lit ? 1 : overview ? 0 : clamp((view.k - (disp.fade + (n.kind === "resource" ? 0.35 : 0) - 0.15)) / 0.3, 0, 1));
  const px = 1 / view.k; const hoverNode = hover ? nodeBy.get(hover) : undefined;

  return (
    <div className={`${light ? "" : "tok-dark"} relative h-[calc(100vh-190px)] min-h-[560px] rounded-lg border border-border overflow-hidden select-none`} style={{ background: T.bg }}>
      <div ref={box} className="absolute inset-0">
        <svg ref={svgRef} className="h-full w-full touch-none cursor-grab active:cursor-grabbing" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} role="group" aria-label="Graph of agents">
          <defs><filter id="gglow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="3.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {/* sections: drag one to move everything in it. Zoom out and each shows its totals. */}
            {sections.map((s) => {
              const g = geom(s.ids); if (!g) return null;
              return (
                <g key={s.id} ref={(el) => { if (el) haloEls.current.set(s.id, el); else haloEls.current.delete(s.id); }} data-section={s.id} className="cursor-move">
                  <circle cx={g.cx} cy={g.cy} r={g.r} fill={s.color} fillOpacity={overview ? T.halo * 2.2 : T.halo} stroke={s.color} strokeOpacity={T.haloLine} strokeWidth={1.2 * px * 1.1} strokeDasharray={`${2 * px} ${7 * px}`} strokeLinecap="round" pointerEvents="all" />
                  <text x={g.cx} y={g.cy - g.r - 8} textAnchor="middle" fontSize={(overview ? 19 : 12.5) * px * 1.1} fontWeight={600} fill={s.color} pointerEvents="none" stroke={T.bg} strokeWidth={4 * px} paintOrder="stroke">{s.label}</text>
                  <text x={g.cx} y={g.cy - g.r + 12} textAnchor="middle" fontSize={11.5 * px * 1.1} fill={T.dim} pointerEvents="none" opacity={overview ? 1 : 0}>
                    {s.agents ? `${s.agents} agent${s.agents === 1 ? "" : "s"} · ${compact(s.runs)} runs today · ${usd(s.cost, 0)}${s.failing ? ` · ${s.failing} failing` : ""}` : `${s.ids.length} items`}
                  </text>
                </g>
              );
            })}
            {shown.edges.map((e) => {
              const hot = focus && (e.from === focus || e.to === focus); const a = nodeBy.get(e.from); const busy = active.some((x) => x.id === e.id);
              const dim = match ? !(match.has(e.from) && match.has(e.to)) : focus ? !hot : false;
              const a0 = sim.current.nodes[sim.current.idx.get(e.from) ?? -1], b0 = sim.current.nodes[sim.current.idx.get(e.to) ?? -1];
              return <line key={e.id} ref={(el) => { if (el) lineEls.current.set(e.id, el); else lineEls.current.delete(e.id); }} x1={a0?.x ?? 0} y1={a0?.y ?? 0} x2={b0?.x ?? 0} y2={b0?.y ?? 0}
                stroke={busy || hot ? a?.color ?? "#fff" : T.edge} strokeOpacity={busy ? 1 : hot ? 0.95 : dim ? 0.05 : e.kind === "agent" ? T.edgeA : T.edgeA * 0.55}
                strokeWidth={(e.kind === "agent" ? 1.2 + e.weight * 0.25 : 0.8) * disp.link * (hot || busy ? 1.6 : 1) * px * 1.1} strokeDasharray={e.kind === "resource" ? `${3 * px * 1.1} ${4 * px * 1.1}` : undefined}
                className={busy && !reduced ? "tok-flow" : undefined} strokeLinecap="round" pointerEvents="none" />;
            })}
            {/* calls in flight */}
            {!reduced && active.flatMap((a) => [0, 1, 2].map((i) => (
              <circle key={`${a.id}:${i}`} ref={(el) => { if (el) packetEls.current.set(`${a.id}:${i}`, el); else packetEls.current.delete(`${a.id}:${i}`); }} r={5 * px * 1.2} fill={a.color} stroke={light ? "#10161C" : "#fff"} strokeWidth={1.4 * px} pointerEvents="none" opacity={0} filter={T.glow ? "url(#gglow)" : undefined} />
            )))}
            {shown.nodes.map((n) => {
              const p = sim.current.nodes[sim.current.idx.get(n.id) ?? -1]; const r = radiusOf(n, disp.size); const lit = focus === n.id || sel === n.id || (near?.has(n.id) && !!focus) || !!(match && match.has(n.id));
              const Icon = ICONS[n.icon] ?? Bot; const agent = n.kind === "agent" ? byId.get(n.id) : undefined; const h = agent ? healthOf(agent) : undefined;
              const fr = agent ? live.frame.agents[n.id] : undefined; const phase = fr?.phase; const pulse = phase === "running" || phase === "waiting";
              const ring = n.kind === "resource" ? T.res[n.status ?? "ready"] : n.color; const lo = labelOpacity(n, !!lit); const today = agent?.daily[agent.daily.length - 1];
              const doing = fr?.doing && pulse && !overview ? fr.doing : null;
              return (
                <g key={n.id} ref={(el) => { if (el) nodeEls.current.set(n.id, el); else nodeEls.current.delete(n.id); }} data-id={n.id} transform={`translate(${p?.x ?? 0} ${p?.y ?? 0})`} opacity={nodeOpacity(n)}
                  className="cursor-pointer outline-none" tabIndex={0} role="button" aria-label={`${n.label}, ${n.kind === "agent" ? USE_CASES.find((u) => u.id === n.icon)?.label : RES_LABEL[n.icon]}`}
                  onPointerEnter={() => setHover(n.id)} onPointerLeave={() => setHover((c) => (c === n.id ? null : c))} onFocus={() => setHover(n.id)} onBlur={() => setHover(null)}
                  onDoubleClick={() => togglePin(n.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(n.id); } }}>
                  {pulse && !reduced && <circle r={r + 6} fill="none" stroke={phase === "waiting" ? "#FFC857" : n.color} strokeWidth={3} className={phase === "waiting" ? "tok-ping-slow" : "tok-ping"} pointerEvents="none" />}
                  {pulse && <circle r={r + 5} fill="none" stroke={phase === "waiting" ? "#FFC857" : n.color} strokeWidth={2} strokeDasharray={phase === "running" ? "7 6" : "2 6"} strokeLinecap="round" className={!reduced && phase === "running" ? "tok-flow" : undefined} pointerEvents="none" />}
                  {sel === n.id && <circle r={r + 9} fill="none" stroke={T.sel} strokeWidth={1.6} pointerEvents="none" />}
                  {n.kind === "agent" ? (
                    <>
                      <circle r={r} fill={n.color} filter={T.glow ? "url(#gglow)" : undefined} />
                      <circle r={r} fill="none" stroke={T.rim} strokeWidth={1} />
                      <Icon x={-r * 0.52} y={-r * 0.52} width={r * 1.04} height={r * 1.04} color={T.icon} strokeWidth={2.1} pointerEvents="none" />
                      {h && HEALTH_DOT[h] && <circle cx={r * 0.72} cy={r * 0.72} r={Math.max(4, r * 0.24)} fill={HEALTH_DOT[h]} stroke={T.bg} strokeWidth={1.5} />}
                    </>
                  ) : (
                    <>
                      <circle r={r} fill={T.resFill} stroke={ring} strokeWidth={1.6} />
                      <Icon x={-r * 0.55} y={-r * 0.55} width={r * 1.1} height={r * 1.1} color={ring} strokeWidth={2} pointerEvents="none" />
                    </>
                  )}
                  {(pinned.has(n.id)) && <circle cx={-r * 0.78} cy={-r * 0.78} r={3.5} fill={T.sel} stroke={T.bg} strokeWidth={1} />}
                  <text y={r + 14 * px * 1.15} textAnchor="middle" fontSize={12.5 * px * 1.15} fontWeight={n.kind === "agent" ? 600 : 500} fill={n.kind === "agent" ? T.label : T.dim} stroke={T.bg} strokeWidth={3.5 * px} paintOrder="stroke" opacity={lo} pointerEvents="none">{n.label.length > 26 ? n.label.slice(0, 25) + "…" : n.label}</text>
                  {deep && today && agent && agent.control !== "inventory" && <text y={r + 14 * px * 1.15 + 15 * px * 1.15} textAnchor="middle" fontSize={11 * px * 1.15} fill={T.dim} stroke={T.bg} strokeWidth={3 * px} paintOrder="stroke" pointerEvents="none">{int(today.executions)} runs today · {usd(today.costUsd, 2)}</text>}
                  {doing && <g pointerEvents="none" transform={`translate(0 ${-r - 14 * px * 1.2})`}><rect x={-(doing.length * 3.4 + 10) * px * 1.15} y={-10 * px * 1.15} width={(doing.length * 6.8 + 20) * px * 1.15} height={20 * px * 1.15} rx={10 * px * 1.15} fill={phase === "waiting" ? "#FFC857" : n.color} />
                    <text textAnchor="middle" y={4 * px * 1.15} fontSize={11 * px * 1.15} fontWeight={600} fill="#06090C">{doing}</text></g>}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* hover card */}
      <div ref={tip} className="pointer-events-none absolute left-0 top-0 z-20 w-[300px]" style={{ visibility: hoverNode && !drag.current?.moved ? "visible" : "hidden" }}>
        {hoverNode && <HoverCard n={hoverNode} agent={byId.get(hoverNode.id)} live={live.frame.agents[hoverNode.id]} replicas={live.replicas[hoverNode.id]} edges={shown.edges} nodeBy={nodeBy} />}
      </div>

      {/* controls, in the manner of Obsidian's graph settings */}
      <div data-nodrag className="absolute left-3 top-3 w-[272px] max-h-[calc(100%-24px)] overflow-y-auto rounded-lg border border-border bg-surface/90 backdrop-blur text-[13px] shadow-popover" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed} className="w-full flex items-center justify-between gap-2 px-3 h-10 font-semibold text-text-primary">
          <span>Graph</span><span className="text-xs font-normal text-text-tertiary flex-1 text-left">{shown.nodes.filter((n) => n.kind === "agent").length} agents{resources ? `, ${shown.nodes.filter((n) => n.kind === "resource").length} resources` : ""}</span>
          {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
        </button>
        {!collapsed && (
          <div className="border-t border-border">
            <Section title="Filters" open={open.filters} onToggle={() => setOpen((o) => ({ ...o, filters: !o.filters }))}>
              <div className="relative"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the graph" aria-label="Find an agent or resource" className="h-8 w-full rounded-md border border-border-strong bg-surface-subtle pl-8 pr-2 focus:outline-none focus:ring-2 focus:ring-accent-500/50" /></div>
              <Switch label="Resources" hint="Knowledge, channels, connections" on={resources} set={setResources} />
              <Switch label="Retired agents" on={retired} set={setRetired} />
              <Switch label="Local graph" hint={sel ? `Around ${selNode?.label ?? "the selection"}` : "Select a node first"} on={local.on && !!sel} set={(v) => setLocal((l) => ({ ...l, on: v }))} disabled={!sel} />
              {local.on && sel && <Slider label="Depth" min={1} max={4} step={1} value={local.depth} set={(v) => setLocal((l) => ({ ...l, depth: v }))} fmt={(v) => `${v}`} />}
            </Section>
            <Section title="Groups" open={open.groups} onToggle={() => setOpen((o) => ({ ...o, groups: !o.groups }))}>
              <label className="flex items-center justify-between gap-2 text-text-secondary">Colour by
                <select value={by} onChange={(e) => { setBy(e.target.value as ColorBy); setHidden(new Set()); }} className="h-8 rounded-md border border-border-strong bg-surface-subtle px-2 text-text-primary">{COLOR_BY.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
              <ul className="space-y-0.5">
                {full.groups.map((g) => { const off = hidden.has(g.key); return (
                  <li key={g.key}><button type="button" aria-pressed={!off} onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })}
                    className="w-full flex items-center gap-2 rounded px-1.5 py-1 hover:bg-surface-muted text-left"><span className="h-3 w-3 rounded-full shrink-0" style={{ background: off ? "transparent" : g.color, border: `2px solid ${g.color}` }} />
                    <span className={`flex-1 truncate ${off ? "text-text-tertiary line-through" : "text-text-primary"}`}>{g.label}</span><span className="text-xs tabular-nums text-text-tertiary">{g.count}</span></button></li>); })}
              </ul>
              {hidden.size > 0 && <button type="button" onClick={() => setHidden(new Set())} className="text-xs text-text-secondary underline underline-offset-2">Show every group</button>}
              <p className="text-[11px] text-text-tertiary">Drag a dotted section to move everything in it. Zoom out for each section's totals.</p>
            </Section>
            <Section title="Display" open={open.display} onToggle={() => setOpen((o) => ({ ...o, display: !o.display }))}>
              <Slider label="Node size" min={0.6} max={2} step={0.05} value={disp.size} set={(v) => setDisp((d) => ({ ...d, size: v }))} fmt={(v) => v.toFixed(2)} />
              <Slider label="Link thickness" min={0.4} max={3} step={0.1} value={disp.link} set={(v) => setDisp((d) => ({ ...d, link: v }))} fmt={(v) => v.toFixed(1)} />
              <Slider label="Text fade threshold" min={0.2} max={2} step={0.05} value={disp.fade} set={(v) => setDisp((d) => ({ ...d, fade: v }))} fmt={(v) => v.toFixed(2)} />
            </Section>
            <Section title="Forces" open={open.forces} onToggle={() => setOpen((o) => ({ ...o, forces: !o.forces }))}>
              <Slider label="Centre force" min={0} max={0.3} step={0.005} value={forces.center} set={(v) => setForces((f) => ({ ...f, center: v }))} fmt={(v) => v.toFixed(2)} />
              <Slider label="Repel force" min={200} max={8000} step={100} value={forces.repel} set={(v) => setForces((f) => ({ ...f, repel: v }))} fmt={(v) => `${Math.round(v)}`} />
              <Slider label="Link force" min={0} max={1} step={0.01} value={forces.link} set={(v) => setForces((f) => ({ ...f, link: v }))} fmt={(v) => v.toFixed(2)} />
              <Slider label="Link distance" min={50} max={400} step={5} value={forces.distance} set={(v) => setForces((f) => ({ ...f, distance: v }))} fmt={(v) => `${Math.round(v)}`} />
              <Slider label="Section pull" min={0} max={1} step={0.01} value={forces.group} set={(v) => setForces((f) => ({ ...f, group: v }))} fmt={(v) => v.toFixed(2)} />
              <button type="button" onClick={() => { setForces(DEFAULT_FORCES); setDisp({ size: 1, link: 1, fade: 0.55 }); }} className="text-xs text-text-secondary underline underline-offset-2">Restore defaults</button>
            </Section>
          </div>
        )}
      </div>

      <div data-nodrag className="absolute top-3 flex items-center gap-2" style={{ right: selNode ? 356 : 12 }} onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" aria-pressed={liveOn} onClick={() => setLiveOn((v) => !v)} title="Replay recent runs: agents pulse while they work and packets travel along a line while one agent calls another or uses a resource"
          className={`h-8 inline-flex items-center gap-2 rounded-md border px-3 text-[13px] font-medium ${liveOn ? "border-[#12B58A] text-[#0E9F77] bg-[#12B58A]/10" : "border-border-strong bg-surface text-text-secondary"}`}>
          <span className="relative flex h-2 w-2"><span className={`absolute inline-flex h-full w-full rounded-full ${liveOn && !reduced ? "animate-ping" : ""}`} style={{ background: liveOn ? "#12B58A" : "#6B7480", opacity: 0.6 }} /><span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: liveOn ? "#12B58A" : "#6B7480" }} /></span>
          Live{liveOn && live.playing ? `, ${live.playing} ${live.playing === 1 ? "run" : "runs"}` : ""}</button>
        {onSwitchView && <button type="button" onClick={onSwitchView} aria-label="Map view" title="Show these agents on the Constellation map"
          className="h-8 inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2.5 text-[13px] font-medium text-text-secondary hover:bg-surface-muted"><Orbit size={14} /> Map</button>}
        <button type="button" onClick={toggleLight} aria-pressed={light} aria-label={light ? "Black theme" : "Light theme"} title={light ? "Switch the canvas to the black theme" : "Switch the canvas to the light theme"}
          className="h-8 w-8 grid place-items-center rounded-md border border-border-strong bg-surface text-text-secondary hover:bg-surface-muted">{light ? <Moon size={15} /> : <Sun size={15} />}</button>
      </div>
      <div data-nodrag className="absolute bottom-3 flex items-center gap-1.5 rounded-lg border border-border bg-surface/90 p-1 shadow-card" style={{ right: selNode ? 356 : 12 }} onPointerDown={(e) => e.stopPropagation()}>
        <Tool label="Zoom in" onClick={() => zoomBy(1.3)}><ZoomIn size={15} /></Tool>
        <span className="w-11 text-center text-xs tabular-nums text-text-secondary" aria-live="polite">{Math.round(view.k * 100)}%</span>
        <Tool label="Zoom out" onClick={() => zoomBy(1 / 1.3)}><ZoomOut size={15} /></Tool>
        <span className="h-5 w-px bg-border" />
        <Tool label="Fit to screen" onClick={() => { userMoved.current = false; fit(); }}><Maximize size={15} /></Tool>
        <Tool label="Release moved nodes and let the layout settle again" onClick={settle}><RotateCcw size={15} /></Tool>
      </div>
      {overview && shown.nodes.length > 0 && <div data-nodrag className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-border bg-surface/90 px-3 py-1.5 text-xs text-text-secondary pointer-events-none">Overview. Zoom in for agents and their calls.</div>}
      {shown.nodes.length === 0 && <div className="absolute inset-0 grid place-items-center text-sm text-text-secondary pointer-events-none">Nothing to draw. Show a group again, or register an agent.</div>}

      {selNode && <Details key={selNode.id} n={selNode} onClose={() => setSel(null)} onSelect={(id) => setSel(id)} onLocal={() => setLocal({ on: true, depth: 1 })} all={nodeBy} edges={full.edges} />}
      <p className="sr-only">Drag a dotted section to move everything in it. Double click a node to pin it in place. Press Enter on a focused node to open its details.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------

function Section({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="border-b border-border last:border-b-0">
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full flex items-center gap-1.5 px-3 h-9 text-text-secondary font-medium hover:text-text-primary">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{title}</button>
      {open && <div className="px-3 pb-3 space-y-2.5">{children}</div>}
    </div>
  );
}
function Switch({ label, hint, on, set, disabled }: { label: string; hint?: string; on: boolean; set: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="text-text-primary">{label}</div>{hint && <div className="text-[11px] text-text-tertiary truncate">{hint}</div>}</div>
      <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => set(!on)} className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 ${on ? "bg-[#12B58A]" : "bg-surface-muted border border-border-strong"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} /></button></div>
  );
}
function Slider({ label, min, max, step, value, set, fmt }: { label: string; min: number; max: number; step: number; value: number; set: (v: number) => void; fmt: (v: number) => string }) {
  return (
    <label className="block"><div className="flex justify-between text-text-secondary"><span>{label}</span><span className="tabular-nums text-text-tertiary">{fmt(value)}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} className="w-full accent-[#12B58A]" /></label>
  );
}
function Tool({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className="h-7 w-7 grid place-items-center rounded-md text-text-secondary hover:bg-surface-muted hover:text-text-primary">{children}</button>;
}

/** What shows when the pointer rests on a node: enough to tell it apart and judge its state without opening it. */
function HoverCard({ n, agent, live, replicas, edges, nodeBy }: { n: GNode; agent?: ReturnType<typeof useAgents>["agents"][number]; live?: { phase: string; doing?: string }; replicas?: number; edges: GEdge[]; nodeBy: Map<string, GNode> }) {
  const row = (k: string, v: React.ReactNode) => <div className="flex justify-between gap-3"><span className="text-text-tertiary">{k}</span><span className="font-medium text-text-primary tabular-nums text-right">{v}</span></div>;
  const names = (ids: string[]) => ids.map((id) => nodeBy.get(id)?.label).filter(Boolean).slice(0, 3).join(", ") || "None";
  const out = edges.filter((e) => e.kind === "agent" && e.from === n.id).map((e) => e.to), inn = edges.filter((e) => e.kind === "agent" && e.to === n.id).map((e) => e.from);
  const res = edges.filter((e) => e.kind === "resource" && (e.from === n.id || e.to === n.id)).map((e) => (e.from === n.id ? e.to : e.from));
  const Icon = ICONS[n.icon] ?? Bot;
  if (!agent) return (
    <div className="rounded-lg border border-border bg-surface p-3 shadow-popover text-[13px] space-y-1.5"><div className="flex items-center gap-2"><Icon size={15} className="text-text-secondary" /><span className="font-semibold truncate">{n.label}</span></div>
      <div className="text-xs text-text-tertiary">{RES_LABEL[n.icon]} · {n.sub}</div>{row("Used by", names(res))}{n.status && n.status !== "ready" && <p className={`text-xs ${n.status === "problem" ? "text-status-down" : "text-[#E0A82E]"}`}>{n.status === "problem" ? "Has a problem" : "Needs a look"}</p>}
      <div className="text-[11px] text-text-tertiary pt-1 border-t border-border">Click for details. Drag to move.</div></div>
  );
  const t = totals(agent, 7); const today = agent.daily[agent.daily.length - 1]; const h = healthOf(agent); const measured = agent.control !== "inventory";
  return (
    <div className="rounded-lg border border-border bg-surface p-3 shadow-popover text-[13px] space-y-2">
      <div className="flex items-start gap-2.5"><span className="h-8 w-8 rounded-full grid place-items-center shrink-0" style={{ background: n.color }}><Icon size={17} color="#05080C" strokeWidth={2.2} /></span>
        <div className="min-w-0 flex-1"><div className="font-semibold truncate">{agent.title}</div><div className="text-xs text-text-tertiary truncate">{USE_CASES.find((u) => u.id === useCaseOf(agent))?.label} · {agent.department}</div></div>
        <span className="text-[11px] rounded px-1.5 py-0.5 font-medium shrink-0" style={{ background: (HEALTH_DOT[h] ?? "#3DDC97") + "33", color: HEALTH_DOT[h] ?? "#3DDC97" }}>{HEALTH_LABEL[h]}</span></div>
      {live && live.phase !== "idle" && <div className="text-xs font-medium" style={{ color: n.color }}>{live.doing ?? live.phase}</div>}
      <div className="space-y-1 text-xs">
        {row("Control", CONTROL_LABEL[agent.control])}{row("Framework", agent.framework)}
        {measured ? <>{row("Runs today", int(today.executions))}{row("Failed, 7 days", t.executions ? pct(t.failureRate) : "n/a")}{row("p95 time", agent.p95Ms ? dur(agent.p95Ms) : "n/a")}{row("Cost today", usd(today.costUsd, 2))}{replicas !== undefined && agent.execution && agent.execution.runtime !== "external" && row("Replicas", `×${replicas}`)}</> : <div className="text-text-tertiary">Registered by hand. Nothing is measured.</div>}
        {row("Calls", names(out))}{row("Called by", names(inn))}{row("Uses", `${res.length} resource${res.length === 1 ? "" : "s"}`)}
      </div>
      <div className="text-[11px] text-text-tertiary pt-1 border-t border-border">Click for details. Drag to move. Double click to pin.</div>
    </div>
  );
}

/** The panel for the chosen node, in the manner of Obsidian's backlinks: what it is, who it talks to, and what it uses. */
function Details({ n, onClose, onSelect, onLocal, all, edges }: { n: GNode; onClose: () => void; onSelect: (id: string) => void; onLocal: () => void; all: Map<string, GNode>; edges: GEdge[] }) {
  const { agents, links } = useAgents(); const a = n.kind === "agent" ? agents.find((x) => x.id === n.id) : undefined;
  const Icon = ICONS[n.icon] ?? Bot; const t = a ? totals(a, 7) : null; const today = a?.daily[a.daily.length - 1];
  const out = edges.filter((e) => e.kind === "agent" && e.from === n.id), inn = edges.filter((e) => e.kind === "agent" && e.to === n.id);
  const res = edges.filter((e) => e.kind === "resource" && (e.from === n.id || e.to === n.id));
  const row = (k: string, v: React.ReactNode) => <div className="flex justify-between gap-3"><span className="text-text-tertiary">{k}</span><span className="font-medium text-text-primary tabular-nums text-right">{v}</span></div>;
  const item = (id: string, sub?: string) => { const m = all.get(id); if (!m) return null; const I = ICONS[m.icon] ?? Bot; return (
    <li key={id + (sub ?? "")}><button type="button" onClick={() => onSelect(id)} className="w-full flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-surface-muted text-left">
      <span className="h-6 w-6 rounded-full grid place-items-center shrink-0" style={{ background: m.kind === "agent" ? m.color : "transparent", border: m.kind === "agent" ? "none" : "1.5px solid #7B8794" }}><I size={13} color={m.kind === "agent" ? "#05080C" : "#7B8794"} strokeWidth={2.2} /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-text-primary">{m.label}</span>{sub && <span className="block truncate text-[11px] text-text-tertiary">{sub}</span>}</span></button></li>); };
  const purpose = (e: GEdge) => links.find((l) => l.id === e.id)?.purpose;
  return (
    <aside data-nodrag className="absolute right-3 top-14 bottom-3 w-[332px] overflow-y-auto rounded-lg border border-border bg-surface/95 backdrop-blur shadow-popover text-[13px]" onPointerDown={(e) => e.stopPropagation()} aria-label="Details">
      <div className="p-4 space-y-4">
        <div className="flex items-start gap-3">
          <span className="h-11 w-11 rounded-full grid place-items-center shrink-0" style={{ background: n.kind === "agent" ? n.color : "transparent", border: n.kind === "agent" ? "none" : "2px solid #7B8794", boxShadow: n.kind === "agent" ? `0 0 18px ${n.color}66` : undefined }}><Icon size={22} color={n.kind === "agent" ? "#05080C" : "#7B8794"} strokeWidth={2.1} /></span>
          <div className="min-w-0 flex-1"><div className="font-semibold text-[15px] text-text-primary leading-tight">{n.label}</div><div className="text-xs text-text-tertiary mt-0.5">{n.kind === "agent" ? USE_CASES.find((u) => u.id === n.icon)?.label : RES_LABEL[n.icon]}</div></div>
          <button type="button" onClick={onClose} aria-label="Close details" className="h-7 w-7 grid place-items-center rounded-md text-text-secondary hover:bg-surface-muted"><X size={15} /></button>
        </div>
        {a ? (
          <>
            <p className="text-text-secondary">{a.description}</p>
            <div className="space-y-1.5">{row("Department", a.department)}{row("Framework", a.framework)}{row("Control", CONTROL_LABEL[a.control])}{row("State", HEALTH_LABEL[healthOf(a)])}{row("Owner", a.owner)}{row("Models", a.models.length ? a.models.join(", ") : "Not reported")}{row("Tools", a.tools.length)}</div>
            {a.control !== "inventory" && t && today && <div className="grid grid-cols-2 gap-2">
              {[["Runs today", int(today.executions)], ["Failed, 7 days", t.executions ? pct(t.failureRate) : "n/a"], ["p95 time", a.p95Ms ? dur(a.p95Ms) : "n/a"], ["Cost today", usd(today.costUsd, 2)]].map(([k, v]) => <div key={k} className="rounded-md border border-border px-2.5 py-2"><div className="text-[11px] text-text-tertiary">{k}</div><div className="text-sm font-semibold tabular-nums">{v}</div></div>)}</div>}
          </>
        ) : <>
          <p className="text-text-secondary">{n.sub}</p>
          {n.status && n.status !== "ready" && <p className={n.status === "problem" ? "text-status-down" : "text-[#E0A82E]"}>{n.status === "problem" ? "This resource has a problem." : "This resource needs a look."}</p>}
        </>}
        {out.length > 0 && <section><h4 className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary mb-1">Calls</h4><ul>{out.map((e) => item(e.to, purpose(e)))}</ul></section>}
        {inn.length > 0 && <section><h4 className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary mb-1">Called by</h4><ul>{inn.map((e) => item(e.from, purpose(e)))}</ul></section>}
        {res.length > 0 && <section><h4 className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary mb-1">{n.kind === "agent" ? "Uses" : "Used by"}</h4><ul>{res.map((e) => item(e.from === n.id ? e.to : e.from))}</ul></section>}
        {out.length + inn.length + res.length === 0 && <p className="text-text-tertiary">No links to other agents or resources.</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={onLocal} className="h-8 px-3 rounded-md border border-border-strong text-[13px] font-medium hover:bg-surface-muted">Show only its neighbours</button>
          {a && <NextLink href={`/agents/registry/${a.id}`} className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md bg-emph text-on-emph text-[13px] font-medium">Open agent <ArrowRight size={13} /></NextLink>}
          {a && <NextLink href={`/agents/constellation?view=map&agent=${a.id}`} className="h-8 px-3 inline-flex items-center rounded-md border border-border-strong text-[13px] font-medium hover:bg-surface-muted">On the map</NextLink>}
        </div>
      </div>
    </aside>
  );
}
