import {
  siOpenai, siAnthropic, siGooglegemini, siAmazonwebservices, siGooglecloud, siOllama, siHuggingface, siMeta,
  siPerplexity, siNvidia, siOracle, siAlibabacloud, siCloudflare, siDatabricks, siSnowflake, siOkta, siAuth0,
  siKeycloak, siSlack, siPagerduty, siDatadog, siSplunk, siGrafana, siPrometheus, siOpentelemetry, siElastic,
  siGithub, siGitlab, siJira, siStripe, siSalesforce, siPostgresql, siClickhouse, siRedis, siApachekafka, siMilvus,
  siMongodb, siMinio, siDocker, siKubernetes, siTerraform, siArgo, siJenkins, siTwilio, siSendgrid, siZendesk,
  siNotion, siConfluence, siNewrelic, siDynatrace, siSentry, siLangchain, siMlflow, siHarbor, siKnative, siRay,
  siBentoml, siAmazons3, siBitwarden, si1password, siSnyk, siJfrog, siPostman, siVault, siLinux, siOpenid,
  siTypescript, siPython, siGo, siSpring, siDotnet, siNodedotjs,
  siPaypal, siAdyen, siOrange, siBitcoin, siLightning, siVisa, siMastercard, siLinear, siAtlassian, siSupabase, siHubspot, siShopify, siZapier,
  siGmail, siGooglecalendar, siMailgun, siIcloud, siBrevo, siZoom, siCalendly, siGooglemeet,
} from "simple-icons";
import { Cloud, Server, Mail, Inbox, CalendarDays, Smartphone, CreditCard, Plug, Blocks, TerminalSquare, MessageSquare, Globe } from "lucide-react";
import type { IconRef } from "@/components/studio/types";

const si = (i: { title: string; path: string; hex: string }): IconRef => ({ si: i });
const cdn = (slug: string, hex: string, fallback: any): IconRef => ({ cdn: slug, hex, fallback });

export type ConnectorGroupId =
  | "ai-providers" | "self-hosted" | "identity" | "observability" | "notifications" | "email-calendar"
  | "payments" | "mcp" | "data" | "cloud" | "delivery" | "secrets" | "business";

export type ConnectorItem = {
  name: string;
  icon: IconRef;
  note: string;
  /** What the connector does inside tok∑ner. */
  role: string;
};

export type ConnectorGroup = {
  id: ConnectorGroupId;
  label: string;
  blurb: string;
  items: ConnectorItem[];
};

export const CONNECTOR_GROUPS: ConnectorGroup[] = [
  {
    id: "ai-providers",
    label: "AI model providers",
    blurb: "Register once, route by policy, fail over by health, and see what each provider costs you.",
    items: [
      { name: "OpenAI", icon: si(siOpenai), note: "Chat, embeddings, images, audio", role: "Gateway provider" },
      { name: "Anthropic", icon: si(siAnthropic), note: "Claude model family", role: "Gateway provider" },
      { name: "Google Gemini", icon: si(siGooglegemini), note: "Gemini and Vertex AI", role: "Gateway provider" },
      { name: "Amazon Bedrock", icon: si(siAmazonwebservices), note: "Regional model access on AWS", role: "Gateway provider" },
      { name: "Azure OpenAI", icon: cdn("microsoftazure", "0078D4", Cloud), note: "Deployments in your tenant", role: "Gateway provider" },
      { name: "Mistral AI", icon: cdn("mistralai", "FA520F", Server), note: "Hosted and open-weight models", role: "Gateway provider" },
      { name: "DeepSeek", icon: cdn("deepseek", "4D6BFE", Server), note: "OpenAI-compatible endpoint", role: "Gateway provider" },
      { name: "Meta Llama", icon: si(siMeta), note: "Through any compatible host", role: "Gateway provider" },
      { name: "Perplexity", icon: si(siPerplexity), note: "Search-grounded answers", role: "Gateway provider" },
      { name: "Cohere", icon: cdn("cohere", "39594D", Server), note: "Generation and rerank", role: "Gateway provider" },
      { name: "xAI", icon: cdn("x", "000000", Server), note: "Grok models", role: "Gateway provider" },
      { name: "Alibaba Cloud", icon: si(siAlibabacloud), note: "Qwen on Model Studio", role: "Gateway provider" },
    ],
  },
  {
    id: "self-hosted",
    label: "Self-hosted and open models",
    blurb: "Keep sensitive workloads inside your own network behind the same governed endpoint.",
    items: [
      { name: "Ollama", icon: si(siOllama), note: "Local and edge inference", role: "Gateway provider" },
      { name: "vLLM", icon: cdn("vllm", "30A2FF", Server), note: "High-throughput serving", role: "Gateway provider" },
      { name: "LM Studio", icon: cdn("lmstudio", "000000", Server), note: "Desktop and workstation models", role: "Gateway provider" },
      { name: "Hugging Face", icon: si(siHuggingface), note: "Hub models and Inference Endpoints", role: "Gateway provider, registry" },
      { name: "NVIDIA", icon: si(siNvidia), note: "NIM and GPU node scheduling", role: "Gateway provider, GPU" },
      { name: "KServe", icon: cdn("kserve", "326CE5", Server), note: "Kubernetes inference services", role: "MLOps serving target" },
      { name: "Knative", icon: si(siKnative), note: "Scale-to-zero serving", role: "MLOps serving target" },
      { name: "Ray Serve", icon: si(siRay), note: "Distributed Python serving", role: "MLOps serving target" },
      { name: "BentoML", icon: si(siBentoml), note: "Packaged model services", role: "MLOps serving target" },
      { name: "MLflow", icon: si(siMlflow), note: "Model registry and tracking", role: "MLOps registry" },
    ],
  },
  {
    id: "identity",
    label: "Identity and access",
    blurb: "Single sign-on, group mapping and automated provisioning for your workforce and your services.",
    items: [
      { name: "Okta", icon: si(siOkta), note: "OIDC and SCIM", role: "Single sign-on" },
      { name: "Auth0", icon: si(siAuth0), note: "OIDC", role: "Single sign-on" },
      { name: "Keycloak", icon: si(siKeycloak), note: "OIDC and group claims", role: "Single sign-on" },
      { name: "Microsoft Entra ID", icon: cdn("microsoftazure", "0078D4", Cloud), note: "OIDC and group claims", role: "Single sign-on" },
      { name: "Google Workspace", icon: cdn("google", "4285F4", Cloud), note: "OIDC", role: "Single sign-on" },
      { name: "OpenID Connect", icon: si(siOpenid), note: "Any standards-compliant issuer", role: "Single sign-on" },
      { name: "GitHub", icon: si(siGithub), note: "OAuth sign-in", role: "Single sign-on" },
    ],
  },
  {
    id: "observability",
    label: "Observability and audit export",
    blurb: "Stream metrics, traces and audit events to the tools your operations teams already watch.",
    items: [
      { name: "OpenTelemetry", icon: si(siOpentelemetry), note: "OTLP traces and metrics", role: "Export" },
      { name: "Prometheus", icon: si(siPrometheus), note: "Scrape endpoint", role: "Metrics" },
      { name: "Grafana", icon: si(siGrafana), note: "Dashboards", role: "Dashboards" },
      { name: "Datadog", icon: si(siDatadog), note: "Metrics and events", role: "Export" },
      { name: "Splunk", icon: si(siSplunk), note: "HTTP event collector", role: "Audit export" },
      { name: "Elastic", icon: si(siElastic), note: "Bulk index API", role: "Audit export" },
      { name: "New Relic", icon: si(siNewrelic), note: "OTLP ingest", role: "Export" },
      { name: "Dynatrace", icon: si(siDynatrace), note: "OTLP ingest", role: "Export" },
      { name: "Sentry", icon: si(siSentry), note: "Error reporting", role: "Export" },
    ],
  },
  {
    id: "notifications",
    label: "Alerts and notifications",
    blurb: "Budget thresholds, provider health and policy events reach people where they work.",
    items: [
      { name: "Slack", icon: si(siSlack), note: "Channel alerts", role: "Notification channel" },
      { name: "Microsoft Teams", icon: cdn("microsoftteams", "6264A7", Cloud), note: "Channel alerts", role: "Notification channel" },
      { name: "PagerDuty", icon: si(siPagerduty), note: "Incident escalation", role: "Notification channel" },
      { name: "Twilio", icon: si(siTwilio), note: "SMS", role: "Notification channel" },
      { name: "SendGrid", icon: si(siSendgrid), note: "Email delivery", role: "Notification channel" },
      { name: "Jira", icon: si(siJira), note: "Ticket on policy breach", role: "Ticketing" },
      { name: "Zendesk", icon: si(siZendesk), note: "Support tickets", role: "Ticketing" },
      { name: "Webhooks", icon: { lucide: Server }, note: "Signed HTTPS callbacks", role: "Notification channel" },
    ],
  },
  {
    id: "email-calendar",
    label: "Email and calendar",
    blurb: "Let agents read a mailbox, check availability, book time and draft or send mail, with approval where you want it.",
    items: [
      { name: "Gmail", icon: si(siGmail), note: "Read, draft and send", role: "Mail provider" },
      { name: "Microsoft 365 mail", icon: cdn("microsoftoutlook", "0078D4", Mail), note: "Read, draft and send through Graph", role: "Mail provider" },
      { name: "IMAP mailbox", icon: { lucide: Inbox }, note: "Any mailbox over TLS", role: "Mailbox" },
      { name: "SendGrid", icon: si(siSendgrid), note: "Transactional delivery", role: "Mail provider" },
      { name: "Amazon SES", icon: cdn("amazonaws", "FF9900", Mail), note: "Delivery on AWS", role: "Mail provider" },
      { name: "Mailgun", icon: si(siMailgun), note: "US and EU regions", role: "Mail provider" },
      { name: "Postmark", icon: cdn("postmark", "FFDE00", Mail), note: "Transactional streams", role: "Mail provider" },
      { name: "Brevo", icon: si(siBrevo), note: "Delivery and contacts", role: "Mail provider" },
      { name: "SMTP relay", icon: { lucide: Mail }, note: "Any server with TLS", role: "Mail provider" },
      { name: "Google Calendar", icon: si(siGooglecalendar), note: "Events and availability", role: "Calendar" },
      { name: "Microsoft 365 calendar", icon: cdn("microsoftoutlook", "0078D4", CalendarDays), note: "Events and availability", role: "Calendar" },
      { name: "iCloud Calendar", icon: si(siIcloud), note: "Through CalDAV", role: "Calendar" },
      { name: "CalDAV and .ics feeds", icon: { lucide: CalendarDays }, note: "Nextcloud, Fastmail and others", role: "Calendar" },
      { name: "Calendly", icon: si(siCalendly), note: "Scheduling links", role: "Scheduling" },
      { name: "Zoom", icon: si(siZoom), note: "Meeting links on new events", role: "Meetings" },
      { name: "Google Meet", icon: si(siGooglemeet), note: "Meeting links on new events", role: "Meetings" },
    ],
  },
  {
    id: "payments",
    label: "Payments",
    blurb: "Build an agent that creates a payment, sends the customer a link and waits for the provider to confirm it. Credentials stay in your secret manager, card numbers never touch tok\u2211ner, and every provider has a compliance checklist before you go live.",
    items: [
      { name: "MTN Mobile Money", icon: cdn("mtn", "FFCC00", Smartphone), note: "Request to Pay, approved on the customer's phone", role: "Mobile money" },
      { name: "Orange Money", icon: si(siOrange), note: "Web payment with a hosted page", role: "Mobile money" },
      { name: "PayPal", icon: si(siPaypal), note: "Orders v2 with approval link", role: "Wallet and cards" },
      { name: "Visa and Mastercard", icon: si(siVisa), note: "Hosted card pages, 3-D Secure applied", role: "Cards" },
      { name: "Mastercard", icon: si(siMastercard), note: "Through Stripe, Adyen, Flutterwave or Paystack", role: "Cards" },
      { name: "Stripe", icon: si(siStripe), note: "Payment Links and Checkout", role: "Card provider" },
      { name: "Adyen", icon: si(siAdyen), note: "Pay by Link", role: "Card provider" },
      { name: "Flutterwave", icon: cdn("flutterwave", "F5A623", CreditCard), note: "Cards, mobile money and bank in Africa", role: "Card and mobile provider" },
      { name: "Paystack", icon: cdn("paystack", "00C3F7", CreditCard), note: "Cards, mobile money and transfer", role: "Card and mobile provider" },
      { name: "Bitcoin (BTCPay Server)", icon: si(siBitcoin), note: "On-chain to your own wallet", role: "Crypto" },
      { name: "Lightning", icon: si(siLightning), note: "Instant Bitcoin payments through BTCPay", role: "Crypto" },
      { name: "Custom provider", icon: { lucide: Plug }, note: "Any HTTP API, with credentials you define", role: "Custom" },
      { name: "Twilio", icon: si(siTwilio), note: "Text the link", role: "SMS" },
      { name: "Africa's Talking", icon: cdn("africastalking", "F7941D", MessageSquare), note: "SMS across African networks", role: "SMS" },
    ],
  },
  {
    id: "mcp",
    label: "MCP servers",
    blurb: "Connect any Model Context Protocol server, remote or local, and let agents use its tools, resources and prompts. You approve each tool, writes wait for a person, and tool definitions are pinned so a server cannot quietly change what a tool does.",
    items: [
      { name: "Remote, Streamable HTTP", icon: cdn("modelcontextprotocol", "07191E", Blocks), note: "OAuth 2.1 with PKCE, API key, bearer, basic or mTLS", role: "Remote server" },
      { name: "Remote, legacy SSE", icon: { lucide: Globe }, note: "For servers on the older transport", role: "Remote server" },
      { name: "Local process, stdio", icon: { lucide: TerminalSquare }, note: "Runs sandboxed on your build agent", role: "Local server" },
      { name: "GitHub", icon: si(siGithub), note: "Repositories, issues and pull requests", role: "Example server" },
      { name: "Atlassian", icon: si(siAtlassian), note: "Jira and Confluence", role: "Example server" },
      { name: "Linear", icon: si(siLinear), note: "Issues and projects", role: "Example server" },
      { name: "Notion", icon: si(siNotion), note: "Pages and databases", role: "Example server" },
      { name: "Slack", icon: si(siSlack), note: "Channels and messages", role: "Example server" },
      { name: "Sentry", icon: si(siSentry), note: "Errors and releases", role: "Example server" },
      { name: "PostgreSQL", icon: si(siPostgresql), note: "Read-only queries", role: "Example server" },
      { name: "Stripe", icon: si(siStripe), note: "Customers and invoices", role: "Example server" },
      { name: "Cloudflare", icon: si(siCloudflare), note: "Workers and DNS", role: "Example server" },
      { name: "Supabase", icon: si(siSupabase), note: "Databases and storage", role: "Example server" },
      { name: "HubSpot", icon: si(siHubspot), note: "Contacts and deals", role: "Example server" },
      { name: "Shopify", icon: si(siShopify), note: "Products and orders", role: "Example server" },
      { name: "Zapier", icon: si(siZapier), note: "Actions across thousands of apps", role: "Example server" },
    ],
  },
  {
    id: "data",
    label: "Data, vector and streaming",
    blurb: "Connect the stores your retrieval, analytics and event pipelines already depend on.",
    items: [
      { name: "PostgreSQL", icon: si(siPostgresql), note: "Relational and pgvector", role: "Data and vector store" },
      { name: "ClickHouse", icon: si(siClickhouse), note: "Usage analytics", role: "Analytics store" },
      { name: "Redis", icon: si(siRedis), note: "Cache and rate limits", role: "Cache" },
      { name: "Apache Kafka", icon: si(siApachekafka), note: "Event streams", role: "Streaming" },
      { name: "Milvus", icon: si(siMilvus), note: "Vector search", role: "Vector store" },
      { name: "Qdrant", icon: cdn("qdrant", "DC244C", Server), note: "Vector search", role: "Vector store" },
      { name: "Weaviate", icon: cdn("weaviate", "00C781", Server), note: "Vector search", role: "Vector store" },
      { name: "MongoDB", icon: si(siMongodb), note: "Document store", role: "Data store" },
      { name: "Amazon S3", icon: si(siAmazons3), note: "Object storage", role: "Document storage" },
      { name: "MinIO", icon: si(siMinio), note: "S3-compatible storage", role: "Document storage" },
      { name: "Snowflake", icon: si(siSnowflake), note: "Warehouse export", role: "Export" },
      { name: "Databricks", icon: si(siDatabricks), note: "Lakehouse export", role: "Export" },
    ],
  },
  {
    id: "cloud",
    label: "Clouds and infrastructure",
    blurb: "Deploy inference where your data lives, on clusters you own or servers behind a build agent.",
    items: [
      { name: "Kubernetes", icon: si(siKubernetes), note: "Any conformant cluster", role: "Deployment target" },
      { name: "Amazon Web Services", icon: si(siAmazonwebservices), note: "EKS, ECR, S3, IAM", role: "Deployment target" },
      { name: "Microsoft Azure", icon: cdn("microsoftazure", "0078D4", Cloud), note: "AKS, ACR, Blob", role: "Deployment target" },
      { name: "Google Cloud", icon: si(siGooglecloud), note: "GKE, Artifact Registry, GCS", role: "Deployment target" },
      { name: "Oracle Cloud", icon: si(siOracle), note: "OKE", role: "Deployment target" },
      { name: "Cloudflare", icon: si(siCloudflare), note: "Edge and R2", role: "Edge, storage" },
      { name: "Docker", icon: si(siDocker), note: "Single-host containers", role: "Deployment target" },
      { name: "Linux servers", icon: si(siLinux), note: "Through a build agent", role: "Deployment target" },
      { name: "Harbor", icon: si(siHarbor), note: "OCI registry", role: "Registry" },
    ],
  },
  {
    id: "delivery",
    label: "Delivery and automation",
    blurb: "Fit promotion, policy and rollback into the pipelines your engineers already trust.",
    items: [
      { name: "GitHub Actions", icon: si(siGithub), note: "Promote and verify in CI", role: "CI" },
      { name: "GitLab CI", icon: si(siGitlab), note: "Promote and verify in CI", role: "CI" },
      { name: "Jenkins", icon: si(siJenkins), note: "Pipeline steps", role: "CI" },
      { name: "Argo CD", icon: si(siArgo), note: "GitOps handoff", role: "GitOps" },
      { name: "Terraform", icon: si(siTerraform), note: "Declarative configuration", role: "Infrastructure as code" },
      { name: "JFrog", icon: si(siJfrog), note: "Artifact registry", role: "Registry" },
      { name: "Snyk", icon: si(siSnyk), note: "Image scan results", role: "Security" },
      { name: "Postman", icon: si(siPostman), note: "Collections and tests", role: "API testing" },
      { name: "LangChain", icon: si(siLangchain), note: "Use the gateway as the model URL", role: "Framework" },
    ],
  },
  {
    id: "secrets",
    label: "Secrets and key management",
    blurb: "Credentials stay in your vault. tok∑ner resolves references at the moment of use and never stores them.",
    items: [
      { name: "HashiCorp Vault", icon: si(siVault), note: "KV and dynamic secrets", role: "Secret store" },
      { name: "AWS Secrets Manager", icon: si(siAmazonwebservices), note: "Secret references", role: "Secret store" },
      { name: "Azure Key Vault", icon: cdn("microsoftazure", "0078D4", Cloud), note: "Secret references", role: "Secret store" },
      { name: "Google Secret Manager", icon: si(siGooglecloud), note: "Secret references", role: "Secret store" },
      { name: "1Password", icon: si(si1password), note: "Service accounts", role: "Secret store" },
      { name: "Bitwarden", icon: si(siBitwarden), note: "Secrets manager", role: "Secret store" },
    ],
  },
  {
    id: "business",
    label: "Business systems",
    blurb: "Meter AI usage into the systems that bill, document and plan the work.",
    items: [
      { name: "Stripe", icon: si(siStripe), note: "Usage-based invoicing", role: "Billing" },
      { name: "Salesforce", icon: si(siSalesforce), note: "Account and cost allocation", role: "CRM" },
      { name: "Notion", icon: si(siNotion), note: "Runbooks and decisions", role: "Docs" },
      { name: "Confluence", icon: si(siConfluence), note: "Runbooks and decisions", role: "Docs" },
    ],
  },
];

export const CONNECTOR_COUNT = CONNECTOR_GROUPS.reduce((n, g) => n + g.items.length, 0);

/** Client libraries and SDK languages, shown as a strip on the connectors page. */
export const SDK_LANGS: { name: string; icon: IconRef }[] = [
  { name: "Python", icon: si(siPython) },
  { name: "TypeScript", icon: si(siTypescript) },
  { name: "Node.js", icon: si(siNodedotjs) },
  { name: "Go", icon: si(siGo) },
  { name: "Spring", icon: si(siSpring) },
  { name: ".NET", icon: si(siDotnet) },
];
