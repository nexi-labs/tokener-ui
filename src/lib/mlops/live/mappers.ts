/**
 * Maps control plane responses to the shapes the console renders. The API and the console agree on almost every field; what differs is written
 * down here: omitted nulls become empty strings, the registry's scan line becomes a verdict, and enums the console does not draw collapse
 * into the nearest one it does. Nothing in this file calls the network.
 */
import type {
  Alert, AuditEvent, BuildAgent, Connection, Deployment, Env, Health, KbRun, KnowledgeBase, LibraryModel, ModelArtifact, ModelScan, ModelVersion,
  NodeRun, Payment, PaymentEvent, PipelineRun, Refund,
} from "../types";
import type { PipelineRecord } from "../spec";
import type { MlopsSettings } from "../fixtures";

type J = Record<string, any>;
const arr = <T = J>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : v == null ? d : String(v));
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);

export function toConnection(a: J): Connection {
  return {
    id: a.id, name: a.name, integrationId: a.integrationId, env: a.env as Env, owner: str(a.owner), scope: str(a.scope), auth: a.auth,
    secretRef: a.secretRef || undefined, endpoint: str(a.endpoint), tlsVerify: a.tlsVerify !== false, permissions: a.readWrite ? "read-write" : "read-only",
    health: (a.health ?? "unknown") as Health, healthDetail: str(a.healthDetail), lastVerifiedAt: str(a.lastVerifiedAt), credentialRotatedAt: str(a.credentialRotatedAt),
    credentialExpiresAt: a.credentialExpiresAt || undefined, capabilities: arr<string>(a.capabilities) as Connection["capabilities"], version: a.version || undefined,
    settings: a.options && Object.keys(a.options).length ? a.options : undefined, demo: !!a.demo,
  };
}

function toScan(s: unknown): ModelScan | undefined {
  if (!s) return undefined;
  const text = str(s);
  const warn = /warning/i.test(text) && !/\b0 warning/i.test(text);
  return { verdict: /blocked|rejected/i.test(text) ? "blocked" : warn ? "warnings" : "clean", summary: text, findings: [] };
}

export function toVersion(a: J): ModelVersion {
  const p = a.provenance ?? {};
  return {
    version: a.version, stage: a.stage ?? "none", createdAt: str(a.createdAt), createdBy: str(a.createdBy), framework: str(a.framework, "unspecified"), format: str(a.format),
    sizeMb: num(a.sizeMb), checksum: str(a.checksum), provenance: { git: str(p.git), repo: str(p.repo), trainingRun: str(p.trainingRun), datasetHash: str(p.datasetHash), builder: str(p.builder), signed: !!p.signed },
    metrics: a.metrics ?? {}, approval: { state: a.approval?.state ?? "pending", by: a.approval?.by || undefined, at: a.approval?.at || undefined, note: a.approval?.note || undefined },
    license: str(a.license, "unspecified"), notes: str(a.notes), source: a.source || undefined, scan: toScan(a.scan),
    trainingData: a.trainingData ? {
      datasetId: str(a.trainingData.datasetId), datasetName: str(a.trainingData.datasetName), datasetVersion: num(a.trainingData.datasetVersion), quality: num(a.trainingData.quality),
      sensorQuality: a.trainingData.sensorQuality ?? undefined, reportId: a.trainingData.reportId || undefined, measuredAt: str(a.trainingData.measuredAt),
    } : undefined,
  };
}

export function toModel(a: J): ModelArtifact {
  return { id: a.id, name: a.name, description: str(a.description), task: str(a.task, "Unspecified"), owner: str(a.owner), versions: arr(a.versions).map(toVersion).sort((x, y) => y.version - x.version), demo: !!a.demo };
}

export function toLibrary(a: J): LibraryModel {
  const m = toModel(a);
  return {
    id: m.id, name: m.name, description: m.description, task: m.task, publisher: m.owner || "platform operator",
    versions: m.versions.map((v) => ({ ...v, withdrawn: v.stage === "archived", imports: 0 })),
  };
}

export function toDeployment(a: J): Deployment {
  return {
    id: a.id, name: a.name, modelId: a.modelId, version: a.version, env: a.env, connectionId: str(a.connectionId), runtime: str(a.runtime), health: a.health ?? "unknown", healthDetail: str(a.healthDetail),
    endpoint: str(a.endpoint), replicas: { desired: num(a.replicas?.desired), ready: num(a.replicas?.ready), min: num(a.replicas?.min), max: num(a.replicas?.max) },
    resources: { cpu: str(a.resources?.cpu), memory: str(a.resources?.memory), gpu: str(a.resources?.gpu, "none") },
    traffic: { stable: num(a.traffic?.stable, 100), canary: num(a.traffic?.canary), canaryVersion: a.traffic?.canaryVersion ?? undefined },
    rollout: { state: a.rollout?.state ?? "idle", strategy: str(a.rollout?.strategy, "rolling"), startedAt: a.rollout?.startedAt || undefined },
    previousVersion: a.previousVersion ?? undefined, rollbackAvailable: !!a.rollbackAvailable, pipelineId: a.pipelineId || undefined, createdAt: str(a.createdAt), updatedAt: str(a.updatedAt), demo: !!a.demo,
    accelerator: a.accelerator ? { engine: str(a.accelerator.engine), gpu: str(a.accelerator.gpu), count: num(a.accelerator.count), cuda: str(a.accelerator.cuda), driver: a.accelerator.driver || undefined } : undefined,
    exposure: a.exposure ? { providerId: a.exposure.providerId || undefined, mcpServerId: a.exposure.mcpServerId || undefined, mcpTool: a.exposure.mcpTool || undefined } : undefined,
  };
}

export function toAgent(a: J): BuildAgent {
  const gpu = a.gpu?.detected ? `${a.gpu.count ?? 1} x ${a.gpu.model ?? "GPU"}${a.gpu.driver ? ` (driver ${a.gpu.driver})` : ""}` : undefined;
  return {
    id: a.id, name: a.name, mode: a.mode, status: a.drain && a.status !== "offline" ? "draining" : (a.status ?? "offline"), version: str(a.version), os: str(a.os, "Waiting for the first heartbeat"), arch: str(a.arch),
    labels: a.labels ?? {}, capabilities: arr<string>(a.capabilities), concurrency: { max: num(a.maxConcurrency, 1), running: num(a.running) }, lastHeartbeatAt: str(a.lastHeartbeatAt),
    registeredAt: str(a.registeredAt), owner: str(a.owner), env: a.env, egressAllowlist: arr<string>(a.egressAllowlist), registries: arr<string>(a.registries), tokenExpiresAt: str(a.tokenExpiresAt), gpu, demo: !!a.demo,
  };
}

const nodeStatus = (s: string): NodeRun["status"] => (s === "retrying" ? "running" : (s as NodeRun["status"]));

export function toRun(a: J): PipelineRun {
  return {
    id: a.id, pipelineId: a.pipelineId, pipelineName: str(a.pipelineName), pipelineVersion: num(a.pipelineVersion), env: a.env, status: a.status, trigger: str(a.trigger, "manual"), startedBy: str(a.startedBy),
    startedAt: str(a.startedAt), durationMs: a.durationMs ?? undefined, idempotencyKey: str(a.idempotencyKey), specDigest: str(a.specDigest),
    nodes: arr(a.nodes).map((n): NodeRun => ({
      nodeId: n.nodeId, status: nodeStatus(n.status), startedAt: n.startedAt || undefined, durationMs: n.durationMs ?? undefined, attempt: num(n.attempt, 1), maxAttempts: num(n.maxAttempts, 1),
      logs: arr(n.logs).map((l) => ({ t: str(l.t), level: (l.level ?? "info") as "info", msg: str(l.msg) })), artifacts: arr(n.artifacts).map((x) => ({ name: x.name, kind: x.kind, ref: x.ref, digest: x.digest || undefined })),
    })),
    events: arr(a.events).map((e) => ({ t: str(e.t), kind: str(e.kind), msg: str(e.msg) })), snapshot: a.snapshot ?? {}, demo: !!a.demo,
  };
}

export function toPipeline(a: J): PipelineRecord {
  return {
    id: a.id, name: a.name, description: str(a.description), env: a.env,
    versions: arr(a.versions).map((v) => ({ version: v.version, spec: v.spec, digest: str(v.digest), createdAt: str(v.createdAt), createdBy: str(v.createdBy), note: str(v.note) })),
    draft: a.draft?.spec ? { spec: a.draft.spec, savedAt: str(a.draft.savedAt), step: a.draft.step ?? undefined } : undefined, demo: !!a.demo,
  };
}

export function toAudit(a: J): AuditEvent {
  return { id: a.id, at: str(a.at), actor: str(a.actor), action: str(a.action), resource: str(a.resource), detail: str(a.detail), env: a.env || undefined, demo: !!a.demo };
}

export function toAlert(a: J): Alert {
  return { id: a.id, severity: a.severity, title: str(a.title), resource: str(a.resource), since: str(a.since), detail: str(a.detail), state: a.state };
}

export function toSettings(a: J): MlopsSettings {
  return {
    killSwitch: !!a.killSwitch, requireProdApproval: a.requireProdApproval !== false, requireSignedImages: a.requireSignedImages !== false, auditRetentionDays: num(a.auditRetentionDays, 400),
    secretManager: a.secretManager ?? "vault", allowedRegistries: arr<string>(a.allowedRegistries), allowProductionAgents: !!a.allowProductionAgents, allowPaymentsInProduction: !!a.allowPaymentsInProduction,
    maxPaymentAmount: num(a.maxPaymentAmount), allowedPaymentCurrencies: arr<string>(a.allowedPaymentCurrencies),
    dataQualityGate: a.dataQualityGate ? {
      enabled: a.dataQualityGate.enabled !== false, minQuality: num(a.dataQualityGate.minQuality, 80), minSensorQuality: num(a.dataQualityGate.minSensorQuality, 85), requireTrainingData: !!a.dataQualityGate.requireTrainingData,
    } : undefined,
  };
}

export function toRefund(a: J): Refund {
  return {
    id: a.id, paymentId: a.paymentId, amountMinor: num(a.amountMinor), reason: str(a.reason), state: a.state, requestedBy: str(a.requestedBy), approvedBy: a.approvedBy || undefined,
    providerRef: a.providerRef || undefined, createdAt: str(a.createdAt), updatedAt: str(a.updatedAt),
  };
}

export function toPaymentEvent(a: J, i: number): PaymentEvent {
  const d = a.detail && typeof a.detail === "object" ? Object.entries(a.detail).map(([k, v]) => `${k} ${v}`).join(", ") : str(a.detail);
  return { id: a.providerEventId || `pe-${i}`, at: str(a.at), kind: str(a.type), detail: [a.actor, d].filter(Boolean).join(": ") };
}

export function toPayment(a: J, events: J[] = [], refunds: J[] = []): Payment {
  return {
    id: a.id, provider: str(a.provider), connectionId: str(a.connectionId), orderRef: str(a.orderRef), runId: a.runId || undefined, amountMinor: num(a.amount?.minor), currency: str(a.amount?.currency), state: a.state,
    reviewReason: a.reviewReason || undefined, paidMinor: a.paid ? num(a.paid.minor) : undefined, paidAt: a.paidAt || undefined, refundedMinor: num(a.refundedMinor), providerRef: a.providerRef || undefined,
    providerTxn: a.providerTxn || undefined, expiresAt: a.expiresAt || undefined, createdAt: str(a.createdAt), updatedAt: str(a.updatedAt), env: (a.env ?? "production") as Env,
    events: events.map(toPaymentEvent), refunds: refunds.map(toRefund),
  };
}

export function toKbRun(r: J): KbRun {
  return {
    id: r.id, startedAt: str(r.startedAt), durationSec: num(r.durationSec), trigger: r.trigger, state: r.state, added: num(r.added), updated: num(r.updated), removed: num(r.removed),
    skipped: num(r.skipped), failed: num(r.failed), tokens: num(r.tokens), notes: arr<string>(r.notes),
  };
}

export function toKnowledge(a: J): KnowledgeBase {
  const stats = a.stats ?? {};
  return {
    id: a.id, name: a.name, description: str(a.description), env: a.env, owner: str(a.owner), status: a.status, createdAt: str(a.createdAt),
    sources: arr(a.sources).map((s) => ({ id: s.id, name: s.name, kind: s.kind, connectionId: s.connectionId || undefined, path: s.path || undefined, include: s.include || undefined, documents: num(s.documents), lastSyncAt: s.lastSyncAt || undefined, status: s.status, error: s.error || undefined })),
    processing: a.processing ?? { splitOn: "structure", chunkTokens: 512, overlap: 64, maskPii: true }, embedding: a.embedding ?? { model: "", dimension: 0 }, index: a.index ?? { connectionId: "", collection: "", metric: "cosine" },
    schedule: a.schedule ?? "manual", access: { projects: arr<string>(a.access?.projects), aclAware: !!a.access?.aclAware, requireCitations: a.access?.requireCitations !== false, minScore: num(a.access?.minScore), topK: num(a.access?.topK, 5) },
    stats: { documents: num(stats.documents), chunks: num(stats.chunks), tokens: num(stats.tokens), sizeMb: num(stats.sizeMb), lastSyncAt: stats.lastSyncAt || undefined, staleDocuments: num(stats.staleDocuments) },
    runs: arr(a.runs).map(toKbRun), chunks: [],
    evalQuestions: arr(a.evalQuestions).map((q) => ({ id: q.id, question: q.question, expectedSource: q.expectedSource || "none" })),
    evalRuns: arr(a.evalRuns).map((e) => ({ id: e.id, at: str(e.at), by: str(e.by), questions: num(e.questions), recallAt5: num(e.recallAt5), mrr: num(e.mrr), noAnswerAccuracy: num(e.noAnswerAccuracy), failures: arr(e.failures) })),
    demo: false,
  };
}
