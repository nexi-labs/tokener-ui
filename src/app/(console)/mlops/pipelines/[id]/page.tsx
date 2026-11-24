"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Download, History, Pencil, Play, Trash2, Wand2, Workflow } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { FlowCanvas } from "@/components/mlops/FlowCanvas";
import { ReviewPanel } from "@/components/mlops/ReviewPanel";
import { CodeBlock, Confirm, DemoTag, Modal, EnvBadge, GuardButton, Notice, RunBadge, Tabs, fmtDate, fmtDuration, relTime, shortDigest, useRole } from "@/components/mlops/ui";
import { OP_BY_KIND } from "@/lib/mlops/operators";
import { mlops, useMlops } from "@/lib/mlops/store";
import { diffSpecs, validateSpec } from "@/lib/mlops/spec";
import { toast } from "@/lib/mlops/toast";
import { versionLabel } from "@/lib/mlops/types";

type Tab = "overview" | "versions" | "runs" | "review";

export default function PipelineDetail() {
  const { id } = useParams<{ id: string }>();
  const s = useMlops()!;
  const role = useRole();
  const router = useRouter();
  const p = s.pipelines.find((x) => x.id === id);
  const [tab, setTab] = useState<Tab>("overview");
  const [sel, setSel] = useState<{ type: "node" | "edge"; id: string } | null>(null);
  const [view, setView] = useState<number | "draft" | null>(null);
  const [discard, setDiscard] = useState(false);
  const [restore, setRestore] = useState<number | null>(null);
  const [del, setDel] = useState(false);
  const [exp, setExp] = useState<{ yaml: string; label: string } | null>(null);
  const doExport = async (version?: number) => { const r = await mlops.exportPipeline(p!.id, version); r.ok ? setExp({ yaml: r.yaml, label: r.label }) : toast(r.error, "error"); };
  const download = () => { if (!exp) return; const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([exp.yaml], { type: "application/yaml" })); a.download = `${p!.name}-${exp.label}.yaml`; a.click(); URL.revokeObjectURL(a.href); };

  const shown = useMemo(() => {
    if (!p) return undefined;
    if (view === "draft" && p.draft) return p.draft.spec;
    if (typeof view === "number") return p.versions.find((v) => v.version === view)?.spec;
    return p.draft?.spec ?? p.versions[0]?.spec;
  }, [p, view]);

  if (!p) return <Card><EmptyState icon={Workflow} title="Pipeline not found" description="It may have been removed, or the link is wrong." action={<Link href="/mlops/pipelines"><Button>Back to pipelines</Button></Link>} /></Card>;
  const runs = s.runs.filter((r) => r.pipelineId === p.id);
  const latest = p.versions[0];
  const selNode = sel?.type === "node" && shown ? shown.nodes.find((n) => n.id === sel.id) : undefined;
  const issues = shown ? validateSpec(shown, { connections: s.connections, agents: s.agents }) : [];

  return (
    <div className="space-y-5">
      <Link href="/mlops/pipelines" className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary"><ArrowLeft size={13} /> Pipelines</Link>
      <PageHeader title={p.name} description={p.description}
        action={<div className="flex flex-wrap gap-2 justify-end">
          <Button onClick={() => doExport(typeof view === "number" ? view : undefined)}><Download size={14} /> Export YAML</Button>
          <Link href={`/mlops/pipelines/${p.id}/wizard`}><Button><Wand2 size={14} /> Wizard</Button></Link>
          <Link href={`/mlops/pipelines/${p.id}/edit`}><Button><Pencil size={14} /> Builder</Button></Link>
          <GuardButton action="pipeline.publish" env={p.env} role={role} onClick={() => setDel(true)}><Trash2 size={14} /> Delete</GuardButton>
          <GuardButton action="pipeline.run" env={p.env} role={role} variant="primary" extraDisabled={!latest ? "Publish a version first" : undefined} onClick={() => router.push(`/mlops/pipelines/${p.id}/edit`)}><Play size={14} /> Run</GuardButton>
        </div>} />
      <div className="flex flex-wrap items-center gap-2 -mt-3"><EnvBadge env={p.env} />{latest && <Badge>v{latest.version}</Badge>}{p.demo && <DemoTag />}</div>

      {p.draft && (
        <Notice tone="info" title="You have an unpublished draft">Saved {relTime(p.draft.savedAt)}. Runs use published versions only.{" "}
          <button className="underline" onClick={() => setView(view === "draft" ? null : "draft")}>{view === "draft" ? "Show default" : "Preview draft"}</button> · <Link className="underline" href={`/mlops/pipelines/${p.id}/edit`}>Continue editing</Link> · <button className="underline" onClick={() => setDiscard(true)}>Discard</button></Notice>
      )}

      <Tabs value={tab} onChange={setTab} label="Pipeline sections" tabs={[{ id: "overview", label: "Overview" }, { id: "versions", label: "Versions", count: p.versions.length }, { id: "runs", label: "Runs", count: runs.length }, { id: "review", label: "Plan and manifests" }]} />

      {tab === "overview" && shown && (
        <div className="grid lg:grid-cols-[1fr_320px] gap-4">
          <div className="relative h-[460px] rounded-lg border border-border overflow-hidden"><FlowCanvas spec={shown} selection={sel} onSelect={setSel} readOnly animate label={`${p.name} pipeline, read only`} /></div>
          <Card><CardHeader title={selNode ? selNode.name : "Operators"} subtitle={selNode ? OP_BY_KIND[selNode.operator].label : `${shown.nodes.length} in this ${view === "draft" ? "draft" : typeof view === "number" ? `version ${view}` : "view"}`} />
            <div className="p-4 text-[13px] space-y-2">
              {selNode ? (<>
                <p className="text-text-secondary">{OP_BY_KIND[selNode.operator].desc}</p>
                <dl className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-1.5">{Object.entries(selNode.config).map(([k, v]) => (<div key={k} className="contents"><dt className="text-text-tertiary truncate">{k}</dt><dd className="font-code text-xs break-all">{String(v)}</dd></div>))}</dl>
                <p className="text-xs text-text-tertiary">Open the builder or wizard to change settings.</p></>)
                : <ul className="space-y-1.5">{shown.nodes.map((n) => <li key={n.id}><button className="text-left hover:underline" onClick={() => setSel({ type: "node", id: n.id })}>{n.name}</button> <span className="text-xs text-text-tertiary">{OP_BY_KIND[n.operator].label}</span></li>)}</ul>}
            </div></Card>
        </div>
      )}
      {tab === "overview" && !shown && <Card><EmptyState icon={Workflow} title="Empty pipeline" description="Open the wizard or builder to add operators." action={<Link href={`/mlops/pipelines/${p.id}/wizard`}><Button variant="primary">Open wizard</Button></Link>} /></Card>}

      {tab === "versions" && (
        <Card>
          <CardHeader title="Version history" subtitle="Published versions are immutable. Each has a digest of its spec." />
          <Table>
            <Thead><tr><Th>Version</Th><Th>Digest</Th><Th>Changes</Th><Th>Published</Th><Th></Th></tr></Thead>
            <tbody>
              {p.versions.map((v, i) => {
                const d = diffSpecs(p.versions[i + 1]?.spec, v.spec);
                const parts = [d.added.length && `+${d.added.length} operator${d.added.length > 1 ? "s" : ""}`, d.removed.length && `-${d.removed.length} operator${d.removed.length > 1 ? "s" : ""}`, d.changed.length && `${d.changed.length} changed (${d.changed.map((c) => `${c.node}: ${c.keys.join(", ")}`).slice(0, 2).join("; ")})`, d.edgesAdded && `+${d.edgesAdded} links`, d.edgesRemoved && `-${d.edgesRemoved} links`].filter(Boolean);
                return (
                  <Tr key={v.version}>
                    <Td><button className="font-medium hover:underline" onClick={() => { setView(v.version); setTab("overview"); }}>v{v.version}</button>{i === 0 && <span className="ml-2"><Badge tone="healthy">latest</Badge></span>}</Td>
                    <Td className="font-code text-xs text-text-secondary">{shortDigest(v.digest)}</Td>
                    <Td><div className="text-[13px]">{v.note}</div><div className="text-xs text-text-tertiary">{parts.length ? parts.join(", ") : "Initial version"}</div></Td>
                    <Td className="text-text-secondary text-xs">{fmtDate(v.createdAt)}<div>{v.createdBy}</div></Td>
                    <Td><GuardButton action="pipeline.edit" role={role} onClick={() => setRestore(v.version)}><History size={13} /> Restore to draft</GuardButton></Td>
                  </Tr>
                );
              })}
              {!p.versions.length && <Tr><Td className="text-text-secondary" >No published versions yet.</Td><Td>{""}</Td><Td>{""}</Td><Td>{""}</Td><Td>{""}</Td></Tr>}
            </tbody>
          </Table>
        </Card>
      )}

      {tab === "runs" && (
        <Card>
          {runs.length === 0 ? <EmptyState icon={Play} title="No runs yet" description="Publish a version and run it. Demo runs never touch infrastructure." /> : (
            <Table><Thead><tr><Th>Run</Th><Th>Version</Th><Th>Status</Th><Th>Trigger</Th><Th>Started</Th><Th>Duration</Th></tr></Thead>
              <tbody>{runs.map((r) => (<Tr key={r.id}><Td><Link href={`/mlops/runs/${r.id}`} className="font-code text-xs hover:underline">{r.id}</Link></Td><Td>{versionLabel(r.pipelineVersion)}</Td><Td><RunBadge s={r.status} /></Td><Td className="text-text-secondary">{r.trigger}</Td><Td className="text-text-secondary">{relTime(r.startedAt)}</Td><Td className="tabular-nums text-text-secondary">{r.status === "running" ? "in progress" : fmtDuration(r.durationMs)}</Td></Tr>))}</tbody></Table>
          )}
        </Card>
      )}

      {tab === "review" && shown && <ReviewPanel spec={shown} issues={issues} connections={s.connections} />}

      <Confirm open={del} onClose={() => setDel(false)} danger title={`Delete ${p.name}`} confirmLabel="Delete pipeline" phrase={p.name}
        body={<p>The pipeline and its {p.versions.length} published version{p.versions.length === 1 ? "" : "s"} are removed. Run history is kept. A pipeline with runs in progress cannot be deleted.</p>}
        onConfirm={async () => { const r = await mlops.deletePipeline(p.id, p.name); if (r.ok) { toast("Pipeline deleted"); router.push("/mlops/pipelines"); } else toast(r.error, "error"); setDel(false); }} />
      <Modal open={!!exp} onClose={() => setExp(null)} title={`${p.name} as YAML (${exp?.label ?? ""})`} footer={<><Button onClick={() => setExp(null)}>Close</Button><Button variant="primary" onClick={download}><Download size={14} /> Download</Button></>}>
        <div className="space-y-3"><p className="text-sm text-text-secondary">Node positions are left out, so moving a box on the canvas is not a change. Secrets appear only as references.</p><CodeBlock code={exp?.yaml ?? ""} maxHeight={380} /></div>
      </Modal>
      <Confirm open={discard} onClose={() => setDiscard(false)} danger title="Discard draft" confirmLabel="Discard" body={<p>Unpublished changes are removed. Published versions are not affected.</p>} onConfirm={async () => { await mlops.discardDraft(p.id); setView(null); toast("Draft discarded"); }} />
      <Confirm open={restore !== null} onClose={() => setRestore(null)} title={`Restore v${restore} to a draft`} confirmLabel="Restore" body={<p>Replaces the current draft with version {restore}. You can review and publish it as a new version. History is never rewritten.</p>} onConfirm={async () => { const r = await mlops.restoreVersion(p.id, restore!); r.ok ? (toast("Draft restored"), router.push(`/mlops/pipelines/${p.id}/edit`)) : toast(r.error, "error"); }} />
    </div>
  );
}
