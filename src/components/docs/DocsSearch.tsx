"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { search } from "@/lib/docs/registry";

/** Search across every page. Press / or Ctrl K to focus it. */
export function DocsSearch({ large }: { large?: boolean }) {
  const [q, setQ] = useState(""); const [open, setOpen] = useState(false); const [cur, setCur] = useState(0);
  const box = useRef<HTMLDivElement>(null); const input = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => search(q), [q]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = /input|textarea/i.test((e.target as HTMLElement)?.tagName ?? "");
      if ((e.key === "/" && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) { e.preventDefault(); input.current?.focus(); }
    };
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", key); document.addEventListener("pointerdown", away);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", away); };
  }, []);
  return (
    <div ref={box} className="relative w-full">
      <div className={`flex items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 ${large ? "h-12" : "h-9"} focus-within:border-accent-600`}>
        <Search size={large ? 18 : 15} className="text-text-tertiary shrink-0" aria-hidden />
        <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); setCur(0); }} onFocus={() => setOpen(true)} role="combobox" aria-expanded={open && hits.length > 0} aria-controls="docs-hits" aria-label="Search the documentation"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setCur((c) => Math.min(hits.length - 1, c + 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setCur((c) => Math.max(0, c - 1)); }
            if (e.key === "Enter" && hits[cur]) window.location.href = hits[cur].href;
            if (e.key === "Escape") { setOpen(false); input.current?.blur(); }
          }}
          placeholder="Search the documentation" className={`flex-1 min-w-0 bg-transparent outline-none text-text-primary placeholder:text-text-tertiary ${large ? "text-base" : "text-sm"}`} />
        <kbd className="hidden sm:inline text-[10px] font-mono text-text-tertiary border border-border rounded px-1.5 py-0.5">/</kbd>
      </div>
      {open && q.trim() !== "" && (
        <ul id="docs-hits" role="listbox" className="absolute z-50 mt-1.5 left-0 right-0 max-h-[60vh] overflow-auto rounded-xl border border-border bg-surface shadow-popover p-1.5 list-none m-0">
          {hits.length === 0 ? <li className="px-3 py-3 text-sm text-text-secondary">Nothing matches "{q}". Try a shorter word.</li> : hits.map((h, i) => (
            <li key={h.href} role="option" aria-selected={i === cur}>
              <Link href={h.href} onClick={() => setOpen(false)} className={`block rounded-lg px-3 py-2.5 ${i === cur ? "bg-surface-muted" : "hover:bg-surface-subtle"}`}>
                <div className="flex items-baseline justify-between gap-3"><span className="text-sm font-medium text-text-primary">{h.title}</span><span className="text-[11px] text-text-tertiary shrink-0">{h.section}</span></div>
                <div className="text-xs text-text-secondary mt-0.5 line-clamp-2">{h.snippet}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
