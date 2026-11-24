"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Kpi } from "@/components/mlops/ui";
import { Back, SampleTag } from "@/components/gateway/bits";
import { ALIASES, MODELS, TASK_CLASSES } from "@/lib/gateway/data";
import { useProviders } from "@/lib/gateway/useProviders";

const money = (n: number | null) => (n == null ? "n/a" : `$${n.toFixed(n < 1 ? 2 : 2)}`);

export default function ModelDetail() {
  const { id } = useParams<{ id: string }>();
  const { all, ready } = useProviders();
  const m = MODELS.find((x) => x.id === id);
  const regProviders = all.filter((p) => p.models.includes(id));
  if (!m && !regProviders.length) return ready ? <div className="p-8 text-sm text-text-secondary">This model is not in the registry. <Link className="underline" href="/models">Back to the registry</Link></div> : null;
  const served = all.filter((p) => p.models.includes(id));
  const inAliases = ALIASES.filter((a) => a.chain.some((c) => c.model === id));
  return (
    <div className="space-y-5">
      <Back href="/models" label="Model Registry" />
      <PageHeader title={id} description={m ? `${m.family} model. ${m.capabilities.join(", ")}.` : "Enabled on a provider you registered. Its capabilities and price are not known to the registry yet."} />
      <SampleTag />
      {m && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Context window" value={m.contextK >= 1000 ? `${m.contextK / 1000}M` : `${m.contextK}K`} sub="Tokens per request" />
          <Kpi label="Price in / out" value={m.priceIn == null ? "Compute only" : `${money(m.priceIn)} / ${money(m.priceOut)}`} sub={m.priceIn == null ? `About $${m.effectivePerM?.toFixed(2)} per 1M from GPU time` : "Per 1M tokens"} />
          <Kpi label="Latency" value={`${m.latencyMs} ms`} sub="Sample median" />
          <Kpi label="Capabilities" value={m.capabilities.length} sub={m.capabilities.join(", ")} />
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {m && (
          <Card className="lg:col-span-2">
            <CardHeader title="Sample quality by task" subtitle="Pass rate on the sample evaluation set, used by cost-aware routing" />
            <CardBody className="space-y-3">
              {TASK_CLASSES.map((t) => (
                <div key={t.id}>
                  <div className="flex justify-between text-[13px]"><span>{t.label} <span className="text-text-tertiary text-xs">{t.example}</span></span><span className="tabular-nums">{m.quality[t.id]}%</span></div>
                  <div className="h-1.5 rounded bg-surface-muted mt-1.5 overflow-hidden"><div className="h-full bg-accent-600" style={{ width: `${m.quality[t.id]}%` }} /></div>
                </div>
              ))}
              <p className="text-xs text-text-tertiary">Run your own evaluation before relying on these figures.</p>
            </CardBody>
          </Card>
        )}
        <div className="space-y-5">
          <Card><CardHeader title="Served by" /><CardBody className="space-y-2">
            {served.length ? served.map((p) => <div key={p.id} className="flex items-center justify-between text-[13px]"><Link href={`/providers/${p.id}`} className="hover:underline">{p.name}</Link><Badge tone={p.status}>{p.status}</Badge></div>) : <p className="text-[13px] text-text-secondary">No provider serves this model.</p>}
          </CardBody></Card>
          <Card><CardHeader title="Used in aliases" /><CardBody className="space-y-2">
            {inAliases.length ? inAliases.map((a) => <div key={a.name} className="text-[13px] font-mono">{a.name}</div>) : <p className="text-[13px] text-text-secondary">Not part of any alias yet.</p>}
          </CardBody></Card>
        </div>
      </div>
    </div>
  );
}
