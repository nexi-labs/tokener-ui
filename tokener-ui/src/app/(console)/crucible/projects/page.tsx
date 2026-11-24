"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { GuardButton, Kpi, Modal, Notice, useRole } from "@/components/mlops/ui";
import { crucible, useCrucible } from "@/lib/crucible/store";
import { STORE_LABEL, storeUri } from "@/lib/crucible/platform";
import { toast } from "@/lib/mlops/toast";
import { ago } from "@/lib/agents/format";
import { useRouter } from "next/navigation";

export default function Projects() {
  const { projects, machines, keys, stores, runs } = useCrucible(); const role = useRole(); const [open, setOpen] = useState(false);
  return (
    <div className="space-y-6">
      <PageHeader title="Projects" description="A project is a code repository that trains models, such as a Python ML project on a laptop or a GPU box. Connect it once with a key, and every run it logs shows up here with its parameters, metrics, data version, code commit and artifacts."
        action={<GuardButton action="settings.edit" role={role} variant="primary" onClick={() => setOpen(true)}><Plus size={14} /> New project</GuardButton>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Projects" value={projects.length} />
        <Kpi label="Machines online" value={machines.filter((m) => m.state === "online").length} sub={`${machines.filter((m) => m.state === "idle").length} idle`} />
        <Kpi label="Active keys" value={keys.filter((k) => !k.revokedAt).length} sub={`${keys.filter((k) => k.revokedAt).length} revoked`} />
        <Kpi label="Runs logged" value={runs.length} sub="Across all projects" />
      </div>
      <Card className="overflow-hidden">
        <Table>
          <Thead><tr><Th>Project</Th><Th>Repository</Th><Th>Environment</Th><Th>Artifacts go to</Th><Th>Machines</Th><Th>Created</Th></tr></Thead>
          <tbody>
            {projects.map((p) => { const s = stores.find((x) => x.id === p.storeId); const ms = machines.filter((m) => m.projectId === p.id && m.state !== "revoked"); return (
              <Tr key={p.id}>
                <Td><Link href={`/crucible/projects/${p.id}`} className="font-medium text-text-primary hover:underline">{p.name}</Link><div className="text-xs text-text-tertiary">{p.department} · {p.owner.split("@")[0].replace(".", " ")}</div></Td>
                <Td className="text-text-secondary"><span className="font-code text-xs">{p.repo.url ? p.repo.url.replace(/^https:\/\//, "") : "None yet"}</span><div className="text-xs text-text-tertiary">{p.repo.branch}</div></Td>
                <Td className="text-text-secondary">Python {p.python}<div className="text-xs text-text-tertiary">{p.envTool}, {p.lockfile}</div></Td>
                <Td className="text-text-secondary">{s ? <><span className="font-code text-xs">{storeUri(s)}</span><div className="text-xs text-text-tertiary">{STORE_LABEL[s.kind]}</div></> : "None"}</Td>
                <Td>{ms.length ? <span className="inline-flex items-center gap-1.5"><Badge tone={ms.some((m) => m.state === "online") ? "healthy" : "neutral"}>{ms.filter((m) => m.state === "online").length} online</Badge><span className="text-xs text-text-tertiary">of {ms.length}</span></span> : <span className="text-text-tertiary text-xs">None connected</span>}</Td>
                <Td className="text-text-secondary">{ago(p.createdAt)}</Td>
              </Tr>); })}
          </tbody>
        </Table>
      </Card>
      {open && <NewProject onClose={() => setOpen(false)} />}
    </div>
  );
}

function NewProject({ onClose }: { onClose: () => void }) {
  const { stores, experiments } = useCrucible(); const role = useRole(); const router = useRouter();
  const [f, setF] = useState({ name: "", description: "", storeId: stores.find((s) => s.isDefault)?.id ?? stores[0]?.id ?? "", repoUrl: "", branch: "main", entry: "train.py", python: "3.11", envTool: "uv" as "uv" | "pip" | "conda" | "poetry" | "docker", experimentId: "" });
  const [err, setErr] = useState<string | null>(null);
  const go = () => { const r = crucible.createProject(role, { ...f, experimentId: f.experimentId || undefined }); if (!r.ok) { setErr(r.error); return; } toast(`Created ${r.value.name}`); onClose(); router.push(`/crucible/projects/${r.value.id}`); };
  return (
    <Modal open onClose={onClose} wide title="New project" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={go}>Create project</Button></>}>
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Project name" hint="Lowercase letters, digits and hyphens."><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="churn-model" /></Field>
          <Field label="Artifacts are stored in"><Select value={f.storeId} onChange={(e) => setF({ ...f, storeId: e.target.value })}>{stores.map((s) => <option key={s.id} value={s.id}>{s.name} ({STORE_LABEL[s.kind]})</option>)}</Select></Field>
          <Field label="Repository" hint="An https or git@ address. Add credentials as a deploy key, never in the address."><Input value={f.repoUrl} onChange={(e) => setF({ ...f, repoUrl: e.target.value })} placeholder="https://github.com/your-org/churn-model" /></Field>
          <Field label="Branch"><Input value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })} /></Field>
          <Field label="Starts with" hint="A file or a command."><Input value={f.entry} onChange={(e) => setF({ ...f, entry: e.target.value })} /></Field>
          <Field label="Python"><Select value={f.python} onChange={(e) => setF({ ...f, python: e.target.value })}>{["3.9", "3.10", "3.11", "3.12", "3.13"].map((v) => <option key={v}>{v}</option>)}</Select></Field>
          <Field label="Environment tool"><Select value={f.envTool} onChange={(e) => setF({ ...f, envTool: e.target.value as typeof f.envTool })}><option value="uv">uv</option><option value="poetry">Poetry</option><option value="pip">pip</option><option value="conda">Conda</option><option value="docker">Docker image</option></Select></Field>
          <Field label="Group runs under an experiment"><Select value={f.experimentId} onChange={(e) => setF({ ...f, experimentId: e.target.value })}><option value="">Create one on the first run</option>{experiments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
        </div>
        <Field label="What it does"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        {err && <Notice tone="bad">{err}</Notice>}
      </div>
    </Modal>
  );
}
