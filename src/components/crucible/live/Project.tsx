"use client";

import Link from "next/link";
import { use, useState } from "react";
import { ChevronLeft, FlaskConical, KeyRound, Plus, Server } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select } from "@/components/ui/Form";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { CodeBlock, Confirm, Kpi, Modal, Notice, Tabs } from "@/components/mlops/ui";
import { crucibleDriver, useCrucibleLive } from "@/lib/crucible/live/store";
import type { KeyScope, MachineKind } from "@/lib/crucible/live/types";
import { toast } from "@/lib/mlops/toast";
import { Allowed, SCOPE_LABEL, TokenDialog, person, when } from "./bits";
import { useRead } from "./hooks";

type Tab = "experiments" | "keys" | "machines" | "connect";
const KIND_LABEL: Record<string, string> = { laptop: "Laptop", workstation: "GPU workstation", notebook: "Notebook server", ci: "CI runner", cluster: "Cluster job" };
const STATE_TONE = { pending: "neutral", online: "healthy", idle: "degraded", revoked: "down" } as const;

export function LiveProject({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { projects, stores, experiments } = useCrucibleLive();
  const row = projects.find((p) => p.project.id === id);
  const [tab, setTab] = useState<Tab>("experiments");
  const [store, setStore] = useState(false);
  if (!row) return <EmptyState icon={FlaskConical} title="Project not found" description="It may have been removed, or you may not have access to it." />;
  const p = row.project; const s = stores.find((x) => x.id === p.storeId);
  return (
    <div className="space-y-6">
      <div>
        <Link href="/crucible/projects" className="inline-flex items-center gap-1 text-[13px] text-text-secondary hover:text-text-primary mb-2"><ChevronLeft size={14} /> Projects</Link>
        <h1 className="text-xl font-semibold text-text-primary tracking-tight">{p.name}</h1>
        <p className="text-sm text-text-secondary mt-1 max-w-2xl">{p.description || "No description."}</p>
        <p className="text-xs text-text-tertiary mt-1.5">{p.id} · created {when(p.createdAt)} by {person(p.createdBy)}</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Experiments" value={row.experiments} /><Kpi label="Active keys" value={row.activeKeys} /><Kpi label="Machines" value={row.machines} />
        <Kpi label="Artifacts go to" value={s?.name ?? "Store removed"} sub={s ? <button className="underline underline-offset-2" onClick={() => setStore(true)}>Change store</button> : <button className="underline underline-offset-2" onClick={() => setStore(true)}>Choose a store</button>} tone={s ? undefined : "bad"} />
      </div>
      <Card className="p-5">
        <dl className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3 text-sm">
          <div><dt className="text-xs text-text-tertiary">Repository</dt><dd className="font-code text-xs break-all mt-0.5">{p.repoUrl || "None"}</dd></div>
          <div><dt className="text-xs text-text-tertiary">Branch and path</dt><dd className="mt-0.5">{p.branch}{p.path ? ` / ${p.path}` : ""}</dd></div>
          <div><dt className="text-xs text-text-tertiary">Environment</dt><dd className="mt-0.5">Python {p.python}, {p.envTool}{p.lockfile ? `, ${p.lockfile}` : ""}</dd></div>
          <div><dt className="text-xs text-text-tertiary">Starts with</dt><dd className="font-code text-xs mt-0.5">{p.entry}</dd></div>
        </dl>
      </Card>
      <Tabs<Tab> label="Project views" value={tab} onChange={setTab} tabs={[{ id: "experiments", label: "Experiments", count: row.experiments }, { id: "keys", label: "Keys", count: row.activeKeys }, { id: "machines", label: "Machines", count: row.machines }, { id: "connect", label: "Connect" }]} />
      {tab === "experiments" && <ExperimentsTab projectId={id} list={experiments.filter((e) => e.projectId === id)} />}
      {tab === "keys" && <KeysTab projectId={id} />}
      {tab === "machines" && <MachinesTab projectId={id} />}
      {tab === "connect" && <ConnectTab projectName={p.name} experimentId={experiments.find((e) => e.projectId === id)?.id} />}
      {store && <ChangeStore projectId={id} current={p.storeId} onClose={() => setStore(false)} />}
    </div>
  );
}

function ChangeStore({ projectId, current, onClose }: { projectId: string; current: string; onClose: () => void }) {
  const { stores } = useCrucibleLive(); const [to, setTo] = useState(current); const [err, setErr] = useState<string | null>(null);
  const save = async () => { const r = await crucibleDriver().setProjectStore(projectId, to); if (!r.ok) { setErr(r.error); return; } toast("Artifact store changed"); onClose(); };
  return (
    <Modal open onClose={onClose} title="Artifact store" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} disabled={to === current}>Use this store</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">New artifacts go to the chosen store. Artifacts of earlier runs stay where they were written.</p>
        <Field label="Store"><Select value={to} onChange={(e) => setTo(e.target.value)}>{stores.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.status})</option>)}</Select></Field>
        {err && <Notice tone="bad">{err}</Notice>}
      </div>
    </Modal>
  );
}

function ExperimentsTab({ projectId, list }: { projectId: string; list: ReturnType<typeof useCrucibleLive>["experiments"] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Allowed need="edit" onClick={() => setOpen(true)}><Plus size={14} /> New experiment</Allowed></div>
      {list.length === 0 ? <Card><EmptyState icon={FlaskConical} title="No experiments yet" description="An experiment groups the runs that try to solve one problem. Create one, then log runs into it." /></Card> : (
        <Card className="overflow-hidden"><Table><Thead><tr><Th>Experiment</Th><Th>Task</Th><Th>Tags</Th><Th>Created</Th></tr></Thead><tbody>
          {list.map((e) => <Tr key={e.id}><Td><Link href={`/crucible/experiments/${e.id}`} className="font-medium text-text-primary hover:underline">{e.name}</Link><div className="text-xs text-text-tertiary">{e.description || e.id}</div></Td><Td className="text-text-secondary">{e.task || "Not set"}</Td><Td><span className="flex flex-wrap gap-1">{e.tags.map((t) => <Badge key={t} tone="neutral">{t}</Badge>)}</span></Td><Td className="text-text-secondary">{when(e.createdAt)}</Td></Tr>)}
        </tbody></Table></Card>
      )}
      {open && <NewExperiment projectId={projectId} onClose={() => setOpen(false)} />}
    </div>
  );
}

function NewExperiment({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [d, setD] = useState({ name: "", description: "", task: "", department: "", tags: "" }); const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    const r = await crucibleDriver().createExperiment(projectId, { name: d.name.trim(), description: d.description, task: d.task, owner: "", department: d.department, tags: d.tags.split(",").map((t) => t.trim()).filter(Boolean) });
    if (!r.ok) { setErr(r.error); return; } toast(`Created experiment ${r.experiment.name}`); onClose();
  };
  return (
    <Modal open onClose={onClose} title="New experiment" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} disabled={!d.name.trim()}>Create</Button></>}>
      <div className="space-y-4">
        <Field label="Name" hint="Unique in the project. Letters, digits, spaces, dots, hyphens and underscores."><Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="baseline" /></Field>
        <Field label="Description"><Input value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Task" hint="For example classification."><Input value={d.task} onChange={(e) => setD({ ...d, task: e.target.value })} /></Field>
          <Field label="Department"><Input value={d.department} onChange={(e) => setD({ ...d, department: e.target.value })} /></Field>
        </div>
        <Field label="Tags" hint="Separated by commas."><Input value={d.tags} onChange={(e) => setD({ ...d, tags: e.target.value })} /></Field>
        {err && <Notice tone="bad">{err}</Notice>}
      </div>
    </Modal>
  );
}

function KeysTab({ projectId }: { projectId: string }) {
  const { data, error, loading, reload } = useRead(() => crucibleDriver().keys(projectId), [projectId]);
  const [open, setOpen] = useState(false); const [token, setToken] = useState<{ token: string; name: string } | null>(null);
  const [revoke, setRevoke] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const rotate = async (keyId: string) => { setErr(null); const r = await crucibleDriver().rotateKey(projectId, keyId); if (!r.ok) { setErr(r.error); return; } setToken({ token: r.issued.token, name: r.issued.key.name }); reload(); };
  const doRevoke = async () => { const r = await crucibleDriver().revokeKey(projectId, revoke!); setRevoke(null); if (!r.ok) { setErr(r.error); return; } toast("Key revoked"); reload(); };
  const keys = data?.keys ?? [];
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Allowed need="connection_create" onClick={() => setOpen(true)}><Plus size={14} /> New key</Allowed></div>
      {err && <Notice tone="bad">{err}</Notice>}
      {error && <Notice tone="bad" title="Could not load the keys">{error}</Notice>}
      {!loading && keys.length === 0 && !error ? <Card><EmptyState icon={KeyRound} title="No keys yet" description="A key lets one machine or pipeline log runs to this project. Make one, copy it once, and give it to the SDK." /></Card> : (
        <Card className="overflow-hidden"><Table><Thead><tr><Th>Key</Th><Th>Allows</Th><Th>Status</Th><Th>Expires</Th><Th>Last used</Th><Th className="text-right">Actions</Th></tr></Thead><tbody>
          {keys.map((k) => <Tr key={k.id}>
            <Td><span className="font-medium text-text-primary">{k.name}</span><div className="font-code text-xs text-text-tertiary">{k.prefix}</div></Td>
            <Td><span className="flex flex-wrap gap-1">{k.scopes.map((s) => <Badge key={s} tone="neutral">{SCOPE_LABEL[s] ?? s}</Badge>)}</span></Td>
            <Td><Badge tone={k.status === "active" ? "healthy" : k.status === "rotating" ? "degraded" : "down"}>{k.status}</Badge></Td>
            <Td className="text-text-secondary">{when(k.expiresAt)}</Td><Td className="text-text-secondary">{when(k.lastUsedAt)}</Td>
            <Td className="text-right"><span className="inline-flex gap-1.5">
              {k.status !== "revoked" && <Allowed need="connection_rotate" onClick={() => rotate(k.id)}>Rotate</Allowed>}
              {k.status !== "revoked" && <Allowed need="connection_delete" onClick={() => setRevoke(k.id)}>Revoke</Allowed>}
            </span></Td>
          </Tr>)}
        </tbody></Table></Card>
      )}
      <p className="text-xs text-text-tertiary">Rotating issues a new key and keeps the old one working for 24 hours, so a running job is not cut off.</p>
      {open && <NewKey projectId={projectId} onClose={() => setOpen(false)} onIssued={(t, n) => { setOpen(false); setToken({ token: t, name: n }); reload(); }} />}
      <TokenDialog token={token?.token ?? null} name={token?.name ?? ""} onClose={() => setToken(null)} />
      <Confirm open={revoke !== null} onClose={() => setRevoke(null)} onConfirm={doRevoke} title="Revoke this key" confirmLabel="Revoke key" danger
        body={<p className="text-sm">Every machine enrolled with this key stops being able to log at once. This cannot be undone. Make a new key to connect again.</p>} />
    </div>
  );
}

function NewKey({ projectId, onClose, onIssued }: { projectId: string; onClose: () => void; onIssued: (token: string, name: string) => void }) {
  const [name, setName] = useState(""); const [scopes, setScopes] = useState<KeyScope[]>(["log", "read"]); const [days, setDays] = useState(90); const [err, setErr] = useState<string | null>(null);
  const toggle = (s: KeyScope) => setScopes(scopes.includes(s) ? scopes.filter((x) => x !== s) : [...scopes, s]);
  const save = async () => { const r = await crucibleDriver().issueKey(projectId, name.trim(), scopes, days); if (!r.ok) { setErr(r.error); return; } onIssued(r.issued.token, r.issued.key.name); };
  return (
    <Modal open onClose={onClose} title="New key" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} disabled={!name.trim() || scopes.length === 0}>Create key</Button></>}>
      <div className="space-y-4">
        <Field label="Name" hint="Say where it will be used, for example priya-laptop or ci-training."><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <fieldset><legend className="text-[13px] font-medium text-text-primary mb-1.5">Allows</legend>
          {(Object.keys(SCOPE_LABEL) as KeyScope[]).map((s) => <label key={s} className="flex items-center gap-2 text-sm py-1"><input type="checkbox" checked={scopes.includes(s)} onChange={() => toggle(s)} /> {SCOPE_LABEL[s]}</label>)}
        </fieldset>
        <Field label="Lasts (days)" hint="1 to 365."><Input type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value))} /></Field>
        {err && <Notice tone="bad">{err}</Notice>}
      </div>
    </Modal>
  );
}

function MachinesTab({ projectId }: { projectId: string }) {
  const { data, error, loading, reload } = useRead(() => crucibleDriver().machines(projectId), [projectId]);
  const [open, setOpen] = useState(false); const [revoke, setRevoke] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const doRevoke = async () => { const r = await crucibleDriver().revokeMachine(projectId, revoke!); setRevoke(null); if (!r.ok) { setErr(r.error); return; } toast("Machine revoked"); reload(); };
  const rows = data?.machines ?? [];
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Allowed need="machine_enroll" onClick={() => setOpen(true)}><Plus size={14} /> Enrol a machine</Allowed></div>
      {err && <Notice tone="bad">{err}</Notice>}
      {error && <Notice tone="bad" title="Could not load the machines">{error}</Notice>}
      {!loading && rows.length === 0 && !error ? <Card><EmptyState icon={Server} title="No machines yet" description="Enrol the laptop, workstation or CI runner that will train. It shows as pending until its first heartbeat." /></Card> : (
        <Card className="overflow-hidden"><Table><Thead><tr><Th>Machine</Th><Th>Kind</Th><Th>State</Th><Th>Software</Th><Th>Runs logged</Th><Th className="text-right">Actions</Th></tr></Thead><tbody>
          {rows.map(({ machine: m, state }) => <Tr key={m.id}>
            <Td><span className="font-medium text-text-primary">{m.name}</span><div className="text-xs text-text-tertiary">{m.user ? `${m.user} · ` : ""}{m.ip || "Waiting for first contact"}</div></Td>
            <Td className="text-text-secondary">{KIND_LABEL[m.kind] ?? m.kind}</Td><Td><Badge tone={STATE_TONE[state]}>{state}</Badge></Td>
            <Td className="text-text-secondary">{m.os || "Not reported yet"}<div className="text-xs text-text-tertiary">{m.python ? `Python ${m.python}` : ""}{m.sdk ? ` · SDK ${m.sdk}` : ""}</div></Td>
            <Td className="tabular-nums text-text-secondary">{m.runsLogged}</Td>
            <Td className="text-right">{state !== "revoked" && <Allowed need="machine_revoke" onClick={() => setRevoke(m.id)}>Revoke</Allowed>}</Td>
          </Tr>)}
        </tbody></Table></Card>
      )}
      {open && <EnrolMachine projectId={projectId} onClose={() => setOpen(false)} onDone={() => { setOpen(false); reload(); }} />}
      <Confirm open={revoke !== null} onClose={() => setRevoke(null)} onConfirm={doRevoke} title="Revoke this machine" confirmLabel="Revoke machine" danger body={<p className="text-sm">The machine can no longer start runs. Runs it already logged stay.</p>} />
    </div>
  );
}

function EnrolMachine({ projectId, onClose, onDone }: { projectId: string; onClose: () => void; onDone: () => void }) {
  const { data } = useRead(() => crucibleDriver().keys(projectId), [projectId]);
  const keys = (data?.keys ?? []).filter((k) => k.status !== "revoked");
  const [d, setD] = useState({ name: "", kind: "workstation" as MachineKind, keyId: "" }); const [err, setErr] = useState<string | null>(null);
  const keyId = d.keyId || keys[0]?.id || "";
  const save = async () => { const r = await crucibleDriver().enrollMachine(projectId, { ...d, keyId }); if (!r.ok) { setErr(r.error); return; } toast(`Waiting for ${d.name} to connect`); onDone(); };
  return (
    <Modal open onClose={onClose} title="Enrol a machine" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} disabled={!d.name.trim() || !keyId}>Enrol</Button></>}>
      <div className="space-y-4">
        <Field label="Name" hint="For example gpu-box-7."><Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kind"><Select value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as MachineKind })}>{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Key it will use"><Select value={keyId} onChange={(e) => setD({ ...d, keyId: e.target.value })}>{keys.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</Select></Field>
        </div>
        {keys.length === 0 && <Notice tone="warn">Make a key first. A machine logs with a key.</Notice>}
        {err && <Notice tone="bad">{err}</Notice>}
      </div>
    </Modal>
  );
}

function ConnectTab({ projectName, experimentId }: { projectName: string; experimentId?: string }) {
  const code = [
    `export CRUCIBLE_URL=<the address of your tok∑ner platform API>`,
    `export CRUCIBLE_API_KEY=<the key, read from your secret manager>`,
    ``,
    `# Start a run in an experiment of ${projectName}`,
    `curl -s -X POST "$CRUCIBLE_URL/v1/crucible/runs" \\`,
    `  -H "Authorization: Bearer $CRUCIBLE_API_KEY" -H "Content-Type: application/json" \\`,
    `  -d '{"experimentId": "${experimentId ?? "<experiment id>"}", "name": "first-run"}'`,
    ``,
    `# Log a batch of events. Each event has an id you choose, so sending a batch again does nothing twice.`,
    `curl -s -X POST "$CRUCIBLE_URL/v1/crucible/ingest/events" \\`,
    `  -H "Authorization: Bearer $CRUCIBLE_API_KEY" -H "Content-Type: application/json" \\`,
    `  -d '{"events": [{"id": "e1", "type": "log_param", "runId": "<run id>", "key": "lr", "value": 0.001}]}'`,
  ].join("\n");
  return (
    <div className="space-y-3">
      <Notice title="The Python SDK is not published yet">Until it is, a machine connects with plain HTTP calls to the same API the SDK will use. The key goes in the Authorization header and nowhere else.</Notice>
      <CodeBlock title="shell" code={code} />
    </div>
  );
}
