"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Hammer, KeyRound, Pause, Play } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { AGENT_TONE, MODE_LABEL, CodeBlock, Confirm, DemoTag, EnvBadge, GuardButton, KeyValue, Kpi, Modal, Notice, Tabs, fmtDate, relTime, useRole } from "@/components/mlops/ui";
import { mlops, useMlops, useMlopsStatus } from "@/lib/mlops/store";
import { toast } from "@/lib/mlops/toast";

type Tab = "overview" | "jobs" | "security" | "logs";

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const s = useMlops()!;
  const role = useRole();
  const router = useRouter();
  const a = s.agents.find((x) => x.id === id);
  const [tab, setTab] = useState<Tab>("overview");
  const [revoke, setRevoke] = useState(false);
  const [rotated, setRotated] = useState<string | null>(null);

  if (!a) return <Card><EmptyState icon={Hammer} title="Agent not found" description="It may have been revoked, or the link is wrong." action={<Link href="/mlops/build-agents"><Button>Back to build agents</Button></Link>} /></Card>;

  const jobs = s.runs.flatMap((r) => r.nodes.filter((n) => n.nodeId.startsWith("build-image") && n.status !== "pending" && n.status !== "skipped").map((n) => ({ run: r, node: n }))).filter((_, i) => a.status !== "offline" || i % 2 === 0).slice(0, 8);
  const live = useMlopsStatus().mode === "live";
  const enrolled = !!a.lastHeartbeatAt;
  const daysLeft = (new Date(a.tokenExpiresAt).getTime() - Date.now()) / 86400_000;
  const logs = [
    ["info", `agent ${a.version} started, mode ${a.mode}`], ["info", "connected to control plane over TLS 1.3, certificate verified"], ["info", "credential exchanged. Refresh scheduled in 12h"],
    ["info", `long-poll for jobs, labels ${Object.entries(a.labels).map(([k, v]) => `${k}=${v}`).join(",")}`], ...(a.status === "degraded" ? [["warn", "heartbeat latency 41s, retrying with backoff"]] : []), ...(a.status === "offline" ? [["error", "no heartbeat since last seen. Check the host and its outbound HTTPS"]] : []),
    ["info", `free slots ${a.concurrency.max - a.concurrency.running} of ${a.concurrency.max}`],
  ];

  return (
    <div className="space-y-5">
      <Link href="/mlops/build-agents" className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary"><ArrowLeft size={13} /> Build agents</Link>
      <PageHeader title={a.name} description={`${MODE_LABEL[a.mode]} agent ${a.version}. Owned by ${a.owner}.`}
        action={<div className="flex flex-wrap gap-2 justify-end">
          <GuardButton action="agent.revoke" role={role} onClick={async () => { const r = await mlops.drainAgent(a.id, a.status !== "draining"); r.ok ? toast(a.status === "draining" ? "Accepting jobs again" : "Draining. No new jobs will be assigned.") : toast(r.error, "error"); }} extraDisabled={a.status === "offline" ? "The agent is offline" : undefined}>{a.status === "draining" ? <><Play size={14} /> Resume</> : <><Pause size={14} /> Drain</>}</GuardButton>
          {!a.lastHeartbeatAt && <GuardButton action="agent.enroll" role={role} onClick={async () => { const r = await mlops.reissueAgentEnrollment(a.id); r.ok ? (r.token ? setRotated(r.token) : toast("A new enrollment token was issued")) : toast(r.error, "error"); }}>Reissue enrollment token</GuardButton>}
          {!!a.lastHeartbeatAt && <GuardButton action="agent.enroll" role={role} onClick={async () => { const r = await mlops.rotateAgentToken(a.id); r.ok ? (r.token ? setRotated(r.token) : toast("Rotation requested. The agent swaps its token at the next heartbeat and keeps working.")) : toast(r.error, "error"); }}><KeyRound size={14} /> Rotate token</GuardButton>}
          <GuardButton action="agent.revoke" role={role} onClick={() => setRevoke(true)}>Revoke</GuardButton>
        </div>} />
      <div className="flex flex-wrap items-center gap-2 -mt-3"><Badge tone={AGENT_TONE[a.status]}>{a.status}</Badge><EnvBadge env={a.env} />{a.demo && <DemoTag />}</div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Build slots" value={`${a.concurrency.running}/${a.concurrency.max}`} sub="running / maximum" />
        <Kpi label="Last heartbeat" value={a.lastHeartbeatAt ? relTime(a.lastHeartbeatAt) : "never"} sub={a.lastHeartbeatAt ? fmtDate(a.lastHeartbeatAt) : "waiting for first contact"} tone={a.status === "degraded" ? "warn" : undefined} />
        <Kpi label="Credential" value={!enrolled ? "Not enrolled" : daysLeft > 0 ? `${Math.floor(daysLeft)} d` : "expired"} sub={enrolled ? "until rotation needed" : "waiting for the install command to run"} tone={enrolled && daysLeft < 14 ? "warn" : undefined} />
        <Kpi label="Registered" value={relTime(a.registeredAt)} sub={fmtDate(a.registeredAt)} />
      </div>

      {a.status === "degraded" && <Notice tone="warn" title="Degraded">Heartbeats are arriving late. New jobs prefer healthier agents. Check the host's load and outbound connectivity.</Notice>}
      {a.status === "offline" && <Notice tone="bad" title="Offline">Jobs with matching labels will wait in the queue until an agent is online. Nothing is lost.</Notice>}

      <Tabs value={tab} onChange={setTab} label="Agent sections" tabs={live ? [{ id: "overview", label: "Overview" }, { id: "security", label: "Security" }] : [{ id: "overview", label: "Overview" }, { id: "jobs", label: "Jobs", count: jobs.length }, { id: "security", label: "Security" }, { id: "logs", label: "Agent log" }]} />

      {tab === "overview" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card><CardHeader title="Host" /><div className="p-5"><KeyValue rows={[["Operating system", a.os], ["Architecture", a.arch], ["Agent version", a.version], ["GPU", a.gpu ?? "none reported"], ["Capabilities", <span className="flex flex-wrap gap-1">{a.capabilities.map((c) => <Badge key={c}>{c}</Badge>)}</span>]]} /></div></Card>
          <Card><CardHeader title="Routing labels" subtitle="A Build operator matches on these" /><div className="p-5 flex flex-wrap gap-1.5">{Object.entries(a.labels).map(([k, v]) => <Badge key={k}>{k}={v}</Badge>)}</div></Card>
        </div>
      )}

      {tab === "jobs" && (
        <Card><CardHeader title="Recent build jobs" subtitle="Sample data derived from runs" />
          {jobs.length === 0 ? <div className="p-6 text-sm text-text-secondary">No jobs yet.</div> : (
            <ul className="divide-y divide-border">{jobs.map(({ run, node }) => (
              <li key={run.id + node.nodeId}><Link href={`/mlops/runs/${run.id}`} className="px-5 py-3 flex items-center gap-3 text-[13px] hover:bg-surface-subtle"><Badge tone={node.status === "succeeded" ? "healthy" : node.status === "failed" ? "down" : "info"}>{node.status}</Badge><span className="flex-1 truncate">{run.pipelineName} <span className="text-text-tertiary">{run.id}</span></span><span className="text-xs text-text-tertiary">{relTime(run.startedAt)}</span></Link></li>
            ))}</ul>
          )}</Card>
      )}

      {tab === "security" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card><CardHeader title="Allowlists" subtitle="Anything not listed is refused by the agent itself" /><div className="p-5 space-y-4 text-[13px]">
            <div><div className="font-medium mb-1.5">Registries it may push to</div><ul className="space-y-1 font-code text-xs">{a.registries.map((r) => <li key={r}>{r}</li>)}</ul></div>
            <div><div className="font-medium mb-1.5">Egress</div><ul className="space-y-1 font-code text-xs">{a.egressAllowlist.map((r) => <li key={r}>{r}</li>)}</ul></div></div></Card>
          <Card><CardHeader title="Boundaries" /><ul className="p-5 list-disc pl-9 space-y-1.5 text-[13px] text-text-secondary"><li>No inbound listener and no remote shell</li><li>Runs allowlisted operations as an unprivileged user</li><li>Verifies the signature on every job</li><li>Never installs or changes GPU drivers, firmware or the kernel</li><li>Credentials are short-lived and revocable. Logs are redacted</li></ul></Card>
        </div>
      )}

      {tab === "logs" && (
        <Card><CardHeader title="Agent log" subtitle="Sample data. Real logs are shipped redacted." />
          <div className="p-3 bg-ink-800 rounded-b-lg font-code text-[12px] leading-relaxed overflow-x-auto">{logs.map(([l, m], i) => <div key={i} className="flex gap-3 whitespace-pre"><span className="text-text-tertiary">{new Date(Date.now() - (logs.length - i) * 70000).toLocaleTimeString("en-GB")}</span><span className={l === "error" ? "text-[#FF8A8A]" : l === "warn" ? "text-[#F3C16B]" : "text-[#9FB6B2]"}>{l.toUpperCase().padEnd(5)}</span><span className="text-[#D8E4E2]">{m}</span></div>)}</div></Card>
      )}

      <Modal open={!!rotated} onClose={() => setRotated(null)} title={a.lastHeartbeatAt ? "New agent token" : "New enrollment token"} footer={<Button variant="primary" onClick={() => setRotated(null)}>I have copied it</Button>}>
        <div className="space-y-3"><Notice tone="warn" title="Shown once">{a.lastHeartbeatAt ? "The previous token is revoked immediately. Update the agent's env file and restart it." : "The earlier enrollment token no longer works. It is valid for 24 hours. Run the install command with this one."}</Notice><CodeBlock code={rotated ?? ""} maxHeight={60} /></div>
      </Modal>
      <Confirm open={revoke} onClose={() => setRevoke(false)} danger title="Revoke agent" confirmLabel="Revoke" phrase={a.name}
        body={<p>The agent's credential is revoked and it can no longer pull jobs. Queued jobs wait for another matching agent. Drain first if it is running a job.</p>}
        onConfirm={async () => { const r = await mlops.revokeAgent(a.id); r.ok ? (toast("Agent revoked"), router.push("/mlops/build-agents")) : toast(r.error, "error"); }} />
    </div>
  );
}
