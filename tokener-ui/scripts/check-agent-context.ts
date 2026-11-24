import { sampleSpaces, defaultSpace, planWrite, validateSpace, sampleItems } from "../src/lib/agents/context";
import { sampleHub } from "../src/lib/agents/hub";
import { sampleAgents } from "../src/lib/agents/sample";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const hub = sampleHub(); const agents = sampleAgents().agents;
const [claims, support, fin] = sampleSpaces();

// samples are valid
for (const s of [claims, support, fin]) ok(!validateSpace(s, agents, hub).some((i) => i.level === "error"), `${s.id} sample has no errors: ${JSON.stringify(validateSpace(s, agents, hub).filter((i) => i.level === "error"))}`);

// placement
const small = planWrite(claims, { bytes: 3 * 1024, kind: "state" });
ok(small.tier === "warm" && small.also.includes("hot") && !small.claimCheck, "small state goes to warm and hot");
const msg = planWrite(claims, { bytes: 1024, kind: "message" });
ok(msg.tier === "warm" && msg.also.length === 0, "a message read once skips the cache");
const doc = planWrite(claims, { bytes: 2_500_000, kind: "document" });
ok(doc.tier === "blob" && doc.claimCheck && !!doc.ref?.startsWith("ctx://claims-case/blob/"), "document uses claim check with a reference");
ok(planWrite(claims, { bytes: 100 * 1024, kind: "state" }).claimCheck, "state above the threshold is claim-checked");
const noBlob = { ...support, blob: { ...support.blob, enabled: false } };
ok(planWrite(noBlob, { bytes: 1_000_000, kind: "document" }).error !== undefined, "no blob tier, no documents");
ok(planWrite(noBlob, { bytes: 5 * 1024 * 1024, kind: "state" }).error !== undefined, "above 4 MB without blob is refused");
ok(planWrite(noBlob, { bytes: 600 * 1024, kind: "state" }).tier === "warm" && planWrite(noBlob, { bytes: 600 * 1024, kind: "state" }).also.length === 0, "above the hot item limit skips hot");
const hotOnly = { ...support, warm: { ...support.warm, enabled: false } };
ok(planWrite(hotOnly, { bytes: 2048, kind: "state" }).tier === "hot", "hot only keeps it in hot");
ok(planWrite({ ...support, hot: { ...support.hot, enabled: false }, warm: { ...support.warm, enabled: false } }, { bytes: 10, kind: "state" }).error !== undefined, "no tier, no write");
ok(planWrite(claims, { bytes: 1, kind: "document" }).ref === planWrite(claims, { bytes: 1, kind: "document" }).ref, "reference is stable");

// validation
const base = defaultSpace("new-space", "New space");
const v = (s: typeof base) => validateSpace(s, agents, hub);
ok(v({ ...base, id: "X" }).some((i) => i.path === "id"), "bad id");
ok(v({ ...base, name: " " }).some((i) => i.path === "name"), "name required");
ok(v({ ...base, hot: { ...base.hot, enabled: false }, warm: { ...base.warm, enabled: false }, blob: { ...base.blob, enabled: true, connection: "conn-prod-s3-context" } }).some((i) => i.path === "tiers"), "blob alone is not enough");
ok(v({ ...base, hot: { ...base.hot, ttlSec: 0 } }).some((i) => i.path === "hot.ttlSec"), "ttl required");
ok(v({ ...base, hot: { ...base.hot, ttlSec: 30 * 86_400 } }).some((i) => i.path === "hot.ttlSec" && i.level === "warning"), "long ttl warns");
ok(v({ ...base, hot: { ...base.hot, maxMb: 0 } }).some((i) => i.path === "hot.maxMb"), "size required");
ok(v({ ...base, hot: { ...base.hot, backend: "redis" } }).some((i) => i.path === "hot.connection"), "redis needs a connection");
ok(v({ ...base, hot: { ...base.hot, backend: "redis", connection: "conn-prod-kafka" } }).some((i) => /not Redis/.test(i.message)), "wrong integration");
ok(v({ ...base, hot: { ...base.hot, backend: "redis", connection: "nope" } }).some((i) => /not in Integrations/.test(i.message)), "missing connection");
ok(!v({ ...base, hot: { ...base.hot, backend: "redis", connection: "conn-prod-redis" } }).some((i) => i.path === "hot.connection"), "redis connection accepted");
ok(v({ ...base, blob: { ...base.blob, enabled: true } }).some((i) => i.path === "blob.connection"), "blob needs a connection");
ok(v({ ...base, blob: { ...base.blob, enabled: true, connection: "conn-prod-s3-contracts" } }).some((i) => /read-only/.test(i.message)), "read-only bucket refused");
ok(v({ ...base, blob: { ...base.blob, enabled: true, connection: "conn-prod-s3-context", claimCheckAboveKb: 2 } }).some((i) => i.path === "blob.claimCheckAboveKb"), "threshold range");
ok(v({ ...base, warm: { ...base.warm, backend: "pgvector" } }).some((i) => i.path === "warm.connection"), "postgres needs a connection");
ok(v(base).some((i) => i.path === "members" && i.level === "warning"), "no members warns");
ok(v({ ...base, members: [{ agentId: "agt_01", access: "read" }] }).some((i) => /only read/.test(i.message)), "readers only warns");
ok(v({ ...base, members: [{ agentId: "zzz", access: "write" }] }).some((i) => /not in the registry/.test(i.message)), "unknown agent");
ok(v({ ...base, members: [{ agentId: "agt_01", access: "write" }, { agentId: "agt_01", access: "read" }] }).some((i) => /twice/.test(i.message)), "duplicate member");
const retired = agents.find((a) => a.state === "retired"); if (retired) ok(v({ ...base, members: [{ agentId: retired.id, access: "write" }] }).some((i) => /retired/.test(i.message)), "retired agent");
ok(v({ ...base, project: "claims-ops", members: [{ agentId: "agt_01", access: "write" }] }).length >= 0, "project check runs");
const withProj = agents.map((a) => (a.id === "agt_01" ? { ...a, project: "support" } : a));
ok(validateSpace({ ...base, project: "claims-ops", members: [{ agentId: "agt_01", access: "write" }] }, withProj, hub).some((i) => /does not cross projects|Context does not cross/.test(i.message)), "cross project refused");
ok(v({ ...base, scope: "organisation", maskPersonalData: false }).some((i) => i.path === "maskPersonalData"), "org scope must mask");
const observed = agents.find((a) => a.control !== "governed" && a.state !== "retired");
if (observed) ok(v({ ...base, members: [{ agentId: observed.id, access: "write" }] }).some((i) => /cannot be checked/.test(i.message)), "ungoverned writer warns");
ok(v({ ...base, warm: { ...base.warm, enabled: false }, consistency: "versioned" }).some((i) => i.path === "consistency"), "versioned without warm warns");

// sample items
for (const s of [claims, support, fin]) { const it = sampleItems(s); ok(it.length > 0 && it.every((i) => !i.placement.error), `${s.id} sample items place without error`); }
ok(sampleItems(claims).filter((i) => i.placement.claimCheck).length === 2, "two claim-checked documents in the claims space");

console.log(`${pass} checks passed, ${fail} failed`); process.exit(fail ? 1 : 0);
