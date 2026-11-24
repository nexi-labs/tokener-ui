"use client";

import clsx from "clsx";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Download, FlaskConical, Play, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select } from "@/components/ui/Form";
import { Kpi, Modal, Notice, Tabs } from "@/components/mlops/ui";
import { evals, useAgents } from "@/lib/agents/store";
import { SCORER_BY_KIND, compareRuns, runsToCsv, type EvalRun } from "@/lib/agents/evals";
import { ago } from "@/lib/agents/format";
import { toast } from "@/lib/mlops/toast";

type Tab = "runs" | "cases" | "scorers";
const pct = (n: number) => `${Math.round(n * 100)}%`;
const usd = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`;

export default function EvalsPage() {
  const s = useAgents(); const [sel, setSel] = useState(s.evalSuites[0]?.id ?? ""); const [tab, setTab] = useState<Tab>("runs"); const [open, setOpen] = useState(false);
  const suite = s.evalSuites.find((x) => x.id === sel) ?? s.evalSuites[0];
  const agent = (id: string) => s.agents.find((a) => a.id === id);
  const runsOf = (id: string) => s.evalRuns.filter((r) => r.suiteId === id).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const latest = (id: string) => runsOf(id).at(-1);
  const all = s.evalRuns; const failing = s.evalSuites.filter((x) => latest(x.id)?.status === "failed").length;
  const csv = () => { const blob = new Blob([runsToCsv(all, s.evalSuites, s.agents)], { type: "text/csv" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "agent-eval-runs.csv"; a.click(); URL.revokeObjectURL(a.href); };
  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div><h1 className="text-xl font-semibold tracking-tight">Evals</h1><p className="text-sm text-text-secondary mt-1 max-w-2xl">Suites of cases that check an agent before and after every change. A run scores each case, links to its trace, and is compared with the run before so a regression is named, not guessed.</p></div>
        <div className="flex gap-2"><Button variant="secondary" onClick={csv}><Download size={14} /> Export runs</Button><Button variant="primary" onClick={() => setOpen(true)}><Plus size={15} /> New suite</Button></div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6"><Kpi label="Suites" value={s.evalSuites.length} /><Kpi label="Runs" value={all.length} /><Kpi label="Latest runs failing" value={failing} tone={failing ? "bad" : undefined} sub={failing ? "Below their pass bar" : "All passing"} /><Kpi label="Cases" value={s.evalSuites.reduce((n, x) => n + x.cases.length, 0)} /></div>
      <Notice tone="info" title="Scoring is simulated here">In the sample workspace the agent is simulated and scores come from a seeded model of quality. Time and cost come from the generated trace. Real runs need the Agent OS API.</Notice>
      {!suite ? <div className="mt-5"><EmptyState icon={FlaskConical} title="No suites yet" description="A suite holds the cases and scorers for one agent." action={<Button variant="primary" onClick={() => setOpen(true)}>New suite</Button>} /></div> : (
        <div className="grid lg:grid-cols-[320px_1fr] gap-5 items-start pt-5">
          <Card><ul className="divide-y divide-border">{s.evalSuites.map((x) => { const l = latest(x.id); return (
            <li key={x.id}><button onClick={() => { setSel(x.id); setTab("runs"); }} aria-current={suite.id === x.id} className={clsx("w-full text-left px-5 py-3.5 hover:bg-surface-subtle", suite.id === x.id && "bg-surface-subtle")}>
              <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{x.name}</span>{l && <Badge tone={l.status === "passed" ? "healthy" : "down"}>{pct(l.passRate)}</Badge>}</div>
              <div className="text-xs text-text-tertiary mt-0.5">{agent(x.agentId)?.title ?? x.agentId}, {x.cases.length} cases</div></button></li>); })}</ul></Card>
          <div className="space-y-5">
            <Card><CardHeader title={suite.name} subtitle={suite.description || `For ${agent(suite.agentId)?.title}`} action={<Button variant="primary" onClick={() => { const r = evals.run(suite.id); r.ok ? toast(`Run ${r.value.status}: ${pct(r.value.passRate)} passed`, r.value.status === "passed" ? "success" : "error") : toast(r.error, "error"); }}><Play size={14} /> Run suite</Button>} />
              <CardBody className="pt-0"><Tabs<Tab> label="Suite sections" value={tab} onChange={setTab} tabs={[{ id: "runs", label: "Runs", count: runsOf(suite.id).length }, { id: "cases", label: "Cases", count: suite.cases.length }, { id: "scorers", label: "Scorers", count: suite.scorers.length }]} /></CardBody></Card>
            {tab === "runs" && <Runs suiteId={suite.id} runs={runsOf(suite.id)} />}
            {tab === "cases" && <Cases suiteId={suite.id} />}
            {tab === "scorers" && <Card><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-text-tertiary border-b border-border"><th className="px-5 py-2.5 font-medium">Scorer</th><th className="px-3 font-medium">Kind</th><th className="px-3 font-medium">Bar</th><th className="px-3 font-medium">Weight</th></tr></thead><tbody className="divide-y divide-border">{suite.scorers.map((x) => <tr key={x.id}><td className="px-5 py-2.5"><div className="font-medium">{x.label}</div><div className="text-xs text-text-tertiary">{x.detail}</div></td><td className="px-3 text-text-secondary">{SCORER_BY_KIND[x.kind].label}</td><td className="px-3 tabular-nums">{SCORER_BY_KIND[x.kind].unit === "score" ? pct(x.threshold) : SCORER_BY_KIND[x.kind].unit === "ms" ? `${x.threshold} ms` : usd(x.threshold)}</td><td className="px-3 tabular-nums">{x.weight}</td></tr>)}</tbody></table></div></Card>}
          </div>
        </div>
      )}
      {open && <NewSuite onClose={() => setOpen(false)} onSaved={(id) => { setSel(id); setTab("cases"); setOpen(false); }} />}
    </>
  );
}

function Runs({ suiteId, runs }: { suiteId: string; runs: EvalRun[] }) {
  const [open, setOpen] = useState<string>(runs.at(-1)?.id ?? ""); const [onlyFail, setOnlyFail] = useState(false);
  const suite = useAgents().evalSuites.find((x) => x.id === suiteId)!;
  if (!runs.length) return <EmptyState icon={FlaskConical} title="No runs yet" description="Run the suite to score every case." />;
  const run = runs.find((r) => r.id === open) ?? runs.at(-1)!; const prev = runs[runs.findIndex((r) => r.id === run.id) - 1]; const diff = compareRuns(prev, run);
  const caseOf = (id: string) => suite.cases.find((c) => c.id === id);
  const W = 640, H = 120, step = runs.length > 1 ? (W - 40) / (runs.length - 1) : 0;
  const pts = runs.map((r, i) => `${20 + i * step},${H - 20 - r.passRate * (H - 40)}`).join(" ");
  const rows = run.results.filter((r) => !onlyFail || !r.pass);
  return (
    <>
      <Card><CardHeader title="Pass rate over runs" subtitle="Select a point or a row to read its cases." /><CardBody>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[680px]" role="img" aria-label="Pass rate of each run"><line x1={20} x2={W - 20} y1={H - 20} y2={H - 20} stroke="rgb(var(--c-border))" /><polyline points={pts} fill="none" stroke="#07191E" strokeWidth={2} />
          {runs.map((r, i) => <g key={r.id}><circle cx={20 + i * step} cy={H - 20 - r.passRate * (H - 40)} r={r.id === run.id ? 6 : 4} fill={r.status === "passed" ? "#02F5A1" : "#D14343"} stroke="#07191E" strokeWidth={r.id === run.id ? 2 : 1} className="cursor-pointer" onClick={() => setOpen(r.id)} /><text x={20 + i * step} y={H - 4} textAnchor="middle" fontSize={10} fill="rgb(var(--c-text-tertiary))">{r.agentVersion}</text></g>)}</svg></CardBody></Card>
      <Card><CardHeader title={`Run ${ago(run.startedAt)}`} subtitle={`Version ${run.agentVersion}, ${run.trigger.replace("-", " ")}, ${(run.durationMs / 1000).toFixed(1)} s`} action={<Badge tone={run.status === "passed" ? "healthy" : "down"}>{run.status === "passed" ? "Passed" : "Failed"}</Badge>} />
        <CardBody className="space-y-4">
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm"><div><dt className="text-xs text-text-tertiary">Pass rate</dt><dd>{pct(run.passRate)}{prev && <span className="text-xs text-text-tertiary"> ({diff.passRateDelta >= 0 ? "+" : ""}{Math.round(diff.passRateDelta * 100)} points)</span>}</dd></div><div><dt className="text-xs text-text-tertiary">Mean score</dt><dd>{run.meanScore.toFixed(2)}</dd></div><div><dt className="text-xs text-text-tertiary">p95 time</dt><dd>{(run.p95Ms / 1000).toFixed(1)} s</dd></div><div><dt className="text-xs text-text-tertiary">Cost</dt><dd>{usd(run.costUsd)}</dd></div></dl>
          {diff.regressions.length > 0 && <Notice tone="bad" title={`${diff.regressions.length} ${diff.regressions.length === 1 ? "regression" : "regressions"} since the run before`}>Passed before, fails now: {diff.regressions.join(", ")}.</Notice>}
          {diff.fixes.length > 0 && <Notice tone="ok" title="Fixed since the run before">{diff.fixes.join(", ")}</Notice>}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyFail} onChange={(e) => setOnlyFail(e.target.checked)} /> Show failing cases only</label>
          <div className="overflow-x-auto rounded-md border border-border"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-text-tertiary border-b border-border"><th className="px-4 py-2 font-medium">Case</th><th className="px-3 font-medium">Result</th><th className="px-3 font-medium">Failed on</th><th className="px-3 font-medium">Time</th><th className="px-3 font-medium">Cost</th><th className="px-3" /></tr></thead>
            <tbody className="divide-y divide-border">{rows.map((r) => <tr key={r.caseId}><td className="px-4 py-2.5 max-w-sm"><div className="font-medium">{r.caseId}</div><div className="text-xs text-text-tertiary truncate">{caseOf(r.caseId)?.input}</div></td><td className="px-3"><Badge tone={r.pass ? "healthy" : "down"}>{r.pass ? "Pass" : "Fail"}</Badge></td><td className="px-3 text-text-secondary">{r.failed.length ? r.failed.map((f) => suite.scorers.find((x) => x.id === f)?.label ?? f).join(", ") : ""}</td><td className="px-3 tabular-nums">{(r.durMs / 1000).toFixed(1)} s</td><td className="px-3 tabular-nums">{usd(r.costUsd)}</td><td className="px-3 text-right"><Link className="underline text-[13px]" href={`/agents/traces?trace=${r.traceId}`}>Trace</Link></td></tr>)}
              {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-text-secondary">Every case passed.</td></tr>}</tbody></table></div>
        </CardBody></Card>
    </>
  );
}

function Cases({ suiteId }: { suiteId: string }) {
  const suite = useAgents().evalSuites.find((x) => x.id === suiteId)!; const [input, setInput] = useState(""); const [expected, setExpected] = useState(""); const [err, setErr] = useState("");
  return (
    <Card><CardHeader title="Cases" subtitle="One input and the answer you expect. A scorer decides what counts as a match." /><CardBody className="space-y-4">
      <div className="rounded-md border border-border divide-y divide-border">{suite.cases.map((c) => <div key={c.id} className="flex items-start gap-3 px-4 py-3 text-sm"><span className="w-10 text-text-tertiary tabular-nums">{c.id}</span><div className="flex-1 min-w-0"><div>{c.input}</div><div className="text-xs text-text-tertiary mt-0.5">Expect: {c.expected}</div></div><button aria-label={`Remove ${c.id}`} onClick={() => evals.removeCase(suite.id, c.id)} className="text-text-tertiary hover:text-status-down"><Trash2 size={15} /></button></div>)}{suite.cases.length === 0 && <p className="px-4 py-5 text-sm text-text-secondary">No cases yet.</p>}</div>
      <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end"><Field label="Input"><Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Where is my order 4411?" /></Field><Field label="Expected answer"><Input value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="It ships Tuesday" /></Field><Button variant="secondary" onClick={() => { const r = evals.addCase(suite.id, { input, expected }); if (!r.ok) return setErr(r.error); setErr(""); setInput(""); setExpected(""); }}>Add case</Button></div>
      {err && <Notice tone="bad">{err}</Notice>}</CardBody></Card>
  );
}

function NewSuite({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const { agents } = useAgents(); const usable = useMemo(() => agents.filter((a) => a.control !== "inventory" && a.state !== "retired"), [agents]);
  const [agentId, setAgentId] = useState(usable[0]?.id ?? ""); const [name, setName] = useState(""); const [err, setErr] = useState("");
  return (
    <Modal open onClose={onClose} title="New suite" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { const r = evals.createSuite(agentId, name); if (!r.ok) return setErr(r.error); toast("Suite created", "success"); onSaved(r.value.id); }}>Create suite</Button></>}>
      <div className="space-y-4"><Field label="Agent" hint="Agents that are only registered have no runs to evaluate, so they are not listed."><Select aria-label="Agent" value={agentId} onChange={(e) => setAgentId(e.target.value)}>{usable.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}</Select></Field><Field label="Name"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Refund policy answers" /></Field>{err && <Notice tone="bad">{err}</Notice>}</div>
    </Modal>
  );
}
