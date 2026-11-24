/**
 * Writes the expected output of the console's Crucible logic for fixed inputs, so the Java ports can be compared with it case by case
 * (CrucibleGoldenCheck): the run search filter, the continuous training gates, and the number handling both rely on.
 * From the repository root: bash scripts/crucible_golden.sh
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname } from "node:path";
import { parseQuery } from "../src/lib/crucible/query";
import { gateResults, LOWER_IS_BETTER } from "../src/lib/crucible/ct";
import { samplePolicies, sampleRuns } from "../src/lib/crucible/sample";
import type { Run } from "../src/lib/crucible/types";

const out = "../tokener-crucible/src/test/resources/io/tokener/crucible/golden/crucible.json.gz";
const NOW = Date.parse("2026-11-20T12:00:00Z");

// ---- runs: the sample runs and a few that exercise the corners (text that looks like a number, booleans, missing values, odd names)
const base = sampleRuns(NOW);
const quirk = (id: string, over: Partial<Run>): Run => ({ ...structuredClone(base[0]), id, ...over });
const runs: Run[] = [
  ...base,
  quirk("run-q1", { name: "Ünïcode_run-1", params: { lr: "0.5", flag: true, note: "has % and _ chars", empty: "" }, metrics: { acc: 0.5, loss: 0 }, tags: { team: "Ml", trigger: "manual" } }),
  quirk("run-q2", { name: "100%_done", params: { lr: "abc", flag: false, steps: 1e21, tiny: 1e-7 }, metrics: { acc: -0.25, big: 123456789012345680000 }, tags: {} }),
  quirk("run-q3", { name: "a.b-c/d", owner: "", params: {}, metrics: {}, tags: { "k.with.dots": "v" } }),
  quirk("run-q4", { name: "case TEST", status: "killed" as Run["status"], params: { lr: 0.00003 }, metrics: { acc: 0.1 + 0.2 }, tags: { trigger: "Continuous" } }),
];
const runCase = (r: Run) => ({
  id: r.id, name: r.name, status: r.status, owner: r.owner, startMs: Date.parse(r.startedAt), gpuHours: r.gpuHours, costUsd: r.costUsd,
  dataset: r.dataset.name, datasetVersion: r.dataset.version, commit: r.code.commit, metrics: r.metrics, params: r.params, tags: r.tags,
});

// ---- queries: valid ones that exercise every operator and field, and invalid ones where the message and the position matter
const queries = [
  "", "   ", "metrics.f1_macro > 0.93", "metrics.f1_macro >= 0.93", "metrics.f1_macro < 0.93", "metrics.f1_macro <= 0.93", "metrics.f1_macro = 0.93", "metrics.f1_macro == 0.93", "metrics.f1_macro != 0.93",
  "status = 'failed'", "status = \"failed\"", "status != 'failed'", "status = failed", "status > 'f'", "status in ('failed', 'running')", "status not in ('failed')", "status in ('killed')",
  "params.lr < 0.00003", "params.lr < 0.00003 and status = 'finished'", "params.lr = '0.5'", "params.lr = 0.5", "params.lr > 0", "params.flag = true", "params.flag = false", "params.flag = 'true'", "params.flag = 1",
  "params.empty = ''", "params.empty = 0", "params.steps > 1e20", "params.tiny < 0.000001", "params.steps in (1e21)", "params.tiny in (1e-7)",
  "tags.trigger = 'continuous'", "tags.trigger like 'cont%'", "tags.trigger ilike 'cont%'", "tags.team = 'Ml'", "tags.k.with.dots = 'v'", "tags.missing = 'x'",
  "owner like 'priya%'", "owner like '%@nexi.example'", "owner like 'priya_nair%'", "owner = ''", "user = 'continuous-training'",
  "name like '%LORA%'", "name ilike '%LORA%'", "name like '%\\_%'", "name like '100%'", "name like '%.%'", "name ilike 'ünï%'", "name ilike 'ÜNÏ%'", "name like 'a.b-c/d'", "name not like 'x'", "run_name like '%case%'", "name ilike '%case test%'",
  "attributes.status = 'finished'", "attribute.name like 'bert%'", "attributes. = 'x'", "metrics. > 1",
  "id = 'run-2134'", "run_id in ('run-2134', 'run-2188')", "dataset_version in (16, 17)", "dataset_version in (16, 17) and metrics.val_loss < 0.25", "dataset_version = 16", "dataset = 'support-tickets'", "dataset like 'support%'",
  "gpu_hours > 3", "cost > 10", "cost_usd < 5", "commit like 'a%'", "start_time > 1700000000000", "start_time < 1790000000000",
  "metrics.acc > 0.2", "metrics.acc = 0.30000000000000004", "metrics.acc in (0.30000000000000004)", "metrics.acc < -0.1", "metrics.acc > -1", "metrics.loss = 0", "metrics.big > 1e20", "metrics.big in (123456789012345680000)",
  "(status = 'failed' or status = 'running') and owner like 'priya%'", "status = 'failed' or status = 'running' and owner like 'priya%'", "((status = 'failed'))", "status = 'finished' and (metrics.f1_macro > 0.9 or metrics.auc > 0.9)",
  "STATUS = 'failed'", "Status = 'failed'", "status = 'finished' AND owner like 'priya%'", "status = 'finished' Or status = 'failed'", "status NOT in ('failed')",
  "metrics.f1 >", "metrics.f1 > 0.9 and", "metrics.f1 > 0.9 or", "(status = 'failed'", "status = 'failed')", "status = 'failed", "status = \"failed'", "metrics.f1 ?? 1", "metrics.f1 > 'a", "> 5", "and", "status", "status =", "status = and", "status in 'a'", "status in ('a'", "status in ('a' 'b')", "status in ()", "status not", "status not 'x'",
  "status like", "5 = 5", "status = 1 2", "status = 'a' 'b'", "status = 'a' status = 'b'", "metrics.x > -", "metrics.x > --1", "metrics.x>-1", "metrics.x > .5", "metrics.x > 5.", "metrics.x > 1e", "metrics.x > 1e+", "a-b = 1", "a-1 = 1", "metrics.x-1 > 0", "metrics.x -1 > 0", "x = true", "x = 'true' and y = false",
  "status = 'finished'\tand\nowner like 'priya%'", "  status = 'failed'  ", "status != 'a' and status != 'b' and status != 'c'", "status = 'a' or status = 'b' or status = 'finished'", "tags.trigger not in ('manual')", "tags.missing not in ('manual')", "params.missing not in (1)", "metrics.missing = 1", "metrics.missing != 1",
];
const filters = queries.map((q) => {
  const p = parseQuery(q);
  return p.ok ? { q, ok: true, ids: runs.filter(p.test).map((r) => r.id) } : { q, ok: false, error: p.error, at: p.at };
});

// ---- number handling the filter and the gate text depend on
const nums = [0, -0, 1, -1, 0.5, 0.1 + 0.2, 1 / 3, 100, 120, 1e6, 123456789, 1e20, 1e21, 123456789012345680000, 1.5e21, 1e-6, 1e-7, 1.5e-7, 0.000001234, 0.00003, 5e-324, 1.7976931348623157e308, -2.5, 2.5, 1.005, 1.0005, 0.0004, -0.0004, 0.0005, -0.0005, 0.9995, 9.9995, 0.123456789, 12345.6789, 1e5, 2e-5];
const numCases = nums.map((n) => ({ n, str: String(n), f0: n.toFixed(0), f1: n.toFixed(1), f3: n.toFixed(3) }));
const texts = ["", " ", "  12  ", "0", "-0", "0.5", ".5", "5.", "+3", "-3", "1e3", "1E3", "1e", "0x1F", "0X1f", "0b11", "0o17", "abc", "1,5", "-", "+", ".", "Infinity", "-Infinity", "+Infinity", "infinity", "1 2", "12abc", "0x", "1_000", "\t7\n", "1e400", "-1e400"];
const textCases = texts.map((s) => { const n = Number(s); return { s, n: Number.isNaN(n) ? null : Number.isFinite(n) ? n : n > 0 ? "Infinity" : "-Infinity" }; });

// ---- gates: every sample policy against candidates that sit on each side of every gate
const policies = samplePolicies(NOW);
const gates: unknown[] = [];
for (const p of policies) {
  const g = p.gates; const lower = LOWER_IS_BETTER.has(g.metric); const step = lower ? -1 : 1;
  for (const dm of [-0.2, -0.05, -0.001, 0, 0.001, 0.05, 0.2]) for (const slices of [[], [{ slice: "billing", delta: 0.01 }], [{ slice: "billing", delta: -0.005 }, { slice: "returns", delta: -0.0051 }], [{ slice: "a", delta: -0.04 }, { slice: "b", delta: 0.02 }]]) for (const [fair, mem, lat] of [[0, 1, 10], [g.maxFairnessGap, g.maxMemoryGb, g.maxP95Ms], [g.maxFairnessGap + 0.001, g.maxMemoryGb + 0.1, g.maxP95Ms + 1], [0.0123456, 7.25, 41]]) {
    const c = { metric: Math.round((p.champion.metric + step * dm) * 10000) / 10000, sliceDeltas: slices, fairnessGap: fair, peakMemGb: mem, p95Ms: lat };
    gates.push({ gates: g, champion: p.champion, candidate: c, results: gateResults(p, c) });
  }
  gates.push({ gates: { ...g, floor: g.floor, noSliceRegression: !g.noSliceRegression }, champion: p.champion, candidate: { metric: g.floor, sliceDeltas: [{ slice: "x", delta: -0.1 }], fairnessGap: 0.02, peakMemGb: 8, p95Ms: 50 }, results: gateResults({ ...p, gates: { ...g, noSliceRegression: !g.noSliceRegression } }, { metric: g.floor, sliceDeltas: [{ slice: "x", delta: -0.1 }], fairnessGap: 0.02, peakMemGb: 8, p95Ms: 50 }) });
}
// metrics where lower is better, whatever the sample policies use
for (const metric of ["val_loss", "rmse", "mae", "mape", "loss", "f1_macro", "auc", "accuracy"]) for (const [floor, champ] of [[0.2, 0.18], [0.9, 0.91], [30, 28]]) for (const cand of [0.1, 0.18, 0.19, 0.2, 0.21, 0.5, 0.9, 0.91, 0.92, 28, 31]) {
  const g = { metric, floor, noSliceRegression: true, maxFairnessGap: 0.05, maxMemoryGb: 16, maxP95Ms: 80 };
  const c = { metric: cand, sliceDeltas: [{ slice: "s", delta: 0 }], fairnessGap: 0.02, peakMemGb: 12, p95Ms: 60 };
  const p = { ...policies[0], gates: g, champion: { version: 3, metric: champ } };
  gates.push({ gates: g, champion: p.champion, candidate: c, results: gateResults(p, c) });
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, gzipSync(JSON.stringify({ lowerIsBetter: [...LOWER_IS_BETTER].sort(), runs: runs.map(runCase), filters, numCases, textCases, gates })));
console.log("wrote", out, "runs", runs.length, "filters", filters.length, "numbers", numCases.length, "texts", textCases.length, "gates", gates.length);
