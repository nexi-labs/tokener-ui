"use client";

import { useCallback, useEffect, useState } from "react";
import { Mail, MessagesSquare, Plus, Send, Webhook, Smartphone, Bell } from "lucide-react";
import { siSlack, siDiscord } from "simple-icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { EmptyState } from "@/components/ui/EmptyState";
import { SimpleIcon } from "@/components/icons/SimpleIcon";
import { Confirm, Loading, Modal, Notice, Toaster, relTime, fmtDate } from "@/components/mlops/ui";
import { toast } from "@/lib/mlops/toast";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useIamAdmin } from "@/lib/iam/useIamAdmin";
import { liveNotifications, sampleNotifications, TRIGGERS, type Channel, type ChannelType, type CreatableType, type Delivery, type Rule } from "@/lib/notifications/client";
import { liveTenants, sampleTenantAdmin, type TenantSummary } from "@/lib/tenants/admin";

const msg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const TYPE_LABEL: Record<ChannelType, string> = { EMAIL: "Email", SMS: "SMS", SLACK: "Slack", TEAMS: "Microsoft Teams", DISCORD: "Discord", WEBHOOK: "Webhook" };
const STATUS_TONE = { SENT: "healthy", PENDING: "info", RETRYING: "degraded", FAILED: "down" } as const;

function ChannelIcon({ type }: { type: ChannelType }) {
  if (type === "SLACK") return <SimpleIcon icon={siSlack} size={17} monochrome={false} />;
  if (type === "DISCORD") return <SimpleIcon icon={siDiscord} size={17} monochrome={false} />;
  // Microsoft has no entry in simple-icons, so a generic line icon stands in rather than a lookalike logo.
  const I = type === "EMAIL" ? Mail : type === "TEAMS" ? MessagesSquare : type === "SMS" ? Smartphone : Webhook;
  return <I size={17} className="text-text-secondary" />;
}

export default function NotificationsPage() {
  const { orgId, sample } = useIamAdmin();
  const { status } = useAuth();
  const api = sample ? sampleNotifications : liveNotifications;
  const tenantApi = sample ? sampleTenantAdmin : liveTenants;
  const [tenants, setTenants] = useState<TenantSummary[] | null>(null);
  const [tenantId, setTenantId] = useState("");
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [history, setHistory] = useState<Delivery[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [modal, setModal] = useState<"channel" | "rule" | null>(null);
  const [testing, setTesting] = useState<Channel | null>(null);
  const [off, setOff] = useState<Channel | null>(null);

  useEffect(() => {
    if (status !== "session" && status !== "demo") return;
    if (!orgId) { setTenants([]); return; }
    let live = true;
    tenantApi.list(orgId).then((t) => { if (live) { setTenants(t); setTenantId((c) => c || t[0]?.id || ""); } })
      .catch((e) => { if (live) { setProblem(msg(e, "Tenants could not be loaded.")); setTenants([]); } });
    return () => { live = false; };
  }, [tenantApi, orgId, status]);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setProblem(null);
    try {
      const [c, r, h] = await Promise.all([api.channels(tenantId), api.rules(tenantId), api.history(tenantId, 50)]);
      setChannels(c); setRules(r); setHistory(h);
    } catch (e) {
      setProblem(e instanceof ApiError && e.status === 403 ? "Your role does not allow reading notifications for this tenant." : msg(e, "Notifications could not be loaded."));
      setChannels((c) => c ?? []);
    }
  }, [api, tenantId]);
  useEffect(() => { setChannels(null); void load(); }, [load]);

  const disable = async () => {
    if (!off) return;
    try { await api.disableChannel(off.id); toast("Channel disabled", "success"); setOff(null); await load(); }
    catch (e) { toast(msg(e, "The channel could not be disabled."), "error"); setOff(null); }
  };

  if (status === "loading") return <Loading />;
  const header = (
    <PageHeader
      title="Notification Center"
      description="Where platform events are delivered: channels, the rules that route events to them, and what was sent."
      action={<Button variant="primary" onClick={() => setModal("channel")} disabled={!tenantId}><Plus size={15} /> Add channel</Button>}
    />
  );
  if (!orgId) return <>{header}<Notice tone="info" title="No organization selected">This account is not part of an organization, so there are no notifications to manage here.</Notice></>;
  const chName = (id: string) => channels?.find((c) => c.id === id)?.name ?? id.slice(0, 8);

  return (
    <>
      {header}
      <Toaster />
      {sample && <div className="mb-4"><Notice tone="info" title="Sample notifications">These are sample channels, rules and deliveries. Nothing here belongs to a real organization.</Notice></div>}
      {problem && <div className="mb-4"><Notice tone="bad" title="Could not load">{problem}</Notice></div>}
      <div className="mb-4"><Notice tone="info" title="How channel addresses are kept">A webhook address is a credential, since it carries its own token. It is stored in the platform's secret manager, the channel keeps only a reference, and the address is never shown again after you add it. If no secret manager is configured, email channels still work and the other types cannot be added. SMS channels are not offered here.</Notice></div>
      <div className="mb-5 max-w-sm">
        <Field label="Tenant"><Select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>{(tenants ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
      </div>

      {channels === null ? <Loading /> : channels.length === 0 ? (
        <Card className="mb-5"><EmptyState icon={Bell} title="No channels in this tenant" description="Add a channel to receive platform events by email, Slack, Teams, Discord or webhook." /></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
          {channels.map((c) => (
            <Card key={c.id} className={`p-4 ${c.enabled ? "" : "opacity-70"}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-md bg-surface-muted flex items-center justify-center shrink-0"><ChannelIcon type={c.channel} /></div>
                  <div className="min-w-0"><div className="text-sm font-medium text-text-primary truncate">{c.name}</div><div className="text-xs text-text-tertiary">{TYPE_LABEL[c.channel]}</div></div>
                </div>
                <Badge tone={c.enabled ? "healthy" : "neutral"}>{c.enabled ? "Active" : "Disabled"}</Badge>
              </div>
              {c.enabled && (
                <div className="mt-3 flex gap-2">
                  <Button variant="secondary" onClick={() => setTesting(c)}><Send size={13} /> Send test</Button>
                  <Button variant="ghost" onClick={() => setOff(c)}>Disable</Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Card className="mb-5">
        <CardHeader title="Rule bindings" subtitle="An event of this type, when the condition holds, is sent to the channel." action={<Button variant="secondary" onClick={() => setModal("rule")} disabled={!channels?.some((c) => c.enabled)}><Plus size={14} /> Add rule</Button>} />
        {rules.length === 0 ? <EmptyState icon={Bell} title="No rules yet" description="Without a rule, no event is delivered. Add one to route budget breaches or provider changes to a channel." /> : (
          <div className="divide-y divide-border">
            {rules.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-mono text-text-primary">{r.triggerEventType}</span>
                  <span className="text-text-tertiary">when</span>
                  <span className="font-mono text-xs text-text-secondary">{r.conditionExpr || "always"}</span>
                </div>
                <span className="text-sm text-text-primary font-medium">to {chName(r.channelId)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Delivery history" subtitle="The 50 most recent deliveries, with attempts and the last error." />
        {history.length === 0 ? <EmptyState icon={Send} title="Nothing delivered yet" description="Deliveries appear here after a rule fires or a test is sent." /> : (
          <Table>
            <Thead><tr><Th>When</Th><Th>Subject</Th><Th>Channel</Th><Th>Status</Th><Th>Attempts</Th><Th>Last error</Th></tr></Thead>
            <tbody>
              {history.map((d) => (
                <Tr key={d.id}>
                  <Td className="text-text-secondary whitespace-nowrap"><span title={fmtDate(d.createdAt)}>{relTime(d.createdAt)}</span></Td>
                  <Td className="font-mono text-xs">{d.subject}</Td>
                  <Td>{chName(d.channelId)}</Td>
                  <Td><Badge tone={STATUS_TONE[d.status]}>{d.status.charAt(0) + d.status.slice(1).toLowerCase()}</Badge></Td>
                  <Td className="tabular-nums">{d.attempts}</Td>
                  <Td className="text-text-secondary text-xs max-w-[280px]"><span className="block truncate" title={d.lastError ?? ""}>{d.lastError ?? ""}</span></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {modal === "channel" && <ChannelModal api={api} tenantId={tenantId} onClose={() => setModal(null)} onDone={() => { setModal(null); toast("Channel added", "success"); void load(); }} />}
      {modal === "rule" && <RuleModal api={api} tenantId={tenantId} channels={(channels ?? []).filter((c) => c.enabled)} onClose={() => setModal(null)} onDone={() => { setModal(null); toast("Rule added", "success"); void load(); }} />}
      {testing && <TestModal api={api} tenantId={tenantId} channel={testing} onClose={() => setTesting(null)} onDone={() => { setTesting(null); toast("Test sent. Check delivery history for the result.", "success"); void load(); }} />}
      <Confirm open={!!off} onClose={() => setOff(null)} onConfirm={disable} danger title="Disable this channel?" confirmLabel="Disable channel"
        body={<>Rules that point at {off?.name} stop delivering. A disabled channel cannot be switched back on; add a new one instead.</>} />
    </>
  );
}

type Api = typeof sampleNotifications;

const TYPES: { value: CreatableType; label: string; field: string; placeholder: string; hint: string; secret: boolean }[] = [
  { value: "EMAIL", label: "Email", field: "Send to", placeholder: "finance@company.com", hint: "One address. Use a distribution list to reach several people.", secret: false },
  { value: "SLACK", label: "Slack", field: "Webhook address", placeholder: "https://hooks.slack.com/services/...", hint: "An incoming webhook for the channel to post in. It must be on hooks.slack.com.", secret: true },
  { value: "TEAMS", label: "Microsoft Teams", field: "Webhook address", placeholder: "https://...", hint: "The address of a Teams workflow or incoming webhook. It must be https and reachable from the internet.", secret: true },
  { value: "DISCORD", label: "Discord", field: "Webhook address", placeholder: "https://discord.com/api/webhooks/...", hint: "A channel webhook. It must be on discord.com under /api/webhooks/.", secret: true },
  { value: "WEBHOOK", label: "Webhook", field: "Webhook address", placeholder: "https://example.com/hooks/tokener", hint: "Receives a JSON body with a subject and a message. It must be https on the default port and reachable from the internet.", secret: true },
];

function ChannelModal({ api, tenantId, onClose, onDone }: { api: Api; tenantId: string; onClose: () => void; onDone: () => void }) {
  const [type, setType] = useState<CreatableType>("EMAIL"); const [name, setName] = useState(""); const [target, setTarget] = useState("");
  const [problem, setProblem] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const t = TYPES.find((x) => x.value === type)!;
  const valid = name.trim().length > 0 && target.trim().length > 0;
  const go = async () => { setBusy(true); setProblem(null); try { await api.createChannel(tenantId, type, name.trim(), target.trim()); onDone(); } catch (e) { setProblem(msg(e, "The channel could not be added.")); setBusy(false); } };
  return (
    <Modal open onClose={onClose} title="Add channel" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={go} disabled={!valid || busy}>{busy ? "Adding" : "Add channel"}</Button></>}>
      <div className="flex flex-col gap-4">
        {problem && <Notice tone="bad" title="Could not continue">{problem}</Notice>}
        <Field label="Type"><Select value={type} onChange={(e) => { setType(e.target.value as CreatableType); setTarget(""); }}>{TYPES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</Select></Field>
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={type === "EMAIL" ? "Finance team" : "#platform-alerts"} /></Field>
        <Field label={t.field} hint={t.hint + (t.secret ? " It is stored in the secret manager and cannot be read back." : "")}>
          <Input type={t.secret ? "password" : "email"} autoComplete="off" value={target} onChange={(e) => setTarget(e.target.value)} placeholder={t.placeholder} />
        </Field>
      </div>
    </Modal>
  );
}

function RuleModal({ api, tenantId, channels, onClose, onDone }: { api: Api; tenantId: string; channels: Channel[]; onClose: () => void; onDone: () => void }) {
  const [trigger, setTrigger] = useState(TRIGGERS[0].value); const [cond, setCond] = useState(""); const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [problem, setProblem] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const condOk = !cond.trim() || /^[^=\s][^=]*=.+$/.test(cond.trim());
  const go = async () => { setBusy(true); setProblem(null); try { await api.createRule(tenantId, trigger, cond, channelId); onDone(); } catch (e) { setProblem(msg(e, "The rule could not be added.")); setBusy(false); } };
  return (
    <Modal open onClose={onClose} title="Add rule" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={go} disabled={!channelId || !condOk || busy}>{busy ? "Adding" : "Add rule"}</Button></>}>
      <div className="flex flex-col gap-4">
        {problem && <Notice tone="bad" title="Could not continue">{problem}</Notice>}
        <Field label="Event"><Select value={trigger} onChange={(e) => setTrigger(e.target.value)}>{TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label} ({t.value})</option>)}</Select></Field>
        <Field label="Condition (optional)" hint={condOk ? "One field and a value, for example action=BLOCK. Leave empty to match every event of this type. A rule cannot be removed once added." : "Use field=value, for example action=BLOCK."}><Input value={cond} onChange={(e) => setCond(e.target.value)} placeholder="action=BLOCK" /></Field>
        <Field label="Send to"><Select value={channelId} onChange={(e) => setChannelId(e.target.value)}>{channels.map((c) => <option key={c.id} value={c.id}>{c.name} ({TYPE_LABEL[c.channel]})</option>)}</Select></Field>
      </div>
    </Modal>
  );
}

function TestModal({ api, tenantId, channel, onClose, onDone }: { api: Api; tenantId: string; channel: Channel; onClose: () => void; onDone: () => void }) {
  const [subject, setSubject] = useState("Test message"); const [body, setBody] = useState("This is a test from the Notification Center.");
  const [problem, setProblem] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); setProblem(null); try { await api.send(tenantId, channel.id, subject.trim(), body.trim()); onDone(); } catch (e) { setProblem(msg(e, "The test could not be sent.")); setBusy(false); } };
  return (
    <Modal open onClose={onClose} title={`Send a test to ${channel.name}`} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={go} disabled={!subject.trim() || !body.trim() || busy}>{busy ? "Sending" : "Send test"}</Button></>}>
      <div className="flex flex-col gap-4">
        {problem && <Notice tone="bad" title="Could not continue">{problem}</Notice>}
        <Field label="Subject"><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field label="Message"><Input value={body} onChange={(e) => setBody(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
