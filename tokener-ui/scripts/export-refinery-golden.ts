/**
 * Writes the expected output of the console's Refinery logic for fixed inputs, so the Java ports can be compared with it case by case
 * (RefineryGoldenCheck): native engine limits and planner, the step catalogue, every step on real sample rows, and unified datasets.
 * From the repository root: bash scripts/refinery_golden.sh
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname } from "node:path";
import { NATIVE_FIELDS, NATIVE_CEILING, NATIVE_DEFAULTS, checkNativeRun, checkNativeStream, clampLimits, suggestEngine } from "../src/lib/refinery/engines";
import { STEPS, applyStep, startFrame } from "../src/lib/refinery/steps";
import { FUNCTIONS } from "../src/lib/refinery/catalog";
import { parseTabular, profileRows } from "../src/lib/refinery/profile";
import { CONNECTORS } from "../src/lib/refinery/connectors";
import { sampleDatasets } from "../src/lib/refinery/sample";
import { addSource, emptyModel, modelSql, newJoin, runModel, setAllColumns, updateColumn, validateModel } from "../src/lib/refinery/model";
import type { Connection, Dataset, Recipe, RunnerPool, Step } from "../src/lib/refinery/types";
import { checkRecipe, looksPrivate, placeOfConnection, placeOfPool, placeOfRegion, placeOfText, runBlock, type Policy } from "../src/lib/refinery/sovereignty";

const out = "../tokener-refinery/src/test/resources/io/tokener/refinery/golden/refinery.json.gz";
const DS = Object.fromEntries(sampleDatasets().map((d) => [d.id, d]));

// ---- limits and planner
const clamps = [{}, { threads: 1000, memoryMb: 100, maxInputGb: 0, streams: -3 }, { threads: 99.6, concurrentRuns: 7.4, maxRows: 5e9 }, { memoryMb: 1024, maxRunMinutes: 500, streamRecordsPerSec: 50 }]
  .map((req) => { const c = clampLimits(req as never); return { request: req, limits: c.limits, clamped: c.clamped }; });
const runs: unknown[] = [];
for (const inputBytes of [2e6, 8e8, 3e9, 6e9, 4e10, 3e11]) for (const rows of [1e5, 6e7]) for (const parallelism of [1, 16, 400]) for (const partitionMb of [32, 256, 2000]) for (const shuffleSteps of [0, 2]) for (const runningRuns of [0, 3]) for (const lim of [NATIVE_DEFAULTS, { ...NATIVE_DEFAULTS, memoryMb: 1024, threads: 8 }]) {
  const req = { inputBytes, rows, parallelism, partitionMb, shuffleSteps, runningRuns };
  const c = checkNativeRun(lim, req); const s = suggestEngine(lim, req);
  runs.push({ limits: lim, request: req, check: c, suggest: s });
}
const streams: unknown[] = [];
for (const lim of [NATIVE_DEFAULTS, { ...NATIVE_DEFAULTS, streams: 0 }]) for (const rate of [100, 5000, 5001, 90000]) for (const running of [0, 4, 5]) streams.push({ limits: lim, request: { expectedRecordsPerSec: rate, runningStreams: running }, check: checkNativeStream(lim, { expectedRecordsPerSec: rate, runningStreams: running }) });

// ---- the step catalogue
const catalogue = STEPS.map((s) => ({ op: s.op, group: s.group, streamable: s.streamable, ai: !!s.ai, remote: !!s.remote, params: s.params.map((p) => ({ key: p.key, label: p.label, kind: p.kind, optional: !!p.optional })) }));

// ---- steps on sample rows
type Case = { ds: string; step: Omit<Step, "id"> & { id?: string }; rows?: number };
const S = (op: string, params: Record<string, unknown>) => ({ op, params }) as never;
const cases: Case[] = [
  { ds: "ds_support_raw", step: S("trim", { columns: ["subject"], collapse: true }) }, { ds: "ds_support_raw", step: S("trim", { columns: [], collapse: false }) },
  { ds: "ds_support_raw", step: S("case", { columns: ["channel"], mode: "lower" }) }, { ds: "ds_support_raw", step: S("case", { columns: ["channel", "priority"], mode: "title" }) }, { ds: "ds_support_raw", step: S("case", { columns: ["channel"], mode: "upper" }) },
  { ds: "ds_support_raw", step: S("replace", { columns: ["subject"], find: "Refund", with: "Return" }) },
  { ds: "ds_support_raw", step: S("regex_replace", { columns: ["body"], pattern: "\\d{3,}", with: "#" }) }, { ds: "ds_support_raw", step: S("regex_replace", { columns: ["body"], pattern: "(\\w+)@(\\w+)", with: "$2 at $1 ($&) $$" }) },
  { ds: "ds_support_raw", step: S("regex_replace", { columns: ["body"], pattern: "(", with: "x" }) },
  { ds: "ds_support_raw", step: S("fill_missing", { column: "priority", strategy: "constant", value: "normal" }) }, { ds: "ds_support_raw", step: S("fill_missing", { column: "csat", strategy: "constant", value: "3" }) },
  { ds: "ds_support_raw", step: S("fill_missing", { column: "csat", strategy: "mean" }) }, { ds: "ds_support_raw", step: S("fill_missing", { column: "csat", strategy: "median" }) }, { ds: "ds_support_raw", step: S("fill_missing", { column: "channel", strategy: "mode" }) },
  { ds: "ds_support_raw", step: S("fill_missing", { column: "channel", strategy: "mean" }) }, { ds: "ds_support_raw", step: S("fill_missing", { column: "priority", strategy: "constant", value: "" }) },
  { ds: "ds_support_raw", step: S("drop_missing", { columns: ["csat"] }) },
  { ds: "ds_support_raw", step: S("cast", { column: "csat", to: "string" }) }, { ds: "ds_support_raw", step: S("cast", { column: "resolution_minutes", to: "decimal" }) }, { ds: "ds_support_raw", step: S("cast", { column: "created_at", to: "integer" }) },
  { ds: "ds_orders", step: S("cast", { column: "status", to: "boolean" }) }, { ds: "ds_orders", step: S("cast", { column: "amount", to: "integer" }) },
  { ds: "ds_support_raw", step: S("rename", { column: "csat", to: "satisfaction" }) }, { ds: "ds_support_raw", step: S("rename", { column: "csat", to: "priority" }) },
  { ds: "ds_support_raw", step: S("drop_columns", { columns: ["body", "channel"] }) },
  { ds: "ds_support_raw", step: S("filter", { column: "priority", cmp: "eq", value: " HIGH " }) }, { ds: "ds_support_raw", step: S("filter", { column: "priority", cmp: "ne", value: "normal" }) },
  { ds: "ds_support_raw", step: S("filter", { column: "subject", cmp: "contains", value: "refund" }) }, { ds: "ds_support_raw", step: S("filter", { column: "csat", cmp: "gt", value: "3" }) },
  { ds: "ds_support_raw", step: S("filter", { column: "csat", cmp: "lt", value: "abc" }) }, { ds: "ds_support_raw", step: S("filter", { column: "csat", cmp: "not_empty", value: "" }) }, { ds: "ds_support_raw", step: S("filter", { column: "csat", cmp: "is_empty", value: "" }) },
  { ds: "ds_support_raw", step: S("drop_duplicates", { keys: ["ticket_id"], keep: "last" }) }, { ds: "ds_customers_crm", step: S("drop_duplicates", { keys: ["email"], keep: "first" }) }, { ds: "ds_customers_crm", step: S("drop_duplicates", { keys: [], keep: "first" }) },
  { ds: "ds_support_raw", step: S("validate", { column: "resolution_minutes", rule: "range", min: 0, max: 2000 }) }, { ds: "ds_support_raw", step: S("validate", { column: "csat", rule: "not_empty" }) },
  { ds: "ds_support_raw", step: S("validate", { column: "subject", rule: "length", min: 5, max: 20 }) }, { ds: "ds_customers_crm", step: S("validate", { column: "email", rule: "pattern", pattern: "^[^@\\s]+@[^@\\s]+\\.[a-z]{2,}$" }) },
  { ds: "ds_support_raw", step: S("clip_outliers", { column: "resolution_minutes" }) }, { ds: "ds_orders", step: S("clip_outliers", { column: "amount" }) },
  { ds: "ds_orders", step: S("scale", { column: "amount", method: "minmax" }) }, { ds: "ds_orders", step: S("scale", { column: "amount", method: "standard" }) },
  { ds: "ds_support_raw", step: S("pii_mask", { columns: ["body"], style: "token" }) }, { ds: "ds_support_raw", step: S("pii_mask", { columns: ["body", "customer_email"], style: "stars" }) }, { ds: "ds_support_raw", step: S("pii_mask", { columns: ["body"], style: "hash" }) },
  { ds: "ds_reviews_q3", step: S("pii_mask", { columns: ["review_text"], style: "token" }) },
  { ds: "ds_support_raw", step: S("split", { train: 80, validation: 10, test: 10, seed: 42 }) }, { ds: "ds_support_raw", step: S("split", { train: 70, validation: 20, test: 10, seed: 7 }) }, { ds: "ds_support_raw", step: S("split", { train: 50, validation: 20, test: 10, seed: 7 }) },
  { ds: "ds_support_raw", step: S("ai_classify", { column: "body", into: "topic", labels: "a\nb", model: "alias:fast-classifier", maxCost: 5 }) },
  { ds: "ds_support_raw", step: S("ai_extract", { column: "body", fields: "order_id\namount", model: "alias:fast-classifier", maxCost: 5 }) },
  { ds: "ds_orders", step: S("one_hot", { column: "status", maxCategories: 3, dropOriginal: true }) }, { ds: "ds_orders", step: S("one_hot", { column: "country", maxCategories: 12, dropOriginal: false }) },
  { ds: "ds_orders", step: S("bucket", { column: "amount", edges: "50, 100, 250", into: "" }) },
  { ds: "ds_orders", step: S("date_parts", { column: "created_at", parts: ["year", "month", "day", "weekday", "quarter", "week"] }) },
  { ds: "ds_reviews_q3", step: S("text_stats", { column: "review_text" }) }, { ds: "ds_orders", step: S("label_encode", { column: "country", into: "" }) },
  { ds: "ds_orders", step: S("derive", { left: "amount", operation: "log1p", right: "", into: "amount_log" }) }, { ds: "ds_support_raw", step: S("derive", { left: "resolution_minutes", operation: "ratio", right: "csat", into: "per_csat" }) },
  { ds: "ds_support_raw", step: S("derive", { left: "resolution_minutes", operation: "difference", right: "csat", into: "d" }) },
  { ds: "ds_orders", step: S("hash_feature", { column: "customer_email", buckets: 16 }) },
  { ds: "ds_contract_pages", step: S("normalize_text", { columns: ["text"], unicode: true, controls: true, quotes: true, hyphens: true, spaces: true }) },
  { ds: "ds_contract_pages", step: S("strip_boilerplate", { column: "text", minShare: 30, pageNumbers: true }) },
  { ds: "ds_contract_pages", step: S("chunk_text", { column: "text", tokens: 60, overlap: 10 }) }, { ds: "ds_contract_pages", step: S("near_dedupe", { column: "text", threshold: 0.8 }) },
  { ds: "ds_support_raw", step: S("to_chat", { system: "You help.", userColumn: "subject", assistantColumn: "body", into: "messages" }) },
  { ds: "ds_support_raw", step: S("ai_transform", { column: "body", instruction: "fix", into: "rewritten", model: "alias:fast-classifier", maxCost: 5 }) },
  { ds: "ds_support_raw", step: S("function", { function: FUNCTIONS[0].id, columns: ["body"], into: "fn_result", batchSize: 50, onError: "null" }) },
  { ds: "ds_support_raw", step: S("connector_lookup", { connection: "c", source: "t", key: "customer_email", remoteKey: "email", fields: "plan\nregion", onMiss: "null" }) },
  { ds: "ds_support_raw", step: S("trim", { columns: ["nope"] }) }, { ds: "ds_support_raw", step: S("case", { columns: [], mode: "lower" }) }, { ds: "ds_support_raw", step: S("nonsense", {}) },
];
const stepCases = cases.map((c) => {
  const d = DS[c.ds]; const f = startFrame(d.columns.map((x) => ({ name: x.name, type: x.type })), d.sample);
  const step = { id: "s", ...c.step } as Step; const r = applyStep(f, step);
  return { dataset: c.ds, step, columns: r.frame.columns, rows: r.frame.rows, idx: r.frame.idx, result: r.result };
});


// ---- reading files and profiling
const files: [string, string][] = [
  ["a.csv", 'id,name,note\r\n1,"Smith, Ann","said ""hi"""\r\n2,Bob,"line1\nline2"\r\n\r\n3,Cy,\r\n'], ["b.csv", "a;b;c\n1;2;3\n4;5;6\n"], ["c.tsv", "a\tb\n1\t2\n3\t4\n"], ["d.csv", "a,a,\n1,2,3\n"],
  ["e.csv", "id,email,score,when,flag\n1,a@x.com,4.5,2026-01-01,yes\n2,b@y.org,,2026-01-02,no\n3,a@x.com,5,2026-01-03,true\n"], ["f.json", '[{"a":1,"b":"x","c":{"k":1}},{"a":2,"b":null,"d":[1,2]}]'],
  ["g.jsonl", '{"a":1,"b":"x"}\n{"a":2,"b":null}\n'], ["h.json", '{"data":[{"x":1.5},{"x":2}]}'], ["i.csv", "a,b\n x ,1\n"], ["j.json", "{oops"], ["k.parquet", "x"], ["l.csv", "a,b\n"],
  ["m.csv", "user_id,amount\n" + Array.from({ length: 30 }, (_, i) => `${i + 1},${i % 3 ? "12.5" : "x"}`).join("\n") + "\n"],
];
const parses = files.map(([name, text]) => { try { const r = parseTabular(name, text); return { name, text, ok: true, format: r.format, delimiter: r.delimiter ?? null, columns: r.columns, rows: r.rows, readRows: r.readRows, truncated: r.truncated }; } catch (e) { return { name, text, ok: false, message: (e as Error).message }; } });
const profiles = sampleDatasets().map((d) => ({ dataset: d.id, profile: profileRows(d.columns, d.sample, d.totalRows) }));

// ---- unified datasets
const sup = DS.ds_support_raw, crm = DS.ds_customers_crm, ord = DS.ds_orders;
const all = [sup, crm, ord];
let m1 = addSource(addSource(emptyModel(), ord), crm);
m1 = { ...m1, joins: [newJoin("o", "customer_email", "c", "email", "left", true)] };
m1 = setAllColumns(setAllColumns(m1, "o", ord, true), "c", crm, false);
m1 = { ...m1, columns: [...m1.columns, ...crm.columns.filter((c) => ["full_name", "plan", "mrr"].includes(c.name)).map((c) => ({ id: `c.${c.name}`, alias: "c", column: c.name, as: c.name, type: c.type, clean: c.name === "full_name" ? "trim" as const : "none" as const }))] };
m1 = updateColumn(m1, "o.customer_email", { clean: "lower", as: "email" });
const models = [m1, { ...m1, joins: m1.joins.map((j) => ({ ...j, type: "inner" as const })) }, { ...m1, joins: m1.joins.map((j) => ({ ...j, type: "full" as const })), dropDuplicates: true }, { ...m1, joins: m1.joins.map((j) => ({ ...j, normalise: false })) }, { ...m1, joins: [] }, emptyModel()]
  .map((spec) => { const v = validateModel(spec, all, "unified_orders"); const r = runModel(spec, all); return { spec, datasets: ["ds_orders", "ds_customers_crm"], validation: v, result: { columns: r.columns, rows: r.rows.slice(0, 40), rowCount: r.rows.length, stats: r.stats, estRows: r.estRows, capped: r.capped }, sql: modelSql(spec, all, () => "") }; });

// ---- data location: the place judgement the server enforces when a run starts
const regionNames = ["eu-west-1", "eu-west-2", "eu-central-1", "eu-central-2", "eu-north-1", "europe-west1", "europe-west2", "europe-west6", "westeurope", "northeurope", "francecentral", "switzerlandnorth", "norwayeast", "uksouth", "us-east-1", "us-west-2", "us-gov-west-1", "eastus", "eastus2", "westus3", "centralus", "ca-central-1", "sa-east-1", "brazilsouth", "northamerica-northeast1", "ap-southeast-1", "ap-south-1", "australiaeast", "japaneast", "southeastasia", "centralindia", "me-south-1", "me-central-1", "uaenorth", "qatarcentral", "me-west1", "il-central-1", "af-south-1", "southafricanorth", "mars-1", "", "EU-WEST-1", " us-east-2 "];
const textSamples = ["Europe (managed)", "On premises", "on-prem datacentre", "Your own premises", "private cloud", "eu-west-1 (customer cluster)", "United Kingdom", "UK", "United States", "USA", "us", "Frankfurt", "Doha", "Gulf", "Qatar Central", "xy12345.eu-central-1", "xy12345.us-east-1.snowflakecomputing.com", "my-bucket.s3.eu-west-3.amazonaws.com", "kafka.europe-west1.gcp.confluent.cloud", "eu", "Europa", "hosted in the eu region", "customer premises", "https://example.com"];
const hostSamples = ["db.corp.internal", "db.internal", "kafka.lan", "printer.local", "x.intranet", "router.home.arpa", "localhost", "10.0.0.5", "10.255.1.1", "192.168.1.20", "172.16.0.9", "172.31.9.9", "172.32.0.1", "172.15.0.1", "11.0.0.1", "https://minio.lan:9000", "http://10.1.1.1:9000/path", "a.corp.example.com", "db.prod.example.com", "b-1.prod:9096", "internal.example.com", "mylocal.com", ""];
const cn = (id: string, settings: Record<string, string>, connector = "s3"): Connection => ({ id, name: id, connector, auth: "x", settings, secretRefs: {}, pool: "p", state: "untested", createdAt: "", createdBy: "" });
const conns: Connection[] = [
  cn("c_eu", { bucket: "b", region: "eu-west-1" }), cn("c_us", { bucket: "b", region: "us-east-1" }), cn("c_uk", { bucket: "b", region: "eu-west-2" }), cn("c_gulf", { bucket: "b", region: "me-south-1" }), cn("c_ch", { bucket: "b", region: "eu-central-2" }),
  cn("c_kafka", { brokers: "b-1.prod:9096", protocol: "SASL_SSL" }, "kafka"), cn("c_priv", { host: "db.corp.internal", port: "5432" }, "postgres"), cn("c_priv_ips", { brokers: "10.0.0.5:9092,10.0.0.6:9092" }, "kafka"),
  cn("c_mixed", { brokers: "10.0.0.5:9092,kafka.eu-west-1.example.com:9092" }, "kafka"), cn("c_snow_eu", { account: "xy12345.eu-central-1" }, "snowflake"), cn("c_snow_us", { account: "xy12345.us-east-1" }, "snowflake"),
  cn("c_minio", { endpoint: "https://minio.lan:9000", region: "us-east-1", bucket: "b" }), cn("c_azure", { location: "westeurope" }, "azure"), cn("c_text", { location: "Europe (managed)" }, "azure"), cn("c_bare", {}, "postgres"),
];
const pn = (id: string, region: string, extra: Partial<RunnerPool> = {}): RunnerPool => ({ id, name: id, hosting: "kubernetes", engine: "spark", region, workersMin: 1, workersMax: 4, workers: 2, coresPerWorker: 4, memGbPerWorker: 16, concurrency: 2, running: 0, queued: 0, cpuPct: 0, memPct: 0, status: "healthy", version: "", lastSeen: "", network: "private", createdAt: "", createdBy: "", ...extra }) as unknown as RunnerPool;
const pools: RunnerPool[] = [
  pn("p_native", "", { builtIn: true, engine: "native" as never, hosting: "managed" as never }), pn("p_eu", "eu-west-1"), pn("p_us", "us-east-1"), pn("p_frank", "Frankfurt"), pn("p_txt", "Europe (managed)"),
  pn("p_flink_onprem", "", { engine: "flink" as never, flink: { location: "onprem", deploy: "session", restUrl: "https://flink.corp:8081", auth: "none", secretRefs: {} } as never }), pn("p_flink_local", "", { engine: "flink" as never, flink: { location: "local", deploy: "session", restUrl: "http://localhost:8081", auth: "none", secretRefs: {} } as never }),
  pn("p_flink_cloud", "us-east-1", { engine: "flink" as never, flink: { location: "cloud", deploy: "session", restUrl: "https://flink.example.com", auth: "none", secretRefs: {} } as never }),
];
const dsBase = { description: "", format: "csv", version: 1, updatedAt: "", owner: "", totalRows: 1, sizeBytes: 1, sample: [], columns: [], profile: {} } as unknown as Dataset;
const mkDs = (id: string, source: unknown): Dataset => ({ ...dsBase, id, name: id, source } as Dataset);
const dsets: Dataset[] = [mkDs("d_up", { kind: "upload", fileName: "a.csv" }), mkDs("d_model", { kind: "model" }), mkDs("d_gone", { kind: "connection", connectionId: "c_removed", location: "t" }), mkDs("d_docs", { kind: "documents" }),
  ...conns.flatMap((c) => [mkDs(`d_conn_${c.id}`, { kind: "connection", connectionId: c.id, location: "t" }), mkDs(`d_query_${c.id}`, { kind: "query", connectionId: c.id, sql: "select 1" })])];
const pol = (o: Partial<Policy>): Policy => ({ enabled: true, enforce: true, allowed: ["eu"], modelSteps: "allow", modelPlace: "unknown", platformPlace: "unknown", places: {}, ...o });
const policies: Policy[] = [
  pol({}), pol({ allowed: ["eu", "onprem"], platformPlace: "eu", modelPlace: "eu" }), pol({ allowed: ["eu", "uk"], platformPlace: "eu", modelSteps: "block" }), pol({ allowed: ["gulf"], platformPlace: "gulf", modelPlace: "us" }),
  pol({ allowed: ["eu"], platformPlace: "eu", places: { "conn:c_us": "eu", "conn:c_kafka": "us", "pool:p_us": "eu", "conn:c_priv": "unknown", "pool:p_eu": "us" } }), pol({ enforce: false, allowed: ["onprem"] }), pol({ enabled: false, enforce: false }),
];
const aiStep = { id: "a", op: "ai_classify", params: { column: "body", into: "topic", labels: "a\nb", model: "alias:fast-classifier", maxCost: 5 } } as unknown as Step;
const plain = { id: "t", op: "trim", params: { columns: ["x"], collapse: false } } as unknown as Step;
const rcp = (input: string, pool: string, outputs: Recipe["outputs"], steps: Step[]): Recipe => ({ id: "r", name: "pipeline", description: "", inputDatasetId: input, steps, outputs, pool, parallelism: 1, partitionTargetMb: 64, version: 1, updatedAt: "", updatedBy: "" }) as Recipe;
const out0 = [{ name: "o", kind: "dataset", target: "o", format: "csv" }] as Recipe["outputs"];
const locRecipes: Recipe[] = [];
for (const d of dsets) locRecipes.push(rcp(d.id, "p_native", out0, [plain]));
for (const c of conns) { locRecipes.push(rcp("d_up", "p_native", [{ name: "out", kind: "files", target: `${c.name} / out/`, format: "jsonl" }] as Recipe["outputs"], [plain])); locRecipes.push(rcp("d_up", "p_native", [{ name: "a", kind: "dataset", target: "a", format: "csv" }, { name: "b", kind: "files", target: `${c.name} / b/`, format: "csv" }] as Recipe["outputs"], [plain])); }
locRecipes.push(rcp("d_up", "p_native", [{ name: "out", kind: "files", target: "nowhere / out/", format: "csv" }] as Recipe["outputs"], [plain]));
for (const p of pools) locRecipes.push(rcp("d_up", p.name, out0, [plain]));
locRecipes.push(rcp("d_up", "no-such-pool", out0, [plain]));
for (const p of pools) locRecipes.push(rcp("d_up", p.name, out0, [plain, aiStep]));
locRecipes.push(rcp("d_conn_c_us", "p_eu", [{ name: "o", kind: "files", target: "c_eu / o/", format: "csv" }] as Recipe["outputs"], [aiStep, aiStep]));
const sovereigntyCases = policies.flatMap((policy, pi) => locRecipes.map((recipe, ri) => {
  const c = checkRecipe(recipe, policy, dsets, conns, pools);
  return { policy: pi, recipe: ri, status: c.status, hops: c.hops.map((h) => ({ role: h.role, label: h.label, where: h.where, verdict: h.verdict })), reasons: c.reasons, ai: recipe.steps.some((s) => s.op === "ai_classify"), blocked: runBlock(c, policy) };
}));
const sovereignty = {
  regions: regionNames.map((name) => ({ name, place: placeOfRegion(name) })), texts: textSamples.map((text) => ({ text, place: placeOfText(text) })), hosts: hostSamples.map((host) => ({ host, private: looksPrivate(host) })),
  connections: conns, pools, datasets: dsets.map((d) => ({ id: d.id, name: d.name, source: d.source })), policies, recipes: locRecipes, cases: sovereigntyCases,
  judged: policies.flatMap((policy, pi) => [...conns.map((c) => ({ policy: pi, kind: "conn", id: c.id, where: placeOfConnection(c, policy.places[`conn:${c.id}`]).where })), ...pools.map((p) => ({ policy: pi, kind: "pool", id: p.id, where: placeOfPool(p, policy).where }))]),
};
console.log("data location cases", sovereigntyCases.length);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, gzipSync(JSON.stringify({ sovereignty, ceiling: NATIVE_CEILING, defaults: NATIVE_DEFAULTS, fields: NATIVE_FIELDS.map((f) => ({ key: f.key, label: f.label, min: f.min })), clamps, runs, streams, catalogue, steps: stepCases, models, parses, profiles, datasets: Object.fromEntries(Object.entries(DS).map(([k, d]) => [k, { id: d.id, name: d.name, totalRows: d.totalRows, columns: d.columns.map((c) => ({ name: c.name, type: c.type, role: c.role })), sample: d.sample }])) })));
console.log("wrote", out, "runs", runs.length, "steps", stepCases.length, "models", models.length);

// ---- the connector catalogue the backend validates connections against (main resources, not test resources)
const catalogOut = "../tokener-refinery/src/main/resources/io/tokener/refinery/connectors.json";
const fieldOf = (f: { key: string; label: string; kind: string; options?: string[]; optional?: boolean; def?: string }) => ({ key: f.key, label: f.label, kind: f.kind, ...(f.options ? { options: f.options } : {}), optional: !!f.optional, ...(f.def !== undefined ? { def: f.def } : {}) });
mkdirSync(dirname(catalogOut), { recursive: true });
writeFileSync(catalogOut, JSON.stringify({ connectors: CONNECTORS.map((c) => ({ id: c.id, name: c.name, group: c.group, can: c.can, settings: c.settings.map(fieldOf), auth: c.auth.map((a) => ({ id: a.id, label: a.label, identity: !!a.identity, fields: a.fields.map(fieldOf) })), ...(c.messaging ? { messaging: { family: c.messaging.family, unit: c.messaging.unit, replay: c.messaging.replay, exactlyOnce: c.messaging.exactlyOnce } } : {}) })) }, null, 1));
console.log("wrote", catalogOut, CONNECTORS.length, "connectors");
