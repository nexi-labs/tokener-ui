"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, Play, RefreshCw, Search as SearchIcon, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select, Toggle } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { CodeBlock, Confirm, DemoTag, EnvBadge, GuardButton, Kpi, KeyValue, Notice, Tabs, fmtDate, fmtMb, relTime, useRole } from "@/components/mlops/ui";
import { KbStatusBadge, RunBadge, SCHEDULE_LABEL, SourceBadge, compact, pct } from "@/components/mlops/KbBits";
import { INTEGRATIONS } from "@/lib/mlops/catalog";
import { kbOverlay, usageSnippets, type Hit } from "@/lib/mlops/knowledge";
import { KbBuilder } from "@/components/mlops/KbBuilder";
import { mlops, useMlops, useMlopsStatus } from "@/lib/mlops/store";
import { toast } from "@/lib/mlops/toast";
import type { KnowledgeBase } from "@/lib/mlops/types";

type Tab = "overview" | "flow" | "sources" | "ingestion" | "search" | "evaluation" | "access" | "settings";
const PROJECTS = ["support-ml", "people-assistant", "platform-docs"];

export default function KnowledgeDetail() {
  const { id } = useParams<{ id: string }>();
  const s = useMlops()!;
  const role = useRole();
  const [tab, setTab] = useState<Tab>("overview");
  const kb = s.knowledge.find((k) => k.id === id);
  if (!kb) return <Card><EmptyState icon={BookOpen} title="RAG index not found" description="It may have been deleted, or the link is wrong." action={<Link href="/mlops/rag"><Button>Back to knowledge</Button></Link>} /></Card>;
  const conn = s.connections.find((c) => c.id === kb.index.connectionId);
  const sync = async () => { const r = await mlops.syncKnowledgeBase(kb.id); if (!r.ok) toast(r.error, "error"); else if (r.health === "ok") toast("Sync finished"); else toast("Sync finished with failed sources. See Ingestion.", "error"); };

  return (
    <div className="space-y-5">
      <Link href="/mlops/rag" className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary"><ArrowLeft size={13} /> RAG</Link>
      <PageHeader title={kb.name} description={kb.description}
        action={<div className="flex items-center gap-2">{kb.demo && <DemoTag />}<EnvBadge env={kb.env} /><KbStatusBadge s={kb.status} /><GuardButton action="pipeline.run" env={kb.env} role={role} variant="primary" onClick={sync}><RefreshCw size={14} /> Sync now</GuardButton></div>} />
      <Tabs<Tab> label="RAG index sections" value={tab} onChange={setTab} tabs={[
        { id: "overview", label: "Overview" }, { id: "flow", label: "Flow" }, { id: "sources", label: "Sources", count: kb.sources.length }, { id: "ingestion", label: "Ingestion", count: kb.runs.length },
        { id: "search", label: "Test search" }, { id: "evaluation", label: "Evaluation", count: kb.evalQuestions.length }, { id: "access", label: "Access and usage" }, { id: "settings", label: "Settings" }]} />
      {tab === "overview" && <Overview kb={kb} connName={conn?.name} go={setTab} />}
      {tab === "flow" && <Flow kb={kb} role={role} go={setTab} />}
      {tab === "sources" && <Sources kb={kb} role={role} />}
      {tab === "ingestion" && <Ingestion kb={kb} />}
      {tab === "search" && <Playground kb={kb} />}
      {tab === "evaluation" && <Evaluation kb={kb} role={role} />}
      {tab === "access" && <Access kb={kb} role={role} />}
      {tab === "settings" && <Settings kb={kb} role={role} connName={conn?.name} go={setTab} />}
    </div>
  );
}

function Overview({ kb, connName, go }: { kb: KnowledgeBase; connName?: string; go: (t: Tab) => void }) {
  const ev = kb.evalRuns[0];
  const failed = kb.sources.filter((x) => x.status === "failed");
  return (
    <div className="space-y-5">
      {failed.map((f) => <Notice key={f.id} tone="bad" title={`${f.name} could not be read`}>{f.error} <button className="underline" onClick={() => go("ingestion")}>See the run</button></Notice>)}
      {kb.stats.staleDocuments > 0 && <Notice tone="warn" title={`${kb.stats.staleDocuments} documents are out of date`}>The source has newer versions than the index. Answers may quote old content until the next successful sync.</Notice>}
      {kb.status === "empty" && <Notice>This RAG index has no sources yet. Add one under Sources, then sync.</Notice>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Documents" value={kb.stats.documents} sub={fmtMb(kb.stats.sizeMb)} />
        <Kpi label="Passages" value={kb.stats.chunks.toLocaleString()} sub={`${compact(kb.stats.tokens)} tokens embedded`} />
        <Kpi label="Last sync" value={kb.stats.lastSyncAt ? relTime(kb.stats.lastSyncAt) : "never"} sub={SCHEDULE_LABEL[kb.schedule]} />
        <Kpi label="Recall at 5" value={ev ? pct(ev.recallAt5) : "not tested"} tone={ev && ev.recallAt5 < 0.8 ? "warn" : undefined} sub={ev ? `${ev.questions} test questions, ${relTime(ev.at)}` : "Add test questions"} />
      </div>
      <Card>
        <CardHeader title="How it is built" />
        <CardBody>
          <KeyValue rows={[
            ["Splitting", `${kb.processing.splitOn === "structure" ? "On headings and paragraphs" : "Fixed size"}, ${kb.processing.chunkTokens} tokens, ${kb.processing.overlap} overlap`],
            ["Personal data", kb.processing.maskPii ? "Masked before embedding" : "Not masked"], ["Embedding", `${kb.embedding.model}, ${kb.embedding.dimension} dimensions`],
            ["Index", <span key="i">{kb.index.collection} on {connName ?? "a removed connection"}, {kb.index.metric}</span>], ["Owner", kb.owner],
          ]} />
        </CardBody>
      </Card>
    </div>
  );
}

function Sources({ kb, role }: { kb: KnowledgeBase; role: ReturnType<typeof useRole> }) {
  const s = useMlops()!;
  const [adding, setAdding] = useState(false);
  const [conn, setConn] = useState(""); const [path, setPath] = useState("kb/"); const [inc, setInc] = useState("*.md, *.pdf"); const [err, setErr] = useState("");
  const [rm, setRm] = useState<string | null>(null);
  const buckets = s.connections.filter((c) => INTEGRATIONS.find((i) => i.id === c.integrationId)?.family === "object-store");
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><GuardButton action="pipeline.publish" env={kb.env} role={role} onClick={() => setAdding(!adding)}>Add a bucket source</GuardButton></div>
      {adding && (
        <Card><CardBody className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Connection"><Select value={conn} onChange={(e) => setConn(e.target.value)}><option value="">Choose</option>{buckets.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.env})</option>)}</Select></Field>
            <Field label="Path prefix"><Input value={path} onChange={(e) => setPath(e.target.value)} /></Field>
            <Field label="Include"><Input value={inc} onChange={(e) => setInc(e.target.value)} /></Field>
          </div>
          {err && <Notice tone="bad">{err}</Notice>}
          <div className="flex gap-2"><Button variant="primary" onClick={async () => { const r = await mlops.addKnowledgeSource(kb.id, { name: "", connectionId: conn, path, include: inc }); if (!r.ok) setErr(r.error); else { setAdding(false); setErr(""); toast("Source added. Sync to read it."); } }}>Add source</Button><Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button></div>
        </CardBody></Card>
      )}
      <Card>
        {kb.sources.length === 0 ? <EmptyState icon={BookOpen} title="No sources" description="Add a bucket, or create a new RAG index from uploaded files." /> : (
          <Table>
            <Thead><tr><Th>Source</Th><Th>Where</Th><Th>Documents</Th><Th>State</Th><Th>Last sync</Th><Th><span className="sr-only">Actions</span></Th></tr></Thead>
            <tbody>{kb.sources.map((x) => {
              const c = s.connections.find((y) => y.id === x.connectionId);
              return (
                <Tr key={x.id}>
                  <Td className="font-medium">{x.name}{x.error && <div className="text-xs font-normal text-status-down mt-0.5 max-w-xs">{x.error}</div>}</Td>
                  <Td className="text-text-secondary">{x.kind === "upload" ? "Uploaded to the platform" : `${c?.name ?? "removed connection"} ${x.path}`}{x.include && <div className="text-xs text-text-tertiary">{x.include}</div>}</Td>
                  <Td className="tabular-nums">{x.documents}</Td><Td><SourceBadge s={x.status} /></Td>
                  <Td className="text-text-secondary">{x.lastSyncAt ? relTime(x.lastSyncAt) : "never"}</Td>
                  <Td className="text-right"><Button variant="ghost" aria-label={`Remove ${x.name}`} onClick={() => setRm(x.id)}><Trash2 size={14} /></Button></Td>
                </Tr>
              );
            })}</tbody>
          </Table>
        )}
      </Card>
      <Confirm open={!!rm} onClose={() => setRm(null)} danger title="Remove source" confirmLabel="Remove source" body={<p>Its passages are removed from the index. The files themselves are not touched.</p>}
        onConfirm={async () => { const r = await mlops.removeKnowledgeSource(kb.id, rm!); r.ok ? toast("Source removed") : toast(r.error, "error"); }} />
    </div>
  );
}

function Ingestion({ kb }: { kb: KnowledgeBase }) {
  return (
    <Card>
      {kb.runs.length === 0 ? <EmptyState icon={RefreshCw} title="Nothing has run yet" description="Syncs and re-indexes appear here with what changed and why anything was skipped." /> : (
        <Table>
          <Thead><tr><Th>Started</Th><Th>Trigger</Th><Th>State</Th><Th>Added</Th><Th>Updated</Th><Th>Removed</Th><Th>Skipped</Th><Th>Failed</Th><Th>Tokens</Th></tr></Thead>
          <tbody>{kb.runs.map((r) => (
            <Tr key={r.id}>
              <Td>{fmtDate(r.startedAt)}<div className="text-xs text-text-tertiary">{r.durationSec ? `${r.durationSec}s` : "running"}</div>{r.notes.map((n, i) => <div key={i} className="text-xs text-text-secondary mt-1 max-w-sm">{n}</div>)}</Td>
              <Td className="text-text-secondary">{r.trigger.replace("-", " ")}</Td><Td><RunBadge s={r.state} /></Td>
              {[r.added, r.updated, r.removed, r.skipped, r.failed].map((n, i) => <Td key={i} className="tabular-nums">{n}</Td>)}
              <Td className="tabular-nums">{compact(r.tokens)}</Td>
            </Tr>
          ))}</tbody>
        </Table>
      )}
    </Card>
  );
}

function Playground({ kb }: { kb: KnowledgeBase }) {
  const [q, setQ] = useState("");
  const [topK, setTopK] = useState(kb.access.topK);
  const [min, setMin] = useState(kb.access.minScore);
  const [src, setSrc] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const live = useMlopsStatus().mode === "live";
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const names = useMemo(() => (live ? kb.sources.map((x) => x.name) : Array.from(new Set(kb.chunks.map((c) => c.source)))), [kb.chunks, kb.sources, live]);
  const run = async () => {
    setBusy(true); setErr("");
    const r = await mlops.searchKnowledge(kb.id, { query: q, topK, minScore: min, source: src || undefined });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setHits(r.hits);
  };
  const empty = live ? kb.stats.chunks === 0 : kb.chunks.length === 0;
  return (
    <div className="space-y-4">
      {!live && <Notice tone="info" title="Sample search">Scores here come from keyword overlap over the sample passages so you can see how thresholds and filters behave. A live RAG index ranks by vector similarity from its index.</Notice>}
      {err && <Notice tone="bad">{err}</Notice>}
      <Card><CardBody className="space-y-4">
        <form onSubmit={(e) => { e.preventDefault(); run(); }} className="flex gap-2">
          <Input aria-label="Question" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask the way a user would, for example: how do I reset my password?" />
          <Button variant="primary" type="submit" disabled={!q.trim() || busy}><SearchIcon size={14} /> {busy ? "Searching" : "Search"}</Button>
        </form>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Passages"><Input type="number" value={topK} onChange={(e) => setTopK(Number(e.target.value))} /></Field>
          <Field label="Minimum score"><Input type="number" step="0.05" value={min} onChange={(e) => setMin(Number(e.target.value))} /></Field>
          <Field label="Only this document"><Select value={src} onChange={(e) => setSrc(e.target.value)}><option value="">All documents</option>{names.map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field>
        </div>
      </CardBody></Card>
      {empty && <Notice tone="warn">Nothing is indexed yet. Sync a source first.</Notice>}
      {hits && (hits.length === 0
        ? <Card><EmptyState icon={SearchIcon} title="No passage passed the threshold" description="An assistant using this RAG index would answer that it does not know, instead of guessing. Lower the minimum score to see weaker matches." /></Card>
        : <div className="space-y-3">{hits.map((h, i) => (
            <Card key={h.chunk.id}><CardBody>
              <div className="flex items-center justify-between gap-3 text-[13px]"><div className="font-medium">{i + 1}. {h.chunk.source}{h.chunk.page ? `, page ${h.chunk.page}` : ""}{h.chunk.heading ? <span className="text-text-tertiary font-normal"> · {h.chunk.heading}</span> : null}</div><Badge tone={h.score >= 0.6 ? "healthy" : h.score >= 0.4 ? "info" : "neutral"}>score {h.score.toFixed(2)}</Badge></div>
              <p className="text-sm text-text-secondary mt-2 leading-relaxed">{h.chunk.text}</p>
              <div className="text-xs text-text-tertiary mt-2">Indexed {relTime(h.chunk.updatedAt)}</div>
            </CardBody></Card>))}</div>)}
    </div>
  );
}

function Evaluation({ kb, role }: { kb: KnowledgeBase; role: ReturnType<typeof useRole> }) {
  const [question, setQuestion] = useState(""); const [expected, setExpected] = useState("none"); const [err, setErr] = useState("");
  const live = useMlopsStatus().mode === "live";
  const names = useMemo(() => Array.from(new Set(live ? kb.sources.map((x) => x.name) : kb.chunks.map((c) => c.source))), [live, kb.chunks, kb.sources]);
  const last = kb.evalRuns[0], prev = kb.evalRuns[1];
  const delta = (a: number, b?: number) => (b === undefined ? null : a - b === 0 ? null : <span className={a - b > 0 ? "text-status-healthy" : "text-status-down"}> {a - b > 0 ? "+" : ""}{Math.round((a - b) * 100)} pts</span>);
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-text-secondary max-w-2xl">A test set is a list of questions with the document that should answer each one. Run it after any change to sources, splitting or the embedding model. Questions marked "no answer" check that the RAG index stays quiet about things it does not contain.</p>
        <GuardButton action="pipeline.run" env={kb.env} role={role} variant="primary" onClick={async () => { const r = await mlops.runKnowledgeEvaluation(kb.id); r.ok ? toast("Evaluation finished") : toast(r.error, "error"); }}><Play size={14} /> Run evaluation</GuardButton>
      </div>
      {last && (
        <div className="grid grid-cols-3 gap-3">
          <Kpi label="Recall at 5" value={<>{pct(last.recallAt5)}{delta(last.recallAt5, prev?.recallAt5)}</>} sub="The right document is in the top 5" />
          <Kpi label="Mean reciprocal rank" value={<>{last.mrr.toFixed(2)}{delta(last.mrr, prev?.mrr)}</>} sub="Closer to 1 means ranked first" />
          <Kpi label="Correct silence" value={pct(last.noAnswerAccuracy)} sub="Unanswerable questions returned nothing" />
        </div>
      )}
      {last && last.failures.length > 0 && (
        <Card><CardHeader title={`${last.failures.length} question${last.failures.length > 1 ? "s" : ""} missed`} subtitle={`From the run ${relTime(last.at)} by ${last.by}`} />
          <Table><Thead><tr><Th>Question</Th><Th>Expected</Th><Th>Got</Th></tr></Thead><tbody>{last.failures.map((f, i) => <Tr key={i}><Td>{f.question}</Td><Td className="text-text-secondary">{f.expected}</Td><Td className="text-text-secondary">{f.got}</Td></Tr>)}</tbody></Table></Card>
      )}
      <Card>
        <CardHeader title="Test questions" subtitle={`${kb.evalQuestions.length} in the set`} />
        {kb.evalQuestions.length > 0 && <Table><Thead><tr><Th>Question</Th><Th>Should be answered by</Th></tr></Thead><tbody>{kb.evalQuestions.map((x) => <Tr key={x.id}><Td>{x.question}</Td><Td className="text-text-secondary">{x.expectedSource === "none" ? "No answer" : x.expectedSource}</Td></Tr>)}</tbody></Table>}
        <CardBody className="border-t border-border space-y-3">
          <div className="grid sm:grid-cols-[1fr_220px_auto] gap-3 items-end">
            <Field label="New question"><Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Can I carry leave into next year?" /></Field>
            <Field label="Answered by"><Select value={expected} onChange={(e) => setExpected(e.target.value)}><option value="none">No answer exists</option>{names.map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field>
            <GuardButton action="pipeline.edit" env={kb.env} role={role} onClick={async () => { const r = await mlops.addEvalQuestion(kb.id, question, expected); if (!r.ok) setErr(r.error); else { setQuestion(""); setErr(""); } }}>Add</GuardButton>
          </div>
          {err && <Notice tone="bad">{err}</Notice>}
        </CardBody>
      </Card>
      {kb.evalRuns.length > 1 && (
        <Card><CardHeader title="History" /><Table><Thead><tr><Th>Run</Th><Th>Recall at 5</Th><Th>MRR</Th><Th>Correct silence</Th><Th>Missed</Th></tr></Thead><tbody>{kb.evalRuns.map((r) => <Tr key={r.id}><Td>{fmtDate(r.at)}<div className="text-xs text-text-tertiary">{r.by}</div></Td><Td className="tabular-nums">{pct(r.recallAt5)}</Td><Td className="tabular-nums">{r.mrr.toFixed(2)}</Td><Td className="tabular-nums">{pct(r.noAnswerAccuracy)}</Td><Td className="tabular-nums">{r.failures.length}</Td></Tr>)}</tbody></Table></Card>
      )}
    </div>
  );
}

function Access({ kb, role }: { kb: KnowledgeBase; role: ReturnType<typeof useRole> }) {
  const [a, setA] = useState(kb.access); const [sch, setSch] = useState(kb.schedule); const [err, setErr] = useState("");
  const [lang, setLang] = useState("curl");
  const snips = usageSnippets({ ...kb, access: a });
  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <Card><CardHeader title="Who can query it" subtitle="Changing access needs the admin role" /><CardBody className="space-y-4">
        <div><div className="text-[13px] font-medium mb-1.5">Projects</div>
          <div className="flex flex-wrap gap-2">{Array.from(new Set([...PROJECTS, ...a.projects])).map((p) => { const on = a.projects.includes(p); return <button key={p} aria-pressed={on} onClick={() => setA({ ...a, projects: on ? a.projects.filter((x) => x !== p) : [...a.projects, p] })} className={`h-8 px-3 rounded-md border text-[13px] ${on ? "border-accent-600 bg-accent-500/10" : "border-border-strong text-text-secondary hover:bg-surface-muted"}`}>{p}</button>; })}</div></div>
        <Toggle checked={a.aclAware} onChange={(v) => setA({ ...a, aclAware: v })} label="Respect source permissions" description="Results are limited to documents the caller could read in the source system." />
        <Toggle checked={a.requireCitations} onChange={(v) => setA({ ...a, requireCitations: v })} label="Require citations" description="Every returned passage carries its source and page." />
        <div className="grid grid-cols-3 gap-3">
          <Field label="Passages"><Input type="number" value={a.topK} onChange={(e) => setA({ ...a, topK: Number(e.target.value) })} /></Field>
          <Field label="Minimum score"><Input type="number" step="0.05" value={a.minScore} onChange={(e) => setA({ ...a, minScore: Number(e.target.value) })} /></Field>
          <Field label="Refresh"><Select value={sch} onChange={(e) => setSch(e.target.value as typeof sch)}>{(Object.keys(SCHEDULE_LABEL) as (keyof typeof SCHEDULE_LABEL)[]).map((k) => <option key={k} value={k}>{SCHEDULE_LABEL[k]}</option>)}</Select></Field>
        </div>
        {!a.aclAware && <Notice tone="warn">Anyone in an allowed project can retrieve any passage, including from documents they could not open themselves.</Notice>}
        {err && <Notice tone="bad">{err}</Notice>}
        <GuardButton action="settings.edit" role={role} variant="primary" onClick={async () => { const r = await mlops.updateKnowledgeAccess(kb.id, a, sch); r.ok ? (setErr(""), toast("Access updated")) : setErr(r.error); }}>Save changes</GuardButton>
      </CardBody></Card>
      <div className="space-y-3">
        <div className="text-[13px] font-semibold">Query it from an application</div>
        <p className="text-sm text-text-secondary">Calls go through the tok∑ner gateway, so the key's policy, budget and usage accounting apply. Retrieved passages are counted as retrieval tokens.</p>
        <div className="flex gap-1">{snips.map((x) => <button key={x.id} onClick={() => setLang(x.id)} aria-pressed={lang === x.id} className={`h-7 px-2.5 rounded text-xs ${lang === x.id ? "bg-emph text-on-emph" : "text-text-secondary hover:bg-surface-muted"}`}>{x.label}</button>)}</div>
        <CodeBlock code={(snips.find((x) => x.id === lang) ?? snips[0]).code} language={lang} title={`Search ${kb.id}`} />
        <p className="text-xs text-text-tertiary">Generated from the settings on this page. The endpoint host is an example.</p>
      </div>
    </div>
  );
}

function Flow({ kb, role, go }: { kb: KnowledgeBase; role: ReturnType<typeof useRole>; go: (t: Tab) => void }) {
  const [p, setP] = useState(kb.processing); const [emb, setEmb] = useState(kb.embedding); const [acc, setAcc] = useState(kb.access); const [sched, setSched] = useState(kb.schedule);
  const [err, setErr] = useState(""); const [reindex, setReindex] = useState(false);
  const procChanged = JSON.stringify(p) !== JSON.stringify(kb.processing) || JSON.stringify(emb) !== JSON.stringify(kb.embedding);
  const accChanged = JSON.stringify(acc) !== JSON.stringify(kb.access) || sched !== kb.schedule;
  const draft = { sources: kb.sources, processing: p, embedding: emb, index: kb.index, access: acc, schedule: sched };
  const overlay = useMemo(() => kbOverlay(kb), [kb]);
  const saveAccess = async () => { const r = await mlops.updateKnowledgeAccess(kb.id, acc, sched); r.ok ? (setErr(""), toast("Access saved")) : setErr(r.error); };
  const reset = () => { setP(kb.processing); setEmb(kb.embedding); setAcc(kb.access); setSched(kb.schedule); setErr(""); };
  return (
    <div className="space-y-4">
      <KbBuilder name={kb.id} env={kb.env} draft={draft} indexLocked overlay={overlay}
        onProcessing={(x) => setP((v) => ({ ...v, ...x }))} onEmbedding={(x) => setEmb((v) => ({ ...v, ...x }))} onIndex={() => {}} onAccess={(x) => setAcc((v) => ({ ...v, ...x }))} onSchedule={setSched}
        toolbar={<><span className="text-xs text-text-tertiary">Node colour shows the result of the last sync.</span><button className="ml-auto text-xs text-text-secondary underline hover:text-text-primary" onClick={() => go("settings")}>Edit in the form</button></>}
        renderSource={(sid) => { const src = kb.sources.find((x) => x.id === sid); return src ? (
          <div className="space-y-3 text-[13px]">
            <KeyValue rows={[["Name", src.name], ["Type", src.kind === "upload" ? "Uploaded files" : "Object storage"], ["Documents", String(src.documents)], ...(src.path ? [["Path", src.path] as [string, string]] : [])]} />
            {src.error && <Notice tone="bad">{src.error}</Notice>}
            <button className="underline text-text-secondary hover:text-text-primary" onClick={() => go("sources")}>Add, remove or re-sync sources</button>
          </div>) : <p className="text-text-secondary">No source yet.</p>; }} />
      {err && <Notice tone="bad">{err}</Notice>}
      {(procChanged || accChanged) && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3">
          <span className="text-[13px] text-text-secondary mr-auto">{procChanged ? "Splitting or embedding changed. Saving re-indexes every document." : "Access settings changed."}</span>
          <Button variant="secondary" onClick={reset}>Discard</Button>
          {accChanged && <GuardButton action="settings.edit" role={role} onClick={saveAccess}>Save access</GuardButton>}
          {procChanged && <GuardButton action="pipeline.publish" env={kb.env} role={role} variant="primary" onClick={() => setReindex(true)}>Save and re-index</GuardButton>}
        </div>)}
      <Confirm open={reindex} onClose={() => setReindex(false)} title="Re-index everything" confirmLabel="Re-index" body={<p>Every document is split and embedded again. The previous index keeps answering until the new one is complete. This uses embedding tokens and is billed to the owning project.</p>}
        onConfirm={async () => { const r = await mlops.updateKnowledgeProcessing(kb.id, p, emb); r.ok ? toast("Re-index started") : setErr(r.error); }} />
    </div>
  );
}

function Settings({ kb, role, connName, go }: { kb: KnowledgeBase; role: ReturnType<typeof useRole>; connName?: string; go: (t: Tab) => void }) {
  const router = useRouter();
  const [p, setP] = useState(kb.processing); const [emb, setEmb] = useState(kb.embedding); const [err, setErr] = useState(""); const [reindex, setReindex] = useState(false); const [del, setDel] = useState(false);
  const changed = JSON.stringify(p) !== JSON.stringify(kb.processing) || JSON.stringify(emb) !== JSON.stringify(kb.embedding);
  return (
    <div className="space-y-5 max-w-3xl">
      <Card><CardHeader title="Splitting and embedding" subtitle="Changing these re-embeds every document" action={<button className="text-xs text-text-secondary underline hover:text-text-primary" onClick={() => go("flow")}>Open in builder</button>} /><CardBody className="space-y-4">
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Split"><Select value={p.splitOn} onChange={(e) => setP({ ...p, splitOn: e.target.value as typeof p.splitOn })}><option value="structure">On structure</option><option value="fixed">Fixed size</option></Select></Field>
          <Field label="Chunk size (tokens)"><Input type="number" value={p.chunkTokens} onChange={(e) => setP({ ...p, chunkTokens: Number(e.target.value) })} /></Field>
          <Field label="Overlap"><Input type="number" value={p.overlap} onChange={(e) => setP({ ...p, overlap: Number(e.target.value) })} /></Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Embedding model"><Input value={emb.model} onChange={(e) => setEmb({ ...emb, model: e.target.value })} /></Field>
          <Field label="Dimension" hint="The collection is rebuilt with this size."><Input type="number" value={emb.dimension} onChange={(e) => setEmb({ ...emb, dimension: Number(e.target.value) })} /></Field>
        </div>
        <Toggle checked={p.maskPii} onChange={(v) => setP({ ...p, maskPii: v })} label="Mask personal data before embedding" />
        {err && <Notice tone="bad">{err}</Notice>}
        <GuardButton action="pipeline.publish" env={kb.env} role={role} variant="primary" extraDisabled={changed ? undefined : "Nothing has changed"} onClick={() => setReindex(true)}>Save and re-index</GuardButton>
      </CardBody></Card>
      <Card><CardHeader title="Index" /><CardBody><KeyValue rows={[["Vector store", connName ?? "A removed connection"], ["Collection", kb.index.collection], ["Distance", kb.index.metric]]} /><p className="text-xs text-text-tertiary mt-3">The collection and vector store cannot change after creation. Create a new RAG index to move.</p></CardBody></Card>
      <Card><CardHeader title="Delete" /><CardBody className="space-y-3">
        <p className="text-sm text-text-secondary">Drops the collection from the vector store. Source files are not touched. Pipelines that still use the collection block the delete.</p>
        <GuardButton action="settings.edit" role={role} onClick={() => setDel(true)}><Trash2 size={14} /> Delete RAG index</GuardButton>
      </CardBody></Card>
      <Confirm open={reindex} onClose={() => setReindex(false)} title="Re-index everything" confirmLabel="Re-index" body={<p>Every document is split and embedded again. The previous index keeps answering until the new one is complete. This uses embedding tokens and is billed to the owning project.</p>}
        onConfirm={async () => { const r = await mlops.updateKnowledgeProcessing(kb.id, p, emb); r.ok ? toast("Re-index started") : setErr(r.error); }} />
      <Confirm open={del} onClose={() => setDel(false)} danger title={`Delete ${kb.name}`} phrase={kb.id} confirmLabel="Delete" body={<p>This cannot be undone. Assistants that query it will receive an error.</p>}
        onConfirm={async () => { const r = await mlops.deleteKnowledgeBase(kb.id); if (r.ok) { toast("RAG index deleted"); router.push("/mlops/rag"); } else toast(r.error, "error"); }} />
    </div>
  );
}
