/**
 * Checks for the Graph view's logic in src/lib/agents/graph.ts: the use case read from each sample agent, colours that stay stable, the nodes and edges
 * built from agents, links and resources, the neighbourhood of a node, and that the force layout settles without nodes sitting on top of each other.
 * Run: npx tsx --tsconfig scripts/tsconfig.scripts.json scripts/check-agent-graph.ts
 */
import { sampleAgents, sampleTopology } from "../src/lib/agents/sample";
import { sampleHub } from "../src/lib/agents/hub";
import { usage } from "../src/lib/agents/connectors";
import { DEFAULT_FORCES, GRAPH_PALETTE, buildGraph, groupsOf, neighbourhood, radiusOf, seedPositions, tick, useCaseOf, type ColorBy, type SimNode } from "../src/lib/agents/graph";

let pass = 0; let fail = 0;
const ok = (c: unknown, m: string) => { if (c) pass++; else { fail++; console.error("FAIL", m); } };
const eq = (a: unknown, b: unknown, m: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`);

const { agents } = sampleAgents(); const { links } = sampleTopology(); const hub = sampleHub(); const use = usage(agents, hub);
const by = (n: string) => agents.find((a) => a.name === n)!;

// ---- what each agent is for
const expect: Record<string, string> = {
  "support-triage": "support", "refund-approver": "finance", "contract-reviewer": "legal", "code-review-bot": "engineering", "invoice-matcher": "finance",
  "sales-researcher": "sales", "onboarding-guide": "people", "bedrock-claims": "claims", "copilot-helpdesk": "it", "dify-faq": "marketing",
  "data-quality-watch": "data", "pricing-analyst": "sales", "claims-document-processor": "claims",
};
for (const [n, u] of Object.entries(expect)) eq(useCaseOf(by(n)), u, `use case of ${n}`);
eq(useCaseOf({ title: "Thing", name: "thing", description: "Does something.", department: "Unassigned" }), "general", "an agent that says nothing is general");
eq(useCaseOf({ title: "Thing", name: "thing", description: "Does something.", department: "Legal" }), "legal", "the department decides when the text says nothing");
eq(useCaseOf({ title: "Claims support", name: "x", description: "", department: "Customer Support" }), "claims", "claims beats support");

// ---- colours
for (const by2 of ["department", "framework", "health", "control", "usecase"] as ColorBy[]) {
  const g = groupsOf(agents, by2);
  eq(g.reduce((s, x) => s + x.count, 0), agents.length, `${by2}: every agent is in a group`);
  eq(JSON.stringify(g), JSON.stringify(groupsOf([...agents].reverse(), by2)), `${by2}: the colours do not depend on the order of agents`);
  ok(g.every((x) => /^#[0-9A-F]{6}$/i.test(x.color)), `${by2}: every group has a colour`);
  if (by2 !== "health") ok(new Set(g.slice(0, GRAPH_PALETTE.length).map((x) => x.color)).size === Math.min(g.length, GRAPH_PALETTE.length), `${by2}: the first groups all differ in colour`);
}

// ---- the graph
const plain = buildGraph(agents, links, use, { by: "department", resources: false });
eq(plain.nodes.length, agents.length, "one node per agent");
ok(plain.nodes.every((n) => n.kind === "agent"), "no resources when they are off");
eq(plain.edges.length, links.length, "one edge per link");
const full = buildGraph(agents, links, use, { by: "department", resources: true });
ok(full.nodes.some((n) => n.kind === "resource"), "resources appear when on");
ok(full.edges.every((e) => full.nodes.some((n) => n.id === e.from) && full.nodes.some((n) => n.id === e.to)), "every edge joins two nodes");
eq(new Set(full.nodes.map((n) => n.id)).size, full.nodes.length, "node ids are unique");
ok(full.nodes.filter((n) => n.kind === "resource").every((n) => n.weight >= 1), "a resource shown is used by someone");
const kinds = new Set(full.nodes.filter((n) => n.kind === "resource").map((n) => n.icon));
ok(kinds.has("knowledge") && kinds.has("channel") && kinds.has("connection"), "knowledge, channels and connections all appear");
const busy = [...plain.nodes].sort((a, b) => b.weight - a.weight)[0], quiet = [...plain.nodes].sort((a, b) => a.weight - b.weight)[0];
ok(radiusOf(busy, 1) > radiusOf(quiet, 1), "a busier node is bigger");
ok(radiusOf({ kind: "resource", weight: 3 }, 1) < radiusOf({ kind: "agent", weight: 0 }, 1), "a resource is smaller than an agent");

// ---- neighbourhood
const hub0 = busy.id;
eq([...neighbourhood(plain.edges, hub0, 0)], [hub0], "depth 0 is the node alone");
const one = neighbourhood(plain.edges, hub0, 1);
ok(one.size === 1 + new Set(plain.edges.filter((e) => e.from === hub0 || e.to === hub0).flatMap((e) => [e.from, e.to]).filter((x) => x !== hub0)).size, "depth 1 is the node and its direct neighbours");
ok(neighbourhood(plain.edges, hub0, 3).size >= one.size, "a deeper view never shows fewer nodes");
const lone = plain.nodes.find((n) => n.weight === 0);
if (lone) eq(neighbourhood(plain.edges, lone.id, 3).size, 1, "an unconnected node has no neighbours");

// ---- the layout settles
const idx = new Map(full.nodes.map((n, i) => [n.id, i]));
const sim = seedPositions(full.nodes.map((n) => n.id)); full.nodes.forEach((n, i) => { sim[i].r = radiusOf(n, 1); });
const se = full.edges.map((e) => ({ a: idx.get(e.from)!, b: idx.get(e.to)!, w: e.kind === "resource" ? e.weight * 0.35 : e.weight }));
let alpha = 1, speed = 99, steps = 0;
while (alpha > 0.01) { speed = tick(sim, se, DEFAULT_FORCES, alpha); alpha *= 0.975; steps++; }
ok(speed < 0.3, `the layout has stopped moving (${steps} steps, speed ${speed.toFixed(3)})`);
ok(sim.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), "no position is NaN or infinite");
let overlaps = 0; for (let i = 0; i < sim.length; i++) for (let j = i + 1; j < sim.length; j++) if (Math.hypot(sim[i].x - sim[j].x, sim[i].y - sim[j].y) < (sim[i].r + sim[j].r) * 0.9) overlaps++;
eq(overlaps, 0, "no two nodes overlap once settled");
const span = Math.max(...sim.map((p) => Math.hypot(p.x, p.y)));
ok(span < 1500, `the layout stays compact (radius ${Math.round(span)})`);
const again = seedPositions(full.nodes.map((n) => n.id)); full.nodes.forEach((n, i) => { again[i].r = radiusOf(n, 1); });
let a2 = 1; while (a2 > 0.01) { tick(again, se, DEFAULT_FORCES, a2); a2 *= 0.975; }
eq(again.map((p) => [Math.round(p.x), Math.round(p.y)]), sim.map((p) => [Math.round(p.x), Math.round(p.y)]), "the same data settles the same way");
// a pinned node stays where it is
const pin = seedPositions(["a", "b"]); pin[0].fixed = true; const ax = pin[0].x; for (let i = 0; i < 50; i++) tick(pin, [{ a: 0, b: 1, w: 1 }], DEFAULT_FORCES, 1);
eq(pin[0].x, ax, "a pinned node does not move");

// ---- sections pull their members together
{
  const mk = () => { const ids = full.nodes.map((n) => n.id); const sm = seedPositions(ids); full.nodes.forEach((n, i) => { sm[i].r = radiusOf(n, 1); }); return sm; };
  const gi = new Map<string, number>(); const grp = full.nodes.map((n) => { const k = `${n.kind}:${n.group}`; if (!gi.has(k)) gi.set(k, gi.size); return gi.get(k)!; });
  const spread = (sm: SimNode[]) => { let tot = 0, c = 0; for (let i = 0; i < sm.length; i++) for (let j = i + 1; j < sm.length; j++) if (grp[i] === grp[j]) { tot += Math.hypot(sm[i].x - sm[j].x, sm[i].y - sm[j].y); c++; } return tot / Math.max(1, c); };
  const run = (g: number) => { const sm = mk(); let al = 1; while (al > 0.01) { tick(sm, se, { ...DEFAULT_FORCES, group: g }, al, grp); al *= 0.975; } return sm; };
  const loose = run(0), tight = run(DEFAULT_FORCES.group);
  ok(spread(tight) < spread(loose), `a section pull brings members closer (${Math.round(spread(loose))} to ${Math.round(spread(tight))})`);
  let ov = 0; for (let i = 0; i < tight.length; i++) for (let j = i + 1; j < tight.length; j++) if (Math.hypot(tight[i].x - tight[j].x, tight[i].y - tight[j].y) < (tight[i].r + tight[j].r) * 0.9) ov++;
  eq(ov, 0, "sections do not make nodes overlap");
  // the circle drawn around each section (members plus 38) does not cross another section's circle
  const byG = new Map<number, number[]>(); grp.forEach((g, i) => { const l = byG.get(g); if (l) l.push(i); else byG.set(g, [i]); });
  const circ = [...byG.values()].filter((m) => m.length >= 2).map((m) => { const cx = m.reduce((t, i) => t + tight[i].x, 0) / m.length, cy = m.reduce((t, i) => t + tight[i].y, 0) / m.length; return { cx, cy, r: Math.max(...m.map((i) => Math.hypot(tight[i].x - cx, tight[i].y - cy) + tight[i].r)) + 38 }; });
  let cross = 0, worst = 0; for (let i = 0; i < circ.length; i++) for (let j = i + 1; j < circ.length; j++) { const o = circ[i].r + circ[j].r - Math.hypot(circ[i].cx - circ[j].cx, circ[i].cy - circ[j].cy); if (o > 4) cross++; worst = Math.max(worst, o); }
  ok(cross === 0, `sections do not overlap one another (${circ.length} sections, worst overlap ${Math.round(worst)}px)`);
}

console.log(`${pass} passed, ${fail} failed`); if (fail) process.exit(1);
