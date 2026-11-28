"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Pencil, Plus, Search, UserCheck, UserX, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { EmptyState } from "@/components/ui/EmptyState";
import { Confirm, Loading, Modal, Notice, Toaster, relTime } from "@/components/mlops/ui";
import { toast } from "@/lib/mlops/toast";
import { ApiError, type Paged } from "@/lib/api/client";
import type { RoleAssignment } from "@/lib/auth/client";
import { roleLabel, ROLE_SUMMARY, scopeLabel, type IamUser, type RoleInfo, type TenantSummary, type UserStatus } from "@/lib/iam/admin";
import { useIamAdmin } from "@/lib/iam/useIamAdmin";

const TONE: Record<UserStatus, "healthy" | "degraded" | "neutral"> = { ACTIVE: "healthy", INVITED: "degraded", PENDING: "degraded", DISABLED: "neutral" };
const STATUS_LABEL: Record<UserStatus, string> = { ACTIVE: "Active", INVITED: "Invited", PENDING: "Email not verified", DISABLED: "Disabled" };
const msg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const PAGE = 25;

export default function PeoplePage() {
  const { admin, orgId, orgName, selfId, sample } = useIamAdmin();
  const [roles, setRoles] = useState<RoleInfo[] | null>(null);
  const [data, setData] = useState<Paged<IamUser> | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(0);
  const [invite, setInvite] = useState(false);
  const [editing, setEditing] = useState<IamUser | null>(null);
  const [confirm, setConfirm] = useState<{ user: IamUser; disable: boolean } | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => { const t = setTimeout(() => { setTerm(q.trim()); setPage(0); }, 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => { if (admin) admin.roles().then(setRoles).catch((e) => setProblem(msg(e, "Roles could not be loaded."))); }, [admin]);
  useEffect(() => {
    if (!admin || !orgId) return;
    let live = true;
    setProblem(null);
    admin.users({ q: term || undefined, page, size: PAGE })
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setProblem(msg(e, "People could not be loaded.")); });
    return () => { live = false; };
  }, [admin, orgId, term, page, tick]);

  const orgRoles = useMemo(() => (roles ?? []).filter((r) => r.scopes.includes("org")), [roles]);
  const tenantRoles = useMemo(() => (roles ?? []).filter((r) => r.scopes.includes("tenant")), [roles]);
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  useEffect(() => { if (admin && orgId) admin.tenants(orgId).then(setTenants).catch(() => setTenants([])); }, [admin, orgId]);

  if (!admin) return <Loading />;
  if (!orgId) return (
    <>
      <PageHeader title="People and access" description="Who can sign in to this organization and what they can do." />
      <Notice tone="info" title="No organization selected">This account is not part of an organization, so there are no people to manage here.</Notice>
    </>
  );

  const run = async (what: string, f: () => Promise<unknown>) => {
    try { await f(); toast(what); reload(); } catch (e) { toast(msg(e, "That did not work. Try again."), "error"); }
  };

  return (
    <>
      <PageHeader
        title="People and access"
        description={`Who can sign in to ${orgName ?? "this organization"} and what they can do. Roles are fixed; each person gets one or more of them.`}
        action={<Button variant="primary" onClick={() => setInvite(true)}><Plus size={15} /> Invite person</Button>}
      />
      <Toaster />
      {sample && <Notice tone="info" title="Sample people">These are sample records. Nothing here is sent to anyone.</Notice>}
      {problem && <div className="mb-4"><Notice tone="bad" title="Could not load">{problem}</Notice></div>}

      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email" className="pl-9" aria-label="Search people" />
      </div>

      <Card>
        {!data ? <div className="p-6"><Loading /></div> : data.content.length === 0 ? (
          <EmptyState icon={Users} title={term ? "No one matches that search" : "No people yet"} description={term ? "Try a different name or email address." : "Invite the first person to this organization."} />
        ) : (
          <Table>
            <Thead><tr><Th>Person</Th><Th>Status</Th><Th>Roles</Th><Th>Last sign-in</Th><Th></Th></tr></Thead>
            <tbody>
              {data.content.map((u) => {
                const self = u.id === selfId;
                return (
                  <Tr key={u.id}>
                    <Td>
                      <div className="font-medium text-text-primary">{u.displayName}{self && <span className="ml-2 text-xs font-normal text-text-tertiary">you</span>}</div>
                      <div className="text-xs text-text-tertiary">{u.email}{u.externalProvider ? ` · ${u.externalProvider === "github" ? "GitHub" : u.externalProvider === "google" ? "Google" : u.externalProvider === "microsoft" ? "Microsoft" : u.externalProvider}` : ""}</div>
                    </Td>
                    <Td><Badge tone={TONE[u.status]}>{STATUS_LABEL[u.status]}</Badge></Td>
                    <Td>
                      <div className="flex flex-wrap gap-1.5">
                        {u.assignments.length === 0 ? <span className="text-xs text-text-tertiary">No roles</span> : u.assignments.map((a, i) => (
                          <span key={i} className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-xs text-text-secondary">
                            <span className="text-text-primary">{roleLabel(a.role)}</span><span className="mx-1 text-text-tertiary">at</span>{scopeLabel(a, orgName)}
                          </span>
                        ))}
                      </div>
                    </Td>
                    <Td className="text-text-secondary">{u.lastLoginAt ? relTime(u.lastLoginAt) : "Never"}</Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" aria-label={`Change roles of ${u.displayName}`} title="Change roles" onClick={() => setEditing(u)}><Pencil size={15} /></Button>
                        {u.externalProvider === null && u.status !== "DISABLED" && (
                          <Button variant="ghost" aria-label={`Send a password reset to ${u.displayName}`} title="Send password reset" onClick={() => run(`Password reset sent to ${u.email}`, () => admin.sendPasswordReset(u.id))}><KeyRound size={15} /></Button>
                        )}
                        {!self && (u.status === "DISABLED"
                          ? <Button variant="ghost" aria-label={`Enable ${u.displayName}`} title="Enable" onClick={() => run(`${u.displayName} can sign in again`, () => admin.setDisabled(u.id, false))}><UserCheck size={15} /></Button>
                          : <Button variant="ghost" aria-label={`Disable ${u.displayName}`} title="Disable" onClick={() => setConfirm({ user: u, disable: true })}><UserX size={15} /></Button>)}
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {data && data.totalElements > PAGE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border text-sm text-text-secondary">
            <span>{page * PAGE + 1} to {Math.min((page + 1) * PAGE, data.totalElements)} of {data.totalElements}</span>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
              <Button variant="secondary" disabled={page + 1 >= data.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>
      <p className="mt-4 text-xs text-text-tertiary max-w-2xl">A role can apply to the whole organization or to one tenant. Tenant admin only applies to a tenant. Roles that apply elsewhere, such as platform operator, are kept as they are when you change someone&apos;s roles.</p>

      <InviteModal open={invite} onClose={() => setInvite(false)} orgRoles={orgRoles} tenantRoles={tenantRoles} tenants={tenants} orgId={orgId}
        onInvite={async (email, name, a) => { try { await admin.invite(email, name, [a]); toast(`Invitation sent to ${email}`); setInvite(false); reload(); } catch (e) { toast(msg(e, "The invitation was not sent."), "error"); } }} />
      <RolesModal user={editing} onClose={() => setEditing(null)} orgRoles={orgRoles} tenantRoles={tenantRoles} tenants={tenants} orgId={orgId} orgName={orgName}
        onSave={async (u, a) => { try { await admin.replaceRoles(u.id, a); toast(`Roles updated for ${u.displayName}`); setEditing(null); reload(); } catch (e) { toast(msg(e, "Roles were not changed."), "error"); } }} />
      <Confirm open={!!confirm} onClose={() => setConfirm(null)} danger confirmLabel="Disable account" title={`Disable ${confirm?.user.displayName ?? ""}?`}
        body={<p>They are signed out and cannot sign in until you enable the account again. Their roles are kept.</p>}
        onConfirm={() => { const u = confirm!.user; setConfirm(null); run(`${u.displayName} is disabled`, () => admin.setDisabled(u.id, true)); }} />
    </>
  );
}

function RolePicker({ roles, value, onChange }: { roles: RoleInfo[]; value: string; onChange: (r: string) => void }) {
  return (
    <>
      <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Role">
        {roles.map((r) => <option key={r.role} value={r.role}>{roleLabel(r.role)}</option>)}
      </Select>
      {value && ROLE_SUMMARY[value] && <p className="mt-2 text-xs text-text-secondary">{ROLE_SUMMARY[value]}</p>}
    </>
  );
}

function InviteModal({ open, onClose, orgRoles, tenantRoles, tenants, orgId, onInvite }: {
  open: boolean; onClose: () => void; orgRoles: RoleInfo[]; tenantRoles: RoleInfo[]; tenants: TenantSummary[]; orgId: string;
  onInvite: (email: string, name: string, a: RoleAssignment) => Promise<void>;
}) {
  const [email, setEmail] = useState(""), [name, setName] = useState(""), [role, setRole] = useState(""), [busy, setBusy] = useState(false);
  const [where, setWhere] = useState<"org" | "tenant">("org"), [tenantId, setTenantId] = useState("");
  const roles = where === "org" ? orgRoles : tenantRoles;
  useEffect(() => { if (open) { setEmail(""); setName(""); setBusy(false); setWhere("org"); setTenantId(tenants[0]?.id ?? ""); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!roles.some((r) => r.role === role) && roles.length) setRole(roles.find((r) => r.role === "developer")?.role ?? roles[0].role); }, [roles, role]);
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && !!role && (where === "org" || !!tenantId);
  const assignment: RoleAssignment = where === "org" ? { role, scope: { type: "org", id: orgId } } : { role, scope: { type: "tenant", id: tenantId } };
  return (
    <Modal open={open} onClose={onClose} title="Invite a person"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid || busy} onClick={async () => { setBusy(true); await onInvite(email.trim(), name.trim(), assignment); setBusy(false); }}>Send invitation</Button></>}>
      <div className="space-y-4">
        <Field label="Email address"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" autoFocus /></Field>
        <Field label="Name" hint="Optional. They can change it when they accept."><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Applies to">
          <Select value={where} onChange={(e) => setWhere(e.target.value as "org" | "tenant")} aria-label="Applies to">
            <option value="org">The whole organization</option>
            <option value="tenant" disabled={tenants.length === 0}>One tenant{tenants.length === 0 ? " (this organization has none yet)" : ""}</option>
          </Select>
        </Field>
        {where === "tenant" && (
          <Field label="Tenant"><Select value={tenantId} onChange={(e) => setTenantId(e.target.value)} aria-label="Tenant">{tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        )}
        <Field label="Role"><RolePicker roles={roles} value={role} onChange={setRole} /></Field>
        <p className="text-xs text-text-tertiary">They get an email with a link to set a password. The link works once and expires.</p>
      </div>
    </Modal>
  );
}

type TenantRow = { role: string; tenantId: string };

function RolesModal({ user, onClose, orgRoles, tenantRoles, tenants, orgId, orgName, onSave }: {
  user: IamUser | null; onClose: () => void; orgRoles: RoleInfo[]; tenantRoles: RoleInfo[]; tenants: TenantSummary[]; orgId: string; orgName: string | null;
  onSave: (u: IamUser, a: RoleAssignment[]) => Promise<void>;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [rows, setRows] = useState<TenantRow[]>([]);
  const [busy, setBusy] = useState(false);
  const isOrg = (a: RoleAssignment) => a.scope.type === "org" && a.scope.id === orgId;
  const isTenant = (a: RoleAssignment) => a.scope.type === "tenant" && tenants.some((t) => t.id === a.scope.id);
  useEffect(() => {
    if (user) { setPicked(user.assignments.filter(isOrg).map((a) => a.role)); setRows(user.assignments.filter(isTenant).map((a) => ({ role: a.role, tenantId: a.scope.id! }))); setBusy(false); }
  }, [user, tenants]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!user) return null;
  const others = user.assignments.filter((a) => !isOrg(a) && !isTenant(a));
  const uniqueRows = rows.filter((r, i) => r.tenantId && rows.findIndex((x) => x.role === r.role && x.tenantId === r.tenantId) === i);
  const next: RoleAssignment[] = [...others, ...picked.map((role) => ({ role, scope: { type: "org", id: orgId } })), ...uniqueRows.map((r) => ({ role: r.role, scope: { type: "tenant", id: r.tenantId } }))];
  const key = (a: RoleAssignment[]) => JSON.stringify(a.map((x) => `${x.role}@${x.scope.type}:${x.scope.id ?? ""}`).sort());
  const unchanged = key(next) === key(user.assignments);
  const tenantName = (id: string) => tenants.find((t) => t.id === id)?.name ?? id.slice(0, 8);
  const addRow = () => { const role = tenantRoles.find((r) => r.role === "developer")?.role ?? tenantRoles[0]?.role; if (role && tenants[0]) setRows([...rows, { role, tenantId: tenants[0].id }]); };
  return (
    <Modal open onClose={onClose} title={`Roles for ${user.displayName}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy || unchanged || next.length === 0} onClick={async () => { setBusy(true); await onSave(user, next); setBusy(false); }}>Save roles</Button></>}>
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-text-primary mb-1">Across {orgName ?? "the organization"}</p>
          <p className="text-xs text-text-secondary mb-2">Pick every role that applies; the person gets everything any of them allows.</p>
          <div className="space-y-2">
            {orgRoles.map((r) => (
              <label key={r.role} className="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer hover:bg-surface-subtle">
                <input type="checkbox" className="mt-0.5" checked={picked.includes(r.role)} onChange={(e) => setPicked(e.target.checked ? [...picked, r.role] : picked.filter((x) => x !== r.role))} />
                <span><span className="block text-sm font-medium text-text-primary">{roleLabel(r.role)}</span><span className="block text-xs text-text-secondary mt-0.5">{ROLE_SUMMARY[r.role] ?? ""}</span></span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm font-medium text-text-primary mb-1">On one tenant</p>
          <p className="text-xs text-text-secondary mb-2">A role that only applies inside a tenant.</p>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] items-start gap-x-2 gap-y-2 rounded-md border border-border p-3">
                <Select value={r.role} aria-label="Tenant role" onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))}>{tenantRoles.map((t) => <option key={t.role} value={t.role}>{roleLabel(t.role)}</option>)}</Select>
                <Button variant="ghost" aria-label={`Remove ${roleLabel(r.role)} at ${tenantName(r.tenantId)}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</Button>
                <Select value={r.tenantId} aria-label="Tenant" onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, tenantId: e.target.value } : x)))}>{tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
              </div>
            ))}
          </div>
          {tenants.length === 0 ? <p className="text-xs text-text-tertiary mt-2">This organization has no tenants yet.</p> : <Button variant="secondary" className="mt-2" onClick={addRow}><Plus size={14} /> Add a tenant role</Button>}
        </div>
        {others.length > 0 && <p className="text-xs text-text-tertiary">Also kept as they are: {others.map((a) => `${roleLabel(a.role)} at ${scopeLabel(a)}`).join(", ")}.</p>}
        {next.length === 0 && <p className="text-xs text-status-down">Give the person at least one role, or disable the account instead.</p>}
      </div>
    </Modal>
  );
}
