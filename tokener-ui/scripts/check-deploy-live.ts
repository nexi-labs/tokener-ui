/**
 * The live driver's deployModel sends what the Java Deploy record reads, and returns what the server answered. A refusal comes back as its message.
 * Run from tokener-ui: npx tsx scripts/check-deploy-live.ts
 */
import { createLiveDriver } from "../src/lib/mlops/live/driver";

let pass = 0, fail = 0;
const ok = (c: boolean, what: string) => { if (c) pass++; else { fail++; console.log("FAIL", what); } };

const seen: { method: string; path: string; body: any }[] = [];
let refuse = false;
globalThis.fetch = (async (url: string, init: any) => {
  const path = String(url).replace(/^https?:\/\/[^/]+/, "");
  seen.push({ method: init?.method ?? "GET", path, body: init?.body ? JSON.parse(init.body) : undefined });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
  if (init?.method === "POST" && path.endsWith("/deployments")) return refuse ? json({ code: "INVALID", detail: "This model at this context and concurrency needs at least 2 x H100 per replica." }, 422) : json({ id: "dep-1", name: "llama-dev" }, 201);
  return json(path.includes("/runs") || path.includes("/audit") || path.includes("/payments") ? { content: [], page: 0, size: 100, totalElements: 0, totalPages: 0 } : []);
}) as typeof fetch;

const state: any = { deployments: [], audit: [] };
const driver = createLiveDriver({ state: () => state, update: (f) => Object.assign(state, f(state)), context: () => ({ orgId: "org-1", isPlatform: false, userEmail: "a@b.c" }) });
const input = { name: "llama-dev", modelId: "llama8", version: 1, env: "development", connectionId: "dev-k8s", runtime: "vllm", engine: "vllm", gpu: "H100 80GB", gpuCount: 1, cuda: "12.8", driver: "570.124.06", min: 1, max: 3, cpu: "8", memory: "64Gi", precision: "fp8", contextTokens: 8192, concurrency: 16 };

(async () => {
  const r = await driver.actions.deployModel(input);
  ok(r.ok && (r as any).id === "dep-1", "the id of the new deployment comes back");
  const post = seen.find((s) => s.method === "POST");
  ok(post?.path === "/api/v1/orgs/org-1/mlops/deployments", "it posts to the deployments route");
  // The names the Java Deploy record reads.
  const javaFields = ["name", "modelId", "version", "env", "connectionId", "runtime", "engine", "gpu", "gpuCount", "cuda", "driver", "min", "max", "cpu", "memory", "precision", "contextTokens", "concurrency", "exposure"];
  ok(Object.keys(post?.body ?? {}).sort().join() === javaFields.slice().sort().join(), "the body has exactly the fields of the Java Deploy record");
  ok(post?.body.gpuCount === 1 && post?.body.contextTokens === 8192 && post?.body.exposure === null, "values and nulls");
  ok(seen.some((s) => s.method === "GET" && s.path.endsWith("/deployments")), "the deployments are read again afterwards");
  refuse = true;
  const bad = await driver.actions.deployModel(input);
  ok(!bad.ok && (bad as any).error.includes("needs at least 2 x H100"), "a refusal comes back as the server's message");
  console.log(`${pass} checks passed, ${fail} failed`);
  driver.stop?.();
  process.exit(fail ? 1 : 0);
})();
