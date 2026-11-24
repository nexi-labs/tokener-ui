/**
 * Roles and permissions for a customer organization.
 *
 * The platform ships a fixed set of roles (Role Management, for operators). A customer organization needs more than that: its own roles built from
 * the permissions the platform defines, groups of people, and grants that say who holds which role over which part of the organization
 * (the whole organization, one tenant, one department or one project). Nothing here widens what the platform allows. A custom role is a named
 * subset of permissions, a grant never exceeds what the person granting holds, and the last organization admin cannot be removed.
 *
 * Built-in role holders come from People and access, so the same person is never granted twice in two places. This module adds custom roles,
 * groups, and grants of custom roles.
 */
import type { RoleAssignment } from "@/lib/auth/client";

export type ScopeKind = "org" | "tenant" | "department" | "project";
export type ScopeRef = { type: ScopeKind; id?: string };

export type OrgRole = { id: string; name: string; description: string; permissions: string[]; builtin: boolean; scopes: ScopeKind[]; createdAt?: string; createdBy?: string };
export type Group = { id: string; name: string; description: string; members: string[] };
export type Grant = { id: string; subject: { kind: "user" | "group"; id: string }; roleId: string; scope: ScopeRef; createdAt: string; createdBy: string; source: "people" | "custom" };

/** The part of the organization tree that scopes need to resolve each other. */
export type Tree = {
  tenants: { id: string; name: string }[];
  departments: { id: string; tenantId: string; name: string }[];
  projects: { id: string; departmentId: string; name: string }[];
};
export type Person = { id: string; name: string; email: string; disabled?: boolean };

// ------------------------------------------------------------------------------------------------------------------------------------
// Permissions

export const RESOURCES: { id: string; label: string; group: string; note?: string }[] = [
  { id: "analytics", label: "Analytics", group: "Observe" }, { id: "usage", label: "Usage", group: "Observe" }, { id: "traces", label: "Traces", group: "Observe" },
  { id: "audit", label: "Audit trail", group: "Observe" }, { id: "cost", label: "Cost", group: "Money" }, { id: "budgets", label: "Budgets", group: "Money" }, { id: "billing", label: "Billing", group: "Money" }, { id: "quotas", label: "Quotas", group: "Money" },
  { id: "models", label: "Models", group: "Build" }, { id: "providers", label: "Providers", group: "Build" }, { id: "pipelines", label: "Pipelines", group: "Build" }, { id: "documents", label: "Documents", group: "Build" },
  { id: "api-keys", label: "API keys", group: "Access" }, { id: "service-accounts", label: "Service accounts", group: "Access" }, { id: "policies", label: "Policies", group: "Access" }, { id: "notifications", label: "Notifications", group: "Access" },
  { id: "tenants", label: "Tenants and projects", group: "Organization" }, { id: "users", label: "People and roles", group: "Organization", note: "Whoever holds this can change who has access." },
  { id: "agents", label: "Agents", group: "Agent OS", note: "Needs the Agent OS API." }, { id: "approvals", label: "Agent approvals", group: "Agent OS", note: "Needs the Agent OS API." },
];
const ACTIONS: Record<string, string[]> = { audit: ["read", "export"], usage: ["read"], cost: ["read", "write"], approvals: ["decide"], analytics: ["read"], traces: ["read"] };
export const actionsOf = (resource: string) => ACTIONS[resource] ?? ["read", "write"];
export const PERMISSIONS: string[] = RESOURCES.flatMap((r) => actionsOf(r.id).map((a) => `${r.id}:${a}`));
export const ACTION_LABEL: Record<string, string> = { read: "See", write: "Change", export: "Export", decide: "Decide" };
export const RESOURCE_LABEL = Object.fromEntries(RESOURCES.map((r) => [r.id, r.label]));
export const permissionLabel = (p: string) => { const [r, a] = p.split(":"); return `${ACTION_LABEL[a] ?? a} ${(RESOURCE_LABEL[r] ?? r).toLowerCase()}`; };
/** Permissions that let the holder change access or money. A role with one deserves a second look. */
export const SENSITIVE = new Set(["users:write", "billing:write", "api-keys:write", "audit:export", "tenants:write"]);

// ------------------------------------------------------------------------------------------------------------------------------------
// Built-in roles

export const BUILTIN_SUMMARY: Record<string, string> = {
  org_admin: "Full access across every tenant in the organization, including people and billing.",
  tenant_admin: "Manages policies, budgets, providers and applications inside the tenants they are assigned.",
  finance: "Reads cost data and manages budgets and chargeback; no access to prompts or responses.",
  security_auditor: "Read-only access to the audit trail, policies and traces, with audit export.",
  developer: "Builds and runs applications, pipelines and API keys inside the tenants they are assigned.",
  viewer: "Read-only access to dashboards and analytics.",
};
const BUILTIN_NAME: Record<string, string> = { org_admin: "Organization admin", tenant_admin: "Tenant admin", finance: "Finance", security_auditor: "Security auditor", developer: "Developer", viewer: "Viewer" };

/** The platform's roles that a customer can hold. The platform operator role is the platform's own and is never shown here. */
export function builtinRoles(info: { role: string; scopes: string[]; permissions: string[] }[]): OrgRole[] {
  return info.filter((r) => r.role !== "platform_operator").map((r) => ({
    id: r.role, name: BUILTIN_NAME[r.role] ?? r.role.replace(/_/g, " "), description: BUILTIN_SUMMARY[r.role] ?? "", permissions: [...r.permissions].sort(), builtin: true,
    scopes: r.scopes.flatMap((s) => (s === "org" ? ["org"] : s === "tenant" ? ["tenant", "department", "project"] : [])) as ScopeKind[],
  }));
}

// ------------------------------------------------------------------------------------------------------------------------------------
// Scopes

export function scopeName(s: ScopeRef, t: Tree, orgName = "The organization"): string {
  if (s.type === "org") return orgName;
  if (s.type === "tenant") return t.tenants.find((x) => x.id === s.id)?.name ?? "Unknown tenant";
  if (s.type === "department") { const d = t.departments.find((x) => x.id === s.id); return d ? `${d.name}, ${t.tenants.find((x) => x.id === d.tenantId)?.name ?? ""}` : "Unknown department"; }
  const p = t.projects.find((x) => x.id === s.id); const d = t.departments.find((x) => x.id === p?.departmentId);
  return p ? `${p.name}, ${d?.name ?? ""}` : "Unknown project";
}
export const scopeKindLabel: Record<ScopeKind, string> = { org: "Organization", tenant: "Tenant", department: "Department", project: "Project" };
export const scopeExists = (s: ScopeRef, t: Tree) => s.type === "org" || (s.type === "tenant" ? t.tenants.some((x) => x.id === s.id) : s.type === "department" ? t.departments.some((x) => x.id === s.id) : t.projects.some((x) => x.id === s.id));

/** The chain from the target up to the organization: a project sits in a department, which sits in a tenant. */
export function ancestry(s: ScopeRef, t: Tree): ScopeRef[] {
  const out: ScopeRef[] = [s];
  if (s.type === "project") { const d = t.departments.find((x) => x.id === t.projects.find((p) => p.id === s.id)?.departmentId); if (d) { out.push({ type: "department", id: d.id }, { type: "tenant", id: d.tenantId }); } }
  else if (s.type === "department") { const d = t.departments.find((x) => x.id === s.id); if (d) out.push({ type: "tenant", id: d.tenantId }); }
  out.push({ type: "org" });
  return out;
}
/** A grant at one level covers that level and everything below it. */
export const covers = (grant: ScopeRef, target: ScopeRef, t: Tree) => ancestry(target, t).some((a) => a.type === grant.type && (a.type === "org" || a.id === grant.id));

// ------------------------------------------------------------------------------------------------------------------------------------
// Who holds what

/** Built-in role holders from People and access, as grants. They are read only here. */
export function peopleGrants(users: { id: string; assignments: RoleAssignment[] }[], orgId: string, now = new Date(0).toISOString()): Grant[] {
  return users.flatMap((u) => u.assignments.filter((a) => a.role !== "platform_operator").map((a, i) => ({
    id: `people:${u.id}:${a.role}:${i}`, subject: { kind: "user" as const, id: u.id }, roleId: a.role, scope: a.scope.type === "tenant" ? { type: "tenant" as const, id: a.scope.id ?? undefined } : { type: "org" as const, id: orgId },
    createdAt: now, createdBy: "People and access", source: "people" as const,
  })));
}

export type Access = { permissions: Map<string, { grant: Grant; role: OrgRole; via?: Group }[]> };

/** Everything one person can do at a place, with the grants that give each permission. A person gets the grants made to them and to the groups they are in. */
export function effectiveAccess(personId: string, target: ScopeRef, grants: Grant[], roles: OrgRole[], groups: Group[], tree: Tree): Access {
  const mine = new Set(groups.filter((g) => g.members.includes(personId)).map((g) => g.id));
  const permissions: Access["permissions"] = new Map();
  for (const g of grants) {
    const via = g.subject.kind === "group" ? groups.find((x) => x.id === g.subject.id) : undefined;
    if (!(g.subject.kind === "user" ? g.subject.id === personId : mine.has(g.subject.id))) continue;
    if (!covers(g.scope, target, tree)) continue;
    const role = roles.find((r) => r.id === g.roleId); if (!role) continue;
    for (const p of role.permissions) { const l = permissions.get(p) ?? []; l.push({ grant: g, role, via }); permissions.set(p, l); }
  }
  return { permissions };
}
export const can = (a: Access, permission: string) => a.permissions.has(permission);

// ------------------------------------------------------------------------------------------------------------------------------------
// Validation

export type Issue = { level: "error" | "warning"; message: string; path?: string };

export function validateRole(r: Pick<OrgRole, "id" | "name" | "permissions" | "scopes">, all: OrgRole[]): Issue[] {
  const out: Issue[] = []; const err = (message: string, path?: string) => out.push({ level: "error", message, path }); const warn = (message: string, path?: string) => out.push({ level: "warning", message, path });
  const name = r.name.trim();
  if (name.length < 3 || name.length > 40) err("Give the role a name of 3 to 40 characters.", "name");
  else if (all.some((x) => x.id !== r.id && x.name.trim().toLowerCase() === name.toLowerCase())) err(`A role named ${name} already exists.`, "name");
  if (r.permissions.length === 0) err("Choose at least one permission. A role with none does nothing.", "permissions");
  for (const p of r.permissions) {
    if (!PERMISSIONS.includes(p)) err(`${p} is not a permission the platform knows.`, "permissions");
    const [res, act] = p.split(":");
    if (act === "write" && actionsOf(res).includes("read") && !r.permissions.includes(`${res}:read`)) err(`To change ${(RESOURCE_LABEL[res] ?? res).toLowerCase()}, a person must also be able to see it.`, "permissions");
  }
  if (r.scopes.length === 0) err("Choose where the role can be granted.", "scopes");
  const sens = r.permissions.filter((p) => SENSITIVE.has(p));
  if (sens.length) warn(`Holders can ${sens.map((p) => permissionLabel(p).toLowerCase()).join(", ")}. Grant it only to people who should.`, "permissions");
  if (r.permissions.includes("users:write") && r.scopes.some((s) => s !== "org")) warn("Changing people and roles below the organization level does not stop a holder from seeing the whole directory.", "scopes");
  return out;
}

export type Ctx = { roles: OrgRole[]; groups: Group[]; grants: Grant[]; people: Person[]; tree: Tree; actorId: string };

/** What the person making a grant may hand out: the permissions they hold at that place. Nobody can give away more than they have. */
export function validateGrant(g: Omit<Grant, "id" | "createdAt" | "createdBy" | "source">, c: Ctx): Issue[] {
  const out: Issue[] = []; const err = (message: string, path?: string) => out.push({ level: "error", message, path });
  const role = c.roles.find((r) => r.id === g.roleId);
  if (!role) { err("That role does not exist.", "roleId"); return out; }
  if (g.subject.kind === "user") { const p = c.people.find((x) => x.id === g.subject.id); if (!p) err("That person is not in this organization.", "subject"); else if (p.disabled) err(`${p.name} is disabled and cannot be given a role.`, "subject"); }
  else if (!c.groups.some((x) => x.id === g.subject.id)) err("That group does not exist.", "subject");
  if (!scopeExists(g.scope, c.tree)) err("That part of the organization does not exist.", "scope");
  else if (!role.scopes.includes(g.scope.type)) err(`${role.name} cannot be granted at the ${scopeKindLabel[g.scope.type].toLowerCase()} level. It applies to ${role.scopes.map((s) => scopeKindLabel[s].toLowerCase()).join(", ")}.`, "scope");
  if (c.grants.some((x) => x.roleId === g.roleId && x.subject.kind === g.subject.kind && x.subject.id === g.subject.id && x.scope.type === g.scope.type && (x.scope.id ?? "") === (g.scope.id ?? ""))) err("That grant already exists.", "grant");
  if (out.length === 0) {
    const mine = effectiveAccess(c.actorId, g.scope, c.grants, c.roles, c.groups, c.tree);
    // An organization admin holds every customer permission in the organization, so there is nothing to escalate to.
    const orgAdmin = c.grants.some((x) => x.roleId === "org_admin" && covers(x.scope, g.scope, c.tree) && (x.subject.kind === "user" ? x.subject.id === c.actorId : (c.groups.find((gr) => gr.id === x.subject.id)?.members ?? []).includes(c.actorId)));
    if (!orgAdmin && !can(mine, "users:write")) err("You need permission to manage people and roles here before you can give anyone access.", "escalation");
    const missing = orgAdmin ? [] : role.permissions.filter((p) => !can(mine, p));
    if (missing.length) err(`You cannot grant ${role.name} here because you do not hold ${missing.slice(0, 3).map((p) => permissionLabel(p).toLowerCase()).join(", ")}${missing.length > 3 ? ` and ${missing.length - 3} more` : ""} there yourself.`, "escalation");
  }
  return out;
}

export function validateRevoke(grantId: string, c: Ctx): Issue[] {
  const g = c.grants.find((x) => x.id === grantId); if (!g) return [{ level: "error", message: "That grant does not exist." }];
  if (g.source === "people") return [{ level: "error", message: "This is a built-in role. Change it in People and access." }];
  return [];
}

export function validateDeleteRole(id: string, c: Ctx): Issue[] {
  const r = c.roles.find((x) => x.id === id); if (!r) return [{ level: "error", message: "That role does not exist." }]; if (r.builtin) return [{ level: "error", message: "Built-in roles come from the platform and cannot be deleted." }];
  const n = c.grants.filter((g) => g.roleId === id).length;
  return n ? [{ level: "error", message: `${n} ${n === 1 ? "grant uses" : "grants use"} ${r.name}. Remove ${n === 1 ? "it" : "them"} first, so nobody loses access without you meaning it.` }] : [];
}

export function validateGroup(g: Pick<Group, "id" | "name" | "members">, c: Pick<Ctx, "groups" | "people">): Issue[] {
  const out: Issue[] = []; const name = g.name.trim();
  if (name.length < 3 || name.length > 40) out.push({ level: "error", message: "Give the group a name of 3 to 40 characters.", path: "name" });
  else if (c.groups.some((x) => x.id !== g.id && x.name.trim().toLowerCase() === name.toLowerCase())) out.push({ level: "error", message: `A group named ${name} already exists.`, path: "name" });
  for (const m of g.members) if (!c.people.some((p) => p.id === m)) out.push({ level: "error", message: `${m} is not in this organization.`, path: "members" });
  if (g.members.length === 0) out.push({ level: "warning", message: "The group has no members, so granting it a role gives nobody access.", path: "members" });
  return out;
}

/** The groups a grant of a custom role would be lost with if a group were deleted. */
export const grantsOfGroup = (id: string, grants: Grant[]) => grants.filter((g) => g.subject.kind === "group" && g.subject.id === id);

// ------------------------------------------------------------------------------------------------------------------------------------
// Sample content

export function sampleCustomRoles(now = new Date().toISOString()): OrgRole[] {
  const base = { builtin: false, createdAt: now, createdBy: "Maya Okafor" };
  return [
    { ...base, id: "claims_adjuster", name: "Claims adjuster", description: "Reviews claims that agents prepare, decides them, and reads the traces behind a decision.", permissions: ["agents:read", "approvals:decide", "traces:read", "documents:read", "analytics:read"], scopes: ["org", "tenant", "department", "project"] },
    { ...base, id: "support_lead", name: "Support lead", description: "Runs the support agents and watches what they cost, without access to billing or people.", permissions: ["agents:read", "agents:write", "traces:read", "usage:read", "cost:read", "notifications:read", "notifications:write", "analytics:read"], scopes: ["tenant", "department", "project"] },
    { ...base, id: "agent_auditor", name: "Agent auditor", description: "Reads everything an agent did and why, and exports it for a review. Changes nothing.", permissions: ["agents:read", "traces:read", "audit:read", "audit:export", "policies:read", "usage:read"], scopes: ["org", "tenant"] },
  ];
}

export function sampleGroups(): Group[] {
  return [
    { id: "g-claims", name: "Claims adjusters", description: "People who decide claims that the claims agents prepare.", members: ["u-03", "u-05"] },
    { id: "g-support-leads", name: "Support leads", description: "Leads of the support desk.", members: ["u-02", "u-06"] },
    { id: "g-platform-oncall", name: "Platform on-call", description: "Whoever is on call for the platform this week.", members: ["u-02", "u-04", "u-05"] },
    { id: "g-payments", name: "Payments approvers", description: "Second pair of eyes on refunds and payouts.", members: ["u-03", "u-01"] },
    { id: "g-pricing", name: "Pricing managers", description: "Decide price changes that agents propose.", members: ["u-03"] },
    { id: "g-code-owners", name: "Code owners", description: "Approve merges to protected branches.", members: ["u-05", "u-06"] },
    { id: "g-approvers", name: "Approvers", description: "General approvers when an agent needs a person.", members: ["u-01", "u-02"] },
    { id: "g-team-leads", name: "Team leads", description: "Where an approval goes when nobody answers in time.", members: ["u-02", "u-01"] },
  ];
}

export function sampleCustomGrants(tree: Tree, now = new Date().toISOString()): Grant[] {
  const dept = (n: string) => tree.departments.find((d) => d.name === n)?.id;
  const tenant = (n: string) => tree.tenants.find((t) => t.name === n)?.id;
  const mk = (i: number, subject: Grant["subject"], roleId: string, scope: ScopeRef): Grant => ({ id: `cg-${i}`, subject, roleId, scope, createdAt: now, createdBy: "Maya Okafor", source: "custom" });
  const out: Grant[] = [];
  const ops = dept("Operations"); if (ops) out.push(mk(1, { kind: "group", id: "g-claims" }, "claims_adjuster", { type: "department", id: ops }));
  const cs = tenant("Customer Support"); if (cs) out.push(mk(2, { kind: "group", id: "g-support-leads" }, "support_lead", { type: "tenant", id: cs }));
  out.push(mk(3, { kind: "user", id: "u-04" }, "agent_auditor", { type: "org" }));
  return out;
}
