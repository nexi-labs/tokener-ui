import { notFound } from "next/navigation";
import Link from "next/link";
import { Container, PageHero, Eyebrow, H2, Screenshot, CtaBand, LinkButton, TextLink } from "@/components/site/ui";
import { MLOPS_STATUS, MLOPS_TOPICS, topicBySlug } from "@/lib/mlops-site";
import { tutorialBySlug } from "@/lib/mlops/tutorials";
import { FlowScene } from "@/components/site/FlowScene";
import { SCENES, SCENE_COPY } from "@/lib/scenes";
import { ProductDiagrams } from "@/components/site/ProductDiagrams";
import { diagramsFor } from "@/lib/product-diagrams";

export const dynamicParams = false;
export function generateStaticParams() { return MLOPS_TOPICS.map((t) => ({ topic: t.slug })); }

export async function generateMetadata({ params }: { params: Promise<{ topic: string }> }) {
  const { topic } = await params;
  const t = topicBySlug(topic);
  return { title: t ? `${t.name} | MLOps | tok∑ner` : "tok∑ner", description: t?.short };
}

export default async function Topic({ params }: { params: Promise<{ topic: string }> }) {
  const { topic } = await params;
  const t = topicBySlug(topic);
  if (!t) notFound();
  const scene = t.scene ? SCENES[t.scene] : undefined;
  const copy = t.scene ? SCENE_COPY[t.scene] : undefined;
  const tut = t.tutorial ? tutorialBySlug(t.tutorial) : undefined;
  const others = MLOPS_TOPICS.filter((x) => x.slug !== t.slug).slice(0, 3);
  return (
    <>
      <PageHero eyebrow={`MLOps / ${t.name}`} title={t.headline} lead={t.body}>
        <LinkButton href="/signup" arrow>Get started free</LinkButton>
        <LinkButton href="/product/mlops" variant="ghost-dark">MLOps overview</LinkButton>
      </PageHero>
      <div className="bg-[linear-gradient(to_bottom,#07191E_40%,#ffffff_40%)]">
        <Container>
          <Screenshot src={t.shot} url={`${t.shotUrl}`} alt={`${t.name} in the console`} priority />
        </Container>
      </div>

      <section className="py-16 sm:py-24">
        <Container>
          <Eyebrow>What you get</Eyebrow>
          <div className="grid md:grid-cols-3 gap-8 mt-2">
            {t.highlights.map((h) => (
              <div key={h.title} className="border-t-2 border-ink-800 pt-5">
                <h3 className="text-lg font-semibold text-text-primary">{h.title}</h3>
                <p className="text-sm text-text-secondary mt-2 leading-relaxed">{h.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {scene && copy && (
        <section className="pb-16 sm:pb-24">
          <Container>
            <Eyebrow>How it works</Eyebrow>
            <H2 className="text-[1.6rem] sm:text-[2rem]">{copy.title}</H2>
            <p className="text-text-secondary mt-3 max-w-2xl leading-relaxed">{copy.lead}</p>
            <div className="mt-8"><FlowScene id={scene.id} /></div>
          </Container>
        </section>
      )}

      <ProductDiagrams diagrams={diagramsFor(t.slug, "mlops")} product={t.name} />

      <section className="py-16 bg-surface-subtle border-y border-border">
        <Container className="grid lg:grid-cols-2 gap-10">
          <div>
            <Eyebrow>Details</Eyebrow>
            <H2 className="text-[1.6rem] sm:text-[2rem]">Built for production use.</H2>
            <p className="text-sm text-text-secondary mt-4 max-w-md leading-relaxed">{MLOPS_STATUS}</p>
          </div>
          <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-3 content-start">
            {t.bullets.map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-sm text-text-primary"><span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-accent-600 shrink-0" />{b}</li>
            ))}
          </ul>
        </Container>
      </section>

      {tut && (
        <section className="py-14">
          <Container className="flex flex-wrap items-center justify-between gap-4">
            <div><Eyebrow>Tutorial</Eyebrow><h2 className="text-xl font-semibold text-text-primary">{tut.title}</h2><p className="text-sm text-text-secondary mt-1 max-w-xl">{tut.summary}</p></div>
            <TextLink href={`/developers/tutorials/${tut.slug}`}>Open the tutorial</TextLink>
          </Container>
        </section>
      )}

      <section className="py-16 sm:py-20">
        <Container>
          <h2 className="text-xl font-semibold text-text-primary mb-6">More from MLOps</h2>
          <div className="grid md:grid-cols-3 gap-5">
            {others.map((o) => (
              <Link key={o.slug} href={`/product/mlops/${o.slug}`} className="rounded-xl border border-border p-6 hover:border-border-strong hover:shadow-card transition-all">
                <h3 className="font-semibold text-text-primary">{o.name}</h3><p className="text-sm text-text-secondary mt-2">{o.short}</p>
              </Link>
            ))}
          </div>
        </Container>
      </section>
      <CtaBand />
    </>
  );
}
