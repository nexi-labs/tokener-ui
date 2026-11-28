import { ConsoleLink } from "@/components/auth/ConsoleLink";
import { DemoLink } from "@/components/auth/DemoLink";
import Link from "next/link";
import { siOpenai, siAnthropic, siGooglegemini, siAmazonwebservices, siGooglecloud, siOllama, siHuggingface, siKubernetes, siVault, siStripe, siSlack, siOkta, siKeycloak } from "simple-icons";
import { ShieldCheck, Gauge, KeyRound, Network, Cloud, Server, Lock, Boxes, Plane } from "lucide-react";
import { SimpleIcon } from "@/components/icons/SimpleIcon";
import { Container, Eyebrow, H2, Lead, LinkButton, TextLink, Screenshot, CtaBand, GridBackdrop } from "@/components/site/ui";
import { HeroCarousel } from "@/components/site/HeroCarousel";
import { CodeTabs } from "@/components/site/CodeTabs";
import { Pipeline } from "@/components/flow/Pipeline";
import { PRODUCTS, SOLUTIONS } from "@/lib/site";
import { MLOPS_TOPICS } from "@/lib/mlops-site";
import { AGENT_OS_TOPICS } from "@/lib/agent-os-site";
import { USE_CASE_CATALOG } from "@/lib/usecases/catalog";
import { KeyRound as K2, FileSearch, Calculator, Route, Receipt, Wallet, Shrink } from "lucide-react";
import Image from "next/image";
import { FlowScene } from "@/components/site/FlowScene";
import { SCENES } from "@/lib/scenes";
import { IntegrationHub } from "@/components/site/IntegrationHub";
import { IndustryExplorer } from "@/components/site/IndustryExplorer";
import { IndustryArt } from "@/components/site/IndustryArt";

const LOGOS = [siOpenai, siAnthropic, siGooglegemini, siAmazonwebservices, siGooglecloud, siOllama, siHuggingface, siKubernetes, siVault, siStripe, siSlack, siOkta, siKeycloak];

const CODE = [
  {
    label: "Python",
    lang: "python",
    code: `from openai import OpenAI

client = OpenAI(
    base_url="https://api.tokener.io/v1",
    api_key="tok_live_...",
)

resp = client.chat.completions.create(
    model="chat-default",
    messages=[{"role": "user", "content": "Summarize this contract."}],
)
print(resp.choices[0].message.content)`,
  },
  {
    label: "Node.js",
    lang: "javascript",
    code: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.tokener.io/v1",
  apiKey: process.env.TOKENER_API_KEY,
});

const resp = await client.chat.completions.create({
  model: "chat-default",
  messages: [{ role: "user", content: "Summarize this contract." }],
});
console.log(resp.choices[0].message.content);`,
  },
  {
    label: "curl",
    lang: "bash",
    code: `curl https://api.tokener.io/v1/chat/completions \\
  -H "Authorization: Bearer $TOKENER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "chat-default",
    "messages": [{"role": "user", "content": "Hello"}]
  }'`,
  },
];

const DEPLOY = [
  { icon: Cloud, name: "SaaS", body: "Multi-tenant, operated by us." },
  { icon: Server, name: "Dedicated", body: "Your own node pool in our cluster." },
  { icon: Boxes, name: "Private cloud", body: "In your cloud account, managed remotely." },
  { icon: Lock, name: "On-premises", body: "Customer-operated Kubernetes." },
  { icon: Plane, name: "Air-gapped", body: "No outbound connectivity at all." },
];

export default function HomePage() {
  return (
    <>
      <section className="bg-ink-800 relative overflow-hidden">
        <GridBackdrop />
        <Container className="relative pt-16 sm:pt-24 pb-16 grid lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-16 items-center">
          <div>
            <Eyebrow dark>The enterprise AI control plane</Eyebrow>
            <h1 className="text-[2.3rem] sm:text-[3rem] xl:text-[3.4rem] text-balance leading-[1.06] font-semibold tracking-[-0.03em] text-text-inverse">
              One control plane for all your AI.
            </h1>
            <Lead dark>
              Govern the gateway, the models and the agents in one place.
            </Lead>
            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
              <LinkButton href="/signup" arrow>Get started free</LinkButton>
              <LinkButton href="/demo" variant="ghost-dark">Book a demo</LinkButton>
              <DemoLink href="/dashboard" className="text-sm font-semibold text-text-inverse/80 hover:text-text-inverse underline underline-offset-4 decoration-white/25 hover:decoration-accent-500 transition-colors">Try the sample workspace</DemoLink>
            </div>
          </div>
          <HeroCarousel />
        </Container>
      </section>

      {/* Product shot straddles the dark and light backgrounds */}
      <div className="bg-[linear-gradient(to_bottom,#07191E_45%,#ffffff_45%)]">
        <Container>
          <Screenshot src="/screens/dashboard.webp" url="app.tokener.io/dashboard" alt="tok∑ner dashboard showing spend, live tokens, and provider health" priority />
        </Container>
      </div>

      <section className="py-14 border-b border-border">
        <Container>
          <p className="text-center text-xs font-mono uppercase tracking-[0.16em] text-text-tertiary mb-8">Works with the providers and tools you already use</p>
          <div className="flex flex-wrap justify-center gap-x-10 gap-y-6 text-text-tertiary">
            {LOGOS.map((l) => (
              <span key={l.title} className="flex items-center gap-2 text-sm">
                <SimpleIcon icon={l} size={22} />
                <span className="hidden sm:inline">{l.title}</span>
              </span>
            ))}
          </div>
        </Container>
      </section>

      <section className="py-20 sm:py-24 border-b border-border">
        <Container>
          <Eyebrow>Why a control plane</Eyebrow>
          <H2>The same questions, answered in seconds instead of weeks.</H2>
          <div className="mt-12 grid lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-border p-8">
              <h3 className="text-sm font-mono uppercase tracking-[0.14em] text-text-tertiary">Without tok&#8721;ner</h3>
              <ul className="mt-6 flex flex-col gap-4 text-[15px] text-text-secondary">
                {["Provider keys sit in configuration files across dozens of repositories.", "Spend is discovered on the invoice, a month after it happened.", "A provider outage becomes your outage, and the fix is a code change.", "Security asks who used which model with which data, and the answer is a project.", "Every team builds its own retry, logging and limits, and none of them match."].map((x) => (
                  <li key={x} className="flex gap-3"><span className="mt-[9px] h-1 w-3 rounded-full bg-status-down/60 shrink-0" />{x}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-ink-800 p-8">
              <h3 className="text-sm font-mono uppercase tracking-[0.14em] text-accent-500">With tok&#8721;ner</h3>
              <ul className="mt-6 flex flex-col gap-4 text-[15px] text-text-inverse/90">
                {["Keys live in your vault, and applications receive scoped, revocable credentials.", "Budgets warn, throttle and block while the spend is happening.", "Traffic moves to a healthy provider on its own, by configuration.", "The audit trail answers who, what, which rule and when, with a query.", "Policy, limits and metering are one shared layer that every team inherits."].map((x) => (
                  <li key={x} className="flex gap-3"><span className="mt-[9px] h-1 w-3 rounded-full bg-accent-500 shrink-0" />{x}</li>
                ))}
              </ul>
            </div>
          </div>
        </Container>
      </section>

      <section className="py-20 sm:py-28">
        <Container>
          <Eyebrow>The platform</Eyebrow>
          <H2>Control the calls. Run the work.</H2>
          <Lead>One identity, one policy layer and one audit trail across the gateway, your data and models, and your agents. Start with the gateway in an afternoon and add the rest when you need it.</Lead>

          <div className="mt-12 flex items-baseline justify-between gap-4">
            <h3 className="text-sm font-mono uppercase tracking-[0.14em] text-text-tertiary">Gateway and governance</h3>
            <TextLink href="/product">All products</TextLink>
          </div>
          <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border border border-border rounded-xl overflow-hidden">
            {PRODUCTS.map((p) => {
              const Icon = p.icon;
              return (
                <Link key={p.slug} href={`/product/${p.slug}`} className="bg-surface p-7 hover:bg-surface-subtle transition-colors group">
                  <span className="h-10 w-10 rounded-md bg-ink-800 text-accent-500 flex items-center justify-center mb-5">
                    <Icon size={19} strokeWidth={1.75} />
                  </span>
                  <h3 className="text-[17px] font-semibold text-text-primary">{p.name}</h3>
                  <p className="text-sm text-text-secondary mt-2 leading-relaxed">{p.short}</p>
                  <span className="inline-block mt-4 text-sm font-semibold text-ink-800 border-b border-transparent group-hover:border-ink-800">Learn more</span>
                </Link>
              );
            })}
            {/* The grid draws its lines with a 1px gap over a grey background, so a short last row would show grey. This tile fills whatever is left. */}
            <Link href="/product" className={`bg-ink-800 p-7 group flex flex-col justify-between ${PRODUCTS.length % 2 === 0 ? "sm:col-span-2" : ""} ${["lg:col-span-3", "lg:col-span-2", "lg:col-span-1"][PRODUCTS.length % 3 === 0 ? 0 : 3 - (PRODUCTS.length % 3) === 2 ? 1 : 2]}`}>
              <div>
                <h3 className="text-[17px] font-semibold text-white">One policy layer, one audit trail</h3>
                <p className="text-sm text-white/65 mt-2 leading-relaxed max-w-md">Every product above reads the same identity, the same policies and the same budgets, and writes to the same record.</p>
              </div>
              <span className="inline-block mt-6 text-sm font-semibold text-accent-500 group-hover:underline">See every product</span>
            </Link>
          </div>

          <div className="mt-14 flex items-baseline justify-between gap-4">
            <h3 className="text-sm font-mono uppercase tracking-[0.14em] text-text-tertiary">Data, models and tools</h3>
            <TextLink href="/product/mlops">AI infrastructure overview</TextLink>
          </div>
          <div className="mt-4 grid sm:grid-cols-2 xl:grid-cols-4 gap-px bg-border border border-border rounded-xl overflow-hidden">
            {MLOPS_TOPICS.map((t) => {
              const Icon = t.icon;
              return (
                <Link key={t.slug} href={`/product/mlops/${t.slug}`} className="bg-surface p-6 hover:bg-surface-subtle transition-colors group">
                  <span className="h-9 w-9 rounded-md bg-ink-800 text-accent-500 flex items-center justify-center mb-4">
                    <Icon size={17} strokeWidth={1.75} />
                  </span>
                  <h3 className="text-[16px] font-semibold text-text-primary">{t.name}</h3>
                  <p className="text-sm text-text-secondary mt-2 leading-relaxed">{t.short}</p>
                </Link>
              );
            })}
          </div>
        </Container>
      </section>

      <section className="py-20 sm:py-28 bg-ink-800 relative overflow-hidden">
        <GridBackdrop />
        <Container className="relative">
          <div className="grid lg:grid-cols-[0.8fr_1.2fr] gap-12 items-center">
            <div>
              <Eyebrow dark>Agent OS, in preview</Eyebrow>
              <H2 dark>Let agents do the work. Keep people in charge of the decisions.</H2>
              <Lead dark>Register agents from any framework, put each in a network that decides who can reach it, let teams of agents work a use case as a mesh, and keep a person where it counts. Every screen works today against a sample workspace.</Lead>
              <div className="mt-7 flex flex-wrap gap-3">
                <LinkButton href="/product/agent-os" arrow>See Agent OS</LinkButton>
                <LinkButton href="/use-cases/agent-mesh-motor-claims" variant="ghost-dark">Read a claims example</LinkButton>
              </div>
            </div>
            <Screenshot src="/screens/agentos-constellation.webp" url="app.tokener.io/agents/constellation" alt="The Constellation: agents by department, networks as tinted zones, mesh handoffs as arrows and protocols in their own colours" />
          </div>
          <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-white/10 border border-white/10 rounded-xl overflow-hidden">
            {AGENT_OS_TOPICS.filter((t) => ["constellation", "networks", "mesh", "approvals"].includes(t.slug)).map((t) => {
              const Icon = t.icon;
              return (
                <Link key={t.slug} href={`/product/agent-os#${t.slug}`} className="bg-ink-800 p-6 hover:bg-ink-700 transition-colors">
                  <Icon size={20} strokeWidth={1.7} className="text-accent-500" />
                  <h3 className="text-[16px] font-semibold text-text-inverse mt-4">{t.name}</h3>
                  <p className="text-sm text-text-tertiary mt-2 leading-relaxed">{t.short}</p>
                </Link>
              );
            })}
          </div>
        </Container>
      </section>

      <section className="py-20 sm:py-24 bg-surface-subtle border-y border-border">
        <Container>
          <Eyebrow>Request lifecycle</Eyebrow>
          <H2>Eight gates between your app and the model.</H2>
          <Lead>Reject early and cheaply. A request that fails a gate never reaches a provider and never costs a token.</Lead>
          <div className="mt-10">
            <Pipeline
              dense
              animated
              steps={[
                { title: "Authenticate", detail: "API key or service JWT", icon: K2, reject: "401" },
                { title: "Normalize files", detail: "Parse once into a CAD", icon: FileSearch, reject: "415" },
                { title: "Estimate", detail: "Tokens and cost up front", icon: Calculator },
                { title: "Policy", detail: "Allow, deny, rewrite", icon: ShieldCheck, reject: "403" },
                { title: "Budget and quota", detail: "Reserve spend, check rate", icon: Wallet, reject: "429" },
                { title: "Optimize", detail: "Cache, trim, shape", icon: Shrink },
                { title: "Route", detail: "Pick provider, fail over", icon: Route },
                { title: "Meter and bill", detail: "Event stream, ledger", icon: Receipt, tone: "accent" },
              ]}
            />
          </div>
          <div className="mt-12"><FlowScene id="gateway" /></div>
        </Container>
      </section>

      {[
        { p: PRODUCTS[1], flip: false },
        { p: PRODUCTS[2], flip: true },
        { p: PRODUCTS[3], flip: false },
        { p: PRODUCTS[4], flip: true },
      ].map(({ p, flip }, i) => (
        <section key={p.slug} className={i % 2 === 0 ? "py-20 sm:py-24" : "py-20 sm:py-24 bg-surface-subtle border-y border-border"}>
          <Container className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div className={flip ? "lg:order-2" : ""}>
              <Eyebrow>{p.name}</Eyebrow>
              <H2 className="text-[1.7rem] sm:text-[2.1rem]">{p.headline}</H2>
              <Lead>{p.body}</Lead>
              <ul className="mt-6 flex flex-col gap-2.5">
                {p.bullets.slice(0, 3).map((b) => (
                  <li key={b} className="flex items-start gap-2.5 text-sm text-text-primary">
                    <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-accent-600 shrink-0" />
                    {b}
                  </li>
                ))}
              </ul>
              <div className="mt-7"><TextLink href={`/product/${p.slug}`}>Explore {p.name}</TextLink></div>
            </div>
            <div className={flip ? "lg:order-1" : ""}>
              <Screenshot src={p.shot} url={p.shotUrl} alt={`${p.name} in the tok∑ner console`} />
            </div>
          </Container>
        </section>
      ))}

      <section className="py-20 sm:py-24 bg-surface-subtle border-y border-border">
        <Container>
          <Eyebrow>In practice</Eyebrow>
          <H2>One control plane, drawn for six kinds of work.</H2>
          <Lead>A wind farm, a bank, a hospital, a factory floor, a delivery route and a mast all send requests through the same gates. The picture changes, the controls do not.</Lead>
          <div className="mt-12 grid md:grid-cols-2 xl:grid-cols-3 gap-6">
            {[
              ["energy", "Energy and utilities", "energy"],
              ["banking", "Banking", "banking"],
              ["healthcare", "Healthcare", "healthcare"],
              ["manufacturing", "Manufacturing", "manufacturing"],
              ["logistics", "Logistics", "logistics"],
              ["telecom", "Telecommunications", "telecom"],
            ].map(([k, n, slug]) => (
              <div key={k}>
                <IndustryArt kind={k} />
                <Link href={`/solutions/${slug}`} className="mt-3 inline-block text-sm font-semibold text-ink-800 border-b border-transparent hover:border-ink-800">{n}</Link>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="py-20 sm:py-28 bg-ink-800 relative overflow-hidden">
        <GridBackdrop />
        <Container className="relative grid lg:grid-cols-[0.9fr_1.1fr] gap-12 items-center">
          <div>
            <Eyebrow dark>For developers</Eyebrow>
            <H2 dark>Change one line. Keep your client.</H2>
            <Lead dark>
              The gateway speaks the OpenAI wire format. Point your existing client at tok&#8721;ner, and every call picks up policy,
              budgets, routing, and metering. Typed SDKs cover Java, Python, Go, Node.js, Rust, and .NET.
            </Lead>
            <div className="mt-7 flex flex-wrap gap-3">
              <LinkButton href="/developers/quickstart" arrow>Quickstart</LinkButton>
              <LinkButton href="/developers/api" variant="ghost-dark">API reference</LinkButton>
            </div>
          </div>
          <CodeTabs tabs={CODE} />
        </Container>
      </section>

      <section className="py-20 sm:py-28">
        <Container>
          <Eyebrow>AI infrastructure</Eyebrow>
          <H2>Govern the models you host, not only the ones you call.</H2>
          <Lead>Connect clusters and servers, build pipelines from source to endpoint, gate production with approvals, and roll back automatically when an SLO breaks. Access, secrets and audit work the same way they do for the gateway.</Lead>
          <div className="mt-12"><FlowScene id="mlops" /></div>
          <div className="mt-10 grid md:grid-cols-2 xl:grid-cols-4 gap-5">
            {[
              { t: "Pipelines you can read", b: "Build visually or fill in a guided form. Both edit the same versioned spec, so a diff always means the same thing." },
              { t: "Agents that call out, never in", b: "Run deployments on servers behind your firewall. Jobs are signed, secrets are scoped to a single run, and every result is scrubbed." },
              { t: "Your own models, as tools", b: "Host a model on your GPUs or connect one you run, put it behind the gateway, and offer it to chosen agents as an MCP tool. The AI canvas draws the path, with who may call it." },
              { t: "Production with a gate", b: "Policy checks, approvals and canary rollouts sit in front of every production change, and the audit trail records who decided." },
            ].map((c) => (
              <div key={c.t} className="rounded-xl border border-border p-6">
                <h3 className="font-semibold text-text-primary">{c.t}</h3>
                <p className="text-sm text-text-secondary mt-2 leading-relaxed">{c.b}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2"><TextLink href="/product/mlops">MLOps and AI infrastructure</TextLink><TextLink href="/developers/tutorials">Tutorials</TextLink></div>
        </Container>
      </section>

      <section className="bg-ink-800 py-20 sm:py-28 border-y border-white/10">
        <Container>
          <Eyebrow dark>Connectors</Eyebrow>
          <H2 dark>One endpoint in front. Every model, system and team around it.</H2>
          <Lead dark className="mt-4 max-w-2xl">Applications keep their OpenAI-compatible client. tok&#8721;ner handles identity, policy, budgets and routing, then connects the providers, identity systems, observability tools and clusters you already run.</Lead>
          <div className="mt-12"><IntegrationHub /></div>
          <div className="mt-8"><TextLink href="/connectors" dark>Browse all connectors</TextLink></div>
        </Container>
      </section>

      <section className="py-20 sm:py-28">
        <Container>
          <Eyebrow>Industries</Eyebrow>
          <H2>The same control plane, shaped by how your industry works.</H2>
          <Lead className="mt-4 max-w-2xl">See which workloads, controls, models and systems come together in banking, insurance, healthcare, retail, manufacturing, logistics, energy, telecommunications, the public sector, education and legal work.</Lead>
          <div className="mt-12"><IndustryExplorer /></div>
          <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3">
            <TextLink href="/solutions">All solutions</TextLink>
            <TextLink href="/use-cases">{USE_CASE_CATALOG.length} use cases with animated diagrams</TextLink>
            <TextLink href="/use-cases/rag-reference-architecture">Build a RAG system</TextLink>
          </div>
        </Container>
      </section>

      <section className="py-20 sm:py-24 bg-surface-subtle border-y border-border">
        <Container className="grid lg:grid-cols-[1fr_auto] gap-12 items-center">
          <div>
            <Eyebrow>Responsive by design</Eyebrow>
            <H2>The console follows you to any screen.</H2>
            <Lead>The navigation collapses into categories on login, becomes an icon rail on tablets, and opens as a drawer on phones, so on-call checks do not need a laptop.</Lead>
            <div className="mt-6"><ConsoleLink href="/dashboard" variant="ink" arrow signedOut="Sign in to open the console">Open the console</ConsoleLink></div>
          </div>
          <div className="flex gap-5 justify-center">
            <Image src="/screens/mobile-dashboard.webp" alt="Dashboard on a phone" width={780} height={1688} unoptimized className="w-[170px] sm:w-[200px] h-auto rounded-2xl border border-border-strong shadow-popover" />
            <Image src="/screens/mobile-menu.webp" alt="Navigation drawer on a phone" width={780} height={1688} unoptimized className="w-[170px] sm:w-[200px] h-auto rounded-2xl border border-border-strong shadow-popover mt-8" />
          </div>
        </Container>
      </section>

      <section className="py-20 sm:py-28">
        <Container>
          <Eyebrow>Deploy anywhere</Eyebrow>
          <H2>Run it our way or yours.</H2>
          <div className="mt-10 grid grid-cols-2 md:grid-cols-5 gap-4">
            {DEPLOY.map((d) => {
              const Icon = d.icon;
              return (
                <div key={d.name} className="rounded-lg border border-border p-5">
                  <Icon size={20} strokeWidth={1.6} className="text-ink-500 mb-3" />
                  <div className="text-sm font-semibold text-text-primary">{d.name}</div>
                  <div className="text-xs text-text-secondary mt-1 leading-snug">{d.body}</div>
                </div>
              );
            })}
          </div>
        </Container>
      </section>

      <section className="pb-20 sm:pb-28">
        <Container>
          <div className="rounded-2xl bg-ink-800 p-8 sm:p-12 grid md:grid-cols-3 gap-8 text-text-inverse">
            {[
              [ShieldCheck, "Isolation in three layers", "Application filtering, row-level security, and tenant-keyed event partitions."],
              [KeyRound, "Secrets stay in Vault", "Provider keys and database credentials never land in images, config maps, or logs."],
              [Gauge, "Immutable audit", "The API role cannot update or delete audit rows. Mutation is impossible, not just forbidden."],
            ].map(([I, t, b]) => {
              const Icon = I as typeof Network;
              return (
                <div key={t as string}>
                  <Icon size={22} strokeWidth={1.6} className="text-accent-500 mb-4" />
                  <h3 className="font-semibold">{t as string}</h3>
                  <p className="text-sm text-text-tertiary mt-2 leading-relaxed">{b as string}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-6"><TextLink href="/security">Security and trust</TextLink></div>
        </Container>
      </section>

      <CtaBand />
    </>
  );
}
