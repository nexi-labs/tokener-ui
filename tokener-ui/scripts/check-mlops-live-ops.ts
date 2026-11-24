/**
 * The live driver sends what the Java routes read for: model stage, agent enrollment reissue, pipeline export and pipeline delete.
 * Run from tokener-ui: npx tsx scripts/check-mlops-live-ops.ts
 */
import { createLiveDriver } from "../src/lib/mlops/live/driver";

let pass = 0, fail = 0;
const ok = (c: boolean, what: string) => { if (c) pass++; else { fail++; console.log("FAIL", what); } };

const seen: { method: string; path: string; body: any }[] = [];
let refuse: string | null = null;
globalThis.fetch = (async (url: string, init: any) => {
  const path = String(url).replace(/^https?:\/\/[^/]+/, "");
  const method = init?.method ?? "GET";
  seen.push({ method, path, body: init?.body ? JSON.parse(init.body) : undefined });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
  if (refuse && method !== "GET") return json({ code: "CONFLICT", detail: refuse }, 409);
  if (method === "POST" && path.endsWith(":reissueToken")) return json({ agent: { id: "a1", name: "gpu-builder-07", mode: "docker", env: "staging" }, token: "tok_enr_abc", expiresAt: "2026-11-22T00:00:00Z" });
  if (method === "GET" && path.includes("/export")) return new Response("apiVersion: tokener.io/v1\nkind: Pipeline\n", { status: 200, headers: { "content-type": "application/yaml" } });
  if (method === "DELETE") return new Response(null, { status: 204 });
  return json(path.includes("/runs") || path.includes("/audit") || path.includes("/payments") ? { content: [], page: 0, size: 100, totalElements: 0, totalPages: 0 } : []);
}) as typeof fetch;

const state: any = { pipelines: [{ id: "pl1", name: "churn-train", versions: [{ version: 3 }], draft: undefined }], agents: [], models: [], audit: [] };
const driver = createLiveDriver({ state: () => state, update: (f) => Object.assign(state, f(state)), context: () => ({ orgId: "org-1", isPlatform: false, userEmail: "a@b.c" }) });
const A: any = driver.actions;
const base = "/api/v1/orgs/org-1/mlops";

(async () => {
  // stage
  const st = await A.stageVersion("m1", 4, "staging");
  const sp = seen.find((s) => s.method === "POST" && s.path.includes(":stage"));
  ok(st.ok && sp?.path === `${base}/models/m1/versions/4:stage`, "stage posts to the version route");
  ok(JSON.stringify(sp?.body) === JSON.stringify({ stage: "staging" }), "stage sends only the stage");
  ok(seen.some((s) => s.method === "GET" && s.path.endsWith("/models")), "models are read again after a stage move");

  // reissue
  const rr = await A.reissueAgentEnrollment("a1");
  ok(rr.ok && rr.token === "tok_enr_abc", "the new enrollment token comes back once");
  ok(seen.some((s) => s.method === "POST" && s.path === `${base}/agents/a1:reissueToken`), "reissue posts to the reissueToken route");

  // export
  const ex = await A.exportPipeline("pl1", 2);
  ok(ex.ok && ex.yaml.startsWith("apiVersion:") && ex.label === "v2", "export returns the YAML text and its version label");
  ok(seen.some((s) => s.method === "GET" && s.path === `${base}/pipelines/pl1/export?version=2`), "export asks for the version");
  const ex2 = await A.exportPipeline("pl1");
  ok(ex2.ok && ex2.label === "v3", "without a version the label is the latest");
  ok(seen.some((s) => s.method === "GET" && s.path === `${base}/pipelines/pl1/export`), "without a version there is no query");

  // delete
  const dl = await A.deletePipeline("pl1", "churn-train");
  ok(dl.ok, "delete succeeds on 204");
  ok(seen.some((s) => s.method === "DELETE" && s.path === `${base}/pipelines/pl1?confirm=churn-train`), "delete sends the typed name as confirm");

  // manual refund
  const mr = await A.recordManualRefund("pay-9", "rf-1", "  Bank transfer ref 42  ");
  const mp = seen.find((x) => x.method === "POST" && x.path.endsWith(":recordManual"));
  ok(mr.ok && mp?.path === `${base}/payments/pay-9/refunds/rf-1:recordManual`, "manual refund posts to the recordManual route");
  ok(JSON.stringify(mp?.body) === JSON.stringify({ note: "Bank transfer ref 42" }), "the note is sent trimmed and alone");
  ok(seen.some((x) => x.method === "GET" && x.path.includes("/payments")), "payments are read again afterwards");

  // refusals come back as the server's words
  refuse = "This pipeline has 2 runs in progress. Cancel them first.";
  const bad = await A.deletePipeline("pl1", "churn-train");
  ok(!bad.ok && bad.error.includes("2 runs in progress"), "a delete refusal comes back as the message");
  refuse = "This agent is enrolled. Rotate its token instead.";
  const bad2 = await A.reissueAgentEnrollment("a1");
  ok(!bad2.ok && bad2.error.includes("Rotate its token"), "a reissue refusal comes back as the message");
  refuse = "A version must be in staging before it goes to production.";
  const bad3 = await A.stageVersion("m1", 4, "production");
  ok(!bad3.ok && bad3.error.includes("staging"), "a stage refusal comes back as the message");

  refuse = "Only an approved refund can be recorded as done.";
  const bad4 = await A.recordManualRefund("pay-9", "rf-1", "x");
  ok(!bad4.ok && bad4.error.includes("approved refund"), "a manual refund refusal comes back as the message");

  console.log(`${pass} checks passed, ${fail} failed`);
  driver.stop?.();
  process.exit(fail ? 1 : 0);
})();
