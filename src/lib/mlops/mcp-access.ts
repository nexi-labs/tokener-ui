/**
 * Who may call an MCP server and what they may call. A server is closed by default: a caller with no active grant is refused and the attempt is
 * audited. A grant names one principal (a person, a group, an application or a service account), the tools it covers, whether it may use tools that
 * change data, its own rate limit, and an optional expiry. Pure data and functions, no React and no storage, so the same rules run in the
 * console, in the Node checks and on the server that enforces them.
 */
import type { McpServerSpec, McpTool } from "./mcp-model";

export type PrincipalKind = "user" | "group" | "app" | "service-account";
export const KIND_LABEL: Record<PrincipalKind, string> = { user: "Person", group: "Group", app: "Application", "service-account": "Service account" };
export type Principal = { kind: PrincipalKind; id: string; label: string; detail?: string };

/** A sample directory. A signed-in workspace reads people and groups from IAM and applications from the client registry. */
export const SAMPLE_DIRECTORY: Principal[] = [
  { kind: "user", id: "u-maria", label: "Maria Kowalski", detail: "Support lead" },
  { kind: "user", id: "u-ahmed", label: "Ahmed Al-Sayed", detail: "Data engineer" },
  { kind: "user", id: "u-chen", label: "Chen Wei", detail: "ML engineer" },
  { kind: "group", id: "g-support", label: "support-agents", detail: "38 members" },
  { kind: "group", id: "g-platform", label: "platform-engineering", detail: "12 members" },
  { kind: "group", id: "g-ds", label: "data-science", detail: "21 members" },
  { kind: "app", id: "a-portal", label: "advisor-portal", detail: "Java client" },
  { kind: "app", id: "a-mobile", label: "mobile-banking-app", detail: "Node client" },
  { kind: "app", id: "a-notebook", label: "notebook-sandbox", detail: "Python client" },
  { kind: "service-account", id: "s-recsys", label: "svc-recsys", detail: "Recommendation service" },
  { kind: "service-account", id: "s-ci", label: "svc-ci", detail: "Build pipelines" },
];

export type ToolScope = "reads" | "changes";
export type Grant = {
  id: string; serverId: string; principal: Principal;
  /** "all" covers every tool now and any added later, up to the scopes below. */
  tools: "all" | string[];
  /** "reads" allows tools that only read. "changes" adds tools that change data, which still wait for a person's approval where the tool says so. */
  scope: ToolScope;
  /** Calls per minute for this principal. Never above the server's own limit. */
  ratePerMinute: number;
  expiresAt?: string;
  note: string;
  createdBy: string; createdAt: string;
  status: "active" | "revoked";
  revokedAt?: string;
  /** Applications and service accounts call with a key. Only its prefix is kept, the value is shown once at creation. */
  key?: { prefix: string; issuedAt: string };
};

export type Verdict = { allowed: boolean; code: "allowed" | "no-grant" | "revoked" | "expired" | "tool-not-covered" | "needs-changes-scope" | "unknown-tool"; reason: string; ratePerMinute?: number; needsApproval?: boolean };

export const isExpired = (g: Grant, now = Date.now()) => !!g.expiresAt && Date.parse(g.expiresAt) <= now;

/** Decides one call. When several grants match, the first that allows wins, so a narrow grant never hides a broader one. */
export function decide(grants: Grant[], serverId: string, principalId: string, tool: McpTool | undefined, now = Date.now()): Verdict {
  if (!tool) return { allowed: false, code: "unknown-tool", reason: "This server has no such tool." };
  const mine = grants.filter((g) => g.serverId === serverId && g.principal.id === principalId);
  if (!mine.length) return { allowed: false, code: "no-grant", reason: "No grant for this caller. Servers are closed by default, so the call is refused and the attempt is audited." };
  let best: Verdict | null = null;
  for (const g of mine) {
    let v: Verdict;
    if (g.status === "revoked") v = { allowed: false, code: "revoked", reason: "The grant was revoked." };
    else if (isExpired(g, now)) v = { allowed: false, code: "expired", reason: "The grant has expired." };
    else if (g.tools !== "all" && !g.tools.includes(tool.id)) v = { allowed: false, code: "tool-not-covered", reason: "The grant does not cover this tool." };
    else if (tool.effect === "changes" && g.scope !== "changes") v = { allowed: false, code: "needs-changes-scope", reason: "This tool changes data and the grant allows reading only." };
    else return { allowed: true, code: "allowed", reason: tool.approval ? "Allowed. A person must approve the call before it runs." : "Allowed.", ratePerMinute: g.ratePerMinute, needsApproval: tool.approval };
    best ??= v;
  }
  return best!;
}

export type GrantInput = { serverId: string; principal: Principal; tools: "all" | string[]; scope: ToolScope; ratePerMinute: number; expiresInDays: number | null; note: string };

export function validateGrant(i: GrantInput, server: McpServerSpec, existing: Grant[]): string | null {
  if (!i.principal.id) return "Choose who gets access.";
  if (i.tools !== "all" && i.tools.length === 0) return "Choose at least one tool, or all tools.";
  if (i.tools !== "all" && i.tools.some((t) => !server.tools.some((x) => x.id === t))) return "A selected tool no longer exists.";
  if (!Number.isInteger(i.ratePerMinute) || i.ratePerMinute < 1) return "The rate limit is a whole number of calls per minute, at least 1.";
  if (i.ratePerMinute > server.ratePerMinute) return `The rate limit cannot exceed the server's own limit of ${server.ratePerMinute} per minute.`;
  if (i.scope === "changes") {
    const covered = i.tools === "all" ? server.tools : server.tools.filter((t) => (i.tools as string[]).includes(t.id));
    if (!covered.some((t) => t.effect === "changes")) return "None of the chosen tools change data, so the change scope has no effect. Choose reads only.";
    if (i.principal.kind === "group" && i.tools === "all") return "A whole group should not get every tool that changes data. Choose the tools, so each is a deliberate decision.";
  }
  if (!i.note.trim() || i.note.trim().length < 8) return "Say why this access is needed, in at least 8 characters. It is kept in the audit record.";
  if (existing.some((g) => g.serverId === i.serverId && g.principal.id === i.principal.id && g.status === "active" && !isExpired(g))) return "This caller already has an active grant. Revoke it first, or change that one.";
  if (server.auth === "none") return "This server has no authentication, so a grant cannot be enforced. Set the access setting to API key, OAuth or mutual TLS first.";
  return null;
}

export function newKey(): { value: string; prefix: string } {
  const bytes = new Uint8Array(24);
  (globalThis.crypto ?? { getRandomValues: (a: Uint8Array) => a.map(() => Math.floor(Math.random() * 256)) }).getRandomValues(bytes);
  const b = Array.from(bytes, (x) => x.toString(36).padStart(2, "0")).join("").slice(0, 40);
  return { value: `tok_mcp_${b}`, prefix: `tok_mcp_${b.slice(0, 6)}` };
}

export const needsKey = (p: Principal) => p.kind === "app" || p.kind === "service-account";
