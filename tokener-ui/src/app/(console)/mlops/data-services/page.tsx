"use client";

import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Database } from "lucide-react";
import { NodeIcon } from "@/components/studio/icons";
import { ConnectionWizard } from "@/components/mlops/ConnectionWizard";
import { DemoTag, EnvBadge, GuardButton, HealthBadge, Kpi, Loading, Notice, relTime, useRole } from "@/components/mlops/ui";
import { integrationById } from "@/lib/mlops/catalog";
import { useMlops } from "@/lib/mlops/store";
import { FAMILY_LABEL, type Family } from "@/lib/mlops/types";

const DATA_FAMILIES: Family[] = ["object-store", "relational", "streaming", "vector", "feature-store"];

const WORKFLOWS = [
  { t: "Retrieval pipeline", d: "Documents from an object store are chunked, embedded and written to a vector index. A retrieval service answers queries with a reranker and cites sources.", href: "/mlops/pipelines/new" },
  { t: "Feature to endpoint", d: "Read features from a feature store, join them with an online request and score through a deployed model.", href: "/mlops/pipelines/new" },
  { t: "Event scoring", d: "Consume events from a stream, score each message with an endpoint and publish results to a second topic.", href: "/mlops/pipelines/new" },
];

export default function DataServicesPage() {
  const s = useMlops();
  const role = useRole();
  const [wizard, setWizard] = useState(false);
  const [fam, setFam] = useState<Family | "all">("all");
  if (!s) return <Loading />;
  const conns = s.connections.filter((c) => { const i = integrationById(c.integrationId); return i && DATA_FAMILIES.includes(i.family) && (fam === "all" || i.family === fam); });
  const all = s.connections.filter((c) => { const i = integrationById(c.integrationId); return i && DATA_FAMILIES.includes(i.family); });
  const writable = all.filter((c) => c.permissions === "read-write").length;
  const unhealthy = all.filter((c) => c.health !== "healthy").length;

  return (
    <div className="space-y-5">
      <PageHeader title="Data and AI services" description="Object stores, databases, streams, vector stores and feature stores that pipelines read from and write to. Connections are per environment and read-only by default."
        action={<GuardButton action="connection.create" role={role} variant="primary" onClick={() => setWizard(true)}><Plus size={15} /> Add data connection</GuardButton>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Data connections" value={all.length} sub={`${new Set(all.map((c) => c.env)).size} environments`} />
        <Kpi label="Read-write" value={writable} sub="write operators need these" />
        <Kpi label="Needing attention" value={unhealthy} sub="failed, offline or attention" tone={unhealthy ? "warn" : undefined} />
        <Kpi label="Plaintext secrets stored" value="0" sub="references only" />
      </div>

      <Card>
        <CardHeader title="Connections" subtitle="Filter by service type" />
        <div className="px-4 pt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by service type">
          {(["all", ...DATA_FAMILIES] as const).map((f) => (
            <button key={f} onClick={() => setFam(f)} aria-pressed={fam === f} className={`h-7 px-2.5 rounded-full text-xs border ${fam === f ? "bg-ink text-text-inverse border-ink" : "bg-surface border-border-strong text-text-secondary hover:text-text-primary"}`}>{f === "all" ? "All" : FAMILY_LABEL[f]}</button>
          ))}
        </div>
        <CardBody>
          {conns.length === 0 ? <EmptyState icon={Database} title="No data connections here" description="Connect an object store, database, stream or vector store. Pipelines can then read from it and, with a read-write connection, write to it." action={<GuardButton action="connection.create" role={role} variant="primary" onClick={() => setWizard(true)}>Add data connection</GuardButton>} /> : (
            <Table>
              <Thead><tr><Th>Connection</Th><Th>Type</Th><Th>Environment</Th><Th>Access</Th><Th>Health</Th><Th>Verified</Th></tr></Thead>
              <tbody>
                {conns.map((c) => {
                  const i = integrationById(c.integrationId)!;
                  return (
                    <Tr key={c.id}>
                      <Td><div className="flex items-center gap-2.5"><span className="h-8 w-8 rounded-md bg-surface-muted grid place-items-center shrink-0"><NodeIcon icon={i.icon} size={18} /></span><div><Link href="/mlops/integrations" className="font-medium hover:underline">{c.name}</Link> {c.demo && <DemoTag />}<div className="text-xs text-text-tertiary">{i.name}</div></div></div></Td>
                      <Td className="text-text-secondary">{FAMILY_LABEL[i.family]}</Td>
                      <Td><EnvBadge env={c.env} /></Td>
                      <Td><Badge tone={c.permissions === "read-only" ? "neutral" : "degraded"}>{c.permissions}</Badge></Td>
                      <Td><HealthBadge h={c.health} /></Td>
                      <Td className="text-text-secondary">{relTime(c.lastVerifiedAt)}</Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <div>
        <h2 className="text-sm font-semibold mb-2.5">Common data workflows</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {WORKFLOWS.map((w) => (
            <Link key={w.t} href={w.href} className="group bg-surface border border-border rounded-lg p-4 shadow-card hover:border-border-strong transition-colors">
              <div className="text-sm font-semibold">{w.t}</div><p className="text-[13px] text-text-secondary mt-1">{w.d}</p>
              <span className="text-xs mt-3 inline-flex items-center gap-1 text-text-primary">Start from a template <ArrowRight size={13} /></span>
            </Link>
          ))}
        </div>
      </div>

      <Notice tone="info" title="Supported services and status">
        Each service type has its own catalogue entry with an honest status, version target and prerequisites. See <Link href="/mlops/integrations" className="underline">Integrations and connections</Link>. Connections to services whose connector has not shipped use sample test results and never claim real success.
      </Notice>
      <ConnectionWizard open={wizard} onClose={() => setWizard(false)} />
    </div>
  );
}
