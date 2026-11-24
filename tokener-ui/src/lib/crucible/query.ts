import type { Run } from "./types";

/**
 * Run search with the same filter syntax people know from MLflow: `metrics.f1_macro > 0.93 and params.lr < 0.00003`.
 * Fields: metrics.x, params.x, tags.x, attributes.x (status, name, owner, start_time) or a bare name. Operators: = != > >= < <= like ilike in.
 * Joined with and, or and parentheses.
 */
type Tok = { t: "id" | "num" | "str" | "op" | "kw" | "lp" | "rp" | "comma"; v: string; at: number };
export type Pred = (r: Run) => boolean;
export type Parsed = { ok: true; test: Pred } | { ok: false; error: string; at: number };

const KW = new Set(["and", "or", "like", "ilike", "in", "not", "true", "false"]);
function lex(src: string): Tok[] | { error: string; at: number } {
  const out: Tok[] = []; let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "(") { out.push({ t: "lp", v: c, at: i++ }); continue; }
    if (c === ")") { out.push({ t: "rp", v: c, at: i++ }); continue; }
    if (c === ",") { out.push({ t: "comma", v: c, at: i++ }); continue; }
    if (c === "'" || c === '"') { const s = i; i++; let v = ""; while (i < src.length && src[i] !== c) v += src[i++]; if (i >= src.length) return { error: "A quoted value is not closed.", at: s }; i++; out.push({ t: "str", v, at: s }); continue; }
    const two = src.slice(i, i + 2);
    if (["!=", ">=", "<=", "=="].includes(two)) { out.push({ t: "op", v: two === "==" ? "=" : two, at: i }); i += 2; continue; }
    if ("=<>".includes(c)) { out.push({ t: "op", v: c, at: i++ }); continue; }
    const m = /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
    if (m && (c !== "-" || !/[\w.]/.test(src[i - 1] ?? " "))) { out.push({ t: "num", v: m[0], at: i }); i += m[0].length; continue; }
    const w = /^[A-Za-z_][\w.\-/]*/.exec(src.slice(i));
    if (w) { const low = w[0].toLowerCase(); out.push({ t: KW.has(low) ? "kw" : "id", v: KW.has(low) ? low : w[0], at: i }); i += w[0].length; continue; }
    return { error: `Unexpected "${c}".`, at: i };
  }
  return out;
}

const value = (r: Run, field: string): string | number | boolean | undefined => {
  const [head, ...rest] = field.split("."); const key = rest.join(".");
  if (head === "metrics" && key) return r.metrics[key];
  if (head === "params" && key) return r.params[key];
  if (head === "tags" && key) return r.tags[key];
  const attr = head === "attributes" || head === "attribute" ? key : field;
  switch (attr) {
    case "status": return r.status; case "name": case "run_name": return r.name; case "owner": case "user": return r.owner; case "id": case "run_id": return r.id;
    case "start_time": return Date.parse(r.startedAt); case "gpu_hours": return r.gpuHours; case "cost": case "cost_usd": return r.costUsd;
    case "dataset": return `${r.dataset.name}`; case "dataset_version": return r.dataset.version; case "commit": return r.code.commit;
    default: return undefined;
  }
};
const like = (v: string, pat: string, ci: boolean) => new RegExp("^" + pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".") + "$", ci ? "i" : "").test(v);

export function parseQuery(src: string): Parsed {
  if (!src.trim()) return { ok: true, test: () => true };
  const toks = lex(src); if (!Array.isArray(toks)) return { ok: false, ...toks };
  let p = 0; const peek = () => toks[p]; const end = src.length;
  const fail = (error: string, at = peek()?.at ?? end): never => { throw { error, at }; };
  const or = (): Pred => { let l = and(); while (peek()?.t === "kw" && peek().v === "or") { p++; const a = l, b = and(); l = (r) => a(r) || b(r); } return l; };
  const and = (): Pred => { let l = atom(); while (peek()?.t === "kw" && peek().v === "and") { p++; const a = l, b = atom(); l = (r) => a(r) && b(r); } return l; };
  const literal = (): string | number | boolean => {
    const t = toks[p++]; if (!t) return fail("A value is missing at the end.");
    if (t.t === "num") return Number(t.v); if (t.t === "str") return t.v; if (t.t === "kw" && (t.v === "true" || t.v === "false")) return t.v === "true";
    if (t.t === "id") return t.v; return fail(`Expected a value, found "${t.v}".`, t.at);
  };
  const atom = (): Pred => {
    const t = peek(); if (!t) return fail("The filter ends too early.");
    if (t.t === "lp") { p++; const e = or(); if (peek()?.t !== "rp") fail("A closing bracket is missing."); p++; return e; }
    if (t.t !== "id") return fail(`Expected a field such as metrics.f1_macro, found "${t.v}".`, t.at);
    p++; const field = t.v; let neg = false; let o = peek();
    if (o?.t === "kw" && o.v === "not") { neg = true; p++; o = peek(); }
    if (!o || (o.t !== "op" && !(o.t === "kw" && ["like", "ilike", "in"].includes(o.v)))) return fail(`Expected an operator after ${field}.`, o?.at ?? end);
    p++; const op = o.v;
    if (op === "in") {
      if (peek()?.t !== "lp") fail("Write the list in brackets, for example in ('a', 'b')."); p++; const list: (string | number | boolean)[] = [];
      for (;;) { list.push(literal()); if (peek()?.t === "comma") { p++; continue; } break; }
      if (peek()?.t !== "rp") fail("The list is missing a closing bracket."); p++;
      return (r) => { const v = value(r, field); const hit = v !== undefined && list.some((x) => String(x) === String(v)); return neg ? !hit : hit; };
    }
    const rhs = literal();
    return (r) => {
      const v = value(r, field); if (v === undefined) return false; let res: boolean;
      if (op === "like" || op === "ilike") res = like(String(v), String(rhs), op === "ilike");
      else {
        const a = typeof rhs === "number" ? Number(v) : String(v), b = typeof rhs === "number" ? rhs : String(rhs);
        if (typeof a === "number" && Number.isNaN(a)) return false;
        res = op === "=" ? a === b : op === "!=" ? a !== b : op === ">" ? a > b : op === ">=" ? a >= b : op === "<" ? a < b : a <= b;
      }
      return neg ? !res : res;
    };
  };
  try { const f = or(); if (p < toks.length) fail(`Unexpected "${toks[p].v}".`); return { ok: true, test: f }; } catch (e) { const x = e as { error?: string; at?: number }; if (x.error) return { ok: false, error: x.error, at: x.at ?? 0 }; throw e; }
}

export const QUERY_EXAMPLES = ["metrics.f1_macro > 0.93", "params.lr < 0.00003 and status = 'finished'", "tags.trigger = 'continuous' or owner like 'priya%'", "dataset_version in (16, 17) and metrics.val_loss < 0.25"];
