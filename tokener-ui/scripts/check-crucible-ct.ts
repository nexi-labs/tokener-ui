/**
 * Checks for Crucible continuous training rules (docs/51, section 7).
 * Run: npx tsx --tsconfig scripts/tsconfig.scripts.json scripts/check-crucible-ct.ts
 */
import { approvalsNeeded, decideCycle, gateResults, matches, simulateCandidate, startCycle, validatePolicy, STEP_ORDER } from "../src/lib/crucible/ct";
import type { CtPolicy, TriggerEvent } from "../src/lib/crucible/types";

let pass = 0; let fail = 0;
const ok = (c: unknown, m: string) => { if (c) pass++; else { fail++; console.error("FAIL", m); } };

const policy = (o: Partial<CtPolicy> = {}): CtPolicy => ({
  id: "ctp-1", name: "support-classifier-weekly", model: "customer-support-classifier", experimentId: "exp-1", state: "active", source: "support-tickets-unified",
  triggers: [{ kind: "dataset-version", detail: "support-tickets-unified" }, { kind: "rows", detail: "20000 new rows", minRows: 20000 }, { kind: "manual", detail: "A person" }],
  window: { kind: "rolling", value: 90 }, gates: { metric: "f1_macro", floor: 0.9, noSliceRegression: false, maxFairnessGap: 0.2, maxMemoryGb: 40, maxP95Ms: 500 },
  approval: "person", tier: "standard", budget: { monthlyUsd: 1000, spentUsd: 0 }, maxCyclesPerDay: 2, champion: { version: 3, metric: 0.9 }, owner: "priya", createdAt: "2026-11-01T00:00:00Z", ...o,
});
const event = (o: Partial<TriggerEvent> = {}): TriggerEvent => ({ id: "evt-1", kind: "dataset-version", detail: "version 17", datasetVersion: 17, rows: 40000, quality: 0.97, schemaOk: true, piiFree: true, ...o });
const ctx = (o: Partial<Parameters<typeof startCycle>[2]> = {}) => ({ existing: [], now: Date.parse("2026-11-21T06:00:00Z"), actor: "priya", cyclesToday: 0, ...o });

// validation
ok(validatePolicy(policy()).filter((i) => i.level === "error").length === 0, "a sound policy has no errors");
ok(validatePolicy(policy({ name: "X" })).some((i) => i.path === "name"), "a bad name is refused");
ok(validatePolicy(policy({ triggers: [] })).some((i) => i.path === "triggers"), "a policy needs a trigger");
ok(validatePolicy(policy({ triggers: [{ kind: "rows", detail: "", minRows: 0 }] })).some((i) => i.path === "triggers.0"), "a row trigger needs a minimum");
ok(validatePolicy(policy({ triggers: [{ kind: "schedule", detail: "every week" }] })).some((i) => i.path === "triggers.0"), "a schedule needs five fields");
ok(!validatePolicy(policy({ triggers: [{ kind: "schedule", detail: "0 2 * * 1" }] })).some((i) => i.path === "triggers.0"), "a valid schedule passes");
ok(validatePolicy(policy({ triggers: [{ kind: "manual", detail: "a" }, { kind: "manual", detail: "b" }] })).some((i) => i.message.includes("once")), "a trigger kind appears once");
ok(validatePolicy(policy({ approval: "automatic", tier: "standard" })).some((i) => i.path === "approval" && i.level === "error"), "automatic approval is refused for a standard tier");
ok(!validatePolicy(policy({ approval: "automatic", tier: "low" })).some((i) => i.level === "error"), "automatic approval is allowed for a low tier");
ok(validatePolicy(policy({ tier: "high", approval: "person" })).some((i) => i.path === "approval" && i.level === "warning"), "a high tier suggests two people");
ok(validatePolicy(policy({ budget: { monthlyUsd: 0, spentUsd: 0 } })).some((i) => i.path === "budget"), "a budget is required");
ok(validatePolicy(policy({ maxCyclesPerDay: 0 })).some((i) => i.path === "maxCyclesPerDay"), "at least one cycle a day");
ok(validatePolicy(policy({ window: { kind: "rolling", value: 0 } })).some((i) => i.path === "window"), "a window of at least 1");
ok(validatePolicy(policy({ gates: { ...policy().gates, noSliceRegression: false } })).some((i) => i.path === "gates.noSliceRegression" && i.level === "warning"), "skipping the slice check warns");

// matching
ok(matches(policy(), event()).ok, "a dataset version event matches");
ok(!matches(policy({ state: "paused" }), event()).ok, "a paused policy does not match");
ok(!matches(policy(), event({ kind: "drift" })).ok, "an unlistened kind does not match");
ok(!matches(policy(), event({ kind: "rows", rows: 100 })).ok && matches(policy(), event({ kind: "rows", rows: 20000 })).ok, "the row minimum is inclusive");

// idempotency
const first = startCycle(policy(), event(), ctx());
ok(first.ok, "the first event starts a cycle");
if (first.ok) {
  const again = startCycle(policy(), event(), ctx({ existing: [first.cycle] }));
  ok(!again.ok && !!(again as any).existing, "the same event never starts two cycles");
  ok(startCycle(policy(), event({ id: "evt-2" }), ctx({ existing: [first.cycle] })).ok, "a new event does");
}
ok(!startCycle(policy(), event({ id: "evt-9" }), ctx({ cyclesToday: 2 })).ok, "the daily cap stops a noisy source");

// early failures keep the champion
const dirty = startCycle(policy(), event({ piiFree: false }), ctx());
ok(dirty.ok && dirty.cycle.decision === "failed-early" && dirty.cycle.steps.find((s) => s.id === "quality")!.state === "failed", "personal data fails the quality gate");
ok(dirty.ok && dirty.cycle.steps.filter((s) => STEP_ORDER.indexOf(s.id) > 2).every((s) => s.state === "skipped"), "later steps are skipped, nothing trains");
const drift = startCycle(policy(), event({ schemaOk: false }), ctx());
ok(drift.ok && drift.cycle.reason!.includes("schema"), "a schema change is named");
const lowq = startCycle(policy(), event({ quality: 0.8 }), ctx());
ok(lowq.ok && lowq.cycle.decision === "failed-early", "a low quality score stops the cycle");
const poor = startCycle(policy({ budget: { monthlyUsd: 100, spentUsd: 99 } }), event(), ctx());
ok(poor.ok && poor.cycle.decision === "failed-early" && poor.cycle.steps.find((s) => s.id === "admission")!.state === "failed", "an empty budget stops the cycle at admission");

// gates
const p = policy();
const cand = { metric: 0.93, sliceDeltas: [{ slice: "billing", delta: 0.01 }], fairnessGap: 0.02, peakMemGb: 12, p95Ms: 60 };
ok(gateResults(p, cand).every((g) => g.passed), "a good candidate passes every gate");
ok(!gateResults(p, { ...cand, metric: 0.89 }).find((g) => g.id === "metric")!.passed, "below the floor fails");
ok(!gateResults(p, { ...cand, metric: 0.9 - 0.001 }).find((g) => g.id === "champion")!.passed, "worse than the champion fails");
const strict = policy({ gates: { ...p.gates, noSliceRegression: true } });
ok(!gateResults(strict, { ...cand, sliceDeltas: [{ slice: "returns", delta: -0.02 }] }).find((g) => g.id === "slices")!.passed, "a slice that gets worse fails");
ok(gateResults(strict, { ...cand, sliceDeltas: [{ slice: "returns", delta: -0.004 }] }).find((g) => g.id === "slices")!.passed, "noise within half a point is allowed");
ok(!gateResults(p, { ...cand, fairnessGap: 0.3 }).find((g) => g.id === "fairness")!.passed, "a wide fairness gap fails");
ok(!gateResults(p, { ...cand, peakMemGb: 41 }).find((g) => g.id === "memory")!.passed, "too much serving memory fails");
ok(!gateResults(p, { ...cand, p95Ms: 501 }).find((g) => g.id === "latency")!.passed, "too slow fails");
ok(gateResults(p, cand).every((g) => !g.id.startsWith("slices")), "the slice gate is absent when the policy does not ask for it");

// determinism
ok(JSON.stringify(simulateCandidate(p, event())) === JSON.stringify(simulateCandidate(p, event())), "the sample candidate is the same for the same event");
ok(simulateCandidate(p, event()).metric !== simulateCandidate(p, event({ id: "evt-other" })).metric, "and differs between events");

// a cycle that passes waits for people
let waiting: ReturnType<typeof startCycle> | null = null;
for (let n = 0; n < 60 && !(waiting?.ok && waiting.cycle.decision === "awaiting-approval"); n++) waiting = startCycle(policy({ gates: { ...p.gates, floor: 0, noSliceRegression: false, maxFairnessGap: 1, maxMemoryGb: 99, maxP95Ms: 999 }, champion: { version: 3, metric: 0.85 } }), event({ id: `evt-w${n}` }), ctx());
ok(waiting?.ok && waiting.cycle.decision === "awaiting-approval", "a candidate that passes the gates waits for approval");
if (waiting?.ok) {
  const c = waiting.cycle;
  ok(c.steps.find((s) => s.id === "approval")!.state === "waiting", "the approval step is waiting");
  ok(c.gates.length >= 5, "the gate results are kept");
  const pol = policy({ approval: "person" });
  const rej = decideCycle(pol, c, "reject", "marcus", Date.now(), "");
  ok(!rej.ok, "a rejection needs a reason");
  const rej2 = decideCycle(pol, c, "reject", "marcus", Date.now(), "Slice looks wrong in the sample");
  ok(rej2.ok && rej2.cycle.decision === "rejected" && rej2.cycle.reason!.includes("champion stays"), "a rejection keeps the champion and records why");
  const one = decideCycle(pol, c, "approve", "marcus", Date.now());
  ok(one.ok && one.promoted && one.cycle.decision === "in-rollout", "one approval starts the rollout, it does not claim a promotion");
  ok(one.ok && one.cycle.steps.find((s) => s.id === "shadow")!.state === "running" && one.cycle.steps.find((s) => s.id === "promote")!.state === "pending", "shadow runs, promote has not happened");
  const two = policy({ approval: "two-people" });
  const a1 = decideCycle(two, c, "approve", "marcus", Date.now());
  ok(a1.ok && !a1.promoted && a1.cycle.decision === "awaiting-approval" && a1.cycle.approvals.length === 1, "the first of two approvals does not promote");
  if (a1.ok) {
    const same = decideCycle(two, a1.cycle, "approve", "marcus", Date.now());
    ok(!same.ok, "the same person cannot approve twice");
    const a2 = decideCycle(two, a1.cycle, "approve", "aisha", Date.now());
    ok(a2.ok && a2.promoted && a2.cycle.approvals.length === 2, "a second, different person starts the rollout");
    const late = a2.ok ? decideCycle(two, a2.cycle, "approve", "tom", Date.now()) : null;
    ok(late !== null && !late.ok, "a decided cycle cannot be decided again");
  }
  const manual = { ...c, event: { ...c.event, by: "priya" } };
  ok(!decideCycle(pol, manual, "approve", "priya", Date.now()).ok, "nobody approves a cycle they started by hand");
  ok(decideCycle(pol, manual, "approve", "marcus", Date.now()).ok, "someone else can");
}
ok(approvalsNeeded("automatic") === 0 && approvalsNeeded("person") === 1 && approvalsNeeded("two-people") === 2, "approvals needed per mode");

// automatic approval still goes through every gate
const auto = policy({ approval: "automatic", tier: "low", gates: { ...p.gates, floor: 0, maxFairnessGap: 1, maxMemoryGb: 99, maxP95Ms: 999 }, champion: { version: 3, metric: 0.85 } });
let ar: ReturnType<typeof startCycle> | null = null;
for (let n = 0; n < 60 && !(ar?.ok && ar.cycle.decision === "promoted"); n++) ar = startCycle(auto, event({ id: `evt-a${n}` }), ctx());
ok(ar?.ok && ar.cycle.decision === "promoted" && ar.cycle.gates.length > 0 && ar.cycle.steps.find((s) => s.id === "approval")!.detail.includes("evidence"), "automatic approval promotes only after the gates and writes the evidence record");
const autoBad = startCycle(policy({ approval: "automatic", tier: "low", gates: { ...p.gates, floor: 0.999 } }), event({ id: "evt-b" }), ctx());
ok(autoBad.ok && autoBad.cycle.decision === "kept-champion", "automatic approval never overrides a failed gate");

// metrics where lower is better (mape, loss): the gates and the champion comparison must not be inverted
{
  const lp = policy({ gates: { ...policy().gates, metric: "mape", floor: 0.12, noSliceRegression: false, maxFairnessGap: 1, maxMemoryGb: 99, maxP95Ms: 999 }, champion: { version: 3, metric: 0.109 } });
  const g = (metric: number) => gateResults(lp, { metric, sliceDeltas: [], fairnessGap: 0, peakMemGb: 1, p95Ms: 1 });
  ok(g(0.1).every((x) => x.passed), "a lower mape than the champion and under the ceiling passes every gate");
  ok(!g(0.115).find((x) => x.id === "champion")!.passed, "a higher mape than the champion fails the champion gate");
  ok(!g(0.13).find((x) => x.id === "metric")!.passed, "a mape above the ceiling fails the metric gate");
  ok(g(0.1).find((x) => x.id === "metric")!.label.includes("at most"), "the metric gate says at most for a lower is better metric");
  const worse = Array.from({ length: 40 }, (_, n) => simulateCandidate(lp, event({ id: `evt-l${n}` })).metric);
  ok(worse.some((m) => m < 0.109) && worse.some((m) => m > 0.109), "simulated mape candidates move in both directions around the champion");
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
