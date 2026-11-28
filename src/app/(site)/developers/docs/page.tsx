import Link from "next/link";
import { Container, Eyebrow, H2, TextLink } from "@/components/site/ui";
import { MLOPS_TOPICS } from "@/lib/mlops-site";
import { PRODUCTS, SOLUTIONS } from "@/lib/site";
import { INDUSTRY_CONTENT } from "@/lib/industry-content";
import { INDUSTRY_LABELS, INDUSTRY_ORDER } from "@/lib/usecases/labels";
import { USE_CASES, bySlug, forIndustry } from "@/lib/usecases";

export const metadata = {
  title: "Platform documentation | tok∑ner",
  description: "Concepts, product guides, use case patterns and industry examples for the tok∑ner control plane.",
};

const CONCEPTS: [string, string][] = [
  ["Organization and tenants", "An organization contains tenants, such as prod and staging. Tenants contain departments, projects, and applications. Policies and budgets inherit down this tree and can only be tightened below."],
  ["Applications and keys", "Each application authenticates with its own key, stored only as a hash. Service accounts use short-lived JWTs from your identity provider."],
  ["Model aliases", "Applications request an alias like chat-default. The registry maps it to ordered provider and model targets, so a model change is a configuration change."],
  ["Policies", "Versioned documents evaluated on every request. Deny overrides allow, and every decision is recorded with the rule that made it."],
  ["Budgets and quotas", "Budgets cap tokens or cost per period and act as a ladder: warn, throttle, block. Quotas cap rate and volume. Both are enforced before the provider call."],
  ["Canonical AI Documents", "Files are scanned, extracted, redacted, and priced once, then reused by content hash."],
  ["The ledger", "Every request produces an immutable accounting event that feeds cost, budgets, billing, and analytics."],
  ["Pipelines", "A pipeline is a versioned specification of typed operators. You can author it on a canvas or in a wizard. A published version is immutable, and a run executes a snapshot of it."],
  ["Connections and secret references", "A connection links the platform to a cluster, a registry, a store or a provider. It holds a reference to a secret in your secret manager, never the secret itself."],
  ["RAG indexes", "Sources are scanned, split, embedded and written to your vector store. Assistants query them through the gateway and receive cited passages limited to what the caller may read."],
  ["The model library", "Operators publish reviewed models. Teams import them into their own registry, and uploaded files are checksummed, inspected and scanned for code that runs on load."],
  ["Build agents and MCP servers", "A build agent runs signed jobs next to your systems and connects out only. MCP servers give agents tools, with approved tools only, pinned definitions and approval for writes."],
];

const GUIDES: [string, string, string][] = [
  ["Make your first request", "Quickstart", "/developers/quickstart"],
  ["Create a token and cost budget", "Console: Governance, Budget Management", "/budgets"],
  ["Configure document policies", "Console: Governance, Document Policies", "/document-policies"],
  ["Build a RAG index and test it", "Use case: test a RAG index before launch", "/use-cases/knowledge-evaluation-before-launch"],
  ["Upload a model and get it approved", "Use case: vendor model onboarding", "/use-cases/banking-vendor-model-onboarding"],
  ["Connect a Kubernetes cluster securely", "Tutorial", "/developers/tutorials/secure-kubernetes-connection"],
  ["Register a model and deploy an endpoint", "Tutorial", "/developers/tutorials/register-model-deploy-endpoint"],
  ["Connect an MCP server and build a tool-using agent", "Tutorial", "/developers/tutorials/mcp-tool-agent"],
  ["Build an agent that collects a payment", "Tutorial", "/developers/tutorials/payment-link-agent"],
  ["Understand a blocked request", "Errors", "/developers/errors"],
  ["Call the control plane API", "API reference", "/developers/api"],
];

const PATTERNS: [string, string][] = [
  ["Retrieval", "Documents become an index that assistants query with citations. Includes permission aware retrieval and keeping an index fresh."],
  ["Approval", "A person decides before anything irreversible happens: a payment, a message, a deployment, a model going to production."],
  ["Documents", "Files are scanned, read, masked and reused, with limits applied before any model is called."],
  ["Governance", "Tenant inheritance, two person approval and an audit trail that stands up to an examiner."],
  ["MCP", "Agents call tools through approved, pinned and rate limited MCP servers."],
  ["Self-hosted", "Models and data stay in your network, with routing that pins sensitive traffic."],
  ["Budgets", "Spend is visible and limited as it happens, with chargeback by team."],
  ["Scheduling", "Agents that run on a schedule, keep business hours and wait for a person."],
];

export default function DocsPage() {
  const patterns = PATTERNS.map(([tag, blurb]) => ({ tag, blurb, items: USE_CASES.filter((u) => u.tags.includes(tag)) }));
  const industries = INDUSTRY_ORDER.map((slug) => {
    const list = forIndustry(slug);
    const flagship = bySlug(INDUSTRY_CONTENT[slug]?.flagship ?? "") ?? list[0];
    const sol = SOLUTIONS.find((s) => s.slug === slug);
    return { slug, label: INDUSTRY_LABELS[slug], list, flagship, short: sol?.short };
  }).filter((i) => i.list.length > 0);

  return (
    <Container className="py-14 sm:py-20 max-w-[1040px]">
      <Eyebrow>Documentation</Eyebrow>
      <H2>Understand the platform, then see it applied.</H2>
      <p className="text-text-secondary mt-3 max-w-2xl leading-relaxed">Concepts first, then a guide for every product area, the patterns that recur across use cases, and worked examples for {industries.length} industries. The engineering reference for the repository lives in the docs folder next to the code.</p>
      <nav aria-label="On this page" className="mt-6 flex flex-wrap gap-2 text-sm">
        {[["Concepts", "#concepts"], ["Product guides", "#products"], ["How-to guides", "#guides"], ["Use case patterns", "#patterns"], ["Industry examples", "#industries"]].map(([l, h]) => (
          <a key={h} href={h} className="h-8 px-3 rounded-full border border-border-strong inline-flex items-center text-text-secondary hover:text-text-primary hover:bg-surface-subtle">{l}</a>
        ))}
      </nav>

      <section id="concepts" className="mt-16 scroll-mt-28">
        <h3 className="text-lg font-semibold text-text-primary">Concepts you will meet in the first hour</h3>
        <dl className="mt-6 grid md:grid-cols-2 gap-x-10 gap-y-7">
          {CONCEPTS.map(([t, b]) => (
            <div key={t}>
              <dt className="font-semibold text-text-primary">{t}</dt>
              <dd className="text-sm text-text-secondary mt-1.5 leading-relaxed">{b}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="products" className="mt-16 scroll-mt-28">
        <h3 className="text-lg font-semibold text-text-primary">Product guides</h3>
        <p className="text-sm text-text-secondary mt-1.5 max-w-2xl">Each product page explains what the feature does and shows it working in an animated diagram.</p>
        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PRODUCTS.map((p) => (
            <Link key={p.slug} href={`/product/${p.slug}`} className="rounded-xl border border-border p-5 hover:border-border-strong hover:shadow-card transition-all">
              <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-text-tertiary">Gateway and governance</div>
              <h4 className="font-semibold text-text-primary mt-1.5">{p.name}</h4>
              <p className="text-sm text-text-secondary mt-1.5 leading-relaxed">{p.short}</p>
            </Link>
          ))}
          {MLOPS_TOPICS.map((t) => (
            <Link key={t.slug} href={`/product/mlops/${t.slug}`} className="rounded-xl border border-border p-5 hover:border-border-strong hover:shadow-card transition-all">
              <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-text-tertiary">AI infrastructure</div>
              <h4 className="font-semibold text-text-primary mt-1.5">{t.name}</h4>
              <p className="text-sm text-text-secondary mt-1.5 leading-relaxed">{t.short}</p>
            </Link>
          ))}
        </div>
      </section>

      <section id="guides" className="mt-16 scroll-mt-28">
        <h3 className="text-lg font-semibold text-text-primary mb-4">How-to guides</h3>
        <div className="rounded-xl border border-border divide-y divide-border">
          {GUIDES.map(([t, w, h]) => (
            <Link key={t} href={h} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-surface-subtle transition-colors">
              <span className="text-sm font-medium text-text-primary">{t}</span>
              <span className="text-xs text-text-tertiary text-right">{w}</span>
            </Link>
          ))}
        </div>
        <div className="mt-4"><TextLink href="/developers/tutorials">All tutorials</TextLink></div>
      </section>

      <section id="patterns" className="mt-16 scroll-mt-28">
        <h3 className="text-lg font-semibold text-text-primary">Use case patterns</h3>
        <p className="text-sm text-text-secondary mt-1.5 max-w-2xl">The same few patterns recur in every industry. Start from the pattern you need and read how others applied it.</p>
        <div className="mt-6 grid md:grid-cols-2 gap-5">
          {patterns.map((p) => (
            <div key={p.tag} className="rounded-xl border border-border p-5">
              <div className="flex items-baseline justify-between gap-3"><h4 className="font-semibold text-text-primary">{p.tag}</h4><span className="text-xs text-text-tertiary">{p.items.length} use cases</span></div>
              <p className="text-sm text-text-secondary mt-1.5 leading-relaxed">{p.blurb}</p>
              <ul className="mt-3 space-y-1.5">
                {p.items.slice(0, 4).map((u) => (
                  <li key={u.slug}><Link href={`/use-cases/${u.slug}`} className="text-[13px] text-text-primary hover:text-accent-700 hover:underline underline-offset-2">{u.title}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section id="industries" className="mt-16 scroll-mt-28">
        <h3 className="text-lg font-semibold text-text-primary">Industry examples</h3>
        <p className="text-sm text-text-secondary mt-1.5 max-w-2xl">One worked example for each industry, with the full set behind the link. Each use case has the problem, the pipeline, the controls and an animated walk through a run.</p>
        <div className="mt-6 space-y-5">
          {industries.map((i) => (
            <article key={i.slug} id={`industry-${i.slug}`} className="rounded-xl border border-border p-6 scroll-mt-28">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h4 className="text-base font-semibold text-text-primary">{i.label}</h4>
                <span className="text-xs text-text-tertiary">{i.list.length} use cases</span>
              </div>
              {i.short && <p className="text-sm text-text-secondary mt-1.5">{i.short}</p>}
              {i.flagship && (
                <div className="mt-4 rounded-lg bg-surface-subtle border border-border p-4">
                  <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-text-tertiary">Worked example</div>
                  <Link href={`/use-cases/${i.flagship.slug}`} className="block font-semibold text-text-primary mt-1.5 hover:underline underline-offset-2">{i.flagship.title}</Link>
                  <p className="text-sm text-text-secondary mt-2 leading-relaxed">{i.flagship.example}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">{i.flagship.systems.map((s) => <span key={s} className="text-[11px] px-2 py-0.5 rounded-full border border-border-strong text-text-secondary">{s}</span>)}</div>
                </div>
              )}
              <ul className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
                {i.list.filter((u) => u.slug !== i.flagship?.slug).map((u) => (
                  <li key={u.slug}><Link href={`/use-cases/${u.slug}`} className="text-[13px] text-text-secondary hover:text-text-primary hover:underline underline-offset-2">{u.title}</Link></li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {SOLUTIONS.some((s) => s.slug === i.slug) && <TextLink href={`/solutions/${i.slug}`}>{i.label} overview</TextLink>}
                <TextLink href={`/use-cases?industry=${i.slug}`}>All {i.label.toLowerCase()} use cases</TextLink>
              </div>
            </article>
          ))}
        </div>
      </section>
    </Container>
  );
}
