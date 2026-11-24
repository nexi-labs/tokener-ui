import {
  siKubernetes, siMlflow, siKnative, siBentoml, siRay, siHuggingface, siPytorch, siTensorflow, siOnnx,
  siGooglecloud, siDocker, siPostgresql, siMinio, siApachekafka, siMilvus, siNvidia, siPrometheus,
  siGrafana, siOpentelemetry, siGmail, siGooglecalendar, siSendgrid, siMailgun, siPaypal, siStripe, siAdyen, siOrange, siBitcoin, siTwilio, siApachespark, siLangchain, siAmazons3, siAwslambda, siLinux, siRedis, siHarbor,
} from "simple-icons";
import { Server, Boxes, Cloud, Database, Cpu, Globe, Package, Workflow, Mail, Inbox, CalendarDays, Smartphone, CreditCard, Blocks, TerminalSquare, Globe as GlobeIcon, MessageSquare } from "lucide-react";
import type { CapabilityId, CapabilitySupport, FieldDef, IntegrationDef, IntegrationStatus } from "./types";
import type { IconRef } from "@/components/studio/types";
import { SHIPPED_CONTRACTS } from "./contracts";
import { agentIntegrations } from "@/lib/agents/adapters";

const si = (i: { title: string; path: string; hex: string }) => ({ si: i });
const cdn = (slug: string, hex: string, fallback: any) => ({ cdn: slug, hex, fallback });

const cap = (...items: (CapabilityId | [CapabilityId, "full" | "partial" | "none", string?])[]): CapabilitySupport[] =>
  items.map((i) => (typeof i === "string" ? { id: i, level: "full" as const } : { id: i[0], level: i[1], note: i[2] }));

const f = {
  endpoint: (placeholder: string, help?: string): FieldDef => ({ key: "endpoint", label: "Endpoint", type: "text", placeholder, required: true, help }),
  tls: (): FieldDef => ({ key: "tlsVerify", label: "Verify TLS certificates", type: "toggle", default: true, help: "On by default. Turning it off is blocked for production environments." }),
  ca: (): FieldDef => ({ key: "caBundle", label: "Custom CA bundle (PEM)", type: "textarea", placeholder: "Paste a CA certificate chain, or leave empty to use the system trust store", help: "Public certificates only. Never paste a private key here." }),
  ns: (def = "default"): FieldDef => ({ key: "namespace", label: "Namespace", type: "text", default: def }),
  region: (def: string): FieldDef => ({ key: "region", label: "Region", type: "text", default: def }),
};

const DOCS_NOTE = "Version compatibility is confirmed by a live check at connect time.";

/** Honest status per entry. Available or Beta only where a real, tested connector exists. */

// ---------------------------------------------------------------------------------------------
// MCP (Model Context Protocol). One definition per transport. The security and policy fields are shared.

const MCP_ICON = (): IconRef => cdn("modelcontextprotocol", "07191E", Blocks);

const mcpPolicyFields = (): FieldDef[] => [
  { key: "toolExposure", group: "Which tools agents may use", label: "Tool exposure", type: "select", options: ["Only tools I approve (recommended)", "Read-only tools the server marks as such", "Every tool the server offers"], default: "Only tools I approve (recommended)", help: "Servers describe their own tools, and those descriptions are untrusted text. Approving tools one by one keeps a server from adding a new capability without your review." },
  { key: "toolAllowlist", label: "Approved tools", type: "textarea", placeholder: "search_issues\ncreate_issue", showWhen: { key: "toolExposure", in: ["Only tools I approve (recommended)"] }, help: "One tool name per line. Leave empty to discover tools first and approve them in the connection page." },
  { key: "toolDenylist", label: "Blocked tools", type: "textarea", placeholder: "delete_repository", help: "One tool name per line. Blocked tools stay blocked even if the server renames or re-describes them." },
  { key: "approveWrites", label: "Ask a person before tools that change data", type: "toggle", default: true, help: "Applies to tools that are not marked read-only, or whose annotations are missing. Recommended for every environment." },
  { key: "pinTools", label: "Pin tool definitions and block on change", type: "toggle", default: true, help: "Stores a hash of each approved tool's name, description and input schema. If the server changes any of them, calls stop until someone reviews the change." },
  { key: "enableResources", group: "What the server may offer", label: "Resources (read-only context)", type: "toggle", default: true },
  { key: "enablePrompts", label: "Prompt templates", type: "toggle", default: false, help: "Prompts are text the server supplies to your agent. Off by default." },
  { key: "allowSampling", label: "Let the server ask for a model completion (older protocol revisions)", type: "toggle", default: false, help: "When on, requests go through the tok∑ner gateway so policy, budget and metering still apply. The newest protocol revision removes server-initiated requests." },
  { key: "allowElicitation", label: "Let the server ask the user for input (older protocol revisions)", type: "toggle", default: false, help: "Requests for passwords, tokens or other secrets are always refused." },
  { key: "connectTimeoutSec", group: "Limits", label: "Connect timeout (seconds)", type: "number", default: 10 },
  { key: "callTimeoutSec", label: "Tool call timeout (seconds)", type: "number", default: 60 },
  { key: "maxConcurrent", label: "Calls at the same time, at most", type: "number", default: 4 },
  { key: "maxResultKb", label: "Largest result accepted (KB)", type: "number", default: 256, help: "Larger results are cut off and flagged, so one tool cannot flood a model's context." },
  { key: "redactResults", label: "Redact secrets and personal data in results", type: "toggle", default: true },
  { key: "logLevel", label: "Audit detail", type: "select", options: ["Metadata only (recommended)", "Metadata and redacted arguments", "Off for arguments and results"], default: "Metadata only (recommended)", help: "Every call is audited with its tool, caller, duration and result size. Arguments are stored only if you choose to." },
];

const MCP_COMPLIANCE_COMMON = [
  "Treat the server and everything it returns as untrusted. Tool descriptions and results can contain instructions aimed at your model (prompt injection and tool poisoning). Results reach a model only through the tok∑ner gateway, where policy and redaction apply.",
  "Approve each tool and require a person for any tool that changes data. A tool the server marks read-only is trusted only as far as the server is.",
  "Know where the data goes. A third-party server receives every argument you send it. Sign a data processing agreement where personal data is involved, and check where the operator stores and processes it.",
  "Log every call. Audit records keep the tool name, caller, time, duration and result size, and arguments only if you turn that on.",
  "Tokens are never forwarded. The platform never passes a token it received from one server, or from you, to another server.",
];

function mcpIntegrations(): IntegrationDef[] {
  const oauthFields = (): FieldDef[] => [
    { key: "oauthFlow", group: "OAuth 2.1", label: "Flow", type: "select", options: ["Authorization code with PKCE (acts as a person)", "Client credentials (service to service)"], default: "Authorization code with PKCE (acts as a person)", showWhen: { key: "auth", in: ["oidc"] } },
    { key: "clientRegistration", label: "How the platform gets a client id", type: "select", options: ["Client ID metadata document (recommended)", "Pre-registered client", "Dynamic client registration (deprecated)"], default: "Client ID metadata document (recommended)", showWhen: { key: "auth", in: ["oidc"] }, help: "Pre-registered is the safest when the authorization server supports it. Dynamic registration is kept only for servers that cannot use the other two." },
    { key: "clientId", label: "Client id", type: "text", showWhen: { key: "clientRegistration", in: ["Pre-registered client"] }, help: "The client secret, if there is one, is stored as a secret reference." },
    { key: "scopes", label: "Scopes", type: "text", placeholder: "Leave empty to use what the server asks for", showWhen: { key: "auth", in: ["oidc"] }, help: "Request the least that works. The platform asks for more only when the server says a call needs it, and stops after a few attempts." },
    { key: "authorizationServer", label: "Authorization server (optional)", type: "text", placeholder: "Found from the server's metadata when empty", showWhen: { key: "auth", in: ["oidc"] }, help: "Only set this to pin the issuer. The platform checks the issuer on every authorization response." },
  ];
  const keyFields = (): FieldDef[] => [
    { key: "tokenHeader", group: "API key or bearer token", label: "Header name", type: "text", default: "Authorization", showWhen: { key: "auth", in: ["api-token"] } },
    { key: "tokenPrefix", label: "Prefix", type: "select", options: ["Bearer ", "(none)"], default: "Bearer ", showWhen: { key: "auth", in: ["api-token"] } },
  ];
  const extraHeaders = (): FieldDef => ({ key: "extraHeaders", label: "Extra headers", type: "textarea", placeholder: "X-Workspace=secretref://vault/nexi/mcp/workspace", help: "One per line as NAME=secretref://... Values stay in your secret manager." });

  const remote = (id: string, name: string, legacy: boolean): IntegrationDef => ({
    id, name, vendor: "Model Context Protocol", family: "mcp", icon: MCP_ICON(), status: "planned",
    blurb: legacy ? "Connect an older server that still speaks HTTP with Server-Sent Events. Prefer Streamable HTTP where the server offers it." : "Connect a remote MCP server over Streamable HTTP so agents can use its tools, resources and prompts.",
    versionTarget: legacy ? "MCP revision 2024-11-05, HTTP+SSE transport" : "MCP revisions 2025-03-26 through 2026-07-28, Streamable HTTP",
    auth: ["none", "api-token", "oidc", "mtls", "basic"],
    prerequisites: [
      "The server's HTTPS address and the protocol revision it supports",
      "An account or workspace on the server, and the least-privilege access you want agents to have",
      "For OAuth: a server that publishes protected resource metadata. The platform finds the authorization server from it",
      "For a server inside your network: an enrolled build agent or private link, so the control plane never needs inbound access",
    ],
    capabilities: cap("discover", "validate", "call-tool", "read-resource", ["get-prompt", "partial", "Off by default."]),
    limitations: [
      legacy ? "The HTTP+SSE transport was replaced by Streamable HTTP. It is offered for servers that have not moved yet." : "A server that only speaks the older HTTP+SSE transport needs the legacy connection type.",
      "The platform lists what the server offers and never runs a tool it has not been told to expose.",
      "Server-initiated requests such as sampling exist only in older revisions. The newest revision removes them.",
      DOCS_NOTE,
    ],
    permissions: { read: ["List tools, resources and prompts", "Read resources", "Call tools marked read-only"], write: ["Call tools that change data, after approval"] },
    compliance: [
      ...MCP_COMPLIANCE_COMMON,
      "Use HTTPS only. Plain HTTP is accepted for localhost in non-production environments and nowhere else. Access tokens are sent in the Authorization header and never in the URL.",
      "For OAuth, the platform uses PKCE, sends the resource parameter on every authorization and token request, and compares the issuer on every authorization response. It sends a token only to the server it was issued for.",
      "Calls to servers are made from the control plane or your agent, never from a user's browser. Addresses in private ranges, link-local and cloud metadata addresses are refused unless the connection goes through your own agent.",
      "A server that holds personal data is a processor on your behalf. Record it in your register of processing, and remove it when it is no longer used.",
    ],
    fields: [
      { key: "url", label: legacy ? "SSE endpoint" : "Server address", type: "text", placeholder: "https://mcp.example.com/mcp", required: true, help: "The canonical address of the server. It is also the OAuth resource the token is issued for." },
      { key: "protocolVersion", label: "Protocol revision", type: "select", options: legacy ? ["2024-11-05"] : ["Negotiate (recommended)", "2026-07-28", "2025-06-18", "2025-03-26"], default: legacy ? "2024-11-05" : "Negotiate (recommended)", help: "Negotiated at connect time. The connection fails if the server and the platform share no revision." },
      ...keyFields(), ...oauthFields(), extraHeaders(),
      ...mcpPolicyFields(),
      f.tls(),
    ],
    docs: [{ label: "MCP specification", url: "https://modelcontextprotocol.io/specification" }, { label: "MCP authorization", url: "https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization" }],
  });

  const stdio: IntegrationDef = {
    id: "mcp-stdio", name: "MCP server (local process, stdio)", vendor: "Model Context Protocol", family: "mcp", icon: { lucide: TerminalSquare }, status: "planned",
    blurb: "Run an MCP server as a process on one of your build agents and talk to it over standard input and output. The control plane never runs it.", versionTarget: "MCP stdio transport",
    auth: ["secret-manager", "none"], privateConnectivity: true,
    prerequisites: [
      "An enrolled agent on the machine or cluster where the server should run",
      "The command, its arguments and the package version or image digest you have reviewed",
      "Each credential the server reads from its environment, stored in your secret manager",
    ],
    capabilities: cap("discover", "validate", "call-tool", "read-resource", ["get-prompt", "partial", "Off by default."]),
    limitations: [
      "The agent starts the process when a pipeline needs it and stops it afterwards unless you choose to keep it running.",
      "Credentials reach the process only as environment variables resolved on the agent at start time.",
      "Standard input and output carry protocol messages only. Anything else the process prints goes to the agent's log.",
      DOCS_NOTE,
    ],
    permissions: { read: ["Start the process and list its tools", "Call tools marked read-only"], write: ["Call tools that change data, after approval"] },
    compliance: [
      ...MCP_COMPLIANCE_COMMON,
      "A local server is code running on your machine. Review it as you would any dependency, pin the version or the image digest, and prefer a container with no extra privileges.",
      "Run it with the least access that works: a read-only filesystem except for the folders you list, no network or only the hosts you list, and no access to the agent's own credentials.",
      "Never build the command from model output. The command and arguments here are fixed, and arguments are passed as a list so nothing is interpreted by a shell.",
      "Credentials come from the environment, not from OAuth. Rotate them in your secret manager.",
    ],
    fields: [
      { key: "agentId", label: "Agent", type: "text", placeholder: "nexi-build-01", required: true, help: "The enrolled build agent that runs the process." },
      { key: "runtime", group: "Process", label: "Run as", type: "select", options: ["Container with no extra privileges (recommended)", "Process under a dedicated unprivileged user"], default: "Container with no extra privileges (recommended)" },
      { key: "image", label: "Container image", type: "text", placeholder: "registry.nexi.example/mcp/github@sha256:...", showWhen: { key: "runtime", in: ["Container with no extra privileges (recommended)"] }, help: "Pin by digest so a new upload under the same tag cannot change what runs." },
      { key: "command", label: "Command", type: "text", placeholder: "npx", required: true, showWhen: { key: "runtime", in: ["Process under a dedicated unprivileged user"] } },
      { key: "args", label: "Arguments", type: "textarea", placeholder: "-y\n@modelcontextprotocol/server-github@1.2.3", help: "One per line. Pin exact versions." },
      { key: "envRefs", label: "Environment", type: "textarea", placeholder: "GITHUB_TOKEN=secretref://vault/nexi/mcp/github#token", help: "One per line as NAME=secretref://... The agent resolves them when the process starts." },
      { key: "network", group: "Sandbox", label: "Network access", type: "select", options: ["None", "Only the hosts listed below", "Unrestricted (not recommended)"], default: "Only the hosts listed below" },
      { key: "egressAllowlist", label: "Allowed hosts", type: "textarea", placeholder: "api.github.com:443", showWhen: { key: "network", in: ["Only the hosts listed below"] } },
      { key: "filesystem", label: "Filesystem", type: "select", options: ["No access", "Read-only folders listed below", "Read and write folders listed below"], default: "No access" },
      { key: "roots", label: "Folders", type: "textarea", placeholder: "/srv/workspace", showWhen: { key: "filesystem", in: ["Read-only folders listed below", "Read and write folders listed below"] }, help: "Shared with the server as its roots. It cannot go outside them." },
      { key: "lifecycle", label: "Lifecycle", type: "select", options: ["Start when needed, stop afterwards", "Keep running and restart on failure"], default: "Start when needed, stop afterwards" },
      { key: "startupTimeoutSec", label: "Start timeout (seconds)", type: "number", default: 30 },
      ...mcpPolicyFields(),
    ],
    docs: [{ label: "MCP transports", url: "https://modelcontextprotocol.io/specification/2026-07-28/basic/transports" }],
  };

  return [remote("mcp-http", "MCP server (remote, Streamable HTTP)", false), remote("mcp-sse", "MCP server (remote, legacy SSE)", true), stdio];
}

// Code Mode (Cloudflare). The model writes a short program against a typed API generated from MCP tools, and the program runs in a sandbox.
// Two entries: a Cloudflare MCP server, which exposes search and execute over the Cloudflare API, and Cloudflare Workers as the place an agent's
// Code Mode programs run. The self-hosted sandboxes (isolate, WebAssembly, micro virtual machine) need no connection and are chosen on the agent.
function codeModeIntegrations(): IntegrationDef[] {
  const cfIcon = (): IconRef => cdn("cloudflare", "F38020", Cloud);
  const common = [
    "Every tool call a program makes is checked like any other call: tool allowed, definition pinned, arguments valid, and a change of data waits for a person.",
    "A program has no network of its own and holds no secret. Credentials are attached by the platform when a call is made and never appear in the program or its output.",
    "Know where the data goes. When programs run at Cloudflare, tool arguments and results pass through Cloudflare. Check your data location policy and your agreement with Cloudflare first.",
    "Availability of Code Mode at Cloudflare has changed since it was announced. Confirm the current status and terms with Cloudflare before relying on it.",
  ];
  return [
    {
      id: "cloudflare-mcp", name: "Cloudflare MCP server", vendor: "Cloudflare", family: "mcp", icon: cfIcon(), status: "planned",
      blurb: "Let agents work with the Cloudflare API through two tools, search and execute, instead of one tool for every endpoint. The agent searches the API description, then writes a short program that calls it.",
      versionTarget: "Cloudflare's remote MCP server for the Cloudflare API, Streamable HTTP",
      auth: ["oidc", "api-token"],
      prerequisites: ["A Cloudflare account and the least-privilege API token or OAuth grant you want agents to hold", "The server address published by Cloudflare", "Agents set to Code Mode if you want the program style; direct calls work with the two tools too"],
      capabilities: cap("discover", "validate", "call-tool", ["read-resource", "none"], ["get-prompt", "none"]),
      limitations: ["Search and execute reach the whole Cloudflare API that the token allows. Scope the token, then approve which calls may change anything.", "Not tested against Cloudflare's own service.", DOCS_NOTE],
      permissions: { read: ["Search the API description", "Run read-only calls the token allows"], write: ["Run calls that change Cloudflare settings, after approval"] },
      compliance: [...MCP_COMPLIANCE_COMMON, "Calls that change DNS, access rules or Workers can take a site offline. Keep approval on for every write."],
      fields: [
        { key: "url", label: "Server address", type: "text", placeholder: "https://mcp.cloudflare.com/mcp", required: true, help: "The address Cloudflare publishes for its server." },
        { key: "tokenHeader", label: "Header name", type: "text", default: "Authorization", showWhen: { key: "auth", in: ["api-token"] } },
        ...mcpPolicyFields(),
        f.tls(),
      ],
      docs: [{ label: "Cloudflare Code Mode", url: "https://blog.cloudflare.com/code-mode/" }, { label: "Cloudflare MCP", url: "https://developers.cloudflare.com/agents/model-context-protocol/" }],
    },
    {
      id: "cloudflare-code-mode", name: "Code Mode sandbox (Cloudflare Workers)", vendor: "Cloudflare", family: "mcp", icon: cfIcon(), status: "planned",
      blurb: "Run the programs an agent writes in Code Mode on Cloudflare, so you operate no sandbox. The program can call only the tools bound to it.",
      versionTarget: "Cloudflare Workers with dynamically loaded Workers, current API confirmed at connect time",
      auth: ["api-token"],
      prerequisites: ["A Cloudflare account with Workers enabled and permission to run dynamic Workers", "An API token limited to the account and the Worker that hosts the runner", "A data location policy that allows the Cloudflare region you intend to use"],
      capabilities: cap("validate", ["invoke-function", "partial", "Runs the generated program. Each tool call returns to the platform to be checked."]),
      limitations: ["Tool arguments and results pass through Cloudflare while a program runs.", "Limits set on the agent apply, and the platform stops a program that passes them.", "Not tested against Cloudflare's own service.", DOCS_NOTE],
      permissions: { read: ["Check that the runner Worker answers"], write: ["Run programs in the runner Worker"] },
      compliance: common,
      fields: [
        { key: "accountId", label: "Account id", type: "text", required: true, placeholder: "Your Cloudflare account id" },
        { key: "runner", label: "Runner Worker name", type: "text", default: "tokener-code-runner", help: "The Worker that loads each program in its own isolate." },
        { key: "region", label: "Allowed region", type: "select", options: ["Any Cloudflare location", "European Union only", "United States only"], default: "Any Cloudflare location", help: "Stops a program from starting when the region cannot be honoured." },
        { key: "maxCpuMs", label: "Processor time limit (ms)", type: "number", default: 5000 },
        { key: "maxSubrequests", label: "Tool calls per program, at most", type: "number", default: 25 },
        f.tls(),
      ],
      docs: [{ label: "Cloudflare Code Mode", url: "https://blog.cloudflare.com/code-mode/" }, { label: "Dynamic Workers", url: "https://developers.cloudflare.com/workers/" }],
    },
  ];
}

const BASE_INTEGRATIONS: IntegrationDef[] = [
  // ---- Targets and infrastructure
  {
    id: "kubernetes", name: "Kubernetes cluster", vendor: "CNCF", family: "infrastructure", icon: si(siKubernetes), status: "planned", wave: 1,
    blurb: "Local or remote clusters as deployment targets, discovered read-only first.",
    versionTarget: "Kubernetes 1.28 to 1.32 (checked via /version at connect time)",
    auth: ["k8s-token", "oidc", "workload-identity", "mtls"],
    prerequisites: ["API server reachable from the control plane or a registered agent", "A service account or OIDC identity bound to a namespaced Role", "Cluster CA certificate if the API server uses a private CA"],
    capabilities: cap("discover", "validate", "plan", "deploy", "scale", "autoscale", "rollback", "logs", "metrics", ["gpu", "partial", "Scheduling only. Drivers and the NVIDIA device plugin must already exist."]),
    limitations: ["Cluster-admin is never requested. Namespaced Roles only.", "Node driver and firmware changes are out of scope.", DOCS_NOTE],
    permissions: {
      read: ["get, list, watch on namespaces, pods, deployments, services, events in the target namespace", "get on nodes (labels and allocatable resources only)"],
      write: ["create, update, patch, delete on deployments, services, horizontalpodautoscalers, configmaps in the target namespace", "No access to secrets unless a secret reference is mounted by name"],
    },
    fields: [f.endpoint("https://k8s.example.internal:6443"), f.ns(), f.tls(), f.ca()],
    docs: [{ label: "Kubernetes API access control", url: "https://kubernetes.io/docs/concepts/security/controlling-access/" }, { label: "RBAC authorization", url: "https://kubernetes.io/docs/reference/access-authn-authz/rbac/" }],
    privateConnectivity: true,
  },
  {
    id: "linux-agent", name: "Customer Linux server (agent)", vendor: "tok∑ner", family: "infrastructure", icon: si(siLinux), status: "planned", wave: 1,
    blurb: "On-prem or cloud VMs managed through a scoped outbound-only agent. No inbound ports.",
    versionTarget: "Agent 0.x preview contract. Linux x86_64 and arm64, systemd 245 or later",
    auth: ["api-token", "mtls"],
    prerequisites: ["Outbound HTTPS from the host to the control plane", "A one-time enrollment token generated in Build Agents", "Docker or Podman if the agent will build or run containers"],
    capabilities: cap("discover", "validate", "plan", "deploy", "logs", "metrics", "build", ["gpu", "partial", "Detects installed NVIDIA drivers. Never installs or changes them without a separate explicit authorization."]),
    limitations: ["The agent runs only the operations listed in its allowlist.", "Host driver, kernel and firmware changes are not performed.", "Target for local development and small fleets. Not a replacement for an orchestrator."],
    permissions: { read: ["Read host facts: OS, CPU, memory, GPU model and driver version", "Read container runtime state"], write: ["Run allowlisted container operations as an unprivileged user", "Write only to the agent work directory"] },
    fields: [{ key: "agentId", label: "Registered agent", type: "select", options: ["Pick after enrolling an agent"], help: "Create one under Build Agents." }, f.ns("tokener")],
    docs: [{ label: "systemd service units", url: "https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html" }],
    privateConnectivity: true,
  },
  {
    id: "aws", name: "AWS account", vendor: "Amazon Web Services", family: "infrastructure", icon: cdn("amazonaws", "FF9900", Cloud), status: "planned", wave: 2,
    blurb: "Role assumption into a customer account for EKS, ECR, S3 and SageMaker discovery.",
    versionTarget: "AWS APIs, SDK-signed requests (SigV4)",
    auth: ["role-assumption", "workload-identity", "oidc"],
    prerequisites: ["An IAM role with a trust policy for the control plane identity and an external ID", "Region list"],
    capabilities: cap("discover", "validate", "plan", "logs", "metrics"),
    limitations: ["Long-lived access keys are not accepted in production environments.", DOCS_NOTE],
    permissions: { read: ["sts:AssumeRole", "eks:Describe*, ecr:Describe*, s3:List*, sagemaker:List*, sagemaker:Describe*"], write: ["Scoped per resource ARN after read-only verification"] },
    fields: [{ key: "roleArn", label: "Role ARN", type: "text", placeholder: "arn:aws:iam::123456789012:role/tokener-discovery", required: true }, { key: "externalId", label: "External ID", type: "text", help: "Prevents the confused-deputy problem. Generated for you." }, f.region("us-east-1")],
    docs: [{ label: "AWS IAM roles", url: "https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles.html" }],
  },
  {
    id: "aws-lambda", name: "AWS Lambda", vendor: "Amazon Web Services", family: "infrastructure", icon: si(siAwslambda), status: "planned", wave: 2,
    blurb: "Call AWS Lambda functions from pipelines, workflows and tok∑ner functions. The role is assumed from a secret reference, and every call passes policy, limits and cost attribution.",
    versionTarget: "AWS Lambda Invoke API, SigV4-signed requests, any supported Lambda runtime",
    auth: ["role-assumption", "workload-identity", "oidc"],
    prerequisites: [
      "An IAM role with a trust policy for the control plane identity and the external ID shown below",
      "A permission policy that allows lambda:InvokeFunction on the exact function ARNs you list, and nothing else",
      "Functions published with a version or an alias, so a call never runs an unreviewed $LATEST",
      "For private networks: interface VPC endpoints for AWS STS and Lambda",
    ],
    capabilities: cap("discover", "validate", "invoke-function", "logs", ["metrics", "partial", "Duration and error counts from the invocation result. CloudWatch metrics are read only if the role allows it."], ["write-data", "partial", "Only for functions you mark as changing data. Those need an approval step."]),
    limitations: [
      "tok∑ner calls your Lambda functions. It never copies, builds, deploys or updates Lambda code.",
      "A synchronous call accepts a payload of up to 6 MB and an asynchronous call up to 256 KB. These are AWS limits and can change, so the connect check confirms them.",
      "A call can run for at most 900 seconds, the Lambda limit. Longer work belongs in a workflow with asynchronous steps.",
      "Long-lived access keys are not accepted in any environment. Use a role.",
      DOCS_NOTE,
    ],
    permissions: { read: ["sts:AssumeRole into the role you provide", "lambda:GetFunctionConfiguration on the listed functions, to verify runtime, timeout and qualifier at connect time"], write: ["lambda:InvokeFunction on the listed function ARNs only. No wildcard across accounts."] },
    compliance: [
      "Treat the function and its output as untrusted input to your own systems. A function result is data, never an instruction for a model.",
      "Scope the role to the exact functions. A broad lambda:* grant would let any pipeline call any function in the account.",
      "Know where the data goes. A payload is sent to the region you choose, in your AWS account. Check data residency for personal data.",
      "Function logs can contain personal data. Tail logs are redacted before they are stored, and you can turn log return off.",
      "Calls are audited with the function ARN, qualifier, caller, duration and billed duration. Payloads are kept only if you turn that on.",
    ],
    fields: [
      { key: "roleArn", group: "AWS account and identity", label: "Role ARN", type: "text", placeholder: "arn:aws:iam::111122223333:role/tokener-lambda-invoke", required: true, help: "The role tok∑ner assumes for each call. Use a dedicated role." },
      { key: "externalId", label: "External ID", type: "text", help: "Prevents the confused-deputy problem. Generated for you. Put it in the role's trust policy.", placeholder: "Generated when you save" },
      f.region("me-central-1"),
      { key: "sessionDurationSec", label: "Session length (seconds)", type: "number", default: 900, help: "How long assumed credentials last. 900 to 43200, and not longer than the role allows." },
      { key: "allowedFunctions", group: "Functions this connection may call", label: "Allowed function ARNs", type: "textarea", required: true, placeholder: "arn:aws:lambda:me-central-1:111122223333:function:limits-check\narn:aws:lambda:me-central-1:111122223333:function:fx-rates", help: "One ARN per line. A wildcard is allowed only at the end of the function name, for example function:reports-*." },
      { key: "allowLatest", label: "Allow $LATEST", type: "toggle", default: false, help: "Off by default. $LATEST changes whenever someone saves the function, so a published pipeline could run different code tomorrow." },
      { key: "effectPolicy", label: "What the functions may do", type: "select", options: ["Read only", "May change data"], default: "Read only", help: "Read only blocks any pipeline step that says its function changes data. Choosing May change data also needs an approval step in the pipeline." },
      { key: "defaultInvocation", group: "Invocation defaults", label: "Invocation type", type: "select", options: ["Wait for the result (RequestResponse)", "Asynchronous (Event)", "Validate only (DryRun)"], default: "Wait for the result (RequestResponse)" },
      { key: "timeoutSec", label: "Call timeout (seconds)", type: "number", default: 30, help: "At most 900, the Lambda limit." },
      { key: "maxPayloadKb", label: "Largest payload (KB)", type: "number", default: 256, help: "At most 6144 for a synchronous call and 256 for an asynchronous one." },
      { key: "maxConcurrent", label: "Calls at the same time, at most", type: "number", default: 10, help: "Protects the account concurrency limit shared with your other workloads." },
      { key: "retryOnThrottle", label: "Retry when AWS throttles", type: "toggle", default: true },
      { key: "maxRetries", label: "Retries", type: "number", default: 2, showWhen: { key: "retryOnThrottle", in: ["true"] }, help: "Retries use exponential backoff with jitter. Only throttling and 5xx responses are retried, never a function error." },
      { key: "returnLogs", label: "Return function logs", type: "select", options: ["None", "Tail (last 4 KB)"], default: "None" },
      { key: "redactResults", label: "Redact secrets and personal data in results and logs", type: "toggle", default: true },
      { key: "onFailureDestination", label: "Failure destination for asynchronous calls (optional)", type: "text", placeholder: "arn:aws:sqs:me-central-1:111122223333:tokener-lambda-failures", help: "An SQS queue or SNS topic ARN that receives events that failed every retry." },
      { key: "privateLink", group: "Network", label: "Reach AWS through VPC endpoints (PrivateLink)", type: "toggle", default: false, help: "Keeps STS and Lambda traffic off the public internet." },
      { key: "vpcEndpointUrl", label: "Lambda VPC endpoint address", type: "text", placeholder: "https://vpce-0abc123.lambda.me-central-1.vpce.amazonaws.com", showWhen: { key: "privateLink", in: ["true"] } },
      f.tls(),
      { key: "auditLevel", group: "Audit", label: "Audit detail", type: "select", options: ["Metadata only (recommended)", "Metadata and redacted payloads", "Off for payloads and results"], default: "Metadata only (recommended)", help: "Every call is audited with its function, qualifier, caller, time and billed duration. Payloads are kept only if you choose to." },
    ],
    docs: [{ label: "Lambda Invoke API", url: "https://docs.aws.amazon.com/lambda/latest/api/API_Invoke.html" }, { label: "Lambda quotas", url: "https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html" }, { label: "IAM roles and external IDs", url: "https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-user_externalid.html" }],
    privateConnectivity: true,
  },
  {
    id: "azure", name: "Azure subscription", vendor: "Microsoft", family: "infrastructure", icon: cdn("microsoftazure", "0078D4", Cloud), status: "planned", wave: 2,
    blurb: "Workload identity federation into a subscription for AKS, ACR and Azure ML discovery.",
    versionTarget: "Azure Resource Manager APIs",
    auth: ["workload-identity", "oidc", "service-account"],
    prerequisites: ["An app registration with a federated credential", "Reader role on the target scope"],
    capabilities: cap("discover", "validate", "plan", "logs", "metrics"),
    limitations: [DOCS_NOTE],
    permissions: { read: ["Reader on subscription or resource group"], write: ["Contributor scoped to a single resource group, only after read-only verification"] },
    fields: [{ key: "tenantId", label: "Directory (tenant) ID", type: "text", required: true }, { key: "subscriptionId", label: "Subscription ID", type: "text", required: true }, { key: "clientId", label: "Application (client) ID", type: "text", required: true }],
    docs: [{ label: "Workload identity federation", url: "https://learn.microsoft.com/entra/workload-id/workload-identity-federation" }],
  },
  {
    id: "gcp", name: "Google Cloud project", vendor: "Google", family: "infrastructure", icon: si(siGooglecloud), status: "planned", wave: 2,
    blurb: "Workload identity federation into a project for GKE, Artifact Registry and Vertex AI discovery.",
    versionTarget: "Google Cloud APIs",
    auth: ["workload-identity", "service-account", "oidc"],
    prerequisites: ["A workload identity pool and provider", "A service account with viewer roles"],
    capabilities: cap("discover", "validate", "plan", "logs", "metrics"),
    limitations: ["Downloaded service-account keys are blocked in production environments.", DOCS_NOTE],
    permissions: { read: ["roles/viewer on the project", "roles/container.viewer, roles/artifactregistry.reader"], write: ["Narrow custom role per resource, after read-only verification"] },
    fields: [{ key: "projectId", label: "Project ID", type: "text", required: true }, { key: "providerAudience", label: "Workload identity provider", type: "text", placeholder: "projects/123/locations/global/workloadIdentityPools/..." }, f.region("us-central1")],
    docs: [{ label: "Workload identity federation", url: "https://cloud.google.com/iam/docs/workload-identity-federation" }],
  },
  {
    id: "gpu-nodes", name: "GPU nodes", vendor: "NVIDIA", family: "infrastructure", icon: si(siNvidia), status: "planned", wave: 2,
    blurb: "Discover GPU inventory and schedule serving workloads onto GPU nodes through an existing target.",
    versionTarget: "NVIDIA GPU Operator or device plugin already installed on the target",
    auth: ["k8s-token", "api-token"],
    prerequisites: ["A connected Kubernetes cluster or Linux agent", "NVIDIA drivers and container toolkit already installed by the customer"],
    capabilities: cap("discover", "validate", ["gpu", "partial", "Request and schedule only. No driver, firmware or host changes."]),
    limitations: ["Installing or upgrading drivers requires a compatible agent and a separate explicit authorization. It is not part of this integration."],
    permissions: { read: ["Read node labels and allocatable nvidia.com/gpu"], write: ["None. Scheduling happens through the parent target."] },
    fields: [{ key: "parent", label: "Parent target", type: "select", options: ["Pick a connected cluster or agent"] }],
    docs: [{ label: "NVIDIA GPU Operator", url: "https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/" }],
  },
  // ---- Serving
  {
    id: "kserve", name: "KServe", vendor: "KServe project", family: "serving", icon: cdn("kserve", "326CE5", Server), status: "planned", wave: 1,
    blurb: "InferenceService deployments with canary traffic and scale-to-zero on a Kubernetes target.",
    versionTarget: "KServe 0.13 or later. CRD version confirmed at connect time",
    auth: ["k8s-token", "oidc"],
    prerequisites: ["A connected Kubernetes cluster with KServe CRDs installed", "Knative Serving if scale-to-zero is wanted"],
    capabilities: cap("discover", "validate", "plan", "deploy", "scale", "autoscale", "canary", "traffic-split", "rollback", "logs", "metrics", ["scale-to-zero", "partial", "Needs Knative Serving mode"], ["gpu", "partial", "Request only"]),
    limitations: ["Runtime availability depends on the installed ServingRuntimes.", DOCS_NOTE],
    permissions: { read: ["get, list on inferenceservices, servingruntimes, clusterservingruntimes"], write: ["create, update, patch, delete on inferenceservices in the target namespace"] },
    fields: [{ key: "connection", label: "Kubernetes connection", type: "select", options: ["Pick a connected cluster"] }, f.ns("models")],
    docs: [{ label: "KServe documentation", url: "https://kserve.github.io/website/" }],
  },
  {
    id: "knative", name: "Knative Serving", vendor: "CNCF", family: "serving", icon: si(siKnative), status: "planned", wave: 3,
    blurb: "Revision-based serving with request-driven autoscaling.",
    versionTarget: "Knative Serving 1.12 or later",
    auth: ["k8s-token", "oidc"],
    prerequisites: ["A connected Kubernetes cluster with Knative Serving installed"],
    capabilities: cap("discover", "validate", "plan", "deploy", "autoscale", "traffic-split", "rollback", "scale-to-zero", "logs"),
    limitations: [DOCS_NOTE],
    permissions: { read: ["get, list on services.serving.knative.dev, revisions, routes"], write: ["create, update, patch on services.serving.knative.dev in the target namespace"] },
    fields: [{ key: "connection", label: "Kubernetes connection", type: "select", options: ["Pick a connected cluster"] }, f.ns("models")],
    docs: [{ label: "Knative Serving", url: "https://knative.dev/docs/serving/" }],
  },
  {
    id: "bentoml", name: "BentoML", vendor: "BentoML", family: "serving", icon: si(siBentoml), status: "planned", wave: 3,
    blurb: "Package and serve Bentos as OCI images on a connected target.",
    versionTarget: "BentoML 1.2 or later",
    auth: ["api-token", "oidc"],
    prerequisites: ["A Bento built by the customer, or a build agent with BentoML installed", "An OCI registry connection"],
    capabilities: cap("validate", "plan", "build", "deploy", "logs"),
    limitations: ["Deployment goes through the selected target. BentoCloud is not managed here.", DOCS_NOTE],
    permissions: { read: ["Read Bento metadata from the registry"], write: ["Push images to the connected registry"] },
    fields: [f.endpoint("https://bentoml.example.internal")],
    docs: [{ label: "BentoML documentation", url: "https://docs.bentoml.com/" }],
  },
  {
    id: "ray-serve", name: "Ray Serve", vendor: "Anyscale / Ray", family: "serving", icon: si(siRay), status: "planned", wave: 3,
    blurb: "Serve applications on an existing Ray cluster through its REST API.",
    versionTarget: "Ray 2.9 or later with the Serve REST API enabled",
    auth: ["api-token", "none"],
    prerequisites: ["Ray dashboard agent reachable from the control plane or an agent"],
    capabilities: cap("discover", "validate", "deploy", "autoscale", "logs", "metrics"),
    limitations: ["Unauthenticated Ray dashboards are common. This integration requires an explicit warning acknowledgement for any production use of unauthenticated access."],
    permissions: { read: ["GET /api/serve/applications/"], write: ["PUT /api/serve/applications/"] },
    fields: [f.endpoint("https://ray-head.example.internal:8265"), f.tls()],
    docs: [{ label: "Ray Serve", url: "https://docs.ray.io/en/latest/serve/index.html" }],
    privateConnectivity: true,
  },
  {
    id: "custom-http", name: "Custom HTTP endpoint", vendor: "Customer", family: "serving", icon: { lucide: Globe }, status: "custom",
    blurb: "Register any existing inference endpoint for health, routing and policy. No deploy.",
    versionTarget: "Any HTTP/1.1 or HTTP/2 endpoint with a health route",
    auth: ["api-token", "oidc", "mtls", "none"],
    prerequisites: ["A stable URL and a health route that returns 2xx when ready"],
    capabilities: cap("discover", "validate", "metrics", ["logs", "none", "Logs stay with the system that runs the endpoint"]),
    limitations: ["Observe and route only. Deploy, scale and rollback are not available."],
    permissions: { read: ["Call the health route"], write: ["None"] },
    fields: [f.endpoint("https://inference.example.internal/v1"), { key: "healthPath", label: "Health path", type: "text", default: "/healthz" }, f.tls(), f.ca()],
    docs: [],
  },
  {
    id: "custom-oci", name: "Custom OCI container", vendor: "Customer", family: "serving", icon: cdn("opencontainersinitiative", "262261", Package), status: "custom",
    blurb: "Bring your own serving image. Deploy to any connected target with probes and resources.",
    versionTarget: "OCI image spec v1. Image must expose an HTTP port and health route",
    auth: ["basic", "api-token", "workload-identity"],
    prerequisites: ["An image in a connected registry", "A target connection with deploy capability"],
    capabilities: cap("validate", "plan", "deploy", "scale", "autoscale", "canary", "rollback", "logs", "metrics"),
    limitations: ["Capabilities are those of the selected target."],
    permissions: { read: ["Pull image manifest by digest"], write: ["Delegated to the target"] },
    fields: [{ key: "image", label: "Image reference", type: "text", placeholder: "registry.example.com/team/model@sha256:...", help: "Digest references are strongly recommended." }, { key: "port", label: "Container port", type: "number", default: 8080 }],
    docs: [{ label: "OCI image spec", url: "https://github.com/opencontainers/image-spec" }],
  },
  // ---- Lifecycle
  {
    id: "mlflow", name: "MLflow", vendor: "MLflow / Databricks", family: "lifecycle", icon: si(siMlflow), status: "planned", wave: 1,
    blurb: "Read registered models, versions, runs and metrics. Link provenance to deployments.",
    versionTarget: "MLflow 2.x tracking and registry REST APIs",
    auth: ["basic", "api-token", "oidc"],
    prerequisites: ["MLflow tracking server URL", "A read-only user or token"],
    capabilities: cap("discover", "validate", "registry-read", ["registry-write", "partial", "Stage transitions only, when explicitly enabled"], "metrics"),
    limitations: ["Artifacts stay in the customer's artifact store. The control plane stores references and checksums.", DOCS_NOTE],
    permissions: { read: ["registered-models/search, model-versions/search, runs/get"], write: ["model-versions/transition-stage, only if enabled"] },
    fields: [f.endpoint("https://mlflow.example.internal"), f.tls(), f.ca()],
    docs: [{ label: "MLflow documentation", url: "https://mlflow.org/docs/latest/" }],
  },
  {
    id: "huggingface", name: "Hugging Face Hub", vendor: "Hugging Face", family: "lifecycle", icon: si(siHuggingface), status: "planned", wave: 2,
    blurb: "Resolve models by revision, record license and checksum, and pin to a commit.",
    versionTarget: "Hub HTTP API",
    auth: ["api-token", "none"],
    prerequisites: ["A fine-grained read token for private or gated models"],
    capabilities: cap("discover", "validate", "registry-read"),
    limitations: ["Gated models require accepted terms. License is surfaced and must be reviewed before approval."],
    permissions: { read: ["Read access to selected repositories"], write: ["None"] },
    fields: [{ key: "org", label: "Organization", type: "text" }],
    docs: [{ label: "Hugging Face Hub", url: "https://huggingface.co/docs/hub" }],
  },
  {
    id: "pytorch", name: "PyTorch runtime", vendor: "PyTorch Foundation", family: "lifecycle", icon: si(siPytorch), status: "custom",
    blurb: "Validate TorchScript or state-dict artifacts against a declared runtime image.",
    versionTarget: "Declared by the artifact. Matched against the runtime image",
    auth: ["none"], prerequisites: ["A runtime image that bundles the matching PyTorch version"],
    capabilities: cap("validate"), limitations: ["A runtime format descriptor only. Serving is delegated to a serving integration."],
    permissions: { read: ["Read artifact metadata"], write: ["None"] }, fields: [], docs: [{ label: "PyTorch docs", url: "https://pytorch.org/docs/stable/" }],
  },
  {
    id: "tensorflow", name: "TensorFlow Serving", vendor: "Google", family: "lifecycle", icon: si(siTensorflow), status: "custom",
    blurb: "SavedModel validation and serving through the custom container path.",
    versionTarget: "SavedModel format. TF Serving image tag chosen by the customer",
    auth: ["none"], prerequisites: ["A SavedModel directory and a TF Serving image"],
    capabilities: cap("validate", "deploy"), limitations: ["Deploys via the Custom OCI container path on a connected target."],
    permissions: { read: ["Read artifact metadata"], write: ["Delegated to the target"] }, fields: [], docs: [{ label: "TensorFlow Serving", url: "https://www.tensorflow.org/tfx/guide/serving" }],
  },
  {
    id: "onnx", name: "ONNX Runtime", vendor: "ONNX / Microsoft", family: "lifecycle", icon: si(siOnnx), status: "custom",
    blurb: "Validate ONNX opsets and input signatures before deployment.",
    versionTarget: "ONNX opset declared in the model file",
    auth: ["none"], prerequisites: ["A runtime image with a compatible ONNX Runtime"],
    capabilities: cap("validate"), limitations: ["Format validation only. Serving is delegated."],
    permissions: { read: ["Read artifact metadata"], write: ["None"] }, fields: [], docs: [{ label: "ONNX", url: "https://onnx.ai/onnx/" }],
  },
  // ---- Cloud ML
  {
    id: "sagemaker", name: "Amazon SageMaker", vendor: "Amazon Web Services", family: "cloud-ml", icon: cdn("amazonsagemaker", "232F3E", Cloud), status: "planned", wave: 3,
    blurb: "Observe and later manage SageMaker endpoints in a connected AWS account.",
    versionTarget: "SageMaker API", auth: ["role-assumption", "workload-identity"],
    prerequisites: ["A connected AWS account"],
    capabilities: cap("discover", "validate", "metrics", ["deploy", "none", "Not before wave 3"]),
    limitations: ["Discovery first. Management comes later."],
    permissions: { read: ["sagemaker:List*, Describe*"], write: ["Scoped endpoint operations, later"] }, fields: [f.region("us-east-1")],
    docs: [{ label: "SageMaker documentation", url: "https://docs.aws.amazon.com/sagemaker/" }],
  },
  {
    id: "azureml", name: "Azure Machine Learning", vendor: "Microsoft", family: "cloud-ml", icon: cdn("microsoftazure", "0078D4", Cloud), status: "planned", wave: 3,
    blurb: "Observe and later manage managed online endpoints in a connected subscription.",
    versionTarget: "Azure ML v2 API", auth: ["workload-identity", "oidc"], prerequisites: ["A connected Azure subscription"],
    capabilities: cap("discover", "validate", "metrics", ["deploy", "none", "Not before wave 3"]),
    limitations: ["Discovery first. Management comes later."],
    permissions: { read: ["Reader on the workspace"], write: ["AzureML Data Scientist on the workspace, later"] }, fields: [{ key: "workspace", label: "Workspace", type: "text" }],
    docs: [{ label: "Azure Machine Learning", url: "https://learn.microsoft.com/azure/machine-learning/" }],
  },
  {
    id: "vertex", name: "Google Vertex AI", vendor: "Google", family: "cloud-ml", icon: cdn("googlecloud", "4285F4", Cloud), status: "planned", wave: 3,
    blurb: "Observe and later manage Vertex endpoints in a connected project.",
    versionTarget: "Vertex AI API", auth: ["workload-identity", "service-account"], prerequisites: ["A connected Google Cloud project"],
    capabilities: cap("discover", "validate", "metrics", ["deploy", "none", "Not before wave 3"]),
    limitations: ["Discovery first. Management comes later."],
    permissions: { read: ["roles/aiplatform.viewer"], write: ["roles/aiplatform.user, later"] }, fields: [f.region("us-central1")],
    docs: [{ label: "Vertex AI", url: "https://cloud.google.com/vertex-ai/docs" }],
  },
  // ---- Registries
  {
    id: "oci-registry", name: "OCI registry", vendor: "Harbor, ECR, ACR, GAR, GHCR, Docker Hub", family: "registry", icon: si(siHarbor), status: "planned", wave: 1,
    blurb: "Resolve image digests, verify signatures and store provenance for images used in deployments.",
    versionTarget: "OCI Distribution Spec v1", auth: ["basic", "api-token", "workload-identity"],
    prerequisites: ["Registry hostname", "A pull-only credential for read, a push credential only for build agents"],
    capabilities: cap("discover", "validate", "registry-read", ["registry-write", "partial", "Build agents only"]),
    limitations: ["Tags are resolved to digests at plan time. Deployments pin the digest."],
    permissions: { read: ["Pull and list tags"], write: ["Push to a single named repository, build agents only"] },
    fields: [f.endpoint("https://registry.example.com"), f.tls()],
    docs: [{ label: "OCI distribution spec", url: "https://github.com/opencontainers/distribution-spec" }],
  },
  // ---- Data services
  {
    id: "postgres", name: "PostgreSQL", vendor: "PostgreSQL", family: "relational", icon: si(siPostgresql), status: "planned", wave: 2,
    blurb: "Read-only connectivity for features, lookup tables and evaluation sets used by pipelines.",
    versionTarget: "PostgreSQL 13 to 17", auth: ["basic", "secret-manager", "workload-identity"],
    prerequisites: ["A read-only role limited to named schemas", "sslmode=verify-full recommended"],
    capabilities: cap("discover", "validate", "read-data", ["write-data", "partial", "Opt-in per pipeline operator"]),
    limitations: ["Queries run with statement timeouts and row limits. DDL is never issued."],
    permissions: { read: ["CONNECT, USAGE on named schemas, SELECT on named tables"], write: ["INSERT on named tables only, when an operator needs it"] },
    fields: [{ key: "host", label: "Host", type: "text", required: true }, { key: "port", label: "Port", type: "number", default: 5432 }, { key: "database", label: "Database", type: "text", required: true }, { key: "sslmode", label: "SSL mode", type: "select", options: ["verify-full", "verify-ca", "require"], default: "verify-full" }],
    docs: [{ label: "PostgreSQL documentation", url: "https://www.postgresql.org/docs/" }],
    privateConnectivity: true,
  },
  {
    id: "s3", name: "S3-compatible object store", vendor: "AWS S3, MinIO, others", family: "object-store", icon: si(siMinio), status: "planned", wave: 2,
    blurb: "Artifact and dataset buckets. Stores references and checksums, never copies of data.",
    versionTarget: "S3 API (SigV4)", auth: ["api-token", "role-assumption", "secret-manager"],
    prerequisites: ["A bucket and prefix", "A scoped credential"],
    capabilities: cap("discover", "validate", "read-data", ["write-data", "partial", "Artifact prefix only"]),
    limitations: ["Path-style addressing is configurable for MinIO."],
    permissions: { read: ["s3:GetObject, s3:ListBucket on the prefix"], write: ["s3:PutObject on the artifact prefix"] },
    fields: [f.endpoint("https://s3.us-east-1.amazonaws.com"), { key: "bucket", label: "Bucket", type: "text", required: true }, { key: "prefix", label: "Prefix", type: "text", placeholder: "models/" }, f.tls()],
    docs: [{ label: "Amazon S3 API", url: "https://docs.aws.amazon.com/AmazonS3/latest/API/Welcome.html" }, { label: "MinIO", url: "https://min.io/docs/minio/linux/index.html" }],
  },
  {
    id: "kafka", name: "Apache Kafka", vendor: "Apache", family: "streaming", icon: si(siApachekafka), status: "planned", wave: 3,
    blurb: "Streaming sources and sinks for ingestion and inference event pipelines.",
    versionTarget: "Kafka 3.x", auth: ["basic", "mtls", "oidc"],
    prerequisites: ["Bootstrap servers", "SASL or mTLS credentials", "Topic ACLs"],
    capabilities: cap("discover", "validate", "read-data", "write-data"),
    limitations: ["Consumer group IDs are namespaced per pipeline."],
    permissions: { read: ["Describe, Read on named topics and a named consumer group"], write: ["Write on named topics"] },
    fields: [{ key: "bootstrap", label: "Bootstrap servers", type: "text", placeholder: "broker-1:9093,broker-2:9093", required: true }, { key: "security", label: "Security protocol", type: "select", options: ["SASL_SSL", "SSL"], default: "SASL_SSL" }],
    docs: [{ label: "Kafka documentation", url: "https://kafka.apache.org/documentation/" }],
    privateConnectivity: true,
  },
  {
    id: "pgvector", name: "pgvector", vendor: "PostgreSQL extension", family: "vector", icon: cdn("postgresql", "4169E1", Database), status: "planned", wave: 2,
    blurb: "Vector index on PostgreSQL for retrieval workflows.",
    versionTarget: "pgvector 0.7 or later", auth: ["basic", "secret-manager"],
    prerequisites: ["The vector extension installed by the customer"],
    capabilities: cap("discover", "validate", "read-data", "write-data"),
    limitations: ["Index type and dimension are validated against the embedding model."],
    permissions: { read: ["SELECT on the embeddings table"], write: ["INSERT, UPDATE on the embeddings table"] },
    fields: [{ key: "host", label: "Host", type: "text", required: true }, { key: "database", label: "Database", type: "text", required: true }, { key: "table", label: "Embeddings table", type: "text" }],
    docs: [{ label: "pgvector", url: "https://github.com/pgvector/pgvector" }],
    privateConnectivity: true,
  },
  {
    id: "milvus", name: "Milvus", vendor: "LF AI & Data", family: "vector", icon: si(siMilvus), status: "planned", wave: 3,
    blurb: "Collections for large-scale retrieval.", versionTarget: "Milvus 2.4 or later", auth: ["api-token", "basic"],
    prerequisites: ["Milvus endpoint and a database user"], capabilities: cap("discover", "validate", "read-data", "write-data"),
    limitations: [DOCS_NOTE], permissions: { read: ["Describe and query on named collections"], write: ["Insert and upsert on named collections"] },
    fields: [f.endpoint("https://milvus.example.internal:19530"), f.tls()], docs: [{ label: "Milvus documentation", url: "https://milvus.io/docs" }], privateConnectivity: true,
  },
  {
    id: "qdrant", name: "Qdrant", vendor: "Qdrant", family: "vector", icon: cdn("qdrant", "DC244C", Database), status: "planned", wave: 3,
    blurb: "Collections and payload filters for retrieval.", versionTarget: "Qdrant 1.9 or later", auth: ["api-token"],
    prerequisites: ["Qdrant URL and API key"], capabilities: cap("discover", "validate", "read-data", "write-data"),
    limitations: [DOCS_NOTE], permissions: { read: ["Read-only API key"], write: ["Read-write API key scoped to a collection"] },
    fields: [f.endpoint("https://qdrant.example.internal:6333"), f.tls()], docs: [{ label: "Qdrant documentation", url: "https://qdrant.tech/documentation/" }], privateConnectivity: true,
  },
  {
    id: "weaviate", name: "Weaviate", vendor: "Weaviate", family: "vector", icon: cdn("weaviate", "00B060", Database), status: "planned", wave: 3,
    blurb: "Classes and hybrid search for retrieval.", versionTarget: "Weaviate 1.24 or later", auth: ["api-token", "oidc"],
    prerequisites: ["Weaviate URL and credentials"], capabilities: cap("discover", "validate", "read-data", "write-data"),
    limitations: [DOCS_NOTE], permissions: { read: ["Read role on named classes"], write: ["Write role on named classes"] },
    fields: [f.endpoint("https://weaviate.example.internal"), f.tls()], docs: [{ label: "Weaviate developers", url: "https://weaviate.io/developers/weaviate" }], privateConnectivity: true,
  },
  {
    id: "feast", name: "Feast feature store", vendor: "Feast", family: "feature-store", icon: cdn("feast", "2F6BFF", Boxes), status: "planned", wave: 3,
    blurb: "Feature views as pipeline inputs with point-in-time correctness handled by the store.", versionTarget: "Feast 0.3x",
    auth: ["api-token", "oidc"], prerequisites: ["A Feast feature server"], capabilities: cap("discover", "validate", "read-data"),
    limitations: ["Read-only."], permissions: { read: ["Get online features"], write: ["None"] },
    fields: [f.endpoint("https://feast.example.internal:6566"), f.tls()], docs: [{ label: "Feast", url: "https://docs.feast.dev/" }],
  },
  {
    id: "spark", name: "Apache Spark", vendor: "Apache", family: "feature-store", icon: si(siApachespark), status: "planned", wave: 3,
    blurb: "Submit preprocessing jobs to an existing Spark environment.", versionTarget: "Spark 3.4 or later",
    auth: ["k8s-token", "api-token"], prerequisites: ["Spark on Kubernetes or a Livy gateway"], capabilities: cap("validate", "plan", "deploy", "logs"),
    limitations: ["Job submission only."], permissions: { read: ["Read job status"], write: ["Submit and cancel jobs"] },
    fields: [f.endpoint("https://livy.example.internal:8998")], docs: [{ label: "Apache Spark", url: "https://spark.apache.org/docs/latest/" }],
  },
  // ---- Agents and observability
  {
    id: "langchain", name: "Agent framework apps", vendor: "LangChain, LlamaIndex and others", family: "agent", icon: si(siLangchain), status: "custom",
    blurb: "Enterprise apps call an inference endpoint through the tok∑ner gateway using a server-side SDK or API.",
    versionTarget: "Any framework that can call an HTTP endpoint", auth: ["api-token"],
    prerequisites: ["A tok∑ner application key stored server-side"],
    capabilities: cap("validate"), limitations: ["Keys must never ship to browsers or mobile apps."],
    permissions: { read: ["None"], write: ["None"] }, fields: [], docs: [],
  },
  {
    id: "prometheus", name: "Prometheus", vendor: "CNCF", family: "observability", icon: si(siPrometheus), status: "planned", wave: 2,
    blurb: "Pull serving metrics from an existing Prometheus.", versionTarget: "Prometheus 2.4x or later",
    auth: ["basic", "api-token", "none"], prerequisites: ["Query API reachable"], capabilities: cap("discover", "metrics"),
    limitations: ["Read-only PromQL queries with time and cardinality limits."], permissions: { read: ["GET /api/v1/query, query_range"], write: ["None"] },
    fields: [f.endpoint("https://prometheus.example.internal"), f.tls()], docs: [{ label: "Prometheus querying API", url: "https://prometheus.io/docs/prometheus/latest/querying/api/" }],
  },
  {
    id: "grafana", name: "Grafana", vendor: "Grafana Labs", family: "observability", icon: si(siGrafana), status: "planned", wave: 3,
    blurb: "Deep links from endpoints to existing dashboards.", versionTarget: "Grafana 10 or later", auth: ["api-token", "none"],
    prerequisites: ["Dashboard URLs"], capabilities: cap("discover"), limitations: ["Links only."], permissions: { read: ["Viewer"], write: ["None"] },
    fields: [f.endpoint("https://grafana.example.internal")], docs: [{ label: "Grafana", url: "https://grafana.com/docs/" }],
  },
  {
    id: "otel", name: "OpenTelemetry collector", vendor: "CNCF", family: "observability", icon: si(siOpentelemetry), status: "planned", wave: 2,
    blurb: "Export traces and metrics from the control plane and serving gateway.", versionTarget: "OTLP 1.x", auth: ["api-token", "mtls", "none"],
    prerequisites: ["OTLP endpoint"], capabilities: cap("metrics"), limitations: ["Payloads are redacted. Secrets and prompt content are never exported."],
    permissions: { read: ["None"], write: ["Send OTLP"] }, fields: [f.endpoint("https://otel.example.internal:4318"), f.tls()],
    docs: [{ label: "OpenTelemetry", url: "https://opentelemetry.io/docs/" }],
  },
  {
    id: "docker-local", name: "Local Docker host", vendor: "Docker", family: "infrastructure", icon: si(siDocker), status: "planned", wave: 1,
    blurb: "A developer machine or small server running Docker, reached through an agent.", versionTarget: "Docker Engine 24 or later",
    auth: ["api-token"], prerequisites: ["A registered build agent in docker mode"], capabilities: cap("discover", "validate", "plan", "deploy", "logs", "build"),
    limitations: ["Intended for development environments. Production is blocked for this target by default."],
    permissions: { read: ["List containers and images"], write: ["Run and remove containers from allowlisted images"] },
    fields: [{ key: "agentId", label: "Registered agent", type: "select", options: ["Pick after enrolling an agent"] }], docs: [{ label: "Docker Engine", url: "https://docs.docker.com/engine/" }], privateConnectivity: true,
  },
  {
    id: "redis", name: "Redis", vendor: "Redis", family: "relational", icon: si(siRedis), status: "planned", wave: 3,
    blurb: "Cache and feature lookups for serving, and the hot tier of shared agent context.", versionTarget: "Redis 7 or later", auth: ["basic", "secret-manager"],
    prerequisites: ["ACL user with read-only commands, or read and write on a key prefix for agent context"], capabilities: cap("discover", "validate", "read-data", "write-data"), limitations: ["Feature lookups are read-only. Agent context needs write access on its own key prefix."],
    permissions: { read: ["+@read on named key patterns"], write: ["+@write on the agent context prefix only"] }, fields: [{ key: "host", label: "Host", type: "text" }], docs: [{ label: "Redis", url: "https://redis.io/docs/" }], privateConnectivity: true,
  },
  // ---- Email and calendar, used by trigger, calendar and mail operators
  {
    id: "gmail", name: "Gmail", vendor: "Google", family: "messaging", icon: si(siGmail), status: "planned",
    blurb: "Read a mailbox and save drafts or send mail from a Google Workspace account.", versionTarget: "Gmail API v1",
    auth: ["oidc", "service-account"], prerequisites: ["A Google Workspace or Google Cloud project with the Gmail API enabled", "An OAuth client, or a service account with domain-wide delegation approved by an administrator"],
    capabilities: cap("discover", "validate", "read-mail", "send-mail"),
    limitations: ["Scopes are limited to what the operator needs. Read-only unless a sending operator is attached.", "Daily sending quotas are set by Google and shown in the test result."],
    permissions: { read: ["gmail.readonly on the chosen mailbox or label"], write: ["gmail.compose for drafts, gmail.send only when an operator sends immediately"] },
    fields: [{ key: "account", label: "Mailbox address", type: "text", placeholder: "assistant@example.com", required: true }, { key: "clientId", label: "OAuth client id", type: "text" }],
    docs: [{ label: "Gmail API", url: "https://developers.google.com/gmail/api/guides" }],
  },
  {
    id: "outlook-mail", name: "Microsoft 365 mail", vendor: "Microsoft", family: "messaging", icon: cdn("microsoftoutlook", "0078D4", Mail), status: "planned",
    blurb: "Read a mailbox and save drafts or send mail through Microsoft Graph.", versionTarget: "Microsoft Graph v1.0",
    auth: ["oidc", "workload-identity"], prerequisites: ["An app registration in Microsoft Entra ID", "Admin consent for Mail.Read and Mail.Send, scoped to specific mailboxes with an application access policy"],
    capabilities: cap("discover", "validate", "read-mail", "send-mail"),
    limitations: ["Use an application access policy so the app can only reach the mailboxes you list."],
    permissions: { read: ["Mail.Read on allowed mailboxes"], write: ["Mail.ReadWrite for drafts, Mail.Send only when an operator sends immediately"] },
    fields: [{ key: "tenantId", label: "Directory (tenant) id", type: "text", required: true }, { key: "clientId", label: "Application (client) id", type: "text", required: true }, { key: "mailbox", label: "Mailbox", type: "text", placeholder: "assistant@example.com" }],
    docs: [{ label: "Microsoft Graph mail", url: "https://learn.microsoft.com/graph/api/resources/mail-api-overview" }],
  },
  {
    id: "imap", name: "IMAP mailbox", vendor: "Open standard", family: "messaging", icon: { lucide: Inbox }, status: "planned",
    blurb: "Read from any mailbox that speaks IMAP over TLS.", versionTarget: "IMAP4rev1 over TLS", auth: ["basic", "oidc"],
    prerequisites: ["IMAP host and port reachable from the control plane or an agent", "An app password or OAuth token, never the user's main password"],
    capabilities: cap("discover", "validate", "read-mail"), limitations: ["Read-only. Sending needs one of the mail providers below."], permissions: { read: ["Read the chosen folders"], write: ["None, unless marking as read is enabled"] },
    fields: [{ key: "host", label: "Host", type: "text", placeholder: "imap.example.com", required: true }, { key: "port", label: "Port", type: "number", default: 993 }, f.tls()],
    docs: [{ label: "RFC 9051 IMAP", url: "https://www.rfc-editor.org/rfc/rfc9051" }], privateConnectivity: true,
  },
  {
    id: "sendgrid", name: "SendGrid", vendor: "Twilio", family: "messaging", icon: si(siSendgrid), status: "planned",
    blurb: "Send transactional email from a verified sender.", versionTarget: "SendGrid v3 Mail Send API", auth: ["api-token"],
    prerequisites: ["A verified sender or domain with SPF and DKIM", "An API key restricted to Mail Send"], capabilities: cap("validate", "send-mail"),
    limitations: ["Sending only. Replies need a separate inbound route."], permissions: { read: ["None"], write: ["Mail Send"] },
    fields: [{ key: "fromDomain", label: "Verified sender domain", type: "text", required: true }], docs: [{ label: "SendGrid Mail Send", url: "https://www.twilio.com/docs/sendgrid/api-reference/mail-send" }],
  },
  {
    id: "amazon-ses", name: "Amazon SES", vendor: "Amazon Web Services", family: "messaging", icon: cdn("amazonaws", "FF9900", Mail), status: "planned",
    blurb: "Send email through Amazon Simple Email Service.", versionTarget: "SES API v2", auth: ["role-assumption", "workload-identity"],
    prerequisites: ["A verified identity out of the SES sandbox", "An IAM role limited to ses:SendEmail on that identity"], capabilities: cap("validate", "send-mail"),
    limitations: ["Production access must be granted by AWS before sending to unverified recipients."], permissions: { read: ["ses:GetAccount"], write: ["ses:SendEmail on the verified identity"] },
    fields: [f.region("us-east-1"), { key: "identity", label: "Verified identity", type: "text", required: true }], docs: [{ label: "Amazon SES", url: "https://docs.aws.amazon.com/ses/latest/dg/Welcome.html" }],
  },
  {
    id: "mailgun", name: "Mailgun", vendor: "Sinch", family: "messaging", icon: si(siMailgun), status: "planned",
    blurb: "Send email from a verified domain, in the US or EU region.", versionTarget: "Mailgun API v3", auth: ["api-token"],
    prerequisites: ["A verified sending domain", "A domain sending key"], capabilities: cap("validate", "send-mail"), limitations: ["Sending only."],
    permissions: { read: ["None"], write: ["Send on the chosen domain"] }, fields: [{ key: "domain", label: "Sending domain", type: "text", required: true }, { key: "region", label: "Region", type: "select", options: ["US", "EU"], default: "US" }],
    docs: [{ label: "Mailgun sending", url: "https://documentation.mailgun.com/docs/mailgun/api-reference/send/mailgun/messages" }],
  },
  {
    id: "postmark", name: "Postmark", vendor: "ActiveCampaign", family: "messaging", icon: cdn("postmark", "FFDE00", Mail), status: "planned",
    blurb: "Send transactional email through a Postmark server.", versionTarget: "Postmark API", auth: ["api-token"],
    prerequisites: ["A server and a confirmed sender signature or domain"], capabilities: cap("validate", "send-mail"), limitations: ["Sending only."],
    permissions: { read: ["None"], write: ["Send through the chosen server token"] }, fields: [{ key: "stream", label: "Message stream", type: "text", default: "outbound" }],
    docs: [{ label: "Postmark developer docs", url: "https://postmarkapp.com/developer" }],
  },
  {
    id: "smtp", name: "SMTP relay", vendor: "Open standard", family: "messaging", icon: { lucide: Mail }, status: "planned",
    blurb: "Send through any SMTP server with TLS and authentication.", versionTarget: "SMTP with STARTTLS or implicit TLS", auth: ["basic", "oidc"],
    prerequisites: ["Host and port reachable from the control plane or an agent", "A dedicated sending account"], capabilities: cap("validate", "send-mail"),
    limitations: ["Plain-text SMTP is refused. TLS is required."], permissions: { read: ["None"], write: ["Submit messages as the sending account"] },
    fields: [{ key: "host", label: "Host", type: "text", placeholder: "smtp.example.com", required: true }, { key: "port", label: "Port", type: "number", default: 587 }, f.tls()],
    docs: [{ label: "RFC 5321 SMTP", url: "https://www.rfc-editor.org/rfc/rfc5321" }], privateConnectivity: true,
  },
  {
    id: "google-calendar", name: "Google Calendar", vendor: "Google", family: "messaging", icon: si(siGooglecalendar), status: "planned",
    blurb: "Read availability and events, and create events on chosen calendars.", versionTarget: "Google Calendar API v3", auth: ["oidc", "service-account"],
    prerequisites: ["Calendar API enabled in a Google Cloud project", "An OAuth client, or a service account with the calendars shared to it"], capabilities: cap("discover", "validate", "read-calendar", "write-calendar"),
    limitations: ["Writes are limited to the calendars you select."], permissions: { read: ["calendar.readonly on chosen calendars"], write: ["calendar.events on chosen calendars"] },
    fields: [{ key: "calendarId", label: "Default calendar", type: "text", default: "primary" }, { key: "clientId", label: "OAuth client id", type: "text" }],
    docs: [{ label: "Google Calendar API", url: "https://developers.google.com/calendar/api/guides/overview" }],
  },
  {
    id: "outlook-calendar", name: "Microsoft 365 calendar", vendor: "Microsoft", family: "messaging", icon: cdn("microsoftoutlook", "0078D4", CalendarDays), status: "planned",
    blurb: "Read availability and events, and create events through Microsoft Graph.", versionTarget: "Microsoft Graph v1.0", auth: ["oidc", "workload-identity"],
    prerequisites: ["An app registration with admin consent for Calendars.Read and Calendars.ReadWrite on allowed mailboxes"], capabilities: cap("discover", "validate", "read-calendar", "write-calendar"),
    limitations: ["Use an application access policy to limit which calendars the app reaches."], permissions: { read: ["Calendars.Read"], write: ["Calendars.ReadWrite on allowed mailboxes"] },
    fields: [{ key: "tenantId", label: "Directory (tenant) id", type: "text", required: true }, { key: "clientId", label: "Application (client) id", type: "text", required: true }],
    docs: [{ label: "Microsoft Graph calendar", url: "https://learn.microsoft.com/graph/api/resources/calendar-overview" }],
  },
  {
    id: "caldav", name: "CalDAV or iCalendar feed", vendor: "Open standard", family: "messaging", icon: { lucide: CalendarDays }, status: "planned",
    blurb: "Read events from a CalDAV server or a read-only .ics feed, including Apple iCloud and Nextcloud.", versionTarget: "CalDAV (RFC 4791) and iCalendar (RFC 5545)", auth: ["basic", "api-token", "none"],
    prerequisites: ["A CalDAV collection URL or a secret .ics feed URL", "An app-specific password where the provider requires one"], capabilities: cap("discover", "validate", "read-calendar", ["write-calendar", "partial", "CalDAV servers only. .ics feeds are read-only."]),
    limitations: ["Feed URLs are secrets. They are stored as references and never shown."], permissions: { read: ["Read the chosen collection or feed"], write: ["Create events on CalDAV servers only"] },
    fields: [f.endpoint("https://caldav.example.com/dav/calendars/user/work/"), f.tls()], docs: [{ label: "RFC 4791 CalDAV", url: "https://www.rfc-editor.org/rfc/rfc4791" }], privateConnectivity: true,
  },

  // ---- Payments, used by the payment operators in the agent builder
  {
    id: "mtn-momo", name: "MTN Mobile Money (MoMo)", vendor: "MTN Group", family: "payments", icon: cdn("mtn", "FFCC00", Smartphone), status: "planned",
    blurb: "Collect from MTN Mobile Money wallets with Request to Pay. The customer approves on their own phone.", versionTarget: "MTN MoMo Open API, Collections product (Request to Pay)",
    auth: ["api-token"],
    prerequisites: [
      "A MoMo developer portal account with a subscription to the Collections product, which provides the subscription key",
      "An API user id and API key for Collections. In the sandbox they are created through the API. In production they are issued after MTN approves your onboarding",
      "The X-Target-Environment value for your market, for example mtnuganda or mtnghana. Use sandbox for testing",
      "A public HTTPS callback host registered for the API user, so MTN can notify the platform",
      "An MTN business relationship in your country. Production access is arranged with MTN and its local partner",
    ],
    capabilities: cap("validate", "collect-payment", ["payment-link", "partial", "MTN prompts a phone number and has no hosted page, so tok\u2211ner serves the link page where the customer confirms the number."], ["refund", "partial", "Where MTN enables refunds in your market."]),
    limitations: [
      "Request to Pay sends a prompt to the payer's phone. The shareable link opens a tok\u2211ner page that asks for the number and then triggers the prompt.",
      "Access tokens last one hour and are refreshed automatically. The sandbox accepts only EUR, while production uses the local currency.",
      "A callback is never trusted by itself. The platform reads the request status back from MTN before it marks a payment paid.",
      DOCS_NOTE,
    ],
    permissions: { read: ["GET requesttopay status for requests created by this connection"], write: ["POST requesttopay"] },
    compliance: [
      "Onboard as a business with MTN in each country. Requirements, documents and timelines are set by MTN and the national regulator.",
      "Only charge numbers you have the customer's consent to charge. The customer approves with their mobile money PIN on their phone. Never ask for, receive or store the PIN.",
      "Phone numbers are personal data. State the purpose, keep them only as long as needed, and follow local data protection law, for example the Data Protection and Privacy Act in Uganda or the Data Protection Act in Ghana.",
      "Respect the per-transaction and daily limits and the anti-money-laundering rules of the central bank in your market.",
      "Keep a record of each request: reference id, your order id, amount, currency, outcome and the refund policy you showed.",
      "Never use sandbox credentials or the sandbox environment in production.",
    ],
    fields: [
      { key: "environment", label: "Target environment", type: "select", options: ["sandbox", "mtnuganda", "mtnghana", "mtnivorycoast", "mtnzambia", "mtncameroon", "mtnbenin", "mtncongo", "mtnswaziland", "mtnguineaconakry", "mtnsouthafrica", "mtnliberia"], default: "sandbox", help: "Confirm the exact value for your market with MTN." },
      { key: "apiUserId", label: "API user id", type: "text", required: true, help: "An identifier, not a secret. The API key and subscription key are stored as secret references." },
      { key: "callbackHost", label: "Callback host", type: "text", placeholder: "pay-callbacks.example.com", required: true },
    ],
    docs: [{ label: "MTN MoMo developer portal", url: "https://momodeveloper.mtn.com/" }],
  },
  {
    id: "orange-money", name: "Orange Money Web Payment", vendor: "Orange", family: "payments", icon: si(siOrange), status: "planned",
    blurb: "Collect from Orange Money wallets through an Orange-hosted payment page.", versionTarget: "Orange Money Web Payment API (M Payment in Africa)",
    auth: ["oidc", "api-token"],
    prerequisites: [
      "An Orange Money merchant account in the country where you trade, registered with Orange under its know-your-agent (KYA) requirements",
      "An account on the Orange developer portal with the Web Payment API",
      "A client id and client secret for OAuth, and the merchant key issued at onboarding",
      "Public HTTPS URLs for the server notification (notif_url) and for the customer return and cancel pages",
      "Sandbox first, using the test currency OUV, then production in the local currency such as XOF",
    ],
    capabilities: cap("validate", "collect-payment", "payment-link", ["refund", "none", "Refunds are handled through Orange Money back office processes."]),
    limitations: [
      "Available where Orange has launched the API: Mali, Cameroon, Cote d'Ivoire, Senegal, Madagascar, Botswana, Guinea, Guinea-Bissau, Sierra Leone, DR Congo and the Central African Republic. Orange adds countries over time.",
      "In countries using XOF or XAF, amounts are whole numbers with no decimals.",
      "The browser redirect after payment can be lost if the customer closes the page. The platform waits for the server notification and then checks the status itself.",
      DOCS_NOTE,
    ],
    permissions: { read: ["Read the status of payments created by this connection"], write: ["Create web payments"] },
    compliance: [
      "Only registered Orange Money merchants can use the service. Register in an Orange store in your country with the documents local law requires, for example commercial register and tax numbers.",
      "Orange Money is regulated by the central bank of each country, for example BCEAO for XOF countries and BEAC for XAF countries, and applies strict anti-money-laundering and fraud rules. Daily and per-transaction limits apply.",
      "Customers confirm with a one-time password requested through USSD. Never collect or store their secret code.",
      "Production access requires merchant validation. Allow time for the review, which varies by country.",
      "Keep sandbox and production keys apart. Never call the production URL with sandbox keys.",
      "Make each order id unique so one order can never produce two valid payments, and log every status change.",
    ],
    fields: [
      { key: "country", label: "Country", type: "select", options: ["Senegal", "Cote d'Ivoire", "Mali", "Cameroon", "Madagascar", "Botswana", "Guinea", "Guinea-Bissau", "Sierra Leone", "DR Congo", "Central African Republic"], default: "Senegal" },
      { key: "environment", label: "Environment", type: "select", options: ["sandbox", "production"], default: "sandbox" },
      { key: "clientId", label: "Client id", type: "text", required: true, help: "The client secret and merchant key are stored as secret references." },
    ],
    docs: [{ label: "Orange Money Web Payment", url: "https://developer.orange.com/apis/om-webpay" }],
  },
  {
    id: "paypal", name: "PayPal", vendor: "PayPal", family: "payments", icon: si(siPaypal), status: "planned",
    blurb: "Create PayPal orders and send the customer an approval link. Capture happens after they approve.", versionTarget: "PayPal Orders API v2 and Webhooks",
    auth: ["oidc"],
    prerequisites: [
      "A PayPal Business account that is verified for your country",
      "A REST app with a client id and secret for sandbox, and a separate one for live",
      "A webhook on that app subscribed to CHECKOUT.ORDER.APPROVED, PAYMENT.CAPTURE.COMPLETED, PAYMENT.CAPTURE.DENIED and PAYMENT.CAPTURE.REFUNDED, with the webhook id recorded",
      "Return and cancel pages on your own domain",
    ],
    capabilities: cap("validate", "collect-payment", "payment-link", "refund"),
    limitations: [
      "The customer approves on PayPal, then the platform captures the order. An order that is not approved in time expires and must be created again.",
      "Currencies and countries follow PayPal's own availability for your account.",
      "Everything the customer enters stays on PayPal's pages.",
      DOCS_NOTE,
    ],
    permissions: { read: ["Read orders and captures created by this app"], write: ["Create orders, capture, and refund captures"] },
    compliance: [
      "PayPal's Acceptable Use Policy restricts some goods and services. Check that yours are allowed before you launch.",
      "Verify every webhook with PayPal's verify-webhook-signature call or its certificate, using the webhook id. Mock events from the simulator cannot be verified, so test with real sandbox events.",
      "Send an idempotency key (PayPal-Request-Id) on every create call so a retry cannot create a second order.",
      "Show your refund and dispute policy to the customer and answer disputes within PayPal's deadlines.",
      "Because PayPal hosts the page, card numbers never reach tok\u2211ner or your systems.",
    ],
    fields: [
      { key: "environment", label: "Environment", type: "select", options: ["sandbox", "live"], default: "sandbox" },
      { key: "clientId", label: "Client id", type: "text", required: true, help: "The client secret is stored as a secret reference." },
      { key: "webhookId", label: "Webhook id", type: "text", required: true },
      { key: "brandName", label: "Name shown to the customer", type: "text" },
    ],
    docs: [{ label: "PayPal Orders API v2", url: "https://developer.paypal.com/docs/api/orders/v2/" }, { label: "PayPal webhooks", url: "https://developer.paypal.com/api/rest/webhooks/" }],
  },
  {
    id: "stripe", name: "Stripe (Visa, Mastercard and more)", vendor: "Stripe", family: "payments", icon: si(siStripe), status: "planned",
    blurb: "Accept Visa and Mastercard on a Stripe-hosted page, shared as a payment link.", versionTarget: "Stripe API with Payment Links and Checkout Sessions",
    auth: ["api-token"],
    prerequisites: [
      "A Stripe account activated for live payments in your country, with business details and a bank account verified",
      "A restricted API key limited to Payment Links, Checkout Sessions and refunds",
      "A webhook endpoint and its signing secret, subscribed to checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, checkout.session.expired and charge.refunded",
    ],
    capabilities: cap("validate", "collect-payment", "payment-link", "refund"),
    limitations: ["Payment method availability depends on your account and the customer's country.", "Hosted page customisation is limited to logo, colours and a few options.", DOCS_NOTE],
    permissions: { read: ["Read checkout sessions and charges created by this key"], write: ["Create payment links and sessions, and create refunds"] },
    compliance: [
      "Card numbers are entered only on the Stripe-hosted page, so tok\u2211ner and your systems stay out of card data scope. You still complete the self-assessment your acquirer requires each year, typically SAQ A.",
      "A redirect, or a link sent to the customer, fully outsources the payment page. If you embed a provider form in your own page you must also protect that page from script attacks (PCI DSS 6.4.3 and 11.6.1) or hold written confirmation from the provider.",
      "Strong customer authentication under PSD2 applies in the EEA and the UK. The hosted page applies 3-D Secure when the issuer requires it, and a successful challenge usually shifts fraud liability to the issuer.",
      "Verify the Stripe-Signature header with the endpoint secret and reject old timestamps.",
      "Show clear terms, a refund policy and a recognisable statement descriptor. Follow card network rules and your acquirer's prohibited business list.",
    ],
    fields: [
      { key: "mode", label: "Mode", type: "select", options: ["test", "live"], default: "test" },
      { key: "webhookSecretRef", label: "Webhook signing secret", type: "text", placeholder: "secretref://vault/nexi/prod/webhook-secret", required: true, help: "A reference to the endpoint signing secret (whsec_...). The platform verifies every notification with it and never stores the value." },
      { key: "accountCountry", label: "Account country", type: "text", placeholder: "US", help: "Used to check currencies and payment methods." },
    ],
    docs: [{ label: "Stripe Payment Links", url: "https://docs.stripe.com/payment-links" }],
  },
  {
    id: "adyen", name: "Adyen Pay by Link", vendor: "Adyen", family: "payments", icon: si(siAdyen), status: "planned",
    blurb: "Accept Visa, Mastercard and local methods on an Adyen-hosted page.", versionTarget: "Adyen Checkout API, Payment links",
    auth: ["api-token"],
    prerequisites: ["An Adyen merchant account approved for live traffic", "An API credential with the Checkout webservice role, stored as a secret reference", "A standard webhook with an HMAC key, and the merchant account name"],
    capabilities: cap("validate", "collect-payment", "payment-link", "refund"),
    limitations: ["Methods and currencies follow your Adyen account configuration.", DOCS_NOTE],
    permissions: { read: ["Read payment link status"], write: ["Create payment links and refunds"] },
    compliance: [
      "Card data is entered on the Adyen-hosted page, which keeps tok\u2211ner out of card data scope. Confirm with your acquirer which self-assessment applies, typically SAQ A.",
      "3-D Secure 2 and strong customer authentication are applied by the hosted page where required. Request authentication to gain liability shift on eligible transactions.",
      "Verify each notification with the HMAC key before acting on it.",
      "Follow card scheme rules, your refund policy and chargeback deadlines.",
    ],
    fields: [{ key: "merchantAccount", label: "Merchant account", type: "text", required: true }, { key: "environment", label: "Environment", type: "select", options: ["test", "live"], default: "test" }, { key: "webhookSecretRef", label: "Notification HMAC key", type: "text", placeholder: "secretref://vault/nexi/prod/webhook-secret", required: true, help: "A reference to the HMAC key of your standard webhook. Every notification is verified with it before it is acted on." }],
    docs: [{ label: "Adyen Pay by Link", url: "https://docs.adyen.com/unified-commerce/pay-by-link/" }],
  },
  {
    id: "flutterwave", name: "Flutterwave", vendor: "Flutterwave", family: "payments", icon: cdn("flutterwave", "F5A623", CreditCard), status: "planned",
    blurb: "Cards, mobile money and bank payments across Africa on a Flutterwave-hosted page.", versionTarget: "Flutterwave Standard payments and webhooks",
    auth: ["api-token"],
    prerequisites: ["A Flutterwave business account that has passed verification for live payments", "A secret key for the live environment, stored as a secret reference", "A webhook URL with the secret hash you set in the dashboard"],
    capabilities: cap("validate", "collect-payment", "payment-link", "refund"),
    limitations: ["Methods, currencies and settlement follow the countries enabled on your account.", DOCS_NOTE],
    permissions: { read: ["Verify transactions by id"], write: ["Create payments and refunds"] },
    compliance: [
      "Complete business verification (KYB). Flutterwave may request registration documents and beneficial owner details.",
      "Cardholder data is entered on Flutterwave's hosted page, which keeps you out of card data scope. Confirm your SAQ type with your acquirer.",
      "Verify the webhook with the secret hash, then confirm the transaction with Flutterwave before fulfilling the order.",
      "Respect country limits, anti-money-laundering rules and any local requirements for mobile money collections.",
    ],
    fields: [{ key: "environment", label: "Environment", type: "select", options: ["test", "live"], default: "test" }, { key: "webhookSecretRef", label: "Secret hash", type: "text", placeholder: "secretref://vault/nexi/prod/webhook-secret", required: true, help: "A reference to the secret hash you set for the webhook in the Flutterwave dashboard." }],
    docs: [{ label: "Flutterwave developer docs", url: "https://developer.flutterwave.com/docs" }],
  },
  {
    id: "paystack", name: "Paystack", vendor: "Paystack", family: "payments", icon: cdn("paystack", "00C3F7", CreditCard), status: "planned",
    blurb: "Cards, mobile money and bank transfer on a Paystack-hosted page.", versionTarget: "Paystack Transactions API and webhooks",
    auth: ["api-token"],
    prerequisites: ["A Paystack business that has completed go-live verification", "A secret key for live mode, stored as a secret reference", "A webhook URL configured in the dashboard"],
    capabilities: cap("validate", "collect-payment", "payment-link", "refund"),
    limitations: ["Available in the countries and currencies Paystack supports for your business.", DOCS_NOTE],
    permissions: { read: ["Verify transactions by reference"], write: ["Initialise transactions and create refunds"] },
    compliance: [
      "Complete go-live verification with the documents Paystack requests for your country and business type.",
      "Cardholder data stays on Paystack's hosted page. Confirm your SAQ type with your acquirer.",
      "Verify each webhook with the x-paystack-signature header, computed with your secret key over the raw body, and then verify the transaction before fulfilling.",
      "Use a unique reference for each order so a retry never charges twice.",
    ],
    fields: [{ key: "environment", label: "Environment", type: "select", options: ["test", "live"], default: "test" }],
    docs: [{ label: "Paystack developer docs", url: "https://paystack.com/docs/" }],
  },
  {
    id: "btcpay", name: "Bitcoin (BTCPay Server)", vendor: "BTCPay Server project", family: "payments", icon: si(siBitcoin), status: "planned",
    blurb: "Accept Bitcoin on-chain and over Lightning with an invoice from your own BTCPay Server. Funds go to your wallet.", versionTarget: "BTCPay Server Greenfield API",
    auth: ["api-token"],
    prerequisites: [
      "A BTCPay Server you run or a host you trust, reachable over HTTPS",
      "A store with a wallet. Use a watch-only wallet (extended public key) or your own Lightning node, so tok\u2211ner never holds keys",
      "A Greenfield API key bound to that single store, with only the permissions the operators need",
      "A webhook secret stored in your secret manager",
    ],
    capabilities: cap("validate", "collect-payment", "payment-link", ["refund", "partial", "A refund is a new payment you send. It needs the customer's address and an approval."]),
    limitations: [
      "Bitcoin payments are final. A refund is a separate transaction.",
      "An invoice can be paid late, too little or too much. By default these cases are held for review instead of being fulfilled.",
      "The fiat amount is converted at invoice creation with the rate source you choose, and the rate holds only for the invoice window.",
      DOCS_NOTE,
    ],
    permissions: { read: ["View invoices and store settings"], write: ["Create and modify invoices, manage the store webhook"] },
    compliance: [
      "Merchants that accept Bitcoin for goods or services and do not hold, exchange or transmit funds for others are generally not virtual asset service providers under FATF standards, but rules differ by country. If you custody funds, convert them or send them for third parties you may need a licence, for example under MiCA in the EU or as a money services business in the US.",
      "Screen the paying address and any refund address against sanctions lists before you fulfil or refund. The payment operators include an address screening step and stop fulfilment on a match.",
      "Apply customer due diligence in proportion to risk. Set a value above which an order needs review or identification, and record the reason.",
      "The travel rule binds licensed providers you may send funds through. Keep counterparty records for large refunds and payouts.",
      "Record and report receipts for tax as local law requires. Keep invoice ids, exchange rates and transaction ids.",
      "Never put personal data in invoice metadata. Send only the order id.",
      "Require more confirmations for high-value orders, and treat the invoice as settled only after the confirmations you configured.",
    ],
    fields: [
      { key: "endpoint", label: "BTCPay Server URL", type: "text", placeholder: "https://btcpay.example.com", required: true },
      { key: "storeId", label: "Store id", type: "text", required: true },
      { key: "webhookSecretRef", label: "Webhook secret", type: "text", placeholder: "secretref://vault/nexi/prod/webhook-secret", required: true, help: "A reference to the secret of the BTCPay webhook. Notifications are verified with it, then the invoice is read back." },
      f.tls(),
    ],
    docs: [{ label: "BTCPay Server eCommerce integration guide", url: "https://docs.btcpayserver.org/Development/ecommerce-integration-guide/" }],
  },
  {
    id: "custom-payment", name: "Custom payment provider", vendor: "Your provider", family: "payments", icon: { lucide: GlobeIcon }, status: "custom",
    blurb: "Connect any payment provider with an HTTP API. You define the credentials it needs, how a payment is created, how its status is read and how webhooks are signed.", versionTarget: "HTTPS and JSON, with HMAC-signed webhooks",
    auth: ["api-token", "basic", "oidc", "secret-manager"],
    prerequisites: [
      "The provider's API reference: how to create a payment, how to read its status and how it signs webhooks",
      "A sandbox from the provider, and its live base URL kept separate",
      "Each credential stored in your secret manager. You name every credential and the platform keeps only the reference",
    ],
    capabilities: cap("validate", "collect-payment", ["payment-link", "partial", "When the provider returns a hosted page URL."], ["refund", "partial", "When you configure a refund call."]),
    limitations: ["Plain HTTP is refused and TLS verification cannot be turned off for live use.", "Webhook signature verification is required in production. A provider without signed webhooks needs a status read-back for every notification.", DOCS_NOTE],
    permissions: { read: ["Read payment status using the status call you define"], write: ["Create payments using the create call you define"] },
    compliance: [
      "Confirm the provider is licensed or registered to process payments in the countries you serve, and who holds customer funds while they are in transit.",
      "Prefer a provider-hosted payment page. A page you host that collects card numbers brings you into a much larger PCI DSS scope than SAQ A.",
      "Verify webhook signatures and then read the payment status back from the provider before you fulfil anything.",
      "Apply the same limits, approvals, audit and retention rules as for built-in providers.",
      "Do not log credentials, authorisation headers or full request bodies that contain customer data.",
    ],
    fields: [
      { key: "baseUrl", label: "Base URL", type: "text", placeholder: "https://api.provider.example", required: true },
      { key: "authScheme", label: "Authentication", type: "select", options: ["API key in a header", "Bearer token", "HTTP Basic", "OAuth 2.0 client credentials", "HMAC signed request"], default: "Bearer token" },
      { key: "credentialRefs", label: "Credentials this provider needs", type: "textarea", placeholder: "api_key=secretref://vault/nexi/prod/provider-key\nmerchant_id=secretref://vault/nexi/prod/provider-merchant", help: "One per line as NAME=secretref://.... Add as many as the provider needs. Values are never stored here." },
      { key: "webhookSecretRef", label: "Webhook signing secret", type: "text", placeholder: "secretref://vault/nexi/prod/webhook-secret", help: "Only if the provider signs its notifications. Leave empty when it does not: the platform then treats notifications as hints and reads the status back." },
      f.tls(),
    ],
    docs: [{ label: "Connector contract", url: "https://tokener.io/docs/connectors" }],
  },
  {
    id: "twilio-sms", name: "Twilio messaging", vendor: "Twilio", family: "messaging", icon: si(siTwilio), status: "planned",
    blurb: "Send SMS or WhatsApp messages, for example a payment link or a reminder.", versionTarget: "Twilio Programmable Messaging",
    auth: ["api-token"],
    prerequisites: ["A Twilio account with a sender approved for your destination countries", "An API key, stored as a secret reference", "For the United States, registered A2P 10DLC brand and campaign"],
    capabilities: cap("validate", "send-sms"),
    limitations: ["Sender registration rules differ by country and can take days.", DOCS_NOTE],
    permissions: { read: ["Read message status"], write: ["Send messages from the approved sender"] },
    compliance: ["Send only to people who opted in, and honour opt-out keywords. Keep a record of consent.", "Register sender ids and campaigns where the country requires it.", "Avoid sending between local quiet hours, and keep message content free of secrets."],
    fields: [{ key: "from", label: "Sender id or number", type: "text", required: true }],
    docs: [{ label: "Twilio messaging", url: "https://www.twilio.com/docs/messaging" }],
  },
  {
    id: "slack", name: "Slack", vendor: "Salesforce", family: "messaging", icon: cdn("slack", "4A154B", MessageSquare), status: "planned",
    blurb: "Post messages to chosen channels and collect approvals from buttons in a message.", versionTarget: "Slack Web API and Interactivity",
    auth: ["oidc", "api-token"],
    prerequisites: ["A Slack app installed in the workspace by an admin", "Scopes limited to chat:write on the channels the app is invited to", "For approvals, a public HTTPS address for interactive requests, signed with the app's signing secret"],
    capabilities: cap("validate", "post-message"),
    limitations: ["The app can post only to channels it has been invited to.", "Incoming webhooks can announce but cannot take an answer. Approvals need the app.", DOCS_NOTE],
    permissions: { read: ["Read the names of channels it is in"], write: ["chat:write on invited channels"] },
    compliance: ["Do not post secrets or personal data into a channel. Messages stay in Slack under your retention settings."],
    fields: [{ key: "workspace", label: "Workspace", type: "text", placeholder: "acme.slack.com", required: true }, { key: "defaultChannel", label: "Default channel", type: "text", placeholder: "#platform-alerts" }],
    docs: [{ label: "Slack Web API", url: "https://api.slack.com/web" }],
  },
  {
    id: "microsoft-teams", name: "Microsoft Teams", vendor: "Microsoft", family: "messaging", icon: cdn("microsoftteams", "6264A7", MessageSquare), status: "planned",
    blurb: "Post messages to chosen channels and collect approvals from adaptive cards.", versionTarget: "Microsoft Graph and Bot Framework",
    auth: ["oidc", "workload-identity"],
    prerequisites: ["An app registration with admin consent for ChannelMessage.Send on allowed teams", "For approvals, a bot registration reachable over public HTTPS"],
    capabilities: cap("validate", "post-message"),
    limitations: ["Limit the app to named teams with a resource-specific consent policy.", DOCS_NOTE],
    permissions: { read: ["Read the names of channels it is in"], write: ["ChannelMessage.Send on allowed teams"] },
    compliance: ["Do not post secrets or personal data into a channel."],
    fields: [{ key: "tenantId", label: "Directory (tenant) id", type: "text", required: true }, { key: "clientId", label: "Application (client) id", type: "text", required: true }],
    docs: [{ label: "Microsoft Teams messaging", url: "https://learn.microsoft.com/graph/teams-concept-overview" }],
  },
  {
    id: "africastalking", name: "Africa's Talking", vendor: "Africa's Talking", family: "messaging", icon: cdn("africastalking", "F7941D", MessageSquare), status: "planned",
    blurb: "Send SMS to subscribers of African mobile networks.", versionTarget: "Africa's Talking SMS API",
    auth: ["api-token"],
    prerequisites: ["An Africa's Talking account and application username", "An API key, stored as a secret reference", "An approved sender id for the countries you send to"],
    capabilities: cap("validate", "send-sms"),
    limitations: ["Sender id approval and delivery rules vary by country and network.", DOCS_NOTE],
    permissions: { read: ["Read delivery reports"], write: ["Send SMS from the approved sender id"] },
    compliance: ["Send only to people who opted in, and keep a record of consent.", "Follow the telecom regulator's rules in each country, including sender id registration and content rules.", "Do not send secrets or the customer's PIN or one-time codes for other services."],
    fields: [{ key: "username", label: "Application username", type: "text", required: true }, { key: "senderId", label: "Sender id", type: "text" }],
    docs: [{ label: "Africa's Talking SMS", url: "https://developers.africastalking.com/docs/sms/overview" }],
  },

  // ---- MCP servers: tools, resources and prompts for agents
  ...mcpIntegrations(),
  ...codeModeIntegrations(),

];

/** Entries with a shipped contract carry it, so the Code view and the generic runtime read the same data. */
export const INTEGRATIONS: IntegrationDef[] = [...BASE_INTEGRATIONS, ...agentIntegrations()].map((i) => (SHIPPED_CONTRACTS[i.id] ? { ...i, contract: SHIPPED_CONTRACTS[i.id] } : i));

export const STATUS_LEGEND: Record<IntegrationStatus, { label: string; tone: "healthy" | "degraded" | "info" | "neutral"; text: string }> = {
  available: { label: "Available", tone: "healthy", text: "Real connector implemented, contract-tested and supported." },
  beta: { label: "Beta", tone: "degraded", text: "Real connector implemented with a documented limited scope." },
  planned: { label: "In development", tone: "neutral", text: "Specified, with the connector in development. The setup flow can be configured now; tests return sample results." },
  custom: { label: "Custom", tone: "info", text: "Customer-supplied through a generic contract such as an HTTP endpoint, an OCI image or an agent." },
};

/**
 * The built-in entries plus whatever platform admins have published or re-labelled from the console. The client registers its source
 * (lib/platform/integrations.ts). Without one, as on the server, only the built-in entries exist.
 */
type Source = { list: () => IntegrationDef[]; byId: (id: string) => IntegrationDef | undefined };
let source: Source | null = null;
export const setIntegrationSource = (s: Source | null) => { source = s; };
/** The catalogue as the control plane holds it, set while a signed-in workspace is connected. Empty or null means the console's own copy is used. */
let live: IntegrationDef[] | null = null;
const liveListeners = new Set<() => void>();
export const setLiveCatalogue = (defs: IntegrationDef[] | null) => { live = defs && defs.length > 0 ? defs : null; liveListeners.forEach((l) => l()); };
export const liveCatalogue = (): IntegrationDef[] | null => live;
export const subscribeLiveCatalogue = (l: () => void) => { liveListeners.add(l); return () => void liveListeners.delete(l); };
/** Integrations a person can choose today. Retired ones are left out. */
/**
 * Connectors are built and approved by the platform administrators. A customer sees and uses only the ones that were approved: Available and Beta, plus the
 * generic Custom ones. Anything still in development is a draft on the platform side and is hidden from the customer's hub and pickers.
 */
export const isPublished = (i: Pick<IntegrationDef, "status">) => i.status !== "planned";

export const allIntegrations = (): IntegrationDef[] => (live ?? (source ? source.list() : INTEGRATIONS));
/** Any integration, including retired ones, so existing connections keep resolving. */
export const integrationById = (id: string): IntegrationDef | undefined =>
  live ? (live.find((i) => i.id === id) ?? INTEGRATIONS.find((i) => i.id === id)) : source ? source.byId(id) : INTEGRATIONS.find((i) => i.id === id);

// Keep unused icon imports referenced for tree-shaking clarity.
void [Cpu, Workflow, siAmazons3, siPytorch];
