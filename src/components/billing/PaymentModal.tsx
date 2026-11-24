"use client";

import clsx from "clsx";
import { useState } from "react";
import { Landmark, Lock, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { Modal, Notice } from "@/components/mlops/ui";
import { useAuth } from "@/lib/auth/AuthProvider";
import { brandOf, startPaymentSession, type BillingAccount, type BillingDriver } from "@/lib/billing/model";

const YEARS = Array.from({ length: 12 }, (_, i) => new Date().getFullYear() + i);
type Kind = "card" | "bank";

/**
 * Adds or changes the payment method. An organization has one active method at a time: a credit or debit card, or a US bank account. In a
 * signed-in workspace the details are entered in a form hosted by the payment processor, so card and account numbers never reach tok∑ner: this
 * dialog only sends the person there. In the sample workspace a form collects them so the flow can be tried, keeps only the brand or bank and the
 * last four digits, and processes nothing. Prepaid cards are not supported.
 */
export function PaymentModal({ open, onClose, driver, onSaved }: { open: boolean; onClose: () => void; driver: BillingDriver; onSaved: (a: BillingAccount) => void }) {
  const { orgId } = useAuth();
  const [kind, setKind] = useState<Kind>("card");
  const [holder, setHolder] = useState("");
  const [number, setNumber] = useState("");
  const [expMonth, setExpMonth] = useState(String(new Date().getMonth() + 1));
  const [expYear, setExpYear] = useState(String(new Date().getFullYear() + 2));
  const [cvc, setCvc] = useState("");
  const [routing, setRouting] = useState("");
  const [account, setAccount] = useState("");
  const [accountType, setAccountType] = useState<"checking" | "savings">("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sample = driver.mode === "sample";

  const submit = async () => {
    setError(null); setBusy(true);
    try {
      if (sample) {
        onSaved(await driver.addPaymentMethod(kind === "card"
          ? { holder, number, expMonth: Number(expMonth), expYear: Number(expYear), cvc }
          : { holder, routing: routing.replace(/\D/g, ""), account: account.replace(/\D/g, ""), accountType }));
        setHolder(""); setNumber(""); setCvc(""); setRouting(""); setAccount("");
        onClose();
      } else {
        const { url } = await startPaymentSession(orgId!);
        window.location.assign(url);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong. Try again."); setBusy(false); }
    if (sample) setBusy(false);
  };

  const grouped = number.replace(/\D/g, "").slice(0, 19).replace(/(.{4})/g, "$1 ").trim();
  const Tab = ({ id, icon: Icon, label }: { id: Kind; icon: typeof CreditCard; label: string }) => (
    <button type="button" role="tab" aria-selected={kind === id} onClick={() => { setKind(id); setError(null); }}
      className={clsx("flex-1 h-10 inline-flex items-center justify-center gap-2 rounded-md border text-[13px] font-medium", kind === id ? "border-accent-600 bg-accent-50/40 text-text-primary" : "border-border text-text-secondary hover:bg-surface-muted")}>
      <Icon size={15} /> {label}
    </button>
  );
  return (
    <Modal open={open} onClose={onClose} title="Payment method"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit} disabled={busy}>{sample ? (busy ? "Saving..." : kind === "card" ? "Save card" : "Save bank account") : busy ? "Opening..." : "Continue to secure form"}</Button></>}>
      <div className="space-y-4">
        <div role="tablist" aria-label="Payment method type" className="flex gap-2">
          <Tab id="card" icon={CreditCard} label="Credit or debit card" />
          <Tab id="bank" icon={Landmark} label="US bank account" />
        </div>
        {sample ? (
          <>
            <Notice tone="info" title="Sample workspace">Nothing is charged and the number is not kept. Try {kind === "card" ? "4242 4242 4242 4242" : "routing 021000021 and any account number"}.</Notice>
            {error && <Notice tone="bad">{error}</Notice>}
            {kind === "card" ? (
              <>
                <Field label="Name on card"><Input autoComplete="cc-name" value={holder} onChange={(e) => setHolder(e.target.value)} /></Field>
                <Field label="Card number" hint={number ? brandOf(number) : "Visa, Mastercard, American Express and Discover. Prepaid cards are not supported."}>
                  <Input inputMode="numeric" autoComplete="cc-number" placeholder="1234 1234 1234 1234" value={grouped} onChange={(e) => setNumber(e.target.value)} />
                </Field>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Month"><Select value={expMonth} onChange={(e) => setExpMonth(e.target.value)}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{String(i + 1).padStart(2, "0")}</option>)}</Select></Field>
                  <Field label="Year"><Select value={expYear} onChange={(e) => setExpYear(e.target.value)}>{YEARS.map((y) => <option key={y} value={y}>{y}</option>)}</Select></Field>
                  <Field label="Security code"><Input inputMode="numeric" autoComplete="cc-csc" maxLength={4} value={cvc} onChange={(e) => setCvc(e.target.value.replace(/\D/g, ""))} /></Field>
                </div>
              </>
            ) : (
              <>
                <Field label="Account holder name"><Input value={holder} onChange={(e) => setHolder(e.target.value)} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Routing number"><Input inputMode="numeric" maxLength={9} value={routing} onChange={(e) => setRouting(e.target.value.replace(/\D/g, ""))} /></Field>
                  <Field label="Account type"><Select value={accountType} onChange={(e) => setAccountType(e.target.value as "checking" | "savings")}><option value="checking">Checking</option><option value="savings">Savings</option></Select></Field>
                </div>
                <Field label="Account number"><Input inputMode="numeric" maxLength={17} value={account} onChange={(e) => setAccount(e.target.value.replace(/\D/g, ""))} /></Field>
              </>
            )}
          </>
        ) : (
          <>
            {error && <Notice tone="bad">{error}</Notice>}
            <p className="text-text-secondary leading-relaxed">You will enter {kind === "card" ? "your card" : "your bank account"} in a secure form hosted by our payment processor. The details never reach tok&sum;ner servers, and you come straight back here afterwards.</p>
          </>
        )}
        <p className="flex items-start gap-2 text-xs text-text-tertiary"><Lock size={13} className="mt-0.5 shrink-0" />One payment method per organization. Replacing it takes effect for the next charge. Your free credit is used first, then usage is billed monthly in arrears.</p>
      </div>
    </Modal>
  );
}
