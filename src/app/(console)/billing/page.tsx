"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Copy, CreditCard, Download, Landmark, Receipt, Store } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { EmptyState } from "@/components/ui/EmptyState";
import { Loading, Modal, Notice, Tabs, Toaster } from "@/components/mlops/ui";
import { toast } from "@/lib/mlops/toast";
import { PaymentModal } from "@/components/billing/PaymentModal";
import { useAuth } from "@/lib/auth/AuthProvider";
import { countries } from "@/lib/auth/countries";
import { useBilling } from "@/lib/billing/useBilling";
import {
  creditLeft, DIMENSIONS, daysLeft, describeMethod, FREE_FEATURES, FREE_START, FREE_START_NOTICES, sampleSetStart, startState, suspension, SUSPENSION_GRACE_DAYS, usd,
  type Address, type BillingAccount, type BillingDriver,
} from "@/lib/billing/model";

type Tab = "payment" | "usage" | "invoices" | "commitment";

/** Who may see billing: organization admins, finance and platform operators. Everyone else is told, rather than shown an empty page. */
function allowed(user: ReturnType<typeof useAuth>["user"], status: string): boolean {
  if (status === "demo" || !user) return true;
  return user.assignments.some((a) => ["org_admin", "finance", "platform_operator"].includes(a.role));
}

export default function BillingPage() {
  const b = useBilling();
  const { user, status } = useAuth();
  const [tab, setTab] = useState<Tab>("payment");
  const [pay, setPay] = useState(false);
  const [promo, setPromo] = useState(false);

  const reload = (a: BillingAccount) => b.status === "ready" && b.adopt(a);
  return (
    <div className="space-y-5">
      <Toaster />
      <PageHeader title="Billing and payment" description="Payment details, what you use and what it costs, and invoices. Usage accrues hourly and is invoiced monthly in arrears." />
      {!allowed(user, status) && <Notice tone="warn" title="You do not have access to billing">Only organization admins and finance can see and change billing details. Ask one of them to add you.</Notice>}
      {allowed(user, status) && b.status === "loading" && <Loading />}
      {allowed(user, status) && b.status === "unavailable" && <Notice tone="warn" title="Billing is not available">{b.message}</Notice>}
      {allowed(user, status) && b.status === "ready" && (
        <>
          <Tabs<Tab> label="Billing sections" value={tab} onChange={setTab} tabs={[
            { id: "payment", label: "Payment details and contacts" }, { id: "usage", label: "Usage and cost" },
            { id: "invoices", label: "Invoices", count: b.account.invoices.length }, { id: "commitment", label: "Commitment and marketplace" },
          ]} />
          {tab === "payment" && <PaymentDetails a={b.account} driver={b.driver} onChange={reload} onPay={() => setPay(true)} onPromo={() => setPromo(true)} />}
          {tab === "usage" && <UsageCost a={b.account} />}
          {tab === "invoices" && <Invoices a={b.account} />}
          {tab === "commitment" && <Commitment a={b.account} />}
          <PaymentModal open={pay} onClose={() => setPay(false)} driver={b.driver} onSaved={(acc) => { b.adopt(acc); toast("Payment method saved"); }} />
          <PromoModal open={promo} onClose={() => setPromo(false)} a={b.account} onRedeem={async (code) => { try { b.adopt(await b.driver.redeemPromo(code)); toast("Promo credit added"); return true; } catch (e) { toast(e instanceof Error ? e.message : "Could not redeem", "error"); return false; } }} />
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ payment details and contacts

function PaymentDetails({ a, driver, onChange, onPay, onPromo }: { a: BillingAccount; driver: BillingDriver; onChange: (a: BillingAccount) => void; onPay: () => void; onPromo: () => void }) {
  const pm = a.paymentMethod;
  const sus = suspension(a);
  const left = creditLeft(a), total = a.start.creditUsd + a.promoCreditUsd;
  const pct = Math.min(100, Math.round(((total - left) / total) * 100));
  const ended = startState(a) === "ended";
  return (
    <div className="space-y-5">
      {sus && (
        <Notice tone="bad" title="Your organization is suspended">
          The free start ended and there is no payment method. Features are unavailable and your data cannot be reached. Add a payment method or redeem a promo code to restore access. Resources are deleted {sus.daysToDelete} day{sus.daysToDelete === 1 ? "" : "s"} from now if nothing changes; your organization and people are kept.
        </Notice>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Card className="xl:col-span-2">
          <CardHeader title="Free start" subtitle={pm ? "Your credit is used first. Usage beyond it is billed to your payment method." : "Used first. Add a payment method before it ends to keep your resources running."} />
          <CardBody>
            <div className="flex items-end justify-between gap-4">
              <div><div className="text-3xl font-semibold tabular-nums text-text-primary">{usd(left)}</div><div className="text-xs text-text-tertiary mt-0.5">credit left of {usd(total)}</div></div>
              <div className="text-right"><div className="text-3xl font-semibold tabular-nums text-text-primary">{ended ? "Ended" : daysLeft(a)}</div><div className="text-xs text-text-tertiary mt-0.5">{ended ? "credit used up or expired" : `day${daysLeft(a) === 1 ? "" : "s"} left of ${FREE_START.days}`}</div></div>
            </div>
            <div className="mt-4 h-2 rounded-full bg-surface-muted overflow-hidden" aria-label={`${pct} percent of the credit used`}><div className={`h-full rounded-full ${ended ? "bg-status-down" : "bg-accent-500"}`} style={{ width: `${pct}%` }} /></div>
            <div className="mt-2 flex justify-between text-xs text-text-tertiary tabular-nums"><span>{usd(total - left)} used</span><span>{usd(left)} left</span></div>
            <p className="mt-4 text-xs text-text-secondary leading-relaxed">
              The free start ends after {FREE_START.days} days or when the credit is used, whichever comes first. It cannot be paused. To extend it, <Link href="/contact" className="underline underline-offset-4 hover:text-text-primary">talk to sales</Link>.
            </p>
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5 border-t border-border pt-5">
              <div>
                <h3 className="text-[13px] font-semibold text-text-primary mb-2">Included while you start</h3>
                <ul className="space-y-1.5 text-[13px] text-text-secondary list-disc pl-4">{FREE_FEATURES.map((f) => <li key={f}>{f}</li>)}</ul>
              </div>
              <div>
                <h3 className="text-[13px] font-semibold text-text-primary mb-2">{pm ? "Email notices have stopped" : `Emails to ${a.billingEmail}`}</h3>
                {pm ? <p className="text-[13px] text-text-secondary">Free start notices stop once a payment method is on file.</p>
                  : <ul className="space-y-1.5 text-[13px] text-text-secondary list-disc pl-4">{FREE_START_NOTICES.map((n) => <li key={n}>{n}</li>)}</ul>}
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Promotional balance" action={<Button variant="secondary" onClick={onPromo}>Add promo code</Button>} />
          <CardBody>
            <div className="text-3xl font-semibold tabular-nums text-text-primary">{usd(a.promoCreditUsd)}</div>
            <p className="mt-1 text-xs text-text-tertiary leading-relaxed">Applied after the free start credit and before any charge to your payment method.</p>
            {!pm && a.promoCreditUsd > 0 && <p className="mt-3 text-xs text-text-secondary">Without a payment method, the organization is suspended again when this credit is used or expires.</p>}
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Payment method" subtitle="One active method per organization" action={<Button variant={pm ? "secondary" : "primary"} onClick={onPay}>{pm ? "Change" : "Add payment method"}</Button>} />
          <CardBody>
            {pm ? (
              <div className="flex items-center gap-3 rounded-md border border-border px-4 py-3">
                <span className="h-9 w-9 rounded-md bg-surface-muted grid place-items-center text-text-secondary">{pm.kind === "card" ? <CreditCard size={17} /> : <Landmark size={17} />}</span>
                <div><div className="text-sm font-medium text-text-primary">{describeMethod(pm).title}</div><div className="text-xs text-text-tertiary">{describeMethod(pm).detail}</div></div>
              </div>
            ) : <p className="text-[13px] text-text-secondary">No payment method yet. Features that save or run something metered ask for one when you use them.</p>}
            <ul className="mt-4 space-y-1.5 text-xs text-text-tertiary leading-relaxed list-disc pl-4">
              <li>Credit or debit card, or a US bank account. Prepaid cards are not supported.</li>
              <li>Invoicing instead of a card or bank account needs a minimum annual commitment. <Link href="/contact" className="underline underline-offset-4 hover:text-text-primary">Talk to sales</Link>.</li>
              <li>Details are entered with our payment processor and never reach tok&sum;ner.</li>
            </ul>
          </CardBody>
        </Card>

        <BillingEmail a={a} driver={driver} onChange={onChange} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <BillingAddress a={a} driver={driver} onChange={onChange} />
        <Card>
          <CardHeader title="Organization" subtitle="Quote this when you contact support" />
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
              <div><div className="text-xs text-text-tertiary">Organization ID</div><div className="font-mono text-[13px] text-text-primary">{a.organizationId}</div></div>
              <button aria-label="Copy organization ID" onClick={() => { void navigator.clipboard?.writeText(a.organizationId); toast("Copied"); }} className="h-8 w-8 grid place-items-center rounded-md text-text-secondary hover:bg-surface-muted"><Copy size={15} /></button>
            </div>
            <p className="text-xs text-text-tertiary leading-relaxed">Only organization admins and finance can see and change billing details. A free start can be reactivated for {SUSPENSION_GRACE_DAYS} days after it ends; after that, resources are deleted but the organization and its people remain.</p>
            {driver.mode === "sample" && (
              <div className="pt-3 border-t border-border text-xs text-text-tertiary">
                Sample workspace: <button className="underline underline-offset-4 hover:text-text-primary" onClick={() => { sampleSetStart("ended"); toast("Free start moved to its ended state", "info"); }}>show the free start ended</button> · <button className="underline underline-offset-4 hover:text-text-primary" onClick={() => { sampleSetStart("active"); toast("Free start restored", "info"); }}>restore</button>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function BillingEmail({ a, driver, onChange }: { a: BillingAccount; driver: BillingDriver; onChange: (a: BillingAccount) => void }) {
  const [email, setEmail] = useState(a.billingEmail);
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <CardHeader title="Billing contact" subtitle="Receipts and invoices go to one email address" />
      <CardBody className="space-y-4">
        <Field label="Billing email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Button variant="secondary" disabled={busy || email.trim() === a.billingEmail} onClick={async () => { setBusy(true); try { onChange(await driver.setBillingEmail(email)); toast("Billing email updated"); } catch (e) { toast(e instanceof Error ? e.message : "Could not save", "error"); } finally { setBusy(false); } }}>Save</Button>
      </CardBody>
    </Card>
  );
}

function BillingAddress({ a, driver, onChange }: { a: BillingAccount; driver: BillingDriver; onChange: (a: BillingAccount) => void }) {
  const list = useMemo(() => countries(), []);
  const [f, setF] = useState<Address>(a.billingAddress ?? { line1: "", line2: "", city: "", region: "", postalCode: "", country: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <Card>
      <CardHeader title="Billing address" subtitle="Shown on invoices" />
      <CardBody className="space-y-3">
        <Field label="Address line 1"><Input autoComplete="address-line1" value={f.line1} onChange={set("line1")} /></Field>
        <Field label="Address line 2 (optional)"><Input autoComplete="address-line2" value={f.line2 ?? ""} onChange={set("line2")} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="City"><Input autoComplete="address-level2" value={f.city} onChange={set("city")} /></Field>
          <Field label="State or region"><Input autoComplete="address-level1" value={f.region} onChange={set("region")} /></Field>
          <Field label="Postal code"><Input autoComplete="postal-code" value={f.postalCode} onChange={set("postalCode")} /></Field>
          <Field label="Country"><Select value={f.country} onChange={set("country")}><option value="">Select</option>{list.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</Select></Field>
        </div>
        <Button variant="secondary" disabled={busy} onClick={async () => { setBusy(true); try { onChange(await driver.setBillingAddress(f)); toast("Billing address saved"); } catch (e) { toast(e instanceof Error ? e.message : "Could not save", "error"); } finally { setBusy(false); } }}>Save address</Button>
      </CardBody>
    </Card>
  );
}

function PromoModal({ open, onClose, a, onRedeem }: { open: boolean; onClose: () => void; a: BillingAccount; onRedeem: (code: string) => Promise<boolean> }) {
  const [code, setCode] = useState("");
  return (
    <Modal open={open} onClose={onClose} title="Add a promo code"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!code.trim()} onClick={async () => { if (await onRedeem(code)) { setCode(""); onClose(); } }}>Redeem</Button></>}>
      <div className="space-y-4">
        <Field label="Promo code"><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter your code" /></Field>
        {!a.paymentMethod && <Notice tone="warn" title="Add a payment method too">Promo credit without a payment method suspends the organization again when it is used or expires, which can interrupt your work and make data unreachable.</Notice>}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------------------------------------ usage and cost

function UsageCost({ a }: { a: BillingAccount }) {
  const envs = useMemo(() => ["all", ...Array.from(new Set(a.usage.map((u) => u.environment)))], [a.usage]);
  const [env, setEnv] = useState("all");
  const rows = a.usage.filter((u) => env === "all" || u.environment === env);
  const total = rows.reduce((s, r) => s + r.amountUsd, 0);
  const label = (id: string) => DIMENSIONS.find((d) => d.id === id)?.label ?? id;
  const csv = () => {
    const head = ["environment", "resource", "dimension", "unit", "quantity", "unit_price_usd", "amount_usd"];
    const lines = rows.map((u) => [u.environment, u.resource, label(u.dimension), u.unit, String(u.quantity), (u.amountUsd / (u.quantity || 1)).toFixed(4), u.amountUsd.toFixed(2)]);
    const url = URL.createObjectURL(new Blob([[head, ...lines].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" }));
    const el = document.createElement("a"); el.href = url; el.download = `tokener-usage-${env}.csv`; el.click(); URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Usage and cost this month" subtitle="A statement of each resource, what it used and what that costs. It updates as usage happens."
          action={<div className="flex items-center gap-2"><Select aria-label="Environment" value={env} onChange={(e) => setEnv(e.target.value)} className="h-9 w-44">{envs.map((e) => <option key={e} value={e}>{e === "all" ? "All environments" : e[0].toUpperCase() + e.slice(1)}</option>)}</Select><Button variant="secondary" onClick={csv}><Download size={14} /> Download CSV</Button></div>} />
        <Table>
          <Thead><tr><Th>Resource</Th><Th>Environment</Th><Th>Charged per</Th><Th className="text-right">Usage</Th><Th className="text-right">Unit price</Th><Th className="text-right">Cost</Th></tr></Thead>
          <tbody>
            {rows.map((u, i) => (
              <Tr key={i}>
                <Td><span className="font-medium">{u.resource}</span><span className="block text-xs text-text-tertiary">{label(u.dimension)}</span></Td>
                <Td className="capitalize">{u.environment}</Td>
                <Td className="text-text-secondary">{u.unit}</Td>
                <Td className="text-right tabular-nums">{u.quantity.toLocaleString("en-US")}</Td>
                <Td className="text-right tabular-nums text-text-secondary">{usd(u.amountUsd / (u.quantity || 1))}</Td>
                <Td className="text-right tabular-nums font-medium">{usd(u.amountUsd)}</Td>
              </Tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-text-secondary">No usage in this environment yet.</td></tr>}
            <tr><td colSpan={5} className="px-5 py-3.5 text-right text-xs text-text-tertiary">Current accrued charges</td><td className="px-5 py-3.5 text-right tabular-nums font-semibold">{usd(total)}</td></tr>
          </tbody>
        </Table>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card><CardHeader title="How charges accrue" /><CardBody>
          <ul className="space-y-2 text-[13px] text-text-secondary list-disc pl-4 leading-relaxed">
            <li>Billing starts when you create a resource and stops when you delete it.</li>
            <li>Accrual is hourly, and part of an hour is billed as a full hour. All calculations use UTC.</li>
            <li>Usage already incurred in a month still appears on that month&apos;s invoice after you delete a resource.</li>
            <li>There is no hard spending cap. Set <Link href="/budgets" className="underline underline-offset-4 hover:text-text-primary">budgets and alerts</Link> to stay in control.</li>
            <li>Cost data through the API can take up to 72 hours to settle. This page shows usage as it happens.</li>
          </ul></CardBody></Card>
        <Card><CardHeader title="What is metered" /><CardBody>
          <ul className="space-y-2.5">{DIMENSIONS.map((d) => <li key={d.id} className="text-[13px] text-text-primary">{d.label} <span className="text-text-tertiary">per {d.unit}</span><span className="block text-xs text-text-tertiary">{d.note}</span></li>)}</ul></CardBody></Card>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ invoices

function Invoices({ a }: { a: BillingAccount }) {
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Invoices" subtitle={`Created at the start of each month for the month before, and sent to ${a.billingEmail}`} />
        {a.invoices.length === 0 ? (
          <EmptyState icon={Receipt} title="No invoices yet" description="Your first invoice is created at the start of the month after your free credit is used. Usage covered by free credit is not invoiced." />
        ) : (
          <Table>
            <Thead><tr><Th>Invoice</Th><Th>Period</Th><Th>Total</Th><Th>Status</Th><Th></Th></tr></Thead>
            <tbody>{a.invoices.map((i) => (
              <Tr key={i.id}><Td><span className="font-mono">{i.id}</span></Td><Td>{i.period}</Td><Td className="tabular-nums font-medium">{usd(i.totalUsd)}</Td><Td><Badge tone={i.status === "paid" ? "healthy" : i.status === "open" ? "info" : "neutral"}>{i.status}</Badge></Td>
                <Td className="text-right"><button className="text-text-primary font-medium hover:text-accent-700 inline-flex items-center gap-1.5"><Download size={13} /> PDF</button></Td></Tr>
            ))}</tbody>
          </Table>
        )}
      </Card>
      <Notice tone="info" title="When an extra invoice is created">If the organization is deactivated, moves to an annual commitment, or switches between direct and marketplace billing, an invoice is created within 48 hours. Later usage appears on a separate invoice at the start of the next month.</Notice>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ commitment and marketplace

function Commitment({ a }: { a: BillingAccount }) {
  const c = a.commitment;
  return (
    <div className="space-y-5">
      {c ? (
        <Card>
          <CardHeader title="Annual commitment" subtitle={`${new Date(c.termStart).toLocaleDateString("en-GB")} to ${new Date(c.termEnd).toLocaleDateString("en-GB")}`} />
          <CardBody>
            <div className="flex justify-between text-sm"><span className="text-text-secondary">Accrued against your commitment</span><span className="tabular-nums font-medium">{usd(c.accruedUsd)} of {usd(c.annualMinimumUsd)}</span></div>
            <div className="mt-2 h-2 rounded-full bg-surface-muted overflow-hidden"><div className="h-full rounded-full bg-accent-500" style={{ width: `${Math.min(100, (c.accruedUsd / c.annualMinimumUsd) * 100)}%` }} /></div>
            <p className="mt-3 text-xs text-text-tertiary leading-relaxed">Usage beyond the commitment continues without interruption at the discounted rate until the term ends, and is billed to your payment method. You are notified at 80 percent used and 30 days before the term ends.</p>
          </CardBody>
        </Card>
      ) : null}
      <Card>
        <CardHeader title="How you pay" subtitle="Pay as you go is the default. Move to a commitment or a marketplace when it suits you." />
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
          {[
            { icon: CreditCard, title: "Pay as you go", body: "Usage is billed monthly in arrears to a credit or debit card, or a US bank account. No commitment.", on: a.model === "pay-as-you-go" },
            { icon: Landmark, title: "Annual commitment", body: "Commit to a minimum spend over a year for volume discounts and invoicing. It applies across metered features and support plans.", on: a.model === "commitment" },
            { icon: Store, title: "Cloud marketplace", body: "Subscribe through AWS, Google Cloud or Azure and bill through that account, as pay as you go or with a commitment. Resources must run in the same cloud.", on: a.model === "marketplace" },
          ].map((m) => (
            <div key={m.title} className="px-5 py-4">
              <div className="flex items-center gap-2 mb-1.5"><m.icon size={16} className="text-text-tertiary" /><span className="text-[13px] font-semibold text-text-primary">{m.title}</span>{m.on && <Badge tone="healthy">current</Badge>}</div>
              <p className="text-xs text-text-secondary leading-relaxed">{m.body}</p>
              {!m.on && <Link href="/contact" className="mt-2 inline-block text-xs font-medium text-text-primary underline underline-offset-4 hover:text-accent-700">Talk to sales</Link>}
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <CardHeader title="Support plans" subtitle="Business hours or 24x7, with response targets" />
        <CardBody><p className="text-[13px] text-text-secondary leading-relaxed">Each plan has a monthly minimum. When usage is higher, support is charged as a share of usage. The projected cost for the month is shown separately and is not part of current accrued charges until the month closes. A downgrade takes effect at the end of the calendar month. <Link href="/contact" className="underline underline-offset-4 hover:text-text-primary">Talk to sales</Link> to add a plan.</p></CardBody>
      </Card>
    </div>
  );
}
