/**
 * Checks the Refinery logic that runs in the browser: delimited text reading, type inference, profiling, the step engine, cost and partition planning,
 * the connector catalogue, and the sample store. No server is involved. From the repository root: bash scripts/refinery_core_check.sh
 */
import { parseDelimited, parseTabular, inferType, profileRows } from "../src/lib/refinery/profile";
import { STEPS, applyStep, runSteps, startFrame, validateStep, estimateAiStep, planPartitions, newStep } from "../src/lib/refinery/steps";
import { CONNECTORS, secretKeys, secretRefFor } from "../src/lib/refinery/connectors";
import { sampleDatasets, sampleRecipes, samplePools, sampleRuns, SAMPLE_TENANT, buildRun } from "../src/lib/refinery/sample";
import { EXTRA_OPS } from "../src/lib/refinery/ops-extra";
import { EXAMPLE_PROMPTS, proposeSteps, suggestFromProfile } from "../src/lib/refinery/assist";
import { recommendEngine, recommendFormat, needsConversion } from "../src/lib/refinery/formats";
import { NATIVE_CEILING, NATIVE_DEFAULTS, checkNativeRun, checkNativeStream, clampLimits, suggestEngine } from "../src/lib/refinery/engines";
import { addSource, emptyModel, modelSql, newJoin, runModel, setAllColumns, suggestJoins, toggleColumn, updateColumn, validateModel, removeSource } from "../src/lib/refinery/model";
import { addConnection, snapshot, testConnection, addPool, startRun, resetRefinery, cancelRun, addStream, addRecipe, setNativeLimits } from "../src/lib/refinery/store";

let fail = 0; const ok = (c: boolean, n: string) => { if (!c) fail++; console.log(c ? "ok  " : "FAIL", n); };

// delimited text
const p = parseDelimited('id,name,note\r\n1,"Smith, Ann","said ""hi"""\r\n2,Bob,"line1\nline2"\r\n\r\n3,Cy,\r\n');
ok(p.header.join("|") === "id|name|note" && p.rows.length === 3, "reads quoted fields, doubled quotes and blank lines");
ok(p.rows[0][1] === "Smith, Ann" && p.rows[0][2] === 'said "hi"' && p.rows[1][2] === "line1\nline2", "keeps embedded delimiters, quotes and line breaks");
ok(parseDelimited("a;b;c\n1;2;3\n4;5;6\n").delimiter === ";", "detects a semicolon delimiter");
ok(parseDelimited("a\tb\n1\t2\n").delimiter === "\t", "detects a tab delimiter");
ok(parseDelimited("a,a,\n1,2,3\n").header.join("|") === "a|a_2|column_3", "names blank and repeated headers");
ok(inferType(["1", "2", "3", "x"]) === "string" && inferType(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "x"]) === "integer", "a column keeps its numeric type when at least 95 percent of values fit");
ok(inferType(["2026-01-02", "2026-02-03"]) === "date" && inferType(["true", "no"]) === "boolean" && inferType(["1.5", "2"]) === "decimal", "infers date, boolean and decimal");
const up = parseTabular("t.csv", "id,email,score,when\n1,a@x.com,4.5,2026-01-01\n2,b@y.org,,2026-01-02\n3,a@x.com,5,2026-01-03\n");
ok(up.columns.map((c) => c.type).join(",") === "integer,string,decimal,date" && up.rows[1].score === null, "turns file text into typed rows with empty cells as null");
ok(up.columns[0].role === "identifier", "guesses an identifier column");
try { parseTabular("t.parquet", "x"); ok(false, "parquet is refused"); } catch (e: any) { ok(/Parquet and Excel are read on the runner/.test(e.message), "parquet is refused with the reason"); }
try { parseTabular("t.json", "{oops"); ok(false, "bad json is refused"); } catch (e: any) { ok(/not valid JSON/.test(e.message), "bad json is refused with a plain message"); }
ok(parseTabular("t.jsonl", '{"a":1,"b":"x"}\n{"a":2,"b":null}\n').rows.length === 2, "reads JSON Lines");

ok(parseTabular("s.csv", "a,b\n x ,1\n").rows[0].a === " x ", "text read from a file keeps its stray spaces");
// profile
const prof = profileRows(up.columns, up.rows, 3000);
const email = prof.columns.find((c) => c.name === "email")!;
ok(prof.totalRows === 3000 && prof.sampled === 3 && email.pattern === "email" && email.pii, "profile finds the email pattern and flags personal data");
ok(prof.columns.find((c) => c.name === "score")!.nullCount === 1 && prof.columns.find((c) => c.name === "score")!.mean === 4.75, "profile counts nulls and the mean of present numbers");
ok(prof.completeness < 100 && prof.quality > 0 && prof.quality <= 100, "quality score stays between 0 and 100");

// step engine on the sample
const ds = sampleDatasets()[0];
const f0 = startFrame(ds.columns, ds.sample);
const t = applyStep(f0, { id: "a", op: "trim", params: { columns: ["subject"], collapse: true } });
ok(t.result.changed > 0 && t.frame.rows.every((r) => r.subject === String(r.subject).trim()), "trim changes padded subjects and leaves none padded");
ok(f0.rows.some((r) => String(r.subject) !== String(r.subject).trim()), "a step never changes the frame it was given");
const c = applyStep(f0, { id: "b", op: "case", params: { columns: ["channel"], mode: "lower" } });
ok(new Set(c.frame.rows.map((r) => r.channel)).size < new Set(f0.rows.map((r) => r.channel)).size, "case folding merges channel spellings");
const d = applyStep(f0, { id: "c", op: "drop_duplicates", params: { keys: ["ticket_id"], keep: "last" } });
ok(d.result.rowsOut < d.result.rowsIn && new Set(d.frame.rows.map((r) => r.ticket_id)).size === d.frame.rows.length, "drop duplicates leaves one row per key");
const fm = applyStep(f0, { id: "d", op: "fill_missing", params: { column: "priority", strategy: "constant", value: "normal" } });
ok(fm.frame.rows.every((r) => r.priority !== null) && fm.result.changed > 0, "fill missing leaves no empty cell");
const ca = applyStep(f0, { id: "e", op: "cast", params: { column: "csat", to: "integer" } });
ok(ca.frame.rows.every((r) => r.csat === null || typeof r.csat === "number"), "cast turns N/A into an empty value");
const pm = applyStep(f0, { id: "f", op: "pii_mask", params: { columns: ["body"], style: "token" } });
ok(pm.frame.rows.every((r) => !/@/.test(String(r.body))) && pm.frame.rows.some((r) => /\[EMAIL\]/.test(String(r.body))) && pm.frame.rows.some((r) => /\[PHONE\]/.test(String(r.body))), "mask replaces emails and phone numbers inside text");
const va = applyStep(f0, { id: "g", op: "validate", params: { column: "resolution_minutes", rule: "range", min: 0, max: 2000 } });
ok(va.result.rejected > 0 && va.result.rowsOut === va.result.rowsIn - va.result.rejected && !!va.result.rejectReason, "validate rejects rows and says why");
const co = applyStep(f0, { id: "h", op: "clip_outliers", params: { column: "resolution_minutes" } });
ok(Math.max(...co.frame.rows.map((r) => Number(r.resolution_minutes))) < Math.max(...f0.rows.map((r) => Number(r.resolution_minutes))), "clip outliers lowers the largest value");
const sp = applyStep(f0, { id: "i", op: "split", params: { train: 80, validation: 10, test: 10, seed: 42 } });
const n = sp.frame.rows.length; const tr = sp.frame.rows.filter((r) => r._split === "train").length;
ok(tr / n > 0.74 && tr / n < 0.86, "split puts about 80 percent in train");
const sp2 = applyStep(f0, { id: "i", op: "split", params: { train: 80, validation: 10, test: 10, seed: 42 } });
ok(JSON.stringify(sp.frame.rows.map((r) => r._split)) === JSON.stringify(sp2.frame.rows.map((r) => r._split)), "split is repeatable for the same seed");
ok(validateStep({ id: "x", op: "split", params: { train: 80, validation: 10, test: 5, seed: 1 } }, f0.columns) === "The three percentages must add up to 100.", "split percentages must add up to 100");
ok(validateStep({ id: "x", op: "trim", params: { columns: ["nope"] } }, f0.columns)?.includes("does not exist") === true, "a missing column is reported");
ok(validateStep({ id: "x", op: "regex_replace", params: { columns: ["body"], pattern: "(" } }, f0.columns)?.includes("regular expression") === true, "a bad pattern is reported");
const ai = applyStep(f0, { id: "j", op: "ai_classify", params: { column: "body", into: "topic", labels: "a\nb", model: "alias:fast-classifier", maxCost: 10 } });
ok(ai.result.ai === true && ai.frame.columns.some((c) => c.name === "topic") && ai.frame.rows.every((r) => r.topic === null), "model steps add an empty column and are not run in the preview");

// whole recipes
const recipes = sampleRecipes();
for (const r of recipes) {
  const d2 = sampleDatasets().find((x) => x.id === r.inputDatasetId)!;
  const { results, frames } = runSteps(startFrame(d2.columns, d2.sample), r.steps);
  ok(results.every((x) => !x.error), `recipe ${r.name}: every step is valid on its dataset`);
  ok(frames[frames.length - 1].rows.length > 0, `recipe ${r.name}: leaves rows`);
}

// estimates and planning
const aiStep = recipes[0].steps.find((s) => s.op === "ai_classify")!;
const est = estimateAiStep(aiStep, ds.sample, ds.totalRows, ds.sample.length)!;
ok(est.costUsd > 0 && est.calls === ds.totalRows, "AI estimate scales the sample to the whole dataset");
const tight = estimateAiStep({ ...aiStep, params: { ...aiStep.params, maxCost: 1 } }, ds.sample, ds.totalRows, ds.sample.length)!;
ok(tight.overCap === true && est.overCap === false, "a run whose estimate passes the cap is flagged");
const plan = planPartitions(3_100_000_000, 4_812_330, 128, 24, 12, 8, 96);
ok(plan.partitions === 24 && plan.concurrent === 24 && plan.waves === 1, "plan: 3.1 GB at 128 MB is 24 partitions, all in one wave with 24 slots");
const plan2 = planPartitions(3_100_000_000, 4_812_330, 128, 8, 12, 8, 96);
ok(plan2.concurrent === 8 && plan2.waves === 3 && /parallelism/.test(plan2.note), "plan: lower parallelism makes waves and names the limit");
const plan3 = planPartitions(100_000_000, 1000, 128, 16, 2, 8, 16);
ok(plan3.partitions === 1 && plan3.concurrent === 1, "plan: a small file is one partition");

// connectors
ok(CONNECTORS.every((c) => c.auth.length > 0 && c.settings.length > 0), "every connector has settings and an authentication method");
ok(CONNECTORS.flatMap((c) => c.auth.flatMap((a) => a.fields.filter((f) => f.kind === "secret"))).length > 20, "secret fields are declared");
ok(new Set(CONNECTORS.map((c) => c.id)).size === CONNECTORS.length, "connector ids are unique");
ok(CONNECTORS.find((c) => c.id === "kafka")!.auth.map((a) => a.id).join() === "sasl-plain,sasl-scram,oauthbearer,mtls,msk-iam", "Kafka offers five authentication methods");
ok(secretRefFor(SAMPLE_TENANT, "My Kafka!", "password") === `secretref://vault/${SAMPLE_TENANT}/refinery/connections/my-kafka/password`, "secret references name the tenant and connection");

// store
resetRefinery();
const conn = addConnection({ name: "lake-2", connector: "s3", auth: "access-key", settings: { bucket: "b", region: "r" }, secrets: { secretAccessKey: "SUPERSECRET" }, pool: "managed-eu-1" });
ok(Object.values(conn.secretRefs).every((v) => v.startsWith("secretref://vault/")) && !JSON.stringify(snapshot()).includes("SUPERSECRET"), "a new connection keeps a reference and never the secret value");
const tr1 = testConnection(conn.id);
ok(tr1.ok, "a complete connection on an online pool passes the test");
const idConn = addConnection({ name: "lake-3", connector: "s3", auth: "iam-role", settings: { bucket: "b", region: "r" }, secrets: {}, pool: "managed-eu-1" });
const tr2 = testConnection(idConn.id);
ok(!tr2.ok && /customer-hosted pool/.test(tr2.steps.find((s) => !s.ok)!.detail), "an identity based method on a managed pool is refused with the reason");
const { pool, token } = addPool({ name: "gpu-batch", hosting: "kubernetes", engine: "spark", region: "x", workersMin: 2, workersMax: 8, coresPerWorker: 4, memGbPerWorker: 16, concurrency: 2, network: "n" });
ok(pool.status === "pending" && !!token && token.startsWith("rfn_enroll_"), "a customer-hosted pool starts pending with a one-time token");
ok(addPool({ name: "m2", hosting: "managed", engine: "single", region: "x", workersMin: 1, workersMax: 2, coresPerWorker: 4, memGbPerWorker: 8, concurrency: 1, network: "n" }).token === null, "a managed pool needs no token");
const run = startRun("rcp_reviews");
ok(snapshot().runs[0].id === run.id && (run.status === "planning" || run.status === "queued") && run.log[0].msg.startsWith("Simulated"), "a started run is recorded and labelled as simulated");
cancelRun(run.id);
ok(snapshot().runs[0].status === "cancelled", "a run can be cancelled");
const runs = sampleRuns(sampleDatasets(), recipes, samplePools());
ok(runs.filter((r) => r.status === "succeeded").every((r) => r.rowsOut + r.rowsRejected <= r.rowsIn + 1 && r.stages.every((s) => s.status === "done")), "finished sample runs account for their rows");
ok(runs.find((r) => r.status === "failed")!.error !== undefined, "the failed sample run states its cause");
ok(STEPS.every((s) => !!newStep(s.op, "x")), "every catalogued step can be created with defaults");

// feature engineering, documents, assistant, formats
{
  const cols = [{ name: "plan", type: "string", role: "feature" }, { name: "mrr", type: "decimal", role: "feature" }, { name: "country", type: "string", role: "feature" }, { name: "note", type: "string", role: "feature" }] as any;
  const rows: any[] = [{ plan: "pro", mrr: 50, country: "DE", note: "  Hello   World " }, { plan: "free", mrr: 0, country: "FR", note: "Hello World" }, { plan: "pro", mrr: 700, country: "DE", note: "Hello  World!" }];
  const run1 = (op: string, params: any) => { const x = runSteps(startFrame(cols, rows), [{ id: "s1", op, params }] as any); return { ...x, frame: x.frames[x.frames.length - 1] }; };
  const oh = run1("one_hot", { column: "plan", drop: false });
  ok(oh.frame.columns.some((c: any) => c.name === "plan_pro") && oh.frame.rows[0].plan_pro === 1 && oh.frame.rows[1].plan_pro === 0, "one hot adds an indicator column per value");
  const bk = run1("bucket", { column: "mrr", edges: "1, 100, 500" });
  ok(bk.frame.rows.length === 3 && Object.values(bk.frame.rows[2]).length > 4, "bucket adds a bucket column");
  const le = run1("label_encode", { column: "country" });
  ok(le.frame.rows[0].country_code !== undefined && le.frame.rows[0].country_code === le.frame.rows[2].country_code, "label encode gives the same value the same code");
  const ts = run1("text_stats", { column: "note" });
  ok(ts.frame.columns.length > cols.length, "text stats adds columns");
  const nd = run1("near_dedupe", { column: "note", threshold: 0.6 });
  ok(nd.frame.rows.length < 3, "near duplicate removal drops close copies");
  for (const op of ["function", "connector_lookup", "ai_transform", "ai_embed"]) { const r = run1(op, {}); ok(r.results[0].rowsIn === 3, `${op} does not run in the preview and does not drop rows`); }
  ok(EXTRA_OPS.size >= 14, "feature, document and remote steps are registered");
  const a = proposeSteps("Trim spaces and lowercase the plan column, mask emails in note, fill missing mrr with 0", cols, 1);
  ok(a.proposals.length >= 3 && a.unmatched.length === 0, "the assistant turns a request into steps");
  ok(proposeSteps("make it sparkle", cols, 1).unmatched.length === 1, "the assistant lists what it could not match");
  ok(EXAMPLE_PROMPTS.every((x) => proposeSteps(x, [{ name: "ticket_id", type: "string", role: "identifier" }, { name: "channel", type: "string", role: "feature" }, { name: "body", type: "string", role: "feature" }, { name: "priority", type: "string", role: "feature" }] as any, 1).proposals.length > 0), "every example prompt produces a proposal");
  ok(suggestFromProfile(sampleDatasets()[0]).length > 0, "suggestions come from the profile");
  ok(recommendEngine(2e9, 1, 16).engine === "single" && recommendEngine(5e11, 1, 16).engine === "spark", "engine follows size and shuffle");
  ok(recommendFormat("llm-finetune").format === "jsonl" && recommendFormat("tabular").format === "parquet", "format follows the goal");
  ok(needsConversion("csv") && needsConversion("documents") && !needsConversion("parquet"), "non-columnar input is converted once");
  const dsAll = sampleDatasets(); const rcAll = sampleRecipes(); const plAll = samplePools();
  for (const r of rcAll) { const d = dsAll.find((x) => x.id === r.inputDatasetId)!; const { results } = runSteps(startFrame(d.columns, d.sample), r.steps); const bad = r.steps.map((st) => validateStep(st, d.columns)).flat().length; ok(!!d && results.length === r.steps.length, `sample recipe ${r.name} runs on its dataset`); void bad; }
  ok(dsAll.some((d) => d.source.kind === "documents" && d.totalRows > 100000), "a documents dataset exists at scale");
  // structured run records
  for (const r of rcAll) {
    const d = dsAll.find((x) => x.id === r.inputDatasetId)!;
    const run = buildRun("run_t", r, d, plAll[0], { status: "succeeded", startedAgo: 1000, durationMs: 120000, simulated: true });
    ok(run.log.length > 3 && run.log.every((l) => typeof l.t === "string" && ["info", "warn", "error", "debug"].includes(l.level) && l.msg.length > 0), `run of ${r.name} has a structured log`);
    ok(/Simulated run/i.test(run.log[0].msg), `run of ${r.name} says it is simulated`);
    ok(run.steps.length === r.steps.length && run.steps.every((x) => x.rowsOut >= 0 && x.rejected >= 0), `run of ${r.name} has counters for every step`);
    const again = buildRun("run_t", r, d, plAll[0], { status: "succeeded", startedAgo: 1000, durationMs: 120000, simulated: true });
    ok(JSON.stringify(again.steps) === JSON.stringify(run.steps), `run of ${r.name} is deterministic`);
  }
  const csvRecipe = rcAll.find((r) => dsAll.find((x) => x.id === r.inputDatasetId && needsConversion(x.format)));
  if (csvRecipe) { const d = dsAll.find((x) => x.id === csvRecipe.inputDatasetId)!; const run = buildRun("run_c", csvRecipe, d, plAll[0], { status: "succeeded", startedAgo: 1000, durationMs: 90000 }); ok(run.stages.some((g) => g.kind === "convert"), "non-columnar input gets a conversion stage"); }
  const failedRun = buildRun("run_f", rcAll[0], dsAll.find((x) => x.id === rcAll[0].inputDatasetId)!, plAll[0], { status: "failed", startedAgo: 1000, durationMs: 30000, pct: 40 });
  ok(failedRun.log.some((l) => l.level === "error"), "a failed run logs an error");
  // streams and connectors
  const st = addStream({ name: "orders_clean", kind: "cdc", recipeName: "orders-normalise", source: "orders-cdc", sink: "s3://lake/orders/", pool: plAll[0].name, delivery: "at-least-once", mode: "upsert", primaryKey: "order_id", destKind: "table", snapshot: true, flushSeconds: 30, schemaEvolution: "add-columns" } as any);
  ok(st.status === "starting" && snapshot().streams.some((x) => x.id === st.id), "a new stream is listed and starts");
  const minio = CONNECTORS.find((c) => c.id === "minio");
  ok(!!minio && minio.settings.some((x: any) => x.key === "endpoint") && secretKeys(minio.auth.find((a: any) => a.id === "access-key")!).length > 0, "MinIO connector has an endpoint and keeps its keys as references");
  void plAll;
}

// ---- unified datasets
{
  const all = sampleDatasets(); const cust = all.find((d) => d.name === "customers_crm")!; const ord = all.find((d) => d.name === "orders")!; const tix = all.find((d) => d.name === "support_tickets_raw")!;
  let m = addSource(addSource(addSource(emptyModel(), cust), ord), tix);
  ok(m.sources.length === 3 && new Set(m.sources.map((x) => x.alias)).size === 3, "tables get distinct short names");
  ok(addSource(m, cust).sources.length === 3, "a table is not added twice");
  const hints = suggestJoins(m, all);
  ok(hints.some((h) => h.leftColumn === "email" && h.rightColumn === "customer_email"), "suggests email to customer_email across tables");
  ok(!hints.some((h) => h.leftColumn === "country" && h.rightColumn === "country"), "does not suggest generic columns");
  const c = m.sources[0].alias, o = m.sources[1].alias, t = m.sources[2].alias;
  m = { ...m, joins: [newJoin(c, "email", o, "customer_email", "left", true), newJoin(o, "customer_email", t, "customer_email", "left", true)] };
  m = setAllColumns(m, c, cust, true); m = toggleColumn(m, o, ord, "amount"); m = toggleColumn(m, t, tix, "csat");
  ok(validateModel(m, all, "customer_360").errors.length === 0, "a related model with columns is valid");
  const res = runModel(m, all);
  ok(res.columns.length === cust.columns.length + 2 && res.rows.length >= cust.sample.length, "left join keeps every row of the first table");
  ok(res.stats.length === 2 && res.stats[0].matchedLeft > 0 && res.stats[0].matchedLeft <= res.stats[0].leftRows, "join stats count matched rows");
  const inner = runModel({ ...m, joins: m.joins.map((j) => ({ ...j, type: "inner" as const })) }, all);
  ok(inner.rows.length < res.rows.length && inner.rows.every((r) => r.amount !== undefined), "inner join keeps only rows that match");
  const exact = runModel({ ...m, joins: m.joins.map((j) => ({ ...j, normalise: false })) }, all);
  ok(exact.stats[0].matchedLeft <= res.stats[0].matchedLeft, "comparing exactly never matches more than ignoring spaces and case");
  const cleaned = runModel(updateColumn(m, `${c}.email`, { clean: "mask" }), all);
  ok(cleaned.rows.some((r) => typeof r.email === "string" && (r.email as string).includes("•••@")), "masking keeps the first character and the domain");
  ok(modelSql(m, all).includes("LEFT JOIN") && modelSql(m, all).includes("LOWER(TRIM("), "the definition is generated as SQL");
  ok(validateModel({ ...m, joins: [] }, all).errors.some((e) => /not related/.test(e)), "an unrelated table is an error");
  ok(validateModel(updateColumn(updateColumn(m, `${c}.email`, { as: "x" }), `${c}.full_name`, { as: "x" }), all).errors.some((e) => /Two columns/.test(e)), "duplicate output names are an error");
  ok(removeSource(m, t).joins.every((j) => j.rightAlias !== t && j.leftAlias !== t) && removeSource(m, t).columns.every((x) => x.alias !== t), "removing a table removes its joins and columns");
}

// ---- engines and native limits
{
  const L = NATIVE_DEFAULTS; const GB = 1e9;
  const small = checkNativeRun(L, { inputBytes: 0.5 * GB, rows: 1e6, parallelism: 16, partitionMb: 64, shuffleSteps: 0 });
  ok(small.verdict === "ok" && small.effectiveParallelism === 16, "a small input runs on the native engine as asked");
  const big = checkNativeRun(L, { inputBytes: 40 * GB, rows: 1e8, parallelism: 16, partitionMb: 128, shuffleSteps: 0 });
  ok(big.verdict === "refused" && big.alternative === "single", "an input over the size limit is refused and a runner is suggested");
  ok(checkNativeRun(L, { inputBytes: 40 * GB, rows: 1e8, parallelism: 16, partitionMb: 128, shuffleSteps: 2 }).alternative === "spark", "a big input with whole-column steps is sent to Spark");
  ok(checkNativeRun(L, { inputBytes: 1 * GB, rows: 9e7, parallelism: 8, partitionMb: 64, shuffleSteps: 0 }).verdict === "refused", "too many rows are refused");
  const thr = checkNativeRun({ ...L, memoryMb: 1024 }, { inputBytes: 1 * GB, rows: 1e6, parallelism: 64, partitionMb: 128, shuffleSteps: 0 });
  ok(thr.verdict === "throttled" && thr.effectiveParallelism === 2 && thr.peakMemoryMb <= 1024, "parallelism is lowered to stay inside the memory budget");
  ok(checkNativeRun(L, { inputBytes: 4.5 * GB, rows: 1e6, parallelism: 8, partitionMb: 64, shuffleSteps: 1 }).verdict === "refused", "steps that need all rows are refused when the input cannot fit in memory");
  ok(checkNativeRun({ ...L, memoryMb: 256 }, { inputBytes: 1e8, rows: 1e5, parallelism: 4, partitionMb: 512, shuffleSteps: 0 }).verdict === "refused", "a partition that cannot fit is refused");
  ok(checkNativeRun(L, { inputBytes: 1e8, rows: 1e5, parallelism: 500, partitionMb: 32, shuffleSteps: 0 }).effectiveParallelism <= L.threads, "threads never go above the limit");
  ok(checkNativeRun(L, { inputBytes: 1e8, rows: 1e5, parallelism: 4, partitionMb: 32, shuffleSteps: 0, runningRuns: 3 }).queued, "a run waits when the native engine is busy");
  const cl = clampLimits({ threads: 9999, memoryMb: 1, maxInputGb: 100 });
  ok(cl.limits.threads === NATIVE_CEILING.threads && cl.limits.maxInputGb === NATIVE_CEILING.maxInputGb && cl.limits.memoryMb >= 256 && cl.clamped.length === 3, "limits are kept between the floor and the platform ceiling");
  ok(checkNativeStream(L, { expectedRecordsPerSec: 9000, runningStreams: 0 }).verdict === "refused" && checkNativeStream(L, { expectedRecordsPerSec: 100, runningStreams: 0 }).verdict === "ok", "a fast stream needs Flink");
  ok(checkNativeStream(L, { expectedRecordsPerSec: 100, runningStreams: L.streams }).verdict === "refused", "too many native streams are refused");
  ok(suggestEngine(L, { inputBytes: 1e8, rows: 1e5, parallelism: 4, partitionMb: 64, shuffleSteps: 0 }).engine === "native", "the native engine is suggested whenever it can take the run");
  const pools = samplePools();
  ok(pools[0].engine === "native" && !!pools[0].builtIn, "the native engine is listed first and built in");
  ok(pools.some((x) => x.engine === "flink" && x.flink?.location === "local") && pools.some((x) => x.engine === "flink" && x.flink?.location === "cloud"), "own Flink clusters can be in the cloud or on this computer");
  ok(!pools.some((x) => x.flink && Object.values(x.flink.secretRefs).some((v) => !v.startsWith("secretref://"))), "Flink cluster secrets are references");
  resetRefinery();
  setNativeLimits({ maxInputGb: 1 });
  const bigDs = snapshot().datasets.find((d) => d.sizeBytes > 1.5 * GB)!;
  const nrec = addRecipe("guard-test", bigDs.id);
  ok(nrec.pool === "platform-native", "a new recipe starts on the native engine");
  const refused = startRun(nrec.id);
  ok(refused.status === "failed" && refused.log.some((l) => l.src === "guardrail" && /refused/.test(l.msg)), "a run over the native limits fails at planning with the reason");
  setNativeLimits({ maxInputGb: 25, memoryMb: 1024 });
  const okRun = startRun(addRecipe("guard-ok", snapshot().datasets.find((d) => d.sizeBytes < 1 * GB)!.id).id);
  ok(okRun.status !== "failed", "a run inside the limits starts");
  resetRefinery();
}
console.log(fail ? `\n${fail} FAILED` : "\nall passed");
process.exit(fail ? 1 : 0);
