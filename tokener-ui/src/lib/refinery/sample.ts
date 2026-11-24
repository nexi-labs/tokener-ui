import { profileRows } from "./profile";
import { STEP_BY_OP, describe, planPartitions, runSteps, startFrame } from "./steps";
import { needsConversion } from "./formats";
import type { ColType, Connection, Dataset, LogLine, Partition, Recipe, Row, RunRecord, RunnerPool, StageInfo, StepStat, StreamJob } from "./types";

/**
 * Sample workspace for Refinery. The rows are generated here with fixed seeds and deliberately messy (stray spaces, mixed case, repeated tickets, text in numeric
 * columns, personal data inside free text) so the profile and the recipe preview have something real to compute on. Every count and rate beside them is an example.
 */
export const SAMPLE_TENANT = "00000000-0000-4000-8000-0000000000b1";

function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = <T,>(r: () => number, xs: T[]): T => xs[Math.floor(r() * xs.length)];
const iso = (d: Date) => d.toISOString();
const ago = (ms: number) => iso(new Date(Date.now() - ms));
const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
const FIRST = ["Amira", "Jonas", "Priya", "Lucas", "Fatima", "Noah", "Elena", "Omar", "Chloe", "Kenji", "Sara", "Mateo"];
const LAST = ["Haddad", "Meyer", "Nair", "Silva", "Khan", "Walker", "Petrov", "Said", "Martin", "Tanaka", "Lopez", "Berg"];
const date = (r: () => number, from: string, days: number) => new Date(Date.parse(from) + Math.floor(r() * days) * DAY).toISOString().slice(0, 10);

function tickets(): Row[] {
  const r = rng(11); const rows: Row[] = [];
  const subjects = ["Cannot log in", "Invoice shows wrong amount", "API returns 500 errors", "How do I export my data", "Refund request", "Dashboard is slow", "Need to change plan", "SSO setup question"];
  const bodies = [
    "Hi team, I have been unable to sign in since this morning. My email is {e} and you can reach me on {p}. Please help.",
    "The invoice for October lists two seats we removed. Contact {e} for the account details.",
    "Our integration started failing with a 500 error around 09:00 UTC. Call {p} if you need logs.",
    "Could you explain how to export every conversation as CSV? Thanks, {n}.",
    "Please refund the duplicate charge on our card. Reply to {e}.",
    "The dashboard takes more than a minute to load for our whole team.",
    "We would like to move to the annual plan. Who should I speak to?",
    "SSO redirects back to the login page after the identity provider approves. {e}",
  ];
  for (let i = 0; i < 600; i++) {
    const n = `${pick(r, FIRST)} ${pick(r, LAST)}`; const em = `${n.toLowerCase().replace(" ", ".")}@${pick(r, ["acme.com", "northwind.io", "contoso.net", "example.org"])}`;
    const si = Math.floor(r() * subjects.length);
    const sp = (s: string) => (r() < 0.18 ? `  ${s} ` : r() < 0.1 ? s.toUpperCase() : s);
    const prio = r() < 0.12 ? null : pick(r, ["Low", "low", "High", "HIGH", "normal", " Normal", "urgent", "medium"]);
    const csat = r() < 0.15 ? null : r() < 0.05 ? "N/A" : 1 + Math.floor(r() * 5);
    const res = r() < 0.03 ? Math.round(5000 + r() * 40000) : Math.round(10 + r() * 600);
    rows.push({
      ticket_id: 100000 + (r() < 0.06 && i > 10 ? Math.floor(r() * i) : i),
      created_at: date(r, "2026-08-01", 90), customer_email: r() < 0.05 ? null : (r() < 0.1 ? em.toUpperCase() : em),
      subject: sp(subjects[si]), body: bodies[si].replace("{e}", em).replace("{p}", `+1 ${200 + Math.floor(r() * 700)} ${100 + Math.floor(r() * 800)} ${1000 + Math.floor(r() * 8000)}`).replace("{n}", n),
      priority: prio, channel: pick(r, ["email", "Email", "chat", "Chat", "phone", "web", "WEB"]), csat: csat as any, resolution_minutes: res,
    });
  }
  return rows;
}

function customers(): Row[] {
  const r = rng(23); const rows: Row[] = [];
  for (let i = 0; i < 500; i++) {
    const n = `${pick(r, FIRST)} ${pick(r, LAST)}`; const em = `${n.toLowerCase().replace(" ", ".")}${r() < 0.5 ? Math.floor(r() * 90) : ""}@${pick(r, ["acme.com", "northwind.io", "contoso.net", "example.org", "gmail.com"])}`;
    const uuid = `${(1e7 + Math.floor(r() * 9e7)).toString(16).padStart(8, "0")}-${Math.floor(r() * 65535).toString(16).padStart(4, "0")}-4${Math.floor(r() * 4095).toString(16).padStart(3, "0")}-a${Math.floor(r() * 4095).toString(16).padStart(3, "0")}-${Math.floor(r() * 2 ** 40).toString(16).padStart(12, "0")}`;
    rows.push({
      customer_id: uuid, full_name: r() < 0.15 ? ` ${n} ` : n, email: r() < 0.08 ? null : (r() < 0.12 ? em.toUpperCase() : em),
      country: pick(r, ["US", "United States", "usa", "DE", "Germany", "GB", "UK", "BH", "Bahrain", "FR", "france"]), signup_date: date(r, "2023-01-01", 1300),
      plan: pick(r, ["free", "pro", "Pro", "enterprise", "Enterprise"]), mrr: r() < 0.3 ? 0 : Math.round(r() * 900 * 100) / 100, is_active: r() < 0.82,
    });
    if (r() < 0.04) rows.push({ ...rows[rows.length - 1] });
  }
  return rows;
}

function reviews(): Row[] {
  const r = rng(37); const rows: Row[] = [];
  const texts = ["Works exactly as described, setup took five minutes.", "Stopped working after two weeks. Contact me at {e} for a refund.", "Great value for the price, would buy again.", "The battery does not last a day. Very disappointed.", "Support was friendly and fast. Call {p} if you want my feedback.", "Not what I expected, the colour is different from the photos.", "   Excellent quality!!   ", "meh"];
  for (let i = 0; i < 500; i++) {
    const t = pick(r, texts); const e = `${pick(r, FIRST).toLowerCase()}${Math.floor(r() * 99)}@mail.example.com`;
    rows.push({ review_id: 880000 + i, product_sku: pick(r, ["KB-200", "KB-210", "MS-100", "HD-900", "WC-310"]), rating: r() < 0.04 ? null : r() < 0.02 ? 9 : 1 + Math.floor(r() * 5), review_text: t.replace("{e}", e).replace("{p}", `+44 20 7946 ${1000 + Math.floor(r() * 8999)}`), helpful_votes: Math.floor(r() ** 3 * 120), review_date: date(r, "2026-07-01", 92), language: pick(r, ["en", "en", "en", "de", "fr", "EN"]) });
  }
  return rows;
}


function orders(): Row[] {
  const r = rng(91); const rows: Row[] = [];
  for (let i = 0; i < 400; i++) {
    const n = `${pick(r, FIRST)} ${pick(r, LAST)}`; const em = `${n.toLowerCase().replace(" ", ".")}@${pick(r, ["acme.com", "northwind.io", "contoso.net", "example.org"])}`;
    rows.push({
      order_id: 500000 + i, customer_email: r() < 0.06 ? null : r() < 0.12 ? ` ${em.toUpperCase()}` : em,
      status: pick(r, ["paid", "Paid", "PAID", "shipped", " shipped", "refunded", "pending", "N/A"]), amount: r() < 0.04 ? null : Math.round((5 + r() * 900) * 100) / 100,
      currency: pick(r, ["EUR", "eur", "USD", "usd", "GBP"]), country: pick(r, ["DE", "Germany", "FR", "france", "GB", "UK", "BH"]), created_at: date(r, "2026-09-01", 60),
    });
  }
  return rows;
}

function contractPages(): Row[] {
  const r = rng(77); const rows: Row[] = [];
  const clauses = [
    "The insurer agrees to indemnify the policyholder against loss arising from the insured events described in the schedule, subject to the exclusions and limits below.",
    "Premiums are payable annually in advance. Where a premium remains unpaid for thirty days after the due date, cover is suspended until payment is received.",
    "The policyholder must notify the insurer of any claim within fourteen days. Failure to give notice may reduce the amount payable under this policy.",
    "Under\u00ADwriting decisions are made on the information supplied in the proposal form. Any material change must be disclosed before renewal.",
    "This policy does not cover loss caused by war, nuclear risks, wear and tear, or deliberate acts of the policyholder or those acting for them.",
    "Disputes will be referred first to the insurer\u2019s complaints team, then to the independent ombudsman if the policyholder is not satisfied.",
    "For questions about this wording, contact {n} at {e} or on {p}.",
    "The limit of liability for any one event shall not exceed the sum shown in the schedule, regardless of the number of persons affected.",
  ];
  const general = "GENERAL CONDITIONS. This policy is governed by the laws of the jurisdiction shown in the schedule. The policyholder shall take reasonable care to prevent loss. The insurer may cancel this policy by giving thirty days written notice. Any change to this policy must be agreed in writing by both parties.";
  const types = [["pdf", "application/pdf"], ["pdf", "application/pdf"], ["pdf", "application/pdf"], ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], ["png", "image/png"]];
  for (let d = 0; d < 36; d++) {
    const [ext, mime] = pick(r, types); const pages = 3 + Math.floor(r() * 4); const docId = `doc-${String(4100 + d)}`;
    for (let pg = 1; pg <= pages; pg++) {
      const n = `${pick(r, FIRST)} ${pick(r, LAST)}`; const em = `${n.toLowerCase().replace(" ", ".")}@acme-insurance.com`;
      const body = pg === pages && r() < 0.8 ? general : [0, 1, 2].map(() => pick(r, clauses)).join("\n\n").replace("{n}", n).replace("{e}", em).replace("{p}", `+44 20 7946 ${1000 + Math.floor(r() * 8999)}`);
      const noisy = ext === "png" ? body.replace(/\b(the|and|of)\b/g, (m) => (r() < 0.12 ? m.toUpperCase().replace("E", "3") : m)) : body;
      rows.push({ doc_id: docId, file_name: `${docId}.${ext}`, mime, page: pg, language: r() < 0.9 ? "en" : "de", ocr_confidence: ext === "png" ? Math.round((0.78 + r() * 0.19) * 100) / 100 : null, text: `ACME INSURANCE LTD.  |  CONFIDENTIAL\n\n${noisy.replace(/\u2019/g, r() < 0.5 ? "\u2019" : "'")}\n\nPage ${pg} of ${pages}` });
    }
  }
  return rows;
}

/** Three compressors read once a minute: a few outages, a stuck pressure sensor, a spike, a -999 sentinel, a stretch in degrees Fahrenheit and a slow drift. */
function sensors(): Row[] {
  const r = rng(41); const rows: Row[] = []; const start = Date.parse("2026-11-12T06:00:00Z");
  ["compressor-01", "compressor-02", "compressor-03"].forEach((id, m) => {
    let vib = 2.1 + m * 0.3;
    for (let i = 0; i < 110; i++) {
      if (m === 0 && i >= 38 && i < 46) continue;       // outage
      if (m === 2 && i >= 71 && i < 74) continue;       // short outage
      const t = new Date(start + i * 60_000).toISOString().replace(".000Z", "Z");
      const wave = Math.sin(i / 9 + m);
      let temp: number | null = Math.round((71 + m * 2 + wave * 3 + (r() - 0.5) * 1.2) * 10) / 10;
      let kpa: number | null = Math.round(((620 + m * 15 + wave * 14 + (r() - 0.5) * 6) ) * 10) / 10;
      if (m === 1 && i >= 52 && i < 66) kpa = 612.4;     // stuck sensor
      if (m === 0 && i === 20) temp = 151.7;             // spike
      if (m === 2 && i === 33) temp = -999;              // sentinel
      if (m === 1 && i >= 80 && i < 90) temp = Math.round((temp * 9 / 5 + 32) * 10) / 10; // reported in degrees Fahrenheit
      if (m === 2 && i === 90) temp = null;
      vib += 0.012 + (r() - 0.5) * 0.04;
      rows.push({ sensor_id: id, ts: t, temperature_c: temp, pressure_kpa: kpa, vibration_mm_s: Math.round(vib * 100) / 100, rpm: Math.round(2950 + wave * 35 + (r() - 0.5) * 20) });
      if (m === 1 && i === 100) rows.push({ sensor_id: id, ts: t, temperature_c: temp, pressure_kpa: kpa, vibration_mm_s: Math.round(vib * 100) / 100, rpm: 2951 }); // repeated timestamp
    }
  });
  return rows;
}

const colsOf = (rows: Row[], types: Record<string, ColType>, roles: Record<string, "identifier" | "label"> = {}) => Object.keys(rows[0]).map((name) => ({ name, type: types[name] ?? ("string" as ColType), role: roles[name] ?? ("feature" as const) }));

function mkDataset(id: string, name: string, description: string, source: Dataset["source"], format: Dataset["format"], rows: Row[], types: Record<string, ColType>, roles: Record<string, "identifier" | "label">, total: number, bytes: number, owner: string, updated: number, version: number): Dataset {
  const columns = colsOf(rows, types, roles);
  return { id, name, description, source, format, version, updatedAt: ago(updated), owner, totalRows: total, sizeBytes: bytes, sample: rows, columns, profile: profileRows(columns, rows, total) };
}

export function sampleDatasets(): Dataset[] {
  return [
    mkDataset("ds_support_raw", "support_tickets_raw", "Support tickets exported nightly from the helpdesk. Free text holds email addresses and phone numbers.", { kind: "connection", connectionId: "conn_s3_lake", location: "s3://acme-data-lake/raw/support/*.parquet" }, "parquet", tickets(),
      { ticket_id: "integer", created_at: "date", csat: "integer", resolution_minutes: "integer" }, { ticket_id: "identifier" }, 4_812_330, 3_100_000_000, "Priya Nair", 3 * HOUR, 14),
    mkDataset("ds_customers_crm", "customers_crm", "Customer master table from the CRM database.", { kind: "connection", connectionId: "conn_pg_crm", location: "public.customers" }, "table", customers(),
      { signup_date: "date", mrr: "decimal", is_active: "boolean" }, { customer_id: "identifier" }, 1_204_118, 410_000_000, "Lucas Silva", 26 * HOUR, 6),
    mkDataset("ds_reviews_q3", "product_reviews_q3", "Product reviews uploaded as a CSV file for a fine tuning experiment.", { kind: "upload", fileName: "product_reviews_q3.csv" }, "csv", reviews(),
      { review_id: "integer", rating: "integer", helpful_votes: "integer", review_date: "date" }, { review_id: "identifier" }, 320_450, 212_000_000, "Amira Haddad", 2 * DAY, 1),
    mkDataset("ds_orders", "orders", "Orders table of the order service. Followed through its change log by a stream.", { kind: "connection", connectionId: "conn_cdc_orders", location: "public.orders" }, "table", orders(),
      { order_id: "integer", amount: "decimal", created_at: "date" }, { order_id: "identifier" }, 9_870_412, 2_300_000_000, "Amira Haddad", 4 * HOUR, 3),
    mkDataset("ds_contract_pages", "contract_pages", "Policy wordings uploaded as 18,420 files (PDF, Word and scanned images). Text was extracted page by page, with OCR for scans.", { kind: "documents", folder: "contracts_2019_2025/", files: 18_420, types: { pdf: 13_904, docx: 3_212, png: 1_304 } }, "documents", contractPages(),
      { page: "integer", ocr_confidence: "decimal" }, { doc_id: "identifier" }, 257_880, 94_000_000_000, "Lucas Silva", 5 * DAY, 2),
    mkDataset("ds_line3_sensors", "line3_compressor_sensors", "Minute readings from three compressors on line 3, exported from the historian. Temperature, pressure, vibration and speed.", { kind: "connection", connectionId: "conn_minio_onprem", location: "historian/line3/compressors.parquet" }, "parquet", sensors(),
      { ts: "timestamp", temperature_c: "decimal", pressure_kpa: "decimal", vibration_mm_s: "decimal", rpm: "integer" }, {}, 2_646_000, 380_000_000, "Marcus Webb", 7 * HOUR, 1),
  ];
}

export function sampleConnections(): Connection[] {
  const t = (name: string, k: string) => `secretref://vault/${SAMPLE_TENANT}/refinery/connections/${name}/${k}`;
  return [
    { id: "conn_s3_lake", name: "data-lake-eu", connector: "s3", auth: "iam-role", settings: { bucket: "acme-data-lake", region: "eu-west-1", prefix: "raw/" }, secretRefs: {}, pool: "batch-spark-eu", state: "connected", lastTested: ago(40 * MIN), createdAt: ago(60 * DAY), createdBy: "Priya Nair" },
    { id: "conn_pg_crm", name: "crm-postgres", connector: "postgres", auth: "password", settings: { host: "crm-db.internal.acme.com", port: "5432", database: "crm", tls: "verify-full", username: "refinery_ro" }, secretRefs: { password: t("crm-postgres", "password") }, pool: "batch-spark-eu", state: "connected", lastTested: ago(5 * HOUR), createdAt: ago(48 * DAY), createdBy: "Lucas Silva" },
    { id: "conn_kafka_events", name: "events-kafka", connector: "kafka", auth: "sasl-scram", settings: { brokers: "b-1.events.acme.com:9096,b-2.events.acme.com:9096", protocol: "SASL_SSL", mechanism: "SCRAM-SHA-512", username: "refinery" }, secretRefs: { password: t("events-kafka", "password") }, pool: "stream-flink-eu", state: "connected", lastTested: ago(2 * HOUR), createdAt: ago(31 * DAY), createdBy: "Priya Nair" },
    { id: "conn_automq_clicks", name: "clickstream-automq", connector: "automq", auth: "sasl-scram", settings: { brokers: "b-1.clicks.acme.com:9096,b-2.clicks.acme.com:9096", protocol: "SASL_SSL", mechanism: "SCRAM-SHA-256", username: "refinery" }, secretRefs: { password: t("clickstream-automq", "password") }, pool: "stream-flink-eu", state: "connected", lastTested: ago(3 * HOUR), createdAt: ago(12 * DAY), createdBy: "Priya Nair" },
    { id: "conn_rabbit_orders", name: "orders-rabbitmq", connector: "rabbitmq", auth: "password", settings: { host: "rabbit.orders.acme.com", port: "5671", vhost: "/shop", kind: "Queue", prefetch: "200", tls: "verify-full", username: "refinery" }, secretRefs: { password: t("orders-rabbitmq", "password") }, pool: "stream-flink-eu", state: "connected", lastTested: ago(5 * HOUR), createdAt: ago(9 * DAY), createdBy: "Marcus Webb" },
    { id: "conn_cdc_orders", name: "orders-cdc", connector: "cdc-postgres", auth: "password", settings: { host: "orders-db.internal.acme.com", port: "5432", database: "orders", slot: "refinery_orders", publication: "refinery_pub", tables: "public.orders,public.order_items", tls: "verify-full", username: "refinery_repl" }, secretRefs: { password: t("orders-cdc", "password") }, pool: "stream-flink-eu", state: "connected", lastTested: ago(9 * HOUR), createdAt: ago(20 * DAY), createdBy: "Lucas Silva" },
    { id: "conn_minio_onprem", name: "minio-onprem", connector: "minio", auth: "access-key", settings: { endpoint: "https://minio.internal.acme.com:9000", bucket: "ml-curated", region: "us-east-1", pathStyle: "path", tls: "verify-full", prefix: "curated/" }, secretRefs: { secretAccessKey: t("minio-onprem", "secretAccessKey") }, pool: "stream-flink-eu", state: "connected", lastTested: ago(3 * HOUR), createdAt: ago(9 * DAY), createdBy: "Lucas Silva" },
    { id: "conn_snowflake_dw", name: "warehouse-snowflake", connector: "snowflake", auth: "key-pair", settings: { account: "acme-prod.eu-west-1", warehouse: "REFINERY_WH", database: "ANALYTICS", schema: "PUBLIC", username: "REFINERY_SVC" }, secretRefs: { privateKey: t("warehouse-snowflake", "privateKey") }, pool: "managed-eu-1", state: "failed", lastTested: ago(3 * HOUR), createdAt: ago(9 * DAY), createdBy: "Amira Haddad" },
    { id: "conn_sftp_partner", name: "partner-sftp", connector: "sftp", auth: "ssh-key", settings: { host: "sftp.partner.example.com", port: "22", path: "/exports", username: "acme" }, secretRefs: { privateKey: t("partner-sftp", "privateKey") }, pool: "managed-eu-1", state: "untested", createdAt: ago(1 * DAY), createdBy: "Amira Haddad" },
  ];
}

export function samplePools(): RunnerPool[] {
  return [
    { id: "platform-native", name: "platform-native", hosting: "managed", engine: "native", builtIn: true, region: "Inside the tok∑ner backend", workersMin: 1, workersMax: 1, workers: 1, coresPerWorker: 8, memGbPerWorker: 4, concurrency: 3, running: 0, queued: 0, cpuPct: 12, memPct: 21, status: "online", version: "0.1.0", lastSeen: ago(2_000), network: "Runs in the platform. Reads your data through your connections, with no runner to install." },
    { id: "managed-eu-1", name: "managed-eu-1", hosting: "managed", engine: "single", region: "Europe (managed)", workersMin: 1, workersMax: 4, workers: 2, coresPerWorker: 8, memGbPerWorker: 32, concurrency: 4, running: 1, queued: 0, cpuPct: 38, memPct: 44, status: "online", version: "0.1.0", lastSeen: ago(8_000), network: "Public internet, tok∑ner egress addresses" },
    { id: "batch-spark-eu", name: "batch-spark-eu", hosting: "kubernetes", engine: "spark", region: "eu-west-1 (customer cluster)", workersMin: 4, workersMax: 32, workers: 12, coresPerWorker: 8, memGbPerWorker: 32, concurrency: 4, running: 2, queued: 1, cpuPct: 71, memPct: 63, status: "scaling", version: "0.1.0", lastSeen: ago(5_000), network: "Customer VPC, private subnets" },
    { id: "stream-flink-eu", name: "stream-flink-eu", hosting: "kubernetes", engine: "flink", region: "eu-west-1 (customer cluster)", workersMin: 2, workersMax: 8, workers: 4, coresPerWorker: 4, memGbPerWorker: 16, concurrency: 8, running: 3, queued: 0, cpuPct: 46, memPct: 52, status: "online", version: "0.1.0", lastSeen: ago(6_000), network: "Customer VPC, private subnets" },
    { id: "acme-flink-prod", name: "acme-flink-prod", hosting: "kubernetes", engine: "flink", flink: { location: "cloud", deploy: "kubernetes-operator", restUrl: "https://flink.prod.acme.com", auth: "bearer", secretRefs: { token: `secretref://vault/${SAMPLE_TENANT}/refinery/pools/acme-flink-prod/token` }, version: "1.19.1", slots: 48 }, region: "Your Flink cluster, eu-west-1", workersMin: 1, workersMax: 1, workers: 1, coresPerWorker: 4, memGbPerWorker: 8, concurrency: 6, running: 1, queued: 0, cpuPct: 33, memPct: 41, status: "online", version: "0.1.0", lastSeen: ago(7_000), network: "A runner in the cluster's VPC submits jobs. tok∑ner does not connect into the cluster." },
    { id: "laptop-flink", name: "laptop-flink", hosting: "docker", engine: "flink", flink: { location: "local", deploy: "session", restUrl: "http://localhost:8081", auth: "none", secretRefs: {}, version: "1.19.1", slots: 4 }, region: "Your Flink on this computer", workersMin: 1, workersMax: 1, workers: 1, coresPerWorker: 4, memGbPerWorker: 8, concurrency: 1, running: 0, queued: 0, cpuPct: 0, memPct: 0, status: "offline", version: "0.1.0", lastSeen: ago(26 * HOUR), network: "A runner on the same computer reaches Flink on localhost and connects out to tok∑ner." },
    { id: "dev-vm-1", name: "dev-vm-1", hosting: "vm", engine: "single", region: "On premises", workersMin: 1, workersMax: 1, workers: 1, coresPerWorker: 4, memGbPerWorker: 16, concurrency: 1, running: 0, queued: 0, cpuPct: 0, memPct: 0, status: "offline", version: "0.1.0", lastSeen: ago(2 * HOUR), network: "Office network" },
  ];
}

export function sampleRecipes(): Recipe[] {
  const base = { updatedBy: "Priya Nair" };
  return [
    { id: "rcp_support_clean", name: "support-tickets-clean", description: "Cleans support tickets, masks personal data, labels the topic with a model and splits for fine tuning.", inputDatasetId: "ds_support_raw", version: 7, updatedAt: ago(6 * HOUR), ...base, lastRunId: "run_0114",
      steps: [
        { id: "s1", op: "trim", params: { columns: ["subject", "body", "customer_email"], collapse: true } },
        { id: "s2", op: "case", params: { columns: ["priority", "channel", "customer_email"], mode: "lower" } },
        { id: "s3", op: "fill_missing", params: { column: "priority", strategy: "constant", value: "normal" } },
        { id: "s4", op: "drop_duplicates", params: { keys: ["ticket_id"], keep: "last" } },
        { id: "s5", op: "cast", params: { column: "csat", to: "integer" } },
        { id: "s6", op: "clip_outliers", params: { column: "resolution_minutes" } },
        { id: "s7", op: "pii_mask", params: { columns: ["body"], style: "token" } },
        { id: "s8", op: "ai_classify", params: { column: "body", into: "topic", labels: "billing\noutage\nhow-to\naccount access\nother", model: "alias:fast-classifier", maxCost: 400 } },
        { id: "s9", op: "split", params: { train: 80, validation: 10, test: 10, seed: 42 } },
      ],
      outputs: [{ name: "train", kind: "files", target: "data-lake-eu / curated/support/train/", format: "parquet" }, { name: "validation", kind: "files", target: "data-lake-eu / curated/support/validation/", format: "parquet" }, { name: "test", kind: "dataset", target: "support_tickets_test", format: "parquet" }],
      pool: "batch-spark-eu", parallelism: 24, partitionTargetMb: 128 },
    { id: "rcp_customers", name: "customers-standardise", description: "Standardises the customer table for the churn model.", inputDatasetId: "ds_customers_crm", version: 3, updatedAt: ago(3 * DAY), ...base, lastRunId: "run_0111",
      steps: [
        { id: "s1", op: "trim", params: { columns: [], collapse: true } },
        { id: "s2", op: "case", params: { columns: ["email", "plan"], mode: "lower" } },
        { id: "s3", op: "replace", params: { columns: ["country"], find: "United States", with: "US" } },
        { id: "s4", op: "drop_missing", params: { columns: ["email"] } },
        { id: "s5", op: "drop_duplicates", params: { keys: ["email"], keep: "first" } },
      ],
      outputs: [{ name: "clean", kind: "table", target: "warehouse-snowflake / ANALYTICS.PUBLIC.CUSTOMERS_CLEAN", format: "table" }], pool: "managed-eu-1", parallelism: 4, partitionTargetMb: 128 },
    { id: "rcp_orders_stream", name: "orders-normalise", description: "Tidies each order record as it arrives. Every step works on one record at a time, so it can run in a stream.", inputDatasetId: "ds_orders", version: 4, updatedAt: ago(5 * DAY), ...base,
      steps: [
        { id: "s1", op: "trim", params: { columns: ["customer_email", "status", "currency"], collapse: true } },
        { id: "s2", op: "case", params: { columns: ["customer_email", "status"], mode: "lower" } },
        { id: "s3", op: "case", params: { columns: ["currency"], mode: "upper" } },
        { id: "s4", op: "replace", params: { columns: ["country"], find: "Germany", with: "DE" } },
        { id: "s5", op: "validate", params: { column: "amount", rule: "range", min: 0, max: 100000 } },
        { id: "s6", op: "pii_mask", params: { columns: ["customer_email"], style: "hash" } },
      ],
      outputs: [{ name: "clean", kind: "files", target: "minio-onprem / curated/orders/", format: "parquet" }], pool: "stream-flink-eu", parallelism: 8, partitionTargetMb: 128 },
    { id: "rcp_tickets_stream", name: "tickets-stream-clean", description: "Cleans each support ticket as it arrives and masks personal data. One record at a time.", inputDatasetId: "ds_support_raw", version: 2, updatedAt: ago(4 * DAY), ...base,
      steps: [
        { id: "s1", op: "trim", params: { columns: ["subject", "body"], collapse: true } },
        { id: "s2", op: "case", params: { columns: ["priority", "channel"], mode: "lower" } },
        { id: "s3", op: "fill_missing", params: { column: "priority", strategy: "constant", value: "normal" } },
        { id: "s4", op: "pii_mask", params: { columns: ["body"], style: "token" } },
      ],
      outputs: [{ name: "clean", kind: "stream", target: "events-kafka / support.tickets.clean", format: "jsonl" }], pool: "stream-flink-eu", parallelism: 8, partitionTargetMb: 128 },
    { id: "rcp_reviews", name: "reviews-for-finetune", description: "Prepares uploaded product reviews as a fine tuning set.", inputDatasetId: "ds_reviews_q3", version: 2, updatedAt: ago(1 * DAY), ...base, lastRunId: "run_0112",
      steps: [
        { id: "s1", op: "trim", params: { columns: ["review_text"], collapse: true } },
        { id: "s2", op: "validate", params: { column: "rating", rule: "range", min: 1, max: 5 } },
        { id: "s3", op: "pii_mask", params: { columns: ["review_text"], style: "token" } },
        { id: "s4", op: "split", params: { train: 90, validation: 5, test: 5, seed: 7 } },
      ],
      outputs: [{ name: "jsonl", kind: "files", target: "data-lake-eu / curated/reviews/", format: "jsonl" }], pool: "managed-eu-1", parallelism: 2, partitionTargetMb: 64 },
    { id: "rcp_churn_features", name: "customers-churn-features", description: "Feature engineering for the churn model: calendar parts, buckets, encodings and scaling.", inputDatasetId: "ds_customers_crm", version: 2, updatedAt: ago(2 * DAY), ...base,
      steps: [
        { id: "s1", op: "trim", params: { columns: [], collapse: true } },
        { id: "s2", op: "case", params: { columns: ["email", "plan"], mode: "lower" } },
        { id: "s3", op: "date_parts", params: { column: "signup_date", parts: ["year", "month", "quarter"] } },
        { id: "s4", op: "bucket", params: { column: "mrr", edges: "1, 100, 500", into: "mrr_band" } },
        { id: "s5", op: "one_hot", params: { column: "plan", maxCategories: 5, dropOriginal: false } },
        { id: "s6", op: "label_encode", params: { column: "country", into: "country_code" } },
        { id: "s7", op: "scale", params: { column: "mrr", method: "standard" } },
        { id: "s8", op: "split", params: { train: 80, validation: 10, test: 10, seed: 11 } },
      ],
      outputs: [{ name: "features", kind: "files", target: "data-lake-eu / features/churn/", format: "parquet" }], pool: "managed-eu-1", parallelism: 4, partitionTargetMb: 128 },
    { id: "rcp_contracts", name: "contracts-to-training-corpus", description: "Turns policy documents into a clean, de-duplicated, masked corpus of chunks for fine tuning and retrieval.", inputDatasetId: "ds_contract_pages", version: 4, updatedAt: ago(8 * HOUR), ...base,
      steps: [
        { id: "s1", op: "normalize_text", params: { columns: ["text"], unicode: true, controls: true, quotes: true, hyphens: true, spaces: true } },
        { id: "s2", op: "strip_boilerplate", params: { column: "text", minShare: 30, pageNumbers: true } },
        { id: "s3", op: "pii_mask", params: { columns: ["text"], style: "token" } },
        { id: "s4", op: "near_dedupe", params: { column: "text", threshold: 0.85 } },
        { id: "s5", op: "validate", params: { column: "text", rule: "length", min: 80, max: "" } },
        { id: "s6", op: "chunk_text", params: { column: "text", tokens: 300, overlap: 30 } },
        { id: "s7", op: "text_stats", params: { column: "text" } },
      ],
      outputs: [{ name: "corpus", kind: "files", target: "data-lake-eu / curated/contracts/", format: "jsonl" }], pool: "batch-spark-eu", parallelism: 64, partitionTargetMb: 256 },
  ];
}

const fmtN = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtB = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${Math.round(b / 1e6)} MB` : `${Math.round(b / 1e3)} KB`);

export type RunOpts = { status: RunRecord["status"]; startedAgo: number; durationMs: number; by?: string; trigger?: RunRecord["trigger"]; pct?: number; rejectedFrac?: number; keepFrac?: number; costUsd?: number; simulated?: boolean };

/**
 * One run record, built from a recipe and a dataset. Counters and log lines are derived from the recipe run on the dataset's sample and scaled to the whole
 * input, so the same inputs and progress always give the same record. It is used for the sample history and for runs started in the console.
 */
export function buildRun(id: string, recipe: Recipe, ds: Dataset, pool: RunnerPool, opts: RunOpts): RunRecord {
  const plan = planPartitions(ds.sizeBytes, ds.totalRows, recipe.partitionTargetMb, recipe.parallelism, pool.workers, pool.coresPerWorker, pool.coresPerWorker * pool.workers);
  const defs = recipe.steps.map((st) => STEP_BY_OP.get(st.op));
  const hasAi = defs.some((d) => d?.ai); const hasRemote = defs.some((d) => d?.remote);
  const hasShuffle = defs.some((d) => d && !d.streamable);
  const convert = needsConversion(ds.format);
  const pct = opts.status === "succeeded" ? 100 : Math.max(0, Math.min(100, opts.pct ?? 0));
  const frac = pct / 100;
  const scale = ds.sample.length ? ds.totalRows / ds.sample.length : 1;
  const { results } = runSteps(startFrame(ds.columns, ds.sample), recipe.steps);
  const N = Math.max(1, recipe.steps.length);
  const steps: StepStat[] = recipe.steps.map((st, i) => {
    const r = results[i]; const at = (i + 1) / (N + 1);
    return { id: st.id, label: defs[i]?.label ?? st.op, detail: describe(st), status: opts.status === "queued" || opts.status === "planning" ? "pending" : frac >= at ? "done" : frac >= at - 1 / (N + 1) ? "running" : "pending", rowsIn: Math.round(r.rowsIn * scale), rowsOut: Math.round(r.rowsOut * scale), changed: Math.round(r.changed * scale), rejected: Math.round(r.rejected * scale), remote: !!(defs[i]?.ai || defs[i]?.remote) };
  });
  const finalRows = results.length ? results[results.length - 1].rowsOut : ds.sample.length;
  const keep = opts.keepFrac ?? (ds.sample.length ? finalRows / ds.sample.length : 0.93);
  const rejTotal = results.reduce((a, r) => a + r.rejected, 0);
  const rej = opts.rejectedFrac ?? (ds.sample.length ? rejTotal / ds.sample.length : 0.011);
  const r = rng(id.length * 97 + plan.partitions);

  const partitions: Partition[] = Array.from({ length: Math.min(plan.partitions, 96) }, (_, i) => {
    let status: Partition["status"] = "done", p = 100;
    if (opts.status === "running" || opts.status === "planning") { const cut = Math.round((Math.min(plan.partitions, 96) * pct) / 100); status = i < cut - plan.concurrent ? "done" : i < cut ? "running" : "pending"; p = status === "done" ? 100 : status === "running" ? Math.round(20 + r() * 70) : 0; }
    if (opts.status === "queued") { status = "pending"; p = 0; }
    if (opts.status === "failed") { status = i === 3 ? "failed" : i < 3 ? "done" : "pending"; p = status === "done" ? 100 : status === "failed" ? 41 : 0; }
    if (opts.status === "cancelled") { status = i < Math.round((Math.min(plan.partitions, 96) * pct) / 100) ? "done" : "pending"; p = status === "done" ? 100 : 0; }
    return { id: i, worker: `${pool.name}-w${(i % Math.max(1, pool.workers)) + 1}`, status, pct: p, rowsIn: Math.round(ds.totalRows / plan.partitions) };
  });

  const kinds: { name: string; kind: StageInfo["kind"]; w: number }[] = [
    ...(convert ? [{ name: "Convert to Parquet", kind: "convert" as const, w: 0.12 }] : []),
    { name: "Read and plan", kind: "read", w: 0.05 }, { name: "Clean and transform", kind: "transform", w: 0.33 },
    ...(hasShuffle ? [{ name: "Shuffle for steps that need all rows", kind: "shuffle" as const, w: 0.18 }] : []),
    ...(hasAi || hasRemote ? [{ name: hasAi ? "Model and function steps" : "Function steps", kind: "ai" as const, w: 0.27 }] : []),
    { name: "Write and commit", kind: "write", w: 0.1 },
  ];
  const tot = kinds.reduce((a, k) => a + k.w, 0); let acc = 0;
  const done = opts.status === "succeeded"; const stopped = opts.status === "failed" || opts.status === "cancelled";
  const stages: StageInfo[] = kinds.map((k) => {
    const from = acc / tot, to = (acc + k.w) / tot; acc += k.w;
    const st: StageInfo["status"] = opts.status === "queued" ? "pending" : frac >= to ? "done" : frac >= from ? (opts.status === "failed" ? "failed" : "running") : "pending";
    return { name: k.name, kind: k.kind, status: st, ms: done ? Math.round(opts.durationMs * (k.w / tot)) : stopped || st === "pending" ? 0 : Math.round((opts.durationMs || 0) * (k.w / tot) * Math.min(1, frac / Math.max(0.01, to))) };
  });

  const rowsIn = done ? ds.totalRows : Math.round((ds.totalRows * pct) / 100);
  const rejected = Math.round(rowsIn * rej);
  const rules = recipe.steps.flatMap((st) => st.op === "validate" ? [{ reason: `${String(st.params.column)} ${st.params.rule === "range" ? `outside ${st.params.min ?? "-inf"} to ${st.params.max ?? "inf"}` : st.params.rule === "pattern" ? "does not match the pattern" : st.params.rule === "length" ? `length outside ${st.params.min || 0} to ${st.params.max || "inf"} characters` : "is empty"}`, step: "Validate against a rule" }] : []);
  const weights = rules.map((_, i) => 1 / (i + 1)); const wsum = weights.reduce((a, b) => a + b, 0) || 1;
  const rejects = rules.map((x, i) => ({ ...x, count: Math.round((rejected * weights[i]) / wsum) }));
  if (rejects.length) rejects[rejects.length - 1].count = rejected - rejects.slice(0, -1).reduce((a, b) => a + b.count, 0);
  const costUsd = opts.costUsd ?? (hasAi ? Math.round(rowsIn * keep * 0.00006 * 100) / 100 : 0);
  const aiCalls = hasAi ? Math.round(rowsIn * keep * 0.97) : 0;

  // ---- log lines: each has a position 0..1 in the run and is shown once the run has got that far
  const start = Date.now() - opts.startedAgo; const span = done || stopped ? Math.max(opts.durationMs, 60_000 * (opts.status === "cancelled" ? 0.5 : 1)) : Math.max(opts.durationMs, 1);
  const raw: { p: number; level: LogLine["level"]; src: string; msg: string }[] = [];
  const L = (p: number, src: string, msg: string, level: LogLine["level"] = "info") => raw.push({ p, src, msg, level });
  if (opts.simulated) L(0, "console", "Simulated run in the sample workspace. Nothing was read or written.", "warn");
  L(0, "scheduler", `run ${id} accepted for ${recipe.name} v${recipe.version}, started by ${opts.by ?? "Priya Nair"}`);
  if (opts.status === "queued") L(0, "scheduler", `waiting for capacity on ${pool.name}: ${pool.running} runs active, concurrency limit ${pool.concurrency}`, "warn");
  else {
    L(0, "planner", `pinned input ${ds.name} v${ds.version}: ${fmtN(ds.totalRows)} rows, ${fmtB(ds.sizeBytes)}`);
    if (convert) L(0.01, "ingest", `converting ${ds.format} input to Parquet in staging so every stage reads a typed, splittable copy`);
    L(0.02, "planner", `planned ${plan.partitions} partition${plan.partitions === 1 ? "" : "s"} of about ${recipe.partitionTargetMb} MB, about ${fmtN(plan.rowsPerPartition)} rows each`);
    L(0.02, "planner", `${plan.concurrent} task${plan.concurrent === 1 ? "" : "s"} at once, ${plan.waves} wave${plan.waves === 1 ? "" : "s"}. ${plan.note}`);
    L(0.03, "pool", pool.engine === "native" ? `${pool.name} runs on the native engine inside the platform with up to ${recipe.parallelism} virtual threads` : `${pool.name} has ${pool.workers} worker${pool.workers === 1 ? "" : "s"} of ${pool.coresPerWorker} cores (engine ${pool.engine === "single" ? "single node" : pool.engine})`);
    if (convert) L(0.1, "ingest", `staging written: ${fmtB(ds.sizeBytes * 0.38)} Parquet from ${fmtB(ds.sizeBytes)} ${ds.format}`);
    const shown = Math.min(plan.partitions, 96);
    for (let i = 0; i < shown; i++) {
      const p = 0.1 + ((i + 1) / shown) * 0.82; const w = `worker-${(i % Math.max(1, pool.workers)) + 1}`; const rin = Math.round(ds.totalRows / plan.partitions);
      if (opts.status === "failed" && i === 3) { L(p, w, `task 3 failed: source returned 403 on s3://acme-data-lake/raw/support/part-0003.parquet`, "error"); L(p, "scheduler", "task 3 retried 2 times on other workers, still failing", "warn"); continue; }
      if (i === 5 && plan.partitions > 12) L(p, w, `task 5 retry 1 of 3: connection reset by peer, rescheduled on ${pool.name}-w${((i + 3) % Math.max(1, pool.workers)) + 1}`, "warn");
      L(p, w, `task ${i} finished: ${fmtN(rin)} rows in, ${fmtN(Math.round(rin * keep))} out, ${fmtN(Math.round(rin * rej))} rejected`);
    }
    recipe.steps.forEach((st, i) => { const x = steps[i]; const p = 0.1 + ((i + 1) / (N + 1)) * 0.8; const d = x.remote ? (defs[i]?.ai ? `${fmtN(Math.round(aiCalls / Math.max(1, defs.filter((q) => q?.ai).length)))} model calls through the gateway` : "function calls in batches") : x.rejected ? `${fmtN(x.changed)} cells changed, ${fmtN(x.rejected)} rows rejected` : x.rowsOut !== x.rowsIn ? `${fmtN(x.rowsIn - x.rowsOut)} rows removed` : `${fmtN(x.changed)} cells changed`; L(p, "step " + (i + 1), `${x.label} (${x.detail}): ${d}`); });
    if (hasAi) { L(0.62, "gateway", `model steps so far: ${fmtN(Math.round(aiCalls * 0.6))} calls, estimated cost ${(costUsd * 0.6).toFixed(2)} USD, within the cap`); L(0.9, "gateway", `model steps: ${fmtN(aiCalls)} calls, cost ${costUsd.toFixed(2)} USD, ${fmtN(Math.round(aiCalls * 0.04))} answers reused from the run cache`); }
    for (const x of rejects) L(0.93, "quality", `rejected ${fmtN(x.count)} rows: ${x.reason}`, "warn");
    if (done) { L(0.97, "commit", `all tasks finished, committing ${recipe.outputs.length} output${recipe.outputs.length === 1 ? "" : "s"} together`); recipe.outputs.forEach((o) => L(0.99, "commit", `committed ${o.name} to ${o.target} (${o.format})`)); L(1, "scheduler", `run succeeded: ${fmtN(Math.round(rowsIn * keep))} rows out of ${fmtN(rowsIn)} read, ${fmtN(rejected)} rejected`); }
    if (opts.status === "failed") { L(frac, "scheduler", "run stopped. No output was committed, so nothing half-written was left behind.", "error"); }
    if (opts.status === "cancelled") L(frac, "scheduler", "run cancelled. Temporary output was removed.", "warn");
  }
  const cut = opts.status === "queued" ? 0 : frac;
  const log: LogLine[] = raw.filter((l) => l.p <= cut + 1e-9).sort((a, b) => a.p - b.p).map((l, i, all) => ({ t: new Date(start + span * (all.length > 1 ? Math.min(1, l.p) : 0) + i).toISOString(), level: l.level, src: l.src, msg: l.msg }));

  return {
    id, recipeId: recipe.id, recipeName: recipe.name, recipeVersion: recipe.version, datasetName: ds.name, snapshot: `${ds.name} v${ds.version}`, pool: pool.name, parallelism: recipe.parallelism, status: opts.status, trigger: opts.trigger ?? "manual", startedBy: opts.by ?? "Priya Nair",
    startedAt: new Date(start).toISOString(), durationMs: opts.durationMs, rowsIn, rowsOut: Math.round(rowsIn * keep), rowsRejected: rejected, bytesIn: Math.round((ds.sizeBytes * pct) / 100),
    aiCalls, aiCostUsd: costUsd, partitions, stages, steps, rejects: rejected ? rejects : [], log, error: opts.status === "failed" ? "A source returned 403 (access denied) for part-0003.parquet. Check that the connection's role can read the whole prefix." : undefined, pct,
  };
}

export function sampleRuns(datasets: Dataset[], recipes: Recipe[], pools: RunnerPool[]): RunRecord[] {
  const ds = (id: string) => datasets.find((d) => d.id === id)!; const rc = (id: string) => recipes.find((r) => r.id === id)!; const pl = (n: string) => pools.find((p) => p.name === n)!;
  const R = (id: string, rid: string, a: number, dur: number, status: RunRecord["status"], extra: Partial<Parameters<typeof buildRun>[4]> = {}) => { const rec = rc(rid); return buildRun(id, rec, ds(rec.inputDatasetId), pl(rec.pool), { status, startedAgo: a, durationMs: dur, ...extra }); };
  return [
    R("run_0118", "rcp_support_clean", 7 * MIN, 0, "running", { pct: 58 }),
    R("run_0117", "rcp_customers", 14 * MIN, 0, "queued"),
    R("run_0116", "rcp_reviews", 2 * HOUR, 4 * MIN + 12_000, "succeeded", { trigger: "schedule", by: "Scheduler" }),
    R("run_0115", "rcp_support_clean", 5 * HOUR, 0, "failed", { pct: 12, durationMs: 0 }),
    R("run_0114", "rcp_support_clean", 29 * HOUR, 22 * MIN + 40_000, "succeeded", { trigger: "schedule", by: "Scheduler" }),
    R("run_0113", "rcp_customers", 31 * HOUR, 3 * MIN + 5_000, "succeeded", { trigger: "schedule", by: "Scheduler" }),
    R("run_0112", "rcp_reviews", 1 * DAY + 3 * HOUR, 3 * MIN + 48_000, "succeeded", { by: "Amira Haddad" }),
    R("run_0111", "rcp_customers", 3 * DAY, 3 * MIN + 20_000, "succeeded", { by: "Lucas Silva" }),
    R("run_0110", "rcp_support_clean", 3 * DAY + 5 * HOUR, 25 * MIN + 10_000, "succeeded", { trigger: "schedule", by: "Scheduler" }),
    R("run_0109", "rcp_support_clean", 4 * DAY + 5 * HOUR, 23 * MIN + 55_000, "succeeded", { trigger: "schedule", by: "Scheduler" }),
    R("run_0108", "rcp_customers", 5 * DAY, 3 * MIN + 31_000, "succeeded", { trigger: "schedule", by: "Scheduler" }),
    R("run_0107", "rcp_support_clean", 5 * DAY + 5 * HOUR, 24 * MIN + 2_000, "succeeded", { trigger: "schedule", by: "Scheduler" }),
    R("run_0106", "rcp_reviews", 6 * DAY, 4 * MIN + 2_000, "cancelled", { by: "Amira Haddad", pct: 30, durationMs: 80_000 }),
  ];
}

export function sampleStreams(): StreamJob[] {
  const r = rng(61);
  const series = (rate: number, lagBase: number, bump = 0) => Array.from({ length: 30 }, (_, i) => { const t = new Date(Date.now() - (29 - i) * 60_000); const w = rate * (0.9 + r() * 0.2); return { t: t.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), inRate: Math.round(w), outRate: Math.round(w * 0.985), lag: Math.max(0, Math.round(lagBase * (0.6 + r() * 0.8) + (i > 22 ? bump * (i - 22) : 0))) }; });
  return [
    { id: "str_tickets", name: "tickets-live-clean", kind: "messaging", system: "Apache Kafka", recipeName: "tickets-stream-clean", source: "events-kafka / support.tickets.raw", sink: "events-kafka / support.tickets.clean", pool: "stream-flink-eu", status: "running", inRate: 820, outRate: 807, lag: 1_240, errPct: 0.4, latencyMs: 180, checkpointAgeS: 12, deadLetters: 312, delivery: "exactly-once", mode: "append", destKind: "stream", flushSeconds: 1, schemaEvolution: "add-columns", series: series(820, 1200) },
    { id: "str_orders_cdc", name: "orders-cdc-clean", kind: "cdc", recipeName: "orders-normalise", source: "orders-cdc / public.orders, public.order_items", sink: "data-lake-eu / curated/orders/ (Parquet, rolled every 5 minutes)", pool: "stream-flink-eu", status: "running", inRate: 2_460, outRate: 2_431, lag: 8_900, errPct: 0.1, latencyMs: 420, checkpointAgeS: 31, deadLetters: 41, delivery: "at-least-once", mode: "append", destKind: "files", snapshot: true, flushSeconds: 300, schemaEvolution: "add-columns", series: series(2460, 4200, 800) },
    { id: "str_reviews", name: "reviews-moderation", kind: "messaging", system: "Apache Kafka", recipeName: "tickets-stream-clean", source: "events-kafka / reviews.submitted", sink: "events-kafka / reviews.moderated", pool: "stream-flink-eu", status: "paused", inRate: 0, outRate: 0, lag: 52_300, errPct: 0, latencyMs: 0, checkpointAgeS: 5_400, deadLetters: 0, delivery: "at-least-once", mode: "append", destKind: "stream", flushSeconds: 1, schemaEvolution: "stop", series: series(0, 52300).map((p) => ({ ...p, inRate: 0, outRate: 0 })) },
    { id: "str_orders_queue", name: "orders-queue-clean", kind: "messaging", system: "RabbitMQ", recipeName: "tickets-stream-clean", source: "orders-rabbitmq / shop.orders.created", sink: "data-lake-eu / curated/orders-queue/ (JSON Lines, rolled every 60 seconds)", pool: "stream-flink-eu", status: "running", inRate: 310, outRate: 306, lag: 94, errPct: 0.2, latencyMs: 95, checkpointAgeS: 8, deadLetters: 17, delivery: "at-least-once", mode: "append", destKind: "files", flushSeconds: 60, schemaEvolution: "add-columns", series: series(310, 400) },
  ];
}

/** Hourly figures for the overview over the last 24 hours and daily quality over 14 days. Examples, not measurements. */
export function sampleOverviewSeries() {
  const r = rng(5);
  const hours = Array.from({ length: 24 }, (_, i) => { const t = new Date(Date.now() - (23 - i) * HOUR); const busy = i % 24 >= 2 && i % 24 <= 5 ? 1.8 : 1; return { t: t.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), rowsM: Math.round((4 + r() * 6) * busy * 10) / 10, rejectedK: Math.round(20 + r() * 60), aiCost: Math.round((2 + r() * 9) * busy * 100) / 100, ok: Math.round(1 + r() * 3), failed: r() < 0.12 ? 1 : 0 }; });
  const days = Array.from({ length: 14 }, (_, i) => { const t = new Date(Date.now() - (13 - i) * DAY); return { t: t.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }), before: Math.round(58 + r() * 6), after: Math.round(90 + r() * 5) }; });
  return { hours, days };
}
