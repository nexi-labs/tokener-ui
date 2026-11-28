import type { SceneSpec } from "@/lib/usecases/types";

/**
 * Animated line diagrams for product pages. Each one shows a single feature of the product as it works, using the same
 * scene format as the use case pages. A diagram only shows behaviour the product has: the checks, verdicts and limits
 * named in a diagram are the ones the engines apply.
 */
export type Diagram = { id: string; title: string; lead: string; spec: SceneSpec };

export const PRODUCT_DIAGRAMS: Record<string, Diagram[]> = {
  // ------------------------------------------------------------------------------------------------ AI Gateway
  gateway: [
    {
      id: "gateway-streaming",
      title: "Streaming, metered as it flows",
      lead: "Chat streams travel as server-sent events. The gateway counts tokens while chunks pass through and writes one accounting event when the stream ends, so a long answer is billed for exactly what was sent.",
      spec: {
        alt: "A streaming chat request goes through the gateway to a provider. Chunks stream back to the application and tokens are counted into the ledger when the stream ends.",
        caption: "Counting happens in the stream, so there is no second pass and no estimate.",
        cols: [
          [["app", "Your app", "stream: true", "l:AppWindow"]],
          [["gw", "Gateway", "SSE passthrough", "l:Network", true]],
          [["prov", "Provider", "OpenAI compatible", "b:OpenAI"], ["ledger", "Token ledger", "immutable event", "l:Receipt"]],
        ],
        flow: ["app>gw", "gw>prov", "prov>gw|info|chunk 1", "gw>app|ok|first token 180 ms", "prov>gw|info|chunk 2", "gw>app", "prov>gw|info|done", "gw>ledger|info|412 tokens metered"],
      },
    },
    {
      id: "gateway-failmode",
      title: "Fail open or fail closed, per tenant",
      lead: "If a dependency such as the policy store cannot be reached, each tenant decides what happens. A tenant that values availability forwards and logs it. A tenant that values control refuses with a Retry-After header.",
      spec: {
        alt: "Two tenants send requests while the policy store is unreachable. The fail-open tenant is forwarded and flagged. The fail-closed tenant receives a 503 with Retry-After.",
        caption: "Same outage, two different and deliberate behaviours.",
        cols: [
          [["a", "Tenant: support", "fail open", "l:Users"], ["b", "Tenant: payments", "fail closed", "l:Lock"]],
          [["gw", "Gateway", "", "l:Network", true]],
          [["dep", "Policy store", "unreachable", "l:Database"], ["prov", "Provider", "", "b:Anthropic"]],
        ],
        flow: ["a>gw", "gw>dep|bad|timeout", "gw>prov|warn|forwarded, flagged", "---", "b>gw", "gw>dep|bad|timeout", "gw>b|bad|503 Retry-After 5"],
      },
    },
    {
      id: "gateway-identity",
      title: "Keys for applications, tokens for services",
      lead: "Applications present an API key that is stored only as a hash. Service accounts exchange an identity provider assertion for a short-lived JWT. Either way the request carries a verified scope when it reaches policy.",
      spec: {
        alt: "An application sends an API key that is matched by hash. A service account gets a short-lived JWT from the identity provider. Both reach the gateway with a resolved scope.",
        caption: "No secret is stored in a form that can be replayed, and none is logged.",
        cols: [
          [["app", "Application", "API key", "l:KeyRound"], ["svc", "Service account", "workload identity", "l:Bot"]],
          [["idp", "Identity provider", "OIDC", "b:Okta"]],
          [["gw", "Gateway", "resolve scope", "l:Network", true]],
          [["pol", "Policy and budget", "tenant, project, app", "l:ShieldCheck"]],
        ],
        flow: ["app>gw|ok|hash matched", "gw>pol|info|scope resolved", "---", "svc>idp|info|assertion", "idp>svc|ok|JWT, 10 min", "svc>gw|ok|JWT verified", "gw>pol|info|scope resolved"],
      },
    },
  ],

  // ------------------------------------------------------------------------------------------------ Policy Engine
  "policy-engine": [
    {
      id: "policy-deny",
      title: "Deny overrides, and says why",
      lead: "All rules that apply are evaluated against one request context. If any rule denies, the request is denied, and the rule that decided is recorded with the decision so a refusal can be explained later.",
      spec: {
        alt: "A request context is checked by an allow rule and a deny rule. The deny rule wins and the reason is written to the audit trail.",
        caption: "One deny is enough, and the reason travels with the decision.",
        cols: [
          [["ctx", "Request context", "model, region, tokens", "l:FileText"]],
          [["allow", "Allow model list", "gpt-5, claude-sonnet-5", "l:ListChecks"], ["deny", "Deny rule", "*-preview", "l:ShieldAlert"]],
          [["dec", "Decision", "deny overrides", "l:Scale", true]],
          [["audit", "Audit trail", "rule id, version", "l:Archive"]],
        ],
        flow: ["ctx>allow|ok|matches", "ctx>deny|bad|matches", "allow>dec", "deny>dec|bad|denied", "dec>audit|info|reason recorded"],
      },
    },
    {
      id: "policy-inherit",
      title: "Set once, inherit down, tighten only",
      lead: "A rule at the organisation reaches every tenant, project and application below it. A lower level can add rules and lower limits. It can never loosen what it inherited.",
      spec: {
        alt: "A policy at the organisation flows to a tenant, a project and an application. The tenant lowers a token limit and the effective rules are shown at the application.",
        caption: "The effective rule set at any level is the union of what it inherited and what it added.",
        cols: [
          [["org", "Organisation", "approved models", "l:Building2", true]],
          [["ten", "Tenant: prod", "region EU only", "l:Layers"]],
          [["prj", "Project: support", "50k tokens per request", "l:Briefcase"]],
          [["app", "Application", "effective rules", "l:AppWindow"]],
        ],
        flow: ["org>ten|info|inherits", "ten>prj|info|adds region rule", "prj>app|info|lowers token cap", "---", "prj>app|bad|cannot raise cap"],
      },
    },
    {
      id: "policy-simulate",
      title: "Simulate a change before it goes live",
      lead: "Replay a draft policy against recent requests and see what it would have blocked. Publishing needs the right role, and a change to the organisation baseline needs a second approver.",
      spec: {
        alt: "A draft policy and recent requests go to a simulator, which produces a report of what would be blocked. After approval the policy is published as a new version.",
        caption: "Find the surprise in a report, not in production.",
        cols: [
          [["draft", "Draft policy", "version 5", "l:FileText"], ["traffic", "Recent requests", "last 7 days", "l:Database"]],
          [["sim", "Simulator", "no side effects", "l:Cpu", true]],
          [["rep", "Report", "would block 214 of 10,000", "l:ClipboardCheck"]],
          [["appr", "Approver", "second person", "l:UserCheck"]],
          [["live", "Published", "version 5 live", "l:Rocket"]],
        ],
        flow: ["draft>sim", "traffic>sim|info|replay", "sim>rep|warn|214 would be blocked", "rep>appr", "appr>live|ok|approved"],
      },
    },
  ],

  // ------------------------------------------------------------------------------------------------ Cost and Budgets
  "cost-and-budgets": [
    {
      id: "budget-ladder",
      title: "A ladder, not a cliff",
      lead: "Every request updates the count that budgets read. At the warning threshold the owners are told. At the next the gateway throttles. At the limit it blocks. Each step is a setting, and each is recorded.",
      spec: {
        alt: "Spend rises against a budget. At 80 percent owners are warned, at 95 percent requests are throttled and at 100 percent they are blocked.",
        caption: "The response gets firmer as usage climbs, and the owners hear first.",
        cols: [
          [["led", "Token ledger", "live count", "l:Receipt"]],
          [["bud", "Budget: project", "$5,000 per month", "l:Wallet", true]],
          [["warn", "Notify owners", "Slack and email", "b:Slack"], ["thr", "Throttle", "lower rate", "l:Gauge"], ["blk", "Block", "429 over budget", "l:Lock"]],
        ],
        flow: ["led>bud|info|80% used", "bud>warn|warn|warn", "---", "led>bud|info|95% used", "bud>thr|warn|throttle", "---", "led>bud|info|100% used", "bud>blk|bad|block"],
      },
    },
    {
      id: "budget-chargeback",
      title: "From a request to a chargeback line",
      lead: "The cost engine prices each accounting event using provider rates, currency and your contract terms, and allocates it to a team and a cost centre. The report matches the invoice because it uses the same terms.",
      spec: {
        alt: "Accounting events are priced by the cost engine using provider rates and contract terms, then allocated to teams and sent to finance as a chargeback report.",
        caption: "Allocation follows the tenant tree, so no one maintains a spreadsheet.",
        cols: [
          [["evt", "Accounting events", "per request", "l:Receipt"]],
          [["cost", "Cost engine", "rates, currency, terms", "l:TrendingUp", true]],
          [["alloc", "Allocation", "team, cost centre", "l:Users"]],
          [["fin", "Chargeback", "monthly report", "b:SAP"]],
        ],
        flow: ["evt>cost|info|412 tokens", "cost>alloc|ok|$0.0061 priced", "alloc>fin|info|support-ml, CC 4410"],
      },
    },
    {
      id: "budget-quota",
      title: "Quotas limit the rate, budgets limit the spend",
      lead: "A quota caps requests or tokens per minute. A budget caps what a period may cost. A request has to pass both, and each refusal says which limit it hit.",
      spec: {
        alt: "A request passes a quota gate and then a budget gate before reaching the provider. A burst is refused by the quota with Retry-After.",
        caption: "Two different limits, two different answers.",
        cols: [
          [["app", "Application", "", "l:AppWindow"]],
          [["q", "Quota gate", "600 requests per minute", "l:Gauge"]],
          [["b", "Budget gate", "monthly cost", "l:Wallet"]],
          [["p", "Provider", "", "b:OpenAI"]],
        ],
        flow: ["app>q", "q>b|ok|within rate", "b>p|ok|within budget", "---", "app>q|bad|429 Retry-After 12 s"],
      },
    },
  ],

  // ------------------------------------------------------------------------------------------------ Cost Optimization
  "cost-optimization": [
    {
      id: "optimization-path",
      title: "Cache first, then clean, then send",
      lead: "A repeated question is answered from the cache and costs no tokens. Anything else is cleaned by lossless stages before it leaves, and the savings ledger records the tokens before and after.",
      spec: {
        alt: "A request checks the response cache. A miss is cleaned by lossless stages and sent to the provider with fewer tokens, and the savings are recorded. A repeated request is answered from the cache.",
        caption: "The first request is shorter. The repeat is free.",
        cols: [
          [["app", "Your app", "same request", "l:AppWindow"]],
          [["cache", "Response cache", "exact, then similar", "l:Database"]],
          [["clean", "Clean the prompt", "lossless stages", "l:Layers", true]],
          [["prov", "Provider", "fewer tokens", "b:OpenAI"], ["ledger", "Savings ledger", "before and after", "l:Receipt"]],
        ],
        flow: ["app>cache", "cache>clean|info|miss", "clean>prov|ok|4,812 in, 2,967 sent", "prov>ledger|info|1,845 saved", "---", "app>cache", "cache>app|ok|answered from cache, 0 tokens"],
      },
    },
    {
      id: "optimization-guard",
      title: "A quality check that can switch it off",
      lead: "For a sample of requests the gateway also sends the original prompt and compares the answers. While scores stay above the floor, nothing changes. If they fall below it, the lossy stages turn off for that application and its owner is told.",
      spec: {
        alt: "A sample of optimized requests is replayed with the original prompt and the answers compared. Above the floor the application carries on. Below it the lossy stages are turned off and the owner is notified.",
        caption: "Quality is measured against the original, and a miss stops the savings, not the application.",
        cols: [
          [["req", "Live request", "optimized", "l:AppWindow"]],
          [["shadow", "Shadow replay", "original prompt", "l:Cpu", true]],
          [["cmp", "Compare answers", "and critical details", "l:ClipboardCheck"]],
          [["ok", "Carry on", "above the floor", "l:ShieldCheck"], ["off", "Lossy stages off", "below the floor", "l:Lock"]],
          [["owner", "Notify owner", "", "l:UserCheck"]],
        ],
        flow: ["req>shadow|info|sampled", "shadow>cmp|info|two answers", "cmp>ok|ok|98.9% agree", "---", "req>shadow|info|sampled", "shadow>cmp|info|two answers", "cmp>off|bad|94.8%, floor is 96%", "off>owner|warn|owner told"],
      },
    },
  ],

  // ------------------------------------------------------------------------------------------------ Documents
  documents: [
    {
      id: "documents-pipeline",
      title: "Scan, read, mask, store",
      lead: "A file passes malware scanning first. Clean files are read, with OCR for scans, and personal data is masked according to the document policy before the canonical document is stored. An infected file is quarantined and never read.",
      spec: {
        alt: "An uploaded file is scanned. Clean files are extracted, masked and stored as a canonical document. An infected file goes to quarantine.",
        caption: "Nothing is read before it has been scanned, and nothing is stored before it has been masked.",
        cols: [
          [["up", "Upload", "PDF, Office, image", "l:FileText"]],
          [["scan", "Malware scan", "", "l:ShieldCheck"]],
          [["ext", "Extract and OCR", "text and tables", "l:ScanText"], ["q", "Quarantine", "held for review", "l:Lock"]],
          [["mask", "Mask personal data", "per policy", "l:EyeOff"]],
          [["cad", "Canonical document", "stored once", "l:Archive", true]],
        ],
        flow: ["up>scan", "scan>ext|ok|clean", "ext>mask|info|12 pages read", "mask>cad|ok|3 values masked", "---", "up>scan", "scan>q|bad|infected, quarantined"],
      },
    },
    {
      id: "documents-once",
      title: "Process once, reuse everywhere",
      lead: "Each file is identified by its SHA-256 hash. The first request pays for extraction. Every later request for the same file skips it and goes straight to the stored canonical document.",
      spec: {
        alt: "The first upload of a file goes through extraction. A second request for the same file is matched by hash and reuses the stored document.",
        caption: "The saving grows with every repeat, and it applies to every provider.",
        cols: [
          [["req", "Request with file", "", "l:AppWindow"]],
          [["hash", "SHA-256 lookup", "", "l:Fingerprint", true]],
          [["ext", "Extraction", "scan, read, mask", "l:ScanText"], ["cad", "Canonical document", "cached", "l:Archive"]],
          [["model", "Model call", "any provider", "b:Anthropic"]],
        ],
        flow: ["req>hash", "hash>ext|warn|new file", "ext>cad|info|stored", "cad>model", "---", "req>hash", "hash>cad|ok|match, skip extraction", "cad>model"],
      },
    },
    {
      id: "documents-priced",
      title: "Priced before the model is called",
      lead: "Token and cost estimates come from the processed document, so a policy can refuse a file that is too long or too costly before any provider is charged.",
      spec: {
        alt: "A processed document is given a token estimate. Policy and budget gates refuse an oversized file before the model call and allow a normal one.",
        caption: "The refusal happens before the spend, with a reason the user can act on.",
        cols: [
          [["cad", "Canonical document", "token estimate", "l:FileText"]],
          [["pol", "Document policy", "max 200 pages", "l:ShieldCheck", true]],
          [["bud", "Budget", "project cap", "l:Wallet"]],
          [["model", "Model call", "", "b:OpenAI"]],
        ],
        flow: ["cad>pol|info|40 pages", "pol>bud|ok|within limits", "bud>model|ok|allowed", "---", "cad>pol|info|900 pages", "pol>cad|bad|over the page limit"],
      },
    },
  ],

  // ------------------------------------------------------------------------------------------------ Observability and Audit
  observability: [
    {
      id: "obs-stream",
      title: "Every request becomes an event",
      lead: "The gateway publishes one accounting event per request. Events are stored in the analytics database and read by Analytics Explorer, Usage Explorer and the dashboards, so every screen shows the same numbers.",
      spec: {
        alt: "The gateway publishes events to a stream. The stream feeds an analytics store, which serves dashboards and exports.",
        caption: "One stream, one set of numbers, many views.",
        cols: [
          [["gw", "Gateway", "event per request", "l:Network"]],
          [["bus", "Event stream", "Kafka", "b:Apache Kafka"]],
          [["db", "Analytics store", "ClickHouse", "b:ClickHouse", true]],
          [["ui", "Analytics Explorer", "slice by tenant, model", "l:BarChart3"], ["exp", "Metrics tools", "Grafana, Datadog", "b:Grafana"]],
        ],
        flow: ["gw>bus|info|event", "bus>db|info|inserted", "db>ui|ok|cost by tenant", "db>exp|info|exported"],
      },
    },
    {
      id: "obs-audit",
      title: "An audit trail that cannot be edited",
      lead: "Every administrative change records who, what, before and after, and the request context. The store accepts appends only. An attempt to change or delete an entry through the application is refused.",
      spec: {
        alt: "An administrator changes a policy and the change is appended to the audit log. An attempt to edit an existing entry is rejected. An evidence package can be exported.",
        caption: "Append-only by construction, so the trail holds up in front of an auditor.",
        cols: [
          [["adm", "Administrator", "changes a policy", "l:UserCheck"]],
          [["svc", "Control plane", "", "l:Server", true]],
          [["log", "Audit log", "append only", "l:Archive"]],
          [["evi", "Evidence package", "signed export", "l:FileCheck"]],
        ],
        flow: ["adm>svc", "svc>log|ok|appended: who, what, before, after", "log>evi|info|exported", "---", "adm>svc", "svc>log|bad|edit refused"],
      },
    },
    {
      id: "obs-alert",
      title: "Alerts that reach a person",
      lead: "Rules watch spend, error rates and anomalies. When one fires, the alert goes to the channel bound to that rule and stays open until someone acknowledges it, with their name and the time recorded.",
      spec: {
        alt: "An anomaly detector fires a rule that sends alerts to chat and email. An owner acknowledges the alert and the acknowledgement is recorded.",
        caption: "A fired alert has an owner, and the acknowledgement is part of the record.",
        cols: [
          [["det", "Anomaly detector", "spend, errors", "l:Activity"]],
          [["rule", "Alert rule", "above 3 sigma", "l:Siren", true]],
          [["chat", "Slack", "#ai-ops", "b:Slack"], ["mail", "Email", "owners", "l:Mail"]],
          [["own", "Owner", "acknowledges", "l:UserCheck"]],
        ],
        flow: ["det>rule|warn|spend spike", "rule>chat|warn|alert sent", "rule>mail|warn|alert sent", "chat>own|info|acknowledged by priya"],
      },
    },
  ],

  // ------------------------------------------------------------------------------------------------ Provider Registry
  "provider-registry": [
    {
      id: "provider-breaker",
      title: "A circuit breaker for each provider",
      lead: "After repeated timeouts the router stops sending traffic to a provider and uses the next target. It probes the provider in the background and closes the breaker when it answers again.",
      spec: {
        alt: "The router fails to reach a provider three times and opens the breaker. Traffic goes to the next provider. A probe later succeeds and the breaker closes.",
        caption: "Failover without a deploy, and recovery without a person.",
        cols: [
          [["app", "Application", "", "l:AppWindow"]],
          [["rt", "Router", "health aware", "l:Route", true]],
          [["p1", "Primary", "OpenAI", "b:OpenAI"], ["p2", "Fallback", "Anthropic", "b:Anthropic"]],
        ],
        flow: ["app>rt", "rt>p1|bad|timeout x3, breaker open", "rt>p2|warn|failover", "---", "app>rt", "rt>p2|ok|breaker open, used directly", "---", "rt>p1|info|probe", "p1>rt|ok|healthy, breaker closed"],
      },
    },
    {
      id: "provider-region",
      title: "Region and sensitivity decide the route",
      lead: "An EU tenant is only routed to EU endpoints. Traffic classed as sensitive is pinned to a model running in your own network, such as vLLM or Ollama. A route that breaks the rule is refused, not rerouted.",
      spec: {
        alt: "An EU tenant is routed to an EU endpoint and refused a US one. A sensitive workload is pinned to a self-hosted model.",
        caption: "Data residency is a routing rule, enforced where the request is sent.",
        cols: [
          [["eu", "EU tenant", "region: EU", "l:Globe"], ["sens", "Sensitive workload", "classified", "l:Lock"]],
          [["rt", "Router", "constraints", "l:Route", true]],
          [["eue", "Azure OpenAI", "West Europe", "b:Azure OpenAI"], ["us", "US endpoint", "us-east", "l:Cloud"], ["own", "Self-hosted", "vLLM in your network", "l:Server"]],
        ],
        flow: ["eu>rt", "rt>eue|ok|EU endpoint", "rt>us|bad|region not allowed", "---", "sens>rt", "rt>own|ok|pinned to self-hosted"],
      },
    },
    {
      id: "provider-alias",
      title: "Applications ask for an alias, not a model",
      lead: "An alias such as chat-default maps to an ordered list of provider and model targets. Changing the list changes where every application sends its traffic, with no code change and no redeploy. Provider keys are read from your secret manager at call time.",
      spec: {
        alt: "An application requests the alias chat-default. The registry resolves it to an ordered list of targets and reads the provider key from the secret manager.",
        caption: "Swap a model by editing a list, and keep the keys out of the database.",
        cols: [
          [["app", "Application", "model: chat-default", "l:AppWindow"]],
          [["reg", "Model registry", "alias to targets", "l:Boxes", true]],
          [["vault", "Secret manager", "key by reference", "l:KeyRound"]],
          [["t1", "Target 1", "claude-sonnet-5", "b:Anthropic"], ["t2", "Target 2", "gpt-5", "b:OpenAI"]],
        ],
        flow: ["app>reg|info|chat-default", "reg>vault|info|resolve key reference", "vault>reg|ok|key in memory only", "reg>t1|ok|first target"],
      },
    },
  ],

};

/** Diagrams for the MLOps topic pages, keyed by topic slug. Kept apart because some slugs, such as observability, exist in both. */
export const MLOPS_DIAGRAMS: Record<string, Diagram[]> = {
  "pipeline-builder": [
    {
      id: "pb-spec",
      title: "Two ways to author, one specification",
      lead: "The canvas and the guided wizard both write the same versioned spec, so you can switch at any point. Validation runs on every change, and publishing freezes a version with a content digest.",
      spec: {
        alt: "The canvas and the wizard both write one pipeline spec. The spec is validated and published as an immutable version with a digest.",
        caption: "Switching views never loses work, because there is only one document.",
        cols: [
          [["canvas", "Canvas", "typed ports", "l:Workflow"], ["wiz", "Guided wizard", "questions", "l:ListChecks"]],
          [["spec", "Pipeline spec", "versioned YAML", "l:FileText", true]],
          [["val", "Validation", "ports, secrets, policy", "l:ShieldCheck"]],
          [["ver", "Version", "immutable, digest", "l:Archive"]],
        ],
        flow: ["canvas>spec|info|edit", "wiz>spec|info|edit", "spec>val", "val>spec|bad|port types do not match", "val>ver|ok|published sha256:d8eb"],
      },
    },
    {
      id: "pb-run",
      title: "From a published version to a finished run",
      lead: "A run starts from an immutable snapshot of the spec. Operators execute in dependency order with retries and timeouts, an approval gate can pause the run, and every step writes events you can replay.",
      spec: {
        alt: "A run starts from a published version, executes operators in order, pauses at an approval gate and then finishes with events recorded.",
        caption: "The run is reproducible, because it executes a snapshot and not a draft.",
        cols: [
          [["ver", "Version v3", "snapshot", "l:Archive"]],
          [["eng", "Run engine", "retry, timeout", "l:Cpu", true]],
          [["build", "Build image", "", "l:Hammer"], ["gate", "Approval gate", "production", "l:UserCheck"]],
          [["dep", "Deploy", "canary", "l:Rocket"]],
        ],
        flow: ["ver>eng", "eng>build|ok|succeeded", "build>gate|warn|waiting for approval", "gate>dep|ok|approved by a second person", "dep>eng|info|run finished"],
      },
    },
  ],
  "model-registry": [
    {
      id: "mr-approval",
      title: "Production needs someone other than the author",
      lead: "A version moves to production only after an approver who did not register it signs off. An author who tries to approve their own version is refused, and every decision is written to the audit log.",
      spec: {
        alt: "A developer registers a model version. The author cannot approve it. A different approver approves and the version moves to production and the decision is audited.",
        caption: "Separation of duties is enforced by the service, not by convention.",
        cols: [
          [["dev", "Author", "registers v4", "l:UserRound"], ["apr", "Approver", "different person", "l:UserCheck"]],
          [["reg", "Model registry", "version v4, staging", "l:Boxes", true]],
          [["prod", "Production stage", "", "l:Rocket"]],
          [["aud", "Audit log", "", "l:Archive"]],
        ],
        flow: ["dev>reg|info|registered", "dev>reg|bad|author cannot approve", "apr>reg|ok|approved with note", "reg>prod|ok|v4 in production", "reg>aud|info|decision recorded"],
      },
    },
    {
      id: "mr-provenance",
      title: "Provenance travels with the version",
      lead: "Each version records its source, its content digest, evaluation results and the pipeline run that produced it. You can see which deployments run it and whether a rollback target exists.",
      spec: {
        alt: "A pipeline run produces an artifact that is registered with a digest and metrics. The registry links the version to the deployments that serve it.",
        caption: "From a deployment you can walk back to the run, the source and the metrics.",
        cols: [
          [["run", "Pipeline run", "run-7f3a91c2", "l:Workflow"]],
          [["art", "Artifact", "sha256 digest", "l:Package"]],
          [["reg", "Model registry", "version, metrics", "l:Boxes", true]],
          [["dep", "Deployment", "serving v4", "l:Rocket"], ["prev", "Rollback target", "v3", "l:Undo2"]],
        ],
        flow: ["run>art|info|built", "art>reg|ok|registered with metrics", "reg>dep|info|serves v4", "reg>prev|info|previous version kept"],
      },
    },
  ],
  deployments: [
    {
      id: "dep-canary",
      title: "Canary, compare, promote or abort",
      lead: "Send a share of traffic to the new version, watch its error rate and latency against the stable version, then promote it or abort. Production changes need an approver.",
      spec: {
        alt: "Traffic is split between a stable version and a canary. Metrics are compared. The canary is promoted after approval, or aborted when it is worse.",
        caption: "The decision is made on measured behaviour, and the old version stays ready.",
        cols: [
          [["lb", "Traffic split", "90 / 10", "l:Route", true]],
          [["st", "Stable v3", "90%", "l:Server"], ["cn", "Canary v4", "10%", "l:Rocket"]],
          [["met", "Metrics", "errors, latency", "l:LineChart"]],
          [["dec", "Promote or abort", "approver", "l:UserCheck"]],
        ],
        flow: ["lb>st", "lb>cn|info|10%", "cn>met|info|p95 and errors", "st>met|info|baseline", "met>dec|ok|canary healthy", "dec>lb|ok|promote to 100%", "---", "cn>met|bad|error rate 4x", "met>dec|bad|abort", "dec>lb|warn|back to v3"],
      },
    },
    {
      id: "dep-rollback",
      title: "Roll back in one step",
      lead: "When an objective is breached, the previous version comes back through the same connector, and the rollback is checked by observing the endpoint, not by trusting the call.",
      spec: {
        alt: "A deployment breaches an objective. The control plane asks the target to roll back to the previous version and verifies by observing the endpoint.",
        caption: "A rollback is only reported as done after the endpoint is observed healthy.",
        cols: [
          [["obs", "Observation", "error rate above objective", "l:Activity"]],
          [["cp", "Control plane", "", "l:Server", true]],
          [["tgt", "Serving target", "KServe, Kubernetes", "b:Kubernetes"]],
          [["ver", "Verify", "endpoint healthy", "l:ShieldCheck"]],
        ],
        flow: ["obs>cp|bad|objective breached", "cp>tgt|warn|roll back to v3", "tgt>ver|info|v3 serving", "ver>cp|ok|verified, rollback complete"],
      },
    },
  ],
  "build-agents": [
    {
      id: "ba-enrol",
      title: "An agent that connects out and never in",
      lead: "The agent opens an outbound TLS connection and polls for work. Jobs are signed by the control plane, and the agent refuses any job whose signature or allowlist entry does not check out. No inbound firewall rule is needed.",
      spec: {
        alt: "The agent polls the control plane over outbound TLS. It runs a signed job and refuses an unsigned one.",
        caption: "The network boundary stays closed, and the signature decides what runs.",
        cols: [
          [["cp", "Control plane", "signs jobs", "l:Server", true]],
          [["ag", "Build agent", "your network", "l:Hammer"]],
          [["run", "Job sandbox", "build, scan", "l:Package"], ["rej", "Refused", "", "l:ShieldAlert"]],
          [["reg", "Registry", "your registry", "b:Harbor"]],
        ],
        flow: ["ag>cp|info|poll over TLS", "cp>ag|ok|signed job", "ag>run|ok|signature valid", "run>reg|info|image pushed", "---", "ag>cp|info|poll", "cp>ag|bad|unsigned job", "ag>rej|bad|refused"],
      },
    },
    {
      id: "ba-result",
      title: "Results come back scrubbed",
      lead: "Logs and results are scrubbed for secrets before they leave the agent. The control plane stores references and digests, not credentials, and shows status as the job progresses.",
      spec: {
        alt: "A build runs on the agent. Logs are scrubbed of secrets before being sent to the control plane, which shows job status in the console.",
        caption: "What reaches the control plane has already been cleaned.",
        cols: [
          [["job", "Build job", "running", "l:Hammer"]],
          [["scr", "Scrubber", "removes secrets", "l:EyeOff", true]],
          [["cp", "Control plane", "status, digest", "l:Server"]],
          [["ui", "Console", "run page", "l:AppWindow"]],
        ],
        flow: ["job>scr|info|log line with a token", "scr>cp|ok|redacted line", "cp>ui|info|status: building", "job>scr|info|image digest", "scr>cp|ok|digest stored"],
      },
    },
  ],
  observability: [
    {
      id: "mo-capacity",
      title: "Saturation before users feel it",
      lead: "Replicas are shown against their autoscaling limits next to GPU use, memory and queue depth. A deployment at its maximum with a growing queue is flagged so you can act before latency climbs.",
      spec: {
        alt: "Endpoint metrics from Prometheus show replicas at their maximum and a growing queue. The capacity view flags the deployment and raises an alert.",
        caption: "Headroom is a number you can see, not a surprise.",
        cols: [
          [["ep", "Inference endpoint", "5 of 5 replicas", "l:Server"]],
          [["prom", "Prometheus", "metrics", "b:Prometheus"]],
          [["cap", "Capacity view", "headroom", "l:Gauge", true]],
          [["al", "Alert", "no headroom", "l:Siren"]],
        ],
        flow: ["ep>prom|info|queue 48, GPU 92%", "prom>cap|info|scraped", "cap>al|warn|at max replicas, queue growing"],
      },
    },
    {
      id: "mo-ack",
      title: "Acknowledge with a name and a time",
      lead: "An alert stays open until someone acknowledges it. The acknowledgement is written to the audit log with who and when, and the cost shown beside it is labelled as an estimate.",
      spec: {
        alt: "A firing alert is acknowledged by an on-call engineer, and the acknowledgement is written to the audit log.",
        caption: "Ownership of an alert is a recorded fact.",
        cols: [
          [["al", "Firing alert", "latency p95", "l:Siren"]],
          [["oc", "On call", "priya", "l:UserCheck"]],
          [["cp", "Control plane", "", "l:Server", true]],
          [["aud", "Audit log", "", "l:Archive"]],
        ],
        flow: ["al>oc|warn|notified", "oc>cp|ok|acknowledge", "cp>aud|info|priya, 04:55"],
      },
    },
  ],
  "agent-builder": [
    {
      id: "ab-briefing",
      title: "A scheduled agent with a person in the loop",
      lead: "A schedule starts the pipeline. A business-hours window holds it until the working day. The agent reads the calendar, asks a model through the gateway for a summary and drafts an email. Nothing is sent until it is approved.",
      spec: {
        alt: "A cron schedule starts an agent that waits for business hours, reads a calendar, asks a model through the gateway, drafts an email and waits for approval before sending.",
        caption: "Drafts are the default, and sending is a decision.",
        cols: [
          [["cron", "Schedule", "weekdays 07:30", "l:Clock"]],
          [["win", "Business hours", "holiday calendar", "l:Calendar"]],
          [["cal", "Calendar", "today's events", "b:Google Calendar"], ["llm", "Model via gateway", "policy and budget", "l:Brain", true]],
          [["mail", "Draft email", "not sent", "l:Mail"]],
          [["appr", "Approval", "owner", "l:UserCheck"]],
        ],
        flow: ["cron>win|info|07:30", "win>cal|ok|inside business hours", "cal>llm|info|12 events", "llm>mail|ok|summary written", "mail>appr|warn|waiting for approval", "appr>mail|ok|approved, sent"],
      },
    },
    {
      id: "ab-missed",
      title: "Time handled correctly",
      lead: "Schedules use a named time zone, so daylight saving is handled. A missed run follows the rule you chose: skip it, run once, or catch up. Waits hold no compute while they sleep.",
      spec: {
        alt: "A scheduler misses a run during an outage and applies the configured rule: skip, run once or catch up.",
        caption: "What happens after an outage is a setting, not luck.",
        cols: [
          [["sch", "Scheduler", "Asia/Bahrain", "l:Clock", true]],
          [["out", "Missed run", "was down 02:00 to 03:10", "l:Siren"]],
          [["rule", "Missed-run rule", "run once", "l:ListChecks"]],
          [["run", "Pipeline run", "one run now", "l:Workflow"]],
        ],
        flow: ["sch>out|bad|2 runs missed", "out>rule|info|apply rule", "rule>run|ok|run once, skip the rest"],
      },
    },
  ],
  payments: [
    {
      id: "pay-confirm",
      title: "A payment counts when the provider says so, twice",
      lead: "A redirect or a callback is only a hint. The platform verifies the signature of every notification and reads the status back from the provider before it releases the order.",
      spec: {
        alt: "A provider webhook arrives. The platform checks the signature, reads the payment status back from the provider and only then marks the order paid.",
        caption: "Trust the provider's answer, not the message that claims to carry it.",
        cols: [
          [["prov", "Payment provider", "webhook", "b:Stripe"]],
          [["sig", "Signature check", "HMAC", "l:Fingerprint"]],
          [["rb", "Read back", "GET payment", "l:Search", true]],
          [["ord", "Order", "released", "l:PackageCheck"], ["rev", "Held for review", "", "l:ClipboardCheck"]],
        ],
        flow: ["prov>sig|info|payment.succeeded", "sig>rb|ok|signature valid", "rb>prov|info|read status", "rb>ord|ok|paid, 45.00 EUR", "---", "prov>sig|info|payment.succeeded", "sig>rb|ok|valid", "rb>rev|warn|underpaid, held for review"],
      },
    },
    {
      id: "pay-refund",
      title: "Refunds need a second person",
      lead: "The person who requests a refund cannot approve it. Approval is recorded, the provider call is idempotent, and the refund only counts after the provider confirms it.",
      spec: {
        alt: "A refund is requested. The requester cannot approve it. A second person approves and the provider call is made once and confirmed.",
        caption: "Money moves only after two people and one provider confirmation.",
        cols: [
          [["req", "Requester", "asks for refund", "l:UserRound"], ["apr", "Approver", "second person", "l:UserCheck"]],
          [["svc", "Payments service", "idempotent", "l:Receipt", true]],
          [["prov", "Provider", "refund API", "b:Stripe"]],
          [["aud", "Audit log", "", "l:Archive"]],
        ],
        flow: ["req>svc|info|refund 45.00", "req>svc|bad|requester cannot approve", "apr>svc|ok|approved", "svc>prov|info|refund, key RF-1043", "prov>svc|ok|confirmed", "svc>aud|info|recorded"],
      },
    },
  ],
  "mcp-servers": [
    {
      id: "mcp-pin",
      title: "A changed tool is stopped until reviewed",
      lead: "Each approved tool is pinned by the hash of its definition. If the server changes a tool's name, description or schema, calls to it stop until a person reviews the change.",
      spec: {
        alt: "An agent calls an approved tool. The server later changes the tool definition, the hash no longer matches and the tool is blocked until it is reviewed.",
        caption: "A tool cannot quietly change what it does.",
        cols: [
          [["ag", "Agent", "", "l:Bot"]],
          [["gw", "Tool gateway", "pinned hashes", "l:Blocks", true]],
          [["srv", "MCP server", "", "l:Server"]],
          [["rev", "Review queue", "", "l:ClipboardCheck"]],
        ],
        flow: ["ag>gw|info|call search_tickets", "gw>srv|ok|hash matches", "---", "srv>gw|warn|definition changed", "gw>rev|warn|blocked pending review", "gw>ag|bad|tool unavailable"],
      },
    },
    {
      id: "mcp-write",
      title: "Reads run, writes wait for a person",
      lead: "Read-only tools run as called. A tool that changes data waits for approval. Results are redacted and size-limited, and they reach a model only through the gateway.",
      spec: {
        alt: "A read tool runs immediately. A write tool waits for human approval. Results are redacted and returned through the gateway.",
        caption: "The risk of a tool decides how it is handled.",
        cols: [
          [["ag", "Agent", "", "l:Bot"]],
          [["pol", "Tool policy", "read or write", "l:ShieldCheck", true]],
          [["rd", "get_ticket", "read only", "l:Search"], ["wr", "update_ticket", "writes data", "l:FileSignature"]],
          [["hum", "Approver", "", "l:UserCheck"]],
        ],
        flow: ["ag>pol", "pol>rd|ok|runs", "rd>ag|info|redacted result", "---", "ag>pol", "pol>hum|warn|write needs approval", "hum>wr|ok|approved", "wr>ag|info|result"],
      },
    },
  ],
  "custom-mcp-servers": [
    {
      id: "cmcp-publish",
      title: "Define tools, check them, publish a server",
      lead: "You define tools backed by a pipeline, a read-only query, an HTTPS call or a model. Publishing runs the checks, then serves the server at a versioned address with access control and a rate limit.",
      spec: {
        alt: "Tools are defined in the console and checked. Failing checks block publishing. A passing server is hosted at a versioned address.",
        caption: "Unsafe definitions do not get a public address.",
        cols: [
          [["def", "Tool definitions", "pipeline, SQL, HTTPS, model", "l:Blocks"]],
          [["chk", "Publish checks", "writes need approval, one SELECT", "l:ShieldCheck", true]],
          [["host", "Hosted server", "/mcp/support/v3", "l:Server"], ["fix", "Fix and retry", "", "l:Wrench"]],
          [["cli", "Client", "Claude Code, Cursor", "l:Terminal"]],
        ],
        flow: ["def>chk", "chk>host|ok|checks passed", "host>cli|info|tools/list", "---", "def>chk", "chk>fix|bad|write tool has no approval"],
      },
    },
    {
      id: "cmcp-call",
      title: "Every call is authenticated, limited and audited",
      lead: "A client calls a hosted tool with an API key, OAuth or mutual TLS. The call is rate limited, runs the pipeline or query behind it and writes an audit record with the detail you chose to keep.",
      spec: {
        alt: "A client calls a hosted tool with credentials. The call is rate limited, executes the pipeline behind the tool and is recorded in the audit log.",
        caption: "A tool is an API with the same controls as any other.",
        cols: [
          [["cli", "MCP client", "", "l:Terminal"]],
          [["auth", "Access control", "key, OAuth, mTLS", "l:KeyRound"]],
          [["rate", "Rate limit", "60 per minute", "l:Gauge", true]],
          [["tool", "Tool backend", "pipeline", "l:Workflow"]],
          [["aud", "Audit", "", "l:Archive"]],
        ],
        flow: ["cli>auth", "auth>rate|ok|authenticated", "rate>tool|ok|within limit", "tool>aud|info|call recorded", "---", "cli>auth", "auth>rate", "rate>cli|bad|429 limit reached"],
      },
    },
  ],
  "security-and-access": [
    {
      id: "sec-secret",
      title: "Secrets are references, resolved at call time",
      lead: "A connection stores a reference such as secretref://vault/nexi/ml/registry-token. The value is read from your secret manager at the moment of use, held in memory and never logged or exported.",
      spec: {
        alt: "A connection holds only a secret reference. At call time the reference is resolved from the secret manager and used, and the value is never written to storage.",
        caption: "The database holds a pointer. The secret stays where you keep secrets.",
        cols: [
          [["conn", "Connection", "secretref://vault/...", "l:Cable"]],
          [["res", "Resolver", "at call time", "l:KeyRound", true]],
          [["vault", "Secret manager", "Vault", "b:HashiCorp Vault"]],
          [["call", "Target call", "value in memory", "l:Server"]],
        ],
        flow: ["conn>res|info|reference", "res>vault|info|read", "vault>res|ok|value", "res>call|ok|used, then discarded"],
      },
    },
    {
      id: "sec-role",
      title: "Production changes need an approver",
      lead: "Roles decide who can do what in each environment. A developer can change development and staging. A production change waits for an approver, and a control that is disabled always says why.",
      spec: {
        alt: "A developer changes staging directly. A production change is held for an approver and recorded.",
        caption: "The same person, two environments, two different answers.",
        cols: [
          [["dev", "Developer", "", "l:UserRound"]],
          [["rbac", "Role check", "per environment", "l:ShieldCheck", true]],
          [["stg", "Staging", "applied", "l:Server"], ["prod", "Production", "held", "l:Lock"]],
          [["apr", "Approver", "", "l:UserCheck"]],
        ],
        flow: ["dev>rbac|info|change staging", "rbac>stg|ok|allowed", "---", "dev>rbac|info|change production", "rbac>prod|warn|needs approval", "prod>apr|info|requested", "apr>prod|ok|approved, applied"],
      },
    },
  ],

  // ------------------------------------------------------------------------------------------------ RAG indexes
  knowledge: [
    {
      id: "kb-ingest",
      title: "From documents to an index you can query",
      lead: "Sources are read on every sync and only new or changed files are processed again. Each file is scanned, split on its structure, masked if the policy says so, embedded and written to your vector store.",
      spec: {
        alt: "Documents from a bucket and uploads are scanned, split into passages, embedded and written to a vector store.",
        caption: "Only what changed is processed, so a sync of a large library stays cheap.",
        cols: [
          [["bkt", "Bucket", "kb/help-center/", "b:Amazon S3"], ["upl", "Uploads", "PDF, Word, Markdown", "l:FileText"]],
          [["scan", "Scan and mask", "malware, personal data", "l:ShieldCheck"]],
          [["emb", "Split and embed", "512 tokens, 64 overlap", "l:Layers", true]],
          [["idx", "Vector store", "pgvector", "b:PostgreSQL"]],
        ],
        flow: ["bkt>scan|info|3 new, 1 changed", "upl>scan|info|2 files", "scan>emb|ok|clean, 3 values masked", "emb>idx|ok|118 passages upserted"],
      },
    },
    {
      id: "kb-query",
      title: "Retrieval that respects who is asking",
      lead: "An assistant queries a RAG index through the gateway. Results are filtered to what the caller could read in the source system, cut at your minimum score, and returned with their source and page so an answer can be checked.",
      spec: {
        alt: "An assistant sends a question. Retrieval embeds it, searches the index, filters by permissions and minimum score and returns passages with citations.",
        caption: "Permission filtering happens before ranking is returned, not after.",
        cols: [
          [["as", "Assistant", "project: support-ml", "l:Bot"]],
          [["ret", "Retrieve", "top 5, min score 0.35", "l:ScanSearch", true]],
          [["idx", "Vector store", "similarity search", "l:Database"], ["acl", "Permission filter", "caller's access", "l:Lock"]],
          [["res", "Passages", "with source and page", "l:BookOpen"]],
        ],
        flow: ["as>ret|info|question", "ret>idx|info|embed and search", "idx>acl|info|12 candidates", "acl>res|ok|6 allowed, 5 above score", "res>as|ok|cited passages"],
      },
    },
    {
      id: "kb-eval",
      title: "A test set that tells you when retrieval gets worse",
      lead: "Keep questions with the document that should answer them, including questions that should return nothing. Run the set to get recall at 5, mean reciprocal rank and no-answer accuracy, and see exactly which questions failed.",
      spec: {
        alt: "A test set of questions is run against the RAG index. The evaluation computes recall, rank quality and no-answer accuracy and lists failures.",
        caption: "Change the chunk size, run the set, and see whether it helped.",
        cols: [
          [["qs", "Test questions", "8, with expected source", "l:ListChecks"]],
          [["kb", "RAG index", "retrieval", "l:Database", true]],
          [["ev", "Evaluation", "recall at 5, MRR", "l:BarChart3"]],
          [["fail", "Failed questions", "to fix", "l:ClipboardCheck"]],
        ],
        flow: ["qs>kb|info|run all", "kb>ev|ok|recall at 5 is 83%", "ev>fail|warn|2 questions missed"],
      },
    },
  ],

  // ------------------------------------------------------------------------------------------------ Model library
  "model-library": [
    {
      id: "ml-upload",
      title: "Upload a model, and prove what is in it",
      lead: "An uploaded file is checksummed in your browser, its format is inspected, and pickle based formats are scanned for code that would run on load. A file that fails a blocking check is rejected and never reaches the registry.",
      spec: {
        alt: "A model file is uploaded with a checksum. Format inspection and a pickle scan run. A safe file is stored and an unsafe one is rejected.",
        caption: "Safetensors, GGUF and ONNX are inspected. Executable pickles are blocked.",
        cols: [
          [["up", "Upload", "model file", "l:Package"]],
          [["chk", "Checksum", "SHA-256 verified", "l:Fingerprint"]],
          [["insp", "Inspect and scan", "format, pickle opcodes", "l:ShieldCheck", true]],
          [["store", "Stored version", "pending approval", "l:Archive"], ["rej", "Rejected", "", "l:ShieldAlert"]],
        ],
        flow: ["up>chk", "chk>insp|ok|digest matches", "insp>store|ok|safetensors, clean", "---", "up>chk", "chk>insp|ok|digest matches", "insp>rej|bad|pickle runs code on load"],
      },
    },
    {
      id: "ml-library",
      title: "Publish to the library, import to your registry",
      lead: "Platform operators publish approved models to the library. Teams import a model into their own registry, where it becomes a version with its source recorded. Operators can withdraw a version, and importers are told.",
      spec: {
        alt: "An operator publishes a model to the library. A team imports it into its registry. The operator later withdraws a version.",
        caption: "One reviewed model, many teams, and a way back if it is withdrawn.",
        cols: [
          [["op", "Platform operator", "reviews and publishes", "l:UserCheck"]],
          [["lib", "Model library", "approved models", "l:Library", true]],
          [["team", "Team registry", "imported version", "l:Boxes"]],
          [["dep", "Deployment", "serves it", "l:Rocket"]],
        ],
        flow: ["op>lib|ok|published", "lib>team|info|imported, source recorded", "team>dep|ok|deployed", "---", "op>lib|warn|withdraw version", "lib>team|warn|importers notified"],
      },
    },
  ],
};

export const diagramsFor = (slug: string, area: "product" | "mlops" = "product"): Diagram[] => (area === "mlops" ? MLOPS_DIAGRAMS : PRODUCT_DIAGRAMS)[slug] ?? [];
