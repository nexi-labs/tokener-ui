"use client";

import clsx from "clsx";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Brain, CheckCheck, ChevronDown, ChevronRight, Download, Network, Search, ShieldCheck, Sparkles, Wrench, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Form";
import { AgentChip, AgentDot, CopyId, FrameworkMark } from "@/components/agents/bits";
import { KeyValue } from "@/components/mlops/ui";
import { exportTraces, download, fileFor, TRACE_FORMATS, type TraceFormat } from "@/lib/agents/export";
import { hops, layoutTree, logsOf, perAgent, traceEnd, traceGraph, traceparentOf, waterfallRows, type Row } from "@/lib/agents/observe";
import { PROTOCOL_BY_ID } from "@/lib/agents/topology";
import type { Agent, Span, StepKind, Trace } from "@/lib/agents/types";
import { KIND_LABEL } from "@/components/agents/bits";
import { dur, usd } from "@/lib/agents/format";
import { toast } from "@/lib/mlops/toast";

const KIND_ICON: Record<StepKind, typeof Sparkles> = { llm: Sparkles, tool: Wrench, mcp: Wrench, retrieval: Search, delegation: Network, memory: Brain, guardrail: ShieldCheck, eval: CheckCheck };
const RED = "#DC2626";
export type Colors = Record<string, string>;
const nameOf = (agents: Agent[], id: string) => agents.find((a) => a.id === id)?.name ?? id;
const titleOf = (agents: Agent[], id: string) => agents.find((a) => a.id === id)?.title ?? id;

/** A line of agent colours in the order the work moved through them, so a trace can be recognised in a list. */
export function AgentTrail({ trace, colors, max = 5 }: { trace: Trace; colors: Colors; max?: number }) {
  const ids = trace.agentIds; const shown = ids.slice(0, max);
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${ids.length} agent${ids.length > 1 ? "s" : ""}`}>
      {shown.map((id, i) => (
        <span key={id} className="inline-flex items-center gap-1">
          {i > 0 && <span className="h-px w-3" style={{ background: `linear-gradient(90deg, ${colors[shown[i - 1]]}, ${colors[id]})` }} />}
          <AgentDot color={colors[id] ?? "#999"} size={11} />
        </span>
      ))}
      {ids.length > max && <span className="text-[11px] text-text-tertiary ml-0.5">+{ids.length - max}</span>}
    </span>
  );
}

export function ExportMenu({ traces, agents, label = "Export", align = "right" }: { traces: Trace[]; agents: Agent[]; label?: string; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const c = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", k); window.addEventListener("mousedown", c);
    return () => { window.removeEventListener("keydown", k); window.removeEventListener("mousedown", c); };
  }, [open]);
  const go = (f: TraceFormat) => {
    const name = traces.length === 1 ? fileFor(traces[0].id, f) : `tokener-traces-${traces.length}.${TRACE_FORMATS.find((x) => x.id === f)!.ext}`;
    download(name, exportTraces(traces, agents, f), TRACE_FORMATS.find((x) => x.id === f)!.mime); setOpen(false);
    toast(`${traces.length} trace${traces.length > 1 ? "s" : ""} exported as ${TRACE_FORMATS.find((x) => x.id === f)!.label}`, "success");
  };
  return (
    <div className="relative" ref={ref}>
      <Button onClick={() => setOpen((o) => !o)} disabled={!traces.length} aria-haspopup="menu" aria-expanded={open}><Download size={14} /> {label} <ChevronDown size={13} /></Button>
      {open && (
        <div role="menu" className={clsx("absolute z-30 mt-1.5 w-80 rounded-lg border border-border bg-surface shadow-card p-1", align === "right" ? "right-0" : "left-0")}>
          {TRACE_FORMATS.map((f) => (
            <button key={f.id} role="menuitem" onClick={() => go(f.id)} className="w-full text-left rounded-md px-3 py-2 hover:bg-surface-muted">
              <div className="text-[13px] font-medium">{f.label}</div><div className="text-xs text-text-tertiary mt-0.5">{f.help}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Waterfall

const ROW = 30; const HEAD = 30; const LEFT = 300;

function niceStep(total: number, slots: number) {
  const raw = total / slots; const p = 10 ** Math.floor(Math.log10(raw)); const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export function Waterfall({ trace, agents, colors, selected, onSelect, playhead, focus }: { trace: Trace; agents: Agent[]; colors: Colors; selected: string | null; onSelect: (id: string | null) => void; playhead: number | null; focus: string | null }) {
  const all = useMemo(() => waterfallRows(trace), [trace]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const rows = useMemo(() => {
    const out: Row[] = []; let hide: number | null = null;
    for (const r of all) { if (hide !== null && r.depth > hide) continue; hide = null; out.push(r); if (collapsed.has(r.span.id)) hide = r.depth; }
    return out;
  }, [all, collapsed]);
  const total = traceEnd(trace);
  const wrap = useRef<HTMLDivElement>(null); const [W, setW] = useState(640);
  useLayoutEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(360, el.clientWidth))); ro.observe(el); setW(Math.max(360, el.clientWidth));
    return () => ro.disconnect();
  }, []);
  const pad = 12; const x = (ms: number) => pad + (ms / total) * (W - pad * 2 - 96);
  const idx = new Map(rows.map((r, i) => [r.span.id, i]));
  const y = (i: number) => HEAD + i * ROW + ROW / 2;
  const step = niceStep(total, Math.max(3, Math.floor(W / 110)));
  const ticks = Array.from({ length: Math.floor(total / step) + 1 }, (_, i) => i * step);
  const H = HEAD + rows.length * ROW + 6;
  const link = hops(trace).filter((h) => idx.has(h.fromSpan) && idx.has(h.toSpan));
  const byId = new Map(trace.spans.map((s) => [s.id, s]));

  const state = (s: Span): "pending" | "running" | "done" => (playhead === null ? "done" : playhead < s.startMs ? "pending" : playhead < s.startMs + s.durMs ? "running" : "done");

  return (
    <div className="grid grid-cols-[300px_1fr] border border-border rounded-lg bg-surface overflow-hidden">
      <div className="border-r border-border">
        <div className="h-[30px] px-3 flex items-center text-[11px] uppercase tracking-wide text-text-tertiary border-b border-border">Span</div>
        {rows.map((r) => {
          const s = r.span; const Icon = KIND_ICON[s.kind]; const on = selected === s.id; const c = colors[s.agentId] ?? "#999"; const dim = (focus && s.agentId !== focus) || (playhead !== null && state(s) === "pending");
          const parent = s.parent ? byId.get(s.parent) : null; const switched = !parent || parent.agentId !== s.agentId;
          return (
            <div key={s.id} onClick={() => onSelect(on ? null : s.id)} role="row" aria-selected={on} style={{ height: ROW, paddingLeft: 8 + r.depth * 14 }}
              className={clsx("flex items-center gap-1.5 pr-2 cursor-pointer border-l-[3px] text-[13px]", on ? "bg-surface-muted" : "hover:bg-surface-subtle", dim && "opacity-40")} >
              <span style={{ background: c, width: 3, height: 16, marginLeft: -11 + 8 }} className="rounded-sm shrink-0 hidden" />
              {r.hasChildren ? (
                <button aria-label={collapsed.has(s.id) ? "Expand" : "Collapse"} onClick={(e) => { e.stopPropagation(); setCollapsed((p) => { const n = new Set(p); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; }); }} className="text-text-tertiary hover:text-text-primary -ml-1">
                  {collapsed.has(s.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </button>
              ) : <span className="w-3.5" />}
              <Icon size={13} className="shrink-0" style={{ color: c }} />
              <span className="truncate" title={s.name}>{s.name}</span>
              {switched && s.kind === "delegation" && s.attrs?.["agent.name"] ? <span className="ml-auto text-[11px] text-text-tertiary truncate max-w-[90px]">{nameOf(agents, s.agentId)}</span> : null}
              {s.status === "error" && <XCircle size={13} className="ml-auto shrink-0" style={{ color: RED }} aria-label="Failed" />}
            </div>
          );
        })}
      </div>
      <div ref={wrap} className="overflow-x-auto">
        <svg width={W} height={H} role="img" aria-label={`Timeline of ${trace.spans.length} spans across ${trace.agentIds.length} agents`}>
          <defs>
            {link.map((h, i) => <linearGradient key={i} id={`g-${trace.id.slice(0, 6)}-${i}`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={y(idx.get(h.fromSpan)!)} y2={y(idx.get(h.toSpan)!)}><stop offset="0" stopColor={colors[h.from]} /><stop offset="1" stopColor={colors[h.to]} /></linearGradient>)}
            <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#fff" strokeOpacity="0.55" strokeWidth="2" /></pattern>
          </defs>
          {ticks.map((t) => <g key={t}><line x1={x(t)} x2={x(t)} y1={HEAD - 4} y2={H} stroke="var(--chart-grid)" /><text x={x(t) + 4} y={18} fontSize="11" fill="var(--chart-tick)">{dur(t)}</text></g>)}
          <line x1={0} x2={W} y1={HEAD} y2={HEAD} stroke="var(--chart-grid)" />
          {rows.map((r, i) => i % 2 === 1 && <rect key={r.span.id} x={0} y={HEAD + i * ROW} width={W} height={ROW} fill="currentColor" opacity="0.025" />)}
          {rows.map((r, i) => {
            const s = r.span; const c = colors[s.agentId] ?? "#999"; const w = Math.max(3, x(s.startMs + s.durMs) - x(s.startMs)); const st = state(s);
            const container = s.kind === "delegation"; const err = s.status === "error"; const dim = (focus && s.agentId !== focus) || st === "pending";
            const async_ = s.attrs?.["messaging.system"] !== undefined;
            return (
              <g key={s.id} onClick={() => onSelect(selected === s.id ? null : s.id)} style={{ cursor: "pointer" }} opacity={dim ? 0.28 : 1}>
                <rect x={0} y={HEAD + i * ROW} width={W} height={ROW} fill="transparent" />
                {selected === s.id && <rect x={0} y={HEAD + i * ROW} width={W} height={ROW} fill="currentColor" opacity="0.06" />}
                <rect x={x(s.startMs)} y={y(i) - (container ? 8 : 7)} width={w} height={container ? 16 : 14} rx={3}
                  fill={container ? c : c} fillOpacity={container ? 0.14 : s.kind === "eval" ? 0.55 : 0.9} stroke={err ? RED : c} strokeWidth={container || err ? 1.6 : 0} strokeDasharray={async_ ? "4 3" : undefined} className={st === "running" ? "tok-pulse" : undefined} />
                {s.kind === "eval" && <rect x={x(s.startMs)} y={y(i) - 7} width={w} height={14} rx={3} fill="url(#hatch)" />}
                {err && <text x={x(s.startMs + s.durMs) - 4} y={y(i) + 4} fontSize="11" fontWeight="700" fill={container ? RED : "#fff"} textAnchor="end">!</text>}
                <text x={x(s.startMs + s.durMs) + 6} y={y(i) + 4} fontSize="11" fill="var(--chart-legend)">{dur(s.durMs)}{s.costUsd > 0 ? `  ${usd(s.costUsd, 4)}` : ""}</text>
              </g>
            );
          })}
          {link.map((h, i) => {
            const a = idx.get(h.fromSpan)!; const b = idx.get(h.toSpan)!; const to = byId.get(h.toSpan)!; const from = byId.get(h.fromSpan)!;
            const x1 = x(to.startMs); const xe = x(to.startMs + to.durMs); const xf = x(from.startMs + from.durMs);
            const gid = `url(#g-${trace.id.slice(0, 6)}-${i})`;
            return (
              <g key={i} fill="none" opacity={playhead !== null && playhead < to.startMs ? 0.25 : 1}>
                <path d={`M ${x1} ${y(a) + 8} V ${y(b) - 8}`} stroke={gid} strokeWidth="2" strokeDasharray={h.async ? "4 3" : undefined} />
                <path d={`M ${x1 - 4} ${y(b) - 12} L ${x1} ${y(b) - 7} L ${x1 + 4} ${y(b) - 12}`} stroke={colors[h.to]} strokeWidth="1.6" />
                {!h.async && <path d={`M ${xe} ${y(b) + 8} V ${y(a) - 8}`} transform={`translate(${Math.min(0, xf - xe)} 0)`} stroke={gid} strokeWidth="1.5" strokeDasharray="2 3" opacity="0.75" />}
              </g>
            );
          })}
          {playhead !== null && <g><line x1={x(playhead)} x2={x(playhead)} y1={HEAD - 4} y2={H} stroke="#F59E0B" strokeWidth="1.5" /><circle cx={x(playhead)} cy={HEAD - 4} r={3.5} fill="#F59E0B" /></g>}
        </svg>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Span inspector

const GROUPS: [string, (k: string) => boolean][] = [["Model", (k) => k.startsWith("gen_ai.")], ["Tool", (k) => k.startsWith("mcp.") || k.startsWith("tokener.tool")], ["Hand-off", (k) => k.startsWith("tap.") || k.startsWith("peer.") || k.startsWith("messaging.")], ["Memory", (k) => k.startsWith("memory.")], ["Policy", (k) => k.startsWith("policy.")], ["Evaluation", (k) => k.startsWith("eval.")], ["Agent", (k) => k.startsWith("agent.") || k.startsWith("tokener.control") || k.startsWith("retry.")]];

export function SpanInspector({ trace, span, agents, colors, onOpenAgent }: { trace: Trace; span: Span; agents: Agent[]; colors: Colors; onOpenAgent?: (id: string) => void }) {
  const attrs = Object.entries(span.attrs ?? {});
  const used = new Set<string>();
  const groups = GROUPS.map(([label, test]) => ({ label, items: attrs.filter(([k]) => { if (used.has(k) || !test(k)) return false; used.add(k); return true; }) })).filter((g) => g.items.length);
  const rest = attrs.filter(([k]) => !used.has(k));
  const rows = waterfallRows(trace); const me = rows.find((r) => r.span.id === span.id);
  const peer = typeof span.attrs?.["peer.agent"] === "string" ? agents.find((a) => a.name === span.attrs!["peer.agent"]) : undefined;
  return (
    <div className="space-y-4 text-[13px]">
      <div>
        <div className="flex items-center gap-2 mb-1.5"><AgentChip name={nameOf(agents, span.agentId)} color={colors[span.agentId] ?? "#999"} />{span.status === "error" ? <Badge tone="down">Failed</Badge> : <Badge tone="healthy">OK</Badge>}</div>
        <h3 className="text-sm font-semibold break-words">{span.name}</h3>
        <p className="text-xs text-text-tertiary">{KIND_LABEL[span.kind]}</p>
        {span.detail && <p className="mt-2 text-status-down text-[13px]">{span.detail}</p>}
      </div>
      <KeyValue rows={[
        ["Starts at", `${dur(span.startMs)} into the trace`], ["Duration", dur(span.durMs)], ...(me ? [["Own time", dur(me.selfMs)] as [string, string]] : []),
        ...(span.costUsd ? [["Cost", usd(span.costUsd, 4)] as [string, string]] : []), ...(span.tokens ? [["Tokens", span.tokens.toLocaleString("en-US")] as [string, string]] : []),
        ["Span ID", <CopyId key="s" value={span.id} label="span id" full />], ["Parent", span.parent ? <CopyId key="p" value={span.parent} label="parent span id" full /> : "None, this is the root"], ["Trace ID", <CopyId key="t" value={trace.id} label="trace id" />],
        ["Correlation ID", <CopyId key="c" value={trace.correlationId} label="correlation id" full />], ["traceparent", <CopyId key="tp" value={traceparentOf(trace, span.id)} label="traceparent" />],
      ]} />
      {peer && onOpenAgent && <button className="text-[13px] text-status-info hover:underline" onClick={() => onOpenAgent(peer.id)}>Open {peer.title}</button>}
      {[...groups, ...(rest.length ? [{ label: "Other", items: rest }] : [])].map((g) => (
        <section key={g.label}><h4 className="text-[11px] uppercase tracking-wide text-text-tertiary mb-1.5">{g.label}</h4>
          <dl className="space-y-1">{g.items.map(([k, v]) => <div key={k} className="flex gap-3"><dt className="font-mono text-[11.5px] text-text-secondary w-[46%] shrink-0 break-words">{k}</dt><dd className="font-mono text-[11.5px] break-all">{String(v)}</dd></div>)}</dl></section>
      ))}
      {(span.logs?.length ?? 0) > 0 && (
        <section><h4 className="text-[11px] uppercase tracking-wide text-text-tertiary mb-1.5">Logs</h4>
          <ul className="space-y-1.5">{span.logs!.map((l, i) => <li key={i} className="flex gap-2 text-[12px]"><span className="text-text-tertiary font-mono w-14 shrink-0">+{dur(l.atMs - span.startMs)}</span><span className={clsx("uppercase text-[10px] font-semibold mt-0.5 w-9 shrink-0", l.level === "error" ? "text-status-down" : l.level === "warn" ? "text-status-degraded" : "text-text-tertiary")}>{l.level}</span><span className="break-words">{l.msg}</span></li>)}</ul></section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Agent summary strip

export function AgentStrip({ trace, agents, colors, focus, onFocus }: { trace: Trace; agents: Agent[]; colors: Colors; focus: string | null; onFocus: (id: string | null) => void }) {
  const per = useMemo(() => perAgent(trace), [trace]); const total = Math.max(1, per.reduce((x, p) => x + p.selfMs, 0));
  return (
    <div className="flex flex-wrap gap-2">
      {per.map((p) => (
        <button key={p.agentId} onClick={() => onFocus(focus === p.agentId ? null : p.agentId)} aria-pressed={focus === p.agentId}
          className={clsx("text-left rounded-lg border px-3 py-2 min-w-[190px] hover:bg-surface-subtle", focus === p.agentId ? "border-text-primary bg-surface-muted" : "border-border bg-surface")}>
          <div className="flex items-center gap-2"><AgentDot color={colors[p.agentId] ?? "#999"} /><span className="text-[13px] font-medium truncate">{titleOf(agents, p.agentId)}</span>{p.errors > 0 && <XCircle size={13} style={{ color: RED }} className="ml-auto shrink-0" />}</div>
          <div className="mt-1.5 h-1 rounded-full bg-surface-muted overflow-hidden"><div className="h-full" style={{ width: `${(p.selfMs / total) * 100}%`, background: colors[p.agentId] }} /></div>
          <div className="mt-1.5 text-[11.5px] text-text-tertiary tabular-nums">{dur(p.selfMs)} own time, {p.spans} spans{p.costUsd > 0 ? `, ${usd(p.costUsd, 4)}` : ""}</div>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Trace graph: one node each time an agent ran, one line for each hand-off. The line changes from the sender's colour to the receiver's.

export function TraceGraph({ trace, agents, colors, playhead, selected, onSelect, animate }: { trace: Trace; agents: Agent[]; colors: Colors; playhead: number | null; selected: string | null; onSelect: (spanId: string | null) => void; animate: boolean }) {
  const g = useMemo(() => traceGraph(trace), [trace]);
  const pos = useMemo(() => layoutTree(g.nodes, g.edges), [g]);
  const NW = 200; const NH = 66; const GX = 120; const GY = 34;
  const px = (c: number) => 24 + c * (NW + GX); const py = (r: number) => 24 + r * (NH + GY);
  const cols = Math.max(...Object.values(pos).map((p) => p.col)) + 1; const rowsN = Math.max(...Object.values(pos).map((p) => p.row)) + 1;
  const W = 48 + cols * NW + (cols - 1) * GX; const H = 48 + rowsN * NH + (rowsN - 1) * GY;
  const node = new Map(g.nodes.map((n) => [n.key, n]));
  const stateOf = (n: { startMs: number; durMs: number }) => (playhead === null ? "done" : playhead < n.startMs ? "pending" : playhead < n.startMs + n.durMs ? "running" : "done");
  return (
    <div className="border border-border rounded-lg bg-surface overflow-auto">
      <svg width={Math.max(W, 560)} height={H} role="img" aria-label={`Graph of ${g.nodes.length} agent runs and ${g.edges.length} hand-offs`}>
        <defs>
          {g.edges.map((e, i) => { const a = pos[e.from]; const b = pos[e.to]; return <linearGradient key={i} id={`eg-${trace.id.slice(0, 6)}-${i}`} gradientUnits="userSpaceOnUse" x1={px(a.col) + NW} x2={px(b.col)} y1="0" y2="0"><stop offset="0" stopColor={colors[node.get(e.from)!.agentId]} /><stop offset="1" stopColor={colors[node.get(e.to)!.agentId]} /></linearGradient>; })}
        </defs>
        {g.edges.map((e, i) => {
          const a = pos[e.from]; const b = pos[e.to]; const x1 = px(a.col) + NW; const y1 = py(a.row) + NH / 2; const x2 = px(b.col); const y2 = py(b.row) + NH / 2; const mx = (x1 + x2) / 2;
          const to = node.get(e.to)!; const active = playhead !== null && playhead >= to.startMs - 40 && playhead < to.startMs + to.durMs; const shown = playhead === null || playhead >= to.startMs - 40;
          const d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`; const proto = PROTOCOL_BY_ID[e.protocol];
          return (
            <g key={i} opacity={shown ? 1 : 0.2}>
              <path d={d} fill="none" stroke={`url(#eg-${trace.id.slice(0, 6)}-${i})`} strokeWidth={e.status === "error" ? 3.5 : 3} strokeDasharray={e.async ? "6 5" : undefined} strokeLinecap="round" />
              {(animate || active) && e.status !== "error" && <path d={d} fill="none" stroke="#fff" strokeOpacity="0.85" strokeWidth="1.6" strokeDasharray="3 25" strokeLinecap="round" className="tok-flow" />}
              <path d={`M ${x2 - 9} ${y2 - 5} L ${x2 - 1} ${y2} L ${x2 - 9} ${y2 + 5}`} fill="none" stroke={colors[to.agentId]} strokeWidth="2" />
              <g transform={`translate(${mx} ${(y1 + y2) / 2})`}>
                <rect x={-40} y={-15} width={80} height={30} rx={15} fill="rgb(var(--c-surface))" stroke={e.status === "error" ? RED : proto.color} />
                <text textAnchor="middle" y={-2} fontSize="10.5" fontWeight="600" fill={proto.color}>{proto.label}{e.async ? " async" : ""}</text>
                <text textAnchor="middle" y={10} fontSize="9.5" fill="var(--chart-legend)">{dur(e.durMs)}</text>
              </g>
            </g>
          );
        })}
        {g.nodes.map((n) => {
          const p = pos[n.key]; const c = colors[n.agentId] ?? "#999"; const st = stateOf(n); const on = selected === n.rootSpan; const a = agents.find((x) => x.id === n.agentId);
          return (
            <g key={n.key} transform={`translate(${px(p.col)} ${py(p.row)})`} onClick={() => onSelect(on ? null : n.rootSpan)} style={{ cursor: "pointer" }} opacity={st === "pending" ? 0.3 : 1}>
              <rect width={NW} height={NH} rx={12} fill="rgb(var(--c-surface))" stroke={n.status === "error" ? RED : c} strokeWidth={on ? 3 : 2} className={st === "running" ? "tok-pulse" : undefined} />
              <rect width={6} height={NH} rx={3} fill={c} />
              <foreignObject x={16} y={11} width={NW - 24} height={NH - 16}>
                <div className="flex items-center gap-2.5 h-full" style={{ marginTop: -4 }}>
                  <FrameworkMark id={a?.framework ?? "custom"} size={18} />
                  <div className="min-w-0"><div className="text-[13px] font-medium truncate leading-tight">{a?.title ?? n.agentId}</div><div className="text-[11px] text-text-tertiary tabular-nums leading-tight mt-0.5">{dur(n.selfMs)} own, {n.steps} spans</div></div>
                </div>
              </foreignObject>
              {n.status === "error" && <circle cx={NW - 10} cy={10} r={5} fill={RED} />}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Logs

export function LogTable({ trace, agents, colors, onSelectSpan }: { trace: Trace; agents: Agent[]; colors: Colors; onSelectSpan: (id: string) => void }) {
  const [level, setLevel] = useState("all"); const [agent, setAgent] = useState("all"); const [q, setQ] = useState(""); const [ids, setIds] = useState(false);
  const all = useMemo(() => logsOf(trace), [trace]);
  const rows = all.filter((l) => (level === "all" || l.level === level) && (agent === "all" || l.agentId === agent) && (!q || l.msg.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" /><input aria-label="Search logs" placeholder="Search messages" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-56 rounded-md border border-border bg-surface pl-8 pr-3 text-[13px]" /></div>
        <Select aria-label="Level" value={level} onChange={(e) => setLevel(e.target.value)} className="!w-32"><option value="all">All levels</option>{["debug", "info", "warn", "error"].map((l) => <option key={l} value={l}>{l}</option>)}</Select>
        <Select aria-label="Agent" value={agent} onChange={(e) => setAgent(e.target.value)} className="!w-52"><option value="all">All agents</option>{trace.agentIds.map((a) => <option key={a} value={a}>{nameOf(agents, a)}</option>)}</Select>
        <label className="inline-flex items-center gap-2 text-[13px] text-text-secondary ml-1"><input type="checkbox" className="accent-[#07191E]" checked={ids} onChange={(e) => setIds(e.target.checked)} /> Show trace and correlation ids</label>
        <span className="text-xs text-text-tertiary ml-auto">{rows.length} of {all.length} lines</span>
      </div>
      <div className="border border-border rounded-lg bg-surface overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead><tr className="text-left text-[11px] uppercase tracking-wide text-text-tertiary border-b border-border"><th className="px-3 py-2 font-medium">Time</th><th className="px-2 py-2 font-medium">Level</th><th className="px-2 py-2 font-medium">Agent</th><th className="px-2 py-2 font-medium">Span</th>{ids && <><th className="px-2 py-2 font-medium">Trace</th><th className="px-2 py-2 font-medium">Correlation</th></>}<th className="px-2 py-2 font-medium">Message</th></tr></thead>
          <tbody>
            {rows.map((l, i) => (
              <tr key={i} className="border-b border-border last:border-0 hover:bg-surface-subtle align-top">
                <td className="px-3 py-1.5 font-mono text-text-secondary whitespace-nowrap">{l.ts.slice(11, 23)} <span className="text-text-tertiary">+{dur(l.atMs)}</span></td>
                <td className="px-2 py-1.5"><span className={clsx("uppercase text-[10.5px] font-semibold", l.level === "error" ? "text-status-down" : l.level === "warn" ? "text-status-degraded" : "text-text-tertiary")}>{l.level}</span></td>
                <td className="px-2 py-1.5"><AgentChip name={nameOf(agents, l.agentId)} color={colors[l.agentId] ?? "#999"} /></td>
                <td className="px-2 py-1.5"><button className="font-mono text-text-secondary hover:underline" onClick={() => onSelectSpan(l.spanId)}>{l.spanId.slice(0, 8)}</button></td>
                {ids && <><td className="px-2 py-1.5"><CopyId value={l.traceId} label="trace id" /></td><td className="px-2 py-1.5"><CopyId value={l.correlationId} label="correlation id" /></td></>}
                <td className="px-2 py-1.5 break-words">{l.msg}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={ids ? 7 : 5} className="px-3 py-6 text-center text-text-tertiary">No log lines match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
