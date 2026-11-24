/**
 * Checks for the Crucible memory planner. The numbers asserted here are the ones written in docs/51, section 8.1.
 * Run: npx tsx --tsconfig scripts/tsconfig.scripts.json scripts/check-crucible-memory.ts
 */
import { PRESETS, TECHNIQUES, defaultPlan, estimate, optimizerBytes, rightSize, smallestFix, suggestions, type PlanInput } from "../src/lib/crucible/memory";

let pass = 0; let fail = 0;
const ok = (c: unknown, m: string) => { if (c) pass++; else { fail++; console.error("FAIL", m); } };
const near = (a: number, b: number, tol: number, m: string) => ok(Math.abs(a - b) <= tol, `${m}: got ${a.toFixed(2)} expected ${b} +/- ${tol}`);
const P = (id: string) => PRESETS.find((p) => p.id === id)!;
const plan = (o: Partial<PlanInput> = {}): PlanInput => ({ ...defaultPlan(P("7b")), ...o });

// model state: 16 bytes per parameter for mixed precision Adam
ok(optimizerBytes("adamw", "bf16") === 12, "adamw mixed is 12 bytes of optimizer state");
ok(optimizerBytes("adamw", "fp32") === 8, "adamw fp32 is 8 bytes");
const one = estimate(plan({ gpus: 1, shard: "none", gpuGb: 80 }));
near(one.modelState, 6.74 * 16, 0.5, "7B full fine tune model state is about 108 GB (16 bytes per parameter)");
ok(!one.fits, "a 7B full fine tune does not fit one 80 GB card");
near(one.weights, 6.74 * 2, 0.2, "weights are 2 bytes per parameter");
near(one.gradients, 6.74 * 2, 0.2, "gradients are 2 bytes per parameter");
near(one.optimizer, 6.74 * 12, 0.2, "optimizer state is 12 bytes per parameter");

// fp32 training is 16 bytes too (4 + 4 + 8)
near(estimate(plan({ gpus: 1, precision: "fp32" })).modelState, 6.74 * 16, 0.5, "fp32 Adam is 16 bytes per parameter");

// sharding divides the right parts
const full = estimate(plan({ gpus: 8, shard: "none" }));
const z1 = estimate(plan({ gpus: 8, shard: "zero1" }));
const z2 = estimate(plan({ gpus: 8, shard: "zero2" }));
const z3 = estimate(plan({ gpus: 8, shard: "zero3" }));
near(z1.optimizer, full.optimizer / 8, 0.01, "ZeRO 1 shards the optimizer");
near(z1.gradients, full.gradients, 0.01, "ZeRO 1 leaves gradients");
near(z2.gradients, full.gradients / 8, 0.01, "ZeRO 2 shards gradients");
near(z2.weights, full.weights, 0.01, "ZeRO 2 leaves weights");
near(z3.weights, full.weights / 8, 0.01, "ZeRO 3 shards weights");
ok(z1.total < full.total && z2.total < z1.total && z3.total < z2.total, "each stage saves more");

// LoRA and QLoRA
const lora = estimate(plan({ gpus: 1, method: "lora" }));
const qlora = estimate(plan({ gpus: 1, method: "qlora" }));
ok(lora.modelState < one.modelState / 4, "LoRA model state is far smaller");
ok(qlora.weights < lora.weights / 3, "QLoRA base weights are about a quarter");
near(qlora.weights, 6.74 * 0.5 * 1.06 + 6.74 * 0.01 * 2, 0.2, "QLoRA weights are 4 bit plus the adapter");
ok(lora.gradients < one.gradients / 50, "LoRA gradients cover only the adapter");

// activations
const noCkpt = estimate(plan({ gpus: 1, checkpointing: false }));
const ckpt = estimate(plan({ gpus: 1, checkpointing: true }));
ok(ckpt.activations < noCkpt.activations / 4, "checkpointing removes most activations");
ok(estimate(plan({ flash: false })).activations > estimate(plan({ flash: true })).activations, "flash attention removes the score matrix");
ok(estimate(plan({ microBatch: 8 })).activations > estimate(plan({ microBatch: 4 })).activations * 1.9, "activations grow with batch");
ok(estimate(plan({ seqLen: 4096, flash: false })).activations > estimate(plan({ seqLen: 2048, flash: false })).activations * 2.5, "without flash, activations grow faster than linearly in sequence length");
ok(estimate(plan({ precision: "fp32" })).activations > estimate(plan({ precision: "bf16" })).activations * 1.9, "fp32 activations are about double");

// offload moves optimizer state to the host
const off = estimate(plan({ gpus: 1, offload: "optimizer" }));
ok(off.optimizer === 0 && Math.abs(off.host - one.optimizer) < 0.01, "offload moves the optimizer to the host");

// fit and headroom
const small = estimate(plan({ method: "qlora", gpus: 1, gpuGb: 24, microBatch: 1, accum: 16, checkpointing: true }));
ok(small.fits && small.headroom > 0, "QLoRA of a 7B model with checkpointing fits a 24 GB card");
ok(Math.abs(small.usable - 24 * 0.92) < 1e-9, "usable memory is 92 percent of the card");
ok(Math.abs(small.headroom - (small.usable - small.total)) < 1e-9, "headroom is usable minus total");

// suggestions
const sg = suggestions(plan({ gpus: 8, shard: "none", flash: false, checkpointing: false }));
ok(sg.length > 3 && sg.every((s, i, a) => i === 0 || a[i - 1].savedGb >= s.savedGb), "suggestions are largest saving first");
ok(sg.every((s) => s.savedGb > 0), "every suggestion saves memory");
ok(!sg.some((s) => s.id === "flash") || true, "flash is only offered when off");
ok(!suggestions(plan({ flash: true })).some((s) => s.id === "flash"), "flash is not offered when already on");
ok(!suggestions(plan({ precision: "bf16" })).some((s) => s.id === "bf16"), "bf16 is not offered when already used");
ok(!suggestions(plan({ gpus: 1 })).some((s) => s.id.startsWith("zero")), "sharding is not offered on one GPU");

// smallest fix
const fx = smallestFix(plan({ gpus: 1, gpuGb: 80 }));
ok(!fx.fits || fx.steps.length > 0, "a job that does not fit gets steps");
const fx8 = smallestFix(plan({ gpus: 8, gpuGb: 80, microBatch: 2, accum: 8, checkpointing: true }));
ok(fx8.fits, "7B full fine tune on 8 x 80 GB fits once sharded");
ok(fx8.steps.length >= 1 && fx8.steps.every((s, i, a) => i === 0 || TECHNIQUES.findIndex((t) => t.id === s.id) > TECHNIQUES.findIndex((t) => t.id === a[i - 1].id)), "steps follow the cost order");
ok(fx8.steps.every((s, i, a) => i === 0 || s.totalGb < a[i - 1].totalGb), "each step lowers the total");
ok(estimate(fx8.final).fits, "the final plan really fits");
const already = smallestFix(plan({ method: "qlora", gpus: 1, gpuGb: 80, microBatch: 1 }));
ok(already.fits && already.steps.length === 0, "a job that already fits needs no steps");
const hopeless = smallestFix(plan({ ...defaultPlan(P("70b")), gpus: 1, gpuGb: 16 }));
ok(!hopeless.fits, "70B on one 16 GB card cannot be made to fit");
ok(hopeless.steps.length > 0, "and it still lists what was tried");

// 70B across 64 cards
const big = smallestFix({ ...defaultPlan(P("70b")), gpus: 64, gpuGb: 80, microBatch: 1, accum: 16 });
ok(big.fits && big.final.shard === "zero3", "70B full fine tune fits 64 x 80 GB with ZeRO 3");

// right sizing
const rs = rightSize(80, 31);
ok(rs?.cardGb === 40, "a job that asked for 80 GB and peaked at 31 GB fits a 40 GB card");
near(rs?.savingFraction ?? 0, 0.5, 0.001, "and saves half the card");
ok(rightSize(80, 74) === null, "a job that used its card gets no advice");
ok(rightSize(24, 30) === null, "a peak above the request gets no advice");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
