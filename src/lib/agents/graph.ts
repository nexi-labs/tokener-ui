import type { Agent } from "./types";
import type { UsageEdge, UsageNode } from "./connectors";
import type { Link } from "./topology";
import { healthOf, HEALTH_LABEL } from "./topology";
import { CONTROL_LABEL } from "./types";

/**
 * The data and the maths behind the Graph view, an Obsidian style map of agents.
 * Nothing here touches the screen: it decides what each node is, what colour and icon it gets, where nodes settle, and which ones are near a chosen node.
 */

// ---------------------------------------------------------------------------------------------------------------------------------------
// What an agent is for

export type UseCase =
  | "support" | "finance" | "legal" | "engineering" | "data" | "sales" | "people" | "it" | "marketing" | "claims" | "research" | "operations" | "general";

export const USE_CASES: { id: UseCase; label: string }[] = [
  { id: "support", label: "Customer support" }, { id: "finance", label: "Finance and payments" }, { id: "legal", label: "Legal and compliance" },
  { id: "engineering", label: "Engineering" }, { id: "data", label: "Data and quality" }, { id: "sales", label: "Sales and pricing" },
  { id: "people", label: "People and onboarding" }, { id: "it", label: "IT service" }, { id: "marketing", label: "Marketing and web" },
  { id: "claims", label: "Claims" }, { id: "research", label: "Research" }, { id: "operations", label: "Operations" }, { id: "general", label: "General" },
];

/** Words that point at a use case, checked against the agent's title, name and description in this order. The first match wins, so claims beats support. */
const RULES: [UseCase, RegExp][] = [
  ["claims", /\bclaims?\b/],
  ["legal", /\b(contracts?|legal|compliance|clauses?|policy review|regulat\w*)\b/],
  ["finance", /\b(refunds?|invoices?|payments?|billing|ledger|purchase orders?|finance|expenses?)\b/],
  ["engineering", /\b(code|pull requests?|commits?|deploy\w*|build|test suites?|incidents?|engineering)\b/],
  ["data", /\b(data|dataset|quality|refinery|pipeline|schema|etl)\b/],
  ["sales", /\b(sales?|pricing|prices?|leads?|crm|accounts?|quotes?)\b/],
  ["people", /\b(onboarding|new starters?|hr|handbook|recruit\w*|people)\b/],
  ["it", /\b(it helpdesk|helpdesk|passwords?|laptops?|vpn|it support)\b/],
  ["marketing", /\b(marketing|campaigns?|faq|website|seo|brand)\b/],
  ["research", /\b(research\w*|briefs?|analy[sz]\w*|summari[sz]\w*)\b/],
  ["support", /\b(support|tickets?|customers?|service cases?|triage|helpdesk)\b/],
  ["operations", /\b(operations?|logistics|shipping|inventory|scheduling)\b/],
];

/** The use case of an agent, read from what it says it does. An agent that matches nothing is general. */
export function useCaseOf(a: Pick<Agent, "title" | "name" | "description" | "department">): UseCase {
  const text = `${a.title} ${a.name.replace(/[-_]/g, " ")} ${a.description}`.toLowerCase();
  for (const [id, re] of RULES) if (re.test(text)) return id;
  const dept = a.department.toLowerCase();
  if (/support|service/.test(dept)) return "support";
  if (/financ/.test(dept)) return "finance";
  if (/legal/.test(dept)) return "legal";
  if (/engineer|platform|dev/.test(dept)) return "engineering";
  if (/sales/.test(dept)) return "sales";
  if (/people|hr/.test(dept)) return "people";
  if (/^it$|information tech/.test(dept)) return "it";
  if (/market/.test(dept)) return "marketing";
  if (/operation/.test(dept)) return "operations";
  return "general";
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Colour

/** Bright colours chosen to read on black, far enough apart to tell at a glance. The first ten are used before any repeats. */
export const GRAPH_PALETTE = ["#6EA8FF", "#FF7A9C", "#4FE3C1", "#FFC857", "#B48CFF", "#7BE05F", "#FF9F5A", "#4DD0F0", "#F78AE0", "#C2D84B", "#9AA7FF", "#FF6B6B"];

export type ColorBy = "department" | "framework" | "health" | "control" | "usecase";
export const COLOR_BY: { id: ColorBy; label: string }[] = [
  { id: "department", label: "Department" }, { id: "usecase", label: "Use case" }, { id: "framework", label: "Framework" }, { id: "health", label: "Health" }, { id: "control", label: "Control level" },
];
const HEALTH_HEX: Record<string, string> = { healthy: "#3DDC97", degraded: "#FFC857", failing: "#FF5C6C", suspended: "#8A94A0", retired: "#5B6470", unmeasured: "#9AA7FF" };

export type Group = { key: string; label: string; color: string; count: number };

/** The group an agent falls in for a colouring, with a label for the legend. */
export function groupKey(a: Agent, by: ColorBy): { key: string; label: string } {
  switch (by) {
    case "department": return { key: a.department, label: a.department };
    case "framework": return { key: a.framework, label: a.framework };
    case "usecase": { const u = useCaseOf(a); return { key: u, label: USE_CASES.find((x) => x.id === u)!.label }; }
    case "control": return { key: a.control, label: CONTROL_LABEL[a.control] };
    case "health": { const h = healthOf(a); return { key: h, label: HEALTH_LABEL[h] }; }
  }
}

/** One colour per group, stable for a given set of agents: groups are ordered by size, then name, and take the palette in turn. */
export function groupsOf(agents: Agent[], by: ColorBy): Group[] {
  const m = new Map<string, Group>();
  for (const a of agents) { const g = groupKey(a, by); const e = m.get(g.key); if (e) e.count++; else m.set(g.key, { key: g.key, label: g.label, color: "", count: 1 }); }
  const list = [...m.values()].sort((x, y) => y.count - x.count || x.label.localeCompare(y.label));
  list.forEach((g, i) => { g.color = by === "health" ? HEALTH_HEX[g.key] ?? "#9AA7FF" : GRAPH_PALETTE[i % GRAPH_PALETTE.length]; });
  return list;
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// The graph

export type GNode = {
  id: string; kind: "agent" | "resource"; label: string; sub: string; color: string; group: string;
  /** Agents carry the icon of what they do. Resources carry their kind. */
  icon: string; weight: number; createdAt: number; status?: "ready" | "warning" | "problem"; ref?: string;
};
export type GEdge = { id: string; from: string; to: string; kind: "agent" | "resource"; protocol?: string; weight: number };

export type GraphData = { nodes: GNode[]; edges: GEdge[]; groups: Group[] };

/**
 * Builds the graph: an agent is a node, a link between two agents is an edge, and with resources on, each knowledge base, channel and connection an
 * agent uses is a small node joined to it. A node's weight is how connected it is, which sets its size.
 */
export function buildGraph(agents: Agent[], links: Link[], usage: { nodes: UsageNode[]; edges: UsageEdge[] }, o: { by: ColorBy; resources: boolean }): GraphData {
  const groups = groupsOf(agents, o.by); const gcolor = new Map(groups.map((g) => [g.key, g.color]));
  const ids = new Set(agents.map((a) => a.id));
  const nodes: GNode[] = agents.map((a) => {
    const g = groupKey(a, o.by);
    return { id: a.id, kind: "agent", label: a.title, sub: `${a.department} · ${a.framework}`, color: gcolor.get(g.key) ?? "#9AA7FF", group: g.key, icon: useCaseOf(a), weight: 0, createdAt: Date.parse(a.createdAt) || 0, ref: a.id };
  });
  const edges: GEdge[] = [];
  for (const l of links) if (ids.has(l.from) && ids.has(l.to)) edges.push({ id: l.id, from: l.from, to: l.to, kind: "agent", protocol: l.protocol, weight: Math.log10(l.messages24h + 10) });
  if (o.resources) {
    const used = new Set(usage.edges.filter((e) => ids.has(e.agentId)).map((e) => e.nodeKey));
    for (const n of usage.nodes) if (used.has(n.key)) nodes.push({ id: n.key, kind: "resource", label: n.name, sub: n.subtitle, color: "#8A94A0", group: n.kind, icon: n.kind, weight: 0, createdAt: 0, status: n.status, ref: n.key });
    for (const e of usage.edges) if (ids.has(e.agentId) && used.has(e.nodeKey)) edges.push({ id: e.key, from: e.agentId, to: e.nodeKey, kind: "resource", weight: 1 });
  }
  const deg = new Map<string, number>();
  for (const e of edges) { deg.set(e.from, (deg.get(e.from) ?? 0) + 1); deg.set(e.to, (deg.get(e.to) ?? 0) + 1); }
  for (const n of nodes) n.weight = deg.get(n.id) ?? 0;
  // Resources join the order of creation after the agents that use them, so the replay grows the map in a believable order.
  const first = new Map<string, number>();
  for (const e of edges) { const a = nodes.find((n) => n.id === e.from); if (a && e.kind === "resource") first.set(e.to, Math.min(first.get(e.to) ?? Infinity, a.createdAt)); }
  for (const n of nodes) if (n.kind === "resource") n.createdAt = first.get(n.id) ?? 0;
  return { nodes, edges, groups };
}

/** The ids within `depth` steps of `start`, following edges both ways. Depth 0 is the node alone. */
export function neighbourhood(edges: GEdge[], start: string, depth: number): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of edges) { (adj.get(e.from) ?? adj.set(e.from, []).get(e.from)!).push(e.to); (adj.get(e.to) ?? adj.set(e.to, []).get(e.to)!).push(e.from); }
  const seen = new Set([start]); let edge = [start];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const id of edge) for (const n of adj.get(id) ?? []) if (!seen.has(n)) { seen.add(n); next.push(n); }
    edge = next;
  }
  return seen;
}

/** Radius of a node on screen, from how connected it is. */
export const radiusOf = (n: Pick<GNode, "kind" | "weight">, scale: number) => (n.kind === "resource" ? 8 + Math.min(n.weight, 6) * 0.8 : 17 + Math.min(n.weight, 8) * 2.2) * scale;

// ---------------------------------------------------------------------------------------------------------------------------------------
// Forces

export type Forces = { center: number; repel: number; link: number; distance: number; /** How strongly members of a section pull toward each other. */ group: number };
export const DEFAULT_FORCES: Forces = { center: 0.05, repel: 4200, link: 0.3, distance: 180, group: 0.6 };

export type SimNode = { id: string; x: number; y: number; vx: number; vy: number; r: number; fixed: boolean };

/** A deterministic start: nodes on a spiral, so the same data settles the same way every time. */
export function seedPositions(ids: string[], prior?: Map<string, { x: number; y: number }>): SimNode[] {
  return ids.map((id, i) => {
    const p = prior?.get(id); if (p) return { id, x: p.x, y: p.y, vx: 0, vy: 0, r: 20, fixed: false };
    const a = i * 2.399963, d = 40 * Math.sqrt(i + 1);
    return { id, x: Math.cos(a) * d, y: Math.sin(a) * d, vx: 0, vy: 0, r: 20, fixed: false };
  });
}

/**
 * One step of the simulation. Every pair of nodes pushes apart, every edge pulls its ends toward the chosen distance, and a weak pull toward the centre
 * keeps unconnected nodes from drifting away. Every force is scaled by `alpha`, which cools from 1 toward 0, so the layout settles and stays settled. Returns the largest speed.
 */
export function tick(nodes: SimNode[], edges: { a: number; b: number; w: number }[], f: Forces, alpha: number, groups?: number[]): number {
  const n = nodes.length;
  // Members of one section are drawn toward the middle of that section, so each section reads as a cluster that can be moved as one.
  if (groups && f.group > 0) {
    const sx = new Map<number, [number, number, number]>();
    for (let i = 0; i < n; i++) { const g = groups[i]; if (g < 0) continue; const e = sx.get(g) ?? [0, 0, 0]; e[0] += nodes[i].x; e[1] += nodes[i].y; e[2]++; sx.set(g, e); }
    for (let i = 0; i < n; i++) { const g = groups[i]; const e = g < 0 ? undefined : sx.get(g); if (!e || e[2] < 2) continue; nodes[i].vx += (e[0] / e[2] - nodes[i].x) * f.group * 0.05 * alpha; nodes[i].vy += (e[1] / e[2] - nodes[i].y) * f.group * 0.05 * alpha; }
  }
  for (let i = 0; i < n; i++) {
    const p = nodes[i];
    for (let j = i + 1; j < n; j++) {
      const q = nodes[j]; let dx = p.x - q.x, dy = p.y - q.y; let d2 = dx * dx + dy * dy;
      if (d2 < 0.01) { dx = (i - j) * 0.1; dy = 0.1; d2 = dx * dx + dy * dy; }
      const d = Math.sqrt(d2); const push = (f.repel * alpha) / d2; const ux = dx / d, uy = dy / d;
      p.vx += ux * push; p.vy += uy * push; q.vx -= ux * push; q.vy -= uy * push;
      // Nodes may not overlap, and a label needs room beside each one, so a pair is kept a fixed gap apart no matter how cool the layout is.
      const min = p.r + q.r + 30;
      if (d < min) { const move = (min - d) * 0.5; const ux2 = dx / d, uy2 = dy / d; if (!p.fixed) { p.x += ux2 * move; p.y += uy2 * move; } if (!q.fixed) { q.x -= ux2 * move; q.y -= uy2 * move; } }
    }
  }
  // Two sections may not overlap either: each is a circle around its members (the same circle the canvas draws), and a pair of circles is pushed apart as a whole.
  if (groups && f.group > 0) {
    const gs = new Map<number, number[]>();
    for (let i = 0; i < n; i++) { const g = groups[i]; if (g < 0) continue; const l = gs.get(g); if (l) l.push(i); else gs.set(g, [i]); }
    const cs = [...gs.values()].filter((m) => m.length >= 2).map((m) => {
      const cx = m.reduce((t, i) => t + nodes[i].x, 0) / m.length, cy = m.reduce((t, i) => t + nodes[i].y, 0) / m.length;
      return { m, cx, cy, r: Math.max(...m.map((i) => Math.hypot(nodes[i].x - cx, nodes[i].y - cy) + nodes[i].r)) + 38 };
    });
    for (let a = 0; a < cs.length; a++) for (let b = a + 1; b < cs.length; b++) {
      const A = cs[a], B = cs[b]; let dx = A.cx - B.cx, dy = A.cy - B.cy; let d = Math.hypot(dx, dy); if (d < 0.01) { dx = 1; dy = 0.3; d = Math.hypot(dx, dy); }
      const min = A.r + B.r + 28; if (d >= min) continue;
      const move = (min - d) * 0.22; const ux = dx / d, uy = dy / d;
      const aFixed = A.m.every((i) => nodes[i].fixed), bFixed = B.m.every((i) => nodes[i].fixed); if (aFixed && bFixed) continue;
      const wa = bFixed ? 1 : aFixed ? 0 : 0.5, wb = aFixed ? 1 : bFixed ? 0 : 0.5;
      for (const i of A.m) if (!nodes[i].fixed) { nodes[i].x += ux * move * wa * 2; nodes[i].y += uy * move * wa * 2; }
      for (const i of B.m) if (!nodes[i].fixed) { nodes[i].x -= ux * move * wb * 2; nodes[i].y -= uy * move * wb * 2; }
    }
  }
  for (const e of edges) {
    const p = nodes[e.a], q = nodes[e.b]; const dx = q.x - p.x, dy = q.y - p.y; const d = Math.hypot(dx, dy) || 1;
    const pull = (d - f.distance) * f.link * 0.05 * e.w * alpha;
    const ux = dx / d, uy = dy / d; p.vx += ux * pull; p.vy += uy * pull; q.vx -= ux * pull; q.vy -= uy * pull;
  }
  let fastest = 0;
  for (const p of nodes) {
    p.vx -= p.x * f.center * 0.05 * alpha; p.vy -= p.y * f.center * 0.05 * alpha;
    if (p.fixed) { p.vx = 0; p.vy = 0; continue; }
    p.vx *= 0.78; p.vy *= 0.78; const s = Math.hypot(p.vx, p.vy); if (s > 40) { p.vx = (p.vx / s) * 40; p.vy = (p.vy / s) * 40; }
    p.x += p.vx; p.y += p.vy; fastest = Math.max(fastest, s);
  }
  return fastest;
}
