/**
 * Checks for Code Mode: validation, limits, the token estimate and the generated typed surface.
 * Run: npx tsx --tsconfig scripts/tsconfig.scripts.json scripts/check-agent-codemode.ts
 */
import { LIMIT_RANGE, SANDBOXES, defaultCodeMode, estimateTokens, sampleSurface, validateToolCalling, type ToolCalling } from "../src/lib/agents/codemode";
import { defaultExecution, validateExecution } from "../src/lib/agents/execution";
import { integrationById } from "../src/lib/mlops/catalog";

let pass = 0; let fail = 0;
const ok = (c: unknown, m: string) => { if (c) pass++; else { fail++; console.error("FAIL", m); } };
const eq = (a: unknown, b: unknown, m: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`);
const errs = (t: ToolCalling | undefined, ctx = {}) => validateToolCalling(t, ctx).filter((i) => i.level === "error");
const code = (p: Partial<ReturnType<typeof defaultCodeMode>> = {}): ToolCalling => ({ mode: "code", code: { ...defaultCodeMode(), ...p } });

// direct and absent need nothing
eq(validateToolCalling(undefined), [], "absent is direct");
eq(validateToolCalling({ mode: "direct" }), [], "direct is valid");
eq(errs(code(), { control: "governed", runtime: "serverless" }), [], "default Code Mode is valid on a governed agent");

// who may use it
ok(errs(code(), { control: "observed" }).length === 1, "observed agent refused");
ok(errs(code(), { control: "inventory" }).length === 1, "inventory agent refused");
ok(errs(code(), { control: "governed", runtime: "external" }).length === 1, "agent that runs elsewhere refused");
ok(errs({ mode: "code" }, { control: "governed" }).length === 1, "Code Mode without settings refused");

// limits
for (const k of Object.keys(LIMIT_RANGE) as (keyof typeof LIMIT_RANGE)[]) {
  const [lo, hi] = LIMIT_RANGE[k]; const base = defaultCodeMode();
  eq(errs(code({ limits: { ...base.limits, [k]: lo } }), { control: "governed" }), [], `${k} at the lower bound`);
  eq(errs(code({ limits: { ...base.limits, [k]: hi } }), { control: "governed" }), [], `${k} at the upper bound`);
  ok(errs(code({ limits: { ...base.limits, [k]: lo - 1 } }), { control: "governed" }).length === 1, `${k} below range refused`);
  ok(errs(code({ limits: { ...base.limits, [k]: hi + 1 } }), { control: "governed" }).length === 1, `${k} above range refused`);
  ok(errs(code({ limits: { ...base.limits, [k]: NaN } }), { control: "governed" }).length === 1, `${k} NaN refused`);
}

// Cloudflare needs a connection and always warns about data leaving
ok(errs(code({ sandbox: "cloudflare" }), { control: "governed" }).some((i) => i.path.endsWith("connection")), "Cloudflare needs a connection");
eq(errs(code({ sandbox: "cloudflare", connection: "conn_1" }), { control: "governed" }), [], "Cloudflare with a connection is valid");
ok(validateToolCalling(code({ sandbox: "cloudflare", connection: "c" }), { control: "governed" }).some((i) => i.level === "warning" && i.path.endsWith("sandbox")), "Cloudflare warns about data leaving");
ok(!validateToolCalling(code({ sandbox: "isolate" }), { control: "governed" }).some((i) => i.path.endsWith("sandbox")), "isolate has no data warning");
ok(SANDBOXES.filter((s) => s.leaves).map((s) => s.id).join() === "cloudflare", "only Cloudflare leaves the network");
ok(SANDBOXES.every((s) => s.status === "Planned"), "every sandbox is honestly Planned");

// warnings
ok(validateToolCalling(code({ reviewCode: false }), { control: "governed", hasSensitiveTools: true }).some((i) => i.path.endsWith("reviewCode")), "sensitive tools without review warn");
ok(!validateToolCalling(code({ reviewCode: true }), { control: "governed", hasSensitiveTools: true }).some((i) => i.path.endsWith("reviewCode")), "review silences the warning");
ok(validateToolCalling(code(), { control: "governed", toolCount: 2 }).some((i) => i.path === "toolCalling" && i.level === "warning"), "few tools warn");
ok(validateToolCalling(code(), { control: "governed" }).some((i) => i.message.includes("No sandbox is available yet")), "the executor gap is stated");

// through the whole execution check
const e = { ...defaultExecution("serverless"), toolCalling: code() };
eq(validateExecution(e, { control: "governed" }).filter((i) => i.level === "error"), [], "execution with Code Mode is valid");
ok(validateExecution({ ...defaultExecution("external"), toolCalling: code() }, { control: "governed" }).some((i) => i.path === "toolCalling" && i.level === "error"), "external runtime with Code Mode refused");

// estimate
const base = { tools: 40, defTokens: 350, steps: 6, resultTokens: 800 };
const est = estimateTokens(base);
ok(est.direct > est.code && est.saved === est.direct - est.code, "estimate: direct costs more with many tools");
ok(est.savedPct >= 0 && est.savedPct <= 100, "estimate: percent in range");
const few = estimateTokens({ tools: 1, defTokens: 100, steps: 1, resultTokens: 50 });
ok(few.saved < 0, "estimate: one tiny step is not cheaper in Code Mode");
eq(estimateTokens({ tools: 0, defTokens: 0, steps: 0, resultTokens: 0 }).direct, 80, "estimate: floors steps at one");
ok(estimateTokens({ ...base, tools: 80 }).direct > estimateTokens(base).direct, "estimate: more tools cost more directly");
eq(estimateTokens({ ...base, tools: 80 }).code, estimateTokens(base).code, "estimate: tool count does not change Code Mode");

// surface
const s = sampleSurface([{ server: "billing", tool: "get_invoice" }, { server: "billing", tool: "issue_refund" }, { server: "tokener-notify", tool: "request_approval" }]);
ok(s.includes("billing: {") && s.includes("getInvoice(input: GetInvoiceInput): Promise<GetInvoiceResult>;"), "surface names tools in camel case");
ok(s.includes("tokenerNotify: {") && s.includes("requestApproval("), "surface groups by server");
ok(/no secret/i.test(s), "surface states there is no secret");

// catalogue
for (const id of ["cloudflare-mcp", "cloudflare-code-mode"]) {
  const d = integrationById(id);
  ok(!!d, `catalogue has ${id}`); ok(d?.status === "planned", `${id} is Planned`);
  ok(!(d?.fields ?? []).some((f) => /secret|password|token$/i.test(f.key) && f.type === "text" && !/Header/i.test(f.label)), `${id} holds no secret field`);
  ok((d?.compliance ?? []).length > 0, `${id} has compliance notes`);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
