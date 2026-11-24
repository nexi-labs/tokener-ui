import { Container, PageHero } from "@/components/site/ui";
import { LeadForm } from "@/components/site/LeadForm";

export const metadata = { title: "Contact | tok∑ner" };

export default function ContactPage() {
  return (
    <>
      <PageHero eyebrow="Contact" title="Talk to the team." lead="Sales, security reviews, partnerships, and support all start here." />
      <section className="py-16 sm:py-24">
        <Container className="grid lg:grid-cols-[1fr_1.2fr] gap-12">
          <div className="flex flex-col gap-6 text-sm">
            {[["Sales", "sales@tokener.io"], ["Security", "security@tokener.io"], ["Support", "support@tokener.io"], ["Careers", "careers@tokener.io"]].map(([l, e]) => (
              <div key={l}>
                <div className="text-text-tertiary text-xs uppercase tracking-wider font-mono">{l}</div>
                <div className="text-text-primary mt-1 font-medium">{e}</div>
              </div>
            ))}
          </div>
          <LeadForm
            submit="Send message"
            success="Thanks. We will reply within one business day."
            fields={[
              { name: "name", label: "Name", half: true },
              { name: "email", label: "Work email", type: "email", half: true },
              { name: "company", label: "Company", half: true },
              { name: "topic", label: "Topic", type: "select", options: ["Sales", "Security review", "Support", "Partnership", "Other"], half: true },
              { name: "message", label: "How can we help?", type: "textarea" },
            ]}
          />
        </Container>
      </section>
    </>
  );
}
