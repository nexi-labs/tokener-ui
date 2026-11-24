"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowUp, Check, Copy, Database, Plus, Search, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { Notice, Tabs } from "@/components/mlops/ui";
import { ConnectorMark, Section, fmtInt, fmtRows } from "@/components/refinery/bits";
import { DataTable } from "@/components/refinery/DataTable";
import { LineageGraph } from "@/components/refinery/LineageGraph";
import { CLEANINGS, JOIN_TYPES, addSource, connNameOf, connOf, emptyModel, moveColumn, modelSql, newJoin, removeSource, runModel, setAllColumns, suggestJoins, toggleColumn, updateColumn, validateModel , type ModelCheck, type ModelResult } from "@/lib/refinery/model";
import { refinery, useRefinery, useRefineryStatus } from "@/lib/refinery/store";
import { toast } from "@/lib/mlops/toast";
import type { ColType, Dataset, ModelCleaning, ModelJoin, ModelSpec } from "@/lib/refinery/types";

const TYPES: ColType[] = ["string", "integer", "decimal", "boolean", "date", "timestamp"];
type Tab = "preview" | "lineage" | "definition";

export function ModelBuilder() {
  const { datasets, connections } = useRefinery();
  const isLive = useRefineryStatus().mode === "live";
  const [saving, setSaving] = useState(false); const [saveErr, setSaveErr] = useState<string | null>(null);
  const router = useRouter();
  const [spec, setSpec] = useState<ModelSpec>(emptyModel());
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("preview");
  const [copied, setCopied] = useState(false);

  const ds = (alias: string) => datasets.find((d) => d.id === spec.sources.find((s) => s.alias === alias)?.datasetId);
  const localCheck = useMemo(() => validateModel(spec, datasets, name || "unified"), [spec, datasets, name]);
  const localRes = useMemo(() => runModel(spec, datasets), [spec, datasets]);
  const localSql = useMemo(() => modelSql(spec, datasets, connNameOf(connections)), [spec, datasets, connections]);
  // A signed-in workspace asks the server to join the samples a moment after the last edit. Its answer replaces the in-browser one,
  // so the checks, the match counts and the SQL are what a save would produce. The in-browser answer shows while the server is asked.
  const specKey = JSON.stringify([spec, name]);
  const [server, setServer] = useState<{ key: string; check: ModelCheck; result: ModelResult | null; sql: string } | null>(null);
  useEffect(() => {
    if (!isLive || spec.sources.length === 0) return;
    const t = setTimeout(async () => {
      const r = await refinery.previewModel(name || "unified", spec);
      setServer({ key: specKey, check: r.ok ? r.check : { errors: [r.error ?? "The server could not check this definition."], warnings: [] }, result: r.ok ? r.result : null, sql: r.ok ? r.sql : "" });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, specKey]);
  const fromServer = isLive && server?.key === specKey ? server : null;
  const check = fromServer ? fromServer.check : localCheck;
  const res = fromServer?.result ?? localRes;
  const sql = fromServer && fromServer.sql ? fromServer.sql : localSql;
  const hints = useMemo(() => suggestJoins(spec, datasets), [spec, datasets]);
  const nameErr = name && !/^[a-z][a-z0-9_]{1,59}$/.test(name) ? "Start with a letter. Use lower case letters, digits and underscores." : null;
  const nameTaken = datasets.find((d) => d.name === name);
  const canCreate = check.errors.length === 0 && !!name && !nameErr;

  // ---- tables
  const groups = useMemo(() => {
    const m = new Map<string, { label: string; conn?: string; items: Dataset[] }>();
    for (const d of datasets) {
      const c = connOf(d, connections);
      const key = c ? c.id : d.source.kind === "model" ? "model" : "files";
      const g = m.get(key) ?? { label: c ? c.name : d.source.kind === "model" ? "Unified datasets" : "Uploaded files and documents", conn: c?.connector, items: [] };
      g.items.push(d); m.set(key, g);
    }
    return [...m.values()].map((g) => ({ ...g, items: g.items.filter((d) => !q || `${d.name} ${g.label}`.toLowerCase().includes(q.toLowerCase())) })).filter((g) => g.items.length);
  }, [datasets, connections, q]);

  const add = (d: Dataset) => {
    // A signed-in workspace lists tables without their rows. The preview and the join hints need them, so load them as the table is added.
    if (isLive) void refinery.openDataset(d.id);
    let next = addSource(spec, d);
    if (next.sources.length > 1) {
      const alias = next.sources[next.sources.length - 1].alias;
      const best = suggestJoins(next, datasets).find((h) => h.rightAlias === alias);
      next = { ...next, joins: [...next.joins, best ? newJoin(best.leftAlias, best.leftColumn, best.rightAlias, best.rightColumn) : newJoin(next.sources[0].alias, "", alias, "")] };
    }
    setSpec(next);
  };
  const remove = (alias: string) => setSpec(removeSource(spec, alias));
  const patchJoin = (id: string, patch: Partial<ModelJoin>) => setSpec({ ...spec, joins: spec.joins.map((j) => (j.id === id ? { ...j, ...patch } : j)) });
  const dropJoin = (id: string) => setSpec({ ...spec, joins: spec.joins.filter((j) => j.id !== id) });

  const create = async () => {
    if (!canCreate || saving) return;
    const bytes = Math.round(res.estRows * spec.columns.length * 18);
    setSaving(true); setSaveErr(null);
    const made = await refinery.createModel(name, desc || "One schema from several tables: columns chosen, related by keys and cleaned once.", spec, {
      name, description: desc || "One schema from several tables: columns chosen, related by keys and cleaned once.", source: { kind: "model", spec, sql }, format: "table",
      totalRows: res.estRows, sizeBytes: bytes, sample: res.rows.slice(0, 400),
      columns: spec.columns.map((c) => ({ name: c.as, type: c.type, role: ds(c.alias)?.columns.find((x) => x.name === c.column)?.role === "identifier" ? "identifier" : "feature" })),
    });
    setSaving(false);
    if (!made.ok) { setSaveErr(made.error); return; }
    const d = made.dataset;
    toast(`Created ${d.name}`);
    router.push(`/refinery/datasets/${d.id}?tab=lineage`);
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <Link href="/refinery/datasets" className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary"><ArrowLeft size={13} /> Datasets</Link>
        <h2 className="text-lg font-semibold tracking-tight mt-3">Build a unified dataset</h2>
        <p className="text-sm text-text-secondary mt-1 max-w-2xl">Pick tables from one or several connections, choose the columns you want, say how the tables relate, and clean and name the columns once. The result is one dataset with one schema that recipes, runs and streams can use like any other.</p>
      </div>
      {isLive
        ? <Notice tone="info" title="Preview on sample rows">The preview below uses the first rows of each table, so match counts describe the samples. When you save, the platform checks the definition on those same rows and keeps the schema, a profile and an estimated row count. A run that reads this dataset builds it from the whole of each table. Tables read through a connection need a runner pool and cannot be combined here yet.</Notice>
        : <Notice tone="info" title="Sample workspace">The join below runs on the sample rows kept in your browser, so match counts describe the samples. In a connected workspace the same definition runs on a runner next to your data, and the control plane never reads the tables.</Notice>}

      {/* 1 */}
      <Section title="1. Choose tables" hint="Tables are listed by connection. Add as many as you need."
        action={<div className="relative w-56"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" /><Input aria-label="Search tables" placeholder="Search tables" className="pl-8 h-8 text-xs" value={q} onChange={(e) => setQ(e.target.value)} /></div>}>
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="flex items-center gap-2 mb-2">{g.conn ? <ConnectorMark id={g.conn} size={22} /> : <div className="h-[22px] w-[22px] rounded-md bg-surface-muted grid place-items-center"><Database size={12} className="text-text-secondary" /></div>}<span className="text-[13px] font-medium">{g.label}</span><span className="text-xs text-text-tertiary">{g.items.length} table{g.items.length === 1 ? "" : "s"}</span></div>
              <div className="grid sm:grid-cols-2 gap-2">
                {g.items.map((d) => { const on = spec.sources.some((s) => s.datasetId === d.id); return (
                  <button key={d.id} type="button" aria-pressed={on} onClick={() => (on ? remove(spec.sources.find((s) => s.datasetId === d.id)!.alias) : add(d))}
                    className={clsx("flex items-center gap-3 rounded-md border px-3.5 py-2.5 text-left transition-colors", on ? "border-[#02F5A1] bg-[#02F5A1]/10" : "border-border hover:bg-surface-subtle")}>
                    <span className={clsx("h-5 w-5 rounded border grid place-items-center shrink-0", on ? "bg-[#07191E] border-[#07191E]" : "border-border-strong")}>{on && <Check size={13} className="text-[#02F5A1]" />}</span>
                    <span className="min-w-0 flex-1"><span className="block text-[13px] font-medium truncate">{d.name}</span><span className="block text-xs text-text-tertiary truncate">{fmtRows(d.totalRows)} rows, {d.columns.length} columns</span></span>
                  </button>); })}
              </div>
            </div>))}
          {groups.length === 0 && <p className="text-sm text-text-secondary py-4">No table matches your search.</p>}
        </div>
      </Section>

      {/* 2 */}
      <Section title="2. Choose columns" hint="Tick the columns that belong in the result. Leave out what you do not need.">
        {spec.sources.length === 0 ? <p className="text-sm text-text-secondary">Choose a table first.</p> : (
          <div className="space-y-5">
            {spec.sources.map((s) => { const d = ds(s.alias); if (!d) return null; const n = spec.columns.filter((c) => c.alias === s.alias).length; const c = connOf(d, connections); return (
              <div key={s.alias} className="rounded-md border border-border">
                <div className="flex flex-wrap items-center gap-3 px-3.5 py-2.5 border-b border-border">
                  {c ? <ConnectorMark id={c.connector} size={26} /> : null}
                  <div className="min-w-0"><span className="text-[13px] font-medium">{d.name}</span> <span className="font-mono text-[11px] text-text-tertiary">{s.alias}</span></div>
                  <span className="text-xs text-text-tertiary tabular-nums">{n} of {d.columns.length} selected</span>
                  <div className="ml-auto flex gap-1.5"><Button className="h-7 px-2.5 text-xs" onClick={() => setSpec(setAllColumns(spec, s.alias, d, true))}>Select all</Button><Button className="h-7 px-2.5 text-xs" onClick={() => setSpec(setAllColumns(spec, s.alias, d, false))}>Clear</Button></div>
                </div>
                <div className="p-3.5 flex flex-wrap gap-2">
                  {d.columns.map((col) => { const on = spec.columns.some((x) => x.alias === s.alias && x.column === col.name); const pii = d.profile.columns.find((x) => x.name === col.name)?.pii; return (
                    <button key={col.name} type="button" aria-pressed={on} onClick={() => setSpec(toggleColumn(spec, s.alias, d, col.name))} className={clsx("inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors", on ? "border-[#02F5A1] bg-[#02F5A1]/10" : "border-border hover:bg-surface-subtle")}>
                      <span className={clsx("h-3.5 w-3.5 rounded-sm border grid place-items-center", on ? "bg-[#07191E] border-[#07191E]" : "border-border-strong")}>{on && <Check size={10} className="text-[#02F5A1]" />}</span>
                      <span className="font-medium">{col.name}</span><span className="text-text-tertiary">{col.type}</span>{pii && <span className="text-[10px] uppercase tracking-wide text-text-tertiary">personal</span>}
                    </button>); })}
                </div>
              </div>); })}
          </div>)}
      </Section>

      {/* 3 */}
      <Section title="3. How the tables relate" hint="Rows are matched on the columns you choose. Emails are compared after trimming spaces and ignoring capital letters.">
        {spec.sources.length < 2 ? <p className="text-sm text-text-secondary">Add a second table to relate it to the first. With one table there is nothing to match.</p> : (
          <div className="space-y-4">
            {hints.length > 0 && <div className="rounded-md bg-surface-subtle px-3.5 py-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-text-secondary mb-2"><Sparkles size={13} /> Columns that look related</div>
              <div className="flex flex-wrap gap-2">{hints.slice(0, 5).map((h) => { const key = `${h.leftAlias}.${h.leftColumn}=${h.rightAlias}.${h.rightColumn}`; const applied = spec.joins.some((j) => j.leftAlias === h.leftAlias && j.leftColumn === h.leftColumn && j.rightAlias === h.rightAlias && j.rightColumn === h.rightColumn); return (
                <button key={key} type="button" disabled={applied} onClick={() => { const cur = spec.joins.find((j) => j.rightAlias === h.rightAlias && !j.leftColumn); setSpec({ ...spec, joins: cur ? spec.joins.map((j) => (j === cur ? { ...j, leftAlias: h.leftAlias, leftColumn: h.leftColumn, rightColumn: h.rightColumn } : j)) : [...spec.joins, newJoin(h.leftAlias, h.leftColumn, h.rightAlias, h.rightColumn)] }); }} className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs hover:bg-surface-muted disabled:opacity-60">
                  <span className="font-mono">{h.leftAlias}.{h.leftColumn} = {h.rightAlias}.{h.rightColumn}</span><span className="text-text-tertiary">{h.reason}</span>{applied ? <Check size={12} /> : <Plus size={12} />}
                </button>); })}</div>
            </div>}
            {spec.sources.slice(1).map((s, idx) => { const d = ds(s.alias); const js = spec.joins.filter((j) => j.rightAlias === s.alias); const st = res.stats.find((x) => x.rightAlias === s.alias); const earlier = spec.sources.slice(0, idx + 1); return (
              <div key={s.alias} className="rounded-md border border-border p-3.5 space-y-3">
                <div className="text-[13px] font-medium">Relate <span className="font-mono">{s.alias}</span> ({d?.name}) to the tables before it</div>
                {js.map((j, ji) => { const left = ds(j.leftAlias); return (
                  <div key={j.id} className="space-y-3">
                    <div className="grid md:grid-cols-[1fr_auto_1fr_auto] gap-3 items-end">
                      <Field label={ji === 0 ? "Column in an earlier table" : "And another column"}>
                        <Select value={`${j.leftAlias}.${j.leftColumn}`} onChange={(e) => { const [a, ...c] = e.target.value.split("."); patchJoin(j.id, { leftAlias: a, leftColumn: c.join(".") }); }}>
                          <option value=".">Choose a column</option>
                          {earlier.map((e) => <optgroup key={e.alias} label={ds(e.alias)?.name}>{ds(e.alias)?.columns.map((c) => <option key={c.name} value={`${e.alias}.${c.name}`}>{e.alias}.{c.name}</option>)}</optgroup>)}
                        </Select>
                      </Field>
                      <span className="hidden md:block pb-2 text-text-tertiary text-sm">matches</span>
                      <Field label={`Column in ${d?.name}`}>
                        <Select value={j.rightColumn} onChange={(e) => patchJoin(j.id, { rightColumn: e.target.value })}>
                          <option value="">Choose a column</option>{d?.columns.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.type})</option>)}
                        </Select>
                      </Field>
                      {js.length > 1 ? <button type="button" aria-label="Remove this pair" onClick={() => dropJoin(j.id)} className="h-9 w-9 grid place-items-center rounded-md text-text-tertiary hover:bg-surface-muted"><X size={15} /></button> : <span />}
                    </div>
                    {ji === 0 && <div className="grid sm:grid-cols-2 gap-3 items-end">
                      <Field label="Keep"><Select value={j.type} onChange={(e) => patchJoin(j.id, { type: e.target.value as ModelJoin["type"] })}>{JOIN_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select></Field>
                      <label className="inline-flex items-center gap-2 text-xs pb-2 cursor-pointer"><input type="checkbox" className="accent-[#02F5A1]" checked={j.normalise} onChange={(e) => spec.joins.filter((x) => x.rightAlias === s.alias).forEach((x) => patchJoin(x.id, { normalise: e.target.checked }))} /> Ignore spaces and capital letters when matching</label>
                    </div>}
                    {left && j.leftColumn && ji === 0 && <p className="text-xs text-text-tertiary">{JOIN_TYPES.find((t) => t.id === j.type)?.hint}</p>}
                  </div>); })}
                <button type="button" onClick={() => setSpec({ ...spec, joins: [...spec.joins, newJoin(spec.sources[0].alias, "", s.alias, "", js[0]?.type ?? "left", js[0]?.normalise ?? true)] })} className="text-xs text-text-secondary underline underline-offset-2">Match on another pair of columns</button>
                {st && <div className="rounded-md bg-surface-subtle px-3 py-2 text-xs text-text-secondary tabular-nums">On the samples, {fmtInt(st.matchedLeft)} of {fmtInt(st.leftRows)} rows found a match, {fmtInt(st.nullKeysLeft)} had no key, and {fmtInt(st.unmatchedRight)} of {fmtInt(st.rightRows)} rows in {d?.name} matched nothing. {st.rightKeyUnique ? "The key is unique there, so rows are not repeated." : "The key repeats there, so one row can match several."}</div>}
              </div>); })}
          </div>)}
      </Section>

      {/* 4 */}
      <Section title="4. Result columns" hint="Name each column, set its type, and clean it. Order here is the order in the result.">
        {spec.columns.length === 0 ? <p className="text-sm text-text-secondary">No columns chosen yet.</p> : (
          <div className="space-y-3">
            <div className="rounded-md border border-border overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-surface-subtle"><tr>{["Name in result", "From", "Type", "Cleaning", ""].map((h, i) => <th key={i} className="px-3 py-2 text-left font-medium text-text-secondary whitespace-nowrap">{h}</th>)}</tr></thead>
                <tbody>{spec.columns.map((c, i) => { const dup = spec.columns.some((x) => x.id !== c.id && x.as === c.as); const bad = !/^[a-z][a-z0-9_]{0,62}$/.test(c.as) || dup; const pii = ds(c.alias)?.profile.columns.find((x) => x.name === c.column)?.pii; return (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-3 py-1.5"><Input aria-label={`Name of ${c.id}`} aria-invalid={bad} value={c.as} onChange={(e) => setSpec(updateColumn(spec, c.id, { as: e.target.value.toLowerCase() }))} className={clsx("h-8 text-xs font-mono min-w-[150px]", bad && "border-status-down")} /></td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-text-secondary">{ds(c.alias)?.name}.{c.column}{pii && <span className="ml-2"><Badge tone="degraded">Personal data</Badge></span>}</td>
                    <td className="px-3 py-1.5"><Select aria-label={`Type of ${c.as}`} value={c.type} onChange={(e) => setSpec(updateColumn(spec, c.id, { type: e.target.value as ColType }))} className="h-8 text-xs">{TYPES.map((t) => <option key={t}>{t}</option>)}</Select></td>
                    <td className="px-3 py-1.5"><Select aria-label={`Cleaning of ${c.as}`} value={c.clean} onChange={(e) => setSpec(updateColumn(spec, c.id, { clean: e.target.value as ModelCleaning }))} className="h-8 text-xs">{CLEANINGS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select></td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => setSpec(moveColumn(spec, c.id, -1))} className="h-7 w-7 inline-grid place-items-center rounded text-text-tertiary hover:bg-surface-muted disabled:opacity-30"><ArrowUp size={14} /></button>
                      <button type="button" aria-label="Move down" disabled={i === spec.columns.length - 1} onClick={() => setSpec(moveColumn(spec, c.id, 1))} className="h-7 w-7 inline-grid place-items-center rounded text-text-tertiary hover:bg-surface-muted disabled:opacity-30"><ArrowDown size={14} /></button>
                      <button type="button" aria-label="Remove column" onClick={() => setSpec({ ...spec, columns: spec.columns.filter((x) => x.id !== c.id) })} className="h-7 w-7 inline-grid place-items-center rounded text-text-tertiary hover:bg-surface-muted"><X size={14} /></button>
                    </td>
                  </tr>); })}</tbody>
              </table>
            </div>
            <label className="inline-flex items-center gap-2 text-[13px] cursor-pointer"><input type="checkbox" className="accent-[#02F5A1]" checked={spec.dropDuplicates} onChange={(e) => setSpec({ ...spec, dropDuplicates: e.target.checked })} /> Remove rows that are exact duplicates in the result</label>
          </div>)}
      </Section>

      {/* 5 */}
      <Section title="5. Name it and check the result" hint="Nothing is saved until you create the dataset.">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Dataset name" hint={nameErr ?? (nameTaken ? `Adds a new version of ${name}.` : "Lower case letters, digits and underscores.")}><Input value={name} onChange={(e) => setName(e.target.value.toLowerCase())} aria-invalid={!!nameErr} placeholder="customer_360" /></Field>
          <Field label="Description (optional)"><Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What this dataset is for" /></Field>
        </div>
        <div className="mt-4 space-y-2">
          {check.errors.map((e) => <Notice key={e} tone="bad">{e}</Notice>)}
          {check.warnings.map((w) => <Notice key={w} tone="warn">{w}</Notice>)}
        </div>
        <div className="mt-4">
          <Tabs<Tab> label="Result views" value={tab} onChange={setTab} tabs={[{ id: "preview", label: "Preview" }, { id: "lineage", label: "Lineage" }, { id: "definition", label: "Definition" }]} />
          <div className="pt-4">
            {tab === "preview" && (spec.columns.length === 0 ? <p className="text-sm text-text-secondary">Choose columns to see a preview.</p> : (
              <div className="rounded-md border border-border overflow-hidden">
                <DataTable columns={res.columns} rows={res.rows} limit={10} empty="No rows came out of the join on the samples. Check the matching columns." />
              </div>))}
            {tab === "preview" && spec.columns.length > 0 && <p className="text-xs text-text-tertiary mt-2 tabular-nums">{fmtInt(res.sampleRows)} rows from the samples{res.capped ? ", capped" : ""}. The whole table would hold about {fmtRows(res.estRows)} rows (an estimate scaled from the first table).</p>}
            {tab === "lineage" && (spec.sources.length === 0 ? <p className="text-sm text-text-secondary">Choose a table to see the lineage.</p> : <LineageGraph spec={spec} datasets={datasets} connections={connections} name={name} result={res} />)}
            {tab === "definition" && <div>
              <div className="flex justify-end mb-2"><Button className="h-7 px-2.5 text-xs" onClick={() => { navigator.clipboard?.writeText(sql).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => toast("Copy is not available here")); }}>{copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}</Button></div>
              <pre className="rounded-md bg-[#07191E] text-[#d7f9ec] p-4 text-[12px] leading-relaxed overflow-auto max-h-[420px]"><code>{sql || "-- Choose a table."}</code></pre>
              <p className="text-xs text-text-tertiary mt-2">The definition is what a runner executes. Secrets are never part of it: each table is read through its connection.</p>
            </div>}
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {saveErr && <p role="alert" className="text-xs text-danger-600 mr-auto">{saveErr}</p>}
          <Button variant="primary" disabled={!canCreate || saving} onClick={create}>{saving ? "Saving" : nameTaken ? `Create version ${nameTaken.version + 1}` : "Create dataset"}</Button>
          <Link href="/refinery/datasets"><Button variant="secondary">Cancel</Button></Link>
          {!canCreate && <span className="text-xs text-text-tertiary">{check.errors[0] ?? (!name ? "Give the dataset a name." : nameErr)}</span>}
        </div>
      </Section>
    </div>
  );
}
