import type { CtPolicy, Candidate, Cycle, CycleStep, GateResult, StepId, Trigger, TriggerEvent, Approval } from "./types";

/** Metrics where a smaller value is the better one. The gates, the champion comparison and the simulated candidate all follow this. */
export const LOWER_IS_BETTER = new Set(["loss", "val_loss", "train_loss", "eval_loss", "mape", "rmse", "mae"]);
export const better = (key: string, a: number, b: number) => (LOWER_IS_BETTER.has(key) ? a < b : a > b);
export const atLeastAsGood = (key: string, a: number, b: number) => (LOWER_IS_BETTER.has(key) ? a <= b : a >= b);


/**
 * Continuous training rules (docs/51, section 7). Pure functions, so the same rules can run in the console sample store, in checks and later on the
 * server. A cycle that fails any gate never replaces the champion, a promotion is never silent, and the same trigger event never starts two cycles.
 */

export const STEP_ORDER: StepId[] = ["trigger", "pin", "quality", "admission", "train", "evaluate", "gates", "approval", "shadow", "canary", "promote"];
export const STEP_LABEL: Record<StepId, string> = {
  trigger: "Trigger", pin: "Pin dataset version", quality: "Data quality gate", admission: "Admission", train: "Train", evaluate: "Evaluate against the champion",
  gates: "Model gates", approval: "Approval", shadow: "Shadow", canary: "Canary", promote: "Promote",
};
export const TRIGGER_LABEL: Record<Trigger["kind"], string> = {
  "dataset-version": "New dataset version", rows: "Enough new rows", "stream-window": "Stream window closes", schedule: "Schedule", drift: "Drift or decay", manual: "Manual",
};
export const APPROVAL_LABEL: Record<Approval, string> = { person: "One person approves", "two-people": "Two different people approve", automatic: "Automatic, by policy" };

export type Issue = { path: string; message: string; level: "error" | "warning" };

const CRON = /^\s*(\S+\s+){4}\S+\s*$/;

export function validatePolicy(p: Pick<CtPolicy, "name" | "model" | "source" | "triggers" | "window" | "gates" | "approval" | "tier" | "budget" | "maxCyclesPerDay">): Issue[] {
  const out: Issue[] = []; const err = (path: string, message: string) => out.push({ path, message, level: "error" }); const warn = (path: string, message: string) => out.push({ path, message, level: "warning" });
  if (!/^[a-z][a-z0-9-]{2,60}$/.test(p.name)) err("name", "Use 3 to 61 lowercase letters, digits or hyphens, starting with a letter.");
  if (!p.model.trim()) err("model", "Choose the registered model this policy keeps fresh.");
  if (!p.source.trim()) err("source", "Choose the Refinery dataset the model learns from.");
  if (p.triggers.length === 0) err("triggers", "Add at least one trigger.");
  p.triggers.forEach((t, i) => {
    if (t.kind === "rows" && !(t.minRows && t.minRows >= 1)) err(`triggers.${i}`, "Say how many new rows are enough.");
    if (t.kind === "schedule" && !CRON.test(t.detail)) err(`triggers.${i}`, "A schedule is five fields, for example 0 2 * * 1.");
    if (t.kind === "drift" && !t.detail.trim()) err(`triggers.${i}`, "Name the alert that starts a cycle.");
  });
  if (new Set(p.triggers.map((t) => t.kind)).size !== p.triggers.length) err("triggers", "Each kind of trigger appears once.");
  if (!(p.window.value >= 1)) err("window", "The training window must be at least 1.");
  if (!p.gates.metric.trim()) err("gates.metric", "Name the metric the candidate must reach.");
  if (!Number.isFinite(p.gates.floor)) err("gates.floor", "Set the lowest value the metric may have.");
  if (!(p.gates.maxMemoryGb > 0)) err("gates.maxMemoryGb", "Set a memory limit for the candidate when it is served.");
  if (!(p.gates.maxP95Ms > 0)) err("gates.maxP95Ms", "Set a latency limit for the candidate when it is served.");
  if (!(p.gates.maxFairnessGap >= 0)) err("gates.maxFairnessGap", "The fairness gap limit cannot be negative.");
  if (!(p.budget.monthlyUsd > 0)) err("budget", "Set a monthly budget so a noisy source cannot spend the month.");
  if (!(p.maxCyclesPerDay >= 1 && p.maxCyclesPerDay <= 24)) err("maxCyclesPerDay", "Allow between 1 and 24 cycles a day.");
  if (p.approval === "automatic" && p.tier !== "low") err("approval", "Automatic approval is only for a model tier the organization marks low risk. It still writes the evidence record.");
  if (p.tier === "high" && p.approval !== "two-people") warn("approval", "A high risk model usually needs two different people to approve.");
  if (!p.gates.noSliceRegression) warn("gates.noSliceRegression", "Without the slice check a model can get better on average and worse for one group.");
  return out;
}

/** Whether a trigger event should start a cycle for this policy. */
export function matches(p: CtPolicy, e: TriggerEvent): { ok: boolean; reason?: string } {
  if (p.state !== "active") return { ok: false, reason: p.state === "paused" ? "The policy is paused." : "The policy is a draft." };
  const t = p.triggers.find((x) => x.kind === e.kind);
  if (!t) return { ok: false, reason: `This policy does not listen for ${TRIGGER_LABEL[e.kind].toLowerCase()}.` };
  if (t.kind === "rows" && e.rows < (t.minRows ?? 0)) return { ok: false, reason: `${e.rows.toLocaleString("en-US")} new rows is below the minimum of ${(t.minRows ?? 0).toLocaleString("en-US")}.` };
  return { ok: true };
}

export function gateResults(p: CtPolicy, c: Candidate): GateResult[] {
  const g = p.gates; const worst = c.sliceDeltas.reduce((m, s) => (s.delta < m.delta ? s : m), { slice: "", delta: 0 });
  const out: GateResult[] = [
    { id: "metric", label: `${g.metric} at ${LOWER_IS_BETTER.has(g.metric) ? "most" : "least"} ${g.floor}`, passed: atLeastAsGood(g.metric, c.metric, g.floor), detail: `Candidate ${c.metric.toFixed(3)}, champion ${p.champion.metric.toFixed(3)}` },
    { id: "champion", label: "Not worse than the champion", passed: atLeastAsGood(g.metric, c.metric, p.champion.metric), detail: `${c.metric >= p.champion.metric ? "+" : ""}${(c.metric - p.champion.metric).toFixed(3)} against version ${p.champion.version}` },
  ];
  if (g.noSliceRegression) out.push({ id: "slices", label: "No slice gets worse", passed: worst.delta >= -0.005, detail: worst.slice ? `Worst slice ${worst.slice}, ${worst.delta >= 0 ? "+" : ""}${worst.delta.toFixed(3)}` : "No slices defined" });
  out.push(
    { id: "fairness", label: `Fairness gap at most ${g.maxFairnessGap}`, passed: c.fairnessGap <= g.maxFairnessGap, detail: `Gap ${c.fairnessGap.toFixed(3)}` },
    { id: "memory", label: `Serving memory at most ${g.maxMemoryGb} GB`, passed: c.peakMemGb <= g.maxMemoryGb, detail: `${c.peakMemGb.toFixed(1)} GB` },
    { id: "latency", label: `p95 latency at most ${g.maxP95Ms} ms`, passed: c.p95Ms <= g.maxP95Ms, detail: `${c.p95Ms} ms` },
  );
  return out;
}

export const approvalsNeeded = (a: Approval) => (a === "two-people" ? 2 : a === "person" ? 1 : 0);

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const unit = (s: string) => (hash(s) % 10000) / 10000;

/** A simulated candidate. In the sample workspace training is not run: the figures come from a seeded model of a plausible result. */
export function simulateCandidate(p: CtPolicy, e: TriggerEvent): Candidate {
  const r = (k: string) => unit(`${p.id}:${e.id}:${k}`);
  const lift = (r("lift") - 0.3) * 0.03 + Math.min(0.01, e.rows / 5_000_000);
  const metric = Math.round((p.champion.metric + (LOWER_IS_BETTER.has(p.gates.metric) ? -lift : lift)) * 1000) / 1000;
  const slices = ["billing", "shipping", "account", "returns"].map((s) => ({ slice: s, delta: Math.round(((r(s) - 0.25) * 0.04) * 1000) / 1000 }));
  return { metric, sliceDeltas: slices, fairnessGap: Math.round((0.012 + r("fair") * 0.03) * 1000) / 1000, peakMemGb: Math.round((8 + r("mem") * 12) * 10) / 10, p95Ms: Math.round(38 + r("lat") * 52) };
}

export type CycleContext = { existing: Cycle[]; now: number; actor: string; cyclesToday: number };

export type StartResult = { ok: true; cycle: Cycle } | { ok: false; error: string; existing?: Cycle };

/**
 * Runs a cycle as far as it can go without a person. It stops at the first failed step (the champion stays), or at approval, or finishes when the
 * policy approves automatically. The same event never starts two cycles.
 */
export function startCycle(p: CtPolicy, e: TriggerEvent, ctx: CycleContext): StartResult {
  const dup = ctx.existing.find((c) => c.policyId === p.id && c.event.id === e.id);
  if (dup) return { ok: false, error: "This event already started a cycle.", existing: dup };
  const m = matches(p, e); if (!m.ok) return { ok: false, error: m.reason! };
  if (ctx.cyclesToday >= p.maxCyclesPerDay) return { ok: false, error: `The policy already ran ${ctx.cyclesToday} cycle${ctx.cyclesToday === 1 ? "" : "s"} today. The limit is ${p.maxCyclesPerDay}.` };
  const iso = new Date(ctx.now).toISOString();
  const steps: CycleStep[] = STEP_ORDER.map((id) => ({ id, state: "pending", detail: "" }));
  const set = (id: StepId, state: CycleStep["state"], detail: string) => { const s = steps.find((x) => x.id === id)!; s.state = state; s.detail = detail; };
  const cycle: Cycle = { id: `cyc-${hash(`${p.id}:${e.id}`).toString(36)}`, policyId: p.id, event: e, startedAt: iso, steps, decision: "running", gates: [], approvals: [], costUsd: 0 };
  const stop = (from: StepId, decision: Cycle["decision"], reason: string) => { for (const s of steps) if (STEP_ORDER.indexOf(s.id) > STEP_ORDER.indexOf(from) && s.state === "pending") s.state = "skipped"; cycle.decision = decision; cycle.reason = reason; return { ok: true as const, cycle }; };

  set("trigger", "passed", `${TRIGGER_LABEL[e.kind]}: ${e.detail}`);
  set("pin", "passed", `${p.source} version ${e.datasetVersion}, ${e.rows.toLocaleString("en-US")} rows, window ${p.window.kind} ${p.window.value}`);
  if (!e.schemaOk || !e.piiFree || e.quality < 0.9) {
    const why = !e.schemaOk ? "The schema changed from the one the model was trained on." : !e.piiFree ? "Personal data was found in a column that is not allowed." : `The quality score ${e.quality.toFixed(2)} is below 0.90.`;
    set("quality", "failed", why); return stop("quality", "failed-early", `${why} The champion stays and the owner is told.`);
  }
  set("quality", "passed", `Quality score ${e.quality.toFixed(2)}, schema matches, no personal data`);
  const left = p.budget.monthlyUsd - p.budget.spentUsd; const need = 18 + Math.round(e.rows / 10_000);
  if (need > left) { set("admission", "failed", `The cycle needs about $${need} and $${Math.max(0, left).toFixed(0)} is left in the monthly budget.`); return stop("admission", "failed-early", "The budget does not cover this cycle. The champion stays."); }
  set("admission", "passed", `Policy, quota and budget allow it. About $${need} of $${left.toFixed(0)} left`);
  cycle.costUsd = need;
  const cand = simulateCandidate(p, e); cycle.candidate = cand;
  set("train", "passed", `Trained on ${e.rows.toLocaleString("en-US")} rows`);
  set("evaluate", "passed", `${p.gates.metric} ${cand.metric.toFixed(3)} against ${p.champion.metric.toFixed(3)} for the champion on the same slices`);
  cycle.gates = gateResults(p, cand);
  const bad = cycle.gates.filter((g) => !g.passed);
  if (bad.length) { set("gates", "failed", bad.map((g) => g.label).join("; ")); return stop("gates", "kept-champion", `${bad[0].label}. ${bad[0].detail}. The champion stays.`); }
  set("gates", "passed", `${cycle.gates.length} of ${cycle.gates.length} gates passed`);
  if (p.approval === "automatic") {
    set("approval", "passed", "Approved by policy. The evidence record is written.");
    set("shadow", "passed", "Shadow traffic matched the champion's answers within tolerance");
    set("canary", "passed", "5 percent of traffic for 30 minutes, no regression");
    set("promote", "passed", `Version ${p.champion.version + 1} is the champion`);
    cycle.decision = "promoted"; return { ok: true, cycle };
  }
  set("approval", "waiting", `Waiting for ${approvalsNeeded(p.approval) === 2 ? "two different people" : "one person"}`);
  cycle.decision = "awaiting-approval"; return { ok: true, cycle };
}

export type DecideResult = { ok: true; cycle: Cycle; promoted: boolean } | { ok: false; error: string };

/** Records one approval or a rejection. Two-person policies need two different people, and nobody approves a cycle they started by hand. */
export function decideCycle(p: CtPolicy, c: Cycle, decision: "approve" | "reject", by: string, now: number, note?: string): DecideResult {
  if (c.decision !== "awaiting-approval") return { ok: false, error: `This cycle is already ${c.decision.replace(/-/g, " ")}.` };
  const iso = new Date(now).toISOString();
  const steps = c.steps.map((s) => ({ ...s }));
  const set = (id: StepId, state: CycleStep["state"], detail: string) => { const s = steps.find((x) => x.id === id)!; s.state = state; s.detail = detail; };
  if (decision === "reject") {
    if (!note?.trim()) return { ok: false, error: "Say why the candidate is rejected." };
    set("approval", "failed", `Rejected by ${by}: ${note.trim()}`);
    for (const s of steps) if (s.state === "pending") s.state = "skipped";
    return { ok: true, promoted: false, cycle: { ...c, steps, decision: "rejected", reason: `Rejected by ${by}: ${note.trim()}. The champion stays.` } };
  }
  if (c.event.by && c.event.by === by) return { ok: false, error: "The person who started this cycle by hand cannot approve it." };
  if (c.approvals.some((a) => a.by === by)) return { ok: false, error: "You already approved this candidate. A second, different person is needed." };
  const approvals = [...c.approvals, { by, at: iso }];
  const need = approvalsNeeded(p.approval);
  if (approvals.length < need) {
    set("approval", "waiting", `${approvals.length} of ${need} approvals. Waiting for one more person.`);
    return { ok: true, promoted: false, cycle: { ...c, steps, approvals } };
  }
  set("approval", "passed", `Approved by ${approvals.map((a) => a.by).join(" and ")}`);
  set("shadow", "running", "Shadow traffic started through Deployments");
  set("canary", "pending", "Starts when shadow passes");
  set("promote", "pending", "Starts when the canary passes");
  return { ok: true, promoted: true, cycle: { ...c, steps, approvals, decision: "in-rollout", reason: "Approved. Shadow and canary run in Deployments, and the version is promoted only if they pass." } };
}
