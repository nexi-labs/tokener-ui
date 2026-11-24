"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/mlops/ui";
import { useBilling } from "@/lib/billing/useBilling";
import { CARD_FEATURES, creditLeft, needsPaymentMethod, startState, usd, type PaidFeature } from "@/lib/billing/model";
import { PaymentModal } from "./PaymentModal";

type Gate = (feature: PaidFeature, proceed: () => void | Promise<void>) => void;
const Ctx = createContext<Gate | null>(null);

/**
 * Anyone can try a feature. The moment they save or launch something that is metered, and the organization has no payment method yet, this
 * asks for one and then carries on with exactly what they were doing. Nothing is charged while free credit covers the usage; the dialog says so.
 * With a payment method on file, or where billing cannot be read, the action simply proceeds, and the billing service stays the authority.
 */
export function PaymentGateProvider({ children }: { children: ReactNode }) {
  const b = useBilling();
  const [pending, setPending] = useState<{ feature: PaidFeature } | null>(null);
  const [pay, setPay] = useState(false);
  const next = useRef<(() => void | Promise<void>) | null>(null);
  const bill = useRef(b); bill.current = b;

  const gate = useCallback<Gate>((feature, proceed) => {
    const cur = bill.current;
    if (cur.status === "ready" && needsPaymentMethod(cur.account)) { next.current = proceed; setPending({ feature }); return; }
    void proceed();
  }, []);

  const close = () => { setPending(null); setPay(false); next.current = null; };
  const info = pending ? CARD_FEATURES.find((f) => f.id === pending.feature) : null;
  const a = b.status === "ready" ? b.account : null;
  const ended = a ? startState(a) === "ended" : false;

  return (
    <Ctx.Provider value={useMemo(() => gate, [gate])}>
      {children}
      <Modal open={!!pending && !pay} onClose={close} title="Add a payment method to continue"
        footer={<><Button variant="secondary" onClick={close}>Not now</Button><Button variant="primary" onClick={() => setPay(true)}><CreditCard size={14} /> Add payment method</Button></>}>
        <div className="space-y-3 text-[13px] text-text-secondary">
          <p className="text-text-primary">{info?.title ?? "This"} needs a payment method on file.</p>
          <p>You can keep trying features without one. We ask when you save or launch something that is metered, so a card is on file if usage goes past the free allowance.</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>{a && !ended ? `You are not charged while your free credit covers it. ${usd(creditLeft(a))} is left.` : "Your free start has ended, so usage is billed to the card from now on."}</li>
            <li>Usage beyond the free credit is billed to this payment method, accrued hourly and invoiced monthly in arrears. A credit or debit card or a US bank account works.</li>
            <li>There is no hard cap. Set budgets and alerts in the console to stay in control.</li>
          </ul>
        </div>
      </Modal>
      {b.status === "ready" && (
        <PaymentModal open={!!pending && pay} onClose={() => setPay(false)} driver={b.driver}
          onSaved={(acc) => { b.adopt(acc); const go = next.current; close(); void go?.(); }} />
      )}
    </Ctx.Provider>
  );
}

/** Returns a function that runs an action once a payment method is on file, asking for one first if it is not. */
export function usePaymentGate(): Gate {
  return useContext(Ctx) ?? ((_f, proceed) => void proceed());
}
