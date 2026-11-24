/**
 * The MCP routes of the control plane, and the mapping between what they send and what the console works with. The server stores a tool's source as one
 * flat object with the fields a kind does not use left null; the console works with one shape per kind. Nothing here keeps state.
 */
import { http } from "@/lib/api/client";
import type { Grant, Principal, PrincipalKind, ToolScope } from "../mcp-access";
import type { McpField, McpServerSpec, McpTool, ToolSource } from "../mcp-model";

type J = Record<string, any>;
const base = (orgId: string) => `/api/v1/orgs/${encodeURIComponent(orgId)}/mlops`;

export function toSource(j: J | null | undefined): ToolSource {
  switch (j?.kind) {
    case "http": return { kind: "http", method: j.method === "POST" ? "POST" : "GET", url: j.url ?? "", secretName: j.secretName ?? undefined };
    case "sql": return { kind: "sql", connectionId: j.connectionId ?? "", query: j.query ?? "" };
    case "model": return { kind: "model", alias: j.alias ?? "", instruction: j.instruction ?? "" };
    default: return { kind: "pipeline", pipelineId: j?.pipelineId ?? "", waitSeconds: j?.waitSeconds ?? 0 };
  }
}

export function fromSource(s: ToolSource): J {
  const none = { pipelineId: null, waitSeconds: null, method: null, url: null, secretName: null, connectionId: null, query: null, alias: null, instruction: null };
  switch (s.kind) {
    case "pipeline": return { ...none, kind: "pipeline", pipelineId: s.pipelineId, waitSeconds: s.waitSeconds };
    case "http": return { ...none, kind: "http", method: s.method, url: s.url, secretName: s.secretName || null };
    case "sql": return { ...none, kind: "sql", connectionId: s.connectionId, query: s.query };
    case "model": return { ...none, kind: "model", alias: s.alias, instruction: s.instruction };
  }
}

export const toField = (j: J): McpField => ({ name: j.name ?? "", type: j.type ?? "string", required: !!j.required, description: j.description ?? "", ...(j.options?.length ? { options: j.options } : {}) });
export const toTool = (j: J): McpTool => ({ id: j.id, name: j.name ?? "", description: j.description ?? "", fields: (j.fields ?? []).map(toField), source: toSource(j.source), effect: j.effect === "changes" ? "changes" : "reads", approval: !!j.approval });
export const fromTool = (t: McpTool): J => ({ id: t.id, name: t.name, description: t.description, fields: t.fields.map((f) => ({ name: f.name, type: f.type, required: f.required, description: f.description, options: f.options?.length ? f.options : null })), source: fromSource(t.source), effect: t.effect, approval: t.approval });

export const toServer = (j: J): McpServerSpec => ({
  id: j.id, name: j.name, slug: j.slug, description: j.description ?? "", env: j.env, auth: j.auth, tools: (j.tools ?? []).map(toTool), ratePerMinute: j.ratePerMinute,
  audit: j.audit === "arguments" ? "arguments" : "metadata", redactResults: !!j.redactResults, status: j.status === "published" ? "published" : "draft", version: j.version ?? 0,
  createdAt: j.createdAt, updatedAt: j.updatedAt, demo: false,
});

export const toPrincipal = (j: J): Principal => ({ kind: j.kind as PrincipalKind, id: j.id, label: j.label ?? j.id, ...(j.detail ? { detail: j.detail } : {}) });

export const toGrant = (j: J, serverRate = 0): Grant => ({
  id: j.id, serverId: j.serverId, principal: toPrincipal(j.principal ?? {}), tools: j.tools === "all" || !Array.isArray(j.tools) ? "all" : j.tools, scope: j.scope === "changes" ? "changes" : "reads",
  ratePerMinute: j.ratePerMinute ?? serverRate, expiresAt: j.expiresAt ?? undefined, note: j.note ?? "", createdBy: j.createdBy ?? "", createdAt: j.createdAt,
  status: j.status === "revoked" ? "revoked" : "active", revokedAt: j.revokedAt ?? undefined, key: j.key ? { prefix: j.key.prefix, issuedAt: j.key.issuedAt } : undefined,
});

export type ServerPatch = Partial<Pick<McpServerSpec, "name" | "slug" | "description" | "auth" | "tools" | "ratePerMinute" | "audit" | "redactResults">>;
export const fromPatch = (p: ServerPatch): J => ({
  ...(p.name !== undefined ? { name: p.name } : {}), ...(p.slug !== undefined ? { slug: p.slug } : {}), ...(p.description !== undefined ? { description: p.description } : {}),
  ...(p.auth !== undefined ? { auth: p.auth } : {}), ...(p.tools !== undefined ? { tools: p.tools.map(fromTool) } : {}), ...(p.ratePerMinute !== undefined ? { ratePerMinute: p.ratePerMinute } : {}),
  ...(p.audit !== undefined ? { audit: p.audit } : {}), ...(p.redactResults !== undefined ? { redactResults: p.redactResults } : {}),
});

export type GrantFields = { principal: Principal; tools: "all" | string[]; scope: ToolScope; ratePerMinute: number; expiresInDays: number | null; note: string };

export const mcpApi = {
  list: async (org: string) => (await http.get<J[]>(`${base(org)}/mcp-servers`)).map(toServer),
  get: async (org: string, id: string) => toServer(await http.get<J>(`${base(org)}/mcp-servers/${encodeURIComponent(id)}`)),
  create: async (org: string, i: { name: string; env: McpServerSpec["env"]; auth: McpServerSpec["auth"]; copyOf?: string; tools?: McpTool[] }) =>
    toServer(await http.post<J>(`${base(org)}/mcp-servers`, { name: i.name, env: i.env, auth: i.auth, copyOf: i.copyOf ?? null, tools: i.copyOf ? null : (i.tools ?? []).map(fromTool) })),
  update: async (org: string, id: string, p: ServerPatch) => toServer(await http.put<J>(`${base(org)}/mcp-servers/${encodeURIComponent(id)}`, fromPatch(p))),
  publish: async (org: string, id: string) => toServer(await http.post<J>(`${base(org)}/mcp-servers/${encodeURIComponent(id)}:publish`)),
  unpublish: async (org: string, id: string) => toServer(await http.post<J>(`${base(org)}/mcp-servers/${encodeURIComponent(id)}:unpublish`)),
  remove: (org: string, id: string) => http.delete(`${base(org)}/mcp-servers/${encodeURIComponent(id)}`),
  grants: async (org: string, id: string, serverRate = 0) => (await http.get<J[]>(`${base(org)}/mcp-servers/${encodeURIComponent(id)}/grants`)).map((g) => toGrant(g, serverRate)),
  grant: async (org: string, id: string, g: GrantFields, serverRate = 0) => {
    const r = await http.post<{ grant: J; key?: string | null }>(`${base(org)}/mcp-servers/${encodeURIComponent(id)}/grants`, {
      principal: { kind: g.principal.kind, id: g.principal.id, label: g.principal.label, detail: g.principal.detail ?? null }, tools: g.tools, scope: g.scope,
      ratePerMinute: g.ratePerMinute, expiresInDays: g.expiresInDays, note: g.note.trim(),
    });
    return { grant: toGrant(r.grant, serverRate), key: r.key ?? undefined };
  },
  revoke: async (org: string, id: string, grantId: string, serverRate = 0) => toGrant(await http.post<J>(`${base(org)}/mcp-servers/${encodeURIComponent(id)}/grants/${encodeURIComponent(grantId)}:revoke`), serverRate),
  rotate: async (org: string, id: string, grantId: string, serverRate = 0) => {
    const r = await http.post<{ grant: J; key: string }>(`${base(org)}/mcp-servers/${encodeURIComponent(id)}/grants/${encodeURIComponent(grantId)}:rotateKey`);
    return { grant: toGrant(r.grant, serverRate), key: r.key };
  },
  principals: async (org: string, kind: PrincipalKind, q: string) => (await http.get<J[]>(`${base(org)}/mcp-principals`, { kind, q })).map(toPrincipal),
};
