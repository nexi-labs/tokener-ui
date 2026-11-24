import { Container, PageHero, Eyebrow, CtaBand, LinkButton } from "@/components/site/ui";
import { Code } from "@/components/site/CodeTabs";

export const metadata = { title: "Customers | tok∑ner" };

const SCENARIOS = [
  {
    who: "A retail bank",
    need: "Contract review assistants had to stay in approved regions and mask personal data before any model call.",
    config: `ALLOW MODEL claude-sonnet, gpt-4o
REQUIRE REGION eu-west, eu-central
PII mask
BUDGET project:contract-review 8000 USD monthly`,
  },
  {
    who: "A growth-stage SaaS company",
    need: "A looping agent once spent a week of budget overnight. The team wanted hard stops per project and one place for keys.",
    config: `BUDGET project:agents 500 USD daily
  WARN 50  THROTTLE 80  BLOCK 100
ALIAS chat-default -> anthropic/claude-sonnet, openai/gpt-4o`,
  },
  {
    who: "A multinational with many business units",
    need: "Central IT negotiates provider contracts once and each business unit needs its own budget and chargeback.",
    config: `TENANT emea INHERIT org-baseline
TENANT apac INHERIT org-baseline
BUDGET tenant:emea 60000 USD monthly
CHARGEBACK by project`,
  },
  {
    who: "A regional health system",
    need: "A clinical summarisation service had to stay inside the hospital network, mask patient identifiers and leave a record for every call.",
    config: `ALLOW MODEL self-hosted/llama-clinical
REQUIRE REGION onprem
PII mask patient_id, name, dob
AUDIT retain 7 years`,
  },
  {
    who: "An online retailer",
    need: "Campaign traffic tripled assistant usage. Marketing wanted spend per campaign, and engineering wanted failover with no deploy.",
    config: `BUDGET project:holiday-assistant 12000 USD monthly
  WARN 80  THROTTLE 95  BLOCK 100
ROUTE chat-default PRIORITY openai, anthropic
FAILOVER on timeout 4s`,
  },
  {
    who: "A manufacturer with plants in four countries",
    need: "Each plant needed models next to its data, deployed by a central team without opening inbound ports.",
    config: `AGENT plant-eu-01 OUTBOUND ONLY
ALLOW REGISTRY registry.example.com/models
PIPELINE vision-qa PROMOTE staging -> production
  REQUIRE APPROVAL role:approver`,
  },
];

export default function CustomersPage() {
  return (
    <>
      <PageHero eyebrow="Customers" title="How teams put tok∑ner to work." lead="Six scenarios drawn from the problems the platform was built to solve, each with the configuration that answers it. Named customer stories are added here as customers agree to share them." />
      <section className="py-16 sm:py-24">
        <Container className="flex flex-col gap-10">
          {SCENARIOS.map((s) => (
            <div key={s.who} className="grid lg:grid-cols-2 gap-8 items-center rounded-2xl border border-border p-6 sm:p-10">
              <div>
                <Eyebrow>Illustrative scenario</Eyebrow>
                <h2 className="text-2xl font-semibold text-text-primary">{s.who}</h2>
                <p className="text-text-secondary mt-3 leading-relaxed">{s.need}</p>
              </div>
              <Code lang="configuration, summarized">{s.config}</Code>
            </div>
          ))}
          <div className="text-center mt-4">
            <p className="text-text-secondary mb-4">Want to see your own scenario worked through?</p>
            <LinkButton href="/contact" variant="ink" arrow>Talk to us</LinkButton>
          </div>
        </Container>
      </section>
      <CtaBand />
    </>
  );
}
