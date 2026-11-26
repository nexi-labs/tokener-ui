/**
 * The live driver for Crucible: reads the training service into the console's state and carries out every write the console offers. It is used when a person is signed in to
 * a real workspace. The sample workspace never touches it. Each action calls one route and then reloads what the route changed, so the screens show what the server says.
 */
import { ApiError, http } from "@/lib/api/client";
import type { LiveState } from "./store";
import type { AuditPage, Comparison, DatasetEntry, Experiment, IssuedKey, Key, LineageLink, Machine, MachineRow, MetricSeries, Me, NewExperiment, NewProject, NewStore, Project, ProjectRow, Result, Run, Store, StoreCheck } from "./types";

const fail = (error: string, code?: string): { ok: false; error: string; code?: string } => ({ ok: false, error, code });

export type Slice = "me" | "projects" | "experiments" | "stores" | "datasets";
export const ALL_SLICES: Slice[] = ["me", "stores", "projects", "experiments", "datasets"];
export type LiveContext = { orgId: string | null; isPlatform: boolean; userEmail?: string };
export type Port = { state: () => LiveState; update: (fn: (s: LiveState) => LiveState) => void; context: () => LiveContext };

export function createLiveDriver(port: Port) {
  const org = () => {
    const id = port.context().orgId;
    if (!id) throw new ApiError(0, "no_organisation", "Choose an organisation before using Crucible.");
    return `/api/v1/orgs/${encodeURIComponent(id)}/crucible`;
  };
  const enc = encodeURIComponent;

  async function run<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
    try { return await fn(); }
    catch (e) {
      if (e instanceof ApiError) return fail(e.message, e.code);
      return fail(e instanceof Error ? e.message : "Something went wrong. Try again.");
    }
  }

  const loaders: Record<Slice, () => Promise<void>> = {
    me: async () => { const me = await http.get<Me>(`${org()}/me`); port.update((s) => ({ ...s, me })); },
    stores: async () => { const stores = await http.get<Store[]>(`${org()}/stores`); port.update((s) => ({ ...s, stores })); },
    projects: async () => { const projects = await http.get<ProjectRow[]>(`${org()}/projects`); port.update((s) => ({ ...s, projects })); },
    experiments: async () => {
      // The experiments of every project, side by side. A project the person cannot read would fail the whole slice, so each is read on its own.
      const rows = port.state().projects;
      const lists = await Promise.all(rows.map((r) => http.get<Experiment[]>(`${org()}/projects/${enc(r.project.id)}/experiments`).catch(() => [] as Experiment[])));
      port.update((s) => ({ ...s, experiments: lists.flat() }));
    },
    datasets: async () => { const datasets = await http.get<DatasetEntry[]>(`${org()}/datasets`); port.update((s) => ({ ...s, datasets })); },
  };

  /** Loads the given slices. A slice that fails keeps its last value and is reported, so one broken screen never blanks the others. Projects load before experiments. */
  async function refresh(slices: Slice[] = ALL_SLICES): Promise<{ failed: { slice: Slice; error: string }[] }> {
    const failed: { slice: Slice; error: string }[] = [];
    const one = async (slice: Slice) => { try { await loaders[slice](); } catch (e) { failed.push({ slice, error: e instanceof ApiError ? e.message : "Could not load." }); } };
    const first = slices.filter((s) => s !== "experiments"); await Promise.all(first.map(one));
    if (slices.includes("experiments")) await one("experiments");
    return { failed };
  }

  // ---- projects and experiments
  const createProject = (b: NewProject) => run<{ project: Project }>(async () => { const project = await http.post<Project>(`${org()}/projects`, b); await refresh(["projects"]); return { ok: true, project }; });
  const setProjectStore = (id: string, storeId: string) => run(async () => { await http.put(`${org()}/projects/${enc(id)}/store`, { storeId }); await refresh(["projects"]); return { ok: true }; });
  const getProject = (id: string) => run<{ project: Project }>(async () => ({ ok: true, project: await http.get<Project>(`${org()}/projects/${enc(id)}`) }));
  const createExperiment = (projectId: string, b: NewExperiment) => run<{ experiment: Experiment }>(async () => {
    const experiment = await http.post<Experiment>(`${org()}/projects/${enc(projectId)}/experiments`, b); await refresh(["projects", "experiments"]); return { ok: true, experiment };
  });
  const lineage = (experimentId: string) => run<{ links: LineageLink[] }>(async () => ({ ok: true, links: await http.get<LineageLink[]>(`${org()}/experiments/${enc(experimentId)}/lineage`) }));

  // ---- keys and machines
  const keys = (projectId: string) => run<{ keys: Key[] }>(async () => ({ ok: true, keys: await http.get<Key[]>(`${org()}/projects/${enc(projectId)}/keys`) }));
  const issueKey = (projectId: string, name: string, scopes: string[], expiresInDays: number) => run<{ issued: IssuedKey }>(async () => {
    const issued = await http.post<IssuedKey>(`${org()}/projects/${enc(projectId)}/keys`, { name, scopes, expiresInDays }); await refresh(["projects"]); return { ok: true, issued };
  });
  const rotateKey = (projectId: string, keyId: string) => run<{ issued: IssuedKey }>(async () => ({ ok: true, issued: await http.post<IssuedKey>(`${org()}/projects/${enc(projectId)}/keys/${enc(keyId)}:rotate`) }));
  const revokeKey = (projectId: string, keyId: string) => run(async () => { await http.delete(`${org()}/projects/${enc(projectId)}/keys/${enc(keyId)}`); await refresh(["projects"]); return { ok: true }; });
  const machines = (projectId: string) => run<{ machines: MachineRow[] }>(async () => ({ ok: true, machines: await http.get<MachineRow[]>(`${org()}/projects/${enc(projectId)}/machines`) }));
  const enrollMachine = (projectId: string, b: { name: string; kind: string; keyId: string }) => run<{ machine: MachineRow }>(async () => {
    const machine = await http.post<MachineRow>(`${org()}/projects/${enc(projectId)}/machines`, b); await refresh(["projects"]); return { ok: true, machine };
  });
  const revokeMachine = (projectId: string, machineId: string) => run(async () => { await http.post(`${org()}/projects/${enc(projectId)}/machines/${enc(machineId)}:revoke`); await refresh(["projects"]); return { ok: true }; });

  // ---- stores
  const createStore = (b: NewStore) => run<{ store: Store }>(async () => {
    const body = { ...b, endpoint: b.endpoint || undefined, roleArn: b.roleArn || undefined, secretRef: b.secretRef || undefined, expireAfterDays: b.expireAfterDays ?? undefined };
    const store = await http.post<Store>(`${org()}/stores`, body); await refresh(["stores"]); return { ok: true, store };
  });
  const testStore = (id: string) => run<{ store: Store; checks: StoreCheck[] }>(async () => { const r = await http.post<{ store: Store; checks: StoreCheck[] }>(`${org()}/stores/${enc(id)}:test`); await refresh(["stores"]); return { ok: true, ...r }; });
  const makeDefaultStore = (id: string) => run(async () => { await http.post(`${org()}/stores/${enc(id)}:makeDefault`); await refresh(["stores"]); return { ok: true }; });
  const deleteStore = (id: string) => run(async () => { await http.delete(`${org()}/stores/${enc(id)}`); await refresh(["stores"]); return { ok: true }; });

  // ---- datasets
  const exposeDataset = (id: string) => run(async () => { await http.post(`${org()}/datasets/${enc(id)}:expose`); await refresh(["datasets"]); return { ok: true }; });
  const hideDataset = (id: string) => run(async () => { await http.post(`${org()}/datasets/${enc(id)}:hide`); await refresh(["datasets"]); return { ok: true }; });

  // ---- runs
  const searchRuns = (b: { projectId: string; experimentId?: string; filter?: string; orderBy?: string; limit?: number }) => run<{ runs: Run[] }>(async () => ({ ok: true, runs: await http.post<Run[]>(`${org()}/runs:search`, b) }));
  const getRun = (id: string) => run<{ run: Run }>(async () => ({ ok: true, run: await http.get<Run>(`${org()}/runs/${enc(id)}`) }));
  const metricKeys = (id: string) => run<{ keys: string[] }>(async () => ({ ok: true, keys: await http.get<string[]>(`${org()}/runs/${enc(id)}/metrics`) }));
  const metric = (id: string, key: string, maxPoints = 500) => run<{ series: MetricSeries }>(async () => ({ ok: true, series: await http.get<MetricSeries>(`${org()}/runs/${enc(id)}/metric`, { key, maxPoints }) }));
  const compareRuns = (runIds: string[]) => run<{ comparison: Comparison }>(async () => ({ ok: true, comparison: await http.post<Comparison>(`${org()}/runs:compare`, { runIds }) }));
  const killRun = (id: string) => run<{ run: Run }>(async () => ({ ok: true, run: await http.post<Run>(`${org()}/runs/${enc(id)}:kill`) }));

  // ---- audit
  const audit = (q: { action?: string; actor?: string; q?: string; page?: number; size?: number }) => run<{ page: AuditPage }>(async () => ({ ok: true, page: await http.get<AuditPage>(`${org()}/audit`, q) }));

  return {
    refresh, getProject, createProject, setProjectStore, createExperiment, lineage, keys, issueKey, rotateKey, revokeKey, machines, enrollMachine, revokeMachine,
    createStore, testStore, makeDefaultStore, deleteStore, exposeDataset, hideDataset, searchRuns, getRun, metricKeys, metric, compareRuns, killRun, audit,
  };
}
export type LiveDriver = ReturnType<typeof createLiveDriver>;
export type { Machine };
