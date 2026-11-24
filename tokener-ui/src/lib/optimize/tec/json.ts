/**
 * A strict JSON reader that keeps every number exactly as it was written. JSON.parse turns 12345678901234567890 into 12345678901234567000 and
 * 22.50 into 22.5, which is wrong for identifiers and amounts, so the converter reads JSON with this instead. The Java engine has the same
 * reader, and both write strings the same way, so their output matches character for character.
 */
export type J = { t: "null" } | { t: "bool"; v: boolean } | { t: "num"; lex: string } | { t: "str"; v: string } | { t: "arr"; a: J[] } | { t: "obj"; m: Map<string, J> };

const NUM = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

export function parseJson(src: string): J | null {
  let i = 0;
  const ws = () => { while (i < src.length && (src[i] === " " || src[i] === "\t" || src[i] === "\n" || src[i] === "\r")) i++; };
  const str = (): string | null => {
    i++; let out = "";
    while (i < src.length) {
      const c = src[i];
      if (c === '"') { i++; return out; }
      if (c < " ") return null;
      if (c !== "\\") { out += c; i++; continue; }
      const e = src[i + 1]; i += 2;
      const simple: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
      if (e in simple) out += simple[e];
      else if (e === "u" && /^[0-9a-fA-F]{4}$/.test(src.slice(i, i + 4))) { out += String.fromCharCode(parseInt(src.slice(i, i + 4), 16)); i += 4; }
      else return null;
    }
    return null;
  };
  const val = (depth: number): J | null => {
    if (depth > 200) return null;
    ws();
    const c = src[i];
    if (c === "{") {
      i++; const m = new Map<string, J>(); ws();
      if (src[i] === "}") { i++; return { t: "obj", m }; }
      for (;;) {
        ws(); if (src[i] !== '"') return null;
        const k = str(); if (k === null) return null;
        ws(); if (src[i] !== ":") return null; i++;
        const v = val(depth + 1); if (!v) return null;
        m.set(k, v); ws();
        if (src[i] === ",") { i++; continue; }
        if (src[i] === "}") { i++; return { t: "obj", m }; }
        return null;
      }
    }
    if (c === "[") {
      i++; const a: J[] = []; ws();
      if (src[i] === "]") { i++; return { t: "arr", a }; }
      for (;;) {
        const v = val(depth + 1); if (!v) return null;
        a.push(v); ws();
        if (src[i] === ",") { i++; continue; }
        if (src[i] === "]") { i++; return { t: "arr", a }; }
        return null;
      }
    }
    if (c === '"') { const s = str(); return s === null ? null : { t: "str", v: s }; }
    if (src.startsWith("true", i)) { i += 4; return { t: "bool", v: true }; }
    if (src.startsWith("false", i)) { i += 5; return { t: "bool", v: false }; }
    if (src.startsWith("null", i)) { i += 4; return { t: "null" }; }
    NUM.lastIndex = i;
    const m = NUM.exec(src);
    if (!m) return null;
    i += m[0].length; return { t: "num", lex: m[0] };
  };
  const v = val(0); if (!v) return null;
  ws();
  return i === src.length ? v : null;
}

/** A string as JSON writes it: quotes, backslash and control characters escaped, everything else as is. */
export function quote(s: string): string {
  let o = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s[i], n = s.charCodeAt(i);
    if (c === '"') o += '\\"'; else if (c === "\\") o += "\\\\";
    else if (c === "\b") o += "\\b"; else if (c === "\f") o += "\\f"; else if (c === "\n") o += "\\n"; else if (c === "\r") o += "\\r"; else if (c === "\t") o += "\\t";
    else if (n < 0x20) o += "\\u" + n.toString(16).padStart(4, "0");
    else if (n >= 0xd800 && n <= 0xdbff && i + 1 < s.length && s.charCodeAt(i + 1) >= 0xdc00 && s.charCodeAt(i + 1) <= 0xdfff) { o += c + s[i + 1]; i++; }
    else if (n >= 0xd800 && n <= 0xdfff) o += "\\u" + n.toString(16);
    else o += c;
  }
  return o + '"';
}

/** The inverse of quote for a single quoted string. */
export function unquote(s: string): string | null { const j = parseJson(s); return j && j.t === "str" ? j.v : null; }

/** Minified JSON text, numbers as written. */
export function minify(v: J): string {
  switch (v.t) {
    case "null": return "null";
    case "bool": return v.v ? "true" : "false";
    case "num": return v.lex;
    case "str": return quote(v.v);
    case "arr": return "[" + v.a.map(minify).join(",") + "]";
    case "obj": return "{" + [...v.m].map(([k, x]) => quote(k) + ":" + minify(x)).join(",") + "}";
  }
}
