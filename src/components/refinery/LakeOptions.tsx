"use client";

import clsx from "clsx";
import { Field, Select } from "@/components/ui/Form";
import { Notice } from "@/components/mlops/ui";
import { CATALOGS, WRITE_MODES, checkLake } from "@/lib/refinery/lake";
import type { FileFormat, LakeOptions } from "@/lib/refinery/types";

/** Write options for a Delta Lake or Iceberg output: how rows are written, how the table is partitioned, and (Iceberg) which catalog holds it. */
export function LakeOptionsForm({ format, value, columns, target, onChange }: { format: FileFormat; value: LakeOptions; columns: string[]; target: string; onChange: (v: LakeOptions) => void }) {
  const findings = checkLake({ format, lake: value, target }, columns);
  const toggle = (k: "partitionBy" | "mergeKeys", col: string) => onChange({ ...value, [k]: value[k].includes(col) ? value[k].filter((c) => c !== col) : [...value[k], col] });
  const chips = (k: "partitionBy" | "mergeKeys", label: string) => (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {columns.length === 0 && <span className="text-xs text-text-tertiary">Run the pipeline preview to list the output columns.</span>}
      {columns.map((c) => { const on = value[k].includes(c); return (
        <button key={c} type="button" aria-pressed={on} onClick={() => toggle(k, c)} className={clsx("h-7 px-2.5 rounded-md border text-xs font-code transition-colors", on ? "border-[#07191E] bg-[#02F5A1]/[0.18]" : "border-border hover:bg-surface-muted")}>{c}</button>); })}
    </div>);
  return (
    <div className="space-y-3.5 rounded-lg border border-border p-3.5">
      <Field label="When the pipeline runs">
        <div role="radiogroup" aria-label="Write mode" className="grid gap-1.5">
          {WRITE_MODES.map((m) => { const on = value.mode === m.id; return (
            <button key={m.id} type="button" role="radio" aria-checked={on} onClick={() => onChange({ ...value, mode: m.id })} className={clsx("text-left rounded-md border px-3 py-2 transition-colors", on ? "border-[#02F5A1] bg-[#02F5A1]/[0.07]" : "border-border hover:bg-surface-muted")}>
              <span className="text-[13px] font-medium">{m.label}</span><span className="block text-xs text-text-secondary mt-0.5">{m.blurb}</span>
            </button>); })}
        </div>
      </Field>
      {value.mode === "merge" && <Field label="Key columns" hint="A row matches when all of these are equal.">{chips("mergeKeys", "Key columns")}</Field>}
      <Field label="Partition by (optional)" hint="Splits the table into folders by these columns. Choose columns with few distinct values, such as a date.">{chips("partitionBy", "Partition columns")}</Field>
      {format === "iceberg" && (
        <Field label="Catalog"><Select value={value.catalog ?? ""} onChange={(e) => onChange({ ...value, catalog: (e.target.value || undefined) as LakeOptions["catalog"] })}><option value="">Choose a catalog</option>{CATALOGS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>)}
      {findings.map((f, i) => <Notice key={i} tone={f.level === "error" ? "warn" : "info"}>{f.text}</Notice>)}
    </div>
  );
}
