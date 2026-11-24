import { Container, PageHero, Eyebrow, LinkButton } from "@/components/site/ui";

export const metadata = { title: "Careers | tok∑ner" };

const TEAMS = [
  ["Gateway and data plane", "Low-latency Java and Spring, streaming, and provider adapters."],
  ["Streaming and analytics", "Kafka, Flink, and ClickHouse pipelines that never lose an event."],
  ["Control plane and design", "The console, the developer experience, and everything customers see."],
  ["Security and compliance", "Identity, isolation, audit, and the evidence customers ask for."],
  ["Solutions engineering", "Helping banks, health systems, and agencies deploy with confidence."],
];

export default function CareersPage() {
  return (
    <>
      <PageHero eyebrow="Careers" title="Build the control layer for AI." lead="We are a small team working on hard infrastructure problems. Open roles are listed by team below." />
      <section className="py-16 sm:py-24">
        <Container>
          <Eyebrow>Teams</Eyebrow>
          <div className="divide-y divide-border border-y border-border">
            {TEAMS.map(([t, b]) => (
              <div key={t} className="py-6 grid sm:grid-cols-[1fr_1.4fr] gap-2 sm:gap-8">
                <h2 className="font-semibold text-text-primary">{t}</h2>
                <p className="text-sm text-text-secondary">{b}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <LinkButton href="/contact" variant="ink" arrow>Introduce yourself</LinkButton>
            <span className="text-sm text-text-secondary">No listed role fits? Write to us anyway.</span>
          </div>
        </Container>
      </section>
    </>
  );
}
