"use client";

import { useSyncExternalStore } from "react";
import { SAMPLE_TENANT, buildRun, sampleConnections, sampleDatasets, samplePools, sampleRecipes, sampleRuns, sampleStreams } from "./sample";
import { CONNECTOR_BY_ID, secretKeys, secretRefFor } from "./connectors";
import { STEP_BY_OP, estimateAiStep, newStep, runSteps, startFrame } from "./steps";
import { profileRows } from "./profile";
import { NATIVE_DEFAULTS, checkNativeRun, checkNativeStream, clampLimits, type NativeCheck, type NativeLimits } from "./engines";
import type { ModelCheck, ModelResult } from "./model";
import type { RoleId } from "@/lib/mlops/types";
import type { ColRole, Connection, Dataset, ModelSpec, Cadence, Recipe, RecipeSchedule, DatasetVersionEntry, AuditEntry, AuditFilter, RunRecord, RunnerPool, Step, StreamJob, RefineryAlert } from "./types";
import { setSyncOrganisation } from "./settingsSync";
import { createLiveDriver, type ConnectionTest, type LiveContext, type LiveDriver, type Result } from "./live/driver";

export type { Result };

/**
 * In memory store behind the Refinery screens in the sample workspace. It lives only in the browser tab. Nothing here is sent to the platform, and a page reload
 * starts again from the sample. The real client replaces it when the Refinery API exists (docs/46, API surface).
 */
export type State = { connections: Connection[]; datasets: Dataset[]; recipes: Recipe[]; runs: RunRecord[]; pools: RunnerPool[]; streams: StreamJob[]; schedules: RecipeSchedule[]; alerts: RefineryAlert[]; nativeLimits: NativeLimits; role: RoleId | null };

let state: State | null = null;
const listeners = new Set<() => void>();
let seq = 200;
const nid = (p: string) => `${p}_${(++seq).toString(36)}`;

function init(): State {
  const datasets = sampleDatasets(); const recipes = sampleRecipes(); const pools = samplePools();
  return { connections: sampleConnections(), datasets, recipes, pools, runs: sampleRuns(datasets, recipes, pools), streams: sampleStreams(), schedules: [], alerts: [], nativeLimits: { ...NATIVE_DEFAULTS }, role: null };
}
const get = (): State => (state ??= (mode === "live" ? emptyLive() : init()));
function set(patch: Partial<State>) { state = { ...get(), ...patch }; listeners.forEach((l) => l()); }

export function useRefinery(): State { return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, get, get); }
export const snapshot = get;
export function resetRefinery() { if (mode === "live") return; for (const t of timers.values()) clearInterval(t); timers.clear(); state = init(); listeners.forEach((l) => l()); }

// ---------------------------------------------------------------------------------------------------------------------------------------
// Two sources for the same screens. The sample workspace keeps its data in this tab and never calls the API. A signed-in workspace reads and
// writes the control plane through the live driver, and the state here is only ever a copy of what the server returned.

export type LiveStatus = { mode: "demo" | "live"; phase: "idle" | "loading" | "ready" | "error"; error?: string; partial?: string[]; loadedAt?: number };
const IDLE: LiveStatus = { mode: "demo", phase: "idle" };
let mode: "demo" | "live" = "demo";
let status: LiveStatus = IDLE;
let driver: LiveDriver | null = null;
let liveCtx: LiveContext = { orgId: null, isPlatform: false };
const statusListeners = new Set<() => void>();
function setStatus(next: LiveStatus) { status = next; statusListeners.forEach((l) => l()); listeners.forEach((l) => l()); }

function emptyLive(): State {
  return { connections: [], datasets: [], recipes: [], runs: [], pools: [], streams: [], schedules: [], alerts: [], nativeLimits: { ...NATIVE_DEFAULTS }, role: null };
}

async function hydrate() {
  if (!driver) return;
  const d = driver;
  setStatus({ mode: "live", phase: "loading" });
  const { failed } = await d.refresh();
  if (d !== driver) return;
  if (failed.length === 0) setStatus({ mode: "live", phase: "ready", loadedAt: Date.now() });
  else if (failed.length >= 2 && failed.every((f) => f.error.length > 0) && get().pools.length === 0) setStatus({ mode: "live", phase: "error", error: failed[0].error });
  else setStatus({ mode: "live", phase: "ready", partial: failed.map((f) => f.slice), loadedAt: Date.now() });
}

/** Switches the console to a signed-in workspace and loads it. Calling it again with the same organisation does nothing. */
export function connectRefineryLive(ctx: LiveContext) {
  if (mode === "live" && driver && liveCtx.orgId === ctx.orgId && liveCtx.userEmail === ctx.userEmail) return;
  disconnect(false);
  mode = "live"; liveCtx = ctx; state = emptyLive();
  driver = createLiveDriver({ state: () => get(), update: (fn) => { state = fn(get()); listeners.forEach((l) => l()); }, context: () => liveCtx });
  if (!ctx.orgId) { setStatus({ mode: "live", phase: "error", error: "Your account is not a member of an organisation yet." }); return; }
  setSyncOrganisation(ctx.orgId);
  driver.start();
  void hydrate();
}
/** Back to the sample workspace. */
export function connectRefineryDemo() { if (mode === "demo" && !driver) return; disconnect(true); }
function disconnect(notify: boolean) {
  setSyncOrganisation(null);
  driver?.stop(); driver = null; mode = "demo"; state = null; liveCtx = { orgId: null, isPlatform: false }; status = IDLE;
  if (notify) { statusListeners.forEach((l) => l()); listeners.forEach((l) => l()); }
}
export function reloadRefinery() { void hydrate(); }
export const isLiveRefinery = () => mode === "live";
export function useRefineryStatus(): LiveStatus {
  return useSyncExternalStore((l) => { listeners.add(l); return () => void listeners.delete(l); }, () => status, () => IDLE);
}
const live = () => { if (!driver) throw new Error("not connected"); return driver; };

// ------------------------------------------------------------------ connections

export type NewConnection = { name: string; connector: string; auth: string; settings: Record<string, string>; secrets: Record<string, string>; pool: string };
export function addConnection(n: NewConnection): Connection {
  const c = CONNECTOR_BY_ID.get(n.connector)!; const m = c.auth.find((a) => a.id === n.auth)!;
  const refs: Record<string, string> = {};
  // The secret values go to the secret manager and are not kept. Only the reference stays.
  for (const k of secretKeys(m)) if (n.secrets[k]) refs[k] = secretRefFor(SAMPLE_TENANT, n.name, k);
  const conn: Connection = { id: nid("conn"), name: n.name, connector: n.connector, auth: n.auth, settings: n.settings, secretRefs: refs, pool: n.pool, state: "untested", createdAt: new Date().toISOString(), createdBy: "You" };
  set({ connections: [conn, ...get().connections] });
  return conn;
}
export function removeConnection(id: string) { set({ connections: get().connections.filter((c) => c.id !== id) }); }
/** Sample test: it succeeds when every required setting is present and the method is allowed on the pool, and says which step failed otherwise. */
export function testConnection(id: string): { ok: boolean; steps: { name: string; ok: boolean; detail: string }[] } {
  const conn = get().connections.find((c) => c.id === id)!; const c = CONNECTOR_BY_ID.get(conn.connector)!; const m = c.auth.find((a) => a.id === conn.auth)!; const pool = get().pools.find((p) => p.name === conn.pool);
  const steps: { name: string; ok: boolean; detail: string }[] = [];
  const missing = c.settings.filter((f) => !f.optional && !conn.settings[f.key]);
  steps.push({ name: "Address check", ok: missing.length === 0, detail: missing.length ? `Missing: ${missing.map((f) => f.label).join(", ")}` : "The address is allowed from this pool." });
  const poolOk = !!pool && pool.status !== "offline";
  steps.push({ name: "Reach from pool", ok: poolOk, detail: poolOk ? `${pool!.name} can reach the system.` : `${conn.pool} is offline, so nothing can connect.` });
  const identityOnManaged = !!m.identity && pool?.hosting === "managed";
  steps.push({ name: "Authenticate", ok: poolOk && !identityOnManaged && missing.length === 0 && conn.state !== "failed", detail: identityOnManaged ? `${m.label} uses the runner's own identity, which a managed pool does not have inside your account. Use a customer-hosted pool.` : conn.state === "failed" ? "The system rejected the credentials. Rotate the secret and test again." : "Signed in." });
  const ok = steps.every((s) => s.ok);
  steps.push({ name: "List sample", ok, detail: ok ? "Listed a sample of tables or files." : "Not reached." });
  set({ connections: get().connections.map((x) => (x.id === id ? { ...x, state: ok ? "connected" : "failed", lastTested: new Date().toISOString() } : x)) });
  return { ok, steps };
}

// ------------------------------------------------------------------ datasets

export function addDataset(d: Omit<Dataset, "id" | "version" | "updatedAt" | "owner" | "profile"> & { profile?: Dataset["profile"] }): Dataset {
  const prev = get().datasets.find((x) => x.name === d.name);
  const ds: Dataset = { ...d, id: nid("ds"), version: (prev?.version ?? 0) + 1, updatedAt: new Date().toISOString(), owner: "You", profile: d.profile ?? profileRows(d.columns, d.sample, d.totalRows) };
  set({ datasets: [ds, ...get().datasets.filter((x) => x.name !== d.name)] });
  return ds;
}
export function setColumnRole(datasetId: string, column: string, role: ColRole) {
  set({ datasets: get().datasets.map((d) => (d.id === datasetId ? { ...d, columns: d.columns.map((c) => (c.name === column ? { ...c, role } : c)), profile: { ...d.profile, columns: d.profile.columns.map((c) => (c.name === column ? { ...c, role } : c)) } } : d)) });
}
export function removeDataset(id: string) { set({ datasets: get().datasets.filter((d) => d.id !== id) }); }

// ------------------------------------------------------------------ recipes

export function addRecipe(name: string, datasetId: string): Recipe {
  const pool = get().pools.find((p) => p.status !== "offline" && p.status !== "pending") ?? get().pools[0];
  const r: Recipe = { id: nid("rcp"), name, description: "", inputDatasetId: datasetId, steps: [], outputs: [], pool: pool.name, parallelism: Math.max(1, pool.workers * pool.coresPerWorker), partitionTargetMb: 128, version: 1, updatedAt: new Date().toISOString(), updatedBy: "You" };
  set({ recipes: [r, ...get().recipes] });
  return r;
}
export function saveRecipe(r: Recipe) { set({ recipes: get().recipes.map((x) => (x.id === r.id ? { ...r, version: x.version + 1, updatedAt: new Date().toISOString(), updatedBy: "You" } : x)) }); }
export function removeRecipe(id: string) { set({ recipes: get().recipes.filter((r) => r.id !== id) }); }
export const newStepId = (steps: Step[]) => `s${Math.max(0, ...steps.map((s) => Number(s.id.replace(/\D/g, "")) || 0)) + 1}`;
export { newStep };

// ------------------------------------------------------------------ runs (simulated in the sample workspace)

const timers = new Map<string, ReturnType<typeof setInterval>>();
/** The check the planner makes before a run on the native engine. The recipe screen shows the same result before the run is started. */
export function nativeRunCheck(recipe: Recipe) {
  const s = get(); const ds = s.datasets.find((d) => d.id === recipe.inputDatasetId); if (!ds) return null;
  const shuffle = recipe.steps.filter((st) => STEP_BY_OP.get(st.op)?.streamable === false).length;
  const running = s.runs.filter((r) => r.pool === recipe.pool && (r.status === "running" || r.status === "planning")).length;
  return checkNativeRun(s.nativeLimits, { inputBytes: ds.sizeBytes, rows: ds.totalRows, parallelism: recipe.parallelism, partitionMb: recipe.partitionTargetMb, shuffleSteps: shuffle, runningRuns: running });
}
export function nativeStreamCheck(expectedRecordsPerSec: number) {
  const s = get(); const native = new Set(s.pools.filter((p) => p.engine === "native").map((p) => p.name));
  return checkNativeStream(s.nativeLimits, { expectedRecordsPerSec, runningStreams: s.streams.filter((x) => native.has(x.pool) && x.status !== "paused" && x.status !== "failed").length });
}
export function setNativeLimits(patch: Partial<NativeLimits>): { limits: NativeLimits; clamped: string[] } {
  const { limits, clamped } = clampLimits({ ...get().nativeLimits, ...patch });
  set({ nativeLimits: limits });
  return { limits, clamped };
}
export function startRun(recipeId: string): RunRecord {
  const s = get(); const rec0 = s.recipes.find((r) => r.id === recipeId)!; const ds = s.datasets.find((d) => d.id === rec0.inputDatasetId)!; const pool = s.pools.find((p) => p.name === rec0.pool)!;
  // Guardrails of the native engine. A run that would go over them is refused at planning, and one that only needs less parallelism is slowed down.
  const guard = pool.engine === "native" ? nativeRunCheck(rec0) : null;
  const recipe = guard && guard.verdict !== "refused" ? { ...rec0, parallelism: guard.effectiveParallelism } : rec0;
  const { frames, results } = runSteps(startFrame(ds.columns, ds.sample), recipe.steps);
  const n = ds.sample.length || 1; const keepFrac = frames[frames.length - 1].rows.length / n; const rej = results.reduce((a, r) => a + r.rejected, 0) / n;
  let cost = 0; recipe.steps.forEach((st, i) => { const e = estimateAiStep(st, frames[i].rows, ds.totalRows, frames[i].rows.length); if (e) cost += e.costUsd; });
  const id = `run_${String(119 + s.runs.filter((r) => r.startedBy === "You").length + 1).padStart(4, "0")}`;
  if (guard?.verdict === "refused") {
    const failed = buildRun(id, recipe, ds, pool, { status: "failed", startedAgo: 0, durationMs: 0, by: "You", pct: 0, costUsd: 0, simulated: true });
    failed.log = [...failed.log, { t: new Date().toISOString(), level: "error" as const, src: "guardrail", msg: `refused by the native engine limits. ${guard.reasons.join(" ")}${guard.alternative ? ` Run it on ${guard.alternative === "single" ? "a single node runner" : "Spark"} instead.` : ""}` }];
    set({ runs: [failed, ...s.runs], recipes: s.recipes.map((r) => (r.id === recipeId ? { ...r, lastRunId: id } : r)) });
    return failed;
  }
  const offline = pool.status === "offline" || pool.status === "pending" || (!!guard && guard.queued);
  const base = buildRun(id, recipe, ds, pool, { status: offline ? "queued" : "planning", startedAgo: 0, durationMs: 0, by: "You", pct: 0, costUsd: Math.round(cost * 100) / 100, simulated: true });
  if (guard && guard.reasons.length) base.log = [...base.log, ...guard.reasons.filter((x) => !x.startsWith("The native engine is the slowest")).map((msg) => ({ t: new Date().toISOString(), level: "warn" as const, src: "guardrail", msg }))];
  set({ runs: [base, ...s.runs], recipes: s.recipes.map((r) => (r.id === recipeId ? { ...r, lastRunId: id } : r)) });
  if (!offline) {
    const t0 = Date.now(); let pct = 0;
    const timer = setInterval(() => {
      pct = Math.min(100, pct + 6 + Math.random() * 7);
      const done = pct >= 100;
      const cur = get().runs.find((r) => r.id === id);
      if (!cur || cur.status === "cancelled") { clearInterval(timer); timers.delete(id); return; }
      const next = buildRun(id, recipe, ds, pool, { status: done ? "succeeded" : "running", startedAgo: Date.now() - t0, durationMs: Date.now() - t0, by: "You", pct, costUsd: Math.round(cost * 100) / 100, simulated: true });
      next.startedAt = base.startedAt;
      set({ runs: get().runs.map((r) => (r.id === id ? next : r)) });
      if (done) { clearInterval(timer); timers.delete(id); }
    }, 900);
    timers.set(id, timer);
  }
  return base;
}
export function cancelRun(id: string) {
  const t = timers.get(id); if (t) { clearInterval(t); timers.delete(id); }
  set({ runs: get().runs.map((r) => (r.id === id ? { ...r, status: "cancelled", log: [...r.log, { t: new Date().toISOString(), level: "warn" as const, src: "scheduler", msg: "run cancelled by You. Temporary output was removed." }] } : r)) });
}

// ------------------------------------------------------------------ runner pools

export type NewPool = Pick<RunnerPool, "name" | "hosting" | "engine" | "region" | "workersMin" | "workersMax" | "coresPerWorker" | "memGbPerWorker" | "concurrency" | "network"> & { flink?: RunnerPool["flink"] };
export function addPool(p: NewPool): { pool: RunnerPool; token: string | null } {
  // A Flink cluster you already run is reached by a runner next to it, so it enrolls like any pool you host.
  const managed = p.hosting === "managed";
  const pool: RunnerPool = { ...p, id: p.name, workers: managed ? p.workersMin : 0, running: 0, queued: 0, cpuPct: 0, memPct: 0, status: managed ? "online" : "pending", version: "0.1.0", lastSeen: new Date().toISOString() };
  set({ pools: [pool, ...get().pools] });
  // The sample token is random text. A real one is issued by the control plane, shown once and exchanged for a short lived credential.
  const token = managed ? null : `rfn_enroll_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
  return { pool, token };
}
export function resizePool(id: string, workers: number) { set({ pools: get().pools.map((p) => (p.id === id && !p.builtIn ? { ...p, workers: Math.max(p.workersMin, Math.min(p.workersMax, workers)), status: "scaling" } : p)) }); }
export function removePool(id: string) { set({ pools: get().pools.filter((p) => p.id !== id || p.builtIn) }); }
export function markPoolOnline(id: string) { set({ pools: get().pools.map((p) => (p.id === id ? { ...p, status: "online", workers: p.workersMin, lastSeen: new Date().toISOString() } : p)) }); }

// ------------------------------------------------------------------ streams

export function setStreamStatus(id: string, status: StreamJob["status"]) { set({ streams: get().streams.map((s) => (s.id === id ? { ...s, status, inRate: status === "running" ? Math.max(s.inRate, 600) : 0, outRate: status === "running" ? Math.max(s.outRate, 590) : 0 } : s)) }); }

export type NewStream = Pick<StreamJob, "name" | "kind" | "recipeName" | "source" | "sink" | "pool" | "delivery" | "mode" | "primaryKey" | "destKind" | "snapshot" | "flushSeconds" | "schemaEvolution" | "system" | "startFrom">;
/** Starts a stream in the sample workspace. It goes through starting, an initial snapshot if asked for, then running at a made-up steady rate. */
export function addStream(n: NewStream): StreamJob {
  const id = `str_${n.name.replace(/[^a-z0-9]+/g, "_")}`;
  const flat = Array.from({ length: 30 }, (_, i) => ({ t: new Date(Date.now() - (29 - i) * 60_000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), inRate: 0, outRate: 0, lag: 0 }));
  const job: StreamJob = { ...n, id, status: "starting", inRate: 0, outRate: 0, lag: 0, errPct: 0, latencyMs: 0, checkpointAgeS: 0, deadLetters: 0, series: flat };
  set({ streams: [job, ...get().streams] });
  setTimeout(() => { set({ streams: get().streams.map((s) => (s.id === id ? { ...s, status: n.snapshot ? "snapshotting" : "running", inRate: n.snapshot ? 5200 : 640, outRate: n.snapshot ? 5120 : 632, lag: n.snapshot ? 180_000 : 300, latencyMs: 240 } : s)) }); }, 1500);
  setTimeout(() => { set({ streams: get().streams.map((s) => (s.id === id && s.status === "snapshotting" ? { ...s, status: "running", inRate: 640, outRate: 632, lag: 420 } : s)) }); }, 9000);
  return job;
}

// ------------------------------------------------------------------ one facade for both sources

/**
 * What the screens call. In the sample workspace each action runs against the in-tab store and resolves at once. In a signed-in workspace it goes to the
 * control plane and resolves when the server has answered. Screens await it and show the error text when `ok` is false.
 */
const ok = <T,>(v: T): Result<T> => ({ ok: true, ...(v as object) } as Result<T>);
export type NewDataset = Parameters<typeof addDataset>[0];
export const refinery = {
  async createStream(d: NewStream): Promise<Result<{ stream: StreamJob }>> {
    if (mode === "live") return live().actions.createStream(d as never);
    return ok({ stream: addStream(d) });
  },
  async setStreamStatus(id: string, status: "running" | "paused"): Promise<Result> {
    if (mode === "live") return status === "paused" ? live().actions.pauseStream(id) : live().actions.resumeStream(id);
    setStreamStatus(id, status); return ok({});
  },
  async removeStream(id: string): Promise<Result> {
    if (mode === "live") return live().actions.removeStream(id);
    return ok({});
  },
  async startRun(recipeId: string): Promise<Result<{ run: RunRecord }>> {
    if (mode === "live") return live().actions.startRun(recipeId);
    return ok({ run: startRun(recipeId) });
  },
  async cancelRun(id: string): Promise<Result> {
    if (mode === "live") return live().actions.cancelRun(id);
    cancelRun(id); return ok({});
  },
  async createRecipe(name: string, datasetId: string): Promise<Result<{ recipe: Recipe }>> {
    if (mode === "live") return live().actions.createRecipe(name, datasetId);
    return ok({ recipe: addRecipe(name, datasetId) });
  },
  async saveRecipe(r: Recipe): Promise<Result<{ recipe: Recipe }>> {
    if (mode === "live") return live().actions.saveRecipe(r);
    saveRecipe(r); return ok({ recipe: get().recipes.find((x) => x.id === r.id)! });
  },
  /** The audit trail. Only a signed-in workspace has one, and only an admin can read it. */
  async auditPage(f: AuditFilter, page: number, size: number): Promise<Result<{ entries: AuditEntry[]; total: number; pages: number }>> {
    if (mode !== "live") return { ok: false, error: "The activity trail is kept by the server. Sign in to read it." };
    return live().actions.auditPage(f, page, size);
  },
  async auditCsv(f: AuditFilter): Promise<Result<{ blob: Blob }>> {
    if (mode !== "live") return { ok: false, error: "The activity trail is kept by the server. Sign in to export it." };
    return live().actions.auditCsv(f);
  },
  /** The stored versions of an uploaded dataset. Only a signed-in workspace keeps them. */
  async datasetVersions(id: string): Promise<Result<{ versions: DatasetVersionEntry[] }>> {
    if (mode !== "live") return { ok: false, error: "Versions are kept by the server. Sign in to see them." };
    return live().actions.datasetVersions(id);
  },
  async restoreDatasetVersion(id: string, version: number): Promise<Result<{ dataset: Dataset }>> {
    if (mode !== "live") return { ok: false, error: "Versions are kept by the server. Sign in to restore one." };
    return live().actions.restoreDatasetVersion(id, version);
  },
  /** Schedules start runs on the server, so they exist only in a signed-in workspace. */
  async putSchedule(recipeId: string, body: { enabled: boolean; cadence: Cadence }): Promise<Result<{ schedule: RecipeSchedule }>> {
    if (mode !== "live") return { ok: false, error: "Schedules start runs on the server. Sign in to use them." };
    return live().actions.putSchedule(recipeId, body);
  },
  async removeSchedule(recipeId: string): Promise<Result> {
    if (mode !== "live") return { ok: false, error: "Schedules start runs on the server. Sign in to use them." };
    return live().actions.removeSchedule(recipeId);
  },
  /** Alerts are raised by the server, so a signed-in workspace has them and the sample workspace does not. */
  async acknowledgeAlert(id: string): Promise<Result> {
    if (mode !== "live") return { ok: false, error: "Alerts are raised by the server. Sign in to use them." };
    return live().actions.acknowledgeAlert(id);
  },
  async removeRecipe(id: string): Promise<Result> {
    if (mode === "live") return live().actions.removeRecipe(id);
    removeRecipe(id); return ok({});
  },
  async createModel(name: string, description: string, spec: ModelSpec, local: NewDataset): Promise<Result<{ dataset: Dataset }>> {
    if (mode === "live") return live().actions.createModel(name, description, spec);
    return ok({ dataset: addDataset(local) });
  },
  /** In the sample workspace the file was read in the browser and `local` is what it found. In a signed-in workspace the server reads the file itself. */
  async uploadDataset(file: File, name: string, description: string, local: NewDataset): Promise<Result<{ dataset: Dataset }>> {
    if (mode === "live") return live().actions.uploadDataset(file, name, description);
    return ok({ dataset: addDataset(local) });
  },
  /** Loads the sample rows of one dataset. Only a signed-in workspace needs it. */
  async openDataset(id: string): Promise<Result> {
    if (mode !== "live") return ok({});
    const r = await live().actions.loadDataset(id); return r.ok ? ok({}) : r;
  },
  async setColumnRole(id: string, column: string, role: ColRole): Promise<Result> {
    if (mode === "live") return live().actions.setColumnRole(id, column, role);
    setColumnRole(id, column, role); return ok({});
  },
  async reprofileDataset(id: string): Promise<Result> {
    if (mode === "live") return live().actions.reprofileDataset(id);
    return ok({});
  },
  async removeDataset(id: string): Promise<Result> {
    if (mode === "live") return live().actions.removeDataset(id);
    removeDataset(id); return ok({});
  },
  async createConnection(n: NewConnection): Promise<Result<{ connection: Connection }>> {
    if (mode === "live") return live().actions.createConnection(n);
    return ok({ connection: addConnection(n) });
  },
  async testConnection(id: string): Promise<Result<ConnectionTest>> {
    if (mode === "live") return live().actions.testConnection(id);
    const r = testConnection(id);
    return ok({ passed: r.ok, queued: false, checked: true, message: r.steps.find((x) => !x.ok)?.detail ?? "", steps: r.steps });
  },
  /** Secrets live in the secret store behind a server, so a signed-in workspace rotates them and the sample workspace holds none. */
  async rotateConnectionSecret(id: string, key: string, value: string): Promise<Result> {
    if (mode !== "live") return { ok: false, error: "Secrets are kept by the server. Sign in to rotate one." };
    return live().actions.rotateConnectionSecret(id, key, value);
  },
  async reenrollPool(id: string): Promise<Result<{ token: string | null; expiresAt: string | null }>> {
    if (mode !== "live") return { ok: false, error: "Runners enroll with a server issued token. Sign in to issue one." };
    return live().actions.reenrollPool(id);
  },
  /** The server's answer for where a draft would run. The sample workspace uses the in-browser check instead, so this returns nothing there. */
  async planRecipe(r: Recipe): Promise<Result<{ check: NativeCheck | null; runnable: boolean; reasons: string[] }>> {
    if (mode !== "live") return { ok: false, error: "Plans come from the server. Sign in to use them." };
    return live().actions.planRecipe(r);
  },
  /** The server's join of the samples. The sample workspace runs the in-browser join instead, so this returns nothing there. */
  async previewModel(name: string, spec: ModelSpec): Promise<Result<{ check: ModelCheck; result: ModelResult | null; sql: string }>> {
    if (mode !== "live") return { ok: false, error: "Previews come from the server. Sign in to use them." };
    return live().actions.previewModel(name, spec);
  },
  async removeConnection(id: string): Promise<Result> {
    if (mode === "live") return live().actions.removeConnection(id);
    removeConnection(id); return ok({});
  },
  async createPool(p: NewPool): Promise<Result<{ pool: RunnerPool; token: string | null }>> {
    if (mode === "live") return live().actions.createPool(p);
    return ok(addPool(p));
  },
  /** The sample workspace scales a pool by hand. A signed-in workspace sets the range the pool may scale within, and the pool scales itself inside it. */
  async resizePool(pool: RunnerPool, workers: number): Promise<Result> {
    if (mode === "live") return live().actions.resizePool(pool.id, Math.min(pool.workersMin, workers), Math.max(pool.workersMax, workers));
    resizePool(pool.id, workers); return ok({});
  },
  async setWorkerRange(pool: RunnerPool, workersMin: number, workersMax: number): Promise<Result> {
    if (mode === "live") return live().actions.resizePool(pool.id, workersMin, workersMax);
    set({ pools: get().pools.map((p) => (p.id === pool.id ? { ...p, workersMin, workersMax, workers: Math.max(workersMin, Math.min(workersMax, p.workers)) } : p)) }); return ok({});
  },
  async removePool(id: string): Promise<Result> {
    if (mode === "live") return live().actions.removePool(id);
    removePool(id); return ok({});
  },
  async saveLimits(patch: Partial<NativeLimits>): Promise<Result<{ limits: NativeLimits; clamped: string[] }>> {
    if (mode === "live") return live().actions.saveLimits({ ...get().nativeLimits, ...patch });
    return ok(setNativeLimits(patch));
  },
};
