import clsx from "clsx";
import { ArrowDown, ArrowRight, CornerDownLeft } from "lucide-react";
import type { Block, Tone, TreeNode } from "@/lib/docs/types";

const BOX: Record<Tone, string> = {
  accent: "bg-accent-500/12 border-accent-600/50 text-text-primary",
  ink: "bg-ink-800 border-ink-800 text-text-inverse",
  warn: "bg-[#D98A15]/10 border-[#D98A15]/50 text-text-primary",
  muted: "bg-surface-muted border-border text-text-primary",
};
const SUB: Record<Tone, string> = { accent: "text-text-secondary", ink: "text-text-inverse/70", warn: "text-text-secondary", muted: "text-text-secondary" };

export function Figure({ caption, children }: { caption?: string; children: React.ReactNode }) {
  return (
    <figure className="my-7 rounded-xl border border-border bg-surface p-5 sm:p-6">
      {children}
      {caption && <figcaption className="mt-4 text-[13px] text-text-secondary leading-relaxed">{caption}</figcaption>}
    </figure>
  );
}

/** Stages left to right (top to bottom on a narrow screen). A stage lists what can happen there instead; `loop` says where the end feeds back to the start. */
export function Flow({ b }: { b: Extract<Block, { t: "flow" }> }) {
  return (
    <Figure caption={b.caption}>
      <ol className="flex flex-col md:flex-row md:items-stretch gap-2 md:gap-0 list-none p-0 m-0">
        {b.steps.map((s, i) => {
          const tone = s.tone ?? "muted";
          return (
            <li key={i} className="flex flex-col md:flex-row md:items-stretch md:flex-1 min-w-0">
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                <div className={clsx("rounded-lg border px-3 py-3 flex-1", BOX[tone])}>
                  <div className="text-[13px] font-semibold leading-snug">{s.label}</div>
                  {s.sub && <div className={clsx("text-xs mt-1 leading-snug", SUB[tone])}>{s.sub}</div>}
                </div>
                {s.alt && s.alt.length > 0 && (
                  <ul className="flex flex-col gap-1 list-none p-0 m-0">
                    {s.alt.map((a) => <li key={a} className="text-[11px] leading-snug text-text-secondary border border-dashed border-border-strong rounded-md px-2 py-1.5">{a}</li>)}
                  </ul>
                )}
              </div>
              {i < b.steps.length - 1 && (
                <div className="flex items-center justify-center text-text-tertiary md:px-1.5 py-0.5 md:py-0 shrink-0" aria-hidden>
                  <ArrowRight size={16} className="hidden md:block" /><ArrowDown size={16} className="md:hidden" />
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {b.loop && <div className="mt-3 flex items-center gap-2 text-xs text-text-secondary"><CornerDownLeft size={14} className="text-accent-700 shrink-0" aria-hidden /><span>{b.loop}</span></div>}
    </Figure>
  );
}

export function Layers({ b }: { b: Extract<Block, { t: "layers" }> }) {
  return (
    <Figure caption={b.caption}>
      <div className="flex flex-col gap-2">
        {b.layers.map((l, i) => {
          const tone = l.tone ?? "muted";
          return (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[170px_1fr] gap-2 sm:gap-3 items-stretch">
              <div className={clsx("rounded-lg border px-3 py-2.5 text-[13px] font-semibold flex items-center", BOX[tone])}>{l.label}</div>
              <div className="flex flex-wrap gap-2 items-center rounded-lg border border-border px-3 py-2.5">
                {l.items.map((x) => <span key={x} className="text-xs px-2 py-1 rounded-md bg-surface-muted text-text-primary">{x}</span>)}
              </div>
            </div>
          );
        })}
      </div>
    </Figure>
  );
}

function Node({ n, depth }: { n: TreeNode; depth: number }) {
  return (
    <li className="relative">
      <div className={clsx("inline-block rounded-lg border px-3 py-2 my-1", depth === 0 ? BOX.ink : depth === 1 ? BOX.accent : BOX.muted)}>
        <div className="text-[13px] font-semibold leading-snug">{n.label}</div>
        {n.sub && <div className={clsx("text-xs leading-snug mt-0.5", depth === 0 ? SUB.ink : SUB.muted)}>{n.sub}</div>}
      </div>
      {n.children && n.children.length > 0 && (
        <ul className="list-none m-0 pl-5 ml-4 border-l border-border-strong">
          {n.children.map((c, i) => <Node key={i} n={c} depth={depth + 1} />)}
        </ul>
      )}
    </li>
  );
}

export function Tree({ b }: { b: Extract<Block, { t: "tree" }> }) {
  return <Figure caption={b.caption}><ul className="list-none m-0 p-0"><Node n={b.root} depth={0} /></ul></Figure>;
}
