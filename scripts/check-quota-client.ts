/**
 * Runs the console quota client (liveQuotas, sampleQuotas) against a stubbed fetch and checks the request shapes the quota routes expect:
 * the tenant query, the create body, DELETE as disable, and that every window the screen offers is one the quota check can read.
 * No Java output is involved, because the quota module is Spring code that is not compiled here. From the repository root: bash scripts/quota_client_check.sh
 */
import { liveQuotas, sampleQuotas, WINDOWS, METRICS } from "../src/lib/quotas/client";
import { registerAuthBridge } from "../src/lib/api/client";
const calls: { method: string; url: string; body: any }[] = [];
(globalThis as any).fetch = async (url: string, init: any) => {
  calls.push({ method: init?.method ?? "GET", url, body: init?.body ? JSON.parse(init.body) : undefined });
  if (init?.method === "DELETE") return new Response(null, { status: 204 });
  if (init?.method === "POST") return new Response(JSON.stringify({ id: "q-9" }), { status: 201, headers: { "content-type": "application/json" } });
  return new Response(JSON.stringify([{ id: "q-1", scopeType: "APPLICATION", scopeId: "a-1", metric: "REQUESTS", windowType: "SLIDING", windowSpec: "1m", limitValue: 600, enabled: true }]), { status: 200, headers: { "content-type": "application/json" } });
};
registerAuthBridge({ getToken: async () => "tok", onUnauthorized: () => {} });
let fail = 0; const ok = (c: boolean, n: string) => { if (!c) fail++; console.log(c ? "ok  " : "FAIL", n); };
(async () => {
  const list = await liveQuotas.list("t-1");
  ok(calls[0].method === "GET" && calls[0].url.includes("/api/v1/quotas?tenantId=t-1") && list[0].limitValue === 600, "list asks for the tenant and keeps the limit");
  const id = await liveQuotas.create({ scopeType: "APPLICATION", scopeId: "a-1", metric: "TOKENS", windowType: "SLIDING", windowSpec: "1h", limitValue: 2000000, tenantId: "t-1" });
  ok(id === "q-9" && calls[1].method === "POST" && calls[1].url.endsWith("/api/v1/quotas"), "create posts to /quotas and returns the id");
  ok(calls[1].body.windowType === "SLIDING" && calls[1].body.windowSpec === "1h" && calls[1].body.tenantId === "t-1" && calls[1].body.limitValue === 2000000, "create body carries window, tenant and limit");
  await liveQuotas.disable("q-1");
  ok(calls[2].method === "DELETE" && calls[2].url.endsWith("/api/v1/quotas/q-1"), "disable is DELETE on the quota");
  ok(WINDOWS.every((w) => (w.windowType === "FIXED" ? w.windowSpec === "daily" : ["1m", "1h"].includes(w.windowSpec))), "every window offered is one the quota check can read");
  ok(METRICS.map((m) => m.value).join() === "REQUESTS,TOKENS,IMAGES,EMBEDDINGS,SPEECH_SECONDS", "metrics match the server enum");
  const T1 = "00000000-0000-4000-8000-0000000000b1";
  const before = (await sampleQuotas.list(T1)).length;
  await sampleQuotas.create({ scopeType: "TENANT", scopeId: T1, metric: "IMAGES", windowType: "FIXED", windowSpec: "daily", limitValue: 5, tenantId: T1 });
  ok((await sampleQuotas.list(T1)).length === before + 1, "sample create adds to the tenant");
  let bad = 0; for (const q of [{ windowType: "SLIDING" as const, windowSpec: "5m", limitValue: 5 }, { windowType: "FIXED" as const, windowSpec: "1h", limitValue: 5 }, { windowType: "SLIDING" as const, windowSpec: "1m", limitValue: 0 }]) {
    try { await sampleQuotas.create({ scopeType: "TENANT", scopeId: T1, metric: "REQUESTS", tenantId: T1, ...q }); } catch { bad++; }
  }
  ok(bad === 3, "sample refuses an unreadable window and a zero limit, as the domain does");
  process.exit(fail ? 1 : 0);
})();
