/**
 * The live driver: reads the MLOps control plane into the console's state and carries out every write the console offers. It is used when a
 * person is signed in to a real workspace. The sample workspace never touches it. Each action calls one route, then refreshes what the route
 * changed, so the screens always show what the server says rather than what the browser guessed.
 */
import { ApiError, http, type Paged } from "@/lib/api/client";
import type { MlopsSettings, MlopsState } from "../fixtures";
import type { Deployment, KnowledgeBase, ModelFileFormat, Payment, PipelineRun, RoleId } from "../types";
import type { PipelineSpec } from "../spec";
import { toUpload, type UploadRecord } from "../uploads";
import { toPlan, type PlanInfo } from "../plans";
import { toReport, type ValidationReport } from "../validation";
import { defFromOrgListing } from "../manifest";
import { setLiveCatalogue } from "../catalog";
import { toDiscovery, validateQuery, type DiscoveryQuery, type DiscoveryResult } from "../discovery";
import {
  toAgent, toAlert, toAudit, toConnection, toDeployment, toKnowledge, toLibrary, toModel, toPayment, toPipeline, toRun, toSettings,
} from "./mappers";

export type Result<T = {}> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

export type Slice = "me" | "connections" | "models" | "library" | "deployments" | "pipelines" | "runs" | "agents" | "audit" | "alerts" | "settings" | "payments" | "knowledge" | "catalogue";
export const ALL_SLICES: Slice[] = ["me", "settings", "connections", "models", "library", "deployments", "pipelines", "runs", "agents", "audit", "alerts", "payments", "knowledge", "catalogue"];

export type LiveContext = { orgId: string | null; isPlatform: boolean; userEmail?: string };
export type Port = {
  state: () => MlopsState;
  update: (fn: (s: MlopsState) => MlopsState) => void;
  context: () => LiveContext;
};

export type UploadFields = {
  name: string; description: string; task: string; framework: string; format: ModelFileFormat; fileName: string; sizeMb: number; sha256?: string;
  license: string; notes: string; metrics: Record<string, number>; file?: File;
};
export type KbFields = {
  name: string; title: string; description: string; env: KnowledgeBase["env"];
  sources: { kind: "upload" | "object-store"; name: string; connectionId?: string; path?: string; include?: string; files?: { name: string; size: number; text?: string; file?: File }[] }[];
  processing: KnowledgeBase["processing"]; embedding: KnowledgeBase["embedding"]; index: KnowledgeBase["index"]; schedule: KnowledgeBase["schedule"]; access: KnowledgeBase["access"];
};

type J = Record<string, any>;
const TERMINAL = new Set(["succeeded", "failed", "validation-failed", "cancelled", "rolled-back"]);
const PAGE = { size: 100 };

export function createLiveDriver(port: Port) {
  const org = () => {
    const id = port.context().orgId;
    if (!id) throw new ApiError(0, "no_organisation", "Choose an organisation before using MLOps.");
    return `/api/v1/orgs/${encodeURIComponent(id)}/mlops`;
  };
  const PLATFORM = "/api/v1/platform/mlops";

  /** Pipelines built from the sample templates carry the sample organisation in their metadata. A real workspace puts its own there. */
  const own = <T extends PipelineSpec | undefined>(spec: T): T => {
    if (!spec) return spec;
    const c = port.context();
    return { ...spec, metadata: { ...spec.metadata, org: c.orgId ?? spec.metadata.org, project: "default", owner: c.userEmail ?? spec.metadata.owner } } as T;
  };

  async function run<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
    try { return await fn(); }
    catch (e) {
      if (e instanceof ApiError) return fail(e.message);
      return fail(e instanceof Error ? e.message : "Something went wrong. Try again.");
    }
  }

  // ------------------------------------------------------------------------------------------ reading

  const loaders: Record<Slice, () => Promise<void>> = {
    me: async () => {
      const me = await http.get<J>(`${org()}/me`);
      port.update((s) => ({ ...s, role: me.role as RoleId }));
    },
    settings: async () => { const x = await http.get<J>(`${org()}/settings`); port.update((s) => ({ ...s, settings: toSettings(x) })); },
    /** The connector catalogue with each connector's status, as the platform operators have set it. */
    catalogue: async () => { const x = await http.get<J[]>(`${org()}/integrations`); setLiveCatalogue(x.map(defFromOrgListing)); },
    connections: async () => { const x = await http.get<J[]>(`${org()}/connections`); port.update((s) => ({ ...s, connections: x.map(toConnection) })); },
    models: async () => { const x = await http.get<J[]>(`${org()}/models`); port.update((s) => ({ ...s, models: x.map(toModel) })); },
    library: async () => {
      const x = port.context().isPlatform ? await http.get<J[]>(`${PLATFORM}/library`) : await http.get<J[]>(`${org()}/model-library`);
      port.update((s) => ({ ...s, library: x.map(toLibrary) }));
    },
    deployments: async () => { const x = await http.get<J[]>(`${org()}/deployments`); port.update((s) => ({ ...s, deployments: x.map(toDeployment) })); },
    pipelines: async () => { const x = await http.get<J[]>(`${org()}/pipelines`); port.update((s) => ({ ...s, pipelines: x.map(toPipeline) })); },
    runs: async () => { const x = await http.get<Paged<J>>(`${org()}/runs`, PAGE); port.update((s) => ({ ...s, runs: x.content.map(toRun) })); },
    agents: async () => { const x = await http.get<J[]>(`${org()}/agents`); port.update((s) => ({ ...s, agents: x.map(toAgent) })); },
    audit: async () => { const x = await http.get<Paged<J>>(`${org()}/audit`, PAGE); port.update((s) => ({ ...s, audit: x.content.map(toAudit) })); },
    alerts: async () => { const x = await http.get<J[]>(`${org()}/alerts`); port.update((s) => ({ ...s, alerts: x.map(toAlert) })); },
    payments: async () => {
      const x = await http.get<Paged<J>>(`${org()}/payments`, PAGE);
      const envOf = (cid: string) => port.state().connections.find((c) => c.id === cid)?.env;
      const full = await Promise.all(x.content.map(async (p): Promise<Payment> => {
        const [events, refunds] = await Promise.all([
          http.get<J[]>(`${org()}/payments/${p.id}/events`).catch(() => [] as J[]),
          http.get<J[]>(`${org()}/payments/${p.id}/refunds`).catch(() => [] as J[]),
        ]);
        const pay = toPayment(p, events, refunds);
        return { ...pay, env: envOf(pay.connectionId) ?? pay.env };
      }));
      port.update((s) => ({ ...s, payments: full }));
    },
    knowledge: async () => {
      const list = await http.get<J[]>(`${org()}/knowledge`);
      const full = await Promise.all(list.map((k) => http.get<J>(`${org()}/knowledge/${encodeURIComponent(k.id)}`)));
      port.update((s) => ({ ...s, knowledge: full.map(toKnowledge) }));
    },
  };

  /** Loads the given slices side by side. A slice that fails keeps its last value and is reported, so one broken screen never blanks the others. */
  async function refresh(slices: Slice[] = ALL_SLICES): Promise<{ failed: { slice: Slice; error: string }[] }> {
    const results = await Promise.allSettled(slices.map((s) => loaders[s]()));
    const failed: { slice: Slice; error: string }[] = [];
    results.forEach((r, i) => { if (r.status === "rejected") failed.push({ slice: slices[i], error: r.reason instanceof ApiError ? r.reason.message : "Could not load" }); });
    return { failed };
  }

  /** Reads a run on its own and puts it in the list, newest first. */
  async function loadRun(id: string): Promise<PipelineRun> {
    const r = toRun(await http.get<J>(`${org()}/runs/${id}`));
    port.update((s) => ({ ...s, runs: s.runs.some((x) => x.id === id) ? s.runs.map((x) => (x.id === id ? r : x)) : [r, ...s.runs] }));
    return r;
  }

  const after = async (...slices: Slice[]) => { await refresh([...slices, "audit"]); };

  // ------------------------------------------------------------------------------------------ polling

  let timer: ReturnType<typeof setInterval> | null = null;
  let tick = 0;
  let busy = false;
  async function poll() {
    if (busy || (typeof document !== "undefined" && document.hidden)) return;
    busy = true; tick++;
    try {
      const s = port.state();
      const open = s.runs.filter((r) => !TERMINAL.has(r.status));
      const wasOpen = open.length;
      await Promise.allSettled(open.map((r) => loadRun(r.id)));
      const finished = open.filter((r) => TERMINAL.has(port.state().runs.find((x) => x.id === r.id)?.status ?? r.status)).length;
      const kbBusy = s.knowledge.some((k) => k.status === "indexing" || k.runs.some((r) => r.state === "running"));
      const slices = new Set<Slice>();
      if (finished > 0) ["deployments", "models", "audit", "payments"].forEach((x) => slices.add(x as Slice));
      if (kbBusy) slices.add("knowledge");
      if (tick % 6 === 0) ["agents", "alerts", "deployments", "connections"].forEach((x) => slices.add(x as Slice));
      if (tick % 12 === 0 && wasOpen === 0) slices.add("audit");
      if (slices.size) await refresh([...slices]);
    } finally { busy = false; }
  }
  const start = () => { if (!timer) timer = setInterval(() => { void poll(); }, 2500); };
  const stop = () => { if (timer) clearInterval(timer); timer = null; };

  // ------------------------------------------------------------------------------------------ writing

  const jsonBody = (o: J) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

  const actions = {
    async updateSettings(patch: Partial<MlopsSettings>): Promise<Result> {
      return run(async () => {
        const next = await http.put<J>(`${org()}/settings`, { ...port.state().settings, ...patch });
        port.update((s) => ({ ...s, settings: toSettings(next) }));
        await after();
        return { ok: true };
      });
    },

    // connections
    async addConnection(c: { name: string; integrationId: string; env: string; owner: string; scope: string; auth: string; secretRef?: string; endpoint: string; tlsVerify: boolean; permissions: string; settings?: Record<string, string | number | boolean> }, credential?: string): Promise<Result<{ id: string }>> {
      return run(async () => {
        const out = await http.post<J>(`${org()}/connections`, jsonBody({
          name: c.name, integrationId: c.integrationId, env: c.env, owner: c.owner, scope: c.scope, auth: c.auth, credential: credential || undefined, secretRef: c.secretRef,
          endpoint: c.endpoint, tlsVerify: c.tlsVerify, readWrite: c.permissions === "read-write",
          options: c.settings ? Object.fromEntries(Object.entries(c.settings).map(([k, v]) => [k, String(v)])) : undefined,
        }));
        await after("connections");
        return { ok: true, id: out.id as string };
      });
    },
    /** Runs the read-only test before anything is saved. The credential travels once, in this request, and is never kept. */
    async testConnectionDraft(c: { name: string; integrationId: string; env: string; owner: string; scope: string; auth: string; secretRef?: string; endpoint: string; tlsVerify: boolean; permissions: string; settings?: Record<string, string | number | boolean> }, credential?: string): Promise<Result<{ steps: { id: string; label: string; state: "pass" | "fail" | "skipped"; detail: string }[]; detail: string; version?: string }>> {
      return run(async () => {
        const out = await http.post<J>(`${org()}/connections:test`, jsonBody({
          name: c.name, integrationId: c.integrationId, env: c.env, owner: c.owner, scope: c.scope, auth: c.auth, credential: credential || undefined, secretRef: c.secretRef,
          endpoint: c.endpoint, tlsVerify: c.tlsVerify, readWrite: c.permissions === "read-write",
          options: c.settings ? Object.fromEntries(Object.entries(c.settings).map(([k, v]) => [k, String(v)])) : undefined,
        }));
        let broken = false;
        const steps = (out.steps ?? []).map((st: J, i: number) => {
          const state = broken ? "skipped" as const : st.ok ? "pass" as const : "fail" as const;
          if (!st.ok) broken = true;
          return { id: `s${i}`, label: String(st.name), state, detail: String(st.detail ?? "") };
        });
        return { ok: true, steps, detail: String(out.detail ?? ""), version: out.detectedVersion || undefined };
      });
    },
    async verifyConnection(id: string) {
      return run(async () => {
        const out = await http.post<J>(`${org()}/connections/${id}:test`, {});
        await after("connections");
        const c = out.connection ? toConnection(out.connection) : port.state().connections.find((x) => x.id === id);
        return { ok: true as const, health: c?.health ?? (out.ok ? "healthy" as const : "failed" as const), detail: String(out.detail ?? c?.healthDetail ?? "") };
      });
    },
    async rotateCredential(id: string, credential?: string): Promise<Result> {
      if (!credential?.trim()) return fail("Enter the new credential. It is sent once and stored only in the secret manager.");
      return run(async () => { await http.post(`${org()}/connections/${id}:rotate`, { credential }); await after("connections"); return { ok: true }; });
    },
    async deleteConnection(id: string): Promise<Result> {
      const c = port.state().connections.find((x) => x.id === id);
      if (!c) return fail("Unknown connection");
      return run(async () => { await http.delete(`${org()}/connections/${id}`, { query: { confirm: c.name } }); await after("connections"); return { ok: true }; });
    },

    // models
    async decideVersion(modelId: string, version: number, decision: "approved" | "rejected", note: string, override = false): Promise<Result> {
      return run(async () => {
        await http.post(`${org()}/models/${encodeURIComponent(modelId)}/versions/${version}:decide`, { decision: decision === "approved" ? "approve" : "reject", note, ...(override ? { overrideGate: true } : {}) });
        await after("models");
        return { ok: true };
      });
    },
    async stageVersion(modelId: string, version: number, to: "none" | "staging" | "production" | "archived"): Promise<Result> {
      return run(async () => { await http.post(`${org()}/models/${encodeURIComponent(modelId)}/versions/${version}:stage`, { stage: to }); await after("models"); return { ok: true }; });
    },
    /** Records which dataset a version was trained on. The server reads the quality score from the dataset's profile; a blank id clears the link. */
    async linkTrainingData(modelId: string, version: number, datasetId: string): Promise<Result> {
      return run(async () => {
        await http.put(`${org()}/models/${encodeURIComponent(modelId)}/versions/${version}/training-data`, { datasetId });
        await after("models");
        return { ok: true };
      });
    },
    async uploadModel(i: UploadFields): Promise<Result<{ modelId: string; version: number }>> {
      return uploadTo(`${org()}/uploads`, i);
    },
    async importFromLibrary(libraryId: string, version: number, asName: string): Promise<Result<{ modelId: string; version: number }>> {
      return run(async () => {
        const out = await http.post<J>(`${org()}/model-library/${encodeURIComponent(libraryId)}/versions/${version}:import`, { name: asName.trim() || undefined });
        await after("models", "library");
        const latest = Math.max(...(out.versions ?? []).map((v: J) => Number(v.version)), 1);
        return { ok: true, modelId: out.id as string, version: latest };
      });
    },
    async publishLibraryModel(i: UploadFields): Promise<Result<{ libraryId: string; version: number }>> {
      const r = await uploadTo(`${PLATFORM}/library/uploads`, i, true);
      return r.ok ? { ok: true, libraryId: r.modelId, version: r.version } : r;
    },
    async withdrawLibraryVersion(libraryId: string, version: number): Promise<Result> {
      return run(async () => { await http.post(`${PLATFORM}/library/${encodeURIComponent(libraryId)}/versions/${version}:archive`, {}); await refresh(["library"]); return { ok: true }; });
    },

    // payments
    async resolvePaymentReview(id: string, accept: boolean): Promise<Result> {
      return run(async () => { await http.post(`${org()}/payments/${id}:resolveReview`, { accept }); await after("payments"); return { ok: true }; });
    },
    async requestRefund(id: string, amountMinor: number, reason: string): Promise<Result> {
      return run(async () => { await http.post(`${org()}/payments/${id}/refunds`, { amountMinor, reason }); await after("payments"); return { ok: true }; });
    },
    async decideRefund(paymentId: string, refundId: string, decision: "approve" | "reject"): Promise<Result> {
      return run(async () => { await http.post(`${org()}/payments/${paymentId}/refunds/${refundId}:${decision}`, {}); await after("payments"); return { ok: true }; });
    },

    // RAG indexes
    async createKnowledgeBase(i: KbFields): Promise<Result<{ id: string }>> {
      return run(async () => {
        const created = await http.post<J>(`${org()}/knowledge`, {
          id: i.name, name: i.title.trim() || i.name, description: i.description, env: i.env, processing: i.processing, embedding: i.embedding, index: i.index, schedule: i.schedule, access: i.access,
          sources: i.sources.map((s) => ({ name: s.name, kind: s.kind, connectionId: s.connectionId, path: s.path, include: s.include })),
        });
        // Uploaded files go to the source the server just created for them, in the order the sources were sent.
        const made: J[] = created.sources ?? [];
        for (let k = 0; k < i.sources.length; k++) {
          const src = i.sources[k]; const target = made[k];
          if (src.kind !== "upload" || !target) continue;
          for (const f of src.files ?? []) {
            const body: Blob | undefined = f.file ?? (f.text !== undefined ? new Blob([f.text], { type: "text/plain" }) : undefined);
            if (!body) continue;
            await http.put(`${org()}/knowledge/${encodeURIComponent(created.id)}/sources/${target.id}/files/${encodeURIComponent(f.name)}`, body, { query: { sync: false }, headers: { "Content-Type": f.file?.type || "application/octet-stream" } });
          }
        }
        if (i.sources.some((s) => s.kind === "upload" && (s.files?.length ?? 0) > 0)) await http.post(`${org()}/knowledge/${encodeURIComponent(created.id)}:sync`, {}).catch(() => undefined);
        await after("knowledge");
        return { ok: true, id: created.id as string };
      });
    },
    async syncKnowledgeBase(id: string): Promise<Result<{ health: "ok" | "partial" | "failed" }>> {
      return run(async () => {
        const out = await http.post<J>(`${org()}/knowledge/${encodeURIComponent(id)}:sync`, {});
        await after("knowledge");
        return { ok: true, health: out.state === "failed" ? "failed" as const : out.state === "partial" ? "partial" as const : "ok" as const };
      });
    },
    async addKnowledgeSource(id: string, sd: { name: string; connectionId: string; path: string; include: string }): Promise<Result> {
      return run(async () => { await http.post(`${org()}/knowledge/${encodeURIComponent(id)}/sources`, { name: sd.name, kind: "object-store", connectionId: sd.connectionId, path: sd.path, include: sd.include }); await after("knowledge"); return { ok: true }; });
    },
    async removeKnowledgeSource(id: string, sourceId: string): Promise<Result> {
      return run(async () => { await http.delete(`${org()}/knowledge/${encodeURIComponent(id)}/sources/${sourceId}`); await after("knowledge"); return { ok: true }; });
    },
    async addEvalQuestion(id: string, question: string, expectedSource: string): Promise<Result> {
      return run(async () => { await http.post(`${org()}/knowledge/${encodeURIComponent(id)}/evaluation/questions`, { question, expectedSource }); await refresh(["knowledge"]); return { ok: true }; });
    },
    async searchKnowledge(id: string, q: { query: string; topK: number; minScore: number; source?: string }): Promise<Result<{ hits: { chunk: { id: string; source: string; page?: number; heading?: string; text: string; updatedAt: string }; score: number }[] }>> {
      return run(async () => {
        const out = await http.post<J>(`${org()}/knowledge/${encodeURIComponent(id)}:search`, jsonBody({ query: q.query, topK: q.topK, minScore: q.minScore, source: q.source || undefined }));
        const hits = (out.hits ?? []).map((h: J, i: number) => ({
          chunk: { id: `${h.documentId ?? h.source}-${i}`, source: String(h.source), page: h.page ?? undefined, heading: h.heading ?? undefined, text: String(h.text ?? ""), updatedAt: String(h.updatedAt ?? "") },
          score: Number(h.score ?? 0),
        }));
        return { ok: true, hits };
      });
    },
    async runKnowledgeEvaluation(id: string): Promise<Result> {
      return run(async () => { await http.post(`${org()}/knowledge/${encodeURIComponent(id)}/evaluations`, {}); await after("knowledge"); return { ok: true }; });
    },
    async updateKnowledgeAccess(id: string, access: KnowledgeBase["access"], schedule: KnowledgeBase["schedule"]): Promise<Result> {
      return run(async () => { await http.put(`${org()}/knowledge/${encodeURIComponent(id)}/access`, { access, schedule }); await after("knowledge"); return { ok: true }; });
    },
    async updateKnowledgeProcessing(id: string, processing: KnowledgeBase["processing"], embedding: KnowledgeBase["embedding"]): Promise<Result> {
      return run(async () => { await http.put(`${org()}/knowledge/${encodeURIComponent(id)}/processing`, { processing, embedding }); await after("knowledge"); return { ok: true }; });
    },
    async deleteKnowledgeBase(id: string): Promise<Result> {
      return run(async () => { await http.delete(`${org()}/knowledge/${encodeURIComponent(id)}`); await after("knowledge"); return { ok: true }; });
    },

    // deployments
    /** Deploys a model version. The control plane runs every check, asks the cluster connection to apply it and answers with what it observed. */
    async deployModel(i: { name: string; modelId: string; version: number; env: string; connectionId: string; runtime: string; engine: string; gpu: string; gpuCount: number; cuda: string; driver?: string; min: number; max: number; cpu: string; memory: string; exposure?: Deployment["exposure"]; precision?: string; contextTokens?: number; concurrency?: number }): Promise<Result<{ id: string }>> {
      return run(async () => {
        const d = await http.post<J>(`${org()}/deployments`, {
          name: i.name, modelId: i.modelId, version: i.version, env: i.env, connectionId: i.connectionId, runtime: i.runtime, engine: i.engine, gpu: i.gpu, gpuCount: i.gpuCount,
          cuda: i.cuda, driver: i.driver ?? null, min: i.min, max: i.max, cpu: i.cpu, memory: i.memory, precision: i.precision ?? null, contextTokens: i.contextTokens ?? null,
          concurrency: i.concurrency ?? null, exposure: i.exposure && Object.values(i.exposure).some(Boolean) ? i.exposure : null,
        });
        await after("deployments", "audit");
        return { ok: true, id: d.id as string };
      });
    },
    async scaleDeployment(id: string, min: number, max: number): Promise<Result> {
      if (min !== max) return fail("A live deployment takes one replica count. Enter the same number for both.");
      return run(async () => { await http.post(`${org()}/deployments/${id}:scale`, { replicas: max }); await after("deployments"); return { ok: true }; });
    },
    async setCanaryPercent(id: string, pct: number): Promise<Result> {
      return run(async () => { await http.post(`${org()}/deployments/${id}:setTraffic`, { canaryPercent: pct }); await after("deployments"); return { ok: true }; });
    },
    async promoteCanary(id: string): Promise<Result> {
      return run(async () => { await http.post(`${org()}/deployments/${id}:promote`, {}); await after("deployments", "models"); return { ok: true }; });
    },
    async abortCanary(id: string): Promise<Result> {
      return run(async () => { await http.post(`${org()}/deployments/${id}:abort`, {}); await after("deployments"); return { ok: true }; });
    },
    async rollbackDeployment(id: string): Promise<Result> {
      return run(async () => { await http.post(`${org()}/deployments/${id}:rollback`, {}); await after("deployments", "models"); return { ok: true }; });
    },

    // pipelines
    async createPipeline(name: string, env: string, spec?: PipelineSpec): Promise<Result<{ id: string }>> {
      const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      if (!slug) return fail("Give the pipeline a name");
      return run(async () => {
        const out = await http.post<J>(`${org()}/pipelines`, jsonBody({ name: slug, env, description: spec?.metadata.description, spec: own(spec) }));
        await after("pipelines");
        return { ok: true, id: out.id as string };
      });
    },
    async saveDraft(id: string, spec: PipelineSpec, step?: number): Promise<Result> {
      return run(async () => {
        const out = await http.put<J>(`${org()}/pipelines/${id}/draft`, jsonBody({ spec: own(spec), step }));
        const rec = toPipeline(out);
        port.update((s) => ({ ...s, pipelines: s.pipelines.map((p) => (p.id === id ? rec : p)) }));
        return { ok: true };
      });
    },
    async discardDraft(id: string): Promise<Result> {
      return run(async () => { await http.delete(`${org()}/pipelines/${id}/draft`); await after("pipelines"); return { ok: true }; });
    },
    async restoreVersion(id: string, version: number): Promise<Result> {
      const p = port.state().pipelines.find((x) => x.id === id);
      const v = p?.versions.find((x) => x.version === version);
      if (!p || !v) return fail("Unknown version");
      return actions.saveDraft(id, v.spec).then(async (r) => { if (r.ok) await after("pipelines"); return r; });
    },
    async publish(id: string, note: string): Promise<Result<{ version: number }>> {
      return run(async () => {
        const out = await http.post<J>(`${org()}/pipelines/${id}/versions`, { note });
        const rec = toPipeline(out);
        port.update((s) => ({ ...s, pipelines: s.pipelines.map((p) => (p.id === id ? rec : p)) }));
        await refresh(["audit"]);
        return { ok: true, version: rec.versions[0]?.version ?? 1 };
      });
    },

    // runs
    async startRun(pipelineId: string, version: number, trigger = "manual", mode: "demo" | "real" = "demo"): Promise<Result<{ id: string; status: PipelineRun["status"] }>> {
      return run(async () => {
        const key = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `run-${Date.now()}`;
        const out = await http.post<J>(`${org()}/pipelines/${pipelineId}/runs`, { version, mode, trigger, idempotencyKey: key });
        const r = toRun(out);
        port.update((s) => ({ ...s, runs: [r, ...s.runs.filter((x) => x.id !== r.id)] }));
        void refresh(["audit"]);
        return { ok: true, id: r.id, status: r.status };
      });
    },
    async cancelRun(id: string): Promise<Result> {
      return run(async () => { await http.post(`${org()}/runs/${id}:cancel`, { reason: "Cancelled from the console" }); await loadRun(id); await refresh(["audit"]); return { ok: true }; });
    },
    async approveRun(id: string, approve: boolean, note = ""): Promise<Result> {
      const r = port.state().runs.find((x) => x.id === id);
      const waiting = r?.nodes.find((n) => n.status === "waiting")?.nodeId;
      if (!waiting) return fail("This run is not waiting for approval");
      return run(async () => { await http.post(`${org()}/runs/${id}:${approve ? "approve" : "reject"}`, { nodeId: waiting, note }); await loadRun(id); await refresh(["audit", "models"]); return { ok: true }; });
    },

    // build agents
    async enrollAgent(input: { name: string; mode: string; env: string; arch: string; labels: Record<string, string>; egress: string[]; registries: string[] }): Promise<Result<{ agent: ReturnType<typeof toAgent>; token: string }>> {
      return run(async () => {
        const out = await http.post<J>(`${org()}/agents`, { name: input.name, mode: input.mode, env: input.env, labels: { arch: input.arch, ...input.labels }, egress: input.egress, registries: input.registries, operations: ["build.image", "registry.push", "agent.info"], maxConcurrency: 2 });
        await after("agents");
        return { ok: true, agent: toAgent(out.agent), token: String(out.token) };
      });
    },
    async drainAgent(id: string, drain: boolean): Promise<Result> {
      return run(async () => { await http.post(`${org()}/agents/${id}:drain`, { on: drain }); await after("agents"); return { ok: true }; });
    },
    async reissueAgentEnrollment(id: string): Promise<Result<{ token?: string }>> {
      return run(async () => { const out = await http.post<J>(`${org()}/agents/${id}:reissueToken`, {}); await after("agents"); return { ok: true, token: out.token ? String(out.token) : undefined }; });
    },
    async rotateAgentToken(id: string): Promise<Result<{ token?: string }>> {
      return run(async () => { await http.post(`${org()}/agents/${id}:rotateToken`, {}); await after("agents"); return { ok: true, token: undefined }; });
    },
    async revokeAgent(id: string): Promise<Result> {
      const a = port.state().agents.find((x) => x.id === id);
      if (!a) return fail("Unknown agent");
      return run(async () => { await http.post(`${org()}/agents/${id}:revoke`, { confirm: a.name }); await after("agents"); return { ok: true }; });
    },
    async exportPipeline(id: string, version?: number): Promise<Result<{ yaml: string; label: string }>> {
      const p = port.state().pipelines.find((x) => x.id === id);
      return run(async () => {
        const res = await http.get<Response>(`${org()}/pipelines/${encodeURIComponent(id)}/export`, version === undefined ? undefined : { version }, { raw: true });
        return { ok: true, yaml: await res.text(), label: version === undefined ? (p?.draft ? "draft" : p?.versions[0] ? `v${p.versions[0].version}` : "latest") : `v${version}` };
      });
    },
    async deletePipeline(id: string, confirm: string): Promise<Result> {
      return run(async () => { await http.delete(`${org()}/pipelines/${encodeURIComponent(id)}`, { query: { confirm } }); await after("pipelines"); return { ok: true }; });
    },
    async recordManualRefund(paymentId: string, refundId: string, note: string): Promise<Result> {
      return run(async () => { await http.post(`${org()}/payments/${encodeURIComponent(paymentId)}/refunds/${encodeURIComponent(refundId)}:recordManual`, { note: note.trim() }); await after("payments"); return { ok: true }; });
    },
    /** Lists what a connection can see in its target. Read only: the control plane asks the connector, which changes nothing. */
    async discoverConnection(id: string, q: DiscoveryQuery): Promise<Result<{ result: DiscoveryResult }>> {
      const bad = validateQuery(q); if (bad) return fail(bad);
      return run(async () => ({ ok: true, result: toDiscovery(await http.post<J>(`${org()}/connections/${encodeURIComponent(id)}:discover`, jsonBody({ kind: q.kind.trim(), namespace: q.namespace?.trim() || undefined, limit: q.limit }))) }));
    },
    /** Asks the control plane to check a pipeline against the rules and this organisation's settings, without saving anything. */
    async validatePipeline(spec: PipelineSpec): Promise<Result<{ report: ValidationReport }>> {
      return run(async () => ({ ok: true, report: toReport(await http.post<J>(`${org()}/pipelines:validate`, { spec: own(spec) })) }));
    },
    /** What the server keeps of each upload: what was declared, what arrived and what the inspection found. `library` reads the platform library's uploads. */
    async listUploads(library = false): Promise<Result<{ uploads: UploadRecord[] }>> {
      return run(async () => {
        const x = await http.get<J[]>(library ? `${PLATFORM}/library/uploads` : `${org()}/uploads`);
        return { ok: true, uploads: x.map(toUpload).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)) };
      });
    },
    async getUpload(id: string, library = false): Promise<Result<{ upload: UploadRecord }>> {
      return run(async () => ({ ok: true, upload: toUpload(await http.get<J>(`${library ? `${PLATFORM}/library/uploads` : `${org()}/uploads`}/${encodeURIComponent(id)}`)) }));
    },
    /** Cancels an upload that has no verdict yet. The server refuses one that finished (409 upload_finished) or belongs to someone else. */
    async abortUpload(id: string, library = false): Promise<Result<{ upload: UploadRecord }>> {
      return run(async () => ({ ok: true, upload: toUpload(await http.post<J>(`${library ? `${PLATFORM}/library/uploads` : `${org()}/uploads`}/${encodeURIComponent(id)}:abort`, {})) }));
    },
    /** The plan the organisation holds and its limits. The server enforces them; this only reads them. */
    async getPlan(): Promise<Result<{ plan: PlanInfo }>> {
      return run(async () => ({ ok: true, plan: toPlan(await http.get<J>(`${org()}/plan`)) }));
    },
    /** Platform operators only. Gives one organisation a plan and returns what it now holds. */
    async assignPlan(orgId: string, planId: string): Promise<Result<{ plan: PlanInfo }>> {
      return run(async () => ({ ok: true, plan: toPlan(await http.put<J>(`${PLATFORM}/plans/${encodeURIComponent(orgId)}`, { planId })) }));
    },
    async acknowledgeAlert(id: string): Promise<Result> {
      return run(async () => { await http.post(`${org()}/alerts/${id}:acknowledge`, {}); await after("alerts"); return { ok: true }; });
    },
  };

  /** Announce, stream the file, read the verdict. A rejected file never becomes a version, and its findings come back as the error. */
  async function uploadTo(base: string, i: UploadFields, library = false): Promise<Result<{ modelId: string; version: number }>> {
    if (!i.file) return fail("Choose the model file.");
    return run(async () => {
      const s = await http.post<J>(base, jsonBody({
        modelName: i.name.trim(), task: i.task.trim() || undefined, description: i.description.trim() || undefined, framework: i.framework.trim() || undefined, format: i.format,
        fileName: i.fileName, sizeBytes: i.file!.size, sha256: i.sha256, license: i.license.trim() || undefined, notes: i.notes.trim() || undefined, metrics: i.metrics,
      }));
      const done = await http.put<J>(`${base}/${s.id}/content`, i.file!, { headers: { "Content-Type": "application/octet-stream" } });
      if (done.status === "rejected") return fail(String((done.findings ?? [])[0] ?? done.summary ?? "The file was rejected."));
      await after(library ? "library" : "models");
      return { ok: true, modelId: String(done.modelId ?? i.name.trim()), version: Number(done.version ?? 1) };
    });
  }

  return { refresh, loadRun, actions, start, stop, loaders };
}

export type LiveDriver = ReturnType<typeof createLiveDriver>;
