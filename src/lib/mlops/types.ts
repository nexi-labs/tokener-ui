import type { LucideIcon } from "lucide-react";
import type { IconRef } from "@/components/studio/types";
import type { Contract } from "./contract";

export type Env = "development" | "staging" | "production";
export const ENVS: Env[] = ["development", "staging", "production"];
export const ENV_LABEL: Record<Env, string> = { development: "Development", staging: "Staging", production: "Production" };

/**
 * Delivery status of a connector. These labels describe the connector's *implementation*, not
 * how it looks in the demo:
 *  - available: real connector implemented, contract-tested and supported
 *  - beta: real connector implemented with a documented limited scope
 *  - planned: specified and in development, setup flow uses sample results
 *  - custom: customer-supplied through a generic contract (HTTP endpoint, OCI image, agent)
 */
export type IntegrationStatus = "available" | "beta" | "planned" | "custom";

export type Health = "healthy" | "attention" | "failed" | "progressing" | "unknown" | "offline";

export type AuthMode =
  | "oidc"
  | "workload-identity"
  | "role-assumption"
  | "service-account"
  | "k8s-token"
  | "mtls"
  | "api-token"
  | "basic"
  | "secret-manager"
  | "none";

export const AUTH_LABEL: Record<AuthMode, string> = {
  oidc: "OIDC / OAuth",
  "workload-identity": "Workload identity",
  "role-assumption": "Role assumption",
  "service-account": "Service account key",
  "k8s-token": "Kubernetes service-account token",
  mtls: "mTLS client certificate",
  "api-token": "API token / key",
  basic: "Username and password",
  "secret-manager": "Secret-manager reference",
  none: "No authentication",
};

export type Family =
  | "serving"
  | "lifecycle"
  | "cloud-ml"
  | "infrastructure"
  | "registry"
  | "relational"
  | "object-store"
  | "streaming"
  | "vector"
  | "feature-store"
  | "agent"
  | "messaging"
  | "payments"
  | "mcp"
  | "observability";

export const FAMILY_LABEL: Record<Family, string> = {
  serving: "Model serving",
  lifecycle: "Model lifecycle",
  "cloud-ml": "Cloud ML platforms",
  infrastructure: "Targets and infrastructure",
  registry: "Container registries",
  relational: "Relational databases",
  "object-store": "Object storage and data lakes",
  streaming: "Streaming and queues",
  vector: "Vector stores",
  "feature-store": "Feature stores and data engines",
  agent: "Agent frameworks",
  messaging: "Email and calendar",
  payments: "Payments",
  mcp: "MCP servers",
  observability: "Observability",
};

export type CapabilityId =
  | "discover"
  | "validate"
  | "plan"
  | "deploy"
  | "scale"
  | "autoscale"
  | "canary"
  | "rollback"
  | "logs"
  | "metrics"
  | "gpu"
  | "build"
  | "registry-read"
  | "registry-write"
  | "read-data"
  | "write-data"
  | "traffic-split"
  | "scale-to-zero"
  | "call-tool"
  | "invoke-function"
  | "read-resource"
  | "get-prompt"
  | "read-mail"
  | "send-mail"
  | "read-calendar"
  | "write-calendar"
  | "collect-payment"
  | "payment-link"
  | "refund"
  | "send-sms"
  | "post-message";

export const CAPABILITY_LABEL: Record<CapabilityId, string> = {
  discover: "Discovery",
  validate: "Validate",
  plan: "Plan / dry run",
  deploy: "Deploy",
  scale: "Manual scaling",
  autoscale: "Autoscaling",
  canary: "Canary rollout",
  rollback: "Rollback",
  logs: "Logs",
  metrics: "Metrics",
  gpu: "GPU scheduling",
  build: "Image build",
  "registry-read": "Read registry",
  "registry-write": "Write registry",
  "read-data": "Read data",
  "write-data": "Write data",
  "traffic-split": "Traffic split",
  "scale-to-zero": "Scale to zero",
  "read-mail": "Read mail",
  "send-mail": "Send mail",
  "read-calendar": "Read calendar",
  "write-calendar": "Write calendar",
  "call-tool": "Call tools",
  "invoke-function": "Invoke functions",
  "read-resource": "Read resources",
  "get-prompt": "Use prompts",
  "collect-payment": "Collect payments",
  "payment-link": "Hosted payment link",
  refund: "Refunds",
  "send-sms": "Send SMS",
  "post-message": "Post messages",
};

export type CapabilitySupport = { id: CapabilityId; level: "full" | "partial" | "none"; note?: string };

export type FieldDef = {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "toggle" | "textarea";
  placeholder?: string;
  options?: string[];
  default?: string | number | boolean;
  help?: string;
  required?: boolean;
  /** Show the field only when another field (or "auth", the chosen authentication mode) has one of these values. */
  showWhen?: { key: string; in: string[] };
  /** Group heading shown above the first field of a group. */
  group?: string;
};

export type IntegrationDef = {
  id: string;
  name: string;
  vendor: string;
  family: Family;
  icon: IconRef;
  status: IntegrationStatus;
  /** Delivery wave from the phased plan; shown next to Planned so nobody mistakes it for shipped. */
  wave?: 1 | 2 | 3;
  blurb: string;
  /** What we target. Always confirmed at connect time against the live system, never assumed. */
  versionTarget: string;
  auth: AuthMode[];
  prerequisites: string[];
  capabilities: CapabilitySupport[];
  limitations: string[];
  /** Least-privilege permission descriptions shown in the wizard. */
  permissions: { read: string[]; write: string[] };
  /** Obligations the customer must meet before going live. Shown in the wizard, the console and the public catalogue. */
  compliance?: string[];
  fields: FieldDef[];
  docs: { label: string; url: string }[];
  /** Whether the target is reachable only through an agent or private link in typical enterprise networks. */
  privateConnectivity?: boolean;
  /** How the platform talks to the system, as data. Present for contract connectors, which platform admins publish without a backend release. */
  contract?: Contract;
  /** Set on connectors published from the console. Built-in entries do not have it. */
  published?: PublishedMeta;
};

export type PublishedMeta = {
  revision: number;
  publishedAt: string;
  publishedBy: string;
  /** contract: the generic runtime executes the contract. remote: an operator-registered service speaks the connector protocol. */
  hosting: "contract" | "remote";
  remoteUrl?: string;
  notes?: string;
};

export type Connection = {
  id: string;
  name: string;
  integrationId: string;
  env: Env;
  owner: string;
  scope: string;
  auth: AuthMode;
  /** Secret references only. Plaintext is never stored, displayed or exported. */
  secretRef?: string;
  endpoint: string;
  tlsVerify: boolean;
  permissions: "read-only" | "read-write";
  health: Health;
  healthDetail: string;
  lastVerifiedAt: string;
  credentialRotatedAt: string;
  credentialExpiresAt?: string;
  capabilities: CapabilityId[];
  version?: string;
  /** Non-secret settings from the connection form. Secrets are only ever references. */
  settings?: Record<string, string | number | boolean>;
  demo: boolean;
};

export type RoleId = "viewer" | "developer" | "approver" | "admin";
export const ROLE_LABEL: Record<RoleId, string> = { viewer: "Viewer", developer: "Developer", approver: "Approver", admin: "Admin" };

export type ModelVersion = {
  version: number;
  stage: "none" | "staging" | "production" | "archived";
  createdAt: string;
  createdBy: string;
  framework: string;
  format: string;
  sizeMb: number;
  checksum: string;
  provenance: { git: string; repo: string; trainingRun: string; datasetHash: string; builder: string; signed: boolean };
  metrics: Record<string, number>;
  approval: { state: "pending" | "approved" | "rejected" | "not-required"; by?: string; at?: string; note?: string };
  license: string;
  notes: string;
  /** Where the version came from: an upload, a platform library import, or a pipeline run. */
  source?: string;
  /** The dataset this version was trained on and its quality when prepared. Read by the data quality gate. */
  trainingData?: import("./qualityGate").TrainingData;
  /** What the content scan found when the file was uploaded. The server scans every upload, the console only shows the verdict. */
  scan?: ModelScan;
};

export type ScanFinding = { level: "info" | "warn" | "block"; message: string };
export type ModelScan = { verdict: "clean" | "warnings" | "blocked"; summary: string; findings: ScanFinding[] };
export type ModelFileFormat = "safetensors" | "gguf" | "onnx" | "pytorch";
export const MODEL_FORMATS: { id: ModelFileFormat; label: string; scanned: boolean; hint: string }[] = [
  { id: "safetensors", label: "safetensors", scanned: false, hint: "Tensors only. Cannot run code when loaded." },
  { id: "gguf", label: "GGUF", scanned: false, hint: "Quantised weights for llama.cpp style runtimes." },
  { id: "onnx", label: "ONNX", scanned: false, hint: "Portable graph. Checked for external data references." },
  { id: "pytorch", label: "PyTorch checkpoint", scanned: true, hint: "Pickle based. Read for code execution before it is accepted." },
];

/** A model the platform operators publish for every organization. Importing a version points at the shared weights. */
export type LibraryModel = {
  id: string;
  name: string;
  description: string;
  task: string;
  publisher: string;
  versions: (ModelVersion & { withdrawn?: boolean; imports: number })[];
};

export type PaymentState = "created" | "link-sent" | "pending" | "paid" | "failed" | "expired" | "review" | "blocked" | "refund-pending" | "refunded" | "refund-failed";
export type ReviewReason = "underpaid" | "overpaid" | "late" | "duplicate" | "sanctions-match" | "over-threshold" | "mismatch";
export const PAYMENT_STATE_LABEL: Record<PaymentState, string> = {
  created: "Created", "link-sent": "Link sent", pending: "Pending", paid: "Paid", failed: "Failed", expired: "Expired", review: "Needs review", blocked: "Blocked",
  "refund-pending": "Refund pending", refunded: "Refunded", "refund-failed": "Refund failed",
};
export const REVIEW_REASON_LABEL: Record<ReviewReason, string> = {
  underpaid: "Customer paid less than the order", overpaid: "Customer paid more than the order", late: "Payment arrived after the link expired", duplicate: "A second payment arrived for the same order",
  "sanctions-match": "Payer matched the screening list", "over-threshold": "Amount is above the review threshold", mismatch: "Provider facts do not match the order",
};
export type Refund = {
  id: string; paymentId: string; amountMinor: number; reason: string; state: "awaiting-approval" | "approved" | "completed" | "failed" | "rejected";
  requestedBy: string; approvedBy?: string; providerRef?: string; createdAt: string; updatedAt: string;
};
export type PaymentEvent = { id: string; at: string; kind: string; detail: string };
export type Payment = {
  id: string; provider: string; connectionId: string; orderRef: string; runId?: string;
  amountMinor: number; currency: string; state: PaymentState; reviewReason?: ReviewReason;
  paidMinor?: number; paidAt?: string; refundedMinor: number; providerRef?: string; providerTxn?: string;
  expiresAt?: string; createdAt: string; updatedAt: string; env: Env;
  events: PaymentEvent[]; refunds: Refund[];
};

export type ModelArtifact = {
  id: string;
  name: string;
  description: string;
  task: string;
  owner: string;
  versions: ModelVersion[];
  demo: boolean;
};

export type Deployment = {
  id: string;
  name: string;
  modelId: string;
  version: number;
  env: Env;
  connectionId: string;
  runtime: string;
  health: Health;
  healthDetail: string;
  endpoint: string;
  replicas: { desired: number; ready: number; min: number; max: number };
  resources: { cpu: string; memory: string; gpu: string };
  traffic: { stable: number; canary: number; canaryVersion?: number };
  rollout: { state: "idle" | "in-progress" | "paused" | "completed" | "failed"; strategy: string; startedAt?: string };
  previousVersion?: number;
  rollbackAvailable: boolean;
  pipelineId?: string;
  /** Set for deployments created from the deploy wizard: the engine and GPU the replicas run on. */
  accelerator?: { engine: string; gpu: string; count: number; cuda: string; driver?: string };
  /** Where the deployment is exposed beyond its own endpoint. */
  exposure?: { providerId?: string; mcpServerId?: string; mcpTool?: string };
  createdAt: string;
  updatedAt: string;
  demo: boolean;
};

export type RunStatus = "succeeded" | "running" | "failed" | "validation-failed" | "cancelled" | "rolled-back" | "waiting-approval" | "queued";

export type NodeRunStatus = "succeeded" | "running" | "failed" | "skipped" | "pending" | "waiting";

export type LogLine = { t: string; level: "info" | "warn" | "error" | "debug"; msg: string };

export type NodeRun = {
  nodeId: string;
  status: NodeRunStatus;
  startedAt?: string;
  durationMs?: number;
  attempt: number;
  maxAttempts: number;
  logs: LogLine[];
  artifacts: { name: string; kind: string; ref: string; digest?: string }[];
};

export type PipelineRun = {
  id: string;
  pipelineId: string;
  pipelineName: string;
  pipelineVersion: number;
  env: Env;
  status: RunStatus;
  trigger: string;
  startedBy: string;
  startedAt: string;
  durationMs?: number;
  idempotencyKey: string;
  specDigest: string;
  nodes: NodeRun[];
  events: { t: string; kind: string; msg: string }[];
  /** Immutable snapshot of the spec the run executed. Secret values never appear, only references. */
  snapshot: unknown;
  demo: boolean;
};

export type BuildAgent = {
  id: string;
  name: string;
  mode: "linux-systemd" | "kubernetes" | "docker";
  status: "online" | "degraded" | "offline" | "draining";
  version: string;
  os: string;
  arch: string;
  labels: Record<string, string>;
  capabilities: string[];
  concurrency: { max: number; running: number };
  lastHeartbeatAt: string;
  registeredAt: string;
  owner: string;
  env: Env;
  egressAllowlist: string[];
  registries: string[];
  tokenExpiresAt: string;
  gpu?: string;
  demo: boolean;
};

export type AuditEvent = {
  id: string;
  at: string;
  actor: string;
  action: string;
  resource: string;
  detail: string;
  env?: Env;
  demo: boolean;
};

export type Alert = {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  resource: string;
  since: string;
  detail: string;
  state: "firing" | "acknowledged" | "resolved";
};

export type ToneName = "healthy" | "degraded" | "down" | "info" | "neutral";

export type IconComponent = LucideIcon;

// ------------------------------------------------------------------ RAG indexes (retrieval)

export type KbSource = {
  id: string; name: string; kind: "upload" | "object-store";
  /** Object storage sources read through a connection. Uploads are stored by the platform. */
  connectionId?: string; path?: string; include?: string;
  documents: number; lastSyncAt?: string; status: "synced" | "syncing" | "failed" | "pending"; error?: string;
};
export type KbRun = {
  id: string; startedAt: string; durationSec: number; trigger: "manual" | "schedule" | "upload" | "config-change";
  state: "succeeded" | "partial" | "failed" | "running";
  added: number; updated: number; removed: number; skipped: number; failed: number; tokens: number; notes: string[];
};
export type KbChunk = { id: string; source: string; page?: number; heading?: string; text: string; updatedAt: string };
export type KbEvalQuestion = { id: string; question: string; expectedSource: string | "none" };
export type KbEvalRun = {
  id: string; at: string; by: string; questions: number; recallAt5: number; mrr: number; noAnswerAccuracy: number;
  failures: { question: string; expected: string; got: string }[];
};
export type KbStatus = "empty" | "ready" | "indexing" | "degraded";
export type KnowledgeBase = {
  id: string; name: string; description: string; env: Env; owner: string; status: KbStatus; createdAt: string;
  sources: KbSource[];
  processing: { splitOn: "structure" | "fixed"; chunkTokens: number; overlap: number; maskPii: boolean };
  embedding: { model: string; dimension: number };
  index: { connectionId: string; collection: string; metric: "cosine" | "dot" | "l2" };
  schedule: "manual" | "hourly" | "daily" | "on-change";
  access: { projects: string[]; aclAware: boolean; requireCitations: boolean; minScore: number; topK: number };
  stats: { documents: number; chunks: number; tokens: number; sizeMb: number; lastSyncAt?: string; staleDocuments: number };
  runs: KbRun[]; chunks: KbChunk[]; evalQuestions: KbEvalQuestion[]; evalRuns: KbEvalRun[];
  demo: boolean;
};

/** Run versions: 0 is a simulation of the working draft, anything else is a published version. */
export const versionLabel = (v: number) => (v === 0 ? "draft" : `v${v}`);
