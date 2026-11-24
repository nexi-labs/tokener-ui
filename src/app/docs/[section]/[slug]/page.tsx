import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { ALL, find, headings, neighbours } from "@/lib/docs/registry";
import { Blocks } from "@/components/docs/Blocks";
import { Inline } from "@/components/docs/Inline";
import { Toc } from "@/components/docs/Toc";

export const dynamicParams = false;
export function generateStaticParams() { return ALL.map((x) => ({ section: x.section.id, slug: x.page.slug })); }

type P = { params: Promise<{ section: string; slug: string }> };

export async function generateMetadata({ params }: P) {
  const { section, slug } = await params; const f = find(section, slug);
  return f ? { title: f.page.title, description: f.page.summary } : {};
}

const ROLE: Record<string, string> = { viewer: "Any role can read this", developer: "Developers and above can change things here", approver: "Approvers and above can change things here", admin: "Admins can change things here", operator: "Platform operators only" };

export default async function DocPage({ params }: P) {
  const { section, slug } = await params; const f = find(section, slug);
  if (!f) notFound();
  const { prev, next } = neighbours(f.href); const toc = headings(f.page);
  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 lg:py-10 xl:grid xl:grid-cols-[minmax(0,1fr)_210px] xl:gap-12">
      <article className="min-w-0 max-w-[820px]">
        <nav aria-label="Breadcrumb" className="text-xs text-text-tertiary mb-3"><Link href="/docs" className="hover:text-text-primary">Documentation</Link> <span aria-hidden>/</span> {f.section.title}</nav>
        <h1 className="text-[2.1rem] sm:text-[2.5rem] leading-[1.1] font-semibold tracking-[-0.025em] text-text-primary">{f.page.title}</h1>
        <p className="text-lg leading-relaxed text-text-secondary mt-3 max-w-[60ch]"><Inline text={f.page.summary} /></p>
        <div className="flex flex-wrap items-center gap-3 mt-5">
          {f.page.console && <a href={f.page.console} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border-strong text-[13px] font-medium hover:bg-surface-muted">Open in the console<ArrowUpRight size={14} aria-hidden /></a>}
          {f.page.role && <span className="text-xs text-text-tertiary">{ROLE[f.page.role]}</span>}
        </div>
        <div className="mt-6"><Blocks blocks={f.page.blocks} /></div>
        <nav aria-label="Next and previous pages" className="mt-14 pt-6 border-t border-border grid sm:grid-cols-2 gap-3">
          {prev ? <Link href={prev.href} className="group rounded-xl border border-border p-4 hover:border-accent-600/60"><div className="text-xs text-text-tertiary inline-flex items-center gap-1"><ArrowLeft size={13} aria-hidden />Previous</div><div className="text-sm font-semibold text-text-primary mt-0.5">{prev.page.title}</div></Link> : <span />}
          {next ? <Link href={next.href} className="group rounded-xl border border-border p-4 hover:border-accent-600/60 sm:text-right"><div className="text-xs text-text-tertiary inline-flex items-center gap-1 sm:justify-end w-full">Next<ArrowRight size={13} aria-hidden /></div><div className="text-sm font-semibold text-text-primary mt-0.5">{next.page.title}</div></Link> : null}
        </nav>
      </article>
      <aside className="hidden xl:block"><div className="sticky top-24"><Toc items={toc} /></div></aside>
    </div>
  );
}
