/**
 * Checks for the observability, evaluation, memory and access libraries behind Agent OS.
 * Run: npx tsx --tsconfig scripts/tsconfig.scripts.json scripts/check-agent-observe.ts
 */
import { createHash, createHmac } from "node:crypto";
import { sampleAgents, sampleTopology, SAMPLE_KEY } from "../src/lib/agents/sample";
import { sampleTraces } from "../src/lib/agents/sample-traces";
import { layoutLayers, layoutTree, agentColors, AGENT_PALETTE, agentSeries, fleetSeries, hops, logsOf, searchTraces, serviceGraph, traceGraph, traceparentOf, waterfallRows, perAgent, sameCorrelation } from "../src/lib/agents/observe";
import { exportTraces, toOtlp, toZipkin, csvLine, TRACE_FORMATS } from "../src/lib/agents/export";
import { compareRuns, runSuite, sampleEvals, SAMPLE_SUITES } from "../src/lib/agents/evals";
import { applyRetention, defaultMemory, layerFor, memoryGrants, recall, sampleMemoryItems, validateMemory } from "../src/lib/agents/memory";
import { DEFAULT_ACCESS, canExpose, hmacSha256, makeKey, makeSigningSecret, sha256Hex, signRequest, snippet, tryCall, validateAccess, verifySignature, LANGS, INTERFACES } from "../src/lib/agents/access";
import { MAX_DEPTH } from "../src/lib/agents/protocol";

let pass = 0; let fail = 0;
const ok = (c: unknown, m: string) => { if (c) pass++; else { fail++; console.error("FAIL", m); } };
const eq = (a: unknown, b: unknown, m: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`);

// ---- hashing and signing against Node's own implementation
for (const s of ["", "abc", "tok_ak_live_x".repeat(20), "é".repeat(100), "a".repeat(55), "a".repeat(56), "a".repeat(64), "a".repeat(1000)]) eq(sha256Hex(s), createHash("sha256").update(s).digest("hex"), `sha256 of length ${s.length}`);
for (const [k, m] of [["key", "message"], ["k".repeat(100), "long key"], ["", ""], ["secret", "1700000000.POST./invoke." + "0".repeat(64)]]) eq(Buffer.from(hmacSha256(k, m)).toString("hex"), createHmac("sha256", k).update(m).digest("hex"), `hmac ${k.length}/${m.length}`);
const sec = "tok_ss_test"; const now = 1_700_000_000; const body = '{"input":"Hello"}';
const sig = signRequest(sec, now, "post", "/invoke", body);
ok(/^t=\d+,v1=[0-9a-f]{64}$/.test(sig), "signature format");
eq(verifySignature(sec, sig, "POST", "/invoke", body, now + 10, 300), { ok: true }, "valid signature");
eq(verifySignature(sec, sig, "POST", "/invoke", body + " ", now + 10, 300), { ok: false, code: "mismatch" }, "altered body");
eq(verifySignature(sec, sig, "POST", "/other", body, now + 10, 300), { ok: false, code: "mismatch" }, "altered path");
eq(verifySignature("other", sig, "POST", "/invoke", body, now + 10, 300), { ok: false, code: "mismatch" }, "wrong secret");
eq(verifySignature(sec, sig, "POST", "/invoke", body, now + 301, 300), { ok: false, code: "expired" }, "replayed late");
eq(verifySignature(sec, "nonsense", "POST", "/invoke", body, now, 300), { ok: false, code: "bad_format" }, "bad header");
const k1 = makeKey("live"); const k2 = makeKey("live");
ok(/^tok_ak_live_[A-Za-z0-9]{40}$/.test(k1.secret) && k1.secret !== k2.secret, "key format and uniqueness");
ok(k1.hash === sha256Hex(k1.secret) && !k1.hash.includes(k1.secret), "key hash");
ok(k1.prefix === k1.secret.slice(0, 16) && k1.last4 === k1.secret.slice(-4), "key prefix and last4");
ok(/^tok_ak_test_/.test(makeKey("test").secret), "test key prefix");
ok(/^tok_ss_[A-Za-z0-9]{48}$/.test(makeSigningSecret().secret), "signing secret format");

// ---- sample workspace
const { agents } = sampleAgents(); const topo = sampleTopology();
const traces = sampleTraces(agents, topo.links, Date.now());
const colors = agentColors(agents);
const again = agentColors([...agents, { ...agents[0], id: "agt_new", createdAt: new Date().toISOString() }]);
ok(new Set(Object.values(colors).slice(0, 14)).size === 14, "first 14 agents have different colours");
ok(agents.every((a) => again[a.id] === colors[a.id]), "adding an agent keeps existing colours");
ok(AGENT_PALETTE.every((c) => /^#[0-9A-F]{6}$/i.test(c)), "palette values");
ok(traces.length > 60, `plenty of traces (${traces.length})`);
ok(traces.some((t) => t.agentIds.length >= 3), "a trace crosses three or more agents");
ok(traces.some((t) => t.agentIds.length >= 4), "a trace crosses four agents");
ok(traces.some((t) => t.status === "error"), "some traces fail");
ok(new Set(traces.map((t) => t.id)).size === traces.length, "trace ids are unique");

for (const t of traces) {
  const label = `trace ${t.id.slice(0, 8)}`;
  if (!/^[0-9a-f]{32}$/.test(t.id)) { ok(false, `${label} id format`); continue; }
  const ids = new Set(t.spans.map((s) => s.id));
  ok(ids.size === t.spans.length, `${label} span ids unique`);
  ok(t.spans.every((s) => /^[0-9a-f]{16}$/.test(s.id)), `${label} span id format`);
  ok(t.spans.filter((s) => !s.parent).length === 1, `${label} exactly one root`);
  ok(t.spans.every((s) => !s.parent || ids.has(s.parent)), `${label} every parent exists`);
  ok(t.spans.every((s) => s.durMs >= 0 && s.startMs >= 0), `${label} non-negative times`);
  const by = new Map(t.spans.map((s) => [s.id, s]));
  ok(t.spans.every((s) => { const p = s.parent ? by.get(s.parent) : null; return !p || s.startMs >= p.startMs; }), `${label} child does not start before its parent`);
  ok(t.spans.every((s) => { const p = s.parent ? by.get(s.parent) : null; if (!p || s.agentId !== p.agentId || s.kind === "eval") return true; return s.startMs + s.durMs <= p.startMs + p.durMs + 1; }), `${label} same-agent child ends within its parent`);
  ok(Math.abs(t.costUsd - t.spans.reduce((x, s) => x + s.costUsd, 0)) < 0.0002, `${label} cost is the sum of spans`);
  ok(t.tokens === t.spans.reduce((x, s) => x + s.tokens, 0), `${label} tokens are the sum of spans`);
  ok(t.durationMs >= Math.max(...t.spans.map((s) => s.startMs + s.durMs)) - 1, `${label} duration covers every span`);
  ok(t.depth >= 1 && t.depth <= MAX_DEPTH, `${label} depth within ${MAX_DEPTH}`);
  ok(t.agentIds[0] === t.agentId, `${label} first agent is the root agent`);
  ok(new Set(t.agentIds).size === t.agentIds.length && t.agentIds.every((a) => t.spans.some((s) => s.agentId === a)), `${label} agentIds match spans`);
  ok(t.spans.every((s) => agents.some((a) => a.id === s.agentId)), `${label} every span belongs to a known agent`);
  const root = t.spans.find((s) => !s.parent)!;
  ok((root.status === "error") === (t.status === "error"), `${label} status follows the root`);
  ok(/^corr_[0-9a-f]{10}$/.test(t.correlationId) || t.kind === "eval", `${label} correlation id`);
  const h = hops(t);
  ok(h.length === t.agentIds.length - 1 || t.spans.some((s) => s.attrs?.["messaging.system"]), `${label} one hop for each extra agent (${h.length} vs ${t.agentIds.length})`);
  ok(h.every((x) => /^msg_[0-9a-f]{12}$/.test(x.messageId)), `${label} hops carry a message id`);
  const rows = waterfallRows(t);
  ok(rows.length === t.spans.length, `${label} waterfall lists every span`);
  ok(rows.every((r) => r.selfMs >= 0 && r.selfMs <= r.span.durMs), `${label} self time within duration`);
  const g = traceGraph(t);
  ok(g.nodes.length === t.agentIds.length || g.nodes.length > t.agentIds.length - 1, `${label} graph has a node per agent run`);
  ok(g.edges.length === h.length, `${label} graph edges equal hops`);
  ok(perAgent(t).length === t.agentIds.length, `${label} per agent rows`);
  ok(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/.test(traceparentOf(t)), `${label} traceparent`);
  const lg = logsOf(t);
  ok(lg.every((l, i) => i === 0 || lg[i - 1].atMs <= l.atMs), `${label} logs in time order`);
  ok(lg.every((l) => l.traceId === t.id && l.correlationId === t.correlationId && /^[0-9a-f]{16}$/.test(l.spanId)), `${label} logs carry trace, span and correlation ids`);
  if (t.status === "error") ok(lg.some((l) => l.level === "error"), `${label} a failed trace logs an error`);
}

// ---- correlation: a retry shares the correlation id of the failed run
const corr = new Map<string, number>(); traces.forEach((t) => corr.set(t.correlationId, (corr.get(t.correlationId) ?? 0) + 1));
ok([...corr.values()].some((n) => n >= 2), "a correlation id spans more than one trace");
const group = [...corr.entries()].find(([, n]) => n >= 2)![0];
const grp = sameCorrelation(traces, group);
ok(grp.length >= 2 && Date.parse(grp[0].startedAt) <= Date.parse(grp[1].startedAt), "same correlation sorted oldest first");
ok(grp[0].status === "error" && grp[1].spans[0].attrs?.["retry.of"] === grp[0].id || grp.some((t) => t.spans.some((s) => s.attrs?.["retry.of"])), "a retry points at the trace it retries");
ok(traces.some((t) => t.spans.some((s) => s.attrs?.["messaging.system"])), "an asynchronous hand-off exists");
const parallel = traces.find((t) => t.agentId === "agt_03" && t.agentIds.length >= 3);
ok(!parallel || (() => { const hh = hops(parallel).filter((x) => x.from === "agt_03"); return hh.length >= 2 && Math.abs(hh[0].startMs - hh[1].startMs) < 80; })(), "parallel children start together");

const sg = serviceGraph(traces);
// ---- layout
const tp = layoutTree([{ key: "a" }, { key: "b" }, { key: "c" }, { key: "d" }], [{ from: "a", to: "b" }, { from: "a", to: "c" }, { from: "c", to: "d" }]);
eq(tp.a.col, 0, "tree root column"); eq(tp.b.col, 1, "tree child column"); eq(tp.d.col, 2, "tree grandchild column");
ok(tp.b.row !== tp.d.row && tp.a.row === (tp.b.row + tp.d.row) / 2, "parent sits in the middle of its children");
const ll = layoutLayers(["x", "y", "z", "w"], [{ from: "x", to: "y" }, { from: "y", to: "x" }, { from: "z", to: "y" }], (i) => ({ x: 3, y: 2, z: 1, w: 0 } as Record<string, number>)[i]);
ok(Object.keys(ll).length === 4 && Object.values(ll).every((c) => Number.isInteger(c.col) && c.col >= 0), "layers place every agent, even in a cycle");
eq(new Set(Object.values(ll).map((c) => c.col + ":" + c.row)).size, 4, "no two agents share a cell");
for (const t of traces.slice(0, 40)) { const g = traceGraph(t); const lp = layoutTree(g.nodes, g.edges); ok(g.nodes.every((n) => lp[n.key] !== undefined) && new Set(g.nodes.map((n) => lp[n.key].col + ":" + lp[n.key].row)).size === g.nodes.length, `trace ${t.id.slice(0, 8)} layout cells are distinct`); }
const sgl = layoutLayers(sg.nodes.map((n) => n.agentId), sg.edges, (i) => sg.nodes.find((n) => n.agentId === i)!.traces);
ok(sg.nodes.every((n) => sgl[n.agentId]) && new Set(Object.values(sgl).map((c) => c.col + ":" + c.row)).size === sg.nodes.length, "dependency graph layout cells are distinct");

// ---- service graph and search
ok(sg.edges.length >= 5 && sg.nodes.length >= 8, `service graph (${sg.nodes.length} nodes, ${sg.edges.length} edges)`);
ok(sg.edges.every((e) => e.calls >= 1 && e.errors <= e.calls), "edge counts");
ok(sg.edges.some((e) => e.from === "agt_01" && e.to === "agt_02"), "triage calls refunds");
eq(searchTraces(traces, { status: "error" }, agents).every((t) => t.status === "error"), true, "search by status");
ok(searchTraces(traces, { text: traces[0].id }, agents).length === 1, "search by trace id");
ok(searchTraces(traces, { text: traces[0].correlationId }, agents).some((t) => t.id === traces[0].id), "search by correlation id");
ok(searchTraces(traces, { multiAgent: true }, agents).every((t) => t.agentIds.length > 1), "search multi-agent");
ok(searchTraces(traces, { protocol: "a2a" }, agents).every((t) => hops(t).some((h) => h.protocol === "a2a")), "search by protocol");
ok(searchTraces(traces, { agent: "agt_02" }, agents).every((t) => t.agentIds.includes("agt_02")), "search by agent");
ok(searchTraces(traces, { minMs: 5000 }, agents).every((t) => t.durationMs >= 5000), "search by duration");

// ---- exports
const multi = traces.find((t) => t.agentIds.length >= 4)!;
const otlp = toOtlp([multi], agents);
ok(otlp.resourceSpans.length === multi.agentIds.length, "OTLP one resource per agent");
const allSpans = otlp.resourceSpans.flatMap((r) => r.scopeSpans.flatMap((s) => s.spans as { traceId: string; spanId: string; parentSpanId?: string; startTimeUnixNano: string; endTimeUnixNano: string; kind: number; status: { code: number } }[]));
ok(allSpans.length === multi.spans.length && allSpans.every((s) => s.traceId === multi.id), "OTLP spans carry the trace id");
ok(allSpans.every((s) => BigInt(s.endTimeUnixNano) >= BigInt(s.startTimeUnixNano) && /^\d{19}$/.test(s.startTimeUnixNano)), "OTLP nanosecond times");
ok(allSpans.every((s) => !s.parentSpanId || allSpans.some((p) => p.spanId === s.parentSpanId)), "OTLP parents exist");
ok(allSpans.some((s) => s.kind === 3) && allSpans.some((s) => s.kind === 2), "OTLP has client and server spans");
ok(otlp.resourceSpans.every((r) => r.resource.attributes.some((a) => a.key === "service.name")), "OTLP service.name");
const zip = toZipkin([multi], agents);
ok(zip.length === multi.spans.length && zip.every((s) => /^[0-9a-f]{32}$/.test(s.traceId) && /^[0-9a-f]{16}$/.test(s.id) && s.duration >= 1 && typeof s.timestamp === "number"), "Zipkin spans");
ok(zip.every((s) => Object.values(s.tags).every((v) => typeof v === "string")), "Zipkin tags are strings");
ok(zip.some((s) => s.remoteEndpoint), "Zipkin records the remote agent");
ok(zip.filter((s) => s.tags.error).length === multi.spans.filter((s) => s.status === "error").length, "Zipkin error tags");
const csv = exportTraces([multi], agents, "csv").trim().split("\n");
ok(csv.length === multi.spans.length + 1 && csv[0].startsWith("trace_id,span_id"), "CSV rows");
eq(csvLine(["=SUM(A1)", "a,b", 'say "hi"', "+1", "-1", "@x", "plain"]), `'=SUM(A1),"a,b","say ""hi""",'+1,'-1,'@x,plain`, "CSV injection and quoting");
const nd = exportTraces([multi], agents, "logs").trim().split("\n").map((l) => JSON.parse(l));
ok(nd.length === logsOf(multi).length && nd.every((l) => l.trace_id === multi.id && l.correlation_id === multi.correlationId), "NDJSON logs");
ok(JSON.parse(exportTraces([multi], agents, "json")).traceparent === traceparentOf(multi), "JSON carries the traceparent");
for (const f of TRACE_FORMATS) ok(exportTraces(traces.slice(0, 3), agents, f.id).length > 10, `format ${f.id} exports`);

// ---- metrics
for (const win of ["24h", "7d", "30d"] as const) {
  const a = agents.find((x) => x.id === "agt_01")!; const rows = agentSeries(a, win);
  ok(rows.length === (win === "24h" ? 24 : win === "7d" ? 7 : 30), `series length ${win}`);
  ok(rows.every((r) => r.failed <= r.runs && r.p50 <= r.p95 && r.p95 <= r.p99), `series sanity ${win}`);
  const again2 = agentSeries(a, win); eq(rows.map((r) => r.runs), again2.map((r) => r.runs), `series deterministic ${win}`);
  const fleet = fleetSeries(agents, win); ok(fleet.length === rows.length && fleet.every((r, i) => r.runs >= rows[i].runs), `fleet series ${win}`);
}

// ---- evaluations
const ev = sampleEvals(agents);
ok(ev.suites.length === SAMPLE_SUITES.length && ev.runs.length === SAMPLE_SUITES.length * 4, `sample evals (${ev.suites.length} suites, ${ev.runs.length} runs)`);
for (const r of ev.runs) {
  const suite = ev.suites.find((s) => s.id === r.suiteId)!;
  ok(r.results.length === suite.cases.length, `${r.id} one result per case`);
  ok(r.results.every((c) => ev.traces.some((t) => t.id === c.traceId && t.kind === "eval" && t.evalRunId === r.id && t.caseId === c.caseId)), `${r.id} every case has an eval trace`);
  ok(r.results.every((c) => Object.keys(c.scores).length === suite.scorers.length && Object.values(c.scores).every((v) => v >= 0 && v <= 1)), `${r.id} scores in range`);
  ok(Math.abs(r.passRate - r.results.filter((c) => c.pass).length / r.results.length) < 0.011, `${r.id} pass rate`);
  ok(r.results.every((c) => c.pass === (c.failed.length === 0)), `${r.id} pass means no failed scorer`);
  ok(r.results.every((c) => !c.pass || c.reason === undefined), `${r.id} passing case has no reason`);
  ok(r.results.every((c) => c.pass || !!c.reason), `${r.id} failing case says why`);
}
for (const t of ev.traces) ok(t.spans.filter((s) => s.kind === "eval").length >= 3 && t.correlationId === t.evalRunId, `eval trace ${t.id.slice(0, 8)} has scorer spans and uses the run as correlation id`);
const s0 = ev.suites[0]; const a0 = agents.find((a) => a.id === s0.agentId)!;
const r1 = runSuite({ suite: s0, agents, seed: 5, startedAt: 1_700_000_000_000, quality: 0.9, version: "1", id: "evr_x" }); const r2 = runSuite({ suite: s0, agents, seed: 5, startedAt: 1_700_000_000_000, quality: 0.9, version: "1", id: "evr_x" });
eq(r1.run, r2.run, "same seed, same run"); ok(a0 !== undefined, "agent under test exists");
const lo = runSuite({ suite: s0, agents, seed: 6, startedAt: 1_700_000_000_000, quality: 0.3, version: "1", id: "evr_y" }).run; const hi = runSuite({ suite: s0, agents, seed: 6, startedAt: 1_700_000_000_000, quality: 0.99, version: "1", id: "evr_z" }).run;
ok(hi.passRate > lo.passRate, `quality moves the pass rate (${lo.passRate} to ${hi.passRate})`);
const cmp = compareRuns(lo, hi); ok(cmp.fixes.length > 0 && cmp.passRateDelta > 0, "compare finds fixes"); ok(compareRuns(undefined, hi).regressions.length === 0, "compare with nothing");
ok(r1.run.results.every((c) => { const lat = s0.scorers.find((s) => s.kind === "latency"); return !lat || (c.durMs <= lat.threshold) === (c.scores[lat.id] === 1); }), "latency score reads the real trace time");

// ---- memory
const m = defaultMemory("support-triage", ["working", "conversation", "semantic"]);
eq(validateMemory(m).filter((i) => i.level === "error"), [], "default memory is valid");
const vec = { ...m, layers: m.layers.map((l) => (l.kind === "semantic" ? { ...l, backend: "redis" as const, connection: "conn1" } : l)) };
ok(validateMemory(vec).some((i) => i.path === "layers.semantic.backend"), "vector layer needs a vector store");
const kv = { ...m, layers: m.layers.map((l) => (l.kind === "conversation" ? { ...l, backend: "pinecone" as const, connection: "c" } : l)) };
ok(validateMemory(kv).some((i) => i.path === "layers.conversation.backend"), "key value layer cannot use a vector-only store");
ok(validateMemory({ ...m, layers: m.layers.map((l) => (l.kind === "semantic" ? { ...l, backend: "pgvector" as const } : l)) }).some((i) => i.path === "layers.semantic.connection"), "external store needs a connection");
ok(validateMemory({ ...m, layers: m.layers.map((l) => (l.kind === "semantic" ? { ...l, scope: "organisation" as const, maskPersonalData: false } : l)) }).some((i) => i.path === "layers.semantic.maskPersonalData" && i.level === "error"), "organisation scope needs masking");
ok(validateMemory({ ...m, namespace: "Bad Name" }).some((i) => i.path === "namespace"), "namespace rule");
ok(validateMemory({ ...m, tools: { remember: false, recall: false, update: false, forget: false, list: false, summarise: false } }).some((i) => i.path === "tools"), "layers without tools warn");
ok(validateMemory({ ...m, layers: m.layers.map((l) => (l.kind === "semantic" ? { ...l, topK: 0 } : l)) }).some((i) => i.path === "layers.semantic.topK"), "topK range");
const grants = memoryGrants({ ...m, tools: { ...m.tools, forget: true } });
ok(grants.some((g) => g.tool === "forget" && g.sensitive && g.approval) && grants.every((g) => g.server === "tokener-memory"), "forget is sensitive and waits for approval");
eq(memoryGrants(defaultMemory("x", [])), [], "no layers, no grants");
const items = sampleMemoryItems(); const refund = items["agt_02"].filter((i) => i.kind === "semantic");
const rec = recall(refund, "refund above 500 dollars second approver", { topK: 3, minScore: 0.2, strategy: "similarity" });
ok(rec.length > 0 && /500/.test(rec[0].item.text), "recall finds the closest item first");
ok(recall(refund, "refund above 500 dollars", { topK: 1, minScore: 0, strategy: "similarity" }).length === 1, "topK limits the result");
ok(recall(refund, "quantum chromodynamics", { topK: 5, minScore: 0.1, strategy: "hybrid" }).length === 0, "nothing relevant, nothing returned");
const old = [{ ...items["agt_02"][0], createdAt: "2020-01-01T00:00:00Z", lastUsedAt: null, pinned: false }, { ...items["agt_02"][0], id: "p", createdAt: "2020-01-01T00:00:00Z", lastUsedAt: null, pinned: true }];
eq(applyRetention(old, { retentionDays: 30, maxItems: null }).map((i) => i.id), ["p"], "retention keeps pinned items only");
eq(applyRetention(items["agt_02"], { retentionDays: null, maxItems: 2 }).length, 2, "max items");
ok(layerFor("procedural").write === "approval" && layerFor("semantic").embeddingModel !== undefined && layerFor("working").retentionDays === 1, "layer defaults");

// ---- access
const triage = agents.find((a) => a.id === "agt_01")!; const dify = agents.find((a) => a.id === "agt_11")!; const copilot = agents.find((a) => a.id === "agt_10")!; const retired = agents.find((a) => a.state === "retired")!;
const exp = topo.exposures.find((e) => e.agentId === "agt_01")!.access!;
ok(canExpose(triage).ok && !canExpose(dify).ok && !canExpose(copilot).ok && !canExpose(retired).ok, "only governed, active agents can be exposed");
const call = (over: Parameters<typeof tryCall>[2]) => tryCall(triage, exp, over);
eq(call({}).status, 401, "no key"); eq(call({ key: "tok_ak_live_nope" }).code, "invalid_key", "unknown key");
eq(call({ key: SAMPLE_KEY }).status, 200, "sample key works");
eq(call({ key: SAMPLE_KEY, scope: "tasks" }).code, "scope_denied", "scope denied");
eq(call({ key: "tok_ak_live_Ab3Cd5Ef7Gh9Ij1Kl2Mn4Op6Qr8St0UvWxYz12" }).code, "key_revoked", "revoked key");
eq(call({ key: SAMPLE_KEY, origin: "https://evil.example" }).code, "origin_denied", "origin denied");
eq(call({ key: SAMPLE_KEY, callsThisMinute: 600 }).code, "rate_limited", "rate limited");
eq(tryCall(triage, { ...exp, signing: { ...exp.signing!, required: true } }, { key: SAMPLE_KEY }).code, "signature_required", "signature required");
eq(tryCall(triage, { ...exp, signing: { ...exp.signing!, required: true } }, { key: SAMPLE_KEY, signature: "x" }).code, "bad_signature", "bad signature");
eq(tryCall({ ...triage, state: "suspended" }, exp, { key: SAMPLE_KEY }).status, 503, "suspended agent");
eq(tryCall(triage, undefined, { key: SAMPLE_KEY }).status, 404, "not exposed");
eq(tryCall(triage, { ...exp, keys: exp.keys.map((k) => ({ ...k, expiresAt: "2020-01-01T00:00:00Z" })) }, { key: SAMPLE_KEY }).code, "key_expired", "expired key");
ok(exp.keys.every((k) => !("secret" in k) && /^[0-9a-f]{64}$/.test(k.hash)), "keys keep a hash and no secret");
ok(validateAccess(triage, { ...DEFAULT_ACCESS(), interfaces: [] }).some((i) => i.path === "interfaces" && i.level === "error"), "needs an interface");
ok(validateAccess(triage, { ...DEFAULT_ACCESS(), allowedOrigins: ["shop.example.com/path"] }).some((i) => i.path === "allowedOrigins"), "origin format");
ok(validateAccess(triage, { ...DEFAULT_ACCESS(), allowedCidrs: ["not-a-range"] }).some((i) => i.path === "allowedCidrs"), "cidr format");
ok(validateAccess(triage, { ...DEFAULT_ACCESS(), rateLimitPerMin: 0 }).some((i) => i.path === "rateLimitPerMin"), "rate limit range");
ok(validateAccess(triage, { ...DEFAULT_ACCESS(), interfaces: ["openai"], acceptServiceTokens: false }).some((i) => i.path === "keys"), "nobody can call it");
for (const l of LANGS) for (const i of INTERFACES) {
  const code = snippet(triage, exp, i.id, l.id);
  ok(code.length > 20 && !/tok_ak_/.test(code) && !/tok_ss_/.test(code), `snippet ${l.id}/${i.id} holds no secret`);
  ok(l.id === "cli" || code.includes("TOKENER_AGENT_KEY"), `snippet ${l.id}/${i.id} reads the key from the environment`);
}
ok(snippet(triage, { ...exp, signing: { ...exp.signing!, required: true } }, "rest", "python").includes("x-tok-signature"), "signed snippet adds the header");
ok(!snippet(triage, exp, "rest", "node").includes("x-tok-signature"), "unsigned snippet has no signature");

console.log(`${pass} checks passed${fail ? `, ${fail} FAILED` : ""}`);
process.exit(fail ? 1 : 0);
