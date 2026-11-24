"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { AGENT_PAGES } from "@/lib/nav";
import { SampleGate } from "@/components/gateway/SampleGate";
import { Toaster } from "@/components/mlops/ui";
import { resetAgents } from "@/lib/agents/store";
import { toast } from "@/lib/mlops/toast";

const TITLE = "Agent OS";
const DESCRIPTION = "Register, build, connect and govern AI agents: who owns each one, what it can reach, what it costs and what it did.";

/** Agent OS reads the platform's agent registry, which is not built yet. A signed-in workspace therefore shows the sample gate's "not connected" state. */
export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const active = [...AGENT_PAGES].sort((a, b) => b.href.length - a.href.length).find((p) => pathname === p.href || pathname.startsWith(p.href + "/"));
  return (
    <SampleGate title={TITLE} description={DESCRIPTION}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Agent OS sections" className="flex flex-wrap gap-x-0.5 gap-y-1">
            {AGENT_PAGES.map((p) => {
              const on = active?.href === p.href;
              return (
                <Link key={p.href} href={p.href} aria-current={on ? "page" : undefined}
                  className={clsx("h-8 px-2.5 inline-flex items-center rounded-md text-[13px] font-medium whitespace-nowrap transition-colors", on ? "bg-emph text-on-emph" : "text-text-secondary hover:bg-surface-muted hover:text-text-primary")}>
                  {p.label}
                </Link>
              );
            })}
          </nav>
          <button onClick={() => { resetAgents(); toast("Sample data reset to the seeded state", "info"); }} className="h-8 px-2 inline-flex items-center gap-1.5 rounded-md hover:bg-surface-muted text-text-secondary text-xs">
            <RotateCcw size={13} /> Reset sample data
          </button>
        </div>
        {children}
      </div>
      <Toaster />
    </SampleGate>
  );
}
