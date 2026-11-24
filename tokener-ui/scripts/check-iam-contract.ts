/**
 * Runs the console's real identity administration client (liveAdmin) over responses the Java identity service produced (IamAdminContractDump).
 * A stub stands in for the network and serves the recorded answers by method and path. From the repository root: bash scripts/iam_contract_check.sh
 */
import { readFileSync } from "node:fs";
import { liveAdmin, sampleAdmin, SAMPLE_ROLES, ROLE_SUMMARY, roleLabel, scopeLabel } from "../src/lib/iam/admin";
import { ApiError } from "../src/lib/api/client";
import { liveServiceAccounts, sampleServiceAccounts } from "../src/lib/iam/serviceAccounts";

type Rec = { status: number; body: unknown };
const d = JSON.parse(readFileSync(process.argv[2], "utf8")) as Record<string, Rec>;
let pass = 0, fail = 0;
const ok = (c: boolean, what: string) => { if (c) pass++; else { fail++; console.log("FAIL", what); } };

const seen: string[] = [];
let approvals = 0, saCreates = 0, saRotates = 0;
(globalThis as { fetch: unknown }).fetch = async (url: string, init: { method: string; body?: string }) => {
  const u = new URL(url, "http://x"), p = u.pathname.replace("/api/v1/iam", ""), m = init.method, body = init.body ? JSON.parse(init.body) : undefined;
  seen.push(`${m} ${p}${u.search}`);
  let key: string | null = null;
  if (m === "GET" && p === "/roles") key = "roles";
  else if (m === "GET" && p === "/users") key = u.searchParams.get("q") ? "usersSearch" : "users";
  else if (m === "POST" && p === "/users") key = body.email === "new.hire@acme.com" && seen.filter((s) => s === "POST /users").length > 1 ? "inviteDuplicate" : "invite";
  else if (m === "PUT" && p.endsWith("/roles")) key = body.assignments.length === 0 ? "replaceRolesEmpty" : "replaceRoles";
  else if (p.endsWith("/disable")) key = "disable";
  else if (p.endsWith("/enable")) key = "enable";
  else if (p.endsWith("/password-reset")) key = "passwordReset";
  else if (m === "GET" && p === "/access-requests") key = ({ pending: "requestsPending", approved: "requestsApproved", rejected: "requestsRejected" } as Record<string, string>)[u.searchParams.get("status") ?? ""] ?? null;
  else if (p.endsWith("/approve")) key = approvals++ === 0 ? "approve" : "approveAgain";
  else if (p.endsWith("/reject")) key = "reject";
  else if (m === "GET" && p.endsWith("/service-accounts")) key = "saList";
  else if (m === "POST" && p.endsWith("/service-accounts")) key = body.name === "etl-job" ? (saCreates++ === 0 ? "saCreate" : "saCreateDuplicate") : "saCreateForbidden";
  else if (p.endsWith("/rotate-secret")) key = saRotates++ === 0 ? "saRotate" : "saRotateRevoked";
  else if (m === "DELETE" && p.startsWith("/service-accounts/")) key = "saRevoke";
  if (!key) return new Response("{}", { status: 404 });
  const r = d[key];
  return new Response(r.body === null || r.status === 204 ? null : JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
};

const refusal = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { return e instanceof ApiError ? e : new ApiError(0, "other", String(e)); } };
const keys = (o: object) => Object.keys(o).sort().join();

async function main() {
  const live = liveAdmin({ orgId: "11111111-1111-1111-1111-111111111111" });
  const sample = sampleAdmin(SAMPLE_ROLES);

  // roles
  const roles = await live.roles();
  ok(roles.length >= 6 && roles.every((r) => r.role && Array.isArray(r.scopes) && r.permissions.length > 0), "roles come with scopes and permissions");
  ok(roles.every((r) => !!ROLE_SUMMARY[r.role] && roleLabel(r.role) !== r.role), "every role the server has is described and named in the console");
  ok(JSON.stringify(roles.map((r) => r.role).sort()) === JSON.stringify(SAMPLE_ROLES.map((r) => r.role).sort()), "the sample catalogue has the same roles");

  // users
  const page = await live.users({ page: 0, size: 25 });
  ok(seen.some((s) => s.startsWith("GET /users?") && s.includes("org=11111111") && s.includes("page=0") && s.includes("size=25")), "the list asks for this organization and a page");
  ok(page.content.length === 5 && page.totalElements === 5 && page.totalPages >= 1, "a page of people with totals");
  const statuses = new Set(page.content.map((u) => u.status));
  ok([...statuses].every((s) => ["INVITED", "ACTIVE", "PENDING", "DISABLED"].includes(s)) && statuses.has("DISABLED") && statuses.has("PENDING"), "statuses are ones the console knows (" + [...statuses].join() + ")");
  const sampleUsers = await sample.users({});
  ok(keys(page.content[0]) === keys(sampleUsers.content[0]), `a person has the same fields in the sample workspace as live (${keys(page.content[0])})`);
  ok(page.content.every((u) => u.assignments.length > 0 && u.assignments.every((a) => a.role && a.scope.type)), "every person has role assignments with a scope");
  ok(page.content.every((u) => u.assignments.every((a) => scopeLabel(a, "Acme").length > 0)), "every scope can be labelled");
  ok(!JSON.stringify(page).toLowerCase().includes("passwordhash") && page.content.every((u) => typeof u.passwordSet === "boolean"), "no password hash in a person's record, only whether one is set");
  const tenantAdmin = page.content.find((u) => u.email === "tenant.admin@acme.com");
  ok(!!tenantAdmin && tenantAdmin.assignments[0].scope.type === "tenant" && !!tenantAdmin.assignments[0].scope.id, "a tenant scoped role keeps its tenant id");
  const found = await live.users({ q: "fin" });
  ok(found.content.length === 1 && found.content[0].email === "fin@acme.com" && seen.some((s) => s.includes("q=fin")), "search is sent and answered");

  // changes
  const invited = await live.invite("new.hire@acme.com", "New Hire", [{ role: "developer", scope: { type: "org", id: "11111111-1111-1111-1111-111111111111" } }]);
  ok(invited.status === "INVITED" && invited.assignments[0].role === "developer" && invited.lastLoginAt === null, "an invitation returns an invited person");
  const dup = await refusal(() => live.invite("new.hire@acme.com", "Again", [{ role: "viewer", scope: { type: "org", id: "x" } }]));
  ok(dup?.status === 409 && dup.message === "A user with this email already exists.", "a duplicate says so in the server's words");
  const roled = await live.replaceRoles(invited.id, [{ role: "viewer", scope: { type: "org", id: "x" } }, { role: "finance", scope: { type: "org", id: "x" } }]);
  ok(roled.assignments.length === 2, "replacing roles returns the person with both");
  const none = await refusal(() => live.replaceRoles(invited.id, []));
  ok(none?.status === 422 && none.message.startsWith("A user must keep at least one role"), "removing every role is refused with the server's reason");
  ok((await live.setDisabled(invited.id, true)).status === "DISABLED" && (await live.setDisabled(invited.id, false)).status === "INVITED", "disable and enable return the new status");
  ok((await live.sendPasswordReset(invited.id)) === undefined, "a password reset has no body");

  // access requests
  const forbidden = d.requestsForbidden;
  ok(forbidden.status === 403 && (forbidden.body as { detail: string }).detail === "Only a platform operator can review access requests.", "a non operator is told why in words");
  const pending = await live.accessRequests("PENDING");
  ok(seen.includes("GET /access-requests?status=pending&size=50"), "the status filter is sent in lower case");
  ok(pending.content.length === 2 && pending.content.every((r) => r.status === "PENDING" && r.email && r.fullName && r.reason), "pending requests are complete");
  const sampleReq = await sample.accessRequests("APPROVED");
  ok(keys(pending.content[0]) === keys(sampleReq.content[0]) || Object.keys(pending.content[0]).every((k) => k in sampleReq.content[0]) , `a request has the fields the sample one has (${keys(pending.content[0])})`);
  const approved = await live.approve(pending.content[0].id, [{ role: "org_admin", scope: { type: "org", id: "11111111-1111-1111-1111-111111111111" } }]);
  ok(approved.status === "INVITED" && approved.email === pending.content[0].email, "approving returns the invited person");
  const again = await refusal(() => live.approve(pending.content[0].id, []));
  ok(again?.status === 409 && again.message === "Request was already decided.", "approving twice is refused in the server's words");
  ok((await live.reject(pending.content[1].id)) === undefined, "rejecting has no body");
  const done = await live.accessRequests("APPROVED"), no = await live.accessRequests("REJECTED");
  ok(done.content[0]?.status === "APPROVED" && !!done.content[0].decidedBy && !!done.content[0].decidedAt, "an approved request carries who decided and when");
  ok(no.content[0]?.status === "REJECTED", "a rejected request is listed as rejected");

  // service accounts
  const made = await liveServiceAccounts.create("p", "etl-job", "developer", 30);
  ok(seen.some((s) => s.startsWith("POST /projects/p/service-accounts")), "creating posts to the project");
  ok(made.status === "ACTIVE" && made.role === "developer" && made.clientId === made.id && made.secret.startsWith("tsa_") && !!made.expiresAt, "a created account carries its client id and its secret once");
  const sampleMade = await sampleServiceAccounts.create("p-1", "contract-check", "developer", 30);
  ok(Object.keys(made).filter((k) => k !== "secret" && k !== "clientId").sort().join() === Object.keys(sampleMade).filter((k) => k !== "secret" && k !== "clientId").sort().join(), "an account has the same fields in the sample workspace as live");
  const dupSa = await refusal(() => liveServiceAccounts.create("p", "etl-job", "developer", 30));
  ok(dupSa?.status === 409 && dupSa.message === "This project already has a service account with that name.", "a duplicate name is refused in the server's words");
  const noSa = await refusal(() => liveServiceAccounts.create("p", "nope", "developer", null));
  ok(noSa?.status === 403 && noSa.message === "Not permitted for that project.", "a role without the permission is refused in words");
  const list = await liveServiceAccounts.list("t");
  ok(list.length === 2 && list.every((a) => !("secret" in a) && !JSON.stringify(a).includes("tsa_")), "a listing carries no secret");
  ok(list.every((a) => ["ACTIVE", "EXPIRED", "REVOKED"].includes(a.status)), "statuses are ones the console knows");
  const rot = await liveServiceAccounts.rotate(made.id, 90);
  ok(seen.some((s) => s.endsWith("/rotate-secret")) && rot.secret.startsWith("tsa_") && rot.secret !== made.secret, "rotating returns a different secret");
  const rev = await liveServiceAccounts.revoke(made.id);
  ok(rev.status === "REVOKED" && !("secret" in rev), "revoking returns the account as revoked, without a secret");
  const rotRevoked = await refusal(() => liveServiceAccounts.rotate(made.id));
  ok(rotRevoked?.status === 409 && rotRevoked.message === "This service account is revoked. Create a new one instead.", "rotating a revoked account is refused in the server's words");
  const sampleRotRevoked = await refusal(async () => { const x = await sampleServiceAccounts.create("p-1", "contract-revoked", "viewer", null); await sampleServiceAccounts.revoke(x.id); await sampleServiceAccounts.rotate(x.id); });
  ok(sampleRotRevoked?.status === 409 && sampleRotRevoked.message === rotRevoked?.message, "the sample workspace refuses it in the same words");

  console.log(`iam contract: ${pass}/${pass + fail} passed`);
  if (fail) process.exit(1);
}
main();
