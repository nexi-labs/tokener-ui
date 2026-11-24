"use client";

import clsx from "clsx";
import Link from "next/link";
import { useMemo, useState } from "react";
import { GitFork, Play, Plus, Workflow as FlowIcon } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select } from "@/components/ui/Form";
import { Kpi, Modal, Notice } from "@/components/mlops/ui";
import { OwnerSelect } from "@/components/org/OrgSelect";
import { AgentChip, useAgentColors } from "@/components/agents/bits";
import { useAgents, workflows as wf } from "@/lib/agents/store";
import type { Workflow, WorkflowPattern } from "@/lib/agents/types";
import { ago } from "@/lib/agents/format";
import { toast } from "@/lib/mlops/toast";

const PATTERN: Record<WorkflowPattern, { label: string; what: string }> = {
  sequential: { label: "Sequential", what: "Each agent hands its result to the next. Total time is the sum of the steps." },
  parallel: { label: "Parallel", what: "Every agent starts at once and the results are joined. Total time is the slowest step." },
  supervisor: { label: "Supervisor", what: "The first agent decides which of the others to call and in what order." },
};
const money = (n: number) => "$" + n.toFixed(2);
const dur = (ms: number) => (ms >= 60_000 ? `${(ms / 60_000).toFixed(1)} min` : `${(ms / 1000).toFixed(1)} s`);

/** The shape of a workflow: a chain, a fan out and join, or a hub with spokes. Drawn from the agents in it. */
function Shape({ w, names, colors }: { w: Workflow; names: (id: string) => string; colors: Record<string, string> }) {
  const n = w.agents.length; const W = Math.max(520, n * 150); const H = w.pattern === "sequential" ? 90 : Math.max(120, n * 54);
  const node = (id: string, x: number, y: number) => (
    <g key={id} transform={`translate(${x} ${y})`}><rect x={-62} y={-17} width={124} height={34} rx={17} fill="rgb(var(--c-surface))" stroke={colors[id] ?? "#8A9A9F"} strokeWidth={2} /><text textAnchor="middle" y={5} fontSize={12.5} fill="rgb(var(--c-text-primary))">{names(id).length > 16 ? names(id).slice(0, 15) + "…" : names(id)}</text></g>
  );
  const line = (x1: number, y1: number, x2: number, y2: number, k: string) => <path key={k} d={`M${x1} ${y1} C${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`} fill="none" stroke="rgb(var(--c-border-strong))" strokeWidth={1.6} markerEnd="url(#cd-arrow)" />;
  const els: React.ReactNode[] = [];
  if (w.pattern === "sequential") { const step = (W - 150) / Math.max(1, n - 1); w.agents.forEach((id, i) => { els.push(node(id, 75 + i * step, 45)); if (i) els.push(line(75 + (i - 1) * step + 62, 45, 75 + i * step - 64, 45, `l${i}`)); }); }
  else if (w.pattern === "parallel") { const gap = H / (n + 1); w.agents.forEach((id, i) => { const y = gap * (i + 1); els.push(node(id, W / 2, y)); els.push(line(70, H / 2, W / 2 - 64, y, `a${i}`), line(W / 2 + 62, y, W - 70, H / 2, `b${i}`)); }); els.push(<text key="s" x={40} y={H / 2 + 4} textAnchor="middle" fontSize={11.5} fill="rgb(var(--c-text-tertiary))">Input</text>, <text key="j" x={W - 36} y={H / 2 + 4} textAnchor="middle" fontSize={11.5} fill="rgb(var(--c-text-tertiary))">Join</text>); }
  else { const [sup, ...rest] = w.agents; const gap = H / (rest.length + 1); els.push(node(sup, 90, H / 2)); rest.forEach((id, i) => { els.push(node(id, W - 90, gap * (i + 1))); els.push(line(90 + 62, H / 2, W - 90 - 64, gap * (i + 1), `s${i}`)); }); }
  return <svg viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: W }} className="w-full" role="img" aria-label={`${PATTERN[w.pattern].label} workflow of ${n} agents`}><defs><marker id="cd-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" fill="rgb(var(--c-border-strong))" /></marker></defs>{els}</svg>;
}

export default function ConductorPage() {
  const s = useAgents(); const colors = useAgentColors();
  const [sel, setSel] = useState(s.workflows[0]?.id ?? ""); const [open, setOpen] = useState(false);
  const w = s.workflows.find((x) => x.id === sel) ?? s.workflows[0];
  const name = (id: string) => s.agents.find((a) => a.id === id)?.title ?? id;
  const runs = s.workflows.flatMap((x) => x.runs); const ok = runs.filter((r) => r.status === "succeeded").length;
  const blocked = (x: Workflow) => x.agents.filter((id) => s.agents.find((a) => a.id === id)?.state !== "active").length;
  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div><h1 className="text-xl font-semibold tracking-tight">Conductor</h1><p className="text-sm text-text-secondary mt-1 max-w-2xl">Workflows that chain agents for one business request, with a timeout and a budget for the whole run. Every run shares one correlation id, so its traces, cost and approvals read as one story.</p></div>
        <Button variant="primary" onClick={() => setOpen(true)}><Plus size={15} /> New workflow</Button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Kpi label="Workflows" value={s.workflows.length} /><Kpi label="Runs" value={runs.length} sub="Across all workflows" />
        <Kpi label="Success rate" value={runs.length ? `${Math.round((ok / runs.length) * 100)}%` : "None yet"} tone={runs.length && ok / runs.length < 0.8 ? "warn" : undefined} />
        <Kpi label="Spent on runs" value={money(runs.reduce((x, r) => x + r.costUsd, 0))} />
      </div>
      {s.workflows.length === 0 ? <EmptyState icon={FlowIcon} title="No workflows yet" description="Chain two or more agents into one governed run." action={<Button variant="primary" onClick={() => setOpen(true)}>New workflow</Button>} /> : (
        <div className="grid lg:grid-cols-[340px_1fr] gap-5 items-start">
          <Card><ul className="divide-y divide-border">{s.workflows.map((x) => (
            <li key={x.id}><button onClick={() => setSel(x.id)} aria-current={w?.id === x.id} className={clsx("w-full text-left px-5 py-3.5 hover:bg-surface-subtle", w?.id === x.id && "bg-surface-subtle")}>
              <div className="flex items-center gap-2"><span className="text-sm font-medium">{x.name}</span>{blocked(x) > 0 && <Badge tone="degraded">{blocked(x)} not active</Badge>}</div>
              <div className="text-xs text-text-tertiary mt-0.5">{PATTERN[x.pattern].label}, {x.agents.length} agents, {x.runs.length} runs</div></button></li>))}</ul></Card>
          {w && (
            <div className="space-y-5">
              <Card><CardHeader title={w.name} subtitle={w.description} action={<Button variant="primary" onClick={() => { const r = wf.run(w.id); r.ok ? toast("Run succeeded", "success") : toast(r.error, "error"); }}><Play size={14} /> Run now</Button>} />
                <CardBody className="space-y-4">
                  <Shape w={w} names={name} colors={colors} />
                  <p className="text-sm text-text-secondary">{PATTERN[w.pattern].what}</p>
                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm"><div><dt className="text-xs text-text-tertiary">Timeout</dt><dd>{w.timeoutSec} s</dd></div><div><dt className="text-xs text-text-tertiary">Budget per run</dt><dd>{money(w.budgetUsd)}</dd></div><div><dt className="text-xs text-text-tertiary">Owner</dt><dd>{w.owner}</dd></div><div><dt className="text-xs text-text-tertiary">Made</dt><dd>{ago(w.createdAt)}</dd></div></dl>
                  <div className="flex flex-wrap gap-1.5">{w.agents.map((id) => <Link key={id} href={`/agents/registry/${id}`}><AgentChip name={name(id)} color={colors[id] ?? "#8A9A9F"} /></Link>)}</div>
                  {blocked(w) > 0 && <Notice tone="warn">An agent here is suspended or retired, so its step is skipped and the run fails.</Notice>}
                </CardBody></Card>
              <Card><CardHeader title="Runs" subtitle="Runs here are simulated from each agent's typical cost and latency in the sample workspace." />
                <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-text-tertiary border-b border-border"><th className="px-5 py-2.5 font-medium">Started</th><th className="px-3 font-medium">Result</th><th className="px-3 font-medium">Time</th><th className="px-3 font-medium">Cost</th><th className="px-3 font-medium">Steps</th></tr></thead>
                  <tbody className="divide-y divide-border">{w.runs.map((r) => (
                    <tr key={r.id}><td className="px-5 py-2.5 text-text-secondary">{ago(r.startedAt)}</td><td className="px-3"><Badge tone={r.status === "succeeded" ? "healthy" : r.status === "failed" ? "down" : "neutral"}>{r.status === "succeeded" ? "Succeeded" : r.status === "failed" ? "Failed" : r.status}</Badge></td><td className="px-3 tabular-nums">{dur(r.durationMs)}</td><td className="px-3 tabular-nums">{money(r.costUsd)}</td>
                      <td className="px-3"><div className="flex gap-1">{r.steps.map((st, i) => <span key={i} title={`${name(st.agentId)}: ${st.status}`} className={clsx("h-2.5 w-6 rounded-full", st.status === "ok" ? "bg-status-healthy" : st.status === "error" ? "bg-status-down" : "bg-border-strong")} />)}</div></td></tr>))}
                    {w.runs.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-text-secondary">No runs yet.</td></tr>}</tbody></table></div></Card>
            </div>
          )}
        </div>
      )}
      {open && <NewWorkflow onClose={() => setOpen(false)} onSaved={(id) => { setSel(id); setOpen(false); }} />}
    </>
  );
}

function NewWorkflow({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const { agents } = useAgents(); const usable = useMemo(() => agents.filter((a) => a.state === "active"), [agents]);
  const [f, setF] = useState({ name: "", description: "", pattern: "sequential" as WorkflowPattern, agents: [] as string[], timeoutSec: 300, budgetUsd: 1, owner: "" });
  const [err, setErr] = useState("");
  const toggle = (id: string) => setF((x) => ({ ...x, agents: x.agents.includes(id) ? x.agents.filter((a) => a !== id) : [...x.agents, id] }));
  const move = (i: number, d: -1 | 1) => setF((x) => { const a = [...x.agents]; const j = i + d; if (j < 0 || j >= a.length) return x; [a[i], a[j]] = [a[j], a[i]]; return { ...x, agents: a }; });
  const nm = (id: string) => agents.find((a) => a.id === id)?.title ?? id;
  return (
    <Modal open wide onClose={onClose} title="New workflow" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { if (!f.owner) return setErr("Choose who answers for this workflow."); const r = wf.save(f); if (!r.ok) return setErr(r.error); toast("Workflow created", "success"); onSaved(r.value.id); }}>Create workflow</Button></>}>
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4"><Field label="Name"><Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Claim intake" /></Field><OwnerSelect value={f.owner} onChange={(v) => setF({ ...f, owner: v })} /></div>
        <Field label="What it does"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="grid sm:grid-cols-3 gap-4"><Field label="Pattern"><Select aria-label="Pattern" value={f.pattern} onChange={(e) => setF({ ...f, pattern: e.target.value as WorkflowPattern })}>{(Object.keys(PATTERN) as WorkflowPattern[]).map((p) => <option key={p} value={p}>{PATTERN[p].label}</option>)}</Select></Field>
          <Field label="Timeout (seconds)"><Input type="number" min={1} value={f.timeoutSec} onChange={(e) => setF({ ...f, timeoutSec: Number(e.target.value) })} /></Field><Field label="Budget per run (USD)"><Input type="number" min={0.01} step={0.1} value={f.budgetUsd} onChange={(e) => setF({ ...f, budgetUsd: Number(e.target.value) })} /></Field></div>
        <p className="text-xs text-text-tertiary -mt-2">{PATTERN[f.pattern].what}</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><div className="text-[13px] font-medium mb-1.5">Agents <span className="text-text-tertiary font-normal">(active only)</span></div><div className="max-h-56 overflow-auto rounded-md border border-border divide-y divide-border">{usable.map((a) => <label key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-surface-subtle"><input type="checkbox" checked={f.agents.includes(a.id)} onChange={() => toggle(a.id)} /><span>{a.title}</span></label>)}</div></div>
          <div><div className="text-[13px] font-medium mb-1.5">{f.pattern === "supervisor" ? "Order (first is the supervisor)" : "Order"}</div>{f.agents.length === 0 ? <p className="text-sm text-text-secondary">Choose at least two agents.</p> : <ol className="rounded-md border border-border divide-y divide-border">{f.agents.map((id, i) => <li key={id} className="flex items-center gap-2 px-3 py-2 text-sm"><span className="w-5 text-text-tertiary tabular-nums">{i + 1}</span><span className="flex-1">{nm(id)}{f.pattern === "supervisor" && i === 0 && <Badge tone="info">Supervisor</Badge>}</span><button type="button" aria-label={`Move ${nm(id)} up`} disabled={i === 0} onClick={() => move(i, -1)} className="px-1.5 disabled:opacity-30">Up</button><button type="button" aria-label={`Move ${nm(id)} down`} disabled={i === f.agents.length - 1} onClick={() => move(i, 1)} className="px-1.5 disabled:opacity-30">Down</button></li>)}</ol>}</div>
        </div>
        {err && <Notice tone="bad">{err}</Notice>}
      </div>
    </Modal>
  );
}
