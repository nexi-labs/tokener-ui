"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, ExternalLink, Highlighter, Minus, Plus } from "lucide-react";
import type { ClaimField } from "@/lib/agents/claims";

/**
 * Shows the pages of a document the way an approver reads it, with the values the agent extracted outlined where it read them.
 * The pages are images of the PDF so the same view works everywhere. The original PDF opens in its own tab and can be downloaded.
 */
export function DocumentViewer({ title, pages, pdf, fields, active, onActive, flagged }: { title: string; pages: string[]; pdf: string; fields: ClaimField[]; active: string | null; onActive: (key: string | null) => void; /** Field keys the agent found a problem with. */ flagged?: string[] }) {
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [boxes, setBoxes] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);

  // Selecting a field in the list brings its page into view and scrolls to the value.
  useEffect(() => {
    if (!active) return;
    const f = fields.find((x) => x.key === active); if (!f) return;
    setPage(f.page);
    const t = setTimeout(() => { const el = scroller.current; if (el) el.scrollTo({ top: Math.max(0, f.box[1] * el.scrollHeight - 120), behavior: "smooth" }); }, 60);
    return () => clearTimeout(t);
  }, [active, fields]);
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [page]);

  const here = fields.filter((f) => f.page === page);
  const step = (d: number) => setPage((p) => Math.min(pages.length, Math.max(1, p + d)));
  const btn = "h-8 w-8 grid place-items-center rounded-md text-text-secondary hover:bg-surface-muted hover:text-text-primary disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden flex flex-col min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1 min-w-0">
          <button className={btn} onClick={() => step(-1)} disabled={page === 1} aria-label="Previous page"><ChevronLeft size={16} /></button>
          <span className="text-[13px] tabular-nums px-1 whitespace-nowrap">Page {page} of {pages.length}</span>
          <button className={btn} onClick={() => step(1)} disabled={page === pages.length} aria-label="Next page"><ChevronRight size={16} /></button>
        </div>
        <div className="flex items-center gap-1">
          <button className={clsx("h-8 px-2.5 rounded-md text-[13px] inline-flex items-center gap-1.5", boxes ? "bg-surface-muted text-text-primary" : "text-text-secondary hover:bg-surface-muted")} onClick={() => setBoxes((b) => !b)} aria-pressed={boxes}><Highlighter size={14} /> Values read</button>
          <span className="w-px h-5 bg-border mx-1" aria-hidden />
          <button className={btn} onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(1)))} aria-label="Zoom out"><Minus size={14} /></button>
          <span className="text-xs tabular-nums w-10 text-center text-text-secondary">{Math.round(zoom * 100)}%</span>
          <button className={btn} onClick={() => setZoom((z) => Math.min(2, +(z + 0.2).toFixed(1)))} aria-label="Zoom in"><Plus size={14} /></button>
          <span className="w-px h-5 bg-border mx-1" aria-hidden />
          <a className={btn} href={pdf} target="_blank" rel="noreferrer" aria-label="Open the original PDF in a new tab" title="Open the original PDF"><ExternalLink size={14} /></a>
          <a className={btn} href={pdf} download aria-label="Download the PDF" title="Download the PDF"><Download size={14} /></a>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="hidden sm:flex flex-col gap-2 p-2 border-r border-border bg-surface-subtle w-[60px] shrink-0 overflow-y-auto" aria-label="Pages">
          {pages.map((src, i) => (
            <button key={src} onClick={() => setPage(i + 1)} aria-label={`Page ${i + 1}`} aria-current={page === i + 1} className={clsx("rounded border overflow-hidden bg-white", page === i + 1 ? "border-accent-600 ring-2 ring-accent-500/30" : "border-border hover:border-border-strong")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="w-full block" loading="lazy" />
            </button>
          ))}
        </div>
        <div ref={scroller} className="flex-1 overflow-auto bg-surface-muted p-4 max-h-[min(78vh,900px)] min-h-[480px]">
          <div className="relative mx-auto bg-white shadow-card" style={{ width: `${Math.round(zoom * 100)}%`, maxWidth: zoom > 1 ? "none" : 760, minWidth: 320 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pages[page - 1]} alt={`${title}, page ${page}`} className="w-full block select-none" draggable={false} />
            {boxes && here.map((f) => {
              const on = active === f.key; const bad = flagged?.includes(f.key);
              return (
                <button key={f.key} onClick={() => onActive(on ? null : f.key)} aria-label={`${f.label}: ${f.value}`} title={`${f.label}: ${f.value}`}
                  className={clsx("absolute rounded-[3px] transition-all", on ? "ring-2 ring-offset-1 ring-offset-white" : "hover:ring-2", bad ? "ring-status-down bg-status-down/10" : "ring-accent-600 bg-accent-500/15")}
                  style={{ left: `${f.box[0] * 100}%`, top: `${f.box[1] * 100}%`, width: `${f.box[2] * 100}%`, height: `${f.box[3] * 100}%`, boxShadow: on ? undefined : bad ? "inset 0 0 0 1px rgba(220,38,38,.55)" : "inset 0 0 0 1px rgba(5,150,105,.45)" }} />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
