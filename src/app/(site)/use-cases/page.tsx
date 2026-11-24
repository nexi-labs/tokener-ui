import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container, CtaBand, Eyebrow, GridBackdrop, H2, Lead, LinkButton } from "@/components/site/ui";
import { IndustryArt } from "@/components/site/IndustryArt";
import { UseCaseBrowser } from "@/components/site/UseCaseBrowser";
import { USE_CASE_CATALOG } from "@/lib/usecases/catalog";

export const metadata = {
  title: "Use cases | tok∑ner",
  description: "How banks, manufacturers, retailers, logistics operators, health systems and public agencies run governed AI on tok∑ner, with the pipelines, controls and diagrams behind each one.",
};

export default async function UseCasesPage({ searchParams }: { searchParams: Promise<{ industry?: string }> }) {
  const { industry } = await searchParams;
  const initial = industry && USE_CASE_CATALOG.some((u) => u.industry === industry) ? industry : "all";
  const rag = USE_CASE_CATALOG.filter((u) => u.industry === "knowledge");
  return (
    <>
      <section className="bg-ink-800 relative overflow-hidden">
        <GridBackdrop />
        <Container className="relative py-16 sm:py-24 grid lg:grid-cols-[1.1fr_0.9fr] gap-12 items-center">
          <div>
            <Eyebrow dark>Use cases</Eyebrow>
            <h1 className="text-[2.2rem] sm:text-5xl leading-[1.08] font-semibold tracking-[-0.025em] text-text-inverse max-w-2xl">How real operations run AI under control.</h1>
            <Lead dark>{USE_CASE_CATALOG.length} worked examples across banking, insurance, healthcare, retail, manufacturing, logistics, energy, telecommunications, the public sector, education, legal work and software teams. Each one shows the problem, the pipeline, the controls and an animated walk through a run.</Lead>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="#all" arrow>Browse by industry</LinkButton>
              <LinkButton href="/use-cases/rag-reference-architecture" variant="ghost-dark">Build a RAG system</LinkButton>
            </div>
          </div>
          <IndustryArt kind="enterprise" />
        </Container>
      </section>

      <section className="py-16 sm:py-24">
        <Container className="grid lg:grid-cols-[0.8fr_1.2fr] gap-12 items-start">
          <div>
            <Eyebrow>Retrieval and knowledge</Eyebrow>
            <H2 className="text-[1.7rem] sm:text-[2.1rem]">Yes, you can build retrieval-augmented generation on tok&#8721;ner.</H2>
            <Lead>Ingest, embed, index, retrieve and serve are operators in one pipeline, and every answer passes through the gateway for policy, budget and audit. Start with the reference architecture, then see how teams handle permissions, freshness and tools.</Lead>
            <div className="mt-6"><LinkButton href="/use-cases/rag-reference-architecture" variant="ink" arrow>Read the reference architecture</LinkButton></div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {rag.map((u) => (
              <Link key={u.slug} href={`/use-cases/${u.slug}`} className="group rounded-xl border border-border p-5 hover:border-border-strong hover:shadow-card transition-all">
                <h3 className="font-semibold text-[15px] leading-snug text-text-primary">{u.title}</h3>
                <p className="mt-2 text-[13px] text-text-secondary leading-relaxed">{u.summary}</p>
                <span className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-800">Read <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" /></span>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      <section id="all" className="py-16 sm:py-20 bg-surface-subtle border-y border-border scroll-mt-20">
        <Container>
          <Eyebrow>All use cases</Eyebrow>
          <H2 className="text-[1.7rem] sm:text-[2.1rem] mb-10">Pick your industry.</H2>
          <UseCaseBrowser key={initial} entries={USE_CASE_CATALOG} initial={initial} />
        </Container>
      </section>
      <CtaBand title="Bring your own use case." lead="Start from any of these pipelines in the builder, attach your connections and run it in staging." />
    </>
  );
}
