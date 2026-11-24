/** Shared types for Refinery, the data preparation product (docs/46). Everything here is shown on sample data until the backend exists. */

export type ColType = "string" | "integer" | "decimal" | "boolean" | "date" | "timestamp";
export type ColRole = "feature" | "label" | "identifier" | "ignore";
export type Cell = string | number | boolean | null;
export type Row = Record<string, Cell>;

export type Bucket = { label: string; count: number };
export type ColumnProfile = {
  name: string;
  type: ColType;
  role: ColRole;
  nullCount: number;
  nullPct: number;
  distinct: number;
  /** Rows the statistics were computed on. */
  n: number;
  min?: number | string;
  max?: number | string;
  mean?: number;
  std?: number;
  p25?: number;
  p50?: number;
  p75?: number;
  minLen?: number;
  maxLen?: number;
  top: { value: string; count: number }[];
  histogram: Bucket[];
  pattern: "email" | "phone" | "uuid" | "url" | "date" | null;
  pii: boolean;
  /** Share of values that have leading or trailing spaces or inconsistent letter case. A cue to clean, not an error. */
  untidyPct: number;
};
export type QualityParts = { completeness: number; uniqueness: number; consistency: number; validity: number };
export type DatasetProfile = {
  /** Rows in the whole dataset (declared by the source) and rows the figures below were computed on. */
  totalRows: number;
  sampled: number;
  columns: ColumnProfile[];
  duplicateRows: number;
  /** The first identifier column, when its values repeat: rows that share an identifier with an earlier row. */
  keyDuplicates?: { column: string; rows: number; pct: number };
  completeness: number;
  quality: number;
  parts: QualityParts;
};

/** A unified dataset: columns picked from several tables, related by keys, cleaned and named once. */
export type ModelCleaning = "none" | "trim" | "lower" | "upper" | "mask";
export type ModelSource = { alias: string; datasetId: string };
export type ModelJoin = { id: string; leftAlias: string; leftColumn: string; rightAlias: string; rightColumn: string; type: "inner" | "left" | "full"; normalise: boolean };
export type ModelColumn = { id: string; alias: string; column: string; as: string; type: ColType; clean: ModelCleaning };
export type ModelSpec = { sources: ModelSource[]; joins: ModelJoin[]; columns: ModelColumn[]; dropDuplicates: boolean };

export type DatasetSource =
  | { kind: "model"; spec: ModelSpec; sql: string }
  | { kind: "upload"; fileName: string }
  | { kind: "connection"; connectionId: string; location: string }
  | { kind: "query"; connectionId: string; sql: string }
  | { kind: "documents"; folder: string; files: number; types: Record<string, number> };
export type FileFormat = "csv" | "tsv" | "json" | "jsonl" | "parquet" | "xlsx" | "table" | "topic" | "documents" | "delta" | "iceberg";

export type Dataset = {
  id: string;
  name: string;
  description: string;
  source: DatasetSource;
  format: FileFormat;
  version: number;
  updatedAt: string;
  owner: string;
  totalRows: number;
  sizeBytes: number;
  /** Up to a few hundred rows kept in the browser for the profile and the recipe preview. */
  sample: Row[];
  columns: { name: string; type: ColType; role: ColRole }[];
  profile: DatasetProfile;
};

export type ConnectionState = "connected" | "failed" | "untested";
export type Connection = {
  id: string;
  name: string;
  connector: string;
  auth: string;
  /** Non secret settings (host, bucket, region, brokers...). */
  settings: Record<string, string>;
  /** Names of settings that hold a secret reference. The values are never kept. */
  secretRefs: Record<string, string>;
  pool: string;
  state: ConnectionState;
  lastTested?: string;
  createdAt: string;
  createdBy: string;
};

export type Hosting = "managed" | "kubernetes" | "vm" | "docker";
export type Engine = "native" | "single" | "spark" | "flink";
/** A Flink cluster the customer already runs. The platform never opens a connection into it: a runner next to the cluster submits jobs and reads their state. */
export type FlinkLink = { location: "cloud" | "onprem" | "local"; deploy: "session" | "kubernetes-operator" | "yarn"; restUrl: string; auth: "none" | "bearer" | "mtls"; secretRefs: Record<string, string>; version?: string; slots?: number };
export type PoolStatus = "online" | "scaling" | "degraded" | "offline" | "pending";
export type RunnerPool = {
  id: string;
  name: string;
  hosting: Hosting;
  engine: Engine;
  /** The native engine is part of the platform. It cannot be removed or resized, only limited. */
  builtIn?: boolean;
  flink?: FlinkLink;
  region: string;
  workersMin: number;
  workersMax: number;
  workers: number;
  coresPerWorker: number;
  memGbPerWorker: number;
  concurrency: number;
  running: number;
  queued: number;
  cpuPct: number;
  memPct: number;
  status: PoolStatus;
  version: string;
  lastSeen: string;
  network: string;
};

/** Options for an open table format (Delta Lake or Apache Iceberg) written to object storage. See lake.ts. */
export type LakeOptions = { mode: "append" | "overwrite" | "merge"; partitionBy: string[]; mergeKeys: string[]; catalog?: "rest" | "glue" | "hive" | "hadoop" };
export type OutputSink = { name: string; kind: "dataset" | "files" | "stream" | "table"; target: string; format: FileFormat; lake?: LakeOptions };
export type Step = { id: string; op: string; params: Record<string, unknown>; note?: string };
export type Recipe = {
  id: string;
  name: string;
  description: string;
  inputDatasetId: string;
  steps: Step[];
  outputs: OutputSink[];
  pool: string;
  parallelism: number;
  partitionTargetMb: number;
  /** Process only data that arrived since the last successful run, using the input's change marker. */
  incremental?: boolean;
  version: number;
  updatedAt: string;
  updatedBy: string;
  lastRunId?: string;
};

export type Cadence = { frequency: "hourly" | "daily" | "weekly"; minute: number; at: string; weekday: number; timezone: string };
/** A recipe's schedule. Starting runs is the server's job, so it exists only in a signed-in workspace. */
/** Something that needs a person, raised by the platform. One alert per condition and resource; a repeat is counted. */
export type RefineryAlert = { id: string; severity: "warning" | "critical" | "info"; kind: string; title: string; resource: string; resourceName: string; raisedAt: string; lastAt: string; count: number; detail: string; state: "firing" | "acknowledged" | "resolved"; acknowledgedBy: string; resolvedAt: string };
export type RecipeSchedule = { recipeId: string; enabled: boolean; cadence: Cadence; nextRunAt: string; lastRunAt: string; lastRunId: string; lastOutcome: "" | "started" | "skipped" | "failed"; lastMessage: string; failures: number; updatedBy: string; updatedAt: string };

export type DatasetVersionEntry = { version: number; file: string; format: string; rows: number; bytes: number; createdAt: string; createdBy: string; note: string; current: boolean };

export type AuditEntry = { seq: number; at: string; actor: string; action: string; targetType: string; targetId: string; detail: Record<string, unknown> };
export type AuditFilter = { q?: string; actor?: string; action?: string; targetType?: string; from?: string; to?: string };

export type RunStatus = "queued" | "planning" | "running" | "succeeded" | "failed" | "cancelled";
export type Partition = { id: number; worker: string; status: "pending" | "running" | "done" | "retry" | "failed"; pct: number; rowsIn: number };
export type StageInfo = { name: string; kind: "convert" | "read" | "transform" | "shuffle" | "ai" | "write"; status: "pending" | "running" | "done" | "failed"; ms: number };
export type LogLine = { t: string; level: "info" | "warn" | "error"; src: string; msg: string };
/** What one recipe step did in a run, scaled from the preview sample to the whole input. */
export type StepStat = { id: string; label: string; detail: string; status: "pending" | "running" | "done"; rowsIn: number; rowsOut: number; changed: number; rejected: number; remote: boolean };
export type RunRecord = {
  id: string;
  recipeId: string;
  recipeName: string;
  recipeVersion: number;
  datasetName: string;
  snapshot: string;
  pool: string;
  parallelism: number;
  status: RunStatus;
  trigger: "manual" | "schedule" | "api";
  startedBy: string;
  startedAt: string;
  durationMs: number;
  rowsIn: number;
  rowsOut: number;
  rowsRejected: number;
  bytesIn: number;
  aiCalls: number;
  aiCostUsd: number;
  partitions: Partition[];
  stages: StageInfo[];
  rejects: { reason: string; count: number; step: string }[];
  log: LogLine[];
  steps: StepStat[];
  error?: string;
  pct: number;
  /** What the run wrote, one line per output, as the engine reported it. Present for runs started in a signed-in workspace. */
  outputs?: string[];
};

/** Messaging means any streaming or queueing system (Kafka, AutoMQ, RabbitMQ, Pulsar, NATS and others). */
export type StreamKind = "messaging" | "cdc";
export type StreamStatus = "running" | "paused" | "failed" | "starting" | "snapshotting";
export type StreamJob = {
  id: string;
  name: string;
  kind: StreamKind;
  recipeName: string;
  source: string;
  sink: string;
  pool: string;
  status: StreamStatus;
  inRate: number;
  outRate: number;
  lag: number;
  errPct: number;
  latencyMs: number;
  checkpointAgeS: number;
  deadLetters: number;
  delivery: "at-least-once" | "exactly-once";
  /** How changes reach the destination. Append keeps every change as a row, upsert keeps the latest row per key, mirror also removes rows that were deleted at the source. */
  mode?: "append" | "upsert" | "mirror";
  primaryKey?: string;
  destKind?: "files" | "table" | "stream";
  /** The system a messaging stream reads from, as named in its connection. */
  system?: string;
  /** Where reading begins when the source can be replayed. */
  startFrom?: "earliest" | "latest";
  snapshot?: boolean;
  flushSeconds?: number;
  schemaEvolution?: "add-columns" | "stop";
  series: { t: string; inRate: number; outRate: number; lag: number }[];
};
