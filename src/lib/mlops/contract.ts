/**
 * Connector contracts. A contract is data that tells the platform how to talk to a system over HTTP: how to test it, what it can list,
 * and what each action does, as request templates with response mappings. Platform admins publish contracts from the console, so a new
 * connector needs no backend release. This file is the reference implementation: the console previews with it and the Java runtime
 * (ContractConnector) is held to the same fixtures. See docs/21 (Connector contracts).
 *
 * Safety is part of the format, not of the author's care:
 *  - a request can only go to the connection's own address (a path, never a host), over the transport rules of SafeHttp;
 *  - the credential is added by the runtime from the connection's secret reference, and no template can read it;
 *  - values substituted into a path or query are always encoded, so a parameter cannot add segments or parameters;
 *  - conditions are declarative checks. There is no expression language and nothing is evaluated as code.
 */

import type { CapabilityId } from "./types";

export type FailureClass = "DNS" | "NETWORK" | "TLS" | "AUTH" | "PERMISSION" | "VERSION" | "QUOTA" | "CONFLICT" | "UNSUPPORTED" | "DRIFT" | "INVALID" | "INTERNAL";
export const FAILURE_CLASSES: FailureClass[] = ["DNS", "NETWORK", "TLS", "AUTH", "PERMISSION", "VERSION", "QUOTA", "CONFLICT", "UNSUPPORTED", "DRIFT", "INVALID", "INTERNAL"];

export const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] as const;
export type Method = (typeof METHODS)[number];

export type HttpRequest = {
  method: Method;
  /** Starts with "/". Appended to the connection endpoint and the optional pathPrefix. Substituted values are percent encoded. */
  path: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  /** JSON template. A string that is exactly one {{expression}} keeps the type of the value (number, boolean, object). */
  body?: unknown;
  /** Content type of the body. Defaults to application/json. */
  contentType?: string;
};

/** A declarative test on a JSON response. Exactly one operator per check. Values starting with "$." are read from the same response. */
export type Check = {
  path: string;
  equals?: string | number | boolean;
  notEquals?: string | number | boolean;
  in?: (string | number | boolean)[];
  matches?: string;
  exists?: boolean;
  gt?: string | number;
  gte?: string | number;
  lt?: string | number;
  lte?: string | number;
};

export type Expect = { status?: number[]; json?: Check[] };

/** A sample answer from the real system. The console shows it in the Code view and uses it to check the contract's paths before publishing. */
export type Example = { status: number; json?: unknown };

export type ContractAuth =
  | { mode: "none" }
  | { mode: "bearer" }
  | { mode: "basic" }
  /** A named header with an optional prefix, for API keys. */
  | { mode: "header"; header: string; prefix?: string };

export type TestCheck = {
  name: string;
  request: HttpRequest;
  expect?: Expect;
  /** Path of the version string in the response. The first major.minor found is compared with versionRange. */
  version?: string;
  versionRange?: { min?: string; max?: string };
  /** Failure class when this check fails. Defaults from the status code. */
  onFail?: FailureClass;
  /** CONNECTIVITY checks run for the quick test, FULL ones only for the full test. */
  scope?: "connectivity" | "full";
  /** Runs only on a read-write connection. Used for a permission check that would otherwise change nothing. */
  requiresWrite?: boolean;
  example?: Example;
};

export type DiscoverKind = {
  kind: string;
  request: HttpRequest;
  /** Path of the array of items in the response. */
  items: string;
  /** Paths relative to one item. */
  name: string;
  namespace?: string;
  attributes?: Record<string, string>;
  limit?: number;
  example?: Example;
};

export type ParamDef = { name: string; type: "string" | "number" | "boolean" | "object" | "array"; required?: boolean; default?: unknown; enum?: string[]; description?: string };

export type PlanStepDef = {
  action: string;
  target: { kind: string; namespace?: string; name: string };
  summary: string;
  risk: "low" | "medium" | "high";
};

export type ActionStep = {
  name: string;
  request: HttpRequest;
  expect?: Expect;
  /** name -> path in the response. Later steps read it as {{capture.name}}. */
  capture?: Record<string, string>;
  /** The step runs only when these checks hold on the previous response. */
  when?: Check[];
  example?: Example;
};

export type ActionDef = {
  description: string;
  /** Every action belongs to a capability the manifest declares, so what it can change is visible before anyone connects. */
  capability: CapabilityId;
  /** read actions run directly. write actions need a read-write connection, a plan and, in production, approval. */
  mode: "read" | "write";
  params?: ParamDef[];
  plan?: PlanStepDef[];
  steps: ActionStep[];
  /** name -> path in the last response. What the operator receives. */
  result?: Record<string, string>;
};

export type ObserveDef = {
  request: HttpRequest;
  /** Statuses that mean the thing does not exist (state absent). */
  absentOn?: number[];
  state: { ready: Check[]; degraded?: Check[]; failed?: Check[] };
  desired?: string;
  ready?: string;
  attributes?: Record<string, string>;
  example?: Example;
};

export type Contract = {
  version: "1";
  timeoutSec?: number;
  /** Prepended to every path, for example /api/2.0. */
  pathPrefix?: string;
  /** The integration whose connection supplies the address and credential, for connectors that ride on another one (KServe on Kubernetes). */
  via?: string;
  auth: ContractAuth;
  /** Extra headers whose values are secret references kept in connection options, for example a workspace key. */
  extraSecretHeaders?: Record<string, { option: string }>;
  test: TestCheck[];
  discover?: DiscoverKind[];
  actions?: Record<string, ActionDef>;
  observe?: ObserveDef;
  /** Status to failure class overrides, applied before the defaults. */
  failures?: { status: number; class: FailureClass }[];
};

// ------------------------------------------------------------------------------------------------ limits

export const CONTRACT_LIMITS = { tests: 20, discover: 12, actions: 16, steps: 12, planSteps: 12, params: 24, bodyBytes: 16 * 1024, checks: 16, pathChars: 400, templateChars: 2000, timeoutSec: 120 };

/** Headers a contract may never set: the runtime owns them. */
export const RESERVED_HEADERS = new Set(["authorization", "host", "cookie", "set-cookie", "content-length", "transfer-encoding", "connection", "proxy-authorization", "x-forwarded-for", "x-forwarded-host"]);

/** The names operators use to call an action. A contract provides the ones its connector can do. */
export const OPERATOR_ACTIONS: Record<string, { adapter: string; mode: "read" | "write"; description: string }> = {
  deploy: { adapter: "target.apply", mode: "write", description: "Create or update the serving endpoint." },
  canary: { adapter: "target.canary", mode: "write", description: "Start a canary with a share of traffic." },
  promote: { adapter: "target.promote", mode: "write", description: "Move traffic to the new version in steps." },
  rollback: { adapter: "target.rollback", mode: "write", description: "Return to the previous version." },
  cleanup: { adapter: "target.cleanup", mode: "write", description: "Remove old revisions beyond the number to keep." },
  scale: { adapter: "target.scale", mode: "write", description: "Change the replica range." },
  "resolve-model": { adapter: "registry.resolve", mode: "read", description: "Find a model version and where its files are." },
  "register-model": { adapter: "registry.register", mode: "write", description: "Register a new model version." },
  metrics: { adapter: "observe.attach", mode: "read", description: "Read latency and error rate for an endpoint." },
};

/** Actions are named freely, but these map onto operators and must keep their mode. */
export const ACTION_NAME = /^[a-z][a-z0-9-]{1,40}$/;

// ------------------------------------------------------------------------------------------------ templates

export type Scope = { connection: { endpoint: string; env: string; options: Record<string, unknown> }; params: Record<string, unknown>; capture: Record<string, unknown>; run?: { id: string }; node?: { id: string } };

const EXPR = /\{\{\s*([^{}]+?)\s*\}\}/g;
const WHOLE = /^\{\{\s*([^{}]+?)\s*\}\}$/;
const NAMESPACES = ["connection", "params", "capture", "run", "node"];

export type Filter = { name: string; arg?: string };
export function parseExpr(raw: string): { path: string; filters: Filter[] } {
  const [head, ...rest] = raw.split("|").map((s) => s.trim());
  return { path: head, filters: rest.map((f) => { const m = /^(\w+)(?::(.*))?$/.exec(f); return m ? { name: m[1], arg: m[2] } : { name: f }; }) };
}

export function lookup(scope: Scope, path: string): unknown {
  const parts = path.split(".");
  if (!NAMESPACES.includes(parts[0])) return undefined;
  let cur: unknown = scope;
  for (const p of parts) { if (cur && typeof cur === "object" && p in (cur as object)) cur = (cur as Record<string, unknown>)[p]; else return undefined; }
  return cur;
}

const FILTERS = new Set(["urlencode", "path", "json", "lower", "upper", "default", "number", "string"]);

function applyFilters(v: unknown, filters: Filter[]): unknown {
  let cur = v;
  for (const f of filters) {
    switch (f.name) {
      case "default": if (cur === undefined || cur === null || cur === "") cur = f.arg ?? ""; break;
      case "lower": cur = String(cur ?? "").toLowerCase(); break;
      case "upper": cur = String(cur ?? "").toUpperCase(); break;
      case "json": cur = JSON.stringify(cur ?? null); break;
      case "number": { const n = Number(cur); cur = Number.isFinite(n) ? n : cur; break; }
      case "string": cur = cur === undefined || cur === null ? "" : String(cur); break;
      case "urlencode": cur = encodeURIComponent(String(cur ?? "")); break;
      /** For names with slashes, such as an image repository. Each segment is encoded and . or .. segments are refused, so the value cannot leave its place in the path. */
      case "path": {
        const segs = String(cur ?? "").split("/");
        if (segs.some((x) => x === "" || x === "." || x === "..")) throw new TemplateError("A path value may not be empty or contain . or .. segments.");
        cur = segs.map(encodeURIComponent).join("/"); break;
      }
      default: break;
    }
  }
  return cur;
}

export class TemplateError extends Error {}

/** Renders a string. Every substituted value is converted to text. For a path or query, pass encode so values cannot add structure. */
export function renderString(t: string, scope: Scope, encode = false, lenient = false): string {
  return t.replace(EXPR, (_m, raw: string) => {
    const { path, filters } = parseExpr(raw);
    let v = applyFilters(lookup(scope, path), filters);
    if (v === undefined || v === null) { if (lenient) return `<${path}>`; throw new TemplateError(`The value ${path} is not available.`); }
    if (typeof v === "object") v = JSON.stringify(v);
    const s = String(v);
    return encode && !filters.some((f) => f.name === "urlencode" || f.name === "path") ? encodeURIComponent(s) : s;
  });
}

/** Renders a JSON template. A string that is exactly one expression keeps the value's own type. */
export function renderValue(t: unknown, scope: Scope, lenient = false): unknown {
  if (typeof t === "string") {
    const m = WHOLE.exec(t);
    if (m) {
      const { path, filters } = parseExpr(m[1]);
      const v = applyFilters(lookup(scope, path), filters);
      if (v === undefined || v === null) { if (lenient) return `<${path}>`; throw new TemplateError(`The value ${path} is not available.`); }
      return v;
    }
    return renderString(t, scope, false, lenient);
  }
  if (Array.isArray(t)) return t.map((x) => renderValue(x, scope, lenient));
  if (t && typeof t === "object") return Object.fromEntries(Object.entries(t as Record<string, unknown>).map(([k, v]) => [k, renderValue(v, scope, lenient)]));
  return t;
}

export type RenderedRequest = { method: Method; url: string; headers: Record<string, string>; body?: string };

/** The request exactly as the runtime will send it, minus the credential, which the runtime adds from the secret reference. */
export function renderRequest(c: Contract, r: HttpRequest, scope: Scope, lenient = false): RenderedRequest {
  const base = scope.connection.endpoint.replace(/\/+$/, "");
  const path = (c.pathPrefix ?? "") + renderString(r.path, scope, true, lenient);
  const q = Object.entries(r.query ?? {}).map(([k, v]) => `${encodeURIComponent(k)}=${renderString(v, scope, true, lenient)}`).join("&");
  const headers: Record<string, string> = { Accept: "application/json", ...Object.fromEntries(Object.entries(r.headers ?? {}).map(([k, v]) => [k, renderString(v, scope, false, lenient)])) };
  let body: string | undefined;
  if (r.body !== undefined) {
    body = JSON.stringify(renderValue(r.body, scope, lenient));
    headers["Content-Type"] = r.contentType ?? "application/json";
  }
  return { method: r.method, url: base + path + (q ? "?" + q : ""), headers, body };
}

// ------------------------------------------------------------------------------------------------ JSON path and checks

export function readPath(root: unknown, path: string): unknown {
  let p = path.trim();
  if (p.startsWith("$")) p = p.slice(1);
  if (p.startsWith(".")) p = p.slice(1);
  if (!p) return root;
  let cur: unknown = root;
  for (const part of p.split(".")) {
    const m = /^([^[\]]*)(?:\[(\d+)\])?$/.exec(part);
    if (!m) return undefined;
    if (m[1]) { if (cur && typeof cur === "object" && !Array.isArray(cur) && m[1] in (cur as object)) cur = (cur as Record<string, unknown>)[m[1]]; else return undefined; }
    if (m[2] !== undefined) { if (Array.isArray(cur) && Number(m[2]) < cur.length) cur = cur[Number(m[2])]; else return undefined; }
    if (cur === undefined || cur === null) return undefined;
  }
  return cur;
}

/** String(), except that an object or list is written as JSON, so a comparison never depends on how a runtime prints an object. */
const text = (v: unknown): string => (v !== null && typeof v === "object" ? JSON.stringify(v) : String(v));
const operand = (root: unknown, v: string | number): unknown => (typeof v === "string" && v.startsWith("$.") ? readPath(root, v) : v);
const toNum = (v: unknown): number | undefined => { const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN; return Number.isFinite(n) ? n : undefined; };

export function checkHolds(root: unknown, c: Check): boolean {
  const v = readPath(root, c.path);
  if (c.exists !== undefined) return (v !== undefined) === c.exists;
  if (c.equals !== undefined) return v !== undefined && text(v) === text(operand(root, c.equals as string | number));
  if (c.notEquals !== undefined) return v === undefined || text(v) !== text(operand(root, c.notEquals as string | number));
  if (c.in) return v !== undefined && c.in.some((x) => text(x) === text(v));
  if (c.matches !== undefined) { try { return v !== undefined && new RegExp(c.matches).test(text(v)); } catch { return false; } }
  for (const [op, cmp] of [["gt", (a: number, b: number) => a > b], ["gte", (a: number, b: number) => a >= b], ["lt", (a: number, b: number) => a < b], ["lte", (a: number, b: number) => a <= b]] as const) {
    const want = c[op];
    if (want === undefined) continue;
    const a = toNum(v), b = toNum(operand(root, want));
    return a !== undefined && b !== undefined && cmp(a, b);
  }
  return false;
}
export const allHold = (root: unknown, cs: Check[] | undefined) => (cs ?? []).every((c) => checkHolds(root, c));

/** Compares major.minor from a version string with an inclusive range. A version that cannot be read passes with a note. */
export function versionInRange(found: string | undefined, range?: { min?: string; max?: string }): { ok: boolean; note?: string } {
  if (!range || (!range.min && !range.max)) return { ok: true };
  const mm = (s: string | undefined) => { const m = s ? /(\d+)\.(\d+)/.exec(s) : null; return m ? [Number(m[1]), Number(m[2])] : null; };
  const f = mm(found);
  if (!f) return { ok: true, note: "The version could not be read from the answer." };
  const cmp = (a: number[], b: number[]) => (a[0] - b[0]) || (a[1] - b[1]);
  const lo = mm(range.min), hi = mm(range.max);
  if (lo && cmp(f, lo) < 0) return { ok: false, note: `Version ${f.join(".")} is older than the supported ${range.min}.` };
  if (hi && cmp(f, hi) > 0) return { ok: true, note: `Version ${f.join(".")} is newer than the tested ${range.max}. It may work, and the platform has not verified it.` };
  return { ok: true };
}

export function statusToFailure(c: Contract, status: number): FailureClass {
  const o = c.failures?.find((f) => f.status === status);
  if (o) return o.class;
  if (status === 401) return "AUTH";
  if (status === 403) return "PERMISSION";
  if (status === 409) return "CONFLICT";
  if (status === 429) return "QUOTA";
  if (status >= 500) return "NETWORK";
  return "INVALID";
}

// ------------------------------------------------------------------------------------------------ validation

export type Problem = { path: string; message: string };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const CHECK_KEYS = new Set(["path", "equals", "notEquals", "in", "matches", "exists", "gt", "gte", "lt", "lte"]);
const CHECK_OPS = ["equals", "notEquals", "in", "matches", "exists", "gt", "gte", "lt", "lte"];

/**
 * Everything a publisher must get right, as plain sentences. The Java side applies the same rules, and publishing is refused while any
 * problem remains. capabilities are the ids the manifest declares, with their level, so an action cannot do more than the manifest says.
 */
export function validateContract(c: unknown, capabilities: { id: string; level: string }[] = []): Problem[] {
  const out: Problem[] = [];
  const add = (path: string, message: string) => out.push({ path, message });
  if (!isObj(c)) return [{ path: "", message: "The contract must be an object." }];
  if (c.version !== "1") add("version", 'The contract version must be "1".');
  const known = new Set(["version", "timeoutSec", "pathPrefix", "via", "auth", "extraSecretHeaders", "test", "discover", "actions", "observe", "failures"]);
  for (const k of Object.keys(c)) if (!known.has(k)) add(k, `Unknown key ${k}.`);
  if (c.timeoutSec !== undefined && !(Number.isFinite(c.timeoutSec) && (c.timeoutSec as number) > 0 && (c.timeoutSec as number) <= CONTRACT_LIMITS.timeoutSec)) add("timeoutSec", `The timeout must be between 1 and ${CONTRACT_LIMITS.timeoutSec} seconds.`);
  if (c.pathPrefix !== undefined && !(typeof c.pathPrefix === "string" && /^\/[A-Za-z0-9._~\-\/]*$/.test(c.pathPrefix) && !c.pathPrefix.includes(".."))) add("pathPrefix", "The path prefix must start with / and use only letters, digits and . _ ~ - /.");

  const auth = c.auth;
  if (!isObj(auth) || !["none", "bearer", "basic", "header"].includes(String(auth.mode))) add("auth", "auth.mode must be none, bearer, basic or header.");
  else if (auth.mode === "header") {
    if (typeof auth.header !== "string" || !/^[A-Za-z][A-Za-z0-9-]{0,40}$/.test(auth.header)) add("auth.header", "Name the header that carries the key.");
    else if (RESERVED_HEADERS.has(auth.header.toLowerCase())) add("auth.header", `${auth.header} is set by the runtime and cannot be used here.`);
  }
  if (isObj(c.extraSecretHeaders)) for (const [h, v] of Object.entries(c.extraSecretHeaders)) {
    if (!/^[A-Za-z][A-Za-z0-9-]{0,40}$/.test(h) || RESERVED_HEADERS.has(h.toLowerCase())) add(`extraSecretHeaders.${h}`, "That header name cannot be used.");
    if (!isObj(v) || typeof v.option !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(v.option)) add(`extraSecretHeaders.${h}`, "Name the connection option that holds the secret reference.");
  }

  const request = (path: string, r: unknown, allowBody = true) => {
    if (!isObj(r)) return add(path, "A request is required.");
    if (!METHODS.includes(r.method as Method)) add(`${path}.method`, `The method must be one of ${METHODS.join(", ")}.`);
    const p = r.path;
    if (typeof p !== "string" || !p.startsWith("/") || p.startsWith("//") || p.length > CONTRACT_LIMITS.pathChars) add(`${path}.path`, "The path must start with a single / and be at most 400 characters. A request can only go to the connection's own address.");
    else if (/:\/\/|\.\.|\\|\s|#|\?/.test(p.replace(EXPR, ""))) add(`${path}.path`, "The path may not contain a scheme, .., a backslash, spaces, # or ?. Put query values in query.");
    if (typeof p === "string") templates(`${path}.path`, p);
    if (r.query !== undefined) { if (!isObj(r.query)) add(`${path}.query`, "query must be an object."); else for (const [k, v] of Object.entries(r.query)) { if (typeof v !== "string") add(`${path}.query.${k}`, "Query values are text."); else templates(`${path}.query.${k}`, v); } }
    if (r.headers !== undefined) {
      if (!isObj(r.headers)) add(`${path}.headers`, "headers must be an object.");
      else for (const [k, v] of Object.entries(r.headers)) {
        if (!/^[A-Za-z][A-Za-z0-9-]{0,60}$/.test(k)) add(`${path}.headers.${k}`, "Not a valid header name.");
        else if (RESERVED_HEADERS.has(k.toLowerCase())) add(`${path}.headers.${k}`, `${k} is set by the runtime and cannot be set here. The credential is added from the connection's secret reference.`);
        if (typeof v !== "string") add(`${path}.headers.${k}`, "Header values are text."); else templates(`${path}.headers.${k}`, v);
      }
    }
    if (r.body !== undefined) {
      if (r.method === "GET" || r.method === "HEAD") add(`${path}.body`, "A GET or HEAD request has no body.");
      else if (!allowBody) add(`${path}.body`, "This request does not take a body.");
      const s = JSON.stringify(r.body);
      if (s.length > CONTRACT_LIMITS.bodyBytes) add(`${path}.body`, "The body template is larger than 16 KB.");
      walk(r.body, (str) => templates(`${path}.body`, str));
    }
    if (r.contentType !== undefined && !/^[a-z]+\/[a-z0-9.+-]+(;.*)?$/i.test(String(r.contentType))) add(`${path}.contentType`, "Not a valid content type.");
  };
  const walk = (v: unknown, f: (s: string) => void) => { if (typeof v === "string") f(v); else if (Array.isArray(v)) v.forEach((x) => walk(x, f)); else if (isObj(v)) Object.values(v).forEach((x) => walk(x, f)); };
  let declared: Set<string> | null = null;
  const templates = (path: string, s: string) => {
    if (s.length > CONTRACT_LIMITS.templateChars) add(path, "A template is longer than 2000 characters.");
    for (const m of s.matchAll(EXPR)) {
      const { path: p, filters } = parseExpr(m[1]);
      const ns = p.split(".")[0];
      if (declared && ns === "params" && !declared.has(p.split(".")[1] ?? "")) add(path, `{{${p}}} reads a parameter the action does not declare. Add it to params.`);
      if (!NAMESPACES.includes(ns)) add(path, `{{${p}}} reads ${ns}, which is not available. Use ${NAMESPACES.join(", ")}.`);
      if (/secret|credential|token|password/i.test(p)) add(path, `{{${p}}} would read a credential. Templates cannot read secrets. The runtime adds the credential for you.`);
      for (const f of filters) if (!FILTERS.has(f.name)) add(path, `The filter ${f.name} does not exist.`);
    }
    if (/\{\{[^}]*$|^[^{]*\}\}/.test(s.replace(EXPR, ""))) add(path, "A {{ is not closed.");
  };
  const checks = (path: string, cs: unknown) => {
    if (cs === undefined) return;
    if (!Array.isArray(cs) || cs.length > CONTRACT_LIMITS.checks) return add(path, `Use a list of at most ${CONTRACT_LIMITS.checks} checks.`);
    cs.forEach((ch, i) => {
      if (!isObj(ch) || typeof ch.path !== "string" || !ch.path.startsWith("$")) return add(`${path}[${i}]`, "A check needs a path that starts with $.");
      for (const k of Object.keys(ch)) if (!CHECK_KEYS.has(k)) add(`${path}[${i}]`, `Unknown check key ${k}.`);
      if (CHECK_OPS.filter((o) => ch[o] !== undefined).length !== 1) add(`${path}[${i}]`, "Use exactly one of equals, notEquals, in, matches, exists, gt, gte, lt, lte.");
      if (typeof ch.matches === "string") { try { new RegExp(ch.matches); } catch { add(`${path}[${i}].matches`, "Not a valid regular expression."); } }
    });
  };
  const expect = (path: string, e: unknown) => {
    if (e === undefined) return;
    if (!isObj(e)) return add(path, "expect must be an object.");
    if (e.status !== undefined && !(Array.isArray(e.status) && e.status.length > 0 && e.status.every((s) => Number.isInteger(s) && s >= 100 && s < 600))) add(`${path}.status`, "status must be a list of HTTP status codes.");
    checks(`${path}.json`, e.json);
  };
  const example = (path: string, e: unknown) => {
    if (e === undefined) return;
    if (!isObj(e) || !Number.isInteger(e.status) || (e.status as number) < 100 || (e.status as number) > 599) return add(path, "An example needs a status and, optionally, a json answer.");
    if (JSON.stringify(e.json ?? null).length > CONTRACT_LIMITS.bodyBytes) add(path, "An example answer is larger than 16 KB.");
  };
  const paths = (path: string, m: unknown) => { if (m === undefined) return; if (!isObj(m)) return add(path, "Use an object of name to path."); for (const [k, v] of Object.entries(m)) if (typeof v !== "string" || !v.startsWith("$")) add(`${path}.${k}`, "A mapping value is a path that starts with $."); };

  if (!Array.isArray(c.test) || c.test.length === 0) add("test", "Provide at least one test check, so a connection can be verified before it is used.");
  else {
    if (c.test.length > CONTRACT_LIMITS.tests) add("test", `At most ${CONTRACT_LIMITS.tests} test checks.`);
    c.test.forEach((t, i) => {
      const p = `test[${i}]`;
      if (!isObj(t) || typeof t.name !== "string" || !t.name.trim()) return add(p, "A test check needs a name.");
      request(`${p}.request`, t.request, !!t.requiresWrite);
      if (isObj(t.request) && t.request.method !== "GET" && t.request.method !== "HEAD" && !t.requiresWrite) add(`${p}.request`, "Test checks only read. Use GET or HEAD, or mark a permission probe with requiresWrite.");
      expect(`${p}.expect`, t.expect);
      example(`${p}.example`, t.example);
      if (t.onFail !== undefined && !FAILURE_CLASSES.includes(t.onFail as FailureClass)) add(`${p}.onFail`, "Unknown failure class.");
      if (t.version !== undefined && (typeof t.version !== "string" || !t.version.startsWith("$"))) add(`${p}.version`, "A path that starts with $.");
    });
  }

  if (c.discover !== undefined) {
    if (!Array.isArray(c.discover) || c.discover.length > CONTRACT_LIMITS.discover) add("discover", `Use a list of at most ${CONTRACT_LIMITS.discover} kinds.`);
    else c.discover.forEach((d, i) => {
      const p = `discover[${i}]`;
      if (!isObj(d) || typeof d.kind !== "string" || !ACTION_NAME.test(d.kind)) return add(p, "Name the kind in lowercase, for example namespaces.");
      request(`${p}.request`, d.request, true);
      if (isObj(d.request) && d.request.method !== "GET" && d.request.method !== "POST") add(`${p}.request`, "Discovery reads only. Use GET, or POST for search endpoints that take a query body.");
      for (const k of ["items", "name"]) if (typeof d[k] !== "string" || !(d[k] as string).startsWith("$")) add(`${p}.${k}`, `${k} is a path that starts with $.`);
      paths(`${p}.attributes`, d.attributes);
      example(`${p}.example`, d.example);
    });
  }

  const caps = new Map(capabilities.map((x) => [x.id, x.level]));
  if (c.actions !== undefined) {
    if (!isObj(c.actions) || Object.keys(c.actions).length > CONTRACT_LIMITS.actions) add("actions", `Use an object of at most ${CONTRACT_LIMITS.actions} actions.`);
    else for (const [name, a] of Object.entries(c.actions)) {
      const p = `actions.${name}`;
      if (!ACTION_NAME.test(name)) { add(p, "Name the action in lowercase letters, digits and dashes."); continue; }
      if (!isObj(a)) { add(p, "An action must be an object."); continue; }
      if (typeof a.description !== "string" || a.description.trim().length < 5) add(`${p}.description`, "Describe what the action does in a sentence.");
      if (a.mode !== "read" && a.mode !== "write") add(`${p}.mode`, "mode is read or write.");
      const want = OPERATOR_ACTIONS[name];
      if (want && a.mode !== want.mode) add(`${p}.mode`, `The action ${name} is called by an operator as a ${want.mode} action.`);
      if (typeof a.capability !== "string") add(`${p}.capability`, "Name the capability this action belongs to.");
      else if (!caps.has(a.capability)) add(`${p}.capability`, `The manifest does not declare the capability ${a.capability}, so the action would do more than the manifest says.`);
      else if (caps.get(a.capability) === "none") add(`${p}.capability`, `The manifest declares ${a.capability} as not supported.`);
      declared = new Set(Array.isArray(a.params) ? a.params.filter((x) => isObj(x) && typeof x.name === "string").map((x) => (x as { name: string }).name) : []);
      if (Array.isArray(a.params)) {
        if (a.params.length > CONTRACT_LIMITS.params) add(`${p}.params`, `At most ${CONTRACT_LIMITS.params} parameters.`);
        a.params.forEach((pd, i) => { if (!isObj(pd) || typeof pd.name !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(pd.name) || !["string", "number", "boolean", "object", "array"].includes(String(pd.type))) add(`${p}.params[${i}]`, "A parameter needs a name and a type."); });
      }
      if (!Array.isArray(a.steps) || a.steps.length === 0 || a.steps.length > CONTRACT_LIMITS.steps) add(`${p}.steps`, `Provide between 1 and ${CONTRACT_LIMITS.steps} steps.`);
      else a.steps.forEach((s, i) => {
        const sp = `${p}.steps[${i}]`;
        if (!isObj(s) || typeof s.name !== "string") return add(sp, "A step needs a name.");
        request(`${sp}.request`, s.request);
        if (a.mode === "read" && isObj(s.request) && s.request.method !== "GET" && s.request.method !== "POST" && s.request.method !== "HEAD") add(`${sp}.request`, "A read action may only use GET, HEAD or POST (for query endpoints).");
        expect(`${sp}.expect`, s.expect);
        paths(`${sp}.capture`, s.capture);
        example(`${sp}.example`, s.example);
        checks(`${sp}.when`, s.when);
      });
      if (a.mode === "write") {
        if (!Array.isArray(a.plan) || a.plan.length === 0 || a.plan.length > CONTRACT_LIMITS.planSteps) add(`${p}.plan`, "A write action describes what it will do before it does it. List the plan steps.");
        else a.plan.forEach((ps, i) => {
          if (!isObj(ps) || typeof ps.action !== "string" || typeof ps.summary !== "string" || !isObj(ps.target) || typeof ps.target.kind !== "string" || typeof ps.target.name !== "string" || !["low", "medium", "high"].includes(String(ps.risk))) add(`${p}.plan[${i}]`, "A plan step needs action, target (kind and name), summary and risk (low, medium or high).");
          else { templates(`${p}.plan[${i}].summary`, ps.summary); templates(`${p}.plan[${i}].target.name`, ps.target.name); }
        });
      }
      paths(`${p}.result`, a.result);
      declared = null;
    }
  }
  if (c.observe !== undefined) {
    const o = c.observe;
    if (!isObj(o)) add("observe", "observe must be an object.");
    else {
      request("observe.request", o.request, false);
      if (!isObj(o.state) || !Array.isArray(o.state.ready) || o.state.ready.length === 0) add("observe.state.ready", "Say what makes the thing ready.");
      else { checks("observe.state.ready", o.state.ready); checks("observe.state.degraded", o.state.degraded); checks("observe.state.failed", o.state.failed); }
      paths("observe.attributes", o.attributes);
      example("observe.example", o.example);
    }
  }
  if (c.failures !== undefined && (!Array.isArray(c.failures) || c.failures.some((f) => !isObj(f) || !Number.isInteger(f.status) || !FAILURE_CLASSES.includes(f.class as FailureClass)))) add("failures", "Each entry needs a status and a failure class.");

  // a write action needs a capability that changes something, which the manifest must already admit to
  return out;
}

// ------------------------------------------------------------------------------------------------ preview (reference runtime)

export type Transport = (req: RenderedRequest) => { status: number; json?: unknown } | Promise<{ status: number; json?: unknown }>;
export type CheckResult = { name: string; ok: boolean; detail: string; request: RenderedRequest; failure?: FailureClass };

/** Runs the test checks through any transport. The console uses it with sample responses, and the fixtures use it to hold the Java runtime to the same behaviour. */
export async function runTest(c: Contract, scope: Scope, send: Transport, opts: { full: boolean; readWrite: boolean }): Promise<{ ok: boolean; failure?: FailureClass; checks: CheckResult[]; version?: string }> {
  const results: CheckResult[] = [];
  let version: string | undefined;
  for (const t of c.test) {
    if ((t.scope ?? "connectivity") === "full" && !opts.full) continue;
    if (t.requiresWrite && !opts.readWrite) continue;
    let req: RenderedRequest;
    try { req = renderRequest(c, t.request, scope); } catch (e) { results.push({ name: t.name, ok: false, detail: (e as Error).message, request: { method: t.request.method, url: "", headers: {} }, failure: "INVALID" }); return { ok: false, failure: "INVALID", checks: results }; }
    const res = await send(req);
    const wantStatus = t.expect?.status ?? [200];
    let ok = wantStatus.includes(res.status), detail = ok ? "Answered." : `Answered with status ${res.status}.`;
    let failure: FailureClass | undefined = ok ? undefined : (t.onFail ?? statusToFailure(c, res.status));
    if (ok && t.expect?.json) for (const ch of t.expect.json) if (!checkHolds(res.json, ch)) { ok = false; detail = `The answer does not match: ${ch.path}.`; failure = t.onFail ?? "INVALID"; break; }
    if (ok && t.version) {
      const found = readPath(res.json, t.version);
      version = found === undefined ? version : String(found);
      const vr = versionInRange(version, t.versionRange);
      if (!vr.ok) { ok = false; detail = vr.note ?? "Unsupported version."; failure = t.onFail ?? "VERSION"; } else if (vr.note) detail = vr.note;
    }
    results.push({ name: t.name, ok, detail, request: req, failure });
    if (!ok) return { ok: false, failure, checks: results, version };
  }
  return { ok: true, checks: results, version };
}

export function emptyContract(): Contract {
  return { version: "1", auth: { mode: "bearer" }, test: [{ name: "Reach the server", request: { method: "GET", path: "/health" }, expect: { status: [200] } }] };
}


// ------------------------------------------------------------------------------------------------ discovery, actions, observation

export type Discovered = { kind: string; name: string; namespace?: string; attributes: Record<string, unknown> };

export async function runDiscover(c: Contract, scope: Scope, kind: string, send: Transport): Promise<{ ok: boolean; failure?: FailureClass; items: Discovered[]; request?: RenderedRequest; detail?: string }> {
  const d = c.discover?.find((x) => x.kind === kind);
  if (!d) return { ok: false, failure: "UNSUPPORTED", items: [], detail: `This connector does not discover ${kind}.` };
  const request = renderRequest(c, d.request, scope);
  const res = await send(request);
  if (res.status < 200 || res.status > 299) return { ok: false, failure: statusToFailure(c, res.status), items: [], request, detail: `Answered with status ${res.status}.` };
  const list = readPath(res.json, d.items);
  if (!Array.isArray(list)) return { ok: false, failure: "INVALID", items: [], request, detail: `${d.items} is not a list in the answer.` };
  const items = list.slice(0, d.limit ?? 200).flatMap((it): Discovered[] => {
    const name = readPath(it, d.name);
    if (name === undefined) return [];
    const ns = d.namespace ? readPath(it, d.namespace) : undefined;
    return [{ kind, name: String(name), namespace: ns === undefined ? undefined : String(ns), attributes: Object.fromEntries(Object.entries(d.attributes ?? {}).map(([k, p]) => [k, readPath(it, p)]).filter(([, v]) => v !== undefined)) }];
  });
  return { ok: true, items, request };
}

/**
 * What an action receives: only the parameters it declares, with defaults applied and types checked. A template can read nothing else,
 * so a caller cannot smuggle a value into a request through a parameter the contract never named.
 */
export function resolveParams(a: ActionDef, given: Record<string, unknown>): { params: Record<string, unknown> } | { error: string } {
  const params: Record<string, unknown> = {};
  for (const pd of a.params ?? []) {
    let v = given[pd.name];
    if (v === undefined || v === null || v === "") v = pd.default;
    if (v === undefined || v === null || v === "") { if (pd.required) return { error: `The parameter ${pd.name} is required.` }; continue; }
    switch (pd.type) {
      case "string": if (typeof v === "object") return { error: `The parameter ${pd.name} must be text.` }; v = String(v); break;
      case "number": { const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN; if (!Number.isFinite(n)) return { error: `The parameter ${pd.name} must be a number.` }; v = n; break; }
      case "boolean": if (v === "true") v = true; else if (v === "false") v = false; else if (typeof v !== "boolean") return { error: `The parameter ${pd.name} must be true or false.` }; break;
      case "object": if (!v || typeof v !== "object" || Array.isArray(v)) return { error: `The parameter ${pd.name} must be an object.` }; break;
      case "array": if (!Array.isArray(v)) return { error: `The parameter ${pd.name} must be a list.` }; break;
    }
    if (pd.enum && !pd.enum.includes(String(v))) return { error: `The parameter ${pd.name} must be one of ${pd.enum.join(", ")}.` };
    params[pd.name] = v;
  }
  return { params };
}

export type PlanOut = { action: string; steps: { action: string; target: { kind: string; namespace?: string; name: string }; summary: string; risk: "low" | "medium" | "high" }[]; digest: string };

/** A plan is what the action will do, written before it does it. The digest binds an approval to exactly this plan and these parameters. */
export function planAction(c: Contract, name: string, scope: Scope): PlanOut | { error: string } {
  const a = c.actions?.[name];
  if (!a) return { error: `This connector has no action ${name}.` };
  const r = resolveParams(a, scope.params);
  if ("error" in r) return { error: r.error };
  const params = r.params;
  const sc = { ...scope, params };
  try {
    const steps = (a.plan ?? []).map((s) => ({ action: s.action, target: { kind: s.target.kind, namespace: s.target.namespace === undefined ? undefined : renderString(s.target.namespace, sc), name: renderString(s.target.name, sc) }, summary: renderString(s.summary, sc), risk: s.risk }));
    return { action: name, steps, digest: digestOf({ name, steps, params }) };
  } catch (e) { return { error: (e as Error).message }; }
}

/** A small stable hash for previews. The server uses SHA-256 over the same canonical text. */
export function digestOf(v: unknown): string {
  const canon = (x: unknown): string => (Array.isArray(x) ? `[${x.map(canon).join(",")}]` : x && typeof x === "object" ? `{${Object.keys(x as object).sort().map((k) => JSON.stringify(k) + ":" + canon((x as Record<string, unknown>)[k])).join(",")}}` : JSON.stringify(x) ?? "null");
  let h = 0x811c9dc5; const t = canon(v);
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

export async function runAction(c: Contract, name: string, scope: Scope, send: Transport): Promise<{ ok: boolean; failure?: FailureClass; steps: { name: string; request?: RenderedRequest; status?: number; skipped?: boolean; detail: string }[]; result: Record<string, unknown> }> {
  const a = c.actions?.[name];
  if (!a) return { ok: false, failure: "UNSUPPORTED", steps: [], result: {} };
  const rp = resolveParams(a, scope.params);
  if ("error" in rp) return { ok: false, failure: "INVALID", steps: [{ name: "Parameters", detail: rp.error }], result: {} };
  scope = { ...scope, params: rp.params };
  const capture: Record<string, unknown> = { ...scope.capture };
  const out: { name: string; request?: RenderedRequest; status?: number; skipped?: boolean; detail: string }[] = [];
  let last: unknown;
  for (const st of a.steps) {
    if (st.when && !allHold(last, st.when)) { out.push({ name: st.name, skipped: true, detail: "Skipped because its condition did not hold." }); continue; }
    let request: RenderedRequest;
    try { request = renderRequest(c, st.request, { ...scope, capture }); } catch (e) { out.push({ name: st.name, detail: (e as Error).message }); return { ok: false, failure: "INVALID", steps: out, result: {} }; }
    const res = await send(request);
    last = res.json;
    const want = st.expect?.status ?? [200, 201, 202, 204];
    let good = want.includes(res.status);
    let detail = good ? "Done." : `Answered with status ${res.status}.`;
    if (good && st.expect?.json) for (const ch of st.expect.json) if (!checkHolds(res.json, ch)) { good = false; detail = `The answer does not match: ${ch.path}.`; break; }
    out.push({ name: st.name, request, status: res.status, detail });
    if (!good) return { ok: false, failure: statusToFailure(c, res.status), steps: out, result: {} };
    for (const [k, p] of Object.entries(st.capture ?? {})) { const v = readPath(res.json, p); if (v !== undefined) capture[k] = v; }
  }
  return { ok: true, steps: out, result: Object.fromEntries(Object.entries(a.result ?? {}).map(([k, p]) => [k, readPath(last, p)]).filter(([, v]) => v !== undefined)) };
}

export type ObservedState = "ready" | "degraded" | "failed" | "progressing" | "absent";
export async function runObserve(c: Contract, scope: Scope, send: Transport): Promise<{ state: ObservedState; attributes: Record<string, unknown>; failure?: FailureClass; desired?: number; ready?: number }> {
  const o = c.observe;
  if (!o) return { state: "absent", attributes: {}, failure: "UNSUPPORTED" };
  const res = await send(renderRequest(c, o.request, scope));
  if (o.absentOn?.includes(res.status)) return { state: "absent", attributes: {} };
  if (res.status < 200 || res.status > 299) return { state: "failed", attributes: {}, failure: statusToFailure(c, res.status) };
  const state: ObservedState = allHold(res.json, o.state.failed?.length ? o.state.failed : undefined) && o.state.failed?.length ? "failed" : allHold(res.json, o.state.ready) ? "ready" : o.state.degraded?.length && allHold(res.json, o.state.degraded) ? "degraded" : "progressing";
  const count = (p: string | undefined) => { const n = p ? toNum(readPath(res.json, p)) : undefined; return n === undefined ? undefined : n; };
  return { state, attributes: Object.fromEntries(Object.entries(o.attributes ?? {}).map(([k, p]) => [k, readPath(res.json, p)]).filter(([, v]) => v !== undefined)), desired: count(o.desired), ready: count(o.ready) };
}

/** A transport that answers from the examples written in the contract. It matches on method and path, so the same contract can be tried before any system is connected. */
export function exampleTransport(c: Contract, scope: Scope): Transport {
  const table: { method: string; re: RegExp; query: string; ex: Example }[] = [];
  const add = (r: HttpRequest | undefined, ex: Example | undefined) => {
    if (!r || !ex) return;
    let url: string;
    try { url = renderRequest(c, r, scope, true).url; } catch { return; }
    const pathOnly = url.replace(/\?.*$/, "");
    const re = new RegExp("^" + pathOnly.split(/<[^>]+>/).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^/]+") + "$");
    table.push({ method: r.method, re, query: url.includes("?") ? url.slice(url.indexOf("?") + 1) : "", ex });
  };
  c.test.forEach((t) => add(t.request, t.example));
  c.discover?.forEach((d) => add(d.request, d.example));
  Object.values(c.actions ?? {}).forEach((a) => a.steps.forEach((s) => add(s.request, s.example)));
  add(c.observe?.request, c.observe?.example);
  return (req) => {
    const pathOnly = req.url.replace(/\?.*$/, "");
    const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?") + 1) : "";
    const same = table.filter((t) => t.method === req.method && t.re.test(pathOnly));
    const hit = same.find((t) => t.query === query) ?? same[0];
    return hit ? { status: hit.ex.status, json: hit.ex.json } : { status: 404, json: { message: "No example is written for this request." } };
  };
}
