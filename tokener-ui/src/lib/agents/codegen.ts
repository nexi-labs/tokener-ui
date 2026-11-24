import { validateExecution, enabledModes, MODE_BY_ID, RUNTIME_BY_ID, describeCron, type Execution } from "./execution";
import { ADAPTER_BY_ID } from "./adapters";
import { MAX_DEPTH, TAP_VERSION } from "./protocol";

/**
 * Agent Forge's generator. It turns one agent definition into a runnable project for the chosen framework: the agent code, a TAP server (Atlas card, Relay
 * tasks, Pulse control), a Dockerfile and a specification file. The model and tool calls go through the tok∑ner gateway and the tok∑ner MCP gateway, so the
 * agent is governed from its first call. Credentials are read from the environment, which a deployment fills from secret references.
 * scripts/check-agent-codegen.ts compiles the generated Python and TypeScript and runs the generated Python server against the protocol validator.
 */

export type ForgeSpec = {
  /** Lowercase letters, digits and hyphens. Becomes the agent URI. */
  name: string;
  title: string;
  description: string;
  organisation: string;
  /** A group or person from People and access. */
  owner: string;
  /** Where the agent sits in Tenant Management. Cost, access and knowledge open to a project follow it. */
  department?: string;
  project?: string;
  version: string;
  framework: string;
  model: string;
  temperature: number;
  maxSteps: number;
  instructions: string;
  /** MCP servers reached through the tok∑ner MCP gateway, with the tools this agent may call. */
  tools: { server: string; allow: string[] }[];
  knowledge: string[];
  memory: "none" | "session" | "persistent";
  guardrails: { maskPersonalData: boolean; blockedTopics: string[]; approvalFor: string[] };
  budget: { perTaskUsd: number; monthlyUsd: number };
  conformance: "observe" | "govern" | "collaborate";
  modes: ("sync" | "stream" | "async" | "webhook")[];
  capabilities: { id: string; description: string }[];
  signing: boolean;
  /** How the agent runs and what starts it. Absent means on demand, on the on-demand runtime. */
  execution?: Execution;
};

export type GeneratedFile = { path: string; language: "python" | "typescript" | "yaml" | "markdown" | "dockerfile" | "text" | "json"; purpose: string; content: string };

export const NAME_RULE = /^[a-z][a-z0-9-]{1,62}$/;

export const DEFAULT_SPEC: ForgeSpec = {
  name: "support-triage", title: "Support triage", description: "Reads incoming support requests, classifies them and drafts a reply for a person to review.",
  organisation: "acme", owner: "support-engineering", department: "Customer Support", project: "support-ml", version: "0.1.0", framework: "langgraph", model: "gpt-5", temperature: 0.2, maxSteps: 8,
  instructions: "You triage customer support requests. Classify each request, say how urgent it is, and draft a short, polite reply. If you are not sure, say so and ask for the missing detail. Never promise refunds or credits.",
  tools: [{ server: "helpdesk", allow: ["search_tickets", "get_ticket"] }], knowledge: [], memory: "session",
  guardrails: { maskPersonalData: true, blockedTopics: [], approvalFor: [] }, budget: { perTaskUsd: 0.5, monthlyUsd: 200 },
  conformance: "collaborate", modes: ["sync", "async"], capabilities: [{ id: "support.triage", description: "Classify and draft a reply for a support request." }], signing: true,
};

export type SpecIssue = { field: string; message: string };

export function validateSpec(s: ForgeSpec): SpecIssue[] {
  const out: SpecIssue[] = [];
  if (!NAME_RULE.test(s.name)) out.push({ field: "name", message: "Use 2 to 63 lowercase letters, digits and hyphens, starting with a letter." });
  if (!NAME_RULE.test(s.organisation)) out.push({ field: "organisation", message: "The organisation slug uses lowercase letters, digits and hyphens." });
  if (!s.title.trim()) out.push({ field: "title", message: "Give the agent a display name." });
  if (!s.owner.trim()) out.push({ field: "owner", message: "Every agent has an accountable owner." });
  if (!s.department?.trim()) out.push({ field: "department", message: "Choose the department this agent belongs to." });
  if (!ADAPTER_BY_ID[s.framework]?.build) out.push({ field: "framework", message: "Choose a framework Agent Forge can build." });
  if (!s.model.trim()) out.push({ field: "model", message: "Choose a model from the Model Registry." });
  if (s.temperature < 0 || s.temperature > 2) out.push({ field: "temperature", message: "Temperature is between 0 and 2." });
  if (!Number.isInteger(s.maxSteps) || s.maxSteps < 1 || s.maxSteps > 50) out.push({ field: "maxSteps", message: "Steps are a whole number from 1 to 50." });
  if (s.instructions.trim().length < 20) out.push({ field: "instructions", message: "Write instructions of at least a sentence, so the agent knows its job." });
  if (s.budget.perTaskUsd <= 0 || s.budget.monthlyUsd <= 0) out.push({ field: "budget", message: "Set a budget above zero for each task and each month." });
  else if (s.budget.perTaskUsd > s.budget.monthlyUsd) out.push({ field: "budget", message: "One task cannot be allowed more than the monthly budget." });
  if (s.modes.length === 0) out.push({ field: "modes", message: "Choose at least one way to call the agent." });
  if (s.capabilities.length === 0) out.push({ field: "capabilities", message: "Name at least one thing the agent can do, so others can find it." });
  s.capabilities.forEach((c, i) => { if (!/^[a-z][a-z0-9._-]*$/.test(c.id)) out.push({ field: `capabilities[${i}]`, message: `${c.id || "A capability"}: use lowercase letters, digits, dots, hyphens and underscores.` }); });
  s.tools.forEach((t, i) => {
    if (!NAME_RULE.test(t.server)) out.push({ field: `tools[${i}]`, message: `${t.server || "A server"}: use the MCP connection name, in lowercase.` });
    if (t.allow.length === 0) out.push({ field: `tools[${i}]`, message: `${t.server}: list the tools this agent may call. An empty list would allow none.` });
  });
  if (new Set(s.tools.map((t) => t.server)).size !== s.tools.length) out.push({ field: "tools", message: "A server is listed twice." });
  if (s.execution) for (const i of validateExecution(s.execution, { hasSensitiveTools: s.guardrails.approvalFor.length > 0, control: "governed" })) if (i.level === "error") out.push({ field: `execution.${i.path}`, message: i.message });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------------

const lit = (v: unknown) => JSON.stringify(v);
const identifier = (n: string) => n.replace(/-/g, "_");
const render = (tpl: string, vars: Record<string, string>) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? vars[k] : `{{${k}}}`));
const yamlStr = (v: string) => (/^[A-Za-z0-9_.\-/ ]+$/.test(v) && !/^(true|false|null|yes|no|\d)/i.test(v) ? v : JSON.stringify(v));
const uri = (s: ForgeSpec) => `agent://${s.organisation}/${s.name}`;
export const mcpPath = (server: string) => `/${server}`;


/** The runtime block of the specification. The control plane reads it to create the schedules, triggers and gates, so it holds names and settings only, never credentials. */
export function executionYaml(e: Execution): string[] {
  const l: string[] = ["  runtime:", `    kind: ${e.runtime}`, `    durable: ${e.durable}`];
  if (e.runtime !== "external") l.push("    scaling:", `      minReplicas: ${e.scaling.minReplicas}`, `      maxReplicas: ${e.scaling.maxReplicas}`, `      concurrency: ${e.scaling.concurrency}`, `      timeoutSec: ${e.scaling.timeoutSec}`, `      memoryMb: ${e.scaling.memoryMb}`, `      cpu: ${e.scaling.cpu}`);
  l.push("    modes:");
  const m = e.modes;
  if (m.onDemand) l.push("      onDemand:", `        response: ${m.onDemand.response}`, `        timeoutSec: ${m.onDemand.timeoutSec}`, `        concurrency: ${m.onDemand.concurrency}`);
  if (m.scheduled) { l.push("      scheduled:"); for (const x of m.scheduled.schedules) l.push(`        - name: ${yamlStr(x.name)}`, `          cron: ${JSON.stringify(x.cron)}`, `          timezone: ${x.timezone}`, `          overlap: ${x.overlap}`, `          catchUp: ${x.catchUp}`, `          enabled: ${x.enabled}`, `          input: ${JSON.stringify(x.input)}`); }
  if (m.event) {
    l.push("      event:"); l.push("        triggers:");
    for (const t of m.event.triggers) { l.push(`          - kind: ${t.kind}`, `            source: ${yamlStr(t.source)}`); if (t.connection) l.push(`            connection: ${t.connection}`); if (t.filter) l.push(`            filter: ${JSON.stringify(t.filter)}`); l.push(`            batchSize: ${t.batchSize}`); }
    l.push(`        concurrency: ${m.event.concurrency}`, `        retries: ${m.event.retries}`); if (m.event.deadLetter) l.push(`        deadLetter: ${yamlStr(m.event.deadLetter)}`);
  }
  if (m.streaming) {
    const x = m.streaming;
    l.push("      streaming:", "        source:", `          kind: ${x.source.kind}`, `          topic: ${yamlStr(x.source.topic)}`); if (x.source.connection) l.push(`          connection: ${x.source.connection}`);
    if (x.sink) { l.push("        sink:", `          kind: ${x.sink.kind}`, `          topic: ${yamlStr(x.sink.topic)}`); if (x.sink.connection) l.push(`          connection: ${x.sink.connection}`); }
    l.push(`        consumerGroup: ${yamlStr(x.consumerGroup)}`, `        parallelism: ${x.parallelism}`, "        window:", `          kind: ${x.window.kind}`);
    if (x.window.kind !== "none") l.push(`          sizeSec: ${x.window.sizeSec}`); if (x.window.slideSec) l.push(`          slideSec: ${x.window.slideSec}`); if (x.window.gapSec) l.push(`          gapSec: ${x.window.gapSec}`);
    if (x.keyBy) l.push(`        keyBy: ${yamlStr(x.keyBy)}`);
    l.push(`        checkpointSec: ${x.checkpointSec}`, `        delivery: ${x.delivery}`, `        maxLagSec: ${x.maxLagSec}`, `        backpressure: ${x.backpressure}`);
  }
  if (m.human) { const h = m.human; l.push("      human:", `        when: [${h.when.join(", ")}]`, `        confidenceBelow: ${h.confidenceBelow}`, `        costAboveUsd: ${h.costAboveUsd}`, `        assignee: ${yamlStr(h.assignee)}`, `        channels: [${h.channels.join(", ")}]`, `        slaMinutes: ${h.slaMinutes}`, `        onTimeout: ${h.onTimeout}`); if (h.escalateTo) l.push(`        escalateTo: ${yamlStr(h.escalateTo)}`); l.push(`        allowTakeover: ${h.allowTakeover}`, `        requireReason: ${h.requireReason}`); }
  return l;
}

/** A worker that reads a stream and hands each window to the agent. It is a template: it reads one partition set with a consumer group, buffers per key, and commits offsets only after the window is handled. */
const PY_WORKER = `"""Streaming worker. Generated by tok∑ner Agent Forge. Reads {{topic}} as consumer group {{group}} and sends each window to the agent."""
import json, os, time, signal
from collections import defaultdict
from confluent_kafka import Consumer, KafkaError
from agent import run

WINDOW_SEC = {{windowSec}}  # tumbling window length. Sliding and session windows need a state store, see the README.
KEY_BY = {{keyBy}}
CHECKPOINT_SEC = {{checkpointSec}}

consumer = Consumer({
    "bootstrap.servers": os.environ["KAFKA_BOOTSTRAP_SERVERS"],
    "group.id": {{group}},
    "enable.auto.commit": False,  # offsets are committed after a window is handled, so a restart repeats work and never skips it
    "auto.offset.reset": "latest",
    # credentials come from the environment: KAFKA_SASL_USERNAME, KAFKA_SASL_PASSWORD. Read them from the secret store.
})
consumer.subscribe([{{topic}}])
running = True
signal.signal(signal.SIGTERM, lambda *_: globals().__setitem__("running", False))

windows: dict[str, list[dict]] = defaultdict(list)
opened = time.time()
last_checkpoint = time.time()

def flush():
    for key, events in windows.items():
        run("Review these events and say what needs attention.\n" + json.dumps(events), session_id=f"stream-{key}")
    windows.clear()

while running:
    msg = consumer.poll(1.0)
    if msg is not None and msg.error() is None:
        event = json.loads(msg.value())
        windows[str(event.get(KEY_BY, "all")) if KEY_BY else "all"].append(event)
    elif msg is not None and msg.error().code() != KafkaError._PARTITION_EOF:
        raise RuntimeError(msg.error())
    if WINDOW_SEC and time.time() - opened >= WINDOW_SEC:
        flush(); opened = time.time(); consumer.commit(asynchronous=False); last_checkpoint = time.time()
    elif time.time() - last_checkpoint >= CHECKPOINT_SEC and not WINDOW_SEC:
        consumer.commit(asynchronous=False); last_checkpoint = time.time()
flush(); consumer.commit(asynchronous=False); consumer.close()
`;

export function specYaml(s: ForgeSpec): string {
  const l: string[] = [];
  l.push("# tok∑ner agent specification. Agent Forge generated this file. It is the source of truth for the registry and for governance.");
  l.push("apiVersion: tokener.io/agents/v1", "kind: Agent", "metadata:", `  name: ${s.name}`, `  uri: ${uri(s)}`, `  title: ${yamlStr(s.title)}`, `  description: ${yamlStr(s.description)}`, `  owner: ${yamlStr(s.owner)}`, `  version: ${s.version}`);
  l.push("spec:", `  framework: ${s.framework}`, "  model:", `    id: ${yamlStr(s.model)}`, `    temperature: ${s.temperature}`, `    maxSteps: ${s.maxSteps}`);
  l.push("  instructions: |", ...s.instructions.split("\n").map((x) => "    " + x));
  l.push("  tools:");
  if (s.tools.length === 0) l[l.length - 1] = "  tools: []";
  for (const t of s.tools) l.push(`    - server: ${t.server}`, "      allow:", ...t.allow.map((a) => `        - ${a}`));
  l.push(s.knowledge.length ? "  knowledge:" : "  knowledge: []", ...s.knowledge.map((k) => `    - ${yamlStr(k)}`));
  l.push(`  memory: ${s.memory}`, "  guardrails:", `    maskPersonalData: ${s.guardrails.maskPersonalData}`);
  l.push(s.guardrails.blockedTopics.length ? "    blockedTopics:" : "    blockedTopics: []", ...s.guardrails.blockedTopics.map((k) => `      - ${yamlStr(k)}`));
  l.push(s.guardrails.approvalFor.length ? "    approvalFor:" : "    approvalFor: []", ...s.guardrails.approvalFor.map((k) => `      - ${yamlStr(k)}`));
  l.push("  budget:", `    perTaskUsd: ${s.budget.perTaskUsd}`, `    monthlyUsd: ${s.budget.monthlyUsd}`);
  l.push("  protocol:", `    tap: "${TAP_VERSION}"`, `    conformance: ${s.conformance}`, `    modes: [${s.modes.join(", ")}]`, `    signing: ${s.signing}`);
  l.push("    capabilities:", ...s.capabilities.flatMap((c) => [`      - id: ${c.id}`, `        description: ${yamlStr(c.description)}`]));
  if (s.execution) l.push(...executionYaml(s.execution));
  return l.join("\n") + "\n";
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Python

const PY_PRELUDE = `import os

GATEWAY_URL = os.environ["TOKENER_GATEWAY_URL"]  # the tok∑ner gateway, OpenAI compatible, for example https://gateway.example.com/v1
APP_KEY = os.environ["TOKENER_APP_KEY"]  # this agent's application key. Fill it from your secret store. Never commit it.
MODEL = os.environ.get("TOKENER_MODEL", {{model}})
TEMPERATURE = float(os.environ.get("TOKENER_TEMPERATURE", "{{temperature}}"))
MAX_STEPS = int(os.environ.get("TOKENER_MAX_STEPS", "{{maxSteps}}"))
AGENT_NAME = {{identifier}}
INSTRUCTIONS = {{instructions}}

# MCP servers, reached through the tok∑ner MCP gateway so that tool policy, approval and audit apply to every call.
_MCP_BASE = os.environ.get("TOKENER_MCP_URL", "").rstrip("/")
MCP_SERVERS = {{mcpServers}}
MCP_HEADERS = {"Authorization": "Bearer " + APP_KEY}
`;

function pyMcp(s: ForgeSpec) {
  return "{" + s.tools.map((t) => `${lit(t.server)}: _MCP_BASE + ${lit(mcpPath(t.server))}`).join(", ") + "}";
}

const PY_AGENTS: Record<string, string> = {
  langgraph: `from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import create_react_agent

_llm = ChatOpenAI(model=MODEL, base_url=GATEWAY_URL, api_key=APP_KEY, temperature=TEMPERATURE)
_memory = MemorySaver()  # in process. Use a Postgres checkpointer before you run more than one replica.
_agent = None


async def _get_agent():
    global _agent
    if _agent is None:
        tools = []
        if MCP_SERVERS:
            client = MultiServerMCPClient({n: {"url": u, "transport": "streamable_http", "headers": MCP_HEADERS} for n, u in MCP_SERVERS.items()})
            tools = await client.get_tools()
        _agent = create_react_agent(_llm, tools, prompt=INSTRUCTIONS, checkpointer=_memory)
    return _agent


async def run(text: str, session_id: str | None = None) -> str:
    agent = await _get_agent()
    config = {"configurable": {"thread_id": session_id or "default"}, "recursion_limit": MAX_STEPS * 2 + 1}
    result = await agent.ainvoke({"messages": [("user", text)]}, config)
    return result["messages"][-1].content
`,
  "langchain-agent": `from langchain.agents import create_agent
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_openai import ChatOpenAI

_llm = ChatOpenAI(model=MODEL, base_url=GATEWAY_URL, api_key=APP_KEY, temperature=TEMPERATURE)
_agent = None


async def _get_agent():
    global _agent
    if _agent is None:
        tools = []
        if MCP_SERVERS:
            client = MultiServerMCPClient({n: {"url": u, "transport": "streamable_http", "headers": MCP_HEADERS} for n, u in MCP_SERVERS.items()})
            tools = await client.get_tools()
        _agent = create_agent(_llm, tools, system_prompt=INSTRUCTIONS)
    return _agent


async def run(text: str, session_id: str | None = None) -> str:
    agent = await _get_agent()
    result = await agent.ainvoke({"messages": [{"role": "user", "content": text}]})
    return result["messages"][-1].content
`,
  crewai: `from crewai import Agent, Crew, LLM, Task

_llm = LLM(model="openai/" + MODEL, base_url=GATEWAY_URL, api_key=APP_KEY, temperature=TEMPERATURE)
_agent = Agent(role=AGENT_NAME, goal="Do the job described in the backstory, accurately and briefly.", backstory=INSTRUCTIONS, llm=_llm, max_iter=MAX_STEPS, verbose=False)
# Tools: add MCP tools with the CrewAI MCP adapter once you have pinned a version. Point it at MCP_SERVERS with MCP_HEADERS.


async def run(text: str, session_id: str | None = None) -> str:
    task = Task(description=text, expected_output="A clear answer to the request.", agent=_agent)
    crew = Crew(agents=[_agent], tasks=[task], verbose=False)
    result = await crew.kickoff_async()
    return str(result)
`,
  llamaindex: `from llama_index.core.agent.workflow import FunctionAgent
from llama_index.llms.openai_like import OpenAILike
from llama_index.tools.mcp import BasicMCPClient, McpToolSpec

_llm = OpenAILike(model=MODEL, api_base=GATEWAY_URL, api_key=APP_KEY, is_chat_model=True, is_function_calling_model=True, temperature=TEMPERATURE)
_agent = None


async def _get_agent():
    global _agent
    if _agent is None:
        tools = []
        for url in MCP_SERVERS.values():
            tools += await McpToolSpec(client=BasicMCPClient(url, headers=MCP_HEADERS)).to_tool_list_async()
        _agent = FunctionAgent(tools=tools, llm=_llm, system_prompt=INSTRUCTIONS)
    return _agent


async def run(text: str, session_id: str | None = None) -> str:
    agent = await _get_agent()
    response = await agent.run(text, max_iterations=MAX_STEPS)
    return str(response)
`,
  "openai-agents": `from contextlib import AsyncExitStack

from agents import Agent, OpenAIChatCompletionsModel, Runner, set_tracing_disabled
from agents.mcp import MCPServerStreamableHttp
from openai import AsyncOpenAI

set_tracing_disabled(True)  # traces go to tok∑ner, not to OpenAI
_client = AsyncOpenAI(base_url=GATEWAY_URL, api_key=APP_KEY)
_model = OpenAIChatCompletionsModel(model=MODEL, openai_client=_client)


async def run(text: str, session_id: str | None = None) -> str:
    async with AsyncExitStack() as stack:
        servers = [await stack.enter_async_context(MCPServerStreamableHttp(params={"url": u, "headers": MCP_HEADERS}, name=n)) for n, u in MCP_SERVERS.items()]
        agent = Agent(name=AGENT_NAME, instructions=INSTRUCTIONS, model=_model, mcp_servers=servers)
        result = await Runner.run(agent, text, max_turns=MAX_STEPS)
    return str(result.final_output)
`,
  autogen: `from contextlib import AsyncExitStack

from autogen_agentchat.agents import AssistantAgent
from autogen_ext.models.openai import OpenAIChatCompletionClient
from autogen_ext.tools.mcp import McpWorkbench, StreamableHttpServerParams

_client = OpenAIChatCompletionClient(
    model=MODEL, base_url=GATEWAY_URL, api_key=APP_KEY, temperature=TEMPERATURE,
    model_info={"vision": False, "function_calling": True, "json_output": True, "structured_output": True, "family": "unknown"},
)


async def run(text: str, session_id: str | None = None) -> str:
    async with AsyncExitStack() as stack:
        workbenches = [await stack.enter_async_context(McpWorkbench(StreamableHttpServerParams(url=u, headers=MCP_HEADERS))) for u in MCP_SERVERS.values()]
        agent = AssistantAgent(AGENT_NAME, model_client=_client, system_message=INSTRUCTIONS, workbench=workbenches or None, max_tool_iterations=MAX_STEPS)
        result = await agent.run(task=text)
    return str(result.messages[-1].content)
`,
  "google-adk": `from google.adk.agents import Agent
from google.adk.models.lite_llm import LiteLlm
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset, StreamableHTTPConnectionParams
from google.genai import types

APP_NAME = "{{name}}"
_tools = [MCPToolset(connection_params=StreamableHTTPConnectionParams(url=u, headers=MCP_HEADERS)) for u in MCP_SERVERS.values()]
_agent = Agent(name=AGENT_NAME, model=LiteLlm(model="openai/" + MODEL, api_base=GATEWAY_URL, api_key=APP_KEY, temperature=TEMPERATURE), instruction=INSTRUCTIONS, tools=_tools)
_sessions = InMemorySessionService()  # in process. Use a database session service before you run more than one replica.
_runner = Runner(agent=_agent, app_name=APP_NAME, session_service=_sessions)


async def run(text: str, session_id: str | None = None) -> str:
    sid = session_id or "default"
    if await _sessions.get_session(app_name=APP_NAME, user_id="tokener", session_id=sid) is None:
        await _sessions.create_session(app_name=APP_NAME, user_id="tokener", session_id=sid)
    message = types.Content(role="user", parts=[types.Part(text=text)])
    answer = ""
    async for event in _runner.run_async(user_id="tokener", session_id=sid, new_message=message):
        if event.is_final_response() and event.content and event.content.parts:
            answer = "".join(p.text or "" for p in event.content.parts)
    return answer
`,
  "pydantic-ai": `from pydantic_ai import Agent
from pydantic_ai.mcp import MCPServerStreamableHTTP
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider

Agent.instrument_all()  # OpenTelemetry spans for every run, model call and tool call
_model = OpenAIChatModel(MODEL, provider=OpenAIProvider(base_url=GATEWAY_URL, api_key=APP_KEY))
_toolsets = [MCPServerStreamableHTTP(u, headers=MCP_HEADERS) for u in MCP_SERVERS.values()]
_agent = Agent(_model, instructions=INSTRUCTIONS, toolsets=_toolsets, model_settings={"temperature": TEMPERATURE})


async def run(text: str, session_id: str | None = None) -> str:
    async with _agent:
        result = await _agent.run(text)
    return str(result.output)
`,
  strands: `from contextlib import ExitStack

from mcp.client.streamable_http import streamablehttp_client
from strands import Agent
from strands.models.openai import OpenAIModel
from strands.tools.mcp import MCPClient

_model = OpenAIModel(client_args={"api_key": APP_KEY, "base_url": GATEWAY_URL}, model_id=MODEL, params={"temperature": TEMPERATURE})


async def run(text: str, session_id: str | None = None) -> str:
    with ExitStack() as stack:
        tools = []
        for url in MCP_SERVERS.values():
            client = MCPClient(lambda u=url: streamablehttp_client(u, headers=MCP_HEADERS))
            stack.enter_context(client)
            tools += client.list_tools_sync()
        agent = Agent(model=_model, system_prompt=INSTRUCTIONS, tools=tools)
        result = await agent.invoke_async(text)
    return str(result)
`,
  smolagents: `import asyncio

from smolagents import OpenAIServerModel, ToolCallingAgent

_model = OpenAIServerModel(model_id=MODEL, api_base=GATEWAY_URL, api_key=APP_KEY, temperature=TEMPERATURE)
# Tools: smolagents loads MCP tools with ToolCollection.from_mcp, which needs trust_remote_code. Review the server first, then add it here.
_agent = ToolCallingAgent(tools=[], model=_model, instructions=INSTRUCTIONS, max_steps=MAX_STEPS)


async def run(text: str, session_id: str | None = None) -> str:
    return str(await asyncio.to_thread(_agent.run, text))
`,
};

const PY_SERVER = `"""TAP {{tap}} server for {{name}}. Agent Forge generated this file.

Implements Atlas (the agent card), Relay (tasks and messages) and Pulse (health, suspend, resume, drain) over HTTPS.
The agent itself is agent.py: it exposes async run(text, session_id) and nothing here depends on the framework.
Peers authenticate with a bearer token. Replace the static token check in authorised() with verification of your broker's JWTs before production.
"""
import asyncio
import datetime as dt
import hashlib
import hmac
import json
import os
import random
import re
import time
import urllib.request

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

import agent as agent_module

AGENT_URI = "{{uri}}"
VERSION = "{{version}}"
TAP = "{{tap}}"
MAX_DEPTH = {{maxDepth}}
PEER_TOKEN = os.environ.get("TOKENER_PEER_TOKEN", "")
PUBLIC_URL = os.environ.get("PUBLIC_URL", "https://localhost:8080").rstrip("/")
STARTED = time.time()
CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
ID_RULE = re.compile(r"^[a-z]{3,8}_[0-9A-HJKMNP-TV-Z]{26}$")

state = {"state": "ready"}
inflight: dict[str, asyncio.Task] = {}
tasks: dict[str, dict] = {}
seen: dict[str, tuple[float, str, dict]] = {}

CARD = {
    "uri": AGENT_URI, "name": {{title}}, "summary": {{description}}, "version": VERSION, "owner": {{owner}},
    "tap": [TAP], "conformance": "{{conformance}}",
    "endpoints": {"relay": PUBLIC_URL + "/relay", "pulse": PUBLIC_URL + "/pulse"},
    "auth": ["jwt-bearer"], "capabilities": {{capabilities}}, "modes": {{modes}},
}

app = FastAPI(title={{title}}, docs_url=None, redoc_url=None)


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def new_id(prefix: str) -> str:
    t, head = int(time.time() * 1000), ""
    for _ in range(10):
        head, t = CROCKFORD[t % 32] + head, t // 32
    return prefix + "_" + head + "".join(random.choice(CROCKFORD) for _ in range(16))


def new_trace() -> dict:
    return {"traceparent": "00-" + os.urandom(16).hex() + "-" + os.urandom(8).hex() + "-01", "depth": 0}


def reply(request: dict | None, type_: str, payload: dict) -> dict:
    trace = dict((request or {}).get("trace") or new_trace())
    out = {"tap": TAP, "id": new_id("msg"), "type": type_, "from": AGENT_URI, "trace": trace, "ts": now_iso(), "ttlMs": 60000, "payload": payload}
    if request:
        out["to"] = request["from"]
        out["replyTo"] = request["id"]
        if request.get("session"):
            out["session"] = request["session"]
    return out


def failure(request: dict | None, code: str, message: str, retryable: bool = False, status: int = 400) -> JSONResponse:
    body = reply(request, "relay.task.result", {"taskId": "none", "state": "rejected", "error": {"code": code, "message": message, "retryable": retryable}})
    return JSONResponse(body, status_code=status, headers={"TAP-Version": TAP})


def authorised(req: Request) -> bool:
    if not PEER_TOKEN:
        return False  # fail closed: no token configured means nobody is allowed
    given = req.headers.get("authorization", "")
    return given.startswith("Bearer ") and hmac.compare_digest(given[7:], PEER_TOKEN)


def check_envelope(env: dict) -> tuple[str, str] | None:
    if not isinstance(env, dict):
        return "tap.invalid_envelope", "The body must be a JSON object."
    if str(env.get("tap", "")).split(".")[0] != TAP.split(".")[0]:
        return "tap.unsupported_version", "This agent speaks TAP " + TAP + "."
    if not ID_RULE.match(str(env.get("id", ""))) or not isinstance(env.get("type"), str) or not isinstance(env.get("from"), str) or not isinstance(env.get("payload"), dict):
        return "tap.invalid_envelope", "id, type, from and payload are required."
    try:
        sent = dt.datetime.fromisoformat(str(env["ts"]).replace("Z", "+00:00")).timestamp()
        ttl = int(env["ttlMs"])
    except (KeyError, ValueError, TypeError):
        return "tap.invalid_envelope", "ts and ttlMs are required."
    if sent + ttl / 1000 < time.time():
        return "tap.expired", "The message has expired."
    trace = env.get("trace") or {}
    if not isinstance(trace.get("depth"), int) or trace["depth"] > MAX_DEPTH:
        return "tap.depth_exceeded", "trace.depth is missing or above " + str(MAX_DEPTH) + "."
    if env.get("to") not in (None, AGENT_URI):
        return "tap.not_found", "This agent is " + AGENT_URI + "."
    return None


def text_of(payload: dict) -> str:
    task = payload.get("task")
    if isinstance(task, dict):
        data = task.get("input", {})
        return data.get("text") if isinstance(data, dict) and isinstance(data.get("text"), str) else json.dumps(data)
    return " ".join(p.get("text", "") for p in payload.get("parts", []) if isinstance(p, dict) and p.get("kind") == "text")


async def execute(task_id: str, request: dict) -> dict:
    payload = request["payload"]
    deadline = payload.get("deadlineMs")
    started = time.time()
    try:
        output = await asyncio.wait_for(agent_module.run(text_of(payload), request.get("session")), timeout=(deadline / 1000) if deadline else None)
        result = {"taskId": task_id, "state": "completed", "output": {"text": output}}
    except asyncio.TimeoutError:
        result = {"taskId": task_id, "state": "failed", "error": {"code": "tap.timeout", "message": "The deadline was reached.", "retryable": True}}
    except asyncio.CancelledError:
        result = {"taskId": task_id, "state": "canceled"}
    except Exception as exc:  # the framework raised: report it without leaking internals
        result = {"taskId": task_id, "state": "failed", "error": {"code": "tap.unavailable", "message": type(exc).__name__, "retryable": True}}
    result["receipt"] = {"steps": [{"kind": "llm", "costMinor": 0, "currency": "USD", "ms": int((time.time() - started) * 1000)}], "totalMinor": 0}
    return result


async def run_in_background(task_id: str, request: dict) -> None:
    result = await execute(task_id, request)
    envelope = reply(request, "relay.task.result", result)
    tasks[task_id].update({"state": result["state"], "result": envelope})
    callback = request["payload"].get("callbackUrl")
    if request["payload"].get("mode") == "webhook" and callback and callback.startswith("https://"):
        data = json.dumps(envelope).encode()
        call = urllib.request.Request(callback, data=data, headers={"Content-Type": "application/vnd.tokener.tap+json"}, method="POST")
        try:
            await asyncio.to_thread(urllib.request.urlopen, call, None, 10)
        except Exception:
            pass  # the caller can still poll GET /relay/tasks/{id}


@app.get("/.well-known/tokener-agent.json")
async def card() -> dict:
    return CARD


@app.get("/health")
async def health() -> dict:
    return {"state": state["state"]}


@app.post("/relay")
async def relay(req: Request) -> JSONResponse:
    if not authorised(req):
        return failure(None, "tap.unauthorized", "A valid bearer token is required.", status=401)
    try:
        env = await req.json()
    except ValueError:
        return failure(None, "tap.invalid_envelope", "The body is not JSON.")
    problem = check_envelope(env)
    if problem:
        return failure(env if isinstance(env, dict) and "from" in env and "id" in env else None, problem[0], problem[1])
    digest = hashlib.sha256(json.dumps(env, sort_keys=True).encode()).hexdigest()
    now = time.time()
    for key in [k for k, v in seen.items() if v[0] < now]:
        del seen[key]
    if env["id"] in seen:
        if seen[env["id"]][1] != digest:
            return failure(env, "tap.conflict", "That id was used with a different body.", status=409)
        return JSONResponse(seen[env["id"]][2], headers={"TAP-Version": TAP})
    kind, payload = env["type"], env["payload"]
    if kind == "atlas.card.get":
        out = reply(env, "atlas.card", {"card": CARD})
    elif kind == "relay.task.create":
        if state["state"] != "ready":
            return failure(env, "tap.suspended", "The agent is " + state["state"] + ".", retryable=True, status=409)
        task_id = new_id("tsk")
        if payload.get("mode") in ("async", "webhook"):
            tasks[task_id] = {"state": "submitted"}
            inflight[task_id] = asyncio.create_task(run_in_background(task_id, env))
            out = reply(env, "relay.task.update", {"taskId": task_id, "state": "submitted"})
        else:
            tasks[task_id] = {"state": "working"}
            inflight[task_id] = asyncio.current_task()  # type: ignore[assignment]
            result = await execute(task_id, env)
            inflight.pop(task_id, None)
            tasks[task_id] = {"state": result["state"]}
            out = reply(env, "relay.task.result", result)
    elif kind == "relay.task.cancel":
        running = inflight.get(str(payload.get("taskId")))
        if running is None:
            return failure(env, "tap.not_found", "No running task has that id.", status=404)
        running.cancel()
        out = reply(env, "relay.task.update", {"taskId": payload["taskId"], "state": "canceled"})
    elif kind == "relay.message":
        answer = await agent_module.run(text_of(payload), env.get("session"))
        out = reply(env, "relay.message", {"role": "agent", "parts": [{"kind": "text", "text": answer}]})
    else:
        return failure(env, "tap.invalid_envelope", kind + " is not handled here.")
    seen[env["id"]] = (now + int(env["ttlMs"]) / 1000, digest, out)
    return JSONResponse(out, headers={"TAP-Version": TAP})


@app.get("/relay/tasks/{task_id}")
async def poll(task_id: str, req: Request) -> JSONResponse:
    if not authorised(req):
        return failure(None, "tap.unauthorized", "A valid bearer token is required.", status=401)
    found = tasks.get(task_id)
    if not found:
        return failure(None, "tap.not_found", "No task has that id.", status=404)
    return JSONResponse(found.get("result") or reply(None, "relay.task.update", {"taskId": task_id, "state": found["state"]}))


@app.post("/pulse")
async def pulse(req: Request) -> JSONResponse:
    if not authorised(req):
        return failure(None, "tap.unauthorized", "A valid bearer token is required.", status=401)
    try:
        env = await req.json()
    except ValueError:
        return failure(None, "tap.invalid_envelope", "The body is not JSON.")
    problem = check_envelope(env)
    if problem:
        return failure(env if isinstance(env, dict) and "from" in env and "id" in env else None, problem[0], problem[1])
    kind, payload = env["type"], env["payload"]
    if kind == "pulse.suspend":
        state["state"] = "suspended"
        if payload.get("mode") == "now":
            for running in list(inflight.values()):
                if running is not asyncio.current_task():
                    running.cancel()
    elif kind == "pulse.resume":
        state["state"] = "ready"
    elif kind == "pulse.drain":
        state["state"] = "draining"
    elif kind != "pulse.ping":
        return failure(env, "tap.invalid_envelope", kind + " is not a pulse message.")
    status = {"state": state["state"], "version": VERSION, "inFlight": len([t for t in inflight.values() if not t.done()]), "uptimeSec": int(time.time() - STARTED)}
    return JSONResponse(reply(env, "pulse.status", status), headers={"TAP-Version": TAP})
`;

// ---------------------------------------------------------------------------------------------------------------------------------------
// TypeScript

const TS_PRELUDE = `const env = process.env;
const need = (k: string): string => { const v = env[k]; if (!v) throw new Error(k + " is required"); return v; };

export const GATEWAY_URL = need("TOKENER_GATEWAY_URL"); // the tok∑ner gateway, OpenAI compatible
export const APP_KEY = need("TOKENER_APP_KEY"); // this agent's application key, from your secret store
export const MODEL = env.TOKENER_MODEL ?? {{model}};
export const TEMPERATURE = Number(env.TOKENER_TEMPERATURE ?? "{{temperature}}");
export const MAX_STEPS = Number(env.TOKENER_MAX_STEPS ?? "{{maxSteps}}");
export const AGENT_NAME = {{identifier}};
export const INSTRUCTIONS = {{instructions}};

// MCP servers, reached through the tok∑ner MCP gateway so that tool policy, approval and audit apply to every call.
const mcpBase = (env.TOKENER_MCP_URL ?? "").replace(/\\/+$/, "");
export const MCP_SERVERS: Record<string, string> = {{mcpServers}};
export const MCP_HEADERS = { Authorization: "Bearer " + APP_KEY };
`;

const TS_AGENTS: Record<string, string> = {
  mastra: `import { Agent } from "@mastra/core/agent";
import { MCPClient } from "@mastra/mcp";
import { createOpenAI } from "@ai-sdk/openai";
import { APP_KEY, AGENT_NAME, GATEWAY_URL, INSTRUCTIONS, MCP_HEADERS, MCP_SERVERS, MODEL } from "./config.js";

const provider = createOpenAI({ baseURL: GATEWAY_URL, apiKey: APP_KEY });
const servers = Object.fromEntries(Object.entries(MCP_SERVERS).map(([name, url]) => [name, { url: new URL(url), requestInit: { headers: MCP_HEADERS } }]));
const mcp = new MCPClient({ servers });
let agent: Agent | undefined;

export async function run(text: string, _sessionId?: string): Promise<string> {
  agent ??= new Agent({ name: AGENT_NAME, instructions: INSTRUCTIONS, model: provider.chat(MODEL), tools: await mcp.getTools() });
  const result = await agent.generate(text);
  return result.text;
}
`,
  "vercel-ai": `import { experimental_createMCPClient as createMCPClient, generateText, stepCountIs } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { APP_KEY, GATEWAY_URL, INSTRUCTIONS, MAX_STEPS, MCP_HEADERS, MCP_SERVERS, MODEL, TEMPERATURE } from "./config.js";

const provider = createOpenAI({ baseURL: GATEWAY_URL, apiKey: APP_KEY });

export async function run(text: string, _sessionId?: string): Promise<string> {
  const clients = await Promise.all(Object.values(MCP_SERVERS).map((url) => createMCPClient({ transport: { type: "http", url, headers: MCP_HEADERS } })));
  try {
    const tools = Object.assign({}, ...(await Promise.all(clients.map((c) => c.tools()))));
    const result = await generateText({ model: provider.chat(MODEL), system: INSTRUCTIONS, prompt: text, temperature: TEMPERATURE, tools, stopWhen: stepCountIs(MAX_STEPS) });
    return result.text;
  } finally {
    await Promise.all(clients.map((c) => c.close()));
  }
}
`,
};

const TS_SERVER = `import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { run } from "./agent.js";

/**
 * TAP {{tap}} server for {{name}}. Agent Forge generated this file.
 * Implements Atlas (the agent card), Relay (tasks and messages) and Pulse (health, suspend, resume, drain) over HTTPS.
 * Peers authenticate with a bearer token. Replace the static token check in authorised() with verification of your broker's JWTs before production.
 */
const AGENT_URI = "{{uri}}";
const VERSION = "{{version}}";
const TAP = "{{tap}}";
const MAX_DEPTH = {{maxDepth}};
const PEER_TOKEN = process.env.TOKENER_PEER_TOKEN ?? "";
const PUBLIC_URL = (process.env.PUBLIC_URL ?? "https://localhost:8080").replace(/\\/+$/, "");
const STARTED = Date.now();
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ID_RULE = /^[a-z]{3,8}_[0-9A-HJKMNP-TV-Z]{26}$/;

type Envelope = { tap: string; id: string; type: string; from: string; to?: string; session?: string; trace?: { traceparent?: string; depth?: number }; ts: string; ttlMs: number; payload: Record<string, any> };
const state = { value: "ready" };
const inflight = new Map<string, AbortController>();
const seen = new Map<string, { expires: number; digest: string; out: unknown }>();

const CARD = {
  uri: AGENT_URI, name: {{title}}, summary: {{description}}, version: VERSION, owner: {{owner}}, tap: [TAP], conformance: "{{conformance}}",
  endpoints: { relay: PUBLIC_URL + "/relay", pulse: PUBLIC_URL + "/pulse" }, auth: ["jwt-bearer"], capabilities: {{capabilities}}, modes: {{modes}},
};

const nowIso = () => new Date().toISOString();
function newId(prefix: string): string {
  let t = Date.now(), head = "";
  for (let i = 0; i < 10; i++) { head = CROCKFORD[t % 32] + head; t = Math.floor(t / 32); }
  const rnd = randomBytes(16);
  return prefix + "_" + head + Array.from(rnd, (b) => CROCKFORD[b % 32]).join("");
}
const newTrace = () => ({ traceparent: "00-" + randomBytes(16).toString("hex") + "-" + randomBytes(8).toString("hex") + "-01", depth: 0 });

function reply(request: Envelope | null, type: string, payload: Record<string, unknown>) {
  const out: Record<string, unknown> = { tap: TAP, id: newId("msg"), type, from: AGENT_URI, trace: { ...(request?.trace ?? newTrace()) }, ts: nowIso(), ttlMs: 60000, payload };
  if (request) { out.to = request.from; out.replyTo = request.id; if (request.session) out.session = request.session; }
  return out;
}
function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/vnd.tokener.tap+json", "TAP-Version": TAP });
  res.end(JSON.stringify(body));
}
const failure = (res: ServerResponse, request: Envelope | null, code: string, message: string, status = 400, retryable = false) =>
  send(res, status, reply(request, "relay.task.result", { taskId: "none", state: "rejected", error: { code, message, retryable } }));

function authorised(req: IncomingMessage): boolean {
  if (!PEER_TOKEN) return false; // fail closed: no token configured means nobody is allowed
  const given = req.headers.authorization ?? "";
  if (!given.startsWith("Bearer ")) return false;
  const a = Buffer.from(given.slice(7)), b = Buffer.from(PEER_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}
async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const c of req) { size += (c as Buffer).length; if (size > 1_000_000) throw new Error("too large"); chunks.push(c as Buffer); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function checkEnvelope(env: any): [string, string] | null {
  if (!env || typeof env !== "object" || Array.isArray(env)) return ["tap.invalid_envelope", "The body must be a JSON object."];
  if (String(env.tap ?? "").split(".")[0] !== TAP.split(".")[0]) return ["tap.unsupported_version", "This agent speaks TAP " + TAP + "."];
  if (!ID_RULE.test(String(env.id ?? "")) || typeof env.type !== "string" || typeof env.from !== "string" || typeof env.payload !== "object" || !env.payload) return ["tap.invalid_envelope", "id, type, from and payload are required."];
  const sent = Date.parse(String(env.ts)); const ttl = Number(env.ttlMs);
  if (Number.isNaN(sent) || !Number.isInteger(ttl)) return ["tap.invalid_envelope", "ts and ttlMs are required."];
  if (sent + ttl < Date.now()) return ["tap.expired", "The message has expired."];
  if (!Number.isInteger(env.trace?.depth) || env.trace.depth > MAX_DEPTH) return ["tap.depth_exceeded", "trace.depth is missing or above " + MAX_DEPTH + "."];
  if (env.to !== undefined && env.to !== AGENT_URI) return ["tap.not_found", "This agent is " + AGENT_URI + "."];
  return null;
}
function textOf(payload: Record<string, any>): string {
  const input = payload.task?.input;
  if (input) return typeof input.text === "string" ? input.text : JSON.stringify(input);
  return (payload.parts ?? []).filter((p: any) => p?.kind === "text").map((p: any) => p.text).join(" ");
}
async function execute(taskId: string, env: Envelope, signal: AbortSignal) {
  const started = Date.now();
  const deadline = Number(env.payload.deadlineMs) || 0;
  const timer = deadline ? setTimeout(() => inflight.get(taskId)?.abort("timeout"), deadline) : undefined;
  try {
    const output = await Promise.race([
      run(textOf(env.payload), env.session),
      new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new Error(String(signal.reason ?? "canceled"))))),
    ]);
    return { taskId, state: "completed", output: { text: output }, receipt: receipt(started) };
  } catch (e) {
    const reason = e instanceof Error ? e.message : "error";
    if (reason === "timeout") return { taskId, state: "failed", error: { code: "tap.timeout", message: "The deadline was reached.", retryable: true }, receipt: receipt(started) };
    if (reason === "canceled") return { taskId, state: "canceled", receipt: receipt(started) };
    return { taskId, state: "failed", error: { code: "tap.unavailable", message: "The agent failed.", retryable: true }, receipt: receipt(started) };
  } finally { if (timer) clearTimeout(timer); }
}
const receipt = (started: number) => ({ steps: [{ kind: "llm", costMinor: 0, currency: "USD", ms: Date.now() - started }], totalMinor: 0 });
const tasks = new Map<string, { state: string; result?: unknown }>();

async function onRelay(req: IncomingMessage, res: ServerResponse) {
  if (!authorised(req)) return failure(res, null, "tap.unauthorized", "A valid bearer token is required.", 401);
  let env: Envelope;
  try { env = await readJson(req); } catch { return failure(res, null, "tap.invalid_envelope", "The body is not JSON."); }
  const problem = checkEnvelope(env);
  if (problem) return failure(res, env && (env as any).from && (env as any).id ? env : null, problem[0], problem[1]);
  const digest = createHash("sha256").update(JSON.stringify(env)).digest("hex");
  for (const [k, v] of seen) if (v.expires < Date.now()) seen.delete(k);
  const prior = seen.get(env.id);
  if (prior) return prior.digest !== digest ? failure(res, env, "tap.conflict", "That id was used with a different body.", 409) : send(res, 200, prior.out);
  let out: unknown;
  if (env.type === "atlas.card.get") out = reply(env, "atlas.card", { card: CARD });
  else if (env.type === "relay.task.create") {
    if (state.value !== "ready") return failure(res, env, "tap.suspended", "The agent is " + state.value + ".", 409, true);
    const taskId = newId("tsk"); const ctl = new AbortController(); inflight.set(taskId, ctl);
    if (env.payload.mode === "async" || env.payload.mode === "webhook") {
      tasks.set(taskId, { state: "submitted" });
      void execute(taskId, env, ctl.signal).then(async (result) => {
        inflight.delete(taskId);
        const envelope = reply(env, "relay.task.result", result);
        tasks.set(taskId, { state: result.state, result: envelope });
        const cb = env.payload.callbackUrl;
        if (env.payload.mode === "webhook" && typeof cb === "string" && cb.startsWith("https://")) {
          try { await fetch(cb, { method: "POST", headers: { "Content-Type": "application/vnd.tokener.tap+json" }, body: JSON.stringify(envelope) }); } catch { /* the caller can poll GET /relay/tasks/{id} */ }
        }
      });
      out = reply(env, "relay.task.update", { taskId, state: "submitted" });
    } else {
      const result = await execute(taskId, env, ctl.signal); inflight.delete(taskId); tasks.set(taskId, { state: result.state });
      out = reply(env, "relay.task.result", result);
    }
  } else if (env.type === "relay.task.cancel") {
    const ctl = inflight.get(String(env.payload.taskId));
    if (!ctl) return failure(res, env, "tap.not_found", "No running task has that id.", 404);
    ctl.abort("canceled"); out = reply(env, "relay.task.update", { taskId: env.payload.taskId, state: "canceled" });
  } else if (env.type === "relay.message") {
    out = reply(env, "relay.message", { role: "agent", parts: [{ kind: "text", text: await run(textOf(env.payload), env.session) }] });
  } else return failure(res, env, "tap.invalid_envelope", env.type + " is not handled here.");
  seen.set(env.id, { expires: Date.now() + env.ttlMs, digest, out });
  send(res, 200, out);
}
async function onPulse(req: IncomingMessage, res: ServerResponse) {
  if (!authorised(req)) return failure(res, null, "tap.unauthorized", "A valid bearer token is required.", 401);
  let env: Envelope;
  try { env = await readJson(req); } catch { return failure(res, null, "tap.invalid_envelope", "The body is not JSON."); }
  const problem = checkEnvelope(env);
  if (problem) return failure(res, env && (env as any).from && (env as any).id ? env : null, problem[0], problem[1]);
  if (env.type === "pulse.suspend") { state.value = "suspended"; if (env.payload.mode === "now") for (const ctl of inflight.values()) ctl.abort("canceled"); }
  else if (env.type === "pulse.resume") state.value = "ready";
  else if (env.type === "pulse.drain") state.value = "draining";
  else if (env.type !== "pulse.ping") return failure(res, env, "tap.invalid_envelope", env.type + " is not a pulse message.");
  send(res, 200, reply(env, "pulse.status", { state: state.value, version: VERSION, inFlight: inflight.size, uptimeSec: Math.floor((Date.now() - STARTED) / 1000) }));
}

createServer(async (req, res) => {
  try {
    const path = (req.url ?? "/").split("?")[0];
    if (req.method === "GET" && path === "/.well-known/tokener-agent.json") return send(res, 200, CARD);
    if (req.method === "GET" && path === "/health") return send(res, 200, { state: state.value });
    if (req.method === "POST" && path === "/relay") return await onRelay(req, res);
    if (req.method === "POST" && path === "/pulse") return await onPulse(req, res);
    if (req.method === "GET" && path.startsWith("/relay/tasks/")) {
      if (!authorised(req)) return failure(res, null, "tap.unauthorized", "A valid bearer token is required.", 401);
      const t = tasks.get(path.slice("/relay/tasks/".length));
      return t ? send(res, 200, t.result ?? reply(null, "relay.task.update", { taskId: path.slice(13), state: t.state })) : failure(res, null, "tap.not_found", "No task has that id.", 404);
    }
    send(res, 404, { error: "not found" });
  } catch { send(res, 500, { error: "internal error" }); }
}).listen(Number(process.env.PORT ?? 8080), () => console.log("{{name}} listening"));
`;

// ---------------------------------------------------------------------------------------------------------------------------------------

const TS_WORKER = `// Streaming worker. Generated by tok∑ner Agent Forge. Reads {{topic}} as consumer group {{group}} and sends each window to the agent.
import { Kafka } from "kafkajs";
import { run } from "./agent.js";

const WINDOW_MS = {{windowSec}} * 1000; // tumbling window length. Sliding and session windows need a state store, see the README.
const KEY_BY: string | null = {{keyBy}};
const kafka = new Kafka({ brokers: process.env.KAFKA_BOOTSTRAP_SERVERS!.split(","), // credentials: KAFKA_SASL_USERNAME and KAFKA_SASL_PASSWORD, from the secret store
});
const consumer = kafka.consumer({ groupId: {{group}} });
let windows = new Map<string, unknown[]>();
let pending: { topic: string; partition: number; offset: string }[] = [];

async function flush() {
  for (const [key, events] of windows) await run("Review these events and say what needs attention.\\n" + JSON.stringify(events), "stream-" + key);
  windows = new Map();
  // offsets are committed after a window is handled, so a restart repeats work and never skips it
  if (pending.length) await consumer.commitOffsets(pending); pending = [];
}

await consumer.connect();
await consumer.subscribe({ topic: {{topic}}, fromBeginning: false });
setInterval(() => { flush().catch((e) => { console.error(e); process.exit(1); }); }, WINDOW_MS || 10_000);
await consumer.run({
  autoCommit: false,
  eachMessage: async ({ topic, partition, message }) => {
    const event = JSON.parse(message.value!.toString());
    const key = KEY_BY ? String(event[KEY_BY] ?? "all") : "all";
    windows.set(key, [...(windows.get(key) ?? []), event]);
    pending.push({ topic, partition, offset: (BigInt(message.offset) + 1n).toString() });
  },
});
process.on("SIGTERM", async () => { await flush(); await consumer.disconnect(); process.exit(0); });
`;

function vars(s: ForgeSpec): Record<string, string> {
  return {
    name: s.name, uri: uri(s), version: s.version, tap: TAP_VERSION, maxDepth: String(MAX_DEPTH), model: lit(s.model), temperature: String(s.temperature), maxSteps: String(s.maxSteps),
    identifier: lit(identifier(s.name)), instructions: lit(s.instructions), title: lit(s.title), description: lit(s.description), owner: lit(s.owner), conformance: s.conformance,
    capabilities: lit(s.capabilities.map((c) => ({ id: c.id, description: c.description }))), modes: lit(s.modes),
    mcpServers: "", // set per language
  };
}

const ENV_EXAMPLE = (s: ForgeSpec, ts: boolean) => [
  "# Copy to .env for local runs only. In a deployment these come from secret references, never from a file in the repository.",
  "TOKENER_GATEWAY_URL=https://gateway.example.com/v1",
  "TOKENER_APP_KEY=",
  s.tools.length ? "TOKENER_MCP_URL=https://gateway.example.com/mcp" : "# TOKENER_MCP_URL=https://gateway.example.com/mcp",
  "TOKENER_PEER_TOKEN=",
  "PUBLIC_URL=https://agent.example.com",
  "PORT=8080",
  `TOKENER_MODEL=${s.model}`,
  ...(s.execution?.modes.streaming ? ["KAFKA_BOOTSTRAP_SERVERS=broker-1.example.com:9092", "KAFKA_SASL_USERNAME=", "KAFKA_SASL_PASSWORD="] : []),
  ts ? "" : "",
].filter((x, i, a) => !(x === "" && (i === a.length - 1))).join("\n") + "\n";

const workerVars = (s: ForgeSpec) => { const st = s.execution?.modes.streaming; return { topic: lit(st?.source.topic ?? ""), group: lit(st?.consumerGroup ?? s.name), windowSec: String(st && st.window.kind === "tumbling" ? st.window.sizeSec : 0), keyBy: lit(st?.keyBy ?? null), checkpointSec: String(st?.checkpointSec ?? 10) }; };

function startsSection(s: ForgeSpec): string {
  const e = s.execution; if (!e) return "";
  const on = enabledModes(e); const lines = [`This agent runs as **${RUNTIME_BY_ID[e.runtime].label.toLowerCase()}** and starts in ${on.length} way${on.length === 1 ? "" : "s"}.`, ""];
  for (const m of on) {
    const x = e.modes;
    if (m === "onDemand") lines.push(`- **${MODE_BY_ID[m].label}**: called through the gateway or TAP, answers ${x.onDemand!.response === "sync" ? "in the same request" : x.onDemand!.response === "task" ? "as a task" : "as a stream"}, up to ${x.onDemand!.timeoutSec} seconds.`);
    if (m === "scheduled") for (const c of x.scheduled!.schedules) lines.push(`- **Scheduled, ${c.name}**: ${describeCron(c.cron).toLowerCase()} (${c.timezone}). If the last run is still going: ${c.overlap}. Missed runs: ${c.catchUp}. The control plane starts these, nothing in this project needs a clock.`);
    if (m === "event") for (const t of x.event!.triggers) lines.push(`- **Event, ${t.kind}**: ${t.source}${t.filter ? `, when ${t.filter}` : ""}. Failed events go to ${x.event!.deadLetter ?? "no queue"} after ${x.event!.retries} retries.`);
    if (m === "streaming") lines.push(`- **Streaming**: ${x.streaming!.source.topic} as group ${x.streaming!.consumerGroup}, ${x.streaming!.delivery}, checkpoint every ${x.streaming!.checkpointSec} seconds. Run \`${s.framework && ADAPTER_BY_ID[s.framework]?.build?.language === "typescript" ? "node dist/worker.js" : "python worker.py"}\` as the worker command.`);
    if (m === "human") lines.push(`- **Human assisted**: ${x.human!.assignee} decides ${x.human!.when.join(", ")}. ${x.human!.slaMinutes} minutes to answer, then ${x.human!.onTimeout}. The run is saved while it waits, so it does not hold a replica.`);
  }
  if (e.modes.streaming) lines.push("", "The worker template reads tumbling windows. Sliding and session windows, exactly-once delivery and state per key need a stream processor or a state store. Add one before you rely on them.");
  return `## How it starts\n\n${lines.join("\n")}\n\n`;
}

function readme(s: ForgeSpec, files: string[]): string {
  const a = ADAPTER_BY_ID[s.framework];
  return `# ${s.title}

${s.description}

Generated by tok∑ner Agent Forge for **${a.name}**. Agent URI: \`${uri(s)}\`. Owner: ${s.owner}. Version ${s.version}.

## Files

${files.map((f) => `- \`${f}\``).join("\n")}

## Run it

${a.build!.language === "python"
    ? "```\npython -m venv .venv && . .venv/bin/activate\npip install -r requirements.txt\nuvicorn relay_server:app --port 8080\n```"
    : a.build!.language === "typescript"
      ? "```\nnpm install\nnpm run build && npm start\n```"
      : "Deploy the specification from the console. There is nothing to run yourself."}

Set the variables in \`.env.example\` through your secret store. The agent fails to start without \`TOKENER_GATEWAY_URL\` and \`TOKENER_APP_KEY\`, and it refuses every request until \`TOKENER_PEER_TOKEN\` is set.

${startsSection(s)}## What is wired

- Model calls go to the tok∑ner gateway, so policy, budgets and accounting apply. Model: \`${s.model}\`.
- Tools come from MCP servers through the tok∑ner MCP gateway${s.tools.length ? ": " + s.tools.map((t) => `${t.server} (${t.allow.join(", ")})`).join("; ") : ". This agent has none yet."}. The allowed tools are enforced by the gateway from \`tokener.agent.yaml\`, not by this code.
- TAP ${TAP_VERSION}, conformance **${s.conformance}**: the agent card at \`/.well-known/tokener-agent.json\`, \`POST /relay\` for tasks and messages, \`POST /pulse\` for ping, suspend, resume and drain.

## Before production

- Pin the framework versions. The generated requirements name packages without versions because framework APIs change between releases. Build once, test, then pin what worked.
- Replace the static peer token with verification of your broker's JWTs (see \`authorised\`).
- ${a.build!.notes}
- ${s.memory === "none" ? "This agent keeps no memory between tasks." : "Memory is kept in process. Use a shared store before running more than one replica."}
- The receipt returned with each result reports timing only. Token and cost accounting come from the gateway, which sees every model call.
`;
}

export function generateProject(s: ForgeSpec): GeneratedFile[] {
  const a = ADAPTER_BY_ID[s.framework];
  if (!a?.build) throw new Error("Unknown framework " + s.framework);
  const files: GeneratedFile[] = [];
  const v = vars(s);

  files.push({ path: "tokener.agent.yaml", language: "yaml", purpose: "The agent specification. The registry and the governance policy read it.", content: specYaml(s) });

  if (a.build.language === "python") {
    v.mcpServers = pyMcp(s);
    const prelude = render(PY_PRELUDE, v);
    const body = render(PY_AGENTS[s.framework], v);
    files.push({ path: "agent.py", language: "python", purpose: `The ${a.name} agent. It exposes run(text, session_id).`, content: `"""${s.title}. Generated by tok∑ner Agent Forge for ${a.name}."""\n${prelude}\n${body}` });
    files.push({ path: "relay_server.py", language: "python", purpose: "TAP server: agent card, tasks, messages, health and control.", content: render(PY_SERVER, v) });
    if (s.execution?.modes.streaming) files.push({ path: "worker.py", language: "python", purpose: "Streaming worker: reads the stream in windows and hands each to the agent.", content: render(PY_WORKER, workerVars(s)) });
    files.push({ path: "requirements.txt", language: "text", purpose: "Dependencies. Pin versions after your first successful build.", content: ["# Pin these after your first successful build.", ...a.build.packages, "fastapi", "uvicorn", ...(s.execution?.modes.streaming ? ["confluent-kafka"] : [])].join("\n") + "\n" });
    files.push({ path: "Dockerfile", language: "dockerfile", purpose: "Container image.", content: `FROM python:3.12-slim\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nRUN useradd --system --uid 10001 agent\nUSER 10001\nEXPOSE 8080\nCMD ["uvicorn", "relay_server:app", "--host", "0.0.0.0", "--port", "8080"]\n` });
  } else if (a.build.language === "typescript") {
    v.mcpServers = "{" + s.tools.map((t) => `${lit(t.server)}: mcpBase + ${lit(mcpPath(t.server))}`).join(", ") + "}";
    files.push({ path: "src/config.ts", language: "typescript", purpose: "Settings from the environment.", content: render(TS_PRELUDE, v) });
    files.push({ path: "src/agent.ts", language: "typescript", purpose: `The ${a.name} agent. It exposes run(text, sessionId).`, content: TS_AGENTS[s.framework] });
    files.push({ path: "src/server.ts", language: "typescript", purpose: "TAP server: agent card, tasks, messages, health and control.", content: render(TS_SERVER, v) });
    if (s.execution?.modes.streaming) files.push({ path: "src/worker.ts", language: "typescript", purpose: "Streaming worker: reads the stream in windows and hands each to the agent.", content: render(TS_WORKER, workerVars(s)) });
    const deps = Object.fromEntries([...a.build.packages, ...(s.execution?.modes.streaming ? ["kafkajs"] : [])].map((p) => [p, "latest"]));
    files.push({ path: "package.json", language: "json", purpose: "Dependencies. Replace latest with the versions that worked in your first build.", content: JSON.stringify({ name: s.name, version: s.version, private: true, type: "module", scripts: { build: "tsc", start: "node dist/server.js" }, dependencies: deps, devDependencies: { typescript: "latest", "@types/node": "latest" } }, null, 2) + "\n" });
    files.push({ path: "tsconfig.json", language: "json", purpose: "TypeScript settings.", content: JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", outDir: "dist", strict: true, esModuleInterop: true, skipLibCheck: true }, include: ["src"] }, null, 2) + "\n" });
    files.push({ path: "Dockerfile", language: "dockerfile", purpose: "Container image.", content: `FROM node:22-slim\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install\nCOPY . .\nRUN npm run build\nUSER node\nEXPOSE 8080\nCMD ["node", "dist/server.js"]\n` });
  }
  if (a.build.language !== "spec") files.push({ path: ".env.example", language: "text", purpose: "The variables the agent reads.", content: ENV_EXAMPLE(s, a.build.language === "typescript") });
  files.push({ path: "README.md", language: "markdown", purpose: "How to run it and what to check before production.", content: readme(s, [...files.map((f) => f.path), "README.md"]) });
  return files;
}
