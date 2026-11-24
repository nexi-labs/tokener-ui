/**
 * The report model: everything a cleaning report says, computed once, so the Markdown, Word and PDF writers cannot disagree.
 *
 * Measurement basis. Before and after figures are computed in the console on the rows the dataset keeps for profiling (its sample),
 * by running the recipe's steps over those rows with the same step engine the editor preview uses. Row counts are scaled to the
 * whole input. Run counters (rows read, written, rejected, duration) come from the run record as the runner reported them.
 */
import type { Cell, ColRole, ColType, ColumnProfile, Dataset, DatasetProfile, Recipe, Row, RunRecord, Step } from "@/lib/refinery/types";
import { QUALITY_WEIGHTS, guessRole, profileRows } from "@/lib/refinery/profile";
import { SENSOR_FORMULA, analyseSensors } from "@/lib/refinery/sensor";
import { STEP_BY_OP, describe, runSteps, startFrame } from "@/lib/refinery/steps";
import type { Frame } from "@/lib/refinery/steps";

export type ReportInput = { run: RunRecord; recipe?: Recipe; dataset?: Dataset; organisation: string; preparedBy: string; generatedAt: Date; sampleWorkspace: boolean };

export type Dimension = { key: "completeness" | "uniqueness" | "consistency" | "validity" | "composite"; label: string; weight: number; before: number; after: number; meaning: string };
export type StepRow = { n: number; id: string; op: string; label: string; group: string; what: string; strategy: string; rowsIn: number; rowsOut: number; changed: number; rejected: number; qualityAfter: number; note?: string; warning?: string; error?: string; ai: boolean };
export type ColumnDelta = { name: string; type: ColType; nullBefore: number | null; nullAfter: number | null; distinctBefore: number | null; distinctAfter: number | null; untidyBefore: number | null; untidyAfter: number | null; status: "unchanged" | "improved" | "new" | "removed" | "changed" };
export type FeatureRow = {
  name: string; type: ColType; role: ColRole; nullable: boolean; nullPct: number; distinct: number; range: string; example: string;
  origin: "source" | "derived"; derivedBy: string; description: string; guidance: string; pii: boolean;
};
export type Check = { id: string; label: string; status: "pass" | "warn" | "fail"; detail: string };
export type LineageNode = { id: string; kind: "source" | "step" | "output"; title: string; lines: string[] };
export type Scalar = { label: string; value: string };

export type ReportModel = {
  documentId: string; title: string; classification: string; version: string;
  organisation: string; generatedAt: string; sampleWorkspace: boolean;
  people: Scalar[]; timing: Scalar[];
  summary: string[]; headline: Scalar[];
  input: { rows: Scalar[]; columns: { name: string; type: ColType; role: ColRole; nullPct: number; distinct: number; pii: boolean }[] };
  pipeline: { rows: Scalar[]; steps: StepRow[]; strategy: string[] };
  quality: { dimensions: Dimension[]; formula: string; columns: ColumnDelta[]; progression: { label: string; score: number }[]; extra: Scalar[]; before: DatasetProfile | null; after: DatasetProfile | null };
  outputs: { name: string; target: string; format: string; kind: string }[];
  lineage: LineageNode[];
  readiness: { score: number; checks: Check[]; basis: string };
  features: FeatureRow[];
  sensor: { timeColumn: string; entityColumn: string | null; scoreBefore: number; scoreAfter: number | null; formula: string; basis: string; recommendations: string[]; note: string; head: string[]; rows: (string | number)[][] } | null;
  histogram: { column: string; before: { label: string; count: number }[]; after: { label: string; count: number }[] } | null;
  basis: string[];
  stepsTotals: { rowsRejected: number; rejectReasons: { reason: string; count: number; step: string }[] };
};

const num = (v: unknown, d = 0): number => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const r1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const pad = (n: number) => String(n).padStart(2, "0");
export const stamp = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
const dur = (ms: number) => { if (!ms) return "under 1 s"; const s = Math.round(ms / 1000); if (s < 1) return "under 1 s"; if (s < 60) return `${s} s`; const m = Math.floor(s / 60); if (m < 60) return `${m} min ${pad(s % 60)} s`; return `${Math.floor(m / 60)} h ${pad(m % 60)} min`; };

const STRATEGY: Record<string, string> = {
  Clean: "Standardise text so equal things look equal, before any comparison or counting.",
  "Missing values": "Decide explicitly what an empty value means: fill it with a justified value or remove the row.",
  "Types and schema": "Make every column the type the model will read it as, and keep only what is needed.",
  Rows: "Remove rows that would bias or leak: duplicates and rows outside the population of interest.",
  Quality: "Reject rows that break a stated rule, and keep them with the reason so nothing is lost silently.",
  Privacy: "Remove personal data before it reaches a training set or a model prompt.",
  "Feature engineering": "Create inputs the model can use, with values on comparable scales and without extreme outliers.",
  "Training sets": "Fix the train, validation and test sets once, repeatably, so results can be compared.",
  AI: "Use a model through the gateway for steps rules cannot do. Budgets and policies apply.",
};

function toColumns(f: Frame, base: Dataset | undefined, rows: Row[]) {
  const roles = new Map((base?.columns ?? []).map((c) => [c.name, c.role]));
  return f.columns.map((c) => {
    const known = roles.get(c.name);
    if (known) return { name: c.name, type: c.type, role: known };
    const distinct = new Set(rows.map((r) => String(r[c.name] ?? ""))).size;
    return { name: c.name, type: c.type, role: guessRole(c.name, c.type, distinct, rows.length) };
  });
}

/** Share of numeric values outside 1.5 times the interquartile range, over all numeric columns. */
function outlierShare(p: DatasetProfile, rows: Row[]): number {
  let out = 0, all = 0;
  for (const c of p.columns) {
    if ((c.type !== "integer" && c.type !== "decimal") || c.p25 === undefined || c.p75 === undefined) continue;
    const iqr = c.p75 - c.p25; const lo = c.p25 - 1.5 * iqr, hi = c.p75 + 1.5 * iqr;
    for (const r of rows) { const v = r[c.name]; if (typeof v !== "number") continue; all++; if (v < lo || v > hi) out++; }
  }
  return all ? r1((out / all) * 100) : 0;
}

function rangeOf(c: ColumnProfile): string {
  if (c.type === "integer" || c.type === "decimal") return c.min !== undefined ? `${c.min} to ${c.max}${c.mean !== undefined ? `, mean ${c.mean}` : ""}` : "";
  if (c.type === "date" || c.type === "timestamp") return c.min !== undefined ? `${c.min} to ${c.max}` : "";
  if (c.type === "boolean") return c.top.map((t) => t.value).join(", ");
  return c.minLen !== undefined ? `${c.minLen} to ${c.maxLen} characters` : "";
}

const NAME_HINTS: [RegExp, string][] = [
  [/(^|_)(id|uuid|key|ref)$|^id$/i, "Identifier of a record. Unique per entity."],
  [/(created|updated|signup|signed|order|event|ts|time|date)(_|$)/i, "Point in time the record refers to."],
  [/(amount|price|total|revenue|cost|spend|value)/i, "A monetary or measured amount."],
  [/(count|qty|quantity|num|n_)/i, "A count of items or events."],
  [/(email)/i, "Contact email address."], [/(phone|mobile)/i, "Contact phone number."],
  [/(name)/i, "Name of a person, product or place."], [/(country|region|city|state)/i, "Geographic attribute."],
  [/(status|state|stage|segment|tier|plan|category|type|topic|label|class)/i, "A category the record belongs to."],
  [/(text|comment|review|body|message|description|summary)/i, "Free text written by a person or a system."],
  [/(score|rate|ratio|pct|percent)/i, "A computed score or proportion."],
];
function describeColumn(name: string, type: ColType, role: ColRole, derived: string): string {
  if (derived) return derived;
  if (role === "label") return "The value a model is trained to predict.";
  for (const [re, text] of NAME_HINTS) if (re.test(name)) return text;
  return `${type === "string" ? "Text" : type[0].toUpperCase() + type.slice(1)} attribute of the record.`;
}

function guidance(c: ColumnProfile, derivedOp: string, role: ColRole): string {
  if (role === "label") return "Target. Never an input. Check class balance before training.";
  if (role === "identifier") return "Identifier. Keep for joins and traceability. Exclude from model inputs.";
  if (role === "ignore") return "Excluded by role. Not offered to the model.";
  if (c.pii) return "May hold personal data. Do not use as a model input without approval. See the legal notice.";
  if (derivedOp === "scale") return "Already scaled. Use as is. Fit any further scaler on the training set only.";
  if (derivedOp === "one_hot") return "One-hot indicator, 0 or 1. Use as is.";
  if (derivedOp === "label_encode") return "Integer code of a category. Treat as categorical, not as a quantity.";
  if (derivedOp === "hash_feature") return "Hash bucket of a category. Use as categorical, expect collisions.";
  if (derivedOp === "split") return "Set assignment. Use to select rows. Never an input.";
  if (c.type === "integer" || c.type === "decimal") return `Numeric. ${c.std !== undefined && c.std > 0 ? "Scale it for distance based or gradient based models." : "Constant in this sample, likely uninformative."}`;
  if (c.type === "boolean") return "Binary flag. Use as is.";
  if (c.type === "date" || c.type === "timestamp") return "Time. Extract calendar parts or time since an event. Do not feed the raw value.";
  if (c.distinct <= 1) return "Constant. Carries no signal. Drop it.";
  if (c.distinct <= 20) return `Categorical with ${c.distinct} levels. One-hot or target encode.`;
  return "High cardinality or free text. Embed, hash or drop.";
}

export function buildReport(inp: ReportInput): ReportModel {
  const { run, recipe, dataset } = inp;
  const steps: Step[] = recipe?.steps ?? [];
  const started = new Date(run.startedAt);
  const finished = run.status === "succeeded" || run.status === "failed" || run.status === "cancelled" ? new Date(started.getTime() + (run.durationMs || 0)) : null;
  const totalIn = run.rowsIn || dataset?.totalRows || 0;

  // Apply the recipe to the profiling sample, once, keeping every intermediate frame.
  const beforeCols = (dataset?.columns ?? []).map((c) => ({ name: c.name, type: c.type }));
  const sample = dataset?.sample ?? [];
  const frames = steps.length || sample.length ? runSteps(startFrame(beforeCols, sample), steps) : { frames: [startFrame(beforeCols, sample)], results: [] };
  const last = frames.frames[frames.frames.length - 1];
  const scale = sample.length ? totalIn / sample.length : 1;
  const afterRowsEstimate = sample.length ? Math.round(last.rows.length * scale) : run.rowsOut;
  const before = dataset ? profileRows(toColumns(frames.frames[0], dataset, sample), sample, dataset.totalRows) : null;
  const afterColumns = toColumns(last, dataset, last.rows);
  const after = dataset ? profileRows(afterColumns, last.rows, afterRowsEstimate) : null;

  // Quality after each step.
  const progression = [{ label: "Input", score: before?.quality ?? 0 }];
  if (dataset) frames.frames.slice(1).forEach((f, i) => progression.push({ label: `${i + 1}`, score: profileRows(toColumns(f, dataset, f.rows), f.rows, f.rows.length).quality }));

  // Step rows. Run counters win when the run reports them for the step.
  const byId = new Map(run.steps.map((s) => [s.id, s]));
  const stepRows: StepRow[] = steps.map((s, i) => {
    const def = STEP_BY_OP.get(s.op); const res = frames.results[i]; const rs = byId.get(s.id);
    return {
      n: i + 1, id: s.id, op: s.op, label: def?.label ?? s.op, group: def?.group ?? "Other", what: describe(s), strategy: STRATEGY[def?.group ?? ""] ?? "",
      rowsIn: rs ? rs.rowsIn : Math.round((res?.rowsIn ?? 0) * scale), rowsOut: rs ? rs.rowsOut : Math.round((res?.rowsOut ?? 0) * scale),
      changed: rs ? rs.changed : Math.round((res?.changed ?? 0) * scale), rejected: rs ? rs.rejected : Math.round((res?.rejected ?? 0) * scale),
      qualityAfter: progression[i + 1]?.score ?? 0, note: s.note, warning: res?.warning, error: res?.error, ai: !!def?.ai,
    };
  });

  // Dimensions.
  const W = QUALITY_WEIGHTS;
  const mk = (key: Dimension["key"], label: string, weight: number, b: number, a: number, meaning: string): Dimension => ({ key, label, weight, before: b, after: a, meaning });
  const bp = before?.parts, ap = after?.parts;
  const dimensions: Dimension[] = [
    mk("completeness", "Completeness", W.completeness, bp?.completeness ?? 0, ap?.completeness ?? 0, "Share of cells that hold a value."),
    mk("uniqueness", "Uniqueness", W.uniqueness, bp?.uniqueness ?? 0, ap?.uniqueness ?? 0, "Share of rows that are not exact repeats."),
    mk("consistency", "Consistency", W.consistency, bp?.consistency ?? 0, ap?.consistency ?? 0, "Text without stray spaces or mixed letter case."),
    mk("validity", "Validity", W.validity, bp?.validity ?? 0, ap?.validity ?? 0, "Typed values that fit their column type."),
    mk("composite", "Quality score", 100, before?.quality ?? 0, after?.quality ?? 0, "Weighted sum of the four dimensions."),
  ];
  const formula = `Quality score = ${W.completeness}% completeness + ${W.uniqueness}% uniqueness + ${W.consistency}% consistency + ${W.validity}% validity, each measured from 0 to 100.`;

  // Column deltas.
  const bmap = new Map((before?.columns ?? []).map((c) => [c.name, c])); const amap = new Map((after?.columns ?? []).map((c) => [c.name, c]));
  const names = [...new Set([...(before?.columns ?? []).map((c) => c.name), ...(after?.columns ?? []).map((c) => c.name)])];
  const columns: ColumnDelta[] = names.map((n) => {
    const b = bmap.get(n), a = amap.get(n);
    const status: ColumnDelta["status"] = !b ? "new" : !a ? "removed" : (a.nullPct < b.nullPct || a.untidyPct < b.untidyPct) ? "improved" : (a.nullPct === b.nullPct && a.distinct === b.distinct && a.untidyPct === b.untidyPct && a.type === b.type) ? "unchanged" : "changed";
    return { name: n, type: (a ?? b)!.type, nullBefore: b ? b.nullPct : null, nullAfter: a ? a.nullPct : null, distinctBefore: b ? b.distinct : null, distinctAfter: a ? a.distinct : null, untidyBefore: b ? b.untidyPct : null, untidyAfter: a ? a.untidyPct : null, status };
  });

  // A column the pipeline masks no longer carries personal data, even though its name still looks like it.
  const masked = new Set(steps.filter((s) => s.op === "pii_mask").flatMap((s) => (Array.isArray(s.params.columns) ? (s.params.columns as string[]) : [])));
  const piiBefore = (before?.columns ?? []).filter((c) => c.pii).length, piiAfter = (after?.columns ?? []).filter((c) => c.pii && !masked.has(c.name)).length;
  const extra: Scalar[] = [
    { label: "Rows rejected by rules", value: `${fmt(run.rowsRejected)} (${totalIn ? r1((run.rowsRejected / totalIn) * 100) : 0}% of rows read)` },
    { label: "Rows removed in total", value: `${fmt(Math.max(0, totalIn - run.rowsOut))} (${totalIn ? r1(((totalIn - run.rowsOut) / totalIn) * 100) : 0}%)` },
    { label: "Cells changed by steps", value: fmt(stepRows.reduce((a, s) => a + s.changed, 0)) },
    { label: "Duplicate rows, before and after", value: `${fmt(before?.duplicateRows ?? 0)} to ${fmt(after?.duplicateRows ?? 0)}` },
    { label: "Numeric outliers (1.5 x IQR), before and after", value: before && after ? `${outlierShare(before, sample)}% to ${outlierShare(after, last.rows)}%` : "n/a" },
    { label: "Columns flagged as personal data, before and after", value: `${piiBefore} to ${piiAfter}` },
    { label: "Columns, before and after", value: `${before?.columns.length ?? 0} to ${after?.columns.length ?? 0}` },
  ];

  // Features. A column is derived when it did not exist before a step and does after it.
  const origin = new Map<string, { op: string; text: string }>();
  frames.frames.forEach((f, i) => { if (i === 0) return; const prev = new Set(frames.frames[i - 1].columns.map((c) => c.name)); for (const c of f.columns) if (!prev.has(c.name) && !origin.has(c.name) && !(dataset?.columns ?? []).some((d) => d.name === c.name)) origin.set(c.name, { op: steps[i - 1].op, text: describe(steps[i - 1]) }); });
  const features: FeatureRow[] = (after?.columns ?? []).map((c) => {
    const o = origin.get(c.name); const role: ColRole = o?.op === "split" ? "ignore" : (afterColumns.find((x) => x.name === c.name)?.role ?? c.role);
    return {
      name: c.name, type: c.type, role, nullable: c.nullCount > 0, nullPct: c.nullPct, distinct: c.distinct, range: rangeOf(c),
      example: c.top[0]?.value ?? "", origin: o ? "derived" : "source", derivedBy: o ? o.text : "", description: describeColumn(c.name, c.type, role, o ? `Derived: ${o.text}.` : ""),
      guidance: masked.has(c.name) ? "Personal data was masked by the pipeline. The values are placeholders, usually uninformative as a model input." : guidance(c, o?.op ?? "", role), pii: c.pii && !masked.has(c.name),
    };
  });

  // Readiness checks on the output.
  const feats = features.filter((f) => f.role === "feature");
  const checks: Check[] = [];
  const nulls = feats.filter((f) => f.nullPct > 0);
  checks.push({ id: "missing", label: "No missing values in feature columns", status: nulls.length === 0 ? "pass" : nulls.some((f) => f.nullPct >= 5) ? "fail" : "warn", detail: nulls.length ? `${nulls.length} column${nulls.length === 1 ? "" : "s"} still have gaps: ${nulls.slice(0, 4).map((f) => `${f.name} ${f.nullPct}%`).join(", ")}.` : "Every feature column is complete." });
  checks.push({ id: "dups", label: "No duplicate rows", status: (after?.duplicateRows ?? 0) === 0 ? "pass" : "fail", detail: (after?.duplicateRows ?? 0) === 0 ? "No exact repeats in the output sample." : `About ${fmt(after?.duplicateRows ?? 0)} repeated rows remain.` });
  const pii = feats.filter((f) => f.pii);
  checks.push({ id: "pii", label: "No personal data in feature columns", status: pii.length === 0 ? "pass" : "fail", detail: pii.length ? `Review ${pii.map((f) => f.name).join(", ")}.` : "No column looks like personal data." });
  const labels = features.filter((f) => f.role === "label");
  checks.push({ id: "label", label: "A label column is defined", status: labels.length ? "pass" : "warn", detail: labels.length ? `Label: ${labels.map((f) => f.name).join(", ")}.` : "No column has the label role. Fine for unsupervised work or retrieval." });
  const constant = feats.filter((f) => f.distinct <= 1);
  checks.push({ id: "constant", label: "No constant feature columns", status: constant.length === 0 ? "pass" : "warn", detail: constant.length ? `${constant.map((f) => f.name).join(", ")} never vary.` : "Every feature varies." });
  const ids = features.filter((f) => f.role === "identifier");
  checks.push({ id: "ids", label: "Identifiers are marked and kept out of training", status: "pass", detail: ids.length ? `${ids.map((f) => f.name).join(", ")} carry the identifier role.` : "No identifier column present." });
  const hasSplit = steps.some((s) => s.op === "split");
  checks.push({ id: "split", label: "Train, validation and test sets are fixed", status: hasSplit ? "pass" : "warn", detail: hasSplit ? "A split step assigns every row to a set." : "No split step. Split before training to avoid leakage." });
  const text = feats.filter((f) => f.type === "string" && f.distinct > 20 && !f.pii);
  checks.push({ id: "text", label: "Text and high cardinality columns have a plan", status: text.length === 0 ? "pass" : "warn", detail: text.length ? `${text.slice(0, 4).map((f) => f.name).join(", ")} need encoding or embedding.` : "No high cardinality text feature." });
  // Sensor quality, when the dataset is a time series.
  const sb = dataset ? analyseSensors(toColumns(frames.frames[0], dataset, sample), sample) : null;
  const sa = sb && dataset ? analyseSensors(afterColumns, last.rows) : null;
  if (sb) checks.push({ id: "sensor", label: "Sensor signals pass the sensor quality check", status: !sa ? "warn" : sa.score >= 90 ? "pass" : sa.score >= 75 ? "warn" : "fail", detail: sa ? `Sensor quality ${sb.score} before, ${sa.score} after, on a scale of 100. ${sa.totals.gaps} gaps, ${sa.totals.flatlineSamples} flatline samples, ${sa.totals.spikes + sa.totals.shiftSamples} spikes or shifted samples, ${sa.totals.implausible} implausible values remain.` : "The output no longer has a time column, so sensor quality cannot be checked." });
  const sensor: ReportModel["sensor"] = sb ? (() => {
    const key = (x: { entity: string; column: string }) => `${x.entity}|${x.column}`; const am = new Map((sa?.series ?? []).map((x) => [key(x), x]));
    const f = (x: (typeof sb.series)[number] | undefined, k: "gap" | "flat" | "spike" | "imp") => (x ? String(k === "gap" ? x.gaps.missing : k === "flat" ? x.flatlines.samples : k === "spike" ? x.spikes.count + x.shifts.samples : x.implausible.count) : "-");
    return {
      timeColumn: sb.timeColumn, entityColumn: sb.entityColumn, scoreBefore: sb.score, scoreAfter: sa ? sa.score : null, formula: SENSOR_FORMULA, basis: sb.basis, recommendations: sb.recommendations,
      head: ["Machine", "Signal", "Score before", "Score after", "Missing samples", "Flatline samples", "Spikes and shifts", "Implausible"],
      note: !sa ? "" : sa.score < sb.score ? "Sensor quality fell. Rows that a step rejects leave gaps in a continuous signal, so rejecting readings can cost more than it saves. Where the fault is understood, correct it (convert the unit, fill the value) instead of dropping the row." : sa.score > sb.score ? "Sensor quality rose: the pipeline removed more faults than it opened gaps." : "Sensor quality did not change.",
      rows: sb.series.map((x) => { const a = am.get(key(x)); return [x.entity, x.column, x.score, a ? a.score : "-", `${f(x, "gap")} to ${f(a, "gap")}`, `${f(x, "flat")} to ${f(a, "flat")}`, `${f(x, "spike")} to ${f(a, "spike")}`, `${f(x, "imp")} to ${f(a, "imp")}`]; }),
    };
  })() : null;
  const readyScore = Math.round((checks.reduce((a, c) => a + (c.status === "pass" ? 1 : c.status === "warn" ? 0.5 : 0), 0) / checks.length) * 100);

  // Lineage.
  const lineage: LineageNode[] = [{ id: "src", kind: "source", title: dataset?.name ?? run.datasetName, lines: [`${fmt(totalIn)} rows`, `Quality ${before?.quality ?? "n/a"}`, run.snapshot] }];
  stepRows.forEach((s) => lineage.push({ id: s.id, kind: "step", title: `${s.n}. ${s.label}`, lines: [s.what.length > 34 ? `${s.what.slice(0, 33)}...` : s.what, `${fmt(s.rowsIn)} to ${fmt(s.rowsOut)} rows`, `${fmt(s.changed)} changed${s.rejected ? `, ${fmt(s.rejected)} rejected` : ""}`] }));
  const outs = (recipe?.outputs ?? []).length ? recipe!.outputs : [{ name: "output", kind: "dataset" as const, target: "", format: "parquet" as const }];
  outs.forEach((o, i) => lineage.push({ id: `out${i}`, kind: "output", title: o.name, lines: [`${fmt(run.rowsOut)} rows`, `Quality ${after?.quality ?? "n/a"}`, o.target.length > 34 ? `${o.target.slice(0, 33)}...` : o.target || o.format] }));

  // Histogram: first numeric column present in both with a histogram.
  let histogram: ReportModel["histogram"] = null;
  for (const c of after?.columns ?? []) { const b = bmap.get(c.name); if (c.role !== "identifier" && c.role !== "label" && !c.name.startsWith("_") && (c.type === "integer" || c.type === "decimal") && b && b.histogram.length > 1 && c.histogram.length > 1) { histogram = { column: c.name, before: b.histogram, after: c.histogram }; break; } }

  const day = `${started.getUTCFullYear()}${pad(started.getUTCMonth() + 1)}${pad(started.getUTCDate())}`;
  const title = `Data Preparation Report: ${recipe?.name ?? run.recipeName}`;
  const covered = steps.length ? `${steps.length} step${steps.length === 1 ? "" : "s"}` : "no steps";
  const dQ = (after?.quality ?? 0) - (before?.quality ?? 0);
  const summary = [
    `This report documents run ${run.id} of the pipeline "${run.recipeName}" (version ${run.recipeVersion}), which prepared the dataset "${dataset?.name ?? run.datasetName}" in ${covered}. The run ${run.status === "succeeded" ? "completed" : run.status} and read ${fmt(run.rowsIn)} rows, wrote ${fmt(run.rowsOut)} and rejected ${fmt(run.rowsRejected)}.`,
    before && after ? `The quality score moved from ${before.quality} to ${after.quality} out of 100 (${dQ >= 0 ? "+" : ""}${dQ} points). Completeness went from ${before.parts.completeness}% to ${after.parts.completeness}%, uniqueness from ${before.parts.uniqueness}% to ${after.parts.uniqueness}% and consistency from ${before.parts.consistency}% to ${after.parts.consistency}%.` : "No profile was available for the input dataset, so quality scores are not reported.",
    `The output has ${features.length} columns, ${feats.length} of them usable as model inputs. ML readiness checks passed ${checks.filter((c) => c.status === "pass").length} of ${checks.length}.`,
  ];

  const basis = [
    `Before and after figures are computed in the console on ${fmt(sample.length)} sampled rows${totalIn && sample.length ? ` (${r1((sample.length / totalIn) * 100)}% of the ${fmt(totalIn)} rows read)` : ""}, by applying the pipeline's steps with the same step engine the editor preview uses. Counts are scaled to the full input.`,
    "Run counters (rows read, written, rejected, duration) are those reported by the engine that ran the pipeline.",
    "The quality score is a documented weighted composite of four dimensions. It is useful to compare a dataset with itself over time. It is not an industry standard and not comparable across organisations.",
    inp.sampleWorkspace ? "This run belongs to the sample workspace and was simulated. Nothing was read or written. Figures are illustrative." : "Statistics that need the whole dataset, such as exact distinct counts, are estimates on the sample.",
  ];

  const strategy = [
    "Prepare in a fixed order: standardise text, resolve missing values, correct types, remove duplicates and out-of-scope rows, enforce rules, protect personal data, then engineer features and fix the training sets. Each step sees the output of the one before.",
    "Never lose data silently. Rows that break a rule are rejected with the reason and counted, rather than dropped without a trace.",
    "Keep the pipeline repeatable. The same steps on the same input version produce the same output, which is what makes the split and the scores comparable between runs.",
    ...[...new Set(stepRows.map((s) => s.group))].filter((g) => STRATEGY[g]).map((g) => `${g}: ${STRATEGY[g]}`),
  ];

  return {
    documentId: `RPT-${run.id.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}-${day}`, title, classification: "Internal", version: "1.0", organisation: inp.organisation, generatedAt: stamp(inp.generatedAt), sampleWorkspace: inp.sampleWorkspace,
    people: [
      { label: "Report prepared by", value: inp.preparedBy },
      { label: "Pipeline run started by", value: run.startedBy + (run.trigger === "manual" ? "" : ` (${run.trigger})`) },
      { label: "Pipeline last edited by", value: recipe?.updatedBy ?? "not recorded" },
      { label: "Dataset owner", value: dataset?.owner ?? "not recorded" },
    ],
    timing: [
      { label: "Run started", value: stamp(started) }, { label: "Run finished", value: finished ? stamp(finished) : "still running" },
      { label: "Run duration", value: dur(run.durationMs) }, { label: "Report generated", value: stamp(inp.generatedAt) },
    ],
    summary,
    headline: [
      { label: "Quality score", value: before && after ? `${before.quality} to ${after.quality}` : "n/a" }, { label: "Rows read", value: fmt(run.rowsIn) },
      { label: "Rows written", value: fmt(run.rowsOut) }, { label: "Rows rejected", value: fmt(run.rowsRejected) }, { label: "ML readiness", value: `${readyScore} / 100` },
    ],
    input: {
      rows: [
        { label: "Dataset", value: `${dataset?.name ?? run.datasetName}${dataset ? ` (version ${dataset.version})` : ""}` },
        { label: "Description", value: dataset?.description || "none given" },
        { label: "Source", value: dataset ? (dataset.source.kind === "upload" ? `Uploaded file ${dataset.source.fileName}` : dataset.source.kind === "connection" ? `Connection ${dataset.source.connectionId}, ${dataset.source.location}` : dataset.source.kind === "query" ? `Query on connection ${dataset.source.connectionId}` : dataset.source.kind === "model" ? "Unified dataset built from several tables" : `Document folder ${dataset.source.folder}`) : "not recorded" },
        { label: "Format", value: dataset?.format ?? "not recorded" }, { label: "Rows", value: fmt(totalIn) }, { label: "Size", value: dataset ? `${(dataset.sizeBytes / 1e6).toFixed(1)} MB` : "n/a" },
        { label: "Input snapshot", value: run.snapshot }, { label: "Columns", value: String(before?.columns.length ?? 0) },
      ],
      columns: (before?.columns ?? []).map((c) => ({ name: c.name, type: c.type, role: c.role, nullPct: c.nullPct, distinct: c.distinct, pii: c.pii })),
    },
    pipeline: {
      rows: [
        { label: "Pipeline", value: `${run.recipeName} (version ${run.recipeVersion})` }, { label: "Description", value: recipe?.description || "none given" },
        { label: "Compute pool", value: run.pool }, { label: "Parallelism", value: `${run.parallelism} tasks at once` },
        { label: "Mode", value: recipe?.incremental ? "Incremental, only new data" : "Full read of the input" }, { label: "Trigger", value: run.trigger },
        { label: "Model calls", value: run.aiCalls ? `${fmt(run.aiCalls)} (cost $${run.aiCostUsd.toFixed(2)})` : "none" },
      ],
      steps: stepRows, strategy,
    },
    quality: { dimensions, formula, columns, progression, extra, before, after },
    outputs: (recipe?.outputs ?? []).map((o) => ({ name: o.name, target: o.target, format: o.format, kind: o.kind })),
    lineage, readiness: { score: readyScore, checks, basis: "ML readiness is the share of the checks above that pass, counting a warning as half. It is a checklist, not a guarantee of model performance." },
    features, histogram, sensor, basis,
    stepsTotals: { rowsRejected: run.rowsRejected, rejectReasons: run.rejects },
  };
}

export type { Cell };
