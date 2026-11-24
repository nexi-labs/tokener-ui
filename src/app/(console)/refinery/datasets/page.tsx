"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Database, FileUp, Layers, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Form";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Bar, ConnectorMark, ago, fmtBytes, fmtRows } from "@/components/refinery/bits";
import { AddDatasetModal } from "@/components/refinery/AddDatasetModal";
import { useRefinery, useRefineryStatus } from "@/lib/refinery/store";

export default function DatasetsPage() {
  const { datasets, connections } = useRefinery();
  const isLive = useRefineryStatus().mode === "live";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  useEffect(() => { if (new URLSearchParams(window.location.search).get("add")) setOpen(true); }, []);
  const rows = datasets.filter((d) => !q || `${d.name} ${d.description}`.toLowerCase().includes(q.toLowerCase()));
  const where = (d: (typeof datasets)[number]) => d.source.kind === "model" ? { label: `Built from ${d.source.spec.sources.length} table${d.source.spec.sources.length === 1 ? "" : "s"}`, mark: null } : d.source.kind === "upload" ? { label: `Uploaded file ${d.source.fileName}`, mark: null } : d.source.kind === "documents" ? { label: `Documents in ${d.source.folder}`, mark: null } : { label: `${connections.find((c) => c.id === (d.source as { connectionId: string }).connectionId)?.name ?? "removed connection"}`, mark: connections.find((c) => c.id === (d.source as { connectionId: string }).connectionId)?.connector ?? null };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div><h2 className="text-lg font-semibold tracking-tight">Datasets</h2><p className="text-sm text-text-secondary mt-1 max-w-2xl">Data Refinery can read: files you upload, tables, paths and topics behind a connection, and saved queries. Each has a schema and a profile, and every change makes a new version.</p></div>
        <div className="flex flex-wrap gap-2"><Link href="/refinery/datasets/build"><Button variant="secondary"><Layers size={15} /> Build from several tables</Button></Link><Button variant="primary" onClick={() => setOpen(true)}><Plus size={15} /> Add dataset</Button></div>
      </div>
      <div className="relative max-w-sm"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" /><Input aria-label="Search datasets" placeholder="Search datasets" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <Card>
        <Table>
          <Thead><tr><Th>Dataset</Th><Th>From</Th><Th>Rows</Th><Th>Size</Th><Th>Quality</Th><Th>Version</Th><Th>Updated</Th></tr></Thead>
          <tbody>
            {rows.map((d) => { const w = where(d); return (
              <Tr key={d.id} className="cursor-pointer" onClick={() => router.push(`/refinery/datasets/${d.id}`)}>
                <Td><div className="flex items-center gap-3">{w.mark ? <ConnectorMark id={w.mark} /> : <div className="h-9 w-9 rounded-md bg-surface-muted grid place-items-center shrink-0"><FileUp size={17} className="text-text-secondary" /></div>}<div className="min-w-0"><Link href={`/refinery/datasets/${d.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{d.name}</Link><div className="text-xs text-text-tertiary">{d.format.toUpperCase()}, {d.columns.length} columns</div></div></div></Td>
                <Td className="text-[13px] text-text-secondary max-w-[220px]"><div className="truncate">{w.label}</div></Td>
                <Td className="tabular-nums">{fmtRows(d.totalRows)}</Td>
                <Td className="tabular-nums">{fmtBytes(d.sizeBytes)}</Td>
                <Td><div className="flex items-center gap-2 w-28"><span className="tabular-nums text-[13px] font-medium w-6">{d.profile.quality}</span><Bar value={d.profile.quality} className="flex-1" tone={d.profile.quality >= 90 ? "var(--chart-s3)" : d.profile.quality >= 75 ? "var(--chart-s2)" : "#c0392b"} /></div></Td>
                <Td className="tabular-nums">v{d.version}</Td>
                <Td className="text-[13px] text-text-secondary">{ago(d.updatedAt)}<div className="text-xs text-text-tertiary">{d.owner}</div></Td>
              </Tr>); })}
            {rows.length === 0 && <Tr><Td colSpan={7} className="text-center text-text-secondary py-12"><Database size={20} className="mx-auto mb-2 text-text-tertiary" />{q ? "No dataset matches your search." : "No datasets yet. Upload a file or add a table from a connection."}</Td></Tr>}
          </tbody>
        </Table>
      </Card>
      <AddDatasetModal open={open} onClose={() => setOpen(false)} onCreated={(d) => router.push(`/refinery/datasets/${d.id}`)} />
    </div>
  );
}
