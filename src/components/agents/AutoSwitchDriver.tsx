"use client";

import { useEffect } from "react";
import { agents as actions, agentsNow } from "@/lib/agents/store";
import { evaluate } from "@/lib/agents/autoswitch";
import { RUNTIME_BY_ID } from "@/lib/agents/execution";
import { REAL_TICK_MS, getSimNow, loadSim } from "@/lib/agents/loadsim";
import { toast } from "@/lib/mlops/toast";

/**
 * Runs automatic runtime switching for the sample workspace: once a second (a minute of sample time) it records each agent's signals, asks `evaluate` what to do
 * for every agent whose developer turned the policy on, and applies a switch when a rule says so. A real control plane does this next to the gateway, all the time;
 * here it runs while an Agent OS page is open.
 */
export function AutoSwitchDriver() {
  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return;
      loadSim.tick(agentsNow().agents);
      for (const a of agentsNow().agents) {
        if (!a.execution?.autoSwitch?.enabled) continue;
        const d = evaluate(a, loadSim.samples(a), getSimNow(), a.switching ?? { log: [] });
        loadSim.decide(a.id, d);
        if (d.kind !== "switch") continue;
        const r = actions.switchRuntime(a.id, d.to, d.strategy, d.plan.inFlight, { rule: d.rule.name, reason: d.reason });
        if (r.ok) toast(`${a.title} moved to ${RUNTIME_BY_ID[d.to].label.toLowerCase()}: ${d.rule.name}`, "info");
        else loadSim.decide(a.id, { kind: "blocked", reason: r.error, rule: d.rule });
      }
    }, REAL_TICK_MS);
    return () => clearInterval(id);
  }, []);
  return null;
}
