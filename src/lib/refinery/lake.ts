/**
 * Open table format sinks. A recipe output of kind "files" can be written as a Delta Lake or Apache Iceberg table in object storage instead
 * of loose files. This module holds the write options, checks them against the columns the recipe produces, and writes the writer
 * configuration the runner will read.
 *
 * Scope today: the options, the checks and the configuration. The runner does not write these formats yet, so a recipe that uses one is
 * recorded and checked here and nothing has been written to a real Delta or Iceberg table.
 */
import type { LakeOptions, OutputSink } from "./types";

export const DEFAULT_LAKE: LakeOptions = { mode: "append", partitionBy: [], mergeKeys: [] };
export const WRITE_MODES: { id: LakeOptions["mode"]; label: string; blurb: string }[] = [
  { id: "append", label: "Append", blurb: "Adds the rows of each run. A re-run adds them again." },
  { id: "overwrite", label: "Replace", blurb: "Each run replaces the table with its own rows." },
  { id: "merge", label: "Update by key", blurb: "Rows with a matching key are updated, new keys are inserted. A re-run does not duplicate rows." },
];
export const CATALOGS: { id: NonNullable<LakeOptions["catalog"]>; label: string }[] = [
  { id: "rest", label: "REST catalog" }, { id: "glue", label: "AWS Glue" }, { id: "hive", label: "Hive metastore" }, { id: "hadoop", label: "Path based (no catalog service)" },
];

export type LakeFinding = { level: "error" | "warn"; text: string };

/** Checks a table sink against the column names the recipe produces. Pure: nothing is contacted. */
export function checkLake(sink: Pick<OutputSink, "format" | "lake" | "target">, columns: string[]): LakeFinding[] {
  const o = sink.lake ?? DEFAULT_LAKE; const out: LakeFinding[] = []; const has = new Set(columns);
  if (sink.format !== "delta" && sink.format !== "iceberg") return out;
  if (!sink.target.split(" / ").slice(1).join(" / ").trim()) out.push({ level: "error", text: "Give the table a path in the storage." });
  if (o.mode === "merge" && o.mergeKeys.length === 0) out.push({ level: "error", text: "Update by key needs at least one key column." });
  for (const k of o.mergeKeys) if (!has.has(k)) out.push({ level: "error", text: `Key column ${k} is not in the output.` });
  for (const k of o.partitionBy) if (!has.has(k)) out.push({ level: "error", text: `Partition column ${k} is not in the output.` });
  if (new Set(o.partitionBy).size !== o.partitionBy.length) out.push({ level: "error", text: "A partition column is listed twice." });
  if (o.partitionBy.length > 3) out.push({ level: "warn", text: "More than three partition columns usually makes many small files." });
  if (sink.format === "iceberg" && !o.catalog) out.push({ level: "error", text: "Iceberg tables are found through a catalog. Choose one." });
  if (sink.format === "delta" && o.mode === "merge") out.push({ level: "warn", text: "Update by key reads the table before writing. Do not run two pipelines against the same table at once unless your storage and writer support it." });
  return out;
}

/** The writer configuration for the runner. Credentials are never written here: the connection supplies them by reference. */
export function lakeWriterConfig(sink: OutputSink, connectionName: string): Record<string, unknown> {
  const o = sink.lake ?? DEFAULT_LAKE; const path = sink.target.split(" / ").slice(1).join(" / ");
  return {
    output: sink.name, format: sink.format, connection: connectionName, path,
    write: { mode: o.mode, partitionBy: o.partitionBy, ...(o.mode === "merge" ? { mergeKeys: o.mergeKeys } : {}) },
    ...(sink.format === "iceberg" ? { catalog: o.catalog } : {}),
    schema: { onNewColumns: "add", onTypeChange: "fail" },
    credentials: "from the connection reference",
  };
}
