/**
 * Conformance vectors for image billing and planning, pixel measures, PDF routing, output policy, the repetition guard and history compaction.
 * The TypeScript code in src/lib/optimize/media is the reference and the Java engine must return exactly the same.
 * Run: npx tsx scripts/gen-conformance-media.ts ../tokener-optimizer/src/test/resources/conformance/media-vectors.json
 */
import { writeFileSync } from "node:fs";
import { billingFor, imageTokens } from "../src/lib/optimize/media/billing";
import { planImage, type Fidelity } from "../src/lib/optimize/media/plan";
import { classify, contentBox } from "../src/lib/optimize/media/pixels";
import { planPdf, routePage } from "../src/lib/optimize/media/pdf";
import { applyOutputPolicy, RepetitionGuard, type OutputPolicy } from "../src/lib/optimize/media/output";
import { compactHistory, type HMessage } from "../src/lib/optimize/media/history";
import { approxCounter } from "../src/lib/optimize/tec/tokens";

function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const models = ["claude-haiku-4-5", "claude-sonnet-4-20250514", "claude-3-5-sonnet", "claude-opus-5-5", "claude-sonnet-4-7", "gpt-4o", "gpt-4.1", "gpt-4o-mini", "gpt-4.1-mini", "gpt-5", "gpt-5-nano", "o3", "o4-mini", "gemini-2.5-pro", "mistral-large"];
const sizes: [number, number][] = [[1, 1], [64, 64], [200, 200], [384, 384], [385, 100], [500, 300], [1000, 1000], [1024, 768], [1092, 1092], [1920, 1080], [2000, 1500], [3000, 200], [3840, 2160], [4000, 3000], [8000, 8000], [768, 4000]];

const billing = [];
for (const model of models) for (const [w, h] of sizes) for (const detail of ["low", "high"] as const) {
  const b = billingFor(model);
  billing.push({ model, w, h, detail, label: b.label, family: b.family, expected: imageTokens(b, w, h, detail) });
}
const plans = [];
for (const model of models) for (const fidelity of ["exact", "standard", "economy"] as Fidelity[]) for (const kind of ["photo", "flat"] as const) for (const [w, h] of sizes) {
  const p = planImage({ w, h, model, fidelity, kind });
  plans.push({ model, fidelity, kind, w, h, expected: p });
}

// Pixels: small seeded images of several kinds
const r = rng(5), pixels = [];
const make = (w: number, h: number, f: (x: number, y: number) => number[]) => { const a: number[] = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [R, G, B, A = 255] = f(x, y); a.push(R, G, B, A); } return a; };
const kinds: [string, number, number, (x: number, y: number) => number[]][] = [
  ["framed", 60, 40, (x, y) => (x >= 12 && x < 40 && y >= 6 && y < 30 ? [10, 120, 200] : [255, 255, 255])],
  ["blank", 30, 30, () => [255, 255, 255]],
  ["thin border", 50, 40, (x) => (x < 48 ? [0, 0, 0] : [255, 255, 255])],
  ["noise", 48, 48, () => [Math.floor(r() * 256), Math.floor(r() * 256), Math.floor(r() * 256)]],
  ["stripes", 64, 32, (x, y) => ((x + y) % 7 < 3 ? [255, 255, 255] : [0, 0, 0])],
  ["near border", 40, 40, (x, y) => (x >= 5 && x < 35 && y >= 5 && y < 35 ? [200, 30, 30] : [250 + (x % 3), 250, 250])],
  ["gradient", 64, 64, (x, y) => [x * 4, y * 4, (x + y) * 2]],
  ["tiny", 6, 6, () => [1, 2, 3]],
  ["alpha border", 40, 30, (x, y) => (x >= 10 && x < 30 && y >= 8 && y < 22 ? [0, 0, 0, 255] : [0, 0, 0, 0])],
];
for (const [name, w, h, f] of kinds) { const rgba = make(w, h, f); for (const tol of [0, 8, 40]) pixels.push({ name, w, h, tol, rgba, box: contentBox(rgba, w, h, tol), kind: classify(rgba, w, h) }); }

// PDF
const facts = [{ chars: 3000, imageCoverage: 0.02, textTokens: 700 }, { chars: 0, imageCoverage: 0.95, textTokens: 0 }, { chars: 900, imageCoverage: 0.5, textTokens: 250 }, { chars: 39, imageCoverage: 0.5, textTokens: 8 }, { chars: 100, imageCoverage: 0.29, textTokens: 40 }, { chars: 20000, imageCoverage: 0, textTokens: 6000 }, { chars: 200, imageCoverage: 0.3, textTokens: 60 }];
const pdf = [];
for (const model of models) for (const fidelity of ["standard", "economy"] as Fidelity[]) {
  pdf.push({ model, fidelity, routes: facts.map((f) => routePage(f, model, fidelity)), plan: planPdf(facts, model, fidelity), facts });
}

// Output policy
const reqs = [
  { model: "gpt-5", messages: [{ role: "system", content: "Be helpful." }, { role: "user", content: "Explain X." }] },
  { model: "gpt-5", max_tokens: 200, reasoning_effort: "high", messages: [{ role: "user", content: "Hi" }] },
  { model: "claude-sonnet-5-5", max_tokens: 4000, messages: [{ role: "user", content: [{ type: "text", text: "Look" }, { type: "image_url", image_url: { url: "x" } }] }] },
  { model: "o3", messages: [{ role: "system", content: "S" }] },
  { model: "gpt-4o", temperature: 0.2, messages: [{ role: "user", content: "A" }, { role: "assistant", content: "B" }, { role: "user", content: "C" }] },
];
const policies: OutputPolicy[] = [
  { maxTokens: null, brevity: "off", reasoning: null, guard: true }, { maxTokens: 500, brevity: "concise", reasoning: "low", guard: true },
  { maxTokens: 100, brevity: "terse", reasoning: "medium", guard: false }, { maxTokens: 5000, brevity: "off", reasoning: "high", guard: true },
];
const output = [];
for (const request of reqs) for (const policy of policies) { const a = applyOutputPolicy(request as never, policy); output.push({ request, policy, expected: { request: a.request, changes: a.changes } }); const b = applyOutputPolicy(a.request, policy); output.push({ request: a.request, policy, expected: { request: b.request, changes: b.changes } }); }

// Guard
const streams: { name: string; text: string; step: number }[] = [
  { name: "loop", text: "The answer is: ".repeat(60), step: 16 },
  { name: "loop small chunks", text: "The answer is: ".repeat(60), step: 3 },
  { name: "varied", text: Array.from({ length: 300 }, (_, i) => `Line ${i}: the value of item ${i * 7} is ${i * 13}.`).join("\n"), step: 16 },
  { name: "dashes 500", text: "-".repeat(500), step: 16 },
  { name: "dashes 2000", text: "-".repeat(2000), step: 16 },
  { name: "table", text: Array.from({ length: 80 }, (_, i) => `| row ${i} | ${i * 3} | ok |`).join("\n"), step: 16 },
  { name: "late loop", text: "Intro text that is varied and long enough. ".repeat(1) + Array.from({ length: 40 }, (_, i) => `Fact ${i} is that nothing repeats here.`).join(" ") + " I will now repeat myself again and again. ".repeat(30), step: 20 },
  { name: "unicode loop", text: "日本語のテキストを繰り返します。😀 ".repeat(40), step: 8 },
  { name: "long unit", text: ("This is a rather long sentence of about eighty characters that will be repeated. ".repeat(8)), step: 50 },
];
const guard = streams.map((s) => { const g = new RepetitionGuard(); let first: { at: number; unit: string } | null = null; for (let i = 0; i < s.text.length; i += s.step) { const x = g.push(s.text.slice(i, i + s.step)); if (x.tripped) { first = { at: x.at!, unit: x.unit! }; break; } } return { ...s, expected: first }; });

// History
const big = Array.from({ length: 60 }, (_, i) => `row ${i}: order ORD-${1000 + i} total ${i * 31}.50`).join("\n");
const one = "A single long line without any breaks " + "word ".repeat(400) + " ORD-77 at the end";
const msgs: HMessage[] = [
  { role: "system", content: "You are an agent." }, { role: "user", content: "Find orders." }, { role: "assistant", content: "Calling search." }, { role: "tool", content: big, tool_call_id: "c1" },
  { role: "assistant", content: "Found them." }, { role: "user", content: "Search again." }, { role: "assistant", content: "Calling search." }, { role: "tool", content: big, tool_call_id: "c2" },
  { role: "tool", content: one, tool_call_id: "c2b" }, { role: "tool", content: "ok", tool_call_id: "c2c" }, { role: "assistant", content: "Same." }, { role: "user", content: "Now summarize." }, { role: "assistant", content: "Calling." }, { role: "tool", content: big, tool_call_id: "c3" },
];
const history = [];
for (const opt of [{ keepTurns: 1, maxTokens: 120, head: 0.6 }, { keepTurns: 2, maxTokens: 400, head: 0.6 }, { keepTurns: 0, maxTokens: 50, head: 0.5 }, { keepTurns: 9, maxTokens: 120, head: 0.6 }]) {
  const h = compactHistory(msgs, approxCounter, opt); history.push({ messages: msgs, options: opt, expected: { messages: h.messages, report: h.report } });
}
writeFileSync(process.argv[2] ?? "media-vectors.json", JSON.stringify({ counter: "approx-v1", billing, plans, pixels, pdf, output, guard, history }));
console.log(`billing ${billing.length}, plans ${plans.length}, pixels ${pixels.length}, pdf ${pdf.length}, output ${output.length}, guard ${guard.length}, history ${history.length}`);
