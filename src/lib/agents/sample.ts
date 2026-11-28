import type { Agent, ControlLevel, ToolGrant, Workflow, WorkflowRun } from "./types";
import { defaultMemory, layerFor, type MemoryKind } from "./memory";
import { defaultAutoscale, defaultExecution, defaultHuman, defaultOnDemand, defaultStreaming, type Execution } from "./execution";
import { SAMPLE_CHANNEL as CH } from "@/lib/notifications/client";
import { mk, notifyGrant, type Binding } from "./connectors";
import { DEFAULT_ACCESS, sha256Hex, type Access, type ApiKey, type Interface } from "./access";

/** A small seeded generator, so the sample workspace is the same on every load and the figures on every screen agree. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const DAY = 86_400_000;

type Seed = {
  id: string; name: string; title: string; description: string; owner: string; department: string; framework: string; runtime: Agent["runtime"]; control: ControlLevel;
  risk: Agent["risk"]; env?: Agent["environment"]; version: string; models: string[]; tools: ToolGrant[]; capabilities: string[]; origin?: Agent["origin"];
  monthly: number; perDay: number; failRate: number; costPer: number; p95: number; ageDays: number; state?: Agent["state"]; spendShare?: number; endpoint?: string;
};
const t = (server: string, tool: string, sensitive = false, approval = false): ToolGrant => ({ server, tool, sensitive, approval });

const SEEDS: Seed[] = [
  { id: "agt_01", name: "support-triage", title: "Support triage", description: "Classifies incoming support requests and drafts a reply for a person to review.", owner: "support-engineering", department: "Customer Support", framework: "langgraph", runtime: "kubernetes", control: "governed", risk: "low", version: "1.4.0", models: ["gpt-5", "gpt-5-mini"], tools: [t("helpdesk", "search_tickets"), t("helpdesk", "get_ticket")], capabilities: ["support.triage"], origin: "forge", monthly: 600, perDay: 410, failRate: 0.012, costPer: 0.021, p95: 4200, ageDays: 120 },
  { id: "agt_02", name: "refund-approver", title: "Refund assistant", description: "Prepares refund decisions against the policy. A person approves every payout.", owner: "payments-ops", department: "Finance", framework: "openai-agents", runtime: "cloud", control: "governed", risk: "high", version: "0.9.2", models: ["gpt-5"], tools: [t("billing", "get_invoice"), t("billing", "issue_refund", true, true), t("crm", "get_customer")], capabilities: ["finance.refund.prepare"], origin: "forge", monthly: 300, perDay: 88, failRate: 0.034, costPer: 0.09, p95: 7800, ageDays: 64, spendShare: 0.96 },
  { id: "agt_03", name: "contract-reviewer", title: "Contract reviewer", description: "Reads a contract, lists unusual clauses and cites the page for each.", owner: "legal-ops", department: "Legal", framework: "llamaindex", runtime: "kubernetes", control: "governed", risk: "high", version: "2.1.0", models: ["claude-sonnet-5-5"], tools: [t("docs", "read_document"), t("docs", "search_clauses")], capabilities: ["legal.contract.review"], origin: "forge", monthly: 900, perDay: 46, failRate: 0.02, costPer: 0.62, p95: 31000, ageDays: 201 },
  { id: "agt_04", name: "code-review-bot", title: "Code review assistant", description: "Comments on pull requests with style, test and security notes.", owner: "platform-engineering", department: "Engineering", framework: "pydantic-ai", runtime: "kubernetes", control: "governed", risk: "medium", version: "3.0.1", models: ["gpt-5-mini"], tools: [t("github", "get_pull_request"), t("github", "comment_on_pull_request", false, false), t("github", "merge_pull_request", true, true)], capabilities: ["eng.code.review"], origin: "forge", monthly: 450, perDay: 230, failRate: 0.045, costPer: 0.038, p95: 12000, ageDays: 88 },
  { id: "agt_05", name: "invoice-matcher", title: "Invoice matcher", description: "Matches supplier invoices to purchase orders and flags differences.", owner: "finance-systems", department: "Finance", framework: "crewai", runtime: "cloud", control: "governed", risk: "medium", version: "1.2.3", models: ["gpt-5-mini"], tools: [t("erp", "get_purchase_order"), t("erp", "post_match", true, true)], capabilities: ["finance.invoice.match"], origin: "forge", monthly: 250, perDay: 150, failRate: 0.061, costPer: 0.029, p95: 9100, ageDays: 40 },
  { id: "agt_06", name: "sales-researcher", title: "Account researcher", description: "Builds a one page brief on a company before a sales call.", owner: "revenue-operations", department: "Sales", framework: "mastra", runtime: "cloud", control: "governed", risk: "low", version: "0.6.0", models: ["gpt-5-mini"], tools: [t("crm", "get_account"), t("web", "fetch_page")], capabilities: ["sales.account.brief"], origin: "forge", monthly: 150, perDay: 70, failRate: 0.015, costPer: 0.055, p95: 15000, ageDays: 22 },
  { id: "agt_07", name: "onboarding-guide", title: "Onboarding guide", description: "Answers new starters' questions from the handbook and opens the right forms.", owner: "people-operations", department: "People", framework: "vercel-ai", runtime: "cloud", control: "governed", risk: "low", version: "1.0.4", models: ["gpt-5-mini"], tools: [t("handbook", "search"), t("hr", "open_form")], capabilities: ["people.onboarding.help"], origin: "forge", monthly: 80, perDay: 38, failRate: 0.008, costPer: 0.012, p95: 3100, ageDays: 150 },
  { id: "agt_08", name: "agentforce-service", title: "Service agent on Agentforce", description: "Handles first line service cases inside Salesforce.", owner: "customer-success", department: "Customer Support", framework: "agentforce", runtime: "external", control: "observed", risk: "medium", version: "7", models: ["vendor managed"], tools: [t("salesforce", "update_case", true, false)], capabilities: ["support.case.handle"], origin: "registered", monthly: 700, perDay: 320, failRate: 0.05, costPer: 0.08, p95: 6000, ageDays: 300, endpoint: "https://acme.my.salesforce.com" },
  { id: "agt_09", name: "bedrock-claims", title: "Claims intake", description: "Collects claim details and checks them for completeness.", owner: "claims-technology", department: "Operations", framework: "bedrock-agents", runtime: "external", control: "observed", risk: "high", version: "12", models: ["anthropic.claude-sonnet"], tools: [t("claims", "create_claim", true, false), t("claims", "get_policy")], capabilities: ["ops.claims.intake"], origin: "registered", monthly: 1200, perDay: 190, failRate: 0.028, costPer: 0.21, p95: 18000, ageDays: 180, endpoint: "arn:aws:bedrock:eu-west-1:000000000000:agent/CLAIMS" },
  { id: "agt_10", name: "copilot-helpdesk", title: "IT helpdesk copilot", description: "Resets passwords and answers IT questions in Teams.", owner: "it-service-desk", department: "IT", framework: "copilot-studio", runtime: "external", control: "inventory", risk: "medium", version: "4", models: ["vendor managed"], tools: [t("entra", "reset_password", true, false)], capabilities: ["it.helpdesk"], origin: "registered", monthly: 0, perDay: 0, failRate: 0, costPer: 0, p95: 0, ageDays: 260, endpoint: "https://copilotstudio.microsoft.com" },
  { id: "agt_11", name: "dify-faq", title: "Public FAQ assistant", description: "Answers product questions on the public website.", owner: "marketing-web", department: "Marketing", framework: "dify", runtime: "external", control: "inventory", risk: "low", version: "2", models: ["unknown"], tools: [], capabilities: ["marketing.faq"], origin: "registered", monthly: 0, perDay: 0, failRate: 0, costPer: 0, p95: 0, ageDays: 95, endpoint: "https://dify.acme.test" },
  { id: "agt_12", name: "data-quality-watch", title: "Data quality watcher", description: "Reads Refinery run reports and writes a plain summary of what changed.", owner: "data-platform", department: "Engineering", framework: "tokener-native", runtime: "kubernetes", control: "governed", risk: "low", version: "1.1.0", models: ["gpt-5-mini"], tools: [t("refinery", "list_runs"), t("refinery", "get_report")], capabilities: ["data.quality.summarise"], origin: "forge", monthly: 60, perDay: 24, failRate: 0.004, costPer: 0.009, p95: 2600, ageDays: 33 },
  { id: "agt_13", name: "pricing-analyst", title: "Pricing analyst", description: "Compares competitor prices and suggests changes.", owner: "revenue-operations", department: "Sales", framework: "autogen", runtime: "cloud", control: "governed", risk: "medium", version: "0.3.0", models: ["gpt-5"], tools: [t("web", "fetch_page"), t("pricing", "update_price", true, true)], capabilities: ["sales.pricing.analyse"], origin: "forge", monthly: 200, perDay: 18, failRate: 0.11, costPer: 0.3, p95: 42000, ageDays: 14, state: "suspended" },
  { id: "agt_14", name: "legacy-faq-bot", title: "Legacy FAQ bot", description: "Replaced by the onboarding guide.", owner: "people-operations", department: "People", framework: "langchain-agent", runtime: "cloud", control: "governed", risk: "low", version: "0.8.0", models: ["gpt-5-mini"], tools: [], capabilities: ["people.faq"], origin: "forge", monthly: 40, perDay: 0, failRate: 0, costPer: 0, p95: 0, ageDays: 400, state: "retired" },
  { id: "agt_15", name: "claims-document-processor", title: "Claims document processor", description: "Reads a claim pack, checks it against the policy and the claims guidelines, and prepares a decision for an adjuster to approve.", owner: "claims-technology", department: "Operations", framework: "llamaindex", runtime: "kubernetes", control: "governed", risk: "high", version: "1.3.0", models: ["claude-sonnet-5-5"], tools: [t("claims-docs", "read_document"), t("claims-docs", "extract_fields"), t("claims", "get_policy"), t("claims", "add_claim_note"), t("claims", "approve_payout", true, true)], capabilities: ["ops.claims.process", "ops.claims.extract"], origin: "forge", monthly: 800, perDay: 62, failRate: 0.02, costPer: 0.35, p95: 24000, ageDays: 75 },
];

/** Which project in Tenant Management each sample agent belongs to. */
const PROJECT: Record<string, string> = { agt_01: "support-ml", agt_07: "people-assistant", agt_09: "claims-ops", agt_15: "claims-ops" };

/** What each sample agent may use from the organisation. Triggers, streams and approval channels are not listed here: they follow from how the agent starts and who decides. */
const BINDINGS: Record<string, Binding[]> = {
  agt_01: [mk("knowledge", "support-articles", "knowledge", undefined, "Answers from the help centre"), mk("channel", CH.supportLeads, "notify", "notify_channel", "Tells the leads about urgent tickets")],
  agt_02: [mk("knowledge", "support-articles", "knowledge", undefined, "Checks the refund policy"), mk("connection", "conn-prod-email", "notify", "send_email", "Sends the customer their decision")],
  agt_05: [mk("channel", CH.financeEmail, "notify", "notify_channel", "Reports the nightly match")],
  agt_07: [mk("knowledge", "hr-policies", "knowledge", undefined, "Answers from the handbook")],
  agt_12: [mk("channel", CH.platformAlerts, "notify", "notify_channel", "Posts the summary of a failed run")],
  agt_15: [mk("knowledge", "claims-guidelines", "knowledge", undefined, "Checks limits and cover wording"), mk("channel", CH.claimsDesk, "notify", "notify_channel", "Tells the desk when a pack is ready"), mk("connection", "conn-prod-email", "notify", "send_email", "Writes to the claimant"), mk("connection", "conn-prod-sms", "notify", "send_sms", "Texts the claimant when a decision is made")],
};
const NOTIFY_SAMPLE: Record<string, string[]> = { agt_01: ["notify_channel"], agt_02: ["request_approval", "send_email"], agt_03: ["request_approval"], agt_04: ["request_approval"], agt_05: ["notify_channel"], agt_12: ["notify_channel"], agt_13: ["request_approval"], agt_15: ["request_approval", "notify_channel", "send_email", "send_sms"] };

/** Which sample agents keep memory, and which layers. */
const MEMORY_SAMPLE: Record<string, MemoryKind[]> = {
  agt_01: ["working", "conversation", "episodic", "entity"], agt_02: ["working", "conversation", "semantic", "procedural"], agt_03: ["working", "semantic"],
  agt_06: ["working", "semantic", "entity"], agt_07: ["conversation", "semantic"], agt_13: ["working"], agt_05: ["working", "entity"],
};
function sampleMemory(name: string, kinds: MemoryKind[]) {
  const m = defaultMemory(name, kinds);
  m.layers = m.layers.map((l) => (l.kind === "episodic" && l.enabled ? layerFor("episodic", { retentionDays: 90, write: "approval" }) : l.kind === "procedural" && l.enabled ? layerFor("procedural", { write: "approval" }) : l));
  m.tools.forget = kinds.includes("episodic") || kinds.includes("procedural");
  return m;
}

/** How each sample agent runs and what starts it. Together they show every runtime and every mode. */
function sampleExecution(id: string): Execution | undefined {
  const sch = (name: string, cron: string, input: string, tz = "Europe/London") => ({ id: `sch_${id}_${name.toLowerCase().replace(/\W+/g, "")}`, name, cron, timezone: tz, input, overlap: "skip" as const, catchUp: "none" as const, enabled: true });
  const trg = (kind: "webhook" | "topic" | "queue" | "dataset" | "cdc" | "file" | "email", source: string, filter = "", connection?: string) => ({ id: `trg_${id}_${kind}`, kind, source, filter, connection, batchSize: 1 });
  const svc = defaultExecution("service"); const srv = defaultExecution("serverless");
  switch (id) {
    case "agt_01": return { ...svc, scaling: { ...svc.scaling, minReplicas: 2, maxReplicas: 24, autoscale: { ...svc.scaling.autoscale, metric: "requests", target: 15, calendar: [{ id: "cal_support_peak", name: "Weekday peak", cron: "30 8 * * 1-5", timezone: "Europe/London", minReplicas: 6, durationMin: 540 }] } }, modes: { onDemand: { response: "stream", timeoutSec: 90, concurrency: 40 }, event: { triggers: [trg("webhook", "/hooks/helpdesk-ticket"), trg("topic", "support.tickets.created", "priority != 'low'", "conn-prod-kafka")], concurrency: 50, retries: 3, deadLetter: "support.tickets.dlq" }, human: { ...defaultHuman(), when: ["low-confidence"], confidenceBelow: 0.65, assignee: "support-leads", slaMinutes: 30, channels: ["console", CH.supportLeads], escalateTo: "support-managers" } } };
    case "agt_02": return { ...srv, durable: true, scaling: { ...srv.scaling, timeoutSec: 600 }, modes: { onDemand: { response: "task", timeoutSec: 300, concurrency: 10 }, human: { ...defaultHuman(), when: ["sensitive-tool", "cost"], costAboveUsd: 500, assignee: "Payments approvers", slaMinutes: 120, channels: ["console", CH.paymentsApprovals, CH.financeEmail], escalateTo: "finance-leads", onTimeout: "decline" } } };
    case "agt_03": return { ...srv, scaling: { ...srv.scaling, timeoutSec: 900, memoryMb: 2048 }, modes: { onDemand: { response: "task", timeoutSec: 900, concurrency: 8 }, scheduled: { schedules: [sch("New contracts", "0 8 * * 1-5", "Review every contract added since the last run and list unusual clauses.")] }, event: { triggers: [trg("file", "s3://acme-legal/incoming/", "*.pdf", "conn-prod-s3-contracts")], concurrency: 6, retries: 2, deadLetter: "legal.contracts.dlq" }, human: { ...defaultHuman(), when: ["low-confidence"], confidenceBelow: 0.6, assignee: "legal-reviewers", slaMinutes: 240, channels: ["console", CH.legalReviewers], escalateTo: "general-counsel" } } };
    case "agt_04": return { ...srv, modes: { onDemand: { response: "task", timeoutSec: 120, concurrency: 30 }, event: { triggers: [trg("webhook", "/hooks/github-pull-request", "action == 'opened' || action == 'synchronize'")], concurrency: 60, retries: 2, deadLetter: "eng.review.dlq" }, human: { ...defaultHuman(), when: ["sensitive-tool"], assignee: "Code owners", slaMinutes: 480, channels: [CH.codeOwners], escalateTo: "eng-managers" } } };
    case "agt_05": { const b = defaultExecution("batch"); return { ...b, modes: { scheduled: { schedules: [{ ...sch("Nightly match", "30 1 * * *", "Match every invoice received today to its purchase order."), overlap: "queue", catchUp: "latest" }, sch("Month end sweep", "0 5 1 * *", "Re-check all open invoices and report the differences.")] }, onDemand: { response: "task", timeoutSec: 3600, concurrency: 2 } } }; }
    case "agt_06": return { ...srv, modes: { onDemand: { response: "task", timeoutSec: 180, concurrency: 20 }, scheduled: { schedules: [sch("Monday accounts", "0 7 * * 1", "Refresh the brief for every account with a meeting this week.")] } } };
    case "agt_07": return { ...svc, scaling: { ...svc.scaling, minReplicas: 1, maxReplicas: 6, autoscale: { ...svc.scaling.autoscale, mode: "manual", desired: 2 } }, modes: { onDemand: { response: "stream", timeoutSec: 60, concurrency: 60 } } };
    case "agt_12": return { ...defaultExecution("streaming"), scaling: { minReplicas: 1, maxReplicas: 4, concurrency: 4, timeoutSec: 0, memoryMb: 1024, cpu: 1, autoscale: { ...defaultAutoscale("streaming"), target: 45 } }, modes: { event: { triggers: [trg("topic", "refinery.runs.completed", "status == 'failed'", "conn-prod-kafka")], concurrency: 8, retries: 2, deadLetter: "refinery.reports.dlq" }, streaming: { ...defaultStreaming(), source: { kind: "kafka", connection: "conn-prod-kafka", topic: "refinery.run.events" }, consumerGroup: "data-quality-watch", parallelism: 4, window: { kind: "tumbling", sizeSec: 300 }, keyBy: "pipeline_id", checkpointSec: 15, maxLagSec: 120 } } };
    case "agt_15": return { ...srv, durable: true, scaling: { ...srv.scaling, timeoutSec: 900, memoryMb: 2048, maxReplicas: 30, autoscale: { ...srv.scaling.autoscale, target: 6, calendar: [{ id: "cal_claims_morning", name: "Morning intake", cron: "0 8 * * 1-5", timezone: "Europe/London", minReplicas: 2, durationMin: 240 }] } }, modes: { onDemand: { response: "task", timeoutSec: 600, concurrency: 6 }, event: { triggers: [trg("file", "s3://nexi-claims/inbox/", "*.pdf", "conn-prod-s3-claims")], concurrency: 12, retries: 2, deadLetter: "claims.inbox.dlq" }, human: { ...defaultHuman(), when: ["sensitive-tool", "low-confidence"], confidenceBelow: 0.75, assignee: "Claims adjusters", slaMinutes: 240, channels: ["console", CH.claimsDesk, CH.claimsAdjusters], escalateTo: "claims-managers", onTimeout: "escalate" } } };
    case "agt_13": return { ...srv, modes: { onDemand: { response: "task", timeoutSec: 600, concurrency: 4 }, scheduled: { schedules: [{ ...sch("Hourly prices", "0 * * * *", "Compare the top fifty competitor prices and propose changes.", "UTC"), enabled: false }] }, human: { ...defaultHuman(), when: ["always"], assignee: "Pricing managers", slaMinutes: 60, channels: ["console", CH.pricingManagers], escalateTo: "revenue-leads" } } };
    case "agt_14": return { ...srv, scaling: { ...srv.scaling, maxReplicas: 1 }, modes: { onDemand: defaultOnDemand() } };
    case "agt_08": case "agt_09": case "agt_10": case "agt_11": return defaultExecution("external");
    default: return undefined;
  }
}

export function sampleAgents(now = Date.now()): { agents: Agent[] } {
  const agents: Agent[] = [];
  SEEDS.forEach((s, idx) => {
    const r = rng(1000 + idx * 31);
    const reported = s.control !== "inventory";
    const daily = Array.from({ length: 30 }, (_, d) => {
      const active = s.state === "retired" ? d < 10 : s.state === "suspended" ? d < 24 : true;
      const wave = 0.85 + 0.3 * Math.sin((d + idx) / 3.2) + (r() - 0.5) * 0.2;
      const executions = reported && active && s.perDay ? Math.max(0, Math.round(s.perDay * wave)) : 0;
      const failures = Math.round(executions * s.failRate * (0.6 + r() * 0.8));
      const costUsd = Math.round(executions * s.costPer * (0.9 + r() * 0.2) * 100) / 100;
      return { executions, failures, costUsd, tokens: Math.round(costUsd / 0.0000075) };
    });
    const month = daily.slice(-30).reduce((x, d) => x + d.costUsd, 0);
    const spent = s.spendShare ? Math.round(s.monthly * s.spendShare) : Math.min(Math.round(month * 0.8), Math.round(s.monthly * 0.85));
    const a: Agent = {
      id: s.id, name: s.name, title: s.title, description: s.description, owner: s.owner, department: s.department, framework: s.framework, runtime: s.runtime,
      environment: s.env ?? "production", risk: s.risk, version: s.version, state: s.state ?? "active", control: s.control, origin: s.origin ?? "registered",
      models: s.models, tools: s.tools, capabilities: s.capabilities, budget: { monthlyUsd: s.monthly, spentUsd: reported ? spent : 0 }, daily, p95Ms: s.p95,
      lastSeen: new Date(now - (s.state === "retired" ? 30 * DAY : s.state === "suspended" ? 6 * DAY : reported ? Math.floor(r() * 3_000_000) : 40 * DAY)).toISOString(),
      createdAt: new Date(now - s.ageDays * DAY).toISOString(),
      versions: [{ version: s.version, at: new Date(now - Math.min(s.ageDays, 12) * DAY).toISOString(), note: "Current" }, ...(s.ageDays > 30 ? [{ version: "previous", at: new Date(now - Math.min(s.ageDays, 70) * DAY).toISOString(), note: "Earlier release" }] : [])],
      endpoint: s.endpoint,
    };
    agents.push(a);
    const exec = sampleExecution(s.id); if (exec) a.execution = exec;
    if (PROJECT[s.id]) a.project = PROJECT[s.id];
    if (BINDINGS[s.id]) a.bindings = BINDINGS[s.id];
    for (const tool of NOTIFY_SAMPLE[s.id] ?? []) a.tools.push(notifyGrant(tool));
    const mem = MEMORY_SAMPLE[s.id];
    if (mem) a.memory = sampleMemory(s.name, mem);
  });
  return { agents };
}

export function sampleWorkflows(now = Date.now()): Workflow[] {
  const r = rng(77);
  const mk = (id: string, name: string, description: string, pattern: Workflow["pattern"], agents: string[], timeoutSec: number, budgetUsd: number, owner: string, age: number): Workflow => ({
    id, name, description, pattern, agents, timeoutSec, budgetUsd, owner, createdAt: new Date(now - age * DAY).toISOString(),
    runs: Array.from({ length: 6 }, (_, i) => {
      const steps: WorkflowRun["steps"] = agents.map((agentId) => ({ agentId, durMs: Math.round(2000 + r() * 9000), costUsd: Math.round((0.02 + r() * 0.3) * 100) / 100, status: "ok" }));
      const failed = i === 2;
      if (failed) steps[steps.length - 1].status = "error";
      return { id: `run_${id.slice(-2)}${i}`, startedAt: new Date(now - (i * 5 + 1) * 3_600_000).toISOString(), durationMs: pattern === "parallel" ? Math.max(...steps.map((s) => s.durMs)) : steps.reduce((x, s) => x + s.durMs, 0), costUsd: Math.round(steps.reduce((x, s) => x + s.costUsd, 0) * 100) / 100, status: failed ? "failed" as const : "succeeded" as const, steps };
    }),
  });
  return [
    mk("wf_01", "Refund request", "Triage the request, check the invoice, then prepare the refund for a person to approve.", "sequential", ["agt_01", "agt_05", "agt_02"], 300, 2, "payments-ops", 50),
    mk("wf_02", "New customer brief", "Research the account and the pricing at the same time, then combine.", "parallel", ["agt_06", "agt_13"], 120, 1, "revenue-operations", 20),
    mk("wf_03", "Contract intake", "A supervisor sends each contract to the reviewer and the data watcher as needed.", "supervisor", ["agt_03", "agt_12", "agt_07"], 600, 5, "legal-ops", 9),
  ];
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Topology: who talks to whom, what is reachable from outside, and which policies apply. A link between agents where one end is Inventory is declared
// by an owner, never measured, and the screen says so.

import type { Exposure, Link, Live, Policy } from "./topology";

export function sampleTopology(): { links: Link[]; exposures: Exposure[]; policies: Policy[]; live: Record<string, Live> } {
  const L = (id: string, from: string, to: string, protocol: Link["protocol"], purpose: string, messages24h: number, p95Ms: number, errorRate: number, auth: Link["auth"], measured = true, types?: string[]): Link =>
    ({ id, from, to, protocol, purpose, messages24h, p95Ms, errorRate, auth, measured, types });
  const links: Link[] = [
    L("lnk_01", "agt_08", "agt_01", "a2a", "Hands a case to triage", 1840, 420, 0.004, "jwt", true),
    L("lnk_02", "agt_01", "agt_02", "tap", "Passes a refund request for a decision", 310, 890, 0.011, "jwt", true, ["relay.task.create", "relay.task.result", "relay.task.update"]),
    L("lnk_03", "agt_02", "agt_05", "tap", "Asks for the matching invoice", 290, 1100, 0.021, "jwt", true, ["relay.task.create", "relay.task.result"]),
    L("lnk_04", "agt_11", "agt_01", "https", "Escalates a question from the public site", 260, 380, 0.03, "token", false),
    L("lnk_05", "agt_09", "agt_15", "a2a", "Sends a claim pack for processing", 120, 4900, 0.017, "mtls", true),
    L("lnk_06", "agt_06", "agt_13", "a2a", "Asks for pricing on an account", 64, 2900, 0.04, "jwt", true),
    L("lnk_07", "agt_13", "agt_06", "mcp", "Reads the account brief as a tool", 52, 900, 0.01, "jwt", true),
    L("lnk_08", "agt_07", "agt_10", "queue", "Publishes new starter access requests", 38, 150, 0, "token", false),
    L("lnk_09", "agt_12", "agt_04", "queue", "Publishes failed data quality checks", 41, 90, 0, "token", true),
    L("lnk_10", "agt_10", "agt_07", "https", "Looks up a handbook answer", 29, 240, 0, "token", false),
    L("lnk_11", "agt_04", "agt_12", "tap", "Asks what changed in a data run", 22, 1300, 0.005, "jwt", true, ["relay.task.create", "relay.task.result"]),
    L("lnk_12", "agt_03", "agt_12", "tap", "Asks what changed in the data feed before a review", 88, 1500, 0.012, "jwt", true, ["relay.task.create", "relay.task.result"]),
    L("lnk_13", "agt_03", "agt_07", "tap", "Looks up a handbook rule for a clause", 61, 980, 0.006, "jwt", true, ["relay.task.create", "relay.task.result"]),
  ];
  const exposures: Exposure[] = [
    { agentId: "agt_01", via: "gateway", url: "https://gateway.acme.example/agents/support-triage", auth: "app-key", requests24h: 9200, access: sampleAccess() },
    { agentId: "agt_08", via: "public-url", url: "https://acme.my.salesforce.com/agentforce", auth: "jwt", requests24h: 7400 },
    { agentId: "agt_11", via: "public-url", url: "https://help.acme.example/ask", auth: "none", requests24h: 3100 },
  ];
  const policies: Policy[] = [
    { id: "pol_01", kind: "data", name: "Mask personal data", detail: "Names, emails and card numbers are masked before a model sees them", scope: { department: "Customer Support" } },
    { id: "pol_02", kind: "approval", name: "Payments need a person", detail: "Any tool that moves money waits for approval", scope: { department: "Finance" } },
    { id: "pol_03", kind: "data", name: "EU data residency", detail: "Prompts and documents stay in the EU region", scope: { agents: ["agt_03", "agt_09"] } },
    { id: "pol_04", kind: "rate", name: "Rate limit", detail: "At most 120 calls a minute", scope: { agents: ["agt_01", "agt_04", "agt_05"] } },
    { id: "pol_05", kind: "egress", name: "Allowed hosts only", detail: "crm.acme.example, www.competitor-prices.example", scope: { agents: ["agt_06", "agt_13"] } },
    { id: "pol_06", kind: "rate", name: "Rate limit", detail: "At most 30 calls a minute", scope: { agents: ["agt_02"] } },
  ];
  const live: Record<string, Live> = {
    agt_01: { running: 6, queued: 2, pendingApprovals: 0 }, agt_02: { running: 1, queued: 0, pendingApprovals: 3 }, agt_03: { running: 2, queued: 0, pendingApprovals: 0 },
    agt_04: { running: 3, queued: 1, pendingApprovals: 1 }, agt_05: { running: 2, queued: 1, pendingApprovals: 2 }, agt_06: { running: 1, queued: 0, pendingApprovals: 0 },
    agt_07: { running: 0, queued: 0, pendingApprovals: 0 }, agt_08: { running: 5, queued: 0, pendingApprovals: 0 }, agt_09: { running: 2, queued: 0, pendingApprovals: 0 },
    agt_15: { running: 2, queued: 0, pendingApprovals: 3 }, agt_12: { running: 0, queued: 0, pendingApprovals: 0 }, agt_13: { running: 0, queued: 0, pendingApprovals: 0 },
  };
  return { links, exposures, policies, live };
}

/** The key a visitor can paste into the "try a call" panel. It exists only in the sample workspace and opens nothing. */
export const SAMPLE_KEY = "tok_ak_test_SampleKeyForTheTryPanelOnly0000000000";

function sampleAccess(): Access {
  const now = Date.now(); const D = 86_400_000;
  const key = (id: string, name: string, secret: string, scopes: ApiKey["scopes"], env: ApiKey["env"], ageD: number, expD: number | null, usedH: number | null, req: number, status: ApiKey["status"] = "active", extra: Partial<ApiKey> = {}): ApiKey => ({
    id, name, prefix: secret.slice(0, 16), last4: secret.slice(-4), hash: sha256Hex(secret), scopes, env, createdAt: new Date(now - ageD * D).toISOString(), createdBy: "jdoe@example.com",
    expiresAt: expD === null ? null : new Date(now + expD * D).toISOString(), lastUsedAt: usedH === null ? null : new Date(now - usedH * 3_600_000).toISOString(), requests30d: req, status,
    ...(status === "revoked" ? { revokedAt: new Date(now - 20 * D).toISOString() } : {}), ...extra,
  });
  return {
    ...DEFAULT_ACCESS(new Date(now - 60 * D).toISOString()), interfaces: ["rest", "openai", "relay"] as Interface[], rateLimitPerMin: 600, maxCostPerRequestUsd: 0.5, allowedOrigins: ["https://shop.acme.example"], acceptServiceTokens: true,
    signing: { required: false, ref: "secretref://vault/agents/support-triage/signing", algorithm: "hmac-sha256" as const, toleranceSec: 300, createdAt: new Date(now - 45 * D).toISOString(), last4: "9Qx2" },
    keys: [
      key("key_s1", "storefront-production", "tok_ak_live_7Hq2m4Kd8nRtVw1Yz6Pc3LsXb5Ue9GaJf0AoWi", ["invoke", "stream", "feedback"], "live", 52, 120, 0.2, 8210, "active", { rateLimitPerMin: 400 }),
      key("key_s2", "partner-sandbox", SAMPLE_KEY, ["invoke"], "test", 18, 12, 30, 640),
      key("key_s3", "nightly-backfill", "tok_ak_live_Zp4Rk9Ws2Td7Nm1Qx6Bv3Hc5Yu8LfEa0JgKoTi", ["invoke", "tasks"], "live", 90, 4, 21, 1180),
      key("key_s4", "old-batch-job", "tok_ak_live_Ab3Cd5Ef7Gh9Ij1Kl2Mn4Op6Qr8St0UvWxYz12", ["invoke"], "live", 200, null, null, 0, "revoked"),
    ],
  };
}
