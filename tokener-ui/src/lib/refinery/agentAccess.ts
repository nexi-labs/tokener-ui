/**
 * Governed agent access to a dataset. An AI agent never reads a dataset directly. It calls tools that the organisation's MCP endpoint offers, and
 * this policy decides what those tools can return: which columns are visible, which are replaced by stable tokens, which are hidden, how many rows
 * one call may return and which tools exist at all. The preview shows exactly what an agent would receive, computed by the same function the
 * endpoint will use, so the policy can be reviewed before an agent is allowed to connect.
 *
 * Scope today: the policy and the tool manifest. The endpoint that serves the tools and the access log are not built yet, so the policy is kept in
 * this browser and nothing enforces it on a server.
 */
import type { ColumnProfile, Dataset, Row } from "./types";
import { pushSetting } from "./settingsBus";

export type Exposure = "expose" | "mask" | "hide";
export type AgentTool = "describe" | "sample" | "aggregate";
export const TOOL_INFO: Record<AgentTool, { label: string; blurb: string }> = {
  describe: { label: "Describe", blurb: "Column names, types and statistics. No row values." },
  sample: { label: "Sample rows", blurb: "A bounded number of rows with the policy applied." },
  aggregate: { label: "Aggregate", blurb: "Count, sum, average, minimum or maximum, optionally grouped. Returns summaries, never rows." },
};
export type AgentAccessPolicy = {
  enabled: boolean;
  /** Why agents need this data. Recorded with every call once the endpoint exists. */
  purpose: string;
  columns: Record<string, Exposure>;
  /** The most rows one call can return. */
  maxRows: number;
  tools: AgentTool[];
  /** Agent or client names that may call the tools. */
  clients: string[];
};
export const MAX_ROWS_LIMIT = 1000;

/** A new policy exposes nothing: it is off, personal data is hidden and identifiers are tokenised. */
export function defaultPolicy(d: Dataset): AgentAccessPolicy {
  const columns: Record<string, Exposure> = {};
  for (const c of d.profile.columns) columns[c.name] = c.pii ? "hide" : c.role === "identifier" ? "mask" : "expose";
  return { enabled: false, purpose: "", columns, maxRows: 50, tools: ["describe", "sample"], clients: [] };
}
/** Fills in columns the policy does not mention, so a dataset that gained a column does not expose it by accident. */
export function normalise(p: AgentAccessPolicy, d: Dataset): AgentAccessPolicy {
  const base = defaultPolicy(d).columns; const columns: Record<string, Exposure> = {};
  for (const name of Object.keys(base)) columns[name] = p.columns[name] ?? base[name];
  return { ...p, columns };
}

/** A stable token: the same input always gives the same token, so an agent can group and join on it without reading the value. */
export function token(v: unknown): string {
  let h = 0x811c9dc5; const s = String(v);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `tok_${h.toString(16).padStart(8, "0")}`;
}

export type AgentView = { columns: { name: string; type: string; exposure: Exposure }[]; rows: Row[]; hidden: string[]; truncated: boolean };
export function applyPolicy(p: AgentAccessPolicy, d: Dataset, rows: Row[] = d.sample): AgentView {
  const cols = d.columns.filter((c) => (p.columns[c.name] ?? "hide") !== "hide").map((c) => ({ name: c.name, type: c.type as string, exposure: p.columns[c.name] ?? "hide" }));
  const hidden = d.columns.filter((c) => (p.columns[c.name] ?? "hide") === "hide").map((c) => c.name);
  const cap = Math.max(0, Math.min(MAX_ROWS_LIMIT, Math.floor(p.maxRows)));
  const out = rows.slice(0, cap).map((r) => { const o: Row = {}; for (const c of cols) { const v = r[c.name]; o[c.name] = v === null || v === undefined || v === "" ? v : c.exposure === "mask" ? token(v) : v; } return o; });
  return { columns: cols, rows: out, hidden, truncated: rows.length > cap };
}

export type Finding = { level: "bad" | "warn" | "ok"; text: string };
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+/;
const PHONE = /(\+\d{1,3}[\s.-]?)?(\(?\d{2,4}\)?[\s.-]?)\d{3,4}[\s.-]?\d{3,4}/;
/** Free text columns that are not flagged as personal data but carry email addresses or phone numbers inside the text. */
export function textWithPersonalData(p: AgentAccessPolicy, cols: ColumnProfile[], rows: Row[]): { column: string; rows: number }[] {
  const out: { column: string; rows: number }[] = [];
  for (const c of cols) {
    if (c.pii || c.type !== "string" || p.columns[c.name] !== "expose") continue;
    const n = rows.filter((r) => { const v = r[c.name]; return typeof v === "string" && v.length >= 10 && (EMAIL.test(v) || (/\d/.test(v) && /(\+\d|\(\d)/.test(v) && PHONE.test(v))); }).length;
    if (n > 0) out.push({ column: c.name, rows: n });
  }
  return out;
}
export function findings(p: AgentAccessPolicy, cols: ColumnProfile[], rows: Row[] = []): Finding[] {
  const f: Finding[] = [];
  const piiOpen = cols.filter((c) => c.pii && p.columns[c.name] === "expose").map((c) => c.name);
  const piiShut = cols.filter((c) => c.pii && p.columns[c.name] !== "expose").map((c) => c.name);
  if (piiOpen.length) f.push({ level: "bad", text: `Personal data is visible to agents in ${piiOpen.join(", ")}. Mask or hide it unless your organisation has approved this use.` });
  else if (piiShut.length) f.push({ level: "ok", text: `Personal data is ${piiShut.every((n) => p.columns[n] === "hide") ? "hidden" : "hidden or tokenised"} in ${piiShut.join(", ")}.` });
  for (const t of textWithPersonalData(p, cols, rows)) f.push({ level: "bad", text: `${t.column} is not marked as personal data, but ${t.rows} of ${rows.length} sampled rows contain an email address or phone number inside the text. Tokenise or hide it, or mask it in a pipeline first.` });
  if (p.enabled && !p.purpose.trim()) f.push({ level: "warn", text: "No purpose is recorded. State why agents need this dataset." });
  if (p.enabled && p.clients.length === 0) f.push({ level: "warn", text: "No client is allowed, so no agent can connect yet." });
  if (p.enabled && p.tools.length === 0) f.push({ level: "warn", text: "No tool is switched on, so agents cannot do anything with this dataset." });
  if (p.maxRows > 500) f.push({ level: "warn", text: `One call can return ${p.maxRows} rows. Large reads are hard to review. Keep the cap as low as the use allows.` });
  const idOpen = cols.filter((c) => c.role === "identifier" && p.columns[c.name] === "expose").map((c) => c.name);
  if (idOpen.length) f.push({ level: "warn", text: `Identifiers are visible in ${idOpen.join(", ")}. Tokenise them so agents can group by them without reading them.` });
  return f;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
export type McpTool = { name: string; description: string; inputSchema: Record<string, unknown>; annotations: { readOnlyHint: true; openWorldHint: false } };

/** The Model Context Protocol tool definitions the endpoint will offer for this dataset under the policy. Only visible columns appear in them. */
export function toolManifest(d: Dataset, p: AgentAccessPolicy): { server: string; resource: string; tools: McpTool[] } {
  const base = `refinery_${slug(d.name)}`; const visible = d.columns.filter((c) => (p.columns[c.name] ?? "hide") !== "hide");
  const numeric = visible.filter((c) => (p.columns[c.name] === "expose") && (c.type === "integer" || c.type === "decimal")).map((c) => c.name);
  const groupable = visible.map((c) => c.name);
  const ro = { readOnlyHint: true as const, openWorldHint: false as const }; const tools: McpTool[] = [];
  if (p.tools.includes("describe")) tools.push({ name: `${base}_describe`, description: `Describe the columns of ${d.name}: names, types and summary statistics. Returns no row values.`, inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: ro });
  if (p.tools.includes("sample")) tools.push({ name: `${base}_sample`, description: `Return up to ${p.maxRows} rows of ${d.name}. ${Object.values(p.columns).includes("mask") ? "Some columns are replaced by stable tokens. " : ""}Hidden columns are never returned.`, inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: Math.max(1, p.maxRows), default: Math.min(10, Math.max(1, p.maxRows)) }, columns: { type: "array", items: { type: "string", enum: visible.map((c) => c.name) }, description: "Columns to return. All visible columns when omitted." } }, additionalProperties: false }, annotations: ro });
  if (p.tools.includes("aggregate")) tools.push({ name: `${base}_aggregate`, description: `Summarise ${d.name} with count, sum, average, minimum or maximum, optionally grouped. Returns summaries only.`, inputSchema: { type: "object", properties: { metric: { type: "string", enum: numeric.length ? ["count", "sum", "avg", "min", "max"] : ["count"] }, column: { type: "string", enum: numeric, description: "Numeric column for sum, average, minimum and maximum." }, groupBy: { type: "string", enum: groupable } }, required: ["metric"], additionalProperties: false }, annotations: ro });
  return { server: "tokener-refinery", resource: `tokener://refinery/datasets/${d.id}`, tools };
}

// ---------------------------------------------------------------------------------------------------------------------- storage (this browser)
export const agentAccessKey = (id: string) => `tok.refinery.agent-access.${id}`;
const key = agentAccessKey;
export function loadPolicy(d: Dataset): AgentAccessPolicy {
  try { const raw = localStorage.getItem(key(d.id)); if (raw) return normalise(JSON.parse(raw) as AgentAccessPolicy, d); } catch { /* unavailable or damaged: start from the safe default */ }
  return defaultPolicy(d);
}
export function savePolicy(d: Dataset, p: AgentAccessPolicy): void { try { localStorage.setItem(key(d.id), JSON.stringify(p)); } catch { /* storage unavailable */ } pushSetting("datasets", d.id, "agent-access", p); }
