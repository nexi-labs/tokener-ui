/** SVG charts and the lineage diagram for the report. Plain strings, white background, print safe, so the same picture goes into Word and PDF as PNG. */
import type { LineageNode, ReportModel } from "./model";

export type Figure = { id: string; title: string; caption: string; svg: string; width: number; height: number };

const INK = "#07191E", MUTED = "#5B6B70", GRID = "#E3E9EA", BEFORE = "#9AA9AE", AFTER = "#02F5A1", AFTER_EDGE = "#0B8F63", FONT = "Helvetica, Arial, sans-serif";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const wrap = (w: number, h: number, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${FONT}"><rect width="${w}" height="${h}" fill="#FFFFFF"/>${body}</svg>`;
const t = (x: number, y: number, s: string, o: { size?: number; fill?: string; anchor?: string; weight?: number } = {}) => `<text x="${x}" y="${y}" font-size="${o.size ?? 11}" fill="${o.fill ?? INK}" text-anchor="${o.anchor ?? "start"}" font-weight="${o.weight ?? 400}">${esc(s)}</text>`;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}...` : s);
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const legend = (x: number, y: number) => `<rect x="${x}" y="${y - 9}" width="10" height="10" fill="${BEFORE}"/>${t(x + 15, y, "Before", { size: 10, fill: MUTED })}<rect x="${x + 70}" y="${y - 9}" width="10" height="10" fill="${AFTER}" stroke="${AFTER_EDGE}" stroke-width="0.8"/>${t(x + 85, y, "After", { size: 10, fill: MUTED })}`;

/** Quality score and its four dimensions, before and after. */
export function dimensionsChart(m: ReportModel): Figure {
  const W = 760, H = 300, L = 150, R = 60, top = 52, rowH = 44;
  const plot = W - L - R; const dims = m.quality.dimensions;
  let b = legend(L, 24);
  [0, 25, 50, 75, 100].forEach((v) => { const x = L + (plot * v) / 100; b += `<line x1="${x}" y1="${top - 8}" x2="${x}" y2="${top + dims.length * rowH}" stroke="${GRID}"/>${t(x, top + dims.length * rowH + 16, String(v), { size: 9, fill: MUTED, anchor: "middle" })}`; });
  dims.forEach((d, i) => {
    const y = top + i * rowH;
    b += t(L - 10, y + 17, d.label, { anchor: "end", weight: d.key === "composite" ? 700 : 400, size: 12 });
    b += `<rect x="${L}" y="${y + 2}" width="${(plot * d.before) / 100}" height="13" fill="${BEFORE}"/>${t(L + (plot * d.before) / 100 + 6, y + 13, `${d.before}`, { size: 10, fill: MUTED })}`;
    b += `<rect x="${L}" y="${y + 18}" width="${(plot * d.after) / 100}" height="13" fill="${AFTER}" stroke="${AFTER_EDGE}" stroke-width="0.8"/>${t(L + (plot * d.after) / 100 + 6, y + 29, `${d.after}`, { size: 10, weight: 700 })}`;
  });
  return { id: "dimensions", title: "Quality score and dimensions, before and after", caption: "Each dimension is scored from 0 to 100. The quality score is their weighted sum.", svg: wrap(W, H, b), width: W, height: H };
}

/** Quality after each step: a line, so the step that helped most is visible. */
export function progressionChart(m: ReportModel): Figure {
  const W = 760, H = 280, L = 56, R = 24, T = 36, B = 54; const pts = m.quality.progression; const pw = W - L - R, ph = H - T - B;
  const lo = Math.max(0, Math.floor((Math.min(...pts.map((p) => p.score)) - 5) / 10) * 10), hi = Math.min(100, Math.ceil((Math.max(...pts.map((p) => p.score)) + 2) / 10) * 10 || 100);
  const x = (i: number) => L + (pts.length === 1 ? pw / 2 : (pw * i) / (pts.length - 1)); const y = (v: number) => T + ph - ((v - lo) / Math.max(1, hi - lo)) * ph;
  let b = t(L, 20, "Quality score after each step", { size: 11, fill: MUTED });
  for (let v = lo; v <= hi; v += (hi - lo) / 4 || 1) b += `<line x1="${L}" y1="${y(v)}" x2="${W - R}" y2="${y(v)}" stroke="${GRID}"/>${t(L - 8, y(v) + 3, String(Math.round(v)), { size: 9, fill: MUTED, anchor: "end" })}`;
  b += `<polyline fill="none" stroke="${AFTER_EDGE}" stroke-width="2" points="${pts.map((p, i) => `${x(i)},${y(p.score)}`).join(" ")}"/>`;
  pts.forEach((p, i) => { b += `<circle cx="${x(i)}" cy="${y(p.score)}" r="4" fill="${AFTER}" stroke="${AFTER_EDGE}"/>${t(x(i), y(p.score) - 9, String(p.score), { size: 10, anchor: "middle", weight: 700 })}${t(x(i), H - B + 18, p.label, { size: 10, fill: MUTED, anchor: "middle" })}`; });
  b += t(W / 2, H - 8, "Step number (Input is the raw dataset)", { size: 10, fill: MUTED, anchor: "middle" });
  return { id: "progression", title: "Quality score through the pipeline", caption: "The score is recomputed on the sample after every step.", svg: wrap(W, H, b), width: W, height: H };
}

/** Missing values per column that had gaps before or after. */
export function missingChart(m: ReportModel): Figure | null {
  const cols = m.quality.columns.filter((c) => (c.nullBefore ?? 0) > 0 || (c.nullAfter ?? 0) > 0).slice(0, 10);
  if (!cols.length) return null;
  const W = 760, L = 170, R = 60, top = 44, rowH = 32, H = top + cols.length * rowH + 24; const plot = W - L - R;
  const max = Math.max(5, ...cols.map((c) => Math.max(c.nullBefore ?? 0, c.nullAfter ?? 0))); const sx = (v: number) => (plot * v) / max;
  let b = legend(L, 22);
  cols.forEach((c, i) => {
    const y = top + i * rowH;
    b += t(L - 10, y + 15, clip(c.name, 22), { anchor: "end", size: 11 });
    if (c.nullBefore !== null) b += `<rect x="${L}" y="${y + 1}" width="${sx(c.nullBefore)}" height="10" fill="${BEFORE}"/>${t(L + sx(c.nullBefore) + 5, y + 10, `${c.nullBefore}%`, { size: 9, fill: MUTED })}`;
    if (c.nullAfter !== null) b += `<rect x="${L}" y="${y + 14}" width="${sx(c.nullAfter)}" height="10" fill="${AFTER}" stroke="${AFTER_EDGE}" stroke-width="0.8"/>${t(L + sx(c.nullAfter) + 5, y + 23, `${c.nullAfter}%`, { size: 9, weight: 700 })}`;
  });
  return { id: "missing", title: "Missing values by column", caption: "Share of empty cells in each column that had gaps, before and after.", svg: wrap(W, H, b), width: W, height: H };
}

/** Cells changed per step, to show where the work happened. */
export function workChart(m: ReportModel): Figure | null {
  const s = m.pipeline.steps; if (!s.length) return null;
  const W = 760, L = 230, R = 70, top = 28, rowH = 30, H = top + s.length * rowH + 16; const plot = W - L - R; const max = Math.max(1, ...s.map((x) => x.changed + x.rejected));
  let b = t(L, 16, "Cells changed", { size: 10, fill: MUTED }) + `<rect x="${L + 90}" y="8" width="10" height="10" fill="#E5A63A"/>` + t(L + 105, 16, "Rows rejected", { size: 10, fill: MUTED });
  s.forEach((x, i) => {
    const y = top + i * rowH; const cw = (plot * x.changed) / max, rw = (plot * x.rejected) / max;
    b += t(L - 10, y + 14, clip(`${x.n}. ${x.label}`, 34), { anchor: "end", size: 11 });
    b += `<rect x="${L}" y="${y + 3}" width="${Math.max(cw, 0)}" height="14" fill="${AFTER}" stroke="${AFTER_EDGE}" stroke-width="0.8"/>`;
    if (rw > 0) b += `<rect x="${L + cw}" y="${y + 3}" width="${rw}" height="14" fill="#E5A63A"/>`;
    b += t(L + cw + rw + 6, y + 14, fmt(x.changed + x.rejected), { size: 10, fill: MUTED });
  });
  return { id: "work", title: "Where the work happened", caption: "Cells rewritten and rows rejected by each step, scaled to the full input.", svg: wrap(W, H, b), width: W, height: H };
}

/** Distribution of the first numeric column, before and after. */
export function histogramChart(m: ReportModel): Figure | null {
  const h = m.histogram; if (!h) return null;
  const W = 760, H = 250; const panel = (x0: number, label: string, data: { label: string; count: number }[], fill: string, stroke: string) => {
    const pw = 320, ph = 150, top = 52; const max = Math.max(1, ...data.map((d) => d.count)); const bw = pw / data.length;
    let s = t(x0, 36, label, { size: 12, weight: 700 }) + `<line x1="${x0}" y1="${top + ph}" x2="${x0 + pw}" y2="${top + ph}" stroke="${INK}"/>`;
    data.forEach((d, i) => { const bh = (ph * d.count) / max; s += `<rect x="${x0 + i * bw + 1}" y="${top + ph - bh}" width="${Math.max(1, bw - 2)}" height="${bh}" fill="${fill}" stroke="${stroke}" stroke-width="0.6"/>`; });
    s += t(x0, top + ph + 16, clip(data[0]?.label ?? "", 18), { size: 9, fill: MUTED }) + t(x0 + pw, top + ph + 16, clip(data[data.length - 1]?.label ?? "", 18), { size: 9, fill: MUTED, anchor: "end" });
    return s;
  };
  const b = t(40, 18, `Distribution of ${h.column}`, { size: 11, fill: MUTED }) + panel(40, "Before", h.before, BEFORE, BEFORE) + panel(400, "After", h.after, AFTER, AFTER_EDGE);
  return { id: "histogram", title: `Distribution of ${h.column}, before and after`, caption: "Bars are buckets of values. Each panel uses its own scale, so compare the shape and the spread, not the bar heights.", svg: wrap(W, H, b), width: W, height: H };
}

/** The lineage diagram: source, every step in order with its row counts, and the outputs. It wraps into rows of four. */
export function lineageDiagram(m: ReportModel): Figure {
  const nodes = m.lineage; const per = 4, nw = 168, nh = 92, gx = 30, gy = 46, pad = 24;
  const cols = Math.min(per, nodes.length); const W = pad * 2 + cols * nw + (cols - 1) * gx; const rows = Math.ceil(nodes.length / per); const H = pad * 2 + 30 + rows * nh + (rows - 1) * gy;
  const pos = (i: number) => ({ x: pad + (i % per) * (nw + gx), y: pad + 30 + Math.floor(i / per) * (nh + gy) });
  let b = `<defs><marker id="ar" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="${MUTED}"/></marker></defs>` + t(pad, 22, "Data flow, left to right, with rows in and out of each step", { size: 11, fill: MUTED });
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = pos(i), c = pos(i + 1);
    if (Math.floor(i / per) === Math.floor((i + 1) / per)) b += `<line x1="${a.x + nw}" y1="${a.y + nh / 2}" x2="${c.x - 2}" y2="${c.y + nh / 2}" stroke="${MUTED}" stroke-width="1.4" marker-end="url(#ar)"/>`;
    else { const my = a.y + nh + gy / 2; b += `<path d="M${a.x + nw / 2},${a.y + nh} V${my} H${c.x + nw / 2} V${c.y - 2}" fill="none" stroke="${MUTED}" stroke-width="1.4" marker-end="url(#ar)"/>`; }
  }
  nodes.forEach((n: LineageNode, i) => {
    const p = pos(i); const dark = n.kind === "source"; const out = n.kind === "output";
    const fill = dark ? INK : out ? AFTER : "#F4F8F8"; const stroke = out ? AFTER_EDGE : dark ? INK : "#C9D4D6"; const ink = dark ? "#F2F7F6" : INK; const sub = dark ? "#9FB3B8" : out ? "#0A3B2B" : MUTED;
    b += `<rect x="${p.x}" y="${p.y}" width="${nw}" height="${nh}" rx="6" fill="${fill}" stroke="${stroke}"/>` + t(p.x + 10, p.y + 20, clip(n.title, 24), { size: 11.5, weight: 700, fill: ink });
    n.lines.forEach((l, k) => { b += t(p.x + 10, p.y + 40 + k * 16, clip(l, 30), { size: k === 0 ? 10 : 10, fill: k === 0 ? ink : sub }); });
    b += t(p.x + nw - 8, p.y + nh - 8, dark ? "SOURCE" : out ? "OUTPUT" : "", { size: 8, fill: sub, anchor: "end", weight: 700 });
  });
  return { id: "lineage", title: "Stream lineage of the cleaning pipeline", caption: "Each box is one stage. Row counts are those the run reported or, in the sample workspace, those of the sample scaled to the input.", svg: wrap(W, H, b), width: W, height: H };
}

export function allFigures(m: ReportModel): Figure[] {
  return [lineageDiagram(m), dimensionsChart(m), progressionChart(m), missingChart(m), workChart(m), histogramChart(m)].filter((f): f is Figure => !!f);
}
