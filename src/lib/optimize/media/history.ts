import { criticalDetails, present } from "../tec/critical";
import type { Counter } from "../tec/types";

/**
 * Compacting the history an agent resends on every turn. An agent loop sends the whole conversation each time, so a large tool result from
 * turn 3 is paid for again on turn 4, 5, 6 and so on. Results from earlier turns are rarely read again in full, so:
 *
 *  - a tool result identical to an earlier one is replaced with a pointer to it;
 *  - a tool result from before the last `keepTurns` user turns that is longer than `maxTokens` keeps its start and its end, with a marker saying how much was removed.
 *
 * System, user and assistant messages are never touched, and nothing from the last `keepTurns` turns is touched. This step can remove detail the
 * model would later want, so it is off unless an application turns it on, and every number or identifier it removes is listed.
 */
export type HMessage = { role: string; content: string; tool_call_id?: string; name?: string; [k: string]: unknown };
export type HistoryOptions = { keepTurns: number; maxTokens: number; head: number };
export const DEFAULT_HISTORY: HistoryOptions = { keepTurns: 2, maxTokens: 400, head: 0.6 };
export type HistoryReport = { deduped: number; trimmed: number; tokensBefore: number; tokensAfter: number; cut: string[] };

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** The start and the end of a text that together fit a token budget, split by lines when there are lines and by characters when there are not. */
function ends(text: string, budget: number, head: number, counter: Counter): { text: string; removed: number } {
  const total = counter.count(text);
  const lines = text.split("\n");
  const take = (arr: string[], tokens: number) => { const out: string[] = []; let used = 0; for (const l of arr) { const c = counter.count(l) + 1; if (used + c > tokens && out.length) break; out.push(l); used += c; } return out; };
  let start: string, end: string;
  if (lines.length >= 6) {
    start = take(lines, Math.floor(budget * head)).join("\n");
    end = take(lines.slice().reverse(), budget - Math.floor(budget * head)).reverse().join("\n");
  } else {
    const keep = Math.max(1, Math.floor((text.length * budget) / Math.max(total, 1)));
    start = text.slice(0, Math.floor(keep * head)); end = text.slice(text.length - (keep - Math.floor(keep * head)));
  }
  const kept = counter.count(start) + counter.count(end);
  return { text: `${start}\n[... ${Math.max(0, total - kept)} tokens removed from this earlier tool result ...]\n${end}`, removed: Math.max(0, total - kept) };
}

export function compactHistory(messages: HMessage[], counter: Counter, opt: HistoryOptions = DEFAULT_HISTORY): { messages: HMessage[]; report: HistoryReport } {
  // The protected tail starts at the keepTurns-th user message from the end.
  let seen = 0, tail = messages.length;
  for (let i = messages.length - 1; i >= 0 && seen < opt.keepTurns; i--) if (messages[i].role === "user") { seen++; tail = i; }
  const firstSeen = new Map<string, string>();
  const out: HMessage[] = []; const cut: string[] = [];
  let deduped = 0, trimmed = 0, before = 0, after = 0;
  messages.forEach((m, i) => {
    const t0 = counter.count(m.content); before += t0;
    if (m.role !== "tool" || i >= tail || typeof m.content !== "string") { out.push(m); after += t0; if (m.role === "tool" && typeof m.content === "string") { const k = norm(m.content); if (!firstSeen.has(k)) firstSeen.set(k, m.tool_call_id ?? String(i)); } return; }
    const key = norm(m.content), prior = firstSeen.get(key);
    if (prior !== undefined && t0 >= 20) { const c = `[Same result as the earlier tool message ${prior}]`; out.push({ ...m, content: c }); after += counter.count(c); deduped++; return; }
    if (!firstSeen.has(key)) firstSeen.set(key, m.tool_call_id ?? String(i));
    if (t0 <= opt.maxTokens) { out.push(m); after += t0; return; }
    const e = ends(m.content, opt.maxTokens, opt.head, counter);
    for (const d of criticalDetails(m.content)) if (!present(e.text, d)) cut.push(d);
    out.push({ ...m, content: e.text }); after += counter.count(e.text); trimmed++;
  });
  return { messages: out, report: { deduped, trimmed, tokensBefore: before, tokensAfter: after, cut: [...new Set(cut)] } };
}
