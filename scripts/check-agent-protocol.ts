/**
 * Checks the TAP validator in src/lib/agents/protocol.ts against the rules in docs/48-agent-protocols.md: every message type has a valid example,
 * each rule rejects what it should, ids and signatures work, agent cards are checked, and every step of the sample exchanges is a known type.
 * From tokener-ui: npx tsx scripts/check-agent-protocol.ts
 */
import {
  EXCHANGES, MESSAGE_TYPES, MESSAGES, canonicalize, exampleEnvelope, generateSigningKey, isAgentUri, newId, newTraceparent, signEnvelope, validateCard, validateEnvelope, verifyEnvelope,
} from "../src/lib/agents/protocol";

let fail = 0; const ok = (c: boolean, n: string) => { if (!c) fail++; console.log(c ? "ok  " : "FAIL", n); };
const msgs = (env: unknown, now?: Date) => validateEnvelope(env, now).map((i) => i.path + ": " + i.message);
const has = (env: unknown, path: string, now?: Date) => validateEnvelope(env, now).some((i) => i.path === path);
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

(async () => {
  // every type has an example that validates
  for (const t of MESSAGE_TYPES) { const e = validateEnvelope(exampleEnvelope(t)); ok(e.length === 0, `example for ${t} is valid${e.length ? " " + JSON.stringify(e) : ""}`); }
  ok(MESSAGE_TYPES.length === 26, `26 message types (${MESSAGE_TYPES.length})`);
  for (const t of MESSAGE_TYPES) { const r = MESSAGES[t].reply; if (r) ok(!!MESSAGES[r], `${t} reply ${r} exists`); }

  const base = exampleEnvelope("relay.task.create");
  ok(has({ ...base, tap: "2.0" }, "tap"), "a higher major version is refused");
  ok(!has({ ...base, tap: "1.7" }, "tap"), "a higher minor version is accepted");
  ok(has({ ...base, id: "nope" }, "id"), "id must be a prefixed ULID");
  ok(has({ ...base, type: "relay.task.explode" }, "type"), "an unknown type is refused");
  ok(has({ ...base, from: "acme/fraud" }, "from"), "from must be an agent URI");
  ok(!has({ ...base, from: "agent+https://agents.example.com/fraud" }, "from"), "an external agent URI is accepted");
  const noTo = clone(base); delete (noTo as any).to; ok(has(noTo, "to"), "to is required on a task");
  const ping = exampleEnvelope("pulse.ping", { to: undefined }); delete (ping as any).to; ok(validateEnvelope(ping).length === 0, "pulse.ping may omit to");
  ok(has({ ...base, trace: { traceparent: "x", depth: 1 } }, "trace.traceparent"), "traceparent is checked");
  ok(has({ ...base, trace: { traceparent: newTraceparent(), depth: 9 } }, "trace.depth"), "depth above 8 is refused");
  ok(has({ ...base, ts: "yesterday" }, "ts"), "ts must be RFC 3339");
  ok(has({ ...base, ttlMs: 0 }, "ttlMs") && has({ ...base, ttlMs: 86_400_001 }, "ttlMs"), "ttlMs is bounded");
  ok(has({ ...base, ts: "2026-01-01T00:00:00Z", ttlMs: 1000 }, "ttlMs", new Date("2026-06-01T00:00:00Z")), "an expired message is refused");
  ok(has({ ...base, from: "agent://acme/a", behalfOf: { chain: ["agent://acme/b", "agent://acme/b"] } }, "behalfOf.chain"), "a repeated agent in the chain is a loop");
  ok(has({ ...base, from: "agent://acme/b", behalfOf: { chain: ["agent://acme/b"] } }, "behalfOf.chain"), "the sender in its own chain is a loop");
  ok(has({ ...base, sig: "abc" }, "sig"), "sig must be a detached JWS");

  // payload rules
  const p = (patch: any) => ({ ...base, payload: { ...(base.payload as any), ...patch } });
  ok(has(p({ mode: "webhook" }), "payload.callbackUrl"), "webhook mode needs a callback URL");
  ok(has(p({ mode: "webhook", callbackUrl: "http://insecure.example" }), "payload.callbackUrl"), "the callback URL must be https");
  ok(has(p({ mode: "teleport" }), "payload.mode"), "mode is an enum");
  ok(has(p({ budget: { maxCostMinor: -1, currency: "USD" } }), "payload.budget.maxCostMinor"), "a budget cannot be negative");
  ok(has(p({ task: {} }), "payload.task.input"), "a task needs input");
  const res = exampleEnvelope("relay.task.result");
  ok(has({ ...res, payload: { taskId: "t", state: "failed" } }, "payload.error"), "a failed result carries an error");
  ok(has({ ...res, payload: { taskId: "t", state: "working" } }, "payload.state"), "a result state must be final");
  const rcp = exampleEnvelope("ledger.receipt");
  ok(has({ ...rcp, payload: { ...(rcp.payload as any), totalMinor: 99 } }, "payload.totalMinor"), "a receipt total must equal its steps");
  const dec = exampleEnvelope("gate.decision");
  ok(has({ ...dec, payload: { decision: "modify", reason: "x" } }, "payload.modified"), "a modify decision carries the modified action");
  ok(has({ ...dec, payload: { decision: "approve", reason: "x" } }, "payload.approvalId"), "an approve decision names the approval");
  ok(has({ ...dec, payload: { decision: "maybe", reason: "x" } }, "payload.decision"), "decision is an enum");
  ok(has(exampleEnvelope("tether.token") && { ...exampleEnvelope("tether.token"), payload: { audience: "a", scope: [], expiresInSec: 99999 } }, "payload.expiresInSec"), "a token lives at most an hour");
  ok(msgs("not an object").length === 1 && msgs(null).length === 1, "a non-object is one clear error");
  ok(validateEnvelope({}).length >= 8, "an empty object reports every missing field");

  // ids, uris, canonical form
  const a = newId("msg", 1700000000000, () => 0.5), b = newId("msg", 1700000001000, () => 0.5);
  ok(/^msg_[0-9A-HJKMNP-TV-Z]{26}$/.test(a) && a < b, "ids are ULIDs and sort by time");
  ok(isAgentUri("agent://acme/fraud-detector") && !isAgentUri("agent://Acme/x") && !isAgentUri("agent://acme/1bad") && !isAgentUri("http://x"), "agent URI rules");
  ok(canonicalize({ b: 1, a: [2, { d: 1, c: 2 }] }) === '{"a":[2,{"c":2,"d":1}],"b":1}', "canonical form sorts keys at every depth");

  // signing
  const key = await generateSigningKey();
  if (!key) console.log("skip signing: Ed25519 is not available in this runtime");
  else {
    const signed = await signEnvelope(base, key.privateKey);
    ok(validateEnvelope(signed).length === 0 && await verifyEnvelope(signed, key.publicKey), "a signed envelope validates and verifies");
    ok(!(await verifyEnvelope({ ...signed, payload: { ...(signed.payload as any), mode: "sync" } }, key.publicKey)), "a changed payload fails verification");
    const reordered = Object.fromEntries(Object.entries(signed).reverse());
    ok(await verifyEnvelope(reordered, key.publicKey), "key order does not matter");
    const other = await generateSigningKey();
    ok(!(await verifyEnvelope(signed, other!.publicKey)), "another key fails verification");
  }

  // cards
  const card = { uri: "agent://acme/credit-risk", name: "Credit risk", version: "1.4.0", owner: "risk", tap: ["1.0"], conformance: "collaborate", endpoints: { relay: "https://a.example/relay", pulse: "https://a.example/pulse", gate: "https://a.example/gate" }, auth: ["jwt-bearer"], capabilities: [{ id: "credit.assess" }], modes: ["sync", "async"] };
  ok(validateCard(card).length === 0, "a complete card is valid");
  ok(validateCard({ ...card, tap: ["2.0"] }).some((i) => i.path === "tap"), "a card with no supported version is refused");
  ok(validateCard({ ...card, endpoints: { relay: "http://a.example/relay", pulse: "https://a.example/pulse" } }).some((i) => i.path === "endpoints.relay"), "card endpoints must be https");
  ok(validateCard({ ...card, endpoints: { relay: "https://a.example/relay" } }).some((i) => i.path === "endpoints.pulse"), "every level needs a pulse endpoint");
  ok(validateCard({ ...card, conformance: "observe", endpoints: { pulse: "https://a.example/pulse" } }).length === 0, "an observe agent needs only pulse");
  ok(validateCard({ ...card, conformance: "collaborate", endpoints: { pulse: "https://a.example/pulse" } }).some((i) => i.path === "endpoints.relay"), "a collaborate agent needs relay");
  ok(validateCard({ ...card, auth: ["password"] }).some((i) => i.path === "auth"), "auth schemes are an enum");

  // exchanges
  for (const ex of EXCHANGES) { const bad = ex.steps.filter((s) => !MESSAGES[s.type] || s.from >= ex.actors.length || s.to >= ex.actors.length); ok(bad.length === 0, `exchange ${ex.id} uses known types and actors`); }

  console.log(fail ? `\n${fail} FAILED` : "\nall checks passed");
  process.exit(fail ? 1 : 0);
})();
