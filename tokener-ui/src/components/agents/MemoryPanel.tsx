"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import { Pin, PinOff, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Form";
import { Notice } from "@/components/mlops/ui";
import { useHub } from "@/lib/agents/hub";
import { BACKENDS, BACKEND_BY_ID, EMBEDDING_MODELS, KIND_BY_ID, MEMORY_KINDS, MEMORY_TOOLS, SCOPES, defaultMemory, recall, validateMemory, type MemoryBackend, type MemoryConfig, type MemoryKind, type MemoryLayer, type MemoryToolId } from "@/lib/agents/memory";
import { memory as actions, useAgents } from "@/lib/agents/store";
import type { Agent } from "@/lib/agents/types";
import { ago } from "@/lib/agents/format";
import { toast } from "@/lib/mlops/toast";

function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} className={clsx("relative h-5 w-9 shrink-0 rounded-full transition-colors mt-0.5 disabled:opacity-50", checked ? "bg-accent-600" : "bg-border-strong")}>
      <span className={clsx("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", checked ? "left-[18px]" : "left-0.5")} />
    </button>
  );
}

const INTEGRATION_OF: Partial<Record<MemoryBackend, string>> = { pgvector: "pgvector", redis: "redis", qdrant: "qdrant", pinecone: "pinecone", opensearch: "opensearch" };

/** How an agent remembers: which kinds of memory are on, where each lives, how it is searched and kept, and which memory tools the agent may call. */
export function MemoryPanel({ a }: { a: Agent }) {
  const hub = useHub(); const store = useAgents();
  const saved = useMemo(() => a.memory ?? defaultMemory(a.name.replace(/[^a-z0-9-]/g, "-").toLowerCase(), []), [a.memory, a.name]);
  const [cfg, setCfg] = useState<MemoryConfig>(saved);
  const dirty = JSON.stringify(cfg) !== JSON.stringify(saved); const lock = a.state === "retired";
  const issues = validateMemory(cfg); const errors = issues.filter((i) => i.level === "error");
  const [kind, setKind] = useState<MemoryKind>(cfg.layers.find((l) => l.enabled)?.kind ?? "working");
  const layer = cfg.layers.find((l) => l.kind === kind)!; const info = KIND_BY_ID[kind];
  const setLayer = (patch: Partial<MemoryLayer>) => setCfg((c) => ({ ...c, layers: c.layers.map((l) => (l.kind === kind ? { ...l, ...patch } : l)) }));
  const items = (store.memoryItems[a.id] ?? []).filter((i) => i.kind === kind);
  const count = (k: MemoryKind) => (store.memoryItems[a.id] ?? []).filter((i) => i.kind === k).length;
  const conns = hub.connections.filter((c) => c.integrationId === INTEGRATION_OF[layer.backend]);
  const at = (p: string) => issues.filter((i) => i.path.startsWith(p));
  return (
    <div className="space-y-5">
      <Notice tone="info" title="Sample workspace">Memory here is held in this browser. Recall scores by shared words so you can see how top K, the minimum score and recency change a result. The real service searches by meaning with the layer's embedding model.</Notice>
      <div className="grid lg:grid-cols-[300px_1fr] gap-5 items-start">
        <Card><CardHeader title="Kinds of memory" subtitle="Turn on only what the agent needs." />
          <ul className="divide-y divide-border">{MEMORY_KINDS.map((k) => { const l = cfg.layers.find((x) => x.kind === k.id)!; return (
            <li key={k.id} className={clsx("flex items-start gap-3 px-5 py-3", kind === k.id && "bg-surface-subtle")}>
              <button type="button" className="flex-1 text-left" onClick={() => setKind(k.id)} aria-current={kind === k.id}><div className="text-sm font-medium">{k.label}</div><div className="text-xs text-text-tertiary mt-0.5">{k.what}</div>{l.enabled && <div className="text-xs text-text-secondary mt-1">{count(k.id)} stored, {BACKEND_BY_ID[l.backend].label}</div>}</button>
              <Toggle label={`${k.label} memory`} checked={l.enabled} disabled={lock} onChange={(v) => setCfg((c) => ({ ...c, layers: c.layers.map((x) => (x.kind === k.id ? { ...x, enabled: v } : x)) }))} /></li>); })}</ul></Card>
        <div className="space-y-5">
          <Card><CardHeader title={info.label} subtitle={`${info.what} For example: ${info.example}`} />
            <CardBody className="space-y-4">
              {!layer.enabled && <Notice tone="info">This kind is off. Turn it on to set where it lives and how it is kept.</Notice>}
              <fieldset disabled={!layer.enabled || lock} className="space-y-4 disabled:opacity-50">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Where it is stored"><Select aria-label="Backend" value={layer.backend} onChange={(e) => setLayer({ backend: e.target.value as MemoryBackend, connection: undefined })}>{BACKENDS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</Select></Field>
                  {layer.backend !== "managed" ? <Field label="Connection" hint="From Integrations. The credential stays in your secret manager."><Select aria-label="Connection" value={layer.connection ?? ""} onChange={(e) => setLayer({ connection: e.target.value || undefined })}><option value="">{conns.length ? "Choose a connection" : "No connection for this store yet"}</option>{conns.map((c) => <option key={c.id} value={c.id}>{c.name}, {c.env}</option>)}</Select></Field> : <p className="text-xs text-text-tertiary self-end pb-2">{BACKEND_BY_ID.managed.note}</p>}
                  <Field label="Who it belongs to" hint={SCOPES.find((s) => s.id === layer.scope)?.help}><Select aria-label="Scope" value={layer.scope} onChange={(e) => setLayer({ scope: e.target.value as MemoryLayer["scope"] })}>{SCOPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select></Field>
                  <Field label="Who may write" hint="Procedural memory changes how the agent behaves, so it defaults to waiting for a person."><Select aria-label="Write rule" value={layer.write} onChange={(e) => setLayer({ write: e.target.value as MemoryLayer["write"] })}><option value="automatic">The agent writes on its own</option><option value="on-request">Only when asked to remember</option><option value="approval">A person approves each write</option></Select></Field>
                  <Field label="Keep items for (days)" hint="Counted from last use. Empty keeps them until someone removes them."><Input type="number" min={1} aria-label="Retention days" value={layer.retentionDays ?? ""} onChange={(e) => setLayer({ retentionDays: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
                  <Field label="Most items" hint="The oldest unpinned items go first. Empty is unlimited."><Input type="number" min={1} aria-label="Max items" value={layer.maxItems ?? ""} onChange={(e) => setLayer({ maxItems: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
                  <Field label="Recall strategy"><Select aria-label="Strategy" value={layer.strategy} onChange={(e) => setLayer({ strategy: e.target.value as MemoryLayer["strategy"] })}><option value="similarity">Closest in meaning</option><option value="recency">Most recent</option><option value="hybrid">Both</option></Select></Field>
                  <div className="grid grid-cols-2 gap-4"><Field label="Top K"><Input type="number" min={1} max={50} aria-label="Top K" value={layer.topK} onChange={(e) => setLayer({ topK: Number(e.target.value) })} /></Field><Field label="Minimum score"><Input type="number" min={0} max={1} step={0.05} aria-label="Minimum score" value={layer.minScore} onChange={(e) => setLayer({ minScore: Number(e.target.value) })} /></Field></div>
                  {info.vector && <Field label="Embedding model"><Select aria-label="Embedding model" value={layer.embeddingModel ?? ""} onChange={(e) => setLayer({ embeddingModel: e.target.value })}>{EMBEDDING_MODELS.map((m) => <option key={m}>{m}</option>)}</Select></Field>}
                  {kind === "conversation" && <Field label="Fold into a summary after (turns)"><Input type="number" min={2} aria-label="Summarise after" value={layer.summariseAfterTurns ?? 12} onChange={(e) => setLayer({ summariseAfterTurns: Number(e.target.value) })} /></Field>}
                </div>
                <label className="flex items-center gap-3 text-sm"><Toggle label="Mask personal data" checked={layer.maskPersonalData} onChange={(v) => setLayer({ maskPersonalData: v })} /> Mask personal data before it is stored</label>
              </fieldset>
              {layer.enabled && at(`layers.${kind}`).map((i, n) => <Notice key={n} tone={i.level === "error" ? "bad" : "warn"}>{i.message}</Notice>)}
            </CardBody></Card>
          <Card><CardHeader title="Memory tools" subtitle={`The agent reaches memory through these tools. Each is a tool grant, so approval and audit apply to them.`} />
            <CardBody className="space-y-3"><div className="grid sm:grid-cols-2 gap-3">{MEMORY_TOOLS.map((t) => <label key={t.id} className="flex items-start gap-3 rounded-md border border-border px-3 py-2.5"><Toggle label={t.name} checked={cfg.tools[t.id]} disabled={lock} onChange={(v) => setCfg((c) => ({ ...c, tools: { ...c.tools, [t.id as MemoryToolId]: v } }))} /><span className="text-sm"><span className="font-mono text-[13px]">{t.name}</span>{t.sensitive && <> <Badge tone="degraded">Needs approval</Badge></>}<span className="block text-xs text-text-tertiary mt-0.5">{t.summary}</span></span></label>)}</div>
              <div className="grid sm:grid-cols-3 gap-4 pt-2"><Field label="Namespace" hint="Keeps this agent's memory apart from every other agent's."><Input aria-label="Namespace" value={cfg.namespace} onChange={(e) => setCfg({ ...cfg, namespace: e.target.value })} /></Field><Field label="Region"><Select aria-label="Region" value={cfg.region} onChange={(e) => setCfg({ ...cfg, region: e.target.value })}>{["eu-west", "eu-central", "us-east", "me-central", "ap-south"].map((r) => <option key={r}>{r}</option>)}</Select></Field><label className="flex items-center gap-3 text-sm self-end pb-2"><Toggle label="Customer key" checked={cfg.customerKey} onChange={(v) => setCfg({ ...cfg, customerKey: v })} /> Encrypt with your own key</label></div>
              {[...at("namespace"), ...at("tools")].map((i, n) => <Notice key={n} tone={i.level === "error" ? "bad" : "warn"}>{i.message}</Notice>)}</CardBody></Card>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 sticky bottom-0 bg-surface-subtle/90 backdrop-blur border-t border-border -mx-1 px-1 py-3"><span className="text-xs text-text-tertiary mr-auto">{dirty ? "Unsaved changes" : "Saved"}</span>
        <Button disabled={!dirty} onClick={() => setCfg(saved)}>Discard</Button><Button variant="primary" disabled={!dirty || lock || errors.length > 0} onClick={() => { const r = actions.setConfig(a.id, cfg); r.ok ? toast("Memory saved", "success") : toast(r.error, "error"); }}>Save memory</Button></div>
      {layer.enabled && <Items a={a} kind={kind} layer={layer} items={items} saved={!dirty} />}
    </div>
  );
}

function Items({ a, kind, layer, items, saved }: { a: Agent; kind: MemoryKind; layer: MemoryLayer; items: ReturnType<typeof useAgents>["memoryItems"][string]; saved: boolean }) {
  const [q, setQ] = useState(""); const [text, setText] = useState(""); const [entity, setEntity] = useState(""); const [err, setErr] = useState("");
  const hits = useMemo(() => (q.trim() ? recall(items, q, layer) : []), [items, q, layer]); const shown = q.trim() ? hits.map((h) => h.item) : [...items].sort((x, y) => Number(y.pinned) - Number(x.pinned) || y.createdAt.localeCompare(x.createdAt));
  const score = (id: string) => hits.find((h) => h.item.id === id)?.score;
  return (
    <Card><CardHeader title={`Stored ${KIND_BY_ID[kind].label.toLowerCase()}`} subtitle={`${items.length} ${items.length === 1 ? "item" : "items"}. Type a question to see what the agent would recall with the settings above.`} action={items.length ? <Button variant="secondary" disabled={!saved} onClick={() => { const r = actions.clearLayer(a.id, kind); if (r.ok) toast(`${r.value} cleared`, "success"); }}>Clear all</Button> : undefined} />
      <CardBody className="space-y-4">
        <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" /><Input aria-label="Try a recall" className="pl-8" placeholder="Try a recall, for example: what does this customer prefer?" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="rounded-md border border-border divide-y divide-border">{shown.map((i) => (
          <div key={i.id} className="flex items-start gap-3 px-4 py-3 text-sm"><div className="flex-1 min-w-0"><div>{i.text}</div><div className="text-xs text-text-tertiary mt-1">{i.entity && <>{i.entity}, </>}{i.source === "agent" ? "written by the agent" : i.source === "person" ? "added by a person" : "system"}, {ago(i.createdAt)}, used {i.uses} {i.uses === 1 ? "time" : "times"}{i.tags.length > 0 && <>, {i.tags.join(", ")}</>}</div></div>
            {score(i.id) !== undefined && <Badge tone="info">Score {score(i.id)!.toFixed(2)}</Badge>}
            <button aria-label={i.pinned ? "Unpin" : "Pin so it is never dropped"} onClick={() => actions.pin(a.id, i.id, !i.pinned)} className="text-text-tertiary hover:text-text-primary">{i.pinned ? <PinOff size={15} /> : <Pin size={15} />}</button>
            <button aria-label="Forget this item" onClick={() => { actions.forget(a.id, i.id); toast("Forgotten, and recorded in the audit trail", "success"); }} className="text-text-tertiary hover:text-status-down"><Trash2 size={15} /></button></div>))}
          {shown.length === 0 && <p className="px-4 py-6 text-center text-sm text-text-secondary">{q.trim() ? "Nothing scores above the minimum. Lower it or rephrase." : "Nothing stored yet."}</p>}</div>
        <div className="grid sm:grid-cols-[1fr_200px_auto] gap-3 items-end"><Field label="Remember something"><Input aria-label="Memory text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Prefers replies by email, in French" /></Field><Field label="About (optional)"><Input aria-label="Entity" value={entity} onChange={(e) => setEntity(e.target.value)} placeholder="Customer 4411" /></Field><Button variant="secondary" disabled={!saved} onClick={() => { const r = actions.remember(a.id, { kind, text, entity }); if (!r.ok) return setErr(r.error); setErr(""); setText(""); setEntity(""); }}>Remember</Button></div>
        {!saved && <p className="text-xs text-text-tertiary">Save the settings first to add or clear items.</p>}{err && <Notice tone="bad">{err}</Notice>}
      </CardBody></Card>
  );
}
