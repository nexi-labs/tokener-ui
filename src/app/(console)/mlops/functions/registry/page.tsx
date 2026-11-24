"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { FnTile } from "@/components/functions/FnIcon";
import { FnStatusBadge, TRIGGER_LABEL, TriggerChip, ago, pct, useFx } from "@/components/functions/ui";
import { execStats } from "@/lib/functions/select";
import { RUNTIMES, FN_STATUS_LABEL, num, usd, type FnStatus, type TriggerKind } from "@/lib/functions/types";

export default function Registry() {
  const s = useFx();
  const [q, setQ] = useState(""); const [status, setStatus] = useState("all"); const [runtime, setRuntime] = useState("all"); const [tenant, setTenant] = useState("all"); const [trigger, setTrigger] = useState("all");
  const day = new Date(s.anchor).getTime() - 86_400_000;
  const rows = useMemo(() => s.functions.filter((f) => {
    const hay = `${f.name} ${f.description} ${f.tags.join(" ")}`.toLowerCase();
    return (!q || hay.includes(q.toLowerCase())) && (status === "all" || f.status === status) && (runtime === "all" || f.runtime === runtime) && (tenant === "all" || f.tenantId === tenant)
      && (trigger === "all" || s.triggers.some((t) => t.fnId === f.id && t.kind === trigger));
  }).map((f) => {
    const ex = s.executions.filter((e) => e.fnId === f.id && new Date(e.startedAt).getTime() >= day);
    return { f, st: execStats(ex), cost: ex.reduce((a, e) => a + e.costMicros, 0), triggers: s.triggers.filter((t) => t.fnId === f.id) };
  }), [s, q, status, runtime, tenant, trigger, day]);

  return (
    <div className="space-y-5">
      <PageHeader title="Function registry" description="Every function in the organisation, with its owner, runtime, triggers and what it did in the last 24 hours."
        action={<Link href="/mlops/functions/new"><Button variant="primary"><Plus size={14} /> New function</Button></Link>} />
      {s.functions.length === 0 ? (
        <Card><EmptyState icon={Search} title="The registry is empty" description="Functions you create appear here with their revisions, deployments and governance." action={<Link href="/mlops/functions/new" className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-emph text-on-emph text-sm font-medium"><Plus size={14} /> New function</Link>} /></Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filters">
            <div className="relative w-64"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" /><Input aria-label="Search functions" placeholder="Search name, description or tag" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" /></div>
            <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="!w-40"><option value="all">Any status</option>{(Object.keys(FN_STATUS_LABEL) as FnStatus[]).map((x) => <option key={x} value={x}>{FN_STATUS_LABEL[x]}</option>)}</Select>
            <Select aria-label="Runtime" value={runtime} onChange={(e) => setRuntime(e.target.value)} className="!w-44"><option value="all">All runtimes</option>{RUNTIMES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}<option value="aws-lambda">AWS Lambda</option></Select>
            <Select aria-label="Tenant" value={tenant} onChange={(e) => setTenant(e.target.value)} className="!w-48"><option value="all">All tenants</option>{s.tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
            <Select aria-label="Trigger" value={trigger} onChange={(e) => setTrigger(e.target.value)} className="!w-40"><option value="all">Any trigger</option>{(Object.keys(TRIGGER_LABEL) as TriggerKind[]).map((k) => <option key={k} value={k}>{TRIGGER_LABEL[k]}</option>)}</Select>
          </div>
          <Card>
            {rows.length === 0 ? <EmptyState icon={Search} title="No function matches" description="Change the search or the filters." action={<Button onClick={() => { setQ(""); setStatus("all"); setRuntime("all"); setTenant("all"); setTrigger("all"); }}>Clear filters</Button>} /> : (
              <Table>
                <Thead><tr><Th>Function</Th><Th>Status</Th><Th>Runtime</Th><Th>Triggers</Th><Th>Revision</Th><Th>24 h calls</Th><Th>Errors</Th><Th>24 h cost</Th><Th>Updated</Th></tr></Thead>
                <tbody>
                  {rows.map(({ f, st, cost, triggers }) => (
                    <Tr key={f.id}>
                      <Td>
                        <div className="flex items-center gap-3">
                          <FnTile name={f.kind === "lambda-proxy" ? "connector" : "function"} size={34} />
                          <div className="min-w-0">
                            <Link href={`/mlops/functions/${f.id}`} className="font-medium hover:underline">{f.name}</Link>
                            <div className="text-xs text-text-tertiary truncate max-w-[280px]">{s.apps.find((a) => a.id === f.appId)?.name}, {s.tenants.find((t) => t.id === f.tenantId)?.name}</div>
                          </div>
                        </div>
                      </Td>
                      <Td><FnStatusBadge s={f.status} /></Td>
                      <Td className="text-text-secondary">{f.runtime === "aws-lambda" ? "AWS Lambda" : RUNTIMES.find((r) => r.id === f.runtime)?.label}</Td>
                      <Td><div className="flex flex-col gap-0.5">{triggers.length ? triggers.map((t) => <TriggerChip key={t.id} kind={t.kind} />) : <span className="text-xs text-text-tertiary">none</span>}</div></Td>
                      <Td className="tabular-nums text-text-secondary">{f.activeRevision ? `r${f.activeRevision}` : "none"}{f.latestRevision !== f.activeRevision && <span className="text-text-tertiary"> (r{f.latestRevision} pending)</span>}</Td>
                      <Td className="tabular-nums">{num(st.total)}</Td>
                      <Td className="tabular-nums text-text-secondary">{pct(st.failed + st.blocked, st.total)}</Td>
                      <Td className="tabular-nums text-text-secondary">{usd(cost)}</Td>
                      <Td className="text-text-secondary">{ago(f.updatedAt, s.anchor)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
