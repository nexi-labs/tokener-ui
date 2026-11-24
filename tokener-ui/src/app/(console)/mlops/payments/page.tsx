"use client";

import { CreditCard } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { DemoTag, Drawer, EnvBadge, GuardButton, Kpi, KeyValue, Modal, Notice, fmtDate, money, relTime, useRole } from "@/components/mlops/ui";
import { mlops, useMlops } from "@/lib/mlops/store";
import { toast } from "@/lib/mlops/toast";
import { PAYMENT_STATE_LABEL, REVIEW_REASON_LABEL, type Payment, type PaymentState } from "@/lib/mlops/types";

const TONE: Record<PaymentState, "healthy" | "degraded" | "down" | "info" | "neutral"> = {
  created: "neutral", "link-sent": "info", pending: "info", paid: "healthy", failed: "down", expired: "neutral", review: "degraded", blocked: "down",
  "refund-pending": "degraded", refunded: "neutral", "refund-failed": "down",
};
const REFUND_TONE = { "awaiting-approval": "degraded", approved: "info", completed: "healthy", failed: "down", rejected: "neutral" } as const;

export default function PaymentsPage() {
  const s = useMlops()!;
  const role = useRole();
  const [filter, setFilter] = useState<"all" | "attention" | PaymentState>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = useMemo(() => s.payments.filter((p) => filter === "all" ? true : filter === "attention" ? (p.state === "review" || p.refunds.some((r) => r.state === "awaiting-approval")) : p.state === filter)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [s.payments, filter]);
  const review = s.payments.filter((p) => p.state === "review").length;
  const awaiting = s.payments.filter((p) => p.refunds.some((r) => r.state === "awaiting-approval")).length;
  const byCur = s.payments.filter((p) => p.state === "paid").reduce<Record<string, number>>((a, p) => ({ ...a, [p.currency]: (a[p.currency] ?? 0) + (p.paidMinor ?? 0) }), {});
  const received = Object.entries(byCur).map(([c, m]) => money(m, c)).join(" · ") || "none";
  const open = s.payments.find((p) => p.id === openId) ?? null;

  return (
    <div className="space-y-5">
      <PageHeader title="Payments" description="Every payment a pipeline collected, what the provider reported, and what a person still has to decide. Money is confirmed by the provider, never by a customer's say-so. Refunds need a second person." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Payments" value={s.payments.length} />
        <Kpi label="Needs review" value={review} tone={review ? "warn" : undefined} sub="Held until an approver decides" />
        <Kpi label="Refunds awaiting approval" value={awaiting} tone={awaiting ? "warn" : undefined} />
        <Kpi label="Received and settled" value={<span className="text-lg">{received}</span>} sub="Paid, per currency" />
      </div>
      <div className="flex items-center gap-3">
        <Select aria-label="Filter payments" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="max-w-xs">
          <option value="all">All payments</option>
          <option value="attention">Needs a decision</option>
          {(Object.keys(PAYMENT_STATE_LABEL) as PaymentState[]).map((k) => <option key={k} value={k}>{PAYMENT_STATE_LABEL[k]}</option>)}
        </Select>
        <DemoTag />
      </div>
      <Card>
        {rows.length === 0 ? <EmptyState icon={CreditCard} title="No payments match" description="Change the filter, or run a pipeline with a payment step." /> : (
          <Table>
            <Thead><tr><Th>Order</Th><Th>Provider</Th><Th>Amount</Th><Th>State</Th><Th>Environment</Th><Th>Updated</Th></tr></Thead>
            <tbody>
              {rows.map((p) => (
                <Tr key={p.id}>
                  <Td><button className="font-medium hover:underline" onClick={() => setOpenId(p.id)}>{p.orderRef}</button><div className="text-xs text-text-tertiary font-code">{p.id}</div></Td>
                  <Td className="text-text-secondary">{p.provider}</Td>
                  <Td className="tabular-nums">{money(p.amountMinor, p.currency)}</Td>
                  <Td><Badge tone={TONE[p.state]}>{PAYMENT_STATE_LABEL[p.state]}</Badge>{p.refunds.some((r) => r.state === "awaiting-approval") && <span className="ml-2 text-xs text-[#9A5F05]">refund waits</span>}</Td>
                  <Td><EnvBadge env={p.env} /></Td>
                  <Td className="text-text-secondary">{relTime(p.updatedAt)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <PaymentDrawer payment={open} onClose={() => setOpenId(null)} role={role} />
    </div>
  );
}

function PaymentDrawer({ payment: p, onClose, role }: { payment: Payment | null; onClose: () => void; role: ReturnType<typeof useRole> }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [manual, setManual] = useState<{ pid: string; rid: string } | null>(null);
  const [note, setNote] = useState("");
  const done = (r: { ok: boolean; error?: string }, msg: string) => { if (r.ok) { toast(msg); setErr(""); } else { setErr(r.error ?? "Failed"); } };
  const refundable = p ? (p.paidMinor ?? 0) - p.refundedMinor : 0;
  const canRefund = p && ["paid", "review", "refund-failed"].includes(p.state) && refundable > 0 && !p.refunds.some((r) => r.state === "awaiting-approval");

  return (
    <Drawer open={!!p} onClose={() => { setAmount(""); setReason(""); setErr(""); onClose(); }} title={p ? `${p.orderRef}` : ""} subtitle={p && <span className="inline-flex gap-2 items-center"><Badge tone={TONE[p.state]}>{PAYMENT_STATE_LABEL[p.state]}</Badge><span className="font-code">{p.id}</span></span>}>
      {p && (
        <div className="space-y-5 text-[13px]">
          {p.state === "review" && p.reviewReason && (
            <Notice tone="warn" title="Held for a person">
              {REVIEW_REASON_LABEL[p.reviewReason]}. Fulfilment does not start until an approver accepts or rejects it. The person who started the run cannot decide.
              <div className="flex gap-2 mt-3">
                <GuardButton action="run.approve" role={role} variant="primary" onClick={async () => done(await mlops.resolvePaymentReview(p.id, true), "Payment accepted")}>Accept payment</GuardButton>
                <GuardButton action="run.approve" role={role} onClick={async () => done(await mlops.resolvePaymentReview(p.id, false), "Payment rejected")}>Reject and refund</GuardButton>
              </div>
            </Notice>
          )}
          {p.state === "blocked" && <Notice tone="bad" title="Blocked by policy">{p.reviewReason ? REVIEW_REASON_LABEL[p.reviewReason] : "Blocked"}. No pay link was created. Raise the limit in Settings and access if this order is genuine.</Notice>}
          {err && <Notice tone="bad">{err}</Notice>}

          <section><h3 className="font-semibold mb-2">Payment</h3>
            <KeyValue rows={[
              ["Provider", p.provider], ["Amount", money(p.amountMinor, p.currency)],
              ["Received", p.paidMinor ? `${money(p.paidMinor, p.currency)}${p.paidAt ? ` (${fmtDate(p.paidAt)})` : ""}` : "Nothing yet"],
              ["Refunded", money(p.refundedMinor, p.currency)],
              ["Provider reference", <span className="font-code text-xs break-all">{p.providerTxn ?? "none yet"}</span>],
              ["Run", p.runId ?? "Created outside a run"], ["Created", fmtDate(p.createdAt)],
            ]} />
          </section>

          <section><h3 className="font-semibold mb-2">Refunds</h3>
            {p.refunds.length === 0 ? <p className="text-text-secondary">No refunds.</p> : (
              <ul className="space-y-3">
                {p.refunds.map((r) => (
                  <li key={r.id} className="rounded-md border border-border px-3.5 py-3">
                    <div className="flex items-center justify-between gap-3"><span className="font-medium tabular-nums">{money(r.amountMinor, p.currency)}</span><Badge tone={REFUND_TONE[r.state]}>{r.state.replace("-", " ")}</Badge></div>
                    <p className="text-text-secondary mt-1">{r.reason}</p>
                    <p className="text-xs text-text-tertiary mt-1">Requested by {r.requestedBy}{r.approvedBy ? `. Decided by ${r.approvedBy}` : ""}</p>
                    {(r.state === "approved" || r.state === "failed") && (
                      <div className="mt-3 space-y-2">
                        <p className="text-xs text-text-secondary">{r.state === "failed" ? "The provider could not complete this refund. If you paid it another way, record where, and the payment is marked refunded." : "The provider has not finished this refund. If you paid it another way, record where."}</p>
                        <GuardButton action="run.approve" role={role} onClick={() => { setManual({ pid: p.id, rid: r.id }); setNote(""); }}>Record as paid outside</GuardButton>
                      </div>
                    )}
                    {r.state === "awaiting-approval" && (
                      <div className="flex gap-2 mt-3">
                        <GuardButton action="run.approve" role={role} variant="primary" onClick={async () => done(await mlops.decideRefund(p.id, r.id, "approve"), "Refund approved")}>Approve refund</GuardButton>
                        <GuardButton action="run.approve" role={role} onClick={async () => done(await mlops.decideRefund(p.id, r.id, "reject"), "Refund rejected")}>Reject</GuardButton>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canRefund && (
              <div className="mt-4 space-y-3 rounded-md border border-dashed border-border-strong px-3.5 py-3">
                <div className="font-medium">Request a refund</div>
                <Field label={`Amount (${p.currency})`} hint={`Up to ${money(refundable, p.currency)}. An approver other than you must approve it.`}>
                  <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={(refundable / 100).toFixed(2)} />
                </Field>
                <Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why the customer is owed this" /></Field>
                <GuardButton action="pipeline.run" role={role} variant="primary" onClick={async () => {
                  const minor = Math.round(Number(amount === "" ? refundable / 100 : amount) * 100);
                  const r = await mlops.requestRefund(p.id, minor, reason);
                  done(r, "Refund requested. It waits for an approver.");
                  if (r.ok) { setAmount(""); setReason(""); }
                }}>Request refund</GuardButton>
              </div>
            )}
          </section>

          <section><h3 className="font-semibold mb-2">History</h3>
            <ol className="relative border-l border-border ml-1.5 space-y-3">
              {p.events.map((e) => (
                <li key={e.id} className="pl-4 relative">
                  <span className="absolute -left-[4.5px] top-1.5 h-2 w-2 rounded-full bg-border-strong" />
                  <div className="text-text-primary">{e.detail}</div>
                  <div className="text-xs text-text-tertiary">{fmtDate(e.at)} · {e.kind}</div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
      <Modal open={!!manual} onClose={() => setManual(null)} title="Record a refund paid outside the provider"
        footer={<><Button onClick={() => setManual(null)}>Cancel</Button><Button variant="primary" onClick={async () => { const r = await mlops.recordManualRefund(manual!.pid, manual!.rid, note); done(r, "Refund recorded"); if (r.ok) setManual(null); }}>Record refund</Button></>}>
        <div className="space-y-3"><p className="text-sm text-text-secondary">Use this when the money was returned another way, for example a bank transfer. The payment is marked refunded and the history shows who recorded it.</p>
          <Field label="Where was it paid?" hint="For example the bank transfer reference or the provider portal reference."><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bank transfer ref 20261121-0042" /></Field></div>
      </Modal>
    </Drawer>
  );
}
