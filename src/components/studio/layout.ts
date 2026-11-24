import { NODE_H, NODE_W, type EdgeType, type GEdge, type Graph } from "./types";

/** Default edge type derived from the node kinds an edge connects. */
export function defaultEdgeType(fromKind: string, toKind: string): EdgeType {
  if (toKind === "reject") return "deny";
  if (fromKind === "failover" || toKind === "failover") return "failover";
  if (["meter", "audit", "kafka", "otel", "search_index"].includes(toKind) || toKind.startsWith("notify_")) return "async";
  if (fromKind === "deny_model" || fromKind === "deny_capability") return "deny";
  if (fromKind === "allow_model" || fromKind === "allow_hours") return "allow";
  if (fromKind === "limit_tokens" || fromKind === "limit_cost" || fromKind === "on_breach") return "limit";
  return "flow";
}

/**
 * Layered left-to-right layout: column = longest path from a source, rows ordered by the
 * barycenter of predecessors to reduce crossings. Cycles are tolerated (back edges ignored).
 */
export function autoLayout(g: Graph, gapX = 72, gapY = 34): Graph {
  const ids = g.nodes.map((n) => n.id);
  const idx = new Map(ids.map((id, i) => [id, i]));
  const incoming = new Map<string, string[]>(ids.map((id) => [id, []]));
  g.edges.forEach((e) => {
    if (idx.has(e.from) && idx.has(e.to) && e.from !== e.to) incoming.get(e.to)!.push(e.from);
  });

  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const dfs = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const d = Math.max(-1, ...incoming.get(id)!.map(dfs)) + 1;
    visiting.delete(id);
    depth.set(id, d);
    return d;
  };
  ids.forEach(dfs);

  const cols = new Map<number, string[]>();
  ids.forEach((id) => {
    const d = depth.get(id)!;
    cols.set(d, [...(cols.get(d) || []), id]);
  });

  const row = new Map<string, number>();
  const maxCol = Math.max(0, ...cols.keys());
  for (let c = 0; c <= maxCol; c++) {
    const list = cols.get(c) || [];
    const key = (id: string) => {
      const ps = incoming.get(id)!.filter((p) => row.has(p));
      return ps.length ? ps.reduce((s, p) => s + row.get(p)!, 0) / ps.length : idx.get(id)! / 1000;
    };
    list.sort((a, b) => key(a) - key(b) || idx.get(a)! - idx.get(b)!);
    list.forEach((id, i) => row.set(id, i));
  }
  const tallest = Math.max(1, ...[...cols.values()].map((l) => l.length));

  const nodes = g.nodes.map((n) => {
    const c = depth.get(n.id)!;
    const list = cols.get(c)!;
    const offset = ((tallest - list.length) * (NODE_H + gapY)) / 2;
    return { ...n, x: 48 + c * (NODE_W + gapX), y: 48 + offset + row.get(n.id)! * (NODE_H + gapY) };
  });
  return { nodes, edges: g.edges };
}

export function edgePath(ax: number, ay: number, bx: number, by: number) {
  const dx = Math.max(60, Math.abs(bx - ax) * 0.5);
  return `M ${ax} ${ay} C ${ax + dx} ${ay}, ${bx - dx} ${by}, ${bx} ${by}`;
}

export function portOut(n: { x: number; y: number }) {
  return { x: n.x + NODE_W, y: n.y + NODE_H / 2 };
}
export function portIn(n: { x: number; y: number }) {
  return { x: n.x, y: n.y + NODE_H / 2 };
}

export function newId(prefix: string, existing: { id: string }[]) {
  let i = existing.length + 1;
  while (existing.some((e) => e.id === `${prefix}_${i}`)) i++;
  return `${prefix}_${i}`;
}

export function mkEdge(g: Graph, from: string, to: string, type?: EdgeType): GEdge {
  const f = g.nodes.find((n) => n.id === from)!;
  const t = g.nodes.find((n) => n.id === to)!;
  return { id: `e_${from}_${to}_${g.edges.length + 1}`, from, to, type: type ?? defaultEdgeType(f.kind, t.kind) };
}
