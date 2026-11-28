import type { Agent, Span, Trace } from "./types";

/**
 * Plays a recorded trace back as activity on the Constellation. Real runs take milliseconds and, at a gate, hours, so playback keeps their order and overlap
 * and changes only the clock: every step is visible for at least a moment, and a wait for a person is shortened to a few seconds. The same function serves
 * the live view, which replays recent traces one after another, and the "Play on Constellation" link from a trace.
 */

export type Phase = "idle" | "running" | "waiting" | "error";
export type AgentFrame = { phase: Phase; /** What it is doing, in a few words. */ doing?: string };
export type ResourceFrame = { doing: string; agentId: string };
export type Frame = {
  agents: Record<string, AgentFrame>;
  /** Hand-offs in progress, as "from>to" agent ids. */
  hops: Set<string>;
  /** Connections, channels and RAG indexes in use, by key. */
  resources: Record<string, ResourceFrame>;
  /** How many runs each agent has in flight. */
  load: Record<string, number>;
};
export const emptyFrame = (): Frame => ({ agents: {}, hops: new Set(), resources: {}, load: {} });

export type Compiled = { trace: Trace; totalMs: number; spans: { span: Span; s: number; e: number }[] };

const MIN_STEP_MS = 240; const MAX_WAIT_MS = 3600; const SPEED = 1.1;
const isWait = (s: Span) => s.attrs?.["human.wait"] === true;

/** Maps trace time to playback time. Between two moments where something starts or ends, playback lasts the real time, at least a moment, and a pure wait for a person lasts at most a few seconds. */
export function compile(trace: Trace): Compiled {
  const cuts = [...new Set(trace.spans.flatMap((s) => [s.startMs, s.startMs + s.durMs]).concat(0, trace.durationMs))].sort((a, b) => a - b);
  const at = new Map<number, number>(); let wall = 0; at.set(cuts[0], 0);
  for (let i = 1; i < cuts.length; i++) {
    const a = cuts[i - 1], b = cuts[i]; const d = b - a;
    const live = trace.spans.filter((s) => s.startMs <= a && s.startMs + s.durMs >= b);
    const waitOnly = live.length > 0 && live.every(isWait);
    wall += waitOnly ? Math.min(MAX_WAIT_MS, Math.max(MIN_STEP_MS, d * 0.1)) : Math.max(MIN_STEP_MS, d / SPEED);
    at.set(b, wall);
  }
  return { trace, totalMs: wall, spans: trace.spans.map((span) => ({ span, s: at.get(span.startMs)!, e: at.get(span.startMs + span.durMs)! })) };
}

const VERB: Record<string, string> = {
  send_email: "Sending an email", send_sms: "Sending a text", notify_channel: "Posting a message", request_approval: "Asking for a decision", post_message: "Posting a message",
};
const KIND_DOING: Record<string, string> = { llm: "Thinking", tool: "Calling a tool", mcp: "Calling a tool", retrieval: "Searching knowledge", delegation: "Handing work on", memory: "Using memory", guardrail: "Checking policy", eval: "Scoring" };

/** What is going on at playback time t, in a trace compiled with `compile`. `agents` resolves peers named in hand-offs. */
export function frameAt(c: Compiled, t: number, agents: Agent[]): Frame {
  const f = emptyFrame(); const byName = new Map(agents.map((a) => [a.name, a.id]));
  const bump = (id: string, p: Phase, doing?: string) => {
    const cur = f.agents[id]; const rank = { idle: 0, running: 1, waiting: 2, error: 3 } as const;
    if (!cur || rank[p] > rank[cur.phase] || (rank[p] === rank[cur.phase] && !cur.doing)) f.agents[id] = { phase: p, doing };
  };
  for (const { span, s, e } of c.spans) {
    const on = t >= s && t < e; const justFailed = span.status === "error" && t >= e && t < e + 900;
    if (!on && !justFailed) continue;
    if (span.status === "error" && (on || justFailed)) { bump(span.agentId, "error", "Failed"); }
    if (!on) continue;
    if (span.kind === "delegation") {
      const peer = byName.get(String(span.attrs?.["peer.agent"] ?? "")); if (peer) { f.hops.add(`${span.agentId}>${peer}`); bump(span.agentId, "running", "Handing work on"); }
      continue;
    }
    if (span.parent === null) { f.load[span.agentId] = (f.load[span.agentId] ?? 0) + 1; bump(span.agentId, "running"); continue; }
    if (isWait(span)) { bump(span.agentId, "waiting", `Waiting for ${String(span.attrs?.["human.assignee"] ?? "a person")}`); const k = span.attrs?.["connector.key"]; if (k) f.resources[String(k)] = { doing: "Waiting for an answer", agentId: span.agentId }; continue; }
    const tool = String(span.attrs?.["mcp.tool"] ?? "");
    bump(span.agentId, "running", VERB[tool] ?? KIND_DOING[span.kind] ?? "Working");
    const ck = span.attrs?.["connector.key"] ?? span.attrs?.["knowledge.key"];
    if (ck) f.resources[String(ck)] = { doing: span.kind === "retrieval" ? "Searched" : VERB[tool] ?? "Used", agentId: span.agentId };
  }
  return f;
}

/** Merges the frames of several runs that are playing at once. */
export function merge(frames: Frame[]): Frame {
  const out = emptyFrame(); const rank = { idle: 0, running: 1, waiting: 2, error: 3 } as const;
  for (const f of frames) {
    for (const [id, a] of Object.entries(f.agents)) { const cur = out.agents[id]; if (!cur || rank[a.phase] > rank[cur.phase]) out.agents[id] = a; }
    f.hops.forEach((h) => out.hops.add(h));
    Object.assign(out.resources, f.resources);
    for (const [id, n] of Object.entries(f.load)) out.load[id] = (out.load[id] ?? 0) + n;
  }
  return out;
}
