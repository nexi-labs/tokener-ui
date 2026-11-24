/**
 * Checks Agent Forge's generator (src/lib/agents/codegen.ts).
 *  1. Every buildable framework produces a project; Python compiles (py_compile) and TypeScript has no syntax errors (transpile only).
 *  2. The specification file parses as YAML and agrees with the spec.
 *  3. The generated TAP server is run with a stub agent (the framework packages are not installed here) in both Python (FastAPI) and TypeScript (node:http)
 *     and its replies are checked with the protocol validator: card, auth, replay, conflict, expiry, depth, sync and async tasks, cancel, suspend and resume.
 * What this does not prove: that the framework code works against each framework's current release. Versions are unpinned in the output on purpose.
 * From tokener-ui: npx tsx --tsconfig scripts/tsconfig.scripts.json scripts/check-agent-codegen.ts
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import ts from "typescript";
import { BUILDABLE } from "../src/lib/agents/adapters";
import { DEFAULT_SPEC, generateProject, validateSpec, type ForgeSpec } from "../src/lib/agents/codegen";
import { zip } from "../src/lib/agents/zip";
import { exampleEnvelope, validateCard, validateEnvelope } from "../src/lib/agents/protocol";

let fail = 0; const ok = (c: boolean, n: string, extra = "") => { if (!c) fail++; console.log(c ? "ok  " : "FAIL", n + (c ? "" : " " + extra)); };
const root = mkdtempSync(join(tmpdir(), "forge-"));
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function write(dir: string, files: { path: string; content: string }[]) {
  for (const f of files) { const p = join(dir, f.path); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, f.content); }
}

async function main() {
  // spec validation
  ok(validateSpec(DEFAULT_SPEC).length === 0, "the default spec is valid", JSON.stringify(validateSpec(DEFAULT_SPEC)));
  const bad = clone(DEFAULT_SPEC); bad.name = "Bad Name"; bad.instructions = "short"; bad.budget = { perTaskUsd: 5, monthlyUsd: 1 }; bad.tools = [{ server: "x", allow: [] }];
  const fields = validateSpec(bad).map((i) => i.field);
  ok(["name", "instructions", "budget"].every((f) => fields.includes(f)) && fields.some((f) => f.startsWith("tools")), "spec problems are reported by field", fields.join());
  const noFw = clone(DEFAULT_SPEC); noFw.framework = "nope";
  ok(validateSpec(noFw).some((i) => i.field === "framework"), "an unknown framework is rejected");

  const variants: Record<string, Partial<ForgeSpec>> = {
    "with tools": {},
    "no tools": { tools: [], memory: "none" },
    "quotes and newlines": { title: 'Say "hi"', description: "It's a test\nwith a newline", instructions: 'Line one with "quotes" and \\ backslash.\nLine two with a $dollar and a `tick`.', tools: [{ server: "crm", allow: ["a", "b"] }, { server: "wiki", allow: ["search"] }] },
  };

  for (const a of BUILDABLE) {
    for (const [vn, patch] of Object.entries(variants)) {
      const spec: ForgeSpec = { ...clone(DEFAULT_SPEC), ...clone(patch), framework: a.id };
      const label = `${a.id} (${vn})`;
      const issues = validateSpec(spec);
      if (issues.length) { ok(false, label + " spec valid", JSON.stringify(issues)); continue; }
      const files = generateProject(spec);
      const dir = join(root, a.id + "-" + vn.replace(/\W+/g, "_"));
      write(dir, files);
      const paths = files.map((f) => f.path);
      ok((a.build!.language === "spec" ? ["tokener.agent.yaml", "README.md"] : ["tokener.agent.yaml", "README.md", "Dockerfile", ".env.example"]).every((p) => paths.includes(p)) && new Set(paths).size === paths.length, `${label} has the expected files`, paths.join());
      ok(!files.some((f) => /\{\{\w+\}\}/.test(f.content)), `${label} has no unfilled placeholders`);
      ok(!files.some((f) => /sk-[A-Za-z0-9]{10,}|secretref:\/\//.test(f.content)), `${label} embeds no credential`);
      if (a.build!.language === "spec") ok(paths.length === 2, `${label} is the specification and a README only`, paths.join());
      else if (a.build!.language === "python") {
        const r = spawnSync("python3", ["-I", "-m", "py_compile", "agent.py", "relay_server.py"], { cwd: dir, encoding: "utf8" });
        ok(r.status === 0, `${label} Python compiles`, r.stderr);
      } else {
        for (const f of files.filter((x) => x.path.endsWith(".ts"))) {
          const out = ts.transpileModule(f.content, { reportDiagnostics: true, fileName: f.path, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext } });
          ok((out.diagnostics ?? []).length === 0, `${label} ${f.path} parses`, (out.diagnostics ?? []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, " ")).join("; "));
        }
        const pkg = JSON.parse(files.find((f) => f.path === "package.json")!.content);
        ok(pkg.type === "module" && a.build!.packages.every((p) => p in pkg.dependencies), `${label} package.json lists the dependencies`);
      }
    }
  }

  // the zip download
  {
    const proj = generateProject({ ...clone(DEFAULT_SPEC), framework: "langgraph" }).map((f) => ({ path: "support-triage/" + f.path, content: f.content }));
    writeFileSync(join(root, "p.zip"), zip(proj));
    const z = spawnSync("python3", ["-I", "-c", "import sys,zipfile,json;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps({'bad':z.testzip(),'names':z.namelist(),'agent':z.read('support-triage/agent.py').decode()[:40]}))", join(root, "p.zip")], { encoding: "utf8" });
    const o = z.status === 0 ? JSON.parse(z.stdout) : null;
    ok(!!o && o.bad === null && o.names.length === proj.length && o.agent.includes("Support triage"), "the downloaded zip opens, passes its CRC test and holds every file", z.stderr);
  }

  // the specification file
  const spec: ForgeSpec = { ...clone(DEFAULT_SPEC), title: 'Say "hi": now', description: "true", instructions: "Line one.\nLine two: with a colon.", tools: [{ server: "crm", allow: ["a", "b"] }] };
  const yamlFile = generateProject(spec).find((f) => f.path === "tokener.agent.yaml")!;
  write(root, [{ path: "spec.yaml", content: yamlFile.content }]);
  const y = spawnSync("python3", ["-I", "-c", "import json,sys,yaml;print(json.dumps(yaml.safe_load(open(sys.argv[1]))))", join(root, "spec.yaml")], { encoding: "utf8" });
  if (y.status !== 0) ok(false, "specification parses as YAML", y.stderr.slice(-200));
  else {
    const d = JSON.parse(y.stdout);
    ok(d.metadata.uri === "agent://acme/support-triage" && d.metadata.title === spec.title && d.metadata.description === "true" && d.spec.instructions.trim() === spec.instructions
      && d.spec.tools[0].server === "crm" && d.spec.tools[0].allow.join() === "a,b" && d.spec.budget.perTaskUsd === 0.5 && d.spec.protocol.modes.join() === "sync,async", "the specification parses and matches the spec", y.stdout.slice(0, 300));
  }

  // the Python server, run with a stub agent
  const py = join(root, "py-server");
  write(py, generateProject({ ...clone(DEFAULT_SPEC), framework: "langgraph" }).filter((f) => f.path === "relay_server.py"));
  write(py, [{ path: "agent.py", content: "import asyncio\nasync def run(text, session_id=None):\n    if text.startswith('slow'):\n        await asyncio.sleep(5)\n    return 'echo: ' + text\n" }]);
  const pyPort = 18500 + Math.floor(Math.random() * 100);
  await withServer("Python server", pyPort, () => spawn("python3", ["-m", "uvicorn", "relay_server:app", "--port", String(pyPort), "--log-level", "warning"], { cwd: py, env: { ...process.env, TOKENER_PEER_TOKEN: "peer-secret", PUBLIC_URL: "https://agent.test", PYTHONPATH: py }, stdio: "ignore" }));

  // the TypeScript server, run with a stub agent
  const tsDir = join(root, "ts-server"); mkdirSync(tsDir, { recursive: true });
  const tsSrc = generateProject({ ...clone(DEFAULT_SPEC), framework: "vercel-ai" }).find((f) => f.path === "src/server.ts")!.content;
  const js = ts.transpileModule(tsSrc, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  write(tsDir, [{ path: "package.json", content: '{"type":"module"}' }, { path: "server.js", content: js },
    { path: "agent.js", content: "export async function run(text){ if (text.startsWith('slow')) await new Promise(r=>setTimeout(r,5000)); return 'echo: ' + text; }\n" }]);
  const tsPort = 18700 + Math.floor(Math.random() * 100);
  await withServer("TypeScript server", tsPort, () => spawn("node", ["server.js"], { cwd: tsDir, env: { ...process.env, TOKENER_PEER_TOKEN: "peer-secret", PORT: String(tsPort), PUBLIC_URL: "https://agent.test" }, stdio: "ignore" }));

  rmSync(root, { recursive: true, force: true });
  console.log(fail ? `\n${fail} check(s) failed` : "\nall checks passed");
  process.exit(fail ? 1 : 0);
}


async function withServer(name: string, port: number, start: () => ReturnType<typeof spawn>) {
  const child = start();
  try {
    let up = false;
    for (let i = 0; i < 80 && !up; i++) { try { await fetch(`http://127.0.0.1:${port}/health`); up = true; } catch { await sleep(150); } }
    if (!up) { ok(false, `${name} started`); return; }
    const call: Call = async (path, body, token = "peer-secret", method = "POST") => {
      const r = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { ...(token ? { Authorization: "Bearer " + token } : {}), "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: r.status, body: (await r.json()) as any };
    };
    await assertServer(name, await scenario(call));
  } finally { child.kill(); }
}

type Call = (path: string, body: unknown, token?: string | null, method?: string) => Promise<{ status: number; body: any }>;
const AGENT = "agent://acme/support-triage";
const task = (extra: Record<string, unknown> = {}, over: Record<string, unknown> = {}) => {
  const e: any = exampleEnvelope("relay.task.create", { to: AGENT });
  e.payload = { ...e.payload, task: { capability: "support.triage", input: { text: "hello" } }, mode: "sync", ...extra };
  return { ...e, ...over };
};

/** Runs the same scenario against a server, so both implementations are held to one standard. */
async function scenario(call: Call) {
  const out: Record<string, { status: number; body: any }> = {};
  const hdr = exampleEnvelope("atlas.card.get", { to: AGENT });
  out.card = await call("/.well-known/tokener-agent.json", undefined, null, "GET");
  out.cardRelay = await call("/relay", hdr);
  out.noAuth = await call("/relay", task(), null);
  out.badAuth = await call("/relay", task(), "wrong");
  out.sync = await call("/relay", task());
  const same = task(); const first = await call("/relay", same); const again = await call("/relay", same);
  out.replay = { status: again.status, body: { same: JSON.stringify(first.body) === JSON.stringify(again.body) } };
  out.conflict = await call("/relay", { ...same, payload: { ...same.payload, task: { capability: "x", input: { text: "other" } } } });
  out.expired = await call("/relay", task({}, { ts: "2020-01-01T00:00:00.000Z", ttlMs: 1000 }));
  const deep = task(); deep.trace = { ...deep.trace, depth: 99 }; out.deep = await call("/relay", deep);
  out.wrongTo = await call("/relay", task({}, { to: "agent://acme/someone-else" }));
  out.version = await call("/relay", task({}, { tap: "2.0" }));
  out.notJson = await call("/relay", "not an envelope");
  out.deadline = await call("/relay", task({ task: { capability: "x", input: { text: "slow thing" } }, deadlineMs: 150 }));
  const asyncStart = await call("/relay", task({ mode: "async" }));
  out.async = asyncStart;
  await new Promise((r) => setTimeout(r, 300));
  const taskId = asyncStart.body?.payload?.taskId;
  out.poll = await call(`/relay/tasks/${taskId}`, undefined, "peer-secret", "GET");
  out.pollMissing = await call("/relay/tasks/tsk_NOPE", undefined, "peer-secret", "GET");
  const slow = await call("/relay", task({ mode: "async", task: { capability: "x", input: { text: "slow job" } } }));
  const cancel = exampleEnvelope("relay.task.cancel", { to: AGENT }); cancel.payload = { taskId: slow.body.payload.taskId };
  out.cancel = await call("/relay", cancel);
  const susp = exampleEnvelope("pulse.suspend", { to: AGENT }); susp.payload = { reason: "check", mode: "drain" };
  out.suspend = await call("/pulse", susp);
  out.whileSuspended = await call("/relay", task());
  out.resume = await call("/pulse", exampleEnvelope("pulse.resume", { to: AGENT }));
  out.afterResume = await call("/relay", task());
  out.ping = await call("/pulse", exampleEnvelope("pulse.ping", { to: AGENT }));
  return out;
}

async function assertServer(name: string, r: Record<string, { status: number; body: any }>) {
  const p = (k: string) => r[k]?.body?.payload;
  const valid = (k: string) => validateEnvelope(r[k].body, new Date()).map((i) => i.path + ": " + i.message).join("; ");
  ok(validateCard(r.card.body).length === 0, `${name}: the agent card passes the card checker`, JSON.stringify(validateCard(r.card.body)));
  ok(r.card.body.uri === AGENT && r.card.body.capabilities[0].id === "support.triage", `${name}: the card names the agent and its capability`);
  ok(r.cardRelay.status === 200 && r.cardRelay.body.type === "atlas.card" && valid("cardRelay") === "", `${name}: atlas.card.get returns a valid atlas.card`, valid("cardRelay"));
  ok(r.noAuth.status === 401 && p("noAuth").error.code === "tap.unauthorized", `${name}: no token is refused`);
  ok(r.badAuth.status === 401, `${name}: a wrong token is refused`);
  ok(r.sync.status === 200 && p("sync").state === "completed" && p("sync").output.text === "echo: hello" && valid("sync") === "", `${name}: a sync task completes with a valid result`, valid("sync") + JSON.stringify(r.sync.body).slice(0, 200));
  ok(/^msg_/.test(r.sync.body.replyTo ?? "") && r.sync.body.trace.depth === 1 && /^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/.test(r.sync.body.trace.traceparent), `${name}: the reply keeps the trace and points at the request`);
  ok(r.replay.body.same, `${name}: the same id with the same body replays the first reply`);
  ok(r.conflict.status === 409 && p("conflict").error.code === "tap.conflict", `${name}: the same id with a different body conflicts`);
  ok(p("expired")?.error?.code === "tap.expired", `${name}: an expired message is refused`);
  ok(p("deep")?.error?.code === "tap.depth_exceeded", `${name}: a delegation chain beyond the maximum depth is refused`);
  ok(p("wrongTo")?.error?.code === "tap.not_found", `${name}: a message for another agent is refused`);
  ok(p("version")?.error?.code === "tap.unsupported_version", `${name}: another major version is refused`);
  ok(r.notJson.status === 400 && p("notJson").error.code === "tap.invalid_envelope", `${name}: a body that is not an envelope is refused`);
  ok(p("deadline")?.state === "failed" && p("deadline").error.code === "tap.timeout" && p("deadline").error.retryable === true, `${name}: a deadline ends the task with tap.timeout`);
  ok(p("async")?.state === "submitted" && typeof p("async").taskId === "string", `${name}: an async task is accepted as submitted`);
  ok(p("poll")?.state === "completed" && p("poll").output.text === "echo: hello", `${name}: polling returns the finished result`, JSON.stringify(r.poll.body).slice(0, 200));
  ok(r.pollMissing.status === 404, `${name}: polling an unknown task is 404`);
  ok(p("cancel")?.state === "canceled", `${name}: a running task can be canceled`, JSON.stringify(r.cancel.body).slice(0, 200));
  ok(p("suspend")?.state === "suspended" && valid("suspend") === "", `${name}: suspend answers pulse.status suspended`, valid("suspend"));
  ok(r.whileSuspended.status === 409 && p("whileSuspended").error.code === "tap.suspended" && p("whileSuspended").error.retryable === true, `${name}: a suspended agent refuses new tasks`);
  ok(p("resume")?.state === "ready", `${name}: resume makes it ready again`);
  ok(p("afterResume")?.state === "completed", `${name}: tasks run again after resume`);
  ok(p("ping")?.state === "ready" && p("ping").uptimeSec >= 0, `${name}: ping reports state and uptime`);
}

main().catch((e) => { console.error(e); process.exit(1); });
