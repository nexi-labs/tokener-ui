"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useIamAdmin } from "@/lib/iam/useIamAdmin";
import { DIRECTORY_EVENT, liveTenants, sampleTenantAdmin } from "@/lib/tenants/admin";
import { emptyDirectory, type Directory } from "./directory";
import { useOrgState } from "./store";

let cache: Directory | null = null;

/**
 * The organization directory for dropdowns: tenants, then their departments, then their projects, with the people of the organization.
 * It reloads when something is created in Tenant Management, so a new department shows up in every dropdown without a refresh.
 */
export function useOrgDirectory(): { dir: Directory; loading: boolean; error: string | null; reload: () => void } {
  const { admin, orgId, orgName, sample } = useIamAdmin();
  const org = useOrgState();
  const [raw, setRaw] = useState<Omit<Directory, "groups"> | null>(cache ? { ...cache } : null);
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => { const f = () => reload(); window.addEventListener(DIRECTORY_EVENT, f); return () => window.removeEventListener(DIRECTORY_EVENT, f); }, [reload]);

  useEffect(() => {
    if (!admin || !orgId) { setLoading(false); return; }
    let live = true; const api = sample ? sampleTenantAdmin : liveTenants;
    (async () => {
      try {
        const tenants = await api.list(orgId);
        const deps = (await Promise.all(tenants.map(async (t) => (await api.departments(t.id)).map((d) => ({ id: d.id, tenantId: t.id, tenantName: t.name, name: d.name }))))).flat();
        const projs = (await Promise.all(deps.map(async (d) => (await api.projects(d.id)).map((p) => ({ id: p.id, departmentId: d.id, departmentName: d.name, tenantId: d.tenantId, tenantName: d.tenantName, name: p.name }))))).flat();
        const users = await admin.users({ size: 200 }).catch(() => null);
        const next = { orgId, orgName, tenants: tenants.map((t) => ({ id: t.id, name: t.name, region: t.homeRegion })), departments: deps, projects: projs,
          people: (users?.content ?? []).map((u) => ({ id: u.id, name: u.displayName, email: u.email, disabled: u.status === "DISABLED" })) };
        if (live) { cache = { ...next, groups: [] }; setRaw(next); setError(null); setLoading(false); }
      } catch (e) { if (live) { setError(e instanceof Error ? e.message : "The organization could not be loaded."); setLoading(false); } }
    })();
    return () => { live = false; };
  }, [admin, orgId, orgName, sample, tick]);

  const dir = useMemo<Directory>(() => (raw ? { ...raw, groups: sample ? org.groups : [] } : emptyDirectory), [raw, org.groups, sample]);
  return { dir, loading, error, reload };
}
