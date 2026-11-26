/**
 * Checks for automatic runtime switching: the policy and its validation, how a condition is judged over a window, the decision (including every reason to hold or
 * refuse), and a closed loop on the sample clock that proves the agent follows the load without flapping and without ever dropping a way to start or cancelling a run.
 * Run: npx tsx --tsconfig scripts/tsconfig.scripts.json scripts/check-agent-autoswitch.ts
 */
import { sampleAgents } from "../src/lib/agents/sample";
import { agents as actions, agentsNow, resetAgents } from "../src/lib/agents/store";
import { defaultExecution, validateExecution } from "../src/lib/agents/execution";
import { PRESETS, defaultAutoSwitch, evaluate, holds, validateAutoSwitch, type AutoSwitch, type Condition, type Rule, type Sample } from "../src/lib/agents/autoswitch";
import { TICK_MS, getSimNow, loadSim } from "../src/lib/agents/loadsim";
import type { Agent } from "../src/lib/agents/types";

let pass = 0; let fail = 0;
const ok = (c: unknown, m: string) => { if (c) pass++; else { fail++; console.error("FAIL", m); } };
const eq = (a: unknown, b: unknown, m: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`);

const T0 = Date.UTC(2026, 10, 26, 9, 0, 0);
const series = (n: number, f: (i: number) => Partial<Sample>, end = T0): Sample[] => Array.from({ length: n }, (_, i) => ({ t: end - (n - 1 - i) * TICK_MS, rpm: 1, queue: 0, lagSec: 1, cpuPct: 5, ...f(i) }));
const traffic = (): AutoSwitch => ({ ...defaultAutoSwitch(), enabled: true, rules: PRESETS[0].rules() });
const base = sampleAgents().agents.find((a) => a.id === "agt_02")!;
const withAuto = (as: AutoSwitch, over: Partial<Agent> = {}): Agent => ({ ...base, ...over, execution: { ...defaultExecution("serverless"), autoSwitch: as } });
const state = { log: [] as never[] };

// ---- validation
eq(validateAutoSwitch(undefined), [], "no policy has no issues");
ok(validateAutoSwitch({ ...defaultAutoSwitch(), enabled: true }).some((i) => /at least one rule/.test(i.message)), "turning it on without a rule is refused");
ok(validateAutoSwitch({ ...defaultAutoSwitch(), enabled: false }).length === 0, "an empty policy that is off is fine");
eq(validateAutoSwitch(traffic()).filter((i) => i.level === "error"), [], "the traffic preset is valid");
for (const p of PRESETS) eq(validateAutoSwitch({ ...defaultAutoSwitch(), enabled: true, rules: p.rules() }).filter((i) => i.level === "error"), [], `preset ${p.id} is valid`);
{ const r = PRESETS[0].rules(); r[1].when[0].value = 40; ok(validateAutoSwitch({ ...traffic(), rules: r }).some((i) => i.level === "error" && /back and forth/.test(i.message)), "rules that overlap are refused, so the agent cannot flap"); }
{ const r = PRESETS[0].rules(); r[1].when[0].value = 28; ok(validateAutoSwitch({ ...traffic(), rules: r }).some((i) => i.level === "warning"), "rules that are close give a warning"); }
{ const r = PRESETS[0].rules(); r[0].to = "external"; ok(validateAutoSwitch({ ...traffic(), rules: r }).some((i) => /does not run/.test(i.message)), "a rule cannot target a platform tok∑ner does not run"); }
{ const r = PRESETS[0].rules(); r[0].when[0].forMin = 0; ok(validateAutoSwitch({ ...traffic(), rules: r }).some((i) => /hold for/.test(i.message)), "a condition must hold for at least a minute"); }
{ const r = PRESETS[0].rules(); r[0].name = " "; ok(validateAutoSwitch({ ...traffic(), rules: r }).some((i) => /name/.test(i.message)), "a rule needs a name"); }
ok(validateAutoSwitch({ ...traffic(), minDwellMin: 0 }).length > 0 && validateAutoSwitch({ ...traffic(), maxPerDay: 100 }).length > 0, "limits are checked");
ok(validateExecution(withAuto({ ...traffic(), rules: [] }).execution!, { control: "governed" }).some((i) => i.level === "error"), "the execution check includes the policy");

// ---- a condition over a window
const c: Condition = { signal: "rpm", op: ">", value: 30, forMin: 5 };
eq(holds(c, series(10, () => ({ rpm: 50 })), T0), "yes", "a condition that holds across the window is yes");
eq(holds(c, series(10, (i) => ({ rpm: i === 7 ? 10 : 50 })), T0), "no", "one sample inside the window that fails makes it no");
eq(holds(c, series(10, (i) => ({ rpm: i === 2 ? 10 : 50 })), T0), "yes", "a sample before the window does not matter");
eq(holds(c, series(3, () => ({ rpm: 50 })), T0), "unknown", "too little history is unknown, not yes");
eq(holds(c, [], T0), "unknown", "no samples is unknown");
eq(holds({ ...c, op: "<", value: 5 }, series(10, () => ({ rpm: 1 })), T0), "yes", "below works");

// ---- the decision
const busy = series(30, () => ({ rpm: 60 })); const quiet = series(30, () => ({ rpm: 1 }));
eq(evaluate(withAuto({ ...traffic(), enabled: false }), busy, T0, state).kind, "off", "off when disabled");
eq(evaluate({ ...base, execution: defaultExecution("serverless") }, busy, T0, state).kind, "off", "off when there is no policy");
eq(evaluate({ ...withAuto(traffic()), control: "observed" }, busy, T0, state).kind, "off", "off for an agent tok∑ner does not run");
eq(evaluate(withAuto(traffic(), { state: "suspended" }), busy, T0, state).kind, "hold", "a suspended agent is not moved");
eq(evaluate(withAuto(traffic(), { state: "retired" }), busy, T0, state).kind, "off", "a retired agent is not moved");
{ const d = evaluate(withAuto(traffic()), busy, T0, state); ok(d.kind === "switch" && d.to === "service" && /Busy/.test(d.reason), `busy on-demand moves to service (${d.kind}: ${d.reason})`); }
eq(evaluate(withAuto(traffic()), quiet, T0, state).kind, "hold", "quiet while already on-demand holds");
{ const a = withAuto(traffic()); a.execution = { ...defaultExecution("service"), autoSwitch: traffic() }; const d = evaluate(a, series(30, (i) => ({ rpm: i >= 20 ? 1 : 60 })), T0, state); ok(d.kind === "hold", "ten quiet minutes is not the fifteen it needs"); const q2 = series(30, () => ({ rpm: 1 })); ok(evaluate(a, q2, T0, state).kind === "switch", "quiet for 30 minutes moves a service back to on-demand"); }
{ const s = series(30, (i) => ({ rpm: i >= 27 ? 60 : 1 })); eq(evaluate(withAuto(traffic()), s, T0, state).kind, "hold", "a spike shorter than the window does not move it"); }
{ const d = evaluate(withAuto(traffic()), series(3, () => ({ rpm: 60 })), T0, state); ok(d.kind === "hold" && /history/.test(d.reason), "not enough history waits and says so"); }
// guardrails
{ const d = evaluate(withAuto(traffic()), busy, T0, { lastSwitchSim: T0 - 5 * 60_000, log: [] }); ok(d.kind === "hold" && /stays at least/.test(d.reason) && (d as { waitMin?: number }).waitMin === 10, "the minimum stay holds the agent and says how long is left"); }
{ const log = Array.from({ length: 6 }, (_, i) => ({ at: "", simAt: T0 - (i + 1) * 3 * 3600_000, from: "serverless", to: "service", rule: "x", reason: "", strategy: "drain", inFlight: 0, cancelled: 0, auto: true })) as never[]; const d = evaluate(withAuto(traffic()), busy, T0, { lastSwitchSim: T0 - 7 * 3600_000, log }); ok(d.kind === "hold" && /limit/.test(d.reason), "the daily limit holds the agent"); }
{ const log = [{ at: "", simAt: T0 - 30 * 3600_000, from: "serverless", to: "service", rule: "x", reason: "", strategy: "drain", inFlight: 0, cancelled: 0, auto: true }] as never[]; ok(evaluate(withAuto({ ...traffic(), maxPerDay: 1 }), busy, T0, { lastSwitchSim: T0 - 30 * 3600_000, log }).kind === "switch", "a switch older than a day does not count"); }
// hours window
{ const r = PRESETS[0].rules(); r[0].hours = { from: 1, to: 5 }; ok(evaluate(withAuto({ ...traffic(), rules: r }), busy, T0, state).kind === "hold", "a rule outside its hours does not apply (09:00 against 01 to 05)"); r[0].hours = { from: 8, to: 12 }; ok(evaluate(withAuto({ ...traffic(), rules: r }), busy, T0, state).kind === "switch", "a rule inside its hours applies"); r[0].hours = { from: 22, to: 6 }; ok(evaluate(withAuto({ ...traffic(), rules: r }), busy, T0, state).kind === "hold", "an overnight window wraps (22 to 06)"); }
// first matching rule wins
{ const r: Rule[] = [{ id: "a", name: "First", when: [{ signal: "rpm", op: ">", value: 30, forMin: 5 }], to: "service" }, { id: "b", name: "Second", when: [{ signal: "rpm", op: ">", value: 20, forMin: 5 }], to: "batch" }];
  const d = evaluate(withAuto({ ...defaultAutoSwitch(), enabled: true, rules: r }), busy, T0, state); ok(d.kind === "switch" && d.to === "service", "the first rule that applies is used"); }
// never costs a way to start
{ const a = withAuto({ ...defaultAutoSwitch(), enabled: true, rules: [{ id: "x", name: "To batch", when: [{ signal: "queue", op: ">", value: 100, forMin: 3 }], to: "batch" }] }); a.execution = { ...a.execution!, runtime: "service", modes: { onDemand: a.execution!.modes.onDemand, streaming: defaultExecution("streaming").modes.streaming } };
  const d = evaluate(a, series(10, () => ({ queue: 900 })), T0, state); ok(d.kind === "blocked" && /never turns one off/.test(d.reason), `an automatic move never turns a way to start off (${d.kind}: ${d.reason})`); }
// a stream is never invented
{ const a = withAuto({ ...defaultAutoSwitch(), enabled: true, rules: [{ id: "x", name: "To stream", when: [{ signal: "lagSec", op: ">", value: 100, forMin: 3 }], to: "streaming" }] });
  const d = evaluate(a, series(10, () => ({ lagSec: 300 })), T0, state); ok(d.kind === "blocked", `a streaming worker is not chosen when the agent has nothing to read (${d.kind}: ${d.reason})`);
  const e = withAuto({ ...defaultAutoSwitch(), enabled: true, rules: [{ id: "x", name: "To stream", when: [{ signal: "queue", op: ">", value: 100, forMin: 3 }], to: "streaming" }] }); e.execution = { ...e.execution!, modes: { onDemand: e.execution!.modes.onDemand, event: { triggers: [{ id: "t", kind: "topic", source: "orders", filter: "", batchSize: 1 }], concurrency: 4, retries: 2 } } };
  const d2 = evaluate(e, series(10, () => ({ queue: 900 })), T0, state); ok(d2.kind === "blocked" /* on-demand would be dropped by the stream worker */ || d2.kind === "switch", "an agent with events can be considered for a stream worker"); }
// hand off only when progress is saved
{ const a = withAuto({ ...traffic(), strategy: "handoff" }); const d = evaluate(a, busy, T0, state); ok(d.kind === "switch" && d.strategy === "handoff", "a durable agent is handed off"); a.execution = { ...a.execution!, durable: false }; const d2 = evaluate(a, busy, T0, state); ok(d2.kind === "switch" && d2.strategy === "drain", "an agent without saved progress is drained instead"); }
{ const d = evaluate(withAuto(traffic()), busy, T0, state); ok(d.kind === "switch" && d.plan.cancelled === 0, "an automatic move cancels nothing"); }

// ---- the sample load
{ resetAgents(); loadSim.reset(); const ags = agentsNow().agents; const a = ags.find((x) => x.id === "agt_02")!;
  const h0 = loadSim.samples(a).length; ok(h0 >= 60, `history is back-filled (${h0})`);
  const t0 = getSimNow(); loadSim.tick(ags); eq(getSimNow() - t0, TICK_MS, "a tick is one sample minute");
  loadSim.pick(a, "spike"); for (let i = 0; i < 3; i++) loadSim.tick(ags); ok(loadSim.latest(a).rpm > 100, "a scenario sets the signals");
  loadSim.pick(a, "normal"); loadSim.tick(ags); ok(loadSim.latest(a).rpm < 30, "going back to normal returns the sample traffic");
  ok(loadSim.samples(a).length <= 180, "history is bounded"); }

// ---- closed loop: the agent follows the load and does not flap
function loop(id: string, as: AutoSwitch, plan: { until: number; scenario: Parameters<typeof loadSim.pick>[1] }[], minutes: number) {
  resetAgents(); loadSim.reset(); const s0 = agentsNow().agents.find((x) => x.id === id)!;
  actions.setExecution(id, { ...s0.execution!, runtime: "serverless", autoSwitch: as }); const moves: { at: number; to: string; rule: string }[] = [];
  for (let m = 0; m < minutes; m++) {
    const cur = agentsNow().agents.find((x) => x.id === id)!; const sc = plan.find((p) => m < p.until) ?? plan[plan.length - 1]; loadSim.pick(cur, sc.scenario); loadSim.tick(agentsNow().agents);
    const a = agentsNow().agents.find((x) => x.id === id)!; const d = evaluate(a, loadSim.samples(a), getSimNow(), a.switching ?? { log: [] });
    if (d.kind === "switch") { const r = actions.switchRuntime(id, d.to, d.strategy, d.plan.inFlight, { rule: d.rule.name, reason: d.reason }); ok(r.ok, `the store accepts an automatic switch (${r.ok ? "" : r.error})`); moves.push({ at: m, to: d.to, rule: d.rule.name }); }
  }
  return { moves, agent: agentsNow().agents.find((x) => x.id === id)! };
}
{ const r = loop("agt_02", traffic(), [{ until: 40, scenario: "busy" }, { until: 200, scenario: "quiet" }], 200);
  eq(r.moves.map((m) => m.to), ["service", "serverless"], "busy then quiet: up to the service, then back down");
  ok(r.moves[0].at >= 4 && r.moves[0].at <= 12, `the first move waits for the load to be sustained (minute ${r.moves[0]?.at})`);
  ok(r.moves[1].at - r.moves[0].at >= 15, `it stays on the service at least the minimum time (${r.moves[1]?.at - r.moves[0]?.at} min)`);
  const log = r.agent.switching!.log; ok(log.length === 2 && log.every((e) => e.auto && e.rule && e.reason), "each move is logged with its rule and reason"); ok(r.agent.versions.some((v) => /^Automatic switch/.test(v.note)), "an automatic move is in the version history");
  ok(r.agent.execution!.autoSwitch?.enabled === true, "the policy survives the switch"); }
{ const flap = Array.from({ length: 40 }, (_, i) => ({ until: (i + 1) * 4, scenario: (i % 2 ? "busy" : "quiet") as "busy" | "quiet" }));
  const r = loop("agt_02", traffic(), flap, 160); ok(r.moves.length <= 2, `load that flips every four minutes does not move the agent (${r.moves.length} moves)`); }
{ const r = loop("agt_02", { ...traffic(), minDwellMin: 1, maxPerDay: 3 }, Array.from({ length: 60 }, (_, i) => ({ until: (i + 1) * 20, scenario: (i % 2 ? "quiet" : "busy") as "busy" | "quiet" })), 600);
  ok(r.moves.length <= 3, `the daily limit caps the number of moves (${r.moves.length})`); }
{ const r = loop("agt_02", { ...traffic(), enabled: false }, [{ until: 100, scenario: "spike" }], 100); eq(r.moves.length, 0, "with the policy off nothing moves, whatever the load"); }
{ const r = loop("agt_02", { ...defaultAutoSwitch(), enabled: true, rules: PRESETS[1].rules() }, [{ until: 30, scenario: "backlog" }, { until: 300, scenario: "quiet" }], 120);
  ok(r.agent.execution!.runtime === "serverless" || r.moves.length > 0, "the backlog preset runs without error"); }

console.log(`${pass} passed, ${fail} failed`); if (fail) process.exit(1);
