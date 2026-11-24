import { agentSpec, briefingSpec, mcpAgentSpec, paymentSpec, prodSpec, releaseSpec } from "./fixtures";
import { autoLayoutSpec, clone, newSpec, type PipelineSpec } from "./spec";
import { USE_CASE_TEMPLATES } from "./usecase-templates";
import type { Env } from "./types";

export type Template = { id: string; title: string; summary: string; story: string; build: () => PipelineSpec; defaultEnv: Env; tags: string[] };

export const TEMPLATES: Template[] = [
  { id: "blank", title: "Blank pipeline", summary: "Start from nothing and add operators yourself.", story: "For people who know what they want.", build: () => newSpec("new-pipeline", "development"), defaultEnv: "development", tags: ["empty"] },
  { id: "release", title: "Build, validate, register, canary", summary: "Source to image, license and architecture checks, registry entry, canary on KServe, verification and promotion.", story: "The standard release path for a model that already trains elsewhere.", build: releaseSpec, defaultEnv: "staging", tags: ["serving", "canary", "build agent"] },
  { id: "prod-promote", title: "Promote to production with approval", summary: "Take an approved registry version, wait for an approver, canary, verify and promote.", story: "Production changes always pass an approval gate and keep a rollback path.", build: prodSpec, defaultEnv: "production", tags: ["production", "approval"] },
  { id: "retrieval", title: "Retrieval assistant", summary: "Ingest documents, store, embed, index in a vector store, retrieve and serve an agent through the gateway.", story: "Connects object storage, an embedding endpoint, a vector store and the tok\u2211ner gateway.", build: agentSpec, defaultEnv: "staging", tags: ["retrieval", "agent", "vector"] },
  { id: "briefing", title: "Scheduled briefing agent", summary: "Every weekday morning, read the calendar and mailbox inside business hours, ask a model for a briefing, and save a draft email after approval.", story: "Shows triggers, a business-hours clock, calendar and mail connections, a model call through the gateway and an approval before anything is sent.", build: briefingSpec, defaultEnv: "staging", tags: ["agent", "schedule", "email", "calendar"] },
  { id: "payment-link", title: "Payment link agent", summary: "Receive an order, create a payment with MTN MoMo, Orange Money, PayPal, a card provider, Bitcoin or your own provider, text the customer the link and wait for confirmation.", story: "Swap the collect step for any other payment operator. The rest stays the same: the order comes in signed, the link goes out, and nothing is fulfilled until the provider confirms the payment.", build: paymentSpec, defaultEnv: "staging", tags: ["payments", "link", "mobile money", "card", "bitcoin"] },
  { id: "mcp-agent", title: "Tool-using agent with MCP", summary: "Search through an MCP server, ask a model for a proposal, wait for approval, then call a second tool that changes data.", story: "Shows the MCP connection, an approved tool list, a read tool, a model call through the gateway and a write tool that cannot run without a person.", build: mcpAgentSpec, defaultEnv: "staging", tags: ["agent", "mcp", "tools", "approval"] },
];

/** Create a spec from a template for an environment. Connections are cleared, never copied across environments. */
export function fromTemplate(id: string, env: Env, name: string): PipelineSpec {
  const t = TEMPLATES.find((x) => x.id === id) ?? USE_CASE_TEMPLATES.find((x) => x.id === id) ?? TEMPLATES[0];
  const s = clone(t.build());
  s.environment = env;
  s.metadata = { ...s.metadata, name };
  s.nodes = s.nodes.map((n) => ({ ...n, connection: undefined }));
  return id === "blank" ? s : autoLayoutSpec(s);
}
