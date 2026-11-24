/**
 * The data governance evidence pack. It maps what Refinery recorded about one run to two sets of topics that auditors and notified bodies ask about:
 * Article 10 of the EU AI Act (data and data governance, paragraphs 2 and 3) and the data controls of ISO/IEC 42001 Annex A.7.
 *
 * It is a record, not an assessment. For every topic it shows what Tokener measured or did, with the figures, and says plainly what only the people
 * who own the AI system can answer (intended purpose, original purpose of collection, bias examination, suitability). Those items become an
 * open items list with blank owner, date and notes. Nothing here says a system complies with a regulation or a standard.
 *
 * Article and control references follow the published texts as read on 14 November 2026. The AI Act text is being amended, so check the current
 * consolidated version before relying on a paragraph number.
 */
import type { Check, ReportModel, Scalar } from "./model";
import { LEGAL_NOTICE } from "./legal";

export type EvidenceStatus = "recorded" | "partial" | "owner";
export const STATUS_LABEL: Record<EvidenceStatus, string> = { recorded: "Recorded by Tokener", partial: "Partly recorded", owner: "Owner to complete" };
export type EvidenceItem = { ref: string; topic: string; requirement: string; status: EvidenceStatus; evidence: string[]; todo: string };
export type Block =
  | { t: "h1" | "h2" | "h3" | "p" | "note"; text: string }
  | { t: "ul" | "todo"; items: string[] }
  | { t: "table"; head: string[]; rows: string[][]; widths?: number[] };
export type EvidenceModel = {
  documentId: string; sourceReportId: string; title: string; organisation: string; generatedAt: string; sampleWorkspace: boolean; classification: string;
  people: Scalar[]; counts: Record<EvidenceStatus, number>; art10: EvidenceItem[]; iso: EvidenceItem[]; blocks: Block[];
};

const pct = (n: number) => `${Math.round(n * 10) / 10}%`;
const list = (xs: string[], max = 6) => (xs.length <= max ? xs.join(", ") : `${xs.slice(0, max).join(", ")} and ${xs.length - max} more`);
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

export function buildEvidence(m: ReportModel): EvidenceModel {
  const get = (k: string) => m.input.rows.find((r) => r.label === k)?.value ?? "not recorded";
  const dim = (k: string) => m.quality.dimensions.find((d) => d.key === k);
  const comp = dim("composite"); const cmp = dim("completeness"); const val = dim("validity"); const con = dim("consistency"); const uni = dim("uniqueness");
  const pii = m.input.columns.filter((c) => c.pii);
  const masked = m.pipeline.steps.filter((s) => s.op === "pii_mask");
  const labels = m.features.filter((f) => f.role === "label"); const ids = m.features.filter((f) => f.role === "identifier"); const feats = m.features.filter((f) => f.role === "feature");
  const gaps = m.input.columns.filter((c) => c.nullPct > 0).sort((a, b) => b.nullPct - a.nullPct);
  const rejectLines = m.stepsTotals.rejectReasons.map((r) => `${fmt(r.count)} rows rejected at step ${r.step}: ${r.reason}.`);
  const stepLines = m.pipeline.steps.map((s) => `Step ${s.n}, ${s.label} (${s.group}): ${s.what}. ${fmt(s.rowsIn)} rows in, ${fmt(s.rowsOut)} out${s.rejected ? `, ${fmt(s.rejected)} rejected` : ""}.`);
  const counts = (cs: Check[]) => `${cs.filter((c) => c.status === "pass").length} passed, ${cs.filter((c) => c.status === "warn").length} warnings, ${cs.filter((c) => c.status === "fail").length} failed`;
  const labelBalance = (() => {
    const l = labels[0]; if (!l || !m.quality.after) return null;
    const col = m.quality.after.columns.find((c) => c.name === l.name); if (!col || !col.top.length) return null;
    const tot = col.top.reduce((a, t) => a + t.count, 0) || 1;
    return `Label ${l.name} in the prepared sample: ${col.top.slice(0, 6).map((t) => `${t.value} ${pct((t.count / tot) * 100)}`).join(", ")}.`;
  })();
  const reportRef = `${m.documentId}`;

  const art10: EvidenceItem[] = [
    { ref: "10(2)(a)", topic: "Design choices", requirement: "The relevant design choices.", status: "partial",
      evidence: [`Pipeline ${m.pipeline.rows[0].value}, ${m.pipeline.steps.length} steps in a fixed order.`, ...m.pipeline.strategy.slice(0, 3)],
      todo: "State the intended purpose of the AI system and why these preparation choices suit it." },
    { ref: "10(2)(b)", topic: "Data collection processes and origin", requirement: "Data collection processes and the origin of the data and, for personal data, the original purpose of the collection.", status: "partial",
      evidence: [`Dataset ${get("Dataset")}. Source: ${get("Source")}. Format ${get("Format")}, ${get("Rows")} rows.`, `Input snapshot ${get("Input snapshot")}.`, `Dataset owner: ${m.people.find((p) => p.label === "Dataset owner")?.value ?? "not recorded"}.`,
        pii.length ? `Personal data detected in ${list(pii.map((c) => c.name))}.` : "No column was detected as personal data. Free-text columns can still contain personal data."],
      todo: `Describe how and why the data was collected${pii.length ? ", including the original purpose for the personal data listed" : ""}.` },
    { ref: "10(2)(c)", topic: "Data preparation operations", requirement: "Relevant data-preparation processing operations such as annotation, labelling, cleaning, updating, enrichment and aggregation.", status: "recorded",
      evidence: [...stepLines, ...(labels.length ? [`Label column: ${labels.map((l) => l.name).join(", ")}.`] : []), ...rejectLines],
      todo: "Confirm the list is complete if any preparation happened outside Refinery." },
    { ref: "10(2)(d)", topic: "Assumptions", requirement: "The formulation of assumptions, in particular with respect to the information the data are supposed to measure and represent.", status: "owner",
      evidence: [`Columns treated as features: ${list(feats.map((f) => f.name), 8) || "none"}.`, `Label: ${labels.map((l) => l.name).join(", ") || "none"}. Identifiers: ${ids.map((i) => i.name).join(", ") || "none"}.`, "These roles are how Refinery was told to read the columns. They are not a statement of what the data represents."],
      todo: "State what each feature and the label are supposed to measure and represent." },
    { ref: "10(2)(e)", topic: "Availability, quantity and suitability", requirement: "An assessment of the availability, quantity and suitability of the data sets that are needed.", status: "partial",
      evidence: [`${fmt(Number(m.headline.find((h) => h.label === "Rows read")?.value.replace(/,/g, "")) || 0)} rows read, ${m.headline.find((h) => h.label === "Rows written")?.value} written, ${m.headline.find((h) => h.label === "Rows rejected")?.value} rejected.`,
        comp ? `Quality score ${comp.before} before and ${comp.after} after preparation.` : "Quality score not available.", `ML readiness ${m.readiness.score} of 100 (${counts(m.readiness.checks)}).`],
      todo: "Assess whether the quantity and the content of the data are enough for the intended purpose." },
    { ref: "10(2)(f)", topic: "Examination for possible biases", requirement: "Examination in view of possible biases likely to affect health and safety, have a negative impact on fundamental rights or lead to prohibited discrimination.", status: "owner",
      evidence: ["Tokener does not examine data for bias. No bias finding is implied by anything in this pack.", ...(labelBalance ? [labelBalance] : [])],
      todo: "Record the bias examination: which groups and attributes were considered, the method, and the findings." },
    { ref: "10(2)(g)", topic: "Measures to detect, prevent and mitigate biases", requirement: "Appropriate measures to detect, prevent and mitigate the biases identified under point (f).", status: "owner",
      evidence: [`Operations in this run that change which rows reach training: ${m.pipeline.steps.filter((s) => ["Rows", "Quality", "Training sets"].includes(s.group)).map((s) => s.label).join(", ") || "none"}.`, ...rejectLines.slice(0, 3)],
      todo: "Record the measures taken for each bias identified, and who approved them." },
    { ref: "10(2)(h)", topic: "Data gaps and shortcomings", requirement: "The identification of relevant data gaps or shortcomings that prevent compliance, and how they can be addressed.", status: "partial",
      evidence: [gaps.length ? `Columns with missing values in the input: ${list(gaps.map((c) => `${c.name} ${pct(c.nullPct)}`))}.` : "No missing values in the sampled input.", ...rejectLines,
        ...(m.sensor ? [`Time series checks on ${m.sensor.timeColumn}: score ${m.sensor.scoreBefore} before and ${m.sensor.scoreAfter ?? "n/a"} after preparation (gaps, flatlines, spikes, level shifts and implausible values).`] : [])],
      todo: "Say which gaps matter for the intended purpose and how each will be addressed." },
    { ref: "10(3)", topic: "Relevant and representative", requirement: "Training, validation and testing data sets are relevant and sufficiently representative.", status: "owner",
      evidence: [`Training sets: ${m.pipeline.steps.some((s) => s.group === "Training sets") ? "a split step is part of this pipeline" : "no split step in this pipeline"}.`, "Representativeness depends on the population the system will meet. Tokener has no information about it."],
      todo: "Show that the data is relevant and representative of the people, settings and conditions of use." },
    { ref: "10(3)", topic: "Free of errors and complete", requirement: "To the best extent possible free of errors and complete in view of the intended purpose.", status: "partial",
      evidence: [cmp ? `Completeness ${cmp.before} to ${cmp.after}.` : "", val ? `Validity ${val.before} to ${val.after}.` : "", con ? `Consistency ${con.before} to ${con.after}.` : "", uni ? `Uniqueness ${uni.before} to ${uni.after}.` : ""].filter(Boolean),
      todo: "State whether the remaining errors and gaps are acceptable for the intended purpose." },
  ];

  const iso: EvidenceItem[] = [
    { ref: "A.7.2", topic: "Data for development and enhancement of the AI system", requirement: "Define and document the data management processes across the data lifecycle, including privacy, security, and the representativeness and accuracy of training data.", status: "partial",
      evidence: [`Run ${m.pipeline.rows[0].value}, started and finished as recorded in ${reportRef}.`, `${masked.length ? `Personal data masking steps: ${masked.length}.` : pii.length ? `Personal data columns are not masked in this pipeline: ${list(pii.map((c) => c.name))}.` : "No personal data columns detected."}`, `People: ${m.people.map((p) => `${p.label} ${p.value}`).join("; ")}.`],
      todo: "Document the organisation's data management process and show where this run sits in it, including security controls." },
    { ref: "A.7.3", topic: "Acquisition of data", requirement: "Identify the categories, quantity and sources of data needed, consider data rights and privacy, and document how data was selected.", status: "partial",
      evidence: [`Source: ${get("Source")}. ${get("Rows")} rows, ${get("Columns")} columns, ${get("Size")}.`, `Columns by role: ${feats.length} features, ${labels.length} label, ${ids.length} identifier.`, pii.length ? `Personal data present in ${list(pii.map((c) => c.name))}.` : "No personal data columns detected."],
      todo: "Record the data rights and licences that apply and why this data was selected." },
    { ref: "A.7.4", topic: "Quality of data for AI systems", requirement: "Set data quality criteria for accuracy, completeness, consistency and relevance, and validate and audit data against them.", status: "partial",
      evidence: [m.quality.formula, ...m.quality.dimensions.map((d) => `${d.label}: ${d.before} before, ${d.after} after.`), `Readiness checks: ${counts(m.readiness.checks)}.`],
      todo: "Confirm that these measures and thresholds are the organisation's quality criteria, and add criteria for relevance." },
    { ref: "A.7.5", topic: "Data provenance", requirement: "Record where data comes from and how it is collected, transformed, used and stored, to support traceability and accountability.", status: "recorded",
      evidence: [`Source: dataset ${get("Dataset")}, snapshot ${get("Input snapshot")}, ${get("Rows")} rows.`, ...m.pipeline.steps.map((s) => `Step ${s.n}, ${s.label}: ${s.what}. ${fmt(s.rowsIn)} to ${fmt(s.rowsOut)} rows, ${fmt(s.changed)} changed.`), ...m.outputs.map((o) => `Output ${o.name}: ${o.kind} to ${o.target}, ${o.format}.`)],
      todo: "Add where the outputs are stored and how long they are kept." },
    { ref: "A.7.6", topic: "Data preparation", requirement: "Set criteria for choosing data preparation methods and document the techniques used, such as cleaning, normalisation, labelling and encoding.", status: "partial",
      evidence: [...stepLines, ...m.pipeline.strategy.slice(0, 3)],
      todo: "Record why these methods were chosen over others." },
  ];

  const fell = m.quality.dimensions.filter((d) => d.key !== "composite" && d.after < d.before);
  if (fell.length) art10[art10.length - 1].evidence.push(`${fell.map((d) => d.label.toLowerCase()).join(" and ")} fell during preparation. The step table in report ${reportRef} shows which steps changed or removed rows.`);
  const counts2: Record<EvidenceStatus, number> = { recorded: 0, partial: 0, owner: 0 };
  [...art10, ...iso].forEach((i) => { counts2[i.status]++; });

  const itemBlocks = (items: EvidenceItem[]): Block[] => items.flatMap((i): Block[] => [
    { t: "h3", text: `${i.ref}  ${i.topic}` }, { t: "p", text: `Status: ${STATUS_LABEL[i.status]}. Requirement: ${i.requirement}` },
    { t: "ul", items: i.evidence }, { t: "todo", items: [i.todo] },
  ]);
  const open = [...art10, ...iso].map((i) => [i.ref, i.topic, i.todo, "", "", ""]);
  const documentId = `EVD-${m.documentId.replace(/^RPT-/, "")}`;
  const blocks: Block[] = [
    { t: "note", text: "This pack is a record of what Tokener measured and did. It is not an assessment, a certificate or evidence that any system conforms to a regulation or a standard. Items marked Owner to complete cannot be known by Tokener and are listed at the end for the people who own the AI system." },
    ...(m.sampleWorkspace ? [{ t: "note", text: "This run belongs to the sample workspace and was simulated. Figures are illustrative." } as Block] : []),
    { t: "h1", text: "1. The AI system and this evidence" },
    { t: "table", head: ["Item", "Value"], rows: [["Source report", reportRef], ["Dataset", get("Dataset")], ["Pipeline", m.pipeline.rows[0].value], ["Organisation", m.organisation], ["Generated", m.generatedAt],
      ["AI system name", "To be completed"], ["Intended purpose", "To be completed"], ["Risk classification and basis", "To be completed"], ["Role of the organisation (provider or deployer)", "To be completed"]], widths: [34, 66] },
    { t: "h1", text: "2. Where things stand" },
    { t: "p", text: `${counts2.recorded} topics are recorded by Tokener, ${counts2.partial} are partly recorded and ${counts2.owner} need an answer from the system's owner. Every topic also lists what the owner still has to add.` },
    { t: "table", head: ["Reference", "Topic", "Status"], rows: [...art10, ...iso].map((i) => [i.ref, i.topic, STATUS_LABEL[i.status]]), widths: [16, 56, 28] },
    { t: "h1", text: "3. EU AI Act, Article 10: data and data governance" },
    { t: "p", text: "Paragraph 2 lists the topics that data governance practices must cover for high-risk AI systems. Paragraph 3 describes the properties of training, validation and testing data. Whether the system is high-risk, and when the obligations apply to it, is for the organisation to establish." },
    ...itemBlocks(art10),
    { t: "h1", text: "4. ISO/IEC 42001, Annex A.7: data for AI systems" },
    { t: "p", text: "Annex A.7 sets controls for the data used by an AI management system. The control names are those of the published standard. Whether the organisation has implemented a control is for its own assessment." },
    ...itemBlocks(iso),
    { t: "h1", text: "5. Evidence to keep with this pack" },
    { t: "table", head: ["Item", "Reference"], rows: [["Data preparation report", reportRef], ["Pipeline", m.pipeline.rows[0].value], ["Input snapshot", get("Input snapshot")], ["Dataset", get("Dataset")], ["Prepared by", m.people[0].value], ["Run started by", m.people[1].value], ["Run", `${m.timing[0].value} to ${m.timing[1].value}`]], widths: [34, 66] },
    { t: "p", text: "Keep this pack with the data preparation report and the feature dictionary of the same run. They are produced from the same record." },
    { t: "h1", text: "6. Open items for the owner" },
    { t: "table", head: ["Ref", "Topic", "What to provide", "Owner", "Due", "Notes"], rows: open, widths: [9, 18, 40, 11, 8, 14] },
    { t: "h1", text: "7. Review and approval" },
    { t: "table", head: ["Role", "Name", "Date", "Signature"], rows: [["Prepared by", m.people[0].value, m.generatedAt.slice(0, 10), ""], ["Reviewed by", "", "", ""], ["Approved by", "", "", ""]], widths: [24, 32, 18, 26] },
    { t: "h1", text: "8. Legal notice" },
    { t: "ul", items: [...LEGAL_NOTICE.slice(0, 4), "References. Article and control references follow the published texts as read on 14 November 2026. The EU AI Act is subject to amendment, and ISO/IEC 42001 is published by ISO and IEC. Read the current texts before relying on a reference."] },
  ];
  return { documentId, sourceReportId: reportRef, title: `Data Governance Evidence Pack: ${m.title.replace("Data Preparation Report: ", "")}`, organisation: m.organisation, generatedAt: m.generatedAt, sampleWorkspace: m.sampleWorkspace, classification: m.classification, people: m.people, counts: counts2, art10, iso, blocks };
}

const cell = (s: string) => String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
export function evidenceMarkdown(e: EvidenceModel, logoSvgB64?: string): string {
  const out: string[] = [logoSvgB64 ? `<p align="center"><img alt="Tokener" height="44" src="data:image/svg+xml;base64,${logoSvgB64}"></p>` : "# Tokener", "", `# ${e.title}`, "",
    `**Document ID:** ${e.documentId}  `, `**Source report:** ${e.sourceReportId}  `, `**Classification:** ${e.classification}  `, `**Organisation:** ${e.organisation}  `, `**Generated:** ${e.generatedAt}`, "", "---", ""];
  for (const b of e.blocks) {
    if (b.t === "h1") out.push(`## ${b.text}`, "");
    else if (b.t === "h2") out.push(`### ${b.text}`, "");
    else if (b.t === "h3") out.push(`### ${b.text}`, "");
    else if (b.t === "p") out.push(b.text, "");
    else if (b.t === "note") out.push(`> ${b.text}`, "");
    else if (b.t === "ul") out.push(...b.items.map((i) => `- ${i}`), "");
    else if (b.t === "todo") out.push(...b.items.map((i) => `- [ ] To complete: ${i}`), "");
    else if (b.t === "table") out.push(`| ${b.head.join(" | ")} |`, `| ${b.head.map(() => "---").join(" | ")} |`, ...b.rows.map((r) => `| ${r.map(cell).join(" | ")} |`), "");
  }
  out.push("---", "", `${e.documentId} | ${e.classification} | Generated by Tokener Refinery on ${e.generatedAt}`, "");
  return out.join("\n");
}
