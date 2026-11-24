/**
 * Reference data for the Functions design preview: tenants, apps, providers, models, policies and budgets.
 * Prices are illustrative sample rates, not quotes from any provider.
 */
import type { AppRef, Budget, FnPolicy, ModelDef, Provider, Tenant } from "./types";

export const TENANTS: Tenant[] = [
  { id: "t-retail", name: "Retail Banking", region: "me-central" },
  { id: "t-corp", name: "Corporate Banking", region: "me-central" },
  { id: "00000000-0000-4000-8000-0000000000b2", name: "Platform Engineering", region: "eu-west" },
];

export const APPS: AppRef[] = [
  { id: "a-card-risk", tenantId: "t-retail", name: "Card Risk Engine", owner: "Layla Haddad" },
  { id: "a-support", tenantId: "t-retail", name: "Support Desk", owner: "Omar Siddiq" },
  { id: "a-loans", tenantId: "t-corp", name: "Loan Origination", owner: "Priya Nair" },
  { id: "a-treasury", tenantId: "t-corp", name: "Treasury Assistant", owner: "Marcus Webb" },
  { id: "a-finops", tenantId: "00000000-0000-4000-8000-0000000000b2", name: "FinOps Console", owner: "Yuki Tanaka" },
];

export const PROVIDERS: Provider[] = [
  { id: "p-anthropic", name: "Anthropic", kind: "hosted", brand: "Anthropic", endpoint: "api.anthropic.com", external: true },
  { id: "p-openai", name: "OpenAI", kind: "hosted", brand: "OpenAI", endpoint: "api.openai.com", external: true },
  { id: "p-bedrock", name: "Amazon Bedrock", kind: "cloud", brand: "Amazon Web Services", endpoint: "bedrock-runtime.me-central-1.amazonaws.com", external: true },
  { id: "p-vllm", name: "vLLM (in-house)", kind: "self-hosted", brand: "vLLM", endpoint: "vllm.ml.svc.cluster.local:8000", external: false },
  { id: "p-ollama", name: "Ollama (in-house)", kind: "self-hosted", brand: "Ollama", endpoint: "ollama.ml.svc.cluster.local:11434", external: false },
];

const M = 1_000_000;
export const MODELS: ModelDef[] = [
  { id: "claude-sonnet", providerId: "p-anthropic", name: "Claude Sonnet", inPerM: 3 * M, outPerM: 15 * M, contextK: 200, capabilities: ["chat", "vision", "tools", "json"] },
  { id: "claude-haiku", providerId: "p-anthropic", name: "Claude Haiku", inPerM: 1 * M, outPerM: 5 * M, contextK: 200, capabilities: ["chat", "vision", "tools", "json"] },
  { id: "gpt-4.1", providerId: "p-openai", name: "GPT-4.1", inPerM: 2 * M, outPerM: 8 * M, contextK: 1000, capabilities: ["chat", "vision", "tools", "json"] },
  { id: "gpt-4.1-mini", providerId: "p-openai", name: "GPT-4.1 mini", inPerM: 400_000, outPerM: 1_600_000, contextK: 1000, capabilities: ["chat", "tools", "json"] },
  { id: "bedrock-nova-lite", providerId: "p-bedrock", name: "Nova Lite", inPerM: 60_000, outPerM: 240_000, contextK: 300, capabilities: ["chat", "vision", "json"] },
  { id: "llama-3.3-70b", providerId: "p-vllm", name: "Llama 3.3 70B (vLLM)", inPerM: 150_000, outPerM: 150_000, contextK: 128, capabilities: ["chat", "tools", "json"] },
  { id: "qwen2.5-14b", providerId: "p-ollama", name: "Qwen 2.5 14B (Ollama)", inPerM: 40_000, outPerM: 40_000, contextK: 32, capabilities: ["chat", "json"] },
];

export const modelById = (id: string) => MODELS.find((m) => m.id === id);
export const providerById = (id: string) => PROVIDERS.find((p) => p.id === id);
export const providerOfModel = (modelId: string) => providerById(modelById(modelId)?.providerId ?? "");

/** Cost of a call in micro-dollars, rounded to a whole micro-dollar. */
export function priceCall(modelId: string, tokensIn: number, tokensOut: number): number {
  const m = modelById(modelId);
  if (!m) return 0;
  return Math.round((tokensIn * m.inPerM + tokensOut * m.outPerM) / M);
}

export const POLICIES: FnPolicy[] = [
  { id: "pol-models", name: "Approved models only", kind: "model-allowlist", description: "A function may call only the providers and models on its allowlist. Anything else is blocked at the gateway before it leaves the network.", mode: "enforce", status: "active", version: 4, scope: "All functions", rules: ["deny when model not in function allowlist", "deny when provider not in function allowlist"] },
  { id: "pol-pii", name: "Redact personal data in prompts", kind: "pii-redaction", description: "Card numbers, IBANs, national ids and email addresses are replaced with tokens before a prompt reaches a hosted model.", mode: "enforce", status: "active", version: 6, scope: "Confidential and restricted data", rules: ["mask PAN and IBAN", "mask national id", "mask email and phone", "skip for self-hosted providers"] },
  { id: "pol-budget", name: "Per-invocation cost ceiling", kind: "budget", description: "Stops a single call when its estimated cost would exceed the function ceiling.", mode: "enforce", status: "active", version: 3, scope: "All functions", rules: ["estimate cost from input tokens and max output", "deny when estimate exceeds maxCostMicros"] },
  { id: "pol-egress", name: "No outbound network by default", kind: "egress", description: "Functions reach only the hosts on their allowlist. Provider traffic always goes through the gateway.", mode: "enforce", status: "active", version: 2, scope: "All functions", rules: ["deny all egress unless allowlisted", "provider calls only via gateway"] },
  { id: "pol-approval", name: "Human approval for holds", kind: "approval", description: "Actions that place a hold or move money need a named approver before they run.", mode: "enforce", status: "active", version: 5, scope: "Workflows with write connectors", rules: ["pause run on write step", "approver must hold the approver role", "expire after 4 hours"] },
  { id: "pol-residency", name: "Keep restricted data in region", kind: "data-residency", description: "Restricted data may only be sent to providers that run in the tenant region or inside the organisation.", mode: "enforce", status: "active", version: 2, scope: "Restricted data", rules: ["deny external providers for restricted data"] },
  { id: "pol-rate", name: "Burst protection", kind: "rate-limit", description: "Throttles a function that exceeds its per-minute limit, and records the throttled calls.", mode: "monitor", status: "active", version: 1, scope: "HTTP triggers", rules: ["throttle above invocationsPerMinute", "return 429 with retry-after"] },
  { id: "pol-draft-tools", name: "Tool call allowlist", kind: "model-allowlist", description: "Restricts which MCP tools a function may call. Drafted, not enforced.", mode: "monitor", status: "draft", version: 1, scope: "Functions with tools", rules: ["deny tools outside the function tool list"] },
];

export const BUDGETS: Budget[] = [
  { id: "bud-retail-d", name: "Retail Banking daily", scope: "tenant", scopeId: "t-retail", period: "daily", limitMicros: 40_000_000, alertAtPct: 80, onExceed: "block" },
  { id: "bud-corp-w", name: "Corporate Banking weekly", scope: "tenant", scopeId: "t-corp", period: "weekly", limitMicros: 150_000_000, alertAtPct: 75, onExceed: "alert" },
  { id: "bud-platform-w", name: "Platform Engineering weekly", scope: "tenant", scopeId: "00000000-0000-4000-8000-0000000000b2", period: "weekly", limitMicros: 30_000_000, alertAtPct: 80, onExceed: "block" },
  { id: "bud-cardrisk-d", name: "Card Risk Engine daily", scope: "app", scopeId: "a-card-risk", period: "daily", limitMicros: 25_000_000, alertAtPct: 85, onExceed: "block" },
];

/** Secret references the sample functions use. They point at a vault path and are never resolved here. */
export const SECRET_REFS = [
  "secretref://vault/payments/core-banking-mcp",
  "secretref://vault/aws/limits-lambda-role",
  "secretref://vault/crm/ticket-api",
  "secretref://vault/docs/ocr-service",
];

export const KAFKA_CLUSTERS = ["kafka-prod-me", "kafka-prod-eu", "kafka-staging"];
export const TIMEZONES = ["UTC", "Asia/Bahrain", "Europe/London", "America/New_York"];
export const LAMBDA_REGIONS = ["me-central-1", "eu-west-1", "us-east-1", "ap-southeast-1"];
