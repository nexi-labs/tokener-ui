import Link from "next/link";
import { ArrowUpRight, Info } from "lucide-react";
import { Container, PageHero, H2 } from "@/components/site/ui";
import { LEGAL_CONTACTS, LEGAL_DOCS, LEGAL_GROUPS, LEGAL_STATUS } from "@/lib/legal";

export const metadata = {
  title: "Legal | tok∑ner",
  description: "Every agreement and policy that applies to tok∑ner, with its version, date and a plain summary.",
};

const OTHER: { group: string; label: string; href: string; body: string }[] = [
  { group: "trust", label: "Security", href: "/security", body: "Encryption, tenant isolation, the audit trail and how we run the service." },
  { group: "trust", label: "Status", href: "/status", body: "Current availability and past incidents." },
  { group: "site", label: "Brand and trademark use", href: "/brand", body: "How to use the name, logo and colors." },
];

export default function LegalHub() {
  return (
    <>
      <PageHero eyebrow="Legal" title="Every agreement and policy, in one place." lead="Each document has a version, a date and a short plain summary above the full text." />
      <section className="py-14 sm:py-20">
        <Container className="max-w-[920px]">
          <div className="flex gap-3 rounded-lg border border-border bg-surface-subtle p-4 text-sm text-text-secondary leading-relaxed">
            <Info size={18} className="shrink-0 mt-0.5 text-ink-500" />
            <p>{LEGAL_STATUS}</p>
          </div>

          <div className="mt-12 space-y-14">
            {LEGAL_GROUPS.map((g) => {
              const docs = LEGAL_DOCS.filter((d) => d.group === g.id);
              const other = OTHER.filter((o) => o.group === g.id);
              return (
                <div key={g.id} id={g.id} className="scroll-mt-24">
                  <H2 className="text-[1.5rem] sm:text-[1.75rem]">{g.title}</H2>
                  <p className="text-text-secondary mt-1.5">{g.blurb}</p>
                  <ul className="mt-6 divide-y divide-border border-y border-border">
                    {docs.map((d) => (
                      <li key={d.slug}>
                        <Link href={`/legal/${d.slug}`} className="group grid sm:grid-cols-[1fr_auto] gap-x-8 gap-y-1 py-5 hover:bg-surface-subtle -mx-3 px-3 rounded-md transition-colors">
                          <span>
                            <span className="font-semibold text-text-primary group-hover:underline underline-offset-4">{d.title}</span>
                            <span className="block text-sm text-text-secondary mt-1 leading-relaxed">{d.summary}</span>
                          </span>
                          <span className="text-xs font-mono text-text-tertiary sm:text-right sm:pt-1 whitespace-nowrap">
                            {d.version}<br />Updated {d.updated}
                          </span>
                        </Link>
                      </li>
                    ))}
                    {other.map((o) => (
                      <li key={o.href}>
                        <Link href={o.href} className="group grid sm:grid-cols-[1fr_auto] gap-x-8 py-5 hover:bg-surface-subtle -mx-3 px-3 rounded-md transition-colors">
                          <span>
                            <span className="font-semibold text-text-primary group-hover:underline underline-offset-4">{o.label}</span>
                            <span className="block text-sm text-text-secondary mt-1 leading-relaxed">{o.body}</span>
                          </span>
                          <ArrowUpRight size={16} className="text-text-tertiary sm:mt-1.5" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          <div className="mt-16 grid md:grid-cols-2 gap-10">
            <div>
              <H2 className="text-[1.3rem]">How these documents fit together</H2>
              <ul className="mt-4 space-y-3 text-sm text-text-secondary leading-relaxed">
                <li>Your order form, if you have one, comes first. It names the contracting company, the governing law, liability limits and service credits.</li>
                <li>The Terms of service and Service terms come next, then the policies they refer to.</li>
                <li>When a document changes, the version and date change, and earlier versions stay listed in its history.</li>
              </ul>
            </div>
            <div>
              <H2 className="text-[1.3rem]">Who to write to</H2>
              <dl className="mt-4 divide-y divide-border border-y border-border">
                {LEGAL_CONTACTS.map((c) => (
                  <div key={c.value} className="flex justify-between gap-6 py-3 text-sm">
                    <dt className="text-text-secondary">{c.label}</dt>
                    <dd><a className="font-mono text-text-primary hover:underline" href={`mailto:${c.value}`}>{c.value}</a></dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
