"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import clsx from "clsx";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select, Toggle } from "@/components/ui/Form";
import { CodeBlock, GuardButton, KeyValue, Notice, useRole } from "@/components/mlops/ui";
import { toast } from "@/lib/mlops/toast";
import { useMlops } from "@/lib/mlops/store";
import { FnIcon } from "@/components/functions/FnIcon";
import { Concept, ProviderChip, TRIGGER_LABEL, useFx } from "@/components/functions/ui";
import { OwnerSelect } from "@/components/org/OrgSelect";
import { useOrgDirectory } from "@/lib/org/useOrgDirectory";
import { APPS, KAFKA_CLUSTERS, LAMBDA_REGIONS, MODELS, POLICIES, PROVIDERS, TENANTS, TIMEZONES, providerOfModel } from "@/lib/functions/catalog";
import { ALLOWED_REGISTRIES, FN_TEMPLATES, SAMPLE_CODE, checkImage, defaultGovernance, type FnTemplate } from "@/lib/functions/templates";
import { FN_NAME_RE, createFunction } from "@/lib/functions/store";
import { DATA_CLASSES, RUNTIMES, usd, type FnFunction, type FnRevision, type FnTrigger, type Governance, type Runtime, type TriggerKind } from "@/lib/functions/types";

type RuntimeChoice = Runtime | "aws-lambda";
type Source = "inline" | "archive" | "git" | "image";
type Draft = {
  template: string; name: string; description: string; tenantId: string; appId: string; owner: string; env: FnFunction["env"]; tags: string;
  runtime: RuntimeChoice; handler: string; memoryMb: number; ephemeralMb: number;
  lambda: { connectionId: string; arn: string; region: string; qualifier: string; invocation: "RequestResponse" | "Event" };
  source: Source; code: string; archiveName: string; archiveKb: number; gitUrl: string; gitRef: string; gitPath: string; image: string;
  triggers: Record<TriggerKind, boolean>;
  http: { path: string; auth: "api-key" | "jwt" | "mtls"; rate: number; sync: boolean };
  kafka: { cluster: string; topic: string; group: string; concurrency: number; startOffset: "latest" | "earliest" };
  schedule: { cron: string; tz: string; overlap: "skip" | "queue" | "allow" };
  gov: Governance; costUsd: string; dayUsd: string; weekUsd: string; approvalUsd: string; egressText: string; secretText: string;
};

const STEPS = ["Basic information", "Runtime", "Code and artifact", "Invocation", "AI permissions", "Limits and governance", "Review and deploy"] as const;
const dollars = (m: number) => String(m / 1_000_000);
const toMicros = (v: string) => Math.round(parseFloat(v || "0") * 1_000_000);
const ARN_RE = /^arn:aws:lambda:[a-z0-9-]+:\d{12}:function:[A-Za-z0-9-_]{1,64}$/;

function fromTemplate(t: FnTemplate): Pick<Draft, "runtime" | "handler" | "memoryMb" | "code" | "gov" | "costUsd" | "dayUsd" | "weekUsd" | "approvalUsd" | "egressText" | "secretText" | "triggers" | "description" | "tags"> {
  const rt = RUNTIMES.find((r) => r.id === t.runtime)!;
  const gov = defaultGovernance(t, (m) => providerOfModel(m)?.id ?? "");
  return { runtime: t.runtime, handler: rt.handler, memoryMb: rt.defaultMemory, code: SAMPLE_CODE[t.runtime], gov, costUsd: dollars(gov.maxCostMicros), dayUsd: dollars(gov.dailyBudgetMicros), weekUsd: dollars(gov.weeklyBudgetMicros), approvalUsd: "", egressText: "", secretText: "", description: t.description, tags: t.tags.join(", "), triggers: { http: t.triggers.includes("http"), kafka: t.triggers.includes("kafka"), schedule: t.triggers.includes("schedule") } };
}

function initial(): Draft {
  const t = FN_TEMPLATES[0];
  return {
    template: t.id, name: "", tenantId: TENANTS[0].id, appId: APPS[0].id, owner: "", env: "staging", ...fromTemplate(t), ephemeralMb: 512,
    lambda: { connectionId: "", arn: "", region: LAMBDA_REGIONS[0], qualifier: "prod", invocation: "RequestResponse" },
    source: "inline", archiveName: "", archiveKb: 0, gitUrl: "", gitRef: "main", gitPath: "/", image: "",
    http: { path: "", auth: "api-key", rate: 120, sync: true }, kafka: { cluster: KAFKA_CLUSTERS[0], topic: "", group: "", concurrency: 5, startOffset: "latest" }, schedule: { cron: "0 6 * * *", tz: "UTC", overlap: "skip" },
  };
}

export function CreateWizard() {
  const router = useRouter(); const role = useRole();
  const fx = useFx();
  const ml = useMlops();
  const { dir } = useOrgDirectory();
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(initial);
  const [shown, setShown] = useState<Record<number, boolean>>({});
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const setGov = (p: Partial<Governance>) => setD((x) => ({ ...x, gov: { ...x.gov, ...p } }));
  const lambdaConns = (ml?.connections ?? []).filter((c) => c.integrationId === "aws-lambda");
  const isLambda = d.runtime === "aws-lambda";
  const apps = APPS.filter((a) => a.tenantId === d.tenantId);
  const external = d.gov.allowedProviders.some((id) => PROVIDERS.find((p) => p.id === id)?.external);

  const errors = useMemo(() => {
    const e: string[][] = STEPS.map(() => []);
    if (!FN_NAME_RE.test(d.name)) e[0].push("Name: use 3 to 48 characters, lowercase letters, digits and hyphens, starting with a letter.");
    else if (fx.functions.some((f) => f.name === d.name && f.tenantId === d.tenantId)) e[0].push(`Name: ${d.name} already exists in this tenant.`);
    if (!d.description.trim()) e[0].push("Description: say what the function does so others can find it.");
    if (!apps.some((a) => a.id === d.appId)) e[0].push("App: choose an app in the selected tenant.");
    if (!d.owner.trim()) e[0].push("Owner: choose who answers for this function.");
    if (!d.handler.trim() && !isLambda) e[1].push("Handler is required.");
    if (isLambda) {
      if (!d.lambda.connectionId) e[1].push("Choose an AWS Lambda connection. Create one in Integrations if the list is empty.");
      if (!ARN_RE.test(d.lambda.arn)) e[1].push("Function ARN must look like arn:aws:lambda:<region>:<12-digit account>:function:<name>.");
      else if (d.lambda.arn.split(":")[3] !== d.lambda.region) e[1].push("The region in the ARN does not match the selected region.");
    }
    if (d.memoryMb < 128 || d.memoryMb > 10240) e[1].push("Memory must be between 128 and 10240 MB.");
    if (!isLambda) {
      if (d.source === "inline" && d.code.trim().length < 10) e[2].push("Code: add a handler, or choose another source.");
      if (d.source === "archive" && !d.archiveName) e[2].push("Archive: choose a .zip file.");
      if (d.source === "archive" && d.archiveKb > 50 * 1024) e[2].push("Archive: the file is over the 50 MB limit. Use a container image for larger packages.");
      if (d.source === "git" && !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\.git)?$/.test(d.gitUrl)) e[2].push("Git: use an https://github.com/<org>/<repo> address.");
      if (d.source === "image") { const m = checkImage(d.image); if (m) e[2].push(`Image: ${m}`); }
      if (d.runtime === "container" && d.source !== "image") e[2].push("A container runtime needs an image source.");
    }
    if (!d.triggers.http && !d.triggers.kafka && !d.triggers.schedule) e[3].push("Choose at least one way to start the function.");
    if (d.triggers.http && d.http.path && !d.http.path.startsWith("/")) e[3].push("HTTP: the path must start with a slash.");
    if (d.triggers.kafka && !/^[a-zA-Z0-9._-]{1,249}$/.test(d.kafka.topic)) e[3].push("Kafka: enter a valid topic name.");
    if (d.triggers.kafka && !d.kafka.group.trim()) e[3].push("Kafka: a consumer group is required.");
    if (d.triggers.kafka && (d.kafka.concurrency < 1 || d.kafka.concurrency > d.gov.maxConcurrency)) e[3].push(`Kafka: concurrency must be 1 to ${d.gov.maxConcurrency} (the function limit).`);
    if (d.triggers.schedule && d.schedule.cron.trim().split(/\s+/).length !== 5) e[3].push("Schedule: a cron expression has five fields.");
    if (d.gov.allowedModels.length > 0 && d.gov.allowedProviders.length === 0) e[4].push("Allow a provider for the chosen models.");
    if (d.gov.dataClass === "restricted" && external && d.gov.policyIds.includes("pol-residency")) e[4].push("Restricted data may not use an external provider while the data residency policy is attached. Choose in-house providers.");
    if (external && d.gov.dataClass !== "public" && !d.gov.piiRedaction) e[4].push("Turn on personal data redaction before sending non-public data to an external provider.");
    if (d.gov.egress === "allowlist" && !d.egressText.trim()) e[4].push("Add at least one allowed host, or set network egress to None.");
    for (const r of d.secretText.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean)) if (!/^secretref:\/\/[a-z0-9/_-]+$/i.test(r)) { e[4].push(`Secret "${r.slice(0, 24)}" is not a reference. Use secretref://vault/team/name and never paste a secret.`); break; }
    if (toMicros(d.dayUsd) < toMicros(d.costUsd)) e[5].push("The daily budget must be at least the per-call cost ceiling.");
    if (toMicros(d.weekUsd) < toMicros(d.dayUsd)) e[5].push("The weekly budget must be at least the daily budget.");
    if (d.gov.timeoutS < 1 || d.gov.timeoutS > 900) e[5].push("Timeout must be 1 to 900 seconds.");
    if (d.gov.retries.max < 0 || d.gov.retries.max > 5) e[5].push("Retries must be 0 to 5.");
    if (d.gov.maxConcurrency < 1 || d.gov.maxConcurrency > 200) e[5].push("Concurrency must be 1 to 200.");
    if (d.triggers.kafka && !d.gov.deadLetter && d.gov.retries.max > 0) e[5].push("Name a dead-letter topic so records that fail every retry are kept.");
    return e;
  }, [d, fx.functions, apps, isLambda, external]);

  const firstBad = errors.findIndex((x) => x.length > 0);
  const next = () => { setShown((x) => ({ ...x, [step]: true })); if (errors[step].length === 0) setStep(step + 1); };
  const go = (i: number) => { if (i <= step) setStep(i); else if (errors.slice(0, i).every((x) => x.length === 0)) setStep(i); else { const b = errors.slice(0, i).findIndex((x) => x.length > 0); setShown((x) => ({ ...x, [b]: true })); setStep(b); } };

  const applyTemplate = (id: string) => { const t = FN_TEMPLATES.find((x) => x.id === id)!; setD((x) => ({ ...x, template: id, ...fromTemplate(t) })); };
  const setRuntime = (r: RuntimeChoice) => {
    if (r === "aws-lambda") return set({ runtime: r, handler: "", memoryMb: 256, source: "inline" });
    const rt = RUNTIMES.find((x) => x.id === r)!;
    set({ runtime: r, handler: rt.handler, memoryMb: rt.defaultMemory, code: SAMPLE_CODE[r], source: r === "container" ? "image" : d.source === "image" ? "inline" : d.source });
  };

  const submit = (deploy: boolean) => {
    if (firstBad >= 0) { setStep(firstBad); setShown((x) => ({ ...x, [firstBad]: true })); return; }
    const gov: Governance = {
      ...d.gov, maxCostMicros: toMicros(d.costUsd), dailyBudgetMicros: toMicros(d.dayUsd), weeklyBudgetMicros: toMicros(d.weekUsd), approvalAboveMicros: d.approvalUsd === "" ? null : toMicros(d.approvalUsd),
      egressAllow: d.gov.egress === "none" ? [] : d.egressText.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean), secretRefs: d.secretText.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean),
      allowedModels: d.gov.allowedModels.filter((m) => d.gov.allowedProviders.includes(MODELS.find((x) => x.id === m)!.providerId)),
    };
    const trig: Omit<FnTrigger, "id" | "fnId">[] = [];
    if (d.triggers.http) trig.push({ kind: "http", enabled: true, name: "Invoke over HTTPS", http: { method: "POST", path: d.http.path || `/v1/functions/${d.name}/invocations`, auth: d.http.auth, rateLimitPerMin: d.http.rate, idempotencyHeader: "Idempotency-Key", cors: [], maxBodyKb: 256, sync: d.http.sync } });
    if (d.triggers.kafka) trig.push({ kind: "kafka", enabled: true, name: `Consume ${d.kafka.topic}`, kafka: { cluster: d.kafka.cluster, topic: d.kafka.topic, group: d.kafka.group, startOffset: d.kafka.startOffset, batchSize: 1, concurrency: d.kafka.concurrency, dlqTopic: gov.deadLetter ?? `${d.kafka.topic}.dlq`, maxLagAlert: 500, format: "json" } });
    if (d.triggers.schedule) trig.push({ kind: "schedule", enabled: true, name: `Schedule ${d.schedule.cron}`, schedule: { cron: d.schedule.cron, timezone: d.schedule.tz, overlap: d.schedule.overlap, catchUp: false, jitterS: 30, humanReadable: d.schedule.cron } });
    const artifact: FnRevision["artifact"] = isLambda ? { kind: "lambda-arn", ref: `${d.lambda.arn}:${d.lambda.qualifier}`, sizeKb: 0, digest: "sha256:pending" }
      : d.source === "inline" ? { kind: "inline", ref: "inline handler", sizeKb: Math.ceil(d.code.length / 1024), digest: "sha256:pending" } : d.source === "archive" ? { kind: "archive", ref: d.archiveName, sizeKb: d.archiveKb, digest: "sha256:pending" }
        : d.source === "git" ? { kind: "git", ref: `${d.gitUrl.replace("https://", "")}@${d.gitRef}`, sizeKb: 0, digest: "sha256:pending" } : { kind: "image", ref: d.image, sizeKb: 0, digest: d.image.split("@")[1] };
    const r = createFunction({
      name: d.name, description: d.description, tenantId: d.tenantId, appId: d.appId, owner: d.owner, env: d.env, runtime: isLambda ? "aws-lambda" : (d.runtime as Runtime), handler: isLambda ? d.lambda.arn.split(":").pop()! : d.handler, memoryMb: d.memoryMb, ephemeralMb: d.ephemeralMb,
      tags: d.tags.split(",").map((x) => x.trim()).filter(Boolean), artifact, governance: gov, triggers: trig, lambda: isLambda ? d.lambda : undefined, deploy,
    });
    if (!r.ok) { setSubmitErr(r.error); return; }
    toast(deploy ? `${d.name} created and a simulated deployment was recorded. Nothing was deployed.` : `${d.name} saved as a draft.`, "info");
    router.push(`/mlops/functions/${r.id}`);
  };

  const err = (i: number) => shown[i] && errors[i].length > 0 && <div className="mt-4"><Notice tone="bad" title="Fix before continuing"><ul className="list-disc pl-4 space-y-0.5">{errors[i].map((m) => <li key={m}>{m}</li>)}</ul></Notice></div>;
  const toggleIn = (k: "allowedProviders" | "allowedModels" | "policyIds", id: string) => setGov({ [k]: d.gov[k].includes(id) ? d.gov[k].filter((y) => y !== id) : [...d.gov[k], id] } as Partial<Governance>);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">New function</h1>
        <p className="text-sm text-text-secondary mt-1 max-w-2xl">Seven steps from a name to a governed deployment. Nothing is deployed in the design preview. The result is a draft or a simulated deployment record.</p>
      </div>
      <ol className="flex gap-1 overflow-x-auto pb-1" aria-label="Steps">
        {STEPS.map((s, i) => {
          const done = i < step && errors[i].length === 0; const on = i === step;
          return (
            <li key={s}>
              <button onClick={() => go(i)} aria-current={on ? "step" : undefined} className={clsx("h-9 px-3 inline-flex items-center gap-2 rounded-md text-[13px] font-medium whitespace-nowrap border", on ? "bg-emph text-on-emph border-transparent" : "border-border text-text-secondary hover:bg-surface-muted")}>
                <span className={clsx("grid place-items-center h-5 w-5 rounded-full text-[11px]", on ? "bg-white/15" : done ? "bg-accent-600 text-white" : "bg-surface-muted")}>{done ? <Check size={11} /> : i + 1}</span>{s}
              </button>
            </li>
          );
        })}
      </ol>

      {step === 0 && (
        <Card>
          <CardHeader title="Basic information" subtitle="Start from a use case or from scratch. A starter fills sensible defaults you can change in every step." />
          <div className="px-5 py-4 space-y-5">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3" role="radiogroup" aria-label="Starter">
              {FN_TEMPLATES.map((t) => (
                <button key={t.id} role="radio" aria-checked={d.template === t.id} onClick={() => applyTemplate(t.id)} className={clsx("text-left rounded-lg border p-3.5 transition-colors", d.template === t.id ? "border-accent-600 bg-accent-500/5" : "border-border hover:bg-surface-subtle")}>
                  <div className="text-[13px] font-medium">{t.label}</div><div className="text-xs text-text-secondary mt-1">{t.summary}</div>
                </button>
              ))}
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Name" hint="Lowercase letters, digits and hyphens. It becomes part of the endpoint."><Input value={d.name} onChange={(e) => set({ name: e.target.value.toLowerCase() })} placeholder="fraud-score" className="font-code" /></Field>
              <OwnerSelect value={d.owner} onChange={(v) => set({ owner: v })} hint="Receives alerts when this function fails or hits a budget." />
              <div className="sm:col-span-2"><Field label="Description"><Input value={d.description} onChange={(e) => set({ description: e.target.value })} placeholder="What it does, in one sentence" /></Field></div>
              <Field label="Tenant"><Select value={d.tenantId} onChange={(e) => set({ tenantId: e.target.value, appId: APPS.find((a) => a.tenantId === e.target.value)?.id ?? "" })}>{(dir.tenants.length ? dir.tenants : TENANTS).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
              <Field label="App" hint={apps.length ? "Cost and usage are attributed to this app." : "No app is registered under this tenant yet, so a function cannot be placed here."}><Select value={d.appId} disabled={apps.length === 0} onChange={(e) => set({ appId: e.target.value })}>{apps.length === 0 && <option value="">No apps yet</option>}{apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
              <Field label="Environment"><Select value={d.env} onChange={(e) => set({ env: e.target.value as Draft["env"] })}><option value="development">Development</option><option value="staging">Staging</option><option value="production">Production</option></Select></Field>
              <Field label="Tags" hint="Comma separated."><Input value={d.tags} onChange={(e) => set({ tags: e.target.value })} /></Field>
            </div>
          </div>
          {err(0) && <div className="px-5 pb-4">{err(0)}</div>}
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardHeader title="Runtime" subtitle="Where the code runs. AWS Lambda keeps the code in your AWS account and calls it through a governed connector." />
          <div className="px-5 py-4 space-y-5">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3" role="radiogroup" aria-label="Runtime">
              {RUNTIMES.map((r) => (
                <button key={r.id} role="radio" aria-checked={d.runtime === r.id} onClick={() => setRuntime(r.id)} className={clsx("text-left rounded-lg border p-3.5", d.runtime === r.id ? "border-accent-600 bg-accent-500/5" : "border-border hover:bg-surface-subtle")}>
                  <div className="text-[13px] font-medium">{r.label}</div><div className="text-xs text-text-secondary mt-1">{r.note}</div>
                </button>
              ))}
              <button role="radio" aria-checked={isLambda} onClick={() => setRuntime("aws-lambda")} className={clsx("text-left rounded-lg border p-3.5", isLambda ? "border-accent-600 bg-accent-500/5" : "border-border hover:bg-surface-subtle")}>
                <div className="text-[13px] font-medium">AWS Lambda connector</div><div className="text-xs text-text-secondary mt-1">Call an existing Lambda function. tok∑ner adds policy, limits and attribution.</div>
              </button>
            </div>
            {isLambda ? (
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Connection" hint={lambdaConns.length ? "AWS Lambda connections in this workspace." : undefined}>
                  <Select value={d.lambda.connectionId} onChange={(e) => set({ lambda: { ...d.lambda, connectionId: e.target.value } })}><option value="">Choose a connection</option>{lambdaConns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
                </Field>
                <div className="text-xs text-text-tertiary self-end pb-2">{lambdaConns.length === 0 ? <>No AWS Lambda connection yet. <Link href="/mlops/integrations" className="underline">Create one in Integrations</Link>.</> : <>Roles and keys are held as references, never typed here.</>}</div>
                <div className="sm:col-span-2"><Field label="Function ARN"><Input value={d.lambda.arn} onChange={(e) => set({ lambda: { ...d.lambda, arn: e.target.value.trim() } })} placeholder="arn:aws:lambda:me-central-1:111122223333:function:limits-check" className="font-code" /></Field></div>
                <Field label="Region"><Select value={d.lambda.region} onChange={(e) => set({ lambda: { ...d.lambda, region: e.target.value } })}>{LAMBDA_REGIONS.map((r) => <option key={r}>{r}</option>)}</Select></Field>
                <Field label="Qualifier" hint="A version or alias. Use an alias such as prod, not $LATEST."><Input value={d.lambda.qualifier} onChange={(e) => set({ lambda: { ...d.lambda, qualifier: e.target.value } })} /></Field>
                <Field label="Invocation type"><Select value={d.lambda.invocation} onChange={(e) => set({ lambda: { ...d.lambda, invocation: e.target.value as "RequestResponse" | "Event" } })}><option value="RequestResponse">Wait for the result</option><option value="Event">Asynchronous, fire and forget</option></Select></Field>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Handler" hint={`For example ${RUNTIMES.find((r) => r.id === d.runtime)?.handler}`}><Input value={d.handler} onChange={(e) => set({ handler: e.target.value })} className="font-code" /></Field>
                <div />
                <Field label="Memory (MB)" hint="128 to 10240. CPU scales with memory."><Input type="number" min={128} max={10240} step={64} value={d.memoryMb} onChange={(e) => set({ memoryMb: +e.target.value })} /></Field>
                <Field label="Ephemeral storage (MB)"><Input type="number" min={512} max={10240} step={256} value={d.ephemeralMb} onChange={(e) => set({ ephemeralMb: +e.target.value })} /></Field>
              </div>
            )}
          </div>
          {err(1) && <div className="px-5 pb-4">{err(1)}</div>}
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader title="Code and artifact" subtitle={isLambda ? "Nothing to upload. The code stays in your AWS account." : "Each save creates an immutable revision with a digest."} />
          <div className="px-5 py-4 space-y-4">
            {isLambda ? <Notice tone="info">The revision records the function ARN and qualifier. tok∑ner never copies or builds Lambda code.</Notice> : (
              <>
                <div className="inline-flex rounded-md border border-border-strong p-0.5 bg-surface-subtle" role="tablist" aria-label="Source">
                  {([["inline", "Inline code"], ["archive", "Archive (.zip)"], ["git", "Git repository"], ["image", "Container image"]] as [Source, string][]).map(([k, l]) => (
                    <button key={k} role="tab" aria-selected={d.source === k} disabled={d.runtime === "container" && k !== "image"} onClick={() => set({ source: k })} className={clsx("h-8 px-3 rounded text-[13px] font-medium disabled:opacity-40", d.source === k ? "bg-surface shadow-card" : "text-text-secondary")}>{l}</button>
                  ))}
                </div>
                {d.source === "inline" && <div><label className="block text-[13px] font-medium mb-1.5" htmlFor="code">Handler code</label><textarea id="code" value={d.code} onChange={(e) => set({ code: e.target.value })} rows={14} spellCheck={false} className="w-full rounded-md border border-border-strong bg-ink-800 text-[#D8E4E2] px-3 py-2.5 text-[12px] font-code leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent-500/40" /><p className="text-xs text-text-tertiary mt-1.5">The client in the sample calls models through the gateway, so policy and usage are applied. <Concept>The client library is a design</Concept></p></div>}
                {d.source === "archive" && (
                  <div className="space-y-2">
                    <Field label="Archive" hint="A .zip with your handler and dependencies, up to 50 MB."><input type="file" accept=".zip" aria-label="Archive" onChange={(e) => { const f = e.target.files?.[0]; set({ archiveName: f?.name ?? "", archiveKb: f ? Math.ceil(f.size / 1024) : 0 }); }} className="block text-sm" /></Field>
                    {d.archiveName && <p className="text-xs text-text-secondary">{d.archiveName}, {d.archiveKb.toLocaleString("en-US")} KB. The file is read in your browser only. It is not uploaded in the preview.</p>}
                  </div>
                )}
                {d.source === "git" && (
                  <div className="grid sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-3"><Field label="Repository"><Input value={d.gitUrl} onChange={(e) => set({ gitUrl: e.target.value.trim() })} placeholder="https://github.com/nexi-labs/fraud-score" /></Field></div>
                    <Field label="Branch, tag or commit"><Input value={d.gitRef} onChange={(e) => set({ gitRef: e.target.value })} /></Field><Field label="Path in the repository"><Input value={d.gitPath} onChange={(e) => set({ gitPath: e.target.value })} /></Field>
                  </div>
                )}
                {d.source === "image" && (
                  <div className="space-y-2">
                    <Field label="Image reference" hint={`Allowed registries: ${ALLOWED_REGISTRIES.join(", ")}. Pin by digest. Images must be signed.`}><Input value={d.image} onChange={(e) => set({ image: e.target.value.trim() })} placeholder="registry.nexi.example/lending/invoice-ocr@sha256:..." className="font-code" /></Field>
                    <Notice tone="info">An unsigned image is rejected at deploy time. This is how invoice-ocr-beta in the sample workspace ended up Failed.</Notice>
                  </div>
                )}
              </>
            )}
          </div>
          {err(2) && <div className="px-5 pb-4">{err(2)}</div>}
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader title="Invocation" subtitle="How the function starts. Choose any mix." />
          <div className="px-5 py-4 space-y-4">
            <Notice tone="info">These describe the planned contracts. In this preview no endpoint, consumer or scheduler is running. <Concept>Conceptual</Concept></Notice>
            {(["http", "kafka", "schedule"] as TriggerKind[]).map((k) => (
              <div key={k} className="rounded-lg border border-border">
                <div className="flex items-center justify-between px-4"><div className="flex items-center gap-2 py-3"><FnIcon name={k === "http" ? "http" : k === "kafka" ? "event" : "schedule"} size={17} /><span className="text-[13px] font-medium">{TRIGGER_LABEL[k]}</span></div>
                  <Toggle checked={d.triggers[k]} onChange={(v) => set({ triggers: { ...d.triggers, [k]: v } })} label={`${TRIGGER_LABEL[k]} trigger`} /></div>
                {d.triggers[k] && (
                  <div className="px-4 pb-4 pt-1 grid sm:grid-cols-2 gap-4 border-t border-border">
                    {k === "http" && (<>
                      <Field label="Path" hint="Defaults to the function name."><Input value={d.http.path || `/v1/functions/${d.name || "name"}/invocations`} onChange={(e) => set({ http: { ...d.http, path: e.target.value } })} className="font-code" onFocus={() => !d.http.path && set({ http: { ...d.http, path: `/v1/functions/${d.name || "name"}/invocations` } })} /></Field>
                      <Field label="Authentication"><Select value={d.http.auth} onChange={(e) => set({ http: { ...d.http, auth: e.target.value as Draft["http"]["auth"] } })}><option value="api-key">API key</option><option value="jwt">JWT bearer</option><option value="mtls">Mutual TLS</option></Select></Field>
                      <Field label="Rate limit per minute"><Input type="number" min={1} value={d.http.rate} onChange={(e) => set({ http: { ...d.http, rate: +e.target.value } })} /></Field>
                      <div className="self-end"><Toggle checked={d.http.sync} onChange={(v) => set({ http: { ...d.http, sync: v } })} label="Wait for the result" description="Off returns 202 and an execution id." /></div>
                    </>)}
                    {k === "kafka" && (<>
                      <Field label="Cluster"><Select value={d.kafka.cluster} onChange={(e) => set({ kafka: { ...d.kafka, cluster: e.target.value } })}>{KAFKA_CLUSTERS.map((c) => <option key={c}>{c}</option>)}</Select></Field>
                      <Field label="Topic"><Input value={d.kafka.topic} onChange={(e) => set({ kafka: { ...d.kafka, topic: e.target.value, group: d.kafka.group || `tokener-fn-${d.name || "name"}` } })} placeholder="payments.authorised" className="font-code" /></Field>
                      <Field label="Consumer group"><Input value={d.kafka.group} onChange={(e) => set({ kafka: { ...d.kafka, group: e.target.value } })} className="font-code" /></Field>
                      <Field label="Start at"><Select value={d.kafka.startOffset} onChange={(e) => set({ kafka: { ...d.kafka, startOffset: e.target.value as "latest" | "earliest" } })}><option value="latest">Latest</option><option value="earliest">Earliest</option></Select></Field>
                      <Field label="Concurrency" hint={`Up to ${d.gov.maxConcurrency}, the function limit.`}><Input type="number" min={1} value={d.kafka.concurrency} onChange={(e) => set({ kafka: { ...d.kafka, concurrency: +e.target.value } })} /></Field>
                    </>)}
                    {k === "schedule" && (<>
                      <Field label="Cron expression" hint="Five fields. 0 6 * * * is every day at 06:00."><Input value={d.schedule.cron} onChange={(e) => set({ schedule: { ...d.schedule, cron: e.target.value } })} className="font-code" /></Field>
                      <Field label="Time zone"><Select value={d.schedule.tz} onChange={(e) => set({ schedule: { ...d.schedule, tz: e.target.value } })}>{TIMEZONES.map((z) => <option key={z}>{z}</option>)}</Select></Field>
                      <Field label="If the last run is still going"><Select value={d.schedule.overlap} onChange={(e) => set({ schedule: { ...d.schedule, overlap: e.target.value as Draft["schedule"]["overlap"] } })}><option value="skip">Skip this run</option><option value="queue">Queue it</option><option value="allow">Run both</option></Select></Field>
                    </>)}
                  </div>
                )}
              </div>
            ))}
          </div>
          {err(3) && <div className="px-5 pb-4">{err(3)}</div>}
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader title="AI permissions" subtitle="Deny by default. The function may call only what you allow here." />
          <div className="px-5 py-4 space-y-5">
            <div className="grid sm:grid-cols-2 gap-5">
              <fieldset><legend className="text-[13px] font-medium mb-2">Providers</legend>{PROVIDERS.map((p) => <label key={p.id} className="flex items-center gap-2 py-1 text-[13px]"><input type="checkbox" checked={d.gov.allowedProviders.includes(p.id)} onChange={() => toggleIn("allowedProviders", p.id)} /><ProviderChip id={p.id} /><span className="text-xs text-text-tertiary">{p.external ? "external" : "in-house"}</span></label>)}</fieldset>
              <fieldset><legend className="text-[13px] font-medium mb-2">Models</legend>{MODELS.filter((m) => d.gov.allowedProviders.includes(m.providerId)).map((m) => <label key={m.id} className="flex items-center gap-2 py-1 text-[13px]"><input type="checkbox" checked={d.gov.allowedModels.includes(m.id)} onChange={() => toggleIn("allowedModels", m.id)} />{m.name}</label>)}{d.gov.allowedProviders.length === 0 && <p className="text-xs text-text-tertiary">No provider allowed: the function cannot call a model.</p>}</fieldset>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Data class" hint="Decides which providers and policies apply."><Select value={d.gov.dataClass} onChange={(e) => setGov({ dataClass: e.target.value as Governance["dataClass"] })}>{DATA_CLASSES.map((x) => <option key={x}>{x}</option>)}</Select></Field>
              <Field label="Network egress"><Select value={d.gov.egress} onChange={(e) => setGov({ egress: e.target.value as Governance["egress"] })}><option value="none">None</option><option value="allowlist">Allowlist</option></Select></Field>
              {d.gov.egress === "allowlist" && <div className="sm:col-span-2"><Field label="Allowed hosts" hint="One per line."><textarea value={d.egressText} onChange={(e) => set({ egressText: e.target.value })} rows={3} className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm font-code" /></Field></div>}
              <div className="sm:col-span-2"><Toggle checked={d.gov.piiRedaction} onChange={(v) => setGov({ piiRedaction: v })} label="Redact personal data in prompts" description="Required before non-public data goes to an external provider." /></div>
              <div className="sm:col-span-2"><Field label="Secret references" hint="One per line. References only, such as secretref://vault/team/name. Never paste a secret."><textarea value={d.secretText} onChange={(e) => set({ secretText: e.target.value })} rows={2} className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm font-code" /></Field></div>
              <div className="sm:col-span-2"><Field label="Tools the function may call" hint="Comma separated MCP tool names, for example watchlist.search."><Input value={d.gov.tools.join(", ")} onChange={(e) => setGov({ tools: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} className="font-code" /></Field></div>
            </div>
          </div>
          {err(4) && <div className="px-5 pb-4">{err(4)}</div>}
        </Card>
      )}

      {step === 5 && (
        <Card>
          <CardHeader title="Limits and governance" subtitle="Hard stops and the policies that run on every call." />
          <div className="px-5 py-4 space-y-5">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Field label="Max input tokens"><Input type="number" min={0} value={d.gov.maxInputTokens} onChange={(e) => setGov({ maxInputTokens: +e.target.value })} /></Field>
              <Field label="Max output tokens"><Input type="number" min={0} value={d.gov.maxOutputTokens} onChange={(e) => setGov({ maxOutputTokens: +e.target.value })} /></Field>
              <Field label="Cost ceiling per call (USD)"><Input type="number" min={0} step="0.0001" value={d.costUsd} onChange={(e) => set({ costUsd: e.target.value })} /></Field>
              <Field label="Daily budget (USD)"><Input type="number" min={0} step="0.01" value={d.dayUsd} onChange={(e) => set({ dayUsd: e.target.value })} /></Field>
              <Field label="Weekly budget (USD)"><Input type="number" min={0} step="0.01" value={d.weekUsd} onChange={(e) => set({ weekUsd: e.target.value })} /></Field>
              <Field label="Approval needed above (USD)" hint="Empty for none."><Input type="number" min={0} step="0.0001" value={d.approvalUsd} onChange={(e) => set({ approvalUsd: e.target.value })} /></Field>
              <Field label="Timeout (seconds)"><Input type="number" min={1} max={900} value={d.gov.timeoutS} onChange={(e) => setGov({ timeoutS: +e.target.value })} /></Field>
              <Field label="Invocations per minute"><Input type="number" min={1} value={d.gov.invocationsPerMinute} onChange={(e) => setGov({ invocationsPerMinute: +e.target.value })} /></Field>
              <Field label="Invocations per day"><Input type="number" min={1} value={d.gov.dailyInvocationCap} onChange={(e) => setGov({ dailyInvocationCap: +e.target.value })} /></Field>
              <Field label="Max concurrency"><Input type="number" min={1} max={200} value={d.gov.maxConcurrency} onChange={(e) => setGov({ maxConcurrency: +e.target.value })} /></Field>
              <Field label="Retries"><Input type="number" min={0} max={5} value={d.gov.retries.max} onChange={(e) => setGov({ retries: { ...d.gov.retries, max: +e.target.value } })} /></Field>
              <Field label="Backoff"><Select value={d.gov.retries.backoff} onChange={(e) => setGov({ retries: { ...d.gov.retries, backoff: e.target.value as "fixed" | "exponential" } })}><option value="exponential">Exponential</option><option value="fixed">Fixed</option></Select></Field>
              <Field label="Dead-letter topic" hint="For Kafka triggers."><Input value={d.gov.deadLetter ?? ""} onChange={(e) => setGov({ deadLetter: e.target.value || null })} className="font-code" /></Field>
              <Field label="Payload logging"><Select value={d.gov.logPayloads} onChange={(e) => setGov({ logPayloads: e.target.value as Governance["logPayloads"] })}><option value="none">None</option><option value="metadata">Metadata only</option><option value="redacted">Redacted</option></Select></Field>
            </div>
            <fieldset>
              <legend className="text-[13px] font-medium mb-2">Policies</legend>
              <div className="grid sm:grid-cols-2 gap-2">
                {POLICIES.map((p) => <label key={p.id} className={clsx("flex items-start gap-2.5 rounded-md border border-border p-3 text-[13px]", p.status === "draft" && "opacity-55")}><input type="checkbox" className="mt-0.5" disabled={p.status === "draft"} checked={d.gov.policyIds.includes(p.id)} onChange={() => toggleIn("policyIds", p.id)} /><span><span className="font-medium">{p.name}</span> <Badge tone={p.mode === "enforce" ? "healthy" : "neutral"}>{p.mode}</Badge><span className="block text-xs text-text-tertiary mt-0.5">{p.description}</span></span></label>)}
              </div>
            </fieldset>
          </div>
          {err(5) && <div className="px-5 pb-4">{err(5)}</div>}
        </Card>
      )}

      {step === 6 && (
        <div className="space-y-4">
          {firstBad >= 0 && <Notice tone="bad" title={`Step ${firstBad + 1} needs attention`}>{errors[firstBad][0]} <button className="underline" onClick={() => { setShown((x) => ({ ...x, [firstBad]: true })); setStep(firstBad); }}>Go to {STEPS[firstBad]}</button></Notice>}
          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader title="Review" />
              <div className="px-5 py-4 space-y-5">
                <KeyValue rows={[
                  ["Name", <span key="n" className="font-code">{d.name || "not set"}</span>], ["Description", d.description || "not set"], ["Tenant and app", `${TENANTS.find((t) => t.id === d.tenantId)?.name}, ${APPS.find((a) => a.id === d.appId)?.name}`], ["Environment", d.env],
                  ["Runtime", isLambda ? `AWS Lambda, ${d.lambda.arn || "no ARN"}:${d.lambda.qualifier}` : `${RUNTIMES.find((r) => r.id === d.runtime)?.label}, ${d.memoryMb} MB`],
                  ["Source", isLambda ? "Existing Lambda function" : d.source === "inline" ? "Inline code" : d.source === "archive" ? d.archiveName : d.source === "git" ? `${d.gitUrl}@${d.gitRef}` : d.image],
                  ["Triggers", (Object.keys(d.triggers) as TriggerKind[]).filter((k) => d.triggers[k]).map((k) => TRIGGER_LABEL[k]).join(", ") || "none"],
                  ["Providers", d.gov.allowedProviders.map((id) => PROVIDERS.find((p) => p.id === id)?.name).join(", ") || "none"], ["Models", d.gov.allowedModels.map((id) => MODELS.find((m) => m.id === id)?.name).join(", ") || "none"],
                  ["Data class", d.gov.dataClass], ["Limits", `${d.gov.maxInputTokens} in, ${d.gov.maxOutputTokens} out tokens, ${usd(toMicros(d.costUsd))} per call, ${d.gov.timeoutS} s, ${d.gov.invocationsPerMinute} per minute`],
                  ["Budgets", `${usd(toMicros(d.dayUsd), 2)} a day, ${usd(toMicros(d.weekUsd), 2)} a week`], ["Policies", d.gov.policyIds.map((id) => POLICIES.find((p) => p.id === id)?.name).join(", ") || "none"],
                ]} />
                {!isLambda && d.source === "inline" && <CodeBlock code={d.code} language={d.runtime} title="Handler" maxHeight={220} />}
              </div>
            </Card>
            <Card>
              <CardHeader title="Checks" subtitle="What the platform verifies before a deployment" />
              <ul className="divide-y divide-border">
                {STEPS.slice(0, 6).map((s, i) => <li key={s} className="px-5 py-2.5 text-[13px] flex items-center justify-between"><span>{s}</span>{errors[i].length === 0 ? <Badge tone="healthy">ok</Badge> : <button onClick={() => { setShown((x) => ({ ...x, [i]: true })); setStep(i); }}><Badge tone="down">{errors[i].length} to fix</Badge></button>}</li>)}
              </ul>
              <div className="px-5 py-4 space-y-2 border-t border-border">
                {submitErr && <Notice tone="bad">{submitErr}</Notice>}
                <GuardButton action="deployment.promote" env={d.env} role={role} variant="primary" className="w-full justify-center" extraDisabled={firstBad >= 0 ? "Fix the steps marked with a problem first" : undefined} onClick={() => submit(true)}>Create and record a simulated deployment</GuardButton>
                <GuardButton action="pipeline.edit" env={d.env} role={role} className="w-full justify-center" extraDisabled={firstBad >= 0 ? "Fix the steps marked with a problem first" : undefined} onClick={() => submit(false)}>Save as draft</GuardButton>
                <p className="text-xs text-text-tertiary">A simulated deployment is a record in this session. It does not build, deploy or run anything.</p>
              </div>
            </Card>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <Link href="/mlops/functions/registry" className="text-sm text-text-secondary hover:underline">Cancel</Link>
        <div className="flex gap-2">
          <Button disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Button>
          {step < STEPS.length - 1 && <Button variant="primary" onClick={next}>Continue</Button>}
        </div>
      </div>
    </div>
  );
}
