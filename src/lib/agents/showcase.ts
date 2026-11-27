/** How networks and meshes are drawn on the Constellation: a colour for each, and the outline of a zone around the agents that belong to it. */
export type XY = { x: number; y: number };
export const NET_COLORS = ["#2563EB", "#0E9F77", "#7C3AED", "#D97706", "#DB2777", "#0891B2"];
export const MESH_COLORS = ["#E11D48", "#9333EA", "#EA580C", "#0D9488", "#4F46E5", "#65A30D"];
export const colorAt = (palette: string[], i: number) => palette[((i % palette.length) + palette.length) % palette.length];

/** A rounded outline around some points, as an SVG path: the convex hull of a ring of points around each one. */
export function zonePath(points: XY[], pad: number): string {
  if (!points.length) return "";
  const ring: [number, number][] = [];
  for (const p of points) for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; ring.push([Math.round((p.x + Math.cos(a) * pad) * 10) / 10, Math.round((p.y + Math.sin(a) * pad) * 10) / 10]); }
  ring.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (pts: [number, number][]) => { const h: [number, number][] = []; for (const p of pts) { while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop(); h.push(p); } h.pop(); return h; };
  const hull = [...half(ring), ...half([...ring].reverse())];
  return "M" + hull.map((p) => `${p[0]} ${p[1]}`).join("L") + "Z";
}
export const centroid = (points: XY[]): XY => ({ x: points.reduce((s, p) => s + p.x, 0) / (points.length || 1), y: points.reduce((s, p) => s + p.y, 0) / (points.length || 1) });
/** A line from one agent to another, shortened so it starts and ends at the edge of each, and bowed so two opposite lines do not sit on each other. */
export function handoffPath(a: XY, b: XY, r: number, bow: number): { d: string; mid: XY } {
  const dx = b.x - a.x, dy = b.y - a.y; const len = Math.hypot(dx, dy) || 1; const ux = dx / len, uy = dy / len;
  const s = { x: a.x + ux * r, y: a.y + uy * r }, e = { x: b.x - ux * (r + 6), y: b.y - uy * (r + 6) };
  const c = { x: (s.x + e.x) / 2 - uy * bow, y: (s.y + e.y) / 2 + ux * bow };
  return { d: `M ${s.x} ${s.y} Q ${c.x} ${c.y} ${e.x} ${e.y}`, mid: { x: 0.25 * s.x + 0.5 * c.x + 0.25 * e.x, y: 0.25 * s.y + 0.5 * c.y + 0.25 * e.y } };
}

/** The shape of a network on the canvas: a bubble around each member, joined along the shortest tree between them, so a network that spans departments reads as a chain and not a wide band. */
export function zoneParts(points: XY[]): { edges: [XY, XY][]; top: XY } {
  const edges: [XY, XY][] = []; const inTree = new Set<number>([0]);
  while (points.length > 1 && inTree.size < points.length) {
    let best: [number, number] | null = null; let bd = Infinity;
    inTree.forEach((i) => points.forEach((q, j) => { if (inTree.has(j)) return; const d = Math.hypot(q.x - points[i].x, q.y - points[i].y); if (d < bd) { bd = d; best = [i, j]; } }));
    if (!best) break; const [i, j] = best as [number, number]; edges.push([points[i], points[j]]); inTree.add(j);
  }
  const top = points.reduce((t, p) => (p.y > t.y ? p : t), points[0] ?? { x: 0, y: 0 }); // the lowest member: the name sits under the bubble, clear of the department title above
  return { edges, top };
}
