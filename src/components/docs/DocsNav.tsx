"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { SECTIONS } from "@/lib/docs/registry";

/** The section list on the left. The section holding the current page is open; the others open on click. */
export function DocsNav({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const [open, setOpen] = useState<Set<string>>(new Set());
  useEffect(() => {
    const s = SECTIONS.find((x) => path.startsWith(`/docs/${x.id}/`));
    if (s) setOpen((p) => (p.has(s.id) ? p : new Set(p).add(s.id)));
  }, [path]);
  const toggle = (id: string) => setOpen((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <nav aria-label="Documentation" className="text-sm">
      <Link href="/docs" onClick={onNavigate} className={clsx("block px-2.5 py-1.5 rounded-md mb-1", path === "/docs" ? "bg-surface-muted text-text-primary font-medium" : "text-text-secondary hover:text-text-primary hover:bg-surface-subtle")}>Overview</Link>
      {SECTIONS.map((s) => {
        const isOpen = open.has(s.id);
        return (
          <div key={s.id} className="mt-1">
            <button type="button" onClick={() => toggle(s.id)} aria-expanded={isOpen} className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-left text-[13px] font-semibold text-text-primary hover:bg-surface-subtle">
              <span>{s.title}</span><ChevronDown size={14} className={clsx("text-text-tertiary transition-transform", !isOpen && "-rotate-90")} aria-hidden />
            </button>
            {isOpen && (
              <ul className="list-none m-0 p-0 ml-2.5 pl-2.5 border-l border-border mb-1.5">
                {s.pages.map((p) => {
                  const href = `/docs/${s.id}/${p.slug}`; const on = path === href;
                  return <li key={p.slug}><Link href={href} onClick={onNavigate} aria-current={on ? "page" : undefined} className={clsx("block px-2.5 py-1.5 rounded-md text-[13px] leading-snug", on ? "bg-accent-500/15 text-text-primary font-medium" : "text-text-secondary hover:text-text-primary hover:bg-surface-subtle")}>{p.title}</Link></li>;
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
