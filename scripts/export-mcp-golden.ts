/**
 * Writes the expected output of the console's MCP server rules and access rules for a fixed matrix of inputs, so the Java ports can be compared with
 * them case by case (McpChecks). Run from tokener-ui: npx tsx scripts/export-mcp-golden.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname } from "node:path";
import { isSingleSelect, placeholders, sqlParams, toolsList, validateServer, type McpServerSpec, type McpTool, type ToolSource } from "../src/lib/mlops/mcp-model";
import { decide, validateGrant, type Grant, type GrantInput } from "../src/lib/mlops/mcp-access";
import { seedServers } from "../src/lib/mlops/mcp-seeds";

const out = "../tokener-mlops/src/test/resources/io/tokener/mlops/golden/mcp.json";
const FIXED = "2026-10-01T00:00:00Z";
const strip = (s: McpServerSpec) => { const { demo, ...rest } = s; void demo; return { ...rest, createdAt: FIXED, updatedAt: FIXED }; };
const seeds = seedServers().map(strip) as unknown as McpServerSpec[];
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

// ---- server rules: one change at a time to a known good server, in every environment
type Mut = [string, (s: McpServerSpec) => void];
const tool0 = (s: McpServerSpec) => s.tools[0];
const withSource = (src: ToolSource): ((s: McpServerSpec) => void) => (s) => { tool0(s).source = src; };
const http = (url: string, extra: Partial<Extract<ToolSource, { kind: "http" }>> = {}): ToolSource => ({ kind: "http", method: "GET", url, ...extra });
const sql = (query: string, connectionId = "pg-dev"): ToolSource => ({ kind: "sql", connectionId, query });
const muts: Mut[] = [
  ["none", () => {}],
  ["name short", (s) => { s.name = "ab"; }], ["name spaces", (s) => { s.name = "   a  "; }], ["name nbsp", (s) => { s.name = "  ab "; }],
  ["slug upper", (s) => { s.slug = "Bad"; }], ["slug short", (s) => { s.slug = "a"; }], ["slug two", (s) => { s.slug = "ab"; }], ["slug trailing hyphen", (s) => { s.slug = "abc-"; }], ["slug digit start", (s) => { s.slug = "1abc"; }], ["slug 40", (s) => { s.slug = "a" + "b".repeat(38) + "c"; }], ["slug 41", (s) => { s.slug = "a" + "b".repeat(39) + "c"; }],
  ["description empty", (s) => { s.description = ""; }], ["description blank", (s) => { s.description = "  "; }],
  ["auth none", (s) => { s.auth = "none"; }], ["auth oauth", (s) => { s.auth = "oauth"; }], ["auth mtls", (s) => { s.auth = "mtls"; }],
  ["rate 0", (s) => { s.ratePerMinute = 0; }], ["rate 1", (s) => { s.ratePerMinute = 1; }], ["rate 6000", (s) => { s.ratePerMinute = 6000; }], ["rate 6001", (s) => { s.ratePerMinute = 6001; }],
  ["audit arguments", (s) => { s.audit = "arguments"; }],
  ["no tools", (s) => { s.tools = []; }], ["41 tools", (s) => { const t = tool0(s); s.tools = Array.from({ length: 41 }, (_, i) => ({ ...clone(t), id: "t" + i, name: "tool_" + i })); }],
  ["tool name upper", (s) => { tool0(s).name = "Lookup"; }], ["tool name empty", (s) => { tool0(s).name = ""; }], ["tool name 65", (s) => { tool0(s).name = "a".repeat(65); }], ["tool name dash", (s) => { tool0(s).name = "look-up"; }],
  ["duplicate tool names", (s) => { s.tools.push({ ...clone(tool0(s)), id: "dup" }); }],
  ["tool description empty", (s) => { tool0(s).description = ""; }], ["tool description short", (s) => { tool0(s).description = "Looks up an order."; }], ["tool description 20", (s) => { tool0(s).description = "x".repeat(20); }],
  ["changes without approval", (s) => { const t = tool0(s); t.effect = "changes"; t.approval = false; t.source = { kind: "pipeline", pipelineId: "pl", waitSeconds: 30 }; }],
  ["changes with http", (s) => { const t = tool0(s); t.effect = "changes"; t.approval = true; t.source = http("https://api.example.com/x"); }],
  ["changes ok", (s) => { const t = tool0(s); t.effect = "changes"; t.approval = true; t.source = { kind: "pipeline", pipelineId: "pl", waitSeconds: 30 }; }],
  ["field bad name", (s) => { tool0(s).fields.push({ name: "1x", type: "string", required: false, description: "d" }); }],
  ["field duplicate", (s) => { const t = tool0(s); t.fields.push({ ...clone(t.fields[0]) }); }],
  ["field no description", (s) => { tool0(s).fields[0].description = ""; }],
  ["field options on number", (s) => { tool0(s).fields.push({ name: "n", type: "number", required: false, description: "d", options: ["1"] }); }],
  ["field options on string", (s) => { tool0(s).fields.push({ name: "s", type: "string", required: false, description: "d", options: ["a", "b"] }); }],
  ["http plain", withSource(http("http://api.example.com/x"))], ["http credentials", withSource(http("https://user:pw@api.example.com/x"))], ["http user only", withSource(http("https://user@api.example.com/x"))],
  ["http localhost", withSource(http("https://localhost/x"))], ["http 127", withSource(http("https://127.0.0.1/x"))], ["http 10", withSource(http("https://10.0.0.5/x"))], ["http 192", withSource(http("https://192.168.1.1/x"))],
  ["http 172.16", withSource(http("https://172.16.0.1/x"))], ["http 172.31", withSource(http("https://172.31.9.9/x"))], ["http 172.32", withSource(http("https://172.32.0.1/x"))], ["http 169.254", withSource(http("https://169.254.169.254/x"))],
  ["http internal", withSource(http("https://db.corp.internal/x"))], ["http local", withSource(http("https://printer.local/x"))], ["http ipv6 loopback", withSource(http("https://[::1]/x"))], ["http 0.0.0.0", withSource(http("https://0.0.0.0/x"))],
  ["http not a url", withSource(http("not a url"))], ["http empty", withSource(http(""))], ["http scheme only", withSource(http("https://"))],
  ["http host placeholder", withSource(http("https://{{host}}/x"))], ["http host partial placeholder", withSource(http("https://api-{{env}}.example.com/x"))],
  ["http path placeholder ok", withSource(http("https://api.example.com/orders/{{order_id}}"))], ["http placeholder missing", withSource(http("https://api.example.com/{{missing}}"))],
  ["http query key", withSource(http("https://api.example.com/x?api_key={{order_id}}"))], ["http query token", withSource(http("https://api.example.com/x?Token=1"))], ["http query ok", withSource(http("https://api.example.com/x?id={{order_id}}"))],
  ["http space", withSource(http("https://api.example.com/a b"))], ["http port", withSource(http("https://api.example.com:8443/x"))], ["http uppercase host", withSource(http("https://API.Example.COM/x"))],
  ["secret ok", withSource(http("https://api.example.com/x", { secretName: "ORDERS_TOKEN" }))], ["secret lower", withSource(http("https://api.example.com/x", { secretName: "orders_token" }))], ["secret short", withSource(http("https://api.example.com/x", { secretName: "A" }))],
  ["http post reads", withSource(http("https://api.example.com/x", { method: "POST" }))],
  ["sql ok", withSource(sql("select id, name from items where id = :order_id limit 10"))], ["sql no connection", withSource(sql("select 1 limit 1", ""))], ["sql multi", withSource(sql("select 1; select 2"))],
  ["sql trailing semicolon", withSource(sql("select 1 limit 1;"))], ["sql insert", withSource(sql("insert into t values (1)"))], ["sql delete word", withSource(sql("select * from t where note = 'delete me' limit 5"))],
  ["sql delete real", withSource(sql("select * from t; delete from t"))], ["sql with cte", withSource(sql("with a as (select 1) select * from a limit 3"))], ["sql into", withSource(sql("select * into backup from t"))],
  ["sql param missing", withSource(sql("select * from t where a = :nope limit 1"))], ["sql cast", withSource(sql("select :order_id::int limit 1"))], ["sql param in string", withSource(sql("select ':ghost' as x, :order_id limit 1"))],
  ["sql no limit", withSource(sql("select * from t where id = :order_id"))], ["sql limit upper", withSource(sql("SELECT * FROM t WHERE id = :order_id LIMIT 5"))], ["sql empty", withSource(sql(""))], ["sql update upper", withSource(sql("UPDATE t SET a = 1"))],
  ["pipeline none", withSource({ kind: "pipeline", pipelineId: "", waitSeconds: 60 })], ["pipeline wait 0", withSource({ kind: "pipeline", pipelineId: "pl", waitSeconds: 0 })], ["pipeline wait 300", withSource({ kind: "pipeline", pipelineId: "pl", waitSeconds: 300 })], ["pipeline wait 301", withSource({ kind: "pipeline", pipelineId: "pl", waitSeconds: 301 })],
  ["model empty alias", withSource({ kind: "model", alias: "  ", instruction: "x" })], ["model ok", withSource({ kind: "model", alias: "chat-default", instruction: "x" })],
];
const servers: unknown[] = [];
for (const seed of seeds) for (const env of ["development", "staging", "production"] as const) for (const [label, mutate] of muts) {
  const s = clone(seed); s.env = env; mutate(s);
  const others = [{ id: "other", slug: seed.slug }, { id: s.id, slug: s.slug }, { id: "x", slug: "unrelated" }];
  servers.push({ label: `${seed.id}/${env}/${label}`, server: s, others, issues: validateServer(s, others), toolsList: toolsList(s) });
}

// ---- helpers
const strings = ["select 1", "  select 1;  ", "select 1; select 2", "with a as (select 1) select * from a", "SELECT * FROM t WHERE a = ':x' AND b = :y", "select a::int, :p from t", "select :a, :b, :a", "", ";", "select 'it''s :z' , :w", "update t set a = 1", "select * from t where x = 'drop'", "select * from t -- set\nlimit 1", "selectx 1", "withdraw 1", "select :a:b", "select 1 do", "select call from t", "{{ a }} {{b}} {{ a}} {{1x}} {{}} {{ c_d1 }}", "https://x/{{id}}?q={{ q }}"];
const helpers = strings.map((s) => ({ text: s, sqlParams: sqlParams(s), single: isSingleSelect(s), placeholders: placeholders(s) }));

// ---- access rules
const srv = seeds[0]; const read = srv.tools.find((x: McpTool) => x.effect === "reads")!; const chg = srv.tools.find((x: McpTool) => x.effect === "changes")!;
const NOW = Date.parse("2026-11-02T00:00:00Z");
const P = (kind: "user" | "group" | "app" | "service-account", id: string) => ({ kind, id, label: id });
const grant = (o: Partial<Grant>): Grant => ({ id: "g", serverId: srv.id, principal: P("user", "u1"), tools: "all", scope: "reads", ratePerMinute: 60, note: "n", createdBy: "x", createdAt: FIXED, status: "active", ...o });
const variants: [string, Partial<Grant>][] = [
  ["reads all", {}], ["changes all", { scope: "changes" }], ["reads read-only tool list", { tools: [read.id] }], ["changes with changing tool", { tools: [chg.id], scope: "changes" }], ["changes tool but reads scope", { tools: [chg.id] }],
  ["expired", { expiresAt: "2026-10-01T00:00:00Z" }], ["future", { expiresAt: "2026-12-01T00:00:00Z" }], ["expires exactly now", { expiresAt: "2026-11-02T00:00:00Z" }], ["revoked", { status: "revoked" }], ["other server", { serverId: "other" }], ["other principal", { principal: P("user", "u2") }],
  ["empty tools", { tools: [] }], ["high rate", { ratePerMinute: 300 }],
];
const decisions: unknown[] = [];
const combos: Grant[][] = [[], ...variants.map(([, o]) => [grant(o)]), ...variants.flatMap(([, a], i) => variants.slice(i + 1).map(([, b]) => [grant({ ...a, id: "a" }), grant({ ...b, id: "b" })]))];
for (const gs of combos) for (const t of [read, chg, undefined]) decisions.push({ grants: gs, serverId: srv.id, principalId: "u1", tool: t ?? null, now: NOW, verdict: decide(gs, srv.id, "u1", t, NOW) });

const base: GrantInput = { serverId: srv.id, principal: P("user", "u1"), tools: "all", scope: "reads", ratePerMinute: 60, expiresInDays: 30, note: "Support copilot needs lookups" };
const inputs: [string, Partial<GrantInput>][] = [
  ["valid", {}], ["no principal", { principal: P("user", "") }], ["no tools", { tools: [] }], ["unknown tool", { tools: ["nope"] }], ["one tool", { tools: [read.id] }], ["rate 0", { ratePerMinute: 0 }], ["rate 1", { ratePerMinute: 1 }], ["rate at server", { ratePerMinute: srv.ratePerMinute }],
  ["rate above server", { ratePerMinute: srv.ratePerMinute + 1 }], ["rate fraction", { ratePerMinute: 1.5 }], ["changes all", { scope: "changes" }], ["changes reads tool", { scope: "changes", tools: [read.id] }], ["changes chg tool", { scope: "changes", tools: [chg.id] }],
  ["group changes all", { scope: "changes", principal: P("group", "g") }], ["group changes tool", { scope: "changes", principal: P("group", "g"), tools: [chg.id] }], ["group reads all", { principal: P("group", "g") }],
  ["note short", { note: "short" }], ["note 8", { note: "12345678" }], ["note blank", { note: "        " }], ["note padded", { note: "  abc  " }], ["no expiry", { expiresInDays: null }],
];
const existingSets: [string, Grant[]][] = [["none", []], ["active", [grant({})]], ["revoked", [grant({ status: "revoked" })]], ["expired", [grant({ expiresAt: "2026-10-01T00:00:00Z" })]], ["other server", [grant({ serverId: "other" })]], ["other principal", [grant({ principal: P("user", "u2") })]]];
const grantChecks: unknown[] = [];
for (const [il, ip] of inputs) for (const [el, ex] of existingSets) for (const auth of ["api-key", "none"] as const) {
  const s = clone(srv); s.auth = auth; const input = { ...base, ...ip };
  // validateGrant reads the clock through isExpired, so the golden uses the same fixed time as the decisions: pin Date.now.
  const real = Date.now; Date.now = () => NOW;
  const error = validateGrant(input, s, ex);
  Date.now = real;
  grantChecks.push({ label: `${il}/${el}/${auth}`, input, server: s, existing: ex, now: NOW, error });
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out + ".gz", gzipSync(JSON.stringify({ servers, helpers, decisions, grantChecks }), { level: 9 }));
console.log(servers.length, "server cases,", helpers.length, "helper cases,", decisions.length, "decisions,", grantChecks.length, "grant checks");
