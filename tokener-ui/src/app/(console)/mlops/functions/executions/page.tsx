"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Kpi } from "@/components/mlops/ui";
import { ExecBadge, ModelChip, TRIGGER_LABEL, TriggerChip, ago, fmtMs, pct, useFx } from "@/components/functions/ui";
import { RANGES, execStats, type RangeId } from "@/lib/functions/select";
import { EXEC_STATUS_LABEL, num, usd, usd2, type ExecStatus, type TriggerKind } from "@/lib/functions/types";

export default function Executions() {
  const s = useFx();
  const [range, setRange] = useState<RangeId>("24h"); const [fn, setFn] = useState("all"); const [status, setStatus] = useState<ExecStatus | "all">("all"); const [trig, setTrig] = useState<TriggerKind | "all">("all");
  const [tenant, setTenant] = useState("all"); const [model, setModel] = useState("all"); const [q, setQ] = useState(""); const [limit, setLimit] = useState(50);
  const since = new Date(s.anchor).getTime() - RANGES.find((r) => r.id === range)!.ms;
  const rows = useMemo(() => s.executions.filter((e) => new Date(e.startedAt).getTime() >= since && (fn === "all" || e.fnId === fn) && (status === "all" || e.status === status) && (trig === "all" || e.trigger === trig)
    && (tenant === "all" || e.tenantId === tenant) && (model === "all" || e.model === model) && (!q || e.id.includes(q) || e.correlationId.includes(q) || e.auditId.includes(q))), [s, since, fn, status, trig, tenant, model, q]);
  const st = execStats(rows); const cost = rows.reduce((a, e) => a + e.costMicros, 0);
  const reset = () => { setFn("all"); setStatus("all"); setTrig("all"); setTenant("all"); setModel("all"); setQ(""); setLimit(50); };
  return (
    <div className="space-y-5">
      <PageHeader title="Executions" description="Every invocation with its trigger, outcome, model, tokens, cost and the policy decision. Open one for the step timeline and logs." />
      {s.executions.length === 0 ? <Card><EmptyState icon={ScrollText} title="Nothing has run yet" description="Executions appear here as soon as a function is invoked by an HTTP call, a Kafka event or a schedule." /></Card> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi label="Executions" value={num(st.total)} /><Kpi label="Succeeded" value={pct(st.ok, st.total)} sub={`${num(st.ok)} of ${num(st.total)}`} /><Kpi label="Failed or timed out" value={num(st.failed)} tone={st.failed ? "warn" : undefined} />
            <Kpi label="Blocked by policy" value={num(st.blocked)} /><Kpi label="AI cost" value={usd2(cost)} sub={`p95 ${fmtMs(st.p95)}`} />
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filters">
            <div className="relative w-64"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" /><Input aria-label="Search by id" placeholder="Execution, correlation or audit id" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" /></div>
            <Select aria-label="Time range" value={range} onChange={(e) => setRange(e.target.value as RangeId)} className="!w-40">{RANGES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</Select>
            <Select aria-label="Function" value={fn} onChange={(e) => setFn(e.target.value)} className="!w-48"><option value="all">All functions</option>{s.functions.filter((f) => s.executions.some((e) => e.fnId === f.id)).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select>
            <Select aria-label="Outcome" value={status} onChange={(e) => setStatus(e.target.value as ExecStatus | "all")} className="!w-48"><option value="all">Any outcome</option>{(Object.keys(EXEC_STATUS_LABEL) as ExecStatus[]).map((x) => <option key={x} value={x}>{EXEC_STATUS_LABEL[x]}</option>)}</Select>
            <Select aria-label="Trigger" value={trig} onChange={(e) => setTrig(e.target.value as TriggerKind | "all")} className="!w-40"><option value="all">Any trigger</option>{(Object.keys(TRIGGER_LABEL) as TriggerKind[]).map((k) => <option key={k} value={k}>{TRIGGER_LABEL[k]}</option>)}</Select>
            <Select aria-label="Tenant" value={tenant} onChange={(e) => setTenant(e.target.value)} className="!w-48"><option value="all">All tenants</option>{s.tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
            <Select aria-label="Model" value={model} onChange={(e) => setModel(e.target.value)} className="!w-48"><option value="all">Any model</option>{s.models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
          </div>
          <Card>
            {rows.length === 0 ? <EmptyState icon={Search} title="No execution matches" description="Widen the time range or clear a filter." action={<Button onClick={reset}>Clear filters</Button>} /> : (
              <>
                <Table>
                  <Thead><tr><Th>Execution</Th><Th>Function</Th><Th>Outcome</Th><Th>Trigger</Th><Th>Duration</Th><Th>Model</Th><Th>Tokens in / out</Th><Th>Cost</Th><Th>App</Th><Th>Started</Th></tr></Thead>
                  <tbody>
                    {rows.slice(0, limit).map((e) => (
                      <Tr key={e.id}>
                        <Td><Link href={`/mlops/functions/executions/${e.id}`} className="font-code text-xs hover:underline">{e.id}</Link></Td>
                        <Td><Link href={`/mlops/functions/${e.fnId}`} className="hover:underline">{e.fnName}</Link><span className="text-xs text-text-tertiary"> r{e.revision}</span></Td>
                        <Td><ExecBadge s={e.status} /></Td><Td><TriggerChip kind={e.trigger} /></Td><Td className="tabular-nums text-text-secondary">{fmtMs(e.durationMs)}</Td>
                        <Td className="text-text-secondary"><ModelChip id={e.model} /></Td><Td className="tabular-nums text-text-secondary">{e.tokensIn + e.tokensOut ? `${num(e.tokensIn)} / ${num(e.tokensOut)}` : "none"}</Td>
                        <Td className="tabular-nums text-text-secondary">{usd(e.costMicros, 5)}</Td><Td className="text-text-secondary">{s.apps.find((a) => a.id === e.appId)?.name}</Td><Td className="text-text-secondary">{ago(e.startedAt, s.anchor)}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
                <div className="p-3 border-t border-border flex items-center justify-between text-xs text-text-tertiary"><span>Showing {Math.min(limit, rows.length)} of {num(rows.length)}</span>{rows.length > limit && <Button onClick={() => setLimit(limit + 100)}>Show 100 more</Button>}</div>
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
