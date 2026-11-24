/** Checks for the token-efficient conversion engine. Run: npx tsx scripts/check-tec.ts */
import { approxCounter } from "../src/lib/optimize/tec/tokens";
import { encodeTable, decodeById, sameTable, numericColumns, stripCommas, CANDIDATE_IDS } from "../src/lib/optimize/tec/tables";
import type { Table } from "../src/lib/optimize/tec/types";

let pass = 0, bad = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { bad++; console.error("FAIL " + m); } };

// A small seeded generator so a failure can be reproduced.
function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------------------------------- tables read back exactly
const awkward = ["", " lead", "trail ", 'say "hi"', "a,b", "a;b", "x=y", "line\nbreak", "tab\there", "pipe|bar", "Zürich", "1,204.50", "-3,000", "007", "Dubai International Financial Centre", "ACTIVE", "CLOSED", "k: v"];
for (let seed = 1; seed <= 400; seed++) {
  const r = rng(seed), cols = 2 + Math.floor(r() * 5), rows = 3 + Math.floor(r() * 14);
  const header = Array.from({ length: cols }, (_, i) => (r() < 0.15 ? awkward[3 + Math.floor(r() * 7)] + i : `col${i}`));
  const constant = r() < 0.4 ? Math.floor(r() * cols) : -1;
  const t: Table = { header, rows: Array.from({ length: rows }, () => header.map((_, c) => (c === constant ? "USD" : r() < 0.5 ? awkward[Math.floor(r() * awkward.length)] : `v${Math.floor(r() * 4)} ${r() < 0.5 ? "Dubai International Financial Centre" : "ok"}`))) };
  for (const level of ["lossless", "structural"] as const) {
    const e = encodeTable(t, approxCounter, level);
    ok(e.candidates.some((c) => c.chosen), `seed ${seed} ${level}: a candidate is chosen`);
    ok(e.candidates.every((c) => CANDIDATE_IDS.includes(c.id)), `seed ${seed}: known candidates`);
    // Independent of the encoder's own check: the chosen text must read back to the same cells, with thousands separators dropped.
    const nums = numericColumns(t), want = nums.size ? stripCommas(t, nums) : t;
    const back = decodeById(e.text, e.id);
    ok(!!back && sameTable(want, back), `seed ${seed} ${level}: ${e.id} reads back exactly`);
  }
}
// numeric columns lose their separators, and nothing else changes
{
  const t: Table = { header: ["Account", "Amount"], rows: [["A1", "1,204.50"], ["A2", "88.10"], ["A3", "12,000"]] };
  const e = encodeTable(t, approxCounter, "lossless");
  ok(!e.text.includes("1,204.50") || e.id === "md" && false, "thousands separators dropped: " + e.text.replace(/\n/g, "/"));
  ok(e.text.includes("1204.50") && e.text.includes("12000"), "values kept");
}
// a constant column is stated once and a coded column has a legend
{
  const branch = ["Dubai International Financial Centre", "Abu Dhabi Corniche Branch", "Sharjah Central Souq Branch"];
  const rows = Array.from({ length: 40 }, (_, i) => [`2026-09-${String(1 + (i % 28)).padStart(2, "0")}`, `AC-${20000 + i * 7}`, branch[i % 3], "USD", String(100 + i * 3)]);
  const t: Table = { header: ["Date", "Account", "Branch", "Currency", "Amount"], rows };
  const lossless = encodeTable(t, approxCounter, "lossless"), structural = encodeTable(t, approxCounter, "structural");
  ok(structural.candidates.find((c) => c.chosen)!.tokens <= lossless.candidates.find((c) => c.chosen)!.tokens, "structural is never worse than lossless");
  ok(/Same in every row: Currency=USD/.test(structural.text), "constant column stated once");
  ok(/Codes for Branch: A=Dubai International Financial Centre/.test(structural.text), "repeated values coded with a legend: " + structural.id);
  ok(structural.candidates.length > lossless.candidates.length, "more candidates are considered at the structural level");
  const csv = lossless.candidates.find((c) => c.id === "csv")!, md = lossless.candidates.find((c) => c.id === "md")!;
  ok(csv.tokens < md.tokens, "csv is cheaper than a markdown table here");
}
// a cell with trailing spaces cannot live in a markdown table, so that form is refused and another is used
{
  const t: Table = { header: ["a", "b"], rows: [["x,y", 'q"r'], ["", " s "], ["1", "2"]] };
  const e = encodeTable(t, approxCounter, "lossless");
  ok(!e.candidates.some((c) => c.id === "md"), "markdown refused for a cell with edge spaces");
  const back = decodeById(e.text, e.id);
  ok(!!back && sameTable(t, back), "the form that is used keeps the spaces");
}
console.log(`${pass} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
