import { Check } from "lucide-react";
import clsx from "clsx";
import { Container, PageHero, Eyebrow, H2, LinkButton, CtaBand } from "@/components/site/ui";
import { TIERS, COMPARE, FAQS } from "@/lib/site";

export const metadata = { title: "Pricing | tok∑ner" };

export default function PricingPage() {
  return (
    <>
      <PageHero eyebrow="Pricing" title="Start free. Pay for what you use." lead="New organizations start with usage credit and no card, and can try any feature. A payment method is asked for when you save or launch something metered, and you are billed only for usage beyond your free credit. Billing is metered by usage, not by seat, so every team can have access." />
      <section className="py-16 sm:py-20 -mt-1">
        <Container className="grid lg:grid-cols-3 gap-5 items-stretch">
          {TIERS.map((t) => (
            <div key={t.name} className={clsx("rounded-2xl border p-8 flex flex-col", t.featured ? "border-ink-800 border-2 shadow-popover" : "border-border")}>
              {t.featured && <span className="self-start text-[11px] font-mono uppercase tracking-wider bg-accent-500 text-ink-900 rounded px-2 py-0.5 mb-3">Most teams</span>}
              <h2 className="text-lg font-semibold text-text-primary">{t.name}</h2>
              <p className="text-sm text-text-secondary mt-1 min-h-[40px]">{t.blurb}</p>
              <div className="mt-5 flex items-baseline gap-2">
                <span className="text-4xl font-semibold tracking-tight text-text-primary">{t.price}</span>
                <span className="text-sm text-text-tertiary">{t.unit}</span>
              </div>
              <div className="mt-6"><LinkButton href={t.cta.href} variant={t.featured ? "ink" : "outline"} className="w-full">{t.cta.label}</LinkButton></div>
              <ul className="mt-7 flex flex-col gap-3">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-text-primary">
                    <Check size={16} className="text-accent-700 mt-0.5 shrink-0" />{f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Container>
      </section>

      <section className="pb-20">
        <Container>
          <H2 className="text-[1.6rem] sm:text-[2rem] mb-8">Compare plans</H2>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-surface-subtle text-left">
                <tr>
                  <th className="px-5 py-3 font-medium text-text-tertiary">Feature</th>
                  <th className="px-5 py-3 font-semibold">Free start</th>
                  <th className="px-5 py-3 font-semibold">Pay as you go</th>
                  <th className="px-5 py-3 font-semibold">Commitment</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((r) => (
                  <tr key={r.feature} className="border-t border-border">
                    <td className="px-5 py-3.5 text-text-secondary">{r.feature}</td>
                    <td className="px-5 py-3.5">{r.dev}</td>
                    <td className="px-5 py-3.5">{r.team}</td>
                    <td className="px-5 py-3.5">{r.ent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Container>
      </section>

      <section className="py-16 bg-surface-subtle border-y border-border">
        <Container>
          <Eyebrow>FAQ</Eyebrow>
          <H2 className="text-[1.6rem] sm:text-[2rem] mb-8">Questions we hear most.</H2>
          <div className="grid md:grid-cols-2 gap-x-12 gap-y-7">
            {FAQS.map((f) => (
              <div key={f.q}>
                <h3 className="font-semibold text-text-primary">{f.q}</h3>
                <p className="text-sm text-text-secondary mt-2 leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>
      <CtaBand />
    </>
  );
}
