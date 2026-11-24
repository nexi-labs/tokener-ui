"use client";

import clsx from "clsx";
import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { LUCIDE } from "@/lib/industry-brands";
import { INDUSTRY_LABELS, INDUSTRY_ORDER } from "@/lib/usecases/labels";
import type { UseCaseEntry } from "@/lib/usecases/catalog";

const ICON: Record<string, string> = {
  knowledge: "ScanSearch", banking: "Landmark", insurance: "ShieldCheck", healthcare: "HeartPulse", retail: "ShoppingBag", manufacturing: "Factory",
  logistics: "Truck", energy: "Zap", telecom: "RadioTower", "public-sector": "Building2", education: "GraduationCap", legal: "Gavel", enterprise: "Building2", startups: "Rocket",
};

export function UseCaseCard({ u }: { u: UseCaseEntry }) {
  const Icon = LUCIDE[ICON[u.industry]] ?? LUCIDE.Layers;
  return (
    <Link href={`/use-cases/${u.slug}`} className="group flex flex-col rounded-xl border border-border bg-surface p-6 hover:border-border-strong hover:shadow-card transition-all">
      <div className="flex items-center gap-2.5 text-[12px] font-medium text-text-secondary">
        <span className="h-7 w-7 rounded-md bg-ink-800 text-accent-500 grid place-items-center"><Icon size={15} strokeWidth={1.8} /></span>
        {INDUSTRY_LABELS[u.industry]}
      </div>
      <h3 className="mt-4 text-[17px] font-semibold leading-snug text-text-primary">{u.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-text-secondary">{u.summary}</p>
      <div className="mt-5 flex flex-wrap gap-1.5">
        {u.tags.map((t) => <span key={t} className="rounded-full bg-surface-muted px-2.5 py-0.5 text-[11px] text-text-secondary">{t}</span>)}
      </div>
      <span className="mt-auto pt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-800">Read the use case <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" /></span>
    </Link>
  );
}

/** Filter by industry and search by words in the title, summary and tags. */
export function UseCaseBrowser({ entries, initial = "all" }: { entries: UseCaseEntry[]; initial?: string }) {
  const [industry, setIndustry] = useState(initial);
  const [q, setQ] = useState("");
  const present = INDUSTRY_ORDER.filter((i) => entries.some((e) => e.industry === i));
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries.filter((e) => (industry === "all" || e.industry === industry) && (!needle || `${e.title} ${e.summary} ${e.tags.join(" ")} ${INDUSTRY_LABELS[e.industry]}`.toLowerCase().includes(needle)));
  }, [entries, industry, q]);
  return (
    <div>
      <div className="flex flex-col lg:flex-row gap-4 lg:items-center justify-between">
        <div role="tablist" aria-label="Industries" className="flex flex-wrap gap-2">
          {["all", ...present].map((i) => (
            <button
              key={i}
              role="tab"
              aria-selected={industry === i}
              onClick={() => setIndustry(i)}
              className={clsx("h-9 px-3.5 rounded-full text-[13px] border transition-colors", industry === i ? "bg-ink-800 text-text-inverse border-ink-800" : "border-border text-text-secondary hover:border-border-strong hover:text-text-primary")}
            >
              {i === "all" ? `All (${entries.length})` : INDUSTRY_LABELS[i]}
            </button>
          ))}
        </div>
        <label className="relative block w-full lg:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search use cases" aria-label="Search use cases" className="h-10 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-ink-500" />
        </label>
      </div>
      <div className="mt-8 grid md:grid-cols-2 xl:grid-cols-3 gap-5">
        {shown.map((u) => <UseCaseCard key={u.slug} u={u} />)}
      </div>
      {!shown.length && <p className="mt-10 text-text-secondary">Nothing matches that search. Try a different word or clear the filter.</p>}
    </div>
  );
}
