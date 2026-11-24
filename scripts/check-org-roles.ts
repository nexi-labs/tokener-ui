/**
 * Checks for organization roles, groups and grants, and for the directory the dropdowns read.
 * Run: npx tsx --tsconfig scripts/tsconfig.scripts.json scripts/check-org-roles.ts
 */
import rolesJson from "../src/lib/iam/roles.generated.json";
import { SAMPLE_ROLES } from "../src/lib/iam/admin";
import { sampleTree } from "../src/lib/tenants/admin";
import { sampleAgents } from "../src/lib/agents/sample";
import { BUILTIN_SUMMARY, PERMISSIONS, ancestry, builtinRoles, can, covers, effectiveAccess, peopleGrants, sampleCustomGrants, sampleCustomRoles, sampleGroups, scopeName, validateDeleteRole, validateGrant, validateGroup, validateRevoke, validateRole, type Ctx, type Grant, type OrgRole } from "../src/lib/org/roles";
import { departmentsOf, ownerOptions, placementOf, projectsOf, tenantOfDepartment, type Directory } from "../src/lib/org/directory";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const tree = sampleTree(); const ORG = "org-1";
const builtin = builtinRoles(SAMPLE_ROLES); const custom = sampleCustomRoles(); const roles: OrgRole[] = [...builtin, ...custom];
const users = [
  { id: "u-01", assignments: [{ role: "org_admin", scope: { type: "org", id: ORG } }] }, { id: "u-02", assignments: [{ role: "tenant_admin", scope: { type: "tenant", id: tree.tenants[0].id } }] },
  { id: "u-03", assignments: [{ role: "finance", scope: { type: "org", id: ORG } }] }, { id: "u-04", assignments: [{ role: "security_auditor", scope: { type: "org", id: ORG } }] },
  { id: "u-05", assignments: [{ role: "developer", scope: { type: "org", id: ORG } }] }, { id: "u-06", assignments: [{ role: "developer", scope: { type: "org", id: ORG } }] }, { id: "u-09", assignments: [{ role: "platform_operator", scope: { type: "platform" } }] },
];
const people = [{ id: "u-01", name: "Maya", email: "maya@x" }, { id: "u-02", name: "Daniel", email: "d@x" }, { id: "u-03", name: "Priya", email: "p@x" }, { id: "u-04", name: "Tomas", email: "t@x" }, { id: "u-05", name: "Amara", email: "a@x" }, { id: "u-06", name: "Kenji", email: "k@x" }, { id: "u-08", name: "Omar", email: "o@x", disabled: true }];
const groups = sampleGroups();
const pg = peopleGrants(users, ORG);
const grants: Grant[] = [...pg, ...sampleCustomGrants(tree)];
const ctx = (actorId: string, over: Partial<Ctx> = {}): Ctx => ({ roles, groups, grants, people, tree, actorId, ...over });

// built-ins
ok(builtin.length === 6 && !builtin.some((r) => r.id === "platform_operator"), "platform operator role is never offered to customers");
ok(builtin.every((r) => r.builtin && r.permissions.length > 0), "built-ins carry permissions");
ok(Object.keys(BUILTIN_SUMMARY).length === 6, "a summary for each built-in");
ok((rolesJson as { permissions: string[] }[]).flatMap((r) => r.permissions).filter((p) => !p.startsWith("platform:")).every((p) => PERMISSIONS.includes(p)), "every platform permission is in the catalogue, so a role can be built from any of them");
ok(builtin.find((r) => r.id === "org_admin")!.scopes.join() === "org", "org admin applies at the organization");
ok(builtin.find((r) => r.id === "developer")!.scopes.includes("project"), "tenant roles can be given down to a project");
ok(peopleGrants(users, ORG).every((g) => g.roleId !== "platform_operator"), "platform operator assignments are not shown as grants");

// scopes
const proj = tree.projects.find((p) => p.name === "claims-ops")!; const dept = tree.departments.find((d) => d.id === proj.departmentId)!; const ten = tree.tenants.find((t) => t.id === dept.tenantId)!;
ok(ancestry({ type: "project", id: proj.id }, tree).map((a) => a.type).join() === "project,department,tenant,org", "ancestry of a project");
ok(covers({ type: "tenant", id: ten.id }, { type: "project", id: proj.id }, tree), "tenant covers its project");
ok(covers({ type: "org" }, { type: "project", id: proj.id }, tree), "organization covers everything");
ok(!covers({ type: "department", id: dept.id }, { type: "tenant", id: ten.id }, tree), "department does not cover its tenant");
ok(!covers({ type: "tenant", id: tree.tenants[1].id }, { type: "project", id: proj.id }, tree), "another tenant does not cover it");
ok(scopeName({ type: "project", id: proj.id }, tree).includes("claims-ops"), "project name resolves");

// effective access
const adjuster = effectiveAccess("u-03", { type: "project", id: proj.id }, grants, roles, groups, tree);
ok(can(adjuster, "approvals:decide") && adjuster.permissions.get("approvals:decide")![0].via?.id === "g-claims", "Priya decides claims through the Claims adjusters group");
ok(can(adjuster, "billing:read"), "and keeps finance from her own built-in role");
const elsewhere = effectiveAccess("u-03", { type: "department", id: tree.departments.find((d) => d.name === "Finance")!.id }, grants, roles, groups, tree);
ok(!can(elsewhere, "approvals:decide"), "the claims grant does not reach finance");
ok(can(effectiveAccess("u-04", { type: "project", id: proj.id }, grants, roles, groups, tree), "audit:export"), "an org-level grant reaches every project");
ok(!can(effectiveAccess("u-06", { type: "project", id: proj.id }, grants, roles, groups, tree), "approvals:decide"), "a developer cannot decide claims");
ok(effectiveAccess("nobody", { type: "org" }, grants, roles, groups, tree).permissions.size === 0, "an unknown person holds nothing");

// role validation
const base = { id: "new", name: "Reviewer", permissions: ["agents:read", "traces:read"], scopes: ["org"] as OrgRole["scopes"] };
const v = (r: Partial<typeof base>) => validateRole({ ...base, ...r }, roles);
ok(v({}).filter((i) => i.level === "error").length === 0, "a simple role is valid");
ok(v({ name: "ab" }).some((i) => i.path === "name"), "name too short");
ok(v({ name: "Claims adjuster" }).some((i) => /already exists/.test(i.message)), "duplicate name");
ok(v({ name: "viewer" }).some((i) => /already exists/.test(i.message)), "cannot reuse a built-in name");
ok(v({ permissions: [] }).some((i) => i.path === "permissions"), "needs a permission");
ok(v({ permissions: ["budgets:write"] }).some((i) => /also be able to see/.test(i.message)), "write needs read");
ok(!v({ permissions: ["budgets:read", "budgets:write"] }).some((i) => i.level === "error"), "write with read is fine");
ok(v({ permissions: ["agents:read", "platform:write"] }).some((i) => /not a permission/.test(i.message)), "platform permissions cannot be put in a customer role");
ok(v({ scopes: [] }).some((i) => i.path === "scopes"), "needs a scope");
ok(v({ permissions: ["users:read", "users:write"] }).some((i) => i.level === "warning" && /change who has access|People and roles/i.test(i.message + "users")), "sensitive permission warns");
ok(v({ permissions: ["audit:read", "audit:export"] }).some((i) => i.level === "warning"), "export warns");
ok(!v({ permissions: ["approvals:decide"] }).some((i) => /also be able/.test(i.message)), "decide has no read companion");
ok(sampleCustomRoles().every((r) => validateRole(r, roles).every((i) => i.level !== "error")), "sample custom roles are valid");

// grant validation
const g = (subject: Grant["subject"], roleId: string, scope: Grant["scope"]) => ({ subject, roleId, scope });
const admin = ctx("u-01");
ok(validateGrant(g({ kind: "user", id: "u-06" }, "claims_adjuster", { type: "project", id: proj.id }), admin).length === 0, "an org admin can give a project role");
ok(validateGrant(g({ kind: "user", id: "u-06" }, "nope", { type: "org" }), admin).some((i) => i.path === "roleId"), "unknown role");
ok(validateGrant(g({ kind: "user", id: "ghost" }, "viewer", { type: "org" }), admin).some((i) => i.path === "subject"), "unknown person");
ok(validateGrant(g({ kind: "user", id: "u-08" }, "viewer", { type: "org" }), admin).some((i) => /disabled/.test(i.message)), "disabled person");
ok(validateGrant(g({ kind: "group", id: "g-none" }, "viewer", { type: "org" }), admin).some((i) => i.path === "subject"), "unknown group");
ok(validateGrant(g({ kind: "user", id: "u-06" }, "viewer", { type: "tenant", id: "zzz" }), admin).some((i) => i.path === "scope"), "unknown scope");
ok(validateGrant(g({ kind: "user", id: "u-06" }, "org_admin", { type: "tenant", id: ten.id }), admin).some((i) => /cannot be granted at the tenant level/.test(i.message)), "org admin only at org level");
ok(validateGrant(g({ kind: "group", id: "g-claims" }, "claims_adjuster", { type: "department", id: dept.id }), admin).some((i) => i.path === "grant"), "duplicate grant");
// no privilege escalation
const tenantAdmin = ctx("u-02");
ok(validateGrant(g({ kind: "user", id: "u-06" }, "viewer", { type: "org" }), tenantAdmin).some((i) => i.path === "escalation"), "a tenant admin cannot grant across the organization");
ok(validateGrant(g({ kind: "user", id: "u-06" }, "finance", { type: "tenant", id: tree.tenants[0].id }), tenantAdmin).some((i) => i.path === "escalation"), "and cannot hand out finance, which they do not hold");
ok(validateGrant(g({ kind: "user", id: "u-06" }, "viewer", { type: "tenant", id: tree.tenants[0].id }), tenantAdmin).length === 0, "but can give a role they hold inside their own tenant");
ok(validateGrant(g({ kind: "user", id: "u-06" }, "developer", { type: "tenant", id: tree.tenants[1].id }), tenantAdmin).some((i) => i.path === "escalation"), "and not in another tenant");
ok(validateGrant(g({ kind: "user", id: "u-06" }, "viewer", { type: "org" }), ctx("u-06")).some((i) => i.path === "escalation"), "a developer cannot grant anything org wide");

// revoke and delete
ok(validateRevoke("cg-1", admin).length === 0, "a custom grant can be revoked");
ok(validateRevoke(pg[0].id, admin).some((i) => /People and access/.test(i.message)), "a built-in grant is changed in People and access");
ok(validateRevoke("zzz", admin).length === 1, "unknown grant");
ok(validateDeleteRole("claims_adjuster", admin).some((i) => /1 grant uses/.test(i.message)), "a role in use cannot be deleted");
ok(validateDeleteRole("viewer", admin).some((i) => /Built-in/.test(i.message)), "a built-in role cannot be deleted");
ok(validateDeleteRole("support_lead", ctx("u-01", { grants: pg })).length === 0, "an unused custom role can be deleted");

// groups
ok(validateGroup({ id: "n", name: "ab", members: [] }, { groups, people }).some((i) => i.path === "name"), "group name length");
ok(validateGroup({ id: "n", name: "Claims adjusters", members: ["u-01"] }, { groups, people }).some((i) => /already exists/.test(i.message)), "group name unique");
ok(validateGroup({ id: "n", name: "Reviewers", members: ["ghost"] }, { groups, people }).some((i) => i.path === "members"), "group members exist");
ok(validateGroup({ id: "n", name: "Reviewers", members: [] }, { groups, people }).some((i) => i.level === "warning"), "empty group warns");
ok(groups.every((x) => validateGroup(x, { groups, people }).every((i) => i.level !== "error")), "sample groups are valid");

// directory
const dir: Directory = { orgId: ORG, orgName: "NexI", tenants: tree.tenants.map((t) => ({ ...t, region: "x" })), departments: tree.departments.map((d) => ({ ...d, tenantName: tree.tenants.find((t) => t.id === d.tenantId)!.name })), projects: tree.projects.map((p) => ({ ...p, departmentName: tree.departments.find((d) => d.id === p.departmentId)!.name, tenantId: tree.departments.find((d) => d.id === p.departmentId)!.tenantId, tenantName: "" })), people, groups };
ok(departmentsOf(dir, ten.id).some((d) => d.name === "Operations"), "departments of a tenant");
ok(projectsOf(dir, dept.id).some((p) => p.name === "claims-ops"), "projects of a department");
ok(tenantOfDepartment(dir, "Operations") === ten.id, "tenant of a department name");
ok(placementOf(dir, "Operations", "claims-ops").tenantId === ten.id && placementOf(dir, "Operations", "claims-ops").project === "claims-ops", "placement from names");
ok(placementOf(dir, "Nowhere").tenantId === "", "unknown department has no tenant");
ok(placementOf(dir, "Finance", "claims-ops").project === "", "a project from another department is dropped");
const oo = ownerOptions(dir); ok(oo.some((o) => o.kind === "group" && o.value === "Claims adjusters") && oo.some((o) => o.kind === "person" && o.value === "maya@x") && !oo.some((o) => o.value === "o@x"), "owners are groups and active people");

// the Agent OS samples sit inside the directory: no department or project is made up
const agents = sampleAgents().agents;
const names = new Set(tree.departments.map((d) => d.name)); const projNames = new Set(tree.projects.map((p) => p.name));
ok(agents.every((a) => names.has(a.department)), `every agent department exists in Tenant Management: ${[...new Set(agents.map((a) => a.department).filter((d) => !names.has(d)))].join(", ")}`);
ok(agents.every((a) => !a.project || projNames.has(a.project)), "every agent project exists in Tenant Management");
ok(agents.every((a) => !a.project || tree.projects.find((p) => p.name === a.project) && tree.departments.find((d) => d.id === tree.projects.find((p) => p.name === a.project)!.departmentId)!.name === a.department), "an agent's project sits in its own department");

console.log(`${pass} checks passed, ${fail} failed`); process.exit(fail ? 1 : 0);
