import type { KbChunk, KbEvalQuestion, KbEvalRun, KnowledgeBase } from "./types";

/**
 * Retrieval preview used by the sample workspace. It scores the sample passages by keyword overlap so the playground and the
 * evaluation report real, reproducible numbers over the passages shown. A live RAG index queries its vector index instead.
 */
const STOP = new Set("a an and are as at be by can do does for from has have how i if in is it its my of on or our should that the their then there these they this to was we what when where which who why will with you your".split(" "));

export function tokens(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)).map((w) => w.replace(/(ing|ed|es|s)$/, ""));
}

export type Hit = { chunk: KbChunk; score: number };

export function search(chunks: KbChunk[], query: string, opts: { topK: number; minScore: number; source?: string }): Hit[] {
  const q = tokens(query);
  if (q.length === 0) return [];
  const pool = chunks.filter((c) => !opts.source || c.source === opts.source);
  const df = new Map<string, number>();
  const docs = pool.map((c) => { const t = tokens(`${c.heading ?? ""} ${c.text}`); new Set(t).forEach((w) => df.set(w, (df.get(w) ?? 0) + 1)); return t; });
  const n = Math.max(1, pool.length);
  const idf = (w: string) => Math.log(1 + (n - (df.get(w) ?? 0) + 0.5) / ((df.get(w) ?? 0) + 0.5));
  const max = q.reduce((a, w) => a + idf(w), 0) || 1;
  return pool.map((chunk, i) => {
    const bag = docs[i];
    const hit = q.reduce((a, w) => a + (bag.includes(w) ? idf(w) : 0), 0);
    return { chunk, score: Math.round((hit / max) * 100) / 100 };
  }).filter((h) => h.score >= opts.minScore && h.score > 0).sort((a, b) => b.score - a.score).slice(0, opts.topK);
}

export function evaluate(kb: KnowledgeBase, by: string, at: string, id: string): KbEvalRun {
  let recall = 0, rr = 0, noAnswerOk = 0, noAnswerN = 0, answerable = 0;
  const failures: KbEvalRun["failures"] = [];
  for (const q of kb.evalQuestions) {
    const hits = search(kb.chunks, q.question, { topK: 5, minScore: kb.access.minScore });
    if (q.expectedSource === "none") {
      noAnswerN++;
      if (hits.length === 0) noAnswerOk++; else failures.push({ question: q.question, expected: "no passage above the score threshold", got: `${hits[0].chunk.source} (${hits[0].score})` });
      continue;
    }
    answerable++;
    const rank = hits.findIndex((h) => h.chunk.source === q.expectedSource);
    if (rank >= 0) { recall++; rr += 1 / (rank + 1); } else failures.push({ question: q.question, expected: q.expectedSource, got: hits[0] ? `${hits[0].chunk.source} (${hits[0].score})` : "nothing above the threshold" });
  }
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return { id, at, by, questions: kb.evalQuestions.length, recallAt5: answerable ? r2(recall / answerable) : 0, mrr: answerable ? r2(rr / answerable) : 0, noAnswerAccuracy: noAnswerN ? r2(noAnswerOk / noAnswerN) : 1, failures };
}

/** Splits text on blank lines and packs paragraphs up to roughly `size` tokens, repeating the tail as overlap. */
export function chunkText(source: string, text: string, size: number, overlap: number, at: string): KbChunk[] {
  // A heading line directly followed by text (no blank line between) is the heading plus the paragraph below it, not one heading.
  const paras = text.split(/\n\s*\n/).flatMap((p) => { const t = p.trim(); const m = /^(#{1,6}[ \t][^\n]*)\n([\s\S]+)$/.exec(t); return m ? [m[1].trim(), m[2].trim()] : [t]; }).filter(Boolean);
  const out: KbChunk[] = [];
  let cur: string[] = []; let len = 0; let heading: string | undefined;
  const words = (s: string) => s.split(/\s+/).length;
  const flush = () => {
    if (!cur.length) return;
    out.push({ id: `${source}-${out.length + 1}`, source, heading, text: cur.join("\n\n"), updatedAt: at });
    const tail = cur[cur.length - 1];
    cur = overlap > 0 && words(tail) <= overlap ? [tail] : []; len = cur.length ? words(tail) : 0;
  };
  for (const p of paras) {
    if (/^#{1,6}\s/.test(p)) { flush(); heading = p.replace(/^#{1,6}\s+/, ""); continue; }
    const w = words(p) * 1.3;
    if (len + w > size && cur.length) flush();
    cur.push(p); len += w;
  }
  flush();
  return out;
}

export function usageSnippets(kb: KnowledgeBase): { id: string; label: string; code: string }[] {
  const body = JSON.stringify({ query: "How do I reset my password?", topK: kb.access.topK, minScore: kb.access.minScore }, null, 2);
  return [
    { id: "curl", label: "curl", code: `curl -X POST https://gateway.example.com/v1/knowledge/${kb.id}:search \\\n  -H "Authorization: Bearer $TOKENER_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${body.replace(/\n\s*/g, " ")}'` },
    { id: "python", label: "Python", code: `import os, requests\n\nr = requests.post(\n    "https://gateway.example.com/v1/knowledge/${kb.id}:search",\n    headers={"Authorization": f"Bearer {os.environ['TOKENER_API_KEY']}"},\n    json={"query": "How do I reset my password?", "topK": ${kb.access.topK}, "minScore": ${kb.access.minScore}},\n    timeout=30,\n)\nfor hit in r.json()["hits"]:\n    print(hit["score"], hit["source"], hit["text"][:80])` },
    { id: "node", label: "Node", code: `const r = await fetch("https://gateway.example.com/v1/knowledge/${kb.id}:search", {\n  method: "POST",\n  headers: { Authorization: \`Bearer \${process.env.TOKENER_API_KEY}\`, "Content-Type": "application/json" },\n  body: JSON.stringify({ query: "How do I reset my password?", topK: ${kb.access.topK}, minScore: ${kb.access.minScore} }),\n});\nconst { hits } = await r.json();` },
  ];
}

// ------------------------------------------------------------------ builder view

import { newSpec, type PipelineSpec, type SpecNode } from "./spec";
import type { KbSource } from "./types";

/** The part of a RAG index that the builder edits. The guided form edits the same fields. */
export type KbDraft = Pick<KnowledgeBase, "sources" | "processing" | "embedding" | "index" | "access" | "schedule">;

export const KB_NODE = { embed: "embed", index: "index", query: "query" } as const;
export const srcNodeId = (s: KbSource) => `src-${s.id}`;

/**
 * Draws a RAG index as the pipeline it runs: sources, split and embed, index, query. The same operators exist in the
 * pipeline builder, so a RAG index can later be exported as a pipeline without translation.
 */
export function kbToSpec(name: string, env: KnowledgeBase["env"], d: KbDraft, connName: (id?: string) => string): PipelineSpec {
  let spec = newSpec(name || "knowledge-base", env);
  const node = (id: string, operator: string, label: string, x: number, y: number, config: Record<string, unknown>, connection?: string): SpecNode => ({ id, operator, schemaVersion: "1", name: label, x, y, config, connection });
  const nodes: SpecNode[] = [];
  const sources = d.sources.length ? d.sources : [{ id: "none", name: "No source yet", kind: "upload" as const, documents: 0, status: "pending" as const }];
  const gap = 120;
  const top = Math.max(0, ((Math.max(sources.length, 1) - 1) * gap) / 2);
  const midY = top + 0;
  sources.forEach((s, i) => nodes.push(node(s.id === "none" ? "src-none" : srcNodeId(s), "ingest_documents", s.name, 0, i * gap, s.kind === "upload" ? { prefix: `${s.documents} uploaded`, glob: " files" } : { prefix: s.path ?? "", glob: s.include ? ` ${s.include}` : "" }, s.connectionId)));
  nodes.push(node(KB_NODE.embed, "chunk_embed", "Split and embed", 270, midY, { chunk: d.processing.chunkTokens, model: d.embedding.model.replace(/ \(.*\)$/, "") }));
  nodes.push(node(KB_NODE.index, "vector_index", "Index", 540, midY, { collection: d.index.collection || "collection", dimension: d.embedding.dimension }, d.index.connectionId));
  nodes.push(node(KB_NODE.query, "retrieve", "Query", 810, midY, { topK: d.access.topK, minScore: d.access.minScore }));
  const edges = [
    ...sources.map((s) => ({ id: `e-${s.id}`, from: s.id === "none" ? "src-none" : srcNodeId(s), fromPort: "documents", to: KB_NODE.embed, toPort: "documents" })),
    { id: "e-embed-index", from: KB_NODE.embed, fromPort: "embeddings", to: KB_NODE.index, toPort: "embeddings" },
    { id: "e-index-query", from: KB_NODE.index, fromPort: "index", to: KB_NODE.query, toPort: "index" },
  ];
  void connName;
  spec = { ...spec, nodes, edges };
  return spec;
}

/** Run overlay for the canvas, from what the last sync did. */
export function kbOverlay(kb: KnowledgeBase): Record<string, "succeeded" | "failed" | "pending" | "running" | "skipped"> {
  const out: Record<string, "succeeded" | "failed" | "pending" | "running" | "skipped"> = {};
  const map = { synced: "succeeded", failed: "failed", pending: "pending", syncing: "running" } as const;
  kb.sources.forEach((s) => { out[srcNodeId(s)] = map[s.status]; });
  const last = kb.runs[0];
  const stage = !last ? "pending" : last.state === "running" ? "running" : last.state === "failed" ? "skipped" : "succeeded";
  out[KB_NODE.embed] = stage; out[KB_NODE.index] = stage;
  out[KB_NODE.query] = kb.status === "ready" || kb.status === "degraded" ? (kb.chunks.length ? "succeeded" : "pending") : kb.status === "indexing" ? "running" : "pending";
  return out;
}
