/**
 * Moving a running agent from one runtime to another (for example an on-demand runtime to an always-on service) without losing a run.
 * Everything here is pure: it builds a plan from the agent's settings and the number of runs in flight, so the screen can show exactly
 * what will change and what it will cost before anything moves. The store applies the result and keeps the old settings for rollback.
 *
 * This is the design the real control plane has to honour. Nothing here moves a process; on the sample store the steps are simulated.
 */
import { RUNTIME_BY_ID, defaultExecution, enabledModes, validateExecution, type Execution, type ModeId, type RuntimeKind } from "./execution";
import type { Agent } from "./types";

/** How runs already under way are treated while the agent changes runtime. */
export type Strategy = "drain" | "handoff" | "cutover";
export type StrategyInfo = { id: Strategy; label: string; blurb: string; loses: string; needsDurable: boolean };
export const STRATEGIES: StrategyInfo[] = [
  { id: "drain", label: "Drain", blurb: "New runs go to the new runtime at once. Runs already started finish where they are, then the old runtime is retired.", loses: "Nothing. It takes as long as the longest run still going.", needsDurable: false },
  { id: "handoff", label: "Hand off", blurb: "Each run in flight is saved at its next checkpoint and picked up by the new runtime from there.", loses: "Nothing, but a step in progress repeats once. Needs saved progress.", needsDurable: true },
  { id: "cutover", label: "Cut over now", blurb: "Everything moves immediately. Runs in flight are cancelled and the callers get an error they can retry.", loses: "The runs in flight.", needsDurable: false },
];
export const STRATEGY_BY_ID = Object.fromEntries(STRATEGIES.map((s) => [s.id, s])) as Record<Strategy, StrategyInfo>;

export type Change = { label: string; from: string; to: string; tone?: "good" | "warn" };
export type Step = { id: string; label: string; detail: string; seconds: number };
export type Plan = {
  from: RuntimeKind; to: RuntimeKind; strategy: Strategy;
  /** Why it cannot go ahead. Empty means it can. */
  blockers: string[];
  /** What the person should know before agreeing. */
  warnings: string[];
  /** The settings the agent will have afterwards. */
  next: Execution;
  changes: Change[];
  /** Ways to start the agent that the new runtime cannot offer, and so are turned off. */
  dropped: ModeId[];
  steps: Step[];
  /** Runs in flight, and how many of them the chosen strategy would cancel. */
  inFlight: number; cancelled: number;
  /** Seconds until the old runtime is retired, and seconds in which no run can start (zero when the new runtime is ready first). */
  totalSeconds: number; gapSeconds: number;
  /** Strategies that are allowed for this agent, in the order to offer them. */
  allowed: Strategy[];
};

const label = (k: RuntimeKind) => RUNTIME_BY_ID[k].label;
const modeLabel = (m: ModeId) => ({ onDemand: "On demand", scheduled: "On a schedule", event: "On an event", streaming: "From a stream", human: "By a person" }[m]);
const sec = (s: number) => (s >= 3600 ? `${Math.round(s / 360) / 10} h` : s >= 90 ? `${Math.round(s / 6) / 10} min` : `${Math.round(s)} s`);
export const fmtSeconds = sec;

/** Runs in flight, estimated by Little's law at a busy hour: arrival rate times the time a run takes. A person can overwrite it with a measured number. */
export function estimateInFlight(a: Agent): number {
  const today = a.daily[a.daily.length - 1]?.executions ?? 0;
  const perSecondAtPeak = (today * 0.14) / 3600;
  return Math.max(0, Math.round(perSecondAtPeak * Math.max(1, a.p95Ms / 1000) * 10));
}

export function planSwitch(a: Agent, to: RuntimeKind, strategy: Strategy, inFlight: number): Plan {
  const cur = a.execution ?? defaultExecution("serverless"); const from = cur.runtime; const target = RUNTIME_BY_ID[to];
  const blockers: string[] = []; const warnings: string[] = []; const changes: Change[] = [];
  const inflight = Math.max(0, Math.round(inFlight));

  if (a.state === "retired") blockers.push("A retired agent cannot be moved.");
  if (a.control !== "governed") blockers.push("tok∑ner does not run this agent, so it cannot move it. Change the runtime on the platform where it runs.");
  if (from === to) blockers.push(`It already runs on ${label(to).toLowerCase()}.`);
  if (to === "external") blockers.push("tok∑ner cannot move an agent to a platform it does not run. Register it as an external agent instead.");
  if (a.state === "suspended") warnings.push("The agent is suspended. It moves, but stays suspended until someone resumes it.");

  // Settings that follow the agent across: keep what the new runtime supports, and say what falls away.
  const base = defaultExecution(to);
  const keepModes = enabledModes(cur).filter((m) => target.modes.includes(m)); const dropped = enabledModes(cur).filter((m) => !target.modes.includes(m));
  const modes: Execution["modes"] = {}; for (const m of keepModes) (modes as Record<string, unknown>)[m] = cur.modes[m];
  let usedDefault = false; if (!keepModes.length) { Object.assign(modes, base.modes); usedDefault = true; }
  for (const m of dropped) warnings.push(`${modeLabel(m)} is not available on ${label(to).toLowerCase()}, so it is turned off.${m === "scheduled" ? " Its schedules stop running." : m === "human" ? " Runs will no longer wait for a person." : ""}`);
  if (usedDefault) warnings.push(`None of its current ways to start the agent exist on ${label(to).toLowerCase()}, so it starts with the default for that runtime. Review what starts it after the move.`);
  if (to === "streaming" && usedDefault) warnings.push("A streaming worker needs a stream to read. The default topic is a placeholder; set the real one before the move completes.");

  // Limits: carry them over where the new runtime allows, otherwise use its own.
  const maxT = target.maxTimeoutSec; const t0 = cur.scaling.timeoutSec;
  const timeoutSec = maxT === 0 ? base.scaling.timeoutSec : Math.min(t0 || base.scaling.timeoutSec, maxT);
  if (maxT > 0 && t0 > maxT) warnings.push(`The time limit of ${sec(t0)} is above what ${label(to).toLowerCase()} allows, so it becomes ${sec(maxT)}.`);
  const scaling = { ...base.scaling, concurrency: cur.scaling.concurrency || base.scaling.concurrency, memoryMb: Math.max(cur.scaling.memoryMb, 256) || base.scaling.memoryMb, cpu: cur.scaling.cpu || base.scaling.cpu, timeoutSec };
  const next: Execution = { ...base, toolCalling: cur.toolCalling, autoSwitch: cur.autoSwitch, durable: to === "external" ? false : cur.durable, scaling, modes };

  // Guards that depend on how the agent keeps its progress.
  const allowed: Strategy[] = ["drain"]; if (cur.durable && to !== "external" && from !== "external") allowed.push("handoff"); allowed.push("cutover");
  if (strategy === "handoff" && !allowed.includes("handoff")) blockers.push("Hand off needs saved progress. Turn on “Save progress” for this agent first, or choose Drain.");
  if (!cur.durable && inflight > 0) warnings.push("Progress is not saved for this agent, so a run cannot be carried across. Drain waits for each run to finish instead.");
  if (from === "streaming" && strategy === "drain") warnings.push("A streaming worker never finishes a run. Draining will wait for its next checkpoint, then stop reading and hand the stream position to the new runtime.");
  if (to === "batch" && keepModes.includes("onDemand")) warnings.push("A batch job starts in tens of seconds, so callers of an on demand request will wait much longer for a first answer.");
  if (from === "service" && to === "serverless") warnings.push("State held in memory by the always-on replicas is lost. Anything the agent keeps only in memory must already be saved as memory or progress.");
  if (from === "serverless" && to === "service") warnings.push(`Replicas stay running, so it is billed per replica hour (at least ${next.scaling.minReplicas}) even when idle.`);

  const issues = validateExecution(next, { hasSensitiveTools: a.tools.some((t) => t.sensitive), control: a.control, toolCount: a.tools.length });
  for (const i of issues) if (i.level === "error") blockers.push(i.message);

  // What changes, in the words a person would use.
  changes.push({ label: "Runtime", from: label(from), to: label(to) });
  changes.push({ label: "Cold start", from: RUNTIME_BY_ID[from].coldStart, to: target.coldStart, tone: target.scalesToZero && !RUNTIME_BY_ID[from].scalesToZero ? "warn" : !target.scalesToZero && RUNTIME_BY_ID[from].scalesToZero ? "good" : undefined });
  changes.push({ label: "Billing", from: RUNTIME_BY_ID[from].billing, to: target.billing });
  changes.push({ label: "Copies", from: `${cur.scaling.minReplicas} to ${cur.scaling.maxReplicas}`, to: `${next.scaling.minReplicas} to ${next.scaling.maxReplicas}` });
  changes.push({ label: "Scales on", from: cur.scaling.autoscale.mode === "manual" ? "A fixed number" : cur.scaling.autoscale.metric, to: next.scaling.autoscale.mode === "manual" ? "A fixed number" : next.scaling.autoscale.metric });
  changes.push({ label: "Time limit", from: cur.scaling.timeoutSec ? sec(cur.scaling.timeoutSec) : "None", to: next.scaling.timeoutSec ? sec(next.scaling.timeoutSec) : "None" });
  changes.push({ label: "Starts from", from: enabledModes(cur).map(modeLabel).join(", ") || "Nothing", to: enabledModes(next).map(modeLabel).join(", ") || "Nothing" });

  // The steps, with a time for each. Draining takes as long as the longest run left; hand off takes a checkpoint interval; cut over takes nothing.
  const warm = to === "serverless" || to === "batch" ? 4 : to === "external" ? 0 : 18 + next.scaling.minReplicas * 4;
  const longest = Math.max(5, Math.round((a.p95Ms || 8000) / 1000));
  const drainSec = inflight === 0 ? 2 : strategy === "drain" ? (from === "streaming" ? Math.max(10, cur.modes.streaming?.checkpointSec ?? 10) : longest) : strategy === "handoff" ? 6 : 1;
  const cancelled = strategy === "cutover" ? inflight : 0;
  const steps: Step[] = [
    { id: "check", label: "Check the new settings", detail: "Run the same validation a save does, against the new runtime.", seconds: 1 },
    { id: "provision", label: `Start ${label(to).toLowerCase()}`, detail: to === "serverless" || to === "batch" ? "Register the new runtime. Nothing runs until the first call." : `Start ${next.scaling.minReplicas} ${next.scaling.minReplicas === 1 ? "copy" : "copies"} and wait until each reports ready.`, seconds: warm },
    { id: "route", label: "Send new runs to it", detail: "The gateway starts routing new calls to the new runtime. This is the moment callers notice nothing.", seconds: 1 },
    { id: "inflight", label: strategy === "handoff" ? `Carry ${inflight} ${inflight === 1 ? "run" : "runs"} across` : strategy === "cutover" ? `Cancel ${inflight} ${inflight === 1 ? "run" : "runs"}` : `Let ${inflight} ${inflight === 1 ? "run" : "runs"} finish`, detail: strategy === "handoff" ? "Each run is saved at its next checkpoint and resumed on the new runtime." : strategy === "cutover" ? "The old runtime stops at once. Callers get an error they can retry." : "The old runtime takes no new work and waits for what is under way.", seconds: drainSec },
    { id: "retire", label: `Retire ${label(from).toLowerCase()}`, detail: "Stop and remove the old copies. The old settings are kept so the move can be undone.", seconds: 2 },
    { id: "verify", label: "Check it is healthy", detail: "Watch the first minute of runs and compare errors and time with before.", seconds: 4 },
  ];
  // The old runtime keeps serving until routing moves, so no run is refused unless the new one is not ready when we cut over.
  const gapSeconds = strategy === "cutover" ? 1 : 0;
  const totalSeconds = steps.reduce((t, s) => t + s.seconds, 0);

  return { from, to, strategy, blockers: [...new Set(blockers)], warnings, next, changes, dropped, steps, inFlight: inflight, cancelled, totalSeconds, gapSeconds, allowed };
}

/** Which step a plan is on after `elapsed` seconds, and how far through it. Used to drive the progress on screen. */
export function progressAt(plan: Plan, elapsed: number): { index: number; done: boolean; fraction: number } {
  let t = 0;
  for (let i = 0; i < plan.steps.length; i++) { const end = t + plan.steps[i].seconds; if (elapsed < end) return { index: i, done: false, fraction: (elapsed - t) / plan.steps[i].seconds }; t = end; }
  return { index: plan.steps.length - 1, done: true, fraction: 1 };
}

/** How many of the runs in flight are still on the old runtime after `elapsed` seconds. */
export function remainingOnOld(plan: Plan, elapsed: number): number {
  const route = plan.steps.slice(0, 3).reduce((t, s) => t + s.seconds, 0); if (elapsed < route) return plan.inFlight;
  const s = plan.steps[3]; const e = elapsed - route; if (e >= s.seconds) return 0;
  return Math.max(0, Math.round(plan.inFlight * (1 - e / s.seconds)));
}

/** What a switch leaves in the record: the settings before it, so it can be undone. */
export type SwitchRecord = { from: Execution; to: RuntimeKind; strategy: Strategy; at: string };
export const switchNote = (from: RuntimeKind, to: RuntimeKind, strategy: Strategy) => `Runtime switched from ${label(from).toLowerCase()} to ${label(to).toLowerCase()} (${STRATEGY_BY_ID[strategy].label.toLowerCase()})`;
export const rollbackNote = (from: RuntimeKind, to: RuntimeKind) => `Runtime switch undone: back from ${label(from).toLowerCase()} to ${label(to).toLowerCase()}`;
