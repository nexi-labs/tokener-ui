/**
 * How an agent calls its tools.
 *
 * Direct: the model is shown the definition of every tool it may use and asks for one call at a time. Each result goes back through the model.
 * Code Mode: the model is shown a small typed API generated from the same tools, writes a short TypeScript program that makes several calls and
 * combines the results, and the program runs in a sandbox. Only the final output returns to the model. The idea was published by Cloudflare
 * (Code Mode, with a Cloudflare MCP server that exposes search and execute).
 *
 * In both modes every tool call goes through the same tool policy engine, the same approvals and the same audit. The sandbox has no network of its
 * own and holds no secret. (docs/29, section "Code Mode"; docs/47, section 13)
 */

export type ToolMode = "direct" | "code";
export type SandboxKind = "isolate" | "wasm" | "microvm" | "cloudflare";

export type SandboxInfo = { id: SandboxKind; label: string; runs: string; isolation: string; leaves: boolean; blurb: string; status: "Planned" };
export const SANDBOXES: SandboxInfo[] = [
  { id: "isolate", label: "Isolate in your cluster", runs: "A V8 isolate pool next to the gateway, on your own nodes", isolation: "One isolate per run, no filesystem, no network except the tool bindings", leaves: false, blurb: "Closest to what Cloudflare describes. Fast to start, so it suits short programs that call a few tools.", status: "Planned" },
  { id: "wasm", label: "WebAssembly runtime", runs: "A QuickJS build compiled to WebAssembly, inside the gateway process pool", isolation: "Memory and instruction limits set by the host, no system calls", leaves: false, blurb: "The smallest footprint and the easiest to review. Slower for heavy computation.", status: "Planned" },
  { id: "microvm", label: "Micro virtual machine", runs: "gVisor or Firecracker sandboxes on a dedicated node pool", isolation: "A separate kernel for each run", leaves: false, blurb: "The strongest wall, and the choice when the generated code may use libraries. Starts slower and costs more.", status: "Planned" },
  { id: "cloudflare", label: "Cloudflare Workers", runs: "Cloudflare's Dynamic Workers, through a Cloudflare connection", isolation: "Isolates run by Cloudflare", leaves: true, blurb: "No sandbox to operate. Tool arguments and results pass through Cloudflare, so check your data location policy first.", status: "Planned" },
];
export const SANDBOX_BY_ID = Object.fromEntries(SANDBOXES.map((s) => [s.id, s])) as Record<SandboxKind, SandboxInfo>;

export type CodeLimits = { cpuMs: number; memoryMb: number; wallSec: number; toolCalls: number; outputKb: number };
export type CodeMode = {
  sandbox: SandboxKind;
  /** The id of a Cloudflare connection in the Integrations hub. Only for the Cloudflare sandbox. */
  connection?: string;
  limits: CodeLimits;
  /** A person reads the generated program before it runs. Slows the run, and is the safe choice while Code Mode is new for this agent. */
  reviewCode: boolean;
  /** Keep each program with its trace, so a run can be replayed and compared. */
  keepCode: boolean;
};
export type ToolCalling = { mode: ToolMode; code?: CodeMode };

export const defaultCodeMode = (): CodeMode => ({ sandbox: "isolate", limits: { cpuMs: 5000, memoryMb: 128, wallSec: 30, toolCalls: 25, outputKb: 64 }, reviewCode: false, keepCode: true });
export const defaultToolCalling = (): ToolCalling => ({ mode: "direct" });
export const LIMIT_RANGE: Record<keyof CodeLimits, [number, number]> = { cpuMs: [100, 60_000], memoryMb: [16, 1024], wallSec: [1, 300], toolCalls: [1, 200], outputKb: [1, 1024] };
export const LIMIT_LABEL: Record<keyof CodeLimits, { label: string; unit: string; blurb: string }> = {
  cpuMs: { label: "Processor time", unit: "milliseconds", blurb: "Stops a loop that never ends." },
  memoryMb: { label: "Memory", unit: "MB", blurb: "The most the program may hold at once." },
  wallSec: { label: "Time, start to finish", unit: "seconds", blurb: "Includes the time waiting for tools and for approvals that need no person." },
  toolCalls: { label: "Tool calls", unit: "calls", blurb: "Counted across all tools in one program." },
  outputKb: { label: "Result returned to the model", unit: "KB", blurb: "Anything longer is cut and flagged." },
};

export type CallIssue = { path: string; message: string; level: "error" | "warning" };

export function validateToolCalling(tc: ToolCalling | undefined, ctx: { control?: string; hasSensitiveTools?: boolean; runtime?: string; toolCount?: number } = {}): CallIssue[] {
  const out: CallIssue[] = []; if (!tc || tc.mode === "direct") return out;
  const err = (path: string, message: string) => out.push({ path, message, level: "error" }); const warn = (path: string, message: string) => out.push({ path, message, level: "warning" });
  const c = tc.code;
  if (ctx.control && ctx.control !== "governed") err("toolCalling", "Code Mode needs every tool call to pass the gateway, so it is only for governed agents.");
  if (ctx.runtime === "external") err("toolCalling", "An agent that runs elsewhere calls its own tools. Code Mode applies to agents that tok∑ner runs.");
  if (!c) { err("toolCalling.code", "Choose where the generated program runs."); return out; }
  for (const k of Object.keys(LIMIT_RANGE) as (keyof CodeLimits)[]) {
    const [lo, hi] = LIMIT_RANGE[k]; const v = c.limits[k];
    if (!Number.isFinite(v) || v < lo || v > hi) err(`toolCalling.code.limits.${k}`, `${LIMIT_LABEL[k].label} must be between ${lo.toLocaleString("en-US")} and ${hi.toLocaleString("en-US")} ${LIMIT_LABEL[k].unit}.`);
  }
  if (c.sandbox === "cloudflare" && !c.connection) err("toolCalling.code.connection", "Choose the Cloudflare connection the programs run through.");
  if (c.sandbox === "cloudflare") warn("toolCalling.code.sandbox", "Tool arguments and results pass through Cloudflare. The data location policy and data protection rules still apply to each call, and a call that would leave the allowed places is refused.");
  if (ctx.hasSensitiveTools && !c.reviewCode) warn("toolCalling.code.reviewCode", "This agent has sensitive tools. A write inside a program still stops for approval, but reading the program first is the safer start.");
  if (ctx.toolCount !== undefined && ctx.toolCount > 0 && ctx.toolCount < 4) warn("toolCalling", "With only a few tools the definitions are small. Direct calls are usually as good, and simpler to follow.");
  warn("toolCalling.code", "No sandbox is available yet. Until one is, this agent keeps calling tools directly and the setting is recorded.");
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// A rough comparison. It is arithmetic on the sizes entered, not a measurement. Measured numbers come from running the same eval suite in both
// modes (Evals), which is the only fair way to compare.

export type TokenInputs = { tools: number; defTokens: number; steps: number; resultTokens: number };
export type TokenEstimate = { direct: number; code: number; saved: number; savedPct: number };
/** Code Mode shows the model one small typed surface (about a thousand tokens), then the program, then only the final result. */
export const CODE_SURFACE_TOKENS = 1000;
export function estimateTokens(i: TokenInputs): TokenEstimate {
  const defs = Math.max(0, i.tools) * Math.max(0, i.defTokens);
  const steps = Math.max(1, Math.round(i.steps));
  // Direct: definitions on the first call and again on each step, plus every result passing through the model, plus a short request each time.
  const direct = steps * (defs + 80) + steps * Math.max(0, i.resultTokens);
  // Code: the surface once, one program of about 60 tokens per step, and a single final result of about one result.
  const code = CODE_SURFACE_TOKENS + steps * 60 + Math.max(0, i.resultTokens);
  const saved = direct - code;
  return { direct: Math.round(direct), code: Math.round(code), saved: Math.round(saved), savedPct: direct > 0 ? Math.round((saved / direct) * 100) : 0 };
}

/** A sample of what the model is shown in Code Mode: the typed surface for the agent's own tools. */
export function sampleSurface(tools: { server: string; tool: string }[]): string {
  const ident = (s: string) => s.replace(/[^A-Za-z0-9]+(.)?/g, (_, c: string) => (c ? c.toUpperCase() : "")).replace(/^./, (c) => c.toLowerCase());
  const by = new Map<string, string[]>(); for (const t of tools) by.set(t.server, [...(by.get(t.server) ?? []), t.tool]);
  const lines: string[] = ["// Generated from the tools this agent may use.", "// Types come from each tool's input schema.", "declare const tools: {"];
  for (const [srv, names] of by) { lines.push(`  ${ident(srv)}: {`); for (const n of names) lines.push(`    ${ident(n)}(input: ${ident(n).replace(/^./, (c) => c.toUpperCase())}Input): Promise<${ident(n).replace(/^./, (c) => c.toUpperCase())}Result>;`); lines.push("  };"); }
  lines.push("};", "// Only these calls exist.", "// No network, no file access, no secret.");
  return lines.join("\n");
}
