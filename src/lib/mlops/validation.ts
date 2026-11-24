import type { Issue } from "@/components/studio/types";

/**
 * What the control plane says about a pipeline spec: the rule findings, what organisation policy forbids, what would stop a run, and the two verdicts.
 * Same shape as POST /pipelines:validate. The sample workspace builds it from the console's own copies of the rules.
 */
export type ValidationReport = { issues: Issue[]; policyViolations: string[]; runBlockers: string[]; publishable: boolean; runnable: boolean };

const LEVELS = new Set(["error", "warn", "info"]);

export function toReport(x: Record<string, any>): ValidationReport {
  const issues: Issue[] = Array.isArray(x.issues) ? x.issues.map((i: any) => ({ level: LEVELS.has(i?.level) ? i.level : "info", msg: String(i?.msg ?? ""), nodeId: i?.nodeId ?? undefined })) : [];
  const strings = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  return { issues, policyViolations: strings(x.policyViolations), runBlockers: strings(x.runBlockers), publishable: x.publishable === true, runnable: x.runnable === true };
}
