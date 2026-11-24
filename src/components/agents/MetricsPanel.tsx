"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Kpi, MetricChart, Tabs } from "@/components/mlops/ui";
import { AgentChip, KIND_COLOR, KIND_LABEL } from "@/components/agents/bits";
import { download, metricsCsv } from "@/lib/agents/export";
import { agentSeries, fleetSeries, slowestSpans, sumBy, timeByKind, type MetricWindow } from "@/lib/agents/observe";
import type { Agent, StepKind, Trace } from "@/lib/agents/types";
import { compact, dur, int, pct, usd } from "@/lib/agents/format";

/** Rate, errors, latency percentiles, cost and tool use for one agent or all of them, plus where the time goes inside a run. */
export function MetricsPanel({ agents, agent, traces, colors }: { agents: Agent[]; agent: Agent | null; traces: Trace[]; colors: Record<string, string> }) {
  const [win, setWin] = useState<MetricWindow>("7d");
  const rows = useMemo(() => (agent ? agentSeries(agent, win) : fleetSeries(agents, win)), [agent, agents, win]);
  const runs = sumBy(rows, (r) => r.runs); const failed = sumBy(rows, (r) => r.failed);
  const lat = (k: "p50" | "p95" | "p99") => { const w = rows.filter((r) => r.runs); return w.length ? Math.round(sumBy(w, (r) => r[k] * r.runs) / Math.max(1, sumBy(w, (r) => r.runs))) : 0; };
  const scope = useMemo(() => traces.filter((t) => t.kind === "run" && (!agent || t.agentIds.includes(agent.id))), [traces, agent]);
  const kinds = useMemo(() => timeByKind(scope, agent?.id), [scope, agent]); const kmax = Math.max(1, ...kinds.map((k) => k.ms));
  const slow = useMemo(() => slowestSpans(scope, 8, agent?.id), [scope, agent]);
  const name = (id: string) => agents.find((a) => a.id === id)?.name ?? id;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-72"><Tabs label="Window" value={win} onChange={setWin} tabs={[{ id: "24h", label: "Last 24 hours" }, { id: "7d", label: "7 days" }, { id: "30d", label: "30 days" }]} /></div>
        <Button className="ml-auto" onClick={() => download(`tokener-metrics-${agent?.name ?? "all-agents"}-${win}.csv`, metricsCsv(rows, agent?.name ?? "all agents"), "text/csv")}><Download size={14} /> Export CSV</Button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Runs" value={compact(runs)} sub={win === "24h" ? "Last 24 hours" : `Last ${win}`} />
        <Kpi label="Failed" value={runs ? pct(failed / runs) : "n/a"} sub={`${int(failed)} runs`} tone={runs && failed / runs > 0.04 ? "warn" : undefined} />
        <Kpi label="Median time" value={lat("p50") ? dur(lat("p50")) : "n/a"} sub="p50 of a run" />
        <Kpi label="Slowest 5%" value={lat("p95") ? dur(lat("p95")) : "n/a"} sub={`p99 ${lat("p99") ? dur(lat("p99")) : "n/a"}`} />
        <Kpi label="Cost" value={usd(sumBy(rows, (r) => r.costUsd), 0)} sub={`${compact(sumBy(rows, (r) => r.tokens))} tokens`} />
      </div>
      <div className="grid lg:grid-cols-2 gap-5">
        <Card><CardHeader title="Runs and failures" subtitle="Per hour or day" /><CardBody><MetricChart data={rows} series={[{ key: "runs", name: "Runs" }, { key: "failed", name: "Failed" }]} area height={210} /></CardBody></Card>
        <Card><CardHeader title="Time for a run" subtitle="Median, 95th and 99th percentile" /><CardBody><MetricChart data={rows} series={[{ key: "p50", name: "p50 (ms)" }, { key: "p95", name: "p95 (ms)" }, { key: "p99", name: "p99 (ms)" }]} height={210} /></CardBody></Card>
        <Card><CardHeader title="Cost" subtitle="Model and tool calls, US dollars" /><CardBody><MetricChart data={rows} series={[{ key: "costUsd", name: "Cost (USD)" }]} area height={210} /></CardBody></Card>
        <Card><CardHeader title="Tool calls and tokens" subtitle="What the agent used" /><CardBody><MetricChart data={rows.map((r) => ({ t: r.t, toolCalls: r.toolCalls, ktokens: Math.round(r.tokens / 1000) }))} series={[{ key: "toolCalls", name: "Tool calls" }, { key: "ktokens", name: "Thousand tokens" }]} height={210} /></CardBody></Card>
      </div>
      <div className="grid lg:grid-cols-5 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader title="Where the time goes" subtitle={`Own time by kind of step, ${scope.length} traces`} />
          <CardBody className="space-y-3">
            {kinds.length === 0 ? <p className="text-sm text-text-secondary">No traces yet for this scope.</p> : kinds.map((k) => (
              <div key={k.kind}>
                <div className="flex justify-between text-[13px]"><span>{KIND_LABEL[k.kind as StepKind] ?? k.kind} <span className="text-text-tertiary text-xs">{k.calls} calls</span></span><span className="tabular-nums text-text-secondary">{dur(k.ms / Math.max(1, scope.length))} per trace</span></div>
                <div className="h-1.5 rounded bg-surface-muted mt-1.5 overflow-hidden"><div className="h-full rounded" style={{ width: `${(k.ms / kmax) * 100}%`, background: KIND_COLOR[k.kind as StepKind] ?? "var(--chart-s1)" }} /></div>
              </div>
            ))}
          </CardBody>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader title="Slowest steps" subtitle="Ranked by 95th percentile" />
          <Table>
            <Thead><tr><Th>Step</Th><Th>Agent</Th><Th className="text-right">Calls</Th><Th className="text-right">p50</Th><Th className="text-right">p95</Th><Th className="text-right">Failed</Th></tr></Thead>
            <tbody>
              {slow.map((s) => (
                <Tr key={s.agentId + s.name}><Td className="font-mono text-[12.5px]">{s.name}</Td><Td><AgentChip name={name(s.agentId)} color={colors[s.agentId] ?? "#999"} /></Td><Td className="text-right tabular-nums">{s.calls}</Td><Td className="text-right tabular-nums">{dur(s.p50)}</Td><Td className="text-right tabular-nums">{dur(s.p95)}</Td><Td className="text-right tabular-nums">{s.errors}</Td></Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
