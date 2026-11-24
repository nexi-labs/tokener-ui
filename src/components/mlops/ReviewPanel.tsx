"use client";

import clsx from "clsx";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import type { Issue } from "@/components/studio/types";
import { generateManifests, generatePlan } from "@/lib/mlops/manifests";
import { OP_BY_KIND } from "@/lib/mlops/operators";
import { effectiveConfig, exportSpec, specDigest, toYaml, type PipelineSpec } from "@/lib/mlops/spec";
import type { Connection } from "@/lib/mlops/types";
import { mlops, useMlopsStatus } from "@/lib/mlops/store";
import type { ValidationReport } from "@/lib/mlops/validation";
import { Button } from "@/components/ui/Button";
import { CodeBlock, Notice, Tabs } from "./ui";

type Tab = "issues" | "plan" | "manifests" | "effective" | "spec";

export function ReviewPanel({ spec, issues, connections, onSelectNode, initial = "issues" }: { spec: PipelineSpec; issues: Issue[]; connections: Connection[]; onSelectNode?: (id: string) => void; initial?: Tab }) {
  const [tab, setTab] = useState<Tab>(initial);
  const plan = useMemo(() => generatePlan(spec, connections), [spec, connections]);
  const manifests = useMemo(() => generateManifests(spec, connections).filter((m) => m.nodeId), [spec, connections]);
  const errs = issues.filter((i) => i.level === "error").length, warns = issues.filter((i) => i.level === "warn").length;
  const yaml = useMemo(() => toYaml(exportSpec(spec)), [spec]);
  const digest = useMemo(() => specDigest(spec), [spec]);
  const live = useMlopsStatus().mode === "live";
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkErr, setCheckErr] = useState("");
  const specKey = digest;
  useEffect(() => { setReport(null); setCheckErr(""); }, [specKey]);
  const check = async () => {
    setChecking(true); setCheckErr("");
    const r = await mlops.validatePipeline(spec);
    setChecking(false);
    if (r.ok) setReport(r.report); else setCheckErr(r.error);
  };

  return (
    <div className="space-y-3">
      <Tabs value={tab} onChange={setTab} label="Review sections" tabs={[{ id: "issues", label: "Validation", count: errs + warns }, { id: "plan", label: "Plan", count: plan.length }, { id: "manifests", label: "Manifests", count: manifests.length }, { id: "effective", label: "Effective config" }, { id: "spec", label: "Spec" }]} />

      {tab === "issues" && (
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-[13px]">
            {errs === 0 ? <span className="inline-flex items-center gap-1.5 text-status-healthy"><CheckCircle2 size={15} /> No blocking errors</span> : <span className="inline-flex items-center gap-1.5 text-status-down"><XCircle size={15} /> {errs} error{errs > 1 ? "s" : ""}</span>}
            {warns > 0 && <span className="inline-flex items-center gap-1.5 text-[#9A5F05]"><AlertTriangle size={15} /> {warns} warning{warns > 1 ? "s" : ""}</span>}
          </div>
          <div className="rounded-md border border-border p-3 space-y-2.5" data-testid="server-check">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[13px] font-medium">{live ? "Check with the control plane" : "Check against organisation policy"}</div>
                <p className="text-xs text-text-secondary mt-0.5">Runs the same rules the server applies when you publish or run, plus this organisation's settings. Nothing is saved.</p>
              </div>
              <Button onClick={check} disabled={checking}>{checking ? "Checking" : report ? "Check again" : "Run the check"}</Button>
            </div>
            {checkErr && <Notice tone="bad" title="The check could not run">{checkErr}</Notice>}
            {report && (
              <div className="space-y-2 pt-1">
                <div className="flex flex-wrap gap-2">
                  <Badge tone={report.publishable ? "healthy" : "down"}>{report.publishable ? "Can be published" : "Cannot be published"}</Badge>
                  <Badge tone={report.runnable ? "healthy" : "down"}>{report.runnable ? "Can run" : "Cannot run yet"}</Badge>
                  <Badge tone="neutral">{report.issues.length} finding{report.issues.length === 1 ? "" : "s"}</Badge>
                </div>
                {report.policyViolations.length > 0 && <div><div className="text-xs font-medium text-text-primary mb-1">Organisation policy forbids</div><ul className="space-y-1">{report.policyViolations.map((v) => <li key={v} className="text-[13px] flex gap-2"><XCircle size={14} className="text-status-down mt-0.5 shrink-0" aria-hidden />{v}</li>)}</ul></div>}
                {report.runBlockers.length > 0 && <div><div className="text-xs font-medium text-text-primary mb-1">Would stop a run</div><ul className="space-y-1">{report.runBlockers.map((v) => <li key={v} className="text-[13px] flex gap-2"><AlertTriangle size={14} className="text-status-degraded mt-0.5 shrink-0" aria-hidden />{v}</li>)}</ul></div>}
                {report.policyViolations.length === 0 && report.runBlockers.length === 0 && <p className="text-[13px] text-text-secondary">Policy allows it and nothing would stop a run.</p>}
              </div>
            )}
          </div>
          <ul className="divide-y divide-border border border-border rounded-md">
            {issues.length === 0 && <li className="px-3 py-3 text-[13px] text-text-secondary">Everything the validator checks passes. Validation does not prove the target will accept the change. The plan step does a dry run.</li>}
            {[...issues].sort((a, b) => ({ error: 0, warn: 1, info: 2 }[a.level] - { error: 0, warn: 1, info: 2 }[b.level])).map((i, k) => (
              <li key={k}>
                <button disabled={!i.nodeId} onClick={() => i.nodeId && onSelectNode?.(i.nodeId)} className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left text-[13px] hover:bg-surface-subtle disabled:hover:bg-transparent">
                  {i.level === "error" ? <XCircle size={15} className="text-status-down mt-0.5 shrink-0" /> : i.level === "warn" ? <AlertTriangle size={15} className="text-status-degraded mt-0.5 shrink-0" /> : <Info size={15} className="text-status-info mt-0.5 shrink-0" />}
                  <span className="text-text-primary">{i.msg}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "plan" && (
        <div className="space-y-3">
          <Notice tone="info">The plan is what would happen, in order. Applying is a separate, confirmed step. Costs are estimates from list-price assumptions, not billed data.</Notice>
          <ol className="border border-border rounded-md divide-y divide-border">
            {plan.map((p, i) => (
              <li key={p.nodeId} className="px-3 py-2.5 text-[13px] flex items-start gap-3">
                <span className="h-5 w-5 rounded-full bg-surface-muted text-[11px] grid place-items-center tabular-nums shrink-0 mt-0.5">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-text-secondary">{p.action} on {p.target}</div>
                  {p.cost && <div className="text-xs text-text-tertiary mt-0.5">{p.cost}</div>}
                  <div className="text-[11px] text-text-tertiary font-code mt-0.5">adapter {p.adapter}{p.runnable ? "" : " (none, cannot run)"}</div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0"><Badge tone={p.risk === "high" ? "down" : p.risk === "medium" ? "degraded" : "neutral"}>{p.risk} risk</Badge>{p.confirm && <span className="text-[11px] text-text-tertiary">needs confirmation</span>}</div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {tab === "manifests" && (
        <div className="space-y-3">
          {manifests.length === 0 ? <p className="text-[13px] text-text-secondary">No manifests yet. Add a connected deploy or build operator.</p> : manifests.map((m) => (
            <div key={m.id}><CodeBlock code={m.content} language={m.language} title={m.title} maxHeight={280} /><p className="text-xs text-text-tertiary mt-1.5">{m.note}</p></div>
          ))}
        </div>
      )}

      {tab === "effective" && (
        <div className="space-y-4">
          {spec.nodes.map((n) => (
            <div key={n.id}>
              <div className="text-[13px] font-semibold mb-1.5">{n.name} <span className="font-normal text-text-tertiary">{OP_BY_KIND[n.operator]?.label}</span></div>
              <div className="border border-border rounded-md overflow-hidden"><table className="w-full text-xs"><tbody>{effectiveConfig(spec, n).map((r) => (
                <tr key={r.key} className="border-b border-border last:border-0"><td className="px-2.5 py-1.5 text-text-tertiary w-[34%]">{r.label}</td><td className="px-2.5 py-1.5 font-code break-all">{r.value || "empty"}</td><td className={clsx("px-2.5 py-1.5 text-right", r.source === "override" ? "text-[#2557B8]" : "text-text-tertiary")}>{r.source}</td></tr>
              ))}</tbody></table></div>
            </div>
          ))}
        </div>
      )}

      {tab === "spec" && (
        <div className="space-y-2">
          <div className="text-xs text-text-secondary">Canonical spec, redacted, canvas positions omitted. Digest <span className="font-code">{digest.slice(0, 26)}...</span></div>
          <CodeBlock code={yaml} language="yaml" title="pipeline.yaml" maxHeight={420} />
        </div>
      )}
    </div>
  );
}
