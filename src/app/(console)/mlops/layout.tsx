"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { RefreshCw, RotateCcw } from "lucide-react";
import { MLOPS_PAGES } from "@/lib/nav";
import { mlops, reloadLive, useMlops, useMlopsStatus } from "@/lib/mlops/store";
import { ROLE_LABEL, type RoleId } from "@/lib/mlops/types";
import { toast } from "@/lib/mlops/toast";
import { DemoBanner, Loading, Notice, Toaster } from "@/components/mlops/ui";

/** Shorter names for the section strip so every section fits on one row. The full names stay in the sidebar, breadcrumb and page titles. */
const SHORT: Record<string, string> = { "/mlops/mcp-servers": "MCP servers", "/mlops/canvas": "AI canvas", "/mlops/data-services": "Data and AI", "/mlops/build-agents": "Build agents", "/mlops/settings": "Settings" };

export default function MlopsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const s = useMlops();
  const st = useMlopsStatus();
  const live = st.mode === "live";
  // Pipeline builder pages use the full viewport width and keep their own chrome.
  const immersive = /^\/mlops\/pipelines\/[^/]+\/(edit|wizard)$/.test(pathname);
  const active = [...MLOPS_PAGES].sort((a, b) => b.href.length - a.href.length).find((p) => pathname === p.href || pathname.startsWith(p.href + "/"));

  return (
    <div className="space-y-4">
      {!immersive && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav aria-label="MLOps sections" className="flex flex-wrap gap-x-0.5 gap-y-1 max-w-full">
              {MLOPS_PAGES.map((p) => {
                const on = active?.href === p.href;
                return (
                  <Link key={p.href} href={p.href} aria-current={on ? "page" : undefined}
                    className={clsx("h-8 px-2 inline-flex items-center rounded-md text-[13px] font-medium whitespace-nowrap transition-colors", on ? "bg-emph text-on-emph" : "text-text-secondary hover:bg-surface-muted hover:text-text-primary")}>
                    {SHORT[p.href] ?? p.label}
                  </Link>
                );
              })}
            </nav>
            {s && !live && (
              <div className="flex items-center gap-2 text-xs text-text-tertiary">
                <label htmlFor="demo-role">Viewing as</label>
                <select id="demo-role" value={s.role} onChange={(e) => mlops.setRole(e.target.value as RoleId)} className="h-8 rounded-md border border-border-strong bg-surface px-2 text-[13px] text-text-primary">
                  {(Object.keys(ROLE_LABEL) as RoleId[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
                <button onClick={async () => { await mlops.resetDemo(); toast("Sample data reset to the seeded state", "info"); }} className="h-8 px-2 inline-flex items-center gap-1.5 rounded-md hover:bg-surface-muted text-text-secondary">
                  <RotateCcw size={13} /> Reset sample data
                </button>
              </div>
            )}
            {s && live && st.phase !== "error" && (
              <div className="flex items-center gap-2 text-xs text-text-tertiary">
                <span>Your role: <span className="font-medium text-text-primary">{ROLE_LABEL[s.role]}</span></span>
                <button onClick={reloadLive} disabled={st.phase === "loading"} className="h-8 px-2 inline-flex items-center gap-1.5 rounded-md hover:bg-surface-muted text-text-secondary disabled:opacity-50">
                  <RefreshCw size={13} className={st.phase === "loading" ? "animate-spin" : ""} /> Refresh
                </button>
              </div>
            )}
          </div>
          {!live && <DemoBanner />}
          {live && st.partial && st.phase === "ready" && (
            <Notice tone="warn" title="Some sections did not load">
              {st.partial.join(", ")} could not be read just now, so what you see for them may be out of date. <button onClick={reloadLive} className="underline">Try again</button>
            </Notice>
          )}
        </>
      )}
      {live && st.phase === "error" ? (
        <div className="rounded-lg border border-border bg-surface p-6 max-w-xl">
          <h2 className="text-base font-semibold">MLOps could not be loaded</h2>
          <p className="text-sm text-text-secondary mt-1.5">{st.error ?? "The control plane did not answer."}</p>
          <button onClick={reloadLive} className="mt-4 h-9 px-3 inline-flex items-center gap-1.5 rounded-md bg-emph text-on-emph text-[13px] font-medium"><RefreshCw size={13} /> Try again</button>
        </div>
      ) : s && !(live && st.phase !== "ready") ? children : <Loading />}
      <Toaster />
    </div>
  );
}
