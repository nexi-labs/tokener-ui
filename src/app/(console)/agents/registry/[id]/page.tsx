"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, Orbit, Pause, Play, Plug, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Form";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Confirm, Kpi, KeyValue, MetricChart, Notice, Tabs } from "@/components/mlops/ui";
import { ConnectionWizard } from "@/components/mlops/ConnectionWizard";
import { CodeBlock } from "@/components/mlops/Code";
import { ControlBadge, FrameworkMark, RiskBadge, ShareBar, StateBadge } from "@/components/agents/bits";
import { MemoryPanel } from "@/components/agents/MemoryPanel";
import { NetworkPanel } from "@/components/agents/NetworkPanel";
import { RuntimePanel } from "@/components/agents/RuntimePanel";
import { ConnectionsPanel } from "@/components/agents/ConnectionsPanel";
import { ForgeGlyph } from "@/components/agents/AgentGlyphs";
import { ADAPTER_BY_ID } from "@/lib/agents/adapters";
import { agents as actions, budgetShare, totals, useAgents } from "@/lib/agents/store";
import { validateCard } from "@/lib/agents/protocol";
import { MAX_DEPTH, TAP_VERSION } from "@/lib/agents/protocol";
import { policiesFor, POLICY_BY_ID, PROTOCOL_BY_ID } from "@/lib/agents/topology";
import { ago, compact, dur, int, pct, usd } from "@/lib/agents/format";
import { toast } from "@/lib/mlops/toast";

type Tab = "overview" | "runs" | "runtime" | "network" | "memory" | "connections" | "governance" | "connection" | "versions";

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { agents, traces, links, exposures, policies } = useAgents();
  const a = agents.find((x) => x.id === id);
  const q = useSearchParams(); const asked = q.get("tab");
  const [tab, setTab] = useState<Tab>(asked === "network" || asked === "runtime" || asked === "runs" || asked === "memory" ? asked : "overview");
  const [confirm, setConfirm] = useState<"suspend" | "retire" | null>(null);
  const [wizard, setWizard] = useState(false);
  const [budget, setBudget] = useState<string | null>(null);

  const mine = useMemo(() => traces.filter((t) => t.agentId === id), [traces, id]);
  if (!a) return <EmptyState icon={ArrowLeft} title="This agent does not exist" description="It may have been retired and removed, or the link is wrong." action={<Link href="/agents/registry"><Button>Back to agents</Button></Link>} />;

  const adapter = ADAPTER_BY_ID[a.framework];
  const t = totals(a); const measured = a.control !== "inventory"; const share = budgetShare(a);
  const pol = policiesFor(a, policies); const myLinks = links.filter((l) => l.from === a.id || l.to === a.id); const exp = exposures.find((e) => e.agentId === a.id);
  const days = a.daily.map((d, i) => ({ t: new Date(Date.now() - (29 - i) * 86_400_000).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }), runs: d.executions, failed: d.failures, cost: d.costUsd }));
  const card = {
    uri: `agent://acme/${a.name}`, name: a.title, summary: a.description, version: a.version, owner: a.owner, tap: [TAP_VERSION], conformance: a.control === "governed" ? "collaborate" : a.control === "observed" ? "observe" : "observe",
    endpoints: { relay: `${a.endpoint ?? "https://agent.example.com"}/relay`.replace(/\/+relay$/, "/relay"), pulse: `${a.endpoint ?? "https://agent.example.com"}/pulse` }, auth: ["jwt-bearer"], capabilities: a.capabilities.map((c) => ({ id: c })), modes: ["sync", "async"],
  };
  const cardIssues = validateCard(card);
  const canWizard = !!adapter?.connect;
  const tabs: { id: Tab; label: string; count?: number }[] = [{ id: "overview", label: "Overview" }, { id: "runs", label: "Runs", count: mine.length }, { id: "runtime", label: "Runtime" }, { id: "network", label: "Network" }, { id: "memory", label: "Memory" }, { id: "connections", label: "Connections" }, { id: "governance", label: "Governance" }, { id: "connection", label: "Address and keys" }, { id: "versions", label: "Versions", count: a.versions.length }];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/agents/registry" className="text-[13px] text-text-secondary hover:text-text-primary inline-flex items-center gap-1.5 mb-3"><ArrowLeft size={14} /> Agents</Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <span className="h-12 w-12 rounded-lg bg-surface-muted grid place-items-center shrink-0"><FrameworkMark id={a.framework} size={26} /></span>
            <div className="min-w-0"><h1 className="text-xl font-semibold tracking-tight truncate">{a.title}</h1><p className="text-xs text-text-tertiary font-mono mt-0.5">agent://acme/{a.name}</p>
              <div className="flex flex-wrap items-center gap-1.5 mt-2"><StateBadge s={a.state} /><ControlBadge c={a.control} /><RiskBadge r={a.risk} /><Badge tone="neutral">{adapter?.name ?? a.framework}</Badge>{exp && <Badge tone={exp.auth === "none" ? "down" : "info"}>Exposed</Badge>}</div></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/agents/constellation?agent=${a.id}`}><Button><Orbit size={15} /> Show in Constellation</Button></Link>
            {a.origin === "forge" && a.state !== "retired" && <Link href={`/agents/forge?agent=${a.id}`}><Button><ForgeGlyph size={15} /> Edit in Forge</Button></Link>}
            {a.state === "active" && <Button onClick={() => setConfirm("suspend")}><Pause size={14} /> Suspend</Button>}
            {a.state === "suspended" && <Button variant="primary" onClick={() => { actions.setState(a.id, "active"); toast(`${a.title} is active again`, "success"); }}><Play size={14} /> Resume</Button>}
            {a.state !== "retired" && <Button variant="ghost" onClick={() => setConfirm("retire")}><Trash2 size={14} /> Retire</Button>}
          </div>
        </div>
      </div>

      {a.control !== "governed" && a.state !== "retired" && <Notice tone={a.control === "observed" ? "info" : "warn"} title={a.control === "observed" ? "Observed, not governed" : "Inventory only"}>{a.control === "observed" ? "This agent reports what it does, but its calls do not pass through tok∑ner. A suspend is advice the agent may ignore, and policies are advisory." : "This agent is registered by hand. tok∑ner knows its owner and purpose, and nothing about what it does. Connect it, or route its calls through the gateway, to measure and govern it."}</Notice>}

      <Tabs<Tab> label="Agent sections" value={tab} onChange={setTab} tabs={tabs} />

      {tab === "overview" && <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Kpi label="Runs, 30 days" value={measured ? compact(t.executions) : "n/a"} /><Kpi label="Failed" value={measured && t.executions ? pct(t.failureRate) : "n/a"} tone={t.failureRate > 0.05 ? "warn" : undefined} />
          <Kpi label="p95 time" value={a.p95Ms ? dur(a.p95Ms) : "n/a"} /><Kpi label="Cost, 30 days" value={measured ? usd(t.costUsd, 0) : "n/a"} /><Kpi label="Last seen" value={a.control === "inventory" ? "Never" : ago(a.lastSeen)} />
        </div>
        {measured && <div className="grid lg:grid-cols-2 gap-5">
          <Card><CardHeader title="Runs and failures per day" /><CardBody><MetricChart data={days} series={[{ key: "runs", name: "Runs" }, { key: "failed", name: "Failed" }]} height={200} unit="" /></CardBody></Card>
          <Card><CardHeader title="Cost per day (USD)" /><CardBody><MetricChart data={days} series={[{ key: "cost", name: "Cost" }]} area height={200} unit="" /></CardBody></Card>
        </div>}
        <Card><CardHeader title="About" /><CardBody><p className="text-sm text-text-secondary mb-4 max-w-2xl">{a.description}</p>
          <KeyValue rows={[["Owner", a.owner], ["Department", a.department], ["Framework", adapter?.name ?? a.framework], ["Runs on", a.runtime === "kubernetes" ? "Kubernetes" : a.runtime === "cloud" ? "Cloud" : "Another platform"], ["Environment", a.environment], ["Version", a.version], ["Models", a.models.join(", ") || "Not reported"],
            ["Does", a.capabilities.map((c) => <code key={c} className="text-[11px] bg-surface-muted rounded px-1.5 py-0.5 mr-1">{c}</code>)], ["Created", `${ago(a.createdAt)}, ${a.origin === "forge" ? "built in Agent Forge" : "registered"}`]]} /></CardBody></Card>
      </div>}

      {tab === "runs" && <Card>{mine.length === 0 ? <EmptyState icon={Plug} title="No runs to show" description={measured ? "This agent has not run yet." : "This agent does not report runs."} /> : (
        <Table><Thead><tr><Th>Run</Th><Th>Started</Th><Th>Trigger</Th><Th>On behalf of</Th><Th className="text-right">Steps</Th><Th className="text-right">Time</Th><Th className="text-right">Cost</Th><Th>Result</Th></tr></Thead>
          <tbody>{mine.map((r) => <Tr key={r.id}><Td><Link href={`/agents/traces?trace=${r.id}`} className="font-mono text-xs hover:underline">{r.id}</Link></Td><Td className="text-xs text-text-secondary whitespace-nowrap">{ago(r.startedAt)}</Td><Td className="text-[13px]">{r.trigger}</Td><Td className="text-[13px]">{r.behalfOf}</Td><Td className="text-right tabular-nums">{r.spans.length - 1}</Td><Td className="text-right tabular-nums">{dur(r.durationMs)}</Td><Td className="text-right tabular-nums">{usd(r.costUsd, 3)}</Td><Td><Badge tone={r.status === "ok" ? "healthy" : "down"}>{r.status === "ok" ? "Succeeded" : "Failed"}</Badge></Td></Tr>)}</tbody></Table>)}</Card>}

      {tab === "memory" && <MemoryPanel key={a.id + a.version + (a.versions[0]?.at ?? "")} a={a} />}
      {tab === "runtime" && <RuntimePanel key={a.id} a={a} />}
      {tab === "network" && <NetworkPanel key={a.id} a={a} />}
      {tab === "connections" && <ConnectionsPanel key={a.id + (a.versions[0]?.at ?? "")} a={a} />}

      {tab === "governance" && <div className="space-y-5">
        <Card><CardHeader title="Budget" subtitle={a.control === "governed" ? "Calls stop when the monthly budget is reached." : "Recorded for reporting. tok∑ner cannot stop an agent that does not pass through it."} />
          <CardBody className="space-y-3">
            {a.budget.monthlyUsd > 0 && <div><div className="flex justify-between text-[13px] mb-1.5"><span>{usd(a.budget.spentUsd, 0)} of {usd(a.budget.monthlyUsd, 0)} this month</span><span className="text-text-tertiary">{Math.round(share * 100)}%</span></div><ShareBar value={share} tone={share >= 1 ? "bad" : share >= 0.9 ? "warn" : undefined} label={`${Math.round(share * 100)}% used`} /></div>}
            <div className="flex items-end gap-2"><div className="w-44"><Input type="number" min={0} aria-label="Monthly budget in USD" value={budget ?? a.budget.monthlyUsd} onChange={(e) => setBudget(e.target.value)} /></div>
              <Button onClick={() => { const r = actions.setBudget(a.id, Number(budget ?? a.budget.monthlyUsd)); if (!r.ok) toast(r.error, "error"); else { toast("Budget saved", "success"); setBudget(null); } }} disabled={budget === null}>Save budget</Button></div>
          </CardBody></Card>
        <Card><CardHeader title="Tools this agent can reach" subtitle="A sensitive tool changes money, records, access or code." />
          {a.tools.length === 0 ? <CardBody><p className="text-sm text-text-tertiary">No tools.</p></CardBody> : <Table><Thead><tr><Th>Tool</Th><Th>Sensitive</Th><Th>A person approves first</Th></tr></Thead>
            <tbody>{a.tools.map((x) => <Tr key={x.server + x.tool}><Td className="font-mono text-xs">{x.server}.{x.tool}</Td><Td>{x.sensitive ? <Badge tone="degraded">Sensitive</Badge> : <span className="text-xs text-text-tertiary">No</span>}</Td>
              <Td><label className="inline-flex items-center gap-2 text-[13px]"><input type="checkbox" className="accent-[#07191E]" checked={x.approval} disabled={a.control !== "governed" || a.state === "retired"} onChange={(e) => actions.setToolApproval(a.id, x.server, x.tool, e.target.checked)} />{x.approval ? "Required" : a.control === "governed" ? "Not required" : "Cannot be enforced"}</label></Td></Tr>)}</tbody></Table>}</Card>
        <Card><CardHeader title="Policies that apply" subtitle="Shown around the agent in Constellation." />
          <CardBody className="space-y-2.5">{pol.length === 0 ? <p className="text-sm text-text-tertiary">None.</p> : pol.map((p, i) => <div key={i} className="flex items-start gap-3"><span className="mt-2 h-0.5 w-5 rounded shrink-0" style={{ background: POLICY_BY_ID[p.kind].color }} /><div><div className="text-sm">{p.name} <span className="text-xs text-text-tertiary">{POLICY_BY_ID[p.kind].label}, {p.scope === "department" ? "whole department" : "this agent"}, {p.enforced ? "enforced" : "advisory"}</span></div><div className="text-xs text-text-secondary">{p.detail}</div></div></div>)}</CardBody></Card>
      </div>}

      {tab === "connection" && <div className="space-y-5">
        <Card><CardHeader title="Address and agent card" subtitle="What other agents see when they look this agent up." />
          <CardBody className="space-y-3">
            {cardIssues.length > 0 ? <Notice tone="warn" title="The card needs fixing">{cardIssues[0].path}: {cardIssues[0].message}</Notice> : <p className="text-xs text-status-healthy">The card passes the TAP card check.</p>}
            <CodeBlock code={JSON.stringify(card, null, 2)} language="json" title={`GET ${a.endpoint ?? "https://agent.example.com"}/.well-known/tokener-agent.json`} maxHeight={300} />
            <p className="text-xs text-text-tertiary">Sample card, built from the registry entry. Messages may nest at most {MAX_DEPTH} agents deep.</p>
          </CardBody></Card>
        <Card><CardHeader title="Talks to" />
          {myLinks.length === 0 ? <CardBody><p className="text-sm text-text-tertiary">This agent does not talk to other agents.</p></CardBody> : <Table><Thead><tr><Th>Direction</Th><Th>Agent</Th><Th>Protocol</Th><Th>Purpose</Th><Th className="text-right">Messages a day</Th></tr></Thead>
            <tbody>{myLinks.map((l) => { const out = l.from === a.id; const o = agents.find((x) => x.id === (out ? l.to : l.from))!; return <Tr key={l.id}><Td className="text-[13px]">{out ? "Sends to" : "Receives from"}</Td><Td><Link href={`/agents/registry/${o.id}`} className="hover:underline text-[13px] font-medium">{o.title}</Link></Td><Td><span className="inline-flex items-center gap-1.5 text-[13px]"><span className="h-2 w-4 rounded-full" style={{ background: PROTOCOL_BY_ID[l.protocol].color }} />{PROTOCOL_BY_ID[l.protocol].label}</span></Td><Td className="text-[13px] text-text-secondary">{l.purpose}</Td><Td className="text-right tabular-nums">{int(l.messages24h)}</Td></Tr>; })}</tbody></Table>}</Card>
        <Card><CardHeader title="Credentials" subtitle="Connections store references to secrets, never the secrets themselves." />
          <CardBody className="flex flex-wrap items-center gap-3">
            {canWizard ? <><Button onClick={() => setWizard(true)}><Plug size={14} /> Connect {adapter!.name}</Button><span className="text-xs text-text-tertiary">Opens the connection wizard with this framework's authentication options.</span></> : <p className="text-sm text-text-tertiary">{adapter?.name ?? "This framework"} needs no connection: it runs as a project built in Agent Forge.</p>}
          </CardBody></Card>
      </div>}

      {tab === "versions" && <Card><Table><Thead><tr><Th>Version</Th><Th>Date</Th><Th>Note</Th></tr></Thead><tbody>{a.versions.map((v, i) => <Tr key={i}><Td className="font-mono text-xs">{v.version}</Td><Td className="text-[13px] text-text-secondary">{new Date(v.at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</Td><Td className="text-[13px]">{v.note}</Td></Tr>)}</tbody></Table></Card>}

      <Confirm open={confirm === "suspend"} onClose={() => setConfirm(null)} title={`Suspend ${a.title}?`} confirmLabel="Suspend" danger
        body={<p>{a.control === "governed" ? "New requests are refused from the next call. Work in progress ends at its next model or tool call." : "tok∑ner records the suspend and tells the agent, but it cannot stop an agent that does not pass through it. The agent must honour the request."}</p>}
        onConfirm={() => { actions.setState(a.id, "suspended"); setConfirm(null); toast(`${a.title} is suspended`, "info"); }} />
      <Confirm open={confirm === "retire"} onClose={() => setConfirm(null)} title={`Retire ${a.title}?`} confirmLabel="Retire" danger phrase={a.name}
        body={<p>A retired agent stays in the registry for the record, with its history, and cannot be changed or resumed.</p>}
        onConfirm={() => { actions.setState(a.id, "retired"); setConfirm(null); toast(`${a.title} is retired`, "info"); router.push("/agents/registry"); }} />
      {canWizard && <ConnectionWizard open={wizard} onClose={() => setWizard(false)} initialIntegration={a.framework} />}
    </div>
  );
}
