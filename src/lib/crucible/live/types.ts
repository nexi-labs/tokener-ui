/** What the Crucible API returns. These are the server's own shapes: the live screens show them as they are and do not dress them up as the sample types. */
export type StoreKind = "s3" | "minio" | "gcs" | "azure" | "r2";
export type StoreAuth = "iam-role" | "access-key" | "workload-identity" | "service-account";
export type KeyScope = "log" | "read" | "register";
export type RunStatus = "queued" | "running" | "finished" | "failed" | "killed";
export type MachineKind = "laptop" | "workstation" | "notebook" | "ci" | "cluster";

export type Me = { orgId: string; userId: string; role: "viewer" | "developer" | "approver" | "admin"; permissions: string[] };
export type Project = { id: string; name: string; description: string; owner: string; department: string; storeId: string; repoUrl: string; branch: string; path: string; python: string; envTool: string; lockfile: string; entry: string; createdAt: string; createdBy: string };
export type ProjectRow = { project: Project; experiments: number; activeKeys: number; machines: number };
export type Experiment = { id: string; projectId: string; name: string; description: string; task: string; owner: string; department: string; tags: string[]; createdAt: string; createdBy: string };
export type Store = { id: string; name: string; kind: StoreKind; bucket: string; prefix: string; region: string; endpoint?: string; auth: StoreAuth; secretRef?: string; roleArn?: string; encryption: string; versioning: boolean; status: "connected" | "untested" | "failing"; lastTestedAt?: string; testNote?: string; isDefault: boolean; managed: boolean; coldAfterDays: number; expireAfterDays?: number; createdAt: string; createdBy: string };
export type StoreCheck = { name: string; ok: boolean; detail: string };
export type Key = { id: string; projectId: string; name: string; prefix: string; secretRef: string; scopes: KeyScope[]; status: string; createdBy: string; createdAt: string; expiresAt: string; lastUsedAt?: string; revokedAt?: string };
export type IssuedKey = { key: Key; token: string };
export type Machine = { id: string; projectId: string; keyId: string; name: string; kind: MachineKind; user: string; os: string; python: string; sdk: string; runsLogged: number; ip: string; lastSeenAt?: string; createdAt: string; createdBy: string };
export type MachineRow = { machine: Machine; state: "pending" | "online" | "idle" | "revoked" };
export type DatasetColumn = { name: string; type: string; nullPct: number; pii: string; role: string };
export type DatasetVersion = { version: number; rows: number; quality: number; createdAt: string; refineryRun: string; piiClean: boolean; schemaChanged: boolean; note: string; splits?: { train: number; validation: number; test: number } };
export type CleanedDataset = { id: string; name: string; description: string; recipe: string; recipeId: string; owner: string; format: string; location: string; columns: DatasetColumn[]; versions: DatasetVersion[] };
export type DatasetEntry = { dataset: CleanedDataset; exposed?: { id: string; name: string; exposedAt: string; exposedBy: string }; problems: string[] };
export type MetricSummary = { last: number; lastStep: number; min: number; max: number; count: number };
export type Run = {
  id: string; experimentId: string; projectId: string; name: string; status: RunStatus; startedAt: string; endedAt?: string; owner: string;
  params: Record<string, string>; tags: Record<string, string>; metrics: Record<string, MetricSummary>;
  dataset?: { name: string; version: number }; model?: { name: string; path: string; version?: number };
  artifacts: { path: string; uri: string; sizeBytes: number }[]; machineId?: string; lastHeartbeat?: string; gpuHours: number; costUsd: number; failure?: string;
};
export type MetricSeries = { key: string; total: number; returned: number; points: { step: number; value: number; timestampMillis: number }[] };
export type Comparison = { runs: Run[]; paramsThatDiffer: string[]; metricKeys: string[] };
export type LineageLink = { runId: string; runName: string; status: RunStatus; datasetName?: string; datasetVersion?: number; modelName?: string; modelVersion?: number; startedAt: string };
export type AuditEntry = { seq: number; at: string; actor: string; action: string; targetType: string; targetId: string; detail: Record<string, unknown> };
export type AuditPage = { content: AuditEntry[]; page: number; size: number; totalElements: number; totalPages: number };
export type Result<T = {}> = ({ ok: true } & T) | { ok: false; error: string; code?: string };

export type NewProject = { name: string; description: string; department: string; owner?: string; storeId: string; repoUrl: string; branch: string; path: string; python: string; envTool: string; lockfile: string; entry: string };
export type NewExperiment = { name: string; description: string; task: string; owner: string; department: string; tags: string[] };
export type NewStore = { name: string; kind: StoreKind; bucket: string; prefix: string; region: string; endpoint: string; auth: StoreAuth; secretRef: string; roleArn: string; encryption: string; versioning: boolean; coldAfterDays: number; expireAfterDays: number | null };
