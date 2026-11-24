"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { mlops, useMlops, useMlopsStatus } from "@/lib/mlops/store";
import { ROLE_LABEL, type RoleId } from "@/lib/mlops/types";
import { DemoBanner, Loading, Toaster } from "@/components/mlops/ui";

const TABS = [
  { href: "/pipeline-studio", label: "Pipelines" },
  { href: "/pipeline-studio/request-path", label: "Request path" },
];

/**
 * Pipeline Studio has two surfaces: operator pipelines (the full catalogue, saved and run from here) and the request path every gateway call
 * takes. The canvas builder uses the full viewport, so it hides this header.
 */
export default function StudioLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const s = useMlops();
  const st = useMlopsStatus();
  const live = st.mode === "live";
  const request = pathname.startsWith("/pipeline-studio/request-path");
  const immersive = /^\/pipeline-studio\/(?!new$|request-path)[^/]+(\/wizard)?$/.test(pathname);

  if (request) return <>{!immersive && <StudioTabs pathname={pathname} />}{children}</>;
  return (
    <div className="space-y-4">
      {!immersive && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StudioTabs pathname={pathname} />
          {s && !live && (
            <div className="flex items-center gap-2 text-xs text-text-tertiary">
              <label htmlFor="studio-role">Viewing as</label>
              <select id="studio-role" value={s.role} onChange={(e) => mlops.setRole(e.target.value as RoleId)} className="h-8 rounded-md border border-border-strong bg-surface px-2 text-[13px] text-text-primary">
                {(Object.keys(ROLE_LABEL) as RoleId[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </div>
          )}
        </div>
      )}
      {!immersive && !live && s && <DemoBanner />}
      {s && !(live && st.phase !== "ready") ? children : <Loading />}
      <Toaster />
    </div>
  );
}

function StudioTabs({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Pipeline Studio" className="flex gap-0.5 mb-3">
      {TABS.map((t) => {
        const on = t.href === "/pipeline-studio" ? !pathname.startsWith("/pipeline-studio/request-path") : pathname.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined}
            className={clsx("h-9 px-3 inline-flex items-center rounded-md text-[13px] font-medium whitespace-nowrap transition-colors", on ? "bg-emph text-on-emph" : "text-text-secondary hover:bg-surface-muted hover:text-text-primary")}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
