/**
 * Writes the conformance vectors the Java engine is tested against. The TypeScript engine is the reference: for every vector the Java engine must
 * return exactly the same text, the same token counts (with the deterministic approx-v1 counter) and the same reports.
 * Run: npx tsx scripts/gen-conformance.ts ../tokener-optimizer/src/test/resources/conformance/vectors.json
 */
import { writeFileSync } from "node:fs";
import { CORPUS } from "../src/lib/optimize/corpus";
import { SAMPLE_PROMPTS } from "../src/lib/optimize/samples";
import { convert } from "../src/lib/optimize/tec/engine";
import { approxCount, approxCounter } from "../src/lib/optimize/tec/tokens";
import { encodeTable } from "../src/lib/optimize/tec/tables";
import { applyAliases } from "../src/lib/optimize/tec/alias";
import { parseJson, quote, minify } from "../src/lib/optimize/tec/json";
import type { Level, Table } from "../src/lib/optimize/tec/types";

function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

type In = { text?: string; pages?: string[]; question?: string; hint?: "html" | "json" | "csv" | "tsv" | "text" };
const docs: { name: string; input: In }[] = [
  ...CORPUS.map((d) => ({ name: `corpus/${d.id}`, input: { ...d.input, question: d.question } as In })),
  ...SAMPLE_PROMPTS.map((s) => ({ name: `sample/${s.id}`, input: { text: s.text, question: s.question } as In })),
];
const small: [string, In][] = [
  ["empty", { text: "" }], ["one word", { text: "hello" }], ["crlf", { text: "line one\r\nline two\r\n\r\nline three" }],
  ["unicode", { text: "Zürich café 東京 😀 naïve résumé\n\nSecond paragraph with 日本語 and emoji 🚀🚀🚀 and more text to read." }],
  ["json numbers", { text: '[{"id":12345678901234567890,"amt":22.50,"ok":true,"note":null},{"id":12345678901234567891,"amt":1E5,"ok":false,"note":"a, b"},{"id":3,"amt":0.1,"ok":true,"note":"say \\"hi\\""}]' }],
  ["json nested", { text: '{"a":{"b":[1,2,3],"c":"x\\ny"},"d":null,"e":"é"}' }],
  ["json invalid", { text: '{"a": [1, 2,}' }],
  ["json strings", { text: '[{"k":"line\\nbreak","v":"tab\\there"},{"k":"quote\\"d","v":"back\\\\slash"},{"k":"u\\u00e9","v":"\\u0001ctl"}]' }],
  ["csv quoted", { text: 'id,name,notes\n1,"Smith, J","said ""yes"""\n2,Lee,"two\nlines"\n3,Kim,plain\n4,Ng,ok' }],
  ["csv unclosed", { text: 'a,b,c\n1,"2,3\n4,5,6\n7,8,9' }],
  ["tsv", { text: "a\tb\tc\n1\t2\t3\n4\t5\t6\n7\t8\t9" }],
  ["md table", { text: "# Title\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |\n\nAfter." }],
  ["fence", { text: "Intro.\n\n```python\nx = 1\n\n\ny = 2\n```\n\nOutro paragraph." }],
  ["lists", { text: "* one\n* two\n* three\n\n1. first\n2. second\n\nText." }],
  ["quote", { text: "> quoted line\n> another\n\nplain" }],
  ["html table", { text: "<html><body><h1>T</h1><table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></table><ul><li>x</li><li>y</li></ul><pre>code  here</pre><p>See <a href=\"https://x.io/p?q=1\">this</a>.</p></body></html>" }],
  ["html entities", { text: "<div><p>A &amp; B &lt; C &gt; D &quot;q&quot; &#39;s&#39; &nbsp; end</p><p>More</p><p>Text</p></div>" }],
  ["log runs", { text: "start\nsame line\nsame line\nsame line\nsame line\nend" }],
  ["dup sentences", { text: "The customer must provide identification before the account opens. Other text here.\n\nThe customer must provide identification before the account opens. Different closing words." }],
  ["wrapped", { text: "This is a long line that was broken by a pdf extractor in the middle of a\nsentence and continues here without any punctuation at the end of the line so\nit should be rejoined into one paragraph by the unwrap step of the engine." }],
  ["signature", { text: "Please refund order 5521.\n\n--\nJane Doe\n+44 20 7946 0958\n\nThis email and any attachments are confidential." }],
  ["no question pack", { text: "One sentence. Two sentence. Three sentence. Four sentence. Five sentence. Six sentence." }],
  ["form feed", { text: "Header A\nbody one\nbody two\nbody three\nbody four\nPage 1 of 3\fHeader A\nbody five\nbody six\nbody seven\nbody eight\nPage 2 of 3\fHeader A\nbody nine\nbody ten\nbody eleven\nbody twelve\nPage 3 of 3" }],
  ["marker clash", { text: Array.from({ length: 8 }, (_, i) => `§${i} The enterprise customer success team handles every incident for the premium support program today.`).join("\n\n") }],
];
for (const [name, input] of small) docs.push({ name: `small/${name}`, input });
const questions: Record<string, string> = { "small/no question pack": "What is the fourth thing?", "small/dup sentences": "What must the customer provide?", "small/wrapped": "What does the unwrap step do?" };

const levels: Level[] = ["off", "lossless", "balanced", "aggressive"];
const cases = [];
for (const d of docs) for (const level of levels) {
  const input = { ...d.input, question: questions[d.name] ?? d.input.question };
  const r = convert(input, { level, counter: approxCounter });
  cases.push({ name: `${d.name}@${level}`, input, level, expected: { output: r.output, before: r.before, after: r.after, stages: r.stages.map((s) => ({ id: s.id, applied: s.applied, before: s.before, after: s.after, changes: s.changes, skipped: s.skipped ?? null })), critical: r.critical, aliases: r.aliases, tables: r.tables.map((t) => ({ rows: t.rows, cols: t.cols, id: t.encoded.id, text: t.encoded.text, candidates: t.encoded.candidates })), fallbacks: r.fallbacks, structure: r.structure } });
}
// stage subsets and keep ratios
for (const d of docs.filter((x) => x.name.startsWith("corpus/") || x.name.startsWith("sample/"))) {
  const input = { ...d.input };
  const r = convert(input, { level: "balanced", counter: approxCounter, stages: ["parse", "noise", "unwrap", "dedupe", "format", "alias"], keep: 0.6 });
  cases.push({ name: `${d.name}@balanced-nofit`, input, level: "balanced", stages: ["parse", "noise", "unwrap", "dedupe", "format", "alias"], keep: 0.6, expected: { output: r.output, before: r.before, after: r.after, stages: r.stages.map((s) => ({ id: s.id, applied: s.applied, before: s.before, after: s.after, changes: s.changes, skipped: s.skipped ?? null })), critical: r.critical, aliases: r.aliases, tables: r.tables.map((t) => ({ rows: t.rows, cols: t.cols, id: t.encoded.id, text: t.encoded.text, candidates: t.encoded.candidates })), fallbacks: r.fallbacks, structure: r.structure } });
}

// tables
const r = rng(77), awkward = ["", " lead", "trail ", 'say "hi"', "a,b", "a;b", "x=y", "line\nbreak", "tab\there", "pipe|bar", "Zürich", "1,204.50", "-3,000", "007", "Dubai International Financial Centre", "ACTIVE", "CLOSED", "k: v"];
const tables = [];
for (let n = 0; n < 150; n++) {
  const cols = 2 + Math.floor(r() * 5), rows = 3 + Math.floor(r() * 14);
  const header = Array.from({ length: cols }, (_, i) => (r() < 0.15 ? awkward[3 + Math.floor(r() * 7)] + i : `col${i}`));
  const constant = r() < 0.4 ? Math.floor(r() * cols) : -1;
  const t: Table = { header, rows: Array.from({ length: rows }, () => header.map((_, c) => (c === constant ? "USD" : r() < 0.5 ? awkward[Math.floor(r() * awkward.length)] : `v${Math.floor(r() * 4)} ${r() < 0.5 ? "Dubai International Financial Centre" : "ok"}`))) };
  for (const level of ["lossless", "structural"] as const) { const e = encodeTable(t, approxCounter, level); tables.push({ table: t, level, expected: { id: e.id, text: e.text, candidates: e.candidates } }); }
}

// counter and json
const strings = ["", "hello", "Hello, world!", "1234567", "a  b", "a\n\nb\nc", "x".repeat(40), "日本語のテキスト", "😀😀", "price: $1,204.50 (net) -- ok", "   ", "\n", "tab\tsep", "snake_case_name", "UPPER CASE", "12-34-56", "…"];
const counter = strings.map((s) => ({ text: s, count: approxCount(s) }));
const jsonVectors = ['{"a":1}', "[1,2,3]", '"x"', "  [ ]  ", '{"a":1,"a":2}', "[1,]", "{a:1}", "01", "1.5e3", '"\\ud83d\\ude00"', '"\\u00zz"', '[[[[1]]]]', "nul", "true false", '{"k":"\\n\\t\\"\\\\\\/"}'].map((s) => { const v = parseJson(s); return { text: s, valid: !!v, minified: v ? minify(v) : null }; });
const quotes = ["plain", 'a"b', "a\\b", "line\nbreak", "\u0001\u001f", "é日本😀", "\ud800", "tab\t"].map((s) => ({ text: s, quoted: quote(s) }));

// aliases
const alias = [
  Array.from({ length: 10 }, (_, i) => `The Customer shall pay the Supplier the fees set out in the Order Form within thirty days (item ${i}).`),
  ["short text", "nothing repeats here at all", "unique words only"],
].map((texts) => { const a = applyAliases(texts, approxCounter); return { texts, expected: { texts: a.texts, legend: a.legend, aliases: a.aliases } }; });

const out = { generated: "by scripts/gen-conformance.ts", counter: "approx-v1", cases, tables, counterVectors: counter, jsonVectors, quotes, alias };
writeFileSync(process.argv[2] ?? "vectors.json", JSON.stringify(out));
console.log(`cases ${cases.length}, tables ${tables.length}, counter ${counter.length}, json ${jsonVectors.length}, alias ${alias.length}`);
