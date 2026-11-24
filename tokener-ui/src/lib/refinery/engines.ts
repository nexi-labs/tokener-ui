/**
 * Engines and the limits of the native engine.
 *
 * The native engine runs inside the tok∑ner backend on virtual threads. It is the default because it needs nothing installed, and it has hard limits so that
 * no setting a person chooses can starve the platform while data is being cleaned. Spark, a single node runner and Flink are chosen for inputs that are too large for it.
 * The thresholds are rules of thumb written down so the console can explain itself. They are not measurements.
 */
import type { Engine } from "./types";

export type NativeLimits = {
  /** Virtual threads one run may use. */
  threads: number;
  /** Runs allowed at the same time. Further runs wait in the queue. */
  concurrentRuns: number;
  /** Memory the engine may hold across all of its runs. */
  memoryMb: number;
  /** Largest input a run may read. */
  maxInputGb: number;
  maxRows: number;
  /** A run that goes over is stopped and its temporary output removed. */
  maxRunMinutes: number;
  /** Streams that may run on the native engine at once. */
  streams: number;
  /** Records per second one native stream may read. */
  streamRecordsPerSec: number;
};

/** The platform's own ceilings. A tenant can set a limit lower than these, never higher. */
export const NATIVE_CEILING: NativeLimits = { threads: 256, concurrentRuns: 8, memoryMb: 16_384, maxInputGb: 25, maxRows: 200_000_000, maxRunMinutes: 120, streams: 20, streamRecordsPerSec: 20_000 };
export const NATIVE_DEFAULTS: NativeLimits = { threads: 64, concurrentRuns: 3, memoryMb: 4_096, maxInputGb: 5, maxRows: 50_000_000, maxRunMinutes: 60, streams: 5, streamRecordsPerSec: 5_000 };

export const NATIVE_FIELDS: { key: keyof NativeLimits; label: string; unit: string; hint: string; min: number; step: number }[] = [
  { key: "threads", label: "Virtual threads per run", unit: "threads", hint: "Many threads are cheap while tasks wait on storage. Work that uses the processor, such as parsing, is still bound by the cores.", min: 1, step: 8 },
  { key: "concurrentRuns", label: "Runs at the same time", unit: "runs", hint: "More runs than this wait in the queue.", min: 1, step: 1 },
  { key: "memoryMb", label: "Memory budget", unit: "MB", hint: "Shared by all native runs. A run is slowed down, or refused, rather than allowed to go over.", min: 256, step: 256 },
  { key: "maxInputGb", label: "Largest input per run", unit: "GB", hint: "Bigger inputs are refused and a runner engine is suggested.", min: 1, step: 1 },
  { key: "maxRows", label: "Most rows per run", unit: "rows", hint: "A second guard for tables with many small rows.", min: 100_000, step: 1_000_000 },
  { key: "maxRunMinutes", label: "Longest run", unit: "minutes", hint: "A run that goes over is stopped and its temporary output is removed.", min: 1, step: 5 },
  { key: "streams", label: "Streams on the native engine", unit: "streams", hint: "Streams beyond this need a Flink engine.", min: 0, step: 1 },
  { key: "streamRecordsPerSec", label: "Records per second per stream", unit: "records/s", hint: "A stream that expects more than this needs a Flink engine.", min: 100, step: 500 },
];

/** Limits brought inside the ceilings and above the floors. `clamped` names the settings that were changed. */
export function clampLimits(l: Partial<NativeLimits>): { limits: NativeLimits; clamped: string[] } {
  const out = { ...NATIVE_DEFAULTS, ...l }; const clamped: string[] = [];
  for (const f of NATIVE_FIELDS) {
    const raw = Math.round(Number(out[f.key]));
    const v = Number.isFinite(raw) ? Math.max(f.min, Math.min(NATIVE_CEILING[f.key], raw)) : NATIVE_DEFAULTS[f.key];
    if (v !== out[f.key]) clamped.push(f.label);
    out[f.key] = v;
  }
  return { limits: out, clamped };
}

export type NativeCheck = {
  verdict: "ok" | "throttled" | "refused";
  /** Threads that will really be used. */
  effectiveParallelism: number;
  peakMemoryMb: number;
  /** True when the run would wait for another native run to finish. */
  queued: boolean;
  reasons: string[];
  /** An engine to use instead when the native engine refuses. */
  alternative: Engine | null;
};
export type NativeRunRequest = { inputBytes: number; rows: number; parallelism: number; partitionMb: number; shuffleSteps: number; runningRuns?: number };

const MB = 1e6;
/** A partition needs about three times its size while it is decoded, changed and written. */
export const PARTITION_OVERHEAD = 3;
/** A step that needs all rows keeps them in memory, with some overhead. */
export const SHUFFLE_OVERHEAD = 1.5;

export function checkNativeRun(limits: NativeLimits, r: NativeRunRequest): NativeCheck {
  const reasons: string[] = []; const inputMb = r.inputBytes / MB; const inputGb = r.inputBytes / 1e9;
  const alt: Engine = r.shuffleSteps === 0 && inputGb <= 200 ? "single" : "spark";
  const refuse = (why: string, peak = 0): NativeCheck => ({ verdict: "refused", effectiveParallelism: 0, peakMemoryMb: peak, queued: false, reasons: [...reasons, why], alternative: alt });
  if (inputGb > limits.maxInputGb) return refuse(`The input is ${fmt(inputGb)} GB and the native engine reads at most ${limits.maxInputGb} GB per run.`);
  if (r.rows > limits.maxRows) return refuse(`The input has ${r.rows.toLocaleString("en-US")} rows and the native engine reads at most ${limits.maxRows.toLocaleString("en-US")} per run.`);
  const state = r.shuffleSteps > 0 ? inputMb * SHUFFLE_OVERHEAD : 0;
  if (state > limits.memoryMb) return refuse(`${r.shuffleSteps} step${r.shuffleSteps === 1 ? "" : "s"} need all rows at once, which takes about ${Math.round(state).toLocaleString("en-US")} MB. The memory budget is ${limits.memoryMb.toLocaleString("en-US")} MB.`, state);
  const perTask = r.partitionMb * PARTITION_OVERHEAD;
  const fit = Math.floor((limits.memoryMb - state) / perTask);
  if (fit < 1) return refuse(`One ${r.partitionMb} MB partition needs about ${Math.round(perTask)} MB. Choose a smaller partition size.`, state + perTask);
  const wanted = Math.max(1, Math.round(r.parallelism));
  const effective = Math.max(1, Math.min(wanted, limits.threads, fit));
  if (wanted > limits.threads) reasons.push(`Parallelism ${wanted} is above the limit of ${limits.threads} threads, so ${limits.threads} are used.`);
  if (effective < Math.min(wanted, limits.threads)) reasons.push(`Parallelism is lowered to ${effective} so that ${effective} partitions of ${r.partitionMb} MB${state ? " and the rows held by whole-column steps" : ""} stay inside the ${limits.memoryMb.toLocaleString("en-US")} MB memory budget.`);
  const queued = (r.runningRuns ?? 0) >= limits.concurrentRuns;
  if (queued) reasons.push(`${limits.concurrentRuns} native runs are already working. This run waits for one to finish.`);
  if (inputGb > 1) reasons.push("The native engine is the slowest choice for large inputs. It is the safest one, not the fastest.");
  return { verdict: effective < wanted ? "throttled" : "ok", effectiveParallelism: effective, peakMemoryMb: Math.round(state + effective * perTask), queued, reasons, alternative: null };
}

export function checkNativeStream(limits: NativeLimits, r: { expectedRecordsPerSec: number; runningStreams: number }): NativeCheck {
  const reasons: string[] = [];
  const bad = (why: string): NativeCheck => ({ verdict: "refused", effectiveParallelism: 0, peakMemoryMb: 0, queued: false, reasons: [why], alternative: "flink" });
  if (limits.streams < 1) return bad("Streams are turned off on the native engine.");
  if (r.runningStreams >= limits.streams) return bad(`${limits.streams} stream${limits.streams === 1 ? " is" : "s are"} already running on the native engine, which is the limit.`);
  if (r.expectedRecordsPerSec > limits.streamRecordsPerSec) return bad(`${r.expectedRecordsPerSec.toLocaleString("en-US")} records per second is above the limit of ${limits.streamRecordsPerSec.toLocaleString("en-US")} for a native stream.`);
  reasons.push("The native engine keeps no state across restarts beyond the committed offsets, so a long window needs Flink.");
  return { verdict: "ok", effectiveParallelism: 1, peakMemoryMb: 0, queued: false, reasons, alternative: null };
}
const fmt = (n: number) => (n < 10 ? n.toFixed(1) : String(Math.round(n)));

export type EngineInfo = { id: Engine; label: string; short: string; where: string; bestFor: string; limit: string; speed: string };
export const ENGINES: EngineInfo[] = [
  { id: "native", label: "Native engine", short: "Runs inside the tok∑ner backend on virtual threads. Nothing to install.", where: "tok∑ner backend", bestFor: "Small and medium inputs, trying a recipe, and teams that run no cluster.", limit: "Bounded by limits you can lower but not raise past the platform ceilings.", speed: "Slowest on large inputs. The safest default." },
  { id: "single", label: "Single node runner", short: "One large worker that you host, using Polars and DuckDB.", where: "Your VM, container or Kubernetes", bestFor: "Inputs up to a few hundred GB with steps that work row by row.", limit: "Bounded by the memory of one machine.", speed: "Fast on one machine." },
  { id: "spark", label: "Apache Spark", short: "Many workers that split the data and move it between them.", where: "Your Kubernetes cluster", bestFor: "Very large inputs and steps that need all rows, such as joins and global sorts.", limit: "Bounded by the cluster.", speed: "Built for scale. Has start up cost on small inputs." },
  { id: "flink", label: "Apache Flink", short: "Continuous processing with state and exactly once delivery. Runs on tok∑ner runners or on a cluster you already operate.", where: "Your cluster, in the cloud or on your own machine", bestFor: "Streams, and batch work where you already run Flink.", limit: "Bounded by the cluster.", speed: "Built for continuous work." },
];
export const ENGINE_LABEL: Record<Engine, string> = { native: "Native engine", single: "Single node", spark: "Spark", flink: "Flink" };

/** What suits an input among all four engines. The native engine comes first whenever its limits allow the run. */
export function suggestEngine(limits: NativeLimits, r: NativeRunRequest, workerMemGb = 16): { engine: Engine; because: string } {
  const c = checkNativeRun(limits, r);
  if (c.verdict !== "refused") return { engine: "native", because: `The input is within the native engine limits (${fmt(r.inputBytes / 1e9)} GB of ${limits.maxInputGb} GB). It needs no cluster. Choose a runner engine if the run is too slow.` };
  return { engine: c.alternative ?? "spark", because: c.reasons[c.reasons.length - 1] };
}
