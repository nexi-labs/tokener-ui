import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container, PageHero } from "@/components/site/ui";
import { IndustryArt } from "@/components/site/IndustryArt";
import { POSTS } from "@/lib/blog";

export const metadata = { title: "Blog | tok∑ner" };

export default function BlogPage() {
  const [lead, ...rest] = POSTS;
  return (
    <>
      <PageHero eyebrow="Blog" title="Engineering notes and product updates." />
      <section className="py-16 sm:py-24">
        <Container>
          <Link href={`/blog/${lead.slug}`} className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center rounded-2xl border border-border p-5 sm:p-8 hover:border-border-strong hover:shadow-card transition-all group">
            <IndustryArt kind={lead.art} caption={false} />
            <div>
              <div className="text-xs font-mono uppercase tracking-wider text-accent-700">{lead.tag} &middot; {lead.date} &middot; {lead.read} read</div>
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-[-0.02em] text-text-primary mt-3 leading-tight">{lead.title}</h2>
              <p className="text-text-secondary mt-4 leading-relaxed">{lead.summary}</p>
              <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-800">Read the article <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" /></span>
            </div>
          </Link>
          <div className="mt-8 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {rest.map((p) => (
              <Link key={p.slug} href={`/blog/${p.slug}`} className="rounded-xl border border-border overflow-hidden flex flex-col hover:border-border-strong hover:shadow-card transition-all">
                <IndustryArt kind={p.art} caption={false} className="rounded-none border-0 border-b border-white/10" />
                <div className="p-6 flex flex-col flex-1">
                  <div className="flex items-center justify-between text-xs font-mono text-text-tertiary">
                    <span className="uppercase tracking-wider text-accent-700">{p.tag}</span>
                    <span>{p.date} &middot; {p.read}</span>
                  </div>
                  <h2 className="text-lg font-semibold text-text-primary mt-3 leading-snug">{p.title}</h2>
                  <p className="text-sm text-text-secondary mt-3 leading-relaxed">{p.summary}</p>
                </div>
              </Link>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
