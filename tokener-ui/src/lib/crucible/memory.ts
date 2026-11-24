/**
 * Crucible memory planner (docs/51, section 8.1).
 *
 * Estimates the memory one GPU needs for a transformer training job and, when it does not fit, the smallest set of changes that makes it fit.
 * It is an estimate and says so. Real peaks depend on the framework, kernels and fragmentation, and the run records the measured peak so the next
 * estimate for a similar job is better.
 *
 * Model state for mixed precision with Adam is 16 bytes per parameter: 2 weights, 2 gradients, and 12 optimizer (a full precision copy of the
 * weights, plus momentum and variance). Activation memory follows Korthikanti et al. (per layer, about s*b*h*34 bytes plus 5*a*s*s*b for the
 * attention scores, in 16 bit), reduced by activation checkpointing and by flash attention.
 */

export type Method = "full" | "lora" | "qlora";
export type Precision = "bf16" | "fp16" | "fp32";
export type Optimizer = "adamw" | "adamw8bit" | "sgd" | "adafactor";
export type Shard = "none" | "zero1" | "zero2" | "zero3";
export type Offload = "none" | "optimizer";

export type ModelPreset = { id: string; label: string; paramsB: number; layers: number; hidden: number; heads: number; vocab: number };
export const PRESETS: ModelPreset[] = [
  { id: "1b", label: "1B (Llama 3.2 1B class)", paramsB: 1.24, layers: 16, hidden: 2048, heads: 32, vocab: 128256 },
  { id: "3b", label: "3B (Llama 3.2 3B class)", paramsB: 3.21, layers: 28, hidden: 3072, heads: 24, vocab: 128256 },
  { id: "7b", label: "7B (Llama 2 7B class)", paramsB: 6.74, layers: 32, hidden: 4096, heads: 32, vocab: 32000 },
  { id: "8b", label: "8B (Llama 3 8B class)", paramsB: 8.03, layers: 32, hidden: 4096, heads: 32, vocab: 128256 },
  { id: "13b", label: "13B (Llama 2 13B class)", paramsB: 13.0, layers: 40, hidden: 5120, heads: 40, vocab: 32000 },
  { id: "70b", label: "70B (Llama 3 70B class)", paramsB: 70.6, layers: 80, hidden: 8192, heads: 64, vocab: 128256 },
];
export const CARDS = [16, 24, 40, 48, 80, 141] as const;
export const CARD_LABEL: Record<number, string> = { 16: "16 GB (T4, V100)", 24: "24 GB (A10, L4, RTX 4090)", 40: "40 GB (A100 40 GB)", 48: "48 GB (L40S, A6000)", 80: "80 GB (A100, H100)", 141: "141 GB (H200)" };

export type PlanInput = {
  paramsB: number; layers: number; hidden: number; heads: number; vocab: number;
  method: Method; precision: Precision; optimizer: Optimizer; shard: Shard; offload: Offload;
  gpus: number; gpuGb: number;
  seqLen: number; microBatch: number; accum: number;
  checkpointing: boolean; flash: boolean;
  /** Share of parameters that are trained for LoRA and QLoRA. About 0.5 to 2 percent for ranks 8 to 64. */
  trainableFrac: number;
};

export const defaultPlan = (p: ModelPreset = PRESETS[2]): PlanInput => ({
  paramsB: p.paramsB, layers: p.layers, hidden: p.hidden, heads: p.heads, vocab: p.vocab,
  method: "full", precision: "bf16", optimizer: "adamw", shard: "none", offload: "none", gpus: 8, gpuGb: 80, seqLen: 2048, microBatch: 4, accum: 4, checkpointing: false, flash: true, trainableFrac: 0.01,
});

const GB = 1e9;
export type Breakdown = { weights: number; gradients: number; optimizer: number; activations: number; logits: number; overhead: number; total: number; usable: number; fits: boolean; headroom: number; host: number; modelState: number };

/** Bytes per trainable parameter for the optimizer state, including the full precision master copy under mixed precision. */
export const optimizerBytes = (o: Optimizer, p: Precision): number => {
  const master = p === "fp32" ? 0 : 4;
  return master + (o === "adamw" ? 8 : o === "adamw8bit" ? 2 : o === "sgd" ? 4 : 0.5);
};

export const USABLE = 0.92;

export function estimate(i: PlanInput): Breakdown {
  const P = i.paramsB * 1e9;
  const w = i.precision === "fp32" ? 4 : 2;
  const trainable = i.method === "full" ? P : P * i.trainableFrac;
  const baseW = i.method === "qlora" ? P * 0.5 * 1.06 : P * w;
  const adapterW = i.method === "full" ? 0 : trainable * w;
  let weights = baseW + adapterW;
  let grads = trainable * w;
  let opt = trainable * optimizerBytes(i.optimizer, i.precision);
  const n = Math.max(1, i.gpus);
  if (i.shard === "zero1") opt /= n;
  if (i.shard === "zero2") { opt /= n; grads /= n; }
  if (i.shard === "zero3") { opt /= n; grads /= n; weights /= n; }
  let host = 0;
  if (i.offload === "optimizer") { host = opt; opt = 0; }

  const s = i.seqLen, b = i.microBatch, h = i.hidden, a = i.heads, L = i.layers;
  const act16 = (s * b * h * 34) + (i.flash ? 0 : 5 * a * s * s * b);
  const scale = i.precision === "fp32" ? 2 : 1;
  const full = act16 * scale;
  const checkpointed = L * s * b * h * 2 * scale + full; // each layer keeps its input, one layer is recomputed at a time
  const activations = i.checkpointing ? checkpointed : full * L;
  const logits = s * b * i.vocab * 4; // the output layer in full precision

  const gathered = i.shard === "zero3" ? 2 * (P / L) * w : 0; // layers gathered for use
  const subtotal = weights + grads + opt + activations + logits + gathered;
  const overhead = 1.5 * GB + subtotal * 0.05 + gathered;
  const total = subtotal + (overhead - gathered);
  const usable = i.gpuGb * GB * USABLE;
  return {
    weights: weights / GB, gradients: grads / GB, optimizer: opt / GB, activations: activations / GB, logits: logits / GB, overhead: overhead / GB,
    total: total / GB, usable: usable / GB, fits: total <= usable, headroom: (usable - total) / GB, host: host / GB,
    modelState: (weights + grads + opt) / GB,
  };
}

export type Technique = { id: string; label: string; cost: string; saves: string; apply: (i: PlanInput) => PlanInput | null };

/** Ordered from the cheapest change to the most invasive. A technique returns null when it does not apply. */
export const TECHNIQUES: Technique[] = [
  { id: "bf16", label: "Train in bf16 instead of fp32", saves: "About half of weights, gradients and activations", cost: "Needs hardware support. Watch stability.", apply: (i) => (i.precision === "fp32" ? { ...i, precision: "bf16" } : null) },
  { id: "flash", label: "Use flash attention", saves: "The attention score activations", cost: "Library and kernel support.", apply: (i) => (i.flash ? null : { ...i, flash: true }) },
  { id: "accum", label: "Halve the micro batch, double the accumulation", saves: "Activation memory", cost: "More steps for each update. The effective batch is unchanged.", apply: (i) => (i.microBatch > 1 ? { ...i, microBatch: Math.floor(i.microBatch / 2), accum: i.accum * 2 } : null) },
  { id: "ckpt", label: "Turn on activation checkpointing", saves: "Most of the activations", cost: "About a third more compute.", apply: (i) => (i.checkpointing ? null : { ...i, checkpointing: true }) },
  { id: "zero1", label: "Shard optimizer state across GPUs (ZeRO 1)", saves: "Optimizer state divided by the number of GPUs", cost: "Some communication.", apply: (i) => (i.gpus > 1 && i.shard === "none" && i.method === "full" ? { ...i, shard: "zero1" } : null) },
  { id: "zero2", label: "Also shard gradients (ZeRO 2)", saves: "Gradients divided by the number of GPUs", cost: "More communication.", apply: (i) => (i.gpus > 1 && (i.shard === "none" || i.shard === "zero1") && i.method === "full" ? { ...i, shard: "zero2" } : null) },
  { id: "zero3", label: "Shard weights too (ZeRO 3 or FSDP)", saves: "Weights divided by the number of GPUs", cost: "Weights are gathered layer by layer, so more communication.", apply: (i) => (i.gpus > 1 && i.shard !== "zero3" ? { ...i, shard: "zero3" } : null) },
  { id: "adam8", label: "Use an 8 bit optimizer", saves: "Optimizer state", cost: "A small accuracy risk.", apply: (i) => (i.optimizer === "adamw" ? { ...i, optimizer: "adamw8bit" } : null) },
  { id: "offload", label: "Offload optimizer state to host memory", saves: "All optimizer state on the GPU", cost: "Slower steps. Needs host memory.", apply: (i) => (i.offload === "none" && i.method === "full" ? { ...i, offload: "optimizer" } : null) },
  { id: "lora", label: "Fine tune with LoRA instead of all weights", saves: "Most gradient and optimizer state", cost: "Fine tuning only. May not match full fine tuning on hard tasks.", apply: (i) => (i.method === "full" ? { ...i, method: "lora", shard: i.shard } : null) },
  { id: "qlora", label: "Fine tune with QLoRA (4 bit base)", saves: "Base weights at about a quarter of the size", cost: "Fine tuning only. Slower. A small accuracy risk.", apply: (i) => (i.method !== "qlora" ? { ...i, method: "qlora" } : null) },
];
export const TECHNIQUE_BY_ID = Object.fromEntries(TECHNIQUES.map((t) => [t.id, t])) as Record<string, Technique>;

export type Suggestion = { id: string; label: string; saves: string; cost: string; totalGb: number; savedGb: number; fits: boolean };

/** What each single change would do on its own, largest saving first. */
export function suggestions(i: PlanInput): Suggestion[] {
  const base = estimate(i);
  return TECHNIQUES.flatMap((t) => {
    const next = t.apply(i); if (!next) return [];
    const e = estimate(next);
    return [{ id: t.id, label: t.label, saves: t.saves, cost: t.cost, totalGb: e.total, savedGb: base.total - e.total, fits: e.fits }];
  }).filter((s) => s.savedGb > 0.05).sort((a, b) => b.savedGb - a.savedGb);
}

export type PlanStep = { id: string; label: string; cost: string; totalGb: number };
export type Fix = { fits: boolean; steps: PlanStep[]; final: PlanInput; finalTotalGb: number };

/** Applies the cheapest techniques in order, keeping only those that save memory, until the job fits. Stops with fits false when nothing more helps. */
export function smallestFix(i: PlanInput): Fix {
  let cur = i; const steps: PlanStep[] = [];
  if (estimate(cur).fits) return { fits: true, steps, final: cur, finalTotalGb: estimate(cur).total };
  for (const t of TECHNIQUES) {
    // Fine tuning methods change what is being trained, so they come last and only when the others are not enough.
    const next = t.apply(cur); if (!next) continue;
    const before = estimate(cur).total, after = estimate(next).total;
    if (after >= before - 0.05) continue;
    cur = next; steps.push({ id: t.id, label: t.label, cost: t.cost, totalGb: after });
    if (estimate(cur).fits) return { fits: true, steps, final: cur, finalTotalGb: after };
  }
  return { fits: false, steps, final: cur, finalTotalGb: estimate(cur).total };
}

/** Fleet right sizing: the smallest card that would have held the measured peak with 10 percent headroom. */
export function rightSize(requestedGb: number, peakGb: number): { cardGb: number; savingFraction: number } | null {
  const need = peakGb * 1.1;
  const card = CARDS.find((c) => c * USABLE >= need);
  if (!card || card >= requestedGb) return null;
  return { cardGb: card, savingFraction: 1 - card / requestedGb };
}
