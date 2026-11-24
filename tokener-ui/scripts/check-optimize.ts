/** Checks the optimizer as the console uses it, on the sample inputs. Run: npx tsx scripts/check-optimize.ts */
import { optimize, estimateTokens, criticalDetails, MODE_STAGES, STAGES } from "../src/lib/optimize/stages";
import { SAMPLE_PROMPTS } from "../src/lib/optimize/samples";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };

ok(STAGES.length === 7 && STAGES[0].id === "parse" && STAGES[6].id === "pack", "seven stages in order");
ok(MODE_STAGES.lossless.every((s) => STAGES.find((x) => x.id === s)!.risk === "lossless"), "lossless level has only lossless stages");
ok(!MODE_STAGES.lossless.includes("pack") && !MODE_STAGES.lossless.includes("noise"), "lossless level has no structural or lossy stage");
ok(estimateTokens("") === 0 && estimateTokens("hello world") > 0, "estimate sane");
ok(criticalDetails("Call 555-0100 or mail a@b.co, order ORD-12, https://x.io/a.").length >= 4, "critical details found");

for (const s of SAMPLE_PROMPTS) {
  const l = optimize(s.text, s.question, "lossless");
  ok(l.critical.lost.length === 0 && l.critical.cut.length === 0, `${s.id}: lossless keeps every detail`);
  ok(l.after <= l.before, `${s.id}: lossless does not grow (${l.before} -> ${l.after})`);
  for (const m of ["balanced", "aggressive"] as const) {
    const r = optimize(s.text, s.question, m);
    ok(r.critical.lost.length === 0, `${s.id}: ${m} has no unexplained loss`);
    ok(r.after <= l.after + 2, `${s.id}: ${m} is no larger than lossless (${r.after} vs ${l.after})`);
    ok(r.output.trim().length > 0, `${s.id}: ${m} not empty`);
  }
  ok(optimize(s.text, s.question, "off").output === s.text, `${s.id}: off changes nothing`);
}
const csv = SAMPLE_PROMPTS.find((s) => s.id === "csv-export")!;
ok(optimize(csv.text, "", "balanced").tables.length === 1, "csv sample read as one table");
const pdf = SAMPLE_PROMPTS.find((s) => s.id === "pdf-report")!;
ok(!/Page \d+ of 10/.test(optimize(pdf.text, "", "balanced").output), "pdf sample page numbers removed at balanced");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
