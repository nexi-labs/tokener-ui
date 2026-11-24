"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { CRUCIBLE_PAGES } from "@/lib/nav";
import { SampleGate } from "@/components/gateway/SampleGate";
import { Toaster } from "@/components/mlops/ui";
import { resetCrucible } from "@/lib/crucible/store";
import { toast } from "@/lib/mlops/toast";
import { mlops, useMlops } from "@/lib/mlops/store";
import { ROLE_LABEL, type RoleId } from "@/lib/mlops/types";

const TITLE = "Crucible";
const DESCRIPTION = "Track experiments, run training jobs, keep models fresh from new data and plan GPU memory before a job starts.";

/** Crucible reads the platform's training service, which is not built yet. A signed-in workspace therefore shows the sample gate's "not connected" state. */
export default function CrucibleLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const m = useMlops();
  const active = [...CRUCIBLE_PAGES].sort((a, b) => b.href.length - a.href.length).find((p) => pathname === p.href || pathname.startsWith(p.href + "/"));
  return (
    <SampleGate title={TITLE} description={DESCRIPTION}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Crucible sections" className="flex flex-wrap gap-x-0.5 gap-y-1">
            {CRUCIBLE_PAGES.map((p) => {
              const on = active?.href === p.href;
              return (
                <Link key={p.href} href={p.href} aria-current={on ? "page" : undefined}
                  className={clsx("h-8 px-2.5 inline-flex items-center rounded-md text-[13px] font-medium whitespace-nowrap transition-colors", on ? "bg-emph text-on-emph" : "text-text-secondary hover:bg-surface-muted hover:text-text-primary")}>
                  {p.label}
                </Link>
              );
            })}
          </nav>
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
