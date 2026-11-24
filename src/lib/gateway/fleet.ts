/**
 * GPU fleet and Multi-Instance GPU (MIG) reference data. The fleet is a sample workspace so the screen has something to show before a cluster is
 * connected; a connected cluster reports the same fields from the node agent. MIG profiles are NVIDIA's published partitions for 80 GB
 * A100 and H100 parts.
 */
export type GpuNode = { id: string; pool: string; gpu: string; gpuId: string; count: number; usedPct: number; memUsedPct: number; driver: string; cuda: string; serving: string[]; mig?: string };

export const SAMPLE_FLEET: GpuNode[] = [
  { id: "gpu-use1-a01", pool: "inference-prod", gpu: "NVIDIA H100 80 GB", gpuId: "h100", count: 8, usedPct: 71, memUsedPct: 84, driver: "570.124.06", cuda: "12.8", serving: ["llama-3-70b"] },
  { id: "gpu-use1-a02", pool: "inference-prod", gpu: "NVIDIA H100 80 GB", gpuId: "h100", count: 8, usedPct: 64, memUsedPct: 81, driver: "570.124.06", cuda: "12.8", serving: ["llama-3-70b"] },
  { id: "gpu-use1-b01", pool: "inference-stg", gpu: "NVIDIA L40S", gpuId: "l40s", count: 4, usedPct: 38, memUsedPct: 52, driver: "550.54.15", cuda: "12.4", serving: ["support-classifier-staging"] },
  { id: "gpu-use1-c01", pool: "shared-small", gpu: "NVIDIA A100 80 GB", gpuId: "a100", count: 8, usedPct: 47, memUsedPct: 33, driver: "535.104.05", cuda: "12.2", serving: ["embed-small", "reranker", "support-classifier-prod"], mig: "3g.40gb x2" },
  { id: "gpu-euw1-a01", pool: "inference-eu", gpu: "NVIDIA A10G", gpuId: "a10g", count: 4, usedPct: 22, memUsedPct: 41, driver: "535.54.03", cuda: "12.2", serving: ["mistral-7b-eu"] },
  { id: "gpu-use1-d01", pool: "training", gpu: "NVIDIA H200", gpuId: "h200", count: 8, usedPct: 93, memUsedPct: 88, driver: "575.51.03", cuda: "12.9", serving: ["fine-tune: legal-summarizer"] },
];

export type MigProfile = { id: string; gpcs: number; memGb: number; perGpu: number };
/** Partitions of an 80 GB A100 or H100. A GPU holds one layout at a time; the counts are the most of that profile on one GPU. */
export const MIG_PROFILES: Record<"a100" | "h100", MigProfile[]> = {
  a100: [
    { id: "1g.10gb", gpcs: 1, memGb: 10, perGpu: 7 }, { id: "2g.20gb", gpcs: 2, memGb: 20, perGpu: 3 }, { id: "3g.40gb", gpcs: 3, memGb: 40, perGpu: 2 },
    { id: "4g.40gb", gpcs: 4, memGb: 40, perGpu: 1 }, { id: "7g.80gb", gpcs: 7, memGb: 80, perGpu: 1 },
  ],
  h100: [
    { id: "1g.10gb", gpcs: 1, memGb: 10, perGpu: 7 }, { id: "1g.20gb", gpcs: 1, memGb: 20, perGpu: 4 }, { id: "2g.20gb", gpcs: 2, memGb: 20, perGpu: 3 },
    { id: "3g.40gb", gpcs: 3, memGb: 40, perGpu: 2 }, { id: "4g.40gb", gpcs: 4, memGb: 40, perGpu: 1 }, { id: "7g.80gb", gpcs: 7, memGb: 80, perGpu: 1 },
  ],
};

/** The smallest slice whose usable memory holds the model: weights plus 10 percent runtime, within 90 percent of the slice, plus the KV cache. */
export function smallestSlice(gpu: "a100" | "h100", needGb: number): MigProfile | null {
  return [...MIG_PROFILES[gpu]].sort((a, b) => a.memGb - b.memGb || a.gpcs - b.gpcs).find((p) => p.memGb * 0.9 >= needGb) ?? null;
}
