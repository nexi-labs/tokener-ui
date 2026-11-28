"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plug, Plus, Server, Waypoints } from "lucide-react";
import { siNvidia, siOllama } from "simple-icons";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Kpi, Loading, Modal, Notice, useRole } from "@/components/mlops/ui";
import { AiCanvas, CanvasLegend } from "@/components/mlops/AiCanvas";
import { buildCanvas, providerIdFor, validateExpose, type NodeKind } from "@/lib/mlops/ai-canvas";
import { can } from "@/lib/mlops/rbac";
import { useMlops, useMlopsStatus } from "@/lib/mlops/store";
import { mcpServers, useMcpServers } from "@/lib/mlops/mcp-servers";
import { useMcpGrants } from "@/lib/mlops/mcp-access-store";
import { isExpired } from "@/lib/mlops/mcp-access";
import { toast } from "@/lib/mlops/toast";
import { useProviders } from "@/lib/gateway/useProviders";
import { saveRegistered, type Registered } from "@/lib/gateway/provider-catalog";

export default function AiCanvasPage() {
  const s = useMlops(); const servers = useMcpServers(); const grants = useMcpGrants(); const { all: providers, ready } = useProviders(); const { mode } = useMlopsStatus(); const role = useRole();
  const [kind, setKind] = useState<NodeKind | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [exposing, setExposing] = useState(false);
  const live = mode === "live";
  const canvas = useMemo(() => (s && servers && grants ? buildCanvas({ deployments: s.deployments, providers, servers, grants }) : null), [s, servers, grants, providers]);
  if (!s || !servers || !grants || !canvas || !ready) return <Loading />;
  const gate = can(role, "deployment.scale", "development");

  return (
    <div className="space-y-5">
      <PageHeader
        title="AI canvas"
        description="How each model reaches the people and agents that use it: the model, the gateway in front of it, the MCP servers that call it, and who may call them."
        action={<div className="flex flex-wrap gap-2">
          <Link href="/mlops/deployments/new"><Button variant="secondary"><Server size={15} /> Host a model</Button></Link>
          <Link href="/providers/new?kind=compatible"><Button variant="secondary"><Plug size={15} /> Connect your own endpoint</Button></Link>
          <Button variant="primary" onClick={() => setExposing(true)}><Waypoints size={15} /> Expose through MCP</Button>
        </div>}
      />
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Models in the picture" value={canvas.counts.hosted + canvas.counts.own + canvas.counts.vendor} sub={`${canvas.counts.hosted} hosted, ${canvas.counts.own} your own, ${canvas.counts.vendor} vendor`} />
        <Kpi label="MCP servers" value={canvas.counts.mcp} sub={`${servers.filter((x) => x.status === "published").length} published`} />
        <Kpi label="Callers with a grant" value={grants.filter((g) => g.status === "active" && !isExpired(g)).length} sub="people, groups, applications" />
        <Kpi label="Needs a look" value={canvas.findings.filter((f) => f.level === "warn").length} sub={canvas.findings.length ? "see below the picture" : "nothing"} tone={canvas.findings.some((f) => f.level === "warn") ? "warn" : undefined} />
      </div>

      <Card>
        <CardHeader title="Canvas" subtitle="Point at anything to light its whole path. A dashed line is a model that is not in the gateway yet." />
        <CardBody className="space-y-4">
          <CanvasLegend counts={canvas.counts} onHover={setKind} />
          <AiCanvas canvas={canvas} servers={servers} providers={providers} kindHover={kind} onAddToGateway={live ? undefined : setAdding} />
        </CardBody>
      </Card>

      {canvas.findings.length > 0 && (
        <Card>
          <CardHeader title="What the picture says" />
          <CardBody className="space-y-2.5">
            {canvas.findings.map((f, i) => (
              <Notice key={i} tone={f.level === "warn" ? "warn" : "info"}>
                <span>{f.text}</span>{" "}
                {f.action === "add-to-gateway" && !live && f.ref && <button type="button" className="font-medium underline" onClick={() => setAdding(f.ref!)}>Add it to the gateway</button>}
                {f.action === "publish" && f.ref && <Link className="font-medium underline" href={`/mlops/mcp-servers/${f.ref}`}>Open the server</Link>}
              </Notice>
            ))}
          </CardBody>
        </Card>
      )}

      <AddToGateway deploymentId={adding} onClose={() => setAdding(null)} />
      <ExposeDialog open={exposing} onClose={() => setExposing(false)} canvas={canvas} allowed={gate.ok} />
    </div>
  );
}

/** Registers a hosted model as a provider so the one gateway endpoint can route to it. The credential is a reference to a secret, never a value. */
function AddToGateway({ deploymentId, onClose }: { deploymentId: string | null; onClose: () => void }) {
  const s = useMlops(); const d = s?.deployments.find((x) => x.id === deploymentId);
  const [name, setName] = useState(""); const [key, setKey] = useState("");
  if ((d?.id ?? "") !== key) { setKey(d?.id ?? ""); setName(d ? `${d.name} (self-hosted)` : ""); }
  const submit = () => {
    if (!d) return; const id = providerIdFor(d); const ref = `secretref://vault/prod/providers/${id}/token`;
    const reg: Registered = { id, name: name.trim() || `${d.name} (self-hosted)`, kind: "Self-hosted", icon: d.runtime === "vllm" || d.runtime === "custom-container" ? siOllama : siNvidia, region: "us-east", priority: 3, status: d.health === "healthy" ? "healthy" : "degraded", models: [d.name], p50: 0, p99: 0, errorRatePct: 0, requestsPerDay: 0, spendPerDayUsd: 0, rpmLimit: 600, tpmLimit: 400000, secretRef: ref, selfHosted: true, fresh: true, specId: "self-hosted", secretRefs: [ref], note: "Added from the AI canvas." };
    saveRegistered(reg); toast(`${d.name} is in the gateway`, "success"); onClose();
  };
  return (
    <Modal open={!!d} onClose={onClose} title="Add to the gateway" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Add to the gateway</Button></>}>
      {d && <div className="space-y-4">
        <p className="text-sm text-text-secondary">{d.name} runs on your infrastructure at {d.endpoint}. Adding it makes it a provider, so applications reach it through the one endpoint with the same policy, budgets and audit as any other model.</p>
        <Field label="Provider name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Notice tone="info">The credential the gateway uses to reach it is stored as a reference to a secret in your own vault, not as a value.</Notice>
      </div>}
    </Modal>
  );
}

/** Adds a tool that asks a model, to an existing MCP server or a new one, so an agent can call that model as a tool. The call still goes through the gateway. */
function ExposeDialog({ open, onClose, canvas, allowed }: { open: boolean; onClose: () => void; canvas: ReturnType<typeof buildCanvas>; allowed: boolean }) {
  const servers = useMcpServers() ?? []; const { all: providers } = useProviders();
  const models = canvas.nodes.filter((n) => n.column === 0 && n.providerId);
  const [model, setModel] = useState(""); const [server, setServer] = useState("new"); const [name, setName] = useState(""); const [desc, setDesc] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const m = models.find((x) => x.providerId === (model || models[0]?.providerId));
  const prov = providers.find((p) => p.id === m?.providerId);
  const toolName = name || `ask_${(m?.label ?? "model").toLowerCase().replace(/\s*\(.*\)$/, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40)}`;
  const description = desc || `Ask ${m?.label ?? "the model"} a question and return its answer, through the gateway so policy and budget apply.`;
  const target = servers.find((x) => x.id === server);
  const submit = async () => {
    if (!m || !prov) return; const alias = `${prov.id}/${prov.models[0] ?? m.label}`;
    const bad = validateExpose({ name: toolName, description, alias, serverTools: target?.tools.map((t) => t.name) ?? [] }); if (bad) { setErr(bad); return; }
    setBusy(true); setErr(""); let sid = server;
    if (sid === "new") { const c = await mcpServers.create({ name: `${m.label} tools`.slice(0, 60), env: "development", auth: "api-key" }); if (!c.ok) { setBusy(false); setErr(c.error); return; } sid = c.id; }
    const r = await mcpServers.addModelTool(sid, { name: toolName, description, alias, instruction: "Answer briefly and only from the input." });
    setBusy(false); if (!r.ok) { setErr(r.error); return; }
    toast(`${toolName} added. Publish the server to let agents call it.`, "success"); setName(""); setDesc(""); onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Expose a model through MCP" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit} disabled={busy || !allowed || !models.length}>Add the tool</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">An agent calls a tool on an MCP server. This adds a tool that asks the model you choose, through the gateway, so the same policy, budget and audit apply. Nobody can call it until the server is published and someone has a grant.</p>
        {err && <Notice tone="bad">{err}</Notice>}
        {!allowed && <Notice tone="warn">Your role cannot change servers here.</Notice>}
        {!models.length && <Notice tone="warn">No model is in the gateway yet. Add a hosted model to the gateway, or connect your own endpoint, first.</Notice>}
        <Field label="Model"><Select value={model || models[0]?.providerId || ""} onChange={(e) => setModel(e.target.value)}>{models.map((x) => <option key={x.id} value={x.providerId}>{x.label}</option>)}</Select></Field>
        <Field label="MCP server"><Select value={server} onChange={(e) => setServer(e.target.value)}><option value="new">A new server for this model</option>{servers.map((x) => <option key={x.id} value={x.id}>{x.name}{x.status === "published" ? "" : " (draft)"}</option>)}</Select></Field>
        <Field label="Tool name" hint="Lower case, digits and underscores."><Input value={toolName} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="What it does" hint="An agent reads this to decide when to use the tool."><Input value={description} onChange={(e) => setDesc(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
