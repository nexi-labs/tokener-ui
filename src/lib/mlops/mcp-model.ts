/**
 * Custom MCP servers: the model, the rules that decide whether a server may be published, and the tools/list document a client
 * would receive. Pure data and functions, no React and no storage, so the same code runs in the console, in the generator and in
 * the Node checks. The rules mirror doc 29 (tool policy) and the server side enforces them again on publish.
 */
export type FieldType = "string" | "number" | "integer" | "boolean";

export type McpField = { name: string; type: FieldType; required: boolean; description: string; options?: string[] };

export type ToolSource =
  | { kind: "pipeline"; pipelineId: string; waitSeconds: number }
  | { kind: "http"; method: "GET" | "POST"; url: string; secretName?: string }
  | { kind: "sql"; connectionId: string; query: string }
  | { kind: "model"; alias: string; instruction: string };

export type McpTool = {
  id: string;
  name: string;
  description: string;
  fields: McpField[];
  source: ToolSource;
  effect: "reads" | "changes";
  /** A person must approve before the call runs. Always on for tools that change data. */
  approval: boolean;
};

export type McpAuth = "api-key" | "oauth" | "mtls" | "none";
export type McpEnv = "development" | "staging" | "production";

export type McpServerSpec = {
  id: string;
  name: string;
  slug: string;
  description: string;
  env: McpEnv;
  auth: McpAuth;
  tools: McpTool[];
  ratePerMinute: number;
  /** What the audit record keeps about each call. Arguments only when the organisation allows it. */
  audit: "metadata" | "arguments";
  redactResults: boolean;
  status: "draft" | "published";
  /** The last published version, 0 until the first publish. */
  version: number;
  createdAt: string;
  updatedAt: string;
  demo: boolean;
};

export type McpIssue = { level: "error" | "warn"; where: string; text: string };

export const TOOL_NAME = /^[a-z][a-z0-9_]{0,63}$/;
export const FIELD_NAME = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/;
export const SLUG = /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/;

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|.*\.internal$|.*\.local$)/i;
const WRITE_WORDS = /\b(insert|update|delete|drop|alter|truncate|grant|revoke|create|merge|call|copy|vacuum|set|do|into)\b/i;

/** Names a SQL query uses as :name, in order of first appearance. A '::' cast and a quoted string never count. */
export function sqlParams(query: string): string[] {
  const noStrings = query.replace(/'(?:[^']|'')*'/g, "''");
  const out: string[] = [];
  const re = /(^|[^:]):([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(noStrings))) if (!out.includes(m[2])) out.push(m[2]);
  return out;
}

/** True when the text is one SELECT (or WITH ... SELECT) statement and nothing else. */
export function isSingleSelect(query: string): boolean {
  const q = query.trim().replace(/;\s*$/, "");
  if (!q || q.includes(";")) return false;
  if (!/^(select|with)\b/i.test(q)) return false;
  return !WRITE_WORDS.test(q.replace(/'(?:[^']|'')*'/g, "''"));
}

export function placeholders(template: string): string[] {
  const out: string[] = [];
  for (const m of template.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

export function validateServer(s: McpServerSpec, others: { id: string; slug: string }[] = []): McpIssue[] {
  const out: McpIssue[] = [];
  const e = (where: string, text: string) => out.push({ level: "error", where, text });
  const w = (where: string, text: string) => out.push({ level: "warn", where, text });

  if (s.name.trim().length < 3) e("Server", "Give the server a name of at least three characters.");
  if (!SLUG.test(s.slug)) e("Server", "The address uses 3 to 40 lowercase letters, digits and hyphens, and starts with a letter.");
  if (others.some((o) => o.id !== s.id && o.slug === s.slug)) e("Server", `Another server already uses the address "${s.slug}".`);
  if (!s.description.trim()) w("Server", "Describe what the server is for. Clients show the description to people choosing which servers to connect.");
  if (s.auth === "none" && s.env !== "development") e("Access", "Only a development server may skip authentication.");
  if (s.ratePerMinute < 1 || s.ratePerMinute > 6000) e("Access", "The rate limit is between 1 and 6000 calls a minute.");
  if (s.audit === "arguments" && s.env === "production") w("Audit", "Keeping arguments in the audit record means they can contain personal data. Check the retention setting before publishing.");
  if (s.tools.length === 0) e("Tools", "Add at least one tool.");
  if (s.tools.length > 40) w("Tools", "A model chooses worse as the list grows. Consider splitting this into two servers.");

  const names = new Set<string>();
  for (const t of s.tools) {
    const at = t.name || "Unnamed tool";
    if (!TOOL_NAME.test(t.name)) e(at, "A tool name starts with a lowercase letter and uses lowercase letters, digits and underscores, up to 64 characters.");
    if (names.has(t.name)) e(at, "Two tools share this name.");
    names.add(t.name);
    if (!t.description.trim()) e(at, "A tool needs a description. The model reads it to decide when to call the tool.");
    else if (t.description.trim().length < 20) w(at, "A short description makes the tool easy to misuse. Say what it returns and when to use it.");
    if (t.effect === "changes" && !t.approval) e(at, "A tool that changes data must wait for approval.");
    if (t.effect === "changes" && t.source.kind !== "pipeline") e(at, "A tool that changes data runs a pipeline, so the change passes through an approval gate and is recorded.");
    if (t.effect === "changes" && s.auth === "none") e(at, "A tool that changes data needs authentication.");

    const fn = new Set<string>();
    for (const f of t.fields) {
      if (!FIELD_NAME.test(f.name)) e(at, `The field "${f.name}" has an invalid name.`);
      if (fn.has(f.name)) e(at, `Two fields share the name "${f.name}".`);
      fn.add(f.name);
      if (!f.description.trim()) w(at, `Describe the field "${f.name}" so the model fills it in correctly.`);
      if (f.options && f.options.length && f.type !== "string") e(at, `Only text fields can list allowed values ("${f.name}").`);
    }

    const src = t.source;
    if (src.kind === "http") {
      let u: URL | null = null;
      try { u = new URL(src.url.replace(/\{\{[^}]*\}\}/g, "x")); } catch { /* handled below */ }
      if (!u) e(at, "The address is not a valid URL.");
      else {
        if (u.protocol !== "https:") e(at, "Calls go over https only.");
        if (u.username || u.password) e(at, "Credentials do not belong in the address. Use a secret reference instead.");
        if (PRIVATE_HOST.test(u.hostname) && s.env !== "development") e(at, "A private or local address cannot be called from outside your network. Route it through a build agent or use a public address.");
        if (/token|key|secret|password/i.test(u.search)) w(at, "A credential in the query string ends up in logs. Send it in a header through a secret reference.");
      }
      if (/^https?:\/\/[^/]*\{\{/.test(src.url)) e(at, "Placeholders are allowed in the path and the query, not in the host.");
      for (const p of placeholders(src.url)) if (!fn.has(p)) e(at, `The address uses {{${p}}} but the tool has no field with that name.`);
      if (src.secretName && !/^[A-Z][A-Z0-9_]{1,63}$/.test(src.secretName)) e(at, "A secret name uses capital letters, digits and underscores.");
      if (src.method === "POST" && t.effect === "reads") w(at, "A POST that only reads is fine, but check that the target really does not change anything.");
    } else if (src.kind === "sql") {
      if (!src.connectionId) e(at, "Choose a data connection.");
      if (!isSingleSelect(src.query)) e(at, "A SQL tool runs one SELECT statement and nothing else. Writes, several statements and DDL are refused.");
      for (const p of sqlParams(src.query)) if (!fn.has(p)) e(at, `The query uses :${p} but the tool has no field with that name.`);
      if (!/\blimit\s+\d+/i.test(src.query)) w(at, "Add a LIMIT so one call cannot return the whole table.");
    } else if (src.kind === "pipeline") {
      if (!src.pipelineId) e(at, "Choose a pipeline.");
      if (src.waitSeconds < 1 || src.waitSeconds > 300) e(at, "Wait between 1 and 300 seconds for the pipeline to finish.");
    } else if (src.kind === "model") {
      if (!src.alias.trim()) e(at, "Name a model alias from the Model Registry.");
    }
  }
  return out;
}

export const errors = (issues: McpIssue[]) => issues.filter((i) => i.level === "error");

/** The JSON Schema a client receives for a tool's arguments. */
export function inputSchema(t: McpTool) {
  const properties: Record<string, Record<string, unknown>> = {};
  for (const f of t.fields) {
    const p: Record<string, unknown> = { type: f.type };
    if (f.description) p.description = f.description;
    if (f.options && f.options.length) p.enum = f.options;
    properties[f.name] = p;
  }
  return { type: "object", properties, required: t.fields.filter((f) => f.required).map((f) => f.name), additionalProperties: false };
}

/** The result of tools/list, as the server returns it. */
export function toolsList(s: McpServerSpec) {
  return {
    tools: s.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: inputSchema(t),
      annotations: { readOnlyHint: t.effect === "reads", destructiveHint: t.effect === "changes", idempotentHint: false, openWorldHint: t.source.kind === "http" },
    })),
  };
}

/** A fresh tool the builder starts from. */
export function blankTool(id: string, kind: ToolSource["kind"] = "http"): McpTool {
  const source: ToolSource =
    kind === "http" ? { kind, method: "GET", url: "https://api.example.com/items/{{item_id}}" } :
    kind === "sql" ? { kind, connectionId: "", query: "select * from items where id = :item_id limit 20" } :
    kind === "pipeline" ? { kind, pipelineId: "", waitSeconds: 60 } :
    { kind, alias: "chat-default", instruction: "Answer briefly and only from the input." };
  return {
    id, name: "new_tool", description: "", effect: "reads", approval: false, source,
    fields: kind === "model" || kind === "pipeline" ? [{ name: "input", type: "string", required: true, description: "" }] : [{ name: "item_id", type: "string", required: true, description: "" }],
  };
}

export function endpointFor(s: Pick<McpServerSpec, "slug" | "env">): string {
  const host = s.env === "production" ? "mcp.example.tokener.io" : `${s.env}.mcp.example.tokener.io`;
  return `https://${host}/${s.slug}/mcp`;
}

export const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
