import { Container, PageHero, CtaBand } from "@/components/site/ui";
import { IntegrationCatalogue } from "@/components/site/IntegrationCatalogue";

export const metadata = { title: "Integration catalogue | MLOps | tok∑ner", description: "Every supported and in-development integration with an honest status, version target, prerequisites, capabilities and official documentation." };

export default function IntegrationsPage() {
  return (
    <>
      <PageHero eyebrow="MLOps / Integrations" title="Every integration, with an honest status." lead="Every connector, with its real status and what it needs." />
      <section className="py-14 sm:py-20"><Container><IntegrationCatalogue /></Container></section>
      <CtaBand />
    </>
  );
}
