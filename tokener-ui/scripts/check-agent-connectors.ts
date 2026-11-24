/**
 * Checks for how agents use the organisation's connections, channels and knowledge bases, for scaling, and for the claims review and approvals.
 * Run: npx tsx --tsconfig scripts/tsconfig.scripts.json scripts/check-agent-connectors.ts
 */
import { sampleAgents } from "../src/lib/agents/sample";
import { sampleHub } from "../src/lib/agents/hub";
import { sampleTraces } from "../src/lib/agents/sample-traces";
import { NOTIFY_SERVER, NOTIFY_TOOLS, bindingsOf, iconFor, mk, resolve, usage, validateBindings, notifyGrant } from "../src/lib/agents/connectors";
import { autoscale, calendarFloor, defaultExecution, validateExecution, type Execution } from "../src/lib/agents/execution";
import { CLAIM_PACKS, reviewClaim, parseDate, parseMoney } from "../src/lib/agents/claims";
import { decide, sampleApprovals, isOpen, reviewOf, minutesLeft } from "../src/lib/agents/approvals";
import { SAMPLE_CHANNEL as CH } from "../src/lib/notifications/client";

let pass = 0; let fail = 0;
const ok = (c: unknown, m: string) => { if (c) pass++; else { fail++; console.error("FAIL", m); } };
const eq = (a: unknown, b: unknown, m: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`);
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

const hub = sampleHub(); const { agents } = sampleAgents(); const by = (n: string) => agents.find((a) => a.name === n)!;

// ---- the hub holds what the other screens hold
ok(hub.connections.length >= 20 && hub.channels.length >= 9 && hub.knowledge.length >= 4, "hub has connections, channels and knowledge bases");
for (const id of ["conn-prod-kafka", "conn-prod-email", "conn-prod-sms", "conn-prod-slack", "conn-prod-s3-claims", "conn-prod-s3-contracts"]) ok(hub.connections.some((c) => c.id === id), `hub has ${id}`);
ok(hub.connections.find((c) => c.id === "conn-prod-email")!.capabilities.includes("send-mail"), "the email connection can send mail");
ok(hub.connections.find((c) => c.id === "conn-prod-sms")!.capabilities.includes("send-sms"), "the SMS connection can send SMS");
ok(hub.connections.find((c) => c.id === "conn-prod-slack")!.capabilities.includes("post-message"), "the Slack connection can post messages");
ok(hub.knowledge.some((k) => k.id === "claims-guidelines" && k.projects.includes("claims-ops")), "claims guidelines are open to the claims project");

// ---- every sample binding resolves and is valid
for (const a of agents) {
  const issues = validateBindings(a, hub).filter((i) => i.level === "error");
  eq(issues, [], `${a.name} has no binding errors`);
  for (const b of bindingsOf(a)) ok(resolve(b, hub, a).status !== "problem", `${a.name}: ${b.id} resolves`);
}
const claims = by("claims-document-processor");
const roles = new Set(bindingsOf(claims).map((b) => b.role));
for (const r of ["trigger", "approval", "notify", "knowledge"]) ok(roles.has(r as never), `claims agent has a ${r} binding`);
ok(bindingsOf(claims).some((b) => b.kind === "connection" && b.ref === "conn-prod-s3-claims" && b.role === "trigger" && b.origin === "derived"), "the file trigger is derived from the execution settings");
ok(bindingsOf(claims).some((b) => b.kind === "channel" && b.ref === CH.claimsDesk && b.role === "approval" && b.origin === "derived"), "approval channels are derived from the human gate");
ok(!bindingsOf(claims).some((b) => b.ref === "console"), "the console is not a binding");
ok(claims.tools.some((t) => t.server === NOTIFY_SERVER && t.tool === "send_sms" && t.sensitive), "send_sms is a sensitive grant");

// ---- validation catches mistakes
const base = clone(claims); const v = (a: typeof base) => validateBindings(a, hub);
ok(v({ ...base, bindings: [...(base.bindings ?? []), mk("channel", "00000000-0000-4000-8000-000000000000", "notify", "notify_channel")] }).some((i) => i.level === "error" && /not in the Notification Center/.test(i.message)), "unknown channel");
ok(v({ ...base, bindings: [...(base.bindings ?? []), mk("channel", CH.devNotices, "notify", "notify_channel")] }).some((i) => i.level === "error" && /switched off/.test(i.message)), "disabled channel");
ok(v({ ...base, bindings: [...(base.bindings ?? []), mk("connection", "conn-prod-sms", "notify", "send_email")] }).some((i) => i.level === "error" && /cannot send email/.test(i.message)), "an SMS connection cannot send email");
ok(v({ ...base, bindings: [...(base.bindings ?? []), mk("channel", CH.platformAlerts, "notify", "send_email")] }).some((i) => i.level === "error" && /not through/.test(i.message)), "send_email needs a connection, not a channel");
ok(v({ ...base, bindings: [...(base.bindings ?? []), mk("connection", "does-not-exist", "knowledge")] }).some((i) => i.level === "error"), "a missing connection is an error");
ok(v({ ...base, bindings: [...(base.bindings ?? []), mk("knowledge", "claims-guidelines", "knowledge")], project: "support-ml" }).some((i) => i.level === "error" && /open to claims-ops/.test(i.message)), "a knowledge base closed to the agent's project");
ok(v({ ...base, bindings: [...(base.bindings ?? []), mk("knowledge", "product-docs", "knowledge")] }).some((i) => i.level === "error"), "an empty knowledge base");
ok(v({ ...by("developer-assistant" in {} ? "x" : "onboarding-guide"), }).some((i) => i.level === "warning" && /out of date|sync/.test(i.message)), "a degraded knowledge base is a warning");
const discord = clone(by("pricing-analyst")); discord.execution!.modes.human!.channels = ["console", CH.devNotices];
ok(validateBindings(discord, hub).some((i) => /switched off/.test(i.message)), "a gate channel that is off is reported");
const hook = clone(base); hook.execution!.modes.human!.channels = [...hook.execution!.modes.human!.channels]; hook.tools = hook.tools.filter((t) => t.tool !== "send_sms");
ok(v(hook).some((i) => i.level === "warning" && /no grant/.test(i.message)), "a destination with no tool grant warns");
const lone = clone(base); lone.bindings = (lone.bindings ?? []).filter((b) => b.tool !== "send_email");
ok(v(lone).some((i) => i.level === "warning" && /no destination is chosen/.test(i.message)), "a tool grant with no destination warns");
ok(v({ ...clone(by("pricing-analyst")), tools: [...by("pricing-analyst").tools, notifyGrant("nonsense")] }).some((i) => i.level === "error" && /no tool called/.test(i.message)), "an unknown notification tool");
const prodOnStaging = clone(base); prodOnStaging.bindings = [...(prodOnStaging.bindings ?? []), mk("connection", "conn-stg-sms", "notify", "send_sms")];
ok(v(prodOnStaging).some((i) => i.level === "warning" && /staging connection/.test(i.message)), "a production agent on a staging connection warns");
ok(NOTIFY_TOOLS.every((t) => t.name && t.description && /[a-z]/.test(t.name)), "notification tools are documented");

// ---- usage across the fleet, for the Constellation
const u = usage(agents, hub);
const keys = new Set(u.nodes.map((n) => n.key));
for (const k of [`channel:${CH.claimsDesk}`, `channel:${CH.platformAlerts}`, "connection:conn-prod-email", "connection:conn-prod-sms", "connection:conn-prod-kafka", "connection:conn-prod-s3-claims", "knowledge:claims-guidelines", "knowledge:support-articles"]) ok(keys.has(k), `usage includes ${k}`);
ok(u.edges.every((e) => keys.has(e.nodeKey) && agents.some((a) => a.id === e.agentId)), "every edge joins a known agent and a known node");
const email = u.nodes.find((n) => n.key === "connection:conn-prod-email")!; ok(email.agentIds.length >= 2, "one email connection is shared by several agents");
ok(!u.edges.some((e) => agents.find((a) => a.id === e.agentId)!.state === "retired" as never), "retired agents have no edges");
ok(["slack", "teams", "email", "sms", "knowledge", "connection"].every((k) => !!iconFor({ iconKey: k })), "every resource has an icon");
ok(!!iconFor({ iconKey: "slack" }) && "cdn" in iconFor({ iconKey: "slack" }), "Slack uses the catalogue brand mark");

// ---- traces carry connector and knowledge attributes the Constellation can read
const traces = sampleTraces(agents, [], Date.now(), hub);
const spans = traces.flatMap((t) => t.spans);
ok(spans.some((s) => s.attrs?.["connector.key"]), "some spans name the connector they used");
ok(spans.every((s) => !s.attrs?.["connector.key"] || keys.has(String(s.attrs["connector.key"]))), "every connector key in a trace is one the hub knows");
ok(spans.some((s) => s.attrs?.["knowledge.key"]), "retrieval spans name their knowledge base");
ok(spans.every((s) => !s.attrs?.["knowledge.key"] || keys.has(String(s.attrs["knowledge.key"]))), "every knowledge key in a trace is a bound knowledge base");
ok(spans.some((s) => s.attrs?.["human.wait"] === true && s.durMs >= 20_000), "gates produce wait spans");
ok(spans.filter((s) => s.attrs?.["human.wait"]).every((s) => ["approved", "declined"].includes(String(s.attrs!["human.outcome"]))), "a wait span records the outcome");
ok(traces.some((t) => t.agentIds.includes("agt_15")), "the claims agent appears in traces");

// ---- scaling
const exec = (r: Parameters<typeof defaultExecution>[0], patch?: (e: Execution) => void) => { const e = clone(defaultExecution(r)); patch?.(e); return e; };
const L = { runs: 0, rps: 0, queue: 0, lagSec: 0, cpuPct: 0 }; const T0 = Date.UTC(2026, 10, 18, 12, 0, 0);
const svc = exec("service", (e) => { e.scaling.minReplicas = 2; e.scaling.maxReplicas = 10; e.scaling.autoscale = { ...e.scaling.autoscale, metric: "requests", target: 20, upCooldownSec: 30, downCooldownSec: 300 }; });
eq(autoscale(svc, { ...L, rps: 70 }, 2, T0).desired, 4, "70 requests a second at a target of 20 needs 4 replicas");
eq(autoscale(svc, { ...L, rps: 5000 }, 2, T0).desired, 10, "capped at the maximum");
ok(autoscale(svc, { ...L, rps: 5000 }, 2, T0).held === "limit", "and says it is at the limit");
eq(autoscale(svc, L, 2, T0).desired, 2, "never below the minimum");
eq(autoscale(svc, { ...L, rps: 70 }, 4, T0).desired, 4, "at the target nothing changes");
eq(autoscale(svc, { ...L, rps: 70 }, 2, T0, { at: T0 - 10_000, direction: "up" }).held, "cooldown", "a recent scale-up holds the next one");
eq(autoscale(svc, { ...L, rps: 70 }, 2, T0, { at: T0 - 40_000, direction: "up" }).desired, 4, "after the cooldown it scales up");
eq(autoscale(svc, { ...L, rps: 20 }, 8, T0, { at: T0 - 60_000, direction: "up" }).held, "cooldown", "scale-down waits its own cooldown");
const down = autoscale(svc, { ...L, rps: 20 }, 8, T0, { at: T0 - 600_000, direction: "up" }); ok(down.desired < 8 && down.desired >= 2, "scale-down goes one step, not to the floor");
eq(down.desired, 6, "a quarter of 8 is 2, so it goes to 6");
const man = exec("service", (e) => { e.scaling.autoscale = { ...e.scaling.autoscale, mode: "manual", desired: 5 }; });
eq(autoscale(man, { ...L, rps: 9999 }, 2, T0).desired, 5, "manual ignores load"); eq(autoscale(man, L, 5, T0).held, "manual", "and says it is held by hand");
const sl = exec("serverless", (e) => { e.scaling.autoscale = { ...e.scaling.autoscale, target: 8 }; });
eq(autoscale(sl, { ...L, runs: 20 }, 0, T0).desired, 3, "20 runs at 8 each needs 3 instances"); eq(autoscale(sl, L, 3, T0, { at: T0 - 9e6, direction: "up" }).desired < 3, true, "idle serverless scales back, to zero in steps");
const st = exec("streaming", (e) => { e.scaling.minReplicas = 1; e.scaling.maxReplicas = 6; e.scaling.autoscale = { ...e.scaling.autoscale, metric: "consumer-lag", target: 30 }; });
eq(autoscale(st, { ...L, lagSec: 90 }, 2, T0).desired, 6, "lag of 90 s at 2 workers needs 6 against a target of 30");
const cal = exec("service", (e) => { e.scaling.minReplicas = 1; e.scaling.maxReplicas = 20; e.scaling.autoscale = { ...e.scaling.autoscale, calendar: [{ id: "c", name: "Peak", cron: "0 9 * * *", timezone: "UTC", minReplicas: 6, durationMin: 120 }] }; });
eq(calendarFloor(cal.scaling.autoscale.calendar, Date.UTC(2026, 10, 18, 10, 0)), 6, "inside a busy period the floor is raised"); eq(calendarFloor(cal.scaling.autoscale.calendar, Date.UTC(2026, 10, 18, 12, 0)), 0, "after it the floor is gone");
eq(autoscale(cal, L, 1, Date.UTC(2026, 10, 18, 10, 0)).desired, 6, "the busy period lifts the count with no load");
eq(autoscale(exec("external"), { ...L, runs: 5 }, 0, T0).held, "manual", "scaling is not offered for an agent run elsewhere");
// validation
const has = (e: Execution, p: string, l: "error" | "warning" = "error") => validateExecution(e).some((i) => i.path === p && i.level === l);
ok(has(exec("service", (e) => { e.scaling.autoscale.metric = "queue-depth"; }), "scaling.autoscale.metric"), "queue depth does not drive a service");
ok(has(exec("serverless", (e) => { e.scaling.autoscale.metric = "consumer-lag"; }), "scaling.autoscale.metric"), "lag does not drive the on-demand runtime");
ok(has(exec("service", (e) => { e.scaling.autoscale.mode = "manual"; e.scaling.autoscale.desired = 99; }), "scaling.autoscale.desired"), "manual count above the maximum");
ok(has(exec("service", (e) => { e.scaling.autoscale.downCooldownSec = 10; }), "scaling.autoscale.downCooldownSec"), "scale-down cooldown too short");
ok(has(exec("service", (e) => { e.scaling.autoscale.downCooldownSec = 60; e.scaling.autoscale.upCooldownSec = 120; }), "scaling.autoscale.downCooldownSec", "warning"), "scaling down faster than up warns");
ok(has(exec("service", (e) => { e.scaling.autoscale.calendar = [{ id: "c", name: "", cron: "bad", timezone: "Nowhere", minReplicas: 0, durationMin: 0 }]; }), "scaling.autoscale.calendar.0.cron"), "calendar rule with a bad cron");
ok(has(exec("service", (e) => { e.scaling.minReplicas = 4; e.scaling.maxReplicas = 4; }), "scaling.maxReplicas", "warning"), "min equal to max never scales");
ok(has(exec("streaming", (e) => { e.modes = { event: e.modes.event ?? { triggers: [], concurrency: 1, retries: 0 } }; e.scaling.autoscale.metric = "consumer-lag"; }), "scaling.autoscale.metric"), "lag needs the Streaming mode");

// ---- claims
eq(parseMoney("USD 7,420.00"), 7420, "money"); eq(parseMoney("Market value, USD 21,000"), 21000, "money in a phrase"); eq(new Date(parseDate("28 October 2026")).toISOString(), "2026-10-28T00:00:00.000Z", "date");
ok(CLAIM_PACKS.length === 3 && CLAIM_PACKS.every((p) => p.pages.length === 3 && p.fields.length >= 9), "three packs of three pages");
for (const p of CLAIM_PACKS) for (const f of p.fields) ok(f.box.every((n) => n >= 0 && n <= 1) && f.box[0] + f.box[2] <= 1.001 && f.box[1] + f.box[3] <= 1, `${p.ref} ${f.key} box is on the page`);
const [A, B, C] = CLAIM_PACKS.map(reviewClaim);
eq([A.recommendation, A.payable, A.needsSecond], ["approve", 6920, true], "home claim: approve 7,420 less 500, second approval");
eq([B.recommendation, B.payable], ["investigate", 12230], "motor claim: invoice dated before the loss is not approved");
ok(B.checks.find((c) => c.id === "dated")!.result === "fail" && /before the loss/.test(B.checks.find((c) => c.id === "dated")!.detail), "the motor finding names the dates");
eq([C.recommendation, C.payable, C.needsSecond], ["approve", 1100, false], "travel claim: approve 1,150 less 50, one approval");
ok(C.checks.find((c) => c.id === "receipts")!.result === "warn", "travel claim: partial receipts are a warning"); ok(C.confidence < A.confidence && B.confidence < C.confidence, "confidence falls with the findings");
ok(A.checks.every((c) => !c.cite || (c.cite.source && c.cite.page > 0)), "every cited rule names a page");

// ---- approvals
const NOW = Date.UTC(2026, 10, 18, 12, 0, 0); const list = sampleApprovals(NOW); const get = (id: string) => list.find((a) => a.id === id)!;
ok(list.filter(isOpen).length === 5 && list.filter((a) => !isOpen(a)).length === 3, "five open, three decided");
ok(list.filter((a) => a.kind === "claim").every((a) => reviewOf(a) && a.agentId === "agt_15"), "claim approvals carry their review");
ok(minutesLeft(get("apr_05"), NOW) < 0, "the pricing request is past its time"); ok(minutesLeft(get("apr_01"), NOW) > 0, "the claim request is within its time");
eq(decide(get("apr_01"), { by: "Nestor Martourez", outcome: "declined", reason: "" }).ok, false, "declining needs a reason");
const bad = decide(get("apr_01"), { by: "Nestor Martourez", outcome: "approved", reason: "ok" }); ok(!bad.ok && /invoice|dated/i.test((bad as { error: string }).error), "approving a failed claim needs a real reason");
const forced = decide(get("apr_01"), { by: "Nestor Martourez", outcome: "approved", reason: "The invoice date is a typing error. The garage confirmed by phone." });
ok(forced.ok && forced.value.status === "awaiting-second", "approving a payout above 5,000 waits for a second approver");
if (forced.ok) {
  eq(decide(forced.value, { by: "Nestor Martourez", outcome: "approved", reason: "Again, with a reason" }).ok, false, "the first approver cannot also be the second");
  const second = decide(forced.value, { by: "Priya Nair", outcome: "approved", reason: "Confirmed with the garage." });
  ok(second.ok && second.value.status === "approved" && second.value.decisions.map((d) => d.round).join() === "first,second", "a second person completes the approval");
  if (second.ok) { const vias = second.value.activity.map((x) => x.via); ok(vias.includes("connection:conn-prod-email") && vias.includes("connection:conn-prod-sms") && vias.includes(`channel:${CH.claimsDesk}`), "approval notifies the claimant by email and SMS and posts to the desk"); ok(second.value.activity.some((x) => x.kind === "resume"), "the agent resumes"); eq(decide(second.value, { by: "Marcus Webb", outcome: "declined", reason: "Too late" }).ok, false, "a decided request cannot be decided again"); }
}
const one = decide(get("apr_03"), { by: "Nestor Martourez", outcome: "approved", reason: "Receipts for the bag are not needed under 300." }); ok(one.ok && one.value.status === "approved", "a payout under the limit needs one approval");
const dec = decide(get("apr_02"), { by: "Nestor Martourez", outcome: "declined", reason: "Outside the policy wording." }); ok(dec.ok && dec.value.status === "declined" && !dec.value.activity.some((x) => x.via === "connection:conn-prod-sms"), "a decline emails but does not text");
const back = decide(get("apr_02"), { by: "Nestor Martourez", outcome: "changes", reason: "Ask for the plumber's invoice." }); ok(back.ok && back.value.status === "changes" && !back.value.activity.some((x) => x.via?.startsWith("connection:")), "sending back writes to nobody outside the company");
const refund = decide(get("apr_04"), { by: "Nestor Martourez", outcome: "approved", reason: "Photos match." }); ok(refund.ok && refund.value.activity.some((x) => x.via === "connection:conn-prod-email"), "an approved refund emails the customer");

console.log(`${pass} checks passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
