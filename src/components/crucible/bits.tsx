"use client";

import clsx from "clsx";
import { Boxes, Cloud, Cpu, Database, GitBranch, HardDrive, LineChart, Package, Server, Workflow, type LucideIcon } from "lucide-react";
import { siApacheairflow, siArgo, siAmazons3, siBentoml, siBitbucket, siDatabricks, siDvc, siGithub, siGitlab, siGooglecloud, siGooglecloudstorage, siHuggingface, siKubernetes, siMinio, siMlflow, siNvidia, siOllama, siPrefect, siRay, siWeightsandbiases } from "simple-icons";
import { SimpleIcon } from "@/components/icons/SimpleIcon";
import { Badge } from "@/components/ui/Badge";
import type { Adapter, AdapterGroup, Decision, JobState, RunStatus, StepState } from "@/lib/crucible/types";

/** Real brand icons where simple-icons has one. Anything else gets a neutral glyph for its group, never a lookalike logo. */
const BRAND: Record<string, { title: string; path: string; hex: string }> = {
  mlflow: siMlflow, weightsandbiases: siWeightsandbiases, apacheairflow: siApacheairflow, argo: siArgo, prefect: siPrefect, googlecloud: siGooglecloud, databricks: siDatabricks, kubernetes: siKubernetes,
  ray: siRay, dvc: siDvc, huggingface: siHuggingface, ollama: siOllama, github: siGithub, gitlab: siGitlab, bitbucket: siBitbucket, amazons3: siAmazons3, googlecloudstorage: siGooglecloudstorage,
  minio: siMinio, nvidia: siNvidia, bentoml: siBentoml,
};
const GLYPH: Record<AdapterGroup, LucideIcon> = { Tracking: LineChart, Orchestration: Workflow, "Cloud ML": Cloud, Compute: Cpu, Data: Database, Features: Boxes, Models: Package, Code: GitBranch, Artifacts: HardDrive, Serving: Server, Notebooks: Package };

export function AdapterMark({ a, size = 36 }: { a: Pick<Adapter, "brand" | "group">; size?: number }) {
  const icon = a.brand ? BRAND[a.brand] : undefined; const G = GLYPH[a.group];
  return (
    <span className="grid place-items-center rounded-md bg-surface-muted shrink-0" style={{ width: size, height: size }}>
      {icon ? <SimpleIcon icon={icon} size={size / 2} monochrome={false} /> : <G size={size / 2.2} className="text-text-secondary" />}
    </span>
  );
}

export const RUN_TONE: Record<RunStatus, "healthy" | "degraded" | "down" | "info" | "neutral"> = { queued: "neutral", running: "info", finished: "healthy", failed: "down", killed: "degraded" };
export const RUN_LABEL: Record<RunStatus, string> = { queued: "Queued", running: "Running", finished: "Finished", failed: "Failed", killed: "Stopped" };
export const RunBadge = ({ s }: { s: RunStatus }) => <Badge tone={RUN_TONE[s]}>{RUN_LABEL[s]}</Badge>;

const JOB_TONE: Record<JobState, "healthy" | "degraded" | "down" | "info" | "neutral"> = { queued: "neutral", admitting: "info", running: "info", succeeded: "healthy", failed: "down", cancelled: "neutral", preempted: "degraded" };
const JOB_LABEL: Record<JobState, string> = { queued: "Queued", admitting: "Checking fit", running: "Running", succeeded: "Succeeded", failed: "Failed", cancelled: "Cancelled", preempted: "Preempted" };
export const JobBadge = ({ s }: { s: JobState }) => <Badge tone={JOB_TONE[s]}>{JOB_LABEL[s]}</Badge>;

export const DECISION_LABEL: Record<Decision, string> = { running: "Running", "awaiting-approval": "Waiting for approval", "in-rollout": "Rolling out", promoted: "Promoted", "kept-champion": "Kept the champion", "failed-early": "Stopped early", rejected: "Rejected" };
const DECISION_TONE: Record<Decision, "healthy" | "degraded" | "down" | "info" | "neutral"> = { running: "info", "awaiting-approval": "degraded", "in-rollout": "info", promoted: "healthy", "kept-champion": "neutral", "failed-early": "down", rejected: "down" };
export const DecisionBadge = ({ d }: { d: Decision }) => <Badge tone={DECISION_TONE[d]}>{DECISION_LABEL[d]}</Badge>;

/** One row of the cycle timeline. A mark and a word, never colour alone. */
export function StepMark({ s }: { s: StepState }) {
  const base = "h-5 w-5 rounded-full grid place-items-center text-[10px] font-semibold shrink-0 border";
  if (s === "passed") return <span className={clsx(base, "bg-status-healthy/10 border-status-healthy text-status-healthy")} aria-label="Passed">✓</span>;
  if (s === "failed") return <span className={clsx(base, "bg-status-down/10 border-status-down text-status-down")} aria-label="Failed">✕</span>;
  if (s === "waiting") return <span className={clsx(base, "bg-status-degraded/10 border-status-degraded text-status-degraded")} aria-label="Waiting">!</span>;
  if (s === "running") return <span className={clsx(base, "bg-status-info/10 border-status-info text-status-info")} aria-label="Running">…</span>;
  return <span className={clsx(base, "border-border-strong text-text-tertiary")} aria-label={s === "skipped" ? "Skipped" : "Not reached"}>{s === "skipped" ? "–" : ""}</span>;
}

export const gb = (n: number, d = 1) => `${n.toFixed(d)} GB`;
export const hours = (n: number) => (n < 1 ? `${Math.round(n * 60)} min` : `${n.toFixed(1)} h`);
export const mval = (key: string, v: number) => (["mape"].includes(key) ? `${(v * 100).toFixed(1)}%` : Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(3));
export const person = (s: string) => (s.includes("@") ? s.split("@")[0].replace(".", " ").replace(/\b\w/g, (c) => c.toUpperCase()) : s === "continuous-training" ? "Continuous training" : s);

export const PRIMARY: Record<string, string> = { "exp-support": "f1_macro", "exp-fraud": "auc", "exp-forecast": "mape", "exp-llm": "eval_loss" };
export const primaryOf = (experimentId: string, metrics: Record<string, number>) => PRIMARY[experimentId] ?? Object.keys(metrics)[0];
