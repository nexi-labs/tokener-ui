import type { UseCase } from "./types";

/** Use cases for Agent Networks, Agent Mesh and the AI canvas. The people, documents and amounts are invented, and Agent OS is in preview with every screen working against a sample workspace. */
export const AGENT_OS_CASES: UseCase[] = [
  {
    slug: "agent-networks-claims-isolation",
    industry: "insurance",
    title: "Keeping the claims agents apart from the agents that can pay",
    summary: "An insurer puts its agents in named networks, so the agent that reads customer messages can reach the claims team through one approved path and can never reach the agent that sends money.",
    tags: ["Agent Networks", "Agents", "Security"],
    challenge: [
      "An insurer runs fourteen agents. One answers customers on a public web page, one reads claim packs, one matches repair invoices to estimates, and one prepares refunds. Each was built by a different team in a different framework, and each was given an address on the company network so the others could call it.",
      "Nobody decided which agent may call which. The public assistant can reach the refund agent because nothing says it cannot. A prompt injected into a customer message could, in principle, travel one hop to an agent that handles payouts. The security team cannot answer a simple question: from the internet, which agents can I reach and what stops me?",
    ],
    solution: [
      "The insurer groups agents into named networks in Agent OS. Claims intake, document processing and the policy wording check sit in a private Claims network. The refund agent and the invoice matcher sit in a private Finance core network. Customer-facing agents sit in a shared Support edge network. A private network is closed to everything outside it unless it is peered with another, and members prove who they are with certificates or signed tokens.",
      "Peering is deliberate and visible. Claims is peered with Finance core so a payout can be prepared, and Support edge is peered with Finance core so a refund request can be handed over. Anything else is refused. Agents that face the public sit behind the tok∑ner edge, with an API key, limits per caller, a check for prompt injection and personal data, and a rule that the origin accepts traffic only from the edge. Each agent gets a grade from A to E and a next fix.",
    ],
    steps: [
      { title: "Name the networks", body: "Create Claims, Finance core and Support edge, choose private or shared, and choose how members prove who they are." },
      { title: "Put agents in them", body: "An agent joins by taking a network in its own setup. An agent with no setup is shown as not set up, with a grey shield." },
      { title: "Peer on purpose", body: "Claims and Support edge are each peered with Finance core. Nothing else can call in, and the paths table says why for every call." },
      { title: "Test a call", body: "Run a sample call in or out and see which control decided: the key, the range, the country, the limit or the shield." },
      { title: "Read the grades", body: "Two agents grade E because they are public with no authentication. The next fix is listed beside each, and the Constellation shows them in red." },
    ],
    scene: {
      alt: "An outside caller reaches the public edge with an app key, then the support triage agent, which is peered with Finance core and can call the refund agent. An agent with no network is blocked from calling the refund agent.",
      caption: "Peering is a decision. A call that crosses a boundary without one is refused, and the reason is written down.",
      cols: [
        [["caller", "Outside caller", "web page or app", "l:Globe", true]],
        [["edge", "Public edge", "key, limits, shield", "l:ShieldCheck"]],
        [["triage", "Support triage", "Support edge", "l:Bot"], ["faq", "FAQ assistant", "no network", "l:Bot"]],
        [["refund", "Refund assistant", "Finance core", "l:Wallet"], ["match", "Invoice matcher", "Finance core", "l:Receipt"]],
      ],
      flow: [
        "caller>edge|info|app key", "edge>triage|ok|allowed", "triage>refund|ok|peered", "refund>match|ok|same network",
        "---",
        "caller>edge|bad|no key, refused",
        "---",
        "edge>faq|ok|allowed", "faq>refund|bad|blocked, not peered",
      ],
    },
    systems: ["Okta", "Datadog", "Slack", "HashiCorp Vault"],
    controls: ["Private networks closed unless peered", "Certificates or signed tokens between members", "Edge with keys, limits and prompt injection shield", "Egress allowlist for what each agent may call", "Grade and next fix for every agent"],
    measures: ["Agents with a network setup", "Agents graded A or B", "Agents reachable from the internet", "Calls refused at a boundary, with the reason"],
    example: "The public assistant is asked to refund an order by a customer who pastes a hidden instruction. The message passes the edge, but the assistant sits in Support edge, which can hand a refund request to Finance core through one approved path. A second agent that has no network tries the same call and is refused with the reason \"not peered\". The refusal is on the record that evening, and the security lead sees the grade of every agent on one screen.",
    console: { src: "/screens/agentos-networks.webp", url: "app.tokener.io/agents/networks", caption: "Named networks, the paths between agents and a canvas for each network." },
  },
  {
    slug: "agent-mesh-motor-claims",
    industry: "insurance",
    title: "Settling motor claims with a mesh of agents and a person where it counts",
    summary: "Five agents work one claim together: intake, documents, policy wording, invoice matching and payout. A mesh sets the order, the limits per claim and the point where a person decides.",
    tags: ["Agent Mesh", "Agents", "Approvals"],
    challenge: [
      "A motor insurer wants straightforward claims settled in minutes and every unusual one in front of an adjuster with the evidence already read. Five agents can each do a part. Wired together by hand with scripts, they loop when a document is missing, spend without a ceiling, and skip review when a step returns early.",
      "When something goes wrong nobody can say how many handoffs a claim took, what it cost, or who decided. The business sees agents. It does not see a process.",
    ],
    solution: [
      "The insurer builds a mesh called Motor claims in Agent OS. The pattern is a pipeline. Claims intake hands to the document processor, then the contract reviewer, then the invoice matcher, then the refund assistant. A handoff can carry a condition: a claim with missing documents goes back to intake, and a payout above the limit stops for a person.",
      "Limits are part of the mesh, not of any one agent: a maximum number of handoffs, a cost per claim, a working time, and a loop guard that stops a claim visiting the same agent too often. A person approves before the executor runs. The mesh is checked against Agent Networks, so a handoff between agents that cannot reach each other is an error and a mesh with errors cannot go live. The live view replays a sample claim step by step, with its cost and time.",
    ],
    steps: [
      { title: "Choose the pattern", body: "Pipeline, supervisor, router, maker and checker, or peers. Motor claims is a pipeline with one return path." },
      { title: "Give each agent a role", body: "Intake, coordinator, specialist, reviewer or executor. The role says what the agent is trusted to do in this mesh." },
      { title: "Write the handoffs", body: "Each handoff has a condition, such as always, a tag, or a step that has run, and says what it carries to the next agent." },
      { title: "Set the limits and the person", body: "Handoffs, cost, working time and loop guard per claim, and where a person decides before the executor acts." },
      { title: "Replay and measure", body: "Replay a clean claim and an awkward one, and compare the result with the objectives for cases that finish, time and cost." },
    ],
    scene: {
      alt: "A claim moves from intake to the document processor, the contract reviewer and the invoice matcher. A claim over the limit stops for a person to approve before the refund assistant pays. A claim with missing documents returns to intake.",
      caption: "The mesh sets the order, the limits and the moment a person decides. The agents keep doing what they are good at.",
      cols: [
        [["intake", "Claims intake", "intake", "l:Inbox", true]],
        [["docs", "Document processor", "specialist", "l:ScanSearch"]],
        [["review", "Contract reviewer", "specialist", "l:FileCheck"], ["match", "Invoice matcher", "specialist", "l:Receipt"]],
        [["person", "A person approves", "over the limit", "l:UserCheck"]],
        [["pay", "Refund assistant", "executor", "l:Wallet"]],
      ],
      flow: [
        "intake>docs|ok|pack complete", "docs>review|ok|cover checked", "review>match|ok|estimate matched", "match>person|warn|over the limit", "person>pay|ok|approved",
        "---",
        "intake>docs|ok|pack read", "docs>intake|warn|missing documents, sent back",
      ],
    },
    systems: ["Salesforce", "Okta", "Slack", "Datadog"],
    controls: ["Limits per claim: handoffs, cost, time", "Loop guard on repeated visits", "A person decides before the executor acts", "Checked against Agent Networks before it can go live", "Every handoff on one correlation id"],
    measures: ["Claims that finish without a person", "Median minutes per claim", "Cost per claim", "Claims stopped by a limit and why"],
    example: "A windscreen claim under the excess runs through the mesh in just over a minute for about a dollar and a half, and waits for a person for the refund. A claim with a repair invoice dated before the accident is sent to an adjuster with the page and the finding open beside the question. A claim that keeps bouncing between intake and the document processor is stopped by the loop guard after three visits, and the adjuster sees the reason.",
    console: { src: "/screens/agentos-mesh.webp", url: "app.tokener.io/agents/mesh", caption: "The live view of the Motor claims mesh replays a sample claim, with its cost and time." },
  },
  {
    slug: "own-model-behind-mcp",
    industry: "enterprise",
    title: "Hosting your own model and offering it to agents as a tool",
    summary: "A company runs an open model on its own GPUs, puts it behind the gateway, then exposes it as a tool on an MCP server that only chosen agents can call. The AI canvas shows the whole path.",
    tags: ["MLOps", "MCP", "Gateway"],
    challenge: [
      "A company fine-tunes an open model on its own contract language and runs it on GPUs it controls, because the text cannot leave its network. Applications reach it by a private address, agents cannot find it, and nobody can say who is calling it or what it costs.",
      "Teams also use vendor models, so there are two ways to call a model with different keys, limits and logs. Asking an agent to use the private model means a custom integration for each agent.",
    ],
    solution: [
      "The model is deployed from the model library to the company's cluster, with the engine and GPUs chosen in the deployment wizard and a check on the driver. It is added to the gateway as a provider, so applications call one endpoint and the same policy, budgets and audit apply as for any vendor. A model the company hosts elsewhere can be connected as its own endpoint in the same way, as an OpenAI compatible address with a secret reference.",
      "To let agents use it, the company adds a tool that asks the model to a custom MCP server. The call still goes through the gateway. Nobody can call the server until it is published and someone has a grant, and a grant names a person, a group, an application or a service account, the tools it covers and a rate limit. The AI canvas draws the whole path in colour: the hosted model, the gateway, the server and who may call it.",
    ],
    steps: [
      { title: "Deploy or connect the model", body: "Host it on your infrastructure, or connect an endpoint you already run. Both end as a provider the gateway can route to." },
      { title: "Add it to the gateway", body: "Applications use one endpoint and one key. Policy, budgets and audit are the same as for a vendor model." },
      { title: "Expose it as a tool", body: "Add a tool that asks the model to an MCP server. The tool has a name and a description an agent can act on." },
      { title: "Publish and grant", body: "Publish the server, then give chosen agents and groups a grant with its own rate limit." },
      { title: "Read the canvas", body: "The AI canvas shows models that are not in the gateway, servers in draft, and who can call what." },
    ],
    scene: {
      alt: "A model hosted on the company's GPUs and a vendor model both sit behind the tok∑ner gateway. An MCP server calls the hosted model through the gateway, and only agents with a grant can call the server.",
      caption: "One endpoint in front of every model, and a tool on an MCP server for the agents that are allowed to use it.",
      cols: [
        [["own", "Your model", "on your GPUs", "l:Server", true], ["vendor", "Vendor model", "hosted API", "l:Cpu"]],
        [["gw", "Gateway", "policy, budget, audit", "l:Waypoints"]],
        [["mcp", "MCP server", "ask_contract_model", "l:Cable"]],
        [["agent", "Claims agent", "has a grant", "l:Bot"], ["other", "Other agent", "no grant", "l:Bot"]],
      ],
      flow: [
        "own>gw|ok|in your network", "gw>mcp|ok|tool call", "mcp>agent|ok|answer returned",
        "---",
        "vendor>gw|ok|200 OK", "other>mcp|bad|no grant, refused",
      ],
    },
    systems: ["NVIDIA", "Kubernetes", "HashiCorp Vault", "Datadog"],
    controls: ["Models run on infrastructure you control", "One gateway endpoint for hosted and vendor models", "Secrets stored as references", "A server is closed until someone has a grant", "Calls to the model go through policy and budget"],
    measures: ["Share of calls served by your own model", "Cost per thousand calls against a vendor", "Tools with a grant and no calls", "Models not in the gateway"],
    example: "A legal team fine-tunes a contract model and deploys it on two GPUs. It is added to the gateway, and a tool named ask_contract_model is added to a Contracts server. The server is published, and the claims agent and the legal-agents group are given grants with a limit of sixty calls a minute. A research agent that was never given a grant is refused and the attempt is audited. The AI canvas shows the model, the gateway, the server and the three callers.",
    console: { src: "/screens/mlops-ai-canvas.webp", url: "app.tokener.io/mlops/canvas", caption: "The AI canvas: models, the gateway, MCP servers and who may call them." },
  },
];
