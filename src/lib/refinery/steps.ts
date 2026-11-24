import { EXTRA_STEPS, applyExtra, describeExtra, validateExtra } from "./ops-extra";
import type { Cell, ColType, Row, Step } from "./types";

/**
 * The step catalogue and a small engine that runs the row by row steps on the preview sample in the browser (docs/46, recipe spec).
 * Steps that call a model (AI group) are never run here: they need the gateway, so the preview adds an empty output column and says so.
 * On a runner the same spec is executed by the engine the pool uses.
 */

export type ParamKind = "column" | "columns" | "text" | "number" | "select" | "boolean" | "lines" | "multi" | "function" | "connection";
export type ParamDef = { key: string; label: string; kind: ParamKind; options?: { value: string; label: string }[]; def?: unknown; hint?: string; optional?: boolean; placeholder?: string };
export type StepGroup = "Clean" | "Missing values" | "Types and schema" | "Rows" | "Quality" | "Privacy" | "Feature engineering" | "Documents" | "Functions and connectors" | "AI" | "Training sets";
export type StepDef = { op: string; group: StepGroup; label: string; blurb: string; params: ParamDef[]; streamable: boolean; batchOnly?: string; ai?: boolean; /** Runs on the runner and cannot be previewed in the browser (functions, connector lookups). */ remote?: boolean };

const CASES = [{ value: "lower", label: "lower case" }, { value: "upper", label: "UPPER CASE" }, { value: "title", label: "Title Case" }];
const MODELS = [{ value: "alias:fast-classifier", label: "fast-classifier" }, { value: "alias:balanced-reasoner", label: "balanced-reasoner" }, { value: "alias:long-context", label: "long-context" }];

const CORE_STEPS: StepDef[] = [
  { op: "trim", group: "Clean", label: "Trim whitespace", blurb: "Remove spaces at the start and end, optionally collapse repeated inner spaces.", streamable: true,
    params: [{ key: "columns", label: "Columns", kind: "columns", hint: "Leave empty for every text column.", optional: true }, { key: "collapse", label: "Collapse repeated spaces", kind: "boolean", def: true }] },
  { op: "case", group: "Clean", label: "Change case", blurb: "Make letter case consistent.", streamable: true,
    params: [{ key: "columns", label: "Columns", kind: "columns" }, { key: "mode", label: "Case", kind: "select", options: CASES, def: "lower" }] },
  { op: "replace", group: "Clean", label: "Replace text", blurb: "Replace one piece of text with another.", streamable: true,
    params: [{ key: "columns", label: "Columns", kind: "columns" }, { key: "find", label: "Find", kind: "text" }, { key: "with", label: "Replace with", kind: "text", optional: true }] },
  { op: "regex_replace", group: "Clean", label: "Replace by pattern", blurb: "Replace everything that matches a regular expression.", streamable: true,
    params: [{ key: "columns", label: "Columns", kind: "columns" }, { key: "pattern", label: "Pattern", kind: "text", placeholder: "[^\\x20-\\x7E]" }, { key: "with", label: "Replace with", kind: "text", optional: true }] },
  { op: "fill_missing", group: "Missing values", label: "Fill missing values", blurb: "Replace empty cells with a constant, the mean, median or most common value.", streamable: true,
    params: [{ key: "column", label: "Column", kind: "column" }, { key: "strategy", label: "Fill with", kind: "select", def: "constant", options: [{ value: "constant", label: "A constant" }, { value: "mean", label: "Mean (numbers)" }, { value: "median", label: "Median (numbers)" }, { value: "mode", label: "Most common value" }] }, { key: "value", label: "Constant", kind: "text", optional: true, hint: "Used when filling with a constant." }] },
  { op: "drop_missing", group: "Missing values", label: "Drop rows with missing values", blurb: "Remove rows that are empty in any of the chosen columns.", streamable: true,
    params: [{ key: "columns", label: "Columns", kind: "columns" }] },
  { op: "cast", group: "Types and schema", label: "Change type", blurb: "Convert a column to another type. Values that cannot be converted become empty.", streamable: true,
    params: [{ key: "column", label: "Column", kind: "column" }, { key: "to", label: "New type", kind: "select", def: "integer", options: [{ value: "integer", label: "Integer" }, { value: "decimal", label: "Decimal" }, { value: "boolean", label: "Boolean" }, { value: "string", label: "Text" }] }] },
  { op: "rename", group: "Types and schema", label: "Rename column", blurb: "Give a column a new name.", streamable: true,
    params: [{ key: "column", label: "Column", kind: "column" }, { key: "to", label: "New name", kind: "text" }] },
  { op: "drop_columns", group: "Types and schema", label: "Drop columns", blurb: "Remove columns that the output does not need.", streamable: true,
    params: [{ key: "columns", label: "Columns", kind: "columns" }] },
  { op: "filter", group: "Rows", label: "Filter rows", blurb: "Keep only the rows that match a condition.", streamable: true,
    params: [{ key: "column", label: "Column", kind: "column" }, { key: "cmp", label: "Condition", kind: "select", def: "not_empty", options: [{ value: "not_empty", label: "is not empty" }, { value: "is_empty", label: "is empty" }, { value: "eq", label: "equals" }, { value: "ne", label: "does not equal" }, { value: "contains", label: "contains" }, { value: "gt", label: "is greater than" }, { value: "lt", label: "is less than" }] }, { key: "value", label: "Value", kind: "text", optional: true }] },
  { op: "drop_duplicates", group: "Rows", label: "Drop duplicate rows", blurb: "Keep one row for each combination of the key columns.", streamable: false, batchOnly: "Needs every row. In a stream use duplicates within a time window instead.",
    params: [{ key: "keys", label: "Key columns", kind: "columns", hint: "Leave empty to compare whole rows.", optional: true }, { key: "keep", label: "Keep", kind: "select", def: "first", options: [{ value: "first", label: "The first row" }, { value: "last", label: "The last row" }] }] },
  { op: "validate", group: "Quality", label: "Validate against a rule", blurb: "Rows that fail go to the rejected output with the reason.", streamable: true,
    params: [{ key: "column", label: "Column", kind: "column" }, { key: "rule", label: "Rule", kind: "select", def: "not_empty", options: [{ value: "not_empty", label: "is not empty" }, { value: "range", label: "is within a range" }, { value: "pattern", label: "matches a pattern" }, { value: "length", label: "has a text length within a range" }] }, { key: "min", label: "Minimum", kind: "number", optional: true }, { key: "max", label: "Maximum", kind: "number", optional: true }, { key: "pattern", label: "Pattern", kind: "text", optional: true, placeholder: "^[A-Z]{2}-\\d+$" }] },
  { op: "clip_outliers", group: "Feature engineering", label: "Clip outliers", blurb: "Pull values outside 1.5 times the interquartile range back to the limit.", streamable: false, batchOnly: "Needs the whole column to find the range.",
    params: [{ key: "column", label: "Column", kind: "column" }] },
  { op: "scale", group: "Feature engineering", label: "Scale numbers", blurb: "Rescale a numeric column for model training.", streamable: false, batchOnly: "Needs the whole column to find the range.",
    params: [{ key: "column", label: "Column", kind: "column" }, { key: "method", label: "Method", kind: "select", def: "minmax", options: [{ value: "minmax", label: "Min-max (0 to 1)" }, { value: "standard", label: "Standard (z-score)" }] }] },
  { op: "pii_mask", group: "Privacy", label: "Mask personal data", blurb: "Find email addresses and phone numbers inside text and replace them.", streamable: true,
    params: [{ key: "columns", label: "Columns", kind: "columns" }, { key: "style", label: "Replace with", kind: "select", def: "token", options: [{ value: "token", label: "A label such as [EMAIL]" }, { value: "stars", label: "Asterisks" }, { value: "hash", label: "A short hash" }] }] },
  { op: "ai_classify", group: "AI", label: "Classify with a model", blurb: "Assign each row one of your labels. Runs through the gateway, so budgets and policies apply.", streamable: true, ai: true,
    params: [{ key: "column", label: "Text column", kind: "column" }, { key: "into", label: "Output column", kind: "text", def: "topic" }, { key: "labels", label: "Labels", kind: "lines", hint: "One label per line." }, { key: "model", label: "Model", kind: "select", options: MODELS, def: "alias:fast-classifier" }, { key: "maxCost", label: "Cost cap (USD)", kind: "number", def: 25 }] },
  { op: "ai_extract", group: "AI", label: "Extract fields with a model", blurb: "Pull structured values out of free text.", streamable: true, ai: true,
    params: [{ key: "column", label: "Text column", kind: "column" }, { key: "fields", label: "Fields to extract", kind: "lines", hint: "One field name per line." }, { key: "model", label: "Model", kind: "select", options: MODELS, def: "alias:balanced-reasoner" }, { key: "maxCost", label: "Cost cap (USD)", kind: "number", def: 60 }] },
  { op: "ai_summarise", group: "AI", label: "Summarise with a model", blurb: "Write a short summary of long text.", streamable: true, ai: true,
    params: [{ key: "column", label: "Text column", kind: "column" }, { key: "into", label: "Output column", kind: "text", def: "summary" }, { key: "model", label: "Model", kind: "select", options: MODELS, def: "alias:balanced-reasoner" }, { key: "maxCost", label: "Cost cap (USD)", kind: "number", def: 80 }] },
  { op: "split", group: "Training sets", label: "Split train, validation, test", blurb: "Assign every row to a set, repeatably, for model training.", streamable: false, batchOnly: "Needs the full dataset to balance the sets.",
    params: [{ key: "train", label: "Train %", kind: "number", def: 80 }, { key: "validation", label: "Validation %", kind: "number", def: 10 }, { key: "test", label: "Test %", kind: "number", def: 10 }, { key: "seed", label: "Seed", kind: "number", def: 42 }] },
];

export const STEPS: StepDef[] = [...CORE_STEPS, ...EXTRA_STEPS];
export const STEP_BY_OP = new Map(STEPS.map((s) => [s.op, s]));
export const GROUPS: StepGroup[] = ["Clean", "Missing values", "Types and schema", "Rows", "Quality", "Privacy", "Feature engineering", "Documents", "Functions and connectors", "AI", "Training sets"];

export function newStep(op: string, id: string): Step {
  const def = STEP_BY_OP.get(op)!;
  const params: Record<string, unknown> = {};
  for (const p of def.params) if (p.def !== undefined) params[p.key] = p.def;
  return { id, op, params };
}

export type Col = { name: string; type: ColType };
export type Frame = { columns: Col[]; rows: Row[]; idx: number[] };
export type StepResult = { rowsIn: number; rowsOut: number; changed: number; rejected: number; rejectReason?: string; warning?: string; error?: string; ai?: boolean; remote?: boolean };

const asList = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : typeof v === "string" && v ? [v] : []);
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : v === undefined || v === null ? d : String(v));
const num = (v: unknown, d = 0): number => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const isEmpty = (v: Cell) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

export function describe(step: Step): string {
  const p = step.params; const cols = asList(p.columns).join(", ") || "all text columns";
  switch (step.op) {
    case "trim": return `Trim spaces in ${cols}`;
    case "case": return `Make ${cols} ${str(p.mode, "lower")} case`;
    case "replace": return `Replace "${str(p.find)}" in ${cols}`;
    case "regex_replace": return `Replace /${str(p.pattern)}/ in ${cols}`;
    case "fill_missing": return `Fill empty ${str(p.column, "column")} with ${p.strategy === "constant" ? `"${str(p.value)}"` : str(p.strategy, "constant")}`;
    case "drop_missing": return `Drop rows empty in ${cols}`;
    case "cast": return `${str(p.column, "column")} to ${str(p.to, "type")}`;
    case "rename": return `Rename ${str(p.column, "column")} to ${str(p.to)}`;
    case "drop_columns": return `Drop ${cols}`;
    case "filter": return `Keep rows where ${str(p.column, "column")} ${str(p.cmp, "").replace("_", " ")} ${str(p.value)}`.trim();
    case "drop_duplicates": return `Drop duplicates on ${asList(p.keys).join(", ") || "whole rows"}`;
    case "validate": return `Validate ${str(p.column, "column")} ${str(p.rule, "").replace("_", " ")}`;
    case "clip_outliers": return `Clip outliers in ${str(p.column, "column")}`;
    case "scale": return `Scale ${str(p.column, "column")} (${str(p.method, "minmax")})`;
    case "pii_mask": return `Mask personal data in ${cols}`;
    case "ai_classify": return `Classify ${str(p.column, "text")} into ${str(p.into, "topic")}`;
    case "ai_extract": return `Extract ${asList(str(p.fields).split("\n").filter(Boolean)).length} fields from ${str(p.column, "text")}`;
    case "ai_summarise": return `Summarise ${str(p.column, "text")}`;
    case "split": return `Split ${num(p.train, 80)} / ${num(p.validation, 10)} / ${num(p.test, 10)}`;
    default: return describeExtra(step) ?? step.op;
  }
}

/** A message when the step cannot run as configured, shown beside the step. */
export function validateStep(step: Step, cols: Col[]): string | null {
  const def = STEP_BY_OP.get(step.op);
  if (!def) return "Unknown step.";
  const names = new Set(cols.map((c) => c.name));
  for (const p of def.params) {
    const v = step.params[p.key];
    if (p.kind === "column") { if (!v && p.optional) continue; if (!v) return `Choose a ${p.label.toLowerCase()}.`; if (!names.has(String(v))) return `Column "${v}" does not exist at this point.`; }
    if (p.kind === "columns") { const l = asList(v); if (!p.optional && l.length === 0) return `Choose at least one column.`; const miss = l.find((c) => !names.has(c)); if (miss) return `Column "${miss}" does not exist at this point.`; }
    if ((p.kind === "function" || p.kind === "connection") && !str(v)) return `Choose a ${p.label.toLowerCase()}.`;
    if ((p.kind === "text" || p.kind === "lines") && !p.optional && !str(v).trim()) return `${p.label} is required.`;
  }
  if (step.op === "regex_replace" || (step.op === "validate" && step.params.rule === "pattern")) {
    try { new RegExp(str(step.params.pattern)); } catch { return "The pattern is not a valid regular expression."; }
    if (step.op === "validate" && !str(step.params.pattern)) return "Pattern is required.";
  }
  if (step.op === "split" && Math.abs(num(step.params.train, 0) + num(step.params.validation, 0) + num(step.params.test, 0) - 100) > 0.001) return "The three percentages must add up to 100.";
  if (step.op === "rename") { const to = str(step.params.to).trim(); if (to && names.has(to) && to !== step.params.column) return `A column named "${to}" already exists.`; }
  if (step.op === "filter" && !["not_empty", "is_empty"].includes(str(step.params.cmp)) && str(step.params.value) === "") return "Value is required.";
  const ex = validateExtra(step, cols); if (ex) return ex;
  if (step.op === "fill_missing" && step.params.strategy === "constant" && str(step.params.value) === "") return "Enter the constant to fill with.";
  return null;
}

const TITLE = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /(?<![\w])\+?\d[\d\s().-]{7,}\d(?![\w])/g;
function hash(s: string): string { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, "0"); }
/** Repeatable value in [0, 1) for a seed and a row position (a 32 bit integer finaliser, so neighbouring rows are not neighbours in value). */
function unit(seed: number, i: number): number { let x = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(i + 1, 0x85ebca6b)) >>> 0; x ^= x >>> 16; x = Math.imul(x, 0x7feb352d) >>> 0; x ^= x >>> 15; x = Math.imul(x, 0x846ca68b) >>> 0; x ^= x >>> 16; return (x >>> 0) / 4294967296; }
function quantile(sorted: number[], q: number) { if (!sorted.length) return 0; const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos); return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo); }
const textCols = (f: Frame) => f.columns.filter((c) => c.type === "string").map((c) => c.name);

/** Runs one step. Returns a new frame and counts; never mutates the input frame. */
export function applyStep(f: Frame, step: Step): { frame: Frame; result: StepResult } {
  const rowsIn = f.rows.length;
  const err = validateStep(step, f.columns);
  if (err) return { frame: f, result: { rowsIn, rowsOut: rowsIn, changed: 0, rejected: 0, error: err } };
  const extra = applyExtra(f, step); if (extra) return extra;
  const p = step.params;
  let changed = 0, rejected = 0, rejectReason: string | undefined, warning: string | undefined, ai = false;
  let columns = f.columns; let rows = f.rows; let idx = f.idx;
  const mapCols = (names: string[], fn: (v: string) => string) => {
    rows = rows.map((r) => { let o: Row | null = null; for (const c of names) { const v = r[c]; if (typeof v === "string") { const nv = fn(v); if (nv !== v) { o ??= { ...r }; o[c] = nv; changed++; } } } return o ?? r; });
  };
  switch (step.op) {
    case "trim": { const names = asList(p.columns).length ? asList(p.columns) : textCols(f); mapCols(names, (v) => (p.collapse ? v.trim().replace(/\s+/g, " ") : v.trim())); break; }
    case "case": { const m = str(p.mode, "lower"); mapCols(asList(p.columns), (v) => (m === "upper" ? v.toUpperCase() : m === "title" ? TITLE(v) : v.toLowerCase())); break; }
    case "replace": { const find = str(p.find), w = str(p.with); if (find) mapCols(asList(p.columns), (v) => v.split(find).join(w)); break; }
    case "regex_replace": { const re = new RegExp(str(p.pattern), "g"); mapCols(asList(p.columns), (v) => v.replace(re, str(p.with))); break; }
    case "fill_missing": {
      const c = str(p.column); const strat = str(p.strategy, "constant");
      const present = rows.map((r) => r[c]).filter((v) => !isEmpty(v ?? null));
      let fill: Cell = str(p.value);
      const colType = f.columns.find((x) => x.name === c)?.type;
      if (strat === "mean" || strat === "median") {
        const nums = present.filter((v): v is number => typeof v === "number").sort((a, b) => a - b);
        if (!nums.length) { warning = "No numbers to calculate from."; break; }
        fill = strat === "mean" ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : quantile(nums, 0.5);
      } else if (strat === "mode") {
        const m = new Map<string, number>(); for (const v of present) m.set(String(v), (m.get(String(v)) ?? 0) + 1);
        const best = [...m.entries()].sort((a, b) => b[1] - a[1])[0]; if (!best) { warning = "No values to choose from."; break; }
        fill = present.find((v) => String(v) === best[0]) as Cell;
      } else if ((colType === "integer" || colType === "decimal") && RE_NUM.test(str(p.value))) fill = Number(p.value);
      rows = rows.map((r) => { if (isEmpty(r[c] ?? null)) { changed++; return { ...r, [c]: fill }; } return r; });
      break;
    }
    case "drop_missing": { const cs = asList(p.columns); const keep: number[] = []; rows = rows.filter((r, i) => { const bad = cs.some((c) => isEmpty(r[c] ?? null)); if (!bad) keep.push(idx[i]); return !bad; }); idx = keep; break; }
    case "cast": {
      const c = str(p.column), to = str(p.to);
      rows = rows.map((r) => {
        const v = r[c]; if (isEmpty(v ?? null)) return r;
        let nv: Cell;
        if (to === "string") nv = String(v);
        else if (to === "boolean") nv = typeof v === "boolean" ? v : /^(true|yes|1)$/i.test(String(v)) ? true : /^(false|no|0)$/i.test(String(v)) ? false : null;
        else { const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, "")); nv = Number.isFinite(n) ? (to === "integer" ? Math.round(n) : n) : null; }
        if (nv !== v) changed++;
        return { ...r, [c]: nv };
      });
      columns = columns.map((x) => (x.name === c ? { ...x, type: to as ColType } : x));
      break;
    }
    case "rename": { const c = str(p.column), to = str(p.to).trim(); if (to && to !== c) { columns = columns.map((x) => (x.name === c ? { ...x, name: to } : x)); rows = rows.map((r) => { const o: Row = {}; for (const k of Object.keys(r)) o[k === c ? to : k] = r[k]; return o; }); changed = rows.length; } break; }
    case "drop_columns": { const d = new Set(asList(p.columns)); columns = columns.filter((x) => !d.has(x.name)); rows = rows.map((r) => { const o: Row = {}; for (const k of Object.keys(r)) if (!d.has(k)) o[k] = r[k]; return o; }); break; }
    case "filter": {
      const c = str(p.column), cmp = str(p.cmp), val = str(p.value);
      const keep: number[] = [];
      rows = rows.filter((r, i) => {
        const v = r[c] ?? null; const s = v === null ? "" : String(v); let ok = true;
        if (cmp === "not_empty") ok = !isEmpty(v); else if (cmp === "is_empty") ok = isEmpty(v);
        else if (cmp === "eq") ok = s.trim().toLowerCase() === val.trim().toLowerCase(); else if (cmp === "ne") ok = s.trim().toLowerCase() !== val.trim().toLowerCase();
        else if (cmp === "contains") ok = s.toLowerCase().includes(val.toLowerCase());
        else if (cmp === "gt") ok = typeof v === "number" && v > Number(val); else if (cmp === "lt") ok = typeof v === "number" && v < Number(val);
        if (ok) keep.push(idx[i]); return ok;
      });
      idx = keep; break;
    }
    case "drop_duplicates": {
      const keys = asList(p.keys).length ? asList(p.keys) : f.columns.map((c) => c.name);
      const last = p.keep === "last"; const seen = new Map<string, number>();
      rows.forEach((r, i) => { const k = JSON.stringify(keys.map((c) => r[c] ?? null)); if (last || !seen.has(k)) seen.set(k, i); });
      const keepIdx = new Set(seen.values());
      const ni: number[] = []; rows = rows.filter((_, i) => { const k = keepIdx.has(i); if (k) ni.push(idx[i]); return k; }); idx = ni; break;
    }
    case "validate": {
      const c = str(p.column), rule = str(p.rule); const re = rule === "pattern" ? new RegExp(str(p.pattern)) : null;
      const min = p.min === undefined || p.min === "" ? null : num(p.min), max = p.max === undefined || p.max === "" ? null : num(p.max);
      const ni: number[] = [];
      rows = rows.filter((r, i) => {
        const v = r[c] ?? null; let ok = true;
        if (rule === "not_empty") ok = !isEmpty(v);
        else if (rule === "range") ok = typeof v === "number" && (min === null || v >= min) && (max === null || v <= max);
        else if (rule === "length") { const n = isEmpty(v) ? 0 : String(v).length; ok = (min === null || n >= min) && (max === null || n <= max); }
        else if (re) ok = !isEmpty(v) && re.test(String(v));
        if (ok) ni.push(idx[i]); else rejected++; return ok;
      });
      idx = ni; rejectReason = rule === "not_empty" ? `${c} is empty` : rule === "length" ? `${c} length outside ${min ?? 0} to ${max ?? "inf"} characters` : rule === "range" ? `${c} outside ${min ?? "-inf"} to ${max ?? "inf"}` : `${c} does not match the pattern`; break;
    }
    case "clip_outliers": {
      const c = str(p.column); const nums = rows.map((r) => r[c]).filter((v): v is number => typeof v === "number").sort((a, b) => a - b);
      if (nums.length < 4) { warning = "Too few numbers to find a range."; break; }
      const q1 = quantile(nums, 0.25), q3 = quantile(nums, 0.75), iqr = q3 - q1, lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
      rows = rows.map((r) => { const v = r[c]; if (typeof v === "number" && (v < lo || v > hi)) { changed++; return { ...r, [c]: Math.min(hi, Math.max(lo, v)) }; } return r; });
      break;
    }
    case "scale": {
      const c = str(p.column); const nums = rows.map((r) => r[c]).filter((v): v is number => typeof v === "number");
      if (nums.length < 2) { warning = "Too few numbers to scale."; break; }
      const mn = Math.min(...nums), mx = Math.max(...nums), mean = nums.reduce((a, b) => a + b, 0) / nums.length, sd = Math.sqrt(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length) || 1;
      rows = rows.map((r) => { const v = r[c]; if (typeof v !== "number") return r; changed++; const nv = p.method === "standard" ? (v - mean) / sd : mx === mn ? 0 : (v - mn) / (mx - mn); return { ...r, [c]: Math.round(nv * 10000) / 10000 }; });
      columns = columns.map((x) => (x.name === c ? { ...x, type: "decimal" } : x));
      break;
    }
    case "pii_mask": {
      const style = str(p.style, "token");
      const sub = (kind: string) => (m: string) => (style === "stars" ? "*".repeat(Math.min(12, m.length)) : style === "hash" ? `${kind.toLowerCase()}_${hash(m)}` : `[${kind}]`);
      mapCols(asList(p.columns), (v) => v.replace(EMAIL, sub("EMAIL")).replace(PHONE, sub("PHONE")));
      break;
    }
    case "split": {
      const tr = num(p.train, 80), va = num(p.validation, 10), seed = num(p.seed, 42);
      rows = rows.map((r, i) => { const h = unit(seed, idx[i]) * 100; changed++; return { ...r, _split: h < tr ? "train" : h < tr + va ? "validation" : "test" }; });
      if (!columns.some((c) => c.name === "_split")) columns = [...columns, { name: "_split", type: "string" }];
      break;
    }
    case "ai_classify": case "ai_summarise": {
      const into = str(p.into, step.op === "ai_classify" ? "topic" : "summary");
      if (!columns.some((c) => c.name === into)) columns = [...columns, { name: into, type: "string" }];
      rows = rows.map((r) => ({ ...r, [into]: null })); ai = true; warning = "Model steps are not run in the preview. They run on the runner through the gateway."; break;
    }
    case "ai_extract": {
      const fields = str(p.fields).split("\n").map((s) => s.trim()).filter(Boolean);
      for (const fl of fields) if (!columns.some((c) => c.name === fl)) columns = [...columns, { name: fl, type: "string" }];
      rows = rows.map((r) => { const o = { ...r }; for (const fl of fields) o[fl] = null; return o; }); ai = true; warning = "Model steps are not run in the preview. They run on the runner through the gateway."; break;
    }
  }
  return { frame: { columns, rows, idx }, result: { rowsIn, rowsOut: rows.length, changed, rejected, rejectReason, warning, ai } };
}
const RE_NUM = /^[+-]?\d+(\.\d+)?$/;

export function startFrame(columns: Col[], rows: Row[]): Frame { return { columns, rows, idx: rows.map((_, i) => i) }; }

/** Applies the steps in order. A step with an error is skipped so later steps can still show what they would do. */
export function runSteps(start: Frame, steps: Step[]): { frames: Frame[]; results: StepResult[] } {
  const frames: Frame[] = [start]; const results: StepResult[] = [];
  let cur = start;
  for (const s of steps) { const { frame, result } = applyStep(cur, s); results.push(result); cur = frame; frames.push(cur); }
  return { frames, results };
}

// ------------------------------------------------------------------ cost and parallelism planning

export type ModelPrice = { alias: string; label: string; inPerM: number; outPerM: number };
/** Example prices only. A real estimate reads the price list of the model behind the alias. */
export const MODEL_PRICES: ModelPrice[] = [
  { alias: "alias:fast-classifier", label: "fast-classifier", inPerM: 0.15, outPerM: 0.6 },
  { alias: "alias:balanced-reasoner", label: "balanced-reasoner", inPerM: 2.5, outPerM: 10 },
  { alias: "alias:long-context", label: "long-context", inPerM: 1.25, outPerM: 5 },
  { alias: "alias:embedding", label: "embedding", inPerM: 0.02, outPerM: 0 },
  { alias: "alias:embedding-large", label: "embedding-large", inPerM: 0.13, outPerM: 0 },
];
const OUT_TOKENS: Record<string, number> = { ai_classify: 6, ai_extract: 60, ai_summarise: 90, ai_transform: 80, ai_embed: 0 };

/** Estimated cost of one AI step over the whole dataset. Input size comes from the sample's text length at about four characters per token. */
export function estimateAiStep(step: Step, sample: Row[], totalRows: number, rowsAfter: number): { inTokPerRow: number; outTokPerRow: number; calls: number; costUsd: number; overCap: boolean; cap: number } | null {
  if (!STEP_BY_OP.get(step.op)?.ai) return null;
  const col = str(step.params.column); const price = MODEL_PRICES.find((m) => m.alias === step.params.model) ?? MODEL_PRICES[0];
  const lens = sample.map((r) => String(r[col] ?? "").length);
  const avg = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
  const promptOverhead = step.op === "ai_classify" ? 40 + str(step.params.labels).split("\n").filter(Boolean).length * 4 : step.op === "ai_embed" ? 0 : step.op === "ai_transform" ? 30 + Math.ceil(str(step.params.instruction).length / 4) : 60;
  const inTok = Math.ceil(avg / 4) + promptOverhead; const outTok = OUT_TOKENS[step.op] ?? 40;
  const calls = Math.round(totalRows * (sample.length ? rowsAfter / sample.length : 1));
  const cost = (calls * (inTok * price.inPerM + outTok * price.outPerM)) / 1e6;
  const cap = num(step.params.maxCost, 0);
  return { inTokPerRow: inTok, outTokPerRow: outTok, calls, costUsd: cost, overCap: cap > 0 && cost > cap, cap };
}

export type Plan = { partitions: number; concurrent: number; waves: number; rowsPerPartition: number; note: string };
/** How a run is split. Deterministic arithmetic from size, target partition size, the run's parallelism and the pool's capacity. No time is predicted. */
export function planPartitions(sizeBytes: number, totalRows: number, targetMb: number, parallelism: number, poolWorkers: number, poolCores: number, poolFree: number): Plan {
  const target = Math.max(1, targetMb) * 1024 * 1024;
  const partitions = Math.max(1, Math.ceil(sizeBytes / target));
  const capacity = Math.max(1, poolWorkers * poolCores);
  const concurrent = Math.max(1, Math.min(partitions, parallelism, capacity, Math.max(1, poolFree)));
  const waves = Math.ceil(partitions / concurrent);
  const limiter = concurrent === parallelism ? "the run's parallelism" : concurrent === capacity ? "the pool's cores" : concurrent === partitions ? "the number of partitions" : "the pool's free capacity";
  return { partitions, concurrent, waves, rowsPerPartition: Math.ceil(totalRows / partitions), note: `Limited by ${limiter}.` };
}
