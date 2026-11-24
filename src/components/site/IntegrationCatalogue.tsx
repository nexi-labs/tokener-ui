"use client";

import clsx from "clsx";
import { ChevronDown, ExternalLink, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { NodeIcon } from "@/components/studio/icons";
import { Badge } from "@/components/ui/Badge";
import { STATUS_LEGEND } from "@/lib/mlops/catalog";
import { useIntegrations } from "@/lib/platform/integrations";
import { AUTH_LABEL, CAPABILITY_LABEL, FAMILY_LABEL, type Family, type IntegrationStatus } from "@/lib/mlops/types";

const FAMS = Object.keys(FAMILY_LABEL) as Family[];

/** Public catalogue. Reads the same data as the console, so the two can never disagree about status. */
export function IntegrationCatalogue() {
  const INTEGRATIONS = useIntegrations();
  const [q, setQ] = useState("");
  const [fam, setFam] = useState<Family | "all">("all");
  const [status, setStatus] = useState<IntegrationStatus | "all">("all");
  const [open, setOpen] = useState<string | null>(null);
  const list = useMemo(() => INTEGRATIONS.filter((i) => (fam === "all" || i.family === fam) && (status === "all" || i.status === status) && (!q || `${i.name} ${i.vendor} ${i.blurb}`.toLowerCase().includes(q.toLowerCase()))), [INTEGRATIONS, q, fam, status]);

  return (
    <div>
      <dl className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {(Object.keys(STATUS_LEGEND) as IntegrationStatus[]).map((k) => (
          <div key={k} className="rounded-lg border border-border p-3.5">
            <dt><Badge tone={STATUS_LEGEND[k].tone}>{STATUS_LEGEND[k].label}</Badge> <span className="text-xs text-text-tertiary ml-1">{INTEGRATIONS.filter((i) => i.status === k).length}</span></dt>
            <dd className="text-xs text-text-secondary mt-2">{STATUS_LEGEND[k].text}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <label className="relative">
          <span className="sr-only">Search integrations</span>
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search integrations" className="h-10 w-64 pl-9 pr-3 rounded-md border border-border-strong text-sm focus:outline-none focus:ring-2 focus:ring-accent-500/40" />
        </label>
        <label className="text-sm"><span className="sr-only">Category</span>
          <select value={fam} onChange={(e) => setFam(e.target.value as Family | "all")} className="h-10 rounded-md border border-border-strong px-3 text-sm bg-surface">
            <option value="all">All categories</option>{FAMS.map((f) => <option key={f} value={f}>{FAMILY_LABEL[f]}</option>)}
          </select></label>
        <label className="text-sm"><span className="sr-only">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as IntegrationStatus | "all")} className="h-10 rounded-md border border-border-strong px-3 text-sm bg-surface">
            <option value="all">Any status</option>{(Object.keys(STATUS_LEGEND) as IntegrationStatus[]).map((s) => <option key={s} value={s}>{STATUS_LEGEND[s].label}</option>)}
          </select></label>
        <span className="text-xs text-text-tertiary" aria-live="polite">{list.length} of {INTEGRATIONS.length}</span>
      </div>

      {list.length === 0 && <p className="text-sm text-text-secondary py-10 text-center border border-dashed border-border rounded-lg">No integrations match. Clear the search or filters.</p>}

      <ul className="grid md:grid-cols-2 gap-4">
        {list.map((i) => {
          const isOpen = open === i.id;
          return (
            <li key={i.id} className="rounded-xl border border-border bg-surface">
              <button onClick={() => setOpen(isOpen ? null : i.id)} aria-expanded={isOpen} aria-controls={`int-${i.id}`} className="w-full text-left p-5 flex items-start gap-4">
                <span className="h-11 w-11 rounded-lg bg-surface-muted grid place-items-center shrink-0"><NodeIcon icon={i.icon} size={24} /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2"><span className="font-semibold text-text-primary">{i.name}</span><Badge tone={STATUS_LEGEND[i.status].tone}>{STATUS_LEGEND[i.status].label}{i.status === "planned" && i.wave ? `, wave ${i.wave}` : ""}</Badge></span>
                  <span className="block text-xs text-text-tertiary mt-0.5">{i.vendor} / {FAMILY_LABEL[i.family]}</span>
                  <span className="block text-sm text-text-secondary mt-2">{i.blurb}</span>
                </span>
                <ChevronDown size={16} className={clsx("mt-1 text-text-tertiary transition-transform shrink-0", isOpen && "rotate-180")} />
              </button>
              {isOpen && (
                <div id={`int-${i.id}`} className="px-5 pb-5 pt-0 border-t border-border text-sm space-y-4">
                  <div className="pt-4"><div className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Version target</div><p className="text-text-secondary mt-1">{i.versionTarget}</p></div>
                  <div><div className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Authentication</div><p className="text-text-secondary mt-1">{i.auth.map((a) => AUTH_LABEL[a]).join(", ")}</p></div>
                  <div><div className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Prerequisites</div><ul className="list-disc pl-5 text-text-secondary mt-1 space-y-0.5">{i.prerequisites.map((p) => <li key={p}>{p}</li>)}</ul></div>
                  {i.compliance && i.compliance.length > 0 && <div><div className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Compliance and go-live</div><ul className="list-disc pl-5 text-text-secondary mt-1 space-y-0.5">{i.compliance.map((p) => <li key={p}>{p}</li>)}</ul></div>}
                  <div><div className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Capabilities</div>
                    <ul className="flex flex-wrap gap-1.5 mt-1.5">{i.capabilities.map((c) => <li key={c.id} className={clsx("text-xs rounded-full border px-2 py-0.5", c.level === "full" ? "border-border-strong text-text-primary" : "border-dashed border-border-strong text-text-secondary")} title={c.note}>{CAPABILITY_LABEL[c.id]}{c.level !== "full" ? ` (${c.level})` : ""}</li>)}</ul></div>
                  {i.limitations.length > 0 && <div><div className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Limitations</div><ul className="list-disc pl-5 text-text-secondary mt-1 space-y-0.5">{i.limitations.map((p) => <li key={p}>{p}</li>)}</ul></div>}
                  <div><div className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Official documentation</div>
                    <ul className="mt-1 space-y-1">{i.docs.map((d) => <li key={d.url}><a href={d.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 text-text-primary underline underline-offset-2 decoration-border-strong hover:decoration-text-primary">{d.label}<ExternalLink size={12} /></a></li>)}</ul></div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-text-tertiary mt-8">Brand names and logos belong to their owners and appear only to identify the product. Their appearance here does not imply endorsement or partnership. Version targets are confirmed by a live check at connect time.</p>
    </div>
  );
}
