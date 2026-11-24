import { BY_KIND } from "./catalog";
import { policyMembers, splitList, toIso } from "./codegen";
import type { Graph, Issue, Mode } from "./types";

const IDENT = /^[A-Za-z][A-Za-z0-9_.\-]*$/;
const GLOB = /^[A-Za-z0-9_.\-*]+$/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

function hasCycle(g: Graph) {
  const adj = new Map<string, string[]>();
  g.edges.forEach((e) => adj.set(e.from, [...(adj.get(e.from) || []), e.to]));
  const state = new Map<string, number>();
  const visit = (id: string): boolean => {
    if (state.get(id) === 1) return true;
    if (state.get(id) === 2) return false;
    state.set(id, 1);
    for (const n of adj.get(id) || []) if (visit(n)) return true;
    state.set(id, 2);
    return false;
  };
  return g.nodes.some((n) => visit(n.id));
}

export function validate(mode: Mode, g: Graph): Issue[] {
  const issues: Issue[] = [];
  if (!g.nodes.length) return [{ level: "info", msg: "The canvas is empty. Drag a node from the palette or load a template." }];
  if (hasCycle(g)) issues.push({ level: "error", msg: "The graph contains a cycle. Remove a connection." });

  if (mode === "policy") {
    const hubs = g.nodes.filter((n) => n.kind === "policy");
    if (hubs.length === 0) issues.push({ level: "error", msg: "Add a Policy document node. It gathers all rules." });
    if (hubs.length > 1) issues.push({ level: "error", msg: "Only one Policy document node is allowed per graph.", nodeId: hubs[1].id });
    const { hub, rules } = policyMembers(g);
    if (hub) {
      const p = hub.params;
      if (!String(p.name || "").trim()) issues.push({ level: "error", msg: "Policy name is required.", nodeId: hub.id });
      if (p.scopeType !== "ORG") {
        const id = String(p.scopeIdent || "");
        if (!id) issues.push({ level: "error", msg: "Scope identifier is required for non-org scopes.", nodeId: hub.id });
        else if (!IDENT.test(id)) issues.push({ level: "error", msg: `Scope identifier "${id}" is not a valid DSL identifier (letters first, then letters, digits, _ - .).`, nodeId: hub.id });
      }
      const a = toIso(p.activateAt), x = toIso(p.expireAt);
      if (a && x && Date.parse(x) <= Date.parse(a)) issues.push({ level: "error", msg: "Expire at must be after Activate at.", nodeId: hub.id });
      if (!rules.length) issues.push({ level: "error", msg: "Connect at least one rule to the Policy document.", nodeId: hub.id });
    }
    const member = new Set(rules.map((r) => r.id));
    g.nodes.forEach((n) => {
      const d = BY_KIND[n.kind];
      if (!d || ["policy", "request", "decision"].includes(n.kind)) return;
      if (!member.has(n.id)) issues.push({ level: "warn", msg: `${d.label} is not connected to the policy and will be ignored.`, nodeId: n.id });
      if (d.planned) issues.push({ level: "info", msg: `${d.label} is planned. It is emitted as a comment only.`, nodeId: n.id });
      const q = n.params;
      if (["allow_model", "deny_model"].includes(n.kind)) {
        const list = splitList(q.models);
        if (!list.length) issues.push({ level: "error", msg: `${d.label}: add at least one model.`, nodeId: n.id });
        list.filter((m) => !GLOB.test(m)).forEach((m) => issues.push({ level: "error", msg: `${d.label}: "${m}" has characters the DSL cannot parse.`, nodeId: n.id }));
      }
      if (n.kind === "allow_hours") {
        if (!CLOCK.test(String(q.from || "")) || !CLOCK.test(String(q.to || ""))) issues.push({ level: "error", msg: "Allowed hours: use HH:MM, 24 hour clock.", nodeId: n.id });
        else if (q.from === q.to) issues.push({ level: "warn", msg: "Allowed hours: start equals end.", nodeId: n.id });
        if (!String(q.timezone || "").trim()) issues.push({ level: "warn", msg: "Allowed hours: no timezone, UTC will be used.", nodeId: n.id });
      }
      if (["limit_tokens", "limit_cost"].includes(n.kind) && !(Number(q.amount) > 0)) issues.push({ level: "error", msg: `${d.label}: amount must be greater than zero.`, nodeId: n.id });
    });
    const breaches = rules.filter((r) => r.kind === "on_breach");
    if (breaches.length > 1) issues.push({ level: "error", msg: "Only one On breach node is allowed.", nodeId: breaches[1].id });
    if (rules.some((r) => r.kind.startsWith("limit_")) && !breaches.length) issues.push({ level: "warn", msg: "Limits are set but there is no On breach node. The engine default (WARN) applies." });
    const allows = rules.filter((r) => r.kind === "allow_model").flatMap((r) => splitList(r.params.models));
    const denies = rules.filter((r) => r.kind === "deny_model").flatMap((r) => splitList(r.params.models));
    allows.filter((m) => denies.includes(m)).forEach((m) => issues.push({ level: "info", msg: `"${m}" is both allowed and denied. Deny overrides.` }));
  }

  if (mode === "pipeline") {
    const kinds = g.nodes.map((n) => n.kind);
    if (!kinds.some((k) => k === "client_app" || k === "service_account")) issues.push({ level: "error", msg: "Add a source: Client app or Service account." });
    if (!kinds.some((k) => k.startsWith("provider_"))) issues.push({ level: "error", msg: "Add at least one provider." });
    if (!kinds.includes("authenticate")) issues.push({ level: "warn", msg: "No Authenticate stage. Requests would be anonymous." });
    if (!kinds.includes("policy_gate")) issues.push({ level: "warn", msg: "No Policy gate. Nothing denies a disallowed model before spend." });
    if (!kinds.includes("meter")) issues.push({ level: "warn", msg: "No Meter stage. Usage will not be counted or billed." });
    if (!kinds.includes("audit")) issues.push({ level: "info", msg: "No Audit log stage. Decisions will not be recorded." });
    const incoming = new Set(g.edges.map((e) => e.to));
    const outgoing = new Set(g.edges.map((e) => e.from));
    g.nodes.forEach((n) => {
      const d = BY_KIND[n.kind];
      if (!d) return;
      if (d.hasIn && !incoming.has(n.id)) issues.push({ level: "warn", msg: `${d.label} has no incoming connection.`, nodeId: n.id });
      if (d.hasOut && !d.kind.startsWith("provider_") && !outgoing.has(n.id) && !["reject"].includes(n.kind)) issues.push({ level: "warn", msg: `${d.label} has no outgoing connection.`, nodeId: n.id });
      if (d.planned) issues.push({ level: "info", msg: `${d.label} is planned and not yet active in the gateway.`, nodeId: n.id });
    });
    const order = ["policy_gate", "budget_gate", "quota_gate"];
    order.forEach((gate) => {
      const gn = g.nodes.find((n) => n.kind === gate);
      if (gn && !g.edges.some((e) => e.from === gn.id && e.type === "deny")) issues.push({ level: "info", msg: `${BY_KIND[gate].label} has no Reject branch. A failure returns the default RFC 7807 error.`, nodeId: gn.id });
    });
  }

  if (mode === "trace") {
    const errs = g.nodes.filter((n) => n.meta?.status === "error");
    errs.forEach((n) => issues.push({ level: "error", msg: `${BY_KIND[n.kind]?.label ?? n.kind} failed: ${n.meta?.note ?? "see attributes"}`, nodeId: n.id }));
    g.nodes.filter((n) => n.meta?.status === "warn").forEach((n) => issues.push({ level: "warn", msg: `${BY_KIND[n.kind]?.label ?? n.kind}: ${n.meta?.note ?? "warning"}`, nodeId: n.id }));
    if (!errs.length && !issues.length) issues.push({ level: "info", msg: "All stages completed without errors." });
  }
  return issues;
}
