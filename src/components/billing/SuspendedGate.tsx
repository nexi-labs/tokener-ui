"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { PauseCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useBilling } from "@/lib/billing/useBilling";
import { suspension, SUSPENSION_GRACE_DAYS } from "@/lib/billing/model";
import { PaymentModal } from "./PaymentModal";

/** Screens an organization can still reach while suspended: billing, to fix it, and the person's own account. */
const OPEN = ["/billing", "/account"];

/**
 * When the free start has ended and there is no payment method, the organization is suspended, as in Confluent Cloud: features are unavailable
 * and data cannot be reached until a payment method is added or a promo code is redeemed. This replaces the page with that explanation and the
 * two ways out. Billing and account stay open.
 */
export function SuspendedGate({ children }: { children: ReactNode }) {
  const b = useBilling();
  const path = usePathname();
  const router = useRouter();
  const [pay, setPay] = useState(false);
  if (b.status !== "ready" || OPEN.some((p) => path === p || path.startsWith(p + "/"))) return <>{children}</>;
  const s = suspension(b.account);
  if (!s) return <>{children}</>;
  return (
    <div className="max-w-xl mx-auto mt-16 text-center">
      <span className="h-12 w-12 rounded-full bg-surface-muted grid place-items-center mx-auto text-text-secondary"><PauseCircle size={24} /></span>
      <h1 className="mt-4 text-xl font-semibold tracking-tight text-text-primary">Your organization is suspended</h1>
      <p className="mt-2 text-sm text-text-secondary leading-relaxed">
        The free start has ended and there is no payment method on file, so features are unavailable and your data cannot be reached.
        Add a payment method or redeem a promo code to restore access straight away.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2.5">
        <Button variant="primary" onClick={() => setPay(true)}>Add payment method</Button>
        <Button variant="secondary" onClick={() => router.push("/billing")}>Redeem a promo code</Button>
      </div>
      <p className="mt-5 text-xs text-text-tertiary leading-relaxed">
        If nothing changes within {SUSPENSION_GRACE_DAYS} days, your resources are deleted ({s.daysToDelete} day{s.daysToDelete === 1 ? "" : "s"} left). Your organization and its people are kept, and you can still reactivate it afterwards.
        Need more time? <Link href="/contact" className="underline underline-offset-4 hover:text-text-primary">Talk to sales</Link> about an extension.
      </p>
      <PaymentModal open={pay} onClose={() => setPay(false)} driver={b.driver} onSaved={(acc) => b.adopt(acc)} />
    </div>
  );
}
