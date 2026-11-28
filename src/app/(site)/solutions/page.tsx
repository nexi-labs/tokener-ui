import Link from "next/link";
import { Container, PageHero, CtaBand, TextLink } from "@/components/site/ui";
import { SOLUTIONS } from "@/lib/site";
import { IndustryExplorer } from "@/components/site/IndustryExplorer";

export const metadata = { title: "Solutions | tok∑ner" };

export default function SolutionsPage() {
  return (
    <>
      <PageHero eyebrow="Solutions" title="Whatever you build, someone will ask how it is governed." lead="The same control plane, with different guardrails for each industry." />
      <section className="pt-14 sm:pt-20">
        <Container><IndustryExplorer /></Container>
      </section>
      <section className="py-16 sm:py-24">
        <Container className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {SOLUTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <Link key={s.slug} href={`/solutions/${s.slug}`} className="rounded-xl border border-border p-8 hover:border-border-strong hover:shadow-card transition-all">
                <Icon size={24} strokeWidth={1.6} className="text-ink-500 mb-5" />
                <h2 className="text-xl font-semibold text-text-primary">{s.name}</h2>
                <p className="text-sm text-text-secondary mt-2 leading-relaxed">{s.short}</p>
                <span className="inline-block mt-5 text-sm font-semibold text-ink-800">Read more and see the use cases</span>
              </Link>
            );
          })}
        </Container>
      </section>
      <CtaBand />
    </>
  );
}
