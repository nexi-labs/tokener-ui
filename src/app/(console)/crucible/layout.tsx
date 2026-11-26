"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2, RotateCcw, FlaskConical } from "lucide-react";
import { CRUCIBLE_PAGES } from "@/lib/nav";
import { SampleGate } from "@/components/gateway/SampleGate";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Toaster } from "@/components/mlops/ui";
import { resetCrucible } from "@/lib/crucible/store";
import { reloadCrucible, useCrucibleCan, useCrucibleStatus } from "@/lib/crucible/live/store";
import { useAuth } from "@/lib/auth/AuthProvider";
import { toast } from "@/lib/mlops/toast";
import { mlops, useMlops } from "@/lib/mlops/store";
import { ROLE_LABEL, type RoleId } from "@/lib/mlops/types";

/** Screens that read and write the training service in a signed-in workspace. Jobs and continuous training have no service behind them yet, so they say so rather than show sample figures. */
const NOT_LIVE = ["/crucible/jobs", "/crucible/continuous"];
const BOTH = ["/crucible/memory", "/crucible/adapters"];
const isNotLive = (p: string) => NOT_LIVE.some((x) => p === x || p.startsWith(x + "/"));
const isBoth = (p: string) => BOTH.some((x) => p === x || p.startsWith(x + "/"));

const TITLE = "Crucible";
const DESCRIPTION = "Track experiments, run training jobs, keep models fresh from new data and plan GPU memory before a job starts.";

export default function CrucibleLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { status: auth } = useAuth();
  const st = useCrucibleStatus();
  if (auth === "session") {
    if (isBoth(pathname)) return <div className="space-y-5"><Subnav pathname={pathname} />{children}<Toaster /></div>;
    if (isNotLive(pathname)) return <><Subnav pathname={pathname} />
      <Card><EmptyState icon={FlaskConical} title="Not connected to your workspace yet" description="This screen does not read from the platform yet, so it shows nothing rather than example figures. Projects, experiments, runs, datasets, storage and lineage are live." /></Card></>;
    if (st.phase === "loading" || st.phase === "idle") return <><Subnav pathname={pathname} /><div className="grid place-items-center py-24" role="status" aria-label="Loading"><Loader2 className="animate-spin text-text-tertiary" size={20} /></div></>;
    if (st.phase === "error") return <><Subnav pathname={pathname} /><Card><EmptyState icon={FlaskConical} title="Could not load Crucible" description={st.error ?? "Try again."} action={<Button onClick={() => reloadCrucible()}>Try again</Button>} /></Card></>;
    return <div className="space-y-5"><Subnav pathname={pathname} />{children}<Toaster /></div>;
  }
  return <SampleLayout pathname={pathname}>{children}</SampleLayout>;
}

/** The activity trail is the record of who changed what, so only an admin sees its tab, and only in a signed-in workspace. */
function Subnav({ pathname }: { pathname: string }) {
  const admin = useCrucibleCan()("settings");
  const pages = CRUCIBLE_PAGES.filter((p) => p.href !== "/crucible/activity" || admin);
  return <Tabs pages={pages} pathname={pathname} className="mb-5" />;
}

function Tabs({ pages, pathname, className }: { pages: typeof CRUCIBLE_PAGES; pathname: string; className?: string }) {
  const active = [...pages].sort((a, b) => b.href.length - a.href.length).find((p) => pathname === p.href || pathname.startsWith(p.href + "/"));
  return (
    <nav aria-label="Crucible sections" className={clsx("flex flex-wrap gap-x-0.5 gap-y-1", className)}>
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
  const m = useMlops();
  const pages = CRUCIBLE_PAGES.filter((p) => p.href !== "/crucible/activity");
  return (
    <SampleGate title={TITLE} description={DESCRIPTION}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs pages={pages} pathname={pathname} />
          <div className="flex items-center gap-3">
            <label htmlFor="crucible-role" className="flex items-center gap-2 text-[13px] text-text-secondary">Viewing as
              <select id="crucible-role" value={m?.role ?? "viewer"} onChange={(e) => mlops.setRole(e.target.value as RoleId)} className="h-8 rounded-md border border-border-strong bg-surface px-2 text-[13px] text-text-primary">
                {(Object.keys(ROLE_LABEL) as RoleId[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </label>
            <button onClick={() => { resetCrucible(); toast("Sample data reset to the seeded state", "info"); }} className="h-8 px-2 inline-flex items-center gap-1.5 rounded-md hover:bg-surface-muted text-[13px] text-text-secondary">
              <RotateCcw size={13} /> Reset sample data
            </button>
          </div>
        </div>
        {children}
      </div>
      <Toaster />
    </SampleGate>
  );
}
