import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SECTIONS } from "@/lib/docs/registry";
import { DocsSearch } from "@/components/docs/DocsSearch";

export const metadata = { title: "Documentation" };

const START: [string, string, string][] = [
  ["Make your first request", "Send a call through the gateway and see it in the ledger.", "/docs/start/first-request"],
  ["Take the console tour", "Where everything is, and what each role can do.", "/docs/start/console-tour"],
  ["Learn the concepts", "Organizations, tenants, policies, budgets and the ledger in one page.", "/docs/start/concepts"],
];

export default function DocsHome() {
  const pages = SECTIONS.reduce((n, s) => n + s.pages.length, 0);
  return (
    <div className="px-4 sm:px-8 lg:px-12 py-10 lg:py-14 max-w-[1100px]">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent-700 mb-4">Documentation</p>
      <h1 className="text-[2.4rem] sm:text-[3rem] leading-[1.06] font-semibold tracking-[-0.03em] text-text-primary max-w-[18ch]">How to use every part of tok∑ner</h1>
      <p className="text-lg leading-relaxed text-text-secondary mt-4 max-w-[58ch]">{pages} guides, each with screenshots of the console, diagrams of how the feature works and, where it helps, something to try. The screenshots use a sample workspace and the sample user James Doe.</p>
      <div className="mt-7 max-w-xl"><DocsSearch large /></div>

      <h2 className="text-sm font-semibold text-text-primary mt-12 mb-3">Start here</h2>
      <div className="grid sm:grid-cols-3 gap-3">
        {START.map(([t, b, h]) => (
          <Link key={h} href={h} className="group rounded-xl border border-border p-4 hover:border-accent-600/60 hover:bg-surface-subtle transition-colors">
            <div className="text-sm font-semibold text-text-primary flex items-center justify-between gap-2">{t}<ArrowRight size={15} className="text-text-tertiary group-hover:text-accent-700 transition-transform group-hover:translate-x-0.5" aria-hidden /></div>
            <p className="text-[13px] text-text-secondary mt-1 leading-relaxed">{b}</p>
          </Link>
        ))}
      </div>

      <h2 className="text-sm font-semibold text-text-primary mt-12 mb-3">Browse by area</h2>
      <div className="grid md:grid-cols-2 gap-4">
        {SECTIONS.map((s) => (
          <section key={s.id} className="rounded-xl border border-border p-5">
            <h3 className="text-base font-semibold text-text-primary">{s.title}</h3>
            <p className="text-[13px] text-text-secondary mt-1 leading-relaxed">{s.blurb}</p>
            <ul className="list-none m-0 p-0 mt-3 space-y-1">
              {s.pages.slice(0, 6).map((p) => <li key={p.slug}><Link href={`/docs/${s.id}/${p.slug}`} className="text-[13px] text-ink-800 hover:underline decoration-accent-600 underline-offset-[3px]">{p.title}</Link></li>)}
              {s.pages.length > 6 && <li><Link href={`/docs/${s.id}/${s.pages[0].slug}`} className="text-[13px] text-text-tertiary hover:text-text-primary">and {s.pages.length - 6} more</Link></li>}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
