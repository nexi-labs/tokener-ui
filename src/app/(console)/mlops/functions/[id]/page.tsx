"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, SearchX } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs } from "@/components/mlops/ui";
import { FnTile } from "@/components/functions/FnIcon";
import { FnStatusBadge, useFx } from "@/components/functions/ui";
import { ConfigurationTab, DeploymentsTab, EndpointTab, OverviewTab, TriggersTab } from "@/components/functions/detail/tabs-a";
import { CostTab, GovernanceTab, HistoryTab, LogsTab } from "@/components/functions/detail/tabs-b";

const TABS = [
  { id: "overview", label: "Overview" }, { id: "configuration", label: "Configuration" }, { id: "deployments", label: "Deployments and versions" }, { id: "endpoint", label: "Invocation endpoint" },
  { id: "triggers", label: "Triggers" }, { id: "history", label: "Execution history" }, { id: "logs", label: "Logs and errors" }, { id: "cost", label: "AI consumption and cost" }, { id: "governance", label: "Governance and policies" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function FunctionDetail() {
  const { id } = useParams<{ id: string }>();
  const s = useFx();
  const f = s.functions.find((x) => x.id === id);
  const [tab, setTab] = useState<Tab>(() => {
    try { const q = new URLSearchParams(window.location.search).get("tab"); return (TABS.find((t) => t.id === q)?.id ?? "overview") as Tab; } catch { return "overview"; }
  });
  const execs = useMemo(() => s.executions.filter((e) => e.fnId === id), [s, id]);
  const go = (t: Tab) => { setTab(t); try { const u = new URL(window.location.href); u.searchParams.set("tab", t); window.history.replaceState(null, "", u); } catch { /* the tab still changes */ } };

  if (!f) {
    return <Card><EmptyState icon={SearchX} title="Function not found" description="It may have been removed, or it belongs to another tenant." action={<Link href="/mlops/functions/registry" className="text-sm text-accent-700 underline">Back to the registry</Link>} /></Card>;
  }
  const app = s.apps.find((a) => a.id === f.appId); const tenant = s.tenants.find((t) => t.id === f.tenantId);
  return (
    <div className="space-y-5">
      <div>
        <Link href="/mlops/functions/registry" className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary mb-3"><ArrowLeft size={13} /> Registry</Link>
        <div className="flex items-start gap-4">
          <FnTile name={f.kind === "lambda-proxy" ? "connector" : "function"} size={52} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5"><h1 className="text-xl font-semibold tracking-tight font-code">{f.name}</h1><FnStatusBadge s={f.status} />{f.kind === "lambda-proxy" && <Badge tone="info">AWS Lambda</Badge>}<Badge>{f.env}</Badge></div>
            <p className="text-sm text-text-secondary mt-1 max-w-3xl">{f.description}</p>
            <p className="text-xs text-text-tertiary mt-1">{app?.name}, {tenant?.name}, owned by {f.owner}</p>
          </div>
        </div>
      </div>
      <Tabs tabs={TABS.map((t) => ({ id: t.id, label: t.label, count: t.id === "history" ? execs.length : undefined }))} value={tab} onChange={go} label="Function sections" wrap />
      <div role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label}>
        {tab === "overview" && <OverviewTab s={s} f={f} execs={execs} />}
        {tab === "configuration" && <ConfigurationTab s={s} f={f} />}
        {tab === "deployments" && <DeploymentsTab s={s} f={f} />}
        {tab === "endpoint" && <EndpointTab s={s} f={f} />}
        {tab === "triggers" && <TriggersTab s={s} f={f} />}
        {tab === "history" && <HistoryTab s={s} f={f} execs={execs} />}
        {tab === "logs" && <LogsTab s={s} f={f} execs={execs} />}
        {tab === "cost" && <CostTab s={s} f={f} execs={execs} />}
        {tab === "governance" && <GovernanceTab key={f.updatedAt} s={s} f={f} execs={execs} />}
      </div>
    </div>
  );
}
