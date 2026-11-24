/**
 * Gateway reference data for the sample workspace: the providers an organization has connected, the models they serve and the aliases the gateway
 * resolves. Quality scores come from a sample evaluation set and are labelled that way wherever they are shown. A signed-in workspace reads the
 * same shapes from the gateway API; nothing here is shown as live data.
 */
import { siOpenai, siAnthropic, siGooglegemini, siAmazonwebservices, siOllama } from "simple-icons";
import { makeSeries } from "@/lib/mlops/fixtures";

export type Health = "healthy" | "degraded" | "down";
export type TaskClass = "simple" | "medium" | "complex";
export const TASK_CLASSES: { id: TaskClass; label: string; share: number; tokensIn: number; tokensOut: number; example: string }[] = [
  { id: "simple", label: "Simple", share: 0.55, tokensIn: 600, tokensOut: 180, example: "Classification, extraction, short answers" },
  { id: "medium", label: "Medium", share: 0.3, tokensIn: 1500, tokensOut: 500, example: "Summaries, drafting, retrieval answers" },
  { id: "complex", label: "Complex", share: 0.15, tokensIn: 3500, tokensOut: 1200, example: "Multi-step reasoning, code, analysis" },
];

export type Provider = {
  id: string; name: string; kind: string; icon: { title: string; path: string; hex: string } | null; region: string; priority: number; status: Health;
  models: string[]; p50: number; p99: number; errorRatePct: number; requestsPerDay: number; spendPerDayUsd: number;
  rpmLimit: number; tpmLimit: number; secretRef: string; selfHosted?: boolean; note?: string;
  /** Registered in this session and not yet carrying traffic, so there is nothing to chart. */
  fresh?: boolean;
};

export const PROVIDERS: Provider[] = [
  { id: "openai-primary", name: "OpenAI (primary)", kind: "OpenAI", icon: siOpenai, region: "us-east", priority: 1, status: "healthy", models: ["gpt-5", "text-embedding-3-small"], p50: 210, p99: 412, errorRatePct: 0.4, requestsPerDay: 48200, spendPerDayUsd: 412, rpmLimit: 10000, tpmLimit: 8_000_000, secretRef: "secretref://vault/prod/providers/openai/key" },
  { id: "anthropic-primary", name: "Anthropic (primary)", kind: "Claude", icon: siAnthropic, region: "us-east", priority: 1, status: "healthy", models: ["claude-sonnet-5"], p50: 198, p99: 388, errorRatePct: 0.3, requestsPerDay: 61300, spendPerDayUsd: 538, rpmLimit: 8000, tpmLimit: 6_000_000, secretRef: "secretref://vault/prod/providers/anthropic/key" },
  { id: "gemini-failover", name: "Gemini (failover)", kind: "Gemini", icon: siGooglegemini, region: "us-central", priority: 2, status: "degraded", models: ["gemini-2-5-pro"], p50: 640, p99: 1200, errorRatePct: 2.1, requestsPerDay: 6100, spendPerDayUsd: 46, rpmLimit: 4000, tpmLimit: 4_000_000, secretRef: "secretref://vault/prod/providers/gemini/key", note: "Elevated latency since 14:10. Failover traffic is held at 10%." },
  { id: "bedrock-failover", name: "Bedrock (failover)", kind: "Bedrock", icon: siAmazonwebservices, region: "us-east", priority: 2, status: "healthy", models: ["claude-sonnet-5"], p50: 230, p99: 455, errorRatePct: 0.5, requestsPerDay: 5200, spendPerDayUsd: 61, rpmLimit: 3000, tpmLimit: 2_000_000, secretRef: "secretref://vault/prod/providers/bedrock/role" },
  { id: "mistral-eu", name: "Mistral EU", kind: "Mistral", icon: null, region: "eu-west", priority: 1, status: "healthy", models: ["mistral-large"], p50: 180, p99: 340, errorRatePct: 0.2, requestsPerDay: 9400, spendPerDayUsd: 38, rpmLimit: 3000, tpmLimit: 2_000_000, secretRef: "secretref://vault/prod/providers/mistral/key", note: "Used for tenants that require EU data residency." },
  { id: "vllm-cluster", name: "vLLM cluster (self-hosted)", kind: "Self-hosted", icon: siOllama, region: "us-east", priority: 3, status: "healthy", models: ["llama-3-70b"], p50: 95, p99: 220, errorRatePct: 0.1, requestsPerDay: 22800, spendPerDayUsd: 74, rpmLimit: 20000, tpmLimit: 30_000_000, secretRef: "secretref://vault/prod/providers/vllm/token", selfHosted: true, note: "4 x H100 80 GB, tensor parallel 4. Cost is GPU time, not tokens." },
];

export type Model = {
  id: string; family: string; capabilities: string[]; contextK: number; priceIn: number | null; priceOut: number | null;
  /** Sample evaluation pass rate, percent, by task class. */
  quality: Record<TaskClass, number>; latencyMs: number; paramsB?: number; providers: string[];
  /** For self-hosted models only: blended cost per 1M tokens estimated from GPU time. */
  effectivePerM?: number;
};

export const MODELS: Model[] = [
  { id: "claude-sonnet-5", family: "claude", capabilities: ["chat", "vision", "tools", "reasoning"], contextK: 200, priceIn: 3, priceOut: 15, quality: { simple: 99, medium: 96, complex: 93 }, latencyMs: 198, providers: ["anthropic-primary", "bedrock-failover"] },
  { id: "gpt-5", family: "gpt", capabilities: ["chat", "vision", "tools"], contextK: 256, priceIn: 2.5, priceOut: 10, quality: { simple: 99, medium: 95, complex: 92 }, latencyMs: 210, providers: ["openai-primary"] },
  { id: "gemini-2-5-pro", family: "gemini", capabilities: ["chat", "vision"], contextK: 1000, priceIn: 1.25, priceOut: 5, quality: { simple: 98, medium: 93, complex: 88 }, latencyMs: 640, providers: ["gemini-failover"] },
  { id: "mistral-large", family: "mistral", capabilities: ["chat", "tools"], contextK: 128, priceIn: 2, priceOut: 6, quality: { simple: 98, medium: 92, complex: 84 }, latencyMs: 180, providers: ["mistral-eu"] },
  { id: "llama-3-70b", family: "self-hosted", capabilities: ["chat"], contextK: 128, priceIn: null, priceOut: null, quality: { simple: 96, medium: 88, complex: 74 }, latencyMs: 95, paramsB: 70, providers: ["vllm-cluster"], effectivePerM: 0.9 },
  { id: "text-embedding-3-small", family: "gpt", capabilities: ["embeddings"], contextK: 8, priceIn: 0.02, priceOut: null, quality: { simple: 100, medium: 100, complex: 100 }, latencyMs: 60, providers: ["openai-primary"] },
];

export type Strategy = "priority" | "cost-aware" | "latency-aware" | "weighted";
export type Alias = { name: string; strategy: Strategy; chain: { model: string; weight?: number }[]; qualityFloor: number; note: string };

export const STRATEGIES: { id: Strategy; label: string; body: string }[] = [
  { id: "priority", label: "Priority and failover", body: "Always the first model. The next one is used only when the first fails or is over limit." },
  { id: "cost-aware", label: "Cheapest that meets quality", body: "For each request, the cheapest model in the chain whose sample quality is at or above your floor for that kind of task." },
  { id: "latency-aware", label: "Fastest that meets quality", body: "For each request, the fastest model in the chain whose quality is at or above your floor." },
  { id: "weighted", label: "Weighted split", body: "Share traffic by weight, for canarying a new model or spreading load across providers." },
];

export const ALIASES: Alias[] = [
  { name: "default-chat", strategy: "priority", chain: [{ model: "claude-sonnet-5" }, { model: "gpt-5" }, { model: "llama-3-70b" }], qualityFloor: 90, note: "Every chat application that has not chosen a model." },
  { name: "fast-reasoning", strategy: "priority", chain: [{ model: "claude-sonnet-5" }, { model: "gemini-2-5-pro" }], qualityFloor: 90, note: "Agents and analysis jobs." },
  { name: "cheap-embeddings", strategy: "priority", chain: [{ model: "text-embedding-3-small" }], qualityFloor: 0, note: "Retrieval indexing and search." },
];

// ------------------------------------------------------------------------------------------------ derived

export const providerById = (id: string) => PROVIDERS.find((p) => p.id === id);
export const modelById = (id: string) => MODELS.find((m) => m.id === id);

/** Blended price per 1M tokens for a task class, using that class's input and output mix. Self-hosted models use their GPU-time estimate. */
export function costPerRequest(m: Model, c: (typeof TASK_CLASSES)[number]): number {
  if (m.priceIn === null) return ((c.tokensIn + c.tokensOut) / 1_000_000) * (m.effectivePerM ?? 0);
  return (c.tokensIn / 1_000_000) * m.priceIn + (c.tokensOut / 1_000_000) * (m.priceOut ?? 0);
}

export function providerSeries(p: Provider, n = 48) {
  const base = p.requestsPerDay / 24 / 60;
  const lat = makeSeries(p.id + "lat", n, p.p50, p.p50 * 0.14, 0, p.status === "degraded" ? n - 10 : undefined);
  const lat99 = makeSeries(p.id + "p99", n, p.p99, p.p99 * 0.12, 0, p.status === "degraded" ? n - 10 : undefined);
  const req = makeSeries(p.id + "req", n, base, base * 0.25);
  const err = makeSeries(p.id + "err", n, p.errorRatePct, Math.max(0.15, p.errorRatePct * 0.6), 0, p.status === "degraded" ? n - 10 : undefined);
  return Array.from({ length: n }, (_, i) => ({ t: `${String(Math.floor(((i * 30) / 60) % 24)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`, p50: lat[i], p99: lat99[i], requests: req[i], errors: err[i] }));
}
