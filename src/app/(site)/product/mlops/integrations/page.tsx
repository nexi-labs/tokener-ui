import { Container, PageHero, CtaBand } from "@/components/site/ui";
import { IntegrationCatalogue } from "@/components/site/IntegrationCatalogue";

export const metadata = { title: "Integration catalogue | MLOps | tok∑ner", description: "Every supported and in-development integration with an honest status, version target, prerequisites, capabilities and official documentation." };

export default function IntegrationsPage() {
  return (
    <>
      <PageHero eyebrow="MLOps / Integrations" title="The integration catalogue, with honest statuses." lead="Each entry says whether a real connector exists, which versions it targets, what it needs and where the vendor documentation lives. In development means the connector is specified and being built, with sample results in the setup flow until it ships." />
      <section className="py-14 sm:py-20"><Container><IntegrationCatalogue /></Container></section>
      <CtaBand />
    </>
  );
}
