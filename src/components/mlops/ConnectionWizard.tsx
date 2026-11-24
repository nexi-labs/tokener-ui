"use client";

import clsx from "clsx";
import { Check, CheckCircle2, CircleDashed, Loader2, MinusCircle, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Toggle } from "@/components/ui/Form";
import { NodeIcon } from "@/components/studio/icons";
import { OwnerSelect } from "@/components/org/OrgSelect";
import { useOrgDirectory } from "@/lib/org/useOrgDirectory";
import { integrationById, isPublished } from "@/lib/mlops/catalog";
import { useIntegrations } from "@/lib/platform/integrations";
import { mlops, simulateConnectivityTest, useMlops, useMlopsStatus, type TestFailure, type TestStep } from "@/lib/mlops/store";
import { useAuth } from "@/lib/auth/AuthProvider";
import { toast } from "@/lib/mlops/toast";
import { AUTH_LABEL, CAPABILITY_LABEL, ENVS, ENV_LABEL, FAMILY_LABEL, type AuthMode, type Connection, type Env } from "@/lib/mlops/types";
import { ConnectionCode } from "./ConnectionCode";
import { HealthBadge, IntegrationStatusBadge, Modal, Notice, SecretRef, relTime } from "./ui";

const STEPS = ["Integration", "Scope", "Authentication", "Endpoint and TLS", "Permissions", "Test", "Review", "Secret and health"];

const FAIL_HELP: Record<Exclude<TestFailure, "none">, string> = {
  dns: "Network and DNS problems are fixed outside the control plane: check the hostname, split-horizon DNS, or register an agent inside the private network.",
  network: "Open the firewall or proxy path from the control plane (or the agent) to the target on the stated port.",
  tls: "Provide the CA bundle that signed the server certificate. Turning verification off is not a fix and is blocked in production.",
  auth: "Check the credential, its audience and its expiry. For OIDC or workload identity, check the trust relationship.",
  permission: "The identity authenticated but lacks the read-only discovery permissions listed in step 5.",
  version: "The target runs a version outside the supported range. Upgrade the target or pick another integration.",
};

type Form = {
  integrationId: string; name: string; env: Env; owner: string; scope: string; auth: AuthMode; secretInput: string; tlsVerify: boolean; caBundle: string;
  fields: Record<string, any>; connectivity: "direct" | "agent" | "proxy"; proxy: string; permissions: "read-only" | "read-write"; writeAck: boolean; noAuthAck: boolean;
};

export function ConnectionWizard({ open, onClose, initialIntegration }: { open: boolean; onClose: () => void; initialIntegration?: string }) {
  const INTEGRATIONS = useIntegrations();
  const s = useMlops();
  const live = useMlopsStatus().mode === "live";
  const { user, orgId } = useAuth();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form | null>(null);
  const [fail, setFail] = useState<TestFailure>("none");
  const [results, setResults] = useState<TestStep[] | null>(null);
  const [testing, setTesting] = useState(false);
  const [created, setCreated] = useState<Connection | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    // Only an approved connector can be chosen. A link to one that is not approved starts from the list instead.
    const asked = initialIntegration && integrationById(initialIntegration) && isPublished(integrationById(initialIntegration)!) ? initialIntegration : undefined;
    const id = asked ?? "kubernetes";
    const i = integrationById(id)!;
    setStep(asked ? 1 : 0); setResults(null); setCreated(null); setErr(""); setFail("none");
    setForm({
      integrationId: id, name: "", env: "development", owner: live ? (user?.email ?? "") : "maya.okafor@nexi.example", scope: live ? `${orgId ?? "org"}/development` : "nexi-ai/support-ml/development", auth: i.auth[0], secretInput: "", tlsVerify: true, caBundle: "",
      fields: Object.fromEntries(i.fields.map((f) => [f.key, f.default ?? ""])), connectivity: i.privateConnectivity ? "agent" : "direct", proxy: "", permissions: "read-only", writeAck: false, noAuthAck: false,
    });
  }, [open, initialIntegration]); // eslint-disable-line react-hooks/exhaustive-deps

  const integ = form ? integrationById(form.integrationId) : undefined;
  const { dir } = useOrgDirectory();
  const root = live ? (orgId ?? "org") : "nexi-ai";
  const scopes = form ? [{ value: `${root}/${form.env}`, label: `${dir.orgName ?? "Whole organization"}, all projects` }, ...dir.projects.map((p) => ({ value: `${root}/${p.name}/${form.env}`, label: `${p.name}, ${p.departmentName}, ${p.tenantName}` }))] : [];
  const set = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const endpoint = useMemo(() => {
    if (!form || !integ) return "";
    const f = form.fields;
    return String(f.endpoint ?? (f.host ? `${f.host}${f.port ? `:${f.port}` : ""}${f.database ? `/${f.database}` : ""}` : f.bootstrap ?? f.roleArn ?? f.projectId ?? f.subscriptionId ?? f.image ?? (f.agentId && !String(f.agentId).startsWith("Pick") ? `agent://${f.agentId}` : "")));
  }, [form, integ]);

  if (!form || !integ || !s) return <Modal open={open} onClose={onClose} title="Add connection"><span /></Modal>;

  // After saving, show what the server stored (its secret reference, health and times), not what was typed.
  const shown = created ? (live ? s.connections.find((c) => c.id === created.id) ?? created : created) : created;
  const secretRef = `secretref://${s.settings.secretManager}/nexi/${form.env}/${(form.name || integ.id).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const prod = form.env === "production";
  const visible = (f: { showWhen?: { key: string; in: string[] } }) => !f.showWhen || f.showWhen.in.includes(String(f.showWhen.key === "auth" ? form.auth : form.fields[f.showWhen.key] ?? ""));

  const codeInput = {
    integration: integ, name: form.name, env: form.env, scope: form.scope, owner: form.owner, auth: form.auth, secretRef: form.auth === "none" ? undefined : secretRef, endpoint,
    tlsVerify: form.tlsVerify, permissions: form.permissions, connectionId: created?.id,
    settings: Object.fromEntries(integ.fields.filter((f) => visible(f) && f.key !== "tlsVerify" && form.fields[f.key] !== undefined && form.fields[f.key] !== "").map((f) => [f.key, form.fields[f.key]])) as Record<string, string | number | boolean>,
  };

  const problem = (): string => {
    if (step === 1) {
      if (!/^[A-Za-z0-9][A-Za-z0-9 ._()\-]{2,60}$/.test(form.name)) return "Give the connection a name of 3 to 60 characters.";
      if (s.connections.some((c) => c.name.toLowerCase() === form.name.toLowerCase())) return "A connection with this name already exists.";
    }
    if (step === 2) {
      if (form.auth === "none" && prod) return "Unauthenticated access is not allowed for production environments.";
      if (form.auth === "none" && !form.noAuthAck) return "Acknowledge the unauthenticated access warning to continue.";
      if (form.auth !== "none" && form.auth !== "workload-identity" && form.auth !== "role-assumption" && form.auth !== "oidc" && form.auth !== "secret-manager" && !form.secretInput.trim()) return "Enter the credential. It is moved to your secret manager when you save and is never kept.";
    }
    if (step === 3) {
      const missing = integ.fields.find((f) => f.required && visible(f) && !String(form.fields[f.key] ?? "").trim());
      const badLine = integ.fields.find((f) => f.type === "textarea" && visible(f) && /refs|headers|env/i.test(f.key) && String(form.fields[f.key] ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).some((l) => !/^[A-Za-z_][\w.-]*=secretref:\/\/\S+$/.test(l)));
      if (badLine) return `${badLine.label}: write each line as NAME=secretref://... Values are never entered here.`;
      const badRef = integ.fields.find((f) => /SecretRef$/.test(f.key) && visible(f) && String(form.fields[f.key] ?? "").trim() && !/^secretref:\/\/\S+$/.test(String(form.fields[f.key]).trim()));
      if (badRef) return `${badRef.label}: enter a reference that starts with secretref://. The value itself is never entered here.`;
      const bad = integ.fields.find((f) => f.key === "url" && visible(f) && form.fields.url && !/^https:\/\/[^\s/]+/.test(String(form.fields.url)) && !(form.env !== "production" && /^http:\/\/(localhost|127\.0\.0\.1)/.test(String(form.fields.url))));
      if (bad) return "The server address must start with https://. Plain http is only allowed for localhost in non-production environments.";
      if (missing) return `${missing.label} is required.`;
      if (!form.tlsVerify && prod) return "TLS verification cannot be disabled in production.";
      if (/[?&](token|key|password|secret|sig)=/i.test(endpoint) || /\/\/[^/@\s]+:[^/@\s]+@/.test(endpoint)) return "Do not put secrets in URLs. Use the credential field instead.";
    }
    if (step === 4 && form.permissions === "read-write" && !form.writeAck) return "Acknowledge the write access notice, or choose read-only.";
    if (step === 5 && !(results && results.every((r) => r.state === "pass"))) return "Run the connectivity test and resolve any failure before continuing.";
    return "";
  };

  const draft = (): Omit<Connection, "id" | "demo"> => ({
    name: form.name, integrationId: integ.id, env: form.env, owner: form.owner, scope: form.scope, auth: form.auth, secretRef: form.auth === "none" || form.secretInput.trim() ? undefined : secretRef,
    endpoint: endpoint || "n/a", tlsVerify: form.tlsVerify, permissions: form.permissions, health: "healthy", healthDetail: "Connectivity, TLS, authentication and permission checks passed",
    lastVerifiedAt: new Date().toISOString(), credentialRotatedAt: new Date().toISOString(), capabilities: integ.capabilities.filter((x) => x.level !== "none").map((x) => x.id),
    settings: Object.fromEntries(integ.fields.filter((f) => visible(f) && f.key !== "tlsVerify" && form.fields[f.key] !== undefined && form.fields[f.key] !== "").map((f) => [f.key, form.fields[f.key]])) as Record<string, string | number | boolean>,
  });

  const runTest = async () => {
    setTesting(true); setResults(null); setErr("");
    if (live) {
      // The server runs the read-only test. The credential goes in this one request and is not kept.
      const r = await mlops.testConnectionDraft(draft(), form.secretInput);
      setTesting(false);
      if (!r.ok) { setErr(r.error); return; }
      setResults(r.steps);
      return;
    }
    setTimeout(() => { setResults(simulateConnectivityTest(integ.id, endpoint, form.tlsVerify, fail)); setTesting(false); }, 700);
  };

  const create = async () => {
    const c = draft();
    const r = await mlops.addConnection(c, form.secretInput);
    if (!r.ok) { setErr(r.error); return; }
    // The credential field is discarded here. Only the reference remains in state.
    set({ secretInput: "" });
    setCreated({ ...c, id: r.id, demo: !live });
    setStep(7);
    toast(`Connection "${c.name}" saved`);
  };

  const next = () => { const p = problem(); setErr(p); if (!p) setStep((x) => x + 1); };

  return (
    <Modal open={open} onClose={onClose} wide title={`Add connection: step ${step + 1} of ${STEPS.length}, ${STEPS[step]}`}
      footer={
        created ? <Button variant="primary" onClick={onClose}>Done</Button> : (
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            {step > 0 && step !== 7 && <Button variant="secondary" onClick={() => { setErr(""); setStep(step - 1); }}>Back</Button>}
            {step < 6 && <Button variant="primary" onClick={next}>Continue</Button>}
            {step === 6 && <Button variant="primary" onClick={create}>Create connection</Button>}
          </>
        )
      }>
      <ol className="flex flex-wrap gap-x-1 gap-y-1 mb-4" aria-label="Wizard progress">
        {STEPS.map((t, i) => (
          <li key={t} aria-current={i === step ? "step" : undefined} className={clsx("flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md", i === step ? "bg-emph text-on-emph" : i < step ? "text-text-secondary" : "text-text-tertiary")}>
            <span className={clsx("h-4 w-4 rounded-full grid place-items-center text-[10px] font-semibold", i < step ? "bg-accent-600 text-ink-800" : i === step ? "bg-on-emph/20" : "border border-border-strong")}>{i < step ? <Check size={10} /> : i + 1}</span>{t}
          </li>
        ))}
      </ol>

      {err && <div className="mb-3"><Notice tone="bad">{err}</Notice></div>}

      {step === 0 && (
        <div className="space-y-4">
          <Field label="Integration">
            <Select value={form.integrationId} onChange={(e) => { const i = integrationById(e.target.value)!; set({ integrationId: i.id, auth: i.auth[0], fields: Object.fromEntries(i.fields.map((f) => [f.key, f.default ?? ""])), connectivity: i.privateConnectivity ? "agent" : "direct" }); }}>
              {Object.entries(FAMILY_LABEL).filter(([fam]) => INTEGRATIONS.some((i) => isPublished(i) && i.family === fam)).map(([fam, label]) => (
                <optgroup key={fam} label={label}>{INTEGRATIONS.filter((i) => isPublished(i) && i.family === fam).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</optgroup>
              ))}
            </Select>
          </Field>
          <div className="flex items-start gap-3 rounded-md border border-border p-3.5">
            <div className="h-9 w-9 rounded-md bg-surface-muted grid place-items-center shrink-0"><NodeIcon icon={integ.icon} size={20} /></div>
            <div className="min-w-0 text-[13px]">
              <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{integ.name}</span><IntegrationStatusBadge s={integ.status} wave={integ.wave} /></div>
              <p className="text-text-secondary mt-1">{integ.blurb}</p>
              <p className="text-text-tertiary mt-1 text-xs">Target version: {integ.versionTarget}</p>
            </div>
          </div>
          {integ.status !== "available" && integ.status !== "beta" && <Notice tone="warn" title="Connector in development">The connector for this integration has not been released yet. Test results are sample results until it ships, and the connection is saved as a sample record.</Notice>}
          {integ.compliance && integ.compliance.length > 0 && (
            <Notice tone="warn" title="Before you go live">
              <ul className="list-disc pl-4 space-y-1">{integ.compliance.map((c) => <li key={c}>{c}</li>)}</ul>
              <p className="mt-2 text-xs">This is a summary to help you prepare, not legal advice. Confirm obligations with your provider, acquirer or counsel for each country you operate in.</p>
            </Notice>
          )}
          <div>
            <div className="text-[13px] font-medium mb-2">Capabilities</div>
            <div className="grid sm:grid-cols-2 gap-1.5">
              {integ.capabilities.map((c) => (
                <div key={c.id} className="flex items-start gap-2 text-[13px]">
                  {c.level === "full" ? <CheckCircle2 size={15} className="text-status-healthy mt-0.5 shrink-0" /> : c.level === "partial" ? <CircleDashed size={15} className="text-status-degraded mt-0.5 shrink-0" /> : <MinusCircle size={15} className="text-text-tertiary mt-0.5 shrink-0" />}
                  <span><span className="text-text-primary">{CAPABILITY_LABEL[c.id]}</span>{c.note && <span className="block text-xs text-text-tertiary">{c.note}</span>}</span>
                </div>
              ))}
            </div>
            {integ.limitations.length > 0 && <ul className="mt-3 text-xs text-text-secondary list-disc pl-4 space-y-0.5">{integ.limitations.map((l) => <li key={l}>{l}</li>)}</ul>}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Connection name"><Input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder={`${integ.name} (${form.env})`} autoFocus /></Field>
          <Field label="Environment" hint="A connection belongs to exactly one environment. Pipelines can only use connections from their own environment.">
            <Select value={form.env} onChange={(e) => set({ env: e.target.value as Env, scope: form.scope.split("/").length > 2 ? `${root}/${form.scope.split("/")[1]}/${e.target.value}` : `${root}/${e.target.value}` })}>{ENVS.map((e) => <option key={e} value={e}>{ENV_LABEL[e]}</option>)}</Select>
          </Field>
          <Field label="Organization and project" hint="Projects come from Tenant Management. Choose the organization to share the connection across it.">
            <Select aria-label="Organization and project" value={form.scope} onChange={(e) => set({ scope: e.target.value })}>
              {!scopes.some((o) => o.value === form.scope) && <option value={form.scope}>{form.scope}</option>}
              {scopes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <OwnerSelect value={form.owner} onChange={(v) => set({ owner: v })} hint="Receives expiry and failure notifications." />
          {prod && <div className="sm:col-span-2"><Notice tone="warn">Production connections apply stricter rules: no unauthenticated access, TLS verification always on, and changes need the approver role.</Notice></div>}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <fieldset>
            <legend className="text-[13px] font-medium mb-2">Authentication mode</legend>
            <div className="grid sm:grid-cols-2 gap-2">
              {integ.auth.map((a) => (
                <label key={a} className={clsx("flex items-start gap-2.5 rounded-md border p-3 cursor-pointer text-[13px]", form.auth === a ? "border-accent-600 bg-accent-50/50" : "border-border hover:bg-surface-subtle")}>
                  <input type="radio" name="auth" checked={form.auth === a} onChange={() => set({ auth: a })} className="mt-0.5 accent-[#00B876]" />
                  <span><span className="font-medium">{AUTH_LABEL[a]}</span><span className="block text-xs text-text-tertiary mt-0.5">{a === "workload-identity" || a === "role-assumption" || a === "oidc" ? "No long-lived secret. Preferred." : a === "none" ? "Not recommended." : "A secret is stored in your secret manager."}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          {form.auth === "none" && (
            <Notice tone="warn" title="Unauthenticated access">
              Anyone who can reach this target can use it. {prod ? "This is blocked in production." : <label className="flex items-center gap-2 mt-2 text-text-primary"><input type="checkbox" checked={form.noAuthAck} onChange={(e) => set({ noAuthAck: e.target.checked })} /> I understand and accept this for a non-production environment.</label>}
            </Notice>
          )}
          {!["none", "workload-identity", "role-assumption", "oidc", "secret-manager"].includes(form.auth) && (
            <Field label="Credential" hint={`Moved to ${s.settings.secretManager} when you save. This field is cleared and the value is never stored, logged, exported or returned to the browser again.`}>
              <Input type="password" autoComplete="off" value={form.secretInput} onChange={(e) => set({ secretInput: e.target.value })} placeholder="Paste once. Never kept." />
            </Field>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            {integ.fields.filter((f) => f.key !== "tlsVerify" && visible(f)).map((f) => (
              <div key={f.key} className={clsx(f.type === "textarea" || f.type === "toggle" || f.group ? "sm:col-span-2" : "")}>
                {f.group && <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-tertiary pt-3 pb-1 border-t border-border mt-1">{f.group}</p>}
                {f.type === "toggle" ? <Toggle checked={Boolean(form.fields[f.key])} onChange={(v) => set({ fields: { ...form.fields, [f.key]: v } })} label={f.label} description={f.help} />
                  : (
                    <Field label={`${f.label}${f.required ? " *" : ""}`} hint={f.help}>
                      {f.type === "select" ? <Select value={String(form.fields[f.key] ?? "")} onChange={(e) => set({ fields: { ...form.fields, [f.key]: e.target.value } })}>{(f.options ?? []).map((o) => <option key={o}>{o}</option>)}</Select>
                        : f.type === "textarea" ? <textarea value={String(form.fields[f.key] ?? "")} rows={3} placeholder={f.placeholder} onChange={(e) => set({ fields: { ...form.fields, [f.key]: e.target.value } })} className="w-full rounded-md border border-border-strong px-3 py-2 text-xs font-code focus:outline-none focus:ring-2 focus:ring-accent-500/40" />
                        : <Input type={f.type === "number" ? "number" : "text"} value={String(form.fields[f.key] ?? "")} placeholder={f.placeholder} onChange={(e) => set({ fields: { ...form.fields, [f.key]: e.target.value } })} />}
                    </Field>
                  )}
              </div>
            ))}
          </div>
          <Toggle checked={form.tlsVerify} onChange={(v) => set({ tlsVerify: v })} label="Verify TLS certificates" description="On by default. Provide a CA bundle for private certificate authorities instead of turning this off." />
          {!form.tlsVerify && <Notice tone={prod ? "bad" : "warn"}>{prod ? "Blocked in production." : "Traffic to this target can be intercepted. Use only for short-lived local testing."}</Notice>}
          <Field label="Custom CA bundle (PEM, public certificates only)"><textarea value={form.caBundle} onChange={(e) => set({ caBundle: e.target.value })} rows={3} className="w-full rounded-md border border-border-strong px-3 py-2 text-xs font-code focus:outline-none focus:ring-2 focus:ring-accent-500/40" placeholder="-----BEGIN CERTIFICATE-----" /></Field>
          <fieldset>
            <legend className="text-[13px] font-medium mb-2">How does the platform reach this target?</legend>
            <div className="grid sm:grid-cols-3 gap-2 text-[13px]">
              {([["direct", "Direct", "Control plane connects over HTTPS."], ["agent", "Through an agent", "Outbound-only agent inside your network."], ["proxy", "Egress proxy", "Through your HTTPS proxy."]] as const).map(([v, l, d]) => (
                <label key={v} className={clsx("rounded-md border p-3 cursor-pointer", form.connectivity === v ? "border-accent-600 bg-accent-50/50" : "border-border hover:bg-surface-subtle")}>
                  <input type="radio" name="conn" className="sr-only" checked={form.connectivity === v} onChange={() => set({ connectivity: v })} /><span className="font-medium">{l}</span><span className="block text-xs text-text-tertiary mt-0.5">{d}</span>
                </label>
              ))}
            </div>
            {form.connectivity === "proxy" && <div className="mt-3"><Field label="Proxy URL"><Input value={form.proxy} onChange={(e) => set({ proxy: e.target.value })} placeholder="https://proxy.nexi.internal:3128" /></Field></div>}
            {form.connectivity === "agent" && <p className="text-xs text-text-tertiary mt-2">Enroll or choose an agent under Build Agents. The agent only needs outbound HTTPS.</p>}
          </fieldset>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <p className="text-[13px] text-text-secondary">Start with read-only discovery. Widen to write access later, after the connection has been verified, and only for the resources a pipeline needs.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {(["read-only", "read-write"] as const).map((p) => (
              <label key={p} className={clsx("rounded-md border p-3.5 cursor-pointer", form.permissions === p ? "border-accent-600 bg-accent-50/50" : "border-border hover:bg-surface-subtle")}>
                <input type="radio" name="perm" className="sr-only" checked={form.permissions === p} onChange={() => set({ permissions: p })} />
                <div className="text-[13px] font-medium">{p === "read-only" ? "Read-only discovery (recommended)" : "Read and write"}</div>
                <ul className="mt-2 text-xs text-text-secondary list-disc pl-4 space-y-1">{(p === "read-only" ? integ.permissions.read : [...integ.permissions.read, ...integ.permissions.write]).map((x) => <li key={x}>{x}</li>)}</ul>
              </label>
            ))}
          </div>
          {form.permissions === "read-write" && (
            <Notice tone="warn" title="Write access"><label className="flex items-start gap-2 text-text-primary"><input type="checkbox" className="mt-0.5" checked={form.writeAck} onChange={(e) => set({ writeAck: e.target.checked })} /> Pipelines using this connection can create, change and delete resources in {ENV_LABEL[form.env]}. I have granted only the listed permissions to the credential.</label></Notice>
          )}
        </div>
      )}

      {step === 5 && (
        <div className="space-y-4">
          <p className="text-[13px] text-text-secondary">The test is non-destructive. It resolves the name, opens a connection, verifies TLS, authenticates and makes one read-only call, and each class of failure is reported separately.</p>
          {!live && <Notice tone="info" title="Test simulation">Choose an outcome to see how each failure class is reported and what to do about it.</Notice>}
          <div className="flex flex-wrap items-end gap-3">
            {!live && <Field label="Simulate outcome">
              <Select value={fail} onChange={(e) => { setFail(e.target.value as TestFailure); setResults(null); }}>
                <option value="none">Everything passes</option><option value="dns">DNS failure</option><option value="network">Network timeout</option><option value="tls">TLS trust failure</option><option value="auth">Authentication failure</option><option value="permission">Permission failure</option><option value="version">Unsupported version</option>
              </Select>
            </Field>}
            <Button variant="primary" onClick={runTest} disabled={testing}>{testing ? <><Loader2 size={14} className="animate-spin" /> Testing</> : "Run test"}</Button>
          </div>
          {results && (
            <ul className="rounded-md border border-border divide-y divide-border">
              {results.map((r) => (
                <li key={r.id} className="flex items-start gap-2.5 px-3.5 py-2.5 text-[13px]">
                  {r.state === "pass" ? <CheckCircle2 size={16} className="text-status-healthy mt-0.5" /> : r.state === "fail" ? <XCircle size={16} className="text-status-down mt-0.5" /> : <MinusCircle size={16} className="text-text-tertiary mt-0.5" />}
                  <div><div className="font-medium">{r.label}</div><div className={clsx("text-xs", r.state === "fail" ? "text-status-down" : "text-text-secondary")}>{r.detail}</div></div>
                </li>
              ))}
            </ul>
          )}
          {!live && results?.some((r) => r.state === "fail") && fail !== "none" && <Notice tone="warn" title="How to fix">{FAIL_HELP[fail as Exclude<TestFailure, "none">]}</Notice>}
        </div>
      )}

      {step === 6 && (
        <div className="space-y-4">
          <dl className="grid grid-cols-[150px_1fr] gap-x-4 gap-y-2 text-[13px]">
            {[["Integration", integ.name], ["Name", form.name], ["Environment", ENV_LABEL[form.env]], ["Scope", form.scope], ["Owner", form.owner], ["Authentication", AUTH_LABEL[form.auth]], ["Endpoint", endpoint || "n/a"], ["TLS verification", form.tlsVerify ? "On" : "Off"], ["Reach via", form.connectivity], ["Permissions", form.permissions]].map(([k, v]) => (
              <div key={k} className="contents"><dt className="text-text-tertiary">{k}</dt><dd className="break-words">{v}</dd></div>
            ))}
            <dt className="text-text-tertiary">Secret reference</dt><dd><SecretRef value={form.auth === "none" ? undefined : secretRef} /></dd>
          </dl>
          <div>
            <p className="text-[13px] font-medium text-text-primary mb-2">Code for this connection</p>
            <ConnectionCode input={codeInput} compact />
          </div>
          <Notice tone="info">Saving stores the reference only. The credential you entered is discarded from this form and handed to {s.settings.secretManager}. It does not appear in URLs, logs, telemetry, exports or this page again.</Notice>
        </div>
      )}

      {step === 7 && created && shown && (
        <div className="space-y-4">
          <Notice tone="ok" title="Connection created">{shown.name} is now available to pipelines in {ENV_LABEL[shown.env]}.</Notice>
          <dl className="grid grid-cols-[150px_1fr] gap-x-4 gap-y-2.5 text-[13px] items-center">
            <dt className="text-text-tertiary">Health</dt><dd><HealthBadge h={shown.health} /></dd>
            <dt className="text-text-tertiary">Last verified</dt><dd>{relTime(shown.lastVerifiedAt)}</dd>
            <dt className="text-text-tertiary">Secret reference</dt><dd><SecretRef value={shown.secretRef} /></dd>
            <dt className="text-text-tertiary">Credential rotated</dt><dd>{relTime(shown.credentialRotatedAt)}</dd>
            <dt className="text-text-tertiary">Re-verification</dt><dd>Scheduled every 24 hours. Failures notify {shown.owner}.</dd>
          </dl>
          <div>
            <p className="text-[13px] font-medium text-text-primary mb-2">Use this connection from code</p>
            <ConnectionCode input={codeInput} compact />
          </div>
        </div>
      )}
    </Modal>
  );
}
