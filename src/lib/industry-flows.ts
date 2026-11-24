import { brands } from "@/lib/industry-brands";
import type { Brand } from "@/lib/industries";

export type IndustryFlow = {
  slug: string;
  label: string;
  tagline: string;
  workloads: Brand[];
  controls: string[];
  models: Brand[];
  systems: Brand[];
  example: string;
};

const b = brands;

/** How tok∑ner sits between an industry's workloads and the models and systems around them. Order is the order shown on the site. */
export const INDUSTRY_FLOWS: IndustryFlow[] = [
  {
    slug: "banking", label: "Banking", tagline: "Examiner-ready AI",
    workloads: b("Core banking", "Payments hub", "KYC platform", "Salesforce"),
    controls: ["Region and model allow-lists", "Four-eyes policy approval", "Budgets by line of business", "Hash-chained audit"],
    models: b("Azure OpenAI", "Amazon Bedrock", "vLLM"),
    systems: b("Visa", "Splunk", "Okta", "HashiCorp Vault"),
    example: "A relationship manager asks for a client briefing. The request carries a cost centre, only an in-region model can answer, and the audit record shows the rule that allowed it.",
  },
  {
    slug: "insurance", label: "Insurance", tagline: "Claims with a decision record",
    workloads: b("Claims system", "Policy admin", "Broker portal", "Salesforce"),
    controls: ["Process each document once", "Claim PII masking", "Decision logging", "Human review gates"],
    models: b("Azure OpenAI", "Anthropic", "Amazon Bedrock"),
    systems: b("Amazon S3", "Snowflake", "Splunk", "Okta"),
    example: "A first notice of loss arrives with photos, a form and an email thread. The documents become canonical content once, personal data is masked, and a reviewer approves before the claim moves on.",
  },
  {
    slug: "healthcare", label: "Healthcare", tagline: "Keep patient data inside the lines",
    workloads: b("EHR", "FHIR server", "PACS imaging", "Patient portal"),
    controls: ["Document masking", "In-region routing", "Minimum-necessary prompts", "Immutable audit"],
    models: b("vLLM", "Ollama", "Azure OpenAI"),
    systems: b("Keycloak", "Splunk", "HashiCorp Vault", "Amazon S3"),
    example: "A clinical summarisation service runs on a self-hosted model inside the hospital network. Documents are masked during processing, and every call is attributable to a clinician role.",
  },
  {
    slug: "retail", label: "Retail", tagline: "Survive every peak",
    workloads: b("Shopify", "Order management", "Point of sale", "Zendesk"),
    controls: ["Burst-safe rate limits", "Budgets per campaign", "Model allow-lists", "Automatic failover"],
    models: b("OpenAI", "Google Gemini", "Mistral AI", "Anthropic"),
    systems: b("Stripe", "Snowflake", "Datadog", "Slack"),
    example: "A holiday campaign triples assistant traffic. The campaign budget warns at 80 percent, one provider degrades, and routing shifts to a secondary with no deploy and no customer-visible error.",
  },
  {
    slug: "manufacturing", label: "Manufacturing", tagline: "Inference at the plant",
    workloads: b("MES", "SCADA historian", "Siemens", "Rockwell Automation"),
    controls: ["Edge-first routing", "GPU-aware placement", "Outbound-only agents", "Cost per plant"],
    models: b("NVIDIA", "vLLM", "Ollama", "KServe"),
    systems: b("MQTT", "Prometheus", "Grafana", "Kubernetes"),
    example: "A build agent inside the plant network deploys a vision model next to the line. Metrics flow out, jobs flow in, and nothing opens an inbound port.",
  },
  {
    slug: "logistics", label: "Logistics", tagline: "Paperwork and exceptions, handled",
    workloads: b("Transport management", "Warehouse management", "Telematics", "Carrier APIs"),
    controls: ["Read each document once", "Approval before customer messages", "Edge agents for depots", "Cost per shipment"],
    models: b("Azure OpenAI", "Anthropic", "Mistral AI", "vLLM"),
    systems: b("DHL", "FedEx", "Google Maps", "Apache Kafka"),
    example: "A carrier sends a delay notice with a scanned attachment. The notice is read once, matched to the shipment, and a drafted customer message waits for a dispatcher's approval.",
  },
  {
    slug: "energy", label: "Energy and utilities", tagline: "AI beside the control room, not inside it",
    workloads: b("Grid SCADA", "Asset registry", "Smart meters", "Field service"),
    controls: ["Outbound-only agents", "Self-hosted models", "Cited procedure answers", "Exportable approvals"],
    models: b("vLLM", "NVIDIA", "Ollama", "KServe"),
    systems: b("Siemens", "Schneider Electric", "Prometheus", "Kubernetes"),
    example: "A burst of alarms is grouped and summarised for the on-call engineer by a model running inside the operations network. The raw events stay one click away.",
  },
  {
    slug: "telecom", label: "Telecommunications", tagline: "Carrier-scale conversations, capped and routed",
    workloads: b("OSS and BSS", "Contact centre", "Billing", "Network inventory"),
    controls: ["Budget per channel", "In-country routing", "Automatic failover", "Usage by team"],
    models: b("OpenAI", "Anthropic", "vLLM", "Mistral AI"),
    systems: b("Ericsson", "Nokia", "Twilio", "PagerDuty"),
    example: "An outage triples support chats. Each channel has its own budget, a provider degrades, and the router moves traffic while finance watches cost per resolved contact.",
  },
  {
    slug: "public-sector", label: "Public sector", tagline: "Sovereign and accountable",
    workloads: b("Citizen portal", "Records office", "Permit system", "Case management"),
    controls: ["Sovereign deployment", "Self-hosted models", "Classification labels", "Access reviews"],
    models: b("vLLM", "Ollama", "NVIDIA", "Hugging Face"),
    systems: b("Keycloak", "Elastic", "Kubernetes", "MinIO"),
    example: "A ministry runs the whole stack on its own cluster. Citizen service assistants use in-jurisdiction models, and oversight staff can export who used what and under which rule.",
  },
  {
    slug: "education", label: "Education", tagline: "Tutors grounded in the syllabus",
    workloads: b("Learning platform", "Student records", "Library catalogue", "Admissions"),
    controls: ["Course-scoped retrieval", "Budgets per department", "Student record masking", "Citations required"],
    models: b("OpenAI", "Anthropic", "Ollama", "vLLM"),
    systems: b("Moodle", "Canvas", "Google Classroom", "Zoom"),
    example: "An instructor loads the readings. The course assistant may answer only from them, cites the page, and the department budget warns at 80 percent.",
  },
  {
    slug: "legal", label: "Legal and professional services", tagline: "Matters kept apart, answers cited",
    workloads: b("Document management", "Matter database", "Contract repository", "e-Discovery"),
    controls: ["Matter-scoped retrieval", "Citations required", "Reviewer approval", "Immutable audit"],
    models: b("Anthropic", "Azure OpenAI", "vLLM"),
    systems: b("Box", "Dropbox", "Okta", "Elasticsearch"),
    example: "An associate asks for every termination clause in a data room. Each clause comes back with its page, and the partner approves the memo before it is sent.",
  },
  {
    slug: "enterprise", label: "Enterprise", tagline: "One platform for hundreds of teams",
    workloads: b("SAP", "Salesforce", "Spring", ".NET"),
    controls: ["Tenant isolation", "Chargeback by team", "SSO and group mapping", "Shared policy library"],
    models: b("Azure OpenAI", "OpenAI", "Anthropic", "Amazon Bedrock"),
    systems: b("Okta", "Microsoft Entra ID", "Datadog", "PagerDuty"),
    example: "Central IT publishes approved models and policies. Each business unit gets a tenant, a budget and a view of its own usage, and finance receives the chargeback without a spreadsheet.",
  },
  {
    slug: "startups", label: "Startups", tagline: "Ship fast, never get surprised",
    workloads: b("TypeScript", "Python", "Node.js", "LangChain"),
    controls: ["Per-key budgets", "Automatic failover", "Token alerts", "Model aliases"],
    models: b("OpenAI", "Anthropic", "Google Gemini", "Ollama"),
    systems: b("Slack", "Stripe", "Datadog", "GitHub"),
    example: "A two-person team changes the base URL of an existing OpenAI client, caps each developer key, and swaps models by alias when something cheaper is good enough.",
  },
];
