"use client";

import clsx from "clsx";
import { useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Field, Input, Select } from "@/components/ui/Form";
import { Modal, Notice, Tabs } from "@/components/mlops/ui";
import { fmtBytes, fmtInt } from "@/components/refinery/bits";
import { DataTable } from "@/components/refinery/DataTable";
import { CONNECTOR_BY_ID } from "@/lib/refinery/connectors";
import { parseTabular, profileRows, type ParsedFile } from "@/lib/refinery/profile";
import type { Row } from "@/lib/refinery/types";
import { addDataset as addDatasetLocal, refinery, useRefinery, useRefineryStatus } from "@/lib/refinery/store";
import { toast } from "@/lib/mlops/toast";
import type { Dataset, FileFormat } from "@/lib/refinery/types";

type Tab = "upload" | "documents" | "connection" | "query";
const READ_BYTES = 5 * 1024 * 1024;
const PREVIEW_ROWS = 400;
const slug = (n: string) => n.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60) || "dataset";
const NAME_OK = /^[a-z][a-z0-9_]{1,59}$/;


const TEXT_EXT = new Set(["txt", "md", "markdown", "html", "htm", "eml", "log", "rtf"]);
const DOC_EXT = new Set([...TEXT_EXT, "pdf", "doc", "docx", "ppt", "pptx", "png", "jpg", "jpeg", "tif", "tiff", "mp3", "wav", "m4a"]);
const MIME: Record<string, string> = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", doc: "application/msword", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", ppt: "application/vnd.ms-powerpoint", html: "text/html", htm: "text/html", txt: "text/plain", md: "text/markdown", markdown: "text/markdown", eml: "message/rfc822", log: "text/plain", rtf: "application/rtf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", tif: "image/tiff", tiff: "image/tiff", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4" };
const extOf = (n: string) => (n.toLowerCase().split(".").pop() ?? "");
const stripHtml = (t: string) => t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
const DOC_COLUMNS: { name: string; type: "string" | "integer" | "decimal"; role: "feature" | "identifier" }[] = [
  { name: "doc_id", type: "string", role: "identifier" }, { name: "file_name", type: "string", role: "feature" }, { name: "mime", type: "string", role: "feature" },
  { name: "page", type: "integer", role: "feature" }, { name: "language", type: "string", role: "feature" }, { name: "ocr_confidence", type: "decimal", role: "feature" }, { name: "text", type: "string", role: "feature" },
];

/** Text-like files are read here. Other types are listed and extracted on a runner by the document-processing module. */
async function readDocument(f: File, n: number): Promise<{ rows: Row[]; local: boolean }> {
  const ext = extOf(f.name);
  const base = { doc_id: `doc-${String(n + 1).padStart(4, "0")}`, file_name: f.name, mime: MIME[ext] ?? "application/octet-stream" };
  if (!TEXT_EXT.has(ext)) return { rows: [{ ...base, page: 1, language: null, ocr_confidence: null, text: null }], local: false };
  let text = await f.slice(0, 2_000_000).text();
  if (ext === "html" || ext === "htm") text = stripHtml(text);
  const pages = text.split(/\f/).flatMap((p) => { const out: string[] = []; for (let i = 0; i < p.length; i += 3000) out.push(p.slice(i, i + 3000)); return out.length ? out : [""]; });
  return { rows: pages.map((t, i) => ({ ...base, page: i + 1, language: null, ocr_confidence: null, text: t })), local: true };
}

/** A small file the user can try the upload with when they have none to hand. */
function sampleFile(): File {
  const names = ["Ada Lovelace", "Alan Turing", "Grace Hopper", "Linus T", "  Margaret Hamilton ", "Dennis Ritchie"];
  const lines = ["order_id,customer,email,country,amount,status,ordered_on"];
  for (let i = 0; i < 240; i++) {
    const n = names[i % names.length];
    lines.push(`${5000 + (i % 220)},"${n}",${n.trim().toLowerCase().replace(/[^a-z]+/g, ".")}@example.com,${["US", "us", "DE", "Bahrain", "UK"][i % 5]},${i % 37 === 0 ? "n/a" : (12 + ((i * 7.31) % 480)).toFixed(2)},${["paid", "Paid", "refunded", "PENDING"][i % 4]},2026-${String(1 + (i % 9)).padStart(2, "0")}-${String(1 + (i % 27)).padStart(2, "0")}`);
  }
  return new File([lines.join("\n")], "orders_sample.csv", { type: "text/csv" });
}

export function AddDatasetModal({ open, onClose, initialTab = "upload", onCreated }: { open: boolean; onClose: () => void; initialTab?: Tab; onCreated?: (d: Dataset) => void }) {
  const { connections, datasets } = useRefinery();
  const isLive = useRefineryStatus().mode === "live";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [estRows, setEstRows] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  // connection and query tabs
  const [conn, setConn] = useState("");
  const [loc, setLoc] = useState("");
  const [fmt, setFmt] = useState<FileFormat>("parquet");
  const [sql, setSql] = useState("");
  const [docs, setDocs] = useState<{ name: string; size: number; ext: string; local: boolean; pages: number }[]>([]);
  const [docRows, setDocRows] = useState<Row[]>([]);
  const docInput = useRef<HTMLInputElement>(null);

  const reset = () => { setFile(null); setParsed(null); setErr(null); setName(""); setDesc(""); setConn(""); setLoc(""); setSql(""); setBusy(false); setDocs([]); setDocRows([]); };
  const close = () => { reset(); onClose(); };

  const take = async (f: File) => {
    setErr(null); setParsed(null); setFile(f); setName(slug(f.name));
    const ext = f.name.toLowerCase().split(".").pop() ?? "";
    if (ext === "parquet" || ext === "xlsx" || ext === "xls") { setErr(`${ext === "parquet" ? "Parquet" : "Excel"} files are read by an engine on a runner pool${isLive ? "" : ", which this sample workspace does not have"}. Use CSV, TSV, JSON or JSON Lines here.`); return; }
    setBusy(true);
    try {
      const head = await f.slice(0, READ_BYTES).text();
      // A slice can end in the middle of a line. Drop the cut line unless the whole file was read.
      const whole = f.size <= READ_BYTES;
      const text = whole ? head : head.slice(0, Math.max(head.lastIndexOf("\n"), 0));
      const p = parseTabular(f.name, text);
      setParsed({ ...p, truncated: !whole || p.truncated });
      const bytesPerRow = text.length / Math.max(1, p.readRows);
      setEstRows(whole ? p.readRows : Math.round(f.size / Math.max(1, bytesPerRow)));
    } catch (e) { setErr(e instanceof Error ? e.message : "This file could not be read."); } finally { setBusy(false); }
  };

  const takeDocs = async (list: FileList | File[]) => {
    setErr(null); setBusy(true);
    try {
      const files = Array.from(list).filter((f) => DOC_EXT.has(extOf(f.name)));
      const skipped = Array.from(list).length - files.length;
      if (!files.length) { setErr("None of these file types can be read as documents. Use PDF, Word, PowerPoint, HTML, text, Markdown, email, images or audio."); return; }
      const rows: Row[] = [...docRows]; const meta = [...docs];
      for (const f of files) { const r = await readDocument(f, meta.length); rows.push(...r.rows); meta.push({ name: f.name, size: f.size, ext: extOf(f.name), local: r.local, pages: r.rows.length }); }
      setDocRows(rows); setDocs(meta);
      if (!name) setName("uploaded_documents");
      if (skipped) setErr(`${skipped} file${skipped > 1 ? "s were" : " was"} skipped because the type is not supported.`);
    } catch (e) { setErr(e instanceof Error ? e.message : "These files could not be read."); } finally { setBusy(false); }
  };
  const createDocs = () => {
    if (!docs.length || !name || nameErr) return;
    const types: Record<string, number> = {}; docs.forEach((d) => { types[d.ext] = (types[d.ext] ?? 0) + 1; });
    const total = docs.reduce((a, d) => a + d.size, 0);
    const d = addDatasetLocal({ name, description: desc || `${docs.length} uploaded document${docs.length > 1 ? "s" : ""}.`, source: { kind: "documents", folder: "uploaded files", files: docs.length, types }, format: "documents", totalRows: docRows.length, sizeBytes: total, sample: docRows.slice(0, PREVIEW_ROWS), columns: DOC_COLUMNS, profile: profileRows(DOC_COLUMNS, docRows, docRows.length) });
    toast(sameName ? `${name} updated to version ${d.version}` : "Documents dataset created");
    onCreated?.(d); close();
  };

  const nameErr = name && !NAME_OK.test(name) ? "Start with a letter. Use lower case letters, digits and underscores." : datasets.some((d) => d.name === name) && tab !== "upload" ? "A dataset with this name exists." : null;
  const sameName = datasets.find((d) => d.name === name);

  const createUpload = async () => {
    if (!file || !parsed || !name || nameErr || busy) return;
    const total = estRows || parsed.readRows;
    setBusy(true);
    const made = await refinery.uploadDataset(file, name, desc || `Uploaded from ${file.name}.`, {
      name, description: desc || `Uploaded from ${file.name}.`, source: { kind: "upload", fileName: file.name }, format: parsed.format, totalRows: total, sizeBytes: file.size,
      sample: parsed.rows.slice(0, PREVIEW_ROWS), columns: parsed.columns, profile: profileRows(parsed.columns, parsed.rows, total),
    });
    setBusy(false);
    if (!made.ok) { setErr(made.error); return; }
    const d = made.dataset;
    toast(sameName ? `${name} updated to version ${d.version}` : "Dataset created");
    onCreated?.(d); close();
  };

  const okConns = connections.filter((c) => c.state !== "failed");
  const sel = connections.find((c) => c.id === conn);
  const spec = sel ? CONNECTOR_BY_ID.get(sel.connector) : null;
  const dbLike = spec ? ["Databases", "Warehouses and lakehouses"].includes(spec.group) : false;
  const sqlOk = /^\s*(select|with)\b/i.test(sql) && !/;\s*\S/.test(sql.trim());
  const defn = tab === "connection" ? { name, source: { kind: "connection", connection: sel?.name, location: loc }, format: dbLike ? "table" : fmt } : { name, source: { kind: "query", connection: sel?.name, sql: sql.trim() } };

  return (
    <Modal open={open} onClose={close} wide title="Add a dataset"
      footer={<><Button variant="secondary" onClick={close}>Cancel</Button>{tab === "upload" && <Button variant="primary" disabled={!parsed || !name || !!nameErr || busy} onClick={createUpload}>{sameName ? `Add as version ${sameName.version + 1}` : "Create dataset"}</Button>}{tab === "documents" && <Button variant="primary" disabled={!docs.length || !name || !!nameErr} onClick={createDocs}>{sameName ? `Add as version ${sameName.version + 1}` : "Create dataset"}</Button>}</>}>
      <Tabs<Tab> label="Where the data is" value={tab} onChange={(t) => { setTab(t); setErr(null); }} tabs={[{ id: "upload", label: "Upload from this computer" }, { id: "documents", label: "Documents" }, { id: "connection", label: "From a connection" }, { id: "query", label: "From a query" }]} />
      <div className="pt-5 space-y-4">
        {tab === "upload" && (
          <>
            <input ref={input} type="file" accept=".csv,.tsv,.json,.jsonl,.ndjson,.txt,.parquet,.xlsx" className="sr-only" aria-label="Choose a file" onChange={(e) => { const f = e.target.files?.[0]; if (f) take(f); e.target.value = ""; }} />
            {!file ? (
              <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) take(f); }}
                className={clsx("rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors", over ? "border-accent-600 bg-accent-50" : "border-border-strong")}>
                <Upload size={22} className="mx-auto text-text-tertiary" />
                <p className="text-sm font-medium mt-3">Drop a file here, or <button className="text-accent-700 underline" onClick={() => input.current?.click()}>choose one</button></p>
                <p className="text-xs text-text-tertiary mt-1.5">CSV, TSV, JSON and JSON Lines are read here. Parquet and Excel are read on a runner.</p>
                <button className="text-xs text-accent-700 underline mt-3" onClick={() => take(sampleFile())}>No file to hand? Try a small sample CSV</button>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-md border border-border px-3.5 py-3">
                <FileText size={18} className="text-text-tertiary shrink-0" />
                <div className="min-w-0 flex-1"><div className="text-[13px] font-medium truncate">{file.name}</div><div className="text-xs text-text-tertiary">{fmtBytes(file.size)}{parsed ? `, ${parsed.format.toUpperCase()}${parsed.delimiter && parsed.delimiter !== "," && parsed.delimiter !== "\t" ? ` with "${parsed.delimiter}" as delimiter` : ""}` : ""}</div></div>
                <button aria-label="Remove file" onClick={() => { setFile(null); setParsed(null); setErr(null); }} className="h-8 w-8 grid place-items-center rounded-md text-text-tertiary hover:bg-surface-muted"><X size={15} /></button>
              </div>
            )}
            {busy && <p className="text-sm text-text-secondary">Reading the file...</p>}
            {err && <Notice tone="bad" title="This file cannot be added here">{err}</Notice>}
            {parsed && (
              <>
                {parsed.truncated && <Notice tone="info">The first {fmtInt(parsed.readRows)} rows were read for the preview and profile. The whole file holds about {fmtInt(estRows)} rows (estimated from its size).</Notice>}
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Dataset name" hint={nameErr ?? (sameName ? `Adds a new version of ${name}. Runs that pinned version ${sameName.version} keep using it.` : "Lower case letters, digits and underscores.")}><Input value={name} onChange={(e) => setName(e.target.value.toLowerCase())} aria-invalid={!!nameErr} /></Field>
                  <Field label="Description (optional)"><Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What is in this file" /></Field>
                </div>
                <div>
                  <h3 className="text-[13px] font-medium mb-2">What we found: {parsed.columns.length} columns</h3>
                  <div className="flex flex-wrap gap-1.5">{parsed.columns.map((c) => <span key={c.name} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs"><span className="font-medium">{c.name}</span><span className="text-text-tertiary">{c.type}</span>{c.role === "identifier" && <Badge tone="info">id</Badge>}</span>)}</div>
                </div>
                <div className="rounded-md border border-border overflow-hidden"><DataTable columns={parsed.columns.map((c) => ({ name: c.name, type: c.type }))} rows={parsed.rows.slice(0, PREVIEW_ROWS)} limit={10} /></div>
              </>
            )}
            <p className="text-xs text-text-tertiary">In this sample workspace the file is read in your browser and never leaves it. In a connected workspace it is uploaded in parts straight to object storage with a short-lived address, so a large file does not pass through the API and an interrupted upload resumes.</p>
          </>
        )}

        {isLive && tab !== "upload" && <Notice tone="info" title="This needs a runner pool">{tab === "documents" ? "Documents are read and split by an engine on a runner pool." : "Reading a table, a file in a connected system or a query result needs an engine that can sign in to that system."} The platform's own engine reads files you upload. Add a runner pool under Runners to use connections here.</Notice>}
        {!isLive && tab === "documents" && (
          <>
            <input ref={docInput} type="file" multiple className="sr-only" aria-label="Choose documents" onChange={(e) => { if (e.target.files?.length) takeDocs(e.target.files); e.target.value = ""; }} />
            <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files?.length) takeDocs(e.dataTransfer.files); }}
              className={clsx("rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors", over ? "border-accent-600 bg-accent-50" : "border-border-strong")}>
              <FileText size={22} className="mx-auto text-text-tertiary" />
              <p className="text-sm font-medium mt-3">Drop documents here, or <button className="text-accent-700 underline" onClick={() => docInput.current?.click()}>choose files</button></p>
              <p className="text-xs text-text-tertiary mt-1.5">PDF, Word, PowerPoint, HTML, text, Markdown, email, scanned images and audio. You can add several at once.</p>
            </div>
            {busy && <p className="text-sm text-text-secondary">Reading the files...</p>}
            {err && <Notice tone="bad" title="Some files were not added">{err}</Notice>}
            {docs.length > 0 && (
              <>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Dataset name" hint={nameErr ?? (sameName ? `Adds a new version of ${name}.` : "Lower case letters, digits and underscores.")}><Input value={name} onChange={(e) => setName(e.target.value.toLowerCase())} aria-invalid={!!nameErr} /></Field>
                  <Field label="Description (optional)"><Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What these documents are" /></Field>
                </div>
                <ul className="rounded-md border border-border divide-y divide-border max-h-52 overflow-y-auto">
                  {docs.map((d, i) => (
                    <li key={i} className="flex items-center gap-3 px-3.5 py-2.5">
                      <FileText size={16} className="text-text-tertiary shrink-0" />
                      <div className="min-w-0 flex-1"><div className="text-[13px] font-medium truncate">{d.name}</div><div className="text-xs text-text-tertiary">{fmtBytes(d.size)}, {d.local ? `${d.pages} page${d.pages > 1 ? "s" : ""} read here` : "extracted on the runner"}</div></div>
                      <Badge tone={d.local ? "healthy" : "info"}>{d.ext}</Badge>
                    </li>
                  ))}
                </ul>
                <div>
                  <h3 className="text-[13px] font-medium mb-2">The dataset has one row per page</h3>
                  <div className="flex flex-wrap gap-1.5">{DOC_COLUMNS.map((c) => <span key={c.name} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs"><span className="font-medium">{c.name}</span><span className="text-text-tertiary">{c.type}</span></span>)}</div>
                </div>
              </>
            )}
            <p className="text-xs text-text-tertiary">Text, Markdown, HTML and email are read in your browser in this sample workspace. PDF, Word, PowerPoint, images and audio are extracted on the runner by the document-processing module, with character recognition for scans, so their text appears after the first run. Nothing leaves your browser here.</p>
          </>
        )}

        {!isLive && (tab === "connection" || tab === "query") && (
          <>
            <Notice tone="info" title="Reading from a system needs the platform">The sample workspace cannot open connections. Fill this in to see the dataset definition that would be saved, or upload a file instead.</Notice>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Connection"><Select value={conn} onChange={(e) => { setConn(e.target.value); setLoc(""); }}><option value="">Choose a connection</option>{okConns.filter((c) => tab === "connection" ? !["cdc-postgres", "cdc-mysql"].includes(c.connector) : ["Databases", "Warehouses and lakehouses"].includes(CONNECTOR_BY_ID.get(c.connector)?.group ?? "")).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
              <Field label="Dataset name" hint={nameErr ?? undefined}><Input value={name} onChange={(e) => setName(e.target.value.toLowerCase())} placeholder="support_tickets_raw" /></Field>
            </div>
            {tab === "connection" ? (
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label={dbLike ? "Table" : spec?.group === "Streaming" ? "Topic" : "Path or pattern"} hint={dbLike ? "Schema and table, for example public.customers." : spec?.group === "Streaming" ? "The topic to read." : "A folder or a pattern such as raw/support/*.parquet."}><Input value={loc} onChange={(e) => setLoc(e.target.value)} placeholder={dbLike ? "public.customers" : spec?.group === "Streaming" ? "support.tickets.raw" : "raw/support/*.parquet"} /></Field>
                {!dbLike && spec?.group !== "Streaming" && <Field label="Format"><Select value={fmt} onChange={(e) => setFmt(e.target.value as FileFormat)}>{["parquet", "csv", "tsv", "jsonl", "json"].map((f) => <option key={f}>{f}</option>)}</Select></Field>}
              </div>
            ) : (
              <Field label="Read-only query" hint={sql && !sqlOk ? "Only a single SELECT or WITH query is allowed. Refinery never writes through a dataset query." : "Runs on the connection's pool. The result is saved as a dataset snapshot."}><textarea value={sql} onChange={(e) => setSql(e.target.value)} rows={5} spellCheck={false} className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-[12px] font-code focus:outline-none focus:ring-2 focus:ring-accent-500/40" placeholder={"SELECT id, email, created_at\nFROM public.customers\nWHERE created_at > now() - interval '30 days'"} /></Field>
            )}
            {sel && name && (tab === "connection" ? loc : sqlOk) && <pre className="rounded-md bg-surface-subtle border border-border p-3 text-[11px] font-code overflow-x-auto">{JSON.stringify(defn, null, 2)}</pre>}
          </>
        )}
      </div>
    </Modal>
  );
}
