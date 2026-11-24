import type { WfStep } from "./types";

export const FN_NAME_RE = /^[a-z][a-z0-9-]{2,47}$/;

/** Checks a workflow graph. The backend applies the same rules before it accepts a revision. */
export function validateWorkflow(steps: WfStep[]): string[] {
  const p: string[] = [];
  if (steps.length === 0) return ["A workflow needs at least a trigger and an output."];
  if (steps.filter((s) => s.kind === "trigger").length !== 1 || steps[0].kind !== "trigger") p.push("A workflow has exactly one trigger, and it must be the first step.");
  if (!steps.some((s) => s.kind === "output")) p.push("Add an output step so the workflow can finish.");
  const ids = new Set(steps.map((s) => s.id));
  if (ids.size !== steps.length) p.push("Step ids must be unique.");
  for (const s of steps) {
    const targets = [s.next, ...(s.branches ?? []).map((b) => b.next)].filter((x): x is string => !!x);
    for (const t of targets) if (!ids.has(t)) p.push(`${s.name} points at a step that does not exist.`);
    if (s.kind === "output" && s.next) p.push(`${s.name} is an output and cannot have a next step.`);
    if (s.kind !== "output" && !s.next && !(s.branches && s.branches.length)) p.push(`${s.name} has no next step.`);
    if (s.kind === "condition" && (s.branches?.length ?? 0) < 2) p.push(`${s.name} needs two branches.`);
    if (s.kind === "function" && !s.config.function) p.push(`${s.name} needs a function.`);
    if (s.kind === "ai" && (!s.config.model || !s.config.maxOutputTokens)) p.push(`${s.name} needs a model and an output token limit.`);
    if (s.kind === "approval" && !s.config.approverRole) p.push(`${s.name} needs an approver role.`);
    if (s.kind === "connector" && s.config.write && !steps.some((o) => o.kind === "approval" || o.kind === "policy")) p.push(`${s.name} writes to another system, so add a policy or approval step.`);
  }
  // every step must be reachable from the trigger
  const seen = new Set<string>(); const stack = [steps[0]?.id].filter(Boolean) as string[];
  while (stack.length) { const id = stack.pop()!; if (seen.has(id)) continue; seen.add(id); const s = steps.find((x) => x.id === id); if (!s) continue; [s.next, ...(s.branches ?? []).map((b) => b.next)].forEach((n) => n && stack.push(n)); }
  for (const s of steps) if (!seen.has(s.id)) p.push(`${s.name} cannot be reached from the trigger.`);
  return [...new Set(p)];
}

