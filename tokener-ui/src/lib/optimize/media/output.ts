/**
 * Controls on what a model writes back. Output tokens cost several times what input tokens cost, so they are worth controlling even though the
 * model, not the gateway, decides what to write. Four controls:
 *
 *  - a cap on output tokens per application, which never raises a limit the caller set lower;
 *  - a brevity directive added to the end of the last user message, so everything before it, including the system prompt that providers cache, is untouched;
 *  - a default reasoning effort for models that bill their reasoning as output, applied only when the caller did not choose one;
 *  - a guard that cancels a generation that has fallen into a loop, which is the one case where output tokens are wasted with certainty.
 */
export type Brevity = "off" | "concise" | "terse";
export type Reasoning = "low" | "medium" | "high";
export type OutputPolicy = { maxTokens: number | null; brevity: Brevity; reasoning: Reasoning | null; guard: boolean };
export type Part = { type: string; text?: string; [k: string]: unknown };
export type Message = { role: string; content: string | Part[]; [k: string]: unknown };
export type ChatRequest = { model: string; messages: Message[]; max_tokens?: number; reasoning_effort?: string; [k: string]: unknown };

export const DIRECTIVE: Record<Exclude<Brevity, "off">, string> = {
  concise: "Answer directly and concisely. Do not restate the question or add a closing summary unless asked.",
  terse: "Answer in as few words as fully answer the question. No preamble, no restating the question, no closing summary.",
};
export const DEFAULT_OUTPUT: OutputPolicy = { maxTokens: null, brevity: "off", reasoning: null, guard: true };

/** Models that accept a reasoning effort and bill the reasoning as output. */
export const reasoningModel = (model: string) => /^(gpt-5|o1|o3|o4)/i.test(model);

export function applyOutputPolicy(req: ChatRequest, policy: OutputPolicy): { request: ChatRequest; changes: string[] } {
  const changes: string[] = [];
  const out: ChatRequest = { ...req, messages: req.messages.map((m) => ({ ...m })) };
  if (policy.maxTokens && policy.maxTokens > 0) {
    const was = req.max_tokens;
    if (was === undefined || was > policy.maxTokens) { out.max_tokens = policy.maxTokens; changes.push(was === undefined ? `Output capped at ${policy.maxTokens} tokens` : `Output cap lowered from ${was} to ${policy.maxTokens} tokens`); }
  }
  if (policy.brevity !== "off") {
    const text = DIRECTIVE[policy.brevity];
    let i = out.messages.length - 1;
    while (i >= 0 && out.messages[i].role !== "user") i--;
    if (i >= 0) {
      const m = out.messages[i];
      if (typeof m.content === "string") { if (!m.content.includes(text)) { m.content = `${m.content}\n\n${text}`; changes.push(`Brevity directive added (${policy.brevity})`); } }
      else {
        let j = m.content.length - 1;
        while (j >= 0 && !(m.content[j].type === "text" && typeof m.content[j].text === "string")) j--;
        if (j >= 0 && !(m.content[j].text as string).includes(text)) {
          const parts = m.content.slice(); parts[j] = { ...parts[j], text: `${parts[j].text}\n\n${text}` }; m.content = parts;
          changes.push(`Brevity directive added (${policy.brevity})`);
        }
      }
    }
  }
  if (policy.reasoning && reasoningModel(req.model) && req.reasoning_effort === undefined) { out.reasoning_effort = policy.reasoning; changes.push(`Reasoning effort set to ${policy.reasoning}`); }
  return { request: out, changes };
}

/**
 * Detects a generation stuck in a loop. It trips when the end of the output is the same stretch of text repeated at least `repeats` times in a
 * row, the stretch is between `minUnit` and `maxUnit` characters, and the repetition spans at least `minSpan` characters. A stretch built from
 * one or two distinct characters, such as a long rule of dashes, is allowed to run much longer before it counts. Feeding it the stream as it
 * arrives costs a bounded amount per check, and a check runs once per 32 new characters.
 */
export class RepetitionGuard {
  private buf = ""; private total = 0; private checkedAt = 0;
  constructor(private o = { minUnit: 12, maxUnit: 400, repeats: 4, minSpan: 240, window: 4000, simpleSpan: 1500 }) {}
  /** Feeds the next piece of output. Returns the repeated unit when the output has fallen into a loop. */
  push(delta: string): { tripped: boolean; unit?: string; at?: number } {
    this.buf += delta; this.total += delta.length;
    if (this.buf.length > this.o.window) this.buf = this.buf.slice(this.buf.length - this.o.window);
    if (this.total - this.checkedAt < 32) return { tripped: false };
    this.checkedAt = this.total;
    const b = this.buf, n = b.length;
    for (let L = this.o.minUnit; L <= this.o.maxUnit && L * this.o.repeats <= n; L++) {
      const unit = b.slice(n - L);
      let k = 1;
      while ((k + 1) * L <= n && b.startsWith(unit, n - (k + 1) * L)) k++;
      if (k < this.o.repeats) continue;
      const span = k * L, simple = new Set(unit).size <= 2;
      if (span >= (simple ? this.o.simpleSpan : this.o.minSpan)) return { tripped: true, unit, at: this.total };
    }
    return { tripped: false };
  }
}
