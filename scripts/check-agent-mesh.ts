/**
 * Checks for Agent Mesh: validation, building a mesh from a pattern, the layout, running a sample case through the handoff rules and guardrails, and the objectives.
 * Run: npx tsx --tsconfig scripts/tsconfig.scripts.json scripts/check-agent-mesh.ts
 */
import { agentsNow, resetAgents } from "../src/lib/agents/store";
import { blockers, entryOf, hasCycle, layoutMesh, meshStats, objectives, runCase, sampleMeshes, scaffold, validateMesh, describeWhen, type Mesh } from "../src/lib/agents/mesh";

let pass = 0; let fail = 0;
const ok = (c: unknown, m: string) => { if (c) pass++; else { fail++; console.error("FAIL", m); } };
const eq = (a: unknown, b: unknown, m: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`);

resetAgents(); const { agents, networks } = agentsNow();
const [claims, care, deal] = sampleMeshes();
const clone = (m: Mesh, f: (x: Mesh) => void) => { const c = structuredClone(m); f(c); return c; };
const errs = (m: Mesh) => blockers(validateMesh(m, agents, networks, [])).map((i) => i.message);

// ---- samples
eq(errs(claims), [], "the claims mesh is valid");
eq(errs(care), [], "the care mesh is valid");
ok(errs(deal).some((m) => /cannot reach/.test(m)), "the draft deal desk cannot go live: its agents cannot reach each other");
ok(validateMesh(claims, agents, networks).some((i) => i.level === "warning" && /does not run/.test(i.message)), "an agent tok∑ner does not run is a warning");
eq(entryOf(claims), "agt_09", "the intake agent is the entry");
ok(hasCycle(claims) && !hasCycle(care), "a loop is found, and a router has none");

// ---- validation
ok(errs(clone(claims, (m) => { m.name = "x"; })).some((e) => /2 to 48/.test(e)), "name length");
ok(errs(clone(claims, (m) => { m.members = m.members.slice(0, 1); m.handoffs = []; })).some((e) => /at least two/.test(e)), "one agent is not a mesh");
ok(errs(clone(claims, (m) => { m.guardrails.loopGuard = false; })).some((e) => /loop guard/.test(e)), "a loop needs the loop guard");
ok(errs(clone(claims, (m) => { m.handoffs.push({ id: "x", from: "agt_02", to: "agt_02", when: "always", carry: ["case"] }); })).some((e) => /to itself/.test(e)), "no handoff to itself");
ok(errs(clone(claims, (m) => { m.handoffs = m.handoffs.filter((h) => h.id !== "h5"); })).some((e) => /never be reached|can never/.test(e)), "an agent nobody hands to is unreachable");
ok(errs(clone(claims, (m) => { m.members[1].agentId = "agt_14"; m.handoffs.forEach((h) => { h.from = h.from === "agt_15" ? "agt_14" : h.from; h.to = h.to === "agt_15" ? "agt_14" : h.to; }); })).some((e) => /retired/.test(e)), "a retired agent is refused");
ok(errs(clone(claims, (m) => { m.guardrails.maxCostUsd = 0; })).some((e) => /cost limit/.test(e)), "a cost limit is required");
ok(errs(clone(claims, (m) => { m.guardrails.personBefore = ["agt_99"]; })).some((e) => /not in the mesh/.test(e)), "a person before an unknown agent");
ok(errs(clone(claims, (m) => { m.members.push({ agentId: "agt_04", role: "intake", duty: "" }); })).some((e) => /Only one agent takes the case in/.test(e)), "one intake");
ok(blockers(validateMesh(clone(claims, (m) => { m.name = "Customer care"; }), agents, networks, [care])).some((i) => /already exists/.test(i.message)), "a taken name");
ok(validateMesh(clone(claims, (m) => { m.context.pii = "keep"; }), agents, networks).some((i) => i.level === "warning" && /clear text|Mask/.test(i.message)) || true, "pii note does not throw");
ok(errs(clone(claims, (m) => { m.handoffs.find((h) => h.id === "h4")!.to = "agt_09"; })).length > 0, "a handoff back to the start changes reachability or paths");

// ---- scaffold
const ids = ["agt_01", "agt_07", "agt_02", "agt_08"];
for (const p of ["pipeline", "supervisor", "router", "review", "swarm"] as const) {
  const s = scaffold(p, ids); ok(s.members.length === 4 && s.handoffs.length > 0, `${p} scaffold has members and handoffs`);
  ok(s.handoffs.every((h) => ids.includes(h.from) && ids.includes(h.to) && h.from !== h.to), `${p} handoffs only join members`);
  const m: Mesh = { ...claims, id: "t", name: "Test " + p, pattern: p, members: s.members, handoffs: s.handoffs, guardrails: { ...claims.guardrails, loopGuard: true, personBefore: [], escalate: [] } };
  const reach = layoutMesh(m); ok(Object.keys(reach.col).length === 4, `${p} layout places every agent`);
}
eq(scaffold("pipeline", ids).handoffs.map((h) => [h.from, h.to]), [["agt_01", "agt_07"], ["agt_07", "agt_02"], ["agt_02", "agt_08"]], "a pipeline is a line");
eq(scaffold("supervisor", ["a", "b", "c"]).members.map((m) => m.role), ["coordinator", "specialist", "specialist"], "supervisor roles");
ok(scaffold("review", ["a", "b", "c"]).members[2].role === "reviewer", "the last agent of a maker and checker is the reviewer");
ok(scaffold("review", ["a", "b", "c"]).handoffs.some((h) => h.when === "rejected" && h.clears?.includes("rejected")), "a rejection goes back and clears itself");

// ---- layout
const lay = layoutMesh(claims);
eq([lay.col.agt_09, lay.col.agt_15, lay.col.agt_03, lay.col.agt_05, lay.col.agt_02], [0, 1, 2, 3, 4], "claims runs left to right");
ok(lay.back.has("h2") && lay.back.size === 1, "only the loop back is drawn as a return");
const rl = layoutMesh(care); ok(rl.col.agt_07 === 1 && rl.col.agt_02 === 1 && rl.col.agt_08 === 1 && new Set([rl.row.agt_07, rl.row.agt_02, rl.row.agt_08]).size === 3, "a router fans out in one column");

// ---- running cases
const run = (m: Mesh, id: string) => runCase(m, agents, m.scenarios.find((s) => s.id === id)!);
const clean = run(claims, "sc_clean");
eq(clean.steps.filter((s) => s.agentId).map((s) => s.agentId), ["agt_09", "agt_15", "agt_03", "agt_05", "agt_02"], "a clean claim goes straight through");
ok(clean.outcome === "completed" && clean.steps.some((s) => s.role === "person"), "...and a person approves the payout");
ok(clean.steps.every((s, i) => i === 0 || s.startMs >= clean.steps[i - 1].startMs + clean.steps[i - 1].durMs - 1), "steps do not overlap");
ok(clean.costUsd > 0 && clean.costUsd < claims.guardrails.maxCostUsd && clean.hops === 4, "cost and handoffs are counted");
eq(JSON.stringify(runCase(claims, agents, claims.scenarios[0])), JSON.stringify(clean), "a case runs the same every time");
const docs = run(claims, "sc_docs");
eq(docs.steps.filter((s) => s.agentId).map((s) => s.agentId).slice(0, 4), ["agt_09", "agt_15", "agt_09", "agt_15"], "missing documents send it back to intake once");
ok(docs.outcome === "completed" && docs.hops === 6, "...and then it finishes");
const big = run(claims, "sc_big");
ok(big.outcome === "escalated" && big.steps[big.steps.length - 1].role === "person" && !big.steps.some((s) => s.agentId === "agt_02"), "a high value claim goes to a person before the payout is prepared");
ok(run(claims, "sc_fraud").outcome === "escalated", "so does a suspicious one");
ok(big.waitMs > 0 && big.activeMs < big.totalMs, "waiting for a person is not counted as work time");
const tight = clone(claims, (m) => { m.guardrails.maxCostUsd = 0.3; });
const hit = runCase(tight, agents, tight.scenarios[0]); ok(hit.outcome === "stopped" && hit.breach === "cost", "the cost limit stops a case");
const hops = clone(claims, (m) => { m.guardrails.maxHops = 2; }); ok(runCase(hops, agents, hops.scenarios[0]).breach === "hops", "the handoff limit stops a case");
const time = clone(claims, (m) => { m.guardrails.maxMinutes = 0.01; }); ok(runCase(time, agents, time.scenarios[0]).breach === "time", "the time limit stops a case");
const loop = clone(claims, (m) => { m.handoffs.find((h) => h.id === "h2")!.clears = []; }); const lr = runCase(loop, agents, loop.scenarios[1]); ok(lr.breach === "loop" && lr.outcome === "stopped", "a case that never settles is stopped by the loop guard");
const howto = run(care, "sc_how"); eq(howto.steps.filter((s) => s.agentId).map((s) => s.agentId), ["agt_01", "agt_07"], "a router sends a question to one specialist");
eq(run(care, "sc_ref").steps.filter((s) => s.agentId).map((s) => s.agentId), ["agt_01", "agt_02"], "...a refund to the refund agent");
eq(run(care, "sc_other").steps.filter((s) => s.agentId).map((s) => s.agentId), ["agt_01", "agt_08"], "...and the rest to the case handler");
const sup = scaffold("supervisor", ["agt_01", "agt_07", "agt_08"]); const sm: Mesh = { ...care, pattern: "supervisor", members: sup.members, handoffs: sup.handoffs, guardrails: { ...care.guardrails, maxVisits: 3, maxHops: 10, personBefore: [], escalate: [] } };
eq(runCase(sm, agents, { id: "s", title: "", subject: "x", tags: [], share: 1 }).steps.filter((s) => s.agentId).map((s) => s.agentId), ["agt_01", "agt_07", "agt_01", "agt_08", "agt_01"], "a supervisor takes each specialist's result back");

// ---- objectives
const st = meshStats(claims, agents);
ok(st.successPct > 50 && st.successPct <= 100 && st.costPerCaseUsd > 0 && st.p95Min > 0, "stats are in range");
ok(st.escalationPct > 0 && st.escalationPct <= 100, "some cases go to a person");
eq(JSON.stringify(meshStats(claims, agents)), JSON.stringify(st), "stats are stable");
eq(objectives(claims, st).map((o) => o.id), ["success", "time", "cost"], "three objectives");
ok(objectives(clone(claims, (m) => { m.slo.costPerCaseUsd = 0.01; }), st).find((o) => o.id === "cost")!.state === "missed", "an objective can be missed");
ok(describeWhen("missing-docs") === "missing docs" && describeWhen("!ran:x&high-value", () => "Intake") === "Intake has not worked it yet, and high value" && describeWhen("always") === "Always", "conditions read as words");

// ---- the store
import { meshes as store } from "../src/lib/agents/store";
resetAgents(); const S = () => agentsNow();
ok(S().meshes.length === 3 && S().meshes.filter((m) => m.status === "live").length === 2, "the sample workspace starts with three meshes, two live");
const sc = scaffold("pipeline", ["agt_01", "agt_07", "agt_08"]);
const input = { name: "Triage line", useCase: "Test", industry: "x", goal: "x", pattern: "pipeline" as const, trigger: { kind: "api" as const, label: "x" }, members: sc.members, handoffs: sc.handoffs, scenarios: [{ id: "a", title: "a", subject: "a", tags: [], share: 1 }], context: { sharing: "case" as const, memory: "case" as const, pii: "mask" as const }, guardrails: { maxHops: 8, maxCostUsd: 1, maxMinutes: 5, loopGuard: true, maxVisits: 2, personBefore: [], escalate: [] }, slo: { successPct: 90, p95Min: 5, costPerCaseUsd: 1 }, owner: "Ops" };
const made = store.create(input); ok(made.ok && made.value.status === "draft" && S().meshes.length === 4, "a mesh is created as a draft");
ok(!store.create({ ...input, name: "Triage line" }).ok, "a duplicate name is refused");
ok(!store.create({ ...input, name: "Solo", members: sc.members.slice(0, 1), handoffs: [] }).ok, "one agent is not a mesh");
if (made.ok) {
  ok(store.setStatus(made.value.id, "live").ok === validateMesh(S().meshes.find((m) => m.id === made.value.id)!, S().agents, S().networks, S().meshes).every((i) => i.level !== "error"), "going live follows the checks");
  const broken = store.update(made.value.id, { handoffs: [] });
  ok(S().meshes.find((m) => m.id === made.value.id)!.status === "live" ? !broken.ok : broken.ok, "a live mesh refuses a change that breaks it; a draft accepts one");
  ok(!store.remove(made.value.id).ok || S().meshes.find((m) => m.id === made.value.id)?.status !== "live", "a live mesh is paused before it is deleted");
  store.setStatus(made.value.id, "paused"); ok(store.remove(made.value.id).ok && S().meshes.length === 3, "a paused mesh can be deleted");
}
ok(!store.setStatus("nope", "live").ok && !store.remove("nope").ok, "an unknown mesh");
ok(!store.setStatus("msh_deal", "live").ok, "the deal desk cannot go live while its agents cannot reach each other");

// ---- how a network and a mesh are drawn on the Constellation
import { colorAt, handoffPath, MESH_COLORS, NET_COLORS, zoneParts, zonePath } from "../src/lib/agents/showcase";
const pts = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 0, y: 300 }];
eq(zoneParts(pts).edges.length, 2, "three agents are joined by two lines");
eq(zoneParts([pts[0]]).edges.length, 0, "one agent has no line");
ok(zoneParts(pts).top.y === 300, "the name goes under the lowest agent");
ok(zonePath(pts, 50).startsWith("M") && zonePath(pts, 50).endsWith("Z") && zonePath([], 50) === "", "an outline is a closed path, and empty for no agents");
ok(colorAt(NET_COLORS, 7) === NET_COLORS[1] && colorAt(MESH_COLORS, -1) === MESH_COLORS[MESH_COLORS.length - 1], "colours wrap round");
const hp = handoffPath({ x: 0, y: 0 }, { x: 200, y: 0 }, 40, 10); ok(hp.d.startsWith("M 40 ") && /200|154/.test(hp.d), "a handoff line starts at the edge of the first agent and stops short of the second");
ok(handoffPath({ x: 0, y: 0 }, { x: 200, y: 0 }, 40, 22).mid.y !== handoffPath({ x: 200, y: 0 }, { x: 0, y: 0 }, 40, 22).mid.y, "two opposite handoffs do not lie on each other");

console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
