import {
  siLangchain, siOpenai, siHuggingface, siN8n, siSalesforce, siVercel, siPydantic, siGooglecloud, siGooglegemini, siAwslambda, siOpenapiinitiative,
} from "simple-icons";
import { Bot, Cloud, Code2, GitBranch, Network, Sparkles, Users, Workflow, type LucideIcon } from "lucide-react";
import type { FieldDef, IntegrationDef } from "@/lib/mlops/types";
import type { IconRef } from "@/components/studio/types";
import { ForgeGlyph, ProtocolsGlyph } from "@/components/agents/AgentGlyphs";

const si = (i: { title: string; path: string; hex: string }): IconRef => ({ si: i });
const cdn = (slug: string, hex: string, fallback: LucideIcon): IconRef => ({ cdn: slug, hex, fallback });

/**
 * A framework adapter is one definition with up to two uses.
 *  - build: Agent Forge generates a project for this framework (src/lib/agents/codegen.ts).
 *  - connect: an agent that already runs on this framework's hosted platform is connected and registered. The definition becomes an integration in the
 *    shared catalogue, so the same connection wizard, secret handling and health checks apply (see agentIntegrations).
 * A framework you host yourself connects through the TAP, A2A or HTTP adapters, which is why a framework has no connect block of its own.
 */
export type Language = "python" | "typescript" | "spec";
export type Support = "yes" | "partial" | "no";

export type BuildTarget = {
  language: Language;
  /** Install name. Versions are not pinned here: the generated project asks you to pin after the first successful build. */
  packages: string[];
  /** What the generated project wires to the framework. Shown as the honest list of what the scaffold does. */
  features: { tools: Support; mcp: Support; streaming: Support; memory: Support; multiAgent: Support; humanInLoop: Support; otel: Support };
  notes: string;
};

export type AdapterDef = {
  id: string;
  name: string;
  vendor: string;
  kind: "framework" | "platform" | "protocol";
  icon: IconRef;
  blurb: string;
  build?: BuildTarget;
  connect?: Omit<IntegrationDef, "id" | "name" | "vendor" | "family" | "icon" | "blurb">;
  docs: { label: string; url: string }[];
};

const f = {
  baseUrl: (placeholder: string, label = "Endpoint", help?: string): FieldDef => ({ key: "endpoint", label, type: "text", placeholder, required: true, help }),
  tls: (): FieldDef => ({ key: "tlsVerify", label: "Verify TLS certificates", type: "toggle", default: true, help: "On by default. Turning it off is blocked for production environments." }),
  timeout: (def = 120): FieldDef => ({ key: "timeoutSec", group: "Limits", label: "Request timeout (seconds)", type: "number", default: def, help: "Agents can run for a long time. Long tasks should use asynchronous mode with a callback." }),
  mode: (): FieldDef => ({ key: "callMode", label: "How tok∑ner calls the agent", type: "select", options: ["Wait for the answer", "Stream the answer", "Start a task and poll", "Start a task and receive a callback"], default: "Wait for the answer" }),
  clientId: (): FieldDef => ({ key: "clientId", label: "Client ID", type: "text", required: true, showWhen: { key: "auth", in: ["oidc"] } }),
  clientSecretRef: (): FieldDef => ({ key: "clientSecretRef", label: "Client secret reference", type: "text", placeholder: "secretref://vault/agents/client-secret", required: true, showWhen: { key: "auth", in: ["oidc"] }, help: "A reference to the secret in your secret manager. The value is never entered here." }),
  tenant: (): FieldDef => ({ key: "tenantId", label: "Directory (tenant) ID", type: "text", required: true, showWhen: { key: "auth", in: ["oidc"] } }),
  budget: (): FieldDef => ({ key: "maxCostPerCall", group: "Limits", label: "Largest cost of one call (USD)", type: "number", default: 2, help: "Applied by tok∑ner as the budget on each Relay task. Agents outside the gateway need to honour it." }),
};

const COMPLIANCE_COMMON = [
  "An agent you connect is a third party. Everything tok∑ner sends it, including task input, leaves your environment. Check where the vendor processes and stores it.",
  "tok∑ner can enforce policy and budget only on calls that pass through it. A connected platform agent is Observed unless its model and tool calls are routed through the tok∑ner gateway.",
  "Credentials are stored as secret references. Use an identity with the least access the agent needs, and rotate it on your own schedule.",
];

const connectBase = (over: Partial<NonNullable<AdapterDef["connect"]>> & Pick<NonNullable<AdapterDef["connect"]>, "versionTarget" | "auth" | "fields" | "prerequisites">): NonNullable<AdapterDef["connect"]> => ({
  status: "planned", wave: 2,
  capabilities: [{ id: "discover", level: "full" }, { id: "invoke-function", level: "full" }, { id: "logs", level: "partial", note: "Execution events the platform returns." }],
  limitations: ["Control level is Observed until the agent's calls pass through the tok∑ner gateway."],
  permissions: { read: ["Read the agent definition and its runs"], write: ["Invoke the agent"] },
  compliance: COMPLIANCE_COMMON, docs: [],
  ...over,
});

const yes = "yes" as const, part = "partial" as const, no = "no" as const;

export const ADAPTERS: AdapterDef[] = [
  // ---- Frameworks Agent Forge builds on
  {
    id: "tokener-native", name: "tok∑ner native", vendor: "tok∑ner", kind: "framework", icon: { lucide: ForgeGlyph },
    blurb: "No framework code. Describe the agent in the console and it runs on tok∑ner with every protocol and control built in.",
    build: { language: "spec", packages: [], features: { tools: yes, mcp: yes, streaming: yes, memory: part, multiAgent: yes, humanInLoop: yes, otel: yes },
      notes: "The agent is a specification (tokener.agent.yaml). Deploy it from the console. Governed from the first call because every model and tool call goes through the gateway." },
    docs: [{ label: "Agent OS", url: "/docs/47-agent-os.md" }],
  },
  {
    id: "langgraph", name: "LangGraph", vendor: "LangChain", kind: "framework", icon: si(siLangchain),
    blurb: "Stateful agents as graphs, with checkpoints and human approval steps.",
    build: { language: "python", packages: ["langgraph", "langchain-openai", "langchain-mcp-adapters"], features: { tools: yes, mcp: yes, streaming: yes, memory: yes, multiAgent: yes, humanInLoop: yes, otel: part },
      notes: "A ReAct agent over the tok∑ner gateway. Memory uses the in-process checkpointer: swap it for Postgres before running more than one replica." },
    docs: [{ label: "LangGraph", url: "https://langchain-ai.github.io/langgraph/" }],
  },
  {
    id: "langchain-agent", name: "LangChain", vendor: "LangChain", kind: "framework", icon: si(siLangchain),
    blurb: "Chains and tool-calling agents on the LangChain building blocks.",
    build: { language: "python", packages: ["langchain", "langchain-openai", "langchain-mcp-adapters"], features: { tools: yes, mcp: yes, streaming: yes, memory: part, multiAgent: part, humanInLoop: part, otel: part },
      notes: "A tool-calling agent. LangChain's own agent API changes between releases, so check the generated imports against your installed version." },
    docs: [{ label: "LangChain", url: "https://python.langchain.com/docs/" }],
  },
  {
    id: "crewai", name: "CrewAI", vendor: "CrewAI", kind: "framework", icon: cdn("crewai", "FF5A50", Users),
    blurb: "Role-based crews: agents with goals and a task list that work together.",
    build: { language: "python", packages: ["crewai"], features: { tools: yes, mcp: part, streaming: part, memory: yes, multiAgent: yes, humanInLoop: part, otel: part },
      notes: "One agent and one task as a starting crew. Add roles to grow it into a crew. MCP tools need the CrewAI MCP support for your version." },
    docs: [{ label: "CrewAI", url: "https://docs.crewai.com/" }],
  },
  {
    id: "llamaindex", name: "LlamaIndex", vendor: "LlamaIndex", kind: "framework", icon: cdn("llama", "7A4BFF", Sparkles),
    blurb: "Agents grounded in your documents and data, with retrieval built in.",
    build: { language: "python", packages: ["llama-index-core", "llama-index-llms-openai-like", "llama-index-tools-mcp"], features: { tools: yes, mcp: yes, streaming: yes, memory: yes, multiAgent: yes, humanInLoop: part, otel: part },
      notes: "A function agent over an OpenAI-compatible model. Add a query engine tool to ground it in a tok∑ner RAG index." },
    docs: [{ label: "LlamaIndex", url: "https://docs.llamaindex.ai/" }],
  },
  {
    id: "openai-agents", name: "OpenAI Agents SDK", vendor: "OpenAI", kind: "framework", icon: si(siOpenai),
    blurb: "Small agent loop with tools, handoffs and guardrails.",
    build: { language: "python", packages: ["openai-agents"], features: { tools: yes, mcp: yes, streaming: yes, memory: part, multiAgent: yes, humanInLoop: part, otel: part },
      notes: "Uses the chat completions model class so the agent calls the tok∑ner gateway, not OpenAI directly. Tracing to OpenAI is turned off." },
    docs: [{ label: "OpenAI Agents SDK", url: "https://openai.github.io/openai-agents-python/" }],
  },
  {
    id: "autogen", name: "AutoGen", vendor: "Microsoft", kind: "framework", icon: cdn("microsoft", "5E5E5E", Network),
    blurb: "Conversational multi-agent teams from Microsoft Research.",
    build: { language: "python", packages: ["autogen-agentchat", "autogen-ext[openai]"], features: { tools: yes, mcp: yes, streaming: yes, memory: part, multiAgent: yes, humanInLoop: yes, otel: part },
      notes: "An assistant agent over the gateway. The model client needs the model's capabilities declared, which the scaffold sets for you." },
    docs: [{ label: "AutoGen", url: "https://microsoft.github.io/autogen/" }],
  },
  {
    id: "google-adk", name: "Agent Development Kit", vendor: "Google", kind: "framework", icon: si(siGooglegemini),
    blurb: "Google's code-first framework for agents and agent teams.",
    build: { language: "python", packages: ["google-adk", "litellm"], features: { tools: yes, mcp: yes, streaming: yes, memory: part, multiAgent: yes, humanInLoop: part, otel: yes },
      notes: "Routes the model through LiteLLM to the tok∑ner gateway so models other than Gemini work." },
    docs: [{ label: "ADK", url: "https://google.github.io/adk-docs/" }],
  },
  {
    id: "pydantic-ai", name: "Pydantic AI", vendor: "Pydantic", kind: "framework", icon: si(siPydantic),
    blurb: "Typed agents: validated inputs, outputs and dependencies.",
    build: { language: "python", packages: ["pydantic-ai"], features: { tools: yes, mcp: yes, streaming: yes, memory: part, multiAgent: part, humanInLoop: part, otel: yes },
      notes: "A typed agent over the gateway. OpenTelemetry instrumentation is built in and is switched on in the scaffold." },
    docs: [{ label: "Pydantic AI", url: "https://ai.pydantic.dev/" }],
  },
  {
    id: "strands", name: "Strands Agents", vendor: "AWS", kind: "framework", icon: cdn("amazonaws", "FF9900", Cloud),
    blurb: "Model-driven agents from AWS with tools and multi-agent patterns.",
    build: { language: "python", packages: ["strands-agents", "strands-agents-tools"], features: { tools: yes, mcp: yes, streaming: yes, memory: part, multiAgent: yes, humanInLoop: part, otel: yes },
      notes: "Uses the OpenAI-compatible model provider pointed at the gateway." },
    docs: [{ label: "Strands Agents", url: "https://strandsagents.com/" }],
  },
  {
    id: "smolagents", name: "smolagents", vendor: "Hugging Face", kind: "framework", icon: si(siHuggingface),
    blurb: "Minimal agents that write and run code to solve tasks.",
    build: { language: "python", packages: ["smolagents[openai]"], features: { tools: yes, mcp: yes, streaming: part, memory: part, multiAgent: yes, humanInLoop: no, otel: part },
      notes: "A tool-calling agent. Code agents run model-written code, so run them only in a sandbox." },
    docs: [{ label: "smolagents", url: "https://huggingface.co/docs/smolagents/" }],
  },
  {
    id: "mastra", name: "Mastra", vendor: "Mastra", kind: "framework", icon: cdn("mastra", "07191E", Code2),
    blurb: "TypeScript agents with workflows, memory and evals.",
    build: { language: "typescript", packages: ["@mastra/core", "@ai-sdk/openai", "zod"], features: { tools: yes, mcp: yes, streaming: yes, memory: yes, multiAgent: yes, humanInLoop: yes, otel: yes },
      notes: "A Mastra agent over an OpenAI-compatible provider pointed at the gateway." },
    docs: [{ label: "Mastra", url: "https://mastra.ai/docs" }],
  },
  {
    id: "vercel-ai", name: "Vercel AI SDK", vendor: "Vercel", kind: "framework", icon: si(siVercel),
    blurb: "TypeScript toolkit for model calls, tools and multi-step agent loops.",
    build: { language: "typescript", packages: ["ai", "@ai-sdk/openai", "zod"], features: { tools: yes, mcp: yes, streaming: yes, memory: no, multiAgent: part, humanInLoop: part, otel: yes },
      notes: "A multi-step tool loop over an OpenAI-compatible provider pointed at the gateway." },
    docs: [{ label: "AI SDK", url: "https://ai-sdk.dev/docs" }],
  },

  // ---- Hosted platforms: connect an agent that already runs there
  {
    id: "langgraph-platform", name: "LangGraph Platform", vendor: "LangChain", kind: "platform", icon: si(siLangchain),
    blurb: "Connect agents deployed on LangGraph Platform or LangSmith Deployment.",
    connect: connectBase({
      versionTarget: "LangGraph Platform API, confirmed at connect time", auth: ["api-token"], prerequisites: ["A deployment URL", "A service key with access to the deployment"],
      fields: [f.baseUrl("https://my-agent-1234.us.langgraph.app", "Deployment URL"), { key: "assistantId", label: "Assistant or graph name", type: "text", required: true, placeholder: "agent" },
        { key: "workspaceId", label: "Workspace ID", type: "text", help: "Needed when the key belongs to an organisation with several workspaces." }, f.mode(), f.timeout(), f.budget(), f.tls()],
    }),
    docs: [{ label: "LangGraph Platform", url: "https://langchain-ai.github.io/langgraph/concepts/langgraph_platform/" }],
  },
  {
    id: "crewai-amp", name: "CrewAI AMP", vendor: "CrewAI", kind: "platform", icon: cdn("crewai", "FF5A50", Users),
    blurb: "Connect crews deployed on CrewAI's enterprise platform.",
    connect: connectBase({
      versionTarget: "CrewAI AMP kickoff API, confirmed at connect time", wave: 3, auth: ["api-token"], prerequisites: ["The crew's URL", "Its bearer token"],
      fields: [f.baseUrl("https://my-crew.crewai.com", "Crew URL"), { key: "inputsTemplate", label: "Inputs template (JSON)", type: "textarea", placeholder: "{\"topic\": \"{{input}}\"}", help: "How a Relay task's input becomes the crew's inputs. {{input}} is replaced by the task text." }, f.mode(), f.timeout(300), f.budget(), f.tls()],
    }),
    docs: [{ label: "CrewAI", url: "https://docs.crewai.com/" }],
  },
  {
    id: "llamacloud", name: "LlamaCloud agents", vendor: "LlamaIndex", kind: "platform", icon: cdn("llama", "7A4BFF", Sparkles),
    blurb: "Connect agents and workflows deployed on LlamaCloud.",
    connect: connectBase({
      versionTarget: "LlamaCloud API, confirmed at connect time", wave: 3, auth: ["api-token"], prerequisites: ["A project", "An API key for it"],
      fields: [f.baseUrl("https://api.cloud.llamaindex.ai", "API base URL"), { key: "region", label: "Region", type: "select", options: ["North America", "Europe"], default: "North America" },
        { key: "organizationId", label: "Organisation ID", type: "text" }, { key: "projectId", label: "Project ID", type: "text", required: true }, { key: "agentName", label: "Agent or workflow name", type: "text", required: true }, f.mode(), f.timeout(), f.budget(), f.tls()],
    }),
    docs: [{ label: "LlamaCloud", url: "https://docs.cloud.llamaindex.ai/" }],
  },
  {
    id: "openai-agent-platform", name: "OpenAI agents and workflows", vendor: "OpenAI", kind: "platform", icon: si(siOpenai),
    blurb: "Connect an agent workflow or prompt-based agent that runs in an OpenAI project.",
    connect: connectBase({
      versionTarget: "OpenAI Responses API, confirmed at connect time", auth: ["api-token"], prerequisites: ["A project API key scoped to the agent", "The workflow or prompt ID"],
      fields: [f.baseUrl("https://api.openai.com/v1", "API base URL", "Use the regional host if your project has data residency."), { key: "organization", label: "Organisation ID", type: "text", help: "Sent as OpenAI-Organization when set." },
        { key: "project", label: "Project ID", type: "text", help: "Sent as OpenAI-Project when set." }, { key: "agentRef", label: "Workflow or prompt ID", type: "text", required: true, placeholder: "wf_..." }, f.mode(), f.timeout(), f.budget(), f.tls()],
    }),
    docs: [{ label: "OpenAI platform", url: "https://platform.openai.com/docs" }],
  },
  {
    id: "azure-foundry-agents", name: "Azure AI Foundry Agent Service", vendor: "Microsoft", kind: "platform", icon: cdn("microsoft", "5E5E5E", Cloud),
    blurb: "Connect agents hosted in an Azure AI Foundry project.",
    connect: connectBase({
      versionTarget: "Foundry Agent Service API, confirmed at connect time", auth: ["oidc", "workload-identity", "api-token"], prerequisites: ["A Foundry project endpoint", "The agent ID", "An identity with the Azure AI User role on the project"],
      fields: [f.baseUrl("https://my-resource.services.ai.azure.com/api/projects/my-project", "Project endpoint"), { key: "agentId", label: "Agent ID", type: "text", required: true, placeholder: "asst_..." },
        { key: "apiVersion", label: "API version", type: "text", help: "Leave empty to use the version confirmed at connect time." }, f.tenant(), f.clientId(), f.clientSecretRef(), f.mode(), f.timeout(), f.budget(), f.tls()],
    }),
    docs: [{ label: "Foundry Agent Service", url: "https://learn.microsoft.com/azure/ai-foundry/agents/" }],
  },
  {
    id: "vertex-agent-engine", name: "Vertex AI Agent Engine", vendor: "Google Cloud", kind: "platform", icon: si(siGooglecloud),
    blurb: "Connect agents deployed on Vertex AI Agent Engine.",
    connect: connectBase({
      versionTarget: "Vertex AI Agent Engine API, confirmed at connect time", auth: ["workload-identity", "service-account"], prerequisites: ["The project and location", "The reasoning engine resource name", "A principal with the Vertex AI User role"],
      fields: [{ key: "projectId", label: "Project ID", type: "text", required: true }, { key: "location", label: "Location", type: "text", default: "us-central1", required: true },
        { key: "resourceName", label: "Agent resource name", type: "text", required: true, placeholder: "projects/123/locations/us-central1/reasoningEngines/456" },
        { key: "impersonate", label: "Service account to impersonate", type: "text", placeholder: "agents@my-project.iam.gserviceaccount.com", showWhen: { key: "auth", in: ["workload-identity"] } }, f.mode(), f.timeout(), f.budget(), f.tls()],
    }),
    docs: [{ label: "Agent Engine", url: "https://cloud.google.com/vertex-ai/generative-ai/docs/agent-engine/overview" }],
  },
  {
    id: "bedrock-agents", name: "Amazon Bedrock Agents and AgentCore", vendor: "Amazon Web Services", kind: "platform", icon: si(siAwslambda),
    blurb: "Connect Bedrock Agents and agents hosted on AgentCore Runtime.",
    connect: connectBase({
      versionTarget: "Bedrock Agent Runtime and AgentCore APIs, confirmed at connect time", auth: ["role-assumption", "workload-identity"], prerequisites: ["A role tok∑ner may assume, with bedrock:InvokeAgent or the AgentCore invoke permission", "The agent ID and alias, or the runtime ARN"],
      fields: [{ key: "region", label: "Region", type: "text", default: "us-east-1", required: true }, { key: "target", label: "Target", type: "select", options: ["Bedrock Agent", "AgentCore Runtime"], default: "Bedrock Agent" },
        { key: "agentId", label: "Agent ID", type: "text", showWhen: { key: "target", in: ["Bedrock Agent"] } }, { key: "agentAliasId", label: "Agent alias ID", type: "text", showWhen: { key: "target", in: ["Bedrock Agent"] } },
        { key: "runtimeArn", label: "Runtime ARN", type: "text", placeholder: "arn:aws:bedrock-agentcore:...", showWhen: { key: "target", in: ["AgentCore Runtime"] } },
        { key: "roleArn", label: "Role to assume", type: "text", required: true, placeholder: "arn:aws:iam::123456789012:role/tokener-agents", showWhen: { key: "auth", in: ["role-assumption"] } },
        { key: "externalIdSecretRef", label: "External ID reference", type: "text", placeholder: "secretref://vault/agents/aws-external-id", showWhen: { key: "auth", in: ["role-assumption"] }, help: "Protects against the confused deputy problem. Required for roles shared with a third party." }, f.mode(), f.timeout(), f.budget()],
    }),
    docs: [{ label: "Bedrock Agents", url: "https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html" }],
  },
  {
    id: "copilot-studio", name: "Microsoft Copilot Studio", vendor: "Microsoft", kind: "platform", icon: cdn("microsoft", "5E5E5E", Bot),
    blurb: "Connect copilots built in Copilot Studio.",
    connect: connectBase({
      versionTarget: "Copilot Studio client API, confirmed at connect time", wave: 3, auth: ["oidc", "api-token"], prerequisites: ["The environment ID and the agent's schema name", "An app registration allowed to call the agent, or a Direct Line secret"],
      fields: [{ key: "environmentId", label: "Environment ID", type: "text", required: true }, { key: "agentSchema", label: "Agent schema name", type: "text", required: true, placeholder: "contoso_supportAgent" }, f.tenant(), f.clientId(), f.clientSecretRef(), f.mode(), f.timeout(), f.budget(), f.tls()],
    }),
    docs: [{ label: "Copilot Studio", url: "https://learn.microsoft.com/microsoft-copilot-studio/" }],
  },
  {
    id: "agentforce", name: "Salesforce Agentforce", vendor: "Salesforce", kind: "platform", icon: si(siSalesforce),
    blurb: "Connect Agentforce agents through the Agent API.",
    connect: connectBase({
      versionTarget: "Salesforce Agent API, confirmed at connect time", wave: 3, auth: ["oidc"], prerequisites: ["A connected app with the client credentials flow", "My Domain URL", "The agent ID"],
      fields: [f.baseUrl("https://acme.my.salesforce.com", "My Domain URL"), { key: "agentId", label: "Agent ID", type: "text", required: true }, f.clientId(), f.clientSecretRef(), f.mode(), f.timeout(), f.budget(), f.tls()],
    }),
    docs: [{ label: "Agent API", url: "https://developer.salesforce.com/docs/einstein/genai/guide/agent-api.html" }],
  },
  {
    id: "servicenow-agents", name: "ServiceNow AI agents", vendor: "ServiceNow", kind: "platform", icon: cdn("servicenow", "62D84E", Workflow),
    blurb: "Connect AI agents and agentic workflows in a ServiceNow instance.",
    connect: connectBase({
      versionTarget: "ServiceNow REST API, confirmed at connect time", wave: 3, auth: ["oidc", "basic"], prerequisites: ["An instance URL", "A service user or OAuth client with access to the agent"],
      fields: [f.baseUrl("https://acme.service-now.com", "Instance URL"), { key: "agentRef", label: "Agent or workflow sys_id", type: "text", required: true }, f.clientId(), f.clientSecretRef(), f.mode(), f.timeout(), f.budget(), f.tls()],
    }),
    docs: [{ label: "ServiceNow", url: "https://www.servicenow.com/docs/" }],
  },
  {
    id: "dify", name: "Dify", vendor: "Dify", kind: "platform", icon: cdn("dify", "0033FF", Workflow),
    blurb: "Connect chat, agent and workflow apps from Dify cloud or your own Dify.",
    connect: connectBase({
      versionTarget: "Dify service API, confirmed at connect time", wave: 3, auth: ["api-token"], prerequisites: ["The app's API key (each app has its own)"],
      fields: [f.baseUrl("https://api.dify.ai/v1", "API base URL", "Use your own host for a self-hosted Dify."), { key: "appType", label: "App type", type: "select", options: ["Chat", "Agent", "Workflow", "Chatflow"], default: "Agent", required: true },
        { key: "userField", label: "User identifier sent to Dify", type: "select", options: ["The tok∑ner user", "The calling agent", "A fixed value"], default: "The tok∑ner user" }, f.mode(), f.timeout(), f.budget(), f.tls()],
    }),
    docs: [{ label: "Dify", url: "https://docs.dify.ai/" }],
  },
  {
    id: "flowise", name: "Flowise", vendor: "Flowise", kind: "platform", icon: cdn("flowise", "4F46E5", GitBranch),
    blurb: "Connect agentflows and chatflows from Flowise.",
    connect: connectBase({
      versionTarget: "Flowise prediction API, confirmed at connect time", wave: 3, auth: ["api-token", "none"], prerequisites: ["The chatflow or agentflow ID", "An API key, unless the flow is public"],
      fields: [f.baseUrl("https://flowise.example.internal", "Flowise URL"), { key: "flowId", label: "Flow ID", type: "text", required: true }, f.mode(), f.timeout(), f.budget(), f.tls()],
    }),
    docs: [{ label: "Flowise", url: "https://docs.flowiseai.com/" }],
  },
  {
    id: "n8n-agents", name: "n8n workflows", vendor: "n8n", kind: "platform", icon: si(siN8n),
    blurb: "Expose an n8n workflow or AI agent node as an agent in the registry.",
    connect: connectBase({
      versionTarget: "n8n webhook and public API, confirmed at connect time", wave: 3, auth: ["api-token", "basic", "none"], prerequisites: ["A webhook trigger on the workflow", "The webhook's authentication, if set"],
      fields: [f.baseUrl("https://n8n.example.internal", "n8n URL"), { key: "webhookPath", label: "Webhook path", type: "text", required: true, placeholder: "/webhook/support-agent" }, { key: "webhookAuth", label: "Webhook authentication", type: "select", options: ["Header token", "Basic", "None"], default: "Header token" }, f.mode(), f.timeout(), f.budget(), f.tls()],
    }),
    docs: [{ label: "n8n", url: "https://docs.n8n.io/" }],
  },

  // ---- Protocol adapters: anything that speaks a standard
  {
    id: "tap-agent", name: "TAP agent", vendor: "tok∑ner", kind: "protocol", icon: { lucide: ProtocolsGlyph },
    blurb: "An agent that speaks the tok∑ner Agent Protocols. Read its card, verify its signatures, and delegate tasks to it.",
    connect: connectBase({
      status: "planned", wave: 1, versionTarget: "TAP 1.0", auth: ["oidc", "api-token", "mtls"], prerequisites: ["The agent publishes a card at /.well-known/tokener-agent.json", "Agent Forge builds this for you"],
      capabilities: [{ id: "discover", level: "full" }, { id: "invoke-function", level: "full" }, { id: "logs", level: "full" }, { id: "metrics", level: "full" }],
      limitations: ["Control level follows the card's conformance: observe, govern or collaborate."],
      fields: [f.baseUrl("https://agents.example.internal", "Agent base URL"), { key: "cardPath", label: "Card path", type: "text", default: "/.well-known/tokener-agent.json" },
        { key: "jwksUrl", label: "Signing keys URL", type: "text", placeholder: "https://agents.example.internal/.well-known/jwks.json", help: "When set, tok∑ner verifies the signature on every message from this agent." },
        { key: "requireSignatures", label: "Require signed messages", type: "toggle", default: true }, f.clientId(), f.clientSecretRef(), f.tenant(), f.mode(), f.timeout(), f.budget(), f.tls()],
    }),
    docs: [{ label: "TAP specification", url: "/docs/48-agent-protocols.md" }],
  },
  {
    id: "a2a-agent", name: "A2A agent", vendor: "Agent2Agent", kind: "protocol", icon: { lucide: ProtocolsGlyph },
    blurb: "Any agent that publishes an A2A agent card. tok∑ner bridges its tasks to Relay.",
    connect: connectBase({
      status: "planned", wave: 2, versionTarget: "A2A, confirmed from the agent card at connect time", auth: ["oidc", "api-token", "mtls", "none"], prerequisites: ["The agent card URL", "The authentication scheme the card names"],
      limitations: ["TAP fields that A2A has no place for, such as the delegation chain and receipts, are kept by tok∑ner and not sent.", "Control level is Observed unless the agent's model and tool calls pass through the gateway."],
      fields: [f.baseUrl("https://agents.example.com", "Agent base URL"), { key: "cardUrl", label: "Agent card URL", type: "text", required: true, placeholder: "https://agents.example.com/.well-known/agent-card.json" },
        { key: "transport", label: "Transport", type: "select", options: ["Use the card's preferred transport", "JSON-RPC over HTTPS", "gRPC", "HTTP and JSON"], default: "Use the card's preferred transport" }, f.clientId(), f.clientSecretRef(), f.tenant(), f.mode(), f.timeout(), f.budget(), f.tls()],
    }),
    docs: [{ label: "A2A", url: "https://a2a-protocol.org/" }],
  },
  {
    id: "http-agent", name: "HTTPS agent", vendor: "Any vendor", kind: "protocol", icon: si(siOpenapiinitiative),
    blurb: "Any agent behind an HTTPS endpoint: an OpenAI-compatible chat API or your own JSON contract.",
    connect: connectBase({
      status: "planned", wave: 1, versionTarget: "HTTPS, any JSON contract", auth: ["api-token", "basic", "mtls", "oidc", "none"], prerequisites: ["An https endpoint reachable from the control plane or an enrolled agent"],
      limitations: ["Visibility is limited to what the endpoint returns.", "Control level is Inventory until the agent reports traces or routes its calls through the gateway."],
      fields: [f.baseUrl("https://agent.example.internal/v1/chat/completions", "Endpoint"),
        { key: "contract", label: "Request contract", type: "select", options: ["OpenAI chat completions", "tok∑ner Relay (TAP)", "Custom JSON"], default: "OpenAI chat completions" },
        { key: "requestTemplate", label: "Request body template (JSON)", type: "textarea", placeholder: "{\"question\": \"{{input}}\"}", showWhen: { key: "contract", in: ["Custom JSON"] } },
        { key: "responsePath", label: "Where the answer is in the response", type: "text", placeholder: "$.answer", showWhen: { key: "contract", in: ["Custom JSON"] } },
        { key: "headerName", label: "Header that carries the key", type: "text", default: "Authorization", showWhen: { key: "auth", in: ["api-token"] } },
        { key: "headerPrefix", label: "Header value prefix", type: "text", default: "Bearer ", showWhen: { key: "auth", in: ["api-token"] } }, f.clientId(), f.clientSecretRef(), f.tenant(), f.mode(), f.timeout(), f.budget(), f.tls()] as FieldDef[],
    }),
    docs: [{ label: "OpenAI chat API", url: "https://platform.openai.com/docs/api-reference/chat" }],
  },
];

export const ADAPTER_BY_ID: Record<string, AdapterDef> = Object.fromEntries(ADAPTERS.map((a) => [a.id, a]));
export const BUILDABLE = ADAPTERS.filter((a) => a.build);
export const CONNECTABLE = ADAPTERS.filter((a) => a.connect);

/** The connectable adapters as catalogue entries. The shared connection wizard, secret handling and health model apply to them unchanged. */
export function agentIntegrations(): IntegrationDef[] {
  return CONNECTABLE.map((a) => ({
    id: a.id, name: a.name, vendor: a.vendor, family: "agent" as const, icon: a.icon, blurb: a.blurb,
    ...a.connect!, docs: a.connect!.docs.length ? a.connect!.docs : a.docs,
  }));
}

