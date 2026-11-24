"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useBilling } from "@/lib/billing/useBilling";
import { creditLeft, daysLeft, FREE_START, needsPaymentMethod, startState, usd } from "@/lib/billing/model";
import { PaymentModal } from "./PaymentModal";

/**
 * A quiet indicator in the top bar while the free start runs: what is left, with the detail one click away. It does not ask for a card. The
 * card is asked for in context, when someone saves or launches something metered, and on the Billing page for anyone who wants to add it early.
 */
export function CreditChip() {
  const b = useBilling();
  const [open, setOpen] = useState(false);
  const [pay, setPay] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", h); document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [open]);
  if (b.status !== "ready" || !needsPaymentMethod(b.account)) return null;
  const a = b.account;
  const ended = startState(a) === "ended";
  const left = creditLeft(a), total = a.start.creditUsd + a.promoCreditUsd;
  const pct = Math.min(100, Math.round(((total - left) / total) * 100));
  const days = daysLeft(a);
  return (
    <div className="relative hidden sm:block" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog"
        className={clsx("h-9 pl-3 pr-2 rounded-md inline-flex items-center gap-2 text-[13px] border hover:bg-surface-muted", ended ? "border-status-down/40 text-status-down" : "border-border text-text-secondary")}>
        <span className={clsx("h-1.5 w-1.5 rounded-full", ended ? "bg-status-down" : "bg-accent-500")} aria-hidden />
        <span className="font-medium text-text-primary">{ended ? "Free start ended" : `${usd(left)} credit`}</span>
        {!ended && <span className="hidden lg:inline text-text-tertiary">{days}d left</span>}
        <ChevronDown size={13} className="text-text-tertiary" />
      </button>
      {open && (
        <div role="dialog" aria-label="Free start" className="absolute right-0 mt-1.5 w-[320px] bg-surface border border-border rounded-lg shadow-popover p-4 z-40">
          <div className="text-[13px] font-semibold text-text-primary">{ended ? "Your free start has ended" : "Free start"}</div>
          {!ended && (
            <>
              <div className="mt-3 h-1.5 w-full rounded-full bg-surface-muted overflow-hidden" aria-hidden><div className="h-full bg-accent-500" style={{ width: `${pct}%` }} /></div>
              <div className="mt-1.5 flex justify-between text-xs text-text-tertiary tabular-nums"><span>{usd(total - left)} used</span><span>{usd(left)} left of {usd(total)}</span></div>
              <p className="mt-3 text-xs text-text-secondary">{days} day{days === 1 ? "" : "s"} remaining. The credit ends after {FREE_START.days} days or when it is used. Nothing is charged while it covers your usage.</p>
            </>
          )}
          <p className="mt-3 text-xs text-text-secondary">{ended ? "Add a payment method or redeem a promo code to restore access." : "You will be asked for a payment method when you save or launch something metered."}</p>
          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-[13px]">
            <Link href="/billing" onClick={() => setOpen(false)} className="font-medium text-text-primary hover:underline">Billing and usage</Link>
            <button onClick={() => { setOpen(false); setPay(true); }} className="text-text-secondary hover:text-text-primary hover:underline">Add payment method</button>
          </div>
        </div>
      )}
      <PaymentModal open={pay} onClose={() => setPay(false)} driver={b.driver} onSaved={(acc) => b.adopt(acc)} />
    </div>
  );
}
