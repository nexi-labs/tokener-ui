"use client";

import clsx from "clsx";
import { Download, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Form";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Notice } from "@/components/mlops/ui";
import { Section } from "@/components/refinery/bits";
import { syncsToServer, useServerSetting } from "@/lib/refinery/settingsSync";
import { SettingSyncNote } from "@/components/refinery/SettingSyncNote";
import { semanticsKey, KINDS, KNOWN_UNITS, clearModel, coverage, inferSemantics, loadModel, saveModel, slug, toAas, toCsv, toSemanticJson, validate, type ColumnSemantic, type SemanticKind, type SemanticModel } from "@/lib/refinery/semantics";
import type { Dataset } from "@/lib/refinery/types";

function save(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const TONE: Record<SemanticKind, "healthy" | "info" | "degraded" | "neutral" | "down"> = { asset: "info", timestamp: "info", measurement: "healthy", setpoint: "healthy", state: "degraded", alarm: "down", identifier: "neutral", attribute: "neutral", ignore: "neutral" };

export function SemanticLayer({ dataset: d }: { dataset: Dataset }) {
  const [m, setM] = useState<SemanticModel>(() => loadModel(d));
  useEffect(() => { setM(loadModel(d)); }, [d.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useServerSetting("datasets", d.id, "semantics", semanticsKey(d.id), () => setM(loadModel(d)));
  const edit = (column: string, patch: Partial<ColumnSemantic>) => setM((cur) => { const next = { columns: cur.columns.map((c) => (c.column === column ? { ...c, ...patch } : c)) }; saveModel(d, next); return next; });
  const reset = () => { clearModel(d); setM(inferSemantics(d)); };
  const findings = useMemo(() => validate(m, d), [m, d]);
  const cov = useMemo(() => coverage(m), [m]);
  const assets = useMemo(() => { const a = m.columns.find((c) => c.kind === "asset"); return a ? new Set(d.sample.map((r) => String(r[a.column] ?? "")).filter(Boolean)).size : 0; }, [m, d]);
  const type = (n: string) => d.columns.find((c) => c.name === n)?.type ?? "";
  const stamp = slug(d.name);
  const tiles: [string, string, string][] = [
    ["Columns described", `${cov.described} of ${cov.columns}`, "with a description"],
    ["Measurements with a unit", cov.measurements ? `${cov.withUnit} of ${cov.measurements}` : "none", "numeric values need one"],
    ["Linked to a standard or a node", String(cov.linked), "OPC UA node or ECLASS or IEC CDD id"],
    ["Assets in the sample", assets ? String(assets) : "none", assets ? "from the asset column" : "no asset column marked"],
  ];

  return (
    <div className="space-y-4">
      <Notice title="What each column means, in one place">
        Plant and engineering systems exchange data by meaning, not by column name. Describe each column once here and export it as a semantic model, a data dictionary or an Asset Administration Shell file.
        {syncsToServer() ? "The mapping is saved on the server." : "The mapping is saved in this browser."} The first proposal comes from the column names and the data, and every value can be changed.
      </Notice>
      <SettingSyncNote />

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {tiles.map(([l, v, s]) => (<div key={l} className="rounded-lg border border-border bg-surface p-4"><div className="text-xs text-text-tertiary">{l}</div><div className="text-xl font-semibold tabular-nums mt-1">{v}</div><div className="text-[11px] text-text-tertiary mt-0.5">{s}</div></div>))}
      </div>

      <Section title="Columns" hint={`${d.columns.length} columns`} action={<Button onClick={reset}><RotateCcw size={13} /> Start again from the proposal</Button>}>
        <div className="overflow-x-auto -mx-1 px-1">
          <datalist id="units">{KNOWN_UNITS.map((u) => <option key={u} value={u} />)}</datalist>
          <Table>
            <Thead><tr><Th>Column</Th><Th>Kind</Th><Th>Label and description</Th><Th>Unit</Th><Th>OPC UA node</Th><Th>Standard id</Th></tr></Thead>
            <tbody>
              {m.columns.map((c) => (
                <Tr key={c.column} className={clsx(c.kind === "ignore" && "opacity-60")}>
                  <Td className="align-top min-w-[150px]"><div className="font-code text-xs">{c.column}</div><div className="mt-1 flex items-center gap-1.5"><span className="text-[11px] text-text-tertiary">{type(c.column)}</span><Badge tone={TONE[c.kind]}>{KINDS.find((k) => k.id === c.kind)!.label}</Badge></div></Td>
                  <Td className="align-top"><Select aria-label={`Kind of ${c.column}`} value={c.kind} onChange={(e) => edit(c.column, { kind: e.target.value as SemanticKind })} className="min-w-[165px]">{KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</Select></Td>
                  <Td className="align-top min-w-[240px]"><Input aria-label={`Label of ${c.column}`} value={c.label} onChange={(e) => edit(c.column, { label: e.target.value })} /><Input aria-label={`Description of ${c.column}`} className="mt-1.5" placeholder="Description" value={c.description} onChange={(e) => edit(c.column, { description: e.target.value })} /></Td>
                  <Td className="align-top min-w-[120px]"><Input aria-label={`Unit of ${c.column}`} list="units" value={c.unit} onChange={(e) => edit(c.column, { unit: e.target.value })} placeholder="kPa" disabled={c.kind === "ignore"} /></Td>
                  <Td className="align-top min-w-[230px]"><Input aria-label={`OPC UA node of ${c.column}`} className="font-code text-xs" value={c.opcua} onChange={(e) => edit(c.column, { opcua: e.target.value })} placeholder="ns=2;s=Line3.Comp1.Pressure" disabled={c.kind === "ignore"} /></Td>
                  <Td className="align-top min-w-[220px]"><Input aria-label={`Standard id of ${c.column}`} className="font-code text-xs" value={c.standardId} onChange={(e) => edit(c.column, { standardId: e.target.value })} placeholder="0173-1#02-AAB000#001" disabled={c.kind === "ignore"} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Section>

      <div className="grid lg:grid-cols-2 gap-4">
        <Section title="Review" hint="Updates as you edit">
          <ul className="space-y-2">{findings.map((f, i) => (<li key={i}><Notice tone={f.level === "warn" ? "warn" : f.level === "ok" ? "ok" : "info"}>{f.text}</Notice></li>))}</ul>
        </Section>
        <Section title="Export" hint="Excluded columns are left out">
          <ul className="space-y-3 text-[13px]">
            <li className="flex items-start justify-between gap-3"><span><span className="font-medium">Semantic model</span><span className="block text-text-secondary">Every column with its kind, label, unit and links, as JSON.</span></span><Button onClick={() => save(`${stamp}-semantic-model.json`, JSON.stringify(toSemanticJson(d, m), null, 2) + "\n", "application/json")}><Download size={13} /> .json</Button></li>
            <li className="flex items-start justify-between gap-3"><span><span className="font-medium">Data dictionary</span><span className="block text-text-secondary">The same as a table for engineers and auditors.</span></span><Button onClick={() => save(`${stamp}-data-dictionary.csv`, toCsv(d, m), "text/csv")}><Download size={13} /> .csv</Button></li>
            <li className="flex items-start justify-between gap-3"><span><span className="font-medium">Asset Administration Shell</span><span className="block text-text-secondary">One shell per asset with its latest sampled values, in metamodel version 3 JSON. Local identifiers are used unless you give a standard one. It is not one of the IDTA submodel templates.</span></span><Button onClick={() => save(`${stamp}-aas.json`, JSON.stringify(toAas(d, m), null, 2) + "\n", "application/json")}><Download size={13} /> .json</Button></li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
