"use client";

/**
 * Client store for the Functions design preview. It always serves the generated sample workspace, in demo mode and in live mode,
 * because Functions has no backend yet. Edits live in memory for the session and are labelled as simulated everywhere they appear.
 */
import { useSyncExternalStore } from "react";
import { APPS } from "./catalog";
import { FN_TRANSITIONS, type FnFunction, type FnRevision, type FnStatus, type FnTrigger, type FunctionsState, type Governance, type Workflow, type WfStep } from "./types";
import { DAY, anchorNow, buildFunctions } from "./ledger";
import { FN_NAME_RE, validateWorkflow } from "./store-rules";

export { FN_NAME_RE, validateWorkflow };

export type Scenario = "sample" | "empty" | "error" | "slow";
export const SCENARIO_LABEL: Record<Scenario, string> = { sample: "Sample data", empty: "Empty workspace", error: "Load error", slow: "Slow load" };

type Phase = "loading" | "ready" | "error";
type Snapshot = { phase: Phase; scenario: Scenario; state: FunctionsState | null; error?: string; version: number };

let snap: Snapshot = { phase: "loading", scenario: "sample", state: null, version: 0 };
let full: FunctionsState | null = null;
let started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (next: Partial<Snapshot>) => { snap = { ...snap, ...next, version: snap.version + 1 }; emit(); };

function emptyState(anchor: number): FunctionsState {
  const base = buildFunctions(anchor);
  return { ...base, functions: [], revisions: [], deployments: [], triggers: [], executions: [], workflows: [], runs: [], usage: [] };
}

function load(scenario: Scenario) {
  set({ phase: "loading", scenario, error: undefined });
  const delay = scenario === "slow" ? 2600 : 380;
  setTimeout(() => {
    if (snap.scenario !== scenario) return;
    if (scenario === "error") { set({ phase: "error", error: "The Functions service did not answer (simulated error for design review).", state: null }); return; }
    const a = anchorNow();
    if (!full) full = buildFunctions(a);
    set({ phase: "ready", state: scenario === "empty" ? emptyState(a) : full });
  }, delay);
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  let sc: Scenario = "sample";
  try { const q = new URLSearchParams(window.location.search).get("fx"); if (q === "empty" || q === "error" || q === "slow") sc = q; } catch { /* default */ }
  load(sc);
}

export function useFunctions(): Snapshot {
  const s = useSyncExternalStore((l) => { listeners.add(l); return () => void listeners.delete(l); }, () => snap, () => snap);
  if (typeof window !== "undefined") queueMicrotask(start);
  return s;
}

export const functionsStore = {
  scenario: () => snap.scenario,
  setScenario: (s: Scenario) => load(s),
  reload: () => load(snap.scenario),
  resetSample: () => { full = null; load(snap.scenario); },
};

// ---------------------------------------------------------------------------------------------- simulated edits

type Result<T = {}> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function mutate(fn: (s: FunctionsState) => void) {
  if (!snap.state) return;
  // Work on the shared copy so every screen sees the same edit, and keep the empty scenario separate.
  const target = snap.scenario === "empty" ? snap.state : full ?? snap.state;
  fn(target);
  // A new top-level object, so components that memoise on the state recompute.
  const next = { ...target };
  if (snap.scenario !== "empty") full = next;
  set({ state: next });
}

const nowIso = () => new Date().toISOString();

export type NewFunctionInput = {
  name: string; description: string; tenantId: string; appId: string; owner: string; env: FnFunction["env"]; runtime: FnFunction["runtime"]; handler: string; memoryMb: number; ephemeralMb: number;
  tags: string[]; artifact: FnRevision["artifact"]; governance: Governance; triggers: Omit<FnTrigger, "id" | "fnId">[]; lambda?: FnFunction["lambda"]; deploy: boolean;
};


export function createFunction(input: NewFunctionInput): Result<{ id: string }> {
  const s = snap.state; if (!s) return fail("Functions are not loaded yet.");
  if (!FN_NAME_RE.test(input.name)) return fail("Use 3 to 48 characters: lowercase letters, digits and hyphens, starting with a letter.");
  if (s.functions.some((f) => f.name === input.name && f.tenantId === input.tenantId)) return fail(`A function named ${input.name} already exists in this tenant.`);
  const id = `fn-${input.name}`; const t = nowIso();
  mutate((st) => {
    st.functions.unshift({
      id, name: input.name, description: input.description, kind: input.lambda ? "lambda-proxy" : "managed", tenantId: input.tenantId, appId: input.appId, owner: input.owner, team: "Your team", env: input.env, runtime: input.runtime, handler: input.handler,
      memoryMb: input.memoryMb, ephemeralMb: input.ephemeralMb, status: input.deploy ? "deploying" : "draft", tags: input.tags, createdAt: t, updatedAt: t, activeRevision: null, latestRevision: 1, governance: input.governance, lambda: input.lambda,
    });
    st.revisions.push({ id: `${id}:r1`, fnId: id, number: 1, createdAt: t, createdBy: input.owner, note: "Initial version", artifact: input.artifact, status: "draft" });
    input.triggers.forEach((tr, i) => st.triggers.push({ ...tr, id: `trg-${id}-${tr.kind}-${i}`, fnId: id }));
    if (input.deploy) st.deployments.unshift({ id: `dep-${id}-1`, fnId: id, revision: 1, env: input.env === "production" ? "staging" : input.env, status: "in-progress", startedAt: t, durationS: 0, by: input.owner, note: "Simulated in the design preview. Nothing is deployed.", traffic: 0 });
  });
  return { ok: true, id };
}

export function transitionFunction(id: string, to: FnStatus): Result {
  const f = snap.state?.functions.find((x) => x.id === id); if (!f) return fail("Function not found.");
  if (!FN_TRANSITIONS[f.status].includes(to)) return fail(`A ${f.status} function cannot become ${to}.`);
  if (to === "deploying" && f.latestRevision < 1) return fail("There is no revision to deploy.");
  mutate((st) => {
    const x = st.functions.find((y) => y.id === id)!; x.status = to; x.updatedAt = nowIso(); x.statusReason = to === "disabled" ? "Disabled from the console (simulated)." : undefined;
    if (to === "deploying") st.deployments.unshift({ id: `dep-${id}-${Date.now()}`, fnId: id, revision: x.latestRevision, env: "staging", status: "in-progress", startedAt: nowIso(), durationS: 0, by: x.owner, note: "Simulated in the design preview. Nothing is deployed.", traffic: 0 });
  });
  return { ok: true };
}

/** Completes a simulated deployment. The record says it was simulated. */
export function settleDeployment(id: string, outcome: "active" | "failed"): Result {
  const f = snap.state?.functions.find((x) => x.id === id); if (!f) return fail("Function not found.");
  if (f.status !== "deploying") return fail("Only a deploying function can be settled.");
  mutate((st) => {
    const x = st.functions.find((y) => y.id === id)!; x.status = outcome; x.updatedAt = nowIso();
    if (outcome === "active") { x.activeRevision = x.latestRevision; x.statusReason = undefined; } else x.statusReason = "Simulated failure: the build step returned an error.";
    const d = st.deployments.find((y) => y.fnId === id && y.status === "in-progress"); if (d) { d.status = outcome === "active" ? "succeeded" : "failed"; d.durationS = 31; d.error = outcome === "failed" ? "Simulated failure." : undefined; d.traffic = outcome === "active" ? 100 : 0; }
    const r = st.revisions.find((y) => y.fnId === id && y.number === x.latestRevision); if (r) r.status = outcome === "active" ? "active" : "failed";
  });
  return { ok: true };
}

export function updateGovernance(id: string, g: Governance): Result {
  if (g.maxCostMicros < 0 || g.dailyBudgetMicros < g.maxCostMicros) return fail("The daily budget must be at least the per-invocation ceiling.");
  if (g.timeoutS < 1 || g.timeoutS > 900) return fail("Timeout must be between 1 and 900 seconds.");
  if (g.allowedModels.length === 0 && g.allowedProviders.length > 0) return fail("Choose at least one model for the allowed providers, or clear the providers.");
  mutate((st) => { const x = st.functions.find((y) => y.id === id); if (x) { x.governance = g; x.updatedAt = nowIso(); } });
  return { ok: true };
}

export function setTriggerEnabled(id: string, enabled: boolean) { mutate((st) => { const t = st.triggers.find((x) => x.id === id); if (t) t.enabled = enabled; }); }

export function createWorkflow(input: { name: string; description: string; tenantId: string; appId: string; owner: string; kind: "http" | "kafka" | "schedule" }): Result<{ id: string }> {
  const s = snap.state; if (!s) return fail("Functions are not loaded yet.");
  if (!FN_NAME_RE.test(input.name)) return fail("Use 3 to 48 characters: lowercase letters, digits and hyphens, starting with a letter.");
  if (s.workflows.some((w) => w.name === input.name)) return fail(`A workflow named ${input.name} already exists.`);
  const id = `wf-${input.name}`; const t = nowIso();
  mutate((st) => {
    st.workflows.unshift({
      id, name: input.name, description: input.description, status: "draft", tenantId: input.tenantId, appId: input.appId, owner: input.owner, activeRevision: null, latestRevision: 1,
      revisions: [{ number: 1, createdAt: t, createdBy: input.owner, note: "First draft", status: "draft" }], trigger: { kind: input.kind, summary: input.kind === "http" ? `POST /v1/workflows/${input.name}/runs` : input.kind === "kafka" ? "Choose a topic" : "Choose a schedule" },
      steps: [{ id: "s1", kind: "trigger", name: input.kind === "schedule" ? "On a schedule" : input.kind === "kafka" ? "Event received" : "Request received", config: { source: input.kind }, next: "s2" }, { id: "s2", kind: "output", name: "Result", config: { emit: `${input.name}.done` }, next: null }],
      policyIds: ["pol-models", "pol-budget"], maxCostMicros: 20_000, timeoutS: 300, useCase: "", updatedAt: t,
    });
  });
  return { ok: true, id };
}

export function saveWorkflow(id: string, steps: WfStep[], patch?: Partial<Pick<Workflow, "description" | "maxCostMicros" | "timeoutS" | "policyIds">>): Result<{ revision: number }> {
  const w = snap.state?.workflows.find((x) => x.id === id); if (!w) return fail("Workflow not found.");
  const problems = validateWorkflow(steps); if (problems.length) return fail(problems[0]);
  let rev = 0;
  mutate((st) => {
    const x = st.workflows.find((y) => y.id === id)!; x.steps = steps; Object.assign(x, patch ?? {}); x.latestRevision += 1; rev = x.latestRevision; x.updatedAt = nowIso();
    x.revisions.forEach((r) => { if (r.status === "draft") r.status = "superseded"; });
    x.revisions.push({ number: rev, createdAt: nowIso(), createdBy: x.owner, note: "Saved from the editor (simulated)", status: "draft" });
  });
  return { ok: true, revision: rev };
}

export function setWorkflowStatus(id: string, to: "active" | "disabled" | "draft"): Result {
  const w = snap.state?.workflows.find((x) => x.id === id); if (!w) return fail("Workflow not found.");
  if (to === "active") { const p = validateWorkflow(w.steps); if (p.length) return fail(p[0]); }
  mutate((st) => { const x = st.workflows.find((y) => y.id === id)!; x.status = to; if (to === "active") { x.activeRevision = x.latestRevision; x.revisions.forEach((r) => { if (r.number === x.latestRevision) r.status = "active"; else if (r.status === "active") r.status = "superseded"; }); } x.updatedAt = nowIso(); });
  return { ok: true };
}

export const appName = (id: string) => APPS.find((a) => a.id === id)?.name ?? id;
export const daysAgo = (n: number) => Date.now() - n * DAY;

export function updateConfiguration(id: string, patch: { handler: string; memoryMb: number; ephemeralMb: number; description: string; tags: string[] }): Result<{ revision: number }> {
  const f = snap.state?.functions.find((x) => x.id === id); if (!f) return fail("Function not found.");
  if (!patch.handler.trim()) return fail("A handler is required.");
  if (patch.memoryMb < 128 || patch.memoryMb > 10240) return fail("Memory must be between 128 and 10240 MB.");
  if (patch.ephemeralMb < 512 || patch.ephemeralMb > 10240) return fail("Ephemeral storage must be between 512 and 10240 MB.");
  let rev = 0;
  mutate((st) => {
    const x = st.functions.find((y) => y.id === id)!; x.handler = patch.handler.trim(); x.memoryMb = patch.memoryMb; x.ephemeralMb = patch.ephemeralMb; x.description = patch.description; x.tags = patch.tags; x.latestRevision += 1; rev = x.latestRevision; x.updatedAt = nowIso();
    const prev = st.revisions.filter((r) => r.fnId === id).sort((a, b) => b.number - a.number)[0];
    st.revisions.push({ id: `${id}:r${rev}`, fnId: id, number: rev, createdAt: nowIso(), createdBy: x.owner, note: "Configuration change (simulated)", artifact: prev ? { ...prev.artifact } : { kind: "inline", ref: "inline", sizeKb: 0, digest: "sha256:0" }, status: "draft" });
  });
  return { ok: true, revision: rev };
}

export function rollbackTo(id: string, revision: number): Result {
  const f = snap.state?.functions.find((x) => x.id === id); if (!f) return fail("Function not found.");
  if (f.status !== "active") return fail("Only an active function can be rolled back.");
  const r = snap.state!.revisions.find((x) => x.fnId === id && x.number === revision); if (!r) return fail("That revision does not exist.");
  if (r.status === "failed") return fail("A revision that failed to deploy cannot be rolled back to.");
  if (f.activeRevision === revision) return fail("That revision is already active.");
  mutate((st) => {
    const x = st.functions.find((y) => y.id === id)!; const from = x.activeRevision; x.activeRevision = revision; x.updatedAt = nowIso();
    st.revisions.forEach((y) => { if (y.fnId === id) { if (y.number === revision) y.status = "active"; else if (y.status === "active") y.status = "superseded"; } });
    st.deployments.unshift({ id: `dep-${id}-rb-${Date.now()}`, fnId: id, revision, env: "production", status: "succeeded", startedAt: nowIso(), durationS: 12, by: x.owner, note: `Rollback from r${from} (simulated)`, traffic: 100 });
  });
  return { ok: true };
}

export function addTrigger(t: Omit<FnTrigger, "id">): Result<{ id: string }> {
  const f = snap.state?.functions.find((x) => x.id === t.fnId); if (!f) return fail("Function not found.");
  if (t.kind === "kafka") {
    const k = t.kafka!; if (!/^[a-zA-Z0-9._-]{1,249}$/.test(k.topic)) return fail("Topic names use letters, digits, dots, hyphens and underscores.");
    if (!k.group.trim()) return fail("A consumer group is required.");
    if (k.concurrency < 1 || k.concurrency > f.governance.maxConcurrency) return fail(`Concurrency must be between 1 and the function limit of ${f.governance.maxConcurrency}.`);
  }
  if (t.kind === "schedule") {
    const c = t.schedule!; if (c.cron.trim().split(/\s+/).length !== 5) return fail("A cron expression has five fields, for example 0 6 * * *.");
  }
  if (t.kind === "http" && !t.http!.path.startsWith("/")) return fail("The path must start with a slash.");
  const id = `trg-${t.fnId}-${t.kind}-${Date.now().toString(36)}`;
  mutate((st) => { st.triggers.push({ ...t, id }); });
  return { ok: true, id };
}

export function removeTrigger(id: string) { mutate((st) => { st.triggers = st.triggers.filter((x) => x.id !== id); }); }

/** A human decision on a paused workflow run. Simulated: it changes the record in this session only. */
export function decideApproval(runId: string, decision: "approved" | "rejected", who: string): Result {
  const r = snap.state?.runs.find((x) => x.id === runId); if (!r) return fail("Run not found.");
  if (r.status !== "waiting-approval" || !r.approval) return fail("This run is not waiting for a decision.");
  mutate((st) => {
    const x = st.runs.find((y) => y.id === runId)!; const t = nowIso();
    x.approval = { ...x.approval!, approver: who, decidedAt: t, decision };
    x.status = decision === "approved" ? "succeeded" : "rejected";
    const i = x.steps.findIndex((s) => s.kind === "approval" && s.status === "waiting");
    if (i >= 0) {
      x.steps[i] = { ...x.steps[i], status: "succeeded", detail: `${decision === "approved" ? "Approved" : "Rejected"} by ${who} (simulated)`, durationMs: Math.max(0, new Date(t).getTime() - new Date(x.approval!.requestedAt).getTime()) };
      const tail = x.steps.slice(i + 1).map((s) => ({ ...s, status: (decision === "approved" ? "succeeded" : "skipped") as typeof s.status }));
      x.steps = [...x.steps.slice(0, i + 1), ...tail];
    }
    x.durationMs = Math.max(0, new Date(t).getTime() - new Date(x.startedAt).getTime());
  });
  return { ok: true };
}
