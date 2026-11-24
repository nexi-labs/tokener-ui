/**
 * The live driver for the Refinery: reads the control plane into the console's state and carries out every write the console offers. It is used
 * when a person is signed in to a real workspace. The sample workspace never touches it. Each action calls one route, then reloads what the
 * route changed, so the screens show what the server says rather than what the browser guessed.
 */
import { ApiError, http, type Paged } from "@/lib/api/client";
import type { State } from "../store";
import type { NativeLimits } from "../engines";
import type { NativeCheck } from "../engines";
import type { ModelCheck, ModelResult } from "../model";
import type { RoleId } from "@/lib/mlops/types";
import type { ColRole, Connection, Dataset, ModelSpec, Cadence, Recipe, RecipeSchedule, DatasetVersionEntry, AuditEntry, AuditFilter, RunRecord, RunnerPool, StreamJob } from "../types";
import { isActiveRun, poolIdOf, recipeBody, toConnection, toDataset, toLimits, toPool, toRecipe, toRun, toAudit, toAlert, toSchedule, toStream, toVersion, type LimitsView } from "./mappers";

export type Result<T = {}> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

export type Slice = "pools" | "limits" | "connections" | "datasets" | "recipes" | "runs" | "streams" | "schedules" | "alerts" | "me";
/** Pools come first: the other slices name their pool by id and the console shows its name. */
export const ALL_SLICES: Slice[] = ["pools", "limits", "connections", "datasets", "recipes", "runs", "streams", "schedules", "alerts", "me"];

export type LiveContext = { orgId: string | null; isPlatform: boolean; userEmail?: string };
export type Port = { state: () => State; update: (fn: (s: State) => State) => void; context: () => LiveContext };

type J = Record<string, any>;

export type NewPoolBody = Pick<RunnerPool, "name" | "hosting" | "engine" | "region" | "workersMin" | "workersMax" | "coresPerWorker" | "memGbPerWorker" | "concurrency" | "network"> & { flink?: RunnerPool["flink"] };

export type NewConnectionBody = { name: string; connector: string; auth: string; settings: Record<string, string>; secrets: Record<string, string>; pool: string };
export type NewStreamBody = Record<string, unknown> & { name: string; pool: string };
export type ConnectionTest = { passed: boolean; queued: boolean; checked: boolean; message: string; steps: { name: string; ok: boolean; detail: string }[] };

export function createLiveDriver(port: Port) {
  const org = () => {
    const id = port.context().orgId;
    if (!id) throw new ApiError(0, "no_organisation", "Choose an organisation before using the Refinery.");
    return `/api/v1/orgs/${encodeURIComponent(id)}/refinery`;
  };

  async function run<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
    try { return await fn(); }
    catch (e) {
      if (e instanceof ApiError) return fail(e.message);
      return fail(e instanceof Error ? e.message : "Something went wrong. Try again.");
    }
  }

  // ------------------------------------------------------------------------------------------ reading

  /** Reads every page of a list route. The routes cap a page at 100 rows. */
  async function all<T>(path: string, query: Record<string, string | number> = {}): Promise<T[]> {
    const out: T[] = [];
    for (let page = 1; page <= 50; page++) {
      const x = await http.get<Paged<T>>(path, { ...query, page, size: 100 });
      out.push(...x.content);
      if (page >= x.totalPages) break;
    }
    return out;
  }

  let limitsView: LimitsView | null = null;
  const loaders: Record<Slice, () => Promise<void>> = {
    pools: async () => { const x = await http.get<J[]>(`${org()}/pools`); port.update((s) => ({ ...s, pools: x.map(toPool) })); },
    connections: async () => { const x = await all<J>(`${org()}/connections`); port.update((s) => ({ ...s, connections: x.map((c) => toConnection(c, s.pools)) })); },
    datasets: async () => {
      const x = await all<J>(`${org()}/datasets`);
      // Keep a sample that was already loaded for a dataset that has not changed, so the recipe editor does not flash empty.
      port.update((s) => ({ ...s, datasets: x.map((a) => { const d = toDataset(a); const old = s.datasets.find((o) => o.id === d.id && o.version === d.version); return old && old.sample.length ? { ...d, sample: old.sample } : d; }) }));
    },
    recipes: async () => { const x = await all<J>(`${org()}/recipes`); port.update((s) => ({ ...s, recipes: x.map((r) => toRecipe(r, s.pools)) })); },
    runs: async () => { const x = await http.get<Paged<J>>(`${org()}/runs`, { page: 1, size: 100 }); port.update((s) => ({ ...s, runs: x.content.map((r) => toRun(r, s.pools)) })); watchActive(); },
    me: async () => { const x = await http.get<J>(`${org()}/me`); port.update((s) => ({ ...s, role: x.role as RoleId })); },
    alerts: async () => { const x = await http.get<J[]>(`${org()}/alerts`, { limit: 100 }); port.update((s) => ({ ...s, alerts: x.map(toAlert) })); },
    schedules: async () => { const x = await all<J>(`${org()}/schedules`); port.update((s) => ({ ...s, schedules: x.map(toSchedule) })); },
    streams: async () => { const x = await all<J>(`${org()}/streams`); port.update((s) => ({ ...s, streams: x.map((a) => toStream(a, s.pools)) })); },
    limits: async () => { limitsView = toLimits(await http.get<J>(`${org()}/engines/native/limits`)); const l = limitsView.limits; port.update((s) => ({ ...s, nativeLimits: l })); },
  };

  /** Loads the given slices side by side. A slice that fails keeps its last value and is reported, so one broken screen never blanks the others. */
  async function refresh(slices: Slice[] = ALL_SLICES): Promise<{ failed: { slice: Slice; error: string }[] }> {
    // Pools are read before anything that names one, so the names can be translated.
    const first = slices.includes("pools") ? [await Promise.allSettled([loaders.pools()])] : [];
    const rest = slices.filter((x) => x !== "pools");
    const results = [...(first.length ? first[0] : []), ...(await Promise.allSettled(rest.map((s) => loaders[s]())))];
    const ordered = [...(slices.includes("pools") ? ["pools" as Slice] : []), ...rest];
    const failed: { slice: Slice; error: string }[] = [];
    results.forEach((r, i) => { if (r.status === "rejected") failed.push({ slice: ordered[i], error: r.reason instanceof ApiError ? r.reason.message : "Could not load" }); });
    return { failed };
  }

  // ------------------------------------------------------------------------------------------ polling

  /** A run that is still going is read once a second, so its progress moves on screen. The slower poll below does not wait for it. */
  let watcher: ReturnType<typeof setInterval> | null = null;
  function mergeRun(r: RunRecord) { port.update((s) => ({ ...s, runs: s.runs.some((x) => x.id === r.id) ? s.runs.map((x) => (x.id === r.id ? r : x)) : [r, ...s.runs] })); }
  function watchActive() {
    const active = port.state().runs.filter((r) => isActiveRun(r.status));
    if (!active.length) { if (watcher) { clearInterval(watcher); watcher = null; } return; }
    if (watcher) return;
    watcher = setInterval(async () => {
      const now = port.state().runs.filter((r) => isActiveRun(r.status));
      if (!now.length) { watchActive(); return; }
      await Promise.allSettled(now.map(async (r) => { const fresh = toRun(await http.get<J>(`${org()}/runs/${encodeURIComponent(r.id)}`), port.state().pools); mergeRun(fresh); if (!isActiveRun(fresh.status)) void refresh(["recipes", "datasets"]); }));
      watchActive();
    }, 1000);
  }

  let timer: ReturnType<typeof setInterval> | null = null;
  let busy = false;
  async function poll() {
    if (busy || (typeof document !== "undefined" && document.hidden)) return;
    busy = true;
    try { await refresh(["pools", "connections", "runs", "streams", "schedules", "alerts"]); } finally { busy = false; }
  }
  const start = () => { if (!timer) timer = setInterval(() => { void poll(); }, 5000); };
  const stop = () => { if (timer) clearInterval(timer); timer = null; if (watcher) clearInterval(watcher); watcher = null; };

  // ------------------------------------------------------------------------------------------ writing

  /** Reads one dataset with its sample rows. The list leaves them out because they are the heavy part. */
  async function loadDataset(id: string): Promise<Result<{ dataset: Dataset }>> {
    return run(async () => {
      const d = toDataset(await http.get<J>(`${org()}/datasets/${encodeURIComponent(id)}`));
      port.update((s) => ({ ...s, datasets: s.datasets.some((x) => x.id === id) ? s.datasets.map((x) => (x.id === id ? d : x)) : [d, ...s.datasets] }));
      return { ok: true as const, dataset: d };
    });
  }

  const actions = {
    /** A pool you host is created pending. The token that enrolls its runner is returned once and never again. */
    async createPool(p: NewPoolBody): Promise<Result<{ pool: RunnerPool; token: string | null }>> {
      return run(async () => {
        const out = await http.post<J>(`${org()}/pools`, p);
        await refresh(["pools"]);
        return { ok: true as const, pool: toPool(out.pool), token: (out.enrollmentToken as string | undefined) ?? null };
      });
    },
    async resizePool(id: string, workersMin: number, workersMax: number): Promise<Result> {
      return run(async () => { await http.patch(`${org()}/pools/${encodeURIComponent(id)}`, { workersMin, workersMax }); await refresh(["pools"]); return { ok: true as const }; });
    },
    async removePool(id: string): Promise<Result> {
      return run(async () => { await http.delete(`${org()}/pools/${encodeURIComponent(id)}`); await refresh(["pools"]); return { ok: true as const }; });
    },
    async createConnection(n: NewConnectionBody): Promise<Result<{ connection: Connection }>> {
      return run(async () => {
        const pools = port.state().pools;
        const out = await http.post<J>(`${org()}/connections`, { name: n.name, connector: n.connector, auth: n.auth, settings: n.settings, secretValues: n.secrets, pool: poolIdOf(pools, n.pool) });
        await refresh(["connections"]);
        return { ok: true as const, connection: toConnection(out, pools) };
      });
    },
    /** A pool that hosts itself tests the connection from inside its network, so the answer can arrive later. The screens show the state the server holds. */
    async testConnection(id: string): Promise<Result<ConnectionTest>> {
      return run(async () => {
        const out = await http.post<J>(`${org()}/connections/${encodeURIComponent(id)}:test`, {});
        await refresh(["connections"]);
        const c = port.state().connections.find((x) => x.id === id);
        const queued = !!out.queued; const checked = out.checked !== false; const good = checked && !queued && c?.state === "connected";
        const message = String(out.message ?? "");
        return { ok: true as const, passed: good, queued, checked, message, steps: [{ name: queued ? "Queued for the runner pool" : checked ? "Reach the system" : "Not tested", ok: queued || good || !checked, detail: message }] };
      });
    },
    /** Replaces one secret of a connection. The value goes to the secret store and is never read back. The connection returns to untested. */
    async rotateConnectionSecret(id: string, key: string, value: string): Promise<Result> {
      return run(async () => { await http.post(`${org()}/connections/${encodeURIComponent(id)}:rotate`, { key, value }); await refresh(["connections"]); return { ok: true as const }; });
    },
    /** Issues a new enrollment token for a pool whose runner has to enroll again. The old credential stops working and the token is shown once. */
    async reenrollPool(id: string): Promise<Result<{ token: string | null; expiresAt: string | null }>> {
      return run(async () => {
        const out = await http.post<J>(`${org()}/pools/${encodeURIComponent(id)}:reenroll`, {});
        await refresh(["pools"]);
        return { ok: true as const, token: (out.enrollmentToken as string | undefined) ?? null, expiresAt: (out.expiresAt as string | undefined) ?? null };
      });
    },
    async removeConnection(id: string): Promise<Result> {
      return run(async () => { await http.delete(`${org()}/connections/${encodeURIComponent(id)}`); await refresh(["connections"]); return { ok: true as const }; });
    },
    loadDataset,
    /** The server reads the file, finds the columns and types, and profiles it. A name that already exists becomes the next version. */
    async uploadDataset(file: File, name: string, description: string): Promise<Result<{ dataset: Dataset }>> {
      return run(async () => {
        const created = toDataset(await http.post<J>(`${org()}/datasets/uploads`, file, { query: { fileName: file.name, name, description }, headers: { "Content-Type": file.type || "application/octet-stream" } }));
        await refresh(["datasets"]);
        const loaded = await loadDataset(created.id);
        return { ok: true as const, dataset: loaded.ok ? loaded.dataset : created };
      });
    },
    /** The server checks the definition again, reads the source tables itself and saves the unified dataset as a new dataset. */
    async createModel(name: string, description: string, spec: ModelSpec): Promise<Result<{ dataset: Dataset }>> {
      return run(async () => {
        const created = toDataset(await http.post<J>(`${org()}/models`, { name, description, spec }));
        await refresh(["datasets"]);
        const loaded = await loadDataset(created.id);
        return { ok: true as const, dataset: loaded.ok ? loaded.dataset : created };
      });
    },
    /** The server joins the samples it holds and answers with the rows, the statistics of each join and the SQL, so the preview is what a save would produce. */
    async previewModel(name: string, spec: ModelSpec): Promise<Result<{ check: ModelCheck; result: ModelResult | null; sql: string }>> {
      return run(async () => {
        const out = await http.post<J>(`${org()}/models/preview`, { name, spec });
        const c = (out.check ?? {}) as J;
        return { ok: true as const, check: { errors: (c.errors as string[] | undefined) ?? [], warnings: (c.warnings as string[] | undefined) ?? [] }, result: (out.result as ModelResult | null | undefined) ?? null, sql: (out.sql as string | null | undefined) ?? "" };
      });
    },
    async setColumnRole(id: string, column: string, role: ColRole): Promise<Result> {
      return run(async () => {
        const d = toDataset(await http.patch<J>(`${org()}/datasets/${encodeURIComponent(id)}`, { roles: { [column]: role } }));
        port.update((s) => ({ ...s, datasets: s.datasets.map((x) => (x.id === id ? { ...d, sample: x.sample.length ? x.sample : d.sample } : x)) }));
        return { ok: true as const };
      });
    },
    async reprofileDataset(id: string): Promise<Result> {
      return run(async () => { await http.post(`${org()}/datasets/${encodeURIComponent(id)}:reprofile`, {}); await loadDataset(id); return { ok: true as const }; });
    },
    async removeDataset(id: string): Promise<Result> {
      return run(async () => { await http.delete(`${org()}/datasets/${encodeURIComponent(id)}`); await refresh(["datasets"]); return { ok: true as const }; });
    },
    /** A new recipe starts with one output, because the API will not save a recipe that writes nowhere. The pool defaults to the platform engine. */
    async createRecipe(name: string, datasetId: string): Promise<Result<{ recipe: Recipe }>> {
      return run(async () => {
        const s = port.state(); const ds = s.datasets.find((d) => d.id === datasetId);
        const pool = s.pools.find((p) => p.builtIn) ?? s.pools.find((p) => p.status !== "offline" && p.status !== "pending") ?? s.pools[0];
        const base = (ds?.name ?? "output").replace(/[^a-z0-9_]/g, "_").replace(/^[^a-z]+/, "d");
        const out = await http.post<J>(`${org()}/recipes`, { name, description: "", inputDatasetId: datasetId, steps: [], outputs: [{ name: `${base}_clean`, kind: "dataset", target: "", format: "csv" }], pool: pool ? pool.id : "platform-native" });
        await refresh(["recipes"]);
        return { ok: true as const, recipe: toRecipe(out, port.state().pools) };
      });
    },
    /** Asks the server where a draft would run and whether the limits allow it, so the answer is the one a real run would get. */
    async planRecipe(r: Recipe): Promise<Result<{ check: NativeCheck | null; runnable: boolean; reasons: string[] }>> {
      return run(async () => {
        const out = await http.post<J>(`${org()}/recipes/plan`, recipeBody(r, port.state().pools));
        const c = out.check as J | null | undefined;
        const check: NativeCheck | null = c ? { verdict: c.verdict as NativeCheck["verdict"], effectiveParallelism: Number(c.effectiveParallelism ?? 0), peakMemoryMb: Number(c.peakMemoryMb ?? 0), queued: !!c.queued, reasons: (c.reasons as string[] | undefined) ?? [], alternative: c.alternative ? (String(c.alternative).toLowerCase() as NativeCheck["alternative"]) : null } : null;
        return { ok: true as const, check, runnable: out.runnable !== false, reasons: (out.reasons as string[] | undefined) ?? [] };
      });
    },
    async saveRecipe(r: Recipe): Promise<Result<{ recipe: Recipe }>> {
      return run(async () => {
        const out = await http.put<J>(`${org()}/recipes/${encodeURIComponent(r.id)}`, recipeBody(r, port.state().pools));
        await refresh(["recipes"]);
        return { ok: true as const, recipe: toRecipe(out, port.state().pools) };
      });
    },
    async removeRecipe(id: string): Promise<Result> {
      return run(async () => { await http.delete(`${org()}/recipes/${encodeURIComponent(id)}`); await refresh(["recipes", "schedules"]); return { ok: true as const }; });
    },
    async auditPage(f: AuditFilter, page: number, size: number): Promise<Result<{ entries: AuditEntry[]; total: number; pages: number }>> {
      return run(async () => {
        const out = await http.get<{ content: J[]; totalElements: number; totalPages: number }>(`${org()}/audit`, { ...f, page: page + 1, size });
        return { ok: true as const, entries: out.content.map(toAudit), total: (out.totalElements ?? 0), pages: (out.totalPages ?? 1) };
      });
    },
    /** The trail as a CSV file the browser can save. */
    async auditCsv(f: AuditFilter): Promise<Result<{ blob: Blob }>> {
      return run(async () => { const res = await http.get<Response>(`${org()}/audit/export`, { ...f }, { raw: true }); return { ok: true as const, blob: await res.blob() }; });
    },
    async datasetVersions(id: string): Promise<Result<{ versions: DatasetVersionEntry[] }>> {
      return run(async () => { const out = await http.get<J[]>(`${org()}/datasets/${encodeURIComponent(id)}/versions`); return { ok: true as const, versions: out.map(toVersion) }; });
    },
    async restoreDatasetVersion(id: string, version: number): Promise<Result<{ dataset: Dataset }>> {
      return run(async () => {
        const created = toDataset(await http.post<J>(`${org()}/datasets/${encodeURIComponent(id)}/versions/${version}:restore`, {}));
        await refresh(["datasets"]);
        const loaded = await loadDataset(created.id);
        return { ok: true as const, dataset: loaded.ok ? loaded.dataset : created };
      });
    },
    async putSchedule(recipeId: string, body: { enabled: boolean; cadence: Cadence }): Promise<Result<{ schedule: RecipeSchedule }>> {
      return run(async () => { const out = await http.put<J>(`${org()}/recipes/${encodeURIComponent(recipeId)}/schedule`, body); await refresh(["schedules"]); return { ok: true as const, schedule: toSchedule(out) }; });
    },
    async acknowledgeAlert(id: string): Promise<Result> {
      return run(async () => { await http.post(`${org()}/alerts/${encodeURIComponent(id)}:acknowledge`, {}); await refresh(["alerts"]); return { ok: true as const }; });
    },
    async removeSchedule(recipeId: string): Promise<Result> {
      return run(async () => { await http.delete(`${org()}/recipes/${encodeURIComponent(recipeId)}/schedule`); await refresh(["schedules"]); return { ok: true as const }; });
    },
    /** Starts a run. The key makes a repeated click return the run it already started instead of starting another. */
    async startRun(recipeId: string): Promise<Result<{ run: RunRecord; replayed: boolean }>> {
      return run(async () => {
        const key = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const out = await http.post<J>(`${org()}/recipes/${encodeURIComponent(recipeId)}:run`, {}, { headers: { "Idempotency-Key": key } });
        const r = toRun(out, port.state().pools);
        mergeRun(r); watchActive(); void refresh(["recipes"]);
        return { ok: true as const, run: r, replayed: false };
      });
    },
    async cancelRun(id: string): Promise<Result> {
      return run(async () => { mergeRun(toRun(await http.post<J>(`${org()}/runs/${encodeURIComponent(id)}:cancel`, {}), port.state().pools)); return { ok: true as const }; });
    },
    /** The control plane starts the stream on its pool. The pool's engine reports its figures once it has started, so a new stream reads "starting" until then. */
    async createStream(d: NewStreamBody): Promise<Result<{ stream: StreamJob }>> {
      return run(async () => {
        const out = await http.post<J>(`${org()}/streams`, { ...d, pool: poolIdOf(port.state().pools, d.pool) });
        await refresh(["streams"]);
        return { ok: true as const, stream: toStream((out.stream ?? out) as J, port.state().pools) };
      });
    },
    async pauseStream(id: string): Promise<Result> { return run(async () => { await http.post(`${org()}/streams/${encodeURIComponent(id)}:pause`, {}); await refresh(["streams"]); return { ok: true as const }; }); },
    async resumeStream(id: string): Promise<Result> { return run(async () => { await http.post(`${org()}/streams/${encodeURIComponent(id)}:resume`, {}); await refresh(["streams"]); return { ok: true as const }; }); },
    async removeStream(id: string): Promise<Result> { return run(async () => { await http.delete(`${org()}/streams/${encodeURIComponent(id)}`); await refresh(["streams"]); return { ok: true as const }; }); },
    /** Saves the native engine limits. The platform keeps them inside its ceilings and says which it changed. */
    async saveLimits(next: NativeLimits): Promise<Result<{ limits: NativeLimits; clamped: string[] }>> {
      return run(async () => {
        const v = toLimits(await http.put<J>(`${org()}/engines/native/limits`, next));
        limitsView = v;
        port.update((s) => ({ ...s, nativeLimits: v.limits }));
        return { ok: true as const, limits: v.limits, clamped: v.clamped };
      });
    },
  };

  return { refresh, start, stop, actions, limits: () => limitsView };
}
export type LiveDriver = ReturnType<typeof createLiveDriver>;
