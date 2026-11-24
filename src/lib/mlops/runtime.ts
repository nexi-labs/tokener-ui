import { OP_BY_KIND } from "./operators";
import { exportSpec, runBlockers, sha256, specDigest, topoOrder, validateSpec, type PipelineSpec, type ValidationCtx } from "./spec";
import type { Connection, Env, LogLine, NodeRun, PipelineRun } from "./types";

/**
 * Demo executor. It computes a deterministic, plausible outcome for a pipeline run entirely in the
 * browser. It never contacts infrastructure, and a run it produces is always flagged `demo: true`.
 * Asking for real execution fails loudly instead of pretending to succeed.
 */
export class RealModeUnavailable extends Error {
  constructor(public operator?: string) {
    super(operator
      ? `Real execution is not available: the "${operator}" operator has no released adapter yet.`
      : "Live execution needs a released connector for each target. Use a simulated run to check the plan until then.");
    this.name = "RealModeUnavailable";
  }
}

export type ExecMode = "demo" | "real";
export function assertExecutable(mode: ExecMode, spec: PipelineSpec) {
  if (mode === "real") throw new RealModeUnavailable(spec.nodes.find((n) => OP_BY_KIND[n.operator]?.adapter)?.operator);
}

function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const hex = (r: () => number, n: number) => Array.from({ length: n }, () => Math.floor(r() * 16).toString(16)).join("");

export type FailSpec = { nodeId: string; kind: "fail" | "approval-wait" };
export type RunOptions = { startedBy: string; trigger: string; startedAt?: Date; fail?: FailSpec; approved?: boolean; seed?: string; id?: string; demo?: boolean };

function logsFor(kind: string, c: Record<string, any>, r: () => number, failed: boolean): LogLine[] {
  const L = (level: LogLine["level"], msg: string): Omit<LogLine, "t"> & { t: string } => ({ t: "", level, msg });
  const m: ReturnType<typeof L>[] = [];
  const sha = () => hex(r, 12);
  switch (kind) {
    case "git_source": m.push(L("info", `Resolving ${c.ref} on ${c.repo}`), L("info", `Pinned commit ${sha()}`), L("info", "Working tree is clean")); break;
    case "registry_model": m.push(L("info", `Fetching ${c.name} version ${c.version}`), L("info", "Checksum matches registry record")); break;
    case "build_image": m.push(L("info", "Queued to a build agent with matching labels"), L("info", `Building ${c.repository} for ${c.platforms}`), L("debug", "Step 4/9 pip install -r requirements.lock"), L("info", c.sbom ? "SBOM generated (spdx-json)" : "SBOM skipped"), failed ? L("error", "Build failed: step 6/9 exited with code 1") : L("info", `Pushed ${c.repository}@sha256:${sha()}${sha()}`)); break;
    case "validate_artifact": m.push(L("info", `Checking architecture ${c.arch}`), L("info", `License allowlist: ${c.allowedLicenses}`), L("info", `Image size within ${c.maxSizeMb} MB`), failed ? L("error", "License GPL-3.0 found in layer 7 is not in the allowlist") : L("info", "All checks passed")); break;
    case "evaluate_model": m.push(L("info", `Evaluating on held-out set, metric ${c.metric}`), failed ? L("error", `${c.metric} 0.871 is below the minimum ${c.threshold}`) : L("info", `${c.metric} 0.${Math.floor(92 + r() * 5)} meets minimum ${c.threshold}`)); break;
    case "approval_gate": m.push(L("info", `Approval requested from role ${c.role}`), L("info", "Notified approvers by email")); break;
    case "register_model": m.push(L("info", `Registering ${c.name}`), L("info", "Provenance recorded: commit, image digest, dataset hash"), L("info", `Stage set to ${c.stage}`)); break;
    case "canary_rollout": case "deploy_endpoint": case "agent_service":
      m.push(L("info", "Dry run passed. 0 conflicts."), L("info", `Applying ${c.name}`), L("info", "Waiting for replicas to become ready"), failed ? L("error", "Readiness probe failed 5 times: connection refused on :8080") : L("info", "All replicas ready")); break;
    case "verify_endpoint": m.push(L("info", `Observing for ${c.observeMinutes} min`), failed ? L("error", `p95 ${Math.floor(Number(c.p95Ms) * 1.7)} ms exceeds limit ${c.p95Ms} ms`) : L("info", `p95 ${Math.floor(Number(c.p95Ms) * 0.62)} ms within limit ${c.p95Ms} ms`), L("info", "Smoke test returned 200")); break;
    case "schedule_trigger": m.push(L("info", `Schedule armed: ${c.mode === "Cron expression" ? c.cron : `${c.mode} at ${c.at}`} (${c.timezone})`), L("info", `Next fire time computed in ${c.timezone}; missed runs: ${String(c.missed).toLowerCase()}`)); break;
    case "interval_timer": m.push(L("info", `Timer armed: every ${c.every} ${c.unit}`), L("info", `Overlap rule: ${String(c.overlap).toLowerCase()}`)); break;
    case "wait_delay": m.push(L("info", `Waiting: ${String(c.mode).toLowerCase()}${c.mode === "For a duration" ? ` ${c.duration} ${c.unit}` : ""}`), L("info", "Run state saved. No compute is held while waiting.")); break;
    case "time_window": m.push(L("info", `Window ${c.from} to ${c.to} ${c.timezone}, days ${c.days}`), L("info", "Inside the window. Continuing.")); break;
    case "calendar_read": m.push(L("info", `Reading calendar ${c.calendarId}, next ${c.lookaheadDays} day(s)`), L("info", "Fetched 6 events. Attendee addresses omitted.")); break;
    case "calendar_event": m.push(L("info", c.findFreeSlot ? "Found the first free slot" : "Using the requested time"), L("info", `Created a ${c.durationMin} minute event`)); break;
    case "email_inbox": m.push(L("info", `Searching ${c.folder} with filter ${c.filter}`), L("info", "Read 12 messages. Attachments skipped.")); break;
    case "llm_step": m.push(L("info", `Calling ${c.model} through the gateway under policy ${c.gatewayPolicy}`), L("info", "Policy allowed. Budget checked. Usage metered.")); break;
    case "send_email": m.push(L("info", `Delivery mode: ${c.mode}`), L("info", "Recipients checked against allowed domains. Content redacted."), L("info", c.mode === "Save as draft" ? "Draft saved. Nothing was sent." : "Message handed to the provider.")); break;
    case "payment_request": m.push(L("info", "Request signature verified"), L("info", `Order accepted with fields: ${c.fields}`), L("info", "Fields outside the allowed list were dropped")); break;
    case "mcp_tool": m.push(L("info", "Connected. Protocol revision negotiated and tool definitions match the pinned hashes."), L("info", `Calling ${c.tool} (${String(c.effect).toLowerCase()}). Tool is on the approved list.`), failed ? L("error", "Tool definition changed since it was approved. Call blocked until reviewed.") : L("info", "Result received within the size limit. Secrets and personal data redacted before it reaches a model.")); break;
    case "mcp_resource": m.push(L("info", `Reading ${c.uri}`), L("info", "Content treated as untrusted text and converted to a canonical document")); break;
    case "pay_mtn_momo": m.push(L("info", `Request to Pay prepared for ${c.amountSource === "Fixed amount" ? `${c.amount} ${c.currency}` : `the order amount in ${c.currency}`}`), L("info", "Idempotency key set from the order reference"), L("info", "Pay page link created. The customer enters their number there and approves with their PIN on their phone.")); break;
    case "pay_orange_money": m.push(L("info", `Web payment created in ${c.currency}`), L("info", "Order id is unique. Notification URL registered."), L("info", "Hosted payment link ready. The customer confirms with a one-time code.")); break;
    case "pay_paypal": m.push(L("info", "Order created with a request id so a retry cannot duplicate it"), L("info", "Approval link ready. Capture happens after the customer approves.")); break;
    case "pay_card": m.push(L("info", "Hosted payment page created. Card numbers are entered on the provider's page only."), L("info", `Authentication: ${c.authentication}`), L("info", `Statement descriptor ${c.descriptor}`)); break;
    case "pay_bitcoin": m.push(L("info", `Invoice created at the ${c.rateSource} rate, valid ${c.linkExpiryMin} min`), L("info", `Settles after ${c.confirmations} confirmation(s) on ${String(c.network).toLowerCase()}`), L("info", c.screenAddresses ? "Address screening is on" : "Address screening is off")); break;
    case "pay_custom": m.push(L("info", `Calling ${c.createPath} with credentials resolved from references`), L("info", "Link read from the response. Credentials were not logged.")); break;
    case "await_payment": m.push(L("info", `Waiting up to ${c.waitMinutes} min. No compute held.`), L("info", "Notification signature verified"), failed ? L("warn", "Link expired without a confirmed payment") : L("info", "Status read back from the provider: paid. Amount and currency match the order.")); break;
    case "payment_refund": m.push(L("info", "Approval recorded"), L("info", `${c.mode} refunded to the original method. Reason: ${c.reason}`)); break;
    case "send_sms": m.push(L("info", `Delivery mode: ${c.mode}`), L("info", "Recipient format checked. Opt-out list applied."), L("info", c.mode === "Send after approval" ? "Held until approved." : "Message handed to the provider.")); break;
    case "promote": m.push(L("info", `Shifting traffic through steps ${c.steps}`), L("info", "Stable revision updated")); break;
    case "rollback": m.push(L("warn", "Restoring previous revision"), L("info", "Traffic returned to previous version")); break;
    default: m.push(L("info", `${OP_BY_KIND[kind]?.label ?? kind} started`), failed ? L("error", "Operation failed") : L("info", "Completed"));
  }
  return m as LogLine[];
}

export type RunInputs = { spec: PipelineSpec; version: number; pipelineId: string; pipelineName: string; ctx: ValidationCtx; connections: Connection[] };

/** Compute the final state of a run. The store reveals it progressively so the UI feels live. */
export function computeRun(inp: RunInputs, o: RunOptions): PipelineRun {
  const { spec } = inp;
  const startedAt = o.startedAt ?? new Date();
  const digest = specDigest(spec);
  const seed = o.seed ?? `${digest}${startedAt.toISOString()}${o.trigger}`;
  const r = rng(seed);
  const id = o.id ?? `run-${hex(r, 8)}`;
  const idem = `idem-${sha256(digest + o.trigger + startedAt.toISOString().slice(0, 13)).slice(0, 16)}`;
  const snapshot = {
    spec: exportSpec(spec),
    connections: Object.fromEntries(spec.nodes.filter((n) => n.connection).map((n) => {
      const c = inp.connections.find((x) => x.id === n.connection);
      return [n.id, c ? { id: c.id, name: c.name, integration: c.integrationId, env: c.env, secretRef: c.secretRef ?? null } : null];
    })),
    note: "Immutable. Secret values never appear in snapshots, only references.",
  };
  const base = { id, pipelineId: inp.pipelineId, pipelineName: inp.pipelineName, pipelineVersion: inp.version, env: spec.environment as Env, trigger: o.trigger, startedBy: o.startedBy, startedAt: startedAt.toISOString(), idempotencyKey: idem, specDigest: digest, snapshot, demo: o.demo ?? true };

  const issues = validateSpec(spec, inp.ctx);
  const blockers = runBlockers(spec, issues);
  if (blockers.length) {
    return {
      ...base, status: "validation-failed", durationMs: 0,
      nodes: spec.nodes.map((n) => ({ nodeId: n.id, status: "skipped", attempt: 0, maxAttempts: 0, logs: [], artifacts: [] })),
      events: [{ t: startedAt.toISOString(), kind: "validation", msg: `Validation failed with ${blockers.length} blocking issue${blockers.length > 1 ? "s" : ""}. No operator was executed.` }, ...blockers.map((b) => ({ t: startedAt.toISOString(), kind: "validation", msg: b }))],
    };
  }

  let clock = startedAt.getTime();
  const nodes: NodeRun[] = [];
  const events: PipelineRun["events"] = [{ t: startedAt.toISOString(), kind: "run", msg: `Run ${id} created by ${o.startedBy} (${o.trigger}). Idempotency key ${idem}.` }];
  let status = "succeeded" as PipelineRun["status"];
  let halted = false;
  const rollbackNode = spec.nodes.find((n) => n.operator === "rollback");
  const failed = new Set<string>();

  topoOrder(spec).forEach((nid) => {
    const n = spec.nodes.find((x) => x.id === nid)!;
    const op = OP_BY_KIND[n.operator];
    const maxAttempts = (n.retry?.max ?? op.retry.max) + 1;
    if (halted) {
      const isRb = n.id === rollbackNode?.id && status === "failed";
      if (!isRb) { nodes.push({ nodeId: n.id, status: "skipped", attempt: 0, maxAttempts, logs: [], artifacts: [] }); return; }
    }
    const isFail = o.fail?.nodeId === n.id && o.fail.kind === "fail";
    const isWait = n.operator === "approval_gate" && !o.approved;
    const dur = Math.round((op.timeoutSec ? Math.min(op.timeoutSec, 40 + r() * 400) : 500) * 1000 * (n.operator === "build_image" ? 1.6 : 0.4));
    const attempt = isFail ? maxAttempts : 1;
    const lines = logsFor(n.operator, n.config, r, isFail);
    const stepMs = Math.max(200, Math.floor(dur / (lines.length + 1)));
    const logs = lines.map((l, i) => ({ ...l, t: new Date(clock + (i + 1) * stepMs).toISOString() }));
    const artifacts: NodeRun["artifacts"] = [];
    if (!isFail && !isWait) {
      if (n.operator === "build_image") artifacts.push({ name: "image", kind: "oci-image", ref: `${n.config.repository}@sha256:${hex(r, 12)}${hex(r, 12)}${hex(r, 16)}`, digest: `sha256:${hex(r, 16)}${hex(r, 16)}${hex(r, 16)}${hex(r, 16)}` }, { name: "sbom", kind: "spdx-json", ref: "artifact://sbom.spdx.json" });
      if (n.operator === "validate_artifact" || n.operator === "evaluate_model" || n.operator === "verify_endpoint") artifacts.push({ name: "report", kind: "json-report", ref: `artifact://${n.id}-report.json` });
      if (n.operator === "register_model") artifacts.push({ name: "model-version", kind: "model", ref: `models:/${n.config.name}/latest` });
    }
    if (isWait) {
      nodes.push({ nodeId: n.id, status: "waiting", startedAt: new Date(clock).toISOString(), attempt: 1, maxAttempts, logs, artifacts });
      events.push({ t: new Date(clock).toISOString(), kind: "approval", msg: `${n.name} is waiting for an approver. The run is paused and holds no resources.` });
      status = "waiting-approval"; halted = true; return;
    }
    nodes.push({ nodeId: n.id, status: isFail ? "failed" : "succeeded", startedAt: new Date(clock).toISOString(), durationMs: dur, attempt, maxAttempts, logs, artifacts });
    clock += dur;
    if (isFail) {
      failed.add(n.id);
      events.push({ t: new Date(clock).toISOString(), kind: "failure", msg: `${n.name} failed after ${attempt} attempt${attempt > 1 ? "s" : ""} (exponential backoff with jitter).` });
      status = "failed"; halted = true;
      const policy = n.onFailure ?? op.onFailure;
      if (policy === "rollback" || rollbackNode) {
        events.push({ t: new Date(clock).toISOString(), kind: "rollback", msg: "Failure policy rollback: previous revision restored." });
      }
    } else if (n.operator === "approval_gate") events.push({ t: new Date(clock).toISOString(), kind: "approval", msg: `${n.name} approved.` });
  });

  if (status === "failed" && events.some((e) => e.kind === "rollback")) status = "rolled-back";
  const total = nodes.reduce((s, n) => s + (n.durationMs ?? 0), 0);
  events.push({ t: new Date(clock).toISOString(), kind: "run", msg: `Run ${status}.` });
  return { ...base, status, durationMs: total, nodes, events };
}
