"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useIamAdmin } from "@/lib/iam/useIamAdmin";
import type { IamUser } from "@/lib/iam/admin";
import { builtinRoles, grantsOfGroup, peopleGrants, validateDeleteRole, validateGrant, validateGroup, validateRevoke, validateRole, type Ctx, type Grant, type Group, type Issue, type OrgRole, type Tree } from "./roles";
import { setOrgState, useOrgState } from "./store";
import { useOrgDirectory } from "./useOrgDirectory";

export type Outcome = { ok: true } | { ok: false; error: string; issues: Issue[] };
const fail = (issues: Issue[]): Outcome => ({ ok: false, error: issues.find((i) => i.level === "error")?.message ?? "That could not be saved.", issues });
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Roles, groups and grants for the organization, with the actions that change them. Built-in role holders are read from People and access.
 * Custom roles, groups and grants live in the sample store until the organization roles API exists, so `editable` is false when signed in.
 */
export function useOrgAccess() {
  const { admin, orgId, orgName, selfId, sample } = useIamAdmin();
  const { dir, loading: dirLoading, error: dirError } = useOrgDirectory();
  const org = useOrgState();
  const [info, setInfo] = useState<Awaited<ReturnType<NonNullable<typeof admin>["roles"]>> | null>(null);
  const [users, setUsers] = useState<IamUser[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!admin || !orgId) return; let live = true;
    Promise.all([admin.roles(), admin.users({ size: 200 })]).then(([r, u]) => { if (live) { setInfo(r); setUsers(u.content); setProblem(null); } })
      .catch((e) => { if (live) setProblem(e instanceof Error ? e.message : "Roles could not be loaded."); });
    return () => { live = false; };
  }, [admin, orgId, dir.people.length]);

  const tree = useMemo<Tree>(() => ({ tenants: dir.tenants, departments: dir.departments, projects: dir.projects.map((p) => ({ id: p.id, departmentId: p.departmentId, name: p.name })) }), [dir]);
  const builtin = useMemo(() => (info ? builtinRoles(info) : []), [info]);
  const roles = useMemo(() => [...builtin, ...(sample ? org.roles : [])], [builtin, org.roles, sample]);
  const groups = sample ? org.groups : [];
  const fromPeople = useMemo(() => (users && orgId ? peopleGrants(users, orgId) : []), [users, orgId]);
  const grants = useMemo(() => [...fromPeople, ...(sample ? org.grants : [])], [fromPeople, org.grants, sample]);
  const ctx: Ctx = useMemo(() => ({ roles, groups, grants, people: dir.people, tree, actorId: selfId ?? "" }), [roles, groups, grants, dir.people, tree, selfId]);
  const ready = !!info && !!users && !dirLoading;

  const saveRole = useCallback((r: OrgRole): Outcome => {
    const issues = validateRole(r, roles); if (issues.some((i) => i.level === "error")) return fail(issues);
    const now = new Date().toISOString(); const exists = org.roles.some((x) => x.id === r.id);
    setOrgState({ roles: exists ? org.roles.map((x) => (x.id === r.id ? { ...r, createdAt: x.createdAt, createdBy: x.createdBy } : x)) : [...org.roles, { ...r, builtin: false, createdAt: now, createdBy: "You" }] });
    return { ok: true };
  }, [roles, org.roles]);
  const deleteRole = useCallback((id: string): Outcome => {
    const issues = validateDeleteRole(id, ctx); if (issues.length) return fail(issues);
    setOrgState({ roles: org.roles.filter((r) => r.id !== id) }); return { ok: true };
  }, [ctx, org.roles]);
  const saveGroup = useCallback((g: Group): Outcome => {
    const issues = validateGroup(g, { groups, people: dir.people }); if (issues.some((i) => i.level === "error")) return fail(issues);
    setOrgState({ groups: org.groups.some((x) => x.id === g.id) ? org.groups.map((x) => (x.id === g.id ? g : x)) : [...org.groups, g] }); return { ok: true };
  }, [groups, dir.people, org.groups]);
  const deleteGroup = useCallback((id: string): Outcome => {
    const n = grantsOfGroup(id, grants).length;
    if (n) return fail([{ level: "error", message: `${n} ${n === 1 ? "grant gives" : "grants give"} this group a role. Remove ${n === 1 ? "it" : "them"} first, so nobody loses access without you meaning it.` }]);
    setOrgState({ groups: org.groups.filter((g) => g.id !== id) }); return { ok: true };
  }, [grants, org.groups]);
  const grant = useCallback((g: Pick<Grant, "subject" | "roleId" | "scope">): Outcome => {
    const issues = validateGrant(g, ctx); if (issues.some((i) => i.level === "error")) return fail(issues);
    setOrgState({ grants: [...org.grants, { ...g, id: uid("cg"), createdAt: new Date().toISOString(), createdBy: dir.people.find((p) => p.id === selfId)?.name ?? "You", source: "custom" }] }); return { ok: true };
  }, [ctx, org.grants, dir.people, selfId]);
  const revoke = useCallback((id: string): Outcome => {
    const issues = validateRevoke(id, ctx); if (issues.length) return fail(issues);
    setOrgState({ grants: org.grants.filter((g) => g.id !== id) }); return { ok: true };
  }, [ctx, org.grants]);

  return { ctx, dir, orgId, orgName: orgName ?? dir.orgName ?? "The organization", ready, problem: problem ?? dirError, editable: sample, builtin, custom: sample ? org.roles : [], saveRole, deleteRole, saveGroup, deleteGroup, grant, revoke };
}
