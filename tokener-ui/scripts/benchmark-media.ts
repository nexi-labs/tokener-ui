/**
 * Measures the PDF and image routes on a generated document with real tools: reportlab writes a PDF, pdftotext reads its text layer, pdftoppm
 * renders pages, Tesseract reads the scanned page, and the o200k tokenizer counts the results. Provider billing for the native PDF and for the
 * images comes from the documented rules in media/billing.ts, so the "native" numbers are estimates and the "converted" numbers are measured.
 * Needs python3 with reportlab, poppler-utils and tesseract. Run: npx tsx scripts/benchmark-media.ts [out.json]
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CORPUS } from "../src/lib/optimize/corpus";
import { billingFor, imageTokens } from "../src/lib/optimize/media/billing";
import { PAGE_PX, nativePageTokens, routePage, type PageFacts } from "../src/lib/optimize/media/pdf";
import { planImage } from "../src/lib/optimize/media/plan";
import { criticalDetails, present } from "../src/lib/optimize/tec/critical";
import { exactCounter } from "../src/lib/optimize/tec/tokens";

(async () => {
  const dir = join(tmpdir(), "tokener-media-bench"); mkdirSync(dir, { recursive: true });
  const pages = CORPUS.find((d) => d.id === "pdf-report")!.input.pages!.slice(0, 8).map((p) => p.replace(/\n+/g, " ").replace(/\s+/g, " "));
  writeFileSync(join(dir, "pages.json"), JSON.stringify(pages));
  writeFileSync(join(dir, "make.py"), `
import json, sys
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.utils import simpleSplit
d = sys.argv[1]
pages = json.load(open(d + "/pages.json"))
def draw(c, text, y0=740):
    y = y0
    for line in simpleSplit(text, "Helvetica", 11, 500):
        c.setFont("Helvetica", 11); c.drawString(56, y, line); y -= 15
c = canvas.Canvas(d + "/text.pdf", pagesize=letter)
for p in pages:
    draw(c, p); c.showPage()
c.save()
`);
  execFileSync("python3", [join(dir, "make.py"), dir]);
  // A scanned version: render each page to a picture, then make a PDF that holds only pictures.
  execFileSync("pdftoppm", ["-r", "150", "-png", join(dir, "text.pdf"), join(dir, "pg")]);

  const counter = await exactCounter("o200k_base");
  const rows: Record<string, unknown>[] = [];
  const models = ["claude-haiku-4-5", "claude-opus-5-5", "gpt-4o", "gemini-2.5-pro"];
  const totals: Record<string, { native: number; converted: number }> = Object.fromEntries(models.map((m) => [m, { native: 0, converted: 0 }]));
  let ocrTokens = 0, textTokens = 0, kept = 0, total = 0;
  for (let i = 0; i < pages.length; i++) {
    const txt = execFileSync("pdftotext", ["-f", String(i + 1), "-l", String(i + 1), "-layout", join(dir, "text.pdf"), "-"]).toString();
    const t = counter.count(txt);
    const png = readdirSync(dir).filter((f) => /^pg-\d+\.png$/.test(f)).map((f) => join(dir, f)).find((f) => Number(f.match(/pg-(\d+)\.png$/)![1]) === i + 1)!;
    const ocr = execFileSync("tesseract", [png, "-", "-l", "eng"], { stdio: ["ignore", "pipe", "ignore"] }).toString();
    const o = counter.count(ocr);
    const crit = criticalDetails(pages[i]);
    const ok = crit.filter((c) => present(ocr, c)).length;
    ocrTokens += o; textTokens += t; kept += ok; total += crit.length;
    const textPage: PageFacts = { chars: txt.length, imageCoverage: 0, textTokens: t };
    const scanPage: PageFacts = { chars: 0, imageCoverage: 1, textTokens: 0 };
    for (const m of models) {
      totals[m].native += nativePageTokens(billingFor(m), t);
      totals[m].converted += routePage(textPage, m).tokens;
    }
    rows.push({ page: i + 1, textLayerTokens: t, ocrTokens: o, detailsInOcr: `${ok}/${crit.length}`, scanNativeClaude: nativePageTokens(billingFor("claude-haiku-4-5"), 0), scanRoute: routePage(scanPage, "claude-haiku-4-5").route });
  }
  // One page image under each policy, for the picture route
  const img = Object.fromEntries(models.map((m) => [m, { asIs: imageTokens(billingFor(m), PAGE_PX.w, PAGE_PX.h).tokens, standard: planImage({ w: PAGE_PX.w, h: PAGE_PX.h, model: m, fidelity: "standard", kind: "flat" }).after.tokens, economy: planImage({ w: PAGE_PX.w, h: PAGE_PX.h, model: m, fidelity: "economy", kind: "flat" }).after.tokens }]));
  const out = { document: "8 generated text pages, US Letter, 150 dpi renders", tokenizer: "o200k_base", pages: rows, totals, ocr: { tokens: ocrTokens, textLayerTokens: textTokens, detailsKept: kept, detailsTotal: total }, pageImageTokens: img };
  console.log(JSON.stringify(out, null, 1));
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(out, null, 1) + "\n");
})();
