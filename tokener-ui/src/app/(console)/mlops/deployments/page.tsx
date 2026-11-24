"use client";

import Link from "next/link";
import { Plus, Rocket } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { EnvBadge, HealthBadge, relTime } from "@/components/mlops/ui";
import { useMlops } from "@/lib/mlops/store";
import { ENVS, ENV_LABEL, type Env } from "@/lib/mlops/types";

export default function DeploymentsPage() {
  const s = useMlops()!;
  const [env, setEnv] = useState<Env | "all">("all");
  const list = s.deployments.filter((d) => env === "all" || d.env === env);
  return (
    <div className="space-y-5">
      <PageHeader title="Deployments and endpoints" description="What is serving where, in which version, with what resources and traffic. Health comes from observed state, not from the last apply."
        action={<Link href="/mlops/deployments/new"><Button variant="primary"><Plus size={15} /> Deploy a model</Button></Link>} />
      <Select aria-label="Environment" value={env} onChange={(e) => setEnv(e.target.value as Env | "all")} className="w-44"><option value="all">All environments</option>{ENVS.map((e) => <option key={e} value={e}>{ENV_LABEL[e]}</option>)}</Select>
      <Card>
        {list.length === 0 ? <EmptyState icon={Rocket} title="No deployments in this environment" description="Deploy a model version from here, or run a pipeline with a deploy operator." /> : (
          <Table>
            <Thead><tr><Th>Deployment</Th><Th>Environment</Th><Th>Version</Th><Th>Traffic</Th><Th>Replicas</Th><Th>Resources</Th><Th>Health</Th><Th>Updated</Th></tr></Thead>
            <tbody>
              {list.map((d) => (
                <Tr key={d.id}>
                  <Td><Link href={`/mlops/deployments/${d.id}`} className="font-medium hover:underline">{d.name}</Link><div className="text-xs text-text-tertiary">{d.accelerator ? `${d.accelerator.engine}, ${d.accelerator.count} x ${d.accelerator.gpu.replace("NVIDIA ", "")}, CUDA ${d.accelerator.cuda}` : d.runtime}</div></Td>
                  <Td><EnvBadge env={d.env} /></Td>
                  <Td>v{d.version}{d.rollbackAvailable && <span className="ml-1.5 text-[11px] text-text-tertiary">rollback ready</span>}</Td>
                  <Td>{d.traffic.canary ? <Badge tone="info">{d.traffic.canary}% canary v{d.traffic.canaryVersion}</Badge> : <span className="text-text-secondary">100% stable</span>}</Td>
                  <Td className="tabular-nums">{d.replicas.ready}/{d.replicas.desired}<span className="text-text-tertiary text-xs"> ({d.replicas.min} to {d.replicas.max})</span></Td>
                  <Td className="text-text-secondary text-xs">{d.resources.cpu} CPU, {d.resources.memory}{d.resources.gpu !== "0" ? `, ${d.resources.gpu} GPU` : ""}</Td>
                  <Td><HealthBadge h={d.health} /></Td>
                  <Td className="text-text-secondary">{relTime(d.updatedAt)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
