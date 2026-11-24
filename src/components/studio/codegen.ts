import { BY_KIND } from "./catalog";
import type { CodeTab, GNode, Graph, Mode } from "./types";

/* ------------------------------------------------------------------ policy AST */

type Stmt =
  | { t: "allowModel"; v: string[] }
  | { t: "denyModel"; v: string[] }
  | { t: "denyCap"; v: string }
  | { t: "hours"; from: string; to: string; tz: string }
  | { t: "tokens"; n: number; grain: string; period: string }
  | { t: "cost"; n: number; cur: string; grain: string; period: string }
  | { t: "breach"; v: string }
  | { t: "planned"; text: string };

export type PolicyAst = {
  name: string;
  scopeType: string;
  scopeIdent: string;
  enforce: boolean;
  activateAt: string;
  expireAt: string;
  statements: Stmt[];
};

export const splitList = (s: unknown) =>
  String(s ?? "").split(",").map((x) => x.trim()).filter(Boolean);

export const toIso = (v: unknown) => {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(s) ? `${s}:00Z` : s;
};

/** All nodes that feed (directly or through other rules) into the policy hub. */
export function policyMembers(g: Graph): { hub: GNode | null; rules: GNode[] } {
  const hubs = g.nodes.filter((n) => n.kind === "policy");
  const hub = hubs[0] ?? null;
  if (!hub) return { hub, rules: [] };
  const seen = new Set<string>([hub.id]);
  const queue = [hub.id];
  while (queue.length) {
    const cur = queue.shift()!;
    g.edges.filter((e) => e.to === cur).forEach((e) => {
      if (!seen.has(e.from)) {
        seen.add(e.from);
        queue.push(e.from);
      }
    });
  }
  const rules = g.nodes
    .filter((n) => seen.has(n.id) && n.id !== hub.id && n.kind !== "request")
    .sort((a, b) => a.y - b.y || a.x - b.x);
  return { hub, rules };
}

const ORDER = ["allow_model", "deny_model", "deny_capability", "allow_hours", "limit_tokens", "limit_cost", "on_breach", "region_pin", "pii_mask"];

export function buildPolicyAst(g: Graph): PolicyAst | null {
  const { hub, rules } = policyMembers(g);
  if (!hub) return null;
  const p = hub.params;
  const statements: Stmt[] = [];
  [...rules]
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
    .forEach((n) => {
      const q = n.params;
      switch (n.kind) {
        case "allow_model": statements.push({ t: "allowModel", v: splitList(q.models) }); break;
        case "deny_model": statements.push({ t: "denyModel", v: splitList(q.models) }); break;
        case "deny_capability": statements.push({ t: "denyCap", v: String(q.capability || "IMAGE") }); break;
        case "allow_hours": statements.push({ t: "hours", from: String(q.from || "08:00"), to: String(q.to || "18:00"), tz: String(q.timezone || "") }); break;
        case "limit_tokens": statements.push({ t: "tokens", n: Number(q.amount) || 0, grain: String(q.grain || "user"), period: String(q.period || "day") }); break;
        case "limit_cost": statements.push({ t: "cost", n: Number(q.amount) || 0, cur: String(q.currency || "USD"), grain: String(q.grain || "project"), period: String(q.period || "day") }); break;
        case "on_breach": statements.push({ t: "breach", v: String(q.action || "THROTTLE") }); break;
        case "region_pin": statements.push({ t: "planned", text: `planned: REGION ${splitList(q.regions).join(", ")}` }); break;
        case "pii_mask": statements.push({ t: "planned", text: `planned: PII ${String(q.mode || "mask").toUpperCase()} ${splitList(q.entities).join(", ")}` }); break;
      }
    });
  return {
    name: String(p.name || "unnamed"),
    scopeType: String(p.scopeType || "TENANT"),
    scopeIdent: String(p.scopeIdent || ""),
    enforce: !!p.enforce,
    activateAt: toIso(p.activateAt),
    expireAt: toIso(p.expireAt),
    statements,
  };
}

const num = (n: number) => (Number.isInteger(n) ? String(n) : String(n));

export function toDsl(a: PolicyAst): string {
  const scope = a.scopeType === "ORG" ? "org" : `${a.scopeType.toLowerCase()}:${a.scopeIdent}`;
  const lines = [`POLICY "${a.name.replace(/"/g, "'")}" SCOPE ${a.enforce ? "ENFORCE " : ""}${scope}`];
  a.statements.forEach((s) => {
    switch (s.t) {
      case "allowModel": if (s.v.length) lines.push(`  ALLOW MODEL ${s.v.join(", ")}`); break;
      case "denyModel": if (s.v.length) lines.push(`  DENY MODEL ${s.v.join(", ")}`); break;
      case "denyCap": lines.push(`  DENY ${s.v}`); break;
      case "hours": lines.push(`  ALLOW HOURS ${s.from}-${s.to}${s.tz ? ` TIMEZONE "${s.tz}"` : ""}`); break;
      case "tokens": lines.push(`  LIMIT TOKENS ${num(s.n)} PER ${s.grain} PER ${s.period}`); break;
      case "cost": lines.push(`  LIMIT COST ${num(s.n)} ${s.cur} PER ${s.grain} PER ${s.period}`); break;
      case "breach": lines.push(`  ON BREACH ${s.v}`); break;
      case "planned": lines.push(`  # ${s.text}`); break;
    }
  });
  if (a.activateAt) lines.push(`  ACTIVATE AT "${a.activateAt}"${a.expireAt ? ` EXPIRE AT "${a.expireAt}"` : ""}`);
  return lines.join("\n") + "\n";
}

export function toRego(a: PolicyAst): string {
  const pkg = "tokener.policy." + a.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const scope = a.scopeType === "ORG" ? "org:null" : `${a.scopeType.toLowerCase()}:${a.scopeIdent}`;
  const allow = a.statements.flatMap((s) => (s.t === "allowModel" ? s.v : []));
  const deny = a.statements.flatMap((s) => (s.t === "denyModel" ? s.v : []));
  const caps = a.statements.filter((s): s is Extract<Stmt, { t: "denyCap" }> => s.t === "denyCap");
  const hours = a.statements.filter((s): s is Extract<Stmt, { t: "hours" }> => s.t === "hours");
  const breach = a.statements.find((s): s is Extract<Stmt, { t: "breach" }> => s.t === "breach");
  const out: string[] = [];
  out.push(`package ${pkg}`, "", "import future.keywords.in", "", "default allow := false", 'default breach_action := "none"', "");
  out.push(`# Compiled from Policy DSL document: ${a.name}`, `# Scope: ${scope}`, "");
  if (deny.length) {
    out.push("model_denied {");
    deny.forEach((d) => out.push(`    glob.match("${d}", [], input.model)`));
    out.push("}", "");
  } else out.push("model_denied { false }", "");
  if (allow.length) {
    out.push("model_allowed {", `    some pattern in [${allow.map((x) => `"${x}"`).join(", ")}]`, "    glob.match(pattern, [], input.model)", "}", "");
  } else out.push("model_allowed { true }  # no explicit allow-list means allow by default", "");
  caps.forEach((c) => out.push("capability_denied {", `    input.capability == "${c.v.toLowerCase()}"`, "}", ""));
  hours.forEach((h) =>
    out.push("outside_allowed_hours {", `    not time_in_range(input.request_time, "${h.from}", "${h.to}", "${h.tz || "UTC"}")`, "}", "")
  );
  a.statements.forEach((s) => {
    if (s.t === "tokens") out.push(`# LIMIT TOKENS ${s.n} PER ${s.grain} PER ${s.period} - evaluated against the Budget Engine counters at the Gateway,`, "# not inside OPA itself.", "");
    if (s.t === "cost") out.push(`# LIMIT COST ${s.n} ${s.cur} PER ${s.grain} PER ${s.period} - enforced by tokener-budget.`, "");
  });
  out.push("allow {", "    not model_denied", "    model_allowed");
  if (caps.length) out.push("    not capability_denied");
  if (hours.length) out.push("    not outside_allowed_hours");
  out.push("}", "", `breach_action := "${(breach?.v ?? "WARN").toLowerCase()}" {`, "    not allow", "}", "");
  return out.join("\n");
}

export function toApiJson(a: PolicyAst): string {
  const body: Record<string, unknown> = {
    scopeType: a.scopeType,
    scopeId: a.scopeType === "ORG" ? null : "<uuid of the " + a.scopeType.toLowerCase() + ">",
    name: a.name,
    dslSource: toDsl(a),
    isEnforce: a.enforce,
    activateAt: a.activateAt || null,
    expireAt: a.expireAt || null,
    createdBy: "policy-studio",
    tenantId: "<tenant uuid>",
  };
  return JSON.stringify(body, null, 2) + "\n";
}

/* ------------------------------------------------------------ pipeline / trace */

const mermaidId = (id: string) => id.replace(/[^A-Za-z0-9_]/g, "_");

export function toMermaid(g: Graph): string {
  const lines = ["flowchart LR"];
  g.nodes.forEach((n) => lines.push(`  ${mermaidId(n.id)}["${BY_KIND[n.kind]?.label ?? n.kind}"]`));
  const arrow: Record<string, string> = { flow: "-->", allow: "==>", deny: "-.->", limit: "-.->", async: "-.->", failover: "-.->" };
  g.edges.forEach((e) => lines.push(`  ${mermaidId(e.from)} ${arrow[e.type] ?? "-->"}${e.label ? `|${e.label}|` : e.type !== "flow" ? `|${e.type}|` : ""} ${mermaidId(e.to)}`));
  return lines.join("\n") + "\n";
}

export function toPipelineJson(g: Graph, name: string): string {
  return (
    JSON.stringify(
      {
        apiVersion: "tokener.io/v1alpha1",
        kind: "RequestPipeline",
        metadata: { name },
        spec: {
          stages: g.nodes.map((n) => ({ id: n.id, type: n.kind, params: n.params })),
          transitions: g.edges.map((e) => ({ from: e.from, to: e.to, type: e.type, ...(e.label ? { label: e.label } : {}) })),
        },
      },
      null,
      2
    ) + "\n"
  );
}

export function toTraceJson(g: Graph, name: string): string {
  const spans = g.nodes
    .filter((n) => n.meta)
    .sort((a, b) => a.meta!.startMs - b.meta!.startMs)
    .map((n) => ({
      spanId: n.id,
      name: BY_KIND[n.kind]?.label ?? n.kind,
      parents: g.edges.filter((e) => e.to === n.id).map((e) => e.from),
      startOffsetMs: n.meta!.startMs,
      durationMs: n.meta!.ms,
      status: n.meta!.status,
      attributes: n.meta!.attrs,
    }));
  return JSON.stringify({ traceName: name, spans }, null, 2) + "\n";
}

export function generate(mode: Mode, g: Graph, name: string): CodeTab[] {
  if (mode === "policy") {
    const ast = buildPolicyAst(g);
    if (!ast) return [{ id: "dsl", label: "Policy DSL", lang: "text", text: "# Add a Policy document node to generate output.\n" }];
    return [
      { id: "dsl", label: "Policy DSL", lang: "dsl", text: toDsl(ast) },
      { id: "rego", label: "Compiled Rego", lang: "rego", text: toRego(ast) },
      { id: "api", label: "POST /api/v1/policies", lang: "json", text: toApiJson(ast) },
    ];
  }
  if (mode === "pipeline") {
    return [
      { id: "json", label: "Pipeline spec", lang: "json", text: toPipelineJson(g, name) },
      { id: "mermaid", label: "Mermaid", lang: "text", text: toMermaid(g) },
    ];
  }
  return [
    { id: "json", label: "Trace spans", lang: "json", text: toTraceJson(g, name) },
    { id: "mermaid", label: "Mermaid", lang: "text", text: toMermaid(g) },
  ];
}
