import { FUNCTION_BY_ID } from "./catalog";
import type { Frame, ParamDef, Col, StepDef, StepResult } from "./steps";
import type { Cell, Row, Step } from "./types";

/**
 * Steps for feature engineering, documents, serverless functions and connector lookups, and chat-format training files.
 * They are kept apart from the core steps so the core stays small. `applyExtra` returns null for a step it does not own.
 */
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : v === undefined || v === null ? d : String(v));
const num = (v: unknown, d = 0): number => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const list = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : typeof v === "string" && v ? [v] : []);
const empty = (v: Cell | undefined) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "x";
function fnv(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

const MODELS = [{ value: "alias:fast-classifier", label: "fast-classifier" }, { value: "alias:balanced-reasoner", label: "balanced-reasoner" }, { value: "alias:long-context", label: "long-context" }];
const p = (x: ParamDef): ParamDef => x;
const COL = (key = "column", label = "Column"): ParamDef => p({ key, label, kind: "column" });

export const EXTRA_STEPS: StepDef[] = [
  // feature engineering
  { op: "one_hot", group: "Feature engineering", label: "One-hot encode", blurb: "Turn a category into one 0 or 1 column per value.", streamable: false, batchOnly: "Needs the full set of categories. Fix the list of values to run it in a stream.",
    params: [COL(), p({ key: "maxCategories", label: "Most common values to keep", kind: "number", def: 12, hint: "Everything else is left as all zeros." }), p({ key: "dropOriginal", label: "Drop the original column", kind: "boolean", def: false })] },
  { op: "bucket", group: "Feature engineering", label: "Bucket numbers", blurb: "Group a number into ranges such as small, medium and large.", streamable: true,
    params: [COL(), p({ key: "edges", label: "Edges", kind: "text", placeholder: "18, 35, 50, 65", hint: "Numbers separated by commas. Values below the first edge fall in the first bucket." }), p({ key: "into", label: "Output column", kind: "text", optional: true })] },
  { op: "date_parts", group: "Feature engineering", label: "Extract date parts", blurb: "Split a date into year, month, day or weekday columns.", streamable: true,
    params: [COL(), p({ key: "parts", label: "Parts", kind: "multi", def: ["year", "month", "weekday"], options: [{ value: "year", label: "Year" }, { value: "month", label: "Month" }, { value: "day", label: "Day" }, { value: "weekday", label: "Weekday (1 Monday)" }, { value: "quarter", label: "Quarter" }, { value: "week", label: "Week of year" }] })] },
  { op: "text_stats", group: "Feature engineering", label: "Text length features", blurb: "Add the character count, word count and an estimated token count of a text column.", streamable: true,
    params: [COL("column", "Text column")] },
  { op: "label_encode", group: "Feature engineering", label: "Label encode", blurb: "Replace each category by a whole number code.", streamable: false, batchOnly: "Needs the full set of categories to give stable codes.",
    params: [COL(), p({ key: "into", label: "Output column", kind: "text", optional: true })] },
  { op: "derive", group: "Feature engineering", label: "Derive a number", blurb: "Combine two numeric columns, or take a logarithm.", streamable: true,
    params: [COL("left", "First column"), p({ key: "operation", label: "Operation", kind: "select", def: "ratio", options: [{ value: "ratio", label: "First divided by second" }, { value: "product", label: "First times second" }, { value: "sum", label: "First plus second" }, { value: "difference", label: "First minus second" }, { value: "log1p", label: "Logarithm of one plus first" }] }), p({ key: "right", label: "Second column", kind: "column", optional: true, hint: "Not used for the logarithm." }), p({ key: "into", label: "Output column", kind: "text" })] },
  { op: "hash_feature", group: "Feature engineering", label: "Hash a category", blurb: "Map a category to one of a fixed number of buckets without keeping a vocabulary.", streamable: true,
    params: [COL(), p({ key: "buckets", label: "Buckets", kind: "number", def: 64 })] },
  // documents
  { op: "normalize_text", group: "Documents", label: "Normalise text", blurb: "Fix encoding, quotes, hidden characters and words split across lines.", streamable: true,
    params: [p({ key: "columns", label: "Columns", kind: "columns" }), p({ key: "unicode", label: "Normalise Unicode forms", kind: "boolean", def: true }), p({ key: "controls", label: "Remove control characters", kind: "boolean", def: true }), p({ key: "quotes", label: "Straighten curly quotes and dashes", kind: "boolean", def: true }), p({ key: "hyphens", label: "Join words split by a line break", kind: "boolean", def: true }), p({ key: "spaces", label: "Collapse repeated spaces and blank lines", kind: "boolean", def: true })] },
  { op: "strip_boilerplate", group: "Documents", label: "Remove headers, footers and page numbers", blurb: "Delete lines that repeat across many pages and lines that are only a page number.", streamable: false, batchOnly: "Finds repeated lines across the corpus.",
    params: [COL("column", "Text column"), p({ key: "minShare", label: "Remove lines found in at least this % of rows", kind: "number", def: 30 }), p({ key: "pageNumbers", label: "Remove page number lines", kind: "boolean", def: true })] },
  { op: "chunk_text", group: "Documents", label: "Split into chunks", blurb: "Cut long text into overlapping pieces that fit a model, one row per piece.", streamable: true,
    params: [COL("column", "Text column"), p({ key: "tokens", label: "Chunk size (tokens)", kind: "number", def: 300, hint: "About four characters per token." }), p({ key: "overlap", label: "Overlap (tokens)", kind: "number", def: 30 })] },
  { op: "near_dedupe", group: "Documents", label: "Drop near duplicates", blurb: "Keep one of several texts that are almost the same, such as repeated standard clauses.", streamable: false, batchOnly: "Compares every text with the others. On a runner it uses MinHash buckets so it scales.",
    params: [COL("column", "Text column"), p({ key: "threshold", label: "Similarity to count as duplicate (0 to 1)", kind: "number", def: 0.85 })] },
  // functions and connectors
  { op: "function", group: "Functions and connectors", label: "Call a serverless function", blurb: "Run one of your tok∑ner Functions on each row, in batches.", streamable: true, remote: true,
    params: [p({ key: "function", label: "Function", kind: "function" }), p({ key: "columns", label: "Input columns", kind: "columns" }), p({ key: "into", label: "Output column", kind: "text", def: "fn_result" }), p({ key: "batchSize", label: "Rows per call", kind: "number", def: 50 }), p({ key: "onError", label: "When a call fails", kind: "select", def: "null", options: [{ value: "null", label: "Leave the cell empty" }, { value: "reject", label: "Reject the row" }, { value: "fail", label: "Fail the run" }] })] },
  { op: "connector_lookup", group: "Functions and connectors", label: "Look up from a connection", blurb: "Enrich each row with values from a database table or an API behind a connection.", streamable: true, remote: true,
    params: [p({ key: "connection", label: "Connection", kind: "connection" }), p({ key: "source", label: "Table or path", kind: "text", placeholder: "public.customers" }), COL("key", "Key column in your data"), p({ key: "remoteKey", label: "Key column there", kind: "text" }), p({ key: "fields", label: "Columns to add", kind: "lines", hint: "One column name per line." }), p({ key: "onMiss", label: "When no match", kind: "select", def: "null", options: [{ value: "null", label: "Leave empty" }, { value: "reject", label: "Reject the row" }] })] },
  // model assisted
  { op: "ai_transform", group: "AI", label: "Rewrite with a model", blurb: "Describe in words how to change each value. For example: fix spelling and write company names in full.", streamable: true, ai: true,
    params: [COL("column", "Text column"), p({ key: "instruction", label: "Instruction", kind: "lines", hint: "Plain language. Sent with each value." }), p({ key: "into", label: "Output column", kind: "text", def: "rewritten" }), p({ key: "model", label: "Model", kind: "select", options: MODELS, def: "alias:fast-classifier" }), p({ key: "maxCost", label: "Cost cap (USD)", kind: "number", def: 50 })] },
  { op: "ai_embed", group: "AI", label: "Create embeddings", blurb: "Turn text into vectors for search, clustering or retrieval training.", streamable: true, ai: true,
    params: [COL("column", "Text column"), p({ key: "into", label: "Output column", kind: "text", def: "embedding" }), p({ key: "model", label: "Model", kind: "select", def: "alias:embedding", options: [{ value: "alias:embedding", label: "embedding (default)" }, { value: "alias:embedding-large", label: "embedding-large" }] }), p({ key: "maxCost", label: "Cost cap (USD)", kind: "number", def: 30 })] },
  // training sets
  { op: "to_chat", group: "Training sets", label: "Format as chat messages", blurb: "Build the messages column that chat fine tuning files use.", streamable: true,
    params: [p({ key: "system", label: "System message", kind: "lines", optional: true }), COL("userColumn", "User message column"), COL("assistantColumn", "Assistant reply column"), p({ key: "into", label: "Output column", kind: "text", def: "messages" })] },
];

export const EXTRA_OPS = new Set(EXTRA_STEPS.map((s) => s.op));

export function describeExtra(step: Step): string | null {
  const q = step.params; const c = str(q.column, "column");
  switch (step.op) {
    case "one_hot": return `One-hot encode ${c}`;
    case "bucket": return `Bucket ${c} at ${str(q.edges) || "no edges"}`;
    case "date_parts": return `${list(q.parts).join(", ") || "Parts"} from ${c}`;
    case "text_stats": return `Length features of ${c}`;
    case "label_encode": return `Label encode ${c}`;
    case "derive": return `${str(q.into, "value")} = ${str(q.operation, "ratio")} of ${str(q.left, "column")}${q.operation === "log1p" ? "" : ` and ${str(q.right, "column")}`}`;
    case "hash_feature": return `Hash ${c} into ${num(q.buckets, 64)} buckets`;
    case "normalize_text": return `Normalise text in ${list(q.columns).join(", ") || "columns"}`;
    case "strip_boilerplate": return `Remove headers, footers and page numbers from ${c}`;
    case "chunk_text": return `Chunks of ${num(q.tokens, 300)} tokens from ${c}`;
    case "near_dedupe": return `Drop near duplicates of ${c} above ${num(q.threshold, 0.85)}`;
    case "function": return `Call ${FUNCTION_BY_ID.get(str(q.function))?.name ?? "a function"} on ${list(q.columns).join(", ") || "columns"}`;
    case "connector_lookup": return `Look up ${str(q.source) || "a table"} by ${str(q.key, "key")}`;
    case "ai_transform": return `Rewrite ${c} with a model`;
    case "ai_embed": return `Embed ${c}`;
    case "to_chat": return `Chat messages from ${str(q.userColumn, "user")} and ${str(q.assistantColumn, "assistant")}`;
    default: return null;
  }
}

/** Steps that need a string value, a number, or a column that is not in the generic parameter list. */
export function validateExtra(step: Step, cols: Col[]): string | null {
  const names = new Set(cols.map((x) => x.name)); const q = step.params;
  switch (step.op) {
    case "bucket": { const e = str(q.edges).split(",").map((x) => x.trim()).filter(Boolean).map(Number); if (e.length === 0 || e.some((x) => !Number.isFinite(x))) return "Enter the edges as numbers separated by commas."; return null; }
    case "date_parts": return list(q.parts).length ? null : "Choose at least one part.";
    case "derive": if (q.operation !== "log1p" && !str(q.right)) return "Choose the second column."; if (q.operation !== "log1p" && !names.has(str(q.right))) return `Column "${str(q.right)}" does not exist at this point.`; return null;
    case "chunk_text": return num(q.tokens, 0) < 20 ? "A chunk needs at least 20 tokens." : num(q.overlap, 0) >= num(q.tokens, 0) ? "The overlap must be smaller than the chunk." : null;
    case "near_dedupe": return num(q.threshold, 0) <= 0 || num(q.threshold, 0) > 1 ? "Similarity must be above 0 and at most 1." : null;
    case "hash_feature": return num(q.buckets, 0) < 2 ? "Use at least 2 buckets." : null;
    case "function": return list(q.columns).length ? (FUNCTION_BY_ID.has(str(q.function)) ? null : "Choose a function.") : "Choose at least one input column.";
    case "connector_lookup": return str(q.connection) ? (str(q.fields).trim() ? null : "List at least one column to add.") : "Choose a connection.";
    case "to_chat": return str(q.userColumn) === str(q.assistantColumn) && str(q.userColumn) ? "The user and assistant columns must differ." : null;
    default: return null;
  }
}

const QUOTES: [RegExp, string][] = [[/[‘’‚′]/g, "'"], [/[“”„″]/g, '"'], [/[–—−]/g, "-"], [/…/g, "..."]];
export function normalizeText(s: string, o: { unicode: boolean; controls: boolean; quotes: boolean; hyphens: boolean; spaces: boolean }): string {
  let t = s;
  if (o.unicode) t = t.normalize("NFKC");
  if (o.controls) t = t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‍﻿­]/g, "");
  if (o.quotes) for (const [re, r] of QUOTES) t = t.replace(re, r);
  if (o.hyphens) t = t.replace(/([A-Za-z])-\s*\n\s*([a-z])/g, "$1$2");
  if (o.spaces) t = t.replace(/[ \t ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return t;
}

/** Cuts text into pieces of about `tokens` tokens (four characters each) with an overlap, preferring to end at a sentence or paragraph. */
export function chunk(text: string, tokens: number, overlap: number): string[] {
  const size = Math.max(40, tokens * 4), ov = Math.max(0, overlap * 4); const out: string[] = [];
  if (text.length <= size) return text.trim() ? [text.trim()] : [];
  let pos = 0;
  while (pos < text.length) {
    let end = Math.min(text.length, pos + size);
    if (end < text.length) {
      const win = text.slice(pos + Math.floor(size * 0.6), end);
      const cut = Math.max(win.lastIndexOf("\n\n"), win.lastIndexOf(". "), win.lastIndexOf("\n"), win.lastIndexOf("? "));
      if (cut > 0) end = pos + Math.floor(size * 0.6) + cut + 1;
    }
    const piece = text.slice(pos, end).trim(); if (piece) out.push(piece);
    if (end >= text.length) break;
    pos = Math.max(end - ov, pos + 1);
  }
  return out;
}

const shingles = (t: string, k = 5): Set<string> => { const w = t.toLowerCase().split(/\W+/).filter(Boolean); const s = new Set<string>(); if (w.length <= k) { s.add(w.join(" ")); return s; } for (let i = 0; i + k <= w.length; i++) s.add(w.slice(i, i + k).join(" ")); return s; };
export function jaccard(a: Set<string>, b: Set<string>): number { let inter = 0; for (const x of a) if (b.has(x)) inter++; const uni = a.size + b.size - inter; return uni === 0 ? 1 : inter / uni; }

const PAGE_LINE = /^\s*(page\s+)?\d+(\s*(of|\/)\s*\d+)?\s*$/i;

export function applyExtra(f: Frame, step: Step): { frame: Frame; result: StepResult } | null {
  if (!EXTRA_OPS.has(step.op)) return null;
  const rowsIn = f.rows.length; const q = step.params;
  const done = (columns: Col[], rows: Row[], idx: number[], extra: Partial<StepResult> = {}) => ({ frame: { columns, rows, idx }, result: { rowsIn, rowsOut: rows.length, changed: 0, rejected: 0, ...extra } });
  const add = (cols: Col[], ...n: Col[]) => [...cols, ...n.filter((c) => !cols.some((x) => x.name === c.name))];
  const c = str(q.column);
  switch (step.op) {
    case "one_hot": {
      const freq = new Map<string, number>(); for (const r of f.rows) if (!empty(r[c])) freq.set(String(r[c]).trim(), (freq.get(String(r[c]).trim()) ?? 0) + 1);
      const keep = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, Math.max(1, num(q.maxCategories, 12))).map(([v]) => v);
      const names = keep.map((v) => `${c}_${slug(v)}`); let cols = add(f.columns, ...names.map((n) => ({ name: n, type: "integer" as const })));
      let changed = 0;
      let rows = f.rows.map((r) => { const o: Row = { ...r }; const v = empty(r[c]) ? null : String(r[c]).trim(); keep.forEach((k, i) => { o[names[i]] = v === k ? 1 : 0; }); changed += keep.length; return o; });
      if (q.dropOriginal) { cols = cols.filter((x) => x.name !== c); rows = rows.map((r) => { const o = { ...r }; delete o[c]; return o; }); }
      return done(cols, rows, f.idx, { changed });
    }
    case "bucket": {
      const edges = str(q.edges).split(",").map((x) => Number(x.trim())).filter(Number.isFinite).sort((a, b) => a - b); const into = str(q.into) || `${c}_bucket`;
      const label = (v: number) => { let i = 0; while (i < edges.length && v >= edges[i]) i++; return i === 0 ? `below ${edges[0]}` : i === edges.length ? `${edges[i - 1]} and above` : `${edges[i - 1]} to ${edges[i]}`; };
      let changed = 0; const rows = f.rows.map((r) => { const v = r[c]; if (typeof v !== "number") return { ...r, [into]: null }; changed++; return { ...r, [into]: label(v) }; });
      return done(add(f.columns, { name: into, type: "string" }), rows, f.idx, { changed });
    }
    case "date_parts": {
      const parts = list(q.parts); let changed = 0;
      const cols = add(f.columns, ...parts.map((x) => ({ name: `${c}_${x}`, type: "integer" as const })));
      const rows = f.rows.map((r) => {
        const t = empty(r[c]) ? NaN : Date.parse(String(r[c])); const o: Row = { ...r };
        for (const x of parts) {
          if (Number.isNaN(t)) { o[`${c}_${x}`] = null; continue; }
          const d = new Date(t); changed++;
          o[`${c}_${x}`] = x === "year" ? d.getUTCFullYear() : x === "month" ? d.getUTCMonth() + 1 : x === "day" ? d.getUTCDate() : x === "weekday" ? ((d.getUTCDay() + 6) % 7) + 1 : x === "quarter" ? Math.floor(d.getUTCMonth() / 3) + 1 : Math.ceil(((t - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000 + 1 + ((new Date(Date.UTC(d.getUTCFullYear(), 0, 1)).getUTCDay() + 6) % 7)) / 7);
        }
        return o;
      });
      return done(cols, rows, f.idx, { changed });
    }
    case "text_stats": {
      let changed = 0; const cols = add(f.columns, { name: `${c}_chars`, type: "integer" }, { name: `${c}_words`, type: "integer" }, { name: `${c}_tokens_est`, type: "integer" });
      const rows = f.rows.map((r) => { const s = empty(r[c]) ? "" : String(r[c]); changed += 3; return { ...r, [`${c}_chars`]: s.length, [`${c}_words`]: s.trim() ? s.trim().split(/\s+/).length : 0, [`${c}_tokens_est`]: Math.ceil(s.length / 4) }; });
      return done(cols, rows, f.idx, { changed });
    }
    case "label_encode": {
      const into = str(q.into) || `${c}_code`; const vals = [...new Set(f.rows.filter((r) => !empty(r[c])).map((r) => String(r[c]).trim()))].sort(); const code = new Map(vals.map((v, i) => [v, i]));
      let changed = 0; const rows = f.rows.map((r) => { if (empty(r[c])) return { ...r, [into]: null }; changed++; return { ...r, [into]: code.get(String(r[c]).trim()) ?? null }; });
      return done(add(f.columns, { name: into, type: "integer" }), rows, f.idx, { changed });
    }
    case "derive": {
      const l = str(q.left), rr = str(q.right), op = str(q.operation, "ratio"), into = str(q.into); let changed = 0;
      if (!into) return done(f.columns, f.rows, f.idx, { error: "Output column is required." });
      const rows = f.rows.map((r) => {
        const a = r[l]; const b = r[rr]; let v: number | null = null;
        if (typeof a === "number") {
          if (op === "log1p") v = a > -1 ? Math.log1p(a) : null;
          else if (typeof b === "number") v = op === "ratio" ? (b === 0 ? null : a / b) : op === "product" ? a * b : op === "sum" ? a + b : a - b;
        }
        if (v !== null) { v = Math.round(v * 10000) / 10000; changed++; }
        return { ...r, [into]: v };
      });
      return done(add(f.columns, { name: into, type: "decimal" }), rows, f.idx, { changed });
    }
    case "hash_feature": {
      const n = Math.max(2, Math.round(num(q.buckets, 64))); const into = `${c}_hash`; let changed = 0;
      const rows = f.rows.map((r) => { if (empty(r[c])) return { ...r, [into]: null }; changed++; return { ...r, [into]: fnv(String(r[c]).trim().toLowerCase()) % n }; });
      return done(add(f.columns, { name: into, type: "integer" }), rows, f.idx, { changed });
    }
    case "normalize_text": {
      const o = { unicode: q.unicode !== false, controls: q.controls !== false, quotes: q.quotes !== false, hyphens: q.hyphens !== false, spaces: q.spaces !== false }; let changed = 0;
      const cs = list(q.columns);
      const rows = f.rows.map((r) => { let out: Row | null = null; for (const k of cs) { const v = r[k]; if (typeof v === "string") { const nv = normalizeText(v, o); if (nv !== v) { out ??= { ...r }; out[k] = nv; changed++; } } } return out ?? r; });
      return done(f.columns, rows, f.idx, { changed });
    }
    case "strip_boilerplate": {
      const share = Math.max(1, num(q.minShare, 30)) / 100; const lineCount = new Map<string, number>();
      for (const r of f.rows) { const seen = new Set<string>(); for (const ln of String(r[c] ?? "").split("\n")) { const t = ln.trim(); if (t && t.length <= 120) seen.add(t); } for (const t of seen) lineCount.set(t, (lineCount.get(t) ?? 0) + 1); }
      const common = new Set([...lineCount.entries()].filter(([, n]) => f.rows.length >= 5 && n / f.rows.length >= share).map(([t]) => t));
      let changed = 0;
      const rows = f.rows.map((r) => { const v = r[c]; if (typeof v !== "string") return r; const kept = v.split("\n").filter((ln) => { const t = ln.trim(); if (common.has(t)) return false; if (q.pageNumbers !== false && t && PAGE_LINE.test(t)) return false; if (q.pageNumbers !== false && /^page\s+\d+\s+of\s+\d+$/i.test(t)) return false; return true; }).join("\n").replace(/\n{3,}/g, "\n\n").trim(); if (kept !== v) { changed++; return { ...r, [c]: kept }; } return r; });
      return done(f.columns, rows, f.idx, { changed, warning: common.size ? `${common.size} repeated line${common.size === 1 ? "" : "s"} found and removed.` : undefined });
    }
    case "chunk_text": {
      const rows: Row[] = []; const idx: number[] = []; let changed = 0;
      f.rows.forEach((r, k) => { const v = r[c]; if (typeof v !== "string" || !v.trim()) { rows.push({ ...r, chunk_index: null }); idx.push(f.idx[k]); return; } chunk(v, num(q.tokens, 300), num(q.overlap, 30)).forEach((piece, i) => { rows.push({ ...r, [c]: piece, chunk_index: i }); idx.push(f.idx[k]); changed++; }); });
      return done(add(f.columns, { name: "chunk_index", type: "integer" }), rows, idx, { changed });
    }
    case "near_dedupe": {
      const th = num(q.threshold, 0.85); const kept: { sh: Set<string> }[] = []; const ni: number[] = []; let dropped = 0;
      const rows = f.rows.filter((r, k) => { const v = r[c]; if (typeof v !== "string" || !v.trim()) { ni.push(f.idx[k]); return true; } const sh = shingles(v); for (const o of kept) if (jaccard(sh, o.sh) >= th) { dropped++; return false; } kept.push({ sh }); ni.push(f.idx[k]); return true; });
      return done(f.columns, rows, ni, { changed: dropped });
    }
    case "to_chat": {
      const into = str(q.into, "messages"); const sys = str(q.system).trim(); let changed = 0;
      const rows = f.rows.map((r) => { const u = r[str(q.userColumn)], a = r[str(q.assistantColumn)]; if (empty(u) || empty(a)) return { ...r, [into]: null }; changed++; return { ...r, [into]: JSON.stringify([...(sys ? [{ role: "system", content: sys }] : []), { role: "user", content: String(u) }, { role: "assistant", content: String(a) }]) }; });
      return done(add(f.columns, { name: into, type: "string" }), rows, f.idx, { changed });
    }
    case "ai_transform": case "ai_embed": {
      const into = str(q.into, step.op === "ai_embed" ? "embedding" : "rewritten");
      return done(add(f.columns, { name: into, type: "string" }), f.rows.map((r) => ({ ...r, [into]: null })), f.idx, { ai: true, warning: "Model steps are not run in the preview. They run on the runner through the gateway." });
    }
    case "function": {
      const into = str(q.into, "fn_result");
      return done(add(f.columns, { name: into, type: "string" }), f.rows.map((r) => ({ ...r, [into]: null })), f.idx, { remote: true, warning: "Function steps run on the runner, one batch at a time. The preview leaves the output empty." });
    }
    case "connector_lookup": {
      const fields = str(q.fields).split("\n").map((s) => s.trim()).filter(Boolean);
      return done(add(f.columns, ...fields.map((n) => ({ name: n, type: "string" as const }))), f.rows.map((r) => { const o = { ...r }; for (const n of fields) o[n] = null; return o; }), f.idx, { remote: true, warning: "Lookups run on the runner against the connection. The preview leaves the new columns empty." });
    }
  }
  return null;
}
