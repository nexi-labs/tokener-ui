"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Toggle } from "@/components/ui/Form";
import { Notice } from "@/components/mlops/ui";
import { ago } from "@/components/refinery/bits";
import { refinery, useRefinery, useRefineryStatus } from "@/lib/refinery/store";
import { toast } from "@/lib/mlops/toast";
import type { Cadence, Recipe, RecipeSchedule } from "@/lib/refinery/types";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const browserZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } };
const zones = (): string[] => { try { const z = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? []; return ["UTC", ...z.filter((x) => x !== "UTC")]; } catch { return ["UTC"]; } };

export function describeCadence(c: Cadence) {
  if (c.frequency === "hourly") return `Every hour at minute ${String(c.minute).padStart(2, "0")}`;
  if (c.frequency === "daily") return `Every day at ${c.at}`;
  return `Every ${WEEKDAYS[Math.max(0, Math.min(6, c.weekday - 1))]} at ${c.at}`;
}

/** A start time written in the schedule's own zone and again in the reader's. */
export function startLabel(iso: string, zone: string) {
  if (!iso || Number.isNaN(Date.parse(iso))) return "";
  const d = new Date(iso);
  const fmt = (tz?: string) => { try { return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: tz, timeZoneName: "short" }).format(d); } catch { return d.toISOString(); } };
  const own = fmt(zone), mine = fmt();
  return own === mine ? own : `${own} (${mine} for you)`;
}

export function SchedulePanel({ recipe }: { recipe: Recipe }) {
  const isLive = useRefineryStatus().mode === "live";
  const schedule = useScheduleFor(recipe.id);
  const [cad, setCad] = useState<Cadence>({ frequency: "daily", minute: 0, at: "02:00", weekday: 1, timezone: browserZone() });
  const [on, setOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const tz = useMemo(zones, []);

  useEffect(() => { if (schedule) { setCad(schedule.cadence); setOn(schedule.enabled); } }, [schedule?.updatedAt, schedule?.recipeId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isLive) return <Notice tone="info" title="Schedules run on the server">A schedule starts runs by itself, so it needs a signed-in workspace. Sign in to schedule this recipe.</Notice>;

  const changed = !schedule || schedule.enabled !== on || JSON.stringify(schedule.cadence) !== JSON.stringify(cad);
  const save = async () => {
    setBusy(true); setErr(null);
    const r = await refinery.putSchedule(recipe.id, { enabled: on, cadence: cad });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    toast(on ? "Schedule saved" : "Schedule saved and paused");
  };
  const remove = async () => { setBusy(true); const r = await refinery.removeSchedule(recipe.id); setBusy(false); if (!r.ok) setErr(r.error); else toast("Schedule removed"); };

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold flex items-center gap-2"><CalendarClock size={15} />Run on a schedule</h3>
          <p className="text-xs text-text-secondary mt-0.5">The server starts this recipe by itself. A run is skipped while the previous one is still going, and starts missed while the platform was down are not replayed.</p>
        </div>
        {schedule && <Badge tone={schedule.enabled ? "healthy" : "neutral"}>{schedule.enabled ? "Active" : "Paused"}</Badge>}
      </div>

      {schedule?.lastOutcome === "failed" && <Notice tone="bad" title="The last scheduled start was refused">{schedule.lastMessage}</Notice>}
      {schedule && !schedule.enabled && schedule.failures >= 5 && <Notice tone="warn">The schedule paused itself after five refused starts in a row. Fix the cause, then turn it on again.</Notice>}
      {err && <Notice tone="bad">{err}</Notice>}

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Repeat">
          <Select value={cad.frequency} onChange={(e) => setCad({ ...cad, frequency: e.target.value as Cadence["frequency"] })}>
            <option value="hourly">Every hour</option><option value="daily">Every day</option><option value="weekly">Every week</option>
          </Select>
        </Field>
        {cad.frequency === "hourly" && <Field label="At minute" hint="0 to 59 past the hour."><Input type="number" min={0} max={59} value={cad.minute} onChange={(e) => setCad({ ...cad, minute: Math.max(0, Math.min(59, Number(e.target.value) || 0)) })} /></Field>}
        {cad.frequency === "weekly" && <Field label="On"><Select value={cad.weekday} onChange={(e) => setCad({ ...cad, weekday: Number(e.target.value) })}>{WEEKDAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</Select></Field>}
        {cad.frequency !== "hourly" && <Field label="At"><Input type="time" value={cad.at} onChange={(e) => setCad({ ...cad, at: e.target.value })} /></Field>}
        <Field label="Time zone" hint="Daily and weekly starts keep their wall clock time when clocks change.">
          <Select value={cad.timezone} onChange={(e) => setCad({ ...cad, timezone: e.target.value })}>{(tz.includes(cad.timezone) ? tz : [cad.timezone, ...tz]).map((z) => <option key={z} value={z}>{z}</option>)}</Select>
        </Field>
      </div>

      <Toggle checked={on} onChange={setOn} label="Active" description="Turn off to keep the schedule without running it." />

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={busy || !changed}>{schedule ? "Save schedule" : "Create schedule"}</Button>
        {schedule && <Button variant="secondary" onClick={remove} disabled={busy}>Remove</Button>}
      </div>

      {schedule && (
        <dl className="rounded-md border border-border bg-surface-subtle px-3.5 py-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-[13px]">
          <dt className="text-text-secondary">Pattern</dt><dd>{describeCadence(schedule.cadence)}, {schedule.cadence.timezone}</dd>
          <dt className="text-text-secondary">Next start</dt><dd>{schedule.enabled && schedule.nextRunAt ? startLabel(schedule.nextRunAt, schedule.cadence.timezone) : "Not scheduled"}</dd>
          <dt className="text-text-secondary">Last start</dt>
          <dd>{schedule.lastRunAt ? <>{ago(schedule.lastRunAt)}, {schedule.lastOutcome === "started" ? <>started <Link className="underline underline-offset-2" href={`/refinery/runs/${schedule.lastRunId}`}>{schedule.lastRunId}</Link></> : schedule.lastMessage}</> : "Not started yet"}</dd>
          <dt className="text-text-secondary">Set by</dt><dd>{schedule.updatedBy}, {ago(schedule.updatedAt)}</dd>
        </dl>
      )}
    </section>
  );
}

function useScheduleFor(recipeId: string): RecipeSchedule | undefined { return useRefinery().schedules.find((x) => x.recipeId === recipeId); }
