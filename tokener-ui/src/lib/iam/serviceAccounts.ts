/**
 * The service account client. Live: the identity routes under /api/v1/iam. Sample: in-memory accounts in the sample workspace, with random
 * sample secrets that are not valid anywhere. A secret is only ever in the answer to create or rotate; a listing never carries one.
 */
import { http, ApiError } from "@/lib/api/client";
import { sampleTenantOfProject } from "@/lib/tenants/admin";

export type SaStatus = "ACTIVE" | "EXPIRED" | "REVOKED";
export type ServiceAccount = {
  id: string; projectId: string; tenantId: string; name: string; role: string; status: SaStatus;
  createdAt: string; expiresAt: string | null; lastUsedAt: string | null;
};
export type IssuedServiceAccount = ServiceAccount & { clientId: string; secret: string };

/** Roles a service account can hold: the ones that can be granted on a tenant. Matches the server's rule. */
export const SA_ROLES = ["developer", "viewer", "security_auditor", "finance", "tenant_admin"] as const;
export const LIFETIMES: { label: string; days: number | null }[] = [
  { label: "30 days", days: 30 }, { label: "90 days", days: 90 }, { label: "1 year", days: 365 }, { label: "No expiry", days: null },
];

export interface ServiceAccountAdmin {
  mode: "live" | "sample";
  list(tenantId: string): Promise<ServiceAccount[]>;
  create(projectId: string, name: string, role: string, expiresInDays: number | null): Promise<IssuedServiceAccount>;
  /** Without a lifetime the current one is kept. */
  rotate(id: string, expiresInDays?: number | null): Promise<IssuedServiceAccount>;
  revoke(id: string): Promise<ServiceAccount>;
}

const IAM = "/api/v1/iam";

export const liveServiceAccounts: ServiceAccountAdmin = {
  mode: "live",
  list: (tenantId) => http.get<ServiceAccount[]>(`${IAM}/tenants/${tenantId}/service-accounts`),
  create: (projectId, name, role, expiresInDays) => http.post<IssuedServiceAccount>(`${IAM}/projects/${projectId}/service-accounts`, { name, role, ...(expiresInDays ? { expiresInDays } : {}) }),
  rotate: (id, expiresInDays) => http.post<IssuedServiceAccount>(`${IAM}/service-accounts/${id}/rotate-secret`, expiresInDays ? { expiresInDays } : {}),
  revoke: (id) => http.delete<ServiceAccount>(`${IAM}/service-accounts/${id}`),
};

const T1 = "00000000-0000-4000-8000-0000000000b1";
const T2 = "00000000-0000-4000-8000-0000000000b2";
const ago = (d: number) => new Date(Date.UTC(2026, 9, 29, 9, 0) - d * 86_400_000).toISOString();
const ahead = (d: number) => new Date(Date.UTC(2026, 9, 29, 9, 0) + d * 86_400_000).toISOString();
let accounts: ServiceAccount[] = [
  { id: "sa-1", projectId: "p-1", tenantId: T1, name: "ticket-sync", role: "developer", status: "ACTIVE", createdAt: ago(90), expiresAt: ahead(60), lastUsedAt: ago(0.1) },
  { id: "sa-2", projectId: "p-1", tenantId: T1, name: "nightly-eval", role: "viewer", status: "ACTIVE", createdAt: ago(45), expiresAt: null, lastUsedAt: ago(1) },
  { id: "sa-3", projectId: "p-2", tenantId: T1, name: "sampling-job", role: "developer", status: "EXPIRED", createdAt: ago(200), expiresAt: ago(10), lastUsedAt: ago(11) },
  { id: "sa-4", projectId: "p-3", tenantId: T2, name: "copilot-batch", role: "developer", status: "ACTIVE", createdAt: ago(30), expiresAt: ahead(300), lastUsedAt: ago(0.5) },
  { id: "sa-5", projectId: "p-3", tenantId: T2, name: "legacy-reports", role: "finance", status: "REVOKED", createdAt: ago(300), expiresAt: null, lastUsedAt: ago(120) },
];
const secret = () => "tsa_sample_" + Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
const NOW = () => Date.now();
const issued = (a: ServiceAccount): IssuedServiceAccount => ({ ...a, clientId: a.id, secret: secret() });
const find = (id: string) => accounts.find((a) => a.id === id);
const replace = (a: ServiceAccount) => { accounts = accounts.map((x) => (x.id === a.id ? a : x)); return a; };

export const sampleServiceAccounts: ServiceAccountAdmin = {
  mode: "sample",
  list: async (tenantId) => accounts.filter((a) => a.tenantId === tenantId).sort((a, b) => a.name.localeCompare(b.name)),
  create: async (projectId, name, role, expiresInDays) => {
    const tenantId = sampleTenantOfProject(projectId);
    if (!tenantId) throw new ApiError(404, "not_found", "Project not found.");
    if (accounts.some((a) => a.projectId === projectId && a.name.toLowerCase() === name.toLowerCase())) throw new ApiError(409, "conflict", "This project already has a service account with that name.");
    const a: ServiceAccount = { id: `sa-${accounts.length + 1}`, projectId, tenantId, name, role, status: "ACTIVE", createdAt: new Date().toISOString(), expiresAt: expiresInDays ? new Date(NOW() + expiresInDays * 86_400_000).toISOString() : null, lastUsedAt: null };
    accounts = [...accounts, a];
    return issued(a);
  },
  rotate: async (id, expiresInDays) => {
    const a = find(id);
    if (!a) throw new ApiError(404, "not_found", "Service account not found.");
    if (a.status === "REVOKED") throw new ApiError(409, "conflict", "This service account is revoked. Create a new one instead.");
    const expiresAt = expiresInDays ? new Date(NOW() + expiresInDays * 86_400_000).toISOString() : a.expiresAt;
    if (expiresAt && Date.parse(expiresAt) <= NOW()) throw new ApiError(422, "invalid", "This secret has expired. Give the new secret a lifetime.");
    return issued(replace({ ...a, expiresAt, status: "ACTIVE" }));
  },
  revoke: async (id) => {
    const a = find(id);
    if (!a) throw new ApiError(404, "not_found", "Service account not found.");
    return replace({ ...a, status: "REVOKED" });
  },
};
