/**
 * The AI canvas: how a model reaches the people and agents that use it. Pure functions, no React and no storage, so the same rules run in the
 * console and in the Node checks. The picture has four columns:
 *
 *   Models              what answers: a model hosted on your infrastructure, your own endpoint, or a vendor
 *   Gateway             the one endpoint in front, with policy, budgets and routing
 *   MCP servers         the tool servers that call a model through the gateway
 *   Who may call        the people, groups, applications and service accounts with a grant on a server
 *
 * A hosted model and the provider that fronts it are one node, because to the person looking they are one thing.
 */
import type { Deployment, Health } from "./types";
import type { McpServerSpec } from "./mcp-model";
import type { Grant, PrincipalKind } from "./mcp-access";
import { isExpired } from "./mcp-access";
import type { Provider } from "@/lib/gateway/data";

export type ModelKind = "hosted" | "own" | "vendor";
export type NodeKind = ModelKind | "gateway" | "mcp" | "callers";

export const KIND_COLOR: Record<NodeKind, string> = { hosted: "#0E9F77", own: "#2563EB", vendor: "#C2761A", gateway: "#07191E", mcp: "#7C3AED", callers: "#64748B" };
export const KIND_LABEL: Record<NodeKind, string> = {
  hosted: "Hosted on your infrastructure", own: "Your own endpoint", vendor: "Vendor model", gateway: "tok∑ner gateway", mcp: "MCP server", callers: "Who may call",
};

export type CanvasNode = {
  id: string; kind: NodeKind; column: 0 | 1 | 2 | 3; label: string; sub: string;
  health?: Health | "draft" | "down" | "degraded"; /** The provider id behind a model node, when it is in the gateway. */ providerId?: string; deploymentId?: string; serverId?: string;
  /** A hosted model that is not in the gateway yet. */ outside?: boolean; href?: string;
};
export type CanvasEdge = { id: string; from: string; to: string; kind: NodeKind; dashed?: boolean; note?: string };
export type Finding = { level: "warn" | "info"; text: string; action?: "add-to-gateway" | "publish" | "expose"; ref?: string };
export type Canvas = { nodes: CanvasNode[]; edges: CanvasEdge[]; findings: Finding[]; counts: Record<NodeKind, number> };

export const GATEWAY_ID = "gateway";

/** Whether a provider is one the customer runs or owns, as opposed to a vendor's hosted API. */
export function providerKind(p: Pick<Provider, "kind" | "selfHosted">): ModelKind {
  return p.selfHosted || p.kind === "Self-hosted" || p.kind === "OpenAI-compatible" ? "own" : "vendor";
}

/** The provider id a model tool names: a tool alias of the form `provider/model` points at one provider, any other alias is resolved by the gateway. */
export const aliasProvider = (alias: string, providers: { id: string }[]): string | null => {
  const head = alias.split("/")[0];
  return alias.includes("/") && providers.some((p) => p.id === head) ? head : null;
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "model";
/** The provider id a hosted model would take when it is added to the gateway. */
export const providerIdFor = (d: Pick<Deployment, "name">) => slug(d.name);

const PLURAL: Record<PrincipalKind, [string, string]> = { user: ["person", "people"], group: ["group", "groups"], app: ["application", "applications"], "service-account": ["service account", "service accounts"] };

export function buildCanvas(i: { deployments: Deployment[]; providers: Provider[]; servers: McpServerSpec[]; grants: Grant[] }): Canvas {
  const nodes: CanvasNode[] = []; const edges: CanvasEdge[] = []; const findings: Finding[] = [];
  const provIds = new Set(i.providers.map((p) => p.id));

  // A deployment is fronted by a provider when it says so, or when a provider carries the id it would get.
  const fronted = new Map<string, string>(); // provider id -> deployment id
  const depProvider = new Map<string, string>();
  for (const d of i.deployments) {
    const pid = d.exposure?.providerId && provIds.has(d.exposure.providerId) ? d.exposure.providerId : provIds.has(providerIdFor(d)) ? providerIdFor(d) : "";
    if (pid && !fronted.has(pid)) { fronted.set(pid, d.id); depProvider.set(d.id, pid); }
  }

  for (const d of i.deployments) {
    const pid = depProvider.get(d.id); const p = pid ? i.providers.find((x) => x.id === pid) : undefined;
    const llm = !!d.accelerator || !!d.exposure?.providerId || !!d.exposure?.mcpServerId || !!p;
    if (!llm) continue; // the picture is about models an agent can ask: a classifier with no accelerator and no gateway route is left off
    nodes.push({
      id: `d:${d.id}`, kind: "hosted", column: 0, label: d.name, sub: `${d.env}, ${d.runtime}${d.accelerator ? `, ${d.accelerator.count} x ${d.accelerator.gpu}` : ""}`,
      health: d.health, providerId: pid, deploymentId: d.id, outside: !pid, href: `/mlops/deployments/${d.id}`,
    });
    if (pid) edges.push({ id: `e:d:${d.id}`, from: `d:${d.id}`, to: GATEWAY_ID, kind: "hosted" });
    else edges.push({ id: `e:d:${d.id}`, from: `d:${d.id}`, to: GATEWAY_ID, kind: "hosted", dashed: true });
  }
  for (const p of i.providers) {
    if (fronted.has(p.id)) continue;
    const k = providerKind(p);
    nodes.push({ id: `p:${p.id}`, kind: k, column: 0, label: p.name, sub: `${p.kind}, ${p.region}`, health: p.status, providerId: p.id, href: `/providers/${p.id}` });
    edges.push({ id: `e:p:${p.id}`, from: `p:${p.id}`, to: GATEWAY_ID, kind: k });
  }
  const modelNodes = nodes.filter((n) => n.column === 0);
  const nProv = i.providers.length;
  nodes.push({ id: GATEWAY_ID, kind: "gateway", column: 1, label: "tok∑ner gateway", sub: `${nProv} ${nProv === 1 ? "provider" : "providers"}, one endpoint`, href: "/providers" });

  const live = i.grants.filter((g) => g.status === "active" && !isExpired(g));
  for (const s of i.servers) {
    const modelTools = s.tools.filter((t) => t.source.kind === "model");
    const health: CanvasNode["health"] = s.status === "published" ? "healthy" : "draft";
    nodes.push({ id: `s:${s.id}`, kind: "mcp", column: 2, label: s.name, sub: `${s.tools.length} ${s.tools.length === 1 ? "tool" : "tools"}${modelTools.length ? `, ${modelTools.length} ask a model` : ""}, ${s.status === "published" ? `v${s.version}` : "draft"}`, health, serverId: s.id, href: `/mlops/mcp-servers/${s.id}` });
    if (modelTools.length) edges.push({ id: `e:s:${s.id}`, from: GATEWAY_ID, to: `s:${s.id}`, kind: "mcp" });
    if (modelTools.length && s.status !== "published") findings.push({ level: "warn", text: `${s.name} has ${modelTools.length} ${modelTools.length === 1 ? "tool that asks a model" : "tools that ask a model"} but is a draft, so no agent can call it yet.`, action: "publish", ref: s.id });
    const mine = live.filter((g) => g.serverId === s.id);
    const byKind = new Map<PrincipalKind, number>(); for (const g of mine) byKind.set(g.principal.kind, (byKind.get(g.principal.kind) ?? 0) + 1);
    for (const [k, n] of byKind) edges.push({ id: `e:c:${s.id}:${k}`, from: `s:${s.id}`, to: `c:${k}`, kind: "callers", note: String(n) });
    if (s.status === "published" && mine.length === 0) findings.push({ level: "info", text: `${s.name} is published and nobody has a grant on it. A server is closed until someone is given access.`, ref: s.id });
  }
  const total = new Map<PrincipalKind, number>(); for (const g of live) total.set(g.principal.kind, (total.get(g.principal.kind) ?? 0) + 1);
  for (const k of ["user", "group", "app", "service-account"] as PrincipalKind[]) {
    const n = total.get(k); if (!n) continue;
    nodes.push({ id: `c:${k}`, kind: "callers", column: 3, label: `${n} ${PLURAL[k][n === 1 ? 0 : 1]}`, sub: "with a grant" });
  }

  const outside = modelNodes.filter((n) => n.outside);
  if (outside.length) findings.push({ level: "info", text: `${outside.length} hosted ${outside.length === 1 ? "model is" : "models are"} not in the gateway, so applications cannot reach ${outside.length === 1 ? "it" : "them"} through the one endpoint.`, action: "add-to-gateway", ref: outside[0].deploymentId });
  for (const n of modelNodes) if (n.health === "degraded" || n.health === "failed" || n.health === "down" || n.health === "attention") findings.push({ level: "warn", text: `${n.label} is ${n.health === "attention" ? "needing attention" : n.health}.`, ref: n.id });

  const counts = { hosted: 0, own: 0, vendor: 0, gateway: 1, mcp: 0, callers: 0 } as Record<NodeKind, number>;
  for (const n of nodes) if (n.kind !== "gateway") counts[n.kind]++;
  return { nodes, edges, findings, counts };
}

/** Everything a node touches, so pointing at one lights the whole path and dims the rest. A model reaches the servers that name its provider, and the servers that use a gateway alias. */
export function pathFrom(c: Canvas, id: string, i: { servers: McpServerSpec[]; providers: Provider[] }, strict = false): Set<string> {
  const out = new Set<string>([id]); const node = c.nodes.find((n) => n.id === id); if (!node) return out;
  const serversOf = (pid: string | undefined) => i.servers.filter((s) => s.tools.some((t) => {
    if (t.source.kind !== "model") return false; const ap = aliasProvider(t.source.alias, i.providers); return ap ? ap === pid : !strict;
  }));
  const down = (sid: string) => { out.add(`s:${sid}`); c.edges.filter((e) => e.from === `s:${sid}`).forEach((e) => { out.add(e.id); out.add(e.to); }); };
  if (node.column === 0) {
    out.add(GATEWAY_ID); c.edges.filter((e) => e.from === id).forEach((e) => out.add(e.id));
    if (node.providerId) for (const s of serversOf(node.providerId)) { out.add(`e:s:${s.id}`); down(s.id); }
  } else if (node.id === GATEWAY_ID) {
    c.nodes.forEach((n) => { if (n.column === 0 || n.column === 2) out.add(n.id); });
    c.edges.forEach((e) => { if (e.to === GATEWAY_ID || e.from === GATEWAY_ID) out.add(e.id); }); c.edges.filter((e) => e.from.startsWith("s:")).forEach((e) => { out.add(e.id); out.add(e.to); });
  } else if (node.column === 2 && node.serverId) {
    out.add(GATEWAY_ID); c.edges.filter((e) => e.to === id || e.from === id).forEach((e) => { out.add(e.id); out.add(e.from); out.add(e.to); });
    const s = i.servers.find((x) => x.id === node.serverId);
    if (s) for (const t of s.tools) if (t.source.kind === "model") { const ap = aliasProvider(t.source.alias, i.providers); c.nodes.filter((n) => n.column === 0 && (ap ? n.providerId === ap : !!n.providerId)).forEach((n) => { out.add(n.id); c.edges.filter((e) => e.from === n.id).forEach((e) => out.add(e.id)); }); }
  } else if (node.column === 3) {
    c.edges.filter((e) => e.to === id).forEach((e) => { out.add(e.id); out.add(e.from); const sv = i.servers.find((x) => `s:${x.id}` === e.from); if (sv) { out.add(GATEWAY_ID); c.edges.filter((g) => g.to === e.from).forEach((g) => out.add(g.id)); } });
  }
  return out;
}

/** What a model tool needs before it can be added: a name the protocol accepts and a description a model can act on. */
export function validateExpose(i: { name: string; description: string; alias: string; serverTools: string[] }): string | null {
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(i.name)) return "Name the tool in lower case letters, digits and underscores, starting with a letter.";
  if (i.serverTools.includes(i.name)) return "This server already has a tool with that name.";
  if (i.description.trim().length < 10) return "Describe what the tool does in at least ten characters, so an agent knows when to use it.";
  if (!i.alias.trim()) return "Choose the model the tool asks.";
  return null;
}

/** Only the path through one node: its model, the gateway, the servers and the callers behind it. Used where a single model is on show. */
export function focusCanvas(c: Canvas, id: string, i: { servers: McpServerSpec[]; providers: Provider[] }): Canvas {
  const keep = pathFrom(c, id, i, true);
  const nodes = c.nodes.filter((n) => keep.has(n.id)); const edges = c.edges.filter((e) => keep.has(e.id) && keep.has(e.from) && keep.has(e.to));
  const counts = { hosted: 0, own: 0, vendor: 0, gateway: 1, mcp: 0, callers: 0 } as Record<NodeKind, number>; for (const n of nodes) if (n.kind !== "gateway") counts[n.kind]++;
  return { nodes, edges, findings: [], counts };
}
