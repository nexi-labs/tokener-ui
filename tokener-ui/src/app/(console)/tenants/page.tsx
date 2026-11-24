"use client";

import { useCallback, useEffect, useState } from "react";
import { Boxes, Building2, ChevronRight, FolderKanban, FolderTree, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { EmptyState } from "@/components/ui/EmptyState";
import { Drawer, Loading, Modal, Notice, Toaster, fmtDate } from "@/components/mlops/ui";
import { toast } from "@/lib/mlops/toast";
import { Applications } from "@/components/tenants/Applications";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useIamAdmin } from "@/lib/iam/useIamAdmin";
import { HOME_REGIONS, liveTenants, sampleTenantAdmin, type Department, type Project, type TenantAdmin, type TenantSummary } from "@/lib/tenants/admin";

const msg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

export default function TenantsPage() {
  const { orgId, orgName, sample } = useIamAdmin();
  const { status } = useAuth();
  const api = sample ? sampleTenantAdmin : liveTenants;
  const [tenants, setTenants] = useState<TenantSummary[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<TenantSummary | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!orgId || (status !== "session" && status !== "demo")) return;
    let live = true;
    setProblem(null);
    api.list(orgId).then((t) => { if (live) setTenants(t); }).catch((e) => { if (live) setProblem(msg(e, "Tenants could not be loaded.")); });
    return () => { live = false; };
  }, [api, orgId, status, tick]);

  if (status === "loading") return <Loading />;
  if (!orgId) return (
    <>
      <PageHeader title="Tenant Management" description="Organization, tenant, department, project and application." />
      <Notice tone="info" title="No organization selected">This account is not part of an organization, so there are no tenants to manage here.</Notice>
    </>
  );

  const levels = [
    { icon: Building2, label: "Organization", detail: orgName ?? "" },
    { icon: FolderTree, label: "Tenant", detail: tenants ? `${tenants.length} ${tenants.length === 1 ? "tenant" : "tenants"}` : "" },
    { icon: FolderKanban, label: "Department", detail: "" },
    { icon: Boxes, label: "Project, then Application", detail: "" },
  ];

  return (
    <>
      <PageHeader
        title="Tenant Management"
        description="A tenant is the isolation boundary inside an organization: its own people, budgets, policies and keys."
        action={<Button variant="primary" onClick={() => setCreating(true)}><Plus size={15} /> New tenant</Button>}
      />
      <Toaster />
      {sample && <div className="mb-4"><Notice tone="info" title="Sample tenants">These are sample records. Nothing here is saved to a real organization.</Notice></div>}
      {problem && <div className="mb-4"><Notice tone="bad" title="Could not load">{problem}</Notice></div>}

      <div className="flex items-center gap-1 mb-6 flex-wrap">
        {levels.map((level, i) => (
          <div key={level.label} className="flex items-center gap-1">
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-md border border-border bg-surface">
              <level.icon size={15} className="text-text-tertiary" />
              <span className="text-sm font-medium text-text-primary">{level.label}</span>
              {level.detail && <span className="text-xs text-text-tertiary">{level.detail}</span>}
            </div>
            {i < levels.length - 1 && <ChevronRight size={14} className="text-text-tertiary shrink-0" />}
          </div>
        ))}
      </div>

      <Card>
        <CardHeader title="Tenants" subtitle={`Isolation boundaries inside ${orgName ?? "your organization"}`} />
        {!tenants ? <div className="p-6"><Loading /></div> : tenants.length === 0 ? (
          <EmptyState icon={FolderTree} title="No tenants yet" description="Create the first tenant to give a team its own budgets, policies and keys." />
        ) : (
          <Table>
            <Thead><tr><Th>Tenant</Th><Th>Home region</Th><Th>Identifier</Th><Th></Th></tr></Thead>
            <tbody>
              {tenants.map((t) => (
                <Tr key={t.id}>
                  <Td><span className="font-medium text-text-primary">{t.name}</span></Td>
                  <Td><Badge tone="neutral">{t.homeRegion}</Badge></Td>
                  <Td><span className="font-mono text-xs text-text-secondary">{t.id}</span></Td>
                  <Td className="text-right"><button className="text-text-primary font-medium hover:text-accent-700" onClick={() => setOpen(t)} aria-label={`Open ${t.name}`}>Open</button></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <p className="mt-4 text-xs text-text-tertiary max-w-2xl">The home region is where the tenant's data stays. Open a tenant to see its departments, projects and applications. Creating an application issues its API key, shown once.</p>

      <Drawer open={open !== null} onClose={() => setOpen(null)} title={open?.name ?? ""} subtitle={open ? `${open.homeRegion} · Departments, projects and applications` : undefined}>
        {open && <Hierarchy api={api} tenant={open} />}
      </Drawer>

      <NewTenant open={creating} onClose={() => setCreating(false)} onCreate={async (name, region) => {
        try { await api.create(orgId, name, region); toast(`Tenant ${name} created`); setCreating(false); reload(); return null; }
        catch (e) { return msg(e, "The tenant could not be created."); }
      }} />
    </>
  );
}

function NewTenant({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (name: string, region: string) => Promise<string | null> }) {
  const [name, setName] = useState("");
  const [region, setRegion] = useState(HOME_REGIONS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setName(""); setRegion(HOME_REGIONS[0]); setErr(null); } }, [open]);
  const ok = name.trim().length > 0 && !busy;
  return (
    <Modal open={open} onClose={onClose} title="New tenant" footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button variant="primary" disabled={!ok} onClick={async () => { setBusy(true); setErr(await onCreate(name.trim(), region)); setBusy(false); }}>Create tenant</Button>
    </>}>
      <div className="space-y-4">
        {err && <Notice tone="bad">{err}</Notice>}
        <Field label="Name" hint="Usually a team or an environment, such as Customer Support."><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label="Home region" hint="Where this tenant's data is kept."><Select value={region} onChange={(e) => setRegion(e.target.value)}>{HOME_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}</Select></Field>
      </div>
    </Modal>
  );
}

type Level = { kind: "departments" } | { kind: "projects"; dept: Department } | { kind: "apps"; dept: Department; project: Project };

function Hierarchy({ api, tenant }: { api: TenantAdmin; tenant: TenantSummary }) {
  const [level, setLevel] = useState<Level>({ kind: "departments" });
  const [rows, setRows] = useState<(Department | Project)[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    setRows(null); setProblem(null);
    if (level.kind === "apps") { setRows([]); return; }
    const p: Promise<(Department | Project)[]> = level.kind === "departments" ? api.departments(tenant.id) : api.projects(level.dept.id);
    p.then((r) => { if (live) setRows(r); }).catch((e) => {
      if (!live) return;
      setProblem(e instanceof ApiError && e.status === 403 ? "Your role does not allow reading this level." : msg(e, "This could not be loaded."));
      setRows([]);
    });
    return () => { live = false; };
  }, [api, tenant.id, level, tick]);

  const noun = level.kind === "departments" ? "department" : "project";
  const add = async () => {
    setErr(null);
    try {
      if (level.kind === "departments") await api.createDepartment(tenant.id, name.trim());
      else if (level.kind === "projects") await api.createProject(level.dept.id, name.trim());
      setAdding(false); setName(""); setTick((t) => t + 1); toast(`${noun[0].toUpperCase()}${noun.slice(1)} ${name.trim()} created`);
    } catch (e) { setErr(msg(e, `The ${noun} could not be created.`)); }
  };

  const crumbs: { label: string; go: Level }[] = [{ label: "Departments", go: { kind: "departments" } }];
  if (level.kind !== "departments") crumbs.push({ label: level.dept.name, go: { kind: "projects", dept: level.dept } });
  if (level.kind === "apps") crumbs.push({ label: level.project.name, go: level });

  return (
    <div>
      <nav aria-label="Where you are" className="flex items-center flex-wrap gap-1 text-sm mb-4">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={13} className="text-text-tertiary" />}
            {i === crumbs.length - 1 ? <span className="font-medium text-text-primary">{c.label}</span> : <button className="text-text-secondary hover:text-text-primary" onClick={() => { setAdding(false); setLevel(c.go); }}>{c.label}</button>}
          </span>
        ))}
      </nav>
      {level.kind === "apps" ? <Applications api={api} projectId={level.project.id} /> : <>
      {problem && <div className="mb-4"><Notice tone="warn">{problem}</Notice></div>}
      {rows === null ? <Loading /> : rows.length === 0 && !problem ? (
        <p className="text-sm text-text-secondary py-6">{`No ${level.kind} yet.`}</p>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-md">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-text-primary truncate">{r.name}</div>
                <div className="text-xs text-text-tertiary mt-0.5">Created {fmtDate(r.createdAt)}</div>
              </div>
              <button className="inline-flex items-center gap-1 text-sm font-medium text-text-primary hover:text-accent-700" onClick={() => { setAdding(false); setLevel(level.kind === "departments" ? { kind: "projects", dept: r as Department } : { kind: "apps", dept: level.dept, project: r as Project }); }}>{level.kind === "departments" ? "Projects" : "Applications"}<ChevronRight size={14} /></button>
            </li>
          ))}
        </ul>
      )}
        <div className="mt-5">
          {!adding ? <Button variant="secondary" onClick={() => setAdding(true)}><Plus size={14} /> New {noun}</Button> : (
            <div className="rounded-md border border-border p-4 space-y-3">
              {err && <Notice tone="bad">{err}</Notice>}
              <Field label={`${noun[0].toUpperCase()}${noun.slice(1)} name`}><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => { setAdding(false); setName(""); setErr(null); }}>Cancel</Button>
                <Button variant="primary" disabled={!name.trim()} onClick={add}>Create {noun}</Button>
              </div>
            </div>
          )}
        </div>
      </>}
    </div>
  );
}
