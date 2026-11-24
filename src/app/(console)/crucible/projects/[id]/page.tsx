"use client";

import Link from "next/link";
import { use, useMemo, useState } from "react";
import { ChevronLeft, FolderGit2, KeyRound, Laptop, Plus, RotateCw } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select } from "@/components/ui/Form";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { CodeBlock, Confirm, GuardButton, Modal, Notice, Tabs, useRole } from "@/components/mlops/ui";
import { RunBadge, mval, PRIMARY } from "@/components/crucible/bits";
import { crucible, useCrucible } from "@/lib/crucible/store";
import { MACHINE_LABEL, SCOPE_LABEL, STORE_LABEL, connectSnippets, projectYaml, storeUri, type ApiKey, type KeyScope, type MachineKind } from "@/lib/crucible/platform";
import { toast } from "@/lib/mlops/toast";
import { ago } from "@/lib/agents/format";

type Tab = "connect" | "machines" | "keys" | "file" | "runs";
type Snip = "python" | "env" | "mlflow" | "cli";

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const st = useCrucible(); const role = useRole();
  const p = st.projects.find((x) => x.id === id); const [tab, setTab] = useState<Tab>("connect"); const [snip, setSnip] = useState<Snip>("python");
  const [keyModal, setKeyModal] = useState(false); const [machineModal, setMachineModal] = useState(false);
  const [shown, setShown] = useState<{ key: ApiKey; token: string; rotated?: boolean } | null>(null); const [revoke, setRevoke] = useState<ApiKey | null>(null);
  const keys = useMemo(() => st.keys.filter((k) => k.projectId === id), [st.keys, id]); const machines = st.machines.filter((m) => m.projectId === id);
  if (!p) return <EmptyState icon={FolderGit2} title="Project not found" description="It may have been removed from the sample data." />;
  const store = st.stores.find((s) => s.id === p.storeId); const runs = st.runs.filter((r) => p.experimentIds.includes(r.experimentId));
  const ds = runs[0]?.dataset; const snippets = connectSnippets(p);

  const rotate = (k: ApiKey) => { const r = crucible.rotateKey(role, k.id); r.ok ? setShown({ ...r.value, rotated: true }) : toast(r.error, "error"); };
  const heartbeat = (mid: string) => { const r = crucible.simulateHeartbeat(role, mid); r.ok ? toast(`${r.value.name} is connected`) : toast(r.error, "error"); };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/crucible/projects" className="inline-flex items-center gap-1 text-[13px] text-text-secondary hover:text-text-primary mb-2"><ChevronLeft size={14} /> Projects</Link>
        <h1 className="text-xl font-semibold text-text-primary tracking-tight">{p.name}</h1>
        <p className="text-sm text-text-secondary mt-1 max-w-2xl">{p.description || "No description."}</p>
        <div className="text-xs text-text-tertiary mt-2 flex flex-wrap gap-x-4 gap-y-1"><span className="font-code">{p.repo.url || "No repository"}</span><span>Python {p.python} with {p.envTool}</span>{store && <span>Artifacts in <span className="font-code">{storeUri(store)}</span> ({STORE_LABEL[store.kind]})</span>}</div>
      </div>
      <Tabs<Tab> label="Project views" value={tab} onChange={setTab} tabs={[{ id: "connect", label: "Connect a machine" }, { id: "machines", label: "Machines", count: machines.length }, { id: "keys", label: "API keys", count: keys.filter((k) => !k.revokedAt).length }, { id: "file", label: "Project file" }, { id: "runs", label: "Runs", count: runs.length }]} />

      {tab === "connect" && (
        <div className="space-y-5 max-w-4xl">
          <Notice tone="info" title="Connecting a machine takes three steps">Make a key, put it in the machine's environment, then run your training code. The key is shown once. Crucible keeps a reference to it in your secret manager, never the key itself, and the machine never holds your cloud credentials: artifacts go straight from the machine to the store with a short lived address.</Notice>
          <Card className="p-5"><div className="flex items-start justify-between gap-4"><div><h3 className="text-sm font-semibold text-text-primary">1. Make a key for this machine</h3><p className="text-xs text-text-secondary mt-1">One key for each machine or pipeline, so one can be revoked without touching the others.</p></div><GuardButton action="connection.create" role={role} variant="secondary" onClick={() => setKeyModal(true)}><KeyRound size={14} /> Make a key</GuardButton></div>
            <p className="text-xs text-text-tertiary mt-3">{keys.filter((k) => !k.revokedAt).length} active keys: {keys.filter((k) => !k.revokedAt).map((k) => k.name).join(", ") || "none"}</p></Card>
          <Card className="p-5 space-y-3"><div><h3 className="text-sm font-semibold text-text-primary">2. Set up the machine</h3><p className="text-xs text-text-secondary mt-1">Nothing secret is pasted into code or committed. The key is read from your secret manager when the shell starts.</p></div>
            <CodeBlock title="Install" code={snippets.install} maxHeight={80} />
            <div role="tablist" aria-label="Snippets" className="inline-flex rounded-md border border-border p-0.5">{([["python", "Python"], ["env", "Environment"], ["mlflow", "Existing MLflow code"], ["cli", "Command line"]] as [Snip, string][]).map(([v, l]) => <button key={v} role="tab" aria-selected={snip === v} onClick={() => setSnip(v)} className={`h-7 px-3 rounded text-[12.5px] font-medium ${snip === v ? "bg-emph text-on-emph" : "text-text-secondary hover:bg-surface-muted"}`}>{l}</button>)}</div>
            <CodeBlock title={snip === "python" ? "train.py" : snip === "env" ? "shell" : snip === "mlflow" ? "shell" : "shell"} code={snippets[snip]} />
            <p className="text-xs text-text-tertiary">The SDK, the command line and the MLflow compatible address are planned. They are not published yet, so nothing here has run against a real machine.</p></Card>
          <Card className="p-5"><div className="flex items-start justify-between gap-4"><div><h3 className="text-sm font-semibold text-text-primary">3. Register the machine and wait for it</h3><p className="text-xs text-text-secondary mt-1">It appears as pending until its first heartbeat arrives.</p></div><GuardButton action="agent.enroll" role={role} variant="secondary" onClick={() => setMachineModal(true)}><Laptop size={14} /> Register a machine</GuardButton></div>
            {machines.filter((m) => m.state === "pending").map((m) => <div key={m.id} className="mt-4 flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2.5"><div><div className="text-sm font-medium">{m.name}</div><div className="text-xs text-text-tertiary">Waiting for the first heartbeat. In the sample workspace no machine can call in.</div></div><GuardButton action="agent.enroll" role={role} variant="secondary" className="h-8" onClick={() => heartbeat(m.id)}>Simulate first heartbeat</GuardButton></div>)}</Card>
        </div>
      )}

      {tab === "machines" && (machines.length === 0 ? <EmptyState icon={Laptop} title="No machines yet" description="Connect a machine from the first tab." /> : (
        <Card className="overflow-hidden"><Table><Thead><tr><Th>Machine</Th><Th>State</Th><Th>System</Th><Th>SDK</Th><Th>Runs logged</Th><Th>Last seen</Th><Th>{""}</Th></tr></Thead><tbody>
          {machines.map((m) => <Tr key={m.id}><Td><span className="font-medium text-text-primary">{m.name}</span><div className="text-xs text-text-tertiary">{MACHINE_LABEL[m.kind]} · {m.user}{m.ip ? ` · ${m.ip}` : ""}</div></Td>
            <Td><Badge tone={m.state === "online" ? "healthy" : m.state === "pending" ? "info" : m.state === "idle" ? "neutral" : "down"}>{m.state === "online" ? "Online" : m.state === "idle" ? "Idle" : m.state === "pending" ? "Pending" : "Revoked"}</Badge></Td>
            <Td className="text-text-secondary text-xs">{m.os}<div>Python {m.python || "unknown"}</div></Td><Td className="text-text-secondary">{m.sdk || "None"}</Td><Td className="tabular-nums">{m.runsLogged}</Td><Td className="text-text-secondary">{m.lastSeenAt ? ago(m.lastSeenAt) : "Never"}</Td>
            <Td className="text-right">{m.state !== "revoked" && <GuardButton action="agent.revoke" role={role} variant="ghost" className="h-8" onClick={() => { const r = crucible.revokeMachine(role, m.id); r.ok ? toast(`Revoked ${m.name}`) : toast(r.error, "error"); }}>Revoke</GuardButton>}</Td></Tr>)}
        </tbody></Table></Card>))}

      {tab === "keys" && (
        <div className="space-y-4"><div className="flex justify-end"><GuardButton action="connection.create" role={role} variant="primary" onClick={() => setKeyModal(true)}><Plus size={14} /> Make a key</GuardButton></div>
          <Card className="overflow-hidden"><Table><Thead><tr><Th>Key</Th><Th>Can</Th><Th>Reference</Th><Th>Expires</Th><Th>Last used</Th><Th>{""}</Th></tr></Thead><tbody>
            {keys.map((k) => <Tr key={k.id}><Td><span className="font-medium text-text-primary">{k.name}</span><div className="font-code text-xs text-text-tertiary">{k.prefix}...</div></Td><Td className="text-text-secondary text-xs">{k.scopes.map((s) => SCOPE_LABEL[s]).join(", ")}</Td><Td className="font-code text-[11px] text-text-tertiary max-w-[240px] break-all">{k.secretRef}</Td>
              <Td className="text-text-secondary">{k.revokedAt ? <Badge tone="down">Revoked</Badge> : new Date(k.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</Td><Td className="text-text-secondary">{k.lastUsedAt ? ago(k.lastUsedAt) : "Never"}</Td>
              <Td className="text-right whitespace-nowrap">{!k.revokedAt && <><GuardButton action="connection.rotate" role={role} variant="ghost" className="h-8" onClick={() => rotate(k)}><RotateCw size={13} /> Rotate</GuardButton><GuardButton action="connection.delete" role={role} variant="ghost" className="h-8" onClick={() => setRevoke(k)}>Revoke</GuardButton></>}</Td></Tr>)}
          </tbody></Table></Card></div>
      )}

      {tab === "file" && store && (
        <div className="max-w-3xl space-y-3"><p className="text-sm text-text-secondary">Keep this file at the root of the repository, like MLflow's MLproject file. It records how to run the project, which data version it uses and where it writes, so a run can be repeated by anyone from anywhere. It holds no secret.</p>
          <CodeBlock title="crucible.yaml" code={projectYaml(p, store, ds ? { name: ds.name, version: ds.version } : undefined)} />
          <CodeBlock title="Where artifacts land" code={`${storeUri(store)}/${p.name}/<experiment>/<run id>/\n  artifacts/   plots, reports, checkpoints\n  model/       the logged model and its signature\n  env/         lock file, image digest, git patch`} maxHeight={140} /></div>
      )}

      {tab === "runs" && (runs.length === 0 ? <EmptyState icon={FolderGit2} title="No runs yet" description="Runs appear here as soon as a connected machine logs one." /> : (
        <Card className="overflow-hidden"><Table><Thead><tr><Th>Run</Th><Th>Status</Th><Th>Result</Th><Th>Data</Th><Th>Started</Th></tr></Thead><tbody>
          {runs.slice(0, 12).map((r) => { const k = PRIMARY[r.experimentId]; return <Tr key={r.id}><Td><Link href={`/crucible/runs/${r.id}`} className="font-medium text-text-primary hover:underline">{r.name}</Link></Td><Td><RunBadge s={r.status} /></Td><Td className="tabular-nums text-text-secondary">{r.metrics[k] !== undefined && r.status !== "failed" ? `${k.replace(/_/g, " ")} ${mval(k, r.metrics[k])}` : "None"}</Td><Td className="text-text-secondary">{r.dataset.name} v{r.dataset.version}</Td><Td className="text-text-secondary">{ago(r.startedAt)}</Td></Tr>; })}
        </tbody></Table></Card>))}

      {keyModal && <KeyModal projectId={p.id} onClose={() => setKeyModal(false)} onMade={(x) => { setKeyModal(false); setShown(x); }} />}
      {machineModal && <MachineModal projectId={p.id} onClose={() => setMachineModal(false)} />}
      <Modal open={!!shown} onClose={() => setShown(null)} title={shown?.rotated ? "Key rotated" : "Key created"} footer={<Button variant="primary" onClick={() => setShown(null)}>I have stored it</Button>}>
        {shown && <div className="space-y-4"><Notice tone="warn" title="This is the only time it is shown">Put it in your secret manager now. After you close this, only the first characters and a reference remain.</Notice>
          <CodeBlock title="Sample key, not a real credential" code={shown.token} maxHeight={60} /><dl className="text-sm"><div className="flex justify-between py-1"><dt className="text-text-secondary">Kept as</dt><dd className="font-code text-xs text-right break-all">{shown.key.secretRef}</dd></div></dl></div>}
      </Modal>
      <Confirm open={!!revoke} onClose={() => setRevoke(null)} title="Revoke this key" confirmLabel="Revoke key" danger phrase={revoke?.name}
        body={<>Machines that use <span className="font-medium">{revoke?.name}</span> stop being able to log runs straight away. Their past runs stay.</>}
        onConfirm={() => { if (!revoke) return; const r = crucible.revokeKey(role, revoke.id); r.ok ? toast(`Revoked ${revoke.name}`) : toast(r.error, "error"); }} />
    </div>
  );
}

function KeyModal({ projectId, onClose, onMade }: { projectId: string; onClose: () => void; onMade: (x: { key: ApiKey; token: string }) => void }) {
  const role = useRole(); const [name, setName] = useState(""); const [days, setDays] = useState(90); const [scopes, setScopes] = useState<KeyScope[]>(["log", "read"]); const [err, setErr] = useState<string | null>(null);
  const go = () => { const r = crucible.createKey(role, projectId, name.trim(), scopes, days); r.ok ? onMade(r.value) : setErr(r.error); };
  return (
    <Modal open onClose={onClose} title="Make a key" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={go}>Make key</Button></>}>
      <div className="space-y-4">
        <Field label="Name" hint="The machine or pipeline that will use it."><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="priya-laptop" /></Field>
        <Field label="Lasts"><Select value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={30}>30 days</option><option value={90}>90 days</option><option value={180}>180 days</option><option value={365}>1 year</option></Select></Field>
        <fieldset><legend className="text-[13px] font-medium text-text-primary mb-2">It can</legend>{(Object.keys(SCOPE_LABEL) as KeyScope[]).map((s) => <label key={s} className="flex items-center gap-2.5 text-sm py-1"><input type="checkbox" className="h-4 w-4 accent-[#02F5A1]" checked={scopes.includes(s)} onChange={() => setScopes(scopes.includes(s) ? scopes.filter((x) => x !== s) : [...scopes, s])} />{SCOPE_LABEL[s]}</label>)}</fieldset>
        {err && <Notice tone="bad">{err}</Notice>}
      </div>
    </Modal>
  );
}
function MachineModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { keys } = useCrucible(); const role = useRole(); const active = keys.filter((k) => k.projectId === projectId && !k.revokedAt);
  const [name, setName] = useState(""); const [kind, setKind] = useState<MachineKind>("laptop"); const [keyId, setKeyId] = useState(active[0]?.id ?? ""); const [err, setErr] = useState<string | null>(null);
  const go = () => { const r = crucible.addMachine(role, projectId, keyId, name.trim(), kind); if (!r.ok) { setErr(r.error); return; } toast(`Waiting for ${r.value.name}`); onClose(); };
  return (
    <Modal open onClose={onClose} title="Register a machine" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={go}>Register</Button></>}>
      <div className="space-y-4">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="gpu-box-3" /></Field>
        <Field label="Kind"><Select value={kind} onChange={(e) => setKind(e.target.value as MachineKind)}>{(Object.keys(MACHINE_LABEL) as MachineKind[]).map((k) => <option key={k} value={k}>{MACHINE_LABEL[k]}</option>)}</Select></Field>
        <Field label="Key it will use">{active.length ? <Select value={keyId} onChange={(e) => setKeyId(e.target.value)}>{active.map((k) => <option key={k.id} value={k.id}>{k.name} ({k.prefix}...)</option>)}</Select> : <p className="text-sm text-text-secondary">Make a key first.</p>}</Field>
        {err && <Notice tone="bad">{err}</Notice>}
      </div>
    </Modal>
  );
}
