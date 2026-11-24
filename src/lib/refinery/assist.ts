import { FUNCTIONS } from "./catalog";
import type { Col } from "./steps";
import type { Dataset, Step } from "./types";

/**
 * Natural language to recipe steps. In the sample workspace a small local reader understands common phrasings. In a connected workspace the same request
 * goes through the gateway to a model that is given the step catalogue and the dataset's columns, and whatever it proposes passes through the same
 * validator before the person can accept it (docs/46, Assistant). Either way the person sees the proposed steps and accepts or discards them. Nothing is applied silently.
 */
export type Proposal = { step: Step; because: string };
export type AssistResult = { proposals: Proposal[]; unmatched: string[] };

export const EXAMPLE_PROMPTS = [
  "Trim spaces and lowercase the channel column",
  "Remove duplicates by ticket_id keeping the latest",
  "Mask emails and phone numbers in body",
  "Fill missing priority with normal",
  "Classify body into billing, outage, how-to or other",
  "Split into train, validation and test 80/10/10",
];

const VERBS = "trim|strip|lowercase|lower case|uppercase|upper case|title case|remove|drop|delete|dedupe|deduplicate|fill|replace|mask|redact|anonymi[sz]e|classify|categori[sz]e|label|tag|summari[sz]e|extract|embed|split|chunk|keep|filter|rename|convert|cast|change|one-hot|bucket|bin|scale|standardi[sz]e|normali[sz]e|clip|encode|validate|reject|format|clean|fix|rewrite|translate|call|run|use|make|do|add";
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function clauses(text: string): string[] {
  const t = text.replace(/\s+/g, " ").trim();
  return t.split(/[.;\n]+|\b(?:and then|then|after that|next|finally)\b/i)
    .flatMap((p) => p.split(new RegExp(`\\s*,?\\s+and\\s+(?=(?:${VERBS})\\b)`, "i")))
    .flatMap((p) => p.split(new RegExp(`,\\s+(?=(?:${VERBS})\\b)`, "i")))
    .map((p) => p.trim()).filter(Boolean);
}

export function proposeSteps(prompt: string, cols: Col[], firstId = 1): AssistResult {
  const proposals: Proposal[] = []; const unmatched: string[] = [];
  let n = firstId; const id = () => `s${n++}`;
  const stringCols = cols.filter((c) => c.type === "string").map((c) => c.name);
  const numCols = cols.filter((c) => c.type === "integer" || c.type === "decimal").map((c) => c.name);
  const dateCols = cols.filter((c) => c.type === "date" || c.type === "timestamp").map((c) => c.name);
  const textLike = stringCols.filter((c) => /(^|_)(body|text|content|message|description|notes?|comment|review|summary|page)(_|$)/i.test(c));
  const add = (op: string, params: Record<string, unknown>, because: string) => proposals.push({ step: { id: id(), op, params }, because });

  for (const raw of clauses(prompt)) {
    const c = raw.toLowerCase();
    // columns mentioned, in the order they appear
    const found = cols.map((col) => { const m = new RegExp(`\\b${esc(col.name).replace(/_/g, "[ _]")}\\b`, "i").exec(raw); return m ? { name: col.name, at: m.index } : null; }).filter(Boolean) as { name: string; at: number }[];
    const mentioned = found.sort((a, b) => a.at - b.at).map((x) => x.name);
    const allText = /\b(all|every)\b.*\b(text|string)?\s*columns?\b|\beverything\b/.test(c);
    const target = (pool: string[], fallback: string[] = []) => (mentioned.length ? mentioned : allText ? stringCols : fallback);
    const quoted = /["“']([^"”']+)["”']/.exec(raw)?.[1];
    const nums = (raw.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

    if (/near[- ]?dup|\bsimilar (text|documents?|pages?|rows?)\b/.test(c)) { const col = mentioned[0] ?? textLike[0]; col ? add("near_dedupe", { column: col, threshold: nums.find((x) => x > 0 && x <= 1) ?? 0.85 }, `Drops texts that are almost the same in ${col}.`) : unmatched.push(raw); continue; }
    if (/\bchunk|\bpassages?\b|split .*\b(into )?pieces\b/.test(c)) { const col = mentioned[0] ?? textLike[0]; if (!col) { unmatched.push(raw); continue; } add("chunk_text", { column: col, tokens: Number(/(\d+)\s*tokens?/.exec(c)?.[1] ?? 300), overlap: Number(/(\d+)\s*(?:tokens?\s*)?overlap|overlap(?: of)?\s*(\d+)/.exec(c)?.slice(1).find(Boolean) ?? 30) }, `Cuts ${col} into pieces a model can take.`); continue; }
    if (/\bdup(licate)?s?\b|\bdedup/.test(c)) { add("drop_duplicates", { keys: mentioned, keep: /\b(latest|last|newest|most recent)\b/.test(c) ? "last" : "first" }, mentioned.length ? `Keeps one row per ${mentioned.join(", ")}.` : "Keeps one copy of identical rows."); continue; }
    if (/\bsplit\b/.test(c) && nums.length >= 3) { const [tr, va, te] = nums.filter((x) => x > 0 && x <= 100); if (tr !== undefined && va !== undefined && te !== undefined) { add("split", { train: tr, validation: va, test: te, seed: 42 }, `Assigns each row to train, validation or test (${tr}/${va}/${te}), repeatably.`); continue; } }
    if (/\bsplit\b.*\b(train|test|validation)\b/.test(c)) { add("split", { train: 80, validation: 10, test: 10, seed: 42 }, "Assigns each row to train, validation or test (80/10/10), repeatably."); continue; }
    if (/\b(fill|replace)\b.*\b(missing|empty|blank|null)/.test(c) || /\bfill\b/.test(c)) {
      const col = mentioned[0]; if (!col) { unmatched.push(`${raw} (which column?)`); continue; }
      const strat = /\b(mean|average)\b/.test(c) ? "mean" : /\bmedian\b/.test(c) ? "median" : /\b(most common|most frequent|mode)\b/.test(c) ? "mode" : "constant";
      const val = quoted ?? /\b(?:with|using|as|to)\s+([^\s,.]+)\s*$/.exec(raw)?.[1];
      if (strat === "constant" && !val) { unmatched.push(`${raw} (what should it be filled with?)`); continue; }
      add("fill_missing", { column: col, strategy: strat, value: strat === "constant" ? val : "" }, `Fills empty ${col} with ${strat === "constant" ? `"${val}"` : `the ${strat}`}.`); continue;
    }
    if (/\b(drop|remove|delete|discard)\b/.test(c) && /\bcolumns?\b/.test(c) && !/\b(missing|empty|blank|null)\b/.test(c)) { if (!mentioned.length) { unmatched.push(`${raw} (which columns?)`); continue; } add("drop_columns", { columns: mentioned }, `Removes ${mentioned.join(", ")} from the output.`); continue; }
    if (/\b(drop|remove|delete|discard)\b/.test(c) && /\b(missing|empty|blank|null)\b/.test(c)) { if (!mentioned.length) { unmatched.push(`${raw} (which columns?)`); continue; } add("drop_missing", { columns: mentioned }, `Removes rows that are empty in ${mentioned.join(", ")}.`); continue; }
    if (/\b(mask|redact|anonymi[sz]e|scrub|hide)\b|\bremove\b.*\b(pii|personal|emails?|phone)/.test(c)) { const columns = mentioned.length ? mentioned : allText ? stringCols : textLike.length ? textLike : stringCols; add("pii_mask", { columns, style: /\bhash/.test(c) ? "hash" : /\b(stars?|asterisks?)\b/.test(c) ? "stars" : "token" }, `Replaces email addresses and phone numbers in ${columns.join(", ")}.`); continue; }
    if (/\b(classify|categori[sz]e|label|tag)\b/.test(c)) {
      const col = mentioned[0] ?? textLike[0]; const tail = /\b(?:into|as|using|between|with|from)\s+(.+)$/i.exec(raw)?.[1] ?? "";
      const labels = tail.replace(/\b(?:one of|categories|labels|the following)\b:?/gi, "").split(/,|\bor\b|\band\b/i).map((s) => s.trim().replace(/^["'“]|["'”]$/g, "")).filter((s) => s && !cols.some((k) => k.name === s));
      if (!col || labels.length < 2) { unmatched.push(`${raw} (name the column and at least two labels)`); continue; }
      add("ai_classify", { column: col, into: "topic", labels: labels.join("\n"), model: "alias:fast-classifier", maxCost: 25 }, `Asks a model to label ${col} as ${labels.join(", ")}. Costs are estimated before the run.`); continue;
    }
    if (/\bsummari[sz]e\b/.test(c)) { const col = mentioned[0] ?? textLike[0]; col ? add("ai_summarise", { column: col, into: "summary", model: "alias:balanced-reasoner", maxCost: 80 }, `Writes a short summary of ${col} with a model.`) : unmatched.push(raw); continue; }
    if (/\bextract\b/.test(c)) { const col = mentioned[0] ?? textLike[0]; const fields = (/\bextract\s+(.+?)\s+from\b/i.exec(raw)?.[1] ?? "").split(/,|\band\b/i).map((s) => s.trim().toLowerCase().replace(/\s+/g, "_")).filter(Boolean); if (!col || !fields.length) { unmatched.push(raw); continue; } add("ai_extract", { column: col, fields: fields.join("\n"), model: "alias:balanced-reasoner", maxCost: 60 }, `Asks a model to pull ${fields.join(", ")} out of ${col}.`); continue; }
    if (/\bembed/.test(c)) { const col = mentioned[0] ?? textLike[0]; col ? add("ai_embed", { column: col, into: "embedding", model: "alias:embedding", maxCost: 30 }, `Creates vectors for ${col}.`) : unmatched.push(raw); continue; }
    if (/\b(fix|correct)\b.*\b(spelling|typos?|grammar)\b|\brewrite\b|\bparaphrase\b|\btranslate\b/.test(c)) { const col = mentioned[0] ?? textLike[0]; col ? add("ai_transform", { column: col, instruction: raw, into: "rewritten", model: "alias:fast-classifier", maxCost: 50 }, `Sends each value of ${col} to a model with your instruction.`) : unmatched.push(raw); continue; }
    if (/\bone[- ]?hot\b|\bdummy (variables|columns)\b/.test(c)) { const col = mentioned[0]; col ? add("one_hot", { column: col, maxCategories: 12, dropOriginal: false }, `One 0 or 1 column for each common value of ${col}.`) : unmatched.push(`${raw} (which column?)`); continue; }
    if (/\bbucket|\bbin\b|\bbands?\b|\brange groups?\b/.test(c)) { const col = mentioned.find((x) => numCols.includes(x)); const edges = nums.filter((x) => !cols.some((k) => /\d/.test(k.name) && new RegExp(esc(String(x))).test(k.name))); if (!col || edges.length < 1) { unmatched.push(`${raw} (name a numeric column and the edges)`); continue; } add("bucket", { column: col, edges: edges.join(", ") }, `Groups ${col} into ranges at ${edges.join(", ")}.`); continue; }
    if (/\bclip\b.*\boutliers?\b|\boutliers?\b/.test(c)) { const list = mentioned.filter((x) => numCols.includes(x)); if (!list.length) { unmatched.push(`${raw} (which numeric column?)`); continue; } list.forEach((col) => add("clip_outliers", { column: col }, `Pulls extreme values of ${col} back to 1.5 interquartile ranges.`)); continue; }
    if (/\b(standardi[sz]e|z-?score)\b/.test(c) && mentioned.some((x) => numCols.includes(x))) { mentioned.filter((x) => numCols.includes(x)).forEach((col) => add("scale", { column: col, method: "standard" }, `Rescales ${col} to mean 0 and spread 1.`)); continue; }
    if (/\b(min-?max|scale|normali[sz]e)\b/.test(c) && mentioned.some((x) => numCols.includes(x))) { mentioned.filter((x) => numCols.includes(x)).forEach((col) => add("scale", { column: col, method: "minmax" }, `Rescales ${col} to 0 through 1.`)); continue; }
    if (/\b(normali[sz]e|clean|fix)\b.*\b(text|unicode|encoding|quotes|hyphen|characters)\b/.test(c)) { const columns = mentioned.length ? mentioned : textLike.length ? textLike : stringCols; add("normalize_text", { columns, unicode: true, controls: true, quotes: true, hyphens: true, spaces: true }, `Repairs encoding, quotes, hidden characters and split words in ${columns.join(", ")}.`); continue; }
    if (/\b(header|footer|page numbers?|boilerplate)\b/.test(c)) { const col = mentioned[0] ?? textLike[0]; col ? add("strip_boilerplate", { column: col, minShare: 30, pageNumbers: true }, `Removes repeated headers and footers and page numbers from ${col}.`) : unmatched.push(raw); continue; }
    if (/\b(year|month|weekday|day of (the )?week|quarter|date parts?)\b/.test(c) && (mentioned.some((x) => dateCols.includes(x)) || dateCols.length)) { const col = mentioned.find((x) => dateCols.includes(x)) ?? dateCols[0]; const parts = ["year", "month", "day", "weekday", "quarter"].filter((p) => new RegExp(`\\b${p}\\b|day of (the )?week`).test(c) && (p !== "weekday" || /weekday|day of (the )?week/.test(c))); add("date_parts", { column: col, parts: parts.length ? parts : ["year", "month", "weekday"] }, `Adds ${(parts.length ? parts : ["year", "month", "weekday"]).join(", ")} columns from ${col}.`); continue; }
    if (/\b(length|word count|character count|number of words)\b/.test(c)) { const col = mentioned[0] ?? textLike[0]; col ? add("text_stats", { column: col }, `Adds character, word and token counts of ${col}.`) : unmatched.push(raw); continue; }
    if (/\b(chat|messages|fine[- ]?tun)/.test(c)) { if (mentioned.length < 2) { unmatched.push(`${raw} (name the user column and the assistant column)`); continue; } add("to_chat", { system: "", userColumn: mentioned[0], assistantColumn: mentioned[1], into: "messages" }, `Builds chat messages with ${mentioned[0]} as the user and ${mentioned[1]} as the assistant.`); continue; }
    if (/\brename\b/.test(c)) { const m = /rename\s+(?:the\s+)?(\S+?)(?:\s+column)?\s+(?:to|as)\s+(\S+)/i.exec(raw); const col = m && cols.find((k) => k.name.toLowerCase() === m[1].toLowerCase()); if (!m || !col) { unmatched.push(`${raw} (which column?)`); continue; } add("rename", { column: col.name, to: m[2].replace(/[^\w-]/g, "") }, `Renames ${col.name}.`); continue; }
    const cast = /\b(?:convert|cast|change|turn|make)\s+(?:the\s+)?(\S+?)(?:\s+column)?\s+(?:in)?to\s+(?:an?\s+)?(integers?|int|whole numbers?|numbers?|decimals?|floats?|booleans?|text|strings?)\b/i.exec(raw);
    if (cast) { const col = cols.find((k) => k.name.toLowerCase() === cast[1].toLowerCase()); const t = cast[2].toLowerCase(); const to = /int|whole/.test(t) ? "integer" : /decimal|float|number/.test(t) ? "decimal" : /bool/.test(t) ? "boolean" : "string"; col ? add("cast", { column: col.name, to }, `Converts ${col.name} to ${to}. Values that cannot be converted become empty.`) : unmatched.push(`${raw} (no such column)`); continue; }
    if (/\b(lower ?case|to lower)\b/.test(c)) { const columns = target(stringCols, stringCols); add("case", { columns, mode: "lower" }, `Makes ${columns.join(", ")} lower case.`); continue; }
    if (/\b(upper ?case|capital letters|to upper)\b/.test(c)) { const columns = target(stringCols, stringCols); add("case", { columns, mode: "upper" }, `Makes ${columns.join(", ")} upper case.`); continue; }
    if (/\btitle ?case\b/.test(c)) { const columns = target(stringCols, stringCols); add("case", { columns, mode: "title" }, `Writes ${columns.join(", ")} in title case.`); continue; }
    if (/\btrim\b|\bstrip\b|white ?space|extra spaces|leading|trailing/.test(c)) { add("trim", { columns: mentioned, collapse: true }, mentioned.length ? `Trims stray spaces in ${mentioned.join(", ")}.` : "Trims stray spaces in every text column."); continue; }
    const filt = /\b(?:keep|filter)(?: only)?(?: rows)?(?: where| with| that have| if)?\s+(\S+?)\s+(is not empty|is empty|equals|is|=|contains|>|<|greater than|less than|more than|above|below)\s*(.*)$/i.exec(raw);
    if (filt) { const col = cols.find((k) => k.name.toLowerCase() === filt[1].toLowerCase()); const w = filt[2].toLowerCase(); const cmp = w === "is not empty" ? "not_empty" : w === "is empty" ? "is_empty" : w === "contains" ? "contains" : /^(>|greater than|more than|above)$/.test(w) ? "gt" : /^(<|less than|below)$/.test(w) ? "lt" : "eq"; const value = (quoted ?? filt[3]).trim().replace(/[.,]$/, ""); if (!col || (!["not_empty", "is_empty"].includes(cmp) && !value)) { unmatched.push(`${raw} (check the column and the value)`); continue; } add("filter", { column: col.name, cmp, value: ["not_empty", "is_empty"].includes(cmp) ? "" : value }, `Keeps rows where ${col.name} ${w} ${value}`.trim() + "."); continue; }
    const fn = /\b(?:call|run|use)\s+(?:the\s+)?([\w-]+)(?:\s+function)?\b/i.exec(raw); const fnRef = fn && FUNCTIONS.find((f) => f.name === fn[1].toLowerCase());
    if (fnRef) { if (!mentioned.length) { unmatched.push(`${raw} (which input columns?)`); continue; } add("function", { function: fnRef.id, columns: mentioned, into: fnRef.name.replace(/-/g, "_"), batchSize: 50, onError: "null" }, `Calls your function ${fnRef.name} on ${mentioned.join(", ")}.`); continue; }
    unmatched.push(raw);
  }
  return { proposals, unmatched };
}

// ------------------------------------------------------------------ suggestions from the profile

export type Suggestion = { id: string; kind: "Clean" | "Privacy" | "Features"; title: string; reason: string; step: Omit<Step, "id"> };

const PII_HINT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\+?\d[\d\s().-]{8,}\d/;

/** Cleaning and feature ideas read from the dataset's own profile and sample. Each says why, so the person can judge it. */
export function suggestFromProfile(ds: Dataset): Suggestion[] {
  const out: Suggestion[] = []; const p = ds.profile; let k = 0; const sid = () => `sg${++k}`;
  const strs = p.columns.filter((c) => c.type === "string");
  const untidy = strs.filter((c) => c.untidyPct >= 5 && !c.pii);
  if (untidy.length) out.push({ id: sid(), kind: "Clean", title: `Trim spaces in ${untidy.map((c) => c.name).join(", ")}`, reason: untidy.map((c) => `${c.name}: ${c.untidyPct}% have stray spaces or mixed letter case`).join("; "), step: { op: "trim", params: { columns: untidy.map((c) => c.name), collapse: true } } });
  const mixed = untidy.filter((c) => c.distinct <= 50);
  if (mixed.length) out.push({ id: sid(), kind: "Clean", title: `Make ${mixed.map((c) => c.name).join(", ")} lower case`, reason: "Few distinct values written in different cases, so the same value is counted as several.", step: { op: "case", params: { columns: mixed.map((c) => c.name), mode: "lower" } } });
  for (const c of p.columns.filter((x) => x.nullPct >= 1 && x.role !== "ignore")) {
    if (c.type === "integer" || c.type === "decimal") out.push({ id: sid(), kind: "Clean", title: `Fill empty ${c.name} with the median`, reason: `${c.nullPct}% of ${c.name} is empty. The median is steady against extreme values.`, step: { op: "fill_missing", params: { column: c.name, strategy: "median", value: "" } } });
    else if (c.type === "string" && c.distinct <= 20 && c.top[0]) out.push({ id: sid(), kind: "Clean", title: `Fill empty ${c.name} with the most common value`, reason: `${c.nullPct}% is empty and the column has only ${c.distinct} values. Review before using it as a label.`, step: { op: "fill_missing", params: { column: c.name, strategy: "mode", value: "" } } });
  }
  if (p.keyDuplicates) out.push({ id: sid(), kind: "Clean", title: `Keep one row per ${p.keyDuplicates.column}`, reason: `${p.keyDuplicates.column} repeats in about ${p.keyDuplicates.pct}% of rows.`, step: { op: "drop_duplicates", params: { keys: [p.keyDuplicates.column], keep: "last" } } });
  // numbers hiding text such as "N/A"
  for (const c of ds.columns.filter((x) => x.type === "integer" || x.type === "decimal")) { const bad = ds.sample.filter((r) => typeof r[c.name] === "string" && String(r[c.name]).trim() !== "").length; if (bad > 0) out.push({ id: sid(), kind: "Clean", title: `Turn stray text in ${c.name} into empty values`, reason: `${bad} sampled rows hold text such as "${String(ds.sample.find((r) => typeof r[c.name] === "string" && String(r[c.name]).trim())![c.name])}" in a numeric column.`, step: { op: "cast", params: { column: c.name, to: c.type } } }); }
  for (const c of p.columns.filter((x) => (x.type === "integer" || x.type === "decimal") && x.p25 !== undefined && x.p75 !== undefined && x.max !== undefined)) { const iqr = (c.p75 as number) - (c.p25 as number); if (iqr > 0 && (c.max as number) > (c.p75 as number) + 3 * iqr) out.push({ id: sid(), kind: "Clean", title: `Clip outliers in ${c.name}`, reason: `The largest value (${c.max}) is far beyond the upper quartile (${c.p75}).`, step: { op: "clip_outliers", params: { column: c.name } } }); }
  const piiCols = strs.filter((c) => c.pii || (ds.sample.filter((r) => PII_HINT.test(String(r[c.name] ?? ""))).length / Math.max(1, ds.sample.length)) >= 0.05);
  if (piiCols.length) out.push({ id: sid(), kind: "Privacy", title: `Mask personal data in ${piiCols.map((c) => c.name).join(", ")}`, reason: "Email addresses or phone numbers were found. Remove them before the data is used to train a model.", step: { op: "pii_mask", params: { columns: piiCols.map((c) => c.name), style: "token" } } });
  const dates = p.columns.filter((c) => c.type === "date" || c.type === "timestamp");
  for (const c of dates.slice(0, 1)) out.push({ id: sid(), kind: "Features", title: `Extract year, month and weekday from ${c.name}`, reason: "Dates are rarely useful to a model as they are. Calendar parts usually are.", step: { op: "date_parts", params: { column: c.name, parts: ["year", "month", "weekday"] } } });
  for (const c of strs.filter((x) => x.distinct >= 2 && x.distinct <= 8 && !x.pii && x.role === "feature").slice(0, 2)) out.push({ id: sid(), kind: "Features", title: `One-hot encode ${c.name}`, reason: `${c.name} has ${c.distinct} values, which suits one column per value.`, step: { op: "one_hot", params: { column: c.name, maxCategories: 12, dropOriginal: false } } });
  const longText = strs.filter((c) => (c.maxLen ?? 0) >= 120 && !c.pii)[0];
  if (longText) out.push({ id: sid(), kind: "Features", title: `Add length features for ${longText.name}`, reason: `${longText.name} holds long text (up to ${longText.maxLen} characters). Length and token counts help filter and weight examples.`, step: { op: "text_stats", params: { column: longText.name } } });
  return out;
}
