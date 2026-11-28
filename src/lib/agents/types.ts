import type { ForgeSpec } from "./codegen";
import type { MemoryConfig } from "./memory";
import type { Execution } from "./execution";
import type { SwitchEvent } from "./autoswitch";
import type { Binding } from "./connectors";
import type { NetworkConfig } from "./network";

/** Governed: every call passes through the gateway. Observed: the agent reports what it did. Inventory: registered by hand, nothing measured. (docs/47, section 4) */
export type ControlLevel = "governed" | "observed" | "inventory";
export type AgentState = "active" | "suspended" | "retired";
export type Risk = "low" | "medium" | "high";
export type StepKind = "llm" | "tool" | "mcp" | "retrieval" | "delegation" | "memory" | "guardrail" | "eval";

export type ToolGrant = { server: string; tool: string; sensitive: boolean; approval: boolean };

export type Agent = {
  id: string;
  /** Lowercase name. With the organisation it forms the agent URI. */
  name: string;
  title: string;
  description: string;
  owner: string;
  department: string;
  /** An adapter id from lib/agents/adapters.ts, or "custom". */
  framework: string;
  runtime: "kubernetes" | "cloud" | "external";
  environment: "production" | "staging" | "development";
  risk: Risk;
  version: string;
  state: AgentState;
  control: ControlLevel;
  origin: "forge" | "registered";
  models: string[];
  tools: ToolGrant[];
  capabilities: string[];
  budget: { monthlyUsd: number; spentUsd: number };
  /** The last 30 days, oldest first. */
  daily: { executions: number; failures: number; costUsd: number; tokens: number }[];
  p95Ms: number;
  lastSeen: string;
  createdAt: string;
  versions: { version: string; at: string; note: string }[];
  /** Present when the agent was built in Agent Forge. */
  spec?: ForgeSpec;
  /** Present for a registered agent. */
  endpoint?: string;
  /** What the agent remembers and where. Absent means it keeps nothing between runs. */
  memory?: MemoryConfig;
  /** The shape of the process and what starts a run. Absent for an agent registered by hand, where tok∑ner does not run anything. */
  execution?: Execution;
  /** The settings from before the last runtime switch, kept so the switch can be undone. Cleared by the next change to how the agent runs. */
  lastSwitch?: { from: Execution; to: string; strategy: string; at: string };
  /** When the agent last changed runtime (on the sample clock) and the recent changes with the reason for each, whether a person or a rule made them. */
  switching?: { lastSwitchSim?: number; log: SwitchEvent[] };
  /** How the agent is reached and what it may reach: reach, ingress, egress and logging. Absent means no network setup, and the agent is open to anyone in the organisation. */
  network?: NetworkConfig;
  /** The project in Tenant Management this agent belongs to. RAG indexes open to a project are open to its agents. */
  project?: string;
  /** The connections, channels and RAG indexes from the organisation that this agent uses. Some bindings follow from how it starts and who decides. */
  bindings?: Binding[];
};

export type AttrValue = string | number | boolean;
export type LogLevel = "debug" | "info" | "warn" | "error";
export type SpanLog = { atMs: number; level: LogLevel; msg: string };
/**
 * One unit of work inside a trace. Ids follow W3C Trace Context so any OpenTelemetry or Zipkin tool can read an export:
 * a span id is 16 lowercase hex characters, and every span names the agent that did the work. A span that hands work to another agent
 * is a delegation span, and the other agent's root span is its child. That parent link is what lets one trace cross agents.
 */
export type Span = {
  id: string; parent: string | null; agentId: string; name: string; kind: StepKind;
  /** Milliseconds from the start of the trace, not from the start of the agent. */
  startMs: number; durMs: number; costUsd: number; tokens: number; status: "ok" | "error"; detail?: string;
  attrs?: Record<string, AttrValue>; logs?: SpanLog[];
};
export type Trace = {
  /** The trace id: 32 lowercase hex characters, the same one carried in the TAP traceparent header. */
  id: string;
  /** Ties together everything done for one business request, across traces. A workflow run, an evaluation run or a retry shares one. */
  correlationId: string;
  session: string;
  /** The agent that began the trace. */
  agentId: string;
  /** Every agent that took part, in the order each first appeared. */
  agentIds: string[];
  startedAt: string; durationMs: number; costUsd: number; tokens: number; status: "ok" | "error"; trigger: string; behalfOf: string;
  kind: "run" | "eval";
  /** How many agents deep the longest chain goes. Messages may nest at most MAX_DEPTH. */
  depth: number;
  evalRunId?: string; caseId?: string; workflowId?: string;
  spans: Span[];
};

export type WorkflowPattern = "sequential" | "parallel" | "supervisor";
export type Workflow = {
  id: string; name: string; description: string; pattern: WorkflowPattern;
  /** Agent ids. For a supervisor workflow the first is the supervisor and the rest are the agents it may direct. */
  agents: string[];
  timeoutSec: number; budgetUsd: number; owner: string; createdAt: string;
  runs: WorkflowRun[];
};
export type WorkflowRun = { id: string; startedAt: string; durationMs: number; costUsd: number; status: "succeeded" | "failed" | "canceled" | "running"; steps: { agentId: string; durMs: number; costUsd: number; status: "ok" | "error" | "skipped" }[] };

export const CONTROL_LABEL: Record<ControlLevel, string> = { governed: "Governed", observed: "Observed", inventory: "Inventory" };
export const CONTROL_HELP: Record<ControlLevel, string> = {
  governed: "Model and tool calls pass through tok∑ner, so policy, budget and approval decide before each call and a suspend takes effect on the next call.",
  observed: "The agent reports what it did over OpenTelemetry. tok∑ner sees it but cannot stop it. A suspend is advice the agent may ignore.",
  inventory: "Registered by hand. tok∑ner knows who owns it and what it is for, and nothing more.",
};
