"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { Loading, Notice } from "@/components/mlops/ui";
import { ApiError } from "@/lib/api/client";
import { roleLabel, ROLE_SUMMARY, type RoleInfo } from "@/lib/iam/admin";
import { useIamAdmin } from "@/lib/iam/useIamAdmin";

const SCOPE: Record<string, string> = { platform: "Platform", org: "Organization", tenant: "Tenant" };

/** The role catalogue as the server defines it. Roles are fixed in the service, so this page reads them and offers no way to add or edit one. */
export default function RolesPage() {
  const { admin } = useIamAdmin();
  const [roles, setRoles] = useState<RoleInfo[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { if (admin) admin.roles().then(setRoles).catch((e) => setProblem(e instanceof ApiError ? e.message : "Roles could not be loaded.")); }, [admin]);

  return (
    <>
      <PageHeader title="Role Management" description="The roles a person can hold, where each applies, and what it allows. Roles are fixed by the platform, so there is nothing to create or edit here; give them to people from People and access." />
      {problem && <Notice tone="bad" title="Could not load">{problem}</Notice>}
      {!roles ? (!problem && <Loading />) : (
        <Card>
          <Table>
            <Thead><tr><Th></Th><Th>Role</Th><Th>What it is for</Th><Th>Applies at</Th><Th>Permissions</Th></tr></Thead>
            <tbody>
              {roles.map((r) => {
                const isOpen = open === r.role;
                return [
                  <Tr key={r.role} onClick={() => setOpen(isOpen ? null : r.role)} className="cursor-pointer">
                    <Td className="w-8 text-text-tertiary">{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</Td>
                    <Td><div className="font-medium text-text-primary">{roleLabel(r.role)}</div><div className="font-mono text-xs text-text-tertiary">{r.role}</div></Td>
                    <Td className="text-text-secondary max-w-md">{ROLE_SUMMARY[r.role] ?? ""}</Td>
                    <Td className="text-text-secondary">{r.scopes.map((s) => SCOPE[s] ?? s).join(", ")}</Td>
                    <Td className="tabular-nums">{r.permissions.length}</Td>
                  </Tr>,
                  isOpen && (
                    <tr key={`${r.role}-p`}><td colSpan={5} className="bg-surface-subtle px-6 py-4">
                      <div className="flex flex-wrap gap-1.5">{r.permissions.map((p) => <code key={p} className="rounded border border-border bg-surface px-1.5 py-0.5 text-xs text-text-secondary">{p}</code>)}</div>
                    </td></tr>
                  ),
                ];
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
