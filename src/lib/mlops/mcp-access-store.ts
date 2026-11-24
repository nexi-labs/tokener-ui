"use client";

import { useEffect, useSyncExternalStore } from "react";
import { ApiError } from "@/lib/api/client";
import { can } from "./rbac";
import { liveOrgId, mlops, useMlopsStatus } from "./store";
import { mcpApi } from "./live/mcp";
import { useMcpServers } from "./mcp-servers";
import { isExpired, needsKey, newKey, validateGrant, type Grant, type GrantInput } from "./mcp-access";
import type { McpServerSpec } from "./mcp-model";

/** MCP access grants. In the sample workspace they live in this browser like the sample servers. In a signed-in workspace they are the server's, read per server and changed only on the server's answer. The server enforces the rules on every call. */
const KEY = "tokener.mlops.mcp.access.v1";
type Result<T = {}> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const DAY = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString();

function seed(): Grant[] {
  return [
    { id: "gr-1", serverId: "mcps-support", principal: { kind: "group", id: "g-support", label: "support-agents", detail: "38 members" }, tools: ["t-order", "t-help", "t-policy"], scope: "reads", ratePerMinute: 120, note: "Support assistant lookups during live chats.", createdBy: "Maria Kowalski", createdAt: ago(18), status: "active" },
    { id: "gr-2", serverId: "mcps-support", principal: { kind: "app", id: "a-portal", label: "advisor-portal", detail: "Java client" }, tools: "all", scope: "changes", ratePerMinute: 200, note: "Portal raises refunds on behalf of agents, each one approved.", createdBy: "Maria Kowalski", createdAt: ago(12), status: "active", key: { prefix: "tok_mcp_4k9x2a", issuedAt: ago(12) } },
    { id: "gr-3", serverId: "mcps-support", principal: { kind: "user", id: "u-chen", label: "Chen Wei", detail: "ML engineer" }, tools: ["t-help"], scope: "reads", ratePerMinute: 30, expiresAt: ago(-6), note: "Evaluating retrieval quality for the help centre.", createdBy: "Ahmed Al-Sayed", createdAt: ago(24), status: "active" },
    { id: "gr-4", serverId: "mcps-support", principal: { kind: "app", id: "a-notebook", label: "notebook-sandbox", detail: "Python client" }, tools: ["t-policy"], scope: "reads", ratePerMinute: 20, note: "Prototype notebooks.", createdBy: "Ahmed Al-Sayed", createdAt: ago(40), status: "revoked", revokedAt: ago(9) },
    { id: "gr-5", serverId: "mcps-ops", principal: { kind: "service-account", id: "s-ci", label: "svc-ci", detail: "Build pipelines" }, tools: "all", scope: "reads", ratePerMinute: 60, note: "Nightly throughput report job.", createdBy: "Ahmed Al-Sayed", createdAt: ago(7), status: "active", key: { prefix: "tok_mcp_9d2m7q", issuedAt: ago(7) } },
  ];
}

let state: Grant[] | null = null;
const listeners = new Set<() => void>();
function init(): Grant[] { try { const r = localStorage.getItem(KEY); if (r) { const v = JSON.parse(r); if (Array.isArray(v)) return v as Grant[]; } } catch { /* seed */ } return seed(); }
const get = () => (state ??= init());
function set(n: Grant[]) { state = n; try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* memory only */ } listeners.forEach((l) => l()); }
const role = () => (typeof window === "undefined" ? "viewer" : (JSON.parse(localStorage.getItem("tokener.mlops.v1") ?? "{}").role ?? "developer"));
const guard = (env: McpServerSpec["env"]) => { const d = can(role(), "pipeline.edit", env); return d.ok ? null : d.reason; };
const uid = () => `gr-${Math.random().toString(16).slice(2, 10)}`;

const msg = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong. Try again.");
const subscribe = (l: () => void) => { listeners.add(l); return () => void listeners.delete(l); };
const notify = () => listeners.forEach((l) => l());

/** The signed-in workspace's grants, one list per server, loaded when the screen first needs them. */
const live: { org: string | null; byServer: Map<string, Grant[]>; asked: Set<string>; error: string | null; version: number } = { org: null, byServer: new Map(), asked: new Set(), error: null, version: 0 };
function resetFor(org: string) { if (live.org !== org) { live.org = org; live.byServer = new Map(); live.asked = new Set(); live.error = null; live.version++; } }
async function loadFor(org: string, server: { id: string; ratePerMinute: number }) {
  if (live.asked.has(server.id)) return;
  live.asked.add(server.id);
  try { const list = await mcpApi.grants(org, server.id, server.ratePerMinute); if (live.org === org) { live.byServer.set(server.id, list); live.version++; notify(); } }
  catch (e) { if (live.org === org) { live.byServer.set(server.id, []); live.error = msg(e); live.version++; notify(); } }
}
const putLive = (g: Grant) => { const l = live.byServer.get(g.serverId) ?? []; live.byServer.set(g.serverId, l.some((x) => x.id === g.id) ? l.map((x) => (x.id === g.id ? g : x)) : [g, ...l]); live.version++; notify(); };

/** Every grant known so far. In a signed-in workspace this is null until the server list has arrived, and fills in as each server's grants arrive. */
export function useMcpGrants(): Grant[] | null {
  const { mode } = useMlopsStatus();
  const org = mode === "live" ? liveOrgId() : null;
  const servers = useMcpServers();
  useEffect(() => { if (org && servers) { resetFor(org); servers.forEach((s) => void loadFor(org, s)); } }, [org, servers]);
  const v = useSyncExternalStore(subscribe, () => (org ? live.version : -1), () => -2);
  if (!org) return get();
  if (!servers || live.org !== org) return null;
  void v;
  return servers.flatMap((s) => live.byServer.get(s.id) ?? []);
}
/** Whether this server's grants have been read. Always true in the sample workspace. */
export function useMcpGrantsLoaded(serverId: string): boolean {
  const { mode } = useMlopsStatus();
  useSyncExternalStore(subscribe, () => live.version, () => 0);
  return mode !== "live" || live.byServer.has(serverId);
}
/** Why a server's grants could not be read. */
export function useMcpGrantsProblem(): string | null {
  return useSyncExternalStore(subscribe, () => live.error, () => null);
}
export const activeCount = (grants: Grant[], serverId: string) => grants.filter((g) => g.serverId === serverId && g.status === "active" && !isExpired(g)).length;

export const mcpAccess = {
  /** Creates a grant. For an application or a service account it also issues a key and returns it once. */
  async grant(server: McpServerSpec, i: GrantInput): Promise<Result<{ id: string; key?: string }>> {
    const org = liveOrgId();
    if (org) {
      try {
        const r = await mcpApi.grant(org, server.id, { principal: i.principal, tools: i.tools, scope: i.scope, ratePerMinute: i.ratePerMinute, expiresInDays: i.expiresInDays, note: i.note }, server.ratePerMinute);
        putLive(r.grant);
        return { ok: true, id: r.grant.id, key: r.key };
      } catch (e) { return fail(msg(e)); }
    }
    const g0 = guard(server.env); if (g0) return fail(g0);
    const e = validateGrant(i, server, get()); if (e) return fail(e);
    const k = needsKey(i.principal) ? newKey() : null;
    const now = new Date().toISOString();
    const g: Grant = { id: uid(), serverId: server.id, principal: i.principal, tools: i.tools, scope: i.scope, ratePerMinute: i.ratePerMinute, expiresAt: i.expiresInDays ? new Date(Date.now() + i.expiresInDays * DAY).toISOString() : undefined, note: i.note.trim(), createdBy: "you", createdAt: now, status: "active", key: k ? { prefix: k.prefix, issuedAt: now } : undefined };
    set([g, ...get()]);
    void mlops.note("mcp.access.grant", server.name, `${i.principal.label} may ${i.scope === "changes" ? "read and change" : "read"} through ${i.tools === "all" ? "all tools" : `${i.tools.length} tool${i.tools.length === 1 ? "" : "s"}`}, ${i.ratePerMinute} per minute`, server.env);
    return { ok: true, id: g.id, key: k?.value };
  },
  async revoke(server: McpServerSpec, id: string): Promise<Result> {
    const org = liveOrgId();
    if (org) { try { putLive(await mcpApi.revoke(org, server.id, id, server.ratePerMinute)); return { ok: true }; } catch (e) { return fail(msg(e)); } }
    const g0 = guard(server.env); if (g0) return fail(g0);
    const g = get().find((x) => x.id === id); if (!g) return fail("Unknown grant");
    set(get().map((x) => (x.id === id ? { ...x, status: "revoked" as const, revokedAt: new Date().toISOString() } : x)));
    void mlops.note("mcp.access.revoke", server.name, `${g.principal.label} lost access. Its key, if any, stops working at once`, server.env);
    return { ok: true };
  },
  /** Replaces the key. The old one stops working immediately; the new value is returned once. */
  async rotateKey(server: McpServerSpec, id: string): Promise<Result<{ key: string }>> {
    const org = liveOrgId();
    if (org) { try { const r = await mcpApi.rotate(org, server.id, id, server.ratePerMinute); putLive(r.grant); return { ok: true, key: r.key }; } catch (e) { return fail(msg(e)); } }
    const g0 = guard(server.env); if (g0) return fail(g0);
    const g = get().find((x) => x.id === id); if (!g || g.status !== "active") return fail("Only an active grant has a key");
    if (!needsKey(g.principal)) return fail("People and groups sign in; they do not use a key");
    const k = newKey();
    set(get().map((x) => (x.id === id ? { ...x, key: { prefix: k.prefix, issuedAt: new Date().toISOString() } } : x)));
    void mlops.note("mcp.access.rotate", server.name, `New key for ${g.principal.label}. The old key was revoked`, server.env);
    return { ok: true, key: k.value };
  },
  reset() { set(seed()); },
};
