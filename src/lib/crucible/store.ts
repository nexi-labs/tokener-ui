"use client";

import { useSyncExternalStore } from "react";
import { can } from "@/lib/mlops/rbac";
import type { Action } from "@/lib/mlops/rbac";
import type { RoleId } from "@/lib/mlops/types";
import { decideCycle, matches, startCycle, validatePolicy } from "./ct";
import { estimate, type PlanInput } from "./memory";
import { sampleAdapters, sampleCycles, sampleExperiments, sampleJobs, samplePolicies, sampleRuns } from "./sample";
import { keyRef, sampleCatalog, sampleProjects, sampleStores, sampleToken, testStoreSample, validateProject, validateStore, exposeProblems, type ApiKey, type ArtifactStore, type CatalogDataset, type KeyScope, type Machine, type MachineKind, type Project, type StoreDraft, type TestOutcome } from "./platform";
import type { Adapter, CtPolicy, Cycle, Experiment, Job, Queue, Run, TriggerEvent, TriggerKind } from "./types";

/**
 * In memory store behind the Crucible screens in the sample workspace. It lives only in this browser tab and starts again from the sample on reload.
 * A signed-in workspace does not use it: the training service is not built yet (docs/51, section 14). Actions use the roles that already exist.
 */
export type CrucibleState = { experiments: Experiment[]; runs: Run[]; jobs: Job[]; policies: CtPolicy[]; cycles: Cycle[]; adapters: Adapter[]; projects: Project[]; keys: ApiKey[]; machines: Machine[]; stores: ArtifactStore[]; catalog: CatalogDataset[]; log: { at: string; by: string; what: string }[] };
export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };

let state: CrucibleState | null = null; const listeners = new Set<() => void>(); let seq = 6000;
const nid = (p: string) => `${p}-${++seq}`;
const init = (): CrucibleState => {
  const now = Date.now(); const policies = samplePolicies(now);
  return { experiments: sampleExperiments(now), runs: sampleRuns(now), jobs: sampleJobs(now), policies, cycles: sampleCycles(now, policies), adapters: sampleAdapters(), ...sampleProjects(now), stores: sampleStores(now), catalog: sampleCatalog(now), log: [] };
};
const get = () => (state ??= init());
const set = (patch: Partial<CrucibleState>) => { state = { ...get(), ...patch }; listeners.forEach((l) => l()); };
export const useCrucible = (): CrucibleState => useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, get, get);
export const crucibleNow = () => get();
export const resetCrucible = () => { state = init(); listeners.forEach((l) => l()); };

/** In the sample workspace each role acts as a different person, so a two person approval can be tried by switching role. */
export const ACTOR: Record<RoleId, string> = { viewer: "A viewer", developer: "priya.nair@nexi.example", approver: "marcus.lee@nexi.example", admin: "jdoe@example.com" };

const guard = (role: RoleId, action: Action): Result<never> | null => { const d = can(role, action); return d.ok ? null : { ok: false, error: d.reason ?? "Not allowed." }; };
const note = (by: string, what: string) => set({ log: [{ at: new Date().toISOString(), by, what }, ...get().log].slice(0, 50) });
const fail = (error: string): Result<never> => ({ ok: false, error });

export type JobSpec = { name: string; experimentId: string; queue: Queue; gpus: number; card: string; memRequestGb: number; image: string; command: string; plan?: PlanInput };

export const crucible = {
  submitJob(role: RoleId, spec: JobSpec): Result<Job> {
    const g = guard(role, "pipeline.run"); if (g) return g;
    if (!/^[a-z][a-z0-9-]{2,60}$/.test(spec.name)) return fail("Use 3 to 61 lowercase letters, digits or hyphens for the job name.");
    if (!get().experiments.some((e) => e.id === spec.experimentId)) return fail("Choose an experiment.");
    if (!(spec.gpus >= 0 && spec.gpus <= 64)) return fail("Ask for between 0 and 64 GPUs.");
    if (!spec.image.trim() || !spec.command.trim()) return fail("Give the image and the command.");
    if (spec.plan) { const e = estimate(spec.plan); if (!e.fits) return fail(`The memory planner estimates ${e.total.toFixed(0)} GB for each GPU and ${e.usable.toFixed(0)} GB is usable. Open the memory planner to see the smallest change that fits.`); }
    const ahead = get().jobs.filter((j) => (j.state === "queued" || j.state === "admitting") && j.queue === spec.queue).length;
    const job: Job = { id: nid("job"), name: spec.name, experimentId: spec.experimentId, queue: spec.queue, priority: spec.queue === "interactive" ? 80 : spec.queue === "default" ? 50 : 20, state: "queued", gpus: spec.gpus, card: spec.card, memRequestGb: spec.memRequestGb, owner: ACTOR[role], project: get().experiments.find((e) => e.id === spec.experimentId)!.project, submittedAt: new Date().toISOString(), attempts: [], costEstimateUsd: Math.round(spec.gpus * 2.5 * 4), image: spec.image, command: spec.command, waitReason: `Checking quota, budget and policy. ${ahead} job${ahead === 1 ? "" : "s"} ahead in the ${spec.queue} queue.` };
    set({ jobs: [job, ...get().jobs] }); note(ACTOR[role], `Submitted job ${job.name}`);
    return { ok: true, value: job };
  },
  cancelJob(role: RoleId, id: string): Result {
    const g = guard(role, "run.cancel"); if (g) return g;
    const j = get().jobs.find((x) => x.id === id); if (!j) return fail("Unknown job.");
    if (!["queued", "admitting", "running"].includes(j.state)) return fail(`This job is already ${j.state}.`);
    const iso = new Date().toISOString();
    set({ jobs: get().jobs.map((x) => (x.id !== id ? x : { ...x, state: "cancelled", waitReason: undefined, attempts: x.attempts.map((a, i, arr) => (i === arr.length - 1 && !a.endedAt ? { ...a, endedAt: iso, exit: `Cancelled by ${ACTOR[role]}` } : a)) })), runs: get().runs.map((r) => (r.jobId === id && r.status === "running" ? { ...r, status: "killed", endedAt: iso } : r)) });
    note(ACTOR[role], `Cancelled job ${j.name}`);
    return { ok: true, value: undefined };
  },
  /** Records the link between a finished run and a version of a registered model. In the sample workspace the Model Versions screen is not changed. */
  registerCandidate(role: RoleId, runId: string, model: string): Result<{ version: number }> {
    const g = guard(role, "model.register"); if (g) return g;
    const r = get().runs.find((x) => x.id === runId); if (!r) return fail("Unknown run.");
    if (r.status !== "finished") return fail("Only a finished run can be registered.");
    if (!r.artifacts.some((a) => a.kind === "model")) return fail("This run has no model artifact.");
    if (r.modelVersion) return fail(`This run is already registered as ${r.modelVersion.model} version ${r.modelVersion.version}.`);
    if (!/^[a-z][a-z0-9-]{2,60}$/.test(model)) return fail("Use lowercase letters, digits and hyphens for the model name.");
    const top = Math.max(0, ...get().runs.filter((x) => x.modelVersion?.model === model).map((x) => x.modelVersion!.version));
    const version = model === "customer-support-classifier" ? Math.max(top, 5) + 1 : top + 1;
    set({ runs: get().runs.map((x) => (x.id === runId ? { ...x, modelVersion: { model, version } } : x)) });
    note(ACTOR[role], `Registered ${r.name} as ${model} version ${version}`);
    return { ok: true, value: { version } };
  },
  savePolicy(role: RoleId, p: CtPolicy): Result<CtPolicy> {
    const g = guard(role, p.state === "active" ? "pipeline.publish" : "pipeline.edit"); if (g) return g;
    const issues = validatePolicy(p).filter((i) => i.level === "error"); if (issues.length) return fail(issues[0].message);
    if (get().policies.some((x) => x.name === p.name && x.id !== p.id)) return fail(`A policy named ${p.name} already exists.`);
    const exists = get().policies.some((x) => x.id === p.id);
    set({ policies: exists ? get().policies.map((x) => (x.id === p.id ? p : x)) : [p, ...get().policies] });
    note(ACTOR[role], `${exists ? "Updated" : "Created"} continuous training policy ${p.name}`);
    return { ok: true, value: p };
  },
  setPolicyState(role: RoleId, id: string, to: CtPolicy["state"]): Result {
    const g = guard(role, "pipeline.publish"); if (g) return g;
    const p = get().policies.find((x) => x.id === id); if (!p) return fail("Unknown policy.");
    set({ policies: get().policies.map((x) => (x.id === id ? { ...x, state: to } : x)) }); note(ACTOR[role], `${to === "active" ? "Resumed" : "Paused"} ${p.name}`);
    return { ok: true, value: undefined };
  },
  /** Starts a cycle by hand, or simulates the event a trigger would send. The new data can be marked as holding personal data to see the quality gate stop a cycle. */
  fireEvent(role: RoleId, policyId: string, kind: TriggerKind, o: { piiFree?: boolean; quality?: number } = {}): Result<Cycle> {
    const g = guard(role, "pipeline.run"); if (g) return g;
    const p = get().policies.find((x) => x.id === policyId); if (!p) return fail("Unknown policy.");
    const latest = Math.max(...get().cycles.filter((c) => c.policyId === policyId).map((c) => c.event.datasetVersion), 14);
    const t = p.triggers.find((x) => x.kind === kind);
    const rows = kind === "rows" ? (t?.minRows ?? 20000) + 4_000 : 46_000;
    const e: TriggerEvent = { id: nid("evt"), kind, detail: kind === "manual" ? `Started by ${ACTOR[role]}` : kind === "drift" ? `${t?.detail ?? "alert"} fired` : kind === "schedule" ? `Schedule ${t?.detail ?? ""}` : kind === "stream-window" ? "A window closed" : `${p.source} version ${latest + 1}`, datasetVersion: latest + 1, rows, quality: o.quality ?? 0.96, schemaOk: true, piiFree: o.piiFree ?? true, by: kind === "manual" ? ACTOR[role] : undefined };
    const m = matches(p, e); if (!m.ok) return fail(m.reason!);
    const day = Date.now() - 24 * 3600_000;
    const r = startCycle(p, e, { existing: get().cycles, now: Date.now(), actor: ACTOR[role], cyclesToday: get().cycles.filter((c) => c.policyId === policyId && Date.parse(c.startedAt) > day).length });
    if (!r.ok) return fail(r.error);
    set({ cycles: [r.cycle, ...get().cycles], policies: get().policies.map((x) => (x.id === policyId ? { ...x, budget: { ...x.budget, spentUsd: x.budget.spentUsd + r.cycle.costUsd } } : x)) });
    note(ACTOR[role], `Cycle ${r.cycle.id} on ${p.name}: ${r.cycle.decision.replace(/-/g, " ")}`);
    return { ok: true, value: r.cycle };
  },
  decide(role: RoleId, cycleId: string, decision: "approve" | "reject", noteText?: string): Result<Cycle> {
    const g = guard(role, "run.approve"); if (g) return g;
    const c = get().cycles.find((x) => x.id === cycleId); if (!c) return fail("Unknown cycle.");
    const p = get().policies.find((x) => x.id === c.policyId)!;
    const r = decideCycle(p, c, decision, ACTOR[role], Date.now(), noteText);
    if (!r.ok) return fail(r.error);
    set({ cycles: get().cycles.map((x) => (x.id === cycleId ? r.cycle : x)) });
    note(ACTOR[role], `${decision === "approve" ? "Approved" : "Rejected"} cycle ${cycleId} on ${p.name}`);
    return { ok: true, value: r.cycle };
  },
  /** The canary in Deployments passed, so the candidate becomes the champion. The only place the champion changes. */
  completeRollout(role: RoleId, cycleId: string): Result<Cycle> {
    const g = guard(role, "deployment.promote"); if (g) return g;
    const c = get().cycles.find((x) => x.id === cycleId); if (!c) return fail("Unknown cycle.");
    if (c.decision !== "in-rollout") return fail("Only a cycle that is rolling out can be promoted.");
    const p = get().policies.find((x) => x.id === c.policyId)!;
    const version = c.candidate?.version ?? p.champion.version + 1;
    const steps = c.steps.map((s) => (s.id === "shadow" ? { ...s, state: "passed" as const, detail: "Shadow traffic matched the champion's answers within tolerance" } : s.id === "canary" ? { ...s, state: "passed" as const, detail: "5 percent of traffic for 30 minutes, no regression" } : s.id === "promote" ? { ...s, state: "passed" as const, detail: `Version ${version} is the champion` } : s));
    const next: Cycle = { ...c, steps, decision: "promoted", reason: `Version ${version} is now serving.` };
    set({ cycles: get().cycles.map((x) => (x.id === cycleId ? next : x)), policies: get().policies.map((x) => (x.id === p.id ? { ...x, champion: { version, metric: c.candidate?.metric ?? x.champion.metric } } : x)) });
    note(ACTOR[role], `Promoted version ${version} on ${p.name}`);
    return { ok: true, value: next };
  },
  // ---- projects, keys and developer machines
  createProject(role: RoleId, d: { name: string; description: string; storeId: string; repoUrl: string; branch: string; entry: string; python: string; envTool: Project["envTool"]; experimentId?: string }): Result<Project> {
    const g = guard(role, "settings.edit"); if (g) return g;
    const errs = validateProject(d, get().projects.map((x) => x.name)); if (errs.length) return fail(errs[0]);
    if (!get().stores.some((x) => x.id === d.storeId)) return fail("Choose a store that exists.");
    const prj: Project = { id: nid("prj"), name: d.name, description: d.description, owner: ACTOR[role], department: "Unassigned", storeId: d.storeId, experimentIds: d.experimentId ? [d.experimentId] : [], repo: { url: d.repoUrl, branch: d.branch || "main", path: "." }, python: d.python, envTool: d.envTool, lockfile: d.envTool === "uv" ? "uv.lock" : d.envTool === "poetry" ? "poetry.lock" : d.envTool === "conda" ? "environment.lock.yml" : "requirements.lock", entry: d.entry, params: [], createdAt: new Date().toISOString() };
    set({ projects: [prj, ...get().projects] }); note(ACTOR[role], `Created project ${prj.name}`);
    return { ok: true, value: prj };
  },
  /** Makes a key. The token is returned once for the caller to show. Only its prefix and a reference into the secret manager are kept. */
  createKey(role: RoleId, projectId: string, name: string, scopes: KeyScope[], days: number): Result<{ key: ApiKey; token: string }> {
    const g = guard(role, "connection.create"); if (g) return g;
    if (!get().projects.some((x) => x.id === projectId)) return fail("Unknown project.");
    if (!/^[a-z][a-z0-9-]{2,40}$/.test(name)) return fail("Use 3 to 41 lowercase letters, digits or hyphens for the key name.");
    if (get().keys.some((k) => k.projectId === projectId && k.name === name && !k.revokedAt)) return fail("A key with this name is already active for the project.");
    if (!scopes.length) return fail("Give the key at least one permission.");
    if (!(days >= 1 && days <= 365)) return fail("A key can last from 1 to 365 days.");
    const id = nid("k"); const t = sampleToken(id + name);
    const key: ApiKey = { id, projectId, name, prefix: t.prefix, secretRef: keyRef(projectId, id), scopes, createdAt: new Date().toISOString(), createdBy: ACTOR[role], expiresAt: new Date(Date.now() + days * 86400_000).toISOString() };
    set({ keys: [key, ...get().keys] }); note(ACTOR[role], `Created key ${name}`);
    return { ok: true, value: { key, token: t.token } };
  },
  rotateKey(role: RoleId, keyId: string): Result<{ key: ApiKey; token: string }> {
    const g = guard(role, "connection.rotate"); if (g) return g;
    const k = get().keys.find((x) => x.id === keyId); if (!k) return fail("Unknown key.");
    if (k.revokedAt) return fail("This key is revoked. Make a new one.");
    const t = sampleToken(keyId + Date.now()); const next: ApiKey = { ...k, prefix: t.prefix, createdAt: new Date().toISOString(), createdBy: ACTOR[role], lastUsedAt: undefined };
    set({ keys: get().keys.map((x) => (x.id === keyId ? next : x)) }); note(ACTOR[role], `Rotated key ${k.name}`);
    return { ok: true, value: { key: next, token: t.token } };
  },
  revokeKey(role: RoleId, keyId: string): Result {
    const g = guard(role, "connection.delete"); if (g) return g;
    const k = get().keys.find((x) => x.id === keyId); if (!k) return fail("Unknown key.");
    if (k.revokedAt) return fail("This key is already revoked.");
    const at = new Date().toISOString();
    set({ keys: get().keys.map((x) => (x.id === keyId ? { ...x, revokedAt: at } : x)), machines: get().machines.map((m) => (m.keyId === keyId ? { ...m, state: "revoked" } : m)) });
    note(ACTOR[role], `Revoked key ${k.name}`); return { ok: true, value: undefined };
  },
  /** Registers a machine that is about to connect with a key. It stays pending until its first heartbeat. */
  addMachine(role: RoleId, projectId: string, keyId: string, name: string, kind: MachineKind): Result<Machine> {
    const g = guard(role, "agent.enroll"); if (g) return g;
    const k = get().keys.find((x) => x.id === keyId && x.projectId === projectId); if (!k) return fail("Choose a key of this project.");
    if (k.revokedAt) return fail("This key is revoked.");
    if (Date.parse(k.expiresAt) < Date.now()) return fail("This key has expired.");
    if (!/^[a-z][a-z0-9-]{1,40}$/.test(name)) return fail("Use 2 to 41 lowercase letters, digits or hyphens for the machine name.");
    if (get().machines.some((m) => m.projectId === projectId && m.name === name && m.state !== "revoked")) return fail("A machine with this name is already connected.");
    const m: Machine = { id: nid("m"), projectId, keyId, name, kind, user: ACTOR[role].split("@")[0], os: "Waiting", python: "", sdk: "", state: "pending", runsLogged: 0 };
    set({ machines: [m, ...get().machines] }); note(ACTOR[role], `Waiting for machine ${name}`);
    return { ok: true, value: m };
  },
  /** The sample stand in for the SDK's first heartbeat. */
  simulateHeartbeat(role: RoleId, machineId: string): Result<Machine> {
    const g = guard(role, "agent.enroll"); if (g) return g;
    const m = get().machines.find((x) => x.id === machineId); if (!m) return fail("Unknown machine.");
    if (m.state === "revoked") return fail("This machine's key was revoked.");
    const now = new Date().toISOString(); const next: Machine = { ...m, state: "online", os: m.kind === "laptop" ? "macOS 15.1 arm64" : "Ubuntu 24.04 x86_64", python: "3.11.9", sdk: "0.1.0-sample", firstSeenAt: m.firstSeenAt ?? now, lastSeenAt: now, ip: "10.20.9.61" };
    set({ machines: get().machines.map((x) => (x.id === machineId ? next : x)), keys: get().keys.map((k) => (k.id === m.keyId ? { ...k, lastUsedAt: now } : k)) });
    note(ACTOR[role], `Machine ${m.name} connected`); return { ok: true, value: next };
  },
  revokeMachine(role: RoleId, machineId: string): Result {
    const g = guard(role, "agent.revoke"); if (g) return g;
    const m = get().machines.find((x) => x.id === machineId); if (!m) return fail("Unknown machine.");
    if (m.state === "revoked") return fail("This machine is already revoked.");
    set({ machines: get().machines.map((x) => (x.id === machineId ? { ...x, state: "revoked" } : x)) }); note(ACTOR[role], `Revoked machine ${m.name}`);
    return { ok: true, value: undefined };
  },

  // ---- artifact stores
  addStore(role: RoleId, d: StoreDraft): Result<ArtifactStore> {
    const g = guard(role, "connection.create"); if (g) return g;
    const errs = validateStore(d); if (errs.length) return fail(errs[0]);
    if (get().stores.some((x) => x.name === d.name)) return fail("A store with this name already exists.");
    const s: ArtifactStore = { ...d, id: nid("store"), status: "untested", isDefault: false, managed: false, usedGb: 0, objects: 0, lifecycle: { coldAfterDays: 90, expireAfterDays: null }, testNote: "Added and not tested yet." };
    set({ stores: [...get().stores, s] }); note(ACTOR[role], `Added artifact store ${s.name}`);
    return { ok: true, value: s };
  },
  testStore(storeId: string): Result<TestOutcome> {
    const s = get().stores.find((x) => x.id === storeId); if (!s) return fail("Unknown store.");
    const out = testStoreSample(s);
    set({ stores: get().stores.map((x) => (x.id === storeId ? { ...x, status: out.ok ? "connected" : "failing", lastTestedAt: new Date().toISOString(), testNote: out.checks.find((c) => !c.ok)?.detail ?? "All checks passed." } : x)) });
    return { ok: true, value: out };
  },
  setDefaultStore(role: RoleId, storeId: string): Result {
    const g = guard(role, "settings.edit"); if (g) return g;
    const s = get().stores.find((x) => x.id === storeId); if (!s) return fail("Unknown store.");
    if (s.status !== "connected") return fail("Test the store first. Only a connected store can be the default.");
    set({ stores: get().stores.map((x) => ({ ...x, isDefault: x.id === storeId })) }); note(ACTOR[role], `Made ${s.name} the default store`);
    return { ok: true, value: undefined };
  },
  removeStore(role: RoleId, storeId: string, confirm: string): Result {
    const g = guard(role, "connection.delete"); if (g) return g;
    const s = get().stores.find((x) => x.id === storeId); if (!s) return fail("Unknown store.");
    if (s.managed) return fail("The platform managed store cannot be removed.");
    if (s.isDefault) return fail("This is the default store. Choose another default first.");
    const used = get().projects.filter((p) => p.storeId === storeId); if (used.length) return fail(`${used.map((p) => p.name).join(", ")} still write${used.length === 1 ? "s" : ""} to this store. Move ${used.length === 1 ? "it" : "them"} first.`);
    if (confirm !== s.name) return fail("Type the store's name to confirm.");
    set({ stores: get().stores.filter((x) => x.id !== storeId) }); note(ACTOR[role], `Removed artifact store ${s.name}`);
    return { ok: true, value: undefined };
  },

  // ---- datasets exposed from the Refinery
  exposeDataset(role: RoleId, id: string): Result<CatalogDataset> {
    const g = guard(role, "pipeline.publish"); if (g) return g;
    const d = get().catalog.find((x) => x.id === id); if (!d) return fail("Unknown dataset.");
    if (d.exposed) return fail("This dataset is already exposed.");
    const p = exposeProblems(d); if (p.length) return fail(p[0]);
    const next = { ...d, exposed: true, exposedAt: new Date().toISOString() };
    set({ catalog: get().catalog.map((x) => (x.id === id ? next : x)) }); note(ACTOR[role], `Exposed ${d.name} to Crucible`);
    return { ok: true, value: next };
  },
  unexposeDataset(role: RoleId, id: string): Result {
    const g = guard(role, "pipeline.publish"); if (g) return g;
    const d = get().catalog.find((x) => x.id === id); if (!d) return fail("Unknown dataset.");
    if (!d.exposed) return fail("This dataset is not exposed.");
    const pinned = get().runs.filter((r) => r.dataset.name === d.name).length; const pol = get().policies.filter((q) => q.source === d.name && q.state === "active");
    if (pol.length) return fail(`${pol.map((q) => q.name).join(", ")} learns from this dataset. Pause ${pol.length === 1 ? "it" : "them"} first.`);
    if (pinned) return fail(`${pinned} runs pin this dataset. Hiding it would break their lineage.`);
    set({ catalog: get().catalog.map((x) => (x.id === id ? { ...x, exposed: false, exposedAt: "" } : x)) }); note(ACTOR[role], `Hid ${d.name} from Crucible`);
    return { ok: true, value: undefined };
  },
};
