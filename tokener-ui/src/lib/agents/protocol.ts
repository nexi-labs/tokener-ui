/**
 * tok∑ner Agent Protocols (TAP) 1.0. The executable form of docs/48-agent-protocols.md.
 * The console uses it to show the protocols, to validate messages in the Wire Lab and to check agent cards.
 * It has no dependency on the browser, so scripts/check-agent-protocol.ts runs it under Node.
 */

export const TAP_VERSION = "1.0";
export const MEDIA_TYPE = "application/vnd.tokener.tap+json";
export const MAX_DEPTH = 8;

export type ProtocolId = "atlas" | "tether" | "relay" | "gate" | "ledger" | "pulse";

export const PROTOCOLS: { id: ProtocolId; name: string; does: string; counterpart: string; long: string }[] = [
  { id: "atlas", name: "Atlas", does: "Discovery", counterpart: "DNS and robots.txt", long: "Find agents and read what each one can do. Every agent publishes a card at /.well-known/tokener-agent.json." },
  { id: "tether", name: "Tether", does: "Identity and handshake", counterpart: "The TLS handshake", long: "Agree on a version, prove who the agent is, and obtain short-lived tokens that are bound to one callee and record who delegated." },
  { id: "relay", name: "Relay", does: "Tasks and messages", counterpart: "HTTP request and response", long: "Hand a task to another agent and follow it: stream progress, ask for input, cancel, receive the result and the artifacts." },
  { id: "gate", name: "Gate", does: "Decisions on actions", counterpart: "Authorization and proxies", long: "Ask whether an action is allowed. The answer is allow, deny, modify or approve, always with a reason, and may wait for a person." },
  { id: "ledger", name: "Ledger", does: "Usage and cost", counterpart: "Access logs", long: "Every final result carries a receipt of what each step cost. The platform adds child receipts, so a workflow has one total." },
  { id: "pulse", name: "Pulse", does: "Health and control", counterpart: "Health checks and Connection: close", long: "Report readiness, and obey suspend, resume and drain. This is how an agent is stopped on purpose." },
];

// ---------------------------------------------------------------------------------------------------------------------------------------
// Field schema

export type FieldType = "string" | "integer" | "number" | "boolean" | "object" | "array" | "enum" | "agentUri" | "url" | "time";
export type Field = {
  key: string;
  type: FieldType;
  required?: boolean;
  help?: string;
  values?: string[];
  min?: number;
  max?: number;
  /** Array items. */
  items?: Field;
  /** Object members. When absent the object is free form. */
  fields?: Field[];
  example?: unknown;
};

const s = (key: string, help?: string, extra: Partial<Field> = {}): Field => ({ key, type: "string", help, ...extra });
const req = (f: Field): Field => ({ ...f, required: true });
const en = (key: string, values: string[], help?: string): Field => ({ key, type: "enum", values, help });
const obj = (key: string, fields?: Field[], help?: string): Field => ({ key, type: "object", fields, help });
const arr = (key: string, items: Field, help?: string): Field => ({ key, type: "array", items, help });
const int = (key: string, help?: string, min?: number, max?: number): Field => ({ key, type: "integer", help, min, max });

export const TASK_STATES = ["submitted", "working", "input-required", "completed", "failed", "canceled", "rejected", "suspended"] as const;
export const FINAL_STATES = ["completed", "failed", "canceled", "rejected"] as const;
export const AUTH_SCHEMES = ["oauth2-client-credentials", "jwt-bearer", "mtls", "api-key"] as const;
export const MODES = ["sync", "stream", "async", "webhook"] as const;
export const STEP_KINDS = ["llm", "tool", "mcp", "retrieval", "delegation"] as const;

const errorField = obj("error", [req(s("code")), req(s("message")), { key: "retryable", type: "boolean" }, int("retryAfterMs", undefined, 0)]);
const stepField = obj("steps_item", [
  { ...en("kind", [...STEP_KINDS]), required: true }, s("model"), int("tokensIn", undefined, 0), int("tokensOut", undefined, 0),
  { key: "costMinor", type: "integer", required: true, min: 0 }, req(s("currency")), int("ms", undefined, 0),
]);

export type MessageSpec = { protocol: ProtocolId; summary: string; direction: string; payload: Field[]; reply?: string };

export const MESSAGES: Record<string, MessageSpec> = {
  "atlas.card.get": { protocol: "atlas", summary: "Ask an agent for its card.", direction: "caller to callee or broker", payload: [], reply: "atlas.card" },
  "atlas.card": { protocol: "atlas", summary: "The agent card.", direction: "reply", payload: [req(obj("card", undefined, "See the card fields."))] },
  "atlas.search": { protocol: "atlas", summary: "Search the catalog of registered agents.", direction: "caller to broker", reply: "atlas.results",
    payload: [s("capability"), s("owner"), s("tag"), int("limit", "At most this many results.", 1, 100)] },
  "atlas.results": { protocol: "atlas", summary: "Matching agents.", direction: "reply",
    payload: [req(arr("agents", obj("agents_item", [req({ key: "uri", type: "agentUri" }), req(s("name")), s("summary"), arr("capabilities", s("capability_item"))])))] },

  "tether.hello": { protocol: "tether", summary: "Open a session and offer versions, auth schemes and capabilities.", direction: "caller to callee", reply: "tether.accept",
    payload: [req(arr("versions", s("version_item"), "Versions the sender speaks, for example 1.0.")), req(en("conformance", ["observe", "govern", "collaborate"])), arr("auth", { key: "auth_item", type: "enum", values: [...AUTH_SCHEMES] }), arr("capabilities", s("capability_item"))] },
  "tether.accept": { protocol: "tether", summary: "Accept the session at one version.", direction: "reply",
    payload: [req(s("version")), req(s("session")), { ...int("expiresInSec", undefined, 1, 86400), required: true }, req(en("mode", [...MODES]))] },
  "tether.reject": { protocol: "tether", summary: "Refuse the session.", direction: "reply", payload: [req(s("code")), req(s("reason")), arr("supported", s("version_item"))] },
  "tether.token": { protocol: "tether", summary: "A short-lived token bound to one callee.", direction: "broker to caller",
    payload: [req(s("audience", "The one callee that may accept this token.")), req(arr("scope", s("scope_item"))), { ...int("expiresInSec", undefined, 1, 3600), required: true }, { key: "delegatedFrom", type: "agentUri" }] },

  "relay.task.create": { protocol: "relay", summary: "Hand a task to an agent.", direction: "caller to callee", reply: "relay.task.result",
    payload: [req(obj("task", [s("capability"), req(obj("input"))], "The work. input is free form and is treated as untrusted data.")), req(en("mode", [...MODES])), { key: "callbackUrl", type: "url", help: "Required when mode is webhook." },
      obj("budget", [{ key: "maxCostMinor", type: "integer", required: true, min: 0 }, req(s("currency")), int("maxTokens", undefined, 1)], "The callee stops rather than spend past this."), int("deadlineMs", "Hard limit from receipt.", 1, 86400000)] },
  "relay.task.update": { protocol: "relay", summary: "Progress on a task.", direction: "callee to caller",
    payload: [req(s("taskId")), req(en("state", [...TASK_STATES])), { key: "progress", type: "number", min: 0, max: 1 }, s("message")] },
  "relay.task.result": { protocol: "relay", summary: "The final state of a task, with output and receipt.", direction: "callee to caller",
    payload: [req(s("taskId")), req(en("state", [...FINAL_STATES])), obj("output"), arr("artifacts", obj("artifacts_item", [req(s("name")), s("mediaType"), s("uri")])), errorField, obj("receipt", undefined, "A ledger.receipt payload.")] },
  "relay.task.cancel": { protocol: "relay", summary: "Stop a task.", direction: "caller to callee", payload: [req(s("taskId")), s("reason")] },
  "relay.task.input-required": { protocol: "relay", summary: "The task needs input before it can continue.", direction: "callee to caller",
    payload: [req(s("taskId")), req(s("question")), obj("schema")] },
  "relay.task.input": { protocol: "relay", summary: "Supply the requested input.", direction: "caller to callee", payload: [req(s("taskId")), req(obj("input"))] },
  "relay.message": { protocol: "relay", summary: "A conversational message outside a task.", direction: "either",
    payload: [req(en("role", ["user", "agent"])), req(arr("parts", obj("parts_item", [req(en("kind", ["text", "data", "file"])), s("text"), obj("data"), s("uri"), s("mediaType")])))] },

  "gate.check": { protocol: "gate", summary: "Ask whether an action is allowed.", direction: "agent to broker", reply: "gate.decision",
    payload: [req(obj("action", [req(en("kind", ["tool", "model", "delegate", "data"])), req(s("name")), obj("arguments")])), obj("context")] },
  "gate.decision": { protocol: "gate", summary: "The decision, always with a reason.", direction: "reply",
    payload: [req(en("decision", ["allow", "deny", "modify", "approve"])), req(s("reason")), s("policyId"), obj("modified", undefined, "The action as the broker will allow it, when the decision is modify."), s("approvalId")] },
  "gate.approval.request": { protocol: "gate", summary: "A person is asked to approve an action.", direction: "broker to people",
    payload: [req(s("approvalId")), req(s("summary")), req(obj("action")), { ...int("expiresInSec", undefined, 1, 604800), required: true }] },
  "gate.approval.result": { protocol: "gate", summary: "The outcome of an approval.", direction: "broker to agent",
    payload: [req(s("approvalId")), req(en("outcome", ["approved", "rejected", "expired"])), s("by")] },

  "ledger.receipt": { protocol: "ledger", summary: "What a task cost, step by step.", direction: "callee to caller",
    payload: [s("taskId"), req(arr("steps", stepField)), { key: "totalMinor", type: "integer", required: true, min: 0 }] },
  "ledger.budget": { protocol: "ledger", summary: "How much budget is left.", direction: "broker to agent",
    payload: [{ key: "remainingMinor", type: "integer", required: true, min: 0 }, req(s("currency")), req(en("period", ["day", "week", "month"])), { key: "resetsAt", type: "time", required: true }] },

  "pulse.ping": { protocol: "pulse", summary: "Are you there?", direction: "either", payload: [], reply: "pulse.status" },
  "pulse.status": { protocol: "pulse", summary: "Readiness and load.", direction: "reply",
    payload: [req(en("state", ["ready", "degraded", "draining", "suspended"])), req(s("version")), { key: "inFlight", type: "integer", required: true, min: 0 }, int("uptimeSec", undefined, 0)] },
  "pulse.suspend": { protocol: "pulse", summary: "Stop taking work.", direction: "broker to agent",
    payload: [req(s("reason")), req(s("by")), req(en("mode", ["now", "after-current"]))] },
  "pulse.resume": { protocol: "pulse", summary: "Take work again.", direction: "broker to agent", payload: [req(s("by"))] },
  "pulse.drain": { protocol: "pulse", summary: "Finish current tasks and accept no new ones.", direction: "broker to agent", payload: [{ key: "deadlineMs", type: "integer", required: true, min: 1 }] },
};
export const MESSAGE_TYPES = Object.keys(MESSAGES);

export const ERROR_CODES: { code: string; meaning: string; retryable: "yes" | "no" | "later" | "maybe" }[] = [
  { code: "tap.invalid_envelope", meaning: "A required field is missing or malformed.", retryable: "no" },
  { code: "tap.unsupported_version", meaning: "The major version is not supported.", retryable: "no" },
  { code: "tap.unauthorized", meaning: "Identity or signature not accepted.", retryable: "no" },
  { code: "tap.forbidden", meaning: "Authenticated but not allowed.", retryable: "no" },
  { code: "tap.policy_denied", meaning: "A Gate decision denied it.", retryable: "no" },
  { code: "tap.budget_exceeded", meaning: "The budget would be exceeded.", retryable: "no" },
  { code: "tap.suspended", meaning: "The agent is suspended or draining.", retryable: "later" },
  { code: "tap.expired", meaning: "The message passed its ttlMs.", retryable: "no" },
  { code: "tap.depth_exceeded", meaning: `trace.depth is above the limit of ${MAX_DEPTH}.`, retryable: "no" },
  { code: "tap.not_found", meaning: "The capability, task or agent is unknown.", retryable: "no" },
  { code: "tap.conflict", meaning: "The same id arrived with a different body.", retryable: "no" },
  { code: "tap.timeout", meaning: "The deadline was reached.", retryable: "maybe" },
  { code: "tap.unavailable", meaning: "The agent cannot take work now.", retryable: "yes" },
];

// ---------------------------------------------------------------------------------------------------------------------------------------
// Validation

export type Issue = { path: string; message: string };

const URI = /^agent:\/\/([a-z][a-z0-9-]{1,62})\/([a-z][a-z0-9-]{1,62})$/;
const EXT_URI = /^agent\+https:\/\/[^\s/]+(\/\S*)?$/;
const ULID = /^[a-z]{3,8}_[0-9A-HJKMNP-TV-Z]{26}$/;
const TRACEPARENT = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export const isAgentUri = (v: unknown): v is string => typeof v === "string" && (URI.test(v) || EXT_URI.test(v));
export const isHttpsUrl = (v: unknown): boolean => { if (typeof v !== "string") return false; try { return new URL(v).protocol === "https:"; } catch { return false; } };
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function check(f: Field, v: unknown, path: string, out: Issue[]) {
  const label = f.key.replace(/_item$/, "");
  switch (f.type) {
    case "string": if (typeof v !== "string" || v.trim() === "") out.push({ path, message: `${label} must be a non-empty string.` }); return;
    case "integer": case "number": {
      if (typeof v !== "number" || !Number.isFinite(v) || (f.type === "integer" && !Number.isInteger(v))) { out.push({ path, message: `${label} must be ${f.type === "integer" ? "a whole number" : "a number"}.` }); return; }
      if (f.min !== undefined && v < f.min) out.push({ path, message: `${label} must be at least ${f.min}.` });
      if (f.max !== undefined && v > f.max) out.push({ path, message: `${label} must be at most ${f.max}.` });
      return;
    }
    case "boolean": if (typeof v !== "boolean") out.push({ path, message: `${label} must be true or false.` }); return;
    case "enum": if (typeof v !== "string" || !f.values!.includes(v)) out.push({ path, message: `${label} must be one of ${f.values!.join(", ")}.` }); return;
    case "agentUri": if (!isAgentUri(v)) out.push({ path, message: `${label} must be an agent URI such as agent://acme/fraud-detector.` }); return;
    case "url": if (!isHttpsUrl(v)) out.push({ path, message: `${label} must be an https URL.` }); return;
    case "time": if (typeof v !== "string" || !RFC3339.test(v) || Number.isNaN(Date.parse(v))) out.push({ path, message: `${label} must be an RFC 3339 time.` }); return;
    case "array": {
      if (!Array.isArray(v)) { out.push({ path, message: `${label} must be a list.` }); return; }
      v.forEach((item, i) => check(f.items!, item, `${path}[${i}]`, out));
      return;
    }
    case "object": {
      if (!isObj(v)) { out.push({ path, message: `${label} must be an object.` }); return; }
      if (f.fields) validateFields(f.fields, v, path, out);
      return;
    }
  }
}

function validateFields(fields: Field[], v: Record<string, unknown>, path: string, out: Issue[]) {
  for (const f of fields) {
    const p = path ? `${path}.${f.key}` : f.key;
    const val = v[f.key];
    if (val === undefined || val === null) { if (f.required) out.push({ path: p, message: `${f.key} is required.` }); continue; }
    check(f, val, p, out);
  }
}

/** Checks an envelope against section 3 and the payload shape for its type. Returns every problem, not only the first. */
export function validateEnvelope(env: unknown, now: Date = new Date()): Issue[] {
  const out: Issue[] = [];
  if (!isObj(env)) return [{ path: "", message: "An envelope is a JSON object." }];
  const need = (k: string) => { if (env[k] === undefined || env[k] === null) { out.push({ path: k, message: `${k} is required.` }); return false; } return true; };

  if (need("tap")) {
    const t = env.tap;
    if (typeof t !== "string" || !/^\d+\.\d+$/.test(t)) out.push({ path: "tap", message: "tap must be a version such as 1.0." });
    else if (t.split(".")[0] !== TAP_VERSION.split(".")[0]) out.push({ path: "tap", message: `Major version ${t.split(".")[0]} is not supported. This receiver speaks ${TAP_VERSION}. (tap.unsupported_version)` });
  }
  if (need("id") && (typeof env.id !== "string" || !ULID.test(env.id))) out.push({ path: "id", message: "id must be a prefix and a 26 character ULID, for example msg_01J9Z8X4K7Q2W5R6T3Y8N1M0PA." });
  const spec = typeof env.type === "string" ? MESSAGES[env.type] : undefined;
  if (need("type") && !spec) out.push({ path: "type", message: `${String(env.type)} is not a known message type. (tap.invalid_envelope)` });
  if (need("from") && !isAgentUri(env.from)) out.push({ path: "from", message: "from must be an agent URI such as agent://acme/fraud-detector." });
  if (env.to !== undefined && !isAgentUri(env.to)) out.push({ path: "to", message: "to must be an agent URI." });
  const broadcast = typeof env.type === "string" && /^(atlas\.(card|search|results)|pulse\.ping)/.test(env.type);
  if (env.to === undefined && !broadcast && spec) out.push({ path: "to", message: "to is required for this message type." });
  if (env.session !== undefined && (typeof env.session !== "string" || !ULID.test(env.session))) out.push({ path: "session", message: "session must be a prefix and a 26 character ULID, for example ses_01J9Z8X4K7Q2W5R6T3Y8N1M0PA." });
  if (env.replyTo !== undefined && (typeof env.replyTo !== "string" || !ULID.test(env.replyTo))) out.push({ path: "replyTo", message: "replyTo must be the id of the message it answers." });

  if (need("trace")) {
    if (!isObj(env.trace)) out.push({ path: "trace", message: "trace must be an object with traceparent and depth." });
    else {
      if (typeof env.trace.traceparent !== "string" || !TRACEPARENT.test(env.trace.traceparent)) out.push({ path: "trace.traceparent", message: "traceparent must be a W3C Trace Context value, for example 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01." });
      const d = env.trace.depth;
      if (typeof d !== "number" || !Number.isInteger(d) || d < 0) out.push({ path: "trace.depth", message: "depth must be a whole number of agent hops, 0 or more." });
      else if (d > MAX_DEPTH) out.push({ path: "trace.depth", message: `depth ${d} is above the limit of ${MAX_DEPTH}. (tap.depth_exceeded)` });
    }
  }
  if (env.behalfOf !== undefined) {
    if (!isObj(env.behalfOf)) out.push({ path: "behalfOf", message: "behalfOf must be an object." });
    else {
      if (env.behalfOf.user !== undefined && (typeof env.behalfOf.user !== "string" || !env.behalfOf.user.trim())) out.push({ path: "behalfOf.user", message: "user must be a non-empty string." });
      const chain = env.behalfOf.chain;
      if (chain !== undefined) {
        if (!Array.isArray(chain) || chain.some((c) => !isAgentUri(c))) out.push({ path: "behalfOf.chain", message: "chain must be a list of agent URIs, oldest first." });
        else {
          if (new Set(chain).size !== chain.length) out.push({ path: "behalfOf.chain", message: "chain contains the same agent twice, which is a delegation loop. (tap.forbidden)" });
          if (isAgentUri(env.from) && chain.includes(env.from)) out.push({ path: "behalfOf.chain", message: "The sender is already in the chain, which is a delegation loop. (tap.forbidden)" });
        }
      }
    }
  }
  let ts: number | undefined;
  if (need("ts")) {
    if (typeof env.ts !== "string" || !RFC3339.test(env.ts) || Number.isNaN(Date.parse(env.ts))) out.push({ path: "ts", message: "ts must be an RFC 3339 time." });
    else ts = Date.parse(env.ts);
  }
  if (need("ttlMs")) {
    const t = env.ttlMs;
    if (typeof t !== "number" || !Number.isInteger(t) || t < 1 || t > 86_400_000) out.push({ path: "ttlMs", message: "ttlMs must be a whole number from 1 to 86,400,000." });
    else if (ts !== undefined && ts + t < now.getTime()) out.push({ path: "ttlMs", message: "The message has expired: ts plus ttlMs is in the past. (tap.expired)" });
  }
  if (env.sig !== undefined && (typeof env.sig !== "string" || !/^[A-Za-z0-9_-]+\.\.[A-Za-z0-9_-]+$/.test(env.sig))) out.push({ path: "sig", message: "sig must be a detached JWS: header, two dots, signature." });

  if (need("payload")) {
    if (!isObj(env.payload)) out.push({ path: "payload", message: "payload must be an object." });
    else if (spec) {
      validateFields(spec.payload, env.payload, "payload", out);
      if (env.type === "relay.task.create" && env.payload.mode === "webhook" && !env.payload.callbackUrl) out.push({ path: "payload.callbackUrl", message: "callbackUrl is required when mode is webhook." });
      if (env.type === "relay.task.result" && env.payload.state === "failed" && !env.payload.error) out.push({ path: "payload.error", message: "A failed task carries an error with a code." });
      if (env.type === "relay.task.result" && env.payload.state === "rejected" && !env.payload.error) out.push({ path: "payload.error", message: "A rejected task carries an error with a code." });
      if (env.type === "gate.decision" && env.payload.decision === "modify" && !env.payload.modified) out.push({ path: "payload.modified", message: "A modify decision carries the modified action." });
      if (env.type === "gate.decision" && env.payload.decision === "approve" && !env.payload.approvalId) out.push({ path: "payload.approvalId", message: "An approve decision names the approval that is waiting." });
      if (env.type === "ledger.receipt" && Array.isArray(env.payload.steps) && typeof env.payload.totalMinor === "number") {
        const sum = (env.payload.steps as { costMinor?: number }[]).reduce((a, x) => a + (typeof x?.costMinor === "number" ? x.costMinor : 0), 0);
        if (sum !== env.payload.totalMinor) out.push({ path: "payload.totalMinor", message: `totalMinor is ${env.payload.totalMinor} but the steps add up to ${sum}.` });
      }
    }
  }
  const known = new Set(["tap", "id", "type", "from", "to", "session", "replyTo", "trace", "behalfOf", "ts", "ttlMs", "payload", "sig"]);
  void known; // unknown optional fields are ignored by design (section 11 of the spec)
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Agent card

export type AgentCard = {
  uri: string; name: string; summary?: string; version: string; owner: string; tap: string[];
  conformance: "observe" | "govern" | "collaborate";
  endpoints: { relay?: string; pulse?: string; gate?: string };
  auth: string[]; capabilities: { id: string; description?: string }[]; modes: string[]; models?: string[]; tools?: string[];
  signing?: { alg: "EdDSA"; keys: unknown[] };
};

export function validateCard(c: unknown): Issue[] {
  const out: Issue[] = [];
  if (!isObj(c)) return [{ path: "", message: "A card is a JSON object." }];
  const str = (k: string) => { if (typeof c[k] !== "string" || !String(c[k]).trim()) out.push({ path: k, message: `${k} is required.` }); };
  if (!isAgentUri(c.uri)) out.push({ path: "uri", message: "uri must be an agent URI." });
  str("name"); str("version"); str("owner");
  if (!Array.isArray(c.tap) || c.tap.length === 0 || c.tap.some((v) => typeof v !== "string" || !/^\d+\.\d+$/.test(v))) out.push({ path: "tap", message: "tap lists the versions the agent speaks, for example [\"1.0\"]." });
  else if (!c.tap.some((v: string) => v.split(".")[0] === TAP_VERSION.split(".")[0])) out.push({ path: "tap", message: `No supported version. This platform speaks ${TAP_VERSION}.` });
  if (!["observe", "govern", "collaborate"].includes(String(c.conformance))) out.push({ path: "conformance", message: "conformance must be observe, govern or collaborate." });
  const ep = isObj(c.endpoints) ? c.endpoints : undefined;
  if (!ep) out.push({ path: "endpoints", message: "endpoints is required." });
  else {
    for (const k of ["relay", "pulse", "gate"]) if (ep[k] !== undefined && !isHttpsUrl(ep[k])) out.push({ path: `endpoints.${k}`, message: `${k} must be an absolute https URL.` });
    const level = String(c.conformance);
    if (!ep.pulse) out.push({ path: "endpoints.pulse", message: "Every level needs a pulse endpoint, so the agent can be seen and stopped." });
    if (level === "collaborate" && !ep.relay) out.push({ path: "endpoints.relay", message: "A collaborate agent needs a relay endpoint." });
    if ((level === "govern" || level === "collaborate") && !ep.gate && !ep.relay) out.push({ path: "endpoints.gate", message: "A govern agent needs a gate endpoint, or reaches its tools through the broker." });
  }
  if (!Array.isArray(c.auth) || c.auth.length === 0 || c.auth.some((a) => !(AUTH_SCHEMES as readonly string[]).includes(String(a)))) out.push({ path: "auth", message: `auth lists accepted schemes: ${AUTH_SCHEMES.join(", ")}.` });
  if (!Array.isArray(c.capabilities)) out.push({ path: "capabilities", message: "capabilities is a list." });
  else c.capabilities.forEach((x, i) => { if (!isObj(x) || typeof x.id !== "string" || !x.id) out.push({ path: `capabilities[${i}].id`, message: "Each capability has an id." }); });
  if (!Array.isArray(c.modes) || c.modes.length === 0 || c.modes.some((m) => !(MODES as readonly string[]).includes(String(m)))) out.push({ path: "modes", message: `modes lists any of ${MODES.join(", ")}.` });
  if (c.signing !== undefined && (!isObj(c.signing) || c.signing.alg !== "EdDSA" || !Array.isArray(c.signing.keys))) out.push({ path: "signing", message: "signing is { alg: \"EdDSA\", keys: [JWK] }." });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Making messages

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** A prefixed ULID. Time ordered, so ids sort by creation. */
export function newId(prefix: "msg" | "ses" | "tsk" | "apr" = "msg", at: number = Date.now(), rand: () => number = Math.random): string {
  let t = at; let time = "";
  for (let i = 0; i < 10; i++) { time = CROCKFORD[t % 32] + time; t = Math.floor(t / 32); }
  let r = ""; for (let i = 0; i < 16; i++) r += CROCKFORD[Math.floor(rand() * 32)];
  return `${prefix}_${time}${r}`;
}

export function newTraceparent(rand: () => number = Math.random): string {
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(rand() * 16).toString(16)).join("");
  return `00-${hex(32)}-${hex(16)}-01`;
}

const SAMPLE: Record<string, unknown> = {
  "atlas.card": { card: { uri: "agent://acme/credit-risk", name: "Credit risk", version: "1.4.0", owner: "risk-engineering" } },
  "atlas.search": { capability: "credit.assess", limit: 5 },
  "atlas.results": { agents: [{ uri: "agent://acme/credit-risk", name: "Credit risk", summary: "Scores applicants.", capabilities: ["credit.assess"] }] },
  "tether.hello": { versions: ["1.0"], conformance: "collaborate", auth: ["jwt-bearer"], capabilities: ["credit.assess"] },
  "tether.accept": { version: "1.0", session: "ses_01J9Z8X4K7Q2W5R6T3Y8N1M0PA", expiresInSec: 900, mode: "async" },
  "tether.reject": { code: "tap.unsupported_version", reason: "Only 1.x is supported.", supported: ["1.0"] },
  "tether.token": { audience: "agent://acme/credit-risk", scope: ["relay.task.create"], expiresInSec: 300, delegatedFrom: "agent://acme/loan-coordinator" },
  "relay.task.create": { task: { capability: "credit.assess", input: { applicantId: "app_8841", amountMinor: 1500000, currency: "BHD" } }, mode: "async", budget: { maxCostMinor: 250, currency: "USD", maxTokens: 40000 }, deadlineMs: 60000 },
  "relay.task.update": { taskId: "tsk_01J9Z8X4K7Q2W5R6T3Y8N1M0PA", state: "working", progress: 0.4, message: "Scoring" },
  "relay.task.result": { taskId: "tsk_01J9Z8X4K7Q2W5R6T3Y8N1M0PA", state: "completed", output: { score: 712, band: "B" }, receipt: { steps: [{ kind: "llm", model: "claude-sonnet-5", tokensIn: 1800, tokensOut: 240, costMinor: 3, currency: "USD", ms: 2100 }], totalMinor: 3 } },
  "relay.task.cancel": { taskId: "tsk_01J9Z8X4K7Q2W5R6T3Y8N1M0PA", reason: "Applicant withdrew" },
  "relay.task.input-required": { taskId: "tsk_01J9Z8X4K7Q2W5R6T3Y8N1M0PA", question: "Which income document should be used?" },
  "relay.task.input": { taskId: "tsk_01J9Z8X4K7Q2W5R6T3Y8N1M0PA", input: { document: "payslip-2026-10" } },
  "relay.message": { role: "user", parts: [{ kind: "text", text: "Assess application 8841." }] },
  "gate.check": { action: { kind: "tool", name: "payments.refund", arguments: { amountMinor: 18000, currency: "USD" } } },
  "gate.decision": { decision: "approve", reason: "Refunds above 150 USD need a person.", policyId: "pol_refund_limit", approvalId: "apr_01J9Z8X4K7Q2W5R6T3Y8N1M0PA" },
  "gate.approval.request": { approvalId: "apr_01J9Z8X4K7Q2W5R6T3Y8N1M0PA", summary: "Refund 180.00 USD to order 5521", action: { kind: "tool", name: "payments.refund" }, expiresInSec: 3600 },
  "gate.approval.result": { approvalId: "apr_01J9Z8X4K7Q2W5R6T3Y8N1M0PA", outcome: "approved", by: "ada@acme.test" },
  "ledger.receipt": { taskId: "tsk_01J9Z8X4K7Q2W5R6T3Y8N1M0PA", steps: [{ kind: "llm", model: "claude-sonnet-5", tokensIn: 1800, tokensOut: 240, costMinor: 3, currency: "USD", ms: 2100 }, { kind: "tool", costMinor: 0, currency: "USD", ms: 340 }], totalMinor: 3 },
  "ledger.budget": { remainingMinor: 41200, currency: "USD", period: "month", resetsAt: "2026-12-01T00:00:00Z" },
  "pulse.status": { state: "ready", version: "1.4.0", inFlight: 2, uptimeSec: 86400 },
  "pulse.suspend": { reason: "Over budget", by: "policy:budget-guard", mode: "now" },
  "pulse.resume": { by: "ada@acme.test" },
  "pulse.drain": { deadlineMs: 30000 },
};

/** A valid example envelope for any message type, ready to edit. */
export function exampleEnvelope(type: string, opts: { from?: string; to?: string; now?: Date } = {}): Record<string, unknown> {
  const spec = MESSAGES[type];
  const now = opts.now ?? new Date();
  const env: Record<string, unknown> = {
    tap: TAP_VERSION, id: newId("msg", now.getTime()), type,
    from: opts.from ?? "agent://acme/loan-coordinator",
    ...(opts.to !== undefined || !/^(atlas\.(card|search|results)|pulse\.ping)/.test(type) ? { to: opts.to ?? "agent://acme/credit-risk" } : {}),
    session: newId("ses", now.getTime()),
    trace: { traceparent: newTraceparent(), depth: 1 },
    behalfOf: { user: "usr_ada", chain: [] },
    ts: now.toISOString(), ttlMs: 60_000,
    payload: spec ? (SAMPLE[type] ?? {}) : {},
  };
  return env;
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Signing (detached JWS, EdDSA). Uses Web Crypto, present in current browsers and in Node.

/** Keys sorted, no whitespace. The bytes that are signed. */
export function canonicalize(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalize).join(",")}]`;
  if (isObj(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonicalize(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

const b64u = (bytes: Uint8Array) => { let s2 = ""; for (const b of bytes) s2 += String.fromCharCode(b); return btoa(s2).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64u = (t: string) => { const p = t.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((t.length + 3) % 4); const s2 = atob(p); return Uint8Array.from(s2, (c) => c.charCodeAt(0)); };
const textBytes = (t: string) => new TextEncoder().encode(t);

export const signingAvailable = (): boolean => typeof crypto !== "undefined" && !!crypto.subtle;

export async function generateSigningKey(): Promise<{ privateKey: CryptoKey; publicKey: CryptoKey; jwk: JsonWebKey } | null> {
  if (!signingAvailable()) return null;
  try {
    const pair = (await crypto.subtle.generateKey({ name: "Ed25519" } as never, true, ["sign", "verify"])) as CryptoKeyPair;
    const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
    return { privateKey: pair.privateKey, publicKey: pair.publicKey, jwk };
  } catch { return null; }
}

/** Returns the envelope with a detached JWS in `sig`. */
export async function signEnvelope(env: Record<string, unknown>, key: CryptoKey): Promise<Record<string, unknown>> {
  const { sig: _drop, ...rest } = env; void _drop;
  const header = b64u(textBytes(JSON.stringify({ alg: "EdDSA", typ: "tap+jws" })));
  const input = textBytes(`${header}.${b64u(textBytes(canonicalize(rest)))}`);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" } as never, key, input));
  return { ...rest, sig: `${header}..${b64u(sig)}` };
}

export async function verifyEnvelope(env: Record<string, unknown>, key: CryptoKey): Promise<boolean> {
  const sig = env.sig;
  if (typeof sig !== "string") return false;
  const m = /^([A-Za-z0-9_-]+)\.\.([A-Za-z0-9_-]+)$/.exec(sig);
  if (!m) return false;
  const { sig: _drop, ...rest } = env; void _drop;
  try { return await crypto.subtle.verify({ name: "Ed25519" } as never, key, unb64u(m[2]), textBytes(`${m[1]}.${b64u(textBytes(canonicalize(rest)))}`)); } catch { return false; }
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Typical exchanges, for the sequence diagrams

export type Exchange = { id: string; title: string; summary: string; actors: string[]; steps: { from: number; to: number; type: string; note?: string }[] };

export const EXCHANGES: Exchange[] = [
  { id: "delegate", title: "Delegate a task through the platform", summary: "A coordinator hands a task to another agent. The platform checks identity and policy and returns one receipt.",
    actors: ["Coordinator", "Platform broker", "Credit risk agent"],
    steps: [
      { from: 0, to: 1, type: "tether.hello", note: "Offer versions and auth" }, { from: 1, to: 0, type: "tether.accept" },
      { from: 0, to: 1, type: "tether.token", note: "Token for one callee" },
      { from: 0, to: 1, type: "relay.task.create", note: "Budget and deadline" }, { from: 1, to: 1, type: "gate.check", note: "Policy and delegation rules" },
      { from: 1, to: 2, type: "relay.task.create", note: "Re-signed, depth + 1" }, { from: 2, to: 1, type: "relay.task.update", note: "working" },
      { from: 2, to: 1, type: "relay.task.result", note: "Output and receipt" }, { from: 1, to: 0, type: "relay.task.result", note: "Receipt rolled up" },
    ] },
  { id: "approval", title: "A tool call that needs a person", summary: "The agent asks Gate. The decision is approve, a person is notified, and the task continues when they answer.",
    actors: ["Support agent", "Platform broker", "Approver"],
    steps: [
      { from: 0, to: 1, type: "gate.check", note: "payments.refund 180 USD" }, { from: 1, to: 0, type: "gate.decision", note: "approve, pending" },
      { from: 1, to: 2, type: "gate.approval.request", note: "Notification" }, { from: 2, to: 1, type: "gate.approval.result", note: "approved" },
      { from: 1, to: 0, type: "gate.approval.result" },
    ] },
  { id: "suspend", title: "Stop an agent", summary: "An operator suspends an agent. New tasks are rejected at once. Work in progress follows the chosen mode.",
    actors: ["Operator", "Platform broker", "Agent"],
    steps: [
      { from: 0, to: 1, type: "pulse.suspend", note: "Reason is required" }, { from: 1, to: 2, type: "pulse.suspend", note: "mode now or after-current" },
      { from: 2, to: 1, type: "pulse.status", note: "state suspended" }, { from: 1, to: 0, type: "pulse.status" },
    ] },
];
