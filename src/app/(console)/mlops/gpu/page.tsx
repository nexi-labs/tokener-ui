"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Form";
import { Badge } from "@/components/ui/Badge";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Kpi, Notice, Tabs } from "@/components/mlops/ui";
import { CodeBlock } from "@/components/mlops/Code";
import { SampleTag } from "@/components/gateway/bits";
import { ENGINES, GPUS, PRECISIONS, SHAPES, kvBytesPerToken, manifest, plan, type Inputs } from "@/lib/gateway/gpu";
import { CUDA_GPUS, TOOLKITS, checkCuda, newestSupported, toolkitById } from "@/lib/gateway/cuda";
import { MIG_PROFILES, SAMPLE_FLEET, smallestSlice } from "@/lib/gateway/fleet";

type Tab = "plan" | "cuda" | "fleet";

export default function GpuPage() {
  const [tab, setTab] = useState<Tab>("plan");
  return (
    <div className="space-y-5">
      <PageHeader title="GPU and CUDA" description="Size GPUs for a model before you provision them, check that a CUDA toolkit will start on a node's driver, and see how the fleet is used." />
      <Tabs label="GPU and CUDA" value={tab} onChange={setTab} tabs={[{ id: "plan", label: "Capacity planner" }, { id: "cuda", label: "CUDA compatibility" }, { id: "fleet", label: "Fleet and MIG" }]} />
      {tab === "plan" && <Planner />}
      {tab === "cuda" && <Cuda />}
      {tab === "fleet" && <Fleet />}
    </div>
  );
}

function Planner() {
  const [shape, setShape] = useState(SHAPES[2].id);
  const [prec, setPrec] = useState<(typeof PRECISIONS)[number]["id"]>("fp8");
  const [kv, setKv] = useState<1 | 2>(2);
  const [ctx, setCtx] = useState(8192);
  const [conc, setConc] = useState(32);
  const [eff, setEff] = useState(0.5);
  const [engine, setEngine] = useState("vllm");
  const [pick, setPick] = useState("h100");
  const i: Inputs = useMemo(() => ({ model: SHAPES.find((s) => s.id === shape)!, precision: PRECISIONS.find((p) => p.id === prec)!, kvBytes: kv, contextTokens: ctx, concurrency: conc, efficiency: eff }), [shape, prec, kv, ctx, conc, eff]);
  const rows = useMemo(() => GPUS.map((g) => plan(g, i)), [i]);
  const best = rows.filter((r) => r.fits).sort((a, b) => a.costPerMTokens - b.costPerMTokens)[0];
  const sel = rows.find((r) => r.gpu.id === pick) ?? rows[0];
  const eng = ENGINES.find((e) => e.id === engine)!;
  return (
    <div className="space-y-5">
      <Notice tone="info" title="An estimate, not a benchmark">Throughput is an upper bound from memory bandwidth and compute, and rates are placeholders. Use it to compare GPU types and shortlist, then measure with the real engine on the real GPU before you commit spend.</Notice>
      <Card>
        <CardHeader title="Workload" subtitle="What you want to serve" />
        <CardBody className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <Field label="Model"><Select value={shape} onChange={(e) => setShape(e.target.value)}>{SHAPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select></Field>
          <Field label="Weight precision"><Select value={prec} onChange={(e) => setPrec(e.target.value as typeof prec)}>{PRECISIONS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select></Field>
          <Field label="KV cache precision"><Select value={kv} onChange={(e) => setKv(Number(e.target.value) as 1 | 2)}><option value={2}>16 bit</option><option value={1}>8 bit</option></Select></Field>
          <Field label="Engine"><Select value={engine} onChange={(e) => setEngine(e.target.value)}>{ENGINES.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</Select></Field>
          <Field label="Context per request (tokens)"><Input type="number" min={512} step={512} value={ctx} onChange={(e) => setCtx(Math.max(512, Number(e.target.value) || 512))} /></Field>
          <Field label="Concurrent requests"><Input type="number" min={1} value={conc} onChange={(e) => setConc(Math.max(1, Number(e.target.value) || 1))} /></Field>
          <Field label={`Achieved fraction of peak (${Math.round(eff * 100)}%)`} hint="Real engines reach 30 to 70 percent. Lower is more cautious."><input type="range" min={0.3} max={0.7} step={0.05} value={eff} onChange={(e) => setEff(Number(e.target.value))} className="w-full accent-[#02F5A1]" /></Field>
          <div className="text-xs text-text-secondary self-end">KV cache for one token of this model: {(kvBytesPerToken(i.model, kv) / 1024).toFixed(0)} KiB.</div>
          <p className="md:col-span-2 xl:col-span-4 text-xs text-text-secondary">{eng.note}</p>
        </CardBody>
      </Card>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Weights" value={`${rows[0].weightsGb.toFixed(0)} GB`} sub={`${i.model.label} at ${i.precision.label}`} />
        <Kpi label="KV cache" value={`${rows[0].kvGb.toFixed(1)} GB`} sub={`${conc} requests of ${ctx.toLocaleString("en-US")} tokens`} />
        <Kpi label="Cheapest that fits" value={best ? best.gpu.label.replace("NVIDIA ", "") : "None"} sub={best ? `${best.gpus} GPU${best.gpus > 1 ? "s" : ""}, about $${best.costPerMTokens.toFixed(2)} per 1M tokens` : "Reduce context, concurrency or precision"} />
        <Kpi label="Placeholder rates" value="List price" sub="Replace with your negotiated rate" />
      </div>
      <Card>
        <Table>
          <Thead><tr><Th>GPU</Th><Th>GPUs needed</Th><Th>Memory per GPU</Th><Th>Headroom</Th><Th>Tokens per second</Th><Th>Per request</Th><Th>Limit</Th><Th>Per hour</Th><Th>Per 1M tokens</Th></tr></Thead>
          <tbody>
            {rows.map((r) => (
              <Tr key={r.gpu.id} onClick={() => setPick(r.gpu.id)} className={clsx("cursor-pointer", pick === r.gpu.id && "bg-surface-subtle")}>
                <Td><span className="font-medium">{r.gpu.label.replace("NVIDIA ", "")}</span><div className="text-xs text-text-tertiary">{r.gpu.memGb} GB, {r.gpu.interconnect}</div></Td>
                {r.fits ? (<>
                  <Td className="tabular-nums">{r.gpus}</Td><Td className="tabular-nums">{r.memPerGpuGb.toFixed(0)} GB</Td><Td className="tabular-nums">{r.headroomPct}%</Td>
                  <Td className="tabular-nums">{Math.round(r.tokensPerSec).toLocaleString("en-US")}</Td><Td className="tabular-nums">{r.perUserTokensPerSec.toFixed(0)} tok/s</Td><Td className="text-xs text-text-secondary">{r.bound}</Td>
                  <Td className="tabular-nums">${r.costPerHour.toFixed(2)}</Td><Td className="tabular-nums">{best && r.gpu.id === best.gpu.id ? <Badge tone="healthy">${r.costPerMTokens.toFixed(2)}</Badge> : `$${r.costPerMTokens.toFixed(2)}`}</Td>
                </>) : <Td colSpan={8} className="text-xs text-text-secondary">{r.reason ?? "Does not fit"}</Td>}
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
      {sel.fits && (
        <Card>
          <CardHeader title={`Starting manifest for ${sel.gpu.label}`} subtitle="Select another row to change the GPU. Pin the image version and review before applying." />
          <CardBody><CodeBlock code={manifest(sel, i, engine)} language="yaml" title="deployment.yaml" maxHeight={300} /></CardBody>
        </Card>
      )}
    </div>
  );
}

const TONE = { ok: "healthy", caution: "degraded", blocked: "down" } as const;
const WORD = { ok: "Compatible", caution: "Works with limits", blocked: "Will not start" } as const;

function Cuda() {
  const [gpu, setGpu] = useState("h100");
  const [tk, setTk] = useState("12.8");
  const [drv, setDrv] = useState("570.124.06");
  const r = useMemo(() => checkCuda(gpu, tk, drv), [gpu, tk, drv]);
  const newest = newestSupported(gpu, drv);
  const g = CUDA_GPUS.find((x) => x.id === gpu)!;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <Card className="lg:col-span-2">
        <CardHeader title="Your combination" subtitle="The GPU, the CUDA toolkit your image is built with and the driver on the node" />
        <CardBody className="space-y-4">
          <Field label="GPU"><Select value={gpu} onChange={(e) => setGpu(e.target.value)}>{CUDA_GPUS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</Select></Field>
          <Field label="CUDA toolkit in the container"><Select value={tk} onChange={(e) => setTk(e.target.value)}>{TOOLKITS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select></Field>
          <Field label="Node driver version" hint="Run nvidia-smi on the node and copy the Driver Version."><Input value={drv} onChange={(e) => setDrv(e.target.value)} spellCheck={false} /></Field>
          <p className="text-xs text-text-tertiary">{g.label}: {g.architecture}, compute capability {g.cc}.</p>
        </CardBody>
      </Card>
      <div className="lg:col-span-3 space-y-4">
        <Card>
          <CardHeader title="Result" action={<Badge tone={TONE[r.verdict]}>{WORD[r.verdict]}</Badge>} />
          <CardBody className="space-y-3">
            {r.findings.map((f) => (
              <div key={f.title} className="rounded-md border border-border px-4 py-3">
                <div className="flex items-center gap-2"><Badge tone={TONE[f.level]}>{f.level === "ok" ? "OK" : f.level === "caution" ? "Caution" : "Blocked"}</Badge><span className="text-[13px] font-medium text-text-primary">{f.title}</span></div>
                <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">{f.detail}</p>
              </div>
            ))}
            {r.fix && <Notice tone={r.verdict === "blocked" ? "bad" : "warn"} title="What to do">{r.fix}</Notice>}
            {newest && <p className="text-xs text-text-secondary">The newest toolkit that supports {g.label} and starts on driver {drv} without compatibility mode is <span className="font-medium text-text-primary">{newest.label}</span>.</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Driver minimums" subtitle="Linux x86_64, general availability release of each toolkit" />
          <Table>
            <Thead><tr><Th>Toolkit</Th><Th>Minimum driver</Th><Th>Minor version compatibility</Th></tr></Thead>
            <tbody>{TOOLKITS.map((t) => <Tr key={t.id} className={t.id === tk ? "bg-surface-subtle" : ""}><Td>{t.label}</Td><Td className="font-mono text-xs">{t.minDriver}</Td><Td className="text-xs text-text-secondary">{t.major === 12 ? "525 or newer, inside 12.x" : t.major === 11 ? "450 or newer, inside 11.x" : "Not covered by the 12.x rule"}</Td></Tr>)}</tbody>
          </Table>
          <p className="text-xs text-text-tertiary px-5 py-3 border-t border-border">Source: NVIDIA CUDA Toolkit release notes, and the CUDA Compatibility guide. This checks published tables and does not read a live node. Confirm with nvidia-smi.</p>
        </Card>
      </div>
    </div>
  );
}

function Fleet() {
  const [mig, setMig] = useState<"a100" | "h100">("a100");
  const [need, setNeed] = useState(14);
  const slice = smallestSlice(mig, need);
  const used = SAMPLE_FLEET.reduce((s, n) => s + n.count * n.usedPct / 100, 0), total = SAMPLE_FLEET.reduce((s, n) => s + n.count, 0);
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3"><SampleTag /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="GPUs" value={total} sub={`${SAMPLE_FLEET.length} nodes in ${new Set(SAMPLE_FLEET.map((n) => n.pool)).size} pools`} />
        <Kpi label="Average utilisation" value={`${Math.round((used / total) * 100)}%`} sub="Weighted by GPU count" />
        <Kpi label="Training" value={`${SAMPLE_FLEET.filter((n) => n.pool === "training").reduce((s, n) => s + n.count, 0)} GPUs`} sub="Not serving traffic" />
        <Kpi label="Drivers in use" value={new Set(SAMPLE_FLEET.map((n) => n.driver)).size} sub="Mixed drivers limit which toolkits run" tone={new Set(SAMPLE_FLEET.map((n) => n.driver)).size > 3 ? "warn" : undefined} />
      </div>
      <Card>
        <Table>
          <Thead><tr><Th>Node</Th><Th>Pool</Th><Th>GPUs</Th><Th>Compute</Th><Th>Memory</Th><Th>Driver</Th><Th>Newest toolkit that starts</Th><Th>Serving</Th></tr></Thead>
          <tbody>
            {SAMPLE_FLEET.map((n) => {
              const nt = newestSupported(n.gpuId, n.driver);
              return (
                <Tr key={n.id}>
                  <Td className="whitespace-nowrap"><span className="font-mono text-xs">{n.id}</span></Td><Td className="whitespace-nowrap">{n.pool}</Td>
                  <Td>{n.count} x {n.gpu.replace("NVIDIA ", "")}{n.mig && <div className="text-[11px] text-text-tertiary">MIG {n.mig}</div>}</Td>
                  <Td><Bar v={n.usedPct} /></Td><Td><Bar v={n.memUsedPct} /></Td>
                  <Td className="font-mono text-xs">{n.driver}</Td>
                  <Td className="text-xs">{nt ? nt.label : "None"}{toolkitById(n.cuda) && <span className="text-text-tertiary"> (running {n.cuda})</span>}</Td>
                  <Td className="text-xs text-text-secondary">{n.serving.join(", ")}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
      <Card>
        <CardHeader title="Multi-Instance GPU planner" subtitle="Split one A100 or H100 into isolated slices so small models do not each take a whole GPU" />
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="GPU"><Select value={mig} onChange={(e) => setMig(e.target.value as "a100" | "h100")}><option value="a100">A100 80 GB</option><option value="h100">H100 80 GB</option></Select></Field>
            <Field label="Memory one replica needs (GB)" hint="Weights plus runtime plus KV cache. The planner tab shows these."><Input type="number" min={1} value={need} onChange={(e) => setNeed(Math.max(1, Number(e.target.value) || 1))} /></Field>
            <div className="self-end text-[13px]">{slice ? <span>Use <span className="font-mono font-medium">{slice.id}</span>: {slice.perGpu} replica{slice.perGpu > 1 ? "s" : ""} per GPU.</span> : <span className="text-status-down">Does not fit in any slice. Use the whole GPU or more than one.</span>}</div>
          </div>
          <Table>
            <Thead><tr><Th>Profile</Th><Th>Compute slices</Th><Th>Memory</Th><Th>Most per GPU</Th></tr></Thead>
            <tbody>{MIG_PROFILES[mig].map((p) => <Tr key={p.id} className={slice?.id === p.id ? "bg-surface-subtle" : ""}><Td className="font-mono text-xs">{p.id}</Td><Td className="tabular-nums">{p.gpcs} of 7</Td><Td className="tabular-nums">{p.memGb} GB</Td><Td className="tabular-nums">{p.perGpu}</Td></Tr>)}</tbody>
          </Table>
          <p className="text-xs text-text-tertiary">A GPU holds one layout at a time, and changing it needs the GPU idle. Slices share no memory, so a noisy neighbour cannot starve a replica, but each slice has less bandwidth than the whole part.</p>
        </CardBody>
      </Card>
    </div>
  );
}

function Bar({ v }: { v: number }) {
  return <div className="flex items-center gap-2 w-28"><div className="h-1.5 flex-1 rounded bg-surface-muted overflow-hidden"><div className={clsx("h-full", v > 90 ? "bg-status-down" : v > 80 ? "bg-status-degraded" : "bg-accent-600")} style={{ width: `${v}%` }} /></div><span className="text-xs tabular-nums text-text-secondary w-8">{v}%</span></div>;
}
