"use client";

import Link from "next/link";
import { ArrowRight, Cable, Hammer, Lock, Plus, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { AgentWizard } from "@/components/mlops/AgentWizard";
import { AGENT_TONE, DemoTag, EnvBadge, GuardButton, Kpi, MODE_LABEL, relTime, useRole } from "@/components/mlops/ui";
import { useMlops } from "@/lib/mlops/store";


export default function BuildAgentsPage() {
  const s = useMlops()!;
  const role = useRole();
  const [open, setOpen] = useState(false);
  const online = s.agents.filter((a) => a.status === "online").length;
  const running = s.agents.reduce((n, a) => n + a.concurrency.running, 0);
  const cap = s.agents.filter((a) => a.status === "online").reduce((n, a) => n + a.concurrency.max, 0);
  const expiring = s.agents.filter((a) => a.tokenExpiresAt && new Date(a.tokenExpiresAt).getTime() - Date.now() < 14 * 86400_000 && a.status !== "offline");

  return (
    <div className="space-y-5">
      <PageHeader title="Build agents" description="Run image builds on infrastructure you own: Linux servers, Kubernetes clusters or Docker hosts. Agents connect out to the control plane and only run operations from a scoped allowlist."
        action={<GuardButton action="agent.enroll" role={role} variant="primary" onClick={() => setOpen(true)}><Plus size={15} /> Enroll agent</GuardButton>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Agents online" value={`${online}/${s.agents.length}`} sub={`${s.agents.filter((a) => a.status === "degraded").length} degraded`} tone={online < s.agents.length ? "warn" : undefined} />
        <Kpi label="Build slots in use" value={`${running}/${cap}`} sub="across online agents" />
        <Kpi label="Tokens expiring soon" value={expiring.length} sub="within 14 days" tone={expiring.length ? "warn" : undefined} />
        <Kpi label="Inbound ports opened" value="0" sub="agents pull, never listen" />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {[
          { icon: Cable, t: "Outbound only", d: "The agent opens a TLS connection to the control plane and long-polls for jobs. No inbound firewall rules, no VPN into your network." },
          { icon: ShieldCheck, t: "Scoped by allowlist", d: "Each agent has an operation allowlist, a registry allowlist and an egress allowlist. Jobs are signed by the control plane and verified by the agent." },
          { icon: Lock, t: "Short-lived credentials", d: "Enrollment tokens are single use and expire in 24 hours. Agent credentials rotate and can be revoked instantly. Secrets are never written to logs." },
        ].map((c) => (
          <div key={c.t} className="bg-surface border border-border rounded-lg p-4 shadow-card"><c.icon size={17} className="text-text-secondary" strokeWidth={1.75} /><div className="text-sm font-semibold mt-2.5">{c.t}</div><p className="text-[13px] text-text-secondary mt-1">{c.d}</p></div>
        ))}
      </div>

      <Card>
        <CardHeader title="Agents" subtitle="Pipelines route build jobs to an online agent whose labels match" />
        {s.agents.length === 0 ? <EmptyState icon={Hammer} title="No build agents yet" description="Enroll one to build images on your own infrastructure. Nothing else is needed to deploy existing images." action={<GuardButton action="agent.enroll" role={role} variant="primary" onClick={() => setOpen(true)}>Enroll agent</GuardButton>} /> : (
          <Table>
            <Thead><tr><Th>Agent</Th><Th>Type</Th><Th>Status</Th><Th>Environment</Th><Th>Platform</Th><Th>Slots</Th><Th>Heartbeat</Th><Th>Token</Th></tr></Thead>
            <tbody>
              {s.agents.map((a) => {
                const left = (new Date(a.tokenExpiresAt).getTime() - Date.now()) / 86400_000;
                return (
                  <Tr key={a.id}>
                    <Td><Link href={`/mlops/build-agents/${a.id}`} className="font-medium hover:underline">{a.name}</Link> {a.demo && <DemoTag />}<div className="text-xs text-text-tertiary">{Object.entries(a.labels).map(([k, v]) => `${k}=${v}`).join(", ")}</div></Td>
                    <Td className="text-text-secondary">{MODE_LABEL[a.mode]}</Td>
                    <Td><Badge tone={AGENT_TONE[a.status]}>{a.status}</Badge></Td>
                    <Td><EnvBadge env={a.env} /></Td>
                    <Td className="text-text-secondary text-xs">{a.os}, {a.arch}{a.gpu && <div>GPU detected</div>}</Td>
                    <Td className="tabular-nums">{a.concurrency.running}/{a.concurrency.max}</Td>
                    <Td className="text-text-secondary">{a.lastHeartbeatAt ? relTime(a.lastHeartbeatAt) : "never"}</Td>
                    <Td className={a.tokenExpiresAt && left < 14 ? "text-[#9A5F05]" : "text-text-secondary"}>{!a.tokenExpiresAt ? "not enrolled" : left > 0 ? `${Math.floor(left)} d left` : "expired"}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card><CardHeader title="How a build runs" /><CardBody>
        <ol className="grid md:grid-cols-5 gap-3 text-[13px]">
          {["A pipeline's Build operator queues a signed job with labels.", "An online agent with matching labels and free slots claims it.", "The agent builds as an unprivileged user and generates an SBOM.", "It pushes to an allowlisted registry and reports the image digest.", "The control plane records provenance and continues the pipeline."].map((t, i) => (
            <li key={i} className="flex gap-2.5"><span className="h-5 w-5 rounded-full bg-emph text-on-emph text-[11px] grid place-items-center shrink-0 tabular-nums">{i + 1}</span><span className="text-text-secondary">{t}</span></li>
          ))}
        </ol>
        <Link href="/mlops/learn/build-agent-linux" className="inline-flex items-center gap-1.5 text-[13px] text-text-primary underline underline-offset-2 mt-4">Tutorial: install a Linux build agent <ArrowRight size={13} /></Link>
      </CardBody></Card>

      <AgentWizard open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
