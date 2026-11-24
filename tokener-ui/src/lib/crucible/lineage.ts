import { energy, type ApiKey, type ArtifactStore, type CatalogDataset, type Project, storeUri } from "./platform";
import type { CtPolicy, Cycle, Experiment, Job, Run } from "./types";

/** The path from source data to a deployed model, built from what the stores already know. Every node says what it is, how it is doing and where to read more. */
export type Layer = "overview" | "quality" | "cost" | "time";
export const LAYER_LABEL: Record<Layer, string> = { overview: "Overview", quality: "Quality", cost: "Cost and energy", time: "Time" };
export type Tone = "good" | "warn" | "bad" | "neutral";
export type Fig = { label: string; value: string; tone?: Tone };
export type NodeKind = "source" | "recipe" | "dataset" | "code" | "image" | "run" | "eval" | "store" | "model" | "deployment" | "monitor" | "policy";
export type NodeState = "ok" | "live" | "warn" | "bad" | "idle";
export type LNode = {
  id: string; lane: number; kind: NodeKind; title: string; subtitle: string; state: NodeState; stateLabel: string;
  figures: Record<Layer, Fig[]>; props: [string, string][]; activity: { at: string; what: string }[]; spark?: number[]; sparkLabel?: string; href?: string; hrefLabel?: string;
  x: number; y: number;
};
export type LEdge = { id: string; from: string; to: string; label?: string; loop?: boolean; live?: boolean };
export type Lineage = { nodes: LNode[]; edges: LEdge[]; lanes: { id: number; label: string; hint: string }[] };

export const LANES = [
  { id: 0, label: "Sources", hint: "Where the raw data lives" }, { id: 1, label: "Refinery", hint: "Cleaning and masking" }, { id: 2, label: "Datasets", hint: "Versions a run can pin" },
  { id: 3, label: "Code and environment", hint: "What ran" }, { id: 4, label: "Runs", hint: "Training and its results" }, { id: 5, label: "Evaluation and storage", hint: "Gates and artifacts" },
  { id: 6, label: "Registry", hint: "Versions of the model" }, { id: 7, label: "Serving and renewal", hint: "In use, watched, retrained" },
];
export const NODE_W = 252, NODE_H = 172, LANE_GAP = 340, ROW_GAP = 206;

export type LineageInput = { experiments: Experiment[]; runs: Run[]; jobs: Job[]; policies: CtPolicy[]; cycles: Cycle[]; catalog: CatalogDataset[]; stores: ArtifactStore[]; projects: Project[]; keys: ApiKey[] };
const PRIMARY: Record<string, string> = { "exp-support": "f1_macro", "exp-fraud": "auc", "exp-forecast": "mape", "exp-llm": "eval_loss" };
const pct = (n: number, d = 0) => `${(n * 100).toFixed(d)}%`;
const usd = (n: number) => `$${n.toFixed(n >= 100 ? 0 : 2)}`;
const rel = (iso: string, now: number) => { const h = (now - Date.parse(iso)) / 3600_000; return h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} days ago`; };
const hrs = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} h`);
const fmt = (k: string, v: number) => (k === "mape" ? pct(v, 1) : v.toFixed(3));
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export function buildLineage(inp: LineageInput, expId: string, now: number, maxRuns = 6): Lineage {
  const exp = inp.experiments.find((e) => e.id === expId); if (!exp) return { nodes: [], edges: [], lanes: LANES };
  const key = PRIMARY[expId] ?? "f1_macro";
  const runs = inp.runs.filter((r) => r.experimentId === expId).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)).slice(0, maxRuns);
  const policy = inp.policies.find((p) => p.experimentId === expId); const cycles = inp.cycles.filter((c) => c.policyId === policy?.id);
  const project = inp.projects.find((p) => p.experimentIds.includes(expId)); const store = inp.stores.find((s) => s.id === project?.storeId);
  const nodes: LNode[] = []; const edges: LEdge[] = []; const seen = new Set<string>();
  const add = (n: Omit<LNode, "x" | "y">) => { if (!seen.has(n.id)) { seen.add(n.id); nodes.push({ ...n, x: 0, y: 0 }); } return n.id; };
  const link = (from: string, to: string, label?: string, extra: Partial<LEdge> = {}) => { const id = `${from}>${to}`; if (seen.has(from) && seen.has(to) && !edges.some((e) => e.id === id)) edges.push({ id, from, to, label, ...extra }); };
  const same = (a: Fig[]) => ({ overview: a, quality: a, cost: a, time: a });

  // ---- datasets and where they come from
  const dsName = runs[0]?.dataset.name; const cat = inp.catalog.find((c) => c.name === dsName);
  const versions = [...new Set(runs.map((r) => r.dataset.version))].sort((a, b) => b - a);
  if (cat) {
    for (const i of cat.inputs) add({ id: `src:${i.name}`, lane: 0, kind: "source", title: i.name, subtitle: i.kind, state: "ok", stateLabel: "Connected", figures: same([{ label: "Kind", value: i.kind }]), props: [["Kind", i.kind], ["Read by", `Refinery recipe ${cat.recipe}`]], activity: [], href: "/refinery/connections", hrefLabel: "Open connections" });
    add({ id: `rcp:${cat.recipeId}`, lane: 1, kind: "recipe", title: cat.recipe, subtitle: `${cat.steps.length} cleaning steps`, state: "ok", stateLabel: "Last run succeeded",
      figures: { overview: [{ label: "Steps", value: String(cat.steps.length) }, { label: "Latest version", value: `v${cat.versions[0].version}` }], quality: [{ label: "Quality", value: pct(cat.versions[0].quality), tone: cat.versions[0].quality >= 0.9 ? "good" : "warn" }, { label: "Personal data", value: cat.steps.includes("pii_mask") ? "Masked" : "Not masked", tone: cat.steps.includes("pii_mask") ? "good" : "warn" }], cost: [{ label: "Rows processed", value: cat.versions[0].rows.toLocaleString("en-US") }, { label: "Last run", value: cat.versions[0].refineryRun }], time: [{ label: "Latest output", value: rel(cat.versions[0].createdAt, now) }, { label: "Versions kept", value: String(cat.versions.length) }] },
      props: [["Steps", cat.steps.join(", ")], ["Output", `${cat.format} at ${cat.location}`], ["Owner", cat.owner]], activity: cat.versions.slice(0, 3).map((v) => ({ at: v.createdAt, what: `Version ${v.version}: ${v.note}` })), href: `/refinery/recipes/${cat.recipeId}`, hrefLabel: "Open the recipe" });
    for (const i of cat.inputs) link(`src:${i.name}`, `rcp:${cat.recipeId}`, "read");
  }
  const usedBy = (v: number) => runs.filter((r) => r.dataset.version === v);
  const shownVersions = [...new Set([...(cat && cat.versions[0] && !versions.includes(cat.versions[0].version) ? [cat.versions[0].version] : []), ...versions])].sort((a, b) => b - a);
  for (const v of shownVersions) {
    const info = cat?.versions.find((x) => x.version === v); const rs = usedBy(v); const unused = rs.length === 0;
    add({ id: `ds:${dsName}:${v}`, lane: 2, kind: "dataset", title: `${dsName ?? "dataset"} v${v}`, subtitle: unused ? "Newest version, not used yet" : `Pinned by ${rs.length} run${rs.length > 1 ? "s" : ""}`, state: unused ? "idle" : "ok", stateLabel: unused ? "Not used yet" : "In use",
      figures: { overview: [{ label: "Rows", value: (info?.rows ?? rs[0]?.dataset.rows ?? 0).toLocaleString("en-US") }, { label: "Runs", value: String(rs.length) }], quality: [{ label: "Quality", value: pct(info?.quality ?? rs[0]?.dataset.quality ?? 0), tone: (info?.quality ?? 1) >= 0.9 ? "good" : "warn" }, { label: "Personal data", value: info?.piiClean === false ? "Found" : "Clean", tone: info?.piiClean === false ? "bad" : "good" }, { label: "Schema", value: info?.schemaChanged ? "Changed" : "Same as before", tone: info?.schemaChanged ? "warn" : "neutral" }], cost: [{ label: "Train rows", value: (info?.splits.train ?? 0).toLocaleString("en-US") }, { label: "Validation", value: (info?.splits.validation ?? 0).toLocaleString("en-US") }, { label: "Test", value: (info?.splits.test ?? 0).toLocaleString("en-US") }], time: [{ label: "Created", value: info ? rel(info.createdAt, now) : "Unknown" }, { label: "Refinery run", value: info?.refineryRun ?? rs[0]?.dataset.refineryRun ?? "" }] },
      props: [["Refinery run", info?.refineryRun ?? rs[0]?.dataset.refineryRun ?? ""], ["Note", info?.note ?? ""], ["Splits", info ? `${info.splits.train.toLocaleString("en-US")} / ${info.splits.validation.toLocaleString("en-US")} / ${info.splits.test.toLocaleString("en-US")}` : ""]], activity: info ? [{ at: info.createdAt, what: `Created by Refinery run ${info.refineryRun}` }] : [], href: "/crucible/datasets", hrefLabel: "Open the dataset" });
    if (cat) link(`rcp:${cat.recipeId}`, `ds:${dsName}:${v}`, `v${v}`);
  }

  // ---- code, image, store
  if (project) add({ id: `prj:${project.id}`, lane: 3, kind: "code", title: project.name, subtitle: `${project.repo.url.replace(/^https:\/\//, "")}`, state: "ok", stateLabel: "Connected",
    figures: { overview: [{ label: "Branch", value: project.repo.branch }, { label: "Machines", value: String(new Set(inp.keys.filter((k) => k.projectId === project.id && !k.revokedAt).map((k) => k.id)).size) }], quality: [{ label: "Lock file", value: project.lockfile, tone: "good" }, { label: "Python", value: project.python }], cost: [{ label: "Runs logged", value: String(inp.runs.filter((r) => project.experimentIds.includes(r.experimentId)).length) }], time: [{ label: "Created", value: rel(project.createdAt, now) }] },
    props: [["Repository", project.repo.url], ["Starts with", project.entry], ["Environment", `${project.envTool}, Python ${project.python}`]], activity: [], href: `/crucible/projects`, hrefLabel: "Open the project" });
  const commits = [...new Set(runs.map((r) => r.code.commit))].slice(0, 3);
  for (const c of commits) add({ id: `git:${c}`, lane: 3, kind: "code", title: `Commit ${c}`, subtitle: runs.find((r) => r.code.commit === c)!.code.branch, state: "ok", stateLabel: "Committed", figures: same([{ label: "Used by", value: `${runs.filter((r) => r.code.commit === c).length} runs` }]), props: [["Repository", runs[0].code.repo], ["Commit", c]], activity: [] });
  const images = [...new Set(runs.map((r) => r.image.digest))].slice(0, 2);
  for (const d of images) { const im = runs.find((r) => r.image.digest === d)!.image; add({ id: `img:${d.slice(7, 15)}`, lane: 3, kind: "image", title: im.ref.split("/").pop() ?? im.ref, subtitle: d.slice(0, 19), state: "ok", stateLabel: "Pinned by digest", figures: same([{ label: "Used by", value: `${runs.filter((r) => r.image.digest === d).length} runs` }]), props: [["Image", im.ref], ["Digest", d]], activity: [] }); }
  if (project) for (const c of commits) link(`prj:${project.id}`, `git:${c}`, "at");
  if (store) add({ id: `st:${store.id}`, lane: 5, kind: "store", title: store.name, subtitle: storeUri(store), state: store.status === "connected" ? "ok" : store.status === "failing" ? "bad" : "warn", stateLabel: store.status === "connected" ? "Connected" : store.status === "failing" ? "Failing" : "Not tested",
    figures: { overview: [{ label: "Used", value: `${store.usedGb.toLocaleString("en-US")} GB` }, { label: "Objects", value: store.objects.toLocaleString("en-US") }], quality: [{ label: "Versioning", value: store.versioning ? "On" : "Off", tone: store.versioning ? "good" : "warn" }, { label: "Encryption", value: store.encryption }], cost: [{ label: "Used", value: `${store.usedGb.toLocaleString("en-US")} GB` }, { label: "Cold after", value: `${store.lifecycle.coldAfterDays} days` }], time: [{ label: "Last tested", value: store.lastTestedAt ? rel(store.lastTestedAt, now) : "Never" }] },
    props: [["Location", storeUri(store)], ["Access", store.auth], ["Upload", "Straight from the machine with a short lived address"]], activity: [], href: "/crucible/storage", hrefLabel: "Open storage" });

  // ---- runs and their evaluation
  const reg = new Map<string, { model: string; version: number; run?: Run }>();
  for (const r of runs) {
    const m = r.metrics[key]; const live = r.status === "running"; const bad = r.status === "failed";
    const j = inp.jobs.find((x) => x.id === r.jobId); const e = energy(r);
    add({ id: `run:${r.id}`, lane: 4, kind: "run", title: r.name, subtitle: `${r.id} · ${r.status === "finished" ? "Finished" : r.status === "running" ? "Running" : r.status === "failed" ? "Failed" : r.status}`, state: live ? "live" : bad ? "bad" : r.status === "finished" ? "ok" : "idle", stateLabel: live ? "Running now" : bad ? "Failed" : r.status === "finished" ? "Finished" : r.status,
      figures: { overview: [{ label: key.replace(/_/g, " "), value: m !== undefined && !bad ? fmt(key, m) : "None", tone: bad ? "bad" : "neutral" }, { label: "GPU hours", value: hrs(r.gpuHours) }], quality: [{ label: key.replace(/_/g, " "), value: m !== undefined && !bad ? fmt(key, m) : "None" }, ...Object.entries(r.metrics).filter(([k]) => k !== key).slice(0, 2).map(([k, v]) => ({ label: k.replace(/_/g, " "), value: fmt(k, v) })), { label: "Peak memory", value: r.peakMemGb ? `${r.peakMemGb.toFixed(0)} GB` : "None", tone: bad && /memory/i.test(r.failure ?? "") ? "bad" as Tone : "neutral" as Tone }], cost: [{ label: "Cost", value: usd(r.costUsd) }, { label: "GPU hours", value: hrs(r.gpuHours) }, { label: "Energy", value: `${e.kwh} kWh` }, { label: "Carbon", value: `${e.kgco2e} kg CO2e` }], time: [{ label: "Started", value: rel(r.startedAt, now) }, { label: "Queue", value: j?.queue ?? "None" }, { label: "Attempts", value: String(j?.attempts.length ?? 1) }] },
      props: [["Run", r.id], ["Data", `${r.dataset.name} v${r.dataset.version}`], ["Code", `${r.code.repo} at ${r.code.commit}`], ["Hardware", r.gpus.count ? `${r.gpus.count} x ${r.gpus.card}` : "CPU"], ...(r.failure ? [["Failure", r.failure] as [string, string]] : []), ...Object.entries(r.params).slice(0, 6).map(([k, v]) => [k, String(v)] as [string, string])],
      activity: [{ at: r.startedAt, what: `Started by ${r.owner}` }, ...(r.endedAt ? [{ at: r.endedAt, what: r.status === "failed" ? "Failed" : "Finished" }] : [])], spark: r.series[key] ?? r.series[Object.keys(r.series)[0]], sparkLabel: key.replace(/_/g, " "), href: `/crucible/runs/${r.id}`, hrefLabel: "Open the run" });
    link(`ds:${r.dataset.name}:${r.dataset.version}`, `run:${r.id}`, "pinned", { live });
    if (seen.has(`git:${r.code.commit}`)) link(`git:${r.code.commit}`, `run:${r.id}`, "code");
    if (seen.has(`img:${r.image.digest.slice(7, 15)}`)) link(`img:${r.image.digest.slice(7, 15)}`, `run:${r.id}`, "image");
    if (store && r.artifacts.length) link(`run:${r.id}`, `st:${store.id}`, `${r.artifacts.length} artifacts`, { live });
    if (r.modelVersion) reg.set(`${r.modelVersion.model}:${r.modelVersion.version}`, { ...r.modelVersion, run: r });
    if (r.status === "finished" && (r.modelVersion || r.tags.trigger === "continuous")) {
      const ev = `eval:${r.id}`; const gate = policy?.gates; const pass = gate ? (["mape", "eval_loss"].includes(key) ? m <= gate.floor : m >= gate.floor) : true;
      add({ id: ev, lane: 5, kind: "eval", title: `Evaluation of ${r.name}`, subtitle: gate ? `Against ${key.replace(/_/g, " ")} ${["mape", "eval_loss"].includes(key) ? "at most" : "at least"} ${gate.floor}` : "Held out test split", state: pass ? "ok" : "bad", stateLabel: pass ? "Gates passed" : "A gate failed",
        figures: { overview: [{ label: key.replace(/_/g, " "), value: fmt(key, m), tone: pass ? "good" : "bad" }, { label: "Fairness gap", value: gate ? `${gate.maxFairnessGap}` : "None" }], quality: [{ label: "Metric", value: fmt(key, m) }, { label: "Slices", value: gate?.noSliceRegression ? "None worse" : "Not checked" }, { label: "Fairness gap, at most", value: gate ? String(gate.maxFairnessGap) : "None" }], cost: [{ label: "Serving memory, at most", value: gate ? `${gate.maxMemoryGb} GB` : "None" }, { label: "p95 latency, at most", value: gate ? `${gate.maxP95Ms} ms` : "None" }], time: [{ label: "Finished", value: r.endedAt ? rel(r.endedAt, now) : "Not yet" }] },
        props: [["Run", r.id], ["Gates", gate ? `${key}, slices, fairness, memory, latency` : "None set"]], activity: r.endedAt ? [{ at: r.endedAt, what: pass ? "All gates passed" : "A gate failed" }] : [], href: `/crucible/runs/${r.id}`, hrefLabel: "Open the evaluation" });
      link(`run:${r.id}`, ev, "evaluated");
    }
  }

  // ---- registry
  const champ = policy && exp.model ? { model: exp.model, version: policy.champion.version } : undefined;
  if (champ && !reg.has(`${champ.model}:${champ.version}`)) reg.set(`${champ.model}:${champ.version}`, champ);
  const rolling = cycles.find((c) => c.decision === "in-rollout" || c.decision === "awaiting-approval");
  for (const [k, v] of reg) {
    const isChamp = champ && v.version === champ.version && v.model === champ.model; const isCand = !isChamp && rolling?.candidate?.version === v.version;
    const run = (v as { run?: Run }).run; const approved = isChamp || (isCand && rolling?.decision === "in-rollout");
    add({ id: `mv:${k}`, lane: 6, kind: "model", title: `${v.model} v${v.version}`, subtitle: isChamp ? "Production" : isCand ? (rolling?.decision === "in-rollout" ? "Canary" : "Waiting for approval") : "Registered", state: isChamp ? "ok" : isCand ? "warn" : "idle", stateLabel: isChamp ? "Champion" : isCand ? (rolling?.decision === "in-rollout" ? "Rolling out" : "Needs approval") : "Registered",
      figures: { overview: [{ label: "Stage", value: isChamp ? "Production" : isCand ? "Staging" : "None" }, { label: key.replace(/_/g, " "), value: run ? fmt(key, run.metrics[key]) : isChamp && policy ? fmt(key, policy.champion.metric) : "None" }], quality: [{ label: "Approval", value: approved ? "Approved" : isCand ? "Waiting" : "Not required", tone: approved ? "good" : isCand ? "warn" : "neutral" }, { label: key.replace(/_/g, " "), value: run ? fmt(key, run.metrics[key]) : policy ? fmt(key, policy.champion.metric) : "None" }], cost: [{ label: "Artifact", value: run ? `${(run.artifacts.find((a) => a.kind === "model")?.sizeMb ?? 0).toLocaleString("en-US")} MB` : "None" }, { label: "Training cost", value: run ? usd(run.costUsd) : "None" }], time: [{ label: "Registered", value: run?.endedAt ? rel(run.endedAt, now) : "Earlier" }] },
      props: [["Registry model", v.model], ["Version", String(v.version)], ["Trained by", run ? run.name : "An earlier run"]], activity: run?.endedAt ? [{ at: run.endedAt, what: `Registered from ${run.name}` }] : [], href: "/mlops/models", hrefLabel: "Open Model Versions" });
    if (run) { const ev = `eval:${run.id}`; if (seen.has(ev)) link(ev, `mv:${k}`, "registered"); else link(`run:${run.id}`, `mv:${k}`, "registered"); }
  }

  // ---- serving, watching, renewing
  if (champ) {
    const h = hash(expId); const traffic = rolling?.decision === "in-rollout" ? 10 : 0;
    add({ id: `dep:${exp.model}`, lane: 7, kind: "deployment", title: `${exp.model}`, subtitle: `Version ${champ.version} in production`, state: "ok", stateLabel: traffic ? `Canary at ${traffic}%` : "Serving",
      figures: { overview: [{ label: "Serving", value: `v${champ.version}` }, { label: "Canary", value: traffic ? `${traffic}% to v${rolling?.candidate?.version}` : "None" }], quality: [{ label: "Error rate", value: `${(0.1 + (h % 30) / 100).toFixed(2)}%` }, { label: "p95 latency", value: `${22 + (h % 40)} ms` }], cost: [{ label: "Replicas", value: String(2 + (h % 4)) }, { label: "Cost each day", value: usd(18 + (h % 90)) }], time: [{ label: "Promoted", value: "Earlier" }, { label: "Rollback", value: "Ready" }] },
      props: [["Endpoint", `/models/${exp.model}`], ["Policy", "Canary then promote"]], activity: [], href: "/mlops/deployments", hrefLabel: "Open Deployments" });
    for (const [k, v] of reg) if (champ && v.version === champ.version) link(`mv:${k}`, `dep:${exp.model}`, "serves");
    if (rolling?.candidate?.version) { const ck = `${exp.model}:${rolling.candidate.version}`; if (seen.has(`mv:${ck}`)) link(`mv:${ck}`, `dep:${exp.model}`, "canary", { live: rolling.decision === "in-rollout" }); }
    add({ id: `mon:${exp.model}`, lane: 7, kind: "monitor", title: "Monitoring", subtitle: "Drift and quality in production", state: "ok", stateLabel: "No alert",
      figures: { overview: [{ label: "Drift", value: (0.04 + (h % 9) / 100).toFixed(2) }, { label: "Alerts", value: "0" }], quality: [{ label: "Population drift", value: (0.04 + (h % 9) / 100).toFixed(2) }, { label: "Label delay", value: "2 days" }], cost: [{ label: "Checks each day", value: "288" }], time: [{ label: "Last check", value: "4 min ago" }] },
      props: [["Watches", `${exp.model} v${champ.version}`], ["Raises", "A retraining trigger when drift passes the limit"]], activity: [], href: "/observability", hrefLabel: "Open Observability" });
    link(`dep:${exp.model}`, `mon:${exp.model}`, "observed");
  }
  if (policy) {
    const last = cycles[0];
    add({ id: `pol:${policy.id}`, lane: 7, kind: "policy", title: policy.name, subtitle: `${policy.approval === "two-people" ? "Two people approve" : policy.approval === "person" ? "One person approves" : "Automatic"} · ${policy.tier} risk`, state: policy.state === "active" ? (rolling ? "warn" : "ok") : "idle", stateLabel: policy.state === "active" ? (rolling ? "Cycle in progress" : "Watching") : policy.state === "paused" ? "Paused" : "Draft",
      figures: { overview: [{ label: "Champion", value: `v${policy.champion.version}` }, { label: "Cycles", value: String(cycles.length) }], quality: [{ label: "Gate", value: `${policy.gates.metric.replace(/_/g, " ")} ${["mape", "eval_loss"].includes(policy.gates.metric) ? "<=" : ">="} ${policy.gates.floor}` }, { label: "Champion", value: fmt(policy.gates.metric, policy.champion.metric) }], cost: [{ label: "Budget used", value: `${usd(policy.budget.spentUsd)} of ${usd(policy.budget.monthlyUsd)}`, tone: policy.budget.spentUsd / policy.budget.monthlyUsd > 0.85 ? "warn" : "neutral" }, { label: "Cycles each day, at most", value: String(policy.maxCyclesPerDay) }], time: [{ label: "Latest cycle", value: last ? rel(last.startedAt, now) : "None" }] },
      props: [["Starts when", policy.triggers.map((t) => t.kind.replace(/-/g, " ")).join(", ")], ["Window", `${policy.window.kind}, ${policy.window.value}`]], activity: cycles.slice(0, 3).map((c) => ({ at: c.startedAt, what: `${c.id}: ${c.decision.replace(/-/g, " ")}` })), href: "/crucible/continuous", hrefLabel: "Open the policy" });
    if (seen.has(`mon:${exp.model}`)) link(`mon:${exp.model}`, `pol:${policy.id}`, "drift trigger");
    if (cat && seen.has(`rcp:${cat.recipeId}`)) link(`pol:${policy.id}`, `rcp:${cat.recipeId}`, "new data starts a cycle", { loop: true });
    const trained = cycles.find((c) => c.candidate?.runId && seen.has(`run:${c.candidate.runId}`)); if (trained) link(`pol:${policy.id}`, `run:${trained.candidate!.runId}`, "latest cycle trained", { loop: true });
  }

  // ---- layout
  for (const lane of LANES) {
    const col = nodes.filter((n) => n.lane === lane.id); const total = (col.length - 1) * ROW_GAP;
    col.forEach((n, i) => { n.x = lane.id * LANE_GAP; n.y = i * ROW_GAP - total / 2; });
  }
  return { nodes, edges, lanes: LANES.filter((l) => nodes.some((n) => n.lane === l.id)) };
}

/** Everything a node came from and everything that came from it. Loop edges are left out so a trace never goes round. */
export function trace(g: Lineage, id: string): { up: Set<string>; down: Set<string> } {
  const walk = (dir: "up" | "down") => { const out = new Set<string>(); const q = [id]; while (q.length) { const cur = q.pop()!; for (const e of g.edges) { if (e.loop) continue; const [a, b] = dir === "up" ? [e.to, e.from] : [e.from, e.to]; if (a === cur && !out.has(b)) { out.add(b); q.push(b); } } } return out; };
  return { up: walk("up"), down: walk("down") };
}
type Tone2 = Tone;
