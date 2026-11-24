/**
 * What a provider bills for an image. Each provider counts image tokens differently, so the cheapest way to send a picture depends on where it
 * is going. The rules below are taken from the providers' published documentation and are an estimate: the gateway records the token usage the
 * provider reports for each request, and that, not this, is what savings are measured against.
 *
 *  - Anthropic: the image is cut into 28 px patches, one token each, and scaled down to fit a long-edge limit and a token limit.
 *  - OpenAI tile models: scale to fit 2048, shortest side to 768 at most, then 512 px tiles at a base price plus a price per tile. Low detail is the base price only.
 *  - OpenAI patch models: 32 px patches, capped at 1536, multiplied by a per-model factor. How the provider scales above the cap is not published, so this one runs about 5% high.
 *  - Gemini: an image up to 384 px on both sides is 258 tokens, a larger one is tiled in 768 px tiles at 258 tokens each.
 */
export type Detail = "low" | "high";
export type Billing =
  | { family: "anthropic"; longEdge: number; maxTokens: number; label: string }
  | { family: "openai-tile"; base: number; tile: number; label: string }
  | { family: "openai-patch"; factor: number; label: string }
  | { family: "gemini"; label: string };

export type Counted = { tokens: number; w: number; h: number };

const ANTHROPIC_STANDARD: Billing = { family: "anthropic", longEdge: 1568, maxTokens: 1568, label: "Anthropic, standard resolution" };
const ANTHROPIC_HIGH: Billing = { family: "anthropic", longEdge: 2576, maxTokens: 4784, label: "Anthropic, high resolution" };

/** Picks the billing rule for a model name. An unknown model is billed like the most common OpenAI tile model and labelled as an estimate. */
export function billingFor(model: string): Billing {
  const m = model.toLowerCase();
  if (m.includes("claude")) {
    // "claude-opus-5-5" is major 5 minor 5; "claude-sonnet-4-20250514" is major 4 with a date, so a minor is only one or two digits.
    const v = m.match(/-(\d)[-.](\d{1,2})(?!\d)/) ?? m.match(/-(\d)(?!\d)/);
    const major = v ? Number(v[1]) : 0, minor = v && v[2] !== undefined ? Number(v[2]) : 0;
    return major > 4 || (major === 4 && minor >= 7) ? ANTHROPIC_HIGH : ANTHROPIC_STANDARD;
  }
  if (m.startsWith("gemini")) return { family: "gemini", label: "Gemini" };
  if (m.startsWith("gpt-4o-mini")) return { family: "openai-tile", base: 2833, tile: 5667, label: "OpenAI gpt-4o-mini" };
  if (/^(gpt-4\.1|gpt-5)-mini/.test(m)) return { family: "openai-patch", factor: 1.62, label: "OpenAI mini, patch based" };
  if (/^(gpt-4\.1|gpt-5)-nano/.test(m)) return { family: "openai-patch", factor: 2.46, label: "OpenAI nano, patch based" };
  if (m.startsWith("o4-mini")) return { family: "openai-patch", factor: 1.72, label: "OpenAI o4-mini, patch based" };
  if (m.startsWith("gpt-5")) return { family: "openai-tile", base: 70, tile: 140, label: "OpenAI gpt-5" };
  if (/^o[13](-|$)/.test(m)) return { family: "openai-tile", base: 75, tile: 150, label: "OpenAI o-series" };
  if (m.startsWith("gpt-4")) return { family: "openai-tile", base: 85, tile: 170, label: "OpenAI gpt-4o and gpt-4.1" };
  return { family: "openai-tile", base: 85, tile: 170, label: "Unknown model, billed as gpt-4o (estimate)" };
}

/** Scales (w, h) by the largest factor at most 1 for which fits(w', h') holds, to whole pixels. */
function shrinkToFit(w: number, h: number, fits: (w: number, h: number) => boolean): { w: number; h: number } {
  if (fits(w, h)) return { w, h };
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (fits(Math.max(1, Math.round(w * mid)), Math.max(1, Math.round(h * mid)))) lo = mid; else hi = mid;
  }
  return { w: Math.max(1, Math.round(w * lo)), h: Math.max(1, Math.round(h * lo)) };
}

const ceilDiv = (a: number, b: number) => Math.ceil(a / b);

/** Tokens a provider bills for an image of this size, and the size it actually looks at after its own scaling. */
export function imageTokens(b: Billing, w: number, h: number, detail: Detail = "high"): Counted {
  switch (b.family) {
    case "anthropic": {
      const patches = (x: number, y: number) => ceilDiv(x, 28) * ceilDiv(y, 28);
      const s = shrinkToFit(w, h, (x, y) => Math.max(x, y) <= b.longEdge && patches(x, y) <= b.maxTokens);
      return { tokens: patches(s.w, s.h), w: s.w, h: s.h };
    }
    case "openai-tile": {
      if (detail === "low") return { tokens: b.base, w: Math.min(w, 512), h: Math.min(h, 512) };
      let x = w, y = h;
      if (Math.max(x, y) > 2048) { const k = 2048 / Math.max(x, y); x = Math.round(x * k); y = Math.round(y * k); }
      if (Math.min(x, y) > 768) { const k = 768 / Math.min(x, y); x = Math.round(x * k); y = Math.round(y * k); }
      return { tokens: b.base + ceilDiv(x, 512) * ceilDiv(y, 512) * b.tile, w: x, h: y };
    }
    case "openai-patch": {
      const patches = (x: number, y: number) => ceilDiv(x, 32) * ceilDiv(y, 32);
      const s = shrinkToFit(w, h, (x, y) => patches(x, y) <= 1536);
      return { tokens: Math.round(patches(s.w, s.h) * b.factor), w: s.w, h: s.h };
    }
    case "gemini": {
      if (w <= 384 && h <= 384) return { tokens: 258, w, h };
      return { tokens: ceilDiv(w, 768) * ceilDiv(h, 768) * 258, w, h };
    }
  }
}
