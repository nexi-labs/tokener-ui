"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import { Check, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { Modal, Notice } from "@/components/mlops/ui";
import { useAuth } from "@/lib/auth/AuthProvider";
import { FORMATS, download, generateReports } from "@/lib/refinery/report";
import type { ReportFile, ReportFormat, ReportModel } from "@/lib/refinery/report";
import { refinery, snapshot, useRefinery } from "@/lib/refinery/store";
import type { RunRecord } from "@/lib/refinery/types";

const KB = (b: number) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

/** Asks which formats to produce, who the report is prepared by, then builds and downloads them. Works in the sample workspace and in a signed-in one. */
export function ReportDialog({ run, open, onClose }: { run: RunRecord; open: boolean; onClose: () => void }) {
  const { recipes, datasets } = useRefinery();
  const { user, status } = useAuth();
  const sample = status !== "session";
  const [formats, setFormats] = useState<ReportFormat[]>(["pdf", "features"]);
  const [by, setBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ files: ReportFile[]; model: ReportModel } | null>(null);
  useEffect(() => { if (open) { setBy(user?.displayName ?? (sample ? "Sample workspace user" : run.startedBy)); setDone(null); setError(null); } }, [open, user, sample, run.startedBy]);
  const recipe = recipes.find((r) => r.id === run.recipeId);
  const dataset = datasets.find((d) => d.id === recipe?.inputDatasetId) ?? datasets.find((d) => d.name === run.datasetName);
  const toggle = (f: ReportFormat) => setFormats((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));

  async function go() {
    setBusy(true); setError(null); setDone(null);
    try {
      // A signed-in workspace lists datasets without their sample rows, which the before and after figures are measured on.
      if (dataset && dataset.sample.length === 0) { const r = await refinery.openDataset(dataset.id); if (!r.ok) throw new Error(r.error); }
      const fresh = dataset ? snapshot().datasets.find((d) => d.id === dataset.id) ?? dataset : undefined;
      if (fresh && fresh.sample.length === 0) throw new Error("The input dataset has no sample rows to measure. Re-profile it and try again.");
      const org = user?.organizations?.[0]?.name ?? (sample ? "ACME (sample workspace)" : "Your organisation");
      const out = await generateReports({ run, recipe, dataset: fresh, organisation: org, preparedBy: by.trim() || run.startedBy, generatedAt: new Date(), sampleWorkspace: sample }, formats);
      out.files.forEach(download); setDone(out);
    } catch (e) { setError(e instanceof Error ? e.message : "The report could not be generated."); } finally { setBusy(false); }
  }

  const card = (f: (typeof FORMATS)[number]) => { const on = formats.includes(f.id); return (
    <label key={f.id} className={clsx("flex gap-3 rounded-lg border p-3.5 cursor-pointer transition-colors", on ? "border-[#02F5A1] bg-[#02F5A1]/[0.07]" : "border-border hover:bg-surface-muted")}>
      <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(f.id)} />
      <span className={clsx("mt-0.5 h-4 w-4 shrink-0 rounded border grid place-items-center", on ? "bg-[#07191E] border-[#07191E] text-[#02F5A1]" : "border-border-strong")} aria-hidden>{on && <Check size={11} strokeWidth={3} />}</span>
      <span className="min-w-0"><span className="flex items-center gap-2 text-[13px] font-semibold"><FileText size={14} className="text-text-tertiary" />{f.label}<span className="text-[11px] font-normal text-text-tertiary">.{f.ext}</span></span><span className="block text-xs text-text-secondary mt-1 leading-relaxed">{f.blurb}</span></span>
    </label>
  ); };

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title="Generate report" wide footer={<><Button onClick={onClose} disabled={busy}>{done ? "Close" : "Cancel"}</Button>{!done && <Button variant="primary" onClick={go} disabled={busy || formats.length === 0 || !dataset}>{busy ? "Building report" : `Generate ${formats.length} file${formats.length === 1 ? "" : "s"}`}</Button>}{done && <Button variant="primary" onClick={() => done.files.forEach(download)}><Download size={14} /> Download again</Button>}</>}>
      <div className="space-y-5">
        <p className="text-sm text-text-secondary">A data preparation report for run <span className="font-mono text-[12.5px] text-text-primary">{run.id}</span>: the strategy, every operator, quality before and after, the lineage of the pipeline with its key metrics, and a dictionary of features for the people building models.</p>
        {!dataset && <Notice tone="warn" title="The input dataset is no longer available">A report needs the dataset the run read. Restore or add it, then try again.</Notice>}
        <fieldset>
          <legend className="text-[13px] font-medium mb-2">Format</legend>
          <div className="grid sm:grid-cols-2 gap-2.5">{FORMATS.filter((f) => !f.id.startsWith("evidence")).map(card)}</div>
        </fieldset>
        <fieldset>
          <legend className="text-[13px] font-medium">Governance evidence</legend>
          <p className="text-xs text-text-tertiary mt-0.5 mb-2">For audits and AI management reviews. It records what was measured and done, lists what only the system owner can answer, and does not state that anything complies.</p>
          <div className="grid sm:grid-cols-2 gap-2.5">{FORMATS.filter((f) => f.id.startsWith("evidence")).map(card)}</div>
        </fieldset>
        <Field label="Prepared by" hint="Printed on the cover. The person who started the run, the pipeline editor and the dataset owner are added from the records."><Input value={by} onChange={(e) => setBy(e.target.value)} maxLength={80} /></Field>
        {sample && <p className="text-xs text-text-tertiary">This is the sample workspace. The report says so on its cover and in its measurement basis, because the run was simulated.</p>}
        {error && <Notice tone="bad" title="The report could not be built">{error}</Notice>}
        {done && (
          <div className="rounded-lg border border-border">
            <div className="px-4 py-3 border-b border-border text-[13px] font-semibold">Downloaded</div>
            <ul className="divide-y divide-border">{done.files.map((f) => <li key={f.name} className="flex items-center gap-3 px-4 py-2.5 text-[13px]"><FileText size={14} className="text-text-tertiary" /><span className="font-mono text-[12.5px] flex-1 truncate">{f.name}</span><span className="text-xs text-text-tertiary tabular-nums">{KB(f.blob.size)}</span><button className="text-xs underline underline-offset-2" onClick={() => download(f)}>Download</button></li>)}</ul>
            <div className="px-4 py-3 border-t border-border text-xs text-text-secondary">Document ID {done.model.documentId}. Quality score {done.model.quality.dimensions[4].before} to {done.model.quality.dimensions[4].after}. ML readiness {done.model.readiness.score} of 100.</div>
          </div>
        )}
      </div>
    </Modal>
  );
}
