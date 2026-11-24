"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { Check, Download, Minus, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select, Toggle } from "@/components/ui/Form";
import { CodeBlock } from "@/components/mlops/Code";
import { Notice } from "@/components/mlops/ui";
import { NodeIcon } from "@/components/studio/icons";
import { BUILDABLE, ADAPTER_BY_ID, type Support } from "@/lib/agents/adapters";
import { OrgPlacement, OwnerSelect } from "@/components/org/OrgSelect";
import { useOrgDirectory } from "@/lib/org/useOrgDirectory";
import { placementOf } from "@/lib/org/directory";
import { HOSTED_MODELS, checkModel, registryChoices } from "@/lib/agents/models";
import { useMlops } from "@/lib/mlops/store";
import { DEFAULT_SPEC, generateProject, validateSpec, type ForgeSpec } from "@/lib/agents/codegen";
import { agents as actions, useAgents } from "@/lib/agents/store";
import { zip } from "@/lib/agents/zip";
import { toast } from "@/lib/mlops/toast";

const MODES: { id: ForgeSpec["modes"][number]; label: string; help: string }[] = [
  { id: "sync", label: "Wait for the answer", help: "The caller waits on one request." },
  { id: "async", label: "Come back later", help: "Returns a task id. The caller polls." },
  { id: "webhook", label: "Call me back", help: "tok∑ner posts the result to the caller's address." },
  { id: "stream", label: "Stream", help: "Partial results as they arrive." },
];
const FEATURE_LABEL: Record<string, string> = { tools: "Tools", mcp: "MCP tools", streaming: "Streaming", memory: "Memory", multiAgent: "Several agents", humanInLoop: "Approval step", otel: "OpenTelemetry" };
const SUPPORT: Record<Support, { text: string; cls: string }> = { yes: { text: "Wired", cls: "text-status-healthy" }, partial: { text: "Partly", cls: "text-status-degraded" }, no: { text: "Not wired", cls: "text-text-tertiary" } };

/** A field that holds several controls. A label would hand every click to its first control, so this is a labelled group instead. */
function Group({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  const id = useId();
  return <div role="group" aria-labelledby={id}><span id={id} className="block text-[13px] font-medium text-text-primary mb-1.5">{label}</span>{children}{hint && <span className="block text-xs text-text-tertiary mt-1.5">{hint}</span>}</div>;
}
const step = (n: number, title: string, hint?: string) => <CardHeader title={`${n}. ${title}`} subtitle={hint} />;

/** Agent Forge: describe an agent, choose a framework, and get a runnable project that calls everything through tok∑ner. */
export function Forge({ editId }: { editId?: string }) {
  const router = useRouter();
  const { agents } = useAgents();
  const editing = editId ? agents.find((a) => a.id === editId && a.origin === "forge") : undefined;
  const [spec, setSpec] = useState<ForgeSpec>(() => (editing?.spec ? JSON.parse(JSON.stringify(editing.spec)) : { ...JSON.parse(JSON.stringify(DEFAULT_SPEC)), owner: "", department: "", project: "" }));
  const { dir } = useOrgDirectory();
  const mlops = useMlops(); const registry = registryChoices(mlops?.models ?? [], mlops?.deployments ?? []);
  const [file, setFile] = useState("");
  const [blocked, setBlocked] = useState(""); const [knowledge, setKnowledge] = useState(""); const [server, setServer] = useState({ name: "", tools: "" });
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof ForgeSpec>(k: K, v: ForgeSpec[K]) => setSpec((s) => ({ ...s, [k]: v }));
  const modelIssues = useMemo(() => checkModel(spec.model, mlops?.models ?? [], mlops?.deployments ?? []), [spec.model, mlops]);
  const issues = useMemo(() => [...validateSpec(spec), ...modelIssues.filter((i) => i.level === "error").map((i) => ({ field: "model", message: i.message }))], [spec, modelIssues]);
  const files = useMemo(() => { try { return generateProject(spec); } catch { return []; } }, [spec]);
  const current = files.find((f) => f.path === file) ?? files[0];
  const adapter = ADAPTER_BY_ID[spec.framework];
  const issueFor = (f: string) => (touched ? issues.find((i) => i.field === f || i.field.startsWith(f + "["))?.message : undefined);
  const allTools = spec.tools.flatMap((t) => t.allow.map((x) => ({ key: `${t.server}.${x}`, tool: x })));

  const create = () => {
    setTouched(true);
    if (issues.length) { toast(issues[0].message, "error"); return; }
    const r = editing ? actions.updateFromForge(editing.id, spec) : actions.createFromForge(spec);
    if (!r.ok) { toast(r.error, "error"); return; }
    toast(editing ? `${r.value.title} saved as version ${spec.version}` : `${r.value.title} is created`, "success");
    router.push(`/agents/registry/${r.value.id}`);
  };
  const download = () => {
    if (issues.length) { setTouched(true); toast(issues[0].message, "error"); return; }
    const blob = new Blob([zip(files.map((f) => ({ path: `${spec.name}/${f.path}`, content: f.content })))], { type: "application/zip" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `${spec.name}.zip`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const addServer = () => {
    const tools = server.tools.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
    if (!server.name.trim() || !tools.length) { toast("Name the server and list at least one tool.", "error"); return; }
    if (spec.tools.some((t) => t.server === server.name.trim())) { toast("That server is already listed.", "error"); return; }
    set("tools", [...spec.tools, { server: server.name.trim().toLowerCase(), allow: tools }]); setServer({ name: "", tools: "" });
  };
  const chip = (label: string, onRemove: () => void) => <span key={label} className="inline-flex items-center gap-1 rounded-md bg-surface-muted pl-2 pr-1 h-6 text-xs">{label}<button aria-label={`Remove ${label}`} onClick={onRemove} className="h-4 w-4 grid place-items-center rounded hover:bg-border"><X size={11} /></button></span>;
  const err = (f: string) => issueFor(f) && <p className="text-xs text-status-down mt-1.5">{issueFor(f)}</p>;

  return (
    <div className="grid xl:grid-cols-[minmax(0,640px)_minmax(0,1fr)] gap-6 items-start">
      <div className="space-y-5 min-w-0">
        {editing && <Notice tone="info">Editing {editing.title}. Change the version number before you save, so the earlier version stays on record.</Notice>}

        <Card>
          {step(1, "Framework", "Choose what the agent is built with. The project is generated for it. You can change this later and generate again.")}
          <CardBody className="grid sm:grid-cols-2 gap-2.5">
            {BUILDABLE.map((a) => (
              <button key={a.id} type="button" aria-pressed={spec.framework === a.id} onClick={() => set("framework", a.id)}
                className={clsx("flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors", spec.framework === a.id ? "border-emph bg-surface-subtle ring-1 ring-emph" : "border-border hover:bg-surface-subtle")}>
                <span className="h-9 w-9 rounded-md bg-surface-muted grid place-items-center shrink-0"><NodeIcon icon={a.icon} size={20} /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium truncate">{a.name}</span><span className="block text-xs text-text-tertiary truncate">{a.vendor}, {a.build!.language === "spec" ? "no code" : a.build!.language === "python" ? "Python" : "TypeScript"}</span></span>
                {spec.framework === a.id && <Check size={15} className="shrink-0" />}
              </button>
            ))}
          </CardBody>
          {adapter?.build && <div className="px-5 pb-4 -mt-1"><div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">{Object.entries(adapter.build.features).map(([k, v]) => <span key={k} className="inline-flex gap-1.5"><span className="text-text-tertiary">{FEATURE_LABEL[k]}</span><span className={clsx("font-medium", SUPPORT[v].cls)}>{SUPPORT[v].text}</span></span>)}</div><p className="text-xs text-text-tertiary mt-2">{adapter.build.notes}</p></div>}
        </Card>

        <Card>
          {step(2, "Identity", "How the agent appears in the registry and what its address is.")}
          <CardBody className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Name" hint="Lowercase letters, digits and hyphens. It becomes the address and cannot change later."><div><Input value={spec.name} disabled={!!editing} onChange={(e) => set("name", e.target.value.toLowerCase())} aria-invalid={!!issueFor("name")} />{err("name")}</div></Field>
              <Field label="Display name"><div><Input value={spec.title} onChange={(e) => set("title", e.target.value)} />{err("title")}</div></Field>
            </div>
            <Field label="What it is for" hint="One or two sentences. Other agents and people see this when they look for it."><Input value={spec.description} onChange={(e) => set("description", e.target.value)} /></Field>
            <div className="grid sm:grid-cols-3 gap-4">
              <div><OwnerSelect value={spec.owner} onChange={(v) => set("owner", v)} />{err("owner")}</div>
              <Field label="Organisation"><div><Input value={spec.organisation} disabled /></div></Field>
              <Field label="Version"><Input value={spec.version} onChange={(e) => set("version", e.target.value)} /></Field>
            </div>
            <div><OrgPlacement value={placementOf(dir, spec.department ?? "", spec.project)} onChange={(p) => setSpec((x) => ({ ...x, department: p.department, project: p.project }))} />{err("department")}</div>
            <p className="text-xs text-text-tertiary font-mono">Address: agent://{spec.organisation}/{spec.name || "name"}</p>
          </CardBody>
        </Card>

        <Card>
          {step(3, "Model and instructions", "The model is reached through the tok∑ner gateway, so your policy and budget apply to every call.")}
          <CardBody className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-4">
              <div><Field label="Model" hint="Hosted models use your provider keys. Your own models come from the Model Registry."><Select aria-label="Model" value={spec.model} onChange={(e) => set("model", e.target.value)}>
                <optgroup label="Hosted through the gateway">{HOSTED_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}</optgroup>
                <optgroup label="Your Model Registry">{registry.length === 0 && <option disabled value="">No deployed models yet</option>}{registry.map((c) => <option key={c.value} value={c.value} disabled={!c.ok}>{c.label}, {c.detail}{c.problem ? " (not usable)" : ""}</option>)}</optgroup></Select></Field>
                {modelIssues.map((i, n) => <p key={n} className={i.level === "error" ? "text-xs text-status-down mt-1.5" : "text-xs text-[#9A5F05] mt-1.5"}>{i.message}</p>)}</div>
              <Field label="Temperature" hint="0 is steady, 2 is varied."><div><Input type="number" step="0.1" min={0} max={2} value={spec.temperature} onChange={(e) => set("temperature", Number(e.target.value))} />{err("temperature")}</div></Field>
              <Field label="Most steps" hint="A cap on one task's loop."><div><Input type="number" min={1} max={50} value={spec.maxSteps} onChange={(e) => set("maxSteps", Number(e.target.value))} />{err("maxSteps")}</div></Field>
            </div>
            <Field label="Instructions" hint="Say what the agent does, how it should answer, and what it must never do."><div>
              <textarea value={spec.instructions} onChange={(e) => set("instructions", e.target.value)} rows={6} aria-invalid={!!issueFor("instructions")} className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500/40" />
              {err("instructions")}</div></Field>
          </CardBody>
        </Card>

        <Card>
          {step(4, "Tools", "Tools come from MCP servers connected in MCP Servers, reached through the tok∑ner MCP gateway. List only the tools this agent may call.")}
          <CardBody className="space-y-3">
            {spec.tools.length === 0 && <p className="text-sm text-text-tertiary">No tools. The agent can only answer from its instructions.</p>}
            {spec.tools.map((t) => (
              <div key={t.server} className="rounded-md border border-border px-3 py-2.5">
                <div className="flex items-center justify-between"><span className="text-sm font-medium font-mono">{t.server}</span><button className="text-xs text-text-tertiary hover:text-status-down inline-flex items-center gap-1" onClick={() => set("tools", spec.tools.filter((x) => x.server !== t.server))}><Minus size={12} /> Remove server</button></div>
                <div className="flex flex-wrap gap-1.5 mt-2">{t.allow.map((x) => chip(x, () => set("tools", spec.tools.map((y) => (y.server === t.server ? { ...y, allow: y.allow.filter((z) => z !== x) } : y)))))}</div>
              </div>
            ))}
            {err("tools")}
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-36"><Field label="MCP server"><Input value={server.name} onChange={(e) => setServer({ ...server, name: e.target.value })} placeholder="crm" list="forge-servers" /></Field></div>
              <div className="flex-1 min-w-[180px]"><Field label="Tools it may call"><Input value={server.tools} onChange={(e) => setServer({ ...server, tools: e.target.value })} placeholder="get_account, search_contacts" onKeyDown={(e) => { if (e.key === "Enter") addServer(); }} /></Field></div>
              <Button onClick={addServer}><Plus size={14} /> Add</Button>
              <datalist id="forge-servers">{["helpdesk", "crm", "billing", "github", "docs", "web", "erp", "refinery"].map((x) => <option key={x} value={x} />)}</datalist>
            </div>
          </CardBody>
        </Card>

        <Card>
          {step(5, "Knowledge and memory")}
          <CardBody className="space-y-4">
            <Group label="Knowledge" hint="Names of Knowledge collections the agent may search. They are recorded in the specification and enforced by the gateway.">
              <div className="space-y-2"><div className="flex flex-wrap gap-1.5">{spec.knowledge.map((k) => chip(k, () => set("knowledge", spec.knowledge.filter((x) => x !== k))))}</div>
                <Input value={knowledge} onChange={(e) => setKnowledge(e.target.value)} placeholder="Add a collection and press Enter" onKeyDown={(e) => { if (e.key === "Enter" && knowledge.trim()) { set("knowledge", [...new Set([...spec.knowledge, knowledge.trim()])]); setKnowledge(""); } }} /></div></Group>
            <Field label="Memory"><Select value={spec.memory} onChange={(e) => set("memory", e.target.value as ForgeSpec["memory"])}><option value="none">None. Each task starts fresh.</option><option value="session">Within a session</option><option value="persistent">Across sessions</option></Select></Field>
          </CardBody>
        </Card>

        <Card>
          {step(6, "Guardrails and budget", "These are enforced by tok∑ner at the gateway, not by the agent's code, so a mistake in the agent cannot switch them off.")}
          <CardBody className="space-y-3">
            <Toggle checked={spec.guardrails.maskPersonalData} onChange={(v) => set("guardrails", { ...spec.guardrails, maskPersonalData: v })} label="Mask personal data" description="Names, emails and card numbers are masked before a model sees them." />
            <Group label="Topics the agent must refuse"><div className="space-y-2"><div className="flex flex-wrap gap-1.5">{spec.guardrails.blockedTopics.map((k) => chip(k, () => set("guardrails", { ...spec.guardrails, blockedTopics: spec.guardrails.blockedTopics.filter((x) => x !== k) })))}</div>
              <Input value={blocked} onChange={(e) => setBlocked(e.target.value)} placeholder="For example legal advice. Press Enter to add" onKeyDown={(e) => { if (e.key === "Enter" && blocked.trim()) { set("guardrails", { ...spec.guardrails, blockedTopics: [...new Set([...spec.guardrails.blockedTopics, blocked.trim()])] }); setBlocked(""); } }} /></div></Group>
            {allTools.length > 0 && <Group label="A person approves before these run"><div className="flex flex-wrap gap-2 pt-0.5">{allTools.map((t) => { const on = spec.guardrails.approvalFor.includes(t.tool); return (
              <button key={t.key} type="button" aria-pressed={on} onClick={() => set("guardrails", { ...spec.guardrails, approvalFor: on ? spec.guardrails.approvalFor.filter((x) => x !== t.tool) : [...spec.guardrails.approvalFor, t.tool] })}
                className={clsx("h-7 px-2.5 rounded-md border text-xs font-mono", on ? "border-emph bg-emph text-on-emph" : "border-border-strong hover:bg-surface-muted")}>{t.key}</button>); })}</div></Group>}
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Most one task may cost (USD)"><Input type="number" step="0.05" min={0} value={spec.budget.perTaskUsd} onChange={(e) => set("budget", { ...spec.budget, perTaskUsd: Number(e.target.value) })} /></Field>
              <Field label="Monthly budget (USD)"><Input type="number" step="10" min={0} value={spec.budget.monthlyUsd} onChange={(e) => set("budget", { ...spec.budget, monthlyUsd: Number(e.target.value) })} /></Field>
            </div>
            {err("budget")}
          </CardBody>
        </Card>

        <Card>
          {step(7, "How others call it", "The agent speaks TAP. These choices go on its agent card, which is how other agents and the registry find out what it can do.")}
          <CardBody className="space-y-4">
            <Group label="What it can do" hint="Each is an id other agents ask for, with a sentence that says what it means.">
              <div className="space-y-2">{spec.capabilities.map((c, i) => (
                <div key={i} className="flex gap-2"><Input className="!w-48 font-mono" value={c.id} onChange={(e) => set("capabilities", spec.capabilities.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)))} /><Input value={c.description} onChange={(e) => set("capabilities", spec.capabilities.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                  <button aria-label="Remove capability" onClick={() => set("capabilities", spec.capabilities.filter((_, j) => j !== i))} className="h-9 w-9 grid place-items-center rounded-md hover:bg-surface-muted shrink-0"><X size={14} /></button></div>))}
                <button className="text-[13px] text-text-secondary hover:text-text-primary inline-flex items-center gap-1" onClick={() => set("capabilities", [...spec.capabilities, { id: "", description: "" }])}><Plus size={13} /> Add a capability</button>
                {err("capabilities")}</div></Group>
            <Group label="Ways to call it"><div className="grid sm:grid-cols-2 gap-2">{MODES.map((m) => { const on = spec.modes.includes(m.id); return (
              <label key={m.id} className={clsx("flex items-start gap-2.5 rounded-md border px-3 py-2 cursor-pointer", on ? "border-emph bg-surface-subtle" : "border-border hover:bg-surface-subtle")}>
                <input type="checkbox" checked={on} className="mt-1 accent-[#07191E]" onChange={() => set("modes", on ? spec.modes.filter((x) => x !== m.id) : [...spec.modes, m.id])} /><span><span className="block text-[13px] font-medium">{m.label}</span><span className="block text-xs text-text-tertiary">{m.help}</span></span></label>); })}</div>{err("modes")}</Group>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Conformance" hint="Observe sends traces. Govern adds policy and suspend. Collaborate adds calling other agents."><Select value={spec.conformance} onChange={(e) => set("conformance", e.target.value as ForgeSpec["conformance"])}><option value="observe">Observe</option><option value="govern">Govern</option><option value="collaborate">Collaborate</option></Select></Field>
              <div className="pt-6"><Toggle checked={spec.signing} onChange={(v) => set("signing", v)} label="Sign messages" description="Ed25519 signatures on what it sends." /></div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* what will be generated */}
      <div className="xl:sticky xl:top-4 space-y-4 min-w-0">
        <Card>
          <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0"><div className="text-sm font-semibold">{spec.title || "Untitled agent"}</div><div className="text-xs text-text-tertiary font-mono truncate">agent://{spec.organisation}/{spec.name || "name"} · {adapter?.name}</div></div>
            <div className="flex gap-2"><Button onClick={download}><Download size={14} /> Download project</Button><Button variant="primary" onClick={create}>{editing ? "Save version" : "Create agent"}</Button></div>
          </div>
          {touched && issues.length > 0 && <div className="px-5 pb-4"><Notice tone="bad">{issues.length === 1 ? issues[0].message : `${issues.length} things to fix. First: ${issues[0].message}`}</Notice></div>}
          {!touched && issues.length === 0 && <div className="px-5 pb-4 text-xs text-text-tertiary flex items-center gap-1.5"><Check size={13} className="text-status-healthy" /> The specification is valid. {files.length} files are generated.</div>}
        </Card>

        <Card>
          <div className="border-b border-border px-3 pt-2 flex gap-1 overflow-x-auto" role="tablist" aria-label="Generated files">
            {files.map((f) => <button key={f.path} role="tab" aria-selected={current?.path === f.path} onClick={() => setFile(f.path)} className={clsx("relative h-9 px-2.5 text-xs font-mono whitespace-nowrap", current?.path === f.path ? "text-text-primary" : "text-text-tertiary hover:text-text-primary")}>{f.path}{current?.path === f.path && <span className="absolute left-1 right-1 -bottom-px h-0.5 bg-accent-600 rounded-full" />}</button>)}
          </div>
          {current && <CardBody className="space-y-3"><p className="text-xs text-text-secondary">{current.purpose}</p><CodeBlock code={current.content} language={current.language} title={current.path} maxHeight={520} /></CardBody>}
        </Card>

        <Notice tone="info">The code is a starting point. It follows each framework's documented API, but it has been checked for syntax and its server has been run against the protocol checks, not run against every framework's latest release. Versions are left unpinned: build once, test, then pin what worked.</Notice>
        <div className="flex flex-wrap gap-1.5">{(adapter?.build?.packages ?? []).map((p) => <Badge key={p} tone="neutral">{p}</Badge>)}</div>
      </div>
    </div>
  );
}
