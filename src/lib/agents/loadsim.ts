/**
 * The signals automatic switching reads, for the sample workspace. A real control plane reads them from the gateway and the queues; here a sample clock
 * (one tick is one minute of sample time, and one second really) produces them from each agent's sample traffic, and a person can press a scenario on the Runtime
 * tab to see a rule fire. Nothing here is a measurement.
 */
import { useSyncExternalStore } from "react";
import type { Decision, Sample } from "./autoswitch";
import type { Agent } from "./types";

export const TICK_MS = 60_000; export const REAL_TICK_MS = 1000; const KEEP = 180; const BACKFILL = 90;
export type ScenarioId = "normal" | "quiet" | "busy" | "spike" | "backlog" | "lag";
export type Scenario = { id: ScenarioId; label: string; blurb: string };
export const SCENARIOS: Scenario[] = [
  { id: "normal", label: "Normal", blurb: "Follow the agent's own sample traffic." },
  { id: "quiet", label: "Quiet", blurb: "Almost no runs, nothing waiting." },
  { id: "busy", label: "Busy", blurb: "60 runs a minute, steady." },
  { id: "spike", label: "Spike", blurb: "180 runs a minute and a growing queue." },
  { id: "backlog", label: "Event backlog", blurb: "900 events waiting to be picked up." },
  { id: "lag", label: "Stream lag", blurb: "Five minutes behind on a stream." },
];

let simNow = Date.UTC(2026, 10, 26, 9, 0, 0);
export const getSimNow = () => simNow;
const history = new Map<string, Sample[]>(); const picked = new Map<string, ScenarioId>(); const decisions = new Map<string, Decision>();
const listeners = new Set<() => void>(); let version = 0; const emit = () => { version++; listeners.forEach((l) => l()); };

const wobble = (t: number, k: number) => Math.sin(t / 240_000 + k) * 0.5 + Math.sin(t / 97_000 + k * 2) * 0.5;
/** Traffic the agent would get on an ordinary day: today's runs spread over a working day, with a morning and an afternoon peak. */
export function baseline(a: Agent, t: number): Sample {
  const today = a.daily[a.daily.length - 1]?.executions ?? 0; const h = new Date(t).getUTCHours() + new Date(t).getUTCMinutes() / 60;
  const shape = 0.35 + Math.exp(-((h - 10.5) ** 2) / 6) + 0.7 * Math.exp(-((h - 15) ** 2) / 4);
  const rpm = Math.max(0, (today / 480) * 6 * shape * (1 + 0.15 * wobble(t, a.id.length)));
  return { t, rpm, queue: Math.max(0, rpm * 0.6 + wobble(t, 1)), lagSec: Math.max(0, 2 + rpm * 0.2 + wobble(t, 2)), cpuPct: Math.min(95, 8 + rpm * 2.2) };
}
function scenarioSample(id: ScenarioId, a: Agent, t: number): Sample {
  const w = wobble(t, a.id.length);
  switch (id) {
    case "quiet": return { t, rpm: Math.max(0, 1 + 0.4 * w), queue: 0, lagSec: 1, cpuPct: 4 };
    case "busy": return { t, rpm: 60 + 6 * w, queue: 40 + 8 * w, lagSec: 20 + 3 * w, cpuPct: 68 + 4 * w };
    case "spike": return { t, rpm: 180 + 14 * w, queue: 400 + 30 * w, lagSec: 90 + 9 * w, cpuPct: 92 };
    case "backlog": return { t, rpm: 12 + 2 * w, queue: 900 + 40 * w, lagSec: 60 + 5 * w, cpuPct: 40 };
    case "lag": return { t, rpm: 20 + 2 * w, queue: 30 + 4 * w, lagSec: 300 + 20 * w, cpuPct: 55 };
    default: return baseline(a, t);
  }
}
const sampleFor = (a: Agent, t: number) => scenarioSample(picked.get(a.id) ?? "normal", a, t);

function ensure(a: Agent): Sample[] {
  let h = history.get(a.id);
  if (!h) { h = []; for (let i = BACKFILL - 1; i >= 0; i--) h.push(baseline(a, simNow - i * TICK_MS)); history.set(a.id, h); }
  return h;
}

export const loadSim = {
  /** Moves the sample clock on by one minute and records a sample for each agent. */
  tick(agents: Agent[]) {
    simNow += TICK_MS;
    for (const a of agents) { if (!a.execution || a.execution.runtime === "external") continue; const h = ensure(a); h.push(sampleFor(a, simNow)); if (h.length > KEEP) h.splice(0, h.length - KEEP); }
    emit();
  },
  samples: (a: Agent): Sample[] => ensure(a),
  latest: (a: Agent): Sample => { const h = ensure(a); return h[h.length - 1]; },
  scenario: (id: string): ScenarioId => picked.get(id) ?? "normal",
  pick(a: Agent, s: ScenarioId) { if (s === "normal") picked.delete(a.id); else picked.set(a.id, s); emit(); },
  decision: (id: string): Decision | undefined => decisions.get(id),
  decide(id: string, d: Decision) { decisions.set(id, d); },
  reset() { history.clear(); picked.clear(); decisions.clear(); simNow = Date.UTC(2026, 10, 26, 9, 0, 0); emit(); },
};

/** Re-renders a component each sample tick. */
export function useLoadSim(): number { return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => version, () => 0); }
