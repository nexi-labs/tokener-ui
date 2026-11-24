/**
 * Checks for the Crucible run search, artifact store rules, projects and keys, dataset exposure, per run analysis and the lineage graph (docs/52).
 * Run: npx tsx --tsconfig scripts/tsconfig.scripts.json scripts/check-crucible-platform.ts
 */
import { parseQuery } from "../src/lib/crucible/query";
import { crucible, crucibleNow, resetCrucible } from "../src/lib/crucible/store";
import { buildLineage, trace, NODE_W, ROW_GAP } from "../src/lib/crucible/lineage";
import { energy, evaluation, exposeProblems, projectYaml, repro, sampleToken, signature, storeUri, systemSeries, validateProject, validateStore, type StoreDraft } from "../src/lib/crucible/platform";

let pass = 0; let fail = 0;
const ok = (c: unknown, m: string) => { if (c) pass++; else { fail++; console.error("FAIL", m); } };
resetCrucible();
const S = () => crucibleNow();
const runs = S().runs;

// ---- run search, the MLflow filter syntax
const q = (s: string) => { const p = parseQuery(s); if (!p.ok) throw new Error(`${s}: ${p.error}`); return runs.filter(p.test); };
ok(q("").length === runs.length, "an empty filter keeps every run");
ok(q("metrics.f1_macro > 0.93").every((r) => r.metrics.f1_macro > 0.93) && q("metrics.f1_macro > 0.93").length > 0, "metric greater than");
ok(q("status = 'failed'").every((r) => r.status === "failed") && q("status = 'failed'").length === 2, "status equals finds the two failed runs");
ok(q("params.lr < 0.00003 and status = 'finished'").every((r) => Number(r.params.lr) < 0.00003 && r.status === "finished"), "and joins two conditions");
ok(q("status = 'failed' or status = 'running'").length === q("status = 'failed'").length + q("status = 'running'").length, "or joins two conditions");
ok(q("(status = 'failed' or status = 'running') and owner like 'priya%'").every((r) => r.owner.startsWith("priya")), "brackets group conditions");
ok(q("name ilike '%LORA%'").length > 0 && q("name like '%LORA%'").length === 0, "ilike ignores case and like does not");
ok(q("dataset_version in (16, 17)").every((r) => [16, 17].includes(r.dataset.version)) && q("dataset_version in (16, 17)").length > 0, "in matches a list");
ok(q("status not in ('failed')").every((r) => r.status !== "failed"), "not in excludes");
ok(q("metrics.does_not_exist > 0").length === 0, "a missing metric matches nothing");
ok(q("tags.trigger = 'dataset-version'").length >= 1, "tags can be searched");
ok(!parseQuery("metrics.f1 >").ok, "a filter that ends early is refused");
ok(!parseQuery("metrics.f1 > 0.9 and").ok, "a dangling and is refused");
ok(!parseQuery("(status = 'failed'").ok, "a missing bracket is refused");
ok(!parseQuery("status = 'failed").ok, "an open quote is refused");
{ const p = parseQuery("metrics.f1 ?? 1"); ok(!p.ok && p.at === 11, "the error points at the bad character"); }

// ---- artifact stores
const base: StoreDraft = { name: "team-lake", kind: "s3", bucket: "team-ml-lake", prefix: "crucible", region: "eu-west-1", auth: "iam-role", roleArn: "arn:aws:iam::123456789012:role/crucible", encryption: "SSE-KMS", versioning: true };
ok(validateStore(base).length === 0, "a valid S3 store passes");
ok(validateStore({ ...base, bucket: "Bad_Bucket" }).length > 0, "an invalid bucket name is refused");
ok(validateStore({ ...base, bucket: "10.0.0.1" }).length > 0, "an IP address is not a bucket name");
ok(validateStore({ ...base, prefix: "/abs" }).length > 0, "a prefix cannot start with a slash");
ok(validateStore({ ...base, auth: "access-key", secretRef: undefined }).length > 0, "an access key store needs a secret reference");
ok(validateStore({ ...base, auth: "access-key", secretRef: "AKIAIOSFODNN7EXAMPLE" }).some((e) => /reference/.test(e)), "a pasted key is refused");
ok(validateStore({ ...base, auth: "access-key", secretRef: "secretref://crucible/stores/team-lake" }).length === 0, "a secret reference is accepted");
ok(validateStore({ ...base, kind: "minio", auth: "access-key", secretRef: "secretref://a/b", endpoint: undefined }).some((e) => /endpoint/i.test(e)), "MinIO needs an endpoint");
ok(validateStore({ ...base, kind: "minio", auth: "access-key", secretRef: "secretref://a/b", endpoint: "http://minio.public.example:9000" }).some((e) => /https/.test(e)), "plain http to a public host is refused");
ok(validateStore({ ...base, kind: "minio", auth: "access-key", secretRef: "secretref://a/b", endpoint: "http://10.1.2.3:9000" }).length === 0, "plain http on a private network is allowed");
ok(validateStore({ ...base, auth: "iam-role", roleArn: "not-an-arn" }).length > 0, "a role must be an ARN");
ok(validateStore({ ...base, kind: "gcs", auth: "iam-role" }).length > 0, "GCS does not support a cross account role");
ok(storeUri({ kind: "s3", bucket: "b", prefix: "p/" }) === "s3://b/p" && storeUri({ kind: "gcs", bucket: "b", prefix: "" }) === "gs://b", "store addresses");
{
  const r = crucible.addStore("viewer", base); ok(!r.ok, "a viewer cannot add a store");
  const a = crucible.addStore("admin", base); ok(a.ok && a.value.status === "untested", "a new store starts untested");
  const id = a.ok ? a.value.id : "";
  ok(!crucible.setDefaultStore("admin", id).ok, "an untested store cannot be the default");
  const t = crucible.testStore(id); ok(t.ok && t.value.ok && S().stores.find((s) => s.id === id)!.status === "connected", "a valid store passes its test");
  ok(crucible.setDefaultStore("admin", id).ok && S().stores.filter((s) => s.isDefault).length === 1, "exactly one store is the default");
  ok(!crucible.removeStore("admin", id, id).ok, "the default store cannot be removed");
  ok(!crucible.removeStore("admin", "store-managed", "platform-managed").ok, "the managed store cannot be removed");
  ok(!crucible.removeStore("admin", "store-ml-lake", "nexi-ml-lake").ok, "a store a project writes to cannot be removed");
  crucible.setDefaultStore("admin", "store-managed");
  ok(!crucible.removeStore("admin", id, "wrong").ok && crucible.removeStore("admin", id, "team-lake").ok, "removal needs the name typed");
}

// ---- projects, keys and developer machines
ok(validateProject({ name: "new-model", storeId: "store-managed", repoUrl: "https://github.com/a/b", branch: "main", entry: "train.py", python: "3.11" }, []).length === 0, "a valid project passes");
ok(validateProject({ name: "support-classifier", storeId: "s", repoUrl: "", branch: "", entry: "train.py", python: "3.11" }, ["support-classifier"]).length > 0, "a duplicate project name is refused");
ok(validateProject({ name: "x1y", storeId: "s", repoUrl: "https://user:pass@github.com/a/b", branch: "", entry: "train.py", python: "3.11" }, []).some((e) => /credentials/.test(e)), "credentials in a repository address are refused");
ok(validateProject({ name: "x1y", storeId: "s", repoUrl: "", branch: "", entry: "train.py", python: "2.7" }, []).length > 0, "an old Python is refused");
{
  const c = crucible.createProject("viewer", { name: "p-one", description: "", storeId: "store-managed", repoUrl: "", branch: "main", entry: "train.py", python: "3.11", envTool: "uv" }); ok(!c.ok, "a viewer cannot create a project");
  const pr = crucible.createProject("admin", { name: "p-one", description: "", storeId: "store-managed", repoUrl: "https://github.com/a/b", branch: "main", entry: "train.py", python: "3.11", envTool: "uv" }); ok(pr.ok, "an admin creates a project");
  const pid = pr.ok ? pr.value.id : "";
  ok(!crucible.createKey("viewer", pid, "laptop-one", ["log"], 90).ok, "a viewer cannot make a key");
  ok(!crucible.createKey("admin", pid, "laptop-one", [], 90).ok, "a key needs a permission");
  ok(!crucible.createKey("admin", pid, "laptop-one", ["log"], 4000).ok, "a key cannot last more than a year");
  const k = crucible.createKey("admin", pid, "laptop-one", ["log", "read"], 90); ok(k.ok, "a key is made");
  const key = k.ok ? k.value.key : null; const token = k.ok ? k.value.token : "";
  ok(!!key && key.secretRef.startsWith("secretref://") && !key.secretRef.includes(token) && !JSON.stringify(key).includes(token), "the token is not kept, only a reference and a prefix");
  ok(token.startsWith("crk_sample_"), "a sample token is clearly marked as a sample");
  ok(!crucible.createKey("admin", pid, "laptop-one", ["log"], 30).ok, "an active key name cannot repeat");
  const m = crucible.addMachine("admin", pid, key!.id, "my-laptop", "laptop"); ok(m.ok && m.value.state === "pending", "a machine waits for its first heartbeat");
  ok(!crucible.addMachine("admin", pid, key!.id, "my-laptop", "laptop").ok, "a machine name cannot repeat");
  const hb = crucible.simulateHeartbeat("admin", m.ok ? m.value.id : ""); ok(hb.ok && hb.value.state === "online" && !!hb.value.firstSeenAt, "the first heartbeat brings it online");
  ok(S().keys.find((x) => x.id === key!.id)!.lastUsedAt !== undefined, "a heartbeat marks the key as used");
  const rot = crucible.rotateKey("admin", key!.id); ok(rot.ok && rot.value.key.prefix !== key!.prefix, "rotation changes the key");
  ok(crucible.revokeKey("admin", key!.id).ok && S().machines.find((x) => x.id === (m.ok ? m.value.id : ""))!.state === "revoked", "revoking a key cuts its machines off");
  ok(!crucible.revokeKey("admin", key!.id).ok && !crucible.rotateKey("admin", key!.id).ok, "a revoked key cannot be revoked or rotated again");
  ok(!crucible.addMachine("admin", pid, key!.id, "other-laptop", "laptop").ok, "a revoked key cannot enrol a machine");
  ok(!crucible.simulateHeartbeat("admin", m.ok ? m.value.id : "").ok, "a revoked machine cannot connect");
}
{ const t = sampleToken("x"), u = sampleToken("x"); ok(t.token === u.token && t.token.length > 30, "sample tokens are deterministic and long"); }
{ const p = S().projects.find((x) => x.id === "prj-support")!; const y = projectYaml(p, { name: "nexi-ml-lake" }, { name: "support-tickets-unified", version: 17 }); ok(/name: support-classifier/.test(y) && /version: 17/.test(y) && /memory_check: required/.test(y) && !/secret|key/i.test(y.replace(/memory_check/, "")), "the project file pins data, requires the memory check and holds no secret"); }

// ---- datasets exposed from the Refinery
{
  const cat = S().catalog; ok(cat.filter((d) => d.exposed).length === 4 && cat.filter((d) => !d.exposed).length === 2, "four datasets are exposed and two are available");
  const churn = cat.find((d) => d.id === "cds-churn")!; ok(exposeProblems(churn).some((m) => /email/.test(m)), "personal data in the latest version blocks exposure");
  ok(!crucible.exposeDataset("admin", "cds-churn").ok, "exposing a dataset with personal data is refused");
  ok(!crucible.exposeDataset("viewer", "cds-reviews").ok, "a viewer cannot expose a dataset");
  ok(crucible.exposeDataset("admin", "cds-reviews").ok && S().catalog.find((d) => d.id === "cds-reviews")!.exposed, "a clean dataset is exposed");
  ok(!crucible.exposeDataset("admin", "cds-reviews").ok, "exposing twice is refused");
  ok(!crucible.unexposeDataset("admin", "cds-support").ok, "a dataset that runs pin cannot be hidden");
  ok(crucible.unexposeDataset("admin", "cds-reviews").ok, "an unused dataset can be hidden");
  ok(cat.every((d) => d.versions.every((v) => v.splits.train + v.splits.validation + v.splits.test === v.rows)), "every version's splits add up to its rows");
  ok(cat.every((d) => d.versions.every((v, i, a) => i === 0 || a[i - 1].version > v.version)), "versions are listed newest first");
}

// ---- per run analysis
for (const r of runs) {
  const sys = systemSeries(r);
  ok(sys.every((s) => s.values.length === r.steps.length), `${r.id} system series match its steps`);
  ok(r.gpus.count > 0 ? sys.some((s) => s.key === "gpu_util") : !sys.some((s) => s.key.startsWith("gpu")), `${r.id} has GPU series only when it used a GPU`);
  ok(sys.filter((s) => s.unit === "%").every((s) => s.values.every((v) => v >= 0 && v <= 100)), `${r.id} percentages stay within 0 to 100`);
  ok(JSON.stringify(systemSeries(r)) === JSON.stringify(sys), `${r.id} analysis is deterministic`);
  const e = energy(r); ok(e.kwh >= 0 && e.kgco2e <= e.kwh, `${r.id} carbon is less than energy at a grid factor under 1`);
  const p = repro(r); ok(p.score === p.checks.filter((c) => c.ok).length && p.score >= 5, `${r.id} reproducibility score is the number of passed checks`);
  ok(signature(r).requirements.length > 0 && signature(r).inputs.length > 0, `${r.id} has a model signature`);
}
ok(repro(runs.find((r) => r.id === "run-2310")!).dirty, "a run from a dirty working tree is flagged");
{ const r = runs.find((x) => x.experimentId === "exp-support" && x.status === "finished")!; const ev = evaluation(r, { id: "exp-support" }, "f1_macro");
  ok(ev.confusion!.matrix.every((row) => Math.abs(row.reduce((a, b) => a + b, 0) - 1) < 0.01), "each confusion matrix row adds up to 1");
  ok(ev.slices.length === 11 && ev.fairnessGap >= 0, "support slices and a non negative fairness gap"); }

// ---- lineage
const input = () => ({ experiments: S().experiments, runs: S().runs, jobs: S().jobs, policies: S().policies, cycles: S().cycles, catalog: S().catalog, stores: S().stores, projects: S().projects, keys: S().keys });
for (const exp of S().experiments) {
  const g = buildLineage(input(), exp.id, Date.now()); const ids = new Set(g.nodes.map((n) => n.id));
  ok(g.nodes.length >= 8, `${exp.id} lineage has nodes`);
  ok(ids.size === g.nodes.length, `${exp.id} node ids are unique`);
  ok(g.edges.every((e) => ids.has(e.from) && ids.has(e.to)), `${exp.id} no edge points at a missing node`);
  ok(new Set(g.edges.map((e) => e.id)).size === g.edges.length, `${exp.id} no repeated edge`);
  ok(g.nodes.every((n) => n.x % 1 === 0 && Number.isFinite(n.y)), `${exp.id} every node has a position`);
  const col = new Map<number, number[]>(); g.nodes.forEach((n) => col.set(n.lane, [...(col.get(n.lane) ?? []), n.y]));
  ok([...col.values()].every((ys) => ys.every((y, i) => i === 0 || Math.abs(y - ys[i - 1]) >= ROW_GAP - 1)), `${exp.id} nodes in a lane do not overlap`);
  ok(NODE_W < 340, "a node is narrower than a lane");
  const tracedOk = g.nodes.filter((n) => n.kind === "model" && !n.props.some((p) => p[1] === "An earlier run")).every((n) => { const t = trace(g, n.id); return [...t.up].some((i) => i.startsWith("src:") || i.startsWith("ds:") || i.startsWith("run:")); });
  ok(tracedOk, `${exp.id} every model version traces back to a run or data`);
  ok(g.nodes.every((n) => (["overview", "quality", "cost", "time"] as const).every((l) => n.figures[l].length > 0)), `${exp.id} every node has figures on every layer`);
  const acyclic = (() => { const adj = new Map<string, string[]>(); g.edges.filter((e) => !e.loop).forEach((e) => adj.set(e.from, [...(adj.get(e.from) ?? []), e.to])); const st = new Map<string, number>(); const dfs = (n: string): boolean => { if (st.get(n) === 1) return false; if (st.get(n) === 2) return true; st.set(n, 1); for (const m of adj.get(n) ?? []) if (!dfs(m)) return false; st.set(n, 2); return true; }; return g.nodes.every((n) => dfs(n.id)); })();
  ok(acyclic, `${exp.id} the graph has no cycle once loop edges are set aside`);
}
{ const g = buildLineage(input(), "exp-support", Date.now()); const m = g.nodes.find((n) => n.kind === "model" && n.stateLabel === "Champion")!;
  ok(!!m, "the champion model is on the graph");
  const t = trace(g, m.id); ok([...t.up].some((i) => i.startsWith("src:")) && [...t.up].some((i) => i.startsWith("rcp:")), "the champion traces back to a source and its Refinery recipe");
  ok(g.edges.some((e) => e.loop && e.from.startsWith("pol:") && e.to.startsWith("rcp:")), "the renewal loop returns to the Refinery recipe");
  ok(g.nodes.some((n) => n.kind === "run" && n.state === "bad" && /memory/i.test(n.figures.quality.map((f) => f.value).join(" ") + n.props.map((p) => p[1]).join(" "))), "a run that ran out of memory shows as failed"); }

console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
