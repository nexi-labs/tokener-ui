/**
 * Automatic runtime switching. The developer of an agent turns it on and writes the rules; the control plane then moves the agent between runtimes by itself
 * when the load or the events it receives say it should, so nobody has to press a button. A rule says: when these signals hold for this long, move to that runtime.
 *
 * Everything here is pure. `evaluate` looks at the recent signals and the agent's record and answers with one decision, and the reasons for it, so a person can
 * always read why the agent moved or why it stayed. The guardrails are part of the policy and cannot be turned off: an agent stays on a runtime for a minimum time,
 * moves at most so many times a day, never loses a way to start, never gets a stream it has not been given, and is never cut over (runs in flight are drained or handed off).
 */
import { RUNTIME_BY_ID, enabledModes, type Execution, type RuntimeKind } from "./execution";
import { planSwitch, type Plan, type Strategy } from "./switching";
import type { Agent } from "./types";

export type SignalId = "rpm" | "queue" | "lagSec" | "cpuPct";
export type SignalInfo = { id: SignalId; label: string; unit: string; blurb: string; max: number };
export const SIGNALS: SignalInfo[] = [
  { id: "rpm", label: "Runs per minute", unit: "runs/min", blurb: "How many runs start each minute, from any way of starting the agent.", max: 600 },
  { id: "queue", label: "Waiting events", unit: "events", blurb: "Events and queue messages received but not yet picked up.", max: 5000 },
  { id: "lagSec", label: "Stream lag", unit: "seconds", blurb: "How far behind the newest event the agent is, on a stream.", max: 3600 },
  { id: "cpuPct", label: "CPU in use", unit: "percent", blurb: "How busy the copies that are running are.", max: 100 },
];
export const SIGNAL_BY_ID = Object.fromEntries(SIGNALS.map((s) => [s.id, s])) as Record<SignalId, SignalInfo>;

export type Condition = { signal: SignalId; op: ">" | "<"; value: number; forMin: number };
export type Rule = { id: string; name: string; when: Condition[]; to: RuntimeKind; /** Only between these hours of the day, in the schedule's time zone. */ hours?: { from: number; to: number } };
export type AutoSwitch = { enabled: boolean; rules: Rule[]; strategy: "drain" | "handoff"; /** The agent stays on a runtime at least this long before it can move again. */ minDwellMin: number; maxPerDay: number };

export type Sample = { t: number; rpm: number; queue: number; lagSec: number; cpuPct: number };
export type SwitchEvent = { at: string; simAt: number; from: RuntimeKind; to: RuntimeKind; rule: string; reason: string; strategy: Strategy; inFlight: number; cancelled: number; auto: boolean };

let n = 0; const rid = () => `rule_${(++n).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
export const defaultAutoSwitch = (): AutoSwitch => ({ enabled: false, rules: [], strategy: "drain", minDwellMin: 15, maxPerDay: 6 });
export const emptyRule = (): Rule => ({ id: rid(), name: "New rule", when: [{ signal: "rpm", op: ">", value: 30, forMin: 5 }], to: "service" });

export type Preset = { id: string; label: string; blurb: string; rules: () => Rule[] };
export const PRESETS: Preset[] = [
  { id: "traffic", label: "Follow traffic", blurb: "Always-on while it is busy, back to on-demand when it goes quiet.", rules: () => [
    { id: rid(), name: "Busy, keep it warm", when: [{ signal: "rpm", op: ">", value: 30, forMin: 5 }], to: "service" },
    { id: rid(), name: "Quiet, stop paying for idle", when: [{ signal: "rpm", op: "<", value: 5, forMin: 15 }], to: "serverless" }] },
  { id: "events", label: "Follow the event backlog", blurb: "A streaming worker while events pile up, on-demand once they are cleared.", rules: () => [
    { id: rid(), name: "Backlog building", when: [{ signal: "queue", op: ">", value: 200, forMin: 3 }], to: "streaming" },
    { id: rid(), name: "Backlog cleared", when: [{ signal: "queue", op: "<", value: 10, forMin: 10 }], to: "serverless" }] },
  { id: "lag", label: "Follow stream lag", blurb: "Always-on service when a stream falls behind, back when it catches up.", rules: () => [
    { id: rid(), name: "Falling behind", when: [{ signal: "lagSec", op: ">", value: 120, forMin: 3 }], to: "service" },
    { id: rid(), name: "Caught up", when: [{ signal: "lagSec", op: "<", value: 15, forMin: 20 }], to: "serverless" }] },
];

export type AutoIssue = { path: string; message: string; level: "error" | "warning" };
export function validateAutoSwitch(a: AutoSwitch | undefined): AutoIssue[] {
  const out: AutoIssue[] = []; if (!a) return out; const err = (path: string, message: string) => out.push({ path, message, level: "error" }); const warn = (path: string, message: string) => out.push({ path, message, level: "warning" });
  if (a.enabled && a.rules.length === 0) err("rules", "Add at least one rule, or turn automatic switching off.");
  if (!(a.minDwellMin >= 1 && a.minDwellMin <= 1440)) err("minDwellMin", "Stay on a runtime for 1 to 1440 minutes at least.");
  if (!(a.maxPerDay >= 1 && a.maxPerDay <= 48)) err("maxPerDay", "Allow between 1 and 48 switches a day.");
  for (const r of a.rules) {
    if (!r.name.trim()) err(`rules.${r.id}`, "Give each rule a name, so the history says why the agent moved.");
    if (r.to === "external") err(`rules.${r.id}`, `${r.name}: tok∑ner cannot move an agent to a platform it does not run.`);
    if (!r.when.length) err(`rules.${r.id}`, `${r.name}: add a condition.`);
    for (const c of r.when) {
      if (!Number.isFinite(c.value) || c.value < 0) err(`rules.${r.id}`, `${r.name}: the value must be zero or more.`);
      if (!(c.forMin >= 1 && c.forMin <= 1440)) err(`rules.${r.id}`, `${r.name}: hold for 1 to 1440 minutes, so one spike does not move the agent.`);
    }
    if (r.hours && (r.hours.from < 0 || r.hours.from > 23 || r.hours.to < 0 || r.hours.to > 24)) err(`rules.${r.id}`, `${r.name}: hours are 0 to 24.`);
  }
  // Two rules that send the agent to different runtimes must not both be true for some value, or it would move back and forth.
  for (let i = 0; i < a.rules.length; i++) for (let j = i + 1; j < a.rules.length; j++) {
    const x = a.rules[i], y = a.rules[j]; if (x.to === y.to) continue;
    for (const cx of x.when) for (const cy of y.when) {
      if (cx.signal !== cy.signal || cx.op === cy.op) continue;
      const hi = cx.op === ">" ? cx : cy, lo = cx.op === ">" ? cy : cx;
      if (lo.value >= hi.value) err(`rules.${x.id}`, `“${x.name}” and “${y.name}” can both be true between ${hi.value} and ${lo.value} ${SIGNAL_BY_ID[cx.signal].unit}, so the agent could move back and forth. Leave a gap between the two values.`);
      else if (lo.value > hi.value * 0.8 && hi.value > 0) warn(`rules.${x.id}`, `“${x.name}” and “${y.name}” are close (${lo.value} and ${hi.value}). A wider gap means fewer moves.`);
    }
  }
  if (a.enabled && a.rules.length && a.rules.every((r) => r.to === a.rules[0].to)) warn("rules", "Every rule moves the agent to the same runtime, so it can never move back.");
  return out;
}

export type Decision =
  | { kind: "off"; reason: string }
  | { kind: "hold"; reason: string; waitMin?: number }
  | { kind: "blocked"; reason: string; rule: Rule }
  | { kind: "switch"; reason: string; rule: Rule; to: RuntimeKind; strategy: Strategy; plan: Plan };

const val = (s: Sample, id: SignalId) => s[id];
const fmt = (c: Condition) => `${SIGNAL_BY_ID[c.signal].label.toLowerCase()} ${c.op === ">" ? "above" : "below"} ${c.value} ${SIGNAL_BY_ID[c.signal].unit} for ${c.forMin} min`;
export const describeCondition = fmt;
const MIN = 60_000;

/** Does a condition hold across its whole window? Needs samples from the start of the window, or it says it does not know yet. */
export function holds(c: Condition, samples: Sample[], now: number): "yes" | "no" | "unknown" {
  const from = now - c.forMin * MIN; const within = samples.filter((s) => s.t > from && s.t <= now);
  if (!within.length) return "unknown";
  // The first sample must be at the start of the window (one tick of slack), or the window is not covered yet.
  const first = samples.find((s) => s.t > from - MIN); if (!first || first.t > from + MIN + 1) return "unknown";
  return within.every((s) => (c.op === ">" ? val(s, c.signal) > c.value : val(s, c.signal) < c.value)) ? "yes" : "no";
}

const hourNow = (t: number) => new Date(t).getUTCHours() + new Date(t).getUTCMinutes() / 60;
const inHours = (h: Rule["hours"], t: number) => { if (!h) return true; const x = hourNow(t); return h.from <= h.to ? x >= h.from && x < h.to : x >= h.from || x < h.to; };

export function evaluate(a: Agent, samples: Sample[], now: number, state: { lastSwitchSim?: number; log: SwitchEvent[] }): Decision {
  const e = a.execution; const as = e?.autoSwitch;
  if (!e || !as || !as.enabled) return { kind: "off", reason: "Automatic switching is off." };
  if (a.control !== "governed") return { kind: "off", reason: "tok∑ner does not run this agent." };
  if (a.state === "retired") return { kind: "off", reason: "The agent is retired." };
  if (a.state === "suspended") return { kind: "hold", reason: "The agent is suspended, so it is not moved." };
  const bad = validateAutoSwitch(as).find((i) => i.level === "error"); if (bad) return { kind: "hold", reason: `The rules are not valid: ${bad.message}` };

  const day = state.log.filter((x) => x.auto && x.simAt > now - 24 * 60 * MIN).length;
  if (day >= as.maxPerDay) return { kind: "hold", reason: `It has already moved ${day} times in the last day, which is the limit.` };
  if (state.lastSwitchSim !== undefined) { const since = (now - state.lastSwitchSim) / MIN; if (since < as.minDwellMin) return { kind: "hold", reason: `It moved ${Math.round(since)} min ago and stays at least ${as.minDwellMin} min on a runtime.`, waitMin: Math.ceil(as.minDwellMin - since) }; }

  const last = samples[samples.length - 1]; let firstBlocked: Decision | null = null; let waiting: string | null = null;
  for (const r of as.rules) {
    if (r.to === e.runtime) continue;
    if (!inHours(r.hours, now)) continue;
    const states = r.when.map((c) => holds(c, samples, now));
    if (states.includes("no")) continue;
    if (states.includes("unknown")) { waiting = `“${r.name}” is waiting for enough history to judge.`; continue; }
    const strategy: Strategy = as.strategy === "handoff" && e.durable ? "handoff" : "drain";
    const inFlight = last ? Math.round((last.rpm / 60) * Math.max(1, a.p95Ms / 1000)) : 0;
    const plan = planSwitch(a, r.to, strategy, inFlight);
    const reason = `“${r.name}”: ${r.when.map(fmt).join(" and ")}.`;
    // An automatic move never costs the agent a way to start, never invents a stream, and never cancels a run.
    const why = plan.blockers[0]
      ?? (plan.dropped.length ? `${RUNTIME_BY_ID[r.to].label} cannot start the agent ${plan.dropped.length === 1 ? "this way" : "these ways"}, and an automatic move never turns one off.` : undefined)
      ?? (r.to === "streaming" && !enabledModes(plan.next).some((m) => m === "streaming" || m === "event") ? "A streaming worker needs a stream or events to read." : undefined)
      ?? (plan.cancelled > 0 ? "It would cancel runs." : undefined);
    if (why) { firstBlocked ??= { kind: "blocked", reason: `${reason} Not moved: ${why}`, rule: r }; continue; }
    return { kind: "switch", reason, rule: r, to: r.to, strategy, plan };
  }
  if (firstBlocked) return firstBlocked;
  if (waiting) return { kind: "hold", reason: waiting };
  return { kind: "hold", reason: last ? `No rule applies. ${Math.round(last.rpm * 10) / 10} runs/min, ${Math.round(last.queue)} waiting.` : "No signals yet." };
}

export type { Execution };
