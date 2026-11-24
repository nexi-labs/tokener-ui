"use client";

import clsx from "clsx";
import { ArrowDown, ArrowUp, Check, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Field, Input, Select, Toggle } from "@/components/ui/Form";
import { ConnectionCode } from "@/components/mlops/ConnectionCode";
import { IconPicker } from "@/components/icons/IconPicker";
import { NodeIcon } from "@/components/studio/icons";
import { KeyValue, Notice } from "@/components/mlops/ui";
import { CodeBlock } from "@/components/mlops/Code";
import { allIntegrations } from "@/lib/mlops/catalog";
import { OPERATOR_ACTIONS, validateContract, type Contract } from "@/lib/mlops/contract";
import { AUTH_LABEL, CAPABILITY_LABEL, FAMILY_LABEL, type AuthMode, type CapabilityId, type FieldDef, type Family, type IntegrationDef, type IntegrationStatus } from "@/lib/mlops/types";
import { STATUS_LEGEND } from "@/lib/mlops/catalog";
import { saveDraft, savePublished } from "@/lib/platform/connector-catalogue";
import { AUTH_MODES, CAPABILITIES, FAMILIES, STEPS, lines, slugify, starterContract, validateDefinition } from "@/lib/platform/connector-publish";
import { INTEGRATIONS } from "@/lib/mlops/catalog";
import { publishedConnectors } from "@/lib/platform/connector-catalogue";
import type { StoredIcon } from "@/lib/icons/collection";
import { toast } from "@/lib/mlops/toast";

const txt = "w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500/40";

const SNIPPETS: { label: string; hint: string; apply: (c: Contract) => Contract }[] = [
  { label: "Discovery", hint: "List things the system holds, so people pick instead of typing.", apply: (c) => ({ ...c, discover: [...(c.discover ?? []), { kind: "items", request: { method: "GET", path: "/v1/items" }, items: "$.data", name: "$.name", example: { status: 200, json: { data: [{ name: "first" }, { name: "second" }] } } }] }) },
  { label: "Read action", hint: "Fetch something, for example a record or a metric.", apply: (c) => ({ ...c, actions: { ...(c.actions ?? {}), "read-item": { description: "Read one item by its name.", capability: "discover", mode: "read", params: [{ name: "name", type: "string", required: true }], steps: [{ name: "Read", request: { method: "GET", path: "/v1/items/{{params.name}}" }, expect: { status: [200] }, example: { status: 200, json: { name: "first", state: "active" } } }], result: { state: "$.state" } } } }) },
  { label: "Write action", hint: "Change something. It always has a plan, and a person approves it in production.", apply: (c) => ({ ...c, actions: { ...(c.actions ?? {}), deploy: { description: "Create or update the item.", capability: "deploy", mode: "write", params: [{ name: "name", type: "string", required: true }, { name: "image", type: "string", required: true }], plan: [{ action: "apply", target: { kind: "Item", name: "{{params.name}}" }, summary: "Apply {{params.name}} with image {{params.image}}", risk: "medium" }], steps: [{ name: "Apply", request: { method: "PUT", path: "/v1/items/{{params.name}}", body: { image: "{{params.image}}" } }, expect: { status: [200, 201] }, example: { status: 200, json: { name: "first", revision: 3 } } }], result: { revision: "$.revision" } } } }) },
  { label: "Observe", hint: "Say how to tell whether the thing is ready, degraded or failed.", apply: (c) => ({ ...c, observe: { request: { method: "GET", path: "/v1/items/{{params.name}}" }, absentOn: [404], state: { ready: [{ path: "$.state", equals: "active" }], failed: [{ path: "$.state", equals: "error" }] }, example: { status: 200, json: { name: "first", state: "active" } } } }) },
];

export function ConnectorWizard({ initial, editing, onDone }: { initial: IntegrationDef; editing: boolean; onDone: (publishedId?: string) => void }) {
  const [def, setDef] = useState<IntegrationDef>(initial);
  const [step, setStep] = useState(0);
  const [idTouched, setIdTouched] = useState(editing);
  const [text, setText] = useState(() => JSON.stringify(initial.contract ?? starterContract("rest"), null, 2));
  const [jsonErr, setJsonErr] = useState("");
  const [tested, setTested] = useState(false);
  const [notes, setNotes] = useState("");
  const [hosting, setHosting] = useState<"contract" | "remote">(initial.published?.hosting ?? "contract");
  const [remoteUrl, setRemoteUrl] = useState(initial.published?.remoteUrl ?? "");
  const upd = (patch: Partial<IntegrationDef>) => setDef((d) => ({ ...d, ...patch }));

  const taken = useMemo(() => [...INTEGRATIONS.map((i) => ({ id: i.id, source: "built-in" as const })), ...publishedConnectors().map((i) => ({ id: i.id, source: "published" as const }))], []);
  const current: IntegrationDef = useMemo(() => ({ ...def, contract: hosting === "contract" ? def.contract : undefined, published: def.published ? { ...def.published, hosting, remoteUrl } : { revision: 0, publishedAt: "", publishedBy: "", hosting, remoteUrl } }), [def, hosting, remoteUrl]);
  const problems = useMemo(() => validateDefinition(current, taken, editing), [current, taken, editing]);
  const here = problems.filter((p) => p.step === step);

  // Keep the stored contract in step with the editor text whenever the text parses.
  useEffect(() => {
    try { const parsed = JSON.parse(text) as Contract; setDef((d) => ({ ...d, contract: parsed })); setJsonErr(""); } catch (e) { setJsonErr((e as Error).message); }
  }, [text]);
  const setContract = (c: Contract) => setText(JSON.stringify(c, null, 2));

  const sampleInput = useMemo(() => ({
    integration: current, name: "my-" + (def.id || "connection"), env: "development" as const, scope: "nexi-ai/support-ml/development", owner: "platform@nexi.example", auth: (def.auth[0] ?? "api-token") as AuthMode,
    secretRef: def.auth[0] === "none" ? undefined : `secretref://vault/nexi/development/my-${def.id || "connection"}`, endpoint: String(def.fields.find((f) => f.key === "endpoint")?.placeholder ?? "https://api.example.com"), tlsVerify: true, permissions: "read-write" as const, settings: {},
  }), [current, def.id, def.auth, def.fields]);

  const saveDraftNow = () => { if (def.id) { saveDraft({ id: def.id, savedAt: new Date().toISOString(), step, def: current }); toast("Draft saved"); } else toast("Give the connector an identifier first", "error"); };

  const publish = () => {
    const prev = editing ? publishedConnectors().find((p) => p.id === def.id) : undefined;
    const revision = (prev?.published?.revision ?? 0) + 1;
    const meta = { revision, publishedAt: new Date().toISOString(), publishedBy: "platform admin", hosting, remoteUrl: hosting === "remote" ? remoteUrl : undefined, notes: notes.trim() || undefined };
    savePublished({ ...current, published: meta }, "platform admin", `${editing ? "Published revision " + revision : "Published"} as ${STATUS_LEGEND[def.status].label}`);
    toast(`${def.name} published. It is available in every organization's catalogue now.`);
    onDone(def.id);
  };

  const nextGuard = () => { const p = problems.filter((x) => x.step === step); if (p.length || (step === 3 && jsonErr)) { toast(jsonErr && step === 3 ? "The contract is not valid JSON yet." : p[0].message, "error"); return; } setStep(step + 1); };

  return (
    <div className="grid lg:grid-cols-[220px_1fr] gap-6">
      <ol aria-label="Publish steps" className="space-y-1 lg:sticky lg:top-4 self-start">
        {STEPS.map((t, i) => {
          const bad = problems.some((p) => p.step === i);
          return (
            <li key={t}>
              <button onClick={() => setStep(i)} aria-current={i === step ? "step" : undefined} className={clsx("w-full flex items-center gap-2.5 rounded-md px-2.5 h-9 text-left text-[13px]", i === step ? "bg-ink-800 text-text-inverse" : "text-text-secondary hover:bg-surface-muted")}>
                <span className={clsx("h-5 w-5 rounded-full grid place-items-center text-[11px] font-semibold shrink-0", i === step ? "bg-white/20" : bad ? "border border-status-degraded text-status-degraded" : i < step ? "bg-accent-600 text-ink-800" : "border border-border-strong")}>{i < step && !bad ? <Check size={11} /> : i + 1}</span>
                {t}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="space-y-4 min-w-0">
        <Card><CardBody className="space-y-5">
          {step === 0 && (
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Name *"><Input value={def.name} onChange={(e) => { upd({ name: e.target.value, ...(idTouched ? {} : { id: slugify(e.target.value) }) }); }} placeholder="NexI Warehouse" /></Field>
              <Field label="Identifier *" hint={editing ? "Fixed after publishing, because connections refer to it." : "Lowercase letters, digits and dashes. Connections refer to it, so it cannot change later."}>
                <Input value={def.id} disabled={editing} onChange={(e) => { setIdTouched(true); upd({ id: e.target.value }); }} />
              </Field>
              <Field label="Vendor or project *"><Input value={def.vendor} onChange={(e) => upd({ vendor: e.target.value })} placeholder="NexI Corp" /></Field>
              <Field label="Family *" hint="Decides where people find it and which pipeline steps list it as a target.">
                <Select value={def.family} onChange={(e) => upd({ family: e.target.value as Family })}>{FAMILIES.map((f) => <option key={f} value={f}>{FAMILY_LABEL[f]}</option>)}</Select>
              </Field>
              <div className="sm:col-span-2"><Field label="What it does *" hint="One or two sentences. This is the text on the catalogue card."><textarea className={txt} rows={2} value={def.blurb} onChange={(e) => upd({ blurb: e.target.value })} /></Field></div>
              <Field label="Versions it works with *" hint="For example NexI API 2.x. The platform still checks the real version when a connection is tested."><Input value={def.versionTarget} onChange={(e) => upd({ versionTarget: e.target.value })} /></Field>
              <IconPicker value={def.icon as StoredIcon} onChange={(v) => upd({ icon: v })} label="Icon *" hint="Shown in the catalogue, the connection wizard and on pipeline steps." />
              <div className="sm:col-span-2 space-y-2">
                <span className="block text-[13px] font-medium">Official documentation</span>
                {def.docs.map((d, i) => (
                  <div key={i} className="flex gap-2">
                    <Input aria-label="Label" placeholder="Label" value={d.label} onChange={(e) => upd({ docs: def.docs.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} />
                    <Input aria-label="Address" placeholder="https://..." value={d.url} onChange={(e) => upd({ docs: def.docs.map((x, k) => (k === i ? { ...x, url: e.target.value } : x)) })} />
                    <Button variant="ghost" aria-label="Remove link" onClick={() => upd({ docs: def.docs.filter((_, k) => k !== i) })}><Trash2 size={14} /></Button>
                  </div>
                ))}
                <Button variant="secondary" onClick={() => upd({ docs: [...def.docs, { label: "", url: "" }] })}><Plus size={14} /> Add a link</Button>
              </div>
            </div>
          )}

          {step === 1 && <FormStep def={def} upd={upd} />}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <p className="text-[13px] font-medium mb-1">Capabilities</p>
                <p className="text-xs text-text-tertiary mb-3">What people can rely on. A contract action can only belong to a capability marked here, so a connector cannot do more than it says.</p>
                <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2">
                  {CAPABILITIES.map((id) => {
                    const cur = def.capabilities.find((c) => c.id === id);
                    const set = (level: "none" | "partial" | "full", note?: string) => upd({ capabilities: [...def.capabilities.filter((c) => c.id !== id), ...(level === "none" && !cur ? [] : [{ id, level, note: note ?? cur?.note }])] });
                    return (
                      <div key={id} className="rounded-md border border-border p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px]">{CAPABILITY_LABEL[id]}</span>
                          <select aria-label={CAPABILITY_LABEL[id]} value={cur?.level ?? "none"} onChange={(e) => set(e.target.value as "none" | "partial" | "full")} className="h-8 rounded-md border border-border-strong bg-surface px-1.5 text-xs">
                            <option value="none">Not supported</option><option value="partial">Partly</option><option value="full">Fully</option>
                          </select>
                        </div>
                        {cur?.level === "partial" && <Input className="mt-2" aria-label="What is partial" placeholder="What is partial?" value={cur.note ?? ""} onChange={(e) => set("partial", e.target.value)} />}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <ListField label="Read-only access needs" hint="One per line. For example: get and list on projects." value={def.permissions.read} onChange={(v) => upd({ permissions: { ...def.permissions, read: v } })} />
                <ListField label="Write access needs" hint="One per line. Only what is needed when write is enabled." value={def.permissions.write} onChange={(v) => upd({ permissions: { ...def.permissions, write: v } })} />
                <ListField label="Before connecting" hint="One per line. Accounts, roles and network access someone needs first." value={def.prerequisites} onChange={(v) => upd({ prerequisites: v })} />
                <ListField label="Limitations" hint="One per line. Be plain about what it does not do." value={def.limitations} onChange={(v) => upd({ limitations: v })} />
                <div className="sm:col-span-2"><ListField label="Before going live (optional)" hint="One per line. Obligations the customer must meet, such as a data processing agreement." value={def.compliance ?? []} onChange={(v) => upd({ compliance: v })} /></div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <Notice tone="info" title="How a contract works">It tells the platform how to talk to the system over HTTP: how to test it, what it can list, and what each action does. Requests go only to the connection's own address. The credential is added from the connection's secret reference and cannot be read by a template. Values put into a path or query are always encoded.</Notice>
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-text-tertiary mr-1">Start from</span>
                <Button variant="secondary" onClick={() => setContract(starterContract("rest"))}>REST service</Button>
                <Button variant="secondary" onClick={() => setContract(starterContract("health"))}>Health check only</Button>
                <span className="text-xs text-text-tertiary ml-3 mr-1">Add</span>
                {SNIPPETS.map((s) => (
                  <Button key={s.label} variant="secondary" title={s.hint} onClick={() => { try { setContract(s.apply(JSON.parse(text) as Contract)); } catch { toast("Fix the JSON first", "error"); } }}><Plus size={13} /> {s.label}</Button>
                ))}
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                <GuidedAuth text={text} setContract={setContract} />
              </div>
              <label className="block">
                <span className="block text-[13px] font-medium mb-1.5">Contract (JSON)</span>
                <textarea spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} rows={22} className={clsx(txt, "font-code text-[12px] leading-relaxed")} aria-invalid={!!jsonErr} />
              </label>
              {jsonErr && <Notice tone="bad" title="Not valid JSON">{jsonErr}</Notice>}
              <Outline contract={def.contract} />
              <Problems list={here.filter((p) => !jsonErr)} />
              <p className="text-xs text-text-tertiary">Names that operators call: {Object.entries(OPERATOR_ACTIONS).map(([k, v]) => `${k} (${v.mode})`).join(", ")}. Other action names are available to people and agents through the API.</p>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <Notice tone="info" title="What people will see">This is the code view a person gets for a connection to this connector, built from what you entered. Try each call against the examples in the contract to check the paths and results before you publish.</Notice>
              <ExampleCoverage contract={def.contract} />
              <ConnectionCode input={sampleInput} />
              <Toggle checked={tested} onChange={setTested} label="I have tried the calls here and the requests and results look right" />
            </div>
          )}

          {step === 5 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-md bg-surface-muted grid place-items-center"><NodeIcon icon={def.icon} size={24} /></div>
                <div><div className="font-semibold">{def.name || "Unnamed connector"}</div><div className="text-xs text-text-tertiary">{def.vendor} · {FAMILY_LABEL[def.family]} · {def.id}</div></div>
              </div>
              <KeyValue rows={[["Authentication", def.auth.map((a) => AUTH_LABEL[a]).join(", ")], ["Form fields", String(def.fields.length)], ["Capabilities", def.capabilities.filter((c) => c.level !== "none").map((c) => CAPABILITY_LABEL[c.id]).join(", ") || "none"], ["Contract", def.contract ? `${def.contract.test.length} test checks, ${def.contract.discover?.length ?? 0} discoveries, ${Object.keys(def.contract.actions ?? {}).length} actions` : "none"]]} />
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Catalogue status" hint={STATUS_LEGEND[def.status].text}>
                  <Select value={def.status} onChange={(e) => upd({ status: e.target.value as IntegrationStatus })}>
                    {(["planned", "beta", "available", "custom"] as const).map((s) => <option key={s} value={s}>{STATUS_LEGEND[s].label}</option>)}
                  </Select>
                </Field>
                <fieldset>
                  <legend className="text-[13px] font-medium mb-1.5">How it runs</legend>
                  <div className="grid gap-2 text-[13px]">
                    {([["contract", "Contract (recommended)", "The platform runs the contract. Nothing to deploy."], ["remote", "Remote connector service", "Your own service speaks the connector protocol. Use it for what a contract cannot express."]] as const).map(([v, l, t]) => (
                      <label key={v} className={clsx("rounded-md border p-2.5 cursor-pointer", hosting === v ? "border-accent-600 bg-accent-50/50" : "border-border hover:bg-surface-subtle")}>
                        <input type="radio" className="sr-only" name="hosting" checked={hosting === v} onChange={() => setHosting(v)} /><span className="font-medium">{l}</span><span className="block text-xs text-text-secondary">{t}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
              {hosting === "remote" && <Field label="Connector service address *" hint="HTTPS only. The platform signs each request, and the service never receives a customer credential in the clear."><Input value={remoteUrl} onChange={(e) => setRemoteUrl(e.target.value)} placeholder="https://connectors.nexi.example" /></Field>}
              <Field label="Release notes" hint="Shown to platform admins in the history. Say what changed in this revision."><textarea className={txt} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
              {(def.status === "available" || def.status === "beta") && <Notice tone="warn" title={`Marking it ${STATUS_LEGEND[def.status].label}`}>This tells every organization the connector has been tested against a real system. If it has not, choose In development. People trust this label when they pick a connector for production.</Notice>}
              {problems.length > 0 ? <Notice tone="bad" title={`${problems.length} thing${problems.length === 1 ? "" : "s"} to fix before publishing`}><ul className="list-disc pl-4 space-y-1">{problems.slice(0, 8).map((p, i) => <li key={i}><button className="underline text-left" onClick={() => setStep(p.step)}>{STEPS[p.step]}</button>: {p.message}</li>)}</ul></Notice> : <Notice tone="ok">Everything checks out.</Notice>}
            </div>
          )}

          {step !== 3 && <Problems list={here} />}
        </CardBody></Card>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="secondary" onClick={saveDraftNow}>Save draft</Button>
          <div className="flex gap-2">
            {step > 0 && <Button variant="secondary" onClick={() => setStep(step - 1)}>Back</Button>}
            {step < STEPS.length - 1
              ? <Button variant="primary" onClick={nextGuard}>Continue</Button>
              : <Button variant="primary" disabled={problems.length > 0 || !!jsonErr || (!tested && hosting === "contract") || (hosting === "remote" && !remoteUrl)} onClick={publish}>{editing ? "Publish new revision" : "Publish connector"}</Button>}
          </div>
        </div>
        {step === STEPS.length - 1 && !tested && hosting === "contract" && <p className="text-xs text-text-tertiary text-right">Try the calls on the previous step first. Publishing stays off until you have.</p>}
      </div>
    </div>
  );
}

function Problems({ list }: { list: { message: string; path: string }[] }) {
  if (!list.length) return null;
  return <Notice tone="warn" title="To fix on this step"><ul className="list-disc pl-4 space-y-1">{list.map((p, i) => <li key={i}>{p.path ? <span className="font-code text-[11px] mr-1">{p.path}</span> : null}{p.message}</li>)}</ul></Notice>;
}

function ListField({ label, hint, value, onChange }: { label: string; hint?: string; value: string[]; onChange: (v: string[]) => void }) {
  const [raw, setRaw] = useState(value.join("\n"));
  return <Field label={label} hint={hint}><textarea className={txt} rows={4} value={raw} onChange={(e) => { setRaw(e.target.value); onChange(lines(e.target.value)); }} /></Field>;
}

function GuidedAuth({ text, setContract }: { text: string; setContract: (c: Contract) => void }) {
  let c: Contract | null = null;
  try { c = JSON.parse(text) as Contract; } catch { return <p className="text-xs text-text-tertiary sm:col-span-3">Fix the JSON to use the quick settings.</p>; }
  const cc = c;
  return (
    <>
      <Field label="How the credential is sent" hint="The runtime adds it. A template cannot read it.">
        <Select value={cc.auth.mode} onChange={(e) => { const m = e.target.value; setContract({ ...cc, auth: m === "header" ? { mode: "header", header: "X-Api-Key" } : ({ mode: m } as Contract["auth"]) }); }}>
          <option value="bearer">Authorization: Bearer</option><option value="basic">Authorization: Basic</option><option value="header">A named header (API key)</option><option value="none">None</option>
        </Select>
      </Field>
      <Field label="Path prefix" hint="Added to every path, for example /api/v2."><Input value={cc.pathPrefix ?? ""} placeholder="/api/v2" onChange={(e) => setContract({ ...cc, pathPrefix: e.target.value || undefined })} /></Field>
      <Field label="Timeout (seconds)"><Input type="number" min={1} max={120} value={cc.timeoutSec ?? 20} onChange={(e) => setContract({ ...cc, timeoutSec: Number(e.target.value) || undefined })} /></Field>
    </>
  );
}

function Outline({ contract }: { contract?: Contract }) {
  if (!contract) return null;
  return (
    <div className="rounded-md border border-border p-3 text-[13px] space-y-1.5">
      <p className="font-medium">What this contract provides</p>
      <p className="text-text-secondary">Tests: {contract.test?.map((t) => t.name).join("; ") || "none"}</p>
      <p className="text-text-secondary">Discovers: {contract.discover?.map((d) => d.kind).join(", ") || "nothing"}</p>
      <div className="flex flex-wrap gap-1.5">{Object.entries(contract.actions ?? {}).map(([k, a]) => <Badge key={k} tone={a.mode === "write" ? "degraded" : "neutral"}>{k} ({a.mode})</Badge>)}{!Object.keys(contract.actions ?? {}).length && <span className="text-text-tertiary">No actions</span>}</div>
      <p className="text-text-secondary">Observes state: {contract.observe ? "yes" : "no"}</p>
    </div>
  );
}

function ExampleCoverage({ contract }: { contract?: Contract }) {
  if (!contract) return null;
  const missing: string[] = [];
  contract.test.forEach((t) => { if (!t.example) missing.push(`Test: ${t.name}`); });
  contract.discover?.forEach((d) => { if (!d.example) missing.push(`Discover ${d.kind}`); });
  Object.entries(contract.actions ?? {}).forEach(([k, a]) => a.steps.forEach((s) => { if (!s.example) missing.push(`Action ${k}, step ${s.name}`); }));
  if (contract.observe && !contract.observe.example) missing.push("Observe");
  if (!missing.length) return <Notice tone="ok">Every call has an example answer, so each can be tried here.</Notice>;
  return <Notice tone="warn" title="Calls without an example answer">They cannot be tried here, and the code view will show them without a result. Add an example to each: {missing.join("; ")}.</Notice>;
}

// ------------------------------------------------------------------------------------------------ connection form editor

function FormStep({ def, upd }: { def: IntegrationDef; upd: (p: Partial<IntegrationDef>) => void }) {
  const setField = (i: number, patch: Partial<FieldDef>) => upd({ fields: def.fields.map((f, k) => (k === i ? { ...f, ...patch } : f)) });
  const move = (i: number, d: -1 | 1) => { const a = [...def.fields]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; upd({ fields: a }); };
  const add = (f: FieldDef) => upd({ fields: [...def.fields, f] });
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[13px] font-medium mb-1">Authentication people can choose</p>
        <div className="flex flex-wrap gap-2">
          {AUTH_MODES.map((m) => (
            <label key={m} className={clsx("inline-flex items-center gap-2 rounded-md border px-2.5 h-8 text-[13px] cursor-pointer", def.auth.includes(m) ? "border-accent-600 bg-accent-50/50" : "border-border hover:bg-surface-subtle")}>
              <input type="checkbox" className="sr-only" checked={def.auth.includes(m)} onChange={(e) => upd({ auth: e.target.checked ? [...def.auth, m] : def.auth.filter((x) => x !== m) })} />{AUTH_LABEL[m]}
            </label>
          ))}
        </div>
        <p className="text-xs text-text-tertiary mt-1.5">The first one is the default. A credential is never typed into a field you add here: it is held in the customer's secret manager and the connection keeps a reference.</p>
      </div>
      <Toggle checked={!!def.privateConnectivity} onChange={(v) => upd({ privateConnectivity: v })} label="Usually reached through an agent or private link" description="Shows the agent option first in the connection wizard." />
      <div className="space-y-3">
        <p className="text-[13px] font-medium">Fields in the connection form</p>
        {def.fields.map((f, i) => (
          <div key={i} className="rounded-md border border-border p-3 space-y-3">
            <div className="grid sm:grid-cols-4 gap-3">
              <Field label="Key"><Input value={f.key} onChange={(e) => setField(i, { key: e.target.value })} /></Field>
              <Field label="Label"><Input value={f.label} onChange={(e) => setField(i, { label: e.target.value })} /></Field>
              <Field label="Type"><Select value={f.type} onChange={(e) => setField(i, { type: e.target.value as FieldDef["type"] })}>{["text", "number", "select", "toggle", "textarea"].map((t) => <option key={t} value={t}>{t}</option>)}</Select></Field>
              <Field label="Default"><Input value={String(f.default ?? "")} onChange={(e) => setField(i, { default: f.type === "number" ? Number(e.target.value) : f.type === "toggle" ? e.target.value === "true" : e.target.value })} /></Field>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Placeholder"><Input value={f.placeholder ?? ""} onChange={(e) => setField(i, { placeholder: e.target.value || undefined })} /></Field>
              <Field label="Help text"><Input value={f.help ?? ""} onChange={(e) => setField(i, { help: e.target.value || undefined })} /></Field>
            </div>
            {f.type === "select" && <Field label="Options, one per line"><textarea className={txt} rows={3} value={(f.options ?? []).join("\n")} onChange={(e) => setField(i, { options: lines(e.target.value) })} /></Field>}
            <div className="flex flex-wrap items-center gap-3">
              <Toggle checked={!!f.required} onChange={(v) => setField(i, { required: v || undefined })} label="Required" />
              <label className="inline-flex items-center gap-2 text-xs text-text-secondary">Show only when
                <select value={f.showWhen?.key ?? ""} onChange={(e) => setField(i, { showWhen: e.target.value ? { key: e.target.value, in: f.showWhen?.in ?? [] } : undefined })} className="h-8 rounded-md border border-border-strong bg-surface px-1.5 text-xs">
                  <option value="">always</option><option value="auth">authentication</option>{def.fields.filter((x, k) => k !== i).map((x) => <option key={x.key} value={x.key}>{x.label || x.key}</option>)}
                </select>
                {f.showWhen && <Input aria-label="Values" className="h-8 w-48" placeholder="value, value" value={f.showWhen.in.join(", ")} onChange={(e) => setField(i, { showWhen: { key: f.showWhen!.key, in: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) } })} />}
              </label>
              <span className="ml-auto flex gap-1">
                <Button variant="ghost" aria-label="Move up" onClick={() => move(i, -1)}><ArrowUp size={14} /></Button>
                <Button variant="ghost" aria-label="Move down" onClick={() => move(i, 1)}><ArrowDown size={14} /></Button>
                <Button variant="ghost" aria-label="Remove field" onClick={() => upd({ fields: def.fields.filter((_, k) => k !== i) })}><Trash2 size={14} /></Button>
              </span>
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => add({ key: "field" + (def.fields.length + 1), label: "New field", type: "text" })}><Plus size={14} /> Text field</Button>
          <Button variant="secondary" onClick={() => add({ key: "tokenRef", label: "Token reference", type: "text", placeholder: "secretref://vault/nexi/service#token", help: "A reference to the secret in your secret manager. The value is never entered here." })}><Plus size={14} /> Secret reference</Button>
          {!def.fields.some((f) => f.key === "endpoint") && <Button variant="secondary" onClick={() => add({ key: "endpoint", label: "Endpoint", type: "text", placeholder: "https://api.example.com", required: true })}><Plus size={14} /> Endpoint</Button>}
        </div>
      </div>
    </div>
  );
}
