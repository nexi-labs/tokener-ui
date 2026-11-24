/** Checks for image, PDF, output and history conversion. Run: npx tsx scripts/check-media.ts */
import { billingFor, imageTokens } from "../src/lib/optimize/media/billing";
import { planImage, type Fidelity } from "../src/lib/optimize/media/plan";
import { classify, contentBox } from "../src/lib/optimize/media/pixels";
import { planPdf, routePage } from "../src/lib/optimize/media/pdf";
import { applyOutputPolicy, DEFAULT_OUTPUT, RepetitionGuard } from "../src/lib/optimize/media/output";
import { compactHistory } from "../src/lib/optimize/media/history";
import { approxCounter } from "../src/lib/optimize/tec/tokens";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };

// Anthropic billing against the worked examples in its documentation (standard and high resolution)
const std = billingFor("claude-haiku-4-5"), hi = billingFor("claude-opus-5-5");
ok(billingFor("claude-sonnet-4-20250514").label.includes("standard") && billingFor("claude-3-5-sonnet").label.includes("standard") && billingFor("claude-sonnet-5-5").label.includes("high"), "claude resolution tier by model name");
for (const [w, h, a, b] of [[200, 200, 64, 64], [1000, 1000, 1296, 1296], [1092, 1092, 1521, 1521], [1920, 1080, 1560, 2691], [2000, 1500, 1564, 3888], [3840, 2160, 1560, 4784]] as const) {
  ok(imageTokens(std, w, h).tokens === a, `anthropic standard ${w}x${h}: ${imageTokens(std, w, h).tokens} vs ${a}`);
  ok(imageTokens(hi, w, h).tokens === b, `anthropic high ${w}x${h}: ${imageTokens(hi, w, h).tokens} vs ${b}`);
}
ok(imageTokens(billingFor("gpt-4o"), 1024, 1024).tokens === 765, "openai 1024x1024 high is 765");
ok(imageTokens(billingFor("gpt-4o"), 512, 512).tokens === 255, "openai small image is not upscaled");
ok(imageTokens(billingFor("gpt-4o"), 3000, 3000, "low").tokens === 85, "openai low detail is the base");
ok(imageTokens(billingFor("gemini-2.5-flash"), 300, 300).tokens === 258 && imageTokens(billingFor("gemini-2.5-flash"), 1536, 1536).tokens === 1032, "gemini tiles");
const patch = imageTokens(billingFor("gpt-4.1-mini"), 1800, 2400).tokens;
ok(Math.abs(patch - 2352) / 2352 < 0.07, `openai patch within 7% of the documented example: ${patch}`);

// A plan never costs more than sending the image as it is, never upscales, and exact never changes tokens
const models = ["claude-haiku-4-5", "claude-opus-5-5", "gpt-4o", "gpt-4.1-mini", "gemini-2.5-pro", "unknown-model"];
let n = 0;
for (const model of models) for (const fidelity of ["exact", "standard", "economy"] as Fidelity[]) for (const kind of ["photo", "flat"] as const)
  for (const [w, h] of [[64, 64], [500, 300], [1024, 768], [1920, 1080], [4000, 3000], [3000, 200], [8000, 8000], [1, 1]]) {
    const p = planImage({ w, h, model, fidelity, kind }); n++;
    ok(p.after.tokens <= p.before.tokens && p.saved === p.before.tokens - p.after.tokens, `plan never costs more ${model} ${fidelity} ${w}x${h}`);
    ok(p.w <= w && p.h <= h, `plan never upscales ${model} ${fidelity} ${w}x${h}`);
    if (fidelity === "exact") ok(p.saved === 0, `exact keeps tokens ${model} ${w}x${h}`);
  }
ok(planImage({ w: 3000, h: 2000, model: "claude-haiku-4-5", fidelity: "standard", kind: "photo" }).saved > 0, "standard saves on a large photo");
ok(planImage({ w: 3000, h: 2000, model: "gpt-4o", fidelity: "economy", kind: "photo" }).detail === "low", "economy uses low detail on openai");
ok(planImage({ w: 3000, h: 2000, model: "claude-haiku-4-5", fidelity: "standard", kind: "flat" }).w >= planImage({ w: 3000, h: 2000, model: "claude-haiku-4-5", fidelity: "standard", kind: "photo" }).w, "flat images keep more resolution");
ok(planImage({ w: 3000, h: 2000, model: "claude-haiku-4-5", fidelity: "standard", kind: "flat" }).ocrCandidate, "flat images are OCR candidates");

// Pixels
const px = (w: number, h: number, f: (x: number, y: number) => [number, number, number]) => { const a = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = f(x, y); const i = (y * w + x) * 4; a[i] = r; a[i + 1] = g; a[i + 2] = b; a[i + 3] = 255; } return a; };
const framed = px(100, 80, (x, y) => (x >= 20 && x < 70 && y >= 10 && y < 50 ? [10, 120, 200] : [255, 255, 255]));
const box = contentBox(framed, 100, 80);
ok(box.x === 20 && box.y === 10 && box.w === 50 && box.h === 40, "content box finds the framed region: " + JSON.stringify(box));
ok(contentBox(px(100, 80, () => [255, 255, 255]), 100, 80).w === 100, "a blank image is left whole");
ok(contentBox(px(100, 80, (x) => (x < 98 ? [0, 0, 0] : [255, 255, 255])), 100, 80).w === 100, "a thin border is not worth a crop");
let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
ok(classify(px(120, 120, (x, y) => ((x + y) % 7 < 3 ? [255, 255, 255] : [0, 0, 0])), 120, 120) === "flat", "two colours are flat");
ok(classify(px(120, 120, () => [Math.floor(rnd() * 256), Math.floor(rnd() * 256), Math.floor(rnd() * 256)]), 120, 120) === "photo", "noise is a photo");

// PDF
const text = { chars: 3000, imageCoverage: 0.02, textTokens: 700 }, scan = { chars: 0, imageCoverage: 0.95, textTokens: 0 }, fig = { chars: 900, imageCoverage: 0.5, textTokens: 250 };
ok(routePage(text, "claude-haiku-4-5").route === "text" && routePage(text, "claude-haiku-4-5").tokens === 700, "text page is sent as text");
ok(routePage(text, "claude-haiku-4-5").nativeTokens > 2000, "a native page costs its text plus a page image on anthropic");
ok(routePage(scan, "claude-haiku-4-5").route === "ocr", "scan goes to OCR");
ok(routePage(fig, "claude-haiku-4-5", "economy").route === "text+image", "figure page keeps a reduced picture at economy");
ok(routePage(fig, "claude-haiku-4-5", "standard").route === "native", "at standard a full page picture saves too little to change the route");
ok(routePage(text, "gemini-2.5-pro").route === "native" && routePage(text, "gemini-2.5-pro").tokens === 258, "gemini bills a flat rate per page and is cheaper left alone");
const plan = planPdf([text, text, scan, fig], "claude-haiku-4-5");
ok(plan.converted < plan.native && plan.saved === plan.native - plan.converted, "a mixed PDF is cheaper converted");

// Output policy
const req = { model: "gpt-5", messages: [{ role: "system", content: "Be helpful." }, { role: "user", content: "Explain X." }] };
const r1 = applyOutputPolicy(req, { maxTokens: 500, brevity: "concise", reasoning: "low", guard: true });
ok(r1.request.max_tokens === 500 && r1.request.reasoning_effort === "low" && (r1.request.messages[1].content as string).endsWith("closing summary unless asked."), "policy applied");
ok(r1.request.messages[0].content === "Be helpful." && req.messages[1].content === "Explain X.", "system prompt and the original request are untouched");
ok(applyOutputPolicy({ ...req, max_tokens: 200, reasoning_effort: "high" }, { maxTokens: 500, brevity: "off", reasoning: "low", guard: true }).changes.length === 0, "the caller's lower cap and chosen effort win");
ok(applyOutputPolicy({ ...req, model: "claude-sonnet-5-5" }, { ...DEFAULT_OUTPUT, reasoning: "low" }).request.reasoning_effort === undefined, "no reasoning effort on a model that does not take one");
const twice = applyOutputPolicy(r1.request, { maxTokens: 500, brevity: "concise", reasoning: "low", guard: true });
ok(twice.changes.length === 0, "applying the policy twice changes nothing");
const parts = applyOutputPolicy({ model: "m", messages: [{ role: "user", content: [{ type: "text", text: "Look" }, { type: "image_url", image_url: { url: "x" } }] }] }, { ...DEFAULT_OUTPUT, brevity: "terse" });
ok(((parts.request.messages[0].content as { text?: string }[])[0].text ?? "").includes("fewest") || ((parts.request.messages[0].content as { text?: string }[])[0].text ?? "").includes("few words"), "directive goes in the last text part");

// Repetition guard
const feed = (s: string, step = 16) => { const g = new RepetitionGuard(); for (let i = 0; i < s.length; i += step) { const r = g.push(s.slice(i, i + step)); if (r.tripped) return i + step; } return -1; };
ok(feed("The answer is: ".repeat(60)) > 0, "a loop trips");
ok(feed("The answer is: ".repeat(60)) < 400, "a loop trips early: " + feed("The answer is: ".repeat(60)));
ok(feed(Array.from({ length: 300 }, (_, i) => `Line ${i}: the value of item ${i * 7} is ${i * 13}.`).join("\n")) === -1, "varied text never trips");
ok(feed("-".repeat(500)) === -1 && feed("-".repeat(2000)) > 0, "a rule of dashes is allowed to be long, but not endless");
ok(feed(Array.from({ length: 80 }, (_, i) => `| row ${i} | ${i * 3} | ok |`).join("\n")) === -1, "a table never trips");

// History
const big = Array.from({ length: 60 }, (_, i) => `row ${i}: order ORD-${1000 + i} total ${i * 31}.50`).join("\n");
const msgs = [
  { role: "system", content: "You are an agent." }, { role: "user", content: "Find orders." },
  { role: "assistant", content: "Calling search." }, { role: "tool", content: big, tool_call_id: "c1" },
  { role: "assistant", content: "Found them. Anything else?" }, { role: "user", content: "Search again." },
  { role: "assistant", content: "Calling search." }, { role: "tool", content: big, tool_call_id: "c2" },
  { role: "assistant", content: "Same." }, { role: "user", content: "Now summarize." }, { role: "assistant", content: "Calling." }, { role: "tool", content: big, tool_call_id: "c3" },
];
const h = compactHistory(msgs, approxCounter, { keepTurns: 1, maxTokens: 120, head: 0.6 });
ok(h.messages[3].content.includes("tokens removed") && h.messages[3].content.includes("ORD-1000"), "an old long tool result keeps its start and says what it removed");
ok(h.messages[7].content.startsWith("[Same result as the earlier tool message c1]"), "an identical old result becomes a pointer");
ok(h.messages[11].content === big, "the last turn is untouched");
ok(h.messages.filter((m) => m.role !== "tool").every((m, i) => m.content === msgs.filter((x) => x.role !== "tool")[i].content), "only tool messages change");
ok(h.report.tokensAfter < h.report.tokensBefore && h.report.trimmed === 1 && h.report.deduped === 1, "tokens fall: " + JSON.stringify(h.report));
ok(h.report.cut.length > 0 && h.report.cut.every((d) => !h.messages[3].content.includes(d)), "removed details are listed");
ok(compactHistory(msgs, approxCounter, { keepTurns: 9, maxTokens: 120, head: 0.6 }).report.trimmed === 0, "nothing changes when every turn is protected");

console.log(`${pass} passed, ${fail} failed (${n} plans)`);
process.exit(fail ? 1 : 0);
