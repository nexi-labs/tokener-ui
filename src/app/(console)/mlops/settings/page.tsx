"use client";

import { useState } from "react";
import { Check, Minus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select, Toggle } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { PlanPanel } from "@/components/mlops/PlanPanel";
import { Confirm, DemoTag, EnvBadge, Loading, Notice, Tabs, fmtDate, useRole } from "@/components/mlops/ui";
import { DEFAULT_GATE, gateOf, type DataQualityGate } from "@/lib/mlops/qualityGate";
import { ALL_ACTIONS, ACTION_LABEL, can } from "@/lib/mlops/rbac";
import { mlops, useMlops, useMlopsStatus } from "@/lib/mlops/store";
import { toast } from "@/lib/mlops/toast";
import { ROLE_LABEL, type RoleId } from "@/lib/mlops/types";

type Tab = "policy" | "plan" | "access" | "audit";
const ROLES: RoleId[] = ["viewer", "developer", "approver", "admin"];
const MANAGERS = { vault: "HashiCorp Vault", "aws-secrets-manager": "AWS Secrets Manager", "gcp-secret-manager": "Google Secret Manager", "azure-key-vault": "Azure Key Vault" } as const;

export default function SettingsPage() {
  const s = useMlops();
  const live = useMlopsStatus().mode === "live";
  const role = useRole();
  const [tab, setTab] = useState<Tab>("policy");
  const [reg, setReg] = useState("");
  const [reset, setReset] = useState(false);
  const [q, setQ] = useState("");
  if (!s) return <Loading />;
  const st = s.settings;
  const editable = can(role, "settings.edit");
  const set = async (patch: Parameters<typeof mlops.updateSettings>[0], msg = "Setting saved") => { const r = await mlops.updateSettings(patch); r.ok ? toast(msg) : toast(r.error, "error"); };
  const gate = gateOf(st);
  const setGate = (patch: Partial<DataQualityGate>, msg = "Data quality gate saved") => set({ dataQualityGate: { ...gate, ...patch } }, msg);
  const num = (v: string) => Math.min(100, Math.max(0, Number(v) || 0));
  const audit = s.audit.filter((e) => !q || `${e.actor} ${e.action} ${e.resource} ${e.detail}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-5">
      <PageHeader title="Settings and access" description="Organisation policy for MLOps, the role matrix and the audit trail. Policy is applied before a run starts." />
      <Tabs value={tab} onChange={setTab} label="Settings sections" tabs={[{ id: "policy", label: "Policy" }, { id: "plan", label: "Plan and limits" }, { id: "access", label: "Roles and access" }, { id: "audit", label: "Audit log", count: s.audit.length }]} />
      {!editable && tab === "policy" && <Notice tone="warn" title="Read only">You are {ROLE_LABEL[role]}. Changing policy requires the admin role. Switch the role in the header to try changes.</Notice>}

      {tab === "policy" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader title="Guardrails" subtitle="Changes are written to the audit log" />
            <CardBody className="divide-y divide-border">
              <fieldset disabled={!editable} className="contents">
                <Toggle checked={st.killSwitch} onChange={(v) => set({ killSwitch: v }, v ? "Kill switch on. Runs are disabled." : "Kill switch off")} label="Kill switch" description="Stops every new run immediately in all environments. Runs in progress finish their current step." />
                <Toggle checked={st.requireProdApproval} onChange={(v) => set({ requireProdApproval: v })} label="Require an approval gate for production changes" description="Pipelines that deploy, roll out or promote in production must contain an approval gate to start." />
                <Toggle checked={st.requireSignedImages} onChange={(v) => set({ requireSignedImages: v })} label="Require signed images" description="Build steps that turn image signing off cannot start." />
                <Toggle checked={st.allowProductionAgents} onChange={(v) => set({ allowProductionAgents: v })} label="Allow build agents in production" description="Off by default. Production agents can reach production registries and need a separate review." />
                <Toggle checked={st.allowPaymentsInProduction} onChange={(v) => set({ allowPaymentsInProduction: v })} label="Allow real payments in production" description="Off by default. Turn on only after each provider has approved your live account and the compliance checklist on its connection is complete." />
              </fieldset>
            </CardBody>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader title="Data quality gate" subtitle="Checked when someone approves a model version" />
              <CardBody className="space-y-4">
                <fieldset disabled={!editable} className="contents">
                  <Toggle checked={gate.enabled} onChange={(v) => setGate({ enabled: v }, v ? "Data quality gate on" : "Data quality gate off")} label="Block approval when training data scores too low" description="Uses the quality score from the Refinery data preparation report. An admin can approve past the gate with a written reason, which is audited." />
                  <Toggle checked={gate.requireTrainingData} onChange={(v) => setGate({ requireTrainingData: v })} label="Require a recorded training dataset" description="Versions that do not say which dataset they were trained on cannot be approved." />
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Minimum quality score" hint={`Out of 100. Default ${DEFAULT_GATE.minQuality}.`}><Input type="number" min={0} max={100} value={gate.minQuality} disabled={!editable || !gate.enabled} onChange={(e) => setGate({ minQuality: num(e.target.value) }, "Threshold saved")} /></Field>
                    <Field label="Minimum sensor quality" hint={`For time series data. Default ${DEFAULT_GATE.minSensorQuality}.`}><Input type="number" min={0} max={100} value={gate.minSensorQuality} disabled={!editable || !gate.enabled} onChange={(e) => setGate({ minSensorQuality: num(e.target.value) }, "Threshold saved")} /></Field>
                  </div>
                </fieldset>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Payment limits" subtitle="Checked before any run that collects a payment" />
              <CardBody className="space-y-4">
                <Field label="Largest single payment" hint="Pipelines asking for more cannot start."><Input type="number" min={0} value={st.maxPaymentAmount} disabled={!editable} onChange={(e) => set({ maxPaymentAmount: Math.max(0, Number(e.target.value) || 0) }, "Limit saved")} /></Field>
                <Field label="Allowed currencies" hint="Comma separated ISO codes. Empty means any."><Input defaultValue={st.allowedPaymentCurrencies.join(", ")} disabled={!editable} onBlur={(e) => set({ allowedPaymentCurrencies: e.target.value.split(",").map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z]{3}$/.test(x)) }, "Currencies saved")} /></Field>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Allowed registries" subtitle="Image repositories must start with one of these" />
              <CardBody className="space-y-3">
                <ul className="flex flex-wrap gap-1.5">
                  {st.allowedRegistries.map((r) => (
                    <li key={r} className="inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1 rounded-full border border-border-strong text-xs font-code">{r}
                      <button disabled={!editable} aria-label={`Remove ${r}`} onClick={() => set({ allowedRegistries: st.allowedRegistries.filter((x) => x !== r) }, "Registry removed")} className="h-5 w-5 grid place-items-center rounded-full hover:bg-surface-muted disabled:opacity-40" title={editable ? undefined : "Requires the admin role"}>&times;</button>
                    </li>
                  ))}
                  {st.allowedRegistries.length === 0 && <li className="text-xs text-text-tertiary">No restriction. Any registry is accepted.</li>}
                </ul>
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const v = reg.trim().replace(/^https?:\/\//, "").replace(/\/+$/, ""); if (!v || st.allowedRegistries.includes(v)) return; if (!/^[a-z0-9.-]+(:\d+)?(\/[\w./-]+)?$/i.test(v)) return toast("Enter a registry host such as registry.example.com", "error"); set({ allowedRegistries: [...st.allowedRegistries, v] }, "Registry added"); setReg(""); }}>
                  <Input value={reg} onChange={(e) => setReg(e.target.value)} placeholder="registry.example.com" aria-label="Registry host" disabled={!editable} title={editable ? undefined : "Requires the admin role"} />
                  <Button type="submit" disabled={!editable || !reg.trim()}>Add</Button>
                </form>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Secrets and retention" />
              <CardBody className="space-y-4">
                <Field label="Secret manager" hint="Connections store references to secrets here. Plaintext never enters tok∑ner."><Select value={st.secretManager} disabled={!editable} onChange={(e) => set({ secretManager: e.target.value as keyof typeof MANAGERS })}>{Object.entries(MANAGERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
                <Field label="Audit retention (days)" hint="Between 90 and 2555 days."><Input type="number" min={90} max={2555} defaultValue={st.auditRetentionDays} disabled={!editable} onBlur={(e) => { const n = Number(e.target.value); if (n === st.auditRetentionDays) return; if (!Number.isFinite(n) || n < 90 || n > 2555) { toast("Retention must be between 90 and 2555 days", "error"); e.target.value = String(st.auditRetentionDays); return; } set({ auditRetentionDays: Math.round(n) }); }} /></Field>
              </CardBody>
            </Card>
            {!live && <Card>
              <CardHeader title="Sample data" />
              <CardBody className="flex items-center justify-between gap-3"><p className="text-[13px] text-text-secondary">Restore the seeded NexI Corp organisation. Your role selection is kept.</p><Button onClick={() => setReset(true)}>Reset sample data</Button></CardBody>
            </Card>}
          </div>
        </div>
      )}

      {tab === "access" && (
        <Card>
          <CardHeader title="Role matrix" subtitle="What each role can do. Enforced by the control plane API in a real deployment; shown here so a disabled control always has a reason." />
          <CardBody>
            <Table>
              <Thead><tr><Th>Action</Th>{ROLES.map((r) => <Th key={r}><span className={r === role ? "text-text-primary" : undefined}>{ROLE_LABEL[r]}{r === role ? " (you)" : ""}</span></Th>)}</tr></Thead>
              <tbody>
                {ALL_ACTIONS.map((a) => (
                  <Tr key={a}>
                    <Td>{ACTION_LABEL[a]}</Td>
                    {ROLES.map((r) => {
                      const d = can(r, a);
                      const prod = a === "pipeline.run" || a === "deployment.scale";
                      const limited = d.ok && prod && r === "developer";
                      return <Td key={r}>{d.ok ? <span className="inline-flex items-center gap-1 text-xs"><Check size={14} className="text-status-healthy" aria-label="Allowed" />{limited ? <span className="text-text-secondary">not in production</span> : null}</span> : <Minus size={14} className="text-text-tertiary" aria-label="Not allowed" />}</Td>;
                    })}
                  </Tr>
                ))}
              </tbody>
            </Table>
            <p className="text-xs text-text-tertiary mt-3">Approving a gate requires a different person than the one who started the run (separation of duties). Identity and group mapping come from your organisation's OIDC provider.</p>
          </CardBody>
        </Card>
      )}

      {tab === "plan" && <PlanPanel />}

      {tab === "audit" && (
        <Card>
          <CardHeader title="Audit log" subtitle={`Newest first. Retained ${st.auditRetentionDays} days. Entries from this demo are labelled.`} />
          <div className="px-4 pt-3"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by actor, action or resource" aria-label="Filter audit log" className="max-w-sm" /></div>
          <CardBody>
            <Table>
              <Thead><tr><Th>When</Th><Th>Actor</Th><Th>Action</Th><Th>Resource</Th><Th>Environment</Th><Th>Detail</Th></tr></Thead>
              <tbody>
                {audit.slice(0, 120).map((e) => (
                  <Tr key={e.id}>
                    <Td className="whitespace-nowrap text-text-secondary">{fmtDate(e.at)}</Td>
                    <Td>{e.actor}</Td>
                    <Td><Badge tone="neutral">{e.action}</Badge></Td>
                    <Td className="font-medium">{e.resource} {e.demo && <DemoTag />}</Td>
                    <Td>{e.env ? <EnvBadge env={e.env} /> : <span className="text-text-tertiary">n/a</span>}</Td>
                    <Td className="text-text-secondary">{e.detail}</Td>
                  </Tr>
                ))}
                
              </tbody>
            </Table>
            {audit.length === 0 && <p className="text-sm text-text-secondary py-3">No entries match.</p>}
          </CardBody>
        </Card>
      )}

      <Confirm open={reset} onClose={() => setReset(false)} title="Reset sample data" body="This replaces all seeded and demo changes (connections, pipelines, runs, agents and the audit log) with the original NexI Corp data." confirmLabel="Reset sample data" onConfirm={async () => { await mlops.resetDemo(); toast("Sample data restored"); setReset(false); }} />
    </div>
  );
}
