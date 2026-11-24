import { validateToolCalling, type ToolCalling } from "./codemode";

/**
 * How an agent runs and what starts it.
 *
 * Two separate choices. The runtime is the shape of the process: started for each call, kept running, a worker that never stops, or a job that runs to the end.
 * The execution modes are what starts a run: a call, a clock, an event, a stream, or a person. One agent can have several modes on at once, for example
 * on demand for apps, scheduled for a nightly check, and human assisted for the one tool that moves money.
 */

export type RuntimeKind = "serverless" | "service" | "streaming" | "batch" | "external";
export type ModeId = "onDemand" | "scheduled" | "event" | "streaming" | "human";

export type RuntimeInfo = { id: RuntimeKind; label: string; blurb: string; best: string; modes: ModeId[]; maxTimeoutSec: number; coldStart: string; billing: string; scalesToZero: boolean };
export const RUNTIMES: RuntimeInfo[] = [
  { id: "serverless", label: "On-demand runtime", blurb: "A fresh instance starts for each call and goes away when the run ends. Nothing is billed while idle.", best: "Bursty work, occasional runs, anything that finishes in minutes.", modes: ["onDemand", "scheduled", "event", "human"], maxTimeoutSec: 900, coldStart: "1 to 3 seconds", billing: "Per second of run time", scalesToZero: true },
  { id: "service", label: "Always-on service", blurb: "Replicas stay running behind the gateway, so the first call is as fast as the hundredth, and the agent can hold state in memory.", best: "Chat, voice and anything a person is waiting on.", modes: ["onDemand", "scheduled", "event", "streaming", "human"], maxTimeoutSec: 3600, coldStart: "None while a replica is up", billing: "Per replica hour", scalesToZero: false },
  { id: "streaming", label: "Streaming worker", blurb: "A worker that reads an unbounded stream for as long as it runs, keeps state per key, checkpoints its place and applies back-pressure.", best: "Monitoring, enrichment and decisions on events as they arrive.", modes: ["event", "streaming", "human"], maxTimeoutSec: 0, coldStart: "None, it runs continuously", billing: "Per worker hour", scalesToZero: false },
  { id: "batch", label: "Batch job", blurb: "Runs to completion over a dataset or a list of inputs, in parallel, then stops. Failed items are retried on their own.", best: "Nightly reviews, backfills, large one-off analyses.", modes: ["onDemand", "scheduled"], maxTimeoutSec: 86_400, coldStart: "Tens of seconds", billing: "Per worker hour while the job runs", scalesToZero: true },
  { id: "external", label: "Runs elsewhere", blurb: "The agent runs on another platform. tok∑ner records and watches it, and can start it only where that platform offers a way to.", best: "Agents you did not build here.", modes: ["onDemand"], maxTimeoutSec: 0, coldStart: "Depends on the platform", billing: "Not billed by tok∑ner", scalesToZero: false },
];
export const RUNTIME_BY_ID = Object.fromEntries(RUNTIMES.map((r) => [r.id, r])) as Record<RuntimeKind, RuntimeInfo>;

export type ModeInfo = { id: ModeId; label: string; starts: string; blurb: string; example: string };
export const MODES: ModeInfo[] = [
  { id: "onDemand", label: "On demand", starts: "A call", blurb: "An app, a person or another agent calls it and waits for the answer, or for a task id to poll.", example: "A storefront asks for a refund decision." },
  { id: "scheduled", label: "Scheduled", starts: "A clock", blurb: "Runs at fixed times, with a rule for what to do when the last run is still going and for runs missed while it was down.", example: "Review new contracts every weekday at 08:00." },
  { id: "event", label: "Event driven", starts: "An event", blurb: "Runs once for each matching event: a webhook, a message, a new row, a file, an email. Failed events go to a dead letter queue.", example: "Triage each ticket as it is created." },
  { id: "streaming", label: "Streaming", starts: "A stream", blurb: "Reads a stream without stopping and reasons over windows of events, keeping state for each key.", example: "Flag a sensor whose readings drift over five minutes." },
  { id: "human", label: "Human assisted", starts: "A person's decision", blurb: "The run pauses at a gate until a person decides. The gate can open on every run, on low confidence, on a sensitive tool or on cost.", example: "A person approves any refund above 500 dollars." },
];
export const MODE_BY_ID = Object.fromEntries(MODES.map((m) => [m.id, m])) as Record<ModeId, ModeInfo>;

// ---------------------------------------------------------------------------------------------------------------------------------------
// Settings for each mode

export type OnDemand = { response: "sync" | "task" | "stream"; timeoutSec: number; concurrency: number };

export type Schedule = { id: string; name: string; cron: string; timezone: string; input: string; overlap: "skip" | "queue" | "replace"; catchUp: "none" | "latest" | "all"; enabled: boolean };
export type Scheduled = { schedules: Schedule[] };

export type TriggerKind = "webhook" | "topic" | "queue" | "dataset" | "cdc" | "file" | "email";
export type Trigger = { id: string; kind: TriggerKind; /** A path, topic, queue, dataset or mailbox, depending on the kind. */ source: string; connection?: string; filter: string; dedupeKey?: string; batchSize: number };
export type EventDriven = { triggers: Trigger[]; concurrency: number; retries: number; deadLetter?: string };

export type StreamKind = "kafka" | "kinesis" | "pubsub" | "events" | "websocket";
export type Window = { kind: "none" | "tumbling" | "sliding" | "session"; sizeSec: number; slideSec?: number; gapSec?: number };
export type Streaming = {
  source: { kind: StreamKind; connection?: string; topic: string }; sink?: { kind: StreamKind; connection?: string; topic: string };
  consumerGroup: string; parallelism: number; window: Window; keyBy?: string; checkpointSec: number; delivery: "at-least-once" | "exactly-once"; maxLagSec: number; backpressure: "pause" | "drop-oldest" | "shed";
};

export type GateWhen = "always" | "low-confidence" | "sensitive-tool" | "cost" | "policy";
/** Where a request for a decision appears: "console" for the tok∑ner console, or the id of a Notification Center channel. */
export const CONSOLE_CHANNEL = "console";
export type Human = { when: GateWhen[]; confidenceBelow: number; costAboveUsd: number; assignee: string; channels: string[]; slaMinutes: number; onTimeout: "escalate" | "decline" | "wait"; escalateTo?: string; allowTakeover: boolean; requireReason: boolean };

export type AutoscaleMetric = "concurrency" | "requests" | "queue-depth" | "consumer-lag" | "cpu";
export type MetricInfo = { id: AutoscaleMetric; label: string; unit: string; blurb: string; defaultTarget: number; runtimes: RuntimeKind[] };
export const METRICS: MetricInfo[] = [
  { id: "concurrency", label: "Runs at once", unit: "runs per replica", blurb: "Add a replica when each one is already busy with this many runs.", defaultTarget: 8, runtimes: ["serverless", "service"] },
  { id: "requests", label: "Requests per second", unit: "requests per second per replica", blurb: "Add a replica when each one is answering this many requests a second.", defaultTarget: 20, runtimes: ["service"] },
  { id: "cpu", label: "CPU use", unit: "percent", blurb: "Add a replica when average CPU passes this.", defaultTarget: 65, runtimes: ["service", "streaming"] },
  { id: "consumer-lag", label: "Stream lag", unit: "seconds behind per replica", blurb: "Add a worker when the stream is further behind than this. Workers beyond the number of partitions sit idle.", defaultTarget: 30, runtimes: ["streaming"] },
  { id: "queue-depth", label: "Items waiting", unit: "items per worker", blurb: "Add a worker for every this many items still waiting to be processed.", defaultTarget: 25, runtimes: ["batch"] },
];
export const METRIC_BY_ID = Object.fromEntries(METRICS.map((m) => [m.id, m])) as Record<AutoscaleMetric, MetricInfo>;
export type CalendarFloor = { id: string; name: string; cron: string; timezone: string; minReplicas: number; durationMin: number };
/** How the number of replicas follows the work. Automatic keeps load per replica near the target. Manual holds a number until a person changes it. */
export type Autoscale = { mode: "auto" | "manual"; metric: AutoscaleMetric; target: number; upCooldownSec: number; downCooldownSec: number; desired: number; calendar: CalendarFloor[] };

export type Execution = {
  runtime: RuntimeKind;
  /** How the agent calls tools: one call at a time, or by writing a short program that runs in a sandbox. Absent means direct. */
  toolCalling?: ToolCalling;
  scaling: { minReplicas: number; maxReplicas: number; concurrency: number; timeoutSec: number; memoryMb: number; cpu: number; autoscale: Autoscale };
  /** Whether a run's progress is saved, so it can wait for a person for hours and carry on, or be resumed after a restart. */
  durable: boolean;
  modes: { onDemand?: OnDemand; scheduled?: Scheduled; event?: EventDriven; streaming?: Streaming; human?: Human };
};

export const enabledModes = (e: Execution | undefined): ModeId[] => (e ? (Object.keys(e.modes) as ModeId[]).filter((m) => !!e.modes[m]) : []);

// ---------------------------------------------------------------------------------------------------------------------------------------
// Defaults

let seq = 0;
const sid = (p: string) => `${p}_${(++seq).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

export const defaultSchedule = (): Schedule => ({ id: sid("sch"), name: "Weekday morning", cron: "0 8 * * 1-5", timezone: "Europe/London", input: "Run the daily review.", overlap: "skip", catchUp: "none", enabled: true });
export const defaultTrigger = (kind: TriggerKind = "webhook"): Trigger => ({ id: sid("trg"), kind, source: kind === "webhook" ? "/hooks/new-item" : kind === "topic" ? "events.created" : kind === "queue" ? "agent-inbox" : kind === "dataset" ? "dataset:orders" : kind === "cdc" ? "public.orders" : kind === "file" ? "s3://bucket/incoming/" : "agent@acme.example", filter: "", batchSize: 1 });
export const defaultStreaming = (): Streaming => ({ source: { kind: "kafka", topic: "events.raw" }, consumerGroup: "agent-workers", parallelism: 4, window: { kind: "tumbling", sizeSec: 60 }, keyBy: "entity_id", checkpointSec: 10, delivery: "at-least-once", maxLagSec: 60, backpressure: "pause" });
export const defaultHuman = (): Human => ({ when: ["sensitive-tool"], confidenceBelow: 0.7, costAboveUsd: 5, assignee: "Approvers", channels: ["console"], slaMinutes: 60, onTimeout: "escalate", escalateTo: "Team leads", allowTakeover: true, requireReason: true });
export const defaultOnDemand = (): OnDemand => ({ response: "sync", timeoutSec: 120, concurrency: 20 });

export const defaultAutoscale = (runtime: RuntimeKind): Autoscale => {
  const metric: AutoscaleMetric = runtime === "streaming" ? "consumer-lag" : runtime === "batch" ? "queue-depth" : runtime === "service" ? "requests" : "concurrency";
  return { mode: "auto", metric, target: METRIC_BY_ID[metric].defaultTarget, upCooldownSec: 30, downCooldownSec: runtime === "streaming" ? 600 : 300, desired: runtime === "service" || runtime === "streaming" ? 2 : 1, calendar: [] };
};

export function defaultExecution(runtime: RuntimeKind = "serverless"): Execution {
  const base = { runtime, durable: true, scaling: { minReplicas: 0, maxReplicas: 20, concurrency: 10, timeoutSec: 300, memoryMb: 1024, cpu: 1, autoscale: defaultAutoscale(runtime) } };
  if (runtime === "service") return { ...base, scaling: { ...base.scaling, minReplicas: 2, maxReplicas: 20, timeoutSec: 600 }, modes: { onDemand: { ...defaultOnDemand(), response: "stream" } } };
  if (runtime === "streaming") return { ...base, scaling: { ...base.scaling, minReplicas: 2, maxReplicas: 16, timeoutSec: 0, memoryMb: 2048 }, modes: { streaming: defaultStreaming() } };
  if (runtime === "batch") return { ...base, scaling: { ...base.scaling, minReplicas: 0, maxReplicas: 32, timeoutSec: 14_400, memoryMb: 2048 }, modes: { scheduled: { schedules: [{ ...defaultSchedule(), name: "Nightly", cron: "0 2 * * *" }] }, onDemand: { ...defaultOnDemand(), response: "task" } } };
  if (runtime === "external") return { ...base, durable: false, scaling: { minReplicas: 0, maxReplicas: 0, concurrency: 0, timeoutSec: 0, memoryMb: 0, cpu: 0, autoscale: { ...defaultAutoscale("external"), mode: "manual", desired: 0 } }, modes: { onDemand: defaultOnDemand() } };
  return { ...base, modes: { onDemand: defaultOnDemand() } };
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Cron

type Field = { any: boolean; set: Set<number> };
const NAMES: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12, sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const RANGES: [number, number][] = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];

function parseField(src: string, [lo, hi]: [number, number]): Field | string {
  const set = new Set<number>(); let any = true;
  for (const part of src.split(",")) {
    const [rangePart, stepPart] = part.split("/");
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (!Number.isInteger(step) || step < 1) return `"${part}" has a step that is not a whole number above zero.`;
    let a: number; let b: number;
    if (rangePart === "*") { a = lo; b = hi; if (stepPart === undefined) continue; any = false; }
    else {
      any = false;
      const [x, y] = rangePart.split("-");
      const n = (v: string) => (NAMES[v.toLowerCase()] ?? (/^\d+$/.test(v) ? Number(v) : NaN));
      a = n(x); b = y === undefined ? (stepPart === undefined ? a : hi) : n(y);
      if (Number.isNaN(a) || Number.isNaN(b)) return `"${part}" is not a number or a name.`;
    }
    if (a < lo || b > hi || a > b) return `"${part}" is outside ${lo} to ${hi}.`;
    for (let v = a; v <= b; v += step) set.add(v);
  }
  if (any) { for (let v = lo; v <= hi; v++) set.add(v); }
  return { any, set };
}

export type Cron = { minute: Field; hour: Field; dom: Field; month: Field; dow: Field };
export function parseCron(expr: string): { ok: true; cron: Cron } | { ok: false; error: string } {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) return { ok: false, error: "A schedule has five parts: minute, hour, day of month, month and day of week. For example 0 8 * * 1-5." };
  const names = ["minute", "hour", "day of month", "month", "day of week"]; const out: Field[] = [];
  for (let i = 0; i < 5; i++) { const r = parseField(f[i], RANGES[i]); if (typeof r === "string") return { ok: false, error: `The ${names[i]} part: ${r}` }; out.push(r); }
  if (out[4].set.has(7)) out[4].set.add(0);
  return { ok: true, cron: { minute: out[0], hour: out[1], dom: out[2], month: out[3], dow: out[4] } };
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function localParts(ms: number, tz: string) {
  let f = fmtCache.get(tz);
  if (!f) { f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short" }); fmtCache.set(tz, f); }
  const p: Record<string, string> = {}; for (const x of f.formatToParts(ms)) p[x.type] = x.value;
  return { mo: Number(p.month), d: Number(p.day), h: Number(p.hour) % 24, mi: Number(p.minute), dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) };
}
export const validTimezone = (tz: string) => { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } };

/** The next times a schedule fires, as instants. A day that is both a date and a weekday in the rule matches when either does, as cron has always done. */
export function nextRuns(expr: string, tz: string, count = 3, from = Date.now(), horizonDays = 1500): number[] {
  const p = parseCron(expr); if (!p.ok || !validTimezone(tz)) return [];
  const c = p.cron; const out: number[] = []; const end = from + horizonDays * 86_400_000;
  let t = Math.floor(from / 60_000) * 60_000 + 60_000;
  while (out.length < count && t < end) {
    const l = localParts(t, tz);
    const dayOk = c.dom.any && c.dow.any ? true : !c.dom.any && !c.dow.any ? c.dom.set.has(l.d) || c.dow.set.has(l.dow) : c.dom.any ? c.dow.set.has(l.dow) : c.dom.set.has(l.d);
    if (!c.month.set.has(l.mo) || !dayOk) { t += Math.max(30, (24 * 60 - (l.h * 60 + l.mi)) - 60) * 60_000; continue; }
    if (!c.hour.set.has(l.h)) { t += (60 - l.mi) * 60_000; continue; }
    if (!c.minute.set.has(l.mi)) { t += 60_000; continue; }
    out.push(t); t += 60_000;
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** A plain sentence for the common shapes, and the expression itself for the rest. */
export function describeCron(expr: string): string {
  const f = expr.trim().split(/\s+/); if (f.length !== 5 || !parseCron(expr).ok) return "Not a valid schedule";
  const [mi, h, dom, mo, dow] = f; const at = /^\d+$/.test(mi) && /^\d+$/.test(h) ? `${pad(Number(h))}:${pad(Number(mi))}` : null;
  if (/^\*\/\d+$/.test(mi) && h === "*" && dom === "*" && mo === "*" && dow === "*") return `Every ${mi.slice(2)} minutes`;
  if (mi === "*" && h === "*" && dom === "*" && mo === "*" && dow === "*") return "Every minute";
  if (/^\d+$/.test(mi) && h === "*" && dom === "*" && mo === "*" && dow === "*") return Number(mi) === 0 ? "Every hour, on the hour" : `Every hour, ${mi} minutes past`;
  if (/^\d+$/.test(mi) && /^\*\/\d+$/.test(h) && dom === "*" && mo === "*" && dow === "*") return `Every ${h.slice(2)} hours, at ${mi} minutes past`;
  if (at && dom === "*" && mo === "*") {
    if (dow === "*") return `Every day at ${at}`;
    if (dow === "1-5") return `Every weekday at ${at}`;
    if (/^[0-7]$/.test(dow)) return `Every ${DAYS[Number(dow) % 7]} at ${at}`;
  }
  if (at && /^\d+$/.test(dom) && mo === "*" && dow === "*") return `On day ${dom} of every month at ${at}`;
  return expr;
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Validation

export type ExecIssue = { path: string; message: string; level: "error" | "warning" };

export function validateExecution(e: Execution, ctx: { hasSensitiveTools?: boolean; control?: string; toolCount?: number } = {}): ExecIssue[] {
  const out: ExecIssue[] = []; const err = (path: string, message: string) => out.push({ path, message, level: "error" }); const warn = (path: string, message: string) => out.push({ path, message, level: "warning" });
  out.push(...validateToolCalling(e.toolCalling, { control: ctx.control, hasSensitiveTools: ctx.hasSensitiveTools, runtime: e.runtime, toolCount: ctx.toolCount }));
  const rt = RUNTIME_BY_ID[e.runtime]; const on = enabledModes(e);
  if (!on.length) err("modes", "Turn on at least one way to start the agent.");
  for (const m of on) if (!rt.modes.includes(m)) err(`modes.${m}`, `${MODE_BY_ID[m].label} cannot run on ${rt.label.toLowerCase()}. ${m === "streaming" ? "Use an always-on service or a streaming worker." : m === "scheduled" ? "A streaming worker never stops, so it has no run to start on a clock." : "Choose a runtime that supports it."}`);
  if (e.runtime === "streaming" && !on.includes("streaming") && !on.includes("event")) err("runtime", "A streaming worker needs the Streaming or Event driven mode to read from.");
  if (e.runtime !== "external") {
    const s = e.scaling;
    if (!(s.maxReplicas >= 1)) err("scaling.maxReplicas", "Allow at least one replica.");
    if (s.minReplicas < 0 || s.minReplicas > s.maxReplicas) err("scaling.minReplicas", "The minimum cannot be below zero or above the maximum.");
    if (!RUNTIME_BY_ID[e.runtime].scalesToZero && s.minReplicas < 1) err("scaling.minReplicas", `${rt.label} keeps at least one replica running, so the minimum is 1 or more.`);
    if (!(s.concurrency >= 1)) err("scaling.concurrency", "Allow at least one run at a time on each replica.");
    if (rt.maxTimeoutSec > 0 && (s.timeoutSec < 1 || s.timeoutSec > rt.maxTimeoutSec)) err("scaling.timeoutSec", `A run on ${rt.label.toLowerCase()} may last 1 to ${rt.maxTimeoutSec.toLocaleString("en-US")} seconds.`);
    if (s.memoryMb < 256 || s.memoryMb > 32_768) err("scaling.memoryMb", "Memory is between 256 MB and 32 GB.");
    if (s.cpu < 0.25 || s.cpu > 16) err("scaling.cpu", "CPU is between 0.25 and 16 cores.");
    if (e.runtime === "serverless" && s.minReplicas > 0) warn("scaling.minReplicas", "Warm instances remove the cold start but are billed while idle.");
    const as = s.autoscale;
    if (as.mode === "manual") {
      if (!(as.desired >= s.minReplicas && as.desired <= s.maxReplicas)) err("scaling.autoscale.desired", `Hold between ${s.minReplicas} and ${s.maxReplicas} replicas, the limits above.`);
      else if (as.desired === 0 && !rt.scalesToZero) err("scaling.autoscale.desired", `${rt.label} cannot be held at zero.`);
      else if (e.runtime === "serverless") warn("scaling.autoscale.mode", "Manual scaling on the on-demand runtime holds instances warm. They are billed while idle.");
    } else {
      const m = METRIC_BY_ID[as.metric];
      if (!m.runtimes.includes(e.runtime)) err("scaling.autoscale.metric", `${m.label} does not drive ${rt.label.toLowerCase()}. Choose ${m.runtimes.length ? METRICS.filter((x) => x.runtimes.includes(e.runtime)).map((x) => x.label.toLowerCase()).join(", ") : "another metric"}.`);
      if (!(as.target > 0)) err("scaling.autoscale.target", "The target is above zero.");
      if (as.metric === "cpu" && as.target > 95) err("scaling.autoscale.target", "A CPU target above 95 percent leaves no room for a burst.");
      if (as.upCooldownSec < 5) err("scaling.autoscale.upCooldownSec", "Wait at least 5 seconds between scale-ups.");
      if (as.downCooldownSec < 30) err("scaling.autoscale.downCooldownSec", "Wait at least 30 seconds before scaling down, or replicas flap.");
      if (as.downCooldownSec < as.upCooldownSec) warn("scaling.autoscale.downCooldownSec", "Scaling down faster than up makes replicas flap. Wait longer to scale down.");
      if (as.metric === "consumer-lag" && !on.includes("streaming")) err("scaling.autoscale.metric", "Stream lag needs the Streaming mode.");
      if (s.maxReplicas === s.minReplicas) warn("scaling.maxReplicas", "The minimum equals the maximum, so the agent never scales.");
    }
    as.calendar.forEach((c, i) => {
      const p = `scaling.autoscale.calendar.${i}`;
      if (!c.name.trim()) err(`${p}.name`, "Name the busy period.");
      const pc = parseCron(c.cron); if (!pc.ok) err(`${p}.cron`, pc.error);
      if (!validTimezone(c.timezone)) err(`${p}.timezone`, `${c.timezone} is not a timezone name.`);
      if (c.minReplicas < 1 || c.minReplicas > s.maxReplicas) err(`${p}.minReplicas`, `Hold between 1 and ${s.maxReplicas} replicas during the period.`);
      if (!(c.durationMin >= 1 && c.durationMin <= 1440)) err(`${p}.durationMin`, "A busy period lasts 1 to 1,440 minutes.");
    });
  }
  const od = e.modes.onDemand;
  if (od) {
    if (!(od.concurrency >= 1)) err("modes.onDemand.concurrency", "Allow at least one run at a time.");
    if (od.response === "sync" && od.timeoutSec > 300) warn("modes.onDemand.timeoutSec", "Callers rarely wait more than five minutes. Use a task, and let them poll.");
    if (od.timeoutSec < 1) err("modes.onDemand.timeoutSec", "The timeout must be at least a second.");
    if (rt.maxTimeoutSec > 0 && od.timeoutSec > rt.maxTimeoutSec) err("modes.onDemand.timeoutSec", `${rt.label} allows at most ${rt.maxTimeoutSec} seconds.`);
  }
  const sc = e.modes.scheduled;
  if (sc) {
    if (!sc.schedules.length) err("modes.scheduled", "Add a schedule or turn the mode off.");
    const names = new Set<string>();
    sc.schedules.forEach((s, i) => {
      const p = `modes.scheduled.${i}`;
      if (!s.name.trim()) err(`${p}.name`, "Name the schedule.");
      else if (names.has(s.name.trim().toLowerCase())) err(`${p}.name`, `Two schedules are called ${s.name}.`);
      names.add(s.name.trim().toLowerCase());
      const c = parseCron(s.cron); if (!c.ok) err(`${p}.cron`, c.error);
      else if (!nextRuns(s.cron, s.timezone, 1, Date.now()).length) err(`${p}.cron`, "This rule never fires. Check the day and month together.");
      else if (/^\*(\/1)?$/.test(s.cron.trim().split(/\s+/)[0]) && s.cron.trim().split(/\s+/).slice(1).every((x) => x === "*")) warn(`${p}.cron`, "This runs every minute. Each run costs model tokens.");
      if (!validTimezone(s.timezone)) err(`${p}.timezone`, `${s.timezone} is not a timezone name. Use a name such as Europe/London.`);
      if (!s.input.trim()) err(`${p}.input`, "Say what the run should do, since nobody is there to ask.");
      if (s.catchUp === "all" && s.overlap !== "queue") warn(`${p}.catchUp`, "Catching up on every missed run at once can overlap. Queue them instead.");
    });
  }
  const ev = e.modes.event;
  if (ev) {
    if (!ev.triggers.length) err("modes.event", "Add a trigger or turn the mode off.");
    ev.triggers.forEach((t, i) => {
      const p = `modes.event.${i}`;
      if (!t.source.trim()) err(`${p}.source`, "Say where the event comes from.");
      if (t.kind === "webhook" && !/^\/[A-Za-z0-9/_\-.]+$/.test(t.source)) err(`${p}.source`, "A webhook path starts with a slash, for example /hooks/new-ticket.");
      if (t.kind === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.source)) err(`${p}.source`, "Enter the mailbox address that receives the mail.");
      if (["topic", "queue", "cdc", "file", "dataset"].includes(t.kind) && !t.connection && t.kind !== "dataset") warn(`${p}.connection`, "Choose the connection this reads from. The credential stays in the secret manager.");
      if (!(t.batchSize >= 1 && t.batchSize <= 1000)) err(`${p}.batchSize`, "Take 1 to 1,000 events in a run.");
    });
    if (!(ev.concurrency >= 1 && ev.concurrency <= 1000)) err("modes.event.concurrency", "Run between 1 and 1,000 events at once.");
    if (ev.retries < 0 || ev.retries > 10) err("modes.event.retries", "Retry 0 to 10 times.");
    if (ev.retries > 0 && !ev.deadLetter) err("modes.event.deadLetter", "Name a dead letter queue, so an event that keeps failing is kept and not lost.");
  }
  const st = e.modes.streaming;
  if (st) {
    if (!st.source.topic.trim()) err("modes.streaming.source", "Name the stream to read.");
    if (!st.consumerGroup.trim()) err("modes.streaming.consumerGroup", "Name the consumer group, so workers share the stream and each event is read once.");
    if (!(st.parallelism >= 1 && st.parallelism <= 256)) err("modes.streaming.parallelism", "Run 1 to 256 parallel readers.");
    if (!(st.checkpointSec >= 1 && st.checkpointSec <= 600)) err("modes.streaming.checkpointSec", "Save progress every 1 to 600 seconds.");
    if (st.window.kind !== "none" && !(st.window.sizeSec >= 1)) err("modes.streaming.window", "A window is at least a second long.");
    if (st.window.kind === "sliding" && !(st.window.slideSec && st.window.slideSec >= 1 && st.window.slideSec <= st.window.sizeSec)) err("modes.streaming.window", "A sliding window moves forward by less than its length.");
    if (st.window.kind === "session" && !(st.window.gapSec && st.window.gapSec >= 1)) err("modes.streaming.window", "A session window closes after a quiet gap. Say how long.");
    if (st.window.kind !== "none" && !st.keyBy) warn("modes.streaming.keyBy", "Without a key, one window covers all events. Pick the field that identifies the thing being watched.");
    if (st.delivery === "exactly-once" && !st.sink) err("modes.streaming.sink", "Exactly-once delivery needs a sink that can take part. Choose where results are written.");
    if (st.delivery === "at-least-once") warn("modes.streaming.delivery", "After a restart an event may be handled twice. Make the agent's actions safe to repeat.");
    if (st.maxLagSec < 1) err("modes.streaming.maxLagSec", "Alert when the agent falls behind by at least a second.");
    if (st.parallelism > e.scaling.maxReplicas * Math.max(1, e.scaling.concurrency) && e.runtime !== "external") warn("modes.streaming.parallelism", "More readers than the workers can run at once. Some will wait.");
  }
  const hu = e.modes.human;
  if (hu) {
    if (!hu.when.length) err("modes.human.when", "Say when a person is asked.");
    if (!hu.assignee.trim()) err("modes.human.assignee", "Name the group that decides.");
    if (!hu.channels.length) err("modes.human.channels", "Choose where the request appears.");
    if (!(hu.slaMinutes >= 1)) err("modes.human.slaMinutes", "Give the group at least a minute.");
    if (hu.when.includes("low-confidence") && !(hu.confidenceBelow > 0 && hu.confidenceBelow < 1)) err("modes.human.confidenceBelow", "Confidence is between 0 and 1, not including either.");
    if (hu.when.includes("cost") && !(hu.costAboveUsd > 0)) err("modes.human.costAboveUsd", "Set a cost above zero.");
    if (hu.onTimeout === "escalate" && !hu.escalateTo?.trim()) err("modes.human.escalateTo", "Name who it goes to when nobody answers in time.");
    if (!e.durable) err("durable", "A run that waits for a person must be saved while it waits. Turn on durable state.");
    if (hu.onTimeout === "wait" && hu.slaMinutes > 0) warn("modes.human.onTimeout", "Waiting for ever can leave runs stuck. Escalate or decline instead.");
    if (ctx.hasSensitiveTools && !hu.when.includes("sensitive-tool") && !hu.when.includes("always")) warn("modes.human.when", "This agent can reach sensitive tools, and no gate opens for them.");
    if (ctx.control && ctx.control !== "governed") warn("modes.human", "Only a governed agent can be stopped at a gate. Here the request is recorded, but tok∑ner cannot hold the run.");
  }
  if (on.includes("scheduled") && on.includes("human") && !e.durable) warn("durable", "A scheduled run that pauses for a person should be saved while it waits.");
  return out;
}

/** One line for lists and cards. */
export function executionSummary(e: Execution | undefined): string {
  if (!e) return "Not recorded";
  const on = enabledModes(e);
  return `${RUNTIME_BY_ID[e.runtime].label}, ${on.length ? on.map((m) => MODE_BY_ID[m].label.toLowerCase()).join(", ") : "no mode on"}`;
}

/** Where runs come from, written for an agent's detail page. */
export function triggerLines(e: Execution | undefined, now = Date.now()): { mode: ModeId; text: string }[] {
  if (!e) return [];
  const out: { mode: ModeId; text: string }[] = [];
  const m = e.modes;
  if (m.onDemand) out.push({ mode: "onDemand", text: `Called by apps, people and agents. Answers ${m.onDemand.response === "sync" ? "in the same request" : m.onDemand.response === "task" ? "as a task to poll" : "as a stream"}, up to ${m.onDemand.timeoutSec} s.` });
  for (const s of m.scheduled?.schedules ?? []) { const n = nextRuns(s.cron, s.timezone, 1, now)[0]; out.push({ mode: "scheduled", text: `${s.name}: ${describeCron(s.cron).toLowerCase()}, ${s.timezone}.${s.enabled && n ? ` Next ${new Date(n).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.` : s.enabled ? "" : " Paused."}` }); }
  for (const t of m.event?.triggers ?? []) out.push({ mode: "event", text: `${t.kind === "webhook" ? "Webhook" : t.kind === "topic" ? "Topic" : t.kind === "queue" ? "Queue" : t.kind === "dataset" ? "Dataset" : t.kind === "cdc" ? "Table change" : t.kind === "file" ? "File arrives" : "Email"} ${t.source}${t.filter ? `, when ${t.filter}` : ""}.` });
  if (m.streaming) out.push({ mode: "streaming", text: `Reads ${m.streaming.source.topic}${m.streaming.window.kind !== "none" ? ` in ${m.streaming.window.kind} windows of ${m.streaming.window.sizeSec} s` : ""}${m.streaming.keyBy ? `, by ${m.streaming.keyBy}` : ""}. Checkpoint every ${m.streaming.checkpointSec} s.` });
  if (m.human) out.push({ mode: "human", text: `${m.human.assignee} decides ${m.human.when.map((w) => ({ always: "every run", "low-confidence": `when confidence is under ${m.human!.confidenceBelow}`, "sensitive-tool": "before a sensitive tool", cost: `when cost passes $${m.human!.costAboveUsd}`, policy: "when a policy asks" })[w]).join(", ")}. ${m.human.slaMinutes} min to answer, then ${m.human.onTimeout}.` });
  return out;
}


// ---------------------------------------------------------------------------------------------------------------------------------------
// The autoscaler. Pure, so the same function drives the preview, the simulation and the checks.

/** The load on the agent in the unit of its metric: total runs in flight, requests per second, items waiting, seconds of lag, or CPU percent across all replicas. */
export type Load = { runs: number; rps: number; queue: number; lagSec: number; cpuPct: number };

/** The floor a busy-period rule sets at this instant, or 0. A rule starts on the cron time and lasts durationMin minutes. */
export function calendarFloor(c: CalendarFloor[], now: number): number {
  let floor = 0;
  for (const r of c) {
    if (!parseCron(r.cron).ok || !validTimezone(r.timezone)) continue;
    const from = now - r.durationMin * 60_000;
    const starts = nextRuns(r.cron, r.timezone, 1, from - 1);
    if (starts.length && starts[0] <= now) floor = Math.max(floor, r.minReplicas);
  }
  return floor;
}

export type Decision = { desired: number; reason: string; held?: "cooldown" | "limit" | "manual" };

/**
 * The replica count to move to. `current` is what runs now, `lastChange` and `lastDirection` come from the last scaling event so the cooldowns hold.
 * Automatic scaling aims for load per replica at the target: ceil(load / target), kept between the floor and the maximum. It scales up at once once the
 * up cooldown has passed, and scales down one step at a time after the down cooldown, so a short dip does not drop capacity.
 */
export function autoscale(e: Execution, load: Load, current: number, now: number, last?: { at: number; direction: "up" | "down" }): Decision {
  const s = e.scaling; const a = s.autoscale;
  if (e.runtime === "external") return { desired: current, reason: "tok∑ner does not scale an agent that runs elsewhere.", held: "manual" };
  if (a.mode === "manual") { const d = Math.min(s.maxReplicas, Math.max(s.minReplicas, a.desired)); return { desired: d, reason: d === current ? `Held at ${d} replicas by hand.` : `Moving to the ${d} replicas held by hand.`, held: "manual" }; }
  const floor = Math.max(s.minReplicas, calendarFloor(a.calendar, now));
  // Load per replica should sit near the target. For lag and CPU the load figure is already per replica, so the ideal count scales with how far it is above target.
  const ideal = a.metric === "concurrency" ? Math.ceil(load.runs / a.target) : a.metric === "requests" ? Math.ceil(load.rps / a.target) : a.metric === "queue-depth" ? Math.ceil(load.queue / a.target)
    : a.metric === "consumer-lag" ? Math.ceil((Math.max(1, current) * load.lagSec) / a.target) : Math.ceil((Math.max(1, current) * load.cpuPct) / a.target);
  const idle = load.runs === 0 && load.queue === 0 && load.rps === 0 && load.lagSec === 0 && load.cpuPct < 5;
  let want = Math.min(s.maxReplicas, Math.max(floor, idle ? 0 : Math.max(1, ideal)));
  if (want > current) {
    if (last && last.direction === "up" && now - last.at < a.upCooldownSec * 1000) return { desired: current, reason: `Wanted ${want}, waiting ${Math.ceil((a.upCooldownSec * 1000 - (now - last.at)) / 1000)} s before scaling up again.`, held: "cooldown" };
    return { desired: want, reason: want === s.maxReplicas && ideal > s.maxReplicas ? `Load needs ${ideal}, held at the maximum of ${s.maxReplicas}.` : `${METRIC_BY_ID[a.metric].label} is above the target of ${a.target}. Adding ${want - current}.`, held: want === s.maxReplicas && ideal > s.maxReplicas ? "limit" : undefined };
  }
  if (want < current) {
    if (last && now - last.at < a.downCooldownSec * 1000) return { desired: current, reason: `Load is low, waiting ${Math.ceil((a.downCooldownSec * 1000 - (now - last.at)) / 1000)} s before scaling down.`, held: "cooldown" };
    const step = Math.max(want, current - Math.max(1, Math.floor(current * 0.25)));
    return { desired: step, reason: `${METRIC_BY_ID[a.metric].label} is under the target. Removing ${current - step}.` };
  }
  return { desired: current, reason: "At the target." };
}
