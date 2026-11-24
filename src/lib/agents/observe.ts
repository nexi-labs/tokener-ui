import type { Agent, LogLevel, Span, Trace } from "./types";
import { rng } from "./sample";
import type { Protocol } from "./topology";

/**
 * Everything the trace and metric screens derive from agents and traces. Nothing here stores anything: the same traces always give the same
 * waterfall, graph, search result and export.
 */

// ---------------------------------------------------------------------------------------------------------------------------------------
// One colour per agent, the same on every screen. A trace that crosses agents changes colour where the work changes hands.

export const AGENT_PALETTE = [
  "#E4572E", "#2E86AB", "#8E5BD0", "#2A9D8F", "#E9A23B", "#D6336C", "#4C6EF5", "#7CB518",
  "#A0522D", "#17A2B8", "#B8860B", "#7F8C00", "#E8590C", "#37B24D", "#9C36B5", "#1C7ED6",
];
/** Colours are handed out by age, oldest agent first, so adding an agent never changes the colour of an existing one. */
export function agentColors(agents: Agent[]): Record<string, string> {
  const sorted = [...agents].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
  return Object.fromEntries(sorted.map((a, i) => [a.id, AGENT_PALETTE[i % AGENT_PALETTE.length]]));
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Arithmetic

export const sumBy = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
export function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[i];
}
export const hash32 = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// ---------------------------------------------------------------------------------------------------------------------------------------
// Trace structure

export type Row = { span: Span; depth: number; selfMs: number; hasChildren: boolean };

/** Spans in reading order: a parent, then its children by start time, each with its own children beneath. Self time excludes time spent in children. */
export function waterfallRows(t: Trace): Row[] {
  const kids = new Map<string | null, Span[]>();
  const ids = new Set(t.spans.map((s) => s.id));
  for (const s of t.spans) { const k = s.parent && ids.has(s.parent) ? s.parent : null; kids.set(k, [...(kids.get(k) ?? []), s]); }
  for (const l of kids.values()) l.sort((a, b) => a.startMs - b.startMs || b.durMs - a.durMs);
  const rows: Row[] = [];
  const walk = (s: Span, depth: number) => {
    const c = kids.get(s.id) ?? [];
    rows.push({ span: s, depth, selfMs: selfTime(s, c), hasChildren: c.length > 0 });
    c.forEach((x) => walk(x, depth + 1));
  };
  (kids.get(null) ?? []).forEach((s) => walk(s, 0));
  return rows;
}
/** Time inside a span that is not inside one of its children. Overlapping children are counted once. */
function selfTime(s: Span, children: Span[]): number {
  if (!children.length) return s.durMs;
  const iv = children.map((c) => [Math.max(c.startMs, s.startMs), Math.min(c.startMs + c.durMs, s.startMs + s.durMs)] as const).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  let covered = 0; let end = -Infinity;
  for (const [a, b] of iv) { if (a > end) { covered += b - a; end = b; } else if (b > end) { covered += b - end; end = b; } }
  return Math.max(0, s.durMs - covered);
}

export const traceEnd = (t: Trace) => Math.max(1, ...t.spans.map((s) => s.startMs + s.durMs));

/** Where each agent spent the trace: its own time in spans (not waiting on others), cost and error count. */
export function perAgent(t: Trace): { agentId: string; spans: number; selfMs: number; costUsd: number; tokens: number; errors: number }[] {
  const rows = waterfallRows(t);
  const m = new Map<string, { agentId: string; spans: number; selfMs: number; costUsd: number; tokens: number; errors: number }>();
  for (const r of rows) {
    const x = m.get(r.span.agentId) ?? { agentId: r.span.agentId, spans: 0, selfMs: 0, costUsd: 0, tokens: 0, errors: 0 };
    x.spans++; x.selfMs += r.selfMs; x.costUsd += r.span.costUsd; x.tokens += r.span.tokens; if (r.span.status === "error") x.errors++;
    m.set(r.span.agentId, x);
  }
  return t.agentIds.map((id) => m.get(id)).filter((x): x is NonNullable<typeof x> => !!x);
}

export type Hop = { from: string; to: string; fromSpan: string; toSpan: string; protocol: Protocol; messageId: string; startMs: number; durMs: number; status: "ok" | "error"; async: boolean };

/** The hand-offs in a trace: every place where one agent's span is the parent of another agent's span. */
export function hops(t: Trace): Hop[] {
  const by = new Map(t.spans.map((s) => [s.id, s]));
  const out: Hop[] = [];
  for (const s of t.spans) {
    const p = s.parent ? by.get(s.parent) : undefined;
    if (!p || p.agentId === s.agentId) continue;
    out.push({
      from: p.agentId, to: s.agentId, fromSpan: p.id, toSpan: s.id, protocol: (p.attrs?.["tap.protocol"] as Protocol) ?? "tap", messageId: String(p.attrs?.["tap.message.id"] ?? ""),
      startMs: p.startMs, durMs: p.durMs, status: p.status === "error" || s.status === "error" ? "error" : "ok", async: p.attrs?.["messaging.system"] !== undefined,
    });
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Graphs over many traces (the dependency graph) and over one (the trace graph)

export type ServiceNode = { agentId: string; traces: number; errors: number; p95Ms: number; selfMs: number; costUsd: number };
export type ServiceEdge = { from: string; to: string; protocol: Protocol; calls: number; errors: number; p95Ms: number };

/** Who calls whom across a set of traces, with call counts, errors and latency. This is the dependency graph a Zipkin user would expect. */
export function serviceGraph(traces: Trace[]): { nodes: ServiceNode[]; edges: ServiceEdge[] } {
  const nodes = new Map<string, { traces: Set<string>; errors: number; roots: number[]; selfMs: number; costUsd: number }>();
  const edges = new Map<string, { from: string; to: string; protocol: Protocol; durs: number[]; errors: number }>();
  for (const t of traces) {
    for (const r of waterfallRows(t)) {
      const n = nodes.get(r.span.agentId) ?? { traces: new Set<string>(), errors: 0, roots: [], selfMs: 0, costUsd: 0 };
      n.traces.add(t.id); n.selfMs += r.selfMs; n.costUsd += r.span.costUsd;
      if (r.span.status === "error") n.errors++;
      if (r.span.kind === "delegation" && r.span.attrs?.["agent.name"]) n.roots.push(r.span.durMs);
      nodes.set(r.span.agentId, n);
    }
    for (const h of hops(t)) {
      const k = `${h.from}>${h.to}>${h.protocol}`;
      const e = edges.get(k) ?? { from: h.from, to: h.to, protocol: h.protocol, durs: [], errors: 0 };
      e.durs.push(h.durMs); if (h.status === "error") e.errors++;
      edges.set(k, e);
    }
  }
  return {
    nodes: [...nodes.entries()].map(([agentId, n]) => ({ agentId, traces: n.traces.size, errors: n.errors, p95Ms: percentile(n.roots, 95), selfMs: n.selfMs, costUsd: n.costUsd })).sort((a, b) => b.traces - a.traces),
    edges: [...edges.values()].map((e) => ({ from: e.from, to: e.to, protocol: e.protocol, calls: e.durs.length, errors: e.errors, p95Ms: percentile(e.durs, 95) })).sort((a, b) => b.calls - a.calls),
  };
}

export type TraceNode = { key: string; agentId: string; rootSpan: string; startMs: number; durMs: number; selfMs: number; status: "ok" | "error"; level: number; steps: number };
export type TraceEdge = { from: string; to: string; protocol: Protocol; durMs: number; status: "ok" | "error"; messageId: string; async: boolean };

/** One node for each time an agent ran in this trace, one edge for each hand-off. A node and its edges take the agent's colour, so the colour changes where work changes hands. */
export function traceGraph(t: Trace): { nodes: TraceNode[]; edges: TraceEdge[] } {
  const rows = waterfallRows(t);
  const byId = new Map(t.spans.map((s) => [s.id, s]));
  const rootOf = (s: Span): Span => { let c = s; while (c.parent) { const p = byId.get(c.parent); if (!p || p.agentId !== s.agentId) break; c = p; } return c; };
  const nodeFor = new Map<string, TraceNode>();
  for (const r of rows) {
    const root = rootOf(r.span);
    let n = nodeFor.get(root.id);
    if (!n) { n = { key: root.id, agentId: root.agentId, rootSpan: root.id, startMs: root.startMs, durMs: root.durMs, selfMs: 0, status: "ok", level: 0, steps: 0 }; nodeFor.set(root.id, n); }
    n.selfMs += r.selfMs; n.steps++; if (r.span.status === "error") n.status = "error";
  }
  const edges: TraceEdge[] = [];
  for (const h of hops(t)) {
    const from = rootOf(byId.get(h.fromSpan)!).id; const to = h.toSpan;
    if (nodeFor.has(from) && nodeFor.has(to)) edges.push({ from, to, protocol: h.protocol, durMs: h.durMs, status: h.status, messageId: h.messageId, async: h.async });
  }
  const level = (k: string, seen = 0): number => { const inc = edges.find((e) => e.to === k); return inc && seen < 20 ? 1 + level(inc.from, seen + 1) : 0; };
  nodeFor.forEach((n) => { n.level = level(n.key); });
  return { nodes: [...nodeFor.values()].sort((a, b) => a.startMs - b.startMs), edges };
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Logs. Every line carries the trace id, span id and correlation id, so a line found in one place can be followed to the trace and to the other agents.

export type LogLine = { ts: string; atMs: number; level: LogLevel; agentId: string; traceId: string; spanId: string; correlationId: string; msg: string };

export function logsOf(t: Trace): LogLine[] {
  const t0 = Date.parse(t.startedAt);
  return t.spans.flatMap((s) => (s.logs ?? []).map((l) => ({ ts: new Date(t0 + l.atMs).toISOString(), atMs: l.atMs, level: l.level, agentId: s.agentId, traceId: t.id, spanId: s.id, correlationId: t.correlationId, msg: l.msg })))
    .sort((a, b) => a.atMs - b.atMs);
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Search

export type TraceQuery = { text?: string; agent?: string; status?: "ok" | "error"; minMs?: number; kind?: "run" | "eval"; protocol?: Protocol; multiAgent?: boolean; sinceMs?: number };

/** The text matches a trace id, span id, correlation id, session, agent name or span name. Everything else narrows the result. */
export function searchTraces(traces: Trace[], q: TraceQuery, agents: Agent[], now = Date.now()): Trace[] {
  const text = (q.text ?? "").trim().toLowerCase();
  const names = new Map(agents.map((a) => [a.id, (a.name + " " + a.title).toLowerCase()]));
  return traces.filter((t) => {
    if (q.agent && !t.agentIds.includes(q.agent)) return false;
    if (q.status && t.status !== q.status) return false;
    if (q.minMs && t.durationMs < q.minMs) return false;
    if (q.kind && t.kind !== q.kind) return false;
    if (q.multiAgent && t.agentIds.length < 2) return false;
    if (q.sinceMs && now - Date.parse(t.startedAt) > q.sinceMs) return false;
    if (q.protocol && !hops(t).some((h) => h.protocol === q.protocol)) return false;
    if (text) {
      const hay = [t.id, t.correlationId, t.session, t.trigger, t.behalfOf, ...t.agentIds.map((i) => names.get(i) ?? ""), ...t.spans.flatMap((s) => [s.id, s.name])].join(" ").toLowerCase();
      return text.split(/\s+/).every((w) => hay.includes(w));
    }
    return true;
  });
}

/** Every trace that shares this correlation id, oldest first. */
export const sameCorrelation = (traces: Trace[], id: string) => traces.filter((t) => t.correlationId === id).sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));

export const traceparentOf = (t: Trace, spanId?: string) => `00-${t.id}-${spanId ?? t.spans.find((s) => !s.parent)?.id ?? "0000000000000000"}-01`;

// ---------------------------------------------------------------------------------------------------------------------------------------
// Metrics. Hourly figures for the last day are spread from the day's totals along a working-day curve, since the sample keeps daily totals.

export type MetricWindow = "24h" | "7d" | "30d";
export type MetricRow = { t: string; at: number; runs: number; failed: number; errorPct: number; p50: number; p95: number; p99: number; tokens: number; costUsd: number; toolCalls: number };

const DAY = 86_400_000;
const HOUR_SHAPE = [0.2, 0.15, 0.12, 0.12, 0.15, 0.3, 0.6, 1.0, 1.5, 1.8, 1.9, 1.8, 1.5, 1.7, 1.9, 1.8, 1.5, 1.1, 0.8, 0.6, 0.45, 0.35, 0.3, 0.25];

export function agentSeries(a: Agent, win: MetricWindow, now = Date.now()): MetricRow[] {
  const r = rng(hash32(a.id + win));
  const toolsPerRun = a.tools.length ? 1.4 + a.tools.length * 0.35 : 0;
  const lat = (f: number) => ({ p50: Math.round(a.p95Ms * 0.42 * f * (0.9 + r() * 0.2)), p95: Math.round(a.p95Ms * f * (0.92 + r() * 0.16)), p99: Math.round(a.p95Ms * 1.65 * f * (0.9 + r() * 0.25)) });
  if (win === "24h") {
    const day = a.daily[a.daily.length - 1] ?? { executions: 0, failures: 0, costUsd: 0, tokens: 0 };
    const norm = HOUR_SHAPE.reduce((x, y) => x + y, 0);
    return Array.from({ length: 24 }, (_, i) => {
      const at = now - (23 - i) * 3_600_000; const h = new Date(at).getHours();
      const share = HOUR_SHAPE[h] / norm;
      const runs = Math.round(day.executions * share * (0.85 + r() * 0.3));
      const failed = Math.min(runs, Math.round(day.failures * share * (0.5 + r() * 1.2)));
      return { t: `${String(h).padStart(2, "0")}:00`, at, runs, failed, errorPct: runs ? Math.round((failed / runs) * 1000) / 10 : 0, ...(runs ? lat(1) : { p50: 0, p95: 0, p99: 0 }),
        tokens: Math.round(day.tokens * share), costUsd: Math.round(day.costUsd * share * 100) / 100, toolCalls: Math.round(runs * toolsPerRun) };
    });
  }
  const n = win === "7d" ? 7 : 30;
  return a.daily.slice(-n).map((d, i) => {
    const at = now - (n - 1 - i) * DAY;
    return { t: new Date(at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }), at, runs: d.executions, failed: d.failures, errorPct: d.executions ? Math.round((d.failures / d.executions) * 1000) / 10 : 0,
      ...(d.executions ? lat(1) : { p50: 0, p95: 0, p99: 0 }), tokens: d.tokens, costUsd: d.costUsd, toolCalls: Math.round(d.executions * toolsPerRun) };
  });
}

/** All agents together. Latency is weighted by runs. */
export function fleetSeries(list: Agent[], win: MetricWindow, now = Date.now()): MetricRow[] {
  const per = list.filter((a) => a.state !== "retired" && a.control !== "inventory").map((a) => agentSeries(a, win, now));
  if (!per.length) return [];
  return per[0].map((base, i) => {
    const rows = per.map((p) => p[i]);
    const runs = sumBy(rows, (x) => x.runs); const failed = sumBy(rows, (x) => x.failed);
    const w = (f: (x: MetricRow) => number) => (runs ? Math.round(sumBy(rows, (x) => f(x) * x.runs) / runs) : 0);
    return { t: base.t, at: base.at, runs, failed, errorPct: runs ? Math.round((failed / runs) * 1000) / 10 : 0, p50: w((x) => x.p50), p95: w((x) => x.p95), p99: w((x) => x.p99),
      tokens: sumBy(rows, (x) => x.tokens), costUsd: Math.round(sumBy(rows, (x) => x.costUsd) * 100) / 100, toolCalls: sumBy(rows, (x) => x.toolCalls) };
  });
}

/** Span durations grouped by kind for one agent, over the traces given. Feeds the "where does the time go" chart. */
export function timeByKind(traces: Trace[], agentId?: string): { kind: string; ms: number; calls: number }[] {
  const m = new Map<string, { ms: number; calls: number }>();
  for (const t of traces) for (const r of waterfallRows(t)) {
    if (agentId && r.span.agentId !== agentId) continue;
    const x = m.get(r.span.kind) ?? { ms: 0, calls: 0 }; x.ms += r.selfMs; x.calls++; m.set(r.span.kind, x);
  }
  return [...m.entries()].map(([kind, v]) => ({ kind, ...v })).sort((a, b) => b.ms - a.ms);
}

/** Slowest spans across traces, by name, for an agent or for all of them. */
export function slowestSpans(traces: Trace[], limit = 8, agentId?: string) {
  const m = new Map<string, { name: string; agentId: string; kind: string; durs: number[]; errors: number }>();
  for (const t of traces) for (const s of t.spans) {
    if (agentId && s.agentId !== agentId) continue;
    if (s.kind === "delegation") continue;
    const k = `${s.agentId}|${s.name}`;
    const x = m.get(k) ?? { name: s.name, agentId: s.agentId, kind: s.kind, durs: [], errors: 0 };
    x.durs.push(s.durMs); if (s.status === "error") x.errors++; m.set(k, x);
  }
  return [...m.values()].map((x) => ({ name: x.name, agentId: x.agentId, kind: x.kind, calls: x.durs.length, p50: percentile(x.durs, 50), p95: percentile(x.durs, 95), errors: x.errors })).sort((a, b) => b.p95 - a.p95).slice(0, limit);
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Layout. Both helpers return grid positions, and the screens turn them into pixels.

export type Cell = { col: number; row: number };

/** A tidy tree: each parent sits at the middle of its children, and leaves take one row each. Used for the graph of a single trace. */
export function layoutTree(nodes: { key: string }[], edges: { from: string; to: string }[]): Record<string, Cell> {
  const kids = new Map<string, string[]>(); const hasParent = new Set<string>();
  for (const e of edges) { kids.set(e.from, [...(kids.get(e.from) ?? []), e.to]); hasParent.add(e.to); }
  const pos: Record<string, Cell> = {}; let row = 0;
  const place = (k: string, col: number, depth = 0) => {
    const c = depth > 40 ? [] : (kids.get(k) ?? []);
    if (!c.length) { pos[k] = { col, row: row++ }; return; }
    c.forEach((x) => place(x, col + 1, depth + 1));
    const rows = c.map((x) => pos[x].row); pos[k] = { col, row: (Math.min(...rows) + Math.max(...rows)) / 2 };
  };
  nodes.filter((n) => !hasParent.has(n.key)).forEach((n) => place(n.key, 0));
  nodes.forEach((n) => { if (!pos[n.key]) pos[n.key] = { col: 0, row: row++ }; });
  return pos;
}

/** Layers by distance from the agents nobody calls. Agents that call each other in a circle are still placed, once. */
export function layoutLayers(ids: string[], edges: { from: string; to: string }[], weight: (id: string) => number): Record<string, Cell> {
  const out = new Map<string, string[]>(); const incoming = new Set<string>();
  for (const e of edges) { if (e.from === e.to) continue; out.set(e.from, [...(out.get(e.from) ?? []), e.to]); incoming.add(e.to); }
  const col: Record<string, number> = {};
  const bfs = (start: string) => {
    col[start] = 0; const q = [start];
    while (q.length) { const x = q.shift()!; for (const y of out.get(x) ?? []) if (col[y] === undefined) { col[y] = col[x] + 1; q.push(y); } }
  };
  [...ids].filter((i) => !incoming.has(i)).sort((a, b) => weight(b) - weight(a)).forEach((i) => { if (col[i] === undefined) bfs(i); });
  [...ids].sort((a, b) => weight(b) - weight(a)).forEach((i) => { if (col[i] === undefined) bfs(i); });
  const byCol = new Map<number, string[]>();
  for (const i of ids) byCol.set(col[i], [...(byCol.get(col[i]) ?? []), i]);
  const pos: Record<string, Cell> = {};
  byCol.forEach((list, c) => { list.sort((a, b) => weight(b) - weight(a)); list.forEach((id, r) => { pos[id] = { col: c, row: r }; }); });
  // Order each column by where its neighbours sit, which pulls connected agents level with each other and cuts crossings.
  const nb = new Map<string, string[]>();
  for (const e of edges) { if (e.from === e.to) continue; nb.set(e.from, [...(nb.get(e.from) ?? []), e.to]); nb.set(e.to, [...(nb.get(e.to) ?? []), e.from]); }
  const cols = [...byCol.keys()].sort((a, b) => a - b);
  for (let sweep = 0; sweep < 6; sweep++) {
    for (const c of sweep % 2 ? [...cols].reverse() : cols) {
      const list = byCol.get(c)!;
      const bary = (id: string) => { const ns = (nb.get(id) ?? []).filter((n) => pos[n].col !== c); return ns.length ? ns.reduce((s, n) => s + pos[n].row, 0) / ns.length : Infinity; };
      const keep = new Map(list.map((id) => [id, pos[id].row]));
      list.sort((a, b) => { const x = bary(a); const y = bary(b); return x === y ? keep.get(a)! - keep.get(b)! : x === Infinity ? 1 : y === Infinity ? -1 : x - y; });
      list.forEach((id, r) => { pos[id] = { col: c, row: r }; });
    }
  }
  return pos;
}
