/**
 * The semantic layer for a dataset. Column names such as `dp_kpa` say little to someone who did not build the pipeline. This module holds what each
 * column means: its kind (asset, timestamp, measurement, setpoint, state, alarm, identifier, attribute), a label, a unit, an optional OPC UA node id
 * and an optional standard identifier from ECLASS or the IEC Common Data Dictionary. It proposes values from names and data, checks them, and writes
 * them out as a semantic model, a data dictionary and an Asset Administration Shell (metamodel version 3) JSON file.
 *
 * Scope today: the mapping, the checks and the exports, kept in this browser. The AAS file uses local identifiers unless you give a standard one, and
 * it is a starting point for an asset's digital twin, not one of the IDTA submodel templates.
 */
import type { ColType, Dataset, Row } from "./types";
import { analyseSensors, unitOf } from "./sensor";
import { pushSetting } from "./settingsBus";

export type SemanticKind = "asset" | "timestamp" | "measurement" | "setpoint" | "state" | "alarm" | "identifier" | "attribute" | "ignore";
export const KINDS: { id: SemanticKind; label: string; hint: string }[] = [
  { id: "asset", label: "Asset", hint: "The machine, line or device each row belongs to." },
  { id: "timestamp", label: "Timestamp", hint: "When the value was measured." },
  { id: "measurement", label: "Measurement", hint: "A value read from the process, such as a temperature." },
  { id: "setpoint", label: "Setpoint", hint: "A value the process is told to hold." },
  { id: "state", label: "State", hint: "An on or off, running or stopped, or a mode." },
  { id: "alarm", label: "Alarm", hint: "A fault or warning flag." },
  { id: "identifier", label: "Identifier", hint: "A key for the row, not a property of the asset." },
  { id: "attribute", label: "Attribute", hint: "A fixed property such as a model name or a site." },
  { id: "ignore", label: "Ignore", hint: "Left out of the exports." },
];
export type ColumnSemantic = { column: string; kind: SemanticKind; label: string; unit: string; description: string; opcua: string; standardId: string };
export type SemanticModel = { columns: ColumnSemantic[] };

/** Units written in the form UCUM and most plants use. A unit outside this list is kept as written and flagged for review. */
export const KNOWN_UNITS = ["degC", "degF", "K", "kPa", "Pa", "MPa", "bar", "psi", "%", "mm/s", "m/s", "rpm", "Hz", "A", "V", "W", "kW", "MW", "kWh", "var", "m3/h", "l/min", "l/s", "kg", "g", "t", "N", "Nm", "m", "mm", "s", "min", "h", "ppm", "pH", "1"];

const SUFFIX = /(^|_)(degc|degf|celsius|fahrenheit|kpa|psi|bar|pct|percent|rpm|mm_s|kw|amps?|hz|c|f)$/i;
export function humanise(name: string): string {
  const base = name.replace(SUFFIX, "").replace(/[_\-.]+/g, " ").trim() || name;
  const t = base.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1);
}
const GENERIC = new Set(["pressure", ""]);

/** A first proposal from names and data. Everything in it can be edited. */
export function inferSemantics(d: Dataset): SemanticModel {
  const rep = analyseSensors(d.columns, d.sample);
  const columns: ColumnSemantic[] = d.columns.map((c) => {
    const distinct = new Set(d.sample.map((r) => String(r[c.name] ?? ""))).size;
    let kind: SemanticKind = "attribute"; let unit = "";
    if (rep && c.name === rep.timeColumn) kind = "timestamp";
    else if (rep && c.name === rep.entityColumn) kind = "asset";
    else if (c.role === "identifier") kind = "identifier";
    else if (c.type === "boolean") kind = /alarm|fault|error|trip/i.test(c.name) ? "alarm" : "state";
    else if (c.type === "date" || c.type === "timestamp") kind = "timestamp";
    else if ((c.type === "integer" || c.type === "decimal") && c.role !== "label") {
      kind = /(^|_)(sp|setpoint|target)($|_)/i.test(c.name) ? "setpoint" : /alarm|fault|trip/i.test(c.name) ? "alarm" : "measurement";
      const u = unitOf(c.name); if (u && !GENERIC.has(u.label)) unit = u.label;
    } else if (c.type === "string" && distinct > 20) kind = "ignore";
    return { column: c.name, kind, label: humanise(c.name), unit, description: "", opcua: "", standardId: "" };
  });
  return { columns };
}
export function normaliseModel(m: SemanticModel, d: Dataset): SemanticModel {
  const have = new Map(m.columns.map((c) => [c.column, c])); const base = new Map(inferSemantics(d).columns.map((c) => [c.column, c]));
  return { columns: d.columns.map((c) => have.get(c.name) ?? base.get(c.name)!) };
}

const OPCUA = /^ns=\d+;(s=.+|i=\d+|g=[0-9a-fA-F-]{36}|b=[A-Za-z0-9+/=]+)$/;
const ECLASS = /^\d{4}-\d#\d{2}-[A-Z]{3}\d{3}#\d{3}$/; const IEC_CDD = /^0112\/2\/\/\/\d+[#-][A-Z]{3}\d+$/;
const NUMERIC_KINDS: SemanticKind[] = ["measurement", "setpoint"];

export type SemanticFinding = { level: "warn" | "info" | "ok"; text: string; column?: string };
export function validate(m: SemanticModel, d: Dataset): SemanticFinding[] {
  const f: SemanticFinding[] = []; const used = m.columns.filter((c) => c.kind !== "ignore");
  const num = (name: string) => { const t = d.columns.find((c) => c.name === name)?.type as ColType | undefined; return t === "integer" || t === "decimal"; };
  const noUnit = used.filter((c) => NUMERIC_KINDS.includes(c.kind) && !c.unit.trim());
  if (noUnit.length) f.push({ level: "warn", text: `${noUnit.length} measurement${noUnit.length === 1 ? " has" : "s have"} no unit: ${noUnit.slice(0, 6).map((c) => c.column).join(", ")}${noUnit.length > 6 ? " and more" : ""}. A value without a unit cannot be compared or converted.` });
  const odd = used.filter((c) => c.unit.trim() && !KNOWN_UNITS.includes(c.unit.trim()));
  if (odd.length) f.push({ level: "info", text: `Units not in the common list, kept as written: ${odd.map((c) => `${c.column} (${c.unit})`).join(", ")}.` });
  const badKind = used.filter((c) => NUMERIC_KINDS.includes(c.kind) && !num(c.column));
  if (badKind.length) f.push({ level: "warn", text: `Marked as a measurement or setpoint but not numeric: ${badKind.map((c) => c.column).join(", ")}.` });
  for (const c of used.filter((x) => NUMERIC_KINDS.includes(x.kind))) {
    const bad = d.sample.filter((r) => { const v = r[c.column]; return v !== null && v !== undefined && v !== "" && !Number.isFinite(Number(v)); }).length;
    if (bad) f.push({ level: "warn", column: c.column, text: `${c.column} has text in ${bad} of ${d.sample.length} sampled rows that is not a number. The export leaves such values out. A Change type step in the pipeline fixes them at the source.` });
  }
  const has = (k: SemanticKind) => used.some((c) => c.kind === k);
  if (used.some((c) => NUMERIC_KINDS.includes(c.kind)) && !has("timestamp")) f.push({ level: "warn", text: "There are measurements but no timestamp column, so a value cannot be placed in time." });
  if (used.some((c) => NUMERIC_KINDS.includes(c.kind)) && !has("asset")) f.push({ level: "info", text: "No asset column. The exports describe the whole dataset as one asset." });
  if (m.columns.filter((c) => c.kind === "asset").length > 1) f.push({ level: "warn", text: "More than one column is marked as the asset. The exports use the first." });
  const dup = used.map((c) => c.label.trim().toLowerCase()).filter((l, i, a) => l && a.indexOf(l) !== i);
  if (dup.length) f.push({ level: "warn", text: `Two columns share the label ${[...new Set(dup)].map((x) => `"${x}"`).join(", ")}.` });
  m.columns.filter((c) => c.opcua.trim() && !OPCUA.test(c.opcua.trim())).forEach((c) => f.push({ level: "warn", column: c.column, text: `The OPC UA node id for ${c.column} is not in the form ns=2;s=Name, ns=2;i=1234, ns=2;g=GUID or ns=2;b=Base64.` }));
  m.columns.filter((c) => c.standardId.trim() && !ECLASS.test(c.standardId.trim()) && !IEC_CDD.test(c.standardId.trim())).forEach((c) => f.push({ level: "warn", column: c.column, text: `The standard identifier for ${c.column} does not look like an ECLASS IRDI (0173-1#02-AAA123#001) or an IEC CDD identifier (0112/2///62720#UAA001).` }));
  if (!f.some((x) => x.level === "warn")) f.push({ level: "ok", text: "No problems found in the mapping." });
  return f;
}
export function coverage(m: SemanticModel) {
  const used = m.columns.filter((c) => c.kind !== "ignore"); const meas = used.filter((c) => NUMERIC_KINDS.includes(c.kind));
  return { columns: used.length, described: used.filter((c) => c.description.trim()).length, withUnit: meas.filter((c) => c.unit.trim()).length, measurements: meas.length, linked: used.filter((c) => c.opcua.trim() || c.standardId.trim()).length };
}

// ---------------------------------------------------------------------------------------------------------------------- exports
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "dataset";
export function toSemanticJson(d: Dataset, m: SemanticModel, now = new Date()) {
  return { schema: "tokener.semantic-model/1", dataset: { id: d.id, name: d.name, version: d.version }, generatedAt: now.toISOString(), columns: m.columns.filter((c) => c.kind !== "ignore").map((c) => ({ ...c, type: d.columns.find((x) => x.name === c.column)?.type })) };
}
const q = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
export function toCsv(d: Dataset, m: SemanticModel): string {
  const head = ["column", "type", "kind", "label", "unit", "description", "opcua_node", "standard_id"];
  return [head.join(","), ...m.columns.filter((c) => c.kind !== "ignore").map((c) => [c.column, d.columns.find((x) => x.name === c.column)?.type ?? "", c.kind, c.label, c.unit, c.description, c.opcua, c.standardId].map(q).join(","))].join("\n") + "\n";
}

const idShort = (s: string, fallback: string) => {
  let t = s.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+/, "").replace(/-+$/, "_"); if (!/^[A-Za-z]/.test(t)) t = `${fallback}_${t}`; if (t.length < 2) t += "_x"; return t.slice(0, 64);
};
const pascal = (s: string) => s.split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
const lang = (text: string) => [{ language: "en", text: text || "-" }];
const ref = (type: string, keyType: string, value: string) => ({ type, keys: [{ type: keyType, value }] });

/** An Asset Administration Shell file (metamodel version 3, JSON): one shell per asset with an operational data submodel holding the latest sampled values. */
export function toAas(d: Dataset, m: SemanticModel, rows: Row[] = d.sample) {
  const used = m.columns.filter((c) => c.kind !== "ignore"); const assetCol = used.find((c) => c.kind === "asset"); const timeCol = used.find((c) => c.kind === "timestamp");
  const values = used.filter((c) => c.kind === "measurement" || c.kind === "setpoint" || c.kind === "state" || c.kind === "alarm");
  const attrs = used.filter((c) => c.kind === "attribute");
  const typeOf = (c: ColumnSemantic) => d.columns.find((x) => x.name === c.column)?.type;
  const base = `urn:tokener:${slug(d.name)}`; const cdId = (c: ColumnSemantic) => c.standardId.trim() || `${base}:concept:${slug(c.column)}`;
  const groups = new Map<string, Row[]>();
  if (assetCol) rows.forEach((r) => { const k = String(r[assetCol.column] ?? ""); if (k) groups.set(k, [...(groups.get(k) ?? []), r]); }); else groups.set(d.name, rows);
  const assets = [...groups.entries()].slice(0, 100);
  const ordered = (rs: Row[]) => (timeCol ? [...rs].sort((a, b) => String(a[timeCol.column] ?? "").localeCompare(String(b[timeCol.column] ?? ""))) : rs);
  const isNum = (v: unknown) => v !== null && v !== undefined && v !== "" && typeof v !== "boolean" && Number.isFinite(Number(v));
  /** The newest value in the rows that is valid for the column's type, so a stray "N/A" does not end up in a numeric property. */
  const newest = (rs: Row[], c: ColumnSemantic, kind: "num" | "bool" | "str"): unknown => {
    const o = ordered(rs);
    for (let i = o.length - 1; i >= 0; i--) { const v = o[i][c.column]; if (kind === "num" ? isNum(v) : v !== null && v !== undefined && v !== "") return v; }
    return undefined;
  };
  const prop = (c: ColumnSemantic, rs: Row[], kind: "num" | "bool" | "str") => {
    const raw = newest(rs, c, kind); const valueType = kind === "num" ? "xs:double" : kind === "bool" ? "xs:boolean" : "xs:string";
    const p: Record<string, unknown> = { modelType: "Property", idShort: idShort(pascal(c.label) || pascal(c.column), "P"), description: lang(c.description || c.label), valueType, semanticId: ref("ExternalReference", "GlobalReference", cdId(c)) };
    if (raw !== undefined && raw !== null && raw !== "") p.value = kind === "bool" ? String(raw === true || raw === "true" || raw === 1) : String(raw);
    if (c.opcua.trim()) p.supplementalSemanticIds = [ref("ExternalReference", "GlobalReference", `opcua:${c.opcua.trim()}`)];
    return p;
  };
  const used2 = new Set<string>(); const unique = (p: Record<string, unknown>) => { let s = p.idShort as string; let n = 2; while (used2.has(s)) s = `${p.idShort}_${n++}`; used2.add(s); p.idShort = s; return p; };
  const shells: unknown[] = []; const submodels: unknown[] = [];
  assets.forEach(([name, rs], i) => {
    used2.clear(); const smId = `${base}:asset:${slug(name)}:operational-data`;
    const elements = values.map((c) => unique(prop(c, rs, typeOf(c) === "boolean" ? "bool" : typeOf(c) === "integer" || typeOf(c) === "decimal" ? "num" : "str")));
    submodels.push({ modelType: "Submodel", id: smId, idShort: "OperationalData", kind: "Instance", description: lang(`Latest sampled values for ${name} from dataset ${d.name} version ${d.version}.`), submodelElements: elements });
    const refs = [ref("ModelReference", "Submodel", smId)];
    if (attrs.length) {
      used2.clear(); const attrId = `${base}:asset:${slug(name)}:attributes`;
      submodels.push({ modelType: "Submodel", id: attrId, idShort: "Attributes", kind: "Instance", submodelElements: attrs.map((c) => unique(prop(c, rs, "str"))) }); refs.push(ref("ModelReference", "Submodel", attrId));
    }
    shells.push({ modelType: "AssetAdministrationShell", id: `${base}:asset:${slug(name)}`, idShort: idShort(pascal(name) || `Asset${i + 1}`, "Asset"), assetInformation: { assetKind: "Instance", globalAssetId: `${base}:asset-id:${slug(name)}`, ...(assetCol ? {} : {}) }, submodels: refs });
  });
  const dtype = (c: ColumnSemantic) => (typeOf(c) === "boolean" ? "BOOLEAN" : typeOf(c) === "integer" || typeOf(c) === "decimal" ? (c.unit.trim() ? "REAL_MEASURE" : "REAL_COUNT") : "STRING");
  const conceptDescriptions = [...values, ...attrs].map((c) => ({
    modelType: "ConceptDescription", id: cdId(c), idShort: idShort(pascal(c.label) || pascal(c.column), "C"),
    embeddedDataSpecifications: [{ dataSpecification: ref("ExternalReference", "GlobalReference", "http://admin-shell.io/DataSpecificationTemplates/DataSpecificationIec61360/3/0"),
      dataSpecificationContent: { modelType: "DataSpecificationIec61360", preferredName: lang(c.label), shortName: lang(c.column.slice(0, 18)), ...(c.unit.trim() ? { unit: c.unit.trim() } : {}), dataType: dtype(c), definition: lang(c.description || c.label) } }],
  }));
  return { assetAdministrationShells: shells, submodels, conceptDescriptions };
}

// ---------------------------------------------------------------------------------------------------------------------- storage (this browser)
export const semanticsKey = (id: string) => `tok.refinery.semantics.${id}`;
const key = semanticsKey;
export function loadModel(d: Dataset): SemanticModel {
  try { const raw = localStorage.getItem(key(d.id)); if (raw) return normaliseModel(JSON.parse(raw) as SemanticModel, d); } catch { /* use the proposal */ }
  return inferSemantics(d);
}
export function saveModel(d: Dataset, m: SemanticModel): void { try { localStorage.setItem(key(d.id), JSON.stringify(m)); } catch { /* storage unavailable */ } pushSetting("datasets", d.id, "semantics", m); }
export function clearModel(d: Dataset): void { try { localStorage.removeItem(key(d.id)); } catch { /* storage unavailable */ } pushSetting("datasets", d.id, "semantics", null); }
