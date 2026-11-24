import { billingFor, imageTokens, type Billing, type Counted, type Detail } from "./billing";
import type { Kind } from "./pixels";

/**
 * How to send one image so it costs the fewest tokens that still show what the caller needs. The caller's policy says how much detail may be
 * given up, and the plan never costs more than sending the image as it is.
 *
 *  exact     only what changes nothing: send the picture at the size the provider would look at it anyway. No fewer tokens, fewer bytes.
 *  standard  long edge at most 1024 px (1280 for flat images such as screenshots, where small text must stay legible).
 *  economy   long edge at most 512 px (1024 for flat images), and low detail where the provider has one. For classifying and spotting, not reading.
 */
export type Fidelity = "exact" | "standard" | "economy";
export type ImagePlan = {
  action: "keep" | "resize";
  w: number; h: number; detail: Detail;
  before: Counted; after: Counted; saved: number;
  /** A flat image with text in it is usually cheaper and more accurate as text, when an OCR engine is available. */
  ocrCandidate: boolean;
  reason: string;
};

const CAP: Record<Fidelity, Record<Kind, number>> = {
  exact: { photo: Infinity, flat: Infinity },
  standard: { photo: 1024, flat: 1280 },
  economy: { photo: 512, flat: 1024 },
};

export function planImage(input: { w: number; h: number; model: string; fidelity: Fidelity; kind: Kind }): ImagePlan {
  const b: Billing = billingFor(input.model), { w, h } = input;
  const before = imageTokens(b, w, h, "high");
  const keep = (reason: string): ImagePlan => ({ action: "keep", w, h, detail: "high", before, after: before, saved: 0, ocrCandidate: input.kind === "flat", reason });
  if (w < 1 || h < 1) return keep("No pixels to send");
  const cap = CAP[input.fidelity][input.kind];
  // Never upscale, and never send more than the provider would look at.
  const longEdge = Math.min(Math.max(w, h), Math.max(before.w, before.h), cap);
  const k = longEdge / Math.max(w, h);
  const nw = Math.max(1, Math.round(w * k)), nh = Math.max(1, Math.round(h * k));
  const detail: Detail = input.fidelity === "economy" && b.family === "openai-tile" ? "low" : "high";
  const after = imageTokens(b, nw, nh, detail);
  const smaller = nw < w || nh < h;
  if (after.tokens > before.tokens || (!smaller && detail === "high")) return keep("Already as cheap as the policy allows");
  const saved = before.tokens - after.tokens;
  const why = saved === 0 ? "Sent at the size the provider looks at, so the upload is smaller and the tokens are the same"
    : detail === "low" ? "Low detail and a smaller picture, for tasks that do not need fine detail"
    : `Long edge reduced to ${longEdge} px`;
  return { action: "resize", w: nw, h: nh, detail, before, after, saved, ocrCandidate: input.kind === "flat", reason: why };
}
