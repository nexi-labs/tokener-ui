import { Container, PageHero, Eyebrow, H2, CtaBand } from "@/components/site/ui";

export const metadata = { title: "About | tok∑ner" };

export default function AboutPage() {
  return (
    <>
      <PageHero eyebrow="About" title="AI should be as governable as any other infrastructure." lead="Spend, access and accountability for AI were scattered. We built one place for them." />
      <section className="py-16 sm:py-24">
        <Container className="grid lg:grid-cols-2 gap-12">
          <div>
            <Eyebrow>Why the name</Eyebrow>
            <H2 className="text-[1.6rem] sm:text-[2rem]">Tokens, summed.</H2>
          </div>
          <div className="text-text-secondary leading-relaxed flex flex-col gap-4">
            <p>Every AI request is measured in tokens. The sigma in our name stands for the sum: the total of what was used, by whom, under which rule, and at what cost.</p>
            <p>We build the layer that turns that sum into decisions. It sits between applications and providers, and it gives finance, security, and platform teams the same view of the same truth.</p>
          </div>
        </Container>
      </section>
      <section className="py-16 sm:py-24">
        <Container className="grid lg:grid-cols-2 gap-12">
          <div>
            <Eyebrow>The problem</Eyebrow>
            <H2 className="text-[1.6rem] sm:text-[2rem]">AI spend and access grew faster than anyone's ability to see them.</H2>
          </div>
          <div className="text-text-secondary leading-relaxed flex flex-col gap-4">
            <p>A team adds a model to an application and puts a key in a config file. Another team does the same with a different provider. Within a year there are dozens of keys, several invoices and no single answer to a simple question: who is using what, and are they allowed to?</p>
            <p>Finance sees a bill without a cause. Security sees a risk without a record. Engineers see rate limits and outages they cannot route around. Each group builds its own partial fix, and none of them agree on the numbers.</p>
            <p>tok&#8721;ner puts one control plane in the path of every request, so the answer to each of those questions is a query rather than a project.</p>
          </div>
        </Container>
      </section>
      <section className="py-16 bg-surface-subtle border-y border-border">
        <Container>
          <Eyebrow>What we build</Eyebrow>
          <H2 className="text-[1.6rem] sm:text-[2rem]">One platform, from the first request to the last audit.</H2>
          <div className="mt-10 grid md:grid-cols-3 gap-6">
            {[
              ["The gateway", "An OpenAI-compatible endpoint that authenticates, applies policy and budgets, routes by health and records every request."],
              ["The control plane", "Tenants, roles, providers, policies, budgets, documents and an immutable audit trail, managed in one console or through the API."],
              ["AI infrastructure", "Connect clusters, build deployment pipelines, run build agents on your own servers and operate models with the same access and audit."],
            ].map(([t, b]) => (
              <div key={t} className="rounded-xl border border-border bg-surface p-6">
                <h3 className="font-semibold text-text-primary">{t}</h3>
                <p className="text-sm text-text-secondary mt-2 leading-relaxed">{b}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>
      <section className="py-16 bg-surface-subtle border-y border-border">
        <Container className="grid md:grid-cols-3 gap-8">
          {[
            ["Reject early", "A request that should not run should fail before it costs anything."],
            ["Never rewrite history", "Ledgers and audit trails are append-only, and corrections are new entries."],
            ["Portable by default", "Open wire formats and standard providers mean you can leave. That is why you can trust us."],
            ["Explain every decision", "A refusal should say which rule applied and why. A person should be able to read the answer without opening a ticket."],
            ["Least privilege, visibly", "Access starts narrow, secrets stay in your vault, and a disabled control always tells you the reason."],
            ["Boring where it matters", "Standard protocols, typed errors and predictable behaviour under failure. Surprises belong in your product, not in your infrastructure."],
          ].map(([t, b]) => (
            <div key={t}>
              <h3 className="font-semibold text-text-primary">{t}</h3>
              <p className="text-sm text-text-secondary mt-2 leading-relaxed">{b}</p>
            </div>
          ))}
        </Container>
      </section>
      <CtaBand />
    </>
  );
}
