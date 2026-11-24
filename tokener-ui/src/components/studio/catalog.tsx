import {
  Radio, ShieldCheck, Boxes, Ban, Clock, Coins, Wallet, Gauge, AlertTriangle, EyeOff, Globe, KeyRound,
  UserCog, FileText, Route, ArrowRightLeft, Send, XCircle, ScrollText, Bell, Mail, Webhook,
  Fingerprint, Server, AppWindow, Scale,
} from "lucide-react";
import {
  siOpenai, siAnthropic, siGooglegemini, siAmazonwebservices, siOllama, siHuggingface, siClickhouse,
  siApachekafka, siOpentelemetry, siSlack, siPagerduty, siRedis, siOpensearch,
} from "simple-icons";
import type { NodeDef, ParamDef } from "./types";

const L = (lucide: any) => ({ lucide });
const SI = (si: any) => ({ si });

const GRAINS = ["user", "app", "project", "dept", "tenant"];
const PERIODS = ["hour", "day", "week", "month"];

const providerParams: ParamDef[] = [
  { key: "model", label: "Model", type: "text", placeholder: "gpt-5" },
  { key: "region", label: "Region", type: "text", default: "us-east-1" },
  { key: "timeoutMs", label: "Timeout (ms)", type: "number", default: 30000 },
];

export const CATALOG: NodeDef[] = [
  /* ---------------------------------------------------------------- Policy mode */
  {
    kind: "request", label: "Incoming request", group: "Context", modes: ["policy"], icon: L(Radio), tone: "neutral",
    desc: "The evaluation input", hasIn: false, hasOut: true, singleton: true,
    about: "Represents the input document handed to the policy engine on every call: tenant, project, app, user, model, capability, request_time and estimated_cost. It is informational and produces no DSL.",
    params: [],
    summary: () => "model, capability, time, cost",
  },
  {
    kind: "policy", label: "Policy document", group: "Context", modes: ["policy"], icon: L(ShieldCheck), tone: "accent",
    desc: "The policy that gathers every rule", hasIn: true, hasOut: true, singleton: true,
    about: "The hub of the graph. Every rule node wired into it becomes a statement in the DSL. Scope decides who the policy applies to. ENFORCE marks an org-wide mandate that lower scopes cannot override. Evaluation is deny-overrides.",
    params: [
      { key: "name", label: "Policy name", type: "text", default: "new-policy" },
      { key: "scopeType", label: "Scope", type: "select", options: ["ORG", "TENANT", "DEPT", "PROJECT", "APP", "USER"], default: "TENANT" },
      { key: "scopeIdent", label: "Scope identifier", type: "text", default: "prod", help: "A name, not a UUID. The DSL lexer cannot start an identifier with a digit." },
      { key: "enforce", label: "Enforce (org-wide mandate)", type: "toggle", default: false },
      { key: "activateAt", label: "Activate at", type: "datetime", help: "Optional scheduled activation." },
      { key: "expireAt", label: "Expire at", type: "datetime", help: "Optional automatic expiry." },
    ],
    summary: (p) => `${String(p.scopeType || "TENANT").toLowerCase()}${p.scopeType === "ORG" ? "" : ":" + (p.scopeIdent || "?")}${p.enforce ? " (enforce)" : ""}`,
  },
  {
    kind: "decision", label: "Decision", group: "Context", modes: ["policy"], icon: L(Scale), tone: "neutral",
    desc: "allow, reason, breach_action", hasIn: true, hasOut: false, singleton: true,
    about: "The result returned to the gateway: allow (bool), reason (string) and breach_action (warn, throttle, block or none). Informational, produces no DSL.",
    params: [],
    summary: () => "allow | reason | breach_action",
  },
  {
    kind: "allow_model", label: "Allow models", group: "Model rules", modes: ["policy"], icon: L(Boxes), tone: "accent",
    desc: "Allow-list of model ids or globs", hasIn: true, hasOut: true,
    about: "ALLOW MODEL a, b, claude-*. When any allow list exists, a model that matches none of them is not allowed. Wildcards use glob matching.",
    params: [{ key: "models", label: "Models (comma separated)", type: "list", default: "gpt-5, claude-sonnet-5", placeholder: "gpt-5, claude-*" }],
    summary: (p) => String(p.models || "none"),
  },
  {
    kind: "deny_model", label: "Deny models", group: "Model rules", modes: ["policy"], icon: L(Ban), tone: "danger",
    desc: "Deny-list of model ids or globs", hasIn: true, hasOut: true,
    about: "DENY MODEL *-preview. Deny overrides allow, so a deny match blocks the request even if an allow rule also matches.",
    params: [{ key: "models", label: "Models (comma separated)", type: "list", default: "*-preview" }],
    summary: (p) => String(p.models || "none"),
  },
  {
    kind: "deny_capability", label: "Deny capability", group: "Capability", modes: ["policy"], icon: L(Ban), tone: "danger",
    desc: "Block images, audio, embeddings or tools", hasIn: true, hasOut: true,
    about: "DENY IMAGE | AUDIO | EMBEDDING | TOOLS. Evaluated against input.capability.",
    params: [{ key: "capability", label: "Capability", type: "select", options: ["IMAGE", "AUDIO", "EMBEDDING", "TOOLS"], default: "IMAGE" }],
    summary: (p) => `DENY ${p.capability || "IMAGE"}`,
  },
  {
    kind: "allow_hours", label: "Allowed hours", group: "Schedule", modes: ["policy"], icon: L(Clock), tone: "info",
    desc: "Time window in a timezone", hasIn: true, hasOut: true,
    about: "ALLOW HOURS 08:00-18:00 TIMEZONE \"Asia/Bahrain\". Requests outside the window are not allowed. Use a valid IANA timezone id.",
    params: [
      { key: "from", label: "From", type: "time", default: "08:00" },
      { key: "to", label: "To", type: "time", default: "18:00" },
      { key: "timezone", label: "Timezone", type: "text", default: "Asia/Bahrain" },
    ],
    summary: (p) => `${p.from || "08:00"} to ${p.to || "18:00"} ${p.timezone || "UTC"}`,
  },
  {
    kind: "limit_tokens", label: "Token limit", group: "Limits", modes: ["policy"], icon: L(Coins), tone: "warn",
    desc: "Tokens per grain per period", hasIn: true, hasOut: true,
    about: "LIMIT TOKENS 100000 PER user PER day. Carried in the policy as a declaration and enforced by the Budget engine counters at the gateway.",
    params: [
      { key: "amount", label: "Tokens", type: "number", default: 100000 },
      { key: "grain", label: "Per", type: "select", options: GRAINS, default: "user" },
      { key: "period", label: "Per", type: "select", options: PERIODS, default: "day" },
    ],
    summary: (p) => `${Number(p.amount || 0).toLocaleString("en-US")} per ${p.grain || "user"} / ${p.period || "day"}`,
  },
  {
    kind: "limit_cost", label: "Cost limit", group: "Limits", modes: ["policy"], icon: L(Wallet), tone: "warn",
    desc: "Spend per grain per period", hasIn: true, hasOut: true,
    about: "LIMIT COST 50 USD PER project PER day. FX-aware: spend is converted to the policy currency before comparison.",
    params: [
      { key: "amount", label: "Amount", type: "number", default: 50 },
      { key: "currency", label: "Currency", type: "select", options: ["USD", "EUR", "GBP", "BHD", "SAR", "AED"], default: "USD" },
      { key: "grain", label: "Per", type: "select", options: GRAINS, default: "project" },
      { key: "period", label: "Per", type: "select", options: PERIODS, default: "day" },
    ],
    summary: (p) => `${p.amount || 0} ${p.currency || "USD"} per ${p.grain || "project"} / ${p.period || "day"}`,
  },
  {
    kind: "on_breach", label: "On breach", group: "Enforcement", modes: ["policy"], icon: L(AlertTriangle), tone: "danger",
    desc: "WARN, THROTTLE or BLOCK", hasIn: true, hasOut: true, singleton: true,
    about: "ON BREACH WARN | THROTTLE | BLOCK. Sets breach_action when a request is not allowed. Only one is allowed per policy.",
    params: [{ key: "action", label: "Action", type: "select", options: ["WARN", "THROTTLE", "BLOCK"], default: "THROTTLE" }],
    summary: (p) => String(p.action || "THROTTLE"),
  },
  {
    kind: "region_pin", label: "Region pinning", group: "Planned rules", modes: ["policy"], icon: L(Globe), tone: "violet", planned: true,
    desc: "Pin traffic to regions", hasIn: true, hasOut: true,
    about: "Not in the DSL grammar yet. Emitted as a comment so the intent is kept with the document and is ignored by the parser.",
    params: [{ key: "regions", label: "Regions (comma separated)", type: "list", default: "eu-west-1, eu-central-1" }],
    summary: (p) => String(p.regions || ""),
  },
  {
    kind: "pii_mask", label: "PII masking", group: "Planned rules", modes: ["policy"], icon: L(EyeOff), tone: "violet", planned: true,
    desc: "Mask entities before the provider", hasIn: true, hasOut: true,
    about: "Not in the DSL grammar yet. Emitted as a comment, ignored by the parser.",
    params: [
      { key: "entities", label: "Entities", type: "list", default: "EMAIL, IBAN, PHONE" },
      { key: "mode", label: "Mode", type: "select", options: ["mask", "block"], default: "mask" },
    ],
    summary: (p) => `${p.mode || "mask"} ${p.entities || ""}`,
  },

  /* ------------------------------------------------------------- Pipeline / trace */
  {
    kind: "client_app", label: "Client app", group: "Sources", modes: ["pipeline", "trace"], icon: L(AppWindow), tone: "neutral",
    desc: "SDK or HTTP caller", hasIn: false, hasOut: true,
    about: "The application sending requests to the Data Plane. Any OpenAI-compatible client works by changing the base URL.",
    params: [
      { key: "name", label: "App name", type: "text", default: "mobile-banking-app" },
      { key: "sdk", label: "SDK", type: "select", options: ["python", "node", "go", "java", "rust", "dotnet", "curl"], default: "python" },
    ],
    summary: (p) => `${p.name || "app"} (${p.sdk || "python"})`,
  },
  {
    kind: "service_account", label: "Service account", group: "Sources", modes: ["pipeline", "trace"], icon: L(UserCog), tone: "neutral",
    desc: "Non-human caller", hasIn: false, hasOut: true,
    about: "A machine identity with its own keys, scope and budgets.",
    params: [{ key: "name", label: "Name", type: "text", default: "batch-summarizer" }],
    summary: (p) => String(p.name || ""),
  },
  {
    kind: "authenticate", label: "Authenticate", group: "Identity", modes: ["pipeline", "trace"], icon: L(KeyRound), tone: "accent",
    desc: "API key, JWT or mTLS", hasIn: true, hasOut: true,
    about: "Verifies the credential and loads the principal. Keys are stored hashed and cached briefly at the gateway.",
    params: [
      { key: "method", label: "Method", type: "select", options: ["API key", "OIDC JWT", "mTLS"], default: "API key" },
      { key: "cacheTtl", label: "Cache TTL (s)", type: "number", default: 60 },
    ],
    summary: (p) => String(p.method || "API key"),
  },
  {
    kind: "resolve_scope", label: "Resolve scope", group: "Identity", modes: ["pipeline", "trace"], icon: L(Fingerprint), tone: "accent",
    desc: "Tenant, project, app, user", hasIn: true, hasOut: true,
    about: "Maps the principal to the scope chain used by policy, budget and quota lookups.",
    params: [{ key: "source", label: "Source", type: "select", options: ["key binding", "header", "JWT claim"], default: "key binding" }],
    summary: (p) => String(p.source || "key binding"),
  },
  {
    kind: "policy_gate", label: "Policy gate", group: "Gates", modes: ["pipeline", "trace"], icon: L(ShieldCheck), tone: "accent",
    desc: "Deny-overrides evaluation", hasIn: true, hasOut: true,
    about: "Evaluates the active policy chain (org, tenant, department, project, app, user) in process. A deny short-circuits the request with a 403.",
    params: [
      { key: "policy", label: "Policy", type: "text", default: "default-prod-policy" },
      { key: "mode", label: "Mode", type: "select", options: ["enforce", "shadow"], default: "enforce" },
    ],
    summary: (p) => `${p.policy || "policy"} (${p.mode || "enforce"})`,
  },
  {
    kind: "budget_gate", label: "Budget gate", group: "Gates", modes: ["pipeline", "trace"], icon: L(Wallet), tone: "warn",
    desc: "Token and cost budgets", hasIn: true, hasOut: true,
    about: "Checks Redis counters against the applicable budgets. Over a hard cap the request is rejected with a 402.",
    params: [
      { key: "budget", label: "Budget", type: "text", default: "recsys-monthly" },
      { key: "onBreach", label: "On breach", type: "select", options: ["WARN", "THROTTLE", "BLOCK"], default: "THROTTLE" },
    ],
    summary: (p) => `${p.budget || "budget"} (${p.onBreach || "THROTTLE"})`,
  },
  {
    kind: "quota_gate", label: "Quota gate", group: "Gates", modes: ["pipeline", "trace"], icon: L(Gauge), tone: "warn",
    desc: "Requests and tokens per minute", hasIn: true, hasOut: true,
    about: "Sliding-window rate limits. Over the limit the response is a 429 with a Retry-After header.",
    params: [
      { key: "rpm", label: "Requests / min", type: "number", default: 600 },
      { key: "tpm", label: "Tokens / min", type: "number", default: 200000 },
    ],
    summary: (p) => `${p.rpm || 0} rpm, ${Number(p.tpm || 0).toLocaleString("en-US")} tpm`,
  },
  {
    kind: "document_gate", label: "Document gate", group: "Gates", modes: ["pipeline", "trace"], icon: L(FileText), tone: "info",
    desc: "Scan, extract, price", hasIn: true, hasOut: true,
    about: "Attachments are scanned, extracted, redacted and priced once, keyed by SHA-256, then checked against the document policy.",
    params: [
      { key: "policy", label: "Document policy", type: "text", default: "default-document-policy" },
      { key: "ocr", label: "OCR scanned pages", type: "toggle", default: true },
    ],
    summary: (p) => `${p.policy || "policy"}${p.ocr ? ", OCR" : ""}`,
  },
  {
    kind: "cache", label: "Semantic cache", group: "Gates", modes: ["pipeline"], icon: SI(siRedis), tone: "violet", planned: true,
    desc: "Reuse near-identical answers", hasIn: true, hasOut: true,
    about: "Planned. Returns a stored completion for near-duplicate prompts and skips the provider call.",
    params: [{ key: "ttl", label: "TTL (s)", type: "number", default: 900 }],
    summary: (p) => `ttl ${p.ttl || 900}s`,
  },
  {
    kind: "router", label: "Router", group: "Routing", modes: ["pipeline", "trace"], icon: L(Route), tone: "info",
    desc: "Pick a provider and model", hasIn: true, hasOut: true,
    about: "Chooses a provider route using health, cost, latency or priority. Model aliases resolve here.",
    params: [
      { key: "strategy", label: "Strategy", type: "select", options: ["health-aware", "lowest-cost", "lowest-latency", "priority"], default: "health-aware" },
      { key: "retries", label: "Retries", type: "number", default: 2 },
    ],
    summary: (p) => String(p.strategy || "health-aware"),
  },
  {
    kind: "failover", label: "Failover", group: "Routing", modes: ["pipeline", "trace"], icon: L(ArrowRightLeft), tone: "violet",
    desc: "Circuit breaker and fallback", hasIn: true, hasOut: true,
    about: "When the primary route times out or returns 5xx, the circuit opens and the next route is tried.",
    params: [
      { key: "timeoutMs", label: "Trip after (ms)", type: "number", default: 3000 },
      { key: "threshold", label: "Failure threshold", type: "number", default: 5 },
    ],
    summary: (p) => `trip ${p.timeoutMs || 3000} ms`,
  },
  { kind: "provider_openai", label: "OpenAI", group: "Providers", modes: ["pipeline", "trace"], icon: SI(siOpenai), tone: "neutral", desc: "GPT family", hasIn: true, hasOut: true, about: "OpenAI adapter.", params: providerParams, summary: (p) => String(p.model || "gpt-5") },
  { kind: "provider_anthropic", label: "Anthropic", group: "Providers", modes: ["pipeline", "trace"], icon: SI(siAnthropic), tone: "neutral", desc: "Claude family", hasIn: true, hasOut: true, about: "Anthropic adapter.", params: providerParams, summary: (p) => String(p.model || "claude-sonnet-5") },
  { kind: "provider_gemini", label: "Google Gemini", group: "Providers", modes: ["pipeline", "trace"], icon: SI(siGooglegemini), tone: "neutral", desc: "Gemini family", hasIn: true, hasOut: true, about: "Google adapter.", params: providerParams, summary: (p) => String(p.model || "gemini-2-5-pro") },
  { kind: "provider_bedrock", label: "AWS Bedrock", group: "Providers", modes: ["pipeline", "trace"], icon: SI(siAmazonwebservices), tone: "neutral", desc: "Managed multi-model", hasIn: true, hasOut: true, about: "Bedrock adapter.", params: providerParams, summary: (p) => String(p.model || "") },
  { kind: "provider_mistral", label: "Mistral AI", group: "Providers", modes: ["pipeline", "trace"], icon: { cdn: "mistralai", hex: "FA520F", fallback: Server }, tone: "neutral", desc: "Mistral models", hasIn: true, hasOut: true, about: "Mistral adapter. Icon loads from cdn.simpleicons.org.", params: providerParams, summary: (p) => String(p.model || "") },
  { kind: "provider_deepseek", label: "DeepSeek", group: "Providers", modes: ["pipeline", "trace"], icon: { cdn: "deepseek", hex: "4D6BFE", fallback: Server }, tone: "neutral", desc: "DeepSeek models", hasIn: true, hasOut: true, about: "DeepSeek adapter. Icon loads from cdn.simpleicons.org.", params: providerParams, summary: (p) => String(p.model || "") },
  { kind: "provider_azure", label: "Azure OpenAI", group: "Providers", modes: ["pipeline", "trace"], icon: { cdn: "microsoftazure", hex: "0078D4", fallback: Server }, tone: "neutral", desc: "Azure hosted GPT", hasIn: true, hasOut: true, about: "Azure OpenAI adapter. Icon loads from cdn.simpleicons.org.", params: providerParams, summary: (p) => String(p.model || "") },
  { kind: "provider_huggingface", label: "Hugging Face", group: "Providers", modes: ["pipeline", "trace"], icon: SI(siHuggingface), tone: "neutral", desc: "Inference endpoints", hasIn: true, hasOut: true, about: "Hugging Face adapter.", params: providerParams, summary: (p) => String(p.model || "") },
  { kind: "provider_ollama", label: "Ollama", group: "Providers", modes: ["pipeline", "trace"], icon: SI(siOllama), tone: "neutral", desc: "Self-hosted models", hasIn: true, hasOut: true, about: "Self-hosted adapter for in-VPC models.", params: providerParams, summary: (p) => String(p.model || "") },
  {
    kind: "meter", label: "Meter and cost", group: "Observers", modes: ["pipeline", "trace"], icon: SI(siClickhouse), tone: "info",
    desc: "Immutable usage event", hasIn: true, hasOut: false,
    about: "Writes the token and cost event. Events are append-only and feed analytics, budgets and billing.",
    params: [{ key: "dims", label: "Dimensions", type: "list", default: "tenant, project, app, user, model" }],
    summary: () => "usage_events",
  },
  {
    kind: "audit", label: "Audit log", group: "Observers", modes: ["pipeline", "trace"], icon: L(ScrollText), tone: "info",
    desc: "Append-only record", hasIn: true, hasOut: false,
    about: "Every decision, allow or deny, is written to the append-only audit store.",
    params: [{ key: "retention", label: "Retention (years)", type: "number", default: 7 }],
    summary: (p) => `${p.retention || 7} yr retention`,
  },
  {
    kind: "kafka", label: "Event stream", group: "Observers", modes: ["pipeline", "trace"], icon: SI(siApachekafka), tone: "info",
    desc: "Publish to Kafka", hasIn: true, hasOut: false,
    about: "Publishes usage and policy events for downstream consumers.",
    params: [{ key: "topic", label: "Topic", type: "text", default: "ai.usage" }],
    summary: (p) => String(p.topic || "ai.usage"),
  },
  {
    kind: "otel", label: "OpenTelemetry", group: "Observers", modes: ["pipeline", "trace"], icon: SI(siOpentelemetry), tone: "info",
    desc: "Export spans", hasIn: true, hasOut: false,
    about: "Exports one span per stage to your collector.",
    params: [{ key: "endpoint", label: "Endpoint", type: "text", default: "http://otel-collector:4317" }],
    summary: (p) => String(p.endpoint || ""),
  },
  {
    kind: "search_index", label: "Search index", group: "Observers", modes: ["pipeline", "trace"], icon: SI(siOpensearch), tone: "info",
    desc: "Index for the Audit Explorer", hasIn: true, hasOut: false,
    about: "Indexes events so they are searchable in the Audit and Usage explorers.",
    params: [{ key: "index", label: "Index", type: "text", default: "tokener-audit" }],
    summary: (p) => String(p.index || ""),
  },
  {
    kind: "notify_slack", label: "Slack", group: "Notify", modes: ["pipeline", "trace"], icon: SI(siSlack), tone: "neutral",
    desc: "Post to a channel", hasIn: true, hasOut: false,
    about: "Posts a message on budget warnings, breaches and provider incidents.",
    params: [{ key: "channel", label: "Channel", type: "text", default: "#ai-platform-alerts" }],
    summary: (p) => String(p.channel || ""),
  },
  {
    kind: "notify_pagerduty", label: "PagerDuty", group: "Notify", modes: ["pipeline", "trace"], icon: SI(siPagerduty), tone: "neutral",
    desc: "Page on-call", hasIn: true, hasOut: false,
    about: "Creates an incident for critical events.",
    params: [{ key: "service", label: "Service", type: "text", default: "ai-gateway" }],
    summary: (p) => String(p.service || ""),
  },
  {
    kind: "notify_teams", label: "Microsoft Teams", group: "Notify", modes: ["pipeline", "trace"], icon: { cdn: "microsoftteams", hex: "6264A7", fallback: Bell }, tone: "neutral",
    desc: "Post to a Teams channel", hasIn: true, hasOut: false,
    about: "Posts an adaptive card. Icon loads from cdn.simpleicons.org.",
    params: [{ key: "channel", label: "Channel", type: "text", default: "AI Platform" }],
    summary: (p) => String(p.channel || ""),
  },
  {
    kind: "notify_email", label: "Email", group: "Notify", modes: ["pipeline", "trace"], icon: L(Mail), tone: "neutral",
    desc: "Send an email", hasIn: true, hasOut: false,
    about: "Sends to a distribution list.",
    params: [{ key: "to", label: "Recipients", type: "list", default: "finops@example.com" }],
    summary: (p) => String(p.to || ""),
  },
  {
    kind: "notify_webhook", label: "Webhook", group: "Notify", modes: ["pipeline", "trace"], icon: L(Webhook), tone: "neutral",
    desc: "Signed HTTP callback", hasIn: true, hasOut: false,
    about: "Delivers a signed JSON payload with retries.",
    params: [{ key: "url", label: "URL", type: "text", default: "https://example.com/hooks/tokener" }],
    summary: (p) => String(p.url || ""),
  },
  {
    kind: "reject", label: "Reject", group: "Outcomes", modes: ["pipeline", "trace"], icon: L(XCircle), tone: "danger",
    desc: "RFC 7807 error", hasIn: true, hasOut: true,
    about: "Returns a typed RFC 7807 problem response the caller can switch on.",
    params: [
      { key: "status", label: "HTTP status", type: "select", options: ["403", "402", "429", "503"], default: "403" },
      { key: "code", label: "Error code", type: "text", default: "policy_denied" },
    ],
    summary: (p) => `${p.status || 403} ${p.code || "policy_denied"}`,
  },
  {
    kind: "response", label: "Response", group: "Outcomes", modes: ["pipeline", "trace"], icon: L(Send), tone: "accent",
    desc: "Return to caller", hasIn: true, hasOut: true,
    about: "Streams or returns the completion to the caller with usage headers.",
    params: [{ key: "stream", label: "Streaming", type: "toggle", default: true }],
    summary: (p) => (p.stream ? "streaming" : "buffered"),
  },
];

export const BY_KIND: Record<string, NodeDef> = Object.fromEntries(CATALOG.map((n) => [n.kind, n]));

export function defaultsFor(kind: string): Record<string, any> {
  const d = BY_KIND[kind];
  const out: Record<string, any> = {};
  d?.params.forEach((p) => {
    if (p.default !== undefined) out[p.key] = p.default;
  });
  return out;
}

export function paletteGroups(mode: "policy" | "pipeline" | "trace") {
  const groups: { name: string; items: NodeDef[] }[] = [];
  CATALOG.filter((n) => n.modes.includes(mode)).forEach((n) => {
    let g = groups.find((x) => x.name === n.group);
    if (!g) groups.push((g = { name: n.group, items: [] }));
    g.items.push(n);
  });
  return groups;
}
