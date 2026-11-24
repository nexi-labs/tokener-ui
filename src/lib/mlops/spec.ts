import type { Issue } from "@/components/studio/types";
import { OP_BY_KIND, OPERATORS, defaultConfig, portsCompatible, type OperatorDef, type Port } from "./operators";
import { integrationById } from "./catalog";
import type { BuildAgent, Connection, Env } from "./types";

/**
 * The single canonical, versioned pipeline specification. The visual builder and the guided wizard
 * both read and write exactly this shape. Nothing else is persisted for a pipeline definition.
 */
export const SPEC_API_VERSION = "tokener.io/v1" as const;

export type SpecNode = {
  id: string;
  operator: string;
  schemaVersion: string;
  name: string;
  x: number;
  y: number;
  config: Record<string, any>;
  /** Connection id (a reference). Connection secrets are never part of the spec. */
  connection?: string;
  /** Secret references by name, for example "secretref://vault/nexi/ml/registry-token". */
  secretRefs?: Record<string, string>;
  retry?: { max: number; backoffMs: number };
  timeoutSec?: number;
  onFailure?: "stop" | "continue" | "rollback";
};

export type SpecEdge = { id: string; from: string; fromPort: string; to: string; toPort: string };

export type PipelineSpec = {
  apiVersion: typeof SPEC_API_VERSION;
  kind: "Pipeline";
  metadata: { name: string; description: string; org: string; project: string; owner: string; labels: Record<string, string> };
  environment: Env;
  defaults: { retry: { max: number; backoffMs: number; jitter: boolean }; timeoutSec: number; onFailure: "stop" | "continue" | "rollback" };
  nodes: SpecNode[];
  edges: SpecEdge[];
};

export type PipelineVersion = { version: number; spec: PipelineSpec; digest: string; createdAt: string; createdBy: string; note: string };

export type PipelineRecord = {
  id: string;
  name: string;
  description: string;
  env: Env;
  versions: PipelineVersion[];
  /** Working copy that may differ from the latest published version. */
  draft?: { spec: PipelineSpec; savedAt: string; step?: number };
  demo: boolean;
};

export const NODE_W = 188;
export const HEADER_H = 46;
export const PORT_ROW = 18;
export const nodeHeight = (op?: OperatorDef) => HEADER_H + Math.max(op?.inputs.length ?? 1, op?.outputs.length ?? 1, 1) * PORT_ROW + 6;
/** World position of a port's center. */
export function portPos(n: { x: number; y: number; operator: string }, side: "in" | "out", portId: string) {
  const op = OP_BY_KIND[n.operator];
  const list = side === "in" ? op?.inputs : op?.outputs;
  const idx = Math.max(0, list?.findIndex((p) => p.id === portId) ?? 0);
  return { x: side === "in" ? n.x : n.x + NODE_W, y: n.y + HEADER_H + idx * PORT_ROW + PORT_ROW / 2 };
}

export function newSpec(name: string, env: Env, owner = "you@nexi.example"): PipelineSpec {
  return {
    apiVersion: SPEC_API_VERSION, kind: "Pipeline",
    metadata: { name, description: "", org: "nexi-ai", project: "support-ml", owner, labels: { team: "support-ml" } },
    environment: env,
    defaults: { retry: { max: 2, backoffMs: 2000, jitter: true }, timeoutSec: 900, onFailure: "stop" },
    nodes: [], edges: [],
  };
}

export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export function newNodeId(spec: PipelineSpec, kind: string) {
  let i = 1;
  const base = kind.replace(/_/g, "-");
  while (spec.nodes.some((n) => n.id === `${base}-${i}`)) i++;
  return `${base}-${i}`;
}

export function addNode(spec: PipelineSpec, kind: string, x: number, y: number): { spec: PipelineSpec; id: string } {
  const op = OP_BY_KIND[kind];
  const id = newNodeId(spec, kind);
  const n: SpecNode = { id, operator: kind, schemaVersion: op.schemaVersion, name: op.label, x, y, config: defaultConfig(kind) };
  return { spec: { ...spec, nodes: [...spec.nodes, n] }, id };
}

export function removeNode(spec: PipelineSpec, id: string): PipelineSpec {
  return { ...spec, nodes: spec.nodes.filter((n) => n.id !== id), edges: spec.edges.filter((e) => e.from !== id && e.to !== id) };
}

export const updateNode = (spec: PipelineSpec, id: string, patch: Partial<SpecNode>): PipelineSpec => ({
  ...spec, nodes: spec.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
});

export function wouldCycle(spec: PipelineSpec, from: string, to: string): boolean {
  if (from === to) return true;
  const out = new Map<string, string[]>();
  spec.edges.forEach((e) => out.set(e.from, [...(out.get(e.from) || []), e.to]));
  const seen = new Set<string>();
  const stack = [to];
  while (stack.length) {
    const c = stack.pop()!;
    if (c === from) return true;
    if (seen.has(c)) continue;
    seen.add(c);
    (out.get(c) || []).forEach((n) => stack.push(n));
  }
  return false;
}

export type ConnectCheck = { ok: true } | { ok: false; reason: string };

export function canConnect(spec: PipelineSpec, from: string, fromPort: string, to: string, toPort: string): ConnectCheck {
  const a = spec.nodes.find((n) => n.id === from), b = spec.nodes.find((n) => n.id === to);
  if (!a || !b) return { ok: false, reason: "Unknown node" };
  if (from === to) return { ok: false, reason: "A node cannot connect to itself" };
  const po = OP_BY_KIND[a.operator]?.outputs.find((p) => p.id === fromPort);
  const pi = OP_BY_KIND[b.operator]?.inputs.find((p) => p.id === toPort);
  if (!po || !pi) return { ok: false, reason: "Unknown port" };
  if (!portsCompatible(po.type, pi.type)) return { ok: false, reason: `${po.type} output cannot feed a ${pi.type} input` };
  if (spec.edges.some((e) => e.from === from && e.fromPort === fromPort && e.to === to && e.toPort === toPort)) return { ok: false, reason: "Already connected" };
  if (!pi.multi && spec.edges.some((e) => e.to === to && e.toPort === toPort)) return { ok: false, reason: `${pi.label} input already has a connection` };
  if (wouldCycle(spec, from, to)) return { ok: false, reason: "This would create a cycle" };
  return { ok: true };
}

export function connectPorts(spec: PipelineSpec, from: string, fromPort: string, to: string, toPort: string): { spec: PipelineSpec; error?: string } {
  const c = canConnect(spec, from, fromPort, to, toPort);
  if (!c.ok) return { spec, error: c.reason };
  const id = `e-${from}-${to}-${toPort}`;
  return { spec: { ...spec, edges: [...spec.edges, { id, from, fromPort, to, toPort }] } };
}

/** Pick the first valid port pair, for the wizard and for dropping a node onto another. */
export function autoConnect(spec: PipelineSpec, from: string, to: string): { spec: PipelineSpec; error?: string } {
  const a = spec.nodes.find((n) => n.id === from), b = spec.nodes.find((n) => n.id === to);
  if (!a || !b) return { spec, error: "Unknown node" };
  const A = OP_BY_KIND[a.operator], B = OP_BY_KIND[b.operator];
  let lastErr = "No compatible ports";
  for (const o of A.outputs) {
    for (const i of B.inputs) {
      const c = canConnect(spec, from, o.id, to, i.id);
      if (c.ok) return connectPorts(spec, from, o.id, to, i.id);
      lastErr = c.reason;
    }
  }
  return { spec, error: lastErr };
}

export const removeEdge = (spec: PipelineSpec, id: string): PipelineSpec => ({ ...spec, edges: spec.edges.filter((e) => e.id !== id) });

export function topoOrder(spec: PipelineSpec): string[] {
  const indeg = new Map(spec.nodes.map((n) => [n.id, 0]));
  spec.edges.forEach((e) => indeg.set(e.to, (indeg.get(e.to) || 0) + 1));
  const q = spec.nodes.filter((n) => !indeg.get(n.id)).map((n) => n.id);
  const order: string[] = [];
  while (q.length) {
    q.sort((a, b) => spec.nodes.findIndex((n) => n.id === a) - spec.nodes.findIndex((n) => n.id === b));
    const c = q.shift()!;
    order.push(c);
    spec.edges.filter((e) => e.from === c).forEach((e) => {
      indeg.set(e.to, indeg.get(e.to)! - 1);
      if (indeg.get(e.to) === 0) q.push(e.to);
    });
  }
  return order;
}

export function ancestors(spec: PipelineSpec, id: string): Set<string> {
  const res = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const c = stack.pop()!;
    spec.edges.filter((e) => e.to === c).forEach((e) => {
      if (!res.has(e.from)) { res.add(e.from); stack.push(e.from); }
    });
  }
  return res;
}

export function autoLayoutSpec(spec: PipelineSpec, gapX = 64, gapY = 28): PipelineSpec {
  const depth = new Map<string, number>();
  topoOrder(spec).forEach((id) => {
    const ps = spec.edges.filter((e) => e.to === id).map((e) => depth.get(e.from) ?? 0);
    depth.set(id, ps.length ? Math.max(...ps) + 1 : 0);
  });
  spec.nodes.forEach((n) => { if (!depth.has(n.id)) depth.set(n.id, 0); });
  const cols = new Map<number, string[]>();
  spec.nodes.forEach((n) => cols.set(depth.get(n.id)!, [...(cols.get(depth.get(n.id)!) || []), n.id]));
  const heights = new Map(spec.nodes.map((n) => [n.id, nodeHeight(OP_BY_KIND[n.operator])]));
  const colH = (c: string[]) => c.reduce((s, id) => s + heights.get(id)! + gapY, -gapY);
  const tallest = Math.max(0, ...[...cols.values()].map(colH));
  const pos = new Map<string, { x: number; y: number }>();
  cols.forEach((ids, d) => {
    let y = 40 + (tallest - colH(ids)) / 2;
    ids.forEach((id) => { pos.set(id, { x: 40 + d * (NODE_W + gapX), y }); y += heights.get(id)! + gapY; });
  });
  return { ...spec, nodes: spec.nodes.map((n) => ({ ...n, ...pos.get(n.id)! })) };
}

// ---------------------------------------------------------------------------------------------
// Validation

export type ValidationCtx = { connections: Connection[]; agents: BuildAgent[] };

const SECRET_KEY = /(secret|token|password|passwd|apikey|api_key|private_?key|credential)/i;
const DEPLOY_OPS = new Set(["deploy_endpoint", "canary_rollout", "promote", "agent_service"]);
const WRITE_OPS = new Set(["deploy_endpoint", "canary_rollout", "promote", "rollback", "agent_service", "cleanup", "register_model", "store_documents", "vector_index", "build_image", "calendar_event", "send_email", "send_sms", "pay_mtn_momo", "pay_orange_money", "pay_paypal", "pay_card", "pay_bitcoin", "pay_custom", "payment_refund"]);
export const PAY_COLLECT = new Set(["pay_mtn_momo", "pay_orange_money", "pay_paypal", "pay_card", "pay_bitcoin", "pay_custom"]);
const NO_DECIMALS = new Set(["XOF", "XAF", "GNF", "UGX", "RWF", "CDF", "JPY"]);
const SANDBOX_CURRENCY: Record<string, string[]> = { pay_mtn_momo: ["EUR"], pay_orange_money: ["OUV"] };
const E164 = /^\+[1-9]\d{6,14}$/;

/** Payment checks. Money moves, so these are errors, not hints. */
function paymentIssues(spec: PipelineSpec, n: SpecNode, hasApprovalAncestor: (id: string) => boolean, conn?: Connection): Issue[] {
  const out: Issue[] = [];
  const c = n.config as Record<string, any>;
  const err = (msg: string) => out.push({ level: "error", msg: `${n.name}: ${msg}`, nodeId: n.id });
  const prod = spec.environment === "production";
  if (PAY_COLLECT.has(n.operator)) {
    const amt = Number(c.amount);
    if (!spec.edges.some((e) => e.to === n.id && (e.toPort === "order" || e.toPort === "gate"))) err("connect an order or a trigger, so something starts the payment.");
    if (c.amountSource === "Fixed amount") {
      if (!(amt > 0)) err("the amount must be greater than zero.");
      if (NO_DECIMALS.has(String(c.currency)) && !Number.isInteger(amt)) err(`${c.currency} has no decimals. Use a whole number.`);
    }
    if (amt > Number(c.maxAmount)) err(`the amount ${amt} is above the maximum ${c.maxAmount} for this operator.`);
    if (c.amountSource === "From order data" && !spec.edges.some((e) => e.to === n.id && e.toPort === "order")) err("connect an order input, or choose a fixed amount.");
    if (c.amountSource === "From model output" && !hasApprovalAncestor(n.id)) err("an amount produced by a model needs an approval gate upstream.");
    for (const k of ["returnUrl", "cancelUrl"]) if (c[k] !== undefined && !/^https:\/\/[^\s/]+\.[^\s/]+/.test(String(c[k]))) err(`${k === "returnUrl" ? "the return page" : "the cancel page"} must be an https address.`);
    if (Number(c.linkExpiryMin) < 5 || Number(c.linkExpiryMin) > 10080) err("the link must stay valid between 5 minutes and 7 days.");
    if (!String(c.orderRef ?? "").includes("{{")) err("the order reference must include a field such as {{order.id}}. A fixed reference would make every run the same order.");
    if (prod && SANDBOX_CURRENCY[n.operator]?.includes(String(c.currency))) err(`${c.currency} is a test currency and cannot be used in production.`);
    if (n.operator === "pay_card" && String(c.descriptor ?? "").length > 22) err("the statement descriptor is at most 22 characters.");
    if (n.operator === "pay_card" && String(c.descriptor ?? "").trim().length < 5) err("the statement descriptor needs at least 5 characters so customers recognise the charge.");
    if (n.operator === "pay_bitcoin") {
      if (Number(c.confirmations) < 1) err("wait for at least 1 confirmation.");
      if (c.screenAddresses === false) err("address screening against sanctions lists is required.");
    }
    if (n.operator === "pay_custom") {
      const lines = String(c.authRefs ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (!lines.length) err("list the credentials the provider needs.");
      lines.forEach((l) => { const m = l.match(/^([A-Za-z_][\w.-]*)=(.+)$/); if (!m) err(`credential line "${l.slice(0, 24)}" must look like NAME=secretref://...`); else if (!m[2].startsWith("secretref://")) err(`credential ${m[1]} must be a secretref:// reference, not the value.`); });
      if (!String(c.createPath ?? "").startsWith("/")) err("the create path starts with /.");
      if (!String(c.statusPath ?? "").includes("{id}")) err("the status path must contain {id}.");
      if (!String(c.linkPath ?? "").startsWith("$")) err("the link path is a JSON path starting with $.");
      if (/(secret|password|api[_-]?key|bearer)/i.test(String(c.bodyTemplate ?? ""))) err("the request body must not contain credentials.");
      if (c.webhookVerify === "Not signed (confirm by reading the status)") out.push({ level: "warn", msg: `${n.name}: unsigned notifications are only a hint. The platform reads the status back before it counts a payment.`, nodeId: n.id });
    }
    const envSetting = String(conn?.settings?.environment ?? conn?.settings?.mode ?? "");
    if (prod && /^(sandbox|test)$/.test(envSetting)) err(`connection "${conn?.name}" is a ${envSetting} account and cannot take real payments in production.`);
    const awaited = spec.edges.some((e) => e.from === n.id && e.fromPort === "payment" && spec.nodes.find((m) => m.id === e.to)?.operator === "await_payment");
    if (!awaited) out.push({ level: "warn", msg: `${n.name}: nothing waits for this payment. Add Wait for payment so a payment is confirmed before anything is fulfilled.`, nodeId: n.id });
  }
  if (n.operator === "payment_request") {
    if (c.signRequests === false) err("requests to start a payment must be signed.");
    if (Number(c.ratePerMinute) < 1) err("allow at least 1 request per minute.");
  }
  if (n.operator === "await_payment") {
    if (c.verifyWebhook === false) err("provider notifications must be verified.");
    const src = spec.edges.filter((e) => e.to === n.id && e.toPort === "payment").map((e) => spec.nodes.find((m) => m.id === e.from)).find((m) => m && PAY_COLLECT.has(m.operator));
    if (src && Number(c.waitMinutes) < Number(src.config.linkExpiryMin)) out.push({ level: "warn", msg: `${n.name}: waits ${c.waitMinutes} min but the link stays valid ${src.config.linkExpiryMin} min. A payment made after the wait is handled as late.`, nodeId: n.id });
  }
  if (n.operator === "payment_refund") {
    if (c.requireApproval === false) err("refunds always need approval.");
    if (c.mode === "Partial amount" && !(Number(c.amount) > 0)) err("enter the partial amount.");
    if (!hasApprovalAncestor(n.id)) out.push({ level: prod ? "error" : "warn", msg: `${n.name}: add an approval gate before the refund.`, nodeId: n.id });
  }
  if (n.operator === "mcp_tool") {
    const tool = String(c.tool ?? "").trim();
    if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(tool)) err("the tool name may use letters, digits and _ . : - only.");
    try { JSON.parse(String(c.arguments ?? "{}").replace(/\{\{[^}]*\}\}/g, "x")); } catch { err("the arguments are not valid JSON."); }
    const writes = c.effect === "Changes data";
    if (writes && c.requireApproval === false) err("tools that change data always need approval.");
    if (writes && !hasApprovalAncestor(n.id)) out.push({ level: prod ? "error" : "warn", msg: `${n.name}: add an approval gate before a tool that changes data.`, nodeId: n.id });
    const st = conn?.settings ?? {};
    const lines = (v: unknown) => String(v ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    if (lines(st.toolDenylist).includes(tool)) err(`"${tool}" is blocked on connection "${conn?.name}".`);
    if (st.toolExposure === "Only tools I approve (recommended)" && lines(st.toolAllowlist).length && !lines(st.toolAllowlist).includes(tool)) err(`"${tool}" is not on the approved list of connection "${conn?.name}".`);
    if (writes && st.toolExposure === "Read-only tools the server marks as such") err("this connection exposes only read-only tools.");
  }
  if (n.operator === "mcp_resource" && !/^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(String(c.uri ?? ""))) err("the resource address needs a scheme, for example file:///path or https://host/path.");
  if (n.operator === "invoke_function" || n.operator === "run_workflow") {
    const target = String((n.operator === "invoke_function" ? c.function : c.workflow) ?? "").trim();
    if (!/^[a-z][a-z0-9-]{2,47}$/.test(target)) err(`the ${n.operator === "invoke_function" ? "function" : "workflow"} name uses 3 to 48 lowercase letters, digits and hyphens.`);
    if (c.revision === "Pinned revision" && !(Number(c.pinnedRevision) >= 1)) err("enter the revision to pin.");
    const body = n.operator === "invoke_function" ? c.inputMapping : c.input;
    try { JSON.parse(String(body ?? "{}").replace(/\{\{[^}]*\}\}/g, "x")); } catch { err(`the ${n.operator === "invoke_function" ? "input mapping" : "input"} is not valid JSON.`); }
    if (n.operator === "invoke_function" && Number(c.maxCostUsd) < 0) err("the cost ceiling cannot be negative.");
  }
  if (n.operator === "aws_lambda_invoke") {
    const arn = String(c.functionArn ?? "").trim();
    if (!arn.includes("{{") && !/^arn:aws:lambda:[a-z0-9-]+:\d{12}:function:[A-Za-z0-9-_]{1,64}$/.test(arn)) err("the function ARN must look like arn:aws:lambda:<region>:<12-digit account>:function:<name>.");
    if (String(c.qualifier ?? "").trim() === "$LATEST") out.push({ level: prod ? "error" : "warn", msg: `${n.name}: use a version or alias instead of $LATEST.`, nodeId: n.id });
    try { JSON.parse(String(c.payload ?? "{}").replace(/\{\{[^}]*\}\}/g, "x")); } catch { err("the payload is not valid JSON."); }
    const async = String(c.invocationType ?? "").startsWith("Asynchronous");
    if (Number(c.maxPayloadKb) > 6144) err("a call accepts at most 6144 KB.");
    else if (async && Number(c.maxPayloadKb) > 256) err("an asynchronous call accepts at most 256 KB.");
    if (Number(c.timeoutSec) > 900) err("Lambda allows at most 900 seconds.");
    const writes = c.effect === "Changes data";
    if (writes && c.requireApproval === false) err("a function that changes data always needs approval.");
    if (writes && !hasApprovalAncestor(n.id)) out.push({ level: prod ? "error" : "warn", msg: `${n.name}: add an approval gate before a Lambda function that changes data.`, nodeId: n.id });
  }
  if (n.operator === "send_sms") {
    const to = String(c.to ?? "").trim();
    if (to && !to.includes("{{") && !E164.test(to)) err("use the international format, for example +97312345678.");
    if (!String(c.body ?? "").trim()) err("add the text to send.");
    if (String(c.body ?? "").length > 640) err("the text is too long. Keep it under 640 characters.");
  }
  return out;
}

export function validateSpec(spec: PipelineSpec, ctx: ValidationCtx): Issue[] {
  const out: Issue[] = [];
  if (!spec.metadata.name.trim()) out.push({ level: "error", msg: "Pipeline name is required" });
  if (!spec.nodes.length) {
    out.push({ level: "error", msg: "Add at least one operator" });
    return out;
  }
  const ids = new Set<string>();
  spec.nodes.forEach((n) => {
    if (ids.has(n.id)) out.push({ level: "error", msg: `Duplicate node id ${n.id}`, nodeId: n.id });
    ids.add(n.id);
  });

  // Edges
  spec.edges.forEach((e) => {
    const a = spec.nodes.find((n) => n.id === e.from), b = spec.nodes.find((n) => n.id === e.to);
    if (!a || !b) return void out.push({ level: "error", msg: `Edge ${e.id} points to a missing node` });
    const po = OP_BY_KIND[a.operator]?.outputs.find((p) => p.id === e.fromPort);
    const pi = OP_BY_KIND[b.operator]?.inputs.find((p) => p.id === e.toPort);
    if (!po || !pi) out.push({ level: "error", msg: `Edge ${a.name} to ${b.name} uses an unknown port`, nodeId: b.id });
    else if (!portsCompatible(po.type, pi.type)) out.push({ level: "error", msg: `${a.name} (${po.type}) cannot feed ${b.name} (${pi.type})`, nodeId: b.id });
  });
  if (topoOrder(spec).length < spec.nodes.length) out.push({ level: "error", msg: "The graph contains a cycle" });

  const hasApprovalAncestor = (id: string) => [...ancestors(spec, id)].some((a) => spec.nodes.find((n) => n.id === a)?.operator === "approval_gate");
  const hasRollbackPath = spec.nodes.some((n) => n.operator === "rollback");

  spec.nodes.forEach((n) => {
    const op = OP_BY_KIND[n.operator];
    if (!op) return void out.push({ level: "error", msg: `Unknown operator ${n.operator}`, nodeId: n.id });
    if (n.schemaVersion !== op.schemaVersion) out.push({ level: "warn", msg: `${n.name} uses schema ${n.schemaVersion}, current is ${op.schemaVersion}. Use Migrate.`, nodeId: n.id });

    op.inputs.filter((p) => !p.optional).forEach((p) => {
      if (!spec.edges.some((e) => e.to === n.id && e.toPort === p.id)) out.push({ level: "error", msg: `${n.name}: required input "${p.label}" is not connected`, nodeId: n.id });
    });
    const tz = n.config.timezone;
    if (typeof tz === "string" && tz) { try { new Intl.DateTimeFormat("en", { timeZone: tz }); } catch { out.push({ level: "error", msg: `${n.name}: "${tz}" is not a valid time zone. Use an IANA name such as Asia/Bahrain.`, nodeId: n.id }); } }
    if (n.operator === "schedule_trigger" && n.config.mode === "Cron expression" && String(n.config.cron ?? "").trim().split(/\s+/).length !== 5) out.push({ level: "error", msg: `${n.name}: a cron expression has five fields.`, nodeId: n.id });
    if (n.operator === "time_window" && String(n.config.from ?? "") >= String(n.config.to ?? "")) out.push({ level: "error", msg: `${n.name}: the window must end after it starts.`, nodeId: n.id });
    out.push(...paymentIssues(spec, n, hasApprovalAncestor, ctx.connections.find((x) => x.id === n.connection)));
    if (n.operator === "send_email" && !String(n.config.to ?? "").trim()) out.push({ level: "error", msg: `${n.name}: add at least one recipient.`, nodeId: n.id });
    if (["interval_timer"].includes(n.operator) && Number(n.config.every) < 1) out.push({ level: "error", msg: `${n.name}: the interval must be at least 1.`, nodeId: n.id });
    if (spec.nodes.length > 1 && !spec.edges.some((e) => e.from === n.id || e.to === n.id)) out.push({ level: "warn", msg: `${n.name} is not connected to anything`, nodeId: n.id });

    op.params.forEach((p) => {
      const v = n.config[p.key];
      if (!p.optional && (p.type === "text" || p.type === "select") && (v === undefined || v === "")) out.push({ level: "error", msg: `${n.name}: ${p.label} is required`, nodeId: n.id });
      if (p.type === "number" && (v === undefined || v === "" || Number.isNaN(Number(v)) || Number(v) < 0)) out.push({ level: "error", msg: `${n.name}: ${p.label} must be a non-negative number`, nodeId: n.id });
    });
    Object.entries(n.config).forEach(([k, v]) => {
      if (SECRET_KEY.test(k) && typeof v === "string" && v && !v.startsWith("secretref://")) out.push({ level: "error", msg: `${n.name}: "${k}" looks like a secret value. Use a secret reference instead.`, nodeId: n.id });
    });
    Object.entries(n.secretRefs ?? {}).forEach(([k, v]) => {
      if (!v.startsWith("secretref://")) out.push({ level: "error", msg: `${n.name}: secret "${k}" must be a secretref:// reference`, nodeId: n.id });
    });
    if (n.config.replicasMin !== undefined && n.config.replicasMax !== undefined && Number(n.config.replicasMin) > Number(n.config.replicasMax)) out.push({ level: "error", msg: `${n.name}: min replicas exceeds max replicas`, nodeId: n.id });

    if (op.executable === "none") out.push({ level: "warn", msg: `${n.name} is draw-only. No ${op.label.toLowerCase()} adapter exists, so this pipeline cannot run.`, nodeId: n.id });

    if (op.needsConnection) {
      const c = ctx.connections.find((x) => x.id === n.connection);
      if (!n.connection) out.push({ level: "error", msg: `${n.name}: choose a connection`, nodeId: n.id });
      else if (!c) out.push({ level: "error", msg: `${n.name}: connection ${n.connection} no longer exists`, nodeId: n.id });
      else {
        if (c.env !== spec.environment) out.push({ level: "error", msg: `${n.name}: connection "${c.name}" belongs to ${c.env}, pipeline targets ${spec.environment}`, nodeId: n.id });
        if (op.targets.length && !op.targets.includes(c.integrationId)) out.push({ level: "error", msg: `${n.name}: ${integrationById(c.integrationId)?.name ?? c.integrationId} is not a supported target for this operator`, nodeId: n.id });
        if (c.health === "failed") out.push({ level: "error", msg: `${n.name}: connection "${c.name}" is failing (${c.healthDetail})`, nodeId: n.id });
        else if (c.health === "attention") out.push({ level: "warn", msg: `${n.name}: connection "${c.name}" needs attention (${c.healthDetail})`, nodeId: n.id });
        if ((WRITE_OPS.has(n.operator) || ((n.operator === "mcp_tool" || n.operator === "aws_lambda_invoke") && n.config.effect === "Changes data")) && c.permissions === "read-only") out.push({ level: "error", msg: `${n.name}: connection "${c.name}" is read-only`, nodeId: n.id });
        if (c.auth === "none" && spec.environment === "production") out.push({ level: "error", msg: `${n.name}: unauthenticated connection is not allowed in production`, nodeId: n.id });
        if (!c.tlsVerify) out.push({ level: spec.environment === "production" ? "error" : "warn", msg: `${n.name}: TLS verification is off for "${c.name}"`, nodeId: n.id });
      }
    }
    if (op.needsAgent) {
      const want = String(n.config.agentLabels ?? "").split(",").map((s) => s.trim()).filter(Boolean).map((s) => s.split("="));
      const match = ctx.agents.filter((a) => a.status === "online" && want.every(([k, v]) => (k === "arch" ? a.arch === v : a.labels[k] === v || (k === "os" && a.os.toLowerCase().includes(v)))));
      if (!match.length) out.push({ level: "error", msg: `${n.name}: no online build agent matches labels "${n.config.agentLabels}"`, nodeId: n.id });
    }
    if (spec.environment === "production" && DEPLOY_OPS.has(n.operator) && !hasApprovalAncestor(n.id)) out.push({ level: "error", msg: `${n.name}: production changes need an approval gate upstream`, nodeId: n.id });
    if (DEPLOY_OPS.has(n.operator) && (n.onFailure ?? op.onFailure) !== "rollback" && !hasRollbackPath) out.push({ level: "warn", msg: `${n.name}: no rollback path. Set failure behavior to rollback or add a Rollback node.`, nodeId: n.id });
    if (n.operator === "cleanup" && spec.environment === "production" && !hasApprovalAncestor(n.id)) out.push({ level: "warn", msg: `${n.name}: destructive cleanup in production should follow an approval`, nodeId: n.id });
    if (n.operator === "deploy_endpoint" && Number(n.config.gpu) > 0) out.push({ level: "info", msg: `${n.name}: requests GPUs. The target must already have drivers and the device plugin. This pipeline never installs or changes them.`, nodeId: n.id });
  });
  if (!spec.nodes.some((n) => OP_BY_KIND[n.operator]?.outputs.length === 0 || !spec.edges.some((e) => e.from === n.id))) out.push({ level: "info", msg: "No terminal operator found" });
  return out;
}

/** Errors plus the draw-only warnings are the reasons a run cannot start. */
export function runBlockers(spec: PipelineSpec, issues: Issue[]): string[] {
  const b = issues.filter((i) => i.level === "error").map((i) => i.msg);
  spec.nodes.forEach((n) => { if (OP_BY_KIND[n.operator]?.executable === "none") b.push(`${n.name} has no execution adapter`); });
  return Array.from(new Set(b));
}

// ---------------------------------------------------------------------------------------------
// Effective configuration

export type EffectiveRow = { key: string; label: string; value: string; source: "default" | "override" | "inherited" | "pipeline" };

export function effectiveConfig(spec: PipelineSpec, n: SpecNode): EffectiveRow[] {
  const op = OP_BY_KIND[n.operator];
  const rows: EffectiveRow[] = [];
  op.params.forEach((p) => {
    const v = n.config[p.key];
    rows.push({ key: p.key, label: p.label, value: String(v ?? ""), source: v === undefined || v === p.default ? "default" : "override" });
  });
  const r = n.retry ?? { max: op.retry.max, backoffMs: op.retry.backoffMs };
  rows.push({ key: "retry.max", label: "Retries", value: String(r.max), source: n.retry ? "override" : "default" });
  rows.push({ key: "retry.backoffMs", label: "Backoff (ms, jittered)", value: String(r.backoffMs), source: n.retry ? "override" : "default" });
  rows.push({ key: "timeoutSec", label: "Timeout (s)", value: String(n.timeoutSec ?? op.timeoutSec), source: n.timeoutSec !== undefined ? "override" : "default" });
  rows.push({ key: "onFailure", label: "On failure", value: n.onFailure ?? op.onFailure, source: n.onFailure ? "override" : "default" });
  rows.push({ key: "environment", label: "Environment", value: spec.environment, source: "inherited" });
  rows.push({ key: "project", label: "Project", value: `${spec.metadata.org}/${spec.metadata.project}`, source: "inherited" });
  if (n.connection) rows.push({ key: "connection", label: "Connection", value: n.connection, source: "override" });
  Object.entries(n.secretRefs ?? {}).forEach(([k, v]) => rows.push({ key: `secret.${k}`, label: `Secret ${k}`, value: v.replace(/^(secretref:\/\/[^/]+\/).*(\/[^/]+)$/, "$1...$2"), source: "override" }));
  return rows;
}

/** Defensive redaction applied to every export, display and snapshot. Values only, references stay. */
export function redactSpec<T>(v: T): T {
  const walk = (x: any, key = ""): any => {
    if (Array.isArray(x)) return x.map((i) => walk(i, key));
    if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, val]) => [k, walk(val, k)]));
    if (typeof x === "string" && SECRET_KEY.test(key) && !x.startsWith("secretref://") && x) return "[redacted]";
    return x;
  };
  return walk(v);
}

// ---------------------------------------------------------------------------------------------
// Digest (real SHA-256 over a canonical form, positions excluded)

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const l = bytes.length;
  const total = (((l + 9 + 63) >> 6) << 6);
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[l] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, Math.floor((l * 8) / 0x100000000));
  dv.setUint32(total - 4, (l * 8) >>> 0);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < total; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  return Array.from(H, (x) => x.toString(16).padStart(8, "0")).join("");
}

const canon = (v: any): any => (Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);

export function specDigest(spec: PipelineSpec): string {
  const stripped = { ...spec, nodes: spec.nodes.map(({ x, y, ...rest }) => rest) };
  return "sha256:" + sha256(JSON.stringify(canon(redactSpec(stripped))));
}

// ---------------------------------------------------------------------------------------------
// YAML (small serializer for display and export)

export function toYaml(v: any, indent = 0): string {
  const pad = "  ".repeat(indent);
  const scalar = (x: any) => {
    if (x === null || x === undefined) return "null";
    if (typeof x === "number" || typeof x === "boolean") return String(x);
    const s = String(x);
    return /^[\w./@:+\-=,$%{}*#\[\]() ]+$/.test(s) && !/^(true|false|null|~|\d.*|-.*|\s.*)$/i.test(s) && !s.includes(": ") && !s.includes(" #") ? s : JSON.stringify(s);
  };
  if (Array.isArray(v)) {
    if (!v.length) return "[]";
    return v.map((i) => {
      if (i && typeof i === "object") {
        const body = toYaml(i, indent + 1).split("\n");
        return `${pad}- ${body[0].trimStart()}${body.length > 1 ? "\n" + body.slice(1).join("\n") : ""}`;
      }
      return `${pad}- ${scalar(i)}`;
    }).join("\n");
  }
  if (v && typeof v === "object") {
    const entries = Object.entries(v).filter(([, x]) => x !== undefined);
    if (!entries.length) return "{}";
    return entries.map(([k, x]) => {
      if (x && typeof x === "object" && (Array.isArray(x) ? x.length : Object.keys(x).length)) return `${pad}${k}:\n${toYaml(x, indent + 1)}`;
      return `${pad}${k}: ${x && typeof x === "object" ? (Array.isArray(x) ? "[]" : "{}") : scalar(x)}`;
    }).join("\n");
  }
  return `${pad}${scalar(v)}`;
}

/** The exportable spec: redacted, without canvas positions. */
export function exportSpec(spec: PipelineSpec) {
  const s = redactSpec(spec);
  return { ...s, nodes: s.nodes.map(({ x, y, ...rest }) => ({ ...rest })) };
}

// ---------------------------------------------------------------------------------------------
// Migration

const LEGACY_ALIAS: Record<string, string> = {
  build: "build_image", validate: "validate_artifact", register: "register_model", deploy: "deploy_endpoint", canary: "canary_rollout",
  verify: "verify_endpoint", promote: "promote", approval: "approval_gate", source: "git_source",
};

/** Migrates tokener.io/v1alpha1 documents ({ steps: [{ id, type, params, after }] }) to v1. */
export function migrateSpec(raw: any): { spec: PipelineSpec; notes: string[] } {
  const notes: string[] = [];
  if (raw?.apiVersion === SPEC_API_VERSION) {
    let changed = false;
    const nodes = (raw.nodes as SpecNode[]).map((n) => {
      const op = OP_BY_KIND[n.operator];
      if (op && n.schemaVersion !== op.schemaVersion) {
        changed = true;
        notes.push(`${n.id}: schemaVersion ${n.schemaVersion} -> ${op.schemaVersion}`);
        return { ...n, schemaVersion: op.schemaVersion, config: { ...defaultConfig(n.operator), ...n.config } };
      }
      return n;
    });
    if (!changed) notes.push("Already current. No changes.");
    return { spec: { ...raw, nodes }, notes };
  }
  const steps: any[] = raw?.steps ?? [];
  const spec = newSpec(raw?.name ?? "migrated-pipeline", (raw?.environment as Env) ?? "development");
  steps.forEach((s, i) => {
    const kind = LEGACY_ALIAS[s.type] ?? s.type;
    if (!OP_BY_KIND[kind]) { notes.push(`Skipped unknown step type "${s.type}"`); return; }
    spec.nodes.push({ id: s.id ?? `step-${i}`, operator: kind, schemaVersion: OP_BY_KIND[kind].schemaVersion, name: s.name ?? OP_BY_KIND[kind].label, x: 0, y: 0, config: { ...defaultConfig(kind), ...(s.params ?? {}) } });
    if (LEGACY_ALIAS[s.type]) notes.push(`${s.id}: type "${s.type}" -> operator "${kind}"`);
  });
  let cur = spec;
  steps.forEach((s) => (s.after ?? []).forEach((a: string) => {
    const r = autoConnect(cur, a, s.id);
    if (r.error) notes.push(`Could not connect ${a} to ${s.id}: ${r.error}`);
    else cur = r.spec;
  }));
  notes.push("Connections must be reselected. Legacy documents referenced hosts directly.");
  return { spec: autoLayoutSpec(cur), notes };
}

export const operatorPorts = (n: SpecNode): { inputs: Port[]; outputs: Port[] } => {
  const op = OP_BY_KIND[n.operator];
  return { inputs: op?.inputs ?? [], outputs: op?.outputs ?? [] };
};

export const OPERATOR_COUNT = OPERATORS.length;

/** Assign the first healthy, same-environment, supported connection to every operator that needs one and has none. */
export function autoAssignConnections(spec: PipelineSpec, connections: Connection[]): { spec: PipelineSpec; assigned: number } {
  let assigned = 0;
  const nodes = spec.nodes.map((n) => {
    const op = OP_BY_KIND[n.operator];
    if (!op?.needsConnection || n.connection) return n;
    const c = connections.find((x) => x.env === spec.environment && x.health === "healthy" && (!op.targets.length || op.targets.includes(x.integrationId)) && (!["deploy_endpoint", "canary_rollout", "promote", "agent_service", "register_model", "build_image", "store_documents", "vector_index"].includes(n.operator) || x.permissions === "read-write"));
    if (!c) return n;
    assigned++;
    return { ...n, connection: c.id };
  });
  return { spec: { ...spec, nodes }, assigned };
}

export type SpecDiff = { added: string[]; removed: string[]; changed: { node: string; keys: string[] }[]; edgesAdded: number; edgesRemoved: number; envChanged?: [Env, Env] };

/** Human-readable difference between two specs, by node id. */
export function diffSpecs(a: PipelineSpec | undefined, b: PipelineSpec): SpecDiff {
  if (!a) return { added: b.nodes.map((n) => n.name), removed: [], changed: [], edgesAdded: b.edges.length, edgesRemoved: 0 };
  const am = new Map(a.nodes.map((n) => [n.id, n])), bm = new Map(b.nodes.map((n) => [n.id, n]));
  const changed: SpecDiff["changed"] = [];
  b.nodes.forEach((n) => {
    const o = am.get(n.id);
    if (!o) return;
    const keys = new Set([...Object.keys(o.config), ...Object.keys(n.config)]);
    const diff = [...keys].filter((k) => JSON.stringify(o.config[k]) !== JSON.stringify(n.config[k]));
    if (o.connection !== n.connection) diff.push("connection");
    if (JSON.stringify(o.retry) !== JSON.stringify(n.retry) || o.timeoutSec !== n.timeoutSec || o.onFailure !== n.onFailure) diff.push("reliability");
    if (diff.length) changed.push({ node: n.name, keys: diff });
  });
  const ek = (e: SpecEdge) => `${e.from}.${e.fromPort}>${e.to}.${e.toPort}`;
  const ae = new Set(a.edges.map(ek)), be = new Set(b.edges.map(ek));
  return {
    added: b.nodes.filter((n) => !am.has(n.id)).map((n) => n.name), removed: a.nodes.filter((n) => !bm.has(n.id)).map((n) => n.name), changed,
    edgesAdded: [...be].filter((x) => !ae.has(x)).length, edgesRemoved: [...ae].filter((x) => !be.has(x)).length,
    envChanged: a.environment !== b.environment ? [a.environment, b.environment] : undefined,
  };
}

/** The exported form of a spec: positions removed, so a layout change alone is not a change to the pipeline. Secrets are only ever references. */
export function exportYaml(spec: PipelineSpec): string {
  const { nodes, ...rest } = spec;
  return toYaml({ ...rest, nodes: nodes.map(({ x: _x, y: _y, ...n }) => n) }) + "\n";
}
