"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Layers, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Form";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { DatasetVersions } from "@/components/refinery/DatasetVersions";
import { SensorQuality } from "@/components/refinery/SensorQuality";
import { DataSpace } from "@/components/refinery/DataSpace";
import { AgentAccess } from "@/components/refinery/AgentAccess";
import { SemanticLayer } from "@/components/refinery/SemanticLayer";
import { analyseSensors } from "@/lib/refinery/sensor";
import { Confirm, Drawer, KeyValue, Notice, Tabs } from "@/components/mlops/ui";
import { Bar, ConnectorMark, Histogram, QualityRing, Section, ago, fmtBytes, fmtInt, fmtRows } from "@/components/refinery/bits";
import { QUALITY_WEIGHTS } from "@/lib/refinery/profile";
import { refinery, useRefinery, useRefineryStatus } from "@/lib/refinery/store";
import { DataTable } from "@/components/refinery/DataTable";
import { LineageGraph } from "@/components/refinery/LineageGraph";
import { toast } from "@/lib/mlops/toast";
import type { ColRole, ColumnProfile } from "@/lib/refinery/types";

const ROLE: { value: ColRole; label: string }[] = [{ value: "feature", label: "Feature" }, { value: "label", label: "Label" }, { value: "identifier", label: "Identifier" }, { value: "ignore", label: "Ignore" }];
/** Personal data is masked in previews. A real workspace lets only roles allowed to see it lift the mask. */
function mask(col: ColumnProfile | undefined, v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  const s = String(v);
  if (!col?.pii) return s;
  if (col.pattern === "email" || /@/.test(s)) return s.replace(/^(.).*(@.*)$/, "$1•••$2");
  if (col.pattern === "phone") return s.replace(/\d(?=\d{2})/g, "•");
  return s.replace(/^(\S)\S*/g, "$1•••").replace(/\s(\S)\S*/g, " $1•••");
}

export default function DatasetPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { datasets, connections, recipes } = useRefinery();
  const d = datasets.find((x) => x.id === id);
  const [tab, setTab] = useState<"columns" | "preview" | "lineage" | "versions" | "sensors" | "agents" | "semantics" | "dataspace">("columns");
  const sensor = useMemo(() => (d ? analyseSensors(d.columns, d.sample) : null), [d]);
  useEffect(() => { if (new URLSearchParams(window.location.search).get("tab") === "lineage") setTab("lineage"); }, []);
  const [col, setCol] = useState<string | null>(null);
  const [del, setDel] = useState(false);
  const isLive = useRefineryStatus().mode === "live";
  const [loadErr, setLoadErr] = useState<string | null>(null);
  // A signed-in workspace lists datasets without their sample rows. Open this one's.
  useEffect(() => { if (!id) return; let on = true; refinery.openDataset(id).then((r) => { if (on) setLoadErr(r.ok ? null : r.error); }); return () => { on = false; }; }, [id]);
  if (!d) return <div className="space-y-3"><Link href="/refinery/datasets" className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary"><ArrowLeft size={13} /> Datasets</Link><Card><div className="p-10 text-center text-text-secondary">This dataset does not exist or was deleted.</div></Card></div>;

  const p = d.profile; const conn = d.source.kind === "upload" || d.source.kind === "model" ? null : connections.find((c) => c.id === (d.source as { connectionId: string }).connectionId);
  const cp = p.columns.find((c) => c.name === col);
  const pii = p.columns.filter((c) => c.pii);
  const usedBy = recipes.filter((r) => r.inputDatasetId === d.id);
  const sampled = p.sampled < p.totalRows;

  return (
    <div className="space-y-5">
      <Link href="/refinery/datasets" className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary"><ArrowLeft size={13} /> Datasets</Link>
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0">
          {conn && <ConnectorMark id={conn.connector} size={44} />}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold tracking-tight">{d.name}</h2><Badge tone="neutral">v{d.version}</Badge><Badge tone="info">{d.format.toUpperCase()}</Badge></div>
            <p className="text-sm text-text-secondary mt-1 max-w-2xl">{d.description}</p>
            <p className="text-xs text-text-tertiary mt-1.5">{d.source.kind === "model" ? `Built from ${d.source.spec.sources.length} table${d.source.spec.sources.length === 1 ? "" : "s"}: ${d.source.spec.sources.map((x) => datasets.find((y) => y.id === x.datasetId)?.name ?? "removed dataset").join(", ")}` : d.source.kind === "upload" ? `Uploaded file ${d.source.fileName}` : d.source.kind === "query" ? `Query on ${conn?.name}` : d.source.kind === "documents" ? `${d.source.files.toLocaleString("en-US")} files from ${d.source.folder}, extracted to one row per page` : `${conn?.name ?? "removed connection"}: ${d.source.location}`}. Updated {ago(d.updatedAt)} by {d.owner}.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button onClick={async () => { const r = await refinery.reprofileDataset(d.id); if (!r.ok) toast(r.error, "error"); else toast(isLive ? "Profile computed again" : "Profile refreshed on the sample"); }}><RefreshCw size={14} /> Refresh profile</Button>
          <Button onClick={() => setDel(true)}><Trash2 size={14} /> Delete</Button>
          <Button variant="primary" onClick={async () => { const r = await refinery.createRecipe(`${d.name.replace(/_/g, "-")}-clean`, d.id); if (!r.ok) { toast(r.error, "error"); return; } router.push(`/refinery/recipes/${r.recipe.id}`); }}><Layers size={15} /> Create recipe</Button>
        </div>
      </div>

      <div className="grid xl:grid-cols-[340px_1fr] gap-4">
        <Section title="Quality score" hint="A prompt to look, not a guarantee">
          <div className="flex items-center gap-4"><QualityRing value={p.quality} size={84} /><div className="text-xs text-text-secondary">Weighted from the four measures below. Weights are set per tenant.</div></div>
          <ul className="mt-4 space-y-3">
            {(["completeness", "uniqueness", "consistency", "validity"] as const).map((k) => (
              <li key={k}><div className="flex justify-between text-[12px]"><span className="capitalize">{k} <span className="text-text-tertiary">weight {QUALITY_WEIGHTS[k]}</span></span><span className="tabular-nums font-medium">{p.parts[k]}%</span></div><Bar value={p.parts[k]} className="mt-1" tone={p.parts[k] >= 95 ? "var(--chart-s3)" : p.parts[k] >= 85 ? "var(--chart-s2)" : "#c0392b"} /></li>
            ))}
          </ul>
        </Section>
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[["Rows", fmtRows(d.totalRows), sampled ? "estimated" : "exact"], ["Columns", String(d.columns.length), `${d.columns.filter((c) => c.role === "feature").length} features`], ["Size", fmtBytes(d.sizeBytes), d.format], ["Duplicate rows", fmtRows(p.duplicateRows), "identical rows, estimated"], ["Missing cells", `${(100 - p.completeness).toFixed(1)}%`, "of all cells"]].map(([l, v, s]) => (
              <div key={l} className="bg-surface border border-border rounded-lg shadow-card px-4 py-3.5"><div className="text-xs text-text-tertiary">{l}</div><div className="text-xl font-semibold tabular-nums mt-1">{v}</div><div className="text-xs text-text-secondary mt-0.5">{s}</div></div>
            ))}
          </div>
          <Notice tone="info">{sampled ? `Statistics were computed on ${fmtInt(p.sampled)} of ${fmtInt(p.totalRows)} rows. Counts of distinct values and quartiles are approximate at full size.` : `Statistics cover all ${fmtInt(p.sampled)} rows.`} {usedBy.length > 0 && <>Used by {usedBy.map((r, i) => <span key={r.id}>{i > 0 && ", "}<Link href={`/refinery/recipes/${r.id}`} className="underline">{r.name}</Link></span>)}.</>}</Notice>
          {pii.length > 0 && <Notice tone="warn" title="Personal data found">{pii.map((c) => c.name).join(", ")} {pii.length === 1 ? "looks" : "look"} like personal data. Previews mask {pii.length === 1 ? "it" : "them"}, and the Privacy step can mask or remove {pii.length === 1 ? "it" : "them"} before training.</Notice>}
          {p.keyDuplicates && <Notice tone="warn" title="Repeated identifiers">{p.keyDuplicates.column} repeats in about {fmtRows(p.keyDuplicates.rows)} rows ({p.keyDuplicates.pct}%). The rows differ in other columns, so a whole-row check does not catch them. A Drop duplicates step on {p.keyDuplicates.column} can keep the latest.</Notice>}
        </div>
      </div>

      <Tabs label="Dataset views" value={tab} onChange={setTab} tabs={[{ id: "columns", label: "Columns", count: d.columns.length }, { id: "preview", label: "Data preview" }, ...(d.source.kind === "model" ? [{ id: "lineage" as const, label: "Lineage" }] : []), ...(sensor ? [{ id: "sensors" as const, label: "Sensor quality", count: sensor.series.length }] : []), { id: "semantics" as const, label: "Semantics" }, { id: "dataspace" as const, label: "Data space" }, { id: "agents" as const, label: "Agent access" }, ...(isLive && d.source.kind === "upload" ? [{ id: "versions" as const, label: "Versions", count: d.version }] : [])]} />

      {tab === "columns" && (
        <Card>
          <Table>
            <Thead><tr><Th>Column</Th><Th>Role</Th><Th>Missing</Th><Th>Distinct</Th><Th>Range or most common</Th><Th>Distribution</Th></tr></Thead>
            <tbody>
              {p.columns.map((c) => (
                <Tr key={c.name} className="cursor-pointer" onClick={() => setCol(c.name)}>
                  <Td><div className="font-medium flex items-center gap-1.5">{c.name}{c.pii && <Badge tone="degraded">Personal</Badge>}{c.untidyPct >= 5 && <Badge tone="neutral">Untidy {c.untidyPct}%</Badge>}</div><div className="text-xs text-text-tertiary">{c.type}{c.pattern ? `, looks like ${c.pattern}` : ""}</div></Td>
                  <Td><span onClick={(e) => e.stopPropagation()}><Select aria-label={`Role of ${c.name}`} value={c.role} onChange={async (e) => { const r = await refinery.setColumnRole(d.id, c.name, e.target.value as ColRole); if (!r.ok) toast(r.error, "error"); }} className="h-8 text-[13px] w-32">{ROLE.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</Select></span></Td>
                  <Td><div className="w-24"><div className="text-[13px] tabular-nums">{c.nullPct}%</div><Bar value={c.nullPct} className="mt-1" tone={c.nullPct > 10 ? "#c0392b" : c.nullPct > 0 ? "var(--chart-s2)" : "var(--chart-s3)"} /></div></Td>
                  <Td className="tabular-nums">{fmtInt(c.distinct)}</Td>
                  <Td className="text-[13px] max-w-[220px]"><div className="truncate">{c.min !== undefined ? `${c.min} to ${c.max}` : c.top[0] ? `${c.top[0].value}` : ""}</div>{c.mean !== undefined && <div className="text-xs text-text-tertiary">mean {c.mean}</div>}</Td>
                  <Td><div className="w-32"><Histogram buckets={c.histogram} height={32} /></div></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {tab === "sensors" && sensor && <SensorQuality report={sensor} />}
      {tab === "semantics" && <SemanticLayer dataset={d} />}
      {tab === "agents" && <AgentAccess dataset={d} />}
      {tab === "dataspace" && <DataSpace dataset={d} />}
      {tab === "versions" && isLive && d.source.kind === "upload" && <DatasetVersions datasetId={d.id} canEdit />}

      {tab === "lineage" && d.source.kind === "model" && (
        <Card>
          <div className="px-5 py-3 border-b border-border text-xs text-text-secondary">Where this dataset comes from. Select a step to see its tables, and a table to see its columns.</div>
          <div className="p-5"><LineageGraph spec={d.source.spec} datasets={datasets} connections={connections} name={d.name} /></div>
          <div className="px-5 pb-5"><h3 className="text-[13px] font-medium mb-2">Definition</h3><pre className="rounded-md bg-[#07191E] text-[#d7f9ec] p-4 text-[12px] leading-relaxed overflow-auto max-h-[360px]"><code>{d.source.sql}</code></pre></div>
        </Card>
      )}

      {tab === "preview" && (
        <Card>
          <div className="px-5 py-3 border-b border-border text-xs text-text-secondary">{fmtInt(d.sample.length)} sampled rows. Personal data columns are masked. Colours mark values that are missing or need tidying.</div>
          <DataTable columns={d.columns.map((c) => ({ name: c.name, type: c.type }))} rows={d.sample} limit={25} render={(c, v) => mask(p.columns.find((x) => x.name === c.name), v)} />
        </Card>
      )}

      <Drawer open={!!cp} onClose={() => setCol(null)} title={cp?.name ?? ""} subtitle={cp ? `${cp.type}, role ${cp.role}` : undefined}>
        {cp && (
          <div className="space-y-5">
            <Histogram buckets={cp.histogram} height={110} />
            <div className="flex justify-between text-[11px] text-text-tertiary -mt-3"><span>{cp.histogram[0]?.label}</span><span>{cp.histogram[cp.histogram.length - 1]?.label}</span></div>
            <KeyValue rows={[
              ["Rows read", fmtInt(cp.n)], ["Missing", `${fmtInt(cp.nullCount)} (${cp.nullPct}%)`], ["Distinct values", fmtInt(cp.distinct)],
              ...(cp.mean !== undefined ? ([["Minimum", String(cp.min)], ["Quartiles", `${cp.p25}, ${cp.p50}, ${cp.p75}`], ["Maximum", String(cp.max)], ["Mean", String(cp.mean)], ["Standard deviation", String(cp.std)]] as [string, string][]) : []),
              ...(cp.minLen !== undefined ? ([["Shortest", `${cp.minLen} characters`], ["Longest", `${cp.maxLen} characters`]] as [string, string][]) : []),
              ...(cp.pattern ? ([["Looks like", cp.pattern]] as [string, string][]) : []),
              ...(cp.type === "string" ? ([["Untidy values", `${cp.untidyPct}% (stray spaces or mixed case)`]] as [string, string][]) : []),
            ]} />
            {cp.top.length > 0 && <div><h3 className="text-[13px] font-semibold mb-2">Most common values</h3><ul className="space-y-2">{cp.top.map((t) => <li key={t.value}><div className="flex justify-between text-[12px] gap-3"><span className="truncate font-code">{cp.pii ? mask(cp, t.value) : JSON.stringify(t.value)}</span><span className="tabular-nums text-text-secondary shrink-0">{fmtInt(t.count)}</span></div><Bar value={(t.count / cp.top[0].count) * 100} className="mt-1" /></li>)}</ul></div>}
            {cp.pii && <Notice tone="warn">This column looks like personal data, so values are masked here.</Notice>}
          </div>
        )}
      </Drawer>
      <Confirm open={del} onClose={() => setDel(false)} danger title="Delete dataset" confirmLabel="Delete dataset" phrase={d.name}
        body={<p>{usedBy.length ? `${usedBy.map((r) => r.name).join(", ")} read${usedBy.length === 1 ? "s" : ""} this dataset and will stop working.` : "The dataset and its profile are removed. Data in your own systems is not touched."}</p>}
        onConfirm={async () => { const r = await refinery.removeDataset(d.id); if (!r.ok) { toast(r.error, "error"); return; } toast("Dataset deleted"); router.push("/refinery/datasets"); }} />
    </div>
  );
}
