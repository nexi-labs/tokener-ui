/**
 * The prompt optimizer as the console sees it. The conversion itself lives in `./tec` (token-efficient conversion): every input is read into
 * headings, paragraphs, lists, tables and code, cleaned, and written back in the form that costs the fewest tokens, with a check at the end that
 * every number, identifier, address and link is still there. This file keeps the names the console pages use and runs the same engine the
 * gateway implements, so what the page shows is what a request would get.
 */
import { convert } from "./tec/engine";
import { criticalDetails } from "./tec/critical";
import { approxCount, approxCounter } from "./tec/tokens";
import { KEEP, LEVEL_STAGES, PIPELINE, STAGE_META, type Counter, type Level, type Result, type Risk, type StageId, type StageReport } from "./tec/types";

export type Mode = Level;
export type { Risk, StageId };
export { criticalDetails };

export const STAGES: { id: StageId; label: string; risk: Risk; body: string }[] = PIPELINE.map((id) => ({ id, ...STAGE_META[id] }));
export const MODE_STAGES: Record<Mode, StageId[]> = LEVEL_STAGES;
export const PRUNE_KEEP: Record<Mode, number> = KEEP;
export const estimateTokens = approxCount;

export type StageResult = StageReport;
export type Run = Result;

/** Runs the conversion. Pass a real tokenizer as `counter` to measure with it, otherwise the built-in estimate is used. */
export function optimize(input: string, question: string, mode: Mode, enabled?: StageId[], pruneKeep?: number, counter: Counter = approxCounter, pages?: string[]): Run {
  return convert({ text: input, question, pages }, { level: mode, counter, stages: enabled, keep: pruneKeep });
}

// ------------------------------------------------------------------------------------------------ line diff

export type DiffLine = { kind: "same" | "removed" | "added"; text: string };
export function lineDiff(a: string, b: string): DiffLine[] {
  const x = a.split("\n"), y = b.split("\n");
  if (x.length * y.length > 250_000) return [...x.map((t) => ({ kind: "removed" as const, text: t })), ...y.map((t) => ({ kind: "added" as const, text: t }))];
  const dp = Array.from({ length: x.length + 1 }, () => new Uint16Array(y.length + 1));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffLine[] = []; let i = 0, j = 0;
  while (i < x.length && j < y.length) { if (x[i] === y[j]) { out.push({ kind: "same", text: x[i] }); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ kind: "removed", text: x[i++] }); else out.push({ kind: "added", text: y[j++] }); }
  while (i < x.length) out.push({ kind: "removed", text: x[i++] });
  while (j < y.length) out.push({ kind: "added", text: y[j++] });
  return out;
}
