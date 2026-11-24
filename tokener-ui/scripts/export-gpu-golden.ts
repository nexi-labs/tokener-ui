/**
 * Writes the expected output of the console's GPU planner and CUDA checker for a fixed matrix of inputs, so the Java ports can be compared
 * with them case by case (GpuChecks). Run from tokener-ui: npx tsx scripts/export-gpu-golden.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname } from "node:path";
import { GPUS, SHAPES, PRECISIONS, plan } from "../src/lib/gateway/gpu";
import { CUDA_GPUS, TOOLKITS, checkCuda, newestSupported } from "../src/lib/gateway/cuda";

const out = "../tokener-mlops/src/test/resources/io/tokener/mlops/golden/gpu.json";
const plans: unknown[] = [];
for (const model of SHAPES) for (const precision of PRECISIONS) for (const kvBytes of [1, 2] as const) for (const contextTokens of [4096, 32768]) for (const concurrency of [1, 32]) for (const gpu of GPUS) {
  const p = plan(gpu, { model, precision, kvBytes, contextTokens, concurrency, efficiency: 0.5 });
  plans.push({ gpu: gpu.id, model: model.id, precision: precision.id, kvBytes, contextTokens, concurrency, efficiency: 0.5, fits: p.fits, gpus: p.gpus, weightsGb: p.weightsGb, kvGb: p.kvGb, totalGb: p.totalGb,
    headroomPct: p.headroomPct, tokensPerSec: p.tokensPerSec, perUser: p.perUserTokensPerSec, bound: p.bound, costPerHour: p.costPerHour, costPerMTokens: Number.isFinite(p.costPerMTokens) ? p.costPerMTokens : null, reason: p.reason ?? null });
}
const drivers = ["450.80.02", "515.65", "520.61.05", "525.60.13", "535.104.05", "550.54.14", "560.28.03", "570.124.06", "575.51.03", "580.65.06", "590.44"];
const cuda: unknown[] = [];
for (const g of CUDA_GPUS) for (const t of TOOLKITS) for (const d of drivers) { const c = checkCuda(g.id, t.id, d); cuda.push({ gpu: g.id, toolkit: t.id, driver: d, verdict: c.verdict, titles: c.findings.map((f) => f.level + ":" + f.title), fix: c.fix ?? null }); }
const newest = CUDA_GPUS.flatMap((g) => drivers.map((d) => ({ gpu: g.id, driver: d, toolkit: newestSupported(g.id, d)?.id ?? null })));
const bad = ["", "abc", "570", "57.1", "570.1.2.3", "5700.1"].map((d) => ({ driver: d, verdict: checkCuda("h100", "12.4", d).verdict, title: checkCuda("h100", "12.4", d).findings[0].title }));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out + ".gz", gzipSync(JSON.stringify({ plans, cuda, newest, bad }), { level: 9 }));
console.log(plans.length, "plans,", cuda.length, "cuda checks,", newest.length, "newest,", bad.length, "bad drivers");
