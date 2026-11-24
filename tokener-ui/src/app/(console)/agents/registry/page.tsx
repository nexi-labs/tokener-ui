"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Bot, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Form";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { ControlBadge, FrameworkMark, RiskBadge, ShareBar, StateBadge } from "@/components/agents/bits";
import { RegisterAgent } from "@/components/agents/RegisterAgent";
import { ForgeGlyph } from "@/components/agents/AgentGlyphs";
import { budgetShare, totals, useAgents } from "@/lib/agents/store";
import { ADAPTER_BY_ID } from "@/lib/agents/adapters";
import { ago, int, pct, usd } from "@/lib/agents/format";
import { CONTROL_LABEL, type ControlLevel } from "@/lib/agents/types";
import { PageHeader } from "@/components/ui/PageHeader";

export default function Registry() {
  const { agents } = useAgents();
  const [q, setQ] = useState(""); const [control, setControl] = useState<"all" | ControlLevel>("all"); const [state, setState] = useState("active"); const [dept, setDept] = useState("all");
  const [open, setOpen] = useState(false);
  const depts = useMemo(() => [...new Set(agents.map((a) => a.department))].sort(), [agents]);
  const rows = useMemo(() => agents.filter((a) => (control === "all" || a.control === control) && (dept === "all" || a.department === dept)
    && (state === "all" || (state === "active" ? a.state !== "retired" : a.state === state))
    && (!q || [a.title, a.name, a.owner, a.department, ADAPTER_BY_ID[a.framework]?.name ?? ""].join(" ").toLowerCase().includes(q.toLowerCase()))), [agents, q, control, state, dept]);
  return (
    <div>
      <PageHeader title="Agents" description="Every AI agent in the organisation, with an owner, a control level and what it costs. Build one in Agent Forge or register one that already runs elsewhere."
        action={<div className="flex gap-2"><Link href="/agents/forge"><Button><ForgeGlyph size={15} /> Build in Agent Forge</Button></Link><Button variant="primary" onClick={() => setOpen(true)}><Plus size={15} /> Register agent</Button></div>} />
      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <div className="relative w-64"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" /><Input className="pl-8" placeholder="Search name, owner, framework" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search agents" /></div>
        <Select className="!w-auto" value={control} onChange={(e) => setControl(e.target.value as typeof control)} aria-label="Control level"><option value="all">Any control level</option>{(["governed", "observed", "inventory"] as const).map((l) => <option key={l} value={l}>{CONTROL_LABEL[l]}</option>)}</Select>
        <Select className="!w-auto" value={state} onChange={(e) => setState(e.target.value)} aria-label="State"><option value="active">In use</option><option value="suspended">Suspended</option><option value="retired">Retired</option><option value="all">All</option></Select>
        <Select className="!w-auto" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department"><option value="all">Any department</option>{depts.map((d) => <option key={d}>{d}</option>)}</Select>
        <span className="text-xs text-text-tertiary ml-auto">{rows.length} of {agents.length}</span>
      </div>
      <Card>
        {rows.length === 0 ? <EmptyState icon={Bot} title="No agents match" description="Change the filters, or register an agent." /> : (
          <Table>
            <Thead><tr><Th>Agent</Th><Th>Control</Th><Th>State</Th><Th>Owner</Th><Th className="text-right">Runs, 30 days</Th><Th className="text-right">Failed</Th><Th className="text-right">Cost</Th><Th>Budget used</Th><Th>Last seen</Th></tr></Thead>
            <tbody>
              {rows.map((a) => {
                const t = totals(a); const measured = a.control !== "inventory"; const share = budgetShare(a);
                return (
                  <Tr key={a.id}>
                    <Td>
                      <Link href={`/agents/registry/${a.id}`} className="flex items-center gap-3 group">
                        <FrameworkMark id={a.framework} size={18} />
                        <span className="min-w-0"><span className="block font-medium group-hover:underline truncate">{a.title}</span><span className="block text-xs text-text-tertiary font-mono truncate">agent://acme/{a.name}</span></span>
                      </Link>
                    </Td>
                    <Td><div className="flex flex-col items-start gap-1"><ControlBadge c={a.control} />{a.risk === "high" && <RiskBadge r={a.risk} />}</div></Td>
                    <Td><StateBadge s={a.state} /></Td>
                    <Td><div className="text-[13px]">{a.owner}</div><div className="text-xs text-text-tertiary">{a.department}</div></Td>
                    <Td className="text-right tabular-nums">{measured ? int(t.executions) : "n/a"}</Td>
                    <Td className="text-right tabular-nums">{measured && t.executions ? pct(t.failureRate) : "n/a"}</Td>
                    <Td className="text-right tabular-nums">{measured ? usd(t.costUsd, 0) : "n/a"}</Td>
                    <Td>{a.budget.monthlyUsd ? <ShareBar value={share} tone={share >= 1 ? "bad" : share >= 0.9 ? "warn" : undefined} label={`${Math.round(share * 100)}% of budget`} /> : <span className="text-xs text-text-tertiary">No budget</span>}</Td>
                    <Td className="text-xs text-text-secondary whitespace-nowrap">{a.control === "inventory" ? "Not reported" : ago(a.lastSeen)}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      <RegisterAgent open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
