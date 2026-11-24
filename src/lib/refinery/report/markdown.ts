/** Markdown writers: the full report and the feature dictionary. */
import type { FeatureRow, ReportModel, Scalar } from "./model";
import { LEGAL_NOTICE, RULES_OF_USE } from "./legal";

const cell = (s: string | number) => String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const table = (head: string[], rows: (string | number)[][]) => [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`)].join("\n");
const kv = (rows: Scalar[]) => table(["Item", "Value"], rows.map((r) => [r.label, r.value]));
const bar = (v: number, max = 100, w = 24) => "█".repeat(Math.round((Math.max(0, Math.min(max, v)) / max) * w)).padEnd(w, "░");
const mark = (s: "pass" | "warn" | "fail") => (s === "pass" ? "PASS" : s === "warn" ? "WARN" : "FAIL");
const mid = (s: string) => s.replace(/"/g, "'").replace(/[\[\]()]/g, "");

/** A Mermaid flowchart of the lineage, which GitHub, GitLab and most documentation tools draw. */
export function mermaid(m: ReportModel): string {
  const L = ["```mermaid", "flowchart LR"];
  m.lineage.forEach((n) => L.push(`  ${n.id}["${mid(n.title)}<br/>${n.lines.map(mid).join("<br/>")}"]`));
  m.lineage.forEach((n, i) => { if (i === 0) return; const prev = n.kind === "output" ? m.lineage.filter((x) => x.kind === "step").pop() ?? m.lineage[0] : m.lineage[i - 1]; L.push(`  ${prev.id} --> ${n.id}`); });
  L.push("```"); return L.join("\n");
}

export function reportMarkdown(m: ReportModel, logoSvg?: string): string {
  const q = m.quality; const out: string[] = [];
  out.push(logoSvg ? `<p align="center"><img alt="Tokener" height="44" src="data:image/svg+xml;base64,${b64(logoSvg)}"></p>` : "# Tokener", "", `# ${m.title}`, "",
    `**Document ID:** ${m.documentId}  `, `**Version:** ${m.version}  `, `**Classification:** ${m.classification}  `, `**Organisation:** ${m.organisation}  `, `**Generated:** ${m.generatedAt}`, "",
    m.sampleWorkspace ? "> This run belongs to the sample workspace and was simulated. Figures are illustrative.\n" : "", "---", "",
    "## Contents", "", "1. Document control", "2. Executive summary", "3. Input dataset", "4. Pipeline and strategy", "5. Data quality: before and after", "6. Stream lineage", "7. ML readiness", "8. Feature dictionary", "9. Measurement basis", "10. Legal notice and rules of use", "",
    "## 1. Document control", "", "### Authors and responsibilities", "", kv(m.people), "", "### Timing", "", kv(m.timing), "",
    "## 2. Executive summary", "", ...m.summary.flatMap((p) => [p, ""]), table(m.headline.map((h) => h.label), [m.headline.map((h) => h.value)]), "",
    "## 3. Input dataset", "", kv(m.input.rows), "", "### Input columns", "", table(["Column", "Type", "Role", "Empty %", "Distinct", "Personal data"], m.input.columns.map((c) => [c.name, c.type, c.role, c.nullPct, c.distinct, c.pii ? "yes" : "no"])), "",
    "## 4. Pipeline and strategy", "", kv(m.pipeline.rows), "", "### Strategy", "", ...m.pipeline.strategy.map((s) => `- ${s}`), "", "### Cleaning operators", "",
    table(["#", "Operator", "Group", "What it does here", "Rows in", "Rows out", "Changed", "Rejected", "Score after"], m.pipeline.steps.map((s) => [s.n, s.label, s.group, s.what, s.rowsIn, s.rowsOut, s.changed, s.rejected, s.qualityAfter])), "",
    ...m.pipeline.steps.filter((s) => s.warning || s.error || s.note).map((s) => `- Step ${s.n}: ${[s.note, s.warning && `warning: ${s.warning}`, s.error && `error: ${s.error}`].filter(Boolean).join("; ")}`), "",
    ...(m.stepsTotals.rejectReasons.length ? ["### Rejected rows", "", table(["Reason", "Step", "Rows"], m.stepsTotals.rejectReasons.map((r) => [r.reason, r.step, r.count])), ""] : []),
    "## 5. Data quality: before and after", "", `${q.formula}`, "", table(["Dimension", "Weight", "Before", "After", "Change", "Meaning"], q.dimensions.map((d) => [d.label, `${d.weight}%`, d.before, d.after, `${d.after - d.before >= 0 ? "+" : ""}${Math.round((d.after - d.before) * 10) / 10}`, d.meaning])), "",
    "```text", ...q.dimensions.flatMap((d) => [`${d.label.padEnd(14)} before ${bar(d.before)} ${String(d.before).padStart(5)}`, `${"".padEnd(14)} after  ${bar(d.after)} ${String(d.after).padStart(5)}`]), "```", "",
    "### Quality score through the pipeline", "", "```text", ...q.progression.map((p) => `${p.label.padEnd(6)} ${bar(p.score)} ${p.score}`), "```", "",
    "### Further measures", "", kv(q.extra), "", "### Column by column", "", table(["Column", "Type", "Empty % before", "Empty % after", "Untidy % before", "Untidy % after", "Status"], q.columns.map((c) => [c.name, c.type, c.nullBefore ?? "-", c.nullAfter ?? "-", c.untidyBefore ?? "-", c.untidyAfter ?? "-", c.status])), "",
    ...(m.sensor ? ["### Sensor data quality", "", `Time column \`${m.sensor.timeColumn}\`${m.sensor.entityColumn ? `, machine column \`${m.sensor.entityColumn}\`` : ""}. Sensor quality moved from ${m.sensor.scoreBefore} to ${m.sensor.scoreAfter ?? "n/a"} out of 100.`, "", m.sensor.formula, "", table(m.sensor.head, m.sensor.rows), "", m.sensor.note, "", ...m.sensor.recommendations.map((r) => `- ${r}`), "", m.sensor.basis, ""] : []),
    ...(m.histogram ? [`### Distribution of ${m.histogram.column}`, "", table(["Bucket (before)", "Count", "Bucket (after)", "Count"], Array.from({ length: Math.max(m.histogram.before.length, m.histogram.after.length) }, (_, i) => [m.histogram!.before[i]?.label ?? "", m.histogram!.before[i]?.count ?? "", m.histogram!.after[i]?.label ?? "", m.histogram!.after[i]?.count ?? ""])), ""] : []),
    "## 6. Stream lineage", "", mermaid(m), "", table(["Stage", "Detail"], m.lineage.map((n) => [n.title, n.lines.join("; ")])), "",
    ...(m.outputs.length ? ["### Outputs", "", table(["Name", "Kind", "Target", "Format"], m.outputs.map((o) => [o.name, o.kind, o.target, o.format])), ""] : []),
    "## 7. ML readiness", "", `**Readiness: ${m.readiness.score} / 100.** ${m.readiness.basis}`, "", table(["Check", "Result", "Detail"], m.readiness.checks.map((c) => [c.label, mark(c.status), c.detail])), "",
    "## 8. Feature dictionary", "", `${m.features.length} columns. The same table, with the field headings, is delivered as a separate file.`, "", featureTable(m.features), "",
    "## 9. Measurement basis", "", ...m.basis.map((b) => `- ${b}`), "",
    "## 10. Legal notice and rules of use", "", "### Legal notice", "", ...LEGAL_NOTICE.map((l, i) => `${i + 1}. ${l}`), "", "### Rules of use", "", ...RULES_OF_USE.map((l, i) => `${i + 1}. ${l}`), "",
    "---", "", `${m.documentId} | ${m.classification} | Generated by Tokener Refinery on ${m.generatedAt}`, "");
  return out.join("\n");
}

function featureTable(f: FeatureRow[]) {
  return table(["#", "Field", "Type", "Role", "Empty %", "Distinct", "Range or length", "Origin", "Description", "ML guidance"], f.map((x, i) => [i + 1, `\`${x.name}\``, x.type, x.role, x.nullPct, x.distinct, x.range || "-", x.origin, x.description, x.guidance]));
}

const b64 = (s: string) => (typeof btoa === "function" ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s).toString("base64"));
const pyList = (xs: string[]) => `[${xs.map((x) => JSON.stringify(x)).join(", ")}]`;

/** The features file: field headings and a dictionary for the people who build models. */
export function featuresMarkdown(m: ReportModel): string {
  const feats = m.features.filter((f) => f.role === "feature"); const label = m.features.filter((f) => f.role === "label"); const ids = m.features.filter((f) => f.role === "identifier"); const ign = m.features.filter((f) => f.role === "ignore");
  const num = feats.filter((f) => f.type === "integer" || f.type === "decimal").map((f) => f.name);
  const cat = feats.filter((f) => f.type === "string" && f.distinct <= 20 && !f.pii).map((f) => f.name);
  const when = feats.filter((f) => f.type === "date" || f.type === "timestamp").map((f) => f.name);
  const bool = feats.filter((f) => f.type === "boolean").map((f) => f.name);
  const text = feats.filter((f) => f.type === "string" && f.distinct > 20 && !f.pii).map((f) => f.name);
  const pii = m.features.filter((f) => f.pii).map((f) => f.name);
  return [
    `# Feature dictionary: ${m.title.replace("Data Preparation Report: ", "")}`, "",
    `**Document ID:** ${m.documentId}  `, `**Generated:** ${m.generatedAt}  `, `**Organisation:** ${m.organisation}  `, `**Prepared by:** ${m.people[0].value}  `, `**Source report:** ${m.documentId}  `, `**Classification:** ${m.classification}`, "",
    m.sampleWorkspace ? "> Sample workspace output. Illustrative values.\n" : "",
    "This file lists every column of the prepared dataset with its type, role, statistics and guidance for model building. It belongs to the data preparation report with the same identifier.", "",
    "## Field headings", "", "CSV header, in output order:", "", "```text", m.features.map((f) => f.name).join(","), "```", "",
    "## Groups for your code", "", "```python", `FEATURES  = ${pyList(feats.map((f) => f.name))}`, `LABEL     = ${pyList(label.map((f) => f.name))}`, `IDENTIFIERS = ${pyList(ids.map((f) => f.name))}`, `EXCLUDED  = ${pyList(ign.map((f) => f.name))}`, "", `NUMERIC     = ${pyList(num)}`, `CATEGORICAL = ${pyList(cat)}`, `BOOLEAN     = ${pyList(bool)}`, `DATETIME    = ${pyList(when)}`, `TEXT        = ${pyList(text)}`, `PERSONAL_DATA = ${pyList(pii)}  # do not use as inputs without approval`, "```", "",
    "## Summary", "", table(["Group", "Count"], [["Feature columns", feats.length], ["Numeric", num.length], ["Categorical", cat.length], ["Boolean", bool.length], ["Date and time", when.length], ["Text or high cardinality", text.length], ["Label", label.length], ["Identifiers", ids.length], ["Excluded", ign.length], ["Flagged as personal data", pii.length]]), "",
    "## Dictionary", "", featureTable(m.features), "",
    "## Details", "", ...m.features.flatMap((f) => [`### \`${f.name}\``, "", `- **Type:** ${f.type}`, `- **Role:** ${f.role}`, `- **Description:** ${f.description}`, `- **Missing:** ${f.nullPct}%${f.nullable ? "" : " (none)"}`, `- **Distinct values:** ${f.distinct}`, ...(f.range ? [`- **Range:** ${f.range}`] : []), ...(f.example && !f.pii ? [`- **Most common value:** \`${f.example.replace(/`/g, "'")}\``] : []), ...(f.derivedBy ? [`- **Derived by:** ${f.derivedBy}`] : []), `- **Guidance:** ${f.guidance}`, ""]),
    "## Rules", "", ...RULES_OF_USE.map((r, i) => `${i + 1}. ${r}`), "", "## Legal notice", "", ...LEGAL_NOTICE.slice(0, 4).map((r, i) => `${i + 1}. ${r}`), "",
  ].join("\n");
}
