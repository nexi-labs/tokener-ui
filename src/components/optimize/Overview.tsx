"use client";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Kpi } from "@/components/mlops/ui";
import { BASELINE, LEVERS, RISK_LABEL, monthlySavings } from "@/lib/optimize/data";
import { usd } from "@/components/gateway/bits";

const STATUS = { active: "healthy", shadow: "info", off: "neutral" } as const;
const STATUS_LABEL = { active: "Active", shadow: "Shadow", off: "Off" } as const;

export function Overview() {
  const s = monthlySavings();
  const max = Math.max(...LEVERS.map((l) => l.savedUsd), 1);
  const without = BASELINE.spendUsd + s.usd;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Saved in 30 days" value={usd(s.usd, 0)} sub={`${s.pct.toFixed(1)}% of what it would have cost`} />
        <Kpi label="Spend" value={usd(BASELINE.spendUsd, 0)} sub={`${usd(without, 0)} without optimization`} />
        <Kpi label="Tokens kept out" value={`${s.tokensM.toLocaleString("en-US")} M`} sub="Input and output combined" />
        <Kpi label="Answer agreement" value="98.9%" sub="Shadow check against unoptimized prompts" />
      </div>

      <Card>
        <CardHeader title="Where the savings come from" subtitle="Each lever is measured separately, so a saving is counted once. Prices come from the provider's own usage report, not from our estimates." />
        <CardBody className="p-0">
          <ul className="divide-y divide-border">
            {LEVERS.map((l) => (
              <li key={l.id} className="px-5 py-4 grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_6rem] items-center">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap"><span className="text-[13px] font-medium">{l.label}</span><Badge tone={STATUS[l.status]}>{STATUS_LABEL[l.status]}</Badge></div>
                  <p className="text-xs text-text-tertiary mt-1">{l.where}. {RISK_LABEL[l.risk]}.</p>
                  <p className="text-xs text-text-secondary mt-1">{l.body}</p>
                </div>
                <div className="hidden md:block" aria-hidden>
                  <div className="h-2 rounded-full bg-surface-muted overflow-hidden"><div className="h-full bg-accent-600" style={{ width: `${(l.savedUsd / max) * 100}%` }} /></div>
                </div>
                <div className="md:text-right">
                  <div className="text-sm font-semibold tabular-nums">{l.status === "off" ? "Not running" : usd(l.savedUsd, 0)}</div>
                  {l.tokensSavedM > 0 && <div className="text-xs text-text-tertiary tabular-nums">{l.tokensSavedM} M tokens</div>}
                </div>
              </li>))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Order of work on each request" />
        <CardBody>
          <ol className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
            {[
              ["1", "Cache lookup", "Exact, then semantic. A hit ends the request here."],
              ["2", "Shape the prompt", "Stable parts first for provider caching, tool schemas pruned."],
              ["3", "Convert the content", "Read structure, cheapest encoding, then the steps the policy allows."],
              ["4", "Choose and send", "Cheapest model that clears the quality floor, batch if allowed."],
              ["5", "Measure", "Provider usage is recorded. A sample is replayed in shadow."],
            ].map(([n, h, b]) => (
              <li key={n} className="rounded-lg border border-border p-3"><div className="text-text-tertiary tabular-nums">{n}</div><div className="text-[13px] font-medium text-text-primary mt-1">{h}</div><p className="text-text-secondary mt-1">{b}</p></li>))}
          </ol>
        </CardBody>
      </Card>
    </div>
  );
}
