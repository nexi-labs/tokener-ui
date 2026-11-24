/**
 * Long-form content for each industry page. The short card copy lives in SOLUTIONS (lib/site.ts); this adds the
 * reading that sits underneath: why the sector is hard, what the platform changes, the standards teams map controls to,
 * and the questions buyers ask first.
 */
export type IndustryContent = {
  /** Key into the drawings in IndustryArt. */
  art: string;
  /** Opening essay, three or four paragraphs. */
  intro: string[];
  /** The pressures that make AI harder here than elsewhere. */
  pressures: { title: string; body: string }[];
  /** What changes on the platform, written for this sector. */
  capabilities: { title: string; body: string; area: string }[];
  /** Frameworks and requirements teams commonly map their controls to. This is a reading list, not a claim of certification. */
  standards: { name: string; note: string }[];
  /** Systems customers commonly connect, grouped. Names resolve through industry-brands. */
  systems: { label: string; names: string[] }[];
  faqs: { q: string; a: string }[];
  /** Slug of the use case that best shows the sector. */
  flagship: string;
};

export const INDUSTRY_CONTENT: Record<string, IndustryContent> = {
  banking: {
    art: "banking",
    intro: [
      "A bank is a collection of promises that can be audited. Every decision about a customer, a payment or a limit has to be explained later to a regulator, a court or the customer. When a language model joins that chain, the same standard applies, and most early pilots stall right there. Nobody can say which model saw which customer data, under what rule, and at what cost.",
      "The usual response is a committee that approves each model and each use, then a long wait while each team builds its own controls. The result is a handful of safe but shallow pilots and a growing group of staff using consumer tools because the sanctioned route is too slow.",
      "tok∑ner moves the control point out of every application and into one place. Applications call a single, OpenAI-compatible endpoint. Identity, policy, budget and routing are decided there, and the decision is written to an append-only record. Model risk teams see an inventory that is built from traffic rather than from questionnaires. Finance sees spend by line of business. Security sees one set of rules, versioned and approved by two people before it takes effect.",
      "That is what lets a bank say yes to a team on Monday and show an examiner on Friday exactly what the team did.",
    ],
    pressures: [
      { title: "Model risk management", body: "Supervisory guidance expects an inventory of models, evidence of validation and monitoring of use. Models change faster than review cycles, so the inventory has to be a by-product of operation rather than a spreadsheet." },
      { title: "Data residency and confidentiality", body: "Customer and trading data may only be processed in approved places. A prompt is data, and it needs the same routing rules as a database export." },
      { title: "Operational resilience", body: "Critical services need a tested answer when a provider fails. Hard-coded provider names in application code make that answer slow and risky." },
      { title: "Cost accountability", body: "Each line of business expects to see and defend its own spend. A shared provider account hides who used what." },
    ],
    capabilities: [
      { area: "Policy engine", title: "Rules that an examiner can read", body: "Model and region allow-lists, token and cost limits and time-of-day rules are written once, simulated against real traffic and published only after a second approver signs." },
      { area: "Audit", title: "Evidence that cannot be edited", body: "Each change records who made it, who approved it and the state before and after. Each request records the rule that allowed or denied it." },
      { area: "Documents", title: "Customer files masked once", body: "Statements, contracts and identity documents are scanned, read and masked during processing, then reused by every model and workflow." },
      { area: "Cost", title: "Chargeback by line of business", body: "Budgets warn, throttle or block at thresholds, and reports allocate spend to cost centres without a manual reconciliation." },
    ],
    standards: [
      { name: "SR 11-7 and SS1/23", note: "Supervisory expectations for model risk management and inventory." },
      { name: "DORA", note: "Operational resilience and third-party risk for EU financial entities." },
      { name: "GDPR and local banking secrecy law", note: "Lawful processing, residency and the right to explanation." },
      { name: "PCI DSS", note: "Card data handling, relevant where payment data meets prompts." },
      { name: "SOX", note: "Change control and evidence for systems that touch reporting." },
    ],
    systems: [
      { label: "Core and payments", names: ["Core banking", "Payments hub", "Card processor", "Visa", "Mastercard"] },
      { label: "Risk and compliance", names: ["KYC platform", "AML monitoring", "Splunk", "Snowflake"] },
      { label: "Identity and secrets", names: ["Okta", "Microsoft Entra ID", "HashiCorp Vault", "Azure Key Vault"] },
    ],
    faqs: [
      { q: "Can we keep customer data in our region?", a: "Yes. Region and provider allow-lists are policy rules. A request that would leave the region is refused, and self-hosted models can serve the sensitive work." },
      { q: "How do we answer a model inventory request?", a: "Every model that has served traffic appears in the registry with its provider, versions, owners and usage. The same data feeds the audit export." },
      { q: "Who can change a policy?", a: "Anyone with the right role can propose it. A different person approves it, and the platform records both." },
    ],
    flagship: "banking-relationship-briefing",
  },

  insurance: {
    art: "insurance",
    intro: [
      "Insurance runs on documents. A claim is a form, photographs, a repair estimate, a police report, a medical letter and an email thread. An underwriting file is bigger. Most of the labour in the industry is reading, summarising, comparing and deciding, which is exactly the work language models are good at and exactly the work regulators watch closely.",
      "The risk is not that a model reads a claim. The risk is that the same document is read five times by five tools, each with its own copy of the personal data, and that a decision is made without a record of what the model saw or what the human changed.",
      "With tok∑ner each document is scanned, read and masked once into a canonical record. Summaries, field extraction and fraud signals all reuse that record instead of reprocessing the file. A reviewer sees the model's proposal next to the evidence, approves or edits it, and the decision, the sources and the reviewer are stored with the claim.",
      "The effect is faster first review, lower processing cost and a decision file that stands up when a claim is disputed.",
    ],
    pressures: [
      { title: "Document volume and variety", body: "Photos, scans, handwriting and email threads arrive in every quality. Extraction has to cope with all of them and show its confidence." },
      { title: "Fair treatment and explainability", body: "Claims decisions affect people directly. Regulators expect that a person can understand and challenge an outcome." },
      { title: "Sensitive personal data", body: "Claims contain health, financial and identity information that must be limited to the people and tools that need it." },
      { title: "Fraud pressure", body: "Fraud teams want models to flag patterns, but a flag must never become a denial without a human decision." },
    ],
    capabilities: [
      { area: "Documents", title: "Read once, reuse everywhere", body: "OCR, extraction and masking happen once per file. Later steps use the stored result and the platform records the content hash, so a duplicate is never processed twice." },
      { area: "Pipelines", title: "Human review built into the flow", body: "An approval gate sits between the model's proposal and any change to the claim. The reviewer, the time and the note are part of the run record." },
      { area: "Policy", title: "Scope what each tool may see", body: "Rules limit which models may receive claim content and which fields are allowed in a prompt." },
      { area: "Cost", title: "Spend per line and per claim", body: "Usage is metered by team and by workflow, so cost per claim handled is a number rather than an estimate." },
    ],
    standards: [
      { name: "NAIC Model Bulletin on AI", note: "Governance expectations for insurers using AI systems in the United States." },
      { name: "EU AI Act", note: "Risk-based obligations, with life and health pricing and underwriting treated as high risk." },
      { name: "Solvency II governance", note: "System of governance and outsourcing expectations in the EU." },
      { name: "GDPR and HIPAA where applicable", note: "Special category data handling in claims files." },
    ],
    systems: [
      { label: "Core insurance systems", names: ["Claims system", "Policy admin", "Broker portal", "Salesforce"] },
      { label: "Data and storage", names: ["Amazon S3", "Snowflake", "Elastic", "PostgreSQL"] },
      { label: "Operations", names: ["Splunk", "Okta", "Jira", "Slack"] },
    ],
    faqs: [
      { q: "Does a model ever decide a claim?", a: "Not unless you build it that way. The standard pipeline places an approval gate before any change, and the platform records who approved it." },
      { q: "How is duplicate processing avoided?", a: "Documents are identified by content hash. A file that has been processed is reused, and its masked canonical form is what models see." },
      { q: "Can adjusters see why a summary says what it says?", a: "Summaries carry references to the pages and fields they came from, so the adjuster can check the source." },
    ],
    flagship: "insurance-claims-intake",
  },

  healthcare: {
    art: "healthcare",
    intro: [
      "Healthcare organisations hold some of the most sensitive data there is, and they also carry some of the heaviest administrative load. Clinicians spend hours on notes, letters and authorisations. Researchers read more literature than any person can. The case for language models is strong and the obstacle is trust: where does the data go, who can see it and what happens when the model is wrong.",
      "The answer cannot be a promise from a vendor. It has to be an architecture. Sensitive work should run on models inside the network. Documents should be masked before anything leaves the building. Each call should be attributable to a role. Anything that touches a patient record should pass a human before it changes it.",
      "tok∑ner is built for that shape. It runs inside your environment, including with no outbound connectivity. It routes by sensitivity: routine summaries go to a self-hosted model, and only approved tasks may use a hosted one. It records every call, and its pipeline builder puts a clinician approval step in front of any write to a record.",
      "Clinical judgement stays with clinicians. The platform removes the clerical work around it and keeps the evidence that the rules were followed.",
    ],
    pressures: [
      { title: "Protected health information", body: "Identifiers in notes, images and letters must be limited to the minimum necessary and kept inside approved boundaries." },
      { title: "Patient safety", body: "A fluent but wrong summary is dangerous. Outputs need sources, and writes to a chart need a person." },
      { title: "Fragmented systems", body: "Records sit in an EHR, imaging archives, lab systems and scanned paper. Integration has to respect each system's access model." },
      { title: "Limited IT capacity", body: "Hospital teams cannot afford a new platform that needs a dedicated crew. Operation must be light." },
    ],
    capabilities: [
      { area: "Documents", title: "Scanned records made usable", body: "OCR reads faxes and scans, and masking runs during processing, so the text that models see has been reduced to what is needed." },
      { area: "Routing", title: "Sensitive work stays on your models", body: "Policy sends categories of request to vLLM or Ollama inside the network and blocks them from hosted providers." },
      { area: "Deployment", title: "Air-gapped when required", body: "The platform runs with no outbound connectivity and with outbound-only build agents for model delivery." },
      { area: "Pipelines", title: "A clinician in the loop", body: "Approval gates, separation of duties and rollback paths are checked before a pipeline can run in production." },
    ],
    standards: [
      { name: "HIPAA Security and Privacy Rules", note: "Safeguards for protected health information in the United States." },
      { name: "GDPR Article 9", note: "Special category data, lawful basis and data minimisation." },
      { name: "HL7 FHIR", note: "A common way to exchange clinical data with the systems around the platform." },
      { name: "EU AI Act and medical device rules", note: "Software that informs clinical decisions may fall under device regulation." },
    ],
    systems: [
      { label: "Clinical systems", names: ["EHR", "FHIR server", "PACS imaging", "Lab system", "Pharmacy system"] },
      { label: "Patient and research", names: ["Patient portal", "PubMed", "Elsevier", "Amazon S3"] },
      { label: "Security", names: ["Keycloak", "HashiCorp Vault", "Splunk", "Okta"] },
    ],
    faqs: [
      { q: "Can everything run inside our network?", a: "Yes. Models, gateway, documents and audit can all run on your infrastructure, and the platform supports deployments with no outbound connectivity." },
      { q: "Does the platform change a patient record?", a: "Only through a pipeline you build, and production pipelines that write to a record need an approval gate before they can run." },
      { q: "How do we limit what a model sees?", a: "Documents are masked during processing, and policy limits which models may receive which classes of request." },
    ],
    flagship: "healthcare-clinical-summaries",
  },

  retail: {
    art: "retail",
    intro: [
      "Retail is a business of peaks. A campaign, a holiday or a viral product can multiply traffic in an hour, and customers do not wait. An assistant that answers sizing questions, recommends a gift or handles a return is only valuable if it is there at the moment of the peak, and only affordable if its cost per conversation is known.",
      "Most retail teams meet the same three surprises. A provider slows down at the worst time. A campaign assistant spends a quarter's budget in a weekend. And five different teams have five different provider contracts and keys that nobody can map to revenue.",
      "tok∑ner puts one gateway in front of every assistant. Rate limits and per-campaign budgets absorb a burst. The router moves traffic to a secondary provider when the primary degrades, with no deploy. Marketing sees spend per campaign and engineering sees latency and errors in the same console. Product copy, support answers and personalisation share the same controls.",
      "The aim is simple: an assistant that stays up during the peak, stays inside its budget and can be shown to pay for itself.",
    ],
    pressures: [
      { title: "Peak demand", body: "Traffic can triple in minutes. Limits, queues and fallbacks have to be in place before the campaign starts." },
      { title: "Margin pressure", body: "A conversation that costs more than the order it supports is not a business. Cost per conversation has to be visible and bounded." },
      { title: "Brand and accuracy", body: "Assistants speak for the brand. They must answer from the catalogue and policies, not from guesswork." },
      { title: "Payments and personal data", body: "Assistants that take an order sit close to payment and customer data and must keep both out of prompts." },
    ],
    capabilities: [
      { area: "Gateway", title: "Burst-safe by design", body: "Per-key and per-project rate limits, retries and timeouts keep a spike from becoming an outage." },
      { area: "Routing", title: "Failover with no deploy", body: "Health-aware routing moves traffic to a secondary provider when error rates or latency cross a threshold." },
      { area: "Budgets", title: "A budget per campaign", body: "Each campaign has a cap, a warning at 80 percent and an owner who is told in Slack." },
      { area: "Pipelines", title: "Payment links without card data", body: "Pipelines create a payment with your provider and send the customer a link, so card numbers never enter a prompt or a log." },
    ],
    standards: [
      { name: "PCI DSS", note: "Keep card data out of prompts, logs and model providers." },
      { name: "GDPR and CCPA", note: "Consent, access and deletion for customer data used in personalisation." },
      { name: "Consumer protection and advertising rules", note: "Claims made by an assistant are claims made by the brand." },
    ],
    systems: [
      { label: "Commerce", names: ["Shopify", "Magento", "WooCommerce", "Order management", "Point of sale"] },
      { label: "Customer", names: ["Zendesk", "Salesforce", "HubSpot", "Intercom", "WhatsApp"] },
      { label: "Payments and data", names: ["Stripe", "Adyen", "Klarna", "Snowflake"] },
    ],
    faqs: [
      { q: "What happens when a provider is slow during a sale?", a: "The router retries on the next provider according to your rules, so customers see an answer rather than an error." },
      { q: "Can marketing see its own spend?", a: "Yes. Budgets and reports are scoped by project, so each campaign owner sees only their own usage." },
      { q: "Do card numbers ever reach a model?", a: "Not through the payment operators. They create a payment with your provider and send a link, and the provider holds the card data." },
    ],
    flagship: "retail-peak-assistant",
  },

  manufacturing: {
    art: "manufacturing",
    intro: [
      "A factory is the opposite of a data centre. The networks are segmented on purpose, the systems are decades old, the people on the floor want answers in seconds and the cost of a wrong answer is a stopped line. Cloud-only AI does not fit, and a pile of ad hoc models on local servers is just as hard to govern.",
      "Manufacturers need two things at once. They need models that run beside the line, where latency is low and the data stays put. And they need the same discipline across forty plants that they expect from the rest of their engineering: versions, approvals, rollbacks and a record of who deployed what.",
      "tok∑ner supplies both. A build agent inside the plant network asks for work over an outbound connection, so nothing listens on an inbound port. Models are built, scanned and approved centrally and delivered to each site by a signed job. Technician copilots answer from local manuals on local models. Metrics flow out, and the central team sees which plants run which versions.",
      "The line keeps running when the link is down, and the head office still knows what is deployed.",
    ],
    pressures: [
      { title: "Isolated networks", body: "Operational technology networks are segmented for safety. Anything that needs an inbound path from the internet will be refused." },
      { title: "Scarce GPU capacity", body: "Accelerators are expensive and unevenly spread. Placement has to be planned and checked, not discovered at deploy time." },
      { title: "Many sites, many versions", body: "Without central control, plants drift to different model versions and nobody can say which one made a decision." },
      { title: "Tacit knowledge", body: "Procedures and fault histories live in manuals and in the heads of long-serving technicians." },
    ],
    capabilities: [
      { area: "MLOps", title: "Outbound-only agents", body: "The agent polls for work over HTTPS, verifies each job's signature and runs it next to your systems, then reports a scrubbed result." },
      { area: "Pipelines", title: "Release with a gate", body: "Build, scan, register, approve, canary, verify and promote, with an automatic rollback if an objective is breached." },
      { area: "Routing", title: "Edge first, cloud when allowed", body: "Policy keeps routine work on the local model and permits a hosted one only where you decide." },
      { area: "Observability", title: "Versions and health per site", body: "Deployment records, GPU use and endpoint health appear for every plant in one console." },
    ],
    standards: [
      { name: "IEC 62443", note: "Security for industrial automation and control systems." },
      { name: "ISO 9001 and ISO 13849", note: "Quality management and machine safety context for models near the line." },
      { name: "NIST AI RMF", note: "A common language for mapping, measuring and managing AI risk." },
      { name: "EU Machinery Regulation", note: "Safety obligations for machinery with AI components." },
    ],
    systems: [
      { label: "Plant systems", names: ["MES", "SCADA historian", "PLC network", "CMMS", "Quality system"] },
      { label: "Engineering", names: ["Siemens", "Rockwell Automation", "Dassault Systemes", "Autodesk", "Ansys"] },
      { label: "Platform", names: ["Kubernetes", "NVIDIA", "MQTT", "Apache Kafka"] },
    ],
    faqs: [
      { q: "Do we need to open inbound ports to the plant?", a: "No. The agent makes outbound HTTPS calls only, and it refuses a job whose signature does not verify." },
      { q: "What if a plant loses connectivity?", a: "Models already deployed keep serving locally. The agent reports and picks up work when the link returns." },
      { q: "Can we roll a model back across many sites?", a: "Yes. Each site's deployment has a previous version recorded, and a rollback is a normal pipeline run with an audit entry." },
    ],
    flagship: "manufacturing-technician-copilot",
  },

  logistics: {
    art: "logistics",
    intro: [
      "Logistics moves goods, and the goods are always accompanied by paper: bills of lading, commercial invoices, packing lists, customs declarations, delivery notes and a stream of emails from carriers, brokers and warehouses. Much of the cost of moving freight is the cost of reading, keying and chasing that paper, and much of the pain is in the exceptions, the delays, the damage and the missed windows.",
      "Language models read paper well. The problem is trust and control. A model that drafts a message to a customer about a delay is useful. A model that sends it without a dispatcher seeing it is a risk. A model that runs only in the cloud is useless in a depot with a bad connection.",
      "tok∑ner treats each of these as a pipeline you can inspect. Documents are read once into canonical records. A model proposes the impact on the delivery promise and drafts the message. A dispatcher approves it. The notice, the decision and the message are stored against the shipment. At depots and cross-docks, outbound-only agents run models next to the warehouse system.",
      "The result is fewer manual touches, faster exceptions and a record of every decision made on a shipment.",
    ],
    pressures: [
      { title: "Documents from everywhere", body: "Hundreds of partners send documents in different layouts and languages. Template-based extraction breaks as soon as a partner changes a form." },
      { title: "Time-critical exceptions", body: "A delay or damage report loses value by the hour. Someone has to decide, and decide with the facts in front of them." },
      { title: "Patchy connectivity", body: "Depots, ports and trucks lose connection. Systems that need a constant cloud link stall." },
      { title: "Thin margins", body: "Every manual touch costs money, and so does an expensive model call. Both need to be counted per shipment." },
    ],
    capabilities: [
      { area: "Documents", title: "Messy paper into clean records", body: "OCR, extraction and canonical storage handle scans and photographs, and each file is processed once." },
      { area: "Pipelines", title: "Exceptions with an owner", body: "A pipeline reads the notice, matches the shipment, drafts the message and waits for a dispatcher before sending by email or text." },
      { area: "MLOps", title: "Models at the depot", body: "Outbound-only agents deploy and run models beside the warehouse system, and keep serving when the link drops." },
      { area: "Cost", title: "Cost per shipment", body: "Usage is metered by workflow, so teams can see what each exception costs to handle." },
    ],
    standards: [
      { name: "Customs data requirements", note: "Accurate declarations are the importer's responsibility, so extracted fields need a review step." },
      { name: "GDPR", note: "Driver, consignee and recipient details are personal data." },
      { name: "ISO 28000", note: "Security management for supply chains." },
      { name: "Dangerous goods rules", note: "ADR, IMDG and IATA documents must be extracted with high confidence and human sign-off." },
    ],
    systems: [
      { label: "Operations", names: ["Transport management", "Warehouse management", "Telematics", "Route planner"] },
      { label: "Carriers and maps", names: ["DHL", "FedEx", "UPS", "Google Maps", "HERE", "Mapbox"] },
      { label: "Business", names: ["SAP", "Salesforce", "Apache Kafka", "Slack"] },
    ],
    faqs: [
      { q: "Can a message go to a customer without approval?", a: "Only if you build it that way. The standard exception pipeline puts an approval step before any email or text is sent." },
      { q: "How does it handle a new partner's document layout?", a: "Extraction is model-based rather than template-based, and low-confidence fields are routed to a reviewer." },
      { q: "Does it work at a depot with a poor connection?", a: "A local model keeps serving. The agent syncs usage and results when the connection returns." },
    ],
    flagship: "logistics-exception-desk",
  },

  energy: {
    art: "energy",
    intro: [
      "Energy and utility operators run systems that society depends on. Their networks are isolated for good reason, their equipment lasts for decades, and their people work from thick procedure binders under time pressure. A language model that can find the right page in a maintenance manual, or turn a flood of alarms into a short briefing, would help every shift. A model that opens a path into the control network would be unacceptable.",
      "That is the design constraint. AI has to arrive beside the control room rather than inside it, it has to run on infrastructure the operator owns, and every use has to be attributable to a person and a purpose.",
      "tok∑ner deploys that way. Build agents inside the operations network make outbound connections only and verify every job. Models run on the operator's own servers. Retrieval over procedures, permits and inspection reports returns the answer with the page cited. Alarm summaries show the raw events one click away. Approvals, answers and policy changes are exportable when a regulator asks.",
      "Operators gain a fast, grounded assistant and keep the isolation their safety case depends on.",
    ],
    pressures: [
      { title: "Critical infrastructure rules", body: "Operators are subject to security obligations that treat operational networks as high value targets. New software must not widen the attack surface." },
      { title: "Information overload", body: "A fault can produce hundreds of alarms. Finding the cause in the noise takes experience and time." },
      { title: "Ageing workforce, long equipment life", body: "Knowledge sits in manuals and in the memory of staff who are retiring." },
      { title: "Decision records", body: "Regulators and insurers ask what was known and what was done during an incident." },
    ],
    capabilities: [
      { area: "MLOps", title: "No inbound path", body: "Outbound-only agents, signed jobs, an allowlist of actions and scrubbed results keep the operations network closed." },
      { area: "Retrieval", title: "Procedures that answer with a page number", body: "Manuals, permits and inspection reports are indexed, and each answer cites its sources so a technician can verify it." },
      { area: "Pipelines", title: "Alarm floods in one paragraph", body: "A stream source groups related alarms and a model writes a short briefing for the on-call engineer." },
      { area: "Audit", title: "A record that stands up", body: "Model calls, approvals and policy changes are recorded and can be exported for a regulator." },
    ],
    standards: [
      { name: "NERC CIP", note: "Cyber security requirements for the North American bulk electric system." },
      { name: "NIS2", note: "Security and incident reporting duties for essential entities in the EU." },
      { name: "IEC 62443", note: "Industrial automation and control systems security." },
      { name: "ISO 55000", note: "Asset management context for maintenance assistants." },
    ],
    systems: [
      { label: "Operations", names: ["Grid SCADA", "Asset registry", "Smart meters", "Outage management", "Field service"] },
      { label: "Vendors", names: ["Siemens", "Schneider Electric", "General Electric", "Shell"] },
      { label: "Platform", names: ["Kubernetes", "Prometheus", "Grafana", "NVIDIA"] },
    ],
    faqs: [
      { q: "Does anything in the platform connect into our control network?", a: "No. The agent makes outbound HTTPS requests to fetch signed work and report results. It does not listen on a port." },
      { q: "Can answers be checked?", a: "Retrieval answers include the source documents and pages, so a person can open the original." },
      { q: "Can the whole stack run on our hardware?", a: "Yes, including models served with vLLM or on NVIDIA hardware, and including deployments with no outbound connectivity." },
    ],
    flagship: "energy-procedure-assistant",
  },

  telecom: {
    art: "telecom",
    intro: [
      "A carrier talks to its customers more than almost any other business. Billing questions, plan changes, outages, device problems and roaming all arrive through chat, voice and messaging, in volumes that move with every network incident and every promotion. At the same time, the network itself produces more events than any team can read.",
      "Language models help on both fronts. They can answer routine questions from the billing record, assist agents with the next best step and condense an alarm storm into an incident summary. The challenge is doing so at carrier scale: millions of calls, tight margins, strict rules about customer data and an expectation of near-perfect availability.",
      "tok∑ner gives each channel its own budget and policy so chat cannot starve agent-assist. It routes around provider incidents automatically. It keeps customer data in country by routing to approved regions and to models you host. And it shows cost per resolved contact by channel, which is the number the business actually manages.",
      "The same control plane serves customer care and network operations, so the people who run the network and the people who talk to its users work from one source of truth.",
    ],
    pressures: [
      { title: "Spiky volume", body: "An outage or a launch can multiply contacts within minutes. Capacity and cost both need guard rails." },
      { title: "Alarm and ticket floods", body: "Network operations centres receive far more events than staff can triage by hand." },
      { title: "Customer data rules", body: "Call detail records and billing data are regulated and often must remain in country." },
      { title: "Unit economics", body: "Margins on care are thin. Each contact has a cost target that a model call must fit inside." },
    ],
    capabilities: [
      { area: "Budgets", title: "A cap for every channel", body: "Chat, voice and agent-assist each have a budget, thresholds and an owner, so one cannot consume another." },
      { area: "Routing", title: "Automatic failover", body: "When a provider times out the router retries on the next one according to your rules, with no deploy." },
      { area: "Pipelines", title: "Incident triage", body: "A stream source groups alarms by cause and a model writes a briefing with the evidence linked." },
      { area: "Observability", title: "Cost per resolved contact", body: "Events stream to your analytics store, so dashboards show spend, latency and outcomes together." },
    ],
    standards: [
      { name: "GDPR and ePrivacy", note: "Customer communications data and traffic data have specific protections." },
      { name: "NIS2 and national telecom security laws", note: "Network security and incident reporting for operators." },
      { name: "TM Forum frameworks", note: "Common process and data models for operators." },
      { name: "Lawful intercept and data retention rules", note: "Record keeping obligations that shape what may be stored." },
    ],
    systems: [
      { label: "Operations", names: ["OSS and BSS", "Network inventory", "Radio network", "Trouble tickets"] },
      { label: "Customer", names: ["Contact centre", "Billing", "Twilio", "WhatsApp", "Zendesk"] },
      { label: "Vendors", names: ["Ericsson", "Nokia", "Huawei", "Cisco"] },
    ],
    faqs: [
      { q: "How do we stop chat from using the whole budget?", a: "Each channel is a project with its own budget and rate limits. Reaching one project's cap does not affect another." },
      { q: "Can customer data stay in country?", a: "Yes. Region allow-lists and self-hosted models keep requests inside approved boundaries." },
      { q: "Can network operations use the same platform as care?", a: "Yes. Both use the gateway and pipelines, with separate projects, budgets and roles." },
    ],
    flagship: "telecom-care-assistant",
  },

  "public-sector": {
    art: "public-sector",
    intro: [
      "Public bodies serve everyone, and they answer for how they do it. A benefits office, a licensing agency or a ministry cannot treat a language model as an experiment. Citizens deserve clear answers, staff deserve tools that help, and oversight bodies deserve a record of what automated systems did and why.",
      "Procurement adds its own constraints. Agencies need to avoid lock-in to any one provider, to keep data inside their jurisdiction and to be able to replace a supplier without rewriting every service. They also need to show their work to auditors, parliaments and the press.",
      "tok∑ner deploys on the agency's own cluster in its own jurisdiction. Citizen service assistants use in-jurisdiction and self-hosted models. Policy changes above a risk threshold pass through an approval chain. Oversight staff can export who used what, under which rule, at what cost. Because the interface is open and portable, providers can be replaced without rework.",
      "Public servants get capable tools, and the public gets a record of accountable use.",
    ],
    pressures: [
      { title: "Sovereignty", body: "Data and processing must stay in the jurisdiction, and often on infrastructure the state controls." },
      { title: "Accountability and transparency", body: "Automated assistance in public services is subject to oversight, freedom of information requests and audit." },
      { title: "Accessibility and fairness", body: "Services must work for everyone, in several languages, and must not disadvantage groups." },
      { title: "Procurement discipline", body: "Frameworks and budgets are fixed. Costs need to be visible and suppliers replaceable." },
    ],
    capabilities: [
      { area: "Deployment", title: "On your cluster, in your country", body: "Helm-based deployment on your own Kubernetes, with air-gapped operation available." },
      { area: "Policy", title: "Classification-aware rules", body: "Labels such as official, sensitive and secret map to the models and regions allowed to handle them." },
      { area: "Governance", title: "Approval chains", body: "Policy changes above a threshold need a second approver, and every change records before and after state." },
      { area: "Audit", title: "Oversight on demand", body: "Exports show who used which model under which rule, which is the answer to most oversight questions." },
    ],
    standards: [
      { name: "EU AI Act", note: "Obligations for public authorities and for high risk systems used in public services." },
      { name: "NIST AI RMF and OMB AI memoranda", note: "Federal guidance for AI use and inventories in the United States." },
      { name: "ISO 27001 and national security baselines", note: "Information security management for government systems." },
      { name: "Freedom of information and records laws", note: "What must be kept, and what can be asked for." },
    ],
    systems: [
      { label: "Public services", names: ["Citizen portal", "Records office", "Permit system", "Case management", "Procurement"] },
      { label: "Platform", names: ["Kubernetes", "MinIO", "Elastic", "Keycloak"] },
      { label: "Models", names: ["vLLM", "Ollama", "Hugging Face", "NVIDIA"] },
    ],
    faqs: [
      { q: "Can we run it with no internet access?", a: "Yes. The platform supports air-gapped deployments, with models served locally." },
      { q: "How do we avoid supplier lock-in?", a: "Applications use an OpenAI-compatible endpoint and model aliases, so a model or provider can be replaced without changing the application." },
      { q: "What do oversight bodies get?", a: "An export of requests, rules, approvals and cost, with identities, so they can check use against policy." },
    ],
    flagship: "public-citizen-service-assistant",
  },

  education: {
    art: "education",
    intro: [
      "Students already use language models. The question for a school or university is whether that use happens inside a framework the institution designed or outside it, with student records and coursework flowing to tools nobody reviewed. A good assistant can explain a concept three ways at midnight, point to the right chapter, help an adviser with a degree audit and save researchers days of reading. A careless one can mislead, leak and spend.",
      "Institutions also have a particular problem of scale and autonomy. Departments buy their own tools, budgets are tight and faculty rightly want control over what an assistant may say in their course.",
      "tok∑ner lets an institution say yes to those pilots safely. A course assistant is scoped to the materials the instructor approved and cites the page it used. Each department has a budget that warns before it is exceeded. Student records are masked in documents, and sensitive work runs on models the institution hosts. Usage can be reviewed by course without reading anyone's conversation.",
      "Teachers keep authority over their courses and the institution keeps control of its data and its costs.",
    ],
    pressures: [
      { title: "Student privacy", body: "Education records are protected, and students are often minors or early in adulthood." },
      { title: "Academic integrity and accuracy", body: "Assistants must support learning and must not invent sources." },
      { title: "Decentralised purchasing", body: "Departments adopt tools independently, which fragments contracts and spend." },
      { title: "Tight budgets", body: "A popular assistant can become the largest line in a department's technology budget within a term." },
    ],
    capabilities: [
      { area: "Retrieval", title: "Course-scoped assistants", body: "Retrieval is limited to approved readings with metadata filters per course, and answers carry citations." },
      { area: "Budgets", title: "A budget per department", body: "Each faculty has a cap and a warning at 80 percent, with reports by course." },
      { area: "Documents", title: "Records handled with care", body: "Transcripts and applications are masked during processing before any model sees them." },
      { area: "Gateway", title: "One endpoint for every tool", body: "Learning platforms, advising tools and research notebooks use the same governed endpoint." },
    ],
    standards: [
      { name: "FERPA", note: "Protection of student education records in the United States." },
      { name: "COPPA and age-appropriate design codes", note: "Extra duties where users are children." },
      { name: "GDPR", note: "Lawful basis and minimisation for student data in Europe." },
      { name: "Institutional AI use policies", note: "Local rules that decide what assistants may do in coursework." },
    ],
    systems: [
      { label: "Learning", names: ["Moodle", "Canvas", "Google Classroom", "Khan Academy", "Coursera"] },
      { label: "Institution", names: ["Student records", "Admissions", "Library catalogue", "Zoom"] },
      { label: "Models", names: ["OpenAI", "Anthropic", "Ollama", "vLLM"] },
    ],
    faqs: [
      { q: "Can an instructor limit what the assistant uses?", a: "Yes. The course index contains only the materials the instructor approved, and the assistant is set to answer from them and cite them." },
      { q: "Can we cap spend by department?", a: "Yes. Budgets can be set per project, with thresholds that warn, throttle or block." },
      { q: "Do administrators read student conversations?", a: "Reports show usage and cost by course. Access to content is a separate permission that you control." },
    ],
    flagship: "education-course-tutor",
  },

  legal: {
    art: "legal",
    intro: [
      "Legal work is reading, comparing and writing, at volume, under duties of confidentiality. A due diligence exercise can involve tens of thousands of documents. A contract review can mean checking the same twenty clauses across hundreds of agreements. Language models are well suited to this work and the profession is understandably careful about it, because an unverified citation or a leak between matters can end a career.",
      "The standard that works is simple to state. Matters must stay apart. Every statement must point to a source. A named person must approve what leaves the firm. And there must be a record of how a draft was produced.",
      "tok∑ner builds that standard into the platform. Each matter gets its own index and metadata filters, so one client's documents cannot appear in another's answers. Extraction and research answers cite the page they came from. Drafts wait for a reviewer. The matter record shows the sources, the model, the reviewer and the time.",
      "Fee earners spend their hours on judgement and advice, and the firm keeps the evidence that the work was done carefully.",
    ],
    pressures: [
      { title: "Confidentiality and privilege", body: "Client material must not leak to another matter, a provider's training set or an unapproved region." },
      { title: "Verifiability", body: "A research answer without a checkable source is a liability. Reviewers need to open the original." },
      { title: "Matter economics", body: "Fixed fees and client scrutiny of AI spend mean cost per matter has to be known." },
      { title: "Professional duties", body: "Regulators and courts increasingly expect lawyers to supervise AI output and to disclose use where required." },
    ],
    capabilities: [
      { area: "Retrieval", title: "Matter-scoped indexes", body: "Metadata filters and separate collections keep each matter apart, and queries run with the matter as a required filter." },
      { area: "Documents", title: "Clauses with page references", body: "Extraction returns the clause text and the page it came from, so a reviewer can check it in seconds." },
      { area: "Pipelines", title: "Approval before it leaves", body: "Drafts wait at an approval gate for a named reviewer, and the approval becomes part of the record." },
      { area: "Budgets", title: "Cost per matter", body: "Budgets and reports are scoped by project, so each matter's AI spend is visible and bounded." },
    ],
    standards: [
      { name: "ABA Model Rules and local bar guidance", note: "Duties of competence, confidentiality and supervision when using AI tools." },
      { name: "GDPR", note: "Personal data in client documents and in data rooms." },
      { name: "ISO 27001", note: "Information security management that clients ask firms to evidence." },
      { name: "Court rules on AI use", note: "Some courts require disclosure or certification of AI-assisted filings." },
    ],
    systems: [
      { label: "Matter systems", names: ["Document management", "Matter database", "Contract repository", "e-Discovery", "Case management"] },
      { label: "Storage and search", names: ["Box", "Dropbox", "Google Drive", "Elasticsearch"] },
      { label: "Security", names: ["Okta", "Microsoft Entra ID", "HashiCorp Vault", "Splunk"] },
    ],
    faqs: [
      { q: "How do we keep matters apart?", a: "Use one collection per matter, or a matter filter that the retrieve operator requires. Policy and roles control who can query which collection." },
      { q: "Can we trust the citations?", a: "Answers are built from retrieved passages, and each passage carries its document and page, so a reviewer can open it. A reviewer still needs to check it." },
      { q: "Is client data used to train models?", a: "That depends on the provider's terms. Policy can restrict matters to providers you have approved, or to models you host." },
    ],
    flagship: "legal-contract-review",
  },

  enterprise: {
    art: "enterprise",
    intro: [
      "A large enterprise does not adopt AI once. It adopts it hundreds of times, in every business unit, with different needs, different data and different budgets. Without a shared platform the result is predictable: dozens of provider contracts, keys in repositories, no common policy and finance reconciling invoices by hand.",
      "The central team has a hard job. It must make adoption easy enough that teams do not go around it, and strict enough that the company can show its board and its regulators that AI is under control. Those goals pull against each other unless the platform makes the safe path the easy path.",
      "tok∑ner is that platform. Central IT publishes approved models and a baseline policy. Each business unit receives a tenant that inherits the baseline and can only tighten it. Teams build with their own keys and see their own usage. Finance receives chargeback by team and by cost centre, and procurement can model contract terms so reports match the invoice.",
      "One control plane replaces many private arrangements, and the company can scale AI without scaling risk.",
    ],
    pressures: [
      { title: "Shadow AI", body: "When the sanctioned route is slow, people use whatever works. That is where data leaves and costs hide." },
      { title: "Contract sprawl", body: "Many teams with many providers means lost volume discounts and unclear commitments." },
      { title: "Inconsistent controls", body: "Each team implements its own filters and logging, so no one can say the company is protected." },
      { title: "Platform adoption", body: "A central platform fails if it is harder to use than the alternatives." },
    ],
    capabilities: [
      { area: "Tenants", title: "Inheritance, not copy and paste", body: "Organisation policy flows down to every tenant. Teams can tighten rules and cannot loosen them." },
      { area: "Identity", title: "SSO and roles", body: "Okta, Entra ID, Keycloak and Auth0 with role and attribute based access." },
      { area: "Cost", title: "Chargeback that matches the invoice", body: "Reserved capacity terms are modelled, so reported cost equals what finance pays." },
      { area: "Registry", title: "One list of approved models", body: "Providers and models are registered once, with owners and status, and applications use aliases." },
    ],
    standards: [
      { name: "ISO/IEC 42001", note: "Management system standard for AI." },
      { name: "NIST AI RMF", note: "Govern, map, measure and manage AI risk." },
      { name: "EU AI Act", note: "Inventory and risk classification across the enterprise." },
      { name: "SOC 2 and ISO 27001", note: "Control evidence customers ask for." },
    ],
    systems: [
      { label: "Business systems", names: ["SAP", "Salesforce", "Intranet", "HR system", "Data warehouse"] },
      { label: "Identity and operations", names: ["Okta", "Microsoft Entra ID", "Datadog", "PagerDuty"] },
      { label: "Developer platform", names: ["GitHub", "Jenkins", "Terraform", "Kubernetes"] },
    ],
    faqs: [
      { q: "Can a business unit loosen the baseline?", a: "No. Tenants inherit organisation policy and can add restrictions only." },
      { q: "How is chargeback produced?", a: "Every request is metered with its project and cost centre, and reports allocate spend with contract terms applied." },
      { q: "How do we get teams to use it?", a: "Teams change a base URL in an existing client. The platform is compatible with the OpenAI API and the common SDKs." },
    ],
    flagship: "enterprise-internal-platform",
  },

  startups: {
    art: "startups",
    intro: [
      "A young company has the opposite problem to a bank. It has no committee and no process, and it moves quickly. It also has no cushion. One looping agent can burn a month of runway overnight, one provider outage can stop the product, and one leaked key can end the week.",
      "What these teams need is not a heavy platform. They need a base URL they can change in five minutes, a cap on every key, an alert when something spikes, and the freedom to move to a cheaper or better model without touching code.",
      "tok∑ner gives them that and lets it grow. Each developer and each agent gets a key with a daily cap. A looping agent hits its cap and is stopped, and the owner is told in Slack. Applications call model aliases, so a better model is a console change. Provider credentials sit in one place instead of in repositories. When the company grows, the same platform adds tenants, policy approval and audit, so there is nothing to migrate.",
      "The startup ships quickly, spends predictably and can answer an enterprise customer's security questionnaire without a rebuild.",
    ],
    pressures: [
      { title: "Runaway cost", body: "Agents and batch jobs can loop. A cap at the key level is the cheapest insurance there is." },
      { title: "Provider dependence", body: "Single-provider products inherit that provider's outages and price changes." },
      { title: "Key hygiene", body: "Provider keys in repositories and chat history are a common source of incidents." },
      { title: "Enterprise readiness", body: "The first large customer asks about audit, access control and data handling, usually in the middle of a deal." },
    ],
    capabilities: [
      { area: "Gateway", title: "Five minutes to adopt", body: "Change the base URL in an existing OpenAI client and keep the rest of your code." },
      { area: "Budgets", title: "Caps on every key", body: "Daily and monthly limits per key, per project and per agent, with alerts in Slack." },
      { area: "Routing", title: "Aliases and fallbacks", body: "Point an alias at a new model and every service follows, with a secondary provider ready." },
      { area: "Observability", title: "Spend per feature", body: "See which feature, user segment or experiment drives cost." },
    ],
    standards: [
      { name: "SOC 2", note: "Customers will ask. Central logging and access control make the evidence easier to gather." },
      { name: "GDPR", note: "Know which provider processes which customer's prompts." },
      { name: "Enterprise security questionnaires", note: "Audit, SSO and data handling are the usual first questions." },
    ],
    systems: [
      { label: "Languages and frameworks", names: ["TypeScript", "Python", "Node.js", "LangChain"] },
      { label: "Providers", names: ["OpenAI", "Anthropic", "Google Gemini", "Ollama"] },
      { label: "Team tools", names: ["Slack", "GitHub", "Stripe", "Datadog"] },
    ],
    faqs: [
      { q: "How long does it take to start?", a: "Create a key, change the base URL and send a request. The quickstart takes about five minutes." },
      { q: "What stops a runaway agent?", a: "A budget on the agent's key. At the limit the platform throttles or blocks, and the owner is notified." },
      { q: "Will we outgrow it?", a: "The same platform adds tenants, approval workflows and audit export when you need them." },
    ],
    flagship: "startups-spend-caps",
  },
};
