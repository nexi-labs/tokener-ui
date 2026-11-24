"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { REFINERY_PAGES } from "@/lib/nav";
import { useRefineryRole } from "@/components/refinery/bits";
import { SampleGate } from "@/components/gateway/SampleGate";
import { Toaster } from "@/components/mlops/ui";
import { resetRefinery, useRefineryStatus, reloadRefinery } from "@/lib/refinery/store";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Loader2, Database } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { toast } from "@/lib/mlops/toast";

/** Screens that read and write the control plane in a signed-in workspace. Every other screen shows the sample workspace only, until its slice is connected. */
const LIVE_PAGES = ["/refinery/runners", "/refinery/connections", "/refinery/datasets", "/refinery/recipes", "/refinery/runs", "/refinery/streams", "/refinery/activity", "/refinery/sovereignty"];
const LIVE_EXACT = ["/refinery"];
const NOT_LIVE: string[] = [];
const isLivePath = (p: string) => !NOT_LIVE.some((x) => p === x || p.startsWith(x + "/")) && (LIVE_EXACT.includes(p) || LIVE_PAGES.some((x) => p === x || p.startsWith(x + "/")));

const TITLE = "Refinery";
const DESCRIPTION = "Prepare data for AI: connect sources, clean and shape data with recipes, and run them at scale.";

export default function RefineryLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { status: auth } = useAuth();
  const st = useRefineryStatus();
  if (auth === "session") {
    // A signed-in workspace shows only what the platform returns, and never the sample figures.
    if (!isLivePath(pathname)) return <><Subnav pathname={pathname} />
      <Card><EmptyState icon={Database} title="Not connected to your workspace yet" description="This screen does not read from the platform yet, so it shows nothing rather than example figures. The sample workspace shows how the rest will look." /></Card></>;
    if (st.phase === "loading" || st.phase === "idle") return <><Subnav pathname={pathname} /><div className="grid place-items-center py-24" role="status" aria-label="Loading"><Loader2 className="animate-spin text-text-tertiary" size={20} /></div></>;
    if (st.phase === "error") return <><Subnav pathname={pathname} /><Card><EmptyState icon={Database} title="Could not load the Refinery" description={st.error ?? "Try again."} action={<Button onClick={() => reloadRefinery()}>Try again</Button>} /></Card></>;
    return <div className="space-y-5"><Subnav pathname={pathname} />{children}<Toaster /></div>;
  }
  return <SampleLayout pathname={pathname}>{children}</SampleLayout>;
}

/** The activity trail is the record of who changed what, so only an admin sees its tab, and only in a signed-in workspace. */
function Subnav({ pathname }: { pathname: string }) {
  const role = useRefineryRole();
  const pages = REFINERY_PAGES.filter((p) => p.href !== "/refinery/activity" || role === "admin");
  const active = [...pages].sort((a, b) => b.href.length - a.href.length).find((p) => pathname === p.href || pathname.startsWith(p.href + "/"));
  return (
    <nav aria-label="Refinery sections" className="flex flex-wrap gap-x-0.5 gap-y-1 mb-5">
      {pages.map((p) => {
        const on = active?.href === p.href;
        return (
          <Link key={p.href} href={p.href} aria-current={on ? "page" : undefined}
            className={clsx("h-8 px-2.5 inline-flex items-center rounded-md text-[13px] font-medium whitespace-nowrap transition-colors", on ? "bg-emph text-on-emph" : "text-text-secondary hover:bg-surface-muted hover:text-text-primary")}>
            {p.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SampleLayout({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  const pages = REFINERY_PAGES.filter((p) => p.href !== "/refinery/activity");
  const active = [...pages].sort((a, b) => b.href.length - a.href.length).find((p) => pathname === p.href || pathname.startsWith(p.href + "/"));
  return (
    <SampleGate title={TITLE} description={DESCRIPTION}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Refinery sections" className="flex flex-wrap gap-x-0.5 gap-y-1">
            {pages.map((p) => {
              const on = active?.href === p.href;
              return (
                <Link key={p.href} href={p.href} aria-current={on ? "page" : undefined}
                  className={clsx("h-8 px-2.5 inline-flex items-center rounded-md text-[13px] font-medium whitespace-nowrap transition-colors", on ? "bg-emph text-on-emph" : "text-text-secondary hover:bg-surface-muted hover:text-text-primary")}>
                  {p.label}
                </Link>
              );
            })}
          </nav>
          <button onClick={() => { resetRefinery(); toast("Sample data reset to the seeded state", "info"); }} className="h-8 px-2 inline-flex items-center gap-1.5 rounded-md hover:bg-surface-muted text-text-secondary text-xs">
            <RotateCcw size={13} /> Reset sample data
          </button>
        </div>
        {children}
      </div>
      <Toaster />
    </SampleGate>
  );
}
