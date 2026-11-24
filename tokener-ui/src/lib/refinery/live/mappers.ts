/**
 * Maps Refinery control plane responses to the shapes the console renders. The API and the console agree on most fields. What differs is written
 * down here, one function per resource. Nothing in this file calls the network.
 */
import type { NativeLimits } from "../engines";
import { NATIVE_CEILING, NATIVE_DEFAULTS } from "../engines";
import type { ColRole, Connection, ConnectionState, Dataset, Engine, Hosting, PoolStatus, Recipe, RunRecord, RunnerPool, StreamJob, RecipeSchedule, DatasetVersionEntry, AuditEntry, RefineryAlert } from "../types";

type J = Record<string, any>;
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : v == null ? d : String(v));
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);

export function toPool(a: J): RunnerPool {
  return {
    id: a.id, name: a.name, hosting: a.hosting as Hosting, engine: a.engine as Engine, builtIn: !!a.builtIn, flink: a.flink || undefined, region: str(a.region),
    workersMin: num(a.workersMin), workersMax: num(a.workersMax), workers: num(a.workers), coresPerWorker: num(a.coresPerWorker), memGbPerWorker: num(a.memGbPerWorker),
    concurrency: num(a.concurrency), running: num(a.running), queued: num(a.queued), cpuPct: num(a.cpuPct), memPct: num(a.memPct), status: (a.status ?? "pending") as PoolStatus,
    version: str(a.version), lastSeen: str(a.lastSeen), network: str(a.network),
  };
}

export type LimitsView = { limits: NativeLimits; ceiling: NativeLimits; defaults: NativeLimits; clamped: string[]; runningRuns: number; runningStreams: number };
export function toLimits(a: J): LimitsView {
  const pick = (o: J | undefined, d: NativeLimits): NativeLimits => ({
    threads: num(o?.threads, d.threads), concurrentRuns: num(o?.concurrentRuns, d.concurrentRuns), memoryMb: num(o?.memoryMb, d.memoryMb), maxInputGb: num(o?.maxInputGb, d.maxInputGb),
    maxRows: num(o?.maxRows, d.maxRows), maxRunMinutes: num(o?.maxRunMinutes, d.maxRunMinutes), streams: num(o?.streams, d.streams), streamRecordsPerSec: num(o?.streamRecordsPerSec, d.streamRecordsPerSec),
  });
  return {
    limits: pick(a.limits, NATIVE_DEFAULTS), ceiling: pick(a.ceiling, NATIVE_CEILING), defaults: pick(a.defaults, NATIVE_DEFAULTS),
    clamped: Array.isArray(a.clamped) ? a.clamped.map(String) : [], runningRuns: num(a.runningRuns), runningStreams: num(a.runningStreams),
  };
}

/**
 * The control plane refers to a pool by its id. The console refers to it by its name, which is what a person chose and reads. These two functions
 * translate in both directions, using the pools the console has loaded. An id that is not known stays as it is, so nothing is silently lost.
 */
export const poolNameOf = (pools: RunnerPool[], id: string): string => pools.find((p) => p.id === id)?.name ?? id;
export const poolIdOf = (pools: RunnerPool[], name: string): string => pools.find((p) => p.name === name)?.id ?? name;

export function toConnection(a: J, pools: RunnerPool[]): Connection {
  return {
    id: a.id, name: a.name, connector: a.connector, auth: a.auth, settings: (a.settings ?? {}) as Record<string, string>, secretRefs: (a.secretRefs ?? {}) as Record<string, string>,
    pool: poolNameOf(pools, str(a.pool)), state: (a.state ?? "untested") as ConnectionState, lastTested: a.lastTested || undefined, createdAt: str(a.createdAt), createdBy: str(a.createdBy),
  };
}

/** A dataset as the API returns it. The list leaves the sample out. The one-dataset read includes it, which is what the recipe editor previews on. */
export function toDataset(a: J): Dataset {
  const src = (a.source ?? {}) as J;
  const source = Object.fromEntries(Object.entries(src).filter(([, v]) => v !== null && v !== undefined)) as unknown as Dataset["source"];
  return {
    id: a.id, name: a.name, description: str(a.description), source, format: a.format, version: num(a.version, 1), updatedAt: str(a.updatedAt), owner: str(a.owner),
    totalRows: num(a.totalRows), sizeBytes: num(a.sizeBytes), sample: Array.isArray(a.sample) ? a.sample : [],
    columns: (a.columns ?? []).map((c: J) => ({ name: c.name, type: c.type, role: c.role as ColRole })), profile: a.profile,
  };
}

export function toRecipe(a: J, pools: RunnerPool[]): Recipe {
  return {
    id: a.id, name: a.name, description: str(a.description), inputDatasetId: str(a.inputDatasetId), steps: Array.isArray(a.steps) ? a.steps : [],
    outputs: (a.outputs ?? []).map((o: J) => ({ name: str(o.name), kind: o.kind, target: str(o.target), format: o.format })),
    pool: poolNameOf(pools, str(a.pool)), parallelism: num(a.parallelism, 1), partitionTargetMb: num(a.partitionTargetMb, 64), incremental: !!a.incremental,
    version: num(a.version, 1), updatedAt: str(a.updatedAt), updatedBy: str(a.updatedBy), lastRunId: a.lastRunId || undefined,
  };
}
export function toAudit(e: J): AuditEntry {
  return { seq: num(e.seq, 0), at: str(e.at), actor: str(e.actor), action: str(e.action), targetType: str(e.targetType), targetId: str(e.targetId), detail: (e.detail ?? {}) as Record<string, unknown> };
}
export function toVersion(v: J): DatasetVersionEntry {
  return { version: num(v.version, 0), file: str(v.file), format: str(v.format), rows: num(v.rows, 0), bytes: num(v.bytes, 0), createdAt: str(v.createdAt), createdBy: str(v.createdBy), note: str(v.note), current: !!v.current };
}
export function toSchedule(a: J): RecipeSchedule {
  const c = a.cadence ?? {};
  return {
    recipeId: a.recipeId, enabled: !!a.enabled, cadence: { frequency: c.frequency ?? "daily", minute: num(c.minute, 0), at: str(c.at) || "00:00", weekday: num(c.weekday, 1), timezone: str(c.timezone) || "UTC" },
    nextRunAt: str(a.nextRunAt), lastRunAt: str(a.lastRunAt), lastRunId: str(a.lastRunId), lastOutcome: (str(a.lastOutcome) as RecipeSchedule["lastOutcome"]), lastMessage: str(a.lastMessage),
    failures: num(a.failures, 0), updatedBy: str(a.updatedBy), updatedAt: str(a.updatedAt),
  };
}
export function toAlert(a: J): RefineryAlert {
  const sev = str(a.severity);
  return {
    id: a.id, severity: sev === "critical" || sev === "info" ? sev : "warning", kind: str(a.kind), title: str(a.title), resource: str(a.resource), resourceName: str(a.resourceName),
    raisedAt: str(a.raisedAt), lastAt: str(a.lastAt), count: num(a.count, 1), detail: str(a.detail), state: a.state === "acknowledged" || a.state === "resolved" ? a.state : "firing",
    acknowledgedBy: str(a.acknowledgedBy), resolvedAt: str(a.resolvedAt),
  };
}
/** The body the API takes for a recipe. The pool goes by id. */
export function recipeBody(r: Recipe, pools: RunnerPool[]): J {
  return { name: r.name, description: r.description, inputDatasetId: r.inputDatasetId, steps: r.steps, outputs: r.outputs, pool: poolIdOf(pools, r.pool), parallelism: r.parallelism, partitionTargetMb: r.partitionTargetMb, incremental: !!r.incremental };
}

export function toRun(a: J, pools: RunnerPool[]): RunRecord {
  return {
    id: a.id, recipeId: str(a.recipeId), recipeName: str(a.recipeName), recipeVersion: num(a.recipeVersion, 1), datasetName: str(a.datasetName), snapshot: str(a.snapshot),
    pool: poolNameOf(pools, str(a.pool)), parallelism: num(a.parallelism, 1), status: a.status, trigger: a.trigger ?? "manual", startedBy: str(a.startedBy), startedAt: str(a.startedAt || a.createdAt),
    durationMs: num(a.durationMs), rowsIn: num(a.rowsIn), rowsOut: num(a.rowsOut), rowsRejected: num(a.rowsRejected), bytesIn: num(a.bytesIn), aiCalls: num(a.aiCalls), aiCostUsd: num(a.aiCostUsd),
    partitions: a.partitions ?? [], stages: a.stages ?? [], rejects: a.rejects ?? [], log: a.log ?? [], steps: a.steps ?? [], error: a.error || undefined, pct: num(a.pct), outputs: Array.isArray(a.outputs) ? a.outputs : undefined,
  };
}
export const isActiveRun = (s: string) => s === "queued" || s === "planning" || s === "running";

export function toStream(a: J, pools: RunnerPool[]): StreamJob {
  const x = Object.fromEntries(Object.entries(a).filter(([, v]) => v !== null && v !== undefined)) as unknown as StreamJob;
  return { ...x, series: Array.isArray(a.series) ? a.series : [], pool: poolNameOf(pools, str(a.pool)), inRate: num(a.inRate), outRate: num(a.outRate), lag: num(a.lag), errPct: num(a.errPct), latencyMs: num(a.latencyMs), checkpointAgeS: num(a.checkpointAgeS), deadLetters: num(a.deadLetters) };
}
