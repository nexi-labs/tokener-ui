"use client";

import clsx from "clsx";
import { useState } from "react";
import { Check as Tick, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Kpi, Notice, Tabs } from "@/components/mlops/ui";
import { STATUS_LEGEND } from "@/lib/mlops/catalog";
import { CHECKS, decide, requiredChecks, useRequests, type Check, type Request } from "@/lib/platform/requests";
import { useIamAdmin } from "@/lib/iam/useIamAdmin";
import { ago } from "@/lib/agents/format";
import { toast } from "@/lib/mlops/toast";

type Tab = "open" | "decided";
const TONE = { pending: "degraded", "needs-info": "info", approved: "healthy", rejected: "down" } as const;
const LABEL = { pending: "Waiting", "needs-info": "Waiting for the organization", approved: "Approved", rejected: "Rejected" } as const;

/** Where platform admins decide requests from organizations to move a connector or an agent adapter to Beta or Available. */
export default function PlatformApprovalsPage() {
  const { requests } = useRequests(); const { isPlatform, sample } = useIamAdmin();
  const [tab, setTab] = useState<Tab>("open"); const [sel, setSel] = useState(requests.find((r) => r.status === "pending")?.id ?? requests[0]?.id);
  const open = requests.filter((r) => r.status === "pending" || r.status === "needs-info"); const done = requests.filter((r) => !open.includes(r));
  const list = tab === "open" ? open : done; const r = requests.find((x) => x.id === sel) ?? list[0];
  const allowed = isPlatform || sample;
  return (
    <div className="space-y-5">
      <PageHeader title="Catalogue requests" description="Organizations ask for a connector or agent adapter to be moved to Beta or Available so they can use it for real. Check it, then decide. An approval changes the catalogue for every organization at once." />
      {!allowed && <Notice tone="warn" title="Platform administrators only">You can read the requests, and deciding needs the platform operator role.</Notice>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><Kpi label="Waiting" value={open.filter((x) => x.status === "pending").length} /><Kpi label="Waiting for the organization" value={open.filter((x) => x.status === "needs-info").length} /><Kpi label="Approved" value={requests.filter((x) => x.status === "approved").length} /><Kpi label="Rejected" value={requests.filter((x) => x.status === "rejected").length} /></div>
      <Tabs<Tab> label="Request lists" value={tab} onChange={(t) => { setTab(t); setSel((t === "open" ? open : done)[0]?.id); }} tabs={[{ id: "open", label: "Open", count: open.length }, { id: "decided", label: "Decided", count: done.length }]} />
      {list.length === 0 ? <EmptyState icon={Inbox} title={tab === "open" ? "Nothing is waiting" : "Nothing decided yet"} description="Requests from organizations appear here." /> : (
        <div className="grid lg:grid-cols-[360px_1fr] gap-5 items-start">
          <Card><ul className="divide-y divide-border">{list.map((x) => <li key={x.id}><button onClick={() => setSel(x.id)} aria-current={r?.id === x.id} className={clsx("w-full text-left px-5 py-3.5 hover:bg-surface-subtle", r?.id === x.id && "bg-surface-subtle")}>
            <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{x.targetName}</span><Badge tone={TONE[x.status]}>{LABEL[x.status]}</Badge></div>
            <div className="text-xs text-text-tertiary mt-0.5">{x.kind === "connector" ? "Connector" : "Agent adapter"}, {x.org}, {ago(x.at)}</div></button></li>)}</ul></Card>
          {r && <Detail key={r.id + r.status} r={r} allowed={allowed} />}
        </div>
      )}
    </div>
  );
}

function Detail({ r, allowed }: { r: Request; allowed: boolean }) {
  const [checks, setChecks] = useState<Check[]>(r.checks); const [note, setNote] = useState(""); const [err, setErr] = useState("");
  const closed = r.status === "approved" || r.status === "rejected"; const by = "Daniel Reyes"; const need = requiredChecks(r.to);
  const act = (o: "approve" | "reject" | "needs-info") => { const x = decide(r.id, by, o, note, checks); if (!x.ok) return setErr(x.error); setErr(""); toast(o === "approve" ? `${r.targetName} moved to ${STATUS_LEGEND[r.to].label}` : o === "reject" ? "Request rejected" : "Question sent to the organization", "success"); };
  return (
    <Card><CardHeader title={r.targetName} subtitle={`${r.kind === "connector" ? "Connector" : "Agent adapter"}, requested by ${r.requestedBy} of ${r.org}, ${ago(r.at)}`} action={<Badge tone={TONE[r.status]}>{LABEL[r.status]}</Badge>} />
      <CardBody className="space-y-5">
        <div className="flex items-center gap-3 text-sm"><Badge tone={STATUS_LEGEND[r.from].tone}>{STATUS_LEGEND[r.from].label}</Badge><span aria-hidden className="text-text-tertiary">to</span><Badge tone={STATUS_LEGEND[r.to].tone}>{STATUS_LEGEND[r.to].label}</Badge></div>
        <div><div className="text-xs text-text-tertiary mb-1">Why they need it</div><p className="text-sm">{r.why}</p></div>
        {r.note && <Notice tone={r.status === "rejected" ? "bad" : "info"} title={`${r.decidedBy} wrote`}>{r.note}</Notice>}
        <div><div className="text-[13px] font-medium mb-1.5">Before you approve</div>
          <div className="rounded-md border border-border divide-y divide-border">{CHECKS.map((c) => { const on = checks.includes(c.id); const req = need.includes(c.id); return (
            <label key={c.id} className={clsx("flex items-start gap-3 px-4 py-3 text-sm", !closed && allowed && "cursor-pointer hover:bg-surface-subtle")}>
              <input type="checkbox" className="mt-1" checked={on} disabled={closed || !allowed} onChange={() => setChecks(on ? checks.filter((x) => x !== c.id) : [...checks, c.id])} />
              <span className="flex-1"><span className="font-medium">{c.label}</span>{!req && <span className="text-text-tertiary"> (not needed for {STATUS_LEGEND[r.to].label})</span>}<span className="block text-xs text-text-tertiary mt-0.5">{c.help}</span></span>{on && <Tick size={15} className="text-status-healthy mt-0.5" />}</label>); })}</div></div>
        {!closed && <>
          <Field label="Note to the organization" hint="Needed to reject or to ask a question."><Input aria-label="Note" disabled={!allowed} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Which AWS regions do you need?" /></Field>
          {err && <Notice tone="bad">{err}</Notice>}
          <div className="flex flex-wrap gap-2"><Button variant="primary" disabled={!allowed} onClick={() => act("approve")}>Approve for {STATUS_LEGEND[r.to].label}</Button><Button variant="secondary" disabled={!allowed} onClick={() => act("needs-info")}>Ask a question</Button><Button variant="secondary" disabled={!allowed} onClick={() => act("reject")}>Reject</Button></div></>}
        {closed && <p className="text-xs text-text-tertiary">Decided by {r.decidedBy}, {r.decidedAt && ago(r.decidedAt)}.</p>}
      </CardBody></Card>
  );
}
