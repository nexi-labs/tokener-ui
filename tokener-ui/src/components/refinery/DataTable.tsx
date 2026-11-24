"use client";

import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Filter, Search, X } from "lucide-react";
import { Pager, pageCount } from "@/components/refinery/Pager";
import { ISSUES, ISSUE_BY_ID, cellIssue, fmtInt, type CellIssue } from "@/components/refinery/bits";
import type { Row } from "@/lib/refinery/types";

type Col = { name: string; type: string; pii?: boolean };
const NUMERIC = new Set(["integer", "decimal"]);
const CMP = /^(>=|<=|>|<|=)\s*(-?\d+(?:\.\d+)?)$/;
/** A column filter is a text match, or for numbers a comparison such as >100 or <=2.5. */
function passes(filter: string, shown: string, raw: unknown, numeric: boolean): boolean {
  const f = filter.trim(); if (!f) return true;
  const m = numeric ? f.match(CMP) : null;
  if (m) { const n = Number(raw); if (raw === null || raw === undefined || raw === "" || !Number.isFinite(n)) return false; const t = Number(m[2]); return m[1] === ">" ? n > t : m[1] === "<" ? n < t : m[1] === ">=" ? n >= t : m[1] === "<=" ? n <= t : n === t; }
  return shown.toLowerCase().includes(f.toLowerCase());
}

/**
 * A sample table that colours what is missing or untidy: missing values, blank text, placeholders and stray spaces, with a count per column in its header
 * and a legend that doubles as a filter. Colour is never the only cue, because each marked cell also carries a short word or a mark.
 */
export function DataTable({ columns, rows, limit = 25, render, changed, headExtra, empty = "No rows." }: {
  columns: Col[]; rows: Row[];
  /** The page size the table opens with. The reader can change it. */
  limit?: number;
  render?: (col: Col, v: unknown) => string;
  /** Marks a cell as changed by the step being previewed; the returned node replaces the plain value. */
  changed?: (col: Col, row: Row, v: unknown) => { node: React.ReactNode; className?: string } | null;
  headExtra?: (col: Col) => React.ReactNode;
  empty?: string;
}) {
  const [on, setOn] = useState(true);
  const [only, setOnly] = useState<CellIssue | null>(null);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 } | null>(null);
  const [size, setSize] = useState(limit);
  const [page, setPage] = useState(0);
  const text = (c: Col, v: unknown) => (v === null || v === undefined ? "" : render ? render(c, v) : typeof v === "boolean" ? (v ? "true" : "false") : String(v));
  const counts = useMemo(() => {
    const per: Record<string, Record<CellIssue, number>> = {}; const total: Record<CellIssue, number> = { null: 0, blank: 0, placeholder: 0, spaces: 0 };
    for (const c of columns) per[c.name] = { null: 0, blank: 0, placeholder: 0, spaces: 0 };
    for (const r of rows) for (const c of columns) { const k = cellIssue(r[c.name]); if (k) { per[c.name][k]++; total[k]++; } }
    return { per, total };
  }, [columns, rows]);
  const activeFilters = Object.values(filters).filter((f) => f.trim()).length;
  // Search and filters look at the text as shown, so a masked value can never be found by its hidden original.
  const matched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = rows.map((r, i) => ({ r, i }));
    if (needle) list = list.filter(({ r }) => columns.some((c) => text(c, r[c.name]).toLowerCase().includes(needle)));
    for (const c of columns) { const f = filters[c.name]; if (f?.trim()) list = list.filter(({ r }) => passes(f, text(c, r[c.name]), r[c.name], NUMERIC.has(c.type))); }
    if (only) list = list.filter(({ r }) => columns.some((c) => cellIssue(r[c.name]) === only));
    if (sort) {
      const c = columns.find((x) => x.name === sort.col);
      if (c) list = list.slice().sort((a, b) => {
        const x = a.r[c.name], y = b.r[c.name];
        if (x === null || x === undefined || x === "") return y === null || y === undefined || y === "" ? 0 : 1;
        if (y === null || y === undefined || y === "") return -1;
        const cmp = NUMERIC.has(c.type) ? Number(x) - Number(y) : String(x).localeCompare(String(y));
        return cmp * sort.dir;
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, columns, q, filters, only, sort, render]);
  const pages = pageCount(matched.length, size);
  useEffect(() => { if (page > pages - 1) setPage(pages - 1); }, [page, pages]);
  const shownRows = matched.slice(page * size, page * size + size);
  const reset = (fn: () => void) => { fn(); setPage(0); };
  const issueRows = rows.length ? Math.round((rows.filter((r) => columns.some((c) => cellIssue(r[c.name]))).length / rows.length) * 100) : 0;

  return (
    <div>
      <div className="px-5 py-2.5 border-b border-border flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
        <div className="relative w-full sm:w-72">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input aria-label="Search all columns" placeholder="Search all columns" value={q} onChange={(e) => reset(() => setQ(e.target.value))} className="h-8 w-full rounded-md border border-border bg-surface pl-8 pr-7 text-xs placeholder:text-text-tertiary focus:outline-none focus:border-border-strong" />
          {q && <button type="button" aria-label="Clear search" onClick={() => reset(() => setQ(""))} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"><X size={12} /></button>}
        </div>
        <button type="button" aria-pressed={showFilters} onClick={() => setShowFilters((v) => !v)} className={clsx("inline-flex items-center gap-1.5 h-8 rounded-md border px-2.5", showFilters || activeFilters ? "border-border-strong bg-surface-muted" : "border-border hover:bg-surface-subtle")}><Filter size={13} /> Column filters{activeFilters ? <span className="tabular-nums text-text-secondary">({activeFilters})</span> : null}</button>
        {(q || activeFilters > 0 || sort) && <button type="button" onClick={() => { setQ(""); setFilters({}); setSort(null); setPage(0); }} className="text-text-secondary underline underline-offset-2">Clear all</button>}
      </div>
      <div className="px-5 py-2.5 border-b border-border flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <label className="inline-flex items-center gap-2 cursor-pointer select-none"><input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="accent-[#02F5A1]" /> Highlight data issues</label>
        {on && <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Show only rows with">
          {ISSUES.map((i) => { const n = counts.total[i.id]; const sel = only === i.id; return (
            <button key={i.id} type="button" title={i.hint} aria-pressed={sel} disabled={n === 0} onClick={() => reset(() => setOnly(sel ? null : i.id))} className={clsx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 tabular-nums transition-colors disabled:opacity-40", sel ? "border-border-strong bg-surface-muted" : "border-border hover:bg-surface-subtle")}>
              <span className={clsx("h-2 w-2 rounded-full", i.dot)} />{i.label}<span className="text-text-tertiary">{fmtInt(n)}</span>
            </button>); })}
          {only && <button type="button" onClick={() => reset(() => setOnly(null))} className="text-text-secondary underline underline-offset-2 ml-1">Show all rows</button>}
        </div>}
        <span className="ml-auto text-text-tertiary tabular-nums">{issueRows}% of sampled rows have at least one issue</span>
      </div>
      <div className="overflow-auto max-h-[640px]">
        <table className="w-full text-[12px]">
          <thead className="bg-surface-subtle sticky top-0 z-10">
            <tr>{columns.map((c) => { const pc = counts.per[c.name]; const bad = on ? pc.null + pc.blank + pc.placeholder : 0; const pct = rows.length ? Math.round((bad / rows.length) * 100) : 0; return (
              <th key={c.name} className="px-3 py-2 text-left whitespace-nowrap align-top">
                {headExtra ? headExtra(c) : <><div className="font-medium text-text-secondary">{c.name}</div><div className="text-[10px] font-normal text-text-tertiary">{c.type}</div></>}
                <button type="button" aria-label={`Sort by ${c.name}`} onClick={() => reset(() => setSort(sort?.col !== c.name ? { col: c.name, dir: 1 } : sort.dir === 1 ? { col: c.name, dir: -1 } : null))} className={clsx("mt-1 inline-flex items-center gap-0.5 text-[10px] font-normal", sort?.col === c.name ? "text-text-primary" : "text-text-tertiary hover:text-text-secondary")}>{sort?.col === c.name ? (sort.dir === 1 ? <ArrowUp size={10} /> : <ArrowDown size={10} />) : <ArrowUp size={10} className="opacity-40" />}{sort?.col === c.name ? (sort.dir === 1 ? "ascending" : "descending") : "sort"}</button>
                {on && <div className="mt-1.5 flex items-center gap-1.5" title={bad ? `${bad} of ${rows.length} sampled values are missing, blank or a placeholder` : "No missing values in the sample"}>
                  <span className="h-1 w-14 rounded-full bg-surface-muted overflow-hidden flex">{ISSUES.slice(0, 3).map((i) => { const w = rows.length ? (pc[i.id] / rows.length) * 100 : 0; return w ? <span key={i.id} className={i.dot} style={{ width: `${w}%` }} /> : null; })}</span>
                  <span className={clsx("text-[10px] font-normal tabular-nums", bad ? "text-text-secondary" : "text-text-tertiary")}>{pct === 0 && bad > 0 ? "<1%" : `${pct}%`}</span>
                </div>}
              </th>); })}</tr>
            {showFilters && <tr className="border-t border-border">{columns.map((c) => (
              <th key={c.name} className="px-3 py-1.5 font-normal">
                <input aria-label={`Filter ${c.name}`} placeholder={NUMERIC.has(c.type) ? "text or >100" : "contains"} value={filters[c.name] ?? ""} onChange={(e) => reset(() => setFilters((f) => ({ ...f, [c.name]: e.target.value })))} className="h-7 w-full min-w-[96px] rounded-md border border-border bg-surface px-2 text-[11px] font-normal placeholder:text-text-tertiary focus:outline-none focus:border-border-strong" />
              </th>))}</tr>}
          </thead>
          <tbody>
            {shownRows.map(({ r, i: k }) => (
              <tr key={k} className="border-t border-border">
                {columns.map((c) => {
                  const v = r[c.name]; const iss = on ? cellIssue(v) : null; const def = iss ? ISSUE_BY_ID.get(iss)! : null;
                  const ch = changed?.(c, r, v);
                  const shown = v === null || v === undefined ? "" : render ? render(c, v) : typeof v === "boolean" ? (v ? "true" : "false") : String(v);
                  return (
                    <td key={c.name} title={def ? `${def.label}: ${def.hint}` : shown} className={clsx("px-3 py-1.5 whitespace-nowrap max-w-[260px] truncate", def?.cell, !def && ch?.className)}>
                      {iss === "null" ? <span className="italic">null</span>
                        : iss === "blank" ? <span className="italic">blank</span>
                        : iss === "spaces" ? <span>{shown.replace(/^ +/, (m) => "·".repeat(m.length)).replace(/ +$/, (m) => "·".repeat(m.length))}</span>
                        
                        : ch ? ch.node : (v === null || v === undefined || shown === "" ? <span className="text-text-tertiary">empty</span> : shown)}
                    </td>);
                })}
              </tr>))}
          </tbody>
        </table>
        {shownRows.length === 0 && <div className="p-8 text-center text-sm text-text-secondary">{rows.length === 0 ? empty : "No sampled rows match the search and filters."}</div>}
      </div>
      <Pager page={page} pages={pages} size={size} total={matched.length} filteredFrom={rows.length} onPage={setPage} onSize={(n) => { setSize(n); setPage(0); }} />
      <div className="px-5 pb-2.5 text-xs text-text-tertiary">A dot in a cell marks a stray space. Search, filters and sorting work on the sampled rows held in this view.</div>
    </div>
  );
}
