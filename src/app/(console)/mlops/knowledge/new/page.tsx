"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, FileUp, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Field, Input, Segmented, Select, Toggle } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Notice, useRole } from "@/components/mlops/ui";
import { usePaymentGate } from "@/components/billing/PaymentGate";
import { SCHEDULE_LABEL } from "@/components/mlops/KbBits";
import { EMBEDDERS, KbBuilder } from "@/components/mlops/KbBuilder";
import { INTEGRATIONS } from "@/lib/mlops/catalog";
import { can } from "@/lib/mlops/rbac";
import { mlops, useMlops, useMlopsStatus, type KbInput } from "@/lib/mlops/store";
import { toast } from "@/lib/mlops/toast";
import type { Env, KbSource, KnowledgeBase } from "@/lib/mlops/types";
import type { KbDraft } from "@/lib/mlops/knowledge";

const STEPS = ["Basics", "Sources", "Processing", "Embedding and index", "Access", "Review"] as const;
const TEXT_EXT = /\.(txt|md|markdown|csv|json)$/i;
const PROJECTS = ["support-ml", "people-assistant", "platform-docs"];

export default function NewKnowledgeBase() {
  const s = useMlops()!;
  const role = useRole();
  const gate = usePaymentGate();
  const router = useRouter();
  const [mode, setMode] = useState<"guided" | "builder">("guided");
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");
  const [title, setTitle] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [env, setEnv] = useState<Env>("staging");
  const [files, setFiles] = useState<{ name: string; size: number; text?: string; file?: File }[]>([]);
  const [bucketOn, setBucketOn] = useState(false);
  const [bucketConn, setBucketConn] = useState("");
  const [bucketPath, setBucketPath] = useState("kb/");
  const [bucketInclude, setBucketInclude] = useState("*.md, *.pdf, *.docx");
  const [splitOn, setSplitOn] = useState<"structure" | "fixed">("structure");
  const [chunk, setChunk] = useState(512);
  const [overlap, setOverlap] = useState(64);
  const [maskPii, setMaskPii] = useState(true);
  const [embedder, setEmbedder] = useState(EMBEDDERS[1].id);
  const [dim, setDim] = useState(768);
  const [vstore, setVstore] = useState("");
  const [collectionEdit, setCollectionEdit] = useState<string | null>(null);
  const collection = collectionEdit ?? name.replace(/-/g, "_");
  const setCollection = (v: string) => setCollectionEdit(v);
  const [metric, setMetric] = useState<"cosine" | "dot" | "l2">("cosine");
  const [projects, setProjects] = useState<string[]>(["support-ml"]);
  const [aclAware, setAclAware] = useState(true);
  const [citations, setCitations] = useState(true);
  const [minScore, setMinScore] = useState(0.35);
  const [topK, setTopK] = useState(5);
  const [schedule, setSchedule] = useState<KnowledgeBase["schedule"]>("daily");
  const pick = useRef<HTMLInputElement>(null);

  const family = (id: string) => INTEGRATIONS.find((i) => i.id === id)?.family;
  const stores = s.connections.filter((c) => family(c.integrationId) === "vector");
  const buckets = s.connections.filter((c) => family(c.integrationId) === "object-store");
  const embeddersAll = useMemo(() => {
    const own = s.models.filter((m) => /embed/i.test(m.task) && !EMBEDDERS.some((e) => e.id.startsWith(m.name))).map((m) => ({ id: `${m.name} v${m.versions[0].version}`, dim: 768, note: "A model from your own registry." }));
    return [...EMBEDDERS, ...own];
  }, [s.models]);

  const allowed = can(role, "pipeline.publish", env);
  const stepError = (i: number): string => {
    if (i === 0) { if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(name)) return "Use lowercase letters, numbers and dashes for the identifier, 2 to 63 characters."; if (s.knowledge.some((k) => k.id === name)) return "That identifier is taken."; }
    if (i === 1 && bucketOn && !bucketConn) return "Choose a connection for the bucket.";
    if (i === 2) { if (chunk < 64 || chunk > 4096) return "Chunk size is between 64 and 4096 tokens."; if (overlap < 0 || overlap >= chunk / 2) return "Overlap must be below half the chunk size."; }
    if (i === 3) { if (!vstore) return "Choose a vector store connection."; if (!/^[a-z][a-z0-9_]{1,62}$/.test(collection)) return "The collection name uses lowercase letters, numbers and underscores."; if (!(dim > 0)) return "Enter the embedding dimension."; }
    if (i === 4 && projects.length === 0) return "Allow at least one project.";
    return "";
  };
  const next = async () => { const e = stepError(step); if (e) { setErr(e); return; } setErr(""); setStep((x) => Math.min(STEPS.length - 1, x + 1)); };

  async function addFiles(list: FileList | null) {
    if (!list) return;
    const out = [...files];
    for (const f of Array.from(list)) {
      let text: string | undefined;
      if (TEXT_EXT.test(f.name) && f.size <= 1_000_000) { try { text = await f.text(); } catch { /* the server reads it instead */ } }
      out.push({ name: f.name, size: f.size, text, file: f });
    }
    setFiles(out);
  }

  const draft: KbDraft = useMemo(() => ({
    sources: [
      ...(files.length ? [{ id: "upload", name: "Uploaded files", kind: "upload", documents: files.length, status: "pending" } as KbSource] : []),
      ...(bucketOn ? [{ id: "bucket", name: buckets.find((c) => c.id === bucketConn)?.name ?? "Bucket", kind: "object-store", connectionId: bucketConn, path: bucketPath, include: bucketInclude, documents: 0, status: "pending" } as KbSource] : []),
    ],
    processing: { splitOn, chunkTokens: chunk, overlap, maskPii }, embedding: { model: embedder, dimension: dim },
    index: { connectionId: vstore, collection, metric }, schedule, access: { projects, aclAware, requireCitations: citations, minScore, topK },
  }), [files, bucketOn, bucketConn, bucketPath, bucketInclude, buckets, splitOn, chunk, overlap, maskPii, embedder, dim, vstore, collection, metric, schedule, projects, aclAware, citations, minScore, topK]);

  async function createFromBuilder() {
    for (let i = 0; i <= 4; i++) { const e = stepError(i); if (e) { setErr(e); return; } }
    setErr(""); await create();
  }

  function create() { gate("save", createNow); }
  async function createNow() {
    const input: KbInput = {
      name, title, description, env,
      sources: [
        ...(files.length ? [{ kind: "upload" as const, name: "Uploaded files", files }] : []),
        ...(bucketOn ? [{ kind: "object-store" as const, name: "", connectionId: bucketConn, path: bucketPath, include: bucketInclude }] : []),
      ],
      processing: { splitOn, chunkTokens: chunk, overlap, maskPii }, embedding: { model: embedder, dimension: dim },
      index: { connectionId: vstore, collection, metric }, schedule, access: { projects, aclAware, requireCitations: citations, minScore, topK },
    };
    const r = await mlops.createKnowledgeBase(input);
    if (!r.ok) { setErr(r.error); return; }
    toast(`${title || name} created`);
    router.push(`/mlops/knowledge/${r.id}`);
  }

  const live = useMlopsStatus().mode === "live";
  const readable = files.filter((f) => f.text).length;
  return (
    <div className="space-y-5 max-w-5xl">
      <Link href="/mlops/knowledge" className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary"><ArrowLeft size={13} /> Knowledge</Link>
      <PageHeader title="New knowledge base" description="Choose where documents come from, how they are split and embedded, and who may query the result."
        action={<Segmented<"guided" | "builder"> value={mode} onChange={(m) => { setMode(m); setErr(""); }} options={[{ value: "guided", label: "Guided" }, { value: "builder", label: "Builder" }]} />} />
      {mode === "builder" ? (
        <div className="space-y-4">
          <Card><CardBody className="grid md:grid-cols-[1fr_1fr_180px] gap-4">
            <Field label="Name"><Input value={title} onChange={(e) => { setTitle(e.target.value); if (!name || name === slug(title.slice(0, -1)) || name === slug(title)) setName(slug(e.target.value)); }} placeholder="Support articles" /></Field>
            <Field label="Identifier" hint="Used in the API. Cannot change later."><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="support-articles" /></Field>
            <Field label="Environment"><Select value={env} onChange={(e) => setEnv(e.target.value as Env)}><option value="development">Development</option><option value="staging">Staging</option><option value="production">Production</option></Select></Field>
          </CardBody></Card>
          <input ref={pick} type="file" multiple className="sr-only" aria-label="Documents" onChange={(e) => void addFiles(e.target.files)} />
          <KbBuilder name={name} env={env} draft={draft}
            onProcessing={(x) => { if (x.splitOn !== undefined) setSplitOn(x.splitOn); if (x.chunkTokens !== undefined) setChunk(x.chunkTokens); if (x.overlap !== undefined) setOverlap(x.overlap); if (x.maskPii !== undefined) setMaskPii(x.maskPii); }}
            onEmbedding={(x) => { if (x.model !== undefined) setEmbedder(x.model); if (x.dimension !== undefined) setDim(x.dimension); }}
            onIndex={(x) => { if (x.connectionId !== undefined) setVstore(x.connectionId); if (x.collection !== undefined) setCollection(x.collection); if (x.metric !== undefined) setMetric(x.metric); }}
            onAccess={(x) => { if (x.projects !== undefined) setProjects(x.projects); if (x.aclAware !== undefined) setAclAware(x.aclAware); if (x.requireCitations !== undefined) setCitations(x.requireCitations); if (x.minScore !== undefined) setMinScore(x.minScore); if (x.topK !== undefined) setTopK(x.topK); }}
            onSchedule={setSchedule}
            toolbar={<>
              <Button variant="secondary" onClick={() => pick.current?.click()}><FileUp size={13} /> Add files</Button>
              <Button variant="secondary" disabled={bucketOn} onClick={() => setBucketOn(true)}>Add bucket source</Button>
              <span className="text-xs text-text-tertiary ml-auto">Select a step on the canvas to change it.</span>
            </>}
            renderSource={(sid) => sid === "upload" ? (
              <div className="space-y-3">
                <ul className="divide-y divide-border rounded-md border border-border text-[13px]">
                  {files.map((f, i) => (<li key={i} className="flex items-center justify-between px-3 py-2"><span className="truncate">{f.name}<span className="text-text-tertiary"> · {(f.size / 1024).toFixed(0)} KB</span></span><button aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-text-tertiary hover:text-text-primary"><X size={14} /></button></li>))}
                </ul>
                <div className="flex gap-2"><Button variant="secondary" onClick={() => pick.current?.click()}>Add files</Button><Button variant="secondary" onClick={() => setFiles([])}>Remove source</Button></div>
              </div>
            ) : sid === "bucket" ? (
              <div className="space-y-3">
                <Field label="Connection"><Select value={bucketConn} onChange={(e) => setBucketConn(e.target.value)}><option value="">Choose a connection</option>{buckets.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.env})</option>)}</Select></Field>
                <Field label="Path prefix"><Input value={bucketPath} onChange={(e) => setBucketPath(e.target.value)} /></Field>
                <Field label="Include" hint="Comma separated file patterns."><Input value={bucketInclude} onChange={(e) => setBucketInclude(e.target.value)} /></Field>
                {buckets.length === 0 && <Notice tone="warn">No object storage connections yet. Add one under Integrations first.</Notice>}
                <Button variant="secondary" onClick={() => setBucketOn(false)}>Remove source</Button>
              </div>
            ) : (
              <p className="text-[13px] text-text-secondary">No source yet. Add files or a bucket from the bar above, or continue and add one later.</p>
            )} />
          {!allowed.ok && <Notice tone="warn">{allowed.reason}</Notice>}
          {err && <Notice tone="bad">{err}</Notice>}
          <div className="flex justify-end"><Button variant="primary" disabled={!allowed.ok} onClick={createFromBuilder}>Create knowledge base</Button></div>
        </div>
      ) : (
      <div className="grid md:grid-cols-[210px_1fr] gap-6">
        <ol className="space-y-1" aria-label="Steps">
          {STEPS.map((t, i) => (
            <li key={t}>
              <button onClick={() => { if (i <= step) setStep(i); }} aria-current={i === step ? "step" : undefined} disabled={i > step}
                className={clsx("w-full flex items-center gap-2.5 h-9 px-2.5 rounded-md text-[13px] text-left", i === step ? "bg-surface-muted font-medium text-text-primary" : i < step ? "text-text-secondary hover:bg-surface-muted" : "text-text-tertiary cursor-not-allowed")}>
                <span className={clsx("h-5 w-5 rounded-full grid place-items-center text-[11px] shrink-0", i < step ? "bg-emph text-on-emph" : "border border-border-strong")}>{i < step ? <Check size={11} /> : i + 1}</span>{t}
              </button>
            </li>
          ))}
        </ol>
        <Card>
          <CardBody className="space-y-5">
            {step === 0 && (<>
              <Field label="Name"><Input value={title} onChange={(e) => { setTitle(e.target.value); if (!name || name === slug(title.slice(0, -1)) || name === slug(title)) setName(slug(e.target.value)); }} placeholder="Support articles" /></Field>
              <Field label="Identifier" hint="Used in the API and as the default collection name. Cannot change later."><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="support-articles" /></Field>
              <Field label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What it contains and which assistant uses it" /></Field>
              <Field label="Environment" hint="Production knowledge bases need a vector store connection that belongs to production."><Select value={env} onChange={(e) => setEnv(e.target.value as Env)}><option value="development">Development</option><option value="staging">Staging</option><option value="production">Production</option></Select></Field>
              {!allowed.ok && <Notice tone="warn">{allowed.reason}</Notice>}
            </>)}
            {step === 1 && (<>
              <div>
                <div className="text-[13px] font-medium mb-1.5">Upload files</div>
                <input ref={pick} type="file" multiple className="sr-only" aria-label="Documents" onChange={(e) => void addFiles(e.target.files)} />
                <button type="button" onClick={() => pick.current?.click()} className="w-full rounded-lg border border-dashed border-border-strong px-4 py-5 text-center hover:bg-surface-subtle">
                  <FileUp size={18} className="mx-auto text-text-tertiary" /><div className="mt-1.5 text-sm text-text-secondary">Choose documents. PDF, Word, Markdown, text, CSV and more.</div>
                </button>
                {files.length > 0 && (
                  <ul className="mt-2 divide-y divide-border rounded-md border border-border text-[13px]">
                    {files.map((f, i) => (<li key={i} className="flex items-center justify-between px-3 py-2"><span className="truncate">{f.name}<span className="text-text-tertiary"> · {(f.size / 1024).toFixed(0)} KB</span></span><button aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-text-tertiary hover:text-text-primary"><X size={14} /></button></li>))}
                  </ul>
                )}
                {files.length > 0 && <p className="text-xs text-text-tertiary mt-1.5">{readable} of {files.length} read in your browser for the test search{live ? "" : " in this sample workspace"}. The server extracts every format, scans each file and applies your document policy.</p>}
              </div>
              <div className="border-t border-border pt-4">
                <Toggle checked={bucketOn} onChange={setBucketOn} label="Read from a bucket" description="A connection to object storage. Files are read on every sync, and only new or changed files are processed again." />
                {bucketOn && (
                  <div className="grid sm:grid-cols-2 gap-4 mt-2">
                    <Field label="Connection"><Select value={bucketConn} onChange={(e) => setBucketConn(e.target.value)}><option value="">Choose a connection</option>{buckets.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.env})</option>)}</Select></Field>
                    <Field label="Path prefix"><Input value={bucketPath} onChange={(e) => setBucketPath(e.target.value)} /></Field>
                    <Field label="Include" hint="Comma separated file patterns."><Input value={bucketInclude} onChange={(e) => setBucketInclude(e.target.value)} /></Field>
                    {buckets.length === 0 && <Notice tone="warn">No object storage connections yet. Add one under Integrations first.</Notice>}
                  </div>
                )}
              </div>
              {files.length === 0 && !bucketOn && <Notice>You can continue without a source and add one later. The knowledge base stays empty until then.</Notice>}
            </>)}
            {step === 2 && (<>
              <Field label="Split documents" hint="Structure aware splitting keeps headings, tables and list items together. Fixed splitting cuts at the chunk size."><Select value={splitOn} onChange={(e) => setSplitOn(e.target.value as "structure" | "fixed")}><option value="structure">On headings and paragraphs</option><option value="fixed">At a fixed size</option></Select></Field>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Chunk size (tokens)" hint="Smaller chunks retrieve more precisely. Larger chunks keep more context."><Input type="number" value={chunk} onChange={(e) => setChunk(Number(e.target.value))} /></Field>
                <Field label="Overlap (tokens)" hint="Repeated at the start of the next chunk so a sentence is never cut off."><Input type="number" value={overlap} onChange={(e) => setOverlap(Number(e.target.value))} /></Field>
              </div>
              <Toggle checked={maskPii} onChange={setMaskPii} label="Mask personal data before embedding" description="Applies the organization's document policy. Masked values are not stored in the index." />
            </>)}
            {step === 3 && (<>
              <Field label="Embedding model" hint={embeddersAll.find((e) => e.id === embedder)?.note}>
                <Select value={embedder} onChange={(e) => { setEmbedder(e.target.value); const m = embeddersAll.find((x) => x.id === e.target.value); if (m) setDim(m.dim); }}>{embeddersAll.map((e) => <option key={e.id} value={e.id}>{e.id}</option>)}</Select>
              </Field>
              <div className="grid sm:grid-cols-3 gap-4">
                <Field label="Dimension" hint="Must match the model."><Input type="number" value={dim} onChange={(e) => setDim(Number(e.target.value))} /></Field>
                <Field label="Distance"><Select value={metric} onChange={(e) => setMetric(e.target.value as typeof metric)}><option value="cosine">Cosine</option><option value="dot">Dot product</option><option value="l2">Euclidean</option></Select></Field>
                <Field label="Collection" hint="Lowercase, numbers, underscores."><Input value={collection} onChange={(e) => setCollection(e.target.value)} /></Field>
              </div>
              <Field label="Vector store connection"><Select value={vstore} onChange={(e) => setVstore(e.target.value)}><option value="">Choose a connection</option>{stores.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.env})</option>)}</Select></Field>
              {stores.length === 0 && <Notice tone="warn">No vector store connections yet. Add pgvector, Milvus, Qdrant or Weaviate under Integrations.</Notice>}
              <Notice>Changing the embedding model or dimension later re-embeds every document. Choose it with care.</Notice>
            </>)}
            {step === 4 && (<>
              <div>
                <div className="text-[13px] font-medium mb-1.5">Projects that may query it</div>
                <div className="flex flex-wrap gap-2">{PROJECTS.map((p) => { const on = projects.includes(p); return <button key={p} aria-pressed={on} onClick={() => setProjects(on ? projects.filter((x) => x !== p) : [...projects, p])} className={clsx("h-8 px-3 rounded-md border text-[13px]", on ? "border-accent-600 bg-accent-500/10" : "border-border-strong text-text-secondary hover:bg-surface-muted")}>{p}</button>; })}</div>
              </div>
              <Toggle checked={aclAware} onChange={setAclAware} label="Respect source permissions" description="Results are limited to documents the caller could read in the source system." />
              <Toggle checked={citations} onChange={setCitations} label="Require citations" description="Every returned passage carries its source and page so answers can be checked." />
              <div className="grid sm:grid-cols-3 gap-4">
                <Field label="Passages returned"><Input type="number" value={topK} onChange={(e) => setTopK(Number(e.target.value))} /></Field>
                <Field label="Minimum score" hint="Below this a passage is not returned."><Input type="number" step="0.05" value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} /></Field>
                <Field label="Refresh"><Select value={schedule} onChange={(e) => setSchedule(e.target.value as typeof schedule)}>{(Object.keys(SCHEDULE_LABEL) as (keyof typeof SCHEDULE_LABEL)[]).map((k) => <option key={k} value={k}>{SCHEDULE_LABEL[k]}</option>)}</Select></Field>
              </div>
            </>)}
            {step === 5 && (
              <dl className="grid grid-cols-[150px_1fr] gap-x-4 gap-y-2.5 text-[13px]">
                {([["Name", `${title || name} (${name})`], ["Environment", env], ["Sources", [files.length ? `${files.length} uploaded file${files.length > 1 ? "s" : ""}` : "", bucketOn ? `bucket ${bucketPath}` : ""].filter(Boolean).join(" and ") || "none yet"],
                  ["Splitting", `${splitOn === "structure" ? "On structure" : "Fixed"}, ${chunk} tokens, ${overlap} overlap${maskPii ? ", personal data masked" : ""}`], ["Embedding", `${embedder}, ${dim} dimensions, ${metric}`],
                  ["Index", `${collection} on ${stores.find((c) => c.id === vstore)?.name ?? "n/a"}`], ["Access", `${projects.join(", ")}. ${aclAware ? "Source permissions enforced." : "Source permissions not enforced."}`], ["Refresh", SCHEDULE_LABEL[schedule]]] as [string, string][]).map(([k, v]) => (
                  <div key={k} className="contents"><dt className="text-text-tertiary">{k}</dt><dd className="text-text-primary">{v}</dd></div>))}
              </dl>
            )}
            {err && <Notice tone="bad">{err}</Notice>}
            <div className="flex justify-between pt-2 border-t border-border">
              <Button variant="secondary" disabled={step === 0} onClick={() => { setErr(""); setStep(step - 1); }}>Back</Button>
              {step < STEPS.length - 1 ? <Button variant="primary" onClick={next}>Continue</Button> : <Button variant="primary" disabled={!allowed.ok} onClick={create}>Create knowledge base</Button>}
            </div>
          </CardBody>
        </Card>
      </div>
      )}
    </div>
  );
}

const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 63);
