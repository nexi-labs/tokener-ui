"use client";

import Link from "next/link";
import { useState } from "react";
import { Cpu, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Form";
import { Kpi, Notice } from "@/components/mlops/ui";
import { HealthPill, ProviderMark, SampleTag, fmtInt, usd } from "@/components/gateway/bits";
import { useProviders } from "@/lib/gateway/useProviders";

export default function ProvidersPage() {
  const [f, setF] = useState<"all" | "healthy" | "attention">("all");
  const { all: PROVIDERS, live, ready, error } = useProviders();
  const shown = PROVIDERS.filter((p) => f === "all" || (f === "healthy" ? p.status === "healthy" : p.status !== "healthy"));
  const req = PROVIDERS.reduce((s, p) => s + p.requestsPerDay, 0), spend = PROVIDERS.reduce((s, p) => s + p.spendPerDayUsd, 0);
  const err = req ? PROVIDERS.reduce((s, p) => s + p.errorRatePct * p.requestsPerDay, 0) / req : 0;
  return (
    <div className="space-y-5">
      <PageHeader title="Providers" description="Every model provider the gateway can route to: health, latency, errors, spend, limits and where each one sits in the failover order."
        action={<Link href="/providers/new"><Button variant="primary"><Plus size={15} /> Register provider</Button></Link>} />
      <div className="flex items-center justify-between gap-3"><SampleTag /></div>
      {live && error && <Notice tone="bad" title="The providers could not be loaded">{error}</Notice>}
      {live ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Providers" value={PROVIDERS.length} sub="Registered in this organisation" />
          <Kpi label="Healthy" value={PROVIDERS.filter((p) => p.status === "healthy").length} sub="Last test passed" />
          <Kpi label="Degraded" value={PROVIDERS.filter((p) => p.status === "degraded").length} sub="Unchecked, or the last test failed" tone={PROVIDERS.some((p) => p.status === "degraded") ? "warn" : undefined} />
          <Kpi label="Down or off" value={PROVIDERS.filter((p) => p.status === "down").length} sub="Unreachable, or switched off" tone={PROVIDERS.some((p) => p.status === "down") ? "warn" : undefined} />
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Providers" value={PROVIDERS.length} sub={`${PROVIDERS.filter((p) => p.status !== "healthy").length} need attention`} tone={PROVIDERS.some((p) => p.status !== "healthy") ? "warn" : undefined} />
          <Kpi label="Requests per day" value={fmtInt(req)} sub="Across all providers" />
          <Kpi label="Spend per day" value={usd(spend, 0)} sub="Provider charges and GPU time" />
          <Kpi label="Error rate" value={`${err.toFixed(2)}%`} sub="Weighted by requests" />
        </div>
      )}
      <Segmented value={f} onChange={setF} options={[{ value: "all", label: "All" }, { value: "healthy", label: "Healthy" }, { value: "attention", label: "Needs attention" }]} />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {live && ready && !error && PROVIDERS.length === 0 && <p className="md:col-span-2 xl:col-span-3 text-sm text-text-secondary">No provider is registered yet. Register one to start routing through the gateway.</p>}
        {shown.map((p) => (
          <Link key={p.id} href={`/providers/${p.id}`} className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">
            <Card className="p-5 h-full hover:border-border-strong transition-colors">
              <div className="flex items-start justify-between mb-4"><ProviderMark p={p} /><HealthPill s={p.status} /></div>
              <h3 className="text-sm font-semibold text-text-primary">{p.name}</h3>
              <p className="text-xs text-text-tertiary mt-0.5">{p.kind} &middot; {p.region} &middot; failover priority {p.priority}</p>
              <dl className="mt-4 pt-4 border-t border-border grid grid-cols-3 gap-2 text-xs">
                <div><dt className="text-text-tertiary">p50 / p99</dt><dd className="text-text-primary font-medium tabular-nums">{p.fresh ? "No traffic yet" : `${p.p50} / ${p.p99} ms`}</dd></div>
                <div><dt className="text-text-tertiary">Errors</dt><dd className="text-text-primary font-medium tabular-nums">{p.fresh ? "-" : `${p.errorRatePct}%`}</dd></div>
                <div><dt className="text-text-tertiary">Spend / day</dt><dd className="text-text-primary font-medium tabular-nums">{p.fresh ? "-" : usd(p.spendPerDayUsd, 0)}</dd></div>
              </dl>
              {p.note && <p className="mt-3 text-xs text-text-secondary">{p.note}</p>}
            </Card>
          </Link>
        ))}
        <Link href="/providers/new?kind=compatible" className="border border-dashed border-border-strong rounded-lg flex flex-col items-center justify-center gap-2 py-10 text-text-tertiary hover:text-text-secondary hover:border-text-tertiary transition-colors">
          <Cpu size={20} strokeWidth={1.5} /><span className="text-sm font-medium">Add a custom OpenAI-compatible endpoint</span>
        </Link>
      </div>
    </div>
  );
}
