"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import NextLink from "next/link";
import { Activity, AlertTriangle, ChevronDown, ChevronUp, Cloud, ClipboardList, Eye, Hammer, Hourglass, Layers as Stack, Maximize, Maximize2, Minimize2, Moon, Network, Pause, Plug, RotateCcw, Search, ShieldAlert, ShieldCheck, Sun, X, ZoomIn, ZoomOut } from "lucide-react";
import { NodeIcon } from "@/components/studio/icons";
import { ADAPTER_BY_ID } from "@/lib/agents/adapters";
import { liveOf, totals, useAgents } from "@/lib/agents/store";
import { NODE, ROLE_LABEL, layoutResources, usage, type UsageNode } from "@/lib/agents/connectors";
import { useHub } from "@/lib/agents/hub";
import { useLive } from "@/lib/agents/useLive";
import type { AgentFrame } from "@/lib/agents/replay";
import { CONTROL_LABEL, type Agent, type ControlLevel } from "@/lib/agents/types";
import { compact, dur, int, pct, usd } from "@/lib/agents/format";
import {
  HEALTH_COLOR, HEALTH_LABEL, ORBIT, POLICY_BY_ID, PROTOCOL_BY_ID, PROTOCOLS, R, RING, STATE_COLORS, arc, groupBoxes, healthOf, layout, linkPath, policiesFor, ringSegments,
  type AppliedPolicy, type Exposure, type Health, type Link, type PolicyKind, type Protocol, type Pt,
} from "@/lib/agents/topology";
import { Legend, type Highlight, type Layers } from "./ConstellationLegend";
import { assess, bucketOf, memberCounts, type Bucket, type Posture } from "@/lib/agents/network";
import { postureColor } from "./NetworkBits";
import { ConstellationPanel, type Selection } from "./ConstellationPanel";
import { BandBox, LIVE_COLOR, ResourceNode, resourcePath } from "./ConstellationResources";

const CLOUD = "__cloud";
const MIN_K = 0.2, MAX_K = 3;
/** Zoom steps at which more of an agent is drawn: a label, then key figures, then the full card. */
const LABEL_K = 0.4, FIGURES_K = 1.25, CARD_K = 2.1;
const PREFERRED = ["Customer Support", "Marketing", "Finance", "Legal", "Operations", "Engineering", "Sales", "People", "IT"];
/** Space kept clear on the left for the legend and, when something is selected, on the right for the panel. */
const LEGEND_W = 262, PANEL_W = 444;

type View = { x: number; y: number; k: number };
type Hover = { kind: "agent" | "link" | "group" | "exposure" | "cloud" | "resource" | "band"; id: string } | null;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ink = "rgb(var(--c-text-primary))";
const soft = "rgb(var(--c-text-secondary))";
const faint = "rgb(var(--c-text-tertiary))";
const surface = "rgb(var(--c-surface))";
const border = "rgb(var(--c-border-strong))";

export function Constellation({ initialSelect, trace, onSwitchView, full, onToggleFull }: { initialSelect?: string; trace?: string; onSwitchView?: () => void; full?: boolean; onToggleFull?: () => void }) {
  const store = useAgents();
  const { agents, links, exposures, policies, traces, networks } = store;
  const live = useMemo(() => liveOf(store), [store]);
  const hub = useHub();
  const wrap = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 700 });
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 0.6 });
  const [moved, setMoved] = useState<Record<string, Pt>>({});
  const [sel, setSel] = useState<Selection | null>(initialSelect ? { kind: "agent", id: initialSelect } : null);
  const [hover, setHover] = useState<Hover>(null);
  const [highlight, setHighlight] = useState<Highlight>(null);
  const [off, setOff] = useState<{ protocols: Protocol[]; policies: PolicyKind[] }>({ protocols: [], policies: [] });
  const [layers, setLayers] = useState<Layers>({ groups: true, exposure: true, labels: true, traffic: true, retired: false, connectors: true, security: true });
  const [liveOn, setLiveOn] = useState(true);
  const [filters, setFilters] = useState<{ control: "all" | ControlLevel; dept: string; q: string }>({ control: "all", dept: "all", q: "" });
  const [reduced, setReduced] = useState(false);
  // The black theme belongs to this canvas only. It is remembered per browser, and the page works without storage.
  const [dark, setDark] = useState(false);
  useEffect(() => { try { setDark(localStorage.getItem("tok.constellation.dark") === "1"); } catch { /* storage unavailable */ } }, []);
  const toggleDark = () => setDark((d) => { const n = !d; try { localStorage.setItem("tok.constellation.dark", n ? "1" : "0"); } catch { /* storage unavailable */ } return n; });
  const fitted = useRef(false);
  const pointer = useRef({ x: 0, y: 0 });

  useEffect(() => { const m = window.matchMedia("(prefers-reduced-motion: reduce)"); setReduced(m.matches); const f = () => setReduced(m.matches); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, []);

  // The agents that exist for layout purposes. Filters hide agents but never move the rest.
  const all = useMemo(() => agents.filter((a) => layers.retired || a.state !== "retired"), [agents, layers.retired]);
  const base = useMemo(() => layout(all, PREFERRED), [all]);
  const pos = useMemo(() => ({ ...base.pos, ...moved }), [base, moved]);
  const cloud = moved[CLOUD] ?? base.cloud;
  // Connections, channels and knowledge bases that agents use, laid out in bands to the right of the departments.
  const use = useMemo(() => usage(all, hub), [all, hub]);
  const nodeBy = useMemo(() => new Map(use.nodes.map((n) => [n.key, n])), [use]);
  const res = useMemo(() => {
    const bx = groupBoxes(all, base.pos); const right = bx.length ? Math.max(...bx.map((b) => b.x + b.w)) : 0; const top = bx.length ? Math.min(...bx.map((b) => b.y)) : 0;
    return layoutResources(use.nodes, base.pos, { x: right + 230, y: top });
  }, [use, all, base]);
  const rpos = useMemo(() => Object.fromEntries(Object.keys(res.pos).map((k) => [k, moved[k] ?? res.pos[k]])) as Record<string, Pt>, [res, moved]);
  const shown = useMemo(() => all.filter((a) => (filters.control === "all" || a.control === filters.control) && (filters.dept === "all" || a.department === filters.dept)), [all, filters.control, filters.dept]);
  const shownIds = useMemo(() => new Set(shown.map((a) => a.id)), [shown]);
  const byId = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const departments = useMemo(() => [...new Set(all.map((a) => a.department))].sort(), [all]);

  const health = useMemo(() => new Map(agents.map((a) => [a.id, healthOf(a)])), [agents]);
  const applied = useMemo(() => new Map(agents.map((a) => [a.id, policiesFor(a, policies)])), [agents, policies]);
  const expOf = useMemo(() => new Map(exposures.map((e) => [e.agentId, e])), [exposures]);

  // Links between the same two agents are bowed apart.
  const drawn = useMemo(() => {
    const vis = links.filter((l) => shownIds.has(l.from) && shownIds.has(l.to) && !off.protocols.includes(l.protocol));
    const pair = new Map<string, Link[]>();
    for (const l of vis) { const k = [l.from, l.to].sort().join("|"); pair.set(k, [...(pair.get(k) ?? []), l]); }
    return vis.map((l) => {
      const k = [l.from, l.to].sort().join("|"); const group = pair.get(k)!;
      const p = linkPath(pos[l.from], pos[l.to], group.indexOf(l), group.length, l.from > l.to);
      return { link: l, ...p };
    });
  }, [links, shownIds, off.protocols, pos]);

  const boxes = useMemo(() => groupBoxes(shown, pos), [shown, pos]);
  const visNodes = useMemo(() => (layers.connectors ? use.nodes.filter((n) => n.agentIds.some((id) => shownIds.has(id))) : []), [use, layers.connectors, shownIds]);
  const visKeys = useMemo(() => new Set(visNodes.map((n) => n.key)), [visNodes]);
  const visEdges = useMemo(() => use.edges.filter((e) => shownIds.has(e.agentId) && visKeys.has(e.nodeKey)), [use, shownIds, visKeys]);
  // Each section is drawn around the nodes it holds, so moving a node, or the whole section, keeps the box where its contents are.
  const bandRects = useMemo(() => res.bands.map((b) => {
    const mine = visNodes.filter((n) => n.kind === b.id).map((n) => rpos[n.key]).filter(Boolean);
    if (!mine.length) return null;
    const xs = mine.map((p) => p.x), ys = mine.map((p) => p.y);
    return { ...b, x: Math.min(...xs) - 56 - NODE / 2, y: Math.min(...ys) - 80 - NODE / 2, w: Math.max(...xs) - Math.min(...xs) + 112 + NODE, h: Math.max(...ys) - Math.min(...ys) + 80 + NODE + 58 };
  }).filter((b): b is NonNullable<typeof b> => !!b), [res, visNodes, rpos]);
  const bandCount = useMemo(() => Object.fromEntries(res.bands.map((b) => [b.id, visNodes.filter((n) => n.kind === b.id).length])) as Record<string, number>, [res, visNodes]);

  // Live: recent traces replayed as activity, with the autoscaler running on the load they create.
  const flight = useLive({ enabled: liveOn, agents: all, traces, only: trace });
  const byTitle = useMemo(() => new Map(agents.map((a) => [a.id, a.title])), [agents]);
  const deptPolicies = useMemo(() => new Map(boxes.map((b) => [b.name, policies.filter((p) => "department" in p.scope && p.scope.department === b.name && !off.policies.includes(p.kind))])), [boxes, policies, off.policies]);

  const match = useMemo(() => { const q = filters.q.trim().toLowerCase(); return q ? new Set(shown.filter((a) => [a.title, a.name, a.owner, a.department].join(" ").toLowerCase().includes(q)).map((a) => a.id)) : null; }, [filters.q, shown]);

  // ---- view
  useLayoutEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const bounds = useCallback((ids?: string[]) => {
    const pts = (ids ?? shown.map((a) => a.id)).map((id) => pos[id]).filter(Boolean);
    const rects = pts.map((p) => ({ x0: p.x - R - 70, y0: p.y - R - 70, x1: p.x + R + 70, y1: p.y + R + (ids ? 80 : 110) }));
    if (!ids && layers.exposure && exposures.some((e) => shownIds.has(e.agentId))) rects.push({ x0: cloud.x - 120, y0: cloud.y - 90, x1: cloud.x + 120, y1: cloud.y + 70 });
    if (!ids) for (const b of bandRects) rects.push({ x0: b.x - 40, y0: b.y - 40, x1: b.x + b.w + 40, y1: b.y + b.h + 40 });
    if (!rects.length) return null;
    return { x0: Math.min(...rects.map((r) => r.x0)), y0: Math.min(...rects.map((r) => r.y0)), x1: Math.max(...rects.map((r) => r.x1)), y1: Math.max(...rects.map((r) => r.y1)) };
  }, [shown, pos, cloud, exposures, shownIds, layers.exposure, bandRects]);
  const fit = useCallback((ids?: string[], maxK = 1.05) => {
    const b = bounds(ids); if (!b) return;
    const pad = 36; const left = size.w > 900 ? LEGEND_W : pad; const right = pad; const avail = size.w - left - right;
    const k = clamp(Math.min(avail / (b.x1 - b.x0), (size.h - pad * 2) / (b.y1 - b.y0)), MIN_K, maxK);
    setView({ k, x: left + (avail - (b.x1 - b.x0) * k) / 2 - b.x0 * k, y: (size.h - (b.y1 - b.y0) * k) / 2 - b.y0 * k });
  }, [bounds, size]);
  useEffect(() => { if (!fitted.current && size.w > 100 && shown.length) { fit(); fitted.current = true; } }, [fit, size, shown.length]);
  const zoomAt = useCallback((factor: number, px = size.w / 2, py = size.h / 2) => {
    setView((v) => { const k = clamp(v.k * factor, MIN_K, MAX_K); return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k }; });
  }, [size]);
  const focus = useCallback((id: string) => {
    const p = pos[id] ?? rpos[id]; if (!p) return;
    const k = Math.max(view.k, 1.5); const cx = size.w > 900 ? (LEGEND_W + size.w - PANEL_W) / 2 : size.w / 2;
    setView({ k, x: cx - p.x * k, y: size.h / 2 - (p.y + 60) * k });
  }, [pos, rpos, size, view.k]);

  /** The panel slides over the right side of the canvas, so move the canvas if the selected agent would end up beneath it. */
  const reveal = useCallback((id: string) => {
    const p = pos[id] ?? rpos[id]; if (!p || size.w < 900) return;
    setView((v) => { const sx = v.x + p.x * v.k; const limit = size.w - PANEL_W - 70; return sx > limit ? { ...v, x: v.x - (sx - limit) } : v; });
  }, [pos, rpos, size.w]);

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false }); return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  useEffect(() => { if (initialSelect && size.w > 100 && pos[initialSelect]) { const t = setTimeout(() => focus(initialSelect), 60); return () => clearTimeout(t); } }, [initialSelect, size.w > 100]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- pointer: pan the canvas, drag an agent, a group or the cloud, or click to select
  const drag = useRef<{ kind: "pan" | "agent" | "group" | "cloud" | "link" | "exposure" | "resource" | "band"; id: string; sx: number; sy: number; v: View; origin: Record<string, Pt>; moved: boolean } | null>(null);
  const targetOf = (t: EventTarget | null) => { const el = (t as Element | null)?.closest?.("[data-kind]") as HTMLElement | null; return el ? { kind: el.dataset.kind as NonNullable<Hover>["kind"], id: el.dataset.id ?? "" } : null; };
  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const t = targetOf(e.target);
    const kind = (t?.kind === "agent" || t?.kind === "group" || t?.kind === "cloud" || t?.kind === "link" || t?.kind === "exposure" || t?.kind === "resource" || t?.kind === "band" ? t.kind : "pan");
    const origin: Record<string, Pt> = {};
    if (kind === "agent" && t) origin[t.id] = pos[t.id];
    if (kind === "resource" && t) origin[t.id] = rpos[t.id];
    if (kind === "band" && t) visNodes.filter((n) => n.kind === t.id).forEach((n) => { origin[n.key] = rpos[n.key]; });
    if (kind === "group" && t) { const b = boxes.find((x) => x.name === t.id); b?.members.forEach((m) => { origin[m] = pos[m]; }); }
    if (kind === "cloud") origin[CLOUD] = cloud;
    drag.current = { kind, id: t?.id ?? "", sx: e.clientX, sy: e.clientY, v: view, origin, moved: false };
    wrap.current?.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; const r = wrap.current!.getBoundingClientRect();
    pointer.current = { x: clamp(e.clientX - r.left + 16, 8, r.width - 300), y: clamp(e.clientY - r.top + 16, 8, r.height - 330) };
    if (tip.current) { tip.current.style.left = `${pointer.current.x}px`; tip.current.style.top = `${pointer.current.y}px`; }
    if (!d) { const t = targetOf(e.target); setHover((h) => (h?.kind === t?.kind && h?.id === t?.id ? h : t)); return; }
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    if (d.kind === "pan" || d.kind === "link" || d.kind === "exposure") setView({ ...d.v, x: d.v.x + dx, y: d.v.y + dy });
    else { setHover(null); setMoved((m) => ({ ...m, ...Object.fromEntries(Object.entries(d.origin).map(([id, p]) => [id, { x: p.x + dx / d.v.k, y: p.y + dy / d.v.k }])) })); }
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null; wrap.current?.releasePointerCapture(e.pointerId);
    if (!d || d.moved) return;
    if (d.kind === "pan" || d.kind === "band") setSel(null);
    else if (d.kind === "agent") { setSel({ kind: "agent", id: d.id }); reveal(d.id); }
    else if (d.kind === "link") setSel({ kind: "link", id: d.id });
    else if (d.kind === "resource") { setSel({ kind: "resource", id: d.id }); reveal(d.id); }
    else if (d.kind === "group") setSel({ kind: "group", id: d.id });
    else if (d.kind === "exposure") { setSel({ kind: "agent", id: d.id }); reveal(d.id); }
  };

  // ---- what is dimmed
  const focusId = hover?.kind === "agent" ? hover.id : sel?.kind === "agent" && !hover ? sel.id : null;
  const resFocus = hover?.kind === "resource" ? hover.id : sel?.kind === "resource" && !hover ? sel.id : null;
  const near = useMemo(() => {
    if (resFocus) return new Set(nodeBy.get(resFocus)?.agentIds ?? []);
    if (!focusId) return null; const s = new Set([focusId]);
    for (const l of links) { if (l.from === focusId) s.add(l.to); if (l.to === focusId) s.add(l.from); }
    return s;
  }, [focusId, resFocus, links, nodeBy]);
  const mine = useMemo(() => (focusId ? new Set(use.edges.filter((e) => e.agentId === focusId).map((e) => e.nodeKey)) : null), [focusId, use]);
  const resDim = (n: UsageNode) => {
    if (resFocus) return n.key !== resFocus;
    if (mine) return !mine.has(n.key);
    if (hl) return true;
    if (match) return !n.agentIds.some((id) => match.has(id));
    return false;
  };
  const posture = useMemo(() => { const cfgs = Object.fromEntries(agents.map((x) => [x.id, x.network])); const counts = memberCounts(cfgs); return new Map(agents.map((x) => [x.id, assess(x, x.network, networks, counts)])); }, [agents, networks]);
  const hl = highlight;
  const agentDim = (a: Agent) => {
    if (match && !match.has(a.id)) return true;
    if (near && !near.has(a.id)) return true;
    if (hl?.type === "protocol") return !links.some((l) => l.protocol === hl.id && (l.from === a.id || l.to === a.id));
    if (hl?.type === "policy") return !applied.get(a.id)!.some((p) => p.kind === hl.id);
    if (hl?.type === "health") return health.get(a.id) !== hl.id;
    if (hl?.type === "exposure") return !expOf.has(a.id);
    if (hl?.type === "security") return bucketOf(posture.get(a.id)!) !== hl.id;
    return false;
  };
  const linkDim = (l: Link) => {
    if (resFocus) return true;
    if (focusId) return l.from !== focusId && l.to !== focusId;
    if (hl?.type === "protocol") return l.protocol !== hl.id;
    if (hl?.type) return true;
    if (match) return !(match.has(l.from) || match.has(l.to));
    return false;
  };

  /** Text is enlarged in world units while zoomed out, so names stay readable on screen. */
  const u = view.k < 1 ? Math.min(1.35, 1 / view.k) : 1;
  const lod = view.k >= CARD_K ? 3 : view.k >= FIGURES_K ? 2 : view.k >= LABEL_K ? 1 : 0;
  const counts = useMemo(() => ({
    protocols: Object.fromEntries(PROTOCOLS.map((p) => [p.id, links.filter((l) => l.protocol === p.id && shownIds.has(l.from) && shownIds.has(l.to)).length])) as Record<Protocol, number>,
    policies: Object.fromEntries((Object.keys(POLICY_BY_ID) as PolicyKind[]).map((k) => [k, shown.filter((a) => applied.get(a.id)!.some((p) => p.kind === k)).length])) as Record<PolicyKind, number>,
    health: shown.reduce((m, a) => { m[health.get(a.id)!] = (m[health.get(a.id)!] ?? 0) + 1; return m; }, {} as Partial<Record<Health, number>>),
    exposed: exposures.filter((e) => shownIds.has(e.agentId)).length,
    security: shown.reduce((m, a) => { m[bucketOf(posture.get(a.id)!)]++; return m; }, { strong: 0, fair: 0, weak: 0, none: 0 } as Record<Bucket, number>),
  }), [links, shown, shownIds, applied, health, exposures, posture]);

  const selected = sel;
  // Entering or leaving full page changes the size of the canvas, so the agents are fitted again once it has resized.
  const firstFull = useRef(true); const latestFit = useRef(fit); latestFit.current = fit;
  useEffect(() => { if (firstFull.current) { firstFull.current = false; return; } const t = setTimeout(() => latestFit.current(), 250); return () => clearTimeout(t); }, [full]); // eslint-disable-line react-hooks/exhaustive-deps
  const resetLayout = () => { setMoved({}); fitted.current = false; setTimeout(() => fit(), 0); };
  const showCloud = layers.exposure && exposures.some((e) => shownIds.has(e.agentId));
  const moving = Object.keys(moved).length > 0;

  return (
    <div data-full={full ? "true" : undefined} className={`${full ? "fixed inset-0 z-[70] !m-0 border-0" : "relative h-[calc(100vh-190px)] min-h-[560px] rounded-lg border"} border-border bg-surface-subtle overflow-hidden select-none ${dark ? "tok-dark" : ""}`}>
      <div ref={wrap} className="absolute inset-0 touch-none cursor-grab active:cursor-grabbing" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => { if (!drag.current) setHover(null); }}
        style={{ backgroundImage: "radial-gradient(var(--canvas-dot) 1px, transparent 1px)", backgroundSize: `${24 * view.k}px ${24 * view.k}px`, backgroundPosition: `${view.x}px ${view.y}px` }}>
        <svg width={size.w} height={size.h} role="group" aria-label="Agent topology. Drag to move, scroll to zoom." className="block">
          <defs>
            {PROTOCOLS.map((p) => (
              <marker key={p.id} id={`arrow-${p.id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="11" markerHeight="11" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M1 1 L9 5 L1 9 Z" fill={p.color} /></marker>
            ))}
            <marker id="arrow-res" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M1 1 L9 5 L1 9 Z" fill="rgb(var(--c-text-tertiary))" /></marker>
            <marker id="arrow-res-on" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M1 1 L9 5 L1 9 Z" fill={LIVE_COLOR} /></marker>
          </defs>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {/* department boxes, dashed in the colour of a policy that applies to the whole department */}
            {layers.groups && boxes.map((b) => {
              const dp = deptPolicies.get(b.name) ?? []; const on = hover?.kind === "group" && hover.id === b.name || sel?.kind === "group" && sel.id === b.name;
              return (
                <g key={b.name} data-kind="group" data-id={b.name} className="cursor-move">
                  <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={26} fill={on ? "rgb(var(--c-surface-muted))" : "rgb(var(--c-surface))"} fillOpacity={on ? 0.85 : 0.6} stroke={border} strokeWidth={1.2} />
                  {dp.map((p, i) => <rect key={p.id} x={b.x - 6 - i * 6} y={b.y - 6 - i * 6} width={b.w + 12 + i * 12} height={b.h + 12 + i * 12} rx={30 + i * 4} fill="none" stroke={POLICY_BY_ID[p.kind].color} strokeWidth={2.2} strokeDasharray="12 8" strokeLinecap="round" opacity={0.85} pointerEvents="none" />)}
                  <text x={b.x + 28} y={b.y + 24 + 14 * u} fontSize={17 * u} fontWeight={600} fill={ink} pointerEvents="none">{b.name}</text>
                  {b.w > 330 && <text x={b.x + b.w - 28} y={b.y + 24 + 14 * u} fontSize={12 * u} textAnchor="end" fill={faint} pointerEvents="none">{b.members.length} {b.members.length === 1 ? "agent" : "agents"}</text>}
                </g>
              );
            })}

            {/* exposure: a dotted line from each exposed agent up to the cloud */}
            {showCloud && exposures.filter((e) => shownIds.has(e.agentId)).map((e) => {
              const p = pos[e.agentId]; const dim = hl && hl.type !== "exposure"; const open = e.auth === "none";
              const tx = p.x + 30, ty = p.y - R - RING - 6; const dl = Math.hypot(tx - cloud.x, ty - cloud.y) || 1;
              const sx = cloud.x + ((tx - cloud.x) / dl) * 48, sy = cloud.y + ((ty - cloud.y) / dl) * 48;
              const mx = (sx + tx) / 2, my = (sy + ty) / 2; const dpath = `M${sx} ${sy} L${tx} ${ty}`;
              return (
                <g key={e.agentId} opacity={dim || (focusId && focusId !== e.agentId) ? 0.18 : 1}>
                  <path d={dpath} fill="none" stroke={open ? STATE_COLORS.failed : ink} strokeWidth={2.2} strokeDasharray="2 7" strokeLinecap="round" />
                  <path data-kind="exposure" data-id={e.agentId} d={dpath} fill="none" stroke="transparent" strokeWidth={16} className="cursor-pointer" />
                  {lod >= 1 && <text x={mx + 10} y={my - 6} fontSize={11 * u} fill={open ? STATE_COLORS.failed : soft} fontWeight={open ? 600 : 400} pointerEvents="none">{open ? "Public, no authentication" : `Public, ${e.auth === "jwt" ? "signed token" : "app key"}`}</text>}
                </g>
              );
            })}
            {showCloud && (
              <g data-kind="cloud" data-id={CLOUD} transform={`translate(${cloud.x} ${cloud.y})`} className="cursor-move" opacity={hl && hl.type !== "exposure" ? 0.3 : 1}>
                <circle r={46} fill={surface} stroke={border} strokeWidth={1.4} />
                <Cloud x={-22} y={-24} size={44} strokeWidth={1.5} color={ink} />
                <text x={60} y={-2} fontSize={14 * u} fontWeight={600} fill={ink} pointerEvents="none">Outside callers</text>
                <text x={60} y={14 + 4 * u} fontSize={11 * u} fill={faint} pointerEvents="none">{counts.exposed} exposed {counts.exposed === 1 ? "agent" : "agents"}</text>
              </g>
            )}

            {/* connections, channels and knowledge */}
            {bandRects.map((b) => <BandBox key={b.id} band={b} count={bandCount[b.id]} u={u} dim={!!hl} />)}
            {visEdges.map((e) => {
              const from = pos[e.agentId]; const to = rpos[e.nodeKey]; if (!from || !to) return null;
              const inbound = e.roles.every((r) => r === "trigger"); const both = e.roles.includes("stream");
              const { d, mid } = resourcePath(from, to, inbound);
              const active = flight.frame.resources[e.nodeKey]?.agentId === e.agentId;
              const dim = (focusId ? e.agentId !== focusId : resFocus ? e.nodeKey !== resFocus : hl ? true : match ? !match.has(e.agentId) : false);
              const tone = e.status === "problem" ? STATE_COLORS.failed : e.status === "warning" ? STATE_COLORS.waiting : null;
              const marker = both ? undefined : `url(#arrow-res${active ? "-on" : ""})`;
              const showLabel = !dim && (!!focusId || !!resFocus) && lod >= 1;
              return (
                <g key={e.key} opacity={dim ? 0.1 : 1} pointerEvents="none">
                  <path d={d} fill="none" stroke={active ? LIVE_COLOR : tone ?? "rgb(var(--c-text-tertiary))"} strokeWidth={active ? 2.8 : 1.5} strokeOpacity={active ? 1 : 0.7} strokeDasharray={tone && !active ? "2 6" : undefined} strokeLinecap="round" markerEnd={inbound ? undefined : marker} markerStart={inbound ? marker : undefined} />
                  {active && <path d={d} fill="none" stroke={LIVE_COLOR} strokeWidth={2.8} className="tok-flow" strokeLinecap="round" />}
                  {active && !reduced && [0, 0.45].map((t) => <circle key={t} r={4.5} fill={LIVE_COLOR}><animateMotion dur="1.1s" begin={`${t}s`} repeatCount="indefinite" path={d} /></circle>)}
                  {showLabel && <g transform={`translate(${mid.x} ${mid.y}) scale(${u})`}><rect x={-46} y={-10} width={92} height={20} rx={10} fill={surface} stroke={border} strokeWidth={1.2} /><text textAnchor="middle" y={4} fontSize={10.5} fontWeight={600} fill={soft}>{e.tools[0] ?? ROLE_LABEL[e.roles[0]]}</text></g>}
                </g>
              );
            })}

            {/* links between agents */}
            {drawn.map(({ link: l, d, mid }) => {
              const c = PROTOCOL_BY_ID[l.protocol].color; const dim = linkDim(l); const w = clamp(1.6 + Math.log10(l.messages24h + 1) * 0.9, 1.6, 4.6);
              const isSel = sel?.kind === "link" && sel.id === l.id; const hot = hover?.kind === "link" && hover.id === l.id;
              const hop = flight.frame.hops.has(`${l.from}>${l.to}`);
              return (
                <g key={l.id} opacity={dim ? 0.12 : l.measured ? 1 : 0.7}>
                  <path d={d} fill="none" stroke={c} strokeWidth={w + (isSel || hot ? 1.6 : 0)} strokeDasharray={l.measured ? undefined : "3 6"} strokeLinecap="round" markerEnd={`url(#arrow-${l.protocol})`} />
                  <path data-kind="link" data-id={l.id} d={d} fill="none" stroke="transparent" strokeWidth={18} className="cursor-pointer" />
                  {hop && <path d={d} fill="none" stroke={c} strokeWidth={w + 2.4} className="tok-flow" strokeLinecap="round" />}
                  {hop && !reduced && [0, 0.35, 0.7].map((t) => <circle key={t} r={5.5} fill={c} stroke={surface} strokeWidth={1.5}><animateMotion dur="1.2s" begin={`${t}s`} repeatCount="indefinite" path={d} /></circle>)}
                  {layers.traffic && !reduced && l.measured && !dim && Array.from({ length: l.messages24h > 1000 ? 3 : l.messages24h > 100 ? 2 : 1 }, (_, i) => (
                    <circle key={i} r={3.2} fill={c} opacity={liveOn ? 0.3 : 1}><animateMotion dur={`${clamp(9 - Math.log10(l.messages24h + 1) * 1.6, 2.5, 8)}s`} begin={`${i * 1.3}s`} repeatCount="indefinite" path={d} /></circle>
                  ))}
                  {(view.k >= 0.45 || isSel || hot) && !dim && (
                    <g transform={`translate(${mid.x} ${mid.y}) scale(${u})`} pointerEvents="none">
                      <rect x={-27} y={-10} width={54} height={20} rx={10} fill={surface} stroke={c} strokeWidth={1.4} />
                      <text textAnchor="middle" y={4} fontSize={11} fontWeight={600} fill={c}>{PROTOCOL_BY_ID[l.protocol].label}</text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* agents */}
            {shown.map((a) => (
              <AgentNode key={a.id} a={a} p={pos[a.id]} lod={lod} k={view.k} u={u} health={health.get(a.id)!} policies={applied.get(a.id)!.filter((p) => !off.policies.includes(p.kind))}
                live={live[a.id]} phase={flight.frame.agents[a.id]} replicas={liveOn ? flight.replicas[a.id] : undefined} scaling={liveOn && flight.scaling[a.id] ? ((flight.events.find((x) => x.agentId === a.id)?.to ?? 0) > (flight.events.find((x) => x.agentId === a.id)?.from ?? 0) ? "up" : "down") : undefined} reduced={reduced} exposed={layers.exposure ? expOf.get(a.id) : undefined} security={layers.security ? posture.get(a.id) : undefined} labels={layers.labels} dim={agentDim(a)} selected={sel?.kind === "agent" && sel.id === a.id} hot={hover?.kind === "agent" && hover.id === a.id}
                onKey={() => { setSel({ kind: "agent", id: a.id }); reveal(a.id); }} />
            ))}

            {/* the resources themselves, above the lines */}
            {visNodes.map((n) => rpos[n.key] && <ResourceNode key={n.key} n={n} p={rpos[n.key]} lod={lod} u={u} doing={flight.frame.resources[n.key]?.doing} dim={resDim(n)} reduced={reduced} labels={layers.labels}
              selected={sel?.kind === "resource" && sel.id === n.key} hot={hover?.kind === "resource" && hover.id === n.key} />)}
          </g>
        </svg>
      </div>

      {/* toolbar */}
      <div className="absolute top-3 right-3 flex items-center gap-2" style={{ right: (sel ? 444 : 12) + (full ? 46 : 0) }}>
        {full && <button type="button" onClick={onToggleFull} onPointerDown={(e) => e.stopPropagation()} aria-label="Close full page" title="Close full page (Esc)" className="fixed top-3 z-[80] h-9 w-9 grid place-items-center rounded-full border border-border-strong bg-surface text-text-primary shadow-popover hover:bg-surface-muted" style={{ right: sel ? 444 : 12 }}><X size={17} /></button>}
        {onSwitchView && <button type="button" onClick={onSwitchView} onPointerDown={(e) => e.stopPropagation()} title="Show these agents as a graph, in the manner of Obsidian" aria-label="Graph view"
          className="h-8 inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2.5 text-[13px] font-medium text-text-secondary hover:bg-surface-muted"><Network size={14} /> Graph</button>}
        <button type="button" aria-pressed={dark} onClick={toggleDark} onPointerDown={(e) => e.stopPropagation()} title={dark ? "Switch the canvas to the light theme" : "Switch the canvas to the black theme"} aria-label={dark ? "Light theme" : "Black theme"}
          className="h-8 w-8 grid place-items-center rounded-md border border-border-strong bg-surface text-text-secondary hover:bg-surface-muted">{dark ? <Sun size={15} /> : <Moon size={15} />}</button>
        <button type="button" aria-pressed={liveOn} onClick={() => setLiveOn((v) => !v)} onPointerDown={(e) => e.stopPropagation()} title="Replay recent runs on the canvas, with agents changing state and replicas following the autoscaler."
          className={`h-8 inline-flex items-center gap-2 rounded-md border px-3 text-[13px] font-medium ${liveOn ? "border-[#2563EB] bg-[#2563EB]/10 text-[#1D4ED8]" : "border-border-strong bg-surface text-text-secondary"}`}>
          <span className="relative flex h-2 w-2"><span className={`absolute inline-flex h-full w-full rounded-full ${liveOn && !reduced ? "animate-ping" : ""}`} style={{ background: liveOn ? LIVE_COLOR : "rgb(var(--c-text-tertiary))", opacity: 0.6 }} /><span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: liveOn ? LIVE_COLOR : "rgb(var(--c-text-tertiary))" }} /></span>
          Live{liveOn && flight.playing ? `, ${flight.playing} ${flight.playing === 1 ? "run" : "runs"}` : ""}</button>
        <div className="relative"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter" && match?.size) { const id = [...match][0]; setSel({ kind: "agent", id }); focus(id); } }}
            placeholder="Find an agent" aria-label="Find an agent" className="h-8 w-44 rounded-md border border-border-strong bg-surface pl-8 pr-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-accent-500/40" /></div>
        <select value={filters.control} onChange={(e) => setFilters((f) => ({ ...f, control: e.target.value as typeof f.control }))} aria-label="Control level" className="h-8 rounded-md border border-border-strong bg-surface px-2 text-[13px]">
          <option value="all">Any control level</option>{(["governed", "observed", "inventory"] as const).map((c) => <option key={c} value={c}>{CONTROL_LABEL[c]}</option>)}</select>
        <select value={filters.dept} onChange={(e) => setFilters((f) => ({ ...f, dept: e.target.value }))} aria-label="Department" className="h-8 rounded-md border border-border-strong bg-surface px-2 text-[13px]">
          <option value="all">All departments</option>{departments.map((d) => <option key={d}>{d}</option>)}</select>
      </div>
      <div className="absolute bottom-3 flex items-center gap-1.5 rounded-lg border border-border bg-surface p-1 shadow-card" style={{ right: sel ? 444 : 12 }}>
        <Tool label="Zoom in" onClick={() => zoomAt(1.3)}><ZoomIn size={15} /></Tool>
        <span className="w-11 text-center text-xs tabular-nums text-text-secondary" aria-live="polite">{Math.round(view.k * 100)}%</span>
        <Tool label="Zoom out" onClick={() => zoomAt(1 / 1.3)}><ZoomOut size={15} /></Tool>
        <span className="h-5 w-px bg-border" />
        <Tool label="Fit to screen" onClick={() => fit()}><Maximize size={15} /></Tool>
        {onToggleFull && <Tool label={full ? "Close full page" : "Full page"} onClick={onToggleFull}>{full ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</Tool>}
        <Tool label="Reset layout" onClick={resetLayout} disabled={!moving}><RotateCcw size={15} /></Tool>
      </div>

      {liveOn && trace && <div className="absolute top-14 flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-[13px] shadow-card" style={{ right: sel ? 444 : 12 }}><Activity size={14} style={{ color: LIVE_COLOR }} /><span>Replaying trace <code className="text-xs">{trace}</code></span><NextLink href="/agents/constellation" className="font-medium underline" onPointerDown={(e) => e.stopPropagation()}>Show all activity</NextLink></div>}
      {liveOn && flight.events[0] && Date.now() - flight.events[0].at < 14_000 && (() => { const ev = flight.events[0]; return <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex max-w-[460px] items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-[13px] shadow-card" role="status">
        {ev.to > ev.from ? <ChevronUp size={15} style={{ color: "#067A4E" }} /> : <ChevronDown size={15} className="text-text-tertiary" />}<span className="truncate"><b className="font-semibold">{byTitle.get(ev.agentId)}</b> {ev.to > ev.from ? "scaled up" : "scaled down"}, {ev.from} to {ev.to}. {ev.reason}</span></div>; })()}

      <Legend off={off} setOff={setOff} layers={layers} setLayers={setLayers} counts={counts} setHighlight={setHighlight} highlight={highlight} />

      {/* hover card */}
      {hover && !drag.current?.moved && <div ref={tip} className="pointer-events-none absolute z-20 w-72 rounded-lg border border-border bg-surface p-3 shadow-popover text-[13px]" style={{ left: pointer.current.x, top: pointer.current.y }}>
        <HoverCard hover={hover} nodeBy={nodeBy} byId={byId} links={links} exposures={exposures} applied={applied} live={live} health={health} boxes={boxes} />
      </div>}

      <ConstellationPanel sel={selected} onClose={() => setSel(null)} onSelect={(s) => { setSel(s); focus(s.id); }} replicas={liveOn ? flight.replicas : undefined} />
    </div>
  );
}

function Tool({ label, onClick, children, disabled }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} onPointerDown={(e) => e.stopPropagation()} className="h-7 w-7 grid place-items-center rounded-md text-text-secondary hover:bg-surface-muted disabled:opacity-40">{children}</button>;
}

// ---------------------------------------------------------------------------------------------------------------------------------------

function AgentNode({ a, p, lod, k, u, health, policies, live, phase, replicas, scaling, reduced, exposed, security, labels, dim, selected, hot, onKey }: {
  a: Agent; p: Pt; lod: number; k: number; u: number; health: Health; policies: AppliedPolicy[]; live?: { running: number; queued: number; pendingApprovals: number }; phase?: AgentFrame; replicas?: number; scaling?: "up" | "down"; reduced: boolean; exposed?: Exposure; security?: Posture;
  labels: boolean; dim: boolean; selected: boolean; hot: boolean; onKey: () => void;
}) {
  const adapter = ADAPTER_BY_ID[a.framework];
  const segs = ringSegments(a, live); const t = totals(a, 7); const today = a.daily[a.daily.length - 1];
  const rr = R + RING / 2 + 2;
  const gap = segs.length > 1 ? 4 : 0; let at = 0;
  const waiting = live?.pendingApprovals ?? 0;
  const dec = (dx: number, dy: number, body: React.ReactNode, tone?: string) => (
    <g transform={`translate(${dx} ${dy})`} pointerEvents="none"><circle r={10.5} fill={surface} stroke={tone ?? border} strokeWidth={1.4} />{body}</g>
  );
  const D = (R + RING + 1) * 0.7071;
  const showAll = lod >= 1;
  const ph = phase?.phase ?? "idle"; const tone = ph === "running" ? LIVE_COLOR : ph === "waiting" ? STATE_COLORS.waiting : ph === "error" ? STATE_COLORS.failed : null;
  const stateText = ph === "idle" ? HEALTH_LABEL[health] : `${HEALTH_LABEL[health]}, ${phase?.doing ?? ph}`;
  return (
    <g data-kind="agent" data-id={a.id} transform={`translate(${p.x} ${p.y})`} opacity={dim ? 0.22 : 1} className="cursor-pointer outline-none [&:focus-visible>circle.focus]:stroke-[3]"
      tabIndex={0} role="button" aria-label={`${a.title}, ${stateText}, ${CONTROL_LABEL[a.control]}`} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onKey(); } }}>
      {(selected || hot) && <circle className="focus" r={R + RING + 9} fill="none" stroke={selected ? "#02F5A1" : border} strokeWidth={selected ? 3 : 1.5} />}
      {selected && <circle r={R + RING + 12} fill="none" stroke="rgb(var(--c-emph))" strokeWidth={0.8} opacity={0.5} />}
      {/* live: a halo while it works, amber while it waits for a person, red when a step failed, and a green ripple while replicas change */}
      {tone && !reduced && <circle className={ph === "waiting" ? "tok-ping-slow" : "tok-ping"} r={R + RING} fill="none" stroke={tone} strokeWidth={4} pointerEvents="none" />}
      {tone && <circle r={R + RING + 6} fill="none" stroke={tone} strokeWidth={2.4} strokeLinecap="round" strokeDasharray={ph === "running" ? "16 12" : ph === "waiting" ? "3 7" : undefined} className={ph === "running" && !reduced ? "tok-spin" : undefined} pointerEvents="none" />}
      {scaling && !reduced && [0, 1].map((i) => <circle key={i} className="tok-ping-slow" style={{ animationDelay: `${i * 0.9}s` }} r={R + RING + 4} fill="none" stroke="#02F5A1" strokeWidth={5} pointerEvents="none" />)}
      {/* the policies around the agent: one dashed arc each. Long dashes are enforced, dots are advisory because tok∑ner cannot enforce them */}
      {policies.length > 0 && policies.map((pol, i) => {
        const n = policies.length; const span = 360 / n; const from = i * span + 7; const to = (i + 1) * span - 7;
        return <path key={pol.kind + pol.name + i} d={n === 1 ? arc(0, 0, ORBIT, 0, 359.9) : arc(0, 0, ORBIT, from, to)} fill="none" stroke={POLICY_BY_ID[pol.kind].color} strokeWidth={2.6} strokeLinecap="round" strokeDasharray={pol.enforced ? "9 6" : "0.1 6"} opacity={0.95} />;
      })}
      {/* the ring: what happened in the last seven days, or the state when nothing is measured */}
      <circle r={rr} fill="none" stroke="rgb(var(--c-surface-muted))" strokeWidth={RING} />
      {segs.length === 0 && <circle r={rr} fill="none" stroke={HEALTH_COLOR[health]} strokeWidth={RING} strokeDasharray={health === "unmeasured" ? "3 5" : undefined} opacity={health === "suspended" ? 0.7 : 0.9} />}
      {segs.length === 1 && <circle r={rr} fill="none" stroke={segs[0].color} strokeWidth={RING} />}
      {segs.length > 1 && segs.map((s) => { const from = at * 360 + gap / 2; at += s.share; const to = at * 360 - gap / 2; return <path key={s.kind} d={arc(0, 0, rr, from, Math.max(to, from + 1.5))} fill="none" stroke={s.color} strokeWidth={RING} strokeLinecap="butt" />; })}
      <circle r={R} fill={surface} stroke={border} strokeWidth={1.2} />
      {tone && <circle r={R - 1} fill={tone} opacity={0.12} pointerEvents="none" />}
      <foreignObject x={-14} y={-14} width={28} height={28} pointerEvents="none"><div className="grid place-items-center h-7 w-7">{adapter ? <NodeIcon icon={adapter.icon} size={26} /> : <Plug size={24} />}</div></foreignObject>

      {showAll && dec(-D, -D, a.control === "governed" ? <ShieldCheck x={-6} y={-6} size={12} strokeWidth={2.2} color={STATE_COLORS.ok} /> : a.control === "observed" ? <Eye x={-6} y={-6} size={12} strokeWidth={2.2} color="#2563EB" /> : <ClipboardList x={-6} y={-6} size={12} strokeWidth={2.2} color={faint} />)}
      {showAll && exposed && dec(D, -D, <Cloud x={-6.5} y={-6.5} size={13} strokeWidth={2.2} color={exposed.auth === "none" ? STATE_COLORS.failed : ink} />, exposed.auth === "none" ? STATE_COLORS.failed : undefined)}
      {showAll && a.state === "suspended" && dec(-D, D, <Pause x={-6} y={-6} size={12} strokeWidth={2.4} color={soft} />)}
      {showAll && a.state === "active" && health === "failing" && dec(-D, D, <AlertTriangle x={-6.5} y={-6.5} size={13} strokeWidth={2.2} color={STATE_COLORS.failed} />, STATE_COLORS.failed)}
      {showAll && a.state === "active" && health !== "failing" && (waiting > 0 || ph === "waiting") && dec(-D, D, <><Hourglass x={-6} y={-6} size={12} strokeWidth={2.2} color="#B45309" /></>, STATE_COLORS.waiting)}
      {showAll && security?.configured && <g transform={`translate(0 ${-(R + RING + 2)})`} pointerEvents="none" data-security={security.grade}><title>{`Network security: ${security.label}, grade ${security.grade}`}</title><circle r={11} fill={surface} stroke={postureColor(security)} strokeWidth={2} />{security.grade === "D" || security.grade === "E" ? <ShieldAlert x={-6.5} y={-6.5} size={13} strokeWidth={2.2} color={postureColor(security)} /> : <ShieldCheck x={-6.5} y={-6.5} size={13} strokeWidth={2.2} color={postureColor(security)} />}</g>}
      {showAll && dec(D, D, a.origin === "forge" ? <Hammer x={-6} y={-6} size={12} strokeWidth={2.2} color={soft} /> : <Plug x={-6} y={-6} size={12} strokeWidth={2.2} color={soft} />)}

      {phase?.doing && lod >= 1 && tone && (
        <g transform={`translate(0 ${R + RING + 14 + 27 * u + 14}) scale(${u})`} pointerEvents="none">
          <rect x={-(phase.doing.length * 3.5 + 12)} y={-11} width={phase.doing.length * 7 + 24} height={22} rx={11} fill={tone} />
          <text textAnchor="middle" y={4} fontSize={11.5} fontWeight={600} fill="#fff">{phase.doing}</text>
        </g>
      )}
      {replicas !== undefined && lod >= 1 && a.execution && a.execution.runtime !== "external" && (
        <g transform={`translate(${R + RING + 10} ${-4})`} pointerEvents="none">
          <rect y={-11} width={replicas >= 10 ? 52 : 46} height={22} rx={11} fill={surface} stroke={scaling ? "#02F5A1" : border} strokeWidth={scaling ? 2.4 : 1.2} />
          {scaling === "down" ? <ChevronDown x={5} y={-6} size={12} strokeWidth={2.4} color={soft} /> : scaling === "up" ? <ChevronUp x={5} y={-6} size={12} strokeWidth={2.4} color="#067A4E" /> : <Stack x={5} y={-6} size={12} strokeWidth={2} color={faint} />}
          <text x={20} y={4} fontSize={12} fontWeight={600} fill={replicas === 0 ? faint : ink}>{replicas === 0 ? "idle" : `×${replicas}`}</text>
        </g>
      )}
      {labels && (lod >= 1 || selected || hot) && (
        <g pointerEvents="none">
          <text y={R + RING + 10 + 14 * u} textAnchor="middle" fontSize={14 * u} fontWeight={600} fill={ink} stroke={surface} strokeWidth={4} paintOrder="stroke">{a.title}</text>
          {u < 1.4 && <text y={R + RING + 12 + 14 * u + 13 * u} textAnchor="middle" fontSize={11 * u} fill={soft} stroke={surface} strokeWidth={3} paintOrder="stroke">{adapter?.name ?? a.framework}</text>}
        </g>
      )}

      {lod >= 2 && (
        <g transform={`translate(-100 ${R + RING + 54 + (phase?.doing && tone ? 30 : 0)})`} pointerEvents="none">
          <rect width={200} height={lod >= 3 ? 168 : 66} rx={10} fill={surface} stroke={border} strokeWidth={1} />
          <g fontSize={10.5} fill={faint}>
            <text x={12} y={18}>Runs today</text><text x={106} y={18}>Failed, 7 days</text>
            <text x={12} y={48}>p95 time</text><text x={106} y={48}>Cost today</text>
          </g>
          <g fontSize={14} fontWeight={600} fill={ink}>
            <text x={12} y={33}>{a.control === "inventory" ? "n/a" : int(today.executions)}</text>
            <text x={106} y={33} fill={t.executions && t.failureRate > 0.05 ? STATE_COLORS.failed : ink}>{a.control === "inventory" || !t.executions ? "n/a" : pct(t.failureRate)}</text>
            <text x={12} y={63}>{a.p95Ms ? dur(a.p95Ms) : "n/a"}</text>
            <text x={106} y={63}>{a.control === "inventory" ? "n/a" : usd(today.costUsd, 2)}</text>
          </g>
          {lod >= 3 && (
            <g>
              <line x1={12} x2={188} y1={76} y2={76} stroke="rgb(var(--c-border))" />
              <text x={12} y={93} fontSize={10.5} fill={faint}>Model</text><text x={12} y={108} fontSize={12} fill={ink}>{a.models.join(", ").slice(0, 30) || "Not reported"}</text>
              <text x={12} y={128} fontSize={10.5} fill={faint}>Tools</text><text x={12} y={143} fontSize={12} fill={ink}>{a.tools.length ? `${a.tools.length} reachable, ${a.tools.filter((x) => x.sensitive).length} sensitive` : "None"}</text>
              {a.budget.monthlyUsd > 0 && <g><rect x={12} y={152} width={176} height={5} rx={2.5} fill="rgb(var(--c-surface-muted))" /><rect x={12} y={152} width={Math.min(176, (a.budget.spentUsd / a.budget.monthlyUsd) * 176)} height={5} rx={2.5} fill={a.budget.spentUsd >= a.budget.monthlyUsd * 0.9 ? STATE_COLORS.waiting : "#10B981"} /></g>}
              <g transform="translate(122 90)"><polyline fill="none" stroke="#2563EB" strokeWidth={1.6} points={a.daily.slice(-14).map((d, i, arr) => { const m = Math.max(1, ...arr.map((x) => x.executions)); return `${(i / 13) * 66},${34 - (d.executions / m) * 30}`; }).join(" ")} /><text x={0} y={-2} fontSize={9.5} fill={faint}>14 days of runs</text></g>
            </g>
          )}
        </g>
      )}
    </g>
  );
}

function HoverCard({ hover, nodeBy, byId, links, exposures, applied, live, health, boxes }: {
  hover: NonNullable<Hover>; nodeBy: Map<string, UsageNode>; byId: Map<string, Agent>; links: Link[]; exposures: Exposure[]; applied: Map<string, AppliedPolicy[]>; live: Record<string, { running: number; queued: number; pendingApprovals: number }>; health: Map<string, Health>; boxes: ReturnType<typeof groupBoxes>;
}) {
  const row = (k: string, v: React.ReactNode) => <div className="flex justify-between gap-3"><span className="text-text-tertiary">{k}</span><span className="font-medium text-text-primary tabular-nums text-right">{v}</span></div>;
  if (hover.kind === "agent") {
    const a = byId.get(hover.id); if (!a) return null; const t = totals(a, 7); const today = a.daily[a.daily.length - 1]; const h = health.get(a.id)!; const l = live[a.id]; const pol = applied.get(a.id) ?? [];
    const measured = a.control !== "inventory";
    return <div className="space-y-2">
      <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="font-semibold truncate">{a.title}</div><div className="text-xs text-text-tertiary font-mono truncate">agent://acme/{a.name}</div></div>
        <span className="text-[11px] rounded px-1.5 py-0.5 font-medium shrink-0" style={{ background: HEALTH_COLOR[h] + "22", color: h === "healthy" ? "#067A4E" : h === "failing" ? "#B02A2A" : h === "degraded" ? "#8A5504" : "#54666B" }}>{HEALTH_LABEL[h]}</span></div>
      <div className="space-y-1 text-xs">
        {row("Control", CONTROL_LABEL[a.control])}{row("Owner", a.owner)}
        {measured ? <>{row("Runs today", int(today.executions))}{row("Running now", l ? `${l.running}, ${l.queued} queued` : "0")}{row("Failed, 7 days", t.executions ? pct(t.failureRate) : "n/a")}{row("p95 time", a.p95Ms ? dur(a.p95Ms) : "n/a")}{row("Cost today", usd(today.costUsd))}
          {a.budget.monthlyUsd > 0 && row("Budget used", pct(a.budget.spentUsd / a.budget.monthlyUsd, 0))}{l && l.pendingApprovals > 0 && row("Waiting for a person", l.pendingApprovals)}</> : <div className="text-text-tertiary">Registered by hand. Nothing is measured.</div>}
        {row("Models", a.models.length ? a.models.join(", ") : "Not reported")}{row("Tools", a.tools.length)}
        {row("Policies", pol.length ? pol.map((p) => POLICY_BY_ID[p.kind].label).join(", ") : "None")}
      </div>
      <div className="text-[11px] text-text-tertiary pt-1 border-t border-border">Click for details. Drag to move.</div>
    </div>;
  }
  if (hover.kind === "link") {
    const l = links.find((x) => x.id === hover.id); if (!l) return null; const p = PROTOCOL_BY_ID[l.protocol];
    return <div className="space-y-2"><div className="flex items-center gap-2"><span className="h-2.5 w-6 rounded-full" style={{ background: p.color }} /><span className="font-semibold">{p.label}</span><span className="text-xs text-text-tertiary">{byId.get(l.from)?.title} to {byId.get(l.to)?.title}</span></div>
      <p className="text-xs text-text-secondary">{l.purpose}</p>
      <div className="space-y-1 text-xs">{row("Messages, 24 hours", compact(l.messages24h))}{row("p95 time", dur(l.p95Ms))}{row("Errors", pct(l.errorRate))}{row("Authentication", { jwt: "Signed token", mtls: "Mutual TLS", token: "Bearer token", none: "None" }[l.auth])}</div>
      {!l.measured && <p className="text-[11px] text-text-tertiary">Declared by the owner. Not measured, because one end is not reporting.</p>}</div>;
  }
  if (hover.kind === "exposure") {
    const e = exposures.find((x) => x.agentId === hover.id); if (!e) return null;
    return <div className="space-y-2"><div className="font-semibold">{byId.get(e.agentId)?.title} is reachable from outside</div><div className="space-y-1 text-xs">{row("Through", { gateway: "tok∑ner gateway", "public-url": "A public address", webhook: "A webhook" }[e.via])}{row("Authentication", { jwt: "Signed token", "app-key": "Application key", none: "None" }[e.auth])}{row("Requests, 24 hours", compact(e.requests24h))}</div>
      <p className="text-[11px] font-mono text-text-tertiary break-all">{e.url}</p>{e.auth === "none" && <p className="text-xs text-status-down">Anyone on the internet can call this agent.</p>}</div>;
  }
  if (hover.kind === "resource") {
    const n = nodeBy.get(hover.id); if (!n) return null;
    return <div className="space-y-2"><div><div className="font-semibold truncate">{n.name}</div><div className="text-xs text-text-tertiary">{n.subtitle}</div></div>
      <div className="space-y-1 text-xs">{row("Used by", n.agentIds.map((id) => byId.get(id)?.title).filter(Boolean).join(", "))}{row("For", n.roles.map((r) => ROLE_LABEL[r]).join(", "))}</div>
      {n.problem && <p className={`text-xs ${n.status === "problem" ? "text-status-down" : "text-[#8A5504]"}`}>{n.problem}</p>}
      <div className="text-[11px] text-text-tertiary pt-1 border-t border-border">Click for details. Drag to move.</div></div>;
  }
  if (hover.kind === "band") { const n = nodeBy; const items = [...n.values()].filter((x) => x.kind === hover.id); return <div className="space-y-1 text-xs"><div className="font-semibold text-[13px]">{{ knowledge: "Knowledge", channel: "Notification channels", connection: "Connections" }[hover.id] ?? hover.id}</div>{row("Items", items.length)}<div className="text-[11px] text-text-tertiary pt-1 border-t border-border">Drag the section to move everything in it. Drag one item to move only that item.</div></div>; }
  if (hover.kind === "cloud") return <div className="text-xs"><div className="font-semibold text-[13px] mb-1">Outside callers</div>Agents with a cloud mark can be called from outside the organisation. Dotted lines show which.</div>;
  const g = boxes.find((b) => b.name === hover.id); if (!g) return null;
  const list = g.members.map((m) => byId.get(m)!).filter(Boolean);
  return <div className="space-y-1 text-xs"><div className="font-semibold text-[13px]">{g.name}</div>{row("Agents", list.length)}{row("Runs, 30 days", int(list.reduce((s, a) => s + totals(a).executions, 0)))}{row("Cost, 30 days", usd(list.reduce((s, a) => s + totals(a).costUsd, 0), 0))}<div className="text-[11px] text-text-tertiary pt-1 border-t border-border">Drag the box to move the whole department.</div></div>;
}
