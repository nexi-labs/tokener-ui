import type { Agent, Span, Trace } from "./types";
import { buildTrace } from "./sample-traces";
import { csvLine } from "./export";
import { rng } from "./sample";
import { hash32, percentile } from "./observe";

/**
 * Evaluations. A suite is a set of cases and scorers for one agent. A run sends every case through the agent, so each case produces a real trace
 * (kind "eval") with the scorers recorded as spans after the agent's own work. That is what lets a failed case be opened as a trace, compared with
 * the same case in the previous run, and exported with everything else.
 */

export type ScorerKind = "exact" | "contains" | "judge" | "tool-calls" | "grounded" | "safety" | "latency" | "cost";
export type Scorer = { id: string; label: string; kind: ScorerKind; /** The score a case needs on this scorer, from 0 to 1. For latency and cost this is the limit in ms or dollars. */ threshold: number; weight: number; detail: string };
export type EvalCase = { id: string; input: string; expected: string; wrong: string; tags: string[] };
export type EvalSuite = { id: string; agentId: string; name: string; description: string; scorers: Scorer[]; cases: EvalCase[]; createdAt: string };
export type CaseResult = { caseId: string; output: string; scores: Record<string, number>; failed: string[]; pass: boolean; traceId: string; durMs: number; costUsd: number; tokens: number; reason?: string };
export type EvalRun = {
  id: string; suiteId: string; agentId: string; agentVersion: string; startedAt: string; durationMs: number; trigger: "manual" | "schedule" | "deploy-gate" | "cli";
  status: "passed" | "failed"; passRate: number; meanScore: number; scorerMeans: Record<string, number>; costUsd: number; p95Ms: number; correlationId: string; results: CaseResult[];
};

export const SCORER_KINDS: { id: ScorerKind; label: string; help: string; unit: "score" | "ms" | "usd" }[] = [
  { id: "exact", label: "Exact match", help: "The answer equals the expected one.", unit: "score" },
  { id: "contains", label: "Contains", help: "The answer includes the expected text.", unit: "score" },
  { id: "judge", label: "Model judge", help: "A second model grades the answer against a rubric, from 0 to 1.", unit: "score" },
  { id: "tool-calls", label: "Tool use", help: "The agent called the right tools, and none it should not have.", unit: "score" },
  { id: "grounded", label: "Grounded in sources", help: "Every claim points to a passage it came from.", unit: "score" },
  { id: "safety", label: "Safety", help: "No personal data or secret appears in the answer.", unit: "score" },
  { id: "latency", label: "Time limit", help: "The run finishes within the limit, in milliseconds.", unit: "ms" },
  { id: "cost", label: "Cost limit", help: "The run costs no more than the limit, in US dollars.", unit: "usd" },
];
export const SCORER_BY_KIND = Object.fromEntries(SCORER_KINDS.map((k) => [k.id, k])) as Record<ScorerKind, (typeof SCORER_KINDS)[number]>;

const C = (id: string, input: string, expected: string, wrong: string, tags: string[] = []): EvalCase => ({ id, input, expected, wrong, tags });
const S = (id: string, label: string, kind: ScorerKind, threshold: number, weight: number, detail: string): Scorer => ({ id, label, kind, threshold, weight, detail });

type SuiteSeed = Omit<EvalSuite, "createdAt">;
export const SAMPLE_SUITES: SuiteSeed[] = [
  {
    id: "evs_01", agentId: "agt_01", name: "Ticket routing", description: "Each ticket is given the right queue and a reply a person could send.",
    scorers: [S("label", "Right queue", "exact", 1, 3, "The queue label equals the expected one."), S("tone", "Reply tone", "judge", 0.7, 2, "Polite, specific, no promises the agent cannot keep."), S("pii", "No personal data", "safety", 1, 2, "No card number or full address in the draft."), S("time", "Under 8 seconds", "latency", 8000, 1, "End to end."), S("cost", "Under 3 cents", "cost", 0.03, 1, "Model and tool cost.")],
    cases: [
      C("c01", "My card was charged twice for order 4411.", "billing.duplicate_charge", "billing.account", ["billing"]), C("c02", "The app crashes when I upload a PDF.", "bug.upload", "bug.data", ["bug"]),
      C("c03", "How do I change my invoice address?", "billing.account", "billing.currency", ["billing"]), C("c04", "I want to cancel my subscription.", "retention.cancel", "billing.account", ["retention"]),
      C("c05", "Where is my parcel? I ordered it nine days ago.", "shipping.delay", "shipping.address", ["shipping"]), C("c06", "Please delete all the data you hold about me.", "privacy.erasure", "privacy.access", ["privacy"]),
      C("c07", "Your agent on the phone was rude to me.", "complaint.conduct", "complaint.product", ["complaint"]), C("c08", "Do you support single sign-on with Okta?", "sales.security", "sales.pricing", ["sales"]),
      C("c09", "Refund me now or I call my lawyer.", "refund.escalated", "refund.standard", ["refund", "escalation"]), C("c10", "The password reset email never arrives.", "access.reset", "access.lockout", ["access"]),
      C("c11", "Can I get my invoice in euros?", "billing.currency", "billing.account", ["billing"]), C("c12", "The export is missing last week's rows.", "bug.data", "bug.upload", ["bug"]),
    ],
  },
  {
    id: "evs_02", agentId: "agt_02", name: "Refund decisions", description: "The agent prepares the right decision and never issues a payout on its own.",
    scorers: [S("decision", "Right decision", "exact", 1, 3, "approve, decline or escalate, as the policy says."), S("tools", "Tool use", "tool-calls", 1, 3, "Calls prepare_refund. Never calls issue_refund without approval."), S("why", "Explains the rule", "judge", 0.75, 2, "Names the policy clause that decided it."), S("cost", "Under 5 cents", "cost", 0.05, 1, "Model and tool cost.")],
    cases: [
      C("c01", "Order 1180, delivered late, 42 dollars.", "approve", "decline", ["late"]), C("c02", "Order 2204, item used for six weeks, 310 dollars.", "decline", "approve", ["used"]),
      C("c03", "Order 3031, 1,450 dollars, customer disputes quality.", "escalate", "approve", ["large"]), C("c04", "Order 4410, duplicate charge confirmed by payments.", "approve", "escalate", ["duplicate"]),
      C("c05", "Order 5521, outside the 30 day window by one day.", "escalate", "decline", ["window"]), C("c06", "Order 6098, digital item already downloaded.", "decline", "approve", ["digital"]),
      C("c07", "Order 7012, wrong item sent, 85 dollars.", "approve", "escalate", ["wrong-item"]), C("c08", "Order 8800, fraud suspected by the customer.", "escalate", "approve", ["fraud"]),
    ],
  },
  {
    id: "evs_03", agentId: "agt_03", name: "Clause extraction", description: "Unusual clauses are found and each one cites its page.",
    scorers: [S("found", "Finds the clause", "contains", 1, 3, "The clause type appears in the answer."), S("cite", "Cites the page", "grounded", 0.9, 3, "Each clause points to the page it came from."), S("pii", "No personal data", "safety", 1, 1, "Signatory details stay masked."), S("time", "Under 20 seconds", "latency", 20000, 1, "End to end.")],
    cases: [
      C("c01", "Find any unlimited liability clause in contract A-118.", "unlimited liability, page 14", "no unusual clauses", ["liability"]), C("c02", "Find auto-renewal terms in contract B-007.", "auto-renewal, page 3", "no unusual clauses", ["renewal"]),
      C("c03", "Does contract C-221 allow assignment without consent?", "assignment, page 9", "assignment is not mentioned", ["assignment"]), C("c04", "Find the governing law in contract D-054.", "governing law, page 22", "governing law is not stated", ["law"]),
      C("c05", "List termination for convenience rights in E-310.", "termination for convenience, page 11", "no unusual clauses", ["termination"]), C("c06", "Find exclusivity terms in F-402.", "exclusivity, page 6", "no unusual clauses", ["exclusivity"]),
    ],
  },
  {
    id: "evs_04", agentId: "agt_05", name: "Invoice matching", description: "Each invoice is matched to the right purchase order, and differences are named.",
    scorers: [S("po", "Right purchase order", "exact", 1, 4, "The PO number equals the expected one."), S("diff", "Names the difference", "judge", 0.7, 2, "Says what differs: price, quantity or tax."), S("time", "Under 6 seconds", "latency", 6000, 1, "End to end.")],
    cases: [
      C("c01", "Invoice INV-9011 from Northwind, 12 units.", "PO-5521", "PO-5530", ["match"]), C("c02", "Invoice INV-9012 from Contoso, unit price up 4 percent.", "PO-5498, price differs", "PO-5498", ["price"]),
      C("c03", "Invoice INV-9013 from Fabrikam, 9 of 10 units.", "PO-5502, quantity differs", "PO-5502", ["quantity"]), C("c04", "Invoice INV-9014 from Tailspin, no PO on the page.", "no match", "PO-5510", ["no-po"]),
      C("c05", "Invoice INV-9015 from Northwind, tax added twice.", "PO-5521, tax differs", "PO-5521", ["tax"]), C("c06", "Invoice INV-9016 from Contoso, matches in full.", "PO-5498", "PO-5499", ["match"]),
    ],
  },
];

const FAIL_REASONS: Record<ScorerKind, string[]> = {
  exact: ["Gave a nearby label, not the expected one.", "Picked the generic queue."], contains: ["The clause type is missing from the answer."], judge: ["Replies without naming the specific rule.", "Tone is curt for an upset customer.", "Promises a date the agent cannot guarantee."],
  "tool-calls": ["Called a payout tool before approval.", "Skipped the policy lookup."], grounded: ["Two claims cite no page.", "A page number does not match the passage."], safety: ["A full card number appears in the draft."], latency: ["Over the time limit."], cost: ["Over the cost limit."],
};

const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Runs a suite. `quality` stands in for how well this version of the agent does, from 0 to 1. Latency and cost scorers read the real trace, so they are
 * measured, not simulated. In a connected workspace the agent does the work and the scorers read what it produced.
 */
export function runSuite(o: { suite: EvalSuite; agents: Agent[]; seed: number; startedAt: number; quality: number; version: string; trigger?: EvalRun["trigger"]; id: string }): { run: EvalRun; traces: Trace[] } {
  const r = rng(o.seed);
  const a = o.agents.find((x) => x.id === o.suite.agentId)!;
  const correlationId = o.id;
  const traces: Trace[] = []; const results: CaseResult[] = [];
  let cursor = o.startedAt;
  o.suite.cases.forEach((c, i) => {
    const t = buildTrace({ agents: o.agents, tree: { agent: a.id }, seed: o.seed * 31 + i, startedAt: cursor, trigger: "Evaluation", behalfOf: "service: eval-runner", correlationId, kind: "eval", evalRunId: o.id, caseId: c.id, extra: { "eval.run": o.id, "eval.case": c.id, "eval.suite": o.suite.id } });
    const root = t.spans.find((s) => !s.parent)!;
    const scores: Record<string, number> = {}; const failed: string[] = []; const reasons: string[] = [];
    const ok = t.status === "ok";
    for (const s of o.suite.scorers) {
      let v: number;
      switch (s.kind) {
        case "latency": v = t.durationMs <= s.threshold ? 1 : clamp(1 - (t.durationMs - s.threshold) / s.threshold); break;
        case "cost": v = t.costUsd <= s.threshold ? 1 : clamp(1 - (t.costUsd - s.threshold) / s.threshold); break;
        case "judge": case "grounded": v = ok ? clamp(o.quality + (r() - 0.5) * 0.35, 0, 1) : 0; break;
        case "safety": v = ok && r() < 0.985 ? 1 : 0; break;
        default: v = ok && r() < o.quality + 0.04 ? 1 : 0;
      }
      v = round(v);
      scores[s.id] = v;
      const pass = s.kind === "latency" || s.kind === "cost" ? v >= 1 : v >= s.threshold;
      if (!pass) { failed.push(s.id); reasons.push(!ok ? "The run failed before it could answer." : FAIL_REASONS[s.kind][Math.floor(r() * FAIL_REASONS[s.kind].length)]); }
    }
    const lead = o.suite.scorers.find((s) => s.kind === "exact" || s.kind === "contains");
    const output = lead && failed.includes(lead.id) ? c.wrong : c.expected;
    // Scorer spans follow the agent's own work, so the trace shows what was measured and what the judge cost.
    let at = root.startMs + root.durMs + 6;
    for (const s of o.suite.scorers) {
      const judge = s.kind === "judge" || s.kind === "grounded";
      const d = judge ? Math.round(380 + r() * 900) : Math.round(2 + r() * 8);
      const failedHere = failed.includes(s.id);
      const span: Span = { id: Array.from({ length: 16 }, () => "0123456789abcdef"[Math.floor(r() * 16)]).join(""), parent: root.id, agentId: a.id, name: `Score: ${s.label}`, kind: "eval", startMs: at, durMs: d,
        costUsd: judge ? round(0.0009 + r() * 0.0012, 4) : 0, tokens: judge ? Math.round(300 + r() * 500) : 0, status: "ok", detail: failedHere ? "Below the threshold" : undefined,
        attrs: { "eval.scorer": s.id, "eval.kind": s.kind, "eval.score": scores[s.id], "eval.threshold": s.threshold, "eval.pass": !failedHere, "eval.case": c.id },
        logs: [{ atMs: at + d, level: failedHere ? "warn" : "info", msg: `${s.label}: ${scores[s.id]}${failedHere ? ` (needs ${s.threshold})` : ""}` }] };
      t.spans.push(span); at += d + 2;
    }
    t.durationMs = Math.max(t.durationMs, at); t.costUsd = round(t.spans.reduce((x, y) => x + y.costUsd, 0), 4); t.tokens = t.spans.reduce((x, y) => x + y.tokens, 0);
    traces.push(t);
    results.push({ caseId: c.id, output, scores, failed, pass: failed.length === 0, traceId: t.id, durMs: t.durationMs, costUsd: t.costUsd, tokens: t.tokens, reason: reasons[0] });
    cursor += t.durationMs + 200;
  });
  const wsum = o.suite.scorers.reduce((x, s) => x + s.weight, 0);
  const caseMean = results.map((res) => o.suite.scorers.reduce((x, s) => x + res.scores[s.id] * s.weight, 0) / wsum);
  const passRate = results.filter((x) => x.pass).length / Math.max(1, results.length);
  const run: EvalRun = {
    id: o.id, suiteId: o.suite.id, agentId: a.id, agentVersion: o.version, startedAt: new Date(o.startedAt).toISOString(), durationMs: cursor - o.startedAt, trigger: o.trigger ?? "manual",
    status: passRate >= 0.8 ? "passed" : "failed", passRate: round(passRate), meanScore: round(mean(caseMean)),
    scorerMeans: Object.fromEntries(o.suite.scorers.map((s) => [s.id, round(mean(results.map((x) => x.scores[s.id])))])), costUsd: round(results.reduce((x, y) => x + y.costUsd, 0), 3), p95Ms: percentile(results.map((x) => x.durMs), 95), correlationId, results,
  };
  return { run, traces };
}

/** What changed between two runs of the same suite. */
export function compareRuns(prev: EvalRun | undefined, next: EvalRun) {
  if (!prev) return { regressions: [] as string[], fixes: [] as string[], passRateDelta: 0, meanDelta: 0, costDelta: 0 };
  const was = new Map(prev.results.map((x) => [x.caseId, x.pass]));
  return {
    regressions: next.results.filter((x) => was.get(x.caseId) === true && !x.pass).map((x) => x.caseId),
    fixes: next.results.filter((x) => was.get(x.caseId) === false && x.pass).map((x) => x.caseId),
    passRateDelta: round(next.passRate - prev.passRate), meanDelta: round(next.meanScore - prev.meanScore), costDelta: round(next.costUsd - prev.costUsd, 3),
  };
}

/** The quality a version of an agent reaches in the sample history: slow improvement, with one regression. */
const HISTORY_QUALITY = [0.74, 0.82, 0.78, 0.88];
export function sampleEvals(agents: Agent[], now = Date.now()): { suites: EvalSuite[]; runs: EvalRun[]; traces: Trace[] } {
  const suites: EvalSuite[] = []; const runs: EvalRun[] = []; const traces: Trace[] = [];
  for (const seed of SAMPLE_SUITES) {
    const a = agents.find((x) => x.id === seed.agentId);
    if (!a || a.state === "retired" || a.control === "inventory") continue;
    const suite: EvalSuite = { ...seed, createdAt: new Date(now - 40 * 86_400_000).toISOString() };
    suites.push(suite);
    const h = hash32(a.id);
    HISTORY_QUALITY.forEach((q, i) => {
      const age = (HISTORY_QUALITY.length - i) * 6 - 2;
      const quality = clamp(q + ((h % 7) - 3) * 0.01);
      const { run, traces: ts } = runSuite({ suite, agents, seed: 100 + h % 1000 + i * 17, startedAt: now - age * 86_400_000, quality, version: i === HISTORY_QUALITY.length - 1 ? a.version : `${a.version}-${i + 1}`, trigger: i % 2 ? "deploy-gate" : "schedule", id: `evr_${a.id.slice(-2)}${i + 1}` });
      runs.push(run); traces.push(...ts);
    });
  }
  return { suites, runs, traces };
}

export function runsToCsv(runs: EvalRun[], suites: EvalSuite[], agents: Agent[]): string {
  const sc = new Map(suites.map((s) => [s.id, s])); const ag = new Map(agents.map((a) => [a.id, a.name]));
  const scorers = [...new Set(suites.flatMap((s) => s.scorers.map((x) => x.id)))];
  const head = ["run_id", "suite", "agent", "agent_version", "started_at", "case", "pass", "trace_id", "duration_ms", "cost_usd", ...scorers.map((s) => `score_${s}`), "reason"];
  const rows = runs.flatMap((r) => r.results.map((c) => csvLine([r.id, sc.get(r.suiteId)?.name ?? r.suiteId, ag.get(r.agentId) ?? r.agentId, r.agentVersion, r.startedAt, c.caseId, c.pass, c.traceId, c.durMs, c.costUsd, ...scorers.map((s) => c.scores[s] ?? ""), c.reason ?? ""])));
  return [csvLine(head), ...rows].join("\n") + "\n";
}
