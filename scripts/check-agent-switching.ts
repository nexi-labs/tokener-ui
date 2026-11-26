/**
 * Checks for switching an agent's runtime, in src/lib/agents/switching.ts and the store actions: the plan, the guards, what is kept and what falls away,
 * the strategies, the progress of a switch, and that undo puts the old settings back exactly.
 * Run: npx tsx --tsconfig scripts/tsconfig.scripts.json scripts/check-agent-switching.ts
 */
import { sampleAgents } from "../src/lib/agents/sample";
import { agents as actions, agentsNow } from "../src/lib/agents/store";
import { defaultExecution, enabledModes, validateExecution, type RuntimeKind } from "../src/lib/agents/execution";
import { STRATEGIES, estimateInFlight, planSwitch, progressAt, remainingOnOld } from "../src/lib/agents/switching";
import type { Agent } from "../src/lib/agents/types";

let pass = 0; let fail = 0;
const ok = (c: unknown, m: string) => { if (c) pass++; else { fail++; console.error("FAIL", m); } };
const eq = (a: unknown, b: unknown, m: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`);

const { agents } = sampleAgents();
const governed = agents.filter((a) => a.control === "governed" && a.execution && a.state !== "retired");
ok(governed.length >= 4, `there are governed sample agents to switch (${governed.length})`);
const mk = (rt: RuntimeKind, over: Partial<Agent> = {}): Agent => ({ ...governed[0], execution: defaultExecution(rt), ...over });

// ---- every pair of runtimes gives a plan that is either blocked with a reason or valid
const kinds: RuntimeKind[] = ["serverless", "service", "streaming", "batch", "external"];
for (const from of kinds) for (const to of kinds) {
  const a = mk(from); const p = planSwitch(a, to, "drain", 3);
  if (from === to) { ok(p.blockers.length > 0, `${from} to ${to}: same runtime is refused`); continue; }
  if (to === "external") { ok(p.blockers.some((b) => /external|does not run/i.test(b)), `${from} to external is refused`); continue; }
  const errs = validateExecution(p.next, { control: a.control }).filter((i) => i.level === "error");
  ok(errs.length === 0, `${from} to ${to}: the settings afterwards are valid (${errs.map((e) => e.message).join("; ")})`);
  eq(p.next.runtime, to, `${from} to ${to}: the runtime is the target`);
  ok(p.steps.length === 6 && p.totalSeconds === p.steps.reduce((t, s) => t + s.seconds, 0), `${from} to ${to}: six steps that add up`);
  ok(p.changes.some((c) => c.label === "Runtime" && c.from !== c.to), `${from} to ${to}: the runtime change is listed`);
}

// ---- guards
ok(planSwitch({ ...mk("serverless"), control: "inventory" }, "service", "drain", 0).blockers.length > 0, "an agent tok∑ner does not run cannot be moved");
ok(planSwitch({ ...mk("serverless"), state: "retired" }, "service", "drain", 0).blockers.length > 0, "a retired agent cannot be moved");
{ const a = mk("serverless"); a.execution = { ...a.execution!, durable: false };
  const h = planSwitch(a, "service", "handoff", 2); ok(h.blockers.some((b) => /saved progress/i.test(b)), "hand off is refused without saved progress");
  ok(!planSwitch(a, "service", "drain", 2).allowed.includes("handoff"), "hand off is not offered without saved progress");
  ok(planSwitch(a, "service", "drain", 2).blockers.length === 0, "drain is still allowed without saved progress"); }
{ const a = mk("serverless"); ok(planSwitch(a, "service", "handoff", 2).allowed.join() === "drain,handoff,cutover", "a durable agent is offered all three strategies"); }

// ---- what is kept and what falls away
{ const a = mk("service"); a.execution = { ...a.execution!, modes: { onDemand: a.execution!.modes.onDemand, streaming: defaultExecution("streaming").modes.streaming } };
  const p = planSwitch(a, "serverless", "drain", 0);
  eq(p.dropped, ["streaming"], "the stream is dropped on an on-demand runtime");
  ok(p.warnings.some((w) => /From a stream is not available/.test(w)), "a dropped way to start is explained");
  eq(enabledModes(p.next), ["onDemand"], "the supported way to start is kept"); }
{ const a = mk("batch"); const p = planSwitch(a, "streaming", "drain", 0);
  ok(p.dropped.includes("scheduled") && enabledModes(p.next).includes("streaming"), "a schedule is dropped and the worker gets a stream to read");
  ok(p.warnings.some((w) => /placeholder/.test(w)), "the placeholder stream is flagged"); }
{ const a = mk("batch"); a.execution = { ...a.execution!, scaling: { ...a.execution!.scaling, timeoutSec: 14400 } }; const p = planSwitch(a, "serverless", "drain", 0);
  eq(p.next.scaling.timeoutSec, 900, "the time limit is brought down to what the runtime allows"); ok(p.warnings.some((w) => /time limit/.test(w)), "the lower time limit is announced"); }
{ const a = mk("serverless"); a.execution = { ...a.execution!, toolCalling: { mode: "code" } as never }; ok(planSwitch(a, "service", "drain", 0).next.toolCalling?.mode === "code", "how the agent calls tools carries across"); }

// ---- strategies and numbers
{ const a = mk("serverless"); const d = planSwitch(a, "service", "drain", 12), h = planSwitch(a, "service", "handoff", 12), c = planSwitch(a, "service", "cutover", 12);
  eq([d.cancelled, h.cancelled, c.cancelled], [0, 0, 12], "only a cut over cancels runs");
  ok(c.totalSeconds < d.totalSeconds, "a cut over is the fastest"); ok(c.gapSeconds > 0 && d.gapSeconds === 0, "only a cut over has a gap");
  ok(planSwitch(a, "service", "drain", 0).steps[3].seconds <= 2, "with nothing in flight there is nothing to wait for");
  ok(planSwitch(a, "service", "drain", 3).steps[3].label.includes("3 runs") && planSwitch(a, "service", "drain", 1).steps[3].label.includes("1 run "), "the step names the number of runs"); }
ok(STRATEGIES.length === 3, "three strategies");
ok(planSwitch(mk("streaming"), "service", "drain", 4).warnings.some((w) => /never finishes/.test(w)), "draining a stream is explained");
ok(planSwitch(mk("service"), "serverless", "drain", 1).warnings.some((w) => /memory/.test(w)), "losing in-memory state is warned");
ok(estimateInFlight(governed[0]) >= 0 && Number.isInteger(estimateInFlight(governed[0])), "the estimate is a whole number");
ok(estimateInFlight({ ...governed[0], daily: [{ executions: 100000, failures: 0, costUsd: 0, tokens: 0 }], p95Ms: 20000 }) > estimateInFlight({ ...governed[0], daily: [{ executions: 100, failures: 0, costUsd: 0, tokens: 0 }], p95Ms: 20000 }), "more traffic means more in flight");

// ---- progress
{ const p = planSwitch(mk("serverless"), "service", "drain", 10);
  eq(progressAt(p, 0).index, 0, "it starts on the first step"); ok(progressAt(p, p.totalSeconds).done, "it is done after the total time");
  let last = -1, mono = true; for (let t = 0; t <= p.totalSeconds + 1; t += 0.5) { const i = progressAt(p, t).index; if (i < last) mono = false; last = i; } ok(mono, "steps only move forward");
  eq(remainingOnOld(p, 0), 10, "all runs are on the old runtime before routing moves"); eq(remainingOnOld(p, p.totalSeconds), 0, "none are left at the end");
  let m2 = true, prev = 99; for (let t = 0; t <= p.totalSeconds; t += 0.5) { const r = remainingOnOld(p, t); if (r > prev) m2 = false; prev = r; } ok(m2, "the number of runs on the old runtime never goes up"); }

// ---- the store: apply and undo
{ const target = governed.find((a) => a.execution!.runtime === "serverless" && a.state === "active") ?? governed[0]; const id = target.id;
  const before = JSON.stringify(agentsNow().agents.find((a) => a.id === id)!.execution); const n0 = agentsNow().agents.find((a) => a.id === id)!.versions.length; const rt = agentsNow().agents.find((a) => a.id === id)!.execution!.runtime;
  const to: RuntimeKind = rt === "service" ? "serverless" : "service";
  const bad = actions.switchRuntime(id, rt, "drain", 0); ok(!bad.ok, "the store refuses a switch to the same runtime");
  const r = actions.switchRuntime(id, to, "drain", 4); ok(r.ok, "the store applies a valid switch");
  const a1 = agentsNow().agents.find((x) => x.id === id)!;
  eq(a1.execution!.runtime, to, "the agent now has the new runtime"); ok(a1.versions.length === n0 + 1 && /switched/i.test(a1.versions[0].note), "the switch is in the version history"); ok(!!a1.lastSwitch, "the old settings are kept");
  const u = actions.undoSwitch(id); ok(u.ok, "undo works");
  const a2 = agentsNow().agents.find((x) => x.id === id)!; eq(JSON.stringify(a2.execution), before, "undo restores the settings exactly"); ok(!a2.lastSwitch && /undone/i.test(a2.versions[0].note), "undo is recorded and clears the record");
  ok(!actions.undoSwitch(id).ok, "there is nothing left to undo");
  actions.switchRuntime(id, to, "drain", 0); const saved = actions.setExecution(id, agentsNow().agents.find((x) => x.id === id)!.execution!); ok(saved.ok && !agentsNow().agents.find((x) => x.id === id)!.lastSwitch, "an ordinary save ends the chance to undo"); }

console.log(`${pass} passed, ${fail} failed`); if (fail) process.exit(1);
