import type { Group, Person } from "./roles";

/** The organization as every screen should see it: the tenants, departments and projects from Tenant Management, and the people and groups from People and access. */
export type DirTenant = { id: string; name: string; region: string };
export type DirDepartment = { id: string; tenantId: string; tenantName: string; name: string };
export type DirProject = { id: string; departmentId: string; departmentName: string; tenantId: string; tenantName: string; name: string };
export type Directory = { orgId: string | null; orgName: string | null; tenants: DirTenant[]; departments: DirDepartment[]; projects: DirProject[]; people: Person[]; groups: Group[] };

export const emptyDirectory: Directory = { orgId: null, orgName: null, tenants: [], departments: [], projects: [], people: [], groups: [] };

export const departmentsOf = (d: Directory, tenantId: string) => d.departments.filter((x) => x.tenantId === tenantId);
export const projectsOf = (d: Directory, departmentId: string) => d.projects.filter((x) => x.departmentId === departmentId);
export const tenantOfDepartment = (d: Directory, departmentName: string) => d.departments.find((x) => x.name === departmentName)?.tenantId;

export type Placement = { tenantId: string; department: string; project: string };
/** Finds where a department and project name sit, so a record that stores names can be shown in the cascade. */
export function placementOf(d: Directory, department: string, project?: string): Placement {
  const dep = d.departments.find((x) => x.name === department);
  return { tenantId: dep?.tenantId ?? "", department: dep?.name ?? "", project: project && d.projects.some((p) => p.name === project && p.departmentId === dep?.id) ? project : "" };
}

export type OwnerOption = { value: string; label: string; kind: "person" | "group" };
/** Who can be accountable for something: a person, by email, or a group by name. */
export function ownerOptions(d: Directory): OwnerOption[] {
  return [
    ...d.groups.map((g) => ({ value: g.name, label: g.name, kind: "group" as const })),
    ...d.people.filter((p) => !p.disabled).map((p) => ({ value: p.email, label: `${p.name}, ${p.email}`, kind: "person" as const })),
  ];
}
