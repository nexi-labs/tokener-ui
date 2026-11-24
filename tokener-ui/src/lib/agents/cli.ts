/**
 * The in-product shell: the same `tok` commands the command line tool will offer, run against the sample workspace, so a person can learn them
 * and an operator can script a change before the real CLI is released. Each command calls the same store actions the console screens call, so
 * a policy or rule that stops a change in the console stops it here too. Output is plain text and the parser is pure, so it is checked without a browser.
 */
import { agentsNow, agents as agentActions, approvals as approvalActions, evals as evalActions, workflows as workflowActions } from "./store";
import { KIND_BY_ID, MEMORY_KINDS, recall, type MemoryKind } from "./memory";
import { MESSAGE_TYPES, exampleEnvelope } from "./protocol";
import { isOpen } from "./approvals";
import type { Outcome } from "./approvals";
import { ago } from "./format";

export const CLI_VERSION = "0.0.0-sample";
export type CliResult = { lines: string[]; error?: boolean; clear?: boolean };
type Parsed = { words: string[]; flags: Record<string, string | true> };

/** Splits a line into words, keeping quoted text together, and pulls out --flag and --flag value pairs. */
export function parse(line: string): Parsed | { error: string } {
  const toks: string[] = []; let cur = ""; let q: string | null = null; let had = false;
  for (const ch of line.trim()) {
    if (q) { if (ch === q) q = null; else cur += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; had = true; continue; }
    if (/\s/.test(ch)) { if (cur || had) toks.push(cur); cur = ""; had = false; continue; }
    cur += ch;
  }
  if (q) return { error: "A quote was opened and never closed." };
  if (cur || had) toks.push(cur);
  const words: string[] = []; const flags: Record<string, string | true> = {};
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.startsWith("--") && t.length > 2) { const [k, v] = t.slice(2).split("=", 2); if (v !== undefined) flags[k] = v; else if (toks[i + 1] && !toks[i + 1].startsWith("--")) flags[k] = toks[++i]; else flags[k] = true; }
    else words.push(t);
  }
  return { words, flags };
}

const out = (...lines: string[]): CliResult => ({ lines });
const fail = (...lines: string[]): CliResult => ({ lines, error: true });
export function table(head: string[], rows: string[][]): string[] {
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const fmt = (r: string[]) => r.map((c, i) => (c ?? "").padEnd(w[i])).join("  ").trimEnd();
  return [fmt(head), fmt(w.map((n) => "-".repeat(n))), ...rows.map(fmt)];
}
const money = (n: number) => `$${n.toFixed(2)}`;
const find = <T extends { id: string }>(list: T[], key: string, name: (x: T) => string) => list.find((x) => x.id === key || name(x) === key) ?? list.filter((x) => name(x).startsWith(key)).reduce<T | undefined>((a, x, _, all) => (all.length === 1 ? x : a), undefined);

export const HELP = [
  "tok, the tok∑ner command line (sample workspace)", "",
  "  agents list [--state active|suspended|retired]", "  agents get <name>", "  agents suspend <name> --reason <text>", "  agents resume <name>",
  "  approvals list", "  approvals decide <id> --approve|--decline --as <person> --reason <text>",
  "  evals list", "  evals run <suite>", "  traces list [--agent <name>] [--status error] [--limit 10]",
  "  workflows list", "  workflows run <name>", "  context list", "  memory list <agent> [--kind <kind>]", "  memory recall <agent> <kind> <question>",
  "  protocol types", "  protocol example <type>", "  version", "  clear", "",
  "Quote text that has spaces. Every change goes through the same rules as the console.",
];

export function runCommand(line: string): CliResult {
  const p = parse(line); if ("error" in p) return fail(p.error);
  let { words } = p; const { flags } = p; if (!words.length) return out();
  if (words[0] === "tok") words = words.slice(1); if (!words.length) return out(...HELP);
  const [group, verb, ...rest] = words; const s = agentsNow();
  const agent = (k?: string) => (k ? find(s.agents, k, (a) => a.name) : undefined);
  if (group === "help" || flags.help) return out(...HELP);
  if (group === "version") return out(`tok ${CLI_VERSION}`, "The released CLI is not available yet. This shell runs the sample workspace.");
  if (group === "clear") return { lines: [], clear: true };

  if (group === "agents") {
    if (verb === "list") { const st = flags.state; const list = s.agents.filter((a) => !st || a.state === st); return out(...table(["NAME", "STATE", "CONTROL", "RISK", "OWNER", "FRAMEWORK"], list.map((a) => [a.name, a.state, a.control, a.risk, a.owner, a.framework]))); }
    const a = agent(rest[0]); if (!["get", "suspend", "resume"].includes(verb ?? "")) return fail(`Unknown command: agents ${verb ?? ""}. Try: agents list`);
    if (!a) return fail(`No agent matches "${rest[0] ?? ""}". Run: agents list`);
    if (verb === "get") return out(`${a.title} (${a.name})`, `  address      agent://${a.name}`, `  state        ${a.state}`, `  control      ${a.control}`, `  risk         ${a.risk}`, `  owner        ${a.owner}`, `  department   ${a.department}${a.project ? `, ${a.project}` : ""}`, `  framework    ${a.framework}`, `  version      ${a.version}`, `  models       ${a.models.join(", ") || "none reported"}`, `  tools        ${a.tools.length}`);
    if (verb === "suspend") { if (typeof flags.reason !== "string" || flags.reason.length < 3) return fail("A reason is required: --reason \"why\""); const r = agentActions.setState(a.id, "suspended"); return r.ok ? out(`${a.name} suspended. Reason recorded: ${flags.reason}`, a.control === "governed" ? "New calls are refused from the next call." : "This agent is not governed, so the suspend is advice it may ignore.") : fail(r.error); }
    const r = agentActions.setState(a.id, "active"); return r.ok ? out(`${a.name} resumed.`) : fail(r.error);
  }
  if (group === "approvals") {
    if (verb === "list") { const open = s.approvals.filter(isOpen); return out(...table(["ID", "AGENT", "WHAT", "ASSIGNED TO", "OPENED"], open.map((x) => [x.id, s.agents.find((a) => a.id === x.agentId)?.name ?? x.agentId, x.subject.slice(0, 48), x.assignee, ago(x.requestedAt)])), "", `${open.length} waiting`); }
    if (verb === "decide") {
      const id = rest[0]; const outcome: Outcome | null = flags.approve ? "approved" : flags.decline ? "declined" : null;
      if (!id || !outcome) return fail("Usage: approvals decide <id> --approve|--decline --as <person> --reason <text>");
      if (typeof flags.as !== "string") return fail("Say who is deciding: --as \"Priya Nair\"");
      const r = approvalActions.decide(id, flags.as, outcome, typeof flags.reason === "string" ? flags.reason : ""); return r.ok ? out(`${id} ${r.value.status === "awaiting-second" ? "approved once, and waits for a second person" : outcome}.`) : fail(r.error);
    }
    return fail(`Unknown command: approvals ${verb ?? ""}. Try: approvals list`);
  }
  if (group === "evals") {
    if (verb === "list") return out(...table(["SUITE", "AGENT", "CASES", "LAST RUN", "PASS RATE"], s.evalSuites.map((x) => { const last = s.evalRuns.filter((r) => r.suiteId === x.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]; return [x.name, s.agents.find((a) => a.id === x.agentId)?.name ?? x.agentId, String(x.cases.length), last ? ago(last.startedAt) : "never", last ? `${Math.round(last.passRate * 100)}%` : "-"]; })));
    if (verb === "run") { const su = find(s.evalSuites, rest.join(" "), (x) => x.name); if (!su) return fail(`No suite matches "${rest.join(" ")}". Run: evals list`); const r = evalActions.run(su.id, "cli"); return r.ok ? out(`${su.name}: ${r.value.status}`, `  pass rate ${Math.round(r.value.passRate * 100)}%, mean score ${r.value.meanScore.toFixed(2)}, cost ${money(r.value.costUsd)}`, `  failing: ${r.value.results.filter((x) => !x.pass).map((x) => x.caseId).join(", ") || "none"}`) : fail(r.error); }
    return fail(`Unknown command: evals ${verb ?? ""}. Try: evals list`);
  }
  if (group === "traces") {
    if (verb !== "list") return fail(`Unknown command: traces ${verb ?? ""}. Try: traces list`);
    const a = typeof flags.agent === "string" ? agent(flags.agent) : undefined; if (typeof flags.agent === "string" && !a) return fail(`No agent matches "${flags.agent}".`);
    const n = Math.min(50, Math.max(1, Number(flags.limit) || 10)); const list = s.traces.filter((t) => t.kind === "run" && (!a || t.agentIds.includes(a.id)) && (!flags.status || t.status === flags.status)).slice(0, n);
    return out(...table(["TRACE", "AGENT", "STATUS", "TIME", "COST", "STARTED"], list.map((t) => [t.id.slice(0, 12), s.agents.find((x) => x.id === t.agentId)?.name ?? t.agentId, t.status, `${(t.durationMs / 1000).toFixed(1)}s`, money(t.costUsd), ago(t.startedAt)])));
  }
  if (group === "workflows") {
    if (verb === "list") return out(...table(["NAME", "PATTERN", "AGENTS", "RUNS", "BUDGET"], s.workflows.map((w) => [w.name, w.pattern, String(w.agents.length), String(w.runs.length), money(w.budgetUsd)])));
    if (verb === "run") { const w = find(s.workflows, rest.join(" "), (x) => x.name); if (!w) return fail(`No workflow matches "${rest.join(" ")}". Run: workflows list`); const r = workflowActions.run(w.id); const run = agentsNow().workflows.find((x) => x.id === w.id)!.runs[0]; return (r.ok ? out : fail)(`${w.name}: ${run.status}`, `  ${(run.durationMs / 1000).toFixed(1)}s, ${money(run.costUsd)}`, ...(r.ok ? [] : [`  ${r.error}`])); }
    return fail(`Unknown command: workflows ${verb ?? ""}. Try: workflows list`);
  }
  if (group === "context") { if (verb !== "list") return fail("Try: context list"); return out(...table(["SPACE", "SCOPE", "PROJECT", "MEMBERS", "TIERS"], s.spaces.map((x) => [x.name, x.scope, x.project ?? "-", String(x.members.length), [x.hot.enabled && "hot", x.warm.enabled && "warm", x.blob.enabled && "blob"].filter(Boolean).join("+")]))); }
  if (group === "memory") {
    const a = agent(rest[0]); if (!a) return fail(`No agent matches "${rest[0] ?? ""}". Run: agents list`);
    const items = s.memoryItems[a.id] ?? [];
    if (verb === "list") { const k = typeof flags.kind === "string" ? flags.kind : null; if (k && !(k in KIND_BY_ID)) return fail(`Unknown kind. Use one of: ${MEMORY_KINDS.map((x) => x.id).join(", ")}`); const list = items.filter((i) => !k || i.kind === k); return out(...table(["ID", "KIND", "ABOUT", "TEXT"], list.map((i) => [i.id, i.kind, i.entity ?? "-", i.text.slice(0, 60)])), "", `${list.length} items`); }
    if (verb === "recall") {
      const kind = rest[1] as MemoryKind; const q = rest.slice(2).join(" "); const layer = a.memory?.layers.find((l) => l.kind === kind && l.enabled);
      if (!layer) return fail(`${kind ?? "That kind of"} memory is not turned on for ${a.name}.`); if (!q) return fail("Ask a question: memory recall <agent> <kind> \"what does the customer prefer?\"");
      const hits = recall(items.filter((i) => i.kind === kind), q, layer); return hits.length ? out(...table(["SCORE", "TEXT"], hits.map((h) => [h.score.toFixed(2), h.item.text.slice(0, 80)]))) : out("Nothing scores above the minimum.");
    }
    return fail(`Unknown command: memory ${verb ?? ""}. Try: memory list <agent>`);
  }
  if (group === "protocol") {
    if (verb === "types") return out(...MESSAGE_TYPES);
    if (verb === "example") { if (!rest[0] || !MESSAGE_TYPES.includes(rest[0])) return fail("Choose a message type. Run: protocol types"); return out(...JSON.stringify(exampleEnvelope(rest[0]), null, 2).split("\n")); }
    return fail(`Unknown command: protocol ${verb ?? ""}. Try: protocol types`);
  }
  return fail(`Unknown command: ${group}. Type help.`);
}
