import Link from "next/link";
import { Container, PageHero, Eyebrow, H2, Lead, Screenshot, CtaBand, LinkButton, TextLink } from "@/components/site/ui";
import { FlowStrip, StoryCarousel } from "@/components/mlops/StoryCarousel";
import { INTEGRATIONS } from "@/lib/mlops/catalog";
import { MLOPS_FLOW, MLOPS_STATUS, MLOPS_TOPICS } from "@/lib/mlops-site";
import { TUTORIALS } from "@/lib/mlops/tutorials";
import { FlowScene } from "@/components/site/FlowScene";
import { SCENES, SCENE_COPY } from "@/lib/scenes";

export const metadata = { title: "MLOps and AI infrastructure | tok∑ner", description: "Connect the infrastructure you already run, build pipelines visually or with a wizard, and deploy, observe and roll back models with approvals and an audit trail." };

export default function MlopsOverview() {
  const planned = INTEGRATIONS.filter((i) => i.status === "planned").length;
  return (
    <>
      <PageHero eyebrow="MLOps and AI infrastructure" title="Run models on your own infrastructure, under the same control plane." lead="Connect clusters, registries and data stores. Build deployment pipelines on a canvas or in a wizard. Roll out with approvals, watch capacity and keep an audit trail.">
        <LinkButton href="/signup" arrow>Get started free</LinkButton>
        <LinkButton href="/product/mlops/integrations" variant="ghost-dark">See integrations</LinkButton>
      </PageHero>

      <div className="bg-[linear-gradient(to_bottom,#07191E_40%,#ffffff_40%)]">
        <Container>
          <Screenshot src="/screens/mlops-overview.webp" url="app.tokener.io/mlops" alt="The MLOps control plane overview in the console for NexI Corp" priority />
        </Container>
      </div>

      <section className="py-16 sm:py-24">
        <Container>
          <Eyebrow>How it works</Eyebrow>
          <H2>From a connection to a safe rollout.</H2>
          <div className="grid md:grid-cols-4 gap-6 mt-10">
            {MLOPS_FLOW.map((f, i) => (
              <div key={f.t} className="border-t-2 border-ink-800 pt-5">
                <f.icon size={20} strokeWidth={1.7} className="text-ink-500" />
                <h3 className="text-base font-semibold text-text-primary mt-3">{f.t}</h3>
                <p className="text-sm text-text-secondary mt-1.5 leading-relaxed">{f.d}</p>
                <span className="sr-only">Stage {i + 1} of {MLOPS_FLOW.length}</span>
              </div>
            ))}
          </div>
          <div className="mt-12"><FlowScene id="mlops" /></div>
        </Container>
      </section>

      <section className="py-16 sm:py-24">
        <Container>
          <Eyebrow>Agents</Eyebrow>
          <H2>{SCENE_COPY.automation.title}</H2>
          <p className="text-text-secondary mt-3 max-w-2xl leading-relaxed">{SCENE_COPY.automation.lead}</p>
          <div className="mt-8"><FlowScene id="automation" /></div>
          <div className="mt-6"><TextLink href="/product/mlops/agent-builder">Explore the agent builder</TextLink></div>
        </Container>
      </section>

      <section className="py-16 sm:py-24 bg-surface-subtle border-y border-border">
        <Container>
          <Eyebrow>Payments</Eyebrow>
          <H2>{SCENE_COPY.payments.title}</H2>
          <p className="text-text-secondary mt-3 max-w-2xl leading-relaxed">{SCENE_COPY.payments.lead}</p>
          <div className="mt-8"><FlowScene id="payments" /></div>
          <div className="mt-6"><TextLink href="/product/mlops/payments">How payment agents work</TextLink></div>
        </Container>
      </section>

      <section className="py-16 sm:py-24">
        <Container>
          <Eyebrow>MCP</Eyebrow>
          <H2>{SCENE_COPY.mcp.title}</H2>
          <p className="text-text-secondary mt-3 max-w-2xl leading-relaxed">{SCENE_COPY.mcp.lead}</p>
          <div className="mt-8"><FlowScene id="mcp" /></div>
          <div className="mt-6"><TextLink href="/product/mlops/mcp-servers">Connect MCP servers</TextLink></div>
        </Container>
      </section>

      <section className="py-16 bg-surface-subtle border-y border-border">
        <Container>
          <StoryCarousel
            label="MLOps product walkthrough"
            slides={[
              { title: "Connect what you already run", body: "Kubernetes clusters, registries, model registries and data stores become read-only, TLS-verified connections. Secrets stay in your secret manager.", visual: <FlowStrip nodes={["Cluster", "Registry", "MLflow", "Object store"]} accentIndex={0} /> },
              { title: "One spec, two ways to author", body: "Draw the pipeline or follow the wizard. Both edit the same versioned specification, and you review generated manifests before anything applies.", note: "Switch at any time.", visual: <FlowStrip nodes={["Registry", "Approval", "Canary", "Verify", "Promote"]} accentIndex={2} /> },
              { title: "Deploy, verify, roll back", body: "Shift traffic gradually. If verification fails, restore the previous version in one step.", visual: <FlowStrip nodes={["Plan", "Apply", "Verify", "Promote"]} accentIndex={2} branch={{ from: 2, label: "Rollback" }} /> },
              { title: "Build on your own hardware", body: "An outbound-only build agent runs signed jobs from an allowlist on your Linux servers, clusters or Docker hosts.", visual: <FlowStrip nodes={["Source", "Agent", "Build", "Registry"]} accentIndex={1} /> },
            ]}
          />
        </Container>
      </section>

      <section className="py-16 sm:py-24">
        <Container>
          <Eyebrow>Capabilities</Eyebrow>
          <H2>Everything an AI platform team needs in one place.</H2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mt-10">
            {MLOPS_TOPICS.map((t) => (
              <Link key={t.slug} href={`/product/mlops/${t.slug}`} className="rounded-xl border border-border p-6 hover:border-border-strong hover:shadow-card transition-all">
                <t.icon size={22} strokeWidth={1.6} className="text-ink-500" />
                <h3 className="font-semibold text-text-primary mt-3">{t.name}</h3>
                <p className="text-sm text-text-secondary mt-1.5">{t.short}</p>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      <section className="py-16 bg-ink-800">
        <Container className="grid lg:grid-cols-2 gap-10">
          <div>
            <Eyebrow dark>What is available today</Eyebrow>
            <H2 dark className="text-[1.6rem] sm:text-[2rem]">Honest about what is real.</H2>
            <Lead dark>{MLOPS_STATUS}</Lead>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 content-start">
            <div className="rounded-lg border border-white/10 p-5"><div className="text-3xl font-semibold text-text-inverse">{INTEGRATIONS.length}</div><p className="text-sm text-text-tertiary mt-1">catalogue entries, {planned} marked Planned</p><div className="mt-3"><TextLink href="/product/mlops/integrations" dark>Browse the catalogue</TextLink></div></div>
            <div className="rounded-lg border border-white/10 p-5"><div className="text-3xl font-semibold text-text-inverse">{TUTORIALS.length}</div><p className="text-sm text-text-tertiary mt-1">tutorials with real vendor commands</p><div className="mt-3"><TextLink href="/developers/tutorials" dark>Read the tutorials</TextLink></div></div>
          </div>
        </Container>
      </section>
      <CtaBand />
    </>
  );
}
