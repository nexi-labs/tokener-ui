/**
 * Checks for registry stage rules, mirroring ModelService.setStage on the server.
 * Run: npx tsx --tsconfig scripts/tsconfig.scripts.json scripts/check-mlops-stage.ts
 */
import { STAGES, STAGE_ACTION, applyStage, stageMoves, stageProblem } from "../src/lib/mlops/stage";
import { can } from "../src/lib/mlops/rbac";
import type { ModelVersion } from "../src/lib/mlops/types";

let pass = 0; let fail = 0;
const ok = (c: unknown, m: string) => { if (c) pass++; else { fail++; console.error("FAIL", m); } };
const v = (version: number, stage: ModelVersion["stage"], state: ModelVersion["approval"]["state"]) => ({ version, stage, approval: { state } }) as ModelVersion;

const vs = [v(1, "production", "approved"), v(2, "none", "approved"), v(3, "none", "pending"), v(4, "none", "rejected"), v(5, "none", "not-required"), v(6, "staging", "approved")];

ok(stageProblem(vs, 2, "staging") === null, "approved goes to staging");
ok(stageProblem(vs, 3, "staging")?.includes("pending") === true, "pending cannot be released");
ok(stageProblem(vs, 4, "staging")?.includes("rejected") === true, "rejected cannot be released");
ok(stageProblem(vs, 5, "staging") === null, "no approval needed goes to staging");
ok(stageProblem(vs, 2, "production")?.includes("staging") === true, "production only from staging");
ok(stageProblem(vs, 6, "production") === null, "staging goes to production");
ok(stageProblem(vs, 3, "archived") === null, "a pending version can be archived");
ok(stageProblem(vs, 3, "none") === null, "back to not released is always possible");
ok(stageProblem(vs, 1, "production") === null, "same stage is a no-op");
ok(stageProblem(vs, 9, "staging") !== null, "unknown version");

const moves = stageMoves(vs, 6);
ok(moves.length === 3 && !moves.some((m) => m.to === "staging"), "moves exclude the current stage");
ok(moves.find((m) => m.to === "production")?.demotes === 1, "promotion names the version it demotes");
ok(stageMoves(vs, 2).find((m) => m.to === "production")?.allowed === false, "production not offered from none");

const after = applyStage(vs, 6, "production");
ok(after.find((x) => x.version === 6)?.stage === "production" && after.find((x) => x.version === 1)?.stage === "staging", "promotion demotes the old production version");
ok(after.filter((x) => x.stage === "production").length === 1, "one production version at most");
ok(applyStage(vs, 2, "staging").find((x) => x.version === 1)?.stage === "production", "other moves leave production alone");

ok(STAGE_ACTION.production === "model.approve" && STAGES.filter((s) => s !== "production").every((s) => STAGE_ACTION[s] === "model.register"), "production needs approve, the rest register");
ok(!can("developer", STAGE_ACTION.production).ok && can("approver", STAGE_ACTION.production).ok, "role check matches");
ok(can("developer", STAGE_ACTION.staging).ok && !can("viewer", STAGE_ACTION.staging).ok, "developer may stage, viewer may not");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
