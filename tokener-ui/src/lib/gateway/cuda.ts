/**
 * CUDA toolkit, driver and GPU compatibility. The driver minimums are NVIDIA's published table "CUDA Toolkit and Corresponding Driver Versions"
 * (Linux x86_64, GA releases, CUDA Toolkit release notes) and the compute capabilities are from NVIDIA's CUDA GPU list. Minor version
 * compatibility is the rule that lets an application built with any CUDA 12.x toolkit run on a driver 525 or newer within the 12.x family.
 *
 * What it does not do: it does not read a live node. It answers "will this combination start" from published tables, and the page says to
 * confirm with `nvidia-smi` on the node. Re-check the tables when NVIDIA publishes a new toolkit.
 */

export type CudaToolkit = { id: string; label: string; major: number; minDriver: string };

/** Minimum Linux x86_64 driver for the GA release of each toolkit. */
export const TOOLKITS: CudaToolkit[] = [
  { id: "13.0", label: "CUDA 13.0", major: 13, minDriver: "580.65.06" },
  { id: "12.9", label: "CUDA 12.9", major: 12, minDriver: "575.51.03" },
  { id: "12.8", label: "CUDA 12.8", major: 12, minDriver: "570.26" },
  { id: "12.6", label: "CUDA 12.6", major: 12, minDriver: "560.28.03" },
  { id: "12.5", label: "CUDA 12.5", major: 12, minDriver: "555.42.02" },
  { id: "12.4", label: "CUDA 12.4", major: 12, minDriver: "550.54.14" },
  { id: "12.3", label: "CUDA 12.3", major: 12, minDriver: "545.23.06" },
  { id: "12.2", label: "CUDA 12.2", major: 12, minDriver: "535.54.03" },
  { id: "12.1", label: "CUDA 12.1", major: 12, minDriver: "530.30.02" },
  { id: "12.0", label: "CUDA 12.0", major: 12, minDriver: "525.60.13" },
  { id: "11.8", label: "CUDA 11.8", major: 11, minDriver: "520.61.05" },
];

/** Minimum driver for minor version compatibility inside a major family. */
export const MINOR_COMPAT_DRIVER: Record<number, string> = { 12: "525.60.13", 11: "450.80.02" };

export type CudaGpu = { id: string; label: string; architecture: string; cc: string; dataCenter: boolean; minToolkit: string };

/** `minToolkit` is the first toolkit that can build for the part's compute capability. */
export const CUDA_GPUS: CudaGpu[] = [
  { id: "b200", label: "NVIDIA B200", architecture: "Blackwell", cc: "10.0", dataCenter: true, minToolkit: "12.8" },
  { id: "h200", label: "NVIDIA H200", architecture: "Hopper", cc: "9.0", dataCenter: true, minToolkit: "11.8" },
  { id: "h100", label: "NVIDIA H100", architecture: "Hopper", cc: "9.0", dataCenter: true, minToolkit: "11.8" },
  { id: "l40s", label: "NVIDIA L40S", architecture: "Ada Lovelace", cc: "8.9", dataCenter: true, minToolkit: "11.8" },
  { id: "l4", label: "NVIDIA L4", architecture: "Ada Lovelace", cc: "8.9", dataCenter: true, minToolkit: "11.8" },
  { id: "a100", label: "NVIDIA A100", architecture: "Ampere", cc: "8.0", dataCenter: true, minToolkit: "11.8" },
  { id: "a10g", label: "NVIDIA A10G", architecture: "Ampere", cc: "8.6", dataCenter: true, minToolkit: "11.8" },
  { id: "t4", label: "NVIDIA T4", architecture: "Turing", cc: "7.5", dataCenter: true, minToolkit: "11.8" },
  { id: "v100", label: "NVIDIA V100", architecture: "Volta", cc: "7.0", dataCenter: true, minToolkit: "11.8" },
];

export const toolkitById = (id: string) => TOOLKITS.find((t) => t.id === id);
export const cudaGpuById = (id: string) => CUDA_GPUS.find((g) => g.id === id);

/** Numeric, segment by segment: 570.26 < 570.124.06 < 575.51.03. */
export function cmpDriver(a: string, b: string): number {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? 0) - (y[i] ?? 0); if (d) return d < 0 ? -1 : 1; }
  return 0;
}
export const validDriver = (s: string) => /^\d{3}(\.\d{1,3}){1,2}$/.test(s.trim());
const cmpToolkit = (a: string, b: string) => cmpDriver(a, b);

export type Verdict = "ok" | "caution" | "blocked";
export type Finding = { level: Verdict; title: string; detail: string };
export type CudaCheck = { verdict: Verdict; findings: Finding[]; fix?: string };

/**
 * Judges one (GPU, toolkit, driver) combination. `blocked` means the container will not start or the GPU is not supported. `caution` means it runs
 * through minor version compatibility, which has limits.
 */
export function checkCuda(gpuId: string, toolkitId: string, driver: string): CudaCheck {
  const gpu = cudaGpuById(gpuId), tk = toolkitById(toolkitId);
  const findings: Finding[] = [];
  if (!gpu || !tk) return { verdict: "blocked", findings: [{ level: "blocked", title: "Unknown input", detail: "Choose a GPU and a toolkit from the lists." }] };
  if (!validDriver(driver)) return { verdict: "blocked", findings: [{ level: "blocked", title: "Driver version not understood", detail: "Enter the version that nvidia-smi prints, for example 570.124.06." }] };

  if (cmpToolkit(tk.id, gpu.minToolkit) < 0)
    findings.push({ level: "blocked", title: `${gpu.architecture} needs CUDA ${gpu.minToolkit} or newer`, detail: `${gpu.label} has compute capability ${gpu.cc}. ${tk.label} cannot build kernels for it, so a framework built only with ${tk.label} will not run on it.` });
  if (tk.major >= 13 && Number(gpu.cc) < 7.5)
    findings.push({ level: "blocked", title: "CUDA 13 dropped this architecture", detail: `${gpu.architecture} (compute capability ${gpu.cc}) is not supported by CUDA 13.0 and later. Stay on a 12.x toolkit for this GPU.` });

  let fix: string | undefined;
  if (cmpDriver(driver, tk.minDriver) >= 0) {
    findings.push({ level: "ok", title: "Driver meets the toolkit minimum", detail: `${driver} is at or above ${tk.minDriver}, the minimum for ${tk.label}.` });
  } else {
    const compat = MINOR_COMPAT_DRIVER[tk.major];
    if (compat && cmpDriver(driver, compat) >= 0 && tk.major === 12 && cmpDriver(driver, "580") < 0) {
      findings.push({ level: "caution", title: "Runs through minor version compatibility", detail: `${driver} is below ${tk.minDriver} but at or above ${compat}, so an application built with a ${tk.major}.x toolkit still starts. Code that is shipped as PTX only, and a few newer features, can fail with cudaErrorCallRequiresNewerDriver. Build with an explicit architecture (nvcc -arch=sm_xx) and test the real model.` });
      fix = `Upgrade the node driver to ${tk.minDriver} or newer to remove the limits.`;
    } else {
      findings.push({ level: "blocked", title: "Driver is too old for this toolkit", detail: `${driver} is below ${tk.minDriver}${compat ? ` and below the ${compat} floor for ${tk.major}.x minor version compatibility` : ""}. The container fails at start with a driver version error.` });
      fix = gpu.dataCenter
        ? `Upgrade the node driver to ${tk.minDriver} or newer, or pick a toolkit whose minimum is at or below ${driver}. Data center GPUs can also use NVIDIA's CUDA forward compatibility package in the container when a driver upgrade is not possible.`
        : `Upgrade the node driver to ${tk.minDriver} or newer.`;
    }
  }
  const verdict: Verdict = findings.some((f) => f.level === "blocked") ? "blocked" : findings.some((f) => f.level === "caution") ? "caution" : "ok";
  if (!fix && verdict === "blocked") fix = `Use a toolkit of ${gpu.minToolkit} or newer${tk.major >= 13 && Number(gpu.cc) < 7.5 ? " and below 13" : ""}.`;
  return { verdict, findings, fix };
}

/** The newest toolkit that both supports the GPU and starts on the driver without compatibility mode. */
export function newestSupported(gpuId: string, driver: string): CudaToolkit | null {
  const gpu = cudaGpuById(gpuId);
  if (!gpu || !validDriver(driver)) return null;
  return TOOLKITS.find((t) => cmpToolkit(t.id, gpu.minToolkit) >= 0 && !(t.major >= 13 && Number(gpu.cc) < 7.5) && cmpDriver(driver, t.minDriver) >= 0) ?? null;
}
