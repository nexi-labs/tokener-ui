import type { Agent, ToolGrant } from "./types";
import { CONSOLE_CHANNEL } from "./execution";
import type { Connection, KnowledgeBase, Health } from "@/lib/mlops/types";
import type { Channel, ChannelType } from "@/lib/notifications/client";
import { integrationById } from "@/lib/mlops/catalog";
import type { IconRef } from "@/components/studio/types";
import { Mail, MessageSquare, Webhook, BookOpenText, Plug } from "lucide-react";

/**
 * Agents do not have connectors of their own. They use what the organisation already set up:
 *   - Connections from Integrations (Kafka, object stores, email providers, SMS, Slack and Teams apps, databases, MCP servers),
 *   - Notification Center channels (Slack, Teams, Discord, email and webhook destinations),
 *   - Knowledge bases (the retrieval indexes built in Knowledge).
 * A binding says which of these an agent may use, for what, and through which tool. Nothing here holds a credential: a connection keeps its secret
 * reference in the secret manager, and a channel keeps its webhook address on the server.
 */

export type ResourceKind = "connection" | "channel" | "knowledge";
export type Role = "notify" | "approval" | "trigger" | "stream" | "data" | "knowledge";
export type Binding = {
  id: string;
  kind: ResourceKind;
  /** The id of the connection, the Notification Center channel or the knowledge base. */
  ref: string;
  role: Role;
  /** The tool that uses it, for example send_email. Absent for bindings that are not a tool call. */
  tool?: string;
  note?: string;
  /** Declared on the agent, or worked out from how it starts and who decides. */
  origin: "declared" | "derived";
};

export const ROLE_LABEL: Record<Role, string> = { notify: "Notifies", approval: "Asks for decisions", trigger: "Started by", stream: "Reads a stream", data: "Reads and writes data", knowledge: "Retrieves from" };

// ---------------------------------------------------------------------------------------------------------------------------------------
// The notification tools. They are served by a tok∑ner server, like the memory tools, so every framework calls them the same way and each call
// goes through the gateway, where policy, rate limits, masking and audit apply.

export const NOTIFY_SERVER = "tokener-notify";
export type NotifyTool = { name: string; description: string; sensitive: boolean; needs: "channel" | "approval-channel" | "connection"; capability?: "send-mail" | "send-sms" | "post-message" };
export const NOTIFY_TOOLS: NotifyTool[] = [
  { name: "notify_channel", description: "Post a short message to a Notification Center channel: Slack, Teams, Discord, email or a webhook.", sensitive: false, needs: "channel" },
  { name: "request_approval", description: "Ask a group for a decision in a channel that can take an answer, and wait for it. The run is saved while it waits.", sensitive: false, needs: "approval-channel" },
  { name: "send_email", description: "Send an email through an email connection, from the verified sender. Use it for people outside the organisation.", sensitive: true, needs: "connection", capability: "send-mail" },
  { name: "send_sms", description: "Send a text message through an SMS connection to a person who opted in.", sensitive: true, needs: "connection", capability: "send-sms" },
  { name: "post_message", description: "Post to a channel through a Slack or Teams app connection, as the app.", sensitive: false, needs: "connection", capability: "post-message" },
];
export const NOTIFY_TOOL = Object.fromEntries(NOTIFY_TOOLS.map((t) => [t.name, t])) as Record<string, NotifyTool>;
export const notifyGrant = (tool: string): ToolGrant => ({ server: NOTIFY_SERVER, tool, sensitive: NOTIFY_TOOL[tool]?.sensitive ?? false, approval: false });
/** Channel types that can take an answer, and so can be used to ask for a decision. */
export const DECIDING_CHANNELS: ChannelType[] = ["SLACK", "TEAMS", "EMAIL"];

// ---------------------------------------------------------------------------------------------------------------------------------------
// What the organisation has

export type HubConnection = { id: string; name: string; integrationId: string; integrationName: string; vendor: string; family: string; env: Connection["env"]; health: Health; healthDetail: string; permissions: Connection["permissions"]; capabilities: string[] };
export type HubChannel = Channel;
export type HubKnowledge = { id: string; name: string; status: KnowledgeBase["status"]; projects: string[]; requireCitations: boolean; documents: number; embedding: string; env: KnowledgeBase["env"]; stale: number };
export type Hub = { connections: HubConnection[]; channels: HubChannel[]; knowledge: HubKnowledge[] };

export function makeHub(connections: Connection[], channels: Channel[], knowledge: KnowledgeBase[]): Hub {
  return {
    connections: connections.map((c) => { const i = integrationById(c.integrationId); return { id: c.id, name: c.name, integrationId: c.integrationId, integrationName: i?.name ?? c.integrationId, vendor: i?.vendor ?? "", family: i?.family ?? "other", env: c.env, health: c.health, healthDetail: c.healthDetail, permissions: c.permissions, capabilities: c.capabilities }; }),
    channels,
    knowledge: knowledge.map((k) => ({ id: k.id, name: k.name, status: k.status, projects: k.access.projects, requireCitations: k.access.requireCitations, documents: k.stats.documents, embedding: k.embedding.model, env: k.env, stale: k.stats.staleDocuments })),
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// What an agent uses

const idOf = (kind: ResourceKind, ref: string, role: Role, tool?: string) => `${kind}:${ref}:${role}${tool ? ":" + tool : ""}`;
export const mk = (kind: ResourceKind, ref: string, role: Role, tool?: string, note?: string): Binding => ({ id: idOf(kind, ref, role, tool), kind, ref, role, tool, note, origin: "declared" });

/** The declared bindings plus the ones that follow from how the agent starts and who decides. The same resource can appear under more than one role. */
export function bindingsOf(a: Pick<Agent, "bindings" | "execution">): Binding[] {
  const out = new Map<string, Binding>();
  for (const b of a.bindings ?? []) out.set(b.id, { ...b, origin: "declared" });
  const m = a.execution?.modes;
  for (const t of m?.event?.triggers ?? []) if (t.connection) { const b = { ...mk("connection", t.connection, "trigger", undefined, `${t.kind} ${t.source}`), origin: "derived" as const }; out.set(b.id, b); }
  if (m?.streaming?.source.connection) { const b = { ...mk("connection", m.streaming.source.connection, "stream", undefined, `reads ${m.streaming.source.topic}`), origin: "derived" as const }; out.set(b.id, b); }
  if (m?.streaming?.sink?.connection) { const b = { ...mk("connection", m.streaming.sink.connection, "stream", "sink", `writes ${m.streaming.sink.topic}`), origin: "derived" as const }; out.set(b.id, b); }
  for (const c of m?.human?.channels ?? []) if (c !== CONSOLE_CHANNEL) { const b = { ...mk("channel", c, "approval", "request_approval", m!.human!.assignee), origin: "derived" as const }; out.set(b.id, b); }
  return [...out.values()];
}

export type Status = "ready" | "warning" | "problem";
export type Resolved = Binding & { name: string; subtitle: string; status: Status; problem?: string; iconKey: string; href: string; integrationId?: string; channelType?: ChannelType };

const CHANNEL_LABEL: Record<ChannelType, string> = { EMAIL: "Email", SMS: "SMS", SLACK: "Slack", TEAMS: "Microsoft Teams", DISCORD: "Discord", WEBHOOK: "Webhook" };
export const channelLabel = (t: ChannelType) => CHANNEL_LABEL[t];

export function resolve(b: Binding, hub: Hub, agent?: Pick<Agent, "environment" | "project">): Resolved {
  if (b.kind === "channel") {
    const c = hub.channels.find((x) => x.id === b.ref);
    if (!c) return { ...b, name: b.ref, subtitle: "Channel", status: "problem", problem: "This channel is not in the Notification Center any more.", iconKey: "channel", href: "/notifications" };
    return { ...b, name: c.name, subtitle: `${CHANNEL_LABEL[c.channel]} channel`, status: c.enabled ? "ready" : "problem", problem: c.enabled ? undefined : "This channel is switched off in the Notification Center, so nothing sent to it arrives.", iconKey: c.channel.toLowerCase(), href: "/notifications", channelType: c.channel };
  }
  if (b.kind === "knowledge") {
    const k = hub.knowledge.find((x) => x.id === b.ref);
    if (!k) return { ...b, name: b.ref, subtitle: "Knowledge base", status: "problem", problem: "This knowledge base does not exist any more.", iconKey: "knowledge", href: "/mlops/knowledge" };
    let status: Status = "ready"; let problem: string | undefined;
    if (k.status === "empty") { status = "problem"; problem = "This knowledge base has no documents yet, so retrieval returns nothing."; }
    else if (k.status === "degraded") { status = "warning"; problem = `Its last sync had a problem${k.stale ? ` and ${k.stale} document${k.stale === 1 ? " is" : "s are"} out of date` : ""}. Answers may be old.`; }
    else if (k.status === "indexing") { status = "warning"; problem = "It is being indexed. Some documents may not be searchable yet."; }
    if (agent?.project && k.projects.length && !k.projects.includes(agent.project)) { status = "problem"; problem = `This knowledge base is open to ${k.projects.join(", ")}, not to the project ${agent.project}. Retrieval will be refused.`; }
    return { ...b, name: k.name, subtitle: `${k.documents.toLocaleString("en-US")} documents, ${k.embedding}`, status, problem, iconKey: "knowledge", href: `/mlops/knowledge/${k.id}` };
  }
  const c = hub.connections.find((x) => x.id === b.ref);
  if (!c) return { ...b, name: b.ref, subtitle: "Connection", status: "problem", problem: "This connection is not in Integrations any more.", iconKey: "connection", href: "/mlops/integrations" };
  let status: Status = "ready"; let problem: string | undefined;
  if (c.health === "failed" || c.health === "offline") { status = "problem"; problem = `The last check failed: ${c.healthDetail}`; }
  else if (c.health === "attention") { status = "warning"; problem = c.healthDetail; }
  else if (c.health === "unknown") { status = "warning"; problem = "This connection has never been verified. Run a connectivity test in Integrations."; }
  if (agent && agent.environment === "production" && c.env !== "production") { status = status === "problem" ? status : "warning"; problem = problem ?? `This is a ${c.env} connection, and the agent runs in production.`; }
  return { ...b, name: c.name, subtitle: `${c.integrationName}, ${c.env}`, status, problem, iconKey: c.integrationId, href: "/mlops/integrations", integrationId: c.integrationId };
}

export type Issue = { level: "error" | "warning"; message: string; binding?: string };

export function validateBindings(a: Pick<Agent, "bindings" | "execution" | "tools" | "environment" | "project">, hub: Hub): Issue[] {
  const out: Issue[] = []; const err = (message: string, binding?: string) => out.push({ level: "error", message, binding }); const warn = (message: string, binding?: string) => out.push({ level: "warning", message, binding });
  const list = bindingsOf(a);
  for (const b of list) {
    const r = resolve(b, hub, a);
    if (r.status === "problem") err(`${r.name}: ${r.problem}`, b.id);
    else if (r.status === "warning") warn(`${r.name}: ${r.problem}`, b.id);
    const tool = b.tool ? NOTIFY_TOOL[b.tool] : undefined;
    if (b.role === "notify" || b.role === "approval") {
      if (!tool) { err(`${r.name}: choose which notification tool uses it.`, b.id); continue; }
      if (tool.needs === "channel" && b.kind !== "channel") err(`${tool.name} sends to a Notification Center channel, not to ${r.name}.`, b.id);
      if (tool.needs === "approval-channel") {
        if (b.kind !== "channel") err(`${tool.name} asks in a channel. ${r.name} is not one.`, b.id);
        else if (r.channelType && !DECIDING_CHANNELS.includes(r.channelType)) err(`${r.name} is a ${CHANNEL_LABEL[r.channelType]} destination. It can announce a request but cannot take the answer. Use Slack, Teams or email for decisions.`, b.id);
      }
      if (tool.needs === "connection") {
        if (b.kind !== "connection") err(`${tool.name} sends through a connection from Integrations, not through ${r.name}.`, b.id);
        else {
          const c = hub.connections.find((x) => x.id === b.ref);
          if (c && tool.capability && !c.capabilities.includes(tool.capability)) err(`${c.name} is ${c.integrationName}, which cannot ${tool.name.replace("_", " ")}. Choose a connection that can.`, b.id);
          if (c && c.permissions === "read-only") err(`${c.name} is read-only, and sending a message is a write.`, b.id);
        }
      }
    }
    if (b.role === "knowledge" && b.kind !== "knowledge") err(`${r.name} is not a knowledge base.`, b.id);
    if ((b.role === "trigger" || b.role === "stream") && b.kind !== "connection") err(`${r.name} is not a connection.`, b.id);
  }
  // A grant for a notification tool with nowhere to send, and a destination with no tool able to reach it.
  const grants = a.tools.filter((t) => t.server === NOTIFY_SERVER);
  for (const g of grants) {
    if (!NOTIFY_TOOL[g.tool]) { err(`${NOTIFY_SERVER} has no tool called ${g.tool}.`); continue; }
    if (!list.some((b) => b.tool === g.tool && (b.role === "notify" || b.role === "approval"))) warn(`The agent may call ${g.tool}, but no destination is chosen for it. Every call is refused until one is.`);
  }
  for (const b of list) if ((b.role === "notify" || b.role === "approval") && b.tool && NOTIFY_TOOL[b.tool] && !grants.some((g) => g.tool === b.tool)) warn(`${b.tool} is bound to a destination, but the agent has no grant for the tool, so it cannot send.`, b.id);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// The picture across all agents, for the Constellation and the Integrations screens.

export type UsageNode = { key: string; kind: ResourceKind; ref: string; name: string; subtitle: string; iconKey: string; status: Status; problem?: string; href: string; roles: Role[]; agentIds: string[]; channelType?: ChannelType; integrationId?: string };
export type UsageEdge = { key: string; agentId: string; nodeKey: string; roles: Role[]; tools: string[]; status: Status };

export function usage(agents: Agent[], hub: Hub): { nodes: UsageNode[]; edges: UsageEdge[] } {
  const nodes = new Map<string, UsageNode>(); const edges = new Map<string, UsageEdge>();
  for (const a of agents) {
    if (a.state === "retired") continue;
    for (const b of bindingsOf(a)) {
      const r = resolve(b, hub, a); const key = `${b.kind}:${b.ref}`;
      const n = nodes.get(key) ?? { key, kind: b.kind, ref: b.ref, name: r.name, subtitle: r.subtitle, iconKey: r.iconKey, status: r.status, problem: r.problem, href: r.href, roles: [], agentIds: [], channelType: r.channelType, integrationId: r.integrationId };
      if (!n.roles.includes(b.role)) n.roles.push(b.role);
      if (!n.agentIds.includes(a.id)) n.agentIds.push(a.id);
      if (r.status === "problem" || (r.status === "warning" && n.status === "ready")) { n.status = r.status; n.problem = r.problem; }
      nodes.set(key, n);
      const ek = `${a.id}>${key}`;
      const e = edges.get(ek) ?? { key: ek, agentId: a.id, nodeKey: key, roles: [], tools: [], status: "ready" as Status };
      if (!e.roles.includes(b.role)) e.roles.push(b.role);
      if (b.tool && !e.tools.includes(b.tool)) e.tools.push(b.tool);
      if (r.status === "problem" || (r.status === "warning" && e.status === "ready")) e.status = r.status;
      edges.set(ek, e);
    }
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

/** The icon for a resource, taken from the catalogue so it is the same brand mark as in Integrations. */
export function iconFor(n: { iconKey: string; integrationId?: string }): IconRef {
  const viaCatalogue = (id: string): IconRef | null => integrationById(id)?.icon ?? null;
  switch (n.iconKey) {
    case "slack": return viaCatalogue("slack") ?? { lucide: MessageSquare };
    case "teams": return viaCatalogue("microsoft-teams") ?? { lucide: MessageSquare };
    case "email": return { lucide: Mail };
    case "discord": return { cdn: "discord", hex: "5865F2", fallback: MessageSquare };
    case "sms": return viaCatalogue("twilio-sms") ?? { lucide: MessageSquare };
    case "webhook": return { lucide: Webhook };
    case "knowledge": return { lucide: BookOpenText };
    case "channel": case "connection": return { lucide: Plug };
    default: return n.integrationId ? viaCatalogue(n.integrationId) ?? { lucide: Plug } : { lucide: Plug };
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Where the Constellation draws them: three bands to the right of the departments, each node ordered by the height of the agents that use it so lines cross less.

export type Pt = { x: number; y: number };
export type Band = { id: ResourceKind; title: string; hint: string; x: number; y: number; w: number; h: number };
export const NODE = 64; const COLS = 3; const DX = 190; const DY = 128;
const BAND_TITLE: Record<ResourceKind, { title: string; hint: string }> = { knowledge: { title: "Knowledge", hint: "Retrieval indexes" }, channel: { title: "Notifications", hint: "Channels people read" }, connection: { title: "Connections", hint: "Systems from Integrations" } };

export function layoutResources(nodes: UsageNode[], agentPos: Record<string, Pt>, origin: Pt): { pos: Record<string, Pt>; bands: Band[] } {
  const pos: Record<string, Pt> = {}; const bands: Band[] = []; let y = origin.y;
  for (const kind of ["knowledge", "channel", "connection"] as ResourceKind[]) {
    const list = nodes.filter((n) => n.kind === kind).map((n) => ({ n, by: n.agentIds.map((id) => agentPos[id]?.y ?? 0).reduce((a, b) => a + b, 0) / Math.max(1, n.agentIds.length) })).sort((a, b) => a.by - b.by || a.n.name.localeCompare(b.n.name));
    if (!list.length) continue;
    const rows = Math.ceil(list.length / COLS); const w = DX * (COLS - 1) + 2 * 56 + NODE; const h = 80 + (rows - 1) * DY + NODE + 58;
    bands.push({ id: kind, ...BAND_TITLE[kind], x: origin.x, y, w, h });
    list.forEach(({ n }, i) => { pos[n.key] = { x: origin.x + 56 + NODE / 2 + (i % COLS) * DX, y: y + 80 + NODE / 2 + Math.floor(i / COLS) * DY }; });
    y += h + 36;
  }
  return { pos, bands };
}
