/**
 * Runs the console audit client (liveAudit, sampleAudit) against a stubbed fetch and checks the request shapes the audit routes expect:
 * trimmed and omitted filters, ISO date-times, paging, the CSV export Accept header. No Java output is involved, because the audit module is
 * Spring code that is not compiled here. From the repository root: bash scripts/audit_client_check.sh
 */
import { liveAudit, sampleAudit } from "../src/lib/audit/client";
import { registerAuthBridge } from "../src/lib/api/client";
const calls: string[] = [];
(globalThis as any).fetch = async (url: string, init: any) => {
  calls.push(`${init?.method ?? "GET"} ${url} accept=${init?.headers?.Accept} auth=${init?.headers?.Authorization}`);
  if (url.includes("/export")) return new Response("id,tenant_id\n", { status: 200, headers: { "content-type": "text/csv" } });
  return new Response(JSON.stringify({ content: [], page: 1, size: 20, totalElements: 0, totalPages: 0 }), { status: 200, headers: { "content-type": "application/json" } });
};
registerAuthBridge({ getToken: async () => "tok", onUnauthorized: () => {} });
let fail = 0; const ok = (c: boolean, n: string) => { if (!c) fail++; console.log(c ? "ok  " : "FAIL", n); };
(async () => {
  await liveAudit.query({ tenantId: "t-1", action: " BudgetBreachEvent ", actorId: "", from: "2026-10-01T00:00:00.000Z" }, 1, 20);
  const csv = await liveAudit.exportCsv({ tenantId: "t-1", to: "2026-10-31T23:59:59.999Z" });
  console.log(calls.join("\n"));
  ok(calls[0].includes("/api/v1/audit?") && calls[0].includes("tenantId=t-1") && calls[0].includes("action=BudgetBreachEvent") && calls[0].includes("page=1") && calls[0].includes("size=20"), "query sends tenant, trimmed action, paging");
  ok(!calls[0].includes("actorId"), "empty filters are not sent");
  ok(calls[0].includes("from=2026-10-01T00%3A00%3A00.000Z"), "date-time sent as ISO");
  ok(calls[0].includes("auth=Bearer tok"), "token attached");
  ok(calls[1].includes("/api/v1/audit/export?") && calls[1].includes("tenantId=t-1") && calls[1].includes("accept=text/csv"), "export asks for csv with tenant");
  ok((await csv.text()).startsWith("id,tenant_id"), "export returns the body as a blob");
  const s = await sampleAudit.query({ tenantId: "00000000-0000-4000-8000-0000000000b1", action: "BudgetBreachEvent" }, 0, 20);
  ok(s.totalElements === 1 && s.content[0].action === "BudgetBreachEvent", "sample filters by tenant and action");
  const all = await sampleAudit.query({}, 0, 2);
  ok(all.content.length === 2 && all.totalElements === 5 && all.totalPages === 3, "sample pages");
  ok((await (await sampleAudit.exportCsv({})).text()).split("\n").length === 7, "sample csv has header and 5 rows");
  process.exit(fail ? 1 : 0);
})();
