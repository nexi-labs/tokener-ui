"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { DocsNav } from "./DocsNav";
import { DocsSearch } from "./DocsSearch";

export function DocsShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { document.body.style.overflow = open ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [open]);
  return (
    <div className="min-h-screen bg-surface text-text-primary">
      <header className="sticky top-0 z-40 bg-surface/95 backdrop-blur border-b border-border">
        <div className="h-14 px-4 sm:px-6 lg:px-8 flex items-center gap-4 max-w-[1560px] mx-auto">
          <button type="button" aria-label="Open the documentation menu" onClick={() => setOpen(true)} className="lg:hidden h-9 w-9 grid place-items-center rounded-md hover:bg-surface-muted"><Menu size={18} /></button>
          <Link href="/docs" className="flex items-center gap-3 shrink-0" aria-label="tok∑ner documentation">
            <Image src="/brand/logo-light.svg" alt="tok∑ner" width={96} height={30} priority className="h-[26px] w-auto" />
            <span className="hidden sm:inline text-[13px] font-medium text-text-secondary border-l border-border-strong pl-3">Documentation</span>
          </Link>
          <div className="flex-1 max-w-md ml-auto lg:ml-8 min-w-0"><DocsSearch /></div>
          <Link href="/dashboard" className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-ink-800 text-text-inverse text-[13px] font-medium hover:bg-ink-700 shrink-0">Open the console<ArrowUpRight size={14} aria-hidden /></Link>
        </div>
      </header>
      <div className="max-w-[1560px] mx-auto lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
        <aside className="hidden lg:block sticky top-14 self-start h-[calc(100vh-3.5rem)] overflow-y-auto border-r border-border px-4 py-6"><DocsNav /></aside>
        <div className="min-w-0">{children}</div>
      </div>
      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <button type="button" aria-label="Close the menu" className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-[300px] max-w-[85vw] bg-surface p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-3"><span className="text-sm font-semibold">Documentation</span><button type="button" aria-label="Close" onClick={() => setOpen(false)} className="h-9 w-9 grid place-items-center rounded-md hover:bg-surface-muted"><X size={18} /></button></div>
            <DocsNav onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
