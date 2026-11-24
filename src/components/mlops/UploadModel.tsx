"use client";

import { FileUp, ShieldCheck, TriangleAlert, XCircle } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { Drawer, Notice } from "@/components/mlops/ui";
import { MAX_UPLOAD_MB, previewUploadChecks, type UploadInput } from "@/lib/mlops/store";
import { MODEL_FORMATS, type ModelFileFormat } from "@/lib/mlops/types";

const HASH_LIMIT_MB = 256;

function formatFromName(n: string): ModelFileFormat | null {
  const l = n.toLowerCase();
  if (l.endsWith(".safetensors")) return "safetensors";
  if (l.endsWith(".gguf")) return "gguf";
  if (l.endsWith(".onnx")) return "onnx";
  if (/\.(pt|pth|bin|ckpt|pkl|pickle)$/.test(l)) return "pytorch";
  return null;
}

async function sha256(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const d = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parseMetrics(text: string): { metrics: Record<string, number>; error?: string } {
  const metrics: Record<string, number> = {};
  for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const m = /^([a-z0-9_.@-]+)\s*[=:]\s*(-?\d+(\.\d+)?)$/i.exec(line);
    if (!m) return { metrics, error: `"${line}" is not name = number` };
    metrics[m[1]] = Number(m[2]);
  }
  return { metrics };
}

/**
 * Upload form shared by the organization registry and the platform library. Only the file's name, size and checksum are read in the browser.
 * The server receives the bytes, reads them (a PyTorch checkpoint is scanned for code execution) and only then accepts the version.
 */
export function UploadModelDrawer({ open, onClose, onSubmit, title, subtitle, submitLabel, nameLocked }: {
  open: boolean; onClose: () => void; onSubmit: (i: UploadInput) => { ok: boolean; error?: string } | Promise<{ ok: boolean; error?: string }>; title: string; subtitle: string; submitLabel: string; nameLocked?: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [hash, setHash] = useState<string | undefined>();
  const [hashing, setHashing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(nameLocked ?? "");
  const [task, setTask] = useState("");
  const [description, setDescription] = useState("");
  const [framework, setFramework] = useState("");
  const [format, setFormat] = useState<ModelFileFormat>("safetensors");
  const [license, setLicense] = useState("Apache-2.0");
  const [notes, setNotes] = useState("");
  const [metricText, setMetricText] = useState("");
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const pick = useRef<HTMLInputElement>(null);

  const mt = parseMetrics(metricText);
  const sizeMb = file ? Math.max(0.01, Math.round((file.size / 1_048_576) * 100) / 100) : 0;
  const input: UploadInput = { name, description, task, framework, format, fileName: file?.name ?? "", sizeMb, sha256: hash, license, notes, metrics: mt.metrics, file: file ?? undefined };
  const pre = previewUploadChecks(input);

  async function choose(f: File | null) {
    setFile(f); setHash(undefined); setError("");
    if (!f) return;
    const fmt = formatFromName(f.name);
    if (fmt) setFormat(fmt);
    if (!name && !nameLocked) setName(f.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 63));
    if (f.size <= HASH_LIMIT_MB * 1_048_576) {
      setHashing(true);
      try { setHash(await sha256(f)); } catch { /* the server computes it */ } finally { setHashing(false); }
    }
  }

  async function submit() {
    if (mt.error) { setError(mt.error); return; }
    setBusy(true);
    let r: { ok: boolean; error?: string };
    try { r = await onSubmit(input); } finally { setBusy(false); }
    if (!r.ok) setError(r.error ?? "Could not upload");
    else { onClose(); setFile(null); setHash(undefined); setName(nameLocked ?? ""); setTask(""); setDescription(""); setNotes(""); setMetricText(""); setError(""); }
  }

  return (
    <Drawer open={open} onClose={onClose} title={title} subtitle={subtitle}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" className="disabled:opacity-50 disabled:cursor-not-allowed" disabled={pre.blocked || hashing || busy || !!mt.error} onClick={submit}>{busy ? "Uploading..." : submitLabel}</Button></>}>
      <div className="space-y-5">
        <div>
          <input ref={pick} type="file" className="sr-only" aria-label="Model file" onChange={(e) => choose(e.target.files?.[0] ?? null)} />
          <button type="button" onClick={() => pick.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); void choose(e.dataTransfer.files?.[0] ?? null); }}
            className={`w-full rounded-lg border border-dashed px-4 py-6 text-center transition-colors ${drag ? "border-accent-600 bg-accent-500/5" : "border-border-strong hover:bg-surface-subtle"}`}>
            <FileUp size={20} className="mx-auto text-text-tertiary" />
            {file ? (
              <div className="mt-2 text-sm"><span className="font-medium text-text-primary">{file.name}</span><span className="text-text-tertiary"> · {sizeMb.toLocaleString()} MB</span></div>
            ) : (
              <div className="mt-2 text-sm text-text-secondary">Drop a model file here or <span className="underline">browse</span></div>
            )}
            <div className="text-xs text-text-tertiary mt-1">safetensors, GGUF, ONNX or a PyTorch checkpoint. Up to {MAX_UPLOAD_MB / 1000} GB.</div>
          </button>
          {file && (
            <div className="text-xs text-text-tertiary mt-1.5 font-code break-all">
              {hashing ? "Computing SHA-256 in your browser..." : hash ? `sha256:${hash}` : file.size > HASH_LIMIT_MB * 1_048_576 ? "Checksum is computed by the server for files this large." : ""}
            </div>
          )}
        </div>

        <div className="rounded-md border border-border bg-surface-subtle px-4 py-3">
          <div className="flex items-center gap-2 text-[13px] font-medium text-text-primary"><ShieldCheck size={15} /> Checks before upload</div>
          <ul className="mt-2 space-y-1.5 text-[13px]">
            {pre.findings.length === 0 && <li className="text-text-secondary">Name, format and size checks pass.</li>}
            {pre.findings.map((f, i) => (
              <li key={i} className="flex items-start gap-2">
                {f.level === "block" ? <XCircle size={14} className="mt-0.5 text-status-down shrink-0" /> : <TriangleAlert size={14} className="mt-0.5 text-status-degraded shrink-0" />}
                <span className="text-text-secondary">{f.message}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-text-tertiary mt-2.5">These are previews. The server repeats them, reads the file itself and records its own verdict before the version appears.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Model name" hint={nameLocked ? undefined : "Lowercase letters, numbers and dashes. An existing name adds a new version."}>
            <Input value={name} disabled={!!nameLocked} onChange={(e) => setName(e.target.value)} placeholder="support-classifier" />
          </Field>
          <Field label="Format">
            <Select value={format} onChange={(e) => setFormat(e.target.value as ModelFileFormat)}>
              {MODEL_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </Select>
          </Field>
          <Field label="Task"><Input value={task} onChange={(e) => setTask(e.target.value)} placeholder="Text classification" /></Field>
          <Field label="Framework"><Input value={framework} onChange={(e) => setFramework(e.target.value)} placeholder="PyTorch 2.3" /></Field>
        </div>
        <Field label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What it does and what it was trained on" /></Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="License" hint="Restrictive or unknown licenses need a recorded legal review before production approval."><Input value={license} onChange={(e) => setLicense(e.target.value)} /></Field>
          <Field label="Evaluation metrics" hint="One per line, as name = value.">
            <textarea value={metricText} onChange={(e) => setMetricText(e.target.value)} rows={3} placeholder={"f1_macro = 0.93\np95_ms = 120"} className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm font-code focus:outline-none focus:ring-2 focus:ring-accent-500/40" />
          </Field>
        </div>
        <Field label="Notes"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything reviewers should know" /></Field>

        {(error || mt.error) && <Notice tone="bad">{error || mt.error}</Notice>}
      </div>
    </Drawer>
  );
}
