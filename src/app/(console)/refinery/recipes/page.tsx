"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Form";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Modal } from "@/components/mlops/ui";
import { RunStatusBadge, ago } from "@/components/refinery/bits";
import { describeCadence, startLabel } from "@/components/refinery/SchedulePanel";
import { Notice } from "@/components/mlops/ui";
import { refinery, useRefinery, useRefineryStatus } from "@/lib/refinery/store";
import { STEP_BY_OP } from "@/lib/refinery/steps";

const NAME_OK = /^[a-z][a-z0-9-]{1,59}$/;

export default function RecipesPage() {
  const { recipes, datasets, runs, streams, schedules } = useRefinery();
  const isLive = useRefineryStatus().mode === "live";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [ds, setDs] = useState("");
  useEffect(() => { if (new URLSearchParams(window.location.search).get("new")) setOpen(true); }, []);
  const nameErr = name && !NAME_OK.test(name) ? "Start with a letter. Use lower case letters, digits and hyphens." : recipes.some((r) => r.name === name) ? "A recipe with this name exists." : null;
  const [creating, setCreating] = useState(false); const [createErr, setCreateErr] = useState<string | null>(null);
  const create = async () => { if (creating) return; setCreating(true); setCreateErr(null); const r = await refinery.createRecipe(name, ds || datasets[0].id); setCreating(false); if (!r.ok) { setCreateErr(r.error); return; } setOpen(false); router.push(`/refinery/recipes/${r.recipe.id}`); };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div><h2 className="text-lg font-semibold tracking-tight">Recipes</h2><p className="text-sm text-text-secondary mt-1 max-w-2xl">A recipe turns one dataset into another with an ordered list of steps: clean, reshape, check, mask, label with a model and split. The same recipe runs as a batch or, where the steps allow, as a stream.</p></div>
        <Button variant="primary" onClick={() => { setName(""); setDs(datasets[0]?.id ?? ""); setOpen(true); }} disabled={datasets.length === 0}><Plus size={15} /> New recipe</Button>
      </div>
      <Card>
        <Table>
          <Thead><tr><Th>Recipe</Th><Th>Input</Th><Th>Steps</Th><Th>Output</Th><Th>Last run</Th>{isLive && <Th>Schedule</Th>}<Th>Version</Th></tr></Thead>
          <tbody>
            {recipes.map((r) => {
              const d = datasets.find((x) => x.id === r.inputDatasetId); const last = runs.find((x) => x.recipeId === r.id);
              const ai = r.steps.filter((s) => STEP_BY_OP.get(s.op)?.ai).length; const live = streams.some((s) => s.recipeName === r.name);
              return (
                <Tr key={r.id} className="cursor-pointer" onClick={() => router.push(`/refinery/recipes/${r.id}`)}>
                  <Td><div className="flex items-center gap-3"><div className="h-9 w-9 rounded-md bg-surface-muted grid place-items-center shrink-0"><Layers size={17} className="text-text-secondary" /></div><div className="min-w-0"><Link href={`/refinery/recipes/${r.id}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:underline">{r.name}</Link><div className="text-xs text-text-tertiary truncate max-w-[300px]">{r.description || "No description"}</div></div></div></Td>
                  <Td className="text-[13px]">{d?.name ?? <span className="text-status-down">dataset removed</span>}</Td>
                  <Td className="text-[13px] tabular-nums">{r.steps.length}{ai ? <span className="text-text-tertiary">, {ai} with a model</span> : ""}{live ? <span className="text-text-tertiary">, streaming</span> : ""}</Td>
                  <Td className="text-[13px] text-text-secondary">{r.outputs.length ? `${r.outputs.length} output${r.outputs.length === 1 ? "" : "s"}` : "None yet"}</Td>
                  <Td>{last ? <><RunStatusBadge s={last.status} /><div className="text-[11px] text-text-tertiary mt-1">{ago(last.startedAt)}</div></> : <span className="text-xs text-text-tertiary">Never run</span>}</Td>
                  {isLive && (() => { const sc = schedules.find((x) => x.recipeId === r.id); return (
                    <Td className="text-[13px]">{sc ? <><span className={sc.enabled ? "" : "text-text-tertiary"}>{describeCadence(sc.cadence)}</span><div className="text-[11px] text-text-tertiary mt-1">{sc.enabled ? `Next ${startLabel(sc.nextRunAt, sc.cadence.timezone)}` : "Paused"}</div></> : <span className="text-xs text-text-tertiary">Manual</span>}</Td>); })()}
                  <Td className="tabular-nums text-[13px]">v{r.version}<div className="text-[11px] text-text-tertiary">{ago(r.updatedAt)}</div></Td>
                </Tr>
              );
            })}
            {recipes.length === 0 && <Tr><Td colSpan={isLive ? 7 : 6} className="text-center text-text-secondary py-12">No recipes yet. Start from a dataset.</Td></Tr>}
          </tbody>
        </Table>
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="New recipe" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={!name || !!nameErr || !ds} onClick={create}>Create and open</Button></>}>
        <div className="space-y-4">
          {createErr && <Notice tone="bad" title="The recipe was not created">{createErr}</Notice>}
          <Field label="Recipe name" hint={nameErr ?? "Lower case letters, digits and hyphens."}><Input value={name} onChange={(e) => setName(e.target.value.toLowerCase())} placeholder="support-tickets-clean" aria-invalid={!!nameErr} autoFocus /></Field>
          <Field label="Input dataset" hint="You can change it later. The steps are checked against its columns."><Select value={ds} onChange={(e) => setDs(e.target.value)}>{datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
        </div>
      </Modal>
    </div>
  );
}
