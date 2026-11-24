/**
 * Unified datasets: pick tables from several connections, choose columns, relate the tables by keys, clean and rename the columns once.
 * Here the join runs on the bounded samples held in the browser. In a connected workspace the same specification runs on a runner next to the data,
 * so the control plane never reads the tables themselves.
 */
import type { Cell, ColType, Connection, Dataset, ModelCleaning, ModelColumn, ModelJoin, ModelSpec, Row } from "@/lib/refinery/types";

export const OUTPUT_NAME = /^[a-z][a-z0-9_]{0,62}$/;
/** Rows kept from a sample join. The runner has no such cap. */
export const MODEL_ROW_CAP = 20000;

export const CLEANINGS: { id: ModelCleaning; label: string; hint: string }[] = [
  { id: "none", label: "Keep as is", hint: "No change." },
  { id: "trim", label: "Trim spaces", hint: "Remove leading and trailing spaces and collapse repeated spaces." },
  { id: "lower", label: "Lower case", hint: "Trim, then lower case. Good for emails and codes." },
  { id: "upper", label: "Upper case", hint: "Trim, then upper case." },
  { id: "mask", label: "Mask", hint: "Keep the first character and hide the rest. Emails keep their domain." },
];
export const JOIN_TYPES: { id: ModelJoin["type"]; label: string; hint: string }[] = [
  { id: "inner", label: "Only rows that match", hint: "Keep a row only when both tables have it." },
  { id: "left", label: "All rows of the first table", hint: "Keep every row of the table already in the result, add matches when there are any." },
  { id: "full", label: "All rows of both", hint: "Keep every row of both tables, matched or not." },
];

export const emptyModel = (): ModelSpec => ({ sources: [], joins: [], columns: [], dropDuplicates: false });

const GENERIC = new Set(["id", "name", "status", "type", "created_at", "updated_at", "country", "currency", "language", "text", "date", "notes", "priority", "channel"]);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function aliasFor(name: string, taken: string[]): string {
  const base = (name.split(/[^a-z0-9]+/i).filter(Boolean).map((w) => w[0]).join("").toLowerCase() || "t").slice(0, 3);
  let a = base, i = 2;
  while (taken.includes(a)) a = `${base}${i++}`;
  return a;
}
const colId = (alias: string, column: string) => `${alias}.${column}`;
const key = (v: Cell, normalise: boolean): string | null => {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v);
  return normalise ? s.trim().toLowerCase().replace(/\s+/g, " ") || null : s;
};

export function addSource(spec: ModelSpec, ds: Dataset): ModelSpec {
  if (spec.sources.some((s) => s.datasetId === ds.id)) return spec;
  const alias = aliasFor(ds.name, spec.sources.map((s) => s.alias));
  return { ...spec, sources: [...spec.sources, { alias, datasetId: ds.id }] };
}
export function removeSource(spec: ModelSpec, alias: string): ModelSpec {
  const sources = spec.sources.filter((s) => s.alias !== alias);
  return { ...spec, sources, joins: spec.joins.filter((j) => j.leftAlias !== alias && j.rightAlias !== alias), columns: spec.columns.filter((c) => c.alias !== alias) };
}
/** A name that is not used by another output column. */
export function uniqueName(spec: ModelSpec, base: string, exceptId?: string): string {
  const taken = new Set(spec.columns.filter((c) => c.id !== exceptId).map((c) => c.as));
  let n = base, i = 2;
  while (taken.has(n)) n = `${base}_${i++}`;
  return n;
}
const safeName = (s: string) => s.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "c_$1") || "column";
export function toggleColumn(spec: ModelSpec, alias: string, ds: Dataset, column: string): ModelSpec {
  const id = colId(alias, column);
  if (spec.columns.some((c) => c.id === id)) return { ...spec, columns: spec.columns.filter((c) => c.id !== id) };
  const t = ds.columns.find((c) => c.name === column);
  if (!t) return spec;
  const col: ModelColumn = { id, alias, column, as: uniqueName(spec, safeName(column)), type: t.type, clean: "none" };
  return { ...spec, columns: [...spec.columns, col] };
}
export function setAllColumns(spec: ModelSpec, alias: string, ds: Dataset, on: boolean): ModelSpec {
  let s: ModelSpec = { ...spec, columns: spec.columns.filter((c) => c.alias !== alias || on) };
  if (on) for (const c of ds.columns) if (!s.columns.some((x) => x.id === colId(alias, c.name))) s = toggleColumn(s, alias, ds, c.name);
  return s;
}
export function updateColumn(spec: ModelSpec, id: string, patch: Partial<ModelColumn>): ModelSpec {
  return { ...spec, columns: spec.columns.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
}
export function moveColumn(spec: ModelSpec, id: string, dir: -1 | 1): ModelSpec {
  const i = spec.columns.findIndex((c) => c.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= spec.columns.length) return spec;
  const cols = spec.columns.slice(); [cols[i], cols[j]] = [cols[j], cols[i]];
  return { ...spec, columns: cols };
}
let jn = 0;
export function newJoin(leftAlias: string, leftColumn: string, rightAlias: string, rightColumn: string, type: ModelJoin["type"] = "left", normalise = true): ModelJoin {
  return { id: `j${Date.now().toString(36)}${jn++}`, leftAlias, leftColumn, rightAlias, rightColumn, type, normalise };
}

export type JoinSuggestion = { leftAlias: string; leftColumn: string; rightAlias: string; rightColumn: string; reason: string; score: number };
/** Pairs of columns that probably relate two tables: the same name, or one name inside the other (customer_email and email). */
export function suggestJoins(spec: ModelSpec, datasets: Dataset[]): JoinSuggestion[] {
  const out: JoinSuggestion[] = [];
  const ds = (a: string) => datasets.find((d) => d.id === spec.sources.find((s) => s.alias === a)?.datasetId);
  for (let i = 0; i < spec.sources.length; i++) for (let j = i + 1; j < spec.sources.length; j++) {
    const a = ds(spec.sources[i].alias), b = ds(spec.sources[j].alias); if (!a || !b) continue;
    for (const ca of a.columns) for (const cb of b.columns) {
      if (ca.type !== cb.type && !(["integer", "string"].includes(ca.type) && ["integer", "string"].includes(cb.type))) continue;
      const na = norm(ca.name), nb = norm(cb.name);
      if (na === nb && GENERIC.has(ca.name)) continue;
      let score = 0, reason = "";
      if (na === nb) { score = 3; reason = "Same column name"; }
      else if (na.length >= 4 && nb.length >= 4 && (na.endsWith(nb) || nb.endsWith(na))) { score = 2; reason = "Similar column names"; }
      if (!score) continue;
      if (/email|customer|account|user|sku|order|ticket|doc/.test(na + nb)) score += 0.5;
      out.push({ leftAlias: spec.sources[i].alias, leftColumn: ca.name, rightAlias: spec.sources[j].alias, rightColumn: cb.name, reason, score });
    }
  }
  return out.sort((x, y) => y.score - x.score).slice(0, 8);
}

export type ModelCheck = { errors: string[]; warnings: string[] };
export function validateModel(spec: ModelSpec, datasets: Dataset[], name?: string): ModelCheck {
  const errors: string[] = [], warnings: string[] = [];
  if (spec.sources.length === 0) { errors.push("Choose at least one table."); return { errors, warnings }; }
  if (spec.columns.length === 0) errors.push("Choose at least one column for the result.");
  const seen = new Set<string>();
  for (const c of spec.columns) {
    if (!OUTPUT_NAME.test(c.as)) errors.push(`Column name "${c.as}" must start with a letter and use lower case letters, digits and underscores.`);
    if (seen.has(c.as)) errors.push(`Two columns are called "${c.as}". Rename one.`);
    seen.add(c.as);
  }
  if (name !== undefined && !OUTPUT_NAME.test(name)) errors.push("The dataset name must start with a letter and use lower case letters, digits and underscores.");
  const connected = new Set([spec.sources[0].alias]);
  for (const s of spec.sources.slice(1)) {
    const js = spec.joins.filter((j) => j.rightAlias === s.alias && connected.has(j.leftAlias) && j.leftColumn && j.rightColumn);
    const d = datasets.find((x) => x.id === s.datasetId);
    if (js.length === 0) errors.push(`${d?.name ?? s.alias} is not related to the tables before it. Say which columns match, or remove the table.`);
    else connected.add(s.alias);
    for (const j of js) {
      const l = datasets.find((x) => x.id === spec.sources.find((q) => q.alias === j.leftAlias)?.datasetId)?.columns.find((c) => c.name === j.leftColumn);
      const r = d?.columns.find((c) => c.name === j.rightColumn);
      if (l && r && l.type !== r.type) warnings.push(`${j.leftAlias}.${j.leftColumn} is ${l.type} and ${s.alias}.${j.rightColumn} is ${r.type}. Values are compared as text.`);
      if (!j.normalise && l?.type === "string") warnings.push(`Keys ${j.leftAlias}.${j.leftColumn} and ${s.alias}.${j.rightColumn} are compared exactly. Stray spaces or capital letters will stop rows from matching.`);
    }
  }
  if (spec.columns.length > 0) for (const s of spec.sources.filter((x) => !spec.columns.some((c) => c.alias === x.alias))) warnings.push(`No column of ${datasets.find((d) => d.id === s.datasetId)?.name ?? s.alias} is in the result. It only filters the other rows.`);
  return { errors, warnings };
}

export type JoinStat = { joinId: string; rightAlias: string; type: ModelJoin["type"]; leftRows: number; rightRows: number; matchedLeft: number; unmatchedRight: number; nullKeysLeft: number; rightKeyUnique: boolean; perMatch: number; outRows: number };
export type ModelResult = { columns: { name: string; type: ColType }[]; rows: Row[]; stats: JoinStat[]; sampleRows: number; estRows: number; capped: boolean };

export function applyCleaning(v: Cell, clean: ModelCleaning): Cell {
  if (typeof v !== "string" || clean === "none") return v;
  const t = v.trim().replace(/\s+/g, " ");
  if (clean === "trim") return t;
  if (clean === "lower") return t.toLowerCase();
  if (clean === "upper") return t.toUpperCase();
  if (!t) return t;
  const at = t.indexOf("@");
  return at > 0 ? `${t[0]}•••${t.slice(at)}` : `${t[0]}•••`;
}
export function castValue(v: Cell, to: ColType): Cell {
  if (v === null || v === undefined || v === "") return null;
  switch (to) {
    case "string": return String(v);
    case "integer": { const n = Number(typeof v === "boolean" ? (v ? 1 : 0) : v); return Number.isFinite(n) ? Math.trunc(n) : null; }
    case "decimal": { const n = Number(typeof v === "boolean" ? (v ? 1 : 0) : v); return Number.isFinite(n) ? n : null; }
    case "boolean": { if (typeof v === "boolean") return v; const s = String(v).trim().toLowerCase(); return ["true", "yes", "1", "y"].includes(s) ? true : ["false", "no", "0", "n"].includes(s) ? false : null; }
    case "date": { const s = String(v); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null; }
    case "timestamp": { const s = String(v); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s : null; }
  }
}

type Wide = Record<string, Cell>;
const prefixed = (alias: string, r: Row): Wide => { const o: Wide = {}; for (const k of Object.keys(r)) o[colId(alias, k)] = r[k]; return o; };

export function runModel(spec: ModelSpec, datasets: Dataset[]): ModelResult {
  const stats: JoinStat[] = [];
  const empty: ModelResult = { columns: spec.columns.map((c) => ({ name: c.as, type: c.type })), rows: [], stats, sampleRows: 0, estRows: 0, capped: false };
  const base = spec.sources[0]; const baseDs = base && datasets.find((d) => d.id === base.datasetId);
  if (!base || !baseDs) return empty;
  let wide: Wide[] = baseDs.sample.map((r) => prefixed(base.alias, r));
  const joined = [base.alias]; let capped = false;
  for (const s of spec.sources.slice(1)) {
    const ds = datasets.find((d) => d.id === s.datasetId); if (!ds) continue;
    const js = spec.joins.filter((j) => j.rightAlias === s.alias && joined.includes(j.leftAlias) && j.leftColumn && j.rightColumn); if (js.length === 0) continue;
    const first = js[0];
    const rkey = (r: Row) => { const parts = js.map((j) => key(r[j.rightColumn], j.normalise)); return parts.some((p) => p === null) ? null : parts.join("\u0001"); };
    const lkey = (w: Wide) => { const parts = js.map((j) => key(w[colId(j.leftAlias, j.leftColumn)], j.normalise)); return parts.some((p) => p === null) ? null : parts.join("\u0001"); };
    const index = new Map<string, number[]>();
    ds.sample.forEach((r, i) => { const k = rkey(r); if (k === null) return; const a = index.get(k); if (a) a.push(i); else index.set(k, [i]); });
    const out: Wide[] = []; const usedRight = new Set<number>(); let matchedLeft = 0, nullLeft = 0, pairs = 0;
    for (const w of wide) {
      const k = lkey(w); if (k === null) nullLeft++;
      const hit = k === null ? undefined : index.get(k);
      if (hit && hit.length) { matchedLeft++; for (const i of hit) { usedRight.add(i); pairs++; if (out.length < MODEL_ROW_CAP) out.push({ ...w, ...prefixed(s.alias, ds.sample[i]) }); else capped = true; } }
      else if (first.type !== "inner") out.push({ ...w });
    }
    if (first.type === "full") ds.sample.forEach((r, i) => { if (!usedRight.has(i) && out.length < MODEL_ROW_CAP) out.push(prefixed(s.alias, r)); });
    stats.push({
      joinId: first.id, rightAlias: s.alias, type: first.type, leftRows: wide.length, rightRows: ds.sample.length, matchedLeft,
      unmatchedRight: ds.sample.length - usedRight.size, nullKeysLeft: nullLeft,
      rightKeyUnique: [...index.values()].every((a) => a.length === 1), perMatch: matchedLeft ? Math.round((pairs / matchedLeft) * 100) / 100 : 0, outRows: out.length,
    });
    wide = out; joined.push(s.alias);
  }
  const cols = spec.columns.filter((c) => joined.includes(c.alias));
  let rows: Row[] = wide.map((w) => { const o: Row = {}; for (const c of cols) o[c.as] = castValue(applyCleaning(w[c.id] ?? null, c.clean), c.type); return o; });
  if (spec.dropDuplicates) { const seen = new Set<string>(); rows = rows.filter((r) => { const k = JSON.stringify(cols.map((c) => r[c.as])); if (seen.has(k)) return false; seen.add(k); return true; }); }
  const scale = baseDs.sample.length ? baseDs.totalRows / baseDs.sample.length : 1;
  return { columns: cols.map((c) => ({ name: c.as, type: c.type })), rows, stats, sampleRows: rows.length, estRows: Math.round(rows.length * scale), capped };
}

const q = (id: string) => (/^[a-z_][a-z0-9_]*$/.test(id) ? id : `"${id}"`);
export function modelSql(spec: ModelSpec, datasets: Dataset[], connName: (d: Dataset) => string = () => ""): string {
  const ds = (a: string) => datasets.find((d) => d.id === spec.sources.find((s) => s.alias === a)?.datasetId);
  if (spec.sources.length === 0) return "";
  const expr = (c: ModelColumn) => {
    const ref = `${c.alias}.${q(c.column)}`;
    const e = c.clean === "none" ? ref : c.clean === "trim" ? `TRIM(${ref})` : c.clean === "lower" ? `LOWER(TRIM(${ref}))` : c.clean === "upper" ? `UPPER(TRIM(${ref}))` : `mask(${ref})`;
    const srcType = ds(c.alias)?.columns.find((x) => x.name === c.column)?.type;
    return srcType && srcType !== c.type ? `CAST(${e} AS ${c.type.toUpperCase()})` : e;
  };
  const lines: string[] = ["-- Tables"];
  for (const s of spec.sources) { const d = ds(s.alias); lines.push(`--   ${s.alias}: ${d?.name ?? s.datasetId}${d ? ` (${connName(d) || "uploaded"})` : ""}`); }
  lines.push(`SELECT${spec.dropDuplicates ? " DISTINCT" : ""}`);
  lines.push(spec.columns.length ? spec.columns.map((c, i) => `  ${expr(c)} AS ${c.as}${i < spec.columns.length - 1 ? "," : ""}`).join("\n") : "  *");
  const b = spec.sources[0]; lines.push(`FROM ${ds(b.alias)?.name ?? b.datasetId} AS ${b.alias}`);
  for (const s of spec.sources.slice(1)) {
    const js = spec.joins.filter((j) => j.rightAlias === s.alias && j.leftColumn && j.rightColumn); if (js.length === 0) continue;
    const kw = js[0].type === "inner" ? "JOIN" : js[0].type === "left" ? "LEFT JOIN" : "FULL JOIN";
    const side = (a: string, c: string, n: boolean) => (n ? `LOWER(TRIM(${a}.${q(c)}))` : `${a}.${q(c)}`);
    lines.push(`${kw} ${ds(s.alias)?.name ?? s.datasetId} AS ${s.alias}`);
    lines.push(`  ON ${js.map((j) => `${side(j.leftAlias, j.leftColumn, j.normalise)} = ${side(j.rightAlias, j.rightColumn, j.normalise)}`).join("\n  AND ")}`);
  }
  return lines.join("\n") + ";";
}

/** The connection a dataset reads from, when it reads from one. */
export function connOf(d: Dataset | undefined, connections: Connection[]): Connection | undefined {
  if (!d) return undefined;
  const src = d.source;
  return src.kind === "connection" || src.kind === "query" ? connections.find((c) => c.id === src.connectionId) : undefined;
}
export const connNameOf = (connections: Connection[]) => (d: Dataset) => connOf(d, connections)?.name ?? "";
