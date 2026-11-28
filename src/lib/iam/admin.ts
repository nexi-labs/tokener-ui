/**
 * The identity administration client behind People, Access Requests and Role Management. One interface, two drivers: the live driver calls
 * /api/v1/iam for a signed-in workspace, the sample driver keeps its records in memory for the sample workspace and never calls the API.
 * Screens only ever talk to the interface, so what they show in the sample workspace is what a real one shows.
 */
import { ApiError, http, type Paged } from "@/lib/api/client";
import rolesJson from "./roles.generated.json";
import type { RoleAssignment } from "@/lib/auth/client";

/** INVITED: invited by an administrator and has not accepted. PENDING: signed up with a password and has not verified the email address, so cannot sign in. */
export type UserStatus = "INVITED" | "ACTIVE" | "PENDING" | "DISABLED";
export type IamUser = {
  id: string; email: string; displayName: string; status: UserStatus; assignments: RoleAssignment[]; permissions: string[];
  /** True once the person has chosen a password. People who sign in with Google, Microsoft or GitHub, and invited people who have not accepted yet, have none. */
  passwordSet: boolean; externalProvider: string | null; lastLoginAt: string | null; createdAt: string;
};
export type RoleInfo = { role: string; scopes: string[]; permissions: string[] };
export type AccessRequestStatus = "PENDING" | "APPROVED" | "REJECTED";
export type AccessRequest = {
  id: string; email: string; fullName: string; organization: string; reason: string; status: AccessRequestStatus;
  createdAt: string; decidedAt: string | null; decidedBy: string | null;
};

export type UserQuery = { q?: string; page?: number; size?: number };

export interface IamAdmin {
  mode: "live" | "sample";
  roles(): Promise<RoleInfo[]>;
  users(q: UserQuery): Promise<Paged<IamUser>>;
  invite(email: string, displayName: string, assignments: RoleAssignment[]): Promise<IamUser>;
  replaceRoles(userId: string, assignments: RoleAssignment[]): Promise<IamUser>;
  setDisabled(userId: string, disabled: boolean): Promise<IamUser>;
  sendPasswordReset(userId: string): Promise<void>;
  accessRequests(status?: AccessRequestStatus): Promise<Paged<AccessRequest>>;
  approve(requestId: string, assignments: RoleAssignment[]): Promise<IamUser>;
  reject(requestId: string): Promise<void>;
  /** Organizations on the platform, for platform operators. {@code text} narrows by name. */
  organizations(text?: string): Promise<Paged<OrgSummary>>;
  /** The tenants of one organization, to give a role on one tenant. */
  tenants(orgId: string): Promise<TenantSummary[]>;
}

export type OrgSummary = { id: string; name: string; contractTier: string; createdAt: string };
export type TenantSummary = { id: string; name: string; homeRegion: string };

/** Human names for the fixed role set. The set itself comes from the server, so a new role shows up without a console change. */
export const ROLE_LABEL: Record<string, string> = {
  platform_operator: "Platform operator", org_admin: "Organization admin", tenant_admin: "Tenant admin", finance: "Finance",
  security_auditor: "Security auditor", developer: "Developer", viewer: "Viewer",
};
export const ROLE_SUMMARY: Record<string, string> = {
  platform_operator: "Runs the platform itself: every organization, system settings, connectors and access requests.",
  org_admin: "Full access across every tenant in the organization, including people and billing.",
  tenant_admin: "Manages policies, budgets, providers and applications inside the tenants they are assigned.",
  finance: "Reads cost data and manages budgets and chargeback; no access to prompts or responses.",
  security_auditor: "Read-only access to the audit trail, policies and traces, with audit export.",
  developer: "Builds and runs applications, pipelines and API keys inside the tenants they are assigned.",
  viewer: "Read-only access to dashboards and analytics.",
};
export const roleLabel = (r: string) => ROLE_LABEL[r] ?? r.replace(/_/g, " ");

export function scopeLabel(a: RoleAssignment, orgName?: string | null): string {
  if (a.scope.type === "platform") return "Platform";
  if (a.scope.type === "org") return orgName ? orgName : "Organization";
  return `Tenant ${a.scope.id ? a.scope.id.slice(0, 8) : ""}`.trim();
}

// ------------------------------------------------------------------------------------------------ live

const IAM = "/api/v1/iam";

export function liveAdmin(ctx: { orgId: string | null }): IamAdmin {
  return {
    mode: "live",
    roles: () => http.get<RoleInfo[]>(`${IAM}/roles`),
    users: (q) => http.get<Paged<IamUser>>(`${IAM}/users`, { org: ctx.orgId ?? undefined, q: q.q, page: q.page ?? 0, size: q.size ?? 25 }),
    invite: (email, displayName, assignments) => http.post<IamUser>(`${IAM}/users`, { email, displayName, assignments }),
    replaceRoles: (id, assignments) => http.put<IamUser>(`${IAM}/users/${id}/roles`, { assignments }),
    setDisabled: (id, disabled) => http.post<IamUser>(`${IAM}/users/${id}/${disabled ? "disable" : "enable"}`),
    sendPasswordReset: (id) => http.post<void>(`${IAM}/users/${id}/password-reset`),
    accessRequests: (status) => http.get<Paged<AccessRequest>>(`${IAM}/access-requests`, { status: status?.toLowerCase(), size: 50 }),
    approve: (id, assignments) => http.post<IamUser>(`${IAM}/access-requests/${id}/approve`, { assignments }),
    reject: (id) => http.post<void>(`${IAM}/access-requests/${id}/reject`),
    organizations: (text) => http.get<Paged<OrgSummary>>("/api/v1/orgs", { q: text?.trim() || undefined, page: 0, size: 20 }),
    tenants: (orgId) => http.get<TenantSummary[]>(`/api/v1/orgs/${orgId}/tenants`),
  };
}

// ------------------------------------------------------------------------------------------------ sample workspace

const ORG = "00000000-0000-4000-8000-0000000000a1";
const org = (role: string): RoleAssignment => ({ role, scope: { type: "org", id: ORG } });
const day = (n: number) => new Date(Date.UTC(2026, 9, 29, 9, 0) - n * 86_400_000).toISOString();

let sampleUsers: IamUser[] = ([
  { id: "u-01", email: "maya.okafor@nexi.example", displayName: "Maya Okafor", status: "ACTIVE", assignments: [org("org_admin")], permissions: [], passwordSet: false, externalProvider: "google", lastLoginAt: day(0), createdAt: day(210) },
  { id: "u-02", email: "daniel.reyes@nexi.example", displayName: "Daniel Reyes", status: "ACTIVE", assignments: [{ role: "tenant_admin", scope: { type: "tenant", id: "00000000-0000-4000-8000-0000000000b1" } }], permissions: [], passwordSet: false, externalProvider: null, lastLoginAt: day(1), createdAt: day(188) },
  { id: "u-03", email: "priya.nair@nexi.example", displayName: "Priya Nair", status: "ACTIVE", assignments: [org("finance")], permissions: [], passwordSet: false, externalProvider: null, lastLoginAt: day(2), createdAt: day(160) },
  { id: "u-04", email: "tomas.lindqvist@nexi.example", displayName: "Tomas Lindqvist", status: "ACTIVE", assignments: [org("security_auditor")], permissions: [], passwordSet: false, externalProvider: "github", lastLoginAt: day(4), createdAt: day(140) },
  { id: "u-05", email: "amara.diallo@nexi.example", displayName: "Amara Diallo", status: "ACTIVE", assignments: [org("developer")], permissions: [], passwordSet: false, externalProvider: "github", lastLoginAt: day(0), createdAt: day(96) },
  { id: "u-06", email: "kenji.watanabe@nexi.example", displayName: "Kenji Watanabe", status: "ACTIVE", assignments: [org("developer")], permissions: [], passwordSet: false, externalProvider: null, lastLoginAt: day(6), createdAt: day(72) },
  { id: "u-07", email: "lucia.ferrer@nexi.example", displayName: "Lucia Ferrer", status: "INVITED", assignments: [org("viewer")], permissions: [], passwordSet: false, externalProvider: null, lastLoginAt: null, createdAt: day(2) },
  { id: "u-08", email: "omar.haddad@nexi.example", displayName: "Omar Haddad", status: "DISABLED", assignments: [org("developer")], permissions: [], passwordSet: false, externalProvider: null, lastLoginAt: day(58), createdAt: day(240) },
] as IamUser[]).map((u) => ({ ...u, passwordSet: u.externalProvider === null && u.status !== "INVITED" }));

let sampleRequests: AccessRequest[] = [
  { id: "r-01", email: "sofia.marin@brightfield.example", fullName: "Sofia Marin", organization: "Brightfield Payments", reason: "We route card dispute summaries through three model providers and need per-team budgets and an audit trail our regulator accepts.", status: "PENDING", createdAt: day(0), decidedAt: null, decidedBy: null },
  { id: "r-02", email: "jonas.keller@harbor-health.example", fullName: "Jonas Keller", organization: "Harbor Health", reason: "Evaluating a control plane for clinical note drafting. Need data residency controls for the EU region.", status: "PENDING", createdAt: day(1), decidedAt: null, decidedBy: null },
  { id: "r-03", email: "neha.iyer@kestrel-logistics.example", fullName: "Neha Iyer", organization: "Kestrel Logistics", reason: "Platform team of nine. We want one gateway in front of our provider keys.", status: "PENDING", createdAt: day(3), decidedAt: null, decidedBy: null },
  { id: "r-04", email: "carlos.vega@alder-retail.example", fullName: "Carlos Vega", organization: "Alder Retail", reason: "Recommendation pipelines and a support assistant.", status: "APPROVED", createdAt: day(9), decidedAt: day(8), decidedBy: "operator@tokener.example" },
  { id: "r-05", email: "info@unknown-sender.example", fullName: "A. Sender", organization: "-", reason: "Please send pricing.", status: "REJECTED", createdAt: day(12), decidedAt: day(12), decidedBy: "operator@tokener.example" },
];

const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 120));
const page = <T,>(all: T[], p = 0, size = 25): Paged<T> => ({ content: all.slice(p * size, p * size + size), page: p, size, totalElements: all.length, totalPages: Math.max(1, Math.ceil(all.length / size)) });
const fail = (status: number, code: string, message: string) => new ApiError(status, code, message);
const dup = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export function sampleAdmin(roles: RoleInfo[]): IamAdmin {
  return {
    mode: "sample",
    roles: () => wait(roles),
    organizations: async (text) => {
      const t = (text ?? "").trim().toLowerCase();
      const hit = SAMPLE_ORGS.filter((o) => !t || o.name.toLowerCase().includes(t));
      return wait({ content: hit, page: 0, size: 20, totalElements: hit.length, totalPages: 1 });
    },
    tenants: async (orgId) => wait(orgId === ORG ? sampleTenants : []),
    users: async (q) => {
      const t = (q.q ?? "").trim().toLowerCase();
      const hit = sampleUsers.filter((u) => !t || u.email.toLowerCase().includes(t) || u.displayName.toLowerCase().includes(t));
      return wait(dup(page(hit, q.page, q.size)));
    },
    invite: async (email, displayName, assignments) => {
      if (sampleUsers.some((u) => u.email.toLowerCase() === email.toLowerCase())) throw fail(409, "email_in_use", "That address already belongs to a person in this organization.");
      const u: IamUser = { id: `u-${String(sampleUsers.length + 1).padStart(2, "0")}`, email, displayName: displayName || email.split("@")[0], status: "INVITED", assignments, permissions: [], passwordSet: false, externalProvider: null, lastLoginAt: null, createdAt: new Date().toISOString() };
      sampleUsers = [...sampleUsers, u];
      return wait(dup(u));
    },
    replaceRoles: async (id, assignments) => {
      const u = sampleUsers.find((x) => x.id === id); if (!u) throw fail(404, "not_found", "Person not found.");
      if (!assignments.length) throw fail(422, "invalid_request", "Give the person at least one role, or disable the account instead.");
      u.assignments = assignments; return wait(dup(u));
    },
    setDisabled: async (id, disabled) => {
      const u = sampleUsers.find((x) => x.id === id); if (!u) throw fail(404, "not_found", "Person not found.");
      u.status = disabled ? "DISABLED" : u.lastLoginAt ? "ACTIVE" : "INVITED"; return wait(dup(u));
    },
    sendPasswordReset: () => wait(undefined),
    accessRequests: async (status) => wait(dup(page(sampleRequests.filter((r) => !status || r.status === status), 0, 50))),
    approve: async (id, assignments) => {
      const r = sampleRequests.find((x) => x.id === id); if (!r || r.status !== "PENDING") throw fail(409, "already_decided", "This request was already decided.");
      r.status = "APPROVED"; r.decidedAt = new Date().toISOString(); r.decidedBy = "operator@tokener.example";
      const u: IamUser = { id: `u-r-${id}`, email: r.email, displayName: r.fullName, status: "INVITED", assignments, permissions: [], passwordSet: false, externalProvider: null, lastLoginAt: null, createdAt: new Date().toISOString() };
      return wait(dup(u));
    },
    reject: async (id) => {
      const r = sampleRequests.find((x) => x.id === id); if (!r || r.status !== "PENDING") throw fail(409, "already_decided", "This request was already decided.");
      r.status = "REJECTED"; r.decidedAt = new Date().toISOString(); r.decidedBy = "operator@tokener.example"; return wait(undefined);
    },
  };
}

export const SAMPLE_TENANT_ID_SUPPORT = "00000000-0000-4000-8000-0000000000b1";
export const SAMPLE_TENANT_ID_PLATFORM = "00000000-0000-4000-8000-0000000000b2";
const SAMPLE_ORGS: OrgSummary[] = [
  { id: ORG, name: "NexI Corp", contractTier: "enterprise", createdAt: "2026-02-03T09:00:00Z" },
  { id: "00000000-0000-4000-8000-0000000000a2", name: "Harbor Logistics", contractTier: "business", createdAt: "2026-06-18T09:00:00Z" },
  { id: "00000000-0000-4000-8000-0000000000a3", name: "Northwind Clinics", contractTier: "business", createdAt: "2026-09-02T09:00:00Z" },
];
let sampleTenants: TenantSummary[] = [
  { id: SAMPLE_TENANT_ID_SUPPORT, name: "Customer Support", homeRegion: "eu-west-1" },
  { id: SAMPLE_TENANT_ID_PLATFORM, name: "Platform Engineering", homeRegion: "eu-west-1" },
  { id: "t-retail", name: "Retail Banking", homeRegion: "me-central-1" },
  { id: "t-corp", name: "Corporate Banking", homeRegion: "me-central-1" },
  { id: "t-insurance", name: "Insurance Services", homeRegion: "eu-west-1" },
];
export const listSampleTenants = (): TenantSummary[] => sampleTenants;
export function addSampleTenant(name: string, homeRegion: string): TenantSummary {
  const t = { id: `00000000-0000-4000-8000-${(0xb1 + sampleTenants.length).toString(16).padStart(12, "0")}`, name, homeRegion };
  sampleTenants = [...sampleTenants, t];
  return t;
}
export const SAMPLE_ORG_ID = ORG;
export const SAMPLE_ORG_NAME = "NexI Corp";

/** The role catalogue the sample workspace shows, generated from the server's own role matrix (scripts/export-iam-roles.sh --check keeps it honest). */
export const SAMPLE_ROLES: RoleInfo[] = rolesJson as RoleInfo[];
