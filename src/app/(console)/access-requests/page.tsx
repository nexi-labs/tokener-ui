"use client";

import { useCallback, useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { EmptyState } from "@/components/ui/EmptyState";
import { Confirm, Loading, Modal, Notice, Tabs, Toaster, relTime } from "@/components/mlops/ui";
import { toast } from "@/lib/mlops/toast";
import { ApiError, type Paged } from "@/lib/api/client";
import { roleLabel, ROLE_SUMMARY, type AccessRequest, type AccessRequestStatus, type IamAdmin, type OrgSummary, type RoleInfo } from "@/lib/iam/admin";
import { useIamAdmin } from "@/lib/iam/useIamAdmin";

type Tab = "pending" | "approved" | "rejected";
const msg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

export default function AccessRequestsPage() {
  const { admin, isPlatform, sample } = useIamAdmin();
  const [tab, setTab] = useState<Tab>("pending");
  const [data, setData] = useState<Paged<AccessRequest> | null>(null);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [approving, setApproving] = useState<AccessRequest | null>(null);
  const [rejecting, setRejecting] = useState<AccessRequest | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => { if (admin) admin.roles().then((r) => setRoles(r.filter((x) => x.scopes.includes("org")))).catch(() => undefined); }, [admin]);
  useEffect(() => {
    if (!admin || !isPlatform) return;
    let live = true;
    setProblem(null);
    admin.accessRequests(tab.toUpperCase() as AccessRequestStatus)
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setProblem(msg(e, "Requests could not be loaded.")); });
    return () => { live = false; };
  }, [admin, isPlatform, tab, tick]);

  if (!admin) return <Loading />;
  if (!isPlatform) return (
    <>
      <PageHeader title="Access requests" description="People who asked for access to the platform." />
      <Notice tone="info" title="Platform operators only">Access requests are reviewed by the people who run the platform. To add someone to your own organization, invite them from People and access.</Notice>
    </>
  );

  return (
    <>
      <PageHeader title="Access requests" description="People who asked for access from the request page. Approving one invites them to an organization with the role you choose; rejecting one sends nothing." />
      <Toaster />
      {sample && <Notice tone="info" title="Sample requests">These are sample records. Nothing here is sent to anyone.</Notice>}
      {problem && <div className="mb-4"><Notice tone="bad" title="Could not load">{problem}</Notice></div>}
      <div className="mb-4"><Tabs label="Request status" value={tab} onChange={(t) => { setData(null); setTab(t); }} tabs={[{ id: "pending", label: "Pending" }, { id: "approved", label: "Approved" }, { id: "rejected", label: "Rejected" }]} /></div>

      {!data ? <Loading /> : data.content.length === 0 ? (
        <Card><EmptyState icon={Inbox} title={tab === "pending" ? "Nothing waiting" : `No ${tab} requests`} description={tab === "pending" ? "New requests appear here as people send them." : "Decisions you make appear here."} /></Card>
      ) : (
        <div className="space-y-3">
          {data.content.map((r) => (
            <Card key={r.id}>
              <div className="p-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-text-primary">{r.fullName}</h3>
                    <span className="text-sm text-text-secondary">{r.organization && r.organization !== "-" ? r.organization : "No organization given"}</span>
                    {r.status !== "PENDING" && <Badge tone={r.status === "APPROVED" ? "healthy" : "neutral"}>{r.status === "APPROVED" ? "Approved" : "Rejected"}</Badge>}
                  </div>
                  <div className="text-xs text-text-tertiary mt-0.5">{r.email} · asked {relTime(r.createdAt)}{r.decidedAt ? ` · decided ${relTime(r.decidedAt)}${r.decidedBy ? ` by ${r.decidedBy}` : ""}` : ""}</div>
                  <p className="mt-3 text-sm text-text-secondary max-w-3xl whitespace-pre-wrap">{r.reason}</p>
                </div>
                {r.status === "PENDING" && (
                  <div className="flex gap-2 shrink-0">
                    <Button variant="secondary" onClick={() => setRejecting(r)}>Reject</Button>
                    <Button variant="primary" onClick={() => setApproving(r)}>Approve</Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <ApproveModal request={approving} onClose={() => setApproving(null)} roles={roles} admin={admin}
        onApprove={async (r, assignments) => { try { await admin.approve(r.id, assignments); toast(`Invitation sent to ${r.email}`); setApproving(null); reload(); } catch (e) { toast(msg(e, "The request was not approved."), "error"); } }} />
      <Confirm open={!!rejecting} onClose={() => setRejecting(null)} danger confirmLabel="Reject request" title={`Reject ${rejecting?.fullName ?? ""}?`}
        body={<p>Nothing is sent to {rejecting?.email}. The request moves to Rejected and stays there for the record.</p>}
        onConfirm={async () => { const r = rejecting!; setRejecting(null); try { await admin.reject(r.id); toast("Request rejected"); reload(); } catch (e) { toast(msg(e, "The request was not rejected."), "error"); } }} />
    </>
  );
}

function ApproveModal({ request, onClose, roles, admin, onApprove }: {
  request: AccessRequest | null; onClose: () => void; roles: RoleInfo[]; admin: IamAdmin;
  onApprove: (r: AccessRequest, a: { role: string; scope: { type: string; id: string } }[]) => Promise<void>;
}) {
  const [term, setTerm] = useState(""), [orgs, setOrgs] = useState<OrgSummary[] | null>(null), [org, setOrg] = useState<OrgSummary | null>(null);
  const [role, setRole] = useState("org_admin"), [busy, setBusy] = useState(false), [problem, setProblem] = useState<string | null>(null);
  useEffect(() => { if (request) { setTerm(""); setOrg(null); setRole("org_admin"); setBusy(false); } }, [request]);
  useEffect(() => {
    if (!request) return;
    let live = true;
    const t = setTimeout(() => {
      admin.organizations(term).then((p) => { if (live) { setOrgs(p.content); setProblem(null); } }).catch((e) => { if (live) setProblem(msg(e, "Organizations could not be loaded.")); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [admin, request, term]);
  if (!request) return null;
  return (
    <Modal open onClose={onClose} title={`Approve ${request.fullName}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!org || !role || busy} onClick={async () => { setBusy(true); await onApprove(request, [{ role, scope: { type: "org", id: org!.id } }]); setBusy(false); }}>Approve and invite</Button></>}>
      <div className="space-y-4">
        <p className="text-text-secondary">{request.email} gets an email with a link to set a password.{request.organization && request.organization !== "-" ? ` They gave ${request.organization} as their organization.` : ""}</p>
        <Field label="Organization they join" hint="The organization must exist already.">
          <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search organizations by name" aria-label="Search organizations" />
        </Field>
        {problem && <p className="text-xs text-status-down">{problem}</p>}
        <div role="radiogroup" aria-label="Organization" className="max-h-48 overflow-y-auto rounded-md border border-border divide-y divide-border">
          {!orgs ? <div className="p-3 text-xs text-text-tertiary">Loading</div> : orgs.length === 0 ? <div className="p-3 text-xs text-text-tertiary">No organization matches.</div> : orgs.map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={org?.id === o.id} onClick={() => setOrg(o)}
              className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-surface-subtle ${org?.id === o.id ? "bg-surface-subtle" : ""}`}>
              <span className="text-text-primary">{o.name}</span><span className="text-xs text-text-tertiary">{o.contractTier}</span>
            </button>
          ))}
        </div>
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">{roles.map((r) => <option key={r.role} value={r.role}>{roleLabel(r.role)}</option>)}</Select>
          {ROLE_SUMMARY[role] && <p className="mt-2 text-xs text-text-secondary">{ROLE_SUMMARY[role]}</p>}
        </Field>
      </div>
    </Modal>
  );
}
