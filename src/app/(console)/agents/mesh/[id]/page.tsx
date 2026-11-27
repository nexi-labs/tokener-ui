"use client";

import clsx from "clsx";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Hand, Pause, Play, Plus, RotateCcw, SkipBack, SkipForward, Trash2, User, Waypoints } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select, Toggle } from "@/components/ui/Form";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Confirm, Kpi, Notice, Tabs } from "@/components/mlops/ui";
import { MeshCanvas } from "@/components/agents/MeshCanvas";
import { meshes, useAgents } from "@/lib/agents/store";
import { assess, memberCounts, pathOf, PATH_LABEL } from "@/lib/agents/network";
import { blockers, CARRY_LABEL, describeWhen, meshStats, objectives, PATTERNS, ROLE_LABEL, ROLES, runCase, validateMesh, whenTags, type Carry, type Mesh, type MeshRole } from "@/lib/agents/mesh";
import { dur, usd } from "@/lib/agents/format";
import { toast } from "@/lib/mlops/toast";

type Tab = "live" | "design" | "limits" | "health";
const STATUS_TONE = { live: "healthy", draft: "neutral", paused: "degraded" } as const;
const OUTCOME = { completed: { label: "Finished", tone: "healthy" }, escalated: { label: "Went to a person", tone: "degraded" }, stopped: { label: "Stopped by a limit", tone: "down" } } as const;
const mins = (ms: number) => (ms >= 60_000 ? `${(ms / 60_000).toFixed(1)} min` : `${(ms / 1000).toFixed(1)} s`);
const num = (s: string, d: number) => { const n = Number(s); return Number.isFinite(n) ? n : d; };

export default function MeshDetail() {
  const { id } = useParams<{ id: string }>(); const router = useRouter();
  const { agents, networks, meshes: list } = useAgents(); const saved = list.find((m) => m.id === id);
  const [draft, setDraft] = useState<Mesh | null>(null); const [tab, setTab] = useState<Tab>("live"); const [confirm, setConfirm] = useState(false);
  useEffect(() => { if (saved && !draft) setDraft(structuredClone(saved)); }, [saved, draft]);
  if (!saved || !draft) return <EmptyState icon={Waypoints} title="Mesh not found" description="It may have been deleted." action={<Link href="/agents/mesh"><Button variant="secondary">Back to meshes</Button></Link>} />;

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const issues = validateMesh(draft, agents, networks, list); const errs = blockers(issues);
  const set = (patch: Partial<Mesh>) => setDraft({ ...draft, ...patch });
  const save = () => { const { id: _i, createdAt: _c, status: _s, ...rest } = draft; void _i; void _c; void _s; const r = meshes.update(saved.id, rest); if (!r.ok) { toast(r.error); return; } setDraft(structuredClone(r.value)); toast("Mesh saved"); };
  const toggleLive = () => { const r = meshes.setStatus(saved.id, saved.status === "live" ? "paused" : "live"); if (!r.ok) toast(r.error); else { setDraft({ ...draft, status: r.value.status }); toast(r.value.status === "live" ? "The mesh is live" : "The mesh is paused"); } };

  return (
    <div className="space-y-5">
      <div><Link href="/agents/mesh" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"><ArrowLeft size={14} />Agent Mesh</Link></div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold">{saved.name}</h1><Badge tone={STATUS_TONE[saved.status]}>{saved.status}</Badge><Badge tone="info">{PATTERNS.find((p) => p.id === saved.pattern)!.label}</Badge></div>
          <p className="text-sm text-text-secondary mt-1 max-w-3xl">{saved.goal}</p>
          <div className="text-xs text-text-tertiary mt-1">{saved.industry}. Starts when: {saved.trigger.label}. Owned by {saved.owner}.</div>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <><Button variant="secondary" onClick={() => setDraft(structuredClone(saved))}>Discard</Button><Button onClick={save}>Save changes</Button></>}
          <Button variant={saved.status === "live" ? "secondary" : "primary"} onClick={toggleLive} disabled={dirty}>{saved.status === "live" ? "Pause" : "Go live"}</Button>
          <Button variant="secondary" onClick={() => setConfirm(true)} aria-label="Delete mesh"><Trash2 size={15} /></Button>
        </div>
      </div>
      {errs.length > 0 && <Notice tone="bad" title={`${errs.length} ${errs.length === 1 ? "thing" : "things"} to fix before this goes live`}>{errs[0].message}{errs.length > 1 ? ` And ${errs.length - 1} more, on the Health tab.` : ""}</Notice>}

      <Tabs<Tab> label="Mesh" value={tab} onChange={setTab} tabs={[{ id: "live", label: "Live view" }, { id: "design", label: "Design" }, { id: "limits", label: "Limits and context" }, { id: "health", label: "Health", count: issues.length || undefined }]} />
      {tab === "live" && <LiveView mesh={draft} />}
      {tab === "design" && <Design mesh={draft} set={set} />}
      {tab === "limits" && <Limits mesh={draft} set={set} />}
      {tab === "health" && <Health mesh={draft} />}
      <Confirm open={confirm} onClose={() => setConfirm(false)} title={`Delete ${saved.name}?`} body="The agents stay as they are. Only the mesh, its handoff rules and its limits are removed." confirmLabel="Delete mesh" danger onConfirm={() => { const r = meshes.remove(saved.id); if (!r.ok) { toast(r.error); setConfirm(false); return; } toast("Mesh deleted"); router.push("/agents/mesh"); }} />
    </div>
  );
}

// ---- the live view: run a sample case through the mesh and watch it

function LiveView({ mesh }: { mesh: Mesh }) {
  const { agents, networks } = useAgents();
  const [scId, setScId] = useState(mesh.scenarios[0]?.id ?? ""); const sc = mesh.scenarios.find((s) => s.id === scId) ?? mesh.scenarios[0];
  const run = useMemo(() => (sc ? runCase(mesh, agents, sc) : null), [mesh, agents, sc]); const stats = useMemo(() => meshStats(mesh, agents), [mesh, agents]);
  const [progress, setProgress] = useState(0); const [playing, setPlaying] = useState(true); const [speed, setSpeed] = useState(1); const [sel, setSel] = useState<string | null>(null);
  const total = run?.steps.length ?? 0; const last = useRef(0);
  useEffect(() => { setProgress(0); setPlaying(true); }, [scId, mesh.id]);
  useEffect(() => {
    if (!playing || !total) return; let raf = 0; last.current = performance.now();
    const tick = (t: number) => { const dt = (t - last.current) / 1000; last.current = t; setProgress((p) => { const n = p + dt * 0.7 * speed; if (n >= total + 0.4) { setPlaying(false); return total; } return n; }); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [playing, total, speed]);
  const idx = Math.min(total - 1, Math.floor(progress)); const atEnd = progress >= total;
  const step = (d: number) => { setPlaying(false); setProgress((p) => Math.max(0, Math.min(total, Math.floor(p) + d))); };
  const selMember = mesh.members.find((m) => m.agentId === sel); const selAgent = agents.find((a) => a.id === sel);
  const seenSteps = run ? run.steps.filter((_, i) => i <= Math.min(idx, total - 1) || atEnd) : [];
  const spent = seenSteps.reduce((s, x) => s + x.costUsd, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2"><span className="text-sm text-text-secondary">Sample case</span>
          <Select aria-label="Sample case" className="!w-64 !h-9" value={sc?.id} onChange={(e) => setScId(e.target.value)}>{mesh.scenarios.map((s) => <option key={s.id} value={s.id}>{s.title}: {s.subject}</option>)}</Select></div>
        <div className="flex items-center gap-1">
          <Button variant="secondary" onClick={() => step(-1)} aria-label="Previous step"><SkipBack size={14} /></Button>
          <Button variant="secondary" onClick={() => { if (atEnd) setProgress(0); setPlaying((p) => !p); }} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause size={14} /> : <Play size={14} />}</Button>
          <Button variant="secondary" onClick={() => step(1)} aria-label="Next step"><SkipForward size={14} /></Button>
          <Button variant="secondary" onClick={() => { setProgress(0); setPlaying(true); }} aria-label="Run again"><RotateCcw size={14} /></Button>
        </div>
        <Select aria-label="Speed" className="!w-24 !h-9" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}><option value={0.5}>0.5x</option><option value={1}>1x</option><option value={2}>2x</option><option value={4}>4x</option></Select>
        <input type="range" aria-label="Position in the case" className="flex-1 min-w-[160px]" min={0} max={total} step={0.01} value={Math.min(progress, total)} onChange={(e) => { setPlaying(false); setProgress(Number(e.target.value)); }} />
        <span className="text-xs text-text-tertiary tabular-nums">{Math.min(total, Math.floor(progress) + (atEnd ? 0 : 1))} of {total} steps</span>
      </div>
      <p className="text-xs text-text-tertiary">A replay of a sample case, worked out from each agent's recorded time, cost and failure rate. Nothing here is running.</p>

      <MeshCanvas mesh={mesh} agents={agents} stats={stats} run={run} progress={progress} selected={sel} onSelect={(x) => setSel(x === sel ? null : x)} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Card className="xl:col-span-2">
          <CardHeader title="What happened" subtitle={sc ? `${sc.title}: ${sc.subject}` : ""} />
          <ol className="divide-y divide-border max-h-[360px] overflow-y-auto" data-testid="mesh-timeline">
            {run?.steps.map((s, i) => {
              const a = s.agentId ? agents.find((x) => x.id === s.agentId) : null; const now = !atEnd && i === idx; const done = atEnd || i < idx;
              return (
                <li key={i} className={clsx("flex items-start gap-3 px-5 py-3 text-sm", now && "bg-surface-subtle", !done && !now && "opacity-45")}>
                  <span className={clsx("mt-0.5 h-6 w-6 shrink-0 rounded-full grid place-items-center text-[11px] font-semibold", s.agentId ? "bg-surface-muted" : "bg-status-degraded/15 text-status-degraded")}>{s.agentId ? s.n : <Hand size={12} />}</span>
                  <div className="min-w-0 flex-1"><div className="font-medium">{a ? a.title : "A person"}{s.agentId && <span className="ml-2 text-xs font-normal text-text-tertiary">{ROLE_LABEL[s.role as MeshRole]}</span>}</div>
                    <div className="text-text-secondary">{s.action}.</div>{s.note && <div className="text-xs text-text-tertiary mt-0.5">{s.note}</div>}</div>
                  <div className="text-right text-xs text-text-tertiary tabular-nums shrink-0">{s.agentId ? <>{(s.durMs / 1000).toFixed(1)} s<br />{usd(s.costUsd)}</> : <>waits {mins(s.durMs)}</>}</div>
                </li>);
            })}
          </ol>
        </Card>
        <div className="space-y-4">
          {run && (
            <Card><CardBody className="space-y-3">
              <div className="flex items-center justify-between"><span className="text-sm font-medium">This case</span>{(atEnd || total === 0) && <Badge tone={OUTCOME[run.outcome].tone}>{OUTCOME[run.outcome].label}</Badge>}</div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-xs text-text-tertiary">Cost so far</div><div className="text-lg font-semibold tabular-nums">{usd(spent)}</div><div className="text-[11px] text-text-tertiary">limit {usd(mesh.guardrails.maxCostUsd)}</div></div>
                <div><div className="text-xs text-text-tertiary">Handoffs</div><div className="text-lg font-semibold tabular-nums">{run.hops}</div><div className="text-[11px] text-text-tertiary">limit {mesh.guardrails.maxHops}</div></div>
                <div><div className="text-xs text-text-tertiary">Working time</div><div className="text-lg font-semibold tabular-nums">{mins(run.activeMs)}</div><div className="text-[11px] text-text-tertiary">limit {mesh.guardrails.maxMinutes} min</div></div>
                <div><div className="text-xs text-text-tertiary">Waiting for a person</div><div className="text-lg font-semibold tabular-nums">{mins(run.waitMs)}</div></div>
              </div>
              {atEnd && run.reason && <p className="text-sm text-text-secondary">{run.reason}</p>}
            </CardBody></Card>)}
          <Card><CardBody>
            {selMember && selAgent ? <AgentPanel mesh={mesh} agentId={selMember.agentId} /> : <p className="text-sm text-text-secondary">Select an agent in the picture to see its role, what it may hand on, and how the network lets it do that.</p>}
          </CardBody></Card>
        </div>
      </div>
      {networks.length === 0 && null}
    </div>
  );
}

function AgentPanel({ mesh, agentId }: { mesh: Mesh; agentId: string }) {
  const { agents, networks } = useAgents(); const a = agents.find((x) => x.id === agentId)!; const m = mesh.members.find((x) => x.agentId === agentId)!;
  const cfgs = Object.fromEntries(agents.map((x) => [x.id, x.network])); const post = assess(a, a.network, networks, memberCounts(cfgs));
  const title = (id: string) => agents.find((x) => x.id === id)?.title ?? id;
  const outs = mesh.handoffs.filter((h) => h.from === agentId); const ins = mesh.handoffs.filter((h) => h.to === agentId);
  const line = (h: Mesh["handoffs"][number], dir: "to" | "from") => { const p = pathOf({ id: h.id, from: h.from, to: h.to }, cfgs, networks); return (
    <li key={h.id} className="text-xs"><span className="font-medium">{dir === "to" ? "To" : "From"} {title(dir === "to" ? h.to : h.from)}</span> <Badge tone={p.state === "blocked" ? "down" : p.state === "open" ? "degraded" : "healthy"}>{PATH_LABEL[p.state]}</Badge><div className="text-text-tertiary">{describeWhen(h.when, title)}. Carries {h.carry.map((c) => CARRY_LABEL[c].toLowerCase()).join(", ") || "nothing"}.</div></li>); };
  return (
    <div className="space-y-3 text-sm">
      <div><div className="font-semibold">{a.title}</div><div className="text-xs text-text-tertiary">{ROLE_LABEL[m.role]}. {a.framework}. {a.control}.</div></div>
      {m.duty && <p className="text-text-secondary">{m.duty}.</p>}
      <div className="text-xs"><span className="text-text-tertiary">Network: </span>{post.configured ? <>{post.label}, grade {post.grade}</> : "not set up"}. <Link className="underline" href={`/agents/registry/${a.id}?tab=network`}>Open</Link></div>
      {ins.length > 0 && <div><div className="text-xs font-medium text-text-tertiary mb-1">Receives</div><ul className="space-y-2">{ins.map((h) => line(h, "from"))}</ul></div>}
      {outs.length > 0 && <div><div className="text-xs font-medium text-text-tertiary mb-1">Hands on</div><ul className="space-y-2">{outs.map((h) => line(h, "to"))}</ul></div>}
      {outs.length === 0 && <div className="text-xs text-text-tertiary">Nothing is handed on from here. The case ends with this agent.</div>}
    </div>
  );
}

// ---- design: who is in, in which role, and the handoff rules

function Design({ mesh, set }: { mesh: Mesh; set: (p: Partial<Mesh>) => void }) {
  const { agents } = useAgents(); const title = (id: string) => agents.find((a) => a.id === id)?.title ?? id;
  const free = agents.filter((a) => a.state !== "retired" && !mesh.members.some((m) => m.agentId === a.id));
  const tags = [...new Set([...mesh.scenarios.flatMap((s) => s.tags), ...mesh.handoffs.flatMap((h) => whenTags(h))])];
  const setMember = (i: number, p: Partial<Mesh["members"][number]>) => set({ members: mesh.members.map((m, k) => (k === i ? { ...m, ...p } : m)) });
  const setHandoff = (id: string, p: Partial<Mesh["handoffs"][number]>) => set({ handoffs: mesh.handoffs.map((h) => (h.id === id ? { ...h, ...p } : h)) });
  const removeMember = (aid: string) => set({ members: mesh.members.filter((m) => m.agentId !== aid), handoffs: mesh.handoffs.filter((h) => h.from !== aid && h.to !== aid), guardrails: { ...mesh.guardrails, personBefore: mesh.guardrails.personBefore.filter((x) => x !== aid) } });
  const addHandoff = () => { const [a, b] = [mesh.members[0]?.agentId, mesh.members[1]?.agentId]; if (!a || !b) return; set({ handoffs: [...mesh.handoffs, { id: `hnd_${Date.now().toString(36)}`, from: a, to: b, when: "always", carry: ["case", "summary"] }] }); };
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Agents and roles" subtitle="The first agent with the intake role, or the coordinator, is where a case starts." action={
          <Select aria-label="Add an agent" className="!w-52 !h-8 text-xs" value="" onChange={(e) => { if (e.target.value) set({ members: [...mesh.members, { agentId: e.target.value, role: "specialist", duty: "" }] }); }}><option value="">Add an agent</option>{free.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}</Select>} />
        <Table><Thead><tr><Th>Agent</Th><Th>Role</Th><Th>What it does in this mesh</Th><Th /></tr></Thead><tbody>
          {mesh.members.map((m, i) => (<Tr key={m.agentId}><Td className="font-medium whitespace-nowrap">{title(m.agentId)}</Td>
            <Td><Select aria-label={`Role of ${title(m.agentId)}`} className="!h-8 !w-40 text-xs" value={m.role} onChange={(e) => setMember(i, { role: e.target.value as MeshRole })}>{ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</Select></Td>
            <Td><Input aria-label={`Duty of ${title(m.agentId)}`} className="!h-8 text-xs" value={m.duty} onChange={(e) => setMember(i, { duty: e.target.value })} placeholder="One line on its part of the case" /></Td>
            <Td><Button variant="secondary" onClick={() => removeMember(m.agentId)} aria-label={`Remove ${title(m.agentId)}`}><Trash2 size={13} /></Button></Td></Tr>))}
        </tbody></Table>
      </Card>
      <Card>
        <CardHeader title="Handoff rules" subtitle="Which agent may hand a case to which, and when. The first rule that fits is taken. Nothing outside these rules can happen." action={<Button variant="secondary" onClick={addHandoff}><Plus size={13} className="mr-1" />Add a rule</Button>} />
        <Table><Thead><tr><Th>From</Th><Th>To</Th><Th>When</Th><Th>Carries</Th><Th /></tr></Thead><tbody>
          {mesh.handoffs.map((h) => (<Tr key={h.id}>
            <Td><Select aria-label="From" className="!h-8 !w-44 text-xs" value={h.from} onChange={(e) => setHandoff(h.id, { from: e.target.value })}>{mesh.members.map((m) => <option key={m.agentId} value={m.agentId}>{title(m.agentId)}</option>)}</Select></Td>
            <Td><Select aria-label="To" className="!h-8 !w-44 text-xs" value={h.to} onChange={(e) => setHandoff(h.id, { to: e.target.value })}>{mesh.members.map((m) => <option key={m.agentId} value={m.agentId}>{title(m.agentId)}</option>)}</Select></Td>
            <Td><Input aria-label="When" list={`tags-${mesh.id}`} className="!h-8 text-xs min-w-[150px]" value={h.when} onChange={(e) => setHandoff(h.id, { when: e.target.value })} /><div className="text-[11px] text-text-tertiary mt-1">{describeWhen(h.when, title)}</div></Td>
            <Td><div className="flex flex-wrap gap-1 max-w-[260px]">{(Object.keys(CARRY_LABEL) as Carry[]).map((c) => <button key={c} type="button" onClick={() => setHandoff(h.id, { carry: h.carry.includes(c) ? h.carry.filter((x) => x !== c) : [...h.carry, c] })} className={clsx("rounded-full border px-2 py-0.5 text-[11px]", h.carry.includes(c) ? "border-text-primary bg-surface-muted font-medium" : "border-border text-text-tertiary")}>{CARRY_LABEL[c]}</button>)}</div></Td>
            <Td><Button variant="secondary" onClick={() => set({ handoffs: mesh.handoffs.filter((x) => x.id !== h.id) })} aria-label="Remove rule"><Trash2 size={13} /></Button></Td></Tr>))}
          {mesh.handoffs.length === 0 && <Tr><Td colSpan={5} className="text-text-tertiary">No rules. Agents cannot hand cases to each other.</Td></Tr>}
        </tbody></Table>
        <datalist id={`tags-${mesh.id}`}><option value="always" />{tags.map((t) => <option key={t} value={t} />)}{tags.map((t) => <option key={"n" + t} value={"!" + t} />)}</datalist>
        <div className="px-5 py-3 text-xs text-text-tertiary border-t border-border">A condition is <b>always</b>, a tag on the case such as <b>missing-docs</b>, <b>!missing-docs</b> for its absence, or <b>ran:agt_01</b> for an agent that has already worked the case. Join with &amp;.</div>
      </Card>
      <Card>
        <CardHeader title="Sample cases" subtitle="Cases used to replay the mesh and to judge it. A tag is how the case is described to the rules above. Shares add up to the mix of real work." action={<Button variant="secondary" onClick={() => set({ scenarios: [...mesh.scenarios, { id: `sc_${Date.now().toString(36)}`, title: "New case", subject: "a case", tags: [], share: 0.1 }] })}><Plus size={13} className="mr-1" />Add</Button>} />
        <Table><Thead><tr><Th>Name</Th><Th>What it is</Th><Th>Tags</Th><Th>Share</Th><Th /></tr></Thead><tbody>
          {mesh.scenarios.map((s) => { const put = (p: Partial<typeof s>) => set({ scenarios: mesh.scenarios.map((x) => (x.id === s.id ? { ...x, ...p } : x)) }); return (
            <Tr key={s.id}><Td><Input aria-label="Case name" className="!h-8 text-xs" value={s.title} onChange={(e) => put({ title: e.target.value })} /></Td><Td><Input aria-label="Case subject" className="!h-8 text-xs" value={s.subject} onChange={(e) => put({ subject: e.target.value })} /></Td>
              <Td><Input aria-label="Case tags" className="!h-8 text-xs" value={s.tags.join(", ")} onChange={(e) => put({ tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} placeholder="none" /></Td>
              <Td><Input aria-label="Case share" className="!h-8 !w-20 text-xs" inputMode="decimal" value={String(s.share)} onChange={(e) => put({ share: Math.max(0, num(e.target.value, s.share)) })} /></Td>
              <Td><Button variant="secondary" onClick={() => set({ scenarios: mesh.scenarios.filter((x) => x.id !== s.id) })} aria-label="Remove case" disabled={mesh.scenarios.length < 2}><Trash2 size={13} /></Button></Td></Tr>); })}
        </tbody></Table>
      </Card>
    </div>
  );
}

// ---- limits, context and objectives

function Limits({ mesh, set }: { mesh: Mesh; set: (p: Partial<Mesh>) => void }) {
  const { agents } = useAgents(); const title = (id: string) => agents.find((a) => a.id === id)?.title ?? id; const g = mesh.guardrails;
  const setG = (p: Partial<Mesh["guardrails"]>) => set({ guardrails: { ...g, ...p } });
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      <Card><CardHeader title="Limits for one case" subtitle="A case that reaches one of these is stopped, and the reason is kept." /><CardBody className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="Handoffs" hint="At most"><Input inputMode="numeric" value={String(g.maxHops)} onChange={(e) => setG({ maxHops: Math.round(num(e.target.value, g.maxHops)) })} /></Field>
          <Field label="Cost, USD" hint="At most"><Input inputMode="decimal" value={String(g.maxCostUsd)} onChange={(e) => setG({ maxCostUsd: num(e.target.value, g.maxCostUsd) })} /></Field>
          <Field label="Working minutes" hint="At most"><Input inputMode="decimal" value={String(g.maxMinutes)} onChange={(e) => setG({ maxMinutes: num(e.target.value, g.maxMinutes) })} /></Field>
        </div>
        <Toggle checked={g.loopGuard} onChange={(v) => setG({ loopGuard: v })} label="Loop guard" description="Stop a case that sends the same agent round again and again. Needed whenever rules can form a loop." />
        {g.loopGuard && <Field label="Times one agent may work a case" hint="Two lets an agent ask for something once and try again."><Input className="!w-24" inputMode="numeric" value={String(g.maxVisits)} onChange={(e) => setG({ maxVisits: Math.round(num(e.target.value, g.maxVisits)) })} /></Field>}
      </CardBody></Card>
      <Card><CardHeader title="Where a person decides" subtitle="The case waits for a person, and the wait is not counted as working time." /><CardBody className="space-y-4">
        <div><div className="text-[13px] font-medium mb-1.5">A person approves the result of</div>
          {mesh.members.map((m) => <label key={m.agentId} className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" checked={g.personBefore.includes(m.agentId)} onChange={() => setG({ personBefore: g.personBefore.includes(m.agentId) ? g.personBefore.filter((x) => x !== m.agentId) : [...g.personBefore, m.agentId] })} />{title(m.agentId)}</label>)}</div>
        <Field label="Cases that always go to a person before an executor acts" hint="Tags separated by commas, such as high-value, suspicious."><Input value={g.escalate.join(", ")} onChange={(e) => setG({ escalate: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} /></Field>
      </CardBody></Card>
      <Card><CardHeader title="What the agents share" /><CardBody className="space-y-4">
        <Field label="What an agent sees of earlier steps"><Select value={mesh.context.sharing} onChange={(e) => set({ context: { ...mesh.context, sharing: e.target.value as Mesh["context"]["sharing"] } })}><option value="case">The whole case</option><option value="summary">A summary from the last agent</option><option value="none">Only what is handed over</option></Select></Field>
        <Field label="Memory"><Select value={mesh.context.memory} onChange={(e) => set({ context: { ...mesh.context, memory: e.target.value as Mesh["context"]["memory"] } })}><option value="case">Kept for the case, then forgotten</option><option value="session">Kept for the customer's session</option><option value="none">None</option></Select></Field>
        <Field label="Personal data between agents"><Select value={mesh.context.pii} onChange={(e) => set({ context: { ...mesh.context, pii: e.target.value as Mesh["context"]["pii"] } })}><option value="mask">Masked when it is handed on</option><option value="keep">Passed on as it is</option></Select></Field>
      </CardBody></Card>
      <Card><CardHeader title="Objectives" subtitle="What the mesh should achieve. Health compares the replay of your sample cases with these." /><CardBody className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Cases that finish, %"><Input inputMode="decimal" value={String(mesh.slo.successPct)} onChange={(e) => set({ slo: { ...mesh.slo, successPct: num(e.target.value, mesh.slo.successPct) } })} /></Field>
        <Field label="Time, minutes (95th)"><Input inputMode="decimal" value={String(mesh.slo.p95Min)} onChange={(e) => set({ slo: { ...mesh.slo, p95Min: num(e.target.value, mesh.slo.p95Min) } })} /></Field>
        <Field label="Cost per case, USD"><Input inputMode="decimal" value={String(mesh.slo.costPerCaseUsd)} onChange={(e) => set({ slo: { ...mesh.slo, costPerCaseUsd: num(e.target.value, mesh.slo.costPerCaseUsd) } })} /></Field>
      </CardBody></Card>
    </div>
  );
}

// ---- health

function Health({ mesh }: { mesh: Mesh }) {
  const { agents, networks, meshes: list } = useAgents(); const title = (id: string) => agents.find((a) => a.id === id)?.title ?? id;
  const st = useMemo(() => meshStats(mesh, agents), [mesh, agents]); const obj = objectives(mesh, st); const issues = validateMesh(mesh, agents, networks, list);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Cases, last 7 days" value={st.cases7d.toLocaleString("en-US")} sub={`Through ${title(mesh.members[0]?.agentId ?? "")}`} />
        {obj.map((o) => <Kpi key={o.id} label={o.label} value={o.actual} tone={o.state === "missed" ? "bad" : o.state === "close" ? "warn" : undefined} sub={`Aim: ${o.target}`} />)}
      </div>
      <Card><CardHeader title="Checks" subtitle="Errors stop a mesh from going live. Warnings are worth reading." />
        {issues.length === 0 ? <CardBody><p className="text-sm text-status-healthy">Nothing to fix.</p></CardBody> : (
          <ul className="divide-y divide-border">{issues.map((i, k) => <li key={k} className="flex items-start gap-3 px-5 py-3 text-sm"><Badge tone={i.level === "error" ? "down" : "degraded"}>{i.level === "error" ? "Fix" : "Look"}</Badge><span>{i.message}</span></li>)}</ul>)}
      </Card>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card><CardHeader title="How each sample case goes" subtitle="Worked out from each agent's recorded figures." />
          <Table><Thead><tr><Th>Case</Th><Th>Result</Th><Th>Working time</Th><Th>Cost</Th><Th>Handoffs</Th></tr></Thead><tbody>
            {st.mix.map((r) => <Tr key={r.scenario.id}><Td>{r.scenario.title}<div className="text-[11px] text-text-tertiary">{Math.round(r.scenario.share * 100)}% of cases</div></Td><Td><Badge tone={OUTCOME[r.outcome].tone}>{OUTCOME[r.outcome].label}</Badge></Td><Td className="tabular-nums">{dur(r.activeMs)}</Td><Td className="tabular-nums">{usd(r.costUsd)}</Td><Td className="tabular-nums">{r.hops}</Td></Tr>)}
          </tbody></Table></Card>
        <Card><CardHeader title="Where the work goes" subtitle="The share of cases that reach each agent." />
          <Table><Thead><tr><Th>Agent</Th><Th>Cases</Th><Th>Slowest step</Th><Th>Cost per case</Th></tr></Thead><tbody>
            {mesh.members.map((m) => { const p = st.per[m.agentId]; return <Tr key={m.agentId}><Td>{title(m.agentId)}<div className="text-[11px] text-text-tertiary">{ROLE_LABEL[m.role]}</div></Td><Td className="tabular-nums">{p ? Math.round(p.share * 100) + "%" : "0%"}</Td><Td className="tabular-nums">{p ? dur(p.p95Ms) : "n/a"}</Td><Td className="tabular-nums">{p ? usd(p.costUsd) : "n/a"}</Td></Tr>; })}
          </tbody></Table></Card>
      </div>
      <p className="text-xs text-text-tertiary flex items-center gap-1.5"><User size={12} />Figures are replays of your sample cases using each agent's recorded time, cost and failure rate. A mesh runtime would report the same measures from real cases.</p>
    </div>
  );
}
