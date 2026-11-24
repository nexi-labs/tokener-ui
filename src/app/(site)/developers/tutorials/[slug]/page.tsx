import { notFound } from "next/navigation";
import Link from "next/link";
import { Container, Eyebrow } from "@/components/site/ui";
import { TutorialView } from "@/components/mlops/TutorialView";
import { TUTORIALS, tutorialBySlug } from "@/lib/mlops/tutorials";

export const dynamicParams = false;
export function generateStaticParams() { return TUTORIALS.map((t) => ({ slug: t.slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = tutorialBySlug(slug);
  return { title: t ? `${t.title} | Tutorials | tok∑ner` : "tok∑ner", description: t?.summary };
}

export default async function TutorialPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = tutorialBySlug(slug);
  if (!t) notFound();
  return (
    <section className="py-12 sm:py-16">
      <Container>
        <Link href="/developers/tutorials" className="inline-block mb-6 text-sm text-text-secondary hover:text-text-primary">&larr; All tutorials</Link>
        <Eyebrow>Tutorial</Eyebrow>
        <h1 className="text-[2rem] sm:text-4xl font-semibold tracking-[-0.02em] text-text-primary max-w-3xl -mt-2 mb-8">{t.title}</h1>
        <TutorialView t={t} />
      </Container>
    </section>
  );
}
