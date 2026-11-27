"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowRight, Plus, Waypoints } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Kpi, Modal, Notice } from "@/components/mlops/ui";
import { OwnerSelect } from "@/components/org/OrgSelect";
import { meshes, useAgents } from "@/lib/agents/store";
import { blockers, meshStats, objectives, PATTERNS, ROLE_LABEL, scaffold, validateMesh, type Mesh, type MeshPattern } from "@/lib/agents/mesh";
import { compact } from "@/lib/agents/format";
import { toast } from "@/lib/mlops/toast";

const STATUS_TONE = { live: "healthy", draft: "neutral", paused: "degraded" } as const;

export default function MeshPage() {
  const { agents, networks, meshes: list } = useAgents(); const [creating, setCreating] = useState(false);
  const rows = useMemo(() => list.map((m) => { const st = meshStats(m, agents); return { m, st, obj: objectives(m, st), issues: validateMesh(m, agents, networks, list) }; }), [list, agents, networks]);
  const live = rows.filter((r) => r.m.status === "live");
  const atRisk = live.filter((r) => r.obj.some((o) => o.state !== "met"));
  const cases = live.reduce((s, r) => s + r.st.cases7d, 0);
  const members = new Set(list.flatMap((m) => m.members.map((x) => x.agentId))).size;

  return (
    <div className="space-y-6">
      <PageHeader title="Agent Mesh" description="Agents that work one use case together. Say who takes part and in which role, who may hand a case to whom and when, and what a case may cost and take. Then watch how a case moves through." action={<Button onClick={() => setCreating(true)}><Plus size={15} className="mr-1.5" />New mesh</Button>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Meshes" value={list.length} sub={`${live.length} live`} />
        <Kpi label="Agents in a mesh" value={members} sub={`of ${agents.filter((a) => a.state !== "retired").length}`} />
        <Kpi label="Cases, last 7 days" value={compact(cases)} sub="Live meshes" />
        <Kpi label="Objectives at risk" value={atRisk.length} tone={atRisk.length ? "warn" : undefined} sub={atRisk.length ? atRisk.map((r) => r.m.name).join(", ") : "All met"} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {rows.map(({ m, st, obj, issues }) => {
          const errs = blockers(issues).length; const warns = issues.length - errs;
          return (
            <Link key={m.id} href={`/agents/mesh/${m.id}`} className="group block">
              <Card className="h-full transition hover:border-border-strong hover:shadow-card">
                <CardBody className="space-y-4">
                  <div className="flex items-start gap-3">
                    <span className="h-10 w-10 rounded-lg grid place-items-center bg-surface-muted shrink-0"><Waypoints size={18} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><span className="text-base font-semibold">{m.name}</span><Badge tone={STATUS_TONE[m.status]}>{m.status}</Badge><Badge tone="info">{PATTERNS.find((p) => p.id === m.pattern)!.label}</Badge></div>
                      <div className="text-xs text-text-tertiary mt-0.5">{m.industry}. Owned by {m.owner}</div>
                    </div>
                    <ArrowRight size={16} className="text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
                  </div>
                  <p className="text-sm text-text-secondary">{m.useCase}.</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {m.members.map((x, i) => (<span key={x.agentId} className="inline-flex items-center gap-1.5 text-xs">{i > 0 && <ArrowRight size={11} className="text-text-tertiary" />}<span className="rounded-full border border-border bg-surface-subtle px-2 py-0.5">{agents.find((a) => a.id === x.agentId)?.title ?? x.agentId} <span className="text-text-tertiary">{ROLE_LABEL[x.role].toLowerCase()}</span></span></span>))}
                  </div>
                  <div className="grid grid-cols-3 gap-3 border-t border-border pt-3">
                    {obj.map((o) => (<div key={o.id}><div className={clsx("text-lg font-semibold tabular-nums", o.state === "missed" ? "text-status-down" : o.state === "close" ? "text-[#9A5F05]" : "")}>{o.actual}</div><div className="text-[11px] text-text-tertiary">{o.label}</div><div className="text-[11px] text-text-tertiary">Aim: {o.target}</div></div>))}
                  </div>
                  {(errs > 0 || warns > 0) && <div className="text-xs text-text-secondary">{errs > 0 && <span className="text-status-down font-medium">{errs} to fix</span>}{errs > 0 && warns > 0 && ", "}{warns > 0 && <span>{warns} to look at</span>}</div>}
                  <div className="text-xs text-text-tertiary tabular-nums">{compact(st.cases7d)} cases in 7 days. {st.escalationPct}% go to a person.</div>
                </CardBody>
              </Card>
            </Link>);
        })}
        {rows.length === 0 && <Card className="xl:col-span-2"><CardBody><p className="text-sm text-text-secondary">No meshes yet. A mesh is a few agents that work one use case together, such as a claim or a customer request.</p></CardBody></Card>}
      </div>
      {creating && <NewMesh onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewMesh({ onClose }: { onClose: () => void }) {
  const router = useRouter(); const { agents } = useAgents();
  const [f, setF] = useState({ name: "", useCase: "", industry: "", owner: "", pattern: "pipeline" as MeshPattern });
  const [picked, setPicked] = useState<string[]>([]); const [err, setErr] = useState("");
  const pool = agents.filter((a) => a.state !== "retired");
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const submit = () => {
    const s = scaffold(f.pattern, picked);
    const r = meshes.create({
      name: f.name, useCase: f.useCase, industry: f.industry || "General", goal: f.useCase, pattern: f.pattern, trigger: { kind: "api", label: "A call to the mesh" }, members: s.members, handoffs: s.handoffs,
      scenarios: [{ id: "sc_typical", title: "Typical case", subject: "a typical case", tags: [], share: 1 }], context: { sharing: "case", memory: "case", pii: "mask" },
      guardrails: { maxHops: 12, maxCostUsd: 2, maxMinutes: 20, loopGuard: true, maxVisits: 2, personBefore: s.members.filter((m) => m.role === "executor").map((m) => m.agentId), escalate: [] },
      slo: { successPct: 90, p95Min: 10, costPerCaseUsd: 1.5 }, owner: f.owner,
    });
    if (!r.ok) { setErr(r.error); return; }
    toast(`${r.value.name} created as a draft`); router.push(`/agents/mesh/${r.value.id}`);
  };
  return (
    <Modal open onClose={onClose} title="New mesh" wide footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit}>Create mesh</Button></>}>
      <div className="space-y-4">
        {err && <Notice tone="bad">{err}</Notice>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Motor claims" /></Field>
          <Field label="Industry or area"><Input value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })} placeholder="Insurance" /></Field>
        </div>
        <Field label="Use case" hint="One sentence on the job the mesh does for a case from start to finish."><Input value={f.useCase} onChange={(e) => setF({ ...f, useCase: e.target.value })} placeholder="Take a claim from first notice to a prepared payout" /></Field>
        <OwnerSelect value={f.owner} onChange={(v) => setF({ ...f, owner: v })} hint="The group or person who answers for the mesh." />
        <div>
          <div className="text-[13px] font-medium mb-1.5">How the agents work together</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {PATTERNS.map((p) => (<button key={p.id} type="button" onClick={() => setF({ ...f, pattern: p.id })} className={clsx("text-left rounded-md border p-3", f.pattern === p.id ? "border-text-primary bg-surface-subtle ring-1 ring-text-primary" : "border-border hover:border-border-strong")}><div className="text-sm font-medium">{p.label}</div><div className="text-xs text-text-secondary mt-0.5">{p.blurb}</div></button>))}
          </div>
        </div>
        <div>
          <div className="text-[13px] font-medium mb-1">Agents, in the order they work</div>
          <div className="text-xs text-text-tertiary mb-2">Pick them in order. The first takes the case in{f.pattern === "supervisor" || f.pattern === "router" ? " and decides who goes next" : ""}.{f.pattern === "review" ? " The last one checks the others." : ""} You can change roles and handoffs after.</div>
          <div className="max-h-56 overflow-y-auto rounded-md border border-border divide-y divide-border">
            {pool.map((a) => { const i = picked.indexOf(a.id); return (<label key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-surface-subtle"><input type="checkbox" checked={i >= 0} onChange={() => toggle(a.id)} /><span className="flex-1">{a.title}<span className="text-text-tertiary"> {a.department}</span></span>{i >= 0 && <span className="h-5 w-5 rounded-full bg-text-primary text-text-inverse text-[11px] grid place-items-center">{i + 1}</span>}</label>); })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
