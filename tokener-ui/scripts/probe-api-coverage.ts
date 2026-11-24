/**
 * Which API operations does the console actually call? Runs every action and loader of the live drivers (MLOps, Refinery) with placeholder arguments against a
 * recording fetch, then compares what was requested with the operations in docs/api/*-openapi.json. Operations meant for machines (runner and agent protocols, payment
 * webhooks, the public pay page) are listed separately because no screen should call them.
 * Run from tokener-ui: npx tsx scripts/probe-api-coverage.ts
 */
import { readFileSync } from "node:fs";
import { createLiveDriver as mlopsDriver } from "../src/lib/mlops/live/driver";
import { createLiveDriver as refineryDriver } from "../src/lib/refinery/live/driver";

const ID = "__ID__";
const seen: { method: string; path: string }[] = [];
globalThis.fetch = (async (url: string, init: any) => {
  const path = String(url).replace(/^https?:\/\/[^/]+/, "").split("?")[0];
  seen.push({ method: (init?.method ?? "GET").toUpperCase(), path });
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
  const m = (init?.method ?? "GET").toUpperCase();
  if (m === "GET") return json(/(\/[a-z-]+)$/.test(path) && !path.endsWith(ID) ? { content: [], page: 0, size: 100, totalElements: 0, totalPages: 0, totalPages_: 0 } : {});
  return json({});
}) as typeof fetch;

// A value that accepts any property, call or conversion, so an action can run far enough to make its request.
function dummy(): any {
  const f: any = function () { return dummy(); };
  return new Proxy(f, {
    get: (_t, k) => (k === Symbol.toPrimitive ? () => ID : k === "then" ? undefined : k === Symbol.iterator ? function* () {} : k === "length" ? 1 : dummy()),
    apply: () => dummy(), construct: () => dummy(), has: () => true,
  });
}

async function probe(make: (port: any) => any) {
  const state: any = dummy();
  const port = { state: () => state, update: () => {}, context: () => ({ orgId: ID, isPlatform: true, userEmail: "a@b.c" }) };
  const driver = make(port);
  for (const [name, fn] of Object.entries<any>(driver.actions ?? {})) {
    if (typeof fn !== "function") continue;
    try { await Promise.race([fn(...Array.from({ length: Math.max(fn.length, 3) }, () => ID)), new Promise((r) => setTimeout(r, 400))]); } catch { /* the request was recorded before it failed */ }
    try { await Promise.race([fn(...Array.from({ length: Math.max(fn.length, 3) }, () => dummy())), new Promise((r) => setTimeout(r, 400))]); } catch { /* same */ }
  }
  try { await Promise.race([driver.refresh?.(), new Promise((r) => setTimeout(r, 4000))]); } catch { /* loaders */ }
  driver.stop?.();
}

const norm = (p: string) => p.replace(/^\/api\/v1\/orgs\/[^/]+\/(mlops|refinery)/, "").replace(/^\/api\/v1\/platform\/mlops/, "/platform").replace(new RegExp(ID, "g"), "{}").replace(/\/x(?=\/|$|:)/g, "/{}");
const MACHINE = /^\/(runner|agent|pay)\//;

(async () => {
  await probe(mlopsDriver); const mlopsSeen = new Set(seen.map((s) => s.method + " " + norm(s.path))); seen.length = 0;
  await probe(refineryDriver); const refSeen = new Set(seen.map((s) => s.method + " " + norm(s.path)));
  let gaps = 0;
  for (const [name, called] of [["mlops", mlopsSeen], ["refinery", refSeen]] as const) {
    const doc = JSON.parse(readFileSync(`../../docs/api/${name}-openapi.json`, "utf8"));
    const missing: string[] = []; let hit = 0, machine = 0;
    for (const [path, ops] of Object.entries<any>(doc.paths)) {
      const tail = path.replace(/^\/api\/v1\/orgs\/\{orgId\}\/(mlops|refinery)/, "").replace(/^\/api\/v1\/platform\/mlops/, "/platform").replace(/\{[^}]+\}/g, "{}");
      for (const [m, op] of Object.entries<any>(ops)) {
        if (MACHINE.test(tail)) { machine++; continue; }
        if (called.has(m.toUpperCase() + " " + tail)) hit++; else missing.push(`${m.toUpperCase()} ${tail}  (${op.operationId})`);
      }
    }
    console.log(`\n${name}: ${hit} operations called by the console, ${machine} for machines, ${missing.length} not called by any action`);
    for (const x of missing) console.log("   ", x);
    gaps += missing.length;
  }
  process.exit(0);
})();
