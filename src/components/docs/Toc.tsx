"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";

/** "On this page": the headings of the page, with the one being read marked. */
export function Toc({ items }: { items: { id: string; text: string }[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter(Boolean) as HTMLElement[];
    if (els.length === 0) return;
    const io = new IntersectionObserver((entries) => {
      const seen = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (seen) setActive(seen.target.id);
    }, { rootMargin: "-80px 0px -65% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [items]);
  if (items.length < 2) return null;
  return (
    <nav aria-label="On this page" className="text-[13px]">
      <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-tertiary mb-3">On this page</div>
      <ul className="list-none m-0 p-0 border-l border-border">
        {items.map((i) => <li key={i.id}><a href={`#${i.id}`} className={clsx("block -ml-px pl-3 py-1.5 border-l leading-snug", active === i.id ? "border-accent-600 text-text-primary font-medium" : "border-transparent text-text-secondary hover:text-text-primary")}>{i.text}</a></li>)}
      </ul>
    </nav>
  );
}
