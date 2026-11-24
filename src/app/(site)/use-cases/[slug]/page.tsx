import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check, ChevronRight } from "lucide-react";
import { ConsoleLink } from "@/components/auth/ConsoleLink";
import { Container, CtaBand, Eyebrow, GridBackdrop, H2, LinkButton, Screenshot } from "@/components/site/ui";
import { OperatorChips, SystemChips } from "@/components/site/SystemChips";
import { UseCaseScene } from "@/components/site/UseCaseScene";
import { UseCaseCard } from "@/components/site/UseCaseBrowser";
import { USE_CASE_CATALOG } from "@/lib/usecases/catalog";
import { INDUSTRY_LABELS } from "@/lib/usecases/labels";
import { USE_CASES, bySlug, operatorsOf, relatedTo, templateId } from "@/lib/usecases";
import dims from "@/lib/usecases/shotdims.json";

export function generateStaticParams() {
  return USE_CASES.map((u) => ({ slug: u.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const u = bySlug(slug);
  return u ? { title: `${u.title} | tok∑ner`, description: u.summary } : { title: "tok∑ner" };
}

const minutes = (u: { challenge: string[]; solution: string[]; steps: { body: string }[]; extra?: { body: string[] }[]; example: string }) => {
  const words = [...u.challenge, ...u.solution, ...u.steps.map((s) => s.body), u.example, ...(u.extra ?? []).flatMap((e) => e.body)].join(" ").split(/\s+/).length;
  return Math.max(3, Math.round(words / 200));
};

export default async function UseCasePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const u = bySlug(slug);
  if (!u) notFound();
  const industry = INDUSTRY_LABELS[u.industry];
  const ops = operatorsOf(u.slug);
  const tpl = templateId(u.slug);
  const related = relatedTo(u, 3).map((r) => USE_CASE_CATALOG.find((c) => c.slug === r.slug)!);
  const solutionHref = u.industry === "knowledge" ? "/use-cases#all" : `/solutions/${u.industry}`;

  return (
    <>
      <section className="bg-ink-800 relative overflow-hidden">
        <GridBackdrop />
        <Container className="relative pt-10 pb-14 sm:pb-20">
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[13px] text-text-tertiary">
            <Link href="/use-cases" className="hover:text-text-inverse">Use cases</Link>
            <ChevronRight size={13} />
            <Link href={solutionHref} className="hover:text-text-inverse">{industry}</Link>
          </nav>
          <h1 className="mt-6 text-[2rem] sm:text-[2.9rem] leading-[1.1] font-semibold tracking-[-0.025em] text-text-inverse max-w-4xl">{u.title}</h1>
          <p className="mt-5 max-w-3xl text-lg leading-relaxed text-text-tertiary">{u.summary}</p>
          <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
            {u.tags.map((t) => <span key={t} className="rounded-full border border-white/15 px-2.5 py-0.5">{t}</span>)}
            <span className="ml-1">{minutes(u)} min read</span>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            {tpl && <ConsoleLink href={`/mlops/pipelines/new?template=${tpl}`} signedOut="Sign in to open it in the builder" arrow demo dark>Open this pipeline in the builder</ConsoleLink>}
            <LinkButton href="/demo" variant="ghost-dark">Talk to us</LinkButton>
          </div>
        </Container>
      </section>

      <section className="bg-ink-900 py-12 sm:py-16">
        <Container>
          <Eyebrow dark>Watch it run</Eyebrow>
          <UseCaseScene id={u.slug} spec={u.scene} />
        </Container>
      </section>

      <section className="py-16 sm:py-24">
        <Container className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-14">
          <article className="max-w-3xl">
            <Eyebrow>The challenge</Eyebrow>
            <div className="space-y-5 text-[17px] leading-[1.7] text-text-primary">
              {u.challenge.map((p, i) => <p key={i}>{p}</p>)}
            </div>

            <h2 className="mt-14 text-[1.7rem] sm:text-[2rem] leading-tight font-semibold tracking-[-0.02em] text-text-primary">How it works on tok&#8721;ner</h2>
            <div className="mt-5 space-y-5 text-[17px] leading-[1.7] text-text-primary">
              {u.solution.map((p, i) => <p key={i}>{p}</p>)}
            </div>

            <h3 className="mt-12 text-xl font-semibold text-text-primary">Step by step</h3>
            <ol className="mt-6 flex flex-col gap-4">
              {u.steps.map((s, i) => (
                <li key={s.title} className="flex gap-4 rounded-xl border border-border p-5">
                  <span className="h-8 w-8 shrink-0 rounded-full bg-ink-800 text-accent-500 text-sm font-semibold grid place-items-center">{i + 1}</span>
                  <div>
                    <h4 className="font-semibold text-text-primary">{s.title}</h4>
                    <p className="mt-1 text-[15px] leading-relaxed text-text-secondary">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-12 rounded-xl border-l-4 border-accent-500 bg-surface-subtle p-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent-700 mb-2">A concrete example</p>
              <p className="text-[16px] leading-relaxed text-text-primary">{u.example}</p>
            </div>

            {u.extra?.map((sec) => (
              <div key={sec.title} className="mt-14">
                <h2 className="text-[1.7rem] sm:text-[2rem] leading-tight font-semibold tracking-[-0.02em] text-text-primary">{sec.title}</h2>
                <div className="mt-5 space-y-5 text-[17px] leading-[1.7] text-text-primary">{sec.body.map((p, i) => <p key={i}>{p}</p>)}</div>
              </div>
            ))}
          </article>

          <aside className="flex flex-col gap-6 lg:sticky lg:top-24 h-fit">
            <div className="rounded-xl border border-border p-6">
              <h3 className="text-sm font-semibold text-text-primary">Controls that make it safe</h3>
              <ul className="mt-4 flex flex-col gap-2.5">
                {u.controls.map((c) => (
                  <li key={c} className="flex items-start gap-2.5 text-[14px] leading-snug text-text-secondary"><Check size={15} className="mt-0.5 shrink-0 text-accent-700" strokeWidth={2.4} />{c}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl bg-surface-subtle border border-border p-6">
              <h3 className="text-sm font-semibold text-text-primary">What teams measure</h3>
              <ul className="mt-4 flex flex-col gap-2.5">
                {u.measures.map((m) => (
                  <li key={m} className="flex items-start gap-2.5 text-[14px] text-text-secondary"><span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-accent-600 shrink-0" />{m}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-border p-6">
              <h3 className="text-sm font-semibold text-text-primary">Systems around it</h3>
              <div className="mt-4"><SystemChips names={u.systems} /></div>
              <p className="mt-4 text-xs leading-relaxed text-text-tertiary">Systems connect through APIs, MCP servers, webhooks and the SDKs. Product names belong to their owners.</p>
            </div>
          </aside>
        </Container>
      </section>

      {tpl && (
        <section className="py-16 sm:py-20 bg-surface-subtle border-y border-border">
          <Container>
            <Eyebrow>The pipeline</Eyebrow>
            <H2 className="text-[1.7rem] sm:text-[2.1rem]">The same flow in the builder.</H2>
            <p className="mt-4 max-w-2xl text-text-secondary leading-relaxed">This is the example pipeline for the use case. Open it in staging, attach your own connections and change the steps to fit.</p>
            <div className="mt-6"><OperatorChips kinds={ops} /></div>
            <div className="mt-8">
              <Screenshot src={`/screens/uc/${u.slug}.webp`} url={`app.tokener.io/mlops/pipelines/${u.slug}`} alt={`The ${u.title} pipeline in the builder`} width={(dims as Record<string, number[]>)[u.slug]?.[0] ?? 1600} height={(dims as Record<string, number[]>)[u.slug]?.[1] ?? 900} />
            </div>
            <div className="mt-6"><ConsoleLink href={`/mlops/pipelines/new?template=${tpl}`} signedOut="Sign in to open it in the builder" variant="ink" arrow demo>Open this pipeline in the builder</ConsoleLink></div>
          </Container>
        </section>
      )}

      {u.console && (
        <section className="py-16 sm:py-20">
          <Container>
            <Eyebrow>In the console</Eyebrow>
            <H2 className="text-[1.7rem] sm:text-[2.1rem]">Where you see it working.</H2>
            <p className="mt-4 max-w-2xl text-text-secondary leading-relaxed">{u.console.caption}</p>
            <div className="mt-8"><Screenshot src={u.console.src} url={u.console.url} alt={u.console.caption} /></div>
          </Container>
        </section>
      )}

      {related.length > 0 && (
        <section className="py-16 sm:py-20 bg-surface-subtle border-t border-border">
          <Container>
            <div className="flex items-end justify-between gap-4 mb-8">
              <H2 className="text-[1.6rem] sm:text-[2rem]">Related use cases</H2>
              <Link href="/use-cases" className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-ink-800">All use cases <ArrowRight size={14} /></Link>
            </div>
            <div className="grid md:grid-cols-3 gap-5">{related.map((r) => <UseCaseCard key={r.slug} u={r} />)}</div>
          </Container>
        </section>
      )}
      <CtaBand title="Run this in staging this week." lead="Open the example pipeline, attach your connections and see the controls work before anything reaches production." />
    </>
  );
}
