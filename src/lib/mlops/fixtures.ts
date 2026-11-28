import { INTEGRATIONS } from "./catalog";
import { evaluate } from "./knowledge";
import { OP_BY_KIND, defaultConfig } from "./operators";
import { computeRun, type FailSpec } from "./runtime";
import { autoLayoutSpec, clone, connectPorts, newSpec, specDigest, type PipelineRecord, type PipelineSpec, type SpecNode } from "./spec";
import type { Alert, AuditEvent, BuildAgent, Connection, Deployment, Env, KnowledgeBase, LibraryModel, ModelArtifact, Payment, PipelineRun, RoleId } from "./types";

/** Every record below is seeded demo data. Nothing here corresponds to real infrastructure. */
export const DEMO_ORG = { name: "NexI Corp", slug: "nexi-ai", project: "support-ml" };

export type MlopsSettings = {
  killSwitch: boolean;
  requireProdApproval: boolean;
  requireSignedImages: boolean;
  auditRetentionDays: number;
  secretManager: "vault" | "aws-secrets-manager" | "gcp-secret-manager" | "azure-key-vault";
  allowedRegistries: string[];
  allowProductionAgents: boolean;
  /** Payments. Collecting real money in production stays off until an admin confirms the provider go-live checks. */
  allowPaymentsInProduction: boolean;
  maxPaymentAmount: number;
  allowedPaymentCurrencies: string[];
  /** Blocks approval of a model version whose training data scored below the thresholds. Absent means the defaults. */
  dataQualityGate?: import("./qualityGate").DataQualityGate;
};

export type MlopsState = {
  v: number;
  role: RoleId;
  connections: Connection[];
  models: ModelArtifact[];
  /** Models published by the platform operators for every organization. */
  library: LibraryModel[];
  knowledge: KnowledgeBase[];
  payments: Payment[];
  deployments: Deployment[];
  pipelines: PipelineRecord[];
  runs: PipelineRun[];
  agents: BuildAgent[];
  audit: AuditEvent[];
  alerts: Alert[];
  settings: MlopsSettings;
  /** Precomputed final state for runs the demo executor is revealing progressively. */
  finals?: Record<string, PipelineRun>;
};

export const STATE_VERSION = 8;

const iso = (now: number, minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();

function conn(now: number, c: Partial<Connection> & Pick<Connection, "id" | "name" | "integrationId" | "env" | "endpoint">): Connection {
  const integ = INTEGRATIONS.find((i) => i.id === c.integrationId)!;
  return {
    owner: "ml-platform@nexi.example", scope: `nexi-ai/support-ml/${c.env}`, auth: integ.auth[0], tlsVerify: true, permissions: "read-write", health: "healthy",
    healthDetail: "Connectivity, TLS, authentication and permission checks passed", lastVerifiedAt: iso(now, 9), credentialRotatedAt: iso(now, 60 * 24 * 21),
    capabilities: integ.capabilities.filter((x) => x.level !== "none").map((x) => x.id), demo: true, version: undefined, ...c,
  } as Connection;
}

function buildConnections(now: number): Connection[] {
  return [
    conn(now, { id: "conn-dev-k3d", name: "Local k3d cluster", integrationId: "kubernetes", env: "development", endpoint: "https://127.0.0.1:6443", auth: "k8s-token", secretRef: "secretref://vault/nexi/dev/k3d-token", version: "v1.30.4", owner: "dev-team@nexi.example", permissions: "read-write" }),
    conn(now, { id: "conn-dev-pg", name: "Features DB (dev)", integrationId: "postgres", env: "development", endpoint: "postgres://pg-dev.nexi.internal:5432/features", auth: "basic", secretRef: "secretref://vault/nexi/dev/pg-readonly", permissions: "read-only", health: "failed", healthDetail: "TLS: certificate verify failed, unable to get local issuer certificate. Add the CA bundle.", lastVerifiedAt: iso(now, 31) }),
    conn(now, { id: "conn-dev-docker", name: "Dev workstation Docker", integrationId: "docker-local", env: "development", endpoint: "agent://dev-laptop-docker", auth: "api-token", secretRef: "secretref://vault/nexi/dev/agent-token", version: "Engine 26.1", owner: "dev-team@nexi.example", health: "offline", healthDetail: "Agent offline. Last heartbeat 2 days ago.", lastVerifiedAt: iso(now, 60 * 48) }),
    conn(now, { id: "conn-aws-limits", name: "AWS Lambda, limits service", integrationId: "aws-lambda", env: "staging", endpoint: "arn:aws:iam::111122223333:role/tokener-lambda-invoke", auth: "role-assumption", secretRef: "secretref://aws-sm/nexi/staging/lambda-invoke-external-id", version: "me-central-1", permissions: "read-only", owner: "card-risk@nexi.example" }),
    conn(now, { id: "conn-stg-k8s", name: "Staging EKS", integrationId: "kubernetes", env: "staging", endpoint: "https://staging.eks.nexi.internal", auth: "workload-identity", secretRef: "secretref://aws-sm/nexi/staging/eks-oidc", version: "v1.30.2" }),
    conn(now, { id: "conn-stg-kserve", name: "Staging KServe", integrationId: "kserve", env: "staging", endpoint: "https://staging.eks.nexi.internal", auth: "k8s-token", secretRef: "secretref://aws-sm/nexi/staging/kserve-sa", version: "0.13.1" }),
    conn(now, { id: "conn-stg-registry", name: "Harbor (staging)", integrationId: "oci-registry", env: "staging", endpoint: "https://registry.nexi.example", auth: "basic", secretRef: "secretref://vault/nexi/staging/harbor-robot", version: "OCI v1.1" }),
    conn(now, { id: "conn-stg-mlflow", name: "MLflow tracking", integrationId: "mlflow", env: "staging", endpoint: "https://mlflow.nexi.internal", auth: "api-token", secretRef: "secretref://vault/nexi/staging/mlflow-token", version: "2.14.1" }),
    conn(now, { id: "conn-stg-s3", name: "RAG index bucket", integrationId: "s3", env: "staging", endpoint: "https://minio.nexi.internal", auth: "api-token", secretRef: "secretref://vault/nexi/staging/minio-kb", version: "MinIO RELEASE.2025" }),
    conn(now, { id: "conn-stg-pgvector", name: "pgvector (staging)", integrationId: "pgvector", env: "staging", endpoint: "postgres://pgvector.nexi.internal:5432/kb", auth: "basic", secretRef: "secretref://vault/nexi/staging/pgvector", version: "pgvector 0.7.2", health: "attention", healthDetail: "Credential expires in 12 days. Rotate before it lapses.", credentialExpiresAt: iso(now, -60 * 24 * 12) }),
    conn(now, { id: "conn-stg-prom", name: "Prometheus", integrationId: "prometheus", env: "staging", endpoint: "https://prometheus.nexi.internal", auth: "basic", secretRef: "secretref://vault/nexi/staging/prom-ro", permissions: "read-only", version: "2.53.0" }),
    conn(now, { id: "conn-stg-momo", name: "MTN MoMo sandbox", integrationId: "mtn-momo", env: "staging", endpoint: "https://sandbox.momodeveloper.mtn.com", auth: "api-token", secretRef: "secretref://vault/nexi/staging/momo-collections", version: "Collections v1", owner: "payments@nexi.example", settings: { environment: "sandbox", apiUserId: "6f0c2f9e-3d3a-4a43-9a53-1b0d4f1c7d11", callbackHost: "pay-callbacks.nexi.example" } }),
    conn(now, { id: "conn-stg-paypal", name: "PayPal sandbox", integrationId: "paypal", env: "staging", endpoint: "https://api-m.sandbox.paypal.com", auth: "oidc", secretRef: "secretref://vault/nexi/staging/paypal-rest", version: "Orders v2", owner: "payments@nexi.example", settings: { environment: "sandbox", webhookId: "WH-STAGING-1" } }),
    conn(now, { id: "conn-stg-sms", name: "Twilio messaging", integrationId: "twilio-sms", env: "staging", endpoint: "https://api.twilio.com", auth: "api-token", secretRef: "secretref://vault/nexi/staging/twilio-key", version: "2010-04-01", owner: "payments@nexi.example", settings: { from: "NEXI" } }),
    conn(now, { id: "conn-stg-mcp-issues", name: "Issue tracker MCP", integrationId: "mcp-http", env: "staging", endpoint: "https://mcp.issues.nexi.example/mcp", auth: "oidc", secretRef: "secretref://vault/nexi/staging/mcp-issues", version: "MCP 2026-07-28", owner: "ml-platform@nexi.example", settings: { url: "https://mcp.issues.nexi.example/mcp", protocolVersion: "Negotiate (recommended)", oauthFlow: "Authorization code with PKCE (acts as a person)", clientRegistration: "Pre-registered client", clientId: "tokener-staging", scopes: "issues:read issues:write", toolExposure: "Only tools I approve (recommended)", toolAllowlist: "search_issues\ncreate_issue", toolDenylist: "delete_project", approveWrites: true, pinTools: true, enableResources: true, callTimeoutSec: 60, maxResultKb: 256, redactResults: true } }),
    conn(now, { id: "conn-stg-mcp-files", name: "Workspace files MCP (local)", integrationId: "mcp-stdio", env: "staging", endpoint: "agent://nexi-build-01", auth: "secret-manager", secretRef: "secretref://vault/nexi/staging/mcp-files", version: "MCP stdio", owner: "infra@nexi.example", permissions: "read-only", settings: { agentId: "nexi-build-01", runtime: "Container with no extra privileges (recommended)", image: "registry.nexi.example/mcp/filesystem@sha256:4b1c0a9e", network: "None", filesystem: "Read-only folders listed below", roots: "/srv/workspace", toolExposure: "Read-only tools the server marks as such", lifecycle: "Start when needed, stop afterwards" } }),
    conn(now, { id: "conn-gpu-onprem", name: "On-prem GPU server", integrationId: "linux-agent", env: "staging", endpoint: "agent://nexi-build-01", auth: "mtls", secretRef: "secretref://vault/nexi/staging/agent-mtls", version: "agent 0.4.0-preview", owner: "infra@nexi.example" }),
    conn(now, { id: "conn-prod-k8s", name: "Production GKE", integrationId: "kubernetes", env: "production", endpoint: "https://prod.gke.nexi.internal", auth: "workload-identity", secretRef: "secretref://gcp-sm/nexi/prod/gke-wif", version: "v1.30.5", health: "attention", healthDetail: "Connection verified 2 days ago. Scheduled re-verification is overdue.", lastVerifiedAt: iso(now, 60 * 49) }),
    conn(now, { id: "conn-prod-kserve", name: "Production KServe", integrationId: "kserve", env: "production", endpoint: "https://prod.gke.nexi.internal", auth: "k8s-token", secretRef: "secretref://gcp-sm/nexi/prod/kserve-sa", version: "0.13.1" }),
    conn(now, { id: "conn-prod-registry", name: "Harbor (production)", integrationId: "oci-registry", env: "production", endpoint: "https://registry.nexi.example", auth: "basic", secretRef: "secretref://vault/nexi/prod/harbor-pull", permissions: "read-only", version: "OCI v1.1" }),
    conn(now, { id: "conn-prod-mlflow", name: "MLflow (production, read-only)", integrationId: "mlflow", env: "production", endpoint: "https://mlflow.nexi.internal", auth: "api-token", secretRef: "secretref://vault/nexi/prod/mlflow-ro", permissions: "read-only", version: "2.14.1" }),
    conn(now, { id: "conn-prod-kafka", name: "Events Kafka", integrationId: "kafka", env: "production", endpoint: "kafka://broker-1.nexi.internal:9093", auth: "mtls", secretRef: "secretref://vault/nexi/prod/kafka-mtls", permissions: "read-only", health: "unknown", healthDetail: "Never verified. Run a connectivity test.", lastVerifiedAt: "" }),
    conn(now, { id: "conn-prod-s3-contracts", name: "Contracts bucket", integrationId: "s3", env: "production", endpoint: "https://s3.eu-west-1.amazonaws.com", auth: "role-assumption", secretRef: "secretref://aws-sm/nexi/prod/contracts-reader", permissions: "read-only", version: "eu-west-1", owner: "legal-ops@nexi.example" }),
    conn(now, { id: "conn-prod-s3-claims", name: "Claims inbox bucket", integrationId: "s3", env: "production", endpoint: "https://s3.eu-west-1.amazonaws.com", auth: "role-assumption", secretRef: "secretref://aws-sm/nexi/prod/claims-inbox-reader", permissions: "read-only", version: "eu-west-1", owner: "claims-technology@nexi.example" }),
    conn(now, { id: "conn-prod-redis", name: "Agent context cache (Redis)", integrationId: "redis", env: "production", endpoint: "rediss://ctx.nexi.internal:6380", auth: "basic", secretRef: "secretref://vault/nexi/prod/redis-agent-context", permissions: "read-write", version: "Redis 7.2", owner: "platform@nexi.example" }),
    conn(now, { id: "conn-prod-s3-context", name: "Agent context bucket", integrationId: "s3", env: "production", endpoint: "https://s3.eu-west-1.amazonaws.com", auth: "role-assumption", secretRef: "secretref://aws-sm/nexi/prod/agent-context-rw", permissions: "read-write", version: "eu-west-1", owner: "platform@nexi.example" }),
    conn(now, { id: "conn-prod-slack", name: "Slack workspace", integrationId: "slack", env: "production", endpoint: "https://slack.com/api", auth: "oidc", secretRef: "secretref://vault/nexi/prod/slack-app", version: "Web API", owner: "platform@nexi.example", settings: { workspace: "nexi.slack.com", defaultChannel: "#platform-alerts" } }),
    conn(now, { id: "conn-prod-email", name: "Customer email (SendGrid)", integrationId: "sendgrid", env: "production", endpoint: "https://api.sendgrid.com", auth: "api-token", secretRef: "secretref://vault/nexi/prod/sendgrid-send", permissions: "read-write", version: "Mail Send v3", owner: "support-engineering@nexi.example", settings: { fromDomain: "mail.nexi.example" } }),
    conn(now, { id: "conn-prod-sms", name: "Twilio messaging (production)", integrationId: "twilio-sms", env: "production", endpoint: "https://api.twilio.com", auth: "api-token", secretRef: "secretref://vault/nexi/prod/twilio-key", version: "2010-04-01", owner: "payments@nexi.example", settings: { from: "NEXI" } }),
  ];
}

function buildLibrary(now: number): LibraryModel[] {
  const ver = (version: number, days: number, o: Partial<LibraryModel["versions"][number]>): LibraryModel["versions"][number] => ({
    version, stage: "none", createdAt: iso(now, 60 * 24 * days), createdBy: "platform@tokener.example", framework: "PyTorch 2.3", format: "safetensors", sizeMb: 420,
    checksum: `sha256:${(0x31c0de + version * 4099 + days * 17).toString(16)}a7e15b04d92c6f38e1a05b7c4d83f9026ab1c5e7d4f30982b6${version}`.slice(0, 71),
    provenance: { git: "", repo: "", trainingRun: "", datasetHash: "", builder: "tokener-release", signed: true }, metrics: {},
    approval: { state: "not-required" }, license: "Apache-2.0", notes: "", imports: 0,
    scan: { verdict: "clean", summary: "Content scan found nothing to block.", findings: [{ level: "info", message: "Tensor data only. No code objects." }] }, ...o,
  });
  return [
    { id: "lib-multilingual-embedder", name: "multilingual-embedder", task: "Text embeddings", publisher: "tokener platform team", description: "Sentence embeddings for 50 languages. 768 dimensions. Good default for retrieval.",
      versions: [ver(2, 12, { framework: "ONNX Runtime", format: "onnx", sizeMb: 118, metrics: { recall_at_5: 0.89, p95_ms: 38 }, imports: 14 }), ver(1, 70, { framework: "ONNX Runtime", format: "onnx", sizeMb: 118, metrics: { recall_at_5: 0.86, p95_ms: 41 }, imports: 31 })] },
    { id: "lib-intent-classifier-base", name: "intent-classifier-base", task: "Text classification", publisher: "tokener platform team", description: "A small base classifier to fine tune on your own labels.",
      versions: [ver(1, 33, { sizeMb: 438, metrics: { f1_macro: 0.88, p95_ms: 150 }, imports: 9 })] },
    { id: "lib-small-instruct-q4", name: "small-instruct-q4", task: "Chat and instruction following", publisher: "tokener platform team", description: "A 3B instruction model quantised to 4 bits for CPU and small GPU hosts.",
      versions: [ver(2, 20, { framework: "llama.cpp", format: "gguf", sizeMb: 1900, license: "Llama community license. Review required", metrics: { mmlu: 0.58 }, imports: 5, scan: { verdict: "warnings", summary: "Content scan passed with notes.", findings: [{ level: "warn", message: "License carries use restrictions. Record a legal review before production approval." }] } }),
        ver(1, 90, { framework: "llama.cpp", format: "gguf", sizeMb: 1900, withdrawn: true, notes: "Withdrawn. Tokenizer mismatch.", approval: { state: "rejected", by: "platform@tokener.example", note: "Withdrawn from the library" } })] },
  ];
}

function buildPayments(now: number): Payment[] {
  const ev = (m: number, kind: string, detail: string) => ({ id: `pe-${m}-${kind}`, at: iso(now, m), kind, detail });
  const base = (id: string, o: Partial<Payment> & Pick<Payment, "orderRef" | "amountMinor" | "currency" | "state" | "provider" | "connectionId">, m: number): Payment => ({
    id, env: "staging", refundedMinor: 0, createdAt: iso(now, m), updatedAt: iso(now, Math.max(1, m - 3)), expiresAt: iso(now, m - 60 * 24), events: [ev(m, "created", "Payment created for the order")], refunds: [], ...o,
  });
  return [
    base("pay-1041", { provider: "MTN MoMo", connectionId: "conn-stg-momo", orderRef: "ORD-7712", amountMinor: 4500, currency: "EUR", state: "paid", paidMinor: 4500, paidAt: iso(now, 55), providerTxn: "sandbox-7f3a91", events: [ev(95, "created", "Payment created for the order"), ev(94, "link-sent", "Pay link sent by SMS"), ev(56, "provider-fact", "Provider reported SUCCESSFUL"), ev(55, "paid", "Amount matches the order. Fulfilment may start")] }, 95),
    base("pay-1042", { provider: "MTN MoMo", connectionId: "conn-stg-momo", orderRef: "ORD-7713", amountMinor: 12000, currency: "EUR", state: "review", reviewReason: "underpaid", paidMinor: 10000, paidAt: iso(now, 30), providerTxn: "sandbox-81bb02", events: [ev(70, "created", "Payment created for the order"), ev(69, "link-sent", "Pay link sent by SMS"), ev(31, "provider-fact", "Provider reported SUCCESSFUL for 100.00"), ev(30, "review", "Received 100.00 for an order of 120.00. Held for a person")] }, 70),
    base("pay-1043", { provider: "PayPal", connectionId: "conn-stg-paypal", orderRef: "ORD-7720", amountMinor: 2500, currency: "USD", state: "pending", events: [ev(12, "created", "Payment created for the order"), ev(11, "link-sent", "Pay link sent by email")] }, 12),
    base("pay-1044", { provider: "PayPal", connectionId: "conn-stg-paypal", orderRef: "ORD-7690", amountMinor: 7900, currency: "USD", state: "refund-pending", paidMinor: 7900, paidAt: iso(now, 60 * 30), refundedMinor: 0, providerTxn: "5TY05013RG002845M",
      events: [ev(60 * 31, "created", "Payment created for the order"), ev(60 * 30, "paid", "Amount matches the order"), ev(60 * 3, "refund-requested", "Refund of 79.00 requested by priya.nair@nexi.example")],
      refunds: [{ id: "rf-221", paymentId: "pay-1044", amountMinor: 7900, reason: "Customer cancelled within the return window", state: "awaiting-approval", requestedBy: "priya.nair@nexi.example", createdAt: iso(now, 60 * 3), updatedAt: iso(now, 60 * 3) }] }, 60 * 31),
    base("pay-1045", { provider: "MTN MoMo", connectionId: "conn-stg-momo", orderRef: "ORD-7651", amountMinor: 3000, currency: "EUR", state: "refunded", paidMinor: 3000, paidAt: iso(now, 60 * 70), refundedMinor: 3000, providerTxn: "sandbox-6a10c4",
      events: [ev(60 * 71, "created", "Payment created for the order"), ev(60 * 70, "paid", "Amount matches the order"), ev(60 * 40, "refund-requested", "Refund requested"), ev(60 * 39, "refund-approved", "Approved by marcus.lee@nexi.example"), ev(60 * 39 - 2, "refunded", "Provider confirmed the refund")],
      refunds: [{ id: "rf-198", paymentId: "pay-1045", amountMinor: 3000, reason: "Duplicate order", state: "completed", requestedBy: "priya.nair@nexi.example", approvedBy: "marcus.lee@nexi.example", providerRef: "sandbox-rf-91c", createdAt: iso(now, 60 * 40), updatedAt: iso(now, 60 * 39) }] }, 60 * 71),
    base("pay-1048", { provider: "PayPal", connectionId: "conn-stg-paypal", orderRef: "ORD-7702", amountMinor: 6400, currency: "USD", state: "refund-pending", paidMinor: 6400, paidAt: iso(now, 60 * 26), refundedMinor: 0, providerTxn: "8UB44113KD772910P",
      events: [ev(60 * 27, "created", "Payment created for the order"), ev(60 * 26, "paid", "Amount matches the order"), ev(60 * 5, "refund-requested", "Refund requested"), ev(60 * 4, "refund-approved", "Approved by marcus.lee@nexi.example"), ev(60 * 4 - 3, "refund-failed", "The provider could not return the money: the card was closed")],
      refunds: [{ id: "rf-230", paymentId: "pay-1048", amountMinor: 6400, reason: "Order damaged in transit", state: "failed", requestedBy: "priya.nair@nexi.example", approvedBy: "marcus.lee@nexi.example", createdAt: iso(now, 60 * 5), updatedAt: iso(now, 60 * 4) }] }, 60 * 27),
    base("pay-1046", { provider: "PayPal", connectionId: "conn-stg-paypal", orderRef: "ORD-7655", amountMinor: 1800, currency: "USD", state: "expired", events: [ev(60 * 52, "created", "Payment created for the order"), ev(60 * 28, "expired", "Pay link expired with no payment")] }, 60 * 52),
    base("pay-1047", { provider: "MTN MoMo", connectionId: "conn-stg-momo", orderRef: "ORD-7733", amountMinor: 90000, currency: "EUR", state: "blocked", reviewReason: "over-threshold", events: [ev(200, "created", "Payment created for the order"), ev(200, "blocked", "Amount is above the organization maximum. No link was created")] }, 200),
  ];
}

function buildKnowledge(now: number): KnowledgeBase[] {
  const ch = (source: string, n: number, text: string, o: { heading?: string; page?: number; days?: number } = {}) => ({ id: `${source}-${n}`, source, text, heading: o.heading, page: o.page, updatedAt: iso(now, 60 * 24 * (o.days ?? 3)) });
  const support = [
    ch("password-reset.md", 1, "To reset your password, open the sign in page and choose Forgot password. Enter the email on your account and we send a reset link that is valid for 30 minutes. If the email does not arrive, check spam and confirm the address.", { heading: "Reset your password", days: 4 }),
    ch("password-reset.md", 2, "Accounts that use single sign on cannot reset a password here. Ask your identity administrator to reset it in your company directory. After three failed sign in attempts the account is locked for 15 minutes.", { heading: "Single sign on and lockouts", days: 4 }),
    ch("refund-policy.pdf", 1, "Refunds are available within 30 days of purchase for unused subscriptions. Annual plans are refunded pro rata after the first 30 days. Refunds go back to the original payment method within 5 to 10 business days.", { heading: "Who can get a refund", page: 2, days: 12 }),
    ch("refund-policy.pdf", 2, "To request a refund, contact support with your order number. A second person approves every refund above 500 before it is sent. Gift cards and add ons that were already used are not refundable.", { heading: "How to request a refund", page: 3, days: 12 }),
    ch("shipping-times.md", 1, "Standard shipping takes 3 to 5 business days within the country and 7 to 14 business days internationally. Express shipping is available at checkout and arrives in 1 to 2 business days.", { heading: "Delivery times", days: 20 }),
    ch("shipping-times.md", 2, "Orders placed before 14:00 ship the same business day. You receive a tracking link by email when the parcel leaves the warehouse. Customs fees on international orders are paid by the recipient.", { heading: "Cut off and tracking", days: 20 }),
    ch("api-rate-limits.md", 1, "The API allows 600 requests per minute per key. Requests above the limit receive status 429 with a Retry-After header. Use exponential backoff and spread bursts across the minute.", { heading: "Rate limits", days: 2 }),
    ch("api-rate-limits.md", 2, "Enterprise plans can raise the limit. Contact your account manager with the key name and the peak rate you need. Limits are applied per key, not per account, so separate workloads should use separate keys.", { heading: "Raising a limit", days: 2 }),
    ch("data-export.md", 1, "You can export your data as CSV or JSON from Settings, then Data. Exports are prepared in the background and a download link is emailed when ready. Links expire after 24 hours.", { heading: "Export your data", days: 30 }),
    ch("data-export.md", 2, "To delete your account and all stored data, submit a deletion request from Settings. Deletion completes within 30 days. Billing records are kept for the period the law requires.", { heading: "Delete your account", days: 30 }),
  ];
  const hr = [
    ch("leave-policy.pdf", 1, "Full time employees receive 25 days of paid annual leave per year, plus public holidays. Leave accrues monthly and up to 5 days can be carried into the next year with manager approval.", { heading: "Annual leave", page: 1, days: 60 }),
    ch("leave-policy.pdf", 2, "Sick leave is paid for up to 10 days per year. A medical certificate is required after 3 consecutive days. Parental leave is 16 weeks for the primary carer and 4 weeks for the other parent.", { heading: "Sick and parental leave", page: 2, days: 60 }),
    ch("expenses.pdf", 1, "Submit expenses within 30 days with receipts. Meals while travelling are reimbursed up to 60 per day. Flights above 800 need approval from a director before booking.", { heading: "Claiming expenses", page: 1, days: 95 }),
    ch("remote-work.md", 1, "Employees may work remotely up to three days a week with their manager's agreement. Working from another country for more than 14 days needs approval from People Operations because of tax and legal rules.", { heading: "Remote and hybrid work", days: 40 }),
  ];
  const claims = [
    ch("claims-handbook.pdf", 1, "A claim must be reported within 7 days of the loss. A late report can be accepted when the policyholder shows a good reason, and the adjuster records it. Repair estimates and invoices must be dated after the date of loss.", { heading: "Reporting and dates", page: 3 }),
    ch("claims-handbook.pdf", 2, "A payout above 5,000 needs a second person's approval. An adjuster who prepared the decision cannot be the second approver. Every payout subtracts the policy excess from the amount found payable.", { heading: "Approval limits", page: 7 }),
    ch("claims-handbook.pdf", 3, "If an invoice is dated before the loss, or the invoice total does not match its lines, do not approve. Ask the policyholder and the contractor to explain, and record what was said.", { heading: "Inconsistent documents", page: 9 }),
    ch("baggage-cover.pdf", 1, "Baggage cover pays the replacement value less wear, up to the per-item limit on the schedule. Receipts are required for items above 100. A report to the carrier must exist for lost baggage.", { heading: "Lost baggage", page: 2 }),
    ch("property-water.pdf", 1, "Sudden escape of water from a fixed pipe is covered. Damage that built up slowly, and damage from faulty workmanship, is not. The escaped water limit and excess are on the policy schedule.", { heading: "Escaped water", page: 4 }),
    ch("motor-collision.pdf", 1, "Where a third party is at fault, pay the repair cost and recover it from the third party's insurer. The excess is returned to the policyholder when the recovery succeeds.", { heading: "Third party at fault", page: 5 }),
  ];
  const run = (id: string, minutes: number, o: Partial<KnowledgeBase["runs"][number]> & Pick<KnowledgeBase["runs"][number], "state" | "trigger">): KnowledgeBase["runs"][number] => ({ id, startedAt: iso(now, minutes), durationSec: 94, added: 0, updated: 0, removed: 0, skipped: 0, failed: 0, tokens: 0, notes: [], ...o });
  const q = (n: number, question: string, expectedSource: string) => ({ id: `q${n}`, question, expectedSource });
  const supportQs = [
    q(1, "How do I reset my password?", "password-reset.md"), q(2, "Why is my account locked?", "password-reset.md"), q(3, "Can I get my money back for an annual plan?", "refund-policy.pdf"),
    q(4, "How long does international shipping take?", "shipping-times.md"), q(5, "What happens when I hit the API rate limit?", "api-rate-limits.md"), q(6, "How do I download all my data?", "data-export.md"),
    q(7, "Who is the CEO of the company?", "none"), q(8, "Do you offer a student discount?", "none"),
  ];
  const baseAccess = { aclAware: true, requireCitations: true, minScore: 0.35, topK: 5 };
  const kb = (o: Partial<KnowledgeBase> & Pick<KnowledgeBase, "id" | "name" | "description" | "status" | "sources" | "stats" | "runs" | "chunks">): KnowledgeBase => ({
    env: "staging", owner: "support-ml@nexi.example", createdAt: iso(now, 60 * 24 * 40),
    processing: { splitOn: "structure", chunkTokens: 512, overlap: 64, maskPii: true }, embedding: { model: "support-embedder v2", dimension: 768 },
    index: { connectionId: "conn-stg-pgvector", collection: o.id.replace(/-/g, "_"), metric: "cosine" }, schedule: "daily",
    access: { projects: ["support-ml"], ...baseAccess }, evalQuestions: [], evalRuns: [], demo: true, ...o,
  });
  const supportKb = kb({
    id: "support-articles", name: "Support articles", description: "Help center articles that the support assistant answers from.", status: "ready",
    sources: [
      { id: "src-help", name: "Help center bucket", kind: "object-store", connectionId: "conn-stg-s3", path: "kb/help-center/", include: "*.md, *.pdf", documents: 5, lastSyncAt: iso(now, 55), status: "synced" },
      { id: "src-upload", name: "Uploaded policies", kind: "upload", documents: 1, lastSyncAt: iso(now, 60 * 24 * 12), status: "synced" },
    ],
    stats: { documents: 6, chunks: support.length, tokens: 4_380, sizeMb: 1.8, lastSyncAt: iso(now, 55), staleDocuments: 0 },
    runs: [run("kr-4", 55, { state: "succeeded", trigger: "schedule", updated: 1, tokens: 820, durationSec: 41 }), run("kr-3", 60 * 24 + 55, { state: "succeeded", trigger: "schedule", tokens: 0, durationSec: 22 }), run("kr-2", 60 * 24 * 4, { state: "succeeded", trigger: "manual", added: 2, updated: 1, tokens: 1_900, durationSec: 77 }), run("kr-1", 60 * 24 * 40, { state: "succeeded", trigger: "upload", added: 6, tokens: 4_380, durationSec: 128 })],
    chunks: support, evalQuestions: supportQs,
  });
  supportKb.evalRuns = [evaluate(supportKb, "priya.nair@nexi.example", iso(now, 60 * 24 * 4), "ke-1")];
  const hrKb = kb({
    id: "hr-policies", name: "HR policies", description: "Leave, expenses and remote work policies for employee questions.", status: "degraded", env: "staging", owner: "people-ops@nexi.example", schedule: "hourly",
    index: { connectionId: "conn-stg-pgvector", collection: "hr_policies", metric: "cosine" },
    access: { projects: ["people-assistant"], aclAware: true, requireCitations: true, minScore: 0.4, topK: 4 },
    sources: [
      { id: "src-hr", name: "People shared drive", kind: "object-store", connectionId: "conn-stg-s3", path: "hr/policies/", include: "*.pdf, *.md", documents: 4, lastSyncAt: iso(now, 60 * 30), status: "failed", error: "Access denied reading hr/policies/. The credential no longer has read access to this path." },
    ],
    stats: { documents: 4, chunks: hr.length, tokens: 1_240, sizeMb: 0.9, lastSyncAt: iso(now, 60 * 30), staleDocuments: 2 },
    runs: [run("kr-h3", 60 * 30, { state: "failed", trigger: "schedule", failed: 4, durationSec: 6, notes: ["Access denied reading hr/policies/. Nothing was changed in the index."] }), run("kr-h2", 60 * 31, { state: "partial", trigger: "schedule", updated: 1, skipped: 1, tokens: 300, notes: ["expenses.pdf was skipped: the file is password protected."] }), run("kr-h1", 60 * 24 * 60, { state: "succeeded", trigger: "upload", added: 4, tokens: 1_240 })],
    chunks: hr,
    evalQuestions: [q(1, "How many days of annual leave do I get?", "leave-policy.pdf"), q(2, "Can I work from another country?", "remote-work.md"), q(3, "What is the meal allowance when travelling?", "expenses.pdf"), q(4, "What is the stock option plan?", "none")],
  });
  const claimsKb = kb({
    id: "claims-guidelines", name: "Claims guidelines", description: "Approval limits, cover wording and handling rules for claims adjusters and the claims agent.", status: "ready", env: "production", owner: "claims-technology@nexi.example", schedule: "daily",
    index: { connectionId: "conn-stg-pgvector", collection: "claims_guidelines", metric: "cosine" },
    access: { projects: ["claims-ops"], aclAware: true, requireCitations: true, minScore: 0.4, topK: 4 },
    sources: [{ id: "src-claims", name: "Claims handbook", kind: "object-store", connectionId: "conn-prod-s3-claims", path: "guidelines/", include: "*.pdf", documents: 4, lastSyncAt: iso(now, 180), status: "synced" }],
    stats: { documents: 4, chunks: claims.length, tokens: 1_960, sizeMb: 1.2, lastSyncAt: iso(now, 180), staleDocuments: 0 },
    runs: [run("kr-c2", 180, { state: "succeeded", trigger: "schedule", updated: 0, tokens: 0, durationSec: 19 })], chunks: claims,
    evalQuestions: [q(1, "When does a payout need a second approval?", "claims-handbook.pdf"), q(2, "What if the invoice is dated before the loss?", "claims-handbook.pdf"), q(3, "Is lost baggage covered without a receipt?", "baggage-cover.pdf"), q(4, "What is the CEO's phone number?", "none")],
  });
  const empty = kb({
    id: "product-docs", name: "Product documentation", description: "Public product documentation for the developer assistant.", status: "empty", sources: [],
    stats: { documents: 0, chunks: 0, tokens: 0, sizeMb: 0, staleDocuments: 0 }, runs: [], chunks: [], env: "development", embedding: { model: "multilingual-embedder v2 (library)", dimension: 768 }, schedule: "manual",
  });
  return [supportKb, hrKb, claimsKb, empty];
}

function buildModels(now: number): ModelArtifact[] {
  const prov = (git: string, run: string, ds: string, signed = true) => ({ git, repo: "github.com/nexi-ai/support-classifier", trainingRun: run, datasetHash: ds, builder: "nexi-build-01", signed });
  const v = (version: number, stage: ModelArtifact["versions"][number]["stage"], days: number, f1: number, approval: ModelArtifact["versions"][number]["approval"], extra: Partial<ModelArtifact["versions"][number]> = {}): ModelArtifact["versions"][number] => ({
    version, stage, createdAt: iso(now, 60 * 24 * days), createdBy: "priya.nair@nexi.example", framework: "PyTorch 2.3", format: "safetensors", sizeMb: 438 + version * 3,
    checksum: `sha256:${(0x9d1c4a + version * 7919).toString(16)}e2b8a60c1f4d7a95b3c08e6d12f7a4b9c5d03e81${version}`.slice(0, 71),
    provenance: prov(`${(0x4f2a91c + version * 1291).toString(16)}b`.slice(0, 7), `run-${2100 + version * 17}`, `sha256:${(0x77ab31 + version * 31).toString(16)}d9`, version !== 2),
    metrics: { f1_macro: f1, accuracy: Math.round((f1 + 0.012) * 1000) / 1000, p95_ms: 180 - version * 6 }, approval, license: "Apache-2.0", notes: "", ...extra,
  });
  return [
    {
      id: "customer-support-classifier", name: "customer-support-classifier", task: "Ticket routing and intent classification", owner: "support-ml@nexi.example", demo: true,
      description: "Classifies inbound support tickets into 24 intents and priority levels.",
      versions: [
        v(5, "none", 1, 0.941, { state: "pending", note: "Retrained on the October export. Requested staging promotion." }, { notes: "Retrained on the October ticket export, which has more empty subjects and repeated rows.", trainingData: { datasetId: "ds_support_oct", datasetName: "support_tickets_october", datasetVersion: 2, quality: 72, reportId: "RPT-RUN-0121", measuredAt: iso(now, 60 * 24) } }),
        v(4, "staging", 3, 0.934, { state: "pending", note: "Requested production promotion. Waiting for an approver." }, { notes: "Adds multilingual tickets. Canary running in staging.", trainingData: { datasetId: "ds_support_raw", datasetName: "support_tickets_raw", datasetVersion: 14, quality: 91, reportId: "RPT-RUN-0114", measuredAt: iso(now, 60 * 24 * 4) } }),
        v(3, "production", 24, 0.921, { state: "approved", by: "marcus.lee@nexi.example", at: iso(now, 60 * 24 * 22), note: "Approved after offline eval and 7 day staging soak." }),
        v(2, "archived", 58, 0.903, { state: "approved", by: "marcus.lee@nexi.example", at: iso(now, 60 * 24 * 56) }, { notes: "Image signature missing. Superseded by v3." }),
        v(1, "archived", 96, 0.871, { state: "not-required" }),
      ],
    },
    {
      id: "support-embedder", name: "support-embedder", task: "Text embeddings for knowledge retrieval", owner: "support-ml@nexi.example", demo: true,
      description: "768 dimension sentence embedding model used by the retrieval workflow.",
      versions: [
        v(2, "staging", 9, 0.0, { state: "approved", by: "marcus.lee@nexi.example", at: iso(now, 60 * 24 * 8) }, { framework: "ONNX Runtime", format: "onnx", sizeMb: 91, metrics: { recall_at_5: 0.884, mrr: 0.71, p95_ms: 42 } }),
        v(1, "production", 40, 0.0, { state: "approved", by: "marcus.lee@nexi.example", at: iso(now, 60 * 24 * 38) }, { framework: "ONNX Runtime", format: "onnx", sizeMb: 91, metrics: { recall_at_5: 0.861, mrr: 0.69, p95_ms: 47 } }),
      ],
    },
    {
      id: "ticket-summarizer", name: "ticket-summarizer", task: "Abstractive summaries of long ticket threads", owner: "support-ml@nexi.example", demo: true,
      description: "Third-party base model mirrored from a public hub. License review required before approval.",
      versions: [
        v(1, "none", 2, 0.0, { state: "pending", note: "License is a custom community license. Legal review required before any production use." }, { framework: "Transformers", format: "safetensors", sizeMb: 3120, license: "Custom community license (review required)", metrics: { rouge_l: 0.41, p95_ms: 640 }, provenance: { git: "hf-rev 8c1d2a0", repo: "hf://nexi-mirror/ticket-summarizer", trainingRun: "n/a (third-party base)", datasetHash: "n/a", builder: "hf-resolver", signed: false } }),
      ],
    },
  ];
}

function buildDeployments(now: number): Deployment[] {
  const d = (x: Partial<Deployment> & Pick<Deployment, "id" | "name" | "modelId" | "version" | "env" | "connectionId" | "endpoint">): Deployment => ({
    runtime: "kserve-huggingface", health: "healthy", healthDetail: "All replicas ready. Probes passing.", replicas: { desired: 3, ready: 3, min: 2, max: 6 },
    resources: { cpu: "2", memory: "4Gi", gpu: "0" }, traffic: { stable: 100, canary: 0 }, rollout: { state: "completed", strategy: "canary" }, rollbackAvailable: true,
    createdAt: iso(now, 60 * 24 * 30), updatedAt: iso(now, 60 * 5), demo: true, ...x,
  });
  return [
    d({ id: "dep-prod", name: "support-classifier-prod", modelId: "customer-support-classifier", version: 3, env: "production", connectionId: "conn-prod-kserve", endpoint: "https://ml.nexi.example/v1/models/support-classifier", replicas: { desired: 4, ready: 4, min: 3, max: 8 }, resources: { cpu: "2", memory: "4Gi", gpu: "0" }, previousVersion: 2, pipelineId: "pl-prod-promote", updatedAt: iso(now, 60 * 24 * 22) }),
    d({ id: "dep-stg", name: "support-classifier-staging", modelId: "customer-support-classifier", version: 4, env: "staging", connectionId: "conn-stg-kserve", endpoint: "https://staging.ml.nexi.example/v1/models/support-classifier", health: "progressing", healthDetail: "Canary at 10 percent. Observing for 10 minutes.", traffic: { stable: 90, canary: 10, canaryVersion: 4 }, rollout: { state: "in-progress", strategy: "canary", startedAt: iso(now, 4) }, previousVersion: 3, pipelineId: "pl-release", replicas: { desired: 3, ready: 3, min: 2, max: 6 }, updatedAt: iso(now, 4) }),
    d({ id: "dep-dev", name: "support-classifier-dev", modelId: "customer-support-classifier", version: 4, env: "development", connectionId: "conn-dev-k3d", endpoint: "http://localhost:8080/v1/models/support-classifier", runtime: "custom-container", replicas: { desired: 1, ready: 1, min: 1, max: 1 }, resources: { cpu: "1", memory: "2Gi", gpu: "0" }, rollout: { state: "idle", strategy: "recreate" }, rollbackAvailable: false, updatedAt: iso(now, 60 * 30) }),
    d({ id: "dep-emb-stg", name: "support-embedder-staging", modelId: "support-embedder", version: 2, env: "staging", connectionId: "conn-stg-k8s", endpoint: "https://staging.ml.nexi.example/v1/models/support-embedder", runtime: "custom-container", health: "attention", healthDetail: "1 of 2 replicas pending: 0/6 nodes available, insufficient nvidia.com/gpu.", replicas: { desired: 2, ready: 1, min: 1, max: 3 }, resources: { cpu: "4", memory: "8Gi", gpu: "1" }, previousVersion: 1, updatedAt: iso(now, 60 * 3) }),
    d({ id: "dep-sum-stg", name: "ticket-summarizer-staging", modelId: "ticket-summarizer", version: 1, env: "staging", connectionId: "conn-stg-k8s", endpoint: "https://staging.ml.nexi.example/v1/models/ticket-summarizer", runtime: "custom-container", accelerator: { engine: "vllm", gpu: "L4", count: 1, cuda: "12.4" }, health: "failed", healthDetail: "ImagePullBackOff: 401 unauthorized pulling image digest. Check registry credential.", replicas: { desired: 1, ready: 0, min: 1, max: 1 }, resources: { cpu: "8", memory: "24Gi", gpu: "1" }, rollout: { state: "failed", strategy: "recreate" }, rollbackAvailable: false, updatedAt: iso(now, 60 * 2) }),
  ];
}

// ------------------------------------------------------------------ pipelines

function mk(spec: PipelineSpec, id: string, kind: string, patch: Partial<SpecNode> & { config?: Record<string, any> } = {}): PipelineSpec {
  const op = OP_BY_KIND[kind];
  const n: SpecNode = { id, operator: kind, schemaVersion: op.schemaVersion, name: patch.name ?? op.label, x: 0, y: 0, config: { ...defaultConfig(kind), ...(patch.config ?? {}) }, connection: patch.connection, onFailure: patch.onFailure };
  return { ...spec, nodes: [...spec.nodes, n] };
}
function link(spec: PipelineSpec, from: string, fp: string, to: string, tp: string): PipelineSpec {
  const r = connectPorts(spec, from, fp, to, tp);
  if (r.error) throw new Error(`fixture edge ${from}.${fp} -> ${to}.${tp}: ${r.error}`);
  return r.spec;
}

export function releaseSpec(): PipelineSpec {
  let s = newSpec("support-classifier-release", "staging", "priya.nair@nexi.example");
  s.metadata.description = "Build, validate, register and canary the support classifier in staging.";
  s = mk(s, "git-source-1", "git_source", { name: "Source" });
  s = mk(s, "build-image-1", "build_image", { name: "Build", connection: "conn-stg-registry" });
  s = mk(s, "validate-artifact-1", "validate_artifact", { name: "Validate" });
  s = mk(s, "register-model-1", "register_model", { name: "Register", connection: "conn-stg-mlflow" });
  s = mk(s, "canary-rollout-1", "canary_rollout", { name: "Deploy canary", connection: "conn-stg-kserve" });
  s = mk(s, "verify-endpoint-1", "verify_endpoint", { name: "Verify" });
  s = mk(s, "promote-1", "promote", { name: "Promote" });
  s = mk(s, "notify-1", "notify", { name: "Notify" });
  s = link(s, "git-source-1", "source", "build-image-1", "source");
  s = link(s, "build-image-1", "image", "validate-artifact-1", "image");
  s = link(s, "build-image-1", "image", "register-model-1", "image");
  s = link(s, "validate-artifact-1", "report", "register-model-1", "gate");
  s = link(s, "register-model-1", "model", "canary-rollout-1", "model");
  s = link(s, "canary-rollout-1", "endpoint", "verify-endpoint-1", "endpoint");
  s = link(s, "canary-rollout-1", "endpoint", "promote-1", "endpoint");
  s = link(s, "verify-endpoint-1", "report", "promote-1", "gate");
  s = link(s, "promote-1", "endpoint", "notify-1", "signal");
  return autoLayoutSpec(s);
}

export function prodSpec(): PipelineSpec {
  let s = newSpec("support-classifier-prod-promote", "production", "marcus.lee@nexi.example");
  s.metadata.description = "Promote an approved model version to production behind an approval gate.";
  s = mk(s, "registry-model-1", "registry_model", { name: "Approved model", connection: "conn-prod-mlflow", config: { version: 4 } });
  s = mk(s, "approval-gate-1", "approval_gate", { name: "Approval" });
  s = mk(s, "canary-rollout-1", "canary_rollout", { name: "Deploy canary", connection: "conn-prod-kserve", config: { percent: 5, replicasMin: 3 } });
  s = mk(s, "verify-endpoint-1", "verify_endpoint", { name: "Verify" });
  s = mk(s, "promote-1", "promote", { name: "Promote" });
  s = mk(s, "notify-1", "notify", { name: "Notify" });
  s = link(s, "registry-model-1", "model", "approval-gate-1", "in");
  s = link(s, "registry-model-1", "model", "canary-rollout-1", "model");
  s = link(s, "approval-gate-1", "approval", "canary-rollout-1", "gate");
  s = link(s, "canary-rollout-1", "endpoint", "verify-endpoint-1", "endpoint");
  s = link(s, "canary-rollout-1", "endpoint", "promote-1", "endpoint");
  s = link(s, "verify-endpoint-1", "report", "promote-1", "gate");
  s = link(s, "promote-1", "endpoint", "notify-1", "signal");
  return autoLayoutSpec(s);
}

export function agentSpec(): PipelineSpec {
  let s = newSpec("support-retrieval-assistant", "staging", "priya.nair@nexi.example");
  s.metadata.description = "Ingest the RAG index, build a vector index and serve a retrieval assistant through the gateway.";
  s = mk(s, "ingest-documents-1", "ingest_documents", { name: "Ingest", connection: "conn-stg-s3" });
  s = mk(s, "store-documents-1", "store_documents", { name: "Store", connection: "conn-stg-s3" });
  s = mk(s, "chunk-embed-1", "chunk_embed", { name: "Embed" });
  s = mk(s, "vector-index-1", "vector_index", { name: "Vector index", connection: "conn-stg-pgvector" });
  s = mk(s, "retrieve-1", "retrieve", { name: "Retrieve" });
  s = mk(s, "agent-service-1", "agent_service", { name: "Serve agent", connection: "conn-stg-k8s" });
  s = mk(s, "monitor-1", "monitor", { name: "Observe", connection: "conn-stg-prom" });
  s = link(s, "ingest-documents-1", "documents", "store-documents-1", "documents");
  s = link(s, "store-documents-1", "documents", "chunk-embed-1", "documents");
  s = link(s, "chunk-embed-1", "embeddings", "vector-index-1", "embeddings");
  s = link(s, "vector-index-1", "index", "retrieve-1", "index");
  s = link(s, "retrieve-1", "documents", "agent-service-1", "documents");
  s = link(s, "agent-service-1", "endpoint", "monitor-1", "endpoint");
  return autoLayoutSpec(s);
}

export function briefingSpec(): PipelineSpec {
  let s = newSpec("morning-briefing-agent", "staging", "priya.nair@nexi.example");
  s.metadata.description = "Each weekday at 08:00, read today's calendar and unread mail, draft a briefing with a model, and save it as a draft after approval.";
  s = mk(s, "schedule-trigger-1", "schedule_trigger", { name: "Weekdays 08:00", config: { timezone: "Asia/Bahrain" } });
  s = mk(s, "time-window-1", "time_window", { name: "Business hours", config: { timezone: "Asia/Bahrain", from: "07:30", to: "17:00" } });
  s = mk(s, "calendar-read-1", "calendar_read", { name: "Today's calendar" });
  s = mk(s, "email-inbox-1", "email_inbox", { name: "Unread mail" });
  s = mk(s, "llm-step-1", "llm_step", { name: "Draft the briefing" });
  s = mk(s, "approval-gate-1", "approval_gate", { name: "Approve" });
  s = mk(s, "send-email-1", "send_email", { name: "Save draft", config: { mode: "Save as draft", to: "priya.nair@nexi.example" } });
  s = link(s, "schedule-trigger-1", "tick", "time-window-1", "in");
  s = link(s, "time-window-1", "open", "calendar-read-1", "when");
  s = link(s, "time-window-1", "open", "email-inbox-1", "when");
  s = link(s, "calendar-read-1", "events", "llm-step-1", "context");
  s = link(s, "email-inbox-1", "messages", "llm-step-1", "context");
  s = link(s, "llm-step-1", "reply", "approval-gate-1", "in");
  s = link(s, "llm-step-1", "reply", "send-email-1", "message");
  s = link(s, "approval-gate-1", "approval", "send-email-1", "gate");
  return autoLayoutSpec(s);
}

export function paymentSpec(): PipelineSpec {
  let s = newSpec("payment-link-agent", "staging", "payments@nexi.example");
  s.metadata.description = "Take an order from your app, create a mobile money payment, text the customer the link, then wait until the provider confirms it.";
  s = mk(s, "payment-request-1", "payment_request", { name: "Order received" });
  s = mk(s, "pay-mtn-1", "pay_mtn_momo", { name: "Collect with MTN MoMo", connection: "conn-stg-momo", config: { amountSource: "From order data", currency: "EUR" } });
  s = mk(s, "send-sms-1", "send_sms", { name: "Text the link", connection: "conn-stg-sms", config: { mode: "Send immediately" } });
  s = mk(s, "await-payment-1", "await_payment", { name: "Wait for payment" });
  s = mk(s, "notify-paid-1", "notify", { name: "Tell the team", config: { channel: "#payments" } });
  s = mk(s, "notify-check-1", "notify", { name: "Flag for a person", config: { channel: "#payments-review" } });
  s = link(s, "payment-request-1", "order", "pay-mtn-1", "order");
  s = link(s, "pay-mtn-1", "link", "send-sms-1", "message");
  s = link(s, "pay-mtn-1", "payment", "send-sms-1", "gate");
  s = link(s, "pay-mtn-1", "payment", "await-payment-1", "payment");
  s = link(s, "await-payment-1", "paid", "notify-paid-1", "signal");
  s = link(s, "await-payment-1", "unpaid", "notify-check-1", "signal");
  s = link(s, "await-payment-1", "review", "notify-check-1", "signal");
  return autoLayoutSpec(s);
}

export function mcpAgentSpec(): PipelineSpec {
  let s = newSpec("issue-triage-agent", "staging", "priya.nair@nexi.example");
  s.metadata.description = "Every weekday, search open issues through an MCP server, ask a model to propose a triage, and file the follow-up only after approval.";
  s = mk(s, "schedule-trigger-1", "schedule_trigger", { name: "Weekdays 09:00", config: { at: "09:00", timezone: "Asia/Bahrain" } });
  s = mk(s, "mcp-search-1", "mcp_tool", { name: "Search open issues", connection: "conn-stg-mcp-issues", config: { tool: "search_issues", effect: "Reads only", arguments: "{\n  \"query\": \"is:open label:needs-triage\"\n}" } });
  s = mk(s, "llm-step-1", "llm_step", { name: "Propose a triage", config: { prompt: "Group these issues by theme and propose an owner and priority for each." } });
  s = mk(s, "approval-gate-1", "approval_gate", { name: "Approve" });
  s = mk(s, "mcp-create-1", "mcp_tool", { name: "File the follow-up", connection: "conn-stg-mcp-issues", config: { tool: "create_issue", effect: "Changes data", arguments: "{\n  \"title\": \"Weekly triage summary\",\n  \"body\": \"{{context}}\"\n}", requireApproval: true } });
  s = link(s, "schedule-trigger-1", "tick", "mcp-search-1", "gate");
  s = link(s, "mcp-search-1", "result", "llm-step-1", "context");
  s = link(s, "llm-step-1", "reply", "approval-gate-1", "in");
  s = link(s, "llm-step-1", "reply", "mcp-create-1", "context");
  s = link(s, "approval-gate-1", "approval", "mcp-create-1", "gate");
  return autoLayoutSpec(s);
}

function buildAgents(now: number): BuildAgent[] {
  return [
    { id: "agent-onprem-01", name: "nexi-build-01", mode: "linux-systemd", status: "online", version: "0.4.0-preview", os: "Linux (Ubuntu 22.04)", arch: "amd64", labels: { os: "linux", arch: "amd64", zone: "onprem", gpu: "a10" }, capabilities: ["docker-buildx", "sbom", "cosign", "gpu-detect"], concurrency: { max: 2, running: 1 }, lastHeartbeatAt: iso(now, 0.2), registeredAt: iso(now, 60 * 24 * 41), owner: "infra@nexi.example", env: "staging", egressAllowlist: ["registry.nexi.example:443", "github.com:443", "pypi.org:443", "tokener.example:443"], registries: ["registry.nexi.example"], tokenExpiresAt: iso(now, -60 * 24 * 49), gpu: "NVIDIA A10 24 GB, driver 550.54 (detected, not managed)", demo: true },
    { id: "agent-k8s-01", name: "nexi-k8s-builders", mode: "kubernetes", status: "online", version: "0.4.0-preview", os: "Linux (Bottlerocket)", arch: "arm64", labels: { os: "linux", arch: "arm64", zone: "eks-staging" }, capabilities: ["buildkit-rootless", "sbom", "cosign"], concurrency: { max: 6, running: 0 }, lastHeartbeatAt: iso(now, 0.4), registeredAt: iso(now, 60 * 24 * 20), owner: "ml-platform@nexi.example", env: "staging", egressAllowlist: ["registry.nexi.example:443", "github.com:443", "tokener.example:443"], registries: ["registry.nexi.example"], tokenExpiresAt: iso(now, -60 * 24 * 70), demo: true },
    { id: "agent-onprem-02", name: "nexi-build-02", mode: "linux-systemd", status: "degraded", version: "0.3.2-preview", os: "Linux (Debian 12)", arch: "amd64", labels: { os: "linux", arch: "amd64", zone: "onprem" }, capabilities: ["docker-buildx", "sbom"], concurrency: { max: 2, running: 0 }, lastHeartbeatAt: iso(now, 6), registeredAt: iso(now, 60 * 24 * 90), owner: "infra@nexi.example", env: "staging", egressAllowlist: ["registry.nexi.example:443", "tokener.example:443"], registries: ["registry.nexi.example"], tokenExpiresAt: iso(now, -60 * 24 * 4), demo: true },
    { id: "agent-dev-01", name: "dev-laptop-docker", mode: "docker", status: "offline", version: "0.4.0-preview", os: "Linux (Ubuntu 24.04)", arch: "amd64", labels: { os: "linux", arch: "amd64", zone: "dev" }, capabilities: ["docker-buildx"], concurrency: { max: 1, running: 0 }, lastHeartbeatAt: iso(now, 60 * 48), registeredAt: iso(now, 60 * 24 * 12), owner: "dev-team@nexi.example", env: "development", egressAllowlist: ["registry.nexi.example:443", "tokener.example:443"], registries: ["registry.nexi.example"], tokenExpiresAt: iso(now, -60 * 24 * 18), demo: true },
  ];
}

export function buildFixtures(now = Date.now()): MlopsState {
  const connections = buildConnections(now);
  const agents = buildAgents(now);
  const ctx = { connections, agents };
  const rel = releaseSpec(), prod = prodSpec(), agent = agentSpec();
  const relV2 = clone(rel);
  relV2.nodes.find((n) => n.id === "canary-rollout-1")!.connection = "conn-prod-kserve";

  const ver = (spec: PipelineSpec, version: number, minutesAgo: number, by: string, note: string) => ({ version, spec, digest: specDigest(spec), createdAt: iso(now, minutesAgo), createdBy: by, note });
  const relV1 = clone(rel);
  relV1.nodes = relV1.nodes.filter((n) => n.id !== "notify-1");
  relV1.edges = relV1.edges.filter((e) => e.to !== "notify-1");
  const pay = paymentSpec(), mcp = mcpAgentSpec();
  const pipelines: PipelineRecord[] = [
    { id: "pl-release", name: "support-classifier-release", description: rel.metadata.description, env: "staging", demo: true, versions: [ver(rel, 3, 60 * 24 * 3, "priya.nair@nexi.example", "Add notification and fix the canary connection"), ver(relV2, 2, 60 * 24 * 5, "priya.nair@nexi.example", "Point canary at the production KServe connection"), ver(relV1, 1, 60 * 24 * 20, "priya.nair@nexi.example", "Initial release pipeline")] },
    { id: "pl-prod-promote", name: "support-classifier-prod-promote", description: prod.metadata.description, env: "production", demo: true, versions: [ver(prod, 1, 60 * 24 * 23, "marcus.lee@nexi.example", "Initial production promotion with approval gate")] },
    { id: "pl-agent", name: "support-retrieval-assistant", description: agent.metadata.description, env: "staging", demo: true, versions: [ver(agent, 1, 60 * 24 * 9, "priya.nair@nexi.example", "Initial retrieval workflow")] },
    { id: "pl-payments", name: "payment-link-agent", description: pay.metadata.description, env: "staging", demo: true, versions: [ver(pay, 1, 60 * 24 * 4, "payments@nexi.example", "Collect with MTN MoMo sandbox and text the link")] },
    { id: "pl-mcp-agent", name: "issue-triage-agent", description: mcp.metadata.description, env: "staging", demo: true, versions: [ver(mcp, 1, 60 * 24 * 6, "priya.nair@nexi.example", "Search, propose, approve, file")] },
  ];

  const run = (pl: string, version: number, spec: PipelineSpec, minutesAgo: number, trigger: string, by: string, fail?: FailSpec, approved = true, id?: string) => {
    const p = pipelines.find((x) => x.id === pl)!;
    return computeRun({ spec, version, pipelineId: p.id, pipelineName: p.name, ctx, connections }, { startedBy: by, trigger, startedAt: new Date(now - minutesAgo * 60_000), fail, approved, seed: `${pl}-${version}-${minutesAgo}`, id });
  };

  const running = (() => {
    const r = run("pl-release", 3, rel, 4, "manual", "priya.nair@nexi.example", undefined, true, "run-7f3a91c2");
    const idx = r.nodes.findIndex((n) => n.nodeId === "verify-endpoint-1");
    return { ...r, status: "running" as const, durationMs: undefined, nodes: r.nodes.map((n, i) => (i < idx ? n : { ...n, status: i === idx ? ("running" as const) : ("pending" as const), durationMs: undefined, logs: i === idx ? n.logs.slice(0, 1) : [], artifacts: [] })), events: r.events.slice(0, 1) };
  })();
  const cancelled = (() => {
    const r = run("pl-release", 3, rel, 60 * 24 * 3, "manual", "marcus.lee@nexi.example", undefined, true, "run-c4410d7e");
    const idx = r.nodes.findIndex((n) => n.nodeId === "register-model-1");
    return { ...r, status: "cancelled" as const, nodes: r.nodes.map((n, i) => (i < idx ? n : { ...n, status: (i === idx ? "skipped" : "skipped") as "skipped", logs: [], artifacts: [], durationMs: undefined })), events: [...r.events.slice(0, 1), { t: iso(now, 60 * 24 * 3 - 12), kind: "run", msg: "Cancelled by marcus.lee@nexi.example before registration." }] };
  })();

  const runs: PipelineRun[] = [
    running,
    run("pl-prod-promote", 1, prod, 12, "manual", "priya.nair@nexi.example", undefined, false, "run-b82e5530"),
    run("pl-release", 3, rel, 60 * 3, "git push (main)", "ci@nexi.example", undefined, true, "run-a1d90ee4"),
    run("pl-agent", 1, agent, 60 * 5, "schedule (nightly)", "scheduler", undefined, true, "run-e5c1a870"),
    run("pl-release", 3, rel, 60 * 26, "git push (main)", "ci@nexi.example", { nodeId: "verify-endpoint-1", kind: "fail" }, true, "run-9b6d02f1"),
    run("pl-agent", 1, agent, 60 * 29, "schedule (nightly)", "scheduler", { nodeId: "chunk-embed-1", kind: "fail" }, true, "run-3d77ab19"),
    run("pl-release", 2, relV2, 60 * 24 * 2, "manual", "priya.nair@nexi.example", undefined, true, "run-5a02c8d6"),
    cancelled,
    run("pl-release", 1, relV1, 60 * 24 * 4, "git push (main)", "ci@nexi.example", { nodeId: "build-image-1", kind: "fail" }, true, "run-0e91f4b7"),
    run("pl-prod-promote", 1, prod, 60 * 24 * 22, "manual", "marcus.lee@nexi.example", undefined, true, "run-6c18d3a2"),
  ];

  const alerts: Alert[] = [
    { id: "al-1", severity: "critical", title: "Image pull failing", resource: "ticket-summarizer-staging", since: iso(now, 118), detail: "ImagePullBackOff with 401 from the registry. The deployment has 0 ready replicas.", state: "firing" },
    { id: "al-2", severity: "warning", title: "GPU capacity exhausted", resource: "support-embedder-staging", since: iso(now, 180), detail: "One replica is unschedulable: insufficient nvidia.com/gpu. Capacity is a property of the target, not of this control plane.", state: "firing" },
    { id: "al-3", severity: "warning", title: "Credential expires in 12 days", resource: "pgvector (staging)", since: iso(now, 60 * 30), detail: "Rotate the secret reference before expiry to avoid pipeline failures.", state: "acknowledged" },
    { id: "al-4", severity: "warning", title: "Connection re-verification overdue", resource: "Production GKE", since: iso(now, 60 * 49), detail: "Last verified 2 days ago. Scheduled checks run every 24 hours.", state: "firing" },
    { id: "al-5", severity: "info", title: "Build agent heartbeat delayed", resource: "nexi-build-02", since: iso(now, 6), detail: "Heartbeats are arriving more than 5 minutes apart. Agent is marked degraded.", state: "firing" },
  ];

  const A = (m: number, actor: string, action: string, resource: string, detail: string, env?: Env): AuditEvent => ({ id: `ev-${Math.abs(Math.floor(m * 7919)) % 100000}-${action.length}`, at: iso(now, m), actor, action, resource, detail, env, demo: true });
  const audit: AuditEvent[] = [
    A(4, "priya.nair@nexi.example", "run.start", "support-classifier-release", "Run run-7f3a91c2 started (manual)", "staging"),
    A(12, "priya.nair@nexi.example", "run.start", "support-classifier-prod-promote", "Run run-b82e5530 created, waiting for approval", "production"),
    A(60 * 2, "system", "connection.verify", "ticket-summarizer-staging", "Image pull failed with 401", "staging"),
    A(60 * 3, "ci@nexi.example", "run.complete", "support-classifier-release", "Run run-a1d90ee4 succeeded", "staging"),
    A(60 * 6, "priya.nair@nexi.example", "model.register", "customer-support-classifier", "Version 4 registered with provenance", "staging"),
    A(60 * 26, "system", "run.rollback", "support-classifier-release", "Verify failed, previous revision restored", "staging"),
    A(60 * 30, "marcus.lee@nexi.example", "connection.rotate", "Harbor (staging)", "Credential rotated, secret reference unchanged", "staging"),
    A(60 * 24 * 2, "priya.nair@nexi.example", "run.validation-failed", "support-classifier-release", "Run blocked: connection belongs to production", "staging"),
    A(60 * 24 * 3, "marcus.lee@nexi.example", "run.cancel", "support-classifier-release", "Run run-c4410d7e cancelled", "staging"),
    A(60 * 24 * 4, "system", "run.failed", "support-classifier-release", "Build failed: agent out of disk space", "staging"),
    A(60 * 24 * 6, "infra@nexi.example", "agent.enroll", "nexi-build-02", "Agent enrolled with one-time token", "staging"),
    A(60 * 24 * 9, "priya.nair@nexi.example", "pipeline.publish", "support-retrieval-assistant", "Version 1 published", "staging"),
    A(60 * 24 * 22, "marcus.lee@nexi.example", "model.approve", "customer-support-classifier", "Version 3 approved for production", "production"),
    A(60 * 24 * 22, "marcus.lee@nexi.example", "deployment.promote", "support-classifier-prod", "Version 3 promoted to 100 percent", "production"),
    A(60 * 24 * 41, "infra@nexi.example", "agent.enroll", "nexi-build-01", "Agent enrolled with one-time token", "staging"),
  ];

  return {
    v: STATE_VERSION, role: "admin", connections, models: buildModels(now), library: buildLibrary(now), knowledge: buildKnowledge(now), payments: buildPayments(now), deployments: buildDeployments(now), pipelines, runs, agents, audit, alerts,
    settings: { killSwitch: false, requireProdApproval: true, requireSignedImages: true, auditRetentionDays: 400, secretManager: "vault", allowedRegistries: ["registry.nexi.example"], allowProductionAgents: false, allowPaymentsInProduction: false, maxPaymentAmount: 1000, allowedPaymentCurrencies: ["USD", "EUR", "GBP", "XOF", "XAF", "UGX", "GHS", "NGN", "KES", "ZAR"] },
  };
}

/** Deterministic metric series for charts. Demo data. */
export function makeSeries(key: string, n: number, base: number, noise: number, trend = 0, spikeAt?: number): number[] {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  const r = () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h ^= h >>> 13; return ((h >>> 0) % 10000) / 10000; };
  return Array.from({ length: n }, (_, i) => {
    const wave = Math.sin((i / n) * Math.PI * 4) * noise * 0.6;
    const spike = spikeAt !== undefined && Math.abs(i - spikeAt) < 2 ? noise * 3 : 0;
    return Math.max(0, Math.round((base + trend * i + wave + (r() - 0.5) * noise + spike) * 100) / 100);
  });
}
