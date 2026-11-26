"use client";

import { useState } from "react";
import { Check, HardDrive, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select, Toggle } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Confirm, Drawer, Kpi, Modal, Notice } from "@/components/mlops/ui";
import { crucibleDriver, useCrucibleLive } from "@/lib/crucible/live/store";
import type { NewStore, Store, StoreAuth, StoreCheck, StoreKind } from "@/lib/crucible/live/types";
import { toast } from "@/lib/mlops/toast";
import { Allowed, AUTH_LABEL, STORE_LABEL, when } from "./bits";

/** The service connects S3 compatible stores with an access key kept in the secret manager. Google, Azure and role based sign in are listed by the service as not served yet, so they are not offered here. */
const KINDS: StoreKind[] = ["s3", "minio", "r2"];
const AUTHS_FOR: Record<StoreKind, StoreAuth[]> = { s3: ["access-key"], minio: ["access-key"], gcs: [], azure: [], r2: ["access-key"] };
const uri = (s: Store) => `${s.kind === "gcs" ? "gs" : s.kind === "azure" ? "az" : "s3"}://${s.bucket}${s.prefix ? `/${s.prefix}` : ""}`;
const tone = (s: Store) => (s.status === "connected" ? "healthy" : s.status === "failing" ? "down" : "degraded") as "healthy" | "down" | "degraded";

export function LiveStorage() {
  const { stores, projects } = useCrucibleLive();
  const [add, setAdd] = useState(false); const [openId, setOpenId] = useState<string | null>(null); const [rm, setRm] = useState<Store | null>(null);
  const [result, setResult] = useState<{ id: string; checks: StoreCheck[] } | null>(null); const [err, setErr] = useState<string | null>(null); const [testing, setTesting] = useState(false);
  const open = stores.find((s) => s.id === openId) ?? null;
  const users = (s: Store) => projects.filter((p) => p.project.storeId === s.id);
  const test = async (s: Store) => { setErr(null); setTesting(true); const r = await crucibleDriver().testStore(s.id); setTesting(false); if (!r.ok) { setErr(r.error); return; } setResult({ id: s.id, checks: r.checks }); };
  const makeDefault = async (s: Store) => { setErr(null); const r = await crucibleDriver().makeDefaultStore(s.id); if (!r.ok) { setErr(r.error); return; } toast(`${s.name} is the default store`); };
  const remove = async () => {
    if (!rm) return; const r = await crucibleDriver().deleteStore(rm.id); const name = rm.name; setRm(null);
    if (!r.ok) { setErr(r.error); return; }
    toast(`Removed ${name}`); setOpenId(null);
  };
  return (
    <div className="space-y-6">
      <PageHeader title="Storage" description="Where plots, reports, checkpoints and models are kept. Use the platform's bucket or connect your own. A machine uploads straight to the store with a short lived address, so large files never pass through Crucible."
        action={<Allowed need="connection_create" variant="primary" onClick={() => setAdd(true)}><Plus size={14} /> Connect a store</Allowed>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Stores" value={stores.length} sub={`${stores.filter((s) => s.status === "connected").length} connected`} />
        <Kpi label="Default" value={stores.find((s) => s.isDefault)?.name ?? "None"} />
        <Kpi label="Used by projects" value={projects.length} sub="Each writes to one store" />
        <Kpi label="Need a look" value={stores.filter((s) => s.status !== "connected").length} tone={stores.some((s) => s.status !== "connected") ? "warn" : undefined} sub="Untested or failing" />
      </div>
      {err && <Notice tone="bad">{err}</Notice>}
      {stores.length === 0 ? <Card><EmptyState icon={HardDrive} title="No store yet" description="Connect an artifact store before creating a project. A project writes its runs' files to one store." /></Card> : (
        <div className="grid md:grid-cols-2 gap-4">
          {stores.map((s) => (
            <Card key={s.id} className="p-5 cursor-pointer hover:border-border-strong">
              <div role="button" tabIndex={0} onClick={() => { setOpenId(s.id); setResult(null); }} onKeyDown={(e) => e.key === "Enter" && setOpenId(s.id)} className="space-y-4">
                <div className="min-w-0"><div className="flex items-center gap-2 flex-wrap"><span className="text-sm font-semibold text-text-primary">{s.name}</span>{s.isDefault && <Badge tone="info">Default</Badge>}{s.managed && <Badge tone="neutral">Managed</Badge>}<Badge tone={tone(s)}>{s.status === "connected" ? "Connected" : s.status === "failing" ? "Failing" : "Not tested"}</Badge></div>
                  <div className="font-code text-xs text-text-secondary mt-1 break-all">{uri(s)}</div><div className="text-xs text-text-tertiary mt-0.5">{STORE_LABEL[s.kind]}{s.region ? ` · ${s.region}` : ""} · {AUTH_LABEL[s.auth]}</div></div>
                <div className="grid grid-cols-2 gap-3 text-sm"><div><div className="text-[11px] text-text-tertiary">Used by</div><div className="font-medium">{users(s).length} {users(s).length === 1 ? "project" : "projects"}</div></div><div><div className="text-[11px] text-text-tertiary">Last tested</div><div className="font-medium">{s.lastTestedAt ? when(s.lastTestedAt) : "Never"}</div></div></div>
              </div>
            </Card>))}
        </div>
      )}
      <Drawer open={!!open} onClose={() => { setOpenId(null); setResult(null); }} title={open?.name ?? ""} subtitle={open ? STORE_LABEL[open.kind] : undefined}>
        {open && (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <Allowed need="settings" onClick={() => test(open)} disabled={testing}>{testing ? "Testing" : "Test connection"}</Allowed>
              <Allowed need="settings" disabled={open.isDefault} onClick={() => makeDefault(open)}>Make default</Allowed>
              {!open.managed && <Allowed need="connection_delete" variant="ghost" onClick={() => setRm(open)}>Remove</Allowed>}
            </div>
            {open.testNote && result?.id !== open.id && <Notice tone={open.status === "connected" ? "info" : "warn"} title={`Last test: ${open.status}`}>{open.testNote}</Notice>}
            {result?.id === open.id && (<div className="space-y-2"><h3 className="text-sm font-semibold text-text-primary">Test result</h3><ul className="divide-y divide-border border-y border-border">{result.checks.map((c) => <li key={c.name} className="py-2 flex items-start gap-3"><span className={`h-5 w-5 rounded-full grid place-items-center shrink-0 mt-0.5 ${c.ok ? "bg-status-healthy/10 text-status-healthy" : "bg-status-down/10 text-status-down"}`}>{c.ok ? <Check size={12} /> : <X size={12} />}</span><div><div className="text-sm">{c.name}</div><div className="text-xs text-text-tertiary">{c.detail}</div></div></li>)}</ul></div>)}
            <dl className="text-sm divide-y divide-border">
              {([["Location", uri(open)], ["Access", AUTH_LABEL[open.auth]], open.roleArn ? ["Role", open.roleArn] : null, open.secretRef ? ["Credentials", open.secretRef] : null, open.endpoint ? ["Endpoint", open.endpoint] : null, ["Encryption", open.encryption], ["Versioning", open.versioning ? "On" : "Off"], ["Moves to cold storage", `after ${open.coldAfterDays} days`], ["Deleted", open.expireAfterDays ? `after ${open.expireAfterDays} days` : "Never"], ["Last tested", open.lastTestedAt ? when(open.lastTestedAt) : "Never"]].filter(Boolean) as string[][]).map((r) => <div key={r[0]} className="flex justify-between gap-4 py-2"><dt className="text-text-secondary shrink-0">{r[0]}</dt><dd className="text-right break-all font-code text-xs leading-5">{r[1]}</dd></div>)}
            </dl>
            <section><h3 className="text-sm font-semibold text-text-primary mb-2">Projects that write here</h3>{users(open).length ? <ul className="text-sm space-y-1">{users(open).map((p) => <li key={p.project.id}>{p.project.name}</li>)}</ul> : <p className="text-sm text-text-secondary">None.</p>}</section>
            <section><h3 className="text-sm font-semibold text-text-primary mb-2">How a machine uploads</h3><ol className="text-sm text-text-secondary space-y-1.5 list-decimal pl-5"><li>The SDK asks Crucible for an upload address for one run and one path.</li><li>Crucible checks the key's scope and signs a short lived address for that run's folder only.</li><li>The machine sends the file straight to the bucket.</li><li>The SDK then records the artifact on the run with an artifact event.</li></ol></section>
          </div>
        )}
      </Drawer>
      {add && <AddStore onClose={() => setAdd(false)} />}
      <Confirm open={!!rm} onClose={() => setRm(null)} title="Remove this store" confirmLabel="Remove store" danger phrase={rm?.name}
        body={<>Crucible stops using <span className="font-medium">{rm?.name}</span>. The files in the bucket are not deleted.</>} onConfirm={remove} />
    </div>
  );
}

function AddStore({ onClose }: { onClose: () => void }) {
  const [d, setD] = useState<NewStore>({ name: "", kind: "s3", bucket: "", prefix: "crucible", region: "eu-west-1", endpoint: "", auth: "access-key", secretRef: "", roleArn: "", encryption: "SSE-KMS", versioning: true, coldAfterDays: 90, expireAfterDays: null });
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const setKind = (kind: StoreKind) => setD({ ...d, kind, auth: AUTHS_FOR[kind][0], encryption: kind === "minio" ? "SSE-S3" : "SSE-KMS", region: kind === "minio" ? "" : d.region });
  const go = async () => { setErr(null); setBusy(true); const r = await crucibleDriver().createStore(d); setBusy(false); if (!r.ok) { setErr(r.error); return; } toast(`Added ${d.name}. Test it before use.`); onClose(); };
  return (
    <Modal open onClose={onClose} wide title="Connect a store" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={go} disabled={busy}>{busy ? "Connecting" : "Connect"}</Button></>}>
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Name"><Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="team-ml-lake" /></Field>
          <Field label="Kind"><Select value={d.kind} onChange={(e) => setKind(e.target.value as StoreKind)}>{KINDS.map((k) => <option key={k} value={k}>{STORE_LABEL[k]}</option>)}</Select></Field>
          <Field label="Bucket"><Input value={d.bucket} onChange={(e) => setD({ ...d, bucket: e.target.value })} /></Field>
          <Field label="Prefix" hint="A folder inside the bucket."><Input value={d.prefix} onChange={(e) => setD({ ...d, prefix: e.target.value })} /></Field>
          {d.kind === "s3" && <Field label="Region"><Input value={d.region} onChange={(e) => setD({ ...d, region: e.target.value })} /></Field>}
          {(d.kind === "minio" || d.kind === "r2") && <Field label="Endpoint" hint="The address of the S3 compatible service."><Input value={d.endpoint} onChange={(e) => setD({ ...d, endpoint: e.target.value })} placeholder="https://minio.internal.example:9000" /></Field>}
          <Field label="How Crucible signs in"><Select value={d.auth} onChange={(e) => setD({ ...d, auth: e.target.value as StoreAuth })}>{AUTHS_FOR[d.kind].map((a) => <option key={a} value={a}>{AUTH_LABEL[a]}</option>)}</Select></Field>
                    {<Field label="Credentials, as a reference" hint="Where your secret manager holds them. A pasted key is refused."><Input value={d.secretRef} onChange={(e) => setD({ ...d, secretRef: e.target.value })} placeholder="secretref://vault/<org>/crucible/team-ml-lake" /></Field>}
        </div>
        <Toggle label="Keep every version of an object" description="Stops a run's artifacts from being overwritten." checked={d.versioning} onChange={(versioning) => setD({ ...d, versioning })} />
        {err && <Notice tone="bad">{err}</Notice>}
      </div>
    </Modal>
  );
}
