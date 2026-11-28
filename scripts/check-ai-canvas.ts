/**
 * Checks for the AI canvas: how models, the gateway, MCP servers and callers are joined, which path lights when a node is pointed at, and what the findings say.
 * Run: npx tsx --tsconfig scripts/tsconfig.scripts.json scripts/check-ai-canvas.ts
 */
import { aliasProvider, buildCanvas, focusCanvas, pathFrom, providerIdFor, providerKind, validateExpose, GATEWAY_ID } from "../src/lib/mlops/ai-canvas";
import { seedServers } from "../src/lib/mlops/mcp-seeds";
import { PROVIDERS } from "../src/lib/gateway/data";
import type { Deployment } from "../src/lib/mlops/types";
import type { Grant } from "../src/lib/mlops/mcp-access";

let pass = 0; let fail = 0;
const ok = (c: unknown, m: string) => { if (c) pass++; else { fail++; console.error("FAIL", m); } };
const eq = (a: unknown, b: unknown, m: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`);

const dep = (o: Partial<Deployment> & { id: string; name: string }): Deployment => ({
  modelId: "m", version: 1, env: "staging", connectionId: "c", runtime: "vllm", health: "healthy", healthDetail: "", endpoint: "https://x", replicas: { desired: 1, ready: 1, min: 1, max: 1 },
  resources: { cpu: "1", memory: "1Gi", gpu: "1" }, traffic: { stable: 100, canary: 0 }, rollout: { state: "idle", strategy: "recreate" }, rollbackAvailable: false, createdAt: "", updatedAt: "", demo: true, ...o,
} as Deployment);
const grant = (id: string, serverId: string, kind: Grant["principal"]["kind"], o: Partial<Grant> = {}): Grant => ({ id, serverId, principal: { kind, id, label: id }, tools: "all", scope: "reads", ratePerMinute: 10, note: "", createdBy: "x", createdAt: "", status: "active", ...o } as Grant);

const servers = seedServers();
const llama = dep({ id: "d1", name: "llama-3-70b-prod", env: "production", accelerator: { engine: "vllm", gpu: "H100", count: 2, cuda: "12.4" }, exposure: { providerId: "llama-prod" } });
const bare = dep({ id: "d2", name: "mistral-staging", accelerator: { engine: "vllm", gpu: "L4", count: 1, cuda: "12.4" } });
const classifier = dep({ id: "d3", name: "classifier-dev", env: "development", accelerator: undefined, runtime: "custom-container" });
const provs = [...PROVIDERS, { ...PROVIDERS[0], id: "llama-prod", name: "llama-3-70b-prod (self-hosted)", kind: "Self-hosted", selfHosted: true, models: ["llama-3-70b-prod"] }];
const grants = [grant("g1", "mcps-support", "group"), grant("g2", "mcps-support", "app"), grant("g3", "mcps-support", "app"), grant("g4", "mcps-support", "user", { status: "revoked" }), grant("g5", "mcps-support", "user", { expiresAt: "2020-01-01T00:00:00Z" })];

// ---- kinds
eq(providerKind({ kind: "OpenAI", selfHosted: undefined }), "vendor", "a vendor API is a vendor");
eq(providerKind({ kind: "Self-hosted" }), "own", "self hosted is your own");
eq(providerKind({ kind: "OpenAI-compatible" }), "own", "a compatible endpoint is your own");
eq(aliasProvider("vllm-cluster/llama-3-70b", PROVIDERS), "vllm-cluster", "provider/model names one provider");
eq(aliasProvider("chat-default", PROVIDERS), null, "a gateway alias names no provider");
eq(aliasProvider("nobody/x", PROVIDERS), null, "an unknown provider is not one");
eq(providerIdFor({ name: "Llama 3 70B (prod)" }), "llama-3-70b-prod", "a provider id from a deployment name");

// ---- the picture
const c = buildCanvas({ deployments: [llama, bare, classifier], providers: provs, servers, grants });
const node = (id: string) => c.nodes.find((n) => n.id === id);
ok(node("d:d1") && !node("p:llama-prod"), "a hosted model and its provider are one node");
eq(node("d:d1")?.providerId, "llama-prod", "the node knows its provider");
ok(node("d:d2")?.outside === true, "a hosted model with no provider is outside the gateway");
ok(!node("d:d3"), "a development model that is not an LLM is left off");
ok(!buildCanvas({ deployments: [dep({ id: "d4", name: "classifier-prod", env: "production", accelerator: undefined, runtime: "kserve-huggingface" })], providers: [], servers: [], grants: [] }).nodes.some((n) => n.id === "d:d4"), "a classifier in production with no accelerator and no route is left off too");
ok(c.edges.some((e) => e.id === "e:d:d2" && e.dashed), "an outside model has a dashed line");
ok(c.edges.some((e) => e.id === "e:d:d1" && !e.dashed && e.to === GATEWAY_ID), "an exposed model has a solid line to the gateway");
eq(node("p:openai-primary")?.kind, "vendor", "a vendor node");
eq(node("p:vllm-cluster")?.kind, "own", "your own endpoint");
eq(c.counts.hosted, 2, "two hosted models");
ok(c.edges.some((e) => e.from === GATEWAY_ID && e.to === "s:mcps-support"), "a server with model tools hangs off the gateway");
eq(c.nodes.filter((n) => n.column === 3).map((n) => n.label), ["1 group", "2 applications"], "callers group by kind, and revoked or expired grants do not count");
ok(c.edges.some((e) => e.from === "s:mcps-support" && e.to === "c:app" && e.note === "2"), "a caller line carries its count");

// ---- findings
ok(c.findings.some((f) => f.action === "add-to-gateway" && /1 hosted model is not in the gateway/.test(f.text)), "says which models are outside");
ok(c.findings.some((f) => f.action === "publish" && f.ref === "mcps-ops"), "a draft server with a model tool is flagged");
const none = buildCanvas({ deployments: [], providers: [], servers: [], grants: [] });
eq(none.nodes.map((n) => n.id), [GATEWAY_ID], "an empty workspace shows only the gateway");
eq(none.findings.length, 0, "and has nothing to say");
const sick = buildCanvas({ deployments: [], providers: [{ ...PROVIDERS[0], status: "degraded" }], servers: [], grants: [] });
ok(sick.findings.some((f) => /degraded/.test(f.text)), "a degraded model is flagged");

// ---- paths
const ctx = { servers, providers: provs };
const fromLlama = pathFrom(c, "d:d1", ctx);
ok(fromLlama.has(GATEWAY_ID) && !fromLlama.has("s:mcps-ops"), "a model reaches only servers that name it or use a gateway alias");
const fromVllm = pathFrom(c, "p:vllm-cluster", ctx);
ok(fromVllm.has("s:mcps-ops") && fromVllm.has("s:mcps-support"), "your endpoint reaches the server that names it and the server that uses an alias");
const fromOps = pathFrom(c, "s:mcps-ops", ctx);
ok(fromOps.has("p:vllm-cluster") && !fromOps.has("p:openai-primary"), "a server lights the model its tool names, and no other");
const fromCallers = pathFrom(c, "c:app", ctx);
ok(fromCallers.has("s:mcps-support") && fromCallers.has(GATEWAY_ID), "callers light their server and the gateway");
ok(pathFrom(c, GATEWAY_ID, ctx).has("s:mcps-support"), "the gateway lights every server behind it");
eq([...pathFrom(c, "nope", ctx)], ["nope"], "an unknown node lights itself only");

// ---- one model on its own
const one = focusCanvas(c, "p:vllm-cluster", ctx);
ok(!one.nodes.some((n) => n.id === "s:mcps-support"), "a focused picture leaves out servers that only use a gateway alias");
ok(one.nodes.some((n) => n.id === "p:vllm-cluster") && !one.nodes.some((n) => n.id === "p:openai-primary"), "a focused picture keeps the model and drops the others");
ok(one.nodes.some((n) => n.id === "s:mcps-ops") && one.edges.every((e) => one.nodes.some((n) => n.id === e.from) && one.nodes.some((n) => n.id === e.to)), "and every line has both ends");
eq(focusCanvas(c, "d:d2", ctx).nodes.map((n) => n.id).sort(), ["d:d2", "gateway"].sort(), "a model outside the gateway shows itself and the gateway only");

// ---- adding a tool
eq(validateExpose({ name: "ask_llama", description: "Ask the llama model a question.", alias: "x/y", serverTools: [] }), null, "a good tool");
ok(!!validateExpose({ name: "Ask Llama", description: "Ask the llama model a question.", alias: "x/y", serverTools: [] }), "a bad name");
ok(!!validateExpose({ name: "ask_llama", description: "Ask.", alias: "x/y", serverTools: [] }), "a short description");
ok(!!validateExpose({ name: "ask_llama", description: "Ask the llama model a question.", alias: "x/y", serverTools: ["ask_llama"] }), "a duplicate name");
ok(!!validateExpose({ name: "ask_llama", description: "Ask the llama model a question.", alias: " ", serverTools: [] }), "no model chosen");

console.log(`${pass} passed, ${fail} failed`); if (fail) process.exit(1);
