"use client";

import clsx from "clsx";
import { useMemo, useState, type ReactNode } from "react";
import { Field, Input, Select, Toggle } from "@/components/ui/Form";
import { INTEGRATIONS } from "@/lib/mlops/catalog";
import { KB_NODE, kbToSpec, type KbDraft } from "@/lib/mlops/knowledge";
import { useMlops } from "@/lib/mlops/store";
import type { Env, NodeRunStatus } from "@/lib/mlops/types";
import { FlowCanvas, type Sel } from "./FlowCanvas";
import { SCHEDULE_LABEL } from "./KbBits";
import { Notice } from "./ui";

export const EMBEDDERS = [
  { id: "text-embedding-3-small (via gateway)", dim: 1536, note: "Hosted embedding model called through the tok∑ner gateway, so policy, budget and usage apply." },
  { id: "multilingual-embedder v2 (library)", dim: 768, note: "Platform library model, 50 languages. Runs on your own serving target." },
  { id: "support-embedder v2", dim: 768, note: "A model from your own registry." },
];

type Props = {
  name: string;
  env: Env;
  draft: KbDraft;
  onProcessing: (p: Partial<KbDraft["processing"]>) => void;
  onEmbedding: (p: Partial<KbDraft["embedding"]>) => void;
  onIndex: (p: Partial<KbDraft["index"]>) => void;
  onAccess: (p: Partial<KbDraft["access"]>) => void;
  onSchedule: (v: KbDraft["schedule"]) => void;
  /** Inspector content for a source node. The page decides how sources are added and removed. */
  renderSource: (sourceId: string) => ReactNode;
  /** Controls shown above the canvas, for example adding a source. */
  toolbar?: ReactNode;
  /** The collection and vector store are fixed once a RAG index exists. */
  indexLocked?: boolean;
  overlay?: Record<string, NodeRunStatus>;
  projects?: string[];
};

const PROJECTS = ["support-ml", "people-assistant", "platform-docs"];

export function KbBuilder(p: Props) {
  const s = useMlops()!;
  const [sel, setSel] = useState<Sel>(null);
  const spec = useMemo(() => kbToSpec(p.name, p.env, p.draft, () => ""), [p.name, p.env, p.draft]);
  const fitKey = p.draft.sources.length;
  const family = (id: string) => INTEGRATIONS.find((i) => i.id === id)?.family;
  const stores = s.connections.filter((c) => family(c.integrationId) === "vector");
  const own = s.models.filter((m) => /embed/i.test(m.task) && !EMBEDDERS.some((e) => e.id.startsWith(m.name))).map((m) => ({ id: `${m.name} v${m.versions[0].version}`, dim: 768, note: "A model from your own registry." }));
  const embedders = [...EMBEDDERS, ...own];
  if (!embedders.some((e) => e.id === p.draft.embedding.model)) embedders.push({ id: p.draft.embedding.model, dim: p.draft.embedding.dimension, note: "" });
  const d = p.draft;
  const selected = sel?.type === "node" ? sel.id : null;

  let inspector: ReactNode;
  if (!selected) {
    inspector = (
      <div className="space-y-3 text-[13px] text-text-secondary">
        <div className="text-sm font-medium text-text-primary">How this RAG index runs</div>
        <p>Documents are read from each source, split and embedded, written to the vector index, and served to assistants through retrieval. Select a step to change how it behaves.</p>
        <p className="text-xs text-text-tertiary">The same steps exist as operators in the pipeline builder, so the flow can be reused in a pipeline.</p>
      </div>
    );
  } else if (selected.startsWith("src-")) {
    inspector = <div className="space-y-4"><Head title="Source" sub="Where documents come from" />{p.renderSource(selected.slice(4))}</div>;
  } else if (selected === KB_NODE.embed) {
    inspector = (
      <div className="space-y-4">
        <Head title="Split and embed" sub="How documents become passages" />
        <Field label="Split documents"><Select value={d.processing.splitOn} onChange={(e) => p.onProcessing({ splitOn: e.target.value as KbDraft["processing"]["splitOn"] })}><option value="structure">On headings and paragraphs</option><option value="fixed">At a fixed size</option></Select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Chunk (tokens)"><Input type="number" value={d.processing.chunkTokens} onChange={(e) => p.onProcessing({ chunkTokens: Number(e.target.value) })} /></Field>
          <Field label="Overlap"><Input type="number" value={d.processing.overlap} onChange={(e) => p.onProcessing({ overlap: Number(e.target.value) })} /></Field>
        </div>
        <Toggle checked={d.processing.maskPii} onChange={(v) => p.onProcessing({ maskPii: v })} label="Mask personal data" description="Masked values are not stored in the index." />
        <Field label="Embedding model" hint={embedders.find((e) => e.id === d.embedding.model)?.note}>
          <Select value={d.embedding.model} onChange={(e) => { const m = embedders.find((x) => x.id === e.target.value); p.onEmbedding({ model: e.target.value, ...(m ? { dimension: m.dim } : {}) }); }}>{embedders.map((e) => <option key={e.id} value={e.id}>{e.id}</option>)}</Select>
        </Field>
        <Field label="Dimension" hint="Must match the model."><Input type="number" value={d.embedding.dimension} onChange={(e) => p.onEmbedding({ dimension: Number(e.target.value) })} /></Field>
        <Notice>Changing the model, dimension, or splitting re-embeds every document.</Notice>
      </div>
    );
  } else if (selected === KB_NODE.index) {
    inspector = (
      <div className="space-y-4">
        <Head title="Vector index" sub="Where passages are stored" />
        <Field label="Vector store connection"><Select disabled={p.indexLocked} value={d.index.connectionId} onChange={(e) => p.onIndex({ connectionId: e.target.value })}><option value="">Choose a connection</option>{stores.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.env})</option>)}</Select></Field>
        <Field label="Collection" hint="Lowercase, numbers, underscores."><Input disabled={p.indexLocked} value={d.index.collection} onChange={(e) => p.onIndex({ collection: e.target.value })} /></Field>
        <Field label="Distance"><Select disabled={p.indexLocked} value={d.index.metric} onChange={(e) => p.onIndex({ metric: e.target.value as KbDraft["index"]["metric"] })}><option value="cosine">Cosine</option><option value="dot">Dot product</option><option value="l2">Euclidean</option></Select></Field>
        {p.indexLocked && <Notice>The vector store and collection cannot change after creation. Create a new RAG index to move.</Notice>}
        {!p.indexLocked && stores.length === 0 && <Notice tone="warn">No vector store connections yet. Add pgvector, Milvus, Qdrant or Weaviate under Integrations.</Notice>}
      </div>
    );
  } else {
    inspector = (
      <div className="space-y-4">
        <Head title="Query" sub="Who may retrieve, and what comes back" />
        <div>
          <div className="text-[13px] font-medium mb-1.5">Projects that may query it</div>
          <div className="flex flex-wrap gap-2">{(p.projects ?? PROJECTS).map((x) => { const on = d.access.projects.includes(x); return <button key={x} type="button" aria-pressed={on} onClick={() => p.onAccess({ projects: on ? d.access.projects.filter((y) => y !== x) : [...d.access.projects, x] })} className={clsx("h-8 px-3 rounded-md border text-[13px]", on ? "border-accent-600 bg-accent-500/10" : "border-border-strong text-text-secondary hover:bg-surface-muted")}>{x}</button>; })}</div>
        </div>
        <Toggle checked={d.access.aclAware} onChange={(v) => p.onAccess({ aclAware: v })} label="Respect source permissions" />
        <Toggle checked={d.access.requireCitations} onChange={(v) => p.onAccess({ requireCitations: v })} label="Require citations" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Passages returned"><Input type="number" value={d.access.topK} onChange={(e) => p.onAccess({ topK: Number(e.target.value) })} /></Field>
          <Field label="Minimum score"><Input type="number" step="0.05" value={d.access.minScore} onChange={(e) => p.onAccess({ minScore: Number(e.target.value) })} /></Field>
        </div>
        <Field label="Refresh"><Select value={d.schedule} onChange={(e) => p.onSchedule(e.target.value as KbDraft["schedule"])}>{(Object.keys(SCHEDULE_LABEL) as (keyof typeof SCHEDULE_LABEL)[]).map((k) => <option key={k} value={k}>{SCHEDULE_LABEL[k]}</option>)}</Select></Field>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden">
      {p.toolbar && <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border">{p.toolbar}</div>}
      <div className="flex flex-col lg:flex-row">
        <div className="relative flex-1 h-[360px] min-w-0">
          <FlowCanvas spec={spec} selection={sel} onSelect={setSel} readOnly overlay={p.overlay} fitKey={fitKey} label={`${p.name || "RAG index"} flow`} />
        </div>
        <aside className="lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-border p-4 overflow-y-auto lg:max-h-[360px]" aria-label="Step settings">{inspector}</aside>
      </div>
    </div>
  );
}

function Head({ title, sub }: { title: string; sub: string }) {
  return <div><div className="text-sm font-medium text-text-primary">{title}</div><div className="text-xs text-text-tertiary">{sub}</div></div>;
}
