import { BY_KIND } from "./catalog";
import type { GEdge, Graph, NodeStatus } from "./types";

export type Scenario = "success" | "policy" | "budget" | "quota" | "failover";

export const SCENARIOS: { id: Scenario; label: string; blurb: string }[] = [
  { id: "success", label: "Successful request", blurb: "Passes every gate and reaches a provider" },
  { id: "policy", label: "Denied by policy", blurb: "Fails at the Policy gate (403)" },
  { id: "budget", label: "Over budget", blurb: "Fails at the Budget gate (402)" },
  { id: "quota", label: "Rate limited", blurb: "Fails at the Quota gate (429)" },
  { id: "failover", label: "Provider failure", blurb: "Primary route errors, failover takes over" },
];

export type SimResult = { steps: { id: string; status: NodeStatus }[]; outcome: string; tone: "ok" | "warn" | "error" };

export function simulate(g: Graph, sc: Scenario): SimResult {
  const start = g.nodes.find((n) => n.kind === "client_app") ?? g.nodes.find((n) => n.kind === "service_account");
  if (!start) return { steps: [], outcome: "Add a source node to simulate a request.", tone: "warn" };
  const out = (id: string, types?: GEdge["type"][]) => g.edges.filter((e) => e.from === id && (!types || types.includes(e.type)));
  const label = (id: string) => BY_KIND[g.nodes.find((n) => n.id === id)!.kind].label;
  const failKind = ({ policy: "policy_gate", budget: "budget_gate", quota: "quota_gate" } as Record<string, string>)[sc];

  const steps: SimResult["steps"] = [];
  const seen = new Set<string>();
  let cur: string | undefined = start.id;
  let prev: string | undefined;
  let failedOver = false;
  let outcome = "";
  let tone: SimResult["tone"] = "ok";
  let last = start.id;

  while (cur && !seen.has(cur)) {
    const node = g.nodes.find((n) => n.id === cur)!;
    seen.add(cur);
    last = cur;

    if (node.kind === failKind) {
      steps.push({ id: cur, status: "error" });
      const rej = out(cur, ["deny"])[0];
      if (rej) {
        steps.push({ id: rej.to, status: "ok" });
        const r = g.nodes.find((n) => n.id === rej.to)!;
        outcome = `${r.params.status ?? 403} ${r.params.code ?? "rejected"} at ${label(cur)}`;
        last = rej.to;
      } else outcome = `Rejected at ${label(cur)} with the default RFC 7807 error`;
      tone = "error";
      break;
    }

    if (node.kind.startsWith("provider_") && sc === "failover" && !failedOver) {
      failedOver = true;
      steps.push({ id: cur, status: "error" });
      const next: GEdge | undefined = out(cur, ["failover"])[0] ?? (prev ? out(prev, ["failover"])[0] : undefined);
      if (!next) {
        outcome = `502 All routes failed after ${label(cur)} errored`;
        tone = "error";
        break;
      }
      tone = "warn";
      prev = cur;
      cur = next.to;
      continue;
    }

    steps.push({ id: cur, status: node.kind === "reject" ? "error" : "ok" });
    if (node.kind.startsWith("provider_")) outcome = `200 OK via ${label(cur)}${failedOver ? " (after failover)" : ""}`;
    const next: GEdge | undefined = out(cur, ["flow", "allow", "limit"])[0] ?? (node.kind === "failover" ? out(cur, ["failover"])[0] : undefined);
    prev = cur;
    cur = next?.to;
  }

  // Async side effects hang off the last node and its observers.
  const queue = [last];
  const done = new Set(steps.map((s) => s.id));
  while (queue.length) {
    const id = queue.shift()!;
    out(id, ["async"]).forEach((e) => {
      if (!done.has(e.to)) {
        done.add(e.to);
        steps.push({ id: e.to, status: "ok" });
        queue.push(e.to);
      }
    });
  }
  if (!outcome) outcome = tone === "ok" ? "Completed" : "Stopped";
  return { steps, outcome, tone };
}
