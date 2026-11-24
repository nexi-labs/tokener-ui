/**
 * Generates the sample Functions workspace. Deterministic for a given anchor hour: the same anchor always yields the same
 * records. Every aggregate shown in the console is computed from these records, never typed in.
 */
import { APPS, BUDGETS, MODELS, POLICIES, PROVIDERS, TENANTS, modelById, priceCall, providerOfModel } from "./catalog";
import { rng, type Rng } from "./rng";
import type {
  ExecDetail, ExecStatus, ExecStep, FnDeployment, FnExecution, FnFunction, FnRevision, FnTrigger, FunctionsState, Governance, LogLine, TriggerKind,
  UsageEvent, WfRun, WfRunStatus, WfStep, Workflow,
} from "./types";

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const WINDOW_DAYS = 7;
export const STATE_VERSION = 1;

export const anchorNow = () => Math.floor(Date.now() / HOUR) * HOUR;

// ---------------------------------------------------------------------------------------------- function profiles

type Ai = { models: [string, number][]; inMean: number; inSpread: number; outMean: number; outSpread: number } | null;
type Profile = {
  id: string; name: string; description: string; tenantId: string; appId: string; owner: string; team: string;
  runtime: FnFunction["runtime"]; memoryMb: number; timeoutS: number; status: FnFunction["status"]; useCase?: string;
  tags: string[]; ai: Ai; latencyMs: number; triggers: ("http" | "kafka" | "schedule")[]; standalonePerDay: number;
  failRate: number; timeoutRate: number; blockRate: number; dataClass: Governance["dataClass"]; revisions: number; lastDeployDaysAgo: number;
  kafkaTopic?: string; cron?: string; cronText?: string; secretRefs?: string[]; egress?: string[]; tools?: string[]; maxCost: number; daily: number; weekly: number;
  approvalAbove?: number; disabledDaysAgo?: number; statusReason?: string; lambda?: FnFunction["lambda"];
};

const P: Profile[] = [
  { id: "fn-fraud-score", name: "fraud-score", description: "Scores an authorised card payment from device, merchant and history signals and returns a risk score with reasons.", tenantId: "t-retail", appId: "a-card-risk", owner: "Layla Haddad", team: "Card risk", runtime: "python3.12", memoryMb: 512, timeoutS: 8, status: "active", useCase: "A", tags: ["fraud", "payments", "realtime"], ai: { models: [["llama-3.3-70b", 94], ["claude-haiku", 6]], inMean: 420, inSpread: 70, outMean: 58, outSpread: 14 }, latencyMs: 420, triggers: ["kafka", "http"], standalonePerDay: 18, failRate: 0.012, timeoutRate: 0.004, blockRate: 0.008, dataClass: "restricted", revisions: 7, lastDeployDaysAgo: 2, kafkaTopic: "payments.authorised", secretRefs: [], egress: [], maxCost: 20_000, daily: 12_000_000, weekly: 70_000_000 },
  { id: "fn-sanctions-screen", name: "sanctions-screen", description: "Screens the counterparty against sanctions and watchlists and explains near matches in plain language.", tenantId: "t-retail", appId: "a-card-risk", owner: "Layla Haddad", team: "Card risk", runtime: "node22", memoryMb: 256, timeoutS: 10, status: "active", useCase: "A", tags: ["sanctions", "screening"], ai: { models: [["claude-haiku", 100]], inMean: 310, inSpread: 60, outMean: 70, outSpread: 20 }, latencyMs: 610, triggers: ["http"], standalonePerDay: 4, failRate: 0.015, timeoutRate: 0.006, blockRate: 0.01, dataClass: "restricted", revisions: 4, lastDeployDaysAgo: 9, secretRefs: ["secretref://vault/payments/core-banking-mcp"], egress: ["watchlist.internal.example"], maxCost: 10_000, daily: 5_000_000, weekly: 28_000_000 },
  { id: "fn-case-summary", name: "case-summary", description: "Writes the case summary a risk officer reads before approving a hold: what was flagged, why, and what the checks returned.", tenantId: "t-retail", appId: "a-card-risk", owner: "Omar Siddiq", team: "Card risk", runtime: "python3.12", memoryMb: 512, timeoutS: 20, status: "active", useCase: "A", tags: ["summary", "case-management"], ai: { models: [["claude-sonnet", 100]], inMean: 930, inSpread: 160, outMean: 205, outSpread: 40 }, latencyMs: 2300, triggers: ["http"], standalonePerDay: 2, failRate: 0.02, timeoutRate: 0.01, blockRate: 0.012, dataClass: "confidential", revisions: 5, lastDeployDaysAgo: 5, maxCost: 15_000, daily: 4_000_000, weekly: 22_000_000 },
  { id: "fn-limits-check", name: "limits-check", description: "Reads the customer limits and open holds from the limits service. Runs as an AWS Lambda function behind a tok∑ner connector, read only.", tenantId: "t-retail", appId: "a-card-risk", owner: "Layla Haddad", team: "Card risk", runtime: "aws-lambda", memoryMb: 256, timeoutS: 6, status: "active", useCase: "A", tags: ["limits", "aws-lambda", "read-only"], ai: null, latencyMs: 140, triggers: ["http"], standalonePerDay: 3, failRate: 0.01, timeoutRate: 0.003, blockRate: 0.004, dataClass: "confidential", revisions: 3, lastDeployDaysAgo: 14, secretRefs: ["secretref://vault/aws/limits-lambda-role"], maxCost: 1_000, daily: 1_000_000, weekly: 4_000_000, lambda: { connectionId: "conn-aws-limits", arn: "arn:aws:lambda:me-central-1:111122223333:function:limits-check", region: "me-central-1", qualifier: "prod", invocation: "RequestResponse" } },
  { id: "fn-doc-extract", name: "doc-extract", description: "Extracts fields from loan application documents (statements, ids, company filings) into a typed record with a confidence per field.", tenantId: "t-corp", appId: "a-loans", owner: "Priya Nair", team: "Lending", runtime: "python3.12", memoryMb: 1024, timeoutS: 45, status: "active", useCase: "B", tags: ["documents", "extraction", "vision"], ai: { models: [["claude-sonnet", 88], ["gpt-4.1", 12]], inMean: 2600, inSpread: 500, outMean: 640, outSpread: 120 }, latencyMs: 5200, triggers: ["http"], standalonePerDay: 8, failRate: 0.03, timeoutRate: 0.012, blockRate: 0.01, dataClass: "restricted", revisions: 6, lastDeployDaysAgo: 3, secretRefs: ["secretref://vault/docs/ocr-service"], egress: ["ocr.internal.example"], maxCost: 60_000, daily: 20_000_000, weekly: 90_000_000 },
  { id: "fn-loan-summary", name: "loan-summary", description: "Drafts the credit memo for a loan application from the extracted record and the policy rules that applied.", tenantId: "t-corp", appId: "a-loans", owner: "Priya Nair", team: "Lending", runtime: "java21", memoryMb: 1024, timeoutS: 30, status: "active", useCase: "B", tags: ["credit-memo", "approval"], ai: { models: [["gpt-4.1", 100]], inMean: 1500, inSpread: 280, outMean: 520, outSpread: 100 }, latencyMs: 3600, triggers: ["http"], standalonePerDay: 1, failRate: 0.018, timeoutRate: 0.008, blockRate: 0.01, dataClass: "restricted", revisions: 4, lastDeployDaysAgo: 6, maxCost: 40_000, daily: 15_000_000, weekly: 60_000_000, approvalAbove: 30_000 },
  { id: "fn-ticket-classify", name: "ticket-classify", description: "Classifies a support ticket by topic, priority and sentiment and suggests a queue.", tenantId: "t-retail", appId: "a-support", owner: "Omar Siddiq", team: "Support engineering", runtime: "node22", memoryMb: 256, timeoutS: 8, status: "active", useCase: "C", tags: ["support", "classification"], ai: { models: [["claude-haiku", 92], ["gpt-4.1-mini", 8]], inMean: 280, inSpread: 90, outMean: 34, outSpread: 8 }, latencyMs: 520, triggers: ["kafka", "http"], standalonePerDay: 14, failRate: 0.01, timeoutRate: 0.004, blockRate: 0.012, dataClass: "confidential", revisions: 9, lastDeployDaysAgo: 1, kafkaTopic: "support.tickets.created", secretRefs: ["secretref://vault/crm/ticket-api"], egress: ["crm.internal.example"], maxCost: 4_000, daily: 3_000_000, weekly: 16_000_000 },
  { id: "fn-ticket-reply-draft", name: "ticket-reply-draft", description: "Drafts a reply for the agent to review. It never sends anything on its own.", tenantId: "t-retail", appId: "a-support", owner: "Omar Siddiq", team: "Support engineering", runtime: "python3.12", memoryMb: 512, timeoutS: 15, status: "active", useCase: "C", tags: ["support", "drafting"], ai: { models: [["gpt-4.1-mini", 100]], inMean: 760, inSpread: 150, outMean: 230, outSpread: 60 }, latencyMs: 1900, triggers: ["http"], standalonePerDay: 22, failRate: 0.014, timeoutRate: 0.006, blockRate: 0.01, dataClass: "confidential", revisions: 5, lastDeployDaysAgo: 4, maxCost: 6_000, daily: 4_000_000, weekly: 20_000_000 },
  { id: "fn-cost-digest", name: "cost-digest", description: "Reads yesterday's AI usage by tenant, app and model and writes a short digest with the three biggest movers.", tenantId: "00000000-0000-4000-8000-0000000000b2", appId: "a-finops", owner: "Yuki Tanaka", team: "Platform FinOps", runtime: "python3.12", memoryMb: 512, timeoutS: 60, status: "active", useCase: "D", tags: ["finops", "digest", "scheduled"], ai: { models: [["claude-haiku", 100]], inMean: 3400, inSpread: 500, outMean: 480, outSpread: 90 }, latencyMs: 4100, triggers: ["schedule", "http"], standalonePerDay: 0.4, failRate: 0.01, timeoutRate: 0.0, blockRate: 0.0, dataClass: "internal", revisions: 3, lastDeployDaysAgo: 11, cron: "0 6 * * *", cronText: "Every day at 06:00", maxCost: 30_000, daily: 2_000_000, weekly: 8_000_000 },
  { id: "fn-local-summarise", name: "local-summarise", description: "Summarises treasury desk notes on in-house models so the text never leaves the network.", tenantId: "t-corp", appId: "a-treasury", owner: "Marcus Webb", team: "Treasury technology", runtime: "go1.23", memoryMb: 256, timeoutS: 30, status: "active", useCase: "E", tags: ["local-model", "vllm", "ollama", "no-egress"], ai: { models: [["llama-3.3-70b", 72], ["qwen2.5-14b", 28]], inMean: 1100, inSpread: 240, outMean: 190, outSpread: 45 }, latencyMs: 3100, triggers: ["http"], standalonePerDay: 18, failRate: 0.02, timeoutRate: 0.014, blockRate: 0.006, dataClass: "restricted", revisions: 4, lastDeployDaysAgo: 7, egress: [], maxCost: 5_000, daily: 1_000_000, weekly: 5_000_000 },
  { id: "fn-invoice-ocr-beta", name: "invoice-ocr-beta", description: "Container image for invoice OCR with layout hints. Held back until the image is signed.", tenantId: "t-corp", appId: "a-loans", owner: "Priya Nair", team: "Lending", runtime: "container", memoryMb: 2048, timeoutS: 60, status: "failed", statusReason: "Deployment rejected: the image digest is not signed by a key on the allowed list (requireSignedImages is on).", tags: ["ocr", "beta"], ai: null, latencyMs: 0, triggers: ["http"], standalonePerDay: 0, failRate: 0, timeoutRate: 0, blockRate: 0, dataClass: "confidential", revisions: 1, lastDeployDaysAgo: 1, maxCost: 10_000, daily: 2_000_000, weekly: 8_000_000 },
  { id: "fn-merchant-risk-v2", name: "merchant-risk-v2", description: "Next version of the merchant risk model wrapper, rolling out to staging first.", tenantId: "t-retail", appId: "a-card-risk", owner: "Layla Haddad", team: "Card risk", runtime: "python3.12", memoryMb: 512, timeoutS: 8, status: "deploying", tags: ["merchant", "risk"], ai: null, latencyMs: 0, triggers: ["http", "kafka"], standalonePerDay: 0, failRate: 0, timeoutRate: 0, blockRate: 0, dataClass: "restricted", revisions: 2, lastDeployDaysAgo: 0, kafkaTopic: "payments.merchant.updated", maxCost: 8_000, daily: 3_000_000, weekly: 12_000_000 },
  { id: "fn-kyc-refresh", name: "kyc-refresh", description: "Prepares the periodic KYC refresh pack for a corporate client. Not deployed yet.", tenantId: "t-corp", appId: "a-loans", owner: "Priya Nair", team: "Lending", runtime: "python3.12", memoryMb: 512, timeoutS: 30, status: "draft", tags: ["kyc", "draft"], ai: null, latencyMs: 0, triggers: [], standalonePerDay: 0, failRate: 0, timeoutRate: 0, blockRate: 0, dataClass: "restricted", revisions: 1, lastDeployDaysAgo: 0, maxCost: 20_000, daily: 3_000_000, weekly: 12_000_000 },
  { id: "fn-legacy-router", name: "legacy-router", description: "Old keyword-based ticket router, replaced by ticket-classify. Disabled, kept for rollback.", tenantId: "t-retail", appId: "a-support", owner: "Omar Siddiq", team: "Support engineering", runtime: "node22", memoryMb: 128, timeoutS: 5, status: "disabled", statusReason: "Disabled by Omar Siddiq after ticket-classify took over routing.", tags: ["legacy"], ai: null, latencyMs: 90, triggers: ["http"], standalonePerDay: 6, failRate: 0.02, timeoutRate: 0.002, blockRate: 0.0, dataClass: "internal", revisions: 6, lastDeployDaysAgo: 40, disabledDaysAgo: 3, maxCost: 1_000, daily: 500_000, weekly: 2_000_000 },
];

const ENDPOINT_BASE = "https://api.tokener.example";
export const invokeUrl = (name: string) => `${ENDPOINT_BASE}/v1/functions/${name}/invocations`;

function governanceFor(p: Profile): Governance {
  const models = p.ai ? p.ai.models.map(([m]) => m) : [];
  const providers = [...new Set(models.map((m) => providerOfModel(m)?.id ?? ""))].filter(Boolean);
  const external = providers.some((id) => PROVIDERS.find((x) => x.id === id)?.external);
  return {
    allowedProviders: providers, allowedModels: models,
    maxInputTokens: p.ai ? Math.round((p.ai.inMean + p.ai.inSpread * 3) / 100) * 100 : 0,
    maxOutputTokens: p.ai ? Math.round((p.ai.outMean + p.ai.outSpread * 3) / 50) * 50 : 0,
    maxCostMicros: p.maxCost, dailyBudgetMicros: p.daily, weeklyBudgetMicros: p.weekly,
    invocationsPerMinute: p.triggers.includes("kafka") ? 600 : 120, dailyInvocationCap: Math.max(500, Math.round(p.standalonePerDay * 40) + 600), maxConcurrency: p.triggers.includes("kafka") ? 40 : 10, timeoutS: p.timeoutS,
    retries: { max: p.triggers.includes("kafka") ? 3 : 1, backoff: "exponential", initialMs: 250 },
    deadLetter: p.kafkaTopic ? `${p.kafkaTopic}.dlq` : null,
    egress: p.egress && p.egress.length ? "allowlist" : "none", egressAllow: p.egress ?? [], secretRefs: p.secretRefs ?? [],
    dataClass: p.dataClass, piiRedaction: external || p.dataClass === "restricted", logPayloads: p.dataClass === "restricted" ? "none" : "redacted",
    approvalAboveMicros: p.approvalAbove ?? null,
    policyIds: ["pol-models", "pol-budget", "pol-egress", ...(external ? ["pol-pii"] : []), ...(p.dataClass === "restricted" ? ["pol-residency"] : []), ...(p.triggers.includes("http") ? ["pol-rate"] : [])],
    tools: p.id === "fn-sanctions-screen" ? ["watchlist.search"] : p.id === "fn-limits-check" ? ["limits.read"] : [],
  };
}

const NOTES = ["Initial version", "Tighten the prompt and add a JSON schema", "Cache lookups for 30 seconds", "Fix a timeout on large payloads", "Move to the shared client library", "Add a confidence field", "Raise memory, reduce cold start", "Handle empty input", "Switch the primary model", "Add structured logging"];
const PEOPLE = ["Layla Haddad", "Omar Siddiq", "Priya Nair", "Marcus Webb", "Yuki Tanaka"];

// ---------------------------------------------------------------------------------------------- the build

export function buildFunctions(anchor: number): FunctionsState {
  const iso = (ms: number) => new Date(ms).toISOString();
  const functions: FnFunction[] = [];
  const revisions: FnRevision[] = [];
  const deployments: FnDeployment[] = [];
  const triggers: FnTrigger[] = [];

  // ---- functions, revisions, deployments, triggers
  for (const p of P) {
    const r = rng("fn:" + p.id);
    const lambdaFn = p.runtime === "aws-lambda";
    const lastDeploy = anchor - p.lastDeployDaysAgo * DAY - r.int(0, 8) * HOUR;
    const revDates: number[] = [];
    for (let i = 0; i < p.revisions; i++) revDates.push(i === p.revisions - 1 ? lastDeploy : lastDeploy - (p.revisions - 1 - i) * r.int(3, 9) * DAY - r.int(0, 20) * HOUR);
    const failedLast = p.status === "failed";
    const deployingLast = p.status === "deploying";
    const draftLast = p.status === "draft";
    const activeRev = draftLast || failedLast && p.revisions === 1 ? null : deployingLast ? p.revisions - 1 || null : failedLast ? p.revisions - 1 : p.revisions;
    for (let i = 0; i < p.revisions; i++) {
      const number = i + 1;
      const status: FnRevision["status"] = number === p.revisions ? (failedLast ? "failed" : draftLast ? "draft" : deployingLast ? "draft" : "active") : number === activeRev ? "active" : "superseded";
      revisions.push({
        id: `${p.id}:r${number}`, fnId: p.id, number, createdAt: iso(revDates[i]), createdBy: i % 3 === 2 ? r.pick(PEOPLE) : p.owner, note: number === 1 ? "Initial version" : r.pick(NOTES),
        artifact: lambdaFn ? { kind: "lambda-arn", ref: `${p.lambda!.arn}:${p.lambda!.qualifier}`, sizeKb: 0, digest: "sha256:" + r.hex(64) }
          : p.runtime === "container" ? { kind: "image", ref: `registry.nexi.example/lending/${p.name}:0.${number}.0`, sizeKb: r.int(180_000, 320_000), digest: "sha256:" + r.hex(64) }
          : r.chance(0.5) ? { kind: "git", ref: `github.com/nexi-labs/${p.name}@${r.hex(7)}`, sizeKb: r.int(40, 900), digest: "sha256:" + r.hex(64) } : { kind: "archive", ref: `${p.name}-${number}.zip`, sizeKb: r.int(40, 900), digest: "sha256:" + r.hex(64) },
        status,
      });
      if (draftLast && number === p.revisions) continue;
      const failed = failedLast && number === p.revisions;
      const inProgress = deployingLast && number === p.revisions;
      const envs: ("staging" | "production")[] = inProgress ? ["staging"] : failed ? ["staging"] : ["staging", "production"];
      envs.forEach((env, k) => {
        const start = revDates[i] + (k + 1) * 6 * 60_000;
        deployments.push({
          id: `dep-${p.id}-${number}-${env === "staging" ? "s" : "p"}`, fnId: p.id, revision: number, env, startedAt: iso(inProgress ? anchor - 4 * 60_000 : start), durationS: inProgress ? 0 : failed ? 21 : r.int(24, 71),
          status: inProgress ? "in-progress" : failed ? "failed" : "succeeded", by: i % 3 === 2 ? "release-pipeline" : p.owner, note: failed ? "Signature check" : number === 1 ? "First deployment" : "Routine release",
          error: failed ? "Image signature verification failed: no matching key in the allowed signer list." : undefined, traffic: failed || inProgress ? 0 : env === "production" && number === p.revisions ? 100 : 0,
        });
      });
    }
    const updatedAt = p.status === "disabled" ? anchor - (p.disabledDaysAgo ?? 3) * DAY : lastDeploy;
    functions.push({
      id: p.id, name: p.name, description: p.description, kind: lambdaFn ? "lambda-proxy" : "managed", tenantId: p.tenantId, appId: p.appId, owner: p.owner, team: p.team,
      env: p.status === "deploying" || p.status === "draft" ? "staging" : "production", runtime: p.runtime, handler: lambdaFn ? p.lambda!.arn.split(":").pop()! : p.runtime === "container" ? "entrypoint" : p.runtime === "java21" ? "io.nexi.lending.Handler::handle" : p.runtime === "node22" ? "index.handler" : p.runtime === "go1.23" ? "main" : "main.handler",
      memoryMb: p.memoryMb, ephemeralMb: 512, status: p.status, statusReason: p.statusReason, tags: p.tags, createdAt: iso(revDates[0]), updatedAt: iso(updatedAt),
      activeRevision: activeRev, latestRevision: p.revisions, governance: governanceFor(p), lambda: p.lambda, useCase: p.useCase,
    });
    // triggers
    p.triggers.forEach((kind) => {
      const base = { id: `trg-${p.id}-${kind}`, fnId: p.id, kind, enabled: p.status !== "disabled" };
      if (kind === "http") triggers.push({ ...base, name: "Invoke over HTTPS", http: { method: "POST", path: `/v1/functions/${p.name}/invocations`, auth: p.dataClass === "restricted" ? "mtls" : "api-key", rateLimitPerMin: 120, idempotencyHeader: "Idempotency-Key", cors: [], maxBodyKb: 256, sync: p.timeoutS <= 30 }, lastFiredAt: p.status === "active" ? iso(anchor - r.int(2, 50) * 60_000) : undefined });
      if (kind === "kafka") triggers.push({ ...base, name: `Consume ${p.kafkaTopic}`, kafka: { cluster: "kafka-prod-me", topic: p.kafkaTopic!, group: `tokener-fn-${p.name}`, startOffset: "latest", batchSize: 1, concurrency: 20, dlqTopic: `${p.kafkaTopic}.dlq`, maxLagAlert: 500, format: "json" }, lastFiredAt: p.status === "active" ? iso(anchor - r.int(1, 9) * 60_000) : undefined });
      if (kind === "schedule") {
        const nextHour = 6; const n = new Date(anchor); n.setUTCHours(nextHour, 0, 0, 0); if (n.getTime() <= anchor) n.setUTCDate(n.getUTCDate() + 1);
        const last = new Date(n.getTime() - DAY);
        triggers.push({ ...base, name: p.cronText ?? "Scheduled", schedule: { cron: p.cron!, timezone: "UTC", overlap: "skip", catchUp: false, jitterS: 30, humanReadable: p.cronText! }, lastFiredAt: last.toISOString(), nextFireAt: n.toISOString() });
      }
    });
  }

  const fnById = (id: string) => functions.find((f) => f.id === id)!;
  const profile = (id: string) => P.find((p) => p.id === id)!;

  // ---- executions
  const executions: FnExecution[] = [];
  const usage: UsageEvent[] = [];
  let seq = 0;

  function revisionAt(fnId: string, t: number): number {
    const prod = deployments.filter((d) => d.fnId === fnId && d.env === "production" && d.status === "succeeded").sort((a, b) => a.revision - b.revision);
    let rev = prod.length ? prod[0].revision : 1;
    for (const d of prod) if (new Date(d.startedAt).getTime() <= t) rev = d.revision;
    return rev;
  }

  function makeExec(fnId: string, t: number, trigger: TriggerKind, R: Rng, opt: { workflowRunId?: string; correlationId?: string; forceOk?: boolean; blockOverride?: boolean } = {}): FnExecution {
    const p = profile(fnId);
    const fn = fnById(fnId);
    const trg = triggers.find((x) => x.fnId === fnId && x.kind === trigger) ?? triggers.find((x) => x.fnId === fnId)!;
    const roll = R.next();
    let status: ExecStatus = "succeeded";
    if (!opt.forceOk) {
      if (roll < p.blockRate) status = "blocked";
      else if (roll < p.blockRate + p.failRate) status = "failed";
      else if (roll < p.blockRate + p.failRate + p.timeoutRate) status = "timeout";
      else if (trigger === "http" && R.chance(0.006)) status = "throttled";
    }
    const cold = R.chance(0.045);
    let durationMs = Math.round(R.around(p.latencyMs, p.latencyMs * 0.22)) + (cold ? R.int(180, 700) : 0);
    let model: string | undefined, provider: string | undefined;
    let tIn = 0, tOut = 0, cost = 0;
    if (p.ai && status !== "blocked" && status !== "throttled") {
      model = R.weighted(p.ai.models);
      provider = providerOfModel(model)?.id;
      tIn = Math.max(20, Math.round(R.around(p.ai.inMean, p.ai.inSpread)));
      tOut = status === "failed" || status === "timeout" ? 0 : Math.max(5, Math.round(R.around(p.ai.outMean, p.ai.outSpread)));
      cost = priceCall(model, tIn, tOut);
    }
    let error: FnExecution["error"];
    let policy: FnExecution["policy"] = { result: "allow", policyId: "pol-models" };
    let httpStatus: number | undefined = trigger === "http" ? 200 : undefined;
    if (status === "failed") {
      const e = R.weighted<[string, string, number]>([[["provider_rate_limited", "The provider returned 429. Retries were used up.", 502], 3], [["handler_exception", "Unhandled exception in the handler: KeyError 'merchant_id'.", 500], 3], [["invalid_output", "The model output did not match the JSON schema.", 502], 2], [["upstream_unavailable", "A downstream service did not answer in time.", 504], 2]]);
      error = { code: e[0], message: e[1] }; httpStatus = trigger === "http" ? e[2] : undefined;
    } else if (status === "timeout") {
      durationMs = p.timeoutS * 1000; error = { code: "timeout", message: `The invocation exceeded its ${p.timeoutS} second limit and was stopped.` }; httpStatus = trigger === "http" ? 504 : undefined;
    } else if (status === "blocked") {
      const reasons: [string, string][] = p.dataClass === "restricted"
        ? [["pol-pii", "Prompt contained an unmasked card number for an external provider."], ["pol-residency", "Restricted data may not go to an external provider."], ["pol-budget", "Estimated cost is above the per-invocation ceiling."]]
        : [["pol-models", "Model gpt-4.1 is not on this function's allowlist."], ["pol-pii", "Prompt contained an unmasked email address."], ["pol-budget", "Estimated cost is above the per-invocation ceiling."]];
      const [pid, why] = R.pick(reasons);
      policy = { result: "deny", policyId: pid, reason: why };
      error = { code: "policy_denied", message: why }; durationMs = R.int(9, 40); httpStatus = trigger === "http" ? 403 : undefined;
    } else if (status === "throttled") {
      policy = { result: "monitor-only", policyId: "pol-rate", reason: "Above invocationsPerMinute." }; error = { code: "throttled", message: "Rate limit reached. Retry after 2 seconds." }; durationMs = R.int(4, 15); httpStatus = 429;
    }
    const id = `exe_${(++seq).toString(36).padStart(5, "0")}${R.hex(5)}`;
    const e: FnExecution = {
      id, fnId, fnName: p.name, revision: revisionAt(fnId, t), trigger, triggerName: trg?.name ?? "Invoke", tenantId: fn.tenantId, appId: fn.appId,
      correlationId: opt.correlationId ?? `cor_${R.hex(12)}`, auditId: `aud_${R.hex(12)}`, workflowRunId: opt.workflowRunId, startedAt: iso(t), durationMs, status, httpStatus, coldStart: cold,
      memoryUsedMb: Math.round(p.memoryMb * (0.28 + R.next() * 0.4)), provider, model, tokensIn: tIn, tokensOut: tOut, costMicros: cost, policy, error, payloadDigest: "sha256:" + R.hex(16),
      idempotencyKey: trigger === "http" && R.chance(0.6) ? `idem-${R.hex(10)}` : undefined, attempt: status === "failed" && trigger === "kafka" ? R.int(2, 4) : 1,
    };
    executions.push(e);
    if (model && cost > 0 || model && tIn > 0) {
      usage.push({ id: `use_${e.id}`, at: e.startedAt, tenantId: e.tenantId, appId: e.appId, fnId, workflowId: null, source: "function", ref: e.id, provider: provider!, model, tokensIn: tIn, tokensOut: tOut, costMicros: cost, correlationId: e.correlationId });
    }
    return e;
  }

  // load shape: more at business hours, quieter on Friday and Saturday
  const HW = [0.25, 0.2, 0.2, 0.25, 0.4, 0.7, 1.1, 1.5, 1.7, 1.7, 1.6, 1.4, 1.2, 1.4, 1.6, 1.5, 1.3, 1.0, 0.8, 0.6, 0.5, 0.4, 0.35, 0.3];
  const hourFactor = (t: number) => { const d = new Date(t); const dow = d.getUTCDay(); return HW[d.getUTCHours()] * (dow === 5 || dow === 6 ? 0.5 : 1); };
  const hoursBack = WINDOW_DAYS * 24;
  const count = (R: Rng, rate: number) => (rate < 1 ? (R.chance(rate) ? 1 : 0) : Math.max(0, Math.round(R.around(rate, Math.sqrt(rate)))));

  // ---- workflows
  const wfDefs = buildWorkflows(anchor);
  const runs: WfRun[] = [];
  let runSeq = 0;

  function stepOf(e: FnExecution, name: string, offset: number): ExecStep {
    const st: ExecStep["status"] = e.status === "succeeded" ? "succeeded" : e.status === "blocked" ? "blocked" : "failed";
    return { id: `s-${e.id}`, name, kind: "function", status: st, startMs: offset, durationMs: e.durationMs, detail: `${e.fnName} revision ${e.revision}${e.status !== "succeeded" ? `: ${e.error?.message ?? e.status}` : ""}`, model: e.model, provider: e.provider, tokensIn: e.tokensIn, tokensOut: e.tokensOut, costMicros: e.costMicros };
  }
  const simple = (name: string, kind: ExecStep["kind"], offset: number, dur: number, detail: string, status: ExecStep["status"] = "succeeded"): ExecStep => ({ id: `s-${name}-${offset}`, name, kind, status, startMs: offset, durationMs: dur, detail });

  function finishRun(run: WfRun, wf: Workflow, execs: FnExecution[], native: UsageEvent[]) {
    run.executionIds = execs.map((x) => x.id);
    run.nativeUsage = native;
    run.tokensIn = execs.reduce((s, x) => s + x.tokensIn, 0) + native.reduce((s, x) => s + x.tokensIn, 0);
    run.tokensOut = execs.reduce((s, x) => s + x.tokensOut, 0) + native.reduce((s, x) => s + x.tokensOut, 0);
    run.costMicros = execs.reduce((s, x) => s + x.costMicros, 0) + native.reduce((s, x) => s + x.costMicros, 0);
    usage.push(...native);
    runs.push(run);
    void wf;
  }

  const wf = (id: string) => wfDefs.find((w) => w.id === id)!;

  // payment-risk: kafka, 80 a day
  {
    const W = wf("wf-payment-risk"); const R = rng("run:" + W.id);
    for (let h = hoursBack; h >= 1; h--) {
      const t0 = anchor - h * HOUR; const n = count(R, (80 / 24) * hourFactor(t0));
      for (let i = 0; i < n; i++) {
        const t = t0 + R.int(0, HOUR - 1);
        const rid = `run_${(++runSeq).toString(36).padStart(4, "0")}${R.hex(4)}`; const cor = `cor_${R.hex(12)}`;
        const live = anchor - t < 25 * 60_000 || (anchor - t < 3 * HOUR && R.chance(0.4));
        const fs = makeExec("fn-fraud-score", t, "kafka", R, { workflowRunId: rid, correlationId: cor });
        const execs = [fs]; const steps: ExecStep[] = [simple("Card payment", "trigger", 0, 6, "payments.authorised, partition " + R.int(0, 11)), stepOf(fs, "Score payment", 8)];
        let off = 8 + fs.durationMs; let status: WfRunStatus = fs.status === "succeeded" ? "succeeded" : fs.status === "blocked" ? "blocked" : "failed"; let approval: WfRun["approval"];
        const flagged = fs.status === "succeeded" && R.chance(0.22);
        steps.push(simple("Score at least 0.80", "condition", off, 2, flagged ? "yes, flagged for review" : "no, release", fs.status === "succeeded" ? "succeeded" : "skipped")); off += 2;
        if (flagged) {
          const s2 = makeExec("fn-sanctions-screen", t + off, "http", R, { workflowRunId: rid, correlationId: cor, forceOk: R.chance(0.9) }); steps.push(stepOf(s2, "Sanctions screen", off)); off += s2.durationMs; execs.push(s2);
          const s3 = makeExec("fn-limits-check", t + off, "http", R, { workflowRunId: rid, correlationId: cor, forceOk: R.chance(0.94) }); steps.push(stepOf(s3, "Limits check (AWS Lambda)", off)); off += s3.durationMs; execs.push(s3);
          const s4 = makeExec("fn-case-summary", t + off, "http", R, { workflowRunId: rid, correlationId: cor, forceOk: R.chance(0.9) }); steps.push(stepOf(s4, "Case summary", off)); off += s4.durationMs; execs.push(s4);
          const bad = execs.find((x) => x.status !== "succeeded");
          if (bad) { status = bad.status === "blocked" ? "blocked" : "failed"; }
          else {
            steps.push(simple("Hold needs approval", "policy", off, 4, "pol-approval: pause for a named approver")); off += 4;
            const requested = t + off; const decideAfter = R.int(4, 55) * 60_000;
            if (live || requested + decideAfter > anchor) { status = "waiting-approval"; approval = { approver: "Risk officer queue", requestedAt: iso(requested) }; steps.push(simple("Risk officer approval", "approval", off, 0, "Waiting for a decision", "waiting")); }
            else {
              const rejected = R.chance(0.12); const who = R.pick(["Hana Aziz", "Daniel Okoro", "Sofia Marin"]);
              approval = { approver: who, requestedAt: iso(requested), decidedAt: iso(requested + decideAfter), decision: rejected ? "rejected" : "approved" };
              steps.push(simple("Risk officer approval", "approval", off, decideAfter, `${rejected ? "Rejected" : "Approved"} by ${who}`, "succeeded")); off += decideAfter;
              if (rejected) { status = "rejected"; steps.push(simple("Hold on core banking", "connector", off, 0, "Skipped, the hold was rejected", "skipped")); }
              else { steps.push(simple("Hold on core banking", "connector", off, 180, "hold_authorisation returned ok")); off += 180; status = "succeeded"; }
            }
          }
        }
        steps.push(simple("Verdict", "output", off, 3, flagged ? (status === "succeeded" ? "hold placed" : status) : "released", status === "failed" || status === "blocked" ? "skipped" : status === "waiting-approval" ? "waiting" : "succeeded"));
        const run: WfRun = { id: rid, workflowId: W.id, workflowName: W.name, revision: W.activeRevision ?? 1, status, startedAt: iso(t), durationMs: Math.max(off + 3, 40), tenantId: W.tenantId, appId: W.appId, correlationId: cor, tokensIn: 0, tokensOut: 0, costMicros: 0, steps, approval, executionIds: [], nativeUsage: [] };
        if (status === "waiting-approval") run.durationMs = Math.max(0, anchor - t);
        finishRun(run, W, execs, []);
      }
    }
  }

  // loan-document-review: HTTP, 12 a day
  {
    const W = wf("wf-loan-review"); const R = rng("run:" + W.id);
    for (let h = hoursBack; h >= 1; h--) {
      const t0 = anchor - h * HOUR; const n = count(R, (12 / 24) * hourFactor(t0));
      for (let i = 0; i < n; i++) {
        const t = t0 + R.int(0, HOUR - 1); const rid = `run_${(++runSeq).toString(36).padStart(4, "0")}${R.hex(4)}`; const cor = `cor_${R.hex(12)}`;
        const a = makeExec("fn-doc-extract", t, "http", R, { workflowRunId: rid, correlationId: cor });
        const execs = [a]; const steps = [simple("Application received", "trigger", 0, 8, "POST /v1/workflows/loan-document-review/runs"), stepOf(a, "Extract fields", 10)];
        let off = 10 + a.durationMs; let status: WfRunStatus = a.status === "succeeded" ? "succeeded" : a.status === "blocked" ? "blocked" : "failed"; let approval: WfRun["approval"];
        if (a.status === "succeeded") {
          const b = makeExec("fn-loan-summary", t + off, "http", R, { workflowRunId: rid, correlationId: cor }); execs.push(b); steps.push(stepOf(b, "Draft credit memo", off)); off += b.durationMs;
          if (b.status !== "succeeded") status = b.status === "blocked" ? "blocked" : "failed";
          else {
            const amount = R.int(40, 900) * 1000; const big = amount > 250_000;
            steps.push(simple("Amount over 250,000", "condition", off, 2, big ? `yes, ${amount.toLocaleString("en-US")} AED` : `no, ${amount.toLocaleString("en-US")} AED`)); off += 2;
            if (big) {
              const requested = t + off; const after = R.int(20, 300) * 60_000;
              if (requested + after > anchor || (anchor - t < 6 * HOUR && R.chance(0.3))) { status = "waiting-approval"; approval = { approver: "Credit committee queue", requestedAt: iso(requested) }; steps.push(simple("Credit officer approval", "approval", off, 0, "Waiting for a decision", "waiting")); }
              else { const rej = R.chance(0.15); const who = R.pick(["Rania Kassab", "Tomas Reyes"]); approval = { approver: who, requestedAt: iso(requested), decidedAt: iso(requested + after), decision: rej ? "rejected" : "approved" }; steps.push(simple("Credit officer approval", "approval", off, after, `${rej ? "Rejected" : "Approved"} by ${who}`)); off += after; status = rej ? "rejected" : "succeeded"; }
            }
            steps.push(simple("Memo filed", "output", off, 5, "Stored in the loan file", status === "succeeded" ? "succeeded" : status === "waiting-approval" ? "waiting" : "skipped"));
          }
        }
        const run: WfRun = { id: rid, workflowId: W.id, workflowName: W.name, revision: W.activeRevision ?? 1, status, startedAt: iso(t), durationMs: status === "waiting-approval" ? Math.max(0, anchor - t) : off + 5, tenantId: W.tenantId, appId: W.appId, correlationId: cor, tokensIn: 0, tokensOut: 0, costMicros: 0, steps, approval, executionIds: [], nativeUsage: [] };
        finishRun(run, W, execs, []);
      }
    }
  }

  // support-triage: kafka, 60 a day, with a native AI step
  {
    const W = wf("wf-support-triage"); const R = rng("run:" + W.id);
    for (let h = hoursBack; h >= 1; h--) {
      const t0 = anchor - h * HOUR; const n = count(R, (60 / 24) * hourFactor(t0));
      for (let i = 0; i < n; i++) {
        const t = t0 + R.int(0, HOUR - 1); const rid = `run_${(++runSeq).toString(36).padStart(4, "0")}${R.hex(4)}`; const cor = `cor_${R.hex(12)}`;
        const c = makeExec("fn-ticket-classify", t, "kafka", R, { workflowRunId: rid, correlationId: cor });
        const execs = [c]; const native: UsageEvent[] = []; const steps = [simple("Ticket created", "trigger", 0, 4, "support.tickets.created"), stepOf(c, "Classify ticket", 6)];
        let off = 6 + c.durationMs; let status: WfRunStatus = c.status === "succeeded" ? "succeeded" : c.status === "blocked" ? "blocked" : "failed";
        if (c.status === "succeeded") {
          const urgent = R.chance(0.14);
          steps.push(simple("Priority is urgent", "condition", off, 2, urgent ? "yes" : "no")); off += 2;
          if (urgent) {
            const requested = t + off; const after = R.int(3, 40) * 60_000;
            if (requested + after > anchor) { status = "waiting-approval"; steps.push(simple("Support lead approval", "approval", off, 0, "Waiting for a decision", "waiting")); }
            else { steps.push(simple("Support lead approval", "approval", off, after, "Approved by Nadia Farouk")); off += after; }
          }
          if (status !== "waiting-approval") {
            const m = "gpt-4.1-mini"; const ti = Math.round(R.around(720, 140)); const to = Math.round(R.around(220, 55)); const cost = priceCall(m, ti, to); const d = Math.round(R.around(1700, 350));
            steps.push({ id: `s-ai-${rid}`, name: "Draft reply", kind: "ai", status: "succeeded", startMs: off, durationMs: d, detail: "Draft for the agent to review, not sent", model: m, provider: "p-openai", tokensIn: ti, tokensOut: to, costMicros: cost });
            native.push({ id: `use_${rid}_ai`, at: iso(t + off), tenantId: W.tenantId, appId: W.appId, fnId: null, workflowId: W.id, source: "workflow-step", ref: rid, provider: "p-openai", model: m, tokensIn: ti, tokensOut: to, costMicros: cost, correlationId: cor });
            off += d; steps.push(simple("Update ticket in CRM", "connector", off, 210, "PATCH /tickets, draft attached")); off += 210; steps.push(simple("Routed", "output", off, 3, "Queue and draft saved")); off += 3;
          }
        }
        const run: WfRun = { id: rid, workflowId: W.id, workflowName: W.name, revision: W.activeRevision ?? 1, status, startedAt: iso(t), durationMs: status === "waiting-approval" ? Math.max(0, anchor - t) : off, tenantId: W.tenantId, appId: W.appId, correlationId: cor, tokensIn: 0, tokensOut: 0, costMicros: 0, steps, executionIds: [], nativeUsage: [] };
        finishRun(run, W, execs, native);
      }
    }
  }

  // daily-cost-review: schedule at 06:00 UTC, once a day
  {
    const W = wf("wf-cost-review"); const R = rng("run:" + W.id);
    for (let d = WINDOW_DAYS; d >= 0; d--) {
      const day = new Date(anchor); day.setUTCHours(6, 0, 0, 0); const t = day.getTime() - d * DAY + R.int(0, 25_000);
      if (t > anchor - 60_000 || t < anchor - WINDOW_DAYS * DAY) continue;
      const rid = `run_${(++runSeq).toString(36).padStart(4, "0")}${R.hex(4)}`; const cor = `cor_${R.hex(12)}`;
      const e = makeExec("fn-cost-digest", t, "schedule", R, { workflowRunId: rid, correlationId: cor, forceOk: d !== 3 });
      const steps = [simple("Every day at 06:00", "trigger", 0, 3, "schedule, UTC"), stepOf(e, "Write cost digest", 5)]; let off = 5 + e.durationMs; let status: WfRunStatus = e.status === "succeeded" ? "succeeded" : "failed";
      if (e.status === "succeeded") { steps.push(simple("Weekly budgets under 80 percent", "policy", off, 6, "pol-budget evaluated for 3 tenants")); off += 6; steps.push(simple("Post to FinOps channel", "connector", off, 240, "Message posted")); off += 240; steps.push(simple("Digest sent", "output", off, 3, "Posted and archived")); off += 3; }
      const run: WfRun = { id: rid, workflowId: W.id, workflowName: W.name, revision: W.activeRevision ?? 1, status, startedAt: iso(t), durationMs: off, tenantId: W.tenantId, appId: W.appId, correlationId: cor, tokensIn: 0, tokensOut: 0, costMicros: 0, steps, executionIds: [], nativeUsage: [] };
      finishRun(run, W, [e], []);
    }
  }

  // ---- standalone executions: direct HTTP calls and manual runs
  for (const p of P) {
    const fn = fnById(p.id);
    if (!p.ai && p.id !== "fn-limits-check" && p.id !== "fn-legacy-router") continue;
    if (p.status === "failed" || p.status === "draft" || p.status === "deploying") continue;
    if (p.standalonePerDay <= 0) continue;
    const R = rng("exe:" + p.id);
    const cutoff = fn.status === "disabled" ? anchor - (p.disabledDaysAgo ?? 3) * DAY : anchor;
    for (let h = hoursBack; h >= 1; h--) {
      const t0 = anchor - h * HOUR; if (t0 + HOUR > cutoff) continue;
      const n = count(R, (p.standalonePerDay / 24) * hourFactor(t0));
      for (let i = 0; i < n; i++) makeExec(p.id, t0 + R.int(0, HOUR - 1), "http", R);
    }
  }
  // the scheduled cost digest also runs from its own trigger outside the workflow once a week
  // Budgets and per-function limits are sized from the generated spend, so the sample shows realistic headroom and one alert.
  const budgets = BUDGETS.map((b) => ({ ...b }));
  const spendIn = (events: UsageEvent[], sinceMs: number) => events.filter((u) => new Date(u.at).getTime() >= anchor - sinceMs).reduce((x, u) => x + u.costMicros, 0);
  const round = (n: number, to: number) => Math.max(to, Math.ceil(n / to) * to);
  for (const b of budgets) {
    const ev = usage.filter((u) => (b.scope === "tenant" ? u.tenantId : u.appId) === b.scopeId);
    const spent = b.period === "daily" ? spendIn(ev, DAY) : spendIn(ev, 7 * DAY);
    const target = b.id === "bud-corp-w" ? 0.86 : b.id === "bud-platform-w" ? 0.71 : b.id === "bud-retail-d" ? 0.58 : 0.64;
    b.limitMicros = round(spent / target, 10_000);
  }
  for (const f of functions) {
    const ev = usage.filter((u) => u.fnId === f.id);
    f.governance.dailyBudgetMicros = Math.max(round(spendIn(ev, DAY) * 2.2, 10_000), f.governance.maxCostMicros * 3);
    f.governance.weeklyBudgetMicros = Math.max(round(spendIn(ev, 7 * DAY) * 1.7, 10_000), f.governance.dailyBudgetMicros * 2);
  }
  executions.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  runs.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  usage.sort((a, b) => (a.at < b.at ? 1 : -1));

  return { anchor: iso(anchor), tenants: TENANTS, apps: APPS, providers: PROVIDERS, models: MODELS, policies: POLICIES, budgets, functions, revisions, deployments, triggers, executions, workflows: wfDefs, runs, usage };
}

// ---------------------------------------------------------------------------------------------- workflow definitions

function buildWorkflows(anchor: number): Workflow[] {
  const iso = (ms: number) => new Date(ms).toISOString();
  const st = (id: string, kind: WfStep["kind"], name: string, config: WfStep["config"], next: string | null, branches?: WfStep["branches"]): WfStep => ({ id, kind, name, config, next, branches });
  const revs = (n: number, owner: string, active: boolean = true) => Array.from({ length: n }, (_, i) => ({ number: i + 1, createdAt: iso(anchor - (n - i) * 6 * DAY), createdBy: owner, note: i === 0 ? "First version" : ["Add the limits check", "Require approval before a hold", "Lower the score threshold to 0.80", "Use the in-house model for scoring", "Tune retries", "Add the cost gate"][i % 6], status: (i === n - 1 && active ? "active" : "superseded") as "active" | "superseded" }));
  return [
    {
      id: "wf-payment-risk", name: "payment-risk", description: "Scores every authorised card payment. Flagged payments get sanctions screening, a limits check, a case summary and a risk officer decision before a hold is placed.",
      status: "active", tenantId: "t-retail", appId: "a-card-risk", owner: "Layla Haddad", activeRevision: 7, latestRevision: 7, revisions: revs(7, "Layla Haddad"), trigger: { kind: "kafka", summary: "payments.authorised on kafka-prod-me" },
      steps: [
        st("s1", "trigger", "Card payment", { source: "kafka", topic: "payments.authorised", group: "tokener-wf-payment-risk" }, "s2"),
        st("s2", "function", "Score payment", { function: "fraud-score", timeoutS: 8, onError: "fail" }, "s3"),
        st("s3", "condition", "Score at least 0.80", { expression: "$.score >= 0.80" }, null, [{ label: "Flagged", when: "true", next: "s4" }, { label: "Release", when: "false", next: "s10" }]),
        st("s4", "function", "Sanctions screen", { function: "sanctions-screen", timeoutS: 10, onError: "fail" }, "s5"),
        st("s5", "connector", "Limits check (AWS Lambda)", { function: "limits-check", connector: "aws_lambda_invoke", timeoutS: 6, onError: "continue" }, "s6"),
        st("s6", "function", "Case summary", { function: "case-summary", model: "claude-sonnet", maxCostUsd: 0.015 }, "s7"),
        st("s7", "policy", "Hold needs approval", { policy: "pol-approval", mode: "enforce" }, "s8"),
        st("s8", "approval", "Risk officer approval", { approverRole: "approver", expiresHours: 4, onTimeout: "reject" }, "s9"),
        st("s9", "connector", "Hold on core banking", { connector: "mcp:core-banking", tool: "hold_authorisation", write: true }, "s10"),
        st("s10", "output", "Verdict", { emit: "payments.risk.verdict", format: "json" }, null),
      ],
      policyIds: ["pol-models", "pol-budget", "pol-approval", "pol-pii", "pol-residency"], maxCostMicros: 20_000, timeoutS: 600, useCase: "Banking fraud and payment risk", updatedAt: iso(anchor - 2 * DAY),
    },
    {
      id: "wf-loan-review", name: "loan-document-review", description: "Extracts fields from a loan application pack, drafts the credit memo and asks a credit officer to approve larger facilities.",
      status: "active", tenantId: "t-corp", appId: "a-loans", owner: "Priya Nair", activeRevision: 5, latestRevision: 5, revisions: revs(5, "Priya Nair"), trigger: { kind: "http", summary: "POST /v1/workflows/loan-document-review/runs" },
      steps: [
        st("s1", "trigger", "Application received", { source: "http", auth: "mtls" }, "s2"),
        st("s2", "function", "Extract fields", { function: "doc-extract", timeoutS: 45 }, "s3"),
        st("s3", "function", "Draft credit memo", { function: "loan-summary", model: "gpt-4.1", timeoutS: 30 }, "s4"),
        st("s4", "condition", "Amount over 250,000", { expression: "$.amount > 250000" }, null, [{ label: "Large", when: "true", next: "s5" }, { label: "Standard", when: "false", next: "s6" }]),
        st("s5", "approval", "Credit officer approval", { approverRole: "approver", expiresHours: 24, onTimeout: "escalate" }, "s6"),
        st("s6", "output", "Memo filed", { emit: "loan.memo.ready", store: "loan-file" }, null),
      ],
      policyIds: ["pol-models", "pol-pii", "pol-residency", "pol-approval"], maxCostMicros: 120_000, timeoutS: 3600, useCase: "Document processing with human approval", updatedAt: iso(anchor - 3 * DAY),
    },
    {
      id: "wf-support-triage", name: "support-triage", description: "Classifies new tickets, asks a lead to approve urgent ones, drafts a reply for the agent and updates the CRM.",
      status: "active", tenantId: "t-retail", appId: "a-support", owner: "Omar Siddiq", activeRevision: 9, latestRevision: 9, revisions: revs(9, "Omar Siddiq"), trigger: { kind: "kafka", summary: "support.tickets.created on kafka-prod-me" },
      steps: [
        st("s1", "trigger", "Ticket created", { source: "kafka", topic: "support.tickets.created" }, "s2"),
        st("s2", "function", "Classify ticket", { function: "ticket-classify", timeoutS: 8 }, "s3"),
        st("s3", "condition", "Priority is urgent", { expression: "$.priority == 'urgent'" }, null, [{ label: "Urgent", when: "true", next: "s4" }, { label: "Normal", when: "false", next: "s5" }]),
        st("s4", "approval", "Support lead approval", { approverRole: "approver", expiresHours: 1, onTimeout: "continue" }, "s5"),
        st("s5", "ai", "Draft reply", { provider: "p-openai", model: "gpt-4.1-mini", maxInputTokens: 1400, maxOutputTokens: 400, temperature: 0.2, promptRef: "prompts/support-reply@4" }, "s6"),
        st("s6", "connector", "Update ticket in CRM", { connector: "crm", operation: "PATCH /tickets/{id}", write: true }, "s7"),
        st("s7", "output", "Routed", { emit: "support.ticket.routed" }, null),
      ],
      policyIds: ["pol-models", "pol-pii", "pol-budget"], maxCostMicros: 12_000, timeoutS: 120, useCase: "Support ticket classification", updatedAt: iso(anchor - 1 * DAY),
    },
    {
      id: "wf-cost-review", name: "daily-cost-review", description: "Every morning writes an AI cost digest, checks tenant budgets and posts the result to the FinOps channel.",
      status: "active", tenantId: "00000000-0000-4000-8000-0000000000b2", appId: "a-finops", owner: "Yuki Tanaka", activeRevision: 3, latestRevision: 3, revisions: revs(3, "Yuki Tanaka"), trigger: { kind: "schedule", summary: "Every day at 06:00 UTC" },
      steps: [
        st("s1", "trigger", "Every day at 06:00", { source: "schedule", cron: "0 6 * * *", timezone: "UTC", overlap: "skip" }, "s2"),
        st("s2", "function", "Write cost digest", { function: "cost-digest", timeoutS: 60 }, "s3"),
        st("s3", "policy", "Weekly budgets under 80 percent", { policy: "pol-budget", mode: "monitor" }, "s4"),
        st("s4", "connector", "Post to FinOps channel", { connector: "slack", channel: "#finops-ai", write: true }, "s5"),
        st("s5", "output", "Digest sent", { emit: "finops.digest.posted" }, null),
      ],
      policyIds: ["pol-budget", "pol-models"], maxCostMicros: 40_000, timeoutS: 300, useCase: "Scheduled AI cost analysis", updatedAt: iso(anchor - 11 * DAY),
    },
    {
      id: "wf-treasury-digest", name: "treasury-note-digest", description: "Summarises the treasury desk's notes on in-house models and files the result. Drafted, not yet active.",
      status: "draft", tenantId: "t-corp", appId: "a-treasury", owner: "Marcus Webb", activeRevision: null, latestRevision: 1, revisions: [{ number: 1, createdAt: iso(anchor - 2 * DAY), createdBy: "Marcus Webb", note: "First draft", status: "draft" }],
      trigger: { kind: "http", summary: "POST /v1/workflows/treasury-note-digest/runs" },
      steps: [
        st("s1", "trigger", "Notes uploaded", { source: "http", auth: "api-key" }, "s2"),
        st("s2", "function", "Summarise on in-house model", { function: "local-summarise", model: "llama-3.3-70b", timeoutS: 30 }, "s3"),
        st("s3", "output", "Digest filed", { emit: "treasury.digest.ready" }, null),
      ],
      policyIds: ["pol-models", "pol-residency", "pol-egress"], maxCostMicros: 5_000, timeoutS: 120, useCase: "Local model inference", updatedAt: iso(anchor - 2 * DAY),
    },
  ];
}

// ---------------------------------------------------------------------------------------------- detail on demand

/** Timeline and log lines for one execution. Pure function of the record, so it always agrees with it. */
export function executionDetail(e: FnExecution, state: FunctionsState): ExecDetail {
  const R = rng("detail:" + e.id);
  const fn = state.functions.find((f) => f.id === e.fnId);
  const steps: ExecStep[] = []; const logs: LogLine[] = [];
  let t = 0;
  const push = (s: Omit<ExecStep, "id" | "startMs">, level?: LogLine["level"], msg?: string, source: LogLine["source"] = "platform") => {
    steps.push({ ...s, id: `${e.id}-${steps.length + 1}`, startMs: t });
    if (msg) logs.push({ tMs: t, level: level ?? "info", source, message: msg });
    t += s.durationMs;
  };
  const via = e.trigger === "http" ? "HTTP request" : e.trigger === "kafka" ? "Kafka record" : "Schedule tick";
  push({ name: "Trigger accepted", kind: "trigger", status: e.status === "throttled" ? "blocked" : "succeeded", durationMs: R.int(2, 6), detail: `${via} received${e.idempotencyKey ? `, idempotency key ${e.idempotencyKey}` : ""}` }, "info", `${via} accepted, correlation ${e.correlationId}`);
  if (e.status === "throttled") { push({ name: "Rate limit", kind: "policy", status: "blocked", durationMs: e.durationMs - t, detail: e.error?.message ?? "" }, "warn", "Rejected by burst protection", "gateway"); return { steps, logs }; }
  push({ name: "Validate request", kind: "validate", status: "succeeded", durationMs: R.int(1, 4), detail: "Body matches the function input schema" }, "debug", "Input validated against schema");
  const pre = Math.min(R.int(3, 9), Math.max(2, e.durationMs - t));
  if (e.policy.result === "deny") {
    push({ name: "Evaluate policy", kind: "policy", status: "blocked", durationMs: pre, detail: `${e.policy.policyId}: ${e.policy.reason}` }, "error", `Denied by ${e.policy.policyId}: ${e.policy.reason}`, "gateway");
    logs.push({ tMs: t, level: "info", source: "platform", message: "Invocation ended before the handler ran. No model call was made." });
    return { steps, logs };
  }
  push({ name: "Evaluate policy", kind: "policy", status: "succeeded", durationMs: pre, detail: `${fn?.governance.policyIds.length ?? 0} policies evaluated, all allow` }, "info", "Policies evaluated: allow", "gateway");
  if (e.coldStart) push({ name: "Cold start", kind: "function", status: "succeeded", durationMs: R.int(180, 600), detail: "New instance started" }, "info", "Cold start, new instance");
  const handlerStart = t;
  const remaining = Math.max(e.durationMs - t - 4, 10);
  const aiMs = e.model ? Math.round(remaining * 0.72) : 0;
  const preMs = Math.round((remaining - aiMs) * 0.35);
  const postMs = remaining - aiMs - preMs;
  push({ name: fn?.kind === "lambda-proxy" ? "Invoke AWS Lambda" : "Run handler", kind: fn?.kind === "lambda-proxy" ? "connector" : "function", status: e.status === "failed" && !e.model ? "failed" : "succeeded", durationMs: preMs, detail: fn?.kind === "lambda-proxy" ? `${fn.lambda?.arn}:${fn.lambda?.qualifier}` : `${fn?.runtime}, revision ${e.revision}, ${e.memoryUsedMb} MB used` }, "debug", "Handler started", "function");
  if (e.model) {
    const aiStatus: ExecStep["status"] = e.status === "failed" ? "failed" : e.status === "timeout" ? "running" : "succeeded";
    push({ name: `Call ${state.models.find((m) => m.id === e.model)?.name ?? e.model}`, kind: "ai", status: aiStatus, durationMs: aiMs, detail: `${state.providers.find((p) => p.id === e.provider)?.name} through the gateway`, model: e.model, provider: e.provider, tokensIn: e.tokensIn, tokensOut: e.tokensOut, costMicros: e.costMicros },
      e.status === "succeeded" ? "info" : "error", e.status === "succeeded" ? `Model call ok, ${e.tokensIn} in, ${e.tokensOut} out` : `Model call ${e.status}: ${e.error?.message}`, "gateway");
  }
  if (e.status === "succeeded") {
    push({ name: "Build response", kind: "output", status: "succeeded", durationMs: Math.max(postMs, 1), detail: e.trigger === "http" ? `HTTP ${e.httpStatus}` : "Result emitted" }, "info", "Handler returned a result", "function");
  } else {
    push({ name: e.status === "timeout" ? "Stopped at limit" : "Handler error", kind: "output", status: "failed", durationMs: Math.max(postMs, 1), detail: e.error?.message ?? "" }, "error", `${e.error?.code}: ${e.error?.message}`, "function");
    if (e.attempt > 1) logs.push({ tMs: t, level: "warn", source: "platform", message: `Attempt ${e.attempt} of ${fn?.governance.retries.max ?? 3}, record sent to the dead-letter topic after the last attempt` });
  }
  void handlerStart;
  return { steps, logs };
}

// ---------------------------------------------------------------------------------------------- aggregation helpers

export type Filter = { sinceMs: number; tenantId: string; appId: string; runtime: string; status: string };

export function inWindow(iso: string, anchorIso: string, sinceMs: number) {
  const t = new Date(iso).getTime();
  return t >= new Date(anchorIso).getTime() - sinceMs;
}

export function sumUsage(events: UsageEvent[]) {
  return events.reduce((a, e) => ({ calls: a.calls + 1, tokensIn: a.tokensIn + e.tokensIn, tokensOut: a.tokensOut + e.tokensOut, costMicros: a.costMicros + e.costMicros }), { calls: 0, tokensIn: 0, tokensOut: 0, costMicros: 0 });
}

export function groupUsage<K extends string>(events: UsageEvent[], key: (e: UsageEvent) => K) {
  const m = new Map<K, UsageEvent[]>();
  for (const e of events) { const k = key(e); (m.get(k) ?? m.set(k, []).get(k)!).push(e); }
  return [...m.entries()].map(([k, v]) => ({ key: k, ...sumUsage(v) })).sort((a, b) => b.costMicros - a.costMicros);
}

export const modelName = (id?: string) => (id ? modelById(id)?.name ?? id : "none");
