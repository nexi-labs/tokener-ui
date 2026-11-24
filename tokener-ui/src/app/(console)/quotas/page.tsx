"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Gauge, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Segmented } from "@/components/ui/Form";
import { EmptyState } from "@/components/ui/EmptyState";
import { Confirm, Loading, Modal, Notice, Toaster } from "@/components/mlops/ui";
import { ProjectPicker } from "@/components/tenants/ProjectPicker";
import { toast } from "@/lib/mlops/toast";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useIamAdmin } from "@/lib/iam/useIamAdmin";
import { liveQuotas, sampleQuotas, METRICS, WINDOWS, type Metric, type NewQuota, type Quota } from "@/lib/quotas/client";
import { liveTenants, sampleTenantAdmin, type AppSummary, type TenantSummary } from "@/lib/tenants/admin";

const msg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const LEVEL: Record<string, string> = { ORG: "Organization", TENANT: "Tenant", PROJECT: "Project", APPLICATION: "Application", USER: "User" };
const windowLabel = (q: Quota) => WINDOWS.find((w) => w.windowType === q.windowType && w.windowSpec === q.windowSpec)?.label ?? `${q.windowSpec} (${q.windowType.toLowerCase()})`;
const unit = (m: Metric) => METRICS.find((x) => x.value === m)?.unit ?? "";

export default function QuotasPage() {
  const { orgId, sample } = useIamAdmin();
  const { status } = useAuth();
  const api = sample ? sampleQuotas : liveQuotas;
  const tenantApi = sample ? sampleTenantAdmin : liveTenants;
  const [tenants, setTenants] = useState<TenantSummary[] | null>(null);
  const [tenantId, setTenantId] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});
  const [quotas, setQuotas] = useState<Quota[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [off, setOff] = useState<Quota | null>(null);

  useEffect(() => {
    if (status !== "session" && status !== "demo") return;
    if (!orgId) { setTenants([]); return; }
    let live = true;
    tenantApi.list(orgId).then((t) => { if (live) { setTenants(t); setTenantId((c) => c || t[0]?.id || ""); } })
      .catch((e) => { if (live) { setProblem(msg(e, "Tenants could not be loaded.")); setTenants([]); } });
    return () => { live = false; };
  }, [tenantApi, orgId, status]);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setQuotas(null); setProblem(null);
    try {
      setQuotas(await api.list(tenantId));
      // Names for what each quota points at. A quota still lists if a name cannot be found.
      const depts = await tenantApi.departments(tenantId);
      const projects = (await Promise.all(depts.map((d) => tenantApi.projects(d.id)))).flat();
      const apps = (await Promise.all(projects.map((p) => tenantApi.applications(p.id)))).flat();
      setNames({ ...Object.fromEntries((tenants ?? []).map((t) => [t.id, t.name])), ...Object.fromEntries(projects.map((p) => [p.id, p.name])), ...Object.fromEntries(apps.map((a) => [a.id, a.name])) });
    } catch (e) {
      setProblem(e instanceof ApiError && e.status === 403 ? "Your role does not allow reading quotas for this tenant." : msg(e, "Quotas could not be loaded."));
      setQuotas((q) => q ?? []);
    }
  }, [api, tenantApi, tenantId, tenants]);
  useEffect(() => { void load(); }, [load]);

  const disable = async () => {
    if (!off) return;
    try { await api.disable(off.id); toast("Quota disabled", "success"); setOff(null); await load(); }
    catch (e) { toast(msg(e, "The quota could not be disabled."), "error"); setOff(null); }
  };

  if (status === "loading") return <Loading />;
  const header = (
    <PageHeader
      title="Quota Management"
      description="Rate and volume ceilings per tenant, project or application, enforced separately from budgets to protect platform stability."
      action={<Button variant="primary" onClick={() => setCreating(true)} disabled={!tenantId}><Plus size={15} /> New quota</Button>}
    />
  );
  if (!orgId) return <>{header}<Notice tone="info" title="No organization selected">This account is not part of an organization, so there are no quotas to manage here.</Notice></>;

  return (
    <>
      {header}
      <Toaster />
      {sample && <div className="mb-4"><Notice tone="info" title="Sample quotas">These are sample quotas. Nothing here belongs to a real organization.</Notice></div>}
      {problem && <div className="mb-4"><Notice tone="bad" title="Could not load">{problem}</Notice></div>}
      <div className="mb-4"><Notice tone="info" title="Limits only">The quota service returns each limit and its window. It does not return how much of a window has been used, so no usage is shown.</Notice></div>
      <div className="mb-5 max-w-sm">
        <Field label="Tenant"><Select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>{(tenants ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
      </div>

      <Card>
        {quotas === null ? <div className="p-6"><Loading /></div> : quotas.length === 0 ? (
          <EmptyState icon={Gauge} title="No quotas in this tenant" description="Create one to cap requests, tokens, images, embeddings or speech seconds over a window." />
        ) : (
          <Table>
            <Thead><tr><Th>Scope</Th><Th>Metric</Th><Th>Window</Th><Th>Limit</Th><Th></Th></tr></Thead>
            <tbody>
              {quotas.map((q) => (
                <Tr key={q.id} className={q.enabled ? "" : "opacity-60"}>
                  <Td><span className="text-text-tertiary text-xs mr-2">{LEVEL[q.scopeType] ?? q.scopeType}</span><span className="font-medium" title={q.scopeId}>{names[q.scopeId] ?? q.scopeId.slice(0, 8)}</span></Td>
                  <Td><Badge tone="neutral">{METRICS.find((m) => m.value === q.metric)?.label ?? q.metric}</Badge></Td>
                  <Td className="text-text-secondary">{windowLabel(q)}</Td>
                  <Td className="tabular-nums font-medium">{q.limitValue.toLocaleString("en-US")} <span className="text-text-tertiary font-normal">{unit(q.metric)}</span></Td>
                  <Td className="text-right">{q.enabled ? <button className="text-text-primary font-medium hover:text-accent-700" onClick={() => setOff(q)}>Disable</button> : <Badge tone="neutral">Disabled</Badge>}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {creating && <NewQuotaModal api={api} tenantApi={tenantApi} tenants={tenants ?? []} tenantId={tenantId} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); toast("Quota created", "success"); void load(); }} />}
      <Confirm open={!!off} onClose={() => setOff(null)} onConfirm={disable} danger title="Disable this quota?" confirmLabel="Disable quota"
        body={<>Requests are no longer held to this limit. A disabled quota cannot be switched back on; create a new one instead.</>} />
    </>
  );
}

function NewQuotaModal({ api, tenantApi, tenants, tenantId, onClose, onCreated }: {
  api: typeof sampleQuotas; tenantApi: typeof sampleTenantAdmin; tenants: TenantSummary[]; tenantId: string; onClose: () => void; onCreated: () => void;
}) {
  const [level, setLevel] = useState<"TENANT" | "PROJECT" | "APPLICATION">("APPLICATION");
  const [projectId, setProjectId] = useState("");
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [appId, setAppId] = useState("");
  const [metric, setMetric] = useState<Metric>("REQUESTS");
  const [win, setWin] = useState(WINDOWS[0].value);
  const [limit, setLimit] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setApps([]); setAppId("");
    if (level !== "APPLICATION" || !projectId) return;
    let live = true;
    tenantApi.applications(projectId).then((a) => { if (live) { setApps(a); setAppId(a[0]?.id ?? ""); } }).catch((e) => { if (live) setProblem(msg(e, "Applications could not be loaded.")); });
    return () => { live = false; };
  }, [tenantApi, level, projectId]);

  const scopeId = level === "TENANT" ? tenantId : level === "PROJECT" ? projectId : appId;
  const amount = Number(limit);
  const valid = !!scopeId && Number.isInteger(amount) && amount > 0;
  const w = WINDOWS.find((x) => x.value === win)!;
  const spec: NewQuota = useMemo(() => ({ scopeType: level, scopeId, metric, windowType: w.windowType, windowSpec: w.windowSpec, limitValue: amount, tenantId }), [level, scopeId, metric, w, amount, tenantId]);

  const submit = async () => {
    setBusy(true); setProblem(null);
    try { await api.create(spec); onCreated(); }
    catch (e) { setProblem(e instanceof ApiError && e.status === 403 ? "Your role does not allow creating quotas for this scope." : msg(e, "The quota could not be created.")); setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title="New quota" wide
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit} disabled={!valid || busy}>{busy ? "Creating" : "Create quota"}</Button></>}>
      <div className="flex flex-col gap-4">
        {problem && <Notice tone="bad" title="Could not continue">{problem}</Notice>}
        <div>
          <span className="block text-[13px] font-medium text-text-primary mb-1.5">Applies to</span>
          <Segmented value={level} onChange={setLevel} options={[{ value: "TENANT", label: "Tenant" }, { value: "PROJECT", label: "Project" }, { value: "APPLICATION", label: "Application" }]} />
        </div>
        {level !== "TENANT" && <ProjectPicker api={tenantApi} tenants={tenants} tenantId={tenantId} onProject={(id) => setProjectId(id)} onProblem={setProblem} stacked />}
        {level === "APPLICATION" && (
          <Field label="Application"><Select value={appId} onChange={(e) => setAppId(e.target.value)}>{apps.length === 0 && <option value="">No applications in this project</option>}{apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Metric"><Select value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>{METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</Select></Field>
          <Field label="Window"><Select value={win} onChange={(e) => setWin(e.target.value)}>{WINDOWS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</Select></Field>
        </div>
        <Field label={`Limit (${unit(metric)} per window)`}><Input type="number" min={1} step={1} value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="600" /></Field>
      </div>
    </Modal>
  );
}
