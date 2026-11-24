/** Entry point for the report feature: one call per format, all from the same model. */
import { allFigures } from "./charts";
import { buildEvidence, evidenceMarkdown } from "./evidence";
import { evidenceDocx } from "./evidenceDocx";
import { reportDocx } from "./docx";
import { featuresMarkdown, reportMarkdown } from "./markdown";
import { buildReport } from "./model";
import type { ReportInput, ReportModel } from "./model";
import { reportPdf } from "./pdf";
import { loadLogoSvg, svgToPng, withSize } from "./raster";

export type ReportFormat = "pdf" | "docx" | "md" | "features" | "evidence" | "evidence-docx";
export type ReportFile = { name: string; blob: Blob };
export const FORMATS: { id: ReportFormat; label: string; ext: string; blurb: string }[] = [
  { id: "pdf", label: "PDF", ext: "pdf", blurb: "A paginated engineering document with the logo, charts and the lineage diagram. Best for sign-off and archiving." },
  { id: "docx", label: "Word", ext: "docx", blurb: "The same document as an editable .docx, to add your own sections before it is circulated." },
  { id: "md", label: "Markdown", ext: "md", blurb: "Text with tables and a Mermaid lineage diagram, for a repository or a wiki." },
  { id: "features", label: "Feature dictionary", ext: "md", blurb: "Only the field headings, groups for your code, and a description and guidance for every feature." },
  { id: "evidence", label: "Evidence pack (Markdown)", ext: "md", blurb: "Maps what was recorded to EU AI Act Article 10 and ISO/IEC 42001 Annex A.7, with an open items list for the system owner." },
  { id: "evidence-docx", label: "Evidence pack (Word)", ext: "docx", blurb: "The same evidence pack as an editable .docx, with room to complete the open items and sign." },
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "report";

export async function generateReports(input: ReportInput, formats: ReportFormat[]): Promise<{ model: ReportModel; files: ReportFile[] }> {
  const model = buildReport(input); const base = `${slug(input.run.recipeName)}-${slug(input.run.id)}`; const files: ReportFile[] = [];
  const needsFigures = formats.includes("pdf") || formats.includes("docx");
  const needsLogo = needsFigures || formats.includes("evidence-docx");
  const figures = needsFigures ? allFigures(model) : [];
  const logoSvg = await loadLogoSvg();
  const logo = needsLogo ? await svgToPng(logoSvg, 593, 186, 3) : null;
  for (const f of formats) {
    if (f === "pdf" && logo) files.push({ name: `${base}-report.pdf`, blob: await reportPdf(model, figures, logo) });
    if (f === "docx" && logo) files.push({ name: `${base}-report.docx`, blob: await reportDocx(model, figures, logo) });
    if (f === "md") files.push({ name: `${base}-report.md`, blob: new Blob([reportMarkdown(model, withSize(logoSvg, 593, 186))], { type: "text/markdown;charset=utf-8" }) });
    if (f === "evidence") files.push({ name: `${base}-evidence-pack.md`, blob: new Blob([evidenceMarkdown(buildEvidence(model), btoa(unescape(encodeURIComponent(withSize(logoSvg, 593, 186)))))], { type: "text/markdown;charset=utf-8" }) });
    if (f === "evidence-docx" && logo) files.push({ name: `${base}-evidence-pack.docx`, blob: await evidenceDocx(buildEvidence(model), logo) });
    if (f === "features") files.push({ name: `${base}-features.md`, blob: new Blob([featuresMarkdown(model)], { type: "text/markdown;charset=utf-8" }) });
  }
  return { model, files };
}

export function download(file: ReportFile) {
  const url = URL.createObjectURL(file.blob); const a = document.createElement("a"); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
}
export { buildReport };
export type { ReportInput, ReportModel };
