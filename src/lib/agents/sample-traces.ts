import type { AttrValue, Agent, Span, SpanLog, Trace } from "./types";
import type { Link, Protocol } from "./topology";
import { enabledLayers } from "./memory";
import { rng } from "./sample";
import { bindingsOf, NOTIFY_SERVER, resolve, type Hub } from "./connectors";

/**
 * Builds traces for the sample workspace: single-agent runs, and runs that cross several agents through TAP, A2A, MCP or a queue.
 * Spans carry the attributes a real instrumented agent would send (gen_ai.*, mcp.*, tap.*, memory.*), so the exports are shaped like real ones.
 */

export type TraceTree = { agent: string; via?: Protocol; /** The caller does not wait. The callee starts later and is linked to the caller's span. */ async?: boolean; parallel?: boolean; children?: TraceTree[] };

const hex = (r: () => number, n: number) => Array.from({ length: n }, () => "0123456789abcdef"[Math.floor(r() * 16)]).join("");
const provider = (model: string) => (/^gpt|^o\d|openai/i.test(model) ? "openai" : /claude/i.test(model) ? "anthropic" : /gemini/i.test(model) ? "gcp.gemini" : /llama|mistral|qwen/i.test(model) ? "self-hosted" : "tokener");
const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

type Ctx = { unit: Map<string, number>; r: () => number; agents: Map<string, Agent>; spans: Span[]; used: Set<string>; failAgent: string | null; maxDepth: number; extra?: Record<string, AttrValue>; hub?: Hub };
const sid = (c: Ctx) => { let id = hex(c.r, 16); while (c.used.has(id) || /^0+$/.test(id)) id = hex(c.r, 16); c.used.add(id); return id; };
const log = (atMs: number, level: SpanLog["level"], msg: string): SpanLog => ({ atMs: Math.round(atMs), level, msg });

function llmSpan(c: Ctx, a: Agent, parent: string, name: string, at: number, failed: boolean): Span {
  const r = c.r; const model = a.models[0] ?? "chat-default";
  const inT = Math.round(400 + r() * 2600); const outT = Math.round(80 + r() * 700);
  const dur = Math.round(450 + r() * 1100 + outT * 0.8);
  const cost = (inT + outT * 3) * (c.unit.get(a.id) ?? 1e-6);
  return { id: sid(c), parent, agentId: a.id, name, kind: "llm", startMs: Math.round(at), durMs: failed ? Math.round(dur * 1.6) : dur, costUsd: failed ? 0 : round(cost), tokens: failed ? 0 : inT + outT, status: failed ? "error" : "ok",
    detail: failed ? "Model call timed out" : undefined,
    attrs: { "gen_ai.system": provider(model), "gen_ai.request.model": model, "gen_ai.operation.name": "chat", ...(failed ? {} : { "gen_ai.usage.input_tokens": inT, "gen_ai.usage.output_tokens": outT }), "tokener.gateway": a.control === "governed" },
    logs: [log(at, "debug", `chat ${model}`), ...(failed ? [log(at + dur * 1.6, "error", "Model call timed out after 30s")] : [])] };
}

/** Which connection or channel a notification tool call went to, so the Constellation can light up that destination. */
function connectorAttrs(c: Ctx, a: Agent, server: string, tool: string): Record<string, AttrValue> {
  if (server !== NOTIFY_SERVER) return {};
  const b = bindingsOf(a).find((x) => x.tool === tool && (x.role === "notify" || x.role === "approval")); if (!b) return {};
  const r = c.hub ? resolve(b, c.hub, a) : null;
  return { "connector.key": `${b.kind}:${b.ref}`, "connector.kind": b.kind, "connector.name": r?.name ?? b.ref, ...(r?.subtitle ? { "connector.type": r.subtitle } : {}) };
}
function knowledgeAttrs(c: Ctx, a: Agent): Record<string, AttrValue> {
  const b = bindingsOf(a).filter((x) => x.role === "knowledge"); if (!b.length) return { "retrieval.index": "handbook" };
  const x = b[Math.floor(c.r() * b.length)]; const r = c.hub ? resolve(x, c.hub, a) : null;
  return { "retrieval.index": r?.name ?? x.ref, "knowledge.key": `knowledge:${x.ref}`, "knowledge.base": x.ref };
}

function runAgent(c: Ctx, node: TraceTree, parent: string | null, startMs: number, depth: number): { endMs: number; failed: boolean; rootId: string } {
  const r = c.r; const a = c.agents.get(node.agent)!;
  const rootId = sid(c);
  const root: Span = { id: rootId, parent, agentId: a.id, name: `${a.title} run`, kind: "delegation", startMs: Math.round(startMs), durMs: 0, costUsd: 0, tokens: 0, status: "ok",
    attrs: { "agent.name": a.name, "agent.version": a.version, "agent.framework": a.framework, "tokener.control": a.control, "tap.depth": depth, ...(c.extra ?? {}) },
    logs: [log(startMs, "info", `Run started on ${a.name} ${a.version}`)] };
  c.spans.push(root);
  let cursor = startMs + 4 + Math.floor(r() * 10);
  const kids = node.children ?? [];
  const body = 1 + Math.floor(r() * 3);
  const failHere = c.failAgent === a.id;
  const failStep = failHere ? Math.floor(r() * (body + 1)) : -1;
  let failed = false;

  const push = (s: Span) => { c.spans.push(s); cursor = s.startMs + s.durMs + Math.floor(r() * 30); if (s.status === "error") failed = true; return s; };

  push(llmSpan(c, a, rootId, "Plan the work", cursor, failStep === 0));
  const layers = enabledLayers(a.memory);
  if (!failed && layers.length && r() < 0.8) {
    const l = layers[Math.floor(r() * layers.length)]; const hits = Math.floor(r() * 5);
    const d = Math.round(18 + r() * 90);
    push({ id: sid(c), parent: rootId, agentId: a.id, name: "memory.recall", kind: "memory", startMs: Math.round(cursor), durMs: d, costUsd: 0, tokens: 0, status: "ok",
      attrs: { "mcp.server": "tokener-memory", "mcp.tool": "recall", "memory.layer": l.kind, "memory.backend": l.backend, "memory.hits": hits, "memory.top_k": l.topK },
      logs: [log(cursor, "debug", `Recall from ${l.kind} memory, ${hits} of ${l.topK} items above ${l.minScore}`)] });
  }
  if (!failed && a.control === "governed") {
    push({ id: sid(c), parent: rootId, agentId: a.id, name: "Policy check", kind: "guardrail", startMs: Math.round(cursor), durMs: Math.round(3 + r() * 14), costUsd: 0, tokens: 0, status: "ok",
      attrs: { "policy.decision": "allow", "policy.rules_evaluated": 3 + Math.floor(r() * 5) }, logs: [log(cursor, "debug", "Budget, rate limit and approval rules passed")] });
  }
  for (let s = 1; s <= body && !failed; s++) {
    const bad = failStep === s;
    const pick = r();
    const tool = a.tools.length ? a.tools[Math.floor(r() * a.tools.length)] : null;
    if (pick < 0.45 && tool) {
      const d = Math.round(120 + r() * 900) * (bad ? 2 : 1);
      push({ id: sid(c), parent: rootId, agentId: a.id, name: `${tool.server}.${tool.tool}`, kind: "mcp", startMs: Math.round(cursor), durMs: d, costUsd: 0, tokens: 0, status: bad ? "error" : "ok", detail: bad ? "Tool returned 503" : undefined,
        attrs: { "mcp.server": tool.server, "mcp.tool": tool.tool, "tokener.tool.sensitive": tool.sensitive, "tokener.tool.approval": tool.approval, ...connectorAttrs(c, a, tool.server, tool.tool) },
        logs: [log(cursor, "debug", `Call ${tool.server}.${tool.tool}`), ...(tool.approval ? [log(cursor + 2, "info", "Approval requested, a person approved")] : []), ...(bad ? [log(cursor + d, "error", "Tool returned 503 Service Unavailable")] : [])] });
    } else if (pick < 0.7) {
      const d = Math.round(160 + r() * 520) * (bad ? 2 : 1); const hits = Math.floor(r() * 8);
      push({ id: sid(c), parent: rootId, agentId: a.id, name: "Search knowledge", kind: "retrieval", startMs: Math.round(cursor), durMs: d, costUsd: round(0.0002 + r() * 0.0006), tokens: 0, status: bad ? "error" : "ok", detail: bad ? "Index unavailable" : undefined,
        attrs: { ...knowledgeAttrs(c, a), "retrieval.hits": hits }, logs: [log(cursor, "debug", `Search returned ${hits} passages`)] });
    } else {
      push(llmSpan(c, a, rootId, ["Draft the answer", "Check the answer", "Summarise findings"][Math.floor(r() * 3)], cursor, bad));
    }
    if (s === Math.ceil(body / 2) && kids.length && !failed) {
      // hand work to other agents here
      let end = cursor;
      for (const k of kids) {
        const sp = node.parallel ? cursor : end;
        const res = delegate(c, a, k, rootId, sp, depth);
        end = node.parallel ? Math.max(end, res.endMs) : res.endMs;
        if (res.failed) failed = true;
        if (failed) break;
      }
      cursor = end + Math.floor(r() * 20);
    }
  }
  const gate = a.execution?.modes.human;
  if (gate && !failed && a.state === "active" && c.r() < 0.55) {
    const ch = gate.channels.filter((x) => x !== "console")[0]; const decline = c.r() < 0.12;
    if (ch) {
      const hubCh = c.hub?.channels.find((x) => x.id === ch);
      push({ id: sid(c), parent: rootId, agentId: a.id, name: `${NOTIFY_SERVER}.request_approval`, kind: "mcp", startMs: Math.round(cursor), durMs: Math.round(140 + c.r() * 240), costUsd: 0, tokens: 0, status: "ok",
        attrs: { "mcp.server": NOTIFY_SERVER, "mcp.tool": "request_approval", "tokener.tool.sensitive": false, "tokener.tool.approval": false, "connector.key": `channel:${ch}`, "connector.kind": "channel", "connector.name": hubCh?.name ?? ch, "connector.type": hubCh?.channel ?? "channel" },
        logs: [log(cursor, "info", `Asked ${gate.assignee} for a decision in ${hubCh?.name ?? ch}`)] });
    }
    const wait = Math.round(20_000 + c.r() * 55_000);
    push({ id: sid(c), parent: rootId, agentId: a.id, name: "Wait for a decision", kind: "guardrail", startMs: Math.round(cursor), durMs: wait, costUsd: 0, tokens: 0, status: "ok",
      attrs: { "human.wait": true, "human.assignee": gate.assignee, "human.outcome": decline ? "declined" : "approved", "human.sla_minutes": gate.slaMinutes, ...(ch ? { "connector.key": `channel:${ch}` } : {}) },
      logs: [log(cursor, "info", `Run saved. Waiting for ${gate.assignee}`), log(cursor + wait, "info", decline ? "Declined by a person" : "Approved by a person")] });
  }
  if (!failed) push(llmSpan(c, a, rootId, "Compose the result", cursor, false));
  root.durMs = Math.max(1, Math.round(cursor - startMs));
  if (failed) { root.status = "error"; root.detail = c.failAgent === a.id ? "A step failed" : "A downstream agent failed"; root.logs!.push(log(cursor, "error", `Run failed: ${root.detail}`)); }
  else root.logs!.push(log(cursor, "info", `Run finished in ${root.durMs} ms`));
  return { endMs: cursor, failed, rootId };
}

function delegate(c: Ctx, from: Agent, node: TraceTree, parent: string, at: number, depth: number): { endMs: number; failed: boolean } {
  const r = c.r; const peer = c.agents.get(node.agent)!; const proto = node.via ?? "tap";
  const id = sid(c); const msg = `msg_${hex(r, 12)}`;
  const type = node.async ? "relay.message" : proto === "mcp" ? "tools/call" : proto === "a2a" ? "message/send" : "relay.task.create";
  const net = Math.round(12 + r() * 50);
  const d: Span = { id, parent, agentId: from.id, name: node.async ? `Publish to ${peer.title}` : `Ask ${peer.title}`, kind: "delegation", startMs: Math.round(at), durMs: 0, costUsd: 0, tokens: 0, status: "ok",
    attrs: { "peer.agent": peer.name, "tap.protocol": proto, "tap.message.id": msg, "tap.message.type": type, "tap.depth": depth + 1, "tap.sync": !node.async, ...(node.async ? { "messaging.system": "tokener-events", "messaging.destination": `agent.${peer.name}` } : {}) },
    logs: [log(at, "info", `${type} ${msg} to ${peer.name} over ${proto.toUpperCase()}`)] };
  c.spans.push(d);
  if (depth + 1 > c.maxDepth) { d.status = "error"; d.detail = "tap.depth_exceeded"; d.durMs = 3; d.logs!.push(log(at, "error", "Refused: tap.depth_exceeded")); return { endMs: at + 3, failed: true }; }
  if (node.async) {
    d.durMs = Math.round(14 + r() * 20);
    const startCons = at + d.durMs + Math.round(200 + r() * 1800);
    runAgent(c, node, id, startCons, depth + 1);
    return { endMs: at + d.durMs, failed: false };
  }
  const res = runAgent(c, node, id, at + net, depth + 1);
  d.durMs = Math.round(res.endMs + net * 0.6 - at);
  if (res.failed) { d.status = "error"; d.detail = `${peer.name} returned tap.task_failed`; d.logs!.push(log(at + d.durMs, "error", `Reply ${msg}: tap.task_failed from ${peer.name}`)); }
  else d.logs!.push(log(at + d.durMs, "info", `Reply ${msg}: relay.task.result`));
  return { endMs: at + d.durMs, failed: res.failed };
}

export type BuildOpts = {
  agents: Agent[]; tree: TraceTree; seed: number; startedAt: number; trigger: string; behalfOf: string; correlationId?: string; failAgent?: string | null; kind?: Trace["kind"];
  evalRunId?: string; caseId?: string; workflowId?: string; extra?: Record<string, AttrValue>; maxDepth?: number; hub?: Hub;
};

export function buildTrace(o: BuildOpts): Trace {
  const r = rng(o.seed);
  const unit = new Map(o.agents.map((a) => {
    const ex = a.daily.reduce((x, d) => x + d.executions, 0); const avg = ex ? a.daily.reduce((x, d) => x + d.costUsd, 0) / ex : 0.02;
    return [a.id, Math.min(4e-6, Math.max(2e-7, avg / 9000))] as const;
  }));
  const c: Ctx = { unit, r, agents: new Map(o.agents.map((a) => [a.id, a])), spans: [], used: new Set(), failAgent: o.failAgent ?? null, maxDepth: o.maxDepth ?? 8, extra: o.extra, hub: o.hub };
  const res = runAgent(c, o.tree, null, 0, 0);
  const spans = c.spans;
  const end = Math.max(...spans.map((s) => s.startMs + s.durMs));
  const order: string[] = [];
  [...spans].sort((a, b) => a.startMs - b.startMs).forEach((s) => { if (!order.includes(s.agentId)) order.push(s.agentId); });
  const depth = Math.max(...spans.map((s) => Number(s.attrs?.["tap.depth"] ?? 0))) + 1;
  const traceId = hex(r, 32);
  return {
    id: traceId, correlationId: o.correlationId ?? `corr_${hex(r, 10)}`, session: `ses_${Math.floor(r() * 1e8).toString(36)}`, agentId: o.tree.agent, agentIds: order,
    startedAt: new Date(o.startedAt).toISOString(), durationMs: end, costUsd: round(spans.reduce((x, s) => x + s.costUsd, 0)), tokens: spans.reduce((x, s) => x + s.tokens, 0),
    status: res.failed ? "error" : "ok", trigger: o.trigger, behalfOf: o.behalfOf, kind: o.kind ?? "run", depth, evalRunId: o.evalRunId, caseId: o.caseId, workflowId: o.workflowId, spans,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------------

const TRIGGERS = ["Webhook", "Schedule", "A person in the console", "Another agent", "API key"];
const PEOPLE = ["ada@acme.test", "grace@acme.test", "service: helpdesk-sync", "linus@acme.test", "app: storefront"];

type Scenario = { key: string; tree: TraceTree; failRate: number; count: number; failAgent?: string; workflowId?: string };

const SCENARIOS: Scenario[] = [
  { key: "refund", count: 14, failRate: 0.14, failAgent: "agt_05", tree: { agent: "agt_08", children: [{ agent: "agt_01", via: "a2a", children: [{ agent: "agt_02", via: "tap", children: [{ agent: "agt_05", via: "tap" }] }] }] }, workflowId: "wf_01" },
  { key: "brief", count: 10, failRate: 0.08, tree: { agent: "agt_06", children: [{ agent: "agt_13", via: "a2a" }] }, workflowId: "wf_02" },
  { key: "claim", count: 8, failRate: 0.1, tree: { agent: "agt_09", children: [{ agent: "agt_15", via: "a2a" }] } },
  { key: "intake", count: 10, failRate: 0.1, failAgent: "agt_12", tree: { agent: "agt_03", parallel: true, children: [{ agent: "agt_12", via: "tap" }, { agent: "agt_07", via: "tap" }] }, workflowId: "wf_03" },
  { key: "quality", count: 8, failRate: 0.06, tree: { agent: "agt_04", children: [{ agent: "agt_12", via: "tap" }] } },
  { key: "dq-alert", count: 8, failRate: 0.04, tree: { agent: "agt_12", children: [{ agent: "agt_04", via: "queue", async: true }] } },
];

/** Whether every agent in a scenario can produce spans: not retired, not suspended, and reporting. */
const usable = (n: TraceTree, byId: Map<string, Agent>): boolean => { const a = byId.get(n.agent); return !!a && a.state === "active" && a.control !== "inventory" && (n.children ?? []).every((k) => usable(k, byId)); };

export function sampleTraces(agents: Agent[], _links: Link[], now = Date.now(), hub?: Hub): Trace[] {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const out: Trace[] = [];
  let seed = 9000;
  const R = rng(4242);
  for (const sc of SCENARIOS) {
    if (!usable(sc.tree, byId)) continue;
    const ids: string[] = [];
    const collect = (n: TraceTree) => { ids.push(n.agent); (n.children ?? []).forEach(collect); };
    collect(sc.tree);
    let lastFailed: Trace | null = null;
    for (let i = 0; i < sc.count; i++) {
      const fail = R() < sc.failRate;
      const failAgent = fail ? (sc.failAgent ?? ids[ids.length - 1]) : null;
      const retry = lastFailed && R() < 0.8;
      const startedAt = retry ? Math.min(now - 5_000, Date.parse(lastFailed!.startedAt) + 90_000 + Math.floor(R() * 600_000)) : now - Math.floor(R() * 3 * 86_400_000) - 60_000;
      const t = buildTrace({ agents, tree: sc.tree, seed: seed++, startedAt, trigger: sc.key === "dq-alert" ? "Schedule" : TRIGGERS[Math.floor(R() * TRIGGERS.length)], behalfOf: PEOPLE[Math.floor(R() * PEOPLE.length)], hub,
        failAgent, correlationId: retry ? lastFailed!.correlationId : undefined, workflowId: sc.workflowId, extra: retry ? { "retry.of": lastFailed!.id, "retry.attempt": 2 } : undefined });
      out.push(t);
      lastFailed = t.status === "error" ? t : null;
    }
  }
  // Single-agent runs, for every agent that reports
  for (const a of agents) {
    if (a.control === "inventory" || a.state === "retired") continue;
    const failRate = a.daily.reduce((x, d) => x + d.failures, 0) / Math.max(1, a.daily.reduce((x, d) => x + d.executions, 0));
    for (let i = 0; i < 6; i++) {
      const fail = R() < failRate;
      out.push(buildTrace({ agents, tree: { agent: a.id }, seed: seed++, startedAt: now - Math.floor(R() * 3 * 86_400_000) - 30_000, trigger: TRIGGERS[Math.floor(R() * TRIGGERS.length)], hub, behalfOf: PEOPLE[Math.floor(R() * PEOPLE.length)], failAgent: fail ? a.id : null }));
    }
  }
  return out.sort((x, y) => Date.parse(y.startedAt) - Date.parse(x.startedAt));
}
