"use client";

import Link from "next/link";
import { useState } from "react";
import { Library, Package, Upload } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { DemoTag, GuardButton, Modal, Notice, relTime, fmtMb, useRole } from "@/components/mlops/ui";
import { UploadModelDrawer } from "@/components/mlops/UploadModel";
import { mlops, useMlops } from "@/lib/mlops/store";
import { toast } from "@/lib/mlops/toast";

export default function ModelsPage() {
  const s = useMlops()!;
  const role = useRole();
  const [upload, setUpload] = useState(false);
  const [lib, setLib] = useState(false);
  return (
    <div className="space-y-5">
      <PageHeader title="Model artifacts" description="Versioned models with provenance, checksums, evaluation metadata and approvals. Upload your own trained model, import one from the platform library, or register one from a pipeline."
        action={
          <div className="flex gap-2">
            <GuardButton action="model.register" role={role} onClick={() => setLib(true)}><Library size={15} /> Import from library</GuardButton>
            <GuardButton action="model.register" role={role} variant="primary" onClick={() => setUpload(true)}><Upload size={15} /> Upload model</GuardButton>
          </div>
        } />
      <Card>
        {s.models.length === 0 ? <EmptyState icon={Package} title="No models registered" description="Upload a model file, import one from the platform library or register one from a pipeline." /> : (
          <Table>
            <Thead><tr><Th>Model</Th><Th>Task</Th><Th>Staging</Th><Th>Production</Th><Th>Versions</Th><Th>Approvals</Th><Th>Updated</Th></tr></Thead>
            <tbody>
              {s.models.map((m) => {
                const stg = m.versions.find((v) => v.stage === "staging"), prod = m.versions.find((v) => v.stage === "production");
                const pending = m.versions.filter((v) => v.approval.state === "pending").length;
                return (
                  <Tr key={m.id}>
                    <Td><Link href={`/mlops/models/${m.id}`} className="font-medium hover:underline">{m.name}</Link> <DemoTag /></Td>
                    <Td className="text-text-secondary">{m.task}</Td>
                    <Td>{stg ? `v${stg.version}` : <span className="text-text-tertiary">none</span>}</Td>
                    <Td>{prod ? `v${prod.version}` : <span className="text-text-tertiary">none</span>}</Td>
                    <Td className="tabular-nums">{m.versions.length}</Td>
                    <Td>{pending ? <Badge tone="degraded">{pending} pending</Badge> : <Badge tone="healthy">Clear</Badge>}</Td>
                    <Td className="text-text-secondary">{relTime(m.versions[0].createdAt)}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <UploadModelDrawer open={upload} onClose={() => setUpload(false)} title="Upload a model" subtitle="Your own trained model. It joins your registry as a new version and waits for approval."
        submitLabel="Upload model" onSubmit={async (i) => { const r = await mlops.uploadModel(i); if (r.ok) toast(`${i.name} v${r.version} uploaded. Waiting for approval.`); return r.ok ? { ok: true } : { ok: false, error: r.error }; }} />
      <ImportModal open={lib} onClose={() => setLib(false)} />
    </div>
  );
}

function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useMlops()!;
  const [pick, setPick] = useState<{ id: string; version: number } | null>(null);
  const [asName, setAsName] = useState("");
  const [err, setErr] = useState("");
  const chosen = pick ? s.library.find((l) => l.id === pick.id) : null;
  function close() { setPick(null); setAsName(""); setErr(""); onClose(); }
  return (
    <Modal open={open} onClose={close} wide title="Import from the platform library"
      footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button variant="primary" disabled={!pick} onClick={async () => {
        const r = await mlops.importFromLibrary(pick!.id, pick!.version, asName);
        if (!r.ok) setErr(r.error); else { toast(`Imported as ${r.modelId} v${r.version}. Waiting for approval.`); close(); }
      }}>Import version</Button></>}>
      <div className="space-y-4">
        <p className="text-text-secondary">Models published by the platform team. An import points at the shared weights, so it uses no storage and cannot be altered. It still goes through your approval process.</p>
        <div className="divide-y divide-border rounded-md border border-border">
          {s.library.map((l) => (
            <div key={l.id} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3"><div className="font-medium text-text-primary">{l.name}</div><div className="text-xs text-text-tertiary">{l.task}</div></div>
              <div className="text-[13px] text-text-secondary mt-0.5">{l.description}</div>
              <div className="flex flex-wrap gap-2 mt-2.5">
                {l.versions.map((v) => {
                  const on = pick?.id === l.id && pick.version === v.version;
                  return (
                    <button key={v.version} disabled={v.withdrawn} onClick={() => { setPick({ id: l.id, version: v.version }); setAsName(l.name); setErr(""); }} aria-pressed={on}
                      className={`h-8 px-3 rounded-md border text-[13px] ${on ? "border-accent-600 bg-accent-500/10 text-text-primary" : "border-border-strong text-text-secondary hover:bg-surface-muted"} ${v.withdrawn ? "opacity-50 line-through cursor-not-allowed" : ""}`}>
                      v{v.version} · {v.format} · {fmtMb(v.sizeMb)}{v.withdrawn ? " · withdrawn" : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {chosen && pick && (
          <div className="space-y-3">
            <Field label="Name in your registry" hint="An existing name adds a new version to it."><Input value={asName} onChange={(e) => setAsName(e.target.value)} /></Field>
            {chosen.versions.find((v) => v.version === pick.version)?.scan?.verdict === "warnings" && (
              <Notice tone="warn" title="License note">{chosen.versions.find((v) => v.version === pick.version)!.scan!.findings.filter((f) => f.level === "warn").map((f) => f.message).join(" ")}</Notice>
            )}
          </div>
        )}
        {err && <Notice tone="bad">{err}</Notice>}
      </div>
    </Modal>
  );
}
