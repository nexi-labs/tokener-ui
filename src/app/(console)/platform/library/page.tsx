"use client";

import { Library, Upload } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { UploadHistory } from "@/components/mlops/UploadHistory";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Confirm, fmtMb, relTime } from "@/components/mlops/ui";
import { UploadModelDrawer } from "@/components/mlops/UploadModel";
import { mlops, useMlops } from "@/lib/mlops/store";
import { toast } from "@/lib/mlops/toast";

/**
 * Where platform operators publish models for every organization. Uploads go through the same scan as customer uploads and need no approval
 * step. Withdrawing a version stops new imports. Organizations that already imported it keep working.
 */
export default function ModelLibraryAdminPage() {
  const s = useMlops();
  const live = useAuth().status === "session";
  const [upload, setUpload] = useState(false);
  const [withdraw, setWithdraw] = useState<{ id: string; version: number; name: string } | null>(null);
  if (!s) return null;
  const imports = s.library.reduce((a, l) => a + l.versions.reduce((b, v) => b + v.imports, 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader title="Model library" description="Publish models every organization can import into its own registry. Weights are stored once and shared. Imports cannot alter them."
        action={<Button variant="primary" onClick={() => setUpload(true)}><Upload size={15} /> Publish a model</Button>} />
      <div className="grid grid-cols-3 gap-3 max-w-xl">
        <Stat label="Models" value={s.library.length} />
        <Stat label="Live versions" value={s.library.reduce((a, l) => a + l.versions.filter((v) => !v.withdrawn).length, 0)} />
        <Stat label="Imports" value={imports} />
      </div>
      <Card>
        <CardHeader title="Published models" subtitle="Newest version first" />
        {s.library.length === 0 ? <EmptyState icon={Library} title="Nothing published" description="Publish a model to make it available to every organization." /> : (
          <Table>
            <Thead><tr><Th>Model</Th><Th>Version</Th><Th>Format and size</Th><Th>Scan</Th><Th>Imports</Th><Th><span className="sr-only">Actions</span></Th></tr></Thead>
            <tbody>
              {s.library.flatMap((l) => l.versions.map((v) => (
                <Tr key={`${l.id}-${v.version}`}>
                  <Td><div className="font-medium whitespace-nowrap">{l.name}</div><div className="text-xs text-text-tertiary">{l.task} · {v.license} · published {relTime(v.createdAt)}</div></Td>
                  <Td className="whitespace-nowrap">v{v.version} {v.withdrawn && <Badge tone="neutral">withdrawn</Badge>}</Td>
                  <Td className="text-text-secondary whitespace-nowrap">{v.format} · <span className="tabular-nums">{fmtMb(v.sizeMb)}</span></Td>
                  <Td><Badge tone={v.scan?.verdict === "clean" ? "healthy" : v.scan?.verdict === "warnings" ? "degraded" : "down"}>{v.scan?.verdict ?? "n/a"}</Badge></Td>
                  <Td className="tabular-nums">{v.imports}</Td>
                  <Td className="text-right">{!v.withdrawn && <Button variant="ghost" onClick={() => setWithdraw({ id: l.id, version: v.version, name: l.name })}>Withdraw</Button>}</Td>
                </Tr>
              )))}
            </tbody>
          </Table>
        )}
      </Card>
      <UploadHistory library sample={!live} />

      <UploadModelDrawer open={upload} onClose={() => setUpload(false)} title="Publish a model" subtitle="Scanned like any upload, then available to every organization. No approval step."
        submitLabel="Publish model" onSubmit={async (i) => { const r = await mlops.publishLibraryModel(i); if (r.ok) toast(`${i.name} v${r.version} published to the library`); return r.ok ? { ok: true } : { ok: false, error: r.error }; }} />
      <Confirm open={!!withdraw} onClose={() => setWithdraw(null)} danger confirmLabel="Withdraw version" title={withdraw ? `Withdraw ${withdraw.name} v${withdraw.version}` : ""}
        body={<p>Nobody can import this version again. Organizations that already imported it keep working. This cannot be undone.</p>}
        onConfirm={async () => { const r = await mlops.withdrawLibraryVersion(withdraw!.id, withdraw!.version); r.ok ? toast("Version withdrawn") : toast(r.error, "error"); }} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface border border-border rounded-lg shadow-card px-4 py-3">
      <div className="text-xs text-text-tertiary">{label}</div>
      <div className="text-2xl font-semibold tracking-tight mt-1 tabular-nums">{value}</div>
    </div>
  );
}
