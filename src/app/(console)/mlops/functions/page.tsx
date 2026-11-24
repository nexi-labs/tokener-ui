"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Kpi, MetricChart, Notice } from "@/components/mlops/ui";
import { FnIcon } from "@/components/functions/FnIcon";
import { FnStatusBadge, Meter, ModelChip, ago, fmtMs, pct, useFx } from "@/components/functions/ui";
import { DEFAULT_SCOPE, RANGES, buckets, execStats, scopedExecutions, scopedFunctions, scopedRuns, scopedUsage, type Scope } from "@/lib/functions/select";
import { groupUsage, sumUsage } from "@/lib/functions/ledger";
import { RUNTIMES, FN_STATUS_LABEL, compact, num, usd, usd2, type FnStatus } from "@/lib/functions/types";

export default function FunctionsOverview() {
  const s = useFx();
  const [scope, setScope] = useState<Scope>(DEFAULT_SCOPE);
  const set = (p: Partial<Scope>) => setScope((x) => ({ ...x, ...p, ...(p.tenantId !== undefined ? { appId: "all" } : {}) }));

  const m = useMemo(() => {
    const fns = scopedFunctions(s, scope);
    const ex = scopedExecutions(s, scope, fns);
    const usage = scopedUsage(s, scope).filter((u) => u.source === "workflow-step" || fns.some((f) => f.id === u.fnId));
    const runs = scopedRuns(s, scope);
    const st = execStats(ex);
    const sum = sumUsage(usage);
    const bs = buckets(s.anchor, scope.range);
    const series = bs.map((b) => {
      const inB = ex.filter((e) => { const t = new Date(e.startedAt).getTime(); return t >= b.start && t < b.end; });
      const u = usage.filter((e) => { const t = new Date(e.at).getTime(); return t >= b.start && t < b.end; });
      return { t: b.label, succeeded: inB.filter((e) => e.status === "succeeded").length, notSucceeded: inB.filter((e) => e.status !== "succeeded").length, cost: Math.round(sumUsage(u).costMicros) / 1_000_000 };
    });
    const byFn = fns.map((f) => { const e = ex.filter((x) => x.fnId === f.id); const x = execStats(e); const c = e.reduce((a, y) => a + y.costMicros, 0); return { f, ...x, cost: c }; }).filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
    const byModel = groupUsage(usage, (u) => u.model);
    return { fns, ex, usage, runs, st, sum, series, byFn, byModel };
  }, [s, scope]);

  const attention = useMemo(() => {
    const out: { tone: "warn" | "bad" | "info"; text: React.ReactNode }[] = [];
    for (const f of s.functions.filter((x) => x.status === "failed")) out.push({ tone: "bad", text: <><Link className="underline" href={`/mlops/functions/${f.id}`}>{f.name}</Link> failed to deploy. {f.statusReason}</> });
    for (const f of s.functions.filter((x) => x.status === "deploying")) out.push({ tone: "info", text: <><Link className="underline" href={`/mlops/functions/${f.id}`}>{f.name}</Link> is deploying to staging.</> });
    const waiting = s.runs.filter((r) => r.status === "waiting-approval");
    if (waiting.length) out.push({ tone: "info", text: <>{waiting.length} workflow {waiting.length === 1 ? "run is" : "runs are"} waiting for a human decision. <Link className="underline" href="/mlops/functions/workflows">Open workflows</Link></> });
    for (const b of s.budgets) {
      const since = new Date(s.anchor).getTime() - (b.period === "daily" ? 86_400_000 : 7 * 86_400_000);
      const spent = s.usage.filter((u) => (b.scope === "tenant" ? u.tenantId : u.appId) === b.scopeId && new Date(u.at).getTime() >= since).reduce((a, u) => a + u.costMicros, 0);
      if (spent / b.limitMicros * 100 >= b.alertAtPct) out.push({ tone: "warn", text: <>{b.name} budget is at {pct(spent, b.limitMicros, 0)} ({usd2(spent)} of {usd2(b.limitMicros)}). <Link className="underline" href="/mlops/functions/governance">Review budgets</Link></> });
    }
    return out;
  }, [s]);

  const apps = s.apps.filter((a) => scope.tenantId === "all" || a.tenantId === scope.tenantId);

  if (s.functions.length === 0) {
    return (
      <div className="space-y-5">
        <PageHeader title="Functions" description="Governed serverless functions and AI workflows. Every model call a function makes is attributed to the app and tenant that ran it." />
        <Card>
          <EmptyState icon={AlertTriangle} title="No functions yet" description="Create a function to run your own code next to your models, with policy, limits and cost attribution applied on every call."
            action={<Link href="/mlops/functions/new" className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-emph text-on-emph text-sm font-medium"><Plus size={14} /> New function</Link>} />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Functions" description="Governed serverless functions and AI workflows. Every model call a function makes is attributed to the app and tenant that ran it."
        action={<div className="flex gap-2"><Link href="/mlops/functions/workflows/new"><Button><FnIcon name="workflow" size={15} /> New workflow</Button></Link><Link href="/mlops/functions/new"><Button variant="primary"><Plus size={14} /> New function</Button></Link></div>} />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filters">
        <Select aria-label="Time range" value={scope.range} onChange={(e) => set({ range: e.target.value as Scope["range"] })} className="!w-40">{RANGES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</Select>
        <Select aria-label="Tenant" value={scope.tenantId} onChange={(e) => set({ tenantId: e.target.value })} className="!w-48"><option value="all">All tenants</option>{s.tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
        <Select aria-label="App" value={scope.appId} onChange={(e) => set({ appId: e.target.value })} className="!w-48"><option value="all">All apps</option>{apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
        <Select aria-label="Runtime" value={scope.runtime} onChange={(e) => set({ runtime: e.target.value })} className="!w-44"><option value="all">All runtimes</option>{RUNTIMES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}<option value="aws-lambda">AWS Lambda</option></Select>
        <Select aria-label="Status" value={scope.status} onChange={(e) => set({ status: e.target.value })} className="!w-40"><option value="all">Any status</option>{(Object.keys(FN_STATUS_LABEL) as FnStatus[]).map((x) => <option key={x} value={x}>{FN_STATUS_LABEL[x]}</option>)}</Select>
        {JSON.stringify(scope) !== JSON.stringify(DEFAULT_SCOPE) && <Button variant="ghost" onClick={() => setScope(DEFAULT_SCOPE)}>Clear filters</Button>}
      </div>

      {attention.length > 0 && (
        <div className="space-y-2">{attention.slice(0, 4).map((a, i) => <Notice key={i} tone={a.tone === "bad" ? "bad" : a.tone === "warn" ? "warn" : "info"}>{a.text}</Notice>)}</div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        <Kpi label="Active functions" value={`${m.fns.filter((f) => f.status === "active").length} of ${m.fns.length}`} sub={`${m.fns.filter((f) => f.status === "failed").length} failed, ${m.fns.filter((f) => f.status === "draft").length} draft`} />
        <Kpi label="Invocations" value={num(m.st.total)} sub={`${num(m.runs.length)} workflow runs`} />
        <Kpi label="Success rate" value={pct(m.st.ok, m.st.total)} sub={`${m.st.failed} failed or timed out`} tone={m.st.total && m.st.ok / m.st.total < 0.95 ? "warn" : undefined} />
        <Kpi label="p95 latency" value={fmtMs(m.st.p95)} sub={`average ${fmtMs(m.st.avg)}`} />
        <Kpi label="AI tokens" value={compact(m.sum.tokensIn + m.sum.tokensOut)} sub={`${compact(m.sum.tokensIn)} in, ${compact(m.sum.tokensOut)} out`} />
        <Kpi label="AI cost" value={usd2(m.sum.costMicros)} sub={`${usd(m.sum.calls ? m.sum.costMicros / m.sum.calls : 0, 5)} per model call`} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader title="Invocations" subtitle={`${RANGES.find((r) => r.id === scope.range)!.label}, per ${scope.range === "7d" ? "day" : scope.range === "24h" ? "hour" : "5 minutes"} (UTC)`} />
          <div className="p-4">
            {m.st.total === 0 ? <p className="text-sm text-text-secondary py-10 text-center">No invocations in this range for the selected filters.</p>
              : <MetricChart data={m.series} series={[{ key: "succeeded", name: "Succeeded" }, { key: "notSucceeded", name: "Failed, blocked or throttled" }]} area height={210} />}
          </div>
        </Card>
        <Card>
          <CardHeader title="Governance outcomes" subtitle="What the gateway did to these invocations" />
          <div className="px-5 py-4 space-y-3 text-[13px]">
            {([["Succeeded", m.st.ok], ["Failed or timed out", m.st.failed], ["Blocked by policy", m.st.blocked], ["Throttled", m.st.throttled]] as [string, number][]).map(([k, v]) => (
              <div key={k}><div className="flex justify-between mb-1"><span className="text-text-secondary">{k}</span><span className="tabular-nums">{num(v)} <span className="text-text-tertiary">({pct(v, m.st.total)})</span></span></div><Meter value={v} max={m.st.total} warnAt={101} label={k} /></div>
            ))}
            <p className="text-xs text-text-tertiary pt-1">Blocked calls never reach a model and cost nothing.</p>
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader title="Busiest functions" action={<Link href="/mlops/functions/registry" className="text-xs text-accent-700 hover:underline">All functions</Link>} />
          {m.byFn.length === 0 ? <p className="text-sm text-text-secondary p-6">No function ran in this range.</p> : (
            <Table>
              <Thead><tr><Th>Function</Th><Th>Status</Th><Th>Invocations</Th><Th>Errors</Th><Th>p95</Th><Th>AI cost</Th></tr></Thead>
              <tbody>
                {m.byFn.slice(0, 8).map((r) => (
                  <Tr key={r.f.id}>
                    <Td><Link href={`/mlops/functions/${r.f.id}`} className="font-medium hover:underline">{r.f.name}</Link><div className="text-xs text-text-tertiary">{s.apps.find((a) => a.id === r.f.appId)?.name}</div></Td>
                    <Td><FnStatusBadge s={r.f.status} /></Td>
                    <Td className="tabular-nums">{num(r.total)}</Td>
                    <Td className="tabular-nums">{pct(r.failed + r.blocked, r.total)}</Td>
                    <Td className="tabular-nums">{fmtMs(r.p95)}</Td>
                    <Td className="tabular-nums">{usd(r.cost)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="Cost by model" subtitle="Functions and workflow AI steps" />
          {m.byModel.length === 0 ? <p className="text-sm text-text-secondary p-6">No model calls in this range.</p> : (
            <ul className="divide-y divide-border">
              {m.byModel.map((r) => (
                <li key={r.key} className="px-5 py-3 text-[13px]">
                  <div className="flex items-center justify-between gap-2"><ModelChip id={r.key} /><span className="tabular-nums font-medium">{usd2(r.costMicros)}</span></div>
                  <div className="text-xs text-text-tertiary mt-0.5 tabular-nums">{num(r.calls)} calls, {compact(r.tokensIn + r.tokensOut)} tokens</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Latest executions" action={<Link href="/mlops/functions/executions" className="text-xs text-accent-700 hover:underline">All executions</Link>} />
        <Table>
          <Thead><tr><Th>Execution</Th><Th>Function</Th><Th>Outcome</Th><Th>Duration</Th><Th>Model</Th><Th>Cost</Th><Th>Started</Th></tr></Thead>
          <tbody>
            {m.ex.slice(0, 6).map((e) => (
              <Tr key={e.id}>
                <Td><Link href={`/mlops/functions/executions/${e.id}`} className="font-code text-xs hover:underline">{e.id}</Link></Td>
                <Td>{e.fnName}</Td>
                <Td><span className={e.status === "succeeded" ? "text-status-healthy" : e.status === "failed" || e.status === "timeout" ? "text-status-down" : "text-status-degraded"}>{e.status}</span></Td>
                <Td className="tabular-nums text-text-secondary">{fmtMs(e.durationMs)}</Td>
                <Td className="text-text-secondary"><ModelChip id={e.model} /></Td>
                <Td className="tabular-nums text-text-secondary">{usd(e.costMicros, 5)}</Td>
                <Td className="text-text-secondary">{ago(e.startedAt, s.anchor)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        {m.ex.length === 0 && <p className="text-sm text-text-secondary p-6">Nothing ran in this range.</p>}
      </Card>
    </div>
  );
}
