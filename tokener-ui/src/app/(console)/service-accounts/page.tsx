"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { EmptyState } from "@/components/ui/EmptyState";
import { CodeBlock, Confirm, Loading, Modal, Notice, Toaster, fmtDate, relTime } from "@/components/mlops/ui";
import { toast } from "@/lib/mlops/toast";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useIamAdmin } from "@/lib/iam/useIamAdmin";
import { roleLabel } from "@/lib/iam/admin";
import { LIFETIMES, SA_ROLES, liveServiceAccounts, sampleServiceAccounts, type IssuedServiceAccount, type SaStatus, type ServiceAccount } from "@/lib/iam/serviceAccounts";
import { liveTenants, sampleTenantAdmin, type TenantSummary } from "@/lib/tenants/admin";
import { ProjectPicker } from "@/components/tenants/ProjectPicker";

const msg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const TONE: Record<SaStatus, "healthy" | "degraded" | "neutral"> = { ACTIVE: "healthy", EXPIRED: "degraded", REVOKED: "neutral" };
const LABEL: Record<SaStatus, string> = { ACTIVE: "Active", EXPIRED: "Expired", REVOKED: "Revoked" };

export default function ServiceAccountsPage() {
  const { orgId, sample } = useIamAdmin();
  const { status } = useAuth();
  const tenantApi = sample ? sampleTenantAdmin : liveTenants;
  const sa = sample ? sampleServiceAccounts : liveServiceAccounts;
  const [tenants, setTenants] = useState<TenantSummary[] | null>(null);
  const [tenantId, setTenantId] = useState("");
  const [rows, setRows] = useState<ServiceAccount[] | null>(null);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [issued, setIssued] = useState<IssuedServiceAccount | null>(null);
  const [rotate, setRotate] = useState<ServiceAccount | null>(null);
  const [revoke, setRevoke] = useState<ServiceAccount | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!orgId || (status !== "session" && status !== "demo")) return;
    let live = true;
    tenantApi.list(orgId).then((t) => { if (live) { setTenants(t); setTenantId((cur) => cur || t[0]?.id || ""); } }).catch((e) => { if (live) { setProblem(msg(e, "Tenants could not be loaded.")); setTenants([]); } });
    return () => { live = false; };
  }, [tenantApi, orgId, status]);

  useEffect(() => {
    if (!tenantId) { setRows([]); return; }
    let live = true;
    setRows(null); setProblem(null);
    sa.list(tenantId).then((r) => { if (live) setRows(r); }).catch((e) => {
      if (!live) return;
      setProblem(e instanceof ApiError && e.status === 403 ? "Your role does not allow reading service accounts in this tenant." : msg(e, "Service accounts could not be loaded."));
      setRows([]);
    });
    // Project names are not part of an account, so they are looked up once per tenant.
    (async () => {
      try {
        const names: Record<string, string> = {};
        for (const d of await tenantApi.departments(tenantId)) for (const p of await tenantApi.projects(d.id)) names[p.id] = `${p.name} (${d.name})`;
        if (live) setProjectNames(names);
      } catch { /* names are a convenience; the list still works without them */ }
    })();
    return () => { live = false; };
  }, [sa, tenantApi, tenantId, tick]);

  if (status === "loading") return <Loading />;
  const header = (
    <PageHeader
      title="Service Accounts"
      description="Machine identities for Gateway and Control Plane API calls. Each one exchanges a client ID and a secret for a short-lived token."
      action={<Button variant="primary" onClick={() => setCreating(true)} disabled={!tenants?.length}><Plus size={15} /> New service account</Button>}
    />
  );
  if (!orgId) return <>{header}<Notice tone="info" title="No organization selected">This account is not part of an organization, so there are no service accounts to manage here.</Notice></>;

  return (
    <>
      {header}
      <Toaster />
      {sample && <div className="mb-4"><Notice tone="info" title="Sample service accounts">These are sample records and sample secrets. Nothing here is saved to a real organization.</Notice></div>}
      {problem && <div className="mb-4"><Notice tone="bad" title="Could not load">{problem}</Notice></div>}

      {tenants === null ? <Loading /> : tenants.length === 0 ? (
        <Notice tone="info" title="No tenants yet">Create a tenant, a department and a project in Tenant Management first. A service account belongs to a project.</Notice>
      ) : (
        <>
          <div className="mb-6 max-w-xs"><Field label="Tenant"><Select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>{tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field></div>
          <Card>
            <CardHeader title="Service accounts" subtitle="A secret is shown once, when it is created or rotated" />
            {rows === null ? <div className="p-6"><Loading /></div> : rows.length === 0 ? (
              <EmptyState icon={Plus} title="No service accounts in this tenant" description="Create one for a batch job, a pipeline or a service that calls the platform without a person." />
            ) : (
              <Table>
                <Thead><tr><Th>Name</Th><Th>Project</Th><Th>Role</Th><Th>Status</Th><Th>Expires</Th><Th>Last used</Th><Th></Th></tr></Thead>
                <tbody>
                  {rows.map((a) => (
                    <Tr key={a.id}>
                      <Td><span className="font-medium text-text-primary">{a.name}</span></Td>
                      <Td className="text-text-secondary">{projectNames[a.projectId] ?? <span className="font-mono text-xs">{a.projectId.slice(0, 8)}</span>}</Td>
                      <Td>{roleLabel(a.role)}</Td>
                      <Td><Badge tone={TONE[a.status]}>{LABEL[a.status]}</Badge></Td>
                      <Td className="text-text-secondary">{a.expiresAt ? fmtDate(a.expiresAt) : "Never"}</Td>
                      <Td className="text-text-secondary">{a.lastUsedAt ? relTime(a.lastUsedAt) : "Never"}</Td>
                      <Td className="text-right whitespace-nowrap">
                        {a.status !== "REVOKED" && (
                          <>
                            <button className="text-sm font-medium text-text-primary hover:text-accent-700 mr-4" onClick={() => setRotate(a)} aria-label={`Rotate the secret of ${a.name}`}>Rotate secret</button>
                            <button className="text-sm font-medium text-status-down hover:underline" onClick={() => setRevoke(a)} aria-label={`Revoke ${a.name}`}>Revoke</button>
                          </>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <p className="mt-4 text-xs text-text-tertiary max-w-2xl">A service account can only hold a role you hold yourself. Its secret is stored as a hash, so a lost one is replaced by rotating it.</p>
        </>
      )}

      <NewAccount open={creating} onClose={() => setCreating(false)} tenants={tenants ?? []} tenantId={tenantId} tenantApi={tenantApi}
        onCreate={async (projectId, name, role, days) => {
          try { const made = await sa.create(projectId, name, role, days); setCreating(false); setIssued(made); reload(); return null; }
          catch (e) { return msg(e, "The service account could not be created."); }
        }} />

      <RotateDialog account={rotate} onClose={() => setRotate(null)} onRotate={async (a, days) => {
        try { const r = await sa.rotate(a.id, days); setRotate(null); setIssued(r); reload(); return null; }
        catch (e) { return msg(e, "The secret could not be rotated."); }
      }} />

      <Modal open={!!issued} onClose={() => setIssued(null)} title="Copy the secret now" footer={<Button variant="primary" onClick={() => setIssued(null)}>I have stored it</Button>}>
        <div className="space-y-3">
          <Notice tone="warn" title="This is the only time the secret is shown">The platform keeps only a hash of it. If it is lost, rotate it.{sample ? " This is a sample secret and is not valid anywhere." : ""}</Notice>
          <p className="text-[13px] text-text-secondary">Service account <span className="font-medium text-text-primary">{issued?.name}</span>, role {issued ? roleLabel(issued.role) : ""}</p>
          <CodeBlock code={issued?.clientId ?? ""} language="text" title="Client ID" maxHeight={64} />
          <CodeBlock code={issued?.secret ?? ""} language="text" title="Secret" maxHeight={64} />
          <p className="text-xs text-text-tertiary">Exchange them for a token with <span className="font-mono">POST /api/v1/auth/token</span> and <span className="font-mono">grant_type=client_credentials</span>.</p>
        </div>
      </Modal>

      <Confirm open={!!revoke} onClose={() => setRevoke(null)} danger title={`Revoke ${revoke?.name}`} confirmLabel="Revoke"
        body={<p>It can no longer get a token. A token it already holds works until it expires, a few minutes at most. A revoked service account cannot be brought back; create a new one if it is needed later.</p>}
        onConfirm={async () => {
          const target = revoke; setRevoke(null);
          if (!target) return;
          try { await sa.revoke(target.id); toast(`${target.name} revoked`); reload(); }
          catch (e) { toast(msg(e, "The service account could not be revoked."), "error"); }
        }} />
    </>
  );
}

function NewAccount({ open, onClose, tenants, tenantId, tenantApi, onCreate }: {
  open: boolean; onClose: () => void; tenants: TenantSummary[]; tenantId: string; tenantApi: typeof sampleTenantAdmin;
  onCreate: (projectId: string, name: string, role: string, days: number | null) => Promise<string | null>;
}) {
  const [tid, setTid] = useState(tenantId);
  const [projectId, setProjectId] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>("developer");
  const [days, setDays] = useState<string>("90");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setTid(tenantId); setName(""); setRole("developer"); setDays("90"); setErr(null); } }, [open, tenantId]);
  const ok = !!projectId && name.trim().length > 0 && !busy;
  return (
    <Modal open={open} onClose={onClose} title="New service account" footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button variant="primary" disabled={!ok} onClick={async () => { setBusy(true); setErr(await onCreate(projectId, name.trim(), role, days === "" ? null : Number(days))); setBusy(false); }}>Create and issue secret</Button>
    </>}>
      <div className="space-y-4">
        {err && <Notice tone="bad">{err}</Notice>}
        <ProjectPicker stacked api={tenantApi} tenants={tenants} tenantId={tid} onTenant={setTid} onProject={(id) => setProjectId(id)} onProblem={setErr} />
        <Field label="Name" hint="The workload that will use it, such as nightly-eval."><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Role" hint="What it may do. You can only give a role you hold."><Select value={role} onChange={(e) => setRole(e.target.value)}>{SA_ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</Select></Field>
          <Field label="Secret lifetime"><Select value={days} onChange={(e) => setDays(e.target.value)}>{LIFETIMES.map((l) => <option key={l.label} value={l.days ?? ""}>{l.label}</option>)}</Select></Field>
        </div>
      </div>
    </Modal>
  );
}

function RotateDialog({ account, onClose, onRotate }: { account: ServiceAccount | null; onClose: () => void; onRotate: (a: ServiceAccount, days: number | null | undefined) => Promise<string | null> }) {
  const [days, setDays] = useState("keep");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDays(account?.status === "EXPIRED" ? "90" : "keep"); setErr(null); }, [account]);
  return (
    <Modal open={!!account} onClose={onClose} title={`Rotate the secret of ${account?.name ?? ""}`} footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button variant="primary" disabled={busy} onClick={async () => { if (!account) return; setBusy(true); setErr(await onRotate(account, days === "keep" ? undefined : days === "" ? null : Number(days))); setBusy(false); }}>Rotate secret</Button>
    </>}>
      <div className="space-y-4">
        {err && <Notice tone="bad">{err}</Notice>}
        <p className="text-text-secondary">A new secret is issued and shown once. The current one stops working at once, so anything still using it fails until it is given the new one.</p>
        <Field label="Lifetime of the new secret"><Select value={days} onChange={(e) => setDays(e.target.value)}>
          {account?.status !== "EXPIRED" && <option value="keep">Keep the current expiry</option>}
          {LIFETIMES.filter((l) => l.days !== null).map((l) => <option key={l.label} value={l.days ?? ""}>{l.label} from now</option>)}
        </Select></Field>
      </div>
    </Modal>
  );
}
