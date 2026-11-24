"use client";

import Link from "next/link";
import { STAGE_ACTION, STAGE_LABEL, stageMoves, type Stage } from "@/lib/mlops/stage";
import { useParams } from "next/navigation";
import { ArrowLeft, ShieldAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { DemoTag, Drawer, EnvBadge, GuardButton, HealthBadge, KeyValue, Notice, relTime, fmtDate, fmtMb, useRole } from "@/components/mlops/ui";
import { mlops, useMlops } from "@/lib/mlops/store";
import { evaluateGate, gateOf } from "@/lib/mlops/qualityGate";
import { toast } from "@/lib/mlops/toast";
import { useRefinery } from "@/lib/refinery/store";
import type { ModelVersion } from "@/lib/mlops/types";

const STAGE_TONE = { production: "healthy", staging: "info", none: "neutral", archived: "neutral" } as const;
const APPROVAL_TONE = { approved: "healthy", pending: "degraded", rejected: "down", "not-required": "neutral" } as const;

export default function ModelDetail() {
  const { id } = useParams<{ id: string }>();
  const s = useMlops()!;
  const role = useRole();
  const m = s.models.find((x) => x.id === id);
  const [ver, setVer] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [dsId, setDsId] = useState("");
  const refineryData = useRefinery();
  if (!m) return <Card><EmptyState icon={ShieldAlert} title="Model not found" description="It may have been removed, or the link is wrong." action={<Link href="/mlops/models"><Button>Back to models</Button></Link>} /></Card>;
  const v: ModelVersion | undefined = m.versions.find((x) => x.version === ver);
  const deps = s.deployments.filter((d) => d.modelId === m.id);
  const metricKeys = Array.from(new Set(m.versions.flatMap((x) => Object.keys(x.metrics))));
  const gate = v ? evaluateGate(gateOf(s.settings), v.trainingData) : null;
  const blocked = gate?.status === "fail" || gate?.status === "missing";
  const link = async (id: string) => { const r = await mlops.linkTrainingData(m.id, v!.version, id); r.ok ? (toast(id ? "Training data recorded" : "Training data cleared"), setDsId("")) : toast(r.error, "error"); };
  const move = async (to: Stage) => { const r = await mlops.stageVersion(m.id, v!.version, to); r.ok ? toast(`Version ${v!.version} is now ${STAGE_LABEL[to].toLowerCase()}`) : toast(r.error, "error"); };
  const decide = async (d: "approved" | "rejected", override = false) => { const r = await mlops.decideVersion(m.id, v!.version, d, note, override); r.ok ? (toast(`Version ${v!.version} ${d}`), setNote("")) : toast(r.error, "error"); };

  return (
    <div className="space-y-5">
      <Link href="/mlops/models" className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary"><ArrowLeft size={13} /> Models</Link>
      <PageHeader title={m.name} description={`${m.description} Owner: ${m.owner}.`} action={<div className="flex items-center gap-3"><DemoTag /><Link href={`/mlops/deployments/new?model=${m.id}`}><Button variant="primary">Deploy this model</Button></Link></div>} />

      <Card>
        <CardHeader title="Versions" subtitle="Select a version for provenance, checksums and approvals" />
        <Table>
          <Thead><tr><Th>Version</Th><Th>Stage</Th><Th>Framework</Th><Th>Format</Th><Th>Size</Th>{metricKeys.slice(0, 2).map((k) => <Th key={k}>{k}</Th>)}<Th>Approval</Th><Th>Created</Th></tr></Thead>
          <tbody>
            {m.versions.map((x) => (
              <Tr key={x.version}>
                <Td><button onClick={() => setVer(x.version)} className="font-medium hover:underline">v{x.version}</button></Td>
                <Td><Badge tone={STAGE_TONE[x.stage]}>{x.stage}</Badge></Td>
                <Td className="text-text-secondary">{x.framework}</Td><Td className="text-text-secondary">{x.format}</Td><Td className="tabular-nums text-text-secondary">{fmtMb(x.sizeMb)}</Td>
                {metricKeys.slice(0, 2).map((k) => <Td key={k} className="tabular-nums">{x.metrics[k] ?? "n/a"}</Td>)}
                <Td><Badge tone={APPROVAL_TONE[x.approval.state]}>{x.approval.state}</Badge></Td>
                <Td className="text-text-secondary">{relTime(x.createdAt)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader title="Deployment history" subtitle="Where versions of this model are serving" />
        {deps.length === 0 ? <CardBody><p className="text-sm text-text-secondary">No deployments yet. Deploy a version from a pipeline.</p></CardBody> : (
          <Table>
            <Thead><tr><Th>Deployment</Th><Th>Environment</Th><Th>Serving</Th><Th>Previous</Th><Th>Health</Th><Th>Updated</Th></tr></Thead>
            <tbody>{deps.map((d) => (
              <Tr key={d.id}><Td><Link href={`/mlops/deployments/${d.id}`} className="font-medium hover:underline">{d.name}</Link></Td><Td><EnvBadge env={d.env} /></Td><Td>v{d.version}{d.traffic.canary ? ` + v${d.traffic.canaryVersion} at ${d.traffic.canary}%` : ""}</Td><Td className="text-text-secondary">{d.previousVersion ? `v${d.previousVersion}` : "none"}</Td><Td><HealthBadge h={d.health} /></Td><Td className="text-text-secondary">{relTime(d.updatedAt)}</Td></Tr>
            ))}</tbody>
          </Table>
        )}
      </Card>

      <Drawer open={!!v} onClose={() => { setVer(null); setNote(""); }} title={v ? `${m.name} v${v.version}` : ""} subtitle={v && <span className="inline-flex gap-2"><Badge tone={STAGE_TONE[v.stage]}>{v.stage}</Badge><Badge tone={APPROVAL_TONE[v.approval.state]}>{v.approval.state}</Badge></span>}>
        {v && (
          <div className="space-y-5 text-[13px]">
            {v.notes && <p className="text-text-secondary">{v.notes}</p>}
            {!v.provenance.signed && <Notice tone="warn" title="Unsigned artifact">No image or artifact signature is recorded for this version. Policy can block unsigned versions from production.</Notice>}
            {/review required/i.test(v.license) && <Notice tone="warn" title="License review">{v.license}. Approval needs a recorded legal review.</Notice>}
            <section><h3 className="font-semibold mb-2">Artifact</h3>
              <KeyValue rows={[["Framework", v.framework], ["Format", v.format], ["Size", fmtMb(v.sizeMb)], ["Checksum", <span className="font-code text-xs break-all">{v.checksum}</span>], ["License", v.license], ["Created", `${fmtDate(v.createdAt)} by ${v.createdBy}`]]} /></section>
            {(v.source || v.scan) && (
              <section><h3 className="font-semibold mb-2">Source and content scan</h3>
                {v.source && <p className="text-text-secondary mb-2">{v.source}</p>}
                {v.scan && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2"><Badge tone={v.scan.verdict === "clean" ? "healthy" : v.scan.verdict === "warnings" ? "degraded" : "down"}>{v.scan.verdict}</Badge><span className="text-text-secondary">{v.scan.summary}</span></div>
                    <ul className="list-disc pl-5 space-y-1 text-text-secondary">{v.scan.findings.map((f, i) => <li key={i}>{f.message}</li>)}</ul>
                  </div>
                )}
              </section>
            )}
            <section><h3 className="font-semibold mb-2">Provenance</h3>
              <KeyValue rows={[["Repository", v.provenance.repo], ["Commit", <span className="font-code text-xs">{v.provenance.git}</span>], ["Training run", v.provenance.trainingRun], ["Dataset hash", <span className="font-code text-xs">{v.provenance.datasetHash}</span>], ["Builder", v.provenance.builder], ["Signature", v.provenance.signed ? <span className="inline-flex items-center gap-1 text-status-healthy"><ShieldCheck size={14} /> Signed</span> : "Not signed"]]} /></section>
            <section><h3 className="font-semibold mb-2">Training data</h3>
              {v.trainingData ? (
                <div className="space-y-3">
                  <KeyValue rows={[
                    ["Dataset", <Link href={`/refinery/datasets/${v.trainingData.datasetId}`} className="font-medium hover:underline">{v.trainingData.datasetName}</Link>],
                    ["Version", `v${v.trainingData.datasetVersion}`],
                    ["Measured", `${fmtDate(v.trainingData.measuredAt)}${v.trainingData.reportId ? `, report ${v.trainingData.reportId}` : ""}`],
                  ]} />
                  {gate && gate.status !== "off" && (
                    <ul className="divide-y divide-border rounded-md border border-border">
                      {gate.checks.map((c) => (
                        <li key={c.label} className="flex items-center justify-between gap-3 px-3 py-2"><span><span className="font-medium">{c.label}</span><span className="block text-text-secondary">{c.detail}</span></span><Badge tone={c.ok ? "healthy" : "down"}>{c.ok ? "meets" : "below"}</Badge></li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : <p className="text-text-secondary">No training dataset is recorded for this version. Record one below so the data quality gate can check it.</p>}
              {gate && gate.status === "off" && <p className="mt-2 text-text-secondary">The data quality gate is off for this organisation.</p>}
              {v.approval.state === "pending" && (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <label className="block min-w-[14rem] flex-1"><span className="block mb-1.5 font-medium">{v.trainingData ? "Change training dataset" : "Training dataset"}</span>
                    <input list="training-datasets" value={dsId} onChange={(e) => setDsId(e.target.value)} placeholder="Dataset ID" className="w-full rounded-md border border-border-strong px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500/40" />
                    <datalist id="training-datasets">{refineryData.datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</datalist>
                  </label>
                  <GuardButton action="model.register" role={role} extraDisabled={dsId.trim() ? undefined : "Enter a dataset ID"} onClick={() => link(dsId)}>Record</GuardButton>
                  {v.trainingData && <GuardButton action="model.register" role={role} onClick={() => link("")}>Clear</GuardButton>}
                  <p className="basis-full text-xs text-text-secondary">The platform reads the quality score from the dataset's profile. A score cannot be typed in.</p>
                </div>
              )}
            </section>
            <section><h3 className="font-semibold mb-2">Registry stage</h3>
              <p className="text-text-secondary mb-3">A version is released by moving it through stages. It must be approved first, and production is reached only from staging. Promoting a version to production returns the current production version to staging.</p>
              <div className="flex flex-wrap gap-2">
                {stageMoves(m.versions, v.version).map((mv) => (
                  <GuardButton key={mv.to} action={STAGE_ACTION[mv.to]} role={role} variant={mv.to === "production" ? "primary" : undefined} extraDisabled={mv.allowed ? undefined : mv.why} onClick={() => move(mv.to)}>{mv.to === "none" ? "Take out of release" : mv.to === "archived" ? "Archive" : `Move to ${STAGE_LABEL[mv.to].toLowerCase()}`}</GuardButton>
                ))}
              </div>
              {stageMoves(m.versions, v.version).filter((x) => !x.allowed).slice(0, 1).map((x) => <p key={x.to} className="mt-2 text-xs text-text-secondary">{x.why}</p>)}
            </section>
            <section><h3 className="font-semibold mb-2">Evaluation</h3>
              <KeyValue rows={Object.entries(v.metrics).map(([k, x]) => [k, <span className="tabular-nums">{x}</span>])} /></section>
            <section><h3 className="font-semibold mb-2">Approval</h3>
              {v.approval.state === "pending" ? (
                <div className="space-y-3">
                  <p className="text-text-secondary">{v.approval.note}</p>
                  {blocked && gate && <Notice tone="bad" title="Blocked by the data quality gate">{gate.summary} Approving needs the admin role and a written reason, which is recorded in the audit log.</Notice>}
                  <label className="block"><span className="block mb-1.5 font-medium">Decision note</span><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded-md border border-border-strong px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500/40" placeholder="Reason, evidence, or review reference" /></label>
                  <div className="flex flex-wrap gap-2">
                    {blocked ? (
                      <GuardButton action="model.approve" role={role} variant="primary" extraDisabled={role === "admin" ? (note.trim().length < 10 ? "Write a reason of at least 10 characters to approve past the gate" : undefined) : "Only an admin can approve past the data quality gate"} onClick={() => decide("approved", true)}>Approve with override</GuardButton>
                    ) : <GuardButton action="model.approve" role={role} variant="primary" onClick={() => decide("approved")}>Approve</GuardButton>}
                    <GuardButton action="model.approve" role={role} onClick={() => decide("rejected")}>Reject</GuardButton>
                  </div>
                </div>
              ) : <KeyValue rows={[["State", v.approval.state], ["Decided by", v.approval.by ?? "n/a"], ["Decided", v.approval.at ? relTime(v.approval.at) : "n/a"], ["Note", v.approval.note ?? "none"]]} />}
            </section>
          </div>
        )}
      </Drawer>
    </div>
  );
}
