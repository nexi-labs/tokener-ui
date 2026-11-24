/**
 * The tenant client behind Tenant Management. Live: GET and POST /api/v1/orgs/{orgId}/tenants. Sample: the same in-memory tenants the people
 * screens offer for tenant roles, so a tenant created here shows up there. Only what the tenant module serves is shown; request counts,
 * budgets and policies belong to other modules and are not guessed at.
 */
import { http, ApiError } from "@/lib/api/client";
import { addSampleTenant, listSampleTenants, type TenantSummary } from "@/lib/iam/admin";

export type { TenantSummary };

export const HOME_REGIONS = ["us-east-1", "us-west-2", "eu-west-1", "eu-central-1", "ap-southeast-2"];

export type Department = { id: string; tenantId: string; name: string; createdAt: string };
export type Project = { id: string; departmentId: string; name: string; createdAt: string };
/** An application never carries its key: the key is shown once, when it is issued. */
export type AppSummary = { id: string; projectId: string; name: string; enabled: boolean; createdAt: string };

export interface TenantAdmin {
  mode: "live" | "sample";
  list(orgId: string): Promise<TenantSummary[]>;
  create(orgId: string, name: string, homeRegion: string): Promise<TenantSummary>;
  departments(tenantId: string): Promise<Department[]>;
  createDepartment(tenantId: string, name: string): Promise<Department>;
  projects(departmentId: string): Promise<Project[]>;
  createProject(departmentId: string, name: string): Promise<Project>;
  applications(projectId: string): Promise<AppSummary[]>;
  /** The key comes back exactly once, in this result. */
  createApplication(projectId: string, name: string): Promise<{ app: AppSummary; apiKey: string }>;
  disableApplication(id: string): Promise<void>;
  enableApplication(id: string): Promise<void>;
  /** The new key comes back exactly once; the old one stops working at once. */
  rotateKey(id: string): Promise<string>;
}

export const liveTenants: TenantAdmin = {
  mode: "live",
  list: (orgId) => http.get<TenantSummary[]>(`/api/v1/orgs/${orgId}/tenants`),
  create: async (orgId, name, homeRegion) => {
    const made = await http.post<{ id: string }>(`/api/v1/orgs/${orgId}/tenants`, { orgId, name, homeRegion });
    changed();
    return { id: made.id, name, homeRegion };
  },
  departments: (tenantId) => http.get<Department[]>(`/api/v1/tenants/${tenantId}/departments`),
  createDepartment: async (tenantId, name) => {
    const made = await http.post<{ id: string }>(`/api/v1/tenants/${tenantId}/departments`, { tenantId, name });
    changed();
    return { id: made.id, tenantId, name, createdAt: new Date().toISOString() };
  },
  projects: (departmentId) => http.get<Project[]>(`/api/v1/departments/${departmentId}/projects`),
  createProject: async (departmentId, name) => {
    const made = await http.post<{ id: string }>(`/api/v1/departments/${departmentId}/projects`, { departmentId, name });
    changed();
    return { id: made.id, departmentId, name, createdAt: new Date().toISOString() };
  },
  applications: (projectId) => http.get<AppSummary[]>(`/api/v1/projects/${projectId}/applications`),
  createApplication: async (projectId, name) => {
    const made = await http.post<{ applicationId: string; apiKey: string }>(`/api/v1/projects/${projectId}/applications`, { projectId, name });
    return { app: { id: made.applicationId, projectId, name, enabled: true, createdAt: new Date().toISOString() }, apiKey: made.apiKey };
  },
  disableApplication: (id) => http.delete(`/api/v1/applications/${id}`),
  enableApplication: (id) => http.post<void>(`/api/v1/applications/${id}/enable`),
  rotateKey: async (id) => (await http.post<{ apiKey: string }>(`/api/v1/applications/${id}/rotate-key`)).apiKey,
};

const T1 = "00000000-0000-4000-8000-0000000000b1";
const T2 = "00000000-0000-4000-8000-0000000000b2";
const at = (n: number) => new Date(Date.UTC(2026, 9, 29, 9, 0) - n * 86_400_000).toISOString();
const TI = "t-insurance"; const TC = "t-corp";
let departments: Department[] = [
  { id: "d-1", tenantId: T1, name: "Support Operations", createdAt: at(120) },
  { id: "d-2", tenantId: T1, name: "Quality", createdAt: at(90) },
  { id: "d-3", tenantId: T2, name: "Developer Experience", createdAt: at(100) },
  { id: "d-4", tenantId: T1, name: "Customer Support", createdAt: at(118) },
  { id: "d-5", tenantId: T1, name: "Sales", createdAt: at(117) },
  { id: "d-6", tenantId: T1, name: "Marketing", createdAt: at(116) },
  { id: "d-7", tenantId: T2, name: "Engineering", createdAt: at(115) },
  { id: "d-8", tenantId: T2, name: "IT", createdAt: at(114) },
  { id: "d-9", tenantId: TC, name: "Finance", createdAt: at(113) },
  { id: "d-10", tenantId: TC, name: "Legal", createdAt: at(112) },
  { id: "d-11", tenantId: TC, name: "People", createdAt: at(111) },
  { id: "d-12", tenantId: TI, name: "Operations", createdAt: at(110) },
  { id: "d-13", tenantId: "t-retail", name: "Cards", createdAt: at(109) },
];
let projects: Project[] = [
  { id: "p-1", departmentId: "d-1", name: "Ticket Triage", createdAt: at(110) },
  { id: "p-2", departmentId: "d-2", name: "Review Sampling", createdAt: at(80) },
  { id: "p-3", departmentId: "d-3", name: "Internal Copilot", createdAt: at(95) },
  { id: "p-4", departmentId: "d-4", name: "support-ml", createdAt: at(108) },
  { id: "p-5", departmentId: "d-11", name: "people-assistant", createdAt: at(107) },
  { id: "p-6", departmentId: "d-12", name: "claims-ops", createdAt: at(106) },
];
let apps: AppSummary[] = [
  { id: "a-1", projectId: "p-1", name: "triage-classifier", enabled: true, createdAt: at(100) },
  { id: "a-2", projectId: "p-1", name: "reply-drafter", enabled: true, createdAt: at(70) },
  { id: "a-3", projectId: "p-2", name: "qa-sampler", enabled: false, createdAt: at(60) },
  { id: "a-4", projectId: "p-3", name: "code-review-bot", enabled: true, createdAt: at(90) },
  { id: "a-5", projectId: "p-3", name: "docs-search", enabled: true, createdAt: at(40) },
];
/** Anything that reads the directory (the dropdowns on other screens) reloads when a tenant, department or project is created. */
export const DIRECTORY_EVENT = "tok:directory";
const changed = () => { if (typeof window !== "undefined") window.setTimeout(() => window.dispatchEvent(new Event(DIRECTORY_EVENT)), 0); };
const sampleKey = () => "tok_sample_" + Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
const taken = (list: { name: string }[], name: string) => list.some((x) => x.name.toLowerCase() === name.toLowerCase());

/** The tenant a sample project belongs to, for the other sample clients that need it. */
export function sampleTenantOfProject(projectId: string): string | undefined {
  const dept = projects.find((p) => p.id === projectId)?.departmentId;
  return departments.find((d) => d.id === dept)?.tenantId;
}

export const sampleTenantAdmin: TenantAdmin = {
  mode: "sample",
  list: async () => listSampleTenants(),
  create: async (_orgId, name, homeRegion) => {
    changed();
    if (listSampleTenants().some((t) => t.name.toLowerCase() === name.toLowerCase())) throw new ApiError(409, "tenant_exists", "A tenant with that name already exists in this organization.");
    return addSampleTenant(name, homeRegion);
  },
  departments: async (tenantId) => departments.filter((d) => d.tenantId === tenantId),
  createDepartment: async (tenantId, name) => {
    if (taken(departments.filter((d) => d.tenantId === tenantId), name)) throw new ApiError(409, "department_exists", "This tenant already has a department with that name.");
    const d = { id: `d-${departments.length + 1}`, tenantId, name, createdAt: new Date().toISOString() };
    departments = [...departments, d]; changed();
    return d;
  },
  projects: async (departmentId) => projects.filter((p) => p.departmentId === departmentId),
  createProject: async (departmentId, name) => {
    if (taken(projects.filter((p) => p.departmentId === departmentId), name)) throw new ApiError(409, "project_exists", "This department already has a project with that name.");
    const p = { id: `p-${projects.length + 1}`, departmentId, name, createdAt: new Date().toISOString() };
    projects = [...projects, p]; changed();
    return p;
  },
  applications: async (projectId) => apps.filter((a) => a.projectId === projectId),
  createApplication: async (projectId, name) => {
    if (taken(apps.filter((a) => a.projectId === projectId), name)) throw new ApiError(409, "application_exists", "This project already has an application with that name.");
    const apiKey = sampleKey();
    const app = { id: `a-${apps.length + 1}`, projectId, name, enabled: true, createdAt: new Date().toISOString() };
    apps = [...apps, app];
    return { app, apiKey };
  },
  disableApplication: async (id) => { apps = apps.map((a) => (a.id === id ? { ...a, enabled: false } : a)); },
  enableApplication: async (id) => { apps = apps.map((a) => (a.id === id ? { ...a, enabled: true } : a)); },
  rotateKey: async () => sampleKey(),
};

/** The sample tenant, department and project tree, read at once. Used where a screen needs the shape without waiting for the API. */
export function sampleTree(): import("@/lib/org/roles").Tree {
  return { tenants: listSampleTenants().map((t) => ({ id: t.id, name: t.name })), departments: departments.map((d) => ({ id: d.id, tenantId: d.tenantId, name: d.name })), projects: projects.map((p) => ({ id: p.id, departmentId: p.departmentId, name: p.name })) };
}
