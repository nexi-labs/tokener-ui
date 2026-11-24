import { notFound } from "next/navigation";
import Link from "next/link";
import { Container, PageHero, Eyebrow, H2, Lead, Screenshot, CtaBand, LinkButton, TextLink } from "@/components/site/ui";
import { PRODUCTS, PRODUCT_DEEP } from "@/lib/site";
import { FlowScene } from "@/components/site/FlowScene";
import { PRODUCT_SCENE, SCENES, SCENE_COPY } from "@/lib/scenes";
import { ProductDiagrams } from "@/components/site/ProductDiagrams";
import { diagramsFor } from "@/lib/product-diagrams";

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = PRODUCTS.find((x) => x.slug === slug);
  return { title: p ? `${p.name} | tok∑ner` : "tok∑ner" };
}

export default async function ProductDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = PRODUCTS.find((x) => x.slug === slug);
  if (!p) notFound();
  const sceneId = PRODUCT_SCENE[p.slug];
  const scene = sceneId ? SCENES[sceneId] : undefined;
  const copy = sceneId ? SCENE_COPY[sceneId] : undefined;
  const deep = PRODUCT_DEEP[p.slug];
  const others = PRODUCTS.filter((x) => x.slug !== p.slug).slice(0, 3);

  return (
    <>
      <PageHero eyebrow={p.name} title={p.headline} lead={p.body}>
        <LinkButton href="/signup" arrow>Get started free</LinkButton>
        <LinkButton href="/demo" variant="ghost-dark">Book a demo</LinkButton>
      </PageHero>

      <div className="bg-[linear-gradient(to_bottom,#07191E_40%,#ffffff_40%)]">
        <Container>
          <Screenshot src={p.shot} url={p.shotUrl} alt={`${p.name} in the console`} priority />
        </Container>
      </div>

      <section className="py-16 sm:py-24">
        <Container>
          <Eyebrow>What you get</Eyebrow>
          <div className="grid md:grid-cols-3 gap-8 mt-2">
            {p.highlights.map((h) => (
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

      <ProductDiagrams diagrams={diagramsFor(p.slug)} product={p.name} />

      <section className="py-16 bg-surface-subtle border-y border-border">
        <Container className="grid lg:grid-cols-2 gap-10">
          <div>
            <Eyebrow>Details</Eyebrow>
            <H2 className="text-[1.6rem] sm:text-[2rem]">Built for production.</H2>
          </div>
          <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-3 content-start">
            {p.bullets.map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-sm text-text-primary">
                <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-accent-600 shrink-0" />
                {b}
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {deep && (
        <section className="py-16 sm:py-24">
          <Container>
            <Eyebrow>Step by step</Eyebrow>
            <H2 className="text-[1.6rem] sm:text-[2rem]">What happens, in plain terms.</H2>
            <ol className="mt-10 grid md:grid-cols-2 xl:grid-cols-4 gap-6">
              {deep.how.map((s, i) => (
                <li key={s.title} className="relative rounded-xl border border-border p-6">
                  <span className="absolute -top-3 left-5 h-6 min-w-6 px-1.5 rounded-full bg-ink-800 text-accent-500 text-xs font-mono grid place-items-center">{i + 1}</span>
                  <h3 className="font-semibold text-text-primary mt-1">{s.title}</h3>
                  <p className="text-sm text-text-secondary mt-2 leading-relaxed">{s.body}</p>
                </li>
              ))}
            </ol>
          </Container>
        </section>
      )}

      {deep && (
        <section className="py-16 bg-surface-subtle border-y border-border">
          <Container className="grid lg:grid-cols-[0.7fr_1.3fr] gap-10">
            <div><Eyebrow>Common questions</Eyebrow><H2 className="text-[1.6rem] sm:text-[2rem]">Before you ask.</H2></div>
            <dl className="divide-y divide-border">
              {deep.faq.map((f) => (
                <div key={f.q} className="py-5 first:pt-0">
                  <dt className="font-semibold text-text-primary">{f.q}</dt>
                  <dd className="text-sm text-text-secondary mt-2 leading-relaxed">{f.a}</dd>
                </div>
              ))}
            </dl>
          </Container>
        </section>
      )}

      <section className="py-16 sm:py-20">
        <Container>
          <h2 className="text-xl font-semibold text-text-primary mb-6">Explore more of the platform</h2>
          <div className="grid md:grid-cols-3 gap-5">
            {others.map((o) => (
              <Link key={o.slug} href={`/product/${o.slug}`} className="rounded-xl border border-border p-6 hover:border-border-strong hover:shadow-card transition-all">
                <h3 className="font-semibold text-text-primary">{o.name}</h3>
                <p className="text-sm text-text-secondary mt-2">{o.short}</p>
              </Link>
            ))}
          </div>
        </Container>
      </section>
      <CtaBand />
    </>
  );
}
