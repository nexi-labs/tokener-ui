import type { Counter } from "./types";

/**
 * The reference counter, "approx-v1". It is deterministic and has no dependencies, so the TypeScript engine and the Java engine give the same
 * answer and can be tested against each other. It is calibrated against the o200k tokenizer (within about 7% on mixed content), not a replacement for it: the gateway counts with
 * each provider's own tokenizer, and the benchmark uses the real one.
 */
const WORD = /[A-Za-z]+|\d+|[^\sA-Za-z\d]+/g;

export function approxCount(s: string): number {
  if (!s) return 0;
  let t = 0;
  for (const w of s.match(WORD) ?? []) {
    const c = w.charCodeAt(0);
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) t += Math.ceil(w.length / 8); // most words are one token, long ones are split
    else if (c >= 48 && c <= 57) t += Math.ceil(w.length / 3);                         // digits are grouped by up to three
    else t += Math.ceil(w.length / 2);                                                  // runs of punctuation merge in pairs
  }
  t += (s.match(/\n+/g) ?? []).length;
  t += (s.match(/ {2,}/g) ?? []).length;
  return t;
}

export const approxCounter: Counter = { name: "approx-v1", count: approxCount };

export type Encoding = "o200k_base" | "cl100k_base";

/**
 * Loads a real tokenizer. The ranks are large, so this is only ever called on demand (in the browser, when someone asks for exact counts).
 */
export async function exactCounter(enc: Encoding = "o200k_base"): Promise<Counter> {
  const { Tiktoken } = await import("js-tiktoken/lite");
  const ranks = enc === "o200k_base" ? (await import("js-tiktoken/ranks/o200k_base")).default : (await import("js-tiktoken/ranks/cl100k_base")).default;
  const t = new Tiktoken(ranks);
  return { name: enc, count: (s: string) => (s ? t.encode(s, [], []).length : 0) };
}
