import { PROTECTED, terms } from "./critical";
import type { Block, Counter } from "./types";

/**
 * Fitting to a budget. The unit is a sentence of a paragraph or an item of a list. Units that match the question strongly are always kept.
 * Everything else competes for the budget by relevance, by whether it holds a number, identifier, quotation or link, by being the first sentence
 * of its paragraph, and by sitting next to a kept unit, and loses points for repeating what is already kept. Tables and code are never cut.
 */

type Unit = { sep: string; bi: number; ui: number; text: string; tokens: number; protect: boolean; score: number; set: Set<string> };

// A unit ends at the end of a sentence or at a line break, so a log or a list of lines is cut line by line, not all or nothing.
const SENT = /((?<=[.!?])\s+(?=[A-Z0-9"“(])|\n+)/;
const pieces = (t: string) => { const p = t.split(SENT), out: { text: string; sep: string }[] = []; for (let i = 0; i < p.length; i += 2) out.push({ text: p[i], sep: p[i + 1] ?? "" }); return out.filter((x) => x.text.trim() !== ""); };

function bm25(units: Unit[], q: Set<string>, headings: string[]): number[] {
  const docs = units.map((u) => terms(headings[u.bi] + " " + u.text));
  const N = docs.length || 1, avg = docs.reduce((s, d) => s + d.length, 0) / N || 1;
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  return docs.map((d) => {
    const tf = new Map<string, number>();
    for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
    let s = 0;
    for (const t of q) { const f = tf.get(t) ?? 0; if (!f) continue; const n = df.get(t) ?? 0; s += Math.log(1 + (N - n + 0.5) / (n + 0.5)) * ((f * 2.2) / (f + 1.2 * (0.25 + (0.75 * d.length) / avg))); }
    return s;
  });
}

export function pack(blocks: Block[], question: string, keep: number, counter: Counter): { blocks: Block[]; dropped: number; total: number } {
  const q = new Set(terms(question));
  const units: Unit[] = [], headings: string[] = [];
  let head = "";
  blocks.forEach((b, bi) => {
    headings[bi] = head;
    if (b.kind === "heading") head = b.text;
    if (b.kind === "paragraph") pieces(b.text).forEach(({ text: t, sep }, ui) => units.push({ sep, bi, ui, text: t, tokens: counter.count(t), protect: PROTECTED.test(t), score: 0, set: new Set(terms(t)) }));
    else if (b.kind === "list") b.items.forEach((t, ui) => units.push({ sep: "", bi, ui, text: t, tokens: counter.count(t), protect: PROTECTED.test(t), score: 0, set: new Set(terms(t)) }));
  });
  if (!units.length || !q.size) return { blocks, dropped: 0, total: units.length };
  const scores = bm25(units, q, headings), top = Math.max(...scores, 0);
  // If nothing in the document mentions anything in the question there is nothing to rank by, so nothing is cut.
  if (top <= 0) return { blocks, dropped: 0, total: units.length };
  // Only a strong match to the question is protected outright. Everything else competes for the budget, and units with numbers, identifiers,
  // quotations or links start with a large head start, so they are the last things to go.
  units.forEach((u, i) => { u.score = scores[i] / top; });
  const sel = new Set<number>(units.map((u, i) => (u.score >= 0.5 ? i : -1)).filter((i) => i >= 0));
  const budget = Math.ceil(keep * units.reduce((s, u) => s + u.tokens, 0));
  let used = [...sel].reduce((s, i) => s + units[i].tokens, 0);
  const jac = (a: Set<string>, b: Set<string>) => { if (!a.size || !b.size) return 0; let n = 0; for (const t of a) if (b.has(t)) n++; return n / (a.size + b.size - n); };
  const adj = (i: number) => { let a = 0; for (const d of [1, 2]) for (const j of [i - d, i + d]) if (units[j] && units[j].bi === units[i].bi && sel.has(j)) a = Math.max(a, d === 1 ? 1 : 0.5); return a; };
  const red = units.map((u) => { let m = 0; for (const j of sel) m = Math.max(m, jac(u.set, units[j].set)); return m; });
  const base = units.map((u) => 1.5 * u.score + (u.protect ? 1 : 0) + (u.ui === 0 ? 0.4 : 0.3 / (1 + u.ui)));
  // Greedy: take the unit worth most, then update what is adjacent to it and what repeats it, because each pick changes both.
  while (used < budget) {
    let best = -1, bestGain = 0;
    for (let i = 0; i < units.length; i++) {
      if (sel.has(i) || used + units[i].tokens > budget) continue;
      const gain = base[i] + 0.8 * adj(i) - 0.9 * red[i];
      if (gain > bestGain) { best = i; bestGain = gain; }
    }
    if (best < 0) break;
    sel.add(best); used += units[best].tokens;
    for (let i = 0; i < units.length; i++) if (!sel.has(i)) red[i] = Math.max(red[i], jac(units[i].set, units[best].set));
  }
  const keepAt = new Map<number, Set<number>>();
  units.forEach((u, i) => { if (sel.has(i)) { if (!keepAt.has(u.bi)) keepAt.set(u.bi, new Set()); keepAt.get(u.bi)!.add(u.ui); } });
  const out: Block[] = [];
  blocks.forEach((b, bi) => {
    if (b.kind === "paragraph") { const k = keepAt.get(bi); if (!k) return; const s = pieces(b.text).filter((_, ui) => k.has(ui)); out.push({ ...b, text: s.map((x, i) => (i < s.length - 1 ? x.text + (x.sep.includes("\n") ? "\n" : " ") : x.text)).join("") }); }
    else if (b.kind === "list") { const k = keepAt.get(bi); if (!k) return; out.push({ ...b, items: b.items.filter((_, ui) => k.has(ui)) }); }
    else out.push(b);
  });
  return { blocks: out, dropped: units.length - sel.size, total: units.length };
}
