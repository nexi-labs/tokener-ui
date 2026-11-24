"use client";

import { useEffect, useState } from "react";
import { Field, Select } from "@/components/ui/Form";
import { ApiError } from "@/lib/api/client";
import type { Department, Project, TenantAdmin, TenantSummary } from "@/lib/tenants/admin";

const msg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/**
 * Narrows to one project through its tenant and department, which is how every project is reached. The tenant can be fixed by the caller
 * (a screen that already works inside one tenant) and the chosen project id, or null, is reported on every change.
 */
export function ProjectPicker({ api, tenants, tenantId, onTenant, onProject, onProblem, stacked }: {
  stacked?: boolean; api: TenantAdmin; tenants: TenantSummary[]; tenantId: string; onTenant?: (id: string) => void; onProject: (id: string, names: Record<string, string>) => void; onProblem: (m: string) => void;
}) {
  const [depts, setDepts] = useState<Department[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [deptId, setDeptId] = useState("");
  const [projectId, setProjectId] = useState("");

  useEffect(() => {
    setDeptId(""); setProjectId(""); setDepts([]); setProjects([]); onProject("", {});
    if (!tenantId) return;
    let live = true;
    api.departments(tenantId).then((d) => { if (live) { setDepts(d); setDeptId(d[0]?.id ?? ""); } }).catch((e) => { if (live) onProblem(msg(e, "Departments could not be loaded.")); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, tenantId]);

  useEffect(() => {
    setProjectId(""); setProjects([]); onProject("", {});
    if (!deptId) return;
    let live = true;
    api.projects(deptId).then((p) => { if (live) { setProjects(p); setProjectId(p[0]?.id ?? ""); onProject(p[0]?.id ?? "", Object.fromEntries(p.map((x) => [x.id, x.name]))); } }).catch((e) => { if (live) onProblem(msg(e, "Projects could not be loaded.")); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, deptId]);

  const pick = (id: string) => { setProjectId(id); onProject(id, Object.fromEntries(projects.map((x) => [x.id, x.name]))); };
  return (
    <div className={stacked ? "grid gap-4" : "grid gap-4 sm:grid-cols-3"}>
      <Field label="Tenant"><Select value={tenantId} onChange={(e) => onTenant?.(e.target.value)} disabled={!onTenant}>{tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
      <Field label="Department"><Select value={deptId} onChange={(e) => setDeptId(e.target.value)} disabled={depts.length === 0}>{depts.length === 0 ? <option value="">None yet</option> : depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
      <Field label="Project"><Select value={projectId} onChange={(e) => pick(e.target.value)} disabled={projects.length === 0}>{projects.length === 0 ? <option value="">None yet</option> : projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
    </div>
  );
}
