/** The PDF writer. Draws the report page by page with jsPDF: header with the logo, footer with the document id and page number. */
import type { Figure } from "./charts";
import { LEGAL_NOTICE, RULES_OF_USE } from "./legal";
import type { ReportModel, Scalar } from "./model";
import { LOGO_RATIO, svgToPng } from "./raster";
import type { Png } from "./raster";

const INK: [number, number, number] = [7, 25, 30], MUTED: [number, number, number] = [91, 107, 112], RULE: [number, number, number] = [201, 212, 214], SOFT: [number, number, number] = [244, 248, 248], ACCENT: [number, number, number] = [2, 245, 161];
/** jsPDF's built in fonts cover Latin-1 only. */
const safe = (s: string | number) => String(s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/→/g, "->").replace(/…/g, "...").replace(/[∑Σ]/g, "S").replace(/[^\x09\x0A\x20-\x7E -ÿ]/g, "?");

export async function reportPdf(m: ReportModel, figures: Figure[], logo: Png): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const PW = 595.28, PH = 841.89, ML = 54, MR = 54, MT = 82, MB = 60, CW = PW - ML - MR;
  let y = MT; let page = 1;
  const font = (style: "normal" | "bold" | "italic", size: number, color = INK) => { doc.setFont("helvetica", style); doc.setFontSize(size); doc.setTextColor(color[0], color[1], color[2]); };
  const lines = (s: string, w: number) => doc.splitTextToSize(safe(s), w) as string[];
  const header = () => { if (page === 1) return; doc.addImage(logo.dataUrl, "PNG", ML, 28, 22 * LOGO_RATIO, 22); font("normal", 8, MUTED); doc.text(safe(m.title), PW - MR, 38, { align: "right" }); doc.setDrawColor(...RULE); doc.setLineWidth(0.5); doc.line(ML, 58, PW - MR, 58); };
  const next = () => { doc.addPage(); page++; y = MT; header(); };
  const need = (h: number) => { if (y + h > PH - MB) next(); };
  const h1 = (s: string, room = 150) => { need(room); y += 10; font("bold", 16); doc.text(safe(s), ML, y); y += 6; doc.setDrawColor(...ACCENT); doc.setLineWidth(2); doc.line(ML, y, ML + 40, y); y += 20; };
  const h2 = (s: string) => { need(40); y += 4; font("bold", 11.5); doc.text(safe(s), ML, y); y += 16; };
  const p = (s: string, size = 9.5, color = INK, indent = 0) => { font("normal", size, color); for (const l of lines(s, CW - indent)) { need(size + 5); doc.text(l, ML + indent, y); y += size + 4.2; } y += 3; };
  const bullet = (s: string, n?: number) => { font("normal", 9.5); const l = lines(s, CW - 16); need(l.length * 13.5); doc.text(n ? `${n}.` : "-", ML + 2, y); for (const t of l) { doc.text(t, ML + 16, y); y += 13.4; } y += 2; };

  /** A table with wrapped cells and a repeated header row. widths are shares of the content width. */
  const tbl = (head: string[], rows: (string | number)[][], widths: number[], o: { size?: number } = {}) => {
    const size = o.size ?? 8.5; const tot = widths.reduce((a, b) => a + b, 0); const w = widths.map((x) => (x / tot) * CW); const pad = 4;
    const drawHead = () => { font("bold", size, [242, 247, 246]); const hl = head.map((h, i) => lines(h, w[i] - 2 * pad)); const hh = Math.max(...hl.map((l) => l.length)) * (size + 2) + 8; doc.setFillColor(...INK); doc.rect(ML, y, CW, hh, "F"); let x = ML; hl.forEach((l, i) => { l.forEach((t, k) => doc.text(t, x + pad, y + size + 2 + k * (size + 2))); x += w[i]; }); y += hh; };
    need(size + 40); drawHead(); let zebra = false;
    for (const r of rows) {
      const cells = r.map((c, i) => { font(i === 0 ? "bold" : "normal", size); return lines(String(c), w[i] - 2 * pad - 2); }); const h = Math.max(...cells.map((c) => c.length)) * (size + 3) + 8;
      if (y + h > PH - MB) { next(); drawHead(); }
      if (zebra) { doc.setFillColor(...SOFT); doc.rect(ML, y, CW, h, "F"); } zebra = !zebra;
      let x = ML; cells.forEach((c, i) => { font(i === 0 ? "bold" : "normal", size); c.forEach((t, k) => doc.text(t, x + pad, y + size + 2 + k * (size + 3))); x += w[i]; });
      doc.setDrawColor(...RULE); doc.setLineWidth(0.3); doc.line(ML, y + h, ML + CW, y + h); y += h;
    }
    y += 12;
  };
  const kv = (rows: Scalar[]) => tbl(["Item", "Value"], rows.map((r) => [r.label, r.value]), [30, 70], { size: 9 });
  const fig = async (f: Figure | undefined, maxH = 330) => {
    if (!f) return; const png = await svgToPng(f.svg, f.width, f.height, 2.5); const w = Math.min(CW, f.width); const h = Math.min(maxH, (w * f.height) / f.width); const ww = (h * f.width) / f.height;
    need(h + 44); font("bold", 9.5); doc.text(safe(f.title), ML, y); y += 8; doc.addImage(png.dataUrl, "PNG", ML, y, ww, h); y += h + 10; font("italic", 8, MUTED); for (const l of lines(f.caption, CW)) { doc.text(l, ML, y); y += 10.5; } y += 10;
  };
  const F = (id: string) => figures.find((f) => f.id === id);

  // ---------- cover
  doc.addImage(logo.dataUrl, "PNG", ML, 70, 150 * 1, (150 / LOGO_RATIO));
  doc.setFillColor(...ACCENT); doc.rect(ML, 150, 56, 4, "F");
  font("bold", 11, MUTED); doc.text("TOKENER REFINERY", ML, 190); font("bold", 26, INK); const tl = lines(m.title, CW); tl.forEach((l, i) => doc.text(l, ML, 222 + i * 32));
  font("normal", 12, MUTED); doc.text("Engineering report: data cleaning and feature engineering", ML, 222 + tl.length * 32 + 6);
  y = 222 + tl.length * 32 + 44;
  const cover: Scalar[] = [{ label: "Document ID", value: m.documentId }, { label: "Version", value: m.version }, { label: "Classification", value: m.classification }, { label: "Organisation", value: m.organisation }, ...m.people, ...m.timing.slice(0, 3)];
  const w1 = 150; cover.forEach((r) => { font("bold", 9, MUTED); doc.text(safe(r.label).toUpperCase(), ML, y); font("normal", 10.5); doc.text(safe(r.value), ML + w1, y); doc.setDrawColor(...RULE); doc.setLineWidth(0.4); doc.line(ML, y + 6, PW - MR, y + 6); y += 24; });
  if (m.sampleWorkspace) { y += 8; font("italic", 9, MUTED); for (const l of lines("Sample workspace: this run was simulated. Figures are illustrative.", CW)) { doc.text(l, ML, y); y += 12; } }
  font("normal", 8, MUTED); doc.text(safe(`Generated ${m.generatedAt}`), ML, PH - 70);
  next();

  // ---------- contents
  h1("Contents"); ["1. Document control", "2. Executive summary", "3. Input dataset", "4. Pipeline and strategy", "5. Data quality: before and after", "6. Stream lineage", "7. ML readiness", "8. Feature dictionary", "9. Measurement basis", "10. Legal notice and rules of use"].forEach((s) => p(s, 10.5));

  h1("1. Document control"); h2("Authors and responsibilities"); kv(m.people); h2("Timing"); kv(m.timing);
  h1("2. Executive summary"); m.summary.forEach((s) => p(s, 10));
  // headline tiles
  need(70); const tw = CW / m.headline.length; m.headline.forEach((h, i) => { const x = ML + i * tw; doc.setFillColor(...SOFT); doc.setDrawColor(...RULE); doc.rect(x + 2, y, tw - 4, 52, "FD"); doc.setFillColor(...ACCENT); doc.rect(x + 2, y, 3, 52, "F"); font("normal", 7.5, MUTED); doc.text(safe(h.label).toUpperCase(), x + 12, y + 16); font("bold", 14); doc.text(safe(h.value), x + 12, y + 38); }); y += 70;
  await fig(F("dimensions"), 240);

  h1("3. Input dataset"); kv(m.input.rows); h2("Input columns"); tbl(["Column", "Type", "Role", "Empty %", "Distinct", "Personal data"], m.input.columns.map((c) => [c.name, c.type, c.role, c.nullPct, c.distinct, c.pii ? "yes" : "no"]), [28, 14, 14, 12, 12, 14]);

  h1("4. Pipeline and strategy"); kv(m.pipeline.rows); h2("Strategy"); m.pipeline.strategy.forEach((s) => bullet(s));
  h2("Cleaning operators"); tbl(["#", "Operator", "What it does here", "Rows in", "Rows out", "Changed", "Rejected", "Score"], m.pipeline.steps.map((s) => [s.n, `${s.label}\n(${s.group})`, s.what, s.rowsIn.toLocaleString("en-US"), s.rowsOut.toLocaleString("en-US"), s.changed.toLocaleString("en-US"), s.rejected.toLocaleString("en-US"), s.qualityAfter]), [4, 17, 29, 10, 10, 10, 10, 6], { size: 8 });
  m.pipeline.steps.filter((s) => s.warning || s.error || s.note).forEach((s) => p(`Step ${s.n}: ${[s.note, s.warning && `warning: ${s.warning}`, s.error && `error: ${s.error}`].filter(Boolean).join("; ")}`, 9, MUTED));
  if (m.stepsTotals.rejectReasons.length) { h2("Rejected rows"); tbl(["Reason", "Step", "Rows"], m.stepsTotals.rejectReasons.map((r) => [r.reason, r.step, r.count.toLocaleString("en-US")]), [50, 35, 15]); }
  await fig(F("work"), 300);

  h1("5. Data quality: before and after"); p(m.quality.formula, 9.5);
  tbl(["Dimension", "Weight", "Before", "After", "Change", "Meaning"], m.quality.dimensions.map((d) => [d.label, `${d.weight}%`, d.before, d.after, `${d.after - d.before >= 0 ? "+" : ""}${Math.round((d.after - d.before) * 10) / 10}`, d.meaning]), [18, 9, 9, 9, 9, 46]);
  await fig(F("progression"), 240); h2("Further measures"); kv(m.quality.extra);
  if (m.sensor) { h2("Sensor data quality"); p(`Time column ${m.sensor.timeColumn}${m.sensor.entityColumn ? `, machine column ${m.sensor.entityColumn}` : ""}. Sensor quality moved from ${m.sensor.scoreBefore} to ${m.sensor.scoreAfter ?? "n/a"} out of 100. ${m.sensor.formula}`, 9.5); tbl(m.sensor.head, m.sensor.rows, [15, 17, 8, 8, 13, 13, 13, 13], { size: 7.5 }); if (m.sensor.note) p(m.sensor.note, 9.5); m.sensor.recommendations.forEach((r) => bullet(r)); p(m.sensor.basis, 8.5, MUTED); }
  await fig(F("missing"), 340); await fig(F("histogram"), 230);
  h2("Column by column"); tbl(["Column", "Type", "Empty % before", "Empty % after", "Untidy % before", "Untidy % after", "Status"], m.quality.columns.map((c) => [c.name, c.type, c.nullBefore ?? "-", c.nullAfter ?? "-", c.untidyBefore ?? "-", c.untidyAfter ?? "-", c.status]), [22, 11, 12, 12, 12, 12, 11], { size: 8 });

  h1("6. Stream lineage", 330); await fig(F("lineage"), 520);
  if (m.outputs.length) { h2("Outputs"); tbl(["Name", "Kind", "Target", "Format"], m.outputs.map((o) => [o.name, o.kind, o.target, o.format]), [20, 12, 53, 15]); }

  h1("7. ML readiness"); p(`Readiness: ${m.readiness.score} / 100. ${m.readiness.basis}`, 10);
  tbl(["Check", "Result", "Detail"], m.readiness.checks.map((c) => [c.label, c.status.toUpperCase(), c.detail]), [34, 10, 56]);

  h1("8. Feature dictionary"); p(`${m.features.length} columns. The same dictionary, with the field headings and code-ready groups, is delivered as a separate Markdown file.`, 9.5);
  tbl(["Field", "Type", "Role", "Empty %", "Distinct", "Description and guidance"], m.features.map((f) => [f.name, f.type, f.role, f.nullPct, f.distinct, `${f.description}\n${f.guidance}`]), [18, 9, 10, 8, 8, 47], { size: 8 });

  h1("9. Measurement basis"); m.basis.forEach((b) => bullet(b));
  h1("10. Legal notice and rules of use"); h2("Legal notice"); LEGAL_NOTICE.forEach((l, i) => bullet(l, i + 1)); h2("Rules of use"); RULES_OF_USE.forEach((l, i) => bullet(l, i + 1));

  // ---------- footers, once the page count is known
  const total = doc.getNumberOfPages();
  for (let i = 2; i <= total; i++) { doc.setPage(i); doc.setDrawColor(...RULE); doc.setLineWidth(0.5); doc.line(ML, PH - 42, PW - MR, PH - 42); font("normal", 8, MUTED); doc.text(safe(`${m.documentId}  |  ${m.classification}`), ML, PH - 28); doc.text(`Page ${i} of ${total}`, PW - MR, PH - 28, { align: "right" }); }
  doc.setProperties({ title: safe(m.title), subject: "Data preparation report", author: safe(m.people[0].value), creator: "Tokener Refinery" });
  return doc.output("blob");
}
