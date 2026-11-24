/** The Word writer. Builds a .docx with the docx package: logo in the header, document id and page numbers in the footer, real heading styles and tables. */
import { AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, ImageRun, Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType } from "docx";
import type { Figure } from "./charts";
import { LEGAL_NOTICE, RULES_OF_USE } from "./legal";
import type { ReportModel, Scalar } from "./model";
import { LOGO_RATIO, svgToPng } from "./raster";
import type { Png } from "./raster";

const INK = "07191E", MUTED = "5B6B70", RULE = "C9D4D6", SOFT = "F4F8F8", ACCENT = "02F5A1", FONT = "Calibri";

export async function reportDocx(m: ReportModel, figures: Figure[], logo: Png): Promise<Blob> {
  const run = (text: string, o: { bold?: boolean; size?: number; color?: string; italics?: boolean } = {}) => new TextRun({ text, font: FONT, bold: o.bold, size: (o.size ?? 10.5) * 2, color: o.color ?? INK, italics: o.italics });
  const para = (text: string, o: { bold?: boolean; size?: number; color?: string; italics?: boolean; after?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) => new Paragraph({ children: [run(text, o)], spacing: { after: (o.after ?? 8) * 20, line: 280 }, alignment: o.align });
  const h1 = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 160 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 4 } }, children: [new TextRun({ text, font: FONT, bold: true, size: 32, color: INK })] });
  const h2 = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 100 }, children: [new TextRun({ text, font: FONT, bold: true, size: 24, color: INK })] });
  const bullet = (text: string) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 80, line: 270 }, children: [run(text)] });
  const numbered = (text: string, i: number) => new Paragraph({ spacing: { after: 80, line: 270 }, indent: { left: 360, hanging: 360 }, children: [run(`${i}.  ${text}`)] });
  const cell = (text: string, w: number, o: { head?: boolean; shade?: boolean; bold?: boolean } = {}) => new TableCell({
    width: { size: w, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 90, right: 90 },
    shading: o.head ? { type: ShadingType.CLEAR, fill: INK, color: "auto" } : o.shade ? { type: ShadingType.CLEAR, fill: SOFT, color: "auto" } : undefined,
    borders: { top: { style: BorderStyle.SINGLE, size: 2, color: RULE }, bottom: { style: BorderStyle.SINGLE, size: 2, color: RULE }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } },
    children: String(text).split("\n").map((l) => new Paragraph({ children: [run(l, { size: 9, bold: o.head || o.bold, color: o.head ? "F2F7F6" : INK })] })),
  });
  const tbl = (head: string[], rows: (string | number)[][], widths: number[]) => {
    const tot = widths.reduce((a, b) => a + b, 0); const w = widths.map((x) => Math.round((x / tot) * 9700));
    return new Table({ width: { size: 9700, type: WidthType.DXA }, columnWidths: w, layout: TableLayoutType.FIXED, rows: [new TableRow({ tableHeader: true, cantSplit: true, children: head.map((h, i) => cell(h, w[i], { head: true })) }), ...rows.map((r, ri) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(String(c), w[i], { shade: ri % 2 === 1, bold: i === 0 })) }))] });
  };
  const kv = (rows: Scalar[]) => tbl(["Item", "Value"], rows.map((r) => [r.label, r.value]), [30, 70]);
  const gap = () => new Paragraph({ spacing: { after: 120 }, children: [] });
  const img = async (f: Figure | undefined): Promise<(Paragraph)[]> => {
    if (!f) return []; const png = await svgToPng(f.svg, f.width, f.height, 2.5); const w = 600, h = Math.round((w * f.height) / f.width);
    return [new Paragraph({ keepNext: true, spacing: { before: 160, after: 60 }, children: [run(f.title, { bold: true, size: 10.5 })] }), new Paragraph({ spacing: { after: 60 }, children: [new ImageRun({ type: "png", data: png.data, transformation: { width: w, height: h }, altText: { title: f.title, description: f.caption, name: f.id } })] }), para(f.caption, { size: 8.5, color: MUTED, italics: true, after: 12 })];
  };
  const F = (id: string) => figures.find((f) => f.id === id);
  const logoRun = (h: number) => new ImageRun({ type: "png", data: logo.data, transformation: { width: Math.round(h * LOGO_RATIO), height: h }, altText: { title: "Tokener", description: "Tokener logo", name: "logo" } });

  const cover: Scalar[] = [{ label: "Document ID", value: m.documentId }, { label: "Version", value: m.version }, { label: "Classification", value: m.classification }, { label: "Organisation", value: m.organisation }, ...m.people, ...m.timing];
  const children: (Paragraph | Table)[] = [
    new Paragraph({ spacing: { before: 600, after: 600 }, children: [logoRun(64)] }),
    new Paragraph({ spacing: { after: 100 }, border: { top: { style: BorderStyle.SINGLE, size: 24, color: ACCENT, space: 8 } }, children: [run("TOKENER REFINERY", { bold: true, size: 11, color: MUTED })] }),
    new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: m.title, font: FONT, bold: true, size: 56, color: INK })] }),
    para("Engineering report: data cleaning and feature engineering", { size: 14, color: MUTED, after: 40 }),
    ...(m.sampleWorkspace ? [para("Sample workspace: this run was simulated. Figures are illustrative.", { italics: true, color: MUTED, size: 10 })] : []),
    gap(), kv(cover),
    new Paragraph({ pageBreakBefore: true, children: [] }),
    h1("Contents"), ...["1. Document control", "2. Executive summary", "3. Input dataset", "4. Pipeline and strategy", "5. Data quality: before and after", "6. Stream lineage", "7. ML readiness", "8. Feature dictionary", "9. Measurement basis", "10. Legal notice and rules of use"].map((s) => para(s)),
    h1("1. Document control"), h2("Authors and responsibilities"), kv(m.people), h2("Timing"), kv(m.timing),
    h1("2. Executive summary"), ...m.summary.map((s) => para(s)), gap(), tbl(m.headline.map((h) => h.label), [m.headline.map((h) => h.value)], m.headline.map(() => 1)), ...(await img(F("dimensions"))),
    h1("3. Input dataset"), kv(m.input.rows), h2("Input columns"), tbl(["Column", "Type", "Role", "Empty %", "Distinct", "Personal data"], m.input.columns.map((c) => [c.name, c.type, c.role, c.nullPct, c.distinct, c.pii ? "yes" : "no"]), [28, 14, 14, 12, 12, 14]),
    h1("4. Pipeline and strategy"), kv(m.pipeline.rows), h2("Strategy"), ...m.pipeline.strategy.map(bullet), h2("Cleaning operators"),
    tbl(["#", "Operator", "What it does here", "Rows in", "Rows out", "Changed", "Rejected", "Score"], m.pipeline.steps.map((s) => [s.n, `${s.label}\n(${s.group})`, s.what, s.rowsIn.toLocaleString("en-US"), s.rowsOut.toLocaleString("en-US"), s.changed.toLocaleString("en-US"), s.rejected.toLocaleString("en-US"), s.qualityAfter]), [4, 17, 29, 10, 10, 10, 10, 6]),
    ...m.pipeline.steps.filter((s) => s.warning || s.error || s.note).map((s) => para(`Step ${s.n}: ${[s.note, s.warning && `warning: ${s.warning}`, s.error && `error: ${s.error}`].filter(Boolean).join("; ")}`, { size: 9, color: MUTED })),
    ...(m.stepsTotals.rejectReasons.length ? [h2("Rejected rows"), tbl(["Reason", "Step", "Rows"], m.stepsTotals.rejectReasons.map((r) => [r.reason, r.step, r.count.toLocaleString("en-US")]), [50, 35, 15])] : []),
    ...(await img(F("work"))),
    h1("5. Data quality: before and after"), para(m.quality.formula),
    tbl(["Dimension", "Weight", "Before", "After", "Change", "Meaning"], m.quality.dimensions.map((d) => [d.label, `${d.weight}%`, d.before, d.after, `${d.after - d.before >= 0 ? "+" : ""}${Math.round((d.after - d.before) * 10) / 10}`, d.meaning]), [18, 9, 9, 9, 9, 46]),
    ...(await img(F("progression"))), h2("Further measures"), kv(m.quality.extra), ...(m.sensor ? [h2("Sensor data quality"), para(`Time column ${m.sensor.timeColumn}${m.sensor.entityColumn ? `, machine column ${m.sensor.entityColumn}` : ""}. Sensor quality moved from ${m.sensor.scoreBefore} to ${m.sensor.scoreAfter ?? "n/a"} out of 100. ${m.sensor.formula}`), tbl(m.sensor.head, m.sensor.rows, [15, 17, 8, 8, 13, 13, 13, 13]), ...(m.sensor.note ? [para(m.sensor.note)] : []), ...m.sensor.recommendations.map(bullet), para(m.sensor.basis, { size: 8.5, color: MUTED })] : []), ...(await img(F("missing"))), ...(await img(F("histogram"))),
    h2("Column by column"), tbl(["Column", "Type", "Empty % before", "Empty % after", "Untidy % before", "Untidy % after", "Status"], m.quality.columns.map((c) => [c.name, c.type, c.nullBefore ?? "-", c.nullAfter ?? "-", c.untidyBefore ?? "-", c.untidyAfter ?? "-", c.status]), [22, 11, 12, 12, 12, 12, 11]),
    h1("6. Stream lineage"), ...(await img(F("lineage"))), ...(m.outputs.length ? [h2("Outputs"), tbl(["Name", "Kind", "Target", "Format"], m.outputs.map((o) => [o.name, o.kind, o.target, o.format]), [20, 12, 53, 15])] : []),
    h1("7. ML readiness"), para(`Readiness: ${m.readiness.score} / 100. ${m.readiness.basis}`), tbl(["Check", "Result", "Detail"], m.readiness.checks.map((c) => [c.label, c.status.toUpperCase(), c.detail]), [34, 10, 56]),
    h1("8. Feature dictionary"), para(`${m.features.length} columns. The same dictionary, with the field headings and code-ready groups, is delivered as a separate Markdown file.`),
    tbl(["Field", "Type", "Role", "Empty %", "Distinct", "Description and guidance"], m.features.map((f) => [f.name, f.type, f.role, f.nullPct, f.distinct, `${f.description}\n${f.guidance}`]), [18, 9, 10, 8, 8, 47]),
    h1("9. Measurement basis"), ...m.basis.map(bullet),
    h1("10. Legal notice and rules of use"), h2("Legal notice"), ...LEGAL_NOTICE.map((l, i) => numbered(l, i + 1)), h2("Rules of use"), ...RULES_OF_USE.map((l, i) => numbered(l, i + 1)),
  ];

  const doc = new Document({
    creator: m.people[0].value, title: m.title, description: "Tokener Refinery data preparation report",
    styles: { default: { document: { run: { font: FONT, size: 21 } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1300, bottom: 1100, left: 1100, right: 1100 } } },
      headers: { default: new Header({ children: [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 6 } }, tabStops: [{ type: "right", position: 9700 }], children: [logoRun(22), new TextRun({ text: `\t${m.title}`, font: FONT, size: 16, color: MUTED })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 6 } }, tabStops: [{ type: "right", position: 9700 }], children: [new TextRun({ text: `${m.documentId}  |  ${m.classification}\tPage `, font: FONT, size: 16, color: MUTED }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: MUTED }), new TextRun({ text: " of ", font: FONT, size: 16, color: MUTED }), new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: MUTED })] })] }) },
      children,
    }],
  });
  return Packer.toBlob(doc);
}
