import { RefineryGlyph } from "@/components/refinery/RefineryIcon";
import { Boxes, Cable, GitBranch, Hammer, Rocket, ShieldCheck, Gauge, CalendarClock, Wallet, Blocks, BookOpen, Library, type LucideIcon } from "lucide-react";

export const MLOPS_STATUS =
  "Every connection is read-only by default and verified by a live test before it is trusted. Secrets stay in your secret manager and are referenced, never stored. Each integration page lists its version targets, prerequisites and the exact permissions it needs.";

export type MlopsTopic = {
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
  consoleHref: string;
  tutorial?: string;
  scene?: string;
};

export const MLOPS_TOPICS: MlopsTopic[] = [
  {
    slug: "pipeline-builder", scene: "mlops", name: "Pipeline builder", icon: GitBranch,
    short: "Draw a release pipeline, or answer a few questions. Both edit the same versioned spec.",
    headline: "One pipeline spec, two ways to author it.",
    body: "Build visually on a canvas with typed ports, or follow a guided wizard. Both write the same canonical, versioned specification, so you can switch at any point and nothing is lost. Publishing creates an immutable version with a content digest.",
    shot: "/screens/mlops-builder.webp", shotUrl: "app.tokener.io/mlops/pipelines/edit",
    highlights: [
      { title: "Typed nodes and ports", body: "Only compatible ports connect. Valid targets light up while you drag, and the same rules apply from the keyboard." },
      { title: "Review before you run", body: "See the effective configuration, the generated plan and the generated manifests, with secrets shown as references only." },
      { title: "Versions you can trust", body: "Published versions are immutable. Compare any two, restore an older one as a new draft, and migrate older specs with explicit rules." },
    ],
    bullets: ["Zoom, pan, minimap, fit and undo/redo", "Keyboard navigation for every node and edge", "Runtime overlays that show status on the graph", "Validation that blocks unsafe or unsupported runs", "Export as YAML with secrets redacted"],
    consoleHref: "/mlops/pipelines", tutorial: "register-model-deploy-endpoint",
  },
  {
    slug: "model-registry", scene: "mlops", name: "Model registry", icon: Boxes,
    short: "Versions, provenance and approvals for every model you deploy.",
    headline: "Know exactly which model is serving, and why it is allowed to.",
    body: "Track model versions with their source, digest, evaluation results and approval history. Production stages need an approver who is not the author, and every decision is written to the audit log.",
    shot: "/screens/mlops-models.webp", shotUrl: "app.tokener.io/mlops/models",
    highlights: [
      { title: "Provenance", body: "Each version records where it came from, its content digest and the pipeline run that produced it." },
      { title: "Approvals", body: "Approve or reject a version with a note. Separation of duties is enforced, not suggested." },
      { title: "Linked to serving", body: "See which deployments run each version and whether a rollback target exists." },
    ],
    bullets: ["Stages: none, staging, production, archived", "Evaluation metrics stored with each version", "Audit entry for every decision", "Works with MLflow and Hugging Face sources (planned connectors)"],
    consoleHref: "/mlops/models",
  },
  {
    slug: "knowledge", name: "Knowledge bases", icon: BookOpen,
    short: "Turn documents into a searchable index that assistants query with citations and permissions.",
    headline: "Give every assistant a knowledge base it can be held to.",
    body: "Point a knowledge base at a bucket or upload files. tok∑ner scans, splits and embeds the documents, writes them to your own vector store and refreshes only what changed. Assistants query it through the gateway and get passages with their source and page, limited to what the caller may read.",
    shot: "/screens/mlops-knowledge.webp", shotUrl: "app.tokener.io/mlops/knowledge",
    highlights: [
      { title: "Guided or visual", body: "Create a knowledge base in six guided steps, or draw it on a canvas where sources, splitting, the index and query settings are steps you can select and edit. Both edit the same settings." },
      { title: "Fresh and complete", body: "Sync on a schedule or on demand. New and changed files are processed again, removed files are dropped, and a source that cannot be read is shown with the reason instead of failing quietly." },
      { title: "Measured, not assumed", body: "Keep a test set of questions and the document that should answer each. Run it to get recall at 5, rank quality and no-answer accuracy, and see which questions failed." },
    ],
    bullets: ["Sources: uploads and object storage connections", "Structure aware splitting with chunk size and overlap", "Personal data masked before embedding, per document policy", "Your vector store: pgvector, Milvus, Qdrant or Weaviate", "Test search with score, filters and the passage text", "Respect source permissions and require citations", "Changing the model or splitting re-embeds with the old index serving until the new one is ready", "Usage snippets for curl, Python and Node"],
    consoleHref: "/mlops/knowledge",
  },
  {
    slug: "model-library", name: "Model library and uploads", icon: Library,
    short: "Upload your own models or import approved ones, with format checks and a scan for code that runs on load.",
    headline: "Bring a model in, and know what is inside it.",
    body: "Upload a model file and the console verifies its checksum, inspects the format and scans pickle based files for code that would run when the file is loaded. Platform operators can publish reviewed models to a library that teams import into their own registry.",
    shot: "/screens/mlops-library.webp", shotUrl: "app.tokener.io/platform/library",
    highlights: [
      { title: "Checked on the way in", body: "Safetensors, GGUF, ONNX and PyTorch files are inspected. A blocking finding rejects the upload before it reaches the registry, and warnings are shown for a person to weigh." },
      { title: "One reviewed copy", body: "Operators publish a model once with its licence and notes. Teams import it into their own registry as a version with its source recorded." },
      { title: "A way back", body: "Operators can withdraw a library version. Teams that imported it are told, and deployments keep their own record of what they run." },
    ],
    bullets: ["SHA-256 computed in the browser and verified on the server", "Size limit shown before upload starts", "Pickle opcodes that execute code are blocked", "Approval before a version can be released", "Audit entry for every upload, publish and withdrawal"],
    consoleHref: "/platform/library",
  },
  {
    slug: "refinery", scene: "refinery", name: "Refinery", icon: RefineryGlyph as LucideIcon,
    short: "Clean, shape and convert data for model training, in batch or as a change stream.",
    headline: "Prepare training data on a canvas, on runners you control.",
    body: "Refinery turns raw files, tables, documents and change streams into clean, versioned datasets that a training pipeline can read. Build a recipe as a pipeline on a canvas or in a guided wizard, describe a change in plain language and review it before it applies, then run it on a pool of runners inside your own network. The control plane keeps the recipe, the run record and a bounded sample. Your data stays where it is.",
    shot: "/screens/refinery-overview.webp", shotUrl: "app.tokener.io/refinery",
    highlights: [
      { title: "A recipe is a pipeline", body: "Read, filter, fix types, mask, deduplicate and join, then add feature engineering steps for ratios, windows, encodings and scaling. Call a tok∑ner function, a connector or a model as a step. Switch between the canvas and the wizard at any time, they edit the same recipe." },
      { title: "Watch it run", body: "Open the run window to follow a structured log as it happens, with per-step row counts, partitions and the rows that were rejected and why. Source tables colour nulls, blanks, placeholder text and stray spaces so problems are visible before you run." },
      { title: "Built for large inputs", body: "Runner pools take the work in parallel. Small inputs run on the native engine inside tok∑ner, which has limits so it cannot overload the platform. Larger inputs run on a single node runner, Spark or Flink, including a Flink cluster you already operate, and non-columnar files are converted once to Parquet before the first step. Streams from Kafka, RabbitMQ, Pulsar, NATS, Kinesis, Pub/Sub and other messaging systems, or from Debezium change data capture, are cleaned continuously. The default native engine needs no cluster and has limits that protect the platform." },
    ],
    bullets: [
      "Sources: object storage including S3 and MinIO, databases, warehouses, Kafka, uploads from your computer",
      "Documents: PDF, Word, PowerPoint, HTML, text, Markdown, email, scanned images and audio, extracted to one text table",
      "Output formats: Parquet by default, JSON Lines for fine-tuning and retrieval, CSV for interchange",
      "Change data capture: append, upsert or mirror deletes into files, MinIO, S3 or a database",
      "Describe a change in plain language and review the proposed steps before they apply",
      "Customer-hosted runner pools enrol with a one-time token and connect outbound only",
      "Secrets are references to your secret manager, never stored in a recipe",
      "Every run records the recipe version and the input snapshot it used",
    ],
    consoleHref: "/refinery",
  },
  {
    slug: "deployments", scene: "mlops", name: "Deployments and endpoints", icon: Rocket,
    short: "Scale, canary, promote and roll back model endpoints with confirmation and audit.",
    headline: "Roll out gradually. Roll back in one step.",
    body: "Manage inference endpoints per environment. Shift traffic to a canary, watch the metrics, then promote or abort. Destructive actions ask for confirmation, and production needs an approver.",
    shot: "/screens/mlops-deployment.webp", shotUrl: "app.tokener.io/mlops/deployments",
    highlights: [
      { title: "Canary traffic", body: "Send a percentage of traffic to a new version and compare it with the stable one before promoting." },
      { title: "Guarded production", body: "Developers can work in development and staging. Production changes need an approver or an approval gate." },
      { title: "Cost as an estimate", body: "Monthly cost is shown from placeholder rates and clearly labelled as an estimate, never as billed data." },
    ],
    bullets: ["Targets: KServe, Knative, plain Kubernetes, Docker hosts (planned connectors)", "Deploy a trained model with vLLM, TensorRT-LLM, NIM or Triton, sized for the GPU and checked against the node driver", "Register the endpoint as a gateway provider and publish it as an MCP tool", "Autoscaling limits with headroom shown", "Generated manifests for review before apply"],
    consoleHref: "/mlops/deployments", tutorial: "promote-and-rollback",
  },
  {
    slug: "build-agents", scene: "agent", name: "Build agents", icon: Hammer,
    short: "Run image builds on infrastructure you own. The agent connects out, never in.",
    headline: "Build where your code and your GPUs already live.",
    body: "Install a small agent on a Linux server, a Kubernetes cluster or a Docker host. It opens an outbound TLS connection, accepts only signed jobs from its allowlist, and needs no inbound firewall rules.",
    shot: "/screens/mlops-agents.webp", shotUrl: "app.tokener.io/mlops/build-agents",
    highlights: [
      { title: "Outbound only", body: "The agent long-polls the control plane. No open ports and no VPN into your network." },
      { title: "Scoped by allowlist", body: "Each agent has an operation allowlist, a registry allowlist and an egress allowlist. Jobs are signed and verified." },
      { title: "Short-lived credentials", body: "Enrollment tokens are single use, expire in 24 hours and are shown once. Agent credentials rotate and revoke instantly." },
    ],
    bullets: ["Read-only GPU detection. No driver or firmware changes", "Drain, rotate token and revoke from the console", "Installer checksum verification", "Linux, Kubernetes and Docker host install modes"],
    consoleHref: "/mlops/build-agents", tutorial: "build-agent-linux",
  },
  {
    slug: "observability", scene: "observability", name: "Observability and capacity", icon: Gauge,
    short: "Saturation, GPU use, queue depth and alerts in one place.",
    headline: "See saturation before your users do.",
    body: "Track replicas against autoscaling limits, GPU utilisation and memory, request queues and firing alerts. Acknowledging an alert records who and when.",
    shot: "/screens/mlops-observability.webp", shotUrl: "app.tokener.io/mlops/observability",
    highlights: [
      { title: "Capacity headroom", body: "Spot deployments that are at their maximum replicas and have no room left." },
      { title: "Alerts with ownership", body: "Acknowledge from the console with an audit entry. Alert sources will come from Prometheus and OpenTelemetry connections." },
      { title: "Honest metrics", body: "Metrics come from your Prometheus or OpenTelemetry connection and from the inference endpoints themselves." },
    ],
    bullets: ["GPU utilisation and memory", "Queue depth and latency", "Per-environment filters", "Cost estimate labelled as an estimate"],
    consoleHref: "/mlops/observability",
  },
  {
    slug: "agent-builder", name: "Agent builder", icon: CalendarClock, scene: "automation",
    short: "Schedules, timers, business hours, calendars and email, with a model call and an approval in the middle.",
    headline: "Agents that keep time, read calendars and send mail.",
    body: "Start a pipeline on a schedule or a timer, hold it until business hours, read a calendar or a mailbox, ask a model through the gateway and send or draft a message. Each step is an operator you can wire, review and version like any other, and nothing leaves your organisation without the approval you require.",
    shot: "/screens/mlops-agent-builder.webp", shotUrl: "app.tokener.io/mlops/pipelines/edit",
    highlights: [
      { title: "Time as an operator", body: "Cron schedules in a named time zone, interval timers with overlap rules, waits that hold no compute, and business-hours windows with holiday calendars." },
      { title: "Calendars and mail you already use", body: "Google Calendar, Microsoft 365, iCloud and CalDAV for events. Gmail, Microsoft 365, SendGrid, Amazon SES, Mailgun, Postmark, IMAP and SMTP for mail." },
      { title: "Safe by default", body: "Drafts are the default delivery mode. Recipients outside your allowed domains are held for approval, content is redacted, and attendee addresses stay out of prompts unless you opt in." },
    ],
    bullets: ["Cron, daily, weekly and monthly schedules", "Daylight saving handled by IANA time zone", "Missed-run rules: skip, run once or catch up", "Wait for a duration, a time of day or a date", "Business hours with holiday calendars", "Read events and find the first free slot", "Create events with meeting links", "Read unread mail with sender allow-lists", "Send, draft or send after approval", "Every model call is metered under a gateway policy"],
    consoleHref: "/mlops/pipelines", tutorial: "scheduled-briefing-agent",
  },
  {
    slug: "payments", name: "Payment agents", icon: Wallet, scene: "payments",
    short: "Build an agent that creates a payment link, sends it to the customer and waits for the provider to confirm.",
    headline: "Accept payments from an agent, with the compliance built in.",
    body: "Connect MTN Mobile Money, Orange Money, PayPal, a card provider or Bitcoin through BTCPay Server, or add your own provider and define the credentials it needs. The agent creates the payment, generates a link, sends it by SMS or email and holds the order until the provider confirms. Card numbers, wallet PINs and private keys never pass through tok\u2211ner.",
    shot: "/screens/mlops-payments.webp", shotUrl: "app.tokener.io/mlops/pipelines/edit",
    highlights: [
      { title: "Six ways to get paid", body: "MTN MoMo and Orange Money for mobile wallets, PayPal, Visa and Mastercard through Stripe, Adyen, Flutterwave or Paystack, Bitcoin on-chain or Lightning, and a custom provider with any credentials you list." },
      { title: "Confirmed, not assumed", body: "A redirect or a callback is only a hint. Every notification is signature checked and the status is read back from the provider before anything is fulfilled. Underpaid, overpaid, late and duplicate payments are held for review." },
      { title: "Guardrails that cannot be switched off", body: "Signed order requests, an idempotent order reference, a limit per payment, allowed currencies, approval for refunds and for amounts a model produced, and real payments in production off until an admin turns them on." },
    ],
    bullets: ["Provider-hosted pages keep you at the lightest card scope (SAQ A)", "3-D Secure and strong customer authentication stay on", "A pay page for wallets that have no native link, such as MTN MoMo", "Sandbox and live accounts cannot be mixed up: production blocks test currencies and sandbox connections", "Bitcoin address screening, confirmations and a review threshold", "Custom provider: your credentials as secret references, your request body, your webhook signature", "Refunds always wait for an approver", "Audit record for every payment event"],
    consoleHref: "/mlops/pipelines", tutorial: "payment-link-agent",
  },
  {
    slug: "mcp-servers", name: "MCP servers", icon: Blocks, scene: "mcp",
    short: "Connect remote or local Model Context Protocol servers and let agents use their tools, safely.",
    headline: "Tools for agents, under your control.",
    body: "Add a remote server over Streamable HTTP or the older SSE transport, or run a local server on your own build agent over stdio. Choose how it authenticates, which tools agents may use, whether writes wait for a person, and how long calls may run. Tool definitions are pinned, so a server cannot change what a tool does without a review.",
    shot: "/screens/mlops-mcp.webp", shotUrl: "app.tokener.io/mlops/integrations",
    highlights: [
      { title: "Three connection types", body: "Remote over Streamable HTTP, remote over legacy SSE, and local over stdio. Each has its own form, and the policy settings are the same for all." },
      { title: "Every way to authenticate", body: "OAuth 2.1 with PKCE and a pre-registered, metadata-document or dynamically registered client, client credentials, API key or bearer token in a header, basic, mutual TLS, extra headers, and credentials from the environment for local servers." },
      { title: "Approved tools only", body: "Pick the tools agents may call, block others by name, ask a person before anything that changes data, pin definitions by hash and cap result size. Results are redacted and reach a model only through the gateway." },
    ],
    bullets: ["Negotiates the protocol revision at connect time", "Tokens are audience-bound and never forwarded to another server", "Local servers run in a sandbox: container, no or allowlisted network, listed folders only", "Timeouts, concurrency and result size limits", "Optional resources, prompts, sampling and elicitation, off by default", "Audit of every call with tool, caller, duration and size", "Call MCP tool and Read MCP resource operators for the builder"],
    consoleHref: "/mlops/integrations", tutorial: "mcp-tool-agent",
  },
  {
    slug: "custom-mcp-servers", name: "Custom MCP servers", icon: Cable, scene: "mcp",
    short: "Build your own MCP server from pipelines, read-only queries and HTTPS endpoints, then host it here or run it yourself.",
    headline: "Turn what you already run into tools any agent can call.",
    body: "Define tools in the console, each backed by a pipeline, a read-only SQL query, an HTTPS endpoint or a model behind the gateway. Publishing runs the checks, then the control plane serves the server at its own address with access control, a rate limit and an audit record for every call. Prefer to run it yourself? Export a TypeScript or Python project that implements the same tools.",
    shot: "/screens/mlops-mcp.webp", shotUrl: "app.tokener.io/mlops/mcp-servers",
    highlights: [
      { title: "Four kinds of tool", body: "A pipeline for anything that changes data, a read-only query with bound parameters, an HTTPS call with arguments in the path or body, or a model reached through the gateway so policy and budget apply." },
      { title: "Checks before publish", body: "Writes must run a pipeline and wait for approval. SQL tools run one SELECT and nothing else. Private addresses are refused outside development, and a server with no authentication stays in development." },
      { title: "Hosted or exported", body: "Publish to a versioned address with API key, OAuth or mutual TLS access, or download a TypeScript or Python starter project that implements the same tool list." },
    ],
    bullets: ["The tools/list document is previewed exactly as a client will receive it", "Connect instructions for Claude Code, Cursor and other clients", "Argument schemas generated from the fields you define", "Grant people, groups, applications and service accounts access to chosen tools, each with its own rate limit and expiry", "Rate limit per minute and a choice of what the audit record keeps", "Results can be redacted before they reach a model", "Changing a published server returns it to draft until it is checked again"],
    consoleHref: "/mlops/mcp-servers", tutorial: "build-custom-mcp-server",
  },
  {
    slug: "security-and-access", scene: "agent", name: "Security and access", icon: ShieldCheck,
    short: "Roles, secret references, TLS on by default and an audit trail.",
    headline: "Least privilege by default, with reasons when something is blocked.",
    body: "Connections default to read-only and keep TLS verification on. Secrets are stored as references to your secret manager, never as plaintext. A disabled control always tells you why.",
    shot: "/screens/mlops-settings.webp", shotUrl: "app.tokener.io/mlops/settings",
    highlights: [
      { title: "Secret references only", body: "Credentials live in Vault or your cloud secret manager. tok∑ner stores a reference, and never prints, logs or exports the value." },
      { title: "Role matrix", body: "Viewer, developer, approver and admin roles with a visible matrix. Production changes need an approver." },
      { title: "Organisation policy", body: "A kill switch, signed images, allowed registries and approval gates are applied before any run starts." },
    ],
    bullets: ["Per-environment connections that cannot cross environments", "No-auth and TLS-off blocked in production", "Audit log with retention setting", "No host driver, firmware or GPU changes without an authorised agent"],
    consoleHref: "/mlops/settings", tutorial: "secrets-rbac-audit",
  },
];

export const topicBySlug = (slug: string) => MLOPS_TOPICS.find((t) => t.slug === slug);

export const MLOPS_FLOW = [
  { icon: Cable, t: "Connect", d: "Link clusters, registries, data stores and metrics with a read-only, TLS-verified connection." },
  { icon: GitBranch, t: "Build the pipeline", d: "Author on the canvas or in the wizard. Review the plan and manifests." },
  { icon: Rocket, t: "Deploy safely", d: "Canary, approve, promote. Roll back in one step if it goes wrong." },
  { icon: Gauge, t: "Operate", d: "Watch capacity, alerts and cost estimates with a full audit trail." },
] as const;
