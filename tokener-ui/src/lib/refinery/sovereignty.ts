/**
 * Data location policy. An organisation says which places its data may be in, and every pipeline is checked end to end: where it reads,
 * where it runs, whether it calls a model, and where it writes.
 *
 * Locations are judged from what the connections and runner pools already declare (a region such as eu-west-1, a Snowflake account
 * suffix, a host name that looks private). That is a reading of names, not a measurement of where bytes physically sit, so any place can
 * be corrected by hand and an unknown place is reported as unknown instead of being assumed safe.
 *
 * Scope today: the policy, the place judgement, the pipeline check and an optional block on runs. All of it is held in the browser. The
 * platform does not enforce the policy on the server yet.
 */
import { CONNECTOR_BY_ID } from "./connectors";
import { STEP_BY_OP } from "./steps";
import type { Connection, Dataset, Recipe, RunnerPool } from "./types";
import { pushSetting } from "./settingsBus";

export type Place = "eu" | "uk" | "us" | "americas" | "gulf" | "apac" | "africa" | "onprem" | "other";
export type Where = Place | "unknown";
export const PLACES: { id: Place; label: string }[] = [
  { id: "eu", label: "European Union" }, { id: "uk", label: "United Kingdom" }, { id: "us", label: "United States" },
  { id: "americas", label: "Canada and Latin America" }, { id: "gulf", label: "Gulf region" }, { id: "apac", label: "Asia Pacific" },
  { id: "africa", label: "Africa" }, { id: "onprem", label: "Your own premises" }, { id: "other", label: "Elsewhere" },
];
/** A place inside a sentence: "the European Union", "your own premises". */
export const placeIn = (w: Where): string => (w === "unknown" ? "a place that is not known" : w === "onprem" ? "your own premises" : w === "gulf" ? "the Gulf region" : w === "other" ? "a place outside the list" : w === "uk" || w === "us" || w === "eu" ? `the ${PLACES.find((p) => p.id === w)!.label}` : PLACES.find((p) => p.id === w)!.label);
export const placeLabel = (w: Where) => (w === "unknown" ? "Not known" : PLACES.find((p) => p.id === w)!.label);

/** Cloud regions whose country is not what the prefix suggests, checked before the general patterns. */
const EXACT: Record<string, Place> = {
  "eu-west-2": "uk", "uksouth": "uk", "ukwest": "uk", "europe-west2": "uk",
  "eu-central-2": "other", "europe-west6": "other", "switzerlandnorth": "other", "switzerlandwest": "other", "norwayeast": "other", "norwaywest": "other", "eu-north-2": "other",
  "me-west1": "other", "il-central-1": "other", "israelcentral": "other",
  "me-south-1": "gulf", "me-central-1": "gulf", "uaenorth": "gulf", "uaecentral": "gulf", "qatarcentral": "gulf", "me-central1": "gulf", "me-central2": "gulf",
};
const PATTERNS: [RegExp, Place][] = [
  [/^eu-(west|central|north|south)-\d$/, "eu"], [/^europe-(west|north|central|southwest)\d+$/, "eu"],
  [/^(westeurope|northeurope|francecentral|francesouth|germanywestcentral|germanynorth|swedencentral|swedensouth|italynorth|polandcentral|spaincentral)$/, "eu"],
  [/^us-(east|west|central|gov|iso)/, "us"], [/^(east|west|central|northcentral|southcentral|westcentral)us\d?$/, "us"], [/^us-(east|west|central|south)\d$/, "us"],
  [/^(ca-|canada|sa-|brazil|northamerica-|southamerica-|mexico|chile)/, "americas"],
  [/^(ap-|australia|japan|korea|southeastasia|eastasia|asia-|centralindia|southindia|westindia|jioindia|newzealand|indonesia|malaysia)/, "apac"],
  [/^(af-|southafrica|africa)/, "africa"],
];

/** A cloud region name such as eu-west-1, westeurope or europe-west4 to a place, or null when the name is not one the list knows. */
export function placeOfRegion(name: string): Place | null {
  const r = name.trim().toLowerCase();
  if (EXACT[r]) return EXACT[r];
  for (const [re, p] of PATTERNS) if (re.test(r)) return p;
  return null;
}
/** Free text such as "Europe (managed)", "On premises" or "eu-west-1 (customer cluster)". */
export function placeOfText(text: string): Place | null {
  const t = text.toLowerCase();
  if (/on.?prem|your own|in.?house|private (cloud|network)/.test(t)) return "onprem";
  for (const tok of t.match(/[a-z]+(?:-[a-z]+)*-?\d*/g) ?? []) { const p = placeOfRegion(tok); if (p) return p; }
  if (/\beurope\b|\beu\b/.test(t)) return "eu"; if (/united kingdom|\buk\b/.test(t)) return "uk"; if (/united states|\bus\b|\busa\b/.test(t)) return "us";
  return null;
}
/** A host that sits on a private network or an internal name. Such a name says "inside the organisation's network", not which country. */
export function looksPrivate(host: string): boolean {
  const h = host.toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/[:/].*$/, "");
  return /(^|\.)(internal|local|lan|corp|intranet|home\.arpa)$/.test(h) || /\.(internal|local|lan|corp)\./.test(h) || h === "localhost" || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
}

export type Judged = { where: Where; basis: string };
const HOST_KEYS = ["endpoint", "host", "brokers", "uri", "servers", "restUrl"];

/** Where a connection's data is, judged from its settings. Self-hosted endpoints win over a region field, which for S3 compatible stores is only a signing value. */
export function placeOfConnection(c: Connection, declared?: Where): Judged {
  if (declared && declared !== "unknown") return { where: declared, basis: "set by you" };
  const hosts = HOST_KEYS.map((k) => c.settings[k]).filter(Boolean).flatMap((v) => v.split(","));
  if (hosts.length && hosts.every((h) => looksPrivate(h))) return { where: "onprem", basis: "the host name is on a private network" };
  for (const v of [c.settings.region, c.settings.account, c.settings.location, ...hosts]) {
    if (!v) continue; const p = placeOfText(v) ?? placeOfRegion(v.split(".").pop() ?? ""); if (p) return { where: p, basis: `the ${v === c.settings.region ? "region" : "address"} ${v}` };
  }
  return { where: "unknown", basis: CONNECTOR_BY_ID.get(c.connector)?.group === "Files and APIs" ? "a partner host with no region in its settings" : "no region or private host in its settings" };
}
export function placeOfPool(p: RunnerPool, policy: Policy): Judged {
  const d = policy.places[`pool:${p.id}`]; if (d && d !== "unknown") return { where: d, basis: "set by you" };
  if (p.builtIn) return policy.platformPlace === "unknown" ? { where: "unknown", basis: "runs inside tok∑ner, whose location you have not set" } : { where: policy.platformPlace, basis: "runs inside tok∑ner, at the location you set" };
  if (p.flink?.location === "onprem") return { where: "onprem", basis: "a Flink cluster you run on your premises" };
  if (p.flink?.location === "local") return { where: "onprem", basis: "a Flink cluster on a local machine" };
  const w = placeOfText(p.region); return w ? { where: w, basis: `the pool region "${p.region}"` } : { where: "unknown", basis: "no region on the pool" };
}

export type Policy = {
  enabled: boolean;
  /** Stop a run that breaks the policy. Off means findings are shown and runs go ahead. */
  enforce: boolean;
  allowed: Place[];
  /** Whether steps that call a model through the gateway are allowed, and where the gateway serves them (declared by you: the console cannot see it). */
  modelSteps: "allow" | "block";
  modelPlace: Where;
  /** Where tok∑ner itself runs, for uploads, platform datasets and the built-in engine. */
  platformPlace: Where;
  /** Corrections, keyed `conn:<id>` or `pool:<id>`. */
  places: Record<string, Where>;
};
export const DEFAULT_POLICY: Policy = { enabled: false, enforce: false, allowed: ["eu"], modelSteps: "allow", modelPlace: "unknown", platformPlace: "unknown", places: {} };
export const PRESETS: { id: string; label: string; allowed: Place[] }[] = [
  { id: "eu", label: "European Union only", allowed: ["eu"] },
  { id: "eu-uk", label: "European Union and United Kingdom", allowed: ["eu", "uk"] },
  { id: "eu-onprem", label: "European Union and your own premises", allowed: ["eu", "onprem"] },
  { id: "gulf", label: "Gulf region only", allowed: ["gulf"] },
  { id: "onprem", label: "Your own premises only", allowed: ["onprem"] },
];

export type Verdict = "inside" | "outside" | "unknown";
export type Hop = { role: "source" | "runs on" | "model" | "output"; label: string; where: Where; basis: string; verdict: Verdict };
export type Check = { recipe: string; hops: Hop[]; status: "compliant" | "breaks" | "unverified"; reasons: string[] };

const verdictOf = (w: Where, p: Policy): Verdict => (w === "unknown" ? "unknown" : p.allowed.includes(w) ? "inside" : "outside");

/** Follows one pipeline from its input to its outputs. Pure: nothing is contacted. */
export function checkRecipe(r: Recipe, p: Policy, datasets: Dataset[], connections: Connection[], pools: RunnerPool[]): Check {
  const hops: Hop[] = []; const reasons: string[] = [];
  const add = (role: Hop["role"], label: string, j: Judged) => hops.push({ role, label, where: j.where, basis: j.basis, verdict: verdictOf(j.where, p) });
  const platform = (why: string): Judged => (p.platformPlace === "unknown" ? { where: "unknown", basis: `${why}, and you have not set where tok∑ner runs` } : { where: p.platformPlace, basis: `${why}, at the location you set for tok∑ner` });
  const conn = (id: string) => { const c = connections.find((x) => x.id === id); return c ? { c, j: placeOfConnection(c, p.places[`conn:${c.id}`]) } : null; };
  const ds = datasets.find((d) => d.id === r.inputDatasetId);
  if (ds) {
    if (ds.source.kind === "connection" || ds.source.kind === "query") { const x = conn((ds.source as { connectionId: string }).connectionId); x ? add("source", `${ds.name} from ${x.c.name}`, x.j) : add("source", ds.name, { where: "unknown", basis: "the connection was removed" }); }
    else if (ds.source.kind === "model") add("source", ds.name, { where: "unknown", basis: "built from several tables, check each one" });
    else add("source", ds.name, platform("stored by tok∑ner"));
  }
  const pool = pools.find((x) => x.name === r.pool); if (pool) add("runs on", pool.name, placeOfPool(pool, p));
  const ai = r.steps.filter((s) => STEP_BY_OP.get(s.op)?.ai);
  if (ai.length) {
    const names = [...new Set(ai.map((s) => STEP_BY_OP.get(s.op)?.label ?? s.op))].join(", ");
    if (p.modelSteps === "block") { hops.push({ role: "model", label: names, where: "unknown", basis: "model steps are not allowed by the policy", verdict: "outside" }); reasons.push(`The policy does not allow model steps, and this pipeline has ${ai.length}.`); }
    else add("model", names, p.modelPlace === "unknown" ? { where: "unknown", basis: "you have not said where the gateway serves models" } : { where: p.modelPlace, basis: "the location you set for the gateway" });
  }
  for (const o of r.outputs) {
    if (o.kind === "dataset") { add("output", o.name, platform("a dataset kept by tok∑ner")); continue; }
    const name = o.target.split(" / ")[0]; const c = connections.find((x) => x.name === name);
    c ? add("output", `${o.name} to ${c.name}`, placeOfConnection(c, p.places[`conn:${c.id}`])) : add("output", o.name, { where: "unknown", basis: "the connection was not found" });
  }
  for (const h of hops) if (h.verdict === "outside" && !(h.role === "model" && p.modelSteps === "block")) reasons.push(`${h.role === "runs on" ? "Runs on" : h.role === "source" ? "Reads" : h.role === "model" ? "Model calls go to" : "Writes"} ${h.label}, which is in ${placeIn(h.where)}.`);
  const unknown = hops.filter((h) => h.verdict === "unknown");
  const breaks = hops.some((h) => h.verdict === "outside");
  if (!breaks && unknown.length) for (const h of unknown) reasons.push(`Cannot tell where ${h.label} is: ${h.basis}.`);
  return { recipe: r.name, hops, status: breaks ? "breaks" : unknown.length ? "unverified" : "compliant", reasons };
}

/** The reason a run should be stopped, or null. Only when the policy is on and enforcing, and only for a place that is known to be outside. */
export function runBlock(c: Check, p: Policy): string | null {
  if (!p.enabled || !p.enforce || c.status !== "breaks") return null;
  return `The data location policy stops this run. ${c.reasons[0]}`;
}

export const policyKey = "tok.refinery.sovereignty";
export function loadPolicy(): Policy {
  try { const raw = localStorage.getItem(policyKey); if (raw) { const v = JSON.parse(raw) as Partial<Policy>; return { ...DEFAULT_POLICY, ...v, allowed: Array.isArray(v.allowed) ? v.allowed.filter((a): a is Place => PLACES.some((x) => x.id === a)) : DEFAULT_POLICY.allowed, places: { ...(v.places ?? {}) } }; } } catch { /* use the default */ }
  return DEFAULT_POLICY;
}
export function savePolicy(p: Policy): void { try { localStorage.setItem(policyKey, JSON.stringify(p)); } catch { /* storage unavailable */ } pushSetting("org", "org", "data-location", p); }
