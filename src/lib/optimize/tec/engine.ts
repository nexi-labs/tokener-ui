import { applyAliases, expand, type Alias } from "./alias";
import { criticalDetails, present } from "./critical";
import { pack } from "./pack";
import { read } from "./parse";
import { renderBlocks } from "./render";
import { encodeTable, plainTable } from "./tables";
import { KEEP, LEVEL_STAGES, PIPELINE, STAGE_META, type Block, type Encoded, type Input, type Options, type Result, type StageId, type StageReport } from "./types";

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const SENTENCES = /(?<=[.!?])\s+(?=[A-Z0-9"“(])/;
const SIGNATURE: RegExp[] = [/^--\s*$/, /^sent from my /i, /^get outlook for /i, /^this (e-?mail|message) and any (attachments|files)/i, /^(the )?information (contained )?in this (e-?mail|message)/i, /^confidentiality notice/i, /^please consider the environment/i, /^to unsubscribe|^unsubscribe /i, /^you are receiving this (e-?mail|message) because/i];
const PAGE_NUMBER = /^(page\s+)?#+(\s*(of|\/)\s*#+)?$|^[-–—\s]*#+[-–—\s]*$/;
const edgeKey = (s: string) => norm(s).replace(/\d+/g, "#").replace(/^[^\p{L}#]+|[^\p{L}#]+$/gu, "");

// ------------------------------------------------------------------------------------------------ stages

/** Running headers, footers and page numbers: lines that sit at the edge of most pages and say the same thing on each. */
function furniture(blocks: Block[], log: string[], removed: string[]): Block[] {
  const pages = new Set(blocks.filter((b) => b.kind === "edge").map((b) => b.page));
  const need = Math.max(3, Math.ceil(pages.size / 2));
  const seen = new Map<string, Set<number | undefined>>();
  for (const b of blocks) if (b.kind === "edge") { const k = edgeKey(b.text); if (!seen.has(k)) seen.set(k, new Set()); seen.get(k)!.add(b.page); }
  const running = new Set([...seen].filter(([k, p]) => pages.size >= 3 && p.size >= need && k !== "").map(([k]) => k));
  const stated: string[] = [], out: Block[] = []; let dropped = 0, numbers = 0;
  for (const b of blocks) {
    if (b.kind !== "edge") { out.push(b); continue; }
    const k = edgeKey(b.text);
    if (PAGE_NUMBER.test(norm(b.text).replace(/\d+/g, "#"))) { numbers++; removed.push(b.text); continue; }
    if (running.has(k)) { dropped++; removed.push(b.text); if (!stated.some((s) => edgeKey(s) === k)) stated.push(b.text); continue; }
    out.push({ kind: "paragraph", text: b.text, page: b.page });
  }
  if (numbers) log.push(`${numbers} page number${numbers > 1 ? "s" : ""} removed`);
  if (dropped) log.push(`${dropped} repeated header or footer lines removed, ${stated.length} kept once at the top`);
  return stated.length ? [{ kind: "paragraph", text: "On every page: " + stated.join(" | ") }, ...out] : out;
}

function boilerplate(blocks: Block[], log: string[], removed: string[]): Block[] {
  let web = 0, sig = 0; const out: Block[] = [];
  for (const b of blocks) {
    if (b.kind === "boiler") { web++; removed.push(b.text); continue; }
    if (b.kind === "paragraph") {
      const lines = b.text.split("\n"), cut = lines.findIndex((l) => SIGNATURE.some((r) => r.test(l.trim())));
      if (cut >= 0) { sig += lines.length - cut; removed.push(lines.slice(cut).join("\n")); if (cut === 0) continue; out.push({ ...b, text: lines.slice(0, cut).join("\n") }); continue; }
    }
    out.push(b);
  }
  if (web) log.push(`${web} navigation, footer or notice region${web > 1 ? "s" : ""} removed`);
  if (sig) log.push(`${sig} signature or disclaimer line${sig > 1 ? "s" : ""} removed`);
  return out;
}

const TIMESTAMP = /^\s*(\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}|\[|[-*•]\s|\d+[.)]\s)/;
const KV = /\b\w+=\S+/;
function unwrapLines(text: string): string {
  const lines = text.split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim());
  if (lines.length < 3 || lines.filter((l) => KV.test(l)).length >= lines.length / 2) return lines.join("\n");
  const body = lines.slice(0, -1);
  if (body.filter((l) => l.length >= 45).length < body.length * 0.6) return lines.join("\n");
  let out = lines[0];
  for (let i = 1; i < lines.length; i++) out += lines[i - 1].length >= 40 && !/[.!?:;"”)\]]$/.test(lines[i - 1]) && !TIMESTAMP.test(lines[i]) ? " " + lines[i] : "\n" + lines[i];
  return out;
}

function tidy(blocks: Block[], log: string[]): Block[] {
  let joined = 0, merged = 0;
  const out: Block[] = [];
  for (const b of blocks) {
    let nb: Block = b;
    if (b.kind === "paragraph") { const t = unwrapLines(b.text); if (t.split("\n").length < b.text.split("\n").length) joined += b.text.split("\n").length - t.split("\n").length; nb = { ...b, text: t }; }
    else if (b.kind === "heading") nb = { ...b, text: b.text.replace(/\s+/g, " ").trim() };
    else if (b.kind === "list") nb = { ...b, items: b.items.map((x) => x.replace(/[ \t]+/g, " ").trim()) };
    const last = out[out.length - 1];
    // A sentence that runs over a page break is rejoined.
    if (nb.kind === "paragraph" && last?.kind === "paragraph" && last.page !== undefined && nb.page === last.page + 1 && !/[.!?:;"”)\]]$/.test(last.text) && /^[\p{Ll}]/u.test(nb.text)) { out[out.length - 1] = { ...last, text: last.text + " " + nb.text }; merged++; continue; }
    out.push(nb);
  }
  if (joined) log.push(`${joined} line break${joined > 1 ? "s" : ""} inside sentences removed`);
  if (merged) log.push(`${merged} sentence${merged > 1 ? "s" : ""} rejoined across page breaks`);
  return out;
}

function jaccard(a: Set<string>, b: Set<string>) { let n = 0; for (const t of a) if (b.has(t)) n++; return n / (a.size + b.size - n || 1); }
const shingles = (s: string) => { const w = norm(s).split(" "), out = new Set<string>(); for (let i = 0; i + 4 <= w.length; i++) out.add(w.slice(i, i + 4).join(" ")); return out; };

function dedupe(blocks: Block[], near: boolean, log: string[]): Block[] {
  const seen = new Set<string>(), seenSent = new Set<string>(), kept: { s: Set<string> }[] = [];
  let blocksGone = 0, sentGone = 0, nearGone = 0, runs = 0;
  const out: Block[] = [];
  for (const b of blocks) {
    if (b.kind === "paragraph") {
      const k = norm(b.text);
      if (k.length >= 40) {
        if (seen.has(k)) { blocksGone++; continue; }
        seen.add(k);
        if (near && k.split(" ").length >= 30) {
          const s = shingles(b.text);
          if (kept.some((o) => jaccard(s, o.s) >= 0.85)) { nearGone++; continue; }
          kept.push({ s });
        }
      }
      const lines = b.text.split("\n").map((l) => l.split(SENTENCES).filter((x) => { const kk = norm(x); if (kk.length < 40) return true; if (seenSent.has(kk)) { sentGone++; return false; } seenSent.add(kk); return true; }).join(" ")).filter((l) => l.trim() !== "");
      if (!lines.length) continue;
      let text = lines.join("\n");
      if (near) { const rl = collapseRuns(text); if (rl.n) { runs += rl.n; text = rl.text; } }
      out.push({ ...b, text });
      continue;
    }
    if (b.kind === "table" && b.table.rows.length >= 3) { const k = norm(plainTable(b.table)); if (seen.has(k)) { blocksGone++; continue; } seen.add(k); }
    out.push(b);
  }
  if (blocksGone) log.push(`${blocksGone} repeated block${blocksGone > 1 ? "s" : ""} removed`);
  if (sentGone) log.push(`${sentGone} repeated sentence${sentGone > 1 ? "s" : ""} removed`);
  if (nearGone) log.push(`${nearGone} near-identical paragraph${nearGone > 1 ? "s" : ""} removed`);
  if (runs) log.push(`${runs} repeated log line${runs > 1 ? "s" : ""} folded into counts`);
  return out;
}

/** Identical lines in a row, as in a log, become one line with a count. */
function collapseRuns(text: string): { text: string; n: number } {
  const lines = text.split("\n"), out: string[] = []; let n = 0;
  for (let i = 0; i < lines.length;) {
    let j = i; while (j + 1 < lines.length && lines[j + 1] === lines[i]) j++;
    const c = j - i + 1;
    if (c >= 3 && lines[i].trim() !== "") { out.push(`${lines[i]} (repeated ${c} times)`); n += c - 1; } else for (let k = i; k <= j; k++) out.push(lines[k]);
    i = j + 1;
  }
  return { text: out.join("\n"), n };
}

// ------------------------------------------------------------------------------------------------ engine

const KINDS: Record<string, string> = { heading: "headings", paragraph: "paragraphs", list: "lists", table: "tables", code: "code blocks", data: "data blocks", edge: "page edge lines", boiler: "boilerplate regions" };
const proseOf = (b: Block): string[] => (b.kind === "paragraph" || b.kind === "heading" ? [b.text] : b.kind === "list" ? b.items : []);
const withProse = (b: Block, t: string[]): Block => (b.kind === "paragraph" || b.kind === "heading" ? { ...b, text: t[0] } : b.kind === "list" ? { ...b, items: t } : b);

export function convert(raw0: Input, opt: Options): Result {
  // PDF text extractors separate pages with a form feed, so text that has them is read page by page.
  const input: Input = !raw0.pages?.length && raw0.text?.includes("\f") ? { ...raw0, pages: raw0.text.split("\f") } : raw0;
  const { counter } = opt, question = input.question ?? "";
  const raw = input.pages?.length ? input.pages.join("\n\n") : input.text ?? "";
  const qTokens = counter.count(question), before = counter.count(raw) + qTokens;
  const on = new Set<StageId>(opt.level === "off" ? [] : opt.stages ?? LEVEL_STAGES[opt.level]);
  const structural = opt.level === "balanced" || opt.level === "aggressive";
  const reports: StageReport[] = [];
  let blocks: Block[] = [], legend = "", aliases: Alias[] = [];
  const fallbacks: string[] = [], removed: string[] = [];
  const text = () => renderBlocks(blocks, { pageMarkers: opt.pageMarkers ?? !!input.pages?.length, legend });
  let at = counter.count(raw);

  const run = (id: StageId, f: (log: string[]) => void, skip?: string) => {
    const m = STAGE_META[id];
    if (skip || !on.has(id) || (!blocks.length && id !== "parse")) { reports.push({ id, label: m.label, risk: m.risk, applied: false, before: at, after: at, changes: [], skipped: skip ?? (blocks.length || id === "parse" ? "Off for this policy" : "Nothing to read") }); return; }
    const log: string[] = [], b0 = at;
    f(log);
    at = counter.count(text());
    reports.push({ id, label: m.label, risk: m.risk, applied: true, before: b0, after: at, changes: log });
  };

  run("parse", (log) => {
    blocks = read(input);
    const n: Record<string, number> = {};
    for (const b of blocks) n[KINDS[b.kind]] = (n[KINDS[b.kind]] ?? 0) + 1;
    const one = (k: string, v: number) => (v === 1 ? k.replace(/s$/, "") : k);
    log.push(Object.entries(n).map(([k, v]) => `${v} ${one(k, v)}`).join(", ") || "no content");
  });
  if (!on.has("parse")) return { output: raw0.text ?? raw, before, after: before, stages: PIPELINE.map((id) => ({ id, label: STAGE_META[id].label, risk: STAGE_META[id].risk, applied: false, before, after: before, changes: [], skipped: "Off for this policy" })), question, tables: [], aliases: [], critical: { total: 0, kept: 0, lost: [], excused: [], cut: [] }, fallbacks, structure: {} };
  const structure: Record<string, number> = {};
  for (const b of blocks) structure[KINDS[b.kind]] = (structure[KINDS[b.kind]] ?? 0) + 1;

  run("noise", (log) => { blocks = boilerplate(furniture(blocks, log, removed), log, removed); });
  run("unwrap", (log) => { blocks = tidy(blocks, log); });
  run("dedupe", (log) => { blocks = dedupe(blocks, structural, log); });
  run("format", (log) => {
    const used: Record<string, number> = {};
    blocks = blocks.map((b) => {
      if (b.kind !== "table") return b;
      const e: Encoded = encodeTable(b.table, counter, structural ? "structural" : "lossless");
      used[e.id] = (used[e.id] ?? 0) + 1;
      return { ...b, encoded: e };
    });
    const n = Object.values(used).reduce((a, c) => a + c, 0);
    if (n) log.push(`${n} table${n > 1 ? "s" : ""} written as ${Object.entries(used).map(([k, v]) => `${k} (${v})`).join(", ")}, chosen by token count`);
    else log.push("No tables to encode");
  });
  run("alias", (log) => {
    const prose = blocks.flatMap(proseOf), r = applyAliases(prose, counter);
    if (!r.aliases.length) { log.push("No phrase repeats often enough to pay for its definition"); return; }
    // Verify before accepting: expanding the markers must give back exactly what was there.
    if (expand(r.texts, r.aliases).join("\u0000") !== prose.join("\u0000")) { fallbacks.push("Phrase markers could not be expanded exactly, so none were used."); log.push("Skipped: markers did not expand back exactly"); return; }
    let k = 0;
    blocks = blocks.map((b) => { const n = proseOf(b).length; if (!n) return b; const nb = withProse(b, r.texts.slice(k, k + n)); k += n; return nb; });
    legend = r.legend; aliases = r.aliases;
    log.push(`${r.aliases.length} phrase${r.aliases.length > 1 ? "s" : ""} defined once: ${r.aliases.slice(0, 3).map((a) => `${a.marker} = ${a.phrase.length > 34 ? a.phrase.slice(0, 31) + "..." : a.phrase} (${a.uses}x)`).join("; ")}${r.aliases.length > 3 ? "; ..." : ""}`);
  });
  let preFit = "";
  run("pack", (log) => {
    preFit = text();
    const keep = opt.keep ?? KEEP[opt.level], r = pack(blocks, question, keep, counter);
    blocks = r.blocks;
    log.push(r.dropped ? `${r.dropped} of ${r.total} sentences or lines dropped, strong matches to the question kept and numbers, identifiers and links dropped last` : "Nothing to drop");
  }, question.trim() ? undefined : "Needs a question to decide what matters");

  const output = text();
  // The check that matters: every number, identifier, address and link in the input is still in what is sent. Three things are accounted for
  // separately: text a stage removed on purpose (a footer, a signature), details cut by fitting to the question, and anything else, which is a defect.
  const gone = (t: string, c: string) => !present(t, c) && !present(question, c);
  const full = (t: string) => (aliases.length ? expand([t], aliases)[0] + "\n" + t : t);
  const crit = criticalDetails(raw), outFull = full(output), packed = reports.find((r) => r.id === "pack")?.applied ? full(preFit) : outFull;
  const dropAll = crit.filter((c) => gone(outFull, c));
  const excused = dropAll.filter((c) => present(removed.join("\n"), c) && gone(packed, c));
  const cut = dropAll.filter((c) => !excused.includes(c) && !gone(packed, c));
  const lost = dropAll.filter((c) => !excused.includes(c) && !cut.includes(c));
  // A defect is never sent on: if anything was lost without a reason, the original goes through unchanged and the record says why.
  if (lost.length) {
    fallbacks.push(`Conversion lost ${lost.length} detail${lost.length > 1 ? "s" : ""} (${lost.slice(0, 3).join(", ")}), so the original was sent unchanged.`);
    return { output: raw, before, after: before, stages: reports, question, tables: [], aliases: [], critical: { total: crit.length, kept: crit.length, lost, excused: [], cut: [] }, fallbacks, structure };
  }
  const tables = blocks.flatMap((b, i) => (b.kind === "table" ? [{ index: i, rows: b.table.rows.length, cols: b.table.header.length, encoded: b.encoded ?? { id: "md", text: plainTable(b.table), candidates: [] } }] : []));
  return { output, before, after: counter.count(output) + qTokens, stages: reports, question, tables, aliases, critical: { total: crit.length, kept: crit.length - dropAll.length, lost, excused, cut }, fallbacks, structure };
}
