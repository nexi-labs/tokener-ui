"use client";

import { useCrucibleStatus } from "@/lib/crucible/live/store";
import { LiveDatasets } from "@/components/crucible/live/Datasets";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { CodeBlock, Drawer, GuardButton, Kpi, Notice, Tabs, useRole } from "@/components/mlops/ui";
import { crucible, useCrucible } from "@/lib/crucible/store";
import { exposeProblems, type CatalogDataset } from "@/lib/crucible/platform";
import { toast } from "@/lib/mlops/toast";
import { ago, int } from "@/lib/agents/format";

type Tab = "exposed" | "available";

function SampleDatasets() {
  const { catalog, runs, policies } = useCrucible(); const role = useRole();
  const [tab, setTab] = useState<Tab>("exposed"); const [openId, setOpenId] = useState<string | null>(null);
  const list = useMemo(() => catalog.filter((d) => (tab === "exposed" ? d.exposed : !d.exposed)), [catalog, tab]);
  const open = catalog.find((d) => d.id === openId) ?? null;
  const used = (d: CatalogDataset) => runs.filter((r) => r.dataset.name === d.name).length;
  const expose = (d: CatalogDataset) => { const r = crucible.exposeDataset(role, d.id); r.ok ? toast(`${d.name} is now available in Crucible`) : toast(r.error, "error"); };
  const hide = (d: CatalogDataset) => { const r = crucible.unexposeDataset(role, d.id); r.ok ? toast(`${d.name} is hidden from Crucible`) : toast(r.error, "error"); };

  return (
    <div className="space-y-6">
      <PageHeader title="Datasets" description="Cleaned datasets from the Refinery. Expose a recipe's output here and any run can pin an exact version of it, so a model can always be traced back to the data that trained it." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Exposed" value={catalog.filter((d) => d.exposed).length} sub="Usable in runs" />
        <Kpi label="Ready to expose" value={catalog.filter((d) => !d.exposed && exposeProblems(d).length === 0).length} sub="Pass the checks" />
        <Kpi label="Blocked" value={catalog.filter((d) => !d.exposed && exposeProblems(d).length > 0).length} sub="Personal data or quality" tone={catalog.some((d) => !d.exposed && exposeProblems(d).length) ? "warn" : undefined} />
        <Kpi label="Versions pinned by runs" value={new Set(runs.map((r) => `${r.dataset.name}:${r.dataset.version}`)).size} />
      </div>
      <Tabs<Tab> label="Dataset views" value={tab} onChange={setTab} tabs={[{ id: "exposed", label: "Exposed", count: catalog.filter((d) => d.exposed).length }, { id: "available", label: "From the Refinery", count: catalog.filter((d) => !d.exposed).length }]} />
      <Card className="overflow-hidden">
        <Table>
          <Thead><tr><Th>Dataset</Th><Th>Latest version</Th><Th>Rows</Th><Th>Quality</Th><Th>Personal data</Th><Th>{tab === "exposed" ? "Used by" : "Check"}</Th><Th>{""}</Th></tr></Thead>
          <tbody>
            {list.map((d) => { const v = d.versions[0]; const problems = exposeProblems(d); return (
              <Tr key={d.id} onClick={() => setOpenId(d.id)} className="cursor-pointer">
                <Td><span className="font-medium text-text-primary">{d.name}</span><div className="text-xs text-text-tertiary">From recipe {d.recipe} · {d.owner}</div></Td>
                <Td className="tabular-nums">v{v.version}<div className="text-xs text-text-tertiary">{ago(v.createdAt)}</div></Td>
                <Td className="tabular-nums text-text-secondary">{int(v.rows)}</Td>
                <Td className="tabular-nums">{Math.round(v.quality * 100)}%</Td>
                <Td>{d.columns.some((c) => c.pii === "found") ? <Badge tone="down">Found</Badge> : d.columns.some((c) => c.pii === "masked") ? <Badge tone="healthy">Masked</Badge> : <Badge tone="neutral">None</Badge>}</Td>
                <Td className="text-text-secondary max-w-[260px]">{tab === "exposed" ? `${used(d)} runs, ${policies.filter((p) => p.source === d.name).length} policies` : problems.length ? <span className="text-status-down">{problems[0].slice(0, 80)}{problems[0].length > 80 ? "..." : ""}</span> : "Ready"}</Td>
                <Td className="text-right whitespace-nowrap" ><span onClick={(e) => e.stopPropagation()}>
                  {tab === "available" ? <GuardButton action="pipeline.publish" role={role} variant="secondary" className="h-8" onClick={() => expose(d)}><Eye size={13} /> Expose</GuardButton> : <GuardButton action="pipeline.publish" role={role} variant="ghost" className="h-8" onClick={() => hide(d)}><EyeOff size={13} /> Hide</GuardButton>}</span></Td>
              </Tr>
            ); })}
          </tbody>
        </Table>
      </Card>
      <Drawer open={!!open} onClose={() => setOpenId(null)} title={open?.name ?? ""} subtitle={open ? `From Refinery recipe ${open.recipe}` : undefined}>
        {open && <Detail d={open} runs={used(open)} />}
      </Drawer>
    </div>
  );
}

function Detail({ d, runs }: { d: CatalogDataset; runs: number }) {
  const v = d.versions[0]; const problems = exposeProblems(d);
  return (
    <div className="space-y-6">
      <p className="text-sm text-text-secondary">{d.description}</p>
      {problems.length > 0 && !d.exposed && <Notice tone="bad" title="Cannot be exposed yet">{problems.map((p) => <div key={p}>{p}</div>)}</Notice>}
      <section>
        <h3 className="text-sm font-semibold text-text-primary mb-2">Where it comes from</h3>
        <p className="text-sm text-text-secondary">{d.inputs.map((i) => `${i.name} (${i.kind})`).join(", ")} cleaned by {d.steps.length} steps: {d.steps.join(", ")}. Written as {d.format} to {d.location}.</p>
        <Link href={`/refinery/recipes/${d.recipeId}`} className="inline-block mt-2 text-[13px] underline underline-offset-2">Open the recipe in the Refinery</Link>
      </section>
      <section>
        <h3 className="text-sm font-semibold text-text-primary mb-2">Versions</h3>
        <div className="space-y-2">
          {d.versions.map((x) => (
            <Card key={x.version} className="p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-sm text-text-primary">v{x.version}</span>
                  {x.schemaChanged && <Badge tone="degraded">Schema changed</Badge>}
                  <span className="text-xs text-text-tertiary truncate">{x.refineryRun}</span>
                </div>
                <span className="text-sm tabular-nums text-text-secondary whitespace-nowrap">{Math.round(x.quality * 100)}% quality</span>
              </div>
              <div className="mt-1.5 text-xs text-text-secondary tabular-nums">{int(x.rows)} rows · train {int(x.splits.train)} · validation {int(x.splits.validation)} · test {int(x.splits.test)}</div>
              {x.note && <p className="mt-1.5 text-xs text-text-tertiary">{x.note}</p>}
            </Card>
          ))}
        </div>
      </section>
      <section>
        <h3 className="text-sm font-semibold text-text-primary mb-2">Schema of version {v.version}</h3>
        <Card className="overflow-hidden"><Table><Thead><tr><Th>Column</Th><Th>Type</Th><Th>Empty</Th><Th>Personal</Th></tr></Thead><tbody>
          {d.columns.map((c) => <Tr key={c.name}><Td className="font-code text-xs">{c.name}{c.role && <div className="text-[11px] text-text-tertiary font-sans capitalize">{c.role}</div>}</Td><Td className="text-text-secondary">{c.type}</Td><Td className="tabular-nums">{c.nullPct}%</Td><Td>{c.pii === "found" ? <Badge tone="down">Found</Badge> : c.pii === "masked" ? <Badge tone="healthy">Masked</Badge> : <span className="text-text-tertiary text-xs">None</span>}</Td></Tr>)}
        </tbody></Table></Card>
      </section>
      {d.exposed && (<section><h3 className="text-sm font-semibold text-text-primary mb-2">Use it in a run</h3>
        <CodeBlock code={`import crucible\n\nds = crucible.datasets.load("${d.name}", version=${v.version})   # omit version to follow the latest\ntrain, val, test = ds.splits()\nrun.log_dataset(ds)                                       # pins this version in the run\n\n# Or stream it in batches without loading it all\nfor batch in ds.iter_batches("train", size=1024):\n    ...`} />
        <p className="text-xs text-text-tertiary mt-2">{runs} runs pin this dataset today. The SDK is planned and not published, see docs/52.</p></section>)}
    </div>
  );
}

/** A signed-in workspace shows what the training service returns. The sample workspace keeps its own screen. */
export default function Datasets() {
  return useCrucibleStatus().connected ? <LiveDatasets /> : <SampleDatasets />;
}
