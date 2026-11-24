import { quote, unquote } from "./json";
import { parseDelimited } from "./parse";
import type { Counter, Encoded, Table } from "./types";

/**
 * Table encoding by measurement. A table can be written many ways, and which is cheapest depends on its contents and on the tokenizer. So the
 * encoder builds every candidate that is allowed, counts each one with the model's own counter, proves that it can be read back to the same
 * cells, and keeps the cheapest. A candidate that cannot be read back is never used.
 */

type Flags = { lift: boolean; dict: boolean };
type Cand = { id: string; label: string; delim: "md" | "," | "\t"; flags: Flags };

const LOSSLESS: Cand[] = [
  { id: "md", label: "Markdown table", delim: "md", flags: { lift: false, dict: false } },
  { id: "csv", label: "CSV", delim: ",", flags: { lift: false, dict: false } },
  { id: "tsv", label: "Tab separated", delim: "\t", flags: { lift: false, dict: false } },
];
const STRUCTURAL: Cand[] = [
  { id: "csv+lift", label: "CSV, constant columns stated once", delim: ",", flags: { lift: true, dict: false } },
  { id: "csv+codes", label: "CSV, repeated values coded", delim: ",", flags: { lift: false, dict: true } },
  { id: "csv+lift+codes", label: "CSV, constants stated and values coded", delim: ",", flags: { lift: true, dict: true } },
  { id: "tsv+lift+codes", label: "Tab separated, constants and codes", delim: "\t", flags: { lift: true, dict: true } },
];

const NUM_THOUSANDS = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/, NUM_PLAIN = /^-?\d+(\.\d+)?$/;

/** Columns where every value is a number and some use thousands separators. The separators carry no value, so they are dropped. */
function numericColumns(t: Table): Set<number> {
  const cols = new Set<number>();
  t.header.forEach((_, c) => {
    const vals = t.rows.map((r) => r[c]).filter((v) => v !== "");
    if (vals.length && vals.every((v) => NUM_THOUSANDS.test(v) || NUM_PLAIN.test(v)) && vals.some((v) => v.includes(","))) cols.add(c);
  });
  return cols;
}
const stripCommas = (t: Table, cols: Set<number>): Table => ({ header: t.header, rows: t.rows.map((r) => r.map((v, c) => (cols.has(c) ? v.replace(/,/g, "") : v))) });

const needsQuote = (s: string, delim: string) => s.includes(delim) || /["\n\r]/.test(s) || s !== s.trim();
const quoteCell = (s: string, delim: string) => (needsQuote(s, delim) ? `"${s.replace(/"/g, '""')}"` : s);
const delimited = (rows: string[][], delim: string) => rows.map((r) => (r.length === 1 && r[0] === "" ? '""' : r.map((c) => quoteCell(c, delim)).join(delim))).join("\n");

const mdCell = (s: string) => s.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
export function markdown(t: Table): string {
  const line = (r: string[]) => `| ${r.map(mdCell).join(" | ")} |`;
  return [line(t.header), `|${t.header.map(() => "---").join("|")}|`, ...t.rows.map(line)].join("\n");
}

const quoteVal = (v: string) => (/[;"\n]/.test(v) || v !== v.trim() || v === "" ? quote(v) : v);
function splitPairs(s: string): string[] {
  const out: string[] = []; let i = 0;
  while (i <= s.length) {
    let cur = "";
    if (s[i] === '"') { let j = i + 1; while (j < s.length && !(s[j] === '"' && s[j - 1] !== "\\")) j++; cur = s.slice(i, j + 1); i = j + 1; if (s.startsWith("; ", i)) i += 2; else i = s.length + 1; out.push(cur); continue; }
    const k = s.indexOf("; ", i);
    if (k < 0) { out.push(s.slice(i)); break; }
    out.push(s.slice(i, k)); i = k + 2;
  }
  return out;
}
const quoteName = (v: string) => (/[;"\n=:]/.test(v) || v !== v.trim() || v === "" ? quote(v) : v);
const unquoteVal = (v: string) => (v.startsWith('"') ? (unquote(v) ?? v) : v);

const code = (n: number) => { let s = ""; n++; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };

/** Builds one candidate. Returns null if the table cannot use it, for example constant columns when no column is constant. */
function build(t0: Table, c: Cand): { text: string; table: Table } | null {
  const uniqueHeader = new Set(t0.header).size === t0.header.length;
  if (c.delim === "\t" && t0.rows.some((r) => r.some((v) => /[\t\n\r]/.test(v))) ) return null;
  const nums = numericColumns(t0), t = nums.size ? stripCommas(t0, nums) : t0;
  if (c.delim === "md") return { text: markdown(t), table: t };
  const delim = c.delim as string;
  let keep = t.header.map((_, i) => i);
  const head: string[] = [];
  if (c.flags.lift) {
    if (!uniqueHeader || t.rows.length < 3) return null;
    const constant = t.header.map((_, i) => i).filter((i) => t.rows[0][i] !== "" && t.rows.every((r) => r[i] === t.rows[0][i]));
    if (!constant.length || constant.length === t.header.length) return null;
    keep = keep.filter((i) => !constant.includes(i));
    head.push("Same in every row: " + constant.map((i) => `${quoteName(t.header[i])}=${quoteVal(t.rows[0][i])}`).join("; "));
  }
  let rows = t.rows.map((r) => keep.map((i) => r[i]));
  const header = keep.map((i) => t.header[i]);
  if (c.flags.dict) {
    if (!uniqueHeader || t.rows.length < 6) return null;
    const coded: number[] = [], legend: string[] = [];
    header.forEach((name, ci) => {
      const vals = rows.map((r) => r[ci]), distinct = [...new Set(vals)];
      const avg = vals.reduce((s, v) => s + v.length, 0) / vals.length;
      if (distinct.length <= 16 && vals.length / distinct.length >= 2 && avg >= 8 && !vals.some((v) => v === "")) {
        coded.push(ci);
        legend.push(`Codes for ${quoteName(name)}: ` + distinct.map((v, k) => `${code(k)}=${quoteVal(v)}`).join("; "));
        const map = new Map(distinct.map((v, k) => [v, code(k)]));
        rows = rows.map((r) => r.map((v, k) => (k === ci ? map.get(v)! : v)));
      }
    });
    if (!coded.length) return null;
    head.push(...legend);
  }
  const body = delimited([header, ...rows], delim);
  return { text: [...head, body].join("\n"), table: t };
}

/** Reads a candidate back into a table. Columns that were stated once come back first, so comparison is by column name. */
export function decodeTable(text: string, c: Cand): Table | null {
  if (c.delim === "md") {
    const lines = text.split("\n"), cells = (l: string) => { let s = l.trim(); if (s.startsWith("|")) s = s.slice(1); if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1); return s.split(/(?<!\\)\|/).map((x) => x.trim().replace(/\\\|/g, "|")); };
    return { header: cells(lines[0]), rows: lines.slice(2).map(cells) };
  }
  const lines = text.split("\n"); let i = 0;
  const constants: [string, string][] = [], codes = new Map<string, Map<string, string>>();
  while (i < lines.length && lines[i].startsWith("Same in every row: ")) {
    for (const p of splitPairs(lines[i].slice("Same in every row: ".length))) { const eq = p.startsWith('"') ? p.indexOf('"=', 1) + 1 : p.indexOf("="); constants.push([unquoteVal(p.slice(0, eq)), unquoteVal(p.slice(eq + 1))]); }
    i++;
  }
  while (i < lines.length && lines[i].startsWith("Codes for ")) {
    const rest = lines[i].slice("Codes for ".length);
    const sep = rest.startsWith('"') ? rest.indexOf('": ', 1) + 1 : rest.indexOf(": ");
    const name = unquoteVal(rest.slice(0, sep)), m = new Map<string, string>();
    for (const p of splitPairs(rest.slice(sep + 2))) { const eq = p.indexOf("="); m.set(p.slice(0, eq), unquoteVal(p.slice(eq + 1))); }
    codes.set(name, m); i++;
  }
  const rows = parseDelimited(lines.slice(i).join("\n"), c.delim as string);
  if (!rows || !rows.length) return null;
  const header = rows[0];
  let body = rows.slice(1).map((r) => r.map((v, k) => codes.get(header[k])?.get(v) ?? v));
  if (constants.length) { body = body.map((r) => [...constants.map((x) => x[1]), ...r]); return { header: [...constants.map((x) => x[0]), ...header], rows: body }; }
  return { header, rows: body };
}

const sameTable = (a: Table, b: Table) => {
  if (a.header.length !== b.header.length || a.rows.length !== b.rows.length) return false;
  const order = a.header.map((h) => b.header.indexOf(h));
  if (order.some((o) => o < 0) || new Set(order).size !== order.length) return false;
  return a.rows.every((r, ri) => r.every((v, ci) => v === b.rows[ri][order[ci]]));
};

export type TableLevel = "lossless" | "structural";

export function encodeTable(t: Table, counter: Counter, level: TableLevel): Encoded {
  const cands = level === "structural" ? [...LOSSLESS, ...STRUCTURAL] : LOSSLESS;
  const scored: { id: string; label: string; tokens: number; text: string }[] = [];
  for (const c of cands) {
    const b = build(t, c);
    if (!b) continue;
    const back = decodeTable(b.text, c);
    // The check ignores column order for stated constants and compares against the table with thousands separators dropped.
    if (!back || !sameTable(b.table, back)) continue;
    scored.push({ id: c.id, label: c.label, tokens: counter.count(b.text), text: b.text });
  }
  if (!scored.length) { const text = markdown(t); return { id: "md", text, candidates: [{ id: "md", label: "Markdown table", tokens: counter.count(text), chosen: true }] }; }
  const best = scored.reduce((a, b) => (b.tokens < a.tokens ? b : a));
  return { id: best.id, text: best.text, candidates: scored.map((s) => ({ id: s.id, label: s.label, tokens: s.tokens, chosen: s.id === best.id })) };
}

/** Table as the reader found it, before any choice is made. Used as the baseline when reporting savings. */
export const plainTable = (t: Table) => markdown(t);
/** Reads an encoded table back by the id of the form it was written in, for audits and tests. */
export const decodeById = (text: string, id: string): Table | null => { const c = [...LOSSLESS, ...STRUCTURAL].find((x) => x.id === id); return c ? decodeTable(text, c) : null; };
export { sameTable, numericColumns, stripCommas };
export const CANDIDATE_IDS = [...LOSSLESS, ...STRUCTURAL].map((c) => c.id);
