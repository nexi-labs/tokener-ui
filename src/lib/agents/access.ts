import type { Agent } from "./types";
import { sensitiveTools } from "./store-math";

/**
 * Exposing an agent so applications and SDKs can call it. An exposure is an address on the tok∑ner gateway plus the ways to prove who is calling:
 * an API key, an optional signing secret for request signatures, or a service-account token. The gateway checks those and the agent's policies
 * before the call reaches the agent, so an exposed agent is governed in the same way as one called from inside.
 *
 * Secrets are shown once, when they are made. What is kept is a hash of each key and a reference to the signing secret in the secret manager.
 */

export type Interface = "rest" | "openai" | "relay" | "a2a" | "mcp";
export const INTERFACES: { id: Interface; label: string; path: string; method: string; help: string }[] = [
  { id: "rest", label: "REST", path: "/invoke", method: "POST", help: "Send input, get the answer or a task id to poll. The simplest way to call an agent from an app." },
  { id: "openai", label: "OpenAI compatible", path: "/v1/chat/completions", method: "POST", help: "Any OpenAI client works. The model is agent:<name>." },
  { id: "relay", label: "TAP Relay", path: "/relay", method: "POST", help: "The native protocol, for agents and SDKs that speak TAP." },
  { id: "a2a", label: "A2A", path: "/a2a", method: "POST", help: "Agent2Agent JSON-RPC, for agents on other platforms." },
  { id: "mcp", label: "MCP tool", path: "/mcp", method: "POST", help: "The agent appears as one tool to any MCP client." },
];

export type KeyScope = "invoke" | "stream" | "tasks" | "feedback";
export const KEY_SCOPES: { id: KeyScope; label: string; help: string }[] = [
  { id: "invoke", label: "Call the agent", help: "Start a run and read the answer." },
  { id: "stream", label: "Stream the answer", help: "Receive the answer as it is produced." },
  { id: "tasks", label: "Read and cancel tasks", help: "Poll a long task, read its result, cancel it." },
  { id: "feedback", label: "Send feedback", help: "Rate an answer, which feeds evaluations." },
];

export type ApiKey = {
  id: string; name: string;
  /** The start of the key, which is safe to show so a key can be recognised. */
  prefix: string; last4: string;
  /** SHA-256 of the whole key. The key itself is not kept. */
  hash: string;
  scopes: KeyScope[]; env: "live" | "test"; createdAt: string; createdBy: string; expiresAt: string | null; lastUsedAt: string | null; requests30d: number;
  status: "active" | "revoked"; revokedAt?: string;
  /** Per key limits are checked in addition to the agent's own. */
  rateLimitPerMin?: number; allowedOrigins?: string[];
};

export type SigningConfig = { required: boolean; ref: string; algorithm: "hmac-sha256"; toleranceSec: number; createdAt: string; last4: string };

/** The access settings of an exposed agent. */
export type Access = {
  interfaces: Interface[];
  rateLimitPerMin: number;
  monthlyRequestCap: number | null;
  maxCostPerRequestUsd: number | null;
  allowedOrigins: string[];
  allowedCidrs: string[];
  /** Whether a service-account token (OIDC) is also accepted. */
  acceptServiceTokens: boolean;
  keys: ApiKey[];
  signing?: SigningConfig;
  enabledAt: string;
};

export const DEFAULT_ACCESS = (now = new Date().toISOString()): Access => ({
  interfaces: ["rest", "openai"], rateLimitPerMin: 120, monthlyRequestCap: null, maxCostPerRequestUsd: 1, allowedOrigins: [], allowedCidrs: [], acceptServiceTokens: true, keys: [], enabledAt: now,
});

export const gatewayUrl = (a: Pick<Agent, "name">) => `https://gateway.acme.example/agents/${a.name}`;
export const endpointFor = (a: Pick<Agent, "name">, i: Interface) => gatewayUrl(a) + INTERFACES.find((x) => x.id === i)!.path;

// ---------------------------------------------------------------------------------------------------------------------------------------
// Validation

export type AccessIssue = { path: string; message: string; level: "error" | "warning" };

/** Only an agent whose calls pass through the gateway can be exposed on it. A public address with no key is refused for an agent that can reach a sensitive tool. */
export function canExpose(a: Agent): { ok: true } | { ok: false; reason: string } {
  if (a.state !== "active") return { ok: false, reason: a.state === "suspended" ? "A suspended agent cannot be exposed. Resume it first." : "A retired agent cannot be exposed." };
  if (a.control !== "governed") return { ok: false, reason: a.control === "observed" ? "This agent does not pass through the gateway, so tok∑ner cannot check callers or stop calls. Move its model and tool calls to the gateway, or record where it is exposed from instead." : "An agent that is only registered cannot be exposed on the gateway. Record where it is exposed from instead." };
  return { ok: true };
}

export function validateAccess(a: Agent, x: Access): AccessIssue[] {
  const out: AccessIssue[] = [];
  if (!x.interfaces.length) out.push({ path: "interfaces", level: "error", message: "Choose at least one way to call the agent." });
  if (!(x.rateLimitPerMin >= 1 && x.rateLimitPerMin <= 100_000)) out.push({ path: "rateLimitPerMin", level: "error", message: "Set a rate limit between 1 and 100,000 calls a minute." });
  if (x.monthlyRequestCap !== null && !(x.monthlyRequestCap >= 1)) out.push({ path: "monthlyRequestCap", level: "error", message: "A monthly cap must be at least 1, or left empty." });
  if (x.maxCostPerRequestUsd !== null && !(x.maxCostPerRequestUsd > 0)) out.push({ path: "maxCostPerRequestUsd", level: "error", message: "The largest cost of one call must be above zero, or left empty." });
  for (const o of x.allowedOrigins) if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(o) && !/^http:\/\/localhost(:\d+)?$/i.test(o)) out.push({ path: "allowedOrigins", level: "error", message: `${o} is not an origin. Use https://app.example.com, with no path.` });
  for (const c of x.allowedCidrs) if (!/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(c) && !/^[0-9a-f:]+(\/\d{1,3})?$/i.test(c)) out.push({ path: "allowedCidrs", level: "error", message: `${c} is not an address range.` });
  if (!x.keys.some((k) => k.status === "active") && !x.acceptServiceTokens) out.push({ path: "keys", level: "warning", message: "Nothing can call this agent yet. Create an API key or accept service-account tokens." });
  if (sensitiveTools(a).length && x.interfaces.includes("openai") && !x.signing?.required) out.push({ path: "signing", level: "warning", message: "This agent can reach sensitive tools. Require signed requests so a leaked key alone cannot call it." });
  if (x.interfaces.includes("openai") && a.capabilities.length === 0) out.push({ path: "interfaces", level: "warning", message: "The OpenAI compatible interface answers chat messages. This agent lists no capabilities, so check that it accepts plain text." });
  const expired = x.keys.filter((k) => k.status === "active" && k.expiresAt && Date.parse(k.expiresAt) < Date.now());
  if (expired.length) out.push({ path: "keys", level: "warning", message: `${expired.length} key${expired.length > 1 ? "s have" : " has"} expired. Delete ${expired.length > 1 ? "them" : "it"} or issue new ones.` });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Hashing and signing. Written out so the browser needs no library and the checks can run the same code under Node.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

export function sha256(data: Uint8Array): Uint8Array {
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const len = data.length; const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
  padded.set(data); padded[len] = 0x80;
  const dv = new DataView(padded.buffer); dv.setUint32(padded.length - 8, Math.floor((len * 8) / 0x100000000)); dv.setUint32(padded.length - 4, (len * 8) >>> 0);
  const w = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) { const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3); const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0; }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25); const ch = (e & f) ^ (~e & g); const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22); const mj = (a & b) ^ (a & c) ^ (b & c); const t2 = (S0 + mj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  const out = new Uint8Array(32); const o = new DataView(out.buffer); h.forEach((v, i) => o.setUint32(i * 4, v));
  return out;
}
const utf8 = (s: string) => new TextEncoder().encode(s);
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
export const sha256Hex = (s: string) => hex(sha256(utf8(s)));

export function hmacSha256(key: string, message: string): Uint8Array {
  let k: Uint8Array = utf8(key); if (k.length > 64) k = sha256(k);
  const ipad = new Uint8Array(64).fill(0x36); const opad = new Uint8Array(64).fill(0x5c);
  k.forEach((v, i) => { ipad[i] ^= v; opad[i] ^= v; });
  const m = utf8(message); const inner = new Uint8Array(64 + m.length); inner.set(ipad); inner.set(m, 64);
  const ih = sha256(inner); const outer = new Uint8Array(96); outer.set(opad); outer.set(ih, 64);
  return sha256(outer);
}

/** What a caller signs: the time, the method, the path and a hash of the body, so a captured request cannot be replayed later or altered. */
export const signingString = (ts: number, method: string, path: string, body: string) => `${ts}.${method.toUpperCase()}.${path}.${sha256Hex(body)}`;
export const signRequest = (secret: string, ts: number, method: string, path: string, body: string) => `t=${ts},v1=${hex(hmacSha256(secret, signingString(ts, method, path, body)))}`;

/** Compares without stopping at the first difference. */
export function safeEqual(a: string, b: string): boolean { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

export function verifySignature(secret: string, header: string, method: string, path: string, body: string, nowSec: number, toleranceSec: number): { ok: true } | { ok: false; code: "bad_format" | "expired" | "mismatch" } {
  const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header);
  if (!m) return { ok: false, code: "bad_format" };
  const ts = Number(m[1]);
  if (Math.abs(nowSec - ts) > toleranceSec) return { ok: false, code: "expired" };
  return safeEqual(signRequest(secret, ts, method, path, body), header) ? { ok: true } : { ok: false, code: "mismatch" };
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Making secrets

const B62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
function random(n: number): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.getRandomValues) throw new Error("This browser cannot make secure random values.");
  const out: string[] = []; const buf = new Uint8Array(n * 2);
  while (out.length < n) { c.getRandomValues(buf); for (const b of buf) { if (b < 248 && out.length < n) out.push(B62[b % 62]); } }
  return out.join("");
}
export const KEY_PREFIX = (env: "live" | "test") => `tok_ak_${env}_`;
export function makeKey(env: "live" | "test"): { secret: string; prefix: string; last4: string; hash: string } {
  const secret = KEY_PREFIX(env) + random(40);
  return { secret, prefix: secret.slice(0, KEY_PREFIX(env).length + 4), last4: secret.slice(-4), hash: sha256Hex(secret) };
}
export function makeSigningSecret(): { secret: string; last4: string } { const secret = "tok_ss_" + random(48); return { secret, last4: secret.slice(-4) }; }
export const signingRef = (a: Pick<Agent, "name">) => `secretref://vault/agents/${a.name}/signing`;

/** What the gateway answers for a call, in the sample workspace's "try it" panel. The order of the checks is the order the real gateway uses. */
export type TryResult = { status: number; code: string; message: string; checks: { name: string; ok: boolean; note?: string }[] };
export function tryCall(a: Agent, x: Access | undefined, presented: { key?: string; signature?: string; origin?: string; scope?: KeyScope; body?: string; callsThisMinute?: number }, now = Date.now()): TryResult {
  const checks: TryResult["checks"] = [];
  const fail = (status: number, code: string, message: string): TryResult => ({ status, code, message, checks });
  if (!x) return fail(404, "agent_not_exposed", "This agent has no public address.");
  if (a.state !== "active") { checks.push({ name: "Agent is active", ok: false }); return fail(503, "agent_unavailable", `The agent is ${a.state}.`); }
  checks.push({ name: "Agent is active", ok: true });
  const key = presented.key ? x.keys.find((k) => safeEqual(k.hash, sha256Hex(presented.key!))) : undefined;
  if (!presented.key) { checks.push({ name: "A key was sent", ok: false }); return fail(401, "missing_credentials", "Send the key as Authorization: Bearer <key>."); }
  checks.push({ name: "A key was sent", ok: true });
  if (!key) { checks.push({ name: "Key is known", ok: false }); return fail(401, "invalid_key", "The key is not recognised."); }
  checks.push({ name: "Key is known", ok: true, note: `${key.name}, ends ${key.last4}` });
  if (key.status !== "active") { checks.push({ name: "Key is active", ok: false }); return fail(401, "key_revoked", "The key was revoked."); }
  if (key.expiresAt && Date.parse(key.expiresAt) < now) { checks.push({ name: "Key has not expired", ok: false }); return fail(401, "key_expired", "The key has expired."); }
  checks.push({ name: "Key is active and in date", ok: true });
  const scope = presented.scope ?? "invoke";
  if (!key.scopes.includes(scope)) { checks.push({ name: `Key may ${scope}`, ok: false }); return fail(403, "scope_denied", `The key is not allowed to ${scope}.`); }
  checks.push({ name: `Key may ${scope}`, ok: true });
  const origins = key.allowedOrigins?.length ? key.allowedOrigins : x.allowedOrigins;
  if (origins.length && presented.origin && !origins.includes(presented.origin)) { checks.push({ name: "Origin is allowed", ok: false, note: presented.origin }); return fail(403, "origin_denied", "Calls from this origin are not allowed."); }
  checks.push({ name: "Origin is allowed", ok: true });
  if (x.signing?.required) {
    if (!presented.signature) { checks.push({ name: "Request is signed", ok: false }); return fail(401, "signature_required", "This agent needs a signed request. Send x-tok-signature."); }
    if (!/^t=\d+,v1=[0-9a-f]{64}$/.test(presented.signature)) { checks.push({ name: "Request is signed", ok: false }); return fail(401, "bad_signature", "The signature header is malformed."); }
    checks.push({ name: "Request is signed", ok: true });
  }
  const limit = key.rateLimitPerMin ?? x.rateLimitPerMin;
  if ((presented.callsThisMinute ?? 0) >= limit) { checks.push({ name: "Under the rate limit", ok: false, note: `${limit} a minute` }); return fail(429, "rate_limited", `More than ${limit} calls a minute. Retry after 60 seconds.`); }
  checks.push({ name: "Under the rate limit", ok: true });
  return { status: 200, code: "ok", message: "The gateway accepted the call and passed it to the agent.", checks };
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Code for callers. Secrets are read from the environment, never written into the sample.

export type Lang = "curl" | "python" | "node" | "java" | "cli";
export const LANGS: { id: Lang; label: string }[] = [{ id: "curl", label: "curl" }, { id: "python", label: "Python" }, { id: "node", label: "Node.js" }, { id: "java", label: "Java" }, { id: "cli", label: "tok CLI" }];

export function snippet(a: Agent, x: Access, i: Interface, lang: Lang): string {
  const url = endpointFor(a, i); const signed = !!x.signing?.required;
  const body = i === "openai" ? `{"model":"agent:${a.name}","messages":[{"role":"user","content":"Hello"}]}` : i === "relay" ? `{"tap":"1.0","type":"relay.task.create","to":"agent://acme/${a.name}","payload":{"input":"Hello"}}` : `{"input":"Hello","session":"ses_example"}`;
  const path = new URL(url).pathname;
  if (lang === "curl") {
    return [`BODY='${body}'`, ...(signed ? [`TS=$(date +%s)`, `SIG="t=$TS,v1=$(printf '%s' "$TS.POST.${path}.$(printf '%s' "$BODY" | openssl dgst -sha256 -hex | cut -d' ' -f2)" | openssl dgst -sha256 -hmac "$TOKENER_AGENT_SECRET" -hex | cut -d' ' -f2)"`] : []),
      `curl -sS ${url} \\`, `  -H "Authorization: Bearer $TOKENER_AGENT_KEY" \\`, ...(signed ? [`  -H "x-tok-signature: $SIG" \\`] : []), `  -H "Content-Type: application/json" \\`, `  -d "$BODY"`].join("\n");
  }
  if (lang === "python") {
    if (i === "openai" && !signed) return `from openai import OpenAI\nimport os\n\nclient = OpenAI(base_url="${gatewayUrl(a)}/v1", api_key=os.environ["TOKENER_AGENT_KEY"])\nreply = client.chat.completions.create(\n    model="agent:${a.name}",\n    messages=[{"role": "user", "content": "Hello"}],\n)\nprint(reply.choices[0].message.content)`;
    return `import hashlib, hmac, json, os, time\nimport requests\n\nbody = json.dumps(${body})\nheaders = {"Authorization": "Bearer " + os.environ["TOKENER_AGENT_KEY"], "Content-Type": "application/json"}\n${signed ? `ts = int(time.time())\nmsg = f"{ts}.POST.${path}." + hashlib.sha256(body.encode()).hexdigest()\nsig = hmac.new(os.environ["TOKENER_AGENT_SECRET"].encode(), msg.encode(), hashlib.sha256).hexdigest()\nheaders["x-tok-signature"] = f"t={ts},v1={sig}"\n` : ""}reply = requests.post("${url}", data=body, headers=headers, timeout=60)\nreply.raise_for_status()\nprint(reply.json())`;
  }
  if (lang === "node") {
    return `${signed ? `import { createHash, createHmac } from "node:crypto";\n\n` : ""}const body = JSON.stringify(${body});\nconst headers = { Authorization: \`Bearer \${process.env.TOKENER_AGENT_KEY}\`, "Content-Type": "application/json" };\n${signed ? `const ts = Math.floor(Date.now() / 1000);\nconst digest = createHash("sha256").update(body).digest("hex");\nconst sig = createHmac("sha256", process.env.TOKENER_AGENT_SECRET).update(\`\${ts}.POST.${path}.\${digest}\`).digest("hex");\nheaders["x-tok-signature"] = \`t=\${ts},v1=\${sig}\`;\n` : ""}const res = await fetch("${url}", { method: "POST", headers, body });\nif (!res.ok) throw new Error(\`\${res.status} \${await res.text()}\`);\nconsole.log(await res.json());`;
  }
  if (lang === "java") {
    return `HttpClient http = HttpClient.newHttpClient();\nString body = ${JSON.stringify(body)};\nHttpRequest.Builder req = HttpRequest.newBuilder(URI.create("${url}"))\n    .header("Authorization", "Bearer " + System.getenv("TOKENER_AGENT_KEY"))\n    .header("Content-Type", "application/json");\n${signed ? `long ts = Instant.now().getEpochSecond();\nString digest = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body.getBytes(UTF_8)));\nMac mac = Mac.getInstance("HmacSHA256");\nmac.init(new SecretKeySpec(System.getenv("TOKENER_AGENT_SECRET").getBytes(UTF_8), "HmacSHA256"));\nString sig = HexFormat.of().formatHex(mac.doFinal((ts + ".POST.${path}." + digest).getBytes(UTF_8)));\nreq.header("x-tok-signature", "t=" + ts + ",v1=" + sig);\n` : ""}HttpResponse<String> res = http.send(req.POST(BodyPublishers.ofString(body)).build(), BodyHandlers.ofString());\nSystem.out.println(res.body());`;
  }
  return `export TOKENER_AGENT_KEY=...   # from the Access tab, shown once\ntok agents call ${a.name} "Hello"${signed ? ` \\\n  --sign-with-env TOKENER_AGENT_SECRET` : ""}`;
}
