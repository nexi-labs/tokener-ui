"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Segmented, Toggle } from "@/components/ui/Form";
import { Loading, Notice, Toaster } from "@/components/mlops/ui";
import { toast } from "@/lib/mlops/toast";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useIamAdmin } from "@/lib/iam/useIamAdmin";
import { ProjectPicker } from "@/components/tenants/ProjectPicker";
import { liveBudgets, sampleBudgets, type BreachAction, type Metric, type NewBudget, type Period, type ScopeType } from "@/lib/budgets/client";
import { liveTenants, sampleTenantAdmin, type Department, type TenantSummary } from "@/lib/tenants/admin";

const msg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
type Level = Extract<ScopeType, "TENANT" | "DEPARTMENT" | "PROJECT">;

export default function NewBudgetPage() {
  const { orgId, sample } = useIamAdmin();
  const { status } = useAuth();
  const router = useRouter();
  const api = sample ? sampleBudgets : liveBudgets;
  const tenantApi = sample ? sampleTenantAdmin : liveTenants;
  const [tenants, setTenants] = useState<TenantSummary[] | null>(null);
  const [tenantId, setTenantId] = useState("");
  const [depts, setDepts] = useState<Department[]>([]);
  const [deptId, setDeptId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [level, setLevel] = useState<Level>("PROJECT");
  const [metric, setMetric] = useState<Metric>("COST");
  const [period, setPeriod] = useState<Period>("MONTHLY");
  const [currency, setCurrency] = useState("USD");
  const [limit, setLimit] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [onBreach, setOnBreach] = useState<BreachAction>("BLOCK");
  const [rollover, setRollover] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status !== "session" && status !== "demo") return;
    if (!orgId) { setTenants([]); return; }
    let live = true;
    tenantApi.list(orgId).then((t) => { if (live) { setTenants(t); setTenantId((c) => c || t[0]?.id || ""); } })
      .catch((e) => { if (live) { setProblem(msg(e, "Tenants could not be loaded.")); setTenants([]); } });
    return () => { live = false; };
  }, [tenantApi, orgId, status]);

  useEffect(() => {
    setDepts([]); setDeptId("");
    if (!tenantId || level !== "DEPARTMENT") return;
    let live = true;
    tenantApi.departments(tenantId).then((d) => { if (live) { setDepts(d); setDeptId(d[0]?.id ?? ""); } }).catch((e) => { if (live) setProblem(msg(e, "Departments could not be loaded.")); });
    return () => { live = false; };
  }, [tenantApi, tenantId, level]);

  const scopeId = level === "TENANT" ? tenantId : level === "DEPARTMENT" ? deptId : projectId;
  const amount = Number(limit);
  const customOk = period !== "CUSTOM" || (start && end && new Date(end) > new Date(start));
  const valid = !!scopeId && amount > 0 && Number.isFinite(amount) && !!customOk;

  const spec: NewBudget = useMemo(() => ({
    scopeType: level, scopeId, metric, limitValue: amount || 0, ...(metric === "COST" ? { currency } : {}), period,
    ...(period === "CUSTOM" && start && end ? { customStart: new Date(start).toISOString(), customEnd: new Date(end).toISOString() } : {}),
    onBreach, rollover, tenantId,
  }), [level, scopeId, metric, amount, currency, period, start, end, onBreach, rollover, tenantId]);

  const submit = async () => {
    setBusy(true); setProblem(null);
    try { await api.create(spec); toast("Budget created", "success"); router.push("/budgets"); }
    catch (e) { setProblem(e instanceof ApiError && e.status === 403 ? "Your role does not allow creating budgets for this scope." : msg(e, "The budget could not be created.")); setBusy(false); }
  };

  if (status === "loading" || tenants === null) return <Loading />;
  return (
    <>
      <Toaster />
      <Link href="/budgets" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary mb-3"><ArrowLeft size={14} /> Budgets</Link>
      <PageHeader title="New budget" description="Set a cost or token ceiling for a tenant, a department or a project. The gateway checks it before each provider call." />
      {sample && <div className="mb-4"><Notice tone="info" title="Sample workspace">A budget created here is kept in this browser tab only.</Notice></div>}
      {problem && <div className="mb-4"><Notice tone="bad" title="Could not continue">{problem}</Notice></div>}
      {tenants.length === 0 ? <Notice tone="info" title="No tenants yet">Create a tenant under Tenant Management before setting a budget.</Notice> : (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
          <div className="flex flex-col gap-5">
            <Card>
              <CardHeader title="Scope" subtitle="What this budget applies to." />
              <CardBody className="flex flex-col gap-4">
                <div>
                  <span className="block text-[13px] font-medium text-text-primary mb-1.5">Level</span>
                  <Segmented value={level} onChange={setLevel} options={[{ value: "TENANT", label: "Tenant" }, { value: "DEPARTMENT", label: "Department" }, { value: "PROJECT", label: "Project" }]} />
                </div>
                {level === "PROJECT" ? (
                  <ProjectPicker api={tenantApi} tenants={tenants} tenantId={tenantId} onTenant={setTenantId} onProject={(id) => setProjectId(id)} onProblem={setProblem} stacked />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Tenant"><Select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>{tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
                    {level === "DEPARTMENT" && <Field label="Department"><Select value={deptId} onChange={(e) => setDeptId(e.target.value)}>{depts.length === 0 && <option value="">No departments</option>}{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>}
                  </div>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Limit" subtitle="Cost or tokens, per period. To cap both, create one budget for each." />
              <CardBody className="flex flex-col gap-4">
                <div>
                  <span className="block text-[13px] font-medium text-text-primary mb-1.5">Budget type</span>
                  <Segmented value={metric} onChange={setMetric} options={[{ value: "COST", label: "Cost" }, { value: "TOKENS", label: "Tokens" }]} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label={metric === "COST" ? `Limit (${currency})` : "Limit (tokens)"}><Input type="number" min={0} value={limit} onChange={(e) => setLimit(e.target.value)} placeholder={metric === "COST" ? "5000" : "20000000"} /></Field>
                  {metric === "COST" && <Field label="Currency"><Select value={currency} onChange={(e) => setCurrency(e.target.value)}><option>USD</option><option>EUR</option><option>GBP</option><option>BHD</option></Select></Field>}
                  <Field label="Period"><Select value={period} onChange={(e) => setPeriod(e.target.value as Period)}><option value="DAILY">Daily</option><option value="MONTHLY">Monthly</option><option value="CUSTOM">Custom range</option></Select></Field>
                </div>
                {period === "CUSTOM" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Starts (UTC)"><Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
                    <Field label="Ends (UTC)" hint={start && end && !customOk ? "The end must be after the start." : undefined}><Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
                  </div>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="When the limit is reached" subtitle="Applied at 100% of the limit." />
              <CardBody className="flex flex-col gap-5">
                <Segmented value={onBreach} onChange={setOnBreach} options={[{ value: "WARN", label: "Warn only" }, { value: "THROTTLE", label: "Throttle" }, { value: "BLOCK", label: "Block" }]} />
                <Toggle checked={rollover} onChange={setRollover} label="Roll unused budget into the next period" />
              </CardBody>
            </Card>

            <div className="flex items-center gap-3">
              <Button variant="primary" onClick={submit} disabled={!valid || busy}>{busy ? "Creating" : "Create budget"}</Button>
              <Link href="/budgets"><Button variant="ghost">Cancel</Button></Link>
            </div>
          </div>

          <div className="flex flex-col gap-5 xl:sticky xl:top-24">
            <Card>
              <CardHeader title="Request" subtitle="POST /api/v1/budgets" />
              <CardBody><pre className="text-xs font-mono text-text-secondary overflow-x-auto leading-relaxed">{JSON.stringify(spec, null, 2)}</pre></CardBody>
            </Card>
            <Notice tone="info" title="Not available yet">Warning thresholds before the limit, a second limit on the same budget, and email notification are not part of the budget service. Throttle and block act at the limit.</Notice>
          </div>
        </div>
      )}
    </>
  );
}
