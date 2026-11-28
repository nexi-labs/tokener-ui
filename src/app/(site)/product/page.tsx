import Link from "next/link";
import { Container, PageHero, Eyebrow, H2, Lead, Screenshot, CtaBand, TextLink } from "@/components/site/ui";
import { Boxes, Orbit } from "lucide-react";
import { PRODUCTS } from "@/lib/site";

export const metadata = { title: "Platform | tok∑ner" };

export default function ProductPage() {
  return (
    <>
      <PageHero
        eyebrow="Platform"
        title="One control plane for the AI you call and the AI you run."
        lead="Every product shares one identity, one policy layer and one audit trail."
      />
      <section className="py-16 sm:py-24">
        <Container className="flex flex-col gap-20">
          {PRODUCTS.map((p, i) => {
            const Icon = p.icon;
            return (
              <div key={p.slug} className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
                <div className={i % 2 ? "lg:order-2" : ""}>
                  <Icon size={24} strokeWidth={1.6} className="text-ink-500 mb-4" />
                  <H2 className="text-[1.6rem] sm:text-[2rem]">{p.name}</H2>
                  <Lead>{p.short}</Lead>
                  <div className="mt-6"><TextLink href={`/product/${p.slug}`}>Learn more</TextLink></div>
                </div>
                <div className={i % 2 ? "lg:order-1" : ""}>
                  <Screenshot src={p.shot} url={p.shotUrl} alt={p.name} />
                </div>
              </div>
            );
          })}
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div className="lg:order-2">
              <Orbit size={24} strokeWidth={1.6} className="text-ink-500 mb-4" />
              <H2 className="text-[1.6rem] sm:text-[2rem]">Agent OS</H2>
              <Lead>Register agents from any framework, put them in networks that decide who can reach them, let teams of agents work a use case as a mesh, and follow every run as one story. In preview, with every screen working against a sample workspace.</Lead>
              <div className="mt-6"><TextLink href="/product/agent-os">Learn more</TextLink></div>
            </div>
            <div className="lg:order-1"><Screenshot src="/screens/agentos-constellation.webp" url="app.tokener.io/agents/constellation" alt="Agent OS Constellation map" /></div>
          </div>
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <Boxes size={24} strokeWidth={1.6} className="text-ink-500 mb-4" />
              <H2 className="text-[1.6rem] sm:text-[2rem]">MLOps and AI infrastructure</H2>
              <Lead>Connect the infrastructure you already run, host your own models or connect ones you run, put them behind the gateway, build deployment pipelines, and give agents tools through MCP servers you build yourself. The AI canvas shows how it all connects.</Lead>
              <div className="mt-6 flex gap-6"><TextLink href="/product/mlops">Learn more</TextLink><TextLink href="/product/mlops/ai-canvas">AI canvas</TextLink><TextLink href="/product/mlops/integrations">Integrations</TextLink></div>
            </div>
            <div className="lg:order-2"><Screenshot src="/screens/mlops-overview.webp" url="app.tokener.io/mlops" alt="MLOps control plane in the console" /></div>
          </div>
        </Container>
      </section>
      <CtaBand />
    </>
  );
}
