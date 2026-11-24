"use client";

import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select, Toggle } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { CodeBlock, Confirm, Drawer, GuardButton, Kpi, Modal, Notice, useRole } from "@/components/mlops/ui";
import { AdapterMark } from "@/components/crucible/bits";
import { crucible, useCrucible } from "@/lib/crucible/store";
import { AUTHS_FOR, AUTH_LABEL, STORE_BRAND, STORE_LABEL, storeUri, type ArtifactStore, type StoreDraft, type StoreKind, type TestOutcome } from "@/lib/crucible/platform";
import { toast } from "@/lib/mlops/toast";
import { ago, int } from "@/lib/agents/format";

const gbFmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} TB` : `${int(n)} GB`);

export default function Storage() {
  const { stores, projects } = useCrucible(); const role = useRole();
  const [add, setAdd] = useState(false); const [openId, setOpenId] = useState<string | null>(null); const [rm, setRm] = useState<ArtifactStore | null>(null);
  const [result, setResult] = useState<{ id: string; out: TestOutcome } | null>(null);
  const open = stores.find((s) => s.id === openId) ?? null;
  const test = (s: ArtifactStore) => { const r = crucible.testStore(s.id); if (r.ok) { setResult({ id: s.id, out: r.value }); setOpenId(s.id); } };

  return (
    <div className="space-y-6">
      <PageHeader title="Storage" description="Where plots, reports, checkpoints and models are kept. Use the platform's bucket or connect your own. A machine uploads straight to the store with a short lived address, so large files never pass through Crucible."
        action={<GuardButton action="connection.create" role={role} variant="primary" onClick={() => setAdd(true)}><Plus size={14} /> Connect a store</GuardButton>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Stores" value={stores.length} sub={`${stores.filter((s) => s.status === "connected").length} connected`} />
        <Kpi label="Stored" value={gbFmt(stores.reduce((a, s) => a + s.usedGb, 0))} sub={`${int(stores.reduce((a, s) => a + s.objects, 0))} objects`} />
        <Kpi label="Default" value={stores.find((s) => s.isDefault)?.name ?? "None"} />
        <Kpi label="Need a look" value={stores.filter((s) => s.status !== "connected").length} tone={stores.some((s) => s.status !== "connected") ? "warn" : undefined} sub="Untested or failing" />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {stores.map((s) => { const users = projects.filter((p) => p.storeId === s.id); return (
          <Card key={s.id} className="p-5 cursor-pointer hover:border-border-strong" >
            <div role="button" tabIndex={0} onClick={() => setOpenId(s.id)} onKeyDown={(e) => e.key === "Enter" && setOpenId(s.id)} className="space-y-4">
              <div className="flex items-start gap-3"><AdapterMark a={{ brand: STORE_BRAND[s.kind], group: "Artifacts" }} />
                <div className="min-w-0 flex-1"><div className="flex items-center gap-2 flex-wrap"><span className="text-sm font-semibold text-text-primary">{s.name}</span>{s.isDefault && <Badge tone="info">Default</Badge>}{s.managed && <Badge tone="neutral">Managed</Badge>}<Badge tone={s.status === "connected" ? "healthy" : s.status === "failing" ? "down" : "degraded"}>{s.status === "connected" ? "Connected" : s.status === "failing" ? "Failing" : "Not tested"}</Badge></div>
                  <div className="font-code text-xs text-text-secondary mt-1 break-all">{storeUri(s)}</div><div className="text-xs text-text-tertiary mt-0.5">{STORE_LABEL[s.kind]}{s.region ? ` · ${s.region}` : ""} · {AUTH_LABEL[s.auth]}</div></div></div>
              <div className="grid grid-cols-3 gap-3 text-sm"><div><div className="text-[11px] text-text-tertiary">Stored</div><div className="tabular-nums font-medium">{gbFmt(s.usedGb)}</div></div><div><div className="text-[11px] text-text-tertiary">Objects</div><div className="tabular-nums font-medium">{int(s.objects)}</div></div><div><div className="text-[11px] text-text-tertiary">Used by</div><div className="font-medium">{users.length} {users.length === 1 ? "project" : "projects"}</div></div></div>
            </div>
          </Card>); })}
      </div>

      <Drawer open={!!open} onClose={() => { setOpenId(null); setResult(null); }} title={open?.name ?? ""} subtitle={open ? STORE_LABEL[open.kind] : undefined}>
        {open && (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => test(open)}>Test connection</Button>
              <GuardButton action="settings.edit" role={role} variant="secondary" onClick={() => { const r = crucible.setDefaultStore(role, open.id); r.ok ? toast(`${open.name} is the default store`) : toast(r.error, "error"); }}>Make default</GuardButton>
              <GuardButton action="connection.delete" role={role} variant="ghost" onClick={() => setRm(open)}>Remove</GuardButton></div>
            {result?.id === open.id && (<div className="space-y-2"><h3 className="text-sm font-semibold text-text-primary">Test result</h3><ul className="divide-y divide-border border-y border-border">{result.out.checks.map((c) => <li key={c.label} className="py-2 flex items-start gap-3"><span className={`h-5 w-5 rounded-full grid place-items-center shrink-0 mt-0.5 ${c.ok ? "bg-status-healthy/10 text-status-healthy" : "bg-status-down/10 text-status-down"}`}>{c.ok ? <Check size={12} /> : <X size={12} />}</span><div><div className="text-sm">{c.label}</div><div className="text-xs text-text-tertiary">{c.detail}</div></div></li>)}</ul>
              <p className="text-xs text-text-tertiary">In the sample workspace the test applies the same rules a real one would, and reaches nothing.</p></div>)}
            <dl className="text-sm divide-y divide-border">
              {[["Location", storeUri(open)], ["Access", AUTH_LABEL[open.auth]], open.roleArn ? ["Role", open.roleArn] : null, open.secretRef ? ["Credentials", open.secretRef] : null, open.endpoint ? ["Endpoint", open.endpoint] : null, ["Encryption", open.encryption], ["Versioning", open.versioning ? "On" : "Off"], ["Moves to cold storage", `after ${open.lifecycle.coldAfterDays} days`], ["Deleted", open.lifecycle.expireAfterDays ? `after ${open.lifecycle.expireAfterDays} days` : "Never"], ["Last tested", open.lastTestedAt ? ago(open.lastTestedAt) : "Never"]].filter(Boolean).map((r) => <div key={(r as string[])[0]} className="flex justify-between gap-4 py-2"><dt className="text-text-secondary shrink-0">{(r as string[])[0]}</dt><dd className="text-right break-all font-code text-xs leading-5">{(r as string[])[1]}</dd></div>)}
            </dl>
            <section><h3 className="text-sm font-semibold text-text-primary mb-2">Projects that write here</h3>{projects.filter((p) => p.storeId === open.id).length ? <ul className="text-sm space-y-1">{projects.filter((p) => p.storeId === open.id).map((p) => <li key={p.id}>{p.name}</li>)}</ul> : <p className="text-sm text-text-secondary">None.</p>}</section>
            <section><h3 className="text-sm font-semibold text-text-primary mb-2">How a machine uploads</h3><ol className="text-sm text-text-secondary space-y-1.5 list-decimal pl-5"><li>The SDK asks Crucible for an upload address for one run.</li><li>Crucible checks the key's permission and signs a short lived address for that run's folder only.</li><li>The machine sends the file straight to the bucket in parts, with a checksum.</li><li>Crucible records the object, its size and checksum on the run.</li></ol></section>
            {open.kind === "s3" && open.roleArn && <section><h3 className="text-sm font-semibold text-text-primary mb-2">Trust policy for your account</h3><CodeBlock title="IAM trust policy" code={`{\n  "Effect": "Allow",\n  "Principal": { "AWS": "arn:aws:iam::210987654321:role/tokener-crucible" },\n  "Action": "sts:AssumeRole",\n  "Condition": { "StringEquals": { "sts:ExternalId": "<your workspace id>" } }\n}`} maxHeight={200} /><p className="text-xs text-text-tertiary mt-2">The external ID stops another customer from using the role. The role needs read, write and list on the prefix only.</p></section>}
          </div>
        )}
      </Drawer>

      {add && <AddStore onClose={() => setAdd(false)} />}
      <Confirm open={!!rm} onClose={() => setRm(null)} title="Remove this store" confirmLabel="Remove store" danger phrase={rm?.name}
        body={<>Crucible stops using <span className="font-medium">{rm?.name}</span>. The files in the bucket are not deleted.</>}
        onConfirm={() => { if (!rm) return; const r = crucible.removeStore(role, rm.id, rm.name); if (r.ok) { toast(`Removed ${rm.name}`); setOpenId(null); } else toast(r.error, "error"); }} />
    </div>
  );
}

function AddStore({ onClose }: { onClose: () => void }) {
  const role = useRole();
  const [d, setD] = useState<StoreDraft>({ name: "", kind: "s3", bucket: "", prefix: "crucible", region: "eu-west-1", auth: "iam-role", roleArn: "", secretRef: "", encryption: "SSE-KMS", versioning: true, endpoint: "" });
  const [err, setErr] = useState<string | null>(null);
  const setKind = (kind: StoreKind) => setD({ ...d, kind, auth: AUTHS_FOR[kind][0], encryption: kind === "gcs" || kind === "azure" ? "provider-managed" : kind === "minio" ? "SSE-S3" : "SSE-KMS", region: kind === "minio" ? "" : d.region });
  const go = () => { const r = crucible.addStore(role, { ...d, endpoint: d.endpoint || undefined, secretRef: d.secretRef || undefined, roleArn: d.roleArn || undefined }); if (!r.ok) { setErr(r.error); return; } toast(`Added ${d.name}. Test it before use.`); onClose(); };
  return (
    <Modal open onClose={onClose} wide title="Connect a store" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={go}>Connect</Button></>}>
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Name"><Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="team-ml-lake" /></Field>
          <Field label="Kind"><Select value={d.kind} onChange={(e) => setKind(e.target.value as StoreKind)}>{(Object.keys(STORE_LABEL) as StoreKind[]).map((k) => <option key={k} value={k}>{STORE_LABEL[k]}</option>)}</Select></Field>
          <Field label="Bucket"><Input value={d.bucket} onChange={(e) => setD({ ...d, bucket: e.target.value })} /></Field>
          <Field label="Prefix" hint="A folder inside the bucket."><Input value={d.prefix} onChange={(e) => setD({ ...d, prefix: e.target.value })} /></Field>
          {(d.kind === "s3" || d.kind === "gcs" || d.kind === "azure") && <Field label="Region"><Input value={d.region} onChange={(e) => setD({ ...d, region: e.target.value })} /></Field>}
          {(d.kind === "minio" || d.kind === "r2") && <Field label="Endpoint"><Input value={d.endpoint ?? ""} onChange={(e) => setD({ ...d, endpoint: e.target.value })} placeholder="https://minio.internal.example:9000" /></Field>}
          <Field label="How Crucible signs in"><Select value={d.auth} onChange={(e) => setD({ ...d, auth: e.target.value as StoreDraft["auth"] })}>{AUTHS_FOR[d.kind].map((a) => <option key={a} value={a}>{AUTH_LABEL[a]}</option>)}</Select></Field>
          {d.auth === "iam-role" && <Field label="Role to assume"><Input value={d.roleArn ?? ""} onChange={(e) => setD({ ...d, roleArn: e.target.value })} placeholder="arn:aws:iam::123456789012:role/crucible-artifacts" /></Field>}
          {(d.auth === "access-key" || d.auth === "service-account") && <Field label="Credentials, as a reference" hint="Where your secret manager holds them. A pasted key is refused."><Input value={d.secretRef ?? ""} onChange={(e) => setD({ ...d, secretRef: e.target.value })} placeholder="secretref://crucible/stores/team-ml-lake" /></Field>}
        </div>
        <Toggle label="Keep every version of an object" description="Stops a run's artifacts from being overwritten." checked={d.versioning} onChange={(versioning) => setD({ ...d, versioning })} />
        {err && <Notice tone="bad">{err}</Notice>}
      </div>
    </Modal>
  );
}
