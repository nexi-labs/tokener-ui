import {
  Network, Boxes, ShieldCheck, Wallet, FileText, LineChart, Server,
  Landmark, Rocket, Shrink, Building2, HeartPulse, Scale, ShoppingBag, ShieldPlus, Factory, Truck, Zap, RadioTower, GraduationCap, Gavel, ScanSearch, Layers, Orbit,
  type LucideIcon,
} from "lucide-react";
import { RefineryGlyph } from "@/components/refinery/RefineryIcon";
import { USE_CASE_CATALOG } from "@/lib/usecases/catalog";
import { INDUSTRY_LABELS, INDUSTRY_ORDER } from "@/lib/usecases/labels";

export type Product = {
  slug: string;
  name: string;
  short: string;
  headline: string;
  body: string;
  icon: LucideIcon;
  shot: string;
  shotUrl: string;
  highlights: { title: string; body: string }[];
  bullets: string[];
};

export const PRODUCTS: Product[] = [
  {
    slug: "gateway",
    name: "AI Gateway",
    short: "One OpenAI-compatible endpoint in front of every model.",
    headline: "One endpoint. Every model. Every request accounted for.",
    body: "Applications call tok∑ner exactly as they would call a provider. The gateway authenticates, checks policy and budget, routes to the right provider, and records usage before the response returns.",
    icon: Network,
    shot: "/screens/studio-pipeline.webp",
    shotUrl: "app.tokener.io/pipeline-studio",
    highlights: [
      { title: "Drop-in compatible", body: "Chat, responses, embeddings, images, speech, and transcription endpoints. Change the base URL and keep your client." },
      { title: "Streaming and realtime", body: "Server-sent events for chat streams and WebSocket for voice and realtime traffic, metered as they flow." },
      { title: "Fail-mode control", body: "Choose per tenant whether the gateway fails open or fails closed if a dependency is unreachable." },
    ],
    bullets: ["Under 15ms p99 gateway overhead", "API keys hashed at rest, never logged", "Service accounts with short-lived JWTs", "Typed errors with Retry-After headers"],
  },
  {
    slug: "policy-engine",
    name: "Policy Engine",
    short: "Governance written as versioned policy, enforced on every request.",
    headline: "Decide what AI may do before a token is spent.",
    body: "Write rules in a readable policy language. Allow or deny models, pin regions, set time windows, cap tokens per request, and simulate any change against real traffic before it goes live.",
    icon: ShieldCheck,
    shot: "/screens/studio-policy.webp",
    shotUrl: "app.tokener.io/policy-studio",
    highlights: [
      { title: "Deny overrides", body: "The first deny wins and the reason is recorded, so every refusal can be explained to an auditor." },
      { title: "Inheritance", body: "Set a rule once at the organization and let tenants, projects, and applications inherit or tighten it." },
      { title: "Simulate first", body: "Replay a draft policy against recent requests to see what it would have blocked." },
    ],
    bullets: ["Under 2ms p99 evaluation", "Model, region, and capability rules", "Data residency constraints", "Every change versioned and audited"],
  },
  {
    slug: "cost-and-budgets",
    name: "Cost and Budgets",
    short: "Token and cost budgets that warn, throttle, then block.",
    headline: "Know what AI costs while it is happening.",
    body: "Immutable token accounting feeds a cost engine that understands provider pricing, currency, and contract terms. Budgets sit at every level and act before the overrun, not after the invoice.",
    icon: Wallet,
    shot: "/screens/budget-new.webp",
    shotUrl: "app.tokener.io/budgets/new",
    highlights: [
      { title: "Token or cost ceilings", body: "Cap spend in dollars, cap volume in tokens, or cap both and let whichever trips first enforce." },
      { title: "A ladder, not a cliff", body: "Warn the owners at one threshold, throttle at the next, and block at the limit." },
      { title: "Every level", body: "Organization, tenant, department, project, application, and user budgets share one model." },
    ],
    bullets: ["Real-time burn rate and exhaustion forecast", "Chargeback by team and project", "Quotas separate from budgets", "Stripe-backed invoicing"],
  },
  {
    slug: "cost-optimization",
    name: "Cost Optimization",
    short: "Every prompt and document converted to the fewest tokens before it reaches a model.",
    headline: "Pay for the tokens that carry meaning.",
    body: "Files and prompts are not written for a tokenizer. A PDF repeats its header on every page, a web page is mostly navigation, a table spends tokens on separators and a contract repeats its own defined terms. tok∑ner reads each input into its real structure, removes what carries nothing, writes what is left in the form that costs the fewest tokens for the model you are calling, and checks that every number, identifier and link survived. Every change is recorded.",
    icon: Shrink,
    shot: "/screens/cost-optimization.webp",
    shotUrl: "app.tokener.io/optimization",
    highlights: [
      { title: "Measured, not guessed", body: "Each table is written in several forms and counted with the target model's own tokenizer. The cheapest form that reads back exactly is the one sent. The same table can be cheaper as CSV for one model and as Markdown for another." },
      { title: "Lossless first, guarded beyond", body: "The lossless level only reads structure, rejoins broken lines and removes exact repeats. Removing page furniture and fitting to a question are separate steps an application opts into, and any number or identifier they cut is listed on the request." },
      { title: "Checked on every request", body: "After conversion, every number, identifier, address and link in the input is looked for in the output. If one is missing without a reason, the original is sent unchanged. A sample is also replayed and compared, and the lossy steps turn themselves off if quality falls below your floor." },
    ],
    bullets: ["Mandatory conversion on the gateway and the document worker", "Converted documents stored once and reused", "A token count and a diff for every request", "Savings measured from provider usage, never estimated"],
  },
  {
    slug: "documents",
    name: "Document Processing",
    short: "Every file scanned, extracted, redacted, and priced before a model sees it.",
    headline: "Files become clean, cached, policy-checked documents.",
    body: "Upload PDFs, Office files, images, audio, and archives. tok∑ner turns each one into a Canonical AI Document once, then reuses it for every provider and every prompt.",
    icon: FileText,
    shot: "/screens/document-policies.webp",
    shotUrl: "app.tokener.io/document-policies",
    highlights: [
      { title: "Scan, extract, redact", body: "Malware scanning, text extraction, OCR for scans, and PII masking run before storage." },
      { title: "Priced before the call", body: "Token and cost estimates come from the processed document, so budgets can refuse oversized files up front." },
      { title: "Process once", body: "Identical files are matched by SHA-256 and skip extraction on later requests." },
    ],
    bullets: ["Documents, sheets, slides, text, images, audio, video, archives", "Per-policy size, page, and token limits", "Configurable retention", "Embeddings for retrieval"],
  },
  {
    slug: "observability",
    name: "Observability and Audit",
    short: "Spend, usage, latency, and an immutable audit trail in one place.",
    headline: "Answer who spent what, on which model, under which policy.",
    body: "Analytics Explorer and Usage Explorer turn the accounting stream into answers. The audit trail records every administrative change and cannot be edited or deleted through the application.",
    icon: LineChart,
    shot: "/screens/analytics.webp",
    shotUrl: "app.tokener.io/analytics",
    highlights: [
      { title: "Analytics Explorer", body: "Slice cost and tokens by tenant, project, model, provider, and time with ClickHouse speed." },
      { title: "Append-only audit", body: "Actor, action, before and after state, and request context for every change." },
      { title: "Alerts that reach people", body: "Slack, Teams, Discord, email, and webhook channels bound to rules." },
    ],
    bullets: ["13 months of analytics retention", "Seven years of audit retention by default", "Exportable evidence packages", "Forecasting and anomaly detection"],
  },
  {
    slug: "provider-registry",
    name: "Provider Registry",
    short: "Connect, route, and fail over across providers without code changes.",
    headline: "Switch providers by configuration, not by rewrite.",
    body: "Register the models you already pay for with your own API keys or cloud credentials: OpenAI, Anthropic, Gemini, Azure OpenAI, Bedrock, Vertex, Mistral, or anything OpenAI-compatible. Test the credential, send a prompt through the gateway, and only a reference is stored. Chat subscriptions such as Claude Pro or ChatGPT Plus do not include API access, so they cannot be registered. Health-aware routing and failover keep requests flowing when a provider degrades.",
    icon: Server,
    shot: "/screens/providers.webp",
    shotUrl: "app.tokener.io/providers",
    highlights: [
      { title: "Health-aware routing", body: "Circuit breakers skip a degraded provider and probe it back to health automatically." },
      { title: "Regional constraints", body: "Keep EU tenants on EU endpoints and sensitive workloads on self-hosted models." },
      { title: "Credentials in Vault", body: "Provider keys live in your secrets store, never in the database or in logs." },
    ],
    bullets: ["12+ providers", "Model aliases decouple apps from model names", "Self-hosted via Ollama, vLLM, and LM Studio", "Test the credential and send a prompt before you save"],
  },
];

export type Solution = {
  slug: string;
  name: string;
  short: string;
  headline: string;
  body: string;
  icon: LucideIcon;
  shot: string;
  shotUrl: string;
  challenges: string[];
  outcomes: { title: string; body: string }[];
  uses: string[];
};

export const SOLUTIONS: Solution[] = [
  {
    slug: "banking",
    name: "Banks and Financial Services",
    short: "Examiner-ready controls for AI in regulated environments.",
    headline: "Put AI into production without putting the audit at risk.",
    body: "Regulated institutions need to show who used which model, with what data, under which rule. tok∑ner makes that answer a query instead of a project.",
    icon: Landmark,
    shot: "/screens/audit.webp",
    shotUrl: "app.tokener.io/audit",
    challenges: ["Model risk teams need an inventory of every model in use", "Customer data must not leave approved regions", "Finance needs chargeback by line of business"],
    outcomes: [
      { title: "Region and model allow-lists", body: "Pin workloads to approved providers and regions and refuse everything else." },
      { title: "PII masked before storage", body: "Documents are redacted during processing, not after an incident." },
      { title: "Evidence on demand", body: "Append-only audit with before and after state for every change." },
    ],
    uses: ["Contract and KYC document review", "Advisor copilots with spend limits", "Fraud analyst assistants on self-hosted models"],
  },
  {
    slug: "startups",
    name: "Startups and Scale-ups",
    short: "Stop surprise invoices and keep shipping.",
    headline: "Give every team AI access and keep the bill predictable.",
    body: "One API key per app, one budget per project, and one dashboard that shows where the money went. Change models without a deploy.",
    icon: Rocket,
    shot: "/screens/budgets.webp",
    shotUrl: "app.tokener.io/budgets",
    challenges: ["A single runaway loop can burn a month of budget overnight", "Provider keys are scattered across repos", "Switching models means touching every service"],
    outcomes: [
      { title: "Budgets that stop runaways", body: "Daily project budgets throttle or block before the spike becomes an invoice." },
      { title: "Keys in one place", body: "Applications get tok∑ner keys, and provider credentials stay in the vault." },
      { title: "Model aliases", body: "Point chat-default at a new model from the console and every service follows." },
    ],
    uses: ["Product features built on LLMs", "Internal assistants per team", "Evaluation runs with hard spend caps"],
  },
  {
    slug: "enterprise",
    name: "Large Enterprises",
    short: "A shared platform for hundreds of teams.",
    headline: "Run AI as a platform, not as a hundred separate contracts.",
    body: "Central teams set guardrails once. Business units get their own tenants, budgets, and keys inside them, with chargeback built in.",
    icon: Building2,
    shot: "/screens/tenants.webp",
    shotUrl: "app.tokener.io/tenants",
    challenges: ["Dozens of teams, many providers, no shared view", "Procurement wants one commit, finance wants many invoices", "Security needs one place to enforce rules"],
    outcomes: [
      { title: "Tenants and inheritance", body: "Organization policy flows down and teams can only tighten it." },
      { title: "Reserved capacity terms", body: "Model enterprise contract pricing so cost reports match the invoice." },
      { title: "Sign-in and roles", body: "Sign in with Google, GitHub, or email and password, with role and attribute based access." },
    ],
    uses: ["Internal developer platforms", "Shared AI services for business units", "Centralized provider contracts"],
  },
  {
    slug: "healthcare",
    name: "Healthcare and Life Sciences",
    short: "Keep patient data inside the lines.",
    headline: "Use AI on clinical documents without losing control of the data.",
    body: "Scan, extract, and mask documents before any provider sees them, route sensitive work to models you host, and keep a record of every access.",
    icon: HeartPulse,
    shot: "/screens/document-policies.webp",
    shotUrl: "app.tokener.io/document-policies",
    challenges: ["Scanned records need OCR before they are useful", "Protected data must be masked or blocked", "Some workloads cannot leave the network"],
    outcomes: [
      { title: "OCR and redaction", body: "Scanned pages are read and masked during document processing." },
      { title: "Self-hosted routing", body: "Send sensitive requests to vLLM or Ollama inside your environment." },
      { title: "Air-gapped option", body: "Run the whole platform with no outbound connectivity." },
    ],
    uses: ["Clinical note summarization", "Prior authorization packet review", "Research literature assistants"],
  },
  {
    slug: "public-sector",
    name: "Public Sector",
    short: "Sovereign deployment with full accountability.",
    headline: "Accountable AI for services that serve the public.",
    body: "Deploy on-premises or in a sovereign cloud, keep data in jurisdiction, and give oversight bodies the records they ask for.",
    icon: Scale,
    shot: "/screens/policies.webp",
    shotUrl: "app.tokener.io/policies",
    challenges: ["Data residency is non-negotiable", "Procurement cycles reward open, portable stacks", "Oversight needs a clear record of automated decisions"],
    outcomes: [
      { title: "On-premises Kubernetes", body: "Helm charts and runbooks for customer-operated clusters." },
      { title: "Portable by design", body: "Open APIs, standard providers, and no lock-in on the data plane." },
      { title: "Governance workflows", body: "Approval chains for policy changes above a risk threshold." },
    ],
    uses: ["Citizen service assistants", "Case file summarization", "Multilingual document translation"],
  },
  {
    slug: "retail",
    name: "Retail and E-commerce",
    short: "Hold the line on cost and latency through every peak.",
    headline: "Serve a holiday spike without a surprise bill or an outage.",
    body: "Shopping assistants, catalogue enrichment and support automation all hit model APIs in bursts. tok∑ner absorbs the burst with rate limits, budgets per campaign and automatic failover.",
    icon: ShoppingBag,
    shot: "/screens/budgets.webp",
    shotUrl: "app.tokener.io/budgets",
    challenges: ["Traffic spikes during campaigns and holidays", "One provider incident should not take down the storefront assistant", "Marketing and engineering need separate spend limits"],
    outcomes: [
      { title: "Budgets per campaign", body: "Warn, throttle and block at the project or key level before the invoice arrives." },
      { title: "Failover during peaks", body: "Health-aware routing moves traffic to a secondary provider without a deploy." },
      { title: "Catalogue enrichment at scale", body: "Process product documents and images once and reuse the result everywhere." },
    ],
    uses: ["Shopping and gift assistants", "Product description generation", "Support triage and returns automation"],
  },
  {
    slug: "insurance",
    name: "Insurance",
    short: "Process claims and policies with a decision record for every step.",
    headline: "Faster claims, with an answer for every decision.",
    body: "Claims, underwriting and servicing teams work through long documents and regulated decisions. tok∑ner turns each document into reusable canonical content and records which model and rule touched it.",
    icon: ShieldPlus,
    shot: "/screens/document-policies.webp",
    shotUrl: "app.tokener.io/document-policies",
    challenges: ["Claim files mix scans, photos, email and forms", "Personal and health data must be masked before it is stored", "Regulators ask how automated decisions were reached"],
    outcomes: [
      { title: "Process each document once", body: "A canonical AI document is reused across prompts, providers and review steps." },
      { title: "Masking by policy", body: "Personal data is redacted during processing, with the rule recorded." },
      { title: "Decision logging", body: "Every automated step is tied to a model, a policy version and a reviewer." },
    ],
    uses: ["First notice of loss intake", "Underwriting file summaries", "Fraud analyst assistants"],
  },
  {
    slug: "manufacturing",
    name: "Manufacturing",
    short: "Run inference at the plant, govern it from one place.",
    headline: "Bring models to the factory floor without losing central control.",
    body: "Plants and field sites need low latency, local data and limited connectivity. Build agents deploy inference next to the data while policy, budgets and audit stay central.",
    icon: Factory,
    shot: "/screens/mlops-agents.webp",
    shotUrl: "app.tokener.io/mlops/agents",
    challenges: ["Data cannot leave the plant network", "GPU capacity is scarce and unevenly spread", "Sites go offline and must keep working"],
    outcomes: [
      { title: "Agents inside the plant", body: "Outbound-only build agents deploy and observe models on servers you own." },
      { title: "GPU-aware placement", body: "Requests and limits are declared in the pipeline and checked before deploy." },
      { title: "Central governance", body: "One audit trail and one policy set across every site." },
    ],
    uses: ["Predictive maintenance assistants", "Technician copilots over manuals", "Quality inspection reports"],
  },
  {
    slug: "logistics",
    name: "Logistics and Supply Chain",
    short: "Move freight, paperwork and decisions faster.",
    headline: "Turn shipment paperwork and exceptions into governed, automatic work.",
    body: "Bills of lading, customs filings, carrier emails and delay alerts arrive in every format. tok∑ner reads them once, routes each task to the right model, and keeps people in the loop for the decisions that cost money.",
    icon: Truck,
    shot: "/screens/mlops-builder.webp",
    shotUrl: "app.tokener.io/mlops/pipelines",
    challenges: ["Documents arrive as scans, PDFs and email threads from hundreds of partners", "Exceptions such as delays and damage need a decision within minutes", "Edge sites and depots have patchy connectivity"],
    outcomes: [
      { title: "Documents read once", body: "Bills, invoices and packing lists become canonical documents that every model and workflow reuses." },
      { title: "Exceptions with an owner", body: "Delay and damage events open a task, draft the customer message and wait for approval before anything is sent." },
      { title: "Work at the depot", body: "Outbound-only agents run models next to warehouse systems and keep working when the link drops." },
    ],
    uses: ["Customs and trade document extraction", "Shipment exception handling", "Dispatcher and warehouse copilots"],
  },
  {
    slug: "energy",
    name: "Energy and Utilities",
    short: "Operational AI for grids, plants and field crews.",
    headline: "Bring AI to the control room without opening a path into it.",
    body: "Utilities and energy producers run critical systems that cannot be exposed. tok∑ner keeps inference and data inside your boundary, governs every model call and records what operators and assistants did.",
    icon: Zap,
    shot: "/screens/mlops-agents.webp",
    shotUrl: "app.tokener.io/mlops/agents",
    challenges: ["Operational networks must stay isolated from the internet", "Field crews need answers from thousands of pages of procedures", "Regulators expect a record of automated decisions"],
    outcomes: [
      { title: "Outbound-only agents", body: "Build and deploy models inside the plant or substation network without an inbound port." },
      { title: "Procedures that answer", body: "Retrieval over manuals, permits and inspection reports with the source page cited." },
      { title: "Evidence on request", body: "Every model call and every approval is attributable and exportable." },
    ],
    uses: ["Outage and alarm summarisation", "Field crew procedure assistants", "Regulatory filing preparation"],
  },
  {
    slug: "telecom",
    name: "Telecommunications",
    short: "Support, network operations and billing at carrier scale.",
    headline: "Handle millions of conversations without losing control of cost or data.",
    body: "Carriers combine huge contact volumes, complex product catalogues and strict data rules. tok∑ner gives each channel its own budget and policy, routes around provider incidents and records usage by team.",
    icon: RadioTower,
    shot: "/screens/analytics.webp",
    shotUrl: "app.tokener.io/analytics",
    challenges: ["Contact volume spikes with every outage and every promotion", "Network teams drown in alarms and tickets", "Customer data is regulated and must stay in country"],
    outcomes: [
      { title: "Per-channel budgets", body: "Chat, voice and agent-assist each get a cap and a policy so one channel cannot consume the others." },
      { title: "Incident summaries", body: "Alarm floods are grouped and summarised for the on-call engineer, with the raw events one click away." },
      { title: "In-country routing", body: "Customer data goes only to models hosted in approved regions." },
    ],
    uses: ["Customer support assistants", "Network incident triage", "Bill explanation and dispute handling"],
  },
  {
    slug: "education",
    name: "Education",
    short: "Tutors, advisers and research help with guardrails.",
    headline: "Give every learner and teacher an assistant, and keep the institution in charge.",
    body: "Schools and universities want tutoring, advising and research support without student records leaving campus or costs running away. tok∑ner sets the rules per course and per department and shows what each program spends.",
    icon: GraduationCap,
    shot: "/screens/budgets.webp",
    shotUrl: "app.tokener.io/budgets",
    challenges: ["Student records are protected and sensitive", "Departments adopt tools on their own and costs sprawl", "Teachers need control over what an assistant may say"],
    outcomes: [
      { title: "Course-scoped assistants", body: "Retrieval is limited to the materials a course has approved, with citations to the source." },
      { title: "Budgets per department", body: "Each faculty has a cap, a warning threshold and a report, so the institution can say yes to more pilots." },
      { title: "Records stay on campus", body: "Student data is masked in documents and sensitive work runs on models you host." },
    ],
    uses: ["Course tutors grounded in the syllabus", "Admissions and student advising", "Research literature assistants"],
  },
  {
    slug: "legal",
    name: "Legal and Professional Services",
    short: "Review, research and drafting with a record of every step.",
    headline: "Speed up document-heavy work without giving up privilege or accuracy.",
    body: "Law firms, legal teams and advisers handle confidential documents at volume. tok∑ner masks what must be masked, keeps matters separate, makes every answer cite its source and records who approved what.",
    icon: Gavel,
    shot: "/screens/audit.webp",
    shotUrl: "app.tokener.io/audit",
    challenges: ["Client matters must never mix", "Reviewers need to verify every statement against a source", "Partners need a record of how a draft was produced"],
    outcomes: [
      { title: "Matter-scoped retrieval", body: "Indexes and filters keep one client's documents out of another's answers." },
      { title: "Answers with citations", body: "Every extracted clause and every research answer points to the page it came from." },
      { title: "Approval before it leaves", body: "Drafts wait for a named reviewer, and the approval is part of the record." },
    ],
    uses: ["Contract review and clause extraction", "Due diligence data rooms", "Research memos with cited sources"],
  },
];

export const NAV = {
  products: [
    ...PRODUCTS.map((p) => ({ label: p.name, href: `/product/${p.slug}`, desc: p.short, icon: p.icon })),
    { label: "Refinery", href: "/product/mlops/refinery", desc: "Prepare and clean data for model training, in batch or as a stream.", icon: RefineryGlyph as LucideIcon },
    { label: "Agent OS", href: "/product/agent-os", desc: "Register, govern, run and evaluate agents from any framework.", icon: Orbit },
    { label: "MLOps and AI infrastructure", href: "/product/mlops", desc: "Connect clusters, build pipelines, deploy and observe models.", icon: Boxes },
  ],
  solutions: SOLUTIONS.map((s) => ({ label: s.name, href: `/solutions/${s.slug}`, desc: s.short, icon: s.icon })),
  usecases: [
    { label: "All use cases", href: "/use-cases", desc: `${USE_CASE_CATALOG.length} worked examples with pipelines and animated diagrams.`, icon: Layers },
    { label: "Build RAG systems", href: "/use-cases/rag-reference-architecture", desc: "Ingest, embed, index, retrieve and serve, governed end to end.", icon: ScanSearch },
    ...INDUSTRY_ORDER.filter((i) => i !== "knowledge").map((i) => {
      const s = SOLUTIONS.find((x) => x.slug === i);
      const n = USE_CASE_CATALOG.filter((u) => u.industry === i).length;
      return { label: INDUSTRY_LABELS[i], href: `/use-cases?industry=${i}`, desc: `${n} use cases`, icon: s?.icon ?? Layers };
    }),
  ],
  developers: [
    { label: "Developer hub", href: "/developers", desc: "Start here for guides and references." },
    { label: "Quickstart", href: "/developers/quickstart", desc: "First governed request in five minutes." },
    { label: "API reference", href: "/developers/api", desc: "Data plane and control plane endpoints." },
    { label: "SDKs", href: "/developers/sdks", desc: "Java, Python, Go, Node.js, Rust, .NET." },
    { label: "MLOps tutorials", href: "/developers/tutorials", desc: "Connect, deploy and operate models with real commands." },
    { label: "Error handling", href: "/developers/errors", desc: "Typed errors and rate-limit headers." },
    { label: "Platform scope", href: "/developers/changelog", desc: "What the platform covers, area by area." },
  ],
  resources: [
    { label: "Blog", href: "/blog", desc: "Engineering notes and product updates." },
    { label: "Customers", href: "/customers", desc: "How teams use the platform." },
    { label: "Security and trust", href: "/security", desc: "Controls, encryption, and compliance." },
    { label: "Platform status", href: "/status", desc: "Live component health." },
  ],
};

export const FOOTER_COLS: { title: string; links: { label: string; href: string }[] }[] = [
  { title: "Product", links: [{ label: "Platform overview", href: "/product" }, ...PRODUCTS.map((p) => ({ label: p.name, href: `/product/${p.slug}` })), { label: "Agent OS", href: "/product/agent-os" }, { label: "MLOps and AI infrastructure", href: "/product/mlops" }, { label: "Connectors", href: "/connectors" }, { label: "Integration catalogue", href: "/product/mlops/integrations" }, { label: "Pricing", href: "/pricing" }] },
  { title: "Solutions", links: SOLUTIONS.map((s) => ({ label: s.name, href: `/solutions/${s.slug}` })) },
  { title: "Use cases", links: [{ label: "All use cases", href: "/use-cases" }, { label: "Retrieval and RAG", href: "/use-cases/rag-reference-architecture" }, ...INDUSTRY_ORDER.filter((i) => i !== "knowledge").map((i) => ({ label: INDUSTRY_LABELS[i], href: `/use-cases?industry=${i}` }))] },
  { title: "Developers", links: NAV.developers.map((d) => ({ label: d.label, href: d.href })) },
  { title: "Company", links: [{ label: "About", href: "/about" }, { label: "Careers", href: "/careers" }, { label: "Blog", href: "/blog" }, { label: "Customers", href: "/customers" }, { label: "Contact", href: "/contact" }, { label: "Brand", href: "/brand" }, { label: "Security", href: "/security" }, { label: "Status", href: "/status" }] },
  { title: "Legal", links: [{ label: "All legal documents", href: "/legal" }, { label: "Terms of service", href: "/legal/terms" }, { label: "Service terms", href: "/legal/service-terms" }, { label: "Privacy policy", href: "/legal/privacy" }, { label: "Data processing addendum", href: "/legal/dpa" }, { label: "Acceptable use policy", href: "/legal/acceptable-use" }, { label: "Responsible AI policy", href: "/legal/ai-use" }, { label: "Cookie notice", href: "/legal/cookies" }, { label: "Report a security issue", href: "/legal/security-reporting" }] },
];

export type Tier = {
  name: string;
  price: string;
  unit: string;
  blurb: string;
  cta: { label: string; href: string };
  featured?: boolean;
  features: string[];
};

/**
 * How billing works, modelled on Confluent Cloud: a free start with usage credit, then pay as you go to a card or bank account, with annual
 * commitments and cloud marketplace billing for larger customers. PLACEHOLDER commercial terms: the credit and its length live in
 * lib/billing/model.ts (FREE_START) and must be confirmed before launch. No unit rates are published here on purpose.
 */
export const TIERS: Tier[] = [
  {
    name: "Free start",
    price: "$400",
    unit: "usage credit, 30 days",
    blurb: "Try every feature with usage credit. No card to look around.",
    cta: { label: "Get started free", href: "/signup" },
    features: ["Try any feature and simulate pipelines with sample data", "Connect providers, set policies, budgets and quotas", "Analytics and audit for 7 days", "Ends after 30 days or when the credit is used", "Add a payment method to keep your resources running"],
  },
  {
    name: "Pay as you go",
    price: "Usage",
    unit: "billed monthly in arrears",
    blurb: "Add a card or US bank account when you first save or launch something metered. Free credit is used first, then usage is billed monthly in arrears.",
    cta: { label: "Start free", href: "/signup" },
    featured: true,
    features: ["Save pipelines, knowledge bases and published versions", "Run pipelines, functions and agents in an environment", "Document processing at volume", "Longer audit and analytics retention", "More tenants and production deployments"],
  },
  {
    name: "Commitment",
    price: "Custom",
    unit: "annual commitment",
    blurb: "Commit to a minimum spend for discounted rates, invoicing and compliance support.",
    cta: { label: "Talk to sales", href: "/contact" },
    features: ["Volume discounts for a minimum annual spend", "Invoicing, or billing through AWS, Google Cloud or Azure", "Dedicated, private cloud, on-prem or air-gapped deployment", "7 year audit retention and chargeback", "24x7 support with an SLA"],
  },
];

export const COMPARE: { feature: string; dev: string; team: string; ent: string }[] = [
  { feature: "Payment method", dev: "None to explore. Asked for when you save or launch something metered", team: "Card or US bank account", ent: "Invoice or cloud marketplace" },
  { feature: "Billing", dev: "Credit is used first", team: "Credit first, then monthly in arrears, accrued hourly", ent: "Against a committed spend" },
  { feature: "Providers and gateway", dev: "All providers", team: "All providers and failover", ent: "All plus custom adapters" },
  { feature: "Policy Builder and simulation", dev: "Included", team: "Included", ent: "Included with approvals" },
  { feature: "Pipelines", dev: "Build and simulate. Saving asks for a card", team: "Save, publish and run in an environment", ent: "Run, with approval gates" },
  { feature: "Cost optimization", dev: "Lossless cleanup and exact cache", team: "Adds semantic cache, document library and balanced mode", ent: "Adds aggressive mode, learned compression and quality reports" },
  { feature: "Document processing", dev: "Free allowance", team: "Metered per page", ent: "Metered, custom OCR" },
  { feature: "Audit retention", dev: "7 days", team: "Extended, metered", ent: "7 years" },
  { feature: "Sign-in methods", dev: "Google, GitHub, email", team: "Google, GitHub, email", ent: "Google, GitHub, email" },
  { feature: "Deployment", dev: "SaaS", team: "SaaS", ent: "SaaS, dedicated, private, on-prem, air-gapped" },
  { feature: "Support", dev: "Community", team: "Support plans", ent: "24x7 with SLA" },
];

export const FAQS: { q: string; a: string }[] = [
  { q: "Is it really free to start?", a: "Yes. New organizations get usage credit that lasts 30 days or until it is used, whichever comes first, and you do not need a card to explore. You can try any feature. Simulation stays free." },
  { q: "When will I be asked for a payment method?", a: "When you save or launch something that is metered, such as saving a pipeline or knowledge base, publishing a version or running in an environment. You add it right there and carry on. It is also needed before the free start ends. Only organization admins and finance can add one." },
  { q: "What happens when the free credit ends?", a: "The free start ends after 30 days or when the credit is used, whichever comes first. It cannot be paused, and sales can extend it. With no payment method the organization is suspended: features are unavailable and data cannot be reached. Adding a payment method or redeeming a promo code restores access. If neither happens within 30 days of suspension, resources are deleted; the organization and its people are kept." },
  { q: "When am I charged?", a: "Your payment method is not charged until the free start ends. Free credit is used first. Usage then accrues hourly, with part of an hour billed as a full hour, and is invoiced monthly in arrears. Billing starts when you create a resource and stops when you delete it. Usage appears in the console as it happens." },
  { q: "Can I set a spending cap?", a: "There is no hard dollar cap. Set budgets and alerts to be told before spend gets away from you, and use an annual commitment to plan spend. Free start notices go out at half and 80 percent of the credit, at the halfway point of the 30 days, and when it expires in under three days." },
  { q: "How can I pay?", a: "By credit or debit card or a US bank account, through your cloud marketplace (AWS, Google Cloud or Azure), or by invoice on an annual commitment. Prepaid cards are not supported, and an organization has one payment method at a time." },
  { q: "How does tok∑ner reduce token spend?", a: "In four ways that add together: every prompt and document is converted into the form that costs the fewest tokens for the model you call, cached answers cover repeated questions, an optional step fits long inputs to the question, and routing sends each request to the cheapest model that meets your quality floor. Every conversion is checked for lost numbers and identifiers, and a sample is compared against the original answer." },
  { q: "Does tok∑ner store my prompts?", a: "No. Prompt and response logging is off by default and can be enabled per tenant. It is gated by its own permission so enabling it does not expose content to finance or viewer roles." },
  { q: "How much latency does the gateway add?", a: "The target is under 15ms at p99, excluding the provider round trip. Policy evaluation targets under 2ms and the budget check under 3ms." },
  { q: "Can we keep provider credentials in our own vault?", a: "Yes. Provider keys are stored in HashiCorp Vault and referenced by path. Customer-managed vault paths are on the roadmap as a first-class onboarding flow." },
  { q: "What happens if tok∑ner is unreachable?", a: "You choose per tenant whether the gateway fails open or fails closed. Regulated workloads usually fail closed." },
  { q: "Can we run it ourselves?", a: "Yes. Helm charts support SaaS, dedicated, single tenant, private cloud, on-premises Kubernetes, and air-gapped installs." },
  { q: "Do we need to change our application code?", a: "For OpenAI-compatible clients you change the base URL and API key. Typed SDKs are also available for six languages." },
];

export { POSTS } from "./blog";

export const ROADMAP: { area: string; title: string; items: string[] }[] = [
  { area: "Gateway", title: "Core gateway", items: ["Gateway with OpenAI, Claude, and self-hosted providers", "Policy language and compiler", "Token accounting events into ClickHouse", "Redis-backed budgets with warn, throttle, block", "Dashboard, Provider Registry, and policy editor"] },
  { area: "Platform", title: "Control plane", items: ["Full Provider Registry with failover and regional routing", "Model aliases", "Analytics and Usage Explorer", "Billing with Stripe", "Visual policy builder with simulation", "Quota engine and first-class audit module", "Document Processing with OCR and malware scanning"] },
  { area: "Intelligence and reach", title: "Forecasting, delivery and SDKs", items: ["Forecasting and anomaly detection", "Notification Center with multi-channel delivery", "Generated SDKs for six languages", "ABAC on the control plane", "Reserved capacity terms in the cost engine", "Embeddings, audio and video ingestion, PII masking"] },
  { area: "Scale and ecosystem", title: "Enterprise operations", items: ["Multi-region active-active", "Provider adapter marketplace and plugin system", "Customer-managed vault paths", "Cheapest-model-that-meets-quality routing", "Carbon footprint metrics", "Governance approval workflows"] },
];

// ---------------------------------------------------------------------------------------------
// Longer-form copy for product and solution pages.

export type Deep = {
  /** Four steps that explain the mechanism in plain language. */
  how: { title: string; body: string }[];
  /** Who opens this page and what they usually ask. */
  faq: { q: string; a: string }[];
};

export const PRODUCT_DEEP: Record<string, Deep> = {
  gateway: {
    how: [
      { title: "Point the client at tok∑ner", body: "Change the base URL and the key in your existing OpenAI-compatible client. No new SDK is required, and streaming works the same way." },
      { title: "Identify who is calling", body: "The gateway resolves the key or service token to a tenant, a project and a person or service, so every later decision knows who is asking." },
      { title: "Check rules before spending", body: "Policy, budget and quota are evaluated against an estimate of the request. A request that fails never reaches a provider and never costs a token." },
      { title: "Route, return and record", body: "The router picks a healthy provider, the response streams back, and usage lands in an append-only ledger with the policy version that allowed it." },
    ],
    faq: [
      { q: "Do we need to change our application code?", a: "Usually only the base URL and the key. The gateway speaks the OpenAI wire format, so existing clients, frameworks and tools keep working." },
      { q: "What happens if tok∑ner is unreachable?", a: "You choose per tenant. Fail closed refuses traffic when a dependency is down, and fail open lets it through while recording that checks were skipped." },
      { q: "Does it add noticeable latency?", a: "The gateway targets under 15 ms at p99 for its own work. Provider time is unchanged, and the per-stage timings are shown on every trace." },
      { q: "Where do provider keys live?", a: "In your secret manager. tok∑ner stores references, resolves them at the moment of use, and never prints or logs the value." },
    ],
  },
  "policy-engine": {
    how: [
      { title: "Write the rule once", body: "Describe what is allowed in a readable policy language, or draw it in the visual builder. Both produce the same versioned document." },
      { title: "Simulate before you publish", body: "Replay recent traffic against the draft and see which requests would change outcome. Nothing is enforced until you publish." },
      { title: "Approve and publish", body: "Changes above a risk threshold go through an approval chain. Published versions are immutable, so you can always say which rule applied." },
      { title: "Enforce at the gateway", body: "Each request is evaluated in microseconds. The decision, the rule that produced it and the reason are stored with the request." },
    ],
    faq: [
      { q: "Can non-engineers manage policy?", a: "Yes. The visual builder and templates cover common rules such as model allow-lists, regions and hours, and every change is reviewed the same way as code." },
      { q: "How do we know a change is safe?", a: "Simulation shows the impact on real recent traffic before publishing, and rollback restores the previous version in one step." },
      { q: "Can a rule block only part of a request?", a: "Yes. Rules can allow, deny, throttle, rewrite or mask. A prompt containing personal data can be masked and forwarded instead of rejected." },
    ],
  },
  "cost-and-budgets": {
    how: [
      { title: "Count tokens as they flow", body: "Input, output and cached tokens are metered per request and priced with the provider's current rates and your contract terms." },
      { title: "Set budgets where you manage money", body: "Attach limits to an organisation, a tenant, a project or a key, per hour, day or month, in tokens or in currency." },
      { title: "Escalate before the limit", body: "At each threshold the budget warns, throttles or blocks, and sends the alert to Slack, email or on-call so a person can step in." },
      { title: "Charge back with confidence", body: "Export usage and cost by team, project and model. Corrections are new ledger entries, so earlier reports never change." },
    ],
    faq: [
      { q: "Do budgets stop a runaway agent?", a: "Yes. A hard block at the key or project level ends a loop that would otherwise run overnight, and the alert tells the owner why." },
      { q: "Are the figures an estimate or the real cost?", a: "Usage is exact. Cost uses configured rates and contract terms, and anything estimated is labelled as an estimate." },
      { q: "Can finance see this without the console?", a: "Yes. Scheduled exports and the analytics API provide the same figures for your finance tooling." },
    ],
  },
  "cost-optimization": {
    how: [
      { title: "Check the cache", body: "An identical or near-identical request returns the stored answer without calling a provider. You set how similar and how long for each application." },
      { title: "Convert the input", body: "The input is read into headings, paragraphs, lists, tables and code. Broken lines are rejoined, repeats are kept once, and each table is written in the form that costs the fewest tokens, checked by reading it back. Code is left exactly as written." },
      { title: "Go further where allowed", body: "An application that opts in can also remove page headers, footers and web navigation, define repeated phrases once, and fit long text to the question. Strong matches stay, numbers and identifiers go last, and anything cut is listed." },
      { title: "Measure and verify", body: "Provider usage is recorded against a shadow baseline. A sample is replayed without optimization and compared, and the lossy stages stop if quality drops below the floor." },
    ],
    faq: [
      { q: "Will the model lose information?", a: "Not at the lossless level, which only changes how the same content is written. At balanced and aggressive levels, text that does not help with the question can be dropped, numbers and identifiers are dropped last, and each one that is cut is listed on the request. A quality check compares the answers against the original prompt." },
      { q: "How is this different from choosing the cheapest model?", a: "Routing decides which model answers. Optimization reduces what is sent to it, and the two add together. A shorter prompt costs less on any model." },
      { q: "Does it work on documents?", a: "Yes, and documents are where it matters most. A document is converted once for each model family and stored, and later requests use the stored form. Text, Markdown, HTML, JSON, CSV, email and logs are converted in the gateway. PDF, Word, Excel, scans and audio are read by the document worker, which hands the text to the same converter." },
      { q: "Can we see what changed?", a: "Every request keeps the stages that ran, the tokens each one removed and a line by line diff, for as long as your audit retention allows." },
    ],
  },
  documents: {
    how: [
      { title: "Upload or reference a file", body: "PDFs, Office files, images, audio and archives are accepted through the API, the console or object storage." },
      { title: "Scan and read it", body: "Each file is scanned for malware and type mismatches, then read with OCR and table extraction into structured text." },
      { title: "Mask what policy says", body: "Personal data is masked during processing, with the rule recorded, so sensitive content never reaches a model unredacted." },
      { title: "Reuse the canonical document", body: "The result is stored once and reused by every provider and prompt, which cuts cost and keeps answers consistent." },
    ],
    faq: [
      { q: "Which file types are supported?", a: "Common office and PDF formats, images, audio and archives. Unsupported or mismatched files are refused with a typed error." },
      { q: "Is the original file kept?", a: "That is your choice per tenant. The canonical document can be retained with the original, or the original can be discarded after processing." },
      { q: "Can we keep documents in our own storage?", a: "Yes. Point the platform at your S3 or MinIO bucket and documents stay in your account." },
    ],
  },
  observability: {
    how: [
      { title: "Every request becomes an event", body: "The gateway emits one structured event per request with cost, tokens, latency, outcome and the policy that applied." },
      { title: "Events are stored for analysis", body: "A columnar store keeps events queryable by tenant, project, model, provider and time at interactive speed." },
      { title: "Explore, then alert", body: "Slice usage in the explorer, set anomaly and threshold alerts, and trace any single request through each stage." },
      { title: "Send it to your tools", body: "Export metrics and traces to OpenTelemetry, Prometheus, Datadog or Splunk so operations works in one place." },
    ],
    faq: [
      { q: "Is prompt content stored?", a: "Not by default. Events hold metadata and counts. Content capture is opt-in per project and is redacted before it is stored." },
      { q: "How long is data retained?", a: "Retention is configurable per tenant, and the audit trail is retained separately under its own policy." },
      { q: "Can we use our existing dashboards?", a: "Yes. The same metrics are available through exporters and the analytics API." },
    ],
  },
  "provider-registry": {
    how: [
      { title: "Register providers once", body: "Add OpenAI, Anthropic, Gemini, Azure OpenAI, Bedrock, Mistral, DeepSeek or any OpenAI-compatible endpoint, and test the connection." },
      { title: "Map models to aliases", body: "Applications ask for chat-default. You decide which provider and model answers, and you can change it without a deploy." },
      { title: "Set priorities and regions", body: "Order providers, pin regions, and keep sensitive workloads on a self-hosted model inside your own network." },
      { title: "Fail over on health", body: "The router watches latency and errors, skips an unhealthy provider and returns to it when it recovers." },
    ],
    faq: [
      { q: "Can we mix hosted and self-hosted models?", a: "Yes. Ollama, vLLM, LM Studio and any compatible server register like a hosted provider and route by the same rules." },
      { q: "What happens to a streaming response if a provider fails mid-stream?", a: "The stream ends with a typed error. Retries and failover apply before the first token, where they are safe." },
      { q: "How do we change models without touching applications?", a: "Applications use aliases. Repoint the alias to a new model and every application follows immediately." },
    ],
  },
};

export const SOLUTION_DEEP: Record<string, { workflow: string[]; measures: string[] }> = {
  banking: {
    workflow: ["A relationship manager asks for a client briefing in an internal assistant.", "The gateway attaches the manager's identity, line of business and cost centre.", "Personal identifiers are masked and only an approved in-region model is allowed to answer.", "The answer returns, and usage is booked to the line of business.", "Model risk and audit can later ask who used which model, with what data, under which rule."],
    measures: ["Time to answer an examiner's question", "Share of requests served by approved models", "Cost per line of business", "Policy changes reviewed before publish"],
  },
  startups: {
    workflow: ["A developer swaps the base URL in an existing client.", "Each developer and each agent gets a key with its own daily cap.", "A looping agent reaches its cap and is stopped, and the owner is told in Slack.", "A cheaper model becomes good enough, and the team repoints one alias.", "The invoice matches the dashboard, and there is nothing to reconcile."],
    measures: ["Spend per feature", "Incidents caused by provider outages", "Hours spent reconciling invoices", "Time to try a new model"],
  },
  enterprise: {
    workflow: ["Central IT publishes approved models and a baseline policy.", "Each business unit receives a tenant that inherits the baseline and adds its own limits.", "Teams build with their own keys and see only their own usage.", "Finance receives chargeback by project each month without a spreadsheet.", "Security reviews one audit trail instead of one per team."],
    measures: ["Teams onboarded per month", "Shared versus duplicated provider contracts", "Chargeback accuracy", "Time to approve a new model"],
  },
  healthcare: {
    workflow: ["A clinical summarisation service calls the gateway from inside the hospital network.", "Patient identifiers are masked before anything leaves the boundary.", "Routine summaries run on a self-hosted model, and only approved tasks may use a hosted one.", "Every call is attributable to a role, a purpose and a policy version.", "Privacy officers review access and exports from the audit trail."],
    measures: ["Requests that left the boundary", "Masked fields per document", "Access review completion", "Cost per summary"],
  },
  "public-sector": {
    workflow: ["The agency deploys the platform on its own cluster, in its own jurisdiction.", "Citizen-service assistants use in-jurisdiction and self-hosted models.", "Policy changes above a risk threshold go through an approval chain.", "Oversight staff export who used what and under which rule.", "Procurement can move providers because the interface is open and portable."],
    measures: ["Data residency exceptions", "Approval turnaround for policy changes", "Time to produce an oversight report", "Providers replaceable without rework"],
  },
  retail: {
    workflow: ["A campaign launches and assistant traffic triples.", "Rate limits and per-campaign budgets absorb the burst.", "A provider degrades, and the router moves traffic to a secondary without a deploy.", "Marketing sees spend per campaign, and engineering sees latency per provider.", "The campaign ends, and the budget closes with a report."],
    measures: ["Assistant availability during peaks", "Cost per conversation", "Spend per campaign", "Failover events handled automatically"],
  },
  insurance: {
    workflow: ["A first notice of loss arrives with photos, a form and an email thread.", "Each file is scanned, read and masked once into a canonical document.", "Models summarise the claim and extract fields, reusing the same document.", "A reviewer approves any step that needs a person.", "The decision record shows the model, the policy version and the reviewer."],
    measures: ["Time to first review", "Reprocessing avoided by reuse", "Masked fields per claim", "Decisions with a complete record"],
  },
  manufacturing: {
    workflow: ["A build agent is installed inside the plant network, with outbound access only.", "A model is built, scanned and approved centrally, then deployed to the plant by a signed job.", "Technicians use a copilot that answers from local manuals on local hardware.", "Metrics flow out, and jobs flow in, and no inbound port is opened.", "Central teams see one audit trail and one policy set across every site."],
    measures: ["Sites running current model versions", "GPU utilisation per site", "Time to roll out or roll back a model", "Jobs refused by the allowlist"],
  },
  logistics: {
    workflow: ["A carrier sends a delay notice by email with a scanned attachment.", "The document is read once into a canonical record and the shipment is matched by reference.", "A model proposes the impact on the delivery promise and drafts the customer message.", "A dispatcher approves the message and the alternative routing.", "The notice, the decision and the message are stored against the shipment."],
    measures: ["Time from notice to customer message", "Documents processed without manual keying", "Exceptions closed within target", "Cost per shipment handled"],
  },
  energy: {
    workflow: ["An outbound-only agent is installed in the operations network.", "A model is built, scanned and approved centrally, then deployed to the site by a signed job.", "Operators ask the procedure assistant a question and get the answer with the page cited.", "A burst of alarms is grouped and summarised for the on-call engineer.", "Approvals and answers are exported for the regulator's request."],
    measures: ["Sites running current model versions", "Time to find the right procedure", "Alarm floods summarised before paging", "Records produced for audits"],
  },
  telecom: {
    workflow: ["A network incident triggers a surge of support chats.", "Each channel has its own budget, so chat cannot starve agent-assist.", "A provider degrades and the router moves traffic to a secondary.", "A customer asks why the bill changed and the assistant answers from the billing record.", "Finance sees cost per resolved contact by channel."],
    measures: ["Cost per resolved contact", "Containment without a human", "Failover events handled automatically", "Alarms grouped per incident"],
  },
  education: {
    workflow: ["An instructor uploads the syllabus and readings for a course.", "The materials are indexed and the course assistant may answer only from them.", "Students ask questions and each answer cites the reading.", "A department budget warns the head of department at 80 percent.", "The institution reviews usage by course without reading student conversations."],
    measures: ["Questions answered with a citation", "Spend per department", "Courses with an approved assistant", "Records leaving the campus boundary"],
  },
  legal: {
    workflow: ["A new matter is opened and its documents are loaded into a matter-scoped index.", "Sensitive identifiers are masked during processing.", "An associate asks for every termination clause and receives the clauses with page references.", "A partner reviews and approves the draft memo.", "The matter record shows sources, model, reviewer and time."],
    measures: ["Review hours per document set", "Answers with verified citations", "Matters with an approval record", "Cross-matter retrievals blocked"],
  },
};
