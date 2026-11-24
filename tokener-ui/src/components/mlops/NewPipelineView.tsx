"use client";

import { useRouter } from "next/navigation";
import { FileUp, Wand2, Workflow } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Notice, useRole } from "@/components/mlops/ui";
import { can } from "@/lib/mlops/rbac";
import { mlops, useMlops } from "@/lib/mlops/store";
import { autoAssignConnections, migrateSpec } from "@/lib/mlops/spec";
import { TEMPLATES, fromTemplate } from "@/lib/mlops/templates";
import { USE_CASE_TEMPLATES } from "@/lib/mlops/usecase-templates";
import { INDUSTRY_LABELS } from "@/lib/usecases/labels";
import { toast } from "@/lib/mlops/toast";
import { usePaymentGate } from "@/components/billing/PaymentGate";
import { ENVS, ENV_LABEL, type Env } from "@/lib/mlops/types";

const LEGACY = `{
  "apiVersion": "tokener.io/v1alpha1",
  "name": "legacy-release",
  "environment": "staging",
  "steps": [
    { "id": "src", "type": "source" },
    { "id": "bld", "type": "build", "after": ["src"], "params": { "platforms": "linux/amd64" } },
    { "id": "val", "type": "validate", "after": ["bld"] }
  ]
}`;

export function NewPipelineView({ base = "/mlops/pipelines" }: { base?: string }) {
  const studio = base === "/pipeline-studio";
  const gate = usePaymentGate();
  const s = useMlops()!;
  const role = useRole();
  const router = useRouter();
  const [name, setName] = useState("");
  const [env, setEnv] = useState<Env>("staging");
  const [tpl, setTpl] = useState("release");
  const [mode, setMode] = useState<"wizard" | "edit">("wizard");
  const [legacy, setLegacy] = useState(LEGACY);
  const [notes, setNotes] = useState<string[]>([]);
  const allowed = can(role, "pipeline.edit", env);
  const all = [...TEMPLATES, ...USE_CASE_TEMPLATES];
  const picked = all.find((x) => x.id === tpl);
  const useCaseSlug = tpl.startsWith("uc-") ? tpl.slice(3) : null;

  // A use case article links here with ?template=uc-<slug>. Read it once on mount and suggest a name.
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get("template");
    if (want && all.some((x) => x.id === want)) {
      setTpl(want);
      setName((n) => n || want.replace(/^uc-/, ""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = () => gate("save", createNow);
  const createNow = async () => {
    const t = all.find((x) => x.id === tpl)!;
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    let spec = fromTemplate(tpl, env, slug || "pipeline");
    spec.metadata.description = tpl === "blank" ? "" : t.summary;
    spec = autoAssignConnections(spec, s.connections).spec;
    const r = await mlops.createPipeline(name, env, spec);
    if (!r.ok) return toast(r.error, "error");
    router.push(studio ? `${base}/${r.id}${mode === "wizard" ? "/wizard" : ""}` : `${base}/${r.id}/${mode}`);
  };

  const importLegacy = () => gate("save", importNow);
  const importNow = async () => {
    try {
      const raw = JSON.parse(legacy);
      const m = migrateSpec(raw);
      setNotes(m.notes);
      const slug = (raw.name ?? "imported").toString().toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const spec = autoAssignConnections({ ...m.spec, environment: (raw.environment as Env) ?? env }, s.connections).spec;
      const r = await mlops.createPipeline(slug, spec.environment, spec);
      if (!r.ok) return toast(r.error, "error");
      toast("Migrated to tokener.io/v1 and saved as a draft");
      router.push(studio ? `${base}/${r.id}` : `${base}/${r.id}/edit`);
    } catch (e) { setNotes([`Not valid JSON: ${(e as Error).message}`]); }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <PageHeader title="New pipeline" description="Choose a starting point and how you want to work. You can switch between the wizard and the visual builder whenever you like." />
      {!allowed.ok && <Notice tone="warn">{allowed.reason}</Notice>}
      <Card>
        <CardHeader title="Start from" />
        <CardBody className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="support-classifier-release-2" /></Field>
            <Field label="Environment"><Select value={env} onChange={(e) => setEnv(e.target.value as Env)}>{ENVS.map((e) => <option key={e} value={e}>{ENV_LABEL[e]}</option>)}</Select></Field>
          </div>
          <div role="radiogroup" aria-label="Template" className="grid sm:grid-cols-2 gap-2.5">
            {TEMPLATES.map((t) => (
              <button key={t.id} role="radio" aria-checked={tpl === t.id} onClick={() => setTpl(t.id)} className={`text-left rounded-md border p-3 ${tpl === t.id ? "border-accent-600 bg-accent-50/50" : "border-border hover:bg-surface-subtle"}`}>
                <div className="text-[13px] font-semibold">{t.title}</div><p className="text-xs text-text-secondary mt-1">{t.summary}</p><div className="mt-1.5 flex gap-1 flex-wrap">{t.tags.map((x) => <Badge key={x}>{x}</Badge>)}</div>
              </button>
            ))}
          </div>
          <Field label="Or start from an industry use case" hint="Each is the example pipeline behind an article on the site, wired from real operators.">
            <Select value={useCaseSlug ? tpl : ""} onChange={(e) => { setTpl(e.target.value || "release"); if (e.target.value && !name) setName(e.target.value.replace(/^uc-/, "")); }}>
              <option value="">Choose a use case</option>
              {Object.keys(INDUSTRY_LABELS).filter((k) => USE_CASE_TEMPLATES.some((u) => u.industry === k)).map((k) => (
                <optgroup key={k} label={INDUSTRY_LABELS[k]}>
                  {USE_CASE_TEMPLATES.filter((u) => u.industry === k).map((u) => <option key={u.id} value={u.id}>{u.title}</option>)}
                </optgroup>
              ))}
            </Select>
          </Field>
          {useCaseSlug && picked && (
            <div className="rounded-md border border-accent-600 bg-accent-50/50 p-3">
              <div className="text-[13px] font-semibold">{picked.title}</div>
              <p className="text-xs text-text-secondary mt-1">{picked.summary}</p>
              <a href={`/use-cases/${useCaseSlug}`} className="text-xs font-medium text-accent-700 hover:underline mt-1.5 inline-block">Read the use case</a>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-md border border-border-strong p-0.5 bg-surface-subtle">
              {([["wizard", "Guided wizard", Wand2], ["edit", "Visual builder", Workflow]] as const).map(([v, l, Icon]) => (
                <button key={v} onClick={() => setMode(v)} aria-pressed={mode === v} className={`h-8 px-3 rounded text-[13px] font-medium inline-flex items-center gap-1.5 ${mode === v ? "bg-surface shadow-card" : "text-text-secondary"}`}><Icon size={14} />{l}</button>
              ))}
            </div>
            <Button variant="primary" disabled={!allowed.ok || !name.trim()} title={!allowed.ok ? allowed.reason : !name.trim() ? "Give it a name" : undefined} onClick={create}>Create pipeline</Button>
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Import and migrate" subtitle="Bring a tokener.io/v1alpha1 document forward to v1" />
        <CardBody className="space-y-3">
          <textarea aria-label="Legacy pipeline JSON" value={legacy} onChange={(e) => setLegacy(e.target.value)} rows={9} className="w-full rounded-md border border-border-strong px-3 py-2 text-xs font-code focus:outline-none focus:ring-2 focus:ring-accent-500/40" />
          <Button disabled={!allowed.ok} onClick={importLegacy}><FileUp size={14} /> Migrate and open</Button>
          {notes.length > 0 && <ul className="text-xs text-text-secondary list-disc pl-4 space-y-0.5">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
          <p className="text-xs text-text-tertiary">Migration is additive and shown in full. Unknown step types are skipped and listed. Rules are in the pipeline spec document.</p>
        </CardBody>
      </Card>
    </div>
  );
}
