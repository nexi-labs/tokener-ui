"use client";

import Link from "next/link";
import { Field, Select } from "@/components/ui/Form";
import { departmentsOf, ownerOptions, projectsOf, type Directory } from "@/lib/org/directory";
import { useOrgDirectory } from "@/lib/org/useOrgDirectory";

export type OrgPlace = { tenantId: string; department: string; project: string };
export const noPlace: OrgPlace = { tenantId: "", department: "", project: "" };

const manage = <Link href="/tenants" className="underline">Tenant Management</Link>;

/**
 * Tenant, department and project as dropdowns fed by Tenant Management, so a record can only be placed somewhere that exists.
 * Departments follow the tenant and projects follow the department. Changing a level clears the levels below it.
 */
export function OrgPlacement({ value, onChange, dir: given, needProject, stacked, disabled }: {
  value: OrgPlace; onChange: (v: OrgPlace) => void; dir?: Directory; needProject?: boolean; stacked?: boolean; disabled?: boolean;
}) {
  const own = useOrgDirectory(); const dir = given ?? own.dir; const loading = !given && own.loading;
  const deps = departmentsOf(dir, value.tenantId);
  const dep = deps.find((d) => d.name === value.department);
  const projs = dep ? projectsOf(dir, dep.id) : [];
  const empty = !loading && dir.tenants.length === 0;
  return (
    <div className="grid gap-3">
      <div className={stacked ? "grid gap-4" : "grid gap-4 sm:grid-cols-3"}>
        <Field label="Tenant"><Select aria-label="Tenant" value={value.tenantId} disabled={disabled || loading || empty} onChange={(e) => onChange({ tenantId: e.target.value, department: "", project: "" })}>
          <option value="">{loading ? "Loading tenants" : empty ? "No tenants yet" : "Choose a tenant"}</option>
          {dir.tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select></Field>
        <Field label="Department"><Select aria-label="Department" value={value.department} disabled={disabled || !value.tenantId} onChange={(e) => onChange({ ...value, department: e.target.value, project: "" })}>
          <option value="">{!value.tenantId ? "Choose a tenant first" : deps.length ? "Choose a department" : "No departments yet"}</option>
          {deps.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
        </Select></Field>
        <Field label={needProject ? "Project" : "Project (optional)"}><Select aria-label="Project" value={value.project} disabled={disabled || !dep} onChange={(e) => onChange({ ...value, project: e.target.value })}>
          <option value="">{!dep ? "Choose a department first" : projs.length ? (needProject ? "Choose a project" : "No project") : "No projects yet"}</option>
          {projs.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
        </Select></Field>
      </div>
      {empty && <p className="text-[12.5px] text-text-secondary">Create a tenant, department and project in {manage} and they will appear here.</p>}
    </div>
  );
}

/** Who answers for something: a group or a person of this organization. A value that is not in the list yet (an older free-text owner) stays selectable until it is changed. */
export function OwnerSelect({ value, onChange, label = "Owner", hint, dir: given, disabled, empty = "Choose who answers for this" }: { value: string; onChange: (v: string) => void; label?: string; hint?: string; dir?: Directory; disabled?: boolean; empty?: string }) {
  const own = useOrgDirectory(); const dir = given ?? own.dir;
  const opts = ownerOptions(dir); const groups = opts.filter((o) => o.kind === "group"); const people = opts.filter((o) => o.kind === "person");
  const legacy = value && !opts.some((o) => o.value === value);
  return (
    <Field label={label} hint={hint}>
      <Select aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">{empty}</option>
        {legacy && <option value={value}>{value} (not in People and access)</option>}
        {groups.length > 0 && <optgroup label="Groups">{groups.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>}
        {people.length > 0 && <optgroup label="People">{people.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>}
      </Select>
    </Field>
  );
}

/** A person only, by email, for places that notify or assign one person. */
export function PersonSelect({ value, onChange, label, hint, dir: given }: { value: string; onChange: (v: string) => void; label: string; hint?: string; dir?: Directory }) {
  const own = useOrgDirectory(); const dir = given ?? own.dir;
  return (
    <Field label={label} hint={hint}>
      <Select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose a person</option>
        {value && !dir.people.some((p) => p.email === value) && <option value={value}>{value}</option>}
        {dir.people.filter((p) => !p.disabled).map((p) => <option key={p.id} value={p.email}>{p.name}, {p.email}</option>)}
      </Select>
    </Field>
  );
}
