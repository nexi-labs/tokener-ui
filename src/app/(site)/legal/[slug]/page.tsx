import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Container, PageHero, H2 } from "@/components/site/ui";
import { DOC_BY_SLUG, LEGAL_CONTACTS, LEGAL_DOCS, LEGAL_GROUPS, LEGAL_STATUS, anchorOf } from "@/lib/legal";

export function generateStaticParams() {
  return LEGAL_DOCS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = DOC_BY_SLUG[slug];
  return d ? { title: `${d.title} | tok∑ner`, description: d.summary } : {};
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = DOC_BY_SLUG[slug];
  if (!d) notFound();
  const group = LEGAL_GROUPS.find((g) => g.id === d.group)!;
  const idx = LEGAL_DOCS.findIndex((x) => x.slug === d.slug);
  return (
    <>
      <PageHero eyebrow={`Legal, ${group.title.toLowerCase()}`} title={d.title} lead={d.summary} />

      <div className="border-b border-border bg-surface-subtle">
        <Container className="py-5 flex flex-wrap items-center gap-x-10 gap-y-3 text-sm">
          <Meta k="Version" v={d.version} />
          <Meta k="Effective" v={d.effective} />
          <Meta k="Last updated" v={d.updated} />
          <span className="inline-flex items-center rounded-full border border-[#D9A441] bg-[#FFF7E3] px-3 py-1 text-xs font-medium text-[#7A4E00]">Draft, pending legal review</span>
        </Container>
      </div>

      <section className="py-14 sm:py-20">
        <Container className="grid lg:grid-cols-[230px_minmax(0,720px)] gap-10 lg:gap-16 justify-center">
          <nav aria-label="On this page" className="hidden lg:block">
            <div className="sticky top-24">
              <Link href="/legal" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"><ArrowLeft size={14} /> All legal documents</Link>
              <p className="mt-6 text-[11px] font-mono uppercase tracking-[0.14em] text-text-tertiary">On this page</p>
              <ol className="mt-3 space-y-2 text-sm">
                {d.clauses.map((c, i) => (
                  <li key={c.title}><a href={`#${anchorOf(i)}`} className="text-text-secondary hover:text-text-primary flex gap-2"><span className="font-mono text-text-tertiary w-5 shrink-0">{i + 1}.</span>{c.title}</a></li>
                ))}
                <li><a href="#history" className="text-text-secondary hover:text-text-primary flex gap-2"><span className="w-5 shrink-0" />Version history</a></li>
              </ol>
            </div>
          </nav>

          <article>
            <div className="rounded-xl border border-border p-6">
              <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-text-tertiary">In short</p>
              <ul className="mt-3 space-y-2.5">
                {d.inShort.map((s) => (
                  <li key={s} className="flex items-start gap-2.5 text-[15px] text-text-primary leading-relaxed">
                    <span className="mt-[9px] h-1.5 w-1.5 rounded-full bg-accent-600 shrink-0" />{s}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-text-tertiary">A summary to help you read. The numbered text below is what applies.</p>
            </div>

            <div className="mt-12 space-y-10">
              {d.clauses.map((c, i) => (
                <section key={c.title} id={anchorOf(i)} className="scroll-mt-24">
                  <h2 className="text-lg font-semibold text-text-primary">
                    <a href={`#${anchorOf(i)}`} className="no-underline hover:underline underline-offset-4"><span className="font-mono text-text-tertiary mr-2">{i + 1}.</span>{c.title}</a>
                  </h2>
                  <div className="mt-3 space-y-3">
                    {c.paras.map((p, j) => (
                      <p key={j} className="text-text-secondary leading-relaxed flex gap-3">
                        {c.paras.length > 1 && <span className="font-mono text-xs text-text-tertiary pt-[5px] w-8 shrink-0">{i + 1}.{j + 1}</span>}
                        <span>{p}</span>
                      </p>
                    ))}
                    {c.items && (
                      <ul className={`space-y-2 ${c.paras.length > 1 ? "pl-11" : ""}`}>
                        {c.items.map((it) => (
                          <li key={it} className="text-text-secondary leading-relaxed flex gap-2.5"><span className="mt-[9px] h-1 w-1 rounded-full bg-text-tertiary shrink-0" />{it}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>
              ))}
            </div>

            <section id="history" className="mt-16 scroll-mt-24">
              <H2 className="text-[1.3rem]">Version history</H2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm border-y border-border">
                  <thead><tr className="text-left text-text-tertiary text-xs font-mono uppercase tracking-wider"><th className="py-2 pr-4 font-normal">Version</th><th className="py-2 pr-4 font-normal">Date</th><th className="py-2 font-normal">What changed</th></tr></thead>
                  <tbody className="divide-y divide-border">
                    {d.history.map((h) => (
                      <tr key={h.version}><td className="py-3 pr-4 font-mono text-text-primary whitespace-nowrap">{h.version}</td><td className="py-3 pr-4 text-text-secondary whitespace-nowrap">{h.date}</td><td className="py-3 text-text-secondary">{h.change}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-sm text-text-secondary">When this text changes, the new version is added here and earlier versions stay listed.</p>
            </section>

            <section className="mt-14">
              <H2 className="text-[1.3rem]">Related documents</H2>
              <ul className="mt-4 grid sm:grid-cols-2 gap-3">
                {d.related.map((s) => DOC_BY_SLUG[s] && (
                  <li key={s}>
                    <Link href={`/legal/${s}`} className="block rounded-lg border border-border p-4 hover:border-border-strong hover:shadow-card transition-all">
                      <span className="font-semibold text-text-primary text-sm">{DOC_BY_SLUG[s].title}</span>
                      <span className="block text-xs text-text-secondary mt-1 leading-relaxed">{DOC_BY_SLUG[s].summary}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-14 rounded-xl bg-surface-subtle border border-border p-6">
              <p className="text-sm text-text-secondary leading-relaxed">{LEGAL_STATUS}</p>
              <p className="text-sm text-text-secondary mt-3">Questions about this document: <a className="font-mono text-text-primary hover:underline" href={`mailto:${LEGAL_CONTACTS[0].value}`}>{LEGAL_CONTACTS[0].value}</a> for privacy, <a className="font-mono text-text-primary hover:underline" href={`mailto:${LEGAL_CONTACTS[2].value}`}>{LEGAL_CONTACTS[2].value}</a> for contracts.</p>
            </section>

            <div className="mt-10 flex justify-between text-sm">
              {idx > 0 ? <Link href={`/legal/${LEGAL_DOCS[idx - 1].slug}`} className="text-text-secondary hover:text-text-primary">Previous: {LEGAL_DOCS[idx - 1].title}</Link> : <span />}
              {idx < LEGAL_DOCS.length - 1 ? <Link href={`/legal/${LEGAL_DOCS[idx + 1].slug}`} className="text-text-secondary hover:text-text-primary">Next: {LEGAL_DOCS[idx + 1].title}</Link> : <span />}
            </div>
          </article>
        </Container>
      </section>
    </>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return <div><span className="text-text-tertiary">{k}</span> <span className="ml-1.5 font-medium text-text-primary">{v}</span></div>;
}
