/** Details whose loss would change an answer: numbers, identifiers, addresses and links. */
export function criticalDetails(raw: string): string[] {
  // Styles, scripts, comments and tag attributes (other than link targets) are not content, so numbers inside them are not details to protect.
  const text = raw.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[a-z][a-z0-9-]*((?:\s[^<>]*)?)>/gi, (_m, attrs: string) => " " + (attrs.match(/href="[^"]*"/i)?.[0].slice(6, -1) ?? "") + " ");
  const found = new Set<string>();
  for (const re of [/https?:\/\/[^\s)<>"']+/g, /[\w.+-]+@[\w-]+\.[\w.-]+/g, /\b[A-Z]{2,}[-_]?\d[\w-]*/g, /\b\d[\d,./:-]*\d\b|\b\d{2,}\b/g]) for (const m of text.match(re) ?? []) found.add(m.replace(/[.,;:]+$/, ""));
  return [...found];
}

/** True if a detail is still in the text. Thousands separators do not count as a difference. */
export const present = (text: string, detail: string) => text.includes(detail) || text.replace(/,/g, "").includes(detail.replace(/,/g, ""));

/** A sentence that has any of these must survive pruning. */
export const PROTECTED = /\d|[A-Z]{2,}[-_]?\d|["“][^"”]{3,}["”]|https?:\/\/|@[\w.-]+\.\w+/;

export const STOP = new Set("a an and are as at be by for from has have in is it of on or that the this to was were will with you your we our i not but if so do does can".split(" "));
/** Words of three or more letters or digits, lower case, with a plural s taken off so that "requests" finds "request". */
export const terms = (s: string) => (s.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter((w) => !STOP.has(w)).map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
