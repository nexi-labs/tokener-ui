import Link from "next/link";
import { Fragment } from "react";

const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

/** **bold**, `code` and [label](href) inside a line of text. Nothing else is interpreted, and no HTML is accepted. */
export function Inline({ text }: { text: string }) {
  const parts = text.split(TOKEN).filter((p) => p !== "");
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) return <strong key={i} className="font-semibold text-text-primary">{p.slice(2, -2)}</strong>;
        if (p.startsWith("`") && p.endsWith("`")) return <code key={i} className="font-code text-[0.86em] px-1.5 py-0.5 rounded bg-surface-muted text-text-primary">{p.slice(1, -1)}</code>;
        const m = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(p);
        if (m) {
          const href = m[2];
          const cls = "text-ink-800 underline decoration-accent-600/60 underline-offset-[3px] hover:decoration-accent-600";
          return href.startsWith("/") ? <Link key={i} href={href} className={cls}>{m[1]}</Link> : <a key={i} href={href} target="_blank" rel="noopener noreferrer" className={cls}>{m[1]}</a>;
        }
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}
