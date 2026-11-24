import { billingFor, imageTokens, type Billing } from "./billing";
import { planImage, type Fidelity } from "./plan";

/**
 * What to send for each page of a PDF. A provider that takes a PDF natively reads the text layer and also looks at a picture of every page, so a
 * text page is paid for twice. Most pages need only their text. A scanned page has no text layer and needs OCR, and a page that is mostly a
 * figure needs its picture. The choice is made page by page and compared with what sending the PDF as it is would cost for the target model,
 * because a provider that bills a page at a flat rate and does not charge for the text layer can be cheaper left alone.
 */
export type PageFacts = {
  /** Characters in the page's text layer. */
  chars: number;
  /** Share of the page area covered by embedded pictures, from 0 to 1. */
  imageCoverage: number;
  /** Tokens of the extracted text, counted with the target tokenizer. */
  textTokens: number;
};
export type Route = "text" | "ocr" | "text+image" | "native";
export type PageRoute = { route: Route; tokens: number; nativeTokens: number; reason: string };

/** The page size, in pixels, at which a PDF page is rendered to an image for a provider that looks at pages (US Letter at 150 dpi). */
export const PAGE_PX = { w: 1275, h: 1650 };
/** What a scanned page of text typically holds once read by OCR. Used only to price an OCR route before the OCR has run. */
export const OCR_TOKENS_PER_PAGE = 700;

/** Cost of sending the page as part of a native PDF for this provider. */
export function nativePageTokens(b: Billing, textTokens: number): number {
  if (b.family === "gemini") return 258; // a flat rate per page, and the text layer is not billed
  return textTokens + imageTokens(b, PAGE_PX.w, PAGE_PX.h, "high").tokens;
}

export function routePage(p: PageFacts, model: string, fidelity: Fidelity = "standard"): PageRoute {
  const b = billingFor(model), native = nativePageTokens(b, p.textTokens);
  const pick = (route: Route, tokens: number, reason: string): PageRoute => (tokens < native ? { route, tokens, nativeTokens: native, reason } : { route: "native", tokens: native, nativeTokens: native, reason: "Sending the page as it is costs the same or less for this model" });
  if (p.chars < 40 && p.imageCoverage >= 0.5) return pick("ocr", OCR_TOKENS_PER_PAGE, "No text layer, so the page is a scan and is read with OCR");
  if (p.imageCoverage >= 0.3) {
    const img = planImage({ w: PAGE_PX.w, h: PAGE_PX.h, model, fidelity, kind: "flat" }).after.tokens;
    return pick("text+image", p.textTokens + img, "A large part of the page is a picture, so its text is sent with a reduced picture of the page");
  }
  return pick("text", p.textTokens, "The page is text, so only the text is sent");
}

export function planPdf(pages: PageFacts[], model: string, fidelity: Fidelity = "standard") {
  const routes = pages.map((p) => routePage(p, model, fidelity));
  const native = routes.reduce((a, r) => a + r.nativeTokens, 0), converted = routes.reduce((a, r) => a + r.tokens, 0);
  return { routes, native, converted, saved: native - converted };
}
