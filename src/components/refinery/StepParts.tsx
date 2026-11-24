"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input, Select, Toggle } from "@/components/ui/Form";
import { Modal } from "@/components/mlops/ui";
import { GROUPS, STEPS, type Col, type ParamDef, type StepDef } from "@/lib/refinery/steps";
import { FUNCTIONS } from "@/lib/refinery/catalog";
import { CONNECTOR_BY_ID } from "@/lib/refinery/connectors";
import { useRefinery } from "@/lib/refinery/store";
import type { Step } from "@/lib/refinery/types";

/** The form for one step, drawn from the step's parameter definitions. Column choices are the columns that exist at that point in the recipe. */
export function StepForm({ def, step, cols, onChange }: { def: StepDef; step: Step; cols: Col[]; onChange: (params: Record<string, unknown>) => void }) {
  const set = (k: string, v: unknown) => onChange({ ...step.params, [k]: v });
  return (
    <div className="space-y-4">
      {def.params.map((p) => (
        <div key={p.key} className={p.kind === "boolean" ? "" : "block"}>
          {p.kind !== "boolean" && <span className="block text-[13px] font-medium text-text-primary mb-1.5">{p.label}{p.optional ? <span className="text-text-tertiary font-normal"> (optional)</span> : ""}</span>}
          <Control p={p} value={step.params[p.key]} cols={cols} set={(v) => set(p.key, v)} />
          {p.hint && p.kind !== "boolean" && <span className="block text-xs text-text-tertiary mt-1.5">{p.hint}</span>}
        </div>
      ))}
    </div>
  );
}

function Control({ p, value, cols, set }: { p: ParamDef; value: unknown; cols: Col[]; set: (v: unknown) => void }) {
  switch (p.kind) {
    case "column":
      return <Select value={String(value ?? "")} onChange={(e) => set(e.target.value)} aria-label={p.label}><option value="">Choose a column</option>{cols.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.type})</option>)}</Select>;
    case "columns": {
      const sel = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={p.label}>
          {cols.map((c) => { const on = sel.includes(c.name); return (
            <button key={c.name} type="button" aria-pressed={on} onClick={() => set(on ? sel.filter((x) => x !== c.name) : [...sel, c.name])}
              className={clsx("h-7 px-2.5 rounded-md border text-xs", on ? "border-accent-600 bg-accent-50 text-text-primary font-medium" : "border-border text-text-secondary hover:border-border-strong")}>{c.name}</button>); })}
          {sel.filter((s) => !cols.some((c) => c.name === s)).map((s) => <span key={s} className="h-7 px-2.5 rounded-md border border-status-down/40 text-xs text-status-down inline-flex items-center">{s} (missing)</span>)}
        </div>
      );
    }
    case "select":
      return <Select value={String(value ?? p.def ?? "")} onChange={(e) => set(e.target.value)} aria-label={p.label}>{p.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>;
    case "number":
      return <Input type="number" value={value === undefined || value === "" ? "" : String(value)} onChange={(e) => set(e.target.value === "" ? "" : Number(e.target.value))} aria-label={p.label} />;
    case "multi": {
      const sel = Array.isArray(value) ? (value as string[]) : [];
      return <div className="flex flex-wrap gap-1.5" role="group" aria-label={p.label}>{p.options!.map((o) => { const on = sel.includes(o.value); return <button key={o.value} type="button" aria-pressed={on} onClick={() => set(on ? sel.filter((x) => x !== o.value) : [...sel, o.value])} className={clsx("h-7 px-2.5 rounded-md border text-xs", on ? "border-accent-600 bg-accent-50 text-text-primary font-medium" : "border-border text-text-secondary hover:border-border-strong")}>{o.label}</button>; })}</div>;
    }
    case "function": {
      const f = FUNCTIONS.find((x) => x.id === value);
      return <div className="space-y-1.5"><Select value={String(value ?? "")} onChange={(e) => set(e.target.value)} aria-label={p.label}><option value="">Choose a function</option>{FUNCTIONS.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.runtime})</option>)}</Select>{f && <p className="text-xs text-text-tertiary">{f.blurb} Takes {f.input}, returns {f.output}.</p>}</div>;
    }
    case "connection":
      return <ConnectionSelect value={String(value ?? "")} set={set} label={p.label} />;
    case "boolean":
      return <Toggle checked={value !== false && value !== undefined ? !!value : false} onChange={set} label={p.label} />;
    case "lines":
      return <textarea value={String(value ?? "")} onChange={(e) => set(e.target.value)} rows={4} aria-label={p.label} className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-accent-500/40" />;
    default:
      return <Input value={String(value ?? "")} placeholder={p.placeholder} onChange={(e) => set(e.target.value)} aria-label={p.label} spellCheck={false} />;
  }
}

export function StepPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (op: string) => void }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => STEPS.filter((s) => !q || `${s.label} ${s.blurb} ${s.group}`.toLowerCase().includes(q.toLowerCase())), [q]);
  return (
    <Modal open={open} onClose={() => { setQ(""); onClose(); }} wide title="Add a step">
      <div className="space-y-5">
        <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" /><Input autoFocus aria-label="Search steps" placeholder="Search steps, for example trim, duplicates, mask" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {GROUPS.map((g) => { const items = list.filter((s) => s.group === g); if (!items.length) return null; return (
          <div key={g}>
            <h3 className="text-[11px] uppercase tracking-wide text-text-tertiary mb-2">{g}</h3>
            <div className="grid sm:grid-cols-2 gap-2">
              {items.map((s) => (
                <button key={s.op} onClick={() => { setQ(""); onPick(s.op); }} className="text-left rounded-md border border-border hover:border-border-strong hover:bg-surface-subtle px-3 py-2.5">
                  <span className="flex items-center gap-2 text-[13px] font-medium">{s.label}{s.ai && <span className="text-[10px] uppercase tracking-wide text-text-tertiary border border-border-strong rounded px-1 py-px">Model</span>}{!s.streamable && <span className="text-[10px] uppercase tracking-wide text-text-tertiary border border-border-strong rounded px-1 py-px">Batch only</span>}</span>
                  <span className="block text-xs text-text-secondary mt-0.5">{s.blurb}</span>
                </button>
              ))}
            </div>
          </div>); })}
        {list.length === 0 && <p className="text-sm text-text-secondary text-center py-6">No step matches. Try another word.</p>}
      </div>
    </Modal>
  );
}

function ConnectionSelect({ value, set, label }: { value: string; set: (v: unknown) => void; label: string }) {
  const { connections } = useRefinery();
  return <Select value={value} onChange={(e) => set(e.target.value)} aria-label={label}><option value="">Choose a connection</option>{connections.filter((c) => c.state !== "failed" && ["Databases", "Warehouses and lakehouses", "Files and APIs"].includes(CONNECTOR_BY_ID.get(c.connector)?.group ?? "")).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>;
}
