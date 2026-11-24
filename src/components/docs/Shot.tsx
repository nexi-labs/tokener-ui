"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useState } from "react";

const url = (name: string) => `/docs/shots/${name}.webp`;

/** A screenshot with a frame. Clicking it opens it full size. */
export function Shot({ src, alt, caption, narrow }: { src: string; alt: string; caption?: string; narrow?: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", esc); document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [open]);
  return (
    <figure className={narrow ? "my-7 max-w-[300px]" : "my-7"}>
      <button type="button" onClick={() => setOpen(true)} className="block w-full rounded-xl border border-border bg-surface overflow-hidden shadow-[0_1px_2px_rgba(7,25,30,0.06),0_8px_24px_-12px_rgba(7,25,30,0.18)] hover:border-border-strong transition-colors cursor-zoom-in" aria-label={`Enlarge: ${alt}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url(src)} alt={alt} loading="lazy" className="w-full h-auto block" />
      </button>
      {caption && <figcaption className="mt-2.5 text-[13px] text-text-secondary leading-relaxed">{caption}</figcaption>}
      {open && (
        <div role="dialog" aria-modal="true" aria-label={alt} className="fixed inset-0 z-[100] bg-ink-900/90 p-4 sm:p-8 overflow-auto cursor-zoom-out" onClick={() => setOpen(false)}>
          <button type="button" aria-label="Close" className="fixed top-4 right-4 h-10 w-10 grid place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"><X size={18} /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url(src)} alt={alt} className="mx-auto max-w-none w-[min(1800px,100%)] h-auto rounded-lg" />
        </div>
      )}
    </figure>
  );
}

/** Screenshots one after another, with previous and next, for a task that crosses screens. */
export function Walkthrough({ title, frames }: { title: string; frames: { shot: string; alt: string; caption: string }[] }) {
  const [i, setI] = useState(0);
  const f = frames[i];
  return (
    <section className="my-8 rounded-xl border border-border bg-surface-subtle p-4 sm:p-5" aria-label={title}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent-700">Walkthrough</div>
        <div className="text-xs text-text-tertiary tabular-nums">Step {i + 1} of {frames.length}</div>
      </div>
      <h3 className="text-base font-semibold text-text-primary mb-3">{title}</h3>
      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={f.shot} src={url(f.shot)} alt={f.alt} loading="lazy" className="w-full h-auto block" />
      </div>
      <p className="mt-3 text-sm text-text-secondary leading-relaxed min-h-[3.2rem]">{f.caption}</p>
      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0} className="h-9 px-3 rounded-md border border-border-strong text-sm inline-flex items-center gap-1 disabled:opacity-40 hover:bg-surface-muted"><ChevronLeft size={15} />Previous</button>
        <button type="button" onClick={() => setI((x) => Math.min(frames.length - 1, x + 1))} disabled={i === frames.length - 1} className="h-9 px-3 rounded-md bg-ink-800 text-text-inverse text-sm inline-flex items-center gap-1 disabled:opacity-40 hover:bg-ink-700">Next<ChevronRight size={15} /></button>
        <div className="flex gap-1.5 ml-auto" aria-hidden>{frames.map((_, k) => <span key={k} className={`h-1.5 w-5 rounded-full ${k === i ? "bg-accent-600" : "bg-border-strong"}`} />)}</div>
      </div>
    </section>
  );
}
