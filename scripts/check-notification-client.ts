/**
 * Runs the console notification client (liveNotifications, sampleNotifications) against a stubbed fetch and checks the request shapes the
 * notification routes expect: tenant queries, the email channel body (the address goes in config.to), the rule body, a direct send, history limit,
 * and DELETE as disable. No Java output is involved, because the notification module is Spring code that is not compiled here.
 * From the repository root: bash scripts/notification_client_check.sh
 */
import { liveNotifications, sampleNotifications, TARGET_KEY, TRIGGERS } from "../src/lib/notifications/client";
import { registerAuthBridge } from "../src/lib/api/client";
const calls: { method: string; url: string; body: any }[] = [];
(globalThis as any).fetch = async (url: string, init: any) => {
  calls.push({ method: init?.method ?? "GET", url, body: init?.body ? JSON.parse(init.body) : undefined });
  if (init?.method === "DELETE" || url.endsWith("/send")) return new Response(null, { status: 204 });
  if (init?.method === "POST") return new Response(JSON.stringify({ id: "n-9" }), { status: 201, headers: { "content-type": "application/json" } });
  return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
};
registerAuthBridge({ getToken: async () => "tok", onUnauthorized: () => {} });
let fail = 0; const ok = (c: boolean, n: string) => { if (!c) fail++; console.log(c ? "ok  " : "FAIL", n); };
(async () => {
  await liveNotifications.channels("t-1"); await liveNotifications.rules("t-1"); await liveNotifications.history("t-1", 50);
  ok(calls[0].url.includes("/api/v1/notifications/channels?tenantId=t-1") && calls[1].url.includes("/notifications/rules?tenantId=t-1"), "channels and rules ask for the tenant");
  ok(calls[2].url.includes("/notifications/history?") && calls[2].url.includes("tenantId=t-1") && calls[2].url.includes("limit=50"), "history asks for the tenant and a limit");
  const cid = await liveNotifications.createChannel("t-1", "EMAIL", "Finance", "finance@acme.io");
  ok(cid === "n-9" && calls[3].url.endsWith("/notifications/channels") && calls[3].body.channel === "EMAIL" && calls[3].body.config.to === "finance@acme.io" && calls[3].body.tenantId === "t-1", "email channel carries its address in config.to");
  await liveNotifications.createChannel("t-1", "SLACK", "Alerts", "https://hooks.slack.com/services/T/B/X");
  ok(calls[4].body.channel === "SLACK" && calls[4].body.config.webhookUrl === "https://hooks.slack.com/services/T/B/X" && Object.keys(calls[4].body.config).length === 1, "a Slack channel sends its address as webhookUrl and nothing else");
  await liveNotifications.createChannel("t-1", "WEBHOOK", "Hook", "https://example.org/h");
  ok(calls[5].body.config.url === "https://example.org/h" && TARGET_KEY.TEAMS === "webhookUrl" && TARGET_KEY.DISCORD === "webhookUrl", "a webhook sends url; Teams and Discord send webhookUrl")
  await liveNotifications.createRule("t-1", "BudgetBreachEvent", " action=BLOCK ", "c-1");
  ok(calls[6].url.endsWith("/notifications/rules") && calls[6].body.triggerEventType === "BudgetBreachEvent" && calls[6].body.conditionExpr === "action=BLOCK" && calls[6].body.channelId === "c-1", "rule body carries trigger, trimmed condition and channel");
  await liveNotifications.createRule("t-1", "BudgetBreachEvent", "  ", "c-1");
  ok(!("conditionExpr" in calls[7].body), "an empty condition is not sent");
  await liveNotifications.send("t-1", "c-1", "Test", "Hello");
  ok(calls[8].method === "POST" && calls[8].url.endsWith("/notifications/send") && calls[8].body.subject === "Test" && calls[8].body.body === "Hello" && calls[8].body.channelId === "c-1", "send body carries channel, subject and message");
  await liveNotifications.disableChannel("c-1");
  ok(calls[9].method === "DELETE" && calls[9].url.endsWith("/notifications/channels/c-1"), "disable is DELETE on the channel");
  ok(TRIGGERS.every((t) => t.value === "BudgetBreachEvent" || t.value === "refinery.alert.raised" || t.value.startsWith("provider.")), "triggers are events the platform publishes with a tenant id");
  const T1 = "00000000-0000-4000-8000-0000000000b1";
  const n0 = (await sampleNotifications.channels(T1)).length;
  await sampleNotifications.createChannel(T1, "EMAIL", "New", "a@b.io");
  ok((await sampleNotifications.channels(T1)).length === n0 + 1, "sample adds a channel");
  let bad = 0;
  for (const [type, target] of [["EMAIL", "nope"], ["WEBHOOK", "http://example.org/h"], ["SLACK", "https://example.org/x"], ["DISCORD", "https://discord.com/other"]] as const) {
    try { await sampleNotifications.createChannel(T1, type, "Bad", target); } catch { bad++; }
  }
  ok(bad === 4, "sample refuses an address the server would: not an email, not https, not on the Slack or Discord host");
  const h0 = (await sampleNotifications.history(T1, 50)).length;
  await sampleNotifications.send(T1, (await sampleNotifications.channels(T1))[0].id, "Hi", "x");
  ok((await sampleNotifications.history(T1, 50)).length === h0 + 1, "sample send appears in history");
  process.exit(fail ? 1 : 0);
})();
