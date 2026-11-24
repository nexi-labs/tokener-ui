"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ScrollText } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Form";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { RunStatusBadge, ago, fmtDur, fmtRows, usd } from "@/components/refinery/bits";
import { RunWindow } from "@/components/refinery/RunWindow";
import { useRefinery } from "@/lib/refinery/store";
import type { RunStatus } from "@/lib/refinery/types";

export default function RunsPage() {
  const { runs, recipes } = useRefinery();
  const [status, setStatus] = useState<"all" | RunStatus>("all");
  const [recipe, setRecipe] = useState("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const list = useMemo(() => runs.filter((r) => (status === "all" || r.status === status) && (recipe === "all" || r.recipeId === recipe) && (!q || `${r.id} ${r.recipeName} ${r.datasetName} ${r.startedBy}`.toLowerCase().includes(q.toLowerCase()))), [runs, status, recipe, q]);
  const live = runs.filter((r) => r.status === "running" || r.status === "planning").length;

  return (
    <div className="space-y-5">
      <div><h2 className="text-lg font-semibold tracking-tight">Runs</h2><p className="text-sm text-text-secondary mt-1 max-w-2xl">Every run pins the recipe version and the input snapshot it used, so a result can be traced and repeated. Open the log to follow a run as it happens.</p></div>
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="w-64"><Input aria-label="Search runs" placeholder="Search by run, recipe or person" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="w-40"><Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as "all" | RunStatus)}><option value="all">Any status</option>{(["running", "queued", "succeeded", "failed", "cancelled"] as const).map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</Select></div>
        <div className="w-56"><Select aria-label="Recipe" value={recipe} onChange={(e) => setRecipe(e.target.value)}><option value="all">Any recipe</option>{recipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></div>
        <span className="ml-auto text-xs text-text-tertiary">{live} running now, {list.length} shown</span>
      </div>
      <Card>
        <Table>
          <Thead><tr><Th>Run</Th><Th>Recipe</Th><Th>Input and pool</Th><Th>Status</Th><Th>Rows in</Th><Th>Rejected</Th><Th>Model cost</Th><Th>Duration</Th><Th>Started</Th><Th><span className="sr-only">Log</span></Th></tr></Thead>
          <tbody>
            {list.map((r) => (
              <Tr key={r.id}>
                <Td className="whitespace-nowrap"><Link href={`/refinery/runs/${r.id}`} className="font-medium hover:underline">{r.id}</Link><div className="text-[11px] text-text-tertiary">{r.trigger}, {r.startedBy}</div></Td>
                <Td className="whitespace-nowrap"><Link href={`/refinery/recipes/${r.recipeId}`} className="hover:underline">{r.recipeName}</Link><div className="text-[11px] text-text-tertiary">v{r.recipeVersion}</div></Td>
                <Td className="text-text-secondary whitespace-nowrap">{r.snapshot}<div className="text-[11px] text-text-tertiary">{r.pool}</div></Td>
                <Td><RunStatusBadge s={r.status} />{(r.status === "running" || r.status === "planning") && <div className="mt-1.5 h-1 w-20 rounded-full bg-surface-muted overflow-hidden"><div className="h-full bg-[#02F5A1]" style={{ width: `${r.pct}%` }} /></div>}</Td>
                <Td className="tabular-nums">{fmtRows(r.rowsIn)}</Td>
                <Td className="tabular-nums">{r.rowsRejected ? fmtRows(r.rowsRejected) : <span className="text-text-tertiary">0</span>}</Td>
                <Td className="tabular-nums">{r.aiCostUsd ? usd(r.aiCostUsd) : <span className="text-text-tertiary">none</span>}</Td>
                <Td className="tabular-nums">{r.durationMs ? fmtDur(r.durationMs) : <span className="text-text-tertiary">{r.status === "queued" ? "waiting" : ""}</span>}</Td>
                <Td className="text-text-secondary whitespace-nowrap">{ago(r.startedAt)}</Td>
                <Td><button type="button" aria-label={`Open the log of ${r.id}`} title="Open the log" onClick={() => setOpen(r.id)} className="h-8 w-8 grid place-items-center rounded-md border border-border hover:bg-surface-muted"><ScrollText size={14} /></button></Td>
              </Tr>))}
          </tbody>
        </Table>
        {list.length === 0 && <div className="p-10 text-center text-sm text-text-secondary">No runs match.</div>}
      </Card>
      <RunWindow runId={open} onClose={() => setOpen(null)} />
    </div>
  );
}
