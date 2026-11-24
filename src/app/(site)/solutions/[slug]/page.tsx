import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Container, Eyebrow, GridBackdrop, H2, Lead, Screenshot, CtaBand, LinkButton } from "@/components/site/ui";
import { SOLUTIONS, SOLUTION_DEEP } from "@/lib/site";
import { INDUSTRY_FLOWS } from "@/lib/industry-flows";
import { INDUSTRY_CONTENT } from "@/lib/industry-content";
import { IndustryDiagram } from "@/components/site/IndustryExplorer";
import { IndustryArt } from "@/components/site/IndustryArt";
import { SystemChips } from "@/components/site/SystemChips";
import { UseCaseScene } from "@/components/site/UseCaseScene";
import { UseCaseCard } from "@/components/site/UseCaseBrowser";
import { USE_CASE_CATALOG } from "@/lib/usecases/catalog";
import { bySlug } from "@/lib/usecases";

export function generateStaticParams() {
  return SOLUTIONS.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = SOLUTIONS.find((x) => x.slug === slug);
  return { title: s ? `${s.name} | tok∑ner` : "tok∑ner", description: s?.short };
}

export default async function SolutionDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = SOLUTIONS.find((x) => x.slug === slug);
  if (!s) notFound();
  const deep = SOLUTION_DEEP[s.slug];
  const flow = INDUSTRY_FLOWS.find((f) => f.slug === s.slug);
  const c = INDUSTRY_CONTENT[s.slug];
  const cases = USE_CASE_CATALOG.filter((u) => u.industry === s.slug);
  const flagship = c ? bySlug(c.flagship) : undefined;

  return (
    <>
      <section className="bg-ink-800 relative overflow-hidden">
        <GridBackdrop />
        <Container className="relative py-16 sm:py-24 grid lg:grid-cols-[1.05fr_0.95fr] gap-12 items-center">
          <div>
            <Eyebrow dark>{s.name}</Eyebrow>
            <h1 className="text-[2.1rem] sm:text-[2.9rem] leading-[1.1] font-semibold tracking-[-0.025em] text-text-inverse max-w-2xl">{s.headline}</h1>
            <Lead dark>{s.body}</Lead>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/demo" arrow>Book a demo</LinkButton>
              {cases.length > 0 && <LinkButton href="#use-cases" variant="ghost-dark">See {cases.length} use cases</LinkButton>}
            </div>
          </div>
          {c && <IndustryArt kind={c.art} />}
        </Container>
      </section>

      {c && (
        <section className="py-16 sm:py-24">
          <Container className="grid lg:grid-cols-[0.8fr_1.2fr] gap-12">
            <div>
              <Eyebrow>Overview</Eyebrow>
              <H2 className="text-[1.7rem] sm:text-[2.1rem]">What changes when AI meets {s.name.toLowerCase()}.</H2>
            </div>
            <div className="space-y-5 text-[17px] leading-[1.7] text-text-primary max-w-3xl">
              {c.intro.map((p, i) => <p key={i}>{p}</p>)}
            </div>
          </Container>
        </section>
      )}

      {c && (
        <section className="pb-16 sm:pb-24">
          <Container>
            <Eyebrow>The pressures</Eyebrow>
            <H2 className="text-[1.7rem] sm:text-[2.1rem] max-w-3xl">Why the usual approach stalls.</H2>
            <div className="mt-10 grid md:grid-cols-2 gap-5">
              {c.pressures.map((p) => (
                <div key={p.title} className="rounded-xl border border-border border-l-2 border-l-status-degraded p-6">
                  <h3 className="font-semibold text-text-primary">{p.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-text-secondary">{p.body}</p>
                </div>
              ))}
            </div>
          </Container>
        </section>
      )}

      {flow && (
        <section className="bg-ink-800 py-16 sm:py-20">
          <Container>
            <Eyebrow dark>How it fits</Eyebrow>
            <H2 dark>Where tok&#8721;ner sits in {s.name.toLowerCase()}.</H2>
            <div className="mt-10"><IndustryDiagram slug={flow.slug} /></div>
            <p className="mt-8 text-xs text-text-tertiary max-w-3xl">Logos show systems that customers commonly connect through APIs, MCP servers, webhooks and the SDKs. Product and brand names belong to their owners, and showing one is not a statement of partnership or endorsement.</p>
          </Container>
        </section>
      )}

      {c && (
        <section className="py-16 sm:py-24">
          <Container>
            <Eyebrow>What the platform does for you</Eyebrow>
            <H2 className="text-[1.7rem] sm:text-[2.1rem] max-w-3xl">Four capabilities, shaped for this sector.</H2>
            <div className="mt-10 grid md:grid-cols-2 gap-5">
              {c.capabilities.map((k) => (
                <div key={k.title} className="rounded-xl bg-surface-subtle border border-border p-7">
                  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent-700">{k.area}</span>
                  <h3 className="mt-2 text-lg font-semibold text-text-primary">{k.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-text-secondary">{k.body}</p>
                </div>
              ))}
            </div>
          </Container>
        </section>
      )}

      {flagship && (
        <section className="bg-ink-900 py-16 sm:py-20">
          <Container>
            <Eyebrow dark>Watch one run</Eyebrow>
            <H2 dark className="text-[1.7rem] sm:text-[2.1rem]">{flagship.title}</H2>
            <p className="mt-4 max-w-3xl text-text-tertiary leading-relaxed">{flagship.summary}</p>
            <div className="mt-8"><UseCaseScene id={flagship.slug} spec={flagship.scene} /></div>
            <div className="mt-6"><Link href={`/use-cases/${flagship.slug}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-500">Read the full use case <ArrowRight size={14} /></Link></div>
          </Container>
        </section>
      )}

      {deep && (
        <section className="py-16 sm:py-24">
          <Container className="grid lg:grid-cols-[1.2fr_0.8fr] gap-12">
            <div>
              <Eyebrow>A typical flow</Eyebrow>
              <H2 className="text-[1.6rem] sm:text-[2rem]">From request to record.</H2>
              <ol className="mt-8 flex flex-col gap-5">
                {deep.workflow.map((w, i) => (
                  <li key={i} className="flex gap-4">
                    <span className="h-7 w-7 shrink-0 rounded-full border border-border-strong text-[13px] font-semibold grid place-items-center">{i + 1}</span>
                    <p className="text-[15px] text-text-primary leading-snug pt-[3px]">{w}</p>
                  </li>
                ))}
              </ol>
            </div>
            <div className="rounded-xl bg-surface-subtle border border-border p-6 h-fit">
              <h3 className="font-semibold text-text-primary">What teams measure</h3>
              <ul className="mt-4 flex flex-col gap-3">
                {deep.measures.map((m) => (
                  <li key={m} className="flex items-start gap-2.5 text-sm text-text-secondary"><span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-accent-600 shrink-0" />{m}</li>
                ))}
              </ul>
            </div>
          </Container>
        </section>
      )}

      {cases.length > 0 && (
        <section id="use-cases" className="py-16 sm:py-24 bg-surface-subtle border-y border-border scroll-mt-20">
          <Container>
            <div className="flex items-end justify-between gap-4 mb-10">
              <div>
                <Eyebrow>Use cases</Eyebrow>
                <H2 className="text-[1.7rem] sm:text-[2.1rem]">How {s.name.toLowerCase()} teams use tok&#8721;ner.</H2>
              </div>
              <Link href="/use-cases" className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-ink-800 whitespace-nowrap">All use cases <ArrowRight size={14} /></Link>
            </div>
            <div className="grid md:grid-cols-3 gap-5">{cases.map((u) => <UseCaseCard key={u.slug} u={u} />)}</div>
          </Container>
        </section>
      )}

      <section className="py-16">
        <Container>
          <Screenshot src={s.shot} url={s.shotUrl} alt={`${s.name} view in the console`} />
        </Container>
      </section>

      {c && (
        <section className="pb-16 sm:pb-24">
          <Container className="grid lg:grid-cols-2 gap-12">
            <div>
              <Eyebrow>Standards and requirements</Eyebrow>
              <H2 className="text-[1.5rem] sm:text-[1.9rem]">What teams map their controls to.</H2>
              <ul className="mt-8 flex flex-col gap-4">
                {c.standards.map((st) => (
                  <li key={st.name} className="border-l-2 border-ink-800 pl-4">
                    <p className="font-semibold text-text-primary">{st.name}</p>
                    <p className="text-sm text-text-secondary mt-0.5 leading-relaxed">{st.note}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-xs leading-relaxed text-text-tertiary">This is a reading list, not a claim of certification or legal advice. Which requirements apply depends on your jurisdiction and your use.</p>
            </div>
            <div>
              <Eyebrow>Systems customers connect</Eyebrow>
              <H2 className="text-[1.5rem] sm:text-[1.9rem]">The systems around the work.</H2>
              <div className="mt-8 flex flex-col gap-6">
                {c.systems.map((g) => (
                  <div key={g.label}>
                    <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-tertiary mb-2.5">{g.label}</p>
                    <SystemChips names={g.names} />
                  </div>
                ))}
              </div>
            </div>
          </Container>
        </section>
      )}

      {c && (
        <section className="py-16 sm:py-20 bg-surface-subtle border-t border-border">
          <Container className="grid lg:grid-cols-[0.8fr_1.2fr] gap-12">
            <div>
              <Eyebrow>Questions</Eyebrow>
              <H2 className="text-[1.6rem] sm:text-[2rem]">What {s.name.toLowerCase()} teams ask first.</H2>
            </div>
            <dl className="flex flex-col gap-6">
              {c.faqs.map((f) => (
                <div key={f.q} className="border-b border-border pb-6">
                  <dt className="font-semibold text-text-primary">{f.q}</dt>
                  <dd className="mt-2 text-[15px] leading-relaxed text-text-secondary">{f.a}</dd>
                </div>
              ))}
            </dl>
          </Container>
        </section>
      )}
      <CtaBand />
    </>
  );
}
