import { useSyncExternalStore } from "react";
import { sampleTree } from "@/lib/tenants/admin";
import { sampleCustomGrants, sampleCustomRoles, sampleGroups, type Grant, type Group, type OrgRole } from "./roles";

/** Custom roles, groups and grants of custom roles for the sample workspace. A signed-in workspace keeps these on the server, through the organization roles API. */
export type OrgState = { roles: OrgRole[]; groups: Group[]; grants: Grant[] };
let state: OrgState | null = null;
const subs = new Set<() => void>();
const init = (): OrgState => (state ??= { roles: sampleCustomRoles(), groups: sampleGroups(), grants: sampleCustomGrants(sampleTree()) });
export const orgState = () => init();
export const setOrgState = (next: Partial<OrgState>) => { state = { ...init(), ...next }; subs.forEach((f) => f()); };
export const resetOrgState = () => { state = null; subs.forEach((f) => f()); };
export const useOrgState = () => useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, init, init);
