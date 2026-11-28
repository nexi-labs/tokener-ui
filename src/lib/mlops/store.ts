"use client";

import { useSyncExternalStore } from "react";
import { INTEGRATIONS, integrationById, setLiveCatalogue } from "./catalog";
import "@/lib/platform/integrations";
import { STATE_VERSION, buildFixtures, type MlopsSettings, type MlopsState } from "./fixtures";
import { RealModeUnavailable, assertExecutable, computeRun, type ExecMode } from "./runtime";
import { can, type Action } from "./rbac";
import { clone, exportYaml, newSpec, specDigest, validateSpec, runBlockers, type PipelineRecord, type PipelineSpec } from "./spec";
import { toast } from "./toast";
import { evaluateGate, gateOf, type TrainingData } from "./qualityGate";
import { STAGE_ACTION, STAGE_LABEL, applyStage, stageProblem, type Stage } from "./stage";
import { snapshot as refinerySnapshot } from "../refinery/store";
import type { AuditEvent, BuildAgent, Connection, Deployment, Env, Health, LibraryModel, ModelFileFormat, ModelScan, ModelVersion, Payment, PipelineRun, RoleId } from "./types";
import { MODEL_FORMATS } from "./types";
import type { KbChunk, KbRun, KbSource, KnowledgeBase } from "./types";
import { chunkText, evaluate, search as searchChunks, type Hit } from "./knowledge";
import { SAMPLE_ORG_ID } from "@/lib/iam/admin";
import { canAbort, abortProblem, MAX_OPEN_PER_PERSON, type UploadRecord } from "./uploads";
import { PLANS, planById, type PlanInfo } from "./plans";
import type { ValidationReport } from "./validation";
import { sampleDiscovery, validateQuery, type DiscoveryQuery, type DiscoveryResult } from "./discovery";
import { createLiveDriver, type LiveContext, type LiveDriver } from "./live/driver";

const KEY = "tokener.mlops.v1";
export type Result<T = {}> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

let state: MlopsState | null = null;
const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>[]>();

// ---------------------------------------------------------------------------------------------
// Two sources for the same screens. The sample workspace keeps its data in this browser and never calls the API. A signed-in workspace reads
// and writes the control plane through the live driver, and the state below is only ever a copy of what the server returned.

export type LiveStatus = { mode: "demo" | "live"; phase: "idle" | "loading" | "ready" | "error"; error?: string; partial?: string[]; loadedAt?: number };
const IDLE: LiveStatus = { mode: "demo", phase: "idle" };
let mode: "demo" | "live" = "demo";
let status: LiveStatus = IDLE;
let driver: LiveDriver | null = null;
let liveCtx: LiveContext = { orgId: null, isPlatform: false };

function emptyLive(): MlopsState {
  return {
    v: STATE_VERSION, role: "viewer", connections: [], models: [], library: [], knowledge: [], payments: [], deployments: [], pipelines: [], runs: [], agents: [], audit: [], alerts: [],
    settings: { killSwitch: false, requireProdApproval: true, requireSignedImages: true, auditRetentionDays: 400, secretManager: "vault", allowedRegistries: [], allowProductionAgents: false, allowPaymentsInProduction: false, maxPaymentAmount: 1000, allowedPaymentCurrencies: ["USD", "EUR", "GBP"] },
  };
}

function setStatus(next: LiveStatus) { status = next; listeners.forEach((l) => l()); }

async function hydrate() {
  const d = driver; if (!d) return;
  setStatus({ mode: "live", phase: "loading" });
  // A platform operator with no organisation of their own can still manage the shared library.
  const { failed } = await d.refresh(liveCtx.orgId ? undefined : ["library"]);
  if (driver !== d) return;
  if (failed.length >= (liveCtx.orgId ? 8 : 1)) setStatus({ mode: "live", phase: "error", error: failed[0].error });
  else setStatus({ mode: "live", phase: "ready", loadedAt: Date.now(), partial: failed.length ? failed.map((f) => f.slice) : undefined });
}

/** Switches the console to a signed-in workspace and loads it. Calling it again with the same organisation does nothing. */
export function connectLive(ctx: LiveContext) {
  if (mode === "live" && driver && liveCtx.orgId === ctx.orgId && liveCtx.isPlatform === ctx.isPlatform && liveCtx.userEmail === ctx.userEmail) return;
  disconnect(false);
  mode = "live"; liveCtx = ctx;
  state = emptyLive();
  driver = createLiveDriver({ state: () => get(), update: (fn) => { state = fn(get()); listeners.forEach((l) => l()); }, context: () => liveCtx });
  if (!ctx.orgId && !ctx.isPlatform) { setStatus({ mode: "live", phase: "error", error: "Your account is not a member of an organisation yet." }); return; }
  if (ctx.orgId) driver.start();
  void hydrate();
}

/** Back to the sample workspace. */
export function connectDemo() {
  if (mode === "demo" && !driver) return;
  disconnect(true);
}

function disconnect(notify: boolean) {
  driver?.stop(); driver = null; setLiveCatalogue(null); mode = "demo"; state = null; liveCtx = { orgId: null, isPlatform: false };
  status = IDLE;
  if (notify) listeners.forEach((l) => l());
}

export function reloadLive() { void hydrate(); }
export const isLiveWorkspace = () => mode === "live";
/** The organisation a signed-in workspace is working in, or null in the sample workspace. */
export const liveOrgId = () => (mode === "live" ? liveCtx.orgId : null);

export function useMlopsStatus(): LiveStatus {
  return useSyncExternalStore((l) => { listeners.add(l); return () => void listeners.delete(l); }, () => status, () => IDLE);
}

function persist() {
  if (mode === "live") return;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage may be unavailable. State then lives in memory. */ }
}

function init(): MlopsState {
  if (mode === "live") return emptyLive();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as MlopsState;
      if (s.v === STATE_VERSION) {
        // Fast-forward runs that were being revealed when the page closed.
        s.runs = s.runs.map((r) => (r.status === "running" && s.finals?.[r.id] ? s.finals[r.id] : r));
        const fin = { ...(s.finals ?? {}) };
        s.runs.forEach((r) => delete fin[r.id]);
        s.finals = fin;
        return s;
      }
    }
  } catch { /* fall through to fixtures */ }
  return buildFixtures();
}

function get(): MlopsState {
  if (!state) state = init();
  return state;
}

function set(fn: (s: MlopsState) => MlopsState) {
  state = fn(get());
  persist();
  listeners.forEach((l) => l());
}

export function useMlops(): MlopsState | null {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => void listeners.delete(l); },
    () => get(),
    () => null,
  );
}

const uid = (p: string) => `${p}-${Math.random().toString(16).slice(2, 10)}`;
const nowIso = () => new Date().toISOString();
const actorOf = (s: MlopsState) => ({ viewer: "viewer@nexi.example", developer: "you (developer)", approver: "you (approver)", admin: "you (admin)" }[s.role]);

function audit(s: MlopsState, action: string, resource: string, detail: string, env?: Env): MlopsState {
  const e: AuditEvent = { id: uid("ev"), at: nowIso(), actor: actorOf(s), action, resource, detail, env, demo: true };
  return { ...s, audit: [e, ...s.audit].slice(0, 400) };
}

function guard(action: Action, env?: Env): { ok: true } | { ok: false; error: string } {
  const d = can(get().role, action, env);
  return d.ok ? { ok: true } : fail(d.reason);
}

/** Organisation policy from Settings, applied before any run starts. Exported so the editor can show the same messages. */
export function policyViolations(spec: PipelineSpec, st: MlopsSettings): string[] {
  const out: string[] = [];
  for (const n of spec.nodes) {
    if (n.operator !== "build_image") continue;
    const cfg = (n.config ?? {}) as Record<string, unknown>;
    if (st.requireSignedImages && cfg.sign === false) out.push(`${n.name}: image signing is required.`);
    const repo = String(cfg.repository ?? "");
    if (repo && st.allowedRegistries.length && !st.allowedRegistries.some((r) => repo === r || repo.startsWith(`${r}/`))) out.push(`${n.name}: registry is not on the allowed list.`);
  }
  for (const n of spec.nodes) {
    if (n.operator !== "send_email") continue;
    const cfg = (n.config ?? {}) as Record<string, unknown>;
    if (cfg.mode === "Send immediately" && spec.environment === "production" && !spec.nodes.some((m) => m.operator === "approval_gate")) out.push(`${n.name}: sending immediately in production needs an approval gate, or use "Send after approval".`);
    if (cfg.redact === false) out.push(`${n.name}: redaction cannot be turned off for outbound mail.`);
  }
  for (const n of spec.nodes) {
    const cfg = (n.config ?? {}) as Record<string, any>;
    if (n.operator.startsWith("pay_")) {
      const amt = Number(cfg.amount), cur = String(cfg.currency ?? "");
      if (cfg.amountSource === "Fixed amount" && st.maxPaymentAmount && amt > st.maxPaymentAmount) out.push(`${n.name}: ${amt} ${cur} is above the organisation limit of ${st.maxPaymentAmount} per payment.`);
      if (st.allowedPaymentCurrencies.length && !st.allowedPaymentCurrencies.includes(cur)) out.push(`${n.name}: ${cur} is not an allowed payment currency.`);
      if (spec.environment === "production" && !st.allowPaymentsInProduction) out.push(`${n.name}: collecting real payments in production is switched off in Settings.`);
    }
    if (n.operator === "send_sms" && cfg.mode === "Send immediately" && spec.environment === "production" && !String(cfg.to ?? "").startsWith("{{order.") && !spec.nodes.some((m) => m.operator === "approval_gate")) out.push(`${n.name}: sending immediately in production needs an approval gate, or use "Send after approval". Texts to the number on the customer's own order are the exception.`);
  }
  const deploys = spec.nodes.some((n) => ["deploy_endpoint", "canary_rollout", "promote"].includes(n.operator));
  if (st.requireProdApproval && spec.environment === "production" && deploys && !spec.nodes.some((n) => n.operator === "approval_gate")) out.push("Production changes need an approval gate.");
  return out;
}

export type KbInput = {
  name: string; title: string; description: string; env: Env;
  sources: { kind: "upload" | "object-store"; name: string; connectionId?: string; path?: string; include?: string; files?: { name: string; size: number; text?: string; file?: File }[] }[];
  processing: KnowledgeBase["processing"]; embedding: KnowledgeBase["embedding"]; index: KnowledgeBase["index"]; schedule: KnowledgeBase["schedule"]; access: KnowledgeBase["access"];
};

export type UploadInput = {
  name: string; description: string; task: string; framework: string; format: ModelFileFormat; fileName: string; sizeMb: number; sha256?: string;
  license: string; notes: string; metrics: Record<string, number>;
  /** The file itself. Only a signed-in workspace sends it; the sample workspace reads its name and size. */
  file?: File;
};
export const MAX_UPLOAD_MB = 50_000;
const NAME_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;
const EXT: Record<ModelFileFormat, RegExp> = { safetensors: /\.safetensors$/i, gguf: /\.gguf$/i, onnx: /\.onnx$/i, pytorch: /\.(pt|pth|bin|ckpt|pkl|pickle)$/i };

/** The checks the console can make before any bytes move. The server runs the same ones and then reads the file. */
export function previewUploadChecks(i: UploadInput): { blocked: boolean; findings: ModelScan["findings"] } {
  const f: ModelScan["findings"] = [];
  if (!NAME_RE.test(i.name.trim())) f.push({ level: "block", message: "Use lowercase letters, numbers and dashes for the model name, 2 to 63 characters." });
  if (!i.fileName) f.push({ level: "block", message: "Choose the model file." });
  else if (!EXT[i.format].test(i.fileName)) f.push({ level: "block", message: `The file name does not look like a ${MODEL_FORMATS.find((x) => x.id === i.format)!.label} file. Check the format you chose.` });
  if (!(i.sizeMb > 0)) f.push({ level: "block", message: "The file is empty." });
  if (i.sizeMb > MAX_UPLOAD_MB) f.push({ level: "block", message: `Files above ${MAX_UPLOAD_MB / 1000} GB are not accepted. Reference larger weights from your own storage instead.` });
  if (MODEL_FORMATS.find((x) => x.id === i.format)!.scanned) f.push({ level: "warn", message: "A PyTorch checkpoint is pickle based. The server reads it for code execution and rejects it if it imports anything unsafe." });
  if (/review required|restrict/i.test(i.license)) f.push({ level: "warn", message: "This license needs a recorded legal review before production approval." });
  return { blocked: f.some((x) => x.level === "block"), findings: f };
}
function preview(pre: { findings: ModelScan["findings"] }): ModelScan {
  const warn = pre.findings.some((f) => f.level === "warn");
  return { verdict: warn ? "warnings" : "clean", summary: "Sample result. In a real workspace the server reads the file and records its own verdict.", findings: pre.findings.length ? pre.findings : [{ level: "info", message: "Name, format and size checks passed." }] };
}

// ---------------------------------------------------------------------------------------------

/** Plans given to organisations in the sample workspace, kept for the session. */
const SAMPLE_ORG = SAMPLE_ORG_ID;
const samplePlans: Record<string, string> = { [SAMPLE_ORG]: "growth" };

/**
 * Upload records of the sample workspace. A sample upload finishes at once, so two older records are seeded to show what the server keeps: one nobody finished
 * (it can be aborted) and one the inspection rejected. A real workspace reads the server's own records.
 */
const HOUR = 3_600_000;
const seedUploads = (lib: boolean): UploadRecord[] => {
  const t = Date.now(); const who = lib ? "platform operator" : "dev@nexi.example";
  return [
    { id: `upl_${lib ? "lib" : "org"}_a1`, modelName: lib ? "tokener-embed-small" : "support-intent", fileName: lib ? "embed-small.safetensors" : "support-intent.safetensors", format: "safetensors", framework: "pytorch", task: lib ? "embedding" : "classification", license: "apache-2.0",
      declaredBytes: 1_288_490_188, receivedBytes: 0, sha256: "", status: "open", createdBy: who, createdAt: new Date(t - 18 * HOUR).toISOString(), expiresAt: new Date(t + 6 * HOUR).toISOString(),
      summary: "", findings: [], modelId: "", version: null },
    { id: `upl_${lib ? "lib" : "org"}_r1`, modelName: lib ? "legacy-ranker" : "churn-model", fileName: lib ? "ranker.pt" : "churn.pt", format: "pytorch", framework: "pytorch", task: "classification", license: "proprietary",
      declaredBytes: 412_000_000, receivedBytes: 412_000_000, sha256: "9f2c4b1e07a35d68c1f4e2b7a90d3c5e8f16a2b4d7e09c3a5f8b1d6e2a47c093", status: "rejected", createdBy: who, createdAt: new Date(t - 52 * HOUR).toISOString(), expiresAt: new Date(t - 28 * HOUR).toISOString(),
      summary: "Pickle imports code that can run commands", findings: ["block: The checkpoint imports os.system and builtins.exec. Convert it to safetensors and upload that instead.", "warn: The file has no stated sha256, so the server computed one."], modelId: "", version: null },
  ];
};
function sampleRecord(i: UploadInput, modelId: string, version: number, who: string): UploadRecord {
  const t = Date.now();
  return { id: `upl_${Math.random().toString(36).slice(2, 8)}`, modelName: i.name.trim(), fileName: i.fileName, format: i.format, framework: i.framework.trim() || "unspecified", task: i.task.trim(), license: i.license.trim(),
    declaredBytes: Math.round(i.sizeMb * 1048576), receivedBytes: Math.round(i.sizeMb * 1048576), sha256: i.sha256 ?? "", status: "accepted", createdBy: who, createdAt: new Date(t).toISOString(), expiresAt: new Date(t + 24 * HOUR).toISOString(),
    summary: "Sample result. A real workspace shows the server's inspection here.", findings: [], modelId, version };
}
const sampleUploads = { org: seedUploads(false), library: seedUploads(true) };
const uploadBook = (lib: boolean) => (lib ? sampleUploads.library : sampleUploads.org);

const demoActions = {
  setRole(role: RoleId) { set((s) => ({ ...s, role })); },

  /** Records an audit event for something the console keeps outside this store, such as an MCP server. */
  note(action: string, resource: string, detail: string, env?: Env) { set((s) => audit(s, action, resource, detail, env)); },

  resetDemo(): Result {
    timers.forEach((t) => t.forEach(clearTimeout));
    timers.clear();
    const role = get().role;
    state = { ...buildFixtures(), role };
    persist();
    listeners.forEach((l) => l());
    return { ok: true };
  },

  updateSettings(patch: Partial<MlopsSettings>): Result {
    const g = guard("settings.edit"); if (!g.ok) return g;
    set((s) => audit({ ...s, settings: { ...s.settings, ...patch } }, "settings.update", "MLOps settings", Object.keys(patch).join(", ")));
    return { ok: true };
  },

  // ---------------------------------------------------------------- connections
  addConnection(c: Omit<Connection, "id" | "demo">, _credential?: string): Result<{ id: string }> {
    const g = guard("connection.create"); if (!g.ok) return g;
    const id = uid("conn");
    set((s) => audit({ ...s, connections: [{ ...c, id, demo: true }, ...s.connections] }, "connection.create", c.name, `${integrationById(c.integrationId)?.name} in ${c.env}, ${c.permissions}`, c.env));
    return { ok: true, id };
  },

  verifyConnection(id: string): Result<{ health: Health; detail: string }> {
    const c = get().connections.find((x) => x.id === id);
    if (!c) return fail("Unknown connection");
    let health: Health = "healthy", detail = "Connectivity, TLS, authentication and permission checks passed";
    if (c.id === "conn-dev-pg") { health = "failed"; detail = "TLS: certificate verify failed, unable to get local issuer certificate. Add the CA bundle."; }
    else if (c.id === "conn-dev-docker") { health = "offline"; detail = "Agent offline. No heartbeat received."; }
    else if (c.id === "conn-prod-kafka") { health = "attention"; detail = "Reachable and authenticated. Topic ACL check found no readable topics yet."; }
    set((s) => audit({ ...s, connections: s.connections.map((x) => (x.id === id ? { ...x, health, healthDetail: detail, lastVerifiedAt: nowIso() } : x)) }, "connection.verify", c.name, detail, c.env));
    return { ok: true, health, detail };
  },

  rotateCredential(id: string, _credential?: string): Result {
    const g = guard("connection.rotate"); if (!g.ok) return g;
    const c = get().connections.find((x) => x.id === id);
    if (!c) return fail("Unknown connection");
    if (!c.secretRef) return fail("This connection has no secret reference to rotate");
    set((s) => audit({
      ...s,
      connections: s.connections.map((x) => (x.id === id ? { ...x, credentialRotatedAt: nowIso(), credentialExpiresAt: undefined, health: x.health === "attention" && x.credentialExpiresAt ? "healthy" : x.health, healthDetail: x.credentialExpiresAt ? "Credential rotated. Checks passed." : x.healthDetail } : x)),
    }, "connection.rotate", c.name, "Credential rotated in the secret manager. The reference is unchanged.", c.env));
    return { ok: true };
  },

  deleteConnection(id: string): Result {
    const g = guard("connection.delete"); if (!g.ok) return g;
    const s0 = get();
    const c = s0.connections.find((x) => x.id === id);
    if (!c) return fail("Unknown connection");
    const usedBy = [
      ...s0.deployments.filter((d) => d.connectionId === id).map((d) => `deployment ${d.name}`),
      ...s0.pipelines.filter((p) => p.versions.some((v) => v.spec.nodes.some((n) => n.connection === id))).map((p) => `pipeline ${p.name}`),
    ];
    if (usedBy.length) return fail(`In use by ${usedBy.slice(0, 3).join(", ")}${usedBy.length > 3 ? ` and ${usedBy.length - 3} more` : ""}. Remove those references first.`);
    set((s) => audit({ ...s, connections: s.connections.filter((x) => x.id !== id) }, "connection.delete", c.name, "Connection deleted. Secret reference left in the secret manager.", c.env));
    return { ok: true };
  },

  // ---------------------------------------------------------------- models
  decideVersion(modelId: string, version: number, decision: "approved" | "rejected", note: string, override = false): Result {
    const g = guard("model.approve"); if (!g.ok) return g;
    const m = get().models.find((x) => x.id === modelId);
    const v = m?.versions.find((x) => x.version === version);
    if (!m || !v) return fail("Unknown model version");
    if (v.approval.state === "approved" || v.approval.state === "rejected") return fail(`Version ${version} is already ${v.approval.state}`);
    if (decision === "approved" && /review required/i.test(v.license) && !/legal/i.test(note)) return fail("This license needs a recorded legal review. Mention the review in the note to approve.");
    let recorded = note;
    if (decision === "approved") {
      const gate = evaluateGate(gateOf(get().settings), v.trainingData);
      if (gate.status === "fail" || gate.status === "missing") {
        if (!override) return fail(`${gate.summary} An admin can approve with a written reason.`);
        if (get().role !== "admin") return fail("Only an admin can approve past the data quality gate.");
        if (note.trim().length < 10) return fail("Approving past the data quality gate needs a written reason of at least 10 characters.");
        recorded = `Data quality gate override. ${gate.summary} Reason: ${note.trim()}`;
      }
    }
    set((s) => audit({
      ...s,
      models: s.models.map((x) => (x.id !== modelId ? x : { ...x, versions: x.versions.map((y) => (y.version === version ? { ...y, approval: { state: decision, by: actorOf(s), at: nowIso(), note: recorded } } : y)) })),
    }, decision === "approved" ? "model.approve" : "model.reject", `${m.name} v${version}`, recorded || decision));
    return { ok: true };
  },

  /** Moves a version to a registry stage. Same rules as the server: approved first, production only from staging, production needs the approve permission. */
  stageVersion(modelId: string, version: number, to: Stage): Result {
    const g = guard(STAGE_ACTION[to]); if (!g.ok) return g;
    const m = get().models.find((x) => x.id === modelId);
    if (!m || !m.versions.some((x) => x.version === version)) return fail("Unknown model version");
    const why = stageProblem(m.versions, version, to); if (why) return fail(why);
    if (m.versions.find((x) => x.version === version)!.stage === to) return { ok: true };
    set((s) => audit({ ...s, models: s.models.map((x) => (x.id !== modelId ? x : { ...x, versions: applyStage(x.versions, version, to) })) }, "model.stage", `${m.name} v${version}`, `Stage ${to}`));
    return { ok: true };
  },

  /**
   * Records which dataset a version was trained on, taking the quality score from that dataset's profile. In the sample workspace the dataset
   * comes from the sample Refinery data; the server does the same from the stored profile and never accepts a score from the browser.
   */
  linkTrainingData(modelId: string, version: number, datasetId: string): Result {
    const g = guard("model.register"); if (!g.ok) return g;
    const m = get().models.find((x) => x.id === modelId);
    const v = m?.versions.find((x) => x.version === version);
    if (!m || !v) return fail("Unknown model version");
    if (v.approval.state !== "pending") return fail(`Version ${version} is ${v.approval.state}. Training data can only change while it waits for approval.`);
    let td: TrainingData | undefined;
    if (datasetId.trim()) {
      const d = refinerySnapshot().datasets.find((x) => x.id === datasetId.trim());
      if (!d) return fail(`No dataset ${datasetId.trim()}.`);
      td = { datasetId: d.id, datasetName: d.name, datasetVersion: d.version, quality: d.profile.quality, measuredAt: nowIso() };
    }
    set((s) => audit({
      ...s,
      models: s.models.map((x) => (x.id !== modelId ? x : { ...x, versions: x.versions.map((y) => (y.version === version ? { ...y, trainingData: td } : y)) })),
    }, "model.training-data", `${m.name} v${version}`, td ? `Linked ${td.datasetName} v${td.datasetVersion}, quality ${td.quality}` : "Training data cleared"));
    return { ok: true };
  },

  // ---------------------------------------------------------------- model upload and library
  /**
   * Announces and "uploads" a model file. In the sample workspace nothing leaves the browser: the checks below are a preview. The server repeats
   * every one of them, reads the file itself (a PyTorch checkpoint is scanned for code execution) and only then accepts the version.
   */
  uploadModel(i: UploadInput): Result<{ modelId: string; version: number }> {
    const g = guard("model.register"); if (!g.ok) return g;
    const pre = previewUploadChecks(i); if (pre.blocked) return fail(pre.findings.find((f) => f.level === "block")!.message);
    const name = i.name.trim();
    if (sampleUploads.org.filter(canAbort).length >= MAX_OPEN_PER_PERSON) return fail(`You already have ${sampleUploads.org.filter(canAbort).length} uploads in progress. Finish or abort one first.`);
    const s0 = get();
    const existing = s0.models.find((m) => m.name === name);
    const version = (existing?.versions.reduce((a, v) => Math.max(a, v.version), 0) ?? 0) + 1;
    const v: ModelVersion = {
      version, stage: "none", createdAt: nowIso(), createdBy: actorOf(s0), framework: i.framework.trim() || "unspecified", format: i.format, sizeMb: i.sizeMb,
      checksum: i.sha256 ? `sha256:${i.sha256}` : "sha256:computed-by-server", provenance: { git: "", repo: "", trainingRun: "", datasetHash: "", builder: "uploaded from a browser", signed: false },
      metrics: i.metrics, approval: { state: "pending", note: "Uploaded. Waiting for an approver." }, license: i.license.trim() || "unspecified", notes: i.notes.trim(), source: `upload: ${i.fileName}`,
      scan: preview(pre),
    };
    const id = existing?.id ?? name;
    set((s) => audit({
      ...s,
      models: existing ? s.models.map((m) => (m.id === id ? { ...m, versions: [v, ...m.versions] } : m))
        : [{ id, name, description: i.description.trim(), task: i.task.trim() || "Unspecified", owner: actorOf(s), versions: [v], demo: false }, ...s.models],
    }, "model.upload", `${name} v${version}`, `${i.fileName}, ${i.sizeMb} MB, ${i.format}. Scan: ${v.scan!.verdict}`));
    sampleUploads.org.unshift(sampleRecord(i, id, version, actorOf(get())));
    return { ok: true, modelId: id, version };
  },

  importFromLibrary(libraryId: string, version: number, asName: string): Result<{ modelId: string; version: number }> {
    const g = guard("model.register"); if (!g.ok) return g;
    const lib = get().library.find((x) => x.id === libraryId);
    const lv = lib?.versions.find((x) => x.version === version);
    if (!lib || !lv) return fail("Unknown library version");
    if (lv.withdrawn) return fail("That version was withdrawn and cannot be imported.");
    const name = (asName.trim() || lib.name);
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(name)) return fail("Use lowercase letters, numbers and dashes for the model name.");
    const s0 = get();
    const existing = s0.models.find((m) => m.name === name);
    if (existing && existing.versions.some((v) => v.source === `library: ${lib.name} v${version}`)) return fail(`${name} already has this library version.`);
    const nv = (existing?.versions.reduce((a, v) => Math.max(a, v.version), 0) ?? 0) + 1;
    const v: ModelVersion = { ...lv, version: nv, stage: "none", createdAt: nowIso(), createdBy: actorOf(s0), approval: { state: "pending", note: "Imported from the platform library. Waiting for an approver." }, notes: `Imported from the platform library: ${lib.name} v${version}. Points at shared weights, no copy is stored.`, source: `library: ${lib.name} v${version}` };
    delete (v as Partial<typeof lv>).withdrawn; delete (v as Partial<typeof lv>).imports;
    set((s) => audit({
      ...s,
      library: s.library.map((x) => (x.id !== libraryId ? x : { ...x, versions: x.versions.map((y) => (y.version === version ? { ...y, imports: y.imports + 1 } : y)) })),
      models: existing ? s.models.map((m) => (m.id === existing.id ? { ...m, versions: [v, ...m.versions] } : m))
        : [{ id: name, name, description: lib.description, task: lib.task, owner: actorOf(s), versions: [v], demo: false }, ...s.models],
    }, "model.import", `${name} v${nv}`, `From library ${lib.name} v${version}`));
    return { ok: true, modelId: name, version: nv };
  },

  /** Platform operators only. The page is reachable by operators alone. Library uploads need no approval step. */
  publishLibraryModel(i: UploadInput): Result<{ libraryId: string; version: number }> {
    const pre = previewUploadChecks(i); if (pre.blocked) return fail(pre.findings.find((f) => f.level === "block")!.message);
    const name = i.name.trim();
    const id = `lib-${name}`;
    const existing = get().library.find((x) => x.id === id);
    const version = (existing?.versions.reduce((a, v) => Math.max(a, v.version), 0) ?? 0) + 1;
    const v = {
      version, stage: "none" as const, createdAt: nowIso(), createdBy: "platform operator", framework: i.framework.trim() || "unspecified", format: i.format, sizeMb: i.sizeMb,
      checksum: i.sha256 ? `sha256:${i.sha256}` : "sha256:computed-by-server", provenance: { git: "", repo: "", trainingRun: "", datasetHash: "", builder: "uploaded by a platform operator", signed: false },
      metrics: i.metrics, approval: { state: "not-required" as const }, license: i.license.trim() || "unspecified", notes: i.notes.trim(), source: `upload: ${i.fileName}`, scan: preview(pre), imports: 0,
    };
    set((s) => audit({
      ...s,
      library: existing ? s.library.map((x) => (x.id === id ? { ...x, versions: [v, ...x.versions] } : x))
        : [{ id, name, description: i.description.trim(), task: i.task.trim() || "Unspecified", publisher: "platform operator", versions: [v] }, ...s.library],
    }, "library.publish", `${name} v${version}`, `${i.fileName}, ${i.sizeMb} MB, ${i.format}`));
    sampleUploads.library.unshift(sampleRecord(i, id, version, "platform operator"));
    return { ok: true, libraryId: id, version };
  },

  withdrawLibraryVersion(libraryId: string, version: number): Result {
    const lib = get().library.find((x) => x.id === libraryId);
    const lv = lib?.versions.find((x) => x.version === version);
    if (!lib || !lv) return fail("Unknown library version");
    if (lv.withdrawn) return fail("Already withdrawn");
    set((s) => audit({ ...s, library: s.library.map((x) => (x.id !== libraryId ? x : { ...x, versions: x.versions.map((y) => (y.version === version ? { ...y, withdrawn: true, approval: { state: "rejected" as const, by: "platform operator", at: nowIso(), note: "Withdrawn from the library" } } : y)) })) }, "library.archive", `${lib.name} v${version}`, "Withdrawn. Imports already made keep working."));
    return { ok: true };
  },

  // ---------------------------------------------------------------- payments
  resolvePaymentReview(id: string, accept: boolean): Result {
    const g = guard("run.approve"); if (!g.ok) return g;
    const p = get().payments.find((x) => x.id === id);
    if (!p) return fail("Unknown payment");
    if (p.state !== "review") return fail("Only a payment held for review can be resolved.");
    if (accept && !(p.paidMinor && p.paidMinor > 0)) return fail("No money was received for this payment, so there is nothing to accept.");
    const to = accept ? "paid" : (p.paidMinor && p.paidMinor > 0 ? "refund-pending" : "failed");
    set((s) => audit({ ...s, payments: s.payments.map((x) => (x.id !== id ? x : { ...x, state: to, updatedAt: nowIso(), events: [...x.events, { id: uid("pe"), at: nowIso(), kind: accept ? "paid" : "review-rejected", detail: `${accept ? "Accepted" : "Rejected"} by ${actorOf(s)}` }] })) },
      accept ? "payment.review.accepted" : "payment.review.rejected", p.orderRef, accept ? "A held payment was accepted." : "A held payment was rejected.", p.env));
    return { ok: true };
  },

  requestRefund(id: string, amountMinor: number, reason: string): Result {
    const g = guard("pipeline.run"); if (!g.ok) return g;
    const p = get().payments.find((x) => x.id === id);
    if (!p) return fail("Unknown payment");
    if (!["paid", "review", "refund-failed"].includes(p.state)) return fail("Only a payment that received money can be refunded.");
    const refundable = (p.paidMinor ?? 0) - p.refundedMinor;
    if (!(amountMinor > 0)) return fail("Enter an amount above zero.");
    if (amountMinor > refundable) return fail(`At most ${(refundable / 100).toFixed(2)} ${p.currency} can still be refunded.`);
    if (p.refunds.some((r) => r.state === "awaiting-approval" || r.state === "approved")) return fail("A refund for this payment already waits for approval.");
    if (reason.trim().length < 3) return fail("Say why the refund is needed.");
    const r = { id: uid("rf"), paymentId: id, amountMinor, reason: reason.trim(), state: "awaiting-approval" as const, requestedBy: actorOf(get()), createdAt: nowIso(), updatedAt: nowIso() };
    set((s) => audit({ ...s, payments: s.payments.map((x) => (x.id !== id ? x : { ...x, state: "refund-pending" as const, updatedAt: nowIso(), refunds: [r, ...x.refunds], events: [...x.events, { id: uid("pe"), at: nowIso(), kind: "refund-requested", detail: `Refund of ${(amountMinor / 100).toFixed(2)} requested by ${actorOf(s)}` }] })) },
      "payment.refund.requested", p.orderRef, `A refund of ${(amountMinor / 100).toFixed(2)} ${p.currency} was requested and waits for approval.`, p.env));
    return { ok: true };
  },

  decideRefund(paymentId: string, refundId: string, decision: "approve" | "reject"): Result {
    const g = guard("run.approve"); if (!g.ok) return g;
    const p = get().payments.find((x) => x.id === paymentId);
    const r = p?.refunds.find((x) => x.id === refundId);
    if (!p || !r) return fail("Unknown refund");
    if (r.state !== "awaiting-approval") return fail(`This refund is already ${r.state.replace("-", " ")}.`);
    const me = actorOf(get());
    if (r.requestedBy === me) return fail("The person who asked for a refund cannot approve it.");
    const approve = decision === "approve";
    set((s) => audit({
      ...s,
      payments: s.payments.map((x) => {
        if (x.id !== paymentId) return x;
        const refunded = x.refundedMinor + (approve ? r.amountMinor : 0);
        const full = refunded >= (x.paidMinor ?? 0);
        return {
          ...x, updatedAt: nowIso(), refundedMinor: refunded,
          state: approve ? (full ? "refunded" as const : "paid" as const) : "paid" as const,
          refunds: x.refunds.map((y) => (y.id === refundId ? { ...y, state: approve ? "completed" as const : "rejected" as const, approvedBy: me, providerRef: approve ? `sandbox-rf-${Math.random().toString(16).slice(2, 8)}` : undefined, updatedAt: nowIso() } : y)),
          events: [...x.events, { id: uid("pe"), at: nowIso(), kind: approve ? "refunded" : "refund-rejected", detail: approve ? `Approved by ${me}. Sample provider confirmed the refund` : `Rejected by ${me}` }],
        };
      }),
    }, approve ? "payment.refund.approved" : "payment.refund.rejected", p.orderRef, approve ? "A refund was approved." : "A refund was rejected.", p.env));
    return { ok: true };
  },

  /** Records a refund that was paid outside the provider, for example by bank transfer. Same rules as the server: approved or failed refunds only, a note that says where, and never more than was paid. */
  recordManualRefund(paymentId: string, refundId: string, note: string): Result {
    const g = guard("run.approve"); if (!g.ok) return g;
    const p = get().payments.find((x) => x.id === paymentId);
    const r = p?.refunds.find((x) => x.id === refundId);
    if (!p || !r) return fail("Unknown refund");
    if (r.state === "completed") return { ok: true };
    if (r.state !== "approved" && r.state !== "failed") return fail("Only an approved refund can be recorded as done.");
    if (!note.trim()) return fail("Say where the refund was made, for example the portal reference.");
    const refunded = p.refundedMinor + r.amountMinor;
    if (p.paidMinor === undefined || refunded > p.paidMinor) return fail("The refund is more than what was paid.");
    const me = actorOf(get());
    set((s) => audit({
      ...s,
      payments: s.payments.map((x) => x.id !== paymentId ? x : {
        ...x, updatedAt: nowIso(), refundedMinor: refunded, state: refunded >= (x.paidMinor ?? 0) ? "refunded" as const : "paid" as const,
        refunds: x.refunds.map((y) => (y.id === refundId ? { ...y, state: "completed" as const, providerRef: `manual:${note.trim()}`, updatedAt: nowIso() } : y)),
        events: [...x.events, { id: uid("pe"), at: nowIso(), kind: "refunded", detail: `Recorded by ${me} as paid outside the provider: ${note.trim()}` }],
      }),
    }, "payment.refund.recorded", p.orderRef, "A refund made outside the platform was recorded.", p.env));
    return { ok: true };
  },

  // ---------------------------------------------------------------- RAG indexes
  createKnowledgeBase(i: KbInput): Result<{ id: string }> {
    const g = guard("pipeline.publish", i.env); if (!g.ok) return g;
    const name = i.name.trim();
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(name)) return fail("Use lowercase letters, numbers and dashes for the name, 2 to 63 characters.");
    const s0 = get();
    if (s0.knowledge.some((k) => k.id === name)) return fail(`A RAG index named ${name} already exists.`);
    const idx = s0.connections.find((c) => c.id === i.index.connectionId);
    if (!idx) return fail("Choose a vector store connection.");
    if (idx.env !== i.env && i.env !== "development") return fail(`This RAG index is for ${i.env}. The vector store connection belongs to ${idx.env}.`);
    if (!/^[a-z][a-z0-9_]{1,62}$/.test(i.index.collection)) return fail("The collection name uses lowercase letters, numbers and underscores.");
    if (/_g\d+$/.test(i.index.collection)) return fail("A collection name cannot end in _g and a number. Those suffixes are used for re-indexed generations.");
    if (s0.knowledge.some((k) => k.index.connectionId === i.index.connectionId && k.index.collection === i.index.collection)) return fail("That collection already belongs to another RAG index on this vector store.");
    if (!(i.embedding.dimension > 0)) return fail("Enter the embedding dimension.");
    if (!(i.processing.chunkTokens >= 64 && i.processing.chunkTokens <= 4096)) return fail("Chunk size is between 64 and 4096 tokens.");
    if (!(i.processing.overlap >= 0 && i.processing.overlap < i.processing.chunkTokens / 2)) return fail("Overlap must be below half the chunk size.");
    const at = nowIso();
    const sources: KbSource[] = []; const chunks: KbChunk[] = []; let docs = 0; let sizeMb = 0; let toks = 0;
    for (const sd of i.sources) {
      const id = uid("src");
      if (sd.kind === "upload") {
        let n = 0;
        for (const f of sd.files ?? []) {
          n++; sizeMb += f.size / 1_048_576;
          if (f.text) { const cs = chunkText(f.name, f.text, i.processing.chunkTokens, i.processing.overlap, at); chunks.push(...cs); toks += cs.reduce((a, c) => a + Math.round(c.text.split(/\s+/).length * 1.3), 0); }
        }
        docs += n; sources.push({ id, name: sd.name || "Uploaded files", kind: "upload", documents: n, lastSyncAt: at, status: "synced" });
      } else {
        const c = s0.connections.find((x) => x.id === sd.connectionId);
        if (!c) return fail("Choose a connection for the object storage source.");
        sources.push({ id, name: sd.name || c.name, kind: "object-store", connectionId: c.id, path: sd.path || "/", include: sd.include || "*", documents: 0, status: "pending" });
      }
    }
    const kb: KnowledgeBase = {
      id: name, name: i.title.trim() || name, description: i.description.trim(), env: i.env, owner: actorOf(s0), status: sources.length === 0 ? "empty" : sources.some((x) => x.status === "pending") ? "indexing" : "ready", createdAt: at,
      sources, processing: i.processing, embedding: i.embedding, index: i.index, schedule: i.schedule, access: i.access,
      stats: { documents: docs, chunks: chunks.length, tokens: toks, sizeMb: Math.round(sizeMb * 100) / 100, lastSyncAt: docs ? at : undefined, staleDocuments: 0 },
      runs: docs || sources.length ? [{ id: uid("kr"), startedAt: at, durationSec: 4, trigger: "upload", state: "succeeded", added: docs, updated: 0, removed: 0, skipped: 0, failed: 0, tokens: toks, notes: sources.some((x) => x.status === "pending") ? ["Object storage sources are read on the first sync."] : [] }] : [],
      chunks, evalQuestions: [], evalRuns: [], demo: false,
    };
    set((s) => audit({ ...s, knowledge: [kb, ...s.knowledge] }, "knowledge.create", name, `${i.index.collection} on ${idx.name}, ${i.embedding.model}`, i.env));
    return { ok: true, id: name };
  },

  syncKnowledgeBase(id: string): Result<{ health: "ok" | "partial" | "failed" }> {
    const kb = get().knowledge.find((k) => k.id === id);
    if (!kb) return fail("Unknown RAG index");
    const g = guard("pipeline.run", kb.env); if (!g.ok) return g;
    if (get().settings.killSwitch) return fail("The kill switch is on. Runs are stopped for this organization.");
    if (kb.sources.length === 0) return fail("Add a source first.");
    const at = nowIso();
    let failed = 0, added = 0, updated = 0;
    const notes: string[] = [];
    const sources = kb.sources.map((src) => {
      if (src.kind === "object-store") {
        const c = get().connections.find((x) => x.id === src.connectionId);
        if (!c) { failed++; notes.push(`${src.name}: the connection no longer exists.`); return { ...src, status: "failed" as const, error: "The connection no longer exists." }; }
        if (c.health === "failed" || c.health === "offline") { failed++; notes.push(`${src.name}: ${c.healthDetail}`); return { ...src, status: "failed" as const, error: c.healthDetail }; }
        const found = src.documents || 3;
        if (src.status === "pending") added += found; else updated += kb.stats.staleDocuments ? Math.min(kb.stats.staleDocuments, found) : 0;
        return { ...src, documents: found, status: "synced" as const, error: undefined, lastSyncAt: at };
      }
      return { ...src, lastSyncAt: at, status: "synced" as const };
    });
    const ok = failed === 0, partial = failed > 0 && failed < kb.sources.length;
    const run: KbRun = { id: uid("kr"), startedAt: at, durationSec: ok ? 38 : 6, trigger: "manual", state: ok ? "succeeded" : partial ? "partial" : "failed", added, updated, removed: 0, skipped: 0, failed, tokens: (added + updated) * 410, notes };
    const docs = sources.reduce((a, x) => a + x.documents, 0);
    set((s) => audit({ ...s, knowledge: s.knowledge.map((k) => (k.id !== id ? k : { ...k, sources, runs: [run, ...k.runs].slice(0, 50), status: ok ? "ready" : "degraded", stats: { ...k.stats, documents: docs, staleDocuments: ok ? 0 : k.stats.staleDocuments, lastSyncAt: ok || partial ? at : k.stats.lastSyncAt, tokens: k.stats.tokens + run.tokens } })) },
      "knowledge.sync", kb.name, ok ? "Sync finished" : `Sync finished with ${failed} failed source${failed > 1 ? "s" : ""}`, kb.env));
    return { ok: true, health: ok ? "ok" : partial ? "partial" : "failed" };
  },

  addKnowledgeSource(id: string, sd: { name: string; connectionId: string; path: string; include: string }): Result {
    const kb = get().knowledge.find((k) => k.id === id);
    if (!kb) return fail("Unknown RAG index");
    const g = guard("pipeline.publish", kb.env); if (!g.ok) return g;
    const c = get().connections.find((x) => x.id === sd.connectionId);
    if (!c) return fail("Choose a connection.");
    if (kb.sources.some((x) => x.connectionId === c.id && x.path === sd.path)) return fail("That path is already a source of this RAG index.");
    const src: KbSource = { id: uid("src"), name: sd.name || c.name, kind: "object-store", connectionId: c.id, path: sd.path || "/", include: sd.include || "*", documents: 0, status: "pending" };
    set((s) => audit({ ...s, knowledge: s.knowledge.map((k) => (k.id !== id ? k : { ...k, sources: [...k.sources, src], status: k.status === "empty" ? "indexing" : k.status })) }, "knowledge.source.add", kb.name, `${c.name} ${src.path}`, kb.env));
    return { ok: true };
  },

  removeKnowledgeSource(id: string, sourceId: string): Result {
    const kb = get().knowledge.find((k) => k.id === id);
    const src = kb?.sources.find((x) => x.id === sourceId);
    if (!kb || !src) return fail("Unknown source");
    const g = guard("pipeline.publish", kb.env); if (!g.ok) return g;
    set((s) => audit({ ...s, knowledge: s.knowledge.map((k) => (k.id !== id ? k : { ...k, sources: k.sources.filter((x) => x.id !== sourceId), chunks: k.chunks.filter((c) => c.source !== src.name), stats: { ...k.stats, documents: Math.max(0, k.stats.documents - src.documents) } })) },
      "knowledge.source.remove", kb.name, `${src.name}. Its passages are removed from the index at the next sync.`, kb.env));
    return { ok: true };
  },

  addEvalQuestion(id: string, question: string, expectedSource: string): Result {
    const kb = get().knowledge.find((k) => k.id === id);
    if (!kb) return fail("Unknown RAG index");
    const g = guard("pipeline.edit", kb.env); if (!g.ok) return g;
    if (question.trim().length < 6) return fail("Write the question the way a user would ask it.");
    set((s) => ({ ...s, knowledge: s.knowledge.map((k) => (k.id !== id ? k : { ...k, evalQuestions: [...k.evalQuestions, { id: uid("q"), question: question.trim(), expectedSource }] })) }));
    return { ok: true };
  },

  /** Sample workspace only: keyword overlap over the passages held in this browser. A signed-in workspace asks the server, which ranks by vector similarity. */
  searchKnowledge(id: string, q: { query: string; topK: number; minScore: number; source?: string }): Result<{ hits: Hit[] }> {
    const kb = get().knowledge.find((k) => k.id === id);
    if (!kb) return fail("Unknown RAG index");
    if (!q.query.trim()) return fail("Write a question to search for.");
    return { ok: true, hits: searchChunks(kb.chunks, q.query, { topK: q.topK, minScore: q.minScore, source: q.source }) };
  },

  runKnowledgeEvaluation(id: string): Result {
    const kb = get().knowledge.find((k) => k.id === id);
    if (!kb) return fail("Unknown RAG index");
    const g = guard("pipeline.run", kb.env); if (!g.ok) return g;
    if (kb.evalQuestions.length === 0) return fail("Add test questions first.");
    if (kb.chunks.length === 0) return fail("Nothing is indexed yet. Sync a source first.");
    const r = evaluate(kb, actorOf(get()), nowIso(), uid("ke"));
    set((s) => audit({ ...s, knowledge: s.knowledge.map((k) => (k.id !== id ? k : { ...k, evalRuns: [r, ...k.evalRuns].slice(0, 20) })) }, "knowledge.evaluate", kb.name, `recall@5 ${r.recallAt5}, MRR ${r.mrr}`, kb.env));
    return { ok: true };
  },

  updateKnowledgeAccess(id: string, access: KnowledgeBase["access"], schedule: KnowledgeBase["schedule"]): Result {
    const kb = get().knowledge.find((k) => k.id === id);
    if (!kb) return fail("Unknown RAG index");
    const g = guard("settings.edit"); if (!g.ok) return g;
    if (!(access.minScore >= 0 && access.minScore <= 1)) return fail("The minimum score is between 0 and 1.");
    if (!(access.topK >= 1 && access.topK <= 50)) return fail("Top K is between 1 and 50.");
    if (access.projects.length === 0) return fail("Allow at least one project, or nothing can query this RAG index.");
    set((s) => audit({ ...s, knowledge: s.knowledge.map((k) => (k.id !== id ? k : { ...k, access, schedule })) }, "knowledge.access", kb.name, `Projects: ${access.projects.join(", ")}. Source permissions ${access.aclAware ? "enforced" : "not enforced"}.`, kb.env));
    return { ok: true };
  },

  /** Changing how documents are split or embedded invalidates every stored passage, so it queues a full re-index. */
  updateKnowledgeProcessing(id: string, processing: KnowledgeBase["processing"], embedding: KnowledgeBase["embedding"]): Result {
    const kb = get().knowledge.find((k) => k.id === id);
    if (!kb) return fail("Unknown RAG index");
    const g = guard("pipeline.publish", kb.env); if (!g.ok) return g;
    if (!(processing.chunkTokens >= 64 && processing.chunkTokens <= 4096)) return fail("Chunk size is between 64 and 4096 tokens.");
    if (!(processing.overlap >= 0 && processing.overlap < processing.chunkTokens / 2)) return fail("Overlap must be below half the chunk size.");
    if (!(embedding.dimension > 0)) return fail("Enter the embedding dimension.");
    if (JSON.stringify(processing) === JSON.stringify(kb.processing) && JSON.stringify(embedding) === JSON.stringify(kb.embedding)) return fail("Nothing changed.");
    const at = nowIso();
    const run: KbRun = { id: uid("kr"), startedAt: at, durationSec: 0, trigger: "config-change", state: "running", added: 0, updated: kb.stats.documents, removed: 0, skipped: 0, failed: 0, tokens: 0, notes: ["Every document is split and embedded again with the new settings. The previous index keeps serving until this finishes."] };
    set((s) => audit({ ...s, knowledge: s.knowledge.map((k) => (k.id !== id ? k : { ...k, processing, embedding, status: "indexing", runs: [run, ...k.runs] })) }, "knowledge.reindex", kb.name, `Chunk ${processing.chunkTokens}/${processing.overlap}, ${embedding.model}`, kb.env));
    setTimeout(() => set((s) => ({ ...s, knowledge: s.knowledge.map((k) => (k.id !== id ? k : { ...k, status: k.sources.some((x) => x.status === "failed") ? "degraded" : "ready", runs: k.runs.map((r) => (r.id === run.id ? { ...r, state: "succeeded" as const, durationSec: 52, tokens: k.stats.tokens } : r)) })) })), 3500);
    return { ok: true };
  },

  deleteKnowledgeBase(id: string): Result {
    const kb = get().knowledge.find((k) => k.id === id);
    if (!kb) return fail("Unknown RAG index");
    const g = guard("settings.edit"); if (!g.ok) return g;
    const used = get().pipelines.filter((p) => p.versions.some((v) => v.spec.nodes.some((n) => n.operator === "vector_index" || n.operator === "retrieve") && v.spec.nodes.some((n) => n.config.collection === kb.index.collection))).map((p) => p.name);
    if (used.length) return fail(`In use by pipeline ${used.slice(0, 3).join(", ")}. Remove those references first.`);
    set((s) => audit({ ...s, knowledge: s.knowledge.filter((k) => k.id !== id) }, "knowledge.delete", kb.name, `Collection ${kb.index.collection} is dropped from the vector store.`, kb.env));
    return { ok: true };
  },

  // ---------------------------------------------------------------- deployments
  scaleDeployment(id: string, min: number, max: number): Result {
    const d = get().deployments.find((x) => x.id === id);
    if (!d) return fail("Unknown deployment");
    const g = guard("deployment.scale", d.env); if (!g.ok) return g;
    if (!(min >= 0 && max >= Math.max(1, min))) return fail("Max must be at least 1 and not below min");
    if (max > 20) return fail("Max replicas above 20 needs an admin-approved quota");
    set((s) => audit({ ...s, deployments: s.deployments.map((x) => (x.id === id ? { ...x, replicas: { ...x.replicas, min, max, desired: Math.min(Math.max(x.replicas.desired, min), max) }, updatedAt: nowIso() } : x)) }, "deployment.scale", d.name, `Autoscaling range ${min} to ${max}`, d.env));
    return { ok: true };
  },

  /**
   * Deploys a registered model version to a cluster connection. Staging and production take only an approved version, the same rule the release
   * pipeline applies, and production needs an approver. In the sample workspace the replicas are scheduled in the browser only.
   */
  deployModel(i: { name: string; modelId: string; version: number; env: Env; connectionId: string; runtime: string; engine: string; gpu: string; gpuCount: number; cuda: string; driver?: string; min: number; max: number; cpu: string; memory: string; exposure?: Deployment["exposure"]; precision?: string; contextTokens?: number; concurrency?: number }): Result<{ id: string }> {
    const s0 = get();
    const m = s0.models.find((x) => x.id === i.modelId); if (!m) return fail("Unknown model");
    const v = m.versions.find((x) => x.version === i.version); if (!v) return fail("Unknown model version");
    const g = guard(i.env === "production" ? "deployment.promote" : "deployment.scale", i.env); if (!g.ok) return g;
    const name = i.name.trim();
    if (!/^[a-z][a-z0-9-]{2,39}$/.test(name)) return fail("Name the deployment with 3 to 40 lowercase letters, digits or dashes, starting with a letter");
    if (s0.deployments.some((d) => d.name === name)) return fail("A deployment with this name already exists");
    if (i.env !== "development" && v.approval.state !== "approved" && v.approval.state !== "not-required") return fail(`v${i.version} is ${v.approval.state === "pending" ? "waiting for approval" : "not approved"}. Only approved versions can go to ${i.env}`);
    if (v.scan && v.scan.findings?.some((f) => f.level === "block")) return fail("The upload scan blocked this version");
    const conn = s0.connections.find((c) => c.id === i.connectionId); if (!conn) return fail("Choose a cluster connection");
    if (!(i.gpuCount >= 0 && i.gpuCount <= 16)) return fail("GPUs per replica must be between 0 and 16");
    if (!(i.min >= 0 && i.max >= Math.max(1, i.min) && i.max <= 20)) return fail("Replicas: max must be at least 1, not below min, and at most 20");
    const host = i.env === "production" ? "ml.example.tokener.io" : `${i.env}.ml.example.tokener.io`;
    const at = nowIso();
    const d: Deployment = {
      id: uid("dep"), name, modelId: i.modelId, version: i.version, env: i.env, connectionId: i.connectionId, runtime: i.runtime, health: "progressing",
      healthDetail: "Scheduling replicas and pulling the image. The first start loads the weights and can take several minutes.", endpoint: `https://${host}/v1/models/${name}`,
      replicas: { desired: Math.max(1, i.min), ready: 0, min: i.min, max: i.max }, resources: { cpu: i.cpu, memory: i.memory, gpu: String(i.gpuCount) },
      traffic: { stable: 100, canary: 0 }, rollout: { state: "in-progress", strategy: "rolling", startedAt: at }, rollbackAvailable: false,
      accelerator: i.gpuCount ? { engine: i.engine, gpu: i.gpu, count: i.gpuCount, cuda: i.cuda, driver: i.driver } : undefined, exposure: i.exposure, createdAt: at, updatedAt: at, demo: true,
    };
    set((s) => audit({ ...s, deployments: [d, ...s.deployments] }, "deployment.create", name, `${m.name} v${i.version} to ${i.env} on ${i.gpuCount ? `${i.gpuCount} x ${i.gpu}` : "CPU"} with ${i.engine}`, i.env));
    return { ok: true, id: d.id };
  },

  setCanaryPercent(id: string, pct: number): Result {
    const d = get().deployments.find((x) => x.id === id);
    if (!d) return fail("Unknown deployment");
    const g = guard("deployment.promote", d.env); if (!g.ok) return g;
    if (d.rollout.state !== "in-progress" && d.rollout.state !== "paused") return fail("No rollout in progress");
    if (!(pct >= 0 && pct <= 100)) return fail("Traffic must be between 0 and 100");
    set((s) => audit({ ...s, deployments: s.deployments.map((x) => (x.id === id ? { ...x, traffic: { ...x.traffic, canary: pct, stable: 100 - pct }, updatedAt: nowIso() } : x)) }, "deployment.traffic", d.name, `Canary traffic set to ${pct} percent`, d.env));
    return { ok: true };
  },

  promoteCanary(id: string): Result {
    const d = get().deployments.find((x) => x.id === id);
    if (!d) return fail("Unknown deployment");
    const g = guard("deployment.promote", d.env); if (!g.ok) return g;
    if (!d.traffic.canaryVersion) return fail("There is no canary to promote");
    const toV = d.traffic.canaryVersion;
    set((s) => audit({
      ...s,
      deployments: s.deployments.map((x) => (x.id === id ? { ...x, previousVersion: x.version, version: toV, traffic: { stable: 100, canary: 0 }, rollout: { ...x.rollout, state: "completed" }, health: "healthy", healthDetail: "Promoted. All replicas ready.", rollbackAvailable: true, updatedAt: nowIso() } : x)),
    }, "deployment.promote", d.name, `Version ${toV} promoted to 100 percent`, d.env));
    return { ok: true };
  },

  abortCanary(id: string): Result {
    const d = get().deployments.find((x) => x.id === id);
    if (!d) return fail("Unknown deployment");
    const g = guard("deployment.rollback", d.env); if (!g.ok) return g;
    if (!d.traffic.canaryVersion) return fail("There is no canary to abort");
    set((s) => audit({ ...s, deployments: s.deployments.map((x) => (x.id === id ? { ...x, traffic: { stable: 100, canary: 0 }, rollout: { ...x.rollout, state: "failed" }, health: "healthy", healthDetail: "Canary aborted. Stable version serving 100 percent.", updatedAt: nowIso() } : x)) }, "deployment.abort", d.name, "Canary aborted", d.env));
    return { ok: true };
  },

  rollbackDeployment(id: string): Result {
    const d = get().deployments.find((x) => x.id === id);
    if (!d) return fail("Unknown deployment");
    const g = guard("deployment.rollback", d.env); if (!g.ok) return g;
    if (!d.rollbackAvailable || !d.previousVersion) return fail("No previous version is available to roll back to");
    set((s) => audit({
      ...s,
      deployments: s.deployments.map((x) => (x.id === id ? { ...x, version: d.previousVersion!, previousVersion: d.version, traffic: { stable: 100, canary: 0 }, rollout: { ...x.rollout, state: "completed" }, health: "healthy", healthDetail: `Rolled back to version ${d.previousVersion}. Roll forward is available.`, updatedAt: nowIso() } : x)),
    }, "deployment.rollback", d.name, `Version ${d.version} to ${d.previousVersion}`, d.env));
    return { ok: true };
  },

  // ---------------------------------------------------------------- pipelines
  createPipeline(name: string, env: Env, spec?: PipelineSpec): Result<{ id: string }> {
    const g = guard("pipeline.edit"); if (!g.ok) return g;
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!slug) return fail("Give the pipeline a name");
    if (get().pipelines.some((p) => p.name === slug)) return fail(`A pipeline named ${slug} already exists`);
    const id = uid("pl");
    const sp = spec ? { ...clone(spec), metadata: { ...spec.metadata, name: slug }, environment: env } : { ...newSpec(slug, env), };
    const rec: PipelineRecord = { id, name: slug, description: sp.metadata.description, env, versions: [], draft: { spec: sp, savedAt: nowIso() }, demo: true };
    set((s) => audit({ ...s, pipelines: [rec, ...s.pipelines] }, "pipeline.create", slug, "Draft created", env));
    return { ok: true, id };
  },

  saveDraft(id: string, spec: PipelineSpec, step?: number): Result {
    const g = guard("pipeline.edit", spec.environment); if (!g.ok) return g;
    set((s) => ({ ...s, pipelines: s.pipelines.map((p) => (p.id === id ? { ...p, env: spec.environment, description: spec.metadata.description, draft: { spec, savedAt: nowIso(), step } } : p)) }));
    return { ok: true };
  },

  discardDraft(id: string): Result {
    const g = guard("pipeline.edit"); if (!g.ok) return g;
    set((s) => ({ ...s, pipelines: s.pipelines.map((p) => (p.id === id ? { ...p, draft: undefined } : p)) }));
    return { ok: true };
  },

  /** The pipeline as YAML. Without a version, the draft if there is one, otherwise the latest published version. Positions are left out. */
  exportPipeline(id: string, version?: number): Result<{ yaml: string; label: string }> {
    const p = get().pipelines.find((x) => x.id === id);
    if (!p) return fail("Unknown pipeline");
    const spec = version === undefined ? (p.draft?.spec ?? p.versions[0]?.spec) : p.versions.find((v) => v.version === version)?.spec;
    if (!spec) return fail(version === undefined ? "This pipeline has nothing to export yet." : `Version ${version} does not exist.`);
    return { ok: true, yaml: exportYaml(spec), label: version === undefined ? (p.draft ? "draft" : `v${p.versions[0].version}`) : `v${version}` };
  },

  /** Deletes a pipeline and its versions. The name must be typed, and a pipeline with runs in progress is refused. Run history is kept. */
  deletePipeline(id: string, confirm: string): Result {
    const g = guard("pipeline.publish"); if (!g.ok) return g;
    const p = get().pipelines.find((x) => x.id === id);
    if (!p) return fail("Unknown pipeline");
    if (p.name !== confirm) return fail("Type the pipeline name to confirm.");
    const active = get().runs.filter((r) => r.pipelineId === id && ["queued", "running", "waiting-approval"].includes(r.status)).length;
    if (active > 0) return fail(`This pipeline has ${active} run${active === 1 ? "" : "s"} in progress. Cancel them first.`);
    set((s) => audit({ ...s, pipelines: s.pipelines.filter((x) => x.id !== id) }, "pipeline.delete", p.name, "Pipeline and its versions deleted", p.env));
    return { ok: true };
  },

  restoreVersion(id: string, version: number): Result {
    const g = guard("pipeline.edit"); if (!g.ok) return g;
    const p = get().pipelines.find((x) => x.id === id);
    const v = p?.versions.find((x) => x.version === version);
    if (!p || !v) return fail("Unknown version");
    set((s) => audit({ ...s, pipelines: s.pipelines.map((x) => (x.id === id ? { ...x, draft: { spec: clone(v.spec), savedAt: nowIso() } } : x)) }, "pipeline.restore", p.name, `Draft restored from version ${version}`, p.env));
    return { ok: true };
  },

  publish(id: string, note: string): Result<{ version: number }> {
    const s0 = get();
    const p = s0.pipelines.find((x) => x.id === id);
    if (!p?.draft) return fail("Nothing to publish");
    const g = guard("pipeline.publish", p.draft.spec.environment); if (!g.ok) return g;
    const issues = validateSpec(p.draft.spec, { connections: s0.connections, agents: s0.agents });
    const errs = issues.filter((i) => i.level === "error");
    if (errs.length) return fail(`${errs.length} validation error${errs.length > 1 ? "s" : ""} to fix first. ${errs[0].msg}`);
    const draft = p.draft;
    const digest = specDigest(draft.spec);
    if (p.versions[0]?.digest === digest) return fail("The draft is identical to the latest version");
    const version = (p.versions[0]?.version ?? 0) + 1;
    set((s) => audit({
      ...s,
      pipelines: s.pipelines.map((x) => (x.id === id ? { ...x, env: draft.spec.environment, versions: [{ version, spec: clone(draft.spec), digest, createdAt: nowIso(), createdBy: actorOf(s), note: note || `Version ${version}` }, ...x.versions], draft: undefined } : x)),
    }, "pipeline.publish", p.name, `Version ${version} published. Immutable. ${digest.slice(0, 19)}...`, draft.spec.environment));
    return { ok: true, version };
  },

  // ---------------------------------------------------------------- runs
  startRun(pipelineId: string, version: number, trigger = "manual", mode: ExecMode = "demo", opts: { fail?: { nodeId: string; kind: "fail" } } = {}): Result<{ id: string; status: PipelineRun["status"] }> {
    const s0 = get();
    const p = s0.pipelines.find((x) => x.id === pipelineId);
    // Version 0 means "simulate the working draft". It is always a simulated run, labelled as a draft run, so nothing unpublished can reach infrastructure.
    const v = version === 0 && p?.draft ? { version: 0, spec: p.draft.spec } : p?.versions.find((x) => x.version === version);
    if (!p || !v) return fail("Publish a version before running");
    if (version === 0 && mode !== "demo") return fail("Only published versions can run against infrastructure. Publish first.");
    const g = guard("pipeline.run", v.spec.environment); if (!g.ok) return g;
    if (s0.settings.killSwitch) return fail("The MLOps kill switch is on. Runs are disabled until an admin turns it off in Settings.");
    const violations = policyViolations(v.spec, s0.settings);
    if (violations.length) return fail(`Blocked by organisation policy: ${violations.join(" ")}`);
    try { assertExecutable(mode, v.spec); } catch (e) { return fail(e instanceof RealModeUnavailable ? e.message : "Cannot execute"); }
    const finalRun = computeRun({ spec: v.spec, version, pipelineId, pipelineName: p.name, ctx: { connections: s0.connections, agents: s0.agents }, connections: s0.connections }, { startedBy: actorOf(s0), trigger, fail: opts.fail, approved: false });
    const id = finalRun.id;
    if (finalRun.status === "validation-failed") {
      set((s) => audit({ ...s, runs: [finalRun, ...s.runs] }, "run.validation-failed", p.name, `${finalRun.events.length - 1} blocking issue(s). Nothing was executed.`, v.spec.environment));
      return { ok: true, id, status: finalRun.status };
    }
    const first: PipelineRun = { ...finalRun, status: "running", durationMs: undefined, nodes: finalRun.nodes.map((n) => ({ ...n, status: "pending", logs: [], artifacts: [], durationMs: undefined, startedAt: undefined })), events: finalRun.events.slice(0, 1) };
    set((s) => audit({ ...s, runs: [first, ...s.runs], finals: { ...(s.finals ?? {}), [id]: finalRun } }, "run.start", p.name, `Run ${id} started (${trigger}). Demo executor.`, v.spec.environment));
    reveal(id, 0);
    return { ok: true, id, status: "running" };
  },

  cancelRun(id: string): Result {
    const r = get().runs.find((x) => x.id === id);
    if (!r) return fail("Unknown run");
    const g = guard("run.cancel", r.env); if (!g.ok) return g;
    if (!["running", "queued", "waiting-approval"].includes(r.status)) return fail("Run already finished");
    stop(id);
    set((s) => audit({
      ...s,
      finals: Object.fromEntries(Object.entries(s.finals ?? {}).filter(([k]) => k !== id)),
      runs: s.runs.map((x) => (x.id === id ? { ...x, status: "cancelled", nodes: x.nodes.map((n) => (n.status === "pending" || n.status === "running" || n.status === "waiting" ? { ...n, status: "skipped" } : n)), events: [...x.events, { t: nowIso(), kind: "run", msg: `Cancelled by ${actorOf(s)}. In-flight operators were asked to stop and no further operators started.` }] } : x)),
    }, "run.cancel", r.pipelineName, `Run ${id} cancelled`, r.env));
    return { ok: true };
  },

  approveRun(id: string, approve: boolean, note = ""): Result {
    const s0 = get();
    const r = s0.runs.find((x) => x.id === id);
    if (!r) return fail("Unknown run");
    const g = guard("run.approve", r.env); if (!g.ok) return g;
    if (r.status !== "waiting-approval") return fail("This run is not waiting for approval");
    if (!approve) {
      set((s) => audit({ ...s, runs: s.runs.map((x) => (x.id === id ? { ...x, status: "cancelled", nodes: x.nodes.map((n) => (n.status === "waiting" || n.status === "pending" ? { ...n, status: "skipped" } : n)), events: [...x.events, { t: nowIso(), kind: "approval", msg: `Rejected by ${actorOf(s)}. ${note}` }] } : x)) }, "run.reject", r.pipelineName, note || "Rejected", r.env));
      return { ok: true };
    }
    const snap = (r.snapshot as { spec: PipelineSpec }).spec;
    const spec = { ...snap, nodes: snap.nodes.map((n) => ({ ...n, x: n.x ?? 0, y: n.y ?? 0 })) } as PipelineSpec;
    const finalRun = computeRun({ spec, version: r.pipelineVersion, pipelineId: r.pipelineId, pipelineName: r.pipelineName, ctx: { connections: s0.connections, agents: s0.agents }, connections: s0.connections }, { startedBy: r.startedBy, trigger: r.trigger, startedAt: new Date(r.startedAt), approved: true, id: r.id, seed: `${r.id}-approved` });
    const wIdx = r.nodes.findIndex((n) => n.status === "waiting");
    const merged: PipelineRun = {
      ...finalRun,
      nodes: finalRun.nodes.map((n, i) => (i < wIdx ? r.nodes[i] : n)),
      events: [...r.events.filter((e) => !/waiting for an approver/.test(e.msg)), { t: nowIso(), kind: "approval", msg: `Approved by ${actorOf(s0)}.${note ? ` ${note}` : ""}` }],
    };
    const resume: PipelineRun = { ...r, status: "running", nodes: merged.nodes.map((n, i) => (i <= wIdx ? (i === wIdx ? { ...n } : n) : { ...n, status: "pending", logs: [], artifacts: [], durationMs: undefined, startedAt: undefined })), events: merged.events };
    set((s) => {
      let n = audit({ ...s, runs: s.runs.map((x) => (x.id === id ? resume : x)), finals: { ...(s.finals ?? {}), [id]: merged } }, "run.approve", r.pipelineName, `Gate approved. ${note}`, r.env);
      // Approving a promotion run approves the model version it references.
      const rm = (r.snapshot as { spec: PipelineSpec }).spec.nodes.find((x) => x.operator === "registry_model");
      if (rm) n = { ...n, models: n.models.map((m) => (m.name !== rm.config.name ? m : { ...m, versions: m.versions.map((v) => (v.version === Number(rm.config.version) && v.approval.state === "pending" ? { ...v, approval: { state: "approved" as const, by: actorOf(s), at: nowIso(), note: `Approved via run ${id}` } } : v)) })) };
      return n;
    });
    reveal(id, Math.max(0, wIdx));
    return { ok: true };
  },

  // ---------------------------------------------------------------- build agents
  enrollAgent(input: { name: string; mode: BuildAgent["mode"]; env: Env; arch: string; labels: Record<string, string>; egress: string[]; registries: string[] }): Result<{ agent: BuildAgent; token: string }> {
    const g = guard("agent.enroll"); if (!g.ok) return g;
    if (!/^[a-z][a-z0-9-]{2,40}$/.test(input.name)) return fail("Name must be 3 to 41 lowercase letters, digits or hyphens");
    if (get().agents.some((a) => a.name === input.name)) return fail(`An agent named ${input.name} already exists`);
    if (input.env === "production" && !get().settings.allowProductionAgents) return fail("Production agents are blocked by policy. An admin can allow them in Settings.");
    const bytes = new Uint8Array(24);
    (globalThis.crypto ?? ({ getRandomValues: (b: Uint8Array) => b.forEach((_, i) => (b[i] = Math.floor(Math.random() * 256))) } as Crypto)).getRandomValues(bytes);
    const token = "tke_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    const agent: BuildAgent = {
      id: uid("agent"), name: input.name, mode: input.mode, status: "offline", version: "0.4.0-preview", os: "Linux (pending first heartbeat)", arch: input.arch,
      labels: { os: "linux", arch: input.arch, ...input.labels }, capabilities: ["docker-buildx", "sbom"], concurrency: { max: 2, running: 0 }, lastHeartbeatAt: "", registeredAt: nowIso(), owner: actorOf(get()), env: input.env,
      egressAllowlist: input.egress, registries: input.registries, tokenExpiresAt: new Date(Date.now() + 24 * 3600_000).toISOString(), demo: true,
    };
    set((s) => audit({ ...s, agents: [agent, ...s.agents] }, "agent.enroll", agent.name, "Enrollment token issued. Shown once, valid 24 hours, stored only as a hash.", input.env));
    return { ok: true, agent, token };
  },

  /** Demo only: pretends the installed agent has sent its first heartbeat. */
  simulateAgentHeartbeat(id: string): Result {
    set((s) => ({ ...s, agents: s.agents.map((a) => (a.id === id ? { ...a, status: "online", lastHeartbeatAt: nowIso(), os: "Linux (Ubuntu 22.04)", tokenExpiresAt: new Date(Date.now() + 90 * 24 * 3600_000).toISOString() } : a)) }));
    return { ok: true };
  },

  drainAgent(id: string, drain: boolean): Result {
    const g = guard("agent.revoke"); if (!g.ok) return g;
    const a = get().agents.find((x) => x.id === id);
    if (!a) return fail("Unknown agent");
    set((s) => audit({ ...s, agents: s.agents.map((x) => (x.id === id ? { ...x, status: drain ? "draining" : "online" } : x)) }, drain ? "agent.drain" : "agent.resume", a.name, drain ? "No new jobs will be assigned" : "Accepting jobs again", a.env));
    return { ok: true };
  },

  /** A new enrollment token for an agent that has not sent its first heartbeat. Same rules as the server: not for an enrolled agent, shown once, valid 24 hours. */
  reissueAgentEnrollment(id: string): Result<{ token?: string }> {
    const g = guard("agent.enroll"); if (!g.ok) return g;
    const a = get().agents.find((x) => x.id === id);
    if (!a) return fail("Unknown agent");
    if (a.lastHeartbeatAt) return fail("This agent is enrolled. Rotate its token instead.");
    const bytes = new Uint8Array(24);
    (globalThis.crypto ?? ({ getRandomValues: (b: Uint8Array) => b.forEach((_, i) => (b[i] = Math.floor(Math.random() * 256))) } as Crypto)).getRandomValues(bytes);
    const token = "tok_enr_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    set((s) => audit({ ...s, agents: s.agents.map((x) => (x.id === id ? { ...x, tokenExpiresAt: new Date(Date.now() + 24 * 3600_000).toISOString() } : x)) }, "agent.reissue", a.name, "New enrollment token. Shown once, valid 24 hours. The earlier one no longer works.", a.env));
    return { ok: true, token };
  },

  rotateAgentToken(id: string): Result<{ token?: string }> {
    const g = guard("agent.enroll"); if (!g.ok) return g;
    const a = get().agents.find((x) => x.id === id);
    if (!a) return fail("Unknown agent");
    const token = "tke_" + Array.from({ length: 48 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    set((s) => audit({ ...s, agents: s.agents.map((x) => (x.id === id ? { ...x, tokenExpiresAt: new Date(Date.now() + 90 * 24 * 3600_000).toISOString() } : x)) }, "agent.token-rotate", a.name, "Token rotated. Old token revoked immediately.", a.env));
    return { ok: true, token };
  },

  revokeAgent(id: string): Result {
    const g = guard("agent.revoke"); if (!g.ok) return g;
    const a = get().agents.find((x) => x.id === id);
    if (!a) return fail("Unknown agent");
    if (a.concurrency.running > 0) return fail("The agent is running a job. Drain it first and wait for the job to finish.");
    set((s) => audit({ ...s, agents: s.agents.filter((x) => x.id !== id) }, "agent.revoke", a.name, "Agent credential revoked. It can no longer pull jobs.", a.env));
    return { ok: true };
  },

  /** Lists what a connection can see. In the sample workspace the answer comes from a fixed table and nothing is reached. */
  discoverConnection(id: string, q: DiscoveryQuery): Result<{ result: DiscoveryResult }> {
    const c = get().connections.find((x) => x.id === id);
    if (!c) return fail("Unknown connection");
    const bad = validateQuery(q); if (bad) return fail(bad);
    if (!c.capabilities.includes("discover")) return fail("This connection's integration does not support discovery.");
    return { ok: true, result: sampleDiscovery(q) };
  },

  /** Checks a spec the way the control plane does and saves nothing: rule findings, organisation policy, run blockers and the two verdicts. */
  validatePipeline(spec: PipelineSpec): Result<{ report: ValidationReport }> {
    const s = get();
    const issues = validateSpec(spec, { connections: s.connections, agents: s.agents });
    const pv = policyViolations(spec, s.settings);
    const rb = runBlockers(spec, issues);
    const blocked = issues.some((i) => i.level === "error");
    return { ok: true, report: { issues, policyViolations: pv, runBlockers: rb, publishable: !blocked && pv.length === 0, runnable: rb.length === 0 && pv.length === 0 } };
  },


  /** Upload records, newest first. The library list is for platform operators. */
  listUploads(library = false): Result<{ uploads: UploadRecord[] }> {
    return { ok: true, uploads: [...uploadBook(library)].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)) };
  },
  /** One upload with its inspection result. */
  getUpload(id: string, library = false): Result<{ upload: UploadRecord }> {
    const u = uploadBook(library).find((x) => x.id === id); return u ? { ok: true, upload: u } : fail(`No upload ${id}.`);
  },
  /** Cancels an upload that has no verdict yet. Same rules as the server: only the person who started it, or an admin, and never one that already finished. */
  abortUpload(id: string, library = false): Result<{ upload: UploadRecord }> {
    if (!library) { const g = guard("model.register"); if (!g.ok) return g; }
    const book = uploadBook(library); const u = book.find((x) => x.id === id);
    const why = abortProblem(u); if (why) return fail(why);
    const done = { ...u!, status: "aborted" as const };
    book.splice(book.indexOf(u!), 1, done);
    set((s) => audit(s, "model.upload.abort", `upload/${id}`, `${u!.modelName} ${u!.fileName}`));
    return { ok: true, upload: done };
  },

  /** The plan this sample organisation holds. A platform operator can change it with assignPlan. */
  getPlan(): Result<{ plan: PlanInfo }> { return { ok: true, plan: planById(samplePlans[SAMPLE_ORG]) }; },

  /** Platform operators only, so no role in the console's table grants it. Same rule as the server: the plan must exist. */
  assignPlan(orgId: string, planId: string): Result<{ plan: PlanInfo }> {
    if (!PLANS.some((p) => p.id === planId)) return fail(`No plan ${planId}.`);
    if (!orgId.trim()) return fail("Choose an organisation.");
    samplePlans[orgId.trim()] = planId;
    set((s) => audit(s, "plan.assign", orgId.trim(), `The ${planById(planId).name} plan was given to this organisation.`));
    return { ok: true, plan: planById(planId) };
  },

  acknowledgeAlert(id: string): Result {
    const g = guard("alert.acknowledge"); if (!g.ok) return g;
    const a = get().alerts.find((x) => x.id === id);
    if (!a) return fail("Unknown alert");
    set((s) => audit({ ...s, alerts: s.alerts.map((x) => (x.id === id ? { ...x, state: "acknowledged" } : x)) }, "alert.acknowledge", a.title, a.resource));
    return { ok: true };
  },
};


// --------------------------------------------------------------------------- the facade the screens call

type Demo = typeof demoActions;
type SyncOnly = "setRole" | "note";
type Facade = { [K in Exclude<keyof Demo, SyncOnly>]: Demo[K] extends (...a: infer A) => infer R ? (...a: A) => Promise<R> : never } & {
  setRole: Demo["setRole"];
  note: Demo["note"];
  /** Live only. Runs the read-only connection test before anything is saved. */
  testConnectionDraft: LiveDriver["actions"]["testConnectionDraft"];
  /** Reads the given parts of the workspace again. Does nothing in the sample workspace. */
  refresh: (slices?: Parameters<LiveDriver["refresh"]>[0]) => Promise<void>;
};

/**
 * Every action is async because a signed-in workspace answers over the network. In the sample workspace the same call resolves at once from the
 * browser's copy. The screens do not care which one they are talking to; they show the Result either way.
 */
export const mlops = (() => {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(demoActions) as (keyof Demo)[]) {
    if (k === "setRole" || k === "note") continue;
    out[k] = (...a: unknown[]) => {
      if (mode === "live") {
        const f = (driver?.actions as unknown as Record<string, ((...x: unknown[]) => Promise<unknown>) | undefined>)?.[k];
        return f ? f(...a) : Promise.resolve(fail("This is not available in a signed-in workspace."));
      }
      return Promise.resolve((demoActions[k] as (...x: unknown[]) => unknown)(...a));
    };
  }
  out.setRole = (role: RoleId) => { if (mode === "demo") demoActions.setRole(role); };
  out.note = (action: string, resource: string, detail: string, env?: Env) => { if (mode === "demo") demoActions.note(action, resource, detail, env); };
  out.testConnectionDraft = (...a: unknown[]) => (driver ? (driver.actions.testConnectionDraft as (...x: unknown[]) => unknown)(...a) : Promise.resolve(fail("Test connections from a signed-in workspace.")));
  out.refresh = async (slices?: Parameters<LiveDriver["refresh"]>[0]) => { if (driver) await driver.refresh(slices); };
  return out as Facade;
})();

// --------------------------------------------------------------------------- run reveal

function stop(id: string) { timers.get(id)?.forEach(clearTimeout); timers.delete(id); }

/** Reveal a precomputed run node by node so progress feels live. Nothing here touches infrastructure. */
function reveal(id: string, from: number) {
  const fin = get().finals?.[id];
  if (!fin) return;
  stop(id);
  const list: ReturnType<typeof setTimeout>[] = [];
  const step = 1100;
  const todo = fin.nodes.map((n, i) => ({ n, i })).filter(({ i }) => i >= from);
  todo.forEach(({ n, i }, k) => {
    const at = k * step;
    list.push(setTimeout(() => {
      set((s) => ({ ...s, runs: s.runs.map((r) => (r.id !== id || r.status !== "running" ? r : { ...r, nodes: r.nodes.map((x, j) => (j === i ? { ...x, status: "running", startedAt: nowIso(), logs: n.logs.slice(0, 1) } : x)) })) }));
    }, at + 150));
    list.push(setTimeout(() => {
      set((s) => ({ ...s, runs: s.runs.map((r) => (r.id !== id || r.status !== "running" ? r : { ...r, nodes: r.nodes.map((x, j) => (j === i ? n : x)), events: fin.events.slice(0, Math.max(1, Math.ceil(((i + 1) / fin.nodes.length) * fin.events.length))) })) }));
    }, at + step - 100));
  });
  list.push(setTimeout(() => {
    set((s) => {
      const r = s.runs.find((x) => x.id === id);
      if (!r || r.status !== "running") return s;
      const finals = { ...(s.finals ?? {}) };
      delete finals[id];
      let n: MlopsState = { ...s, finals, runs: s.runs.map((x) => (x.id === id ? fin : x)) };
      n = audit(n, `run.${fin.status}`, fin.pipelineName, `Run ${id} ${fin.status}`, fin.env);
      return applyRunEffects(n, fin);
    });
    timers.delete(id);
    const msg = { succeeded: "Run succeeded", failed: "Run failed", "rolled-back": "Run failed and was rolled back", "waiting-approval": "Run is waiting for approval" }[fin.status as string];
    if (msg) toast(`${fin.pipelineName}: ${msg}`, fin.status === "succeeded" ? "success" : fin.status === "waiting-approval" ? "info" : "error");
  }, todo.length * step + 250));
  timers.set(id, list);
}

/** Demo side effects: a successful promotion updates the matching deployment and model stage. */
function applyRunEffects(s: MlopsState, run: PipelineRun): MlopsState {
  if (run.status !== "succeeded") return s;
  const spec = (run.snapshot as { spec: PipelineSpec }).spec;
  if (!spec.nodes.some((n) => n.operator === "promote")) return s;
  const dep = s.deployments.find((d) => d.pipelineId === run.pipelineId && d.env === run.env);
  if (!dep) return s;
  const model = s.models.find((m) => m.id === dep.modelId);
  const target = Number(spec.nodes.find((n) => n.operator === "registry_model")?.config.version ?? model?.versions[0]?.version ?? dep.version);
  const stage: "staging" | "production" = run.env === "production" ? "production" : "staging";
  return {
    ...s,
    deployments: s.deployments.map((d) => (d.id === dep.id ? { ...d, previousVersion: d.version, version: target, traffic: { stable: 100, canary: 0 }, rollout: { ...d.rollout, state: "completed" }, health: "healthy", healthDetail: "Promoted by pipeline run. All replicas ready.", rollbackAvailable: true, updatedAt: nowIso() } : d)),
    models: s.models.map((m) => (m.id !== dep.modelId ? m : { ...m, versions: m.versions.map((v) => (v.version === target ? { ...v, stage } : v.stage === stage ? { ...v, stage: "archived" as const } : v)) })),
  };
}

// --------------------------------------------------------------------------- connectivity test

export type TestFailure = "none" | "dns" | "network" | "tls" | "auth" | "permission" | "version";
export type TestStep = { id: string; label: string; state: "pass" | "fail" | "skipped"; detail: string };

/**
 * Demo connectivity test. It cannot reach anything. The failure class is chosen by the person
 * running the demo so each class of error and its remediation can be seen. Real tests will run
 * server-side, are non-destructive, and distinguish exactly these classes.
 */
export function simulateConnectivityTest(integrationId: string, endpoint: string, tlsVerify: boolean, failure: TestFailure): TestStep[] {
  const integ = integrationById(integrationId);
  const host = endpoint.replace(/^[a-z+]+:\/\//, "").split(/[/:]/)[0] || "host";
  const order: { id: Exclude<TestFailure, "none">; label: string; ok: string; bad: string }[] = [
    { id: "dns", label: "DNS resolution", ok: `${host} resolved`, bad: `Could not resolve ${host}. Check the hostname and, for private targets, the resolver or agent.` },
    { id: "network", label: "Network reachability", ok: "TCP connection established", bad: `Connection to ${host} timed out. Check firewall rules, proxy settings and private connectivity.` },
    { id: "tls", label: "TLS trust", ok: tlsVerify ? "Certificate chain verified" : "Certificate not verified (TLS verification is off)", bad: "Certificate signed by an unknown authority. Add the CA bundle. Do not disable verification." },
    { id: "auth", label: "Authentication", ok: "Credential accepted", bad: "401 Unauthorized. The credential is wrong, expired or for another audience." },
    { id: "permission", label: "Permissions (read-only probe)", ok: "Read-only discovery permitted", bad: "403 Forbidden on the read-only probe. The identity lacks the discovery permissions listed in step 5." },
    { id: "version", label: "Version compatibility", ok: `${integ?.versionTarget.split(".")[0] ?? "Version"} within the supported range`, bad: `The target reports a version outside the supported range (${integ?.versionTarget}).` },
  ];
  let broken = false;
  return order.map((o) => {
    if (broken) return { id: o.id, label: o.label, state: "skipped", detail: "Not run because an earlier check failed" };
    if (failure === o.id) { broken = true; return { id: o.id, label: o.label, state: "fail", detail: o.bad }; }
    return { id: o.id, label: o.label, state: "pass", detail: o.ok };
  });
}

export const INTEGRATION_LIST = INTEGRATIONS;
export { runBlockers };
