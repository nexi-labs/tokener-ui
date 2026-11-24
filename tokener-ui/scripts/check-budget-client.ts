/**
 * Runs the console budget client (liveBudgets, sampleBudgets) against a stubbed fetch and checks the request shapes the budget routes expect:
 * the tenant query, the create body with the fields the API accepts, DELETE as disable. No Java output is involved, because the budget module is
 * Spring code that is not compiled here. From the repository root: bash scripts/budget_client_check.sh
 */
import { liveBudgets, sampleBudgets } from "../src/lib/budgets/client";
import { registerAuthBridge } from "../src/lib/api/client";
const calls: { method: string; url: string; body: any }[] = [];
(globalThis as any).fetch = async (url: string, init: any) => {
  calls.push({ method: init?.method ?? "GET", url, body: init?.body ? JSON.parse(init.body) : undefined });
  if (init?.method === "DELETE") return new Response(null, { status: 204 });
  if (init?.method === "POST") return new Response(JSON.stringify({ id: "b-9" }), { status: 201, headers: { "content-type": "application/json" } });
  return new Response(JSON.stringify([{ id: "b-1", scopeType: "TENANT", scopeId: "t-1", metric: "COST", limitValue: 60000.5, currency: "USD", period: "MONTHLY", onBreach: "THROTTLE", rollover: false, enabled: true }]), { status: 200, headers: { "content-type": "application/json" } });
};
registerAuthBridge({ getToken: async () => "tok", onUnauthorized: () => {} });
let fail = 0; const ok = (c: boolean, n: string) => { if (!c) fail++; console.log(c ? "ok  " : "FAIL", n); };
(async () => {
  const list = await liveBudgets.list("t-1");
  ok(calls[0].method === "GET" && calls[0].url.includes("/api/v1/budgets?tenantId=t-1"), "list asks for the tenant");
  ok(list[0].limitValue === 60000.5 && list[0].onBreach === "THROTTLE", "list keeps limit and breach action");
  const id = await liveBudgets.create({ scopeType: "PROJECT", scopeId: "p-1", metric: "TOKENS", limitValue: 20000, period: "DAILY", onBreach: "BLOCK", rollover: false, tenantId: "t-1" });
  ok(id === "b-9" && calls[1].method === "POST" && calls[1].url.endsWith("/api/v1/budgets"), "create posts to /budgets and returns the id");
  ok(calls[1].body.scopeType === "PROJECT" && calls[1].body.tenantId === "t-1" && calls[1].body.limitValue === 20000 && calls[1].body.onBreach === "BLOCK", "create body carries scope, tenant, limit, action");
  await liveBudgets.disable("b-1");
  ok(calls[2].method === "DELETE" && calls[2].url.endsWith("/api/v1/budgets/b-1"), "disable is DELETE on the budget");
  const T1 = "00000000-0000-4000-8000-0000000000b1";
  const before = (await sampleBudgets.list(T1)).length;
  await sampleBudgets.create({ scopeType: "TENANT", scopeId: T1, metric: "TOKENS", limitValue: 5, period: "DAILY", onBreach: "WARN", rollover: false, tenantId: T1 });
  ok((await sampleBudgets.list(T1)).length === before + 1, "sample create adds to the tenant");
  const first = (await sampleBudgets.list(T1))[0];
  await sampleBudgets.disable(first.id);
  ok((await sampleBudgets.list(T1)).find((b) => b.id === first.id)?.enabled === false, "sample disable keeps the budget, switched off");
  let rejected = false; try { await sampleBudgets.create({ scopeType: "TENANT", scopeId: T1, metric: "COST", limitValue: 0, period: "DAILY", onBreach: "WARN", rollover: false, tenantId: T1 }); } catch { rejected = true; }
  ok(rejected, "sample refuses a limit of zero");
  process.exit(fail ? 1 : 0);
})();
