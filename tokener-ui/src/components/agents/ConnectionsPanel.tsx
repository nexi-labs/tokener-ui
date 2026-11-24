"use client";

import clsx from "clsx";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Select } from "@/components/ui/Form";
import { Notice } from "@/components/mlops/ui";
import { ConnectorMark } from "@/components/agents/ConnectorMark";
import { NOTIFY_TOOLS, ROLE_LABEL, bindingsOf, mk, resolve, validateBindings, type Binding, type ResourceKind, type Role } from "@/lib/agents/connectors";
import { useHub } from "@/lib/agents/hub";
import { agents as actions } from "@/lib/agents/store";
import type { Agent } from "@/lib/agents/types";
import { toast } from "@/lib/mlops/toast";

const KINDS: { id: ResourceKind; label: string; help: string }[] = [
  { id: "connection", label: "A connection", help: "Email, SMS, a message app, storage or a database from Integrations." },
  { id: "channel", label: "A notification channel", help: "A Slack, Teams, email, Discord or webhook destination from the Notification Center." },
  { id: "knowledge", label: "A knowledge base", help: "Documents the agent retrieves from before it answers." },
];

/** What the agent is connected to in the organisation's hub. Nothing here is configured twice: a connection, channel or knowledge base is chosen from the screen that owns it. */
export function ConnectionsPanel({ a }: { a: Agent }) {
  const hub = useHub();
  const [declared, setDeclared] = useState<Binding[]>(a.bindings ?? []);
  const [kind, setKind] = useState<ResourceKind>("channel"); const [ref, setRef] = useState(""); const [role, setRole] = useState<Role>("notify"); const [tool, setTool] = useState("notify_channel");
  const lock = a.state === "retired";
  const dirty = JSON.stringify(declared) !== JSON.stringify(a.bindings ?? []);
  const draft = useMemo(() => ({ ...a, bindings: declared }), [a, declared]);
  const all = useMemo(() => bindingsOf(draft), [draft]);
  const issues = useMemo(() => validateBindings(draft, hub), [draft, hub]);
  const errors = issues.filter((i) => i.level === "error");

  const options = kind === "connection" ? hub.connections.map((c) => ({ id: c.id, label: `${c.name}, ${c.integrationName}, ${c.env}` })) : kind === "channel" ? hub.channels.filter((c) => c.enabled).map((c) => ({ id: c.id, label: c.name })) : hub.knowledge.map((k) => ({ id: k.id, label: k.name }));
  const roles: { role: Role; tool?: string; label: string }[] = kind === "knowledge" ? [{ role: "knowledge", label: "Retrieve from it" }]
    : kind === "channel" ? [{ role: "notify", tool: "notify_channel", label: "Post messages (notify_channel)" }, { role: "approval", tool: "request_approval", label: "Ask for decisions (request_approval)" }]
    : [{ role: "notify", tool: "send_email", label: "Send email (send_email)" }, { role: "notify", tool: "send_sms", label: "Send texts (send_sms)" }, { role: "notify", tool: "post_message", label: "Post as an app (post_message)" }, { role: "data", label: "Read and write data" }];
  const pickKind = (k: ResourceKind) => { setKind(k); setRef(""); const first = k === "knowledge" ? { role: "knowledge" as Role } : k === "channel" ? { role: "notify" as Role, tool: "notify_channel" } : { role: "notify" as Role, tool: "send_email" }; setRole(first.role); setTool(first.tool ?? ""); };
  const add = () => { if (!ref) return; const b = mk(kind, ref, role, role === "notify" || role === "approval" ? tool : undefined); if (declared.some((x) => x.id === b.id)) return toast("That is already connected", "info"); setDeclared([...declared, b]); setRef(""); };
  const save = () => { const r = actions.setBindings(a.id, declared, hub); if (!r.ok) toast(r.error, "error"); else toast("Connections saved", "success"); };

  return (
    <div className="space-y-5">
      <Notice tone="info" title="One hub, not a second copy">Connections come from Integrations, channels from the Notification Center and knowledge from Knowledge. Credentials stay in the secret store, and every call goes through the gateway, where policy, rate limits and audit apply.</Notice>
      <Card><CardHeader title="Connected now" subtitle="Some follow from how the agent starts and who decides. Change those in the Runtime tab." />
        {all.length === 0 ? <CardBody><p className="text-sm text-text-tertiary">This agent is not connected to anything yet.</p></CardBody> : <ul className="divide-y divide-border">
          {all.map((b) => { const r = resolve(b, hub, a); return (
            <li key={b.id} className="flex items-center gap-3 px-5 py-3">
              <ConnectorMark iconKey={r.iconKey} integrationId={r.integrationId} box={34} size={20} />
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Link href={r.href} className="text-sm font-medium hover:underline">{r.name}</Link><span className="text-xs text-text-tertiary">{r.subtitle}</span></div>
                <div className="text-xs text-text-secondary mt-0.5">{ROLE_LABEL[b.role]}{b.tool && b.tool !== "sink" ? `, ${b.tool}` : ""}{b.note ? `, ${b.note}` : ""}</div>
                {r.problem && <div className={clsx("text-xs mt-1", r.status === "problem" ? "text-status-down" : "text-[#8A5504]")}>{r.problem}</div>}</div>
              <Badge tone={r.status === "ready" ? "healthy" : r.status === "warning" ? "degraded" : "down"}>{r.status === "ready" ? "Ready" : r.status === "warning" ? "Check" : "Not working"}</Badge>
              {b.origin === "derived" ? <span className="text-[11px] text-text-tertiary w-24 text-right">From Runtime</span>
                : <button type="button" aria-label={`Remove ${r.name}`} disabled={lock} onClick={() => setDeclared(declared.filter((x) => x.id !== b.id))} className="h-8 w-24 inline-flex items-center justify-end gap-1.5 text-xs text-text-secondary hover:text-text-primary"><Trash2 size={13} /> Remove</button>}
            </li>); })}
        </ul>}</Card>

      <Card><CardHeader title="Add from the hub" />
        <CardBody className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-3" role="radiogroup" aria-label="What to connect">{KINDS.map((k) => <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} disabled={lock} onClick={() => pickKind(k.id)} className={clsx("text-left rounded-lg border p-3", kind === k.id ? "border-[#07191E] ring-1 ring-[#07191E] bg-surface-subtle" : "border-border hover:bg-surface-subtle")}><div className="text-sm font-semibold">{k.label}</div><div className="text-xs text-text-secondary mt-1 leading-snug">{k.help}</div></button>)}</div>
          <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <Field label={kind === "connection" ? "Connection" : kind === "channel" ? "Channel" : "Knowledge base"}><Select disabled={lock} value={ref} onChange={(e) => setRef(e.target.value)}><option value="">Choose one</option>{options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</Select></Field>
            <Field label="Use it to"><Select disabled={lock} value={`${role}|${tool}`} onChange={(e) => { const [r, t] = e.target.value.split("|"); setRole(r as Role); setTool(t); }}>{roles.map((r) => <option key={r.role + (r.tool ?? "")} value={`${r.role}|${r.tool ?? ""}`}>{r.label}</option>)}</Select></Field>
            <Button disabled={lock || !ref} onClick={add}><Plus size={14} /> Add</Button></div>
          <p className="text-xs text-text-tertiary">Missing one? Add it in {kind === "connection" ? <Link href="/mlops/integrations" className="underline">Integrations</Link> : kind === "channel" ? <Link href="/notifications" className="underline">the Notification Center</Link> : <Link href="/mlops/knowledge" className="underline">Knowledge</Link>}, then it appears here.</p>
        </CardBody></Card>

      <Card><CardHeader title="Notification tools" subtitle="The agent calls these through the gateway. A tool needs a destination above before it can send." />
        <ul className="divide-y divide-border">{NOTIFY_TOOLS.map((t) => { const granted = a.tools.some((g) => g.tool === t.name); const bound = all.filter((b) => b.tool === t.name); return (
          <li key={t.name} className="flex items-center gap-3 px-5 py-2.5"><code className="text-xs w-36 shrink-0">{t.name}</code><span className="text-xs text-text-secondary flex-1">{t.description}</span>
            {t.sensitive && <Badge tone="degraded">Sensitive</Badge>}<span className="text-[11px] text-text-tertiary w-28 text-right">{bound.length ? `${bound.length} ${bound.length === 1 ? "destination" : "destinations"}` : granted ? "No destination" : "Not used"}</span></li>); })}</ul></Card>

      {issues.length > 0 && <Notice tone={errors.length ? "bad" : "warn"} title={errors.length ? "Fix these before saving" : "Worth a look"}><ul className="space-y-1">{issues.map((i, k) => <li key={k}>{i.message}</li>)}</ul></Notice>}
      <div className="flex items-center justify-end gap-2 sticky bottom-0 bg-surface-subtle/90 backdrop-blur border-t border-border -mx-1 px-1 py-3"><span className="text-xs text-text-tertiary mr-auto">{dirty ? "Unsaved changes" : "Saved"}</span>
        <Button disabled={!dirty} onClick={() => setDeclared(a.bindings ?? [])}>Discard</Button><Button variant="primary" disabled={!dirty || lock || errors.length > 0} onClick={save}>Save connections</Button></div>
    </div>
  );
}
