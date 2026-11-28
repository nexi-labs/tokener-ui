"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Cloud, Minus, Pause, Play, Plus, ShieldCheck, Waypoints, X } from "lucide-react";
import { ROLE_LABEL as MESH_ROLE } from "@/lib/agents/mesh";
import { PostureBadge } from "@/components/agents/NetworkBits";
import { REACH, assess, memberCounts } from "@/lib/agents/network";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { KeyValue, MetricChart, Tabs } from "@/components/mlops/ui";
import { ControlBadge, FrameworkMark, RiskBadge, ShareBar, StateBadge } from "@/components/agents/bits";
import { ADAPTER_BY_ID } from "@/lib/agents/adapters";
import { agents as actions, budgetShare, liveOf, sum, totals, useAgents } from "@/lib/agents/store";
import { ROLE_LABEL, usage } from "@/lib/agents/connectors";
import { useHub } from "@/lib/agents/hub";
import { ConnectorMark } from "@/components/agents/ConnectorMark";
import { METRIC_BY_ID, executionSummary, triggerLines } from "@/lib/agents/execution";
import { compact, dur, int, pct, usd } from "@/lib/agents/format";
import { HEALTH_LABEL, POLICY_BY_ID, PROTOCOL_BY_ID, healthOf, policiesFor } from "@/lib/agents/topology";
import { toast } from "@/lib/mlops/toast";
import { SwitchRuntimeButton } from "@/components/agents/SwitchRuntime";
import type { Agent } from "@/lib/agents/types";

export type Selection = { kind: "agent" | "link" | "group" | "resource"; id: string };
type Tab = "overview" | "metrics" | "connections" | "policies";

/** The slide-in panel beside the canvas: the parameters and metrics of whatever is selected. */
export function ConstellationPanel({ sel, onClose, onSelect, replicas }: { sel: Selection | null; onClose: () => void; onSelect: (s: Selection) => void; replicas?: Record<string, number> }) {
  const [tab, setTab] = useState<Tab>("overview");
  useEffect(() => setTab("overview"), [sel?.id]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape" && sel) onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [sel, onClose]);
  return (
    <aside aria-label="Details" aria-hidden={!sel} className={clsx("absolute right-0 top-0 bottom-0 w-[432px] max-w-full bg-surface border-l border-border shadow-popover flex flex-col transition-transform duration-200 ease-out z-30", sel ? "translate-x-0" : "translate-x-full")} onWheel={(e) => e.stopPropagation()}>
      {sel && <Body key={sel.kind + sel.id} sel={sel} tab={tab} setTab={setTab} onClose={onClose} onSelect={onSelect} replicas={replicas} />}
    </aside>
  );
}

function Head({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return <div className="flex items-start gap-3 px-5 pt-4 pb-3"><div className="min-w-0 flex-1">{children}</div><button aria-label="Close panel" onClick={onClose} className="h-8 w-8 grid place-items-center rounded-md text-text-tertiary hover:bg-surface-muted shrink-0"><X size={16} /></button></div>;
}
const Stat = ({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "bad" }) => (
  <div className="rounded-md border border-border px-3 py-2"><div className="text-[11px] text-text-tertiary">{label}</div><div className={clsx("text-base font-semibold tabular-nums", tone === "bad" && "text-status-down")}>{value}</div></div>
);

function Body({ sel, tab, setTab, onClose, onSelect, replicas }: { sel: Selection; tab: Tab; setTab: (t: Tab) => void; onClose: () => void; onSelect: (s: Selection) => void; replicas?: Record<string, number> }) {
  const store = useAgents(); const { agents, links, exposures, policies } = store; const live = useMemo(() => liveOf(store), [store]);
  const hub = useHub(); const use = useMemo(() => usage(agents, hub), [agents, hub]);
  const byId = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  if (sel.kind === "link") {
    const l = links.find((x) => x.id === sel.id); if (!l) return null; const p = PROTOCOL_BY_ID[l.protocol]; const from = byId.get(l.from)!, to = byId.get(l.to)!;
    return <>
      <Head onClose={onClose}><div className="flex items-center gap-2"><span className="h-2.5 w-7 rounded-full" style={{ background: p.color }} /><h2 className="text-base font-semibold">{p.label} link</h2></div><p className="text-xs text-text-tertiary mt-1">{from.title} to {to.title}</p></Head>
      <div className="px-5 pb-5 space-y-5 overflow-y-auto">
        <p className="text-sm text-text-secondary">{l.purpose}. {p.blurb}</p>
        <div className="grid grid-cols-2 gap-2.5"><Stat label="Messages, 24 hours" value={compact(l.messages24h)} /><Stat label="p95 time" value={dur(l.p95Ms)} /><Stat label="Errors" value={pct(l.errorRate)} tone={l.errorRate > 0.03 ? "bad" : undefined} /><Stat label="Authentication" value={{ jwt: "Signed token", mtls: "Mutual TLS", token: "Bearer token", none: "None" }[l.auth]} /></div>
        {!l.measured && <p className="text-xs text-text-tertiary rounded-md bg-surface-muted px-3 py-2">This link is declared by an owner. One end is not reporting, so the figures are an estimate and not a measurement.</p>}
        {l.types && <div><div className="text-[13px] font-medium mb-2">Message types seen</div><div className="flex flex-wrap gap-1.5">{l.types.map((t) => <code key={t} className="text-[11px] bg-surface-muted rounded px-1.5 py-0.5">{t}</code>)}</div></div>}
        <div className="space-y-2">{[from, to].map((a, i) => <button key={a.id} onClick={() => onSelect({ kind: "agent", id: a.id })} className="w-full flex items-center gap-3 rounded-md border border-border px-3 py-2 text-left hover:bg-surface-subtle"><FrameworkMark id={a.framework} /><span className="flex-1 min-w-0"><span className="block text-[11px] text-text-tertiary">{i ? "Receives" : "Sends"}</span><span className="block text-sm font-medium truncate">{a.title}</span></span><ArrowRight size={14} className="text-text-tertiary" /></button>)}</div>
      </div></>;
  }

  if (sel.kind === "resource") {
    const n = use.nodes.find((x) => x.key === sel.id); if (!n) return null;
    const kindLabel = { connection: "Connection", channel: "Notification channel", knowledge: "RAG index" }[n.kind];
    const where = { connection: "Open in Integrations", channel: "Open in Notification Center", knowledge: "Open in RAG" }[n.kind];
    const href = n.kind === "channel" ? "/notifications" : n.href;
    return <>
      <Head onClose={onClose}><div className="flex items-center gap-3"><ConnectorMark iconKey={n.iconKey} integrationId={n.integrationId} size={22} box={36} /><div className="min-w-0"><h2 className="text-base font-semibold truncate">{n.name}</h2><p className="text-xs text-text-tertiary truncate">{kindLabel}, {n.subtitle}</p></div></div>
        <div className="flex flex-wrap items-center gap-1.5 mt-3"><Badge tone={n.status === "ready" ? "healthy" : n.status === "warning" ? "degraded" : "down"}>{n.status === "ready" ? "Ready" : n.status === "warning" ? "Needs attention" : "Not working"}</Badge></div></Head>
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {n.problem && <p className={clsx("text-[13px] rounded-md px-3 py-2", n.status === "problem" ? "bg-[#FDECEC] text-[#8E1F1F]" : "bg-[#FEF3C7] text-[#7A4B00]")}>{n.problem}</p>}
        <p className="text-sm text-text-secondary">{n.kind === "knowledge" ? "Agents retrieve passages from this index before they answer, and each retrieval shows in their traces." : n.kind === "channel" ? "Agents post here and ask for decisions here through the notification tools. The channel decides who is told and how." : "A connection set up in Integrations. Agents use it through tok∑ner, so credentials stay in the secret store and every call is recorded."}</p>
        <div><div className="text-[13px] font-medium mb-2">Used by {n.agentIds.length} {n.agentIds.length === 1 ? "agent" : "agents"}</div>
          <div className="space-y-2">{n.agentIds.map((id) => { const a = byId.get(id); const e = use.edges.find((x) => x.agentId === id && x.nodeKey === n.key); if (!a || !e) return null; return (
            <button key={id} onClick={() => onSelect({ kind: "agent", id })} className="w-full flex items-center gap-3 rounded-md border border-border px-3 py-2 text-left hover:bg-surface-subtle"><FrameworkMark id={a.framework} />
              <span className="flex-1 min-w-0"><span className="block text-sm font-medium truncate">{a.title}</span><span className="block text-[11px] text-text-tertiary truncate">{e.roles.map((r) => ROLE_LABEL[r]).join(", ")}{e.tools.length ? `, ${e.tools.join(", ")}` : ""}</span></span><ArrowRight size={14} className="text-text-tertiary" /></button>); })}</div></div>
      </div>
      <div className="px-5 py-3 border-t border-border bg-surface-subtle"><Link href={href} className="text-[13px] font-medium inline-flex items-center gap-1.5 hover:underline">{where} <ArrowRight size={13} /></Link></div>
    </>;
  }

  if (sel.kind === "group") {
    const list = agents.filter((a) => a.department === sel.id && a.state !== "retired");
    const t = list.map((a) => totals(a)); const ex = sum(t.map((x) => x.executions));
    return <>
      <Head onClose={onClose}><h2 className="text-base font-semibold">{sel.id}</h2><p className="text-xs text-text-tertiary mt-1">Department</p></Head>
      <div className="px-5 pb-5 space-y-5 overflow-y-auto">
        <div className="grid grid-cols-2 gap-2.5"><Stat label="Agents" value={list.length} /><Stat label="Governed" value={`${list.filter((a) => a.control === "governed").length} of ${list.length}`} /><Stat label="Runs, 30 days" value={compact(ex)} /><Stat label="Cost, 30 days" value={usd(sum(t.map((x) => x.costUsd)), 0)} /></div>
        <div><div className="text-[13px] font-medium mb-2">Policies on the whole department</div>
          {policies.filter((p) => "department" in p.scope && p.scope.department === sel.id).map((p) => <div key={p.id} className="flex items-start gap-2.5 py-1.5"><span className="mt-1.5 h-0.5 w-5 shrink-0 rounded" style={{ background: POLICY_BY_ID[p.kind].color }} /><div><div className="text-sm">{p.name}</div><div className="text-xs text-text-tertiary">{p.detail}</div></div></div>)}
          {!policies.some((p) => "department" in p.scope && p.scope.department === sel.id) && <p className="text-sm text-text-tertiary">None.</p>}</div>
        <div className="space-y-2">{list.map((a) => <button key={a.id} onClick={() => onSelect({ kind: "agent", id: a.id })} className="w-full flex items-center gap-3 rounded-md border border-border px-3 py-2 text-left hover:bg-surface-subtle"><FrameworkMark id={a.framework} /><span className="flex-1 min-w-0 text-sm font-medium truncate">{a.title}</span><ControlBadge c={a.control} /></button>)}</div>
      </div></>;
  }

  const a = byId.get(sel.id); if (!a) return null;
  const networks = store.networks; const posture = assess(a, a.network, networks, memberCounts(Object.fromEntries(agents.map((x) => [x.id, x.network]))));
  const t = totals(a); const t7 = totals(a, 7); const h = healthOf(a); const measured = a.control !== "inventory";
  const mine = links.filter((l) => l.from === a.id || l.to === a.id); const exp = exposures.find((e) => e.agentId === a.id);
  const pol = policiesFor(a, policies); const l = live[a.id]; const share = budgetShare(a);
  const days = a.daily.map((d, i) => ({ t: new Date(Date.now() - (29 - i) * 86_400_000).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }), runs: d.executions, failed: d.failures, cost: d.costUsd }));
  const adapter = ADAPTER_BY_ID[a.framework];
  return <>
    <Head onClose={onClose}>
      <div className="flex items-center gap-3"><FrameworkMark id={a.framework} size={22} />
        <div className="min-w-0"><h2 className="text-base font-semibold truncate">{a.title}</h2><p className="text-xs text-text-tertiary font-mono truncate">agent://acme/{a.name}</p></div></div>
      <div className="flex flex-wrap items-center gap-1.5 mt-3"><StateBadge s={a.state} /><ControlBadge c={a.control} /><RiskBadge r={a.risk} /><Badge tone={h === "healthy" ? "healthy" : h === "failing" ? "down" : h === "degraded" ? "degraded" : "neutral"}>{HEALTH_LABEL[h]}</Badge>{exp && <Badge tone={exp.auth === "none" ? "down" : "info"}><Cloud size={11} className="mr-1" />Exposed</Badge>}</div>
    </Head>
    <div className="px-5"><Tabs<Tab> label="Agent sections" value={tab} onChange={setTab} tabs={[{ id: "overview", label: "Overview" }, { id: "metrics", label: "Metrics" }, { id: "connections", label: "Connections", count: mine.length + (exp ? 1 : 0) }, { id: "policies", label: "Policies", count: pol.length }]} /></div>
    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
      {tab === "overview" && <>
        <p className="text-sm text-text-secondary">{a.description}</p>
        <div className="grid grid-cols-2 gap-2.5">
          <Stat label="Runs today" value={measured ? int(a.daily[29].executions) : "n/a"} /><Stat label="Running now" value={measured && l ? `${l.running}` : "n/a"} />
          <Stat label="Failed, 7 days" value={measured && t7.executions ? pct(t7.failureRate) : "n/a"} tone={t7.executions >= 50 && t7.failureRate > 0.06 ? "bad" : undefined} /><Stat label="p95 time" value={a.p95Ms ? dur(a.p95Ms) : "n/a"} />
        </div>
        {a.budget.monthlyUsd > 0 && <div><div className="flex justify-between text-[13px] mb-1.5"><span className="font-medium">Monthly budget</span><span className="tabular-nums text-text-secondary">{usd(a.budget.spentUsd, 0)} of {usd(a.budget.monthlyUsd, 0)}</span></div><ShareBar value={share} tone={share >= 1 ? "bad" : share >= 0.9 ? "warn" : undefined} label={`${Math.round(share * 100)}% used`} /></div>}
        {l && l.pendingApprovals > 0 && <p className="text-[13px] rounded-md bg-[#FEF3C7] text-[#7A4B00] px-3 py-2">{l.pendingApprovals} {l.pendingApprovals === 1 ? "action is" : "actions are"} waiting for a person to approve.</p>}
        {a.execution && <RunsAs a={a} now={replicas?.[a.id]} />}
        {use.edges.some((e) => e.agentId === a.id) && <div><div className="text-[13px] font-medium mb-2">Uses</div>
          <div className="space-y-1.5">{use.edges.filter((e) => e.agentId === a.id).map((e) => { const n = use.nodes.find((x) => x.key === e.nodeKey)!; return (
            <button key={e.key} onClick={() => onSelect({ kind: "resource", id: n.key })} className="w-full flex items-center gap-3 rounded-md border border-border px-3 py-2 text-left hover:bg-surface-subtle"><ConnectorMark iconKey={n.iconKey} integrationId={n.integrationId} />
              <span className="flex-1 min-w-0"><span className="block text-sm font-medium truncate">{n.name}</span><span className="block text-[11px] text-text-tertiary truncate">{e.roles.map((r) => ROLE_LABEL[r]).join(", ")}{e.tools.length ? `, ${e.tools.join(", ")}` : ""}</span></span>
              {e.status !== "ready" && <span className={clsx("h-2 w-2 rounded-full shrink-0", e.status === "problem" ? "bg-status-down" : "bg-status-degraded")} title={n.problem} />}</button>); })}</div></div>}
        <KeyValue rows={[["Owner", a.owner], ["Department", a.department], ["Framework", adapter?.name ?? a.framework], ["Runs on", a.runtime === "kubernetes" ? "Kubernetes" : a.runtime === "cloud" ? "Cloud" : "Another platform"], ["Environment", a.environment], ["Version", a.version], ["Models", a.models.join(", ") || "Not reported"],
          ["Does", a.capabilities.map((c) => <code key={c} className="text-[11px] bg-surface-muted rounded px-1.5 py-0.5 mr-1">{c}</code>)], ["Tools", a.tools.length ? a.tools.map((x) => `${x.server}.${x.tool}`).join(", ") : "None"], ["Built", a.origin === "forge" ? "In Agent Forge" : "Registered"]]} />
      </>}
      {tab === "metrics" && (measured ? <>
        <div className="grid grid-cols-3 gap-2.5"><Stat label="Runs, 30 days" value={compact(t.executions)} /><Stat label="Failed" value={t.executions ? pct(t.failureRate) : "n/a"} /><Stat label="Cost" value={usd(t.costUsd, 0)} /></div>
        <div><div className="text-[13px] font-medium mb-1">Runs and failures per day</div><MetricChart data={days} series={[{ key: "runs", name: "Runs" }, { key: "failed", name: "Failed" }]} height={170} unit="" /></div>
        <div><div className="text-[13px] font-medium mb-1">Cost per day (USD)</div><MetricChart data={days} series={[{ key: "cost", name: "Cost" }]} area height={150} unit="" /></div>
        <p className="text-xs text-text-tertiary">Sample figures. {a.control === "observed" ? "This agent reports its own figures, so they are as complete as its reporting." : "Every call passed through tok∑ner, so these are counted, not reported."}</p>
      </> : <p className="text-sm text-text-secondary rounded-md bg-surface-muted px-3 py-3">This agent is registered by hand and reports nothing, so there are no figures to chart. Connect it, or move it to Observed, to see runs and cost.</p>)}
      {tab === "connections" && <>
        <div className="rounded-md border border-border p-3 space-y-1.5" data-testid="panel-security">
          <div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck size={15} /> Network security <span className="ml-auto"><PostureBadge p={posture} /></span></div>
          {a.network ? <div className="text-xs text-text-secondary">{REACH.find((r) => r.id === a.network!.reach)!.label}{a.network.network ? `, in ${networks.find((n) => n.id === a.network!.network)?.name ?? "a network"}` : ""}. Outbound: {a.network.egress.mode === "allow-all" ? "anywhere" : a.network.egress.mode === "deny-all" ? "nothing" : `${a.network.egress.rules.length} allowed`}. {posture.findings.find((f) => f.severity !== "good") ? <>Next fix: {posture.findings.find((f) => f.severity !== "good")!.title.toLowerCase()}.</> : "Nothing to fix."}</div>
            : <div className="text-xs text-text-secondary">No network setup. Any caller in the organisation can reach it, and nothing limits where it can call.</div>}
          <Link href={`/agents/registry/${a.id}?tab=network`} className="inline-flex items-center gap-1 text-xs underline text-text-secondary hover:text-text-primary">{a.network ? "Open the Network tab" : "Set it up"} <ArrowRight size={11} /></Link>
        </div>
        <div className="rounded-md border border-border p-3 space-y-1.5" data-testid="panel-mesh">
          <div className="flex items-center gap-2 text-sm font-medium"><Waypoints size={15} /> Agent mesh</div>
          {store.meshes.filter((m) => m.members.some((x) => x.agentId === a.id)).map((m) => { const me = m.members.find((x) => x.agentId === a.id)!; const outs = m.handoffs.filter((h) => h.from === a.id).length; const ins = m.handoffs.filter((h) => h.to === a.id).length;
            return <Link key={m.id} href={`/agents/mesh/${m.id}`} className="block text-xs text-text-secondary hover:text-text-primary"><span className="font-medium text-text-primary">{m.name}</span> <span className="text-text-tertiary">{m.status}</span>. {MESH_ROLE[me.role]}. Takes work from {ins}, hands on to {outs}.</Link>; })}
          {!store.meshes.some((m) => m.members.some((x) => x.agentId === a.id)) && <div className="text-xs text-text-secondary">Not part of a mesh. A mesh gives it a role in a use case, with rules for who hands it work.</div>}
        </div>
        {exp && <div className="rounded-md border border-border p-3 space-y-1.5"><div className="flex items-center gap-2 text-sm font-medium"><Cloud size={15} /> Reachable from outside</div>
          <div className="text-xs text-text-secondary">{{ gateway: "Through the tok∑ner gateway", "public-url": "On a public address", webhook: "Through a webhook" }[exp.via]}. {exp.auth === "none" ? <span className="text-status-down font-medium">There is no authentication.</span> : `Callers use ${exp.auth === "jwt" ? "a signed token" : "an application key"}.`} {compact(exp.requests24h)} requests in 24 hours.</div><code className="block text-[11px] text-text-tertiary break-all">{exp.url}</code></div>}
        {mine.length === 0 && !exp && <p className="text-sm text-text-tertiary">This agent does not talk to other agents.</p>}
        {mine.map((x) => { const out = x.from === a.id; const other = byId.get(out ? x.to : x.from)!; const p = PROTOCOL_BY_ID[x.protocol]; return (
          <button key={x.id} onClick={() => onSelect({ kind: "link", id: x.id })} className="w-full text-left rounded-md border border-border px-3 py-2.5 hover:bg-surface-subtle">
            <div className="flex items-center gap-2"><span className="h-2 w-5 rounded-full" style={{ background: p.color }} /><span className="text-[13px] font-semibold">{p.label}</span><span className="text-xs text-text-tertiary">{out ? "to" : "from"}</span><span className="text-[13px] font-medium truncate">{other.title}</span></div>
            <div className="text-xs text-text-secondary mt-1">{x.purpose}</div><div className="text-[11px] text-text-tertiary mt-1 tabular-nums">{compact(x.messages24h)} messages a day, p95 {dur(x.p95Ms)}{x.measured ? "" : ", declared not measured"}</div></button>); })}
      </>}
      {tab === "policies" && <>
        {pol.length === 0 && <p className="text-sm text-text-tertiary">No policy applies to this agent.</p>}
        {pol.map((p, i) => <div key={i} className="flex items-start gap-3 rounded-md border border-border px-3 py-2.5"><svg width="22" height="10" className="mt-1.5 shrink-0" aria-hidden><line x1="1" y1="5" x2="21" y2="5" stroke={POLICY_BY_ID[p.kind].color} strokeWidth="2.6" strokeLinecap="round" strokeDasharray={p.enforced ? "7 4" : "0.1 5"} /></svg>
          <div className="min-w-0"><div className="text-sm font-medium">{p.name} <span className="text-xs font-normal text-text-tertiary">{POLICY_BY_ID[p.kind].label}, {p.scope === "department" ? "whole department" : "this agent"}</span></div><div className="text-xs text-text-secondary mt-0.5 break-words">{p.detail}</div>
            <div className="text-[11px] mt-1 text-text-tertiary">{p.enforced ? "Enforced by tok∑ner before each call." : "Advisory. This agent does not run through tok∑ner, so it cannot be enforced."}</div></div></div>)}
      </>}
    </div>
    <div className="px-5 py-3 border-t border-border bg-surface-subtle flex items-center justify-between gap-2">
      <Link href={`/agents/registry/${a.id}`} className="text-[13px] font-medium inline-flex items-center gap-1.5 hover:underline">Open agent <ArrowRight size={13} /></Link>
      {a.state === "active" && <Button onClick={() => { actions.setState(a.id, "suspended"); toast(`${a.title} is suspended`, "info"); }}><Pause size={14} /> Suspend</Button>}
      {a.state === "suspended" && <Button onClick={() => { actions.setState(a.id, "active"); toast(`${a.title} is active again`, "success"); }}><Play size={14} /> Resume</Button>}
    </div>
  </>;
}

/** How the agent starts and how many copies of it are running. Governed agents can be switched between automatic scaling and a number held by hand. */
function RunsAs({ a, now }: { a: Agent; now?: number }) {
  const e = a.execution!; const sc = e.scaling; const au = sc.autoscale; const governed = a.control === "governed" && e.runtime !== "external";
  const cur = now ?? (au.mode === "manual" ? au.desired : sc.minReplicas);
  const save = (next: typeof e) => { const r = actions.setExecution(a.id, next); if (!r.ok) toast(r.error, "error"); };
  const setMode = (mode: "auto" | "manual") => save({ ...e, scaling: { ...sc, autoscale: { ...au, mode, desired: mode === "manual" ? Math.min(sc.maxReplicas, Math.max(sc.minReplicas, cur)) : au.desired } } });
  const step = (d: number) => save({ ...e, scaling: { ...sc, autoscale: { ...au, desired: Math.min(sc.maxReplicas, Math.max(sc.minReplicas, au.desired + d)) } } });
  const lines = triggerLines(e);
  return (
    <div className="rounded-md border border-border">
      <div className="px-3 py-2.5 border-b border-border"><div className="flex items-center justify-between gap-2"><div className="text-[13px] font-medium">Runs as</div><SwitchRuntimeButton a={a} compact /></div><div className="text-xs text-text-secondary mt-0.5">{executionSummary(e)}</div>
        {lines.length > 0 && <ul className="mt-1.5 space-y-0.5 text-[11.5px] text-text-tertiary">{lines.slice(0, 3).map((l, i) => <li key={i} className="truncate">{l.text}</li>)}</ul>}</div>
      {e.runtime !== "external" ? (
        <div className="px-3 py-2.5 space-y-2.5">
          <div className="flex items-center justify-between"><div><div className="text-[11px] text-text-tertiary">Replicas now</div><div className="text-lg font-semibold tabular-nums">{cur}<span className="text-xs font-normal text-text-tertiary"> of {sc.maxReplicas} at most</span></div></div>
            <div role="group" aria-label="Scaling mode" className="inline-flex rounded-md border border-border-strong p-0.5 text-[12px] font-medium">
              {(["auto", "manual"] as const).map((m) => <button key={m} type="button" disabled={!governed} aria-pressed={au.mode === m} onClick={() => au.mode !== m && setMode(m)} className={clsx("px-2.5 h-6 rounded", au.mode === m ? "bg-[#07191E] text-white" : "text-text-secondary hover:bg-surface-muted", !governed && "opacity-50")}>{m === "auto" ? "Automatic" : "Manual"}</button>)}</div></div>
          {au.mode === "auto" ? <p className="text-xs text-text-secondary">Keeps {METRIC_BY_ID[au.metric].label.toLowerCase()} near {au.target} {METRIC_BY_ID[au.metric].unit}, between {sc.minReplicas} and {sc.maxReplicas} replicas.{au.calendar.length ? ` ${au.calendar.length} scheduled ${au.calendar.length === 1 ? "floor raises" : "floors raise"} the minimum at busy times.` : ""}</p>
            : <div className="flex items-center gap-2.5"><button type="button" aria-label="One fewer replica" disabled={!governed || au.desired <= sc.minReplicas} onClick={() => step(-1)} className="h-7 w-7 grid place-items-center rounded-md border border-border-strong disabled:opacity-40"><Minus size={14} /></button>
              <span className="w-8 text-center text-sm font-semibold tabular-nums">{au.desired}</span><button type="button" aria-label="One more replica" disabled={!governed || au.desired >= sc.maxReplicas} onClick={() => step(1)} className="h-7 w-7 grid place-items-center rounded-md border border-border-strong disabled:opacity-40"><Plus size={14} /></button>
              <span className="text-xs text-text-tertiary">Held here until you switch back to automatic.</span></div>}
          {!governed && <p className="text-[11px] text-text-tertiary">tok∑ner does not run this agent, so it cannot change its replicas.</p>}
        </div>
      ) : <p className="px-3 py-2.5 text-xs text-text-tertiary">This agent runs on another platform. Scale it there.</p>}
    </div>
  );
}
