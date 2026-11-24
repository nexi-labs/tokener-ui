import { minify, parseJson, type J } from "./json";
import type { Block, Input, Table } from "./types";

/**
 * Readers. Each turns one kind of input into the same list of blocks. HTML, markdown and plain text, CSV and TSV, JSON and paged PDF text are
 * read here. Office files, scans and audio are read by the document worker, which hands this engine the same blocks.
 */

const FENCE = /^\s*(```|~~~)\s*([\w+-]*)\s*$/;
const MD_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const LIST = /^\s*([-*•]|\d+[.)])\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;

export const nl = (s: string) => s.replace(/\r\n?/g, "\n");

// ------------------------------------------------------------------------------------------------ delimited text

/** Reads comma or tab separated text, with quotes and quoted line breaks. Returns null if a quote is never closed. */
export function parseDelimited(text: string, delim: string): string[][] | null {
  const rows: string[][] = []; let row: string[] = [], cell = "", q = false, i = 0;
  const s = nl(text);
  while (i < s.length) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i += 2; continue; } q = false; i++; continue; }
      cell += c; i++; continue;
    }
    if (c === '"' && cell === "") { q = true; i++; continue; }
    if (c === delim) { row.push(cell); cell = ""; i++; continue; }
    if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; continue; }
    cell += c; i++;
  }
  if (q) return null;
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function looksDelimited(text: string): "," | "\t" | null {
  const lines = nl(text).split("\n").filter((l) => l.trim() !== "");
  if (lines.length < 3) return null;
  for (const d of [",", "\t"]) {
    const rows = parseDelimited(text.trim(), d);
    if (!rows || rows.length < 3) continue;
    const width = rows[0].length;
    if (width < 2) continue;
    const same = rows.filter((r) => r.length === width).length;
    if (same / rows.length >= 0.9) return d as "," | "\t";
  }
  return null;
}

function tableFromRows(rows: string[][]): Table {
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => Array.from({ length: width }, (_, i) => r[i] ?? "");
  const first = pad(rows[0]);
  const isHeader = first.every((c) => c.trim() !== "" && !/^-?[\d.,]+$/.test(c.trim()));
  return isHeader ? { header: first, rows: rows.slice(1).map(pad) } : { header: first.map((_, i) => `c${i + 1}`), rows: rows.map(pad) };
}

// ------------------------------------------------------------------------------------------------ JSON

const isScalar = (x: J) => x.t !== "arr" && x.t !== "obj";
/** A scalar as it goes into a cell: a string as is, anything else as it was written. */
const cellOf = (x: J) => (x.t === "str" ? x.v : minify(x));

function recordsTable(v: J): Table | null {
  if (v.t !== "arr" || v.a.length < 2 || !v.a.every((r) => r.t === "obj")) return null;
  const rows = v.a as Extract<J, { t: "obj" }>[], keys = [...rows[0].m.keys()];
  if (!keys.length) return null;
  if (!rows.every((r) => r.m.size === keys.length && keys.every((k) => r.m.has(k) && isScalar(r.m.get(k)!)))) return null;
  return { header: keys, rows: rows.map((r) => keys.map((k) => cellOf(r.m.get(k)!))) };
}

function fromJson(raw: string, page?: number): Block | null {
  const v = parseJson(raw);
  if (!v) return null;
  const t = recordsTable(v);
  return t ? { kind: "table", table: t, source: "json", page } : { kind: "data", text: minify(v), page };
}

// ------------------------------------------------------------------------------------------------ plain text and markdown

const splitCells = (line: string) => {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
};

const isBlockStart = (lines: string[], i: number) =>
  FENCE.test(lines[i]) || HEADING.test(lines[i]) || LIST.test(lines[i]) || (lines[i].includes("|") && i + 1 < lines.length && MD_SEP.test(lines[i + 1]) && lines[i + 1].includes("-"));

export function parseText(text: string, page?: number): Block[] {
  const lines = nl(text).split("\n");
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") { i++; continue; }
    const f = line.match(FENCE);
    if (f) {
      const body: string[] = []; i++;
      while (i < lines.length && !lines[i].trim().startsWith(f[1])) body.push(lines[i++]);
      i++;
      out.push({ kind: "code", text: body.join("\n"), lang: f[2], page });
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && MD_SEP.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      const header = splitCells(line); const rows: string[][] = []; i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") { const c = splitCells(lines[i++]); rows.push(Array.from({ length: header.length }, (_, k) => c[k] ?? "")); }
      out.push({ kind: "table", table: { header, rows }, source: "markdown", page });
      continue;
    }
    const h = line.match(HEADING);
    if (h) { out.push({ kind: "heading", text: h[2], level: h[1].length, page }); i++; continue; }
    if (LIST.test(line)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].trim() !== "" && (LIST.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        const m = lines[i].match(LIST);
        if (m) items.push(/^\d/.test(m[1]) ? `${m[1]} ${m[2].trim()}` : `- ${m[2].trim()}`);
        else items[items.length - 1] += " " + lines[i].trim();
        i++;
      }
      out.push({ kind: "list", items, page });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !(para.length && isBlockStart(lines, i))) para.push(lines[i++]);
    const quotedLines = para.filter((l) => /^\s*>/.test(l)).length;
    const body = para.map((l) => l.replace(/^\s*>+\s?/, "").replace(/[ \t]+$/g, "")).join("\n");
    const trimmed = body.trim();
    if (!quotedLines && /^[[{]/.test(trimmed) && /[\]}]$/.test(trimmed)) { const d = fromJson(trimmed, page); if (d) { out.push(d); continue; } }
    if (!quotedLines && (trimmed.match(/<\/?[a-z][a-z0-9-]*(\s[^<>]*)?>/gi) ?? []).length >= 3) { out.push(...parseHtml(trimmed, page)); continue; }
    out.push({ kind: "paragraph", text: body, quoted: quotedLines > para.length / 2 || undefined, page });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ pages

/** A page's first and last two lines are kept apart from its body, because that is where running headers, footers and page numbers live. */
export function parsePages(pages: string[]): Block[] {
  const out: Block[] = [];
  pages.forEach((raw, idx) => {
    const page = idx + 1, lines = nl(raw).split("\n");
    const ne = lines.map((l, k) => (l.trim() ? k : -1)).filter((k) => k >= 0);
    if (ne.length < 6) { out.push(...parseText(raw, page)); return; }
    const head = ne.slice(0, 2), tail = ne.slice(-2), skip = new Set([...head, ...tail]);
    for (const k of head) out.push({ kind: "edge", text: lines[k].trim(), pos: "head", page });
    out.push(...parseText(lines.filter((_, k) => !skip.has(k)).join("\n"), page));
    for (const k of tail) out.push({ kind: "edge", text: lines[k].trim(), pos: "tail", page });
  });
  return out;
}

// ------------------------------------------------------------------------------------------------ HTML

type Node = { tag: string; attrs: string; kids: (Node | string)[] };
const VOID = new Set(["br", "hr", "img", "input", "meta", "link", "source", "wbr", "area", "base", "col", "embed", "param", "track"]);
const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s: string) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
  const k = e.toLowerCase();
  return Object.prototype.hasOwnProperty.call(ENT, k) ? ENT[k] : m;
});

function dom(html: string): Node {
  const src = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<!doctype[^>]*>/gi, "").replace(/<(script|style|noscript|svg|template|head)\b[\s\S]*?<\/\1\s*>/gi, " ");
  const root: Node = { tag: "#root", attrs: "", kids: [] }, stack: Node[] = [root];
  const implicit: Record<string, string[]> = { li: ["li"], p: ["p"], tr: ["tr", "td", "th"], td: ["td", "th"], th: ["td", "th"] };
  for (const m of src.matchAll(/<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>|([^<]+)|</g)) {
    const top = stack[stack.length - 1];
    if (m[5] !== undefined) { top.kids.push(m[5]); continue; }
    if (!m[2]) continue;
    const tag = m[2].toLowerCase();
    if (m[1]) { const at = stack.map((n) => n.tag).lastIndexOf(tag); if (at > 0) stack.length = at; continue; }
    for (const t of implicit[tag] ?? []) if (stack[stack.length - 1].tag === t) stack.pop();
    const node: Node = { tag, attrs: m[3] ?? "", kids: [] };
    stack[stack.length - 1].kids.push(node);
    if (!m[4] && !VOID.has(tag)) stack.push(node);
  }
  return root;
}

const BLOCKS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "div", "section", "article", "main", "blockquote", "ul", "ol", "li", "table", "pre", "hr", "form", "nav", "footer", "aside", "header", "body", "html", "tr", "figure", "details", "dl", "dt", "dd"]);
const BOILER_ATTR = /(cookie|consent|banner|newsletter|subscribe|breadcrumb|sidebar|social|share|advert|promo|popup|modal|skip-link)/i;
const attr = (n: Node, name: string) => n.attrs.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"))?.slice(2, 4).find((x) => x !== undefined) ?? "";
const boilerWhy = (n: Node): string => {
  if (["nav", "footer", "aside"].includes(n.tag)) return n.tag;
  if (n.tag === "header" && n.kids.some((k) => typeof k !== "string" && (k.tag === "nav" || BOILER_ATTR.test(attr(k, "class"))))) return "header";
  const role = attr(n, "role");
  if (["navigation", "banner", "contentinfo", "complementary"].includes(role)) return role;
  return BOILER_ATTR.test(attr(n, "class") + " " + attr(n, "id")) ? "notice" : "";
};

function inline(n: Node | string): string {
  if (typeof n === "string") return decode(n);
  if (n.tag === "br") return "\n";
  if (n.tag === "img") return "";
  const t = n.kids.map(inline).join("");
  if (n.tag === "a") {
    const href = attr(n, "href"), label = t.replace(/\s+/g, " ").trim();
    return /^(https?:|mailto:)/i.test(href) && label && label !== href ? `${label} (${href})` : label || (/^(https?:|mailto:)/i.test(href) ? href : "");
  }
  return t;
}
const squash = (s: string) => s.replace(/[ \t\f\v ]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{2,}/g, "\n").trim();
const isBlock = (k: Node | string): k is Node => typeof k !== "string" && BLOCKS.has(k.tag);

export function parseHtml(html: string, page?: number): Block[] {
  const out: Block[] = [];
  const emit = (b: Block, why: string) => out.push(why ? { kind: "boiler", text: textOf(b), why, page } : b);
  const textOf = (b: Block): string => (b.kind === "list" ? b.items.join("\n") : b.kind === "table" ? [b.table.header, ...b.table.rows].map((r) => r.join(" | ")).join("\n") : "text" in b ? b.text : "");
  const walk = (n: Node, why: string) => {
    const w = why || boilerWhy(n);
    if (/^h[1-6]$/.test(n.tag)) { const t = squash(n.kids.map(inline).join("")); if (t) emit({ kind: "heading", text: t.replace(/\n/g, " "), level: +n.tag[1], page }, w); return; }
    if (n.tag === "pre") { emit({ kind: "code", text: n.kids.map(inline).join("").replace(/^\n/, "").replace(/\n$/, ""), lang: "", page }, w); return; }
    if (n.tag === "ul" || n.tag === "ol") {
      const items = n.kids.filter((k): k is Node => typeof k !== "string" && k.tag === "li").map((li, i) => squash(li.kids.map(inline).join("")).replace(/\n/g, " ")).filter(Boolean).map((t, i) => (n.tag === "ol" ? `${i + 1}. ${t}` : `- ${t}`));
      if (items.length) emit({ kind: "list", items, page }, w);
      return;
    }
    if (n.tag === "table") {
      const rows: { cells: string[]; th: boolean }[] = [];
      const collect = (x: Node) => { for (const k of x.kids) if (typeof k !== "string") { if (k.tag === "tr") { const cs = k.kids.filter((c): c is Node => typeof c !== "string" && (c.tag === "td" || c.tag === "th")); rows.push({ cells: cs.map((c) => squash(c.kids.map(inline).join("")).replace(/\n/g, " ")), th: cs.length > 0 && cs.every((c) => c.tag === "th") }); } else collect(k); } };
      collect(n);
      if (rows.length) {
        const width = Math.max(...rows.map((r) => r.cells.length)), pad = (r: string[]) => Array.from({ length: width }, (_, i) => r[i] ?? "");
        const hasHead = rows[0].th;
        emit({ kind: "table", source: "html", table: hasHead ? { header: pad(rows[0].cells), rows: rows.slice(1).map((r) => pad(r.cells)) } : { header: Array.from({ length: width }, (_, i) => `c${i + 1}`), rows: rows.map((r) => pad(r.cells)) }, page }, w);
      }
      return;
    }
    if (n.tag === "hr") return;
    let buf = "";
    const flush = () => { const t = squash(buf); buf = ""; if (t) emit({ kind: "paragraph", text: t, page }, w); };
    for (const k of n.kids) { if (isBlock(k)) { flush(); walk(k, w); } else buf += inline(k); }
    flush();
  };
  walk(dom(html), "");
  // Consecutive boilerplate blocks with the same reason read as one region.
  const merged: Block[] = [];
  for (const b of out) { const l = merged[merged.length - 1]; if (b.kind === "boiler" && l?.kind === "boiler" && l.why === b.why) l.text += "\n" + b.text; else merged.push(b); }
  return merged;
}

// ------------------------------------------------------------------------------------------------ entry

export function detect(input: Input): "html" | "json" | "csv" | "tsv" | "text" {
  if (input.hint) return input.hint;
  const t = (input.text ?? "").trim();
  if (/^<(!doctype|html|body|div|p|table|h[1-6]|ul|section|article)\b/i.test(t) && (t.match(/<\/?[a-z][a-z0-9-]*(\s[^<>]*)?>/gi) ?? []).length >= 3) return "html";
  if (/^[[{]/.test(t) && parseJson(t)) return "json";
  const d = looksDelimited(t);
  return d === "," ? "csv" : d === "\t" ? "tsv" : "text";
}

export function read(input: Input): Block[] {
  if (input.pages?.length) return parsePages(input.pages);
  const text = input.text ?? "", kind = detect(input);
  if (kind === "html") return parseHtml(text);
  if (kind === "json") { const b = fromJson(text.trim()); return b ? [b] : parseText(text); }
  if (kind === "csv" || kind === "tsv") { const rows = parseDelimited(text.trim(), kind === "csv" ? "," : "\t"); if (rows && rows.length) return [{ kind: "table", table: tableFromRows(rows), source: kind }]; }
  return parseText(text);
}
