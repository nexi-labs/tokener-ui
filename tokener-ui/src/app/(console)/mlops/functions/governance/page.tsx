"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Kpi } from "@/components/mlops/ui";
import { Meter, ProviderChip, pct, useFx } from "@/components/functions/ui";
import { num, usd2 } from "@/lib/functions/types";

export default function Governance() {
  const s = useFx();
  const day = new Date(s.anchor).getTime() - 86_400_000, week = new Date(s.anchor).getTime() - 7 * 86_400_000;
  const budgets = s.budgets.map((b) => {
    const ev = s.usage.filter((u) => (b.scope === "tenant" ? u.tenantId : u.appId) === b.scopeId && new Date(u.at).getTime() >= (b.period === "daily" ? day : week));
    const spent = ev.reduce((a, u) => a + u.costMicros, 0);
    return { b, spent, name: b.scope === "tenant" ? s.tenants.find((t) => t.id === b.scopeId)?.name : s.apps.find((a) => a.id === b.scopeId)?.name };
  });
  const policies = s.policies.map((p) => {
    const attached = s.functions.filter((f) => f.governance.policyIds.includes(p.id)).length;
    const ex = s.executions.filter((e) => e.policy.policyId === p.id);
    return { p, attached, deny: ex.filter((e) => e.policy.result === "deny").length, mon: ex.filter((e) => e.policy.result === "monitor-only").length };
  });
  const denied = s.executions.filter((e) => e.policy.result === "deny").length;
  const ext = s.providers.filter((p) => p.external).map((p) => p.id);
  const extUse = s.usage.filter((u) => ext.includes(u.provider)).length;
  const providerRows = s.providers.map((p) => { const ev = s.usage.filter((u) => u.provider === p.id); return { p, calls: ev.length, cost: ev.reduce((a, u) => a + u.costMicros, 0), fns: s.functions.filter((f) => f.governance.allowedProviders.includes(p.id)).length }; });
  return (
    <div className="space-y-5">
      <PageHeader title="Governance" description="The policies, budgets and provider allowlists that apply to every function and workflow. Per-function limits live on each function's Governance tab." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Active policies" value={`${s.policies.filter((p) => p.status === "active").length} of ${s.policies.length}`} sub={`${s.policies.filter((p) => p.mode === "enforce" && p.status === "active").length} enforcing`} />
        <Kpi label="Calls denied, 7 days" value={num(denied)} sub="Stopped before any model call" />
        <Kpi label="Model calls to external providers" value={num(extUse)} sub={`${num(s.usage.length - extUse)} stayed in-house`} />
        <Kpi label="Budgets at or over alert" value={String(budgets.filter(({ b, spent }) => spent / b.limitMicros * 100 >= b.alertAtPct).length)} sub={`${budgets.length} budgets`} />
      </div>
      <Card>
        <CardHeader title="Policies" subtitle="Versioned. A function lists the policies it uses." />
        <Table><Thead><tr><Th>Policy</Th><Th>Type</Th><Th>Mode</Th><Th>Status</Th><Th>Scope</Th><Th>Functions</Th><Th>Denials, 7 days</Th></tr></Thead>
          <tbody>{policies.map(({ p, attached, deny, mon }) => (
            <Tr key={p.id}>
              <Td><div className="font-medium">{p.name} <span className="text-xs text-text-tertiary">v{p.version}</span></div><div className="text-xs text-text-tertiary max-w-md">{p.description}</div><ul className="mt-1 text-[11px] text-text-secondary font-code list-disc pl-4">{p.rules.map((r) => <li key={r}>{r}</li>)}</ul></Td>
              <Td className="text-text-secondary">{p.kind}</Td><Td><Badge tone={p.mode === "enforce" ? "healthy" : "neutral"}>{p.mode}</Badge></Td><Td><Badge tone={p.status === "active" ? "healthy" : "neutral"}>{p.status}</Badge></Td>
              <Td className="text-text-secondary">{p.scope}</Td><Td className="tabular-nums">{attached}</Td><Td className="tabular-nums">{deny}{mon ? <span className="text-xs text-text-tertiary"> ({mon} monitored)</span> : null}</Td>
            </Tr>))}</tbody></Table>
      </Card>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Budgets" subtitle="Spend is summed from usage records" />
          <ul className="divide-y divide-border">{budgets.map(({ b, spent, name }) => (
            <li key={b.id} className="px-5 py-3.5 text-[13px]">
              <div className="flex justify-between gap-3 mb-1.5"><span><span className="font-medium">{b.name}</span> <span className="text-xs text-text-tertiary">{name}, {b.period}, {b.onExceed === "block" ? "blocks at the limit" : "alerts only"}</span></span><span className="tabular-nums">{usd2(spent)} of {usd2(b.limitMicros)} <span className="text-text-tertiary">({pct(spent, b.limitMicros, 0)})</span></span></div>
              <Meter value={spent} max={b.limitMicros} warnAt={b.alertAtPct} label={b.name} />
            </li>))}</ul>
        </Card>
        <Card>
          <CardHeader title="Providers" subtitle="What each provider received in the last 7 days" />
          <Table><Thead><tr><Th>Provider</Th><Th>Boundary</Th><Th>Functions allowed</Th><Th>Calls</Th><Th>Cost</Th></tr></Thead>
            <tbody>{providerRows.map(({ p, calls, cost, fns }) => <Tr key={p.id}><Td><ProviderChip id={p.id} /><div className="text-xs text-text-tertiary font-code">{p.endpoint}</div></Td><Td><Badge tone={p.external ? "degraded" : "healthy"}>{p.external ? "leaves the network" : "inside"}</Badge></Td><Td className="tabular-nums">{fns}</Td><Td className="tabular-nums">{num(calls)}</Td><Td className="tabular-nums text-text-secondary">{usd2(cost)}</Td></Tr>)}</tbody></Table>
        </Card>
      </div>
      <p className="text-xs text-text-tertiary">Policy definitions here mirror the gateway's policy studio. <Link href="/policies" className="underline">Open the policy builder</Link>.</p>
    </div>
  );
}
