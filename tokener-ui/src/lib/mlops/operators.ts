import {
  GitBranch, ShieldCheck, FileSearch, UserCheck, PackageCheck, Rocket, Activity, ArrowUpFromLine, Undo2, Bell, Trash2,
  FileText, Layers, ScanSearch, Bot, Table2, Wand2, Dumbbell, Radio, Archive, HardDriveDownload, BoxSelect,
  Clock, Timer, Hourglass, AlarmClock, CalendarDays, CalendarPlus, Inbox, Mail, Sparkles,
  Smartphone, CreditCard, Bitcoin, Link2, BadgeCheck, Undo, MessageSquare, Plug, Wrench, BookOpen,
} from "lucide-react";
import { siAwslambda, siPaypal, siDocker, siMlflow, siKubernetes, siPostgresql, siMinio, siApachekafka, siMilvus, siPrometheus } from "simple-icons";
import type { IconRef, ParamDef, Tone } from "@/components/studio/types";
import type { FnIconName } from "@/lib/functions/icon-set";

export type PortType =
  | "source" | "model" | "image" | "report" | "approval" | "endpoint" | "dataset"
  | "documents" | "embeddings" | "index" | "events" | "message" | "payment" | "signal";

export const PORT_COLOR: Record<PortType, string> = {
  source: "#6B7F84", model: "#00B876", image: "#2F6FE0", report: "#D98A15", approval: "#8B5CF6", endpoint: "#07191E",
  dataset: "#0E8F8F", documents: "#B45309", embeddings: "#7C3AED", index: "#BE185D", events: "#2563EB", message: "#0EA5E9", payment: "#16A34A", signal: "#9AA9AD",
};

export const PORT_LABEL: Record<PortType, string> = {
  source: "Source", model: "Model", image: "Image", report: "Report", approval: "Approval", endpoint: "Endpoint", dataset: "Dataset",
  documents: "Documents", embeddings: "Embeddings", index: "Index", events: "Events", message: "Message", payment: "Payment", signal: "Signal",
};

/** Output type -> input types it may feed. Every output may also feed a plain ordering `signal` input. */
const FEEDS: Record<PortType, PortType[]> = {
  source: ["source"], model: ["model"], image: ["image"], report: ["report"], approval: ["approval"], endpoint: ["endpoint"],
  dataset: ["dataset", "documents"], documents: ["documents"], embeddings: ["embeddings"], index: ["index"], events: ["events", "documents"], message: ["message", "documents"], payment: ["payment", "message"], signal: [],
};
export const portsCompatible = (out: PortType, inn: PortType) => out === inn || inn === "signal" || FEEDS[out].includes(inn);

export type Port = { id: string; type: PortType; label: string; optional?: boolean; multi?: boolean };

export type OperatorFamily = "function" | "source" | "build" | "gate" | "data" | "training" | "serve" | "store" | "agent" | "trigger" | "payment" | "ops";
export const OPERATOR_FAMILY: Record<OperatorFamily, { label: string; tone: Tone }> = {
  function: { label: "Functions and workflows", tone: "accent" },
  source: { label: "Artifact and source", tone: "neutral" },
  build: { label: "Build and package", tone: "info" },
  gate: { label: "Validate, evaluate, approve", tone: "warn" },
  data: { label: "Data and preprocessing", tone: "info" },
  training: { label: "Training", tone: "violet" },
  serve: { label: "Serve and release", tone: "accent" },
  store: { label: "Stores and indexes", tone: "violet" },
  trigger: { label: "Triggers, time and messages", tone: "info" },
  payment: { label: "Payments", tone: "accent" },
  agent: { label: "Agent and app", tone: "accent" },
  ops: { label: "Monitor and operate", tone: "neutral" },
};

export type OperatorDef = {
  kind: string;
  label: string;
  family: OperatorFamily;
  icon: IconRef;
  desc: string;
  schemaVersion: string;
  inputs: Port[];
  outputs: Port[];
  params: ParamDef[];
  /** Integration ids this operator can run against. Empty means it needs no connection. */
  targets: string[];
  /** The connection role the operator needs, shown as a picker in the config panel. */
  needsConnection?: boolean;
  /** Execution adapter name. Real adapters are all planned in this build. */
  adapter: string;
  /** "demo" operators run as simulated runs only. "none" can be drawn but has no adapter at all. */
  executable: "demo" | "none";
  retry: { max: number; backoffMs: number };
  timeoutSec: number;
  onFailure: "stop" | "continue" | "rollback";
  secretKeys?: string[];
  destructive?: boolean;
  costly?: boolean;
  /** Needs a build agent with a label match. */
  needsAgent?: boolean;
  summary?: (c: Record<string, any>) => string;
};

const lucide = (l: any): IconRef => ({ lucide: l });
const si = (i: { title: string; path: string; hex: string }): IconRef => ({ si: i });
const cdn = (slug: string, hex: string, fallback: any): IconRef => ({ cdn: slug, hex, fallback });
const P = (id: string, type: PortType, label: string, o: Partial<Port> = {}): Port => ({ id, type, label, ...o });

const K8S_TARGETS = ["kubernetes", "kserve", "knative", "custom-oci", "linux-agent", "docker-local", "custom-http"];

export const OPERATORS: OperatorDef[] = [
  {
    kind: "git_source", label: "Source repository", family: "source", icon: lucide(GitBranch), desc: "Pin a Git commit as the pipeline input.",
    schemaVersion: "1", inputs: [], outputs: [P("source", "source", "Source")], targets: [], adapter: "git.resolve", executable: "demo",
    retry: { max: 2, backoffMs: 2000 }, timeoutSec: 120, onFailure: "stop",
    params: [
      { key: "repo", label: "Repository", type: "text", default: "git@github.com:nexi-ai/support-classifier.git" },
      { key: "ref", label: "Ref", type: "text", default: "refs/heads/main", help: "Resolved to a commit SHA at plan time. Runs pin the SHA." },
      { key: "path", label: "Path", type: "text", default: "." },
    ],
    summary: (c) => `${c.repo?.split("/").pop() ?? "repo"} @ ${c.ref?.split("/").pop() ?? "ref"}`,
  },
  {
    kind: "registry_model", label: "Registered model", family: "source", icon: si(siMlflow), desc: "Reference a model version in a model registry.",
    schemaVersion: "1", inputs: [], outputs: [P("model", "model", "Model")], targets: ["mlflow", "huggingface"], needsConnection: true, adapter: "registry.resolve", executable: "demo",
    retry: { max: 3, backoffMs: 1500 }, timeoutSec: 60, onFailure: "stop",
    params: [
      { key: "name", label: "Model name", type: "text", default: "customer-support-classifier" },
      { key: "version", label: "Version", type: "number", default: 4 },
    ],
    summary: (c) => `${c.name ?? "model"} v${c.version ?? "?"}`,
  },
  {
    kind: "build_image", label: "Build image", family: "build", icon: si(siDocker), desc: "Build and push an OCI image on a build agent, with SBOM and provenance.",
    schemaVersion: "1", inputs: [P("source", "source", "Source")], outputs: [P("image", "image", "Image")], targets: ["oci-registry"], needsConnection: true, needsAgent: true,
    adapter: "agent.build", executable: "demo", retry: { max: 1, backoffMs: 5000 }, timeoutSec: 1800, onFailure: "stop", costly: true,
    params: [
      { key: "dockerfile", label: "Dockerfile", type: "text", default: "serving/Dockerfile" },
      { key: "repository", label: "Image repository", type: "text", default: "registry.nexi.example/ml/support-classifier" },
      { key: "platforms", label: "Platforms", type: "select", options: ["linux/amd64", "linux/arm64", "linux/amd64,linux/arm64"], default: "linux/amd64" },
      { key: "agentLabels", label: "Agent labels", type: "text", default: "os=linux,arch=amd64", help: "The run is queued to an online agent whose labels match." },
      { key: "sbom", label: "Generate SBOM", type: "toggle", default: true },
      { key: "sign", label: "Sign image", type: "toggle", default: true },
    ],
    summary: (c) => `${c.repository?.split("/").pop() ?? "image"} on ${c.platforms ?? "linux/amd64"}`,
  },
  {
    kind: "validate_artifact", label: "Validate artifact", family: "gate", icon: lucide(ShieldCheck), desc: "Check format, architecture, runtime match, license and size.",
    schemaVersion: "1", inputs: [P("image", "image", "Image")], outputs: [P("report", "report", "Report")], targets: [], adapter: "validate.artifact", executable: "demo",
    retry: { max: 0, backoffMs: 0 }, timeoutSec: 300, onFailure: "stop",
    params: [
      { key: "allowedLicenses", label: "Allowed licenses", type: "list", default: "Apache-2.0,MIT,BSD-3-Clause" },
      { key: "maxSizeMb", label: "Max size (MB)", type: "number", default: 4096 },
      { key: "arch", label: "Required architecture", type: "select", options: ["any", "amd64", "arm64"], default: "amd64" },
      { key: "scan", label: "Vulnerability scan", type: "toggle", default: true },
      { key: "maxCritical", label: "Max critical findings", type: "number", default: 0 },
    ],
    summary: (c) => `licenses ${c.allowedLicenses ?? "any"}`,
  },
  {
    kind: "evaluate_model", label: "Evaluate model", family: "gate", icon: lucide(FileSearch), desc: "Run an evaluation set and compare to thresholds.",
    schemaVersion: "1", inputs: [P("model", "model", "Model"), P("dataset", "dataset", "Eval set", { optional: true })], outputs: [P("report", "report", "Report")], targets: [],
    adapter: "evaluate.run", executable: "demo", retry: { max: 1, backoffMs: 3000 }, timeoutSec: 1800, onFailure: "stop", costly: true,
    params: [
      { key: "metric", label: "Primary metric", type: "select", options: ["f1_macro", "accuracy", "auc", "rouge_l"], default: "f1_macro" },
      { key: "threshold", label: "Minimum value", type: "number", default: 0.9 },
      { key: "baseline", label: "Compare to production", type: "toggle", default: true },
    ],
    summary: (c) => `${c.metric} >= ${c.threshold}`,
  },
  {
    kind: "approval_gate", label: "Approval gate", family: "gate", icon: lucide(UserCheck), desc: "Wait for a human with the approver role. Required before production changes.",
    schemaVersion: "1", inputs: [P("in", "signal", "Context", { multi: true })], outputs: [P("approval", "approval", "Approval")], targets: [], adapter: "approval.wait", executable: "demo",
    retry: { max: 0, backoffMs: 0 }, timeoutSec: 86400, onFailure: "stop",
    params: [
      { key: "role", label: "Approver role", type: "select", options: ["approver", "admin"], default: "approver" },
      { key: "required", label: "Approvals required", type: "number", default: 1 },
      { key: "expiryHours", label: "Expires after (hours)", type: "number", default: 24 },
      { key: "separation", label: "Requester cannot approve", type: "toggle", default: true },
    ],
    summary: (c) => `${c.required ?? 1} x ${c.role ?? "approver"}`,
  },
  {
    kind: "register_model", label: "Register model", family: "source", icon: lucide(PackageCheck), desc: "Create a model version with provenance in the registry.",
    schemaVersion: "1", inputs: [P("image", "image", "Image"), P("gate", "signal", "Gate", { optional: true, multi: true })], outputs: [P("model", "model", "Model")], targets: ["mlflow"], needsConnection: true,
    adapter: "registry.register", executable: "demo", retry: { max: 2, backoffMs: 2000 }, timeoutSec: 120, onFailure: "stop",
    params: [
      { key: "name", label: "Model name", type: "text", default: "customer-support-classifier" },
      { key: "stage", label: "Initial stage", type: "select", options: ["none", "staging"], default: "staging" },
      { key: "recordProvenance", label: "Record provenance", type: "toggle", default: true },
    ],
    summary: (c) => `${c.name ?? "model"} to ${c.stage ?? "none"}`,
  },
  {
    kind: "data_source", label: "Database source", family: "data", icon: si(siPostgresql), desc: "Read rows from a relational database with row and time limits.",
    schemaVersion: "1", inputs: [], outputs: [P("dataset", "dataset", "Dataset")], targets: ["postgres"], needsConnection: true, adapter: "sql.read", executable: "demo",
    retry: { max: 3, backoffMs: 2000 }, timeoutSec: 600, onFailure: "stop",
    params: [
      { key: "query", label: "Query", type: "text", default: "SELECT id, text, label FROM tickets WHERE created_at > now() - interval '7 days'" },
      { key: "maxRows", label: "Row limit", type: "number", default: 500000 },
    ],
    summary: (c) => `limit ${c.maxRows ?? "?"} rows`,
  },
  {
    kind: "preprocess", label: "Preprocess", family: "data", icon: lucide(Wand2), desc: "Deterministic transforms with a recorded code hash.",
    schemaVersion: "1", inputs: [P("dataset", "dataset", "Dataset")], outputs: [P("dataset", "dataset", "Dataset")], targets: ["spark", "linux-agent", "kubernetes"], needsConnection: true,
    adapter: "job.submit", executable: "demo", retry: { max: 1, backoffMs: 5000 }, timeoutSec: 3600, onFailure: "stop", costly: true,
    params: [{ key: "image", label: "Job image", type: "text", default: "registry.nexi.example/ml/preprocess@sha256:9d1c" }, { key: "cpu", label: "CPU", type: "text", default: "2" }, { key: "memory", label: "Memory", type: "text", default: "4Gi" }],
    summary: (c) => `${c.cpu ?? "?"} CPU, ${c.memory ?? "?"}`,
  },
  {
    kind: "train", label: "Training job", family: "training", icon: lucide(Dumbbell), desc: "Drawable only. No training adapter exists in this build, so it cannot run.",
    schemaVersion: "1", inputs: [P("dataset", "dataset", "Dataset")], outputs: [P("model", "model", "Model")], targets: [], adapter: "none", executable: "none",
    retry: { max: 0, backoffMs: 0 }, timeoutSec: 0, onFailure: "stop", costly: true,
    params: [{ key: "framework", label: "Framework", type: "select", options: ["pytorch", "tensorflow", "custom"], default: "pytorch" }, { key: "gpus", label: "GPUs", type: "number", default: 1 }],
    summary: (c) => `${c.framework ?? "?"}, ${c.gpus ?? 0} GPU`,
  },
  {
    kind: "deploy_endpoint", label: "Deploy endpoint", family: "serve", icon: si(siKubernetes), desc: "Create or update a serving endpoint on a connected target.",
    schemaVersion: "1", inputs: [P("model", "model", "Model"), P("gate", "signal", "Gate", { optional: true, multi: true })], outputs: [P("endpoint", "endpoint", "Endpoint")], targets: K8S_TARGETS, needsConnection: true,
    adapter: "target.apply", executable: "demo", retry: { max: 2, backoffMs: 10000 }, timeoutSec: 900, onFailure: "rollback", costly: true,
    params: [
      { key: "name", label: "Endpoint name", type: "text", default: "support-classifier" },
      { key: "runtime", label: "Runtime", type: "select", options: ["kserve-sklearn", "kserve-huggingface", "custom-container", "bentoml", "ray-serve"], default: "kserve-huggingface" },
      { key: "replicasMin", label: "Min replicas", type: "number", default: 2 },
      { key: "replicasMax", label: "Max replicas", type: "number", default: 6 },
      { key: "cpu", label: "CPU per replica", type: "text", default: "2" },
      { key: "memory", label: "Memory per replica", type: "text", default: "4Gi" },
      { key: "gpu", label: "GPUs per replica", type: "number", default: 0, help: "Requests the resource only. Drivers must already exist on the target." },
      { key: "concurrency", label: "Target concurrency", type: "number", default: 8 },
    ],
    summary: (c) => `${c.name ?? "endpoint"} ${c.replicasMin ?? "?"}-${c.replicasMax ?? "?"} replicas`,
  },
  {
    kind: "canary_rollout", label: "Deploy canary", family: "serve", icon: lucide(Rocket), desc: "Route a small share of traffic to a new version and watch.",
    schemaVersion: "1", inputs: [P("model", "model", "Model"), P("gate", "signal", "Gate", { optional: true, multi: true })], outputs: [P("endpoint", "endpoint", "Endpoint")], targets: ["kserve", "knative", "kubernetes"], needsConnection: true,
    adapter: "target.canary", executable: "demo", retry: { max: 1, backoffMs: 10000 }, timeoutSec: 900, onFailure: "rollback", costly: true,
    params: [
      { key: "name", label: "Endpoint name", type: "text", default: "support-classifier" },
      { key: "percent", label: "Canary traffic %", type: "number", default: 10 },
      { key: "replicasMin", label: "Min replicas", type: "number", default: 2 },
      { key: "replicasMax", label: "Max replicas", type: "number", default: 6 },
      { key: "cpu", label: "CPU per replica", type: "text", default: "2" },
      { key: "memory", label: "Memory per replica", type: "text", default: "4Gi" },
      { key: "gpu", label: "GPUs per replica", type: "number", default: 0 },
    ],
    summary: (c) => `${c.percent ?? "?"}% traffic`,
  },
  {
    kind: "verify_endpoint", label: "Verify", family: "serve", icon: lucide(Activity), desc: "Probe the live endpoint and compare observed latency and errors to limits.",
    schemaVersion: "1", inputs: [P("endpoint", "endpoint", "Endpoint")], outputs: [P("report", "report", "Report")], targets: [], adapter: "verify.probe", executable: "demo",
    retry: { max: 2, backoffMs: 15000 }, timeoutSec: 600, onFailure: "rollback",
    params: [
      { key: "p95Ms", label: "Max p95 latency (ms)", type: "number", default: 250 },
      { key: "maxErrorPct", label: "Max error rate %", type: "number", default: 1 },
      { key: "observeMinutes", label: "Observe window (min)", type: "number", default: 10 },
      { key: "smokePath", label: "Smoke test path", type: "text", default: "/v1/models/support-classifier:predict" },
    ],
    summary: (c) => `p95 <= ${c.p95Ms ?? "?"} ms, ${c.observeMinutes ?? "?"} min`,
  },
  {
    kind: "promote", label: "Promote", family: "serve", icon: lucide(ArrowUpFromLine), desc: "Shift all traffic to the verified version.",
    schemaVersion: "1", inputs: [P("endpoint", "endpoint", "Endpoint"), P("gate", "signal", "Gate", { optional: true, multi: true })], outputs: [P("endpoint", "endpoint", "Endpoint")], targets: [],
    adapter: "target.promote", executable: "demo", retry: { max: 1, backoffMs: 5000 }, timeoutSec: 300, onFailure: "rollback", costly: true,
    params: [{ key: "steps", label: "Traffic steps", type: "list", default: "25,50,100" }, { key: "pauseSeconds", label: "Pause between steps (s)", type: "number", default: 60 }],
    summary: (c) => `steps ${c.steps ?? "100"}`,
  },
  {
    kind: "rollback", label: "Rollback", family: "serve", icon: lucide(Undo2), desc: "Return to the previous version. Used as a failure branch.",
    schemaVersion: "1", inputs: [P("endpoint", "endpoint", "Endpoint")], outputs: [P("endpoint", "endpoint", "Endpoint")], targets: [], adapter: "target.rollback", executable: "demo",
    retry: { max: 2, backoffMs: 5000 }, timeoutSec: 300, onFailure: "stop", destructive: true,
    params: [{ key: "toVersion", label: "Target version", type: "select", options: ["previous", "pinned"], default: "previous" }],
    summary: (c) => `to ${c.toVersion ?? "previous"}`,
  },
  {
    kind: "ingest_documents", label: "Ingest documents", family: "data", icon: si(siMinio), desc: "List and read documents from object storage.",
    schemaVersion: "1", inputs: [], outputs: [P("documents", "documents", "Documents")], targets: ["s3"], needsConnection: true, adapter: "objectstore.read", executable: "demo",
    retry: { max: 3, backoffMs: 2000 }, timeoutSec: 900, onFailure: "stop",
    params: [{ key: "prefix", label: "Prefix", type: "text", default: "kb/articles/" }, { key: "glob", label: "Match", type: "text", default: "*.md" }],
    summary: (c) => `${c.prefix ?? ""}${c.glob ?? ""}`,
  },
  {
    kind: "stream_source", label: "Stream source", family: "data", icon: si(siApachekafka), desc: "Consume events from a topic with a pipeline-scoped consumer group.",
    schemaVersion: "1", inputs: [], outputs: [P("events", "events", "Events")], targets: ["kafka"], needsConnection: true, adapter: "stream.consume", executable: "demo",
    retry: { max: 3, backoffMs: 2000 }, timeoutSec: 600, onFailure: "stop",
    params: [{ key: "topic", label: "Topic", type: "text", default: "tickets.created" }, { key: "maxEvents", label: "Max events per run", type: "number", default: 10000 }],
    summary: (c) => `${c.topic ?? "topic"}`,
  },
  {
    kind: "store_documents", label: "Store", family: "store", icon: lucide(Archive), desc: "Persist normalized documents with checksums.",
    schemaVersion: "1", inputs: [P("documents", "documents", "Documents")], outputs: [P("documents", "documents", "Documents")], targets: ["s3", "postgres"], needsConnection: true,
    adapter: "objectstore.write", executable: "demo", retry: { max: 3, backoffMs: 2000 }, timeoutSec: 900, onFailure: "stop",
    params: [{ key: "prefix", label: "Output prefix", type: "text", default: "kb/normalized/" }],
    summary: (c) => `${c.prefix ?? ""}`,
  },
  {
    kind: "chunk_embed", label: "Chunk and embed", family: "store", icon: lucide(Layers), desc: "Split documents and call an embedding endpoint.",
    schemaVersion: "1", inputs: [P("documents", "documents", "Documents")], outputs: [P("embeddings", "embeddings", "Embeddings")], targets: [], adapter: "embed.batch", executable: "demo",
    retry: { max: 2, backoffMs: 5000 }, timeoutSec: 3600, onFailure: "stop", costly: true,
    params: [{ key: "chunk", label: "Chunk size (tokens)", type: "number", default: 512 }, { key: "overlap", label: "Overlap", type: "number", default: 64 }, { key: "model", label: "Embedding endpoint", type: "text", default: "support-embedder-staging" }],
    summary: (c) => `${c.chunk ?? "?"} tokens, ${c.model ?? "?"}`,
  },
  {
    kind: "vector_index", label: "Vector index", family: "store", icon: si(siMilvus), desc: "Upsert embeddings into a vector store.",
    schemaVersion: "1", inputs: [P("embeddings", "embeddings", "Embeddings")], outputs: [P("index", "index", "Index")], targets: ["pgvector", "milvus", "qdrant", "weaviate"], needsConnection: true,
    adapter: "vector.upsert", executable: "demo", retry: { max: 3, backoffMs: 3000 }, timeoutSec: 1800, onFailure: "stop",
    params: [{ key: "collection", label: "Collection", type: "text", default: "support_kb" }, { key: "dimension", label: "Dimension", type: "number", default: 768 }, { key: "metric", label: "Distance", type: "select", options: ["cosine", "dot", "l2"], default: "cosine" }],
    summary: (c) => `${c.collection ?? "?"} d=${c.dimension ?? "?"}`,
  },
  {
    kind: "retrieve", label: "Retrieve", family: "agent", icon: lucide(ScanSearch), desc: "Top-k retrieval with optional metadata filters.",
    schemaVersion: "1", inputs: [P("index", "index", "Index")], outputs: [P("documents", "documents", "Documents")], targets: [], adapter: "vector.query", executable: "demo",
    retry: { max: 2, backoffMs: 1000 }, timeoutSec: 60, onFailure: "stop",
    params: [{ key: "topK", label: "Top K", type: "number", default: 5 }, { key: "minScore", label: "Min score", type: "number", default: 0.35 }],
    summary: (c) => `top ${c.topK ?? "?"}`,
  },
  {
    kind: "agent_service", label: "Serve agent", family: "agent", icon: lucide(Bot), desc: "Expose a retrieval-augmented service through the tok∑ner gateway with policy, budget and usage accounting.",
    schemaVersion: "1", inputs: [P("documents", "documents", "Context"), P("model", "model", "Model", { optional: true }), P("gate", "signal", "Gate", { optional: true, multi: true })], outputs: [P("endpoint", "endpoint", "Endpoint")], targets: ["kubernetes", "custom-oci"], needsConnection: true,
    adapter: "target.apply", executable: "demo", retry: { max: 2, backoffMs: 10000 }, timeoutSec: 900, onFailure: "rollback", costly: true,
    params: [{ key: "name", label: "Service name", type: "text", default: "support-assistant" }, { key: "gatewayPolicy", label: "Gateway policy", type: "text", default: "pol-support-default" }, { key: "budget", label: "Budget", type: "text", default: "Support team monthly" }],
    summary: (c) => `${c.name ?? "service"} via gateway`,
  },
  {
    kind: "monitor", label: "Observe", family: "ops", icon: si(siPrometheus), desc: "Attach dashboards and alert rules to an endpoint.",
    schemaVersion: "1", inputs: [P("endpoint", "endpoint", "Endpoint")], outputs: [P("signal", "signal", "Signal")], targets: ["prometheus"], needsConnection: true, adapter: "observe.attach", executable: "demo",
    retry: { max: 1, backoffMs: 2000 }, timeoutSec: 120, onFailure: "continue",
    params: [{ key: "alertP95", label: "Alert p95 (ms)", type: "number", default: 300 }, { key: "alertErrorPct", label: "Alert error rate %", type: "number", default: 2 }],
    summary: (c) => `p95 ${c.alertP95 ?? "?"} ms`,
  },
  {
    kind: "notify", label: "Notify", family: "ops", icon: lucide(Bell), desc: "Send a message to a configured channel. Content is redacted.",
    schemaVersion: "1", inputs: [P("signal", "signal", "Trigger", { multi: true })], outputs: [], targets: [], adapter: "notify.send", executable: "demo",
    retry: { max: 2, backoffMs: 2000 }, timeoutSec: 60, onFailure: "continue",
    params: [{ key: "channel", label: "Channel", type: "text", default: "#ml-releases" }, { key: "onlyOnFailure", label: "Only on failure", type: "toggle", default: false }],
    summary: (c) => `${c.channel ?? "?"}`,
  },
  {
    kind: "cleanup", label: "Cleanup", family: "ops", icon: lucide(Trash2), desc: "Remove superseded revisions and temporary resources.",
    schemaVersion: "1", inputs: [P("signal", "signal", "Trigger", { multi: true })], outputs: [], targets: [], adapter: "target.cleanup", executable: "demo",
    retry: { max: 1, backoffMs: 2000 }, timeoutSec: 300, onFailure: "continue", destructive: true,
    params: [{ key: "keep", label: "Revisions to keep", type: "number", default: 3 }],
    summary: (c) => `keep ${c.keep ?? "?"}`,
  },
  // ---- Triggers, time and messages for agent builders
  {
    kind: "schedule_trigger", label: "Schedule", family: "trigger", icon: lucide(Clock), desc: "Start the pipeline on a cron schedule in a named time zone.",
    schemaVersion: "1", inputs: [], outputs: [P("tick", "signal", "Tick")], targets: [], adapter: "schedule.arm", executable: "demo",
    retry: { max: 0, backoffMs: 0 }, timeoutSec: 30, onFailure: "stop",
    params: [
      { key: "mode", label: "Kind", type: "select", options: ["Cron expression", "Every day", "Every weekday", "Every week", "Every month"], default: "Every weekday" },
      { key: "cron", label: "Cron expression", type: "text", default: "0 8 * * 1-5", help: "Five fields: minute, hour, day of month, month, day of week. Used when Kind is Cron expression." },
      { key: "at", label: "Time of day", type: "time", default: "08:00" },
      { key: "timezone", label: "Time zone", type: "text", default: "UTC", help: "An IANA name such as Asia/Bahrain or Europe/London. Daylight saving is handled for you." },
      { key: "missed", label: "If a run was missed", type: "select", options: ["Skip it", "Run once when back", "Catch up every missed run"], default: "Run once when back" },
      { key: "jitterSec", label: "Random delay (seconds)", type: "number", default: 0, help: "Spreads load when many pipelines share a schedule." },
      { key: "skipHolidays", label: "Skip public holidays", type: "toggle", default: false },
      { key: "startAt", label: "Active from", type: "datetime" },
      { key: "endAt", label: "Active until", type: "datetime" },
    ],
    summary: (c) => (c.mode === "Cron expression" ? `${c.cron ?? "?"} ${c.timezone ?? "UTC"}` : `${c.mode ?? "Schedule"} at ${c.at ?? "?"} ${c.timezone ?? "UTC"}`),
  },
  {
    kind: "interval_timer", label: "Timer", family: "trigger", icon: lucide(Timer), desc: "Fire repeatedly at a fixed interval, with a limit and an overlap rule.",
    schemaVersion: "1", inputs: [], outputs: [P("tick", "signal", "Tick")], targets: [], adapter: "timer.arm", executable: "demo",
    retry: { max: 0, backoffMs: 0 }, timeoutSec: 30, onFailure: "stop",
    params: [
      { key: "every", label: "Every", type: "number", default: 15 },
      { key: "unit", label: "Unit", type: "select", options: ["seconds", "minutes", "hours", "days"], default: "minutes" },
      { key: "maxRuns", label: "Stop after (runs)", type: "number", default: 0, help: "0 means no limit." },
      { key: "overlap", label: "If the last run is still going", type: "select", options: ["Skip this tick", "Queue it", "Cancel the previous run"], default: "Skip this tick" },
    ],
    summary: (c) => `every ${c.every ?? "?"} ${c.unit ?? ""}`.trim(),
  },
  {
    kind: "wait_delay", label: "Wait", family: "trigger", icon: lucide(Hourglass), desc: "Pause for a duration, until a time, or until a calendar day starts.",
    schemaVersion: "1", inputs: [P("in", "signal", "Trigger", { multi: true })], outputs: [P("next", "signal", "Continue")], targets: [], adapter: "timer.wait", executable: "demo",
    retry: { max: 0, backoffMs: 0 }, timeoutSec: 604800, onFailure: "stop",
    params: [
      { key: "mode", label: "Wait", type: "select", options: ["For a duration", "Until a time of day", "Until a date and time"], default: "For a duration" },
      { key: "duration", label: "Duration", type: "number", default: 30 },
      { key: "unit", label: "Unit", type: "select", options: ["seconds", "minutes", "hours", "days"], default: "minutes" },
      { key: "until", label: "Resume at", type: "datetime" },
      { key: "timezone", label: "Time zone", type: "text", default: "UTC" },
    ],
    summary: (c) => (c.mode === "For a duration" ? `${c.duration ?? "?"} ${c.unit ?? ""}`.trim() : String(c.mode ?? "Wait")),
  },
  {
    kind: "time_window", label: "Business hours", family: "trigger", icon: lucide(AlarmClock), desc: "Only let work through inside an allowed window of days and hours.",
    schemaVersion: "1", inputs: [P("in", "signal", "Trigger", { multi: true })], outputs: [P("open", "signal", "Open")], targets: [], adapter: "clock.window", executable: "demo",
    retry: { max: 0, backoffMs: 0 }, timeoutSec: 604800, onFailure: "stop",
    params: [
      { key: "days", label: "Days", type: "list", default: "Mon,Tue,Wed,Thu,Fri" },
      { key: "from", label: "From", type: "time", default: "09:00" },
      { key: "to", label: "To", type: "time", default: "17:30" },
      { key: "timezone", label: "Time zone", type: "text", default: "UTC" },
      { key: "holidays", label: "Holiday calendar", type: "text", optional: true, placeholder: "Calendar id, or leave empty", help: "Days on this calendar count as closed." },
      { key: "outside", label: "Outside the window", type: "select", options: ["Hold until it opens", "Skip this run", "Fail the run"], default: "Hold until it opens" },
    ],
    summary: (c) => `${c.from ?? "?"} to ${c.to ?? "?"} ${c.timezone ?? "UTC"}`,
  },
  {
    kind: "calendar_read", label: "Read calendar", family: "trigger", icon: lucide(CalendarDays), desc: "Read events from Google Calendar, Outlook or an iCalendar feed.",
    schemaVersion: "1", inputs: [P("when", "signal", "Run when", { optional: true, multi: true })], outputs: [P("events", "events", "Events")],
    targets: ["google-calendar", "outlook-calendar", "caldav"], needsConnection: true, adapter: "calendar.read", executable: "demo",
    retry: { max: 3, backoffMs: 2000 }, timeoutSec: 60, onFailure: "stop",
    params: [
      { key: "calendarId", label: "Calendar", type: "text", default: "primary" },
      { key: "lookaheadDays", label: "Look ahead (days)", type: "number", default: 1 },
      { key: "query", label: "Text filter", type: "text", optional: true, placeholder: "Optional" },
      { key: "onlyBusy", label: "Only events marked busy", type: "toggle", default: true },
      { key: "maxEvents", label: "Maximum events", type: "number", default: 50 },
      { key: "includeAttendees", label: "Include attendee addresses", type: "toggle", default: false, help: "Off by default so personal data stays out of prompts." },
    ],
    summary: (c) => `${c.calendarId ?? "primary"}, next ${c.lookaheadDays ?? "?"} d`,
  },
  {
    kind: "calendar_event", label: "Create event", family: "trigger", icon: lucide(CalendarPlus), desc: "Create or update a calendar event, optionally in the first free slot.",
    schemaVersion: "1", inputs: [P("message", "message", "Details", { optional: true }), P("gate", "signal", "Trigger", { multi: true })], outputs: [P("created", "signal", "Created")],
    targets: ["google-calendar", "outlook-calendar", "caldav"], needsConnection: true, adapter: "calendar.write", executable: "demo",
    retry: { max: 2, backoffMs: 3000 }, timeoutSec: 60, onFailure: "stop", destructive: true,
    params: [
      { key: "calendarId", label: "Calendar", type: "text", default: "primary" },
      { key: "title", label: "Title", type: "text", default: "Follow-up: {{subject}}" },
      { key: "durationMin", label: "Length (minutes)", type: "number", default: 30 },
      { key: "attendees", label: "Attendees", type: "list", placeholder: "name@example.com" },
      { key: "findFreeSlot", label: "Use the first free slot", type: "toggle", default: true },
      { key: "meetingLink", label: "Add a video meeting link", type: "toggle", default: false },
      { key: "requireApproval", label: "Require approval before inviting people", type: "toggle", default: true },
    ],
    summary: (c) => `${c.durationMin ?? "?"} min${c.findFreeSlot ? ", first free slot" : ""}`,
  },
  {
    kind: "email_inbox", label: "Read mailbox", family: "trigger", icon: lucide(Inbox), desc: "Read new messages from Gmail, Outlook or any IMAP mailbox.",
    schemaVersion: "1", inputs: [P("when", "signal", "Run when", { optional: true, multi: true })], outputs: [P("messages", "message", "Messages")],
    targets: ["gmail", "outlook-mail", "imap"], needsConnection: true, adapter: "mail.read", executable: "demo",
    retry: { max: 3, backoffMs: 2000 }, timeoutSec: 120, onFailure: "stop",
    params: [
      { key: "folder", label: "Folder or label", type: "text", default: "INBOX" },
      { key: "filter", label: "Filter", type: "text", default: "is:unread", help: "Provider search syntax. Evaluated by the provider, not by tok\u2211ner." },
      { key: "maxPerRun", label: "Messages per run", type: "number", default: 25 },
      { key: "senders", label: "Only from these senders or domains", type: "list", placeholder: "example.com" },
      { key: "attachments", label: "Read attachments", type: "toggle", default: false, help: "Attachments are scanned for malware and processed once into canonical documents." },
      { key: "markRead", label: "Mark as read afterwards", type: "toggle", default: false },
    ],
    summary: (c) => `${c.folder ?? "INBOX"}, up to ${c.maxPerRun ?? "?"}`,
  },
  {
    kind: "llm_step", label: "Ask a model", family: "agent", icon: lucide(Sparkles), desc: "Call a model through the tok\u2211ner gateway, so policy, budget and metering apply.",
    schemaVersion: "1", inputs: [P("context", "documents", "Context", { multi: true }), P("gate", "signal", "Gate", { optional: true, multi: true })], outputs: [P("reply", "message", "Reply")],
    targets: [], adapter: "gateway.complete", executable: "demo", retry: { max: 2, backoffMs: 3000 }, timeoutSec: 180, onFailure: "stop", costly: true,
    params: [
      { key: "model", label: "Model alias", type: "text", default: "chat-default", help: "An alias from the Model Registry, so the model can change without editing this pipeline." },
      { key: "prompt", label: "Instruction", type: "text", default: "Summarise what needs a reply today and draft a short answer for each." },
      { key: "maxTokens", label: "Maximum output tokens", type: "number", default: 800 },
      { key: "gatewayPolicy", label: "Gateway policy", type: "text", default: "pol-support-default" },
      { key: "budget", label: "Budget", type: "text", default: "Support assistants" },
    ],
    summary: (c) => `${c.model ?? "model"}, up to ${c.maxTokens ?? "?"} tokens`,
  },
  {
    kind: "send_email", label: "Send email", family: "trigger", icon: lucide(Mail), desc: "Send or draft a message through Gmail, Outlook, SendGrid, SES, Mailgun, Postmark or SMTP.",
    schemaVersion: "1", inputs: [P("message", "message", "Content", { optional: true }), P("gate", "signal", "Trigger", { multi: true })], outputs: [P("sent", "signal", "Sent")],
    targets: ["gmail", "outlook-mail", "sendgrid", "amazon-ses", "mailgun", "postmark", "smtp"], needsConnection: true, adapter: "mail.send", executable: "demo",
    retry: { max: 2, backoffMs: 5000 }, timeoutSec: 60, onFailure: "stop", destructive: true,
    params: [
      { key: "from", label: "From", type: "text", default: "assistant@nexi.example" },
      { key: "to", label: "To", type: "list", placeholder: "name@example.com" },
      { key: "cc", label: "Cc", type: "list" },
      { key: "subject", label: "Subject", type: "text", default: "Your morning briefing" },
      { key: "mode", label: "Delivery", type: "select", options: ["Save as draft", "Send after approval", "Send immediately"], default: "Save as draft" },
      { key: "allowedDomains", label: "Allowed recipient domains", type: "list", default: "nexi.example", help: "Anything outside these domains is held for approval." },
      { key: "redact", label: "Redact secrets and personal data", type: "toggle", default: true },
      { key: "attachments", label: "Attach generated files", type: "toggle", default: false },
    ],
    summary: (c) => `${c.mode ?? "Save as draft"} from ${c.from ?? "?"}`,
  },
];


// ---------------------------------------------------------------------------------------------
// Payments. Every payment operator creates a hosted payment request and a shareable link. Card numbers, wallet PINs
// and private keys never pass through the pipeline. Provider credentials are secret references on the connection.

const ZERO_DECIMAL = ["XOF", "XAF", "GNF", "UGX", "RWF", "CDF"];
const payParams = (currencies: string[], o: { currency?: string; extra?: ParamDef[]; expiry?: number } = {}): ParamDef[] => [
  { key: "amountSource", label: "Amount comes from", type: "select", options: ["Fixed amount", "From order data", "From model output"], default: "Fixed amount", help: "Order data is the safest source. An amount produced by a model needs an approval gate upstream, because a model can be wrong or manipulated." },
  { key: "amount", label: "Amount", type: "number", default: 25, optional: true, help: "Used when the amount is fixed. Whole numbers only for currencies without decimals." },
  { key: "currency", label: "Currency", type: "select", options: currencies, default: o.currency ?? currencies[0] },
  { key: "description", label: "What the customer sees", type: "text", default: "Order {{order.id}}" },
  { key: "orderRef", label: "Order reference", type: "text", default: "{{order.id}}", help: "Must be unique per order. It is also the idempotency key, so a retry can never create a second request." },
  { key: "linkExpiryMin", label: "Link valid for (minutes)", type: "number", default: o.expiry ?? 60 },
  { key: "maxAmount", label: "Maximum for this operator", type: "number", default: 500, help: "A request above this is refused. The organisation limit in Settings applies as well." },
  ...(o.extra ?? []),
];
const payIn = [P("order", "dataset", "Order", { optional: true }), P("gate", "signal", "Trigger", { optional: true, multi: true })];
const payOut = [P("link", "message", "Payment link"), P("payment", "payment", "Payment")];
const payBase = { schemaVersion: "1", inputs: payIn, outputs: payOut, needsConnection: true, executable: "demo" as const, retry: { max: 2, backoffMs: 4000 }, timeoutSec: 60, onFailure: "stop" as const, destructive: true, family: "payment" as OperatorFamily };
const payTarget = (c: Record<string, any>) => `${c.amountSource === "Fixed amount" ? `${c.amount ?? "?"} ` : "order amount "}${c.currency ?? ""}`.trim();
const hostedUrls: ParamDef[] = [
  { key: "returnUrl", label: "Return page", type: "text", default: "https://pay.nexi.example/thanks", help: "HTTPS only. Shown after payment. It is never used as proof of payment." },
  { key: "cancelUrl", label: "Cancel page", type: "text", default: "https://pay.nexi.example/cancelled" },
];

export const PAYMENT_OPERATORS: OperatorDef[] = [
  {
    kind: "payment_request", label: "Payment request", family: "payment", icon: lucide(Link2),
    desc: "Start when your application or a request form submits an order that needs payment. Requests must be signed.",
    schemaVersion: "1", inputs: [], outputs: [P("order", "dataset", "Order")],
    targets: [], adapter: "payments.request", executable: "demo", retry: { max: 0, backoffMs: 0 }, timeoutSec: 30, onFailure: "stop",
    params: [
      { key: "source", label: "Orders come from", type: "select", options: ["Your application (signed API call)", "Hosted request form"], default: "Your application (signed API call)" },
      { key: "fields", label: "Order fields", type: "text", default: "id, amount, currency, name, phone, email", help: "The fields the pipeline can use as {{order.field}}. Only these are accepted. Everything else is dropped." },
      { key: "signRequests", label: "Require signed requests", type: "toggle", default: true, help: "Required. Unsigned requests are rejected so nobody can start a payment for an order you did not create." },
      { key: "ratePerMinute", label: "Requests per minute, at most", type: "number", default: 60 },
    ],
    summary: (c) => `${c.source ?? "Orders"}`,
  },
  {
    ...payBase, kind: "pay_mtn_momo", label: "Collect with MTN MoMo", icon: cdn("mtn", "FFCC00", Smartphone),
    desc: "Request payment from an MTN Mobile Money wallet. The customer opens your link, enters their number and approves with their PIN on their phone.",
    targets: ["mtn-momo"], adapter: "payments.mtn", timeoutSec: 90,
    params: payParams(["UGX", "GHS", "XAF", "XOF", "ZMW", "RWF", "SZL", "EUR"], {
      currency: "UGX", expiry: 30,
      extra: [
        { key: "payerMessage", label: "Message on the customer's phone", type: "text", default: "Payment to NexI" },
        { key: "payeeNote", label: "Note for your records", type: "text", default: "{{order.id}}" },
        { key: "numberSource", label: "Customer number", type: "select", options: ["Customer enters it on the pay page", "From order data"], default: "Customer enters it on the pay page" },
      ],
    }),
    summary: (c) => `MTN MoMo, ${payTarget(c)}`,
  },
  {
    ...payBase, kind: "pay_orange_money", label: "Collect with Orange Money", icon: cdn("orange", "FF7900", Smartphone),
    desc: "Create an Orange Money web payment and share its hosted link. The customer confirms with a one-time code.",
    targets: ["orange-money"], adapter: "payments.orange",
    params: payParams(["XOF", "XAF", "GNF", "MGA", "BWP", "SLE", "CDF", "OUV"], {
      currency: "XOF",
      extra: [{ key: "language", label: "Page language", type: "select", options: ["fr", "en"], default: "fr" }, ...hostedUrls],
    }),
    summary: (c) => `Orange Money, ${payTarget(c)}`,
  },
  {
    ...payBase, kind: "pay_paypal", label: "Collect with PayPal", icon: si(siPaypal),
    desc: "Create a PayPal order and share the approval link. The platform captures it after the customer approves.",
    targets: ["paypal"], adapter: "payments.paypal",
    params: payParams(["USD", "EUR", "GBP", "CAD", "AUD", "CHF", "JPY"], {
      currency: "USD",
      extra: [
        { key: "shipping", label: "Shipping address", type: "select", options: ["Not needed (digital or service)", "Collect from PayPal"], default: "Not needed (digital or service)" },
        ...hostedUrls,
      ],
    }),
    summary: (c) => `PayPal, ${payTarget(c)}`,
  },
  {
    ...payBase, kind: "pay_card", label: "Collect by card", icon: lucide(CreditCard),
    desc: "Accept Visa and Mastercard on a provider-hosted page through Stripe, Adyen, Flutterwave or Paystack. Card numbers never reach tok\u2211ner.",
    targets: ["stripe", "adyen", "flutterwave", "paystack"], adapter: "payments.card",
    params: payParams(["USD", "EUR", "GBP", "NGN", "GHS", "KES", "ZAR", "XOF", "CAD", "AUD"], {
      currency: "USD",
      extra: [
        { key: "authentication", label: "Customer authentication", type: "select", options: ["Required by the card issuer (recommended)", "Always request 3-D Secure"], default: "Required by the card issuer (recommended)", help: "Strong customer authentication cannot be turned off. It is mandatory in the EEA and the UK and moves fraud liability to the issuer." },
        { key: "descriptor", label: "Statement descriptor", type: "text", default: "NEXI AI", help: "Up to 22 characters. Customers recognise charges by it, which reduces disputes." },
        { key: "billing", label: "Collect billing address", type: "toggle", default: false },
        ...hostedUrls,
      ],
    }),
    summary: (c) => `Card, ${payTarget(c)}`,
  },
  {
    ...payBase, kind: "pay_bitcoin", label: "Collect in Bitcoin", icon: lucide(Bitcoin),
    desc: "Create a BTCPay Server invoice. The customer pays on-chain or over Lightning straight to your wallet.",
    targets: ["btcpay"], adapter: "payments.btcpay", timeoutSec: 60,
    params: payParams(["USD", "EUR", "GBP", "CAD", "AUD", "CHF", "JPY", "NGN", "GHS", "KES", "ZAR"], {
      currency: "USD", expiry: 30,
      extra: [
        { key: "network", label: "Network", type: "select", options: ["On-chain and Lightning", "On-chain only", "Lightning only"], default: "On-chain and Lightning" },
        { key: "confirmations", label: "Confirmations before settled", type: "number", default: 2, help: "At least 1. Use more for high-value orders." },
        { key: "rateSource", label: "Exchange rate source", type: "select", options: ["kraken", "coinbase", "bitstamp", "coingecko"], default: "kraken" },
        { key: "screenAddresses", label: "Screen addresses against sanctions lists", type: "toggle", default: true, help: "Required. A match stops fulfilment and sends the order to review." },
        { key: "reviewAbove", label: "Review orders above", type: "number", default: 1000, help: "Orders above this value are held for a person to check identity and source of funds before fulfilment." },
        ...hostedUrls,
      ],
    }),
    summary: (c) => `Bitcoin, ${payTarget(c)}`,
  },
  {
    ...payBase, kind: "pay_custom", label: "Collect with a custom provider", icon: lucide(Plug),
    desc: "Connect any provider with an HTTP API. You choose the credentials it needs and how to create a payment, read its status and verify its webhooks.",
    targets: ["custom-payment"], adapter: "payments.custom",
    params: payParams(["USD", "EUR", "GBP", "XOF", "XAF", "UGX", "GHS", "NGN", "KES", "ZAR"], {
      currency: "USD",
      extra: [
        { key: "authRefs", label: "Credentials this provider needs", type: "textarea", optional: false, placeholder: "api_key=secretref://vault/kv/pay/provider#api_key\nmerchant_id=secretref://vault/kv/pay/provider#merchant_id", help: "One per line as NAME=secretref://... Add as many as the provider needs. Values never appear here, only references." },
        { key: "createPath", label: "Create payment: path", type: "text", default: "/v1/payments", help: "Called with POST. The order reference is sent as the idempotency key." },
        { key: "bodyTemplate", label: "Create payment: JSON body", type: "textarea", default: "{\n  \"amount\": {{amount}},\n  \"currency\": \"{{currency}}\",\n  \"reference\": \"{{orderRef}}\",\n  \"return_url\": \"{{returnUrl}}\"\n}", help: "Placeholders: {{amount}}, {{currency}}, {{orderRef}}, {{description}}, {{returnUrl}}. No credentials belong here." },
        { key: "linkPath", label: "Payment link in the response", type: "text", default: "$.checkout_url", help: "JSON path to the hosted page URL." },
        { key: "idPath", label: "Provider payment id in the response", type: "text", default: "$.id" },
        { key: "statusPath", label: "Read status: path", type: "text", default: "/v1/payments/{id}", help: "Called with GET. Used to confirm every payment before it counts as paid." },
        { key: "statusPathValue", label: "Status JSON path", type: "text", default: "$.status" },
        { key: "paidValue", label: "Status value meaning paid", type: "text", default: "succeeded" },
        { key: "webhookVerify", label: "Webhook signature", type: "select", options: ["HMAC SHA-256 in a header", "HMAC SHA-512 in a header", "Provider certificate", "Not signed (confirm by reading the status)"], default: "HMAC SHA-256 in a header" },
        { key: "signatureHeader", label: "Signature header name", type: "text", default: "X-Signature", optional: true },
        ...hostedUrls,
      ],
    }),
    summary: (c) => `Custom provider, ${payTarget(c)}`,
  },
  {
    kind: "await_payment", label: "Wait for payment", family: "payment", icon: lucide(BadgeCheck),
    desc: "Pause until the customer pays or the link expires. A payment counts only after the provider confirms it. No compute is held while waiting.",
    schemaVersion: "1", inputs: [P("payment", "payment", "Payment")], outputs: [P("paid", "payment", "Paid"), P("unpaid", "signal", "Expired or failed"), P("review", "signal", "Needs review")],
    targets: [], adapter: "payments.await", executable: "demo", retry: { max: 0, backoffMs: 0 }, timeoutSec: 86400, onFailure: "continue",
    params: [
      { key: "waitMinutes", label: "Wait at most (minutes)", type: "number", default: 60 },
      { key: "underpaid", label: "If the customer pays too little", type: "select", options: ["Hold for review", "Reject and refund"], default: "Hold for review" },
      { key: "overpaid", label: "If the customer pays too much", type: "select", options: ["Hold for review", "Accept and refund the difference"], default: "Hold for review" },
      { key: "late", label: "If payment arrives after the link expired", type: "select", options: ["Hold for review", "Refund automatically"], default: "Hold for review" },
      { key: "duplicate", label: "If the same order is paid twice", type: "select", options: ["Hold the second for review", "Refund the second"], default: "Hold the second for review" },
      { key: "verifyWebhook", label: "Verify provider notifications", type: "toggle", default: true, help: "Required. Every notification is signature checked and the status is read back from the provider before it counts." },
    ],
    summary: (c) => `up to ${c.waitMinutes ?? "?"} min`,
  },
  {
    kind: "payment_refund", label: "Refund payment", family: "payment", icon: lucide(Undo),
    desc: "Return all or part of a confirmed payment to the original method. Always needs an approver.",
    schemaVersion: "1", inputs: [P("payment", "payment", "Paid"), P("gate", "signal", "Approval", { optional: true, multi: true })], outputs: [P("refunded", "payment", "Refunded")],
    targets: ["paypal", "stripe", "adyen", "flutterwave", "paystack", "btcpay", "mtn-momo", "custom-payment"], needsConnection: true, adapter: "payments.refund", executable: "demo",
    retry: { max: 1, backoffMs: 5000 }, timeoutSec: 120, onFailure: "stop", destructive: true,
    params: [
      { key: "mode", label: "Refund", type: "select", options: ["Full amount", "Partial amount"], default: "Full amount" },
      { key: "amount", label: "Partial amount", type: "number", default: 0, optional: true },
      { key: "reason", label: "Reason", type: "text", default: "Requested by customer" },
      { key: "requireApproval", label: "Require approval", type: "toggle", default: true, help: "Required. Refunds move money, so a person with the approver role confirms each one." },
    ],
    summary: (c) => `${c.mode ?? "Full amount"}`,
  },
  {
    kind: "send_sms", label: "Send SMS", family: "trigger", icon: lucide(MessageSquare),
    desc: "Send a text message, for example the payment link or a reminder, through Twilio or Africa's Talking.",
    schemaVersion: "1", inputs: [P("message", "message", "Content", { optional: true }), P("gate", "signal", "Trigger", { multi: true })], outputs: [P("sent", "signal", "Sent")],
    targets: ["twilio-sms", "africastalking"], needsConnection: true, adapter: "sms.send", executable: "demo",
    retry: { max: 2, backoffMs: 5000 }, timeoutSec: 60, onFailure: "stop", destructive: true,
    params: [
      { key: "to", label: "To (number or order field)", type: "text", default: "{{order.phone}}", help: "International format. Only send to people who agreed to be contacted." },
      { key: "body", label: "Text", type: "textarea", default: "Hello {{order.name}}, your payment link: {{link}}", help: "{{link}} inserts the payment link." },
      { key: "mode", label: "Delivery", type: "select", options: ["Send after approval", "Send immediately"], default: "Send after approval" },
      { key: "quietHours", label: "Do not send between", type: "text", default: "21:00-08:00", optional: true, help: "Local time of the recipient's country where known." },
    ],
    summary: (c) => `${c.mode ?? "Send after approval"}`,
  },
];


export const MCP_OPERATORS: OperatorDef[] = [
  {
    kind: "mcp_tool", label: "Call MCP tool", family: "agent", icon: lucide(Wrench),
    desc: "Call one tool on an MCP server. Only tools approved on the connection can run, and a tool that changes data waits for approval.",
    schemaVersion: "1", inputs: [P("context", "message", "Context", { optional: true, multi: true }), P("gate", "signal", "Trigger", { optional: true, multi: true })], outputs: [P("result", "message", "Result")],
    targets: ["mcp-http", "mcp-sse", "mcp-stdio"], needsConnection: true, adapter: "mcp.call", executable: "demo",
    retry: { max: 1, backoffMs: 3000 }, timeoutSec: 120, onFailure: "stop",
    params: [
      { key: "tool", label: "Tool name", type: "text", default: "search_issues", help: "Exactly as the server names it. The connection page lists what the server offers." },
      { key: "effect", label: "What the tool does", type: "select", options: ["Reads only", "Changes data"], default: "Reads only", help: "Be honest here. Tools that change data need an approval gate and a connection with write access." },
      { key: "arguments", label: "Arguments (JSON)", type: "textarea", default: "{\n  \"query\": \"{{context}}\"\n}", help: "Placeholders such as {{context}} are filled in at run time and always sent as plain text values." },
      { key: "timeoutSec", label: "Time limit (seconds)", type: "number", default: 60 },
      { key: "onToolError", label: "If the tool reports an error", type: "select", options: ["Stop the run", "Continue with an empty result"], default: "Stop the run" },
      { key: "requireApproval", label: "Ask a person first", type: "toggle", default: false, help: "Always on for tools that change data. Turn on for a read-only tool that returns sensitive data." },
    ],
    summary: (c) => `${c.tool ?? "tool"}, ${String(c.effect ?? "Reads only").toLowerCase()}`,
  },
  {
    kind: "mcp_resource", label: "Read MCP resource", family: "agent", icon: lucide(BookOpen),
    desc: "Read a resource from an MCP server, such as a file, a record or a page, as canonical documents.",
    schemaVersion: "1", inputs: [P("gate", "signal", "Trigger", { optional: true, multi: true })], outputs: [P("documents", "documents", "Documents")],
    targets: ["mcp-http", "mcp-sse", "mcp-stdio"], needsConnection: true, adapter: "mcp.read", executable: "demo",
    retry: { max: 2, backoffMs: 3000 }, timeoutSec: 90, onFailure: "stop",
    params: [
      { key: "uri", label: "Resource address", type: "text", default: "file:///workspace/README.md", help: "The URI the server publishes, or a template the server accepts." },
      { key: "maxResultKb", label: "Largest result (KB)", type: "number", default: 256 },
      { key: "subscribe", label: "Re-run when the resource changes", type: "toggle", default: false },
    ],
    summary: (c) => `${c.uri ?? "resource"}`,
  },
];

OPERATORS.push(...PAYMENT_OPERATORS, ...MCP_OPERATORS);

// ---- Functions and workflows (tok∑ner Functions, design preview) and AWS Lambda
const fnIcon = (name: FnIconName): IconRef => ({ fn: name });
const REV = ["Active revision", "Pinned revision"];
export const FUNCTION_OPERATORS: OperatorDef[] = [
  {
    kind: "invoke_function", label: "Invoke function", family: "function", icon: fnIcon("function"),
    desc: "Call a registered tok∑ner function. Policy, limits and cost attribution apply, and the call keeps the pipeline's correlation id.",
    schemaVersion: "1", inputs: [P("context", "message", "Input", { optional: true, multi: true }), P("gate", "signal", "Trigger", { optional: true, multi: true })], outputs: [P("result", "message", "Result")],
    targets: [], adapter: "function.invoke", executable: "demo", costly: true,
    retry: { max: 1, backoffMs: 2000 }, timeoutSec: 60, onFailure: "stop",
    params: [
      { key: "function", label: "Function", type: "text", default: "fraud-score", help: "The registered name. 3 to 48 lowercase letters, digits and hyphens." },
      { key: "revision", label: "Revision", type: "select", options: REV, default: "Active revision", help: "Pin a revision when a release must not change under a published pipeline." },
      { key: "pinnedRevision", label: "Pinned revision number", type: "number", default: 1, help: "Used when Revision is Pinned revision." },
      { key: "inputMapping", label: "Input (JSON)", type: "textarea", default: "{\n  \"input\": \"{{context}}\"\n}", help: "Placeholders such as {{context}} are filled in at run time and always sent as plain text values." },
      { key: "mode", label: "Mode", type: "select", options: ["Wait for the result", "Asynchronous"], default: "Wait for the result" },
      { key: "timeoutSec", label: "Time limit (seconds)", type: "number", default: 30 },
      { key: "idempotencyKey", label: "Idempotency key", type: "text", default: "{{run.id}}-{{node.id}}", optional: true, help: "Calls with the same key return the first result instead of running twice." },
      { key: "maxCostUsd", label: "Cost ceiling per call (USD)", type: "number", default: 0.02, help: "Stops a call whose estimated cost is above this, on top of the function's own ceiling." },
      { key: "attributeTo", label: "Attribute cost to app", type: "text", default: "Card Risk Engine", help: "Usage and cost are recorded against this app and its tenant." },
      { key: "onError", label: "If the function fails", type: "select", options: ["Stop the run", "Continue with an empty result"], default: "Stop the run" },
    ],
    summary: (c) => `${c.function ?? "function"}, ${String(c.revision ?? "Active revision").toLowerCase()}`,
  },
  {
    kind: "run_workflow", label: "Run workflow", family: "function", icon: fnIcon("workflow"),
    desc: "Start a tok∑ner workflow and optionally wait for it, including any human approval inside it.",
    schemaVersion: "1", inputs: [P("context", "message", "Input", { optional: true, multi: true }), P("gate", "signal", "Trigger", { optional: true, multi: true })], outputs: [P("result", "message", "Result")],
    targets: [], adapter: "workflow.run", executable: "demo", costly: true,
    retry: { max: 0, backoffMs: 0 }, timeoutSec: 3600, onFailure: "stop",
    params: [
      { key: "workflow", label: "Workflow", type: "text", default: "payment-risk" },
      { key: "revision", label: "Revision", type: "select", options: REV, default: "Active revision" },
      { key: "pinnedRevision", label: "Pinned revision number", type: "number", default: 1 },
      { key: "input", label: "Input (JSON)", type: "textarea", default: "{\n  \"payload\": \"{{context}}\"\n}" },
      { key: "waitFor", label: "Wait", type: "select", options: ["Wait for completion", "Start and continue"], default: "Wait for completion" },
      { key: "timeoutSec", label: "Time limit (seconds)", type: "number", default: 3600, help: "Includes time the workflow spends waiting for a person." },
      { key: "onApprovalPending", label: "If the workflow waits for approval", type: "select", options: ["Pause this pipeline", "Fail this step"], default: "Pause this pipeline" },
    ],
    summary: (c) => `${c.workflow ?? "workflow"}, ${String(c.waitFor ?? "Wait for completion").toLowerCase()}`,
  },
  {
    kind: "aws_lambda_invoke", label: "Invoke AWS Lambda", family: "function", icon: si(siAwslambda),
    desc: "Call an AWS Lambda function through a connection. The role is assumed from a secret reference, and the call passes tok∑ner policy and limits.",
    schemaVersion: "1", inputs: [P("context", "message", "Payload", { optional: true, multi: true }), P("gate", "signal", "Trigger", { optional: true, multi: true })], outputs: [P("result", "message", "Result")],
    targets: ["aws-lambda"], needsConnection: true, adapter: "aws.lambda.invoke", executable: "demo", costly: true,
    retry: { max: 2, backoffMs: 2000 }, timeoutSec: 60, onFailure: "stop",
    params: [
      { key: "functionArn", label: "Function ARN", type: "text", default: "arn:aws:lambda:me-central-1:111122223333:function:limits-check", help: "arn:aws:lambda:<region>:<12-digit account>:function:<name>" },
      { key: "qualifier", label: "Version or alias", type: "text", default: "prod", help: "Use a published version or an alias. $LATEST changes under you." },
      { key: "invocationType", label: "Invocation type", type: "select", options: ["Wait for the result (RequestResponse)", "Asynchronous (Event)", "Validate only (DryRun)"], default: "Wait for the result (RequestResponse)" },
      { key: "payload", label: "Payload (JSON)", type: "textarea", default: "{\n  \"customerId\": \"{{context}}\"\n}", help: "Placeholders are filled in at run time and always sent as plain text values." },
      { key: "effect", label: "What the function does", type: "select", options: ["Reads only", "Changes data"], default: "Reads only", help: "Be honest here. A function that changes data needs an approval gate and a connection with write access." },
      { key: "logType", label: "Return logs", type: "select", options: ["None", "Tail (last 4 KB)"], default: "None", help: "Tail returns the last 4 KB of the function log with the result. Logs are redacted before they are stored." },
      { key: "clientContext", label: "Client context (JSON)", type: "textarea", optional: true, default: "", help: "Passed to the function as the client context. Never put secrets here." },
      { key: "timeoutSec", label: "Time limit (seconds)", type: "number", default: 30, help: "Lambda allows at most 900 seconds." },
      { key: "maxPayloadKb", label: "Largest payload (KB)", type: "number", default: 256 },
      { key: "retryOnThrottle", label: "Retry when AWS throttles", type: "toggle", default: true },
      { key: "onFunctionError", label: "If the function reports an error", type: "select", options: ["Stop the run", "Continue with an empty result"], default: "Stop the run" },
      { key: "requireApproval", label: "Ask a person first", type: "toggle", default: false, help: "Always on for a function that changes data." },
    ],
    summary: (c) => `${String(c.functionArn ?? "").split(":").pop() || "function"}:${c.qualifier ?? "?"}`,
  },
];
OPERATORS.push(...FUNCTION_OPERATORS);

export const OP_BY_KIND: Record<string, OperatorDef> = Object.fromEntries(OPERATORS.map((o) => [o.kind, o]));

/** Unused icon names kept referenced so the import list stays stable while operators evolve. */
void [Link2, FileText, Table2, Radio, HardDriveDownload, BoxSelect, siMilvus];

export function defaultConfig(kind: string): Record<string, any> {
  const op = OP_BY_KIND[kind];
  const c: Record<string, any> = {};
  op?.params.forEach((p) => {
    if (p.default !== undefined) c[p.key] = p.default;
  });
  return c;
}
