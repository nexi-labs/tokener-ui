"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Segmented } from "@/components/ui/Form";
import { APPS } from "@/lib/optimize/data";
import { RANGES, REDUCTION_BUCKETS, pruneSweep, series, summary, thresholdSweep, type Range } from "@/lib/optimize/series";
import { ChartCard, Gauge, Plot, type Ser } from "./charts";
import { LiveFeed } from "./LiveFeed";
import { usd } from "@/components/gateway/bits";

type Knob = "prune" | "cache";

export function Dashboard() {
  const [range, setRange] = useState<Range>("30d");
  const [knob, setKnob] = useState<Knob>("prune");
  const pts = useMemo(() => series(range), [range]);
  const s = useMemo(() => summary(pts), [pts]);
  const prune = useMemo(() => pruneSweep(), []);
  const cache = useMemo(() => thresholdSweep(), []);
  const data = pts as unknown as Record<string, number | string>[];
  const rangeText = range === "24h" ? "per hour" : "per day";

  const S = {
    tokens: [{ key: "originalM", name: "Before optimization", color: "grey", dash: true }, { key: "sentM", name: "Sent to models", color: "s1" }] as Ser[],
    layers: [{ key: "caching", name: "Caching", color: "s1" }, { key: "cleanup", name: "Prompt cleanup", color: "s2" }, { key: "other", name: "Output, batch and routing", color: "s3" }] as Ser[],
    hits: [{ key: "exact", name: "Exact cache", color: "s1" }, { key: "semantic", name: "Semantic cache", color: "s2", dash: true }] as Ser[],
    quality: [{ key: "agreement", name: "Answer agreement", color: "s3" }, { key: "details", name: "Critical details kept", color: "s1", dash: true }] as Ser[],
    time: [{ key: "p50", name: "Typical (p50)", color: "s1" }, { key: "p95", name: "Slowest 5% (p95)", color: "s2", dash: true }] as Ser[],
    dist: [{ key: "n", name: "Share of requests", color: "s1" }] as Ser[],
    sweep: knob === "prune"
      ? [{ key: "saved", name: "Tokens saved", color: "s1" }, { key: "kept", name: "Critical details kept", color: "s3", dash: true }] as Ser[]
      : [{ key: "saved", name: "Requests answered from cache", color: "s1" }, { key: "kept", name: "Cache answers a fresh call would not give", color: "s2", dash: true }] as Ser[],
  };
  const sweepData = (knob === "prune" ? prune : cache) as unknown as Record<string, number | string>[];
  const at = (rows: typeof prune, x: number) => rows.find((r) => r.at === x)!;
  const apps = [...APPS].sort((a, b) => b.savedPct - a.savedPct);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Segmented value={range} onChange={setRange} options={RANGES} />
        <p className="text-xs text-text-tertiary">{s.requests.toLocaleString("en-US")} requests &middot; {usd(s.usd, 0)} saved in this period</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Gauge label="Tokens saved" value={s.savedPct} max={60} mark={30} markLabel="Goal 30%" hint="Of all input tokens" />
        <Gauge label="Cache hit rate" value={s.cache} max={40} mark={15} markLabel="Goal 15%" hint="Exact and semantic" />
        <Gauge label="Critical details kept" value={s.details} min={95} max={100} decimals={2} mark={98} markKind="floor" markLabel="Floor 98%" hint="Numbers, identifiers, links" />
        <Gauge label="Answer agreement" value={s.agreement} min={90} max={100} mark={97} markKind="floor" markLabel="Floor 97%" hint="Shadow check vs original" />
        <Gauge label="Time added" value={s.p95} max={30} unit=" ms" mark={15} markKind="budget" markLabel="Budget 15 ms" hint="p95 per request" />
      </div>

      <LiveFeed />

      <div className="grid xl:grid-cols-2 gap-4">
        <ChartCard title="Tokens before and after" subtitle={`Millions of input tokens ${rangeText}`} data={data} series={S.tokens}>
          <Plot kind="area" data={data} series={S.tokens} unit=" M" />
        </ChartCard>
        <ChartCard title="Spend saved by layer" subtitle={`US dollars ${rangeText}`} data={data} series={S.layers}>
          <Plot kind="stack" data={data} series={S.layers} unit=" USD" />
        </ChartCard>
        <ChartCard title="Cache hit rate" subtitle="Share of requests answered without calling a provider" data={data} series={S.hits}>
          <Plot kind="line" data={data} series={S.hits} unit="%" domain={[0, 14]} />
        </ChartCard>
        <ChartCard title="Quality against the original prompt" subtitle="From the shadow check. The dashed grey line is the lowest score allowed." data={data} series={S.quality}>
          <Plot kind="line" data={data} series={S.quality} unit="%" domain={[94, 100]} refY={{ y: 97, label: "Floor" }} />
        </ChartCard>
        <ChartCard title="Time the optimizer adds" subtitle="Milliseconds per request, with the budget it must stay inside" data={data} series={S.time}>
          <Plot kind="line" data={data} series={S.time} unit=" ms" domain={[0, 20]} refY={{ y: 15, label: "Budget" }} />
        </ChartCard>
        <ChartCard title="How much each request was reduced" subtitle="Share of requests by the part of the prompt removed" data={REDUCTION_BUCKETS as unknown as Record<string, number | string>[]} series={S.dist}>
          <Plot kind="bar" data={REDUCTION_BUCKETS as unknown as Record<string, number | string>[]} series={S.dist} unit="%" />
        </ChartCard>
      </div>

      <Card className="p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div className="min-w-0"><h3 className="text-sm font-semibold">What happens when you change a setting</h3>
            <p className="text-xs text-text-tertiary mt-0.5 max-w-2xl">Move along the curve to see what a setting buys and what it costs, before you change it for an application.</p></div>
          <Segmented value={knob} onChange={setKnob} options={[{ value: "prune", label: "Fit-to-question budget" }, { value: "cache", label: "Semantic cache threshold" }]} />
        </div>
        <div className="grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 min-w-0">
            <div className="text-xs text-text-tertiary mb-1">{knob === "prune" ? "Token budget for fitting to the question, from everything to a fifth" : "Similarity needed before a stored answer is reused"}</div>
            <Plot kind="line" data={sweepData} series={S.sweep} unit="%" domain={knob === "prune" ? [0, 100] : [0, 24]} xKey="x" refX={knob === "prune" ? { x: "70%", label: "Balanced" } : { x: "0.93", label: "Support assistant" }} />
          </div>
          <div className="lg:col-span-2 space-y-3 text-[13px] text-text-secondary">
            {knob === "prune" ? (<>
              <table className="w-full text-xs tabular-nums"><thead><tr className="text-text-tertiary text-left"><th className="py-1 font-medium">Mode</th><th className="py-1 font-medium text-right">Keeps</th><th className="py-1 font-medium text-right">Tokens saved</th><th className="py-1 font-medium text-right">Details kept</th></tr></thead>
                <tbody>{([["Lossless", 100], ["Balanced", 70], ["Aggressive", 45]] as const).map(([m, k]) => { const r = at(prune, k); return <tr key={m} className="border-t border-border"><td className="py-1.5 text-text-primary">{m}</td><td className="py-1.5 text-right">{k}%</td><td className="py-1.5 text-right">{r.saved}%</td><td className="py-1.5 text-right">{r.kept}%</td></tr>; })}</tbody></table>
              <p>Computed by running the real conversion over the sample prompts at each budget. Sentences with numbers, identifiers and links are dropped last, so details kept falls slowly at first and faster as the budget shrinks. Whether the dropped sentences mattered to the answer is what the comparison on the Fidelity tab measures.</p>
            </>) : (<>
              <table className="w-full text-xs tabular-nums"><thead><tr className="text-text-tertiary text-left"><th className="py-1 font-medium">Threshold</th><th className="py-1 font-medium text-right">Answered from cache</th><th className="py-1 font-medium text-right">Not as fresh</th></tr></thead>
                <tbody>{[0.85, 0.9, 0.93, 0.97].map((t) => { const r = at(cache, Math.round(t * 100)); return <tr key={t} className="border-t border-border"><td className="py-1.5 text-text-primary">{t.toFixed(2)}</td><td className="py-1.5 text-right">{r.saved}%</td><td className="py-1.5 text-right">{r.kept}%</td></tr>; })}</tbody></table>
              <p>Modelled on sample traffic. A lower threshold reuses more answers and also reuses more that a fresh call would not have given. Contracts and other records should stay at 0.97 or use no semantic cache.</p>
            </>)}
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold">Savings by application</h3>
        <p className="text-xs text-text-tertiary mt-0.5 mb-4">Share of input tokens saved, with the quality score beside it. Applications with stricter policies save less on purpose.</p>
        <ul className="space-y-3">
          {apps.map((a) => (
            <li key={a.id} className="grid grid-cols-[minmax(0,10rem)_1fr_3rem_5.5rem] sm:grid-cols-[12rem_1fr_3rem_7rem] items-center gap-3 text-xs">
              <div className="min-w-0"><div className="text-[13px] font-medium text-text-primary truncate">{a.name}</div><div className="text-text-tertiary">{a.mode}</div></div>
              <div aria-hidden className="h-2 rounded-r-[4px] rounded-l-sm bg-surface-muted overflow-hidden"><div className="h-full bg-accent-600 rounded-r-[4px]" style={{ width: `${(a.savedPct / 60) * 100}%` }} /></div>
              <div className="text-right tabular-nums font-medium text-text-primary">{a.savedPct}%</div>
              <div className="text-right tabular-nums text-text-tertiary">quality {a.fidelity}%</div>
            </li>))}
        </ul>
      </Card>
      <p className="text-xs text-text-tertiary">Sample data except where a panel says otherwise. The live figures come from the savings ledger the gateway writes for every request.</p>
    </div>
  );
}
