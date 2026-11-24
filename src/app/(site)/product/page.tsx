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
        lead="The gateway, policy and budgets govern every model call. Refinery, MLOps and Agent OS prepare data, train models and run agents behind them. All of it shares one identity, one set of approvals and one audit trail."
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
              <Lead>Register agents from any framework, set budgets, approvals and data rules around them, run them the way each one needs, and follow every run as one story. In preview, with every screen working against a sample workspace.</Lead>
              <div className="mt-6"><TextLink href="/product/agent-os">Learn more</TextLink></div>
            </div>
            <div className="lg:order-1"><Screenshot src="/screens/agentos-constellation.webp" url="app.tokener.io/agents/constellation" alt="Agent OS Constellation map" /></div>
          </div>
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <Boxes size={24} strokeWidth={1.6} className="text-ink-500 mb-4" />
              <H2 className="text-[1.6rem] sm:text-[2rem]">MLOps and AI infrastructure</H2>
              <Lead>Connect the infrastructure you already run, build deployment pipelines visually or with a wizard, roll out models with approvals and an audit trail, and give agents tools through MCP servers you build yourself.</Lead>
              <div className="mt-6 flex gap-6"><TextLink href="/product/mlops">Learn more</TextLink><TextLink href="/product/mlops/integrations">Integrations</TextLink></div>
            </div>
            <div className="lg:order-2"><Screenshot src="/screens/mlops-overview.webp" url="app.tokener.io/mlops" alt="MLOps control plane in the console" /></div>
          </div>
        </Container>
      </section>
      <CtaBand />
    </>
  );
}
