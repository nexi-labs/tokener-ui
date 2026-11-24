"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Form";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { LineageGraph } from "@/components/crucible/LineageGraph";
import { useCrucible } from "@/lib/crucible/store";
import { LANES, buildLineage, type Layer } from "@/lib/crucible/lineage";

function Inner() {
  const st = useCrucible(); const sp = useSearchParams();
  const runParam = sp.get("run") ?? undefined; const runExp = st.runs.find((r) => r.id === runParam)?.experimentId;
  const [exp, setExp] = useState<string>(sp.get("experiment") ?? runExp ?? "exp-support");
  const [layer, setLayer] = useState<Layer>("overview");
  const [view, setView] = useState<"graph" | "table">("graph");
  const graph = useMemo(() => buildLineage(st, exp, Date.now()), [st, exp]);
  const e = st.experiments.find((x) => x.id === exp);

  return (
    <div className="space-y-5">
      <PageHeader title="Lineage" description="Follow a model back to the raw data it came from, and forward to where it serves. Click any stage for what is happening there. Zoom in to see more figures on each stage."
        action={<div className="flex items-center gap-2">
          <div className="w-60"><Select aria-label="Experiment" value={exp} onChange={(x) => setExp(x.target.value)}>{st.experiments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></div>
          <div role="tablist" aria-label="View" className="inline-flex rounded-md border border-border p-0.5">{(["graph", "table"] as const).map((v) => <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`h-7 px-3 rounded text-[12.5px] font-medium ${view === v ? "bg-emph text-on-emph" : "text-text-secondary hover:bg-surface-muted"}`}>{v === "graph" ? "Graph" : "Table"}</button>)}</div>
        </div>} />
      {e && <p className="text-xs text-text-tertiary -mt-2">{e.task} · {e.department}{e.model ? ` · registry model ${e.model}` : ""}{runParam ? ` · tracing run ${runParam}` : ""}</p>}
      {view === "graph" ? <LineageGraph key={exp + (runParam ?? "")} graph={graph} layer={layer} onLayer={setLayer} initialSelect={runParam && graph.nodes.some((n) => n.id === `run:${runParam}`) ? `run:${runParam}` : undefined} highlightRun={runParam} /> : (
        <Card className="overflow-hidden">
          <Table>
            <Thead><tr><Th>Stage</Th><Th>What it is</Th><Th>State</Th><Th>{layer === "overview" ? "Key figures" : "Figures"}</Th><Th>{""}</Th></tr></Thead>
            <tbody>
              {LANES.flatMap((l) => graph.nodes.filter((n) => n.lane === l.id).map((n) => (
                <Tr key={n.id}>
                  <Td><span className="text-xs text-text-tertiary">{l.label}</span><div className="font-medium text-text-primary">{n.title}</div><div className="text-xs text-text-tertiary">{n.subtitle}</div></Td>
                  <Td className="text-text-secondary capitalize">{n.kind}</Td>
                  <Td><Badge tone={n.state === "ok" ? "healthy" : n.state === "bad" ? "down" : n.state === "warn" ? "degraded" : n.state === "live" ? "info" : "neutral"}>{n.stateLabel}</Badge></Td>
                  <Td className="text-text-secondary">{n.figures[layer].map((f) => `${f.label}: ${f.value}`).join(" · ")}</Td>
                  <Td>{n.href && <Link href={n.href} className="text-[13px] underline underline-offset-2">{n.hrefLabel ?? "Open"}</Link>}</Td>
                </Tr>
              )))}
            </tbody>
          </Table>
        </Card>
      )}
      <p className="text-xs text-text-tertiary">Built from the runs, datasets, policies and stores on these screens. In a signed-in workspace the same graph reads from the training service once it exists.</p>
    </div>
  );
}
export default function LineagePage() { return <Suspense fallback={null}><Inner /></Suspense>; }
