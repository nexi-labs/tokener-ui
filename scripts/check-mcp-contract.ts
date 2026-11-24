/**
 * Runs the console's mapping of MCP route answers over JSON the Java routes actually produced (McpContractDump), so the two cannot drift.
 * From the repository root: bash scripts/mcp_contract_check.sh
 */
import { readFileSync } from "node:fs";
import { fromPatch, fromTool, toGrant, toPrincipal, toServer } from "../src/lib/mlops/live/mcp";
import { errors, validateServer } from "../src/lib/mlops/mcp-model";

const d = JSON.parse(readFileSync(process.argv[2], "utf8"));
let pass = 0, fail = 0;
const ok = (c: boolean, what: string) => { if (c) pass++; else { fail++; console.log("FAIL", what); } };

const s = toServer(d.server);
ok(s.name === "Support tools" && s.slug === "support-tools" && s.env === "development" && s.auth === "api-key", "identity, address, environment and access");
ok(s.status === "draft" && s.version === 0 && s.demo === false && s.ratePerMinute === 120 && s.redactResults === true && s.audit === "metadata", "status, version and defaults");
ok(s.tools.length === 4 && s.tools.map((t) => t.source.kind).join() === "pipeline,http,sql,model", "four tools, one of each kind, in order");
const [p, h, q, m] = s.tools;
ok(p.id === "t-p" && p.effect === "changes" && p.approval === true, "a changing tool keeps its effect and approval");
ok(p.source.kind === "pipeline" && p.source.pipelineId === "p-refund" && p.source.waitSeconds === 30, "pipeline source");
ok(h.source.kind === "http" && h.source.method === "POST" && h.source.url === "https://orders.example/api" && h.source.secretName === "orders-token", "http source keeps the secret name, a reference");
ok(q.source.kind === "sql" && q.source.connectionId === "warehouse" && q.source.query === "SELECT 1", "sql source");
ok(m.source.kind === "model" && m.source.alias === "openai/gpt-5" && m.source.instruction === "Be brief.", "model source");
ok(p.fields.length === 2 && p.fields[0].required === true && p.fields[0].options === undefined && p.fields[1].options?.join() === "late,damaged", "fields and allowed values");
ok(!JSON.stringify(s).includes("null"), "no nulls leak into the console's model");
ok(typeof s.createdAt === "string" && Date.parse(s.updatedAt) > 0, "times are ISO text");
ok(toServer(d.empty).env === "staging" && toServer(d.empty).tools.length === 0, "an empty server has no tools");
ok(toServer(d.list[0]).id === s.id, "the list uses the same shape");

// Writing back: what the console sends must be what the server accepts, and what it understands again.
const back = toServer({ ...d.server, tools: s.tools.map(fromTool) });
ok(JSON.stringify(back.tools) === JSON.stringify(s.tools), "tools survive a round trip through the request shape");
ok(fromTool(h).source.query === null && fromTool(h).source.pipelineId === null, "unused source fields are sent as null");
ok(Object.keys(fromPatch({ name: "X" })).join() === "name", "a patch sends only what changed");
ok(fromPatch({ tools: [] }).tools.length === 0 && !("name" in fromPatch({ tools: [] })), "an empty tool list is still sent");

// The console's own publish rules still run on a server's data.
const issues = errors(validateServer(s, [s]));
ok(Array.isArray(issues), "the publish rules run on a server's data");

const g = toGrant(d.appGrant.grant, s.ratePerMinute);
ok(g.principal.kind === "app" && g.principal.label === "bot" && g.principal.detail === undefined, "principal");
ok(g.tools === "all" && g.scope === "changes" && g.ratePerMinute === 90 && g.expiresAt === undefined && g.status === "active", "grant terms");
ok(g.key?.prefix === d.appGrant.grant.key.prefix && d.appGrant.key.startsWith(g.key?.prefix ?? "?") && !JSON.stringify(g).includes(d.appGrant.key), "only the key prefix is kept; the value is not in the grant");
ok(typeof d.appGrant.key === "string" && d.appGrant.key.startsWith("tok_mcp_"), "the key value is returned once, beside the grant");
const u = toGrant(d.userGrant.grant, 0);
ok(Array.isArray(u.tools) && u.tools[0] === "t-h" && u.expiresAt === "2026-11-19T09:00:00Z" && u.key === undefined, "a person's grant has a list of tools, an expiry and no key");
const r = toGrant(d.revoked, 0);
ok(r.status === "revoked" && !!r.revokedAt, "a revoked grant");
ok(toGrant(d.rotated.grant, 0).key?.prefix === d.rotated.grant.key.prefix && d.rotated.key.startsWith("tok_mcp_"), "a rotated key");
ok(d.grants.length === 2 && toGrant(d.grants[0], 0).serverId === s.id, "the grant list");
ok(toGrant({ ...d.appGrant.grant, ratePerMinute: null }, 77).ratePerMinute === 77, "a grant with no rate of its own takes the server's");

const ps = d.principals.map(toPrincipal);
ok(ps.length === 2 && ps[0].detail === "maria@nexi.example" && ps[1].detail === undefined, "picker candidates");

console.log(`${pass} checks passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
