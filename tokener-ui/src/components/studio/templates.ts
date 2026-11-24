import { defaultsFor } from "./catalog";
import { autoLayout, defaultEdgeType } from "./layout";
import type { EdgeType, GEdge, GNode, Graph, Mode, NodeStatus, TraceMeta } from "./types";

type NSpec = [id: string, kind: string, params?: Record<string, any>, meta?: Partial<TraceMeta> & { status: NodeStatus }];
type ESpec = [from: string, to: string, type?: EdgeType, label?: string];

export function build(nodes: NSpec[], edges: ESpec[]): Graph {
  const gn: GNode[] = nodes.map(([id, kind, params, meta]) => ({
    id,
    kind,
    x: 0,
    y: 0,
    params: { ...defaultsFor(kind), ...(params || {}) },
    meta: meta ? { startMs: 0, ms: 0, attrs: {}, ...meta } : undefined,
  }));
  const kindOf = new Map(gn.map((n) => [n.id, n.kind]));
  const ge: GEdge[] = edges.map(([from, to, type, label], i) => ({
    id: `e${i + 1}_${from}_${to}`,
    from,
    to,
    type: type ?? defaultEdgeType(kindOf.get(from)!, kindOf.get(to)!),
    label,
  }));
  return autoLayout({ nodes: gn, edges: ge });
}

export type Template = { id: string; name: string; blurb: string; graph: () => Graph };

/* ------------------------------------------------------------------ policy */

const policyShell = (rules: NSpec[], policy: Record<string, any>): Graph =>
  build(
    [["request", "request"], ...rules, ["policy", "policy", policy], ["decision", "decision"]],
    [
      ...rules.map((r) => ["request", r[0]] as ESpec),
      ...rules.map((r) => [r[0], "policy"] as ESpec),
      ["policy", "decision", "flow"],
    ]
  );

export const POLICY_TEMPLATES: Template[] = [
  {
    id: "retail",
    name: "Retail bank, business hours",
    blurb: "Allow-list, preview ban, hours, token and cost caps",
    graph: () =>
      policyShell(
        [
          ["allow", "allow_model", { models: "gpt-5, claude-sonnet-5, gemini-2-5-pro" }],
          ["deny", "deny_model", { models: "*-preview" }],
          ["hours", "allow_hours", { from: "08:00", to: "18:00", timezone: "Asia/Bahrain" }],
          ["tok", "limit_tokens", { amount: 100000, grain: "user", period: "day" }],
          ["cost", "limit_cost", { amount: 50, currency: "USD", grain: "project", period: "day" }],
          ["img", "deny_capability", { capability: "IMAGE" }],
          ["breach", "on_breach", { action: "THROTTLE" }],
        ],
        { name: "default-prod-policy", scopeType: "TENANT", scopeIdent: "prod", enforce: false }
      ),
  },
  {
    id: "intern",
    name: "Intern sandbox",
    blurb: "Small models only, no tools, hard block on spend",
    graph: () =>
      policyShell(
        [
          ["allow", "allow_model", { models: "gpt-5-mini, claude-haiku-5, gemini-2-5-flash" }],
          ["tools", "deny_capability", { capability: "TOOLS" }],
          ["cost", "limit_cost", { amount: 5, currency: "USD", grain: "user", period: "day" }],
          ["breach", "on_breach", { action: "BLOCK" }],
        ],
        { name: "intern-sandbox", scopeType: "PROJECT", scopeIdent: "intern-experiments", enforce: false }
      ),
  },
  {
    id: "eu",
    name: "Org mandate, EU residency",
    blurb: "ENFORCE at org scope, with planned region and PII rules",
    graph: () =>
      policyShell(
        [
          ["deny", "deny_model", { models: "*-preview, *-experimental" }],
          ["aud", "deny_capability", { capability: "AUDIO" }],
          ["region", "region_pin", { regions: "eu-west-1, eu-central-1" }],
          ["pii", "pii_mask", { entities: "EMAIL, IBAN, PHONE", mode: "mask" }],
          ["breach", "on_breach", { action: "BLOCK" }],
        ],
        { name: "eu-data-residency", scopeType: "ORG", scopeIdent: "", enforce: true }
      ),
  },
  {
    id: "blank",
    name: "Blank policy",
    blurb: "Just the request, policy and decision nodes",
    graph: () => policyShell([], { name: "new-policy", scopeType: "TENANT", scopeIdent: "prod", enforce: false }),
  },
];

/* ---------------------------------------------------------------- pipeline */

export const PIPELINE_TEMPLATES: Template[] = [
  {
    id: "standard",
    name: "Standard gateway",
    blurb: "Auth, policy, budget, quota, route with failover, meter and audit",
    graph: () =>
      build(
        [
          ["app", "client_app"],
          ["auth", "authenticate"],
          ["scope", "resolve_scope"],
          ["policy", "policy_gate"],
          ["budget", "budget_gate"],
          ["quota", "quota_gate"],
          ["router", "router"],
          ["openai", "provider_openai", { model: "gpt-5" }],
          ["claude", "provider_anthropic", { model: "claude-sonnet-5" }],
          ["resp", "response"],
          ["rej403", "reject", { status: "403", code: "policy_denied" }],
          ["rej402", "reject", { status: "402", code: "budget_exceeded" }],
          ["rej429", "reject", { status: "429", code: "rate_limited" }],
          ["meter", "meter"],
          ["audit", "audit"],
          ["slack", "notify_slack"],
        ],
        [
          ["app", "auth"], ["auth", "scope"], ["scope", "policy"], ["policy", "budget", "allow"], ["budget", "quota", "allow"],
          ["quota", "router", "allow"], ["router", "openai"], ["router", "claude", "failover", "on 5xx"],
          ["openai", "resp"], ["claude", "resp"],
          ["policy", "rej403", "deny"], ["budget", "rej402", "deny"], ["quota", "rej429", "deny"],
          ["resp", "meter", "async"], ["resp", "audit", "async"], ["rej403", "audit", "async"], ["budget", "slack", "async", "80% warn"],
        ]
      ),
  },
  {
    id: "regulated",
    name: "Regulated, documents and in-VPC model",
    blurb: "Document gate, Bedrock plus self-hosted fallback, paging and event stream",
    graph: () =>
      build(
        [
          ["app", "client_app", { name: "claims-assistant", sdk: "java" }],
          ["auth", "authenticate", { method: "OIDC JWT" }],
          ["scope", "resolve_scope", { source: "JWT claim" }],
          ["policy", "policy_gate", { policy: "eu-data-residency", mode: "enforce" }],
          ["doc", "document_gate"],
          ["budget", "budget_gate", { budget: "claims-monthly", onBreach: "BLOCK" }],
          ["router", "router", { strategy: "priority" }],
          ["bedrock", "provider_bedrock", { model: "claude-sonnet-5", region: "eu-central-1" }],
          ["ollama", "provider_ollama", { model: "llama-3.3-70b", region: "in-vpc" }],
          ["resp", "response"],
          ["rej", "reject", { status: "403", code: "policy_denied" }],
          ["meter", "meter"],
          ["audit", "audit"],
          ["kafka", "kafka", { topic: "ai.usage" }],
          ["otel", "otel"],
          ["pd", "notify_pagerduty"],
        ],
        [
          ["app", "auth"], ["auth", "scope"], ["scope", "policy"], ["policy", "doc", "allow"], ["doc", "budget"], ["budget", "router", "allow"],
          ["router", "bedrock"], ["router", "ollama", "failover", "on failure"],
          ["bedrock", "resp"], ["ollama", "resp"], ["policy", "rej", "deny"],
          ["resp", "meter", "async"], ["resp", "audit", "async"], ["meter", "kafka", "async"], ["resp", "otel", "async"], ["router", "pd", "async", "all routes down"],
        ]
      ),
  },
  {
    id: "costroute",
    name: "Cost-aware multi-provider",
    blurb: "One router fanning out to five providers",
    graph: () =>
      build(
        [
          ["app", "client_app", { name: "recsys", sdk: "python" }],
          ["auth", "authenticate"],
          ["policy", "policy_gate"],
          ["router", "router", { strategy: "lowest-cost" }],
          ["openai", "provider_openai", { model: "gpt-5-mini" }],
          ["claude", "provider_anthropic", { model: "claude-haiku-5" }],
          ["gem", "provider_gemini", { model: "gemini-2-5-flash" }],
          ["mistral", "provider_mistral", { model: "mistral-small" }],
          ["deep", "provider_deepseek", { model: "deepseek-chat" }],
          ["resp", "response"],
          ["meter", "meter"],
        ],
        [
          ["app", "auth"], ["auth", "policy"], ["policy", "router", "allow"],
          ["router", "openai"], ["router", "claude"], ["router", "gem"], ["router", "mistral"], ["router", "deep"],
          ["openai", "resp"], ["claude", "resp"], ["gem", "resp"], ["mistral", "resp"], ["deep", "resp"],
          ["resp", "meter", "async"],
        ]
      ),
  },
  {
    id: "blank",
    name: "Blank pipeline",
    blurb: "A source, a provider and a response",
    graph: () =>
      build(
        [["app", "client_app"], ["router", "router"], ["openai", "provider_openai"], ["resp", "response"]],
        [["app", "router"], ["router", "openai"], ["openai", "resp"]]
      ),
  },
];

/* ------------------------------------------------------------------- trace */

type Meta = { startMs: number; ms: number; status: NodeStatus; attrs?: Record<string, string>; note?: string };
const m = (startMs: number, ms: number, status: NodeStatus, attrs: Record<string, string> = {}, note?: string) => ({ startMs, ms, status, attrs, note });

export type TraceSample = {
  id: string;
  title: string;
  requestId: string;
  outcome: "ok" | "denied" | "warn" | "failover";
  totalMs: number;
  who: string;
  model: string;
  graph: () => Graph;
};


export const TRACE_SAMPLES: TraceSample[] = [
  {
    id: "ok",
    title: "Completed",
    requestId: "req_01JF8Q2M9K4T",
    outcome: "ok",
    totalMs: 861,
    who: "a.rahman@meridianbank.example",
    model: "gpt-5",
    graph: () =>
      build(
        [
          ["app", "client_app", { name: "mobile-banking-app", sdk: "node" }, m(0, 0, "ok", { "http.method": "POST", "http.route": "/v1/chat/completions", "client.ip": "10.12.4.18" })],
          ["auth", "authenticate", {}, m(0, 2, "ok", { principal: "key_3f9a...c1", method: "API key", "cache.hit": "true" })],
          ["scope", "resolve_scope", {}, m(2, 1, "ok", { tenant: "prod", project: "retail-chat", app: "mobile-banking-app", user: "a.rahman" })],
          ["policy", "policy_gate", {}, m(3, 3, "ok", { policy: "default-prod-policy v4", decision: "allow", "rules.evaluated": "5", "rule.hit": "ALLOW MODEL gpt-5", "input.hours": "within 08:00-18:00 Asia/Bahrain" })],
          ["budget", "budget_gate", {}, m(6, 2, "ok", { budget: "recsys-monthly", used: "41%", remaining: "29,540 USD" })],
          ["quota", "quota_gate", {}, m(8, 1, "ok", { rpm: "212 / 600", tpm: "48,100 / 200,000" })],
          ["router", "router", {}, m(9, 1, "ok", { strategy: "health-aware", candidates: "openai, anthropic", chosen: "openai" })],
          ["openai", "provider_openai", { model: "gpt-5" }, m(10, 842, "ok", { "gen_ai.request.model": "gpt-5", "tokens.in": "1,204", "tokens.out": "388", ttft: "211 ms" })],
          ["resp", "response", {}, m(852, 9, "ok", { status: "200", stream: "true" })],
          ["meter", "meter", {}, m(861, 2, "ok", { event: "usage_events", cost: "0.0214 USD", "idempotency.key": "req_01JF8Q2M9K4T" })],
          ["audit", "audit", {}, m(861, 1, "ok", { record: "allow", retained: "7 yr" })],
        ],
        [
          ["app", "auth"], ["auth", "scope"], ["scope", "policy"], ["policy", "budget", "allow"], ["budget", "quota", "allow"], ["quota", "router", "allow"],
          ["router", "openai"], ["openai", "resp"], ["resp", "meter", "async"], ["resp", "audit", "async"],
        ]
      ),
  },
  {
    id: "denied",
    title: "Denied by policy",
    requestId: "req_01JF8Q4W1B7R",
    outcome: "denied",
    totalMs: 9,
    who: "intern.dev@meridianbank.example",
    model: "gpt-5-preview",
    graph: () =>
      build(
        [
          ["app", "client_app", { name: "notebook-sandbox", sdk: "python" }, m(0, 0, "ok", { "http.route": "/v1/chat/completions" })],
          ["auth", "authenticate", {}, m(0, 2, "ok", { principal: "key_88d1...a7" })],
          ["scope", "resolve_scope", {}, m(2, 1, "ok", { tenant: "prod", project: "intern-experiments" })],
          ["policy", "policy_gate", {}, m(3, 4, "error", { policy: "default-prod-policy v4", decision: "deny", "rule.hit": "DENY MODEL *-preview", "input.model": "gpt-5-preview", "breach_action": "block" }, "DENY MODEL *-preview matched gpt-5-preview")],
          ["budget", "budget_gate", {}, m(0, 0, "skip")],
          ["router", "router", {}, m(0, 0, "skip")],
          ["rej", "reject", { status: "403", code: "model_denied" }, m(7, 1, "ok", { "problem.type": "https://tokener.io/problems/model_denied", status: "403" })],
          ["audit", "audit", {}, m(8, 1, "ok", { record: "deny", "request.id": "req_01JF8Q4W1B7R" })],
        ],
        [
          ["app", "auth"], ["auth", "scope"], ["scope", "policy"], ["policy", "budget", "allow"], ["budget", "router", "allow"],
          ["policy", "rej", "deny"], ["rej", "audit", "async"],
        ]
      ),
  },
  {
    id: "throttle",
    title: "Budget warning, throttled",
    requestId: "req_01JF8Q6C5D2H",
    outcome: "warn",
    totalMs: 1128,
    who: "svc-recsys",
    model: "claude-sonnet-5",
    graph: () =>
      build(
        [
          ["app", "service_account", { name: "svc-recsys" }, m(0, 0, "ok", { "http.route": "/v1/chat/completions" })],
          ["auth", "authenticate", {}, m(0, 2, "ok", { principal: "sa_recsys" })],
          ["policy", "policy_gate", {}, m(2, 3, "ok", { decision: "allow" })],
          ["budget", "budget_gate", { budget: "recsys-monthly", onBreach: "THROTTLE" }, m(5, 3, "warn", { used: "82%", threshold: "80%", action: "THROTTLE", "added.delay": "250 ms" }, "82% of recsys-monthly used, throttle applied")],
          ["slack", "notify_slack", { channel: "#ai-platform-alerts" }, m(8, 40, "ok", { delivered: "true" })],
          ["quota", "quota_gate", {}, m(258, 1, "ok", { rpm: "590 / 600" })],
          ["router", "router", { strategy: "lowest-cost" }, m(259, 1, "ok", { chosen: "anthropic" })],
          ["claude", "provider_anthropic", { model: "claude-sonnet-5" }, m(260, 860, "ok", { "tokens.in": "9,810", "tokens.out": "1,240" })],
          ["resp", "response", {}, m(1120, 6, "ok", { status: "200" })],
          ["meter", "meter", {}, m(1126, 2, "ok", { cost: "0.0481 USD" })],
        ],
        [
          ["app", "auth"], ["auth", "policy"], ["policy", "budget", "allow"], ["budget", "quota", "limit", "throttled"], ["budget", "slack", "async", "80% warn"],
          ["quota", "router", "allow"], ["router", "claude"], ["claude", "resp"], ["resp", "meter", "async"],
        ]
      ),
  },
  {
    id: "failover",
    title: "Provider failover",
    requestId: "req_01JF8Q8N3Y6P",
    outcome: "failover",
    totalMs: 3980,
    who: "k.nair@meridianbank.example",
    model: "gpt-5 to claude-sonnet-5",
    graph: () =>
      build(
        [
          ["app", "client_app", { name: "advisor-portal", sdk: "java" }, m(0, 0, "ok", { "http.route": "/v1/chat/completions" })],
          ["auth", "authenticate", {}, m(0, 2, "ok")],
          ["policy", "policy_gate", {}, m(2, 3, "ok", { decision: "allow" })],
          ["router", "router", {}, m(5, 1, "ok", { chosen: "openai", fallback: "anthropic" })],
          ["openai", "provider_openai", { model: "gpt-5" }, m(6, 3000, "error", { error: "503 upstream_unavailable", "circuit.state": "open" }, "503 after 3000 ms, circuit opened")],
          ["fail", "failover", {}, m(3006, 2, "ok", { reason: "timeout", next: "anthropic" })],
          ["claude", "provider_anthropic", { model: "claude-sonnet-5" }, m(3008, 960, "ok", { "tokens.in": "2,090", "tokens.out": "512" })],
          ["resp", "response", {}, m(3968, 6, "ok", { status: "200", "x-tokener-route": "anthropic (failover)" })],
          ["meter", "meter", {}, m(3974, 2, "ok", { cost: "0.0123 USD", "billed.provider": "anthropic" })],
          ["pd", "notify_pagerduty", { service: "ai-gateway" }, m(3010, 30, "ok", { severity: "warning", summary: "openai route degraded" })],
        ],
        [
          ["app", "auth"], ["auth", "policy"], ["policy", "router", "allow"], ["router", "openai"], ["openai", "fail", "failover", "503"],
          ["fail", "claude", "failover"], ["claude", "resp"], ["resp", "meter", "async"], ["fail", "pd", "async"],
        ]
      ),
  },
  {
    id: "document",
    title: "Document request",
    requestId: "req_01JF8QAH7Z0E",
    outcome: "ok",
    totalMs: 2214,
    who: "claims-assistant",
    model: "gemini-2-5-pro",
    graph: () =>
      build(
        [
          ["app", "client_app", { name: "claims-assistant", sdk: "java" }, m(0, 0, "ok", { "attachments": "1 (claim-48291.pdf)" })],
          ["auth", "authenticate", {}, m(0, 3, "ok")],
          ["policy", "policy_gate", {}, m(3, 3, "ok", { decision: "allow" })],
          ["doc", "document_gate", {}, m(6, 340, "ok", { sha256: "9c41...e07", cache: "miss", pages: "12", "ocr.pages": "3", "tokens.estimated": "18,400", scan: "clean" })],
          ["budget", "budget_gate", {}, m(346, 2, "ok", { used: "18%" })],
          ["router", "router", {}, m(348, 1, "ok", { chosen: "gemini" })],
          ["gem", "provider_gemini", { model: "gemini-2-5-pro" }, m(349, 1840, "ok", { "tokens.in": "18,212", "tokens.out": "904" })],
          ["resp", "response", {}, m(2189, 14, "ok")],
          ["meter", "meter", {}, m(2203, 3, "ok", { cost: "0.1130 USD" })],
          ["audit", "audit", {}, m(2203, 2, "ok")],
        ],
        [
          ["app", "auth"], ["auth", "policy"], ["policy", "doc", "allow"], ["doc", "budget"], ["budget", "router", "allow"], ["router", "gem"],
          ["gem", "resp"], ["resp", "meter", "async"], ["resp", "audit", "async"],
        ]
      ),
  },
];


export function templatesFor(mode: Mode): Template[] {
  return mode === "policy" ? POLICY_TEMPLATES : mode === "pipeline" ? PIPELINE_TEMPLATES : [];
}
