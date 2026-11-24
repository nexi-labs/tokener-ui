import clsx from "clsx";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, FlaskConical, Info } from "lucide-react";
import type { Block } from "@/lib/docs/types";
import { slugify } from "@/lib/docs/registry";
import { Inline } from "./Inline";
import { Flow, Layers, Tree } from "./Diagrams";
import { Shot, Walkthrough } from "./Shot";
import { Demo } from "./Demos";

const CALLOUT = {
  note: { icon: Info, box: "border-border bg-surface-subtle", head: "text-text-primary", label: "Note" },
  warn: { icon: AlertTriangle, box: "border-[#D98A15]/50 bg-[#D98A15]/8", head: "text-text-primary", label: "Take care" },
  sample: { icon: FlaskConical, box: "border-dashed border-border-strong bg-surface", head: "text-text-primary", label: "Sample data" },
} as const;

export function Blocks({ blocks }: { blocks: Block[] }) {
  return <>{blocks.map((b, i) => <BlockView key={i} b={b} />)}</>;
}

function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case "h2": return <h2 id={slugify(b.text)} className="scroll-mt-24 text-[1.45rem] leading-tight font-semibold tracking-[-0.015em] text-text-primary mt-12 mb-3 pt-2 border-t border-border">{b.text}</h2>;
    case "h3": return <h3 className="text-base font-semibold text-text-primary mt-7 mb-2">{b.text}</h3>;
    case "p": return <p className="text-[15px] leading-[1.75] text-text-secondary my-3.5 max-w-[68ch]"><Inline text={b.text} /></p>;
    case "list": {
      const L = b.ordered ? "ol" : "ul";
      return <L className={clsx("my-4 pl-5 space-y-2 text-[15px] leading-[1.7] text-text-secondary max-w-[68ch]", b.ordered ? "list-decimal" : "list-disc marker:text-accent-600")}>{b.items.map((x, i) => <li key={i} className="pl-1"><Inline text={x} /></li>)}</L>;
    }
    case "steps":
      return (
        <ol className="my-6 list-none p-0 space-y-6">
          {b.items.map((s, i) => (
            <li key={i} className="grid grid-cols-[2rem_1fr] gap-3">
              <span className="h-7 w-7 rounded-full bg-ink-800 text-text-inverse text-xs font-semibold grid place-items-center mt-0.5">{i + 1}</span>
              <div className="min-w-0">
                <div className="text-[15px] font-semibold text-text-primary leading-snug">{s.title}</div>
                <p className="text-[15px] leading-[1.7] text-text-secondary mt-1 max-w-[68ch]"><Inline text={s.body} /></p>
                {s.shot && <Shot src={s.shot} alt={s.alt ?? s.title} />}
              </div>
            </li>
          ))}
        </ol>
      );
    case "shot": return <Shot src={b.src} alt={b.alt} caption={b.caption} narrow={b.narrow} />;
    case "walkthrough": return <Walkthrough title={b.title} frames={b.frames} />;
    case "callout": {
      const c = CALLOUT[b.tone]; const Icon = c.icon;
      return (
        <aside className={clsx("my-6 rounded-xl border px-4 py-3.5 flex gap-3 max-w-[72ch]", c.box)}>
          <Icon size={17} className="shrink-0 mt-0.5 text-text-secondary" aria-hidden />
          <div className="min-w-0">
            <div className={clsx("text-sm font-semibold", c.head)}>{b.title ?? c.label}</div>
            <p className="text-sm leading-relaxed text-text-secondary mt-0.5"><Inline text={b.text} /></p>
          </div>
        </aside>
      );
    }
    case "table":
      return (
        <figure className="my-6">
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm border-collapse">
              <thead><tr className="bg-surface-subtle text-left">{b.head.map((h) => <th key={h} className="px-3.5 py-2.5 font-semibold text-text-primary border-b border-border whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>{b.rows.map((r, i) => <tr key={i} className="align-top">{r.map((c, j) => <td key={j} className="px-3.5 py-2.5 border-b border-border last:border-b-0 text-text-secondary leading-relaxed"><Inline text={c} /></td>)}</tr>)}</tbody>
            </table>
          </div>
          {b.caption && <figcaption className="mt-2 text-[13px] text-text-secondary">{b.caption}</figcaption>}
        </figure>
      );
    case "code":
      return (
        <figure className="my-6 rounded-xl overflow-hidden border border-ink-700 bg-ink-800">
          {b.title && <div className="px-4 py-2 text-xs font-mono text-text-inverse/70 border-b border-white/10">{b.title}</div>}
          <pre className="px-4 py-3.5 overflow-x-auto text-[13px] leading-relaxed text-text-inverse font-code"><code>{b.code}</code></pre>
        </figure>
      );
    case "cards":
      return (
        <div className="my-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {b.items.map((c) => (
            <Link key={c.href} href={c.href} className="group rounded-xl border border-border p-4 hover:border-accent-600/60 hover:bg-surface-subtle transition-colors">
              <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-text-primary">{c.title}</span><ArrowUpRight size={15} className="text-text-tertiary group-hover:text-accent-700" aria-hidden /></div>
              <p className="text-[13px] text-text-secondary mt-1 leading-relaxed">{c.body}</p>
            </Link>
          ))}
        </div>
      );
    case "flow": return <Flow b={b} />;
    case "layers": return <Layers b={b} />;
    case "tree": return <Tree b={b} />;
    case "demo": return <Demo id={b.id} />;
  }
}
