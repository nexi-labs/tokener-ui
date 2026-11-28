"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import clsx from "clsx";
import { siNvidia, siOllama } from "simple-icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Field, Input, Select, Toggle } from "@/components/ui/Form";
import { EnvBadge, Loading, Notice, useRole } from "@/components/mlops/ui";
import { CodeBlock } from "@/components/mlops/Code";
import { can } from "@/lib/mlops/rbac";
import { mlops, useMlops, useMlopsStatus } from "@/lib/mlops/store";
import { mcpServers, useMcpServers } from "@/lib/mlops/mcp-servers";
import { ENVS, ENV_LABEL, type Env } from "@/lib/mlops/types";
import { ENGINES, GPUS, PRECISIONS, SHAPES, manifest, plan, type Inputs } from "@/lib/gateway/gpu";
import { TOOLKITS, checkCuda, newestSupported } from "@/lib/gateway/cuda";
import { SAMPLE_FLEET } from "@/lib/gateway/fleet";
import { saveRegistered, slug, type Registered } from "@/lib/gateway/provider-catalog";
import { useProviders } from "@/lib/gateway/useProviders";
import { Back } from "@/components/gateway/bits";

const STEPS = ["Model", "Runtime and GPU", "Scaling and access", "Review"];
const RUNTIMES = [...ENGINES.map((e) => ({ id: e.id, label: e.label, note: e.note, gpu: true })), { id: "custom-container", label: "Custom container, CPU", note: "Your own image on CPU nodes. Use it for small classical models.", gpu: false }];
/** Which engines expose the OpenAI chat API the gateway speaks, so the deployment can be registered as a provider as it is. */
const OPENAI_API: Record<string, string> = { vllm: "Serves the OpenAI chat API directly.", nim: "Serves the OpenAI chat API directly.", "tensorrt-llm": "Serves it through trtllm-serve. Start the server in that mode.", triton: "Needs the OpenAI-compatible frontend enabled on the server.", "custom-container": "Only if your image implements the OpenAI chat API." };

function nearestShape(sizeMb: number) {
  const b = sizeMb / 2000; // fp16 is about 2 GB per billion parameters
  return SHAPES.reduce((best, s) => (Math.abs(s.paramsB - b) < Math.abs(best.paramsB - b) ? s : best), SHAPES[0]);
}

function Stepper({ at }: { at: number }) {
  return (
    <ol className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Progress">
      {STEPS.map((s, i) => (
        <li key={s} aria-current={i === at ? "step" : undefined} className={clsx("flex items-center gap-2 text-[13px]", i === at ? "text-text-primary font-medium" : i < at ? "text-text-secondary" : "text-text-tertiary")}>
          <span className={clsx("h-5 w-5 rounded-full text-[11px] flex items-center justify-center border", i < at ? "bg-emph text-on-emph border-transparent" : i === at ? "border-text-primary" : "border-border-strong")}>{i < at ? <Check size={12} /> : i + 1}</span>{s}
        </li>
      ))}
    </ol>
  );
}

function Wizard() {
  const q = useSearchParams();
  const s = useMlops();
  const role = useRole();
  const servers = useMcpServers();
  const { all: providers } = useProviders();
  const live = useMlopsStatus().mode === "live";
  const [step, setStep] = useState(0);
  const [modelId, setModelId] = useState(q.get("model") ?? "");
  const [version, setVersion] = useState(Number(q.get("version")) || 0);
  const [env, setEnv] = useState<Env>("development");
  const [conn, setConn] = useState("");
  const [name, setName] = useState("");
  const [engine, setEngine] = useState("vllm");
  const [shapeId, setShapeId] = useState("");
  const [prec, setPrec] = useState<(typeof PRECISIONS)[number]["id"]>("fp8");
  const [ctx, setCtx] = useState(8192);
  const [conc, setConc] = useState(16);
  const [gpuId, setGpuId] = useState("h100");
  const [toolkit, setToolkit] = useState("12.8");
  const [driver, setDriver] = useState("570.124.06");
  const [min, setMin] = useState(1);
  const [max, setMax] = useState(3);
  const [cpu, setCpu] = useState("8");
  const [memory, setMemory] = useState("64Gi");
  const [asProvider, setAsProvider] = useState(true);
  const [asMcp, setAsMcp] = useState(false);
  const [mcpId, setMcpId] = useState("new");
  const [toolName, setToolName] = useState("");
  const [toolDesc, setToolDesc] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState<null | { depId: string; providerId?: string; mcpId?: string; tool?: string; notes: string[] }>(null);

  const models = s?.models ?? [];
  const model = models.find((m) => m.id === (modelId || models[0]?.id));
  const ver = model?.versions.find((v) => v.version === (version || [...(model?.versions ?? [])].sort((a, b) => b.version - a.version)[0]?.version));
  const shape = SHAPES.find((x) => x.id === shapeId) ?? (ver ? nearestShape(ver.sizeMb) : SHAPES[0]);
  const rt = RUNTIMES.find((r) => r.id === engine)!;
  const useGpu = rt.gpu;
  const conns = (s?.connections ?? []).filter((c) => ["kubernetes", "kserve"].includes(c.integrationId) && c.env === env);
  const connection = conns.find((c) => c.id === conn) ?? conns[0];
  const baseName = (model?.id ?? "model").slice(0, 30);
  const depName = name || `${baseName}-${env === "production" ? "prod" : env === "staging" ? "staging" : "dev"}`;
  const inputs: Inputs = { model: shape, precision: PRECISIONS.find((p) => p.id === prec)!, kvBytes: 2, contextTokens: ctx, concurrency: conc, efficiency: 0.5 };
  const rows = useMemo(() => GPUS.map((g) => plan(g, inputs)), [shape, prec, ctx, conc]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = rows.find((r) => r.gpu.id === gpuId) ?? rows[0];
  const cuda = checkCuda(gpuId, toolkit, driver);
  const newest = newestSupported(gpuId, driver);

  if (!s || !servers) return <Loading />;
  if (!model || !ver) return <Notice tone="info" title="No model to deploy">Register a model first, then come back. <Link className="underline" href="/mlops/models">Model artifacts</Link></Notice>;

  const needsApproval = env !== "development" && ver.approval.state !== "approved" && ver.approval.state !== "not-required";
  const perm = can(role, env === "production" ? "deployment.promote" : "deployment.scale", env);
  const step0Ok = !needsApproval && perm.ok && !!connection && /^[a-z][a-z0-9-]{2,39}$/.test(depName);
  const step1Ok = !useGpu || (chosen.fits && cuda.verdict !== "blocked");
  const toolOk = !asMcp || (/^[a-z][a-z0-9_]{0,63}$/.test(toolName || depName.replace(/-/g, "_")) && (toolDesc || `Ask the ${model.name} model.`).length >= 10);

  const deploy = async () => {
    setErr("");
    const gpuCount = useGpu ? chosen.gpus : 0;
    const exposure: { providerId?: string; mcpServerId?: string; mcpTool?: string } = {};
    const notes: string[] = [];
    let providerId: string | undefined;
    if (asProvider && !live) { const base = slug(depName); let id = base, n = 2; while (providers.some((p) => p.id === id)) id = `${base}-${n++}`; providerId = id; exposure.providerId = id; }
    const r = await mlops.deployModel({ name: depName, modelId: model.id, version: ver.version, env, connectionId: connection!.id, runtime: rt.id, engine: rt.id, gpu: chosen.gpu.label, gpuCount, cuda: toolkit, driver, min, max, cpu, memory, exposure, precision: prec, contextTokens: ctx, concurrency: conc });
    if (!r.ok) { setErr(r.error); return; }
    if (providerId) {
      const reg: Registered = { id: providerId, name: `${depName} (self-hosted)`, kind: "Self-hosted", icon: rt.id === "vllm" || rt.id === "custom-container" ? siOllama : siNvidia, region: "us-east", priority: 3, status: "degraded", models: [depName], p50: 0, p99: 0, errorRatePct: 0, requestsPerDay: 0, spendPerDayUsd: 0, rpmLimit: 600, tpmLimit: 400000, secretRef: `secretref://vault/prod/providers/${providerId}/token`, selfHosted: true, fresh: true, specId: "self-hosted", secretRefs: [`secretref://vault/prod/providers/${providerId}/token`], note: "Deployed from the wizard. Marked degraded until the first replica passes its health check." };
      saveRegistered(reg);
    }
    let mcp: { id?: string; tool?: string } = {};
    if (asMcp && providerId) {
      const tn = toolName || depName.replace(/-/g, "_");
      let sid = mcpId;
      if (sid === "new") { const c = await mcpServers.create({ name: `${model.name} tools`, env, auth: "api-key" }); if (c.ok) { sid = c.id; mcpServers.update(sid, { tools: [] }); } else { notes.push(`The MCP server was not created: ${c.error}`); sid = ""; } }
      if (sid) {
        const t = await mcpServers.addModelTool(sid, { name: tn, description: toolDesc || `Ask the ${model.name} model a question and return its answer.`, alias: `${providerId}/${depName}`, instruction: "Answer briefly and only from the input." });
        if (t.ok) { mcp = { id: sid, tool: tn }; exposure.mcpServerId = sid; exposure.mcpTool = tn; } else notes.push(`The MCP tool was not added: ${t.error}`);
      }
    }
    setDone({ depId: r.id, providerId, mcpId: mcp.id, tool: mcp.tool, notes });
  };

  if (done) {
    return (
      <div className="space-y-6 max-w-5xl">
        <Notice tone="ok" title={`${depName} is deploying`}>Replicas are being scheduled on {connection!.name}. The first start loads the weights, which can take several minutes.{live ? " The deployment's health updates here as the cluster reports it." : " In the sample workspace nothing is scheduled; a signed-in workspace applies the manifest to your cluster."}</Notice>
        {done.notes.map((n) => <Notice key={n} tone="warn">{n}</Notice>)}
        <Card><CardHeader title="What was created" /><CardBody className="space-y-2 text-[13px]">
          <div className="flex justify-between"><span className="text-text-tertiary">Deployment</span><Link className="underline" href={`/mlops/deployments/${done.depId}`}>{depName}</Link></div>
          {done.providerId && <div className="flex justify-between"><span className="text-text-tertiary">Gateway provider</span><Link className="underline" href={`/providers/${done.providerId}`}>{depName} (self-hosted)</Link></div>}
          {done.mcpId && <div className="flex justify-between"><span className="text-text-tertiary">MCP tool</span><Link className="underline" href={`/mlops/mcp-servers/${done.mcpId}`}><span className="font-mono text-xs">{done.tool}</span></Link></div>}
        </CardBody></Card>
        <div className="flex gap-3"><Link href={`/mlops/deployments/${done.depId}`}><Button variant="primary">Open deployment</Button></Link><Link href="/mlops/deployments"><Button>All deployments</Button></Link><Link href="/mlops/canvas"><Button>See it on the AI canvas</Button></Link></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <Back href="/mlops/deployments" label="Deployments" />
      <PageHeader title="Deploy a model" description="Serve one of your registered model versions on your own cluster, then make it available to the gateway and to MCP clients." />
      <Stepper at={step} />

      {step === 0 && (
        <Card><CardBody className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Model"><Select value={model.id} onChange={(e) => { setModelId(e.target.value); setVersion(0); setShapeId(""); }}>{models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
          <Field label="Version"><Select value={ver.version} onChange={(e) => { setVersion(Number(e.target.value)); setShapeId(""); }}>{[...model.versions].sort((a, b) => b.version - a.version).map((v) => <option key={v.version} value={v.version}>v{v.version} ({v.approval.state === "not-required" ? "no approval needed" : v.approval.state})</option>)}</Select></Field>
          <Field label="Environment"><Select value={env} onChange={(e) => { setEnv(e.target.value as Env); setConn(""); }}>{ENVS.map((e) => <option key={e} value={e}>{ENV_LABEL[e]}</option>)}</Select></Field>
          <Field label="Cluster" hint={conns.length ? undefined : `No Kubernetes or KServe connection exists for ${ENV_LABEL[env]}.`}><Select value={connection?.id ?? ""} onChange={(e) => setConn(e.target.value)} disabled={!conns.length}>{conns.length ? conns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>) : <option value="">None available</option>}</Select></Field>
          <Field label="Deployment name" hint="Lowercase letters, digits and dashes. It becomes part of the endpoint."><Input value={name} placeholder={depName} onChange={(e) => setName(e.target.value)} /></Field>
          <div className="self-end text-xs text-text-secondary">{ver.framework}, {ver.format}, {(ver.sizeMb / 1024).toFixed(1)} GB on disk. <EnvBadge env={env} /></div>
          {needsApproval && <div className="md:col-span-2"><Notice tone="warn" title="This version is not approved">Only approved versions go to {ENV_LABEL[env]}. Request approval on the model page, or deploy to Development.</Notice></div>}
          {!perm.ok && <div className="md:col-span-2"><Notice tone="warn" title="Your role cannot deploy here">{perm.reason}</Notice></div>}
          <div className="md:col-span-2 flex justify-end"><Button variant="primary" disabled={!step0Ok} onClick={() => setStep(1)}>Continue <ArrowRight size={14} /></Button></div>
        </CardBody></Card>
      )}

      {step === 1 && (
        <div className="space-y-5">
          <Card><CardHeader title="Runtime" subtitle="The server that loads the weights and answers requests" />
            <CardBody className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {RUNTIMES.map((r) => (
                <button key={r.id} onClick={() => setEngine(r.id)} className={clsx("text-left rounded-md border p-3.5 transition-colors", engine === r.id ? "border-text-primary bg-surface-subtle" : "border-border hover:border-border-strong")}>
                  <div className="text-[13px] font-medium text-text-primary">{r.label}</div><div className="text-xs text-text-secondary mt-1 leading-relaxed">{r.note}</div>
                </button>
              ))}
            </CardBody></Card>
          {useGpu && (<>
            <Card><CardHeader title="Size the GPUs" subtitle={`Estimated for ${shape.label}. Change the shape if the guess from file size is wrong.`} />
              <CardBody className="space-y-4">
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                  <Field label="Model shape"><Select value={shape.id} onChange={(e) => setShapeId(e.target.value)}>{SHAPES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</Select></Field>
                  <Field label="Weight precision"><Select value={prec} onChange={(e) => setPrec(e.target.value as typeof prec)}>{PRECISIONS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select></Field>
                  <Field label="Context (tokens)"><Input type="number" min={512} step={512} value={ctx} onChange={(e) => setCtx(Math.max(512, Number(e.target.value) || 512))} /></Field>
                  <Field label="Concurrent requests"><Input type="number" min={1} value={conc} onChange={(e) => setConc(Math.max(1, Number(e.target.value) || 1))} /></Field>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {rows.map((r) => (
                    <button key={r.gpu.id} disabled={!r.fits} onClick={() => { setGpuId(r.gpu.id); const n = SAMPLE_FLEET.find((x) => x.gpuId === r.gpu.id); if (n) { setDriver(n.driver); setToolkit(newestSupported(r.gpu.id, n.driver)?.id ?? toolkit); } }}
                      className={clsx("text-left rounded-md border px-3.5 py-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed", gpuId === r.gpu.id ? "border-text-primary bg-surface-subtle" : "border-border hover:border-border-strong")}>
                      <div className="flex justify-between text-[13px]"><span className="font-medium">{r.gpu.label.replace("NVIDIA ", "")}</span>{r.fits ? <span className="tabular-nums">{r.gpus} GPU{r.gpus > 1 ? "s" : ""}</span> : <span className="text-text-tertiary">Does not fit</span>}</div>
                      <div className="text-xs text-text-tertiary tabular-nums mt-0.5">{r.fits ? `${Math.round(r.tokensPerSec).toLocaleString("en-US")} tok/s upper bound, $${r.costPerHour.toFixed(2)} per hour` : r.reason}</div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-text-tertiary">A roofline estimate from published specifications and placeholder rates. Measure on the real GPU before committing spend.</p>
              </CardBody></Card>
            <Card><CardHeader title="CUDA and driver" subtitle="The toolkit in the image must start on the node's driver" />
              <CardBody className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="CUDA toolkit in the image"><Select value={toolkit} onChange={(e) => setToolkit(e.target.value)}>{TOOLKITS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select></Field>
                  <Field label="Node driver version" hint="From nvidia-smi on the target node."><Input value={driver} onChange={(e) => setDriver(e.target.value)} spellCheck={false} /></Field>
                </div>
                {cuda.findings.map((f) => <Notice key={f.title} tone={f.level === "ok" ? "ok" : f.level === "caution" ? "warn" : "bad"} title={f.title}>{f.detail}</Notice>)}
                {cuda.fix && <p className="text-xs text-text-secondary">{cuda.fix}</p>}
                {newest && cuda.verdict !== "ok" && <p className="text-xs text-text-secondary">Newest toolkit that starts cleanly on {driver}: <span className="font-medium text-text-primary">{newest.label}</span>.</p>}
              </CardBody></Card>
          </>)}
          <div className="flex justify-between"><Button variant="ghost" onClick={() => setStep(0)}><ArrowLeft size={14} /> Model</Button><Button variant="primary" disabled={!step1Ok} onClick={() => setStep(2)}>Continue <ArrowRight size={14} /></Button></div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <Card><CardHeader title="Scaling" subtitle="Replicas are added when requests queue and removed when they idle" />
            <CardBody className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <Field label="Minimum replicas" hint={min === 0 ? "Scales to zero. The first request waits for the weights to load." : undefined}><Input type="number" min={0} max={20} value={min} onChange={(e) => setMin(Math.max(0, Number(e.target.value) || 0))} /></Field>
              <Field label="Maximum replicas"><Input type="number" min={1} max={20} value={max} onChange={(e) => setMax(Math.max(1, Number(e.target.value) || 1))} /></Field>
              <Field label="CPU per replica"><Input value={cpu} onChange={(e) => setCpu(e.target.value)} /></Field>
              <Field label="Memory per replica"><Input value={memory} onChange={(e) => setMemory(e.target.value)} /></Field>
              {useGpu && <p className="col-span-full text-xs text-text-secondary">Each replica uses {chosen.gpus} x {chosen.gpu.label}. At the maximum that is {chosen.gpus * max} GPUs, about ${(chosen.gpus * max * chosen.gpu.rateUsdHr).toFixed(2)} per hour at the placeholder rate.</p>}
            </CardBody></Card>
          {live ? (
            <Notice tone="info" title="Making it available">Once the deployment is ready, register its endpoint in the Provider registry to send traffic to it through the gateway with your keys, budgets and audit trail. It can then be offered to MCP clients as a tool from an MCP server.</Notice>
          ) : (
          <Card><CardHeader title="Who and what can use it" subtitle="A deployment has its own endpoint. These two options make it usable by people and applications." />
            <CardBody className="divide-y divide-border">
              <div>
                <Toggle checked={asProvider} onChange={setAsProvider} label="Register as a gateway provider" description="Applications call it through the gateway with your keys, budgets, policies and audit trail, and it can sit in a failover chain." />
                {asProvider && <p className="text-xs text-text-secondary pb-3">{OPENAI_API[rt.id]} The gateway sends the OpenAI chat format, so the server must answer it.</p>}
              </div>
              <div>
                <Toggle checked={asMcp} onChange={(v) => { setAsMcp(v); if (v) setAsProvider(true); }} label="Publish as an MCP tool" description="MCP clients such as agents and assistants can call this model as a tool. You decide who may use it on the MCP server page." />
                {asMcp && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
                    <Field label="MCP server"><Select value={mcpId} onChange={(e) => setMcpId(e.target.value)}><option value="new">Create a new server</option>{servers.filter((x) => x.env === env).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
                    <Field label="Tool name" hint="Lowercase letters, digits and underscores."><Input value={toolName} placeholder={depName.replace(/-/g, "_")} onChange={(e) => setToolName(e.target.value)} /></Field>
                    <div className="md:col-span-2"><Field label="Description for clients" hint="Clients read this to decide when to call the tool."><Input value={toolDesc} placeholder={`Ask the ${model.name} model a question and return its answer.`} onChange={(e) => setToolDesc(e.target.value)} /></Field></div>
                  </div>
                )}
              </div>
            </CardBody></Card>
          )}
          <div className="flex justify-between"><Button variant="ghost" onClick={() => setStep(1)}><ArrowLeft size={14} /> Runtime and GPU</Button><Button variant="primary" disabled={!toolOk || max < min} onClick={() => setStep(3)}>Review <ArrowRight size={14} /></Button></div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-5">
          <Card><CardHeader title="Review" /><CardBody className="space-y-2.5 text-[13px]">
            {([["Model", `${model.name} v${ver.version}`], ["Environment and cluster", `${ENV_LABEL[env]}, ${connection!.name}`], ["Deployment", depName], ["Runtime", rt.label], ["Accelerator", useGpu ? `${chosen.gpus} x ${chosen.gpu.label} per replica, CUDA ${toolkit} on driver ${driver}` : "CPU only"], ["Replicas", `${min} to ${max}`], ["Gateway provider", asProvider ? "Yes" : "No"], ["MCP tool", asMcp ? `Yes, ${toolName || depName.replace(/-/g, "_")}` : "No"]] as [string, string][]).filter(([k]) => !live || (k !== "Gateway provider" && k !== "MCP tool")).map(([k, v]) => <div key={k} className="flex justify-between gap-4"><span className="text-text-tertiary">{k}</span><span className="text-right">{v}</span></div>)}
          </CardBody></Card>
          {useGpu && <Card><CardHeader title="Manifest" subtitle="The sizing for this model. The name and image are set when it is applied, so pin the image before production." /><CardBody><CodeBlock code={manifest(chosen, inputs, rt.id)} language="yaml" title="deployment.yaml" maxHeight={280} /></CardBody></Card>}
          {err && <Notice tone="bad" title="Could not deploy">{err}</Notice>}
          <div className="flex justify-between"><Button variant="ghost" onClick={() => setStep(2)}><ArrowLeft size={14} /> Scaling and access</Button><Button variant="primary" onClick={deploy}>Deploy</Button></div>
        </div>
      )}
    </div>
  );
}

export default function DeployModelPage() {
  return <Suspense fallback={<Loading />}><Wizard /></Suspense>;
}
