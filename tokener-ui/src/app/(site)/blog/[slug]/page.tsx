import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Container, CtaBand, Screenshot } from "@/components/site/ui";
import { ConsoleLink } from "@/components/auth/ConsoleLink";
import { FlowScene } from "@/components/site/FlowScene";
import { IndustryArt } from "@/components/site/IndustryArt";
import { POSTS, type Block } from "@/lib/blog";

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = POSTS.find((x) => x.slug === slug);
  return { title: p ? `${p.title} | tok∑ner` : "tok∑ner", description: p?.summary };
}

function Render({ b }: { b: Block }) {
  switch (b.t) {
    case "p": return <p className="text-[17px] leading-[1.8] text-text-secondary">{b.x}</p>;
    case "h": return <h2 className="text-[1.45rem] font-semibold tracking-[-0.01em] text-text-primary mt-6 leading-snug">{b.x}</h2>;
    case "ul": return (
      <ul className="flex flex-col gap-2.5 text-[16.5px] leading-[1.7] text-text-secondary">
        {b.items.map((i) => <li key={i} className="flex gap-3"><span className="mt-[11px] h-1.5 w-1.5 rounded-full bg-accent-600 shrink-0" />{i}</li>)}
      </ul>
    );
    case "art": return <div className="my-3"><IndustryArt kind={b.kind} /></div>;
    case "scene": return <div className="my-3"><FlowScene id={b.id} /></div>;
    case "callout": return (
      <aside className="rounded-xl border border-border border-l-[3px] border-l-accent-600 bg-surface-subtle px-6 py-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent-700">{b.title}</p>
        <p className="mt-2 text-[16.5px] leading-[1.7] text-text-primary">{b.x}</p>
      </aside>
    );
    case "stats": return (
      <dl className="grid grid-cols-3 gap-4 rounded-xl bg-ink-800 p-6">
        {b.items.map(([v, l]) => (
          <div key={l}><dt className="text-accent-500 text-3xl font-semibold tabular-nums">{v}</dt><dd className="text-text-tertiary text-xs mt-1.5 leading-snug">{l}</dd></div>
        ))}
      </dl>
    );
    case "shot": return (
      <figure className="my-3">
        <Screenshot src={b.src} url={b.url} alt={b.alt} width={b.w ?? 2400} height={b.h ?? 1500} />
        {b.caption && <figcaption className="mt-3 text-sm text-text-tertiary leading-relaxed">{b.caption}</figcaption>}
      </figure>
    );
    case "steps": return (
      <ol className="flex flex-col gap-5">
        {b.items.map(([title, body], i) => (
          <li key={title} className="flex gap-4">
            <span className="shrink-0 h-8 w-8 rounded-full bg-ink-800 text-accent-500 grid place-items-center text-sm font-semibold tabular-nums">{i + 1}</span>
            <div>
              <h3 className="text-[17px] font-semibold text-text-primary leading-snug">{title}</h3>
              <p className="mt-1.5 text-[16.5px] leading-[1.75] text-text-secondary">{body}</p>
            </div>
          </li>
        ))}
      </ol>
    );
    case "defs": return (
      <dl className="rounded-xl border border-border divide-y divide-border">
        {b.items.map(([term, def]) => (
          <div key={term} className="grid sm:grid-cols-[170px_1fr] gap-x-6 gap-y-1 px-5 py-4">
            <dt className="font-semibold text-text-primary text-[15px]">{term}</dt>
            <dd className="text-[15.5px] leading-relaxed text-text-secondary">{def}</dd>
          </div>
        ))}
      </dl>
    );
    case "try": return (
      <aside className="rounded-xl bg-ink-800 p-6 sm:p-7">
        {b.note && <p className="text-text-tertiary text-[15.5px] leading-relaxed mb-5 max-w-xl">{b.note}</p>}
        <ConsoleLink href={b.href} signedOut={`Sign in to ${b.label.charAt(0).toLowerCase()}${b.label.slice(1)}`} arrow demo dark>{b.label}</ConsoleLink>
      </aside>
    );
    case "links": return (
      <ul className="flex flex-col gap-2">
        {b.items.map(([label, href]) => (
          <li key={href}><Link href={href} className="inline-flex items-center gap-1.5 text-[16px] font-semibold text-ink-800 hover:underline">{label} <ArrowRight size={14} /></Link></li>
        ))}
      </ul>
    );
    case "code": return <pre className="rounded-xl bg-ink-800 text-text-inverse/90 p-5 text-[13px] leading-relaxed overflow-x-auto font-code"><code>{b.code}</code></pre>;
  }
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const i = POSTS.findIndex((x) => x.slug === slug);
  if (i < 0) notFound();
  const p = POSTS[i];
  const more = [1, 2].map((k) => POSTS[(i + k) % POSTS.length]);
  return (
    <>
      <article className="py-14 sm:py-20">
        <Container className="max-w-[860px]">
          <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary mb-8"><ArrowLeft size={14} /> Blog</Link>
          <div className="font-mono text-xs uppercase tracking-wider text-accent-700">{p.tag} &middot; {p.date} &middot; {p.read} read</div>
          <h1 className="text-3xl sm:text-[2.6rem] font-semibold tracking-[-0.02em] text-text-primary mt-3 leading-[1.12]">{p.title}</h1>
          <p className="mt-5 text-lg leading-relaxed text-text-secondary">{p.summary}</p>
          <div className="mt-10 flex flex-col gap-6">
            {p.blocks.map((b, k) => <Render key={k} b={b} />)}
          </div>
        </Container>
      </article>
      <section className="border-t border-border bg-surface-subtle py-14">
        <Container className="max-w-[1100px]">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent-700 mb-5">Keep reading</p>
          <div className="grid md:grid-cols-2 gap-5">
            {more.map((m) => (
              <Link key={m.slug} href={`/blog/${m.slug}`} className="rounded-xl border border-border bg-surface p-6 hover:border-border-strong hover:shadow-card transition-all group">
                <div className="text-xs font-mono uppercase tracking-wider text-text-tertiary">{m.tag} &middot; {m.read}</div>
                <h3 className="mt-3 text-lg font-semibold text-text-primary leading-snug">{m.title}</h3>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-800">Read <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" /></span>
              </Link>
            ))}
          </div>
        </Container>
      </section>
      <CtaBand />
    </>
  );
}
