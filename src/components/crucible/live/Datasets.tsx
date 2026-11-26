"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Eye, EyeOff, Table2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { CodeBlock, Drawer, Kpi, Notice, Tabs } from "@/components/mlops/ui";
import { crucibleDriver, useCrucibleLive } from "@/lib/crucible/live/store";
import type { DatasetEntry } from "@/lib/crucible/live/types";
import { toast } from "@/lib/mlops/toast";
import { ago, int } from "@/lib/agents/format";
import { Allowed, person, when } from "./bits";

type Tab = "exposed" | "available";
const latest = (d: DatasetEntry) => d.dataset.versions[0];
const pii = (d: DatasetEntry) => (d.dataset.columns.some((c) => c.pii === "found") ? "found" : d.dataset.columns.some((c) => c.pii === "masked") ? "masked" : "none");

export function LiveDatasets() {
  const { datasets } = useCrucibleLive();
  const [tab, setTab] = useState<Tab>("exposed"); const [openId, setOpenId] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const list = useMemo(() => datasets.filter((d) => (tab === "exposed" ? d.exposed : !d.exposed)), [datasets, tab]);
  const open = datasets.find((d) => d.dataset.id === openId) ?? null;
  const act = async (d: DatasetEntry, expose: boolean) => {
    setErr(null);
    const r = expose ? await crucibleDriver().exposeDataset(d.dataset.id) : await crucibleDriver().hideDataset(d.dataset.id);
    if (!r.ok) { setErr(r.error); return; }
    toast(expose ? `${d.dataset.name} is now available in Crucible` : `${d.dataset.name} is hidden from Crucible`);
  };
  const blocked = datasets.filter((d) => !d.exposed && d.problems.length > 0).length;
  return (
    <div className="space-y-6">
      <PageHeader title="Datasets" description="Cleaned datasets from the Refinery. Expose a recipe's output here and any run can pin an exact version of it, so a model can always be traced back to the data that trained it." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Exposed" value={datasets.filter((d) => d.exposed).length} sub="Usable in runs" />
        <Kpi label="Ready to expose" value={datasets.filter((d) => !d.exposed && d.problems.length === 0).length} sub="Pass the checks" />
        <Kpi label="Blocked" value={blocked} sub="Personal data, quality or no identifier" tone={blocked ? "warn" : undefined} />
        <Kpi label="From the Refinery" value={datasets.length} sub="Cleaned by a recipe" />
      </div>
      {err && <Notice tone="bad" title="That did not go through">{err}</Notice>}
      <Tabs<Tab> label="Dataset views" value={tab} onChange={setTab} tabs={[{ id: "exposed", label: "Exposed", count: datasets.filter((d) => d.exposed).length }, { id: "available", label: "From the Refinery", count: datasets.filter((d) => !d.exposed).length }]} />
      {list.length === 0 ? <Card><EmptyState icon={Table2} title={datasets.length === 0 ? "No cleaned datasets yet" : tab === "exposed" ? "Nothing is exposed yet" : "Everything is exposed"} description={datasets.length === 0 ? "A dataset appears here once a Refinery recipe has run successfully. Build and run a recipe in the Refinery first." : tab === "exposed" ? "Open the From the Refinery tab and expose a dataset that passes the checks." : "Every cleaned dataset is already available to runs."} /></Card> : (
        <Card className="overflow-hidden"><Table>
          <Thead><tr><Th>Dataset</Th><Th>Latest version</Th><Th>Rows</Th><Th>Quality</Th><Th>Personal data</Th><Th>{tab === "exposed" ? "Exposed" : "Check"}</Th><Th>{""}</Th></tr></Thead>
          <tbody>{list.map((d) => { const v = latest(d); const p = pii(d); return (
            <Tr key={d.dataset.id} onClick={() => setOpenId(d.dataset.id)} className="cursor-pointer">
              <Td><span className="font-medium text-text-primary">{d.dataset.name}</span><div className="text-xs text-text-tertiary">From recipe {d.dataset.recipe} · {person(d.dataset.owner)}</div></Td>
              <Td className="tabular-nums">{v ? `v${v.version}` : "None"}<div className="text-xs text-text-tertiary">{v ? ago(v.createdAt) : ""}</div></Td>
              <Td className="tabular-nums text-text-secondary">{v ? int(v.rows) : "0"}</Td>
              <Td className="tabular-nums">{v ? `${Math.round(v.quality * 100)}%` : "Unknown"}</Td>
              <Td>{p === "found" ? <Badge tone="down">Found</Badge> : p === "masked" ? <Badge tone="healthy">Masked</Badge> : <Badge tone="neutral">None</Badge>}</Td>
              <Td className="text-text-secondary max-w-[280px]">{tab === "exposed" ? (d.exposed ? `${when(d.exposed.exposedAt)} by ${person(d.exposed.exposedBy)}` : "") : d.problems.length ? <span className="text-status-down">{d.problems[0].slice(0, 90)}{d.problems[0].length > 90 ? "..." : ""}</span> : "Ready"}</Td>
              <Td className="text-right whitespace-nowrap"><span onClick={(e) => e.stopPropagation()}>
                {tab === "available" ? <Allowed need="expose_dataset" variant="secondary" className="h-8" disabled={d.problems.length > 0} onClick={() => act(d, true)}><Eye size={13} /> Expose</Allowed>
                  : <Allowed need="expose_dataset" variant="ghost" className="h-8" onClick={() => act(d, false)}><EyeOff size={13} /> Hide</Allowed>}</span></Td>
            </Tr>); })}</tbody>
        </Table></Card>
      )}
      <Drawer open={!!open} onClose={() => setOpenId(null)} title={open?.dataset.name ?? ""} subtitle={open ? `From Refinery recipe ${open.dataset.recipe}` : undefined}>
        {open && <Detail d={open} />}
      </Drawer>
    </div>
  );
}

function Detail({ d }: { d: DatasetEntry }) {
  const ds = d.dataset; const v = latest(d);
  return (
    <div className="space-y-6">
      <p className="text-sm text-text-secondary">{ds.description || "No description."}</p>
      {d.problems.length > 0 && !d.exposed && <Notice tone="bad" title="Cannot be exposed yet">{d.problems.map((p) => <div key={p}>{p}</div>)}</Notice>}
      <section>
        <h3 className="text-sm font-semibold text-text-primary mb-2">Where it is written</h3>
        <p className="text-sm text-text-secondary">{ds.format ? `${ds.format} at ` : ""}<span className="font-code text-xs break-all">{ds.location || "Not recorded"}</span></p>
        {ds.recipeId && <Link href={`/refinery/recipes/${ds.recipeId}`} className="inline-block mt-2 text-[13px] underline underline-offset-2">Open the recipe in the Refinery</Link>}
      </section>
      <section>
        <h3 className="text-sm font-semibold text-text-primary mb-2">Versions</h3>
        {ds.versions.length === 0 ? <p className="text-sm text-text-secondary">No version has been written yet.</p> : <div className="space-y-2">{ds.versions.map((x) => (
          <Card key={x.version} className="p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0"><span className="font-medium text-sm text-text-primary">v{x.version}</span>{x.schemaChanged && <Badge tone="degraded">Schema changed</Badge>}<span className="text-xs text-text-tertiary truncate">{x.refineryRun}</span></div>
              <span className="text-sm tabular-nums text-text-secondary whitespace-nowrap">{Math.round(x.quality * 100)}% quality</span>
            </div>
            <div className="mt-1.5 text-xs text-text-secondary tabular-nums">{int(x.rows)} rows{x.splits ? ` · train ${int(x.splits.train)} · validation ${int(x.splits.validation)} · test ${int(x.splits.test)}` : " · no train, validation or test split recorded"}</div>
            {x.note && <p className="mt-1.5 text-xs text-text-tertiary">{x.note}</p>}
          </Card>))}</div>}
      </section>
      {v && ds.columns.length > 0 && <section>
        <h3 className="text-sm font-semibold text-text-primary mb-2">Schema of version {v.version}</h3>
        <Card className="overflow-hidden"><Table><Thead><tr><Th>Column</Th><Th>Type</Th><Th>Empty</Th><Th>Personal</Th></tr></Thead><tbody>
          {ds.columns.map((c) => <Tr key={c.name}><Td className="font-code text-xs">{c.name}{c.role && <div className="text-[11px] text-text-tertiary font-sans capitalize">{c.role}</div>}</Td><Td className="text-text-secondary">{c.type}</Td><Td className="tabular-nums">{c.nullPct}%</Td><Td>{c.pii === "found" ? <Badge tone="down">Found</Badge> : c.pii === "masked" ? <Badge tone="healthy">Masked</Badge> : <span className="text-text-tertiary text-xs">None</span>}</Td></Tr>)}
        </tbody></Table></Card>
      </section>}
      {d.exposed && v && <section>
        <h3 className="text-sm font-semibold text-text-primary mb-2">Pin it in a run</h3>
        <p className="text-sm text-text-secondary mb-2">A run records the dataset by sending a dataset event with its name and version, in the same batch as its metrics.</p>
        <CodeBlock code={`{ "id": "e-100", "type": "log_dataset", "runId": "<run id>", "name": "${ds.name}", "version": ${v.version} }`} />
        <p className="text-xs text-text-tertiary mt-2">Once a run pins a version, this dataset cannot be hidden until those runs are gone.</p>
      </section>}
    </div>
  );
}
