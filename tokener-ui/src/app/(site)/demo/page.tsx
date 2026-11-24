import { Container, PageHero, Screenshot } from "@/components/site/ui";
import { LeadForm } from "@/components/site/LeadForm";

export const metadata = { title: "Book a demo | tok∑ner" };

export default function DemoPage() {
  return (
    <>
      <PageHero eyebrow="Book a demo" title="See your own policies and budgets running." lead="A 30 minute walkthrough tailored to your providers, your teams, and your compliance questions." />
      <section className="py-16 sm:py-24">
        <Container className="grid lg:grid-cols-2 gap-12 items-start">
          <LeadForm
            submit="Request a demo"
            success="Thanks. A solutions engineer will contact you shortly."
            fields={[
              { name: "name", label: "Name", half: true },
              { name: "email", label: "Work email", type: "email", half: true },
              { name: "company", label: "Company", half: true },
              { name: "size", label: "Company size", type: "select", options: ["1 to 50", "51 to 500", "501 to 5,000", "5,000+"], half: true },
              { name: "providers", label: "Which providers do you use today?", type: "textarea", placeholder: "For example OpenAI, Azure OpenAI, self-hosted models" },
            ]}
          />
          <Screenshot src="/screens/dashboard.webp" url="app.tokener.io/dashboard" alt="Console dashboard" />
        </Container>
      </section>
    </>
  );
}
