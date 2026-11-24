/**
 * Domain model for tokΣner Functions.
 *
 * Functions has no backend yet. Everything in this folder is a design preview: the shapes below are the contract the
 * backend will implement (see docs/35-functions-domain-model.md), and the data is generated locally. Nothing here
 * claims that code was deployed or executed anywhere.
 *
 * Money is held as integer micro-dollars (1 USD = 1,000,000) so that every total is an exact sum of its records.
 */
import type { Env } from "@/lib/mlops/types";

export type { Env };

// --------------------------------------------------------------------------------------------- reference data

export type Tenant = { id: string; name: string; region: string };
export type AppRef = { id: string; tenantId: string; name: string; owner: string };

export type ProviderKind = "hosted" | "cloud" | "self-hosted";
export type Provider = {
  id: string;
  name: string;
  kind: ProviderKind;
  /** Brand key for the icon helper (`b:<key>`). */
  brand: string;
  endpoint: string;
  /** Data leaves the organisation boundary. */
  external: boolean;
};
export type ModelDef = {
  id: string;
  providerId: string;
  name: string;
  /** Sample price per 1,000,000 tokens, in micro-dollars. Illustrative, not a quote. */
  inPerM: number;
  outPerM: number;
  contextK: number;
  capabilities: ("chat" | "vision" | "tools" | "embeddings" | "json")[];
};

export type Runtime = "python3.12" | "node22" | "java21" | "go1.23" | "container";
export const RUNTIMES: { id: Runtime; label: string; handler: string; defaultMemory: number; note: string }[] = [
  { id: "python3.12", label: "Python 3.12", handler: "main.handler", defaultMemory: 512, note: "Data work, scoring, light ML pre-processing." },
  { id: "node22", label: "Node.js 22", handler: "index.handler", defaultMemory: 256, note: "Integrations, webhooks, JSON shaping." },
  { id: "java21", label: "Java 21", handler: "io.example.Handler::handle", defaultMemory: 1024, note: "Typed domain logic, existing JVM libraries." },
  { id: "go1.23", label: "Go 1.23", handler: "main", defaultMemory: 256, note: "Low-latency, small binaries." },
  { id: "container", label: "Container image", handler: "entrypoint", defaultMemory: 1024, note: "Any runtime you package yourself, from a signed registry." },
];

export type DataClass = "public" | "internal" | "confidential" | "restricted";
export const DATA_CLASSES: DataClass[] = ["public", "internal", "confidential", "restricted"];

// --------------------------------------------------------------------------------------------- functions

export type FnStatus = "draft" | "deploying" | "active" | "failed" | "disabled";
export const FN_STATUS_LABEL: Record<FnStatus, string> = { draft: "Draft", deploying: "Deploying", active: "Active", failed: "Failed", disabled: "Disabled" };

/** Which transitions the lifecycle allows. The backend enforces the same table. */
export const FN_TRANSITIONS: Record<FnStatus, FnStatus[]> = {
  draft: ["deploying"],
  deploying: ["active", "failed"],
  active: ["deploying", "disabled"],
  failed: ["deploying", "disabled"],
  disabled: ["deploying"],
};

export type FnKind = "managed" | "lambda-proxy";

export type Governance = {
  allowedProviders: string[];
  allowedModels: string[];
  /** Hard stop per invocation. */
  maxInputTokens: number;
  maxOutputTokens: number;
  maxCostMicros: number;
  dailyBudgetMicros: number;
  weeklyBudgetMicros: number;
  invocationsPerMinute: number;
  dailyInvocationCap: number;
  maxConcurrency: number;
  timeoutS: number;
  retries: { max: number; backoff: "fixed" | "exponential"; initialMs: number };
  deadLetter: string | null;
  egress: "none" | "allowlist";
  egressAllow: string[];
  /** References only. Values are never shown or stored in the console. */
  secretRefs: string[];
  dataClass: DataClass;
  piiRedaction: boolean;
  logPayloads: "none" | "metadata" | "redacted";
  approvalAboveMicros: number | null;
  policyIds: string[];
  tools: string[];
};

export type FnRevision = {
  id: string;
  fnId: string;
  number: number;
  createdAt: string;
  createdBy: string;
  note: string;
  artifact: { kind: "inline" | "archive" | "image" | "git" | "lambda-arn"; ref: string; sizeKb: number; digest: string };
  status: "active" | "superseded" | "failed" | "draft";
};

export type DeployStatus = "succeeded" | "failed" | "in-progress" | "rolled-back";
export type FnDeployment = {
  id: string;
  fnId: string;
  revision: number;
  env: Env;
  status: DeployStatus;
  startedAt: string;
  durationS: number;
  by: string;
  note: string;
  error?: string;
  /** Percentage of traffic on this revision. */
  traffic: number;
};

export type TriggerKind = "http" | "kafka" | "schedule";
export type FnTrigger = {
  id: string;
  fnId: string;
  kind: TriggerKind;
  enabled: boolean;
  name: string;
  http?: { method: "POST" | "GET" | "PUT"; path: string; auth: "api-key" | "jwt" | "mtls"; rateLimitPerMin: number; idempotencyHeader: string; cors: string[]; maxBodyKb: number; sync: boolean };
  kafka?: { cluster: string; topic: string; group: string; startOffset: "latest" | "earliest"; batchSize: number; concurrency: number; dlqTopic: string; maxLagAlert: number; format: "json" | "avro" };
  schedule?: { cron: string; timezone: string; overlap: "skip" | "queue" | "allow"; catchUp: boolean; jitterS: number; humanReadable: string };
  lastFiredAt?: string;
  nextFireAt?: string;
};

export type FnFunction = {
  id: string;
  name: string;
  description: string;
  kind: FnKind;
  tenantId: string;
  appId: string;
  owner: string;
  team: string;
  env: Env;
  runtime: Runtime | "aws-lambda";
  handler: string;
  memoryMb: number;
  ephemeralMb: number;
  status: FnStatus;
  statusReason?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  activeRevision: number | null;
  latestRevision: number;
  governance: Governance;
  /** Set for `lambda-proxy`: the connector it calls. */
  lambda?: { connectionId: string; arn: string; region: string; qualifier: string; invocation: "RequestResponse" | "Event" };
  useCase?: string;
};

// --------------------------------------------------------------------------------------------- policies and budgets

export type PolicyKind = "model-allowlist" | "pii-redaction" | "budget" | "egress" | "approval" | "data-residency" | "rate-limit";
export type FnPolicy = {
  id: string;
  name: string;
  kind: PolicyKind;
  description: string;
  mode: "enforce" | "monitor";
  status: "active" | "draft";
  version: number;
  scope: string;
  rules: string[];
};

export type Budget = { id: string; name: string; scope: "tenant" | "app" | "function"; scopeId: string; period: "daily" | "weekly"; limitMicros: number; alertAtPct: number; onExceed: "block" | "alert" };

// --------------------------------------------------------------------------------------------- executions

export type ExecStatus = "succeeded" | "failed" | "timeout" | "blocked" | "throttled" | "waiting-approval" | "running";
export const EXEC_STATUS_LABEL: Record<ExecStatus, string> = {
  succeeded: "Succeeded", failed: "Failed", timeout: "Timed out", blocked: "Blocked by policy", throttled: "Throttled", "waiting-approval": "Waiting for approval", running: "Running",
};

export type StepKind = "trigger" | "validate" | "policy" | "function" | "ai" | "connector" | "condition" | "approval" | "output";
export type StepStatus = "succeeded" | "failed" | "skipped" | "blocked" | "waiting" | "running";
export type ExecStep = {
  id: string;
  name: string;
  kind: StepKind;
  status: StepStatus;
  startMs: number;
  durationMs: number;
  detail: string;
  /** For `ai` steps. */
  model?: string;
  provider?: string;
  tokensIn?: number;
  tokensOut?: number;
  costMicros?: number;
};
export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogLine = { tMs: number; level: LogLevel; source: "platform" | "function" | "gateway"; message: string };

export type FnExecution = {
  id: string;
  fnId: string;
  fnName: string;
  revision: number;
  trigger: TriggerKind;
  triggerName: string;
  tenantId: string;
  appId: string;
  correlationId: string;
  auditId: string;
  workflowRunId?: string;
  startedAt: string;
  durationMs: number;
  status: ExecStatus;
  httpStatus?: number;
  coldStart: boolean;
  memoryUsedMb: number;
  provider?: string;
  model?: string;
  tokensIn: number;
  tokensOut: number;
  costMicros: number;
  policy: { result: "allow" | "deny" | "monitor-only" | "not-evaluated"; policyId?: string; reason?: string };
  error?: { code: string; message: string };
  /** Hash of the request. The payload itself is never kept. */
  payloadDigest: string;
  idempotencyKey?: string;
  attempt: number;
};

/** Timeline and log lines. Derived from the execution record on demand, so the totals always agree with the record. */
export type ExecDetail = { steps: ExecStep[]; logs: LogLine[] };

/** One metered model call. Function executions and workflow AI steps both produce these, and nothing else does. */
export type UsageEvent = {
  id: string;
  at: string;
  tenantId: string;
  appId: string;
  fnId: string | null;
  workflowId: string | null;
  source: "function" | "workflow-step";
  ref: string;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costMicros: number;
  correlationId: string;
};

// --------------------------------------------------------------------------------------------- workflows

export type WfStatus = "draft" | "active" | "disabled";
export type WfStepKind = "trigger" | "function" | "ai" | "condition" | "policy" | "approval" | "connector" | "output";
export type WfStep = {
  id: string;
  kind: WfStepKind;
  name: string;
  /** Static settings the editor shows as fields. */
  config: Record<string, string | number | boolean>;
  next: string | null;
  branches?: { label: string; when: string; next: string | null }[];
};
export type WfRevision = { number: number; createdAt: string; createdBy: string; note: string; status: "active" | "superseded" | "draft" };
export type Workflow = {
  id: string;
  name: string;
  description: string;
  status: WfStatus;
  tenantId: string;
  appId: string;
  owner: string;
  activeRevision: number | null;
  latestRevision: number;
  revisions: WfRevision[];
  trigger: { kind: TriggerKind; summary: string };
  steps: WfStep[];
  policyIds: string[];
  maxCostMicros: number;
  timeoutS: number;
  useCase: string;
  updatedAt: string;
};

export type WfRunStatus = "succeeded" | "failed" | "waiting-approval" | "blocked" | "running" | "rejected";
export type WfRun = {
  id: string;
  workflowId: string;
  workflowName: string;
  revision: number;
  status: WfRunStatus;
  startedAt: string;
  durationMs: number;
  tenantId: string;
  appId: string;
  correlationId: string;
  tokensIn: number;
  tokensOut: number;
  costMicros: number;
  steps: ExecStep[];
  approval?: { approver: string; requestedAt: string; decidedAt?: string; decision?: "approved" | "rejected" };
  executionIds: string[];
  /** Model calls made by the run's own AI steps. Function steps carry their own executions. */
  nativeUsage: UsageEvent[];
};

// --------------------------------------------------------------------------------------------- whole state

export type UsageRow = { key: string; label: string; invocations: number; tokensIn: number; tokensOut: number; costMicros: number };

export type FunctionsState = {
  anchor: string;
  tenants: Tenant[];
  apps: AppRef[];
  providers: Provider[];
  models: ModelDef[];
  policies: FnPolicy[];
  budgets: Budget[];
  functions: FnFunction[];
  revisions: FnRevision[];
  deployments: FnDeployment[];
  triggers: FnTrigger[];
  executions: FnExecution[];
  workflows: Workflow[];
  runs: WfRun[];
  usage: UsageEvent[];
};

export const usd = (micros: number, digits = 4) => `$${(micros / 1_000_000).toFixed(digits)}`;
export const usd2 = (micros: number) => `$${(micros / 1_000_000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const num = (n: number) => n.toLocaleString("en-US");
export const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 10_000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString("en-US"));
