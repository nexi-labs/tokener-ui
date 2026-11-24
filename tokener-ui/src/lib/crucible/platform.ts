import type { Experiment, Run } from "./types";

/**
 * Projects, developer machine connections, artifact stores, datasets exposed from the Refinery, and the per run analysis (system metrics, evaluation,
 * model signature, reproducibility, energy). Sample data and rules only. See docs/52.
 */
const H = 3600_000;
const ago = (now: number, hours: number) => new Date(now - hours * H).toISOString();
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rnd = (seed: string) => { let a = hash(seed) || 1; return () => { a ^= a << 13; a >>>= 0; a ^= a >>> 17; a ^= a << 5; a >>>= 0; return a / 4294967296; }; };
const r1 = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

// ---------------------------------------------------------------- artifact stores

export type StoreKind = "s3" | "minio" | "gcs" | "azure" | "r2";
export type StoreAuth = "iam-role" | "access-key" | "workload-identity" | "service-account";
export type StoreStatus = "connected" | "untested" | "failing";
export type ArtifactStore = {
  id: string; name: string; kind: StoreKind; bucket: string; prefix: string; region: string; endpoint?: string;
  auth: StoreAuth; /** A reference into the secret manager. The value is never held here. */ secretRef?: string; roleArn?: string;
  encryption: "SSE-S3" | "SSE-KMS" | "provider-managed"; versioning: boolean; status: StoreStatus; lastTestedAt?: string; testNote?: string;
  isDefault: boolean; managed: boolean; usedGb: number; objects: number; lifecycle: { coldAfterDays: number; expireAfterDays: number | null };
};
export const STORE_LABEL: Record<StoreKind, string> = { s3: "Amazon S3", minio: "MinIO", gcs: "Google Cloud Storage", azure: "Azure Blob Storage", r2: "Cloudflare R2" };
export const STORE_BRAND: Record<StoreKind, string> = { s3: "amazons3", minio: "minio", gcs: "googlecloudstorage", azure: "", r2: "" };
export const AUTH_LABEL: Record<StoreAuth, string> = { "iam-role": "Cross account role", "access-key": "Access key", "workload-identity": "Workload identity", "service-account": "Service account" };
export const AUTHS_FOR: Record<StoreKind, StoreAuth[]> = { s3: ["iam-role", "access-key"], minio: ["access-key"], gcs: ["workload-identity", "service-account"], azure: ["workload-identity", "access-key"], r2: ["access-key"] };

export type StoreDraft = Pick<ArtifactStore, "name" | "kind" | "bucket" | "prefix" | "region" | "endpoint" | "auth" | "secretRef" | "roleArn" | "encryption" | "versioning">;
/** Checks an artifact store before it is saved. A secret must be a reference, a MinIO store needs its own endpoint, and bucket names follow the S3 rules. */
export function validateStore(d: StoreDraft): string[] {
  const e: string[] = [];
  if (!/^[a-z][a-z0-9-]{2,40}$/.test(d.name)) e.push("Use 3 to 41 lowercase letters, digits or hyphens for the name.");
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(d.bucket) || /\.\./.test(d.bucket) || /^\d+\.\d+\.\d+\.\d+$/.test(d.bucket)) e.push("The bucket name must be 3 to 63 lowercase letters, digits, dots or hyphens, and not an IP address.");
  if (d.prefix && (d.prefix.startsWith("/") || d.prefix.includes("//") || /[\\\s]/.test(d.prefix))) e.push("The prefix cannot start with a slash, contain empty parts or spaces.");
  if (!AUTHS_FOR[d.kind].includes(d.auth)) e.push(`${STORE_LABEL[d.kind]} does not support ${AUTH_LABEL[d.auth].toLowerCase()}.`);
  if ((d.kind === "minio" || d.kind === "r2") && !/^https?:\/\/[^\s/]+/.test(d.endpoint ?? "")) e.push("Give the endpoint, for example https://minio.internal.example:9000.");
  if (d.endpoint && /^http:\/\//.test(d.endpoint) && !/^http:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(d.endpoint)) e.push("A plain http endpoint is only allowed on a private network. Use https.");
  if (d.auth === "access-key" || d.auth === "service-account") { if (!d.secretRef) e.push("Choose where the credentials are kept. Paste a reference such as secretref://crucible/stores/name, never the key itself."); else if (!/^secretref:\/\/[\w./-]+$/.test(d.secretRef)) e.push("The credentials must be a reference that starts with secretref://. A key pasted here is refused."); }
  if (d.auth === "iam-role" && !/^arn:aws:iam::\d{12}:role\/[\w+=,.@/-]+$/.test(d.roleArn ?? "")) e.push("Give the role to assume, for example arn:aws:iam::123456789012:role/crucible-artifacts.");
  if (d.kind === "s3" && !d.region) e.push("Choose the bucket's region.");
  return e;
}
export const storeUri = (s: Pick<ArtifactStore, "kind" | "bucket" | "prefix">) => `${{ s3: "s3", minio: "s3", gcs: "gs", azure: "az", r2: "s3" }[s.kind]}://${s.bucket}${s.prefix ? "/" + s.prefix.replace(/\/$/, "") : ""}`;

export function sampleStores(now: number): ArtifactStore[] {
  const base = { encryption: "SSE-KMS" as const, versioning: true, status: "connected" as StoreStatus, lastTestedAt: ago(now, 3), isDefault: false, managed: false };
  return [
    { ...base, id: "store-managed", name: "platform-managed", kind: "s3", bucket: "tokener-nexi-prod-crucible", prefix: "artifacts", region: "eu-west-1", auth: "iam-role", roleArn: "arn:aws:iam::210987654321:role/tokener-crucible", isDefault: true, managed: true, usedGb: 1840, objects: 412_300, lifecycle: { coldAfterDays: 60, expireAfterDays: null }, testNote: "Managed by the platform in your region." },
    { ...base, id: "store-ml-lake", name: "nexi-ml-lake", kind: "s3", bucket: "nexi-ml-lake-eu", prefix: "crucible", region: "eu-central-1", auth: "iam-role", roleArn: "arn:aws:iam::123456789012:role/crucible-artifacts", usedGb: 6420, objects: 1_904_800, lifecycle: { coldAfterDays: 90, expireAfterDays: 730 }, testNote: "Role assumed and a test object written and read back." },
    { ...base, id: "store-minio", name: "onprem-minio", kind: "minio", bucket: "crucible", prefix: "", region: "", endpoint: "https://minio.dc1.nexi.example:9000", auth: "access-key", secretRef: "secretref://crucible/stores/onprem-minio", encryption: "SSE-S3", usedGb: 912, objects: 238_660, lifecycle: { coldAfterDays: 30, expireAfterDays: 365 }, testNote: "Reached over the private link." },
    { ...base, id: "store-gcs", name: "research-gcs", kind: "gcs", bucket: "nexi-research-models", prefix: "runs", region: "europe-west4", auth: "workload-identity", encryption: "provider-managed", status: "untested", lastTestedAt: undefined, usedGb: 0, objects: 0, lifecycle: { coldAfterDays: 90, expireAfterDays: null }, testNote: "Added and not tested yet." },
  ];
}

export type TestOutcome = { ok: boolean; checks: { label: string; ok: boolean; detail: string }[] };
/** A sample connection test. It reaches nothing. It applies the rules a real test would apply, and says so. */
export function testStoreSample(s: ArtifactStore): TestOutcome {
  const problems = validateStore(s); const bad = problems.length > 0;
  const checks = [
    { label: "Credentials", ok: !bad, detail: bad ? problems[0] : s.auth === "iam-role" ? "The role can be assumed with an external ID." : s.auth === "workload-identity" ? "The workload identity is trusted by the bucket." : `Read from ${s.secretRef}.` },
    { label: "Bucket reachable", ok: !bad && s.status !== "failing", detail: !bad && s.status !== "failing" ? `${s.bucket} answered a head request.` : "The bucket did not answer." },
    { label: "Write and read back", ok: !bad && s.status !== "failing", detail: !bad && s.status !== "failing" ? "A small test object was written, read and deleted." : "Skipped." },
    { label: "Presigned upload", ok: !bad && s.status !== "failing", detail: !bad && s.status !== "failing" ? "A short lived upload address worked from outside the platform." : "Skipped." },
    { label: "Versioning and encryption", ok: !bad && (s.versioning || s.kind !== "s3"), detail: s.versioning ? `Versioning is on and objects are encrypted with ${s.encryption}.` : "Versioning is off. A run's artifacts could be overwritten." },
  ];
  return { ok: checks.every((c) => c.ok), checks };
}

// ---------------------------------------------------------------- projects, keys, machines

export type KeyScope = "log" | "read" | "register";
export type ApiKey = { id: string; projectId: string; name: string; prefix: string; secretRef: string; scopes: KeyScope[]; createdAt: string; createdBy: string; expiresAt: string; lastUsedAt?: string; revokedAt?: string };
export type MachineKind = "laptop" | "workstation" | "notebook" | "ci" | "cluster";
export type Machine = { id: string; projectId: string; keyId: string; name: string; kind: MachineKind; user: string; os: string; python: string; sdk: string; state: "pending" | "online" | "idle" | "revoked"; firstSeenAt?: string; lastSeenAt?: string; runsLogged: number; ip?: string };
export type Project = {
  id: string; name: string; description: string; owner: string; department: string; storeId: string; experimentIds: string[];
  repo: { url: string; branch: string; path: string }; python: string; envTool: "uv" | "pip" | "conda" | "poetry" | "docker"; lockfile: string; entry: string; params: { name: string; type: "float" | "int" | "str"; default: string }[]; createdAt: string;
};
export const MACHINE_LABEL: Record<MachineKind, string> = { laptop: "Laptop", workstation: "GPU workstation", notebook: "Notebook server", ci: "CI runner", cluster: "Cluster job" };
export const SCOPE_LABEL: Record<KeyScope, string> = { log: "Log runs and artifacts", read: "Read runs and datasets", register: "Register models" };

export function validateProject(d: { name: string; storeId: string; repoUrl: string; branch: string; entry: string; python: string }, existing: string[]): string[] {
  const e: string[] = [];
  if (!/^[a-z][a-z0-9-]{2,40}$/.test(d.name)) e.push("Use 3 to 41 lowercase letters, digits or hyphens for the project name.");
  if (existing.includes(d.name)) e.push("A project with this name already exists.");
  if (!d.storeId) e.push("Choose where artifacts are stored.");
  if (d.repoUrl && !/^(https:\/\/|git@)[\w.@:/-]+$/.test(d.repoUrl)) e.push("Use an https or git@ address for the repository. Credentials in the address are refused.");
  if (/^https:\/\/[^/@]+@/.test(d.repoUrl)) e.push("The repository address contains credentials. Remove them and use a deploy key.");
  if (!/^[\w./-]+\.py$|^[\w./-]+$/.test(d.entry)) e.push("Give the file or command that starts training, for example train.py.");
  if (!/^3\.(9|10|11|12|13)$/.test(d.python)) e.push("Choose Python 3.9 to 3.13.");
  return e;
}
/** A key is shown once, then only its prefix and a reference remain. This makes a sample token that is clearly marked as one. */
export function sampleToken(seed: string) { const r = rnd(seed); const c = "abcdefghijklmnopqrstuvwxyz0123456789"; const body = Array.from({ length: 28 }, () => c[Math.floor(r() * c.length)]).join(""); return { token: `crk_sample_${body}`, prefix: `crk_sample_${body.slice(0, 4)}` }; }
export const keyRef = (projectId: string, keyId: string) => `secretref://crucible/projects/${projectId}/keys/${keyId}`;

export function sampleProjects(now: number): { projects: Project[]; keys: ApiKey[]; machines: Machine[] } {
  const projects: Project[] = [
    { id: "prj-support", name: "support-classifier", description: "Routes inbound tickets to an intent and a priority.", owner: "priya.nair@nexi.example", department: "Customer Support", storeId: "store-ml-lake", experimentIds: ["exp-support"], repo: { url: "https://github.com/nexi-ai/support-classifier", branch: "main", path: "." }, python: "3.11", envTool: "uv", lockfile: "uv.lock", entry: "train.py", params: [{ name: "lr", type: "float", default: "2e-5" }, { name: "epochs", type: "int", default: "3" }, { name: "model", type: "str", default: "xlm-roberta-base" }], createdAt: ago(now, 24 * 190) },
    { id: "prj-fraud", name: "fraud-scorer", description: "Scores card transactions in real time.", owner: "aisha.bello@nexi.example", department: "Risk", storeId: "store-managed", experimentIds: ["exp-fraud"], repo: { url: "https://github.com/nexi-ai/fraud-scorer", branch: "main", path: "." }, python: "3.10", envTool: "poetry", lockfile: "poetry.lock", entry: "python -m fraud.train", params: [{ name: "max_depth", type: "int", default: "8" }, { name: "learning_rate", type: "float", default: "0.05" }], createdAt: ago(now, 24 * 260) },
    { id: "prj-forecast", name: "demand-forecast", description: "Weekly demand by region and category.", owner: "tom.eze@nexi.example", department: "Operations", storeId: "store-minio", experimentIds: ["exp-forecast"], repo: { url: "https://gitlab.nexi.example/ops/demand-forecast", branch: "release", path: "model" }, python: "3.11", envTool: "conda", lockfile: "environment.lock.yml", entry: "train.py", params: [{ name: "horizon", type: "int", default: "12" }], createdAt: ago(now, 24 * 120) },
    { id: "prj-assistant", name: "support-assistant", description: "Fine tuned assistant for agents in the support desk.", owner: "priya.nair@nexi.example", department: "Customer Support", storeId: "store-ml-lake", experimentIds: ["exp-llm"], repo: { url: "https://github.com/nexi-ai/support-assistant", branch: "main", path: "." }, python: "3.12", envTool: "uv", lockfile: "uv.lock", entry: "train_lora.py", params: [{ name: "rank", type: "int", default: "64" }, { name: "lr", type: "float", default: "2e-4" }], createdAt: ago(now, 24 * 70) },
  ];
  const keys: ApiKey[] = [
    { id: "k1", projectId: "prj-support", name: "priya-laptop", prefix: "crk_live_8f3a", secretRef: keyRef("prj-support", "k1"), scopes: ["log", "read", "register"], createdAt: ago(now, 24 * 80), createdBy: "priya.nair@nexi.example", expiresAt: ago(now, -24 * 285), lastUsedAt: ago(now, 0.4) },
    { id: "k2", projectId: "prj-support", name: "ci-training", prefix: "crk_live_21c9", secretRef: keyRef("prj-support", "k2"), scopes: ["log", "read"], createdAt: ago(now, 24 * 40), createdBy: "marcus.lee@nexi.example", expiresAt: ago(now, -24 * 20), lastUsedAt: ago(now, 5) },
    { id: "k3", projectId: "prj-fraud", name: "aisha-workstation", prefix: "crk_live_b04e", secretRef: keyRef("prj-fraud", "k3"), scopes: ["log", "read", "register"], createdAt: ago(now, 24 * 200), createdBy: "aisha.bello@nexi.example", expiresAt: ago(now, -24 * 165), lastUsedAt: ago(now, 28) },
    { id: "k4", projectId: "prj-assistant", name: "gpu-box-7", prefix: "crk_live_7d1b", secretRef: keyRef("prj-assistant", "k4"), scopes: ["log", "read"], createdAt: ago(now, 24 * 30), createdBy: "priya.nair@nexi.example", expiresAt: ago(now, -24 * 335), lastUsedAt: ago(now, 2.2) },
    { id: "k5", projectId: "prj-forecast", name: "old-laptop", prefix: "crk_live_5aa0", secretRef: keyRef("prj-forecast", "k5"), scopes: ["log"], createdAt: ago(now, 24 * 110), createdBy: "tom.eze@nexi.example", expiresAt: ago(now, -24 * 255), lastUsedAt: ago(now, 24 * 41), revokedAt: ago(now, 24 * 40) },
  ];
  const m = (o: Omit<Machine, "state"> & { state?: Machine["state"] }): Machine => ({ state: "online", ...o });
  const machines: Machine[] = [
    m({ id: "m1", projectId: "prj-support", keyId: "k1", name: "priya-mbp", kind: "laptop", user: "priya.nair", os: "macOS 15.1 arm64", python: "3.11.9", sdk: "0.1.0-sample", firstSeenAt: ago(now, 24 * 79), lastSeenAt: ago(now, 0.4), runsLogged: 61, ip: "10.20.4.18" }),
    m({ id: "m2", projectId: "prj-support", keyId: "k2", name: "gha-runner-eu-3", kind: "ci", user: "ci-training", os: "Ubuntu 22.04 x86_64", python: "3.11.9", sdk: "0.1.0-sample", firstSeenAt: ago(now, 24 * 39), lastSeenAt: ago(now, 5), state: "idle", runsLogged: 38, ip: "10.40.9.211" }),
    m({ id: "m3", projectId: "prj-fraud", keyId: "k3", name: "aisha-ws", kind: "workstation", user: "aisha.bello", os: "Ubuntu 24.04 x86_64, 1 x RTX 4090", python: "3.10.14", sdk: "0.1.0-sample", firstSeenAt: ago(now, 24 * 199), lastSeenAt: ago(now, 28), state: "idle", runsLogged: 112, ip: "10.20.7.5" }),
    m({ id: "m4", projectId: "prj-assistant", keyId: "k4", name: "gpu-box-7", kind: "workstation", user: "priya.nair", os: "Ubuntu 22.04 x86_64, 8 x H100", python: "3.12.4", sdk: "0.1.0-sample", firstSeenAt: ago(now, 24 * 29), lastSeenAt: ago(now, 2.2), runsLogged: 17, ip: "10.30.1.77" }),
    m({ id: "m5", projectId: "prj-forecast", keyId: "k5", name: "toms-thinkpad", kind: "laptop", user: "tom.eze", os: "Windows 11 x86_64", python: "3.11.8", sdk: "0.1.0-sample", firstSeenAt: ago(now, 24 * 109), lastSeenAt: ago(now, 24 * 41), state: "revoked", runsLogged: 49, ip: "10.20.12.40" }),
  ];
  return { projects, keys, machines };
}

/** The file a project keeps at its root so a run can be repeated from anywhere. Modelled on MLproject, with storage, data and limits added. */
export function projectYaml(p: Project, store: Pick<ArtifactStore, "name">, dataset?: { name: string; version: number }): string {
  return [
    `name: ${p.name}`,
    `python: "${p.python}"`,
    `environment:`, `  tool: ${p.envTool}`, `  lockfile: ${p.lockfile}`,
    `storage: ${store.name}`,
    ...(dataset ? [`data:`, `  - dataset: ${dataset.name}`, `    version: ${dataset.version}   # pinned; remove to follow the latest`] : []),
    `entry_points:`, `  main:`,
    `    command: "${p.entry.endsWith(".py") ? `python ${p.entry}` : p.entry}${p.params.map((x) => ` --${x.name} {${x.name}}`).join("")}"`,
    ...(p.params.length ? [`    parameters:`, ...p.params.flatMap((x) => [`      ${x.name}: { type: ${x.type}, default: ${x.default} }`])] : []),
    `limits:`, `  gpus: 1`, `  max_hours: 12`, `  memory_check: required`,
  ].join("\n");
}
export function connectSnippets(p: Project, host = "https://crucible.nexi.example") {
  return {
    install: `pip install crucible-sdk   # not published yet, see docs/52`,
    env: `export CRUCIBLE_URL=${host}\nexport CRUCIBLE_PROJECT=${p.name}\n# The key comes from your secret manager. Never write it in code or commit it.\nexport CRUCIBLE_API_KEY="$(your-secret-tool read ${keyRef(p.id, "<key id>")})"`,
    python: `import crucible\n\ncrucible.init()                       # reads the three variables above\ncrucible.autolog()                    # frameworks are logged without more code\n\nwith crucible.start_run(name="xlmr-base-lr2e-5") as run:\n    run.log_params({"lr": 2e-5, "epochs": 3})\n    for step, loss in enumerate(train()):\n        run.log_metric("train_loss", loss, step=step)\n    run.log_dataset("support-tickets-unified", version=17)   # pins the Refinery output\n    run.log_artifact("reports/confusion.png")                 # goes straight to the store\n    run.log_model(model, name="${p.name}")`,
    mlflow: `# Existing MLflow code keeps working. Point it at Crucible.\nexport MLFLOW_TRACKING_URI=${host}/mlflow\nexport MLFLOW_TRACKING_TOKEN="$(your-secret-tool read ${keyRef(p.id, "<key id>")})"`,
    cli: `crucible login --url ${host}\ncrucible run --project ${p.name} --queue default --gpus 1`,
  };
}

// ---------------------------------------------------------------- datasets exposed from the Refinery

export type DatasetColumn = { name: string; type: string; nullPct: number; pii: "none" | "masked" | "found"; role?: "id" | "label" | "feature" | "text" | "time" };
export type DatasetVersionInfo = { version: number; rows: number; quality: number; createdAt: string; refineryRun: string; piiClean: boolean; schemaChanged: boolean; note: string; splits: { train: number; validation: number; test: number } };
export type CatalogDataset = {
  id: string; name: string; description: string; recipe: string; recipeId: string; inputs: { name: string; kind: string }[]; steps: string[]; owner: string; exposedAt: string; exposed: boolean;
  columns: DatasetColumn[]; versions: DatasetVersionInfo[]; format: "parquet" | "delta" | "iceberg" | "jsonl"; location: string; tags: string[];
};
const cols = (...c: [string, string, number, DatasetColumn["pii"], DatasetColumn["role"]?][]): DatasetColumn[] => c.map(([name, type, nullPct, pii, role]) => ({ name, type, nullPct, pii, role }));

/** The cleaned outputs of Refinery recipes. A recipe's output becomes a Crucible dataset when it is exposed, and runs then pin a version of it. */
export function sampleCatalog(now: number): CatalogDataset[] {
  const v = (version: number, rows: number, quality: number, hoursAgo: number, run: string, note: string, schemaChanged = false, piiClean = true): DatasetVersionInfo => ({ version, rows, quality, createdAt: ago(now, hoursAgo), refineryRun: run, piiClean, schemaChanged, note, splits: { train: Math.round(rows * 0.8), validation: Math.round(rows * 0.1), test: rows - Math.round(rows * 0.8) - Math.round(rows * 0.1) } });
  return [
    { id: "cds-support", name: "support-tickets-unified", description: "Tickets from the helpdesk and the chat tool, deduplicated, with personal data masked and the topic labelled.", recipe: "support-tickets-clean", recipeId: "rcp_support_clean", inputs: [{ name: "support_tickets_raw", kind: "Helpdesk export" }, { name: "chat_transcripts", kind: "Chat tool" }], steps: ["trim", "case", "fill_missing", "drop_duplicates", "cast", "clip_outliers", "pii_mask", "ai_classify", "split"], owner: "Priya Nair", exposedAt: ago(now, 24 * 190), exposed: true, format: "delta", location: "data-lake-eu / curated/support/", tags: ["text", "pii-masked"],
      columns: cols(["ticket_id", "integer", 0, "none", "id"], ["created_at", "timestamp", 0, "none", "time"], ["subject", "string", 0.4, "masked", "text"], ["body", "string", 0.2, "masked", "text"], ["language", "string", 0.1, "none", "feature"], ["channel", "string", 0, "none", "feature"], ["priority", "string", 1.2, "none", "label"], ["topic", "string", 0.6, "none", "label"], ["csat", "integer", 18.4, "none", "feature"]),
      versions: [v(17, 489_900, 0.97, 52, "rf-run-3571", "Added 28,700 tickets from week 44. Schema unchanged."), v(16, 461_200, 0.97, 24 * 8, "rf-run-3490", "Added a language column for Arabic.", true), v(15, 438_500, 0.96, 24 * 15, "rf-run-3402", "Fixed a duplicate ticket join."), v(14, 412_000, 0.95, 24 * 22, "rf-run-3318", "First version with the topic label.")] },
    { id: "cds-fraud", name: "card-transactions-features", description: "Card transactions with velocity, merchant and device features, one row for each authorisation.", recipe: "transactions-features", recipeId: "rcp_orders_stream", inputs: [{ name: "orders", kind: "Change stream" }, { name: "device_events", kind: "Topic" }], steps: ["trim", "cast", "window_agg", "join", "clip_outliers", "split"], owner: "Aisha Bello", exposedAt: ago(now, 24 * 255), exposed: true, format: "iceberg", location: "data-lake-eu / curated/risk/", tags: ["tabular", "stream"],
      columns: cols(["txn_id", "string", 0, "none", "id"], ["ts", "timestamp", 0, "none", "time"], ["amount", "decimal", 0, "none", "feature"], ["merchant_cat", "string", 0.3, "none", "feature"], ["velocity_1h", "integer", 0, "none", "feature"], ["device_age_days", "integer", 4.2, "none", "feature"], ["card_hash", "string", 0, "masked", "feature"], ["is_fraud", "boolean", 0, "none", "label"]),
      versions: [v(8, 18_400_000, 0.98, 24 * 3, "rf-run-3011", "Weekly refresh."), v(7, 17_100_000, 0.98, 24 * 10, "rf-run-2950", "Weekly refresh.")] },
    { id: "cds-sales", name: "sales-weekly-unified", description: "Weekly sales by region and category with calendar and promotion features.", recipe: "customers-churn-features", recipeId: "rcp_churn_features", inputs: [{ name: "orders", kind: "Change stream" }, { name: "customers_crm", kind: "Database" }], steps: ["join", "calendar_parts", "bucket", "fill_missing", "split"], owner: "Tom Eze", exposedAt: ago(now, 24 * 118), exposed: true, format: "parquet", location: "data-lake-eu / curated/sales/", tags: ["time series"],
      columns: cols(["week", "date", 0, "none", "time"], ["region", "string", 0, "none", "feature"], ["category", "string", 0, "none", "feature"], ["units", "integer", 0.1, "none", "label"], ["promo", "boolean", 0, "none", "feature"]),
      versions: [v(5, 2_950_000, 0.94, 24 * 6, "rf-run-2977", "Added the holiday calendar for four more countries.")] },
    { id: "cds-dialogues", name: "support-dialogues-curated", description: "Agent and customer conversations that were rated good, for fine tuning an assistant.", recipe: "dialogues-curate", recipeId: "rcp_tickets_stream", inputs: [{ name: "chat_transcripts", kind: "Chat tool" }], steps: ["trim", "pii_mask", "ai_classify", "drop_duplicates", "split"], owner: "Priya Nair", exposedAt: ago(now, 24 * 70), exposed: true, format: "jsonl", location: "data-lake-eu / curated/dialogues/", tags: ["text", "pii-masked", "fine-tuning"],
      columns: cols(["dialogue_id", "string", 0, "none", "id"], ["messages", "json", 0, "masked", "text"], ["rating", "integer", 0, "none", "label"], ["language", "string", 0, "none", "feature"]),
      versions: [v(3, 96_400, 0.93, 24 * 12, "rf-run-3120", "Kept only conversations rated 4 or 5.")] },
    { id: "cds-reviews", name: "reviews-for-finetune", description: "Product reviews prepared as a fine tuning set.", recipe: "reviews-for-finetune", recipeId: "rcp_reviews", inputs: [{ name: "product_reviews_q3", kind: "Upload" }], steps: ["trim", "pii_mask", "drop_duplicates", "split"], owner: "Amira Haddad", exposedAt: "", exposed: false, format: "parquet", location: "data-lake-eu / curated/reviews/", tags: ["text"],
      columns: cols(["review_id", "integer", 0, "none", "id"], ["review_text", "string", 0.2, "masked", "text"], ["rating", "integer", 0, "none", "label"]),
      versions: [v(2, 318_900, 0.95, 24 * 2, "rf-run-3601", "Masked email addresses and phone numbers.")] },
    { id: "cds-churn", name: "customers-churn-features", description: "Feature engineering for the churn model: calendar parts, buckets and activity counts.", recipe: "customers-churn-features", recipeId: "rcp_churn_features", inputs: [{ name: "customers_crm", kind: "Database" }], steps: ["calendar_parts", "bucket", "fill_missing", "split"], owner: "Lucas Silva", exposedAt: "", exposed: false, format: "delta", location: "data-lake-eu / curated/churn/", tags: ["tabular"],
      columns: cols(["customer_id", "integer", 0, "none", "id"], ["signup_month", "integer", 0, "none", "feature"], ["mrr_bucket", "string", 0, "none", "feature"], ["churned", "boolean", 0, "none", "label"], ["email", "string", 0, "found", "feature"]),
      versions: [v(4, 1_204_118, 0.91, 24 * 1, "rf-run-3620", "An email column is still present and not masked.", false, false)] },
  ];
}
export function exposeProblems(d: CatalogDataset): string[] {
  const e: string[] = []; const latest = d.versions[0];
  if (!latest) e.push("The recipe has not produced a version yet.");
  else {
    if (!latest.piiClean || d.columns.some((c) => c.pii === "found")) e.push(`Personal data was found in ${d.columns.filter((c) => c.pii === "found").map((c) => c.name).join(", ") || "the latest version"}. Mask it in the recipe, then run it again.`);
    if (latest.quality < 0.8) e.push(`The quality score is ${Math.round(latest.quality * 100)} percent. A dataset needs at least 80 percent to be exposed.`);
    if (!d.columns.some((c) => c.role === "id")) e.push("Mark a column as the identifier so rows can be traced.");
  }
  return e;
}

// ---------------------------------------------------------------- per run analysis (all derived, deterministic, sample)

export type SystemSeries = { key: string; label: string; unit: string; values: number[] };
/** Machine metrics sampled during a run. In a live workspace the SDK sends these every few seconds. */
export function systemSeries(run: Run): SystemSeries[] {
  const r = rnd(run.id + "sys"); const n = run.steps.length; const gpu = run.gpus.count > 0; const llm = run.experimentId === "exp-llm";
  const wave = (base: number, amp: number, jitter: number, lo = 0, hi = Infinity) => Array.from({ length: n }, (_, i) => r1(Math.min(hi, Math.max(lo, (i < 2 ? base * 0.4 : base) + Math.sin(i / 3) * amp + (r() - 0.5) * jitter)), 1));
  const out: SystemSeries[] = [];
  if (gpu) {
    out.push({ key: "gpu_util", label: "GPU utilisation", unit: "%", values: wave(llm ? 92 : 78, 4, 6, 0, 100) });
    if (run.series.gpu_mem_gb) out.push({ key: "gpu_mem", label: "GPU memory", unit: "GB", values: run.series.gpu_mem_gb });
    out.push({ key: "gpu_power", label: "GPU power", unit: "W", values: wave(llm ? 610 : 290, 25, 30, 0) });
    out.push({ key: "gpu_temp", label: "GPU temperature", unit: "C", values: wave(llm ? 71 : 64, 2, 3, 20, 95) });
    out.push({ key: "throughput", label: llm ? "Tokens each second" : "Samples each second", unit: llm ? "tok/s" : "/s", values: wave(llm ? 24_800 : 410, llm ? 900 : 18, llm ? 1200 : 25, 0) });
  }
  out.push({ key: "cpu", label: "CPU utilisation", unit: "%", values: wave(gpu ? 38 : 82, 6, 8, 0, 100) });
  out.push({ key: "ram", label: "Host memory", unit: "GB", values: wave(gpu ? 46 : 18, 2, 3, 1) });
  out.push({ key: "disk_read", label: "Disk read", unit: "MB/s", values: wave(gpu ? 210 : 90, 40, 60, 0) });
  out.push({ key: "net", label: "Network in", unit: "MB/s", values: wave(gpu ? 54 : 12, 10, 14, 0) });
  return out;
}
export type Energy = { kwh: number; kgco2e: number; avgPowerW: number };
/** Energy estimate: measured average GPU power for the run, the host at a fixed share, a data centre overhead of 1.2 and a grid factor. A planning figure, not a metered one. */
export function energy(run: Run, gridKgPerKwh = 0.26): Energy {
  if (!run.gpuHours) return { kwh: r1(run.costUsd * 0.2, 2), kgco2e: r1(run.costUsd * 0.2 * gridKgPerKwh, 2), avgPowerW: 0 };
  const p = systemSeries(run).find((s) => s.key === "gpu_power"); const avg = p ? p.values.reduce((a, b) => a + b, 0) / p.values.length : 300;
  const kwh = (run.gpuHours * (avg + 90) * 1.2) / 1000;
  return { kwh: r1(kwh, 1), kgco2e: r1(kwh * gridKgPerKwh, 1), avgPowerW: Math.round(avg) };
}
/** Series the framework would log without being asked: the learning rate schedule, gradient norm and loss scale. */
export function dynamicsSeries(run: Run): SystemSeries[] {
  const lr = Number(run.params.lr ?? run.params.learning_rate); if (!Number.isFinite(lr) || lr <= 0 || run.experimentId === "exp-forecast") return [];
  const r = rnd(run.id + "dyn"); const n = run.steps.length; const w = Math.max(1, Math.round(n * Number(run.params.warmup ?? 0.06)));
  return [
    { key: "learning_rate", label: "Learning rate", unit: "", values: run.steps.map((_, i) => (i < w ? lr * ((i + 1) / w) : lr * 0.5 * (1 + Math.cos((Math.PI * (i - w)) / Math.max(1, n - w))) + lr * 0.02)) },
    { key: "grad_norm", label: "Gradient norm", unit: "", values: run.steps.map((_, i) => r1(0.35 + 2.6 * Math.exp(-i / 7) + (r() - 0.5) * 0.25, 2)) },
  ];
}

export type SliceRow = { group: string; slice: string; support: number; value: number; delta: number };
export type Evaluation = { metric: string; slices: SliceRow[]; fairnessGap: number; ece: number; p50Ms: number; p95Ms: number; costPer1k: number; confusion?: { labels: string[]; matrix: number[][] } };
const SLICES: Record<string, Record<string, string[]>> = {
  "exp-support": { Language: ["English", "German", "French", "Spanish", "Arabic"], Channel: ["Email", "Chat", "Phone transcript"], Plan: ["Free", "Pro", "Enterprise"] },
  "exp-fraud": { Region: ["EU", "UK", "North America"], "Card type": ["Debit", "Credit", "Prepaid"], "Amount": ["Under 50", "50 to 500", "Over 500"] },
  "exp-forecast": { Region: ["North", "South", "East", "West"], Category: ["Grocery", "Home", "Electronics"] },
  "exp-llm": { Task: ["Summarise", "Extract", "Classify", "Rewrite"], Language: ["English", "German", "French"] },
};
const INTENTS = ["Billing", "Login", "Outage", "How to", "Refund", "Other"];
export function evaluation(run: Run, exp: Pick<Experiment, "id">, primary: string): Evaluation {
  const r = rnd(run.id + "eval"); const final = run.metrics[primary] ?? 0.9; const lower = ["mape", "eval_loss", "val_loss"].includes(primary);
  const slices: SliceRow[] = []; let worst = 0, best = 0;
  for (const [group, list] of Object.entries(SLICES[exp.id] ?? {})) for (const s of list) {
    const d = (r() - 0.62) * (lower ? 0.04 : 0.05) * (primary === "eval_loss" ? 10 : 1); const v = final + (lower ? -d : d);
    slices.push({ group, slice: s, support: Math.round(6000 + r() * 90_000), value: r1(v, 3), delta: r1(v - final, 3) }); worst = Math.min(worst, lower ? -d : d); best = Math.max(best, lower ? -d : d);
  }
  const confusion = exp.id === "exp-support" ? (() => { const m = INTENTS.map((_, i) => { const row = INTENTS.map((__, j) => (i === j ? final : (1 - final) / (INTENTS.length - 1) * (0.5 + r()))); const t = row.reduce((a, b) => a + b, 0); return row.map((x) => r1(x / t, 3)); }); return { labels: INTENTS, matrix: m }; })() : undefined;
  return { metric: primary, slices, fairnessGap: r1(best - worst, 3), ece: r1(0.012 + r() * 0.03, 3), p50Ms: r1(run.gpus.count ? 9 + r() * 14 : 2 + r() * 4, 1), p95Ms: r1(run.gpus.count ? 31 + r() * 38 : 7 + r() * 9, 1), costPer1k: r1(run.experimentId === "exp-llm" ? 0.9 + r() * 0.6 : 0.012 + r() * 0.03, 3), confusion };
}

export type Signature = { flavor: string; inputs: { name: string; type: string; note?: string }[]; outputs: { name: string; type: string; note?: string }[]; example: string; sizeMb: number; requirements: string[] };
export function signature(run: Run): Signature {
  const size = run.artifacts.find((a) => a.kind === "model")?.sizeMb ?? 0;
  switch (run.experimentId) {
    case "exp-support": return { flavor: "transformers", inputs: [{ name: "text", type: "string", note: "Subject and body joined" }, { name: "language", type: "string", note: "Optional, detected when absent" }], outputs: [{ name: "intent", type: "string", note: "One of 24 intents" }, { name: "priority", type: "string" }, { name: "confidence", type: "float" }], example: `{"text": "I was charged twice for May", "language": "en"}`, sizeMb: size, requirements: ["torch==2.3.1", "transformers==4.44.2", "numpy==1.26.4"] };
    case "exp-fraud": return { flavor: "lightgbm", inputs: [{ name: "amount", type: "double" }, { name: "merchant_cat", type: "string" }, { name: "velocity_1h", type: "long" }, { name: "device_age_days", type: "long", note: "Optional" }], outputs: [{ name: "score", type: "double", note: "0 to 1" }], example: `{"amount": 42.5, "merchant_cat": "5411", "velocity_1h": 2, "device_age_days": 311}`, sizeMb: size, requirements: ["lightgbm==4.3.0", "scikit-learn==1.5.1", "pandas==2.2.2"] };
    case "exp-forecast": return { flavor: "pytorch", inputs: [{ name: "history", type: "tensor(float32) [168, 6]", note: "Weekly units and calendar features" }, { name: "region", type: "string" }], outputs: [{ name: "forecast", type: "tensor(float32) [12, 3]", note: "Median and two quantiles" }], example: `{"region": "north", "history": "[168 rows]"}`, sizeMb: size, requirements: ["torch==2.3.1", "pytorch-forecasting==1.1.1"] };
    default: return { flavor: "peft adapter", inputs: [{ name: "messages", type: "list<{role, content}>", note: "Chat format" }, { name: "max_tokens", type: "integer", note: "Optional" }], outputs: [{ name: "completion", type: "string" }], example: `{"messages": [{"role": "user", "content": "Summarise ticket 48122"}]}`, sizeMb: size, requirements: ["torch==2.3.1", "transformers==4.44.2", "peft==0.12.0", "bitsandbytes==0.43.3"] };
  }
}

export type ReproCheck = { id: string; label: string; ok: boolean; detail: string };
export type Repro = { python: string; packages: { name: string; version: string }[]; lockHash: string; dirty: boolean; diffStat?: string; checks: ReproCheck[]; score: number; command: string; host: string };
/** Whether a run can be repeated: data pinned, code committed, environment locked, seed set, image pinned by digest, hardware recorded. */
export function repro(run: Run): Repro {
  const dirty = run.id === "run-2310"; const pkgs = signature(run).requirements.map((r) => { const [name, version] = r.split("=="); return { name, version }; });
  const checks: ReproCheck[] = [
    { id: "data", label: "Data version pinned", ok: !!run.dataset.version, detail: `${run.dataset.name} v${run.dataset.version} from Refinery run ${run.dataset.refineryRun}` },
    { id: "code", label: "Code committed and clean", ok: !dirty, detail: dirty ? "Run from a working tree with 2 changed files. The change is saved as a patch." : `${run.code.repo} at ${run.code.commit}` },
    { id: "env", label: "Environment locked", ok: true, detail: "Dependencies recorded from the lock file." },
    { id: "seed", label: "Random seed set", ok: Number.isFinite(run.seed), detail: `Seed ${run.seed}` },
    { id: "image", label: "Image pinned by digest", ok: /^sha256:/.test(run.image.digest), detail: run.image.digest.slice(0, 19) + "..." },
    { id: "hw", label: "Hardware recorded", ok: true, detail: run.gpus.count ? `${run.gpus.count} x ${run.gpus.card}` : "CPU only" },
  ];
  return { python: run.experimentId === "exp-llm" ? "3.12.4" : "3.11.9", packages: pkgs, lockHash: hash(run.id + "lock").toString(16).padStart(8, "0") + hash(run.id + "l2").toString(16).padStart(8, "0"), dirty, diffStat: dirty ? "2 files changed, 14 insertions(+), 3 deletions(-)" : undefined, checks, score: checks.filter((c) => c.ok).length, command: `crucible repro ${run.id}`, host: run.gpus.count ? `${run.gpus.count}-gpu node` : "CPU node" };
}
