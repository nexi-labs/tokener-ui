"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, CircleDashed, Loader2, Lock, XCircle } from "lucide-react";
import clsx from "clsx";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { Notice } from "@/components/mlops/ui";
import { Back, SampleTag } from "@/components/gateway/bits";
import { SpecMark } from "@/components/gateway/ProviderMark2";
import { ProviderPlayground } from "@/components/gateway/ProviderPlayground";
import { useProviders } from "@/lib/gateway/useProviders";
import { liveApi } from "@/lib/gateway/provider-live";
import { liveOrgId } from "@/lib/mlops/store";
import { ApiError } from "@/lib/api/client";
import { SPECS, sampleTest, saveRegistered, secretRefFor, slug, specById, validate, type ProviderSpec, type Registered, type TestOutcome } from "@/lib/gateway/provider-catalog";

const STEPS = ["Provider", "Credentials", "Test", "Models and limits", "Try it"];

function Stepper({ at, done }: { at: number; done: number }) {
  return (
    <ol className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Progress">
      {STEPS.map((s, i) => (
        <li key={s} aria-current={i === at ? "step" : undefined} className={clsx("flex items-center gap-2 text-[13px]", i === at ? "text-text-primary font-medium" : i < done ? "text-text-secondary" : "text-text-tertiary")}>
          <span className={clsx("h-5 w-5 rounded-full text-[11px] flex items-center justify-center border", i < done ? "bg-emph text-on-emph border-transparent" : i === at ? "border-text-primary text-text-primary" : "border-border-strong")}>{i < done ? <Check size={12} /> : i + 1}</span>
          {s}
        </li>
      ))}
    </ol>
  );
}

function Wizard() {
  const q = useSearchParams();
  const { all, live } = useProviders();
  const pre = specById(q.get("kind") ?? "");
  const [step, setStep] = useState(pre ? 1 : 0);
  const [spec, setSpec] = useState<ProviderSpec | null>(pre ?? null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);
  const [run, setRun] = useState<"idle" | "running">("idle");
  const [outcome, setOutcome] = useState<TestOutcome | null>(null);
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [priority, setPriority] = useState(1);
  const [rpm, setRpm] = useState(1000);
  const [tpm, setTpm] = useState(400000);
  const [enabled, setEnabled] = useState<string[]>([]);
  const [saved, setSaved] = useState<Registered | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [serverFields, setServerFields] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [unchecked, setUnchecked] = useState(false);

  useEffect(() => { if (spec) { setValues(Object.fromEntries(spec.fields.filter((f) => f.defaultValue).map((f) => [f.key, f.defaultValue as string]))); setName(all.some((p) => p.kind === spec.kind) ? `${spec.name} (${all.filter((p) => p.kind === spec.kind).length + 1})` : `${spec.name} (primary)`); setRegion(spec.regions[0]); } }, [spec]); // eslint-disable-line react-hooks/exhaustive-deps
  const errors = useMemo(() => (spec ? validate(spec, values) : {}), [spec, values]);
  const set = (k: string, v: string) => { setValues((x) => ({ ...x, [k]: v })); setOutcome(null); setUnchecked(false); setServerFields((f) => { const { [k]: _gone, ...rest } = f; return rest; }); };
  const done = saved ? 5 : step;

  const choose = (s: ProviderSpec) => { setSpec(s); setStep(1); setOutcome(null); setTouched(false); setProblem(null); setServerFields({}); setUnchecked(false); };
  const next1 = () => { setTouched(true); if (!Object.keys(errors).length) { setStep(2); } };
  const test = () => {
    if (!spec) return;
    setRun("running"); setOutcome(null); setProblem(null); setUnchecked(false);
    if (live) {
      liveApi.test(spec.id, values, spec)
        .then((o) => { setOutcome(o); setEnabled(o.models.map((m) => m.id)); })
        .catch((e: unknown) => { setProblem(e instanceof Error ? e.message : "The test could not be run. Try again."); if (e instanceof ApiError && e.fields) { setServerFields(e.fields); setStep(1); setTouched(true); } })
        .finally(() => setRun("idle"));
      return;
    }
    window.setTimeout(() => { const o = sampleTest(spec, values); setOutcome(o); setEnabled(o.models.map((m) => m.id)); setRun("idle"); }, 900);
  };
  /** The provider answered and refused the credential: nothing can be registered with it. Anything else may be registered unchecked. */
  const refusedByProvider = !!outcome && outcome.verified !== false && !!outcome.steps.find((s) => s.id === "reach")?.ok && !outcome.steps.find((s) => s.id === "auth")?.ok;
  const canGoOn = !!outcome && (outcome.ok || (live && !refusedByProvider && unchecked));
  const register = () => {
    if (!spec || !outcome) return;
    if (live) {
      setBusy(true); setProblem(null);
      liveApi.register(liveOrgId(), { specId: spec.id, name: name.trim(), region, priority, models: enabled, rpm, tpm, values, acceptUnverified: !outcome.ok })
        .then((r) => { setValues({}); setWarnings(r.warnings); setSaved(r.provider); setStep(4); })
        .catch((e: unknown) => {
          setProblem(e instanceof Error ? e.message : "The provider could not be registered. Try again.");
          if (e instanceof ApiError && e.fields && Object.keys(e.fields).length) { setServerFields(e.fields); setTouched(true); setStep(1); }
        })
        .finally(() => setBusy(false));
      return;
    }
    const base = slug(name); let id = base, n = 2;
    while (all.some((p) => p.id === id)) id = `${base}-${n++}`;
    const refs = spec.fields.filter((f) => f.secret && values[f.key]?.trim()).map((f) => secretRefFor(spec, id, f.key));
    const reg: Registered = {
      id, name: name.trim() || spec.name, kind: spec.kind, icon: spec.icon, region, priority, status: "healthy", models: enabled, p50: 0, p99: 0, errorRatePct: 0, requestsPerDay: 0, spendPerDayUsd: 0,
      rpmLimit: rpm, tpmLimit: tpm, secretRef: refs[0] ?? (values["base-url"] ? "none (no credential)" : "none"), fresh: true, specId: spec.id, secretRefs: refs,
      note: "Registered just now. Nothing has been routed here yet, so there are no measurements.",
    };
    saveRegistered(reg);
    setValues({}); // the secret values leave memory here; only the references remain
    setSaved(reg); setStep(4);
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <Back href="/providers" label="Providers" />
      <PageHeader title="Register a provider" description="Connect a model provider you already pay for. The gateway then routes to it, applies your policies and records usage against your budgets." />
      <div className="flex items-center gap-3"><SampleTag /></div>
      <Stepper at={step} done={done} />

      {step === 0 && (
        <div className="space-y-5">
          <Notice tone="info" title="Use an API credential, not a chat subscription">
            Claude Pro or Max and ChatGPT Plus or Pro are chat subscriptions and do not include API access. To use those vendors here, create an API key in the vendor console, or use the vendor through your own cloud account (Amazon Bedrock, Azure OpenAI, Google Vertex AI). Usage is billed by the vendor to you, separately from the chat plan.
          </Notice>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {SPECS.map((s) => (
              <button key={s.id} onClick={() => choose(s)} className="text-left rounded-lg border border-border bg-surface p-5 hover:border-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 transition-colors">
                <div className="flex items-center gap-3 mb-3"><SpecMark spec={s} /><div><div className="text-sm font-semibold text-text-primary">{s.name}</div><div className="text-xs text-text-tertiary">{s.auth}</div></div></div>
                <p className="text-xs text-text-secondary leading-relaxed">{s.blurb}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 1 && spec && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader title={`${spec.name} credentials`} subtitle={spec.keyHelp} />
            <CardBody className="space-y-5">
              {spec.fields.map((f) => (
                <div key={f.key}>
                  <Field label={f.optional ? `${f.label} (optional)` : f.label} hint={f.hint}>
                    {f.options ? (
                      <Select value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)}>{f.options.map((o) => <option key={o}>{o}</option>)}</Select>
                    ) : f.multiline ? (
                      <textarea value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} rows={5} spellCheck={false} autoComplete="off" placeholder={f.placeholder} className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:border-accent-600" />
                    ) : (
                      <Input type={f.secret ? "password" : "text"} autoComplete="off" spellCheck={false} value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} />
                    )}
                  </Field>
                  {touched && (errors[f.key] ?? serverFields[f.key]) && <p role="alert" className="text-xs text-status-down mt-1.5">{errors[f.key] ?? serverFields[f.key]}</p>}
                </div>
              ))}
              {problem && <Notice tone="bad" title="That was not accepted">{problem}</Notice>}
              <div className="flex items-center justify-between pt-2">
                <Button variant="ghost" onClick={() => setStep(0)}><ArrowLeft size={14} /> Change provider</Button>
                <Button variant="primary" onClick={next1}>Continue <ArrowRight size={14} /></Button>
              </div>
            </CardBody>
          </Card>
          <div className="space-y-4">
            <Card><CardBody className="space-y-2 text-[13px]">
              <div className="flex items-center gap-2 font-medium text-text-primary"><Lock size={14} /> How the credential is kept</div>
              <p className="text-text-secondary">tok&sum;ner writes each secret to your secret manager and keeps only a reference such as <code className="font-mono text-xs">{secretRefFor(spec, "your-provider", spec.fields.find((f) => f.secret)?.key ?? "api-key")}</code>. The value is never displayed again, not even to administrators. To change it, register a new value.</p>
            </CardBody></Card>
            {spec.id === "bedrock" && <Notice tone="info" title="Trust policy">Allow the principal <code className="font-mono text-xs">arn:aws:iam::&lt;tokener-account&gt;:role/gateway</code> to assume the role, with the external ID above as the condition. The principal for your workspace is shown in Settings after sign-in.</Notice>}
          </div>
        </div>
      )}

      {step === 2 && spec && (
        <Card>
          <CardHeader title="Test the credential" subtitle="Four checks, in order. Nothing is saved until you register in the next step." action={<Button variant="primary" onClick={test} disabled={run === "running"}>{run === "running" ? <><Loader2 size={14} className="animate-spin" /> Testing</> : outcome ? "Run again" : "Run test"}</Button>} />
          <CardBody className="space-y-4">
            <ul className="divide-y divide-border rounded-md border border-border">
              {(outcome?.steps ?? [{ id: "reach", label: "Reach the endpoint" }, { id: "auth", label: "Authenticate" }, { id: "models", label: "List models" }, { id: "completion", label: "Run one test completion" }] as { id: string; label: string; ok?: boolean; ms?: number; detail?: string }[]).map((s) => (
                <li key={s.id} className="flex items-start gap-3 px-4 py-3">
                  {run === "running" ? <Loader2 size={16} className="animate-spin text-text-tertiary mt-0.5" /> : outcome ? (s.ok ? <CheckCircle2 size={16} className="text-status-healthy mt-0.5" /> : <XCircle size={16} className="text-status-down mt-0.5" />) : <CircleDashed size={16} className="text-text-tertiary mt-0.5" />}
                  <div className="flex-1 min-w-0"><div className="text-[13px] font-medium text-text-primary">{s.label}</div>{outcome && <div className="text-xs text-text-secondary mt-0.5">{s.detail}</div>}</div>
                  {outcome && s.ms != null && s.ok && <span className="text-xs text-text-tertiary tabular-nums">{s.ms} ms</span>}
                </li>
              ))}
            </ul>
            {problem && <Notice tone="bad" title="The test could not be run">{problem}</Notice>}
            {outcome && (outcome.ok
              ? <Notice tone="ok" title="The credential works">Checked at {outcome.ranAt}.{live ? "" : " This is a sample result: it judges the credential by its format, and a signed-in workspace makes the real calls."}</Notice>
              : refusedByProvider
                ? <Notice tone="bad" title="The provider did not accept this credential">Go back and correct it. A credential the provider refuses cannot be registered.</Notice>
                : live && outcome.verified === false
                  ? <Notice tone="warn" title="This provider cannot be checked from here yet">{spec.name} needs request signing or a token exchange that tok&sum;ner does not perform for tests. You can register it unchecked. It stays degraded, and no result is claimed, until a test passes.</Notice>
                  : live
                    ? <Notice tone="warn" title="The test did not pass">{outcome.steps.find((s) => !s.ok)?.detail} You can fix the credential, or register it unchecked. It stays degraded until a test passes.</Notice>
                    : <Notice tone="bad" title="The test did not pass">Go back and correct the credential. A failed test is not saved anywhere.</Notice>)}
            {live && outcome && !outcome.ok && !refusedByProvider && (
              <label className="flex items-start gap-3 text-[13px] text-text-primary cursor-pointer">
                <input type="checkbox" className="h-4 w-4 mt-0.5 accent-[#02F5A1]" checked={unchecked} onChange={(e) => setUnchecked(e.target.checked)} />
                <span>Register it without a passing test. I understand it is marked degraded until a test passes.</span>
              </label>
            )}
            <div className="flex items-center justify-between pt-1">
              <Button variant="ghost" onClick={() => setStep(1)}><ArrowLeft size={14} /> Credentials</Button>
              <Button variant="primary" disabled={!canGoOn} onClick={() => setStep(3)}>Continue <ArrowRight size={14} /></Button>
            </div>
          </CardBody>
        </Card>
      )}

      {step === 3 && spec && outcome && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader title="Identity and limits" subtitle="How this provider appears and how much traffic it may take" />
            <CardBody className="space-y-4">
              <Field label="Display name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Region"><Select value={region} onChange={(e) => setRegion(e.target.value)}>{spec.regions.map((r) => <option key={r}>{r}</option>)}</Select></Field>
                <Field label="Failover priority" hint="1 is tried first."><Select value={priority} onChange={(e) => setPriority(Number(e.target.value))}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field>
                <Field label="Requests per minute"><Input type="number" min={1} value={rpm} onChange={(e) => setRpm(Math.max(1, Number(e.target.value) || 1))} /></Field>
                <Field label="Tokens per minute"><Input type="number" min={1000} step={1000} value={tpm} onChange={(e) => setTpm(Math.max(1000, Number(e.target.value) || 1000))} /></Field>
              </div>
              <p className="text-xs text-text-tertiary">Set these at or below the limits your vendor gave you. The gateway stops sending before the vendor starts refusing.</p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Models to enable" subtitle="Found by the test. Only enabled models can be routed to." />
            <CardBody className="space-y-2">
              {outcome.models.map((m) => (
                <label key={m.id} className="flex items-center gap-3 rounded-md border border-border px-3.5 py-2.5 cursor-pointer hover:bg-surface-subtle">
                  <input type="checkbox" className="h-4 w-4 accent-[#02F5A1]" checked={enabled.includes(m.id)} onChange={(e) => setEnabled((x) => (e.target.checked ? [...x, m.id] : x.filter((y) => y !== m.id)))} />
                  <span className="font-mono text-sm font-medium flex-1">{m.id}</span><span className="text-xs text-text-tertiary">{m.note}</span>
                </label>
              ))}
              {!outcome.models.length && <p className="text-[13px] text-text-secondary">The test found no models to offer. Go back and check the credential.</p>}
              {!enabled.length && outcome.models.length > 0 && <p role="alert" className="text-xs text-status-down">Enable at least one model.</p>}
            </CardBody>
          </Card>
          <div className="lg:col-span-2 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep(2)}><ArrowLeft size={14} /> Test</Button>
            <div className="flex items-center gap-3">{problem && <span role="alert" className="text-xs text-status-down max-w-md text-right">{problem}</span>}<Button variant="primary" disabled={!enabled.length || !name.trim() || busy} onClick={register}>{busy ? <><Loader2 size={14} className="animate-spin" /> Registering</> : "Register provider"}</Button></div>
          </div>
        </div>
      )}

      {step === 4 && saved && (
        <div className="space-y-6">
          <Notice tone="ok" title={`${saved.name} is registered`}>The credential has been handed to your secret manager and is no longer held here. Only the reference below is kept.</Notice>
          {warnings.length > 0 && <Notice tone="warn" title="Worth a second look">{warnings.map((w) => <span key={w} className="block">{w}</span>)}</Notice>}
          <Card>
            <CardHeader title="Stored references" />
            <CardBody className="space-y-1.5">{saved.secretRefs.length ? saved.secretRefs.map((r) => <code key={r} className="block font-mono text-xs text-text-primary">{r}</code>) : <p className="text-[13px] text-text-secondary">No secret was stored for this provider.</p>}</CardBody>
          </Card>
          <Card>
            <CardHeader title="Try it" subtitle="Send one prompt through the gateway to this provider" />
            <CardBody><ProviderPlayground providerId={saved.id} models={saved.models} /></CardBody>
          </Card>
          <div className="flex items-center gap-3">
            <Link href={`/providers/${saved.id}`}><Button variant="primary">Open provider</Button></Link>
            <Link href="/providers"><Button>All providers</Button></Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RegisterProviderPage() {
  return <Suspense fallback={null}><Wizard /></Suspense>;
}
