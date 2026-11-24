import { ArrowRight, Code2, Server, Terminal } from "lucide-react";
import Link from "next/link";
import { Container, PageHero, CtaBand, Eyebrow, H2, LinkButton } from "@/components/site/ui";
import { IntegrationHub } from "@/components/site/IntegrationHub";
import { ConnectorsExplorer } from "@/components/site/ConnectorsExplorer";
import { CONNECTOR_COUNT, CONNECTOR_GROUPS } from "@/lib/connectors";

export const metadata = {
  title: "Connectors | tok∑ner",
  description: "Model providers, identity, observability, data, infrastructure and delivery tools that connect to tok∑ner.",
};

export default function ConnectorsPage() {
  return (
    <>
      <PageHero eyebrow="Connectors" title="Connect every model, system and team you already run." lead={`${CONNECTOR_COUNT} connectors across ${CONNECTOR_GROUPS.length} categories. Providers for the gateway, identity for sign-in, exports for operations, and targets for deployment, all configured in one place and governed by the same policy.`}>
        <LinkButton href="/signup" arrow>Start free</LinkButton>
        <LinkButton href="/developers/docs" variant="ghost-dark">Read the docs</LinkButton>
      </PageHero>

      <section className="bg-ink-800 border-b border-white/10 py-14 sm:py-20">
        <Container>
          <Eyebrow dark>How it fits</Eyebrow>
          <H2 dark>One endpoint in front, every provider behind.</H2>
          <div className="mt-10"><IntegrationHub /></div>
        </Container>
      </section>

      <section className="py-14 sm:py-20">
        <Container><ConnectorsExplorer /></Container>
      </section>

      <section className="py-14 sm:py-20 bg-surface-subtle border-y border-border">
        <Container>
          <Eyebrow>Not on the list</Eyebrow>
          <H2>Bring your own, through a contract that stays small.</H2>
          <div className="mt-10 grid md:grid-cols-3 gap-5">
            {[
              { icon: Server, title: "Any OpenAI-compatible endpoint", body: "Point a provider at a base URL and a key reference. Health checks, routing and cost tracking work the same as for built-in providers." },
              { icon: Terminal, title: "Build agents on your servers", body: "Run an outbound-only agent next to systems that no network path can reach. Jobs are signed, scoped and revocable." },
              { icon: Code2, title: "A connector contract", body: "Implement test, discover, plan and apply for your own platform. Results are typed, secrets are scrubbed, and failures are classified." },
            ].map((c) => (
              <div key={c.title} className="rounded-xl border border-border bg-surface p-6">
                <c.icon size={22} strokeWidth={1.6} className="text-ink-500 mb-4" />
                <h3 className="font-semibold text-text-primary">{c.title}</h3>
                <p className="text-sm text-text-secondary mt-2 leading-relaxed">{c.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link href="/product/mlops/integrations" className="inline-flex items-center gap-1.5 font-semibold text-ink-800 hover:underline">MLOps integration catalogue with versions and permissions <ArrowRight size={14} /></Link>
            <Link href="/developers/tutorials" className="inline-flex items-center gap-1.5 font-semibold text-ink-800 hover:underline">Connection tutorials <ArrowRight size={14} /></Link>
          </div>
        </Container>
      </section>
      <CtaBand />
    </>
  );
}
