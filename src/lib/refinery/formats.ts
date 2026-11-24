import type { Engine, FileFormat } from "./types";

/**
 * Guidance on file formats and engines. These are rules of thumb written down so the console can explain a default, not measurements.
 * Anything that is not already columnar is converted once to Parquet in a staging area before the recipe runs (docs/46, Formats and conversion).
 */
export type FormatGuide = { id: FileFormat; label: string; bestFor: string; why: string; watch: string };
export const FORMAT_GUIDE: FormatGuide[] = [
  { id: "parquet", label: "Parquet", bestFor: "Tabular training data, features and anything read at scale", why: "Columnar, typed and compressed. Many workers read different parts at once, and each reads only the columns it needs.", watch: "Not readable by eye. Most fine tuning services want JSON Lines instead." },
  { id: "jsonl", label: "JSON Lines", bestFor: "Fine tuning language models (chat, instruction, completion) and document corpora", why: "One record per line, easy to split into shards and to stream. It is the format training services accept most often.", watch: "Larger and slower to read than Parquet, and carries no column types." },
  { id: "csv", label: "CSV", bestFor: "Handing a small table to a person or an older tool", why: "Opens everywhere.", watch: "No types, awkward with line breaks inside text, and slow at scale. Avoid for training data." },
  { id: "delta", label: "Delta Lake", bestFor: "A table in object storage that several jobs read and update, with history", why: "Parquet files plus a transaction log, so readers never see half a write, a table can be updated by key, and an earlier version can be read back.", watch: "Needs a writer that supports it on your storage. Concurrent writers to the same table need care on object storage." },
  { id: "iceberg", label: "Apache Iceberg", bestFor: "A table shared across engines (Spark, Trino, Flink, Snowflake) through a catalog", why: "Parquet files plus table metadata kept in a catalog, with hidden partitioning, schema changes and snapshots.", watch: "Needs a catalog (REST, Glue, Hive or a path-based one) that every reader can reach." },
  { id: "table", label: "A table", bestFor: "Keeping cleaned data next to the rest of your warehouse or database", why: "Queryable and governed where it already lives.", watch: "Slower to hand to a training job than files in object storage." },
];

export type Goal = "tabular" | "llm-finetune" | "retrieval" | "interchange";
export function recommendFormat(goal: Goal): { format: FileFormat; because: string } {
  switch (goal) {
    case "llm-finetune": return { format: "jsonl", because: "Chat and instruction fine tuning expects one JSON record per line." };
    case "retrieval": return { format: "jsonl", because: "Chunked text with its metadata is easiest to load into an index as JSON Lines." };
    case "interchange": return { format: "csv", because: "A small table for a person or a spreadsheet." };
    default: return { format: "parquet", because: "Typed, compressed and splittable, so training jobs can read it in parallel." };
  }
}

/** Open table formats: a directory of Parquet files with a log or metadata, not a single file. */
export function isLakeFormat(f: FileFormat): boolean { return f === "delta" || f === "iceberg"; }

/** Formats that are not columnar are converted to Parquet once, in staging, so every later stage reads the same fast layout. */
export function needsConversion(f: FileFormat): boolean { return f === "csv" || f === "tsv" || f === "json" || f === "jsonl" || f === "xlsx" || f === "documents"; }
export function conversionNote(f: FileFormat): string | null {
  if (f === "documents") return "Documents are read page by page, text is extracted (with OCR for scans) and written to Parquet as one row per page before the recipe starts.";
  if (needsConversion(f)) return `${f.toUpperCase()} input is converted once to Parquet in staging, so the steps and every later run read a typed, splittable copy.`;
  return null;
}

const GB = 1e9;
/** A rule of thumb for which engine suits a dataset. Not a benchmark: the right answer depends on the steps, the data and the machine. */
export function recommendEngine(sizeBytes: number, shuffleSteps: number, workerMemGb: number): { engine: Engine; because: string } {
  const gb = sizeBytes / GB;
  if (gb <= Math.max(10, workerMemGb * 0.5)) return { engine: "single", because: `${gb < 1 ? "Under 1" : Math.round(gb)} GB fits one worker. A single node avoids the cost of moving data between machines.` };
  if (gb <= 200 && shuffleSteps === 0) return { engine: "single", because: "No step needs all rows at once, so one large worker can stream through it. Use Spark if the run is too slow." };
  return { engine: "spark", because: `${Math.round(gb)} GB${shuffleSteps ? ` with ${shuffleSteps} step${shuffleSteps === 1 ? "" : "s"} that need all rows` : ""} is better spread over many workers, with data moved between them where a step needs it.` };
}
