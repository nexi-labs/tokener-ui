"use client";

import Link from "next/link";
import clsx from "clsx";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { DemoLink } from "./DemoLink";

type Variant = "accent" | "ink" | "ghost-dark" | "outline";

const STYLES: Record<Variant, string> = {
  accent: "bg-accent-500 text-ink-900 hover:bg-accent-300",
  ink: "bg-ink-800 text-text-inverse hover:bg-ink-700",
  "ghost-dark": "border border-white/25 text-text-inverse hover:bg-white/10",
  outline: "border border-border-strong text-text-primary hover:bg-surface-muted",
};

/**
 * A link from the public site into the console. The console is for signed-in people, so a visitor is sent to sign in and returned to the same
 * page afterwards, and the label says so. Someone who is signed in, or already looking around the demo workspace, goes straight there.
 * With demo set, a visitor also gets a clearly labelled way to preview the same page with sample data.
 */
export function ConsoleLink({
  href, children, signedOut, variant = "accent", arrow, className, demo, dark,
}: {
  href: string; children: React.ReactNode; signedOut?: React.ReactNode; variant?: Variant; arrow?: boolean; className?: string;
  /** Offer "preview with sample data" beside the sign-in button. */
  demo?: boolean; dark?: boolean;
}) {
  const { status } = useAuth();
  const visitor = status === "anonymous" || status === "loading";
  const target = visitor ? `/login?next=${encodeURIComponent(href)}` : href;
  const button = (
    <Link
      href={target}
      className={clsx("inline-flex items-center justify-center gap-2 h-11 px-5 rounded-md text-sm font-semibold transition-colors whitespace-nowrap", STYLES[variant], className)}
    >
      {visitor ? (signedOut ?? children) : children}
      {arrow && <ArrowRight size={15} />}
    </Link>
  );
  if (!demo || !visitor) return button;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      {button}
      <DemoLink href={href} className={clsx("text-sm font-medium underline underline-offset-4 decoration-current/30 hover:decoration-current", dark ? "text-text-tertiary hover:text-text-inverse" : "text-text-secondary hover:text-text-primary")}>
        Preview it with sample data
      </DemoLink>
    </div>
  );
}
