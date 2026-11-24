"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Plus, Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Select } from "@/components/ui/Form";
import { EmptyState } from "@/components/ui/EmptyState";
import { Confirm, Loading, Notice, Toaster } from "@/components/mlops/ui";
import { toast } from "@/lib/mlops/toast";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useIamAdmin } from "@/lib/iam/useIamAdmin";
import { liveBudgets, sampleBudgets, type Budget } from "@/lib/budgets/client";
import { liveTenants, sampleTenantAdmin, type TenantSummary } from "@/lib/tenants/admin";

const msg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const money = (n: number, cur: string | null) => (cur ? new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(n) : n.toLocaleString("en-US") + " tokens");
const LEVEL: Record<string, string> = { ORG: "Organization", TENANT: "Tenant", DEPARTMENT: "Department", PROJECT: "Project", USER: "User" };
const PERIOD: Record<string, string> = { DAILY: "per day", MONTHLY: "per month", CUSTOM: "custom range" };
const BREACH: Record<string, { label: string; tone: "down" | "degraded" | "info" | "neutral" }> = {
  BLOCK: { label: "Blocks requests", tone: "down" }, THROTTLE: { label: "Throttles requests", tone: "degraded" }, WARN: { label: "Warns only", tone: "info" }, NONE: { label: "No action", tone: "neutral" },
};

export default function BudgetsPage() {
  const { orgId, sample } = useIamAdmin();
  const { status } = useAuth();
  const api = sample ? sampleBudgets : liveBudgets;
  const tenantApi = sample ? sampleTenantAdmin : liveTenants;
  const [tenants, setTenants] = useState<TenantSummary[] | null>(null);
  const [tenantId, setTenantId] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});
  const [budgets, setBudgets] = useState<Budget[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [off, setOff] = useState<Budget | null>(null);

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
    setBudgets(null); setProblem(null);
    try {
      setBudgets(await api.list(tenantId));
      // Names for the departments and projects the budgets point at. A budget still lists if a name cannot be found.
      const depts = await tenantApi.departments(tenantId);
      const projects = (await Promise.all(depts.map((d) => tenantApi.projects(d.id)))).flat();
      setNames({ ...Object.fromEntries((tenants ?? []).map((t) => [t.id, t.name])), ...Object.fromEntries(depts.map((d) => [d.id, d.name])), ...Object.fromEntries(projects.map((p) => [p.id, p.name])) });
    } catch (e) {
      setProblem(e instanceof ApiError && e.status === 403 ? "Your role does not allow reading budgets for this tenant." : msg(e, "Budgets could not be loaded."));
      setBudgets((b) => b ?? []);
    }
  }, [api, tenantApi, tenantId, tenants]);
  useEffect(() => { void load(); }, [load]);

  const disable = async () => {
    if (!off) return;
    try { await api.disable(off.id); toast("Budget disabled", "success"); setOff(null); await load(); }
    catch (e) { toast(msg(e, "The budget could not be disabled."), "error"); setOff(null); }
  };

  if (status === "loading") return <Loading />;
  const header = (
    <PageHeader
      title="Budget Management"
      description="Cost and token ceilings per tenant, department or project, with the action taken when one is passed."
      action={<Link href="/budgets/new"><Button variant="primary"><Plus size={15} /> New budget</Button></Link>}
    />
  );
  if (!orgId) return <>{header}<Notice tone="info" title="No organization selected">This account is not part of an organization, so there are no budgets to manage here.</Notice></>;

  return (
    <>
      {header}
      <Toaster />
      {sample && <div className="mb-4"><Notice tone="info" title="Sample budgets">These are sample budgets. Nothing here belongs to a real organization.</Notice></div>}
      {problem && <div className="mb-4"><Notice tone="bad" title="Could not load">{problem}</Notice></div>}
      <div className="mb-4"><Notice tone="info" title="Limits only">The budget service returns each limit and what happens when it is passed. It does not return how much has been spent against it yet, so no usage bars are shown.</Notice></div>

      <div className="mb-5 max-w-sm">
        <Field label="Tenant">
          <Select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
            {(tenants ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
      </div>

      {budgets === null ? <Loading /> : budgets.length === 0 ? (
        <Card><EmptyState icon={Wallet} title="No budgets in this tenant" description="Create one to cap cost or tokens for the tenant, a department or a project." /></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {budgets.map((b) => {
            const br = BREACH[b.onBreach] ?? BREACH.NONE;
            return (
              <Card key={b.id} className={`p-5 ${b.enabled ? "" : "opacity-70"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-text-tertiary">{LEVEL[b.scopeType] ?? b.scopeType}</p>
                    <p className="text-sm font-medium text-text-primary truncate" title={b.scopeId}>{names[b.scopeId] ?? b.scopeId.slice(0, 8)}</p>
                  </div>
                  {b.enabled ? <Badge tone={br.tone}>{br.label}</Badge> : <Badge tone="neutral">Disabled</Badge>}
                </div>
                <p className="mt-4 text-2xl font-semibold tabular-nums text-text-primary">{money(b.limitValue, b.currency)}</p>
                <p className="text-xs text-text-tertiary mt-0.5">{b.metric === "COST" ? "Cost" : "Tokens"} limit, {PERIOD[b.period] ?? b.period}{b.rollover ? ", unused amount rolls over" : ""}</p>
                {b.enabled && <div className="mt-4"><Button variant="secondary" onClick={() => setOff(b)}>Disable</Button></div>}
              </Card>
            );
          })}
        </div>
      )}

      <Confirm open={!!off} onClose={() => setOff(null)} onConfirm={disable} danger title="Disable this budget?" confirmLabel="Disable budget"
        body={<>Requests for {off ? names[off.scopeId] ?? "this scope" : ""} are no longer held to this limit. A disabled budget cannot be switched back on; create a new one instead.</>} />
    </>
  );
}
