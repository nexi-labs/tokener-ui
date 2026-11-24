"use client";

import clsx from "clsx";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Check, CheckCircle2, CircleDashed, ClipboardCheck, Clock, FileText, Search, Undo2, X, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Form";
import { Kpi, Notice, Tabs } from "@/components/mlops/ui";
import { AgentChip, FrameworkMark, RiskBadge, useAgentColors } from "@/components/agents/bits";
import { ConnectorMark, resolveKey } from "@/components/agents/ConnectorMark";
import { DocumentViewer } from "@/components/agents/DocumentViewer";
import { agentsStoreApprovals, useAgents } from "@/lib/agents/store";
import { useHub } from "@/lib/agents/hub";
import { isOpen, minutesLeft, reviewOf, STATUS_LABEL, type Approval, type ApprovalStatus } from "@/lib/agents/approvals";
import { PACK_BY_REF, type Check as ClaimCheck } from "@/lib/agents/claims";
import { ago } from "@/lib/agents/format";
import { toast } from "@/lib/mlops/toast";

/** The people the sample workspace can act as. A second approval must come from a different person than the first. */
const PEOPLE = ["Nestor Martourez", "Priya Nair"] as const;
const money = (n: number) => "USD " + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function left(a: Approval) {
  const m = minutesLeft(a); const abs = Math.abs(m);
  const t = abs >= 60 ? `${Math.floor(abs / 60)} h ${abs % 60 ? `${abs % 60} min` : ""}`.trim() : `${abs} min`;
  return m < 0 ? { text: `${t} past its time`, tone: "down" as const } : m <= 30 ? { text: `${t} left`, tone: "degraded" as const } : { text: `${t} left`, tone: "neutral" as const };
}
const STATUS_TONE: Record<ApprovalStatus, "healthy" | "degraded" | "down" | "info" | "neutral"> = { pending: "degraded", "awaiting-second": "info", approved: "healthy", declined: "down", changes: "neutral" };

export default function ApprovalsPage() {
  const s = useAgents(); const colors = useAgentColors();
  const params = useSearchParams();
  const [filter, setFilter] = useState<"open" | "decided" | "all">("open");
  const [agent, setAgent] = useState("all"); const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(params.get("id"));
  const [actor, setActor] = useState<string>(PEOPLE[0]);
  const byAgent = useMemo(() => new Map(s.agents.map((a) => [a.id, a])), [s.agents]);

  const open = s.approvals.filter(isOpen); const late = open.filter((a) => minutesLeft(a) < 0).length; const second = s.approvals.filter((a) => a.status === "awaiting-second").length;
  const list = useMemo(() => s.approvals
    .filter((a) => (filter === "all" || (filter === "open" ? isOpen(a) : !isOpen(a))) && (agent === "all" || a.agentId === agent) && (!q || (a.subject + " " + a.summary).toLowerCase().includes(q.toLowerCase())))
    .sort((x, y) => (isOpen(x) === isOpen(y) ? (isOpen(x) ? Date.parse(x.dueAt) - Date.parse(y.dueAt) : Date.parse(y.requestedAt) - Date.parse(x.requestedAt)) : isOpen(x) ? -1 : 1)), [s.approvals, filter, agent, q]);
  const current = s.approvals.find((a) => a.id === sel) ?? list[0] ?? null;
  const agents = useMemo(() => [...new Set(s.approvals.map((a) => a.agentId))].map((id) => byAgent.get(id)!).filter(Boolean), [s.approvals, byAgent]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Approvals</h1>
          <p className="text-sm text-text-secondary mt-1 max-w-2xl">Where an agent stops and asks a person. Each request keeps the run saved, shows what the agent relied on, and records who decided and why.</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          Acting as
          <Select aria-label="Act as" value={actor} onChange={(e) => setActor(e.target.value)} className="!w-48">{PEOPLE.map((p) => <option key={p}>{p}</option>)}</Select>
        </label>
      </div>
      <Notice title="Sample workspace">Requests, claim packs and people are invented. Switch the person above to give a second approval, which has to come from someone other than the first approver.</Notice>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Waiting for a decision" value={open.length} sub="across all agents" />
        <Kpi label="Past their time" value={late} tone={late ? "bad" : undefined} sub={late ? "They escalate to the next group" : "All within their time"} />
        <Kpi label="Waiting for a second approval" value={second} sub="Payouts above 5,000" />
        <Kpi label="Decided" value={s.approvals.length - open.length} sub="with the reason on record" />
      </div>

      <div className="grid xl:grid-cols-[320px_minmax(0,1fr)] gap-5 items-start">
        <div className="space-y-3 xl:sticky xl:top-4">
          <Tabs<"open" | "decided" | "all"> label="Show" value={filter} onChange={setFilter} tabs={[{ id: "open", label: "Waiting", count: open.length }, { id: "decided", label: "Decided", count: s.approvals.length - open.length }, { id: "all", label: "All" }]} />
          <div className="flex gap-2">
            <div className="relative flex-1 min-w-0"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" /><Input aria-label="Search requests" placeholder="Search requests" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" /></div>
            <Select aria-label="Agent" value={agent} onChange={(e) => setAgent(e.target.value)} className="!w-40"><option value="all">All agents</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}</Select>
          </div>
          {list.length === 0 ? <EmptyState icon={ClipboardCheck} title="Nothing to decide" description="Requests appear here when an agent reaches a human gate." /> : (
            <ul className="space-y-2">
              {list.map((a) => {
                const ag = byAgent.get(a.agentId); const t = left(a); const on = current?.id === a.id;
                return (
                  <li key={a.id}>
                    <button onClick={() => setSel(a.id)} aria-current={on} className={clsx("w-full text-left rounded-lg border p-3.5 transition-colors", on ? "border-accent-600 bg-accent-500/5" : "border-border bg-surface hover:bg-surface-subtle")}>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <AgentChip name={ag?.title ?? a.agentId} color={colors[a.agentId] ?? "#999"} />
                        {isOpen(a) ? <Badge tone={t.tone}>{t.text}</Badge> : <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>}
                      </div>
                      <div className="text-sm font-medium leading-snug">{a.subject}</div>
                      <div className="text-xs text-text-secondary mt-1 line-clamp-2">{a.summary}</div>
                      <div className="flex items-center gap-2 mt-2.5 text-[11px] text-text-tertiary">
                        {a.kind === "claim" && <span className="inline-flex items-center gap-1"><FileText size={12} /> {PACK_BY_REF[a.packRef!]?.pages.length} pages</span>}
                        {a.amountUsd !== undefined && <span className="tabular-nums">{money(a.amountUsd)}</span>}
                        <span className="ml-auto">{a.status === "awaiting-second" ? "Needs a second approver" : ago(a.requestedAt)}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="min-w-0">
          {current ? <Detail key={current.id} a={current} actor={actor} /> : <EmptyState icon={ClipboardCheck} title="Choose a request" description="Pick one from the list to read what the agent found and decide." />}
        </div>
      </div>
    </div>
  );
}

function Detail({ a, actor }: { a: Approval; actor: string }) {
  const s = useAgents(); const hub = useHub(); const colors = useAgentColors();
  const agent = s.agents.find((x) => x.id === a.agentId);
  const review = reviewOf(a); const pack = a.packRef ? PACK_BY_REF[a.packRef] : null;
  const [tab, setTab] = useState<"findings" | "fields" | "activity">(pack ? "findings" : "activity");
  const [field, setField] = useState<string | null>(null);
  const [reason, setReason] = useState(""); const [err, setErr] = useState<string | null>(null);
  const t = left(a); const flagged = review ? [...new Set(review.checks.filter((c) => c.result === "fail").flatMap((c) => c.fields))] : [];
  const first = a.decisions.find((d) => d.round === "first");
  const decide = (outcome: "approved" | "declined" | "changes") => {
    const r = agentsStoreApprovals.decide(a.id, actor, outcome, reason);
    if (!r.ok) { setErr(r.error); return; }
    setErr(null); setReason("");
    toast(r.value.status === "awaiting-second" ? "Approved. A second approver has been asked" : r.value.status === "approved" ? "Approved. The agent has resumed" : r.value.status === "declined" ? "Declined. The agent has stopped" : "Sent back to the agent for changes", "success");
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <AgentChip name={agent?.title ?? a.agentId} color={colors[a.agentId] ?? "#999"} />
              {agent && <RiskBadge r={agent.risk} />}
              <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
            </div>
            <h2 className="text-lg font-semibold tracking-tight">{a.subject}</h2>
            <p className="text-sm text-text-secondary mt-1.5 max-w-2xl">{a.summary}</p>
          </div>
          <div className="text-right shrink-0">
            {a.amountUsd !== undefined && <div><div className="text-[11px] uppercase tracking-wide text-text-tertiary">{a.kind === "claim" ? "Payable" : "Amount"}</div><div className="text-xl font-semibold tabular-nums">{money(a.amountUsd)}</div></div>}
            {isOpen(a) && <div className={clsx("mt-2 inline-flex items-center gap-1.5 text-xs", t.tone === "down" ? "text-status-down" : t.tone === "degraded" ? "text-status-degraded" : "text-text-secondary")}><Clock size={13} /> {t.text}</div>}
          </div>
        </div>
        <dl className="mt-4 pt-4 border-t border-border grid sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3 text-sm">
          <div><dt className="text-[11px] uppercase tracking-wide text-text-tertiary">Why it stopped</dt><dd className="mt-0.5">{a.trigger}</dd></div>
          <div><dt className="text-[11px] uppercase tracking-wide text-text-tertiary">Tool waiting</dt><dd className="mt-0.5 font-mono text-[13px]">{a.tool}</dd></div>
          <div><dt className="text-[11px] uppercase tracking-wide text-text-tertiary">Who decides</dt><dd className="mt-0.5">{a.assignee}</dd></div>
          <div><dt className="text-[11px] uppercase tracking-wide text-text-tertiary">Asked in</dt><dd className="mt-0.5 flex flex-wrap gap-1.5">{a.channelKeys.map((k) => { if (k === "console") return <span key={k} className="text-[13px]">Console</span>; const r = resolveKey(k, hub); return r ? <span key={k} className="inline-flex items-center gap-1 text-[13px]"><ConnectorMark iconKey={r.iconKey} integrationId={r.integrationId} size={12} box={20} />{r.name}</span> : null; })}</dd></div>
        </dl>
      </div>

      <div className={clsx("grid gap-5 items-start", pack && "xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]")}>
        {pack && <DocumentViewer title={pack.ref} pages={pack.pages} pdf={pack.pdf} fields={pack.fields} active={field} onActive={(k) => { setField(k); if (k) setTab("fields"); }} flagged={flagged} />}

        <div className="space-y-5 min-w-0">
          <Tabs<"findings" | "fields" | "activity"> label="Detail" value={tab} onChange={setTab} tabs={[...(pack ? [{ id: "findings" as const, label: "What the agent found" }, { id: "fields" as const, label: "Extracted values", count: pack.fields.length }] : []), { id: "activity" as const, label: "Activity", count: a.activity.length }]} />

          {tab === "findings" && review && (
            <div className="space-y-4">
              <div className={clsx("rounded-lg border p-4", review.recommendation === "approve" ? "border-status-healthy/40 bg-status-healthy/5" : "border-status-degraded/50 bg-status-degraded/5")}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 font-medium text-sm">{review.recommendation === "approve" ? <CheckCircle2 size={16} className="text-status-healthy" /> : <AlertTriangle size={16} className="text-status-degraded" />}{review.recommendation === "approve" ? "The agent recommends approving" : "The agent recommends checking first"}</div>
                  <span className="text-xs text-text-secondary tabular-nums">Confidence {Math.round(review.confidence * 100)} percent</span>
                </div>
                <p className="text-sm text-text-secondary mt-2">{review.summary}</p>
                <dl className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-border/70 text-sm">
                  <div><dt className="text-[11px] text-text-tertiary uppercase tracking-wide">Claimed</dt><dd className="tabular-nums">{money(review.claimed)}</dd></div>
                  <div><dt className="text-[11px] text-text-tertiary uppercase tracking-wide">Excess</dt><dd className="tabular-nums">{money(review.excess)}</dd></div>
                  <div><dt className="text-[11px] text-text-tertiary uppercase tracking-wide">Payable</dt><dd className="tabular-nums font-medium">{money(review.payable)}</dd></div>
                </dl>
              </div>
              <ul className="space-y-2.5">{review.checks.map((c) => <CheckRow key={c.id} c={c} onField={(k) => setField(k)} />)}</ul>
              <p className="text-[11px] text-text-tertiary">Rules come from the Claims guidelines knowledge base. <Link href="/mlops/knowledge/claims-guidelines" className="underline underline-offset-2">Open it</Link></p>
            </div>
          )}

          {tab === "fields" && pack && (
            <ul className="rounded-lg border border-border divide-y divide-border bg-surface">
              {pack.fields.map((f) => (
                <li key={f.key}>
                  <button onClick={() => setField(f.key === field ? null : f.key)} className={clsx("w-full text-left px-3.5 py-2.5 flex items-center gap-3 hover:bg-surface-subtle", field === f.key && "bg-accent-500/5")}>
                    <span className={clsx("h-2 w-2 rounded-full shrink-0", flagged.includes(f.key) ? "bg-status-down" : "bg-accent-600")} aria-hidden />
                    <span className="min-w-0 flex-1"><span className="block text-[11px] uppercase tracking-wide text-text-tertiary">{f.label}</span><span className="block text-sm truncate">{f.value}</span></span>
                    <span className="text-xs text-text-tertiary tabular-nums shrink-0">p.{f.page}</span>
                    <span className={clsx("text-xs tabular-nums shrink-0 w-10 text-right", f.confidence < 0.94 ? "text-status-degraded" : "text-text-secondary")}>{Math.round(f.confidence * 100)}%</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {tab === "activity" && (
            <ol className="relative border-l border-border ml-3 space-y-4 pb-1">
              {a.activity.map((x, i) => {
                const r = x.via ? resolveKey(x.via, hub) : null;
                return (
                  <li key={i} className="pl-5 relative">
                    <span className="absolute -left-[13px] top-0">{r ? <ConnectorMark iconKey={r.iconKey} integrationId={r.integrationId} size={13} box={26} /> : <span className="h-[26px] w-[26px] grid place-items-center rounded-md bg-surface-muted">{x.kind === "decision" ? <Check size={13} /> : x.kind === "resume" ? <ArrowRight size={13} /> : <CircleDashed size={13} />}</span>}</span>
                    <div className="text-sm leading-snug">{x.text}</div>
                    <div className="text-[11px] text-text-tertiary mt-0.5">{ago(x.at)}{r ? `, through ${r.name}` : ""}</div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>

      {a.details.length > 0 && !pack && (
        <Card><dl className="p-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4 text-sm">{a.details.map(([k, v]) => <div key={k}><dt className="text-[11px] uppercase tracking-wide text-text-tertiary">{k}</dt><dd className="mt-0.5">{v}</dd></div>)}</dl></Card>
      )}

      <div className="rounded-lg border border-border bg-surface p-5">
        {isOpen(a) ? (
          <>
            <div className="flex items-center justify-between gap-3 mb-2"><h3 className="text-sm font-semibold">Your decision</h3><span className="text-xs text-text-tertiary">as {actor}</span></div>
            {a.status === "awaiting-second" && first && <Notice tone="info" title={`${first.by} approved first`}>A second approver, someone other than {first.by}, must approve before the payout is released. {first.reason && `Their reason: ${first.reason}`}</Notice>}
            {a.status === "pending" && review?.needsSecond && <p className="text-xs text-text-secondary mb-2">This payout is above {money(review.secondApprovalAbove)}. After you approve, a second person must approve too.</p>}
            <label className="block text-xs text-text-secondary mb-1.5" htmlFor={`why-${a.id}`}>Reason{a.requireReason ? " (needed)" : ""}</label>
            <textarea id={`why-${a.id}`} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder={flagged.length ? "To approve despite the findings, say why it is acceptable" : "Why you are deciding this way. It is kept with the decision."} className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500/40" />
            {err && <p className="text-xs text-status-down mt-2" role="alert">{err}</p>}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <Button variant="primary" onClick={() => decide("approved")}><Check size={15} /> {a.status === "awaiting-second" ? "Give second approval" : "Approve"}</Button>
              <Button onClick={() => decide("changes")}><Undo2 size={15} /> Send back</Button>
              <Button onClick={() => decide("declined")}><X size={15} /> Decline</Button>
              <span className="text-xs text-text-tertiary ml-auto">The agent resumes from its saved run.</span>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">{a.status === "approved" ? <CheckCircle2 size={16} className="text-status-healthy" /> : a.status === "declined" ? <XCircle size={16} className="text-status-down" /> : <Undo2 size={16} />}{STATUS_LABEL[a.status]}</div>
            {a.decisions.map((d, i) => <div key={i} className="text-sm"><span className="font-medium">{d.by}</span> <span className="text-text-tertiary">({d.round} {d.round === "first" ? "decision" : "approval"}, {ago(d.at)})</span><div className="text-text-secondary mt-0.5">{d.reason || "No reason given."}</div></div>)}
          </div>
        )}
      </div>
      <div className="text-xs text-text-tertiary flex items-center gap-1.5"><FrameworkMark id={agent?.framework ?? ""} size={12} /> Run on {agent?.title}. <Link href={`/agents/traces?agent=${a.agentId}`} className="underline underline-offset-2">See its runs</Link></div>
    </div>
  );
}

function CheckRow({ c, onField }: { c: ClaimCheck; onField: (key: string) => void }) {
  const Icon = c.result === "pass" ? CheckCircle2 : c.result === "warn" ? AlertTriangle : XCircle;
  const tone = c.result === "pass" ? "text-status-healthy" : c.result === "warn" ? "text-status-degraded" : "text-status-down";
  return (
    <li className={clsx("rounded-lg border p-3.5", c.result === "fail" ? "border-status-down/40 bg-status-down/5" : "border-border bg-surface")}>
      <div className="flex items-start gap-2.5">
        <Icon size={16} className={clsx("mt-0.5 shrink-0", tone)} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{c.label}</div>
          <p className="text-[13px] text-text-secondary mt-0.5">{c.detail}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
            {c.fields.slice(0, 2).map((k) => <button key={k} onClick={() => onField(k)} className="text-[11px] text-text-secondary underline underline-offset-2 hover:text-text-primary">Show on the page</button>)}
            {c.cite && <span className="text-[11px] text-text-tertiary">{c.cite.source}, {c.cite.heading}, page {c.cite.page}</span>}
          </div>
          {c.cite && <blockquote className="mt-2 border-l-2 border-border-strong pl-2.5 text-[12px] text-text-secondary italic">{c.cite.quote}</blockquote>}
        </div>
      </div>
    </li>
  );
}
