import type { Agent } from "./types";
import { sensitiveTools, totals } from "./store-math";
import type { Access } from "./access";

/** How two agents talk. The first four are in docs/48 and the adapters; "queue" is event delivery through a broker. */
export type Protocol = "tap" | "a2a" | "mcp" | "https" | "queue";
export const PROTOCOLS: { id: Protocol; label: string; color: string; blurb: string }[] = [
  { id: "tap", label: "TAP", color: "#0A8F6A", blurb: "tok∑ner Agent Protocol. Signed, traced and governed." },
  { id: "a2a", label: "A2A", color: "#2563EB", blurb: "Agent2Agent, for agents on other platforms." },
  { id: "mcp", label: "MCP", color: "#D9730D", blurb: "One agent offered to another as a tool." },
  { id: "https", label: "HTTPS", color: "#64748B", blurb: "A plain request and response with a bearer token." },
  { id: "queue", label: "Events", color: "#9333EA", blurb: "Messages through a broker. The sender does not wait." },
];
export const PROTOCOL_BY_ID = Object.fromEntries(PROTOCOLS.map((p) => [p.id, p])) as Record<Protocol, (typeof PROTOCOLS)[number]>;

export type Link = { id: string; from: string; to: string; protocol: Protocol; purpose: string; messages24h: number; p95Ms: number; errorRate: number; auth: "jwt" | "mtls" | "token" | "none"; measured: boolean; types?: string[] };
/**
 * Where an agent can be reached from outside. An exposure on the gateway carries `access` (interfaces, API keys, signing secret, limits).
 * One recorded as public-url or webhook is only declared: tok∑ner does not see its traffic, so it has no keys to manage.
 */
export type Exposure = { agentId: string; via: "gateway" | "public-url" | "webhook"; url: string; auth: "jwt" | "app-key" | "none"; requests24h: number; access?: Access };
export type PolicyKind = "budget" | "approval" | "data" | "rate" | "egress";
export const POLICY_KINDS: { id: PolicyKind; label: string; color: string; blurb: string }[] = [
  { id: "budget", label: "Budget", color: "#CA8A04", blurb: "A monthly spend limit that stops calls when reached." },
  { id: "approval", label: "Approval", color: "#DB2777", blurb: "A person approves named tools before they run." },
  { id: "data", label: "Data protection", color: "#0891B2", blurb: "Personal data is masked, or data stays in a region." },
  { id: "rate", label: "Rate limit", color: "#4F46E5", blurb: "A cap on calls per minute." },
  { id: "egress", label: "Network egress", color: "#92400E", blurb: "The agent may reach only listed hosts." },
];
export const POLICY_BY_ID = Object.fromEntries(POLICY_KINDS.map((p) => [p.id, p])) as Record<PolicyKind, (typeof POLICY_KINDS)[number]>;
export type Policy = { id: string; kind: PolicyKind; name: string; detail: string; scope: { agents: string[] } | { department: string } };
export type Live = { running: number; queued: number; pendingApprovals: number };
export type AppliedPolicy = { kind: PolicyKind; name: string; detail: string; scope: "agent" | "department"; enforced: boolean };

export const STATE_COLORS = { ok: "#10B981", failed: "#DC2626", waiting: "#F59E0B", idle: "#9CA3AF" };

/** The policies that apply to an agent: those it carries itself, those its department carries, and the budget and approval rules read from the agent. */
export function policiesFor(a: Agent, policies: Policy[]): AppliedPolicy[] {
  const enforced = a.control === "governed";
  const out: AppliedPolicy[] = [];
  if (a.budget.monthlyUsd > 0) out.push({ kind: "budget", name: "Monthly budget", detail: `$${a.budget.monthlyUsd.toLocaleString("en-US")} a month`, scope: "agent", enforced });
  const approvals = a.tools.filter((t) => t.approval);
  if (approvals.length) out.push({ kind: "approval", name: "Approval before use", detail: approvals.map((t) => `${t.server}.${t.tool}`).join(", "), scope: "agent", enforced });
  if (a.spec?.guardrails.maskPersonalData) out.push({ kind: "data", name: "Mask personal data", detail: "Names, emails and numbers are masked before a model sees them", scope: "agent", enforced });
  for (const p of policies) {
    const mine = "agents" in p.scope ? p.scope.agents.includes(a.id) : p.scope.department === a.department;
    if (mine) out.push({ kind: p.kind, name: p.name, detail: p.detail, scope: "agents" in p.scope ? "agent" : "department", enforced });
  }
  return out;
}

/** The share of runs in the last seven days that succeeded or failed, and how many are waiting for a person. Drives the ring around each agent. */
export function ringSegments(a: Agent, live?: Live) {
  const t = totals(a, 7);
  const waiting = live?.pendingApprovals ?? 0;
  const total = t.executions + waiting;
  if (a.state !== "active" || a.control === "inventory" || total === 0) return [];
  return [
    { kind: "ok", n: t.executions - t.failures, color: STATE_COLORS.ok },
    { kind: "waiting", n: waiting, color: STATE_COLORS.waiting },
    { kind: "failed", n: t.failures, color: STATE_COLORS.failed },
  ].filter((s) => s.n > 0).map((s) => ({ ...s, share: s.n / total }));
}

export type Health = "healthy" | "degraded" | "failing" | "suspended" | "retired" | "unmeasured";
export function healthOf(a: Agent): Health {
  if (a.state === "retired") return "retired";
  if (a.state === "suspended") return "suspended";
  if (a.control === "inventory") return "unmeasured";
  const t = totals(a, 7);
  const share = a.budget.monthlyUsd ? a.budget.spentUsd / a.budget.monthlyUsd : 0;
  if ((t.executions >= 50 && t.failureRate > 0.08) || share >= 1) return "failing";
  if ((t.executions >= 50 && t.failureRate > 0.04) || share >= 0.9) return "degraded";
  return "healthy";
}
export const HEALTH_LABEL: Record<Health, string> = { healthy: "Healthy", degraded: "Needs a look", failing: "Failing", suspended: "Suspended", retired: "Retired", unmeasured: "Not measured" };
export const HEALTH_COLOR: Record<Health, string> = { healthy: "#10B981", degraded: "#F59E0B", failing: "#DC2626", suspended: "#9CA3AF", retired: "#9CA3AF", unmeasured: "#9CA3AF" };
export { sensitiveTools };

// ---------------------------------------------------------------------------------------------------------------------------------------
// Geometry. World units: one agent circle has radius R. The canvas scales and moves the whole world.

export const R = 36;
export const RING = 7;
export const ORBIT = R + 17;
export type Pt = { x: number; y: number };
export type GroupBox = { name: string; x: number; y: number; w: number; h: number; members: string[] };

/** Places agents in one box per department, boxes packed left to right in rows. The result is a starting point: people drag agents where they want them. */
export function layout(agents: Agent[], preferred?: string[]): { pos: Record<string, Pt>; cloud: Pt } {
  const byDept = new Map<string, Agent[]>();
  for (const a of agents) byDept.set(a.department, [...(byDept.get(a.department) ?? []), a]);
  const order = [...byDept.keys()].sort((x, y) => (preferred ? (preferred.indexOf(x) < 0 ? 99 : preferred.indexOf(x)) - (preferred.indexOf(y) < 0 ? 99 : preferred.indexOf(y)) : 0) || (byDept.get(y)!.length - byDept.get(x)!.length) || x.localeCompare(y));
  const GX = 250, GY = 290, PAD = 80, GAP = 80, MAXW = 1500;
  const pos: Record<string, Pt> = {}; let x = 0, y = 0, rowH = 0;
  for (const d of order) {
    const list = byDept.get(d)!; const cols = Math.min(list.length, 3); const rows = Math.ceil(list.length / cols);
    const w = (cols - 1) * GX + PAD * 2 + 2 * R, h = (rows - 1) * GY + PAD * 2 + 2 * R + 30;
    if (x > 0 && x + w > MAXW) { x = 0; y += rowH + GAP; rowH = 0; }
    list.forEach((a, i) => { pos[a.id] = { x: x + PAD + R + (i % cols) * GX, y: y + PAD + R + 30 + Math.floor(i / cols) * GY }; });
    x += w + GAP; rowH = Math.max(rowH, h);
  }
  const xs = Object.values(pos).map((p) => p.x);
  const cx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
  const top = Object.values(pos).reduce((m, p) => Math.min(m, p.y), 0);
  return { pos, cloud: { x: cx, y: top - 190 } };
}

export function groupBoxes(agents: Agent[], pos: Record<string, Pt>): GroupBox[] {
  const by = new Map<string, Agent[]>();
  for (const a of agents) if (pos[a.id]) by.set(a.department, [...(by.get(a.department) ?? []), a]);
  return [...by.entries()].map(([name, list]) => {
    const xs = list.map((a) => pos[a.id].x), ys = list.map((a) => pos[a.id].y);
    const px = 66, top = 78, bottom = 96;
    return { name, x: Math.min(...xs) - R - px, y: Math.min(...ys) - R - top, w: Math.max(...xs) - Math.min(...xs) + 2 * (R + px), h: Math.max(...ys) - Math.min(...ys) + 2 * R + top + bottom, members: list.map((a) => a.id) };
  });
}

/**
 * The path of a link between two agents, drawn rim to rim. Links between the same two agents are bowed apart. The offset is measured against a fixed
 * orientation of the pair (reversed says this link runs against it), so a link each way never lands on the same line.
 */
export function linkPath(a: Pt, b: Pt, index: number, count: number, reversed: boolean) {
  const dx = b.x - a.x, dy = b.y - a.y; const len = Math.hypot(dx, dy) || 1; const ux = dx / len, uy = dy / len;
  const gap = R + RING + 10;
  const s = { x: a.x + ux * gap, y: a.y + uy * gap }, e = { x: b.x - ux * (gap + 8), y: b.y - uy * (gap + 8) };
  const off = (index - (count - 1) / 2) * 92 * (reversed ? -1 : 1);
  const c = { x: (s.x + e.x) / 2 - uy * off, y: (s.y + e.y) / 2 + ux * off };
  const mid = { x: 0.25 * s.x + 0.5 * c.x + 0.25 * e.x, y: 0.25 * s.y + 0.5 * c.y + 0.25 * e.y };
  return { d: `M${s.x.toFixed(1)} ${s.y.toFixed(1)} Q${c.x.toFixed(1)} ${c.y.toFixed(1)} ${e.x.toFixed(1)} ${e.y.toFixed(1)}`, mid };
}

/** An arc of a circle as an SVG path, in degrees clockwise from twelve o'clock. */
export function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const p = (deg: number) => { const t = ((deg - 90) * Math.PI) / 180; return [cx + r * Math.cos(t), cy + r * Math.sin(t)]; };
  const [x1, y1] = p(from), [x2, y2] = p(to);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}
