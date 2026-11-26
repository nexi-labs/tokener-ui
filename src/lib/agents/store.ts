"use client";

import { useSyncExternalStore } from "react";
import { sampleAgents, sampleTopology, sampleWorkflows } from "./sample";
import { sampleTraces } from "./sample-traces";
import { sampleHub } from "./hub";
import { sampleSpaces, validateSpace, type Space, type SpaceIssue } from "./context";
import { NOTIFY_SERVER, notifyGrant, validateBindings, type Binding, type Hub, type Issue as BindingIssue } from "./connectors";
import { decide as decideApproval, sampleApprovals, type Approval, type Outcome } from "./approvals";
import { sampleEvals, runSuite, type EvalRun, type EvalSuite, type EvalCase } from "./evals";
import { applyRetention, memoryGrants, sampleMemoryItems, validateMemory, MEMORY_SERVER, KIND_BY_ID, type MemoryConfig, type MemoryItem, type MemoryKind } from "./memory";
import { DEFAULT_ACCESS, canExpose, gatewayUrl, makeKey, makeSigningSecret, signingRef, validateAccess, type Access, type ApiKey, type KeyScope } from "./access";
import { RUNTIME_BY_ID, defaultExecution, validateExecution, type Execution, type ExecIssue, type RuntimeKind } from "./execution";
import { getSimNow } from "./loadsim";
import type { SwitchEvent } from "./autoswitch";
import { planSwitch, rollbackNote, switchNote, type Plan, type Strategy } from "./switching";
import type { Exposure, Link, Live, Policy } from "./topology";
import type { Agent, AgentState, ControlLevel, Trace, Workflow, WorkflowPattern } from "./types";
import type { ForgeSpec } from "./codegen";
import { validateSpec } from "./codegen";

/**
 * In memory store behind the Agent OS screens in the sample workspace. It lives only in this browser tab and starts again from the sample on reload.
 * A signed-in workspace does not use it: those screens say they are not connected until the agent registry API exists (docs/47, section 7).
 */
export type AgentsState = { agents: Agent[]; traces: Trace[]; workflows: Workflow[]; links: Link[]; exposures: Exposure[]; policies: Policy[]; live: Record<string, Live>; evalSuites: EvalSuite[]; evalRuns: EvalRun[]; memoryItems: Record<string, MemoryItem[]>; approvals: Approval[]; spaces: Space[] };
export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };

let state: AgentsState | null = null;
const listeners = new Set<() => void>();
let seq = 500;
const nid = (p: string) => `${p}_${(++seq).toString(36)}`;
const init = (): AgentsState => {
  const { agents } = sampleAgents(); const topo = sampleTopology(); const ev = sampleEvals(agents);
  const traces = [...sampleTraces(agents, topo.links, Date.now(), sampleHub()), ...ev.traces].sort((x, y) => Date.parse(y.startedAt) - Date.parse(x.startedAt));
  return { agents, traces, workflows: sampleWorkflows(), ...topo, evalSuites: ev.suites, evalRuns: ev.runs, memoryItems: sampleMemoryItems(), approvals: sampleApprovals(), spaces: sampleSpaces() };
};
const get = (): AgentsState => (state ??= init());
function set(patch: Partial<AgentsState>) { state = { ...get(), ...patch }; listeners.forEach((l) => l()); }
/** The current state, for code that is not a component, such as the in-product shell. */
export const agentsNow = (): AgentsState => get();
export function useAgents(): AgentsState { return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, get, get); }
export const resetAgents = () => { state = init(); listeners.forEach((l) => l()); };
const patchAgent = (id: string, fn: (a: Agent) => Agent) => set({ agents: get().agents.map((a) => (a.id === id ? fn(a) : a)) });

const SENSITIVE = /refund|merge|delete|update_|post_|create_claim|reset_password|payout|transfer|write|issue_/;

export const agents = {
  /** Agent Forge saves here. The agent is governed from the start because it is built to call everything through the gateway. */
  createFromForge(spec: ForgeSpec): Result<Agent> {
    const issues = validateSpec(spec);
    if (issues.length) return { ok: false, error: issues[0].message };
    if (get().agents.some((a) => a.name === spec.name && a.state !== "retired")) return { ok: false, error: `An agent named ${spec.name} already exists. Choose another name, or retire the old one first.` };
    const now = new Date().toISOString();
    const a: Agent = {
      id: nid("agt"), name: spec.name, title: spec.title, description: spec.description, owner: spec.owner, department: spec.department || "Unassigned", project: spec.project || undefined, framework: spec.framework, runtime: "cloud", environment: "development",
      risk: spec.tools.some((t) => t.allow.some((x) => SENSITIVE.test(x))) ? "high" : "low", version: spec.version, state: "active", control: "governed", origin: "forge", models: [spec.model],
      tools: spec.tools.flatMap((t) => t.allow.map((tool) => ({ server: t.server, tool, sensitive: SENSITIVE.test(tool), approval: spec.guardrails.approvalFor.includes(tool) }))),
      capabilities: spec.capabilities.map((c) => c.id), budget: { monthlyUsd: spec.budget.monthlyUsd, spentUsd: 0 },
      daily: Array.from({ length: 30 }, () => ({ executions: 0, failures: 0, costUsd: 0, tokens: 0 })), p95Ms: 0, lastSeen: now, createdAt: now,
      versions: [{ version: spec.version, at: now, note: "Created in Agent Forge" }], spec, execution: spec.execution ?? defaultExecution("serverless"),
    };
    set({ agents: [a, ...get().agents] });
    return { ok: true, value: a };
  },
  /** Saving an agent again from Agent Forge records a new version. */
  updateFromForge(id: string, spec: ForgeSpec): Result<Agent> {
    const issues = validateSpec(spec);
    if (issues.length) return { ok: false, error: issues[0].message };
    const cur = get().agents.find((a) => a.id === id);
    if (!cur || cur.origin !== "forge") return { ok: false, error: "Only an agent built in Agent Forge can be changed here." };
    if (spec.name !== cur.name) return { ok: false, error: "The name is the agent's address and cannot change. Create a new agent instead." };
    if (spec.version === cur.version) return { ok: false, error: "Change the version number before saving, so the earlier version stays on record." };
    const now = new Date().toISOString();
    patchAgent(id, (a) => ({ ...a, title: spec.title, description: spec.description, owner: spec.owner, department: spec.department || a.department, project: spec.project || undefined, version: spec.version, framework: spec.framework, models: [spec.model], spec,
      tools: spec.tools.flatMap((t) => t.allow.map((tool) => ({ server: t.server, tool, sensitive: SENSITIVE.test(tool), approval: spec.guardrails.approvalFor.includes(tool) }))),
      capabilities: spec.capabilities.map((c) => c.id), budget: { ...a.budget, monthlyUsd: spec.budget.monthlyUsd }, versions: [{ version: spec.version, at: now, note: "Saved from Agent Forge" }, ...a.versions.map((v) => (v.note === "Current" ? { ...v, note: "Earlier release" } : v))] }));
    return { ok: true, value: get().agents.find((a) => a.id === id)! };
  },
  register(input: { name: string; title: string; description: string; owner: string; department: string; project?: string; framework: string; endpoint: string; control: ControlLevel; risk: Agent["risk"] }): Result<Agent> {
    if (!/^[a-z][a-z0-9-]{1,62}$/.test(input.name)) return { ok: false, error: "Use 2 to 63 lowercase letters, digits and hyphens for the name." };
    if (!input.owner.trim()) return { ok: false, error: "Every agent has an accountable owner." };
    if (!input.department.trim()) return { ok: false, error: "Choose the department this agent belongs to, so its cost and access land in the right place." };
    if (get().agents.some((a) => a.name === input.name && a.state !== "retired")) return { ok: false, error: `An agent named ${input.name} already exists.` };
    const now = new Date().toISOString();
    const a: Agent = {
      id: nid("agt"), name: input.name, title: input.title || input.name, description: input.description, owner: input.owner, department: input.department, project: input.project || undefined, framework: input.framework, runtime: "external",
      environment: "production", risk: input.risk, version: "1", state: "active", control: input.control, origin: "registered", models: [], tools: [], capabilities: [], budget: { monthlyUsd: 0, spentUsd: 0 },
      daily: Array.from({ length: 30 }, () => ({ executions: 0, failures: 0, costUsd: 0, tokens: 0 })), p95Ms: 0, lastSeen: now, createdAt: now, versions: [{ version: "1", at: now, note: "Registered" }], endpoint: input.endpoint,
    };
    set({ agents: [a, ...get().agents] });
    return { ok: true, value: a };
  },
  setState(id: string, next: AgentState): Result {
    const a = get().agents.find((x) => x.id === id);
    if (!a) return { ok: false, error: "That agent does not exist." };
    if (a.state === "retired") return { ok: false, error: "A retired agent cannot be changed." };
    patchAgent(id, (x) => ({ ...x, state: next }));
    return { ok: true, value: undefined };
  },
  setBudget(id: string, monthlyUsd: number): Result {
    if (!(monthlyUsd >= 0) || !Number.isFinite(monthlyUsd)) return { ok: false, error: "Enter a budget of zero or more." };
    patchAgent(id, (x) => ({ ...x, budget: { ...x.budget, monthlyUsd } }));
    return { ok: true, value: undefined };
  },
  /** Saves how the agent runs. Errors block the save, warnings do not. */
  setExecution(id: string, e: Execution): Result<ExecIssue[]> {
    const a = get().agents.find((x) => x.id === id);
    if (!a) return { ok: false, error: "That agent does not exist." };
    if (a.state === "retired") return { ok: false, error: "A retired agent cannot be changed." };
    if (a.control !== "governed") return { ok: false, error: "tok∑ner does not run this agent, so it cannot change how it starts. Change it on the platform where it runs." };
    const issues = validateExecution(e, { hasSensitiveTools: a.tools.some((t) => t.sensitive), control: a.control, toolCount: a.tools.length });
    const first = issues.find((i) => i.level === "error"); if (first) return { ok: false, error: first.message };
    patchAgent(id, (x) => ({ ...x, execution: e, lastSwitch: undefined, versions: [{ version: x.version, at: new Date().toISOString(), note: e.toolCalling?.mode !== a.execution?.toolCalling?.mode ? `Tool calling set to ${e.toolCalling?.mode === "code" ? "Code Mode" : "direct calls"}` : "Runtime settings changed" }, ...x.versions] }));
    return { ok: true, value: issues };
  },
  /** Moves a governed agent to another runtime using a plan from `planSwitch`. The old settings are kept for `undoSwitch`. `meta` says a rule did it, and why. */
  switchRuntime(id: string, to: RuntimeKind, strategy: Strategy, inFlight: number, meta?: { rule: string; reason: string }): Result<Plan> {
    const a = get().agents.find((x) => x.id === id);
    if (!a) return { ok: false, error: "That agent does not exist." };
    const plan = planSwitch(a, to, strategy, inFlight);
    if (plan.blockers.length) return { ok: false, error: plan.blockers[0] };
    const before = a.execution ?? defaultExecution("serverless"); const now = new Date().toISOString(); const sim = getSimNow();
    const ev: SwitchEvent = { at: now, simAt: sim, from: plan.from, to, rule: meta?.rule ?? "Switched by a person", reason: meta?.reason ?? "A person chose it on the Runtime tab.", strategy, inFlight: plan.inFlight, cancelled: plan.cancelled, auto: !!meta };
    const note = (meta ? `Automatic switch from ${RUNTIME_BY_ID[plan.from].label.toLowerCase()} to ${RUNTIME_BY_ID[to].label.toLowerCase()} (${meta.rule})` : switchNote(plan.from, plan.to, strategy)) + (plan.cancelled ? `, ${plan.cancelled} run${plan.cancelled === 1 ? "" : "s"} cancelled` : "");
    patchAgent(id, (x) => ({ ...x, execution: plan.next, lastSwitch: { from: before, to, strategy, at: now }, switching: { lastSwitchSim: sim, log: [ev, ...(x.switching?.log ?? [])].slice(0, 20) }, versions: [{ version: x.version, at: now, note }, ...x.versions] }));
    return { ok: true, value: plan };
  },
  /** Puts back the settings from before the last switch. */
  undoSwitch(id: string): Result {
    const a = get().agents.find((x) => x.id === id);
    if (!a) return { ok: false, error: "That agent does not exist." };
    if (!a.lastSwitch) return { ok: false, error: "There is no runtime switch to undo." };
    const now = a.execution?.runtime ?? "serverless"; const back = a.lastSwitch.from; const at = new Date().toISOString(); const sim = getSimNow();
    const ev: SwitchEvent = { at, simAt: sim, from: now, to: back.runtime, rule: "Undone by a person", reason: "A person undid the last switch.", strategy: "drain", inFlight: 0, cancelled: 0, auto: false };
    // Undoing restores the settings as they were, including the automatic switching policy as it was then.
    patchAgent(id, (x) => ({ ...x, execution: back, lastSwitch: undefined, switching: { lastSwitchSim: sim, log: [ev, ...(x.switching?.log ?? [])].slice(0, 20) }, versions: [{ version: x.version, at, note: rollbackNote(now, back.runtime) }, ...x.versions] }));
    return { ok: true, value: undefined };
  },
  /** Saves what the agent is connected to. Notification tools it now uses are granted, so a binding never points at a tool the agent cannot call. */
  setBindings(id: string, declared: Binding[], hub: Hub): Result<BindingIssue[]> {
    const a = get().agents.find((x) => x.id === id);
    if (!a) return { ok: false, error: "That agent does not exist." };
    if (a.state === "retired") return { ok: false, error: "A retired agent cannot be changed." };
    const grants = [...a.tools]; for (const b of declared) if ((b.role === "notify" || b.role === "approval") && b.tool && !grants.some((g) => g.server === NOTIFY_SERVER && g.tool === b.tool)) grants.push(notifyGrant(b.tool));
    const next = { ...a, bindings: declared, tools: grants };
    const issues = validateBindings(next, hub);
    const first = issues.find((i) => i.level === "error"); if (first) return { ok: false, error: first.message };
    patchAgent(id, (x) => ({ ...x, bindings: declared, tools: grants, versions: [{ version: x.version, at: new Date().toISOString(), note: "Connections changed" }, ...x.versions] }));
    return { ok: true, value: issues };
  },
  setToolApproval(id: string, server: string, tool: string, approval: boolean) {
    patchAgent(id, (x) => ({ ...x, tools: x.tools.map((t) => (t.server === server && t.tool === tool ? { ...t, approval } : t)) }));
  },
};

export const workflows = {
  save(input: { name: string; description: string; pattern: WorkflowPattern; agents: string[]; timeoutSec: number; budgetUsd: number; owner: string }): Result<Workflow> {
    if (!input.name.trim()) return { ok: false, error: "Give the workflow a name." };
    if (input.agents.length < 2) return { ok: false, error: "A workflow needs at least two agents." };
    if (new Set(input.agents).size !== input.agents.length) return { ok: false, error: "An agent is listed twice." };
    if (!(input.budgetUsd > 0) || !(input.timeoutSec > 0)) return { ok: false, error: "Set a timeout and a budget above zero." };
    const w: Workflow = { ...input, id: nid("wf"), createdAt: new Date().toISOString(), runs: [] };
    set({ workflows: [w, ...get().workflows] });
    return { ok: true, value: w };
  },
  /** In the sample workspace a run is simulated from each agent's typical cost and latency. It calls nothing. */
  run(id: string): Result {
    const w = get().workflows.find((x) => x.id === id);
    if (!w) return { ok: false, error: "That workflow does not exist." };
    const steps = w.agents.map((agentId) => {
      const a = get().agents.find((x) => x.id === agentId);
      const ex = a ? a.daily.reduce((s, d) => s + d.executions, 0) : 0;
      const cost = a && ex ? a.daily.reduce((s, d) => s + d.costUsd, 0) / ex : 0.02;
      return { agentId, durMs: Math.max(800, Math.round((a?.p95Ms ?? 3000) * 0.6)), costUsd: Math.round(cost * 100) / 100, status: a && a.state === "active" ? ("ok" as const) : ("skipped" as const) };
    });
    const ran = steps.filter((s) => s.status === "ok");
    const cost = Math.round(steps.reduce((x, s) => x + s.costUsd, 0) * 100) / 100;
    const run = { id: nid("run"), startedAt: new Date().toISOString(), durationMs: w.pattern === "parallel" ? Math.max(0, ...steps.map((s) => s.durMs)) : steps.reduce((x, s) => x + s.durMs, 0), costUsd: cost,
      status: ran.length === steps.length && cost <= w.budgetUsd ? ("succeeded" as const) : ("failed" as const), steps };
    set({ workflows: get().workflows.map((x) => (x.id === id ? { ...x, runs: [run, ...x.runs] } : x)) });
    return run.status === "succeeded" ? { ok: true, value: undefined } : { ok: false, error: ran.length !== steps.length ? "An agent in this workflow is suspended or retired, so its step was skipped." : "The run went over the workflow budget." };
  },
};

// ---------------------------------------------------------------------------------------------------------------------------------------
// Exposure: addresses, API keys and signing secrets for apps and SDKs

const patchExposure = (agentId: string, fn: (e: Exposure) => Exposure) => set({ exposures: get().exposures.map((e) => (e.agentId === agentId ? fn(e) : e)) });

export const exposure = {
  /** Puts an agent on the gateway. Only a governed agent can be, since only its calls pass through. */
  enable(agentId: string, patch: Partial<Access> = {}): Result<Exposure> {
    const a = get().agents.find((x) => x.id === agentId);
    if (!a) return { ok: false, error: "That agent does not exist." };
    const can = canExpose(a); if (!can.ok) return { ok: false, error: can.reason };
    if (get().exposures.some((e) => e.agentId === agentId && e.via === "gateway")) return { ok: false, error: "This agent is already exposed on the gateway." };
    const access = { ...DEFAULT_ACCESS(), ...patch };
    const bad = validateAccess(a, access).find((i) => i.level === "error"); if (bad) return { ok: false, error: bad.message };
    const e: Exposure = { agentId, via: "gateway", url: gatewayUrl(a), auth: "app-key", requests24h: 0, access };
    set({ exposures: [...get().exposures.filter((x) => x.agentId !== agentId), e] });
    return { ok: true, value: e };
  },
  disable(agentId: string): Result {
    if (!get().exposures.some((e) => e.agentId === agentId)) return { ok: false, error: "This agent is not exposed." };
    set({ exposures: get().exposures.filter((e) => e.agentId !== agentId) });
    return { ok: true, value: undefined };
  },
  /** Records an address that exists outside tok∑ner. tok∑ner does not see its traffic, so there are no keys to manage here. */
  declare(agentId: string, input: { via: "public-url" | "webhook"; url: string; auth: Exposure["auth"] }): Result {
    if (!/^https:\/\/[^\s]+$/i.test(input.url)) return { ok: false, error: "Enter the address, starting with https://." };
    set({ exposures: [...get().exposures.filter((e) => e.agentId !== agentId), { agentId, via: input.via, url: input.url, auth: input.auth, requests24h: 0 }] });
    return { ok: true, value: undefined };
  },
  update(agentId: string, patch: Partial<Access>): Result {
    const a = get().agents.find((x) => x.id === agentId); const cur = get().exposures.find((e) => e.agentId === agentId);
    if (!a || !cur?.access) return { ok: false, error: "This agent is not exposed on the gateway." };
    const next = { ...cur.access, ...patch };
    const bad = validateAccess(a, next).find((i) => i.level === "error"); if (bad) return { ok: false, error: bad.message };
    patchExposure(agentId, (e) => ({ ...e, access: next }));
    return { ok: true, value: undefined };
  },
  /** The secret is returned once. Only its hash is kept. */
  createKey(agentId: string, input: { name: string; scopes: KeyScope[]; env: "live" | "test"; expiresInDays: number | null; rateLimitPerMin?: number; allowedOrigins?: string[]; createdBy?: string }): Result<{ key: ApiKey; secret: string }> {
    const cur = get().exposures.find((e) => e.agentId === agentId);
    if (!cur?.access) return { ok: false, error: "Expose the agent on the gateway first." };
    const name = input.name.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]{1,47}$/.test(name)) return { ok: false, error: "Name the key for whoever will use it, 2 to 48 letters, digits, spaces, dots, dashes or underscores." };
    if (cur.access.keys.some((k) => k.name.toLowerCase() === name.toLowerCase() && k.status === "active")) return { ok: false, error: `An active key named ${name} already exists.` };
    if (!input.scopes.length) return { ok: false, error: "Allow the key at least one action." };
    if (cur.access.keys.filter((k) => k.status === "active").length >= 20) return { ok: false, error: "An agent can have 20 active keys. Revoke one you no longer use." };
    if (input.rateLimitPerMin !== undefined && !(input.rateLimitPerMin >= 1)) return { ok: false, error: "A per key limit must be at least 1 a minute." };
    const m = makeKey(input.env); const now = new Date();
    const key: ApiKey = { id: nid("key"), name, prefix: m.prefix, last4: m.last4, hash: m.hash, scopes: input.scopes, env: input.env, createdAt: now.toISOString(), createdBy: input.createdBy ?? "nestor@nexi.com",
      expiresAt: input.expiresInDays ? new Date(now.getTime() + input.expiresInDays * 86_400_000).toISOString() : null, lastUsedAt: null, requests30d: 0, status: "active", rateLimitPerMin: input.rateLimitPerMin, allowedOrigins: input.allowedOrigins?.length ? input.allowedOrigins : undefined };
    patchExposure(agentId, (e) => ({ ...e, access: { ...e.access!, keys: [key, ...e.access!.keys] } }));
    return { ok: true, value: { key, secret: m.secret } };
  },
  revokeKey(agentId: string, keyId: string): Result {
    const cur = get().exposures.find((e) => e.agentId === agentId)?.access; const k = cur?.keys.find((x) => x.id === keyId);
    if (!k) return { ok: false, error: "That key does not exist." };
    if (k.status === "revoked") return { ok: false, error: "That key is already revoked." };
    patchExposure(agentId, (e) => ({ ...e, access: { ...e.access!, keys: e.access!.keys.map((x) => (x.id === keyId ? { ...x, status: "revoked" as const, revokedAt: new Date().toISOString() } : x)) } }));
    return { ok: true, value: undefined };
  },
  deleteKey(agentId: string, keyId: string): Result {
    const k = get().exposures.find((e) => e.agentId === agentId)?.access?.keys.find((x) => x.id === keyId);
    if (!k) return { ok: false, error: "That key does not exist." };
    if (k.status === "active") return { ok: false, error: "Revoke the key before deleting it, so the change is on record." };
    patchExposure(agentId, (e) => ({ ...e, access: { ...e.access!, keys: e.access!.keys.filter((x) => x.id !== keyId) } }));
    return { ok: true, value: undefined };
  },
  /** Makes a new signing secret and returns it once. The one before stops working at once. */
  rotateSigning(agentId: string, required = true): Result<{ secret: string }> {
    const a = get().agents.find((x) => x.id === agentId); const cur = get().exposures.find((e) => e.agentId === agentId)?.access;
    if (!a || !cur) return { ok: false, error: "This agent is not exposed on the gateway." };
    const m = makeSigningSecret();
    patchExposure(agentId, (e) => ({ ...e, access: { ...e.access!, signing: { required, ref: signingRef(a), algorithm: "hmac-sha256", toleranceSec: 300, createdAt: new Date().toISOString(), last4: m.last4 } } }));
    return { ok: true, value: { secret: m.secret } };
  },
  setSigningRequired(agentId: string, required: boolean): Result {
    const cur = get().exposures.find((e) => e.agentId === agentId)?.access;
    if (!cur?.signing) return { ok: false, error: "Make a signing secret first." };
    patchExposure(agentId, (e) => ({ ...e, access: { ...e.access!, signing: { ...e.access!.signing!, required } } }));
    return { ok: true, value: undefined };
  },
};

// ---------------------------------------------------------------------------------------------------------------------------------------
// Evaluations

export const evals = {
  createSuite(agentId: string, name: string): Result<EvalSuite> {
    const a = get().agents.find((x) => x.id === agentId);
    if (!a || a.control === "inventory") return { ok: false, error: "An agent that is only registered has no runs to evaluate." };
    if (!name.trim()) return { ok: false, error: "Name the suite." };
    const suite: EvalSuite = { id: nid("evs"), agentId, name: name.trim(), description: "", createdAt: new Date().toISOString(), cases: [],
      scorers: [{ id: "answer", label: "Right answer", kind: "contains", threshold: 1, weight: 3, detail: "The answer includes the expected text." }, { id: "time", label: "Under 10 seconds", kind: "latency", threshold: 10000, weight: 1, detail: "End to end." }, { id: "cost", label: "Under 5 cents", kind: "cost", threshold: 0.05, weight: 1, detail: "Model and tool cost." }] };
    set({ evalSuites: [...get().evalSuites, suite] });
    return { ok: true, value: suite };
  },
  addCase(suiteId: string, c: { input: string; expected: string }): Result<EvalCase> {
    const s = get().evalSuites.find((x) => x.id === suiteId); if (!s) return { ok: false, error: "That suite does not exist." };
    if (!c.input.trim() || !c.expected.trim()) return { ok: false, error: "A case needs an input and the answer you expect." };
    const ec: EvalCase = { id: `c${String(s.cases.length + 1).padStart(2, "0")}`, input: c.input.trim(), expected: c.expected.trim(), wrong: "an answer that does not match", tags: [] };
    set({ evalSuites: get().evalSuites.map((x) => (x.id === suiteId ? { ...x, cases: [...x.cases, ec] } : x)) });
    return { ok: true, value: ec };
  },
  removeCase(suiteId: string, caseId: string) { set({ evalSuites: get().evalSuites.map((x) => (x.id === suiteId ? { ...x, cases: x.cases.filter((c) => c.id !== caseId) } : x)) }); },
  /** Runs every case through the agent. In the sample workspace the agent is simulated, but time and cost come from the generated trace. */
  run(suiteId: string, trigger: EvalRun["trigger"] = "manual"): Result<EvalRun> {
    const s = get().evalSuites.find((x) => x.id === suiteId); if (!s) return { ok: false, error: "That suite does not exist." };
    if (!s.cases.length) return { ok: false, error: "Add at least one case before running the suite." };
    const a = get().agents.find((x) => x.id === s.agentId); if (!a) return { ok: false, error: "The agent no longer exists." };
    if (a.state !== "active") return { ok: false, error: `${a.title} is ${a.state}. Resume it to run an evaluation.` };
    const ex = a.daily.reduce((x, d) => x + d.executions, 0); const fr = ex ? a.daily.reduce((x, d) => x + d.failures, 0) / ex : 0.05;
    const quality = Math.min(0.97, Math.max(0.5, 0.92 - fr * 3));
    const id = nid("evr");
    const { run, traces } = runSuite({ suite: s, agents: get().agents, seed: Date.now() % 100000, startedAt: Date.now(), quality, version: a.version, trigger, id });
    set({ evalRuns: [...get().evalRuns, run], traces: [...traces, ...get().traces].slice(0, 1200) });
    return { ok: true, value: run };
  },
};

// ---------------------------------------------------------------------------------------------------------------------------------------
// Memory

export const memory = {
  /** Saves the layers and tools. The memory tools are then added to, or taken from, the agent's tool grants so approval and audit apply to them. */
  setConfig(agentId: string, cfg: MemoryConfig): Result {
    const a = get().agents.find((x) => x.id === agentId); if (!a) return { ok: false, error: "That agent does not exist." };
    if (a.state === "retired") return { ok: false, error: "A retired agent cannot be changed." };
    const bad = validateMemory(cfg).find((i) => i.level === "error"); if (bad) return { ok: false, error: bad.message };
    const grants = memoryGrants(cfg, true);
    const old = a.tools.filter((t) => t.server === MEMORY_SERVER);
    patchAgent(agentId, (x) => ({ ...x, memory: cfg, tools: [...x.tools.filter((t) => t.server !== MEMORY_SERVER), ...grants.map((g) => ({ ...g, approval: old.find((o) => o.tool === g.tool)?.approval ?? g.approval }))] }));
    return { ok: true, value: undefined };
  },
  remember(agentId: string, input: { kind: MemoryKind; text: string; entity?: string; tags?: string[] }): Result<MemoryItem> {
    const a = get().agents.find((x) => x.id === agentId); const layer = a?.memory?.layers.find((l) => l.kind === input.kind && l.enabled);
    if (!a || !layer) return { ok: false, error: `${KIND_BY_ID[input.kind].label} is not turned on for this agent.` };
    const text = input.text.trim(); if (text.length < 3) return { ok: false, error: "Write what should be remembered." };
    if (layer.maskPersonalData && /\b[\w.+-]+@[\w-]+\.[\w.]+\b|\b(?:\d[ -]?){13,16}\b/.test(text)) return { ok: false, error: "That looks like an email address or a card number. This layer masks personal data, so it was not stored." };
    const item: MemoryItem = { id: nid("mem"), kind: input.kind, text, entity: input.entity?.trim() || undefined, tags: input.tags ?? [], source: "person", createdAt: new Date().toISOString(), lastUsedAt: null, uses: 0, pinned: false };
    const cur = get().memoryItems[agentId] ?? [];
    const kept = applyRetention([item, ...cur.filter((i) => i.kind === input.kind)], layer);
    set({ memoryItems: { ...get().memoryItems, [agentId]: [...cur.filter((i) => i.kind !== input.kind), ...kept] } });
    return { ok: true, value: item };
  },
  forget(agentId: string, itemId: string): Result {
    const cur = get().memoryItems[agentId] ?? []; if (!cur.some((i) => i.id === itemId)) return { ok: false, error: "That item no longer exists." };
    set({ memoryItems: { ...get().memoryItems, [agentId]: cur.filter((i) => i.id !== itemId) } });
    return { ok: true, value: undefined };
  },
  pin(agentId: string, itemId: string, pinned: boolean) { set({ memoryItems: { ...get().memoryItems, [agentId]: (get().memoryItems[agentId] ?? []).map((i) => (i.id === itemId ? { ...i, pinned } : i)) } }); },
  clearLayer(agentId: string, kind: MemoryKind): Result<number> {
    const cur = get().memoryItems[agentId] ?? []; const n = cur.filter((i) => i.kind === kind).length;
    set({ memoryItems: { ...get().memoryItems, [agentId]: cur.filter((i) => i.kind !== kind) } });
    return { ok: true, value: n };
  },
};

// ---------------------------------------------------------------------------------------------------------------------------------------
// Figures. Every number on the Control Arena is computed here from the agents and traces above.

export { sum, totals, sensitiveTools, budgetShare } from "./store-math";
import { sum, totals, sensitiveTools, budgetShare } from "./store-math";

export type Attention = { key: string; tone: "bad" | "warn"; text: string; agentId: string };
export function attention(list: Agent[]): Attention[] {
  const out: Attention[] = [];
  for (const a of list) {
    if (a.state === "retired") continue;
    const t = totals(a);
    if (a.state === "suspended") out.push({ key: a.id + "s", tone: "warn", agentId: a.id, text: `${a.title} is suspended.` });
    if (a.budget.monthlyUsd && budgetShare(a) >= 0.9) out.push({ key: a.id + "b", tone: budgetShare(a) >= 1 ? "bad" : "warn", agentId: a.id, text: `${a.title} has used ${Math.round(budgetShare(a) * 100)}% of its monthly budget.` });
    if (t.executions >= 100 && t.failureRate > 0.05) out.push({ key: a.id + "f", tone: "bad", agentId: a.id, text: `${a.title} failed ${(t.failureRate * 100).toFixed(1)}% of ${t.executions.toLocaleString("en-US")} runs in 30 days.` });
    if (a.control !== "governed" && sensitiveTools(a).some((x) => !x.approval)) out.push({ key: a.id + "i", tone: "warn", agentId: a.id, text: `${a.title} can use ${sensitiveTools(a).length === 1 ? "a sensitive tool" : sensitiveTools(a).length + " sensitive tools"} and tok∑ner cannot ${a.control === "observed" ? "stop it" : "see it"}.` });
  }
  return out;
}

export const approvals = {
  decide(id: string, by: string, outcome: Outcome, reason: string): Result<Approval> {
    const a = get().approvals.find((x) => x.id === id);
    if (!a) return { ok: false, error: "That request does not exist." };
    const r = decideApproval(a, { by, outcome, reason });
    if (!r.ok) return r;
    set({ approvals: get().approvals.map((x) => (x.id === id ? r.value : x)) });
    return r;
  },
};
export const pendingFor = (s: AgentsState, agentId: string) => s.approvals.filter((a) => a.agentId === agentId && (a.status === "pending" || a.status === "awaiting-second")).length;

/** The figures the Constellation shows on each agent: what is running and what is waiting for a person. Waiting counts come from the Approvals queue, so a decision there changes the canvas. */
export function liveOf(s: AgentsState): Record<string, Live> {
  const out: Record<string, Live> = { ...s.live };
  const ids = new Set(s.approvals.map((a) => a.agentId));
  ids.forEach((id) => { out[id] = { running: out[id]?.running ?? 0, queued: out[id]?.queued ?? 0, pendingApprovals: pendingFor(s, id) }; });
  return out;
}

export const contexts = {
  /** Creates a space or replaces the one with the same id. Errors block the save, warnings do not. */
  save(space: Space, hub: Hub): Result<SpaceIssue[]> {
    const issues = validateSpace(space, get().agents, hub);
    const first = issues.find((i) => i.level === "error"); if (first) return { ok: false, error: first.message };
    const has = get().spaces.some((x) => x.id === space.id);
    set({ spaces: has ? get().spaces.map((x) => (x.id === space.id ? space : x)) : [...get().spaces, space] });
    return { ok: true, value: issues };
  },
  remove(id: string): Result {
    if (!get().spaces.some((x) => x.id === id)) return { ok: false, error: "That space does not exist." };
    set({ spaces: get().spaces.filter((x) => x.id !== id) }); return { ok: true, value: undefined };
  },
};

export const agentsStoreApprovals = approvals;
