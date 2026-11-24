"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { NodeIcon } from "@/components/studio/icons";
import { CONNECTOR_GROUPS, CONNECTOR_COUNT } from "@/lib/connectors";

export function ConnectorsExplorer() {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    return CONNECTOR_GROUPS
      .map((g) => ({ ...g, items: g.items.filter((i) => !term || `${i.name} ${i.note} ${i.role} ${g.label}`.toLowerCase().includes(term)) }))
      .filter((g) => g.items.length > 0);
  }, [q]);
  const shown = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="grid lg:grid-cols-[220px_1fr] gap-10">
      <aside className="lg:sticky lg:top-24 self-start">
        <label className="relative block">
          <span className="sr-only">Search connectors</span>
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search connectors" className="h-10 w-full pl-9 pr-3 rounded-md border border-border-strong text-sm focus:outline-none focus:ring-2 focus:ring-accent-500" />
        </label>
        <p className="text-xs text-text-tertiary mt-2" aria-live="polite">{shown} of {CONNECTOR_COUNT} connectors</p>
        <nav aria-label="Connector categories" className="mt-5 hidden lg:flex flex-col gap-0.5">
          {CONNECTOR_GROUPS.map((g) => (
            <a key={g.id} href={`#${g.id}`} className="text-sm text-text-secondary hover:text-text-primary hover:bg-surface-muted rounded-md px-3 py-1.5 flex justify-between">
              <span>{g.label}</span><span className="text-text-tertiary text-xs mt-0.5">{g.items.length}</span>
            </a>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 space-y-14">
        {groups.length === 0 && <p className="text-sm text-text-secondary py-10 text-center border border-dashed border-border rounded-lg">No connectors match &ldquo;{q}&rdquo;. Try a vendor or a category.</p>}
        {groups.map((g) => (
          <section key={g.id} id={g.id} className="scroll-mt-24">
            <h2 className="text-2xl font-semibold tracking-[-0.01em] text-text-primary">{g.label}</h2>
            <p className="text-text-secondary mt-1.5 max-w-2xl">{g.blurb}</p>
            <ul className="mt-6 grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {g.items.map((i) => (
                <li key={i.name} className="rounded-xl border border-border p-4 flex items-center gap-4 hover:border-border-strong hover:shadow-card transition-all">
                  <span className="h-12 w-12 rounded-lg bg-surface-muted grid place-items-center shrink-0"><NodeIcon icon={i.icon} size={26} /></span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-text-primary truncate">{i.name}</span>
                    <span className="block text-xs text-text-secondary truncate">{i.note}</span>
                    <span className="block text-[11px] font-mono uppercase tracking-wide text-text-tertiary mt-1 truncate">{i.role}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
