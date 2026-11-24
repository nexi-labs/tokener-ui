/**
 * What a connection can see in its target system, read without changing anything (POST /connections/{id}:discover). The kinds are the connector's own, so the
 * console offers the usual ones per integration and lets a person type another. The sample workspace answers from a fixed table and reaches nothing.
 */
export type DiscoveryQuery = { kind: string; namespace?: string; limit?: number };
export type Discovered = { ref: { kind: string; namespace?: string; name: string }; attributes: Record<string, string> };
export type DiscoveryResult = { items: Discovered[]; truncated: boolean };

export const DISCOVER_DEFAULT_LIMIT = 50;
export const DISCOVER_MAX_LIMIT = 200;

/** The kinds most often wanted per integration. Not a complete list: a connector can discover more. */
export const DISCOVER_KINDS: Record<string, string[]> = {
  kubernetes: ["Namespace", "Deployment", "InferenceService"], kserve: ["InferenceService", "ServingRuntime"], knative: ["Service", "Revision"], "ray-serve": ["Application"],
  s3: ["bucket", "object"], "oci-registry": ["repository", "image"], mlflow: ["model", "run"], huggingface: ["model", "dataset"], postgres: ["schema", "table"],
  aws: ["Region", "Cluster"], gcp: ["Project", "Cluster"], azure: ["Subscription", "Cluster"], "gpu-nodes": ["Node"], kafka: ["topic"], "mcp-stdio": ["tool"], "custom-http": ["resource"],
};

export function toDiscovery(x: Record<string, any>): DiscoveryResult {
  const items: Discovered[] = Array.isArray(x.items) ? x.items.map((i: any) => ({
    ref: { kind: String(i?.ref?.kind ?? ""), namespace: i?.ref?.namespace ? String(i.ref.namespace) : undefined, name: String(i?.ref?.name ?? "") },
    attributes: Object.fromEntries(Object.entries((i?.attributes ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(v)])),
  })) : [];
  return { items, truncated: x.truncated === true };
}

type Row = [name: string, namespace: string | undefined, attrs: Record<string, string>];
const TABLE: Record<string, Row[]> = {
  "Namespace": [["ml-serving", undefined, { phase: "Active" }], ["ml-staging", undefined, { phase: "Active" }], ["monitoring", undefined, { phase: "Active" }]],
  "Deployment": [["triage-router", "ml-serving", { replicas: "3/3", image: "registry.example/triage:2.4.1" }], ["embeddings-gateway", "ml-serving", { replicas: "2/2", image: "registry.example/emb:1.9.0" }], ["triage-router", "ml-staging", { replicas: "1/1", image: "registry.example/triage:2.5.0-rc1" }]],
  "InferenceService": [["support-classifier", "ml-serving", { ready: "True", runtime: "kserve-huggingfaceserver" }], ["fraud-scorer", "ml-serving", { ready: "True", runtime: "kserve-sklearnserver" }], ["support-classifier", "ml-staging", { ready: "False", runtime: "kserve-huggingfaceserver" }]],
  "ServingRuntime": [["kserve-huggingfaceserver", "ml-serving", { versions: "0.14" }], ["kserve-sklearnserver", "ml-serving", { versions: "0.14" }]],
  "bucket": [["nexi-models", undefined, { region: "eu-west-1", versioning: "on" }], ["nexi-datasets", undefined, { region: "eu-west-1", versioning: "on" }]],
  "object": [["models/support-classifier/v5/model.safetensors", "nexi-models", { size: "1.2 GB" }], ["models/fraud-scorer/v12/model.onnx", "nexi-models", { size: "86 MB" }]],
  "repository": [["triage", "registry.example", { tags: "14" }], ["emb", "registry.example", { tags: "9" }]],
  "image": [["triage:2.4.1", "registry.example", { digest: "sha256:4b1c0a9e", signed: "yes" }], ["triage:2.5.0-rc1", "registry.example", { digest: "sha256:90d2f1ab", signed: "no" }]],
  "model": [["customer-support-classifier", undefined, { versions: "5", stage: "production" }], ["fraud-scorer", undefined, { versions: "12", stage: "production" }]],
  "run": [["run-2291", "support-classifier", { status: "finished" }], ["run-2288", "support-classifier", { status: "failed" }]],
  "dataset": [["support-tickets-unified", undefined, { rows: "489,900" }]],
  "schema": [["public", undefined, { tables: "42" }], ["analytics", undefined, { tables: "17" }]],
  "table": [["tickets", "public", { rows: "2.1M" }], ["customers", "public", { rows: "310k" }]],
  "topic": [["tickets.created", undefined, { partitions: "12" }], ["tickets.labelled", undefined, { partitions: "12" }]],
  "tool": [["search_issues", undefined, { effect: "reads only" }], ["create_issue", undefined, { effect: "changes data" }]],
  "Node": [["gpu-use1-d01", undefined, { gpu: "8 x H200", free: "1" }], ["gpu-use1-d02", undefined, { gpu: "8 x A100 80GB", free: "3" }]],
  "Cluster": [["ml-prod-eu", undefined, { version: "1.31" }], ["ml-stg-eu", undefined, { version: "1.31" }]],
};

/** Answers a discovery from the fixed table. A kind the table does not hold gives an empty list, the same as a target with nothing of that kind. */
export function sampleDiscovery(q: DiscoveryQuery): DiscoveryResult {
  const limit = Math.min(DISCOVER_MAX_LIMIT, Math.max(1, q.limit ?? DISCOVER_DEFAULT_LIMIT));
  const ns = q.namespace?.trim();
  const rows = (TABLE[q.kind.trim()] ?? []).filter(([, n]) => !ns || n === ns);
  return { items: rows.slice(0, limit).map(([name, namespace, attributes]) => ({ ref: { kind: q.kind.trim(), namespace, name }, attributes })), truncated: rows.length > limit };
}

export function validateQuery(q: DiscoveryQuery): string | null {
  if (!q.kind.trim()) return "Say what to look for, for example Deployment or bucket.";
  if (q.kind.length > 64) return "The kind is too long.";
  if (q.namespace && q.namespace.length > 253) return "The namespace is too long.";
  if (q.limit !== undefined && (!Number.isInteger(q.limit) || q.limit < 1 || q.limit > DISCOVER_MAX_LIMIT)) return `Use a limit from 1 to ${DISCOVER_MAX_LIMIT}.`;
  return null;
}
