"use client";

import Link from "next/link";
import { useState } from "react";
import { FolderGit2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Kpi, Modal, Notice } from "@/components/mlops/ui";
import { crucibleDriver, useCrucibleLive } from "@/lib/crucible/live/store";
import { toast } from "@/lib/mlops/toast";
import { Allowed, STORE_LABEL, person, when } from "./bits";

export function LiveProjects() {
  const { projects, stores } = useCrucibleLive(); const [open, setOpen] = useState(false);
  const keys = projects.reduce((n, p) => n + p.activeKeys, 0), machines = projects.reduce((n, p) => n + p.machines, 0);
  return (
    <div className="space-y-6">
      <PageHeader title="Projects" description="A project is a code repository that trains models. Connect it once with a key, and every run it logs shows up here with its data, code and artifacts."
        action={<Allowed need="settings" variant="primary" onClick={() => setOpen(true)}><Plus size={14} /> New project</Allowed>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Projects" value={projects.length} /><Kpi label="Experiments" value={projects.reduce((n, p) => n + p.experiments, 0)} />
        <Kpi label="Active keys" value={keys} /><Kpi label="Machines enrolled" value={machines} />
      </div>
      {projects.length === 0 ? (
        <Card><EmptyState icon={FolderGit2} title="No projects yet" description={stores.length === 0 ? "Add an artifact store on the Storage screen first, then create a project that writes to it." : "Create a project to get a key and start logging runs."} /></Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <Thead><tr><Th>Project</Th><Th>Repository</Th><Th>Environment</Th><Th>Artifacts go to</Th><Th>Keys and machines</Th><Th>Created</Th></tr></Thead>
            <tbody>
              {projects.map(({ project: p, experiments, activeKeys, machines: m }) => { const s = stores.find((x) => x.id === p.storeId); return (
                <Tr key={p.id}>
                  <Td><Link href={`/crucible/projects/${p.id}`} className="font-medium text-text-primary hover:underline">{p.name}</Link><div className="text-xs text-text-tertiary">{p.department || "No department"} · {person(p.owner)} · {experiments} experiment{experiments === 1 ? "" : "s"}</div></Td>
                  <Td className="text-text-secondary"><span className="font-code text-xs">{p.repoUrl ? p.repoUrl.replace(/^https:\/\//, "") : "None yet"}</span><div className="text-xs text-text-tertiary">{p.branch}{p.path ? ` / ${p.path}` : ""}</div></Td>
                  <Td className="text-text-secondary">Python {p.python}<div className="text-xs text-text-tertiary">{p.envTool}{p.lockfile ? `, ${p.lockfile}` : ""}</div></Td>
                  <Td className="text-text-secondary">{s ? <>{s.name}<div className="text-xs text-text-tertiary">{STORE_LABEL[s.kind] ?? s.kind}</div></> : "Store removed"}</Td>
                  <Td><span className="inline-flex gap-1.5"><Badge tone={activeKeys ? "healthy" : "neutral"}>{activeKeys} key{activeKeys === 1 ? "" : "s"}</Badge><Badge tone="neutral">{m} machine{m === 1 ? "" : "s"}</Badge></span></Td>
                  <Td className="text-text-secondary">{when(p.createdAt)}</Td>
                </Tr>); })}
            </tbody>
          </Table>
        </Card>
      )}
      {open && <NewProject onClose={() => setOpen(false)} />}
    </div>
  );
}

function NewProject({ onClose }: { onClose: () => void }) {
  const { stores } = useCrucibleLive();
  const [d, setD] = useState({ name: "", description: "", department: "", storeId: stores.find((s) => s.isDefault)?.id ?? stores[0]?.id ?? "", repoUrl: "", branch: "main", path: "", python: "3.11", envTool: "uv", lockfile: "", entry: "train.py" });
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const up = (k: keyof typeof d) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setD({ ...d, [k]: e.target.value });
  const save = async () => {
    setBusy(true); setErr(null);
    const r = await crucibleDriver().createProject(d); setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    toast(`Created project ${r.project.name}`); onClose();
  };
  return (
    <Modal open onClose={onClose} title="New project" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} disabled={busy || !d.name || !d.storeId}>{busy ? "Creating" : "Create project"}</Button></>}>
      <div className="space-y-4">
        {stores.length === 0 && <Notice tone="warn" title="No artifact store">Add a store on the Storage screen first. A project needs somewhere to keep its artifacts.</Notice>}
        <Field label="Name" hint="3 to 41 lowercase letters, digits or hyphens."><Input value={d.name} onChange={up("name")} placeholder="fraud-scorer" /></Field>
        <Field label="Description"><Input value={d.description} onChange={up("description")} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Department"><Input value={d.department} onChange={up("department")} /></Field>
          <Field label="Artifacts go to"><Select value={d.storeId} onChange={up("storeId")}>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        </div>
        <Field label="Repository" hint="An https or git@ address. An address with credentials in it is refused."><Input value={d.repoUrl} onChange={up("repoUrl")} placeholder="https://github.com/acme/fraud" /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Branch"><Input value={d.branch} onChange={up("branch")} /></Field>
          <Field label="Python"><Select value={d.python} onChange={up("python")}>{["3.9", "3.10", "3.11", "3.12", "3.13"].map((v) => <option key={v}>{v}</option>)}</Select></Field>
          <Field label="Environment"><Select value={d.envTool} onChange={up("envTool")}>{["uv", "pip", "conda", "poetry", "docker"].map((v) => <option key={v}>{v}</option>)}</Select></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts with"><Input value={d.entry} onChange={up("entry")} /></Field>
          <Field label="Lockfile"><Input value={d.lockfile} onChange={up("lockfile")} placeholder="uv.lock" /></Field>
        </div>
        {err && <Notice tone="bad">{err}</Notice>}
      </div>
    </Modal>
  );
}
