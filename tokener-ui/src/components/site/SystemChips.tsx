"use client";

import { NodeIcon } from "@/components/studio/icons";
import { brandOf } from "@/lib/industry-brands";
import { OP_BY_KIND } from "@/lib/mlops/operators";

/** Logos of the systems around a workload. Names resolve to real brand marks where one exists and to a neutral glyph otherwise. */
export function SystemChips({ names, dark }: { names: string[]; dark?: boolean }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {names.map((n) => {
        const b = brandOf(n);
        return (
          <li key={n} className={dark ? "flex items-center gap-2 rounded-md bg-white px-2.5 h-9" : "flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 h-9"}>
            <span className="h-5 w-5 grid place-items-center"><NodeIcon icon={b.icon} size={16} /></span>
            <span className="text-[13px] text-ink-800 font-medium">{n}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** The operators an example pipeline uses, with the same icons as the builder. */
export function OperatorChips({ kinds }: { kinds: string[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {kinds.map((k) => {
        const op = OP_BY_KIND[k];
        if (!op) return null;
        return (
          <li key={k} className="flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 h-9">
            <span className="h-5 w-5 grid place-items-center text-ink-700"><NodeIcon icon={op.icon} size={16} /></span>
            <span className="text-[13px] text-text-primary font-medium">{op.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
