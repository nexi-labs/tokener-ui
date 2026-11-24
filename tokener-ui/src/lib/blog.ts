/**
 * Blog posts as typed blocks, so each article can carry its own diagrams, lists, figures and code.
 * Diagram kinds are the keys of IndustryArt (hand-drawn scenes) and the ids of SCENES (animated flows).
 */
import { GUIDE_POSTS } from "./blog-guides";
import { REFINERY_POSTS } from "./blog-refinery";
import { AGENT_OS_POSTS } from "./blog-agent-os";

export type Block =
  | { t: "p"; x: string }
  | { t: "h"; x: string }
  | { t: "ul"; items: string[] }
  | { t: "art"; kind: string }
  | { t: "scene"; id: string }
  | { t: "callout"; title: string; x: string }
  | { t: "stats"; items: [string, string][] }
  | { t: "code"; lang: string; code: string }
  /** A real console screenshot in a browser frame. Files are 2400 by 1500 unless w and h say otherwise. */
  | { t: "shot"; src: string; url: string; alt: string; caption?: string; w?: number; h?: number }
  /** Numbered instructions for someone doing it for the first time. */
  | { t: "steps"; items: [string, string][] }
  /** Plain-language terms, one line each. */
  | { t: "defs"; items: [string, string][] }
  /** A call to action that opens a console page. Visitors are asked to sign in first and can preview with sample data. */
  | { t: "try"; href: string; label: string; note?: string }
  /** Related reading, as a short list of links. */
  | { t: "links"; items: [string, string][] };

export type Post = { slug: string; title: string; date: string; tag: string; summary: string; read: string; art: string; blocks: Block[] };

export const POSTS: Post[] = [
  ...AGENT_OS_POSTS,
  ...REFINERY_POSTS,
  ...GUIDE_POSTS,
  {
    slug: "why-an-ai-control-plane",
    title: "Why every AI program ends up needing a control plane",
    date: "Oct 2026",
    tag: "Product",
    read: "7 min",
    art: "enterprise",
    summary: "Provider keys in repos, invoices nobody can explain, and no answer for the auditor. The pattern repeats, and so does the fix.",
    blocks: [
      { t: "p", x: "Teams usually start with a provider key in an environment variable. It works, so the second team copies it. A year later there are dozens of keys, several providers, and a monthly invoice that no one can break down by team, product or purpose." },
      { t: "art", kind: "enterprise" },
      { t: "h", x: "Three concerns tangled into application code" },
      { t: "p", x: "Look at how a typical service calls a model and you will find three separate questions answered in the same few lines. Who is allowed to call this model with this data? How much may they spend? What happened afterward, and can we prove it? Each team answers them differently, and each answer lives in code that has to be changed, reviewed and deployed whenever the answer changes." },
      { t: "ul", items: [
        "Access: provider keys copied between repositories, shared by everyone, rotated by nobody.",
        "Spend: usage discovered on the invoice, a month after the money was gone.",
        "Evidence: logs that differ per service, so an audit becomes a research project.",
      ] },
      { t: "p", x: "A control plane pulls those three concerns out of the application and puts them in one place. Changing a model becomes a configuration change. A budget becomes a number someone can edit. An audit becomes a query." },
      { t: "scene", id: "gateway" },
      { t: "h", x: "What sits in the path" },
      { t: "p", x: "tok∑ner sits between applications and providers as an OpenAI-compatible gateway. Every request is authenticated, checked against policy and budget, routed, and metered, and the result lands in an immutable ledger. Applications keep their client and change one base URL. Because rejection happens early, a request that fails policy never reaches a provider and never costs a token." },
      { t: "callout", title: "The test we use", x: "If a model provider disappeared tomorrow, how many repositories would you need to change? If the answer is more than zero, the routing decision still lives in application code." },
      { t: "h", x: "Why it keeps happening" },
      { t: "p", x: "None of this is anyone's mistake. The first integration is fast because nothing stands in the way, and every later integration copies it because copying is cheaper than a conversation. The control plane arrives when the cost of not having one becomes visible: an outage, a surprise invoice, or a security review that asks a question nobody can answer." },
      { t: "art", kind: "banking" },
      { t: "p", x: "Regulated teams feel it first. A bank that must show which model saw which customer data, and under which rule, cannot answer from scattered logs. With a single path for every call, the answer is one query against one ledger, and the same path enforces the rule that produced it." },
      { t: "h", x: "Where to start" },
      { t: "p", x: "Start by routing one workload through the gateway with no policy at all, so you can see real traffic. Then add a budget with a warn threshold, then one policy for the data you worry about most. Each step is small, and each one removes a question that used to need a meeting." },
    ],
  },
  {
    slug: "budgets-that-warn-throttle-block",
    title: "Budgets that warn, throttle, then block",
    date: "Oct 2026",
    tag: "Engineering",
    read: "6 min",
    art: "startups",
    summary: "A hard stop at 100 percent is too late. A ladder of thresholds gives owners time to act.",
    blocks: [
      { t: "p", x: "Most budget systems report overspend after it happens. The useful ones act before it does, and they tell the right person while there is still something to decide." },
      { t: "art", kind: "startups" },
      { t: "h", x: "A ladder, not a cliff" },
      { t: "p", x: "A single limit forces a bad choice. Set it high and it never protects anyone. Set it at the true maximum and the first sign of trouble is an outage. tok∑ner budgets use a ladder of thresholds, and each rung does something different." },
      { t: "ul", items: [
        "Warn: owners are notified in the channels they chose, with the burn rate and the projected date the budget runs out.",
        "Throttle: the request rate is capped, so a runaway loop slows down instead of finishing the month's money in an hour.",
        "Block: the gateway returns a typed budget_exceeded error with a Retry-After header, and clients can handle it like any other limit.",
      ] },
      { t: "scene", id: "budgets" },
      { t: "h", x: "Reserve first, then spend" },
      { t: "p", x: "Counting after the response is too late for a long request. The gateway estimates tokens and cost before calling the provider, reserves that amount against the budget, and settles the difference when the real usage arrives. Two requests that arrive together cannot both spend the last of the money." },
      { t: "stats", items: [["3", "thresholds per budget"], ["1", "ledger for enforcement and reports"], ["0", "tokens spent on a blocked request"]] },
      { t: "h", x: "Consistent with the ledger" },
      { t: "p", x: "Token accounting events are keyed by tenant and partitioned in order. The burn rate used for enforcement is computed from the same stream that fills the ledger, so the number that blocks a request is the number on the invoice. There is no second counter to drift." },
      { t: "art", kind: "retail" },
      { t: "p", x: "Seasonal businesses use this the most. A retailer can raise the budget for the weeks that matter, lower it afterwards, and keep the thresholds proportional, so a quiet Tuesday and a peak Saturday are both protected by the same rule." },
      { t: "callout", title: "Pick the warn threshold by response time", x: "Ask how long it takes your owner to read a message and decide. If that is a day, warn at the point where a day of normal use still fits under the limit." },
    ],
  },
  {
    slug: "process-every-document-once",
    title: "Process every document once",
    date: "Oct 2026",
    tag: "Engineering",
    read: "7 min",
    art: "knowledge",
    summary: "Why we normalize files into a Canonical AI Document before any policy check or provider call.",
    blocks: [
      { t: "p", x: "Sending a raw PDF to a model skips every control you care about: malware scanning, redaction, size limits, and cost estimation. It also pays for the same parsing work every time the file is used." },
      { t: "art", kind: "knowledge" },
      { t: "h", x: "One document, many uses" },
      { t: "p", x: "tok∑ner parses each unique file into a Canonical AI Document, keyed by content hash. The document holds the text, structure, tables and page images in one shape that does not depend on the original format or on any provider. Provider adapters translate it into whatever wire format they need and never parse files themselves." },
      { t: "scene", id: "documents" },
      { t: "h", x: "What happens before the model sees anything" },
      { t: "ul", items: [
        "The file is scanned for malware and checked against size and type limits.",
        "Text is extracted, with optical character recognition for scans and images.",
        "Personal data is detected and masked according to the policy that applies to the caller.",
        "Tokens and cost are estimated from the canonical document, so budgets can be checked before any provider call.",
      ] },
      { t: "p", x: "Each step happens once per file. The result is stored, and a second request for the same file, even with a different prompt or a different provider, skips straight to token estimation." },
      { t: "art", kind: "legal" },
      { t: "h", x: "Why this matters for review work" },
      { t: "p", x: "Legal and compliance teams ask many questions of the same contract. Parsing once means the tenth question costs a fraction of the first, and the masked version is the only one any model ever receives. The original stays in storage under your own access rules." },
      { t: "callout", title: "Content hash, not file name", x: "The same contract uploaded by two people under two names is one document. Reuse is automatic, and so is deduplicated storage." },
      { t: "art", kind: "healthcare" },
      { t: "p", x: "For healthcare the same pipeline keeps identifiers inside the boundary. Masking runs before routing, so a request pinned to an in-network model and a request sent to an external provider both start from a document that has already been cleaned under the correct policy." },
    ],
  },
  {
    slug: "failover-without-code-changes",
    title: "Failover without code changes",
    date: "Oct 2026",
    tag: "Engineering",
    read: "6 min",
    art: "logistics",
    summary: "Model aliases and health-aware routing keep applications up when a provider is not.",
    blocks: [
      { t: "p", x: "Applications ask for an alias such as chat-default. The registry maps that alias to an ordered list of provider and model pairs, so the application never names a vendor." },
      { t: "art", kind: "logistics" },
      { t: "h", x: "Health decides the route" },
      { t: "p", x: "Circuit breakers track failures per provider. An open circuit is skipped, and a probe request closes it again once the provider recovers. The router retries on the next entry in the list within the request's time budget, so the caller sees a slower answer in the worst case and not an error." },
      { t: "scene", id: "failover" },
      { t: "h", x: "Rules that go beyond health" },
      { t: "ul", items: [
        "Regional routing keeps traffic for a jurisdiction on providers that serve it.",
        "Sensitive traffic can be pinned to a model running in your own network.",
        "Cost-aware ordering sends routine requests to the cheaper model and keeps the stronger one for work that needs it.",
      ] },
      { t: "p", x: "Because the alias lives in the control plane, you can change the primary model for every service in one edit, and roll it back in one edit." },
      { t: "art", kind: "telecom" },
      { t: "callout", title: "Fail open or fail closed", x: "If the gateway itself is unreachable you choose, per tenant, whether calls proceed or stop. Regulated workloads usually fail closed, and customer-facing chat usually fails open to a fallback." },
      { t: "p", x: "Network operators know this pattern well. A call that cannot take its first route takes the second, and nobody on the line notices. The same idea applies to model calls, and it works only when the routing decision is outside the application." },
    ],
  },
  {
    slug: "audit-trail-that-cannot-be-edited",
    title: "An audit trail that cannot be edited",
    date: "Oct 2026",
    tag: "Security",
    read: "5 min",
    art: "insurance",
    summary: "The database role behind the API has no update or delete grant on the audit log. That is the whole trick.",
    blocks: [
      { t: "p", x: "Policies about immutability are weaker than permissions that make mutation impossible. A rule that says nobody should edit the log depends on everybody following it. A grant that does not exist depends on nothing." },
      { t: "art", kind: "insurance" },
      { t: "h", x: "What each event records" },
      { t: "p", x: "Every audit event records the actor, the action, the resource, the state before and after, and the request context. The role the application connects with has insert and select on the audit table, and nothing else. There is no update path to protect, because there is no update path." },
      { t: "scene", id: "observability" },
      { t: "h", x: "Searchable without being writable" },
      { t: "p", x: "A mirror in OpenSearch makes the trail searchable without giving search users any write path to the source of truth. If the mirror is lost it is rebuilt from the ledger, and if the two ever disagree the ledger wins." },
      { t: "ul", items: [
        "Insurers and banks use the trail to answer who approved a decision and under which rule.",
        "Security teams use it to see every change to a policy, a key or a budget.",
        "Auditors can be given read access to the mirror and nothing else.",
      ] },
      { t: "art", kind: "banking" },
      { t: "callout", title: "Include the console", x: "Actions taken in the console are events too. A change made by an administrator carries the same actor, before and after, and request context as a change made by a pipeline." },
    ],
  },
  {
    slug: "tenant-isolation-in-three-layers",
    title: "Tenant isolation in three layers",
    date: "Oct 2026",
    tag: "Security",
    read: "6 min",
    art: "enterprise",
    summary: "Application filtering, row-level security, and partitioned event streams, so one mistake is never enough.",
    blocks: [
      { t: "p", x: "Isolation that depends on a single WHERE clause is one forgotten filter away from a breach. Reviews catch most mistakes, and the ones they miss are the ones that matter." },
      { t: "art", kind: "enterprise" },
      { t: "h", x: "Three independent layers" },
      { t: "ul", items: [
        "Application layer: every query is scoped to the caller's tenant by the data access code, not by each feature.",
        "Database layer: PostgreSQL row-level security rejects a row that belongs to another tenant, even if the query forgot to ask.",
        "Event layer: Kafka topics are keyed by tenant, so consumers read only the partitions they are entitled to.",
      ] },
      { t: "p", x: "Each layer is independently sufficient to stop a cross-tenant read, which is the point. A bug has to defeat all three at once." },
      { t: "scene", id: "policy" },
      { t: "h", x: "Secrets stay out of the picture" },
      { t: "p", x: "Provider keys and database credentials live in the vault and never land in images, config maps or logs. Applications receive scoped, revocable credentials, and a revoked credential stops working on the next call." },
      { t: "art", kind: "healthcare" },
      { t: "callout", title: "Dedicated and private options", x: "Some customers want more than logical separation. Dedicated node pools, a private cloud install and an air-gapped deployment use the same code, with the boundary moved outward." },
    ],
  },
  {
    slug: "build-your-own-mcp-server",
    title: "Build your own MCP server without writing a server",
    date: "Oct 2026",
    tag: "Product",
    read: "8 min",
    art: "manufacturing",
    summary: "Turn a pipeline, a read-only query or an HTTPS endpoint into a tool any agent can call, with approval and audit built in.",
    blocks: [
      { t: "p", x: "Agents become useful when they can do something: look up an order, check a stock level, open a ticket. The Model Context Protocol gives them a standard way to find and call those tools. Writing a server for each one is the part that slows teams down, and it is also where authentication, limits and logging get skipped." },
      { t: "art", kind: "manufacturing" },
      { t: "h", x: "Tools from what you already have" },
      { t: "p", x: "The MCP server builder in the console starts from the systems you already run. Each tool is backed by one of four sources." },
      { t: "ul", items: [
        "A pipeline, which is the right choice for anything that changes data, because it brings an approval gate and a record with it.",
        "A read-only SQL query with bound parameters, run inside a read-only transaction on a data connection.",
        "An HTTPS endpoint you own, with arguments placed in the path, the query or a JSON body.",
        "A model reached through the gateway, so policy, budget and metering apply.",
      ] },
      { t: "scene", id: "mcp" },
      { t: "h", x: "Rules the builder will not let you break" },
      { t: "p", x: "Publishing is blocked until the checks pass. A tool that changes data must be backed by a pipeline and must wait for approval. A SQL tool runs one SELECT and nothing else. Calls to private addresses are refused unless the server is in development. A server with no authentication can exist only in development." },
      { t: "callout", title: "Descriptions are part of the interface", x: "A model reads the tool description to decide when to call it. The builder warns on short descriptions and on fields without one, because a vague tool gets misused." },
      { t: "h", x: "Host it here or take the code" },
      { t: "p", x: "A published server is hosted by the control plane at its own address, with API key, OAuth or mutual TLS access, a rate limit, and an audit record for each call. If you would rather run it yourself, export a TypeScript or Python project that implements the same tools, and deploy it where you like." },
      { t: "code", lang: "bash", code: "# Connect any MCP client to a published server\nclaude mcp add --transport http orders https://mcp.example.tokener.io/orders/mcp \\\n  --header \"Authorization: Bearer $TOKENER_MCP_KEY\"" },
      { t: "art", kind: "logistics" },
      { t: "p", x: "A logistics team might expose three tools: shipment status from a read-only query, a delivery window change that runs a pipeline with an approval gate, and a carrier lookup over HTTPS. The agent sees one server with three clear tools, and every call lands in the same audit trail as the rest of the platform." },
    ],
  },
  {
    slug: "what-energy-teams-ask-of-an-ai-gateway",
    title: "What energy and utility teams ask of an AI gateway",
    date: "Oct 2026",
    tag: "Industry",
    read: "7 min",
    art: "energy",
    summary: "Grid operators, wind farms and field crews have different data, different networks and a lower tolerance for surprises.",
    blocks: [
      { t: "p", x: "Energy and utility organizations adopt AI where the work is repetitive and the data is heavy: reading inspection reports, summarizing maintenance logs, answering questions about equipment manuals, drafting regulatory filings. They also run some of the most carefully separated networks in any industry, which shapes what they ask of a gateway." },
      { t: "art", kind: "energy" },
      { t: "h", x: "Operational data stays where it is" },
      { t: "p", x: "Telemetry from turbines, substations and meters belongs to operations, not to a public model. Teams ask for routing that keeps those workloads on a model inside their own network, while business documents can use an external provider under tighter policy. One gateway applies both rules, and the audit trail shows which request took which path." },
      { t: "scene", id: "agent" },
      { t: "h", x: "Agents that call out, never in" },
      { t: "p", x: "Control networks do not accept inbound connections from the outside. The build agent runs on a server inside the boundary, asks for work over HTTPS, verifies the signature on each job, runs it next to the systems it needs and reports a scrubbed result." },
      { t: "ul", items: [
        "No inbound ports are opened.",
        "Jobs are signed, and unsigned or altered jobs are refused.",
        "Secrets are scoped to a single run and removed afterwards.",
      ] },
      { t: "art", kind: "telecom" },
      { t: "h", x: "Field crews and thin connections" },
      { t: "p", x: "Crews work from sites with poor coverage. Routing with health checks and sensible time budgets keeps a flaky link from becoming a stalled tablet, and queued work resumes when the connection returns. Budgets keep a single misconfigured device from spending a team's allowance overnight." },
      { t: "art", kind: "manufacturing" },
      { t: "callout", title: "Plan for the worst day", x: "Storms and outages are when these teams need answers most, and when providers are most likely to be slow. Failover to a model in your own network is the feature that matters on that day." },
      { t: "p", x: "The common thread is that the controls matter more than the model. Which data may leave, who approved the change, and what happened afterward are the questions an operator is asked, and the gateway is where those answers are kept." },
    ],
  },
];
