/**
 * Agent Mesh: a named group of agents that work one business use case together. A mesh says who takes part and in which role, which agent may hand work to which and when,
 * what they share, and the limits a case must stay inside. This file is the whole model: checking a mesh, building one from a pattern, running a sample case through it, and
 * judging it against its objectives. It is pure, so the page and the checks use the same code.
 *
 * Runs here are simulated from each agent's recorded figures. A real mesh runtime would take the same handoff rules and guardrails and enforce them at the gateway.
 */
import type { Agent } from "./types";
import { totals } from "./store-math";
import { pathOf, type AgentNetwork, type NetworkConfig } from "./network";

export type MeshPattern = "supervisor" | "pipeline" | "router" | "review" | "swarm";
export type MeshRole = "intake" | "coordinator" | "specialist" | "reviewer" | "executor";
export type MeshStatus = "draft" | "live" | "paused";

export const PATTERNS: { id: MeshPattern; label: string; blurb: string; best: string }[] = [
  { id: "pipeline", label: "Pipeline", blurb: "Each agent does its part and hands the case to the next, in order.", best: "Steps that always happen in the same order, such as intake, check, decide." },
  { id: "supervisor", label: "Supervisor", blurb: "One coordinator hands parts of the case to specialists and takes each result back.", best: "Cases that need several different skills and one owner of the outcome." },
  { id: "router", label: "Router", blurb: "The first agent reads the case and sends it to the one specialist that fits.", best: "A front door with many kinds of requests behind it." },
  { id: "review", label: "Maker and checker", blurb: "One agent does the work, another checks it, and a rejection sends it back.", best: "Work where a mistake is costly, such as money, contracts or code." },
  { id: "swarm", label: "Peers", blurb: "Agents of equal standing hand a case to whichever peer is best placed.", best: "Open ended research and problem solving, with a loop guard." },
];
export const ROLES: { id: MeshRole; label: string; blurb: string }[] = [
  { id: "intake", label: "Intake", blurb: "Takes the case in and checks it is complete." },
  { id: "coordinator", label: "Coordinator", blurb: "Decides who works the case next and owns the outcome." },
  { id: "specialist", label: "Specialist", blurb: "Does one kind of work well." },
  { id: "reviewer", label: "Reviewer", blurb: "Checks another agent's work and can send it back." },
  { id: "executor", label: "Executor", blurb: "Takes the action that changes something outside, such as a payout. A person can decide first." },
];
export const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.id, r.label])) as Record<MeshRole, string>;

export type Member = { agentId: string; role: MeshRole; duty: string };
/** when: "always", a case tag ("missing-docs"), "!tag" for its absence, "ran:agentId" and "!ran:agentId" for whether that agent has already worked the case. Join with "&" for all of them. */
/** clears: case tags that are settled by taking this handoff, such as the missing documents the customer has now sent. */
export type Handoff = { id: string; from: string; to: string; when: string; carry: Carry[]; clears?: string[] };
export type Carry = "case" | "summary" | "documents" | "decision" | "history";
export const CARRY_LABEL: Record<Carry, string> = { case: "The case", summary: "A summary", documents: "Documents", decision: "The decision so far", history: "The full history" };
export type Scenario = { id: string; title: string; subject: string; tags: string[]; share: number };
export type Mesh = {
  id: string; name: string; useCase: string; industry: string; goal: string; pattern: MeshPattern; status: MeshStatus;
  trigger: { kind: "api" | "event" | "schedule" | "person"; label: string };
  members: Member[]; handoffs: Handoff[]; scenarios: Scenario[];
  context: { sharing: "case" | "summary" | "none"; memory: "case" | "session" | "none"; pii: "mask" | "keep" };
  guardrails: { maxHops: number; maxCostUsd: number; maxMinutes: number; loopGuard: boolean; maxVisits: number; personBefore: string[]; escalate: string[] };
  slo: { successPct: number; p95Min: number; costPerCaseUsd: number };
  owner: string; createdAt: string;
};

export type Issue = { path: string; message: string; level: "error" | "warning" };
const tagOf = (w: string) => w.replace(/^!/, "");

export const entryOf = (m: Pick<Mesh, "members">): string | undefined => (m.members.find((x) => x.role === "intake") ?? m.members.find((x) => x.role === "coordinator") ?? m.members[0])?.agentId;
export const out = (m: Pick<Mesh, "handoffs">, id: string) => m.handoffs.filter((h) => h.from === id);

export function describeWhen(w: string, titleOf: (id: string) => string = (x) => x): string {
  if (!w || w === "always") return "Always";
  return w.split("&").map((p) => { const neg = p.startsWith("!"); const t = tagOf(p); return t.startsWith("ran:") ? `${titleOf(t.slice(4))} ${neg ? "has not worked it yet" : "has worked it"}` : neg ? `not ${t.replace(/-/g, " ")}` : t.replace(/-/g, " "); }).join(", and ");
}
export function whenTags(h: Pick<Handoff, "when">): string[] { return h.when.split("&").map(tagOf).filter((t) => t && t !== "always" && !t.startsWith("ran:")); }

// Building a mesh from a pattern

const hid = (a: string, b: string, n = "") => `hnd_${a}_${b}${n}`;
export function scaffold(pattern: MeshPattern, ids: string[], duties: Record<string, string> = {}): { members: Member[]; handoffs: Handoff[] } {
  const roles: MeshRole[] = ids.map((_, i) => pattern === "pipeline" ? (i === 0 ? "intake" : i === ids.length - 1 && ids.length > 2 ? "executor" : "specialist") : pattern === "supervisor" ? (i === 0 ? "coordinator" : "specialist")
    : pattern === "router" ? (i === 0 ? "coordinator" : "specialist") : pattern === "review" ? (i === ids.length - 1 && ids.length > 1 ? "reviewer" : i === 0 ? "intake" : "specialist") : i === 0 ? "intake" : "specialist");
  const members: Member[] = ids.map((id, i) => ({ agentId: id, role: roles[i], duty: duties[id] ?? "" }));
  const H: Handoff[] = [];
  const add = (from: string, to: string, when = "always", carry: Carry[] = ["case", "summary"], clears?: string[]) => H.push({ id: hid(from, to, when === "always" ? "" : "_" + H.length), from, to, when, carry, clears });
  if (pattern === "pipeline") for (let i = 0; i + 1 < ids.length; i++) add(ids[i], ids[i + 1]);
  else if (pattern === "supervisor") { const [c, ...rest] = ids; rest.forEach((s, i) => { add(c, s, `!ran:${s}` + (i ? "&" + `ran:${rest[i - 1]}` : "")); add(s, c, "always", ["summary", "decision"]); }); }
  else if (pattern === "router") { const [r, ...rest] = ids; rest.forEach((s, i) => add(r, s, i === rest.length - 1 ? "always" : `route-${s.replace(/^agt_/, "")}`)); }
  else if (pattern === "review") { const rev = ids[ids.length - 1]; const work = ids.slice(0, -1); for (let i = 0; i + 1 < work.length; i++) add(work[i], work[i + 1]); const last = work[work.length - 1]; if (last && last !== rev) { add(last, rev, "always", ["case", "decision"]); add(rev, last, "rejected", ["decision", "history"], ["rejected"]); } }
  else for (const a of ids) for (const b of ids) if (a !== b && ids.indexOf(a) < ids.indexOf(b)) { add(a, b, "always"); add(b, a, "needs-another-look", ["summary"], ["needs-another-look"]); }
  return { members, handoffs: H };
}

// Checking

export function validateMesh(m: Mesh, agents: Agent[], networks: AgentNetwork[], others: Mesh[] = []): Issue[] {
  const out_: Issue[] = []; const err = (path: string, message: string) => out_.push({ path, message, level: "error" }); const warn = (path: string, message: string) => out_.push({ path, message, level: "warning" });
  const by = new Map(agents.map((a) => [a.id, a])); const ids = new Set(m.members.map((x) => x.agentId)); const title = (id: string) => by.get(id)?.title ?? id;
  const name = m.name.trim();
  if (name.length < 2 || name.length > 48) err("name", "Name the mesh with 2 to 48 characters.");
  if (others.some((o) => o.id !== m.id && o.name.trim().toLowerCase() === name.toLowerCase())) err("name", `A mesh named ${name} already exists.`);
  if (!m.useCase.trim()) err("useCase", "Say what use case this mesh works.");
  if (!m.owner.trim()) err("owner", "Every mesh has an accountable owner.");
  if (m.members.length < 2) err("members", "A mesh needs at least two agents. One agent on its own is just an agent.");
  if (new Set(m.members.map((x) => x.agentId)).size !== m.members.length) err("members", "An agent can only be in a mesh once.");
  for (const x of m.members) {
    const a = by.get(x.agentId);
    if (!a) { err(`members.${x.agentId}`, "That agent does not exist."); continue; }
    if (a.state === "retired") err(`members.${x.agentId}`, `${a.title} is retired. Take it out of the mesh.`);
    else if (a.state === "suspended") warn(`members.${x.agentId}`, `${a.title} is suspended, so cases that reach it will wait.`);
    if (a.control !== "governed" && a.state !== "retired") warn(`members.${x.agentId}`, `tok∑ner does not run ${a.title}, so it cannot hold its calls, enforce its budget or stop a loop that goes through it.`);
    if (x.role === "executor" && a.state !== "retired" && !a.tools.some((t) => t.sensitive)) warn(`members.${x.agentId}`, `${a.title} is an executor but has no tool that changes anything outside. Check the role.`);
  }
  const entry = entryOf(m); const entries = m.members.filter((x) => x.role === "intake").length;
  if (entries > 1) err("members", "Only one agent takes the case in. Make the others specialists.");
  if (m.pattern === "supervisor" && m.members.filter((x) => x.role === "coordinator").length !== 1) err("members", "A supervisor mesh has exactly one coordinator.");
  if (m.pattern === "router" && out(m, entry ?? "").length < 2) err("handoffs", "A router sends to at least two agents. Add the others it can route to.");
  if (m.pattern === "review" && !m.members.some((x) => x.role === "reviewer")) err("members", "A maker and checker mesh needs a reviewer.");
  if (m.pattern === "pipeline") for (const x of m.members) if (out(m, x.agentId).filter((h) => !m.handoffs.some((g) => g.from === h.to && g.to === h.from)).length > 1) { err("handoffs", `${title(x.agentId)} hands to more than one agent. A pipeline is a line. Use a router if the next agent depends on the case.`); break; }

  const seen = new Set<string>();
  for (const h of m.handoffs) {
    const key = `${h.from}>${h.to}>${h.when}`; if (seen.has(key)) err(`handoffs.${h.id}`, `${title(h.from)} to ${title(h.to)} is listed twice for the same condition.`); seen.add(key);
    if (!ids.has(h.from) || !ids.has(h.to)) { err(`handoffs.${h.id}`, "A handoff names an agent that is not in the mesh."); continue; }
    if (h.from === h.to) { err(`handoffs.${h.id}`, `${title(h.from)} cannot hand a case to itself.`); continue; }
    if (!h.carry.length) warn(`handoffs.${h.id}`, `${title(h.from)} hands over nothing to ${title(h.to)}. It will start with an empty case.`);
    const cfgs: Record<string, NetworkConfig | undefined> = Object.fromEntries(agents.map((a) => [a.id, a.network]));
    const p = pathOf({ id: h.id, from: h.from, to: h.to }, cfgs, networks);
    if (p.state === "blocked") err(`handoffs.${h.id}`, `${title(h.from)} cannot reach ${title(h.to)}: ${p.detail} Peer their networks or put them in the same one.`);
    else if (p.state === "open") warn(`handoffs.${h.id}`, `The path from ${title(h.from)} to ${title(h.to)} crosses no network boundary, so the case travels in the open.`);
  }
  if (entry && m.members.length > 1) {
    const reach = new Set<string>([entry]); const q = [entry]; while (q.length) { const c = q.shift()!; for (const h of out(m, c)) if (!reach.has(h.to)) { reach.add(h.to); q.push(h.to); } }
    for (const x of m.members) if (!reach.has(x.agentId)) err(`members.${x.agentId}`, `${title(x.agentId)} can never be reached from ${title(entry)}. Add a handoff to it or take it out.`);
  }
  if (hasCycle(m) && !m.guardrails.loopGuard) err("guardrails.loopGuard", "These handoffs can send a case round in a circle. Turn the loop guard on, or remove the loop.");
  const g = m.guardrails;
  if (g.maxHops < 2 || g.maxHops > 100) err("guardrails.maxHops", "Allow between 2 and 100 handoffs a case.");
  if (g.maxCostUsd <= 0) err("guardrails.maxCostUsd", "Set a cost limit for one case. Without one, a loop can spend without end.");
  if (g.maxMinutes <= 0) err("guardrails.maxMinutes", "Set a time limit for one case.");
  if (g.maxVisits < 1) err("guardrails.maxVisits", "An agent may work a case at least once.");
  for (const id of g.personBefore) if (!ids.has(id)) err("guardrails.personBefore", "A person is asked before an agent that is not in the mesh.");
  for (const x of m.members) if (x.role === "executor" && !g.personBefore.includes(x.agentId) && !g.escalate.length) warn(`members.${x.agentId}`, `${title(x.agentId)} acts on its own. Ask a person before it, or list the cases that go to one.`);
  if (m.context.pii === "keep" && m.members.some((x) => by.get(x.agentId)?.network?.reach === "public")) warn("context.pii", "Personal data travels between agents in clear text and one of them faces the public. Mask it.");
  if (m.slo.successPct <= 0 || m.slo.successPct > 100) err("slo.successPct", "A success objective is between 1 and 100 percent.");
  if (m.slo.p95Min <= 0) err("slo.p95Min", "Set a time objective for a case.");
  if (m.slo.costPerCaseUsd <= 0) err("slo.costPerCaseUsd", "Set a cost objective for a case.");
  if (m.slo.costPerCaseUsd > g.maxCostUsd) warn("slo.costPerCaseUsd", "The cost objective is above the limit for one case, so a case can break the limit and still look fine.");
  return out_;
}
export const blockers = (is: Issue[]) => is.filter((i) => i.level === "error");

export function hasCycle(m: Pick<Mesh, "handoffs" | "members">): boolean {
  const adj = new Map<string, string[]>(); for (const h of m.handoffs) adj.set(h.from, [...(adj.get(h.from) ?? []), h.to]);
  const state = new Map<string, 1 | 2>();
  const visit = (n: string): boolean => { if (state.get(n) === 1) return true; if (state.get(n) === 2) return false; state.set(n, 1); for (const t of adj.get(n) ?? []) if (visit(t)) return true; state.set(n, 2); return false; };
  return m.members.some((x) => visit(x.agentId));
}

// Drawing: columns by distance from the entry, and which handoffs go back

export function layoutMesh(m: Pick<Mesh, "members" | "handoffs">): { col: Record<string, number>; row: Record<string, number>; cols: number; rows: number; back: Set<string> } {
  const entry = entryOf(m); const col: Record<string, number> = {}; const back = new Set<string>();
  if (entry) { col[entry] = 0; const q = [entry]; while (q.length) { const c = q.shift()!; for (const h of out(m, c)) if (col[h.to] === undefined) { col[h.to] = col[c] + 1; q.push(h.to); } } }
  let extra = Math.max(0, ...Object.values(col)) + 1; for (const x of m.members) if (col[x.agentId] === undefined) col[x.agentId] = extra++ ;
  for (const h of m.handoffs) if (col[h.to] !== undefined && col[h.from] !== undefined && col[h.to] <= col[h.from]) back.add(h.id);
  const byCol = new Map<number, string[]>(); for (const x of m.members) byCol.set(col[x.agentId], [...(byCol.get(col[x.agentId]) ?? []), x.agentId]);
  const row: Record<string, number> = {}; let rows = 1; byCol.forEach((l) => { rows = Math.max(rows, l.length); l.forEach((id, i) => { row[id] = i - (l.length - 1) / 2; }); });
  return { col, row, cols: Math.max(1, ...Object.values(col).map((c) => c + 1)), rows, back };
}

// Running a sample case

/** What an agent usually takes, costs and gets wrong, from its own recorded runs. */
const figures = (a?: Agent) => { if (!a) return { p95: 8000, cost: 0.02, fail: 0 }; const t = totals(a, 30); return { p95: a.p95Ms > 0 ? a.p95Ms : 8000, cost: t.executions ? t.costUsd / t.executions || 0.02 : 0.02, fail: t.failureRate }; };

export type Step = { n: number; agentId: string | null; role: MeshRole | "person"; action: string; startMs: number; durMs: number; costUsd: number; tokens: number; status: "ok" | "retried" | "waiting"; via: string | null; note: string };
export type CaseRun = { scenario: Scenario; steps: Step[]; outcome: "completed" | "escalated" | "stopped"; reason: string; totalMs: number; activeMs: number; costUsd: number; hops: number; waitMs: number; breach: null | "hops" | "cost" | "time" | "loop" };

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; };
const VERB: Record<MeshRole, string> = { intake: "Took in and checked", coordinator: "Decided the next step for", specialist: "Worked", reviewer: "Reviewed", executor: "Prepared the action for" };
const TOKEN_PRICE = 4e-6;

function holds(when: string, tags: Set<string>, ran: Set<string>): boolean {
  if (!when || when === "always") return true;
  return when.split("&").every((p) => { const neg = p.startsWith("!"); const t = tagOf(p); const v = t.startsWith("ran:") ? ran.has(t.slice(4)) : t === "always" ? true : tags.has(t); return neg ? !v : v; });
}

export function runCase(m: Mesh, agents: Agent[], sc: Scenario): CaseRun {
  const by = new Map(agents.map((a) => [a.id, a])); const g = m.guardrails; const tags = new Set(sc.tags);
  const steps: Step[] = []; let t = 0, cost = 0, active = 0, wait = 0, hops = 0; const visits = new Map<string, number>(); const ran = new Set<string>();
  let cur = entryOf(m); let via: string | null = null; let outcome: CaseRun["outcome"] = "completed"; let reason = ""; let breach: CaseRun["breach"] = null;
  const finish = () => ({ scenario: sc, steps, outcome, reason, totalMs: t, activeMs: active, costUsd: Math.round(cost * 10000) / 10000, hops, waitMs: wait, breach });
  while (cur) {
    const mem = m.members.find((x) => x.agentId === cur)!; const a = by.get(cur);
    const n = (visits.get(cur) ?? 0) + 1;
    if (m.guardrails.loopGuard && n > g.maxVisits) { outcome = "stopped"; breach = "loop"; reason = `${a?.title ?? cur} would work this case a ${n}th time. The loop guard stopped it.`; break; }
    if (hops >= g.maxHops) { outcome = "stopped"; breach = "hops"; reason = `The case reached its limit of ${g.maxHops} handoffs.`; break; }
    if (mem.role === "executor" && g.escalate.some((e) => tags.has(e)) ) {
      const why = g.escalate.find((e) => tags.has(e))!; const w = Math.round((9 + hash(sc.id + cur) * 16) * 60_000);
      steps.push({ n: steps.length + 1, agentId: null, role: "person", action: `A person decides before ${a?.title ?? cur} acts`, startMs: t, durMs: w, costUsd: 0, tokens: 0, status: "waiting", via, note: `The case is ${why.replace(/-/g, " ")}.` });
      t += w; wait += w; outcome = "escalated"; reason = `Sent to a person: the case is ${why.replace(/-/g, " ")}.`; break;
    }
    visits.set(cur, n); const h1 = hash(`${sc.id}|${cur}|${n}`);
    const f = figures(a); let dur = Math.round(f.p95 * (0.45 + 0.4 * h1)); let c = f.cost * (0.7 + 0.6 * h1);
    const failed = hash(`fail|${sc.id}|${cur}|${n}`) < Math.min(0.5, f.fail * 3);
    if (failed) { dur = Math.round(dur * 1.8); c *= 1.7; }
    if (cost + c > g.maxCostUsd) { outcome = "stopped"; breach = "cost"; reason = `The case would pass its cost limit of $${g.maxCostUsd.toFixed(2)}.`; break; }
    if (active + dur > g.maxMinutes * 60_000) { outcome = "stopped"; breach = "time"; reason = `The case would pass its time limit of ${g.maxMinutes} minutes.`; break; }
    steps.push({ n: steps.length + 1, agentId: cur, role: mem.role, action: `${VERB[mem.role]} ${sc.subject}${mem.duty ? ": " + mem.duty.toLowerCase().replace(/\.$/, "") : ""}`, startMs: t, durMs: dur, costUsd: Math.round(c * 10000) / 10000, tokens: Math.round(c / TOKEN_PRICE), status: failed ? "retried" : "ok", via, note: failed ? "The first attempt failed and was retried." : "" });
    t += dur; active += dur; cost += c; ran.add(cur);
    if (g.personBefore.includes(cur)) { const w = Math.round((9 + hash(sc.id + "p" + cur) * 16) * 60_000); steps.push({ n: steps.length + 1, agentId: null, role: "person", action: `A person approves ${a?.title ?? cur}'s result`, startMs: t, durMs: w, costUsd: 0, tokens: 0, status: "waiting", via: null, note: "" }); t += w; wait += w; }
    const next = out(m, cur).find((h) => holds(h.when, tags, ran));
    if (!next) { if (out(m, cur).length && m.pattern !== "supervisor") { outcome = "escalated"; reason = `No handoff rule matched after ${a?.title ?? cur}. A person takes over.`; } break; }
    for (const c of next.clears ?? []) tags.delete(c);
    hops++; via = next.id; cur = next.to;
  }
  if (!reason) reason = outcome === "completed" ? `Finished after ${steps.filter((s) => s.agentId).length} steps.` : "";
  return finish();
}

// Judging a mesh against its objectives

export type MeshStats = { cases7d: number; successPct: number; p95Min: number; costPerCaseUsd: number; escalationPct: number; breachPct: number; per: Record<string, { share: number; p95Ms: number; costUsd: number }>; edges: Record<string, number>; mix: CaseRun[] };
export function meshStats(m: Mesh, agents: Agent[]): MeshStats {
  const by = new Map(agents.map((a) => [a.id, a])); const mix = m.scenarios.map((s) => runCase(m, agents, s)); const total = m.scenarios.reduce((s, x) => s + x.share, 0) || 1;
  let cost = 0, active = 0, esc = 0, breach = 0, ok = 0; const per: MeshStats["per"] = {}; const edges: Record<string, number> = {};
  mix.forEach((r, i) => {
    const w = m.scenarios[i].share / total; cost += r.costUsd * w; active += r.activeMs * w; if (r.outcome === "escalated") esc += w; if (r.breach) breach += w;
    let pr = r.outcome === "stopped" ? 0 : 1; for (const s of r.steps) if (s.agentId) { const a = by.get(s.agentId); pr *= 1 - Math.min(0.5, figures(a).fail); }
    ok += pr * w;
    const counted = new Set<string>();
    for (const s of r.steps) if (s.agentId) { const p = (per[s.agentId] ??= { share: 0, p95Ms: 0, costUsd: 0 }); if (!counted.has(s.agentId)) { p.share += w; counted.add(s.agentId); } p.p95Ms = Math.max(p.p95Ms, s.durMs); p.costUsd += s.costUsd * w; if (s.via) edges[s.via] = (edges[s.via] ?? 0) + w; }
  });
  const entry = by.get(entryOf(m) ?? ""); const cases7d = entry ? entry.daily.slice(-7).reduce((s, d) => s + d.executions, 0) : 0;
  return { cases7d, successPct: Math.round(ok * 1000) / 10, p95Min: Math.round((active * 1.35) / 6000) / 10, costPerCaseUsd: Math.round(cost * 100) / 100, escalationPct: Math.round(esc * 1000) / 10, breachPct: Math.round(breach * 1000) / 10, per, edges, mix };
}
export type Objective = { id: "success" | "time" | "cost"; label: string; target: string; actual: string; state: "met" | "close" | "missed" };
export function objectives(m: Mesh, s: MeshStats): Objective[] {
  const rate = (actual: number, target: number, higher: boolean): Objective["state"] => (higher ? (actual >= target ? "met" : actual >= target * 0.97 ? "close" : "missed") : (actual <= target ? "met" : actual <= target * 1.1 ? "close" : "missed"));
  return [
    { id: "success", label: "Cases that finish", target: `${m.slo.successPct}% or more`, actual: `${s.successPct}%`, state: rate(s.successPct, m.slo.successPct, true) },
    { id: "time", label: "Time for a case, 95th percentile", target: `${m.slo.p95Min} min or less`, actual: `${s.p95Min} min`, state: rate(s.p95Min, m.slo.p95Min, false) },
    { id: "cost", label: "Cost of a case", target: `$${m.slo.costPerCaseUsd.toFixed(2)} or less`, actual: `$${s.costPerCaseUsd.toFixed(2)}`, state: rate(s.costPerCaseUsd, m.slo.costPerCaseUsd, false) },
  ];
}

// Samples

const DEFAULT_CTX: Mesh["context"] = { sharing: "case", memory: "case", pii: "mask" };
export function sampleMeshes(): Mesh[] {
  const at = new Date(Date.now() - 21 * 86_400_000).toISOString();
  const claims: Mesh = {
    id: "msh_clm", name: "Motor claims", useCase: "Take a motor claim from first notice to a prepared payout", industry: "Insurance", goal: "Settle straightforward claims in minutes and put every unusual one in front of an adjuster, with the evidence already read.",
    pattern: "pipeline", status: "live", trigger: { kind: "event", label: "A claim pack lands in the claims inbox" },
    members: [
      { agentId: "agt_09", role: "intake", duty: "Collects the claim details and checks they are complete" },
      { agentId: "agt_15", role: "specialist", duty: "Reads the claim pack and pulls out the facts" },
      { agentId: "agt_03", role: "specialist", duty: "Checks the policy wording for cover and exclusions" },
      { agentId: "agt_05", role: "specialist", duty: "Matches the repair invoice to the estimate" },
      { agentId: "agt_02", role: "executor", duty: "Prepares the payout against the policy" },
    ],
    handoffs: [
      { id: "h1", from: "agt_09", to: "agt_15", when: "always", carry: ["case", "documents"] },
      { id: "h2", from: "agt_15", to: "agt_09", when: "missing-docs", carry: ["summary"], clears: ["missing-docs"] },
      { id: "h3", from: "agt_15", to: "agt_03", when: "!missing-docs", carry: ["case", "summary", "documents"] },
      { id: "h4", from: "agt_03", to: "agt_05", when: "always", carry: ["case", "summary"] },
      { id: "h5", from: "agt_05", to: "agt_02", when: "always", carry: ["summary", "decision"] },
    ],
    scenarios: [
      { id: "sc_clean", title: "Clean claim", subject: "a windscreen claim under the excess", tags: [], share: 0.55 },
      { id: "sc_docs", title: "Missing photos", subject: "a rear end collision with no photos", tags: ["missing-docs"], share: 0.2 },
      { id: "sc_big", title: "High value", subject: "a write off claim of 18,400", tags: ["high-value"], share: 0.15 },
      { id: "sc_fraud", title: "Looks suspicious", subject: "a claim two days after the policy began", tags: ["suspicious"], share: 0.1 },
    ],
    context: { sharing: "case", memory: "case", pii: "mask" },
    guardrails: { maxHops: 12, maxCostUsd: 3, maxMinutes: 25, loopGuard: true, maxVisits: 2, personBefore: ["agt_02"], escalate: ["high-value", "suspicious"] },
    slo: { successPct: 92, p95Min: 12, costPerCaseUsd: 1.5 }, owner: "Claims technology", createdAt: at,
  };
  const care: Mesh = {
    id: "msh_care", name: "Customer care", useCase: "Answer a customer and get the right team on the problem the first time", industry: "Retail and services", goal: "One front door. Easy questions are answered at once; refunds go to the one agent that may prepare them, with a person approving the money.",
    pattern: "router", status: "live", trigger: { kind: "api", label: "A customer writes in on the web, chat or email" },
    members: [
      { agentId: "agt_01", role: "coordinator", duty: "Reads the request and decides where it goes" },
      { agentId: "agt_07", role: "specialist", duty: "Answers how do I questions from the handbook" },
      { agentId: "agt_02", role: "executor", duty: "Prepares the refund decision" },
      { agentId: "agt_08", role: "specialist", duty: "Handles everything else as a case in Salesforce" },
    ],
    handoffs: [
      { id: "r1", from: "agt_01", to: "agt_07", when: "howto", carry: ["case"] },
      { id: "r2", from: "agt_01", to: "agt_02", when: "refund", carry: ["case", "summary"] },
      { id: "r3", from: "agt_01", to: "agt_08", when: "always", carry: ["case", "summary", "history"] },
    ],
    scenarios: [
      { id: "sc_how", title: "How do I", subject: "a question about changing a delivery address", tags: ["howto"], share: 0.4 },
      { id: "sc_ref", title: "Refund", subject: "a damaged item refund of 640", tags: ["refund"], share: 0.25 },
      { id: "sc_other", title: "Something else", subject: "a complaint about a late delivery", tags: [], share: 0.35 },
    ],
    context: { sharing: "summary", memory: "session", pii: "mask" },
    guardrails: { maxHops: 6, maxCostUsd: 1, maxMinutes: 10, loopGuard: true, maxVisits: 1, personBefore: ["agt_02"], escalate: [] },
    slo: { successPct: 95, p95Min: 4, costPerCaseUsd: 0.4 }, owner: "Customer success", createdAt: at,
  };
  const deal: Mesh = {
    id: "msh_deal", name: "Deal desk", useCase: "Prepare a priced and reviewed quote before a sales call", industry: "Software and sales", goal: "A rep gets a brief, a price recommendation and a contract risk note in one go.",
    pattern: "pipeline", status: "draft", trigger: { kind: "person", label: "A rep asks for a deal pack" },
    members: [
      { agentId: "agt_06", role: "intake", duty: "Builds the account brief" },
      { agentId: "agt_13", role: "specialist", duty: "Suggests pricing against competitors" },
      { agentId: "agt_03", role: "specialist", duty: "Flags unusual contract terms" },
    ],
    handoffs: [
      { id: "d1", from: "agt_06", to: "agt_13", when: "always", carry: ["case", "summary"] },
      { id: "d2", from: "agt_13", to: "agt_03", when: "always", carry: ["summary", "decision"] },
    ],
    scenarios: [{ id: "sc_std", title: "Standard deal", subject: "a 40 seat renewal", tags: [], share: 0.7 }, { id: "sc_big2", title: "Large deal", subject: "a 900 seat new logo", tags: ["large"], share: 0.3 }],
    context: DEFAULT_CTX, guardrails: { maxHops: 6, maxCostUsd: 2, maxMinutes: 20, loopGuard: false, maxVisits: 1, personBefore: [], escalate: [] },
    slo: { successPct: 90, p95Min: 8, costPerCaseUsd: 1.2 }, owner: "Revenue operations", createdAt: at,
  };
  return [claims, care, deal];
}
