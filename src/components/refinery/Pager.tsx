"use client";

import clsx from "clsx";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { fmtInt } from "@/components/refinery/bits";

export const PAGE_SIZES = [10, 25, 50, 100] as const;

/** First, previous, next and last page controls with a page size, for any list or table that shows rows from a source or a destination. */
export function Pager({ page, pages, size, total, filteredFrom, onPage, onSize, sizes = PAGE_SIZES, className }: {
  page: number; pages: number; size: number; total: number; filteredFrom?: number;
  onPage: (p: number) => void; onSize: (s: number) => void; sizes?: readonly number[]; className?: string;
}) {
  const from = total === 0 ? 0 : page * size + 1, to = Math.min(total, (page + 1) * size);
  const btn = "h-7 w-7 grid place-items-center rounded-md border border-border text-text-secondary hover:bg-surface-subtle disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <div className={clsx("px-5 py-2.5 border-t border-border flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-text-secondary", className)}>
      <span className="tabular-nums" aria-live="polite">Rows {fmtInt(from)} to {fmtInt(to)} of {fmtInt(total)}{filteredFrom !== undefined && filteredFrom !== total ? <span className="text-text-tertiary"> (filtered from {fmtInt(filteredFrom)})</span> : null}</span>
      <label className="inline-flex items-center gap-2 ml-auto">Rows per page
        <select value={size} onChange={(e) => onSize(Number(e.target.value))} className="h-7 rounded-md border border-border bg-surface px-1.5 text-xs">{sizes.map((s) => <option key={s} value={s}>{s}</option>)}</select>
      </label>
      <div className="inline-flex items-center gap-1.5">
        <button type="button" className={btn} aria-label="First page" disabled={page <= 0} onClick={() => onPage(0)}><ChevronsLeft size={14} /></button>
        <button type="button" className={btn} aria-label="Previous page" disabled={page <= 0} onClick={() => onPage(page - 1)}><ChevronLeft size={14} /></button>
        <span className="px-1.5 tabular-nums">Page {fmtInt(Math.min(page + 1, Math.max(1, pages)))} of {fmtInt(Math.max(1, pages))}</span>
        <button type="button" className={btn} aria-label="Next page" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}><ChevronRight size={14} /></button>
        <button type="button" className={btn} aria-label="Last page" disabled={page >= pages - 1} onClick={() => onPage(pages - 1)}><ChevronsRight size={14} /></button>
      </div>
    </div>
  );
}

/** Page count for a row total, never below one. */
export const pageCount = (total: number, size: number) => Math.max(1, Math.ceil(total / size));
