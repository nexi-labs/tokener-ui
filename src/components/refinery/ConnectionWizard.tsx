"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, Lock, Search, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { Modal, Notice } from "@/components/mlops/ui";
import { ConnectorMark } from "@/components/refinery/bits";
import { CONNECTORS, CONNECTOR_BY_ID, GROUPS, type Field as F } from "@/lib/refinery/connectors";
import { refinery, useRefinery, useRefineryStatus } from "@/lib/refinery/store";

const BIG_SECRET = /(key|cert|pem|json|token)$/i;
const NAME_OK = /^[a-z0-9][a-z0-9-]{1,40}$/;
type Result = { ok: boolean; queued?: boolean; unchecked?: boolean; message?: string; steps: { name: string; ok: boolean; detail: string }[] };

function Input_({ f, value, onChange }: { f: F; value: string; onChange: (v: string) => void }) {
  if (f.kind === "select") return <Select value={value} onChange={(e) => onChange(e.target.value)}>{f.options!.map((o) => <option key={o}>{o}</option>)}</Select>;
  if (f.kind === "secret" && BIG_SECRET.test(f.key) && /key|cert|pem|json/i.test(f.key)) return <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} spellCheck={false} autoComplete="off" placeholder="Paste the value. It is stored in the secret manager." className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-[12px] font-code text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-500/40" />;
  return <Input type={f.kind === "secret" ? "password" : "text"} autoComplete="off" value={value} placeholder={f.kind === "secret" ? "Stored in the secret manager" : f.placeholder} onChange={(e) => onChange(e.target.value)} />;
}

export function ConnectionWizard({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone?: (id: string) => void }) {
  const { pools, connections } = useRefinery();
  const isLive = useRefineryStatus().mode === "live";
  const [step, setStep] = useState(0);
  const [q, setQ] = useState("");
  const [cid, setCid] = useState("");
  const [name, setName] = useState("");
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [pool, setPool] = useState("");
  const [authId, setAuthId] = useState("");
  const [vals, setVals] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const c = CONNECTOR_BY_ID.get(cid);
  const method = c?.auth.find((a) => a.id === authId);
  const chosenPool = pools.find((p) => p.name === pool);

  const reset = () => { setStep(0); setQ(""); setCid(""); setName(""); setSettings({}); setPool(""); setAuthId(""); setVals({}); setResult(null); setCreatedId(null); };
  const close = () => { reset(); onClose(); };
  const pickConnector = (id: string) => {
    const k = CONNECTOR_BY_ID.get(id)!; setCid(id); setAuthId(k.auth[0].id); setVals({});
    setSettings(Object.fromEntries(k.settings.filter((f) => f.def).map((f) => [f.key, f.def!])));
    setPool((p) => p || pools.find((x) => x.status !== "offline" && x.status !== "pending")?.name || pools[0]?.name || ""); setStep(1);
  };

  const nameErr = name && !NAME_OK.test(name) ? "Use lower case letters, digits and hyphens, 2 to 41 characters." : connections.some((x) => x.name === name) ? "A connection with this name exists." : null;
  const settingsMissing = c ? c.settings.filter((f) => !f.optional && !(settings[f.key] ?? "").trim()) : [];
  const detailsOk = !!name && !nameErr && settingsMissing.length === 0 && !!pool;
  const val = (f: F) => vals[f.key] ?? f.def ?? "";
  const missingAuth = method ? method.fields.filter((f) => !f.optional && !val(f).trim()) : [];
  const identityOnManaged = !!method?.identity && chosenPool?.hosting === "managed";

  const list = useMemo(() => CONNECTORS.filter((x) => !q || `${x.name} ${x.group} ${x.note ?? ""} ${x.messaging ? `streaming messaging ${x.messaging.unit} ${x.messaging.family}` : ""}`.toLowerCase().includes(q.toLowerCase())), [q]);

  const [saving, setSaving] = useState(false); const [err, setErr] = useState<string | null>(null);
  const create = async () => {
    if (!c || !method || saving) return;
    setSaving(true); setErr(null);
    const secrets = Object.fromEntries(method.fields.filter((f) => f.kind === "secret").map((f) => [f.key, val(f)]));
    const plain = Object.fromEntries(method.fields.filter((f) => f.kind !== "secret" && val(f) !== "").map((f) => [f.key, val(f)]));
    const made = await refinery.createConnection({ name, connector: c.id, auth: method.id, settings: { ...settings, ...plain }, secrets, pool });
    if (!made.ok) { setSaving(false); setErr(made.error); return; }
    const conn = made.connection;
    const t = await refinery.testConnection(conn.id);
    setSaving(false);
    setCreatedId(conn.id);
    setResult(t.ok ? { ok: t.passed, queued: t.queued, unchecked: !t.checked, message: t.message, steps: t.checked ? t.steps : [] } : { ok: false, steps: [{ name: "Test", ok: false, detail: t.error }] });
    setStep(3); onDone?.(conn.id);
  };

  const steps = ["System", "Details", "Authentication", "Test"];
  return (
    <Modal open={open} onClose={close} wide title={c && step > 0 ? `New connection: ${c.name}` : "New connection"}
      footer={step === 0 ? <Button variant="secondary" onClick={close}>Cancel</Button> : step === 3 ? <Button variant="primary" onClick={close}>Done</Button> : (
        <>
          <Button variant="secondary" onClick={() => setStep(step - 1)}><ArrowLeft size={14} /> Back</Button>
          {step === 1 && <Button variant="primary" disabled={!detailsOk} onClick={() => setStep(2)}>Continue</Button>}
          {step === 2 && <Button variant="primary" disabled={missingAuth.length > 0 || saving} onClick={create}>{saving ? "Saving" : "Create and test"}</Button>}
        </>
      )}>
      <ol className="flex items-center gap-2 mb-5 text-xs" aria-label="Progress">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className={clsx("h-5 w-5 rounded-full grid place-items-center text-[10px] font-semibold", i < step ? "bg-accent-600 text-white" : i === step ? "bg-emph text-on-emph" : "bg-surface-muted text-text-tertiary")}>{i < step ? <Check size={11} /> : i + 1}</span>
            <span className={clsx(i === step ? "text-text-primary font-medium" : "text-text-tertiary")}>{s}</span>
            {i < steps.length - 1 && <span className="w-6 h-px bg-border-strong" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="space-y-5">
          <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" /><Input aria-label="Search systems" placeholder="Search systems" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {GROUPS.map((g) => {
            const items = list.filter((x) => x.group === g); if (!items.length) return null;
            return (
              <div key={g}>
                <h3 className="text-[11px] uppercase tracking-wide text-text-tertiary mb-2">{g === "Streaming" ? "Streaming and messaging" : g === "Industrial and OT" ? "Industrial and plant data" : g}</h3>
                <div className="grid sm:grid-cols-2 gap-2">
                  {items.map((x) => (
                    <button key={x.id} onClick={() => pickConnector(x.id)} className="text-left flex items-center gap-3 rounded-md border border-border hover:border-border-strong hover:bg-surface-subtle px-3 py-2.5">
                      <ConnectorMark id={x.id} size={34} />
                      <span className="min-w-0"><span className="block text-[13px] font-medium truncate">{x.name}</span><span className="block text-[11px] text-text-tertiary">{x.can.includes("sink") ? "Source and destination" : "Source only"}, {x.auth.length} sign in method{x.auth.length === 1 ? "" : "s"}</span></span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <p className="text-xs text-text-tertiary">To read a file from this computer, use Upload a file on the Datasets screen. It does not need a connection.</p>
        </div>
      )}

      {step === 1 && c && (
        <div className="space-y-4">
          {c.note && <Notice tone="info">{c.note}</Notice>}
          <Field label="Connection name" hint={nameErr ?? "Shown wherever the connection is picked. It cannot be changed later."}><Input value={name} placeholder={`${c.id}-prod`} onChange={(e) => setName(e.target.value.toLowerCase())} aria-invalid={!!nameErr} /></Field>
          <div className="grid sm:grid-cols-2 gap-4">
            {c.settings.map((f) => <Field key={f.key} label={f.label + (f.optional ? " (optional)" : "")} hint={f.hint}><Input_ f={f} value={settings[f.key] ?? ""} onChange={(v) => setSettings({ ...settings, [f.key]: v })} /></Field>)}
          </div>
          <Field label="Runs on" hint="The runner pool that opens this connection. It must be able to reach the system, so a system inside your network needs a pool inside your network.">
            <Select value={pool} onChange={(e) => setPool(e.target.value)}>{pools.map((p) => <option key={p.id} value={p.name} disabled={p.status === "pending"}>{p.name}, {p.hosting === "managed" ? "managed by tok∑ner" : p.hosting === "kubernetes" ? "your Kubernetes" : p.hosting === "vm" ? "your server" : "your Docker host"}{p.status === "offline" ? " (offline)" : ""}</option>)}</Select>
          </Field>
        </div>
      )}

      {step === 2 && c && method && (
        <div className="space-y-4">
          <div>
            <h3 className="text-[13px] font-medium mb-2">How does Refinery sign in to {c.name}?</h3>
            <div role="radiogroup" aria-label="Authentication method" className="grid gap-2">
              {c.auth.map((a) => (
                <button key={a.id} role="radio" aria-checked={a.id === authId} onClick={() => { setAuthId(a.id); setVals({}); }}
                  className={clsx("text-left rounded-md border px-3.5 py-2.5 flex items-start gap-3", a.id === authId ? "border-accent-600 bg-accent-50" : "border-border hover:border-border-strong")}>
                  <span className={clsx("mt-0.5 h-4 w-4 rounded-full border grid place-items-center shrink-0", a.id === authId ? "border-accent-600" : "border-border-strong")}>{a.id === authId && <span className="h-2 w-2 rounded-full bg-accent-600" />}</span>
                  <span className="min-w-0"><span className="block text-[13px] font-medium">{a.label}{a.identity && <span className="ml-2 text-[10px] uppercase tracking-wide text-text-tertiary border border-border-strong rounded px-1 py-px align-middle">Runner identity</span>}</span><span className="block text-xs text-text-secondary mt-0.5">{a.blurb}</span></span>
                </button>
              ))}
            </div>
          </div>
          {identityOnManaged && <Notice tone="warn" title="This method needs a pool inside your account">A managed pool runs in tok∑ner's account and has no identity in yours. Go back and choose a customer-hosted pool, or pick another sign in method.</Notice>}
          {method.fields.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-4">
              {method.fields.map((f) => <div key={f.key} className={f.kind === "secret" && /key|cert|pem|json/i.test(f.key) ? "sm:col-span-2" : ""}><Field label={f.label + (f.optional ? " (optional)" : "")} hint={f.hint}><Input_ f={f} value={val(f)} onChange={(v) => setVals({ ...vals, [f.key]: v })} /></Field></div>)}
            </div>
          )}
          {method.fields.some((f) => f.kind === "secret") ? (
            <div className="flex items-start gap-2.5 rounded-md bg-surface-subtle border border-border px-3.5 py-2.5 text-xs text-text-secondary"><Lock size={14} className="mt-0.5 shrink-0" /><span>Secret values go straight to your secret manager and cannot be read back. The connection keeps only a reference such as <code className="font-code">secretref://vault/…/password</code>.</span></div>
          ) : (
            <div className="flex items-start gap-2.5 rounded-md bg-surface-subtle border border-border px-3.5 py-2.5 text-xs text-text-secondary"><ShieldCheck size={14} className="mt-0.5 shrink-0" /><span>No secret is stored for this method.</span></div>
          )}
          {err && <Notice tone="warn" title="The connection was not saved">{err}</Notice>}
        </div>
      )}

      {step === 3 && result && c && (
        <div className="space-y-4">
          <Notice tone={result.queued || result.unchecked ? "info" : result.ok ? "ok" : "bad"} title={result.unchecked ? "The connection is saved" : result.queued ? "The test is queued" : result.ok ? (isLive ? `${c.name} answered` : "The connection works") : "The connection was saved but the test failed"}>{result.unchecked ? (result.message ?? "") : result.queued ? `${pool} reaches ${c.name} from inside your network. The result appears on the connection when the runner reports.` : result.ok ? (isLive ? `The address accepts connections from ${pool}. This check reaches the system. It does not sign in, so a wrong password shows up when a dataset reads from it.` : `${name} can sign in to ${c.name} from ${pool}.`) : "Fix the step marked failed, then test again from the connection's panel. Nothing is lost."}</Notice>
          <ul className="divide-y divide-border border border-border rounded-md">
            {result.steps.map((s) => (
              <li key={s.name} className="flex items-start gap-3 px-3.5 py-2.5">
                {s.ok ? <Check size={16} className="text-status-healthy mt-0.5 shrink-0" /> : <X size={16} className="text-status-down mt-0.5 shrink-0" />}
                <div className="min-w-0"><div className="text-[13px] font-medium">{s.name}</div><div className="text-xs text-text-secondary">{s.detail}</div></div>
              </li>
            ))}
          </ul>
          {!isLive && <p className="text-xs text-text-tertiary inline-flex items-center gap-1.5"><AlertTriangle size={12} /> Sample workspace: the test is simulated from the settings you entered. Nothing was contacted.</p>}
        </div>
      )}
    </Modal>
  );
}
