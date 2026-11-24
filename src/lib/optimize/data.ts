import { MODE_STAGES, type Mode, type StageId } from "./stages";

/**
 * Sample figures for the Cost Optimization screens. They describe a fictional workspace over the last 30 days and exist so the screens can be
 * judged. Nothing here is measured. The live numbers come from the gateway's savings ledger once the optimization service is running.
 */

export type Lever = {
  id: string; label: string; where: string; risk: "none" | "lossless" | "near-lossless" | "lossy"; status: "active" | "shadow" | "off";
  tokensSavedM: number; savedUsd: number; body: string;
};

export const BASELINE = { inputTokensM: 1840, outputTokensM: 310, spendUsd: 14_620 };

export const LEVERS: Lever[] = [
  { id: "exact", label: "Exact response cache", where: "Gateway, before the provider call", risk: "none", status: "active", tokensSavedM: 151, savedUsd: 1_190, body: "An identical request inside the policy window returns the stored answer. No provider call, no tokens." },
  { id: "semantic", label: "Semantic cache", where: "Gateway, before the provider call", risk: "near-lossless", status: "active", tokensSavedM: 94, savedUsd: 760, body: "A near-identical question returns the stored answer when similarity is above the threshold you set per application." },
  { id: "prefix", label: "Provider prompt cache", where: "Request shaping", risk: "none", status: "active", tokensSavedM: 0, savedUsd: 2_340, body: "Stable parts (system prompt, tool definitions, reference documents) are placed first so providers bill them at the cached rate. Tokens are unchanged, the price per token drops." },
  { id: "hygiene", label: "Token-efficient conversion", where: "Gateway request path", risk: "lossless", status: "active", tokensSavedM: 118, savedUsd: 870, body: "Every input is read into its structure and rewritten in the form that costs the fewest tokens for the target model: tables by measurement, repeats once, broken lines rejoined, page furniture removed when the policy allows it." },
  { id: "tools", label: "Tool schema pruning", where: "Gateway request path", risk: "lossless", status: "active", tokensSavedM: 63, savedUsd: 410, body: "Sends only the tool definitions an agent step can use, instead of the full catalogue on every call." },
  { id: "rag", label: "Retrieved context fitting", where: "Gateway request path", risk: "near-lossless", status: "active", tokensSavedM: 146, savedUsd: 1_070, body: "Removes duplicate and low relevance passages from retrieval results and keeps every passage that has a number, identifier or quotation." },
  { id: "output", label: "Output control", where: "Request shaping", risk: "none", status: "active", tokensSavedM: 41, savedUsd: 690, body: "Maximum output tokens per application, structured output where a schema exists, and stop sequences." },
  { id: "batch", label: "Batch routing", where: "Gateway scheduler", risk: "none", status: "active", tokensSavedM: 0, savedUsd: 980, body: "Requests marked as not time sensitive are sent through provider batch interfaces at a lower price." },
  { id: "route", label: "Model routing", where: "Gateway router", risk: "near-lossless", status: "active", tokensSavedM: 0, savedUsd: 1_560, body: "A request goes to the cheapest model that clears the quality floor for its task class." },
  { id: "learned", label: "Learned compression", where: "Optimizer service on GPU", risk: "lossy", status: "off", tokensSavedM: 0, savedUsd: 0, body: "A small model scores which tokens carry the meaning for the question and drops the rest. Strongest effect on long documents. Needs the optimizer service, runs in shadow first and is off by default." },
];

export const RISK_LABEL = { none: "No change to content", lossless: "Lossless", "near-lossless": "Near lossless", lossy: "Lossy, guarded" } as const;

export type AppPolicy = {
  id: string; name: string; owner: string; mode: Mode; stages: StageId[]; maxOutput: number; cache: boolean; semantic: boolean; threshold: number; ttlHours: number;
  batch: boolean; requestsPerDay: number; savedPct: number; fidelity: number; note: string;
};

export const APPS: AppPolicy[] = [
  { id: "support", name: "Support assistant", owner: "Customer Care", mode: "balanced", stages: MODE_STAGES.balanced, maxOutput: 600, cache: true, semantic: true, threshold: 0.93, ttlHours: 24, batch: false, requestsPerDay: 41_800, savedPct: 34, fidelity: 99.1, note: "Long email threads and knowledge base passages." },
  { id: "contracts", name: "Contract analyzer", owner: "Legal Operations", mode: "lossless", stages: MODE_STAGES.lossless, maxOutput: 2000, cache: true, semantic: false, threshold: 0.97, ttlHours: 72, batch: true, requestsPerDay: 3_200, savedPct: 17, fidelity: 100, note: "Every clause matters, so only lossless stages are allowed." },
  { id: "review", name: "Code review agent", owner: "Platform Engineering", mode: "lossless", stages: MODE_STAGES.lossless, maxOutput: 1500, cache: true, semantic: false, threshold: 0.97, ttlHours: 6, batch: false, requestsPerDay: 18_600, savedPct: 21, fidelity: 100, note: "Code fences are never altered." },
  { id: "search", name: "Internal search", owner: "IT", mode: "balanced", stages: MODE_STAGES.balanced, maxOutput: 400, cache: true, semantic: true, threshold: 0.9, ttlHours: 12, batch: false, requestsPerDay: 33_900, savedPct: 41, fidelity: 98.4, note: "Retrieval heavy, large gain from pruning duplicates." },
  { id: "marketing", name: "Marketing drafts", owner: "Marketing", mode: "aggressive", stages: MODE_STAGES.balanced, maxOutput: 900, cache: false, semantic: false, threshold: 0.9, ttlHours: 1, batch: true, requestsPerDay: 22_500, savedPct: 52, fidelity: 96.2, note: "Creative output, so small wording changes are acceptable." },
];

export type Shadow = { appId: string; sample: number; agreement: number; critical: number; judge: number; floor: number; state: "passing" | "watch" };
export const SHADOW: Shadow[] = [
  { appId: "support", sample: 2_410, agreement: 98.7, critical: 99.8, judge: -0.02, floor: 97, state: "passing" },
  { appId: "contracts", sample: 640, agreement: 100, critical: 100, judge: 0, floor: 99, state: "passing" },
  { appId: "review", sample: 1_180, agreement: 99.6, critical: 100, judge: -0.01, floor: 98, state: "passing" },
  { appId: "search", sample: 2_960, agreement: 97.3, critical: 99.1, judge: -0.06, floor: 96, state: "passing" },
  { appId: "marketing", sample: 1_540, agreement: 95.1, critical: 98.2, judge: -0.11, floor: 94, state: "watch" },
];

export type Event = { at: string; app: string; what: string; kind: "auto-disabled" | "restored" | "changed" };
export const EVENTS: Event[] = [
  { at: "2026-10-27 14:12", app: "Internal search", what: "Fitting to the question turned off automatically. Critical detail retention fell to 94.8% against a floor of 96%, caused by a connector that sends tables as prose.", kind: "auto-disabled" },
  { at: "2026-10-27 16:40", app: "Internal search", what: "Fitting to the question restored after the connector fix, and shadow sample passed at 99.1%.", kind: "restored" },
  { at: "2026-10-22 09:05", app: "Marketing drafts", what: "Mode changed from balanced to aggressive by a platform operator.", kind: "changed" },
];

export function monthlySavings(): { usd: number; pct: number; tokensM: number } {
  const usd = LEVERS.reduce((s, l) => s + l.savedUsd, 0), tokensM = LEVERS.reduce((s, l) => s + l.tokensSavedM, 0);
  return { usd, tokensM, pct: (usd / (BASELINE.spendUsd + usd)) * 100 };
}

// ------------------------------------------------------------------------------------------------ documents

export type DocType = {
  id: string; label: string; formats: string; reads: string; removes: string; where: "gateway" | "document worker" | "GPU worker";
  /** Ids of benchmark documents that measure this kind of content. Empty means it has not been measured. */
  corpus: string[]; inspector: boolean;
};

/** How each kind of content is turned into the fewest tokens that still carry its meaning. Reductions are not written here. They are measured by `scripts/benchmark-optimize.ts` and read from `benchmark.json`. */
export const DOC_TYPES: DocType[] = [
  { id: "text", label: "Text and Markdown", formats: "TXT, MD, RST", reads: "Read as is, split on headings", removes: "Extra whitespace, repeated paragraphs", where: "gateway", corpus: ["wiki"], inspector: true },
  { id: "web", label: "Web pages and HTML", formats: "HTML, MHTML", reads: "Parsed into headings, paragraphs, lists and tables, links kept", removes: "Scripts, styles, navigation, footers, cookie notices", where: "gateway", corpus: ["html-help"], inspector: true },
  { id: "data", label: "Structured data", formats: "JSON, XML, YAML", reads: "Parsed, a list of flat records becomes a table, anything else is minified", removes: "Repeated keys, indentation, braces", where: "gateway", corpus: ["json-catalog","json-orders"], inspector: true },
  { id: "sheet", label: "Spreadsheets and CSV", formats: "XLSX, XLS, CSV, TSV", reads: "Each sheet read with its header, written as CSV, TSV or Markdown, whichever counts fewest tokens", removes: "Thousands separators, columns that are the same on every row, repeated labels", where: "document worker", corpus: ["csv-customers"], inspector: true },
  { id: "mail", label: "Email and chat threads", formats: "EML, MSG, MBOX", reads: "Thread rebuilt, quoted replies matched to the original", removes: "Quoted copies, signatures, disclaimers, headers", where: "document worker", corpus: ["email-thread"], inspector: true },
  { id: "pdf", label: "PDF with text", formats: "PDF", reads: "Layout analysis, reading order, tables rebuilt", removes: "Headers, footers, page numbers, hyphenation", where: "document worker", corpus: ["pdf-report"], inspector: false },
  { id: "ocr", label: "Scans and images", formats: "Scanned PDF, PNG, JPG, TIFF", reads: "OCR, then the same steps as text", removes: "Noise lines, duplicate pages", where: "GPU worker", corpus: [], inspector: false },
  { id: "office", label: "Word and PowerPoint", formats: "DOCX, PPTX, ODT", reads: "Structure read from the file, comments and tracked changes handled by policy", removes: "Styles, layout markup, repeated slide masters", where: "document worker", corpus: [], inspector: false },
  { id: "code", label: "Source code and logs", formats: "Source files, application logs, traces", reads: "Code left exactly as written, runs of identical log lines counted", removes: "Identical consecutive lines, replaced by one line and a count", where: "gateway", corpus: ["log"], inspector: true },
  { id: "legal", label: "Contracts and policies", formats: "Any text, DOCX, PDF", reads: "Clauses kept whole, defined terms found", removes: "Repeated defined phrases are written once", where: "gateway", corpus: ["contract"], inspector: true },
  { id: "rag", label: "Retrieved passages", formats: "Vector search results, knowledge base chunks", reads: "Passages kept with their source labels", removes: "Passages and sentences that repeat", where: "gateway", corpus: ["rag"], inspector: true },
  { id: "media", label: "Audio and video", formats: "MP3, WAV, MP4", reads: "Transcribed, speakers and timestamps kept as light markers", removes: "Filler words, repeated sentences", where: "GPU worker", corpus: [], inspector: false },
];

export type LibraryDoc = {
  id: string; name: string; type: string; rawTokens: number; storedTokens: number; requests30d: number; version: number; mode: "lossless" | "balanced";
  updated: string; state: "ready" | "processing" | "needs review";
};

/** A document is processed once when it is added or changed. Every later request reads the stored form, so the work is not repeated per request. */
export const LIBRARY: LibraryDoc[] = [
  { id: "d1", name: "Master services agreement 2026.pdf", type: "PDF with text", rawTokens: 48_200, storedTokens: 41_900, requests30d: 1_240, version: 3, mode: "lossless", updated: "2026-10-18", state: "ready" },
  { id: "d2", name: "Support knowledge base export.html", type: "Web pages and HTML", rawTokens: 212_000, storedTokens: 58_400, requests30d: 38_900, version: 12, mode: "balanced", updated: "2026-10-29", state: "ready" },
  { id: "d3", name: "Q3 ledger.xlsx", type: "Spreadsheets and CSV", rawTokens: 96_500, storedTokens: 41_700, requests30d: 2_310, version: 1, mode: "lossless", updated: "2026-10-12", state: "ready" },
  { id: "d4", name: "Customer escalations mailbox.mbox", type: "Email and chat threads", rawTokens: 530_000, storedTokens: 181_000, requests30d: 9_870, version: 7, mode: "balanced", updated: "2026-10-30", state: "ready" },
  { id: "d5", name: "Branch inspection scans (Oct).pdf", type: "Scans and images", rawTokens: 74_000, storedTokens: 58_200, requests30d: 0, version: 1, mode: "lossless", updated: "2026-10-31", state: "processing" },
  { id: "d6", name: "Vendor onboarding deck.pptx", type: "Word and PowerPoint", rawTokens: 22_800, storedTokens: 17_100, requests30d: 340, version: 2, mode: "lossless", updated: "2026-10-05", state: "needs review" },
];
