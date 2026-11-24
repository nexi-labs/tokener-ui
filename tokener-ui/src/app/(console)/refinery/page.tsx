"use client";

import Link from "next/link";
import { RefineryMark } from "@/components/refinery/RefineryIcon";
import { useMemo } from "react";
import { AlertTriangle, ArrowRight, Database, Plug, Plus, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Kpi, MetricChart } from "@/components/mlops/ui";
import { can } from "@/lib/mlops/rbac";
import { refinery } from "@/lib/refinery/store";
import { toast } from "@/lib/mlops/toast";
import { Bar, QualityRing, RunStatusBadge, Section, StreamStatusBadge, ago, fmtBytes, fmtDur, fmtInt, fmtRows, usd } from "@/components/refinery/bits";
import { PoolStatusBadge, useRefineryRole } from "@/components/refinery/bits";
import { sampleOverviewSeries } from "@/lib/refinery/sample";
import { useRefinery, useRefineryStatus } from "@/lib/refinery/store";

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** Hourly and daily figures from the runs the workspace actually has, bucketed by start time. */
function measuredSeries(runs: { startedAt: string; rowsIn: number; rowsOut: number; aiCostUsd: number }[], now: number) {
  const hours = Array.from({ length: 24 }, (_, i) => ({ t: new Date(now - (23 - i) * HOUR).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), rowsM: 0, aiCost: 0 }));
  const days = Array.from({ length: 14 }, (_, i) => ({ t: new Date(now - (13 - i) * DAY).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }), rowsIn: 0, rowsOut: 0 }));
  for (const r of runs) {
    const age = now - Date.parse(r.startedAt);
    if (!(age >= 0)) continue;
    const h = 23 - Math.floor(age / HOUR); if (h >= 0) { hours[h].rowsM += r.rowsIn / 1e6; hours[h].aiCost += r.aiCostUsd; }
    const d = 13 - Math.floor(age / DAY); if (d >= 0) { days[d].rowsIn += r.rowsIn; days[d].rowsOut += r.rowsOut; }
  }
  for (const h of hours) { h.rowsM = Math.round(h.rowsM * 1000) / 1000; h.aiCost = Math.round(h.aiCost * 100) / 100; }
  return { hours, days };
}

export default function RefineryOverview() {
  const s = useRefinery();
  const isLive = useRefineryStatus().mode === "live";
  const sample = useMemo(() => sampleOverviewSeries(), []);
  const now = Date.now();
  const measured = useMemo(() => measuredSeries(s.runs, Date.now()), [s.runs]);
  const series = isLive ? measured : sample;

  const kpi = useMemo(() => {
    const last24 = s.runs.filter((r) => now - Date.parse(r.startedAt) < DAY);
    const week = s.runs.filter((r) => now - Date.parse(r.startedAt) < 7 * DAY && (r.status === "succeeded" || r.status === "failed"));
    const rowsIn = last24.reduce((a, r) => a + r.rowsIn, 0);
    const rejected = last24.reduce((a, r) => a + r.rowsRejected, 0);
    const online = s.pools.filter((p) => p.status === "online" || p.status === "scaling");
    return {
      rowsIn, runs: last24.length, failed: last24.filter((r) => r.status === "failed").length,
      okWeek: week.filter((r) => r.status === "succeeded").length, doneWeek: week.length,
      rejected, rejectedShare: rowsIn ? (rejected / rowsIn) * 100 : 0,
      aiCost: last24.reduce((a, r) => a + r.aiCostUsd, 0), aiCalls: last24.reduce((a, r) => a + r.aiCalls, 0),
      cpu: online.length ? Math.round(online.reduce((a, p) => a + p.cpuPct, 0) / online.length) : 0, online: online.length,
      running: s.runs.filter((r) => r.status === "running" || r.status === "planning").length, queued: s.runs.filter((r) => r.status === "queued").length,
    };
  }, [s, now]);

  const role = useRefineryRole();
  const mayAcknowledge = can(role, "alert.acknowledge").ok;
  const attention = useMemo(() => {
    const out: { key: string; tone: "bad" | "warn"; text: string; href: string; label: string; alertId?: string; note?: string }[] = [];
    // A signed-in workspace shows the alerts the server raised: counted, deduplicated and cleared by the next success. The sample workspace has none, so it reads the runs itself.
    if (isLive) for (const a of s.alerts.filter((x) => x.state !== "resolved")) {
      const recipe = a.resource.startsWith("recipe/") ? a.resource.slice(7) : "";
      out.push({
        key: a.id, tone: a.kind === "run_failed" ? "bad" : "warn", alertId: a.state === "firing" ? a.id : undefined,
        text: `${a.title}: ${a.resourceName || a.resource}. ${a.detail}`,
        note: `${a.count === 1 ? "Once" : `${a.count} times`}, last ${ago(a.lastAt)}${a.state === "acknowledged" ? `. Acknowledged by ${a.acknowledgedBy}` : ""}`,
        href: recipe ? `/refinery/recipes/${recipe}` : "/refinery/runs", label: recipe ? "Open recipe" : "Open runs",
      });
    }
    else for (const r of s.runs.filter((x) => x.status === "failed").slice(0, 2)) out.push({ key: r.id, tone: "bad", text: `${r.recipeName} failed ${ago(r.startedAt)}: ${r.error ?? "no detail recorded"}`, href: `/refinery/runs/${r.id}`, label: "Open run" });
    for (const c of s.connections.filter((x) => x.state === "failed")) out.push({ key: c.id, tone: "bad", text: `Connection ${c.name} failed its last test.`, href: "/refinery/connections", label: "Open connections" });
    for (const p of s.pools.filter((x) => x.status === "offline")) out.push({ key: p.id, tone: "warn", text: `Runner pool ${p.name} has been offline since ${ago(p.lastSeen)}.`, href: "/refinery/runners", label: "Open runners" });
    for (const j of s.streams.filter((x) => x.status === "paused" && x.lag > 10_000)) out.push({ key: j.id, tone: "warn", text: `Stream ${j.name} is paused with ${fmtInt(j.lag)} messages waiting.`, href: "/refinery/streams", label: "Open streams" });
    for (const d of s.datasets.filter((x) => x.profile.quality < 75)) out.push({ key: d.id, tone: "warn", text: `Dataset ${d.name} scores ${d.profile.quality} of 100. ${d.profile.duplicateRows ? `About ${fmtRows(d.profile.duplicateRows)} rows look duplicated.` : ""}`, href: `/refinery/datasets/${d.id}`, label: "Open profile" });
    return out;
  }, [s, isLive, mayAcknowledge]);

  const lowestQuality = [...s.datasets].sort((a, b) => a.profile.quality - b.profile.quality).slice(0, 4);
  const recent = s.runs.slice(0, 7);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="flex items-start gap-4">
          <RefineryMark size={44} className="shrink-0 mt-0.5" />
          <div><h2 className="text-lg font-semibold tracking-tight">Refinery <span className="text-text-tertiary font-normal">Data operations</span></h2>
          <p className="text-sm text-text-secondary mt-1 max-w-2xl">What your cleaning pipelines did over the last 24 hours, what is running now, and what needs a look.</p></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/refinery/datasets?add=upload"><Button><Upload size={15} /> Upload a file</Button></Link>
          <Link href="/refinery/connections?add=1"><Button><Plug size={15} /> Connect a source</Button></Link>
          <Link href="/refinery/recipes?new=1"><Button variant="primary"><Plus size={15} /> New recipe</Button></Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi label="Rows processed, 24 h" value={fmtRows(kpi.rowsIn)} sub={`${kpi.runs} run${kpi.runs === 1 ? "" : "s"}, ${kpi.running} running now`} />
        <Kpi label="Completed runs, 7 days" value={`${kpi.okWeek} of ${kpi.doneWeek}`} sub="succeeded of those that finished" tone={kpi.okWeek < kpi.doneWeek ? "warn" : undefined} />
        <Kpi label="Failed runs, 24 h" value={kpi.failed} sub={kpi.failed ? "See the attention list" : "None"} tone={kpi.failed ? "bad" : undefined} />
        <Kpi label="Rows rejected, 24 h" value={fmtRows(kpi.rejected)} sub={`${kpi.rejectedShare.toFixed(1)}% of rows read`} />
        <Kpi label="AI step cost, 24 h" value={usd(kpi.aiCost)} sub={`${fmtRows(kpi.aiCalls)} model calls`} />
        <Kpi label="Runner CPU in use" value={`${kpi.cpu}%`} sub={`${kpi.online} pool${kpi.online === 1 ? "" : "s"} online, ${kpi.queued} run${kpi.queued === 1 ? "" : "s"} queued`} />
      </div>

      <div className="grid xl:grid-cols-3 gap-4">
        <Section title="Rows processed per hour" hint={isLive ? "Millions of rows read by runs, from their start time" : "Millions of rows read by all runs and streams"}>
          <MetricChart data={series.hours} series={[{ key: "rowsM", name: "Rows (millions)" }]} area height={210} />
        </Section>
        <Section title="Model step cost per hour" hint="US dollars spent by AI steps through the gateway">
          <MetricChart data={series.hours} series={[{ key: "aiCost", name: "Cost (USD)" }]} area height={210} />
        </Section>
        <Section title={isLive ? "Rows in and rows out per day" : "Data quality, before and after"} hint={isLive ? "Rows read and rows written by runs, last 14 days" : "Average quality score of datasets, input against output, last 14 days"}>
          {isLive
            ? <MetricChart data={measured.days} series={[{ key: "rowsIn", name: "Rows in" }, { key: "rowsOut", name: "Rows out" }]} height={210} />
            : <MetricChart data={sample.days} series={[{ key: "before", name: "Input data" }, { key: "after", name: "Cleaned output" }]} height={210} yMax={100} />}
        </Section>
      </div>

      <div className="grid xl:grid-cols-3 gap-4">
        <Section title="Needs attention" hint={attention.length ? `${attention.length} item${attention.length === 1 ? "" : "s"}` : "Nothing needs a look"} className="xl:col-span-1">
          {attention.length === 0 ? <p className="text-sm text-text-secondary">All runs, connections, runners and streams are healthy.</p> : (
            <ul className="divide-y divide-border -mx-5">
              {attention.map((a) => (
                <li key={a.key} className="px-5 py-3 flex items-start gap-3">
                  {a.tone === "bad" ? <XCircle size={16} className="text-status-down mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="text-status-degraded mt-0.5 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-text-primary break-words">{a.text}</p>
                    {a.note && <p className="text-xs text-text-tertiary mt-0.5">{a.note}</p>}
                    <div className="mt-1 flex items-center gap-3">
                      <Link href={a.href} className="text-xs text-accent-700 hover:underline inline-flex items-center gap-1">{a.label} <ArrowRight size={11} /></Link>
                      {a.alertId && <button type="button" disabled={!mayAcknowledge} title={mayAcknowledge ? undefined : "Your role cannot acknowledge alerts"} onClick={async () => { const r = await refinery.acknowledgeAlert(a.alertId!); if (!r.ok) toast(r.error, "error"); }} className="text-xs font-medium text-text-secondary hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed">Acknowledge</button>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Recent runs" className="xl:col-span-2" action={<Link href="/refinery/runs" className="text-xs text-accent-700 hover:underline">All runs</Link>}>
          <div className="-mx-5 -mb-5">
            <Table>
              <Thead><tr><Th>Recipe</Th><Th>Status</Th><Th>Rows in</Th><Th>Rows out</Th><Th>Rejected</Th><Th>Time</Th></tr></Thead>
              <tbody>
                {recent.map((r) => (
                  <Tr key={r.id}>
                    <Td><Link href={`/refinery/runs/${r.id}`} className="font-medium hover:underline">{r.recipeName}</Link><div className="text-xs text-text-tertiary">{r.id} on {r.pool}, {ago(r.startedAt)}</div></Td>
                    <Td><RunStatusBadge s={r.status} />{(r.status === "running" || r.status === "planning") && <Bar value={r.pct} className="mt-1.5 w-20" />}</Td>
                    <Td className="tabular-nums">{fmtRows(r.rowsIn)}</Td>
                    <Td className="tabular-nums">{r.status === "failed" || r.status === "queued" ? "n/a" : fmtRows(r.rowsOut)}</Td>
                    <Td className="tabular-nums">{fmtRows(r.rowsRejected)}</Td>
                    <Td className="tabular-nums text-text-secondary">{r.status === "running" || r.status === "planning" ? "running" : fmtDur(r.durationMs)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Section>
      </div>

      <div className="grid xl:grid-cols-3 gap-4">
        <Section title="Runner pools" hint="CPU and memory in use" action={<Link href="/refinery/runners" className="text-xs text-accent-700 hover:underline">Manage</Link>}>
          <ul className="space-y-4">
            {s.pools.map((p) => (
              <li key={p.id}>
                <div className="flex items-center justify-between gap-2"><span className="text-[13px] font-medium truncate">{p.name}</span><PoolStatusBadge s={p.status} /></div>
                <div className="text-xs text-text-tertiary mt-0.5">{p.workers} of {p.workersMax} workers, {p.running} running{p.queued ? `, ${p.queued} queued` : ""}</div>
                <div className="grid grid-cols-[34px_1fr] items-center gap-x-2 gap-y-1 mt-2 text-[11px] text-text-tertiary"><span>CPU</span><Bar value={p.cpuPct} /><span>Mem</span><Bar value={p.memPct} tone="var(--chart-s3)" /></div>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Streams" hint="Continuous recipes and change capture" action={<Link href="/refinery/streams" className="text-xs text-accent-700 hover:underline">Manage</Link>}>
          <ul className="divide-y divide-border -mx-5">
            {s.streams.map((j) => (
              <li key={j.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-2"><span className="text-[13px] font-medium truncate">{j.name}</span><StreamStatusBadge s={j.status} /></div>
                <div className="grid grid-cols-3 gap-2 mt-2 text-xs"><div><div className="text-text-tertiary">In</div><div className="tabular-nums font-medium">{fmtInt(j.inRate)}/s</div></div><div><div className="text-text-tertiary">Lag</div><div className="tabular-nums font-medium">{fmtInt(j.lag)}</div></div><div><div className="text-text-tertiary">Errors</div><div className="tabular-nums font-medium">{j.errPct}%</div></div></div>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Datasets to look at" hint="Lowest quality score first" action={<Link href="/refinery/datasets" className="text-xs text-accent-700 hover:underline">All datasets</Link>}>
          <ul className="space-y-4">
            {lowestQuality.map((d) => (
              <li key={d.id} className="flex items-center gap-3">
                <QualityRing value={d.profile.quality} size={48} />
                <div className="min-w-0"><Link href={`/refinery/datasets/${d.id}`} className="text-[13px] font-medium hover:underline flex items-center gap-1.5 truncate"><Database size={13} className="text-text-tertiary shrink-0" />{d.name}</Link><div className="text-xs text-text-tertiary">{fmtRows(d.totalRows)} rows, {fmtBytes(d.sizeBytes)}, {d.profile.parts.completeness}% complete</div></div>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}
