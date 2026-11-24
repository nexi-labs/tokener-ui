import {
  Orbit, Bot, ShieldCheck, ClipboardCheck, FlaskConical, Workflow, Brain, Plug, Terminal, Users, Radar, Gauge, Waypoints,
  type LucideIcon,
} from "lucide-react";

/** Content for the Agent OS product page and the home page section. Every claim here matches what the console shows today. */

export const AGENT_OS_STATUS =
  "Agent OS is in preview. Every screen works against a sample workspace in your browser, so you can register agents, set rules, approve a claim or run an evaluation and see exactly how it behaves. The agent backend that stores this for your organization is still being built. Framework adapters and connectors are marked Planned or In development until a platform administrator approves them after testing against the vendor's own test service.";

export const AGENT_OS_FLOW: { t: string; d: string; icon: LucideIcon }[] = [
  { t: "Register", d: "Bring agents built in any framework into one registry, with an owner, a department and a project.", icon: Bot },
  { t: "Govern", d: "Set budgets, approvals, data protection and network rules around each agent.", icon: ShieldCheck },
  { t: "Run", d: "Choose how it runs: on demand, always on, streaming or batch, with scaling that follows the work.", icon: Gauge },
  { t: "Watch", d: "Follow every run as one story with a shared correlation id, then evaluate it before changes ship.", icon: Radar },
];

export type AgentOsTopic = { slug: string; name: string; short: string; icon: LucideIcon; shot: string; shotUrl: string; points: string[] };

export const AGENT_OS_TOPICS: AgentOsTopic[] = [
  {
    slug: "constellation",
    name: "Constellation",
    short: "A live map of every agent, who it talks to, and which rules surround it.",
    icon: Orbit,
    shot: "/screens/agentos-constellation.webp",
    shotUrl: "app.tokener.io/agents/constellation",
    points: [
      "Agents grouped by department, with knowledge, notifications and connections drawn from your integrations",
      "Lines show how agents talk: TAP, A2A, MCP, HTTPS and events",
      "Dashed lines show budget, approval, data protection, rate limit and network rules around an agent",
      "Agents that anyone outside can reach are marked, and an open one is flagged in red",
    ],
  },
  {
    slug: "approvals",
    name: "Approvals",
    short: "People decide where an agent should not decide alone, with the evidence beside the question.",
    icon: ClipboardCheck,
    shot: "/screens/agentos-approvals.webp",
    shotUrl: "app.tokener.io/agents/approvals",
    points: [
      "A run pauses, is saved, and waits hours for a person, then carries on",
      "Reviewers see the document, the values the agent read, and the policy page each finding came from",
      "Second approval for large payouts, from someone other than the first approver",
      "Requests escalate to the next group when nobody answers in time, and every decision records who and why",
    ],
  },
  {
    slug: "conductor",
    name: "Conductor",
    short: "Chain agents into one business workflow with a timeout and a budget for the whole run.",
    icon: Workflow,
    shot: "/screens/agentos-conductor.webp",
    shotUrl: "app.tokener.io/agents/conductor",
    points: [
      "Sequential, parallel and supervisor patterns",
      "One correlation id across every step, so traces, cost and approvals read as one story",
      "A workflow that includes a suspended agent says so before it runs",
    ],
  },
  {
    slug: "evals",
    name: "Evals",
    short: "Test an agent on cases that matter before a change reaches users.",
    icon: FlaskConical,
    shot: "/screens/agentos-evals.webp",
    shotUrl: "app.tokener.io/agents/evals",
    points: [
      "Suites of cases with expected behaviour, pass rate, score and cost per run",
      "Failing cases listed by name so the fix is obvious",
      "Run from the console or from the command line",
    ],
  },
  {
    slug: "context",
    name: "Context and memory",
    short: "Decide what an agent may remember, where it is kept and who can see it.",
    icon: Brain,
    shot: "/screens/agentos-memory.webp",
    shotUrl: "app.tokener.io/agents/registry",
    points: [
      "Six kinds of memory: working, conversation, semantic, episodic, entity and procedural, each with its own scope, store and retention",
      "Tools that read and write memory, each under the same tool policy as any other tool",
      "Shared context spaces with an owner and a list of who may read them",
    ],
  },
  {
    slug: "adapters",
    name: "Framework adapters",
    short: "Run agents from the framework your team already uses, under one set of rules.",
    icon: Plug,
    shot: "/screens/agentos-adapters.webp",
    shotUrl: "app.tokener.io/agents/adapters",
    points: [
      "LangGraph, LlamaIndex, CrewAI, AutoGen, Mastra, Pydantic AI, the OpenAI Agents SDK, the Vercel AI SDK, Strands and more, plus plain HTTPS and A2A agents",
      "Amazon Bedrock Agents, Azure AI Foundry, Vertex AI Agent Engine, Salesforce Agentforce, Microsoft Copilot Studio and Dify as managed agents you register and govern",
      "Each adapter shows its real status, and an organization can ask the platform team to move one forward",
    ],
  },
  {
    slug: "protocols",
    name: "Protocols",
    short: "One message format for agent to agent calls, with the same checks on every hop.",
    icon: Waypoints,
    shot: "/screens/agentos-protocols.webp",
    shotUrl: "app.tokener.io/agents/protocols",
    points: [
      "TAP message types with a worked example for each, so a developer can read what an agent will send",
      "A2A and MCP mapped to the same identity and policy checks",
      "Exposed agents get an address, a signing secret and API keys you can rotate",
    ],
  },
  {
    slug: "cli",
    name: "Command line",
    short: "The same actions as the console, from a terminal, with the same rules applied.",
    icon: Terminal,
    shot: "/screens/agentos-cli.webp",
    shotUrl: "app.tokener.io/agents/cli",
    points: [
      "List and suspend agents, decide approvals, run evals and workflows, read traces and memory",
      "Try the commands in a shell in the console before the released tool is available",
      "Every change goes through the same checks as a click in the console",
    ],
  },
  {
    slug: "roles",
    name: "Roles and organization",
    short: "Give people the access they need at the level they need it, and no further.",
    icon: Users,
    shot: "/screens/org-roles.webp",
    shotUrl: "app.tokener.io/org-roles",
    points: [
      "Built-in roles, plus custom roles made from the permissions you choose",
      "Grant at the organization, a tenant, a department or a project, to a person or a group",
      "A person cannot give away access they do not hold, and the reason is shown",
    ],
  },
];

export const AGENT_OS_RUNTIMES: { name: string; body: string }[] = [
  { name: "On-demand runtime", body: "Bursty work and anything that finishes in minutes. A fresh instance starts for each call and goes away, so nothing is billed while idle." },
  { name: "Always-on service", body: "Chat, voice and anything a person is waiting on. Replicas stay warm and scale with the load." },
  { name: "Streaming worker", body: "Reads a stream and reasons over windows of events, keeping state for each key." },
  { name: "Batch job", body: "Nightly reviews, backfills and large one-off analyses, billed by worker hour." },
  { name: "Runs elsewhere", body: "Agents you did not build here. They are registered, governed and watched, but run where they already run." },
];

export const AGENT_OS_FAQ: { q: string; a: string }[] = [
  { q: "Is Agent OS available now?", a: "It is in preview. Every screen runs against a sample workspace in your browser, so you can try each workflow and judge it. The backend that stores agents, approvals and evaluations for your organization is not built yet, and the released command line tool is not available." },
  { q: "Do my agents have to be built in tok∑ner?", a: "No. You can register agents from other frameworks and managed agent products. They then sit under the same budgets, approvals and data rules, and appear on the same map. Adapters are marked Planned or In development until the platform team has tested them against the vendor's own test service." },
  { q: "Are the figures on the screens real?", a: "No. Figures, people, documents and amounts on the preview screens are examples. Evaluation scoring is simulated, and memory recall in the sample workspace matches words. A connected workspace uses your own models and data." },
  { q: "Where do secrets go?", a: "Nowhere in an agent. Agents and connections hold a reference to a secret in your own secret manager, and the platform resolves it when a call is made. Keys shown in the console are shown once." },
  { q: "Can we bring our own model?", a: "Yes. A model in the Forge can be a hosted model or one of your own deployments from the Model Registry. Only a deployment outside development, with an approved version and a healthy state, can be chosen." },
];
