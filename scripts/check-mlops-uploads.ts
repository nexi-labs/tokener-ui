/**
 * Checks for the model upload records, mirroring UploadSession.java and ModelUploadService on the server.
 * Run: npx tsx --tsconfig scripts/tsconfig.scripts.json scripts/check-mlops-uploads.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MAX_OPEN_PER_PERSON, SESSION_HOURS, abortProblem, canAbort, inProgress, leftText, minutesLeft, newestFirst, toUpload, STATUS_LABEL, STATUS_TONE } from "../src/lib/mlops/uploads";

let pass = 0; let fail = 0;
const ok = (c: unknown, m: string) => { if (c) pass++; else { fail++; console.error("FAIL", m); } };

// The numbers and statuses come from the Java service and record.
const svc = readFileSync(join(__dirname, "../../tokener-mlops/src/main/java/io/tokener/mlops/application/service/ModelUploadService.java"), "utf8");
const rec = readFileSync(join(__dirname, "../../tokener-mlops/src/main/java/io/tokener/mlops/domain/modelstore/UploadSession.java"), "utf8");
ok(new RegExp(`SESSION_TTL = Duration.ofHours\\(${SESSION_HOURS}\\)`).test(svc), "session length matches the server");
ok(new RegExp(`MAX_OPEN_PER_USER = ${MAX_OPEN_PER_PERSON}`).test(svc), "open uploads per person match the server");
const enumBody = /enum Status \{([^}]*)\}/.exec(rec)?.[1] ?? "";
const serverStatuses = enumBody.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
ok(serverStatuses.length === 6 && serverStatuses.every((s) => s in STATUS_LABEL && s in STATUS_TONE), "every server status has a label and a tone");
ok(/ACCEPTED \|\| cur.status\(\) == Status.REJECTED/.test(svc), "the server refuses to abort a finished upload");

const raw = { id: "upl_1", modelName: "support-intent", task: "classification", framework: "pytorch", declaredFormat: "SAFETENSORS", fileName: "m.safetensors", declaredBytes: 1000, license: "apache-2.0",
  createdBy: "u1", createdAt: "2026-11-22T00:00:00Z", expiresAt: "2026-11-23T00:00:00Z", status: "OPEN", bytes: 0, findings: null, summary: null, modelId: null, version: null };
const u = toUpload(raw);
ok(u.status === "open" && u.format === "safetensors", "status and format are read in lower case");
ok(u.findings.length === 0 && u.summary === "" && u.modelId === "" && u.version === null, "missing fields become empty values");
ok(toUpload({ ...raw, status: "WEIRD" }).status === "open", "an unknown status reads as open");
ok(toUpload({ ...raw, status: "ACCEPTED", modelId: "m1", version: 3, findings: ["warn: x"], summary: "ok" }).version === 3, "an accepted upload carries the version");
ok(toUpload({ ...raw, status: "REJECTED", findings: ["block: pickle"] }).findings[0] === "block: pickle", "findings are kept");

const by = (s: string) => toUpload({ ...raw, id: s, status: s.toUpperCase() });
const all = ["open", "receiving", "accepted", "rejected", "aborted", "expired"].map(by);
ok(all.filter(canAbort).map((x) => x.id).join() === "open,receiving", "only open and receiving uploads can be aborted");
ok(inProgress(all).length === 2, "in progress counts the two open kinds");
ok(abortProblem(undefined) !== null, "an unknown upload cannot be aborted");
ok(abortProblem(by("accepted"))?.includes("accepted") === true, "a finished upload names its status");
ok(abortProblem(by("open")) === null, "an open upload can be aborted");

const now = Date.parse("2026-11-22T18:00:00Z");
ok(minutesLeft(u, now) === 360, "six hours left");
ok(minutesLeft(by("accepted"), now) === null, "a finished upload has no time left");
ok(minutesLeft(u, Date.parse("2026-11-23T01:00:00Z")) === null, "a passed deadline is not shown");
ok(leftText(360) === "6 h" && leftText(370) === "6 h 10 min" && leftText(40) === "40 min", "time wording");

const sorted = newestFirst([toUpload({ ...raw, id: "a", createdAt: "2026-11-20T00:00:00Z" }), toUpload({ ...raw, id: "b", createdAt: "2026-11-22T00:00:00Z" })]);
ok(sorted[0].id === "b", "newest first");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
