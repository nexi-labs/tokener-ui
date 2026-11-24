"use client";

import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Loading, Notice, Toaster } from "@/components/mlops/ui";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useIamAdmin } from "@/lib/iam/useIamAdmin";
import { liveTenants, sampleTenantAdmin, type TenantSummary } from "@/lib/tenants/admin";
import { ProjectPicker } from "@/components/tenants/ProjectPicker";
import { Applications } from "@/components/tenants/Applications";

const msg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/**
 * An API key belongs to an application, and an application belongs to a project, so the screen narrows to one project first:
 * tenant, then department, then project. Keys are never listed, because the platform keeps only a hash.
 */
export default function ApiKeysPage() {
  const { orgId, sample } = useIamAdmin();
  const { status } = useAuth();
  const api = sample ? sampleTenantAdmin : liveTenants;
  const [tenants, setTenants] = useState<TenantSummary[] | null>(null);
  const [tenantId, setTenantId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId || (status !== "session" && status !== "demo")) return;
    let live = true;
    api.list(orgId).then((t) => { if (live) { setTenants(t); setTenantId(t[0]?.id ?? ""); } }).catch((e) => { if (live) { setProblem(msg(e, "Tenants could not be loaded.")); setTenants([]); } });
    return () => { live = false; };
  }, [api, orgId, status]);

  if (status === "loading") return <Loading />;
  return (
    <>
      <PageHeader title="API Keys" description="Credentials issued to applications for Data Plane access. A key is shown once, when its application is created." />
      <Toaster />
      {sample && <div className="mb-4"><Notice tone="info" title="Sample applications">These are sample records and sample keys. Nothing here is saved to a real organization.</Notice></div>}
      {problem && <div className="mb-4"><Notice tone="bad" title="Could not load">{problem}</Notice></div>}
      {!orgId ? <Notice tone="info" title="No organization selected">This account is not part of an organization, so there are no projects to issue keys for.</Notice> : tenants === null ? <Loading /> : tenants.length === 0 ? (
        <Notice tone="info" title="No tenants yet">Create a tenant, a department and a project in Tenant Management first. Keys are issued to applications inside a project.</Notice>
      ) : (
        <>
          <div className="mb-6 max-w-3xl"><ProjectPicker api={api} tenants={tenants} tenantId={tenantId} onTenant={setTenantId} onProject={(id) => setProjectId(id)} onProblem={setProblem} /></div>
          {projectId ? (
            <Card className="p-5 max-w-3xl"><Applications api={api} projectId={projectId} /></Card>
          ) : (
            <p className="text-sm text-text-secondary max-w-xl"><KeyRound size={14} className="inline mr-1.5 -mt-0.5" />Choose a project to see its applications. Departments and projects are created in Tenant Management.</p>
          )}
        </>
      )}
    </>
  );
}
