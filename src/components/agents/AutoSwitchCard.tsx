"use client";

import clsx from "clsx";
import { Plus, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select, Toggle } from "@/components/ui/Form";
import { Notice } from "@/components/mlops/ui";
import { PRESETS, SIGNALS, SIGNAL_BY_ID, defaultAutoSwitch, describeCondition, emptyRule, validateAutoSwitch, type AutoSwitch, type Condition, type Rule, type SignalId } from "@/lib/agents/autoswitch";
import { RUNTIMES, RUNTIME_BY_ID, type RuntimeKind } from "@/lib/agents/execution";
import { REAL_TICK_MS, SCENARIOS, loadSim, useLoadSim } from "@/lib/agents/loadsim";
import type { Agent } from "@/lib/agents/types";

/** The form components fill their container, so a width is given to a wrapper. */
const Sel = ({ w, ...p }: React.SelectHTMLAttributes<HTMLSelectElement> & { w?: string }) => <div className={w}><Select {...p} /></div>;
const Inp = ({ w, ...p }: React.InputHTMLAttributes<HTMLInputElement> & { w?: string }) => <div className={w}><Input {...p} /></div>;
const num = (v: string, d = 0) => (Number.isFinite(Number(v)) && v !== "" ? Number(v) : d);
const TARGETS = RUNTIMES.filter((r) => r.id !== "external");
const clock = (t: number) => new Date(t).toISOString().slice(11, 16);

/**
 * The developer's switch for automatic runtime switching, and the rules that drive it. Written into the agent's settings like everything else on the Runtime tab, so
 * it is saved with them. Beneath it, for a saved policy, is what the platform is seeing now, what it decided, and every move it has made.
 */
export function AutoSwitchCard({ a, value, onChange, lock, saved, dirty }: { a: Agent; value: AutoSwitch | undefined; onChange: (v: AutoSwitch) => void; lock: boolean; saved: AutoSwitch | undefined; dirty: boolean }) {
  const v = value ?? defaultAutoSwitch(); const durable = !!a.execution?.durable;
  const issues = validateAutoSwitch(value); const errors = issues.filter((i) => i.level === "error"); const warns = issues.filter((i) => i.level === "warning");
  const set = (p: Partial<AutoSwitch>) => onChange({ ...v, ...p });
  const setRule = (id: string, p: Partial<Rule>) => set({ rules: v.rules.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  const setCond = (id: string, i: number, p: Partial<Condition>) => set({ rules: v.rules.map((r) => (r.id === id ? { ...r, when: r.when.map((c, j) => (j === i ? { ...c, ...p } : c)) } : r)) });

  return (
    <Card>
      <CardHeader title="Automatic runtime switching" subtitle="Let the platform move this agent between runtimes when its load or events change, so nobody has to." action={<Zap size={16} className={v.enabled ? "text-[#12B58A]" : "text-text-tertiary"} aria-hidden />} />
      <CardBody className="space-y-5">
        <Toggle checked={v.enabled} onChange={(on) => !lock && set({ enabled: on, rules: on && v.rules.length === 0 ? PRESETS[0].rules() : v.rules })} label="Switch this agent's runtime automatically"
          description="Off by default. The developer chooses to turn it on and writes the rules. A person can still switch it by hand, or undo a move, at any time." />

        {v.enabled && (
          <>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-text-tertiary mb-2">Start from a pattern</div>
              <div className="flex flex-wrap gap-2">{PRESETS.map((p) => <button key={p.id} type="button" disabled={lock} title={p.blurb} onClick={() => set({ rules: p.rules() })} className="h-8 px-3 rounded-md border border-border-strong text-[13px] hover:bg-surface-muted disabled:opacity-50">{p.label}</button>)}</div>
            </div>

            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Rules, first match wins</div>
              {v.rules.map((r, ri) => (
                <div key={r.id} className="rounded-lg border border-border p-3.5 space-y-3">
                  <div className="flex items-center gap-2"><span className="h-5 w-5 rounded-full border border-border-strong text-[11px] grid place-items-center text-text-secondary tabular-nums">{ri + 1}</span>
                    <Inp disabled={lock} value={r.name} aria-label={`Rule ${ri + 1} name`} onChange={(e) => setRule(r.id, { name: e.target.value })} w="flex-1" />
                    <button type="button" disabled={lock} aria-label={`Remove rule ${ri + 1}`} onClick={() => set({ rules: v.rules.filter((x) => x.id !== r.id) })} className="h-8 w-8 grid place-items-center rounded-md text-text-tertiary hover:bg-surface-muted hover:text-status-down disabled:opacity-50"><Trash2 size={14} /></button></div>
                  <div className="space-y-2">
                    {r.when.map((c, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2 text-[13px]">
                        <span className="w-10 text-text-tertiary">{i === 0 ? "When" : "and"}</span>
                        <Sel disabled={lock} aria-label="Signal" value={c.signal} onChange={(e) => setCond(r.id, i, { signal: e.target.value as SignalId })} w="w-44">{SIGNALS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Sel>
                        <Sel disabled={lock} aria-label="Above or below" value={c.op} onChange={(e) => setCond(r.id, i, { op: e.target.value as ">" | "<" })} w="w-36"><option value=">">is above</option><option value="<">is below</option></Sel>
                        <Inp disabled={lock} type="number" min={0} aria-label="Value" value={c.value} onChange={(e) => setCond(r.id, i, { value: num(e.target.value) })} w="w-24" /><span className="text-text-tertiary w-16">{SIGNAL_BY_ID[c.signal].unit}</span>
                        <span className="text-text-tertiary">for</span><Inp disabled={lock} type="number" min={1} aria-label="Minutes" value={c.forMin} onChange={(e) => setCond(r.id, i, { forMin: num(e.target.value, 1) })} w="w-20" /><span className="text-text-tertiary">min</span>
                        {r.when.length > 1 && <button type="button" disabled={lock} aria-label="Remove condition" onClick={() => setRule(r.id, { when: r.when.filter((_, j) => j !== i) })} className="h-7 w-7 grid place-items-center rounded-md text-text-tertiary hover:bg-surface-muted"><Trash2 size={13} /></button>}
                      </div>))}
                    {r.when.length < 3 && <button type="button" disabled={lock} onClick={() => setRule(r.id, { when: [...r.when, { signal: "queue", op: ">", value: 100, forMin: 5 }] })} className="text-xs text-text-secondary underline underline-offset-2 disabled:opacity-50">Add a condition that must also hold</button>}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[13px]">
                    <span className="text-text-tertiary w-10">Then</span><span>move to</span>
                    <Sel disabled={lock} aria-label="Move to" value={r.to} onChange={(e) => setRule(r.id, { to: e.target.value as RuntimeKind })} w="w-52">{TARGETS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Sel>
                    <label className="inline-flex items-center gap-1.5 text-text-secondary"><input type="checkbox" disabled={lock} checked={!!r.hours} onChange={(e) => setRule(r.id, { hours: e.target.checked ? { from: 8, to: 18 } : undefined })} /> only between</label>
                    {r.hours && <><Inp disabled={lock} type="number" min={0} max={23} aria-label="From hour" value={r.hours.from} onChange={(e) => setRule(r.id, { hours: { ...r.hours!, from: num(e.target.value) } })} w="w-16" /><span className="text-text-tertiary">and</span><Inp disabled={lock} type="number" min={0} max={24} aria-label="To hour" value={r.hours.to} onChange={(e) => setRule(r.id, { hours: { ...r.hours!, to: num(e.target.value) } })} w="w-16" /><span className="text-text-tertiary">o&apos;clock, UTC</span></>}
                  </div>
                </div>))}
              <Button disabled={lock || v.rules.length >= 8} onClick={() => set({ rules: [...v.rules, emptyRule()] })}><Plus size={14} /> Add a rule</Button>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="Stay on a runtime at least, minutes" hint="After any move, wait this long before the next."><Input disabled={lock} type="number" min={1} value={v.minDwellMin} onChange={(e) => set({ minDwellMin: num(e.target.value, 1) })} /></Field>
              <Field label="Moves allowed in a day" hint="A hard stop, whatever the rules say."><Input disabled={lock} type="number" min={1} max={48} value={v.maxPerDay} onChange={(e) => set({ maxPerDay: num(e.target.value, 1) })} /></Field>
              <Field label="Runs already under way" hint={durable ? "Drain lets them finish. Hand off carries them to the new runtime." : "Progress is not saved for this agent, so runs are drained."}>
                <Select disabled={lock} value={v.strategy === "handoff" && durable ? "handoff" : "drain"} onChange={(e) => set({ strategy: e.target.value as "drain" | "handoff" })}><option value="drain">Let them finish (drain)</option><option value="handoff" disabled={!durable}>Carry them across (hand off)</option></Select></Field>
            </div>

            <div className="rounded-md bg-surface-subtle px-3.5 py-3 text-xs text-text-secondary">
              <div className="font-medium text-text-primary mb-1">What never happens automatically</div>
              <ul className="list-disc pl-4 space-y-0.5"><li>A run in flight is cancelled. Runs are drained or handed off, never cut over.</li><li>A way to start the agent is turned off. If the new runtime could not start it that way, the move is refused.</li><li>A stream is invented. A streaming worker is used only if the agent already has a stream or events to read.</li><li>The agent moves twice within {v.minDwellMin} minutes, or more than {v.maxPerDay} times in a day.</li></ul>
            </div>
          </>
        )}

        {errors.length > 0 && <Notice tone="bad" title="Fix these before saving"><ul className="list-disc pl-4 space-y-0.5">{errors.map((i, k) => <li key={k}>{i.message}</li>)}</ul></Notice>}
        {warns.length > 0 && <Notice tone="warn" title="Worth a look"><ul className="list-disc pl-4 space-y-0.5">{warns.map((i, k) => <li key={k}>{i.message}</li>)}</ul></Notice>}
        {v.enabled && dirty && <p className="text-xs text-text-tertiary">Changes to the rules apply when you save the runtime settings.</p>}

        {saved?.enabled && <Watching a={a} />}
      </CardBody>
    </Card>
  );
}

/** What the platform is seeing for this agent, what it has decided, and what it has done. */
function Watching({ a }: { a: Agent }) {
  useLoadSim(); const s = loadSim.latest(a); const d = loadSim.decision(a.id); const scenario = loadSim.scenario(a.id); const log = a.switching?.log ?? []; const hist = loadSim.samples(a).slice(-60);
  const max = Math.max(10, ...hist.map((x) => x.rpm)); const pts = hist.map((x, i) => `${(i / Math.max(1, hist.length - 1)) * 100},${100 - (x.rpm / max) * 92 - 4}`).join(" ");
  const tone = d?.kind === "switch" ? "text-[#067A4E]" : d?.kind === "blocked" ? "text-status-down" : "text-text-secondary";
  return (
    <div className="border-t border-border pt-4 space-y-4" aria-label="What the platform sees">
      <div className="flex flex-wrap items-center justify-between gap-2"><div className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">What it sees now</div>
        <div className="text-[11px] text-text-tertiary">Sample clock {clock(loadSim.latest(a).t)}. One second here is one minute of load.</div></div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {([["rpm", s.rpm, 1], ["queue", s.queue, 0], ["lagSec", s.lagSec, 0], ["cpuPct", s.cpuPct, 0]] as const).map(([id, x, dp]) => (
          <div key={id} className="rounded-md border border-border px-3 py-2"><div className="text-[11px] text-text-tertiary">{SIGNAL_BY_ID[id].label}</div><div className="text-base font-semibold tabular-nums">{x.toFixed(dp)}<span className="text-[11px] font-normal text-text-tertiary"> {SIGNAL_BY_ID[id].unit}</span></div></div>))}
      </div>
      <div className="flex items-end gap-4"><svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-14 flex-1 rounded-md bg-surface-subtle" role="img" aria-label="Runs per minute, last hour"><polyline points={pts} fill="none" stroke="#12B58A" strokeWidth={1.6} vectorEffect="non-scaling-stroke" /></svg>
        <div className="text-[11px] text-text-tertiary w-28">Runs per minute, last hour. Top is {Math.round(max)}.</div></div>
      <div className={clsx("rounded-md border border-border px-3 py-2.5 text-[13px]", tone)} role="status"><span className="font-medium">{d?.kind === "switch" ? "Moving" : d?.kind === "blocked" ? "Refused" : d?.kind === "hold" ? "Staying put" : "Watching"}. </span>{d?.reason ?? "Waiting for the first reading."}</div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-text-tertiary mb-2">Try it with sample load</div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Sample load">{SCENARIOS.map((sc) => <button key={sc.id} type="button" aria-pressed={scenario === sc.id} title={sc.blurb} onClick={() => loadSim.pick(a, sc.id)}
          className={clsx("h-8 px-3 rounded-md border text-[13px]", scenario === sc.id ? "border-[#07191E] bg-[#07191E] text-white" : "border-border-strong hover:bg-surface-muted")}>{sc.label}</button>)}</div>
        <p className="text-[11px] text-text-tertiary mt-1.5">{SCENARIOS.find((x) => x.id === scenario)?.blurb} Pick one and wait: the rules need the load to hold for their time before the agent moves. Updates every {REAL_TICK_MS / 1000} s.</p>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-text-tertiary mb-2">Recent moves</div>
        {log.length === 0 ? <p className="text-[13px] text-text-secondary">No moves yet.</p> : (
          <ul className="divide-y divide-border rounded-lg border border-border">{log.slice(0, 6).map((e, i) => (
            <li key={i} className="px-3 py-2.5 text-[13px]"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{RUNTIME_BY_ID[e.from].label} <span className="text-text-tertiary">to</span> {RUNTIME_BY_ID[e.to].label}</span>
              <span className="text-[11px] text-text-tertiary tabular-nums">{clock(e.simAt)} sample time · {e.auto ? "by a rule" : "by a person"}</span></div>
              <div className="text-xs text-text-secondary mt-0.5">{e.auto ? e.reason : e.rule}{e.auto && e.inFlight ? ` ${e.inFlight} ${e.inFlight === 1 ? "run" : "runs"} ${e.strategy === "handoff" ? "carried across" : "drained"}.` : ""}</div></li>))}</ul>)}
      </div>
    </div>
  );
}
void describeCondition;
