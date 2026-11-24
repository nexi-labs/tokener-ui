import { convert } from "../src/lib/optimize/tec/engine";
import { approxCounter } from "../src/lib/optimize/tec/tokens";
import { criticalDetails, present } from "../src/lib/optimize/tec/critical";
import type { Level } from "../src/lib/optimize/tec/types";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const run = (text: string, level: Level, q?: string, extra: object = {}) => convert({ text, question: q, ...extra }, { level, counter: approxCounter });

// 1. csv table
const csv = "id,name,region,status,amount\n" + Array.from({ length: 40 }, (_, i) => `${1000 + i},Customer ${i},EMEA,active,"${(i * 1234 + 5000).toLocaleString("en-US")}"`).join("\n");
for (const lv of ["lossless", "balanced", "aggressive"] as Level[]) {
  const r = run(csv, lv);
  ok(r.after < r.before, `csv shrinks at ${lv}: ${r.before} -> ${r.after}`);
  ok(r.critical.lost.length === 0, `csv keeps details at ${lv}: ${r.critical.lost.slice(0, 3)}`);
}

// 2. html boilerplate
const html = `<html><head><style>.a{color:red}</style><script>var x=1</script></head><body><nav><a href="/">Home</a><a href="/p">Products</a></nav><main><h1>Refund policy</h1><p>Refunds are issued within 14 days of the request, order #88213, to the original card.</p></main><footer>Copyright 2026 Acme. All rights reserved. <a href="/t">Terms</a></footer></body></html>`;
const h = run(html, "balanced");
const hl = run(html, "lossless");
ok(hl.stages.find((s) => s.id === "noise")?.applied === false, "lossless leaves noise stage off");
ok(!/Copyright/.test(h.output) && !/Home/.test(h.output), "html boilerplate removed");
ok(h.after < h.before / 2, `html shrinks by half: ${h.before} -> ${h.after}`);
ok(/88213/.test(h.output) && /14 days/.test(h.output), "html keeps facts");
ok(!/<script|color:red|<nav/.test(h.output), "html markup gone");

// 3. pdf-like pages with running header and page numbers
const pages = Array.from({ length: 6 }, (_, i) => `ACME CORP CONFIDENTIAL\nAnnual report 2026\nThe committee reviewed item ${i + 1} and found that the control was operating\neffectively across all regions during the period under review.\nRevenue for segment ${i + 1} was ${(i + 3) * 1.7}M.\nMore text follows here so there are enough lines.\nPage ${i + 1} of 6\n`);
const p = run("", "balanced", undefined, { pages });
ok(!/Page \d of 6/.test(p.output), "page numbers gone");
ok((p.output.match(/ACME CORP CONFIDENTIAL/g) ?? []).length === 1, `running header once: ${(p.output.match(/ACME CORP CONFIDENTIAL/g) ?? []).length}`);
ok(p.critical.lost.length === 0, "pdf keeps details " + p.critical.lost.join(","));
ok(!/operating\neffectively/.test(p.output), "hard wraps joined");

// 4. dedupe
const para = "The customer must provide a valid government issued identification document before the account can be opened.";
const d = run(`${para}\n\nOther text here.\n\n${para}\n\n${para}`, "lossless");
ok((d.output.match(/government issued/g) ?? []).length === 1, "duplicate paragraph removed");

// 5. alias, only structural, round trip critical
const rep = Array.from({ length: 12 }, (_, i) => `The service level agreement covers incident ${i} for the enterprise customer success team.`).join("\n\n");
const a = run(rep, "balanced");
ok(a.after <= a.before, "alias never grows");
ok(a.critical.lost.length === 0, "alias keeps details");

// 6. pack needs question, keeps matching and critical
const doc = Array.from({ length: 30 }, (_, i) => `Filler sentence number ${i} talks about nothing in particular at length.`).join(" ") + " The warranty period is 24 months from delivery. Contact support@acme.io for claims.";
const pk = run(doc, "aggressive", "What is the warranty period?");
ok(/24 months/.test(pk.output), "pack keeps answer");
ok(/support@acme\.io/.test(pk.output), "pack keeps identifiers");
ok(pk.after < pk.before * 0.7, `pack shrinks: ${pk.before} -> ${pk.after}`);
const np = run(doc, "aggressive");
ok(np.stages.find((s) => s.id === "pack")?.applied === false, "pack skipped without question");

// 7. off
const off = run(csv, "off");
ok(off.output === csv && off.after === off.before, "off is identity");

// 8. lossless never loses critical details on mixed text
const mixed = "Invoice INV-2026-0042 for $1,250.00 due 2026-12-01. Questions to billing@x.com or https://x.com/pay?id=7.\n\n```py\nprint(1)\n```";
const m = run(mixed, "lossless");
ok(m.critical.lost.length === 0 && criticalDetails(mixed).every((c) => present(m.output, c)), "mixed keeps details");
ok(/print\(1\)/.test(m.output), "code kept");

// 9. determinism
ok(run(csv, "balanced").output === run(csv, "balanced").output, "deterministic");

// 10. empty
ok(run("", "balanced").output === "", "empty ok");

// 11. pack never empties a document and never cuts when nothing matches
const logText = Array.from({ length: 50 }, (_, i) => `2026-10-30T10:00:${String(i).padStart(2, "0")}Z INFO gateway request_id=req-${i} status=200`).join("\n");
const lg = run(logText, "aggressive", "Which requests failed?");
ok(lg.output.trim().length > 0, "log not emptied");
const nomatch = run(doc, "aggressive", "Zebra quantum mango?");
ok(nomatch.stages.find((s) => s.id === "pack")?.changes[0] === "Nothing to drop", "no match, no cut");
// 12. nested aliases expand back exactly
import { applyAliases, expand } from "../src/lib/optimize/tec/alias";
const rep2 = Array.from({ length: 10 }, (_, i) => `The Customer shall pay the Supplier the fees set out in the Order Form within thirty days (item ${i}).`);
const al = applyAliases(rep2, approxCounter);
ok(al.aliases.length > 0 && expand(al.texts, al.aliases).join("|") === rep2.join("|"), "aliases expand exactly");
// 13. balanced accounting of removed text
const foot = run(html, "balanced");
ok(foot.critical.lost.length === 0, "html has no unexplained loss: " + foot.critical.lost.join(","));
// 14. JSON numbers are kept exactly as written
const big = JSON.stringify({ rows: [{ id: "x", n: 0 }] }).length ? '[{"id":12345678901234567890,"amt":22.50,"ok":true,"note":null},{"id":12345678901234567891,"amt":1E5,"ok":false,"note":"a, b"}]' : "";
const bj = run(big, "lossless");
ok(/12345678901234567890/.test(bj.output) && /22\.50/.test(bj.output) && /1E5/.test(bj.output), "json numbers keep their lexeme: " + bj.output.replace(/\n/g, "|"));
import { parseJson, quote, minify } from "../src/lib/optimize/tec/json";
ok(parseJson("{\"a\":[1,2,{\"b\":\"\\u00e9\\n\"}]}") !== null && parseJson("{a:1}") === null && parseJson("[1,]") === null && parseJson("01") === null, "json strictness");
ok(quote("a\"b\\c\n\u0001") === JSON.stringify("a\"b\\c\n\u0001"), "quote matches JSON.stringify");
ok(minify(parseJson('{ "a" : [ 1 , 2.0 ] }')!) === '{"a":[1,2.0]}', "minify");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
