/**
 * Consistency checks for the Functions design preview data. Run: npx tsx scripts/check-functions.ts
 * Every aggregate the console shows is computed from the records, so these checks prove the records agree with each other.
 */
import { buildFunctions, executionDetail, HOUR, DAY, groupUsage, sumUsage } from "../src/lib/functions/ledger";
import { FN_NAME_RE, validateWorkflow } from "../src/lib/functions/store-rules";
import { FN_TRANSITIONS } from "../src/lib/functions/types";
import { MODELS, modelById, priceCall } from "../src/lib/functions/catalog";

let pass = 0, failN = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { failN++; console.error("FAIL " + m); } };
const anchor = Math.floor(Date.UTC(2026, 9, 28, 9) / HOUR) * HOUR;
const a = buildFunctions(anchor), b = buildFunctions(anchor);

ok(JSON.stringify(a) === JSON.stringify(b), "same anchor gives identical data");
ok(JSON.stringify(a) !== JSON.stringify(buildFunctions(anchor + DAY)), "different anchor gives different data");
ok(a.executions.length > 1500, `enough executions (${a.executions.length})`);
ok(new Set(a.executions.map((e) => e.id)).size === a.executions.length, "execution ids unique");
ok(new Set(a.runs.map((e) => e.id)).size === a.runs.length, "run ids unique");
ok(new Set(a.functions.map((f) => f.id)).size === a.functions.length, "function ids unique");

// lifecycle: all five states present, transitions defined for each
for (const s of ["draft", "deploying", "active", "failed", "disabled"] as const) {
  ok(a.functions.some((f) => f.status === s), `a ${s} function exists`);
  ok(s in FN_TRANSITIONS, `transitions for ${s}`);
}
for (const f of a.functions) {
  const revs = a.revisions.filter((r) => r.fnId === f.id);
  ok(revs.length === f.latestRevision, `${f.name}: revision count matches latestRevision`);
  ok(f.activeRevision === null || revs.some((r) => r.number === f.activeRevision && r.status === "active"), `${f.name}: active revision is marked active`);
  ok(revs.filter((r) => r.status === "active").length <= 1, `${f.name}: at most one active revision`);
  ok(f.name.match(FN_NAME_RE) !== null, `${f.name}: name is valid`);
  ok(f.governance.secretRefs.every((s) => s.startsWith("secretref://")), `${f.name}: secrets are references`);
  ok(f.governance.allowedModels.every((m) => f.governance.allowedProviders.includes(modelById(m)!.providerId)), `${f.name}: model providers are allowlisted`);
  const execs = a.executions.filter((e) => e.fnId === f.id);
  if (["draft", "deploying", "failed"].includes(f.status)) ok(execs.length === 0, `${f.name}: ${f.status} function has no executions`);
  if (f.status === "disabled") ok(execs.every((e) => new Date(e.startedAt).getTime() < new Date(f.updatedAt).getTime()), `${f.name}: no executions after it was disabled`);
  // every model an execution used is on the allowlist, except policy denials which have no model
  ok(execs.every((e) => !e.model || f.governance.allowedModels.includes(e.model)), `${f.name}: executions only use allowlisted models`);
  ok(execs.every((e) => e.tokensIn + e.tokensOut <= (f.governance.maxInputTokens + f.governance.maxOutputTokens) * 1.6), `${f.name}: tokens near the configured limits`);
}

for (const f of a.functions) ok(f.governance.dailyBudgetMicros >= f.governance.maxCostMicros && f.governance.weeklyBudgetMicros >= f.governance.dailyBudgetMicros, `${f.name}: budgets are ordered`);
ok(a.runs.some((r) => r.status === "waiting-approval"), "some runs wait for approval");
ok(a.budgets.length === 4 && a.budgets.every((b) => b.limitMicros > 0), "budgets sized");

// cost: every execution's cost equals tokens times the model price; blocked calls cost nothing
for (const e of a.executions) {
  ok(e.costMicros === (e.model ? priceCall(e.model, e.tokensIn, e.tokensOut) : 0), `${e.id}: cost = priced tokens`);
  if (e.status === "blocked" || e.status === "throttled") ok(e.costMicros === 0 && e.tokensIn === 0 && !e.model, `${e.id}: blocked call has no usage`);
  if (e.status === "blocked") ok(e.policy.result === "deny" && !!e.policy.policyId, `${e.id}: blocked call names its policy`);
  if (e.status === "timeout") ok(e.durationMs === (a.functions.find((f) => f.id === e.fnId)!.governance.timeoutS * 1000), `${e.id}: timeout equals the limit`);
}

// usage events: one per metered call, and the grouped totals equal the plain sums
const metered = a.executions.filter((e) => e.model).length;
const fromFn = a.usage.filter((u) => u.source === "function").length;
ok(fromFn === metered, `function usage events (${fromFn}) equal metered executions (${metered})`);
const total = sumUsage(a.usage);
for (const dim of [(u: any) => u.tenantId, (u: any) => u.appId, (u: any) => u.model, (u: any) => u.provider]) {
  const g = groupUsage(a.usage, dim);
  ok(g.reduce((s, r) => s + r.costMicros, 0) === total.costMicros, "grouped cost equals total");
  ok(g.reduce((s, r) => s + r.tokensIn, 0) === total.tokensIn, "grouped tokens equal total");
}
ok(total.costMicros === a.executions.reduce((s, e) => s + e.costMicros, 0) + a.runs.reduce((s, r) => s + r.nativeUsage.reduce((x, u) => x + u.costMicros, 0), 0), "usage total = executions + workflow AI steps");

// workflow runs: their totals are exactly their steps, and the steps match the executions they link
const exById = new Map(a.executions.map((e) => [e.id, e]));
for (const r of a.runs) {
  const ex = r.executionIds.map((id) => exById.get(id)!);
  ok(ex.every(Boolean), `${r.id}: linked executions exist`);
  ok(ex.every((e) => e.workflowRunId === r.id && e.correlationId === r.correlationId), `${r.id}: executions share run and correlation id`);
  ok(r.costMicros === ex.reduce((s, e) => s + e.costMicros, 0) + r.nativeUsage.reduce((s, u) => s + u.costMicros, 0), `${r.id}: cost is the sum of its parts`);
  ok(r.steps.reduce((s, x) => s + (x.costMicros ?? 0), 0) === r.costMicros, `${r.id}: step costs add up to the run`);
  ok(r.status !== "waiting-approval" || !r.approval?.decision, `${r.id}: waiting run has no decision`);
  ok(r.status !== "succeeded" || r.steps.every((s) => s.status !== "failed" && s.status !== "blocked"), `${r.id}: succeeded run has no failed step`);
}
for (const w of a.workflows) {
  ok(validateWorkflow(w.steps).length === 0, `${w.name}: sample workflow passes validation (${validateWorkflow(w.steps).join("; ")})`);
  ok(w.activeRevision === null || w.revisions.some((r) => r.number === w.activeRevision && r.status === "active"), `${w.name}: active revision marked`);
  for (const s of w.steps.filter((s) => s.kind === "function")) {
    const fn = a.functions.find((f) => f.name === s.config.function);
    ok(!!fn, `${w.name}/${s.name}: function ${s.config.function} exists`);
  }
}
ok(a.runs.every((r) => a.workflows.find((w) => w.id === r.workflowId)?.status === "active"), "runs only for active workflows");

// timeline detail agrees with the record
for (const e of a.executions.slice(0, 400)) {
  const d = executionDetail(e, a);
  ok(d.steps.reduce((s, x) => s + (x.tokensIn ?? 0), 0) === e.tokensIn, `${e.id}: timeline tokens in`);
  ok(d.steps.reduce((s, x) => s + (x.costMicros ?? 0), 0) === e.costMicros, `${e.id}: timeline cost`);
  ok(d.steps.length >= 2 && d.logs.length >= 2, `${e.id}: has steps and logs`);
  ok(d.steps.every((x, i) => i === 0 || x.startMs >= d.steps[i - 1].startMs), `${e.id}: steps in order`);
}

// workflow validation rejects bad graphs
const w0 = a.workflows[0];
ok(validateWorkflow([]).length > 0, "empty graph rejected");
ok(validateWorkflow(w0.steps.slice(1)).length > 0, "missing trigger rejected");
ok(validateWorkflow(w0.steps.map((s) => (s.id === "s2" ? { ...s, next: "nope" } : s))).length > 0, "dangling next rejected");
ok(validateWorkflow(w0.steps.filter((s) => s.id !== "s7" && s.id !== "s8")).length > 0, "broken chain rejected");
ok(["Ab", "1abc", "a b c", "UPPER", "x".repeat(60)].every((n) => !FN_NAME_RE.test(n)), "bad names rejected");
ok(MODELS.every((m) => m.inPerM > 0 && m.outPerM > 0), "all models priced");

console.log(`functions checks: ${pass} pass, ${failN} fail; ${a.functions.length} functions, ${a.executions.length} executions, ${a.runs.length} runs, ${a.usage.length} usage events`);
process.exit(failN ? 1 : 0);
