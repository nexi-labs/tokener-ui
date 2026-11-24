"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import { Check as Tick, KeyRound, Pencil, Plus, ShieldCheck, Trash2, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { EmptyState } from "@/components/ui/EmptyState";
import { Confirm, Kpi, Loading, Modal, Notice, Tabs, Toaster } from "@/components/mlops/ui";
import { toast } from "@/lib/mlops/toast";
import { useOrgAccess, type Outcome } from "@/lib/org/useOrgAccess";
import { ACTION_LABEL, RESOURCES, SENSITIVE, actionsOf, can, effectiveAccess, permissionLabel, scopeKindLabel, scopeName, validateGrant, validateGroup, validateRole, type Group, type OrgRole, type ScopeKind, type ScopeRef } from "@/lib/org/roles";
import { departmentsOf, projectsOf } from "@/lib/org/directory";

type Tab = "roles" | "groups" | "assignments" | "check";
const KINDS: ScopeKind[] = ["org", "tenant", "department", "project"];
const note = (o: Outcome, ok: string) => (o.ok ? (toast(ok, "success"), true) : (toast(o.error, "error"), false));

export default function OrgRolesPage() {
  const a = useOrgAccess();
  const [tab, setTab] = useState<Tab>("roles");
  if (!a.orgId && !a.ready) return (<><PageHeader title="Roles and permissions" description="Who can do what, and where, inside your organization." /><Notice tone="info" title="No organization selected">This account is not part of an organization, so there are no roles to manage here.</Notice></>);
  if (!a.ready) return <>{a.problem ? <Notice tone="bad" title="Could not load">{a.problem}</Notice> : <Loading />}</>;
  const { ctx } = a;
  return (
    <>
      <PageHeader title="Roles and permissions" description={`Who can do what, and where, inside ${a.orgName}. Roles are built from the permissions the platform defines, and a grant gives a role to a person or a group over the whole organization, one tenant, one department or one project.`} />
      {!a.editable && <div className="mb-4"><Notice tone="info" title="Built-in roles only">Custom roles, groups and grants are saved through the organization roles API, which is not available for this workspace yet. The built-in roles and their holders below are live and are changed in People and access.</Notice></div>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Kpi label="Roles" value={ctx.roles.length} sub={`${a.builtin.length} built in, ${a.custom.length} of your own`} />
        <Kpi label="Groups" value={ctx.groups.length} sub={`${ctx.groups.reduce((n, g) => n + g.members.length, 0)} memberships`} />
        <Kpi label="Grants" value={ctx.grants.length} sub={`${ctx.grants.filter((g) => g.source === "custom").length} made here`} />
        <Kpi label="People" value={ctx.people.filter((p) => !p.disabled).length} sub="Active in this organization" />
      </div>
      <Tabs<Tab> label="Roles and permissions sections" value={tab} onChange={setTab} tabs={[{ id: "roles", label: "Roles", count: ctx.roles.length }, { id: "groups", label: "Groups", count: ctx.groups.length }, { id: "assignments", label: "Assignments", count: ctx.grants.length }, { id: "check", label: "Check access" }]} />
      <div className="pt-5">
        {tab === "roles" && <Roles a={a} />}
        {tab === "groups" && <Groups a={a} />}
        {tab === "assignments" && <Assignments a={a} />}
        {tab === "check" && <AccessCheck a={a} />}
      </div>
      <Toaster />
    </>
  );
}

type A = ReturnType<typeof useOrgAccess>;

// ---------------------------------------------------------------------------------------------------------------------------------- Roles
function Roles({ a }: { a: A }) {
  const [sel, setSel] = useState(a.ctx.roles[0]?.id ?? "");
  const [edit, setEdit] = useState<OrgRole | null>(null); const [del, setDel] = useState<OrgRole | null>(null);
  const role = a.ctx.roles.find((r) => r.id === sel) ?? a.ctx.roles[0];
  const holders = (id: string) => a.ctx.grants.filter((g) => g.roleId === id).length;
  const blank = (): OrgRole => ({ id: `role-${Math.random().toString(36).slice(2, 7)}`, name: "", description: "", permissions: [], scopes: ["org", "tenant", "department", "project"], builtin: false });
  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-5 items-start">
      <Card>
        <CardHeader title="Roles" action={a.editable ? <Button variant="secondary" onClick={() => setEdit(blank())}><Plus size={14} /> New role</Button> : undefined} />
        <ul className="divide-y divide-border">
          {a.ctx.roles.map((r) => (
            <li key={r.id}><button onClick={() => setSel(r.id)} aria-current={role?.id === r.id} className={clsx("w-full text-left px-5 py-3 hover:bg-surface-subtle", role?.id === r.id && "bg-surface-subtle")}>
              <div className="flex items-center gap-2"><span className="text-sm font-medium">{r.name}</span>{r.builtin ? <Badge>Built in</Badge> : <Badge tone="info">Yours</Badge>}</div>
              <div className="text-xs text-text-tertiary mt-0.5">{r.permissions.length} permissions, {holders(r.id)} {holders(r.id) === 1 ? "grant" : "grants"}</div>
            </button></li>
          ))}
        </ul>
      </Card>
      {role && (
        <Card>
          <CardHeader title={role.name} subtitle={role.description} action={!role.builtin && a.editable ? <div className="flex gap-2"><Button variant="secondary" onClick={() => setEdit({ ...role })}><Pencil size={14} /> Edit</Button><Button variant="secondary" onClick={() => setDel(role)}><Trash2 size={14} /> Delete</Button></div> : undefined} />
          <CardBody className="space-y-5">
            <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm"><div><span className="text-text-tertiary">Can be granted at </span>{role.scopes.map((s) => scopeKindLabel[s].toLowerCase()).join(", ")}</div>{role.createdBy && <div><span className="text-text-tertiary">Made by </span>{role.createdBy}</div>}</div>
            <PermissionGrid value={role.permissions} />
            {role.builtin && <p className="text-xs text-text-tertiary">Built-in roles come from the platform and cannot be changed. To get something different, make a role of your own from the permissions you need.</p>}
          </CardBody>
        </Card>
      )}
      {edit && <RoleEditor a={a} initial={edit} onClose={() => setEdit(null)} onSaved={(id) => { setSel(id); setEdit(null); }} />}
      <Confirm open={!!del} onClose={() => setDel(null)} danger title={`Delete ${del?.name}?`} body="Nobody holds this role. Deleting it cannot be undone." confirmLabel="Delete role" onConfirm={() => { if (del) { const o = a.deleteRole(del.id); if (note(o, "Role deleted")) setSel(a.ctx.roles[0]?.id ?? ""); setDel(null); } }} />
    </div>
  );
}

/** Permissions grouped by what they apply to, shown as a grid of resource rows and action columns. */
function PermissionGrid({ value, onToggle }: { value: string[]; onToggle?: (p: string) => void }) {
  const groups = [...new Set(RESOURCES.map((r) => r.group))];
  const cols = ["read", "write", "export", "decide"];
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g}>
          <div className="text-[11px] uppercase tracking-wide text-text-tertiary mb-1">{g}</div>
          <div className="rounded-md border border-border divide-y divide-border">
            {RESOURCES.filter((r) => r.group === g).map((r) => (
              <div key={r.id} className="grid grid-cols-[1fr_repeat(4,72px)] items-center px-3 py-2 text-sm">
                <div><div>{r.label}</div>{r.note && <div className="text-xs text-text-tertiary">{r.note}</div>}</div>
                {cols.map((c) => {
                  const p = `${r.id}:${c}`; const has = actionsOf(r.id).includes(c); const on = value.includes(p);
                  return <div key={c} className="text-center">{has ? (onToggle
                    ? <button type="button" role="checkbox" aria-checked={on} aria-label={permissionLabel(p)} onClick={() => onToggle(p)} className={clsx("h-6 w-6 rounded border grid place-items-center mx-auto", on ? "bg-[#07191E] border-[#07191E] text-white" : "border-border-strong hover:bg-surface-muted")}>{on && <Tick size={14} />}</button>
                    : <span aria-label={`${permissionLabel(p)}: ${on ? "yes" : "no"}`} className={clsx("inline-grid h-6 w-6 place-items-center rounded", on ? "text-[#07191E]" : "text-text-tertiary/50")}>{on ? <Tick size={16} /> : <span aria-hidden>·</span>}</span>) : <span className="text-text-tertiary/30" aria-hidden>-</span>}</div>;
                })}
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="grid grid-cols-[1fr_repeat(4,72px)] px-3 text-[11px] text-text-tertiary -mt-1"><span /> {cols.map((c) => <span key={c} className="text-center">{ACTION_LABEL[c]}</span>)}</div>
    </div>
  );
}

function RoleEditor({ a, initial, onClose, onSaved }: { a: A; initial: OrgRole; onClose: () => void; onSaved: (id: string) => void }) {
  const [r, setR] = useState(initial); const isNew = !a.custom.some((x) => x.id === initial.id);
  const issues = useMemo(() => validateRole(r, a.ctx.roles), [r, a.ctx.roles]);
  const errors = issues.filter((i) => i.level === "error"); const warns = issues.filter((i) => i.level === "warning");
  const toggle = (p: string) => setR((x) => {
    const on = x.permissions.includes(p); const [res, act] = p.split(":");
    let next = on ? x.permissions.filter((y) => y !== p) : [...x.permissions, p];
    if (!on && act === "write" && actionsOf(res).includes("read") && !next.includes(`${res}:read`)) next = [...next, `${res}:read`];
    if (on && act === "read") next = next.filter((y) => y !== `${res}:write`);
    return { ...x, permissions: next };
  });
  return (
    <Modal open wide onClose={onClose} title={isNew ? "New role" : `Edit ${initial.name}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={errors.length > 0} onClick={() => { const o = a.saveRole(r); if (note(o, isNew ? "Role created" : "Role saved")) onSaved(r.id); }}>{isNew ? "Create role" : "Save role"}</Button></>}>
      <div className="space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Name"><Input autoFocus value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} placeholder="Claims adjuster" /></Field>
          <Field label="What it is for"><Input value={r.description} onChange={(e) => setR({ ...r, description: e.target.value })} placeholder="Decides the claims that agents prepare" /></Field>
        </div>
        <div><div className="text-[13px] font-medium mb-1.5">Where it can be granted</div><div className="flex flex-wrap gap-2">{KINDS.map((k) => { const on = r.scopes.includes(k); return <button key={k} type="button" aria-pressed={on} onClick={() => setR({ ...r, scopes: on ? r.scopes.filter((s) => s !== k) : [...r.scopes, k] })} className={clsx("h-8 rounded-full border px-3 text-[13px]", on ? "bg-[#07191E] border-[#07191E] text-white" : "border-border-strong hover:bg-surface-muted")}>{scopeKindLabel[k]}</button>; })}</div></div>
        <div><div className="text-[13px] font-medium mb-1.5">Permissions <span className="text-text-tertiary font-normal">({r.permissions.length} chosen)</span></div><PermissionGrid value={r.permissions} onToggle={toggle} /></div>
        {(errors.length > 0 || warns.length > 0) && <div className="space-y-2">{errors.map((i, n) => <Notice key={`e${n}`} tone="bad">{i.message}</Notice>)}{warns.map((i, n) => <Notice key={`w${n}`} tone="warn">{i.message}</Notice>)}</div>}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------- Groups
function Groups({ a }: { a: A }) {
  const [edit, setEdit] = useState<Group | null>(null); const [del, setDel] = useState<Group | null>(null);
  const person = (id: string) => a.ctx.people.find((p) => p.id === id);
  const rolesOf = (g: Group) => a.ctx.grants.filter((x) => x.subject.kind === "group" && x.subject.id === g.id);
  if (a.ctx.groups.length === 0) return <EmptyState icon={UsersRound} title="No groups yet" description="A group is a set of people you give a role to once. Approvals, owners and escalations can name a group too." action={a.editable ? <Button variant="primary" onClick={() => setEdit({ id: `g-${Math.random().toString(36).slice(2, 7)}`, name: "", description: "", members: [] })}>New group</Button> : undefined} />;
  return (
    <>
      <div className="flex justify-between items-center mb-3"><p className="text-sm text-text-secondary max-w-xl">Groups are where owners, approvers and escalations come from, so an agent never depends on one person.</p>{a.editable && <Button variant="secondary" onClick={() => setEdit({ id: `g-${Math.random().toString(36).slice(2, 7)}`, name: "", description: "", members: [] })}><Plus size={14} /> New group</Button>}</div>
      <div className="grid md:grid-cols-2 gap-4">
        {a.ctx.groups.map((g) => (
          <Card key={g.id}><CardHeader title={g.name} subtitle={g.description} action={a.editable ? <div className="flex gap-2"><Button variant="secondary" aria-label={`Edit ${g.name}`} onClick={() => setEdit({ ...g })}><Pencil size={14} /></Button><Button variant="secondary" aria-label={`Delete ${g.name}`} onClick={() => setDel(g)}><Trash2 size={14} /></Button></div> : undefined} />
            <CardBody className="space-y-3">
              <div><div className="text-xs text-text-tertiary mb-1">Members</div>{g.members.length === 0 ? <span className="text-sm text-text-secondary">Nobody yet</span> : <div className="flex flex-wrap gap-1.5">{g.members.map((m) => <span key={m} className="rounded-full border border-border px-2.5 py-0.5 text-[13px]">{person(m)?.name ?? m}</span>)}</div>}</div>
              <div><div className="text-xs text-text-tertiary mb-1">Holds</div>{rolesOf(g).length === 0 ? <span className="text-sm text-text-secondary">No role</span> : <ul className="text-sm space-y-0.5">{rolesOf(g).map((x) => <li key={x.id}>{a.ctx.roles.find((r) => r.id === x.roleId)?.name}<span className="text-text-tertiary">, {scopeName(x.scope, a.ctx.tree, a.orgName)}</span></li>)}</ul>}</div>
            </CardBody></Card>
        ))}
      </div>
      {edit && <GroupEditor a={a} initial={edit} onClose={() => setEdit(null)} />}
      <Confirm open={!!del} onClose={() => setDel(null)} danger title={`Delete ${del?.name}?`} body="People in the group keep their own roles. Anything that names the group as an owner or approver will need a new one." confirmLabel="Delete group" onConfirm={() => { if (del) { note(a.deleteGroup(del.id), "Group deleted"); setDel(null); } }} />
    </>
  );
}

function GroupEditor({ a, initial, onClose }: { a: A; initial: Group; onClose: () => void }) {
  const [g, setG] = useState(initial); const isNew = !a.ctx.groups.some((x) => x.id === initial.id);
  const issues = validateGroup(g, { groups: a.ctx.groups, people: a.ctx.people }); const errors = issues.filter((i) => i.level === "error");
  const active = a.ctx.people.filter((p) => !p.disabled);
  return (
    <Modal open onClose={onClose} title={isNew ? "New group" : `Edit ${initial.name}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={errors.length > 0} onClick={() => { if (note(a.saveGroup(g), isNew ? "Group created" : "Group saved")) onClose(); }}>{isNew ? "Create group" : "Save group"}</Button></>}>
      <div className="space-y-4">
        <Field label="Name"><Input autoFocus value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} placeholder="Claims adjusters" /></Field>
        <Field label="What it is for"><Input value={g.description} onChange={(e) => setG({ ...g, description: e.target.value })} /></Field>
        <div><div className="text-[13px] font-medium mb-1.5">Members</div>
          <div className="max-h-56 overflow-auto rounded-md border border-border divide-y divide-border">{active.map((p) => { const on = g.members.includes(p.id); return <label key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-surface-subtle"><input type="checkbox" checked={on} onChange={() => setG({ ...g, members: on ? g.members.filter((m) => m !== p.id) : [...g.members, p.id] })} /><span className="flex-1">{p.name}</span><span className="text-xs text-text-tertiary">{p.email}</span></label>; })}</div></div>
        {issues.map((i, n) => <Notice key={n} tone={i.level === "error" ? "bad" : "warn"}>{i.message}</Notice>)}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------- Assignments
/** A scope picker whose levels come from Tenant Management: pick the level, then the tenant, department or project. */
function ScopePicker({ a, value, onChange, kinds }: { a: A; value: ScopeRef; onChange: (s: ScopeRef) => void; kinds: ScopeKind[] }) {
  const { dir } = a; const [tenant, setTenant] = useState(""); const [dept, setDept] = useState("");
  const kind = value.type;
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <Field label="Applies to"><Select aria-label="Applies to" value={kind} onChange={(e) => onChange({ type: e.target.value as ScopeKind })}>{kinds.map((k) => <option key={k} value={k}>{k === "org" ? `The whole organization` : `One ${scopeKindLabel[k].toLowerCase()}`}</option>)}</Select></Field>
      {kind === "tenant" && <Field label="Tenant"><Select aria-label="Tenant" value={value.id ?? ""} onChange={(e) => onChange({ type: "tenant", id: e.target.value || undefined })}><option value="">Choose a tenant</option>{dir.tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>}
      {(kind === "department" || kind === "project") && <Field label="Tenant"><Select aria-label="Tenant" value={tenant} onChange={(e) => { setTenant(e.target.value); setDept(""); onChange({ type: kind }); }}><option value="">Choose a tenant</option>{dir.tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>}
      {kind === "department" && <Field label="Department"><Select aria-label="Department" disabled={!tenant} value={value.id ?? ""} onChange={(e) => onChange({ type: "department", id: e.target.value || undefined })}><option value="">{tenant ? "Choose a department" : "Choose a tenant first"}</option>{departmentsOf(dir, tenant).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>}
      {kind === "project" && <>
        <Field label="Department"><Select aria-label="Department" disabled={!tenant} value={dept} onChange={(e) => { setDept(e.target.value); onChange({ type: "project" }); }}><option value="">{tenant ? "Choose a department" : "Choose a tenant first"}</option>{departmentsOf(dir, tenant).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
        <Field label="Project"><Select aria-label="Project" disabled={!dept} value={value.id ?? ""} onChange={(e) => onChange({ type: "project", id: e.target.value || undefined })}><option value="">{dept ? "Choose a project" : "Choose a department first"}</option>{projectsOf(dir, dept).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field></>}
    </div>
  );
}

function Assignments({ a }: { a: A }) {
  const [add, setAdd] = useState(false); const [del, setDel] = useState<string | null>(null); const [filter, setFilter] = useState<"all" | "people" | "custom">("all");
  const who = (g: A["ctx"]["grants"][number]) => g.subject.kind === "user" ? { name: a.ctx.people.find((p) => p.id === g.subject.id)?.name ?? g.subject.id, kind: "Person" } : { name: a.ctx.groups.find((x) => x.id === g.subject.id)?.name ?? g.subject.id, kind: "Group" };
  const rows = a.ctx.grants.filter((g) => filter === "all" || g.source === filter);
  return (
    <>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-3">
        <div className="flex gap-2">{(["all", "people", "custom"] as const).map((f) => <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)} className={clsx("h-8 rounded-full border px-3 text-[13px]", filter === f ? "bg-[#07191E] border-[#07191E] text-white" : "border-border-strong hover:bg-surface-muted")}>{f === "all" ? "All" : f === "people" ? "Built-in roles" : "Made here"}</button>)}</div>
        {a.editable && <Button variant="primary" onClick={() => setAdd(true)}><Plus size={14} /> Give a role</Button>}
      </div>
      <Card>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-text-tertiary border-b border-border"><th className="px-5 py-2.5 font-medium">Who</th><th className="px-3 py-2.5 font-medium">Role</th><th className="px-3 py-2.5 font-medium">Over</th><th className="px-3 py-2.5 font-medium">Set in</th><th className="px-5 py-2.5" /></tr></thead>
          <tbody className="divide-y divide-border">
            {rows.map((g) => { const w = who(g); const r = a.ctx.roles.find((x) => x.id === g.roleId); return (
              <tr key={g.id}><td className="px-5 py-3"><div className="font-medium">{w.name}</div><div className="text-xs text-text-tertiary">{w.kind}</div></td>
                <td className="px-3 py-3">{r?.name ?? g.roleId}</td><td className="px-3 py-3 text-text-secondary">{scopeName(g.scope, a.ctx.tree, a.orgName)}<div className="text-xs text-text-tertiary">{scopeKindLabel[g.scope.type]}</div></td>
                <td className="px-3 py-3 text-text-secondary">{g.source === "people" ? "People and access" : "Here"}</td>
                <td className="px-5 py-3 text-right">{g.source === "custom" && a.editable ? <Button variant="secondary" aria-label="Remove this grant" onClick={() => setDel(g.id)}><Trash2 size={14} /></Button> : <span className="text-xs text-text-tertiary">Read only</span>}</td></tr>
            ); })}
            {rows.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-text-secondary">Nothing to show.</td></tr>}
          </tbody></table></div>
      </Card>
      <p className="text-xs text-text-tertiary mt-3 max-w-2xl">Built-in roles are given and removed in People and access, so nobody is granted twice. You can only give a role that you hold yourself at that place, and an organization always keeps at least one organization admin.</p>
      {add && <GrantModal a={a} onClose={() => setAdd(false)} />}
      <Confirm open={!!del} onClose={() => setDel(null)} danger title="Remove this grant?" body="The person or group loses what this role gave them at that place. Anything they hold through another role stays." confirmLabel="Remove" onConfirm={() => { if (del) { note(a.revoke(del), "Grant removed"); setDel(null); } }} />
    </>
  );
}

function GrantModal({ a, onClose }: { a: A; onClose: () => void }) {
  const custom = a.ctx.roles; const [kind, setKind] = useState<"user" | "group">("group"); const [subject, setSubject] = useState(""); const [roleId, setRoleId] = useState(a.custom[0]?.id ?? custom[0]?.id ?? "");
  const role = custom.find((r) => r.id === roleId); const [scope, setScope] = useState<ScopeRef>({ type: role?.scopes.includes("department") ? "department" : role?.scopes[0] ?? "org" });
  const draft = { subject: { kind, id: subject }, roleId, scope };
  const issues = subject ? validateGrant(draft, a.ctx) : []; const errors = issues.filter((i) => i.level === "error");
  const ready = !!subject && !!roleId && (scope.type === "org" || !!scope.id) && errors.length === 0;
  const people = a.ctx.people.filter((p) => !p.disabled);
  return (
    <Modal open wide onClose={onClose} title="Give a role" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!ready} onClick={() => { if (note(a.grant(draft), "Role given")) onClose(); }}>Give role</Button></>}>
      <div className="space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="To"><Select aria-label="To" value={kind} onChange={(e) => { setKind(e.target.value as "user" | "group"); setSubject(""); }}><option value="group">A group</option><option value="user">A person</option></Select></Field>
          <Field label={kind === "group" ? "Group" : "Person"}><Select aria-label={kind === "group" ? "Group" : "Person"} value={subject} onChange={(e) => setSubject(e.target.value)}><option value="">{kind === "group" ? "Choose a group" : "Choose a person"}</option>{kind === "group" ? a.ctx.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>) : people.map((p) => <option key={p.id} value={p.id}>{p.name}, {p.email}</option>)}</Select></Field>
        </div>
        <Field label="Role" hint={role?.description}><Select aria-label="Role" value={roleId} onChange={(e) => { setRoleId(e.target.value); const r = custom.find((x) => x.id === e.target.value); if (r && !r.scopes.includes(scope.type)) setScope({ type: r.scopes[0] }); }}>
          <optgroup label="Your roles">{custom.filter((r) => !r.builtin).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>
          <optgroup label="Built in">{custom.filter((r) => r.builtin).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup></Select></Field>
        <ScopePicker a={a} value={scope} onChange={setScope} kinds={role?.scopes ?? KINDS} />
        {role && role.permissions.some((p) => SENSITIVE.has(p)) && <Notice tone="warn">{role.name} includes {role.permissions.filter((p) => SENSITIVE.has(p)).map((p) => permissionLabel(p).toLowerCase()).join(", ")}.</Notice>}
        {errors.map((i, n) => <Notice key={n} tone="bad">{i.message}</Notice>)}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------- Check access
function AccessCheck({ a }: { a: A }) {
  const people = a.ctx.people.filter((p) => !p.disabled);
  const [person, setPerson] = useState(people[2]?.id ?? people[0]?.id ?? ""); const [scope, setScope] = useState<ScopeRef>({ type: "org" });
  const [perm, setPerm] = useState("approvals:decide");
  const target = scope.type === "org" || scope.id ? scope : { type: "org" as const };
  const access = useMemo(() => effectiveAccess(person, target, a.ctx.grants, a.ctx.roles, a.ctx.groups, a.ctx.tree), [person, target, a.ctx]);
  const why = access.permissions.get(perm) ?? [];
  const list = [...access.permissions.keys()].sort();
  const allowed = can(access, perm);
  return (
    <div className="grid lg:grid-cols-[1fr_1.1fr] gap-5 items-start">
      <Card><CardHeader title="Ask a question" subtitle="Pick a person, a place and a permission. The answer names the grants behind it." />
        <CardBody className="space-y-4">
          <Field label="Person"><Select aria-label="Person" value={person} onChange={(e) => setPerson(e.target.value)}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <ScopePicker a={a} value={scope} onChange={setScope} kinds={KINDS} />
          <Field label="Permission"><Select aria-label="Permission" value={perm} onChange={(e) => setPerm(e.target.value)}>{RESOURCES.map((r) => <optgroup key={r.id} label={r.label}>{actionsOf(r.id).map((x) => <option key={x} value={`${r.id}:${x}`}>{permissionLabel(`${r.id}:${x}`)}</option>)}</optgroup>)}</Select></Field>
        </CardBody></Card>
      <Card><CardHeader title="Answer" />
        <CardBody className="space-y-4">
          <div className={clsx("flex items-start gap-3 rounded-md border px-4 py-3", allowed ? "border-status-healthy/40 bg-status-healthy/5" : "border-border bg-surface-subtle")}>
            {allowed ? <ShieldCheck size={20} className="text-status-healthy mt-0.5" /> : <KeyRound size={20} className="text-text-tertiary mt-0.5" />}
            <div><div className="font-medium">{allowed ? "Yes" : "No"}, {people.find((p) => p.id === person)?.name} {allowed ? "can" : "cannot"} {permissionLabel(perm).toLowerCase()} at {scopeName(target, a.ctx.tree, a.orgName)}.</div>
              {allowed ? <ul className="mt-1.5 text-sm text-text-secondary space-y-0.5">{why.map((w, i) => <li key={i}>{w.role.name}{w.via ? `, through the group ${w.via.name}` : ", given directly"}, over {scopeName(w.grant.scope, a.ctx.tree, a.orgName)}</li>)}</ul> : <p className="mt-1 text-sm text-text-secondary">No role they hold, directly or through a group, covers this place and includes this permission.</p>}</div>
          </div>
          <div><div className="text-xs text-text-tertiary mb-1.5">Everything they can do here ({list.length})</div>
            {list.length === 0 ? <span className="text-sm text-text-secondary">Nothing.</span> : <div className="flex flex-wrap gap-1.5">{list.map((p) => <span key={p} className={clsx("rounded-full border px-2.5 py-0.5 text-[12.5px]", p === perm ? "border-[#07191E] bg-[#07191E] text-white" : "border-border")}>{permissionLabel(p)}</span>)}</div>}</div>
        </CardBody></Card>
    </div>
  );
}
