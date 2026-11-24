"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Form";
import { GuardButton, Notice, useRole } from "@/components/mlops/ui";
import { toast } from "@/lib/mlops/toast";
import { useOrgDirectory } from "@/lib/org/useOrgDirectory";
import { APPS, TENANTS } from "@/lib/functions/catalog";
import { createWorkflow } from "@/lib/functions/store";
import { TRIGGER_LABEL } from "@/components/functions/ui";
import type { TriggerKind } from "@/lib/functions/types";

export default function NewWorkflow() {
  const router = useRouter(); const role = useRole();
  const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [tenantId, setTenantId] = useState(TENANTS[0].id); const [appId, setAppId] = useState(APPS[0].id); const [kind, setKind] = useState<TriggerKind>("http"); const [err, setErr] = useState<string | null>(null);
  const { dir } = useOrgDirectory();
  const apps = APPS.filter((a) => a.tenantId === tenantId);
  const submit = () => {
    if (!description.trim()) return setErr("Add a description so others know what the workflow is for.");
    const r = createWorkflow({ name, description, tenantId, appId, owner: "you", kind });
    if (!r.ok) return setErr(r.error);
    toast("Workflow created as a draft.", "info"); router.push(`/mlops/functions/workflows/${r.id}?tab=editor`);
  };
  return (
    <div className="max-w-2xl space-y-5">
      <div><h1 className="text-xl font-semibold tracking-tight">New workflow</h1><p className="text-sm text-text-secondary mt-1">You start with a trigger and an output, then add functions, AI calls, conditions, policy checks and approvals in the editor.</p></div>
      <Card>
        <CardHeader title="Basics" />
        <div className="px-5 py-4 grid sm:grid-cols-2 gap-4">
          <Field label="Name" hint="Lowercase letters, digits and hyphens."><Input value={name} onChange={(e) => setName(e.target.value.toLowerCase())} className="font-code" placeholder="payment-risk" /></Field>
          <Field label="Starts from"><Select value={kind} onChange={(e) => setKind(e.target.value as TriggerKind)}>{(Object.keys(TRIGGER_LABEL) as TriggerKind[]).map((k) => <option key={k} value={k}>{TRIGGER_LABEL[k]}</option>)}</Select></Field>
          <div className="sm:col-span-2"><Field label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field></div>
          <Field label="Tenant"><Select value={tenantId} onChange={(e) => { setTenantId(e.target.value); setAppId(APPS.find((a) => a.tenantId === e.target.value)?.id ?? ""); }}>{(dir.tenants.length ? dir.tenants : TENANTS).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          <Field label="App" hint={apps.length ? "Cost is attributed here." : "No app is registered under this tenant yet."}><Select value={appId} disabled={apps.length === 0} onChange={(e) => setAppId(e.target.value)}>{apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
        </div>
        {err && <div className="px-5 pb-4"><Notice tone="bad">{err}</Notice></div>}
        <div className="px-5 py-3 border-t border-border bg-surface-subtle flex justify-between rounded-b-lg"><Link href="/mlops/functions/workflows" className="text-sm text-text-secondary self-center hover:underline">Cancel</Link><GuardButton action="pipeline.edit" role={role} variant="primary" onClick={submit}>Create draft</GuardButton></div>
      </Card>
    </div>
  );
}
