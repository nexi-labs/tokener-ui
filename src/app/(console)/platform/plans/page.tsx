"use client";

import { Layers } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Kpi, Loading, Notice } from "@/components/mlops/ui";
import { useIamAdmin } from "@/lib/iam/useIamAdmin";
import type { OrgSummary } from "@/lib/iam/admin";
import { PLANS, isUnlimited, limitText, planById } from "@/lib/mlops/plans";
import { mlops } from "@/lib/mlops/store";
import { toast } from "@/lib/mlops/toast";

/** Where a platform administrator gives an organisation a plan. The server has no read of another organisation's plan, so this page shows what was set from it in this session. */
export default function PlatformPlansPage() {
  const { admin, isPlatform, sample } = useIamAdmin();
  const [orgs, setOrgs] = useState<OrgSummary[] | null>(null);
  const [q, setQ] = useState(""); const [err, setErr] = useState("");
  const [pick, setPick] = useState<Record<string, string>>({});
  const [given, setGiven] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const allowed = isPlatform || sample;
  useEffect(() => {
    if (!admin) return;
    let alive = true;
    const t = setTimeout(() => { admin.organizations(q).then((p) => { if (alive) { setOrgs(p.content); setErr(""); } }).catch((e) => { if (alive) setErr(e instanceof Error ? e.message : "Could not load organizations"); }); }, q ? 250 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [admin, q]);
  const give = async (o: OrgSummary) => {
    const planId = pick[o.id] ?? "free"; setBusy(o.id);
    const r = await mlops.assignPlan(o.id, planId); setBusy("");
    if (r.ok) { setGiven((g) => ({ ...g, [o.id]: r.plan.id })); toast(`${o.name} now has the ${r.plan.name} plan`); } else toast(r.error, "error");
  };
  return (
    <div className="space-y-5">
      <PageHeader title="Plans" description="Give an organization a plan. Every limit is enforced on the server before something is created, so a change here takes effect on the next create." />
      {!allowed && <Notice tone="warn" title="Platform administrators only">Giving a plan needs the platform operator role.</Notice>}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">{PLANS.map((p) => <Kpi key={p.id} label={p.name} value={isUnlimited(p.limits.maxPipelines) ? "No limits" : `${limitText(p.limits.maxPipelines)} pipelines`} sub={isUnlimited(p.limits.maxModels) ? "For installations run by their owner" : `${limitText(p.limits.maxModels)} models, ${limitText(p.limits.maxStorageBytes, "bytes")} storage`} />)}</div>
      {err && <Notice tone="bad" title="Organizations could not be loaded">{err}</Notice>}
      <Card>
        <CardHeader title="Organizations" subtitle="Choose a plan and give it. The new plan is read back from the server." action={<Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an organization" aria-label="Find an organization" className="w-64" />} />
        <CardBody>
          {!orgs ? <Loading /> : orgs.length === 0 ? <EmptyState icon={Layers} title="No organization found" description="Try another name." /> : (
            <Table>
              <Thead><tr><Th>Organization</Th><Th>Contract</Th><Th>Set from here</Th><Th>Plan</Th><Th>{""}</Th></tr></Thead>
              <tbody>
                {orgs.map((o) => (
                  <Tr key={o.id}>
                    <Td className="font-medium">{o.name}<div className="text-xs text-text-tertiary font-mono font-normal">{o.id}</div></Td>
                    <Td className="capitalize text-text-secondary">{o.contractTier}</Td>
                    <Td>{given[o.id] ? <Badge tone="healthy">{planById(given[o.id]).name}</Badge> : <span className="text-xs text-text-tertiary">Not changed in this session</span>}</Td>
                    <Td className="w-48"><Select aria-label={`Plan for ${o.name}`} value={pick[o.id] ?? given[o.id] ?? "free"} disabled={!allowed} onChange={(e) => setPick((x) => ({ ...x, [o.id]: e.target.value }))}>{PLANS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Td>
                    <Td className="text-right"><Button variant="primary" disabled={!allowed || busy === o.id} onClick={() => give(o)}>{busy === o.id ? "Saving" : "Give plan"}</Button></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
