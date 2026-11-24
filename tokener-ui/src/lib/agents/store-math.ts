import type { Agent } from "./types";

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export function totals(a: Agent, days = 30) {
  const d = a.daily.slice(-days);
  const executions = sum(d.map((x) => x.executions)); const failures = sum(d.map((x) => x.failures));
  return { executions, failures, failureRate: executions ? failures / executions : 0, costUsd: sum(d.map((x) => x.costUsd)), tokens: sum(d.map((x) => x.tokens)) };
}
export const sensitiveTools = (a: Agent) => a.tools.filter((t) => t.sensitive);
export const budgetShare = (a: Agent) => (a.budget.monthlyUsd ? a.budget.spentUsd / a.budget.monthlyUsd : 0);

