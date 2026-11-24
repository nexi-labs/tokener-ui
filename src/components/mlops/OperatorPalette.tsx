"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import { NodeIcon } from "@/components/studio/icons";
import { OPERATORS, OPERATOR_FAMILY, type OperatorFamily } from "@/lib/mlops/operators";

export function OperatorPalette({ onAdd, disabled }: { onAdd: (kind: string) => void; disabled?: boolean }) {
  const [q, setQ] = useState("");
  const fams = Object.keys(OPERATOR_FAMILY) as OperatorFamily[];
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-3 border-b border-border"><div className="relative"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" /><input aria-label="Search operators" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search operators" className="w-full h-8 pl-8 pr-2 rounded-md border border-border-strong text-[13px] focus:outline-none focus:ring-2 focus:ring-accent-500/40" /></div></div>
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {fams.map((f) => {
          const ops = OPERATORS.filter((o) => o.family === f && (!q || (o.label + o.desc + o.kind).toLowerCase().includes(q.toLowerCase())));
          if (!ops.length) return null;
          return (
            <div key={f}>
              <div className="text-[10.5px] uppercase tracking-wider text-text-tertiary font-medium mb-1.5">{OPERATOR_FAMILY[f].label}</div>
              <ul className="space-y-1">
                {ops.map((o) => (
                  <li key={o.kind}>
                    <button disabled={disabled} draggable={!disabled} onDragStart={(e) => { e.dataTransfer.setData("application/x-tokener-operator", o.kind); e.dataTransfer.effectAllowed = "copy"; }} onClick={() => onAdd(o.kind)} title={`${o.desc} Click to add, or drag onto the canvas.`}
                      className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md border border-transparent hover:border-border hover:bg-surface-subtle text-left disabled:opacity-50 cursor-grab active:cursor-grabbing">
                      <span className="h-7 w-7 rounded-md bg-surface-muted grid place-items-center shrink-0"><NodeIcon icon={o.icon} size={15} /></span>
                      <span className="min-w-0"><span className="block text-[13px] font-medium truncate">{o.label}</span>{o.executable === "none" && <span className="text-[10px] uppercase tracking-wide text-[#6B3FD4]">draw only</span>}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
