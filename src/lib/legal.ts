/**
 * Legal documents. Structure follows what large cloud vendors do well: one hub with every document grouped and described, each document with a
 * version, an effective date, a plain summary, numbered clauses that can be linked to, a history and related documents.
 *
 * STATUS: all text here is a working draft that has not been reviewed by counsel. Every page says so. The contracting entity, governing law,
 * liability limits and service credits are named in the customer's order form, so this text does not invent them.
 */

export type Clause = { title: string; paras: string[]; items?: string[] };
export type LegalGroup = "agreements" | "policies" | "trust" | "site";
export type LegalDoc = {
  slug: string;
  title: string;
  group: LegalGroup;
  /** One line shown in the hub. */
  summary: string;
  /** Plain language points shown above the clauses. Not a substitute for the clauses. */
  inShort: string[];
  version: string;
  effective: string;
  updated: string;
  clauses: Clause[];
  history: { version: string; date: string; change: string }[];
  related: string[];
};

export const LEGAL_GROUPS: { id: LegalGroup; title: string; blurb: string }[] = [
  { id: "agreements", title: "Agreements", blurb: "The terms that apply when you sign up or buy." },
  { id: "policies", title: "Policies", blurb: "How we handle data, and what we ask of every customer." },
  { id: "trust", title: "Security and trust", blurb: "How to report a problem, and where to see how we run the service." },
  { id: "site", title: "This website", blurb: "Rules for using tokener.io and our brand." },
];

export const LEGAL_STATUS =
  "These documents are working drafts and have not been reviewed by counsel. They do not yet bind anyone. Where you have signed an order form, the order form controls.";

export const LEGAL_CONTACTS = [
  { label: "Privacy requests", value: "privacy@tokener.io" },
  { label: "Report a security issue", value: "security@tokener.io" },
  { label: "Contracts and order forms", value: "sales@tokener.io" },
  { label: "Anything else", value: "support@tokener.io" },
];

const FIRST = (d: string) => [{ version: `Draft ${d}`, date: d, change: "First structured draft with numbered clauses." }];

export const LEGAL_DOCS: LegalDoc[] = [
  {
    slug: "terms",
    title: "Terms of service",
    group: "agreements",
    summary: "The agreement for using tok∑ner: your account, your content, fees, availability and what happens when it ends.",
    inShort: [
      "You own what you send through the gateway. We do not keep prompt or response content unless an administrator turns that on.",
      "You stay responsible for your own provider accounts, the policies you set and the people you give access to.",
      "Free and preview features have no availability promise. Paid plans follow your order form.",
      "You can export your data when you leave.",
    ],
    version: "Draft 2026-11",
    effective: "Not yet in force",
    updated: "20 November 2026",
    clauses: [
      { title: "About this agreement", paras: [
        "These terms apply when you create an account or use tok∑ner. If you sign an order form, the order form and these terms together are the agreement, and the order form controls where they differ.",
        "The company you contract with, the governing law and the courts that hear disputes are named in your order form. For the free plan they are shown when you sign up.",
      ] },
      { title: "Your account", paras: [
        "You must give accurate details, keep your sign-in methods safe and tell us promptly if you think someone else has used your account.",
        "You are responsible for what people you give access to do in your organization, including through API keys and agents you register.",
      ] },
      { title: "Using the service", paras: [
        "You may use the service to govern, meter, prepare data for, train, deploy and run AI workloads for your organization, in line with these terms, the Acceptable use policy and the law.",
        "The Service terms describe how each product behaves and which features are in preview.",
      ] },
      { title: "Your content and data", paras: [
        "You own your prompts, responses, documents, datasets, models, agents and the outputs you create. You give us the limited right to process them to run the service for you.",
        "Prompt and response content is not stored unless a tenant administrator turns on logging for that tenant. Operational records such as token counts, model, latency, cost and audit events are kept as described in the Privacy policy.",
      ] },
      { title: "Provider accounts and credentials", paras: [
        "When you connect a model provider or another system, you act under your own agreement with that provider. Their terms apply to your use of them.",
        "Secrets are stored as references to your own secret manager. You must not paste a real secret into a field that asks for a reference.",
      ] },
      { title: "Fees and credit", paras: [
        "Prices, any free credit, its length and the way usage is billed are shown at sign-up and in your order form. Usage is metered per request. Cost reports use the rates and contract terms you configure, and anything estimated is labelled as an estimate.",
        "Unless your order form says otherwise, fees are not refundable, and taxes are added where they apply.",
      ] },
      { title: "Availability", paras: [
        "We target 99.95 percent availability for the data plane. The Service levels document explains how it is measured. Service credits and any other commitment for paid plans are set in your order form.",
        "Free plans and preview features come with no availability commitment.",
      ] },
      { title: "Preview features", paras: [
        "A feature marked Preview, Planned or In development may change, be limited or be withdrawn. Screens in a sample workspace show example data and are not a measurement of your own systems.",
      ] },
      { title: "Suspension and ending", paras: [
        "We may suspend access that puts the service or other customers at risk, or that breaks the Acceptable use policy, and we will tell you why where we can.",
        "You may stop using the service at any time. After the agreement ends you can export your data for the period stated in your order form, and we then delete it unless the law or your audit retention settings require us to keep it.",
      ] },
      { title: "Warranties and liability", paras: [
        "The service is provided with the care and skill a reasonable provider would use. Beyond that, and beyond what the law requires, it is provided as it is.",
        "Limits on liability and any indemnities are set out in your order form.",
      ] },
      { title: "Changes", paras: [
        "We will give notice before a material change to these terms takes effect. A change does not apply to a period you have already paid for unless the law requires it.",
      ] },
    ],
    history: FIRST("2026-11"),
    related: ["service-terms", "acceptable-use", "privacy", "dpa", "service-levels"],
  },
  {
    slug: "community-license",
    title: "tok∑ner Community License Agreement",
    group: "agreements",
    summary: "The license that applies to the community edition when you create an account. Your acceptance is recorded with the version.",
    inShort: [
      "Use the community edition for your own organization's internal AI governance.",
      "Paid features and services are covered by their own order form, not this license.",
      "We record which version you accepted, and ask again when the text changes.",
    ],
    version: "2026-10",
    effective: "October 2026",
    updated: "20 November 2026",
    clauses: [
      { title: "What this covers", paras: ["This agreement applies when you create a tok∑ner account and use the community edition. It sits alongside the Terms of service and the Privacy policy."] },
      { title: "What you can do", paras: ["Use the community edition for your own organization's internal AI governance: connect providers, set budgets and policies, and keep an audit trail."] },
      { title: "What is not covered", paras: ["Features and services that are offered under a separate order form are governed by that order form, not by this agreement."] },
      { title: "Feedback", paras: ["If you send us suggestions, we may use them to improve the product without obligation to you."] },
      { title: "No warranty", paras: ["The community edition is provided as it is, without warranties beyond those the law requires."] },
      { title: "Versions", paras: ["The version you accept is recorded with the time and the address you accepted it from. When the text changes, a new version is published and you are asked to accept it again."] },
    ],
    history: [{ version: "2026-10", date: "2026-10", change: "Text unchanged since publication. Layout now shows numbered clauses." }],
    related: ["terms", "privacy", "service-terms"],
  },
  {
    slug: "service-terms",
    title: "Service terms",
    group: "agreements",
    summary: "Terms that apply to particular products: the gateway, Refinery, MLOps, Agent OS, connectors and preview features.",
    inShort: [
      "Section 1 applies to everything. Sections 2 to 8 apply only if you use that product.",
      "Preview features and sample workspaces are labelled. They carry no availability promise.",
      "Connectors and framework adapters show a status, and that status is the only claim we make about them.",
    ],
    version: "Draft 2026-11",
    effective: "Not yet in force",
    updated: "20 November 2026",
    clauses: [
      { title: "Terms for all products", paras: [
        "Capitalized words not defined here have the meaning given in the Terms of service.",
        "Models, tools and systems you connect are yours. You are responsible for having the right to send the data you route through them.",
        "Cost figures use rates and contract terms you configure. Anything estimated is labelled as an estimate.",
      ] },
      { title: "Gateway, policy and budgets", paras: [
        "The gateway applies the policies and budgets you configure to every request that passes through it. A policy only governs traffic that is routed through the gateway.",
        "Masking and filtering reduce risk, and do not guarantee that no personal or confidential data reaches a provider. You choose the policy and review its results.",
      ] },
      { title: "Documents and knowledge", paras: [
        "When we convert documents or build a knowledge index, we store the converted text and index you ask us to keep, for the period you set. You are responsible for the right to process those documents.",
      ] },
      { title: "Refinery", paras: [
        "Refinery runs recipes you define against data you connect. A run that would send data outside the places allowed by your data location policy can be stopped when you turn enforcement on.",
        "Quality scores, semantic mappings and governance evidence packs are records to help you. They are not an assessment of legal compliance, and only you can answer the questions they mark as yours.",
      ] },
      { title: "MLOps", paras: [
        "You are responsible for the models you register, their licenses and the data they were trained on. A model version can be blocked from approval by your quality gate, and an administrator who approves past it must write a reason that is kept.",
      ] },
      { title: "Agent OS (preview)", paras: [
        "Agent OS is in preview. The console runs against a sample workspace in your browser, with example people, documents and amounts. Evaluation scores there are simulated.",
        "An agent that runs outside tok∑ner is governed as far as its calls are routed through tok∑ner. We do not promise control over actions an external agent takes elsewhere.",
        "An action that changes something in your systems waits for a person unless you have set a rule that allows it. A regulated decision should stay behind human approval.",
      ] },
      { title: "Connectors and framework adapters", paras: [
        "Each connector and adapter shows a status of Planned, In development, Beta or Available. A status of Beta or Available means the platform team approved it after the checks listed for that status. Planned and In development mean it has not been run against the vendor's own test service.",
        "A vendor's name or logo identifies the system a connector reaches. It does not mean the vendor sponsors or endorses tok∑ner.",
      ] },
      { title: "Betas and previews", paras: [
        "We may change or withdraw a beta or preview at any time. Service levels do not apply to them, and you should not rely on them for production workloads unless your order form says so.",
      ] },
    ],
    history: FIRST("2026-11"),
    related: ["terms", "service-levels", "ai-use", "acceptable-use"],
  },
  {
    slug: "service-levels",
    title: "Service levels",
    group: "agreements",
    summary: "How availability is measured, what is excluded and how a credit is claimed on a paid plan.",
    inShort: [
      "The data plane targets 99.95 percent availability each month.",
      "Free plans and previews have no commitment.",
      "Credits and any other remedy are set in your order form.",
    ],
    version: "Draft 2026-11",
    effective: "Not yet in force",
    updated: "20 November 2026",
    clauses: [
      { title: "What is measured", paras: [
        "Availability of the data plane is the share of minutes in a calendar month in which the gateway accepted and answered requests correctly, measured at our edge. The control plane and console are covered by a lower target stated in your order form.",
      ] },
      { title: "What is not counted", paras: ["Time is not counted against availability when it is caused by:"], items: [
        "a provider you connect being unavailable or slow",
        "your configuration, including budgets, policies and rate limits that refuse a request as designed",
        "planned maintenance announced in advance on the Status page",
        "events outside our reasonable control",
        "preview features and sample workspaces",
      ] },
      { title: "Claiming a credit", paras: [
        "If availability in a month is below the commitment in your order form, send a request to support@tokener.io within the period stated there, with the dates and request ids you saw. We will confirm the figure from our own records.",
      ] },
      { title: "Status and incidents", paras: [
        "Current and past incidents are on the Status page. Where an incident affected your data, we will tell you directly.",
      ] },
    ],
    history: FIRST("2026-11"),
    related: ["terms", "service-terms"],
  },
  {
    slug: "dpa",
    title: "Data processing addendum",
    group: "agreements",
    summary: "How we process personal data on your behalf: roles, security, sub-processors, location, transfers and deletion.",
    inShort: [
      "You are the controller and we are the processor of personal data we process for you.",
      "We process it only on your instructions, and you can limit where it is processed.",
      "We tell you before we change sub-processors.",
    ],
    version: "Draft 2026-11",
    effective: "Not yet in force",
    updated: "20 November 2026",
    clauses: [
      { title: "Roles", paras: [
        "The customer is the controller and tok∑ner is the processor of personal data processed on the customer's behalf. For account and billing data about the customer's own staff, tok∑ner is a controller, as the Privacy policy explains.",
      ] },
      { title: "Instructions", paras: [
        "We process personal data only on your documented instructions, which are these terms, your order form and the settings you choose in the product. We tell you if we think an instruction breaks the law.",
      ] },
      { title: "Security measures", paras: [
        "Encryption in transit and at rest, tenant isolation, access control, and an immutable audit trail, as described on the Security page.",
        "Secrets are stored as references to your own secret manager.",
      ] },
      { title: "Sub-processors", paras: [
        "You authorize us to use sub-processors that meet these terms. A current list is available on request, and we notify you before adding or replacing one, so you have time to object.",
      ] },
      { title: "Data location and transfers", paras: [
        "You can limit processing to approved regions through policy and provider routing. Where personal data leaves the region you chose, we use a recognized transfer mechanism, such as standard contractual clauses, and you can ask for a copy.",
      ] },
      { title: "Helping you meet your duties", paras: [
        "We help you answer requests from people about their data, carry out impact assessments and respond to regulators, taking into account the nature of the processing.",
      ] },
      { title: "Incidents", paras: [
        "We tell you without undue delay, and within the period in your order form, after we become aware of a breach of personal data we process for you, with what we know about it and what we are doing.",
      ] },
      { title: "Audits", paras: [
        "On request we give you the information needed to show that we meet this addendum, including relevant independent reports where we have them. An on-site audit needs notice and is limited to what is necessary.",
      ] },
      { title: "Return and deletion", paras: [
        "When the agreement ends, you can export your data. We then delete it within the period in your order form, unless the law or an audit retention period you configured requires us to keep it.",
      ] },
    ],
    history: FIRST("2026-11"),
    related: ["privacy", "terms", "security-reporting"],
  },
  {
    slug: "acceptable-use",
    title: "Acceptable use policy",
    group: "policies",
    summary: "What you may not do with tok∑ner, how we investigate and how to report a violation.",
    inShort: [
      "No illegal, harmful or deceptive use, and no attacking the service or other people.",
      "Do not work around budgets, policies or limits that an administrator has set.",
      "We may suspend access that breaks these rules, and will say why where we can.",
    ],
    version: "Draft 2026-11",
    effective: "Not yet in force",
    updated: "20 November 2026",
    clauses: [
      { title: "Scope", paras: ["This policy applies to you, the people you give access to, and the agents and applications that act for you. You may not use the service, or allow others to use it, for any of the following."] },
      { title: "Prohibited uses", paras: [], items: [
        "Illegal or fraudulent activity, including processing data you have no right to process.",
        "Violating the rights of others, including privacy, intellectual property and publicity rights.",
        "Threatening, promoting or planning violence or harm to people.",
        "Any content that sexually exploits or endangers children.",
        "Attacking or undermining the security of the service, other customers or any system, including probing without permission, malware and attempts to access another tenant's data.",
        "Sending unsolicited bulk messages or generating spam, or impersonating a person or organization to deceive.",
        "Working around budgets, rate limits, approval rules or data protection policies set by an administrator, or hiding usage from them.",
        "Using an agent to take an action on a person without the human review your own rules or the law require.",
      ] },
      { title: "Investigation and enforcement", paras: [
        "We may investigate suspected violations. We may remove content, suspend or end access, and report conduct to the authorities where the law requires.",
        "You agree to help us fix a violation. When we decide what to do, we consider how quickly you act and what safeguards you had in place.",
      ] },
      { title: "Reporting a violation", paras: ["Send a report to security@tokener.io with the details and any request ids. We read every report and reply when we can act on it."] },
    ],
    history: FIRST("2026-11"),
    related: ["terms", "ai-use", "security-reporting"],
  },
  {
    slug: "ai-use",
    title: "Responsible AI policy",
    group: "policies",
    summary: "The practices we expect when AI makes or supports decisions, and what the platform does to help you follow them.",
    inShort: [
      "A person should stay in charge of decisions that matter.",
      "Test an agent before you change it, and keep a record of what it did and why.",
      "Be open with people when they are dealing with an agent.",
    ],
    version: "Draft 2026-11",
    effective: "Not yet in force",
    updated: "20 November 2026",
    clauses: [
      { title: "Human oversight", paras: [
        "Decisions that affect people's money, health, rights, jobs or access to services should be made or approved by a person. The platform lets you require approval for any tool or action, including a second approver for large amounts.",
      ] },
      { title: "Testing before change", paras: [
        "Run an evaluation on the cases that matter before you change a prompt, a model or a tool, and compare it with the last run. Keep the results with the change.",
      ] },
      { title: "Records", paras: [
        "Keep traces, approvals and the reason for each decision for the period your regulator or your own policy requires. The audit trail records who changed what, and a correlation id links every step of a run.",
      ] },
      { title: "Transparency", paras: [
        "Tell people when they are talking to an agent, and give them a way to reach a person. Do not present an agent's output as a person's judgment.",
      ] },
      { title: "Data minimization", paras: [
        "Send a model only the data the task needs. Mask personal data where you can, and use the data location policy to keep data where it is allowed to be.",
      ] },
      { title: "Limits of this policy", paras: [
        "This policy sets expectations. It is not legal advice, and following it does not by itself make a use of AI compliant with any law. Evaluation scores and sample screens in preview are examples, not measures of a real model.",
      ] },
    ],
    history: FIRST("2026-11"),
    related: ["acceptable-use", "service-terms", "terms"],
  },
  {
    slug: "privacy",
    title: "Privacy policy",
    group: "policies",
    summary: "What we collect, what we do not, how we use it, who sees it and how you can ask us to change or delete it.",
    inShort: [
      "We do not store prompt or response content unless a tenant administrator turns it on.",
      "We keep operational records, such as token counts and audit events, to run your service and produce your reports.",
      "You can ask to see, correct, export or delete your account data.",
    ],
    version: "Draft 2026-11",
    effective: "Not yet in force",
    updated: "20 November 2026",
    clauses: [
      { title: "Who we are", paras: [
        "tok∑ner provides the platform. For account, billing and website data we decide how the data is used and are the controller. For content you route through the platform we are your processor, and the Data processing addendum applies.",
      ] },
      { title: "What we collect", paras: ["We collect:"], items: [
        "Account details you provide, such as name, work email and organization.",
        "Operational metadata about requests that pass through the gateway, such as token counts, model, latency and cost.",
        "Administrative actions recorded in the audit log.",
        "Basic technical data when you visit the website or console, such as device, browser and pages.",
      ] },
      { title: "What we do not collect by default", paras: ["Prompt and response content is not stored unless a tenant administrator explicitly enables logging for that tenant."] },
      { title: "How we use it", paras: ["To operate the service, enforce your policies and budgets, produce your reports and invoices, support you, and secure the platform. We do not sell personal data."] },
      { title: "Who we share it with", paras: [
        "With the providers you connect, because you ask us to send them your requests. With sub-processors that help us run the service, under the Data processing addendum. With authorities where the law requires it.",
      ] },
      { title: "How long we keep it", paras: [
        "Account data for as long as the account exists and for the period the law requires after. Audit and usage records for the retention you configure. Content you choose to log for the period you choose.",
      ] },
      { title: "Where it is processed", paras: ["You can constrain processing to approved regions through policy and provider routing. Transfers outside a region you chose use a recognized transfer mechanism."] },
      { title: "Your choices and rights", paras: [
        "Depending on where you live, you may have the right to access, correct, delete, export or limit the use of your personal data, and to object to some uses. You can export or delete account data subject to the audit retention you configure.",
        "Write to privacy@tokener.io. If you are not satisfied with our reply, you can complain to your data protection authority.",
      ] },
      { title: "Children", paras: ["The service is for organizations and is not directed to children."] },
      { title: "Changes", paras: ["We will post changes here with a new version and date, and tell account owners about material changes."] },
    ],
    history: FIRST("2026-11"),
    related: ["dpa", "cookies", "terms"],
  },
  {
    slug: "cookies",
    title: "Cookie notice",
    group: "policies",
    summary: "What this website and the console store in your browser, why, and how to control it.",
    inShort: [
      "We store only what sign-in, security and your settings need.",
      "We do not use advertising cookies.",
      "You can clear or block storage in your browser at any time.",
    ],
    version: "Draft 2026-11",
    effective: "Not yet in force",
    updated: "20 November 2026",
    clauses: [
      { title: "What we store", paras: ["The website and console use cookies and browser storage for:"], items: [
        "Keeping you signed in and protecting your session.",
        "Remembering choices such as the theme, a selected tab or a filter.",
        "The sample workspace, which keeps its example data in your browser so the screens can be tried without an account.",
      ] },
      { title: "What we do not use", paras: ["We do not use advertising cookies or sell data collected through them."] },
      { title: "Your control", paras: [
        "You can clear or block cookies and site storage in your browser settings. Sign-in and the sample workspace will not work without the storage they need.",
      ] },
      { title: "Changes", paras: ["If we add a tool that needs your consent, we will say so here and ask before it runs."] },
    ],
    history: FIRST("2026-11"),
    related: ["privacy", "site-terms"],
  },
  {
    slug: "security-reporting",
    title: "Reporting a security issue",
    group: "trust",
    summary: "How to tell us about a vulnerability, what we do next, and what we ask of you.",
    inShort: [
      "Email security@tokener.io with what you found and how to reproduce it.",
      "We reply, fix, and credit you if you want.",
      "Test only your own account, and do not read or change other people's data.",
    ],
    version: "Draft 2026-11",
    effective: "Not yet in force",
    updated: "20 November 2026",
    clauses: [
      { title: "How to report", paras: ["Send a report to security@tokener.io. Include what you found, where, the steps to reproduce it and the impact you think it has. Do not include real customer data."] },
      { title: "What we do", paras: ["We confirm that we received the report, look into it, keep you informed and fix real issues. If you want credit, we will give it when we publish a fix."] },
      { title: "What we ask", items: [
        "Test only with your own account and data.",
        "Do not access, change or delete another customer's data, and stop if you reach it by accident.",
        "Do not disrupt the service, for example with load tests or social engineering of staff.",
        "Give us reasonable time to fix the issue before you share details.",
      ], paras: [] },
      { title: "Our commitment", paras: ["We will not start legal action against someone who follows this policy in good faith."] },
      { title: "Where to see our security", paras: ["The Security page describes encryption, isolation and the audit trail, and the Status page shows incidents."] },
    ],
    history: FIRST("2026-11"),
    related: ["acceptable-use", "dpa"],
  },
  {
    slug: "site-terms",
    title: "Website terms",
    group: "site",
    summary: "The rules for using tokener.io, our content and our brand.",
    inShort: [
      "The site and its text, images and code samples are ours or used with permission.",
      "Screens on the site show sample data unless they say otherwise.",
      "Our name and logo have their own use rules on the Brand page.",
    ],
    version: "Draft 2026-11",
    effective: "Not yet in force",
    updated: "20 November 2026",
    clauses: [
      { title: "Using the site", paras: ["You may view the site and use code samples for your own work. Do not copy the site, scrape it at scale, or try to break it."] },
      { title: "Content", paras: ["Text, images and screens are owned by us or used with permission. Product screenshots show a sample workspace with example people, documents and amounts, unless a page says otherwise."] },
      { title: "Third-party names and links", paras: ["Names and logos of other companies identify the systems tok∑ner connects to and belong to their owners. They do not imply that those companies sponsor or endorse tok∑ner. We are not responsible for sites we link to."] },
      { title: "Our brand", paras: ["The name and logo may be used as the Brand page describes. Do not use them in a way that suggests we endorse you."] },
      { title: "No advice", paras: ["Content on the site is general information. It is not legal, financial or compliance advice, and plans and status labels describe what exists today."] },
    ],
    history: FIRST("2026-11"),
    related: ["terms", "cookies", "privacy"],
  },
];

export const DOC_BY_SLUG: Record<string, LegalDoc> = Object.fromEntries(LEGAL_DOCS.map((d) => [d.slug, d]));

export function anchorOf(i: number) { return `clause-${i + 1}`; }
