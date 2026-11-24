/**
 * Runs the console's billing rules over account JSON written by the Java service (AccountContractDump) and compares each verdict with the server's
 * own. Run through scripts/billing_contract_check.sh.
 */
import { readFileSync } from "node:fs";
import { creditLeft, needsPaymentMethod, startState, suspension, describeMethod, type BillingAccount } from "../src/lib/billing/model";

const cases = JSON.parse(readFileSync(process.argv[2], "utf8")) as Record<string, { account: BillingAccount; now: string; verdict: Record<string, unknown> }>;
let bad = 0, n = 0;
const eq = (what: string, a: unknown, b: unknown) => { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { bad++; console.log(`  FAIL ${what}: console ${JSON.stringify(a)}, server ${JSON.stringify(b)}`); } };
const money = (x: number) => Math.round(x * 100) / 100;

for (const [name, c] of Object.entries(cases)) {
  const now = Date.parse(c.now), a = c.account, v = c.verdict;
  eq(`${name} start active`, startState(a, now) === "active", v.startActive);
  eq(`${name} credit left`, money(creditLeft(a)), v.creditLeft);
  eq(`${name} needs a payment method`, needsPaymentMethod(a), v.needsPaymentMethod);
  const s = suspension(a, now);
  eq(`${name} suspended since`, s ? new Date(s.since).toISOString() : null, v.suspendedSince ? new Date(String(v.suspendedSince)).toISOString() : null);
  eq(`${name} deletion date`, s ? new Date(s.resourcesDeletedOn).toISOString() : null, v.resourcesDeletedOn ? new Date(String(v.resourcesDeletedOn)).toISOString() : null);
  // Shape the page reads
  eq(`${name} has the page fields`, ["model", "start", "promoCreditUsd", "paymentMethod", "billingEmail", "billingAddress", "organizationId", "commitment", "accruedUsd", "usage", "invoices"].every((k) => k in a), true);
  eq(`${name} start dates parse`, [a.start.startedAt, a.start.endsAt].every((d) => !Number.isNaN(Date.parse(d))), true);
  if (a.paymentMethod) { const d = describeMethod(a.paymentMethod); eq(`${name} method is described`, !!d.title && !!d.detail && d.title.includes(a.paymentMethod.last4), true); }
  eq(`${name} usage lines are complete`, a.usage.every((u) => u.dimension && u.unit && typeof u.quantity === "number" && typeof u.amountUsd === "number"), true);
  eq(`${name} no card number in the JSON`, /\b\d{12,19}\b/.test(JSON.stringify({ ...a, organizationId: "" })), false);
}
console.log(`billing contract: ${n - bad}/${n} passed`);
if (bad) process.exit(1);
