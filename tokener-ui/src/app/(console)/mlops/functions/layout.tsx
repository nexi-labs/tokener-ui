"use client";

import { usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { FnSkeleton, PreviewBanner, SectionNav } from "@/components/functions/ui";
import { SCENARIO_LABEL, functionsStore, useFunctions, type Scenario } from "@/lib/functions/store";

const SECTIONS = [
  { label: "Overview", href: "/mlops/functions", icon: "function" as const },
  { label: "Registry", href: "/mlops/functions/registry", icon: "runtime" as const },
  { label: "Executions", href: "/mlops/functions/executions", icon: "trace" as const },
  { label: "Workflows", href: "/mlops/functions/workflows", icon: "workflow" as const },
  { label: "Governance", href: "/mlops/functions/governance", icon: "policy" as const },
];

export default function FunctionsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { phase, scenario, error } = useFunctions();
  // The create wizard and the workflow editor take the full width and carry their own header.
  return (
    <div className="space-y-4">
      <PreviewBanner />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1"><SectionNav items={SECTIONS} pathname={pathname} /></div>
        <div className="flex items-center gap-2 text-xs text-text-tertiary">
          <label htmlFor="fx-scenario">Preview state</label>
          <select id="fx-scenario" value={scenario} onChange={(e) => functionsStore.setScenario(e.target.value as Scenario)} className="h-8 rounded-md border border-border-strong bg-surface px-2 text-[13px] text-text-primary">
            {(Object.keys(SCENARIO_LABEL) as Scenario[]).map((k) => <option key={k} value={k}>{SCENARIO_LABEL[k]}</option>)}
          </select>
        </div>
      </div>
      {phase === "loading" && <FnSkeleton />}
      {phase === "error" && (
        <div role="alert" className="rounded-lg border border-border bg-surface p-6 max-w-xl">
          <h2 className="text-base font-semibold">Functions could not be loaded</h2>
          <p className="text-sm text-text-secondary mt-1.5">{error}</p>
          <button onClick={() => functionsStore.reload()} className="mt-4 h-9 px-3 inline-flex items-center gap-1.5 rounded-md bg-emph text-on-emph text-[13px] font-medium"><RefreshCw size={13} /> Try again</button>
        </div>
      )}
      {phase === "ready" && children}
    </div>
  );
}
