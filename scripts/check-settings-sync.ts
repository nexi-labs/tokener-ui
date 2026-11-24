/**
 * The console's settings sync: what it sends to the settings API, when, with which version, and what it does with a refusal. The field lists below are the ones the Java SettingRules
 * accept; a screen that wrote anything else would be refused by the server.
 * Run from tokener-ui: npx tsx scripts/check-settings-sync.ts
 */
import { setSyncOrganisation, pullSetting, syncStatus } from "../src/lib/refinery/settingsSync";
import { saveEdge, loadEdge, edgeKey, DEFAULT_EDGE } from "../src/lib/refinery/edge";
import { saveModel, clearModel, inferSemantics } from "../src/lib/refinery/semantics";
import { savePolicy as saveAgents, defaultPolicy } from "../src/lib/refinery/agentAccess";
import { saveTerms, defaultTerms } from "../src/lib/refinery/dataspace";
import { savePolicy as saveLocation, DEFAULT_POLICY } from "../src/lib/refinery/sovereignty";
import { sampleDatasets } from "../src/lib/refinery/sample";

let pass = 0, fail = 0;
const ok = (c: boolean, what: string) => { if (c) pass++; else { fail++; console.log("FAIL", what); } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };

const seen: { method: string; path: string; body: any }[] = [];
let version = 0; let mode: "ok" | "stale" | "invalid" | "get2" | "get0" = "ok";
globalThis.fetch = (async (url: string, init: any) => {
  const path = String(url).replace(/^https?:\/\/[^/]+/, ""); const method = init?.method ?? "GET";
  seen.push({ method, path, body: init?.body ? JSON.parse(init.body) : undefined });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
  if (method === "GET") return mode === "get2" ? json({ kind: "edge", scopeId: "pool-1", value: { connectivity: "online", bufferGb: 9, retentionDays: 3, syncEveryMinutes: 5, syncMetrics: false }, version: 2 }) : json({ kind: "edge", scopeId: "pool-1", value: {}, version: 0 });
  if (method === "DELETE") return new Response(null, { status: 204 });
  if (mode === "stale") return json({ code: "stale_setting", detail: "x" }, 409);
  if (mode === "invalid") return json({ code: "setting_invalid", detail: "The data address must be an https address." }, 422);
  return json({ kind: "edge", scopeId: "x", value: {}, version: ++version });
}) as typeof fetch;

const allowed = {
  semantics: { top: ["columns"], column: ["column", "kind", "label", "unit", "description", "opcua", "standardId"] },
  agent: ["enabled", "purpose", "columns", "maxRows", "tools", "clients"],
  space: ["publisher", "assetId", "baseUrl", "purposes", "licence", "licenceUrl", "partners", "validUntil", "noOnwardTransfer", "keywords", "personalDataNote"],
  edge: ["platform", "connectivity", "bufferGb", "retentionDays", "syncEveryMinutes", "syncMetrics"],
  location: ["enabled", "enforce", "allowed", "modelSteps", "modelPlace", "platformPlace", "places"],
};
const within = (o: Record<string, unknown>, list: string[]) => Object.keys(o).every((k) => list.includes(k));
const PUT = () => seen.filter((s) => s.method === "PUT");

(async () => {
  const d = sampleDatasets()[0];
  // sample workspace: nothing is sent
  saveEdge("pool-1", DEFAULT_EDGE); await sleep(900);
  ok(seen.length === 0, "the sample workspace sends nothing");
  ok(loadEdge("pool-1").bufferGb === 50, "and keeps the setting in the browser");

  setSyncOrganisation("org-1");
  // debounce: three quick changes, one request with the last value
  saveEdge("pool-1", { ...DEFAULT_EDGE, bufferGb: 10 }); saveEdge("pool-1", { ...DEFAULT_EDGE, bufferGb: 20 }); saveEdge("pool-1", { ...DEFAULT_EDGE, bufferGb: 30 });
  ok(seen.length === 0, "nothing is sent while the person is still typing");
  await sleep(1000);
  ok(PUT().length === 1 && PUT()[0].body.value.bufferGb === 30, "three quick changes make one request with the last value");
  ok(PUT()[0].path === "/api/v1/orgs/org-1/refinery/pools/pool-1/settings/edge", "an edge profile goes to the pool's settings route");
  ok(PUT()[0].body.expectedVersion === undefined, "the first save names no version");
  saveEdge("pool-1", { ...DEFAULT_EDGE, bufferGb: 40 }); await sleep(1000);
  ok(PUT()[1].body.expectedVersion === 1, "the next save names the version the server gave");

  // every kind sends only fields the server accepts
  seen.length = 0;
  const model = inferSemantics(d); saveModel(d, model);
  saveAgents(d, defaultPolicy(d)); saveTerms(d, defaultTerms(d)); saveLocation({ ...DEFAULT_POLICY, places: { "conn:c1": "eu" } });
  await sleep(1000);
  const by = (p: string) => PUT().find((s) => s.path.endsWith(p))!;
  ok(by(`/datasets/${d.id}/settings/semantics`).body.value.columns.every((c: any) => within(c, allowed.semantics.column)) && within(by("/semantics").body.value, allowed.semantics.top), "semantics send only the fields the server accepts");
  ok(within(by("/agent-access").body.value, allowed.agent), "agent access sends only the fields the server accepts");
  ok(within(by("/data-space").body.value, allowed.space), "data space terms send only the fields the server accepts");
  ok(by("/refinery/settings/data-location").path === "/api/v1/orgs/org-1/refinery/settings/data-location" && within(by("/settings/data-location").body.value, allowed.location), "the policy goes to the organisation route with only accepted fields");
  ok(within({ ...DEFAULT_EDGE }, allowed.edge), "an edge profile has only accepted fields");

  // removal
  seen.length = 0; clearModel(d); await sleep(1000);
  ok(seen.length === 1 && seen[0].method === "DELETE" && seen[0].path.endsWith(`/datasets/${d.id}/settings/semantics`), "resetting a semantic model removes it from the server");

  // refusals
  mode = "invalid"; saveTerms(d, { ...defaultTerms(d), baseUrl: "http://x" }); await sleep(1000);
  ok(syncStatus().phase === "error" && syncStatus().message === "The data address must be an https address.", "a refusal shows the server's own reason");
  mode = "stale"; saveEdge("pool-1", { ...DEFAULT_EDGE, bufferGb: 41 }); await sleep(1000);
  ok(syncStatus().phase === "error" && /Someone else changed/.test(syncStatus().message ?? ""), "a stale save says someone else changed it");
  seen.length = 0; mode = "ok"; saveEdge("pool-1", { ...DEFAULT_EDGE, bufferGb: 42 }); await sleep(1000);
  ok(PUT()[0].body.expectedVersion === undefined, "after a stale refusal the next save starts again from what the server holds");

  // loading
  store.delete(edgeKey("pool-1")); mode = "get2";
  ok(await pullSetting("pools", "pool-1", "edge", edgeKey("pool-1")) === true && loadEdge("pool-1").bufferGb === 9, "opening a screen loads the server's copy into the browser copy");
  ok(await pullSetting("pools", "pool-1", "edge", edgeKey("pool-1")) === true && loadEdge("pool-1").bufferGb === 9, "and applies it again when a second load asks, as React does in development");
  mode = "get0";
  ok(await pullSetting("pools", "pool-1", "edge", edgeKey("pool-1")) === true && store.get(edgeKey("pool-1")) === undefined, "a setting the server does not hold clears a leftover browser copy");

  setSyncOrganisation(null); seen.length = 0; saveEdge("pool-1", DEFAULT_EDGE); await sleep(900);
  ok(seen.length === 0, "going back to the sample workspace stops sending");
  console.log(`settings sync: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
