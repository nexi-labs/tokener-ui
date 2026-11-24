/**
 * Checks for the plan, pipeline validate, connection discover and platform connector wiring.
 * Run: npx tsx --tsconfig scripts/tsconfig.scripts.json scripts/check-mlops-api-wave.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DISCOVER_DEFAULT_LIMIT, DISCOVER_KINDS, DISCOVER_MAX_LIMIT, sampleDiscovery, toDiscovery, validateQuery } from "../src/lib/mlops/discovery";
import { NO_LIMIT, PLANS, human, isUnlimited, limitText, planById, pressure, toPlan, usageRows } from "../src/lib/mlops/plans";
import { toReport } from "../src/lib/mlops/validation";
import { SEMVER, isNewer, nextVersion, toListing, toManifest } from "../src/lib/platform/connector-server";
import { blankConnector, validateDefinition } from "../src/lib/platform/connector-publish";

let pass = 0; let fail = 0;
const ok = (c: unknown, m: string) => { if (c) pass++; else { fail++; console.error("FAIL", m); } };

// ---- plans: the console's numbers equal the server's
const java = readFileSync(join(__dirname, "../../tokener-mlops/src/main/java/io/tokener/mlops/domain/plan/Plans.java"), "utf8");
const GIB = 1024 ** 3;
const num = (t: string) => (t.includes("MAX_VALUE") ? NO_LIMIT : t.includes("GIB") ? Number(t.split("*")[0].trim()) * GIB : Number(t.trim()));
for (const p of PLANS) {
  const m = new RegExp(`new Plan\\("${p.id}"[\\s\\S]*?new PlanLimits\\(([\\s\\S]*?)\\)\\);`).exec(java);
  ok(!!m, `Plans.java declares ${p.id}`);
  if (!m) continue;
  const parts = m[1].replace(/\s+/g, " ").split(",").map((x) => x.trim());
  const l = p.limits;
  const mine = [l.maxPipelines, l.maxConnections, l.maxAgents, l.maxDeployments, l.maxModels, l.maxVersionsPerModel, l.maxUploadBytes, l.maxStorageBytes, l.maxConcurrentRuns, l.maxMcpServers, l.maxPipelineRunsPerDay];
  ok(parts.length === mine.length, `${p.id}: the same number of limits (${parts.length})`);
  parts.forEach((t, i) => {
    const theirs = num(t);
    const same = isUnlimited(theirs) ? isUnlimited(mine[i]) : mine[i] === theirs;
    ok(same, `${p.id}: limit ${i} is ${t}`);
  });
}
ok(PLANS.map((p) => p.id).join() === "free,growth,unlimited", "the three plans in the same order");
ok(planById(undefined).id === "free" && planById("nope").id === "free", "an unknown plan reads as free");
ok(toPlan({ id: "growth", name: "Growth", description: "d", limits: { maxPipelines: 100 } }).limits.maxConnections === 25, "a limit the server left out falls back to the free value");
ok(isUnlimited(toPlan({ limits: { maxPipelines: 2147483647 } }).limits.maxPipelines), "the server's largest int means no limit");

const input = { pipelines: 20, connections: 25, agents: 1, deployments: 0, models: 3, mcpServers: 0, storageBytes: 5 * GIB, mostVersions: 4 };
const rows = usageRows(PLANS[0], input);
ok(rows.length === 8, "eight usage rows");
ok(pressure(rows.find((r) => r.id === "pipelines")!) === "nearly", "20 of 25 is nearly full");
ok(pressure(rows.find((r) => r.id === "connections")!) === "full", "25 of 25 is full");
ok(pressure(rows.find((r) => r.id === "agents")!) === "ok", "1 of 5 is fine");
ok(usageRows(PLANS[2], input).every((r) => pressure(r) === "ok"), "an unlimited plan is never full");
ok(pressure({ ...rows[0], used: 26 }) === "full", "over the limit is full, as after a downgrade");
ok(human(100 * GIB) === "100 GB" && human(1024 * GIB) === "1 TB" && human(Number.MAX_SAFE_INTEGER) === "No limit", "sizes are written for people");
ok(limitText(NO_LIMIT) === "No limit" && limitText(2000) === "2,000", "limits are written for people");

// ---- validation report
const rep = toReport({ issues: [{ level: "warn", msg: "x", nodeId: "n1" }, { level: "bogus", msg: "y" }], policyViolations: ["No direct production deploys."], runBlockers: [], publishable: true, runnable: false });
ok(rep.issues.length === 2 && rep.issues[1].level === "info", "an unknown level reads as info");
ok(rep.publishable && !rep.runnable && rep.policyViolations.length === 1, "verdicts are read as sent");
ok(!toReport({}).publishable && !toReport({}).runnable && toReport({}).issues.length === 0, "an empty answer is refused, not trusted");

// ---- discovery
ok(validateQuery({ kind: "" }) !== null && validateQuery({ kind: "  " }) !== null, "a kind is required");
ok(validateQuery({ kind: "Deployment" }) === null, "a plain kind is accepted");
ok(validateQuery({ kind: "x", limit: 0 }) !== null && validateQuery({ kind: "x", limit: DISCOVER_MAX_LIMIT + 1 }) !== null && validateQuery({ kind: "x", limit: 1.5 }) !== null, "the limit is 1 to 200 and whole");
ok(validateQuery({ kind: "x".repeat(65) }) !== null, "a long kind is refused");
const dep = sampleDiscovery({ kind: "Deployment" });
ok(dep.items.length === 3 && !dep.truncated, "three sample deployments");
ok(sampleDiscovery({ kind: "Deployment", namespace: "ml-staging" }).items.length === 1, "a namespace narrows the answer");
ok(sampleDiscovery({ kind: "Deployment", limit: 2 }).items.length === 2 && sampleDiscovery({ kind: "Deployment", limit: 2 }).truncated, "a limit truncates and says so");
ok(sampleDiscovery({ kind: "Unheard" }).items.length === 0, "an unknown kind finds nothing");
ok(DISCOVER_DEFAULT_LIMIT === 50, "the default limit is 50");
ok(DISCOVER_KINDS.kubernetes.includes("Deployment") && DISCOVER_KINDS.s3.includes("bucket"), "suggested kinds per integration");
const read = toDiscovery({ items: [{ ref: { kind: "Deployment", namespace: "a", name: "b" }, attributes: { replicas: 3 } }], truncated: true });
ok(read.items[0].attributes.replicas === "3" && read.truncated, "attribute values are read as text");

// ---- connector catalogue
const d = blankConnector();
d.id = "acme-ticketing"; d.name = "Acme Ticketing"; d.vendor = "Acme"; d.blurb = "Reads tickets and projects from Acme."; d.versionTarget = "v1"; d.permissions = { read: ["Read tickets"], write: [] }; d.prerequisites = ["An Acme account"];
const m = toManifest(d);
ok(m.id === "acme-ticketing" && m.contract && m.icon && !("published" in m), "the manifest carries the contract and icon and none of the console-only block");
ok(m.privateConnectivity === false && !("compliance" in m), "optional parts are left out when empty");
const back = toListing({ id: d.id, status: "beta", hosting: "CONTRACT", manifest: m, version: "1.2.0", enabled: true, updatedAt: "2026-11-20T09:00:00Z", updatedBy: "ada", releases: [{ version: "1.2.0", manifestDigest: "sha256:ab", at: "2026-11-18T10:00:00Z", by: "ada", note: "n" }] });
ok(back.def.name === d.name && back.def.contract?.version === "1" && back.hosting === "CONTRACT" && back.status === "beta" && back.releases[0].digest === "sha256:ab", "a listing reads back as the definition");
ok(toListing({ id: "x", hosting: "weird", manifest: {} }).hosting === "BUILTIN", "an unknown hosting reads as built in");
ok(toListing({ id: "x", status: "AVAILABLE", hosting: "builtin", manifest: {} }).status === "available", "the server's casing is accepted");
ok(SEMVER.test("1.2.0") && !SEMVER.test("1.2") && !SEMVER.test("v1.2.0"), "a version is three numbers");
ok(nextVersion(undefined) === "1.0.0" && nextVersion("1.2.9") === "1.2.10" && nextVersion("junk") === "1.0.0", "the next version follows the last");
ok(isNewer("1.3.0", "1.2.9") && !isNewer("1.2.0", "1.2.0") && !isNewer("1.1.9", "1.2.0") && isNewer("2.0.0", "1.99.99"), "newer is by number, not by text");
ok(validateDefinition(d, [], false).length === 0, "the starter definition publishes clean");
ok(validateDefinition(d, [{ id: "acme-ticketing", source: "published" }], false).some((p) => p.path === "id"), "an identifier already in the catalogue is refused");

// ---- what an organization sees of the live catalogue
import { defFromOrgListing } from "../src/lib/mlops/manifest";
import { allIntegrations, integrationById, isPublished, setLiveCatalogue, INTEGRATIONS } from "../src/lib/mlops/catalog";
const listed = (o: Record<string, unknown>) => ({ ...toManifest(d), ...o });
ok(defFromOrgListing(listed({ status: "available", usable: true })).status === "available", "a usable listing keeps its status");
const off = defFromOrgListing(listed({ status: "available", usable: false }));
ok(off.status === "planned" && off.limitations[0].startsWith("Switched off"), "a switched-off listing reads as Planned and says why");
ok(defFromOrgListing(listed({ status: "planned", usable: false })).limitations.length === d.limitations.length, "a roadmap listing gets no extra note");
ok(allIntegrations() === INTEGRATIONS || allIntegrations().length === INTEGRATIONS.length, "without a live catalogue the console's own copy is used");
setLiveCatalogue([defFromOrgListing(listed({ status: "beta", usable: true }))]);
ok(allIntegrations().length === 1 && integrationById("acme-ticketing")?.status === "beta", "a live catalogue replaces the list");
ok(integrationById("kubernetes")?.id === "kubernetes", "a connection to a connector missing from the live list still resolves");
setLiveCatalogue([]);
ok(allIntegrations().length === INTEGRATIONS.length, "an empty live catalogue falls back to the console's own copy");
setLiveCatalogue(null);

// Customers only see connectors the platform administrators approved: Available, Beta and the generic Custom ones. A draft (Planned) stays hidden.
ok(isPublished({ status: "available" }) && isPublished({ status: "beta" }) && isPublished({ status: "custom" }), "available, beta and custom connectors are visible to customers");
ok(!isPublished({ status: "planned" }), "a draft connector is hidden from customers");
ok(INTEGRATIONS.filter(isPublished).length > 0 && INTEGRATIONS.filter(isPublished).length < INTEGRATIONS.length, "the built-in list has both approved connectors and ones still in development");
setLiveCatalogue([defFromOrgListing(listed({ status: "beta", usable: true })), defFromOrgListing(listed({ id: "draft-x", status: "planned", usable: true }))]);
ok(allIntegrations().filter(isPublished).length === 1, "a live catalogue shows the approved one and hides the draft");
setLiveCatalogue([defFromOrgListing(listed({ status: "available", usable: false }))]);
ok(allIntegrations().filter(isPublished).length === 0, "an approved connector that the operators switched off is hidden too");
setLiveCatalogue(null);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
