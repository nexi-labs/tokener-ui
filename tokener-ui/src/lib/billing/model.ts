/**
 * Billing for an organization, modelled on how Confluent Cloud bills: a new organization starts free with usage credit that lasts a fixed time or
 * until it is used, a payment method is needed to keep going after that or to turn on paid features, usage accrues hourly and is invoiced monthly
 * in arrears, and large customers can move to an annual commitment or pay through a cloud marketplace.
 *
 * One interface, two drivers. The sample workspace keeps an account in memory. A signed-in workspace calls /api/v1/billing/orgs/{orgId}/...; those
 * routes are specified in docs and are not served yet, so the console says so instead of showing made-up numbers.
 */
import { useSyncExternalStore } from "react";
import { http } from "@/lib/api/client";

/** PLACEHOLDER commercial terms: confirm the credit and its length before launch. They are the only place the numbers live. */
export const FREE_START = { creditUsd: 400, days: 30 } as const;

export type PaymentMethod =
  | { kind: "card"; brand: string; last4: string; expMonth: number; expYear: number; holder: string }
  | { kind: "us_bank_account"; bankName: string; last4: string; accountType: "checking" | "savings"; holder: string };
export type Address = { line1: string; line2?: string; city: string; region: string; postalCode: string; country: string };
/** One line of the statement for an environment: a resource or feature, what was used, the rate and the cost. Usage appears as it happens. */
export type UsageLine = { dimension: string; unit: string; quantity: number; amountUsd: number; environment: string; resource: string };
export type Commitment = { annualMinimumUsd: number; termStart: string; termEnd: string; accruedUsd: number };
export type Invoice = { id: string; period: string; issuedAt: string; totalUsd: number; status: "open" | "paid" | "void" };
export type BillingModel = "pay-as-you-go" | "commitment" | "marketplace";

export type BillingAccount = {
  model: BillingModel;
  /** Free start. `usedUsd` counts against `creditUsd`; the start ends at `endsAt` or when the credit is gone, whichever is first. */
  start: { creditUsd: number; usedUsd: number; startedAt: string; endsAt: string };
  promoCreditUsd: number;
  paymentMethod: PaymentMethod | null;
  billingEmail: string;
  billingAddress: Address | null;
  /** Shown on the billing page and quoted to support. */
  organizationId: string;
  commitment: Commitment | null;
  /** Charges accrued in the current month, not yet invoiced. */
  accruedUsd: number;
  usage: UsageLine[];
  invoices: Invoice[];
};

/** What the free start does and does not cover. The first group needs nothing; the second needs a payment method on file. */
export const FREE_FEATURES = [
  "Explore every screen and connect providers",
  "Policies, budgets and quotas on one tenant",
  "Try any feature and simulate pipelines with sample data",
  "Analytics and audit for 7 days",
];
export const CARD_FEATURES: { id: PaidFeature; title: string; body: string }[] = [
  { id: "save", title: "Save pipelines, knowledge bases and published versions", body: "Try them freely. Saving one asks for a payment method; you are billed only for usage beyond the free allowance." },
  { id: "run-environment", title: "Run pipelines, functions and agents in an environment", body: "Simulation is free. Running against real data, providers and clusters is metered." },
  { id: "volume-documents", title: "Document processing at volume", body: "Beyond the free allowance, pages processed are metered." },
  { id: "retention", title: "Longer audit and analytics retention", body: "Keep history beyond 7 days." },
  { id: "extra-tenants", title: "More tenants and production deployments", body: "Separate tenants for staging, production and regions." },
  { id: "support", title: "Support plans", body: "Business hours or 24x7 support with response targets." },
];
export type PaidFeature = "save" | "run-environment" | "volume-documents" | "retention" | "extra-tenants" | "support";

/** What each metered dimension is charged on. Rates are shown in the console before a feature is turned on. */
export const DIMENSIONS: { id: string; label: string; unit: string; note: string }[] = [
  { id: "tokens", label: "Governed tokens", unit: "1M tokens", note: "Tokens that pass through the gateway, after policy." },
  { id: "requests", label: "Gateway requests", unit: "1M requests", note: "Each call is authenticated, governed, routed and metered." },
  { id: "pipeline-compute", label: "Pipeline compute", unit: "compute hour", note: "Billed per hour an environment runs your pipelines. Simulation is not billed." },
  { id: "functions", label: "Function invocations", unit: "1M invocations", note: "Runs of functions you deploy, plus the compute they use." },
  { id: "documents", label: "Document processing", unit: "1,000 pages", note: "Scan, extract, redact and embed, counted once per unique file." },
  { id: "retention", label: "Audit and analytics retention", unit: "GB-month", note: "Storage after the free 7 days." },
  { id: "connectors", label: "Managed connectors", unit: "connector-hour", note: "Connections tok∑ner runs for you." },
  { id: "support", label: "Support", unit: "month", note: "Monthly minimum, or a share of usage when that is higher." },
];

export type CardInput = { holder: string; number: string; expMonth: number; expYear: number; cvc: string };
export type BankInput = { holder: string; routing: string; account: string; accountType: "checking" | "savings" };
export const isBank = (i: CardInput | BankInput): i is BankInput => "routing" in i;

export interface BillingDriver {
  mode: "live" | "sample";
  load(): Promise<BillingAccount>;
  addPaymentMethod(input: CardInput | BankInput): Promise<BillingAccount>;
  setBillingEmail(email: string): Promise<BillingAccount>;
  setBillingAddress(address: Address): Promise<BillingAccount>;
  redeemPromo(code: string): Promise<BillingAccount>;
}

export const daysLeft = (a: BillingAccount, now = Date.now()) => Math.max(0, Math.ceil((Date.parse(a.start.endsAt) - now) / 86_400_000));
export const creditLeft = (a: BillingAccount) => Math.max(0, a.start.creditUsd + a.promoCreditUsd - a.start.usedUsd);
export function startState(a: BillingAccount, now = Date.now()): "active" | "ended" {
  return creditLeft(a) > 0 && Date.parse(a.start.endsAt) > now ? "active" : "ended";
}
/**
 * What happens when the free start is over and nothing replaced it, as Confluent Cloud does it: the organization is suspended, features are
 * unavailable and data cannot be reached. Adding a payment method or redeeming a promo code restores it. If neither happens within 30 days of
 * suspension the resources are deleted; the organization and its people are kept and can still be reactivated.
 */
export const SUSPENSION_GRACE_DAYS = 30;
export function suspension(a: BillingAccount, now = Date.now()): { since: string; resourcesDeletedOn: string; daysToDelete: number } | null {
  if (a.paymentMethod || a.model !== "pay-as-you-go" || startState(a, now) !== "ended") return null;
  const since = Math.min(Date.parse(a.start.endsAt), now);
  const del = since + SUSPENSION_GRACE_DAYS * 86_400_000;
  return { since: new Date(since).toISOString(), resourcesDeletedOn: new Date(del).toISOString(), daysToDelete: Math.max(0, Math.ceil((del - now) / 86_400_000)) };
}

/** The emails sent to the person who signed up while the free start runs. Adding a payment method stops them. */
export const FREE_START_NOTICES = [
  "When half of the credit is used",
  "When 80 percent of the credit is used",
  "When half of the 30 days have passed",
  "When the credit expires in under three days",
  "When the organization is suspended",
];

/** True when something that needs a payment method on file is blocked: the free start is over, or no card yet for a paid feature. */
export const needsPaymentMethod = (a: BillingAccount) => a.paymentMethod === null && a.model === "pay-as-you-go";

/** One line each for a payment method, whichever kind it is. */
export function describeMethod(pm: PaymentMethod): { title: string; detail: string } {
  return pm.kind === "card"
    ? { title: `${pm.brand} ending ${pm.last4}`, detail: `Expires ${String(pm.expMonth).padStart(2, "0")}/${pm.expYear}, ${pm.holder}` }
    : { title: `${pm.bankName} ${pm.accountType} ending ${pm.last4}`, detail: `US bank account, ${pm.holder}` };
}

export const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ------------------------------------------------------------------------------------------------ card checks

export function brandOf(number: string): string {
  const n = number.replace(/\D/g, "");
  if (/^4/.test(n)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(n)) return "Mastercard";
  if (/^3[47]/.test(n)) return "American Express";
  if (/^6(011|5)/.test(n)) return "Discover";
  return "Card";
}
/** Test card numbers a processor documents as prepaid are refused in the sample workspace; a live processor decides this itself. */
export const isPrepaid = (number: string) => number.replace(/\D/g, "").startsWith("5500");
/** ABA routing number checksum. */
export function abaOk(r: string): boolean {
  if (!/^\d{9}$/.test(r)) return false;
  const d = r.split("").map(Number);
  return (3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])) % 10 === 0;
}
const ROUTING_BANKS: Record<string, string> = { "021000021": "JPMorgan Chase", "026009593": "Bank of America", "121000248": "Wells Fargo", "011401533": "Citizens Bank" };
export function luhn(number: string): boolean {
  const d = number.replace(/\D/g, "");
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0, alt = false;
  for (let i = d.length - 1; i >= 0; i--) { let n = +d[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } sum += n; alt = !alt; }
  return sum % 10 === 0;
}

// ------------------------------------------------------------------------------------------------ sample driver

/** Relative to now, so the sample free start is always 19 days in and never expires underneath a reader. */
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();

function seed(): BillingAccount {
  return {
    model: "pay-as-you-go",
    start: { creditUsd: FREE_START.creditUsd, usedUsd: 238.4, startedAt: iso(19), endsAt: iso(19 - FREE_START.days) },
    promoCreditUsd: 0,
    paymentMethod: null,
    billingEmail: "billing@nexi.example",
    billingAddress: null,
    organizationId: "org-7f3a91c2",
    commitment: null,
    accruedUsd: 238.4,
    usage: [
      { dimension: "tokens", unit: "1M tokens", quantity: 44.2, amountUsd: 88.4, environment: "production", resource: "Gateway, all providers" },
      { dimension: "tokens", unit: "1M tokens", quantity: 17.2, amountUsd: 34.4, environment: "staging", resource: "Gateway, all providers" },
      { dimension: "requests", unit: "1M requests", quantity: 0.92, amountUsd: 18.4, environment: "production", resource: "Gateway" },
      { dimension: "pipeline-compute", unit: "compute hour", quantity: 96, amountUsd: 38.4, environment: "staging", resource: "support-classifier-release" },
      { dimension: "pipeline-compute", unit: "compute hour", quantity: 44, amountUsd: 17.6, environment: "production", resource: "support-retrieval-assistant" },
      { dimension: "functions", unit: "1M invocations", quantity: 0.31, amountUsd: 6.2, environment: "production", resource: "fraud-score" },
      { dimension: "documents", unit: "1,000 pages", quantity: 8.5, amountUsd: 25.5, environment: "production", resource: "Knowledge: support-articles" },
      { dimension: "retention", unit: "GB-month", quantity: 4.2, amountUsd: 9.5, environment: "production", resource: "Audit and analytics" },
    ],
    invoices: [],
  };
}

let sample = seed();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), 140));

export const sampleDriver: BillingDriver = {
  mode: "sample",
  load: () => wait(sample),
  addPaymentMethod: async (c) => {
    if (isBank(c)) {
      if (!c.holder.trim()) throw new Error("Enter the account holder name.");
      if (!/^\d{9}$/.test(c.routing) || !abaOk(c.routing)) throw new Error("That routing number is not valid.");
      if (!/^\d{4,17}$/.test(c.account)) throw new Error("Enter the account number, 4 to 17 digits.");
      // Only the bank name and last four digits are kept, as a payment processor would hand back.
      sample = { ...sample, paymentMethod: { kind: "us_bank_account", bankName: ROUTING_BANKS[c.routing] ?? "US bank account", last4: c.account.slice(-4), accountType: c.accountType, holder: c.holder.trim() } };
      emit();
      return wait(sample);
    }
    if (!c.holder.trim()) throw new Error("Enter the name on the card.");
    if (!luhn(c.number)) throw new Error("That card number is not valid.");
    if (isPrepaid(c.number)) throw new Error("Prepaid cards are not supported. Use a credit or debit card, or a US bank account.");
    const now = new Date();
    if (c.expYear < now.getFullYear() || (c.expYear === now.getFullYear() && c.expMonth < now.getMonth() + 1)) throw new Error("That card has expired.");
    if (!/^\d{3,4}$/.test(c.cvc)) throw new Error("Enter the security code.");
    const digits = c.number.replace(/\D/g, "");
    // Only the brand and the last four digits are kept, as a payment processor would hand back.
    sample = { ...sample, paymentMethod: { kind: "card", brand: brandOf(digits), last4: digits.slice(-4), expMonth: c.expMonth, expYear: c.expYear, holder: c.holder.trim() } };
    emit();
    return wait(sample);
  },
  setBillingAddress: async (ad) => {
    if (!ad.line1.trim() || !ad.city.trim() || !ad.postalCode.trim() || !ad.country.trim()) throw new Error("Enter the street address, city, postal code and country.");
    sample = { ...sample, billingAddress: { ...ad, line1: ad.line1.trim(), city: ad.city.trim(), postalCode: ad.postalCode.trim() } }; emit(); return wait(sample);
  },
  setBillingEmail: async (email) => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error("Enter a valid email address.");
    sample = { ...sample, billingEmail: email.trim() }; emit(); return wait(sample);
  },
  redeemPromo: async (code) => {
    if (code.trim().toUpperCase() !== "WELCOME100") throw new Error("That promo code is not valid or has already been used.");
    sample = { ...sample, promoCreditUsd: sample.promoCreditUsd + 100 }; emit(); return wait(sample);
  },
};

// ------------------------------------------------------------------------------------------------ live driver

export function liveDriver(orgId: string): BillingDriver {
  const base = `/api/v1/billing/orgs/${orgId}`;
  return {
    mode: "live",
    load: () => http.get<BillingAccount>(`${base}/account`),
    // The card itself is entered in a form hosted by the payment processor. The console only sends the user to it and reads the result back.
    addPaymentMethod: async () => { throw new Error("Use the secure payment form."); },
    setBillingEmail: (email) => http.put<BillingAccount>(`${base}/account/billing-email`, { email }),
    setBillingAddress: (address) => http.put<BillingAccount>(`${base}/account/billing-address`, address),
    redeemPromo: (code) => http.post<BillingAccount>(`${base}/promo-codes`, { code }),
  };
}
export const startPaymentSession = (orgId: string) => http.post<{ url: string }>(`/api/v1/billing/orgs/${orgId}/payment-method/session`, { returnUrl: `${window.location.origin}/billing` });

// ------------------------------------------------------------------------------------------------ store

export function useSampleAccount(): BillingAccount {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => sample, () => sample);
}
export function resetSample() { sample = seed(); emit(); }
/** Sample workspace only: jump the free start to a state so the screens for it can be seen without waiting 30 days. */
export function sampleSetStart(state: "active" | "ended") {
  sample = state === "ended"
    ? { ...sample, start: { ...sample.start, usedUsd: sample.start.creditUsd, endsAt: iso(2) }, paymentMethod: null }
    : { ...seed(), paymentMethod: sample.paymentMethod };
  emit();
}
