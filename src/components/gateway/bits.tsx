"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { SimpleIcon } from "@/components/icons/SimpleIcon";
import { Wind } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { Provider } from "@/lib/gateway/data";

/** Marks figures that come from the sample workspace so nobody mistakes them for measurements of their own traffic. */
export function SampleTag() {
  const { status } = useAuth();
  if (status === "session") return null;
  return <span className="inline-flex items-center rounded border border-dashed border-border-strong px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-tertiary">Sample data</span>;
}

export function Back({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary"><ArrowLeft size={13} /> {label}</Link>;
}

export function ProviderMark({ p, size = 40 }: { p: Pick<Provider, "icon">; size?: number }) {
  return (
    <div className="rounded-md bg-surface-muted flex items-center justify-center shrink-0" style={{ height: size, width: size }}>
      {/* Mistral has no brand entry in simple-icons, so a generic glyph is used rather than a lookalike logo. */}
      {p.icon ? <SimpleIcon icon={p.icon} size={size / 2} monochrome={false} /> : <Wind size={size / 2.2} className="text-text-secondary" />}
    </div>
  );
}

export const HealthPill = ({ s }: { s: "healthy" | "degraded" | "down" }) => <Badge tone={s}>{s}</Badge>;
export const fmtInt = (n: number) => n.toLocaleString("en-US");
export const usd = (n: number, d = 2) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });
