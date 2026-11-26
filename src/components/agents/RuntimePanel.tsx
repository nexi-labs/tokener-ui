"use client";

import { OwnerSelect } from "@/components/org/OrgSelect";
import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select, Toggle } from "@/components/ui/Form";
import { MetricChart, Notice } from "@/components/mlops/ui";
import { agents as actions } from "@/lib/agents/store";
import { useHub } from "@/lib/agents/hub";
import type { Agent } from "@/lib/agents/types";
import {
  CONSOLE_CHANNEL, METRICS, METRIC_BY_ID, MODES, MODE_BY_ID, RUNTIMES, RUNTIME_BY_ID, autoscale, defaultExecution, defaultHuman, defaultOnDemand, defaultSchedule, defaultStreaming, defaultTrigger, describeCron, enabledModes, nextRuns, validateExecution,
  type Execution, type GateWhen, type Load, type ModeId, type RuntimeKind, type StreamKind, type TriggerKind,
} from "@/lib/agents/execution";
import { toast } from "@/lib/mlops/toast";
import { ToolCallingCard } from "@/components/agents/ToolCallingCard";
import { SwitchRuntimeButton, UndoSwitch } from "@/components/agents/SwitchRuntime";
import { AutoSwitchCard } from "@/components/agents/AutoSwitchCard";

const GATE: { id: GateWhen; label: string }[] = [{ id: "always", label: "Every run" }, { id: "low-confidence", label: "Low confidence" }, { id: "sensitive-tool", label: "Before a sensitive tool" }, { id: "cost", label: "Cost above a limit" }, { id: "policy", label: "A policy asks" }];
const TRIGGERS: TriggerKind[] = ["webhook", "topic", "queue", "dataset", "cdc", "file", "email"];
const STREAMS: StreamKind[] = ["kafka", "kinesis", "pubsub", "events", "websocket"];
const num = (v: string, d = 0) => (Number.isFinite(Number(v)) && v !== "" ? Number(v) : d);

/** The Runtime tab of an agent: where it runs, what starts it, and how many copies follow the work. Saved settings change how tok∑ner runs a governed agent. */
export function RuntimePanel({ a }: { a: Agent }) {
  const hub = useHub();
  const saved = a.execution ?? defaultExecution("serverless");
  const [draft, setDraft] = useState<Execution>(saved);
  // A switch of runtime changes the saved settings from outside this form, so the form follows it.
  // A switch (by a person or by a rule) changes the saved settings while the form is open. Unsaved edits to the rules are kept; everything else follows the saved settings.
  const prev = useRef(saved);
  useEffect(() => {
    const was = prev.current; prev.current = saved;
    setDraft((d) => (JSON.stringify(d) === JSON.stringify(was) ? saved : { ...saved, autoSwitch: d.autoSwitch }));
  }, [a.execution]); // eslint-disable-line react-hooks/exhaustive-deps
  const [peak, setPeak] = useState(40);
  const governed = a.control === "governed" && a.state !== "retired";
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const rt = RUNTIME_BY_ID[draft.runtime]; const sc = draft.scaling; const au = sc.autoscale;
  const issues = useMemo(() => validateExecution(draft, { hasSensitiveTools: a.tools.some((t) => t.sensitive), control: a.control, toolCount: a.tools.length }), [draft, a]);
  const errors = issues.filter((i) => i.level === "error"); const warns = issues.filter((i) => i.level === "warning");
  const set = (fn: (e: Execution) => Execution) => setDraft((d) => fn(d));
  const setMode = <K extends ModeId>(k: K, v: Execution["modes"][K] | undefined) => set((e) => { const modes = { ...e.modes }; if (v === undefined) delete modes[k]; else modes[k] = v; return { ...e, modes }; });
  const pickRuntime = (k: RuntimeKind) => set((e) => {
    const d = defaultExecution(k); const keep = Object.fromEntries(Object.entries(e.modes).filter(([m]) => RUNTIME_BY_ID[k].modes.includes(m as ModeId)));
    return { ...d, autoSwitch: e.autoSwitch, modes: Object.keys(keep).length ? keep : d.modes };
  });
  const save = () => { const r = actions.setExecution(a.id, draft); if (!r.ok) toast(r.error, "error"); else toast("Runtime settings saved", "success"); };

  // The same autoscaler the Constellation runs, on a working day with one busy period, every 15 minutes.
  const preview = useMemo(() => {
    if (draft.runtime === "external") return [];
    const start = new Date(); start.setHours(0, 0, 0, 0); const out: { t: string; load: number; replicas: number }[] = []; let cur = draft.scaling.autoscale.mode === "manual" ? draft.scaling.autoscale.desired : draft.scaling.minReplicas; let last: { at: number; direction: "up" | "down" } | undefined;
    for (let i = 0; i < 96; i++) {
      const now = start.getTime() + i * 900_000; const h = i / 4;
      const shape = Math.max(0, Math.exp(-((h - 10.5) ** 2) / 6) + 0.7 * Math.exp(-((h - 15) ** 2) / 4) + 0.04);
      const runs = Math.round(peak * shape * 10) / 10;
      const avg = 2; const load: Load = { runs, rps: runs / avg, queue: runs * 3, lagSec: runs * 4 / Math.max(1, cur), cpuPct: Math.min(98, 12 + (runs * 7) / Math.max(1, cur)) };
      const d = autoscale(draft, load, cur, now, last);
      if (d.desired !== cur) { last = { at: now, direction: d.desired > cur ? "up" : "down" }; cur = d.desired; }
      out.push({ t: `${String(Math.floor(h)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`, load: Math.round(runs), replicas: cur });
    }
    return out;
  }, [draft, peak]);
  const maxSeen = preview.length ? Math.max(...preview.map((p) => p.replicas)) : 0;

  const channels = [{ id: CONSOLE_CHANNEL, name: "tok∑ner console" }, ...hub.channels.filter((c) => c.enabled).map((c) => ({ id: c.id, name: c.name }))];
  const connections = hub.connections;
  const on = enabledModes(draft);
  const m = draft.modes;
  const lock = !governed;
  const sec = "grid sm:grid-cols-2 lg:grid-cols-3 gap-4";

  return (
    <div className="space-y-5">
      {!governed && <Notice tone="warn" title={a.state === "retired" ? "Retired" : "Not run by tok∑ner"}>{a.state === "retired" ? "A retired agent cannot be changed." : "tok∑ner does not run this agent, so these settings are a record of how it starts on its own platform. Change them there."}</Notice>}

      <UndoSwitch a={a} />

      <Card><CardHeader title="Where it runs" subtitle="The shape of the hosting. It decides what can start the agent, how it scales and how it is billed." action={<SwitchRuntimeButton a={a} />} />
        <CardBody><div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3" role="radiogroup" aria-label="Runtime">
          {RUNTIMES.map((r) => (
            <button key={r.id} type="button" role="radio" aria-checked={draft.runtime === r.id} disabled={lock} onClick={() => pickRuntime(r.id)}
              className={clsx("text-left rounded-lg border p-3 transition-colors disabled:opacity-60", draft.runtime === r.id ? "border-[#07191E] bg-surface-subtle ring-1 ring-[#07191E]" : "border-border hover:bg-surface-subtle")}>
              <div className="text-sm font-semibold">{r.label}</div><div className="text-xs text-text-secondary mt-1 leading-snug">{r.best}</div>
              <div className="text-[11px] text-text-tertiary mt-2">{r.billing}</div></button>))}</div>
          <p className="text-xs text-text-tertiary mt-3 max-w-3xl">{rt.blurb} Cold start: {rt.coldStart.toLowerCase()}.</p>
          {draft.runtime !== "external" && <div className="mt-2"><Toggle checked={draft.durable} onChange={(v) => !lock && set((e) => ({ ...e, durable: v }))} label="Save progress between steps" description="A saved run can wait hours for a person and carry on, and can be resumed after a restart." /></div>}
        </CardBody></Card>

      <AutoSwitchCard a={a} value={draft.autoSwitch} onChange={(v) => !lock && set((e) => ({ ...e, autoSwitch: v }))} lock={lock || draft.runtime === "external"} saved={saved.autoSwitch} dirty={JSON.stringify(draft.autoSwitch) !== JSON.stringify(saved.autoSwitch)} />

      <ToolCallingCard a={a} value={draft.toolCalling} onChange={(v) => !lock && set((e) => ({ ...e, toolCalling: v }))} lock={lock} connections={connections} />

      <Card><CardHeader title="What starts it" subtitle="Turn on every way a run can begin. The runtime limits which are possible." />
        <CardBody className="space-y-4">
          {MODES.map((mi) => {
            const allowed = rt.modes.includes(mi.id); const enabled = !!m[mi.id];
            return (
              <div key={mi.id} className={clsx("rounded-lg border", enabled ? "border-border-strong" : "border-border", !allowed && "opacity-55")}>
                <div className="px-4"><Toggle checked={enabled} onChange={(v) => {
                  if (lock || !allowed) return;
                  if (!v) return setMode(mi.id, undefined);
                  if (mi.id === "onDemand") setMode("onDemand", defaultOnDemand()); if (mi.id === "scheduled") setMode("scheduled", { schedules: [defaultSchedule()] }); if (mi.id === "event") setMode("event", { triggers: [defaultTrigger()], concurrency: 5, retries: 3, deadLetter: "agent-dead-letter" });
                  if (mi.id === "streaming") setMode("streaming", defaultStreaming()); if (mi.id === "human") setMode("human", defaultHuman());
                }} label={`${mi.label}${allowed ? "" : ", not on this runtime"}`} description={`${mi.blurb} Example: ${mi.example}`} /></div>
                {enabled && (
                  <div className="border-t border-border px-4 py-4 space-y-4">
                    {mi.id === "onDemand" && m.onDemand && <div className={sec}>
                      <Field label="Answer"><Select disabled={lock} value={m.onDemand.response} onChange={(e) => setMode("onDemand", { ...m.onDemand!, response: e.target.value as "sync" })}><option value="sync">Wait for the answer</option><option value="task">Return a task id to poll</option><option value="stream">Stream the answer</option></Select></Field>
                      <Field label="Time limit, seconds"><Input disabled={lock} type="number" min={1} value={m.onDemand.timeoutSec} onChange={(e) => setMode("onDemand", { ...m.onDemand!, timeoutSec: num(e.target.value) })} /></Field>
                      <Field label="Runs at once"><Input disabled={lock} type="number" min={1} value={m.onDemand.concurrency} onChange={(e) => setMode("onDemand", { ...m.onDemand!, concurrency: num(e.target.value) })} /></Field></div>}

                    {mi.id === "scheduled" && m.scheduled && <div className="space-y-3">
                      {m.scheduled.schedules.map((s, i) => { const nx = nextRuns(s.cron, s.timezone, 3); const upd = (p: Partial<typeof s>) => setMode("scheduled", { schedules: m.scheduled!.schedules.map((x, j) => (j === i ? { ...x, ...p } : x)) });
                        return <div key={s.id} className="rounded-md bg-surface-subtle p-3 space-y-3"><div className={sec}>
                          <Field label="Name"><Input disabled={lock} value={s.name} onChange={(e) => upd({ name: e.target.value })} /></Field>
                          <Field label="When, as a cron expression" hint={describeCron(s.cron)}><Input disabled={lock} className="font-mono" value={s.cron} onChange={(e) => upd({ cron: e.target.value })} /></Field>
                          <Field label="Time zone"><Input disabled={lock} value={s.timezone} onChange={(e) => upd({ timezone: e.target.value })} /></Field>
                          <Field label="If the last run is still going"><Select disabled={lock} value={s.overlap} onChange={(e) => upd({ overlap: e.target.value as "skip" })}><option value="skip">Skip this run</option><option value="queue">Queue it</option><option value="replace">Replace the old run</option></Select></Field>
                          <Field label="Runs missed while down"><Select disabled={lock} value={s.catchUp} onChange={(e) => upd({ catchUp: e.target.value as "none" })}><option value="none">Ignore them</option><option value="latest">Run the latest once</option><option value="all">Run all of them</option></Select></Field>
                          <Field label="Input"><Input disabled={lock} value={s.input} onChange={(e) => upd({ input: e.target.value })} /></Field></div>
                          <div className="flex items-center justify-between gap-3 text-xs text-text-secondary"><span>{nx.length ? `Next: ${nx.map((t) => new Date(t).toLocaleString("en-GB", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: s.timezone })).join(", ")}` : "No run found. Check the expression and the time zone."}</span>
                            <button type="button" disabled={lock} onClick={() => setMode("scheduled", { schedules: m.scheduled!.schedules.filter((_, j) => j !== i) })} className="inline-flex items-center gap-1 hover:text-text-primary"><Trash2 size={13} /> Remove</button></div></div>; })}
                      <Button disabled={lock} onClick={() => setMode("scheduled", { schedules: [...m.scheduled!.schedules, defaultSchedule()] })}><Plus size={14} /> Add a schedule</Button></div>}

                    {mi.id === "event" && m.event && <div className="space-y-3">
                      {m.event.triggers.map((t, i) => { const upd = (p: Partial<typeof t>) => setMode("event", { ...m.event!, triggers: m.event!.triggers.map((x, j) => (j === i ? { ...x, ...p } : x)) });
                        return <div key={t.id} className="rounded-md bg-surface-subtle p-3 space-y-3"><div className={sec}>
                          <Field label="Kind"><Select disabled={lock} value={t.kind} onChange={(e) => upd({ kind: e.target.value as TriggerKind })}>{TRIGGERS.map((k) => <option key={k} value={k}>{k}</option>)}</Select></Field>
                          <Field label={t.kind === "webhook" ? "Path" : t.kind === "file" ? "Folder" : t.kind === "email" ? "Mailbox" : "Source"}><Input disabled={lock} className="font-mono" value={t.source} onChange={(e) => upd({ source: e.target.value })} /></Field>
                          <Field label="Connection" hint="From Integrations. A webhook needs none."><Select disabled={lock} value={t.connection ?? ""} onChange={(e) => upd({ connection: e.target.value || undefined })}><option value="">None</option>{connections.map((c) => <option key={c.id} value={c.id}>{c.name}, {c.env}</option>)}</Select></Field>
                          <Field label="Only when it matches"><Input disabled={lock} className="font-mono" value={t.filter} onChange={(e) => upd({ filter: e.target.value })} /></Field>
                          <Field label="Events per run"><Input disabled={lock} type="number" min={1} value={t.batchSize} onChange={(e) => upd({ batchSize: num(e.target.value, 1) })} /></Field></div>
                          <button type="button" disabled={lock} onClick={() => setMode("event", { ...m.event!, triggers: m.event!.triggers.filter((_, j) => j !== i) })} className="text-xs text-text-secondary hover:text-text-primary inline-flex items-center gap-1"><Trash2 size={13} /> Remove</button></div>; })}
                      <Button disabled={lock} onClick={() => setMode("event", { ...m.event!, triggers: [...m.event!.triggers, defaultTrigger()] })}><Plus size={14} /> Add a trigger</Button>
                      <div className={sec}><Field label="Runs at once"><Input disabled={lock} type="number" min={1} value={m.event.concurrency} onChange={(e) => setMode("event", { ...m.event!, concurrency: num(e.target.value, 1) })} /></Field>
                        <Field label="Retries"><Input disabled={lock} type="number" min={0} value={m.event.retries} onChange={(e) => setMode("event", { ...m.event!, retries: num(e.target.value) })} /></Field>
                        <Field label="Dead letter queue" hint="Where an event goes after its last retry."><Input disabled={lock} className="font-mono" value={m.event.deadLetter ?? ""} onChange={(e) => setMode("event", { ...m.event!, deadLetter: e.target.value || undefined })} /></Field></div></div>}

                    {mi.id === "streaming" && m.streaming && <div className={sec}>
                      <Field label="Stream"><Select disabled={lock} value={m.streaming.source.kind} onChange={(e) => setMode("streaming", { ...m.streaming!, source: { ...m.streaming!.source, kind: e.target.value as StreamKind } })}>{STREAMS.map((k) => <option key={k}>{k}</option>)}</Select></Field>
                      <Field label="Topic"><Input disabled={lock} className="font-mono" value={m.streaming.source.topic} onChange={(e) => setMode("streaming", { ...m.streaming!, source: { ...m.streaming!.source, topic: e.target.value } })} /></Field>
                      <Field label="Connection"><Select disabled={lock} value={m.streaming.source.connection ?? ""} onChange={(e) => setMode("streaming", { ...m.streaming!, source: { ...m.streaming!.source, connection: e.target.value || undefined } })}><option value="">None</option>{connections.map((c) => <option key={c.id} value={c.id}>{c.name}, {c.env}</option>)}</Select></Field>
                      <Field label="Consumer group"><Input disabled={lock} className="font-mono" value={m.streaming.consumerGroup} onChange={(e) => setMode("streaming", { ...m.streaming!, consumerGroup: e.target.value })} /></Field>
                      <Field label="Window"><Select disabled={lock} value={m.streaming.window.kind} onChange={(e) => setMode("streaming", { ...m.streaming!, window: { ...m.streaming!.window, kind: e.target.value as "none" } })}><option value="none">No window</option><option value="tumbling">Tumbling</option><option value="sliding">Sliding</option><option value="session">Session</option></Select></Field>
                      <Field label="Window size, seconds"><Input disabled={lock} type="number" min={1} value={m.streaming.window.sizeSec} onChange={(e) => setMode("streaming", { ...m.streaming!, window: { ...m.streaming!.window, sizeSec: num(e.target.value, 1) } })} /></Field>
                      <Field label="Delivery"><Select disabled={lock} value={m.streaming.delivery} onChange={(e) => setMode("streaming", { ...m.streaming!, delivery: e.target.value as "at-least-once" })}><option value="at-least-once">At least once</option><option value="exactly-once">Exactly once</option></Select></Field>
                      <Field label="Alert when behind by, seconds"><Input disabled={lock} type="number" min={1} value={m.streaming.maxLagSec} onChange={(e) => setMode("streaming", { ...m.streaming!, maxLagSec: num(e.target.value, 1) })} /></Field>
                      <Field label="When overloaded"><Select disabled={lock} value={m.streaming.backpressure} onChange={(e) => setMode("streaming", { ...m.streaming!, backpressure: e.target.value as "pause" })}><option value="pause">Pause reading</option><option value="drop-oldest">Drop the oldest</option><option value="shed">Shed load</option></Select></Field></div>}

                    {mi.id === "human" && m.human && <div className="space-y-4">
                      <div><div className="text-[13px] font-medium mb-1.5">Stop for a person</div><div className="flex flex-wrap gap-2">{GATE.map((g) => { const onG = m.human!.when.includes(g.id); return <button key={g.id} type="button" aria-pressed={onG} disabled={lock} onClick={() => setMode("human", { ...m.human!, when: onG ? m.human!.when.filter((x) => x !== g.id) : [...m.human!.when, g.id] })} className={clsx("h-8 rounded-full border px-3 text-[13px]", onG ? "bg-[#07191E] border-[#07191E] text-white" : "border-border-strong hover:bg-surface-muted")}>{g.label}</button>; })}</div></div>
                      <div className={sec}>
                        <OwnerSelect label="Who decides" hint="A group or person from People and access. Groups are managed in Organization, Roles and permissions." disabled={lock} value={m.human.assignee} onChange={(v) => setMode("human", { ...m.human!, assignee: v })} />
                        <Field label="Answer within, minutes"><Input disabled={lock} type="number" min={1} value={m.human.slaMinutes} onChange={(e) => setMode("human", { ...m.human!, slaMinutes: num(e.target.value, 1) })} /></Field>
                        <Field label="If nobody answers"><Select disabled={lock} value={m.human.onTimeout} onChange={(e) => setMode("human", { ...m.human!, onTimeout: e.target.value as "wait" })}><option value="escalate">Escalate</option><option value="decline">Decline</option><option value="wait">Keep waiting</option></Select></Field>
                        <Field label="Confidence below"><Input disabled={lock} type="number" step={0.05} min={0} max={1} value={m.human.confidenceBelow} onChange={(e) => setMode("human", { ...m.human!, confidenceBelow: num(e.target.value) })} /></Field>
                        <Field label="Cost above, USD"><Input disabled={lock} type="number" min={0} value={m.human.costAboveUsd} onChange={(e) => setMode("human", { ...m.human!, costAboveUsd: num(e.target.value) })} /></Field>
                        <OwnerSelect label="Escalate to" empty="Nobody" disabled={lock} value={m.human.escalateTo ?? ""} onChange={(v) => setMode("human", { ...m.human!, escalateTo: v || undefined })} /></div>
                      <div><div className="text-[13px] font-medium mb-1.5">Where the request appears</div><div className="flex flex-wrap gap-2">{channels.map((c) => { const onC = m.human!.channels.includes(c.id); return <button key={c.id} type="button" aria-pressed={onC} disabled={lock} onClick={() => setMode("human", { ...m.human!, channels: onC ? m.human!.channels.filter((x) => x !== c.id) : [...m.human!.channels, c.id] })} className={clsx("h-8 rounded-full border px-3 text-[13px]", onC ? "bg-[#07191E] border-[#07191E] text-white" : "border-border-strong hover:bg-surface-muted")}>{c.name}</button>; })}</div>
                        <p className="text-xs text-text-tertiary mt-1.5">Channels come from the Notification Center. Only Slack, Teams and email can take the answer.</p></div>
                      <Toggle checked={m.human.requireReason} onChange={(v) => !lock && setMode("human", { ...m.human!, requireReason: v })} label="A reason is required to decline or approve with findings" /></div>}
                  </div>)}
              </div>);
          })}
          {on.length === 0 && <p className="text-sm text-status-down">Nothing can start this agent. Turn on at least one.</p>}
        </CardBody></Card>

      {draft.runtime !== "external" && <Card><CardHeader title="Scaling" subtitle="How many copies run. Automatic scaling follows the work. Manual holds the number you choose." />
        <CardBody className="space-y-5">
          <div className={sec}>
            <Field label="Fewest replicas"><Input disabled={lock} type="number" min={0} value={sc.minReplicas} onChange={(e) => set((d) => ({ ...d, scaling: { ...d.scaling, minReplicas: num(e.target.value) } }))} /></Field>
            <Field label="Most replicas"><Input disabled={lock} type="number" min={1} value={sc.maxReplicas} onChange={(e) => set((d) => ({ ...d, scaling: { ...d.scaling, maxReplicas: num(e.target.value, 1) } }))} /></Field>
            <Field label="Runs per replica"><Input disabled={lock} type="number" min={1} value={sc.concurrency} onChange={(e) => set((d) => ({ ...d, scaling: { ...d.scaling, concurrency: num(e.target.value, 1) } }))} /></Field>
            <Field label="Memory, MB"><Input disabled={lock} type="number" min={128} step={128} value={sc.memoryMb} onChange={(e) => set((d) => ({ ...d, scaling: { ...d.scaling, memoryMb: num(e.target.value, 128) } }))} /></Field>
            <Field label="CPU, cores"><Input disabled={lock} type="number" min={0.25} step={0.25} value={sc.cpu} onChange={(e) => set((d) => ({ ...d, scaling: { ...d.scaling, cpu: num(e.target.value, 1) } }))} /></Field>
            <Field label="Time limit per run, seconds"><Input disabled={lock} type="number" min={0} value={sc.timeoutSec} onChange={(e) => set((d) => ({ ...d, scaling: { ...d.scaling, timeoutSec: num(e.target.value) } }))} /></Field></div>
          <div className="border-t border-border pt-4 space-y-4">
            <div role="group" aria-label="Scaling mode" className="inline-flex rounded-md border border-border-strong p-0.5 bg-surface-subtle">{(["auto", "manual"] as const).map((x) => <button key={x} type="button" disabled={lock} aria-pressed={au.mode === x} onClick={() => set((d) => ({ ...d, scaling: { ...d.scaling, autoscale: { ...au, mode: x, desired: Math.min(sc.maxReplicas, Math.max(sc.minReplicas, au.desired)) } } }))} className={clsx("h-8 px-3 rounded text-[13px] font-medium", au.mode === x ? "bg-surface shadow-card" : "text-text-secondary")}>{x === "auto" ? "Automatic" : "Manual"}</button>)}</div>
            {au.mode === "manual" ? <div className="max-w-xs"><Field label="Replicas to hold"><Input disabled={lock} type="number" min={sc.minReplicas} max={sc.maxReplicas} value={au.desired} onChange={(e) => set((d) => ({ ...d, scaling: { ...d.scaling, autoscale: { ...au, desired: num(e.target.value) } } }))} /></Field></div> : <div className={sec}>
              <Field label="Follow" hint={METRIC_BY_ID[au.metric].blurb}><Select disabled={lock} value={au.metric} onChange={(e) => { const k = e.target.value as typeof au.metric; set((d) => ({ ...d, scaling: { ...d.scaling, autoscale: { ...au, metric: k, target: METRIC_BY_ID[k].defaultTarget } } })); }}>{METRICS.filter((x) => x.runtimes.includes(draft.runtime)).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</Select></Field>
              <Field label={`Target, ${METRIC_BY_ID[au.metric].unit}`}><Input disabled={lock} type="number" min={1} value={au.target} onChange={(e) => set((d) => ({ ...d, scaling: { ...d.scaling, autoscale: { ...au, target: num(e.target.value, 1) } } }))} /></Field>
              <div className="grid grid-cols-2 gap-3"><Field label="Scale up wait, s"><Input disabled={lock} type="number" min={0} value={au.upCooldownSec} onChange={(e) => set((d) => ({ ...d, scaling: { ...d.scaling, autoscale: { ...au, upCooldownSec: num(e.target.value) } } }))} /></Field>
                <Field label="Scale down wait, s"><Input disabled={lock} type="number" min={0} value={au.downCooldownSec} onChange={(e) => set((d) => ({ ...d, scaling: { ...d.scaling, autoscale: { ...au, downCooldownSec: num(e.target.value) } } }))} /></Field></div></div>}
            {au.mode === "auto" && <div className="space-y-2"><div className="text-[13px] font-medium">Busy-period floors</div><p className="text-xs text-text-tertiary">Raise the fewest replicas for a known busy time, so capacity is there before the load is.</p>
              {au.calendar.map((c, i) => { const upd = (p: Partial<typeof c>) => set((d) => ({ ...d, scaling: { ...d.scaling, autoscale: { ...au, calendar: au.calendar.map((x, j) => (j === i ? { ...x, ...p } : x)) } } }));
                return <div key={c.id} className="grid sm:grid-cols-[1fr_1fr_1fr_90px_90px_auto] gap-2 items-end rounded-md bg-surface-subtle p-3">
                  <Field label="Name"><Input disabled={lock} value={c.name} onChange={(e) => upd({ name: e.target.value })} /></Field><Field label="Starts" hint={describeCron(c.cron)}><Input disabled={lock} className="font-mono" value={c.cron} onChange={(e) => upd({ cron: e.target.value })} /></Field><Field label="Time zone"><Input disabled={lock} value={c.timezone} onChange={(e) => upd({ timezone: e.target.value })} /></Field>
                  <Field label="Fewest"><Input disabled={lock} type="number" min={0} value={c.minReplicas} onChange={(e) => upd({ minReplicas: num(e.target.value) })} /></Field><Field label="Minutes"><Input disabled={lock} type="number" min={1} value={c.durationMin} onChange={(e) => upd({ durationMin: num(e.target.value, 1) })} /></Field>
                  <button type="button" aria-label="Remove floor" disabled={lock} onClick={() => set((d) => ({ ...d, scaling: { ...d.scaling, autoscale: { ...au, calendar: au.calendar.filter((_, j) => j !== i) } } }))} className="h-9 w-9 grid place-items-center rounded-md border border-border-strong"><Trash2 size={14} /></button></div>; })}
              <Button disabled={lock} onClick={() => set((d) => ({ ...d, scaling: { ...d.scaling, autoscale: { ...au, calendar: [...au.calendar, { id: `cal_${au.calendar.length + 1}`, name: "Weekday peak", cron: "0 8 * * 1-5", timezone: "Europe/London", minReplicas: Math.max(2, sc.minReplicas), durationMin: 600 }] } } }))}><Plus size={14} /> Add a floor</Button></div>}
          </div>
          <div className="border-t border-border pt-4"><div className="flex flex-wrap items-end justify-between gap-3 mb-2"><div><div className="text-[13px] font-medium">What this does on a working day</div><p className="text-xs text-text-tertiary">The scaler that runs in production, fed a typical day with a morning and an afternoon peak. Highest: {maxSeen} replicas.</p></div>
            <div className="w-44"><Field label="Peak runs at once"><Input type="number" min={1} value={peak} onChange={(e) => setPeak(num(e.target.value, 1))} /></Field></div></div>
            <MetricChart data={preview} series={[{ key: "replicas", name: "Replicas" }, { key: "load", name: "Runs at once" }]} height={190} unit="" /></div>
        </CardBody></Card>}

      {(errors.length > 0 || warns.length > 0) && <Notice tone={errors.length ? "bad" : "warn"} title={errors.length ? "Fix these before saving" : "Worth a look"}><ul className="space-y-1">{[...errors, ...warns].map((i, k) => <li key={k}>{i.message}</li>)}</ul></Notice>}
      <div className="flex items-center justify-end gap-2 sticky bottom-0 bg-surface-subtle/90 backdrop-blur border-t border-border -mx-1 px-1 py-3">
        <span className="text-xs text-text-tertiary mr-auto">{dirty ? "Unsaved changes" : "Saved"}</span>
        <Button disabled={!dirty} onClick={() => setDraft(saved)}>Discard</Button><Button variant="primary" disabled={!dirty || !governed || errors.length > 0} onClick={save}>Save runtime settings</Button></div>
    </div>
  );
}
