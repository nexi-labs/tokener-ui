import { PACK_BY_REF, reviewClaim, type Review } from "./claims";
import { SAMPLE_CHANNEL as CH } from "@/lib/notifications/client";

/**
 * The decisions people are asked to make for agents. A run that reaches a human gate is saved and waits here. The approver sees what the agent wants to do,
 * why, the document or record it relied on, and what the agent found wrong with it, then approves, declines or asks for changes. Every decision is recorded
 * with who made it and why, and the agent resumes from the saved run with the answer.
 */

export type ApprovalStatus = "pending" | "awaiting-second" | "approved" | "declined" | "changes";
export type Outcome = "approved" | "declined" | "changes";
export type DecisionRecord = { by: string; at: string; outcome: Outcome; reason: string; round: "first" | "second" };
export type ActivityKind = "request" | "notify" | "decision" | "resume";
/** `via` is the key of the connection or channel used, in the form the Constellation uses: connection:<id> or channel:<id>. */
export type Activity = { at: string; kind: ActivityKind; text: string; via?: string };
export type Approval = {
  id: string; agentId: string; kind: "claim" | "tool"; subject: string; summary: string; tool: string; amountUsd?: number; packRef?: string;
  requestedAt: string; dueAt: string; status: ApprovalStatus; decisions: DecisionRecord[]; activity: Activity[]; channelKeys: string[]; details: [string, string][];
  /** Why the agent stopped: the sensitive tool it wants to call, or low confidence. */
  trigger: string; assignee: string; requireReason: boolean;
};

export const isOpen = (a: Approval) => a.status === "pending" || a.status === "awaiting-second";
export const reviewOf = (a: Approval): Review | null => (a.packRef && PACK_BY_REF[a.packRef] ? reviewClaim(PACK_BY_REF[a.packRef]) : null);
export const STATUS_LABEL: Record<ApprovalStatus, string> = { pending: "Waiting for a decision", "awaiting-second": "Waiting for a second approval", approved: "Approved", declined: "Declined", changes: "Sent back for changes" };

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** The minutes left to answer, negative once the time is up. */
export const minutesLeft = (a: Approval, now = Date.now()) => Math.round((Date.parse(a.dueAt) - now) / 60_000);

/**
 * Applies a decision. The rules are the ones the claims guidelines and the human gate set:
 *  - declining or asking for changes needs a reason, and so does approving where the gate says so,
 *  - approving a claim with a failed check needs a reason that says why it is acceptable,
 *  - above the second-approval limit the first approval is not final, and the second must be someone else,
 *  - nobody decides a request they already decided.
 */
export function decide(a: Approval, input: { by: string; outcome: Outcome; reason: string; at?: string }): Result<Approval> {
  if (!isOpen(a)) return { ok: false, error: "This request was already decided." };
  const reason = input.reason.trim(); const at = input.at ?? new Date().toISOString();
  if (a.decisions.some((d) => d.by === input.by)) return { ok: false, error: "You already decided this request. A second approval must come from someone else." };
  if (input.outcome !== "approved" && reason.length < 5) return { ok: false, error: input.outcome === "declined" ? "Say why you are declining. The reason goes to the agent and the audit record." : "Say what must change." };
  const rev = reviewOf(a);
  if (input.outcome === "approved") {
    const failed = rev?.checks.filter((c) => c.result === "fail") ?? [];
    if (failed.length && reason.length < 15) return { ok: false, error: `The agent found ${failed.length === 1 ? "a problem" : failed.length + " problems"} with this claim (${failed.map((c) => c.label.toLowerCase()).join(", ")}). To approve it anyway, explain why in at least a sentence.` };
    if (a.requireReason && reason.length < 5) return { ok: false, error: "This gate asks for a reason with every approval." };
  }
  const round: DecisionRecord["round"] = a.status === "awaiting-second" ? "second" : "first";
  const rec: DecisionRecord = { by: input.by, at, outcome: input.outcome, reason, round };
  const next: Approval = { ...a, decisions: [...a.decisions, rec], activity: [...a.activity, { at, kind: "decision", text: `${input.by} ${input.outcome === "approved" ? "approved" : input.outcome === "declined" ? "declined" : "asked for changes to"} the request${reason ? `: ${reason}` : ""}` }] };
  if (input.outcome === "approved" && round === "first" && rev?.needsSecond) {
    return { ok: true, value: { ...next, status: "awaiting-second", activity: [...next.activity, { at, kind: "notify", text: `Asked a second approver in ${a.assignee}`, via: a.channelKeys[0] }] } };
  }
  const done: Approval = { ...next, status: input.outcome, activity: [...next.activity, { at, kind: "resume", text: input.outcome === "approved" ? "The agent resumed from the saved run and carried out the action" : input.outcome === "declined" ? "The agent resumed, stopped, and recorded the refusal" : "The agent resumed and is revising its work" }] };
  if (a.kind === "claim" && a.packRef) {
    const p = PACK_BY_REF[a.packRef]; const ch = a.channelKeys.find((k) => k.startsWith("channel:") && k.endsWith(CH.claimsDesk));
    if (input.outcome !== "changes") done.activity.push({ at, kind: "notify", text: `Emailed ${p.claimant} their ${input.outcome === "approved" ? "payout notice" : "decision"}`, via: "connection:conn-prod-email" });
    if (input.outcome === "approved") done.activity.push({ at, kind: "notify", text: `Texted ${p.claimant} that the claim was approved`, via: "connection:conn-prod-sms" });
    if (ch) done.activity.push({ at, kind: "notify", text: `Posted the outcome of ${p.ref} to the claims desk`, via: ch });
  } else if (a.tool === "issue_refund" && input.outcome === "approved") done.activity.push({ at, kind: "notify", text: "Emailed the customer their refund confirmation", via: "connection:conn-prod-email" });
  return { ok: true, value: done };
}

const min = (n: number) => n * 60_000;
export function sampleApprovals(now = Date.now()): Approval[] {
  const iso = (t: number) => new Date(t).toISOString();
  const keys = (...c: string[]) => c.map((x) => (x === "console" ? "console" : `channel:${x}`));
  const claim = (id: string, ref: string, agoMin: number): Approval => {
    const p = PACK_BY_REF[ref]; const r = reviewClaim(p);
    return {
      id, agentId: "agt_15", kind: "claim", subject: `${p.kind} claim ${p.ref}, ${p.claimant}`, summary: r.summary, tool: "approve_payout", amountUsd: r.payable, packRef: ref,
      requestedAt: iso(now - min(agoMin)), dueAt: iso(now - min(agoMin) + min(240)), status: "pending", decisions: [], channelKeys: keys("console", CH.claimsDesk, CH.claimsAdjusters),
      trigger: r.confidence < 0.75 ? "Low confidence, and a payout needs a person" : "A payout needs a person", assignee: "Claims adjusters", requireReason: true,
      details: [["Claim", p.ref], ["Policyholder", p.claimant], ["Claimed", `USD ${r.claimed.toLocaleString("en-US", { minimumFractionDigits: 2 })}`], ["Excess", `USD ${r.excess.toLocaleString("en-US", { minimumFractionDigits: 2 })}`], ["Payable", `USD ${r.payable.toLocaleString("en-US", { minimumFractionDigits: 2 })}`]],
      activity: [{ at: iso(now - min(agoMin)), kind: "request", text: `Read the ${p.pages.length} pages of ${p.ref} and prepared a recommendation: ${r.recommendation === "approve" ? "approve" : "do not approve yet"}` }, { at: iso(now - min(agoMin) + 1), kind: "notify", text: "Asked the claims adjusters for a decision", via: `channel:${CH.claimsDesk}` }, { at: iso(now - min(agoMin) + 1), kind: "notify", text: "Emailed the claims adjusters the request", via: `channel:${CH.claimsAdjusters}` }],
    };
  };
  const tool = (o: Partial<Approval> & Pick<Approval, "id" | "agentId" | "subject" | "summary" | "tool" | "details" | "assignee" | "trigger"> & { agoMin: number; slaMin: number }): Approval => ({
    kind: "tool", requestedAt: iso(now - min(o.agoMin)), dueAt: iso(now - min(o.agoMin) + min(o.slaMin)), status: "pending", decisions: [], requireReason: false, channelKeys: [], activity: [{ at: iso(now - min(o.agoMin)), kind: "request", text: o.summary }], ...o,
  });
  const decided = (a: Approval, by: string, outcome: Outcome, reason: string, afterMin: number): Approval => ({ ...a, status: outcome, decisions: [{ by, at: iso(Date.parse(a.requestedAt) + min(afterMin)), outcome, reason, round: "first" }], activity: [...a.activity, { at: iso(Date.parse(a.requestedAt) + min(afterMin)), kind: "decision", text: `${by} ${outcome === "approved" ? "approved" : "declined"} the request: ${reason}` }, { at: iso(Date.parse(a.requestedAt) + min(afterMin) + 1), kind: "resume", text: outcome === "approved" ? "The agent resumed and carried out the action" : "The agent resumed, stopped, and recorded the refusal" }] });
  return [
    claim("apr_01", "CLM-24-00902", 55), claim("apr_02", "CLM-24-00871", 18), claim("apr_03", "CLM-24-00915", 130),
    tool({ id: "apr_04", agentId: "agt_02", subject: "Refund of USD 640.00 on invoice INV-2291", summary: "Refund 640.00 to the original card. The order arrived damaged and the photos match the policy.", tool: "issue_refund", amountUsd: 640, trigger: "A sensitive tool needs approval", assignee: "Payments approvers", agoMin: 25, slaMin: 120, channelKeys: keys("console", CH.paymentsApprovals, CH.financeEmail), details: [["Invoice", "INV-2291"], ["Customer", "Orla Brennan"], ["Amount", "USD 640.00"], ["Reason", "Damaged on arrival"], ["Policy", "Refunds above 500 need a second person"]] }),
    tool({ id: "apr_05", agentId: "agt_13", subject: "Change the price of SKU-1182 from 49.00 to 44.00", summary: "A competitor lowered the price 6 percent. A 10 percent reduction keeps the margin above the floor.", tool: "update_price", trigger: "Every pricing change needs a person", assignee: "Pricing managers", agoMin: 190, slaMin: 60, channelKeys: keys("console", CH.pricingManagers), details: [["SKU", "SKU-1182"], ["Now", "USD 49.00"], ["Proposed", "USD 44.00"], ["Margin after", "31 percent, floor 28"]] }),
    decided(tool({ id: "apr_06", agentId: "agt_02", subject: "Refund of USD 210.00 on invoice INV-2204", summary: "Refund 210.00. The delivery was 9 days late.", tool: "issue_refund", trigger: "A sensitive tool needs approval", assignee: "Payments approvers", agoMin: 60 * 20, slaMin: 120, channelKeys: keys("console", CH.paymentsApprovals), details: [["Invoice", "INV-2204"], ["Amount", "USD 210.00"]] }), "Priya Nair", "approved", "Late delivery is covered by the policy.", 14),
    decided(tool({ id: "apr_07", agentId: "agt_02", subject: "Refund of USD 95.00 on invoice INV-2188", summary: "Refund 95.00 for a used add on.", tool: "issue_refund", trigger: "A sensitive tool needs approval", assignee: "Payments approvers", agoMin: 60 * 28, slaMin: 120, channelKeys: keys("console", CH.paymentsApprovals), details: [["Invoice", "INV-2188"], ["Amount", "USD 95.00"]] }), "Marcus Webb", "declined", "Add ons that were used are not refundable.", 31),
    decided(tool({ id: "apr_08", agentId: "agt_04", subject: "Merge pull request 4412 into main", summary: "All checks passed and two reviewers approved.", tool: "merge_pull_request", trigger: "A sensitive tool needs approval", assignee: "Code owners", agoMin: 60 * 30, slaMin: 480, channelKeys: keys(CH.codeOwners), details: [["Repository", "platform/gateway"], ["Pull request", "4412"]] }), "Ines Duarte", "approved", "Owner of the module. Tests pass.", 42),
  ];
}
