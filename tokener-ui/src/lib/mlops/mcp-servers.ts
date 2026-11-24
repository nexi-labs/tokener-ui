"use client";

import { useEffect, useSyncExternalStore } from "react";
import { ApiError } from "@/lib/api/client";
import { can } from "./rbac";
import { liveOrgId, mlops, useMlopsStatus } from "./store";
import { mcpApi, type ServerPatch } from "./live/mcp";
import { TOOL_NAME, blankTool, errors, slugify, validateServer, type McpServerSpec, type McpTool, type ToolSource } from "./mcp-model";
import { seedServers } from "./mcp-seeds";

/**
 * The custom MCP servers. In the sample workspace they live in this browser, like the rest of the sample data, and the same model and rules run on the
 * server when it hosts them. In a signed-in workspace they are the server's: reads come from the API, edits are kept on screen at once and saved in the
 * background, and every other change waits for the server's answer. The server decides what a role may do; the buttons only mirror it.
 */
const KEY = "tokener.mlops.mcp.v1";
export type Result<T = {}> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

let state: McpServerSpec[] | null = null;
const listeners = new Set<() => void>();

function init(): McpServerSpec[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const v = JSON.parse(raw); if (Array.isArray(v)) return v as McpServerSpec[]; }
  } catch { /* fall through to the seed */ }
  return seedServers();
}
const get = () => (state ??= init());
function set(next: McpServerSpec[]) {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage may be unavailable, state stays in memory */ }
  listeners.forEach((l) => l());
}

/** The signed-in workspace's copy. Null until the first answer arrives. */
const live: { org: string | null; servers: McpServerSpec[] | null; error: string | null; saving: number; saveError: string | null } = { org: null, servers: null, error: null, saving: 0, saveError: null };
const msg = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong. Try again.");
const notify = () => listeners.forEach((l) => l());
const isLive = () => liveOrgId() !== null;
const cur = () => (isLive() ? live.servers ?? [] : get());
const subscribe = (l: () => void) => { listeners.add(l); return () => void listeners.delete(l); };

async function loadLive(org: string) {
  live.org = org; live.servers = null; live.error = null; notify();
  try { const list = await mcpApi.list(org); if (live.org === org) { live.servers = list; notify(); } }
  catch (e) { if (live.org === org) { live.servers = []; live.error = msg(e); notify(); } }
}
function replaceLive(next: McpServerSpec) { live.servers = (live.servers ?? []).map((s) => (s.id === next.id ? next : s)); notify(); }

export function useMcpServers(): McpServerSpec[] | null {
  const { mode } = useMlopsStatus();
  const org = mode === "live" ? liveOrgId() : null;
  useEffect(() => { if (org && live.org !== org) void loadLive(org); }, [org]);
  const list = useSyncExternalStore(subscribe, () => (org ? (live.org === org ? live.servers : null) : get()), () => null);
  return list;
}

/** Why the list could not be read, or why the last background save failed. Null when all is well. */
export function useMcpProblem(): string | null {
  return useSyncExternalStore(subscribe, () => live.error ?? live.saveError, () => null);
}
/** Whether edits are still being saved. */
export function useMcpSaving(): boolean {
  return useSyncExternalStore(subscribe, () => live.saving > 0, () => false);
}

// Background saving of edits. Each server keeps one patch that grows while the person types; it is sent after a short pause, one request at a time.
const pending = new Map<string, ServerPatch>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const inflight = new Map<string, Promise<void>>();
const SAVE_AFTER_MS = 700;

function schedule(org: string, id: string) {
  clearTimeout(timers.get(id));
  timers.set(id, setTimeout(() => void save(org, id), SAVE_AFTER_MS));
}
function save(org: string, id: string): Promise<void> {
  clearTimeout(timers.get(id)); timers.delete(id);
  const run = (inflight.get(id) ?? Promise.resolve()).then(async () => {
    const patch = pending.get(id); if (!patch) return;
    pending.delete(id);
    live.saving++; notify();
    try {
      const saved = await mcpApi.update(org, id, patch);
      if (live.org !== org) return;
      live.saveError = null;
      const newer = pending.get(id);
      replaceLive(newer ? { ...saved, ...newer, status: "draft" } : saved);
    } catch (e) {
      live.saveError = msg(e);
      pending.delete(id);
      if (live.org === org) { try { replaceLive(await mcpApi.get(org, id)); } catch { /* the list is reloaded on the next visit */ } }
    } finally { live.saving--; notify(); }
  });
  inflight.set(id, run);
  void run.finally(() => { if (inflight.get(id) === run) inflight.delete(id); });
  return run;
}
/** Waits for every edit that has not reached the server yet. Publishing and leaving the page call it. */
export async function flushMcpEdits(): Promise<void> {
  const org = liveOrgId(); if (!org) return;
  await Promise.all([...new Set([...pending.keys(), ...inflight.keys()])].map((id) => (pending.has(id) ? save(org, id) : inflight.get(id)!)));
}

const uid = (p: string) => `${p}-${Math.random().toString(16).slice(2, 10)}`;
const role = () => (typeof window === "undefined" ? "viewer" : (JSON.parse(localStorage.getItem("tokener.mlops.v1") ?? "{}").role ?? "developer"));

function guard(action: Parameters<typeof can>[1], env?: McpServerSpec["env"]) {
  const d = can(role(), action, env);
  return d.ok ? null : d.reason;
}

export const mcpServers = {
  async create(input: { name: string; env: McpServerSpec["env"]; auth: McpServerSpec["auth"]; copyOf?: string }): Promise<Result<{ id: string }>> {
    const org = liveOrgId();
    if (org) {
      const name = input.name.trim();
      if (name.length < 3) return fail("Give the server a name of at least three characters.");
      try {
        const made = await mcpApi.create(org, { name, env: input.env, auth: input.auth, copyOf: input.copyOf, tools: [blankTool(uid("t"))] });
        live.servers = [made, ...(live.servers ?? [])]; notify();
        return { ok: true, id: made.id };
      } catch (e) { return fail(msg(e)); }
    }
    const g = guard("pipeline.edit", input.env); if (g) return fail(g);
    const name = input.name.trim();
    if (name.length < 3) return fail("Give the server a name of at least three characters.");
    const base = input.copyOf ? get().find((s) => s.id === input.copyOf) : undefined;
    let slug = slugify(name), n = 2;
    while (get().some((s) => s.slug === slug)) slug = `${slugify(name).slice(0, 36)}-${n++}`;
    const now = new Date().toISOString();
    const spec: McpServerSpec = base
      ? { ...structuredClone(base), id: uid("mcps"), name, slug, env: input.env, auth: input.auth, status: "draft", version: 0, createdAt: now, updatedAt: now, demo: false }
      : { id: uid("mcps"), name, slug, description: "", env: input.env, auth: input.auth, tools: [blankTool(uid("t"))], ratePerMinute: 120, audit: "metadata", redactResults: true, status: "draft", version: 0, createdAt: now, updatedAt: now, demo: false };
    set([spec, ...get()]);
    mlops.note("mcp.server.create", spec.name, `${spec.tools.length} tool${spec.tools.length === 1 ? "" : "s"} in ${spec.env}`, spec.env);
    return { ok: true, id: spec.id };
  },

  /** Saves edits. A published server goes back to draft, because what clients see is no longer what was checked. In a signed-in workspace the edit shows at once and is saved in the background. */
  update(id: string, patch: Partial<Omit<McpServerSpec, "id" | "createdAt">>): Result {
    const org = liveOrgId();
    const c = cur().find((s) => s.id === id); if (!c) return fail("Unknown server");
    if (org) {
      const { status: _s, version: _v, updatedAt: _u, demo: _d, env: _e, ...sendable } = patch;
      replaceLive({ ...c, ...patch, status: "draft", updatedAt: new Date().toISOString() });
      pending.set(id, { ...pending.get(id), ...sendable });
      schedule(org, id);
      return { ok: true };
    }
    const g = guard("pipeline.edit", c.env); if (g) return fail(g);
    const next = { ...c, ...patch, updatedAt: new Date().toISOString() };
    if (c.status === "published" && !("status" in patch)) next.status = "draft";
    set(get().map((s) => (s.id === id ? next : s)));
    return { ok: true };
  },

  async publish(id: string): Promise<Result<{ version: number }>> {
    const org = liveOrgId();
    const c = cur().find((s) => s.id === id); if (!c) return fail("Unknown server");
    if (org) {
      await flushMcpEdits();
      try { const done = await mcpApi.publish(org, id); replaceLive(done); return { ok: true, version: done.version }; }
      catch (e) { return fail(msg(e)); }
    }
    const g = guard("pipeline.publish", c.env); if (g) return fail(g);
    if (c.env === "production") { const a = guard("deployment.promote", c.env); if (a) return fail("Publishing to production needs the approver role. " + a); }
    const bad = errors(validateServer(c, get()));
    if (bad.length) return fail(`${bad.length} problem${bad.length === 1 ? "" : "s"} to fix first. ${bad[0].where}: ${bad[0].text}`);
    const version = c.version + 1;
    set(get().map((s) => (s.id === id ? { ...s, status: "published", version, updatedAt: new Date().toISOString() } : s)));
    mlops.note("mcp.server.publish", c.name, `version ${version}, ${c.tools.length} tools, ${c.auth} access`, c.env);
    return { ok: true, version };
  },

  async unpublish(id: string): Promise<Result> {
    const org = liveOrgId();
    const c = cur().find((s) => s.id === id); if (!c) return fail("Unknown server");
    if (org) {
      await flushMcpEdits();
      try { replaceLive(await mcpApi.unpublish(org, id)); return { ok: true }; } catch (e) { return fail(msg(e)); }
    }
    const g = guard("pipeline.publish", c.env); if (g) return fail(g);
    set(get().map((s) => (s.id === id ? { ...s, status: "draft", updatedAt: new Date().toISOString() } : s)));
    mlops.note("mcp.server.unpublish", c.name, "taken offline", c.env);
    return { ok: true };
  },

  async remove(id: string): Promise<Result> {
    const org = liveOrgId();
    const c = cur().find((s) => s.id === id); if (!c) return fail("Unknown server");
    if (org) {
      pending.delete(id); clearTimeout(timers.get(id));
      try { await mcpApi.remove(org, id); live.servers = (live.servers ?? []).filter((s) => s.id !== id); notify(); return { ok: true }; } catch (e) { return fail(msg(e)); }
    }
    const g = guard("connection.delete", c.env); if (g) return fail(g);
    set(get().filter((s) => s.id !== id));
    mlops.note("mcp.server.delete", c.name, "deleted", c.env);
    return { ok: true };
  },

  async addTool(id: string, kind: ToolSource["kind"]): Promise<Result<{ toolId: string }>> {
    const c = cur().find((s) => s.id === id); if (!c) return fail("Unknown server");
    const t: McpTool = blankTool(uid("t"), kind);
    let name = t.name, n = 2;
    while (c.tools.some((x) => x.name === name)) name = `${t.name}_${n++}`;
    const r = mcpServers.update(id, { tools: [...c.tools, { ...t, name }] });
    return r.ok ? { ok: true, toolId: t.id } : r;
  },

  /** Adds a tool that calls a model through the gateway, which is how a deployed model is offered to MCP clients. */
  async addModelTool(id: string, t: { name: string; description: string; alias: string; instruction: string }): Promise<Result<{ toolId: string }>> {
    const c = cur().find((s) => s.id === id); if (!c) return fail("Unknown server");
    if (!TOOL_NAME.test(t.name)) return fail("Tool names start with a lowercase letter and use lowercase letters, digits and underscores");
    if (c.tools.some((x) => x.name === t.name)) return fail("This server already has a tool with that name");
    if (t.description.trim().length < 10) return fail("Describe what the tool does in at least 10 characters so clients know when to call it");
    const tool: McpTool = { ...blankTool(uid("t"), "model"), name: t.name, description: t.description.trim(), source: { kind: "model", alias: t.alias, instruction: t.instruction.trim() },
      fields: [{ name: "input", type: "string", required: true, description: "The text to send to the model" }] };
    const r = mcpServers.update(id, { tools: [...c.tools, tool] });
    if (r.ok && liveOrgId()) await flushMcpEdits();
    return r.ok ? { ok: true, toolId: tool.id } : r;
  },

  reset() { set(seedServers()); },
};
