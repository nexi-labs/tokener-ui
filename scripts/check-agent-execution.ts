/**
 * Checks for runtimes, execution modes, cron and the generated project for the agent execution model.
 * Run: npx tsx --tsconfig scripts/tsconfig.scripts.json scripts/check-agent-execution.ts
 */
import { sampleAgents } from "../src/lib/agents/sample";
import { DEFAULT_SPEC, generateProject, specYaml, validateSpec } from "../src/lib/agents/codegen";
import { MODES, RUNTIMES, defaultExecution, defaultHuman, defaultSchedule, defaultStreaming, defaultTrigger, describeCron, enabledModes, executionSummary, nextRuns, parseCron, triggerLines, validateExecution, validTimezone, type Execution, type RuntimeKind } from "../src/lib/agents/execution";

let pass = 0; let fail = 0;
const ok = (c: unknown, m: string) => { if (c) pass++; else { fail++; console.error("FAIL", m); } };
const eq = (a: unknown, b: unknown, m: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`);
const errs = (e: Execution, ctx = {}) => validateExecution(e, ctx).filter((i) => i.level === "error");
const has = (e: Execution, path: string, level: "error" | "warning" = "error", ctx = {}) => validateExecution(e, ctx).some((i) => i.path === path && i.level === level);
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

// ---- catalogue
eq(RUNTIMES.map((r) => r.id), ["serverless", "service", "streaming", "batch", "external"], "runtimes");
eq(MODES.map((m) => m.id), ["onDemand", "scheduled", "event", "streaming", "human"], "modes");
for (const r of RUNTIMES) { const d = defaultExecution(r.id); eq(errs(d), [], `default ${r.id} is valid`); ok(enabledModes(d).every((m) => r.modes.includes(m)), `default ${r.id} modes are supported`); }

// ---- cron parsing
for (const good of ["0 8 * * 1-5", "*/15 * * * *", "0 0 1 1 *", "30 1 * * *", "0 9-17 * * mon-fri", "0 0 * * 7", "5,35 * * * *", "0 */6 * * *", "0 0 29 2 *"]) ok(parseCron(good).ok, `parses ${good}`);
for (const bad of ["", "* * * *", "* * * * * *", "60 * * * *", "* 24 * * *", "* * 0 * *", "* * * 13 *", "*/0 * * * *", "a * * * *", "5-1 * * * *", "* * * * 8"]) ok(!parseCron(bad).ok, `rejects ${JSON.stringify(bad)}`);

// ---- next runs, with fixed instants
const from = Date.UTC(2026, 10, 18, 12, 0, 0); // Wed 18 Nov 2026 12:00 UTC
const iso = (n: number[]) => n.map((x) => new Date(x).toISOString());
eq(iso(nextRuns("0 8 * * 1-5", "UTC", 3, from)), ["2026-11-19T08:00:00.000Z", "2026-11-20T08:00:00.000Z", "2026-11-23T08:00:00.000Z"], "weekdays skip the weekend");
eq(iso(nextRuns("*/15 * * * *", "UTC", 3, from)), ["2026-11-18T12:15:00.000Z", "2026-11-18T12:30:00.000Z", "2026-11-18T12:45:00.000Z"], "every fifteen minutes");
eq(iso(nextRuns("0 0 1 * *", "UTC", 2, from)), ["2026-12-01T00:00:00.000Z", "2027-01-01T00:00:00.000Z"], "first of the month");
eq(iso(nextRuns("0 9 * * *", "Asia/Bahrain", 1, from)), ["2026-11-19T06:00:00.000Z"], "timezone: 09:00 in Bahrain is 06:00 UTC");
eq(iso(nextRuns("0 8 * * *", "Europe/London", 1, Date.UTC(2026, 5, 1, 0, 0))), ["2026-06-01T07:00:00.000Z"], "summer time moves the instant");
eq(iso(nextRuns("0 8 * * *", "Europe/London", 1, Date.UTC(2026, 0, 5, 0, 0))), ["2026-01-05T08:00:00.000Z"], "winter time does not");
eq(iso(nextRuns("0 0 29 2 *", "UTC", 1, from)), ["2028-02-29T00:00:00.000Z"], "leap day found within the horizon");
eq(nextRuns("0 0 31 2 *", "UTC", 1, from), [], "a date that never exists never fires");
eq(nextRuns("0 0 * * 0", "UTC", 1, from).length, 1, "sunday as 0");
eq(iso(nextRuns("0 0 * * 7", "UTC", 1, from)), iso(nextRuns("0 0 * * 0", "UTC", 1, from)), "sunday as 7");
// day of month and day of week together match when either does
eq(iso(nextRuns("0 0 19 * 5", "UTC", 2, from)), ["2026-11-19T00:00:00.000Z", "2026-11-20T00:00:00.000Z"], "date or weekday");
eq(nextRuns("* * * * *", "Not/AZone", 1, from), [], "bad timezone gives none");
ok(validTimezone("Europe/London") && validTimezone("UTC") && !validTimezone("London"), "timezone names");

// ---- plain language
eq(describeCron("0 8 * * 1-5"), "Every weekday at 08:00", "weekday text");
eq(describeCron("*/10 * * * *"), "Every 10 minutes", "interval text");
eq(describeCron("0 * * * *"), "Every hour, on the hour", "hourly text");
eq(describeCron("30 1 * * *"), "Every day at 01:30", "daily text");
eq(describeCron("0 7 * * 1"), "Every Monday at 07:00", "weekly text");
eq(describeCron("0 5 1 * *"), "On day 1 of every month at 05:00", "monthly text");
eq(describeCron("nonsense"), "Not a valid schedule", "invalid text");
eq(describeCron("0 0 1 6 *"), "0 0 1 6 *", "unusual rules show themselves");

// ---- validation: modes against runtimes
const mk = (r: RuntimeKind, patch: (e: Execution) => void) => { const e = clone(defaultExecution(r)); patch(e); return e; };
ok(has(mk("serverless", (e) => { e.modes.streaming = defaultStreaming(); }), "modes.streaming"), "streaming not allowed on the on-demand runtime");
ok(has(mk("batch", (e) => { e.modes.event = { triggers: [defaultTrigger()], concurrency: 1, retries: 0 }; }), "modes.event"), "events not allowed on a batch job");
ok(has(mk("streaming", (e) => { e.modes.scheduled = { schedules: [defaultSchedule()] }; }), "modes.scheduled"), "a worker that never stops has no clock");
ok(has(mk("external", (e) => { e.modes.human = defaultHuman(); }), "modes.human"), "external cannot hold a gate");
ok(has(mk("serverless", (e) => { e.modes = {}; }), "modes"), "at least one mode");
ok(has(mk("streaming", (e) => { e.modes = { human: defaultHuman() }; e.durable = true; }), "runtime"), "a worker needs a stream or events");
// scaling
ok(has(mk("service", (e) => { e.scaling.minReplicas = 0; }), "scaling.minReplicas"), "a service keeps one replica");
ok(has(mk("serverless", (e) => { e.scaling.minReplicas = 5; e.scaling.maxReplicas = 2; }), "scaling.minReplicas"), "min above max");
ok(has(mk("serverless", (e) => { e.scaling.timeoutSec = 5000; }), "scaling.timeoutSec"), "timeout above the runtime limit");
ok(has(mk("serverless", (e) => { e.scaling.memoryMb = 64; }), "scaling.memoryMb"), "memory too small");
ok(has(mk("serverless", (e) => { e.scaling.minReplicas = 1; }), "scaling.minReplicas", "warning"), "warm instances warn");
ok(!has(mk("external", (e) => { e.scaling.maxReplicas = 0; }), "scaling.maxReplicas"), "external has no scaling to check");
// on demand
ok(has(mk("serverless", (e) => { e.modes.onDemand = { response: "sync", timeoutSec: 600, concurrency: 5 }; }), "modes.onDemand.timeoutSec", "warning"), "long sync wait warns");
ok(has(mk("serverless", (e) => { e.modes.onDemand = { response: "task", timeoutSec: 0, concurrency: 5 }; }), "modes.onDemand.timeoutSec"), "zero timeout");
// scheduled
const sch = (patch: Partial<ReturnType<typeof defaultSchedule>>, extra?: ReturnType<typeof defaultSchedule>) => mk("serverless", (e) => { e.modes = { scheduled: { schedules: [{ ...defaultSchedule(), ...patch }, ...(extra ? [extra] : [])] } }; });
eq(errs(sch({})), [], "default schedule is valid");
ok(has(sch({ cron: "61 * * * *" }), "modes.scheduled.0.cron"), "bad cron");
ok(has(sch({ cron: "0 0 31 2 *" }), "modes.scheduled.0.cron"), "a rule that never fires");
ok(has(sch({ timezone: "London" }), "modes.scheduled.0.timezone"), "bad timezone");
ok(has(sch({ input: " " }), "modes.scheduled.0.input"), "a scheduled run needs an input");
ok(has(sch({ name: "" }), "modes.scheduled.0.name"), "schedule name");
ok(has(sch({ name: "Nightly" }, { ...defaultSchedule(), name: "nightly" }), "modes.scheduled.1.name"), "duplicate schedule names ignoring case");
ok(has(sch({ cron: "* * * * *" }), "modes.scheduled.0.cron", "warning"), "every minute warns");
ok(has(sch({ catchUp: "all", overlap: "skip" }), "modes.scheduled.0.catchUp", "warning"), "catch up on all while skipping overlap warns");
ok(has(mk("serverless", (e) => { e.modes = { scheduled: { schedules: [] } }; }), "modes.scheduled"), "no schedules");
// events
const evt = (patch: (x: NonNullable<Execution["modes"]["event"]>) => void) => mk("serverless", (e) => { const x = { triggers: [defaultTrigger("webhook")], concurrency: 10, retries: 0, deadLetter: undefined as string | undefined }; patch(x); e.modes = { event: x }; });
eq(errs(evt(() => {})), [], "default webhook trigger is valid");
ok(has(evt((x) => { x.triggers[0].source = "hooks/x"; }), "modes.event.0.source"), "webhook path needs a slash");
ok(has(evt((x) => { x.triggers = [defaultTrigger("email")]; x.triggers[0].source = "nobody"; }), "modes.event.0.source"), "mailbox must be an address");
ok(has(evt((x) => { x.retries = 3; }), "modes.event.deadLetter"), "retries need a dead letter queue");
ok(has(evt((x) => { x.retries = 11; x.deadLetter = "dlq"; }), "modes.event.retries"), "too many retries");
ok(has(evt((x) => { x.triggers[0].batchSize = 0; }), "modes.event.0.batchSize"), "batch size");
ok(has(evt((x) => { x.triggers = [defaultTrigger("topic")]; }), "modes.event.0.connection", "warning"), "topic without a connection warns");
ok(has(evt((x) => { x.triggers = []; }), "modes.event"), "no triggers");
// streaming
const strm = (patch: (x: NonNullable<Execution["modes"]["streaming"]>) => void) => mk("streaming", (e) => { const x = defaultStreaming(); patch(x); e.modes = { streaming: x }; });
eq(errs(strm(() => {})), [], "default stream is valid");
ok(has(strm((x) => { x.consumerGroup = ""; }), "modes.streaming.consumerGroup"), "consumer group");
ok(has(strm((x) => { x.source.topic = ""; }), "modes.streaming.source"), "source");
ok(has(strm((x) => { x.window = { kind: "sliding", sizeSec: 60, slideSec: 120 }; }), "modes.streaming.window"), "slide longer than window");
ok(!has(strm((x) => { x.window = { kind: "sliding", sizeSec: 60, slideSec: 10 }; }), "modes.streaming.window"), "valid sliding window");
ok(has(strm((x) => { x.window = { kind: "session", sizeSec: 60 }; }), "modes.streaming.window"), "session needs a gap");
ok(has(strm((x) => { x.delivery = "exactly-once"; }), "modes.streaming.sink"), "exactly once needs a sink");
ok(!has(strm((x) => { x.delivery = "exactly-once"; x.sink = { kind: "kafka", topic: "out" }; }), "modes.streaming.sink"), "exactly once with a sink");
ok(has(strm((x) => { x.delivery = "at-least-once"; }), "modes.streaming.delivery", "warning"), "at least once warns about repeats");
ok(has(strm((x) => { x.keyBy = undefined; }), "modes.streaming.keyBy", "warning"), "windows without a key warn");
ok(has(strm((x) => { x.checkpointSec = 0; }), "modes.streaming.checkpointSec"), "checkpoint");
ok(has(strm((x) => { x.parallelism = 500; }), "modes.streaming.parallelism"), "parallelism");
// human
const hum = (patch: (x: ReturnType<typeof defaultHuman>, e: Execution) => void) => mk("service", (e) => { const x = defaultHuman(); patch(x, e); e.modes = { onDemand: e.modes.onDemand, human: x }; });
eq(errs(hum(() => {})), [], "default gate is valid");
ok(has(hum((x) => { x.when = []; }), "modes.human.when"), "gate needs a reason");
ok(has(hum((x) => { x.assignee = " "; }), "modes.human.assignee"), "assignee");
ok(has(hum((x) => { x.channels = []; }), "modes.human.channels"), "channels");
ok(has(hum((x) => { x.when = ["low-confidence"]; x.confidenceBelow = 1; }), "modes.human.confidenceBelow"), "confidence bound");
ok(has(hum((x) => { x.when = ["cost"]; x.costAboveUsd = 0; }), "modes.human.costAboveUsd"), "cost bound");
ok(has(hum((x) => { x.escalateTo = ""; x.onTimeout = "escalate"; }), "modes.human.escalateTo"), "escalation target");
ok(has(hum((x, e) => { e.durable = false; }), "durable", "error"), "a gate needs durable state");
ok(has(hum((x) => { x.onTimeout = "wait"; }), "modes.human.onTimeout", "warning"), "waiting for ever warns");
ok(has(hum((x) => { x.when = ["low-confidence"]; }), "modes.human.when", "warning", { hasSensitiveTools: true }), "sensitive tools with no gate warn");
ok(!has(hum((x) => { x.when = ["sensitive-tool"]; }), "modes.human.when", "warning", { hasSensitiveTools: true }), "sensitive gate is quiet");
ok(has(hum(() => {}), "modes.human", "warning", { control: "observed" }), "observed agents cannot be held");
// A decision on a sensitive tool never defaults to approving
ok(defaultHuman().onTimeout !== ("approve" as string), "no auto approve");

// ---- samples
const { agents } = sampleAgents();
const governed = agents.filter((a) => a.control === "governed");
ok(governed.every((a) => !!a.execution), "every governed sample agent has execution settings");
for (const a of agents) if (a.execution) { eq(errs(a.execution, { hasSensitiveTools: a.tools.some((t) => t.sensitive), control: a.control }), [], `${a.name} sample is valid`); eq(a.execution.runtime === "external", a.runtime === "external", `${a.name} external matches where it runs`); }
const usedRuntimes = new Set(agents.map((a) => a.execution?.runtime)); for (const r of RUNTIMES) ok(usedRuntimes.has(r.id), `a sample agent uses ${r.id}`);
const usedModes = new Set(agents.flatMap((a) => enabledModes(a.execution))); for (const m of MODES) ok(usedModes.has(m.id), `a sample agent uses ${m.id}`);
const refund = agents.find((a) => a.name === "refund-approver")!;
ok(refund.execution!.durable && refund.execution!.modes.human!.onTimeout === "decline", "refund approval declines on timeout");
const lines = triggerLines(agents.find((a) => a.name === "contract-reviewer")!.execution, from);
ok(lines.some((l) => l.mode === "scheduled" && /Every weekday at 08:00/i.test(l.text) && /Next /.test(l.text)), "trigger lines show the next run");
ok(executionSummary(refund.execution).startsWith("On-demand runtime"), "summary starts with the runtime");
eq(executionSummary(undefined), "Not recorded", "summary of nothing");

// ---- generated project
const spec = { ...DEFAULT_SPEC, execution: clone(defaultExecution("streaming")) };
eq(validateSpec(spec), [], "a spec with a streaming runtime is valid");
ok(validateSpec({ ...DEFAULT_SPEC, execution: mk("serverless", (e) => { e.modes = {}; }) }).some((i) => i.field === "execution.modes"), "spec validation reports execution errors");
const yaml = specYaml(spec);
ok(/runtime:\n    kind: streaming/.test(yaml) && /consumerGroup: agent-workers/.test(yaml) && /checkpointSec: 10/.test(yaml), "yaml carries the runtime block");
ok(!/password|secret/i.test(yaml.replace(/signing: (true|false)/g, "")), "yaml holds no credential words");
const py = generateProject(spec); ok(py.some((f) => f.path === "worker.py") && /confluent-kafka/.test(py.find((f) => f.path === "requirements.txt")!.content), "python project gets a worker and its client");
const w = py.find((f) => f.path === "worker.py")!.content;
ok(/enable\.auto\.commit": False/.test(w) && /"events\.raw"/.test(w) && /"agent-workers"/.test(w) && !/\{\{/.test(w), "worker commits after handling and has no unfilled fields");
ok(/How it starts/.test(py.find((f) => f.path === "README.md")!.content) && /python worker\.py/.test(py.find((f) => f.path === "README.md")!.content), "readme explains how it starts");
ok(/KAFKA_BOOTSTRAP_SERVERS/.test(py.find((f) => f.path === ".env.example")!.content) && !/KAFKA_SASL_PASSWORD=\S/.test(py.find((f) => f.path === ".env.example")!.content), "env example names variables with no values");
const ts = generateProject({ ...spec, framework: "vercel-ai" }); ok(ts.some((f) => f.path === "src/worker.ts") && /kafkajs/.test(ts.find((f) => f.path === "package.json")!.content) && !/\{\{/.test(ts.find((f) => f.path === "src/worker.ts")!.content), "typescript project gets a worker");
ok(/node dist\/worker\.js/.test(ts.find((f) => f.path === "README.md")!.content), "typescript readme names the worker command");
ok(!generateProject(DEFAULT_SPEC).some((f) => /worker/.test(f.path)), "no worker without a streaming mode");
const sched = generateProject({ ...DEFAULT_SPEC, execution: clone(defaultExecution("batch")) }).find((f) => f.path === "tokener.agent.yaml")!.content;
ok(/scheduled:\n        - name: Nightly\n          cron: "0 2 \* \* \*"/.test(sched), "yaml carries schedules");

console.log(`${pass} checks passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
