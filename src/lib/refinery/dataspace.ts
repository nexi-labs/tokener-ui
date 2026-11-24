/**
 * Data-space export. A dataset can be offered to other organisations through a data space connector (the Eclipse Dataspace Connector, as used
 * in Catena-X and similar spaces). This module takes the dataset record, its meaning (the semantic layer), its quality profile and the terms
 * the owner chooses, checks them, and writes the files a connector operator needs:
 *
 *   asset.json                EDC management API asset (what is offered and where the connector reads it)
 *   policy-definition.json    usage terms as an ODRL policy (purpose, partners, expiry, no onward transfer)
 *   contract-definition.json  ties the policy to the asset
 *   dcat-dataset.jsonld       a DCAT description of the dataset for catalogues
 *   data-product-passport.*   a readable and machine readable record of what the data is, how good it is and on what terms it is offered
 *   README.md                 how to register the files, and what has not been verified
 *
 * Scope today: the checks and the files. Nothing is registered with a connector from here and no connector has been run against the files.
 * The passport is a record of what the platform knows. It is not an audit, a certification or a legal opinion, and it is not an EU Digital
 * Product Passport, which describes physical products.
 */
import type { Judged } from "./sovereignty";
import { placeIn, placeLabel } from "./sovereignty";
import { coverage, slug, type SemanticModel } from "./semantics";
import type { Dataset, FileFormat } from "./types";
import { pushSetting } from "./settingsBus";
import { zip } from "../zip";

export type Licence = "internal" | "cc-by-4.0" | "cc-by-nc-4.0" | "custom";
export const LICENCES: { id: Licence; label: string; url: string | null }[] = [
  { id: "internal", label: "Only under the contract agreed with each partner", url: null },
  { id: "cc-by-4.0", label: "Creative Commons Attribution 4.0", url: "https://creativecommons.org/licenses/by/4.0/" },
  { id: "cc-by-nc-4.0", label: "Creative Commons Attribution NonCommercial 4.0", url: "https://creativecommons.org/licenses/by-nc/4.0/" },
  { id: "custom", label: "Terms published at an address I give", url: null },
];
export const PURPOSES = ["Predictive maintenance", "Quality assurance", "Model training", "Energy optimisation", "Research"];

export type OfferTerms = {
  publisher: string; assetId: string; baseUrl: string; purposes: string[]; licence: Licence; licenceUrl: string;
  /** Participant identifiers allowed to use the data. Empty means any participant the connector accepts. */
  partners: string[]; validUntil: string; noOnwardTransfer: boolean; keywords: string[];
  /** Why personal data is being offered, when the dataset holds some. */
  personalDataNote: string;
};
export const defaultTerms = (d: Dataset): OfferTerms => ({ publisher: "", assetId: `${slug(d.name)}-v${d.version}`, baseUrl: "", purposes: [], licence: "internal", licenceUrl: "", partners: [], validUntil: "", noOnwardTransfer: true, keywords: [], personalDataNote: "" });

const MEDIA: Partial<Record<FileFormat, string>> = { csv: "text/csv", tsv: "text/tab-separated-values", json: "application/json", jsonl: "application/x-ndjson", parquet: "application/vnd.apache.parquet", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", delta: "application/vnd.apache.parquet", iceberg: "application/vnd.apache.parquet" };
export const mediaType = (f: FileFormat) => MEDIA[f] ?? "application/octet-stream";
const BPN = /^BPN[LSA][0-9A-Z]{12}$/;
const ID = /^[A-Za-z0-9._~:-]+$/;

export type OfferFinding = { level: "error" | "warn" | "info"; text: string };
export function personalColumns(d: Dataset): string[] { return d.profile.columns.filter((c) => c.pii).map((c) => c.name); }

/** What blocks the export (error), what to look at first (warn) and what the passport will say (info). Pure. */
export function checkOffer(d: Dataset, t: OfferTerms, m: SemanticModel, now = new Date()): OfferFinding[] {
  const out: OfferFinding[] = [];
  if (!t.publisher.trim()) out.push({ level: "error", text: "Say which organisation is publishing the data." });
  if (!ID.test(t.assetId)) out.push({ level: "error", text: "The asset identifier may use letters, digits and . _ ~ : - only." });
  if (!/^https:\/\/[^\s/]+\S*$/.test(t.baseUrl.trim())) out.push({ level: "error", text: "Give the https address the connector will read the data from. It is written into the asset as given and should not carry a secret." });
  if (/[?&](token|key|secret|password|sig)=/i.test(t.baseUrl)) out.push({ level: "error", text: "The address looks like it carries a secret in its query string. Keep secrets in the connector's vault." });
  if (t.licence === "custom" && !/^https:\/\//.test(t.licenceUrl.trim())) out.push({ level: "error", text: "Give the https address where your terms are published." });
  const pii = personalColumns(d);
  if (pii.length && t.personalDataNote.trim().length < 10) out.push({ level: "error", text: `${pii.length} column${pii.length === 1 ? "" : "s"} hold personal data (${pii.slice(0, 4).join(", ")}${pii.length > 4 ? ", ..." : ""}). Mask or remove them in a pipeline, or write in a sentence or two why they are offered and on what basis.` });
  if (t.validUntil) { const when = new Date(t.validUntil + "T23:59:59Z"); if (Number.isNaN(when.getTime())) out.push({ level: "error", text: "The expiry date is not a date." }); else if (when < now) out.push({ level: "error", text: "The expiry date has passed." }); }
  for (const p of t.partners) if (!BPN.test(p)) out.push({ level: "warn", text: `${p} is not in the form of a Catena-X business partner number (BPNL, BPNS or BPNA, then 12 characters). Check that your data space uses this identifier.` });
  if (t.purposes.length === 0) out.push({ level: "warn", text: "No purpose is set, so the terms do not limit what the data is used for." });
  if (t.partners.length === 0) out.push({ level: "warn", text: "No partner is named, so any participant the connector accepts can use the data." });
  const cov = coverage(m);
  if (cov.described < cov.columns) out.push({ level: "warn", text: `${cov.columns - cov.described} of ${cov.columns} columns have no description in the Semantics tab, so the passport cannot say what they mean.` });
  if (cov.measurements > cov.withUnit) out.push({ level: "warn", text: `${cov.measurements - cov.withUnit} measurement column${cov.measurements - cov.withUnit === 1 ? " has" : "s have"} no unit.` });
  if (d.profile.sampled < d.profile.totalRows) out.push({ level: "info", text: `The quality figures were computed on ${d.profile.sampled.toLocaleString("en-US")} sampled rows of ${d.profile.totalRows.toLocaleString("en-US")} and the passport says so.` });
  return out;
}
export const blocked = (f: OfferFinding[]) => f.some((x) => x.level === "error");

// ----------------------------------------------------------------------------------------------------------------------------------- files
const CTX_EDC = "https://w3id.org/edc/v0.0.1/ns/";
export function toAsset(d: Dataset, t: OfferTerms) {
  return {
    "@context": { "@vocab": CTX_EDC, dct: "http://purl.org/dc/terms/", dcat: "http://www.w3.org/ns/dcat#" },
    "@id": t.assetId, "@type": "Asset",
    properties: { name: d.name, description: d.description, contenttype: mediaType(d.format), version: String(d.version), "dct:publisher": t.publisher.trim(), ...(t.keywords.length ? { "dcat:keyword": t.keywords } : {}) },
    dataAddress: { "@type": "DataAddress", type: "HttpData", baseUrl: t.baseUrl.trim() },
  };
}
export function toPolicy(t: OfferTerms) {
  const constraint: Record<string, unknown>[] = [];
  if (t.purposes.length) constraint.push({ leftOperand: "purpose", operator: t.purposes.length === 1 ? "eq" : "isAnyOf", rightOperand: t.purposes.length === 1 ? t.purposes[0] : t.purposes });
  if (t.partners.length) constraint.push({ leftOperand: "BusinessPartnerNumber", operator: t.partners.length === 1 ? "eq" : "isAnyOf", rightOperand: t.partners.length === 1 ? t.partners[0] : t.partners });
  if (t.validUntil) constraint.push({ leftOperand: "dateTime", operator: "lt", rightOperand: { "@value": `${t.validUntil}T23:59:59Z`, "@type": "http://www.w3.org/2001/XMLSchema#dateTime" } });
  const permission: Record<string, unknown> = { action: "use", ...(constraint.length ? { constraint } : {}) };
  return {
    "@context": { "@vocab": CTX_EDC, odrl: "http://www.w3.org/ns/odrl/2/" }, "@type": "PolicyDefinition", "@id": `${t.assetId}-policy`,
    policy: { "@context": "http://www.w3.org/ns/odrl.jsonld", "@type": "Set", permission: [permission], ...(t.noOnwardTransfer ? { prohibition: [{ action: "distribute" }] } : {}) },
  };
}
export function toContract(t: OfferTerms) {
  return {
    "@context": { "@vocab": CTX_EDC }, "@type": "ContractDefinition", "@id": `${t.assetId}-contract`,
    accessPolicyId: `${t.assetId}-policy`, contractPolicyId: `${t.assetId}-policy`,
    assetsSelector: [{ "@type": "Criterion", operandLeft: `${CTX_EDC}id`, operator: "=", operandRight: t.assetId }],
  };
}

/** The first and last value of the timestamp column in the sample, when there is one: the period the data covers. */
export function period(d: Dataset, m: SemanticModel): { from: string; to: string } | null {
  const col = m.columns.find((c) => c.kind === "timestamp"); if (!col) return null;
  const ts = d.sample.map((r) => r[col.column]).map((v) => (typeof v === "string" || typeof v === "number" ? new Date(v as string).getTime() : NaN)).filter((n) => Number.isFinite(n));
  if (ts.length < 2) return null; return { from: new Date(Math.min(...ts)).toISOString(), to: new Date(Math.max(...ts)).toISOString() };
}

export function toDcat(d: Dataset, t: OfferTerms, m: SemanticModel) {
  const lic = LICENCES.find((l) => l.id === t.licence)!; const licUrl = t.licence === "custom" ? t.licenceUrl.trim() : lic.url; const per = period(d, m);
  return {
    "@context": { dcat: "http://www.w3.org/ns/dcat#", dct: "http://purl.org/dc/terms/", foaf: "http://xmlns.com/foaf/0.1/", xsd: "http://www.w3.org/2001/XMLSchema#" },
    "@id": `urn:tokener:dataset:${t.assetId}`, "@type": "dcat:Dataset",
    "dct:title": d.name, "dct:description": d.description || d.name, "dct:identifier": t.assetId, "dct:modified": { "@value": d.updatedAt, "@type": "xsd:dateTime" },
    "dct:publisher": { "@type": "foaf:Agent", "foaf:name": t.publisher.trim() },
    ...(t.keywords.length ? { "dcat:keyword": t.keywords } : {}),
    ...(licUrl ? { "dct:license": { "@id": licUrl } } : {}),
    ...(per ? { "dct:temporal": { "@type": "dct:PeriodOfTime", "dcat:startDate": { "@value": per.from, "@type": "xsd:dateTime" }, "dcat:endDate": { "@value": per.to, "@type": "xsd:dateTime" } } } : {}),
    "dcat:distribution": [{ "@type": "dcat:Distribution", "dcat:mediaType": { "@id": `https://www.iana.org/assignments/media-types/${mediaType(d.format)}` }, "dct:format": d.format, "dcat:accessURL": { "@id": t.baseUrl.trim() }, "dcat:byteSize": { "@value": String(d.sizeBytes), "@type": "xsd:nonNegativeInteger" } }],
  };
}

export type Passport = ReturnType<typeof toPassport>;
export function toPassport(d: Dataset, t: OfferTerms, m: SemanticModel, where: Judged | null, now = new Date()) {
  const pii = personalColumns(d); const cov = coverage(m); const per = period(d, m);
  const source = d.source.kind === "upload" ? `an uploaded file (${d.source.fileName})` : d.source.kind === "connection" ? `a connection (${d.source.location})` : d.source.kind === "query" ? "the result of a saved query" : d.source.kind === "documents" ? `documents from ${d.source.folder}` : "a unified dataset built from several tables";
  return {
    schema: "tokener.data-product-passport/1", generatedAt: now.toISOString(),
    identity: { assetId: t.assetId, name: d.name, version: d.version, publisher: t.publisher.trim(), description: d.description, lastUpdated: d.updatedAt },
    content: { rows: d.totalRows, sizeBytes: d.sizeBytes, format: d.format, mediaType: mediaType(d.format), coveredPeriod: per,
      columns: m.columns.filter((c) => c.kind !== "ignore").map((c) => ({ name: c.column, kind: c.kind, label: c.label, unit: c.unit || null, description: c.description || null, standardId: c.standardId || null, opcuaNode: c.opcua || null, type: d.columns.find((x) => x.name === c.column)?.type })) },
    quality: { score: d.profile.quality, completeness: d.profile.completeness, parts: d.profile.parts, duplicateRows: d.profile.duplicateRows, computedOnRows: d.profile.sampled, ofRows: d.profile.totalRows },
    personalData: { present: pii.length > 0, columns: pii, basis: pii.length ? t.personalDataNote.trim() : null },
    provenance: { source, storedIn: where ? { place: where.where, label: placeLabel(where.where), basis: where.basis } : null },
    semantics: { described: cov.described, columns: cov.columns, measurementsWithUnit: cov.withUnit, measurements: cov.measurements },
    terms: { purposes: t.purposes, licence: LICENCES.find((l) => l.id === t.licence)!.label, licenceUrl: t.licence === "custom" ? t.licenceUrl.trim() : LICENCES.find((l) => l.id === t.licence)!.url, partners: t.partners.length ? t.partners : "any participant the connector accepts", validUntil: t.validUntil || null, onwardTransfer: t.noOnwardTransfer ? "not permitted" : "not restricted by this policy" },
    notice: "A record of what the platform knew when it was written. It is not an audit, a certification or a legal opinion.",
  };
}
export function passportMarkdown(p: Passport): string {
  const L: string[] = []; const row = (a: string, b: string) => L.push(`| ${a} | ${b} |`);
  L.push(`# Data product passport: ${p.identity.name}`, "", `Version ${p.identity.version}, published by ${p.identity.publisher}. Written ${p.generatedAt.slice(0, 10)}. Asset identifier \`${p.identity.assetId}\`.`, "");
  if (p.identity.description) L.push(p.identity.description, "");
  L.push("## What it holds", "", "| | |", "| --- | --- |");
  row("Rows", p.content.rows.toLocaleString("en-US")); row("Size", `${(p.content.sizeBytes / 1e6).toFixed(1)} MB as ${p.content.format}`); row("Last updated", p.identity.lastUpdated.slice(0, 10));
  if (p.content.coveredPeriod) row("Period covered (sampled rows)", `${p.content.coveredPeriod.from.slice(0, 10)} to ${p.content.coveredPeriod.to.slice(0, 10)}`);
  L.push("", "| Column | Meaning | Kind | Unit | Standard |", "| --- | --- | --- | --- | --- |");
  for (const c of p.content.columns) L.push(`| ${c.name} | ${(c.description ?? c.label).replace(/\|/g, "/")} | ${c.kind} | ${c.unit ?? ""} | ${c.standardId ?? ""} |`);
  L.push("", "## Quality", "", `Quality score ${p.quality.score} (completeness ${p.quality.parts.completeness}, uniqueness ${p.quality.parts.uniqueness}, consistency ${p.quality.parts.consistency}, validity ${p.quality.parts.validity}), computed on ${p.quality.computedOnRows.toLocaleString("en-US")} of ${p.quality.ofRows.toLocaleString("en-US")} rows. ${p.quality.duplicateRows} duplicate rows were found in that sample.`, "");
  L.push("## Personal data", "", p.personalData.present ? `Present in ${p.personalData.columns.join(", ")}. Basis given by the publisher: ${p.personalData.basis}` : "No column was flagged as personal data by the platform's profile. The profile looks at patterns such as emails and phone numbers, so this is not a guarantee.", "");
  L.push("## Where it came from", "", `${p.provenance.source[0].toUpperCase()}${p.provenance.source.slice(1)}.${p.provenance.storedIn ? ` Stored in ${placeIn(p.provenance.storedIn.place)} (judged from: ${p.provenance.storedIn.basis}).` : ""}`, "");
  L.push("## Terms of use", "", "| | |", "| --- | --- |");
  row("Permitted purposes", p.terms.purposes.length ? p.terms.purposes.join(", ") : "not limited"); row("Licence", p.terms.licenceUrl ? `[${p.terms.licence}](${p.terms.licenceUrl})` : p.terms.licence);
  row("Partners", Array.isArray(p.terms.partners) ? p.terms.partners.join(", ") : p.terms.partners); row("Valid until", p.terms.validUntil ?? "no end date"); row("Passing it on", p.terms.onwardTransfer);
  L.push("", `> ${p.notice}`, "");
  return L.join("\n");
}

export type OfferFile = { name: string; language: "json" | "markdown"; content: string };
export function offerFiles(d: Dataset, t: OfferTerms, m: SemanticModel, where: Judged | null, now = new Date()): OfferFile[] {
  const j = (o: unknown) => JSON.stringify(o, null, 2) + "\n"; const p = toPassport(d, t, m, where, now);
  const readme = `# Data space offer: ${d.name}

Files for offering this dataset through an Eclipse Dataspace Connector.

## Register it

Send these to the connector's management API, in this order, with your API key. Paths are those of the Tractus-X documentation (asset API v3, policy and contract definition APIs v2). Check them against the version of the connector you run.

1. \`POST /management/v3/assets\` with \`asset.json\`
2. \`POST /management/v2/policydefinitions\` with \`policy-definition.json\`
3. \`POST /management/v2/contractdefinitions\` with \`contract-definition.json\`

\`dcat-dataset.jsonld\` and \`data-product-passport.md\` are for catalogues and for people. They are not sent to the connector.

## What to check first

- The data address in \`asset.json\` is \`${t.baseUrl.trim()}\`. The connector must be able to reach it and must authenticate to it with its own secrets. No secret is in these files.
- The policy uses the left operands \`purpose\`${t.partners.length ? ", `BusinessPartnerNumber`" : ""}${t.validUntil ? " and `dateTime`" : ""}. A connector only evaluates an operand it has a function for. \`purpose\` and the partner operand usually need to be registered in your data space's policy extension, and an unregistered one can make an offer unreadable or unenforced.
- Several constraints are written as a list, which ODRL reads as all of them applying. Confirm your connector version reads it that way.

## Not verified

- No connector has read these files. The shapes follow the published management API examples and the DCAT and ODRL vocabularies.
- The DCAT file parses as JSON-LD. It was not checked against DCAT-AP shapes.
- The passport is a record, not an audit, certification or legal opinion, and it is not an EU Digital Product Passport.
`;
  return [
    { name: "asset.json", language: "json", content: j(toAsset(d, t)) },
    { name: "policy-definition.json", language: "json", content: j(toPolicy(t)) },
    { name: "contract-definition.json", language: "json", content: j(toContract(t)) },
    { name: "dcat-dataset.jsonld", language: "json", content: j(toDcat(d, t, m)) },
    { name: "data-product-passport.json", language: "json", content: j(p) },
    { name: "data-product-passport.md", language: "markdown", content: passportMarkdown(p) },
    { name: "README.md", language: "markdown", content: readme },
  ];
}
export async function offerZip(d: Dataset, t: OfferTerms, m: SemanticModel, where: Judged | null): Promise<Blob> {
  const dir = `data-space-offer-${slug(d.name)}`;
  const bytes = zip(offerFiles(d, t, m, where).map((f) => ({ path: `${dir}/${f.name}`, content: f.content })));
  return new Blob([bytes as BlobPart], { type: "application/zip" });
}

export const dataspaceKey = (id: string) => `tok.refinery.dataspace.${id}`;
const key = dataspaceKey;
export function loadTerms(d: Dataset): OfferTerms {
  try { const raw = localStorage.getItem(key(d.id)); if (raw) { const v = JSON.parse(raw) as Partial<OfferTerms>; const base = defaultTerms(d); return { ...base, ...v, purposes: Array.isArray(v.purposes) ? v.purposes : [], partners: Array.isArray(v.partners) ? v.partners : [], keywords: Array.isArray(v.keywords) ? v.keywords : [] }; } } catch { /* use the default */ }
  return defaultTerms(d);
}
export function saveTerms(d: Dataset, t: OfferTerms): void { try { localStorage.setItem(key(d.id), JSON.stringify(t)); } catch { /* storage unavailable */ } pushSetting("datasets", d.id, "data-space", t); }
