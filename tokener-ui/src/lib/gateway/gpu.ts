/**
 * Capacity planning for serving a model on GPUs. It is a transparent roofline estimate, not a benchmark: it shows how much memory a model needs,
 * how many GPUs that implies, and an upper bound on decode throughput from memory bandwidth and compute, so engineers can compare GPU types and
 * cost before they provision anything. Every number on screen comes from the inputs below, and the page says to measure with the real engine.
 */

export type Gpu = {
  id: string; label: string; vendor: "NVIDIA"; memGb: number; bandwidthGBs: number; fp16Tflops: number; fp8: boolean; interconnect: string;
  /** Placeholder on-demand rate in USD per GPU hour. Replace with your negotiated rate. */
  rateUsdHr: number; clouds: string[];
};

/** Published headline figures for each part, rounded. Verify with the vendor before committing spend. */
export const GPUS: Gpu[] = [
  { id: "b200", label: "NVIDIA B200", vendor: "NVIDIA", memGb: 180, bandwidthGBs: 8000, fp16Tflops: 2250, fp8: true, interconnect: "NVLink 5", rateUsdHr: 7.5, clouds: ["AWS", "Google Cloud", "Azure", "CoreWeave", "Lambda"] },
  { id: "h200", label: "NVIDIA H200", vendor: "NVIDIA", memGb: 141, bandwidthGBs: 4800, fp16Tflops: 989, fp8: true, interconnect: "NVLink 4", rateUsdHr: 5, clouds: ["AWS", "Google Cloud", "Azure", "CoreWeave", "Lambda"] },
  { id: "h100", label: "NVIDIA H100 80 GB", vendor: "NVIDIA", memGb: 80, bandwidthGBs: 3350, fp16Tflops: 989, fp8: true, interconnect: "NVLink 4", rateUsdHr: 4, clouds: ["AWS", "Google Cloud", "Azure", "CoreWeave", "Lambda"] },
  { id: "a100", label: "NVIDIA A100 80 GB", vendor: "NVIDIA", memGb: 80, bandwidthGBs: 2039, fp16Tflops: 312, fp8: false, interconnect: "NVLink 3", rateUsdHr: 2.2, clouds: ["AWS", "Google Cloud", "Azure", "CoreWeave", "Lambda"] },
  { id: "l40s", label: "NVIDIA L40S", vendor: "NVIDIA", memGb: 48, bandwidthGBs: 864, fp16Tflops: 362, fp8: true, interconnect: "PCIe", rateUsdHr: 1.6, clouds: ["AWS", "Google Cloud", "Azure", "CoreWeave"] },
  { id: "a10g", label: "NVIDIA A10G", vendor: "NVIDIA", memGb: 24, bandwidthGBs: 600, fp16Tflops: 125, fp8: false, interconnect: "PCIe", rateUsdHr: 1, clouds: ["AWS"] },
  { id: "l4", label: "NVIDIA L4", vendor: "NVIDIA", memGb: 24, bandwidthGBs: 300, fp16Tflops: 121, fp8: true, interconnect: "PCIe", rateUsdHr: 0.8, clouds: ["Google Cloud", "AWS"] },
];

export type ModelShape = { id: string; label: string; paramsB: number; activeB: number; layers: number; kvHeads: number; headDim: number };
export const SHAPES: ModelShape[] = [
  { id: "llama-3-8b", label: "Llama 3 8B", paramsB: 8, activeB: 8, layers: 32, kvHeads: 8, headDim: 128 },
  { id: "mistral-7b", label: "Mistral 7B", paramsB: 7.3, activeB: 7.3, layers: 32, kvHeads: 8, headDim: 128 },
  { id: "llama-3-70b", label: "Llama 3 70B", paramsB: 70, activeB: 70, layers: 80, kvHeads: 8, headDim: 128 },
  { id: "mixtral-8x7b", label: "Mixtral 8x7B (mixture of experts)", paramsB: 46.7, activeB: 12.9, layers: 32, kvHeads: 8, headDim: 128 },
  { id: "llama-3-405b", label: "Llama 3.1 405B", paramsB: 405, activeB: 405, layers: 126, kvHeads: 8, headDim: 128 },
];

export type Precision = { id: "fp16" | "fp8" | "int8" | "int4"; label: string; bytes: number };
export const PRECISIONS: Precision[] = [
  { id: "fp16", label: "FP16 / BF16", bytes: 2 },
  { id: "fp8", label: "FP8", bytes: 1 },
  { id: "int8", label: "INT8", bytes: 1 },
  { id: "int4", label: "INT4 (weights only)", bytes: 0.5 },
];

export const ENGINES: { id: string; label: string; note: string; nvidiaOnly: boolean }[] = [
  { id: "vllm", label: "vLLM", note: "Open source, runs on NVIDIA and other accelerators. Continuous batching and paged KV cache.", nvidiaOnly: false },
  { id: "tensorrt-llm", label: "TensorRT-LLM", note: "NVIDIA's compiled inference library. Build an engine per model, GPU and precision.", nvidiaOnly: true },
  { id: "nim", label: "NVIDIA NIM", note: "Prebuilt, optimized inference containers from NVIDIA with an OpenAI-compatible API. Needs an NVIDIA AI Enterprise licence for production.", nvidiaOnly: true },
  { id: "triton", label: "Triton Inference Server", note: "Serves several model types behind one server, with dynamic batching. Pairs with TensorRT-LLM or vLLM backends.", nvidiaOnly: false },
];

export type Inputs = { model: ModelShape; precision: Precision; kvBytes: 1 | 2; contextTokens: number; concurrency: number; efficiency: number; };
export type Plan = {
  gpu: Gpu; fits: boolean; gpus: number; weightsGb: number; kvGb: number; totalGb: number; memPerGpuGb: number; headroomPct: number;
  tokensPerSec: number; perUserTokensPerSec: number; bound: "memory bandwidth" | "compute"; costPerHour: number; costPerMTokens: number; reason?: string;
};

export const kvBytesPerToken = (m: ModelShape, kvBytes: number) => 2 * m.layers * m.kvHeads * m.headDim * kvBytes;
const TP = [1, 2, 4, 8, 16];

export function plan(gpu: Gpu, i: Inputs): Plan {
  const weightsGb = (i.model.paramsB * 1e9 * i.precision.bytes) / 1e9;
  const kvGb = (kvBytesPerToken(i.model, i.kvBytes) * i.contextTokens * i.concurrency) / 1e9;
  const totalGb = weightsGb * 1.1 + kvGb; // 10 percent for activations and the runtime
  const usable = gpu.memGb * 0.9;
  const need = Math.ceil(totalGb / usable);
  const gpus = TP.find((t) => t >= need) ?? 0;
  const base = { gpu, weightsGb, kvGb, totalGb, gpus, memPerGpuGb: gpus ? totalGb / gpus : 0 };
  if (!gpus) return { ...base, fits: false, headroomPct: 0, tokensPerSec: 0, perUserTokensPerSec: 0, bound: "memory bandwidth", costPerHour: 0, costPerMTokens: Infinity, reason: "Needs more than 16 GPUs. Reduce context, concurrency or precision." };
  if (i.precision.id === "fp8" && !gpu.fp8) return { ...base, fits: false, headroomPct: 0, tokensPerSec: 0, perUserTokensPerSec: 0, bound: "memory bandwidth", costPerHour: 0, costPerMTokens: Infinity, reason: "This GPU has no native FP8. Use INT8, FP16 or a newer part." };
  // Decode step: read the active weights once plus every sequence's KV cache, across all GPUs, at a fraction of peak bandwidth.
  const bytesPerStep = i.model.activeB * 1e9 * i.precision.bytes + i.concurrency * i.contextTokens * kvBytesPerToken(i.model, i.kvBytes);
  const memTps = (i.concurrency * gpu.bandwidthGBs * 1e9 * gpus * i.efficiency) / bytesPerStep;
  const flopsPerToken = 2 * i.model.activeB * 1e9;
  const cmpTps = (gpu.fp16Tflops * 1e12 * gpus * Math.min(i.efficiency, 0.5)) / flopsPerToken;
  const tokensPerSec = Math.min(memTps, cmpTps);
  const costPerHour = gpus * gpu.rateUsdHr;
  return { ...base, fits: true, headroomPct: Math.max(0, Math.round((1 - totalGb / (gpus * usable)) * 100)), tokensPerSec, perUserTokensPerSec: tokensPerSec / i.concurrency, bound: memTps <= cmpTps ? "memory bandwidth" : "compute", costPerHour, costPerMTokens: (costPerHour / (tokensPerSec * 3600)) * 1e6 };
}

/** A starting point for a Kubernetes deployment: the GPU count and the engine flags that follow from the plan. */
export function manifest(p: Plan, i: Inputs, engine: string): string {
  const name = i.model.id;
  const lines = [
    "apiVersion: apps/v1", "kind: Deployment", "metadata:", `  name: ${name}`, "spec:", "  replicas: 1", "  template:", "    spec:", "      containers:", `        - name: ${engine}`,
    engine === "vllm" ? "          image: vllm/vllm-openai:latest  # pin a version before production" : engine === "nim" ? "          image: nvcr.io/nim/<publisher>/<model>:<tag>  # from the NVIDIA NGC catalog" : engine === "tensorrt-llm" ? "          image: <your TensorRT-LLM engine image>" : "          image: nvcr.io/nvidia/tritonserver:<tag>-trtllm-python-py3",
    "          resources:", "            limits:", `              nvidia.com/gpu: ${p.gpus}`,
  ];
  if (engine === "vllm") lines.push("          args:", `            - --model=${i.model.id}`, `            - --tensor-parallel-size=${p.gpus}`, `            - --max-model-len=${i.contextTokens}`, `            - --max-num-seqs=${i.concurrency}`, ...(i.precision.id === "fp8" ? ["            - --quantization=fp8"] : []), ...(i.kvBytes === 1 ? ["            - --kv-cache-dtype=fp8"] : []));
  return lines.join("\n");
}
