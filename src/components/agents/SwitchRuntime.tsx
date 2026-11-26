"use client";

import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, CircleDashed, Loader2, Repeat2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { Modal, Notice } from "@/components/mlops/ui";
import { agents as actions } from "@/lib/agents/store";
import { RUNTIMES, RUNTIME_BY_ID, type RuntimeKind } from "@/lib/agents/execution";
import { STRATEGIES, estimateInFlight, fmtSeconds, planSwitch, progressAt, remainingOnOld, type Plan, type Strategy } from "@/lib/agents/switching";
import type { Agent } from "@/lib/agents/types";
import { toast } from "@/lib/mlops/toast";

/** The sample clock runs this many times faster than a real switch would, so the steps can be watched. */
const SPEED = 4;

/** A button that opens the switch flow, and a line that offers to undo the last switch. Shown only for an agent tok∑ner runs. */
export function SwitchRuntimeButton({ a, compact }: { a: Agent; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const can = a.control === "governed" && a.state !== "retired" && !!a.execution;
  if (!can) return null;
  return (
    <>
      <Button onClick={() => setOpen(true)} className={compact ? "h-8 px-3 text-[13px]" : undefined}><Repeat2 size={14} /> Switch runtime</Button>
      {open && <SwitchRuntimeDialog a={a} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Offered after a switch, for as long as nothing else about how the agent runs has been changed. */
export function UndoSwitch({ a }: { a: Agent }) {
  if (!a.lastSwitch) return null;
  const back = RUNTIME_BY_ID[a.lastSwitch.from.runtime].label.toLowerCase(); const was = a.execution ? RUNTIME_BY_ID[a.execution.runtime].label.toLowerCase() : "";
  return (
    <Notice tone="info" title="Runtime switched">
      <div className="flex flex-wrap items-center justify-between gap-3"><span>Moved from {back} to {was} on {new Date(a.lastSwitch.at).toLocaleString()}. The earlier settings are kept until you change how the agent runs.</span>
        <Button className="h-8 px-3 text-[13px]" onClick={() => { const r = actions.undoSwitch(a.id); if (!r.ok) toast(r.error, "error"); else toast(`Back on ${back}`, "success"); }}><Undo2 size={14} /> Undo the switch</Button></div>
    </Notice>
  );
}

type Phase = "plan" | "running" | "done" | "stopped";

export function SwitchRuntimeDialog({ a, onClose }: { a: Agent; onClose: () => void }) {
  const from = a.execution!.runtime;
  const options = RUNTIMES.filter((r) => r.id !== from);
  const [to, setTo] = useState<RuntimeKind>(options.find((r) => r.id !== "external")!.id);
  const [strategy, setStrategy] = useState<Strategy>("drain");
  const est = useMemo(() => estimateInFlight(a), [a]);
  const [flight, setFlight] = useState(Math.max(est, 3)); const [flightText, setFlightText] = useState(String(Math.max(est, 3)));
  const [phase, setPhase] = useState<Phase>("plan"); const [elapsed, setElapsed] = useState(0);
  const plan = useMemo(() => planSwitch(a, to, strategy, flight), [a, to, strategy, flight]);
  // While it runs, the plan is the one that was agreed, not one worked out again from the agent as it changes under it.
  const frozen = useRef<Plan | null>(null); const applied = useRef(false);
  const shown = frozen.current && phase !== "plan" ? frozen.current : plan;
  const routeAt = shown.steps.slice(0, 3).reduce((t, s) => t + s.seconds, 0);

  // If the chosen strategy is not allowed for this target, fall back to the first that is.
  useEffect(() => { if (!plan.allowed.includes(strategy)) setStrategy("drain"); }, [plan.allowed, strategy]);

  useEffect(() => {
    if (phase !== "running") return;
    const t0 = performance.now() - elapsed * 1000 / SPEED;
    const id = setInterval(() => setElapsed(((performance.now() - t0) / 1000) * SPEED), 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);
  useEffect(() => {
    if (phase !== "running" || !frozen.current) return;
    // New runs go to the new runtime at the routing step; that is when the agent's settings change.
    if (!applied.current && elapsed >= routeAt) { const r = actions.switchRuntime(a.id, frozen.current.to, frozen.current.strategy, frozen.current.inFlight); if (!r.ok) { toast(r.error, "error"); setPhase("stopped"); return; } applied.current = true; }
    if (progressAt(frozen.current, elapsed).done) { setPhase("done"); toast(`Now on ${RUNTIME_BY_ID[frozen.current.to].label.toLowerCase()}`, "success"); }
  }, [elapsed, phase, routeAt, a.id]);

  const start = () => { frozen.current = plan; applied.current = false; setElapsed(0); setPhase("running"); };
  const cancel = () => { setPhase("stopped"); };
  const rollBack = () => { if (applied.current) { actions.undoSwitch(a.id); toast(`Rolled back to ${RUNTIME_BY_ID[shown.from].label.toLowerCase()}`, "info"); } setPhase("stopped"); };
  const prog = progressAt(shown, elapsed); const onOld = remainingOnOld(shown, elapsed); const moved = shown.strategy === "handoff" ? shown.inFlight - onOld : 0;
  const pct = Math.min(100, Math.round((elapsed / shown.totalSeconds) * 100));
  const blocked = plan.blockers.length > 0;

  const title = phase === "plan" ? `Switch ${a.title} to another runtime` : phase === "running" ? `Switching ${a.title}` : phase === "done" ? `${a.title} has moved` : `Switch stopped`;
  const footer = phase === "plan" ? (<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={blocked} onClick={start}>Start the switch <ArrowRight size={14} /></Button></>)
    : phase === "running" ? (applied.current ? <Button onClick={rollBack}><Undo2 size={14} /> Roll back</Button> : <Button onClick={cancel}>Cancel, nothing has moved</Button>)
    : <Button variant="primary" onClick={onClose}>Close</Button>;

  return (
    <Modal open onClose={phase === "running" ? () => undefined : onClose} title={title} wide footer={footer}>
      {phase === "plan" ? (
        <div className="space-y-5">
          <p className="text-[13px] text-text-secondary">Move this agent from <strong className="text-text-primary">{RUNTIME_BY_ID[from].label}</strong> to another runtime while it keeps working. You see what will change and what happens to runs already under way before anything moves.</p>

          <section aria-label="Where to">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary mb-2">Move it to</h3>
            <div className="grid sm:grid-cols-2 gap-2.5" role="radiogroup" aria-label="Target runtime">
              {options.map((r) => { const off = r.id === "external"; return (
                <button key={r.id} type="button" role="radio" aria-checked={to === r.id} disabled={off} onClick={() => setTo(r.id)}
                  className={clsx("text-left rounded-lg border p-3 disabled:opacity-50 disabled:cursor-not-allowed", to === r.id ? "border-[#07191E] ring-1 ring-[#07191E] bg-surface-subtle" : "border-border hover:bg-surface-subtle")}>
                  <div className="text-[13px] font-semibold">{r.label}</div><div className="text-xs text-text-secondary mt-0.5 leading-snug">{off ? "tok∑ner cannot move an agent onto a platform it does not run." : r.best}</div>
                  {!off && <div className="text-[11px] text-text-tertiary mt-1.5">{r.billing}. Cold start: {r.coldStart.toLowerCase()}.</div>}</button>); })}
            </div>
          </section>

          <section aria-label="Runs already under way" className="grid md:grid-cols-[1fr_220px] gap-5">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary mb-2">Runs already under way</h3>
              <div className="space-y-2" role="radiogroup" aria-label="What happens to them">
                {STRATEGIES.map((s) => { const ok = plan.allowed.includes(s.id); return (
                  <button key={s.id} type="button" role="radio" aria-checked={strategy === s.id} disabled={!ok} onClick={() => setStrategy(s.id)}
                    className={clsx("w-full text-left rounded-lg border px-3 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed", strategy === s.id ? "border-[#07191E] ring-1 ring-[#07191E] bg-surface-subtle" : "border-border hover:bg-surface-subtle")}>
                    <div className="flex items-center justify-between gap-2"><span className="text-[13px] font-semibold">{s.label}</span><span className={clsx("text-[11px]", s.id === "cutover" ? "text-status-down" : "text-text-tertiary")}>{ok ? `Loses: ${s.loses.split(".")[0].toLowerCase()}` : "Needs saved progress"}</span></div>
                    <div className="text-xs text-text-secondary mt-0.5 leading-snug">{s.blurb}</div></button>); })}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary mb-2">In flight now</h3>
              <Field label="Runs under way" hint={`Estimated ${est} at this agent's sample traffic. Change it to what you see.`}>
                <Input type="number" min={0} max={100000} value={flightText} onChange={(e) => { setFlightText(e.target.value); const n = Number(e.target.value); if (Number.isFinite(n) && n >= 0) setFlight(Math.round(n)); }} aria-label="Runs in flight" /></Field>
            </div>
          </section>

          {plan.blockers.length > 0 && <Notice tone="bad" title="This switch cannot go ahead"><ul className="list-disc pl-4 space-y-0.5">{plan.blockers.map((b) => <li key={b}>{b}</li>)}</ul></Notice>}

          <section aria-label="What changes">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary mb-2">What changes</h3>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-[13px]"><thead className="bg-surface-subtle text-text-tertiary text-xs"><tr><th className="text-left font-medium px-3 py-2 w-32">Setting</th><th className="text-left font-medium px-3 py-2">Now</th><th className="text-left font-medium px-3 py-2">After</th></tr></thead>
                <tbody>{plan.changes.map((c) => (
                  <tr key={c.label} className="border-t border-border"><td className="px-3 py-2 text-text-secondary">{c.label}</td><td className="px-3 py-2">{c.from}</td>
                    <td className={clsx("px-3 py-2 font-medium", c.from === c.to ? "text-text-tertiary font-normal" : c.tone === "warn" ? "text-[#8A5504]" : c.tone === "good" ? "text-[#067A4E]" : "")}>{c.from === c.to ? "Same" : c.to}</td></tr>))}</tbody></table>
            </div>
          </section>

          {plan.warnings.length > 0 && <Notice tone="warn" title="Before you agree"><ul className="list-disc pl-4 space-y-0.5">{plan.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Notice>}

          <section aria-label="The steps">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary mb-2">The steps</h3>
            <div className="grid sm:grid-cols-3 gap-2.5 mb-3">
              <Stat k="Takes about" v={fmtSeconds(plan.totalSeconds)} />
              <Stat k="Runs cancelled" v={String(plan.cancelled)} bad={plan.cancelled > 0} />
              <Stat k="Time no run can start" v={plan.gapSeconds ? fmtSeconds(plan.gapSeconds) : "None"} bad={plan.gapSeconds > 0} />
            </div>
            <ol className="space-y-1.5">{plan.steps.map((s, i) => (
              <li key={s.id} className="flex gap-3 rounded-md px-1 py-1"><span className="h-5 w-5 rounded-full border border-border-strong text-[11px] grid place-items-center shrink-0 text-text-secondary tabular-nums mt-0.5">{i + 1}</span>
                <div className="min-w-0 flex-1"><div className="flex justify-between gap-3 text-[13px]"><span className="font-medium">{s.label}</span><span className="text-text-tertiary tabular-nums">{fmtSeconds(s.seconds)}</span></div><div className="text-xs text-text-secondary">{s.detail}</div></div></li>))}</ol>
            <p className="text-[11px] text-text-tertiary mt-2">Times are estimates. In this sample workspace nothing really moves: the switch runs on a clock about {SPEED} times faster than a real one and changes the saved settings.</p>
          </section>
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-between text-[13px] mb-1.5"><span className="font-medium">{RUNTIME_BY_ID[shown.from].label} <ArrowRight size={12} className="inline mx-1" /> {RUNTIME_BY_ID[shown.to].label}</span><span className="text-text-tertiary tabular-nums">{phase === "done" ? "Done" : phase === "stopped" ? "Stopped" : `${pct}%`}</span></div>
            <div className="h-2 rounded-full bg-surface-muted overflow-hidden" role="progressbar" aria-valuenow={phase === "done" ? 100 : pct} aria-valuemin={0} aria-valuemax={100} aria-label="Switch progress"><div className={clsx("h-full rounded-full transition-[width] duration-150", phase === "stopped" ? "bg-text-tertiary" : "bg-[#12B58A]")} style={{ width: `${phase === "done" ? 100 : pct}%` }} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Lane title={RUNTIME_BY_ID[shown.from].label} sub="Old runtime" runs={phase === "stopped" ? shown.inFlight : onOld} tone="old" note={elapsed >= routeAt || phase === "done" ? "Takes no new runs" : "Serving everything"} />
            <Lane title={RUNTIME_BY_ID[shown.to].label} sub="New runtime" runs={phase === "stopped" ? 0 : moved} tone="new" note={elapsed >= routeAt || phase === "done" ? "Serving new runs" : "Starting"} />
          </div>
          {shown.cancelled > 0 && elapsed >= routeAt && phase !== "stopped" && <Notice tone="warn" title={`${shown.cancelled} ${shown.cancelled === 1 ? "run was" : "runs were"} cancelled`}>Their callers received an error they can retry.</Notice>}
          <ol className="space-y-2">{shown.steps.map((s, i) => { const state = phase === "stopped" ? (i < prog.index ? "done" : "todo") : phase === "done" || i < prog.index ? "done" : i === prog.index ? "doing" : "todo"; return (
            <li key={s.id} className="flex gap-3 items-start"><span className={clsx("h-5 w-5 rounded-full grid place-items-center shrink-0 mt-0.5", state === "done" ? "bg-[#12B58A] text-white" : state === "doing" ? "text-[#12B58A]" : "text-text-tertiary")}>{state === "done" ? <Check size={12} strokeWidth={3} /> : state === "doing" ? <Loader2 size={15} className="animate-spin" /> : <CircleDashed size={15} />}</span>
              <div className="min-w-0"><div className={clsx("text-[13px]", state === "todo" ? "text-text-tertiary" : "font-medium")}>{s.label}</div>{state === "doing" && <div className="text-xs text-text-secondary">{s.detail}</div>}</div></li>); })}</ol>
          {phase === "done" && <Notice tone="ok" title="The switch is complete">New runs are on {RUNTIME_BY_ID[shown.to].label.toLowerCase()}. The earlier settings are kept, so you can undo the switch from the Runtime tab until you change how the agent runs.</Notice>}
          {phase === "stopped" && <Notice tone="info" title="Nothing is left half done">{applied.current ? "The agent is back on its earlier runtime." : "The switch was stopped before any run moved, so the agent is exactly as it was."}</Notice>}
        </div>
      )}
    </Modal>
  );
}

function Stat({ k, v, bad }: { k: string; v: string; bad?: boolean }) {
  return <div className="rounded-md border border-border px-3 py-2"><div className="text-[11px] text-text-tertiary">{k}</div><div className={clsx("text-sm font-semibold tabular-nums", bad && "text-status-down")}>{v}</div></div>;
}
function Lane({ title, sub, runs, note, tone }: { title: string; sub: string; runs: number; note: string; tone: "old" | "new" }) {
  return (
    <div className={clsx("rounded-lg border p-3", tone === "new" ? "border-[#12B58A]/50 bg-[#12B58A]/5" : "border-border")}>
      <div className="text-[11px] text-text-tertiary">{sub}</div><div className="text-[13px] font-semibold">{title}</div>
      <div className="mt-2 flex items-baseline gap-1.5"><span className="text-2xl font-semibold tabular-nums">{runs}</span><span className="text-xs text-text-secondary">{runs === 1 ? "run" : "runs"} in flight</span></div>
      <div className="text-xs text-text-tertiary mt-0.5">{note}</div>
    </div>
  );
}
