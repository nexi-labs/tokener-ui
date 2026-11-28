"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import { Check, Minus, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Form";
import { Kpi, Notice, Tabs } from "@/components/mlops/ui";
import { NodeIcon } from "@/components/studio/icons";
import { Button } from "@/components/ui/Button";
import { STATUS_LEGEND } from "@/lib/mlops/catalog";
import { submit, useRequests } from "@/lib/platform/requests";
import { toast } from "@/lib/mlops/toast";
import type { IntegrationStatus } from "@/lib/mlops/types";
import { ADAPTERS, type AdapterDef, type Support } from "@/lib/agents/adapters";

type Kind = "all" | AdapterDef["kind"];
const KIND_LABEL: Record<AdapterDef["kind"], string> = { framework: "Frameworks", platform: "Agent platforms", protocol: "Protocols" };
const KIND_HELP: Record<AdapterDef["kind"], string> = {
  framework: "Agent Forge generates a project on this framework, wired to the tok∑ner gateway.",
  platform: "An agent that already runs on a vendor platform. tok∑ner connects to it, registers it and observes it.",
  protocol: "An agent that speaks an open protocol. Connect it by address.",
};
const FEATURES: { key: keyof NonNullable<AdapterDef["build"]>["features"]; label: string }[] = [
  { key: "tools", label: "Tools" }, { key: "mcp", label: "MCP" }, { key: "streaming", label: "Streaming" }, { key: "memory", label: "Memory" }, { key: "multiAgent", label: "Multi agent" }, { key: "humanInLoop", label: "Human approval" }, { key: "otel", label: "OpenTelemetry" },
];
const Mark = ({ v }: { v: Support }) => v === "yes" ? <Check size={15} className="text-status-healthy" aria-label="Yes" /> : v === "partial" ? <Minus size={15} className="text-status-degraded" aria-label="Partly" /> : <X size={15} className="text-text-tertiary" aria-label="No" />;

export default function AdaptersPage() {
  const { adapterStatus, requests } = useRequests(); const st = (id: string): IntegrationStatus => adapterStatus[id] ?? "planned";
  const [kind, setKind] = useState<Kind>("all"); const [q, setQ] = useState(""); const [sel, setSel] = useState<string>("langgraph");
  const list = useMemo(() => ADAPTERS.filter((a) => (kind === "all" || a.kind === kind) && (!q || (a.name + a.vendor).toLowerCase().includes(q.toLowerCase()))), [kind, q]);
  const a = ADAPTERS.find((x) => x.id === sel) ?? ADAPTERS[0];
  const count = (k: AdapterDef["kind"]) => ADAPTERS.filter((x) => x.kind === k).length;
  return (
    <>
      <div className="mb-6"><h1 className="text-xl font-semibold tracking-tight">Framework Adapters</h1><p className="text-sm text-text-secondary mt-1 max-w-2xl">How agents get onto tok∑ner: build one on a framework in Agent Forge, connect one that runs on a vendor platform, or reach any agent that speaks an open protocol. Each adapter says exactly what it does and what it leaves to you.</p></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Kpi label="Adapters" value={ADAPTERS.length} /><Kpi label="Build targets" value={ADAPTERS.filter((x) => x.build).length} sub="Agent Forge can scaffold these" /><Kpi label="Connectors" value={ADAPTERS.filter((x) => x.connect).length} sub="Platforms and protocols" /><Kpi label="Beta or Available" value={ADAPTERS.filter((x) => x.connect && st(x.id) !== "planned").length} sub="Platform admins approve each one" />
      </div>
      <Notice tone="info" title="What is real today">Forge scaffolds are templates you review before running. A connector stays In development until a platform admin approves it for Beta or Available after contract, security and sandbox checks. None has been run against a vendor's live service from this workspace.</Notice>
      <div className="mt-5"><Tabs<Kind> label="Adapter kinds" value={kind} onChange={setKind} tabs={[{ id: "all", label: "All", count: ADAPTERS.length }, ...(Object.keys(KIND_LABEL) as AdapterDef["kind"][]).map((k) => ({ id: k, label: KIND_LABEL[k], count: count(k) }))]} /></div>
      <div className="grid lg:grid-cols-[360px_1fr] gap-5 items-start pt-5">
        <Card>
          <div className="p-3 border-b border-border relative"><Search size={14} className="absolute left-6 top-1/2 -translate-y-1/2 text-text-tertiary" /><Input aria-label="Search adapters" className="pl-8" placeholder="Search adapters" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <ul className="divide-y divide-border max-h-[640px] overflow-auto">{list.map((x) => (
            <li key={x.id}><button onClick={() => setSel(x.id)} aria-current={a.id === x.id} className={clsx("w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-subtle", a.id === x.id && "bg-surface-subtle")}>
              <span className="grid h-8 w-8 place-items-center rounded-md bg-surface-muted shrink-0"><NodeIcon icon={x.icon} size={18} /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium truncate">{x.name}</span><span className="block text-xs text-text-tertiary truncate">{x.vendor}, {KIND_LABEL[x.kind].toLowerCase()}</span></span>
              {x.connect && <Badge tone={STATUS_LEGEND[st(x.id)].tone}>{STATUS_LEGEND[st(x.id)].label}</Badge>}</button></li>))}
            {list.length === 0 && <li className="px-4 py-8 text-center text-sm text-text-secondary">No adapter matches.</li>}</ul>
        </Card>
        <div className="space-y-5">
          <Card><CardHeader title={a.name} subtitle={a.blurb} action={<span className="grid h-9 w-9 place-items-center rounded-md bg-surface-muted"><NodeIcon icon={a.icon} size={22} /></span>} />
            <CardBody className="space-y-3"><p className="text-sm text-text-secondary">{KIND_HELP[a.kind]}</p><div className="flex flex-wrap gap-2 text-xs"><Badge tone="info">{a.vendor}</Badge>{a.build && <Badge>Agent Forge target</Badge>}{a.connect && <Badge>Connect an existing agent</Badge>}</div>
              {a.docs.length > 0 && <div className="flex flex-wrap gap-3 text-sm">{a.docs.map((d) => <a key={d.url} href={d.url} target="_blank" rel="noreferrer" className="underline">{d.label}</a>)}</div>}</CardBody></Card>
          {a.build && (
            <Card><CardHeader title="Build on it" subtitle="What Agent Forge generates for this framework." />
              <CardBody className="space-y-4">
                <dl className="grid sm:grid-cols-2 gap-4 text-sm"><div><dt className="text-xs text-text-tertiary">Language</dt><dd>{a.build.language === "spec" ? "A specification, no code" : a.build.language === "python" ? "Python" : "TypeScript"}</dd></div><div><dt className="text-xs text-text-tertiary">Packages</dt><dd className="font-mono text-[13px]">{a.build.packages.length ? a.build.packages.join(", ") : "None"}</dd></div></dl>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2.5">{FEATURES.map((f) => <div key={f.key} className="flex items-center gap-2 text-sm"><Mark v={a.build!.features[f.key]} />{f.label}</div>)}</div>
                <p className="text-sm text-text-secondary">{a.build.notes}</p></CardBody></Card>
          )}
          {a.connect && (
            <Card><CardHeader title="Connect an existing agent" subtitle={`Targets ${a.connect.versionTarget}. Confirmed against the live service at connect time.`} action={(() => { const open = requests.find((r) => r.target === a.id && (r.status === "pending" || r.status === "needs-info")); return open ? <Badge tone="info">Requested, {open.status === "pending" ? "waiting for a platform admin" : "a question is waiting for you"}</Badge> : st(a.id) === "available" ? <Badge tone="healthy">Available</Badge> : <Button variant="secondary" onClick={() => { const r = submit({ kind: "adapter", target: a.id, targetName: a.name, org: "NexI", requestedBy: "James Doe", from: st(a.id), to: st(a.id) === "planned" ? "beta" : "available", why: `We want to govern agents that run on ${a.name}.` }); r.ok ? toast("Request sent to the platform admins", "success") : toast(r.error, "error"); }}>Request {st(a.id) === "planned" ? "Beta" : "Available"}</Button>; })()} />
              <CardBody className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-5 text-sm"><div><div className="text-xs text-text-tertiary mb-1">Before you connect</div><ul className="list-disc pl-4 space-y-1">{a.connect.prerequisites.map((p) => <li key={p}>{p}</li>)}</ul></div><div><div className="text-xs text-text-tertiary mb-1">Limits</div><ul className="list-disc pl-4 space-y-1">{a.connect.limitations.map((p) => <li key={p}>{p}</li>)}</ul></div></div>
                <div className="grid sm:grid-cols-2 gap-5 text-sm"><div><div className="text-xs text-text-tertiary mb-1">tok∑ner reads</div><ul className="list-disc pl-4 space-y-1">{a.connect.permissions.read.map((p) => <li key={p}>{p}</li>)}</ul></div><div><div className="text-xs text-text-tertiary mb-1">tok∑ner may do</div><ul className="list-disc pl-4 space-y-1">{a.connect.permissions.write.map((p) => <li key={p}>{p}</li>)}</ul></div></div>
                {a.connect.compliance && <Notice tone="warn" title="Your responsibilities"><ul className="list-disc pl-4 space-y-1">{a.connect.compliance.map((c) => <li key={c}>{c}</li>)}</ul></Notice>}
              </CardBody></Card>
          )}
        </div>
      </div>
    </>
  );
}
