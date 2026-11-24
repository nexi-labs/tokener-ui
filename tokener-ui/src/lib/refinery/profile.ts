import type { Bucket, Cell, ColRole, ColType, ColumnProfile, DatasetProfile, Row } from "./types";

/**
 * Reading and profiling tabular data in the browser. It is what the upload screen runs on a file from the user's own computer, and what the sample
 * datasets are profiled with, so the figures on the profile screen are computed from the rows shown, not typed in. On a real run the same statistics are
 * computed on the runner over the whole dataset (docs/46, Profiling).
 */

// ------------------------------------------------------------------ delimited text

export function detectDelimiter(text: string): string {
  const head = text.slice(0, 8000).split(/\r?\n/).filter(Boolean).slice(0, 8);
  let best = ",", bestScore = -1;
  for (const d of [",", "\t", ";", "|"]) {
    const counts = head.map((l) => splitLine(l, d).length);
    const first = counts[0] ?? 0;
    if (first < 2) continue;
    const consistent = counts.filter((c) => c === first).length;
    const score = consistent * 100 + first;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

function splitLine(line: string, d: string): string[] {
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === d) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/** RFC 4180 style reader: quoted fields, doubled quotes, embedded delimiters and line breaks. */
export function parseDelimited(text: string, delimiter?: string): { delimiter: string; header: string[]; rows: string[][] } {
  const d = delimiter ?? detectDelimiter(text);
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let field = "", row: string[] = [], q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c;
    } else if (c === '"' && field === "") q = true;
    else if (c === d) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.length > 1 || row[0] !== "") rows.push(row); }
  const header = (rows.shift() ?? []).map((h, i) => h.trim() || `column_${i + 1}`);
  const seen = new Map<string, number>();
  const unique = header.map((h) => { const n = (seen.get(h) ?? 0) + 1; seen.set(h, n); return n === 1 ? h : `${h}_${n}`; });
  return { delimiter: d, header: unique, rows };
}

// ------------------------------------------------------------------ type inference

const RE_INT = /^[+-]?\d{1,18}$/;
const RE_DEC = /^[+-]?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?$/;
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RE_TS = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const RE_BOOL = /^(true|false|yes|no)$/i;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RE_PHONE = /^\+?[\d\s().-]{7,18}$/;
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RE_URL = /^https?:\/\/\S+$/i;
const PII_NAME = /(^|_|\b)(email|e_mail|phone|mobile|ssn|first_?name|last_?name|full_?name|surname|address|street|dob|birth)/i;

const isEmpty = (v: Cell) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

function fits(type: ColType, v: string): boolean {
  const s = v.trim();
  switch (type) {
    case "integer": return RE_INT.test(s);
    case "decimal": return RE_DEC.test(s);
    case "boolean": return RE_BOOL.test(s);
    case "date": return RE_DATE.test(s);
    case "timestamp": return RE_TS.test(s);
    default: return true;
  }
}

/** A column takes a non text type when at least 95 percent of its non empty values fit it, so a few stray entries do not turn a numeric column into text. */
export function inferType(values: string[]): ColType {
  const nonEmpty = values.filter((v) => v.trim() !== "");
  if (nonEmpty.length === 0) return "string";
  for (const t of ["integer", "decimal", "boolean", "timestamp", "date"] as ColType[]) {
    const ok = nonEmpty.filter((v) => fits(t, v)).length;
    if (ok / nonEmpty.length >= 0.95) return t;
  }
  return "string";
}

export function coerce(type: ColType, v: string): Cell {
  if (v.trim() === "") return null;
  if (!fits(type, v)) return v;
  const s = v.trim();
  if (type === "integer" || type === "decimal") return Number(s);
  if (type === "boolean") return /^(true|yes)$/i.test(s);
  // Text keeps its spaces: they are what the profile reports as untidy and what the Trim step cleans.
  return type === "string" ? v : s;
}

export type ParsedFile = {
  format: "csv" | "tsv" | "json" | "jsonl";
  delimiter?: string;
  columns: { name: string; type: ColType; role: ColRole }[];
  rows: Row[];
  /** Rows read for the preview and profile (may be fewer than the file holds). */
  readRows: number;
  truncated: boolean;
};

export function guessRole(name: string, type: ColType, distinct: number, n: number): ColRole {
  if (/(^|_)(id|uuid|key)$/i.test(name) || (type === "integer" && n > 20 && distinct === n && /id/i.test(name))) return "identifier";
  return "feature";
}

function buildRows(header: string[], raw: string[][]): { columns: ParsedFile["columns"]; rows: Row[] } {
  const types = header.map((_, c) => inferType(raw.map((r) => r[c] ?? "")));
  const columns = header.map((name, c) => {
    const vals = raw.map((r) => r[c] ?? "");
    const distinct = new Set(vals).size;
    return { name, type: types[c], role: guessRole(name, types[c], distinct, raw.length) };
  });
  const rows = raw.map((r) => { const o: Row = {}; header.forEach((h, c) => { o[h] = coerce(types[c], r[c] ?? ""); }); return o; });
  return { columns, rows };
}

/** Reads CSV, TSV, JSON (array of objects) and JSON Lines text. Throws a plain message for anything it cannot read. */
export function parseTabular(fileName: string, text: string, maxRows = 50000): ParsedFile {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "json" || ext === "jsonl" || ext === "ndjson") {
    let objs: Record<string, unknown>[];
    try {
      if (ext === "json") {
        const v = JSON.parse(text);
        objs = Array.isArray(v) ? v : Array.isArray(v?.data) ? v.data : [v];
      } else objs = text.split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
    } catch { throw new Error("This file is not valid JSON. Check that it is an array of objects, or one object per line."); }
    objs = objs.filter((o) => o && typeof o === "object" && !Array.isArray(o));
    if (objs.length === 0) throw new Error("No records were found in this file.");
    const header = Array.from(new Set(objs.slice(0, 500).flatMap((o) => Object.keys(o))));
    const cut = objs.slice(0, maxRows);
    const raw = cut.map((o) => header.map((h) => { const v = o[h]; return v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); }));
    const { columns, rows } = buildRows(header, raw);
    return { format: ext === "json" ? "json" : "jsonl", columns, rows, readRows: rows.length, truncated: objs.length > maxRows };
  }
  if (ext !== "csv" && ext !== "tsv" && ext !== "txt") throw new Error("This file type cannot be read in the browser. CSV, TSV, JSON and JSON Lines can be previewed here; Parquet and Excel are read on the runner.");
  const p = parseDelimited(text, ext === "tsv" ? "\t" : undefined);
  if (p.header.length < 1 || p.rows.length === 0) throw new Error("No rows were found in this file. Check that the first line holds the column names.");
  const cut = p.rows.slice(0, maxRows);
  const { columns, rows } = buildRows(p.header, cut);
  return { format: p.delimiter === "\t" ? "tsv" : "csv", delimiter: p.delimiter, columns, rows, readRows: rows.length, truncated: p.rows.length > maxRows };
}

// ------------------------------------------------------------------ statistics

const pct = (a: number, b: number) => (b === 0 ? 0 : (a / b) * 100);
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function numericHistogram(sorted: number[], bins = 10): Bucket[] {
  if (sorted.length === 0) return [];
  const lo = sorted[0], hi = sorted[sorted.length - 1];
  if (lo === hi) return [{ label: String(round(lo)), count: sorted.length }];
  const w = (hi - lo) / bins;
  const counts = new Array(bins).fill(0);
  for (const v of sorted) counts[Math.min(bins - 1, Math.floor((v - lo) / w))]++;
  const f = (x: number) => (Math.abs(x) >= 1000 ? Math.round(x).toLocaleString("en-US") : String(round(x, 2)));
  return counts.map((count, i) => ({ label: `${f(lo + i * w)} to ${f(lo + (i + 1) * w)}`, count }));
}

function lengthHistogram(values: string[], bins = 8): Bucket[] {
  const lens = values.map((v) => v.length).sort((a, b) => a - b);
  return numericHistogram(lens, bins).map((b) => ({ ...b, label: b.label.replace(" to ", " to ") + " chars" }));
}

function dateHistogram(values: string[], bins = 8): Bucket[] {
  const t = values.map((v) => Date.parse(v)).filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
  if (t.length === 0) return [];
  const lo = t[0], hi = t[t.length - 1];
  if (lo === hi) return [{ label: new Date(lo).toISOString().slice(0, 10), count: t.length }];
  const w = (hi - lo) / bins; const counts = new Array(bins).fill(0);
  for (const v of t) counts[Math.min(bins - 1, Math.floor((v - lo) / w))]++;
  return counts.map((count, i) => ({ label: new Date(lo + i * w).toISOString().slice(0, 10), count }));
}

function detectPattern(strings: string[]): ColumnProfile["pattern"] {
  if (strings.length === 0) return null;
  const share = (re: RegExp) => strings.filter((s) => re.test(s.trim())).length / strings.length;
  if (share(RE_EMAIL) >= 0.8) return "email";
  if (share(RE_UUID) >= 0.8) return "uuid";
  if (share(RE_URL) >= 0.8) return "url";
  if (share(RE_PHONE) >= 0.8 && strings.some((s) => /\d{3}/.test(s))) return "phone";
  if (share(RE_DATE) >= 0.8) return "date";
  return null;
}

export function profileColumn(name: string, type: ColType, role: ColRole, values: Cell[]): ColumnProfile {
  const n = values.length;
  const present = values.filter((v) => !isEmpty(v));
  const nullCount = n - present.length;
  const strs = present.map((v) => String(v));
  const freq = new Map<string, number>();
  for (const s of strs) freq.set(s, (freq.get(s) ?? 0) + 1);
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6).map(([value, count]) => ({ value, count }));
  const base: ColumnProfile = { name, type, role, nullCount, nullPct: round(pct(nullCount, n), 1), distinct: freq.size, n, top, histogram: [], pattern: null, pii: false, untidyPct: 0 };

  if (type === "integer" || type === "decimal") {
    const nums = present.filter((v): v is number => typeof v === "number").sort((a, b) => a - b);
    if (nums.length) {
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      const std = Math.sqrt(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length);
      Object.assign(base, { min: nums[0], max: nums[nums.length - 1], mean: round(mean), std: round(std), p25: round(quantile(nums, 0.25)), p50: round(quantile(nums, 0.5)), p75: round(quantile(nums, 0.75)), histogram: numericHistogram(nums) });
    }
  } else if (type === "date" || type === "timestamp") {
    const sorted = [...strs].sort();
    Object.assign(base, { min: sorted[0], max: sorted[sorted.length - 1], histogram: dateHistogram(strs) });
  } else if (type === "boolean") {
    base.histogram = top.map((t) => ({ label: t.value, count: t.count }));
  } else {
    const lens = strs.map((s) => s.length);
    if (lens.length) { base.minLen = Math.min(...lens); base.maxLen = Math.max(...lens); }
    base.histogram = freq.size <= 12 ? top.map((t) => ({ label: t.value, count: t.count })) : lengthHistogram(strs);
    base.pattern = detectPattern(strs);
    base.pii = base.pattern === "email" || base.pattern === "phone" || PII_NAME.test(name);
    // Untidy: stray spaces, or the same word written in different letter cases.
    const spaced = strs.filter((s) => s !== s.trim()).length;
    const byLower = new Map<string, Set<string>>();
    for (const s of strs) { const k = s.trim().toLowerCase(); (byLower.get(k) ?? byLower.set(k, new Set()).get(k)!).add(s.trim()); }
    let mixed = 0;
    if (freq.size <= Math.max(50, n / 4)) for (const [k, set] of byLower) if (set.size > 1) mixed += [...set].reduce((a, s) => a + (freq.get(s) ?? 0), 0);
    base.untidyPct = round(pct(spaced + mixed, Math.max(1, strs.length)), 1);
  }
  return base;
}

export function profileRows(columns: { name: string; type: ColType; role: ColRole }[], rows: Row[], totalRows?: number): DatasetProfile {
  const cols = columns.map((c) => profileColumn(c.name, c.type, c.role, rows.map((r) => r[c.name] ?? null)));
  const n = rows.length;
  const seen = new Set<string>(); let dup = 0;
  for (const r of rows) { const k = JSON.stringify(columns.map((c) => r[c.name] ?? null)); if (seen.has(k)) dup++; else seen.add(k); }
  const cells = Math.max(1, n * columns.length);
  const nulls = cols.reduce((a, c) => a + c.nullCount, 0);
  const completeness = 1 - nulls / cells;
  const uniqueness = n === 0 ? 1 : 1 - dup / n;
  const stringCols = cols.filter((c) => c.type === "string");
  const consistency = stringCols.length ? 1 - Math.min(1, stringCols.reduce((a, c) => a + c.untidyPct, 0) / stringCols.length / 100) : 1;
  // Validity: values that do not fit the column's type (stray text in a numeric column).
  let invalid = 0, typed = 0;
  columns.forEach((c, i) => {
    if (c.type === "string") return;
    for (const r of rows) { const v = r[c.name]; if (isEmpty(v ?? null)) continue; typed++; if (typeof v === "string" && !(c.type === "date" || c.type === "timestamp") ) invalid++; if (typeof v === "string" && (c.type === "date" || c.type === "timestamp") && !fits(c.type, v)) invalid++; }
    void i;
  });
  const validity = typed === 0 ? 1 : 1 - invalid / typed;
  const quality = Math.round(100 * (0.4 * completeness + 0.2 * uniqueness + 0.2 * consistency + 0.2 * validity));
  const total = totalRows ?? n;
  const idCol = cols.find((c) => c.role === "identifier");
  const keyDup = idCol && n > 0 ? Math.max(0, n - idCol.nullCount - idCol.distinct) : 0;
  return {
    ...(idCol && keyDup > 0 ? { keyDuplicates: { column: idCol.name, rows: Math.round((keyDup / n) * total), pct: round(pct(keyDup, n), 1) } } : {}),
    totalRows: total, sampled: n, columns: cols,
    duplicateRows: n === 0 ? 0 : Math.round((dup / n) * total),
    completeness: round(completeness * 100, 1), quality,
    parts: { completeness: round(completeness * 100, 1), uniqueness: round(uniqueness * 100, 1), consistency: round(consistency * 100, 1), validity: round(validity * 100, 1) },
  };
}

/** Weights behind the quality score, shown beside it so the number can be read. */
export const QUALITY_WEIGHTS = { completeness: 40, uniqueness: 20, consistency: 20, validity: 20 } as const;
