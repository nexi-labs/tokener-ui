"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { autoscale, type Load } from "./execution";
import { compile, emptyFrame, frameAt, merge, type Compiled, type Frame } from "./replay";
import type { Agent, Trace } from "./types";

export type ScaleEvent = { at: number; agentId: string; from: number; to: number; reason: string };
export type Live = { frame: Frame; replicas: Record<string, number>; scaling: Record<string, number>; events: ScaleEvent[]; playing: number };

/** How many real runs one replayed run stands for, so a single trace is enough to move the autoscaler. */
const WEIGHT = 5;
const TICK_MS = 180;

/** The load an agent is under, in every unit an autoscaler can use. `runs` is runs in flight. A baseline from the day's traffic keeps busy agents above zero. */
export function loadFor(a: Agent, flight: number, now: number): Load {
  const today = a.daily[a.daily.length - 1]?.executions ?? 0;
  const baseline = Math.min(4, (today / 86_400) * ((a.p95Ms || 3000) / 1000) * 3 + 0.2 * Math.sin(now / 9000) + 0.2);
  const runs = Math.max(0, baseline + flight * WEIGHT);
  const avg = Math.max(0.5, (a.p95Ms || 3000) / 2000);
  return { runs, rps: runs / avg, queue: runs * 3, lagSec: runs * 4, cpuPct: Math.min(98, 12 + runs * 7) };
}

/**
 * Replays recent runs on the Constellation so it moves the way the platform does. Each replay is a real trace from the agents store, played at a pace a person can follow.
 * The autoscaler runs on the resulting load, so replica counts rise and fall with the same function the Runtime settings preview.
 * `only` plays one trace and repeats it; otherwise traces are picked at random, favouring those that cross agents.
 */
export function useLive(opts: { enabled: boolean; agents: Agent[]; traces: Trace[]; only?: string | null }): Live {
  const { enabled, agents, traces, only } = opts;
  const [live, setLive] = useState<Live>({ frame: emptyFrame(), replicas: {}, scaling: {}, events: [], playing: 0 });
  const runs = useRef<{ c: Compiled; at: number }[]>([]);
  const state = useRef<{ replicas: Record<string, number>; last: Record<string, { at: number; direction: "up" | "down" }>; scaling: Record<string, number>; events: ScaleEvent[]; nextRun: number }>({ replicas: {}, last: {}, scaling: {}, events: [], nextRun: 0 });
  const pool = useMemo(() => traces.filter((t) => t.kind === "run" && t.spans.length > 3).map((t) => ({ t, w: 1 + (t.agentIds.length - 1) * 2 + (t.spans.some((s) => s.attrs?.["connector.key"]) ? 2 : 0) })), [traces]);
  const compiled = useRef(new Map<string, Compiled>());
  const get = (t: Trace) => { let c = compiled.current.get(t.id); if (!c) { c = compile(t); compiled.current.set(t.id, c); } return c; };

  // The starting replica counts follow the agents' minimums.
  useEffect(() => {
    for (const a of agents) if (a.execution && state.current.replicas[a.id] === undefined) state.current.replicas[a.id] = a.execution.scaling.autoscale.mode === "manual" ? a.execution.scaling.autoscale.desired : a.execution.scaling.minReplicas;
  }, [agents]);

  useEffect(() => {
    if (!enabled) { runs.current = []; setLive((l) => ({ ...l, frame: emptyFrame(), playing: 0 })); return; }
    const pick = () => {
      if (only) { const t = traces.find((x) => x.id === only); return t ? get(t) : null; }
      if (!pool.length) return null; let r = Math.random() * pool.reduce((s, p) => s + p.w, 0);
      for (const p of pool) { r -= p.w; if (r <= 0) return get(p.t); } return get(pool[0].t);
    };
    const tick = () => {
      const now = Date.now(); const st = state.current;
      runs.current = runs.current.filter((r) => now - r.at < r.c.totalMs + 1200);
      const wanted = only ? 1 : 3;
      if (runs.current.length < wanted && now >= st.nextRun) { const c = pick(); if (c) { runs.current.push({ c, at: now }); st.nextRun = now + (only ? 400 : 1400 + Math.random() * 2200); } }
      const frame = merge(runs.current.map((r) => frameAt(r.c, now - r.at, agents)));
      // Autoscaling: once a second, per agent that tok∑ner runs.
      for (const a of agents) {
        const e = a.execution; if (!e || e.runtime === "external" || a.state !== "active") continue;
        const cur = st.replicas[a.id] ?? e.scaling.minReplicas; const flight = frame.load[a.id] ?? 0;
        const d = autoscale(e, loadFor(a, flight, now), cur, now, st.last[a.id]);
        if (d.desired !== cur) { st.replicas[a.id] = d.desired; st.last[a.id] = { at: now, direction: d.desired > cur ? "up" : "down" }; st.scaling[a.id] = now + 2600; st.events = [{ at: now, agentId: a.id, from: cur, to: d.desired, reason: d.reason }, ...st.events].slice(0, 60); }
      }
      setLive({ frame, replicas: { ...st.replicas }, scaling: Object.fromEntries(Object.entries(st.scaling).filter(([, until]) => until > now)), events: st.events, playing: runs.current.length });
    };
    tick(); const id = setInterval(tick, TICK_MS); return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, agents, pool, only]);

  return live;
}
