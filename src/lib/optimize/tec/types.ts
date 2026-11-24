/**
 * Token-Efficient Conversion (TEC). Every prompt and document is read into a list of typed blocks, cleaned, and written back out in whichever
 * form costs the fewest tokens for the model that will read it. This file holds the data model. Nothing here depends on the browser or on a
 * particular tokenizer, so the same algorithm runs in the console, in tests and, ported line for line, in the Java gateway.
 */

export type Level = "off" | "lossless" | "balanced" | "aggressive";
export type StageId = "parse" | "noise" | "unwrap" | "dedupe" | "format" | "alias" | "pack";
export type Risk = "lossless" | "structural" | "lossy";

/** Counts the tokens a model would be billed for. The engine only ever asks for a count, so any tokenizer can be plugged in. */
export type Counter = { name: string; count: (s: string) => number };

export type Table = { header: string[]; rows: string[][] };

type Common = { page?: number };
export type Block = Common & (
  | { kind: "heading"; text: string; level: number }
  | { kind: "paragraph"; text: string; quoted?: boolean }
  | { kind: "list"; items: string[] }
  | { kind: "table"; table: Table; source: "markdown" | "html" | "csv" | "tsv" | "json"; encoded?: Encoded }
  | { kind: "code"; text: string; lang: string }
  /** Data that is not a list of records, such as a nested JSON object. */
  | { kind: "data"; text: string }
  /** A line at the very top or bottom of a page, which may turn out to be a running header, a footer or a page number. */
  | { kind: "edge"; text: string; pos: "head" | "tail" }
  /** Page furniture or web boilerplate recognised at read time. It is kept until a stage that is allowed to drop it. */
  | { kind: "boiler"; text: string; why: string }
);

/** The form a table was written in, and what every candidate cost, so the choice can be shown and audited. */
export type Encoded = { id: string; text: string; candidates: { id: string; label: string; tokens: number; chosen: boolean }[] };

export type StageReport = { id: StageId; label: string; risk: Risk; applied: boolean; before: number; after: number; changes: string[]; skipped?: string };

export type Input = { text?: string; pages?: string[]; question?: string; hint?: "html" | "json" | "csv" | "tsv" | "text" };
export type Options = {
  level: Level; counter: Counter; stages?: StageId[]; keep?: number;
  /** Write "[p.N]" at the start of each page so answers can cite pages. */
  pageMarkers?: boolean;
};

export type Result = {
  output: string; before: number; after: number; stages: StageReport[]; question: string;
  tables: { index: number; rows: number; cols: number; encoded: Encoded }[];
  aliases: { marker: string; phrase: string; uses: number }[];
  critical: { total: number; kept: number; lost: string[]; /** Details that were only in text a stage removed on purpose, such as a footer or a signature. */ excused: string[]; /** Details cut by fitting to the question, which is the one stage that is allowed to lose them. */ cut: string[] };
  fallbacks: string[];
  /** How many blocks of each kind were found, for the structure panel. */
  structure: Record<string, number>;
};

export const STAGE_META: Record<StageId, { label: string; risk: Risk; body: string }> = {
  parse: { label: "Read structure", risk: "lossless", body: "Splits the input into headings, paragraphs, lists, tables and code. Web markup becomes text, scripts and styles are dropped, and tables keep their cells." },
  unwrap: { label: "Rejoin and tidy", risk: "lossless", body: "Rejoins lines that a PDF broke in the middle of a sentence, and collapses extra spaces and blank lines. Code is left as written." },
  dedupe: { label: "Repeated content", risk: "lossless", body: "Keeps one copy of a block or sentence that appears again word for word, such as a quoted email reply." },
  format: { label: "Cheapest encoding", risk: "lossless", body: "Writes each table and data block in whichever form costs the fewest tokens for this model, and checks that every cell can be read back." },
  noise: { label: "Page and web furniture", risk: "structural", body: "Removes running headers and footers, page numbers, navigation, cookie notices, signatures and disclaimers. Anything with content is kept once." },
  alias: { label: "Repeated phrases", risk: "structural", body: "Defines a long phrase that repeats, such as a company name, once and uses a short marker after it. Used only when it saves more than the definition costs." },
  pack: { label: "Fit to a budget", risk: "lossy", body: "Ranks sentences by how well they answer the question and keeps the best within a token budget. Strong matches are always kept, numbers, identifiers and links are dropped last, and every cut detail is listed. Needs a question." },
};

/** Which stages each level runs, in pipeline order. */
export const LEVEL_STAGES: Record<Level, StageId[]> = {
  off: [],
  lossless: ["parse", "unwrap", "dedupe", "format"],
  balanced: ["parse", "noise", "unwrap", "dedupe", "format", "alias", "pack"],
  aggressive: ["parse", "noise", "unwrap", "dedupe", "format", "alias", "pack"],
};
export const PIPELINE: StageId[] = ["parse", "noise", "unwrap", "dedupe", "format", "alias", "pack"];
export const KEEP: Record<Level, number> = { off: 1, lossless: 1, balanced: 0.7, aggressive: 0.45 };
