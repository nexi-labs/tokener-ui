import { LOWER_IS_BETTER, better, startCycle } from "./ct";
export { LOWER_IS_BETTER, better };
import type { Adapter, Artifact, CtPolicy, Cycle, Dataset, Experiment, Job, Run, TriggerEvent } from "./types";

/** Sample data for the Crucible screens. Every figure is made up. Nothing is read from a backend. */

const H = 3600_000;
const ago = (now: number, hours: number) => new Date(now - hours * H).toISOString();
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rnd = (seed: string) => { let a = hash(seed) || 1; return () => { a ^= a << 13; a >>>= 0; a ^= a >>> 17; a ^= a << 5; a >>>= 0; return a / 4294967296; }; };
const sha = (s: string) => Array.from({ length: 8 }, (_, i) => (hash(s + i) >>> 0).toString(16).padStart(8, "0")).join("");


const STEPS = Array.from({ length: 40 }, (_, i) => (i + 1) * 50);
function curve(seed: string, final: number, lower: boolean, span: number, noise: number): number[] {
  const r = rnd(seed); const start = lower ? final + span : Math.max(0.05, final - span);
  return STEPS.map((_, i) => { const t = (i + 1) / STEPS.length; const k = 1 - Math.exp(-4.2 * t); const v = start + (final - start) * k + (r() - 0.5) * noise * (1.2 - t); return Math.round(v * 10000) / 10000; });
}
const memCurve = (seed: string, peak: number, n = 40) => { const r = rnd(seed); return Array.from({ length: n }, (_, i) => Math.round((i < 2 ? peak * 0.35 : peak * (0.9 + r() * 0.1)) * 10) / 10); };

export const OWNERS = { priya: "priya.nair@nexi.example", marcus: "marcus.lee@nexi.example", aisha: "aisha.bello@nexi.example", tom: "tom.eze@nexi.example" };

export const DATASETS: Record<string, Dataset> = {
  "support-tickets-14": { name: "support-tickets-unified", version: 14, rows: 412_000, quality: 0.95, refineryRun: "rf-run-3318" },
  "support-tickets-15": { name: "support-tickets-unified", version: 15, rows: 438_500, quality: 0.96, refineryRun: "rf-run-3402" },
  "support-tickets-16": { name: "support-tickets-unified", version: 16, rows: 461_200, quality: 0.97, refineryRun: "rf-run-3490" },
  "support-tickets-17": { name: "support-tickets-unified", version: 17, rows: 489_900, quality: 0.97, refineryRun: "rf-run-3571" },
  "transactions-8": { name: "card-transactions-features", version: 8, rows: 18_400_000, quality: 0.98, refineryRun: "rf-run-3011" },
  "sales-weekly-5": { name: "sales-weekly-unified", version: 5, rows: 2_950_000, quality: 0.94, refineryRun: "rf-run-2977" },
  "dialogues-3": { name: "support-dialogues-curated", version: 3, rows: 96_400, quality: 0.93, refineryRun: "rf-run-3120" },
};

export function sampleExperiments(now: number): Experiment[] {
  return [
    { id: "exp-support", name: "support-classifier", description: "Routes inbound support tickets to one of 24 intents and a priority.", task: "Text classification", owner: OWNERS.priya, project: "support-ml", department: "Customer Support", tags: ["nlp", "production"], createdAt: ago(now, 24 * 120), model: "customer-support-classifier" },
    { id: "exp-fraud", name: "fraud-scorer", description: "Scores card transactions for fraud with gradient boosted trees.", task: "Tabular classification", owner: OWNERS.aisha, project: "risk", department: "Risk", tags: ["tabular", "streaming"], createdAt: ago(now, 24 * 200), model: "card-fraud-scorer" },
    { id: "exp-forecast", name: "demand-forecast", description: "Weekly demand by product family for the planning team.", task: "Time series forecasting", owner: OWNERS.tom, project: "planning", department: "Supply Chain", tags: ["forecast"], createdAt: ago(now, 24 * 90), model: "demand-forecaster" },
    { id: "exp-llm", name: "support-assistant-lora", description: "LoRA fine tuning of an 8B model on curated support dialogues.", task: "LLM fine tuning", owner: OWNERS.priya, project: "support-ml", department: "Customer Support", tags: ["llm", "lora"], createdAt: ago(now, 24 * 40) },
  ];
}

type RunSeed = {
  id: string; exp: string; name: string; status: Run["status"]; hoursAgo: number; durH: number; owner: string; params: Run["params"]; metrics: Record<string, number>; ds: string; card: string; gpus: number; memGb: number;
  peak?: number; planned?: number; tags?: Record<string, string>; note?: string; failure?: string; model?: { model: string; version: number }; parent?: string; job?: string; spanLoss?: number; repo?: string; image?: string;
};
const GPU_RATE: Record<string, number> = { "H100 80GB": 3.9, "A100 80GB": 2.4, "A10 24GB": 0.9, "L4 24GB": 0.7, CPU: 0.1 };

function makeRun(s: RunSeed, now: number): Run {
  const series: Record<string, number[]> = {}; const keys = Object.keys(s.metrics);
  const lossKey = keys.find((k) => LOWER_IS_BETTER.has(k));
  for (const k of keys) series[k] = curve(`${s.id}:${k}`, s.metrics[k], LOWER_IS_BETTER.has(k), LOWER_IS_BETTER.has(k) ? (s.spanLoss ?? 1.4) : 0.35, 0.02);
  if (!lossKey) series.train_loss = curve(`${s.id}:tl`, 0.21, true, 1.2, 0.03);
  else series.train_loss = curve(`${s.id}:tl`, Math.max(0.05, s.metrics[lossKey] * 0.85), true, 1.2, 0.03);
  series.gpu_mem_gb = memCurve(`${s.id}:mem`, s.peak ?? s.memGb * 0.5);
  const steps = s.status === "running" ? STEPS.slice(0, 26) : s.status === "failed" || s.status === "killed" ? STEPS.slice(0, 9) : STEPS;
  for (const k of Object.keys(series)) series[k] = series[k].slice(0, steps.length);
  const started = now - s.hoursAgo * H; const dur = s.status === "running" ? s.hoursAgo * 0.9 : s.status === "failed" ? Math.min(s.durH, 0.3) : s.durH;
  const files: Artifact[] = s.status === "finished" ? [
    { path: "model/model.safetensors", kind: "model", sizeMb: Math.round(120 + (hash(s.id) % 4000)), sha256: sha(s.id + "m") },
    { path: "checkpoints/step-2000", kind: "checkpoint", sizeMb: Math.round(200 + (hash(s.id) % 6000)), sha256: sha(s.id + "c") },
    { path: "reports/eval.json", kind: "report", sizeMb: 0.2, sha256: sha(s.id + "r") },
    { path: "plots/confusion.png", kind: "plot", sizeMb: 0.4, sha256: sha(s.id + "p") },
  ] : s.status === "running" ? [{ path: "checkpoints/step-1250", kind: "checkpoint", sizeMb: Math.round(200 + (hash(s.id) % 6000)), sha256: sha(s.id + "c") }] : [];
  return {
    id: s.id, experimentId: s.exp, name: s.name, status: s.status, startedAt: new Date(started).toISOString(), endedAt: s.status === "running" || s.status === "queued" ? undefined : new Date(started + dur * H).toISOString(),
    owner: s.owner, params: s.params, tags: s.tags ?? {}, metrics: s.metrics, series, steps, dataset: DATASETS[s.ds],
    code: { repo: s.repo ?? "github.com/nexi-ai/support-classifier", branch: "main", commit: sha(s.id + "git").slice(0, 7) }, image: { ref: s.image ?? "registry.nexi.example/train/pytorch:2.3-cu121", digest: "sha256:" + sha(s.id + "img").slice(0, 24) },
    seed: 1000 + (hash(s.id) % 9000), jobId: s.job, parentRunId: s.parent, gpus: { count: s.gpus, card: s.card, memGb: s.memGb }, plannedMemGb: s.planned, peakMemGb: s.peak,
    gpuHours: Math.round(dur * s.gpus * 100) / 100, costUsd: Math.round(dur * s.gpus * (GPU_RATE[s.card] ?? 1) * 100) / 100, artifacts: files, modelVersion: s.model, note: s.note, failure: s.failure,
  };
}

export function sampleRuns(now: number): Run[] {
  const sup = { repo: "github.com/nexi-ai/support-classifier" };
  const seeds: RunSeed[] = [
    { id: "run-2134", exp: "exp-support", name: "bert-base-lr3e-5", status: "finished", hoursAgo: 24 * 24, durH: 2.1, owner: OWNERS.priya, params: { model: "bert-base-multilingual", lr: 3e-5, batch_size: 32, epochs: 4, warmup: 0.06, max_len: 256, optimizer: "adamw" }, metrics: { f1_macro: 0.921, accuracy: 0.933, val_loss: 0.268 }, ds: "support-tickets-14", card: "A100 80GB", gpus: 1, memGb: 80, peak: 31, planned: 28, model: { model: "customer-support-classifier", version: 3 }, ...sup },
    { id: "run-2188", exp: "exp-support", name: "bert-base-lr5e-5", status: "finished", hoursAgo: 24 * 18, durH: 2.0, owner: OWNERS.priya, params: { model: "bert-base-multilingual", lr: 5e-5, batch_size: 32, epochs: 4, warmup: 0.06, max_len: 256, optimizer: "adamw" }, metrics: { f1_macro: 0.914, accuracy: 0.927, val_loss: 0.284 }, ds: "support-tickets-14", card: "A100 80GB", gpus: 1, memGb: 80, peak: 31, planned: 28, ...sup },
    { id: "run-2230", exp: "exp-support", name: "xlmr-base-lr2e-5", status: "finished", hoursAgo: 24 * 9, durH: 3.4, owner: OWNERS.marcus, params: { model: "xlm-roberta-base", lr: 2e-5, batch_size: 32, epochs: 4, warmup: 0.1, max_len: 256, optimizer: "adamw" }, metrics: { f1_macro: 0.934, accuracy: 0.944, val_loss: 0.241 }, ds: "support-tickets-15", card: "A100 80GB", gpus: 1, memGb: 80, peak: 44, planned: 41, model: { model: "customer-support-classifier", version: 4 }, ...sup },
    { id: "run-2291", exp: "exp-support", name: "xlmr-base-ct-cycle-21", status: "finished", hoursAgo: 26, durH: 3.6, owner: "continuous-training", params: { model: "xlm-roberta-base", lr: 2e-5, batch_size: 32, epochs: 4, warmup: 0.1, max_len: 256, optimizer: "adamw" }, metrics: { f1_macro: 0.941, accuracy: 0.953, val_loss: 0.229 }, ds: "support-tickets-17", card: "A100 80GB", gpus: 1, memGb: 80, peak: 45, planned: 41, tags: { trigger: "dataset-version", policy: "support-classifier-weekly" }, model: { model: "customer-support-classifier", version: 5 }, note: "Started by a continuous training cycle.", parent: "run-2230", ...sup },
    { id: "run-2310", exp: "exp-support", name: "xlmr-large-lr1e-5", status: "failed", hoursAgo: 5, durH: 0.3, owner: OWNERS.priya, params: { model: "xlm-roberta-large", lr: 1e-5, batch_size: 32, epochs: 4, warmup: 0.1, max_len: 512, optimizer: "adamw" }, metrics: { val_loss: 0.9 }, ds: "support-tickets-17", card: "A10 24GB", gpus: 1, memGb: 24, peak: 23.6, planned: 19, failure: "CUDA out of memory at step 420 while allocating 1.9 GiB. The planner estimated 19 GB, and the measured peak before the failure was 23.6 GB.", ...sup },
    { id: "run-2322", exp: "exp-support", name: "xlmr-base-lr2e-5-seed2", status: "running", hoursAgo: 1.6, durH: 3.6, owner: OWNERS.marcus, params: { model: "xlm-roberta-base", lr: 2e-5, batch_size: 32, epochs: 4, warmup: 0.1, max_len: 256, optimizer: "adamw", seed: 2 }, metrics: { f1_macro: 0.936, accuracy: 0.947, val_loss: 0.238 }, ds: "support-tickets-17", card: "A100 80GB", gpus: 1, memGb: 80, peak: 44, planned: 41, job: "job-5521", ...sup },

    { id: "run-3101", exp: "exp-fraud", name: "xgb-depth8", status: "finished", hoursAgo: 24 * 12, durH: 1.1, owner: OWNERS.aisha, params: { algo: "xgboost", max_depth: 8, eta: 0.08, subsample: 0.8, n_estimators: 600, scale_pos_weight: 40 }, metrics: { auc: 0.978, pr_auc: 0.612, val_loss: 0.071 }, ds: "transactions-8", card: "CPU", gpus: 0, memGb: 0, peak: 0, spanLoss: 0.5, repo: "github.com/nexi-ai/fraud-scorer", image: "registry.nexi.example/train/xgboost:2.0", model: { model: "card-fraud-scorer", version: 7 } },
    { id: "run-3140", exp: "exp-fraud", name: "xgb-depth10", status: "finished", hoursAgo: 24 * 7, durH: 1.5, owner: OWNERS.aisha, params: { algo: "xgboost", max_depth: 10, eta: 0.05, subsample: 0.8, n_estimators: 900, scale_pos_weight: 40 }, metrics: { auc: 0.981, pr_auc: 0.634, val_loss: 0.066 }, ds: "transactions-8", card: "CPU", gpus: 0, memGb: 0, peak: 0, spanLoss: 0.5, repo: "github.com/nexi-ai/fraud-scorer", image: "registry.nexi.example/train/xgboost:2.0", model: { model: "card-fraud-scorer", version: 8 } },
    { id: "run-3166", exp: "exp-fraud", name: "lgbm-leaves127", status: "finished", hoursAgo: 24 * 3, durH: 0.9, owner: OWNERS.aisha, params: { algo: "lightgbm", num_leaves: 127, learning_rate: 0.06, feature_fraction: 0.7, n_estimators: 800, scale_pos_weight: 40 }, metrics: { auc: 0.979, pr_auc: 0.621, val_loss: 0.069 }, ds: "transactions-8", card: "CPU", gpus: 0, memGb: 0, peak: 0, spanLoss: 0.5, repo: "github.com/nexi-ai/fraud-scorer", image: "registry.nexi.example/train/lightgbm:4.3" },

    { id: "run-4020", exp: "exp-forecast", name: "tft-horizon12", status: "finished", hoursAgo: 24 * 14, durH: 4.8, owner: OWNERS.tom, params: { model: "temporal-fusion-transformer", horizon: 12, hidden: 128, heads: 4, lr: 1e-3, batch_size: 256 }, metrics: { mape: 0.118, rmse: 41.2 }, ds: "sales-weekly-5", card: "A10 24GB", gpus: 2, memGb: 24, peak: 14.2, planned: 13, spanLoss: 0.4, repo: "github.com/nexi-ai/demand-forecast", image: "registry.nexi.example/train/pytorch:2.3-cu121" },
    { id: "run-4044", exp: "exp-forecast", name: "tft-horizon12-h192", status: "finished", hoursAgo: 24 * 6, durH: 6.1, owner: OWNERS.tom, params: { model: "temporal-fusion-transformer", horizon: 12, hidden: 192, heads: 4, lr: 1e-3, batch_size: 256 }, metrics: { mape: 0.109, rmse: 38.7 }, ds: "sales-weekly-5", card: "A10 24GB", gpus: 2, memGb: 24, peak: 19.8, planned: 18, spanLoss: 0.4, repo: "github.com/nexi-ai/demand-forecast", image: "registry.nexi.example/train/pytorch:2.3-cu121" },
    { id: "run-4051", exp: "exp-forecast", name: "prophet-baseline", status: "finished", hoursAgo: 24 * 6, durH: 0.4, owner: OWNERS.tom, params: { model: "prophet", seasonality: "multiplicative", changepoint_prior: 0.05 }, metrics: { mape: 0.151, rmse: 52.9 }, ds: "sales-weekly-5", card: "CPU", gpus: 0, memGb: 0, peak: 0, spanLoss: 0.4, repo: "github.com/nexi-ai/demand-forecast", image: "registry.nexi.example/train/prophet:1.1" },

    { id: "run-5010", exp: "exp-llm", name: "llama3-8b-lora-r16", status: "finished", hoursAgo: 24 * 11, durH: 5.2, owner: OWNERS.priya, params: { base: "llama-3-8b-instruct", method: "lora", rank: 16, alpha: 32, lr: 2e-4, micro_batch: 4, accum: 8, seq_len: 2048, precision: "bf16" }, metrics: { eval_loss: 1.182, rougeL: 0.462 }, ds: "dialogues-3", card: "H100 80GB", gpus: 8, memGb: 80, peak: 38, planned: 36, spanLoss: 1.2, repo: "github.com/nexi-ai/support-assistant", image: "registry.nexi.example/train/axolotl:0.4-cu121" },
    { id: "run-5034", exp: "exp-llm", name: "llama3-8b-lora-r64", status: "finished", hoursAgo: 24 * 8, durH: 5.9, owner: OWNERS.priya, params: { base: "llama-3-8b-instruct", method: "lora", rank: 64, alpha: 128, lr: 1e-4, micro_batch: 4, accum: 8, seq_len: 2048, precision: "bf16" }, metrics: { eval_loss: 1.141, rougeL: 0.481 }, ds: "dialogues-3", card: "H100 80GB", gpus: 8, memGb: 80, peak: 41, planned: 38, spanLoss: 1.2, repo: "github.com/nexi-ai/support-assistant", image: "registry.nexi.example/train/axolotl:0.4-cu121" },
    { id: "run-5047", exp: "exp-llm", name: "llama3-8b-full-ft", status: "failed", hoursAgo: 24 * 5, durH: 0.4, owner: OWNERS.marcus, params: { base: "llama-3-8b-instruct", method: "full", lr: 1e-5, micro_batch: 4, accum: 8, seq_len: 2048, precision: "bf16", shard: "none" }, metrics: { eval_loss: 2.4 }, ds: "dialogues-3", card: "H100 80GB", gpus: 8, memGb: 80, peak: 79.6, planned: 118, spanLoss: 1.2, failure: "CUDA out of memory at step 30. Model state alone is about 128 GB without sharding. The planner flagged this before the job started and suggested ZeRO 3.", repo: "github.com/nexi-ai/support-assistant", image: "registry.nexi.example/train/axolotl:0.4-cu121" },
    { id: "run-5052", exp: "exp-llm", name: "llama3-8b-lora-r64-pack", status: "running", hoursAgo: 2.4, durH: 6, owner: OWNERS.priya, params: { base: "llama-3-8b-instruct", method: "lora", rank: 64, alpha: 128, lr: 1e-4, micro_batch: 8, accum: 4, seq_len: 4096, precision: "bf16", packing: true }, metrics: { eval_loss: 1.137, rougeL: 0.484 }, ds: "dialogues-3", card: "H100 80GB", gpus: 8, memGb: 80, peak: 57, planned: 53, spanLoss: 1.2, job: "job-5528", parent: "run-5034", repo: "github.com/nexi-ai/support-assistant", image: "registry.nexi.example/train/axolotl:0.4-cu121" },
  ];
  return seeds.map((s) => makeRun(s, now));
}

export function sampleJobs(now: number): Job[] {
  const att = (n: number, node: string, h: number, end?: number, exit?: string) => ({ n, node, startedAt: ago(now, h), endedAt: end === undefined ? undefined : ago(now, end), exit });
  return [
    { id: "job-5528", name: "llama3-8b-lora-r64-pack", experimentId: "exp-llm", runId: "run-5052", queue: "default", priority: 50, state: "running", gpus: 8, card: "H100 80GB", memRequestGb: 640, peakGb: 456, owner: OWNERS.priya, project: "support-ml", submittedAt: ago(now, 2.6), attempts: [att(1, "gpu-pool-h100-a/node-3", 2.4)], costEstimateUsd: 187, image: "registry.nexi.example/train/axolotl:0.4-cu121", command: "axolotl train configs/lora-r64-pack.yaml" },
    { id: "job-5521", name: "xlmr-base-lr2e-5-seed2", experimentId: "exp-support", runId: "run-2322", queue: "default", priority: 50, state: "running", gpus: 1, card: "A100 80GB", memRequestGb: 80, peakGb: 44, owner: OWNERS.marcus, project: "support-ml", submittedAt: ago(now, 1.7), attempts: [att(1, "gpu-pool-a100-b/node-1", 1.6)], costEstimateUsd: 9, image: "registry.nexi.example/train/pytorch:2.3-cu121", command: "python train.py --config configs/xlmr-base.yaml --seed 2" },
    { id: "job-5530", name: "xlmr-large-lr1e-5-retry", experimentId: "exp-support", queue: "default", priority: 50, state: "queued", gpus: 1, card: "A100 80GB", memRequestGb: 80, owner: OWNERS.priya, project: "support-ml", submittedAt: ago(now, 0.2), attempts: [], costEstimateUsd: 14, waitReason: "Waiting for 1 x A100 80GB in the default queue. The support-ml project has used its 2 GPU quota. 1 job ahead.", image: "registry.nexi.example/train/pytorch:2.3-cu121", command: "python train.py --config configs/xlmr-large.yaml --max-len 512" },
    { id: "job-5531", name: "fraud-weekly-retrain", experimentId: "exp-fraud", queue: "batch", priority: 20, state: "admitting", gpus: 0, card: "CPU", memRequestGb: 64, owner: OWNERS.aisha, project: "risk", submittedAt: ago(now, 0.1), attempts: [], costEstimateUsd: 4, waitReason: "Checking quota, budget and policy.", image: "registry.nexi.example/train/xgboost:2.0", command: "python train_xgb.py --dataset card-transactions-features@8" },
    { id: "job-5490", name: "llama3-8b-full-ft", experimentId: "exp-llm", runId: "run-5047", queue: "default", priority: 50, state: "failed", gpus: 8, card: "H100 80GB", memRequestGb: 640, peakGb: 79.6, owner: OWNERS.marcus, project: "support-ml", submittedAt: ago(now, 24 * 5 + 0.5), attempts: [att(1, "gpu-pool-h100-a/node-1", 24 * 5, 24 * 5 - 0.1, "OOMKilled")], costEstimateUsd: 12, image: "registry.nexi.example/train/axolotl:0.4-cu121", command: "axolotl train configs/full-ft.yaml" },
    { id: "job-5471", name: "tft-horizon12-h192", experimentId: "exp-forecast", runId: "run-4044", queue: "batch", priority: 20, state: "succeeded", gpus: 2, card: "A10 24GB", memRequestGb: 48, peakGb: 39.6, owner: OWNERS.tom, project: "planning", submittedAt: ago(now, 24 * 6 + 7), attempts: [att(1, "gpu-pool-a10/node-2", 24 * 6 + 6.2, 24 * 6 + 5.1, "Preempted by a higher priority job"), att(2, "gpu-pool-a10/node-4", 24 * 6 + 5, 24 * 6 - 1.1, "0")], costEstimateUsd: 22, image: "registry.nexi.example/train/pytorch:2.3-cu121", command: "python train_tft.py --hidden 192" },
    { id: "job-5470", name: "notebook-gpu-reclaim-check", experimentId: "exp-support", queue: "interactive", priority: 80, state: "cancelled", gpus: 1, card: "L4 24GB", memRequestGb: 24, owner: OWNERS.tom, project: "planning", submittedAt: ago(now, 24 * 2), attempts: [att(1, "gpu-pool-l4/node-1", 24 * 2, 24 * 2 - 0.4, "Cancelled by tom.eze@nexi.example")], costEstimateUsd: 1, image: "registry.nexi.example/train/pytorch:2.3-cu121", command: "jupyter lab" },
  ];
}

export function samplePolicies(now: number): CtPolicy[] {
  return [
    {
      id: "ctp-support", name: "support-classifier-weekly", model: "customer-support-classifier", experimentId: "exp-support", state: "active", source: "support-tickets-unified",
      triggers: [{ kind: "dataset-version", detail: "support-tickets-unified" }, { kind: "rows", detail: "20,000 new rows", minRows: 20000 }, { kind: "drift", detail: "input-drift-support-tickets" }, { kind: "manual", detail: "A person" }],
      window: { kind: "rolling", value: 90 }, gates: { metric: "f1_macro", floor: 0.93, noSliceRegression: true, maxFairnessGap: 0.03, maxMemoryGb: 24, maxP95Ms: 80 }, approval: "two-people", tier: "high",
      budget: { monthlyUsd: 400, spentUsd: 212 }, maxCyclesPerDay: 2, champion: { version: 4, metric: 0.934 }, owner: OWNERS.priya, createdAt: ago(now, 24 * 60),
    },
    {
      id: "ctp-fraud", name: "fraud-scorer-streaming", model: "card-fraud-scorer", experimentId: "exp-fraud", state: "active", source: "card-transactions-features",
      triggers: [{ kind: "stream-window", detail: "card-transactions window closes every 6 hours" }, { kind: "drift", detail: "fraud-score-decay" }],
      window: { kind: "latest-n", value: 6 }, gates: { metric: "pr_auc", floor: 0.6, noSliceRegression: true, maxFairnessGap: 0.05, maxMemoryGb: 8, maxP95Ms: 15 }, approval: "automatic", tier: "low",
      budget: { monthlyUsd: 300, spentUsd: 118 }, maxCyclesPerDay: 4, champion: { version: 8, metric: 0.634 }, owner: OWNERS.aisha, createdAt: ago(now, 24 * 100),
    },
    {
      id: "ctp-forecast", name: "demand-forecast-monthly", model: "demand-forecaster", experimentId: "exp-forecast", state: "paused", source: "sales-weekly-unified",
      triggers: [{ kind: "schedule", detail: "0 2 1 * *" }, { kind: "manual", detail: "A person" }],
      window: { kind: "expanding", value: 156 }, gates: { metric: "mape", floor: 0.12, noSliceRegression: false, maxFairnessGap: 0.1, maxMemoryGb: 16, maxP95Ms: 200 }, approval: "person", tier: "standard",
      budget: { monthlyUsd: 150, spentUsd: 0 }, maxCyclesPerDay: 1, champion: { version: 3, metric: 0.109 }, owner: OWNERS.tom, createdAt: ago(now, 24 * 70),
    },
  ];
}

/** Builds a few finished and open cycles from the real rules, so the sample shows what each outcome looks like. */
export function sampleCycles(now: number, policies: CtPolicy[]): Cycle[] {
  const by = (id: string) => policies.find((p) => p.id === id)!;
  const out: Cycle[] = [];
  const ev = (id: string, kind: TriggerEvent["kind"], detail: string, v: number, rows: number, o: Partial<TriggerEvent> = {}): TriggerEvent => ({ id, kind, detail, datasetVersion: v, rows, quality: 0.97, schemaOk: true, piiFree: true, ...o });
  const find = (p: CtPolicy, want: Cycle["decision"], hours: number, mk: (n: number) => TriggerEvent, tweak?: (p: CtPolicy) => CtPolicy): Cycle | undefined => {
    for (let n = 0; n < 200; n++) { const r = startCycle(tweak ? tweak(p) : p, mk(n), { existing: out, now: now - hours * H, actor: "system", cyclesToday: 0 }); if (r.ok && r.cycle.decision === want) return r.cycle; }
    return undefined;
  };
  const sup = by("ctp-support");
  // 1. waiting for approval: a candidate that passed the gates, found against the champion
  const open = find(sup, "awaiting-approval", 3, (n) => ev(`evt-sup-a${n}`, "dataset-version", "support-tickets-unified version 17", 17, 489_900));
  if (open) { out.push({ ...open, candidate: { ...open.candidate!, version: 5, runId: "run-2291" } }); }
  // 2. stopped at the quality gate
  const pii = startCycle(sup, ev("evt-sup-pii", "dataset-version", "support-tickets-unified version 16", 16, 461_200, { piiFree: false }), { existing: out, now: now - 24 * 6 * H, actor: "system", cyclesToday: 0 });
  if (pii.ok) out.push(pii.cycle);
  // 3. gates failed, champion kept
  const kept = find(sup, "kept-champion", 24 * 10, (n) => ev(`evt-sup-k${n}`, "rows", "21,400 new rows", 15, 21_400));
  if (kept) out.push(kept);
  // 4. a streaming policy promoted by policy, with the evidence record
  const fr = by("ctp-fraud");
  const auto = find(fr, "promoted", 14, (n) => ev(`evt-fr-p${n}`, "stream-window", "Window closed 2026-11-20 18:00", 8, 3_100_000));
  if (auto) out.push(auto);
  const auto2 = find(fr, "kept-champion", 24 * 2, (n) => ev(`evt-fr-k${n}`, "drift", "fraud-score-decay fired", 8, 2_800_000));
  if (auto2) out.push(auto2);
  return out.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

export function sampleAdapters(): Adapter[] {
  const a = (group: Adapter["group"], name: string, what: string, brand?: string): Adapter => ({ id: `${group}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name, group, what, status: "Planned", brand });
  return [
    a("Tracking", "MLflow", "Accept MLflow clients through a compatible API, and import existing experiments", "mlflow"),
    a("Tracking", "Weights and Biases", "Import history and mirror new runs", "weightsandbiases"),
    a("Tracking", "Neptune", "Import history and mirror new runs"),
    a("Tracking", "Comet", "Import history and mirror new runs", "comet"),
    a("Tracking", "ClearML", "Import history and mirror new runs", "clearml"),
    a("Orchestration", "Apache Airflow", "Start a Crucible job from a DAG and read the result", "apacheairflow"),
    a("Orchestration", "Argo Workflows", "Start a Crucible job from a workflow step", "argo"),
    a("Orchestration", "Prefect", "Start a job from a flow", "prefect"),
    a("Orchestration", "Dagster", "Start a job from an asset or op", "dagster"),
    a("Orchestration", "Kubeflow Pipelines", "Use a Crucible job as a pipeline component", "kubeflow"),
    a("Orchestration", "Metaflow", "Run a step as a Crucible job", "metaflow"),
    a("Cloud ML", "Amazon SageMaker", "Use as compute, as a registry or as a serving target"),
    a("Cloud ML", "Google Vertex AI", "Use as compute, as a registry or as a serving target", "googlecloud"),
    a("Cloud ML", "Azure Machine Learning", "Use as compute, as a registry or as a serving target"),
    a("Cloud ML", "Databricks", "Use as compute and import MLflow runs", "databricks"),
    a("Compute", "Kubernetes", "Run jobs on your own clusters through the runner", "kubernetes"),
    a("Compute", "Ray", "Run distributed jobs and sweeps on a Ray cluster", "ray"),
    a("Compute", "Slurm", "Submit jobs to a Slurm cluster", "slurm"),
    a("Compute", "Run:ai", "Use its scheduler and GPU pools"),
    a("Data", "Refinery", "Dataset versions and events that start continuous training"),
    a("Data", "Delta Lake", "Read dataset snapshots", "delta"),
    a("Data", "Apache Iceberg", "Read dataset snapshots", "apacheiceberg"),
    a("Data", "lakeFS", "Pin a dataset to a commit", "lakefs"),
    a("Data", "DVC", "Pin a dataset to a DVC revision", "dvc"),
    a("Features", "Feast", "Online and offline features", "feast"),
    a("Features", "Tecton", "Online and offline features"),
    a("Models", "Hugging Face Hub", "Pull base models and publish results", "huggingface"),
    a("Models", "Ollama", "Pull local models for evaluation", "ollama"),
    a("Code", "GitHub", "Pin commits and start runs from CI", "github"),
    a("Code", "GitLab", "Pin commits and start runs from CI", "gitlab"),
    a("Code", "Bitbucket", "Pin commits and start runs from CI", "bitbucket"),
    a("Artifacts", "Amazon S3", "Store artifacts and checkpoints", "amazons3"),
    a("Artifacts", "Google Cloud Storage", "Store artifacts and checkpoints", "googlecloudstorage"),
    a("Artifacts", "Azure Blob Storage", "Store artifacts and checkpoints"),
    a("Artifacts", "MinIO", "Store artifacts and checkpoints on your own storage", "minio"),
    a("Serving", "KServe", "Deploy a candidate through Deployments", "kserve"),
    a("Serving", "NVIDIA Triton", "Deploy a candidate through Deployments", "nvidia"),
    a("Serving", "vLLM", "Serve language models", "vllm"),
    a("Serving", "BentoML", "Deploy a candidate through Deployments", "bentoml"),
    a("Notebooks", "VS Code remote", "Work from your editor with the SDK and the tok command line", "visualstudiocode"),
    a("Notebooks", "Databricks notebooks", "Use the SDK from a Databricks notebook", "databricks"),
    a("Notebooks", "SageMaker Studio", "Use the SDK from SageMaker Studio"),
    a("Notebooks", "Vertex Workbench", "Use the SDK from Vertex Workbench", "googlecloud"),
    a("Notebooks", "Hex", "Use the SDK from a Hex project", "hex"),
  ];
}

