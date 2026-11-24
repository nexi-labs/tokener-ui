import type { Counter } from "./types";

/**
 * Repeated phrases. A long name or clause that appears many times is defined once and written as a short marker after that. A phrase is used
 * only if the real token count goes down once the definition is paid for, and the text can always be expanded back to exactly what it was.
 */
export type Alias = { marker: string; phrase: string; uses: number };

const WORD = /[\p{L}\p{N}]+(?:['’&-][\p{L}\p{N}]+)*/gu;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MAX_WORDS = 120_000;

function ngrams(texts: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of texts) {
    const w = [...s.matchAll(WORD)].map((m) => ({ t: m[0], a: m.index!, b: m.index! + m[0].length }));
    for (let i = 0; i < w.length; i++) {
      let key = w[i].t;
      for (let n = 2; n <= 8 && i + n <= w.length; n++) {
        if (s.slice(w[i + n - 2].b, w[i + n - 1].a) !== " ") break;
        key += " " + w[i + n - 1].t;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  return counts;
}

const replaceAll = (s: string, phrase: string, marker: string) => s.replace(new RegExp(`(?<![\\p{L}\\p{N}])${esc(phrase)}(?![\\p{L}\\p{N}])`, "gu"), marker);

/** A prefix that is not already followed by a digit anywhere in the text, so a marker is never mistaken for content. */
function pickPrefix(texts: string[]): string | null {
  const all = texts.join("\n");
  return ["§", "#", "@", "~"].find((p) => !new RegExp(`${esc(p)}\\d`).test(all)) ?? null;
}

/** A later phrase can contain an earlier marker, so markers are expanded from the last one defined back to the first. */
export function expand(texts: string[], aliases: Alias[]): string[] {
  let out = texts;
  for (let i = aliases.length - 1; i >= 0; i--) {
    const re = new RegExp(`${esc(aliases[i].marker)}(?!\\d)`, "g"), phrase = aliases[i].phrase;
    out = out.map((s) => s.replace(re, () => phrase));
  }
  return out;
}

export function applyAliases(texts: string[], counter: Counter, max = 12, minGain = 4): { texts: string[]; legend: string; aliases: Alias[] } {
  const none = { texts, legend: "", aliases: [] as Alias[] };
  if (texts.join(" ").split(/\s+/).length > MAX_WORDS) return none;
  const prefix = pickPrefix(texts);
  if (!prefix) return none;
  let cur = texts.slice();
  const aliases: Alias[] = [], bad = new Set<string>();
  const total = (t: string[], a: Alias[]) => counter.count(t.join("\n")) + (a.length ? counter.count(legendOf(a)) : 0);
  const legendOf = (a: Alias[]) => "Terms: " + a.map((x) => `${x.marker} = ${x.phrase}`).join("; ");
  for (let round = 0; round < max; round++) {
    const marker = `${prefix}${aliases.length + 1}`, mt = counter.count(marker);
    let best: { p: string; gain: number } | null = null;
    for (const [p, c] of ngrams(cur)) {
      if (c < 3 || bad.has(p)) continue;
      const g = c * (counter.count(p) - mt) - counter.count(`${marker} = ${p}; `);
      if (g >= minGain && (!best || g > best.gain || (g === best.gain && (p.length > best.p.length || (p.length === best.p.length && p < best.p))))) best = { p, gain: g };
    }
    if (!best) break;
    const next = cur.map((s) => replaceAll(s, best!.p, marker));
    const uses = next.reduce((n, s, i) => n + (s.split(marker).length - cur[i].split(marker).length), 0);
    const trial = [...aliases, { marker, phrase: best.p, uses }];
    // The estimate is only a guide. The decision is the real count, definition included.
    if (total(next, trial) + minGain > total(cur, aliases)) { bad.add(best.p); continue; }
    cur = next; aliases.push({ marker, phrase: best.p, uses });
  }
  return aliases.length ? { texts: cur, legend: legendOf(aliases), aliases } : none;
}
