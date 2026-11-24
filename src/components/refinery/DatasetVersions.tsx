"use client";

import { useCallback, useEffect, useState } from "react";
import { History, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Confirm, Notice } from "@/components/mlops/ui";
import { ago, fmtBytes, fmtRows } from "@/components/refinery/bits";
import { refinery } from "@/lib/refinery/store";
import { toast } from "@/lib/mlops/toast";
import type { DatasetVersionEntry } from "@/lib/refinery/types";

/** The stored versions of an uploaded dataset. Restoring one stores its file as the next version, so the history stays a straight line. */
export function DatasetVersions({ datasetId, canEdit }: { datasetId: string; canEdit: boolean }) {
  const [rows, setRows] = useState<DatasetVersionEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState<DatasetVersionEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const r = await refinery.datasetVersions(datasetId); if (r.ok) { setRows(r.versions); setErr(null); } else setErr(r.error); }, [datasetId]);
  useEffect(() => { void load(); }, [load]);

  const restore = async () => {
    if (!pick) return; setBusy(true);
    const r = await refinery.restoreDatasetVersion(datasetId, pick.version); setBusy(false);
    if (!r.ok) { toast(r.error, "error"); return; }
    toast(`Version ${pick.version} is current again as version ${r.dataset.version}`); setPick(null); await load();
  };

  if (err) return <Notice tone="bad" title="Versions could not be loaded">{err}</Notice>;
  if (!rows) return <p className="text-sm text-text-secondary">Loading versions.</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary max-w-3xl flex items-start gap-2"><History size={16} className="mt-0.5 shrink-0" />Each upload under this name is kept as a version, and the latest {10} are stored. Recipes keep reading the current version. Restoring an earlier version stores its file as a new version, so nothing is lost.</p>
      <Card>
        <Table>
          <Thead><tr><Th>Version</Th><Th>File</Th><Th>Rows</Th><Th>Size</Th><Th>Uploaded</Th><Th>Note</Th><Th className="w-28"> </Th></tr></Thead>
          <tbody>
            {rows.map((v) => (
              <Tr key={v.version}>
                <Td className="tabular-nums text-[13px] font-medium">v{v.version} {v.current && <Badge tone="healthy">Current</Badge>}</Td>
                <Td className="text-[13px]">{v.file}</Td>
                <Td className="text-[13px] tabular-nums">{fmtRows(v.rows)}</Td>
                <Td className="text-[13px] tabular-nums">{fmtBytes(v.bytes)}</Td>
                <Td className="text-[13px]">{ago(v.createdAt)}<div className="text-[11px] text-text-tertiary">{v.createdBy}</div></Td>
                <Td className="text-[13px] text-text-secondary">{v.note || ""}</Td>
                <Td>{!v.current && canEdit && <Button variant="secondary" onClick={() => setPick(v)}><Undo2 size={14} /> Restore</Button>}</Td>
              </Tr>
            ))}
            {rows.length === 0 && <Tr><Td colSpan={7} className="text-center text-text-secondary py-10">No versions are stored for this dataset.</Td></Tr>}
          </tbody>
        </Table>
      </Card>
      <Confirm open={!!pick} onClose={() => setPick(null)} onConfirm={restore} title={`Restore version ${pick?.version ?? ""}`} confirmLabel={busy ? "Restoring" : "Restore"}
        body={<>Version {pick?.version} ({pick ? fmtRows(pick.rows) : ""} rows, {pick?.file}) becomes the current data. It is stored as a new version, and the profile and sample are read again. Column roles you set carry over.</>} />
    </div>
  );
}
