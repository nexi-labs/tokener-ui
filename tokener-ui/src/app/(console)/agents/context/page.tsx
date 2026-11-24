"use client";

import clsx from "clsx";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Boxes, Database, FileText, HardDrive, Plus, Trash2, Zap } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select, Toggle } from "@/components/ui/Form";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { useOrgDirectory } from "@/lib/org/useOrgDirectory";
import { Confirm, Kpi, Modal, Notice, Tabs } from "@/components/mlops/ui";
import { FrameworkMark } from "@/components/agents/bits";
import { useHub } from "@/lib/agents/hub";
import { contexts, useAgents } from "@/lib/agents/store";
import { SCOPES, TIERS, defaultSpace, planWrite, sampleItems, validateSpace, type Access, type PayloadKind, type Scope, type Space, type Tier } from "@/lib/agents/context";
import { ago, int } from "@/lib/agents/format";
import { toast } from "@/lib/mlops/toast";

type Tab = "items" | "members" | "tiers" | "plan";
const TIER_ICON: Record<Tier, React.ElementType> = { hot: Zap, warm: Database, blob: HardDrive };
const TIER_TONE: Record<Tier, string> = { hot: "bg-[#FEF3C7] text-[#7A4B00]", warm: "bg-[#DBEAFE] text-[#1E40AF]", blob: "bg-[#E7E5E4] text-[#44403C]" };
const kb = (b: number) => (b >= 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : b >= 1024 ? `${(b / 1024).toFixed(b < 10_240 ? 1 : 0)} KB` : `${b} B`);
const num = (v: string, d = 0) => (Number.isFinite(Number(v)) && v !== "" ? Number(v) : d);

export default function ContextPage() {
  const store = useAgents(); const { agents, spaces } = store; const hub = useHub();
  const [id, setId] = useState(spaces[0]?.id ?? ""); const [tab, setTab] = useState<Tab>("items");
  const [create, setCreate] = useState(false); const [del, setDel] = useState(false);
  const space = spaces.find((s) => s.id === id) ?? spaces[0];
  const byId = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const allItems = useMemo(() => spaces.flatMap((s) => sampleItems(s)), [spaces]);
  const sharing = new Set(spaces.flatMap((s) => s.members.map((m) => m.agentId))).size;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-xl font-semibold tracking-tight">Context</h1><p className="text-sm text-text-secondary mt-1 max-w-2xl">Shared memory for agents that work on the same case. A space keeps its state in a fast cache, records it in a durable store, and keeps large files in object storage so agents pass a reference and not the file.</p></div>
        <Button variant="primary" onClick={() => setCreate(true)}><Plus size={14} /> New space</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Spaces" value={spaces.length} /><Kpi label="Agents sharing context" value={sharing} />
        <Kpi label="Hot cache budget" value={`${int(spaces.filter((s) => s.hot.enabled).reduce((n, s) => n + s.hot.maxMb, 0))} MB`} sub="Across spaces, evicted or expired" /><Kpi label="Claim-checked payloads" value={allItems.filter((i) => i.placement.claimCheck).length} sub="Files passed by reference" />
      </div>

      <Card><CardHeader title="How context moves" subtitle="Every read and write passes the context gateway, where access, masking, versions and limits apply." />
        <CardBody>
          <div className="grid lg:grid-cols-[0.75fr_auto_1.6fr] gap-4 items-stretch">
            <div className="rounded-lg border border-border p-4"><div className="text-sm font-semibold">Agents</div><p className="text-xs text-text-secondary mt-1 leading-snug">Any framework. They call <code className="text-[11px] bg-surface-muted rounded px-1">context.get</code>, <code className="text-[11px] bg-surface-muted rounded px-1">context.put</code> and <code className="text-[11px] bg-surface-muted rounded px-1">context.share</code> through the gateway, the same way on every framework.</p>
              <div className="mt-3 flex flex-wrap gap-1.5">{(space?.members ?? []).map((m) => <span key={m.agentId} className="text-[11px] rounded-full border border-border px-2 py-0.5">{byId.get(m.agentId)?.title ?? m.agentId}{m.access === "read" ? ", reads" : ""}</span>)}</div></div>
            <div className="hidden lg:flex flex-col items-center justify-center gap-1 text-[11px] text-text-tertiary"><ArrowRight size={18} /><span>checked</span></div>
            <div className="grid sm:grid-cols-3 gap-3">
              {TIERS.map((t) => { const I = TIER_ICON[t.id]; return <div key={t.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2"><span className={clsx("h-7 w-7 rounded-md grid place-items-center", TIER_TONE[t.id])}><I size={15} /></span><span className="text-sm font-semibold">{t.label}</span></div>
                <div className="text-[11px] text-text-tertiary mt-2">{t.store}</div><p className="text-xs text-text-secondary mt-1.5 leading-snug">{t.role}</p>
                <dl className="mt-2 text-[11px] text-text-tertiary space-y-0.5"><div className="flex justify-between"><dt>Latency</dt><dd>{t.latency}</dd></div><div className="flex justify-between"><dt>Survives restart</dt><dd>{t.durable ? "Yes" : "No, expires"}</dd></div><div className="flex justify-between"><dt>Largest</dt><dd>{t.max}</dd></div></dl></div>; })}
            </div>
          </div>
          <p className="text-xs text-text-tertiary mt-3">Reads try hot, then warm. A payload over a space's claim-check threshold is stored once in the blob tier, and a reference of about 90 bytes travels in its place. Nothing here holds a secret: connections are chosen from Integrations.</p>
        </CardBody></Card>

      <div className="grid lg:grid-cols-[300px_1fr] gap-5 items-start">
        <div className="space-y-2" role="listbox" aria-label="Spaces">
          {spaces.map((s) => { const on = s.id === space?.id; return (
            <button key={s.id} role="option" aria-selected={on} onClick={() => { setId(s.id); setTab("items"); }} className={clsx("w-full text-left rounded-lg border p-3 transition-colors", on ? "border-[#07191E] ring-1 ring-[#07191E] bg-surface" : "border-border bg-surface hover:bg-surface-subtle")}>
              <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold truncate">{s.name}</span><span className="text-[11px] text-text-tertiary shrink-0">{SCOPES.find((x) => x.id === s.scope)?.label}</span></div>
              <p className="text-xs text-text-secondary mt-1 line-clamp-2">{s.purpose || "No purpose written yet."}</p>
              <div className="flex items-center gap-1.5 mt-2.5">{(["hot", "warm", "blob"] as Tier[]).map((t) => <span key={t} className={clsx("text-[10.5px] font-medium rounded px-1.5 py-0.5", s[t].enabled ? TIER_TONE[t] : "bg-surface-muted text-text-tertiary line-through")}>{t}</span>)}<span className="ml-auto text-[11px] text-text-tertiary">{s.members.length} {s.members.length === 1 ? "agent" : "agents"}</span></div>
            </button>); })}
          {spaces.length === 0 && <p className="text-sm text-text-tertiary rounded-lg border border-dashed border-border p-5">No spaces yet. Create one so agents on the same case can share what they know.</p>}
        </div>

        {space && <SpacePanel key={space.id} space={space} tab={tab} setTab={setTab} onDelete={() => setDel(true)} byId={byId} />}
      </div>

      <NewSpace open={create} onClose={() => setCreate(false)} onCreated={(s) => { setId(s); setTab("members"); }} />
      <Confirm open={del} onClose={() => setDel(false)} title={`Delete ${space?.name}?`} confirmLabel="Delete space" danger phrase={space?.id} body={<p>The space and its hot items stop being readable now. Items in the warm and blob tiers are removed by the retention job within a day.</p>}
        onConfirm={() => { const r = contexts.remove(space!.id); setDel(false); if (r.ok) { toast("Space deleted", "info"); setId(""); } else toast(r.error, "error"); }} />
    </div>
  );
}

function SpacePanel({ space, tab, setTab, onDelete, byId }: { space: Space; tab: Tab; setTab: (t: Tab) => void; onDelete: () => void; byId: Map<string, ReturnType<typeof useAgents>["agents"][number]> }) {
  const { dir } = useOrgDirectory();
  const { agents } = useAgents(); const hub = useHub();
  const [draft, setDraft] = useState<Space>(space);
  const dirty = JSON.stringify(draft) !== JSON.stringify(space);
  const issues = useMemo(() => validateSpace(draft, agents, hub), [draft, agents, hub]);
  const errors = issues.filter((i) => i.level === "error");
  const items = useMemo(() => sampleItems(draft), [draft]);
  const set = (p: Partial<Space>) => setDraft((d) => ({ ...d, ...p }));
  const save = () => { const r = contexts.save(draft, hub); if (!r.ok) toast(r.error, "error"); else toast("Space saved", "success"); };
  const conns = (ids: string[]) => hub.connections.filter((c) => ids.includes(c.integrationId));
  const free = agents.filter((a) => a.state !== "retired" && !draft.members.some((m) => m.agentId === a.id));
  const [pick, setPick] = useState("");
  const tabs: { id: Tab; label: string; count?: number }[] = [{ id: "items", label: "Items", count: items.length }, { id: "members", label: "Members", count: draft.members.length }, { id: "tiers", label: "Tiers and rules" }, { id: "plan", label: "Plan a write" }];

  return (
    <div className="space-y-4 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="text-lg font-semibold truncate">{draft.name}</h2><p className="text-xs text-text-tertiary font-mono mt-0.5">ctx://{draft.id}</p></div>
        <Button variant="ghost" onClick={onDelete}><Trash2 size={14} /> Delete</Button></div>
      <Tabs<Tab> label="Space sections" value={tab} onChange={setTab} tabs={tabs} />

      {tab === "items" && <Card>{items.length === 0 ? <CardBody><p className="text-sm text-text-tertiary">Nothing stored yet.</p></CardBody> : <Table><Thead><tr><Th>Key</Th><Th>Kind</Th><Th className="text-right">Size</Th><Th>Stored in</Th><Th>Written by</Th><Th>Version</Th><Th>When</Th></tr></Thead>
        <tbody>{items.map((i) => { const a = byId.get(i.by); return <Tr key={i.key}><Td className="min-w-[230px]"><div className="font-mono text-xs break-all">{i.key}</div><div className="text-[11px] text-text-tertiary">{i.note}</div></Td><Td className="text-[13px]">{i.kind === "document" ? <span className="inline-flex items-center gap-1"><FileText size={12} /> Document</span> : i.kind === "state" ? "State" : "Message"}</Td><Td className="text-right tabular-nums text-[13px] whitespace-nowrap">{kb(i.bytes)}</Td>
          <Td><div className="flex flex-wrap gap-1"><span className={clsx("text-[10.5px] font-medium rounded px-1.5 py-0.5", TIER_TONE[i.placement.tier])}>{i.placement.tier}</span>{i.placement.also.map((t) => <span key={t} className={clsx("text-[10.5px] font-medium rounded px-1.5 py-0.5 opacity-70", TIER_TONE[t])}>{t}</span>)}</div>{i.placement.ref && <div className="text-[10.5px] font-mono text-text-tertiary mt-1" title="The claim check that agents pass in place of the file">{i.placement.ref.slice(0, 30)}…</div>}</Td>
          <Td className="text-[13px]">{a ? <span className="inline-flex items-center gap-1.5"><FrameworkMark id={a.framework} size={14} />{a.title}</span> : i.by}</Td><Td className="text-xs tabular-nums">v{i.version}</Td><Td className="text-xs text-text-secondary whitespace-nowrap">{ago(i.at)}</Td></Tr>; })}</tbody></Table>}
        <p className="px-5 py-3 text-[11px] text-text-tertiary border-t border-border">Sample items. A claim-checked file is stored once in the blob tier. Agents that read the key get the reference and fetch the file only when they need it.</p></Card>}

      {tab === "members" && <Card><CardHeader title="Which agents can use this space" subtitle="Readers can get. Writers can also put and share. Context never crosses projects." />
        <ul className="divide-y divide-border">{draft.members.map((m) => { const a = byId.get(m.agentId); return <li key={m.agentId} className="flex items-center gap-3 px-5 py-3">{a && <FrameworkMark id={a.framework} size={18} />}<div className="min-w-0 flex-1"><Link href={`/agents/registry/${m.agentId}`} className="text-sm font-medium hover:underline">{a?.title ?? m.agentId}</Link><div className="text-xs text-text-tertiary">{a?.department}{a?.project ? `, project ${a.project}` : ""}</div></div>
          <div className="w-32"><Select aria-label={`Access for ${a?.title}`} value={m.access} onChange={(e) => set({ members: draft.members.map((x) => (x.agentId === m.agentId ? { ...x, access: e.target.value as Access } : x)) })}><option value="write">Read and write</option><option value="read">Read only</option></Select></div>
          <button type="button" aria-label={`Remove ${a?.title}`} onClick={() => set({ members: draft.members.filter((x) => x.agentId !== m.agentId) })} className="h-8 w-8 grid place-items-center rounded-md text-text-tertiary hover:bg-surface-muted"><Trash2 size={14} /></button></li>; })}
          {draft.members.length === 0 && <li className="px-5 py-4 text-sm text-text-tertiary">No agents yet.</li>}</ul>
        <div className="flex items-end gap-2 px-5 py-4 border-t border-border"><div className="flex-1 max-w-sm"><Field label="Add an agent"><Select value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Choose an agent</option>{free.map((a) => <option key={a.id} value={a.id}>{a.title}, {a.department}</option>)}</Select></Field></div>
          <Button disabled={!pick} onClick={() => { set({ members: [...draft.members, { agentId: pick, access: "read" }] }); setPick(""); }}><Plus size={14} /> Add as reader</Button></div></Card>}

      {tab === "tiers" && <div className="space-y-4">
        <Card><CardHeader title="About the space" /><CardBody className="grid sm:grid-cols-2 gap-4">
          <Field label="Name"><Input value={draft.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Scope" hint={SCOPES.find((s) => s.id === draft.scope)?.help}><Select value={draft.scope} onChange={(e) => set({ scope: e.target.value as Scope })}>{SCOPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select></Field>
          <Field label="Project" hint="Projects come from Tenant Management. Only agents of this project can join, because context never crosses projects."><Select aria-label="Project" value={draft.project ?? ""} onChange={(e) => set({ project: e.target.value || undefined })}><option value="">Not tied to a project</option>{draft.project && !dir.projects.some((p) => p.name === draft.project) && <option value={draft.project}>{draft.project}</option>}{dir.projects.map((p) => <option key={p.id} value={p.name}>{p.name}, {p.departmentName}</option>)}</Select></Field>
          <div className="sm:col-span-2"><Field label="What it is for"><Input value={draft.purpose} onChange={(e) => set({ purpose: e.target.value })} /></Field></div>
          <Field label="When two agents write the same key" hint={draft.consistency === "versioned" ? "A write must name the version it read. A stale write is refused, so nothing is lost silently." : "The last write wins. Simple, and fine when only one agent writes a key."}><Select value={draft.consistency} onChange={(e) => set({ consistency: e.target.value as "versioned" })}><option value="versioned">Refuse a stale write (versioned)</option><option value="last-write-wins">Last write wins</option></Select></Field>
          <div className="self-end"><Toggle checked={draft.maskPersonalData} onChange={(v) => set({ maskPersonalData: v })} label="Mask personal data before it is stored" description="Names, emails and account numbers are replaced with tokens." /></div></CardBody></Card>

        <Card><CardHeader title="Hot tier" subtitle="Fast and temporary." action={<Toggle checked={draft.hot.enabled} onChange={(v) => set({ hot: { ...draft.hot, enabled: v } })} label="On" />} />
          {draft.hot.enabled && <CardBody className="grid sm:grid-cols-3 gap-4">
            <Field label="Kept in"><Select value={draft.hot.backend} onChange={(e) => set({ hot: { ...draft.hot, backend: e.target.value as "managed", connection: undefined } })}><option value="managed">tok∑ner managed cache</option><option value="redis">Redis, from Integrations</option></Select></Field>
            {draft.hot.backend === "redis" && <Field label="Redis connection"><Select value={draft.hot.connection ?? ""} onChange={(e) => set({ hot: { ...draft.hot, connection: e.target.value || undefined } })}><option value="">Choose one</option>{conns(["redis"]).map((c) => <option key={c.id} value={c.id}>{c.name}, {c.env}</option>)}</Select></Field>}
            <Field label="Expires after, seconds" hint="Every hot item expires."><Input type="number" min={10} value={draft.hot.ttlSec} onChange={(e) => set({ hot: { ...draft.hot, ttlSec: num(e.target.value) } })} /></Field>
            <Field label="Size limit, MB"><Input type="number" min={1} value={draft.hot.maxMb} onChange={(e) => set({ hot: { ...draft.hot, maxMb: num(e.target.value) } })} /></Field>
            <Field label="When it is full"><Select value={draft.hot.eviction} onChange={(e) => set({ hot: { ...draft.hot, eviction: e.target.value as "lru" } })}><option value="lru">Drop the least recently used</option><option value="ttl">Drop the soonest to expire</option><option value="reject">Refuse new writes</option></Select></Field></CardBody>}</Card>

        <Card><CardHeader title="Warm tier" subtitle="Durable. The record of the space." action={<Toggle checked={draft.warm.enabled} onChange={(v) => set({ warm: { ...draft.warm, enabled: v } })} label="On" />} />
          {draft.warm.enabled && <CardBody className="grid sm:grid-cols-3 gap-4">
            <Field label="Kept in"><Select value={draft.warm.backend} onChange={(e) => set({ warm: { ...draft.warm, backend: e.target.value as "managed", connection: undefined } })}><option value="managed">tok∑ner managed store</option><option value="pgvector">PostgreSQL, from Integrations</option></Select></Field>
            {draft.warm.backend === "pgvector" && <Field label="PostgreSQL connection"><Select value={draft.warm.connection ?? ""} onChange={(e) => set({ warm: { ...draft.warm, connection: e.target.value || undefined } })}><option value="">Choose one</option>{conns(["pgvector", "postgres"]).map((c) => <option key={c.id} value={c.id}>{c.name}, {c.env}</option>)}</Select></Field>}
            <Field label="Keep for, days" hint="Leave empty to keep until the space is deleted."><Input type="number" min={1} value={draft.warm.retentionDays ?? ""} onChange={(e) => set({ warm: { ...draft.warm, retentionDays: e.target.value === "" ? null : num(e.target.value, 1) } })} /></Field></CardBody>}</Card>

        <Card><CardHeader title="Blob tier" subtitle="Large files, passed by reference." action={<Toggle checked={draft.blob.enabled} onChange={(v) => set({ blob: { ...draft.blob, enabled: v } })} label="On" />} />
          {draft.blob.enabled && <CardBody className="grid sm:grid-cols-3 gap-4">
            <Field label="Object storage connection" hint="Needs write access."><Select value={draft.blob.connection ?? ""} onChange={(e) => set({ blob: { ...draft.blob, connection: e.target.value || undefined } })}><option value="">Choose one</option>{conns(["s3"]).map((c) => <option key={c.id} value={c.id}>{c.name}, {c.permissions}</option>)}</Select></Field>
            <Field label="Pass by reference above, KB" hint="Smaller payloads travel inline."><Input type="number" min={4} value={draft.blob.claimCheckAboveKb} onChange={(e) => set({ blob: { ...draft.blob, claimCheckAboveKb: num(e.target.value) } })} /></Field>
            <Field label="Keep files for, days"><Input type="number" min={1} value={draft.blob.retentionDays ?? ""} onChange={(e) => set({ blob: { ...draft.blob, retentionDays: e.target.value === "" ? null : num(e.target.value, 1) } })} /></Field></CardBody>}</Card>
      </div>}

      {tab === "plan" && <Planner space={draft} />}

      {issues.length > 0 && <Notice tone={errors.length ? "bad" : "warn"} title={errors.length ? "Fix these before saving" : "Worth a look"}><ul className="space-y-1">{issues.map((i, k) => <li key={k}>{i.message}</li>)}</ul></Notice>}
      <div className="flex items-center justify-end gap-2 sticky bottom-0 bg-surface-subtle/90 backdrop-blur border-t border-border py-3"><span className="text-xs text-text-tertiary mr-auto">{dirty ? "Unsaved changes" : "Saved"}</span>
        <Button disabled={!dirty} onClick={() => setDraft(space)}>Discard</Button><Button variant="primary" disabled={!dirty || errors.length > 0} onClick={save}>Save space</Button></div>
    </div>
  );
}

const SAMPLES: { label: string; bytes: number; kind: PayloadKind }[] = [{ label: "A status flag", bytes: 300, kind: "state" }, { label: "Extracted values", bytes: 18 * 1024, kind: "state" }, { label: "A hand-off note", bytes: 1200, kind: "message" }, { label: "A claim pack PDF", bytes: 2_480_000, kind: "document" }, { label: "A large state dump", bytes: 900 * 1024, kind: "state" }];

function Planner({ space }: { space: Space }) {
  const [bytes, setBytes] = useState(18 * 1024); const [kind, setKind] = useState<PayloadKind>("state"); const [again, setAgain] = useState(true);
  const p = planWrite(space, { bytes, kind, readAgain: again });
  return (
    <Card><CardHeader title="Plan a write" subtitle="See where a payload would be stored under this space's rules, before an agent sends it." />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap gap-2">{SAMPLES.map((s) => <button key={s.label} type="button" onClick={() => { setBytes(s.bytes); setKind(s.kind); }} className="h-8 rounded-full border border-border-strong px-3 text-[13px] hover:bg-surface-muted">{s.label}</button>)}</div>
        <div className="grid sm:grid-cols-3 gap-4"><Field label="Size, KB"><Input type="number" min={0} value={Math.round((bytes / 1024) * 10) / 10} onChange={(e) => setBytes(Math.round(num(e.target.value) * 1024))} /></Field>
          <Field label="Kind"><Select value={kind} onChange={(e) => setKind(e.target.value as PayloadKind)}><option value="state">State, read by several agents</option><option value="message">Message to the next agent</option><option value="document">Document or file</option></Select></Field>
          <div className="self-end"><Toggle checked={again} onChange={setAgain} label="Read again soon" /></div></div>
        {p.error ? <Notice tone="bad" title="This write is refused">{p.error}</Notice> : <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">Stored in</span><span className={clsx("text-xs font-medium rounded px-2 py-0.5", TIER_TONE[p.tier])}>{p.tier}</span>{p.also.map((t) => <span key={t} className={clsx("text-xs font-medium rounded px-2 py-0.5 opacity-75", TIER_TONE[t])}>and {t}</span>)}{p.claimCheck && <Badge tone="info">Claim check</Badge>}</div>
          <p className="text-sm text-text-secondary">{p.reason}</p>
          {p.ref && <div><div className="text-[11px] text-text-tertiary mb-1">What travels between agents</div><code className="block text-xs bg-surface-muted rounded px-3 py-2 break-all">{`{ "ctx": "${p.ref}", "bytes": ${bytes}, "type": "application/pdf" }`}</code></div>}
        </div>}
      </CardBody></Card>
  );
}

function NewSpace({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { spaces } = useAgents(); const hub = useHub();
  const [name, setName] = useState(""); const [scope, setScope] = useState<Scope>("case"); const [project, setProject] = useState(""); const { dir } = useOrgDirectory();
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  const taken = spaces.some((s) => s.id === id);
  const make = () => { const s = { ...defaultSpace(id, name.trim()), scope, project: project || undefined }; const r = contexts.save(s, hub); if (!r.ok) return toast(r.error, "error"); toast("Space created", "success"); onCreated(id); setName(""); onClose(); };
  return <Modal open={open} onClose={onClose} title="New context space" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!name.trim() || id.length < 2 || taken} onClick={make}>Create space</Button></>}>
    <div className="space-y-4"><Field label="Name"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Claims case file" /></Field>
      <p className="text-xs text-text-tertiary -mt-2">{id ? <>Address: <code>ctx://{id}</code>{taken && <span className="text-status-down"> is already used.</span>}</> : "The address is made from the name."}</p>
      <Field label="Scope" hint={SCOPES.find((s) => s.id === scope)?.help}><Select value={scope} onChange={(e) => setScope(e.target.value as Scope)}>{SCOPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select></Field>
      <Field label="Project" hint="Only agents of this project can join the space."><Select aria-label="Project" value={project} onChange={(e) => setProject(e.target.value)}><option value="">Not tied to a project</option>{dir.projects.map((p) => <option key={p.id} value={p.name}>{p.name}, {p.departmentName}</option>)}</Select></Field>
      <p className="text-xs text-text-tertiary">It starts with a managed hot cache and a managed durable store. Add members, a Redis connection or object storage afterwards.</p></div></Modal>;
}
