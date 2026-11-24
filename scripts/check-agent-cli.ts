import { agentsNow, resetAgents } from "../src/lib/agents/store";
import { parse, runCommand, table } from "../src/lib/agents/cli";
let pass = 0, fail = 0; const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const r = (l: string) => runCommand(l); const txt = (l: string) => r(l).lines.join("\n");
resetAgents();
// parser
const p = parse('agents suspend "support triage" --reason "bad answers" --state=active --force') as { words: string[]; flags: Record<string, string | true> };
ok(p.words.join("|") === "agents|suspend|support triage", "quotes keep words together");
ok(p.flags.reason === "bad answers" && p.flags.state === "active" && p.flags.force === true, "flags with values, equals and bare");
ok("error" in (parse('agents "oops') as object), "an open quote is reported");
ok(table(["A", "BB"], [["x", "y"]]).length === 3, "table has header, rule, rows");
ok(r("").lines.length === 0 && r("   ").lines.length === 0, "empty line prints nothing");
ok(r("help").lines.length > 10 && r("tok help").lines.length > 10, "help, with or without tok");
ok(r("clear").clear === true, "clear");
ok(/sample/.test(txt("version")), "version says sample");
ok(r("nope").error === true && /Unknown command/.test(txt("nope")), "unknown command");
// agents
const all = agentsNow().agents; const list = txt("agents list"); ok(all.every((a) => list.includes(a.name)), "lists every agent");
ok(!txt("agents list --state suspended").includes(all.find((a) => a.state === "active")!.name), "state filter");
const act = all.find((a) => a.state === "active" && a.control === "governed")!;
ok(txt(`agents get ${act.name}`).includes(`agent://${act.name}`), "agent get by name");
ok(r("agents get zzz-none").error === true, "agent get unknown");
ok(r(`agents suspend ${act.name}`).error === true, "suspend needs a reason");
ok(!r(`agents suspend ${act.name} --reason "testing"`).error && agentsNow().agents.find((a) => a.id === act.id)!.state === "suspended", "suspend changes the state");
ok(!r(`agents resume ${act.name}`).error && agentsNow().agents.find((a) => a.id === act.id)!.state === "active", "resume");
// approvals
const open = txt("approvals list"); ok(/waiting/.test(open), "approvals list");
const first = agentsNow().approvals.find((a) => a.status === "pending" && a.kind === "tool")!;
ok(r(`approvals decide ${first.id} --approve`).error === true, "decide needs --as");
ok(r(`approvals decide ${first.id} --decline --as "Priya Nair"`).error === true, "decline needs a reason");
ok(!r(`approvals decide ${first.id} --decline --as "Priya Nair" --reason "Not allowed by policy"`).error && agentsNow().approvals.find((a) => a.id === first.id)!.status === "declined", "decline with a reason");
ok(r(`approvals decide ${first.id} --approve --as "Priya Nair" --reason "x"`).error === true, "a decided request cannot be decided again");
// evals, traces, workflows, context, memory, protocol
ok(/PASS RATE/.test(txt("evals list")), "evals list");
const suite = agentsNow().evalSuites[0]; const before = agentsNow().evalRuns.length; const er = r(`evals run "${suite.name}"`);
ok(agentsNow().evalRuns.length === before + (er.error ? 0 : 1), "evals run adds a run unless refused: " + er.lines[0]);
ok(r("evals run nothing-here").error === true, "evals run unknown");
ok(txt("traces list --limit 3").split("\n").length === 5, "traces list limit");
ok(r("traces list --agent zzz").error === true, "traces unknown agent");
ok(/pattern/i.test(txt("workflows list")), "workflows list");
const wf = agentsNow().workflows[0]; const runs = wf.runs.length; r(`workflows run "${wf.name}"`); ok(agentsNow().workflows[0].runs.length === runs + 1, "workflow run adds a run");
ok(/SCOPE/.test(txt("context list")), "context list");
const mem = all.find((a) => a.memory?.layers.some((l) => l.enabled))!; ok(/items/.test(txt(`memory list ${mem.name}`)), "memory list");
ok(r(`memory list ${mem.name} --kind bogus`).error === true, "memory bad kind");
ok(r(`memory recall ${mem.name} semantic`).error === true, "recall needs a question or layer");
ok(txt("protocol types").includes("relay.task.create") && txt("protocol example relay.task.create").includes("\"type\""), "protocol helpers");
console.log(`${pass} checks passed, ${fail} failed`); process.exit(fail ? 1 : 0);
