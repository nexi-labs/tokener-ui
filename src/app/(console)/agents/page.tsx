"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle, ArrowRight, ShieldAlert, XCircle } from "lucide-react";
import { ArenaGlyph } from "@/components/agents/AgentGlyphs";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Kpi, MetricChart } from "@/components/mlops/ui";
import { ControlBadge, FrameworkMark, Section, ShareBar } from "@/components/agents/bits";
import { attention, sensitiveTools, sum, totals, useAgents } from "@/lib/agents/store";
import { CONTROL_HELP, CONTROL_LABEL, type ControlLevel } from "@/lib/agents/types";
import { compact, int, pct, usd } from "@/lib/agents/format";

const LEVELS: ControlLevel[] = ["governed", "observed", "inventory"];

export default function ControlArena() {
  const { agents } = useAgents();
  const live = useMemo(() => agents.filter((a) => a.state !== "retired"), [agents]);
  const k = useMemo(() => {
    const t = live.map((a) => totals(a));
    const executions = sum(t.map((x) => x.executions)); const failures = sum(t.map((x) => x.failures));
    return { executions, failures, cost: sum(t.map((x) => x.costUsd)), failureRate: executions ? failures / executions : 0,
      byLevel: Object.fromEntries(LEVELS.map((l) => [l, live.filter((a) => a.control === l).length])) as Record<ControlLevel, number>,
      suspended: live.filter((a) => a.state === "suspended").length };
  }, [live]);
  const alerts = useMemo(() => attention(agents), [agents]);

  const daily = useMemo(() => {
    const end = Date.now();
    return Array.from({ length: 30 }, (_, i) => ({
      t: new Date(end - (29 - i) * 86_400_000).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      cost: Math.round(sum(live.map((a) => a.daily[i]?.costUsd ?? 0)) * 100) / 100,
      runs: sum(live.map((a) => a.daily[i]?.executions ?? 0)),
    }));
  }, [live]);

  const byCost = useMemo(() => [...live].map((a) => ({ a, t: totals(a) })).filter((x) => x.t.costUsd > 0).sort((x, y) => y.t.costUsd - x.t.costUsd).slice(0, 7), [live]);
  const maxCost = byCost[0]?.t.costUsd ?? 1;

  const departments = useMemo(() => {
    const m = new Map<string, typeof live>();
    for (const a of live) m.set(a.department, [...(m.get(a.department) ?? []), a]);
    return [...m.entries()].map(([name, list]) => {
      const t = list.map((a) => totals(a)); const ex = sum(t.map((x) => x.executions));
      return { name, count: list.length, runs: ex, cost: sum(t.map((x) => x.costUsd)), failureRate: ex ? sum(t.map((x) => x.failures)) / ex : 0, governed: list.filter((a) => a.control === "governed").length };
    }).sort((x, y) => y.cost - x.cost);
  }, [live]);

  const sensitive = useMemo(() => live.filter((a) => sensitiveTools(a).length).sort((x, y) => (x.control === "governed" ? 1 : 0) - (y.control === "governed" ? 1 : 0)), [live]);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Agents in use" value={live.length} sub={`${agents.length - live.length} retired${k.suspended ? `, ${k.suspended} suspended` : ""}`} />
        <Kpi label="Governed" value={`${k.byLevel.governed} of ${live.length}`} sub="Calls pass through tok∑ner" />
        <Kpi label="Runs, 30 days" value={compact(k.executions)} sub="From governed and observed agents" />
        <Kpi label="Cost, 30 days" value={usd(k.cost, 0)} sub="Model and tool calls" />
        <Kpi label="Failed runs" value={pct(k.failureRate)} sub={`${int(k.failures)} of ${int(k.executions)}`} tone={k.failureRate > 0.04 ? "warn" : undefined} />
      </div>

      <div className="grid lg:grid-cols-5 gap-5">
        <Card className="lg:col-span-3">
          <CardHeader title="How much of this does tok∑ner control" subtitle="A governed agent can be stopped. An observed one can only be watched. Counting them together would overstate control." />
          <CardBody className="space-y-4">
            <div className="flex h-3 rounded-full overflow-hidden bg-surface-muted" role="img" aria-label={LEVELS.map((l) => `${k.byLevel[l]} ${CONTROL_LABEL[l].toLowerCase()}`).join(", ")}>
              {LEVELS.map((l, i) => k.byLevel[l] > 0 && <div key={l} style={{ width: `${(k.byLevel[l] / live.length) * 100}%`, background: ["var(--chart-s3)", "var(--chart-s1)", "var(--chart-axis)"][i] }} className={i ? "border-l-2 border-surface" : ""} />)}
            </div>
            <ul className="divide-y divide-border">
              {LEVELS.map((l, i) => (
                <li key={l} className="py-2.5 flex items-start gap-3">
                  <span className="mt-1.5 h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: ["var(--chart-s3)", "var(--chart-s1)", "var(--chart-axis)"][i] }} />
                  <div className="min-w-0 flex-1"><div className="text-sm font-medium">{CONTROL_LABEL[l]}</div><div className="text-xs text-text-secondary mt-0.5 max-w-xl">{CONTROL_HELP[l]}</div></div>
                  <div className="text-lg font-semibold tabular-nums">{k.byLevel[l]}</div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Needs attention" subtitle={alerts.length ? `${alerts.length} to look at` : undefined} />
          <CardBody className="!pt-0">
            {alerts.length === 0 ? <p className="text-sm text-text-secondary py-4">Nothing needs attention.</p> : (
              <ul className="divide-y divide-border">
                {alerts.slice(0, 6).map((x) => (
                  <li key={x.key} className="py-2.5 flex items-start gap-2.5">
                    {x.tone === "bad" ? <XCircle size={15} className="mt-0.5 text-status-down shrink-0" /> : <AlertTriangle size={15} className="mt-0.5 text-status-degraded shrink-0" />}
                    <p className="text-[13px] text-text-primary flex-1">{x.text}</p>
                    <Link href={`/agents/registry/${x.agentId}`} className="text-xs text-text-secondary hover:text-text-primary inline-flex items-center gap-1 shrink-0 mt-0.5">Open <ArrowRight size={12} /></Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid lg:grid-cols-5 gap-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Cost per day" subtitle="All agents, last 30 days" />
          <CardBody><MetricChart data={daily} series={[{ key: "cost", name: "Cost (USD)" }]} area height={220} unit="" /></CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Where the money goes" subtitle="Cost by agent, last 30 days" />
          <CardBody className="space-y-3">
            {byCost.map(({ a, t }) => (
              <Link key={a.id} href={`/agents/registry/${a.id}`} className="block group">
                <div className="flex items-center justify-between gap-3 text-[13px]"><span className="truncate group-hover:underline">{a.title}</span><span className="tabular-nums text-text-secondary">{usd(t.costUsd, 0)}</span></div>
                <ShareBar value={t.costUsd} max={maxCost} label={`${a.title} ${usd(t.costUsd, 0)}`} />
              </Link>
            ))}
          </CardBody>
        </Card>
      </div>

      <Section title="Agents that can reach sensitive tools" hint="A tool counts as sensitive when it changes money, records, access or code. Where approval is on, a person decides before it runs.">
        <Card>
          <Table>
            <Thead><tr><Th>Agent</Th><Th>Sensitive tools</Th><Th>Control</Th><Th>Approval</Th></tr></Thead>
            <tbody>
              {sensitive.map((a) => {
                const s = sensitiveTools(a); const approved = s.filter((x) => x.approval).length;
                return (
                  <Tr key={a.id}>
                    <Td><Link href={`/agents/registry/${a.id}`} className="inline-flex items-center gap-2.5 hover:underline"><FrameworkMark id={a.framework} size={16} /><span className="font-medium">{a.title}</span></Link></Td>
                    <Td><span className="font-mono text-xs text-text-secondary">{s.map((x) => `${x.server}.${x.tool}`).join(", ")}</span></Td>
                    <Td><ControlBadge c={a.control} /></Td>
                    <Td>{a.control !== "governed" ? <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary"><ShieldAlert size={13} className="text-status-degraded" /> Cannot be enforced</span>
                      : approved === s.length ? <Badge tone="healthy">Person approves</Badge> : <Badge tone="degraded">{approved} of {s.length} need approval</Badge>}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      </Section>

      <Section title="By department" hint="Ownership and cost roll up to the department that owns each agent.">
        <Card>
          <Table>
            <Thead><tr><Th>Department</Th><Th className="text-right">Agents</Th><Th>Governed</Th><Th className="text-right">Runs</Th><Th className="text-right">Failed</Th><Th className="text-right">Cost</Th></tr></Thead>
            <tbody>
              {departments.map((d) => (
                <Tr key={d.name}>
                  <Td className="font-medium">{d.name}</Td>
                  <Td className="text-right tabular-nums">{d.count}</Td>
                  <Td><div className="flex items-center gap-2"><ShareBar value={d.governed} max={d.count} label={`${d.governed} of ${d.count} governed`} /><span className="text-xs text-text-secondary tabular-nums w-10">{d.governed}/{d.count}</span></div></Td>
                  <Td className="text-right tabular-nums">{int(d.runs)}</Td>
                  <Td className="text-right tabular-nums">{d.runs ? pct(d.failureRate) : "n/a"}</Td>
                  <Td className="text-right tabular-nums">{usd(d.cost, 0)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </Section>

      <p className="text-xs text-text-tertiary flex items-center gap-2"><ArenaGlyph size={14} /> Agents that are only registered report no runs or cost, so they are counted but never measured.</p>
    </div>
  );
}
