/** Word writer for the evidence pack: the same blocks as the Markdown, with the logo, real headings, a fixed layout table and page numbers. */
import { AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, ImageRun, Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType } from "docx";
import type { EvidenceModel } from "./evidence";
import { LOGO_RATIO } from "./raster";
import type { Png } from "./raster";

const INK = "07191E", MUTED = "5B6B70", RULE = "C9D4D6", ACCENT = "02F5A1", FONT = "Calibri", SOFT = "F4F8F8";

export async function evidenceDocx(e: EvidenceModel, logo: Png): Promise<Blob> {
  const run = (text: string, o: { bold?: boolean; size?: number; color?: string; italics?: boolean } = {}) => new TextRun({ text, font: FONT, bold: o.bold, size: (o.size ?? 10.5) * 2, color: o.color ?? INK, italics: o.italics });
  const logoRun = (h: number) => new ImageRun({ type: "png", data: logo.data, transformation: { width: Math.round(h * LOGO_RATIO), height: h }, altText: { title: "Tokener", description: "Tokener logo", name: "logo" } });
  const cell = (text: string, w: number, head = false) => new TableCell({
    width: { size: w, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 90, right: 90 },
    shading: head ? { type: ShadingType.CLEAR, fill: INK, color: "auto" } : undefined,
    borders: { top: { style: BorderStyle.SINGLE, size: 2, color: RULE }, bottom: { style: BorderStyle.SINGLE, size: 2, color: RULE }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } },
    children: String(text).split("\n").map((l) => new Paragraph({ children: [run(l, { size: 9, bold: head, color: head ? "F2F7F6" : INK })] })),
  });
  const table = (head: string[], rows: string[][], widths: number[] = head.map(() => 1)) => {
    const tot = widths.reduce((a, b) => a + b, 0); const w = widths.map((x) => Math.round((x / tot) * 9700));
    return new Table({ width: { size: 9700, type: WidthType.DXA }, columnWidths: w, layout: TableLayoutType.FIXED, rows: [new TableRow({ tableHeader: true, cantSplit: true, children: head.map((h, i) => cell(h, w[i], true)) }), ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, w[i])) }))] });
  };
  const children: (Paragraph | Table)[] = [
    new Paragraph({ spacing: { before: 600, after: 600 }, children: [logoRun(64)] }),
    new Paragraph({ spacing: { after: 100 }, border: { top: { style: BorderStyle.SINGLE, size: 24, color: ACCENT, space: 8 } }, children: [run("TOKENER REFINERY", { bold: true, size: 11, color: MUTED })] }),
    new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: e.title, font: FONT, bold: true, size: 48, color: INK })] }),
    new Paragraph({ spacing: { after: 200 }, children: [run("EU AI Act Article 10 and ISO/IEC 42001 Annex A.7", { size: 14, color: MUTED })] }),
    table(["Item", "Value"], [["Document ID", e.documentId], ["Source report", e.sourceReportId], ["Classification", e.classification], ["Organisation", e.organisation], ["Generated", e.generatedAt], ...e.people.map((p) => [p.label, p.value])], [30, 70]),
    new Paragraph({ pageBreakBefore: true, children: [] }),
  ];
  for (const b of e.blocks) {
    if (b.t === "h1") children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 160 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 4 } }, children: [new TextRun({ text: b.text, font: FONT, bold: true, size: 30, color: INK })] }));
    else if (b.t === "h2" || b.t === "h3") children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, spacing: { before: 240, after: 100 }, children: [new TextRun({ text: b.text, font: FONT, bold: true, size: 24, color: INK })] }));
    else if (b.t === "p") children.push(new Paragraph({ spacing: { after: 120, line: 276 }, children: [run(b.text)] }));
    else if (b.t === "note") children.push(new Paragraph({ spacing: { before: 60, after: 160, line: 276 }, shading: { type: ShadingType.CLEAR, fill: SOFT, color: "auto" }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: ACCENT, space: 8 } }, children: [run(b.text, { italics: true })] }));
    else if (b.t === "ul") b.items.forEach((i) => children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 70, line: 270 }, children: [run(i)] })));
    else if (b.t === "todo") b.items.forEach((i) => children.push(new Paragraph({ indent: { left: 360, hanging: 360 }, spacing: { before: 40, after: 120, line: 270 }, children: [run("☐  ", { size: 11 }), run("To complete: ", { bold: true }), run(i)] })));
    else if (b.t === "table") children.push(table(b.head, b.rows, b.widths), new Paragraph({ spacing: { after: 120 }, children: [] }));
  }
  const doc = new Document({
    creator: e.people[0]?.value ?? "Tokener", title: e.title, description: "Tokener Refinery data governance evidence pack",
    styles: { default: { document: { run: { font: FONT, size: 21 } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1300, bottom: 1100, left: 1100, right: 1100 } } },
      headers: { default: new Header({ children: [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 6 } }, tabStops: [{ type: "right", position: 9700 }], children: [logoRun(22), new TextRun({ text: `\t${e.title}`, font: FONT, size: 16, color: MUTED })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 6 } }, tabStops: [{ type: "right", position: 9700 }], children: [new TextRun({ text: `${e.documentId}  |  ${e.classification}\tPage `, font: FONT, size: 16, color: MUTED }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: MUTED }), new TextRun({ text: " of ", font: FONT, size: 16, color: MUTED }), new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: MUTED })] })] }) },
      children,
    }],
  });
  return Packer.toBlob(doc);
}
export { AlignmentType };
