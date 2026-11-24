"use client";

import clsx from "clsx";
import { ChevronDown, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { paletteGroups } from "./catalog";
import { NodeIcon } from "./icons";
import { TONE, type Graph, type Mode } from "./types";

export function Palette({ mode, graph, onAdd }: { mode: Mode; graph: Graph; onAdd: (kind: string) => void }) {
  const [q, setQ] = useState("");
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return paletteGroups(mode)
      .map((g) => ({ ...g, items: g.items.filter((i) => !needle || (i.label + " " + i.desc + " " + i.group).toLowerCase().includes(needle)) }))
      .filter((g) => g.items.length);
  }, [mode, q]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search nodes"
            className="w-full h-8 pl-8 pr-2 rounded-md border border-border-strong bg-surface text-[13px] focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:border-accent-600"
          />
        </div>
        <p className="text-[11px] text-text-tertiary mt-2 leading-snug">Drag onto the canvas, or click to add at the center.</p>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {groups.map((g) => {
          const isClosed = closed[g.name] && !q;
          return (
            <div key={g.name} className="mb-1">
              <button
                onClick={() => setClosed((c) => ({ ...c, [g.name]: !c[g.name] }))}
                className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary hover:text-text-primary"
              >
                {g.name}
                <ChevronDown size={13} className={clsx("transition-transform", isClosed && "-rotate-90")} />
              </button>
              {!isClosed &&
                g.items.map((d) => {
                  const used = !!d.singleton && graph.nodes.some((n) => n.kind === d.kind);
                  const tone = TONE[d.tone];
                  return (
                    <div
                      key={d.kind}
                      draggable={!used}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/x-tokener-node", d.kind);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => !used && onAdd(d.kind)}
                      title={used ? "Only one allowed, already on the canvas" : d.desc}
                      className={clsx(
                        "flex items-center gap-2.5 px-2 py-1.5 rounded-md border border-transparent",
                        used ? "opacity-40 cursor-not-allowed" : "cursor-grab active:cursor-grabbing hover:bg-surface-subtle hover:border-border"
                      )}
                    >
                      <span className={clsx("h-8 w-8 rounded-md grid place-items-center shrink-0", tone.tile, tone.text)}>
                        <NodeIcon icon={d.icon} size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="text-[13px] font-medium text-text-primary truncate">{d.label}</span>
                          {d.planned && <span className="text-[9px] font-semibold uppercase tracking-wide px-1 py-px rounded bg-[#EFE9FD] text-[#6B3FD4]">planned</span>}
                        </span>
                        <span className="block text-[11px] text-text-tertiary truncate">{d.desc}</span>
                      </span>
                    </div>
                  );
                })}
            </div>
          );
        })}
        {!groups.length && <p className="text-sm text-text-tertiary p-3">No nodes match &quot;{q}&quot;.</p>}
      </div>
    </div>
  );
}
