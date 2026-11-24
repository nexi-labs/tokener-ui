/** Crucible types for the sample store (docs/51, section 4). Nothing here is read from a backend yet. */

export type RunStatus = "queued" | "running" | "finished" | "failed" | "killed";
export type Dataset = { name: string; version: number; rows: number; quality: number; refineryRun: string };
export type Artifact = { path: string; kind: "model" | "checkpoint" | "report" | "plot" | "data"; sizeMb: number; sha256: string };

export type Experiment = { id: string; name: string; description: string; task: string; owner: string; project: string; department: string; tags: string[]; createdAt: string; model?: string };

export type Run = {
  id: string; experimentId: string; name: string; status: RunStatus; startedAt: string; endedAt?: string; owner: string;
  params: Record<string, string | number | boolean>; tags: Record<string, string>;
  /** Final value of each metric. */
  metrics: Record<string, number>;
  /** Down sampled series, one value for each step in `steps`. */
  series: Record<string, number[]>; steps: number[];
  dataset: Dataset;
  code: { repo: string; branch: string; commit: string };
  image: { ref: string; digest: string };
  seed: number;
  jobId?: string; parentRunId?: string;
  gpus: { count: number; card: string; memGb: number };
  plannedMemGb?: number; peakMemGb?: number;
  gpuHours: number; costUsd: number;
  artifacts: Artifact[];
  modelVersion?: { model: string; version: number };
  note?: string; failure?: string;
};

export type JobState = "queued" | "admitting" | "running" | "succeeded" | "failed" | "cancelled" | "preempted";
export type Queue = "interactive" | "default" | "batch";
export type Attempt = { n: number; node: string; startedAt: string; endedAt?: string; exit?: string };
export type Job = {
  id: string; name: string; experimentId: string; runId?: string; queue: Queue; priority: number; state: JobState;
  gpus: number; card: string; memRequestGb: number; peakGb?: number; owner: string; project: string;
  submittedAt: string; attempts: Attempt[]; costEstimateUsd: number; waitReason?: string; image: string; command: string;
};

export type TriggerKind = "dataset-version" | "rows" | "stream-window" | "schedule" | "drift" | "manual";
export type Trigger = { kind: TriggerKind; detail: string; minRows?: number };
export type Window = { kind: "rolling" | "expanding" | "latest-n"; value: number };
export type Gates = { metric: string; floor: number; noSliceRegression: boolean; maxFairnessGap: number; maxMemoryGb: number; maxP95Ms: number };
export type Approval = "person" | "two-people" | "automatic";
export type Tier = "low" | "standard" | "high";
export type CtPolicy = {
  id: string; name: string; model: string; experimentId: string; state: "active" | "paused" | "draft";
  source: string; triggers: Trigger[]; window: Window; gates: Gates; approval: Approval; tier: Tier;
  budget: { monthlyUsd: number; spentUsd: number }; maxCyclesPerDay: number;
  champion: { version: number; metric: number }; owner: string; createdAt: string;
};

export type StepId = "trigger" | "pin" | "quality" | "admission" | "train" | "evaluate" | "gates" | "approval" | "shadow" | "canary" | "promote";
export type StepState = "passed" | "failed" | "waiting" | "running" | "skipped" | "pending";
export type CycleStep = { id: StepId; state: StepState; detail: string };
export type Decision = "running" | "awaiting-approval" | "in-rollout" | "promoted" | "kept-champion" | "failed-early" | "rejected";
export type TriggerEvent = { id: string; kind: TriggerKind; detail: string; datasetVersion: number; rows: number; quality: number; schemaOk: boolean; piiFree: boolean; by?: string };
export type GateResult = { id: string; label: string; passed: boolean; detail: string };
export type Candidate = { metric: number; sliceDeltas: { slice: string; delta: number }[]; fairnessGap: number; peakMemGb: number; p95Ms: number; version?: number; runId?: string };
export type Cycle = {
  id: string; policyId: string; event: TriggerEvent; startedAt: string; steps: CycleStep[]; decision: Decision;
  candidate?: Candidate; gates: GateResult[]; approvals: { by: string; at: string }[]; reason?: string; costUsd: number;
};

export type AdapterStatus = "Planned" | "In development" | "Beta" | "Available";
export type AdapterGroup = "Tracking" | "Orchestration" | "Cloud ML" | "Compute" | "Data" | "Features" | "Models" | "Code" | "Artifacts" | "Serving" | "Notebooks";
export type Adapter = { id: string; name: string; group: AdapterGroup; what: string; status: AdapterStatus; brand?: string };
