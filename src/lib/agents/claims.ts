import docs from "./claims-docs.generated.json";

/**
 * The claims agent's work on the sample claim packs. Each pack is a real PDF (public/samples/claims) with the position of every extracted value on its
 * page. The review is a pure function of the extracted values and the rules in the claims guidelines, so the same pack always gives the same findings and
 * an approver can check each one against the document. The packs and the people in them are invented.
 */

export type Box = [number, number, number, number];
export type ClaimField = { key: string; label: string; value: string; page: number; box: Box; confidence: number };
export type ClaimKind = "Home" | "Motor" | "Travel";
export type ClaimPack = {
  ref: string; kind: ClaimKind; claimant: string; insurer: string; pdf: string; pages: string[]; fields: ClaimField[];
  /** Invoice lines and tax, to check that they add up to the total on the document. */
  lines: number[]; tax: number; receiptsComplete: boolean; periodStart: string; periodEnd: string; perItemLimit?: number; itemMax?: number;
};
export type Cite = { source: string; heading: string; page: number; quote: string };
export type Check = { id: string; label: string; result: "pass" | "warn" | "fail"; detail: string; fields: string[]; cite?: Cite };
export type Review = { checks: Check[]; recommendation: "approve" | "decline" | "investigate"; claimed: number; excess: number; payable: number; confidence: number; summary: string; needsSecond: boolean; secondApprovalAbove: number };

type RawDoc = { pdf: string; pages: string[]; fields: { key: string; page: number; box: number[]; text: string }[]; size: number[] };
const D = docs as Record<string, RawDoc>;

export const SECOND_APPROVAL_ABOVE = 5000;
const LABEL: Record<string, string> = { policy: "Policy number", claimant: "Policyholder", lossDate: "Date of loss", reportedOn: "Reported on", cause: "Type of loss", invoiceDate: "Invoice or estimate date", contractor: "Supplier", amount: "Amount claimed", limit: "Policy limit", excess: "Excess" };
/** How sure the extraction is of each value. Printed values read cleanly. Values the agent had to pick out of a table or a long line read less so. */
const CONF: Record<string, number> = { policy: 0.99, claimant: 0.98, lossDate: 0.97, reportedOn: 0.97, cause: 0.93, invoiceDate: 0.95, contractor: 0.96, amount: 0.98, limit: 0.94, excess: 0.95 };

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
export function parseDate(text: string): number {
  const m = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(text); if (!m) return NaN;
  const mo = MONTHS.indexOf(m[2].toLowerCase()); return mo < 0 ? NaN : Date.UTC(Number(m[3]), mo, Number(m[1]));
}
export function parseMoney(text: string): number { const m = /(\d[\d,]*(?:\.\d{1,2})?)/.exec(text); return m ? Number(m[1].replace(/,/g, "")) : NaN; }

function pack(ref: string, kind: ClaimKind, claimant: string, extra: Pick<ClaimPack, "lines" | "tax" | "receiptsComplete" | "periodStart" | "periodEnd"> & Partial<ClaimPack>): ClaimPack {
  const d = D[ref];
  return {
    ref, kind, claimant, insurer: "Harbor & Pine Insurance", pdf: d.pdf, pages: d.pages,
    fields: d.fields.filter((f) => LABEL[f.key]).map((f) => ({ key: f.key, label: f.key === "contractor" && kind === "Travel" ? "Airline confirmation" : LABEL[f.key], value: f.key === "amount" ? "USD " + f.text.replace(/^Total( claimed)?\s+/, "") : f.text, page: f.page, box: f.box as Box, confidence: CONF[f.key] ?? 0.9 })), ...extra,
  };
}

export const CLAIM_PACKS: ClaimPack[] = [
  pack("CLM-24-00871", "Home", "Amira Haddad", { lines: [1180, 2260, 2310, 1020, 420], tax: 230, receiptsComplete: true, periodStart: "1 March 2026", periodEnd: "28 February 2027" }),
  pack("CLM-24-00902", "Motor", "Daniel Okoye", { lines: [4860, 2950, 1340, 2130, 1700], tax: 0, receiptsComplete: true, periodStart: "14 January 2026", periodEnd: "13 January 2027" }),
  pack("CLM-24-00915", "Travel", "Lena Vogel", { lines: [420, 180, 250, 300], tax: 0, receiptsComplete: false, periodStart: "4 November 2026", periodEnd: "9 November 2026", perItemLimit: 500, itemMax: 420 }),
];
export const PACK_BY_REF = Object.fromEntries(CLAIM_PACKS.map((p) => [p.ref, p])) as Record<string, ClaimPack>;
export const fieldOf = (p: ClaimPack, key: string) => p.fields.find((f) => f.key === key);

/** The passages of the Claims guidelines knowledge base that the rules come from. */
export const GUIDELINES: Record<string, Cite> = {
  reporting: { source: "claims-handbook.pdf", heading: "Reporting and dates", page: 3, quote: "A claim must be reported within 7 days of the loss. Repair estimates and invoices must be dated after the date of loss." },
  approval: { source: "claims-handbook.pdf", heading: "Approval limits", page: 7, quote: "A payout above 5,000 needs a second person's approval. Every payout subtracts the policy excess from the amount found payable." },
  inconsistent: { source: "claims-handbook.pdf", heading: "Inconsistent documents", page: 9, quote: "If an invoice is dated before the loss, or the invoice total does not match its lines, do not approve. Ask the policyholder and the contractor to explain." },
  baggage: { source: "baggage-cover.pdf", heading: "Lost baggage", page: 2, quote: "Receipts are required for items above 100. A report to the carrier must exist for lost baggage." },
  water: { source: "property-water.pdf", heading: "Escaped water", page: 4, quote: "Sudden escape of water from a fixed pipe is covered. Gradual damage and faulty workmanship are not." },
  motor: { source: "motor-collision.pdf", heading: "Third party at fault", page: 5, quote: "Where a third party is at fault, pay the repair cost and recover it from the third party's insurer." },
};

const day = 86_400_000;
const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function reviewClaim(p: ClaimPack): Review {
  const f = (k: string) => fieldOf(p, k)!;
  const loss = parseDate(f("lossDate").value); const reported = parseDate(f("reportedOn").value); const inv = parseDate(f("invoiceDate")?.value ?? "");
  const claimed = parseMoney(f("amount").value); const excess = parseMoney(f("excess").value); const limit = parseMoney(f("limit").value);
  const checks: Check[] = [];
  const gap = Math.round((reported - loss) / day);
  checks.push({ id: "reported", label: "Reported in time", result: gap >= 0 && gap <= 7 ? "pass" : "fail", detail: `Reported ${gap} day${gap === 1 ? "" : "s"} after the loss. The limit is 7.`, fields: ["lossDate", "reportedOn"], cite: GUIDELINES.reporting });
  if (p.kind !== "Travel") checks.push({ id: "dated", label: "Invoice dated after the loss", result: inv > loss ? "pass" : "fail", detail: inv > loss ? `The ${p.kind === "Home" ? "estimate" : "invoice"} is dated ${Math.round((inv - loss) / day)} day${Math.round((inv - loss) / day) === 1 ? "" : "s"} after the loss.` : `The invoice is dated ${f("invoiceDate").value}, ${Math.round((loss - inv) / day)} days before the loss on ${f("lossDate").value}. Work cannot be invoiced before the damage happened.`, fields: ["lossDate", "invoiceDate"], cite: GUIDELINES.inconsistent });
  const sum = p.lines.reduce((x, y) => x + y, 0) + p.tax;
  checks.push({ id: "sum", label: "Totals add up", result: Math.abs(sum - claimed) < 0.005 ? "pass" : "fail", detail: Math.abs(sum - claimed) < 0.005 ? `The ${p.lines.length} lines${p.tax ? " and tax" : ""} come to ${money(sum)}, as stated.` : `The lines come to ${money(sum)}, but the total says ${money(claimed)}.`, fields: ["amount"], cite: GUIDELINES.inconsistent });
  const period = `${p.periodStart} to ${p.periodEnd}`;
  const within = parseDate(p.periodStart) <= loss && loss <= parseDate(p.periodEnd);
  checks.push({ id: "period", label: "Loss within the policy period", result: within ? "pass" : "fail", detail: within ? `The loss on ${f("lossDate").value} falls inside ${period}.` : `The loss is outside ${period}.`, fields: ["lossDate", "policy"] });
  checks.push({ id: "limit", label: "Within the limit of cover", result: claimed <= limit ? "pass" : "warn", detail: claimed <= limit ? `${money(claimed)} is under the limit of ${money(limit)}.` : `${money(claimed)} is above the limit of ${money(limit)}. Only the limit is payable.`, fields: ["amount", "limit"], cite: p.kind === "Home" ? GUIDELINES.water : p.kind === "Motor" ? GUIDELINES.motor : GUIDELINES.baggage });
  if (p.kind === "Travel") checks.push({ id: "receipts", label: "Receipts for items above 100", result: p.receiptsComplete ? "pass" : "warn", detail: p.receiptsComplete ? "Every item above 100 has a receipt." : "The travel bag and contents, 300, has only some receipts. The policy needs one for items above 100. Ask for the rest, or accept the part that is documented.", fields: ["amount"], cite: GUIDELINES.baggage });
  const payable = Math.max(0, Math.min(claimed, limit) - excess);
  const needsSecond = payable > SECOND_APPROVAL_ABOVE;
  checks.push({ id: "second", label: "Second approval", result: needsSecond ? "warn" : "pass", detail: needsSecond ? `${money(payable)} is above ${money(SECOND_APPROVAL_ABOVE)}, so a second person must approve after the first.` : `${money(payable)} is at or below ${money(SECOND_APPROVAL_ABOVE)}, so one approval is enough.`, fields: ["amount", "excess"], cite: GUIDELINES.approval });
  const fails = checks.filter((c) => c.result === "fail"); const warns = checks.filter((c) => c.result === "warn" && c.id !== "second");
  const lowest = Math.min(...p.fields.map((x) => x.confidence));
  const confidence = Math.round(Math.max(0.3, (fails.length ? 0.55 : warns.length ? 0.82 : 0.96) * (0.9 + lowest * 0.1)) * 100) / 100;
  const recommendation: Review["recommendation"] = fails.length ? "investigate" : "approve";
  const summary = fails.length
    ? `Do not approve yet. ${fails[0].detail}`
    : `Approve ${money(payable)}: ${money(claimed)} claimed less the ${money(excess)} excess.${warns.length ? " " + warns[0].detail : ""}`;
  return { checks, recommendation, claimed, excess, payable, confidence, summary, needsSecond, secondApprovalAbove: SECOND_APPROVAL_ABOVE };
}
