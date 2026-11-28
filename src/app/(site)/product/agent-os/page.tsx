import Link from "next/link";
import { Info } from "lucide-react";
import { Container, PageHero, Eyebrow, H2, Lead, Screenshot, CtaBand, LinkButton, TextLink } from "@/components/site/ui";
import { FlowScene } from "@/components/site/FlowScene";
import { AGENT_OS_FAQ, AGENT_OS_FLOW, AGENT_OS_RUNTIMES, AGENT_OS_STATUS, AGENT_OS_TOPICS } from "@/lib/agent-os-site";

export const metadata = {
  title: "Agent OS | tok∑ner",
  description: "Register agents from any framework, put them in networks that decide who can reach them, let them work a use case together as a mesh, and follow every run as one story.",
};

export default function AgentOsPage() {
  return (
    <>
      <PageHero
        eyebrow="Agent OS"
        title="Agents do the work. People make the decisions."
        lead="Networks, meshes and approvals for agents from any framework."
      >
        <LinkButton href="/signup" arrow>Get started free</LinkButton>
        <LinkButton href="/product/agent-os#preview" variant="ghost-dark">What is available today</LinkButton>
      </PageHero>

      <div className="bg-[linear-gradient(to_bottom,#07191E_40%,#ffffff_40%)]">
        <Container>
          <Screenshot src="/screens/agentos-constellation.webp" url="app.tokener.io/agents/constellation" alt="The Constellation map of agents grouped by department, with the protocols between them and the rules around each one" priority />
        </Container>
      </div>

      <section className="py-16 sm:py-24">
        <Container>
          <Eyebrow>How it works</Eyebrow>
          <H2>From a registered agent to a run you can explain.</H2>
          <div className="grid md:grid-cols-4 gap-6 mt-10">
            {AGENT_OS_FLOW.map((f, i) => (
              <div key={f.t} className="border-t-2 border-ink-800 pt-5">
                <f.icon size={20} strokeWidth={1.7} className="text-ink-500" />
                <h3 className="text-base font-semibold text-text-primary mt-3">{f.t}</h3>
                <p className="text-sm text-text-secondary mt-1.5 leading-relaxed">{f.d}</p>
                <span className="sr-only">Stage {i + 1} of {AGENT_OS_FLOW.length}</span>
              </div>
            ))}
          </div>
          <div className="mt-12"><FlowScene id="agentflow" /></div>
        </Container>
      </section>

      {AGENT_OS_TOPICS.slice(0, 6).map((t, i) => (
        <section key={t.slug} id={t.slug} className={i % 2 === 0 ? "py-16 sm:py-24 bg-surface-subtle border-y border-border" : "py-16 sm:py-24"}>
          <Container className="grid lg:grid-cols-[0.8fr_1.2fr] gap-10 lg:gap-16 items-center">
            <div className={i % 2 === 0 ? "" : "lg:order-2"}>
              <t.icon size={24} strokeWidth={1.6} className="text-ink-500 mb-4" />
              <H2 className="text-[1.6rem] sm:text-[2rem]">{t.name}</H2>
              <Lead>{t.short}</Lead>
              <ul className="mt-6 space-y-3">
                {t.points.map((b) => (
                  <li key={b} className="flex items-start gap-2.5 text-sm text-text-primary leading-relaxed">
                    <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-accent-600 shrink-0" />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
            <div className={i % 2 === 0 ? "" : "lg:order-1"}>
              <Screenshot src={t.shot} url={t.shotUrl} alt={`${t.name} in the console`} />
            </div>
          </Container>
        </section>
      ))}

      <section id="networks-and-mesh" className="py-16 sm:py-24 bg-ink-800 relative overflow-hidden scroll-mt-20">
        <Container className="relative">
          <Eyebrow dark>Networks and mesh</Eyebrow>
          <H2 dark>Who can reach an agent is one question. Who works with whom is another.</H2>
          <Lead dark>Most teams need both answers before agents touch money, health records or customers. A network is the boundary. A mesh is the team that works inside the boundaries, with limits and a person where it counts.</Lead>
          <div className="mt-10 grid lg:grid-cols-2 gap-6">
            {[
              { t: "Agent Networks", q: "Who can reach this agent, and what may it call?", d: "Claims agents sit in a private network. Finance agents sit in another. The two are peered on purpose, so a payout can be prepared, and a call from anywhere else is refused with the reason.", id: "agentnet", href: "/use-cases/agent-networks-claims-isolation" },
              { t: "Agent Mesh", q: "Who works the case, in what order, and when does a person decide?", d: "Intake, documents, cover, invoice and payout work one claim as a pipeline. The mesh caps handoffs, cost and time, and a person approves before the money moves.", id: "agentmesh", href: "/use-cases/agent-mesh-motor-claims" },
            ].map((c) => (
              <div key={c.id} className="rounded-xl border border-white/10 bg-ink-900/60 p-6">
                <h3 className="text-lg font-semibold text-text-inverse">{c.t}</h3>
                <p className="text-sm text-accent-500 mt-1">{c.q}</p>
                <p className="text-sm text-text-tertiary mt-3 leading-relaxed">{c.d}</p>
                <div className="mt-5"><FlowScene id={c.id} bare /></div>
                <div className="mt-4"><TextLink href={c.href} dark>Read the use case</TextLink></div>
              </div>
            ))}
          </div>
          <div className="mt-8 grid md:grid-cols-3 gap-4 text-sm">
            {[
              ["Checked against each other", "A mesh handoff between agents that no network lets talk is an error, and a mesh with errors cannot go live."],
              ["One picture", "The Constellation shows networks as zones, peering as dashed lines, and a mesh as arrows with their conditions."],
              ["Honest about today", "Both run against the sample workspace. The mesh replays a sample case and nothing enforces a network at a real edge yet."],
            ].map(([t, b]) => (
              <div key={t} className="rounded-lg border border-white/10 p-5"><p className="font-semibold text-text-inverse">{t}</p><p className="text-text-tertiary mt-1.5 leading-relaxed">{b}</p></div>
            ))}
          </div>
        </Container>
      </section>

      <section className="py-16 sm:py-24">
        <Container>
          <Eyebrow>Runtime</Eyebrow>
          <H2>Run each agent the way its work needs.</H2>
          <Lead>A refund checker and a nightly review do not need the same hosting. Choose the shape per agent, then say what may start it, when a person must step in and how far it may scale.</Lead>
          <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-10 mt-10 items-start">
            <Screenshot src="/screens/agentos-runtime.webp" url="app.tokener.io/agents/registry" alt="The runtime settings of an agent: hosting shape, what starts it, human review and scaling" />
            <dl className="divide-y divide-border">
              {AGENT_OS_RUNTIMES.map((r) => (
                <div key={r.name} className="py-4 first:pt-0">
                  <dt className="font-semibold text-text-primary">{r.name}</dt>
                  <dd className="text-sm text-text-secondary mt-1 leading-relaxed">{r.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Container>
      </section>

      <section className="py-16 sm:py-24 bg-surface-subtle border-y border-border">
        <Container>
          <Eyebrow>Connections</Eyebrow>
          <H2>Agents reach your systems through the connections you already govern.</H2>
          <Lead>Agents use the same connection hub as the rest of the platform. A read runs, a write waits for a person, and a call outside its scope is refused. Secrets stay as references.</Lead>
          <div className="mt-8"><FlowScene id="connectors" /></div>
          <div className="mt-6 flex gap-6 flex-wrap"><TextLink href="/connectors">Browse connectors</TextLink><TextLink href="/product/mlops/mcp-servers">MCP servers</TextLink></div>
        </Container>
      </section>

      <section className="py-16 sm:py-24">
        <Container>
          <Eyebrow>And the rest</Eyebrow>
          <H2>Everything around the agent.</H2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mt-10">
            {AGENT_OS_TOPICS.slice(6).map((t) => (
              <div key={t.slug} id={t.slug} className="rounded-xl border border-border p-6">
                <t.icon size={22} strokeWidth={1.6} className="text-ink-500" />
                <h3 className="font-semibold text-text-primary mt-3">{t.name}</h3>
                <p className="text-sm text-text-secondary mt-1.5 leading-relaxed">{t.short}</p>
                <ul className="mt-4 space-y-2">
                  {t.points.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-[13px] text-text-secondary leading-relaxed">
                      <span className="mt-[7px] h-1 w-1 rounded-full bg-accent-600 shrink-0" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section id="preview" className="py-16 bg-ink-800 scroll-mt-20">
        <Container className="grid lg:grid-cols-2 gap-10">
          <div>
            <Eyebrow dark>What is available today</Eyebrow>
            <H2 dark className="text-[1.6rem] sm:text-[2rem]">Honest about what is real.</H2>
            <Lead dark>{AGENT_OS_STATUS}</Lead>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 content-start">
            <div className="rounded-lg border border-white/10 p-5">
              <Info size={18} className="text-accent-500" />
              <p className="text-sm text-text-inverse mt-3 font-semibold">Try every screen</p>
              <p className="text-sm text-text-tertiary mt-1">Sign in and open Agent OS. The sample workspace is marked on each page.</p>
              <div className="mt-3"><TextLink href="/signup" dark>Get started</TextLink></div>
            </div>
            <div className="rounded-lg border border-white/10 p-5">
              <Info size={18} className="text-accent-500" />
              <p className="text-sm text-text-inverse mt-3 font-semibold">Read the writing</p>
              <p className="text-sm text-text-tertiary mt-1">Walk-throughs of approvals, evaluations and the claims example.</p>
              <div className="mt-3"><TextLink href="/blog" dark>Open the blog</TextLink></div>
            </div>
          </div>
        </Container>
      </section>

      <section className="py-16 sm:py-24">
        <Container className="grid lg:grid-cols-[0.7fr_1.3fr] gap-10">
          <div><Eyebrow>Common questions</Eyebrow><H2 className="text-[1.6rem] sm:text-[2rem]">Before you ask.</H2></div>
          <dl className="divide-y divide-border">
            {AGENT_OS_FAQ.map((f) => (
              <div key={f.q} className="py-5 first:pt-0">
                <dt className="font-semibold text-text-primary">{f.q}</dt>
                <dd className="text-sm text-text-secondary mt-2 leading-relaxed">{f.a}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      <section className="pb-16 sm:pb-20">
        <Container>
          <h2 className="text-xl font-semibold text-text-primary mb-6">Explore more of the platform</h2>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { h: "/product/mlops", t: "MLOps and AI infrastructure", d: "Connect clusters, build pipelines, deploy and observe models." },
              { h: "/product/policy-engine", t: "Policy Engine", d: "Governance written as versioned policy, enforced on every request." },
              { h: "/product/mlops/ai-canvas", t: "AI canvas", d: "Bring your own model, put it behind the gateway and offer it to agents as an MCP tool." },
            ].map((o) => (
              <Link key={o.h} href={o.h} className="rounded-xl border border-border p-6 hover:border-border-strong hover:shadow-card transition-all">
                <h3 className="font-semibold text-text-primary">{o.t}</h3>
                <p className="text-sm text-text-secondary mt-2">{o.d}</p>
              </Link>
            ))}
          </div>
        </Container>
      </section>
      <CtaBand />
    </>
  );
}
